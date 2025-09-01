// ========================================
// TALON DRILL-DOWN CHART COMPONENT
// ========================================

// Variabili globali
let chart = null;
let state = {
    currentLevel: 0,
    currentPeriod: 'year',  // Cambiato da 'month' a 'year' per includere i dati esistenti
    customStartDate: null,
    customEndDate: null,
    breadcrumb: [],
    currentCategory: null,
    currentSubcategory: null,
    currentSubDetail: null,
    currentEntityType: null
};

// ========================================
// FUNZIONI UI HELPER - VERSION 4.0 UPDATED
// ========================================

console.log('🚀 DRILL-DOWN CHART VERSION 4.1 - ERRORI JAVASCRIPT RISOLTI - ROTAZIONE INTELLIGENTE ATTIVA!');

function getCarattereFiltro() {
    // Ottieni il valore del toggle carattere dal DOM
    const carattereToggle = document.querySelector('input[name="carattere"]:checked');
    return carattereToggle ? carattereToggle.value : '';
}

function formatLabelForChart(label) {
    // Formatta le etichette lunghe per il grafico, dividendole su più righe
    if (typeof label !== 'string' || label.length <= 20) {
        return label;
    }
    
    const words = label.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
        // Se la parola da sola è più lunga di 20 caratteri, la tronchiamo
        if (word.length > 20) {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
            lines.push(word.substring(0, 17) + '...');
        } else if ((currentLine + (currentLine ? ' ' : '') + word).length <= 20) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    });
    if (currentLine) lines.push(currentLine);
    
    // Limita a massimo 2 righe per evitare grafici troppo alti
    return lines.slice(0, 2);
}

function cleanName(name) {
    // Rimuove caratteri "/" iniziali dai nomi
    if (typeof name === 'string') {
        return name.replace(/^\/+/, '').trim();
    }
    return name;
}

function parseItalianDate(dateStr) {
    // Funzione per parsare date italiane GG/MM/AAAA o GG/MM/AA
    if (!dateStr || dateStr === '//' || typeof dateStr !== 'string') {
        return null;
    }
    
    const cleanStr = dateStr.trim();
    const parts = cleanStr.split('/');
    
    if (parts.length !== 3) {
        return null;
    }
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    
    // Controlli di validità
    if (isNaN(day) || isNaN(month) || isNaN(year) || 
        day < 1 || day > 31 || 
        month < 1 || month > 12) {
        return null;
    }
    
    // Gestione anni a 2 cifre (assumendo 20XX per 00-50, 19XX per 51-99)
    if (year < 100) {
        year += (year <= 50) ? 2000 : 1900;
    }
    
    // Crea la data usando il costruttore Date (month è 0-based)
    const date = new Date(year, month - 1, day);
    
    // Verifica che la data creata corrisponda ai valori inseriti
    if (date.getFullYear() !== year || 
        date.getMonth() !== month - 1 || 
        date.getDate() !== day) {
        return null;
    }
    
    return date;
}

function generateColors(count) {
    const baseColors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(118, 75, 162, 0.8)', 
        'rgba(237, 100, 166, 0.8)',
        'rgba(144, 19, 254, 0.8)',
        'rgba(0, 191, 165, 0.8)',
        'rgba(249, 139, 93, 0.8)',
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 205, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)'
    ];
    
    const background = [];
    const border = [];
    
    for (let i = 0; i < count; i++) {
        const colorIndex = i % baseColors.length;
        background.push(baseColors[colorIndex]);
        border.push(baseColors[colorIndex].replace('0.8', '1'));
    }
    
    return { background, border };
}

function showLoading() {
    // Rimuovi elementi loading come richiesto dall'utente
    // Non mostrare spinner
    // console.log removed for production silence
}

function hideLoading() {
    // Rimuovi elementi loading come richiesto dall'utente
    // Non nascondere spinner perché non viene mostrato
    // console.log removed for production silence
}

function updateBreadcrumb() {
    const breadcrumbEl = document.getElementById('chart-breadcrumb');
    if (!breadcrumbEl) {
        console.error('🚨 Elemento chart-breadcrumb non trovato');
        return;
    }
    
    // Usa il titolo configurato nel template, fallback su "ATTIVITÀ"
    const breadcrumbTitle = window.TALON_CONFIG?.breadcrumbTitle || 'ATTIVITÀ';
    
    let html = '';
    
    // Aggiungi breadcrumb per ogni livello (3 livelli istogramma: 0,1,2)
    if (state.currentLevel === 0) {
        html = `<div class="breadcrumb-item active" data-level="0">${breadcrumbTitle}</div>`;
    } else {
        html = `<div class="breadcrumb-item" data-level="0" onclick="navigateToLevel(0)">${breadcrumbTitle}</div>`;
        
        if (state.breadcrumb.length > 0 && state.currentLevel >= 1) {
            html += ' → ';
            html += `<div class="breadcrumb-item ${state.currentLevel === 1 ? 'active' : ''}" data-level="1" onclick="navigateToLevel(1)">${cleanName(state.breadcrumb[0]) || 'Sottocategorie'}</div>`;
        }
        
        if (state.breadcrumb.length > 1 && state.currentLevel === 2) {
            html += ' → ';
            html += `<div class="breadcrumb-item active" data-level="2">${cleanName(state.breadcrumb[1]) || 'Enti'}</div>`;
        }
    }
    
    breadcrumbEl.innerHTML = html;
}

function updateInfoCards() {
    // Aggiorna le info cards con statistiche generali
    loadStatistics();
}

