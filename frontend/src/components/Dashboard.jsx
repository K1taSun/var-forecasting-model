import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_URL = 'http://localhost:8000/api';

const Dashboard = () => {
    const [data, setData] = useState([]);
    const [originalForecast, setOriginalForecast] = useState([]);
    const [shockVar, setShockVar] = useState('cpi_inflation');
    const [shockMag, setShockMag] = useState(0);
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

    const simulateShock = async (mag) => {
        setShockMag(mag);
        if (mag === 0) {
            // Zwracamy po prostu do bazy
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...originalForecast]);
            return;
        }

        try {
            // Strzał do backendu do naszego modelu VAR!
            const res = await axios.post(`${API_URL}/simulate-shock`, {
                shock_variable: shockVar,
                shock_magnitude: parseFloat(mag)
            });
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...res.data]);
        } catch(err) {
             console.error("Błąd symulacji", err);
        }
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
                <p>System wektorowej autoregresji do analizy scenariuszy makroekonomicznych.</p>
            </header>

            <div className="simulator-panel glass">
                <h2>Symulator Szoków (What-If)</h2>
                <div className="controls">
                    <div className="control-group">
                        <label>Którą zmienną uderzamy?</label>
                        <select value={shockVar} onChange={(e) => setShockVar(e.target.value)}>
                            <option value="cpi_inflation">Inflacja CPI (%)</option>
                            <option value="it_earnings">Zarobki w IT (PLN)</option>
                            <option value="ai_investments">Inwestycje AI/R&D (mln)</option>
                        </select>
                    </div>
                    
                    <div className="control-group range-group">
                        <label>Siła szoku (Δ z zewnątrz): {shockMag > 0 ? '+'+shockMag : shockMag}</label>
                        <input 
                            type="range" 
                            min="-1000" 
                            max="1000" 
                            step="10"
                            value={shockMag} 
                            onChange={(e) => simulateShock(e.target.value)}
                        />
                         <small>(Przesuń suwak i patrz na wykres! Model VAR od ręki przelicza relacje!)</small>
                    </div>
                    <button className="reset-btn" onClick={() => simulateShock(0)}>Resetuj Szok</button>
                </div>
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

                            {/* Nasze linie danych (z osiami, bo inflacja to np. 5%, a pensje to 10000PLN) */}
                            <Line yAxisId="left" type="monotone" dataKey="it_earnings" name="Zarobki IT (PLN)" stroke="#00f3ff" dot={false} strokeWidth={2} />
                            <Line yAxisId="left" type="monotone" dataKey="ai_investments" name="Inwestycje R&D (mln)" stroke="#b000ff" dot={false} strokeWidth={2} />
                            <Line yAxisId="right" type="monotone" dataKey="cpi_inflation" name="Inflacja CPI (%)" stroke="#ffaa00" dot={false} strokeWidth={2} />

                            {/* Pionowa Kreska Oddzielająca Historię od Prognozy - renderujemy na końcu dla pewności domeny */}
                            {forecastStartKey && data.some(d => d.date === forecastStartKey) && (
                                <ReferenceLine yAxisId="left" x={forecastStartKey} stroke="#ff0055" strokeDasharray="3 3" label={{ position: 'top', value: 'Moment Predykcji', fill: '#ff0055' }} />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
