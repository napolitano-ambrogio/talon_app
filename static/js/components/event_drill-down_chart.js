// ========================================
// TALON EVENT DRILL-DOWN CHART COMPONENT
// ========================================

// FUNZIONE DEBUG TEMPORANEA - DA RIMUOVERE IN PRODUZIONE
window.debugTestEventAPI = async function(ente = "184° BATTAGLIONE SOSTEGNO TLC CANSIGLIO") {
    console.log('🧪 [DEBUG TEST] Testando API eventi per:', ente);
    
    // Test diretto della chiamata API
    try {
        const url = `/eventi/api/dettagli?period=year&sottocategoria=tipo_e&ente=${encodeURIComponent(ente)}`;
        console.log('🧪 [DEBUG TEST] URL chiamata:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        console.log('🧪 [DEBUG TEST] Response status:', response.status);
        console.log('🧪 [DEBUG TEST] Response ok:', response.ok);
        
        if (!response.ok) {
            console.error('🧪 [DEBUG TEST] Response non OK:', response.statusText);
            return;
        }
        
        const result = await response.json();
        console.log('🧪 [DEBUG TEST] Response JSON:', result);
        
        if (result.success && result.data) {
            console.log('✅ [DEBUG TEST] API funziona! Eventi trovati:', result.data.length);
            console.log('🧪 [DEBUG TEST] Primo evento:', result.data[0]);
            
            // Test della funzione showEventDetailsTable
            console.log('🧪 [DEBUG TEST] Testando showEventDetailsTable...');
            
            // Verifica elementi DOM prima del test
            const detailsPanel = document.getElementById('eventDetailsPanel');
            const detailsList = document.getElementById('eventDetailsList');
            console.log('🧪 [DEBUG TEST] DOM Check:', {
                detailsPanel: !!detailsPanel,
                detailsList: !!detailsList,
                panelClass: detailsPanel ? detailsPanel.className : 'N/A',
                panelStyle: detailsPanel ? detailsPanel.style.cssText : 'N/A'
            });
            
            showEventDetailsTable(ente, result.data);
            
        } else {
            console.warn('⚠️ [DEBUG TEST] API non ha restituito dati validi');
        }
        
    } catch (error) {
        console.error('🚨 [DEBUG TEST] Errore:', error);
    }
};

// Variabili globali per eventi
let eventChart = null;
let eventState = {
    currentLevel: 0,
    currentPeriod: 'year',
    customStartDate: null,
    customEndDate: null,
    breadcrumb: [],
    currentCategory: null,     // Tipo evento (es. "TIPO A")
    currentSubcategory: null,  // Ente livello 1 (es. "COMANDO COMMISSARIATO")
    currentEntity: null,       // Ente livello 2 per dettagli (es. "ENTE SPECIFICO")
    currentSubDetail: null,
    currentEntityType: null
};

// ========================================
// FUNZIONI UI HELPER - VERSION 1.0
// ========================================

console.log('🚀 EVENT DRILL-DOWN CHART VERSION 1.0 - COMPONENTE EVENTI INIZIALIZZATO!');

function getEventCarattereFiltro() {
    // Ottieni il valore del toggle carattere dal DOM per eventi
    const carattereToggle = document.querySelector('input[name="evento_carattere"]:checked');
    return carattereToggle ? carattereToggle.value : '';
}

function formatEventLabelForChart(label) {
    // Formatta le etichette lunghe per il grafico eventi, dividendole su più righe
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
            lines.push(currentLine);
            currentLine = word;
        }
    });
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    return lines;
}

// ========================================
// CARICAMENTO DATI REALI DA API
// ========================================

async function loadEventDetailsFromAPI(ente) {
    try {
        let params = new URLSearchParams();
        
        // Parametri per i dettagli eventi
        params.append('period', eventState.currentPeriod);
        
        // Aggiungi date personalizzate se presenti
        if (eventState.currentPeriod === 'custom' && eventState.customStartDate && eventState.customEndDate) {
            params.append('start_date', eventState.customStartDate);
            params.append('end_date', eventState.customEndDate);
        }
        
        // Aggiungi filtro carattere se presente (come "categoria" per l'API dettagli)
        const carattereFiltro = getEventCarattereFiltro();
        if (carattereFiltro) {
            params.append('categoria', carattereFiltro); // CORRETTO: API si aspetta 'categoria'
        }
        
        // Aggiungi il tipo evento corrente (come "sottocategoria" per l'API dettagli)
        if (eventState.currentCategory) {
            const tipoEvento = eventState.currentCategory.toLowerCase().replace(' ', '_');
            params.append('sottocategoria', tipoEvento);
        }
        
        // Aggiungi l'ente per cui vogliamo i dettagli
        params.append('ente', ente);
        
        const fullUrl = `/eventi/api/dettagli?${params.toString()}`;
        
        console.log('📡 [Eventi API] Chiamata dettagli:', {
            ente: ente,
            url: fullUrl,
            parametri: {
                period: eventState.currentPeriod,
                carattere: carattereFiltro,
                categoria: eventState.currentCategory,
                sottocategoria: eventState.currentCategory ? eventState.currentCategory.toLowerCase().replace(' ', '_') : 'N/A'
            }
        });
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log('📡 [Eventi API] Risposta dettagli:', {
            success: result.success,
            dataCount: result.data ? result.data.length : 0,
            total: result.total,
            data: result.data ? result.data.slice(0, 2) : null // Prime 2 righe per debug
        });
        
        if (result.success && result.data) {
            return result.data;
        }
        
        console.warn('⚠️ [Eventi API] Nessun dato ricevuto:', result);
        throw new Error(result.error || 'Errore nel caricamento dettagli');
        
    } catch (error) {
        console.error('🚨 Errore caricamento dettagli eventi:', error);
        return null;
    }
}

