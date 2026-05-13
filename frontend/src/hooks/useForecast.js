import { useState, useEffect, useCallback } from 'react';
import { fetchHistoricalData, fetchForecast, simulateShock } from '../api/forecastApi';

/**
 * Główny hook zarządzający stanem danych oraz logiką symulacji.
 */
export const useForecast = () => {
    const [data, setData] = useState([]);
    const [originalForecast, setOriginalForecast] = useState([]);
    const [shocks, setShocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /**
     * Inicjalizacja danych: pobranie historii oraz bazowej prognozy.
     */
    const loadInitialData = useCallback(async () => {
        setLoading(true);
        try {
            const [hData, fData] = await Promise.all([
                fetchHistoricalData(),
                fetchForecast()
            ]);
            
            const safeHData = Array.isArray(hData) ? hData : [];
            const safeFData = Array.isArray(fData) ? fData : [];
            
            setData([...safeHData, ...safeFData]);
            setOriginalForecast(safeFData);
            setError(null);
        } catch (err) {
            console.error("Błąd krytyczny podczas ładowania danych:", err);
            setError("Wystąpił problem z pobieraniem danych. Sprawdź status serwera.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    /**
     * Uruchamia przeliczenie symulacji na podstawie aktualnych parametrów interwencji.
     */
    const runSimulation = useCallback(async (updatedShocks) => {
        if (updatedShocks.length === 0) {
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...originalForecast]);
            return;
        }

        try {
            const simulationResult = await simulateShock(updatedShocks);
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...(Array.isArray(simulationResult) ? simulationResult : [])]);
        } catch (err) {
            console.error("Błąd podczas przeliczania symulacji:", err);
        }
    }, [data, originalForecast]);

    /**
     * Dodaje nowy impuls do harmonogramu interwencji.
     */
    const addShock = useCallback(() => {
        const newShock = { id: Date.now(), variable: 'it_earnings', value: 1000, delay: 0 };
        setShocks(prev => {
            const next = [...prev, newShock];
            runSimulation(next);
            return next;
        });
    }, [runSimulation]);

    /**
     * Usuwa wybrany impuls z harmonogramu.
     */
    const removeShock = useCallback((id) => {
        setShocks(prev => {
            const next = prev.filter(s => s.id !== id);
            runSimulation(next);
            return next;
        });
    }, [runSimulation]);

    /**
     * Aktualizuje parametry istniejącego impulsu.
     */
    const updateShock = useCallback((id, field, val) => {
        setShocks(prev => {
            const next = prev.map(s => s.id === id ? { ...s, [field]: val } : s);
            runSimulation(next);
            return next;
        });
    }, [runSimulation]);

    /**
     * Nakłada gotowy scenariusz (preset) na aktualną symulację.
     */
    const applyPreset = useCallback((presetShocks) => {
        const shocksWithIds = presetShocks.map((s, idx) => ({ ...s, id: s.id || Date.now() + idx }));
        setShocks(shocksWithIds);
        runSimulation(shocksWithIds);
    }, [runSimulation]);

    /**
     * Czyści cały harmonogram i przywraca prognozę bazową.
     */
    const resetShocks = useCallback(() => {
        setShocks([]);
        runSimulation([]);
    }, [runSimulation]);

    return {
        data,
        shocks,
        loading,
        error,
        addShock,
        removeShock,
        updateShock,
        applyPreset,
        resetShocks
    };
};
