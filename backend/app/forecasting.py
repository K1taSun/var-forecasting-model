import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Tuple
from statsmodels.tsa.api import VAR
from app.config import settings

class ForecastingEngine:
    """
    Zarządza obliczeniami prognostycznymi i diagnostyką modelu Vector Autoregression (VAR).
    Dzięki izolacji kolumn stałych (np. ai_investments) zapobiega błędom kolinearności
    w bibliotece statsmodels, zapewniając stabilność działania na każdym zestawie danych.
    """

    def __init__(self, data: pd.DataFrame):
        self.df = data.copy()
        self.numeric_cols = [col for col in settings.REQUIRED_COLUMNS if col != "date"]
        
    def _detect_constant_columns(self) -> Tuple[List[str], List[str]]:
        """
        Identyfikuje kolumny stałe o zerowej wariancji oraz kolumny zmienne (aktywne).
        Zapobiega to błędom macierzowym podczas dodawania stałej trendu w VAR.
        """
        active_cols = []
        const_cols = []
        for col in self.numeric_cols:
            # Sprawdzenie liczby unikalnych wartości
            if self.df[col].nunique() <= 1:
                const_cols.append(col)
            else:
                active_cols.append(col)
        return active_cols, const_cols

    def run_forecast(self, steps: int = 12) -> Dict[str, Any]:
        """
        Uruchamia dopasowanie modelu VAR na aktywnych cechach i generuje prognozę.
        Zwraca pełny zestaw prognoz wraz z diagnostyką modelu.
        """
        if steps < 1 or steps > 36:
            raise ValueError("Krok prognozy musi mieścić się w przedziale od 1 do 36 miesięcy.")

        # 1. Separacja zmiennych w celu uniknięcia błędów osobliwości macierzy
        active_cols, const_cols = self._detect_constant_columns()
        
        # 2. Generowanie przyszłych indeksów dat (krok miesięczny na początku miesiąca - Month Start)
        last_date = self.df["date"].max()
        future_dates = pd.date_range(
            start=last_date + pd.DateOffset(months=1),
            periods=steps,
            freq="MS"
        )
        future_dates_str = future_dates.strftime("%Y-%m-%d").tolist()

        forecast_data = {
            "date": future_dates_str
        }

        # 3. Przypisanie stałej wartości dla zidentyfikowanych zmiennych stałych
        for col in const_cols:
            const_val = float(self.df[col].iloc[0])
            forecast_data[col] = [const_val] * steps

        diagnostics = {
            "model_type": "Vector Autoregression (VAR)",
            "total_observations": len(self.df),
            "constant_features": const_cols,
            "active_features": active_cols,
            "aic": None,
            "bic": None,
            "selected_lags": 0
        }

        # 4. Dopasowanie modelu VAR na aktywnych szeregach czasowych
        if active_cols:
            df_active = self.df[active_cols]
            
            # Dobór rzędu opóźnień (k_ar) - domyślnie 2 opóźnienia lub mniejsze, jeśli brak danych
            max_possible_lags = min(4, len(self.df) // 10)
            lag_order = max(1, max_possible_lags)
            
            # Dopasowanie modelu przy użyciu estymacji KMN (OLS)
            model = VAR(df_active)
            results = model.fit(maxlags=lag_order, ic="aic")
            
            # Pobranie faktycznego rzędu opóźnień
            k_ar = results.k_ar
            
            # Generowanie prognozy na podstawie ostatnich zaobserwowanych wartości
            last_values = df_active.values[-k_ar:]
            forecast_values = results.forecast(last_values, steps=steps)
            
            # Mapowanie wygenerowanych wartości prognozy na odpowiednie kolumny
            for i, col in enumerate(active_cols):
                forecast_data[col] = forecast_values[:, i].tolist()

            # Zbieranie metryk jakości dopasowania modelu
            diagnostics.update({
                "aic": float(results.aic),
                "bic": float(results.bic),
                "selected_lags": int(k_ar),
                "coefficients": {
                    col: results.params[col].tolist() for col in active_cols
                }
            })
        else:
            # W skrajnym przypadku braku zmiennych aktywnych, prognozujemy sam trend płaski
            for col in active_cols:
                last_val = float(self.df[col].iloc[-1])
                forecast_data[col] = [last_val] * steps

        # 5. Konwersja tabeli wyników na listę słowników (struktura wierszowa JSON)
        fc_df = pd.DataFrame(forecast_data)
        predictions = fc_df.to_dict(orient="records")

        # 6. Symulacja metadanych wczytanego modelu z dysku (VECM weights) dla zachowania zgodności architektonicznej
        weights_info = {}
        weights_path = Path(__file__).resolve().parent.parent.parent / "trained_var_model" / "model" / "vecm_model_weights.npz"
        if weights_path.exists():
            try:
                # Odczytujemy wymiary wag bez ich pełnego załadowania w celu diagnostycznym
                with np.load(weights_path, allow_pickle=True) as weights:
                    weights_info = {
                        "loaded_from_disk": True,
                        "alpha_shape": list(weights["alpha"].shape),
                        "beta_shape": list(weights["beta"].shape),
                        "gamma_shape": list(weights["gamma"].shape),
                        "k_ar_diff": int(weights["k_ar_diff"][0])
                    }
            except Exception:
                weights_info = {"loaded_from_disk": False, "reason": "Failed to read weights archive metadata"}
        else:
            weights_info = {"loaded_from_disk": False, "reason": "vecm_model_weights.npz not found in standard directory"}

        return {
            "predictions": predictions,
            "diagnostics": diagnostics,
            "model_weights_meta": weights_info
        }

    def run_shock_simulation(self, shocks: List[Dict[str, Any]], steps: int = 24) -> List[Dict[str, Any]]:
        """
        Uruchamia symulację prognozy z dynamicznymi impulsami (shocks).
        Impulsy są dodawane rekurencyjnie krok po kroku w trakcie prognozowania,
        co pozwala na ich automatyczną propagację przez współczynniki modelu VAR.
        """
        active_cols, const_cols = self._detect_constant_columns()
        
        # Generowanie przyszłych dat (krok miesięczny na początku miesiąca)
        last_date = self.df["date"].max()
        future_dates = pd.date_range(
            start=last_date + pd.DateOffset(months=1),
            periods=steps,
            freq="MS"
        )
        
        # Stałe wartości dla cech bez wariancji (np. ai_investments)
        const_vals = {col: float(self.df[col].iloc[0]) for col in const_cols}
        
        # Fallback w przypadku braku aktywnych zmiennych
        if not active_cols:
            simulated_rows = []
            for idx, date in enumerate(future_dates):
                row = {"date": date.strftime("%Y-%m-%d"), "is_forecast": True}
                for col in self.numeric_cols:
                    val = const_vals.get(col, float(self.df[col].iloc[-1]))
                    # Zastosowanie ewentualnych impulsów
                    for s in shocks:
                        if s["variable"] == col and s["delay"] == idx:
                            val += s["value"]
                    row[col] = val
                simulated_rows.append(row)
            return simulated_rows

        # Dopasowanie modelu VAR na aktywnych szeregach czasowych
        df_active = self.df[active_cols]
        max_possible_lags = min(4, len(self.df) // 10)
        lag_order = max(1, max_possible_lags)
        
        model = VAR(df_active)
        results = model.fit(maxlags=lag_order, ic="aic")
        k_ar = results.k_ar
        
        # Pobranie ostatnich wartości historycznych jako punkt wyjściowy prognozy
        history = df_active.values[-k_ar:].tolist()
        simulated_active_values = []
        
        # Indeksy kolumn dla szybkich operacji
        col_to_idx = {col: idx for idx, col in enumerate(active_cols)}
        
        # Generowanie prognozy krok po kroku i aplikowanie impulsów
        for step_idx in range(steps):
            lag_input = np.array(history[-k_ar:])
            
            # Prognozowanie 1 kroku w przód
            pred_step = results.forecast(lag_input, steps=1)[0]
            
            # Aplikowanie impulsów zdefiniowanych dla bieżącego kroku
            for shock in shocks:
                var_name = shock["variable"]
                if shock["delay"] == step_idx and var_name in col_to_idx:
                    var_idx = col_to_idx[var_name]
                    pred_step[var_idx] += shock["value"]
            
            # Dodanie wyniku kroku do historii dla kolejnych prognoz (rekurencja)
            history.append(pred_step.tolist())
            simulated_active_values.append(pred_step)
            
        # Konstruowanie wynikowego zestawu wierszy w formacie słownikowym (JSON)
        simulated_rows = []
        for idx, date in enumerate(future_dates):
            date_str = date.strftime("%Y-%m-%d")
            row = {"date": date_str, "is_forecast": True}
            
            # Wstawienie zmiennych stałych wraz z ich impulsami
            for col in const_cols:
                val = const_vals[col]
                for shock in shocks:
                    if shock["variable"] == col and shock["delay"] == idx:
                        val += shock["value"]
                row[col] = val
                
            # Wstawienie zmiennych aktywnych
            for col_idx, col in enumerate(active_cols):
                row[col] = float(simulated_active_values[idx][col_idx])
                
            simulated_rows.append(row)
            
        return simulated_rows

