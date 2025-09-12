// ========================================
// TALON EVENT DRILL-DOWN CHART COMPONENT
// ========================================


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


function getEventCarattereFiltro() {
    // Ottieni il valore del toggle carattere dal DOM per eventi
    const carattereToggle = document.querySelector('input[name="evento_carattere"]:checked');
    return carattereToggle ? carattereToggle.value : '';
}

function formatEventLabelForChart(label, maxLength = 20, numLabels = 0) {
    // Formatta le etichette lunghe per il grafico eventi con strategia graduata
    if (typeof label !== 'string') {
        return label;
    }
    
    // Strategia graduata basata sul numero di etichette
    let targetMaxLength = maxLength;
    let useMultiline = true;
    
    if (numLabels > 20) {
        // Molti elementi: abbreviazioni aggressive
        targetMaxLength = 12;
        useMultiline = false;
    } else if (numLabels > 15) {
        // Elementi moderati: abbreviazioni moderate
        targetMaxLength = 16;
        useMultiline = true;
    }
    
    // Se l'etichetta è già abbastanza corta
    if (label.length <= targetMaxLength) {
        return label;
    }
    
    // Per molti elementi, usa abbreviazioni intelligenti
    if (!useMultiline) {
        return abbreviateEntityName(label, targetMaxLength);
    }
    
    // Logica multilinea per meno elementi
    const words = label.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
        // Se la parola da sola è più lunga del limite, la tronchiamo
        if (word.length > targetMaxLength) {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
            lines.push(word.substring(0, targetMaxLength - 3) + '...');
        } else if ((currentLine + (currentLine ? ' ' : '') + word).length <= targetMaxLength) {
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

function abbreviateEntityName(entityName, maxLength) {
    // Abbrevia nomi di enti militari in modo intelligente
    if (entityName.length <= maxLength) return entityName;
    
    // Sostituzioni comuni per enti militari
    let abbreviated = entityName
        .replace(/COMANDO/g, 'CMD')
        .replace(/LOGISTICO/g, 'LOG')
        .replace(/DELL'ESERCITO/g, 'EI')
        .replace(/DELL'/g, '')
        .replace(/CASERMA/g, 'CAS')
        .replace(/COMMISSARIATO/g, 'COMM')
        .replace(/REPARTO/g, 'REP')
        .replace(/BATTAGLIONE/g, 'BTG')
        .replace(/REGGIMENTO/g, 'REGG')
        .replace(/COMPAGNIA/g, 'CP')
        .replace(/SEZIONE/g, 'SEZ')
        .replace(/SUPPORTO/g, 'SUPP');
    
    // Se ancora troppo lungo, taglia e aggiungi puntini
    if (abbreviated.length > maxLength) {
        abbreviated = abbreviated.substring(0, maxLength - 3) + '...';
    }
    
    return abbreviated;
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
        
        
        if (result.success && result.data) {
            return result.data;
        }
        
        throw new Error(result.error || 'Errore nel caricamento dettagli');
        
    } catch (error) {
        console.error('🚨 Errore caricamento dettagli eventi:', error);
        return null;
    }
}

async function loadEventDataFromAPI(level = 0, parentLabel = null) {
    try {
        // Rileva vista attiva dal DOM per decisioni sui dati
        function getActiveViewFromDOM() {
            const tipologieView = document.getElementById('chartViewTipologie');
            const entiView = document.getElementById('chartViewEnti');
            
            // Vista tipologie è attiva se ha classe 'active' o è l'unica visibile
            if (tipologieView && tipologieView.classList.contains('active')) {
                return 'tipologie';
            }
            // Vista enti è attiva se ha classe 'active' e display è block
            if (entiView && entiView.classList.contains('active') && entiView.style.display === 'block') {
                return 'enti';
            }
            // Default: tipologie (vista iniziale)
            return 'tipologie';
        }
        
        const activeViewType = getActiveViewFromDOM();
        
        let url = '/eventi/api/dashboard-data';
        let params = new URLSearchParams();
        
        // Determina URL in base alla vista attiva e al livello
        if (activeViewType === 'enti') {
            // Vista per-ente: usa endpoint specifico per dati stacked
            if (level === 0) {
                // Prova prima l'endpoint stacked, fallback su enti-livello1
                url = '/eventi/api/enti-stacked'; // Endpoint ideale per dati stacked per tipo evento
                // Se l'endpoint non esiste, loadEventDataFromAPI gestirà il fallback
            } else if (level === 1) {
                url = '/eventi/api/enti-stacked'; // Usa endpoint stacked per drill-down livello 1
                if (parentLabel) {
                    // Passa il nome dell'ente - il backend convertirà in ID
                    params.append('ente_parent_nome', parentLabel);
                    console.log(`[DRILL-DOWN] Level 1 - Using stacked endpoint with ente_parent_nome=${parentLabel}`);
                }
            } else if (level === 2) {
                url = '/eventi/api/enti-stacked'; // Usa endpoint stacked per drill-down livello 2
                if (parentLabel) {
                    // Level 2: mostra figli dell'ente selezionato al livello 1
                    params.append('ente_parent_nome', parentLabel);
                    console.log(`[DRILL-DOWN] Level 2 - Using stacked endpoint with ente_parent_nome=${parentLabel}`);
                }
            } else if (level === 3) {
                url = '/eventi/api/enti-stacked'; // Usa endpoint stacked per drill-down livello 3
                if (parentLabel) {
                    // Level 3: mostra eventi dell'ente specifico suddivisi per tipo evento
                    params.append('ente_specifico_nome', parentLabel);
                    params.append('livello_3', 'true'); // Indica che vogliamo tipi evento, non enti
                    console.log(`[DRILL-DOWN] Level 3 - Using stacked endpoint for event types of ente: ${parentLabel}`);
                }
            }
        } else {
            // Vista tipologie (comportamento originale)
            if (level === 1) {
                url = '/eventi/api/enti-livello1';
                // Aggiungi il tipo evento per il filtro livello 1
                if (parentLabel) {
                    // Converte "TIPO A" in "tipo_a" per l'API
                    const tipoEvento = parentLabel.toLowerCase().replace(' ', '_');
                    params.append('tipo_evento', tipoEvento);
                }
                // Richiedi esplicitamente le statistiche di carattere per il livello 1 vista tipologie
                params.append('include_character_stats', 'true');
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
            } else if (level === 3) {
                // NUOVO: Livello 3 - Dati temporali aggregati per un ente specifico
                url = '/eventi/api/dettagli';
                // Usa l'API dettagli ma richiedi aggregazione per il grafico
                if (eventState.currentCategory) {
                    const tipoEvento = eventState.currentCategory.toLowerCase().replace(' ', '_');
                    params.append('sottocategoria', tipoEvento);
                }
                if (parentLabel) {
                    params.append('ente', parentLabel);
                }
                // Richiedi dati aggregati per il grafico
                params.append('aggregate_for_chart', 'true');
                params.append('level', '3');
                console.log('📊 [loadEventDataFromAPI] Richiesta dati grafico per livello 3 con aggregate_for_chart=true');
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
            // Usa parametro diverso in base all'endpoint
            if (url === '/eventi/api/dashboard-data') {
                params.append('carattere_filtro', carattereFiltro);
                console.log('🔧 [loadEventDataFromAPI] Aggiunto filtro carattere per dashboard-data:', carattereFiltro);
            } else {
                // Per altri endpoint dell'API /eventi/api/dettagli usa 'categoria'
                params.append('categoria', carattereFiltro);
                console.log('🔧 [loadEventDataFromAPI] Aggiunto filtro carattere:', carattereFiltro, 'come categoria');
            }
        }
        
        const fullUrl = `${url}?${params.toString()}`;
        
        // DEBUG CRITICO: Verifica parametri per livello 0 vista tipologie 
        if (activeViewType === 'tipologie' && level === 0) {
            console.log('🔍 [loadEventDataFromAPI] DEBUG Livello 0 Tipologie:', {
                url: fullUrl,
                carattereFiltro: carattereFiltro,
                hasCarattereFiltro: !!carattereFiltro,
                params: params.toString()
            });
        }
        
        // DEBUG CRITICO: Verifica parametri per livello 1 vista tipologie
        if (activeViewType === 'tipologie' && level === 1) {
        }
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            // Se l'endpoint stacked non esiste, prova fallback per vista enti
            if (eventState.viewType === 'enti' && level === 0 && url.includes('enti-stacked')) {
                url = '/eventi/api/enti-livello1';
                const fallbackUrl = `${url}?${params.toString()}`;
                
                const fallbackResponse = await fetch(fallbackUrl, {
                    method: 'GET',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json'
                    }
                });
                
                if (fallbackResponse.ok) {
                    const fallbackResult = await fallbackResponse.json();
                    // Trasforma i dati in formato stacked simulato
                    return transformDataForStackedChart(fallbackResult);
                }
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // DEBUG CRITICO: Verifica risposta per livello 3 con aggregate_for_chart
        if (level === 3 && result.chart_data === true) {
            console.log('📊 [loadEventDataFromAPI] Ricevuti dati aggregati per grafico livello 3:', {
                labels: result.labels?.length || 0,
                data: result.data?.length || 0,
                backgroundColor: result.backgroundColor?.length || 0,
                chart_data_flag: result.chart_data
            });
            
            // Restituisci direttamente i dati per il grafico
            return {
                labels: result.labels || [],
                data: result.data || [],
                backgroundColor: result.backgroundColor || [],
                stats: result.stats || null,
                chart_data: true
            };
        }
        
        // DEBUG CRITICO: Verifica risposta per livello 1 vista tipologie
        if (activeViewType === 'tipologie' && level === 1) {
        }
        
        if (result.success) {
            // Vista enti (tutti i livelli): controlla se sono dati già in formato stacked
            if (activeViewType === 'enti') {
                // Se l'endpoint stacked restituisce dati già formattati
                if (result.stackedData) {
                    return {
                        labels: result.stackedData.labels,
                        data: result.stackedData.totals,
                        backgroundColor: result.stackedData.backgroundColor,
                        breakdown: result.stackedData.breakdown, // Dati per tipo evento
                        stats: result.stats,
                        isStacked: true
                    };
                }
                // Altrimenti trasforma i dati normali in formato stacked per tutti i livelli
                return transformDataForStackedChart(result);
            }
            
            // Vista per tipo evento: comportamento normale
            // Livello 0: formato con result.chart e result.stats
            if (result.chart && result.chart.labels && result.chart.data) {
                return {
                    labels: result.chart.labels || [],
                    data: result.chart.data || [],
                    backgroundColor: result.chart.backgroundColor || [],
                    stats: result.stats
                };
            }
            // Livello 1+: formato con result.data
            else if (result.data && result.data.labels && result.data.values) {
                return {
                    labels: result.data.labels || [],
                    data: result.data.values || [],
                    backgroundColor: result.data.backgroundColor || [],
                    stats: result.stats || null
                };
            }
            
            // Se nessun formato riconosciuto, fallback con dati vuoti
            console.error('🚨 Formato dati API non riconosciuto:', result);
            return {
                labels: ['Nessun Dato'],
                data: [0],
                backgroundColor: ['rgba(200, 200, 200, 0.8)'],
                stats: null
            };
        }
        
        throw new Error(result.error || 'Errore nel caricamento dati');
        
    } catch (error) {
        console.error('🚨 Errore caricamento dati eventi:', error);
        return null;
    }
}

function transformDataForStackedChart(apiResult) {
    // Trasforma dati dell'API in formato compatibile con stacked chart
    
    let labels = [];
    let totals = [];
    let backgroundColor = [];
    let breakdown = {};
    
    // Verifica se abbiamo già i dati stacked dall'endpoint dedicato
    if (apiResult.stackedData) {
        console.log('📊 [transformDataForStackedChart] Usando dati reali dall\'endpoint stacked');
        console.log('🔍 [DEBUG] API Result completo:', apiResult);
        console.log('🔍 [DEBUG] stackedData:', apiResult.stackedData);
        console.log('🔍 [DEBUG] stats:', apiResult.stats);
        console.log('🔍 [DEBUG] labels:', apiResult.stackedData.labels);
        console.log('🔍 [DEBUG] totals:', apiResult.stackedData.totals);
        console.log('🔍 [DEBUG] breakdown:', apiResult.stackedData.breakdown);
        return {
            labels: apiResult.stackedData.labels,
            data: apiResult.stackedData.totals,
            backgroundColor: apiResult.stackedData.backgroundColor,
            breakdown: apiResult.stackedData.breakdown,
            stats: apiResult.stats,
            isStacked: true
        };
    }
    
    // Fallback: estrai i dati dal formato API normale
    if (apiResult.chart) {
        labels = apiResult.chart.labels;
        totals = apiResult.chart.data;
        backgroundColor = apiResult.chart.backgroundColor;
    } else if (apiResult.data) {
        labels = apiResult.data.labels;
        totals = apiResult.data.values;
        backgroundColor = apiResult.data.backgroundColor;
    }
    
    console.log('⚠️ [transformDataForStackedChart] Fallback: simulando distribuzione per tipo evento');
    
    // Simula la distribuzione per tipo evento (distribuzione realistica)
    breakdown = {};
    const tipiEvento = ['TIPO A', 'TIPO B', 'TIPO C', 'TIPO D', 'TIPO E'];
    
    labels.forEach((ente, index) => {
        const total = totals[index] || 0;
        breakdown[ente] = {};
        
        if (total > 0) {
            // Distribuzione simulata realistica (non uniforme)
            // TIPO A: 30%, TIPO B: 25%, TIPO C: 20%, TIPO D: 15%, TIPO E: 10%
            const percentages = [0.30, 0.25, 0.20, 0.15, 0.10];
            let remaining = total;
            
            tipiEvento.forEach((tipo, tipoIndex) => {
                if (tipoIndex === tipiEvento.length - 1) {
                    // Ultimo tipo: assegna tutto il rimanente
                    breakdown[ente][tipo] = remaining;
                } else {
                    const value = Math.floor(total * percentages[tipoIndex]);
                    breakdown[ente][tipo] = value;
                    remaining -= value;
                }
            });
        } else {
            // Ente senza eventi
            tipiEvento.forEach(tipo => {
                breakdown[ente][tipo] = 0;
            });
        }
    });
    
    
    return {
        labels: labels,
        data: totals,
        backgroundColor: backgroundColor,
        breakdown: breakdown,
        stats: apiResult.stats,
        isStacked: true
    };
}

// ========================================
// FUNZIONI CHART PER EVENTI
// ========================================

// Calcola l'altezza ottimale per il grafico basata sullo spazio disponibile
function calculateOptimalChartHeight(numLabels = 0) {
    try {
        const mainContent = document.getElementById('main-content');
        const periodSelector = document.querySelector('.period-selector');
        const infoCards = document.querySelector('.info-cards');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        const padding = 60; // Margini e padding vari
        
        if (!mainContent) {
                        return 350; // Default fallback
        }
        
        let availableHeight = mainContent.offsetHeight;
        
        // Sottrai altezza degli altri elementi
        if (periodSelector) availableHeight -= periodSelector.offsetHeight;
        if (infoCards) availableHeight -= infoCards.offsetHeight;
        if (detailsPanel && detailsPanel.style.display !== 'none') {
            availableHeight -= 300; // Spazio per la tabella dettagli
        }
        
        // Calcola altezza dinamica basata sul numero di etichette
        let baseHeight = Math.floor(window.innerHeight * 0.45); // Base 45% viewport
        let minHeight = 250;
        let maxHeight = 700;
        
        // Aumento dell'altezza basato sul numero di etichette per garantire spazio per etichette verticali
        if (numLabels > 25) {
            minHeight = 500; // Aumento significativo per molti elementi
            maxHeight = 900;
            baseHeight = Math.floor(window.innerHeight * 0.60);
        } else if (numLabels > 15) {
            minHeight = 450; // Più spazio per etichette verticali
            maxHeight = 750;
            baseHeight = Math.floor(window.innerHeight * 0.55);
        } else if (numLabels >= 11) {
            minHeight = 400; // Spazio per etichette verticali da 11 elementi
            maxHeight = 650;
            baseHeight = Math.floor(window.innerHeight * 0.50);
        } else if (numLabels >= 5) {
            minHeight = 350; // Spazio per font ridotto
            baseHeight = Math.floor(window.innerHeight * 0.48);
        }
        
        const conservativeHeight = Math.max(
            minHeight, // Minimo dinamico per leggibilità
            Math.min(
                Math.floor((availableHeight - padding) * 0.5),
                baseHeight,
                maxHeight // Massimo dinamico
            )
        );
        
        const chartHeight = conservativeHeight;
        
        
        return chartHeight;
    } catch (error) {
        console.error('📊 [Chart Height] Errore calcolo altezza:', error);
        return 350; // Fallback sicuro
    }
}

function createGroupedEventChart(canvas, labels, groupedData, backgroundColor, customHeight = null) {
    // Crea un grafico a barre raggruppate per la vista per-ente
    const ctx = canvas.getContext('2d');
    
    // Distruggi il chart esistente se presente
    if (eventChart) {
        eventChart.destroy();
        eventChart = null;
    }
    
    // Prepara i dataset per ogni tipo di evento
    const tipiEvento = ['TIPO A', 'TIPO B', 'TIPO C', 'TIPO D', 'TIPO E'];
    const colorMap = {
        'TIPO A': '#FF6384',
        'TIPO B': '#36A2EB', 
        'TIPO C': '#FFCE56',
        'TIPO D': '#4BC0C0',
        'TIPO E': '#9966FF'
    };
    
    const datasets = tipiEvento.map(tipo => {
        const data = labels.map(ente => {
            // Trova i dati per questo ente e tipo
            const enteData = groupedData.find(item => item.ente === ente);
            return enteData && enteData.breakdown ? (enteData.breakdown[tipo] || 0) : 0;
        });
        
        return {
            label: tipo,
            data: data,
            backgroundColor: colorMap[tipo],
            borderColor: colorMap[tipo],
            borderWidth: 1
        };
    });
    
    // Applica altezza personalizzata
    if (customHeight) {
        canvas.style.height = customHeight + 'px';
        canvas.height = customHeight;
        
        const chartContainer = canvas.closest('.chart-container');
        if (chartContainer) {
            const containerHeight = customHeight + 40;
            chartContainer.style.height = containerHeight + 'px';
        }
    }
    
    eventChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    stacked: false
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            onClick: function(event, elements) {
                if (elements.length > 0) {
                    const elementIndex = elements[0].index;
                    const clickedLabel = labels[elementIndex];
                    handleEventChartClick(clickedLabel, 1); // Drill-down al livello 1 per questo ente
                }
            }
        }
    });
    
    return eventChart;
}

function createStackedEventChart(canvas, labels, stackedData, customHeight = null) {
    // Crea un grafico a barre impilate per la vista per-ente
    const ctx = canvas.getContext('2d');
    
    // Distruggi il chart esistente se presente
    if (eventChart) {
        eventChart.destroy();
        eventChart = null;
    }
    
    
    // Definizione dei tipi evento e colori
    const tipiEvento = ['TIPO A', 'TIPO B', 'TIPO C', 'TIPO D', 'TIPO E'];
    const colorMap = {
        'TIPO A': '#FF6384',
        'TIPO B': '#36A2EB', 
        'TIPO C': '#FFCE56',
        'TIPO D': '#4BC0C0',
        'TIPO E': '#9966FF'
    };
    
    // Prepara i dataset per ogni tipo di evento (stacked)
    const datasets = tipiEvento.map(tipo => {
        const data = labels.map(ente => {
            // Trova i dati per questo ente e tipo
            if (stackedData && stackedData.breakdown) {
                const enteData = stackedData.breakdown[ente];
                // CORREZIONE: Converti "TIPO A" -> "tipo_a" per match con database
                const tipoKey = tipo.toLowerCase().replace(' ', '_'); // TIPO A -> tipo_a
                const value = enteData ? (enteData[tipoKey] || 0) : 0;
                return value;
            }
            // Fallback: distribuzione simulata basata sui totali
            const index = labels.indexOf(ente);
            let simulatedValue = 0;
            if (stackedData && stackedData.totals && stackedData.totals[index]) {
                // Distribuzione simulata: 20% per ogni tipo evento
                simulatedValue = Math.floor(stackedData.totals[index] / 5);
            }
            return simulatedValue;
        });
        
        return {
            label: tipo,
            data: data,
            backgroundColor: colorMap[tipo],
            borderColor: colorMap[tipo],
            borderWidth: 1,
            stack: 'Stack 0' // Tutti i dataset nello stesso stack per impilamento
        };
    });
    
    // Applica altezza personalizzata
    if (customHeight) {
        canvas.style.height = customHeight + 'px';
        canvas.height = customHeight;
        
        const chartContainer = canvas.closest('.chart-container');
        if (chartContainer) {
            const containerHeight = customHeight + 40;
            chartContainer.style.height = containerHeight + 'px';
        }
    }
    
    // Per i grafici stacked, usiamo sempre 'bar'
    const chartType = 'bar';
    
    console.log(`📈 [createStackedEventChart] Creazione grafico stacked tipo: ${chartType} (dati stacked per ente)`);
    
    // Configurazione Chart.js - sempre bar per stacked charts
    eventChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels.map(label => formatEventLabelForChart(label, 20, labels.length)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    bottom: labels.length >= 11 ? 80 : labels.length >= 5 ? 60 : 40 // Spazio extra per etichette verticali
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    stacked: true, // Abilita stacking sull'asse X
                    ticks: {
                        maxRotation: labels.length > 8 ? 90 : 45,
                        minRotation: labels.length > 8 ? 90 : 0,
                        font: {
                            size: labels.length > 12 ? 10 : 12
                        }
                    }
                },
                y: {
                    stacked: true, // Abilita stacking sull'asse Y
                    beginAtZero: true,
                    grace: '10%',
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: {
                            size: 12
                        },
                        usePointStyle: true
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        afterTitle: function() {
                            return 'Clicca per dettagli ente';
                        },
                        footer: function(tooltipItems) {
                            let total = 0;
                            tooltipItems.forEach(function(tooltipItem) {
                                total += tooltipItem.parsed.y;
                            });
                            return 'Totale: ' + total + ' eventi';
                        }
                    }
                }
            },
            onClick: function(event, elements) {
                if (elements.length > 0) {
                    const elementIndex = elements[0].index;
                    const clickedLabel = labels[elementIndex];
                    handleEventChartClick(clickedLabel, 1); // Drill-down al livello 1 per questo ente
                }
            }
        }
    });
    
    return eventChart;
}