async function loadEventDataFromAPI(level = 0, parentLabel = null) {
    try {
        let url = '/eventi/api/dashboard-data';
        let params = new URLSearchParams();
        
        // Determina URL in base al livello
        if (level === 1) {
            url = '/eventi/api/enti-livello1';
            // Aggiungi il tipo evento per il filtro livello 1
            if (parentLabel) {
                // Converte "TIPO A" in "tipo_a" per l'API
                const tipoEvento = parentLabel.toLowerCase().replace(' ', '_');
                params.append('tipo_evento', tipoEvento);
            }
        } else if (level === 2) {
            url = '/eventi/api/enti-livello2';
            // Aggiungi il tipo evento e l'ente parent per il filtro livello 2
            if (eventState.currentCategory) {
                const tipoEvento = eventState.currentCategory.toLowerCase().replace(' ', '_');
                params.append('tipo_evento', tipoEvento);
            }
            if (parentLabel) {
                params.append('ente_parent', parentLabel);
            }
        }
        
        // Aggiungi il periodo corrente
        params.append('period', eventState.currentPeriod);
        
        // Aggiungi date personalizzate se presenti
        if (eventState.currentPeriod === 'custom' && eventState.customStartDate && eventState.customEndDate) {
            params.append('start_date', eventState.customStartDate);
            params.append('end_date', eventState.customEndDate);
        }
        
        // Aggiungi filtro carattere se presente
        const carattereFiltro = getEventCarattereFiltro();
        if (carattereFiltro) {
            params.append('carattere_filtro', carattereFiltro);
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Livello 0: formato con result.chart e result.stats
            if (result.chart) {
                return {
                    labels: result.chart.labels,
                    data: result.chart.data,
                    backgroundColor: result.chart.backgroundColor,
                    stats: result.stats
                };
            }
            // Livello 1+: formato con result.data
            else if (result.data) {
                return {
                    labels: result.data.labels,
                    data: result.data.values,
                    backgroundColor: result.data.backgroundColor,
                    stats: null // Livello 1 non ha stats per ora
                };
            }
        }
        
        throw new Error(result.error || 'Errore nel caricamento dati');
        
    } catch (error) {
        console.error('🚨 Errore caricamento dati eventi:', error);
        return null;
    }
}

// ========================================
// FUNZIONI CHART PER EVENTI
// ========================================

