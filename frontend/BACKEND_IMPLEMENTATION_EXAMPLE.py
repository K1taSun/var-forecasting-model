from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn

app = FastAPI()

# Konfiguracja CORS - wymagana dla komunikacji z aplikacją frontendową
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Shock(BaseModel):
    variable: str
    value: float
    delay: int

class SimulationRequest(BaseModel):
    shocks: List[Shock]

@app.get("/api/historical-data")
async def get_historical():
    """Zwraca dane historyczne wykorzystywane do nauki modelu."""
    return [
        {"date": "2023-01", "it_earnings": 12000, "ai_investments": 500, "it_hiring": 100, "cpi_inflation": 12.5, "is_forecast": False},
        {"date": "2023-02", "it_earnings": 12200, "ai_investments": 550, "it_hiring": 105, "cpi_inflation": 11.2, "is_forecast": False},
    ]

@app.get("/api/forecast")
async def get_forecast():
    """Zwraca bazową prognozę modelu bez uwzględnienia impulsów zewnętrznych."""
    return [
        {"date": "2023-03", "it_earnings": 12500, "ai_investments": 600, "it_hiring": 110, "cpi_inflation": 10.1, "is_forecast": True},
    ]

@app.post("/api/simulate-shock")
async def simulate(req: SimulationRequest):
    """
    Endpoint realizujący przeliczenie modelu na podstawie przesłanego harmonogramu interwencji.
    W tym miejscu powinna znaleźć się integracja z silnikiem statystycznym (np. statsmodels).
    """
    return [
        {"date": "2023-03", "it_earnings": 12600, "ai_investments": 650, "it_hiring": 112, "cpi_inflation": 10.2, "is_forecast": True},
    ]

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
