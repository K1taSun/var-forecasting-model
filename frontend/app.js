/* ==========================================================================
   KONTROLER APLIKACJI - VAR/VECM FORECASTING STUDIO
   ========================================================================== */

// 1. Konfiguracja punktów końcowych API (endpoints)
const CONFIG = {
    // Dynamiczne ustalanie hosta backendu: dopasowane do lokalnego programowania i zdalnych wdrożeń
    API_BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://127.0.0.1:8000' 
        : 'https://var-forecasting-api.onrender.com' // Przykładowy adres URL API produkcyjnego
};

// 2. Kontener globalnego stanu aplikacji
const state = {
    historicalData: [],
    forecastData: [],
    diagnostics: null,
    modelWeightsMeta: null,
    activeVar: 'it_earnings', // Bieżąca zmienna prezentowana na wykresie
    steps: 12,                // Horyzont prognozy w miesiącach
    chartInstance: null       // Referencja do obiektu Chart.js
};

// 3. Pamięć podręczna DOM dla szybkiego dostępu do węzłów
const DOM = {
    apiStatusDot: document.getElementById('apiStatusDot'),
    apiStatusText: document.getElementById('apiStatusText'),
    forecastForm: document.getElementById('forecastForm'),
    forecastSteps: document.getElementById('forecastSteps'),
    rangeValDisplay: document.getElementById('rangeValDisplay'),
    btnForecast: document.getElementById('btnForecast'),
    
    // Panel diagnostyczny
    diagModelType: document.getElementById('diagModelType'),
    diagObs: document.getElementById('diagObs'),
    diagLags: document.getElementById('diagLags'),
    diagAIC: document.getElementById('diagAIC'),
    
    // Sekcja rozwijana wag modelu
    weightsHeader: document.getElementById('weightsHeader'),
    weightsContent: document.getElementById('weightsContent'),
    weightStatus: document.getElementById('weightStatus'),
    weightAlpha: document.getElementById('weightAlpha'),
    weightBeta: document.getElementById('weightBeta'),
    weightGamma: document.getElementById('weightGamma'),
    weightLags: document.getElementById('weightLags'),
    
    // Elementy obszaru roboczego
    tabButtons: document.querySelectorAll('.tab-btn'),
    chartTitle: document.getElementById('chartTitle'),
    timeSeriesChart: document.getElementById('timeSeriesChart'),
    forecastTable: document.getElementById('forecastTable'),
    
    // Karty metryk
    metricEarnings: document.getElementById('metricEarnings'),
    trendEarnings: document.getElementById('trendEarnings'),
    metricHiring: document.getElementById('metricHiring'),
    trendHiring: document.getElementById('trendHiring'),
    metricCPI: document.getElementById('metricCPI'),
    trendCPI: document.getElementById('trendCPI'),
    
    // Nakładki i powiadomienia
    loadingOverlay: document.getElementById('loadingOverlay'),
    overlayStatusTitle: document.getElementById('overlayStatusTitle'),
    overlayStatusDesc: document.getElementById('overlayStatusDesc'),
    btnDismissOverlay: document.getElementById('btnDismissOverlay'),
    toastContainer: document.getElementById('toastContainer')
};

// 4. Początkowa sekwencja uruchomieniowa (Bootstrap)
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    setupEventListeners();
    initChart();
    
    // Sprawdzenie stanu API i załadowanie danych (z automatycznym rezerwowym fallbackiem w razie braku połączenia)
    await checkApiHealthAndLoadData();
}

// 5. Mapowanie detektorów zdarzeń DOM (Event Listeners)
function setupEventListeners() {
    // Detektor zmiany suwaka do aktualizacji wyświetlanej wartości liczbowej
    DOM.forecastSteps.addEventListener('input', (e) => {
        state.steps = parseInt(e.target.value);
        DOM.rangeValDisplay.textContent = state.steps;
    });

    // Zakładki wyboru zmiennych
    DOM.tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            DOM.tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            state.activeVar = e.currentTarget.dataset.var;
            updateActiveVariableTitle();
            renderChart();
        });
    });

    // Akordeon do rozwijania wag modelu VECM
    DOM.weightsHeader.addEventListener('click', () => {
        const content = DOM.weightsContent;
        const chevron = DOM.weightsHeader.querySelector('.chevron-icon');
        
        content.classList.toggle('expanded');
        chevron.classList.toggle('rotate');
    });

    // Przesłanie formularza (uruchomienie generowania prognozy)
    DOM.forecastForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerForecastQuery();
    });

    // Przycisk zamknięcia nakładki ładowania
    DOM.btnDismissOverlay.addEventListener('click', () => {
        DOM.loadingOverlay.classList.remove('active');
    });
}

