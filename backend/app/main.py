from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
from pydantic import BaseModel, Field

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

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> Dict[str, Any]:
    """
    Endpoint sprawdzania stanu usługi (health check).
    Wykonuje próbne ładowanie danych, aby zweryfikować wejście/wyjście (I/O) dysku i integralność pliku CSV.
    """
    try:
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        return {
            "status": "healthy",
            "message": "API działa poprawnie, a baza danych CSV została pomyślnie załadowana.",
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
        # Załadowanie i walidacja danych historycznych
        loader = CSVDataLoader(settings.csv_data_path)
        df = loader.load_and_validate()
        
        # Przekazanie danych do silnika prognozującego
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

