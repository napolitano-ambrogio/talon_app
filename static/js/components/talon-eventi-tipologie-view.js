/**
 * ========================================
 * TALON EVENTI - Vista Tipologie
 * File: talon-eventi-tipologie-view.js
 * 
 * Versione: 1.0.0
 * Vista specializzata per drill-down per tipologia di evento
 * Livelli: 0=Tipi Evento -> 1=Enti per Tipo -> 2=Sottoenti -> 3=Dettagli
 * ========================================
 */

// Dipendenza dal modulo core
if (typeof window.TalonChartCore === 'undefined') {
    throw new Error('TalonChartCore richiesto per TalonEventiTipologieView');
}

window.TalonEventiTipologieView = window.TalonEventiTipologieView || {};

(function(namespace, core) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE SPECIFICA VISTA TIPOLOGIE
    // ========================================

    namespace.config = {
        canvasId: 'eventChartCanvas',
        viewType: 'tipologie',
        apiEndpoints: {
            level0: '/eventi/api/dashboard-data',
            level1: '/eventi/api/enti-livello1',
            level2: '/eventi/api/enti-livello2',
            level3: '/eventi/api/dettagli'
        },
        chartColors: {
            tipoA: 'rgba(255, 99, 132, 0.8)',
            tipoB: 'rgba(54, 162, 235, 0.8)',
            tipoC: 'rgba(255, 205, 86, 0.8)',
            tipoD: 'rgba(75, 192, 192, 0.8)',
            tipoE: 'rgba(153, 102, 255, 0.8)'
        }
    };

    // ========================================
    // GESTIONE STATO LOCALE VISTA
    // ========================================

    namespace.state = {
        chart: null,
        isInitialized: false,
        lastAPIResponse: null
    };

    // ========================================
    // FUNZIONI API SPECIFICHE PER TIPOLOGIE
    // ========================================

    /**
     * Carica dati dall'API per vista tipologie
     * @param {number} level - Livello di drill-down (0-3)
     * @param {string} parentLabel - Label del livello precedente
     * @returns {Promise<Object>} Dati per il grafico
     */
    async function loadTipologieDataFromAPI(level = 0, parentLabel = null) {
        try {
            let url = namespace.config.apiEndpoints.level0;
            const params = core.buildCommonAPIParams();

            // Determina URL e parametri specifici per livello
            switch (level) {
                case 1:
                    url = namespace.config.apiEndpoints.level1;
                    if (parentLabel) {
                        const tipoEvento = parentLabel.toLowerCase().replace(' ', '_');
                        params.append('tipo_evento', tipoEvento);
                    }
                    params.append('include_character_stats', 'true');
                    break;

                case 2:
                    url = namespace.config.apiEndpoints.level2;
                    if (core.state.currentCategory) {
                        const tipoEvento = core.state.currentCategory.toLowerCase().replace(' ', '_');
                        params.append('tipo_evento', tipoEvento);
                    }
                    if (parentLabel) {
                        params.append('ente_parent', parentLabel);
                    }
                    break;

                case 3:
                    url = namespace.config.apiEndpoints.level3;
                    if (core.state.currentCategory) {
                        const tipoEvento = core.state.currentCategory.toLowerCase().replace(' ', '_');
                        params.append('sottocategoria', tipoEvento);
                    }
                    if (parentLabel) {
                        params.append('ente', parentLabel);
                    }
                    params.append('aggregate_for_chart', 'true');
                    params.append('level', '3');
                    break;
            }

            const fullUrl = `${url}?${params.toString()}`;
            
            console.log(`📊 [TipologieView] API Request Level ${level}:`, {
                url: fullUrl,
                parentLabel: parentLabel,
                currentCategory: core.state.currentCategory
            });

            const result = await core.fetchWithCache(fullUrl, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                cacheMetadata: {
                    level: level,
                    viewType: 'tipologie',
                    parentLabel: parentLabel,
                    category: core.state.currentCategory
                }
            });
            namespace.state.lastAPIResponse = result;

            // Gestisci risposte specifiche per livello
            return processAPIResponse(result, level);

        } catch (error) {
            console.error(`🚨 [TipologieView] Errore API Level ${level}:`, error);
            return core.handleAPIError(error, `Tipologie Level ${level}`);
        }
    }

    /**
     * Processa la risposta API in base al livello
     * @param {Object} result - Risposta API
     * @param {number} level - Livello corrente
     * @returns {Object} Dati processati per il grafico
     */
    function processAPIResponse(result, level) {
        if (!result.success && !result.chart && !result.data) {
            throw new Error(result.error || 'Risposta API non valida');
        }

        // Level 3 con dati aggregati per grafico temporale
        if (level === 3 && result.chart_data === true) {
            console.log(`📊 [TipologieView] Dati temporali aggregati Level 3:`, {
                labels: result.labels?.length || 0,
                data: result.data?.length || 0
            });

            return {
                labels: result.labels || [],
                data: result.data || [],
                backgroundColor: result.backgroundColor || [],
                stats: result.stats || null,
                chart_data: true,
                isTimeSeries: true
            };
        }

        // Level 0: formato con result.chart
        if (result.chart && result.chart.labels && result.chart.data) {
            return {
                labels: result.chart.labels || [],
                data: result.chart.data || [],
                backgroundColor: result.chart.backgroundColor || [],
                stats: result.stats || null
            };
        }

        // Level 1+: formato con result.data
        if (result.data && result.data.labels && result.data.values) {
            return {
                labels: result.data.labels || [],
                data: result.data.values || [],
                backgroundColor: result.data.backgroundColor || [],
                stats: result.stats || null
            };
        }

        // Fallback con dati vuoti
        console.warn('⚠️ [TipologieView] Formato dati API non riconosciuto:', result);
        return {
            labels: ['Nessun Dato'],
            data: [0],
            backgroundColor: [core.config.colors.noData],
            stats: null
        };
    }

    /**
     * Carica dettagli eventi per un ente specifico
     * @param {string} enteNome - Nome dell'ente
     * @returns {Promise<Array>} Array di eventi dettagliati
     */
    async function loadEventDetailsFromAPI(enteNome) {
        try {
            const params = core.buildCommonAPIParams();
            
            // Aggiungi filtro carattere specifico per dettagli
            const carattereFiltro = core.getCharacterFilter();
            if (carattereFiltro) {
                params.append('categoria', carattereFiltro);
            }
            
            // Aggiungi tipo evento corrente
            if (core.state.currentCategory) {
                const tipoEvento = core.state.currentCategory.toLowerCase().replace(' ', '_');
                params.append('sottocategoria', tipoEvento);
            }
            
            // Aggiungi ente per dettagli
            params.append('ente', enteNome);
            
            const fullUrl = `/eventi/api/dettagli?${params.toString()}`;
            
            const result = await core.fetchWithCache(fullUrl, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                cacheTTL: 2 * 60 * 1000, // TTL breve per dettagli (2 minuti)
                cacheMetadata: {
                    level: 'details',
                    viewType: 'tipologie',
                    ente: enteNome,
                    category: core.state.currentCategory
                }
            });
            
            if (result.success && result.data) {
                return result.data;
            }
            
            throw new Error(result.error || 'Errore caricamento dettagli');
            
        } catch (error) {
            console.error('🚨 [TipologieView] Errore caricamento dettagli:', error);
            return [];
        }
    }

    // ========================================
    // CREAZIONE GRAFICI SPECIFICI
    // ========================================

    /**
     * Crea grafico Chart.js per vista tipologie
     * @param {Array} labels - Etichette
     * @param {Array|Object} dataOrObject - Dati o oggetto completo
     * @param {Array} backgroundColor - Colori
     * @param {number} customHeight - Altezza personalizzata
     * @returns {Chart} Istanza Chart.js
     */
    function createTipologieChart(labels, dataOrObject, backgroundColor, customHeight = null) {
        // Validazione input
        if (!labels || !Array.isArray(labels) || labels.length === 0) {
            console.error('🚨 [TipologieView] Labels non valide:', labels);
            return null;
        }

        if (!dataOrObject) {
            console.error('🚨 [TipologieView] Dati non forniti');
            return null;
        }

        const canvas = document.getElementById(namespace.config.canvasId);
        if (!canvas) {
            console.error('🚨 [TipologieView] Canvas non trovato:', namespace.config.canvasId);
            return null;
        }

        const ctx = canvas.getContext('2d');

        // Processa dati
        let data, isTimeSeries = false;
        
        if (Array.isArray(dataOrObject)) {
            data = dataOrObject;
        } else if (typeof dataOrObject === 'object' && dataOrObject !== null) {
            data = dataOrObject.data || dataOrObject;
            isTimeSeries = dataOrObject.chart_data === true || dataOrObject.isTimeSeries === true;
        } else {
            console.error('🚨 [TipologieView] Tipo dati non supportato:', typeof dataOrObject);
            return null;
        }

        // Distruggi grafico esistente (sia interno che globale per evitare conflitti)
        if (namespace.state.chart) {
            namespace.state.chart.destroy();
            namespace.state.chart = null;
        }
        
        // CRITICO: Distruggi anche il chart globale dal sistema legacy se presente
        if (window.eventChart && typeof window.eventChart.destroy === 'function') {
            console.log('🧹 [TipologieView] Distruggendo chart globale legacy per evitare conflitto canvas');
            window.eventChart.destroy();
            window.eventChart = null;
        }
        
        // Controllo aggiuntivo: verifica Chart.js instances sul canvas
        try {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                console.log('🧹 [TipologieView] Trovato chart Chart.js esistente, distruggendo...');
                existingChart.destroy();
            }
        } catch (error) {
            // Chart.getChart potrebbe non essere disponibile in versioni più vecchie
            console.warn('⚠️ [TipologieView] Chart.getChart non disponibile:', error.message);
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

        // Determina tipo di grafico
        const chartType = isTimeSeries ? 'line' : 'bar';
        
        console.log(`📈 [TipologieView] Creazione grafico tipo: ${chartType}`, {
            isTimeSeries: isTimeSeries,
            labelsCount: labels.length,
            dataCount: data.length
        });

        // Configurazione dataset
        const dataset = isTimeSeries ? {
            label: 'Tendenza Eventi',
            data: data,
            backgroundColor: core.config.colors.primaryTransparent,
            borderColor: core.config.colors.primary,
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: core.config.colors.primary,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
        } : {
            label: 'Eventi',
            data: data,
            backgroundColor: backgroundColor,
            borderColor: backgroundColor.map(color => color.replace('0.8', '1')),
            borderWidth: 2,
            barPercentage: 0.8,
            categoryPercentage: 1.0
        };

        // Crea grafico
        namespace.state.chart = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels.map(label => core.formatLabelForChart(label, 20, labels.length)),
                datasets: [dataset]
            },
            plugins: isTimeSeries ? [] : [core.createDataLabelsPlugin()],
            options: createChartOptions(isTimeSeries, labels, data)
        });

        // CRITICO: Sincronizza con sistema legacy per evitare conflitti futuri
        window.eventChart = namespace.state.chart;
        console.log('🔄 [TipologieView] Chart sincronizzato con sistema legacy');

        return namespace.state.chart;
    }

    /**
     * Crea opzioni specifiche per Chart.js
     * @param {boolean} isTimeSeries - Se è un grafico temporale
     * @param {Array} labels - Etichette
     * @param {Array} data - Dati
     * @returns {Object} Opzioni Chart.js
     */
    function createChartOptions(isTimeSeries, labels, data) {
        const baseOptions = core.getBaseChartConfig({
            chartType: isTimeSeries ? 'line' : 'bar',
            showLegend: isTimeSeries
        });

        if (isTimeSeries) {
            // Opzioni per grafico temporale
            baseOptions.plugins.tooltip = {
                enabled: true,
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: core.config.colors.primary,
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
            };

            baseOptions.scales = {
                x: {
                    type: 'category',
                    title: {
                        display: true,
                        text: 'Periodo',
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        font: { size: 12 }
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
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        font: { size: 12 },
                        precision: 0
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            };

            // Click disabilitato per grafici temporali
            baseOptions.onClick = () => {
                console.log('📊 [TipologieView] Click disabilitato per grafico temporale');
            };
        } else {
            // Opzioni per grafico a barre standard
            baseOptions.plugins.tooltip = {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    title: function(context) {
                        const level = core.state.currentLevel;
                        if (level === 0) {
                            return 'Tipologia: ' + context[0].label;
                        } else if (level === 1) {
                            return 'Ente: ' + context[0].label;
                        } else if (level === 2) {
                            return 'Sottoente: ' + context[0].label;
                        }
                        return context[0].label;
                    },
                    label: function(context) {
                        return 'Eventi: ' + context.parsed.y;
                    },
                    footer: function(tooltipItems) {
                        if (core.state.currentLevel === 0) {
                            return 'Clicca per visualizzare enti';
                        } else if (core.state.currentLevel === 1) {
                            return 'Clicca per visualizzare sottoenti';
                        } else if (core.state.currentLevel === 2) {
                            return 'Clicca per dettagli eventi';
                        }
                        return 'Clicca per dettagli';
                    }
                }
            };

            baseOptions.scales = {
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
            };

            // Click handler per drill-down
            baseOptions.onClick = function(event, elements) {
                if (elements.length > 0) {
                    const elementIndex = elements[0].index;
                    const clickedLabel = labels[elementIndex];
                    namespace.handleChartClick(clickedLabel);
                }
            };
        }

        return baseOptions;
    }

    // ========================================
    // NAVIGAZIONE E DRILL-DOWN
    // ========================================

    /**
     * Gestisce click sul grafico per drill-down
     * @param {string} clickedLabel - Label cliccata
     */
    namespace.handleChartClick = function(clickedLabel) {
        const currentLevel = core.state.currentLevel;
        
        console.log(`🎯 [TipologieView] Click su "${clickedLabel}" al livello ${currentLevel}`);

        // Aggiorna stato per il prossimo livello
        if (currentLevel === 0) {
            // Da tipologie a enti per tipologia
            core.setState({
                currentLevel: 1,
                currentCategory: clickedLabel,
                currentSubcategory: null,
                currentEntity: null
            });
            namespace.loadLevel1(clickedLabel);
        } else if (currentLevel === 1) {
            // Da enti a sottoenti
            core.setState({
                currentLevel: 2,
                currentSubcategory: clickedLabel,
                currentEntity: clickedLabel
            });
            namespace.loadLevel2(clickedLabel);
        } else if (currentLevel === 2) {
            // Da sottoenti a dettagli
            core.setState({
                currentLevel: 3,
                currentEntity: clickedLabel
            });
            namespace.loadLevel3(clickedLabel);
        }
    };

    /**
     * Carica livello 0 - Tipologie eventi
     */
    namespace.loadLevel0 = async function() {
        try {
            console.log('📊 [TipologieView] Caricamento Level 0 - Tipologie Eventi');

            const apiData = await loadTipologieDataFromAPI(0);
            
            if (apiData && apiData.labels && apiData.data) {
                const chartHeight = core.calculateOptimalChartHeight(apiData.labels.length);
                createTipologieChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
                
                // Aggiornamento robusto delle infocard con validazione
                try {
                    const levelStats = await core.updateInfoCards(apiData.data, apiData.stats, { 
                        viewType: 'tipologie', 
                        level: 0,
                        context: {
                            labels: apiData.labels,
                            totalFromGraph: apiData.data.reduce((sum, val) => sum + val, 0)
                        }
                    });
                    
                    console.log('✅ [TipologieView] Level 0 infocard aggiornate:', {
                        isValid: levelStats.validation.isValid,
                        warnings: levelStats.validation.warnings.length
                    });
                } catch (error) {
                    console.error('🚨 [TipologieView] Errore aggiornamento infocard Level 0:', error);
                }
                
                core.updateBreadcrumb({ viewType: 'tipologie', level: 0 });
                
                console.log('✅ [TipologieView] Level 0 completato:', {
                    tipologie: apiData.labels.length,
                    totalEvents: apiData.data.reduce((sum, val) => sum + val, 0)
                });
            } else {
                // Grafico vuoto
                const chartHeight = core.calculateOptimalChartHeight();
                createTipologieChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                
                try {
                    await core.updateInfoCards([0], null, { 
                        viewType: 'tipologie', 
                        level: 0,
                        context: { isEmpty: true }
                    });
                } catch (error) {
                    console.error('🚨 [TipologieView] Errore aggiornamento infocard vuoto Level 0:', error);
                }
                
                core.updateBreadcrumb({ viewType: 'tipologie', level: 0 });
            }
        } catch (error) {
            console.error('🚨 [TipologieView] Errore Level 0:', error);
            const chartHeight = core.calculateOptimalChartHeight();
            createTipologieChart(['Errore Caricamento'], [0], [core.config.colors.error], chartHeight);
            
            try {
                await core.updateInfoCards([0], null, { 
                    viewType: 'tipologie', 
                    level: 0,
                    context: { hasError: true, error: error.message }
                });
            } catch (infocardError) {
                console.error('🚨 [TipologieView] Errore aggiornamento infocard in caso di errore Level 0:', infocardError);
            }
            
            core.updateBreadcrumb({ viewType: 'tipologie', level: 0 });
        }
    };

    /**
     * Carica livello 1 - Enti per tipologia selezionata
     * @param {string} tipologia - Tipologia selezionata
     */
    namespace.loadLevel1 = async function(tipologia) {
        try {
            console.log(`📊 [TipologieView] Caricamento Level 1 per tipologia: ${tipologia}`);

            const apiData = await loadTipologieDataFromAPI(1, tipologia);
            
            if (apiData && apiData.labels && apiData.data) {
                const chartHeight = core.calculateOptimalChartHeight(apiData.labels.length);
                createTipologieChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
                
                // Aggiornamento robusto delle infocard Level 1 con validazione
                try {
                    const levelStats = await core.updateInfoCards(apiData.data, apiData.stats, { 
                        viewType: 'tipologie', 
                        level: 1,
                        context: {
                            tipologia: tipologia,
                            labels: apiData.labels,
                            totalFromGraph: apiData.data.reduce((sum, val) => sum + val, 0)
                        }
                    });
                    
                    console.log('✅ [TipologieView] Level 1 infocard aggiornate:', {
                        tipologia: tipologia,
                        isValid: levelStats.validation.isValid,
                        warnings: levelStats.validation.warnings.length
                    });
                } catch (error) {
                    console.error(`🚨 [TipologieView] Errore aggiornamento infocard Level 1 per ${tipologia}:`, error);
                }
                
                core.updateBreadcrumb({ viewType: 'tipologie', level: 1 });
                
                console.log('✅ [TipologieView] Level 1 completato:', {
                    tipologia: tipologia,
                    enti: apiData.labels.length,
                    totalEvents: apiData.data.reduce((sum, val) => sum + val, 0)
                });
            } else {
                const chartHeight = core.calculateOptimalChartHeight();
                createTipologieChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                
                try {
                    await core.updateInfoCards([0], null, { 
                        viewType: 'tipologie', 
                        level: 1,
                        context: { 
                            tipologia: tipologia,
                            isEmpty: true 
                        }
                    });
                } catch (error) {
                    console.error(`🚨 [TipologieView] Errore aggiornamento infocard vuoto Level 1 per ${tipologia}:`, error);
                }
                
                core.updateBreadcrumb({ viewType: 'tipologie', level: 1 });
            }
        } catch (error) {
            console.error(`🚨 [TipologieView] Errore Level 1 per ${tipologia}:`, error);
            const chartHeight = core.calculateOptimalChartHeight();
            createTipologieChart(['Errore Caricamento'], [0], [core.config.colors.error], chartHeight);
            
            try {
                await core.updateInfoCards([0], null, { 
                    viewType: 'tipologie', 
                    level: 1,
                    context: { 
                        tipologia: tipologia,
                        hasError: true, 
                        error: error.message 
                    }
                });
            } catch (infocardError) {
                console.error(`🚨 [TipologieView] Errore aggiornamento infocard in caso di errore Level 1 per ${tipologia}:`, infocardError);
            }
            
            core.updateBreadcrumb({ viewType: 'tipologie', level: 1 });
        }
    };

    /**
     * Carica livello 2 - Sottoenti per ente selezionato
     * @param {string} ente - Ente selezionato
     */
    namespace.loadLevel2 = async function(ente) {
        try {
            console.log(`📊 [TipologieView] Caricamento Level 2 per ente: ${ente}`);

            const apiData = await loadTipologieDataFromAPI(2, ente);
            
            if (apiData && apiData.labels && apiData.data) {
                const chartHeight = core.calculateOptimalChartHeight(apiData.labels.length);
                createTipologieChart(apiData.labels, apiData, apiData.backgroundColor, chartHeight);
                
                // Aggiornamento robusto delle infocard Level 2 con validazione
                try {
                    const levelStats = await core.updateInfoCards(apiData.data, apiData.stats, { 
                        viewType: 'tipologie', 
                        level: 2,
                        context: {
                            ente: ente,
                            currentEntity: ente, // CRITICO: Aggiunge currentEntity per DataValidator
                            currentCategory: core.state.currentCategory,
                            labels: apiData.labels,
                            totalFromGraph: apiData.data.reduce((sum, val) => sum + val, 0)
                        }
                    });
                    
                    console.log('✅ [TipologieView] Level 2 infocard aggiornate:', {
                        ente: ente,
                        isValid: levelStats.validation.isValid,
                        warnings: levelStats.validation.warnings.length
                    });
                } catch (error) {
                    console.error(`🚨 [TipologieView] Errore aggiornamento infocard Level 2 per ${ente}:`, error);
                }
                
                core.updateBreadcrumb({ viewType: 'tipologie', level: 2 });
                
                console.log('✅ [TipologieView] Level 2 completato:', {
                    ente: ente,
                    sottoenti: apiData.labels.length,
                    totalEvents: apiData.data.reduce((sum, val) => sum + val, 0)
                });
            } else {
                const chartHeight = core.calculateOptimalChartHeight();
                createTipologieChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                
                try {
                    await core.updateInfoCards([0], null, { 
                        viewType: 'tipologie', 
                        level: 2,
                        context: { 
                            ente: ente,
                            currentEntity: ente,
                            currentCategory: core.state.currentCategory,
                            isEmpty: true 
                        }
                    });
                } catch (error) {
                    console.error(`🚨 [TipologieView] Errore aggiornamento infocard vuoto Level 2 per ${ente}:`, error);
                }
                
                core.updateBreadcrumb({ viewType: 'tipologie', level: 2 });
            }
        } catch (error) {
            console.error(`🚨 [TipologieView] Errore Level 2 per ${ente}:`, error);
            const chartHeight = core.calculateOptimalChartHeight();
            createTipologieChart(['Errore Caricamento'], [0], [core.config.colors.error], chartHeight);
            
            try {
                await core.updateInfoCards([0], null, { 
                    viewType: 'tipologie', 
                    level: 2,
                    context: { 
                        ente: ente,
                        currentEntity: ente,
                        currentCategory: core.state.currentCategory,
                        hasError: true, 
                        error: error.message 
                    }
                });
            } catch (infocardError) {
                console.error(`🚨 [TipologieView] Errore aggiornamento infocard in caso di errore Level 2 per ${ente}:`, infocardError);
            }
            
            core.updateBreadcrumb({ viewType: 'tipologie', level: 2 });
        }
    };

    /**
     * Carica livello 3 - Dettagli temporali per ente
     * @param {string} ente - Ente selezionato
     */
    namespace.loadLevel3 = async function(ente) {
        try {
            console.log(`📊 [TipologieView] Caricamento Level 3 per ente: ${ente}`);

            // Mostra sia grafico che tabella
            const chartContainer = document.querySelector('.chart-container');
            const detailsPanel = document.getElementById('eventDetailsPanel');
            
            if (chartContainer) chartContainer.style.display = 'block';
            if (detailsPanel) detailsPanel.style.display = 'block';

            // Carica dati in parallelo
            const [graphData, detailsData] = await Promise.all([
                loadTipologieDataFromAPI(3, ente),
                loadEventDetailsFromAPI(ente)
            ]);

            // Grafico temporale
            if (graphData && graphData.labels && graphData.data) {
                const chartHeight = core.calculateOptimalChartHeight(graphData.labels.length);
                createTipologieChart(graphData.labels, graphData, graphData.backgroundColor, chartHeight);
                
                // Aggiornamento robusto delle infocard Level 3 con validazione
                try {
                    const levelStats = await core.updateInfoCards(graphData.data, graphData.stats, { 
                        viewType: 'tipologie', 
                        level: 3,
                        context: {
                            ente: ente,
                            labels: graphData.labels,
                            totalFromGraph: Array.isArray(graphData.data) ? graphData.data.reduce((sum, val) => sum + val, 0) : graphData.data,
                            isTimeSeries: graphData.chart_data === true
                        }
                    });
                    
                    console.log('✅ [TipologieView] Level 3 infocard aggiornate:', {
                        ente: ente,
                        isValid: levelStats.validation.isValid,
                        warnings: levelStats.validation.warnings.length
                    });
                } catch (error) {
                    console.error(`🚨 [TipologieView] Errore aggiornamento infocard Level 3 per ${ente}:`, error);
                }
                
                console.log('✅ [TipologieView] Level 3 grafico caricato:', {
                    ente: ente,
                    periodi: graphData.labels.length,
                    isTimeSeries: graphData.chart_data === true
                });
            } else {
                const chartHeight = core.calculateOptimalChartHeight();
                createTipologieChart(['Nessun Dato'], [0], [core.config.colors.noData], chartHeight);
                
                try {
                    await core.updateInfoCards([0], null, { 
                        viewType: 'tipologie', 
                        level: 3,
                        context: { 
                            ente: ente,
                            isEmpty: true 
                        }
                    });
                } catch (error) {
                    console.error(`🚨 [TipologieView] Errore aggiornamento infocard vuoto Level 3 per ${ente}:`, error);
                }
            }

            // Tabella dettagli
            if (detailsData && Array.isArray(detailsData)) {
                namespace.showDetailsTable(ente, detailsData);
                console.log('✅ [TipologieView] Level 3 tabella caricata:', {
                    ente: ente,
                    eventi: detailsData.length
                });
            } else {
                namespace.showDetailsTable(ente, []);
            }

            core.updateBreadcrumb({ viewType: 'tipologie', level: 3 });

        } catch (error) {
            console.error(`🚨 [TipologieView] Errore Level 3 per ${ente}:`, error);
            namespace.showDetailsTable(ente, []);
            core.updateBreadcrumb({ viewType: 'tipologie', level: 3 });
        }
    };

    // ========================================
    // GESTIONE TABELLA DETTAGLI
    // ========================================

    /**
     * Mostra tabella dettagli eventi
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

        // Crea HTML tabella
        const tableHTML = `
            <div class="details-header mb-3">
                <h5>Dettagli Eventi - ${ente}</h5>
                <p class="text-muted">${events.length} eventi trovati</p>
            </div>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-dark">
                        <tr>
                            <th>Data Evento</th>
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
                                        ${(evento.dettagli_evento || 'N/D').substring(0, 100)}${(evento.dettagli_evento || '').length > 100 ? '...' : ''}
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
     * Inizializza la vista tipologie
     * @param {Object} options - Opzioni di inizializzazione
     */
    namespace.init = function(options = {}) {
        if (namespace.state.isInitialized) {
            console.warn('⚠️ [TipologieView] Vista già inizializzata');
            return;
        }

        // Aggiorna configurazione
        if (options.config) {
            Object.assign(namespace.config, options.config);
        }

        // Imposta stato iniziale
        core.setState({
            viewType: 'tipologie',
            currentLevel: 0,
            currentCategory: null,
            currentSubcategory: null,
            currentEntity: null
        });

        // Event listeners personalizzati
        document.addEventListener('talon:resetToLevel0', (e) => {
            if (e.detail.viewType === 'tipologie') {
                namespace.loadLevel0();
            }
        });

        document.addEventListener('talon:navigateToLevel', (e) => {
            if (e.detail.viewType === 'tipologie') {
                const targetLevel = e.detail.targetLevel;
                if (targetLevel === 0) {
                    namespace.loadLevel0();
                } else if (targetLevel === 1 && core.state.currentCategory) {
                    namespace.loadLevel1(core.state.currentCategory);
                } else if (targetLevel === 2 && core.state.currentSubcategory) {
                    namespace.loadLevel2(core.state.currentSubcategory);
                }
            }
        });

        document.addEventListener('talon:periodChanged', () => {
            if (core.state.viewType === 'tipologie') {
                // Ricarica livello corrente con nuovo periodo
                const level = core.state.currentLevel;
                if (level === 0) {
                    namespace.loadLevel0();
                } else if (level === 1) {
                    namespace.loadLevel1(core.state.currentCategory);
                } else if (level === 2) {
                    namespace.loadLevel2(core.state.currentSubcategory);
                } else if (level === 3) {
                    namespace.loadLevel3(core.state.currentEntity);
                }
            }
        });

        document.addEventListener('talon:characterFilterChanged', () => {
            if (core.state.viewType === 'tipologie') {
                // Ricarica livello corrente con nuovo filtro carattere
                const level = core.state.currentLevel;
                if (level === 0) {
                    namespace.loadLevel0();
                } else if (level === 1) {
                    namespace.loadLevel1(core.state.currentCategory);
                } else if (level === 2) {
                    namespace.loadLevel2(core.state.currentSubcategory);
                } else if (level === 3) {
                    namespace.loadLevel3(core.state.currentEntity);
                }
            }
        });

        namespace.state.isInitialized = true;
        console.log('✅ [TipologieView] Inizializzata - v1.0.0');

        // Carica livello iniziale
        namespace.loadLevel0();
    };

    /**
     * Distrugge la vista tipologie e pulisce le risorse
     */
    namespace.destroy = function() {
        if (namespace.state.chart) {
            namespace.state.chart.destroy();
            namespace.state.chart = null;
            
            // CRITICO: Pulisci anche la variabile globale se è lo stesso chart
            if (window.eventChart === namespace.state.chart) {
                window.eventChart = null;
            }
        }

        namespace.state.isInitialized = false;
        console.log('🧹 [TipologieView] Vista distrutta e risorse pulite');
    };

    /**
     * Ottiene lo stato corrente della vista
     * @returns {Object} Stato corrente
     */
    namespace.getState = function() {
        return Object.assign({}, namespace.state, {
            coreState: core.getState()
        });
    };

})(window.TalonEventiTipologieView, window.TalonChartCore);

// Auto-inizializzazione se eseguito in ambiente browser
if (typeof window !== 'undefined' && window.document) {
    console.log('📊 [TipologieView] Modulo caricato - v1.0.0');
}