// 6. Konfiguracja początkowa i globalne ustawienia domyślne Chart.js
function initChart() {
    // Elegancka konfiguracja motywu wizualnego
    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.font.size = 11;
    
    const ctx = DOM.timeSeriesChart.getContext('2d');
    state.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Historia',
                    data: [],
                    borderColor: '#6366F1',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.15
                },
                {
                    label: 'Prognoza',
                    data: [],
                    borderColor: '#06B6D4',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.15
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false // Używamy własnego, niestandardowego elementu HTML dla legendy
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 21, 38, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#e5e7eb',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += parseFloat(context.parsed.y).toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255,255,255,0.03)',
                        drawBorder: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255,255,255,0.03)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// 7. Wizualne renderowanie wykresu
function renderChart() {
    if (!state.chartInstance || state.historicalData.length === 0) return;
    
    const activeVar = state.activeVar;
    
    // Rozdzielenie zmiennych historycznych i prognozowanych
    const historicalLabels = state.historicalData.map(d => d.date);
    const historicalValues = state.historicalData.map(d => d[activeVar]);
    
    let allLabels = [...historicalLabels];
    let forecastDataset = [];
    
    if (state.forecastData.length > 0) {
        const forecastLabels = state.forecastData.map(d => d.date);
        allLabels = [...historicalLabels, ...forecastLabels];
        
        // Dopasowanie danych prognozy występujących bezpośrednio po danych historycznych
        const emptyOffset = new Array(state.historicalData.length - 1).fill(null);
        // Łączemy ostatni krok historii z pierwszym krokiem prognozy
        const lastHistVal = historicalValues[historicalValues.length - 1];
        forecastDataset = [...emptyOffset, lastHistVal, ...state.forecastData.map(d => d[activeVar])];
    }
    
    // Aktualizacja zbiorów danych Chart.js
    state.chartInstance.data.labels = allLabels;
    state.chartInstance.data.datasets[0].data = historicalValues;
    state.chartInstance.data.datasets[1].data = forecastDataset;
    
    // Ustawienie własnych akcentów gradientu wizualnego
    const ctx = DOM.timeSeriesChart.getContext('2d');
    const gradHist = ctx.createLinearGradient(0, 0, 0, 300);
    gradHist.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
    gradHist.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    
    state.chartInstance.data.datasets[0].backgroundColor = gradHist;
    state.chartInstance.update();
}

// 8. Dynamiczna aktualizacja tekstowych etykiet aktywnych zmiennych
function updateActiveVariableTitle() {
    const titles = {
        'it_earnings': 'Zarobki w Sektorze IT (IT Earnings)',
        'it_hiring': 'Indeks Zatrudnienia w IT (IT Hiring)',
        'cpi_inflation': 'Wskaźnik Inflacji CPI (CPI Inflation)',
        'ai_investments': 'Inwestycje w AI (AI Investments)'
    };
    DOM.chartTitle.textContent = titles[state.activeVar] || state.activeVar;
}

// 9. Synchronizator interfejsu użytkownika (wykres, metryki, tabele)
function updateUI() {
    updateActiveVariableTitle();
    renderChart();
    renderMetrics();
    renderTable();
    renderDiagnostics();
}

