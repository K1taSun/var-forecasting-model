import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_URL = 'http://localhost:8000/api';

const Dashboard = () => {
    const [data, setData] = useState([]);
    const [originalForecast, setOriginalForecast] = useState([]);
    const [shocks, setShocks] = useState({
        it_earnings: 0,
        ai_investments: 0,
        cpi_inflation: 0
    });
    const [loading, setLoading] = useState(true);

    // Pobranie danych startowych po załadowaniu
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const histRes = await axios.get(`${API_URL}/historical-data`);
                const foreRes = await axios.get(`${API_URL}/forecast`);
                
                const hData = Array.isArray(histRes.data) ? histRes.data : [];
                const fData = Array.isArray(foreRes.data) ? foreRes.data : [];
                
                setData([...hData, ...fData]);
                setOriginalForecast(fData);
            } catch (err) {
                console.error("Błąd API:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const simulateShock = async (updatedShocks) => {
        setShocks(updatedShocks);
        console.log("Symulacja szoków dla:", updatedShocks);
        
        // Sprawdzamy czy wszystkie szoki są zerowe
        const isAllZero = Object.values(updatedShocks).every(v => v === 0);

        if (isAllZero) {
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...originalForecast]);
            return;
        }

        try {
            const res = await axios.post(`${API_URL}/simulate-shock`, {
                shocks: updatedShocks
            });
            console.log("Otrzymano nową prognozę:", res.data.length, "elementów");
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...res.data]);
        } catch(err) {
             console.error("Błąd symulacji", err);
        }
    };

    const handleShockChange = (variable, value) => {
        const val = parseFloat(value);
        console.log(`Zmiana suwaka ${variable} -> ${val}`);
        const newShocks = { ...shocks, [variable]: val };
        simulateShock(newShocks);
    };

    const resetShocks = () => {
        const zeros = { it_earnings: 0, ai_investments: 0, cpi_inflation: 0 };
        simulateShock(zeros);
    };

    if (loading) return <div className="loader">Trwa pobieranie modelu VAR...</div>;

    if (!data || data.length === 0) {
        return (
            <div className="dashboard loader">
                 Błąd: Brak danych do wyświetlenia. Odpal najpierw skrypt fetchera i upewnij się, że backend działa.
            </div>
        );
    }

    // Szukamy punktu odcięcia (gdzie zaczyna się predykcja) by narysować linię
    const forecastStartObj = data.find(d => d.is_forecast);
    const forecastStartKey = forecastStartObj ? forecastStartObj.date : null;

    return (
        <div className="dashboard">
            <header className="dash-header">
                <h1>Analator VAR: Zarobki, AI & Inflacja</h1>
                <p>Symulacja wielowymiarowych impulsów makroekonomicznych.</p>
            </header>

            <div className="simulator-panel glass">
                <h2>Symulator Szoków Gospodarczych (Multi-Shock)</h2>
                <div className="multi-controls">
                    
                    {/* Zarobki IT */}
                    <div className="control-group range-group">
                        <label>Zarobki IT (PLN):</label>
                        <div className="input-with-slider">
                            <input 
                                type="range" min="-5000" max="5000" step="50"
                                value={shocks.it_earnings} 
                                onChange={(e) => handleShockChange('it_earnings', e.target.value)}
                            />
                            <input 
                                type="number" 
                                value={shocks.it_earnings} 
                                onChange={(e) => handleShockChange('it_earnings', e.target.value)}
                                className="number-input"
                            />
                        </div>
                    </div>

                    {/* Inwestycje AI */}
                    <div className="control-group range-group">
                        <label>Inwestycje R&D (mln PLN):</label>
                        <div className="input-with-slider">
                            <input 
                                type="range" min="-2000" max="2000" step="10"
                                value={shocks.ai_investments} 
                                onChange={(e) => handleShockChange('ai_investments', e.target.value)}
                            />
                            <input 
                                type="number" 
                                value={shocks.ai_investments} 
                                onChange={(e) => handleShockChange('ai_investments', e.target.value)}
                                className="number-input"
                            />
                        </div>
                    </div>

                    {/* Inflacja */}
                    <div className="control-group range-group">
                        <label>Inflacja CPI (%):</label>
                        <div className="input-with-slider">
                            <input 
                                type="range" min="-10" max="25" step="0.1"
                                value={shocks.cpi_inflation} 
                                onChange={(e) => handleShockChange('cpi_inflation', e.target.value)}
                            />
                            <input 
                                type="number" 
                                value={shocks.cpi_inflation} 
                                step="0.1"
                                onChange={(e) => handleShockChange('cpi_inflation', e.target.value)}
                                className="number-input"
                            />
                        </div>
                    </div>

                    <button className="reset-btn" onClick={resetShocks}>Resetuj Wszystko</button>
                </div>
                <small className="hint">Przesuń suwaki by nałożyć kilka szoków jednocześnie. Model VAR przeliczy wzajemne relacje.</small>
            </div>

            <div className="chart-panel glass">
                <h3>Prognoza i Trajektorie (Impulse Response)</h3>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis dataKey="date" tick={{fill: '#ddd'}} type="category" allowDuplicatedCategory={false} />
                            <YAxis yAxisId="left" tick={{fill: '#ddd'}} />
                            <YAxis yAxisId="right" orientation="right" tick={{fill: '#ddd'}} />
                            
                            <Tooltip contentStyle={{backgroundColor: '#222', borderColor: '#444'}} />
                            <Legend />

                            {/* Nasze linie danych */}
                            <Line yAxisId="left" type="monotone" dataKey="it_earnings" name="Zarobki IT (PLN)" stroke="#00f3ff" dot={false} strokeWidth={2} isAnimationActive={false} />
                            <Line yAxisId="left" type="monotone" dataKey="ai_investments" name="Inwestycje R&D (mln)" stroke="#b000ff" dot={false} strokeWidth={2} isAnimationActive={false} />
                            <Line yAxisId="right" type="monotone" dataKey="cpi_inflation" name="Inflacja CPI (%)" stroke="#ffaa00" dot={false} strokeWidth={2} isAnimationActive={false} />

                            {/* Pionowa Kreska: Wskaźnik dnia dzisiejszego / Start prognozy */}
                            {forecastStartKey && data.some(d => d.date === forecastStartKey) && (
                                <ReferenceLine 
                                    key={`ref-line-${forecastStartKey}`}
                                    yAxisId="left" 
                                    x={forecastStartKey} 
                                    stroke="#ff0055" 
                                    strokeDasharray="5 5" 
                                    label={{ position: 'top', value: 'Dzisiaj / Start Prognozy', fill: '#ff0055', fontSize: 12 }} 
                                />
                            )}

                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
