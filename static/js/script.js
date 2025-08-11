/**
 * ========================================
 * TALON MAIN APPLICATION SCRIPT
 * File: static/js/script.js
 * 
 * Versione: 2.1
 * Funzionalità: Inizializzazione applicazione,
 *               gestione globale, utility comuni,
 *               searchable select components
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE GLOBALE
    // ========================================
    
    const TALON_CONFIG = {
        APP_NAME: 'TALON',
        VERSION: '2.1',
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
            LOADER_DELAY: 500,
            SEARCH_DELAY: 200
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
            this.searchableSelects = new Map(); // Cache per searchable selects
            
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
                if (module.api && module.api()) {
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
            }, true);
            
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
            // Searchable selects - PRIORITARIO
            this.initializeSearchableSelects();
            
            // Tabelle ordinabili
            this.initializeSortableTables();
            
            // Form con auto-save
            this.initializeAutoSaveForms();
            
            // Contatori caratteri
            this.initializeCharCounters();
            
            // Lazy loading immagini
            this.initializeLazyLoading();
        }

        // ========================================
        // SEARCHABLE SELECT COMPONENTS
        // ========================================

        /**
         * Inizializza searchable selects custom
         */
        initializeSearchableSelects() {
            const searchableSelects = document.querySelectorAll('.searchable-select');
            
            searchableSelects.forEach(container => {
                const selectId = container.getAttribute('data-select-id');
                const selectElement = document.getElementById(selectId);
                
                if (!selectElement) {
                    console.error(`[${this.config.APP_NAME}] Select element with id "${selectId}" not found`);
                    return;
                }
                
                // Se già inizializzato, skip
                if (container.querySelector('.searchable-select-display')) {
                    return;
                }
                
                this.createSearchableSelect(container, selectElement);
            });
            
            console.log(`[${this.config.APP_NAME}] Inizializzati ${searchableSelects.length} searchable selects`);
        }

        /**
         * Crea un singolo searchable select
         */
        createSearchableSelect(container, selectElement) {
            const componentId = `searchable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Crea display element (già stilizzato in CSS)
            const display = document.createElement('div');
            display.className = 'searchable-select-display';
            display.textContent = this.getSelectedText(selectElement) || this.getPlaceholder(selectElement);
            display.setAttribute('data-component-id', componentId);
            
            // Crea dropdown (già stilizzato in CSS)
            const dropdown = document.createElement('div');
            dropdown.className = 'searchable-select-dropdown';
            dropdown.setAttribute('data-component-id', componentId);
            
            // Crea search input
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'searchable-select-search';
            searchInput.placeholder = 'Cerca...';
            searchInput.setAttribute('autocomplete', 'off');
            
            // Crea lista opzioni
            const optionsList = document.createElement('ul');
            optionsList.className = 'searchable-select-options';
            
            // Popola opzioni iniziali
            this.populateSearchableOptions(selectElement, optionsList);
            
            // Assembla componenti
            dropdown.appendChild(searchInput);
            dropdown.appendChild(optionsList);
            container.appendChild(display);
            container.appendChild(dropdown);
            
            // Setup eventi
            const state = { isOpen: false };
            this.setupSearchableSelectEvents(container, display, dropdown, searchInput, optionsList, selectElement, state);
            
            // Salva riferimento
            this.searchableSelects.set(componentId, {
                container, display, dropdown, searchInput, optionsList, selectElement, state
            });
        }

        /**
         * Popola le opzioni del searchable select
         */
        populateSearchableOptions(selectElement, optionsList, searchTerm = '') {
            optionsList.innerHTML = '';
            let hasVisibleOptions = false;
            const searchLower = searchTerm.toLowerCase();
            const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0);
            const processedGroups = new Set();
            
            for (let i = 0; i < selectElement.options.length; i++) {
                const option = selectElement.options[i];
                const parent = option.parentElement;
                
                // Skip placeholder options
                if (option.value === '' && option.disabled) continue;
                
                // Raccogli TUTTI i dati ricercabili dell'opzione
                const searchableData = {
                    text: option.text || '',
                    value: option.value || '',
                    details: option.getAttribute('data-details') || '',
                    // Aggiungi altri attributi data-* per ricerca estesa
                    indirizzo: option.getAttribute('data-indirizzo') || '',
                    citta: option.getAttribute('data-citta') || '',
                    provincia: option.getAttribute('data-provincia') || '',
                    cap: option.getAttribute('data-cap') || '',
                    codice: option.getAttribute('data-codice') || '',
                    teatro: option.getAttribute('data-teatro') || '',
                    nazione: option.getAttribute('data-nazione') || '',
                    tipo: option.getAttribute('data-tipo') || '',
                    // Attributi specifici per operazioni
                    nomeMissione: option.getAttribute('data-nome-missione') || '',
                    nomeBreve: option.getAttribute('data-nome-breve') || '',
                    teatroOperativo: option.getAttribute('data-teatro-operativo') || '',
                    // Per gruppi/categorie
                    categoria: parent.tagName === 'OPTGROUP' ? parent.label : ''
                };
                
                // Crea una stringa unica con tutti i dati ricercabili
                const searchableString = Object.values(searchableData)
                    .join(' ')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();
                
                // Verifica se TUTTI i termini di ricerca sono presenti
                let matches = true;
                if (searchWords.length > 0) {
                    matches = searchWords.every(word => searchableString.includes(word));
                }
                
                if (!matches) continue;
                
                // Se è in un optgroup
                if (parent.tagName === 'OPTGROUP') {
                    // Aggiungi label gruppo se non esiste
                    if (!processedGroups.has(parent.label)) {
                        const groupElement = document.createElement('li');
                        groupElement.className = 'group-label';
                        groupElement.textContent = parent.label;
                        groupElement.setAttribute('data-group', parent.label);
                        optionsList.appendChild(groupElement);
                        processedGroups.add(parent.label);
                    }
                }
                
                // Crea elemento opzione
                const li = document.createElement('li');
                li.className = parent.tagName === 'OPTGROUP' ? 'sub-option' : '';
                li.setAttribute('data-value', option.value);
                li.setAttribute('tabindex', '0');
                
                // Container per il contenuto
                const contentDiv = document.createElement('div');
                contentDiv.style.width = '100%';
                
                // Testo principale con evidenziazione multipla
                const textSpan = document.createElement('span');
                textSpan.className = 'option-main-text';
                textSpan.innerHTML = this.highlightMultipleTerms(option.text, searchWords);
                contentDiv.appendChild(textSpan);
                
                // Costruisci i dettagli in modo più ricco
                const detailsArray = [];
                
                // Aggiungi codice se presente
                if (searchableData.codice) {
                    detailsArray.push(`Cod: ${searchableData.codice}`);
                }
                
                // Aggiungi indirizzo completo se presente
                const addressParts = [];
                if (searchableData.indirizzo) addressParts.push(searchableData.indirizzo);
                if (searchableData.cap) addressParts.push(searchableData.cap);
                if (searchableData.citta) addressParts.push(searchableData.citta);
                if (searchableData.provincia) addressParts.push(`(${searchableData.provincia})`);
                if (searchableData.nazione && searchableData.nazione !== 'ITALIA') {
                    addressParts.push(`- ${searchableData.nazione}`);
                }
                
                if (addressParts.length > 0) {
                    detailsArray.push(addressParts.join(' '));
                }
                
                // Per operazioni
                if (searchableData.nomeBreve) {
                    detailsArray.push(`[${searchableData.nomeBreve}]`);
                }
                if (searchableData.teatroOperativo) {
                    detailsArray.push(`Teatro: ${searchableData.teatroOperativo}`);
                }
                
                // Aggiungi dettagli standard se presenti e non già inclusi
                if (searchableData.details && !detailsArray.some(d => d.includes(searchableData.details))) {
                    detailsArray.push(searchableData.details);
                }
                
                // Mostra i dettagli se presenti
                if (detailsArray.length > 0) {
                    const detailsSpan = document.createElement('span');
                    detailsSpan.className = 'option-details';
                    detailsSpan.innerHTML = this.highlightMultipleTerms(
                        detailsArray.join(' • '), 
                        searchWords
                    );
                    contentDiv.appendChild(detailsSpan);
                }
                
                // Se la ricerca ha match specifici, mostra dove
                if (searchTerm && searchWords.length > 0) {
                    const matchedFields = [];
                    Object.entries(searchableData).forEach(([field, value]) => {
                        if (value && field !== 'text' && field !== 'details') {
                            const valueLower = value.toLowerCase();
                            if (searchWords.some(word => valueLower.includes(word))) {
                                matchedFields.push(this.getFieldLabel(field));
                            }
                        }
                    });
                    
                    if (matchedFields.length > 0) {
                        const matchSpan = document.createElement('span');
                        matchSpan.className = 'option-match-info';
                        matchSpan.style.cssText = 'font-size: 0.75em; color: #28a745; font-style: italic;';
                        matchSpan.textContent = `✓ Match in: ${matchedFields.join(', ')}`;
                        contentDiv.appendChild(matchSpan);
                    }
                }
                
                li.appendChild(contentDiv);
                optionsList.appendChild(li);
                hasVisibleOptions = true;
            }
            
            // Se nessun risultato
            if (!hasVisibleOptions) {
                const noResults = document.createElement('li');
                noResults.className = 'no-results';
                noResults.style.cssText = 'text-align: center; padding: 15px; color: #999; font-style: italic;';
                
                if (searchTerm) {
                    noResults.innerHTML = `
                        <div>Nessun risultato per "<strong>${searchTerm}</strong>"</div>
                        <div style="font-size: 0.85em; margin-top: 5px;">
                            Prova a cercare per: nome, codice, indirizzo, città, provincia, CAP, teatro operativo...
                        </div>
                    `;
                } else {
                    noResults.textContent = 'Nessuna opzione disponibile';
                }
                
                optionsList.appendChild(noResults);
            }
        },

        /**
         * AGGIUNGERE questa nuova funzione dopo populateSearchableOptions
         * 
         * Evidenzia più termini di ricerca contemporaneamente
         */
        highlightMultipleTerms(text, searchTerms) {
            if (!searchTerms || searchTerms.length === 0) return text;
            
            let highlightedText = text;
            
            // Ordina i termini dal più lungo al più corto per evitare sovrapposizioni
            const sortedTerms = [...searchTerms].sort((a, b) => b.length - a.length);
            
            sortedTerms.forEach(term => {
                if (term) {
                    const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
                    highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
                }
            });
            
            return highlightedText;
        },

        /**
         * AGGIUNGERE questa nuova funzione helper
         * 
         * Converte il nome del campo in etichetta leggibile
         */
        getFieldLabel(field) {
            const labels = {
                'indirizzo': 'Indirizzo',
                'citta': 'Città',
                'provincia': 'Provincia',
                'cap': 'CAP',
                'codice': 'Codice',
                'teatro': 'Teatro',
                'nazione': 'Nazione',
                'tipo': 'Tipo',
                'nomeMissione': 'Missione',
                'nomeBreve': 'Sigla',
                'teatroOperativo': 'Teatro Op.',
                'categoria': 'Categoria'
            };
            return labels[field] || field;
        }

        /**
         * Setup eventi per searchable select
         */
        setupSearchableSelectEvents(container, display, dropdown, searchInput, optionsList, selectElement, state) {
            // Toggle dropdown
            display.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.isOpen) {
                    this.closeSearchableDropdown(display, dropdown, state);
                } else {
                    // Chiudi altri dropdown aperti
                    this.closeAllSearchableDropdowns();
                    this.openSearchableDropdown(display, dropdown, searchInput, state);
                }
            });
            
            // Ricerca con debounce
            const searchHandler = this.debounce((e) => {
                this.populateSearchableOptions(selectElement, optionsList, e.target.value);
            }, this.config.UI.SEARCH_DELAY);
            
            searchInput.addEventListener('input', searchHandler);
            
            // Previeni chiusura su click nel search
            searchInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            // Navigazione tastiera nel search input
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const firstOption = optionsList.querySelector('li:not(.group-label):not(.no-results)');
                    if (firstOption) firstOption.focus();
                } else if (e.key === 'Escape') {
                    this.closeSearchableDropdown(display, dropdown, state);
                }
            });
            
            // Selezione opzione
            optionsList.addEventListener('click', (e) => {
                e.stopPropagation();
                const li = e.target.closest('li');
                
                if (li && !li.classList.contains('group-label') && !li.classList.contains('no-results')) {
                    const value = li.getAttribute('data-value');
                    selectElement.value = value;
                    display.textContent = this.getSelectedText(selectElement);
                    
                    // Trigger change event
                    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Chiudi dropdown
                    this.closeSearchableDropdown(display, dropdown, state);
                    
                    // Reset ricerca
                    searchInput.value = '';
                    this.populateSearchableOptions(selectElement, optionsList);
                }
            });
            
            // Navigazione tastiera nelle opzioni
            optionsList.addEventListener('keydown', (e) => {
                const current = e.target;
                if (!current.matches('li')) return;
                
                let next;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    next = current.nextElementSibling;
                    while (next && (next.classList.contains('group-label') || next.classList.contains('no-results'))) {
                        next = next.nextElementSibling;
                    }
                    if (next) next.focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    next = current.previousElementSibling;
                    while (next && (next.classList.contains('group-label') || next.classList.contains('no-results'))) {
                        next = next.previousElementSibling;
                    }
                    if (next) {
                        next.focus();
                    } else {
                        searchInput.focus();
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    current.click();
                } else if (e.key === 'Escape') {
                    this.closeSearchableDropdown(display, dropdown, state);
                }
            });
            
            // Chiudi dropdown cliccando fuori - ottimizzato con event delegation
            const closeHandler = (e) => {
                if (!container.contains(e.target) && state.isOpen) {
                    this.closeSearchableDropdown(display, dropdown, state);
                    searchInput.value = '';
                    this.populateSearchableOptions(selectElement, optionsList);
                }
            };
            
            // Usa capture per catturare l'evento prima
            document.addEventListener('click', closeHandler, true);
            
            // Aggiorna display se il select cambia programmaticamente
            selectElement.addEventListener('change', () => {
                display.textContent = this.getSelectedText(selectElement) || this.getPlaceholder(selectElement);
            });
            
            // Cleanup su rimozione elemento
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.removedNodes.forEach((node) => {
                        if (node === container || container.contains(node)) {
                            document.removeEventListener('click', closeHandler, true);
                            observer.disconnect();
                        }
                    });
                });
            });
            
            observer.observe(container.parentNode, { childList: true });
        }

        /**
         * Apre dropdown searchable
         */
        openSearchableDropdown(display, dropdown, searchInput, state) {
            display.classList.add('open');
            dropdown.classList.add('open');
            state.isOpen = true;
            setTimeout(() => {
                searchInput.focus();
                searchInput.select();
            }, 100);
        }

        /**
         * Chiude dropdown searchable
         */
        closeSearchableDropdown(display, dropdown, state) {
            display.classList.remove('open');
            dropdown.classList.remove('open');
            state.isOpen = false;
        }

        /**
         * Chiude tutti i dropdown searchable aperti
         */
        closeAllSearchableDropdowns() {
            document.querySelectorAll('.searchable-select-dropdown.open').forEach(d => {
                d.classList.remove('open');
            });
            document.querySelectorAll('.searchable-select-display.open').forEach(d => {
                d.classList.remove('open');
            });
            
            // Aggiorna stati nella cache
            this.searchableSelects.forEach(component => {
                component.state.isOpen = false;
            });
        }

        /**
         * Ottiene testo opzione selezionata
         */
        getSelectedText(selectElement) {
            const selectedOption = selectElement.options[selectElement.selectedIndex];
            return selectedOption ? selectedOption.text : '';
        }

        /**
         * Ottiene placeholder del select
         */
        getPlaceholder(selectElement) {
            const firstOption = selectElement.options[0];
            if (firstOption && firstOption.value === '') {
                return firstOption.text;
            }
            return '-- Seleziona --';
        }

        /**
         * Evidenzia termine di ricerca
         */
        highlightSearchTerm(text, searchTerm) {
            if (!searchTerm) return text;
            
            const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
            return text.replace(regex, '<strong>$1</strong>');
        }

        /**
         * Escape caratteri speciali regex
         */
        escapeRegex(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // ========================================
        // ALTRI COMPONENTI UI
        // ========================================

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
                
                // Prova a parsare come numeri
                const aNum = parseFloat(aValue);
                const bNum = parseFloat(bValue);
                
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return newOrder === 'asc' ? aNum - bNum : bNum - aNum;
                }
                
                // Altrimenti ordina come stringhe
                if (newOrder === 'asc') {
                    return aValue.localeCompare(bValue, 'it', { numeric: true });
                } else {
                    return bValue.localeCompare(aValue, 'it', { numeric: true });
                }
            });
            
            // Riordina righe con fragment per performance
            const fragment = document.createDocumentFragment();
            rows.forEach(row => fragment.appendChild(row));
            tbody.appendChild(fragment);
            
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
                
                const saveHandler = () => {
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        this.autoSaveForm(form, formId);
                    }, 2000);
                };
                
                form.addEventListener('input', saveHandler);
                form.addEventListener('change', saveHandler);
                
                // Recupera dati salvati
                this.restoreFormData(form, formId);
                
                // Pulisci al submit
                form.addEventListener('submit', () => {
                    localStorage.removeItem(`talon-form-${formId}`);
                });
            });
        }

        /**
         * Auto-salva form
         */
        autoSaveForm(form, formId) {
            const formData = new FormData(form);
            const data = {};
            
            formData.forEach((value, key) => {
                if (data[key]) {
                    // Se già esiste, crea array
                    if (!Array.isArray(data[key])) {
                        data[key] = [data[key]];
                    }
                    data[key].push(value);
                } else {
                    data[key] = value;
                }
            });
            
            try {
                localStorage.setItem(`talon-form-${formId}`, JSON.stringify(data));
                this.showInfo('Bozza salvata automaticamente', 1000);
            } catch (e) {
                console.error('Errore salvataggio bozza:', e);
            }
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
                        if (field instanceof RadioNodeList) {
                            // Radio buttons o checkboxes multipli
                            if (Array.isArray(value)) {
                                value.forEach(v => {
                                    const input = form.querySelector(`[name="${key}"][value="${v}"]`);
                                    if (input) input.checked = true;
                                });
                            } else {
                                const input = form.querySelector(`[name="${key}"][value="${value}"]`);
                                if (input) input.checked = true;
                            }
                        } else if (field.type === 'checkbox') {
                            field.checked = value === 'on' || value === true;
                        } else {
                            field.value = value;
                        }
                    }
                });
                
                this.showInfo('Bozza precedente ripristinata');
            } catch (error) {
                console.error('Errore ripristino form:', error);
                localStorage.removeItem(`talon-form-${formId}`);
            }
        }

        /**
         * Inizializza contatori caratteri
         */
        initializeCharCounters() {
            document.querySelectorAll('[data-char-counter]').forEach(field => {
                const maxLength = field.getAttribute('maxlength');
                if (!maxLength) return;
                
                // Evita duplicati
                if (field.parentNode.querySelector('.char-counter')) return;
                
                const counter = document.createElement('div');
                counter.className = 'char-counter text-muted small';
                counter.style.textAlign = 'right';
                counter.style.marginTop = '2px';
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
                field.addEventListener('change', updateCounter);
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
                            if (img.dataset.src) {
                                img.src = img.dataset.src;
                                img.classList.add('loaded');
                                delete img.dataset.src;
                                imageObserver.unobserve(img);
                            }
                        }
                    });
                }, {
                    rootMargin: '50px 0px',
                    threshold: 0.01
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
            
            if (!page) return;
            
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
                const toast = document.createElement('div');
                toast.className = `toast-notification toast-${type}`;
                toast.textContent = message;
                toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 24px;
                    background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
                    color: white;
                    border-radius: 4px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
                `;
                
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.animation = 'fadeOut 0.3s ease';
                    setTimeout(() => toast.remove(), 300);
                }, duration);
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
         * Debounce function ottimizzata
         */
        debounce(func, wait = this.config.UI.DEBOUNCE_DELAY) {
            let timeout;
            let lastCallTime = 0;
            
            return function executedFunction(...args) {
                const now = Date.now();
                const timeSinceLastCall = now - lastCallTime;
                
                const later = () => {
                    lastCallTime = Date.now();
                    func.apply(this, args);
                };
                
                clearTimeout(timeout);
                
                if (timeSinceLastCall >= wait) {
                    later();
                } else {
                    timeout = setTimeout(later, wait - timeSinceLastCall);
                }
            };
        }

        /**
         * Throttle function ottimizzata
         */
        throttle(func, limit = this.config.UI.DEBOUNCE_DELAY) {
            let inThrottle;
            let lastFunc;
            let lastRan;
            
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    lastRan = Date.now();
                    inThrottle = true;
                } else {
                    clearTimeout(lastFunc);
                    lastFunc = setTimeout(() => {
                        if ((Date.now() - lastRan) >= limit) {
                            func.apply(this, args);
                            lastRan = Date.now();
                        }
                    }, Math.max(limit - (Date.now() - lastRan), 0));
                }
            };
        }

        // ========================================
        // SHORTCUTS METODI
        // ========================================

        saveCurrentForm() {
            const form = document.querySelector('form:not([data-no-shortcut])');
            if (form) {
                const submitBtn = form.querySelector('[type="submit"]');
                if (submitBtn) {
                    submitBtn.click();
                } else {
                    form.dispatchEvent(new Event('submit', { cancelable: true }));
                }
            }
        }

        focusSearch() {
            const search = document.querySelector('input[type="search"], .search-input, .searchable-select-search');
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
            
            // Searchable dropdowns
            this.closeAllSearchableDropdowns();
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

        /**
         * Refresh searchable selects (utile per contenuti dinamici)
         */
        refreshSearchableSelects() {
            this.initializeSearchableSelects();
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
        showSuccess: (msg, duration) => app.showSuccess(msg, duration),
        showError: (msg, duration) => app.showError(msg, duration),
        showInfo: (msg, duration) => app.showInfo(msg, duration),
        
        // Eventi
        on: (event, handler) => app.on(event, handler),
        off: (event, handler) => app.off(event, handler),
        emit: (event, data) => app.emit(event, data),
        
        // Utility
        debounce: (fn, wait) => app.debounce(fn, wait),
        throttle: (fn, limit) => app.throttle(fn, limit),
        
        // Components
        refreshSearchableSelects: () => app.refreshSearchableSelects(),
        
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
        // DOM già pronto
        app.init();
    }

    console.log('[TALON] Script principale caricato. API disponibile in window.TALON_API');

})(window, document);