// Calcola l'altezza ottimale per il grafico basata sullo spazio disponibile
function calculateOptimalChartHeight() {
    try {
        const mainContent = document.getElementById('main-content');
        const periodSelector = document.querySelector('.period-selector');
        const infoCards = document.querySelector('.info-cards');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        const padding = 60; // Margini e padding vari
        
        if (!mainContent) {
            console.warn('📊 [Chart Height] main-content non trovato, usando altezza di default');
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
        
        console.log('📊 [Chart Height] Calcolo altezza:', {
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
        console.error('📊 [Chart Height] Errore calcolo altezza:', error);
        return 350; // Fallback sicuro
    }
}

function createEventChart(labels, data, backgroundColor, customHeight = null) {
    const canvas = document.getElementById('eventChartCanvas');
    if (!canvas) {
        console.error('Canvas eventi non trovato!');
        return null;
    }

    const ctx = canvas.getContext('2d');
    
    // Distruggi il chart esistente se presente
    if (eventChart) {
        eventChart.destroy();
        eventChart = null;
    }
    
    // Applica altezza personalizzata PRIMA di creare il chart
    if (customHeight) {
        // Imposta altezza sul canvas
        canvas.style.height = customHeight + 'px';
        canvas.height = customHeight; // Imposta anche l'attributo height
        
        // Imposta altezza anche sul contenitore padre per Chart.js
        const chartContainer = canvas.closest('.chart-container');
        if (chartContainer) {
            const containerHeight = customHeight + 40; // +40px per padding del contenitore
            chartContainer.style.height = containerHeight + 'px';
            console.log('📊 [Chart Container] Altezza contenitore impostata PRIMA della creazione chart:', {
                canvasHeight: customHeight + 'px',
                canvasActualHeight: canvas.height,
                containerHeight: containerHeight + 'px',
                containerElement: chartContainer
            });
        } else {
            console.warn('📊 [Chart Container] Contenitore .chart-container non trovato!');
        }
        
        console.log('📊 [Chart Height] Altezza personalizzata applicata PRIMA della creazione:', customHeight + 'px');
    }

    // Plugin personalizzato per i data labels
    const dataLabelsPlugin = {
        id: 'dataLabels',
        afterDatasetsDraw: function(chart, args, options) {
            const ctx = chart.ctx;
            const datasets = chart.data.datasets;
            
            datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                
                ctx.fillStyle = '#333';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                
                meta.data.forEach((bar, index) => {
                    const value = dataset.data[index];
                    if (value && value > 0) {
                        const x = bar.x;
                        const y = bar.y - 8; // 8px sopra la barra
                        ctx.fillText(value.toString(), x, y);
                    }
                });
            });
        }
    };

    eventChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(label => formatEventLabelForChart(label)),
            datasets: [{
                label: 'Eventi',
                data: data,
                backgroundColor: backgroundColor,
                borderColor: backgroundColor.map(color => color.replace('0.8', '1')),
                borderWidth: 2,
                // Configura le barre per essere centrate perfettamente
                barPercentage: 0.8,
                categoryPercentage: 1.0
            }]
        },
        plugins: [dataLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const elementIndex = elements[0].index;
                    const label = labels[elementIndex];
                    handleEventChartClick(label, elementIndex);
                }
            },
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
                    // Aggiunge spazio sopra per le etichette dei dati
                    grace: '10%',
                    ticks: {
                        precision: 0
                    }
                },
                x: {
                    ticks: {
                        // Rotazione dinamica basata sul numero di elementi
                        maxRotation: labels.length > 8 ? 90 : 45,
                        minRotation: labels.length > 8 ? 90 : 0,
                        font: {
                            size: labels.length > 12 ? 10 : 12
                        },
                        // Centra le etichette sotto le barre dell'istogramma
                        align: 'center',
                        // Offset per centrare perfettamente le etichette
                        labelOffset: 0
                    },
                    grid: {
                        // Disabilita l'offset per allineare le etichette al centro delle barre
                        offset: false
                    },
                    // Posiziona l'asse al centro per allineamento perfetto
                    position: 'bottom'
                }
            }
        }
    });
    
    // Log finale per verificare stato del chart
    if (customHeight) {
        const finalCanvas = document.getElementById('eventChartCanvas');
        const finalContainer = finalCanvas ? finalCanvas.closest('.chart-container') : null;
        console.log('📊 [Chart Final State] Stato finale dopo creazione chart:', {
            chartCreated: !!eventChart,
            canvasStyleHeight: finalCanvas ? finalCanvas.style.height : 'N/A',
            canvasActualHeight: finalCanvas ? finalCanvas.height : 'N/A',
            containerStyleHeight: finalContainer ? finalContainer.style.height : 'N/A',
            containerActualHeight: finalContainer ? finalContainer.offsetHeight : 'N/A'
        });
    }

    return eventChart;
}

function handleEventChartClick(label, index) {
    console.log(`🎯 Click su evento: ${label} (index: ${index})`);
    
    if (eventState.currentLevel === 0) {
        // Drill-down al livello 1 - Enti per tipo evento
        console.log(`📊 Drill-down livello 1 - Tipo evento: ${label}`);
        eventState.currentLevel = 1;
        eventState.currentCategory = label;
        eventState.breadcrumb = [{ level: 0, label: 'Tipologie Eventi' }];
        
        updateEventBreadcrumb();
        loadEventLevel1(label);
    } else if (eventState.currentLevel === 1) {
        // Drill-down al livello 2 - Enti dipendenti dall'ente selezionato
        console.log(`📊 Drill-down livello 2 - Ente: ${label}`);
        eventState.currentLevel = 2;
        eventState.currentSubcategory = label;
        
        updateEventBreadcrumb();
        loadEventLevel2(label);
    } else if (eventState.currentLevel === 2) {
        // Drill-down al livello 3 - Tabella dettagli eventi per ente selezionato
        console.log(`📋 Drill-down livello 3 - Dettagli eventi per: ${label}`);
        eventState.currentLevel = 3;
        eventState.currentEntity = label;
        
        updateEventBreadcrumb();
        loadEventLevel3(label);
    } else if (eventState.currentLevel === 3) {
        // Aggiorna tabella dettagli per nuovo ente selezionato (stesso livello)
        console.log(`🔄 Aggiornamento livello 3 - Nuovo ente selezionato: ${label}`);
        eventState.currentEntity = label;
        
        updateEventBreadcrumb();
        loadEventLevel3(label);
    }
}

async function loadEventLevel1(tipoEvento) {
    try {
        console.log(`🔄 Caricamento livello 1 per tipo evento: ${tipoEvento}`);
        
        const apiData = await loadEventDataFromAPI(1, tipoEvento);
        
        if (apiData && apiData.labels && apiData.data) {
            console.log('✅ Dati livello 1 caricati:', apiData);
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(apiData.labels, apiData.data, apiData.backgroundColor, chartHeight);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
        } else {
            console.warn('⚠️ Nessun dato disponibile per livello 1');
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight);
            updateEventInfoCards([0]);
        }
    } catch (error) {
        console.error('🚨 Errore caricamento livello 1:', error);
        const chartHeight = calculateOptimalChartHeight();
        createEventChart(['Errore Caricamento'], [0], ['rgba(255, 0, 0, 0.8)'], chartHeight);
        updateEventInfoCards([0]);
    }
}

