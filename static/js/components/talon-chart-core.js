/**
 * ========================================
 * TALON CHART CORE - Logica Comune Riutilizzabile
 * File: talon-chart-core.js
 * 
 * Versione: 1.0.0
 * Funzioni comuni per gestione grafici, filtri, info cards
 * Riutilizzabile per dashboard eventi e attività
 * ========================================
 */

// Namespace per evitare conflitti globali
window.TalonChartCore = window.TalonChartCore || {};

(function(namespace) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE E STATO GLOBALE
    // ========================================

    namespace.config = {
        performance: {
            animation: false,
            debounceDelay: 300,
            maxLabelsForDataLabels: 50,
            chartResizeDelay: 150
        },
        ui: {
            maxLabelLength: 20,
            abbreviationThreshold: 15,
            multilineThreshold: 20
        },
        colors: {
            error: 'rgba(255, 0, 0, 0.8)',
            noData: 'rgba(200, 200, 200, 0.8)',
            primary: 'rgba(79, 172, 254, 1)',
            primaryTransparent: 'rgba(79, 172, 254, 0.2)'
        }
    };

    namespace.state = {
        currentLevel: 0,
        currentPeriod: 'year',
        customStartDate: null,
        customEndDate: null,
        breadcrumb: [],
        currentCategory: null,
        currentSubcategory: null,
        currentEntity: null,
        currentSubDetail: null,
        currentEntityType: null,
        viewType: 'tipologie',
        activeChart: null
    };

    // ========================================
    // SISTEMA DI VALIDAZIONE E CONTROLLO DATI
    // ========================================
    
    /**
     * Classe per validazione e controllo coerenza dati
     * Garantisce robustezza dei calcoli per ogni livello
     */
    class DataValidator {
        constructor(namespace) {
            this.namespace = namespace;
            this.debugMode = true; // Abilita log dettagliati
        }
        
        /**
         * Valida i dati per un livello specifico
         * @param {Array|number} data - Dati del grafico
         * @param {Object} stats - Statistiche API
         * @param {number} level - Livello corrente
         * @param {string} viewType - Tipo vista (tipologie/enti)
         * @param {Object} context - Contesto aggiuntivo (filtri, categoria, etc.)
         * @returns {Object} Dati validati e calcolati
         */
        async validateLevel(data, stats, level, viewType, context = {}) {
            const startTime = performance.now();
            
            if (this.debugMode) {
                console.log(`🔍 [DataValidator] Validazione Level ${level} - ${viewType}:`, {
                    data: Array.isArray(data) ? data.length : data,
                    hasStats: !!stats,
                    context: context
                });
            }
            
            // Calcola totali dai dati del grafico
            let totalEventsFromData = 0;
            if (Array.isArray(data)) {
                totalEventsFromData = data.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
            } else if (typeof data === 'number') {
                totalEventsFromData = data;
            }
            
            // Calcola statistiche isolate per questo livello
            const levelStats = await this.calculateIsolatedStats(stats, level, viewType, context);
            
            // Verifica coerenza
            const consistency = this.checkDataConsistency({
                graphTotal: totalEventsFromData,
                statsTotal: levelStats.totalEvents,
                positive: levelStats.positiveEvents,
                negative: levelStats.negativeEvents,
                categories: levelStats.categoriesCount,
                entities: levelStats.entitiesCount
            }, level, viewType, context);
            
            const validationTime = performance.now() - startTime;
            
            if (this.debugMode) {
                console.log(`✅ [DataValidator] Level ${level} validato in ${validationTime.toFixed(1)}ms:`, {
                    totalEvents: levelStats.totalEvents,
                    positive: levelStats.positiveEvents,
                    negative: levelStats.negativeEvents,
                    consistency: consistency.isValid ? '✅' : '❌'
                });
            }
            
            return {
                ...levelStats,
                validation: {
                    isValid: consistency.isValid,
                    warnings: consistency.warnings,
                    validationTime: validationTime
                }
            };
        }
        
        /**
         * Calcola statistiche isolate per un livello
         * @param {Object} stats - Stats API (può essere null)
         * @param {number} level - Livello
         * @param {string} viewType - Tipo vista
         * @param {Object} context - Contesto
         * @returns {Object} Statistiche calcolate
         */
        async calculateIsolatedStats(stats, level, viewType, context) {
            let positiveEvents = 0;
            let negativeEvents = 0;
            let categoriesCount = 0;
            let entitiesCount = 0;
            let totalEvents = 0;
            
            // Ottieni filtro carattere corrente
            const carattereFiltro = this.namespace.getCharacterFilter();
            const isCharacterFilterActive = carattereFiltro && carattereFiltro !== 'tutti' && carattereFiltro !== '';
            
            if (this.debugMode && isCharacterFilterActive) {
                console.log(`🎯 [DataValidator] Filtro carattere attivo: "${carattereFiltro}" per Level ${level}`);
            }
            
            // Prova a ottenere dati dalle stats API
            if (stats) {
                positiveEvents = stats.positive_events || stats.positivi || 0;
                negativeEvents = stats.negative_events || stats.negativi || 0;
                categoriesCount = stats.tipologie || stats.categories || 0;
                entitiesCount = stats.enti_coinvolti || stats.entities || 0;
                totalEvents = stats.total_events || 0;
            }
            
            // Calcolo carattere eventi da dati reali se necessario
            const needsCharacterCalculation = (
                (positiveEvents === 0 && negativeEvents === 0) ||
                (!stats || (!stats.positive_events && !stats.negative_events && !stats.positivi && !stats.negativi))
            );
            
            if (needsCharacterCalculation && this.namespace.calculateCharacterDataFromEventDetails) {
                try {
                    if (this.debugMode) {
                        console.log(`🔄 [DataValidator] Calcolo carattere eventi per Level ${level}`);
                    }
                    
                    // Determina filtri per il calcolo
                    let categoria = null;
                    let ente = null;
                    
                    if (viewType === 'tipologie') {
                        if (level >= 1 && context.currentCategory) {
                            categoria = context.currentCategory;
                        }
                        if (level >= 2 && context.currentEntity) {
                            ente = context.currentEntity;
                        }
                        
                        // Debug context per troubleshooting
                        if (this.debugMode || level === 2) {
                            console.log(`🔍 [DataValidator] Context Level ${level}:`, {
                                currentCategory: context.currentCategory,
                                currentEntity: context.currentEntity,
                                ente: context.ente,
                                categoria: categoria,
                                enteSelected: ente
                            });
                        }
                    }
                    
                    const characterData = await this.namespace.calculateCharacterDataFromEventDetails(categoria, ente, level);
                    
                    if (characterData && characterData.success) {
                        positiveEvents = characterData.positivi || 0;
                        negativeEvents = characterData.negativi || 0;
                        
                        // Aggiorna totalEvents se non già calcolato
                        if (totalEvents === 0) {
                            totalEvents = characterData.totale || positiveEvents + negativeEvents;
                        }
                        
                        if (this.debugMode) {
                            console.log(`✅ [DataValidator] Carattere calcolato: ${positiveEvents}+, ${negativeEvents}-`);
                        }
                    }
                } catch (error) {
                    console.error(`🚨 [DataValidator] Errore calcolo carattere Level ${level}:`, error);
                }
            }
            
            // APPLICA FILTRO CARATTERE alle statistiche calcolate
            if (isCharacterFilterActive) {
                const originalPositive = positiveEvents;
                const originalNegative = negativeEvents;
                const originalTotal = totalEvents;
                
                if (carattereFiltro === 'positivo') {
                    // Solo eventi positivi
                    negativeEvents = 0;
                    totalEvents = positiveEvents;
                    
                    if (this.debugMode) {
                        console.log(`🎯 [DataValidator] Filtro "positivo" applicato: ${originalTotal} -> ${totalEvents} eventi`);
                    }
                } else if (carattereFiltro === 'negativo') {
                    // Solo eventi negativi
                    positiveEvents = 0;
                    totalEvents = negativeEvents;
                    
                    if (this.debugMode) {
                        console.log(`🎯 [DataValidator] Filtro "negativo" applicato: ${originalTotal} -> ${totalEvents} eventi`);
                    }
                }
                
                // Log del filtro applicato
                if (this.debugMode) {
                    console.log(`🔍 [DataValidator] Statistiche dopo filtro carattere "${carattereFiltro}":`, {
                        prima: { positivi: originalPositive, negativi: originalNegative, totale: originalTotal },
                        dopo: { positivi: positiveEvents, negativi: negativeEvents, totale: totalEvents }
                    });
                }
            }
            
            // Calcola conteggi specifici per livello e vista
            if (viewType === 'tipologie') {
                if (level === 0) {
                    // Livello 0: tutte le tipologie disponibili
                    // categoriesCount dovrebbe essere il numero di tipologie
                } else if (level === 1) {
                    // Livello 1: una tipologia, N enti
                    categoriesCount = 1; // Una sola tipologia selezionata
                } else if (level === 2) {
                    // Livello 2: una tipologia, un ente
                    categoriesCount = 1;
                    entitiesCount = 1;
                } else if (level === 3) {
                    // Livello 3: dettagli eventi individuali
                    categoriesCount = 1;
                    entitiesCount = 1;
                }
            }
            
            return {
                totalEvents,
                positiveEvents,
                negativeEvents,
                categoriesCount,
                entitiesCount,
                calculatedFromDetails: needsCharacterCalculation,
                characterFilter: carattereFiltro,
                characterFilterActive: isCharacterFilterActive
            };
        }
        
        /**
         * Controlla coerenza tra dati del grafico e infocard
         * @param {Object} data - Oggetto con tutti i dati
         * @param {number} level - Livello
         * @param {string} viewType - Tipo vista
         * @param {Object} context - Contesto
         * @returns {Object} Risultato controllo coerenza
         */
        checkDataConsistency(data, level, viewType, context) {
            const warnings = [];
            let isValid = true;
            
            // Controllo 1: Coerenza totale eventi
            if (data.graphTotal > 0 && data.statsTotal > 0) {
                const difference = Math.abs(data.graphTotal - data.statsTotal);
                const tolerance = Math.max(1, Math.floor(data.graphTotal * 0.05)); // 5% tolleranza
                
                if (difference > tolerance) {
                    warnings.push(`Discrepanza totale eventi: grafico=${data.graphTotal}, stats=${data.statsTotal}`);
                    isValid = false;
                }
            }
            
            // Controllo 2: Positivi + Negativi = Totale (dove applicabile)
            if (data.positive > 0 || data.negative > 0) {
                const characterSum = data.positive + data.negative;
                const totalRef = data.statsTotal || data.graphTotal;
                
                if (totalRef > 0 && characterSum > 0) {
                    // Permetti che alcuni eventi non abbiano carattere definito
                    if (characterSum > totalRef) {
                        warnings.push(`Caratteri > totale: ${characterSum} > ${totalRef}`);
                        isValid = false;
                    }
                }
            }
            
            // Controllo 3: Conteggi logici per livello
            if (viewType === 'tipologie') {
                if (level === 1 && data.categories > 1) {
                    warnings.push(`Level 1 dovrebbe avere 1 categoria, trovate ${data.categories}`);
                }
                if (level === 2 && (data.categories > 1 || data.entities > 1)) {
                    warnings.push(`Level 2 dovrebbe avere 1 categoria e 1 ente`);
                }
            }
            
            // Log warnings se in debug mode
            if (this.debugMode && warnings.length > 0) {
                console.warn(`⚠️ [DataValidator] Problemi coerenza Level ${level}:`, warnings);
            }
            
            return {
                isValid,
                warnings,
                checks: {
                    totalEventsMatch: data.graphTotal === data.statsTotal,
                    charactersSumValid: (data.positive + data.negative) <= (data.statsTotal || data.graphTotal),
                    levelCountsValid: warnings.length === 0
                }
            };
        }
        
        /**
         * Log dettagliato discrepanze trovate
         * @param {Object} expected - Valori attesi
         * @param {Object} actual - Valori effettivi
         * @param {string} context - Contesto
         */
        logDiscrepancies(expected, actual, context) {
            if (!this.debugMode) return;
            
            console.group(`🔍 [DataValidator] Discrepanze - ${context}`);
            
            Object.keys(expected).forEach(key => {
                if (expected[key] !== actual[key]) {
                    console.warn(`❌ ${key}: atteso ${expected[key]}, trovato ${actual[key]}`);
                }
            });
            
            console.groupEnd();
        }
    }
    
    // Istanza globale del validator
    namespace.dataValidator = new DataValidator(namespace);

    /**
     * Calcola statistiche isolate per un livello specifico
     * Utilizzando il sistema di validazione per garantire robustezza
     * @param {Array|number} data - Dati del grafico
     * @param {Object} stats - Statistiche API 
     * @param {number} level - Livello corrente
     * @param {string} viewType - Tipo vista
     * @param {Object} context - Contesto aggiuntivo (filtri, categoria, etc.)
     * @returns {Promise<Object>} Statistiche calcolate e validate
     */
    namespace.calculateLevelStatistics = async function(data, stats, level, viewType, context = {}) {
        const startTime = performance.now();
        
        console.log(`📊 [TalonChartCore] Calcolo statistiche isolate Level ${level} - ${viewType}:`, {
            dataLength: Array.isArray(data) ? data.length : typeof data,
            hasStats: !!stats,
            context: context
        });
        
        // Aggiungi lo stato corrente al contesto
        const enrichedContext = {
            ...context,
            currentCategory: namespace.state.currentCategory,
            currentSubcategory: namespace.state.currentSubcategory,
            currentEntity: namespace.state.currentEntity,
            currentPeriod: namespace.state.currentPeriod,
            customStartDate: namespace.state.customStartDate,
            customEndDate: namespace.state.customEndDate,
            characterFilter: namespace.getCharacterFilter()
        };
        
        try {
            // Utilizza il DataValidator per calcoli e validazione
            const validatedData = await namespace.dataValidator.validateLevel(
                data, stats, level, viewType, enrichedContext
            );
            
            // Calcola totali dai dati del grafico
            let totalEventsFromData = 0;
            if (Array.isArray(data)) {
                totalEventsFromData = data.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
            } else if (typeof data === 'number') {
                totalEventsFromData = data;
            }
            
            // Se il totale dalle statistiche è 0, usa quello dal grafico
            if (validatedData.totalEvents === 0 && totalEventsFromData > 0) {
                validatedData.totalEvents = totalEventsFromData;
            }
            
            const calculationTime = performance.now() - startTime;
            
            const result = {
                // Dati principali
                totalEvents: validatedData.totalEvents,
                positiveEvents: validatedData.positiveEvents,
                negativeEvents: validatedData.negativeEvents,
                categoriesCount: validatedData.categoriesCount,
                entitiesCount: validatedData.entitiesCount,
                
                // Metadata
                level: level,
                viewType: viewType,
                context: enrichedContext,
                calculatedFromDetails: validatedData.calculatedFromDetails,
                
                // Informazioni filtro carattere
                characterFilter: validatedData.characterFilter,
                characterFilterActive: validatedData.characterFilterActive,
                
                // Validazione
                validation: validatedData.validation,
                calculationTime: calculationTime,
                
                // Timestamp per debugging
                timestamp: new Date().toISOString()
            };
            
            console.log(`✅ [TalonChartCore] Statistiche Level ${level} calcolate in ${calculationTime.toFixed(1)}ms:`, {
                totalEvents: result.totalEvents,
                positive: result.positiveEvents,
                negative: result.negativeEvents,
                categories: result.categoriesCount,
                entities: result.entitiesCount,
                isValid: result.validation.isValid
            });
            
            return result;
            
        } catch (error) {
            console.error(`🚨 [TalonChartCore] Errore calcolo statistiche Level ${level}:`, error);
            
            // Fallback con dati base dal grafico
            let totalEventsFromData = 0;
            if (Array.isArray(data)) {
                totalEventsFromData = data.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
            } else if (typeof data === 'number') {
                totalEventsFromData = data;
            }
            
            return {
                totalEvents: totalEventsFromData,
                positiveEvents: 0,
                negativeEvents: 0,
                categoriesCount: 0,
                entitiesCount: 0,
                level: level,
                viewType: viewType,
                context: enrichedContext,
                calculatedFromDetails: false,
                validation: {
                    isValid: false,
                    warnings: [`Errore calcolo: ${error.message}`],
                    validationTime: performance.now() - startTime
                },
                calculationTime: performance.now() - startTime,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    };

    // ========================================
    // FUNZIONI HELPER GENERICHE
    // ========================================

    /**
     * Ottiene il valore del filtro carattere corrente dal DOM
     */
    namespace.getCharacterFilter = function() {
        const carattereToggle = document.querySelector('input[name="evento_carattere"]:checked');
        return carattereToggle ? carattereToggle.value : '';
    };

    /**
     * Formatta etichette lunghe per grafici con strategia graduata
     * @param {string} label - Etichetta da formattare
     * @param {number} maxLength - Lunghezza massima
     * @param {number} numLabels - Numero totale di etichette
     * @returns {string|Array} Etichetta formattata
     */
    namespace.formatLabelForChart = function(label, maxLength = 20, numLabels = 0) {
        if (typeof label !== 'string') {
            return label;
        }
        
        // Strategia graduata basata sul numero di etichette
        let targetMaxLength = maxLength;
        let useMultiline = true;
        
        if (numLabels > 20) {
            targetMaxLength = 12;
            useMultiline = false;
        } else if (numLabels > 15) {
            targetMaxLength = 16;
            useMultiline = true;
        }
        
        if (label.length <= targetMaxLength) {
            return label;
        }
        
        if (!useMultiline) {
            return namespace.abbreviateEntityName(label, targetMaxLength);
        }
        
        // Logica multilinea per meno elementi
        const words = label.split(' ');
        const lines = [];
        let currentLine = '';
        
        words.forEach(word => {
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
    };

    /**
     * Abbrevia nomi di enti militari in modo intelligente
     * @param {string} entityName - Nome ente da abbreviare
     * @param {number} maxLength - Lunghezza massima
     * @returns {string} Nome abbreviato
     */
    namespace.abbreviateEntityName = function(entityName, maxLength) {
        if (entityName.length <= maxLength) return entityName;
        
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
        
        if (abbreviated.length > maxLength) {
            abbreviated = abbreviated.substring(0, maxLength - 3) + '...';
        }
        
        return abbreviated;
    };

    // ========================================
    // GESTIONE ALTEZZA DINAMICA GRAFICI
    // ========================================

    /**
     * Calcola l'altezza ottimale per un grafico Chart.js
     * @param {number} numElements - Numero di elementi nel grafico
     * @returns {number} Altezza ottimale in pixel
     */
    namespace.calculateOptimalChartHeight = function(numElements = 0) {
        try {
            const mainContent = document.getElementById('main-content');
            const periodSelector = document.querySelector('.period-selector');
            const infoCards = document.querySelector('.info-cards');
            const detailsPanel = document.getElementById('eventDetailsPanel') || 
                               document.getElementById('detailsPanel');
            const padding = 60;
            
            if (!mainContent) {
                console.warn('📊 [TalonChartCore] main-content non trovato, usando altezza di default');
                return 350;
            }
            
            let availableHeight = mainContent.offsetHeight;
            
            if (periodSelector) availableHeight -= periodSelector.offsetHeight;
            if (infoCards) availableHeight -= infoCards.offsetHeight;
            if (detailsPanel && detailsPanel.style.display !== 'none') {
                availableHeight -= 300;
            }
            
            // Sistema dual-height: aggressivo + conservativo
            const aggressiveHeight = Math.floor(window.innerHeight * 0.6);
            const conservativeHeight = Math.max(
                250,
                Math.min(
                    Math.floor((availableHeight - padding) * 0.5),
                    Math.floor(window.innerHeight * 0.45),
                    500
                )
            );
            
            const chartHeight = Math.max(conservativeHeight, aggressiveHeight);
            
            console.log('📊 [TalonChartCore] Calcolo altezza:', {
                mainContentHeight: mainContent.offsetHeight,
                availableHeight: availableHeight,
                conservativeHeight: conservativeHeight,
                aggressiveHeight: aggressiveHeight,
                finalChartHeight: chartHeight,
                numElements: numElements
            });
            
            return chartHeight;
        } catch (error) {
            console.error('📊 [TalonChartCore] Errore calcolo altezza:', error);
            return 350;
        }
    };

    // ========================================
    // GESTIONE INFO CARDS
    // ========================================

    /**
     * Aggiorna le info cards con nuovi dati
     * @param {Array|number} data - Dati del grafico
     * @param {Object} stats - Statistiche dall'API
     * @param {Object} options - Opzioni aggiuntive
     */
    /**
     * Aggiorna le infocard con dati robusti e validati
     * NUOVO: Utilizza il sistema di calcolo isolato e validazione
     * @param {Array|number} data - Dati del grafico
     * @param {Object} stats - Statistiche API (opzionali)
     * @param {Object} options - OBBLIGATORIO: deve contenere viewType e level
     * @returns {Promise<Object>} Statistiche calcolate per verifica esterna
     */
    namespace.updateInfoCards = async function(data, stats = null, options = {}) {
        const startTime = performance.now();
        
        // CONTROLLO OBBLIGATORIO: viewType e level devono essere forniti
        if (!options.viewType || options.level === undefined || options.level === null) {
            console.error('🚨 [TalonChartCore] updateInfoCards: viewType e level sono obbligatori!', {
                providedOptions: options,
                caller: new Error().stack
            });
            throw new Error('updateInfoCards: viewType e level sono parametri obbligatori');
        }
        
        const viewType = options.viewType;
        const level = options.level;
        
        console.log(`📊 [TalonChartCore] Aggiornamento robusto infocard Level ${level} - ${viewType}`);
        
        try {
            // Utilizza il nuovo sistema di calcolo isolato
            const levelStatistics = await namespace.calculateLevelStatistics(
                data, stats, level, viewType, options.context || {}
            );
            
            // Verifica validazione prima di aggiornare DOM
            if (!levelStatistics.validation.isValid) {
                console.warn(`⚠️ [TalonChartCore] Dati Level ${level} non validi:`, levelStatistics.validation.warnings);
                // Continua comunque, ma con avvisi
            }
            
            // Trova elementi DOM
            const totalEl = document.getElementById('eventTotalValue');
            const categoriesEl = document.getElementById('eventCategoriesValue');
            const entitiesEl = document.getElementById('eventEntitiesValue');
            const positiveEl = document.getElementById('eventPositiveValue');
            const negativeEl = document.getElementById('eventNegativeValue');
            
            // Aggiorna DOM solo se gli elementi esistono
            if (totalEl) totalEl.textContent = levelStatistics.totalEvents || 0;
            if (categoriesEl) categoriesEl.textContent = levelStatistics.categoriesCount || 0;
            if (entitiesEl) entitiesEl.textContent = levelStatistics.entitiesCount || 0;
            if (positiveEl) positiveEl.textContent = levelStatistics.positiveEvents || 0;
            if (negativeEl) negativeEl.textContent = levelStatistics.negativeEvents || 0;
            
            const updateTime = performance.now() - startTime;
            
            console.log(`✅ [TalonChartCore] InfoCards aggiornate in ${updateTime.toFixed(1)}ms:`, {
                level: level,
                viewType: viewType,
                totalEvents: levelStatistics.totalEvents,
                positiveEvents: levelStatistics.positiveEvents,
                negativeEvents: levelStatistics.negativeEvents,
                categoriesCount: levelStatistics.categoriesCount,
                entitiesCount: levelStatistics.entitiesCount,
                calculatedFromDetails: levelStatistics.calculatedFromDetails,
                isValid: levelStatistics.validation.isValid,
                warnings: levelStatistics.validation.warnings.length
            });
            
            // Aggiungi indicatore visivo di validazione (opzionale)
            const statusIndicator = document.getElementById('validationStatus');
            if (statusIndicator) {
                if (levelStatistics.validation.isValid) {
                    statusIndicator.textContent = '✅';
                    statusIndicator.title = 'Dati validati correttamente';
                } else {
                    statusIndicator.textContent = '⚠️';
                    statusIndicator.title = `Avvisi: ${levelStatistics.validation.warnings.join(', ')}`;
                }
            }
            
            return levelStatistics;
            
        } catch (error) {
            console.error(`🚨 [TalonChartCore] Errore aggiornamento infocard Level ${level}:`, error);
            
            // Fallback: calcolo base dai dati forniti
            let totalEvents = 0;
            if (Array.isArray(data)) {
                totalEvents = data.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
            } else if (typeof data === 'number') {
                totalEvents = data;
            }
            
            // Aggiorna almeno il totale
            const totalEl = document.getElementById('eventTotalValue');
            if (totalEl) totalEl.textContent = totalEvents;
            
            // Reset altri valori
            const categoriesEl = document.getElementById('eventCategoriesValue');
            const entitiesEl = document.getElementById('eventEntitiesValue');
            const positiveEl = document.getElementById('eventPositiveValue');
            const negativeEl = document.getElementById('eventNegativeValue');
            
            if (categoriesEl) categoriesEl.textContent = '?';
            if (entitiesEl) entitiesEl.textContent = '?';
            if (positiveEl) positiveEl.textContent = '?';
            if (negativeEl) negativeEl.textContent = '?';
            
            const statusIndicator = document.getElementById('validationStatus');
            if (statusIndicator) {
                statusIndicator.textContent = '❌';
                statusIndicator.title = `Errore calcolo: ${error.message}`;
            }
            
            return {
                totalEvents: totalEvents,
                positiveEvents: 0,
                negativeEvents: 0,
                categoriesCount: 0,
                entitiesCount: 0,
                level: level,
                viewType: viewType,
                validation: {
                    isValid: false,
                    warnings: [`Errore: ${error.message}`],
                    validationTime: performance.now() - startTime
                },
                error: error.message
            };
        }
    };

    // ========================================
    // GESTIONE BREADCRUMB
    // ========================================

    /**
     * Aggiorna il breadcrumb di navigazione
     * @param {Object} options - Opzioni per il breadcrumb
     */
    namespace.updateBreadcrumb = function(options = {}) {
        const breadcrumbContainer = document.getElementById('eventBreadcrumb');
        if (!breadcrumbContainer) return;

        const viewType = options.viewType || namespace.state.viewType;
        const level = options.level || namespace.state.currentLevel;

        // Preserva il toggle carattere
        const carattereToggle = breadcrumbContainer.querySelector('.carattere-toggle');
        
        const breadcrumbContent = breadcrumbContainer.querySelector('#event-chart-breadcrumb');
        if (breadcrumbContent) {
            breadcrumbContent.innerHTML = '';
            
            // Home sempre presente
            const homeItem = document.createElement('div');
            homeItem.className = 'breadcrumb-item active';
            homeItem.setAttribute('data-level', '0');
            
            if (viewType === 'enti') {
                homeItem.textContent = 'Vista Enti';
                homeItem.onclick = () => namespace.resetToLevel0();
            } else {
                homeItem.textContent = 'Tipologie Eventi';
                homeItem.onclick = () => namespace.resetToLevel0();
            }
            
            homeItem.style.cursor = 'pointer';
            breadcrumbContent.appendChild(homeItem);

            // Aggiungi elementi del breadcrumb per livelli > 0
            if (level > 0) {
                namespace._addBreadcrumbItems(breadcrumbContent, viewType, level);
            }
        }
    };

    /**
     * Aggiunge elementi breadcrumb per livelli specifici
     * @private
     */
    namespace._addBreadcrumbItems = function(container, viewType, level) {
        const separator = () => {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-separator';
            sep.textContent = ' > ';
            return sep;
        };

        if (viewType === 'enti') {
            // Logica breadcrumb per vista enti
            if (level >= 1 && namespace.state.currentEntity) {
                container.appendChild(separator());
                const item = document.createElement('span');
                item.className = level === 1 ? 'breadcrumb-item active' : 'breadcrumb-item';
                item.textContent = namespace.state.currentEntity;
                if (level > 1) {
                    item.style.cursor = 'pointer';
                    item.onclick = () => namespace.navigateToLevel(1);
                }
                container.appendChild(item);
            }

            if (level >= 2 && namespace.state.currentSubcategory) {
                container.appendChild(separator());
                const item = document.createElement('span');
                item.className = level === 2 ? 'breadcrumb-item active' : 'breadcrumb-item';
                item.textContent = namespace.state.currentSubcategory;
                if (level > 2) {
                    item.style.cursor = 'pointer';
                    item.onclick = () => namespace.navigateToLevel(2);
                }
                container.appendChild(item);
            }

            if (level >= 3) {
                container.appendChild(separator());
                const item = document.createElement('span');
                item.className = 'breadcrumb-item active';
                item.textContent = 'Tipi Evento';
                container.appendChild(item);
            }
        } else {
            // Logica breadcrumb per vista tipologie
            if (level >= 1 && namespace.state.currentCategory) {
                container.appendChild(separator());
                const item = document.createElement('span');
                item.className = level === 1 ? 'breadcrumb-item active' : 'breadcrumb-item';
                item.textContent = namespace.state.currentCategory;
                if (level > 1) {
                    item.style.cursor = 'pointer';
                    item.onclick = () => namespace.navigateToLevel(1);
                }
                container.appendChild(item);
            }

            if (level >= 2 && namespace.state.currentSubcategory) {
                container.appendChild(separator());
                const item = document.createElement('span');
                item.className = level === 2 ? 'breadcrumb-item active' : 'breadcrumb-item';
                item.textContent = namespace.state.currentSubcategory;
                if (level > 2) {
                    item.style.cursor = 'pointer';
                    item.onclick = () => namespace.navigateToLevel(2);
                }
                container.appendChild(item);
            }
        }
    };

    /**
     * Reset dello stato al livello 0
     */
    namespace.resetToLevel0 = function() {
        namespace.state.currentLevel = 0;
        namespace.state.currentCategory = null;
        namespace.state.currentSubcategory = null;
        namespace.state.currentEntity = null;
        namespace.state.breadcrumb = [];
        
        // Nascondi pannelli dettagli
        const detailsPanel = document.getElementById('eventDetailsPanel') || 
                           document.getElementById('detailsPanel');
        if (detailsPanel) {
            detailsPanel.style.display = 'none';
        }

        // Mostra grafico
        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) {
            chartContainer.style.display = 'block';
        }

        namespace.updateBreadcrumb();
        
        // Trigger evento personalizzato per le viste
        const resetEvent = new CustomEvent('talon:resetToLevel0', {
            detail: { viewType: namespace.state.viewType }
        });
        document.dispatchEvent(resetEvent);
    };

    /**
     * Navigazione a livello specifico
     * @param {number} targetLevel - Livello target
     */
    namespace.navigateToLevel = function(targetLevel) {
        const currentLevel = namespace.state.currentLevel;
        
        if (targetLevel >= currentLevel) return; // Non navigare in avanti
        
        // Aggiorna stato
        namespace.state.currentLevel = targetLevel;
        
        // Pulisci stati dei livelli superiori
        if (targetLevel < 2) {
            namespace.state.currentSubcategory = null;
        }
        if (targetLevel < 1) {
            namespace.state.currentCategory = null;
            namespace.state.currentEntity = null;
        }

        // Trigger evento personalizzato
        const navEvent = new CustomEvent('talon:navigateToLevel', {
            detail: { 
                targetLevel: targetLevel, 
                viewType: namespace.state.viewType,
                fromLevel: currentLevel
            }
        });
        document.dispatchEvent(navEvent);
    };

    // ========================================
    // UTILITÀ API COMUNI
    // ========================================

    /**
     * Costruisce parametri URL comuni per le API
     * @param {Object} options - Opzioni per i parametri
     * @returns {URLSearchParams} Parametri URL costruiti
     */
    namespace.buildCommonAPIParams = function(options = {}) {
        const params = new URLSearchParams();
        
        // Periodo corrente
        params.append('period', namespace.state.currentPeriod);
        
        // Date personalizzate
        if (namespace.state.currentPeriod === 'custom' && 
            namespace.state.customStartDate && 
            namespace.state.customEndDate) {
            params.append('start_date', namespace.state.customStartDate);
            params.append('end_date', namespace.state.customEndDate);
        }
        
        // Filtro carattere
        const carattereFiltro = namespace.getCharacterFilter();
        if (carattereFiltro) {
            const paramName = options.characterParam || 'categoria';
            params.append(paramName, carattereFiltro);
        }
        
        return params;
    };

    /**
     * Gestione errori API standardizzata
     * @param {Error} error - Errore da gestire
     * @param {string} context - Contesto dell'errore
     * @returns {Object} Dati fallback per il grafico
     */
    namespace.handleAPIError = function(error, context = 'API') {
        console.error(`🚨 [TalonChartCore] Errore ${context}:`, error);
        
        return {
            labels: ['Errore Caricamento'],
            data: [0],
            backgroundColor: [namespace.config.colors.error],
            stats: null
        };
    };

    // ========================================
    // CACHING AVANZATO
    // ========================================

    /**
     * Istanza cache manager
     * @type {TalonCacheManager|null}
     */
    namespace.cacheManager = null;

    /**
     * Inizializza cache manager
     * @param {Object} config - Configurazione cache
     */
    namespace.initCache = function(config = {}) {
        // Verifica disponibilità TalonCacheManager
        if (typeof window.TalonCacheManager === 'undefined') {
            console.warn('⚠️ [TalonChartCore] TalonCacheManager non disponibile - caching disabilitato');
            return false;
        }

        try {
            namespace.cacheManager = window.TalonCacheManager.getGlobalCache(config);
            
            // Setup event listeners per monitoring
            namespace.cacheManager.on('hit', (data) => {
                console.log(`⚡ [TalonChartCore] Cache HIT: ${data.key} (age: ${Math.round(data.age/1000)}s)`);
            });

            namespace.cacheManager.on('miss', (data) => {
                console.log(`💫 [TalonChartCore] Cache MISS: ${data.key}${data.reason ? ' (' + data.reason + ')' : ''}`);
            });

            namespace.cacheManager.on('memoryWarning', (data) => {
                console.warn(`⚠️ [TalonChartCore] Memoria cache al ${data.percentage.toFixed(1)}% (${namespace.cacheManager.formatBytes(data.current)})`);
            });

            console.log('✅ [TalonChartCore] Cache manager inizializzato con successo');
            return true;
        } catch (error) {
            console.error('🚨 [TalonChartCore] Errore inizializzazione cache:', error);
            namespace.cacheManager = null;
            return false;
        }
    };

    /**
     * Genera chiave cache univoca per richiesta API
     * @param {string} url - URL della richiesta
     * @param {URLSearchParams|Object} params - Parametri della richiesta
     * @param {Object} options - Opzioni aggiuntive
     * @returns {string} Chiave cache univoca
     */
    namespace.generateCacheKey = function(url, params, options = {}) {
        // Costruisci URL base
        let baseUrl = url;
        if (!baseUrl.startsWith('/')) {
            baseUrl = '/' + baseUrl;
        }

        // Converte parametri in array ordinato per consistenza
        let paramPairs = [];
        
        if (params instanceof URLSearchParams) {
            paramPairs = Array.from(params.entries()).sort();
        } else if (typeof params === 'object' && params !== null) {
            paramPairs = Object.entries(params).sort();
        }

        // Aggiungi stato corrente per invalidazione automatica
        const stateParams = [
            ['_level', namespace.state.currentLevel],
            ['_view', namespace.state.viewType]
        ];

        if (namespace.state.currentCategory) {
            stateParams.push(['_category', namespace.state.currentCategory]);
        }
        if (namespace.state.currentSubcategory) {
            stateParams.push(['_subcategory', namespace.state.currentSubcategory]);
        }
        
        // CRITICO: Aggiungi filtro carattere alla chiave di cache
        const carattereFiltro = namespace.getCharacterFilter();
        if (carattereFiltro && carattereFiltro !== 'tutti' && carattereFiltro !== '') {
            stateParams.push(['_character_filter', carattereFiltro]);
        }

        const allParams = [...paramPairs, ...stateParams];
        const paramString = allParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        
        return paramString ? `${baseUrl}?${paramString}` : baseUrl;
    };

    /**
     * Fetch con caching automatico (funzione principale)
     * @param {string} url - URL della richiesta
     * @param {Object} options - Opzioni fetch + cache
     * @returns {Promise<any>} Dati dalla cache o API
     */
    namespace.fetchWithCache = async function(url, options = {}) {
        const startTime = performance.now();
        
        // Estrai opzioni cache
        const cacheOptions = {
            ttl: options.cacheTTL || null,
            skipCache: options.skipCache || false,
            preload: options.preload || false,
            invalidate: options.invalidate || null,
            metadata: options.cacheMetadata || {}
        };

        // Se cache non disponibile, usa fetch normale
        if (!namespace.cacheManager || cacheOptions.skipCache) {
            return await namespace.fetchDirect(url, options);
        }

        // Gestione invalidazione
        if (cacheOptions.invalidate) {
            namespace.cacheManager.invalidate(cacheOptions.invalidate);
        }

        // Genera chiave cache
        const params = namespace.extractParamsFromURL(url);
        const cacheKey = namespace.generateCacheKey(url, params, cacheOptions);

        try {
            // Tentativo cache hit
            const cachedData = await namespace.cacheManager.get(cacheKey);
            
            if (cachedData) {
                const duration = performance.now() - startTime;
                console.log(`⚡ [TalonChartCore] Fetch cached (${duration.toFixed(1)}ms): ${url}`);
                return cachedData;
            }

            // Cache miss - fetch da API
            console.log(`💫 [TalonChartCore] Fetching from API: ${url}`);
            const response = await namespace.fetchDirect(url, options);

            // Memorizza in cache se successo
            if (response && !response.error) {
                const success = namespace.cacheManager.set(
                    cacheKey, 
                    response, 
                    cacheOptions.ttl,
                    { metadata: cacheOptions.metadata }
                );

                if (!success) {
                    console.warn('⚠️ [TalonChartCore] Fallimento memorizzazione cache');
                }
            }

            const duration = performance.now() - startTime;
            console.log(`🌐 [TalonChartCore] Fetch completed (${duration.toFixed(1)}ms): ${url}`);

            return response;

        } catch (error) {
            console.error(`🚨 [TalonChartCore] Errore fetchWithCache per ${url}:`, error);
            
            // Fallback a fetch diretto
            return await namespace.fetchDirect(url, options);
        }
    };

    /**
     * Fetch diretto senza caching (fallback)
     * @param {string} url - URL della richiesta
     * @param {Object} options - Opzioni fetch standard
     * @returns {Promise<any>} Risposta API
     */
    namespace.fetchDirect = async function(url, options = {}) {
        const fetchOptions = {
            method: options.method || 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                ...options.headers
            },
            ...options
        };

        // Rimuovi opzioni cache personalizzate
        delete fetchOptions.cacheTTL;
        delete fetchOptions.skipCache;
        delete fetchOptions.preload;
        delete fetchOptions.invalidate;
        delete fetchOptions.cacheMetadata;

        const response = await fetch(url, fetchOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    };

    /**
     * Calcola dati carattere dagli eventi dettagliati
     * Funzione di fallback per quando l'API principale non fornisce stats sui caratteri
     * @param {string} categoria - Categoria/tipologia evento per filtro (opzionale)
     * @param {string} ente - Ente per filtro aggiuntivo (opzionale)
     * @returns {Promise<Object>} Oggetto con conteggi positivi/negativi
     */
    namespace.calculateCharacterDataFromEventDetails = async function(categoria = null, ente = null, level = null) {
        try {
            const url = '/eventi/api/dettagli';
            const params = namespace.buildCommonAPIParams();
            
            // Prova diversi parametri per la tipologia se fornita
            if (categoria) {
                const tipoEvento = categoria.toLowerCase().replace(' ', '_');
                params.append('sottocategoria', tipoEvento);
                params.append('tipo_evento', tipoEvento);
                params.append('category', tipoEvento);
                params.append('tipologia', tipoEvento);
            }
            
            // CRITICO: Usa sempre 'ente' ma aggiungi 'level' per attivare query ricorsiva API
            if (ente) {
                params.append('ente', ente);
                console.log(`🎯 [TalonChartCore] Usando ente=${ente} per level ${level || 'unknown'}`);
            }
            
            // CRITICO: Aggiungi sempre il parametro level per far capire all'API come comportarsi
            if (level !== null && level !== undefined) {
                params.append('level', level.toString());
                console.log(`🎯 [TalonChartCore] Level parametro aggiunto: level=${level}`);
            }
            
            const fullUrl = `${url}?${params.toString()}`;
            
            console.log(`🔍 [TalonChartCore] Calcolando dati carattere da eventi dettagliati:`, {
                categoria: categoria,
                ente: ente,
                level: level,
                url: fullUrl
            });
            
            const result = await namespace.fetchWithCache(fullUrl, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                cacheMetadata: {
                    purpose: 'character_data_calculation',
                    categoria: categoria,
                    ente: ente,
                    level: level
                }
            });
            
            if (result.success && Array.isArray(result.data)) {
                let allEvents = result.data;
                
                // Filtra per categoria se l'API non ha filtrato
                if (categoria && allEvents.length > 0) {
                    const categoriaUpper = categoria.toUpperCase();
                    const categoriaLower = categoria.toLowerCase();
                    const tipoEvento = categoria.toLowerCase().replace(' ', '_');
                    
                    const filteredEvents = allEvents.filter(evento => {
                        const tipo = evento.tipo_evento || evento.tipologia || evento.category || evento.sottocategoria || '';
                        const tipoUpper = tipo.toUpperCase();
                        const tipoLower = tipo.toLowerCase().replace(' ', '_');
                        
                        return tipoUpper === categoriaUpper || 
                               tipoLower === categoriaLower || 
                               tipoLower === tipoEvento ||
                               tipo === categoria;
                    });
                    
                    console.log(`🔍 [TalonChartCore] Filtro categoria applicato:`, {
                        categoria: categoria,
                        eventiTotali: allEvents.length,
                        eventiFiltrati: filteredEvents.length
                    });
                    
                    allEvents = filteredEvents;
                }
                
                // Filtra per ente se specificato (fallback se API non ha filtrato)
                if (ente && allEvents.length > 0) {
                    const eventiPrimaDelFiltroEnte = allEvents.length;
                    const enteFiltrati = allEvents.filter(evento => {
                        const enteEvento = evento.ente || evento.ente_name || evento.organizzazione || evento.ente_militare || '';
                        return enteEvento === ente || 
                               enteEvento.toLowerCase().includes(ente.toLowerCase()) ||
                               ente.toLowerCase().includes(enteEvento.toLowerCase());
                    });
                    
                    if (enteFiltrati.length < eventiPrimaDelFiltroEnte) {
                        console.log(`🔍 [TalonChartCore] Filtro ente applicato CLIENT-SIDE (API non ha filtrato):`, {
                            ente: ente,
                            level: level,
                            eventiPrimaDiFiltroEnte: eventiPrimaDelFiltroEnte,
                            eventiDopoFiltroEnte: enteFiltrati.length,
                            note: 'Potrebbe indicare che il parametro level non è stato processato correttamente dall\'API'
                        });
                        allEvents = enteFiltrati;
                    } else {
                        console.log(`✅ [TalonChartCore] API ha filtrato correttamente per ente con level=${level}:`, {
                            ente: ente,
                            level: level,
                            eventiTotali: eventiPrimaDelFiltroEnte,
                            note: level === 2 ? 'Query ricorsiva attivata' : 'Query standard'
                        });
                    }
                }
                
                // APPLICA FILTRO CARATTERE agli eventi prima di contarli
                const carattereFiltroAttuale = namespace.getCharacterFilter();
                const isCharacterFilterActive = carattereFiltroAttuale && carattereFiltroAttuale !== 'tutti' && carattereFiltroAttuale !== '';
                
                if (isCharacterFilterActive && allEvents.length > 0) {
                    const eventiPrimaFiltro = allEvents.length;
                    allEvents = allEvents.filter(evento => {
                        const carattere = evento.carattere || evento.character || evento.tipo_carattere || '';
                        const carattereNorm = carattere.toLowerCase().trim();
                        
                        if (carattereFiltroAttuale === 'positivo') {
                            return carattereNorm === 'positivo' || carattereNorm === 'positive';
                        } else if (carattereFiltroAttuale === 'negativo') {
                            return carattereNorm === 'negativo' || carattereNorm === 'negative';
                        }
                        return true; // Fallback, non dovrebbe succedere
                    });
                    
                    console.log(`🎯 [TalonChartCore] Filtro carattere "${carattereFiltroAttuale}" applicato agli eventi:`, {
                        eventiPrima: eventiPrimaFiltro,
                        eventiDopo: allEvents.length,
                        categoria: categoria,
                        ente: ente
                    });
                }
                
                if (allEvents.length > 0) {
                    // Calcola statistiche dai singoli eventi filtrati
                    let positivi = 0;
                    let negativi = 0;
                    let totale = allEvents.length;
                    
                    // Se il filtro è attivo, i conteggi sono già determinati dal filtro
                    if (isCharacterFilterActive) {
                        if (carattereFiltroAttuale === 'positivo') {
                            positivi = totale; // Tutti gli eventi filtrati sono positivi
                            negativi = 0;
                        } else if (carattereFiltroAttuale === 'negativo') {
                            positivi = 0;
                            negativi = totale; // Tutti gli eventi filtrati sono negativi
                        }
                    } else {
                        // Nessun filtro attivo, conta normalmente
                        allEvents.forEach(evento => {
                            const carattere = evento.carattere || evento.character || evento.tipo_carattere || '';
                            const carattereNorm = carattere.toLowerCase().trim();
                            
                            if (carattereNorm === 'positivo' || carattereNorm === 'positive') {
                                positivi++;
                            } else if (carattereNorm === 'negativo' || carattereNorm === 'negative') {
                                negativi++;
                            }
                        });
                    }
                    
                    const sommaCaratteri = positivi + negativi;
                    console.log(`📊 [TalonChartCore] Dati carattere calcolati:`, {
                        categoria: categoria,
                        ente: ente,
                        totale: totale,
                        positivi: positivi,
                        negativi: negativi,
                        eventiSenzaCarattere: totale - sommaCaratteri,
                        carattereFiltroAttivo: isCharacterFilterActive ? carattereFiltroAttuale : null
                    });
                    
                    return {
                        positivi: positivi,
                        negativi: negativi,
                        totale: totale,
                        success: true,
                        characterFilter: carattereFiltroAttuale,
                        characterFilterActive: isCharacterFilterActive
                    };
                } else {
                    console.warn(`⚠️ [TalonChartCore] Nessun evento trovato dopo i filtri`, {
                        categoria: categoria,
                        ente: ente,
                        carattereFiltroAttivo: isCharacterFilterActive ? carattereFiltroAttuale : null
                    });
                    
                    return {
                        positivi: 0,
                        negativi: 0,
                        totale: 0,
                        success: true,
                        characterFilter: carattereFiltroAttuale,
                        characterFilterActive: isCharacterFilterActive
                    };
                }
            } else {
                console.error(`🚨 [TalonChartCore] Risposta API non valida:`, result);
                const carattereFiltroAttuale = namespace.getCharacterFilter();
                return {
                    positivi: 0,
                    negativi: 0,
                    totale: 0,
                    success: false,
                    error: 'API response not valid',
                    characterFilter: carattereFiltroAttuale,
                    characterFilterActive: carattereFiltroAttuale && carattereFiltroAttuale !== 'tutti' && carattereFiltroAttuale !== ''
                };
            }
            
        } catch (error) {
            console.error(`🚨 [TalonChartCore] Errore calcolo dati carattere:`, error);
            const carattereFiltroAttuale = namespace.getCharacterFilter();
            return {
                positivi: 0,
                negativi: 0,
                totale: 0,
                success: false,
                error: error.message,
                characterFilter: carattereFiltroAttuale,
                characterFilterActive: carattereFiltroAttuale && carattereFiltroAttuale !== 'tutti' && carattereFiltroAttuale !== ''
            };
        }
    };

    /**
     * Estrae parametri da URL
     * @param {string} url - URL completo
     * @returns {URLSearchParams} Parametri estratti
     */
    namespace.extractParamsFromURL = function(url) {
        const urlObj = new URL(url, window.location.origin);
        return urlObj.searchParams;
    };

    /**
     * Precarica dati anticipando navigazione utente
     * @param {string} url - URL da precaricare
     * @param {Object} options - Opzioni preload
     */
    namespace.preloadData = async function(url, options = {}) {
        if (!namespace.cacheManager) return;

        const params = namespace.extractParamsFromURL(url);
        const cacheKey = namespace.generateCacheKey(url, params, options);

        // Evita preload se già in cache
        if (await namespace.cacheManager.get(cacheKey)) {
            return;
        }

        // Preload in background
        namespace.cacheManager.preload(
            cacheKey,
            () => namespace.fetchDirect(url, options),
            {
                ttl: options.cacheTTL,
                metadata: { 
                    preloaded: true, 
                    trigger: options.trigger || 'manual',
                    ...options.cacheMetadata 
                }
            }
        );
    };

    /**
     * Invalida cache basata su pattern o condizioni
     * @param {string|Object} invalidationRule - Regola di invalidazione
     */
    namespace.invalidateCache = function(invalidationRule) {
        if (!namespace.cacheManager) return 0;

        if (typeof invalidationRule === 'string') {
            return namespace.cacheManager.invalidate(invalidationRule);
        } else if (typeof invalidationRule === 'object') {
            // Invalidazione condizionale
            return namespace.cacheManager.invalidate(
                invalidationRule.pattern, 
                invalidationRule.options || {}
            );
        }

        return 0;
    };

    /**
     * Ottieni statistiche cache correnti
     * @returns {Object|null} Statistiche cache
     */
    namespace.getCacheStats = function() {
        if (!namespace.cacheManager) return null;
        return namespace.cacheManager.getStatistics();
    };

    /**
     * Ottieni report dettagliato cache
     * @returns {Object|null} Report completo cache
     */
    namespace.getCacheReport = function() {
        if (!namespace.cacheManager) return null;
        return namespace.cacheManager.getDetailedReport();
    };

    // ========================================
    // CHART.JS UTILITIES
    // ========================================

    /**
     * Plugin ottimizzato per data labels Chart.js
     */
    namespace.createDataLabelsPlugin = function() {
        return {
            id: 'talonDataLabels',
            afterDatasetsDraw: function(chart, args, options) {
                // Skip se troppi elementi per performance
                if (chart.data.labels.length > namespace.config.performance.maxLabelsForDataLabels) {
                    return;
                }
                
                const ctx = chart.ctx;
                const datasets = chart.data.datasets;
                
                // Imposta stili una sola volta per performance
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
    };

    /**
     * Configurazione base per Chart.js
     * @param {Object} options - Opzioni di configurazione
     * @returns {Object} Configurazione Chart.js
     */
    namespace.getBaseChartConfig = function(options = {}) {
        const config = {
            responsive: true,
            maintainAspectRatio: false,
            animation: namespace.config.performance.animation,
            plugins: {
                legend: {
                    display: options.showLegend !== false,
                    position: 'top'
                }
            }
        };

        if (options.chartType === 'line') {
            // Configurazioni specifiche per grafici temporali
            config.interaction = {
                intersect: false,
                mode: 'index'
            };
            config.elements = {
                line: {
                    tension: 0.4
                },
                point: {
                    radius: 6,
                    hoverRadius: 8
                }
            };
        }

        return config;
    };

    // ========================================
    // GESTIONE PERIODO E FILTRI
    // ========================================

    /**
     * Applica un nuovo periodo ai grafici
     * @param {string} newPeriod - Nuovo periodo (year, month, week, custom)
     * @param {Object} customDates - Date personalizzate {start, end}
     */
    namespace.setPeriod = function(newPeriod, customDates = null) {
        namespace.state.currentPeriod = newPeriod;
        
        if (newPeriod === 'custom' && customDates) {
            namespace.state.customStartDate = customDates.start;
            namespace.state.customEndDate = customDates.end;
        } else {
            namespace.state.customStartDate = null;
            namespace.state.customEndDate = null;
        }

        // Trigger evento personalizzato per aggiornamento grafici
        const periodEvent = new CustomEvent('talon:periodChanged', {
            detail: { 
                period: newPeriod, 
                customDates: customDates 
            }
        });
        document.dispatchEvent(periodEvent);

        console.log('📅 [TalonChartCore] Periodo aggiornato:', {
            period: newPeriod,
            customStartDate: namespace.state.customStartDate,
            customEndDate: namespace.state.customEndDate
        });
    };

    /**
     * Applica filtro carattere e aggiorna grafici
     * @param {string} carattere - Carattere evento (positivo, negativo, '')
     */
    namespace.setCharacterFilter = function(carattere) {
        // Il filtro carattere viene gestito tramite DOM input radio
        
        // CRITICO: Invalida cache quando cambia il filtro carattere
        if (namespace.cacheManager) {
            // Invalida tutte le entry relative ai dati che dipendono dal carattere
            const keysToInvalidate = [
                '/eventi/api/dashboard-data',
                '/eventi/api/enti-livello1',
                '/eventi/api/enti-livello2', 
                '/eventi/api/dettagli'
            ];
            
            keysToInvalidate.forEach(pattern => {
                const invalidatedCount = namespace.cacheManager.invalidatePattern(pattern);
                if (invalidatedCount > 0) {
                    console.log(`🧹 [TalonChartCore] Cache invalidata per filtro carattere "${carattere}": ${invalidatedCount} entries (pattern: ${pattern})`);
                }
            });
        }
        
        // Trigger evento per aggiornamento grafici
        const characterEvent = new CustomEvent('talon:characterFilterChanged', {
            detail: { carattere: carattere }
        });
        document.dispatchEvent(characterEvent);

        console.log('🔧 [TalonChartCore] Filtro carattere aggiornato e cache invalidata:', carattere);
    };

    // ========================================
    // INIZIALIZZAZIONE E UTILITY
    // ========================================

    /**
     * Inizializza il modulo core
     */
    namespace.init = function(options = {}) {
        // Aggiorna configurazione con opzioni personalizzate
        if (options.config) {
            Object.assign(namespace.config, options.config);
        }

        // Aggiorna stato iniziale
        if (options.initialState) {
            Object.assign(namespace.state, options.initialState);
        }

        // Inizializza cache manager se disponibile
        if (options.cacheConfig !== false) {
            const cacheEnabled = namespace.initCache(options.cacheConfig || {});
            if (cacheEnabled) {
                console.log('🚀 [TalonChartCore] Cache manager attivo');
            } else {
                console.log('⚠️ [TalonChartCore] Cache manager non disponibile - modalità normale');
            }
        } else {
            console.log('🔧 [TalonChartCore] Cache manager disabilitato dalla configurazione');
        }

        console.log('✅ [TalonChartCore] Inizializzato con configurazione:', namespace.config);
    };

    /**
     * Ottiene lo stato corrente
     * @returns {Object} Copia dello stato corrente
     */
    namespace.getState = function() {
        return Object.assign({}, namespace.state);
    };

    /**
     * Aggiorna lo stato
     * @param {Object} newState - Nuovo stato da applicare
     */
    namespace.setState = function(newState) {
        Object.assign(namespace.state, newState);
        console.log('🔄 [TalonChartCore] Stato aggiornato:', namespace.state);
    };

})(window.TalonChartCore);

// Auto-inizializzazione se eseguito in ambiente browser
if (typeof window !== 'undefined' && window.document) {
    console.log('📊 [TalonChartCore] Modulo caricato - v1.0.0');
}