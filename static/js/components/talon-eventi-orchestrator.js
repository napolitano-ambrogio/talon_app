/**
 * ========================================
 * TALON EVENTI - Orchestrator
 * File: talon-eventi-orchestrator.js
 * 
 * Versione: 1.0.0
 * Controller orchestratore per coordinate viste eventi
 * Gestisce switching, inizializzazione e comunicazione tra componenti
 * ========================================
 */

// Dipendenze richieste
if (typeof window.TalonChartCore === 'undefined') {
    throw new Error('TalonChartCore richiesto per TalonEventiOrchestrator');
}

if (typeof window.TalonEventiTipologieView === 'undefined') {
    throw new Error('TalonEventiTipologieView richiesto per TalonEventiOrchestrator');
}

if (typeof window.TalonEventiEntiView === 'undefined') {
    throw new Error('TalonEventiEntiView richiesto per TalonEventiOrchestrator');
}

window.TalonEventiOrchestrator = window.TalonEventiOrchestrator || {};

(function(namespace, core, tipologieView, entiView) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE ORCHESTRATOR
    // ========================================

    namespace.config = {
        views: {
            tipologie: 'tipologie',
            enti: 'enti'
        },
        defaultView: 'tipologie',
        selectors: {
            viewTabs: '.tab-btn',
            periodButtons: '.period-btn',
            customPeriodSelector: '#eventCustomPeriodSelector',
            characterRadios: 'input[name="evento_carattere"]',
            chartContainer: '.chart-container',
            detailsPanel: '#eventDetailsPanel',
            breadcrumb: '#eventBreadcrumb',
            tipologieTab: '#chartViewTipologie',
            entiTab: '#chartViewEnti'
        },
        debounceDelays: {
            resize: 300,
            filter: 200,
            viewSwitch: 100
        }
    };

    // ========================================
    // GESTIONE STATO ORCHESTRATOR
    // ========================================

    namespace.state = {
        isInitialized: false,
        activeView: null,
        views: {
            tipologie: {
                instance: null,
                isInitialized: false,
                container: null
            },
            enti: {
                instance: null,
                isInitialized: false,
                container: null
            }
        },
        eventHandlers: {
            period: [],
            character: [],
            resize: null,
            viewSwitch: []
        },
        performance: {
            lastViewSwitch: 0,
            resizeTimeout: null,
            filterTimeout: null
        }
    };

    // ========================================
    // GESTIONE VISTE
    // ========================================

    /**
     * Inizializza una vista specifica
     * @param {string} viewType - Tipo di vista ('tipologie' o 'enti')
     * @returns {boolean} True se inizializzata con successo
     */
    function initializeView(viewType) {
        if (namespace.state.views[viewType].isInitialized) {
            console.log(`✅ [Orchestrator] Vista ${viewType} già inizializzata`);
            return true;
        }

        try {
            console.log(`🔄 [Orchestrator] Inizializzazione vista ${viewType}`);
            
            // CRITICO: Segnala al sistema legacy che il modulo è attivo per prevenire conflitti
            window.TALON_MODULAR_SYSTEM_ACTIVE = true;
            console.log('🚧 [Orchestrator] Modulo attivato - sistema legacy disabilitato temporaneamente');

            if (viewType === 'tipologie') {
                tipologieView.init({
                    config: {
                        // Configurazioni personalizzate per tipologie se necessarie
                    }
                });
                namespace.state.views.tipologie.instance = tipologieView;
            } else if (viewType === 'enti') {
                entiView.init({
                    config: {
                        // Configurazioni personalizzate per enti se necessarie
                    }
                });
                namespace.state.views.enti.instance = entiView;
            } else {
                throw new Error(`Vista non supportata: ${viewType}`);
            }

            namespace.state.views[viewType].isInitialized = true;
            console.log(`✅ [Orchestrator] Vista ${viewType} inizializzata con successo`);
            return true;

        } catch (error) {
            console.error(`🚨 [Orchestrator] Errore inizializzazione vista ${viewType}:`, error);
            return false;
        }
    }

    /**
     * Attiva una vista specifica
     * @param {string} viewType - Tipo di vista da attivare
     * @returns {Promise<boolean>} True se attivata con successo
     */
    async function activateView(viewType) {
        // Prevenzione di switch troppo rapidi
        const now = Date.now();
        if (now - namespace.state.performance.lastViewSwitch < namespace.config.debounceDelays.viewSwitch) {
            console.log('⚡ [Orchestrator] Switch vista troppo rapido, ignorato');
            return false;
        }
        namespace.state.performance.lastViewSwitch = now;

        try {
            console.log(`🔄 [Orchestrator] Attivazione vista ${viewType}`);

            // Inizializza vista se necessario
            if (!namespace.state.views[viewType].isInitialized) {
                const initialized = initializeView(viewType);
                if (!initialized) {
                    throw new Error(`Impossibile inizializzare vista ${viewType}`);
                }
            }

            // Deattiva vista corrente
            if (namespace.state.activeView && namespace.state.activeView !== viewType) {
                await deactivateView(namespace.state.activeView);
            }

            // Aggiorna UI dei tab
            updateViewTabs(viewType);

            // Aggiorna stato core
            core.setState({
                viewType: viewType,
                currentLevel: 0, // Reset a livello 0 quando cambia vista
                currentCategory: null,
                currentSubcategory: null,
                currentEntity: null,
                currentSubDetail: null
            });

            // Attiva la nuova vista
            if (viewType === 'tipologie') {
                // La vista tipologie si attiva automaticamente con loadLevel0()
                // Già gestito nell'inizializzazione
            } else if (viewType === 'enti') {
                // La vista enti ha bisogno di attivazione esplicita
                entiView.activate();
            }

            // Aggiorna stato orchestrator
            namespace.state.activeView = viewType;

            // Trigger evento personalizzato
            const activateEvent = new CustomEvent('talon:viewActivated', {
                detail: { 
                    viewType: viewType,
                    timestamp: now
                }
            });
            document.dispatchEvent(activateEvent);

            console.log(`✅ [Orchestrator] Vista ${viewType} attivata con successo`);
            return true;

        } catch (error) {
            console.error(`🚨 [Orchestrator] Errore attivazione vista ${viewType}:`, error);
            return false;
        }
    }

    /**
     * Deattiva una vista specifica
     * @param {string} viewType - Tipo di vista da deattivare
     * @returns {Promise<void>}
     */
    async function deactivateView(viewType) {
        try {
            console.log(`🔄 [Orchestrator] Deattivazione vista ${viewType}`);

            // Nascondi pannello dettagli se visibile
            const detailsPanel = document.querySelector(namespace.config.selectors.detailsPanel);
            if (detailsPanel) {
                detailsPanel.style.display = 'none';
            }

            // Non distruggere le viste, mantienile in memoria per performance
            // Semplicemente rimuovi focus visuale

            console.log(`✅ [Orchestrator] Vista ${viewType} deattivata`);
        } catch (error) {
            console.error(`🚨 [Orchestrator] Errore deattivazione vista ${viewType}:`, error);
        }
    }

    /**
     * Aggiorna UI dei tab per riflettere vista attiva
     * @param {string} activeViewType - Tipo di vista attiva
     */
    function updateViewTabs(activeViewType) {
        // Aggiorna tab button stati
        const tabButtons = document.querySelectorAll(namespace.config.selectors.viewTabs);
        tabButtons.forEach(button => {
            const viewType = button.getAttribute('data-view') || 
                           (button.textContent.toLowerCase().includes('tipologie') ? 'tipologie' : 'enti');
            
            if (viewType === activeViewType) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // Aggiorna container visibilità
        const tipologieContainer = document.querySelector(namespace.config.selectors.tipologieTab);
        const entiContainer = document.querySelector(namespace.config.selectors.entiTab);

        if (tipologieContainer) {
            tipologieContainer.style.display = activeViewType === 'tipologie' ? 'block' : 'none';
            if (activeViewType === 'tipologie') {
                tipologieContainer.classList.add('active');
            } else {
                tipologieContainer.classList.remove('active');
            }
        }

        if (entiContainer) {
            entiContainer.style.display = activeViewType === 'enti' ? 'block' : 'none';
            if (activeViewType === 'enti') {
                entiContainer.classList.add('active');
            } else {
                entiContainer.classList.remove('active');
            }
        }

        console.log(`🎨 [Orchestrator] UI aggiornata per vista ${activeViewType}`);
    }

    // ========================================
    // GESTIONE FILTRI GLOBALI
    // ========================================

    /**
     * Gestisce cambiamenti di periodo
     * @param {string} newPeriod - Nuovo periodo
     * @param {Object} customDates - Date personalizzate
     */
    function handlePeriodChange(newPeriod, customDates = null) {
        // Debounce per evitare troppe chiamate
        clearTimeout(namespace.state.performance.filterTimeout);
        
        namespace.state.performance.filterTimeout = setTimeout(() => {
            console.log(`📅 [Orchestrator] Cambio periodo: ${newPeriod}`, customDates);
            
            // Aggiorna stato core
            core.setPeriod(newPeriod, customDates);
            
            // Le viste si aggiorneranno automaticamente tramite eventi
        }, namespace.config.debounceDelays.filter);
    }

    /**
     * Gestisce cambiamenti filtro carattere
     * @param {string} carattere - Nuovo carattere filtro
     */
    function handleCharacterFilterChange(carattere) {
        // Debounce per evitare troppe chiamate
        clearTimeout(namespace.state.performance.filterTimeout);
        
        namespace.state.performance.filterTimeout = setTimeout(() => {
            console.log(`🔧 [Orchestrator] Cambio filtro carattere: ${carattere}`);
            
            // Aggiorna stato core
            core.setCharacterFilter(carattere);
            
            // Le viste si aggiorneranno automaticamente tramite eventi
        }, namespace.config.debounceDelays.filter);
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    /**
     * Imposta event handlers per l'interfaccia
     */
    function setupEventHandlers() {
        // Handler per switch vista
        const viewButtons = document.querySelectorAll(namespace.config.selectors.viewTabs);
        viewButtons.forEach(button => {
            const handler = (e) => {
                e.preventDefault();
                const viewType = button.getAttribute('data-view') || 
                               (button.textContent.toLowerCase().includes('tipologie') ? 'tipologie' : 'enti');
                activateView(viewType);
            };
            
            button.addEventListener('click', handler);
            namespace.state.eventHandlers.viewSwitch.push({
                element: button,
                handler: handler
            });
        });

        // Handler per bottoni periodo
        const periodButtons = document.querySelectorAll(namespace.config.selectors.periodButtons);
        periodButtons.forEach(button => {
            const handler = (e) => {
                e.preventDefault();
                const period = button.getAttribute('data-period') || button.dataset.period;
                
                // Aggiorna UI
                periodButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                if (period === 'custom') {
                    // Mostra selettore date personalizzate
                    const customSelector = document.querySelector(namespace.config.selectors.customPeriodSelector);
                    if (customSelector) {
                        customSelector.style.display = 'block';
                    }
                } else {
                    // Nascondi selettore date personalizzate
                    const customSelector = document.querySelector(namespace.config.selectors.customPeriodSelector);
                    if (customSelector) {
                        customSelector.style.display = 'none';
                    }
                    
                    handlePeriodChange(period);
                }
            };
            
            button.addEventListener('click', handler);
            namespace.state.eventHandlers.period.push({
                element: button,
                handler: handler
            });
        });

        // Handler per periodo personalizzato
        const customPeriodSelector = document.querySelector(namespace.config.selectors.customPeriodSelector);
        if (customPeriodSelector) {
            const startDateInput = customPeriodSelector.querySelector('input[name="start_date"]');
            const endDateInput = customPeriodSelector.querySelector('input[name="end_date"]');
            const applyButton = customPeriodSelector.querySelector('.apply-custom-period');

            if (startDateInput && endDateInput && applyButton) {
                const applyHandler = () => {
                    const startDate = startDateInput.value;
                    const endDate = endDateInput.value;
                    
                    if (startDate && endDate) {
                        handlePeriodChange('custom', { start: startDate, end: endDate });
                    } else {
                        alert('Seleziona entrambe le date per il periodo personalizzato');
                    }
                };

                applyButton.addEventListener('click', applyHandler);
            }
        }

        // Handler per filtro carattere
        const characterRadios = document.querySelectorAll(namespace.config.selectors.characterRadios);
        characterRadios.forEach(radio => {
            const handler = () => {
                if (radio.checked) {
                    handleCharacterFilterChange(radio.value);
                }
            };
            
            radio.addEventListener('change', handler);
            namespace.state.eventHandlers.character.push({
                element: radio,
                handler: handler
            });
        });

        // Handler per resize finestra
        const resizeHandler = () => {
            clearTimeout(namespace.state.performance.resizeTimeout);
            
            namespace.state.performance.resizeTimeout = setTimeout(() => {
                console.log('🔄 [Orchestrator] Window resize gestito');
                
                // Trigger evento resize per le viste
                const resizeEvent = new CustomEvent('talon:windowResized', {
                    detail: { 
                        width: window.innerWidth,
                        height: window.innerHeight
                    }
                });
                document.dispatchEvent(resizeEvent);
            }, namespace.config.debounceDelays.resize);
        };

        window.addEventListener('resize', resizeHandler);
        namespace.state.eventHandlers.resize = resizeHandler;

        console.log('✅ [Orchestrator] Event handlers configurati');
    }

    /**
     * Rimuove tutti gli event handlers
     */
    function removeEventHandlers() {
        // Rimuovi handlers vista
        namespace.state.eventHandlers.viewSwitch.forEach(({ element, handler }) => {
            element.removeEventListener('click', handler);
        });

        // Rimuovi handlers periodo
        namespace.state.eventHandlers.period.forEach(({ element, handler }) => {
            element.removeEventListener('click', handler);
        });

        // Rimuovi handlers carattere
        namespace.state.eventHandlers.character.forEach(({ element, handler }) => {
            element.removeEventListener('change', handler);
        });

        // Rimuovi handler resize
        if (namespace.state.eventHandlers.resize) {
            window.removeEventListener('resize', namespace.state.eventHandlers.resize);
        }

        // Reset arrays
        namespace.state.eventHandlers = {
            period: [],
            character: [],
            resize: null,
            viewSwitch: []
        };

        console.log('🧹 [Orchestrator] Event handlers rimossi');
    }

    // ========================================
    // INIZIALIZZAZIONE E API PUBBLICHE
    // ========================================

    /**
     * Inizializza l'orchestrator
     * @param {Object} options - Opzioni di configurazione
     */
    namespace.init = function(options = {}) {
        if (namespace.state.isInitialized) {
            console.warn('⚠️ [Orchestrator] Già inizializzato');
            return false;
        }

        try {
            console.log('🚀 [Orchestrator] Inizializzazione...');

            // Aggiorna configurazione se fornita
            if (options.config) {
                Object.assign(namespace.config, options.config);
            }

            // Inizializza modulo core
            core.init({
                initialState: {
                    viewType: namespace.config.defaultView
                }
            });

            // Setup event handlers
            setupEventHandlers();

            // Inizializza vista predefinita
            const defaultView = options.defaultView || namespace.config.defaultView;
            const initialized = initializeView(defaultView);
            
            if (!initialized) {
                throw new Error(`Impossibile inizializzare vista predefinita: ${defaultView}`);
            }

            // Attiva vista predefinita
            setTimeout(() => {
                activateView(defaultView);
            }, 100); // Piccolo delay per permettere al DOM di stabilizzarsi

            namespace.state.isInitialized = true;
            console.log('✅ [Orchestrator] Inizializzato con successo');

            return true;

        } catch (error) {
            console.error('🚨 [Orchestrator] Errore inizializzazione:', error);
            return false;
        }
    };

    /**
     * Switch manuale tra viste
     * @param {string} viewType - Tipo di vista da attivare
     * @returns {Promise<boolean>} True se switch completato
     */
    namespace.switchToView = async function(viewType) {
        if (!namespace.state.isInitialized) {
            console.error('🚨 [Orchestrator] Non inizializzato');
            return false;
        }

        if (!namespace.config.views[viewType]) {
            console.error('🚨 [Orchestrator] Vista non supportata:', viewType);
            return false;
        }

        return await activateView(viewType);
    };

    /**
     * Ottiene lo stato corrente dell'orchestrator
     * @returns {Object} Stato corrente completo
     */
    namespace.getState = function() {
        return {
            orchestrator: {
                isInitialized: namespace.state.isInitialized,
                activeView: namespace.state.activeView,
                viewsStatus: {
                    tipologie: namespace.state.views.tipologie.isInitialized,
                    enti: namespace.state.views.enti.isInitialized
                }
            },
            core: core.getState(),
            views: {
                tipologie: namespace.state.views.tipologie.instance ? 
                          namespace.state.views.tipologie.instance.getState() : null,
                enti: namespace.state.views.enti.instance ? 
                      namespace.state.views.enti.instance.getState() : null
            }
        };
    };

    /**
     * Distrugge l'orchestrator e pulisce le risorse
     */
    namespace.destroy = function() {
        if (!namespace.state.isInitialized) {
            return;
        }

        console.log('🧹 [Orchestrator] Distruzione e pulizia risorse...');

        // Rimuovi event handlers
        removeEventHandlers();

        // Distruggi viste
        if (namespace.state.views.tipologie.instance && 
            namespace.state.views.tipologie.isInitialized) {
            namespace.state.views.tipologie.instance.destroy();
        }

        if (namespace.state.views.enti.instance && 
            namespace.state.views.enti.isInitialized) {
            namespace.state.views.enti.instance.destroy();
        }

        // Reset stato
        namespace.state = {
            isInitialized: false,
            activeView: null,
            views: {
                tipologie: { instance: null, isInitialized: false, container: null },
                enti: { instance: null, isInitialized: false, container: null }
            },
            eventHandlers: { period: [], character: [], resize: null, viewSwitch: [] },
            performance: { lastViewSwitch: 0, resizeTimeout: null, filterTimeout: null }
        };

        console.log('✅ [Orchestrator] Distruzione completata');
    };

    /**
     * Ricarica vista corrente
     */
    namespace.refreshCurrentView = function() {
        if (!namespace.state.activeView) {
            console.warn('⚠️ [Orchestrator] Nessuna vista attiva da ricaricare');
            return;
        }

        console.log(`🔄 [Orchestrator] Ricarica vista corrente: ${namespace.state.activeView}`);
        activateView(namespace.state.activeView);
    };

    /**
     * Gestione eventi globali personalizzati
     */
    namespace.setupGlobalEventHandlers = function() {
        // Handler per eventi che richiedono coordinamento tra viste
        document.addEventListener('talon:globalRefresh', () => {
            console.log('🔄 [Orchestrator] Refresh globale richiesto');
            namespace.refreshCurrentView();
        });

        document.addEventListener('talon:resetAllViews', () => {
            console.log('🔄 [Orchestrator] Reset tutte le viste');
            
            // Reset stato di tutte le viste
            [tipologieView, entiView].forEach(view => {
                if (view && typeof view.getState === 'function') {
                    const state = view.getState();
                    if (state && state.coreState) {
                        // Reset a livello 0 per tutte le viste
                        core.resetToLevel0();
                    }
                }
            });
        });

        console.log('✅ [Orchestrator] Handler eventi globali configurati');
    };

    // ========================================
    // UTILITY E DEBUG
    // ========================================

    /**
     * Informazioni debug sull'orchestrator
     * @returns {Object} Informazioni debug
     */
    namespace.getDebugInfo = function() {
        return {
            version: '1.0.0',
            initialized: namespace.state.isInitialized,
            activeView: namespace.state.activeView,
            performance: namespace.state.performance,
            config: namespace.config,
            availableViews: Object.keys(namespace.config.views),
            eventHandlers: {
                period: namespace.state.eventHandlers.period.length,
                character: namespace.state.eventHandlers.character.length,
                viewSwitch: namespace.state.eventHandlers.viewSwitch.length,
                resize: !!namespace.state.eventHandlers.resize
            }
        };
    };

    // Auto-setup eventi globali se eseguito in ambiente browser
    if (typeof window !== 'undefined' && window.document) {
        // Aspetta che il DOM sia pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                namespace.setupGlobalEventHandlers();
            });
        } else {
            namespace.setupGlobalEventHandlers();
        }
    }

})(window.TalonEventiOrchestrator, window.TalonChartCore, 
   window.TalonEventiTipologieView, window.TalonEventiEntiView);

// Auto-inizializzazione se eseguito in ambiente browser
if (typeof window !== 'undefined' && window.document) {
    console.log('📊 [Orchestrator] Modulo caricato - v1.0.0');
}