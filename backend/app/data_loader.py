import pandas as pd
from pathlib import Path
from typing import Dict, Any, List
from app.config import settings

class DataValidationError(Exception):
    """Niestandardowy wyjątek zgłaszany, gdy walidacja danych CSV nie powiedzie się."""
    pass

class CSVDataLoader:
    """
    Obsługuje bezpieczne ładowanie, parsowanie i walidację zbioru danych szeregów czasowych.
    Waliduje schematy strukturalne i zapewnia prawidłowe typy danych przed dalszym przetwarzaniem.
    [POPRAWKA ARCHITEKTONICZNA] Zawiera pamięć podręczną (cache) opartą na metadanych pliku (mtime, size), 
    co zapobiega narzutom ciągłego I/O na dysku przy każdym zapytaniu HTTP, jednocześnie wspierając hot-reload.
    """
    
    # Zmienne klasowe przechowujące cache w celu unikania ciągłego odczytu I/O i parsowania Pandas
    _cached_df: pd.DataFrame = None
    _cached_serializable: List[Dict[str, Any]] = None
    _cached_mtime: float = None
    _cached_size: int = None
    
    def __init__(self, file_path: Path):
        self.file_path = file_path

    def load_and_validate(self) -> pd.DataFrame:
        """
        Ładuje plik CSV i przeprowadza pełną walidację lub zwraca dane z cache jeśli plik nie uległ zmianie.
        Zwraca zweryfikowany obiekt pandas DataFrame w przypadku sukcesu.
        Zgłasza:
            FileNotFoundError: Jeśli brakuje pliku CSV.
            DataValidationError: Jeśli testy strukturalne lub schematy nie powiodą się.
        """
        # 1. Sprawdzenie istnienia pliku w celu zapobieżenia ukrytym błędom wejścia/wyjścia (I/O)
        if not self.file_path.exists():
            raise FileNotFoundError(
                f"Nie znaleziono pliku danych CSV pod ścieżką: {self.file_path}. "
                "Zweryfikuj istnienie pliku i uprawnienia do jego odczytu."
            )
            
        stat = self.file_path.stat()
        mtime = stat.st_mtime
        size = stat.st_size
        
        # 2. Sprawdzenie rozmiaru pliku w celu upewnienia się, że nie ładujemy pustej bazy danych
        if size == 0:
            raise DataValidationError(f"Plik danych CSV w {self.file_path} jest pusty.")

        # [POPRAWKA WYDAJNOŚCIOWA] Jeśli plik na dysku się nie zmienił, zwracamy natychmiast cached DataFrame.
        # Eliminuje to zbędne operacje I/O oraz parsowanie Pandas na każdym zapytaniu HTTP.
        if (CSVDataLoader._cached_df is not None and 
            CSVDataLoader._cached_mtime == mtime and 
            CSVDataLoader._cached_size == size):
            return CSVDataLoader._cached_df

        try:
            # Załaduj dane za pomocą pandas
            df = pd.read_csv(self.file_path)
        except Exception as e:
            raise DataValidationError(f"Nie udało się sparsować formatu CSV. Błąd: {str(e)}")

        # 3. Walidacja schematu w celu upewnienia się, że docelowe kolumny istnieją
        missing_cols = [col for col in settings.REQUIRED_COLUMNS if col not in df.columns]
        if missing_cols:
            raise DataValidationError(
                f"Niezgodność schematu CSV. Brakujące wymagane kolumny: {missing_cols}. "
                f"Oczekiwane kolumny: {settings.REQUIRED_COLUMNS}"
            )

        # Zmień kolejność kolumn ściśle według schematu docelowego, aby zapewnić spójne indeksy cech w modelach
        df = df[settings.REQUIRED_COLUMNS].copy()

        # 4. Walidacja chronologiczna i parsowanie indeksu dat
        try:
            df = df.assign(date=pd.to_datetime(df['date']))
        except Exception as e:
            raise DataValidationError(f"Nieprawidłowy format daty w kolumnie 'date'. Błąd: {str(e)}")

        # 5. Sprawdzanie wartości pustych (null), aby zapobiec brakującym zmiennym podczas mnożenia macierzy autoregresji
        null_counts = df.isnull().sum()
        columns_with_nulls = null_counts[null_counts > 0]
        if not columns_with_nulls.empty:
            raise DataValidationError(
                f"Wykryto wartości puste w zbiorze danych: {columns_with_nulls.to_dict()}. "
                "Modele VAR wymagają kompletnych macierzy bez brakujących kroków."
            )

        # 6. Walidacja typów danych (type-cast) dla wszystkich zmiennych niezależnych w celu zapewnienia bezpieczeństwa obliczeń matematycznych
        for col in settings.REQUIRED_COLUMNS:
            if col == 'date':
                continue
            if not pd.api.types.is_numeric_dtype(df[col]):
                raise DataValidationError(
                    f"Znaleziono wartości nienumeryczne w kolumnie cech: '{col}'. "
                    "Analiza autoregresyjna VAR wymaga ściśle numerycznych macierzy wejściowych."
                )

        # Zapisujemy do pamięci podręcznej i invalidujemy serializable cache
        CSVDataLoader._cached_df = df
        CSVDataLoader._cached_mtime = mtime
        CSVDataLoader._cached_size = size
        CSVDataLoader._cached_serializable = None

        return df

    def get_serializable_data(self) -> List[Dict[str, Any]]:
        """
        Ładuje plik CSV i przekształca go w listę JSON odpowiednią do serializacji.
        Wykorzystuje cache w celu ominięcia narzutu mapowania struktur Pandas -> Python list.
        """
        df = self.load_and_validate()
        
        # [POPRAWKA WYDAJNOŚCIOWA] Unikamy kosztownej konwersji Pandas na listę słowników przy każdym zapytaniu
        if CSVDataLoader._cached_serializable is not None:
            return CSVDataLoader._cached_serializable
            
        df_json = df.assign(date=df['date'].dt.strftime('%Y-%m-%d'))
        serializable = df_json.to_dict(orient='records')
        CSVDataLoader._cached_serializable = serializable
        
        return serializable