async function loadEventLevel2(enteParent) {
    try {
        console.log(`🔄 Caricamento livello 2 per ente: ${enteParent}`);
        
        const apiData = await loadEventDataFromAPI(2, enteParent);
        
        if (apiData && apiData.labels && apiData.data) {
            console.log('✅ Dati livello 2 caricati:', apiData);
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(apiData.labels, apiData.data, apiData.backgroundColor, chartHeight);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
        } else {
            console.warn('⚠️ Nessun dato disponibile per livello 2');
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight);
            updateEventInfoCards([0]);
        }
    } catch (error) {
        console.error('🚨 Errore caricamento livello 2:', error);
        const chartHeight = calculateOptimalChartHeight();
        createEventChart(['Errore Caricamento'], [0], ['rgba(255, 0, 0, 0.8)'], chartHeight);
        updateEventInfoCards([0]);
    }
}

async function loadEventLevel3(ente) {
    try {
        console.log(`🔄 Caricamento livello 3 - dettagli eventi per: ${ente}`);
        console.log(`🔧 Stato corrente:`, {
            currentLevel: eventState.currentLevel,
            currentCategory: eventState.currentCategory,
            currentSubcategory: eventState.currentSubcategory,
            currentEntity: eventState.currentEntity,
            period: eventState.currentPeriod
        });
        
        // Mantieni il grafico visibile e mostra anche la tabella dei dettagli
        const chartContainer = document.querySelector('.chart-container');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        
        console.log(`🎯 Elementi DOM:`, {
            chartContainer: !!chartContainer,
            detailsPanel: !!detailsPanel
        });
        
        // Il grafico rimane visibile
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        // Mostra la tabella dei dettagli sotto il grafico
        if (detailsPanel) {
            detailsPanel.style.display = 'block';
        } else {
            console.error('❌ Elemento eventDetailsPanel non trovato nel DOM');
        }
        
        // Carica i dettagli degli eventi tramite API
        console.log(`📡 [loadEventLevel3] Chiamata API per ente: ${ente}`);
        const detailsData = await loadEventDetailsFromAPI(ente);
        
        console.log(`📊 [loadEventLevel3] Risposta API:`, {
            detailsData: detailsData,
            type: typeof detailsData,
            isArray: Array.isArray(detailsData),
            length: detailsData ? detailsData.length : 'N/A',
            firstItem: detailsData && detailsData[0] ? detailsData[0] : 'N/A'
        });
        
        console.log(`📊 [loadEventLevel3] Risposta API originale:`, {
            detailsData: detailsData,
            isArray: Array.isArray(detailsData),
            length: detailsData ? detailsData.length : 'null'
        });
        
        if (detailsData && Array.isArray(detailsData)) {
            console.log('✅ [loadEventLevel3] Dettagli eventi caricati:', detailsData.length, 'eventi');
            console.log('🎯 [loadEventLevel3] Chiamando showEventDetailsTable con dati validi...');
            showEventDetailsTable(ente, detailsData);
            updateEventBreadcrumb();
        } else if (detailsData === null || detailsData === undefined) {
            console.warn('⚠️ [loadEventLevel3] API ha restituito null/undefined, mostrando tabella vuota');
            showEventDetailsTable(ente, []);
            updateEventBreadcrumb();
        } else {
            console.warn('⚠️ [loadEventLevel3] Dettagli non array:', typeof detailsData, detailsData);
            showEventDetailsTable(ente, []);
            updateEventBreadcrumb();
        }
    } catch (error) {
        console.error('🚨 Errore caricamento livello 3:', error);
        console.error('🚨 Stack trace:', error.stack);
        showEventDetailsTable(ente, []);
        updateEventBreadcrumb();
    }
}

async function resetEventToLevel0() {
    eventState.currentLevel = 0;
    eventState.currentCategory = null;
    eventState.currentSubcategory = null;
    eventState.currentEntity = null;
    eventState.breadcrumb = [];
    
    // Mostra di nuovo il grafico e nascondi la tabella
    const chartContainer = document.querySelector('.chart-container');
    const detailsPanel = document.getElementById('eventDetailsPanel');
    
    if (chartContainer) {
        chartContainer.style.display = 'block';
    }
    
    if (detailsPanel) {
        detailsPanel.style.display = 'none';
    }
    
    updateEventBreadcrumb();
    await initEventChart();
}

// ========================================
// UI UPDATES PER EVENTI
// ========================================

