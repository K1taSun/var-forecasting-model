import os
import pandas as pd
import numpy as np
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI(title="VAR Forecasting API")

# Setup CORS - konfiguracja pod GitHub Pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://*.github.io", "http://localhost:8000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ścieżki do plików
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
CSV_FILE_PATH = os.path.join(BASE_DIR, "skripts", "data", "processed_ci_cd_data.csv")
MODEL_DIR = os.path.join(BASE_DIR, "trained_var_model", "model")

# Zmienne globalne na model i dane
app.state.df = None
app.state.model_weights = None
app.state.scaler = None
app.state.log_transform_meta = None

class PredictRequest(BaseModel):
    steps: int = 12

class PredictResponse(BaseModel):
    forecast: List[Dict[str, Any]]

def load_and_validate_data() -> pd.DataFrame:
    """Wczytuje plik CSV i przeprowadza podstawową walidację."""
    if not os.path.exists(CSV_FILE_PATH):
        raise FileNotFoundError(f"Brak pliku z danymi: {CSV_FILE_PATH}")
    try:
        df = pd.read_csv(CSV_FILE_PATH)
        if df.empty:
            raise ValueError("Plik CSV jest pusty.")
        if 'Date' in df.columns:
            df['Date'] = pd.to_datetime(df['Date'])
            df.set_index('Date', inplace=True)
        return df
    except Exception as e:
        raise ValueError(f"Błąd wczytywania danych: {str(e)}")

def load_var_model():
    """Wczytuje artefakty modelu z katalogu."""
    weights_path = os.path.join(MODEL_DIR, "vecm_model_weights.npz")
    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")
    meta_path = os.path.join(MODEL_DIR, "log_transform_meta.joblib")
    
    if not all(os.path.exists(p) for p in [weights_path, scaler_path, meta_path]):
        raise FileNotFoundError("Nie znaleziono wszystkich plików modelu w katalogu.")
        
    try:
        app.state.model_weights = np.load(weights_path)
        app.state.scaler = joblib.load(scaler_path)
        app.state.log_transform_meta = joblib.load(meta_path)
    except Exception as e:
        raise ValueError(f"Błąd podczas wczytywania modelu: {str(e)}")

@app.on_event("startup")
async def startup_event():
    """Inicjalizacja aplikacji - ładowanie danych i modelu."""
    try:
        app.state.df = load_and_validate_data()
        load_var_model()
        print("Pomyślnie załadowano dane wejściowe i model VAR.")
    except Exception as e:
        print(f"Błąd podczas startu: {str(e)}")

@app.get("/api/health")
async def health_check():
    """Endpoint statusu API."""
    return {
        "status": "ok",
        "model_loaded": app.state.model_weights is not None,
        "data_loaded": app.state.df is not None
    }

@app.post("/api/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    """
    Zwraca prognozę na zadaną liczbę kroków (miesięcy).
    Oczekuje załadowanego modelu VAR (VECM).
    """
    if app.state.model_weights is None or app.state.df is None:
        raise HTTPException(status_code=500, detail="Model lub dane nie są gotowe.")
        
    steps = request.steps
    
    # Implementacja placeholder dla logiki predykcyjnej 
    # (ze względu na niestandardowy zapis numpy).
    # W rzeczywistym przypadku tutaj użylibyśmy wag z npz oraz scalera do inwersji predykcji.
    
    # Symulacja wyników na podstawie ostatnich wartości (naiwna implementacja dla struktury):
    try:
        last_date = app.state.df.index[-1]
        columns = app.state.df.columns
        last_values = app.state.df.iloc[-1].to_dict()
        
        forecast = []
        # Generowanie przewidywań - do podmiany na rzeczywistą logikę algorytmu (wektoryzacja)
        for i in range(1, steps + 1):
            next_date = last_date + pd.DateOffset(months=i)
            # Przykład symulacji - modyfikacja o losowy czynnik dla demonstracji struktury
            step_pred = {"Date": next_date.strftime("%Y-%m-%d")}
            for col in columns:
                step_pred[col] = float(last_values[col]) * (1.0 + np.random.normal(0, 0.01))
            forecast.append(step_pred)
            
        return PredictResponse(forecast=forecast)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd predykcji: {str(e)}")
