import React from 'react';
import { useForecast } from '../hooks/useForecast';
import Header from './Dashboard/Header';
import PresetScenarios from './Dashboard/PresetScenarios';
import ShockInterventionPanel from './Dashboard/ShockInterventionPanel';
import ForecastChart from './Dashboard/ForecastChart';
import MethodologySection from './Dashboard/MethodologySection';

/**
 * Główny komponent Dashboardu, pełniący rolę koordynatora (orchestrator).
 * Zarządza przepływem danych i integruje poszczególne sekcje analityczne.
 */
const Dashboard = () => {
    const {
        data,
        shocks,
        loading,
        error,
        addShock,
        removeShock,
        updateShock,
        applyPreset,
        resetShocks
    } = useForecast();

    if (loading) return <div className="loader">Trwa pobieranie parametrów modelu...</div>;

    if (error || !data || data.length === 0) {
        return (
            <div className="dashboard loader">
                 {error || "Wystąpił błąd podczas ładowania danych."}
            </div>
        );
    }

    return (
        <div className="dashboard">
            <Header />
            
            <PresetScenarios onApplyPreset={applyPreset} />

            <ShockInterventionPanel 
                shocks={shocks}
                onAdd={addShock}
                onRemove={removeShock}
                onUpdate={updateShock}
                onReset={resetShocks}
            />

            <ForecastChart data={data} shocks={shocks} />

            <MethodologySection />
        </div>
    );
};

export default Dashboard;