function updateEventBreadcrumb() {
    const breadcrumbContainer = document.getElementById('eventBreadcrumb');
    if (!breadcrumbContainer) return;

    // Trova e preserva il toggle carattere
    const carattereToggle = breadcrumbContainer.querySelector('.carattere-toggle');
    
    // Aggiorna solo la parte breadcrumb, preservando il layout flex
    const breadcrumbContent = breadcrumbContainer.querySelector('#event-chart-breadcrumb');
    if (breadcrumbContent) {
        breadcrumbContent.innerHTML = '';
        
        // Home sempre presente
        const homeItem = document.createElement('div');
        homeItem.className = 'breadcrumb-item active';
        homeItem.setAttribute('data-level', '0');
        homeItem.textContent = 'Tipologie Eventi';
        homeItem.style.cursor = 'pointer';
        homeItem.onclick = resetEventToLevel0;
        breadcrumbContent.appendChild(homeItem);

        // Aggiungi elementi del breadcrumb se siamo in drill-down
        if (eventState.currentLevel > 0) {
            const separator1 = document.createElement('span');
            separator1.className = 'breadcrumb-separator';
            separator1.textContent = ' > ';
            breadcrumbContent.appendChild(separator1);

            if (eventState.currentLevel === 1) {
                // Livello 1: Solo il tipo evento (es. "TIPO A")
                const level1Item = document.createElement('span');
                level1Item.className = 'breadcrumb-item active';
                level1Item.textContent = eventState.currentCategory;
                breadcrumbContent.appendChild(level1Item);
            } else if (eventState.currentLevel === 2) {
                // Livello 1: Tipo evento (cliccabile per tornare)
                const level1Item = document.createElement('span');
                level1Item.className = 'breadcrumb-item';
                level1Item.textContent = eventState.currentCategory;
                level1Item.style.cursor = 'pointer';
                level1Item.onclick = () => navigateToEventLevel1();
                breadcrumbContent.appendChild(level1Item);
                
                // Separator
                const separator2 = document.createElement('span');
                separator2.className = 'breadcrumb-separator';
                separator2.textContent = ' > ';
                breadcrumbContent.appendChild(separator2);
                
                // Livello 2: Nome dell'ente del livello 1 selezionato
                const level2Item = document.createElement('span');
                level2Item.className = 'breadcrumb-item active';
                level2Item.textContent = eventState.currentSubcategory;
                breadcrumbContent.appendChild(level2Item);
            } else if (eventState.currentLevel === 3) {
                // Livello 1: Tipo evento (cliccabile per tornare)
                const level1Item = document.createElement('span');
                level1Item.className = 'breadcrumb-item';
                level1Item.textContent = eventState.currentCategory;
                level1Item.style.cursor = 'pointer';
                level1Item.onclick = () => navigateToEventLevel1();
                breadcrumbContent.appendChild(level1Item);
                
                // Separator
                const separator2 = document.createElement('span');
                separator2.className = 'breadcrumb-separator';
                separator2.textContent = ' > ';
                breadcrumbContent.appendChild(separator2);
                
                // Livello 2: Nome dell'ente del livello 1 selezionato (cliccabile per tornare)
                const level2Item = document.createElement('span');
                level2Item.className = 'breadcrumb-item';
                level2Item.textContent = eventState.currentSubcategory;
                level2Item.style.cursor = 'pointer';
                level2Item.onclick = () => navigateToEventLevel2();
                breadcrumbContent.appendChild(level2Item);
                
                // Separator
                const separator3 = document.createElement('span');
                separator3.className = 'breadcrumb-separator';
                separator3.textContent = ' > ';
                breadcrumbContent.appendChild(separator3);
                
                // Livello 3: Solo il nome dell'ente
                const level3Item = document.createElement('span');
                level3Item.className = 'breadcrumb-item active';
                level3Item.textContent = eventState.currentEntity;
                breadcrumbContent.appendChild(level3Item);
            }
        }
    }
}

function updateEventInfoCards(data, stats = null) {
    // Aggiorna le card informative con dati reali o calcolati
    let totalEvents = 0;
    let categoriesCount = 0;
    let entitiesCount = 0;
    let positiveEvents = 0;
    let negativeEvents = 0;
    
    if (stats) {
        // Usa statistiche dall'API
        totalEvents = stats.totale || 0;
        categoriesCount = stats.tipologie || 0;
        entitiesCount = stats.enti_coinvolti || 0;
        positiveEvents = stats.positivi || 0;
        negativeEvents = stats.negativi || 0;
    } else if (data && Array.isArray(data)) {
        // Calcola dai dati del chart
        totalEvents = data.reduce((sum, value) => sum + value, 0);
        categoriesCount = data.length;
    }
    
    // Aggiorna elementi DOM
    const totalValueEl = document.getElementById('eventTotalValue');
    if (totalValueEl) {
        totalValueEl.textContent = totalEvents;
    }

    const categoriesValueEl = document.getElementById('eventCategoriesValue');
    if (categoriesValueEl) {
        categoriesValueEl.textContent = categoriesCount;
    }
    
    const entitiesValueEl = document.getElementById('eventEntitiesValue');
    if (entitiesValueEl) {
        entitiesValueEl.textContent = entitiesCount;
    }
    
    const positiveValueEl = document.getElementById('eventPositiveValue');
    if (positiveValueEl) {
        positiveValueEl.textContent = positiveEvents;
    }
    
    const negativeValueEl = document.getElementById('eventNegativeValue');
    if (negativeValueEl) {
        negativeValueEl.textContent = negativeEvents;
    }
}