function createEventChart(labels, dataOrObject, backgroundColor, customHeight = null, forceCanvasId = null) {
    // CRITICO: Non creare chart se il sistema modulare è attivo per evitare conflitti
    if (window.TALON_MODULAR_SYSTEM_ACTIVE) {
        console.log('🚧 [createEventChart] Sistema modulare attivo, delegando al sistema modulare');
        return null;
    }
    
    // Validazione input
    if (!labels || !Array.isArray(labels) || labels.length === 0) {
        console.error('🚨 [createEventChart] Labels non valide:', labels);
        return null;
    }
    
    if (!dataOrObject) {
        console.error('🚨 [createEventChart] Dati non forniti');
        return null;
    }
    
    // Funzione helper per determinare vista attiva dal DOM  
    function getActiveViewFromDOM() {
        const tipologieView = document.getElementById('chartViewTipologie');
        const entiView = document.getElementById('chartViewEnti');
        
        // Vista tipologie è attiva se ha classe 'active' o è l'unica visibile
        if (tipologieView && tipologieView.classList.contains('active')) {
            return 'tipologie';
        }
        // Vista enti è attiva se ha classe 'active' e display è block
        if (entiView && entiView.classList.contains('active') && entiView.style.display === 'block') {
            return 'enti';
        }
        // Default: tipologie (vista iniziale)
        return 'tipologie';
    }
    
    // Determina quale canvas usare in base alla vista effettivamente attiva nel DOM o usa quello forzato
    const activeViewType = getActiveViewFromDOM();
    
    // Sincronizza lo stato globale con la vista DOM attiva
    if (eventState.viewType !== activeViewType) {
        eventState.viewType = activeViewType;
    }
    
    const canvasId = forceCanvasId || (activeViewType === 'enti' ? 'eventEntiChartCanvas' : 'eventChartCanvas');
    
    
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('🚨 [createEventChart] Canvas eventi non trovato:', canvasId, 'Vista corrente:', eventState.viewType);
        // Fallback: prova l'altro canvas
        const fallbackCanvasId = canvasId === 'eventEntiChartCanvas' ? 'eventChartCanvas' : 'eventEntiChartCanvas';
        const fallbackCanvas = document.getElementById(fallbackCanvasId);
        if (fallbackCanvas) {
            return createEventChart(labels, dataOrObject, backgroundColor, customHeight, fallbackCanvasId);
        }
        return null;
    }
    
    
    const ctx = canvas.getContext('2d');
    
    // Gestisci sia oggetti completi che array semplici
    let data, isStackedData = false, breakdownData = null, isTimeSeriesData = false;
    
    if (Array.isArray(dataOrObject)) {
        // Caso legacy: array semplice
        data = dataOrObject;
    } else if (typeof dataOrObject === 'object' && dataOrObject !== null) {
        // Caso nuovo: oggetto completo
        data = dataOrObject.data || dataOrObject;
        isStackedData = dataOrObject.isStacked || false;
        breakdownData = dataOrObject.breakdown || null;
        isTimeSeriesData = dataOrObject.chart_data === true; // Indica dati temporali aggregati (livello 3)
        
        console.log('📊 [createEventChart] Tipo dati rilevato:', {
            isStackedData,
            isTimeSeriesData,
            hasBreakdown: !!breakdownData,
            chartDataFlag: dataOrObject.chart_data
        });
    } else {
        console.error('🚨 [createEventChart] Tipo dati non supportato:', typeof dataOrObject);
        return null;
    }
    
    // Validazione array data
    if (!Array.isArray(data)) {
        console.error('🚨 [createEventChart] Array data non valido:', data);
        return null;
    }
    
    // Assicura che data e labels abbiano la stessa lunghezza
    if (data.length !== labels.length) {
        console.error('🚨 [createEventChart] Mismatch lunghezza:', { labels: labels.length, data: data.length });
    }
    
    // Per la vista enti a TUTTI i livelli, controlla se abbiamo dati stacked
    if (activeViewType === 'enti') {
        // Se sono disponibili dati stacked (con breakdown per tipo evento)
        if (isStackedData && breakdownData) {
            return createStackedEventChart(canvas, labels, {totals: data, breakdown: breakdownData}, customHeight);
        }
        // Altrimenti usa il grafico normale per gli enti
    }
    
    // Distruggi il chart esistente se presente (incluso quello dal sistema modulare)
    if (eventChart) {
        eventChart.destroy();
        eventChart = null;
    }
    
    // CRITICO: Controlla anche i chart dei moduli (tipologie-view)
    if (window.TalonEventiTipologieView && window.TalonEventiTipologieView.state.chart) {
        console.log('🧹 [createEventChart] Distruggendo chart del modulo tipologie per evitare conflitto canvas');
        window.TalonEventiTipologieView.state.chart.destroy();
        window.TalonEventiTipologieView.state.chart = null;
    }
    
    // Controllo aggiuntivo: verifica Chart.js instances sul canvas
    try {
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            console.log('🧹 [createEventChart] Trovato chart Chart.js esistente, distruggendo...');
            existingChart.destroy();
        }
    } catch (error) {
        // Chart.getChart potrebbe non essere disponibile in versioni più vecchie
        console.warn('⚠️ [createEventChart] Chart.getChart non disponibile:', error.message);
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
        } else {
        }
        
    }

    // Plugin ottimizzato per i data labels - performance migliorata
    const dataLabelsPlugin = {
        id: 'dataLabels',
        afterDatasetsDraw: function(chart, args, options) {
            // Skip se troppi elementi per performance
            if (chart.data.labels.length > 50) return;
            
            const ctx = chart.ctx;
            const datasets = chart.data.datasets;
            
            // Ottimizzazione: imposta stili una sola volta
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            
            datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                
                meta.data.forEach((bar, index) => {
                    const value = dataset.data[index];
                    if (value && value > 0) {
                        ctx.fillText(value.toString(), bar.x, bar.y - 8);
                    }
                });
            });
        }
    };

    // Determina tipo di grafico in base ai dati
    const chartType = isTimeSeriesData ? 'line' : 'bar';
    
    console.log(`📈 [createEventChart] Creazione grafico tipo: ${chartType} ${isTimeSeriesData ? '(dati temporali)' : '(dati categoriali)'}`);
    
    // Configurazione dataset in base al tipo di grafico
    const dataset = isTimeSeriesData ? {
        // Dataset per grafico a linee temporale (livello 3)
        label: 'Tendenza Eventi',
        data: data,
        backgroundColor: 'rgba(79, 172, 254, 0.2)', // Più trasparente per area sotto la linea
        borderColor: 'rgba(79, 172, 254, 1)',
        borderWidth: 3, // Linea più spessa per migliore visibilità
        fill: true, // Area sotto la linea
        tension: 0.4, // Curve smussate
        pointBackgroundColor: 'rgba(79, 172, 254, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6, // Punti più grandi per migliore interattività
        pointHoverRadius: 8
    } : {
        // Dataset per grafico a barre standard
        label: 'Eventi',
        data: data,
        backgroundColor: backgroundColor,
        borderColor: backgroundColor.map(color => color.replace('0.8', '1')),
        borderWidth: 2,
        barPercentage: 0.8,
        categoryPercentage: 1.0
    };
    
    eventChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels.map(label => formatEventLabelForChart(label, 20, labels.length)),
            datasets: [dataset]
        },
        plugins: isTimeSeriesData ? [] : [dataLabelsPlugin], // Rimuovi data labels per grafici a linee
        options: isTimeSeriesData ? {
            // Opzioni specifiche per grafico temporale a linee
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            onClick: (event, elements) => {
                // Per grafici temporali, click disabled per evitare drill-down inappropriato
                console.log('📊 [TimeSeriesChart] Click su periodo:', elements);
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        color: '#333'
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(79, 172, 254, 1)',
                    borderWidth: 1,
                    callbacks: {
                        title: function(context) {
                            return 'Periodo: ' + context[0].label;
                        },
                        label: function(context) {
                            return 'Eventi: ' + context.parsed.y;
                        },
                        afterBody: function(tooltipItems) {
                            const currentValue = tooltipItems[0].parsed.y;
                            const dataIndex = tooltipItems[0].dataIndex;
                            
                            if (dataIndex > 0) {
                                const previousValue = data[dataIndex - 1];
                                const change = currentValue - previousValue;
                                const changeText = change > 0 ? `+${change}` : `${change}`;
                                const trend = change > 0 ? '↗️' : change < 0 ? '↘️' : '➡️';
                                return [`Variazione: ${changeText} ${trend}`];
                            }
                            return [];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'category',
                    title: {
                        display: true,
                        text: 'Periodo',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Numero Eventi',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        precision: 0,
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        } : {
            // Opzioni per grafici a barre standard
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            parsing: true,
            layout: {
                padding: {
                    bottom: labels.length >= 11 ? 80 : labels.length >= 5 ? 60 : 40
                }
            },
            interaction: {
                intersect: false,
                mode: 'nearest'
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
                    enabled: true,
                    mode: 'nearest',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.y;
                        }
                    }
                },
                decimation: {
                    enabled: labels.length > 100,
                    algorithm: 'lttb',
                    samples: Math.min(labels.length, 50),
                    threshold: labels.length * 2
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '10%',
                    ticks: {
                        precision: 0,
                        maxTicksLimit: 8
                    }
                },
                x: {
                    ticks: {
                        maxRotation: labels.length >= 11 ? 90 : labels.length > 8 ? 45 : 0,
                        minRotation: labels.length >= 11 ? 90 : labels.length > 8 ? 45 : 0,
                        font: {
                            size: labels.length > 25 ? 8 : labels.length > 20 ? 9 : labels.length > 15 ? 10 : labels.length >= 5 ? 11 : 12
                        },
                        align: 'center',
                        labelOffset: 0,
                        maxTicksLimit: labels.length <= 50 ? undefined : 50,
                        autoSkip: labels.length > 50,
                        autoSkipPadding: 5
                    },
                    grid: {
                        offset: false
                    },
                    position: 'bottom'
                }
            }
        }
    });
    
    console.log(`✨ [createEventChart] Grafico ${chartType} creato con successo per ${labels.length} punti dati`);
    
    // Chart ottimizzato con best practices implementate

    return eventChart;
}

