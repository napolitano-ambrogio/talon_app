/**
 * ========================================
 * TALON MAIN APPLICATION SCRIPT
 * File: static/js/script.js
 * 
 * Versione: 3.1.0 - Standard Version
 * Descrizione: Script principale con inizializzazione
 *              applicazione, gestione componenti e utility
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE GLOBALE
    // ========================================
    
    const TALON_CONFIG = {
        APP_NAME: 'TALON',
        VERSION: '3.0.0',
        DEBUG_MODE: localStorage.getItem('talonDebugMode') === 'true',
        
        // API Endpoints
        API_ENDPOINTS: {
            AUTH: '/auth',
            ENTI_CIVILI: '/api/enti_civili',
            ENTI_MILITARI: '/api/enti_militari',
            OPERAZIONI: '/api/operazioni',
            ATTIVITA: '/api/attivita',
            USERS: '/api/users',
            SYSTEM: '/api/system'
        },
        
        // UI Configuration
        UI: {
            ANIMATION_DURATION: 300,
            TOAST_DURATION: 4000,
            DEBOUNCE_DELAY: 300,
            SEARCH_DELAY: 200,
            AUTO_SAVE_DELAY: 2000
        },
        
        
        // Roles
        ROLES: {
            ADMIN: { level: 100, label: 'Amministratore' },
            OPERATORE: { level: 50, label: 'Operatore' },
            VISUALIZZATORE: { level: 10, label: 'Visualizzatore' },
            GUEST: { level: 0, label: 'Ospite' }
        }
    };

    // ========================================
    // CLASSE PRINCIPALE TALON APPLICATION
    // ========================================
    
    class TalonApplication {
        constructor() {
            this.config = TALON_CONFIG;
            this.state = {
                initialized: false,
                currentUser: null,
                currentRole: null,
                activeModules: new Set(),
                searchableSelects: new Map(),
                autoSaveForms: new Map(),
                activeTimers: new Set(),
                activeIntervals: new Set()
            };
            
            // Component managers
            this.componentManagers = new Map();
            
            // Event handlers for cleanup
            this.eventHandlers = new Map();
            
        }

        // ========================================
        // INIZIALIZZAZIONE
        // ========================================
        
        async init() {
            if (this.state.initialized) {
                this.log('warn', 'Application already initialized');
                return;
            }
            
            
            try {
                // 1. Setup environment
                this.setupEnvironment();
                
                // 2. Detect user info
                await this.detectUserInfo();
                
                // 3. Initialize core modules
                await this.initializeCoreModules();
                
                // 4. Setup global handlers
                this.setupGlobalHandlers();
                
                
                // 6. Initialize UI components
                await this.initializeUIComponents();
                
                // 7. Load initial data
                await this.loadInitialData();
                
                this.state.initialized = true;
                
                
                // Emit ready event
                this.emit('talon:app:ready', {
                    version: this.config.VERSION,
                    user: this.state.currentUser,
                    role: this.state.currentRole
                });
                
            } catch (error) {
                // Error logged silently - console removed for production
                this.showError('Errore durante l\'inizializzazione dell\'applicazione');
            }
        }

        // ========================================
        // SETUP ENVIRONMENT
        // ========================================
        
        setupEnvironment() {
            // Meta tags
            this.ensureMetaTags();
            
            // CSRF token
            this.setupCSRFToken();
            
            // Debug mode
            if (this.config.DEBUG_MODE) {
                document.body.classList.add('debug-mode');
                window.TALON_DEBUG = this;
            }
            
            // Browser compatibility
            this.checkBrowserCompatibility();
        }

        ensureMetaTags() {
            const requiredMetas = [
                { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
                { name: 'app-version', content: this.config.VERSION }
            ];
            
            requiredMetas.forEach(meta => {
                if (!document.querySelector(`meta[name="${meta.name}"]`)) {
                    const metaTag = document.createElement('meta');
                    metaTag.name = meta.name;
                    metaTag.content = meta.content;
                    document.head.appendChild(metaTag);
                }
            });
        }

        setupCSRFToken() {
            const token = document.querySelector('meta[name="csrf-token"]');
            if (!token) return;
            
            // jQuery setup
            if (window.$ && window.$.ajaxSetup) {
                $.ajaxSetup({
                    headers: { 'X-CSRF-TOKEN': token.content }
                });
            }
            
        }

        checkBrowserCompatibility() {
            const required = ['Promise', 'fetch', 'IntersectionObserver', 'MutationObserver'];
            const missing = required.filter(feature => !(feature in window));
            
            if (missing.length > 0) {
                // Warning logged silently - console removed for production
            }
        }

        // ========================================
        // USER DETECTION
        // ========================================
        
        async detectUserInfo() {
            // Priority: Flask > Meta > Body > Session
            this.state.currentRole = 
                window.FLASK_USER_ROLE ||
                document.querySelector('meta[name="user-role"]')?.content ||
                document.body.getAttribute('data-user-role') ||
                sessionStorage.getItem('userRole') ||
                'GUEST';
            
            this.state.currentUser = 
                window.FLASK_USER_NAME ||
                document.querySelector('meta[name="user-name"]')?.content ||
                document.getElementById('user-name')?.textContent ||
                'Utente';
            
            // Propagate info
            document.body.setAttribute('data-user-role', this.state.currentRole);
            document.body.setAttribute('data-user-name', this.state.currentUser);
            
            this.log('info', `User: ${this.state.currentUser} (${this.state.currentRole})`);
        }

        // ========================================
        // MODULE INITIALIZATION
        // ========================================
        
        async initializeCoreModules() {
            const modules = [
                { name: 'TalonApp', required: true },
                { name: 'TalonSidebar', required: false },
                { name: 'TalonRoleManager', required: false }
            ];
            
            for (const module of modules) {
                const success = await this.waitForModule(module.name);
                if (success) {
                    this.state.activeModules.add(module.name);
                } else if (module.required) {
                    throw new Error(`Required module ${module.name} not found`);
                }
            }
        }

        async waitForModule(moduleName, timeout = 5000) {
            const startTime = Date.now();
            
            while (!window[moduleName]) {
                if (Date.now() - startTime > timeout) {
                    this.log('warn', `Timeout waiting for module: ${moduleName}`);
                    return false;
                }
                await this.delay(100);
            }
            
            this.log('info', `✓ Module loaded: ${moduleName}`);
            return true;
        }

        // ========================================
        // GLOBAL HANDLERS
        // ========================================
        
        setupGlobalHandlers() {
            // Error handling
            this.setupErrorHandling();
            
            // Form handling
            this.setupFormHandlers();
            
            // Keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Network status
            this.setupNetworkHandlers();
            
            // Inactivity timer
            this.setupInactivityTimer();
        }

        setupErrorHandling() {
            window.addEventListener('error', (e) => {
                if (this.config.DEBUG_MODE) {
                    // Error logged silently - console removed for production
                }
                this.emit('talon:error', { error: e.error });
            });
            
            window.addEventListener('unhandledrejection', (e) => {
                if (this.config.DEBUG_MODE) {
                    // Error logged silently - console removed for production
                }
                this.emit('talon:rejection', { reason: e.reason });
            });
        }

        setupFormHandlers() {
            // Auto-uppercase
            document.addEventListener('input', (e) => {
                if (e.target.matches('[data-uppercase]')) {
                    e.target.value = e.target.value.toUpperCase();
                }
            });
            
            // Real-time validation (removed validateField call that doesn't exist)
            
            // Confirm dangerous forms
            document.addEventListener('submit', (e) => {
                const form = e.target;
                if (form.hasAttribute('data-confirm-submit')) {
                    const message = form.getAttribute('data-confirm-submit') || 'Confermare?';
                    if (!confirm(message)) {
                        e.preventDefault();
                    }
                }
            });
        }

        getShortcutKey(event) {
            const keys = [];
            
            if (event.ctrlKey) keys.push('ctrl');
            if (event.shiftKey) keys.push('shift');
            if (event.altKey) keys.push('alt');
            if (event.metaKey) keys.push('meta');
            
            const keyName = event.key.toLowerCase();
            if (keyName !== 'control' && keyName !== 'shift' && keyName !== 'alt' && keyName !== 'meta') {
                keys.push(keyName);
            }
            
            return keys.join('+');
        }

        setupKeyboardShortcuts() {
            const shortcuts = {
                'ctrl+s': (e) => {
                    e.preventDefault();
                    this.saveCurrentForm();
                },
                'ctrl+shift+f': (e) => {
                    e.preventDefault();
                    this.focusSearch();
                },
                'ctrl+shift+d': (e) => {
                    e.preventDefault();
                    this.toggleDebugMode();
                },
                'escape': () => {
                    this.closeAllModals();
                }
            };
            
            document.addEventListener('keydown', (e) => {
                const key = this.getShortcutKey(e);
                if (shortcuts[key]) {
                    shortcuts[key](e);
                }
            });
        }

        setupNetworkHandlers() {
            window.addEventListener('online', () => {
                this.showSuccess('Connessione ripristinata');
                this.emit('talon:online');
            });
            
            window.addEventListener('offline', () => {
                this.showError('Connessione persa');
                this.emit('talon:offline');
            });
        }

        setupInactivityTimer() {
            let timer;
            const TIMEOUT = 30 * 60 * 1000; // 30 minuti
            
            const resetTimer = () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    this.handleInactivity();
                }, TIMEOUT);
            };
            
            ['mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
                document.addEventListener(event, resetTimer, true);
            });
            
            resetTimer();
        }


        // ========================================
        // UI COMPONENTS
        // ========================================
        
        async initializeUIComponents() {
            this.log('debug', 'Initializing UI components...');
            
            // Bootstrap components
            this.initializeBootstrapComponents();
            
            // Searchable selects
            this.initializeSearchableSelects();
            
            // Sortable tables
            this.initializeSortableTables();
            
            // Auto-save forms
            this.initializeAutoSaveForms();
            
            // Character counters
            this.initializeCharCounters();
            
            // Lazy loading
            this.initializeLazyLoading();
            
            // Custom components
            await this.initializeCustomComponents();
        }

        initializeBootstrapComponents() {
            if (!window.bootstrap) return;
            
            // Tooltips
            document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                new bootstrap.Tooltip(el);
            });
            
            // Popovers
            document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
                new bootstrap.Popover(el);
            });
        }

        // ========================================
        // SEARCHABLE SELECT CLASS DEFINITION
        // ========================================
        
        // Definizione classe SearchableSelect (spostata qui per risolvere l'errore di utilizzo prima della definizione)
        
        // ========================================
        // SEARCHABLE SELECT COMPONENT
        // ========================================
        
        initializeSearchableSelects() {
            const containers = document.querySelectorAll('.searchable-select[data-select-id]');
            
            containers.forEach(container => {
                const selectId = container.getAttribute('data-select-id');
                
                // Skip if already initialized
                if (this.state.searchableSelects.has(selectId)) {
                    return;
                }
                
                const component = this.createSearchableSelect(container, selectId);
                this.state.searchableSelects.set(selectId, component);
            });
            
            this.log('debug', `Initialized ${containers.length} searchable selects`);
        }

        createSearchableSelect(container, selectId) {
            // Factory method per creare SearchableSelect - lazy loading
            if (typeof SearchableSelect === 'undefined') {
                // Warning logged silently - console removed for production
                return null;
            }
            return new SearchableSelect(container, selectId);
        }

        // ========================================
        // SEARCHABLE SELECT CLASS - RIMOSSA
        // ========================================
        // Classe spostata alla fine del file come definizione globale
        
        // VECCHIA CLASSE SEARCHABLESELECT RIMOSSA
        // (ora definita come classe globale alla fine del file)
        
        // ========================================
        // UTILITY METHODS
        // ========================================
        
        showSuccess(message, duration) {
            this.showToast(message, 'success', duration);
        }

        showError(message, duration) {
            this.showToast(message, 'danger', duration || 5000);
        }

        showInfo(message, duration) {
            this.showToast(message, 'info', duration);
        }

        showWarning(message, duration) {
            this.showToast(message, 'warning', duration);
        }

        log(level, ...args) {
            if (!this.config.DEBUG_MODE && level === 'debug') return;
            
            const prefix = `[${this.config.APP_NAME}]`;
            const methods = {
                'debug': 'log',
                'info': 'info',
                'warn': 'warn',
                'error': 'error',
                'success': 'info'
            };
            
            // Console logging removed for production silence
            // const method = methods[level] || 'log';
            // console[method](prefix, ...args);
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        showToast(message, type = 'info', duration = 4000) {
            // Fallback toast implementation - console removed for production silence
            
            // Se esiste una libreria toast, usala
            if (window.TalonApp && window.TalonApp.showToast) {
                return window.TalonApp.showToast(message, type, duration);
            }
        }

        async ready() {
            if (this.state.initialized) return true;
            
            return new Promise((resolve) => {
                this.on('talon:app:ready', () => resolve(true));
            });
        }
        
        refreshSearchableSelects() {
            this.initializeSearchableSelects();
        }

        initializeSortableTables() {
            const tables = document.querySelectorAll('table[data-sortable="true"]');
            tables.forEach(table => {
                new SortableTableManager(table);
            });
            this.log('debug', `Initialized ${tables.length} sortable tables`);
        }

        initializeAutoSaveForms() {
            const forms = document.querySelectorAll('form[data-autosave="true"]');
            forms.forEach(form => {
                // Implementazione base autosave
                const inputs = form.querySelectorAll('input, textarea, select');
                inputs.forEach(input => {
                    input.addEventListener('change', () => {
                        this.log('debug', 'Auto-saving form data');
                        // Qui si può implementare il salvataggio automatico
                    });
                });
            });
            this.log('debug', `Initialized ${forms.length} auto-save forms`);
        }

        initializeCharCounters() {
            const fields = document.querySelectorAll('[data-char-count]');
            fields.forEach(field => {
                const maxLength = field.getAttribute('data-char-count');
                const counter = document.createElement('small');
                counter.className = 'char-counter text-muted';
                field.parentNode.appendChild(counter);
                
                const updateCounter = () => {
                    const remaining = maxLength - field.value.length;
                    counter.textContent = `${remaining} caratteri rimanenti`;
                    counter.className = remaining < 0 ? 'char-counter text-danger' : 'char-counter text-muted';
                };
                
                field.addEventListener('input', updateCounter);
                updateCounter();
            });
            this.log('debug', `Initialized ${fields.length} character counters`);
        }

        async loadInitialData() {
            this.log('debug', 'Loading initial application data...');
            
            // Implementazione base - può essere estesa
            try {
                // Qui si possono caricare dati iniziali
                this.log('debug', 'Initial data loaded successfully');
            } catch (error) {
                this.log('error', 'Failed to load initial data:', error);
            }
        }

        emit(eventName, data) {
            const event = new CustomEvent(eventName, {
                detail: data,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
            this.log('debug', `Event emitted: ${eventName}`, data);
        }

        initializeLazyLoading() {
            const lazyElements = document.querySelectorAll('[data-lazy], img[loading="lazy"]');
            
            if (lazyElements.length === 0) {
                this.log('debug', 'No lazy loading elements found');
                return;
            }

            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const element = entry.target;
                            
                            if (element.dataset.lazy) {
                                // Lazy load generic elements
                                element.classList.add('lazy-loaded');
                            }
                            
                            observer.unobserve(element);
                        }
                    });
                });

                lazyElements.forEach(element => observer.observe(element));
                this.log('debug', `Initialized lazy loading for ${lazyElements.length} elements`);
            } else {
                // Fallback per browser senza IntersectionObserver
                lazyElements.forEach(element => {
                    if (element.dataset.lazy) {
                        element.classList.add('lazy-loaded');
                    }
                });
                this.log('debug', `Lazy loading fallback applied to ${lazyElements.length} elements`);
            }
        }

        async initializeCustomComponents() {
            this.log('debug', 'Initializing custom components...');
            
            try {
                // Inizializza componenti custom che potrebbero essere presenti
                const customComponents = document.querySelectorAll('[data-component]');
                
                for (const component of customComponents) {
                    const componentName = component.dataset.component;
                    this.log('debug', `Found custom component: ${componentName}`);
                    
                    // Qui si possono inizializzare componenti specifici
                    component.classList.add('component-initialized');
                }
                
                this.log('debug', `Initialized ${customComponents.length} custom components`);
            } catch (error) {
                this.log('error', 'Failed to initialize custom components:', error);
            }
        }
    }

    // ========================================
    // COMPONENT MANAGERS (SIMPLIFIED)
    // ========================================
    
    class SortableTableManager {
        constructor(table) {
            this.table = table;
        }
        
        sort(column) {
        }
        
        init() {
        }
    }

    // ========================================
    // APPLICATION INSTANCE
    // ========================================
    
    const app = new TalonApplication();
    
    // Export API
    window.TALON_APP = app;
    window.TALON_API = {
        // Info
        version: TALON_CONFIG.VERSION,
        ready: () => app.ready(),
        isReady: () => app.isReady()
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => app.init());
    } else {
        app.init();
    }

})(window, document);

