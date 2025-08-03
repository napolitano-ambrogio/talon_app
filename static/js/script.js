/**
 * ========================================
 * TALON MAIN APPLICATION SCRIPT
 * File: static/js/script.js
 * 
 * Versione: 1.0
 * Funzionalità: Inizializzazione applicazione,
 *               gestione globale, utility comuni
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE GLOBALE
    // ========================================
    
    const TALON_CONFIG = {
        APP_NAME: 'TALON',
        VERSION: '2.0',
        DEBUG_MODE: localStorage.getItem('talonDebugMode') === 'true',
        
        // Endpoints API
        API_ENDPOINTS: {
            AUTH: '/auth',
            ENTI_CIVILI: '/api/enti_civili',
            ENTI_MILITARI: '/api/enti_militari',
            OPERAZIONI: '/api/operazioni',
            ATTIVITA: '/api/attivita',
            USERS: '/api/users',
            SYSTEM: '/api/system'
        },
        
        // Configurazione UI
        UI: {
            ANIMATION_DURATION: 300,
            TOAST_DURATION: 4000,
            DEBOUNCE_DELAY: 300,
            LOADER_DELAY: 500
        },
        
        // Ruoli e permessi
        ROLES: {
            ADMIN: { level: 100, label: 'Amministratore' },
            OPERATORE: { level: 50, label: 'Operatore' },
            VISUALIZZATORE: { level: 10, label: 'Visualizzatore' },
            GUEST: { level: 0, label: 'Ospite' }
        }
    };

    // ========================================
    // CLASSE PRINCIPALE TALON
    // ========================================
    
    class TalonApp {
        constructor() {
            this.config = TALON_CONFIG;
            this.modules = {};
            this.initialized = false;
            this.currentUser = null;
            this.currentRole = null;
            
            // Bind globale per console
            if (this.config.DEBUG_MODE) {
                window.TALON = this;
            }
        }

        /**
         * Inizializza l'applicazione
         */
        async init() {
            console.log(`[${this.config.APP_NAME}] Inizializzazione applicazione v${this.config.VERSION}...`);
            
            try {
                // 1. Setup ambiente
                this.setupEnvironment();
                
                // 2. Rileva informazioni utente
                await this.detectUserInfo();
                
                // 3. Inizializza moduli core
                await this.initializeModules();
                
                // 4. Setup handler globali
                this.setupGlobalHandlers();
                
                // 5. Inizializza componenti UI
                this.initializeUIComponents();
                
                // 6. Carica dati iniziali se necessario
                await this.loadInitialData();
                
                this.initialized = true;
                console.log(`[${this.config.APP_NAME}] ✅ Applicazione inizializzata`);
                
                // Emetti evento ready
                this.emit('talon:ready', {
                    version: this.config.VERSION,
                    user: this.currentUser,
                    role: this.currentRole
                });
                
            } catch (error) {
                console.error(`[${this.config.APP_NAME}] ❌ Errore inizializzazione:`, error);
                this.showError('Errore durante l\'inizializzazione dell\'applicazione');
            }
        }

        /**
         * Setup ambiente applicazione
         */
        setupEnvironment() {
            // Aggiungi meta tag viewport se mancante
            if (!document.querySelector('meta[name="viewport"]')) {
                const viewport = document.createElement('meta');
                viewport.name = 'viewport';
                viewport.content = 'width=device-width, initial-scale=1.0';
                document.head.appendChild(viewport);
            }
            
            // Setup CSRF token per richieste AJAX
            this.setupCSRFToken();
            
            // Abilita/disabilita debug mode
            if (this.config.DEBUG_MODE) {
                console.log(`[${this.config.APP_NAME}] 🐛 Debug mode attivo`);
                document.body.classList.add('debug-mode');
            }
        }

        /**
         * Setup CSRF token per jQuery/AJAX
         */
        setupCSRFToken() {
            const token = document.querySelector('meta[name="csrf-token"]');
            if (token) {
                // Per jQuery
                if (window.$ && window.$.ajaxSetup) {
                    $.ajaxSetup({
                        headers: {
                            'X-CSRF-TOKEN': token.content
                        }
                    });
                }
                
                // Per fetch
                window.fetchWithCSRF = (url, options = {}) => {
                    options.headers = {
                        ...options.headers,
                        'X-CSRF-TOKEN': token.content
                    };
                    return fetch(url, options);
                };
            }
        }

        /**
         * Rileva informazioni utente
         */
        async detectUserInfo() {
            // Priorità: Flask global > Meta > Body > Session
            this.currentRole = 
                window.FLASK_USER_ROLE ||
                document.querySelector('meta[name="user-role"]')?.content ||
                document.body.getAttribute('data-user-role') ||
                sessionStorage.getItem('userRole') ||
                'GUEST';
            
            this.currentUser = 
                window.FLASK_USER_NAME ||
                document.querySelector('meta[name="user-name"]')?.content ||
                document.getElementById('user-name')?.textContent ||
                'Utente';
            
            console.log(`[${this.config.APP_NAME}] Utente: ${this.currentUser} (${this.currentRole})`);
            
            // Propaga informazioni
            document.body.setAttribute('data-user-role', this.currentRole);
            document.body.setAttribute('data-user-name', this.currentUser);
        }

        /**
         * Inizializza moduli
         */
        async initializeModules() {
            console.log(`[${this.config.APP_NAME}] Caricamento moduli...`);
            
            // Attendi che i moduli siano pronti
            const moduleChecks = [
                { name: 'sidebar', check: () => window.talonSidebar, api: () => window.sidebarAPI },
                { name: 'roleManager', check: () => window.roleManager, api: () => window.RoleManagerAPI }
            ];
            
            for (let module of moduleChecks) {
                await this.waitForModule(module.name, module.check);
                if (module.api()) {
                    this.modules[module.name] = module.api();
                    console.log(`[${this.config.APP_NAME}] ✓ Modulo ${module.name} caricato`);
                }
            }
        }

        /**
         * Attende che un modulo sia disponibile
         */
        async waitForModule(name, checkFn, maxWait = 5000) {
            const startTime = Date.now();
            
            while (!checkFn()) {
                if (Date.now() - startTime > maxWait) {
                    console.warn(`[${this.config.APP_NAME}] ⚠️ Timeout attesa modulo ${name}`);
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            return true;
        }

        /**
         * Setup handler globali
         */
        setupGlobalHandlers() {
            // Gestione errori globali
            window.addEventListener('error', (e) => {
                if (this.config.DEBUG_MODE) {
                    console.error('Errore globale:', e);
                }
            });
            
            // Gestione navigazione
            this.setupNavigationHandlers();
            
            // Gestione form
            this.setupFormHandlers();
            
            // Gestione shortcuts
            this.setupKeyboardShortcuts();
            
            // Auto-logout su inattività
            this.setupInactivityTimer();
        }

        /**
         * Setup handler navigazione
         */
        setupNavigationHandlers() {
            // Intercetta link con data-confirm
            document.addEventListener('click', (e) => {
                const link = e.target.closest('a[data-confirm]');
                if (link) {
                    e.preventDefault();
                    const message = link.getAttribute('data-confirm');
                    if (confirm(message)) {
                        window.location.href = link.href;
                    }
                }
            });
            
            // Gestione back button
            window.addEventListener('popstate', (e) => {
                this.emit('talon:navigation', { state: e.state });
            });
        }

        /**
         * Setup handler form
         */
        setupFormHandlers() {
            // Auto-uppercase per campi testo
            document.addEventListener('input', (e) => {
                if (e.target.matches('input[data-uppercase], textarea[data-uppercase]')) {
                    e.target.value = e.target.value.toUpperCase();
                }
            });
            
            // Validazione real-time
            document.addEventListener('blur', (e) => {
                if (e.target.matches('input[required], textarea[required], select[required]')) {
                    this.validateField(e.target);
                }
            });
            
            // Conferma per form pericolosi
            document.addEventListener('submit', (e) => {
                const form = e.target;
                if (form.matches('[data-confirm-submit]')) {
                    const message = form.getAttribute('data-confirm-submit') || 'Confermare l\'operazione?';
                    if (!confirm(message)) {
                        e.preventDefault();
                    }
                }
            });
        }

        /**
         * Valida campo form
         */
        validateField(field) {
            const isValid = field.checkValidity();
            
            if (!isValid) {
                field.classList.add('is-invalid');
                field.classList.remove('is-valid');
            } else {
                field.classList.add('is-valid');
                field.classList.remove('is-invalid');
            }
            
            return isValid;
        }

        /**
         * Setup keyboard shortcuts
         */
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
                'ctrl+shift+h': (e) => {
                    e.preventDefault();
                    this.navigateHome();
                },
                'escape': (e) => {
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

        /**
         * Ottiene chiave shortcut da evento
         */
        getShortcutKey(e) {
            const keys = [];
            if (e.ctrlKey) keys.push('ctrl');
            if (e.shiftKey) keys.push('shift');
            if (e.altKey) keys.push('alt');
            if (e.key && e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt') {
                keys.push(e.key.toLowerCase());
            }
            return keys.join('+');
        }

        /**
         * Setup timer inattività
         */
        setupInactivityTimer() {
            let inactivityTimer;
            const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minuti
            
            const resetTimer = () => {
                clearTimeout(inactivityTimer);
                inactivityTimer = setTimeout(() => {
                    this.handleInactivity();
                }, INACTIVITY_TIMEOUT);
            };
            
            // Eventi che resettano il timer
            ['mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
                document.addEventListener(event, resetTimer, true);
            });
            
            resetTimer();
        }

        /**
         * Gestisce inattività utente
         */
        handleInactivity() {
            if (confirm('Sessione inattiva. Vuoi continuare?')) {
                // Refresh sessione
                this.refreshSession();
            } else {
                // Logout
                window.location.href = '/auth/logout';
            }
        }

        /**
         * Refresh sessione
         */
        async refreshSession() {
            try {
                const response = await fetch('/auth/refresh', {
                    method: 'POST',
                    credentials: 'same-origin'
                });
                
                if (!response.ok) {
                    throw new Error('Refresh fallito');
                }
                
                this.showSuccess('Sessione aggiornata');
            } catch (error) {
                this.showError('Errore aggiornamento sessione');
                console.error(error);
            }
        }

        /**
         * Inizializza componenti UI
         */
        initializeUIComponents() {
            // Inizializza tooltip Bootstrap se disponibile
            if (window.$ && $.fn.tooltip) {
                $('[data-toggle="tooltip"]').tooltip();
            }
            
            // Inizializza select2 se disponibile
            if (window.$ && $.fn.select2) {
                $('.select2').select2();
            }
            
            // Inizializza date picker se disponibile
            if (window.$ && $.fn.datepicker) {
                $('.datepicker').datepicker({
                    format: 'dd/mm/yyyy',
                    language: 'it',
                    autoclose: true
                });
            }
            
            // Inizializza componenti custom
            this.initializeCustomComponents();
        }

        /**
         * Inizializza componenti custom
         */
        initializeCustomComponents() {
            // Tabelle ordinabili
            this.initializeSortableTables();
            
            // Form con auto-save
            this.initializeAutoSaveForms();
            
            // Contatori caratteri
            this.initializeCharCounters();
            
            // Lazy loading immagini
            this.initializeLazyLoading();
        }

        /**
         * Inizializza tabelle ordinabili
         */
        initializeSortableTables() {
            document.querySelectorAll('table.sortable').forEach(table => {
                const headers = table.querySelectorAll('th[data-sortable]');
                
                headers.forEach(header => {
                    header.style.cursor = 'pointer';
                    header.addEventListener('click', () => {
                        this.sortTable(table, header);
                    });
                });
            });
        }

        /**
         * Ordina tabella
         */
        sortTable(table, header) {
            const column = header.cellIndex;
            const order = header.getAttribute('data-order') || 'asc';
            const newOrder = order === 'asc' ? 'desc' : 'asc';
            
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            rows.sort((a, b) => {
                const aValue = a.cells[column].textContent.trim();
                const bValue = b.cells[column].textContent.trim();
                
                if (newOrder === 'asc') {
                    return aValue.localeCompare(bValue, 'it', { numeric: true });
                } else {
                    return bValue.localeCompare(aValue, 'it', { numeric: true });
                }
            });
            
            // Riordina righe
            rows.forEach(row => tbody.appendChild(row));
            
            // Aggiorna header
            table.querySelectorAll('th[data-sortable]').forEach(th => {
                th.removeAttribute('data-order');
                th.classList.remove('sorted-asc', 'sorted-desc');
            });
            
            header.setAttribute('data-order', newOrder);
            header.classList.add(`sorted-${newOrder}`);
        }

        /**
         * Inizializza form con auto-save
         */
        initializeAutoSaveForms() {
            document.querySelectorAll('form[data-autosave]').forEach(form => {
                const formId = form.id || `form-${Date.now()}`;
                let saveTimeout;
                
                form.addEventListener('input', () => {
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        this.autoSaveForm(form, formId);
                    }, 2000);
                });
                
                // Recupera dati salvati
                this.restoreFormData(form, formId);
            });
        }

        /**
         * Auto-salva form
         */
        autoSaveForm(form, formId) {
            const formData = new FormData(form);
            const data = {};
            
            formData.forEach((value, key) => {
                data[key] = value;
            });
            
            localStorage.setItem(`talon-form-${formId}`, JSON.stringify(data));
            this.showInfo('Bozza salvata automaticamente', 1000);
        }

        /**
         * Ripristina dati form
         */
        restoreFormData(form, formId) {
            const savedData = localStorage.getItem(`talon-form-${formId}`);
            if (!savedData) return;
            
            try {
                const data = JSON.parse(savedData);
                Object.entries(data).forEach(([key, value]) => {
                    const field = form.elements[key];
                    if (field) {
                        field.value = value;
                    }
                });
                
                this.showInfo('Bozza precedente ripristinata');
            } catch (error) {
                console.error('Errore ripristino form:', error);
            }
        }

        /**
         * Inizializza contatori caratteri
         */
        initializeCharCounters() {
            document.querySelectorAll('[data-char-counter]').forEach(field => {
                const maxLength = field.getAttribute('maxlength');
                if (!maxLength) return;
                
                const counter = document.createElement('div');
                counter.className = 'char-counter text-muted small';
                counter.style.textAlign = 'right';
                field.parentNode.appendChild(counter);
                
                const updateCounter = () => {
                    const current = field.value.length;
                    counter.textContent = `${current}/${maxLength}`;
                    
                    if (current > maxLength * 0.9) {
                        counter.classList.add('text-danger');
                        counter.classList.remove('text-muted');
                    } else {
                        counter.classList.remove('text-danger');
                        counter.classList.add('text-muted');
                    }
                };
                
                field.addEventListener('input', updateCounter);
                updateCounter();
            });
        }

        /**
         * Inizializza lazy loading
         */
        initializeLazyLoading() {
            if ('IntersectionObserver' in window) {
                const imageObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            img.src = img.dataset.src;
                            img.classList.add('loaded');
                            imageObserver.unobserve(img);
                        }
                    });
                });
                
                document.querySelectorAll('img[data-src]').forEach(img => {
                    imageObserver.observe(img);
                });
            }
        }

        /**
         * Carica dati iniziali
         */
        async loadInitialData() {
            // Carica dati solo se necessario per la pagina corrente
            const page = document.body.getAttribute('data-page');
            
            switch (page) {
                case 'dashboard':
                    await this.loadDashboardData();
                    break;
                case 'enti-civili':
                    await this.loadEntiCiviliData();
                    break;
                // ... altri casi
            }
        }

        /**
         * Carica dati dashboard
         */
        async loadDashboardData() {
            // Implementazione specifica per dashboard
            console.log(`[${this.config.APP_NAME}] Caricamento dati dashboard...`);
        }

        /**
         * Carica dati enti civili
         */
        async loadEntiCiviliData() {
            // Implementazione specifica per enti civili
            console.log(`[${this.config.APP_NAME}] Caricamento dati enti civili...`);
        }

        // ========================================
        // METODI UTILITY
        // ========================================

        /**
         * Mostra messaggio di successo
         */
        showSuccess(message, duration = this.config.UI.TOAST_DURATION) {
            this.showToast(message, 'success', duration);
        }

        /**
         * Mostra messaggio di errore
         */
        showError(message, duration = this.config.UI.TOAST_DURATION) {
            this.showToast(message, 'error', duration);
        }

        /**
         * Mostra messaggio informativo
         */
        showInfo(message, duration = this.config.UI.TOAST_DURATION) {
            this.showToast(message, 'info', duration);
        }

        /**
         * Mostra toast notification
         */
        showToast(message, type = 'info', duration = this.config.UI.TOAST_DURATION) {
            // Usa sidebar API se disponibile
            if (this.modules.sidebar && this.modules.sidebar.showToast) {
                this.modules.sidebar.showToast(message, type);
            } else {
                // Fallback semplice
                console.log(`[${type.toUpperCase()}] ${message}`);
            }
        }

        /**
         * Emette evento custom
         */
        emit(eventName, detail = {}) {
            const event = new CustomEvent(eventName, {
                detail: detail,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
            
            if (this.config.DEBUG_MODE) {
                console.log(`[${this.config.APP_NAME}] Event emitted:`, eventName, detail);
            }
        }

        /**
         * Ascolta evento custom
         */
        on(eventName, handler) {
            document.addEventListener(eventName, handler);
        }

        /**
         * Rimuove listener evento
         */
        off(eventName, handler) {
            document.removeEventListener(eventName, handler);
        }

        /**
         * Debounce function
         */
        debounce(func, wait = this.config.UI.DEBOUNCE_DELAY) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        /**
         * Throttle function
         */
        throttle(func, limit = this.config.UI.DEBOUNCE_DELAY) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        }

        // ========================================
        // SHORTCUTS METODI
        // ========================================

        saveCurrentForm() {
            const form = document.querySelector('form:not([data-no-shortcut])');
            if (form) {
                form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        }

        focusSearch() {
            const search = document.querySelector('input[type="search"], .search-input');
            if (search) {
                search.focus();
                search.select();
            }
        }

        navigateHome() {
            window.location.href = '/';
        }

        closeAllModals() {
            // Bootstrap modals
            if (window.$ && $.fn.modal) {
                $('.modal').modal('hide');
            }
            
            // Custom modals
            document.querySelectorAll('.modal, [data-modal]').forEach(modal => {
                modal.style.display = 'none';
            });
        }

        // ========================================
        // API PUBBLICA
        // ========================================

        /**
         * Ottiene configurazione
         */
        getConfig() {
            return { ...this.config };
        }

        /**
         * Ottiene moduli caricati
         */
        getModules() {
            return { ...this.modules };
        }

        /**
         * Ottiene info utente corrente
         */
        getCurrentUser() {
            return {
                name: this.currentUser,
                role: this.currentRole,
                roleLevel: this.config.ROLES[this.currentRole]?.level || 0
            };
        }

        /**
         * Verifica se app è inizializzata
         */
        isReady() {
            return this.initialized;
        }

        /**
         * Attende che app sia pronta
         */
        async ready() {
            if (this.initialized) return true;
            
            return new Promise((resolve) => {
                this.on('talon:ready', () => resolve(true));
            });
        }
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================

    // Crea istanza applicazione
    const app = new TalonApp();

    // Esponi API globale
    window.TalonApp = app;

    // API pubblica semplificata
    window.TALON_API = {
        // Info
        version: TALON_CONFIG.VERSION,
        ready: () => app.ready(),
        isReady: () => app.isReady(),
        
        // User
        getUser: () => app.getCurrentUser(),
        
        // UI
        showSuccess: (msg) => app.showSuccess(msg),
        showError: (msg) => app.showError(msg),
        showInfo: (msg) => app.showInfo(msg),
        
        // Eventi
        on: (event, handler) => app.on(event, handler),
        off: (event, handler) => app.off(event, handler),
        emit: (event, data) => app.emit(event, data),
        
        // Utility
        debounce: (fn, wait) => app.debounce(fn, wait),
        throttle: (fn, limit) => app.throttle(fn, limit),
        
        // Debug
        debug: {
            getConfig: () => app.getConfig(),
            getModules: () => app.getModules(),
            enable: () => {
                localStorage.setItem('talonDebugMode', 'true');
                location.reload();
            },
            disable: () => {
                localStorage.removeItem('talonDebugMode');
                location.reload();
            }
        }
    };

    // Inizializza quando DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => app.init());
    } else {
        app.init();
    }

    console.log('[TALON] Script principale caricato. API disponibile in window.TALON_API');

})(window, document);