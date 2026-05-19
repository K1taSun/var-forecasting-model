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
    [POPRAWKA ARCHITEKTONICZNA] Zawiera pamięć podręczną dopasowanego modelu (fitted model cache),
    dynamiczne bezpieczeństwo stopni swobody dla lagów oraz fail-safe univariate drift fallback
    dla odporności systemu na LinAlgError.
    """

    # Klasowe zmienne pamięci podręcznej (KISS model cache) w celu unikania ponownej estymacji OLS
    _cached_results = None
    _cached_fingerprint = None
    _cached_active_cols = None

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
            if self.df[col].nunique() <= 1:
                const_cols.append(col)
            else:
                active_cols.append(col)
        return active_cols, const_cols

    def _get_fitted_model(self, active_cols: List[str]):
        """
        [POPRAWKA ARCHITEKTONICZNA] Zwraca dopasowany model VAR z cache lub buduje go na nowo.
        Zawiera dynamiczną redukcję lagów, zabezpieczając przed stopniami swobody (LinAlgError).
        """
        if not active_cols:
            return None
            
        # Sygnatura danych w celu walidacji cache (rozmiar + suma wartości)
        fingerprint = (len(self.df), float(self.df[active_cols].values.sum()))
        
        if (ForecastingEngine._cached_results is not None and 
            ForecastingEngine._cached_fingerprint == fingerprint and 
            ForecastingEngine._cached_active_cols == active_cols):
            return ForecastingEngine._cached_results
            
        df_active = self.df[active_cols]
        neqs = len(active_cols)
        
        # Dynamiczny dobór lagów w zależności od liczby obserwacji
        lag_order = 1
        for test_lag in [4, 3, 2, 1]:
            # Wymagane obserwacje > liczba parametrów na równanie (neqs * lag + 1) + bufor bezpieczeństwa
            needed_obs = neqs * test_lag + 2
            if len(self.df) - test_lag > needed_obs:
                lag_order = test_lag
                break
                
        model = VAR(df_active)
        try:
            results = model.fit(maxlags=lag_order, ic="aic")
        except (np.linalg.LinAlgError, ValueError) as e:
            # W przypadku awarii algebraicznej na wyższych lagach próbujemy ultra-stabilnego lag=1
            if lag_order > 1:
                results = model.fit(maxlags=1, ic="aic")
            else:
                raise e # Przekazanie do nadrzędnego try-catch w celu aktywacji univariate fallbacku
                
        # Zapis do pamięci podręcznej
        ForecastingEngine._cached_results = results
        ForecastingEngine._cached_fingerprint = fingerprint
        ForecastingEngine._cached_active_cols = active_cols
        
        return results

    def _run_univariate_fallback(self, active_cols: List[str], steps: int) -> Dict[str, List[float]]:
        """
        [POPRAWKA ODPORNOŚCI] Uruchamia niezawodny model dryfu jednowymiarowego (univariate drift).
        Stosowany jako ostateczna linia obrony przy błędach macierzowych (kolinearność zmiennych).
        """
        fallback_data = {}
        for col in active_cols:
            series = self.df[col].values
            if len(series) >= 2:
                lookback = min(6, len(series) - 1)
                drift = (series[-1] - series[-1 - lookback]) / lookback
            else:
                drift = 0.0
                
            col_forecast = []
            current_val = float(series[-1])
            for _ in range(steps):
                current_val += drift
                col_forecast.append(current_val)
            fallback_data[col] = col_forecast
        return fallback_data

    def run_forecast(self, steps: int = 12) -> Dict[str, Any]:
        """
        Uruchamia dopasowanie modelu VAR na aktywnych cechach i generuje prognozę.
        Zwraca pełny zestaw prognoz wraz z diagnostyką modelu.
        """
        if steps < 1 or steps > 36:
            raise ValueError("Krok prognozy musi mieścić się w przedziale od 1 do 36 miesięcy.")

        active_cols, const_cols = self._detect_constant_columns()
        
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

        # Dopasowanie i prognoza aktywnych cech
        if active_cols:
            try:
                results = self._get_fitted_model(active_cols)
                if results is None:
                    raise ValueError("Nie udało się dopasować modelu VAR.")
                    
                k_ar = results.k_ar
                df_active = self.df[active_cols]
                
                # Generowanie prognozy
                last_values = df_active.values[-k_ar:]
                forecast_values = results.forecast(last_values, steps=steps)
                
                for i, col in enumerate(active_cols):
                    forecast_data[col] = forecast_values[:, i].tolist()

                diagnostics.update({
                    "aic": float(results.aic),
                    "bic": float(results.bic),
                    "selected_lags": int(k_ar),
                    "coefficients": {
                        col: results.params[col].tolist() for col in active_cols
                    }
                })
            except Exception as e:
                # [POPRAWKA ODPORNOŚCI] Łagodne przejście do fallbacku zamiast rzucenia HTTP 500
                fallback_data = self._run_univariate_fallback(active_cols, steps)
                for col in active_cols:
                    forecast_data[col] = fallback_data[col]
                
                diagnostics.update({
                    "model_type": "Univariate Drift (Fail-Safe Fallback)",
                    "selected_lags": 0,
                    "notes": f"Wykryto kolinearność lub niewystarczającą liczbę stopni swobody. Błąd: {str(e)}"
                })
        else:
            for col in active_cols:
                last_val = float(self.df[col].iloc[-1])
                forecast_data[col] = [last_val] * steps

        fc_df = pd.DataFrame(forecast_data)
        predictions = fc_df.to_dict(orient="records")

        # Symulacja metadanych wczytanego modelu z dysku (VECM weights) dla zachowania wstecznej zgodności
        weights_info = {}
        weights_path = Path(__file__).resolve().parent.parent.parent / "trained_var_model" / "model" / "vecm_model_weights.npz"
        if weights_path.exists():
            try:
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
        [POPRAWKA WYDAJNOŚCIOWA] Szoki są indeksowane w słowniku O(1), eliminując złożoność czasową O(N*M).
        """
        active_cols, const_cols = self._detect_constant_columns()
        
        last_date = self.df["date"].max()
        future_dates = pd.date_range(
            start=last_date + pd.DateOffset(months=1),
            periods=steps,
            freq="MS"
        )
        
        const_vals = {col: float(self.df[col].iloc[0]) for col in const_cols}
        
        # [POPRAWKA WYDAJNOŚCIOWA] Agregacja i indeksowanie szoków O(1) zamiast przeszukiwania list w pętli
        indexed_shocks = {}
        for shock in shocks:
            s_delay = int(shock["delay"])
            s_var = shock["variable"]
            s_val = float(shock["value"])
            if 0 <= s_delay < steps:
                indexed_shocks.setdefault(s_delay, {}).setdefault(s_var, 0.0)
                indexed_shocks[s_delay][s_var] += s_val

        simulated_active_values = []
        is_fallback_used = False
        
        if active_cols:
            df_active = self.df[active_cols]
            try:
                results = self._get_fitted_model(active_cols)
                if results is None:
                    raise ValueError("Model niedostępny.")
                    
                k_ar = results.k_ar
                history = df_active.values[-k_ar:].tolist()
                col_to_idx = {col: idx for idx, col in enumerate(active_cols)}
                
                # Rekurencyjna prognoza krok po kroku z aplikacją impulsów
                for step_idx in range(steps):
                    lag_input = np.array(history[-k_ar:])
                    pred_step = results.forecast(lag_input, steps=1)[0]
                    
                    # Nakładanie szoków na zmienne aktywne
                    step_shocks = indexed_shocks.get(step_idx, {})
                    for var_name, shock_val in step_shocks.items():
                        if var_name in col_to_idx:
                            var_idx = col_to_idx[var_name]
                            pred_step[var_idx] += shock_val
                            
                    history.append(pred_step.tolist())
                    simulated_active_values.append(pred_step)
            except Exception:
                # [POPRAWKA ODPORNOŚCI] Fail-safe fallback przy symulacji szoków
                is_fallback_used = True
                simulated_active_values = [[] for _ in range(steps)]
                for col in active_cols:
                    series = df_active[col].values
                    lookback = min(6, len(series) - 1) if len(series) >= 2 else 0
                    drift = (series[-1] - series[-1 - lookback]) / lookback if lookback > 0 else 0.0
                    
                    current_val = float(series[-1])
                    for step_idx in range(steps):
                        pred = current_val + drift
                        shock_val = indexed_shocks.get(step_idx, {}).get(col, 0.0)
                        pred += shock_val
                        simulated_active_values[step_idx].append(pred)
                        current_val = pred # propagacja rekurencyjna w kolejnych krokach
        else:
            simulated_active_values = [[0.0] * len(active_cols) for _ in range(steps)]

        # Konstruowanie wynikowego zestawu wierszy
        simulated_rows = []
        for idx, date in enumerate(future_dates):
            date_str = date.strftime("%Y-%m-%d")
            row = {"date": date_str, "is_forecast": True}
            
            # Wstawienie zmiennych stałych wraz z ich impulsami (z indeksu O(1))
            for col in const_cols:
                val = const_vals[col]
                shock_val = indexed_shocks.get(idx, {}).get(col, 0.0)
                row[col] = val + shock_val
                
            # Wstawienie zmiennych aktywnych
            for col_idx, col in enumerate(active_cols):
                row[col] = float(simulated_active_values[idx][col_idx])
                
            simulated_rows.append(row)
            
        return simulated_rows
