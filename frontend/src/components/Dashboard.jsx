import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

// ─── KONFIGURACJA ──────────────────────────────────────────────────────────────
const API_URL = 'http://localhost:8000/api';

// Zmienne modelu — dostosowane do rzeczywistych kolumn z backendu (VAR)
const VARIABLES = {
  it_earnings: { label: 'Przychody IT', unit: 'mln USD', color: '#3b82f6', axis: 'left' },
  ai_investments: { label: 'Inwestycje AI', unit: 'mln USD', color: '#8b5cf6', axis: 'left' },
  cpi_inflation: { label: 'Inflacja CPI', unit: '%', color: '#10b981', axis: 'right' },
  it_hiring: { label: 'Rekrutacja IT', unit: 'Indeks', color: '#f59e0b', axis: 'right' },
};

// Gotowe scenariusze szoków — rzeczywiste symulacje makroekonomiczne i sektorowe
const PRESETS = {
  preset_1: {
    name: '🚀 Boom Inwestycyjny AI',
    desc: 'Gwałtowny wzrost inwestycji w AI o 15 mln USD, po którym następuje wzrost przychodów IT.',
    shocks: [
      { id: 1, variable: 'ai_investments', value: 15, delay: 0 },
      { id: 2, variable: 'it_earnings', value: 1000, delay: 3 },
    ]
  },
  preset_2: {
    name: '📉 Szok Inflacyjny',
    desc: 'Wzrost inflacji CPI o 3.0 punkty procentowe, wywołujący spowolnienie rekrutacji w sektorze IT.',
    shocks: [
      { id: 1, variable: 'cpi_inflation', value: 3.0, delay: 0 },
      { id: 2, variable: 'it_hiring', value: -50, delay: 2 },
    ]
  },
  preset_3: {
    name: '📈 Dynamiczny Rozwój IT',
    desc: 'Skokowy wzrost zatrudnienia w branży IT o 50 punktów, stymulujący długofalowe przychody.',
    shocks: [
      { id: 1, variable: 'it_hiring', value: 50, delay: 0 },
      { id: 2, variable: 'it_earnings', value: 2000, delay: 6 },
    ]
  },
};