async function updateInfoCardsForCurrentLevel(data) {
    // Aggiorna le info cards dinamicamente basandosi sul livello corrente
    if (!data || !data.values) return;
    
    // "Attività Specifiche" = somma di tutte le attività visualizzate nel livello corrente
    const specificActivities = data.values.reduce((sum, value) => sum + (parseInt(value) || 0), 0);
    
    // Aggiorna "Attività Specifiche" (somma delle attività del livello corrente)
    const specificActivitiesEl = document.getElementById('specificActivitiesValue');
    if (specificActivitiesEl) {
        specificActivitiesEl.textContent = specificActivities;
    }
    
    // Aggiorna "Categorie" (numero di categorie/elementi nel livello corrente)
    const categoriesValueEl = document.getElementById('categoriesValue');
    if (categoriesValueEl && data.labels) {
        categoriesValueEl.textContent = data.labels.length;
    }
    
    // Carica il totale generale delle attività (sempre fisso)
    try {
        const endpoints = window.TALON_CONFIG?.api?.endpoints || {};
        let statsUrl = `${endpoints.statistiche || '/drill-down/api/statistiche'}?period=${state.currentPeriod}`;
        if (state.currentPeriod === 'custom' && state.customStartDate && state.customEndDate) {
            statsUrl += `&start_date=${state.customStartDate}&end_date=${state.customEndDate}`;
        }
        
        const statsResponse = await fetch(statsUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        if (statsResponse.ok) {
            const result = await statsResponse.json();
            if (result.success && result.stats) {
                // "Totale Attività" = numero totale di attività condotte nel periodo (sempre fisso)
                const totalValueEl = document.getElementById('totalValue');
                if (totalValueEl) {
                    totalValueEl.textContent = result.stats.totale || '0';
                }
            }
        }
    } catch (error) {
        console.error('Errore caricamento statistiche totali:', error);
    }
    
    // Carica il numero di enti coinvolti per il livello specifico
    try {
        const endpoints = window.TALON_CONFIG?.api?.endpoints || {};
        let url = `${endpoints.enti_coinvolti || '/drill-down/api/enti-coinvolti'}?period=${state.currentPeriod}&level=${state.currentLevel}`;
        
        // Aggiungi date personalizzate se presenti
        if (state.currentPeriod === 'custom' && state.customStartDate && state.customEndDate) {
            url += `&start_date=${state.customStartDate}&end_date=${state.customEndDate}`;
        }
        
        // Aggiungi parametri specifici del livello
        if (state.currentLevel >= 1 && state.currentCategory) {
            url += `&categoria=${encodeURIComponent(state.currentCategory)}`;
        }
        if (state.currentLevel >= 2 && state.currentSubcategory) {
            url += `&sottocategoria=${encodeURIComponent(state.currentSubcategory)}`;
        }
        
        const entitiesResponse = await fetch(url, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        if (entitiesResponse.ok) {
            const result = await entitiesResponse.json();
            if (result.success) {
                // "Enti Coinvolti" = numero di enti coinvolti per questo livello specifico
                const entitiesValueEl = document.getElementById('entitiesValue');
                if (entitiesValueEl) {
                    entitiesValueEl.textContent = result.enti_coinvolti || '0';
                }
            }
        }
    } catch (error) {
        console.error('Errore caricamento enti coinvolti per livello:', error);
    }
    
}

async function loadStatistics() {
    try {
        const endpoints = window.TALON_CONFIG?.api?.endpoints || {};
        let url = `${endpoints.statistiche || '/drill-down/api/statistiche'}?period=${state.currentPeriod}`;
        if (state.currentPeriod === 'custom' && state.customStartDate && state.customEndDate) {
            url += `&start_date=${state.customStartDate}&end_date=${state.customEndDate}`;
        }
        
        const response = await fetch(url, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.stats) {
                // Aggiorna gli elementi che esistono nella dashboard eventi
                const totalValueEl = document.getElementById('totalValue');
                if (totalValueEl) totalValueEl.textContent = result.stats.totale || '0';
                
                const positiveValueEl = document.getElementById('positiveValue');
                if (positiveValueEl) positiveValueEl.textContent = result.stats.positivi || '0';
                
                const negativeValueEl = document.getElementById('negativeValue');
                if (negativeValueEl) negativeValueEl.textContent = result.stats.negativi || '0';
                
                const entitiesValueEl = document.getElementById('entitiesValue');
                if (entitiesValueEl) entitiesValueEl.textContent = result.stats.enti_coinvolti || '0';
                
                // Calcola giorni in base al periodo
                let days;
                if (state.currentPeriod === 'custom' && state.customStartDate && state.customEndDate) {
                    days = Math.ceil((new Date(state.customEndDate) - new Date(state.customStartDate)) / (1000 * 60 * 60 * 24)) + 1;
                } else {
                    const periodDays = {
                        'week': 7,
                        'month': 30,
                        'quarter': 90,
                        'year': 365
                    };
                    days = periodDays[state.currentPeriod] || 30;
                }
                document.getElementById('periodValue').textContent = days;
            }
        }
    } catch (error) {
        console.error('Errore caricamento statistiche:', error);
    }
}

function navigateToLevel(level) {
    if (level < state.currentLevel) {
        state.currentLevel = level;
        state.breadcrumb = state.breadcrumb.slice(0, level);
        initChartWithAPI();
    }
}

// ========================================
// CALCOLO ALTEZZA OTTIMALE CHART
// ========================================

function calculateOptimalChartHeight() {
    try {
        const mainContent = document.getElementById('main-content');
        const periodSelector = document.querySelector('.period-selector');
        const infoCards = document.querySelector('.info-cards');
        const detailsPanel = document.getElementById('detailsPanel');
        const padding = 60; // Margini e padding vari
        
        if (!mainContent) {
            console.warn('📊 [Chart Height Dashboard] main-content non trovato, usando altezza di default');
            return 350; // Default fallback
        }
        
        let availableHeight = mainContent.offsetHeight;
        
        // Sottrai altezza degli altri elementi
        if (periodSelector) availableHeight -= periodSelector.offsetHeight;
        if (infoCards) availableHeight -= infoCards.offsetHeight;
        if (detailsPanel && detailsPanel.style.display !== 'none') {
            availableHeight -= 300; // Spazio per la tabella dettagli
        }
        
        // TEMPORANEO: Test con altezza più aggressiva per debug
        const aggressiveHeight = Math.floor(window.innerHeight * 0.6); // 60% del viewport
        const conservativeHeight = Math.max(
            250, // Minimo per leggibilità
            Math.min(
                Math.floor((availableHeight - padding) * 0.5),
                Math.floor(window.innerHeight * 0.45), // Max 45% viewport height
                500 // Massimo assoluto per non essere troppo grande
            )
        );
        
        // Usa l'altezza più grande tra le due per test
        const chartHeight = Math.max(conservativeHeight, aggressiveHeight);
        
        console.log('📊 [Chart Height Dashboard] Calcolo altezza:', {
            mainContentHeight: mainContent.offsetHeight,
            availableHeight: availableHeight,
            conservativeHeight: conservativeHeight,
            aggressiveHeight: aggressiveHeight,
            finalChartHeight: chartHeight,
            viewportHeight: window.innerHeight,
            periodSelectorHeight: periodSelector ? periodSelector.offsetHeight : 'non trovato',
            infoCardsHeight: infoCards ? infoCards.offsetHeight : 'non trovato',
            detailsPanelVisible: detailsPanel && detailsPanel.style.display !== 'none'
        });
        
        return chartHeight;
    } catch (error) {
        console.error('📊 [Chart Height Dashboard] Errore calcolo altezza:', error);
        return 350; // Fallback sicuro
    }
}

// ========================================
// FUNZIONE CHART PRINCIPALE
// ========================================

function initChart(labels, values, chartType = 'bar', customHeight = null) {
    const ctx = document.getElementById('chartCanvas');
    if (!ctx) {
        console.error('Canvas element non trovato');
        return;
    }
    
    const ctx2d = ctx.getContext('2d');
    
    // Distruggi chart esistente se presente
    if (window.chart) {
        window.chart.destroy();
        window.chart = null;
    }
    
    // Applica altezza personalizzata PRIMA di creare il chart
    if (customHeight) {
        // Imposta altezza sul canvas
        ctx.style.height = customHeight + 'px';
        ctx.height = customHeight; // Imposta anche l'attributo height
        
        // Imposta altezza anche sul contenitore padre per Chart.js
        const chartContainer = ctx.closest('.chart-container');
        if (chartContainer) {
            const containerHeight = customHeight + 40; // +40px per padding del contenitore
            chartContainer.style.height = containerHeight + 'px';
            console.log('📊 [Chart Container Dashboard] Altezza contenitore impostata PRIMA della creazione chart:', {
                canvasHeight: customHeight + 'px',
                canvasActualHeight: ctx.height,
                containerHeight: containerHeight + 'px',
                containerElement: chartContainer
            });
        } else {
            console.warn('📊 [Chart Container Dashboard] Contenitore .chart-container non trovato!');
        }
        
        console.log('📊 [Chart Height Dashboard] Altezza personalizzata applicata PRIMA della creazione:', customHeight + 'px');
    }
    
    // Stili di base
    ctx.style.display = 'block';
    ctx.style.width = '100%';
    
    // Configurazione colori
    const colors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(118, 75, 162, 0.8)',
        'rgba(237, 100, 166, 0.8)',
        'rgba(144, 19, 254, 0.8)',
        'rgba(0, 191, 165, 0.8)',
        'rgba(249, 139, 93, 0.8)'
    ];
    
    // Crea nuovo chart
    window.chart = new Chart(ctx2d, {
        type: chartType,
        data: {
            labels: labels ? labels.map(label => cleanName(label)) : [],
            datasets: [{
                label: 'Valori',
                data: values,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.8', '1')),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            onClick: handleChartClick,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.y;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 90,
                        minRotation: 0,
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
    
    // Log finale per verificare stato del chart
    if (customHeight) {
        const finalCanvas = document.getElementById('chartCanvas');
        const finalContainer = finalCanvas ? finalCanvas.closest('.chart-container') : null;
        console.log('📊 [Chart Final State Dashboard] Stato finale dopo creazione chart:', {
            chartCreated: !!window.chart,
            canvasStyleHeight: finalCanvas ? finalCanvas.style.height : 'N/A',
            canvasActualHeight: finalCanvas ? finalCanvas.height : 'N/A',
            containerStyleHeight: finalContainer ? finalContainer.style.height : 'N/A',
            containerActualHeight: finalContainer ? finalContainer.offsetHeight : 'N/A'
        });
    }
    
    // Aggiorna UI
    updateBreadcrumb();
    hideLoading();
}

function handleChartClick(event, elements) {
    if (elements.length > 0) {
        const index = elements[0].index;
        const chart = window.chart || this; // Usa this come fallback
        // Usa le etichette originali per il drill-down, non quelle formattate per la visualizzazione
        const label = chart.originalLabels ? chart.originalLabels[index] : chart.data.labels[index];
        
        // console.log removed for production silence
        
        // Gestisci drill-down basato sul livello corrente
        if (state.currentLevel < 2) {
            drillDown(label, index);
        } else if (state.currentLevel === 2) {
            // Livello 2: Click su ente -> Mostra dettagli direttamente
            // console.log removed for production silence
            showEntityDetails(label);
        }
    }
}

// ========================================
// FUNZIONI MOCK/FALLBACK
// ========================================

async function loadSubcategories(categoria) {
    // console.log removed for production silence
    try {
        const data = await loadDataFromAPI(1, categoria);
        if (data) {
            updateChartWithAPIData(data, `Sottocategorie di ${categoria}`);
            state.breadcrumb = [categoria];
        } else {
            console.warn('Nessuna sottocategoria trovata, usando dati mock');
            // Fallback ai dati mock se necessario
        }
    } catch (error) {
        console.error('Errore caricamento sottocategorie:', error);
    }
}

async function loadEntities(sottocategoria) {
    // console.log removed for production silence
    try {
        const data = await loadDataFromAPI(2, sottocategoria);
        if (data) {
            updateChartWithAPIData(data, `Enti per ${sottocategoria}`);
            // Mantieni il breadcrumb precedente e aggiungi questo livello
            if (state.breadcrumb.length === 1) {
                state.breadcrumb.push(sottocategoria);
            }
        } else {
            console.warn('Nessun ente trovato, usando dati mock');
        }
    } catch (error) {
        console.error('Errore caricamento enti:', error);
    }
}

async function loadDetails(ente) {
    // console.log removed for production silence
    try {
        const data = await loadDataFromAPI(3, ente);
        if (data && Array.isArray(data)) {
            showDetailsListFromAPI(ente, data);
            // Mantieni il breadcrumb precedente e aggiungi questo livello
            if (state.breadcrumb.length === 2) {
                state.breadcrumb.push(ente);
            }
        } else {
            console.warn('Nessun dettaglio trovato');
            showDetailsListFromAPI(ente, []);
        }
    } catch (error) {
        console.error('Errore caricamento dettagli:', error);
        showDetailsListFromAPI(ente, []);
    }
}

function hideDetails() {
    const panel = document.getElementById('detailsPanel');
    if (panel) {
        panel.classList.remove('show');
    }
}

function showDetails(title, data) {
    // Funzione per mostrare dettagli generici - non usata nei primi 4 livelli
    // console.log removed for production silence
}

async function showEntityDetails(ente) {
    // console.log removed for production silence
    
    try {
        const data = await loadDataFromAPI(3, ente); // Livello 3 API per dettagli (/api/dettagli)
        
        if (data && Array.isArray(data)) {
            displayEntityActivities(ente, data);
        } else {
            console.warn('Nessun dettaglio trovato per:', ente);
            displayEntityActivities(ente, []);
        }
    } catch (error) {
        console.error('Errore caricamento dettagli:', error);
        displayEntityActivities(ente, []);
    }
}

function displayEntityActivities(ente, activities) {
    const panel = document.getElementById('detailsPanel');
    const list = document.getElementById('detailsList');
    
    if (!panel || !list) {
        console.error('Elementi pannello dettagli non trovati');
        return;
    }
    
    console.log(`[DrillDown] Visualizzando ${activities ? activities.length : 0} attività per ente: ${ente}`);
    
    // Genera ID univoco per evitare conflitti con altre tabelle
    const tableId = 'drilldownTable_' + Date.now();
    const topPagId = 'topPag_' + Date.now();
    const bottomPagId = 'bottomPag_' + Date.now();
    
    // Mostra il pannello dettagli
    panel.style.display = 'block';
    
    let html = `
        <div class="entity-details-header">
            <h5>Attività svolte da: <strong>${ente}</strong></h5>
        </div>
        <div class="mt-3">
    `;
    
    if (activities && activities.length > 0) {
        html += `
            <!-- Paginazione superiore -->
            <div class="pagination-wrapper top-pagination" id="${topPagId}">
                <div class="pagination-info">
                    <span id="topPageInfo">Pagina 1 di 1 (${activities.length} attività totali)</span>
                </div>
                <div class="pagination-controls" id="topPaginationControls">
                    <!-- Controlli generati dinamicamente -->
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="advanced-table" id="${tableId}">
                    <thead>
                        <tr>
                            <th class="sortable" data-column="0" data-sort-type="date">
                                <span class="th-label">Data Inizio</span>
                            </th>
                            <th class="sortable" data-column="1" data-sort-type="date">
                                <span class="th-label">Data Fine</span>
                            </th>
                            <th class="sortable" data-column="2" data-sort-type="text">
                                <span class="th-label">Descrizione</span>
                            </th>
                            <th class="sortable" data-column="3" data-sort-type="text">
                                <span class="th-label">Stato</span>
                            </th>
                            <th class="sortable" data-column="4" data-sort-type="text">
                                <span class="th-label">Durata</span>
                            </th>
                            <th class="sortable" data-column="5" data-sort-type="text">
                                <span class="th-label">In favore di</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // Ordina per data (cronologico)
        const sortedActivities = activities.sort((a, b) => {
            return new Date(a.data) - new Date(b.data);
        });
        
        sortedActivities.forEach(activity => {
            const statusClass = activity.stato === 'Conclusa' ? 'success' : 
                               activity.stato === 'In corso' ? 'warning' : 
                               activity.stato === 'Pianificata' ? 'info' : 'secondary';
            
            // Gestione sicura delle date con parsing personalizzato per formato italiano
            let dataInizioSort = '';
            if (activity.data_inizio && activity.data_inizio !== '//' && activity.data_inizio.trim() !== '') {
                const parsedInizio = parseItalianDate(activity.data_inizio);
                if (parsedInizio) {
                    dataInizioSort = parsedInizio.toISOString();
                } else {
                    console.warn(`[DrillDown] Data inizio non parsabile:`, activity.data_inizio);
                }
            }
            
            let dataFineSort = '';
            if (activity.data_fine && activity.data_fine !== '//' && activity.data_fine.trim() !== '') {
                const parsedFine = parseItalianDate(activity.data_fine);
                if (parsedFine) {
                    dataFineSort = parsedFine.toISOString();
                } else {
                    console.warn(`[DrillDown] Data fine non parsabile:`, activity.data_fine);
                }
            }
            
            html += `
                <tr onclick="viewActivityDetails('${activity.id || ''}')" style="cursor: pointer;" title="Clicca per visualizzare i dettagli dell'attività">
                    <td data-sort="${dataInizioSort}">${activity.data_inizio || 'N/D'}</td>
                    <td data-sort="${dataFineSort}">${activity.data_fine || 'N/D'}</td>
                    <td>${activity.descrizione || 'N/D'}</td>
                    <td><span class="badge bg-${statusClass}">${activity.stato || 'N/D'}</span></td>
                    <td>${activity.durata || 'N/D'}</td>
                    <td>${activity.in_favore_di || 'N/D'}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            
            <!-- Paginazione inferiore -->
            <div class="pagination-wrapper bottom-pagination" id="${bottomPagId}">
                <div class="pagination-info">
                    <span id="bottomPageInfo">Pagina 1 di 1 (${activities.length} attività totali)</span>
                </div>
                <div class="pagination-controls" id="bottomPaginationControls">
                    <!-- Controlli generati dinamicamente -->
                </div>
            </div>
        `;
    } else {
        html += '<p class="text-muted">Nessuna attività trovata per questo ente nel periodo selezionato.</p>';
    }
    
    
    html += '</div>';
    list.innerHTML = html;
    
    // Inizializza AdvancedTable se esistono attività
    if (activities && activities.length > 0) {
        setTimeout(() => {
            const table = document.getElementById(tableId);
            if (table && typeof AdvancedTable !== 'undefined') {
                console.log('[DrillDown] Inizializzando AdvancedTable per dettagli...');
                
                // Inizializza con paginazione smart per gestire grandi quantità di dati
                window.drilldownTable = new AdvancedTable({
                    tableSelector: '#' + tableId,
                    itemsPerPage: 100, // Mostra 100 record per pagina come lista_attività
                    enableSorting: true,
                    enableDragDrop: true,
                    enablePagination: true, // Abilita paginazione smart
                    enableColumnResize: true,
                    topControlsSelector: '#topPaginationControls',
                    bottomControlsSelector: '#bottomPaginationControls',
                    topInfoSelector: '#topPageInfo',
                    bottomInfoSelector: '#bottomPageInfo'
                });
                
                console.log('[DrillDown] AdvancedTable inizializzata:', window.drilldownTable);
            } else {
                console.warn('[DrillDown] AdvancedTable non disponibile o tabella non trovata');
            }
        }, 100);
    }
}

function hideEntityDetails() {
    const panel = document.getElementById('detailsPanel');
    if (panel) {
        panel.style.display = 'none';
    }
}

// Funzione helper per nascondere tutti i dettagli
function hideAllDetails() {
    hideDetails();
    hideEntityDetails();
}

// ========================================
// INTEGRAZIONE API FLASK
// ========================================

async function loadDataFromAPI(level, parentLabel = null) {
    try {
        let url = '';
        let params = new URLSearchParams();
        
        // Aggiungi sempre il periodo
        params.append('period', state.currentPeriod);
        
        // Aggiungi date personalizzate se presenti
        if (state.currentPeriod === 'custom' && state.customStartDate && state.customEndDate) {
            params.append('start_date', state.customStartDate);
            params.append('end_date', state.customEndDate);
        }
        
        // Usa gli endpoints configurati nel template tramite TALON_CONFIG, fallback su drill-down
        const endpoints = window.TALON_CONFIG?.api?.endpoints || {};
        
        switch(level) {
            case 0:
                url = endpoints.categorie || '/drill-down/api/categorie';
                break;
            case 1:
                url = endpoints.sottocategorie || '/drill-down/api/sottocategorie';
                params.append('categoria', parentLabel);
                break;
            case 2:
                url = endpoints.enti || '/drill-down/api/enti';
                params.append('sottocategoria', parentLabel);
                
                // Per dashboard eventi: livello 1 (enti primo livello), livello 2 (tutti gli enti)
                const dashboardType = document.querySelector('#eventi-config')?.getAttribute('data-type');
                if (dashboardType === 'eventi') {
                    params.append('level', '1'); // Mostra solo enti di primo livello
                }
                
                // Aggiungi il filtro carattere dal toggle se presente
                const carattereFiltro = getCarattereFiltro();
                if (carattereFiltro) {
                    params.append('carattere_filtro', carattereFiltro);
                }
                break;
            case 3:
                // Per dashboard eventi: se siamo a livello 3, potrebbe essere:
                // - Dettagli di un ente di primo livello → mostrare sottoenti (level=2)
                // - Dettagli di un sottoente → mostrare eventi specifici
                const dashboardTypeL3 = document.querySelector('#eventi-config')?.getAttribute('data-type');
                if (dashboardTypeL3 === 'eventi') {
                    // Se il parent è un ente di primo livello, mostra i suoi sottoenti
                    url = endpoints.enti || '/drill-down/api/enti';
                    params.append('sottocategoria', state.breadcrumb[0]); // tipo_evento dal livello 0
                    params.append('ente_primo_livello', parentLabel); // Nome dell'ente di primo livello
                    params.append('level', '2'); // Mostra tutti i sottoenti specifici
                    
                    // Aggiungi il filtro carattere dal toggle se presente
                    const carattereFiltroL3 = getCarattereFiltro();
                    if (carattereFiltroL3) {
                        params.append('carattere_filtro', carattereFiltroL3);
                    }
                } else {
                    url = endpoints.dettagli || '/drill-down/api/dettagli';
                    params.append('ente', parentLabel);
                }
                break;
        }
        
        const fullUrl = `${url}?${params.toString()}`;
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        
        if (!response.ok) {
            console.error(`❌ HTTP error! status: ${response.status}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            return result.data;
        } else {
            console.warn(`⚠️ API response non valida:`, result);
            throw new Error(result.error || 'Errore nel caricamento dati');
        }
        
    } catch (error) {
        console.error(`🚨 API Error (level ${level}, parent: "${parentLabel}"):`, error);
        return null;
    }
}

// Modifica la funzione drillDown esistente
function drillDown(label, index) {
    showLoading();
    
    // Usa async/await per gestire le chiamate API
    (async () => {
        try {
            let newLevel = state.currentLevel + 1;
            let data = null;
            
            // La gestione del livello 2 (enti) → dettagli è ora gestita in handleChartClick
            
            // Controlla se siamo nella dashboard eventi per modificare la logica
            const dashboardType = document.querySelector('#eventi-config')?.getAttribute('data-type');
            
            // Dashboard normale: usa la logica standard
            const cleanLabel = cleanName(label);
            data = await loadDataFromAPI(newLevel, cleanLabel);
            
            // Se l'API fallisce, usa i dati mock
            if (!data) {
                // console.log removed for production silence
                
                // Controlla se siamo nella dashboard eventi
                const dashboardType = document.querySelector('#eventi-config')?.getAttribute('data-type');
                
                if (state.currentLevel === 0) {
                    if (dashboardType === 'eventi') {
                        // Dashboard eventi: vai direttamente agli enti (livello 2)
                        const tipoEventoDb = window.TALON_CONFIG?.unformatTipoEvento ? 
                                           window.TALON_CONFIG.unformatTipoEvento(label) : 
                                           label.toLowerCase().replace(' ', '_');
                        state.currentSubcategory = tipoEventoDb;
                        state.currentLevel = 2;
                        loadEntities(tipoEventoDb);
                    } else {
                        // Dashboard normale
                        state.currentCategory = label;
                        state.currentLevel = 1;
                        loadSubcategories(label);
                    }
                } else if (state.currentLevel === 1) {
                    state.currentSubcategory = label;
                    state.currentLevel = 2;
                    loadEntities(label);
                } else if (state.currentLevel === 2) {
                    state.currentEntity = label;
                    state.currentLevel = 3;
                    loadDetails(label);
                }
            } else {
                // Usa i dati dall'API
                // console.log removed for production silence
                
                if (newLevel === 2 && dashboardType === 'eventi' && state.currentLevel === 0) {
                    // Dashboard eventi: Livello 0 → 2 direttamente (Tipi → Enti)
                    const tipoEventoDb = window.TALON_CONFIG?.unformatTipoEvento ? 
                                       window.TALON_CONFIG.unformatTipoEvento(label) : 
                                       label.toLowerCase().replace(' ', '_');
                    
                    state.currentSubcategory = tipoEventoDb;
                    state.currentLevel = 2;
                    state.breadcrumb = [label];
                    updateChartWithAPIData(data, `Enti per ${label}`);
                } else if (state.currentLevel === 0) {
                    // Dashboard normale: Livello 0 → 1 (Categorie → Sottocategorie)
                    const cleanLabel = cleanName(label);
                    state.currentCategory = cleanLabel;
                    state.currentLevel = 1;
                    state.breadcrumb = [cleanLabel];
                    updateChartWithAPIData(data, `Sottocategorie di ${cleanLabel}`);
                } else if (state.currentLevel === 1) {
                    // Livello 1 → 2: Sottocategorie → Enti per sottocategoria  
                    const cleanLabel = cleanName(label);
                    state.currentSubcategory = cleanLabel;
                    state.currentLevel = 2;
                    state.breadcrumb = [state.currentCategory, cleanLabel];
                    updateChartWithAPIData(data, `Enti per ${cleanLabel}`);
                }
                // Livello 2 → 3: gestito direttamente nella funzione drillDown sopra
            }
            
            updateBreadcrumb();
            
        } catch (error) {
            console.error('Errore nel drill-down:', error);
            alert('Errore nel caricamento dei dati. Uso dati di esempio.');
            
            // Fallback ai dati mock in caso di errore
            if (state.currentLevel === 0) {
                state.currentCategory = label;
                state.currentLevel = 1;
                loadSubcategories(label);
            } else if (state.currentLevel === 1) {
                state.currentSubcategory = label;
                state.currentLevel = 2;
                loadEntities(label);
            } else if (state.currentLevel === 2) {
                state.currentEntity = label;
                state.currentLevel = 3;
                loadDetails(label);
            }
            
            updateBreadcrumb();
            
        } finally {
            hideLoading();
        }
    })();
}

// Nuova funzione per aggiornare il grafico con dati API
function updateChartWithAPIData(data, label) {
    
    if (!data) {
        console.error('🚨 updateChartWithAPIData: data è null/undefined!', data);
        return;
    }
    
    if (!data.labels || !data.values) {
        console.error('🚨 updateChartWithAPIData: dati API non validi!', data);
        return;
    }
    
    if (!window.chart) {
        console.error('🚨 updateChartWithAPIData: window.chart non disponibile!');
        return;
    }
    
    
    // Formatta le etichette per supportare multi-riga se necessario
    const formattedLabels = data.labels.map(label => formatLabelForChart(label));
    const colors = generateColors(data.labels.length);
    
    // Usa le etichette formattate per la visualizzazione ma mantieni mapping per i click
    window.chart.data.labels = formattedLabels;
    // Salva le etichette originali per il click handling
    window.chart.originalLabels = data.labels.map(label => cleanName(label));
    window.chart.data.datasets[0].data = data.values;
    window.chart.data.datasets[0].backgroundColor = colors.background;
    window.chart.data.datasets[0].borderColor = colors.border;
    window.chart.data.datasets[0].label = label;
    
    // Usa sempre istogramma a barre verticali per tutti i livelli
    window.chart.config.type = 'bar';
    
    window.chart.update();
    
    // Aggiorna le info cards dinamicamente basandosi sul livello attuale
    updateInfoCardsForCurrentLevel(data);
    
    // Non mostrare dettagli sui primi 4 livelli - solo istogrammi
    hideEntityDetails();
    
}

// Nuova funzione per mostrare dettagli da API
function showDetailsListFromAPI(entity, details) {
    const panel = document.getElementById('detailsPanel');
    const list = document.getElementById('detailsList');
    
    panel.classList.add('show');
    
    // Genera ID univoco per evitare conflitti con altre tabelle
    const tableId2 = 'drilldownTable2_' + Date.now();
    const topPagId2 = 'topPag2_' + Date.now();
    const bottomPagId2 = 'bottomPag2_' + Date.now();
    
    let html = `<h5>Dettagli attività: ${entity}</h5><div class="mt-3">`;
    
    if (details && details.length > 0) {
        // Crea una tabella per i dettagli
        html += `
            <!-- Paginazione superiore -->
            <div class="pagination-wrapper top-pagination" id="${topPagId2}">
                <div class="pagination-info">
                    <span id="topPageInfo2">Pagina 1 di 1 (${details.length} dettagli totali)</span>
                </div>
                <div class="pagination-controls" id="topPaginationControls2">
                    <!-- Controlli generati dinamicamente -->
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="advanced-table" id="${tableId2}">
                    <thead>
                        <tr>
                            <th class="sortable" data-column="0" data-sort-type="text">
                                <span class="th-label">ID</span>
                            </th>
                            <th class="sortable" data-column="1" data-sort-type="date">
                                <span class="th-label">Data</span>
                            </th>
                            <th class="sortable" data-column="2" data-sort-type="text">
                                <span class="th-label">Descrizione</span>
                            </th>
                            <th class="sortable" data-column="3" data-sort-type="text">
                                <span class="th-label">Durata</span>
                            </th>
                            <th class="sortable" data-column="4" data-sort-type="text">
                                <span class="th-label">Responsabile</span>
                            </th>
                            <th class="sortable" data-column="5" data-sort-type="text">
                                <span class="th-label">Stato</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        details.forEach(detail => {
            const statusColor = detail.stato === 'Completata' ? 'success' : 
                               detail.stato === 'In corso' ? 'warning' : 'info';
            
            // Gestione sicura della data con parsing personalizzato per formato italiano
            let dataSort = '';
            if (detail.data && detail.data !== '//' && detail.data.trim() !== '') {
                const parsedDate = parseItalianDate(detail.data);
                if (parsedDate) {
                    dataSort = parsedDate.toISOString();
                } else {
                    console.warn(`[DrillDown] Data dettaglio non parsabile:`, detail.data);
                }
            }
            
            html += `
                <tr>
                    <td>${detail.id || 'N/D'}</td>
                    <td data-sort="${dataSort}">${detail.data || 'N/D'}</td>
                    <td>${detail.descrizione || 'N/D'}</td>
                    <td>${detail.durata || 'N/D'}</td>
                    <td>${detail.responsabile || 'N/D'}</td>
                    <td><span class="badge bg-${statusColor}">${detail.stato || 'N/D'}</span></td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            
            <!-- Paginazione inferiore -->
            <div class="pagination-wrapper bottom-pagination" id="${bottomPagId2}">
                <div class="pagination-info">
                    <span id="bottomPageInfo2">Pagina 1 di 1 (${details.length} dettagli totali)</span>
                </div>
                <div class="pagination-controls" id="bottomPaginationControls2">
                    <!-- Controlli generati dinamicamente -->
                </div>
            </div>
        `;
    } else {
        html += '<p class="text-muted">Nessun dettaglio disponibile</p>';
    }
    
    
    html += '</div>';
    list.innerHTML = html;
    
    // Inizializza AdvancedTable se esistono dettagli
    if (details && details.length > 0) {
        setTimeout(() => {
            const table = document.getElementById(tableId2);
            if (table && typeof AdvancedTable !== 'undefined') {
                console.log('[DrillDown] Inizializzando AdvancedTable per dettagli lista...');
                
                // Inizializza con paginazione smart per gestire grandi quantità di dati
                window.drilldownTable2 = new AdvancedTable({
                    tableSelector: '#' + tableId2,
                    itemsPerPage: 100, // Mostra 100 record per pagina come lista_attività
                    enableSorting: true,
                    enableDragDrop: true,
                    enablePagination: true, // Abilita paginazione smart
                    enableColumnResize: true,
                    topControlsSelector: '#topPaginationControls2',
                    bottomControlsSelector: '#bottomPaginationControls2',
                    topInfoSelector: '#topPageInfo2',
                    bottomInfoSelector: '#bottomPageInfo2'
                });
                
                console.log('[DrillDown] AdvancedTable2 inizializzata:', window.drilldownTable2);
            } else {
                console.warn('[DrillDown] AdvancedTable non disponibile o tabella2 non trovata');
            }
        }, 100);
    }
    
    // Nascondi il grafico quando mostri i dettagli
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
        chartContainer.style.display = 'none';
    }
}

// Modifica navigateToLevel per gestire il ritorno dai dettagli
function navigateToLevel(level) {
    // Nascondi sempre tutti i dettagli quando si naviga
    hideAllDetails();
    
    // Mostra di nuovo il grafico se era nascosto
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
        chartContainer.style.display = 'block';
    }
    
    if (level === 0) {
        // Torna all'inizio
        state.currentLevel = 0;
        state.currentCategory = null;
        state.currentSubcategory = null;
        state.currentEntity = null;
        
        // Prova a ricaricare da API
        (async () => {
            showLoading();
            try {
                const data = await loadDataFromAPI(0);
                if (data) {
                    window.chart.config.type = 'bar';
                    window.chart.data.labels = data.labels;
                    window.chart.data.datasets[0] = {
                        label: 'Numero Attività',
                        data: data.values,
                        backgroundColor: generateColors(data.labels.length).background,
                        borderColor: generateColors(data.labels.length).border,
                        borderWidth: 2,
                        borderRadius: 8
                    };
                    window.chart.options.onClick = handleChartClick;
                    window.chart.update();
                    updateInfoCards({labels: data.labels, data: data.values});
                } else {
                    // Fallback ai mock
                    window.chart.config.type = 'bar';
                    window.chart.data.labels = mockData.level0.labels;
                    window.chart.data.datasets[0] = {
                        label: 'Numero Attività',
                        data: mockData.level0.data,
                        backgroundColor: mockData.level0.backgroundColor,
                        borderColor: mockData.level0.borderColor,
                        borderWidth: 2,
                        borderRadius: 8
                    };
                    window.chart.options.onClick = handleChartClick;
                    window.chart.update();
                }
            } catch (error) {
                console.error('Errore caricamento dati:', error);
                // Usa mock data
                window.chart.config.type = 'bar';
                window.chart.data.labels = mockData.level0.labels;
                window.chart.data.datasets[0] = {
                    label: 'Numero Attività',
                    data: mockData.level0.data,
                    backgroundColor: mockData.level0.backgroundColor,
                    borderColor: mockData.level0.borderColor,
                    borderWidth: 2,
                    borderRadius: 8
                };
                window.chart.options.onClick = handleChartClick;
                window.chart.update();
            } finally {
                hideLoading();
            }
        })();
        
        
    } else if (level === 1 && state.currentCategory) {
        // Torna al livello 1: mostra sottocategorie della categoria salvata
        state.currentLevel = 1;
        state.currentSubcategory = null;
        state.currentEntity = null;
        state.breadcrumb = [state.currentCategory];
        
        // Mostra il grafico se era nascosto
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        
        // Ricarica sottocategorie
        (async () => {
            showLoading();
            try {
                const data = await loadDataFromAPI(1, state.currentCategory);
                if (data) {
                    updateChartWithAPIData(data, `Sottocategorie di ${state.currentCategory}`);
                }
            } catch (error) {
                console.error('Errore navigazione livello 1:', error);
            } finally {
                hideLoading();
            }
        })();
        
    } else if (level === 2 && state.currentSubcategory) {
        // Torna al livello 2: mostra enti della sottocategoria salvata
        state.currentLevel = 2;
        state.currentEntity = null;
        state.breadcrumb = [state.currentCategory, state.currentSubcategory];
        
        // Mostra il grafico se era nascosto
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        
        // Ricarica enti
        (async () => {
            showLoading();
            try {
                const data = await loadDataFromAPI(2, state.currentSubcategory);
                if (data) {
                    updateChartWithAPIData(data, `Enti per ${state.currentSubcategory}`);
                }
            } catch (error) {
                console.error('Errore navigazione livello 2:', error);
            } finally {
                hideLoading();
            }
        })();
    }
    
    updateBreadcrumb();
    // I counter verranno aggiornati automaticamente quando i dati del livello vengono caricati
}

// Aggiungi questa funzione per inizializzare con dati API
async function initChartWithAPI() {
    showLoading();
    
    try {
        const data = await loadDataFromAPI(0);
        
        if (data && data.labels && data.values) {
            // console.log removed for production silence
            
            // Usa la funzione initChart con altezza dinamica
            const chartHeight = calculateOptimalChartHeight();
            initChart(data.labels, data.values, 'bar', chartHeight);
            
            // Aggiorna le info cards per il livello iniziale
            updateInfoCardsForCurrentLevel(data);
            
        } else {
            // Fallback ai dati mock con altezza dinamica
            const chartHeight = calculateOptimalChartHeight();
            initChart([], [], 'bar', chartHeight);
        }
        
    } catch (error) {
        console.error('Errore inizializzazione con API:', error);
        // Fallback ai dati mock con altezza dinamica
        const chartHeight = calculateOptimalChartHeight();
        initChart([], [], 'bar', chartHeight);
        
    } finally {
        hideLoading();
    }
}

// ========================================
// CLASSE PRINCIPALE DRILL-DOWN CHART
// ========================================

class TalonDrillDownChart {
    constructor(options = {}) {
        this.container = options.container || '.dashboard-container';
        this.canvas = options.canvas || 'chartCanvas';
        this.period = options.period || 'year';
        
        // Inizializza stato
        state.currentPeriod = this.period;
        state.currentLevel = 0;
        state.breadcrumb = [];
        
        // Aggiungi event listener per ridimensionamento finestra
        this.setupResizeListener();
        
        // Inizializza il grafico
        this.init();
    }
    
    setupResizeListener() {
        // Throttling del resize per evitare troppe chiamate
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 150);
        });
        console.log('📏 Event listener resize configurato per dashboard principale');
    }
    
    handleResize() {
        if (window.chart) {
            const newHeight = calculateOptimalChartHeight();
            const canvas = document.getElementById('chartCanvas');
            if (canvas && newHeight) {
                canvas.style.height = newHeight + 'px';
                
                // Aggiorna anche il contenitore padre
                const chartContainer = canvas.closest('.chart-container');
                if (chartContainer) {
                    const containerHeight = newHeight + 40; // +40px per padding
                    chartContainer.style.height = containerHeight + 'px';
                }
                
                window.chart.resize(); // Forza Chart.js a ricalcolare le dimensioni
                console.log('📊 [Window Resize Dashboard] Altezza grafico aggiornata a:', newHeight + 'px');
            }
        }
    }
    
    init() {
        
        // Inizializza grafico con API
        initChartWithAPI();
        
        // Inizializza UI
        updateBreadcrumb();
        updateInfoCards();
    }
    
    parseItalianDate(dateStr) {
        // Metodo di istanza che usa la funzione globale
        return parseItalianDate(dateStr);
    }
    
    setPeriod(period) {
        state.currentPeriod = period;
        state.customStartDate = null;
        state.customEndDate = null;
        
        // Aggiorna giorni visualizzati
        const periodDays = {
            'week': 7,
            'month': 30,
            'quarter': 90,
            'year': 365
        };
        
        const periodEl = document.getElementById('periodValue');
        if (periodEl) {
            periodEl.textContent = periodDays[period] || '30';
        }
        
        // Ricarica dati con nuovo periodo
        initChartWithAPI();
        updateInfoCards();
    }
    
    setCustomPeriod(startDate, endDate) {
        state.currentPeriod = 'custom';
        state.customStartDate = startDate;
        state.customEndDate = endDate;
        
        // Calcola giorni
        const daysDiff = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
        const periodEl = document.getElementById('periodValue');
        if (periodEl) {
            periodEl.textContent = daysDiff;
        }
        
        // Ricarica dati con periodo personalizzato
        initChartWithAPI();
        updateInfoCards();
        
        // console.log removed for production silence
    }
    
    destroy() {
        if (window.chart) {
            window.chart.destroy();
            window.chart = null;
        }
    }
    
    /**
     * Simula un click su un elemento specifico del drilldown
     * @param {number} level - Livello corrente (0=categorie, 1=sottocategorie, 2=enti)
     * @param {string} label - Label dell'elemento da cliccare (può essere URL-encoded)
     */
    simulateClick(level, label) {
        console.log(`[DrillDown] Simulazione click - Livello: ${level}, Label: ${label}`);
        
        if (!window.chart || !window.chart.data || !window.chart.data.labels) {
            console.error('[DrillDown] Chart non disponibile per simulazione click');
            return;
        }
        
        // Decodifica URL del label se necessario
        let decodedLabel = label;
        try {
            decodedLabel = decodeURIComponent(label);
            console.log(`[DrillDown] Label decodificato: "${decodedLabel}"`);
        } catch (e) {
            console.log(`[DrillDown] Label non URL-encoded: "${label}"`);
        }
        
        // Trova l'indice del label nel chart corrente
        const labels = window.chart.data.labels;
        console.log(`[DrillDown] Labels disponibili nel chart:`, labels);
        
        // Prova prima con il label decodificato, poi con quello originale
        let index = labels.findIndex(l => cleanName(l) === cleanName(decodedLabel));
        
        if (index === -1 && decodedLabel !== label) {
            console.log(`[DrillDown] Tentativo con label originale...`);
            index = labels.findIndex(l => cleanName(l) === cleanName(label));
        }
        
        if (index === -1) {
            console.warn(`[DrillDown] Label "${decodedLabel}" (originale: "${label}") non trovato nel livello ${level}`);
            console.warn(`[DrillDown] Labels disponibili:`, labels.map(l => cleanName(l)));
            return;
        }
        
        console.log(`[DrillDown] Trovato label "${decodedLabel}" all'indice ${index}`);
        
        // Simula il click chiamando handleChartClick
        const mockEvent = {};
        const mockElements = [{ index: index }];
        
        handleChartClick(mockEvent, mockElements);
    }
    
    /**
     * Simula un click sul primo elemento disponibile nel chart corrente
     */
    simulateClickFirstItem() {
        console.log(`[DrillDown] Simulazione click primo elemento disponibile`);
        
        if (!window.chart || !window.chart.data || !window.chart.data.labels) {
            console.error('[DrillDown] Chart non disponibile per simulazione click');
            return;
        }
        
        const labels = window.chart.data.labels;
        if (labels.length > 0) {
            console.log(`[DrillDown] Click su primo elemento: "${labels[0]}"`);
            
            // Simula il click chiamando handleChartClick
            const mockEvent = {};
            const mockElements = [{ index: 0 }];
            
            handleChartClick(mockEvent, mockElements);
        } else {
            console.warn('[DrillDown] Nessun elemento disponibile nel chart');
        }
    }
    
    /**
     * Controlla se il chart è pronto e ha dati
     */
    isChartReady() {
        return !!(window.chart && window.chart.data && window.chart.data.labels && window.chart.data.labels.length > 0);
    }
    
    /**
     * Restituisce lo stato corrente del drilldown
     */
    getCurrentState() {
        return {
            level: state.currentLevel,
            category: state.currentCategory,
            subcategory: state.currentSubcategory,
            chartReady: this.isChartReady(),
            labelsCount: window.chart?.data?.labels?.length || 0
        };
    }
}

// Dati mock di emergenza per fallback estremo
const mockData = {
    level0: {
        labels: ['Operazioni Militari', 'Addestramento', 'Sicurezza', 'Logistica'],
        data: [12, 8, 6, 4],
        backgroundColor: [
            'rgba(102, 126, 234, 0.8)',
            'rgba(118, 75, 162, 0.8)',
            'rgba(237, 100, 166, 0.8)',
            'rgba(144, 19, 254, 0.8)'
        ],
        borderColor: [
            'rgba(102, 126, 234, 1)',
            'rgba(118, 75, 162, 1)',
            'rgba(237, 100, 166, 1)',
            'rgba(144, 19, 254, 1)'
        ]
    }
};

// Esponi la classe globalmente
window.TalonDrillDownChart = TalonDrillDownChart;

// ========================================
// FUNZIONE GLOBALE PER NAVIGAZIONE ATTIVITÀ
// ========================================

/**
 * Naviga alla pagina di dettaglio di un'attività specifica
 * @param {string|number} activityId - ID dell'attività (può includere prefisso "ATT")
 */
window.viewActivityDetails = function(activityId) {
    if (activityId && activityId !== 'null' && activityId !== null && activityId !== '') {
        // Pulisce l'ID rimuovendo eventuali prefissi (es. ATT0382 -> 382)
        let cleanId = activityId;
        if (typeof activityId === 'string' && activityId.startsWith('ATT')) {
            cleanId = activityId.replace(/^ATT0*/, ''); // Rimuove ATT e zeri iniziali
        }
        
        // Verifica che l'ID pulito sia valido
        if (cleanId && cleanId !== '' && !isNaN(cleanId)) {
            // Log per debug
            console.log(`[DrillDown] Navigazione: ${activityId} -> ID pulito: ${cleanId}`);
            
            // Costruisce parametri per mantenere lo stato del drilldown
            const drilldownParams = new URLSearchParams({
                'from': 'drilldown',
                'level': state.currentLevel,
                'period': state.currentPeriod
            });
            
            // Aggiunge parametri specifici del livello (già saranno codificati da URLSearchParams)
            if (state.currentCategory) {
                drilldownParams.set('category', state.currentCategory);
            }
            if (state.currentSubcategory) {
                drilldownParams.set('subcategory', state.currentSubcategory);
            }
            if (state.customStartDate) {
                drilldownParams.set('start_date', state.customStartDate);
            }
            if (state.customEndDate) {
                drilldownParams.set('end_date', state.customEndDate);
            }
            
            // Log dello stato per debug
            console.log(`[DrillDown] Stato corrente:`, {
                level: state.currentLevel,
                category: state.currentCategory,
                subcategory: state.currentSubcategory,
                period: state.currentPeriod
            });
            
            // Navigazione verso la pagina di visualizzazione attività con stato completo
            window.location.href = `/attivita/${cleanId}?${drilldownParams.toString()}`;
        } else {
            console.warn('[DrillDown] Impossibile estrarre ID numerico valido da:', activityId);
        }
    } else {
        console.warn('[DrillDown] ID attività non valido per la navigazione:', activityId);
    }
};

// Modifica il DOMContentLoaded per usare la versione API
document.addEventListener('DOMContentLoaded', function() {
    // Verifica se siamo nel contesto drill-down standalone
    const isDrillDownPage = document.getElementById('drill-down-init');
    
    if (isDrillDownPage) {
        // Inizializza automaticamente se siamo nella pagina drill-down
        initChartWithAPI();
        updateBreadcrumb();
        updateInfoCards();
    }
    
    // Gestione ridimensionamento finestra per il grafico responsive
    let resizeTimeout;
    window.addEventListener('resize', function() {
        if (window.chart) {
            // Usa throttling per evitare troppi ridimensionamenti
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                try {
                    // Forza il ridimensionamento del chart
                    window.chart.resize();
                } catch (error) {
                    console.error('Errore ridimensionamento chart:', error);
                }
            }, 100);
        }
    });
});