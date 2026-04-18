import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_URL = 'http://localhost:8000/api';

const PRESETS = {
    ai_boom: {
        name: "🚀 Boom AI",
        desc: "Masywne inwestycje R&D i skokowy wzrost płac programistów.",
        shocks: [
            { id: 1, variable: 'ai_investments', value: 3000, delay: 0 },
            { id: 2, variable: 'it_earnings', value: 2500, delay: 6 }
        ]
    },
    stagflation: {
        name: "📉 Szok Stagflacyjny",
        desc: "Nagły wzrost inflacji przy jednoczesnym osłabieniu realnego wzrostu płac.",
        shocks: [
            { id: 1, variable: 'cpi_inflation', value: 15, delay: 0 },
            { id: 2, variable: 'it_earnings', value: -1500, delay: 0 }
        ]
    },
    digital_bounce: {
        name: "📈 Cyfrowe Odbicie",
        desc: "Umiarkowany wzrost inwestycji rozłożony w czasie.",
        shocks: [
            { id: 1, variable: 'ai_investments', value: 1000, delay: 0 },
            { id: 2, variable: 'ai_investments', value: 1500, delay: 12 },
            { id: 3, variable: 'it_earnings', value: 1200, delay: 18 }
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
        return '%';
    };

    // Szukamy punktu odcięcia (gdzie zaczyna się predykcja) by narysować linię
    const forecastStartObj = data.find(d => d.is_forecast);
    const forecastStartKey = forecastStartObj ? forecastStartObj.date : null;

    return (
        <div className="dashboard">
            <header className="dash-header">
                <h1>Analator VAR: Zarobki, AI & Inflacja</h1>
                <p>Symulacja wielwymiarowych impulsów makroekonomicznych.</p>
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
                    <h2>Harmonogram Szoków Gospodarczych</h2>
                    <button className="add-btn" onClick={addShock}>+ Dodaj nowy szok</button>
                </div>

                <div className="shocks-list">
                    {shocks.length === 0 && (
                        <p className="empty-msg">Brak aktywnych szoków. Wybierz scenariusz lub dodaj impuls ręcznie.</p>
                    )}
                    
                    {shocks.map((s) => (
                        <div key={s.id} className={`shock-row card shock-var-${s.variable}`}>
                            <div className="shock-col">
                                <label>Zmienna:</label>
                                <select 
                                    value={s.variable} 
                                    onChange={(e) => updateShock(s.id, 'variable', e.target.value)}
                                >
                                    <option value="it_earnings">Zarobki IT</option>
                                    <option value="ai_investments">Inwestycje AI</option>
                                    <option value="cpi_inflation">Inflacja CPI</option>
                                </select>
                            </div>

                            <div className="shock-col">
                                <label>Siła impulsu ({getUnit(s.variable)}):</label>
                                <input 
                                    type="number" 
                                    value={s.value} 
                                    onChange={(e) => updateShock(s.id, 'value', e.target.value)}
                                />
                            </div>

                            <div className="shock-col">
                                <label>Opóźnienie (msc):</label>
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
                        <button className="reset-btn" onClick={resetShocks}>Wyczyść wszystko</button>
                        <small className="hint">Pionowe linie na wykresie pokazują punkty interwencji (szoki).</small>
                    </div>
                )}
            </div>

            <div className="chart-panel glass">
                <h3>Prognoza i Trajektorie (Impulse Response)</h3>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="date" tick={{fill: '#94a3b8', fontSize: 12}} />
                            <YAxis yAxisId="left" tick={{fill: '#94a3b8'}} />
                            <YAxis yAxisId="right" orientation="right" tick={{fill: '#94a3b8'}} />
                            
                            <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#1e293b', border: '1px solid #334155'}} />
                            <Legend verticalAlign="top" height={36}/>

                            {/* Pionowa Kreska: Wskaźnik dnia dzisiejszego / Start prognozy */}
                            {forecastStartKey && (
                                <ReferenceLine 
                                    yAxisId="left" 
                                    x={forecastStartKey} 
                                    stroke="#ef4444" 
                                    strokeDasharray="5 5" 
                                    label={{ position: 'top', value: 'START', fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} 
                                />
                            )}

                            {/* Linie szoków - dynamiczne ReferenceLines */}
                            {shocks.map(s => {
                                // Obliczamy datę szoku: forecastStartKey + s.delay miesięcy
                                const fDate = new Date(forecastStartKey);
                                fDate.setMonth(fDate.getMonth() + s.delay);
                                const shockDateStr = fDate.toISOString().split('T')[0].substring(0, 7); // YYYY-MM
                                
                                // Znajdujemy najbliższą datę w danych
                                const actualDate = data.find(d => d.date.startsWith(shockDateStr))?.date;

                                return actualDate ? (
                                    <ReferenceLine 
                                        key={`shock-${s.id}`}
                                        yAxisId="left"
                                        x={actualDate}
                                        stroke={s.variable === 'it_earnings' ? '#00f3ff' : s.variable === 'ai_investments' ? '#b000ff' : '#ffaa00'}
                                        strokeOpacity={0.4}
                                        strokeDasharray="3 3"
                                    />
                                ) : null;
                            })}

                            <Line yAxisId="left" type="monotone" dataKey="it_earnings" name="Zarobki IT (PLN)" stroke="#00f3ff" dot={false} strokeWidth={3} isAnimationActive={true} />
                            <Line yAxisId="left" type="monotone" dataKey="ai_investments" name="Inwestycje AI (mln)" stroke="#b000ff" dot={false} strokeWidth={3} isAnimationActive={true} />
                            <Line yAxisId="right" type="monotone" dataKey="cpi_inflation" name="Inflacja (%)" stroke="#ffaa00" dot={false} strokeWidth={3} isAnimationActive={true} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