// ─── KOMPONENT GŁÓWNY ──────────────────────────────────────────────────────────
const Dashboard = () => {
  const [data, setData] = useState([]);
  const [originalForecast, setOriginalForecast] = useState([]);
  const [shocks, setShocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Funkcja pobierająca dane z backendu (opakowana dla łatwego ponawiania prób)
  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const histRes = await axios.get(`${API_URL}/historical-data`);
      const foreRes = await axios.get(`${API_URL}/forecast`);

      const hData = Array.isArray(histRes.data) ? histRes.data : [];
      const fData = Array.isArray(foreRes.data) ? foreRes.data : [];

      if (hData.length === 0 && fData.length === 0) {
        throw new Error('API zwróciło pusty zbiór danych.');
      }

      setData([...hData, ...fData]);
      setOriginalForecast(fData);
    } catch (err) {
      console.error('Błąd pobierania danych z API:', err);
      setError(err.message || 'Brak połączenia z backendem prognozującym. Upewnij się, że serwer API jest uruchomiony na porcie 8000.');
    } finally {
      setLoading(false);
    }
  };

  // Pobieranie danych startowych po załadowaniu
  useEffect(() => {
    fetchInitialData();
  }, []);

  // ─── Logika szoków ──────────────────────────────────────────────────────────
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
          delay: parseInt(s.delay) || 0,
        }))
      });
      const histData = data.filter(d => !d.is_forecast);
      setData([...histData, ...res.data]);
    } catch (err) {
      console.error('Błąd symulacji', err);
    }
  };

  const addShock = () => {
    const defaultVar = Object.keys(VARIABLES)[0];
    const newShock = { id: Date.now(), variable: defaultVar, value: 0, delay: 0 };
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

  // ─── Stany ładowania i błędu ────────────────────────────────────────────────
  if (loading) return <div className="loader">Ładowanie modelu prognozującego...</div>;

  if (error) {
    return (
      <div className="dashboard loader-error-container">
        <div className="glass error-card">
          <h2>⚠️ Błąd krytyczny komunikacji</h2>
          <p>{error}</p>
          <button className="add-btn" onClick={fetchInitialData}>Spróbuj ponownie</button>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="dashboard loader-error-container">
        <div className="glass error-card">
          <h2>⚠️ Brak danych</h2>
          <p>Model został załadowany, lecz zbiór danych jest pusty.</p>
          <button className="add-btn" onClick={fetchInitialData}>Przeładuj</button>
        </div>
      </div>
    );
  }

  // Punkt odcięcia (start prognozy) — pionowa kreska na wykresie
  const forecastStartObj = data.find(d => d.is_forecast);
  const forecastStartKey = forecastStartObj ? forecastStartObj.date : null;

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard">
      {/* Nagłówek */}
      <header className="dash-header">
        <h1>VAR Forecasting & Scenario Analysis</h1>
        <p>Zaawansowana prognoza wektorowej autoregresji (VAR) dla sektora IT i wskaźników makroekonomicznych.</p>
      </header>

      {/* Gotowe scenariusze */}
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

      {/* Panel szoków */}
      <div className="simulator-panel glass">
        <div className="panel-header">
          <h2>Harmonogram interwencji</h2>
          <button className="add-btn" onClick={addShock}>+ Nowy impuls</button>
        </div>

        <div className="shocks-list">
          {shocks.length === 0 && (
            <p className="empty-msg">
              Brak aktywnych interwencji. Wybierz scenariusz lub dodaj impuls ręcznie.
            </p>
          )}

          {shocks.map(s => {
            const varCfg = VARIABLES[s.variable] || {};
            return (
              <div key={s.id} className={`shock-row card shock-var-${s.variable}`}>
                <div className="shock-col">
                  <label>Zmienna docelowa:</label>
                  <select
                    value={s.variable}
                    onChange={e => updateShock(s.id, 'variable', e.target.value)}
                  >
                    {Object.entries(VARIABLES).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>

                <div className="shock-col">
                  <label>Amplituda ({varCfg.unit || '—'}):</label>
                  <input
                    type="number"
                    min="-100000"
                    max="100000"
                    value={s.value}
                    onChange={e => updateShock(s.id, 'value', e.target.value)}
                  />
                </div>

                <div className="shock-col">
                  <label>Przesunięcie (t+k):</label>
                  <input
                    type="number" 
                    min="0" 
                    max="35"
                    value={s.delay}
                    onChange={e => updateShock(s.id, 'delay', e.target.value)}
                  />
                </div>

                <button className="remove-btn" onClick={() => removeShock(s.id)}>Usuń</button>
              </div>
            );
          })}
        </div>

        {shocks.length > 0 && (
          <div className="panel-footer">
            <button className="reset-btn" onClick={resetShocks}>Wyczyść harmonogram</button>
            <small className="hint">
              Trajektoria IRF jest rekurencyjnie przeliczana dla każdego punktu interwencji.
            </small>
          </div>
        )}
      </div>

      {/* Wykres */}
      <div className="chart-panel glass">
        <h3>Symulacja prognostyczna i analiza impulsów</h3>
        <div className="charts-grid">
          {Object.entries(VARIABLES).map(([key, cfg]) => {
            // Wyznaczamy ostatnią dostępną wartość
            const latestValue = data.length > 0 ? data[data.length - 1][key] : null;
            const formattedVal = latestValue !== null ? latestValue.toFixed(2) : '—';
            
            return (
              <div key={key} className="individual-chart-card">
                <div className="chart-header-row">
                  <h4>
                    <span style={{ color: cfg.color }}>●</span> {cfg.label}
                  </h4>
                  <span className="chart-val-badge" style={{ borderLeft: `3px solid ${cfg.color}` }}>
                    {formattedVal} {cfg.unit}
                  </span>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={data} syncId="var-forecast-sync" margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25}/>
                          <stop offset="95%" stopColor={cfg.color} stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                      <YAxis 
                        tick={{ fill: '#64748b', fontSize: 10 }} 
                        domain={['auto', 'auto']}
                        width={50}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px', color: '#f8fafc' }}
                        labelStyle={{ fontSize: '11px', color: '#64748b' }}
                        formatter={(value) => [`${value.toFixed(2)} ${cfg.unit}`, cfg.label]}
                      />
                      
                      {/* Pionowa kreska: granica historii i prognozy */}
                      {forecastStartKey && (
                        <ReferenceLine
                          x={forecastStartKey}
                          stroke="#334155"
                          strokeDasharray="4 4"
                          label={{ position: 'top', value: 'PROGNOZA', fill: '#64748b', fontSize: 8, letterSpacing: '1px' }}
                        />
                      )}

                      {/* Linie pionowe szoków */}
                      {forecastStartKey && shocks.map(s => {
                        const fDate = new Date(forecastStartKey);
                        if (isNaN(fDate.getTime())) return null;
                        
                        fDate.setMonth(fDate.getMonth() + s.delay);
                        try {
                          const shockDateStr = fDate.toISOString().split('T')[0].substring(0, 7);
                          const actualDate = data.find(d => d.date && d.date.startsWith(shockDateStr))?.date;
                          const varColor = VARIABLES[s.variable]?.color || '#94a3b8';

                          return actualDate ? (
                            <ReferenceLine
                              key={`shock-${s.id}`}
                              x={actualDate}
                              stroke={varColor}
                              strokeOpacity={0.4}
                              strokeWidth={1.5}
                            />
                          ) : null;
                        } catch (e) {
                          return null;
                        }
                      })}

                      <Area
                        type="monotone"
                        dataKey={key}
                        name={cfg.label}
                        stroke={cfg.color}
                        fill={`url(#grad-${key})`}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sekcja metodologiczna — aparat matematyczny i architektura */}
      <section className="methodology-section glass">
        <div className="method-grid">
          <div className="method-col">
            <h4>Aparat Analityczny</h4>
            <p>Model prognozujący bazuje na rygorystycznym podejściu ekonometrycznym szeregów czasowych:</p>
            <ul>
              <li><strong>Model Wektorowej Autoregresji (VAR):</strong> Analizuje dynamiczne sprzężenia zwrotne i relacje między wszystkimi czterema zmiennymi jednocześnie.</li>
              <li><strong>Automatyczny dobór opóźnień (AIC):</strong> Serwis dynamicznie dobiera optymalną liczbę opóźnień (lags), maksymalizując zdolności predykcyjne modelu przy minimalnym przeuczeniu.</li>
              <li><strong>Symulacja Shock-Testing (IRF):</strong> Umożliwia ręczną i automatyczną symulację impulsów, propagujących się rekurencyjnie przez model.</li>
            </ul>
          </div>
          <div className="method-col">
            <h4>Architektura Systemu</h4>
            <p>Nowoczesna i wysoce decoupled struktura aplikacji zapewnia skalowalność i bezbłędne działanie:</p>
            <ul>
              <li><strong>Źródła Danych:</strong> Dane historyczne (2015-2026) zasilające model pobierane są automatycznie ze źródeł Yahoo Finance oraz Banku Światowego.</li>
              <li><strong>Backend (FastAPI):</strong> Wykorzystuje bibliotekę <code>statsmodels</code> do obliczeń VAR, ułatwiając obsługę żądań deweloperskich i produkcyjnych.</li>
              <li><strong>Frontend (React + Recharts):</strong> Zapewnia błyskawiczne, interaktywne renderowanie wykresów w czasie rzeczywistym bezpośrednio po przeliczeniu symulacji.</li>
            </ul>
          </div>
        </div>
        <div className="method-footer">
          <p>© 2026 VAR/VECM Predictive Analytics Studio • Professional Forecasting</p>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
