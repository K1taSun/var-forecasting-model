from pathlib import Path

class Settings:
    """
    Ustawienia aplikacji i konfiguracja ścieżek.
    Utrzymuje ścieżki niezależne od środowiska, aby zapewnić przenośność między systemem macOS a środowiskiem roboczym Windows.
    """
    # Project Title
    PROJECT_NAME: str = "VAR/VECM Forecasting API"
    
    # Oczekiwany schemat pliku CSV (kolumny i ich kolejność)
    REQUIRED_COLUMNS: list[str] = [
        "date",
        "it_earnings",
        "ai_investments",
        "cpi_inflation",
        "it_hiring"
    ]
    
    # Ścieżka relatywna od głównego katalogu projektu (root) w celu eliminacji hardkodowanych ścieżek bezwzględnych.
    # Zapobiega to wyciekowi struktury katalogów i zapewnia pełną przenośność cross-platform (macOS/Windows/Linux).
    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
    DEFAULT_CSV_PATH: Path = PROJECT_ROOT / "scripts" / "data" / "processed_ci_cd_data.csv"
    
    @property
    def csv_data_path(self) -> Path:
        """
        Dynamicznie rozstrzyga ścieżkę do pliku CSV na podstawie relatywnej struktury projektu.
        Umożliwia nadpisanie ścieżki za pomocą zmiennej środowiskowej VAR_DATA_PATH w celach testowych/QA.
        """
        import os
        env_path = os.environ.get("VAR_DATA_PATH")
        if env_path:
            return Path(env_path)
            
        # Zwracamy w pełni przenośną i niezależną od użytkownika ścieżkę wewnątrz repozytorium
        return self.DEFAULT_CSV_PATH

settings = Settings()

