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
// FUNZIONI UI HELPER
// ========================================

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
    
    
    let html = '';
    
    // Aggiungi breadcrumb per ogni livello (3 livelli istogramma: 0,1,2)
    if (state.currentLevel === 0) {
        html = '<div class="breadcrumb-item active" data-level="0">ATTIVITÀ</div>';
    } else {
        html = '<div class="breadcrumb-item" data-level="0" onclick="navigateToLevel(0)">ATTIVITÀ</div>';
        
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
        let statsUrl = `/drill-down/api/statistiche?period=${state.currentPeriod}`;
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
        let url = `/drill-down/api/enti-coinvolti?period=${state.currentPeriod}&level=${state.currentLevel}`;
        
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
        let url = `/drill-down/api/statistiche?period=${state.currentPeriod}`;
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
                document.getElementById('totalValue').textContent = result.stats.totale || '0';
                document.getElementById('specificActivitiesValue').textContent = '0'; // Sarà aggiornato dinamicamente
                document.getElementById('entitiesValue').textContent = result.stats.enti || '0'; // Sarà sovrascritto dal calcolo per livello
                
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
// FUNZIONE CHART PRINCIPALE
// ========================================

function initChart(labels, values, chartType = 'bar') {
    const ctx = document.getElementById('chartCanvas');
    if (!ctx) {
        console.error('Canvas element non trovato');
        return;
    }
    
    // Gli stili sono gestiti dal template HTML - non sovrascrivere
    
    ctx.style.display = 'block';
    ctx.style.width = '100%';
    ctx.style.height = 'auto';
    
    // Distruggi chart esistente se presente
    if (window.chart) {
        window.chart.destroy();
    }
    
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
    window.chart = new Chart(ctx, {
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
                }
            }
        }
    });
    
    // Aggiorna UI
    updateBreadcrumb();
    hideLoading();
}

function handleChartClick(event, elements) {
    if (elements.length > 0) {
        const index = elements[0].index;
        const chart = window.chart || this; // Usa this come fallback
        const label = chart.data.labels[index]; // Il label è già pulito dal cleanName
        
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
                <tr>
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
        
        switch(level) {
            case 0:
                url = '/drill-down/api/categorie';
                break;
            case 1:
                url = '/drill-down/api/sottocategorie';
                params.append('categoria', parentLabel);
                break;
            case 2:
                url = '/drill-down/api/enti';
                params.append('sottocategoria', parentLabel);
                break;
            case 3:
                url = '/drill-down/api/dettagli';
                params.append('ente', parentLabel);
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
            
            // Prima prova a caricare da API (per livelli 0→1 e 1→2)
            // Assicuriamoci che il label sia pulito prima di passarlo all'API
            const cleanLabel = cleanName(label);
            data = await loadDataFromAPI(newLevel, cleanLabel);
            
            // Se l'API fallisce, usa i dati mock
            if (!data) {
                // console.log removed for production silence
                
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
            } else {
                // Usa i dati dall'API
                // console.log removed for production silence
                
                if (state.currentLevel === 0) {
                    // Livello 0 → 1: Categorie → Sottocategorie
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
    
    
    const colors = generateColors(data.labels.length);
    
    // Pulisce i nomi dei label rimuovendo "/" iniziali
    window.chart.data.labels = data.labels.map(label => cleanName(label));
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
            
            // Usa la funzione initChart che abbiamo definito
            initChart(data.labels, data.values);
            
            // Aggiorna le info cards per il livello iniziale
            updateInfoCardsForCurrentLevel(data);
            
        } else {
            // Fallback ai dati mock
            initChart();
        }
        
    } catch (error) {
        console.error('Errore inizializzazione con API:', error);
        // Fallback ai dati mock
        initChart();
        
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
        
        // Inizializza il grafico
        this.init();
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