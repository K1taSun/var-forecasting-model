export const DEFAULT_HISTORICAL_DATA = [
    { date: "2023-01", it_earnings: 12000, ai_investments: 500, it_hiring: 100, cpi_inflation: 12.5, is_forecast: false },
    { date: "2023-02", it_earnings: 12200, ai_investments: 550, it_hiring: 105, cpi_inflation: 11.2, is_forecast: false },
    { date: "2023-03", it_earnings: 12500, ai_investments: 600, it_hiring: 110, cpi_inflation: 10.1, is_forecast: false },
    { date: "2023-04", it_earnings: 12800, ai_investments: 700, it_hiring: 115, cpi_inflation: 9.8, is_forecast: false },
    { date: "2023-05", it_earnings: 13000, ai_investments: 800, it_hiring: 120, cpi_inflation: 8.5, is_forecast: false },
];

export const DEFAULT_FORECAST_DATA = [
    { date: "2023-06", it_earnings: 13200, ai_investments: 850, it_hiring: 125, cpi_inflation: 7.8, is_forecast: true },
    { date: "2023-07", it_earnings: 13500, ai_investments: 900, it_hiring: 130, cpi_inflation: 7.2, is_forecast: true },
    { date: "2023-08", it_earnings: 13800, ai_investments: 1000, it_hiring: 135, cpi_inflation: 6.5, is_forecast: true },
    { date: "2023-09", it_earnings: 14000, ai_investments: 1100, it_hiring: 140, cpi_inflation: 6.0, is_forecast: true },
];

/**
 * Oblicza symulację lokalną na podstawie zadanych parametrów.
 * Wykorzystywane jako mechanizm fallback w przypadku braku połączenia z API.
 */
export const calculateLocalSimulation = (shocks) => {
    return DEFAULT_FORECAST_DATA.map(d => {
        let newData = { ...d };
        shocks.forEach(s => {
            if (s.variable in newData) {
                // Uproszczony model odpowiedzi na impuls (Impulse Response)
                newData[s.variable] += s.value * (1 - s.delay * 0.1);
            }
        });
        return newData;
    });
};
