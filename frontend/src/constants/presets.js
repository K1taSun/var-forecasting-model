/**
 * Gotowe scenariusze testowe (presety) umożliwiające szybką demonstrację
 * dynamiki modelu VAR w odpowiedzi na predefiniowane zestawy impulsów.
 */
export const PRESETS = {
    ai_boom: {
        name: "🚀 Boom AI",
        desc: "Masywne inwestycje R&D, skok płac i gwałtowny wzrost zatrudnienia.",
        shocks: [
            { id: 1, variable: 'ai_investments', value: 3000, delay: 0 },
            { id: 2, variable: 'it_hiring', value: 25, delay: 3 },
            { id: 3, variable: 'it_earnings', value: 2500, delay: 6 }
        ]
    },
    stagflation: {
        name: "📉 Szok Stagflacyjny",
        desc: "Nagły wzrost inflacji przy jednoczesnym zamrożeniu rekrutacji i płac.",
        shocks: [
            { id: 1, variable: 'cpi_inflation', value: 15, delay: 0 },
            { id: 2, variable: 'it_hiring', value: -15, delay: 0 },
            { id: 3, variable: 'it_earnings', value: -1500, delay: 0 }
        ]
    },
    digital_bounce: {
        name: "📈 Cyfrowe Odbicie",
        desc: "Stabilny wzrost inwestycji przekładający się na systematyczne zatrudnienie.",
        shocks: [
            { id: 1, variable: 'ai_investments', value: 1000, delay: 0 },
            { id: 2, variable: 'it_hiring', value: 10, delay: 6 },
            { id: 3, variable: 'it_hiring', value: 15, delay: 18 }
        ]
    }
};
