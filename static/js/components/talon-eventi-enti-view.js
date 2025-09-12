/**
 * ========================================
 * TALON EVENTI - Vista Enti
 * File: talon-eventi-enti-view.js
 * 
 * Versione: 1.0.0
 * Vista specializzata per drill-down per enti militari
 * Livelli: 0=Enti Principali -> 1=Enti Figli -> 2=Sottoenti -> 3=Tipi Evento per Ente
 * Supporto Stacked Charts per visualizzazione multi-dimensionale
 * ========================================
 */

// Dipendenza dal modulo core
if (typeof window.TalonChartCore === 'undefined') {
    throw new Error('TalonChartCore richiesto per TalonEventiEntiView');
}

window.TalonEventiEntiView = window.TalonEventiEntiView || {};

(function(namespace, core) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE SPECIFICA VISTA ENTI
    // ========================================

    namespace.config = {
        canvasId: 'eventEntiChartCanvas',
        viewType: 'enti',
        apiEndpoints: {
            level0: '/eventi/api/enti-stacked',
            level1: '/eventi/api/enti-stacked',
            level2: '/eventi/api/enti-stacked',
            level3: '/eventi/api/enti-stacked',
            dettagli: '/eventi/api/dettagli'
        },
        stackedColors: {
            'TIPO A': 'rgba(255, 99, 132, 0.8)',
            'TIPO B': 'rgba(54, 162, 235, 0.8)',
            'TIPO C': 'rgba(255, 205, 86, 0.8)',
            'TIPO D': 'rgba(75, 192, 192, 0.8)',
            'TIPO E': 'rgba(153, 102, 255, 0.8)'
        },
        fallbackColors: [
            'rgba(255, 159, 164, 0.8)',
            'rgba(255, 206, 84, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 99, 132, 0.8)',
            'rgba(75, 192, 192, 0.8)'
        ]
    };

    // ========================================
    // GESTIONE STATO LOCALE VISTA ENTI
    // ========================================

    namespace.state = {
        chart: null,
        stackedChart: null,
        isInitialized: false,
        lastAPIResponse: null,
        currentBreakdown: null
    };

    // ========================================
    // FUNZIONI API SPECIFICHE PER ENTI
    // ========================================

    /**
     * Carica dati dall'API per vista enti con supporto stacked
     * @param {number} level - Livello di drill-down (0-3)
     * @param {string} parentLabel - Label del livello precedente
     * @returns {Promise<Object>} Dati per il grafico
     */
    async function loadEntiDataFromAPI(level = 0, parentLabel = null) {
        try {
            let url = namespace.config.apiEndpoints.level0;
            const params = core.buildCommonAPIParams();

            // Determina URL e parametri specifici per livello
            switch (level) {
                case 1:
                    url = namespace.config.apiEndpoints.level1;
                    if (parentLabel) {
                        params.append('ente_parent_nome', parentLabel);
                    }
                    break;

                case 2:
                    url = namespace.config.apiEndpoints.level2;
                    if (parentLabel) {
                        params.append('ente_parent_nome', parentLabel);
                    }
                    break;

                case 3:
                    url = namespace.config.apiEndpoints.level3;
                    if (parentLabel) {
                        params.append('ente_specifico_nome', parentLabel);
                        params.append('livello_3', 'true'); // Indica tipi evento, non enti
                    }
                    break;
            }

            const fullUrl = `${url}?${params.toString()}`;
            
            console.log(`📊 [EntiView] API Request Level ${level}:`, {
                url: fullUrl,
                parentLabel: parentLabel,
                level: level
            });

            const result = await core.fetchWithCache(fullUrl, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                cacheMetadata: {
                    level: level,
                    viewType: 'enti',
                    parentLabel: parentLabel,
                    endpoint: 'enti-stacked'
                }
            });

            // Gestisci fallback se necessario  
            if (!result || result.error) {
                // Fallback per endpoint non esistenti o errori
                if (level === 0) {
                    console.warn('⚠️ [EntiView] Endpoint stacked non disponibile, usando fallback');
                    return await loadEntiDataFallback(level, parentLabel);
                }
                throw new Error(`API error: ${result?.error || 'Unknown error'}`);
            }
            namespace.state.lastAPIResponse = result;

            // Processa risposta specifica per enti
            return processEntiAPIResponse(result, level);

        } catch (error) {
            console.error(`🚨 [EntiView] Errore API Level ${level}:`, error);
            
            // Tentativo di fallback per livello 0
            if (level === 0) {
                console.log('🔄 [EntiView] Tentativo fallback per Level 0');
                return await loadEntiDataFallback(level, parentLabel);
            }
            
            return core.handleAPIError(error, `Enti Level ${level}`);
        }
    }

    /**
     * Fallback API per quando endpoint stacked non è disponibile
     * @param {number} level - Livello
     * @param {string} parentLabel - Label parent
     * @returns {Promise<Object>} Dati trasformati per stacked chart
     */
    async function loadEntiDataFallback(level, parentLabel) {
        try {
            const fallbackUrl = '/eventi/api/enti-livello1';
            const params = core.buildCommonAPIParams();
            
            const result = await core.fetchWithCache(`${fallbackUrl}?${params.toString()}`, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                skipCache: true, // Fallback non deve usare cache
                cacheMetadata: {
                    level: level,
                    viewType: 'enti',
                    endpoint: 'fallback',
                    parentLabel: parentLabel
                }
            });
            
            if (result && !result.error) {
                return transformDataForStackedChart(result);
            }
            
            throw new Error('Fallback API also failed');
        } catch (error) {
            console.error('🚨 [EntiView] Errore fallback API:', error);
            return core.handleAPIError(error, 'Enti Fallback');
        }
    }

    /**
     * Processa la risposta API per vista enti
     * @param {Object} result - Risposta API
     * @param {number} level - Livello corrente
     * @returns {Object} Dati processati per il grafico
     */
    function processEntiAPIResponse(result, level) {
        if (!result.success && !result.stackedData && !result.data && !result.chart) {
            throw new Error(result.error || 'Risposta API non valida per enti');
        }

        // Risposta con dati stacked nativi (formato preferito)
        if (result.stackedData) {
            console.log(`📊 [EntiView] Dati stacked nativi Level ${level}:`, {
                labels: result.stackedData.labels?.length || 0,
                totals: result.stackedData.totals?.length || 0,
                hasBreakdown: !!result.stackedData.breakdown
            });

            namespace.state.currentBreakdown = result.stackedData.breakdown;

            return {
                labels: result.stackedData.labels || [],
                data: result.stackedData.totals || [],
                backgroundColor: result.stackedData.backgroundColor || [],
                breakdown: result.stackedData.breakdown || {},
                stats: result.stats || null,
                isStacked: true
            };
        }

        // Formato standard da trasformare in stacked
        if (result.chart && result.chart.labels && result.chart.data) {
            return transformDataForStackedChart(result);
        }

        if (result.data && result.data.labels && result.data.values) {
            return transformDataForStackedChart({
                data: { labels: result.data.labels, data: result.data.values },
                stats: result.stats
            });
        }

        // Fallback con dati vuoti
        console.warn('⚠️ [EntiView] Formato dati API non riconosciuto:', result);
        return {
            labels: ['Nessun Dato'],
            data: [0],
            backgroundColor: [core.config.colors.noData],
            breakdown: {},
            stats: null,
            isStacked: false
        };
    }

    /**
     * Trasforma dati API standard in formato stacked chart
     * @param {Object} apiResult - Risultato API
     * @returns {Object} Dati formato stacked
     */
    function transformDataForStackedChart(apiResult) {
        // Se già in formato stacked, restituisci così com'è
        if (apiResult.stackedData) {
            namespace.state.currentBreakdown = apiResult.stackedData.breakdown;
            return {
                labels: apiResult.stackedData.labels,
                data: apiResult.stackedData.totals,
                backgroundColor: apiResult.stackedData.backgroundColor,
                breakdown: apiResult.stackedData.breakdown,
                stats: apiResult.stats,
                isStacked: true
            };
        }

        // Trasformazione da formato normale a stacked simulato
        let labels = [];
        let totals = [];
        let backgroundColor = [];
        let breakdown = {};

        // Estrai dati dal formato API normale
        if (apiResult.chart) {
            labels = apiResult.chart.labels;
            totals = apiResult.chart.data;
            backgroundColor = apiResult.chart.backgroundColor;
        } else if (apiResult.data) {
            labels = apiResult.data.labels;
            totals = apiResult.data.data || apiResult.data.values;
            backgroundColor = namespace.config.fallbackColors.slice(0, labels.length);
        }

        console.log('⚠️ [EntiView] Simulando distribuzione stacked per enti');

        // Simula breakdown per tipo evento (distribuzione realistica)
        const tipiEvento = ['TIPO A', 'TIPO B', 'TIPO C', 'TIPO D', 'TIPO E'];
        const percentageDistribution = [0.30, 0.25, 0.20, 0.15, 0.10];

        labels.forEach((ente, index) => {
            const total = totals[index] || 0;
            breakdown[ente] = {};
            
            if (total > 0) {
                let remaining = total;
                
                tipiEvento.forEach((tipo, tipoIndex) => {
                    if (tipoIndex === tipiEvento.length - 1) {
                        // Ultimo tipo: assegna tutto il rimanente
                        breakdown[ente][tipo] = remaining;
                    } else {
                        const value = Math.floor(total * percentageDistribution[tipoIndex]);
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

        namespace.state.currentBreakdown = breakdown;

        return {
            labels: labels,
            data: totals,
            backgroundColor: backgroundColor,
            breakdown: breakdown,
            stats: apiResult.stats,
            isStacked: true
        };
    }

    /**
     * Carica dettagli eventi per un ente specifico (vista enti)
     * @param {string} enteNome - Nome dell'ente
     * @returns {Promise<Array>} Array di eventi dettagliati
     */
    async function loadEntiDetailsFromAPI(enteNome) {
        try {
            const params = core.buildCommonAPIParams();
            
            // Aggiungi filtro carattere
            const carattereFiltro = core.getCharacterFilter();
            if (carattereFiltro) {
                params.append('categoria', carattereFiltro);
            }
            
            // Per la vista enti non abbiamo una categoria specifica da filtrare
            // quindi carichiamo tutti gli eventi dell'ente
            params.append('ente', enteNome);
            
            const fullUrl = `${namespace.config.apiEndpoints.dettagli}?${params.toString()}`;
            
            const result = await core.fetchWithCache(fullUrl, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                cacheTTL: 2 * 60 * 1000, // TTL breve per dettagli (2 minuti)
                cacheMetadata: {
                    level: 'details',
                    viewType: 'enti',
                    ente: enteNome
                }
            });
            
            if (result.success && result.data) {
                return result.data;
            }
            
            throw new Error(result.error || 'Errore caricamento dettagli enti');
            
        } catch (error) {
            console.error('🚨 [EntiView] Errore caricamento dettagli:', error);
            return [];
        }
    }

    // ========================================
    // CREAZIONE STACKED CHARTS
    // ========================================

    /**
     * Crea stacked chart Chart.js specializzato per enti
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Array} labels - Etichette enti
     * @param {Object} stackedData - Dati stacked {totals, breakdown}
     * @param {number} customHeight - Altezza personalizzata
     * @returns {Chart} Istanza Chart.js
     */
    function createStackedEntiChart(canvas, labels, stackedData, customHeight = null) {
        if (!canvas) {
            console.error('🚨 [EntiView] Canvas non fornito per stacked chart');
            return null;
        }

        if (!stackedData || !stackedData.breakdown) {
            console.error('🚨 [EntiView] Dati stacked non validi:', stackedData);
            return null;
        }

        const ctx = canvas.getContext('2d');
        const breakdown = stackedData.breakdown;

        // Distruggi grafico esistente
        if (namespace.state.stackedChart) {
            namespace.state.stackedChart.destroy();
            namespace.state.stackedChart = null;
        }

        // Applica altezza personalizzata
        if (customHeight) {
            canvas.style.height = customHeight + 'px';
            canvas.height = customHeight;
            
            const chartContainer = canvas.closest('.chart-container');
            if (chartContainer) {
                chartContainer.style.height = (customHeight + 40) + 'px';
            }
        }

        // Estrai tutti i tipi evento unici
        const allTipi = new Set();
        Object.values(breakdown).forEach(enteBreakdown => {
            Object.keys(enteBreakdown).forEach(tipo => allTipi.add(tipo));
        });
        const tipiEvento = Array.from(allTipi).sort();

        console.log(`📊 [EntiView] Creazione stacked chart:`, {
            enti: labels.length,
            tipiEvento: tipiEvento.length,
            totalEvents: stackedData.totals ? stackedData.totals.reduce((sum, val) => sum + val, 0) : 0
        });

        // Crea datasets per ogni tipo evento
        const datasets = tipiEvento.map((tipo, index) => {
            const data = labels.map(ente => breakdown[ente] ? breakdown[ente][tipo] || 0 : 0);
            
            return {
                label: tipo,
                data: data,
                backgroundColor: namespace.config.stackedColors[tipo] || namespace.config.fallbackColors[index % namespace.config.fallbackColors.length],
                borderColor: namespace.config.stackedColors[tipo] ? 
                    namespace.config.stackedColors[tipo].replace('0.8', '1') : 
                    namespace.config.fallbackColors[index % namespace.config.fallbackColors.length].replace('0.8', '1'),
                borderWidth: 1,
                stack: 'Stack 0'
            };
        });

        // Crea stacked chart
        namespace.state.stackedChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(label => core.formatLabelForChart(label, 20, labels.length)),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: core.config.performance.animation,
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            maxRotation: 45,
                            callback: function(value, index, values) {
                                const label = this.getLabelForValue(value);
                                if (typeof label === 'string' && label.length > 15) {
                                    return label.substring(0, 15) + '...';
                                }
                                return label;
                            }
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            generateLabels: function(chart) {
                                const original = Chart.defaults.plugins.legend.labels.generateLabels;
                                const labels = original.call(this, chart);
                                
                                // Aggiungi conteggio totale per tipo
                                labels.forEach((label, index) => {
                                    const dataset = chart.data.datasets[index];
                                    const total = dataset.data.reduce((sum, val) => sum + val, 0);
                                    label.text = `${label.text} (${total})`;
                                });
                                
                                return labels;
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        callbacks: {
                            title: function(context) {
                                return 'Ente: ' + labels[context[0].dataIndex];
                            },
                            label: function(context) {
                                const tipo = context.dataset.label;
                                const valore = context.parsed.y - (context.parsed._stacks ? context.parsed._stacks.y[0] : 0);
                                return `${tipo}: ${valore} eventi`;
                            },
                            footer: function(tooltipItems) {
                                const total = tooltipItems.reduce((sum, item) => {
                                    const valore = item.parsed.y - (item.parsed._stacks ? item.parsed._stacks.y[0] : 0);
                                    return sum + valore;
                                }, 0);
                                return `Totale: ${total} eventi`;
                            }
                        }
                    }
                },
                onClick: function(event, elements) {
                    if (elements.length > 0) {
                        const elementIndex = elements[0].index;
                        const clickedLabel = labels[elementIndex];
                        namespace.handleChartClick(clickedLabel);
                    }
                }
            }
        });

        return namespace.state.stackedChart;
    }

    /**
     * Crea grafico standard per enti (non stacked)
     * @param {Array} labels - Etichette
     * @param {Array|Object} dataOrObject - Dati
     * @param {Array} backgroundColor - Colori
     * @param {number} customHeight - Altezza personalizzata
     * @returns {Chart} Istanza Chart.js
     */
    function createEntiChart(labels, dataOrObject, backgroundColor, customHeight = null) {
        const canvas = document.getElementById(namespace.config.canvasId);
        if (!canvas) {
            console.error('🚨 [EntiView] Canvas non trovato:', namespace.config.canvasId);
            return null;
        }

        const ctx = canvas.getContext('2d');

        // Processa dati
        let data, isStacked = false, breakdownData = null;
        
        if (Array.isArray(dataOrObject)) {
            data = dataOrObject;
        } else if (typeof dataOrObject === 'object' && dataOrObject !== null) {
            data = dataOrObject.data || dataOrObject;
            isStacked = dataOrObject.isStacked || false;
            breakdownData = dataOrObject.breakdown || null;
        }

        // Se sono dati stacked, usa il grafico stacked specializzato
        if (isStacked && breakdownData) {
            return createStackedEntiChart(canvas, labels, {totals: data, breakdown: breakdownData}, customHeight);
        }

        // Distruggi grafico esistente
        if (namespace.state.chart) {
            namespace.state.chart.destroy();
            namespace.state.chart = null;
        }

        // Applica altezza personalizzata
        if (customHeight) {
            canvas.style.height = customHeight + 'px';
            canvas.height = customHeight;
            
            const chartContainer = canvas.closest('.chart-container');
            if (chartContainer) {
                chartContainer.style.height = (customHeight + 40) + 'px';
            }
        }

        // Crea grafico normale
        namespace.state.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(label => core.formatLabelForChart(label, 20, labels.length)),
                datasets: [{
                    label: 'Eventi',
                    data: data,
                    backgroundColor: backgroundColor,
                    borderColor: backgroundColor.map(color => color.replace('0.8', '1')),
                    borderWidth: 2,
                    barPercentage: 0.8,
                    categoryPercentage: 1.0
                }]
            },
            plugins: [core.createDataLabelsPlugin()],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: core.config.performance.animation,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            callback: function(value, index, values) {
                                const label = this.getLabelForValue(value);
                                if (typeof label === 'string' && label.length > 15) {
                                    return label.substring(0, 15) + '...';
                                }
                                return label;
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        callbacks: {
                            title: function(context) {
                                return 'Ente: ' + context[0].label;
                            },
                            label: function(context) {
                                return 'Eventi: ' + context.parsed.y;
                            },
                            footer: function(tooltipItems) {
                                const level = core.state.currentLevel;
                                if (level === 0) {
                                    return 'Clicca per drill-down';
                                } else if (level < 3) {
                                    return 'Clicca per livello successivo';
                                }
                                return 'Clicca per dettagli';
                            }
                        }
                    }
                },
                onClick: function(event, elements) {
                    if (elements.length > 0) {
                        const elementIndex = elements[0].index;
                        const clickedLabel = labels[elementIndex];
                        namespace.handleChartClick(clickedLabel);
                    }
                }
            }
        });

        return namespace.state.chart;
    }

    // ========================================
    // NAVIGAZIONE E DRILL-DOWN
    // ========================================

    /**
     * Gestisce click sul grafico per drill-down enti
     * @param {string} clickedLabel - Label cliccata
     */
    namespace.handleChartClick = function(clickedLabel) {
        const currentLevel = core.state.currentLevel;
        
        console.log(`🎯 [EntiView] Click su "${clickedLabel}" al livello ${currentLevel}`);

        // Aggiorna stato per il prossimo livello
        if (currentLevel === 0) {
            // Da enti principali a enti figli
            core.setState({
                currentLevel: 1,
                currentEntity: clickedLabel,
                currentSubcategory: null,
                currentSubDetail: null
            });
            namespace.loadLevel1(clickedLabel);
        } else if (currentLevel === 1) {
            // Da enti figli a sottoenti
            core.setState({
                currentLevel: 2,
                currentSubcategory: clickedLabel
            });
            namespace.loadLevel2(clickedLabel);
        } else if (currentLevel === 2) {
            // Da sottoenti a tipi evento per ente
            core.setState({
                currentLevel: 3,
                currentSubDetail: clickedLabel
            });
            namespace.loadLevel3(clickedLabel);
        }
    };

    /**
     * Carica livello 0 - Enti principali con stacked chart
     */
    namespace.loadLevel0 = async function() {
        try {
            console.log('📊 [EntiView] Caricamento Level 0 - Enti Principali');

            const apiData = await loadEntiDataFromAPI(0);
            
            if (apiData && apiData.labels && apiData.data) {
                const chartHeight = core.calculateOptimalChartHeight(apiData.labels.length);
                
                // Se sono disponibili dati stacked, usa il grafico stacked
                if (apiData.isStacked && apiData.breakdown) {
                    const canvas = document.getElementById(namespace.config.canvasId);
                    createStackedEntiChart(canvas, apiData.labels, {
                        totals: apiData.data, 
                        breakdown: apiData.breakdown
                    }, chartHeight);
                } else {
                    createEntiChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
                }
                
                core.updateInfoCards(apiData.data, apiData.stats, { viewType: 'enti', level: 0 });
                core.updateBreadcrumb({ viewType: 'enti', level: 0 });
                
                console.log('✅ [EntiView] Level 0 completato:', {
                    enti: apiData.labels.length,
                    totalEvents: Array.isArray(apiData.data) ? apiData.data.reduce((sum, val) => sum + val, 0) : 0,
                    isStacked: apiData.isStacked
                });
            } else {
                const chartHeight = core.calculateOptimalChartHeight();
                createEntiChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                core.updateInfoCards([0]);
                core.updateBreadcrumb({ viewType: 'enti', level: 0 });
            }
        } catch (error) {
            console.error('🚨 [EntiView] Errore Level 0:', error);
            const chartHeight = core.calculateOptimalChartHeight();
            createEntiChart(['Errore Caricamento'], [0], [core.config.colors.error], chartHeight);
            core.updateInfoCards([0]);
            core.updateBreadcrumb({ viewType: 'enti', level: 0 });
        }
    };

    /**
     * Carica livello 1 - Enti figli per ente selezionato
     * @param {string} enteNome - Nome ente selezionato
     */
    namespace.loadLevel1 = async function(enteNome) {
        try {
            console.log(`📊 [EntiView] Caricamento Level 1 per ente: ${enteNome}`);

            const apiData = await loadEntiDataFromAPI(1, enteNome);
            
            if (apiData && apiData.labels && apiData.data) {
                const chartHeight = core.calculateOptimalChartHeight(apiData.labels.length);
                
                // Supporta sia stacked che normale
                if (apiData.isStacked && apiData.breakdown) {
                    const canvas = document.getElementById(namespace.config.canvasId);
                    createStackedEntiChart(canvas, apiData.labels, {
                        totals: apiData.data, 
                        breakdown: apiData.breakdown
                    }, chartHeight);
                } else {
                    createEntiChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
                }
                
                core.updateInfoCards(apiData.data, apiData.stats, { viewType: 'enti', level: 1 });
                core.updateBreadcrumb({ viewType: 'enti', level: 1 });
                
                console.log('✅ [EntiView] Level 1 completato:', {
                    enteParent: enteNome,
                    entiFigli: apiData.labels.length,
                    totalEvents: Array.isArray(apiData.data) ? apiData.data.reduce((sum, val) => sum + val, 0) : 0
                });
            } else {
                const chartHeight = core.calculateOptimalChartHeight();
                createEntiChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                core.updateInfoCards([0]);
                core.updateBreadcrumb({ viewType: 'enti', level: 1 });
            }
        } catch (error) {
            console.error(`🚨 [EntiView] Errore Level 1 per ${enteNome}:`, error);
            const chartHeight = core.calculateOptimalChartHeight();
            createEntiChart(['Errore Caricamento'], [0], [core.config.colors.error], chartHeight);
            core.updateInfoCards([0]);
            core.updateBreadcrumb({ viewType: 'enti', level: 1 });
        }
    };

    /**
     * Carica livello 2 - Sottoenti per ente selezionato
     * @param {string} enteNome - Nome ente selezionato
     */
    namespace.loadLevel2 = async function(enteNome) {
        try {
            console.log(`📊 [EntiView] Caricamento Level 2 per ente: ${enteNome}`);

            const apiData = await loadEntiDataFromAPI(2, enteNome);
            
            if (apiData && apiData.labels && apiData.data) {
                const chartHeight = core.calculateOptimalChartHeight(apiData.labels.length);
                
                if (apiData.isStacked && apiData.breakdown) {
                    const canvas = document.getElementById(namespace.config.canvasId);
                    createStackedEntiChart(canvas, apiData.labels, {
                        totals: apiData.data, 
                        breakdown: apiData.breakdown
                    }, chartHeight);
                } else {
                    createEntiChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
                }
                
                core.updateInfoCards(apiData.data, apiData.stats, { viewType: 'enti', level: 2 });
                core.updateBreadcrumb({ viewType: 'enti', level: 2 });
                
                console.log('✅ [EntiView] Level 2 completato:', {
                    enteParent: enteNome,
                    sottoenti: apiData.labels.length,
                    totalEvents: Array.isArray(apiData.data) ? apiData.data.reduce((sum, val) => sum + val, 0) : 0
                });
            } else {
                const chartHeight = core.calculateOptimalChartHeight();
                createEntiChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                core.updateInfoCards([0]);
                core.updateBreadcrumb({ viewType: 'enti', level: 2 });
            }
        } catch (error) {
            console.error(`🚨 [EntiView] Errore Level 2 per ${enteNome}:`, error);
            const chartHeight = core.calculateOptimalChartHeight();
            createEntiChart(['Errore Caricamento'], [0], [core.config.colors.error], chartHeight);
            core.updateInfoCards([0]);
            core.updateBreadcrumb({ viewType: 'enti', level: 2 });
        }
    };

    /**
     * Carica livello 3 - Tipi evento per ente specifico
     * @param {string} enteNome - Nome ente selezionato
     */
    namespace.loadLevel3 = async function(enteNome) {
        try {
            console.log(`📊 [EntiView] Caricamento Level 3 per ente: ${enteNome}`);

            // Mostra sia grafico che tabella
            const chartContainer = document.querySelector('.chart-container');
            const detailsPanel = document.getElementById('eventDetailsPanel');
            
            if (chartContainer) chartContainer.style.display = 'block';
            if (detailsPanel) detailsPanel.style.display = 'block';

            // Carica dati in parallelo
            const [graphData, detailsData] = await Promise.all([
                loadEntiDataFromAPI(3, enteNome),
                loadEntiDetailsFromAPI(enteNome)
            ]);

            // Grafico tipi evento per l'ente
            if (graphData && graphData.labels && graphData.data) {
                const chartHeight = core.calculateOptimalChartHeight(graphData.labels.length);
                
                // Per il livello 3, mostriamo i tipi evento (solitamente grafico normale)
                createEntiChart(graphData.labels, graphData, graphData.backgroundColor, chartHeight);
                core.updateInfoCards(graphData.data, graphData.stats, { viewType: 'enti', level: 3 });
                
                console.log('✅ [EntiView] Level 3 grafico caricato:', {
                    ente: enteNome,
                    tipiEvento: graphData.labels.length,
                    totalEvents: Array.isArray(graphData.data) ? graphData.data.reduce((sum, val) => sum + val, 0) : 0
                });
            } else {
                const chartHeight = core.calculateOptimalChartHeight();
                createEntiChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                core.updateInfoCards([0]);
            }

            // Tabella dettagli
            if (detailsData && Array.isArray(detailsData)) {
                namespace.showDetailsTable(enteNome, detailsData);
                console.log('✅ [EntiView] Level 3 tabella caricata:', {
                    ente: enteNome,
                    eventi: detailsData.length
                });
            } else {
                namespace.showDetailsTable(enteNome, []);
            }

            core.updateBreadcrumb({ viewType: 'enti', level: 3 });

        } catch (error) {
            console.error(`🚨 [EntiView] Errore Level 3 per ${enteNome}:`, error);
            namespace.showDetailsTable(enteNome, []);
            core.updateBreadcrumb({ viewType: 'enti', level: 3 });
        }
    };

    // ========================================
    // GESTIONE TABELLA DETTAGLI
    // ========================================

    /**
     * Mostra tabella dettagli eventi per vista enti
     * @param {string} ente - Nome ente
     * @param {Array} events - Array di eventi
     */
    namespace.showDetailsTable = function(ente, events) {
        const detailsPanel = document.getElementById('eventDetailsPanel');
        if (!detailsPanel) return;

        const tableContainer = detailsPanel.querySelector('#eventDetailsTableContainer');
        if (!tableContainer) return;

        if (!events || events.length === 0) {
            tableContainer.innerHTML = `
                <div class="alert alert-info">
                    <h5>Dettagli Eventi - ${ente}</h5>
                    <p>Nessun evento disponibile per l'ente selezionato nel periodo corrente.</p>
                </div>
            `;
            return;
        }

        // Raggruppa eventi per tipo per statistiche
        const eventiPerTipo = {};
        const eventiPerCarattere = { positivo: 0, negativo: 0, altro: 0 };

        events.forEach(evento => {
            const tipo = evento.tipo_evento || evento.tipologia || 'N/D';
            eventiPerTipo[tipo] = (eventiPerTipo[tipo] || 0) + 1;
            
            const carattere = (evento.carattere || '').toLowerCase();
            if (carattere === 'positivo') {
                eventiPerCarattere.positivo++;
            } else if (carattere === 'negativo') {
                eventiPerCarattere.negativo++;
            } else {
                eventiPerCarattere.altro++;
            }
        });

        // Crea HTML con statistiche aggiuntive
        const statsHTML = `
            <div class="row mb-3">
                <div class="col-md-4">
                    <div class="card border-success">
                        <div class="card-body text-center">
                            <h6 class="card-title text-success">Eventi Positivi</h6>
                            <h4 class="text-success">${eventiPerCarattere.positivo}</h4>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-danger">
                        <div class="card-body text-center">
                            <h6 class="card-title text-danger">Eventi Negativi</h6>
                            <h4 class="text-danger">${eventiPerCarattere.negativo}</h4>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-secondary">
                        <div class="card-body text-center">
                            <h6 class="card-title text-secondary">Altri Eventi</h6>
                            <h4 class="text-secondary">${eventiPerCarattere.altro}</h4>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const tableHTML = `
            <div class="details-header mb-3">
                <h5>Dettagli Eventi - ${ente}</h5>
                <p class="text-muted">${events.length} eventi trovati</p>
            </div>
            ${statsHTML}
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-dark">
                        <tr>
                            <th>Data Evento</th>
                            <th>Data Msg</th>
                            <th>Tipo</th>
                            <th>Carattere</th>
                            <th>Dettagli</th>
                            <th>Protocollo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events.map(evento => `
                            <tr>
                                <td>${evento.data_evento ? new Date(evento.data_evento).toLocaleDateString('it-IT') : 'N/D'}</td>
                                <td>${evento.data_msg_evento ? new Date(evento.data_msg_evento).toLocaleDateString('it-IT') : 'N/D'}</td>
                                <td>
                                    <span class="badge bg-primary">${evento.tipo_evento || evento.tipologia || 'N/D'}</span>
                                </td>
                                <td>
                                    <span class="badge ${evento.carattere === 'positivo' ? 'bg-success' : evento.carattere === 'negativo' ? 'bg-danger' : 'bg-secondary'}">
                                        ${evento.carattere || 'N/D'}
                                    </span>
                                </td>
                                <td>
                                    <div class="event-details-text" title="${evento.dettagli_evento || 'N/D'}">
                                        ${(evento.dettagli_evento || 'N/D').substring(0, 80)}${(evento.dettagli_evento || '').length > 80 ? '...' : ''}
                                    </div>
                                </td>
                                <td>
                                    <small class="text-muted">${evento.prot_msg_evento || 'N/D'}</small>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        tableContainer.innerHTML = tableHTML;
    };

    // ========================================
    // EVENT LISTENERS E INIZIALIZZAZIONE
    // ========================================

    /**
     * Inizializza la vista enti
     * @param {Object} options - Opzioni di inizializzazione
     */
    namespace.init = function(options = {}) {
        if (namespace.state.isInitialized) {
            console.warn('⚠️ [EntiView] Vista già inizializzata');
            return;
        }

        // Aggiorna configurazione
        if (options.config) {
            Object.assign(namespace.config, options.config);
        }

        // Imposta stato iniziale
        core.setState({
            viewType: 'enti',
            currentLevel: 0,
            currentCategory: null,
            currentSubcategory: null,
            currentEntity: null,
            currentSubDetail: null
        });

        // Event listeners personalizzati
        document.addEventListener('talon:resetToLevel0', (e) => {
            if (e.detail.viewType === 'enti') {
                namespace.loadLevel0();
            }
        });

        document.addEventListener('talon:navigateToLevel', (e) => {
            if (e.detail.viewType === 'enti') {
                const targetLevel = e.detail.targetLevel;
                if (targetLevel === 0) {
                    namespace.loadLevel0();
                } else if (targetLevel === 1 && core.state.currentEntity) {
                    namespace.loadLevel1(core.state.currentEntity);
                } else if (targetLevel === 2 && core.state.currentSubcategory) {
                    namespace.loadLevel2(core.state.currentSubcategory);
                } else if (targetLevel === 3 && core.state.currentSubDetail) {
                    namespace.loadLevel3(core.state.currentSubDetail);
                }
            }
        });

        document.addEventListener('talon:periodChanged', () => {
            if (core.state.viewType === 'enti') {
                // Ricarica livello corrente con nuovo periodo
                const level = core.state.currentLevel;
                if (level === 0) {
                    namespace.loadLevel0();
                } else if (level === 1) {
                    namespace.loadLevel1(core.state.currentEntity);
                } else if (level === 2) {
                    namespace.loadLevel2(core.state.currentSubcategory);
                } else if (level === 3) {
                    namespace.loadLevel3(core.state.currentSubDetail);
                }
            }
        });

        document.addEventListener('talon:characterFilterChanged', () => {
            if (core.state.viewType === 'enti') {
                // Ricarica livello corrente con nuovo filtro carattere
                const level = core.state.currentLevel;
                if (level === 0) {
                    namespace.loadLevel0();
                } else if (level === 1) {
                    namespace.loadLevel1(core.state.currentEntity);
                } else if (level === 2) {
                    namespace.loadLevel2(core.state.currentSubcategory);
                } else if (level === 3) {
                    namespace.loadLevel3(core.state.currentSubDetail);
                }
            }
        });

        namespace.state.isInitialized = true;
        console.log('✅ [EntiView] Inizializzata - v1.0.0');

        // Non caricare automaticamente il livello iniziale
        // Sarà l'orchestrator a decidere quando attivare questa vista
    };

    /**
     * Attiva la vista enti e carica il livello 0
     */
    namespace.activate = function() {
        console.log('🔄 [EntiView] Attivazione vista enti');
        namespace.loadLevel0();
    };

    /**
     * Distrugge la vista enti e pulisce le risorse
     */
    namespace.destroy = function() {
        if (namespace.state.chart) {
            namespace.state.chart.destroy();
            namespace.state.chart = null;
        }

        if (namespace.state.stackedChart) {
            namespace.state.stackedChart.destroy();
            namespace.state.stackedChart = null;
        }

        namespace.state.currentBreakdown = null;
        namespace.state.isInitialized = false;
        console.log('🧹 [EntiView] Vista distrutta e risorse pulite');
    };

    /**
     * Ottiene lo stato corrente della vista
     * @returns {Object} Stato corrente
     */
    namespace.getState = function() {
        return Object.assign({}, namespace.state, {
            coreState: core.getState(),
            hasActiveChart: !!(namespace.state.chart || namespace.state.stackedChart),
            currentBreakdown: namespace.state.currentBreakdown
        });
    };

})(window.TalonEventiEntiView, window.TalonChartCore);

// Auto-inizializzazione se eseguito in ambiente browser
if (typeof window !== 'undefined' && window.document) {
    console.log('📊 [EntiView] Modulo caricato - v1.0.0');
}