// 10. Renderowanie siatki metryk (oblicza ostatnie wartości historyczne i prognozowany wzrost)
function renderMetrics() {
    if (state.historicalData.length === 0) return;
    
    const lastHist = state.historicalData[state.historicalData.length - 1];
    
    // Format dla IT Earnings
    DOM.metricEarnings.textContent = `$${parseFloat(lastHist.it_earnings).toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Format dla IT Hiring
    DOM.metricHiring.textContent = `${parseFloat(lastHist.it_hiring).toFixed(1)} pkt`;
    
    // Format dla CPI Inflation
    DOM.metricCPI.textContent = `${parseFloat(lastHist.cpi_inflation).toFixed(2)}%`;
    
    if (state.forecastData.length > 0) {
        const lastForecast = state.forecastData[state.forecastData.length - 1];
        
        updateTrendIndicator(DOM.trendEarnings, lastHist.it_earnings, lastForecast.it_earnings, '$');
        updateTrendIndicator(DOM.trendHiring, lastHist.it_hiring, lastForecast.it_hiring, ' pkt');
        updateTrendIndicator(DOM.trendCPI, lastHist.cpi_inflation, lastForecast.cpi_inflation, '%', true);
    }
}

// Funkcja pomocnicza do określania procentu wzrostu i stylizowania klas wskaźników
function updateTrendIndicator(element, initial, final, suffix = '', isInflation = false) {
    const pctChange = ((final - initial) / initial) * 100;
    const isUp = final > initial;
    
    element.className = 'metric-trend';
    
    if (Math.abs(pctChange) < 0.05) {
        element.classList.add('trend-flat');
        element.textContent = `Płaski trend`;
    } else if (isUp) {
        element.classList.add('trend-up');
        element.innerHTML = `&uarr; +${pctChange.toFixed(1)}% (${suffix}${isInflation ? '' : ''})`;
    } else {
        element.classList.add('trend-down');
        element.innerHTML = `&darr; ${pctChange.toFixed(1)}% (${suffix}${isInflation ? '' : ''})`;
    }
}

// 11. Renderowanie tabeli z prognozami
function renderTable() {
    const tbody = DOM.forecastTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (state.forecastData.length === 0) {
        tbody.innerHTML = `
            <tr class="table-placeholder-row">
                <td colspan="5">Uruchom prognozę, aby wyświetlić zestawienie.</td>
            </tr>
        `;
        return;
    }
    
    state.forecastData.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>Krok ${index + 1}</strong> (${row.date})</td>
            <td>$${parseFloat(row.it_earnings).toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>${parseFloat(row.it_hiring).toFixed(2)}</td>
            <td>${parseFloat(row.cpi_inflation).toFixed(2)}%</td>
            <td>${row.ai_investments !== undefined ? parseFloat(row.ai_investments).toFixed(1) : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 12. Renderowanie panelu diagnostyki i wag
function renderDiagnostics() {
    if (!state.diagnostics) return;
    
    DOM.diagModelType.textContent = state.diagnostics.model_type || 'VAR';
    DOM.diagObs.textContent = state.diagnostics.total_observations || '137';
    DOM.diagLags.textContent = state.diagnostics.selected_lags || '-';
    DOM.diagAIC.textContent = state.diagnostics.aic ? parseFloat(state.diagnostics.aic).toFixed(4) : '-';
    
    if (state.modelWeightsMeta) {
        const meta = state.modelWeightsMeta;
        if (meta.loaded_from_disk) {
            DOM.weightStatus.textContent = 'Pomyślny';
            DOM.weightStatus.className = 'tag tag-success';
            DOM.weightAlpha.textContent = meta.alpha_shape ? `[${meta.alpha_shape.join(', ')}]` : '-';
            DOM.weightBeta.textContent = meta.beta_shape ? `[${meta.beta_shape.join(', ')}]` : '-';
            DOM.weightGamma.textContent = meta.gamma_shape ? `[${meta.gamma_shape.join(', ')}]` : '-';
            DOM.weightLags.textContent = `${meta.k_ar_diff || '-'} lags`;
        } else {
            DOM.weightStatus.textContent = 'Błąd odczytu / Brak';
            DOM.weightStatus.className = 'tag tag-danger';
            DOM.weightAlpha.textContent = '-';
            DOM.weightBeta.textContent = '-';
            DOM.weightGamma.textContent = '-';
            DOM.weightLags.textContent = '-';
        }
    }
}

// 13. Przesyłanie zapytania prognostycznego do API
async function triggerForecastQuery() {
    // Aktywacja nakładki ładowania
    DOM.overlayStatusTitle.textContent = "Obliczanie Prognozy VAR...";
    DOM.overlayStatusDesc = "Wysyłanie zapytania do lokalnego API FastAPI na porcie 8000.";
    DOM.btnDismissOverlay.classList.add('hidden');
    DOM.loadingOverlay.classList.add('active');
    
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/forecast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steps: state.steps })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Błąd podczas obliczania prognozy przez API.");
        }
        
        const data = await response.json();
        
        // Zapisanie otrzymanych wyników do stanu globalnego
        state.forecastData = data.forecast;
        state.diagnostics = data.diagnostics;
        state.modelWeightsMeta = data.model_weights_meta;
        
        updateUI();
        DOM.loadingOverlay.classList.remove('active');
        showToast(`Wygenerowano prognozę na horyzont ${state.steps}m za pomocą modelu VAR z API.`, 'success');
    } catch (error) {
        console.warn("Błąd połączenia z API przy prognozie, uruchamianie rezerwowej symulacji:", error);
        
        // Dynamiczne wygenerowanie symulowanych danych prognozy w przypadku braku połączenia
        setTimeout(() => {
            generateMockForecast();
            updateUI();
            DOM.loadingOverlay.classList.remove('active');
            showToast(`API niedostępne. Wygenerowano prognozę rezerwową (${state.steps}m).`, 'warning');
        }, 800);
    }
}

// Sprawdzenie stanu połączenia z API i załadowanie danych początkowych
async function checkApiHealthAndLoadData() {
    DOM.apiStatusDot.className = 'status-dot status-unknown';
    DOM.apiStatusText.textContent = "Sprawdzanie połączenia...";
    
    try {
        const healthRes = await fetch(`${CONFIG.API_BASE_URL}/health`);
        if (!healthRes.ok) throw new Error("Status API jest niepoprawny.");
        
        DOM.apiStatusDot.className = 'status-dot status-healthy';
        DOM.apiStatusText.textContent = "Połączono z API";
        
        // Pobranie rzeczywistych danych historycznych z bazy danych
        const dataRes = await fetch(`${CONFIG.API_BASE_URL}/api/data`);
        if (!dataRes.ok) throw new Error("Błąd podczas pobierania danych historycznych.");
        
        state.historicalData = await dataRes.json();
        
        // Automatyczne wygenerowanie pierwszej prognozy z API
        const forecastRes = await fetch(`${CONFIG.API_BASE_URL}/api/forecast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steps: state.steps })
        });
        
        if (forecastRes.ok) {
            const forecastData = await forecastRes.json();
            state.forecastData = forecastData.forecast;
            state.diagnostics = forecastData.diagnostics;
            state.modelWeightsMeta = forecastData.model_weights_meta;
        } else {
            generateMockForecast();
        }
        
        updateUI();
        showToast('Pomyślnie załadowano rzeczywiste dane i prognozę z API.', 'success');
    } catch (error) {
        console.warn("Brak połączenia z API backendu. Wczytywanie danych próbnych (mock):", error);
        DOM.apiStatusDot.className = 'status-dot status-unhealthy';
        DOM.apiStatusText.textContent = "API offline (dane próbne)";
        
        // Załadowanie pełnego zestawu danych próbnych
        loadMockData();
        updateUI();
        showToast('Wczytano próbne dane wizualizacyjne (API offline).', 'info');
    }
}