async function navigateToEventLevel1() {
    // Torna al livello 1 mantenendo categoria
    if (eventState.currentCategory) {
        eventState.currentLevel = 1;
        eventState.currentSubcategory = null;
        eventState.currentEntity = null;
        
        // Mostra il grafico e nascondi la tabella (livelli 1-2 non hanno tabella)
        const chartContainer = document.querySelector('.chart-container');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        if (detailsPanel) {
            detailsPanel.style.display = 'none';
        }
        
        updateEventBreadcrumb();
        await loadEventLevel1(eventState.currentCategory);
    }
}

async function navigateToEventLevel2() {
    // Torna al livello 2 mantenendo categoria e subcategory
    if (eventState.currentCategory && eventState.currentSubcategory) {
        eventState.currentLevel = 2;
        eventState.currentEntity = null;
        
        // Mostra il grafico e nascondi la tabella (livelli 1-2 non hanno tabella)
        const chartContainer = document.querySelector('.chart-container');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        if (detailsPanel) {
            detailsPanel.style.display = 'none';
        }
        
        updateEventBreadcrumb();
        await loadEventLevel2(eventState.currentSubcategory);
    }
}

function showEventDetailsTable(ente, details) {
    console.log('🎯 [showEventDetailsTable] CHIAMATA FUNZIONE:', {
        ente: ente,
        detailsType: typeof details,
        detailsLength: details ? details.length : 'N/A',
        detailsIsArray: Array.isArray(details),
        firstDetail: details && details[0] ? details[0] : null
    });
    
    const detailsPanel = document.getElementById('eventDetailsPanel');
    const detailsList = document.getElementById('eventDetailsList');
    
    console.log('🎯 [showEventDetailsTable] DOM Elements:', {
        detailsPanel: !!detailsPanel,
        detailsList: !!detailsList,
        panelDisplay: detailsPanel ? detailsPanel.style.display : 'N/A',
        listInnerHTML: detailsList ? detailsList.innerHTML.length : 'N/A'
    });
    
    if (!detailsPanel || !detailsList) {
        console.error('❌ [showEventDetailsTable] Elementi pannello dettagli eventi non trovati');
        return;
    }
    
    console.log(`📋 [showEventDetailsTable] Visualizzando ${details ? details.length : 0} eventi per ente: ${ente}`);
    
    // Genera ID univoco per evitare conflitti con altre tabelle
    const tableId = 'eventDetailsTable_' + Date.now();
    const topPagId = 'eventTopPag_' + Date.now();
    const bottomPagId = 'eventBottomPag_' + Date.now();
    
    let html = `
        <div class="entity-details-header">
            <h5>Eventi di: <strong>${ente}</strong></h5>
        </div>
        
        <div class="alert alert-info mt-3 mb-3" style="padding: 10px 15px; background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 6px; color: #0c5460; font-size: 0.9rem;">
            <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
            <strong>Suggerimento:</strong> Clicca su una riga per visualizzare i dettagli completi dell'evento
        </div>
        
        <div class="mt-2">
    `;
    
    if (details && details.length > 0) {
        html += `
            <!-- Paginazione superiore -->
            <div class="pagination-wrapper top-pagination" id="${topPagId}">
                <div class="pagination-info">
                    <span id="topPageInfo">Pagina 1 di 1 (${details.length} eventi totali)</span>
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
                                <span class="th-label">Data</span>
                            </th>
                            <th class="sortable" data-column="1" data-sort-type="text">
                                <span class="th-label">Carattere</span>
                            </th>
                            <th class="sortable" data-column="2" data-sort-type="text">
                                <span class="th-label">Evento</span>
                            </th>
                            <th class="sortable" data-column="3" data-sort-type="text">
                                <span class="th-label">Ente Militare</span>
                            </th>
                            <th class="sortable" data-column="4" data-sort-type="text">
                                <span class="th-label">Tipologia Evento</span>
                            </th>
                            <th class="sortable" data-column="5" data-sort-type="text">
                                <span class="th-label">Protocollo</span>
                            </th>
                            <th class="sortable" data-column="6" data-sort-type="text">
                                <span class="th-label">Note</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // Ordina per data messaggio evento (cronologico inverso - più recenti prima)
        const sortedEvents = details.sort((a, b) => {
            // Funzione helper per parsare date italiane
            const parseItalianDate = (dateStr) => {
                if (!dateStr || dateStr === 'N/D') return new Date('1900-01-01');
                
                if (dateStr.includes('/')) {
                    // Formato italiano dd/mm/yyyy
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        const isoDateString = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        return new Date(isoDateString);
                    }
                }
                // Fallback per altri formati
                return new Date(dateStr);
            };
            
            // Usa data_msg_evento per ordinamento, fallback su data_evento
            const dateA = parseItalianDate(a.data_msg_evento || a.data_evento);
            const dateB = parseItalianDate(b.data_msg_evento || b.data_evento);
            return dateB - dateA;
        });
        
        sortedEvents.forEach(event => {
            // Formatta il carattere con colore
            const carattereColor = event.carattere === 'positivo' ? 'success' : 
                                  event.carattere === 'negativo' ? 'danger' : 'secondary';
            
            // Formatta il tipo evento (come badge)
            const tipoEventoFormatted = event.tipo_evento ? 
                event.tipo_evento.toUpperCase().replace('_', ' ') : 'N/D';
            
            // Usa data_msg_evento come data principale, fallback su data_evento
            const dataMsgEvento = event.data_msg_evento || event.data_evento || 'N/D';
            let dataSort = '';
            if (dataMsgEvento && dataMsgEvento !== 'N/D' && dataMsgEvento.includes('/')) {
                // Formato italiano dd/mm/yyyy -> converti in yyyy-mm-dd per Date()
                const parts = dataMsgEvento.split('/');
                if (parts.length === 3) {
                    const isoDateString = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    const parsedDate = new Date(isoDateString);
                    if (!isNaN(parsedDate.getTime())) {
                        dataSort = parsedDate.toISOString();
                    }
                }
            } else if (dataMsgEvento && dataMsgEvento !== 'N/D') {
                // Formato già ISO o altri formati supportati
                const parsedDate = new Date(dataMsgEvento);
                if (!isNaN(parsedDate.getTime())) {
                    dataSort = parsedDate.toISOString();
                }
            }
            
            html += `
                <tr style="cursor: pointer;" class="event-row-clickable" data-event-id="${event.id || event.evento_id}" 
                    onclick="window.location.href='/eventi/visualizza/${event.id || event.evento_id}'" 
                    title="Clicca per visualizzare i dettagli completi dell'evento">
                    <td data-sort="${dataSort}">${dataMsgEvento}</td>
                    <td>
                        <span class="badge bg-${carattereColor}">${(event.carattere || 'N/D').toUpperCase()}</span>
                    </td>
                    <td style="text-align: center;">
                        <span class="badge bg-primary">${tipoEventoFormatted}</span>
                    </td>
                    <td title="${event.ente_nome || 'Ente non specificato'}">${
                        (event.ente_nome && event.ente_nome.length > 50) ? 
                        event.ente_nome.substring(0, 50) + '...' : 
                        event.ente_nome || 'N/D'
                    }</td>
                    <td title="${event.tipologia_descrizione || event.tipologia_nome || 'Nessuna tipologia'}">${
                        (event.tipologia_descrizione && event.tipologia_descrizione.length > 60) ? 
                        event.tipologia_descrizione.substring(0, 60) + '...' : 
                        (event.tipologia_descrizione || event.tipologia_nome || 'N/D')
                    }</td>
                    <td>${event.prot_msg_evento || 'N/D'}</td>
                    <td title="${event.note || 'Nessuna nota'}">${
                        (event.note && event.note.length > 40) ? 
                        event.note.substring(0, 40) + '...' : 
                        event.note || 'N/D'
                    }</td>
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
                    <span id="bottomPageInfo">Pagina 1 di 1 (${details.length} eventi totali)</span>
                </div>
                <div class="pagination-controls" id="bottomPaginationControls">
                    <!-- Controlli generati dinamicamente -->
                </div>
            </div>
        `;
    } else {
        html += '<p class="text-muted">Nessun evento trovato per questo ente nel periodo selezionato.</p>';
    }
    
    html += '</div>';
    
    // Aggiorna il contenuto
    console.log('🎯 [showEventDetailsTable] Aggiornamento DOM:', {
        htmlLength: html.length,
        hasDetails: !!(details && details.length > 0),
        detailsCount: details ? details.length : 0
    });
    
    detailsList.innerHTML = html;
    
    // IMPORTANTE: Mostra il pannello dettagli SOTTO il grafico (non nascondere il grafico)
    console.log('🎯 [showEventDetailsTable] Mostrando pannello dettagli sotto il grafico...');
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
        chartContainer.style.display = 'block'; // Mantieni il grafico visibile
        console.log('📊 Grafico mantenuto visibile');
    }
    
    detailsPanel.style.display = 'block';
    console.log('📋 Pannello dettagli mostrato sotto il grafico');
    
    // Inizializza la tabella avanzata se ci sono dati
    if (details && details.length > 0) {
        // Aspetta che il DOM sia aggiornato prima di inizializzare la tabella
        setTimeout(() => {
            if (typeof window.AdvancedTable !== 'undefined') {
                try {
                    new window.AdvancedTable(tableId, {
                        itemsPerPage: 10,
                        topPaginationId: topPagId,
                        bottomPaginationId: bottomPagId
                    });
                    console.log('✅ Tabella eventi avanzata inizializzata');
                } catch (error) {
                    console.warn('⚠️ Errore inizializzazione tabella avanzata:', error);
                }
            } else {
                console.warn('⚠️ AdvancedTable non disponibile');
            }
        }, 100);
        
        // Nasconde le icone di navigazione che appaiono al hover sulle righe
        setTimeout(() => {
            const tableContainer = document.getElementById(tableId);
            if (tableContainer) {
                // Aggiungi CSS per nascondere le icone di navigazione
                const style = document.createElement('style');
                style.textContent = `
                    #${tableId} .clickable-row:hover::after,
                    #${tableId} .event-row-clickable:hover::after,
                    #${tableId} tr:hover .nav-icon,
                    #${tableId} tr:hover .row-nav-icon,
                    #${tableId} tr:hover .click-indicator {
                        display: none !important;
                    }
                    #${tableId} tr:hover {
                        position: relative;
                    }
                `;
                document.head.appendChild(style);
                console.log('🎨 [showEventDetailsTable] Icone hover nascoste');
            }
        }, 200);
    }
}

// ========================================
// INIZIALIZZAZIONE EVENTI
// ========================================

async function initEventChart() {
    try {
        console.log('🔄 Inizializzazione grafico eventi con dati reali...');
        
        const apiData = await loadEventDataFromAPI(0);
        
        if (apiData && apiData.labels && apiData.data) {
            console.log('✅ Dati API caricati:', apiData);
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(apiData.labels, apiData.data, apiData.backgroundColor, chartHeight);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
        } else {
            console.warn('⚠️ Nessun dato disponibile dall\'API, usando dati vuoti');
            // Dati vuoti di fallback
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight);
            updateEventInfoCards([0]);
            updateEventBreadcrumb();
        }
    } catch (error) {
        console.error('🚨 Errore inizializzazione grafico eventi:', error);
        // Fallback a dati vuoti
        const chartHeight = calculateOptimalChartHeight();
        createEventChart(['Errore Caricamento'], [0], ['rgba(255, 0, 0, 0.8)'], chartHeight);
        updateEventInfoCards([0]);
        updateEventBreadcrumb();
    }
}

// ========================================
// CLASSE PRINCIPALE EVENTI
// ========================================

class TalonEventDrillDownChart {
    constructor(options = {}) {
        this.container = options.container || '.event-dashboard-container';
        this.canvas = options.canvas || 'eventChartCanvas';
        this.period = options.period || 'year';
        
        // Inizializza stato eventi
        eventState.currentPeriod = this.period;
        eventState.currentLevel = 0;
        eventState.breadcrumb = [];
        
        console.log('🎯 TalonEventDrillDownChart inizializzato');
        
        // Aggiungi event listener per ridimensionamento finestra
        this.setupResizeListener();
        
        // Inizializza il grafico eventi
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
        console.log('📏 Event listener resize configurato per grafico eventi');
    }
    
    handleResize() {
        if (eventChart) {
            const newHeight = calculateOptimalChartHeight();
            const canvas = document.getElementById('eventChartCanvas');
            if (canvas && newHeight) {
                canvas.style.height = newHeight + 'px';
                
                // Aggiorna anche il contenitore padre
                const chartContainer = canvas.closest('.chart-container');
                if (chartContainer) {
                    const containerHeight = newHeight + 40; // +40px per padding
                    chartContainer.style.height = containerHeight + 'px';
                }
                
                eventChart.resize(); // Forza Chart.js a ricalcolare le dimensioni
                console.log('📊 [Window Resize] Altezza grafico aggiornata a:', newHeight + 'px');
            }
        }
    }

    async init() {
        console.log('🚀 Inizializzazione grafico eventi...');
        await initEventChart();
    }
    
    async setPeriod(period) {
        eventState.currentPeriod = period;
        eventState.customStartDate = null;
        eventState.customEndDate = null;
        await this.refreshCurrentLevel(); // Mantieni livello corrente
    }
    
    async setCustomPeriod(startDate, endDate) {
        eventState.currentPeriod = 'custom';
        eventState.customStartDate = startDate;
        eventState.customEndDate = endDate;
        await this.refreshCurrentLevel(); // Mantieni livello corrente
    }
    
    async reset() {
        await resetEventToLevel0();
    }
    
    async refreshCurrentLevel() {
        // Ricarica il livello corrente mantenendo lo stato
        console.log(`🔄 Refresh livello ${eventState.currentLevel} con nuovi filtri`);
        
        // Ricalcola altezza prima di refresh per adattarsi a eventuali cambiamenti di layout
        setTimeout(() => {
            if (eventChart) {
                const newHeight = calculateOptimalChartHeight();
                const canvas = document.getElementById('eventChartCanvas');
                if (canvas && newHeight) {
                    canvas.style.height = newHeight + 'px';
                    
                    // Aggiorna anche il contenitore padre
                    const chartContainer = canvas.closest('.chart-container');
                    if (chartContainer) {
                        const containerHeight = newHeight + 40; // +40px per padding
                        chartContainer.style.height = containerHeight + 'px';
                    }
                    
                    eventChart.resize(); // Forza Chart.js a ricalcolare le dimensioni
                }
            }
        }, 100);
        
        if (eventState.currentLevel === 0) {
            // Livello 0: ricarica tipi evento
            await initEventChart();
        } else if (eventState.currentLevel === 1) {
            // Livello 1: ricarica enti per tipo evento corrente
            if (eventState.currentCategory) {
                await loadEventLevel1(eventState.currentCategory);
            }
        } else if (eventState.currentLevel === 2) {
            // Livello 2: ricarica enti dipendenti per ente corrente
            if (eventState.currentSubcategory) {
                await loadEventLevel2(eventState.currentSubcategory);
            }
        } else if (eventState.currentLevel === 3) {
            // Livello 3: ricarica dettagli per ente corrente
            if (eventState.currentEntity) {
                await loadEventLevel3(eventState.currentEntity);
            }
        }
    }
}

// Esporta la classe per uso globale
window.TalonEventDrillDownChart = TalonEventDrillDownChart;

console.log('✅ Event Drill-Down Chart Component caricato con successo!');