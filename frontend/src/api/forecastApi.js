import axios from 'axios';
import { DEFAULT_HISTORICAL_DATA, DEFAULT_FORECAST_DATA, calculateLocalSimulation } from './mockData';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_URL,
    timeout: 3000, // Czas oczekiwania na odpowiedź serwera
    headers: { 'Content-Type': 'application/json' },
});

/**
 * Pobiera dane historyczne z serwera.
 * W przypadku błędu zwraca zestaw danych domyślnych.
 */
export const fetchHistoricalData = async () => {
    try {
        const res = await api.get('/historical-data');
        return res.data;
    } catch (err) {
        console.warn("Serwer niedostępny: ładowanie danych lokalnych (Historyczne)");
        return DEFAULT_HISTORICAL_DATA;
    }
};

/**
 * Pobiera prognozę bazową z serwera.
 */
export const fetchForecast = async () => {
    try {
        const res = await api.get('/forecast');
        return res.data;
    } catch (err) {
        console.warn("Serwer niedostępny: ładowanie danych lokalnych (Prognoza)");
        return DEFAULT_FORECAST_DATA;
    }
};

/**
 * Przesyła parametry interwencji do serwera w celu przeliczenia modelu.
 */
export const simulateShock = async (shocks) => {
    try {
        const res = await api.post('/simulate-shock', {
            shocks: shocks.map(s => ({
                variable: s.variable,
                value: parseFloat(s.value) || 0,
                delay: parseInt(s.delay) || 0
            }))
        });
        return res.data;
    } catch (err) {
        console.warn("Serwer niedostępny: symulacja obliczana lokalnie");
        return calculateLocalSimulation(shocks);
    }
};

export default api;
