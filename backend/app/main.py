from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
from pydantic import BaseModel, Field, field_validator

from app.config import settings
from app.data_loader import CSVDataLoader, DataValidationError
from app.forecasting import ForecastingEngine

# Inicjalizacja FastAPI ze standardowymi metadanymi OpenAPI
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API zaplecza (backend) obsługujące prognozy modelu wektorowej autoregresji (VAR) i analizy historyczne",
    version="1.0.0"
)

# Konfiguracja CORS: Umożliwia integrację z GitHub Pages (obsługa dowolnych subdomen *.github.io)
# Używamy allow_origins=["*"] bez allow_credentials=True, co zapewnia bezproblemowe 
# wczytywanie danych z lokalnych plików (origin "null"), localhost oraz produkcyjnych domen github.io.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ForecastRequest(BaseModel):
    """Walidator żądania prognozy. Zabezpiecza przed obciążeniem serwera zbyt dużym horyzontem czasowym."""
    steps: int = Field(
        default=12,
        ge=1,
        le=36,
        description="Horyzont prognozy w miesiącach (akceptowane wartości od 1 do 36)"
    )

class Shock(BaseModel):
    """
    [POPRAWKA BEZPIECZEŃSTWA] Definicja pojedynczego impulsu z walidacją wejścia.
    Zabezpiecza przed overflow numerycznym i uszkodzeniem struktur danych szeregów czasowych.
    """
    variable: str = Field(..., description="Nazwa zmiennej docelowej")
    value: float = Field(..., ge=-100000.0, le=100000.0, description="Amplituda szoku (zabezpieczenie przed overflow)")
    delay: int = Field(..., ge=0, le=35, description="Przesunięcie w czasie t+k (akceptowane wartości od 0 do 35)")

    @field_validator("variable")
    @classmethod
    def validate_variable(cls, v: str) -> str:
        """Weryfikuje, czy wskazana zmienna istnieje w schemacie modelu (wykluczając indeks daty)."""
        allowed = [col for col in settings.REQUIRED_COLUMNS if col != "date"]
        if v not in allowed:
            raise ValueError(f"Niedozwolona zmienna docelowa: '{v}'. Dopuszczalne opcje: {allowed}")
        return v

class ShockSimulationRequest(BaseModel):
    """
    [POPRAWKA BEZPIECZEŃSTWA] Walidator żądania symulacji szoków.
    Ogranicza liczbę impulsów w celu zapobieżenia atakom CPU Denial of Service (DoS).
    """
    shocks: List[Shock]

    @field_validator("shocks")
    @classmethod
    def validate_shocks_count(cls, v: List[Shock]) -> List[Shock]:
        """Ogranicza rozmiar wejściowej tablicy szoków."""
        if len(v) > 50:
            raise ValueError("Przekroczono dopuszczalny limit interwencji w jednym żądaniu (maksymalnie 50).")
        return v

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> Dict[str, Any]:
    """
    Endpoint sprawdzania stanu usługi (health check).
    [POPRAWKA WYDAJNOŚCIOWA] Wykorzystuje mechanizm cache w data_loaderze, 
    unikając kosztownego fizycznego I/O na dysku w celach diagnostycznych.
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        return {
            "status": "healthy",
            "message": "API działa poprawnie, a baza danych CSV została pomyślnie zweryfikowana.",
            "environment_info": {
                "resolved_path": str(settings.csv_data_path),
                "total_rows": len(df),
                "columns_loaded": list(df.columns)
            }
        }
    except FileNotFoundError as fnf:
        return {
            "status": "degraded",
            "message": f"Krytyczny błąd zasobu: {str(fnf)}",
            "environment_info": {
                "resolved_path": str(settings.csv_data_path)
            }
        }
    except DataValidationError as dve:
        return {
            "status": "unhealthy",
            "message": f"Błąd integralności danych: {str(dve)}",
            "environment_info": {
                "resolved_path": str(settings.csv_data_path)
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Nieoczekiwany błąd backendu: {str(e)}"
        }

@app.get("/api/data", response_model=List[Dict[str, Any]])
def get_historical_data() -> List[Dict[str, Any]]:
    """
    Udostępnia rekordy historyczne z pliku CSV w formacie JSON.
    Wykorzystywane przez statyczny frontend do renderowania wykresów historycznych i siatek danych.
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        return loader.get_serializable_data()
    except FileNotFoundError as fnf:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(fnf)
        )
    except DataValidationError as dve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(dve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"
        )

@app.post("/api/forecast", status_code=status.HTTP_200_OK)
def get_model_forecast(request: ForecastRequest = ForecastRequest()) -> Dict[str, Any]:
    """
    Endpoint prognostyczny. Dopasowuje model VAR do danych historycznych
    i generuje prognozy na zadany horyzont czasowy (domyślnie 12 miesięcy).
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        
        # Przekazanie danych do silnika prognozującego (korzysta z cache wewnątrz)
        engine = ForecastingEngine(df)
        results = engine.run_forecast(steps=request.steps)
        
        return results
    except FileNotFoundError as fnf:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(fnf)
        )
    except DataValidationError as dve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(dve)
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Nie udało się wygenerować prognozy. Błąd: {str(e)}"
        )

@app.get("/api/historical-data", response_model=List[Dict[str, Any]])
def get_historical_data_react() -> List[Dict[str, Any]]:
    """
    Zwraca dane historyczne z flagą is_forecast: False.
    Wymagane przez stary/nowy React frontend.
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        data = loader.get_serializable_data()
        # Modyfikacja lokalnej kopii obiektów w celu dodania flagi
        return [{**row, "is_forecast": False} for row in data]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@app.get("/api/forecast", response_model=List[Dict[str, Any]])
def get_forecast_react() -> List[Dict[str, Any]]:
    """
    Zwraca bazową prognozę jako płaską listę słowników z flagą is_forecast: True.
    Wymagane przez stary/nowy React frontend.
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        engine = ForecastingEngine(df)
        results = engine.run_forecast(steps=24)
        
        predictions = results["predictions"]
        return [{**row, "is_forecast": True} for row in predictions]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@app.post("/api/simulate-shock", response_model=List[Dict[str, Any]])
def post_simulate_shock(request: ShockSimulationRequest) -> List[Dict[str, Any]]:
    """
    Uruchamia symulację prognozy z dynamicznymi impulsami (shocks).
    Wykonuje obliczenia rekurencyjne VAR krok po kroku.
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        engine = ForecastingEngine(df)
        
        shocks_list = [
            {"variable": s.variable, "value": s.value, "delay": s.delay}
            for s in request.shocks
        ]
        
        simulated_data = engine.run_shock_simulation(shocks_list, steps=24)
        return simulated_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