function handleEventChartClick(label, index) {
    
    if (eventState.viewType === 'enti') {
        // Vista enti: drill-down gerarchico attraverso gli enti
        if (eventState.currentLevel === 0) {
            // Drill-down al livello 1 - Ente selezionato + figli
            eventState.currentLevel = 1;
            eventState.currentEntity = label;
            eventState.breadcrumb = [{ level: 0, label: 'Vista Enti' }];
            
            updateEventBreadcrumb();
            loadEntiLevel1(label);
        } else if (eventState.currentLevel === 1) {
            // Drill-down al livello 2 - Ente selezionato + figli
            eventState.currentLevel = 2;
            eventState.currentSubcategory = label;
            
            updateEventBreadcrumb();
            loadEntiLevel2(label);
        } else if (eventState.currentLevel === 2) {
            // Drill-down al livello 3 - Tipi evento per ente selezionato
            eventState.currentLevel = 3;
            eventState.currentEntity = label;
            
            updateEventBreadcrumb();
            loadEntiLevel3(label);
        } else if (eventState.currentLevel === 3) {
            // Al livello 3, click su tipo evento - al momento non gestito
            console.log('🔄 [handleEventChartClick] Click su tipo evento al livello 3:', label);
        }
    } else {
        // Vista tipologie: comportamento originale
        if (eventState.currentLevel === 0) {
            // Drill-down al livello 1 - Enti per tipo evento
            eventState.currentLevel = 1;
            eventState.currentCategory = label;
            eventState.breadcrumb = [{ level: 0, label: 'Tipologie Eventi' }];
            
            updateEventBreadcrumb();
            loadEventLevel1(label);
        } else if (eventState.currentLevel === 1) {
            // Drill-down al livello 2 - Enti dipendenti dall'ente selezionato
            eventState.currentLevel = 2;
            eventState.currentSubcategory = label;
            
            updateEventBreadcrumb();
            loadEventLevel2(label);
        } else if (eventState.currentLevel === 2) {
            // Drill-down al livello 3 - Tabella dettagli eventi per ente selezionato
            eventState.currentLevel = 3;
            eventState.currentEntity = label;
            
            updateEventBreadcrumb();
            loadEventLevel3(label);
        } else if (eventState.currentLevel === 3) {
            // Aggiorna tabella dettagli per nuovo ente selezionato (stesso livello)
            eventState.currentEntity = label;
            
            updateEventBreadcrumb();
            loadEventLevel3(label);
        }
    }
}

async function loadEventLevel1(tipoEvento) {
    try {
        
        const apiData = await loadEventDataFromAPI(1, tipoEvento);
        
        if (apiData && apiData.labels && apiData.data) {
            const chartHeight = calculateOptimalChartHeight(apiData.labels.length);
            // CORREZIONE: Passa l'oggetto completo invece del solo array data
            createEventChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
        } else {
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
        
        const apiData = await loadEventDataFromAPI(2, enteParent);
        
        if (apiData && apiData.labels && apiData.data) {
            const chartHeight = calculateOptimalChartHeight(apiData.labels.length);
            // CORREZIONE: Passa l'oggetto completo invece del solo array data
            createEventChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
        } else {
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
        console.log('🔄 [loadEventLevel3] Caricamento completo per ente:', ente);
        
        // Mantieni il grafico visibile e mostra anche la tabella dei dettagli
        const chartContainer = document.querySelector('.chart-container');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        
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
        
        // NUOVO: Carica sia il grafico che la tabella dettagli
        const [graphData, detailsData] = await Promise.all([
            loadEventDataFromAPI(3, ente),  // Dati per il grafico al livello 3
            loadEventDetailsFromAPI(ente)   // Dettagli per la tabella
        ]);
        
        // Carica il grafico se abbiamo dati
        console.log('📊 [loadEventLevel3] Dati grafico ricevuti:', {
            hasGraphData: !!graphData,
            hasLabels: graphData?.labels ? graphData.labels.length : 0,
            hasData: graphData?.data ? graphData.data.length : 0,
            chartDataFlag: graphData?.chart_data,
            graphData: graphData
        });
        
        if (graphData && graphData.labels && graphData.data) {
            console.log('✅ [loadEventLevel3] Caricamento grafico con dati:', {
                labels: graphData.labels.length,
                data: graphData.data.length,
                totalEvents: graphData.data.reduce((sum, value) => sum + value, 0),
                backgroundColors: graphData.backgroundColor?.length || 0
            });
            
            const chartHeight = calculateOptimalChartHeight(graphData.labels.length);
            createEventChart(graphData.labels, graphData, graphData.backgroundColor, chartHeight);
            
            // NUOVO: Aggiorna le info cards con i dati del grafico
            console.log('📋 [loadEventLevel3] PRIMA di updateEventInfoCards - Dati che sto passando:', {
                dataArray: graphData.data,
                dataSum: graphData.data.reduce((sum, val) => sum + val, 0),
                statsObject: graphData.stats,
                hasStats: !!graphData.stats,
                statsKeys: graphData.stats ? Object.keys(graphData.stats) : [],
                statsValues: graphData.stats,
                hasTotalEvents: graphData.stats && ('total_events' in graphData.stats),
                totalEventsValue: graphData.stats?.total_events,
                level: eventState.currentLevel,
                entity: eventState.currentEntity
            });
            
            // NUOVO: Usa funzione dedicata per livello 3 che calcola direttamente dai dati
            updateLevel3InfoCards(graphData, detailsData);
            
            console.log('📋 [loadEventLevel3] DOPO updateLevel3InfoCards - Verifica valori DOM:', {
                totalValue: document.getElementById('eventTotalValue')?.textContent || 'ELEMENTO_NON_TROVATO',
                categoriesValue: document.getElementById('eventCategoriesValue')?.textContent || 'ELEMENTO_NON_TROVATO',
                entitiesValue: document.getElementById('eventEntitiesValue')?.textContent || 'ELEMENTO_NON_TROVATO',
                positiveValue: document.getElementById('eventPositiveValue')?.textContent || 'ELEMENTO_NON_TROVATO',
                negativeValue: document.getElementById('eventNegativeValue')?.textContent || 'ELEMENTO_NON_TROVATO'
            });
        } else {
            console.warn('❌ [loadEventLevel3] Nessun dato grafico disponibile:', {
                reason: !graphData ? 'No graphData' : !graphData.labels ? 'No labels' : !graphData.data ? 'No data' : 'Unknown',
                graphData: graphData
            });
            
            // Mantieni le info cards aggiornate anche senza grafico usando dati disponibili
            updateLevel3InfoCards(graphData, detailsData);
        }
        
        // Carica la tabella dettagli
        if (detailsData && Array.isArray(detailsData)) {
            console.log('📋 [loadEventLevel3] Caricamento tabella con', detailsData.length, 'eventi');
            showEventDetailsTable(ente, detailsData);
        } else {
            console.warn('⚠️ [loadEventLevel3] Nessun dettaglio disponibile');
            showEventDetailsTable(ente, []);
        }
        
        updateEventBreadcrumb();
        
    } catch (error) {
        console.error('🚨 Errore caricamento livello 3:', error);
        console.error('🚨 Stack trace:', error.stack);
        showEventDetailsTable(ente, []);
        updateEventBreadcrumb();
    }
}

// FUNZIONI DRILL-DOWN VISTA ENTI
// ========================================

async function loadEntiLevel1(enteNome) {
    try {
        console.log('🏢 [loadEntiLevel1] Caricamento livello 1 per ente:', enteNome);
        
        // Carica ente selezionato + figli tramite API stacked
        const apiData = await loadEventDataFromAPI(1, enteNome);
        
        if (apiData && apiData.labels && apiData.data) {
            const chartHeight = calculateOptimalChartHeight(apiData.labels.length);
            // Specifica il canvas corretto per vista enti
            const canvasId = 'eventEntiChartCanvas';
            createEventChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight, canvasId);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
            console.log('✅ [loadEntiLevel1] Livello 1 caricato con', apiData.labels.length, 'enti');
        } else {
            const chartHeight = calculateOptimalChartHeight();
            const canvasId = 'eventEntiChartCanvas';
            createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight, canvasId);
            updateEventInfoCards([0]);
            updateEventBreadcrumb();
        }
    } catch (error) {
        console.error('🚨 Errore caricamento enti livello 1:', error);
        const chartHeight = calculateOptimalChartHeight();
        const canvasId = 'eventEntiChartCanvas';
        createEventChart(['Errore Caricamento'], [0], ['rgba(255, 0, 0, 0.8)'], chartHeight, canvasId);
        updateEventInfoCards([0]);
        updateEventBreadcrumb();
    }
}

