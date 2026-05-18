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
    
    # Ścieżki absolutne do ładowania danych
    TARGET_MACOS_PATH: Path = Path("/Users/_k1tasun_/Documents/GitHub/var-forecasting-model/skripts/data/processed_ci_cd_data.csv")
    WORKSPACE_WINDOWS_PATH: Path = Path("C:/Users/parko/Documents/GitHub/var-forecasting-model/skripts/data/processed_ci_cd_data.csv")
    
    @property
    def csv_data_path(self) -> Path:
        """
        Dynamicznie rozstrzyga ścieżkę do pliku CSV na podstawie systemu operacyjnego i dostępności pliku.
        Priorytetowo traktuje docelową ścieżkę macOS, przechodząc do środowiska Windows lub lokalnych ścieżek względnych w przypadku jej braku.
        """
        # Najpierw spróbuj ścieżki docelowej dla systemu macOS
        if self.TARGET_MACOS_PATH.exists():
            return self.TARGET_MACOS_PATH
            
        # Spróbuj ścieżki środowiska roboczego programisty w systemie Windows
        if self.WORKSPACE_WINDOWS_PATH.exists():
            return self.WORKSPACE_WINDOWS_PATH
            
        # W ostateczności użyj ścieżki względnej od bieżącego pliku
        current_dir = Path(__file__).resolve().parent
        relative_path = current_dir.parent.parent / "skripts" / "data" / "processed_ci_cd_data.csv"
        if relative_path.exists():
            return relative_path
            
        # Jeśli nie znaleziono żadnych plików, zwróć główną docelową ścieżkę w celu zgłoszenia błędów w dalszych krokach
        return self.TARGET_MACOS_PATH

settings = Settings()
