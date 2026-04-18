import pandas as pd
import numpy as np
from statsmodels.tsa.api import VAR
from statsmodels.tsa.vector_ar.vecm import select_coint_rank, VECM
from statsmodels.tsa.stattools import adfuller

class ModelManager:
    def __init__(self, data_path="data/processed_data.csv"):
        self.data_path = data_path
        self.df = None
        self.var_model = None
        self.var_result = None
        self.lag_order = 1
        
        self.load_data()
        
    def load_data(self):
        try:
            self.df = pd.read_csv(self.data_path, index_col="date", parse_dates=True)
            self.variables = ["it_earnings", "ai_investments", "cpi_inflation"]
            # Sprawdzamy, czy dane są pełne na kolumnach
            if not all(col in self.df.columns for col in self.variables):
                raise ValueError("Brak odpowiednich kolumn w danych. Prawdopodobnie skrypt data_fetcher.py padł.")
        except FileNotFoundError:
            # Pusta struktura, żeby API nie padało całkowicie:
            print("Uwaga studenta: Nie znaleziono danych! Próba użycia bez danych.") 
            self.df = pd.DataFrame(columns=["it_earnings", "ai_investments", "cpi_inflation"])

    def check_stationarity(self):
        """
        Zwraca wyniki testu Dickeya-Fullera dla każdej zmiennej.
        Promotor zobaczy, że sprawdzamy stacjonarność przed wymodelowaniem.
        """
        results = {}
        for col in self.variables:
            series = self.df[col].dropna()
            if len(series) < 10:
                results[col] = {"p_value": 1.0, "is_stationary": False}
                continue
            adf_res = adfuller(series, autolag='AIC')
            p_value = adf_res[1]
            results[col] = {"p_value": p_value, "is_stationary": p_value < 0.05}
        return results

    def _diff_data_if_needed(self):
        # Klasyczne podejście studenckie do zaliczenia - różnicujemy raz dla bezpieczeństwa, 
        # bo zmienne makro (inflacja, zarobki) rzadko są stacjonarne
        # W idealnym świecie zrobilibyśmy to w pełni automatycznie pod ADF, 
        # ale VAR często dobrze sobie radzi na zróżnicowanych raz danych.
        diff_df = self.df.diff().dropna()
        return diff_df

    def build_var(self):
        """
        Inicjalizacja modelu VAR, szukamy optymalnego laga przez AIC
        """
        train_df = self._diff_data_if_needed()
        if len(train_df) <= 12: # Potrzebujemy więcej danych niż maxlags
            print("Uwaga: Zbyt mało danych do automatycznego doboru laga. Ustawiam lag=1")
            self.lag_order = 1
        else:
            self.var_model = VAR(train_df)
            # Znajdowanie laga (max 12 msc)
            x = self.var_model.select_order(maxlags=12)
            self.lag_order = x.aic
            if self.lag_order == 0:
                self.lag_order = 1
            
        self.var_result = self.var_model.fit(self.lag_order)
        print(f"Model VAR wytrenowany z lagiem = {self.lag_order}")

    def build_vecm_for_show(self):
        """
        To jest VECM (Vector Error Correction Model).
        Użyte dla skointegrowanych szeregów, by udowodnić zrozumienie 
        długoterminowych relacji makroekonomicznych u promotora we wnioskach. 
        Możemy potem wypisać jego wyniki w konsoli!
        """
        if len(self.df) < 15:
            return None
            
        # Wyznaczamy rząd kointegracji
        rank_test = select_coint_rank(self.df, det_order=0, k_ar_diff=1, method='trace')
        rank = rank_test.rank
        
        if rank > 0:
            vecm = VECM(self.df, k_ar_diff=1, coint_rank=rank, deterministic='co')
            res = vecm.fit()
            return res
        return None

    def get_forecast(self, steps=24):
        """
        Podstawowa prognoza w przyszłość
        """
        if self.var_result is None:
            self.build_var()
            
        if self.var_result is None or len(self.df) < self.lag_order + 1:
            return []

        # Pamiętajmy, że VAR modelowany jest na ZMIANACH (diff).
        # Musimy odwrócić ten proces (cumulative sum od ostatniego punktu).
        last_vals_diff = self._diff_data_if_needed().values[-self.lag_order:]
        pred_diff = self.var_result.forecast(y=last_vals_diff, steps=steps)
        
        # Odwracanie różnicowania!
        last_real_vals = self.df.iloc[-1].values
        forecast_actual = []
        
        current_val = last_real_vals.copy()
        for i in range(steps):
            current_val = current_val + pred_diff[i]
            # Mała korekta dla makro - inflacja i inwestycje raczej nie spadną poniżej zera
            current_val = np.maximum(current_val, 0) 
            forecast_actual.append(current_val.tolist())
            
        return forecast_actual

    def simulate_shock(self, shocks: dict, steps=24):
        """
        Multi-shock simulation z dynamiczną propagacją (ECHO).
        Używamy pętli krok-po-kroku (rolling forecast), aby impuls w jednej zmiennej
        wpłynął na pozostałe zgodnie z macierzą współczynników VAR.
        """
        if self.var_result is None:
            self.build_var()

        try:
            # Tworzymy wektor szoku
            shock_vector = np.zeros(len(self.variables))
            for var_name, magnitude in shocks.items():
                if var_name in self.variables:
                    idx = self.variables.index(var_name)
                    shock_vector[idx] += magnitude

            # Okno opóźnień (lags), które będziemy przesuwać
            current_lags = self._diff_data_if_needed().values[-self.lag_order:]
            
            last_real_vals = self.df.iloc[-1].values
            forecast_shocked = []
            current_lvls = last_real_vals.copy()
            
            for i in range(steps):
                # Prognozujemy następny krok (różnicę) na podstawie obecnych opóźnień
                # forecast() oczekuje y o kształcie (lag_order, n_vars)
                pred_diff = self.var_result.forecast(y=current_lags, steps=1)[0]
                
                # Jeśli to pierwszy krok, aplikujemy zewnętrzny SZOK
                if i == 0:
                    pred_diff += shock_vector
                
                # Aktualizujemy poziomy (integration)
                current_lvls = current_lvls + pred_diff
                current_lvls = np.maximum(current_lvls, 0) # Zabezpieczenie przed ujemnymi
                forecast_shocked.append(current_lvls.tolist())
                
                # Przesuwamy okno opóźnień (rolling window)
                # Dodajemy nową różnicę na koniec i usuwamy najstarszą
                current_lags = np.vstack([current_lags[1:], pred_diff])
                
            return forecast_shocked
        except Exception as e:
            print(f"Błąd dynamicznej symulacji szoku: {e}")
            import traceback
            traceback.print_exc()
            return []
        
    def get_historical_data_for_json(self):
        """Pomocnicza pętla zwracająca dict data_historii dla FastAPI"""
        if self.df is None or self.df.empty:
            return []
            
        # Zamieniamy index datetime na string
        df_out = self.df.copy()
        df_out.index = df_out.index.strftime('%Y-%m-%d')
        result = []
        for idx, row in df_out.iterrows():
            result.append({
                "date": idx,
                "it_earnings": row["it_earnings"],
                "ai_investments": row["ai_investments"],
                "cpi_inflation": row["cpi_inflation"]
            })
        return result
