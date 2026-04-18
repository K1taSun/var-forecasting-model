# VAR Forecasting Simulator

Symulator prognozowania makroekonomicznego oparty na modelach wektorowej autoregresji.

## Technologie
- **Backend**: Python (FastAPI), statsmodels, pandas, numpy.
- **Frontend**: React (Vite), Recharts, Axios.

## Model Analityczny
- **VAR (Vector Autoregression)**: Podstawa prognozowania wzajemnych zależności między wielowymiarowymi szeregami czasowymi.
- **VECM (Vector Error Correction Model)**: Model korekty błędem stosowany przy wykryciu kointegracji do badania relacji długookresowych.
- **Automatyzacja**: Automatyczny dobór rzędu opóźnienia modelu (AIC) oraz testowanie stacjonarności danych (ADF).
- **Symulacje IRF (Impulse Response Function)**: Dynamiczna analiza reakcji systemu na zewnętrzne szoki rynkowe.

## Zmienne Modelu
- `it_earnings`: Zarobki w sektorze IT.
- `ai_investments`: Inwestycje w technologie AI.
- `cpi_inflation`: Wskaźnik inflacji (CPI).
- `it_hiring`: Indeks zatrudnienia w IT.

## Funkcje
- Wizualizacja trendów historycznych.
- Prognozy bazowe na okres 24 miesięcy.
- Interaktywne symulacje wielokrotnych szoków w czasie rzeczywistym.
