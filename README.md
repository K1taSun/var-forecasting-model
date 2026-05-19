# 📈 VAR Forecasting Model

Profesjonalny system prognozowania wskaźników rynkowych i makroekonomicznych w oparciu o model wektorowej autoregresji (**VAR**). Projekt łączy automatyczne pozyskiwanie danych finansowych z interaktywną wizualizacją prognoz.

> [!NOTE]
> **Status projektu:** W fazie intensywnego rozwoju (Work in Progress 🛠️)

---

## 🏗️ Architektura Systemu

Projekt jest zorganizowany w architekturze modułowej:

*   **`skripts/`** – Moduł pobierania i przetwarzania danych ([data_fetcher.py](file:///Users/_k1tasun_/Documents/GitHub/var-forecasting-model/skripts/data_fetcher.py)). Pobiera dane z Yahoo Finance oraz API Banku Światowego, integruje je oraz oblicza zmienne syntetyczne.
*   **`trained_var_model/`** – Przechowuje wytrenowany model prognozy (plik `trained_var_model.pkl`) oraz notebooki integracyjne z Google Colab.
*   **`frontend/`** – Aplikacja kliencka React + Vite odpowiedzialna za interaktywną prezentację prognoz i analizę historyczną.
*   **`backend/`** – API serwerowe obsługujące serwowanie predykcji modelu (w trakcie implementacji).

---

## 🚀 Szybki start (Pozyskiwanie danych)

1. Zainstaluj wymagane zależności:
   ```bash
   pip install -r requirements.txt
   ```
2. Uruchom skrypt pobierający i agregujący dane:
   ```bash
   python skripts/data_fetcher.py
   ```
   *Wynikowy plik zostanie zapisany w lokalizacji: `skripts/data/processed_ci_cd_data.csv`*