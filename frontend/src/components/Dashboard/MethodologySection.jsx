import React, { memo } from 'react';

/**
 * Sekcja informacyjna opisująca zaplecze metodologiczne oraz architekturę systemu.
 */
const MethodologySection = memo(() => (
    <section className="methodology-section glass">
        <div className="method-grid">
            <div className="method-col">
                <h4>Aparatura Statystyczna</h4>
                <p>Rdzeniem obliczeniowym systemu jest model <strong>Vector Autoregression (VAR)</strong>, zoptymalizowany pod kątem szeregów czasowych z kointegracją rzędu 0.</p>
                <ul>
                    <li><strong>AIC Optimiziation:</strong> Automatyczny wybór rzędu opóźnień (Lags) na podstawie kryterium Akaikego.</li>
                    <li><strong>ADF Testing:</strong> Prewencyjna weryfikacja stacjonarności i różnicowanie szeregów 1-go stopnia.</li>
                    <li><strong>Nowa Zmienna (Hiring):</strong> Model uwzględnia popyt na pracę jako endogeniczną odpowiedź na nakłady kapitałowe.</li>
                </ul>
            </div>
            <div className="method-col">
                <h4>Architektura Systemu</h4>
                <p>Projekt zrealizowany w architekturze rozproszonej, zapewniającej wysoką responsywność obliczeniową.</p>
                <ul>
                    <li><strong>Źródła Danych:</strong> Hybrydowe API (Yahoo Finance / FRED proxy) zasilające bazę CSV.</li>
                    <li><strong>Backend:</strong> Python 3.x z silnikiem FastAPI. Przetwarzanie macierzowe (NumPy, Statsmodels).</li>
                    <li><strong>Frontend:</strong> React 18 zasilany przez Vite – renderowanie w czasie rzeczywistym.</li>
                </ul>
            </div>
        </div>
        <div className="method-footer">
            <p>© {new Date().getFullYear()} VAR Systems • Professional Forecasting Intelligence</p>
        </div>
    </section>
));

export default MethodologySection;
