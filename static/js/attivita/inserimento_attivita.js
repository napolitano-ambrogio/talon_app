/**
 * ========================================
 * TALON - INSERIMENTO ATTIVITÀ (SPA VERSION)
 * File: static/js/inserimento_attivita.js
 * 
 * Versione: 2.0.0 - Ottimizzata per SPA
 * Logica specifica per il form di
 * inserimento nuova attività con supporto SPA
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Namespace globale
    window.TalonInserimentoAttivita = window.TalonInserimentoAttivita || {};

    // ========================================
    // STATO E CONFIGURAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        form: null,
        eventHandlers: new Map(),
        autoSaveTimeout: null,
        notificationTimeout: null,
        loader: null
    };

    const config = {
        AUTOSAVE_KEY: 'talon_inserimento_attivita_draft',
        AUTOSAVE_DELAY: 2000,
        NOTIFICATION_DURATION: 3000,
        DEBUG: false
    };

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        log('[InserimentoAttivita] Inizializzazione form inserimento (SPA)...');

        // Cleanup precedente se necessario
        if (state.initialized) {
            cleanup();
        }

        // Verifica se siamo nella pagina corretta
        if (!isInserimentoPage()) {
            log('[InserimentoAttivita] Non nella pagina inserimento, skip init');
            return;
        }

        // Verifica dipendenze
        if (!window.TalonAttivitaForms) {
            console.error('[InserimentoAttivita] Dipendenza mancante: TalonAttivitaForms');
            return;
        }

        const Forms = window.TalonAttivitaForms;

        // Trova il form
        state.form = document.querySelector('form[action*="salva_attivita"]');
        if (!state.form) {
            log('[InserimentoAttivita] Form non trovato');
            return;
        }

        // Configura listeners base
        Forms.initializeFormListeners({
            tipologiaSelectId: 'tipologia_id',
            onTipologiaChange: handleTipologiaChange
        });

        // Inizializzazione specifica per inserimento
        initializeDefaults();
        
        // Validazione date
        Forms.initializeDateValidation();
        
        // Sezione GETRA
        Forms.initializeGetraSection();
        
        // Marca campi richiesti
        Forms.markRequiredFields();
        
        // Listener per submit form
        setupFormSubmitHandler();
        
        // Auto-save bozza
        setupAutoSave();
        
        // Inizializza searchable selects
        initializeSearchableSelects();

        state.initialized = true;
        log('[InserimentoAttivita] ✅ Form inserimento inizializzato');
        
        // Emetti evento
        emitEvent('inserimento-attivita:ready');
    }

    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('[InserimentoAttivita] Cleanup in corso...');

        // Clear timeouts
        if (state.autoSaveTimeout) {
            clearTimeout(state.autoSaveTimeout);
            state.autoSaveTimeout = null;
        }

        if (state.notificationTimeout) {
            clearTimeout(state.notificationTimeout);
            state.notificationTimeout = null;
        }

        // Rimuovi event handlers
        state.eventHandlers.forEach((handler, element) => {
            if (element && element.removeEventListener) {
                const [event, fn] = handler;
                element.removeEventListener(event, fn);
            }
        });
        state.eventHandlers.clear();

        // Rimuovi loader se presente
        if (state.loader && state.loader.parentNode) {
            state.loader.remove();
            state.loader = null;
        }

        // Rimuovi notifiche
        document.querySelectorAll('.talon-notification').forEach(el => el.remove());

        // Reset stato
        state.form = null;
        state.initialized = false;

        log('[InserimentoAttivita] ✅ Cleanup completato');
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function log(...args) {
        if (config.DEBUG || window.TALON_CONFIG?.debug?.enabled) {
            console.log(...args);
        }
    }

    function isInserimentoPage() {
        return window.location.pathname.includes('inserimento') ||
               window.location.pathname.includes('nuovo') ||
               window.location.pathname.includes('new') ||
               document.querySelector('form[action*="salva_attivita"]');
    }

    function emitEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, {
            detail: detail,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    function saveEventHandler(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
            state.eventHandlers.set(element, [event, handler]);
        }
    }

    // ========================================
    // FORM HANDLING
    // ========================================
    
    function handleTipologiaChange(value, text) {
        log(`[InserimentoAttivita] Tipologia cambiata: ${text} (ID: ${value})`);
        
        // Reset campi delle sezioni non attive
        resetInactiveSections();
        
        // Aggiorna campi richiesti
        if (window.TalonAttivitaForms) {
            window.TalonAttivitaForms.markRequiredFields();
        }
        
        // Focus sul primo campo della sezione attiva
        focusFirstFieldInActiveSection();
    }

    function initializeDefaults() {
        // Data inizio = oggi per default
        const dataInizio = document.getElementById('data_inizio');
        if (dataInizio && !dataInizio.value) {
            const oggi = new Date().toISOString().split('T')[0];
            dataInizio.value = oggi;
        }

        // Valori di default per personale
        const defaultValues = {
            'personale_ufficiali': 0,
            'personale_sottufficiali': 0,
            'personale_graduati': 0,
            'personale_civili': 0
        };

        Object.keys(defaultValues).forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && !field.value) {
                field.value = defaultValues[fieldId];
            }
        });
    }

    function resetInactiveSections() {
        document.querySelectorAll('[data-active="false"]').forEach(section => {
            // Mantieni i dati solo se l'utente ha già compilato qualcosa
            const hasData = Array.from(section.querySelectorAll('input, select, textarea'))
                .some(field => field.value && field.value !== '0' && field.value !== '');
            
            if (!hasData) {
                // Reset solo se la sezione è vuota
                section.querySelectorAll('input, select, textarea').forEach(field => {
                    if (field.type !== 'hidden') {
                        field.value = '';
                    }
                });
            }
        });
    }

    function focusFirstFieldInActiveSection() {
        setTimeout(() => {
            const activeSection = document.querySelector('[data-active="true"]');
            if (activeSection) {
                const firstField = activeSection.querySelector('input:not([type="hidden"]), select, textarea');
                if (firstField) {
                    firstField.focus();
                }
            }
        }, 100);
    }

    function initializeSearchableSelects() {
        // Usa API globale con delay per assicurare rendering
        setTimeout(() => {
            if (window.TalonApp && window.TalonApp.refreshSearchableSelects) {
                window.TalonApp.refreshSearchableSelects();
                log('[InserimentoAttivita] Searchable selects inizializzati via TalonApp');
            } else if (window.TALON_API && window.TALON_API.refreshSearchableSelects) {
                window.TALON_API.refreshSearchableSelects();
                log('[InserimentoAttivita] Searchable selects inizializzati via TALON_API');
            }
        }, 200);
    }

    // ========================================
    // FORM SUBMIT HANDLER
    // ========================================
    
    function setupFormSubmitHandler() {
        if (!state.form) return;

        const submitHandler = function(e) {
            // Validazione base
            if (!window.TalonAttivitaForms.validateActiveSection()) {
                e.preventDefault();
                showError('Compilare tutti i campi richiesti nella sezione attiva');
                return false;
            }

            // Validazione date
            if (!window.TalonAttivitaForms.validateDateRange()) {
                e.preventDefault();
                showError('La data fine deve essere successiva alla data inizio');
                return false;
            }

            // Conferma prima di salvare
            if (!confirm('Confermare il salvataggio della nuova attività?')) {
                e.preventDefault();
                return false;
            }

            // Pulisci auto-save
            clearAutoSave();
            
            // Mostra loader
            showLoader();
        };

        saveEventHandler(state.form, 'submit', submitHandler);
    }

    // ========================================
    // AUTO-SAVE FUNCTIONALITY
    // ========================================
    
    function setupAutoSave() {
        if (!state.form) return;

        // Carica bozza se presente
        loadDraft();

        // Handler per auto-save
        const inputHandler = function() {
            clearTimeout(state.autoSaveTimeout);
            state.autoSaveTimeout = setTimeout(() => {
                saveDraft();
            }, config.AUTOSAVE_DELAY);
        };

        const changeHandler = function() {
            clearTimeout(state.autoSaveTimeout);
            state.autoSaveTimeout = setTimeout(() => {
                saveDraft();
            }, 1000);
        };

        saveEventHandler(state.form, 'input', inputHandler);
        saveEventHandler(state.form, 'change', changeHandler);
    }

    function saveDraft() {
        if (!state.form) return;

        const formData = new FormData(state.form);
        const draft = {};
        
        formData.forEach((value, key) => {
            if (draft[key]) {
                if (!Array.isArray(draft[key])) {
                    draft[key] = [draft[key]];
                }
                draft[key].push(value);
            } else {
                draft[key] = value;
            }
        });

        // Aggiungi informazioni sulla sezione attiva
        const activeSection = document.querySelector('[data-active="true"]');
        if (activeSection) {
            draft._activeSection = activeSection.id;
        }

        try {
            localStorage.setItem(config.AUTOSAVE_KEY, JSON.stringify(draft));
            log('[InserimentoAttivita] Bozza salvata automaticamente');
            showInfo('Bozza salvata', 1000);
        } catch (e) {
            console.error('[InserimentoAttivita] Errore salvataggio bozza:', e);
        }
    }

    function loadDraft() {
        const savedDraft = localStorage.getItem(config.AUTOSAVE_KEY);
        if (!savedDraft || !state.form) return;

        if (confirm('È presente una bozza salvata. Vuoi recuperarla?')) {
            try {
                const draft = JSON.parse(savedDraft);
                
                // Ripristina i valori
                Object.keys(draft).forEach(key => {
                    if (key === '_activeSection') return;
                    
                    const field = state.form.elements[key];
                    if (field) {
                        if (field instanceof RadioNodeList) {
                            // Radio o checkbox multipli
                            if (Array.isArray(draft[key])) {
                                draft[key].forEach(value => {
                                    const input = state.form.querySelector(`[name="${key}"][value="${value}"]`);
                                    if (input) input.checked = true;
                                });
                            } else {
                                const input = state.form.querySelector(`[name="${key}"][value="${draft[key]}"]`);
                                if (input) input.checked = true;
                            }
                        } else if (field.type === 'checkbox') {
                            field.checked = draft[key] === 'on';
                        } else {
                            field.value = draft[key];
                        }
                    }
                });

                // Ripristina sezione attiva
                if (draft._activeSection) {
                    const tipologiaSelect = document.getElementById('tipologia_id');
                    if (tipologiaSelect) {
                        // Trigger change per mostrare la sezione corretta
                        tipologiaSelect.dispatchEvent(new Event('change'));
                    }
                }

                showSuccess('Bozza recuperata con successo');
                log('[InserimentoAttivita] Bozza caricata');
            } catch (e) {
                console.error('[InserimentoAttivita] Errore caricamento bozza:', e);
                localStorage.removeItem(config.AUTOSAVE_KEY);
            }
        } else {
            // Utente ha rifiutato, elimina bozza
            localStorage.removeItem(config.AUTOSAVE_KEY);
        }
    }

    function clearAutoSave() {
        localStorage.removeItem(config.AUTOSAVE_KEY);
        log('[InserimentoAttivita] Auto-save pulito');
    }

    // ========================================
    // UI FEEDBACK
    // ========================================
    
    function showLoader() {
        // Rimuovi loader esistente
        if (state.loader && state.loader.parentNode) {
            state.loader.remove();
        }

        const loader = document.createElement('div');
        loader.className = 'form-loader';
        loader.innerHTML = '<div class="spinner"></div><p>Salvataggio in corso...</p>';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255,255,255,0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        
        state.loader = loader;
        document.body.appendChild(loader);
        
        // Inietta stili spinner se non esistono
        injectSpinnerStyles();
    }

    function showNotification(message, type = 'info', duration = config.NOTIFICATION_DURATION) {
        // Usa TalonApp se disponibile
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast(message, type);
            return;
        }

        // Rimuovi notifiche esistenti
        document.querySelectorAll('.talon-notification').forEach(el => el.remove());

        // Crea notifica
        const notification = document.createElement('div');
        notification.className = `talon-notification talon-notification-${type}`;
        notification.textContent = message;
        
        // Stili inline per la notifica
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 300px;
        `;

        // Colori per tipo
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            info: '#17a2b8',
            warning: '#ffc107'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        document.body.appendChild(notification);

        // Auto-rimuovi dopo duration
        clearTimeout(state.notificationTimeout);
        state.notificationTimeout = setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, duration);
    }

    function showSuccess(message, duration) {
        showNotification(message, 'success', duration);
    }

    function showError(message, duration) {
        showNotification(message, 'error', duration || 5000);
        console.error('❌', message);
    }

    function showInfo(message, duration) {
        showNotification(message, 'info', duration || 2000);
    }

    // ========================================
    // STYLES
    // ========================================
    
    function injectSpinnerStyles() {
        if (document.getElementById('inserimento-attivita-styles')) return;

        const style = document.createElement('style');
        style.id = 'inserimento-attivita-styles';
        style.textContent = `
            .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #007bff;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ========================================
    // PUBLIC API
    // ========================================
    
    window.TalonInserimentoAttivita = {
        // Core methods
        initialize: initialize,
        cleanup: cleanup,
        
        // Form methods
        saveDraft: saveDraft,
        loadDraft: loadDraft,
        clearAutoSave: clearAutoSave,
        
        // UI methods
        showSuccess: showSuccess,
        showError: showError,
        showInfo: showInfo,
        
        // State
        isInitialized: () => state.initialized,
        
        // Config
        getConfig: () => ({ ...config }),
        setDebug: (value) => { config.DEBUG = value; },
        
        // Version
        version: '2.0.0'
    };

    // ========================================
    // SPA INTEGRATION
    // ========================================
    
    // Listener per eventi SPA
    if (window.TalonApp) {
        window.TalonApp.on('content:loaded', initialize);
        window.TalonApp.on('navigation:start', cleanup);
    } else {
        document.addEventListener('spa:content-loaded', initialize);
        document.addEventListener('spa:navigation-start', cleanup);
    }

    // Auto-inizializzazione per primo caricamento
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 100);
    }

    log('[InserimentoAttivita] Modulo caricato v' + window.TalonInserimentoAttivita.version + ' (SPA Ready)');

})(window, document);