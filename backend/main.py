from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import os

# Dodajemy folder główny do PYTHONPATH żeby zadziałał import modeli gdy odpalamy uvicorn z głównego
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.modeling import ModelManager
import pandas as pd
from datetime import timedelta

app = FastAPI(title="VAR Forecasting API - Zaliczenie")

# Konfiguracja CORS (pozwalamy na podpięcie Reacta)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Na potrzeby testu studenckiego wpuszczamy wszystko (w prod użylibyśmy dokładnego adresu frontu)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicjalizacja modelu przy starcie by nie liczyć w locie za każdym razem
model_manager = ModelManager()
# Pro forma próbujemy go ulepić od razu
model_manager.build_var()

class ShockRequest(BaseModel):
    shock_variable: str        # np. 'it_earnings'
    shock_magnitude: float     # np. +500 (PLN) lub -2 (%)

@app.get("/api/historical-data")
def get_historical_data():
    """Zwraca wyczyszczone dane w formie JSON dla wykresu na start"""
    data = model_manager.get_historical_data_for_json()
    if not data:
        raise HTTPException(status_code=404, detail="Brak danych, odpal wpierw skrypt fetchera!")
    return data

def _format_forecast_response(data_raw: list):
    """Pomocnicza funkcja do unifikacji formatu odpowiedzi dla prognoz"""
    if not data_raw or model_manager.df is None or model_manager.df.empty:
        return []
        
    last_date = pd.to_datetime(model_manager.df.index[-1])
    dates = [last_date + pd.DateOffset(months=i) for i in range(1, len(data_raw) + 1)]
    
    response = []
    for i in range(len(data_raw)):
        response.append({
            "date": dates[i].strftime('%Y-%m-%d'),
            "it_earnings": data_raw[i][0],
            "ai_investments": data_raw[i][1],
            "cpi_inflation": data_raw[i][2],
            "is_forecast": True
        })
    return response

@app.get("/api/forecast")
def get_forecast():
    """Zwraca JSON z prognozami z modelu bazowego (VAR) na rok w przód"""
    data_raw = model_manager.get_forecast(steps=12)
    return _format_forecast_response(data_raw)

@app.post("/api/simulate-shock")
def simulate_shock(req: ShockRequest):
    """
    Kluczowy endpoint studencki: bierze suwak z Frontendu 
    i przerzuca przez Impulse Response Function (IRF).
    """
    if req.shock_variable not in model_manager.variables:
        raise HTTPException(status_code=400, detail="Nieznana zmienna.")
        
    # Ponownie zabezpieczamy się przed brakiem danych w runtime
    if model_manager.df is None or model_manager.df.empty:
         raise HTTPException(status_code=404, detail="Brak danych do przeprowadzenia symulacji.")

    data_raw = model_manager.simulate_shock(req.shock_variable, req.shock_magnitude, steps=12)
    return _format_forecast_response(data_raw)

# Info: Pakiety FastAPI, Pydantic itp. są zainstalowane w środowisku Python 3.13. 
# Jeśli wciąż widnieją błędy importu, odśwież interpreter w ustawieniach edytora.
