from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List

from app.config import settings
from app.data_loader import CSVDataLoader, DataValidationError

# Inicjalizacja FastAPI ze standardowymi metadanymi OpenAPI
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API zaplecza (backend) obsługujące prognozy modelu wektorowej autoregresji (VAR) i analizy historyczne",
    version="1.0.0"
)

# Konfiguracja CORS: Zezwalaj na lokalne pochodzenia deweloperskie i przygotuj reguły specyficzne dla domen
# W etapie 2 skonfigurujemy ścisłe dopasowanie, aby zezwolić na pochodzenia *.github.io do obsługi statycznej strony.
origins = [
    "http://localhost",
    "http://localhost:5500",
    "http://127.0.0.1",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Otwarta konfiguracja do szybkich testów deweloperskich; zostanie doprecyzowana w etapie 2/5
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