async function loadEntiLevel2(enteNome) {
    try {
        console.log('🏢 [loadEntiLevel2] Caricamento livello 2 per ente:', enteNome);
        
        // Carica ente selezionato + figli tramite API stacked
        const apiData = await loadEventDataFromAPI(2, enteNome);
        
        if (apiData && apiData.labels && apiData.data) {
            const chartHeight = calculateOptimalChartHeight(apiData.labels.length);
            // Specifica il canvas corretto per vista enti
            const canvasId = 'eventEntiChartCanvas';
            createEventChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight, canvasId);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
            console.log('✅ [loadEntiLevel2] Livello 2 caricato con', apiData.labels.length, 'enti');
        } else {
            const chartHeight = calculateOptimalChartHeight();
            const canvasId = 'eventEntiChartCanvas';
            createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight, canvasId);
            updateEventInfoCards([0]);
            updateEventBreadcrumb();
        }
    } catch (error) {
        console.error('🚨 Errore caricamento enti livello 2:', error);
        const chartHeight = calculateOptimalChartHeight();
        const canvasId = 'eventEntiChartCanvas';
        createEventChart(['Errore Caricamento'], [0], ['rgba(255, 0, 0, 0.8)'], chartHeight, canvasId);
        updateEventInfoCards([0]);
        updateEventBreadcrumb();
    }
}

