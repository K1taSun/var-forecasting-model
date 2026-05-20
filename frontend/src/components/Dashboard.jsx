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
    name: '🚀 Boom AI z Korektami',
    desc: 'Silny wzrost inwestycji przerywany gwałtownymi korektami. Widoczna nieliniowość na przestrzeni ponad roku.',
    shocks: [
      { id: 1, variable: 'ai_investments', value: 800, delay: 1 },
      { id: 2, variable: 'ai_investments', value: -400, delay: 5 },
      { id: 3, variable: 'it_earnings', value: 8000, delay: 8 },
      { id: 4, variable: 'it_earnings', value: -3000, delay: 12 },
      { id: 5, variable: 'ai_investments', value: 1200, delay: 15 },
    ]
  },
  preset_2: {
    name: '📉 Huśtawka Inflacyjna',
    desc: 'Wysoka zmienność inflacji: szybkie wzrosty i nagłe spadki, brutalnie rzutujące na rekrutację i zyski IT.',
    shocks: [
      { id: 10, variable: 'cpi_inflation', value: 3.5, delay: 1 },
      { id: 11, variable: 'cpi_inflation', value: -2.0, delay: 6 },
      { id: 12, variable: 'cpi_inflation', value: 4.0, delay: 10 },
      { id: 13, variable: 'it_hiring', value: -80, delay: 13 },
      { id: 14, variable: 'it_earnings', value: -6000, delay: 15 },
    ]
  },
  preset_3: {
    name: '🎢 Niestabilny Rynek (Rollercoaster)',
    desc: 'Naprzemienne fale masowych zatrudnień i zwolnień wraz z ogromnymi skokami przychodów w ciągu 15 miesięcy.',
    shocks: [
      { id: 20, variable: 'it_hiring', value: 60, delay: 2 },
      { id: 21, variable: 'it_earnings', value: 7000, delay: 4 },
      { id: 22, variable: 'it_hiring', value: -90, delay: 9 },
      { id: 23, variable: 'it_earnings', value: -10000, delay: 12 },
      { id: 24, variable: 'it_hiring', value: 120, delay: 15 },
    ]
  },
  preset_4: {
    name: '⚠️ Kryzys i Nagłe Odbicie',
    desc: 'Głęboka recesja technologiczna w pierwszych miesiącach, po której następuje wstrząsowy powrót hossy.',
    shocks: [
      { id: 30, variable: 'ai_investments', value: -600, delay: 1 },
      { id: 31, variable: 'it_hiring', value: -100, delay: 5 },
      { id: 32, variable: 'cpi_inflation', value: 2.5, delay: 8 },
      { id: 33, variable: 'ai_investments', value: 1500, delay: 13 },
      { id: 34, variable: 'it_earnings', value: 12000, delay: 15 },
    ]
  },
  preset_5: {
    name: '🌐 Szok Makroekonomiczny',
    desc: 'Ekstremalne wahania makro: nagły skok cen, uderzenie w zyski, a następnie potężna deflacja i odbicie AI.',
    shocks: [
      { id: 40, variable: 'cpi_inflation', value: 5.0, delay: 2 },
      { id: 41, variable: 'it_earnings', value: -8000, delay: 4 },
      { id: 42, variable: 'cpi_inflation', value: -6.0, delay: 9 },
      { id: 43, variable: 'ai_investments', value: 1000, delay: 12 },
      { id: 44, variable: 'it_hiring', value: 90, delay: 15 },
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
            <h4>🧠 Zaawansowany Aparat Analityczny</h4>
            <p>Silnik prognostyczny wykorzystuje najnowocześniejsze metody analizy wielowymiarowych szeregów czasowych, oferując precyzję na poziomie instytucjonalnym:</p>
            <ul>
              <li><strong>Model Wektorowej Autoregresji (VAR):</strong> Ekonometryczny silnik mapujący wielokierunkowe, nieliniowe sprzężenia zwrotne pomiędzy wskaźnikami makroekonomicznymi a kondycją sektora IT.</li>
              <li><strong>Algorytmiczna Optymalizacja (AIC):</strong> Zautomatyzowany dobór rzędu opóźnień (lags) minimalizujący błąd predykcji i chroniący model przed zjawiskiem przeuczenia (overfitting).</li>
              <li><strong>Analiza Impulsów (IRF - Impulse Response Function):</strong> Narzędzie symulacyjne pozwalające na rygorystyczne testy warunków skrajnych (stress-testing) i badanie dynamicznej propagacji szoków rynkowych w czasie.</li>
            </ul>
          </div>
          <div className="method-col">
            <h4>⚙️ Architektura Systemu (Decoupled)</h4>
            <p>Rozwiązanie oparto na nowoczesnym, modularnym stosie technologicznym, gwarantującym asynchroniczną i błyskawiczną realizację obliczeń:</p>
            <ul>
              <li><strong>Zautomatyzowane Źródła Danych (ETL):</strong> W pełni autonomiczne agregowanie potężnych zbiorów historycznych (2015-2026) z globalnych parkietów (Yahoo Finance) oraz baz Banku Światowego.</li>
              <li><strong>Wysokowydajny Backend (FastAPI):</strong> Asynchroniczny serwer analityczny w Pythonie napędzany biblioteką <code>statsmodels</code>, przeliczający ciężkie modele ekonometryczne w ułamkach sekund.</li>
              <li><strong>Interaktywny Frontend (React + Recharts):</strong> Błyskawiczna prezentacja macierzy wyników na dynamicznych i płynnych wykresach renderowanych prosto w przeglądarce klienta.</li>
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
