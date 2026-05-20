import pandas as pd
from pathlib import Path
from typing import Dict, Any, List
from app.config import settings


class DataValidationError(Exception):
    """Wyjątek rzucany, gdy plik CSV nie przejdzie walidacji struktury lub zawartości."""
    pass


class CSVDataLoader:
    """
    Odpowiada za bezpieczne wczytywanie, parsowanie i walidację danych szeregów czasowych.

    Żeby nie czytać pliku z dysku przy każdym zapytaniu HTTP, przechowujemy
    wczytany DataFrame w pamięci podręcznej klasy. Cache jest unieważniany
    automatycznie, gdy plik na dysku się zmieni (porównujemy mtime i rozmiar).
    """

    _cached_df: pd.DataFrame = None
    _cached_serializable: List[Dict[str, Any]] = None
    _cached_mtime: float = None
    _cached_size: int = None

    def __init__(self, file_path: Path):
        self.file_path = file_path

    def load_and_validate(self) -> pd.DataFrame:
        """
        Wczytuje plik CSV i przeprowadza pełną walidację, lub zwraca dane
        z pamięci podręcznej jeśli plik na dysku nie uległ zmianie.

        Zgłasza:
            FileNotFoundError: gdy plik CSV nie istnieje pod oczekiwaną ścieżką.
            DataValidationError: gdy struktura lub zawartość danych jest niepoprawna.
        """
        if not self.file_path.exists():
            raise FileNotFoundError(
                f"Nie znaleziono pliku danych CSV pod ścieżką: {self.file_path}. "
                "Sprawdź czy plik istnieje i czy aplikacja ma prawo odczytu."
            )

        stat = self.file_path.stat()
        mtime = stat.st_mtime
        size = stat.st_size

        if size == 0:
            raise DataValidationError(f"Plik danych CSV w {self.file_path} jest pusty.")

        # Jeśli plik na dysku się nie zmienił, oddajemy zapisany DataFrame bez żadnego I/O
        if (
            CSVDataLoader._cached_df is not None
            and CSVDataLoader._cached_mtime == mtime
            and CSVDataLoader._cached_size == size
        ):
            return CSVDataLoader._cached_df

        try:
            df = pd.read_csv(self.file_path)
        except Exception as e:
            raise DataValidationError(f"Nie udało się sparsować pliku CSV. Szczegóły: {str(e)}")

        # Sprawdzamy czy wszystkie wymagane kolumny są obecne
        missing_cols = [col for col in settings.REQUIRED_COLUMNS if col not in df.columns]
        if missing_cols:
            raise DataValidationError(
                f"Niezgodność schematu CSV. Brakujące kolumny: {missing_cols}. "
                f"Oczekiwane: {settings.REQUIRED_COLUMNS}"
            )

        # Ustawiamy kolejność kolumn zgodnie ze schematem — modele VAR są wrażliwe na kolejność
        df = df[settings.REQUIRED_COLUMNS].copy()

        # Parsujemy daty
        try:
            df = df.assign(date=pd.to_datetime(df["date"]))
        except Exception as e:
            raise DataValidationError(f"Nieprawidłowy format daty w kolumnie 'date'. Szczegóły: {str(e)}")

        # VAR nie toleruje pustych komórek — sprawdzamy każdą kolumnę
        null_counts = df.isnull().sum()
        columns_with_nulls = null_counts[null_counts > 0]
        if not columns_with_nulls.empty:
            raise DataValidationError(
                f"Znaleziono puste wartości w zbiorze danych: {columns_with_nulls.to_dict()}. "
                "Model VAR wymaga kompletnych danych bez luk."
            )

        # Upewniamy się, że wszystkie kolumny poza datą są liczbowe
        for col in settings.REQUIRED_COLUMNS:
            if col == "date":
                continue
            if not pd.api.types.is_numeric_dtype(df[col]):
                raise DataValidationError(
                    f"Kolumna '{col}' zawiera wartości nienumeryczne. "
                    "Model VAR wymaga wyłącznie danych liczbowych."
                )

        # Zapisujemy do cache i resetujemy cache serializowalny (dane się zmieniły)
        CSVDataLoader._cached_df = df
        CSVDataLoader._cached_mtime = mtime
        CSVDataLoader._cached_size = size
        CSVDataLoader._cached_serializable = None

        return df

    def get_serializable_data(self) -> List[Dict[str, Any]]:
        """
        Wczytuje dane i zwraca je jako listę słowników gotową do serializacji JSON.
        Wynik jest buforowany — konwersja Pandas na listę słowników kosztuje trochę czasu,
        więc robimy ją tylko raz między zmianami pliku.
        """
        df = self.load_and_validate()

        if CSVDataLoader._cached_serializable is not None:
            return CSVDataLoader._cached_serializable

        df_json = df.assign(date=df["date"].dt.strftime("%Y-%m-%d"))
        serializable = df_json.to_dict(orient="records")
        CSVDataLoader._cached_serializable = serializable

        return serializable