async function loadEntiLevel3(enteNome) {
    try {
        console.log('🏢 [loadEntiLevel3] Caricamento livello 3 (tipi evento) per ente:', enteNome);
        
        // Mantieni il grafico visibile e mostra anche la tabella dei dettagli
        const chartContainer = document.querySelector('.chart-container');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        if (detailsPanel) {
            detailsPanel.style.display = 'block';
        }
        
        // Carica sia il grafico (tipi evento) che la tabella dettagli
        const [graphData, detailsData] = await Promise.all([
            loadEventDataFromAPI(3, enteNome),  // Dati per il grafico al livello 3 (tipi evento)
            loadEventDetailsFromAPI(enteNome)   // Dettagli per la tabella
        ]);
        
        // Carica il grafico se abbiamo dati
        console.log('📊 [loadEntiLevel3] Dati grafico ricevuti:', {
            hasGraphData: !!graphData,
            hasLabels: graphData?.labels ? graphData.labels.length : 0,
            hasData: graphData?.data ? graphData.data.length : 0
        });
        
        if (graphData && graphData.labels && graphData.data) {
            console.log('✅ [loadEntiLevel3] Caricamento grafico tipi evento per ente:', {
                labels: graphData.labels.length,
                data: graphData.data.length,
                totalEvents: graphData.data.reduce((sum, value) => sum + value, 0)
            });
            
            const chartHeight = calculateOptimalChartHeight(graphData.labels.length);
            // Specifica il canvas corretto per vista enti
            const canvasId = 'eventEntiChartCanvas';
            createEventChart(graphData.labels, graphData, graphData.backgroundColor, chartHeight, canvasId);
            
            // Usa funzione dedicata per livello 3
            updateLevel3InfoCards(graphData, detailsData);
        } else {
            console.warn('❌ [loadEntiLevel3] Nessun dato grafico disponibile');
            const chartHeight = calculateOptimalChartHeight();
            const canvasId = 'eventEntiChartCanvas';
            createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight, canvasId);
            updateLevel3InfoCards(graphData, detailsData);
        }
        
        // Carica la tabella dettagli
        if (detailsData && Array.isArray(detailsData)) {
            console.log('📋 [loadEntiLevel3] Caricamento tabella con', detailsData.length, 'eventi');
            showEventDetailsTable(enteNome, detailsData);
        } else {
            console.warn('⚠️ [loadEntiLevel3] Nessun dettaglio disponibile');
            showEventDetailsTable(enteNome, []);
        }
        
        updateEventBreadcrumb();
        
    } catch (error) {
        console.error('🚨 Errore caricamento enti livello 3:', error);
        showEventDetailsTable(enteNome, []);
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
    
    // Gestisce entrambe le viste
    if (eventState.viewType === 'enti') {
        const drillDownChart = window.eventDrillDownChart;
        if (drillDownChart && drillDownChart.viewType === 'enti') {
            await drillDownChart.initEntiChart();
        } else {
            // Fallback per vista enti
            await initEventChart();
        }
    } else {
        // Vista tipologie
        await initEventChart();
    }
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
        
        // Home sempre presente - diverso per vista enti vs tipologie
        const homeItem = document.createElement('div');
        homeItem.className = 'breadcrumb-item active';
        homeItem.setAttribute('data-level', '0');
        
        if (eventState.viewType === 'enti') {
            homeItem.textContent = 'Vista Enti';
            homeItem.onclick = resetEventToEntiLevel0;
        } else {
            homeItem.textContent = 'Tipologie Eventi';
            homeItem.onclick = resetEventToLevel0;
        }
        
        homeItem.style.cursor = 'pointer';
        breadcrumbContent.appendChild(homeItem);

        // Aggiungi elementi del breadcrumb se siamo in drill-down
        if (eventState.currentLevel > 0) {
            const separator1 = document.createElement('span');
            separator1.className = 'breadcrumb-separator';
            separator1.textContent = ' > ';
            breadcrumbContent.appendChild(separator1);

            if (eventState.viewType === 'enti') {
                // Vista enti: gestione breadcrumb per enti
                if (eventState.currentLevel === 1) {
                    // Livello 1: Nome ente selezionato
                    const level1Item = document.createElement('span');
                    level1Item.className = 'breadcrumb-item active';
                    level1Item.textContent = eventState.currentEntity;
                    breadcrumbContent.appendChild(level1Item);
                } else if (eventState.currentLevel === 2) {
                    // Livello 1: Nome ente (cliccabile)
                    const level1Item = document.createElement('span');
                    level1Item.className = 'breadcrumb-item';
                    level1Item.textContent = eventState.currentEntity;
                    level1Item.style.cursor = 'pointer';
                    level1Item.onclick = () => navigateToEntiLevel1();
                    breadcrumbContent.appendChild(level1Item);
                    
                    // Separator
                    const separator2 = document.createElement('span');
                    separator2.className = 'breadcrumb-separator';
                    separator2.textContent = ' > ';
                    breadcrumbContent.appendChild(separator2);
                    
                    // Livello 2: Nome dell'ente del livello 2
                    const level2Item = document.createElement('span');
                    level2Item.className = 'breadcrumb-item active';
                    level2Item.textContent = eventState.currentSubcategory;
                    breadcrumbContent.appendChild(level2Item);
                } else if (eventState.currentLevel === 3) {
                    // Livello 1: Nome ente (cliccabile)
                    const level1Item = document.createElement('span');
                    level1Item.className = 'breadcrumb-item';
                    level1Item.textContent = eventState.currentEntity;
                    level1Item.style.cursor = 'pointer';
                    level1Item.onclick = () => navigateToEntiLevel1();
                    breadcrumbContent.appendChild(level1Item);
                    
                    // Separator
                    const separator2 = document.createElement('span');
                    separator2.className = 'breadcrumb-separator';
                    separator2.textContent = ' > ';
                    breadcrumbContent.appendChild(separator2);
                    
                    // Livello 2: Nome dell'ente del livello 2 (cliccabile)
                    const level2Item = document.createElement('span');
                    level2Item.className = 'breadcrumb-item';
                    level2Item.textContent = eventState.currentSubcategory;
                    level2Item.style.cursor = 'pointer';
                    level2Item.onclick = () => navigateToEntiLevel2();
                    breadcrumbContent.appendChild(level2Item);
                    
                    // Separator
                    const separator3 = document.createElement('span');
                    separator3.className = 'breadcrumb-separator';
                    separator3.textContent = ' > ';
                    breadcrumbContent.appendChild(separator3);
                    
                    // Livello 3: Tipi Evento
                    const level3Item = document.createElement('span');
                    level3Item.className = 'breadcrumb-item active';
                    level3Item.textContent = 'Tipi Evento';
                    breadcrumbContent.appendChild(level3Item);
                }
            } else {
                // Vista tipologie: comportamento originale
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
}

function updateEventInfoCards(data, stats = null) {
    // Rileva vista attiva per calcoli corretti
    function getActiveViewFromDOM() {
        const tipologieView = document.getElementById('chartViewTipologie');
        const entiView = document.getElementById('chartViewEnti');
        
        if (tipologieView && tipologieView.style.display !== 'none' && tipologieView.classList.contains('active')) {
            return 'tipologie';
        }
        if (entiView && entiView.style.display !== 'none') {
            return 'enti';
        }
        return eventState.viewType; // fallback
    }
    
    const activeViewType = getActiveViewFromDOM();
    
    // Aggiorna le card informative con dati reali o calcolati
    
    let totalEvents = 0;
    let categoriesCount = 0;
    let entitiesCount = 0;
    let positiveEvents = 0;
    let negativeEvents = 0;
    
    if (stats) {
        // Usa statistiche dall'API - preferite quando disponibili
        // CORREZIONE CRITICA: Per livello 0 tipologie, calcola totalEvents dai dati reali dell'array
        if (activeViewType === 'tipologie' && eventState.currentLevel === 0 && 
            data && Array.isArray(data) && (!stats.total_events || stats.total_events === 0)) {
            // Calcola dai dati reali del grafico per il livello 0
            totalEvents = data.reduce((sum, value) => sum + value, 0);
            console.log('✅ [updateEventInfoCards] Livello 0 - totalEvents calcolato dai dati reali invece che da stats:', totalEvents);
        } else {
            totalEvents = stats.total_events || 0;
        }
        
        positiveEvents = stats.positive_events || 0;
        negativeEvents = stats.negative_events || 0;
        
        // Per tipologie e enti, usa logic specifica per livello
        if (activeViewType === 'tipologie' && eventState.currentLevel === 0) {
            // Livello 0: statistiche globali di tutto il sistema
            categoriesCount = data && Array.isArray(data) ? data.length : (stats.tipologie || 0); // Priorità ai dati del grafico
            entitiesCount = stats.enti_coinvolti || 0;
            
            // CORREZIONE: Calcola eventi positivi/negativi dai dati reali per il livello 0
            if ((positiveEvents === 0 && negativeEvents === 0) || 
                (!stats.positive_events && !stats.negative_events)) {
                
                console.log('🔄 [updateEventInfoCards] Livello 0 - Caricamento eventi carattere dai dati reali...');
                
                // Usa la stessa logica del livello 1, ma senza filtro per categoria specifica
                calculateCharacterDataFromEventDetails().then(characterData => {
                    if (characterData) {
                        console.log('✅ [updateEventInfoCards] Livello 0 - Dati carattere ricevuti:', characterData);
                        
                        const positiveValueEl = document.getElementById('eventPositiveValue');
                        const negativeValueEl = document.getElementById('eventNegativeValue');
                        
                        if (positiveValueEl) {
                            positiveValueEl.textContent = characterData.positivi || 0;
                            console.log('✅ [updateEventInfoCards] Livello 0 - Eventi positivi aggiornati:', characterData.positivi || 0);
                        }
                        if (negativeValueEl) {
                            negativeValueEl.textContent = characterData.negativi || 0;
                            console.log('✅ [updateEventInfoCards] Livello 0 - Eventi negativi aggiornati:', characterData.negativi || 0);
                        }
                    } else {
                        console.warn('⚠️ [updateEventInfoCards] Livello 0 - Nessun dato carattere disponibile');
                    }
                }).catch(error => {
                    console.error('🚨 [updateEventInfoCards] Livello 0 - Errore caricamento dati carattere:', error);
                });
            }
        } else if (activeViewType === 'tipologie' && eventState.currentLevel === 1) {
            // Livello 1: statistiche specifiche per la tipologia selezionata
            categoriesCount = 1; // Una sola tipologia selezionata (es. "TIPO A")
            entitiesCount = stats.enti_coinvolti || 0; // Enti che hanno questa tipologia specifica
            
            // VERIFICA CRITICA: le stats dovrebbero essere filtrate per tipologia
            
            // PROBLEMA POTENZIALE: se questi valori sono uguali al livello 0, l'API non sta filtrando
            if (eventState.currentLevel === 1 && !stats._filtered_by_tipologia) {
                console.error('🚨 [updateEventInfoCards] PROBLEMA: Le stats del livello 1 non sembrano filtrate per tipologia!', {
                    tipologia: eventState.currentCategory,
                    statsRicevute: stats
                });
            }
        } else if (activeViewType === 'tipologie' && eventState.currentLevel === 2) {
            // Livello 2: drill-down su ente specifico per una tipologia
            categoriesCount = 1; // Una sola tipologia (ereditata dal livello 1)  
            entitiesCount = 1;   // Un solo ente specifico selezionato
            // Per positivi/negativi, usa stats se disponibili ma potrebbero essere filtrate per ente
        } else if (activeViewType === 'tipologie' && eventState.currentLevel > 2) {
            // Livelli superiori: dettaglio eventi individuali
            categoriesCount = 1; // Una sola tipologia
            entitiesCount = 1;   // Un solo ente
            // Per positivi/negativi, usa stats se disponibili
        } else {
            // Altri livelli: usa le stats come fornite
            categoriesCount = stats.tipologie || 0;
            entitiesCount = stats.enti_coinvolti || 0;
        }
        
        
        // Per livello 1 vista tipologie - CARICA DATI REALI
        if (activeViewType === 'tipologie' && eventState.currentLevel === 1 && 
            (positiveEvents === 0 && negativeEvents === 0) && totalEvents > 0 && eventState.currentCategory) {
            
            // Carica dati carattere reali in background
            loadRealCharacterDataForCategory(eventState.currentCategory).then(characterData => {
                if (characterData && (characterData.positivi > 0 || characterData.negativi > 0)) {
                    // Aggiorna le info cards con i dati reali
                    const positiveValueEl = document.getElementById('eventPositiveValue');
                    const negativeValueEl = document.getElementById('eventNegativeValue');
                    
                    if (positiveValueEl) {
                        positiveValueEl.textContent = characterData.positivi;
                    }
                    if (negativeValueEl) {
                        negativeValueEl.textContent = characterData.negativi;
                    }
                }
            }).catch(error => {
                console.error('🚨 [updateEventInfoCards] Errore caricamento dati carattere:', error);
            });
        }
    } else if (data && Array.isArray(data)) {
        // Calcola dai dati del chart per TUTTI i livelli e viste
        totalEvents = data.reduce((sum, value) => sum + value, 0);
        
        // Logica specifica per altri livelli della vista tipologie
        if (activeViewType === 'tipologie' && eventState.currentLevel === 1) {
            // Livello 1 vista tipologie: ogni elemento data è un ente per una tipologia specifica
            categoriesCount = 1; // Una sola tipologia selezionata
            entitiesCount = data.length; // Numero di enti che hanno questa tipologia
            
            // Carica dati carattere reali se disponibili
            if (eventState.currentCategory) {
                loadRealCharacterDataForCategory(eventState.currentCategory).then(characterData => {
                    if (characterData) {
                        const positiveValueEl = document.getElementById('eventPositiveValue');
                        const negativeValueEl = document.getElementById('eventNegativeValue');
                        
                        if (positiveValueEl) {
                            positiveValueEl.textContent = characterData.positivi || 0;
                        }
                        if (negativeValueEl) {
                            negativeValueEl.textContent = characterData.negativi || 0;
                        }
                    }
                }).catch(error => {
                    console.error('🚨 [updateEventInfoCards] Errore caricamento dati carattere (fallback):', error);
                });
            }
        } else if (activeViewType === 'tipologie' && eventState.currentLevel === 2) {
            // Livello 2: drill-down su ente specifico per una tipologia
            categoriesCount = 1; // Una sola tipologia (ereditata dal livello 1)
            // CORREZIONE: Al livello 2, data.length rappresenta il numero di enti dipendenti mostrati nel grafico
            entitiesCount = data.length;  // Numero di enti dipendenti (incluso il parent)
            // data array contiene un elemento per ogni ente dipendente mostrato nel grafico
            console.log('✅ [updateEventInfoCards] Livello 2 - Info cards corrette:', {
                level: eventState.currentLevel,
                tipologie: categoriesCount,
                enti: entitiesCount,
                eventiMostratiNelGrafico: data.reduce((sum, value) => sum + value, 0),
                entiDipendentiMostratiNelGrafico: data.length
            });
            
            // Per il livello 2, i caratteri devono essere calcolati dai dati mostrati nel grafico
            // Non dalle API esterne che potrebbero restituire dati dell'intera tipologia
            // IMPORTANTE: positivi + negativi deve = totalEvents (data.reduce sum)
            if (eventState.currentCategory && eventState.currentSubcategory) {
                calculateCharacterDataFromCurrentGraphData(data, eventState.currentCategory, eventState.currentSubcategory).then(characterData => {
                    if (characterData) {
                        const positiveValueEl = document.getElementById('eventPositiveValue');
                        const negativeValueEl = document.getElementById('eventNegativeValue');
                        
                        if (positiveValueEl) {
                            positiveValueEl.textContent = characterData.positivi || 0;
                        }
                        if (negativeValueEl) {
                            negativeValueEl.textContent = characterData.negativi || 0;
                        }
                        
                        // Verifica coerenza matematica
                        const sommaTotale = (characterData.positivi || 0) + (characterData.negativi || 0);
                        const totaleEventi = data.reduce((sum, value) => sum + value, 0);
                        
                        console.log('✅ [updateEventInfoCards] Livello 2 - Caratteri aggiornati (dai dati grafico):', {
                            ente: eventState.currentSubcategory,
                            tipologia: eventState.currentCategory,
                            positivi: characterData.positivi,
                            negativi: characterData.negativi,
                            sommaCaratteri: sommaTotale,
                            totaleEventiGrafico: totaleEventi,
                            coerente: sommaTotale === totaleEventi
                        });
                        
                        if (sommaTotale !== totaleEventi) {
                            console.warn('⚠️ [updateEventInfoCards] INCOERENZA DATI - Verifica necessaria:', {
                                sommaCaratteri: sommaTotale,
                                totaleEventiGrafico: totaleEventi,
                                differenza: Math.abs(sommaTotale - totaleEventi),
                                possibileCausa: 'Eventi senza carattere definito o filtri non allineati'
                            });
                        } else {
                            console.log('✅ [updateEventInfoCards] Dati coerenti - caratteri e eventi allineati');
                        }
                    }
                }).catch(error => {
                    console.error('🚨 [updateEventInfoCards] Errore calcolo caratteri da dati grafico livello 2:', error);
                });
            }
        } else if (activeViewType === 'tipologie' && eventState.currentLevel === 3) {
            // Livello 3: Dettaglio temporale per ente specifico
            categoriesCount = 1; // Una sola tipologia (ereditata dal livello 1)
            entitiesCount = 1;   // Un solo ente specifico (livello 2 -> 3)
            
            // IMPORTANTE: Per livello 3, il totale eventi deve essere calcolato correttamente
            // Se i dati sono temporali, la somma dei valori mensili è il totale
            
            // DEBUG CRITICO: Analisi completa dell'oggetto stats
            console.log('🔍 [updateEventInfoCards] Livello 3 - DEBUG COMPLETO stats:', {
                statsExists: !!stats,
                statsType: typeof stats,
                statsKeys: stats ? Object.keys(stats) : [],
                statsValues: stats,
                hasTotalEvents: stats && ('total_events' in stats),
                hasTotale: stats && ('totale' in stats),
                totalEventsValue: stats?.total_events,
                totaleValue: stats?.totale,
                hasCharacterStats: stats && ('character_stats' in stats),
                characterStatsContent: stats?.character_stats
            });
            
            if (data && Array.isArray(data) && data.length > 0) {
                const totalFromTemporalData = data.reduce((sum, value) => sum + value, 0);
                
                console.log('🧮 [updateEventInfoCards] Livello 3 - Calcolo totalEvents:', {
                    totalFromTemporalData: totalFromTemporalData,
                    condizione1: stats && stats.total_events,
                    valore1: stats?.total_events,
                    condizione2: stats && stats.totale,
                    valore2: stats?.totale
                });
                
                // CORRETTO: Controlla prima stats.total_events (dal backend livello 3), poi stats.totale, infine usa temporale
                if (stats && stats.total_events) {
                    totalEvents = stats.total_events;
                    console.log('✅ [updateEventInfoCards] Usando stats.total_events:', totalEvents);
                } else if (stats && stats.totale) {
                    totalEvents = stats.totale;
                    console.log('✅ [updateEventInfoCards] Usando stats.totale:', totalEvents);
                } else {
                    totalEvents = totalFromTemporalData;
                    console.log('✅ [updateEventInfoCards] Usando totalFromTemporalData:', totalEvents);
                }
            } else if (stats && (stats.total_events || stats.totale)) {
                totalEvents = stats.total_events || stats.totale;
                console.log('✅ [updateEventInfoCards] Usando stats (nessun data array):', totalEvents);
            }
            
            console.log('📊 [updateEventInfoCards] Livello 3 - Calcolo totale eventi:', {
                level: eventState.currentLevel,
                entity: eventState.currentEntity,
                category: eventState.currentCategory,
                dataLength: data?.length || 0,
                dataValues: data,
                temporalSum: data ? data.reduce((sum, value) => sum + value, 0) : 0,
                statsTotale: stats?.totale || 0,
                statsTotalEvents: stats?.total_events || 0,
                statsComplete: stats,
                finalTotal: totalEvents,
                hasStats: !!stats,
                positiveEventsVar: positiveEvents,
                negativeEventsVar: negativeEvents
            });
            
            // Per livello 3, usa le statistiche dal backend se disponibili
            // IMPORTANTE: Non usare calculateCharacterDataFromCurrentGraphData perché i dati sono temporali
            // CORRETTO: Gestisce anche stats.character_stats dal backend livello 3
            const characterStats = stats?.character_stats || stats;
            if (characterStats && (characterStats.positivi !== undefined || characterStats.negativi !== undefined)) {
                console.log('✅ [updateEventInfoCards] Livello 3 - Uso character stats:', characterStats);
                
                positiveEvents = characterStats.positivi || 0;
                negativeEvents = characterStats.negativi || 0;
                
                const positiveValueEl = document.getElementById('eventPositiveValue');
                const negativeValueEl = document.getElementById('eventNegativeValue');
                
                if (positiveValueEl) {
                    positiveValueEl.textContent = positiveEvents;
                }
                if (negativeValueEl) {
                    negativeValueEl.textContent = negativeEvents;
                }
            } else {
                console.log('🔄 [updateEventInfoCards] Livello 3 - Stats non disponibili o incomplete, carico da API dettagli...', {
                    stats: stats,
                    hasCharacterStats: stats && stats.character_stats,
                    hasDirectPositivi: stats && stats.positivi !== undefined,
                    hasDirectNegativi: stats && stats.negativi !== undefined,
                    characterStats: stats?.character_stats,
                    totalFromData: data ? data.reduce((sum, value) => sum + value, 0) : 0
                });
                
                // Fallback: carica dati carattere dall'API dettagli (non dal grafico temporale)
                if (eventState.currentCategory && eventState.currentEntity) {
                    // Inline function per caricare caratteri da API dettagli
                    (async () => {
                        try {
                            const params = new URLSearchParams();
                            params.append('period', eventState.currentPeriod);
                            params.append('sottocategoria', eventState.currentCategory.toLowerCase().replace(' ', '_'));
                            params.append('ente', eventState.currentEntity);
                            params.append('level', '3');
                            
                            const carattereFiltro = getEventCarattereFiltro();
                            if (carattereFiltro) {
                                params.append('categoria', carattereFiltro);
                            }
                            
                            const response = await fetch(`/eventi/api/dettagli?${params.toString()}`, {
                                headers: {
                                    'X-Requested-With': 'XMLHttpRequest',
                                    'Accept': 'application/json'
                                }
                            });
                            
                            if (response.ok) {
                                const result = await response.json();
                                
                                if (result.success) {
                                    // Aggiorna il totale eventi se necessario
                                    const totalValueEl = document.getElementById('eventTotalValue');
                                    if (totalValueEl && result.total && result.total > 0) {
                                        totalValueEl.textContent = result.total;
                                        console.log('✅ [updateEventInfoCards] Livello 3 - Totale aggiornato da API:', result.total);
                                    }
                                    
                                    // Aggiorna caratteri
                                    if (result.character_stats) {
                                        const positiveValueEl = document.getElementById('eventPositiveValue');
                                        const negativeValueEl = document.getElementById('eventNegativeValue');
                                        
                                        if (positiveValueEl) {
                                            positiveValueEl.textContent = result.character_stats.positivi || 0;
                                        }
                                        if (negativeValueEl) {
                                            negativeValueEl.textContent = result.character_stats.negativi || 0;
                                        }
                                        
                                        console.log('✅ [updateEventInfoCards] Livello 3 - Caratteri caricati da API dettagli:', {
                                            positivi: result.character_stats.positivi,
                                            negativi: result.character_stats.negativi,
                                            totale: result.character_stats.totale || result.total
                                        });
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('🚨 [updateEventInfoCards] Errore caricamento caratteri livello 3:', error);
                        }
                    })();
                }
            }
        } else if (activeViewType === 'tipologie' && eventState.currentLevel > 3) {
            // Livelli superiori al 3: dettagli eventi individuali (se mai implementati)
            categoriesCount = 1;
            entitiesCount = 1;
            
            // Per livelli > 3, usa la logica originale se necessaria
            if (eventState.currentCategory && eventState.currentSubcategory) {
                calculateCharacterDataFromCurrentGraphData(data, eventState.currentCategory, eventState.currentSubcategory).then(characterData => {
                    if (characterData) {
                        const positiveValueEl = document.getElementById('eventPositiveValue');
                        const negativeValueEl = document.getElementById('eventNegativeValue');
                        
                        if (positiveValueEl) {
                            positiveValueEl.textContent = characterData.positivi || 0;
                        }
                        if (negativeValueEl) {
                            negativeValueEl.textContent = characterData.negativi || 0;
                        }
                    }
                }).catch(error => {
                    console.error('🚨 [updateEventInfoCards] Errore caricamento dati carattere per livello >3:', error);
                });
            }
            
        } else if (activeViewType === 'enti') {
            // Vista enti: logica specifica per ogni livello
            console.log('🏢 [updateEventInfoCards] Vista enti - Livello:', eventState.currentLevel, 'Dati:', data?.length || 0, 'Stats:', !!stats);
            
            if (eventState.currentLevel === 0) {
                // Livello 0 vista enti: tutti gli enti principali del sistema
                if (stats) {
                    totalEvents = stats.total_events || stats.totale || 0;
                    categoriesCount = stats.tipologie || 0; // Tipologie di eventi nel sistema
                    entitiesCount = stats.enti_coinvolti || data.length || 0; // Enti principali
                    positiveEvents = stats.positive_events || stats.positivi || 0;
                    negativeEvents = stats.negative_events || stats.negativi || 0;
                } else if (Array.isArray(data)) {
                    totalEvents = data.reduce((sum, value) => sum + value, 0);
                    categoriesCount = 0; // Sarà calcolato dinamicamente se possibile
                    entitiesCount = data.length; // Numero di enti mostrati nel grafico
                }
                
            } else if (eventState.currentLevel === 1) {
                // Livello 1 vista enti: ente selezionato + enti figli
                if (stats) {
                    totalEvents = stats.total_events || stats.totale || 0;
                    categoriesCount = stats.tipologie || 0; // Tipologie presenti nell'ente
                    entitiesCount = 1 + (data.length - 1 || 0); // Ente principale + figli
                    positiveEvents = stats.positive_events || stats.positivi || 0;
                    negativeEvents = stats.negative_events || stats.negativi || 0;
                } else if (Array.isArray(data)) {
                    totalEvents = data.reduce((sum, value) => sum + value, 0);
                    categoriesCount = 1; // Assumiamo almeno una tipologia
                    entitiesCount = data.length; // Enti mostrati (principale + figli)
                }
                
            } else if (eventState.currentLevel === 2) {
                // Livello 2 vista enti: ente selezionato + enti dipendenti dettagliati
                if (stats) {
                    totalEvents = stats.total_events || stats.totale || 0;
                    categoriesCount = stats.tipologie || 1; // Tipologie nell'ente specifico
                    entitiesCount = 1 + (data.length - 1 || 0); // Ente principale + dipendenti
                    positiveEvents = stats.positive_events || stats.positivi || 0;
                    negativeEvents = stats.negative_events || stats.negativi || 0;
                } else if (Array.isArray(data)) {
                    totalEvents = data.reduce((sum, value) => sum + value, 0);
                    categoriesCount = 1; // Assumiamo almeno una tipologia
                    entitiesCount = data.length; // Enti dipendenti mostrati
                }
                
            } else if (eventState.currentLevel >= 3) {
                // Livello 3+ vista enti: dettagli tipi evento per l'ente selezionato
                // A questo livello i dati rappresentano i tipi di evento, non gli enti
                if (stats) {
                    totalEvents = stats.total_events || stats.totale || 0;
                    categoriesCount = data.length || stats.tipologie || 0; // Tipi evento mostrati nel grafico
                    entitiesCount = 1; // Un solo ente (quello selezionato)
                    positiveEvents = stats.positive_events || stats.positivi || 0;
                    negativeEvents = stats.negative_events || stats.negativi || 0;
                } else if (Array.isArray(data)) {
                    totalEvents = data.reduce((sum, value) => sum + value, 0);
                    categoriesCount = data.length; // Tipi evento mostrati nel grafico
                    entitiesCount = 1; // Un solo ente selezionato
                }
            }
            
            console.log('✅ [updateEventInfoCards] Vista enti - Valori calcolati:', {
                level: eventState.currentLevel,
                entity: eventState.currentEntity,
                totalEvents,
                categoriesCount,
                entitiesCount,
                positiveEvents,
                negativeEvents
            });
            
        }
    } else {
    }
    
    // Aggiorna elementi DOM con i valori calcolati
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
    
    // LOG FINALE: Verifica valori scritti negli elementi DOM
    console.log('📋 [updateEventInfoCards] VALORI FINALI scritti negli elementi DOM:', {
        level: eventState.currentLevel,
        totalEvents: totalEvents,
        categoriesCount: categoriesCount,
        entitiesCount: entitiesCount,
        positiveEvents: positiveEvents,
        negativeEvents: negativeEvents,
        elementsFound: {
            total: !!document.getElementById('eventTotalValue'),
            categories: !!document.getElementById('eventCategoriesValue'),
            entities: !!document.getElementById('eventEntitiesValue'),
            positive: !!document.getElementById('eventPositiveValue'),
            negative: !!document.getElementById('eventNegativeValue')
        }
    });
    
    // Card aggiornate
}

/**
 * Aggiorna le info card specificamente per il livello 3
 * Calcola i valori direttamente dai dati disponibili senza dipendere da stats
 */
function updateLevel3InfoCards(graphData, detailsData) {
    console.log('📊 [updateLevel3InfoCards] Inizio calcolo per livello 3:', {
        hasGraphData: !!graphData,
        hasGraphDataArray: graphData?.data ? graphData.data.length : 0,
        hasDetailsData: !!detailsData,
        detailsDataLength: detailsData ? detailsData.length : 0,
        level: eventState.currentLevel,
        entity: eventState.currentEntity,
        viewType: eventState.viewType
    });

    // Rileva vista attiva per calcoli corretti
    function getActiveViewFromDOM() {
        const tipologieView = document.getElementById('chartViewTipologie');
        const entiView = document.getElementById('chartViewEnti');
        
        if (tipologieView && tipologieView.style.display !== 'none' && tipologieView.classList.contains('active')) {
            return 'tipologie';
        }
        if (entiView && entiView.style.display !== 'none') {
            return 'enti';
        }
        return eventState.viewType; // fallback
    }
    
    const activeViewType = getActiveViewFromDOM();

    // Calcola totale eventi - priorità a graphData.data (dati temporali aggregati)
    let totalEvents = 0;
    if (graphData?.data && Array.isArray(graphData.data)) {
        totalEvents = graphData.data.reduce((sum, val) => sum + val, 0);
        console.log('✅ [updateLevel3InfoCards] Totale calcolato da graphData:', totalEvents);
    } else if (detailsData && Array.isArray(detailsData)) {
        totalEvents = detailsData.length;
        console.log('✅ [updateLevel3InfoCards] Totale calcolato da detailsData:', totalEvents);
    }
    
    // Calcola eventi positivi/negativi dai dati dettagliati
    let positiveCount = 0;
    let negativeCount = 0;
    
    if (detailsData && Array.isArray(detailsData)) {
        detailsData.forEach(event => {
            if (event.carattere === 'positivo') {
                positiveCount++;
            } else if (event.carattere === 'negativo') {
                negativeCount++;
            }
        });
        
        console.log('📋 [updateLevel3InfoCards] Caratteri calcolati:', {
            positiveCount,
            negativeCount,
            totaleContati: positiveCount + negativeCount,
            eventiSenzaCarattere: totalEvents - (positiveCount + negativeCount)
        });
    }
    
    // Calcola categoriesCount e entitiesCount in base alla vista attiva
    let categoriesCount, entitiesCount;
    
    if (activeViewType === 'tipologie') {
        // Vista tipologie al livello 3: dettaglio temporale per ente specifico
        categoriesCount = 1; // Una sola tipologia (ereditata dal livello 1)
        entitiesCount = 1;   // Un solo ente specifico (livello 2 -> 3)
    } else if (activeViewType === 'enti') {
        // Vista enti al livello 3: tipi evento per l'ente selezionato
        categoriesCount = graphData?.labels ? graphData.labels.length : (graphData?.data ? graphData.data.length : 0); // Tipi evento mostrati nel grafico
        entitiesCount = 1;   // Un solo ente selezionato
        
        console.log('🏢 [updateLevel3InfoCards] Vista enti - Tipi evento per ente:', {
            tipiEvento: categoriesCount,
            entiCoinvolti: entitiesCount,
            totalEvents: totalEvents
        });
    } else {
        // Fallback ai valori originali
        categoriesCount = 1;
        entitiesCount = 1;
    }
    
    // Aggiorna elementi DOM direttamente
    const elements = {
        total: document.getElementById('eventTotalValue'),
        categories: document.getElementById('eventCategoriesValue'),
        entities: document.getElementById('eventEntitiesValue'),
        positive: document.getElementById('eventPositiveValue'),
        negative: document.getElementById('eventNegativeValue')
    };
    
    // Verifica che gli elementi esistano
    const elementsFound = Object.keys(elements).filter(key => !!elements[key]);
    console.log('🔍 [updateLevel3InfoCards] Elementi DOM trovati:', elementsFound);
    
    if (elementsFound.length < 5) {
        console.warn('⚠️ [updateLevel3InfoCards] Mancano elementi DOM:', 
                     Object.keys(elements).filter(key => !elements[key]));
    }
    
    // Aggiorna i valori
    if (elements.total) {
        elements.total.textContent = totalEvents;
    }
    if (elements.categories) {
        elements.categories.textContent = categoriesCount;
    }
    if (elements.entities) {
        elements.entities.textContent = entitiesCount;
    }
    if (elements.positive) {
        elements.positive.textContent = positiveCount;
    }
    if (elements.negative) {
        elements.negative.textContent = negativeCount;
    }
    
    // Log finale per verifica
    console.log('📊 [updateLevel3InfoCards] VALORI FINALI scritti negli elementi DOM:', {
        level: eventState.currentLevel,
        totalEvents: totalEvents,
        categoriesCount: categoriesCount,
        entitiesCount: entitiesCount,
        positiveEvents: positiveCount,
        negativeEvents: negativeCount,
        calcoloDiretto: true,
        sorgenteDati: {
            totaleDa: graphData?.data ? 'graphData.data' : 'detailsData.length',
            caratteriDa: 'detailsData analizzati'
        }
    });
}

// Cache per rilevare dati non filtrati
let unfilteredDataCache = new Map();

async function loadRealCharacterDataForCategory(categoria) {
    // Carica i dati reali di carattere (positivi/negativi) per una specifica tipologia
    // Bypass completo delle API aggregate che non filtrano - usa direttamente dettagli eventi
    
    // SOLUZIONE DIRETTA: Salta le API aggregate e calcola direttamente dai dettagli
    console.log('🔍 [loadRealCharacterDataForCategory] Loading character data for category:', categoria);
    return await calculateCharacterDataFromEventDetails(categoria);
}

async function loadRealCharacterDataForCategoryAndEnte(categoria, ente) {
    // Carica i dati reali di carattere per una specifica tipologia E ente
    // Usa la stessa logica di calculateCharacterDataFromEventDetails ma con doppio filtro
    console.log('🔍 [loadRealCharacterDataForCategoryAndEnte] Loading character data for category + ente:', {
        categoria: categoria,
        ente: ente
    });
    return await calculateCharacterDataFromEventDetails(categoria, ente);
}

async function calculateCharacterDataFromCurrentGraphData(dataArray, categoria, ente) {
    // Calcola i caratteri specificamente dai dati che generano il grafico corrente
    // IMPORTANTE: Questa funzione deve garantire che positivi + negativi = totale eventi nel grafico
    
    console.warn('🔍 [calculateCharacterDataFromCurrentGraphData] Calcolo caratteri dai dati grafico correnti:', {
        categoria: categoria,
        ente: ente,
        dataArray: dataArray,
        totalEventiGrafico: dataArray.reduce((sum, value) => sum + value, 0),
        livello: eventState.currentLevel
    });
    
    try {
        // Al livello 2+, i dati del grafico rappresentano eventi specifici dell'ente
        // Dobbiamo recuperare i dettagli di questi eventi specifici e calcolare i caratteri
        
        const url = '/eventi/api/dettagli';
        const params = new URLSearchParams();
        
        // Aggiungi filtri per ottenere gli eventi corrispondenti al grafico
        params.append('period', eventState.currentPeriod);
        
        // Aggiungi date personalizzate se presenti
        if (eventState.currentPeriod === 'custom' && eventState.customStartDate && eventState.customEndDate) {
            params.append('start_date', eventState.customStartDate);
            params.append('end_date', eventState.customEndDate);
        }
        
        // Filtri specifici per categoria e ente - Fix: usa il parametro corretto per l'API
        if (categoria) {
            // Converti "TIPO E" -> "tipo_e" per matchare il database
            const tipoEvento = categoria.toLowerCase().replace(' ', '_');
            params.append('sottocategoria', tipoEvento); // L'API /dettagli gestisce questo parametro
        }
        if (ente) {
            params.append('ente', ente); // Questo è corretto
        }
        
        // Aggiungi informazione sul livello per aiutare l'API a filtrare correttamente
        // CRITICO: Il livello determina se usare query ricorsiva (livello 2) o standard
        params.append('level', eventState.currentLevel.toString());
        
        const fullUrl = `${url}?${params.toString()}`;
        
        console.log('🌐 [calculateCharacterDataFromCurrentGraphData] Request URL:', fullUrl);
        
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
        
        if (result.success && Array.isArray(result.data)) {
            // Use character statistics from API response if available
            let positivi = 0;
            let negativi = 0;
            let totale = result.data.length;
            
            if (result.character_stats) {
                // Use server-calculated statistics for better consistency
                positivi = result.character_stats.positivi || 0;
                negativi = result.character_stats.negativi || 0;
                totale = result.character_stats.totale || result.data.length;
            } else {
                // Fallback to manual calculation if stats not provided
                result.data.forEach(evento => {
                    const carattere = evento.carattere || evento.character || evento.tipo_carattere || '';
                    const carattereNorm = carattere.toLowerCase().trim();
                    
                    if (carattereNorm === 'positivo' || carattereNorm === 'positive') {
                        positivi++;
                    } else if (carattereNorm === 'negativo' || carattereNorm === 'negative') {
                        negativi++;
                    }
                });
            }
            
            const totaleEventiGrafico = dataArray.reduce((sum, value) => sum + value, 0);
            
            console.log('📊 [calculateCharacterDataFromCurrentGraphData] Risultato calcolo:', {
                eventiDettagliAPI: totale,
                eventiGrafico: totaleEventiGrafico,
                positivi: positivi,
                negativi: negativi,
                sommaCaratteri: positivi + negativi,
                usedServerStats: !!result.character_stats,
                livello: eventState.currentLevel,
                campione: result.data.slice(0, 3).map(e => ({
                    tipo: e.tipo_evento || e.tipologia,
                    carattere: e.carattere,
                    ente: e.ente || e.ente_name
                }))
            });
            
            // Verifica coerenza: gli eventi dall'API dovrebbero corrispondere ai dati del grafico
            const sommaCaratteri = positivi + negativi;
            if (totale !== totaleEventiGrafico) {
                console.warn('⚠️ [calculateCharacterDataFromCurrentGraphData] Disallineamento tra API e grafico:', {
                    eventiAPI: totale,
                    eventiGrafico: totaleEventiGrafico,
                    differenza: Math.abs(totale - totaleEventiGrafico)
                });
            }
            if (sommaCaratteri !== totale && totale > 0) {
                console.warn('⚠️ [calculateCharacterDataFromCurrentGraphData] Disallineamento caratteri:', {
                    positivi: positivi,
                    negativi: negativi,
                    sommaCaratteri: sommaCaratteri,
                    totale: totale,
                    eventiSenzaCarattere: totale - sommaCaratteri
                });
            } else if (totale === totaleEventiGrafico && sommaCaratteri === totale) {
                console.log('✅ [calculateCharacterDataFromCurrentGraphData] PERFETTO! Tutti i dati sono allineati:', {
                    livello: eventState.currentLevel,
                    eventiAPI: totale,
                    eventiGrafico: totaleEventiGrafico,
                    caratteriTotali: sommaCaratteri
                });
            }
            
            return {
                positivi: positivi,
                negativi: negativi,
                totale: totale
            };
        } else {
            console.warn('⚠️ [calculateCharacterDataFromCurrentGraphData] Nessun evento dettagliato ricevuto dall\'API');
            return {
                positivi: 0,
                negativi: 0,
                totale: 0
            };
        }
        
    } catch (error) {
        console.error('🚨 [calculateCharacterDataFromCurrentGraphData] Errore calcolo caratteri:', error);
        return {
            positivi: 0,
            negativi: 0,
            totale: 0
        };
    }
}

async function loadCharacterDataFromMainEndpoint(categoria) {
    // Approccio alternativo: usa endpoint dashboard-data principale con filtri specifici
    try {
        // Prova prima con l'endpoint dashboard principale
        let url = '/eventi/api/dashboard-data';
        let params = new URLSearchParams();
        
        // Aggiungi il periodo corrente
        params.append('period', eventState.currentPeriod);
        
        // Aggiungi date personalizzate se presenti
        if (eventState.currentPeriod === 'custom' && eventState.customStartDate && eventState.customEndDate) {
            params.append('start_date', eventState.customStartDate);
            params.append('end_date', eventState.customEndDate);
        }
        
        // Filtra per tipologia specifica
        if (categoria) {
            const tipoEvento = categoria.toLowerCase().replace(' ', '_');
            params.append('tipo_filtro', tipoEvento);
            params.append('drill_level', '1'); // Indica che siamo al livello 1 di drill-down
        }
        
        // Richiedi esplicitamente statistiche carattere
        params.append('include_character_stats', 'true');
        
        const fullUrl = `${url}?${params.toString()}`;
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            // Fallback con enti-livello1
            return await loadCharacterDataFromEntiLivello1(categoria);
        }
        
        const result = await response.json();
        
        if (result.success && result.stats) {
            return {
                positivi: result.stats.positivi || 0,
                negativi: result.stats.negativi || 0,
                totale: result.stats.totale || 0
            };
        } else {
            return await loadCharacterDataFromEntiLivello1(categoria);
        }
        
    } catch (error) {
        console.error('🚨 [loadCharacterDataFromMainEndpoint] Errore caricamento dati carattere:', error);
        return await loadCharacterDataFromEntiLivello1(categoria);
    }
}

async function loadCharacterDataFromEntiLivello1(categoria) {
    // Fallback finale: prova enti-livello1 con parametri estesi
    try {
        let url = '/eventi/api/enti-livello1';
        let params = new URLSearchParams();
        
        // Aggiungi la tipologia
        if (categoria) {
            const tipoEvento = categoria.toLowerCase().replace(' ', '_');
            params.append('tipo_evento', tipoEvento);
        }
        
        // Prova parametri diversi per forzare le stats
        params.append('with_stats', 'true');
        params.append('character_breakdown', 'true');
        params.append('include_positive_negative', 'true');
        
        // Aggiungi il periodo corrente
        params.append('period', eventState.currentPeriod);
        
        // Aggiungi date personalizzate se presenti
        if (eventState.currentPeriod === 'custom' && eventState.customStartDate && eventState.customEndDate) {
            params.append('start_date', eventState.customStartDate);
            params.append('end_date', eventState.customEndDate);
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
        
        if (result.success && result.stats && (result.stats.positivi > 0 || result.stats.negativi > 0)) {
            return {
                positivi: result.stats.positivi || 0,
                negativi: result.stats.negativi || 0,
                totale: result.stats.totale || 0
            };
        } else {
            // Ultimo tentativo: calcola dai dettagli eventi se disponibili
            return await calculateCharacterDataFromEventDetails(categoria);
        }
        
    } catch (error) {
        console.error('🚨 [loadCharacterDataFromEntiLivello1] Errore caricamento dati carattere:', error);
        return await calculateCharacterDataFromEventDetails(categoria);
    }
}

async function calculateCharacterDataFromEventDetails(categoria, ente = null) {
    // Calcola dati carattere dai dettagli eventi - approccio robusto e accurato
    // ente: parametro opzionale per filtrare anche per ente specifico (livello 2+)
    try {
        const url = '/eventi/api/dettagli';
        const params = new URLSearchParams();
        
        // Aggiungi il periodo corrente
        params.append('period', eventState.currentPeriod);
        
        // Aggiungi date personalizzate se presenti
        if (eventState.currentPeriod === 'custom' && eventState.customStartDate && eventState.customEndDate) {
            params.append('start_date', eventState.customStartDate);
            params.append('end_date', eventState.customEndDate);
        }
        
        // PROVA DIVERSI PARAMETRI per la tipologia
        if (categoria) {
            const tipoEvento = categoria.toLowerCase().replace(' ', '_');
            // Prova tutti i possibili nomi parametro che l'API potrebbe riconoscere
            params.append('sottocategoria', tipoEvento);
            params.append('tipo_evento', tipoEvento);
            params.append('category', tipoEvento);
            params.append('tipologia', tipoEvento);
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
        
        if (result.success && Array.isArray(result.data)) {
            let allEvents = result.data;
            
            // Se l'API non ha filtrato per tipologia, filtriamo lato client
            if (categoria && allEvents.length > 0) {
                const categoriaUpper = categoria.toUpperCase();
                const categoriaLower = categoria.toLowerCase();
                const tipoEvento = categoria.toLowerCase().replace(' ', '_');
                
                // Filtra eventi per tipologia - prova diversi campi
                const filteredEvents = allEvents.filter(evento => {
                    const tipo = evento.tipo_evento || evento.tipologia || evento.category || evento.sottocategoria || '';
                    const tipoUpper = tipo.toUpperCase();
                    const tipoLower = tipo.toLowerCase().replace(' ', '_');
                    
                    return tipoUpper === categoriaUpper || 
                           tipoLower === categoriaLower || 
                           tipoLower === tipoEvento ||
                           tipo === categoria;
                });
                
                allEvents = filteredEvents;
                
                // Debug: mostra info filtro categoria
                console.warn('🔍 [calculateCharacterDataFromEventDetails] Filtro categoria applicato:', {
                    categoria: categoria,
                    eventiTotali: result.data.length,
                    eventiFiltrati: allEvents.length,
                    primoEventoFiltrato: allEvents[0] || 'nessuno'
                });
            }
            
            // Se specificato, filtra anche per ente (livello 2+)
            if (ente && allEvents.length > 0) {
                const eventiPrimaDelFiltroEnte = allEvents.length;
                const enteFiltrati = allEvents.filter(evento => {
                    const enteEvento = evento.ente || evento.ente_name || evento.organizzazione || evento.ente_militare || '';
                    
                    // Prova matching esatto e parziale
                    return enteEvento === ente || 
                           enteEvento.toLowerCase().includes(ente.toLowerCase()) ||
                           ente.toLowerCase().includes(enteEvento.toLowerCase());
                });
                
                allEvents = enteFiltrati;
                
                // Debug: mostra info filtro ente
                console.warn('🔍 [calculateCharacterDataFromEventDetails] Filtro ente applicato:', {
                    categoria: categoria,
                    ente: ente,
                    eventiPrimaDiFiltroEnte: eventiPrimaDelFiltroEnte,
                    eventiDopoFiltroEnte: enteFiltrati.length,
                    primoEventoFiltrato: enteFiltrati[0] || 'nessuno'
                });
            }
            
            if (allEvents.length > 0) {
                // Calcola statistiche dai singoli eventi filtrati
                let positivi = 0;
                let negativi = 0;
                let totale = allEvents.length;
                
                allEvents.forEach(evento => {
                    const carattere = evento.carattere || evento.character || evento.tipo_carattere || '';
                    const carattereNorm = carattere.toLowerCase().trim();
                    
                    if (carattereNorm === 'positivo' || carattereNorm === 'positive') {
                        positivi++;
                    } else if (carattereNorm === 'negativo' || carattereNorm === 'negative') {
                        negativi++;
                    }
                });
                
                // Debug: mostra risultati calcolo con validazione
                const sommaCaratteri = positivi + negativi;
                console.warn('📊 [calculateCharacterDataFromEventDetails] Risultato calcolo:', {
                    categoria: categoria,
                    totale: totale,
                    positivi: positivi,
                    negativi: negativi,
                    sommaCaratteri: sommaCaratteri,
                    eventiSenzaCarattere: totale - sommaCaratteri,
                    campione: allEvents.slice(0, 3).map(e => ({
                        tipo: e.tipo_evento || e.tipologia,
                        carattere: e.carattere || e.character || 'N/D'
                    }))
                });
                
                // Validation warning for character data
                if (sommaCaratteri !== totale && totale > 0) {
                    console.warn('⚠️ [calculateCharacterDataFromEventDetails] Eventi senza carattere definito:', {
                        totaleEventi: totale,
                        eventiConCarattere: sommaCaratteri,
                        eventiSenzaCarattere: totale - sommaCaratteri
                    });
                }
                
                return {
                    positivi: positivi,
                    negativi: negativi,
                    totale: totale
                };
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('🚨 [calculateCharacterDataFromEventDetails] Errore calcolo dati carattere:', error);
        return null;
    }
}

// FUNZIONI NAVIGAZIONE VISTA ENTI
// ========================================

async function resetEventToEntiLevel0() {
    // Reset alla vista enti livello 0
    eventState.currentLevel = 0;
    eventState.currentCategory = null;
    eventState.currentSubcategory = null;
    eventState.currentEntity = null;
    eventState.breadcrumb = [];
    
    // Mostra il grafico e nascondi la tabella
    const chartContainer = document.querySelector('.chart-container');
    const detailsPanel = document.getElementById('eventDetailsPanel');
    
    if (chartContainer) {
        chartContainer.style.display = 'block';
    }
    
    if (detailsPanel) {
        detailsPanel.style.display = 'none';
    }
    
    updateEventBreadcrumb();
    
    // Usa initEntiChart per ricaricare la vista enti
    const drillDownChart = window.eventDrillDownChart;
    if (drillDownChart && drillDownChart.viewType === 'enti') {
        await drillDownChart.initEntiChart();
    } else {
        // Fallback
        await initEventChart();
    }
}

async function navigateToEntiLevel1() {
    // Torna al livello 1 della vista enti
    if (eventState.currentEntity) {
        eventState.currentLevel = 1;
        eventState.currentSubcategory = null;
        
        // Mostra il grafico e nascondi la tabella
        const chartContainer = document.querySelector('.chart-container');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        if (detailsPanel) {
            detailsPanel.style.display = 'none';
        }
        
        updateEventBreadcrumb();
        await loadEntiLevel1(eventState.currentEntity);
    }
}

async function navigateToEntiLevel2() {
    // Torna al livello 2 della vista enti
    if (eventState.currentEntity && eventState.currentSubcategory) {
        eventState.currentLevel = 2;
        
        // Mostra il grafico e nascondi la tabella
        const chartContainer = document.querySelector('.chart-container');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }
        
        if (detailsPanel) {
            detailsPanel.style.display = 'none';
        }
        
        updateEventBreadcrumb();
        await loadEntiLevel2(eventState.currentSubcategory);
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
    
    const detailsPanel = document.getElementById('eventDetailsPanel');
    const detailsList = document.getElementById('eventDetailsList');
    
    
    if (!detailsPanel || !detailsList) {
        console.error('❌ [showEventDetailsTable] Elementi pannello dettagli eventi non trovati');
        return;
    }
    
    
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
    
    detailsList.innerHTML = html;
    
    // IMPORTANTE: Mostra il pannello dettagli SOTTO il grafico (non nascondere il grafico)
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
        chartContainer.style.display = 'block'; // Mantieni il grafico visibile
    }
    
    detailsPanel.style.display = 'block';
    
    // NUOVO: Inizializza AdvancedTable per funzionalità avanzate
    if (details && details.length > 0) {
        // Aspetta che il DOM sia aggiornato prima di inizializzare la tabella
        setTimeout(() => {
            if (typeof window.AdvancedTable !== 'undefined') {
                try {
                    console.log('🔄 [showEventDetailsTable] Inizializzazione AdvancedTable...');
                    
                    const advancedTable = new AdvancedTable({
                        tableSelector: `#${tableId}`,
                        itemsPerPage: 20,
                        enableSorting: true,
                        enablePagination: true,
                        enableDragDrop: false,  // Non necessario per eventi
                        enableColumnResize: true,
                        topControlsSelector: `#${topPagId} .pagination-controls`,
                        bottomControlsSelector: `#${bottomPagId} .pagination-controls`,
                        topInfoSelector: `#${topPagId} .pagination-info span`,
                        bottomInfoSelector: `#${bottomPagId} .pagination-info span`
                    });
                    
                    // Memorizza l'istanza per eventuali refresh
                    window.currentEventTable = advancedTable;
                    
                    console.log('✅ [showEventDetailsTable] AdvancedTable inizializzata con successo');
                } catch (tableError) {
                    console.error('🚨 [showEventDetailsTable] Errore inizializzazione AdvancedTable:', tableError);
                }
            } else {
                console.warn('⚠️ [showEventDetailsTable] AdvancedTable non disponibile - usando funzionalità base');
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
            }
        }, 200);
    }
}

// ========================================
// FUNZIONI REFRESH PER LIVELLO 3
// ========================================

async function refreshLevel3Data() {
    if (eventState.currentLevel !== 3 || !eventState.currentEntity) {
        console.warn('⚠️ [refreshLevel3Data] Non al livello 3 o entity mancante');
        return;
    }
    
    const carattereFiltro = getEventCarattereFiltro();
    console.log('🔄 [refreshLevel3Data] Refresh dati per ente:', eventState.currentEntity, 'con filtro carattere:', carattereFiltro);
    console.log('🔄 [refreshLevel3Data] EventState completo:', {
        currentLevel: eventState.currentLevel,
        currentCategory: eventState.currentCategory,
        currentSubcategory: eventState.currentSubcategory,
        currentEntity: eventState.currentEntity
    });
    
    try {
        // Carica dati con filtri attuali
        const [graphData, detailsData] = await Promise.all([
            loadEventDataFromAPI(3, eventState.currentEntity),
            loadEventDetailsFromAPI(eventState.currentEntity)
        ]);
        
        console.log('🔄 [refreshLevel3Data] Dati ricevuti:', {
            graphData: !!graphData,
            detailsData: detailsData?.length || 0
        });
        
        // Aggiorna grafico
        if (graphData && graphData.labels && graphData.data && graphData.data.length > 0) {
            console.log('📊 [refreshLevel3Data] Aggiornamento grafico con', graphData.data.reduce((sum, value) => sum + value, 0), 'eventi');
            const chartHeight = calculateOptimalChartHeight(graphData.labels.length);
            createEventChart(graphData.labels, graphData, graphData.backgroundColor, chartHeight);
            updateLevel3InfoCards(graphData, detailsData);
        } else {
            console.warn('⚠️ [refreshLevel3Data] Nessun dato grafico o grafico vuoto');
            
            // Mostra grafico vuoto se non ci sono dati con il filtro applicato
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight);
            
            // Aggiorna info cards anche con dati vuoti
            updateLevel3InfoCards(graphData, detailsData);
        }
        
        // Aggiorna tabella
        if (detailsData && Array.isArray(detailsData)) {
            console.log('📋 [refreshLevel3Data] Aggiornamento tabella con', detailsData.length, 'eventi');
            showEventDetailsTable(eventState.currentEntity, detailsData);
        } else {
            console.log('📋 [refreshLevel3Data] Tabella vuota');
            showEventDetailsTable(eventState.currentEntity, []);
        }
        
        console.log('✅ [refreshLevel3Data] Refresh completato');
        
    } catch (error) {
        console.error('🚨 [refreshLevel3Data] Errore durante refresh:', error);
        console.error('Stack trace:', error.stack);
    }
}

// ========================================
// INIZIALIZZAZIONE EVENTI
// ========================================

async function initEventChart() {
    // CRITICO: Non inizializzare se il sistema modulare è attivo per evitare conflitti
    if (window.TALON_MODULAR_SYSTEM_ACTIVE) {
        console.log('🚧 [initEventChart] Sistema modulare attivo, saltando inizializzazione legacy');
        return;
    }
    
    try {
        
        const apiData = await loadEventDataFromAPI(0);
        
        if (apiData && apiData.labels && apiData.data) {
            const chartHeight = calculateOptimalChartHeight(apiData.labels.length);
            // CORREZIONE: Passa l'oggetto completo invece del solo array data
            createEventChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
            updateEventInfoCards(apiData.data, apiData.stats);
            updateEventBreadcrumb();
        } else {
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
        this.viewType = options.viewType || 'tipologie';
        this.chart = null;
        
        // Configurazione performance
        this.performance = {
            animation: options.animation || false,
            debounceDelay: options.debounceDelay || 150,
            maxDataPoints: options.maxDataPoints || 100
        };
        
        // Stato locale per questa istanza
        this.state = {
            currentLevel: 0,
            currentPeriod: this.period,
            customStartDate: null,
            customEndDate: null,
            breadcrumb: [],
            currentCategory: null,
            currentSubcategory: null,
            currentEntity: null,
            currentSubDetail: null,
            currentEntityType: null,
            viewType: this.viewType
        };
        
        
        // Aggiungi event listener per ridimensionamento finestra
        this.setupResizeListener();
        
        // Inizializza il grafico eventi
        this.init();
    }
    
    setupResizeListener() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, this.performance.debounceDelay);
        });
    }
    
    handleResize() {
        if (eventChart && eventChart.canvas.id === this.canvas) {
            const newHeight = calculateOptimalChartHeight();
            const canvas = document.getElementById(this.canvas);
            if (canvas && newHeight) {
                canvas.style.height = newHeight + 'px';
                
                const chartContainer = canvas.closest('.chart-container');
                if (chartContainer) {
                    chartContainer.style.height = (newHeight + 40) + 'px';
                }
                
                // Utilizza requestAnimationFrame per ottimizzare il resize
                requestAnimationFrame(() => {
                    eventChart.resize();
                });
            }
        }
    }

    async init() {
        
        // Imposta lo stato globale per compatibilità con le funzioni esistenti
        eventState.viewType = this.viewType;
        eventState.currentLevel = this.state.currentLevel;
        eventState.currentPeriod = this.state.currentPeriod;
        
        // Verifica che il canvas esista
        const canvas = document.getElementById(this.canvas);
        if (!canvas) {
            console.error('❌ [init] Canvas non trovato:', this.canvas);
            return;
        }
        
        // Inizializzazione diversa per vista enti vs tipologie
        if (this.viewType === 'enti') {
            await this.initEntiChart();
        } else {
            await initEventChart();
        }
    }
    
    async initEntiChart() {
        try {
            console.log('🏢 [initEntiChart] Inizializzazione grafico vista enti...');
            
            // Carica dati per la vista enti (livello 0 della vista enti = tutti gli enti)
            const apiData = await loadEventDataFromAPI(0);
            
            if (apiData && apiData.labels && apiData.data) {
                const chartHeight = calculateOptimalChartHeight(apiData.labels.length);
                createEventChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight, this.canvas);
                updateEventInfoCards(apiData.data, apiData.stats);
                updateEventBreadcrumb();
                console.log('✅ [initEntiChart] Grafico enti inizializzato con', apiData.data.length, 'enti');
            } else {
                // Dati vuoti di fallback
                const chartHeight = calculateOptimalChartHeight();
                createEventChart(['Nessun Dato'], [0], ['rgba(200, 200, 200, 0.8)'], chartHeight, this.canvas);
                updateEventInfoCards([0]);
                updateEventBreadcrumb();
            }
        } catch (error) {
            console.error('🚨 Errore inizializzazione grafico enti:', error);
            // Fallback a dati vuoti
            const chartHeight = calculateOptimalChartHeight();
            createEventChart(['Errore Caricamento'], [0], ['rgba(255, 0, 0, 0.8)'], chartHeight, this.canvas);
            updateEventInfoCards([0]);
            updateEventBreadcrumb();
        }
    }
    
    async setPeriod(period) {
        // Aggiorna stato locale
        this.state.currentPeriod = period;
        this.state.customStartDate = null;
        this.state.customEndDate = null;
        
        // Sincronizza stato globale
        eventState.currentPeriod = period;
        eventState.customStartDate = null;
        eventState.customEndDate = null;
        eventState.viewType = this.viewType;
        
        await this.refreshCurrentLevel(); // Mantieni livello corrente
    }
    
    async setCustomPeriod(startDate, endDate) {
        // Aggiorna stato locale
        this.state.currentPeriod = 'custom';
        this.state.customStartDate = startDate;
        this.state.customEndDate = endDate;
        
        // Sincronizza stato globale
        eventState.currentPeriod = 'custom';
        eventState.customStartDate = startDate;
        eventState.customEndDate = endDate;
        eventState.viewType = this.viewType;
        
        await this.refreshCurrentLevel(); // Mantieni livello corrente
    }
    
    async reset() {
        await resetEventToLevel0();
    }
    
    async refresh() {
        // Refresh leggero senza reinizializzare tutto lo stato
        
        // Sincronizza solo lo stato globale necessario
        eventState.viewType = this.viewType;
        eventState.currentLevel = this.state.currentLevel;
        eventState.currentPeriod = this.state.currentPeriod;
        
        // Se siamo al livello 0, ricarica solo i dati
        if (this.state.currentLevel === 0) {
            await initEventChart();
        } else {
            // Per altri livelli, usa refreshCurrentLevel che è più leggero
            await this.refreshCurrentLevel();
        }
    }

    async switchView(newViewType) {
        // Cambia la vista del grafico
        
        // Salva vista precedente
        const previousViewType = eventState.viewType;
        
        // Aggiorna stato
        eventState.viewType = newViewType;
        this.viewType = newViewType;
        
        // Reset allo stato iniziale quando si cambia vista
        eventState.currentLevel = 0;
        eventState.currentCategory = null;
        eventState.currentSubcategory = null;
        eventState.currentEntity = null;
        eventState.breadcrumb = [];
        
        // Aggiorna canvas target in base alla vista
        if (newViewType === 'enti') {
            this.canvas = 'eventEntiChartCanvas';
        } else {
            this.canvas = 'eventChartCanvas';
        }
        
        
        // Ricarica i dati per la nuova vista
        await this.init();
    }
    
    async refreshCurrentLevel() {
        // Ricarica il livello corrente mantenendo lo stato
        
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
        
        if (eventState.viewType === 'enti') {
            // Vista enti: usa funzioni specifiche per enti
            if (eventState.currentLevel === 0) {
                // Livello 0: ricarica vista enti
                await this.initEntiChart();
            } else if (eventState.currentLevel === 1) {
                // Livello 1: ricarica ente + figli
                if (eventState.currentEntity) {
                    await loadEntiLevel1(eventState.currentEntity);
                }
            } else if (eventState.currentLevel === 2) {
                // Livello 2: ricarica ente + figli
                if (eventState.currentSubcategory) {
                    await loadEntiLevel2(eventState.currentSubcategory);
                }
            } else if (eventState.currentLevel === 3) {
                // Livello 3: ricarica tipi evento + tabella
                if (eventState.currentEntity) {
                    await loadEntiLevel3(eventState.currentEntity);
                }
            }
        } else {
            // Vista tipologie: comportamento originale
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
}

// ========================================
// INIZIALIZZAZIONE LISTENERS FILTRI
// ========================================

// Inizializza i listener per i filtri carattere
function initCharacterFilterListeners() {
    const characterFilters = document.querySelectorAll('input[name="evento_carattere"]');
    
    if (characterFilters.length > 0) {
        console.log('🔄 [initCharacterFilterListeners] Inizializzazione listeners filtri carattere...');
        
        characterFilters.forEach(filter => {
            filter.addEventListener('change', async function(e) {
                console.log('🎛️ [CharacterFilter] Filtro cambiato:', this.value, 'Livello corrente:', eventState.currentLevel);
                
                // Aggiorna tutti i livelli in base al livello corrente
                if (eventState.currentLevel === 0) {
                    // Livello 0: ricarica tipi evento
                    console.log('🔄 [CharacterFilter] Refreshing Level 0...');
                    await initEventChart();
                } else if (eventState.currentLevel === 1) {
                    // Livello 1: ricarica enti per tipo evento corrente
                    if (eventState.currentCategory) {
                        console.log('🔄 [CharacterFilter] Refreshing Level 1...');
                        await loadEventLevel1(eventState.currentCategory);
                    }
                } else if (eventState.currentLevel === 2) {
                    // Livello 2: ricarica enti dipendenti per ente corrente
                    if (eventState.currentSubcategory) {
                        console.log('🔄 [CharacterFilter] Refreshing Level 2...');
                        await loadEventLevel2(eventState.currentSubcategory);
                    }
                } else if (eventState.currentLevel === 3) {
                    // Livello 3: usa la funzione di refresh specifica
                    console.log('🔄 [CharacterFilter] Refreshing Level 3 for entity:', eventState.currentEntity);
                    await refreshLevel3Data();
                }
            });
        });
        
        console.log('✅ [initCharacterFilterListeners] Listeners filtri carattere inizializzati');
    } else {
        console.warn('⚠️ [initCharacterFilterListeners] Nessun filtro carattere trovato nel DOM');
    }
}

// Inizializza quando il DOM è pronto
document.addEventListener('DOMContentLoaded', function() {
    // Aspetta un po' per essere sicuri che il DOM sia completamente caricato
    setTimeout(() => {
        initCharacterFilterListeners();
    }, 500);
});

// Esporta la classe per uso globale
window.TalonEventDrillDownChart = TalonEventDrillDownChart;