// 14. Funkcja tworząca powiadomienia Toast
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Wbudowane ikony SVG
    let icon = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
    `;
    if (type === 'success') {
        icon = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
    }
    
    toast.innerHTML = `
        ${icon}
        <div class="toast-content">${message}</div>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    // Automatyczne usuwanie i animacja wysuwania powiadomienia
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 15. Generator danych próbnych (Mock Data) dla celów wizualnych
function loadMockData() {
    // Generowanie przykładowego trendu historycznego dla interfejsu
    const baseDate = new Date(2025, 0, 1);
    const mockHist = [];
    
    for (let i = 0; i < 24; i++) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
        const dStr = d.toISOString().split('T')[0];
        
        mockHist.push({
            date: dStr,
            it_earnings: 30000 + i * 500 + Math.sin(i) * 1200,
            it_hiring: 250 + i * 2.5 + Math.cos(i) * 10,
            cpi_inflation: 3.5 - i * 0.05 + Math.sin(i * 1.5) * 0.4,
            ai_investments: 35.5
        });
    }
    
    state.historicalData = mockHist;
    generateMockForecast();
}

// Wygenerowanie tylko części prognozowanej z symulowanych danych
function generateMockForecast() {
    if (state.historicalData.length === 0) return;
    
    const lastHist = state.historicalData[state.historicalData.length - 1];
    const lastDate = new Date(lastHist.date);
    const mockFore = [];
    
    for (let i = 1; i <= state.steps; i++) {
        const d = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
        const dStr = d.toISOString().split('T')[0];
        
        mockFore.push({
            date: dStr,
            it_earnings: lastHist.it_earnings + i * 480 + Math.sin(i) * 800,
            it_hiring: lastHist.it_hiring + i * 1.8 + Math.cos(i) * 8,
            cpi_inflation: lastHist.cpi_inflation - i * 0.04 + Math.sin(i) * 0.2,
            ai_investments: 35.5
        });
    }
    
    state.forecastData = mockFore;
    
    // Informacje diagnostyczne
    state.diagnostics = {
        model_type: "Vector Autoregression (VAR) [Symulacja]",
        total_observations: state.historicalData.length,
        selected_lags: 2,
        aic: 11.3438
    };
    
    state.modelWeightsMeta = {
        loaded_from_disk: true,
        alpha_shape: [4, 2],
        beta_shape: [4, 2],
        gamma_shape: [4, 28],
        k_ar_diff: 7
    };
}
