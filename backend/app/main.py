from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
from pydantic import BaseModel, Field, field_validator

from app.config import settings
from app.data_loader import CSVDataLoader, DataValidationError
from app.forecasting import ForecastingEngine


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API obsługujące prognozy modelu VAR i analizy historyczne",
    version="1.0.0"
)

# CORS otwarty dla wszystkich originów — wymagane dla statycznego frontendu
# na GitHub Pages i wczytywania pliku lokalnie (origin "null")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ForecastRequest(BaseModel):
    """Parametry żądania prognozy. Horyzont ograniczony do 36 miesięcy."""
    steps: int = Field(
        default=12,
        ge=1,
        le=36,
        description="Horyzont prognozy w miesiącach (1–36)"
    )


class Shock(BaseModel):
    """Pojedynczy impuls cenowy/rynkowy nakładany na wybraną zmienną w zadanym kroku czasowym."""
    variable: str = Field(..., description="Nazwa zmiennej docelowej")
    value: float = Field(..., ge=-100000.0, le=100000.0, description="Amplituda szoku")
    delay: int = Field(..., ge=0, le=35, description="Przesunięcie w czasie t+k (0–35)")

    @field_validator("variable")
    @classmethod
    def validate_variable(cls, v: str) -> str:
        """Sprawdza, czy wskazana zmienna należy do schematu modelu."""
        allowed = [col for col in settings.REQUIRED_COLUMNS if col != "date"]
        if v not in allowed:
            raise ValueError(f"Niedozwolona zmienna: '{v}'. Dostępne: {allowed}")
        return v


class ShockSimulationRequest(BaseModel):
    """Zestaw impulsów przekazywanych do symulacji. Limit 50 szoków na zapytanie."""
    shocks: List[Shock]

    @field_validator("shocks")
    @classmethod
    def validate_shocks_count(cls, v: List[Shock]) -> List[Shock]:
        if len(v) > 50:
            raise ValueError("Maksymalna liczba szoków w jednym zapytaniu wynosi 50.")
        return v


# ------------------------------------------------------------------ #
#  Endpointy                                                           #
# ------------------------------------------------------------------ #

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> Dict[str, Any]:
    """Stan serwisu — sprawdza czy dane CSV są dostępne i poprawne."""
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        return {
            "status": "healthy",
            "message": "API działa poprawnie, dane CSV zweryfikowane.",
            "environment_info": {
                "resolved_path": str(settings.csv_data_path),
                "total_rows": len(df),
                "columns_loaded": list(df.columns)
            }
        }
    except FileNotFoundError as fnf:
        return {
            "status": "degraded",
            "message": f"Brak pliku danych: {str(fnf)}",
            "environment_info": {"resolved_path": str(settings.csv_data_path)}
        }
    except DataValidationError as dve:
        return {
            "status": "unhealthy",
            "message": f"Błąd integralności danych: {str(dve)}",
            "environment_info": {"resolved_path": str(settings.csv_data_path)}
        }
    except Exception as e:
        return {"status": "error", "message": f"Nieoczekiwany błąd: {str(e)}"}


@app.get("/api/data", response_model=List[Dict[str, Any]])
def get_historical_data() -> List[Dict[str, Any]]:
    """Dane historyczne z pliku CSV w formacie JSON. Używane przez frontend do renderowania wykresów."""
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        return loader.get_serializable_data()
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(fnf))
    except DataValidationError as dve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(dve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Nieoczekiwany błąd serwera: {str(e)}"
        )


@app.get("/api/historical-data", response_model=List[Dict[str, Any]])
def get_historical_data_react() -> List[Dict[str, Any]]:
    """Dane historyczne z flagą is_forecast: False — wymagane przez frontend React."""
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        data = loader.get_serializable_data()
        return [{**row, "is_forecast": False} for row in data]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/api/forecast", status_code=status.HTTP_200_OK)
def get_model_forecast(request: ForecastRequest = ForecastRequest()) -> Dict[str, Any]:
    """
    Endpoint prognostyczny. Dopasowuje model VAR do danych historycznych
    i generuje prognozę na zadany horyzont (domyślnie 12 miesięcy).
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        engine = ForecastingEngine(df)
        return engine.run_forecast(steps=request.steps)
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(fnf))
    except DataValidationError as dve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(dve))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Nie udało się wygenerować prognozy: {str(e)}"
        )


@app.get("/api/forecast", response_model=List[Dict[str, Any]])
def get_forecast_react() -> List[Dict[str, Any]]:
    """Bazowa prognoza jako płaska lista z flagą is_forecast: True — wymagana przez frontend React."""
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        engine = ForecastingEngine(df)
        results = engine.run_forecast(steps=24)
        return [{**row, "is_forecast": True} for row in results["predictions"]]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/api/simulate-shock", response_model=List[Dict[str, Any]])
def post_simulate_shock(request: ShockSimulationRequest) -> List[Dict[str, Any]]:
    """Symulacja prognozy z dynamicznymi impulsami. Rekurencyjna prognoza VAR krok po kroku."""
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        engine = ForecastingEngine(df)

        shocks_list = [
            {"variable": s.variable, "value": s.value, "delay": s.delay}
            for s in request.shocks
        ]

        return engine.run_shock_simulation(shocks_list, steps=24)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
