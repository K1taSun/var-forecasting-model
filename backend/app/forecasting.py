import pandas as pd
import numpy as np
from typing import Dict, Any, List, Tuple
from statsmodels.tsa.api import VAR
from app.config import settings


class ForecastingEngine:
    """
    Silnik prognostyczny oparty na modelu Vector Autoregression (VAR).

    Przed dopasowaniem modelu automatycznie wykrywa zmienne doskonale współliniowe
    (np. ai_investments i it_hiring). Zamiast wpychać je wszystkie do VAR-a naraz
    — co kończy się osobliwą macierzą kowariancji i gigantycznymi, niestabilnymi
    współczynnikami — wyodrębniamy jedną z nich jako zależną i odtwarzamy ją
    prostym równaniem liniowym po zakończeniu prognozy.
    """

    # Wspólna pamięć podręczna dla dopasowanego modelu — unikamy wielokrotnego
    # trenowania tego samego VAR-a przy kolejnych zapytaniach
    _cached_results = None
    _cached_fingerprint = None
    _cached_active_cols = None

    def __init__(self, data: pd.DataFrame):
        self.df = data.copy()
        self.numeric_cols = [col for col in settings.REQUIRED_COLUMNS if col != "date"]

        # Rozdzielamy zmienne na aktywne (zmienne w czasie) i stałe (wartość się nie zmienia)
        self.active_cols = []
        self.const_cols = []
        for col in self.numeric_cols:
            if self.df[col].nunique() <= 1:
                self.const_cols.append(col)
            else:
                self.active_cols.append(col)

        # Szukamy par zmiennych niemal idealnie ze sobą skorelowanych (|r| > 0.999).
        # Gdy taką parę znajdziemy, pierwszą traktujemy jako niezależną, drugą
        # jako zależną i wyznaczamy między nimi zależność liniową metodą OLS.
        # Zmienna zależna zostaje wyłączona z modelu VAR.
        self.indep_cols = []
        self.collinear_map: Dict[str, Tuple[str, float, float]] = {}  # zależna -> (niezależna, alpha, beta)

        if self.active_cols:
            corr_matrix = self.df[self.active_cols].corr()
            visited: set = set()

            for col in self.active_cols:
                if col in visited:
                    continue

                # Zbieramy wszystkie kolumny, które są prawie identyczne z bieżącą
                collinear_with_col = [
                    other for other in self.active_cols
                    if other != col
                    and other not in visited
                    and abs(corr_matrix.loc[col, other]) > 0.999
                ]

                self.indep_cols.append(col)
                visited.add(col)

                for dep in collinear_with_col:
                    x = self.df[col].values
                    y = self.df[dep].values
                    # Wyznaczamy współczynniki regresji: dep = alpha * col + beta
                    A = np.vstack([x, np.ones(len(x))]).T
                    alpha, beta = np.linalg.lstsq(A, y, rcond=None)[0]
                    self.collinear_map[dep] = (col, float(alpha), float(beta))
                    visited.add(dep)

    # ------------------------------------------------------------------ #
    #  Metody pomocnicze                                                   #
    # ------------------------------------------------------------------ #

    def _detect_constant_columns(self) -> Tuple[List[str], List[str]]:
        """Zwraca dwie listy: zmienne aktywne i zmienne stałe."""
        return self.active_cols, self.const_cols

    def _get_fitted_model(self, active_cols: List[str]):
        """
        Dopasowuje model VAR wyłącznie na zbiorze zmiennych niezależnych
        (z wyłączeniem tych wykrytych jako współliniowe zależne).

        Dzięki temu macierz kowariancji pozostaje nieosobliwa, a wyestymowane
        współczynniki mają rozsądne wartości — kilka, nie kilkadziesiąt tysięcy.
        """
        if not active_cols:
            return None

        # Tylko zmienne niezależne wchodzą do VAR-a
        fit_cols = [col for col in active_cols if col not in self.collinear_map]
        if not fit_cols:
            return None

        # Odcisk palca danych: sprawdzamy, czy od ostatniego trenowania coś się zmieniło
        fingerprint = (len(self.df), float(self.df[fit_cols].values.sum()))

        if (
            ForecastingEngine._cached_results is not None
            and ForecastingEngine._cached_fingerprint == fingerprint
            and ForecastingEngine._cached_active_cols == fit_cols
        ):
            return ForecastingEngine._cached_results

        df_active = self.df[fit_cols]
        neqs = len(fit_cols)

        # Dobieramy maksymalny rząd opóźnień, tak żeby mieć wystarczająco dużo stopni swobody
        lag_order = 1
        for test_lag in [4, 3, 2, 1]:
            needed_obs = neqs * test_lag + 2
            if len(self.df) - test_lag > needed_obs:
                lag_order = test_lag
                break

        model = VAR(df_active)
        try:
            results = model.fit(maxlags=lag_order, ic="aic")
        except (np.linalg.LinAlgError, ValueError):
            # Gdy wyższy rząd opóźnień psuje macierz — cofamy się do najprostszego lag=1
            if lag_order > 1:
                results = model.fit(maxlags=1, ic="aic")
            else:
                raise

        # Zapisujemy wynik, żeby nie trenować modelu przy każdym kolejnym zapytaniu
        ForecastingEngine._cached_results = results
        ForecastingEngine._cached_fingerprint = fingerprint
        ForecastingEngine._cached_active_cols = fit_cols

        return results

    def _run_univariate_fallback(self, active_cols: List[str], steps: int) -> Dict[str, List[float]]:
        """
        Prosta projekcja liniowa (dryf) jako plan awaryjny.

        Gdy VAR zawodzi — np. dane są zdegenerowane albo mamy zbyt mało obserwacji —
        każda zmienna jest ekstrapolowana osobno na podstawie ostatniego trendu.
        Brzydkie, ale bezpieczne.
        """
        fallback_data: Dict[str, List[float]] = {}
        for col in active_cols:
            series = self.df[col].values
            lookback = min(6, len(series) - 1) if len(series) >= 2 else 0
            drift = (series[-1] - series[-1 - lookback]) / lookback if lookback > 0 else 0.0

            col_forecast: List[float] = []
            current_val = float(series[-1])
            for _ in range(steps):
                current_val += drift
                col_forecast.append(current_val)

            fallback_data[col] = col_forecast
        return fallback_data

    # ------------------------------------------------------------------ #
    #  Główne metody publiczne                                             #
    # ------------------------------------------------------------------ #

    def run_forecast(self, steps: int = 12) -> Dict[str, Any]:
        """
        Generuje prognozę na zadaną liczbę kroków do przodu.

        Przebieg:
          1. Dopasuj VAR na zmiennych niezależnych.
          2. Wygeneruj prognozę dla tych zmiennych.
          3. Odtwórz zmienne zależne za pomocą wyznaczonych wcześniej mapowań liniowych.
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

        forecast_data: Dict[str, Any] = {"date": future_dates_str}

        # Zmienne stałe po prostu powtarzamy
        for col in const_cols:
            forecast_data[col] = [float(self.df[col].iloc[0])] * steps

        diagnostics: Dict[str, Any] = {
            "model_type": "Vector Autoregression (VAR)",
            "total_observations": len(self.df),
            "constant_features": const_cols,
            "active_features": active_cols,
            "aic": None,
            "bic": None,
            "selected_lags": 0
        }

        if active_cols:
            try:
                results = self._get_fitted_model(active_cols)
                if results is None:
                    raise ValueError("Nie udało się dopasować modelu VAR.")

                k_ar = results.k_ar
                fit_cols = [col for col in active_cols if col not in self.collinear_map]
                df_fit = self.df[fit_cols]

                # Prognoza na zmiennych niezależnych
                last_values = df_fit.values[-k_ar:]
                forecast_values = results.forecast(last_values, steps=steps)

                fit_forecasts: Dict[str, List[float]] = {}
                for i, col in enumerate(fit_cols):
                    fit_forecasts[col] = forecast_values[:, i].tolist()
                    forecast_data[col] = fit_forecasts[col]

                # Odtworzenie zmiennych zależnych z mapowania liniowego
                for dep_col, (indep_col, alpha, beta) in self.collinear_map.items():
                    if dep_col in active_cols and indep_col in active_cols:
                        forecast_data[dep_col] = [
                            alpha * val + beta for val in fit_forecasts[indep_col]
                        ]

                diagnostics.update({
                    "aic": float(results.aic),
                    "bic": float(results.bic),
                    "selected_lags": int(k_ar),
                    "coefficients": {
                        col: results.params[col].tolist() for col in fit_cols
                    }
                })

            except Exception as e:
                # Coś poszło nie tak z VAR-em — przełączamy się na bezpieczny fallback,
                # żeby użytkownik dostał jakąkolwiek odpowiedź zamiast błędu 500
                fallback_data = self._run_univariate_fallback(active_cols, steps)
                for col in active_cols:
                    forecast_data[col] = fallback_data[col]

                diagnostics.update({
                    "model_type": "Univariate Drift (tryb awaryjny)",
                    "selected_lags": 0,
                    "notes": f"Wykryto problem z danymi lub kolinearność nie do rozwiązania. Szczegóły: {str(e)}"
                })
        else:
            # Brak aktywnych zmiennych — powtarzamy ostatnie znane wartości
            for col in active_cols:
                forecast_data[col] = [float(self.df[col].iloc[-1])] * steps

        fc_df = pd.DataFrame(forecast_data)
        predictions = fc_df.to_dict(orient="records")

        return {
            "predictions": predictions,
            "diagnostics": diagnostics
        }

    def run_shock_simulation(self, shocks: List[Dict[str, Any]], steps: int = 24) -> List[Dict[str, Any]]:
        """
        Symuluje efekty zewnętrznych impulsów (szoków) na prognozowanych zmiennych.

        Jeśli szok dotyczy zmiennej zależnej (np. it_hiring), automatycznie
        przeliczamy go na odpowiedni szok zmiennej niezależnej (np. ai_investments),
        korzystając z wyznaczonego wcześniej stosunku alpha. Dzięki temu unikamy
        nakładania szoków na zmienną wykluczoną z modelu.
        """
        active_cols, const_cols = self._detect_constant_columns()

        last_date = self.df["date"].max()
        future_dates = pd.date_range(
            start=last_date + pd.DateOffset(months=1),
            periods=steps,
            freq="MS"
        )

        const_vals = {col: float(self.df[col].iloc[0]) for col in const_cols}

        # Przetwarzamy listę szoków i indeksujemy je po kroku czasowym
        # Szoki na zmiennych zależnych są przeliczane na ich niezależne odpowiedniki
        indexed_shocks: Dict[int, Dict[str, float]] = {}
        for shock in shocks:
            s_delay = int(shock["delay"])
            s_var = shock["variable"]
            s_val = float(shock["value"])

            if s_var in self.collinear_map:
                # Szok na zmiennej zależnej zamieniamy na szok na zmiennej niezależnej
                indep_col, alpha, _ = self.collinear_map[s_var]
                s_var = indep_col
                s_val = s_val / alpha

            if 0 <= s_delay < steps:
                indexed_shocks.setdefault(s_delay, {}).setdefault(s_var, 0.0)
                indexed_shocks[s_delay][s_var] += s_val

        simulated_active_values: List[Any] = []
        fit_cols: List[str] = []

        if active_cols:
            fit_cols = [col for col in active_cols if col not in self.collinear_map]
            df_fit = self.df[fit_cols]

            try:
                results = self._get_fitted_model(active_cols)
                if results is None:
                    raise ValueError("Model niedostępny.")

                k_ar = results.k_ar
                history = df_fit.values[-k_ar:].tolist()
                col_to_idx = {col: idx for idx, col in enumerate(fit_cols)}

                # Krok po kroku: prognozujemy, nakładamy szok, przenosimy wynik do historii
                for step_idx in range(steps):
                    lag_input = np.array(history[-k_ar:])
                    pred_step = results.forecast(lag_input, steps=1)[0]

                    for var_name, shock_val in indexed_shocks.get(step_idx, {}).items():
                        if var_name in col_to_idx:
                            pred_step[col_to_idx[var_name]] += shock_val

                    history.append(pred_step.tolist())
                    simulated_active_values.append(pred_step)

            except Exception:
                # VAR nie zadziałał — przechodzimy do prostego modelu dryfu z nałożonymi szokami
                simulated_active_values = [[] for _ in range(steps)]
                for col in fit_cols:
                    series = df_fit[col].values
                    lookback = min(6, len(series) - 1) if len(series) >= 2 else 0
                    drift = (series[-1] - series[-1 - lookback]) / lookback if lookback > 0 else 0.0

                    current_val = float(series[-1])
                    for step_idx in range(steps):
                        pred = current_val + drift + indexed_shocks.get(step_idx, {}).get(col, 0.0)
                        simulated_active_values[step_idx].append(pred)
                        current_val = pred  # każdy krok buduje na poprzednim

        else:
            simulated_active_values = [[0.0] * len(fit_cols) for _ in range(steps)]

        # Składamy finalną listę rekordów — jedna lista słowników na wyjście
        simulated_rows: List[Dict[str, Any]] = []
        for idx, date in enumerate(future_dates):
            row: Dict[str, Any] = {
                "date": date.strftime("%Y-%m-%d"),
                "is_forecast": True
            }

            # Zmienne stałe (plus ewentualny szok na nich)
            for col in const_cols:
                row[col] = const_vals[col] + indexed_shocks.get(idx, {}).get(col, 0.0)

            # Zmienne niezależne z prognozowanych wartości
            fit_vals: Dict[str, float] = {}
            for col_idx, col in enumerate(fit_cols):
                val = float(simulated_active_values[idx][col_idx])
                fit_vals[col] = val
                row[col] = val

            # Zmienne zależne odtworzone z mapowania liniowego
            for dep_col, (indep_col, alpha, beta) in self.collinear_map.items():
                if dep_col in active_cols and indep_col in active_cols:
                    row[dep_col] = alpha * fit_vals[indep_col] + beta

            simulated_rows.append(row)

        return simulated_rows
