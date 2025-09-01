/**
 * ========================================
 * TALON SLIM SEARCHABLE SELECT COMPONENT
 * File: static/js/components/slim-searchable-select.js
 * 
 * Versione: 3.0.0 - Modern Slim Select Implementation
 * Descrizione: Componente select unificato basato su Slim Select
 * Dependencies: Slim Select 2.x
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Verifica che Slim Select sia disponibile
    if (typeof SlimSelect === 'undefined') {
        console.error('[TalonSlimSelect] Slim Select library not found. Please include slim-select before this script.');
        return;
    }

    // ========================================
    // CONFIGURAZIONE GLOBALE
    // ========================================
    
    const DEFAULT_CONFIG = {
        // Settings Slim Select
        settings: {
            disabled: false,
            alwaysOpen: false,
            showSearch: true,
            focusSearch: true,
            searchPlaceholder: 'Cerca...',
            searchText: 'Nessun risultato trovato',
            searchingText: 'Ricerca in corso...',
            searchHighlight: true,
            closeOnSelect: true,
            // Rimuoviamo contentLocation che causa problemi
            // contentLocation: document.body,
            // contentPosition: 'absolute',
            openPosition: 'auto',
            placeholderText: 'Seleziona valore...',
            allowDeselect: false,
            hideSelected: false,
            showOptionTooltips: true,
            minSelected: 0,
            maxSelected: 1000,
            timeoutDelay: 200,
            maxValuesShown: 20,
            maxValuesMessage: '{number} selezionati'
        },

        // Eventi personalizzati TALON
        events: {
            beforeChange: null,
            afterChange: null,
            beforeOpen: null,
            afterOpen: null,
            beforeClose: null,
            afterClose: null,
            search: null,
            error: null
        },

        // Configurazioni specifiche TALON
        talon: {
            logEvents: false,
            validateOnChange: true,
            autoUppercase: true,
            customCssClass: 'talon-slim-select',
            enableTooltips: true
        }
    };

    // ========================================
    // CLASSE TALON SLIM SELECT
    // ========================================
    
    class TalonSlimSelect {
        constructor(element, options = {}) {
            this.element = element;
            this.config = this.mergeConfig(DEFAULT_CONFIG, options);
            
            // Trova il select associato
            this.selectId = element.dataset.selectId || element.getAttribute('data-select-id');
            this.selectElement = document.getElementById(this.selectId);
            
            if (!this.selectElement) {
                this.log('error', `Select element with id '${this.selectId}' not found`);
                return;
            }

            // Stato interno
            this.state = {
                initialized: false,
                isOpen: false,
                slimInstance: null,
                originalData: [],
                currentValue: null
            };

            // Storage per cleanup
            this.eventHandlers = [];
            
            // Inizializza
            this.init();
        }

        // ========================================
        // INIZIALIZZAZIONE
        // ========================================
        
        init() {
            if (this.state.initialized) {
                this.log('warn', 'Already initialized');
                return;
            }

            this.log('debug', `Initializing TalonSlimSelect for #${this.selectId}...`);

            try {
                // Prepara configurazione Slim Select
                this.prepareSlimConfig();
                
                // Crea istanza Slim Select
                this.createSlimInstance();
                
                // Applica personalizzazioni TALON
                this.applyTalonCustomizations();
                
                // Setup eventi
                this.setupEventHandlers();
                
                // Sincronizza valore iniziale
                this.syncInitialValue();
                
                this.state.initialized = true;
                this.log('success', `✅ TalonSlimSelect initialized for #${this.selectId}`);
                
                // Emetti evento ready
                this.emit('talon-slim-select:ready');
                
            } catch (error) {
                this.log('error', 'Initialization failed:', error);
            }
        }

        prepareSlimConfig() {
            this.slimConfig = {
                select: this.selectElement,
                settings: { ...this.config.settings },
                events: {}
            };

            // Configura eventi Slim Select con wrapper TALON
            if (this.config.events.beforeChange) {
                this.slimConfig.events.beforeChange = (newVal, oldVal) => {
                    return this.config.events.beforeChange.call(this, newVal, oldVal);
                };
            }

            if (this.config.events.afterChange) {
                this.slimConfig.events.afterChange = (newVal) => {
                    this.handleAfterChange(newVal);
                };
            }

            if (this.config.events.beforeOpen) {
                this.slimConfig.events.beforeOpen = () => {
                    this.state.isOpen = true;
                    if (this.config.events.beforeOpen) {
                        this.config.events.beforeOpen.call(this);
                    }
                };
            }

            if (this.config.events.afterOpen) {
                this.slimConfig.events.afterOpen = () => {
                    if (this.config.events.afterOpen) {
                        this.config.events.afterOpen.call(this);
                    }
                };
            }

            if (this.config.events.beforeClose) {
                this.slimConfig.events.beforeClose = () => {
                    if (this.config.events.beforeClose) {
                        this.config.events.beforeClose.call(this);
                    }
                };
            }

            if (this.config.events.afterClose) {
                this.slimConfig.events.afterClose = () => {
                    this.state.isOpen = false;
                    if (this.config.events.afterClose) {
                        this.config.events.afterClose.call(this);
                    }
                };
            }

            if (this.config.events.search) {
                this.slimConfig.events.search = (searchValue, currentData) => {
                    return this.config.events.search.call(this, searchValue, currentData);
                };
            }

            if (this.config.events.error) {
                this.slimConfig.events.error = (err) => {
                    this.log('error', 'Slim Select error:', err);
                    this.config.events.error.call(this, err);
                };
            }
        }

        createSlimInstance() {
            // Nascondi il contenitore originale se esiste
            if (this.element) {
                this.element.style.display = 'none';
            }

            // Mostra il select element per Slim Select
            this.selectElement.style.display = 'block';
            this.selectElement.style.visibility = 'visible';

            // Crea istanza Slim Select direttamente sul select element
            this.state.slimInstance = new SlimSelect(this.slimConfig);
            
            this.log('debug', 'Slim Select instance created');
        }

        applyTalonCustomizations() {
            // Delay per permettere a Slim Select di completare il rendering
            setTimeout(() => {
                // Applica classe CSS personalizzata
                const container = this.selectElement.nextElementSibling;
                if (container && container.classList.contains('ss-main') && this.config.talon.customCssClass) {
                    container.classList.add(this.config.talon.customCssClass);
                }

                // Applica stile text-transform se abilitato
                if (this.config.talon.autoUppercase && container) {
                    const singleContainer = container.querySelector('.ss-single');
                    const multiContainer = container.querySelector('.ss-multi');
                    
                    if (singleContainer) {
                        singleContainer.style.textTransform = 'uppercase';
                    }
                    if (multiContainer) {
                        multiContainer.style.textTransform = 'uppercase';
                    }
                }

                // Configura tooltips se abilitati
                if (this.config.talon.enableTooltips) {
                    this.setupTooltips();
                }

                // Migliora accessibilità aggiungendo attributi agli input di ricerca
                this.setupAccessibility();
            }, 100);
        }

        setupTooltips() {
            // Configura tooltips per le opzioni usando title attribute
            // Semplificato per evitare interferenze con Slim Select
            const options = this.selectElement.querySelectorAll('option');
            let tooltipCount = 0;
            
            options.forEach(option => {
                if (option.dataset.details || option.dataset.tooltip) {
                    option.title = option.dataset.details || option.dataset.tooltip;
                    tooltipCount++;
                }
            });
            
            this.log('debug', `Configured ${tooltipCount} tooltips`);
        }

        setupAccessibility() {
            // Migliora accessibilità degli input di ricerca Slim Select
            const container = this.selectElement.nextElementSibling;
            if (!container || !container.classList.contains('ss-main')) {
                return;
            }

            // Setup immediato e observer aggressivo
            this.processExistingSearchInputs(container);
            this.setupGlobalSearchObserver();
            this.observeSearchInputs(container);
            
            // Backup con timer ricorrenti per catturare input sfuggiti
            this.startPeriodicSearchScan();
        }

        processExistingSearchInputs(container) {
            // Processo immediato degli input esistenti
            const searchInputs = container.querySelectorAll('.ss-search input[type="search"]');
            this.applyAccessibilityToInputs(searchInputs);
            
            // Ripeti dopo brevi intervalli per catturare input creati in ritardo
            setTimeout(() => {
                const newInputs = container.querySelectorAll('.ss-search input[type="search"]');
                this.applyAccessibilityToInputs(newInputs);
            }, 50);
            
            setTimeout(() => {
                const laterInputs = container.querySelectorAll('.ss-search input[type="search"]');
                this.applyAccessibilityToInputs(laterInputs);
            }, 200);
            
            setTimeout(() => {
                const finalInputs = container.querySelectorAll('.ss-search input[type="search"]');
                this.applyAccessibilityToInputs(finalInputs);
            }, 500);
        }

        applyAccessibilityToInputs(searchInputs) {
            searchInputs.forEach((searchInput, index) => {
                if (!searchInput.hasAttribute('data-talon-processed')) {
                    // Genera ID univoco con selectId specifico, timestamp, random e index
                    const timestamp = Date.now();
                    const randomId = Math.random().toString(36).substr(2, 9);
                    const selectContext = this.selectId || 'unknown';
                    const searchId = `${selectContext}_search_${timestamp}_${randomId}_${index}`;
                    
                    searchInput.id = searchId;
                    searchInput.name = searchId;
                    
                    // Migliora accessibilità con attributi aria
                    searchInput.setAttribute('aria-label', `Ricerca opzioni per ${selectContext}`);
                    searchInput.setAttribute('role', 'searchbox');
                    searchInput.setAttribute('autocomplete', 'off');
                    
                    // Marca come processato per evitare duplicazioni
                    searchInput.setAttribute('data-talon-processed', 'true');
                    
                    this.log('debug', `Added accessibility attributes to search input: ${searchId}`);
                }
            });
        }

        setupGlobalSearchObserver() {
            // Observer globale per catturare tutti gli input search ovunque vengano creati
            if (!window._talonGlobalSearchObserver) {
                const globalObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    // Cerca input di ricerca nei nuovi nodi
                                    let searchInputs = [];
                                    
                                    if (node.matches && node.matches('input[type="search"]')) {
                                        searchInputs.push(node);
                                    }
                                    if (node.querySelectorAll) {
                                        searchInputs.push(...node.querySelectorAll('input[type="search"]'));
                                    }
                                    
                                    // Applica accessibilità a tutti gli input trovati
                                    if (searchInputs.length > 0) {
                                        this.applyAccessibilityToInputs(searchInputs);
                                    }
                                }
                            });
                        }
                    });
                });

                globalObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                window._talonGlobalSearchObserver = globalObserver;
            }
        }

        startPeriodicSearchScan() {
            // Scan periodico per catturare input che potrebbero essere sfuggiti
            this._searchScanInterval = setInterval(() => {
                const allSearchInputs = document.querySelectorAll('input[type="search"]:not([data-talon-processed])');
                if (allSearchInputs.length > 0) {
                    this.applyAccessibilityToInputs(allSearchInputs);
                }
            }, 1000);
            
            // Stop scan dopo 10 secondi (dovrebbe essere sufficiente)
            setTimeout(() => {
                if (this._searchScanInterval) {
                    clearInterval(this._searchScanInterval);
                    this._searchScanInterval = null;
                }
            }, 10000);
        }

        observeSearchInputs(container) {
            // MutationObserver per catturare input di ricerca aggiunti dinamicamente
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Cerca input di ricerca nei nuovi nodi aggiunti
                                const newSearchInputs = node.querySelectorAll ? 
                                    node.querySelectorAll('.ss-search input[type="search"]') :
                                    (node.matches && node.matches('.ss-search input[type="search"]') ? [node] : []);
                                
                                newSearchInputs.forEach((searchInput, index) => {
                                    if (!searchInput.id && !searchInput.name) {
                                        const searchId = `${this.selectId}_dynamic_search_${Date.now()}_${index}`;
                                        searchInput.id = searchId;
                                        searchInput.name = searchId;
                                        searchInput.setAttribute('aria-label', `Ricerca opzioni per ${this.selectId}`);
                                        searchInput.setAttribute('role', 'searchbox');
                                        searchInput.setAttribute('autocomplete', 'off');
                                        
                                        this.log('debug', `Added accessibility attributes to dynamic search input: ${searchId}`);
                                    }
                                });
                            }
                        });
                    }
                });
            });

            // Osserva cambiamenti nel container Slim Select
            observer.observe(container, {
                childList: true,
                subtree: true
            });

            // Salva observer per cleanup
            this._accessibilityObserver = observer;
        }

        setupEventHandlers() {
            // Rimuoviamo la sincronizzazione automatica che causa loop infinito
            // Il Slim Select gestisce già la sincronizzazione internamente
            
            // Manteniamo solo gli eventi necessari senza sincronizzazione
            this.log('debug', 'Event handlers configured (sync disabled to prevent loops)');
        }

        handleAfterChange(newVal) {
            this.state.currentValue = newVal;
            
            // Log se abilitato
            if (this.config.talon.logEvents) {
                this.log('debug', 'Value changed:', newVal);
            }

            // Validazione se abilitata
            if (this.config.talon.validateOnChange) {
                this.validateSelection(newVal);
            }

            // Emetti evento personalizzato
            this.emit('talon-slim-select:change', {
                value: newVal,
                selectId: this.selectId,
                instance: this
            });

            // Chiama callback utente se definito
            if (this.config.events.afterChange) {
                this.config.events.afterChange.call(this, newVal);
            }
        }

        // ========================================
        // SINCRONIZZAZIONE
        // ========================================
        
        syncInitialValue() {
            // Sincronizza il valore iniziale del select
            if (this.selectElement.value) {
                this.state.currentValue = this.selectElement.value;
            }
        }

        // syncFromNativeSelect rimosso per prevenire loop infinito
        // Slim Select gestisce automaticamente la sincronizzazione

        // ========================================
        // METODI PUBBLICI
        // ========================================
        
        getValue() {
            return this.state.slimInstance ? this.state.slimInstance.getSelected() : null;
        }

        setValue(value) {
            if (this.state.slimInstance) {
                this.state.slimInstance.setSelected(value);
                this.state.currentValue = value;
            }
        }

        getData() {
            return this.state.slimInstance ? this.state.slimInstance.getData() : [];
        }

        setData(data) {
            if (this.state.slimInstance) {
                this.state.slimInstance.setData(data);
            }
        }

        open() {
            if (this.state.slimInstance) {
                this.state.slimInstance.open();
            }
        }

        close() {
            if (this.state.slimInstance) {
                this.state.slimInstance.close();
            }
        }

        enable() {
            if (this.state.slimInstance) {
                this.state.slimInstance.enable();
            }
        }

        disable() {
            if (this.state.slimInstance) {
                this.state.slimInstance.disable();
            }
        }

        refresh() {
            // Ricrea istanza per refresh completo
            if (this.state.slimInstance) {
                this.destroy();
                this.init();
            }
        }

        // ========================================
        // VALIDAZIONE
        // ========================================
        
        validateSelection(value) {
            // Validazione base - estendibile
            if (this.selectElement.hasAttribute('required') && (!value || value.length === 0)) {
                this.markAsInvalid('Campo obbligatorio');
                return false;
            }
            
            this.markAsValid();
            return true;
        }

        markAsValid() {
            const container = this.selectElement.closest('.ss-main');
            if (container) {
                container.classList.remove('is-invalid');
                container.classList.add('is-valid');
            }
        }

        markAsInvalid(message = '') {
            const container = this.selectElement.closest('.ss-main');
            if (container) {
                container.classList.remove('is-valid');
                container.classList.add('is-invalid');
                
                if (message) {
                    container.title = message;
                }
            }
        }

        // ========================================
        // UTILITY
        // ========================================
        
        mergeConfig(defaults, overrides) {
            const merged = JSON.parse(JSON.stringify(defaults));
            
            if (overrides.settings) {
                Object.assign(merged.settings, overrides.settings);
            }
            if (overrides.events) {
                Object.assign(merged.events, overrides.events);
            }
            if (overrides.talon) {
                Object.assign(merged.talon, overrides.talon);
            }
            
            return merged;
        }

        emit(eventName, detail = {}) {
            const event = new CustomEvent(eventName, {
                detail: { ...detail, instance: this },
                bubbles: true,
                cancelable: true
            });
            
            if (this.element) {
                this.element.dispatchEvent(event);
            } else {
                this.selectElement.dispatchEvent(event);
            }
        }

        log(level, ...args) {
            // Disabilita tutti i log tranne errori in produzione
            if (!this.config.talon.logEvents && level !== 'error') return;
            
            const prefix = '[TalonSlimSelect]';
            const methods = {
                'debug': 'log',
                'info': 'info', 
                'warn': 'warn',
                'error': 'error',
                'success': 'log'
            };
            
            const method = methods[level] || 'log';
            console[method](prefix, ...args);
        }

        // ========================================
        // CLEANUP
        // ========================================
        
        destroy() {
            this.log('info', 'Destroying TalonSlimSelect...');
            
            // Rimuovi event handlers
            this.eventHandlers.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.eventHandlers = [];
            
            // Pulisci observer di accessibilità
            if (this._accessibilityObserver) {
                this._accessibilityObserver.disconnect();
                this._accessibilityObserver = null;
            }
            
            // Pulisci scan periodico
            if (this._searchScanInterval) {
                clearInterval(this._searchScanInterval);
                this._searchScanInterval = null;
            }
            
            // Distruggi istanza Slim Select
            if (this.state.slimInstance) {
                this.state.slimInstance.destroy();
                this.state.slimInstance = null;
            }
            
            // Ripristina elementi originali
            if (this.element) {
                this.element.style.display = '';
            }
            
            // Nascondi di nuovo il select element
            if (this.selectElement) {
                this.selectElement.style.display = 'none';
            }
            
            // Reset stato
            this.state.initialized = false;
            this.state.isOpen = false;
            this.state.currentValue = null;
            
            this.log('success', '✅ TalonSlimSelect destroyed');
        }
    }

    // ========================================
    // MANAGER GLOBALE
    // ========================================
    
    class TalonSlimSelectManager {
        constructor() {
            this.instances = new Map();
            this.initialized = false;
            this.autoInitDelay = 100;

            // Auto-init quando DOM è pronto
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                setTimeout(() => this.init(), this.autoInitDelay);
            }
        }

        init() {
            if (this.initialized) return;
            
            this.log('info', 'Initializing TalonSlimSelectManager...');
            
            // Auto-detect e inizializza elementi
            this.autoInitialize();
            
            this.initialized = true;
            this.log('success', '✅ TalonSlimSelectManager ready');
        }

        autoInitialize() {
            // Cerca tutti gli elementi con attributo data-select-id
            const elements = document.querySelectorAll('[data-select-id]:not([data-slim-initialized])');
            
            elements.forEach(element => {
                const selectId = element.dataset.selectId;
                
                // Skip se già inizializzato
                if (this.instances.has(selectId)) {
                    return;
                }
                
                // Crea nuova istanza
                this.create(element);
            });
            
            this.log('debug', `Auto-initialized ${elements.length} select elements`);
        }

        create(element, options = {}) {
            const selectId = element.dataset.selectId;
            
            if (!selectId) {
                this.log('error', 'Element missing data-select-id attribute');
                return null;
            }
            
            // Distruggi istanza esistente se presente
            if (this.instances.has(selectId)) {
                this.destroy(selectId);
            }
            
            // Crea nuova istanza
            const instance = new TalonSlimSelect(element, options);
            
            if (instance.state.initialized) {
                this.instances.set(selectId, instance);
                element.setAttribute('data-slim-initialized', 'true');
                
                this.log('debug', `Created instance for #${selectId}`);
                return instance;
            }
            
            return null;
        }

        get(selectId) {
            return this.instances.get(selectId);
        }

        getAll() {
            return Array.from(this.instances.values());
        }

        destroy(selectId) {
            const instance = this.instances.get(selectId);
            if (instance) {
                instance.destroy();
                this.instances.delete(selectId);
                
                // Rimuovi attributo inizializzazione
                const element = document.querySelector(`[data-select-id="${selectId}"]`);
                if (element) {
                    element.removeAttribute('data-slim-initialized');
                }
                
                this.log('debug', `Destroyed instance for #${selectId}`);
            }
        }

        destroyAll() {
            this.instances.forEach((instance, selectId) => {
                instance.destroy();
            });
            this.instances.clear();
            
            // Rimuovi tutti gli attributi di inizializzazione
            const elements = document.querySelectorAll('[data-slim-initialized]');
            elements.forEach(element => {
                element.removeAttribute('data-slim-initialized');
            });
            
            this.log('info', 'All instances destroyed');
        }

        refresh() {
            this.instances.forEach(instance => instance.refresh());
            this.log('debug', 'All instances refreshed');
        }

        reinitialize() {
            this.destroyAll();
            this.autoInitialize();
            this.log('info', 'Manager reinitialized');
        }

        log(level, ...args) {
            // Disabilita tutti i log tranne errori in produzione
            if (level !== 'error') return;
            
            const prefix = '[TalonSlimSelectManager]';
            const method = level === 'debug' ? 'log' : level;
            
            // Verifica che il metodo esista
            if (typeof console[method] === 'function') {
                console[method](prefix, ...args);
            } else {
                console.log(prefix, '[' + level.toUpperCase() + ']', ...args);
            }
        }
    }

    // ========================================
    // INIZIALIZZAZIONE GLOBALE
    // ========================================
    
    // Crea istanza globale manager
    const globalManager = new TalonSlimSelectManager();

    // Funzione globale per forzare la pulizia di tutti gli input search
    window.fixAllSearchInputs = function() {
        const allSearchInputs = document.querySelectorAll('input[type="search"]:not([data-talon-processed])');
        
        allSearchInputs.forEach((searchInput, globalIndex) => {
            // Identifica il contesto del select per ID più specifici
            let selectContext = 'global';
            const parentContainer = searchInput.closest('.ss-main');
            if (parentContainer) {
                const previousSelect = parentContainer.previousElementSibling;
                if (previousSelect && previousSelect.id) {
                    selectContext = previousSelect.id;
                }
            }
            
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substr(2, 9);
            const uniqueId = `${selectContext}_global_${timestamp}_${randomId}_${globalIndex}`;
            
            searchInput.id = uniqueId;
            searchInput.name = uniqueId;
            searchInput.setAttribute('aria-label', `Campo di ricerca globale per ${selectContext}`);
            searchInput.setAttribute('role', 'searchbox');
            searchInput.setAttribute('autocomplete', 'off');
            searchInput.setAttribute('data-talon-processed', 'true');
        });
        
        console.log(`[TalonSlimSelect] Fixed ${allSearchInputs.length} search inputs globally`);
        return allSearchInputs.length;
    };

    // Export API globale
    window.TalonSlimSelect = {
        // Classe principale
        TalonSlimSelect: TalonSlimSelect,
        
        // Manager methods
        create: (element, options) => globalManager.create(element, options),
        get: (selectId) => globalManager.get(selectId),
        getAll: () => globalManager.getAll(),
        destroy: (selectId) => globalManager.destroy(selectId),
        destroyAll: () => globalManager.destroyAll(),
        refresh: () => globalManager.refresh(),
        reinitialize: () => globalManager.reinitialize(),
        
        // Utility
        isReady: () => globalManager.initialized,
        getConfig: () => DEFAULT_CONFIG,
        fixAllSearchInputs: window.fixAllSearchInputs,
        
        // Info
        version: '3.0.1'
    };

    // Alias per compatibilità con l'implementazione precedente
    window.TALON_API = window.TALON_API || {};
    window.TALON_API.SlimSelect = TalonSlimSelect;
    window.TALON_API.initializeSlimSelects = () => globalManager.autoInitialize();
    window.TALON_API.refreshSlimSelects = () => globalManager.refresh();

})(window, document);