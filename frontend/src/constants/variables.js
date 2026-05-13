/**
 * Definicja zmiennych makroekonomicznych i sektorowych obsługiwanych przez model.
 * Każda zmienna zawiera meta-dane dotyczące wyświetlania na wykresie.
 */
export const VARIABLES = {
    it_earnings: {
        label: "Indeks Wynagrodzeń ICT",
        unit: "PLN",
        color: "#3b82f6",
        axis: "left"
    },
    ai_investments: {
        label: "Nakłady R&D na AI",
        unit: "mln",
        color: "#8b5cf6",
        axis: "left"
    },
    it_hiring: {
        label: "Zatrudnienie IT (Popyt)",
        unit: "Indeks",
        color: "#10b981",
        axis: "right"
    },
    cpi_inflation: {
        label: "Inflacja Konsumencka (CPI)",
        unit: "%",
        color: "#f59e0b",
        axis: "right"
    }
};

/**
 * Funkcje pomocnicze do pobierania atrybutów zmiennych.
 */
export const getUnit = (variable) => VARIABLES[variable]?.unit || "%";
export const getColor = (variable) => VARIABLES[variable]?.color || "#3b82f6";
export const getLabel = (variable) => VARIABLES[variable]?.label || variable;
