import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_URL = 'http://localhost:8000/api';

const PRESETS = {
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

const Dashboard = () => {
    const [data, setData] = useState([]);
    const [originalForecast, setOriginalForecast] = useState([]);
    const [shocks, setShocks] = useState([]);
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
        if (updatedShocks.length === 0) {
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...originalForecast]);
            return;
        }

        try {
            const res = await axios.post(`${API_URL}/simulate-shock`, {
                shocks: updatedShocks.map(s => ({
                    variable: s.variable,
                    value: parseFloat(s.value) || 0,
                    delay: parseInt(s.delay) || 0
                }))
            });
            const histData = data.filter(d => !d.is_forecast);
            setData([...histData, ...res.data]);
        } catch(err) {
             console.error("Błąd symulacji", err);
        }
    };

    const addShock = () => {
        const newShock = { id: Date.now(), variable: 'it_earnings', value: 1000, delay: 0 };
        const newShocks = [...shocks, newShock];
        setShocks(newShocks);
        simulateShock(newShocks);
    };

    const removeShock = (id) => {
        const newShocks = shocks.filter(s => s.id !== id);
        setShocks(newShocks);
        simulateShock(newShocks);
    };

    const updateShock = (id, field, val) => {
        const newShocks = shocks.map(s => s.id === id ? { ...s, [field]: val } : s);
        setShocks(newShocks);
        simulateShock(newShocks);
    };

    const applyPreset = (key) => {
        const preset = PRESETS[key];
        if (preset) {
            setShocks(preset.shocks);
            simulateShock(preset.shocks);
        }
    };

    const resetShocks = () => {
        setShocks([]);
        simulateShock([]);
    };

    if (loading) return <div className="loader">Trwa pobieranie modelu VAR...</div>;

    if (!data || data.length === 0) {
        return (
            <div className="dashboard loader">
                 Błąd: Brak danych do wyświetlenia. Odpal najpierw skrypt fetchera i upewnij się, że backend działa.
            </div>
        );
    }

    const getUnit = (variable) => {
        if (variable === 'it_earnings') return 'PLN';
        if (variable === 'ai_investments') return 'mln';
        if (variable === 'it_hiring') return 'Indeks';
        return '%';
    };

    // Szukamy punktu odcięcia (gdzie zaczyna się predykcja) by narysować linię
    const forecastStartObj = data.find(d => d.is_forecast);
    const forecastStartKey = forecastStartObj ? forecastStartObj.date : null;

    return (
        <div className="dashboard">
            <header className="dash-header">
                <h1>Analator VAR: Zarobki, AI & Zatrudnienie</h1>
                <p>Profesjonalna symulacja wielowymiarowych impulsów makroekonomicznych.</p>
            </header>

            <section className="presets-container glass">
                <h3>Gotowe scenariusze testowe</h3>
                <div className="presets-grid">
                    {Object.entries(PRESETS).map(([key, preset]) => (
                        <button key={key} className="preset-card" onClick={() => applyPreset(key)}>
                            <strong>{preset.name}</strong>
                            <p>{preset.desc}</p>
                        </button>
                    ))}
                </div>
            </section>

            <div className="simulator-panel glass">
                <div className="panel-header">
                    <h2>Scenariusze i Harmonogram Interwencji</h2>
                    <button className="add-btn" onClick={addShock}>+ Nowy impuls</button>
                </div>

                <div className="shocks-list">
                    {shocks.length === 0 && (
                        <p className="empty-msg">Brak aktywnych interwencji. Wybierz scenariusz testowy lub dodaj impuls ręcznie.</p>
                    )}
                    
                    {shocks.map((s) => (
                        <div key={s.id} className={`shock-row card shock-var-${s.variable}`}>
                            <div className="shock-col">
                                <label>Zmienna docelowa:</label>
                                <select 
                                    value={s.variable} 
                                    onChange={(e) => updateShock(s.id, 'variable', e.target.value)}
                                >
                                    <option value="it_earnings">Indeks Wynagrodzeń ICT</option>
                                    <option value="ai_investments">Nakłady R&D na AI</option>
                                    <option value="it_hiring">Zatrudnienie IT (Popyt)</option>
                                    <option value="cpi_inflation">Inflacja Konsumencka (CPI)</option>
                                </select>
                            </div>

                            <div className="shock-col">
                                <label>Amplituda ({getUnit(s.variable)}):</label>
                                <input 
                                    type="number" 
                                    value={s.value} 
                                    onChange={(e) => updateShock(s.id, 'value', e.target.value)}
                                />
                            </div>

                            <div className="shock-col">
                                <label>Przesunięcie (t+ k):</label>
                                <input 
                                    type="number" min="0" max="23"
                                    value={s.delay} 
                                    onChange={(e) => updateShock(s.id, 'delay', e.target.value)}
                                />
                            </div>

                            <button className="remove-btn" onClick={() => removeShock(s.id)}>Usuń</button>
                        </div>
                    ))}
                </div>

                {shocks.length > 0 && (
                    <div className="panel-footer">
                        <button className="reset-btn" onClick={resetShocks}>Wyczyść harmonogram</button>
                        <small className="hint">Trajektoria IRF (Impulse Response Function) jest rekurencyjnie przeliczana dla każdego punktu interwencji.</small>
                    </div>
                )}
            </div>

            <div className="chart-panel glass">
                <h3>Symulacja Prognostyczna i Analiza Impulsów</h3>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                            <XAxis dataKey="date" tick={{fill: '#64748b', fontSize: 11}} />
                            <YAxis yAxisId="left" tick={{fill: '#64748b'}} />
                            <YAxis yAxisId="right" orientation="right" tick={{fill: '#64748b'}} />
                            
                            <Tooltip 
                                contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px'}} 
                                itemStyle={{fontSize: '13px'}}
                            />
                            <Legend verticalAlign="top" height={36} iconType="circle"/>

                            {/* Pionowa Kreska: Wskaźnik dnia dzisiejszego / Start prognozy */}
                            {forecastStartKey && (
                                <ReferenceLine 
                                    yAxisId="left" 
                                    x={forecastStartKey} 
                                    stroke="#334155" 
                                    strokeDasharray="4 4" 
                                    label={{ position: 'top', value: 'PROGNOZA', fill: '#64748b', fontSize: 10, letterSpacing: '1px' }} 
                                />
                            )}

                            {/* Linie szoków - dynamiczne ReferenceLines */}
                            {shocks.map(s => {
                                const fDate = new Date(forecastStartKey);
                                fDate.setMonth(fDate.getMonth() + s.delay);
                                const shockDateStr = fDate.toISOString().split('T')[0].substring(0, 7);
                                const actualDate = data.find(d => d.date.startsWith(shockDateStr))?.date;

                                return actualDate ? (
                                    <ReferenceLine 
                                        key={`shock-${s.id}`}
                                        yAxisId="left"
                                        x={actualDate}
                                        stroke={
                                            s.variable === 'it_earnings' ? '#3b82f6' : 
                                            s.variable === 'ai_investments' ? '#8b5cf6' : 
                                            s.variable === 'it_hiring' ? '#10b981' : '#f59e0b'
                                        }
                                        strokeOpacity={0.3}
                                    />
                                ) : null;
                            })}

                            <Line yAxisId="left" type="monotone" dataKey="it_earnings" name="Wynagrodzenia ICT" stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={true} />
                            <Line yAxisId="left" type="monotone" dataKey="ai_investments" name="Inwestycje AI" stroke="#8b5cf6" dot={false} strokeWidth={2} isAnimationActive={true} />
                            <Line yAxisId="right" type="monotone" dataKey="it_hiring" name="Zatrudnienie IT (Indeks)" stroke="#10b981" dot={false} strokeWidth={2} isAnimationActive={true} />
                            <Line yAxisId="right" type="monotone" dataKey="cpi_inflation" name="Inflacja CPI" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={true} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

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
                    <p>© 2024 VAR Systems • Professional Forecasting Intelligence</p>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
