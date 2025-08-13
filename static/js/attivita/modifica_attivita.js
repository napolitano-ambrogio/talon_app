/**
 * ========================================
 * TALON - MODIFICA ATTIVITÀ (SPA VERSION)
 * File: static/js/modifica_attivita.js
 * 
 * Versione: 2.0.0 - Ottimizzata per SPA
 * Logica specifica per il form di
 * modifica attività esistente con supporto SPA
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Namespace globale
    window.TalonModificaAttivita = window.TalonModificaAttivita || {};

    // ========================================
    // STATO E CONFIGURAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        form: null,
        originalFormData: null,
        isModified: false,
        eventHandlers: new Map(),
        changeTimeout: null,
        modifiedIndicator: null,
        resetButton: null,
        loader: null
    };

    const config = {
        CHANGE_DETECTION_DELAY: 500,
        NOTIFICATION_DURATION: 3000,
        DEBUG: false
    };

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        log('[ModificaAttivita] Inizializzazione form modifica (SPA)...');

        // Cleanup precedente se necessario
        if (state.initialized) {
            cleanup();
        }

        // Verifica se siamo nella pagina corretta
        if (!isModificaPage()) {
            log('[ModificaAttivita] Non nella pagina modifica, skip init');
            return;
        }

        // Verifica dipendenze
        if (!window.TalonAttivitaForms) {
            console.error('[ModificaAttivita] Dipendenza mancante: TalonAttivitaForms');
            return;
        }

        const Forms = window.TalonAttivitaForms;

        // Trova il form
        state.form = document.querySelector('form[action*="aggiorna_attivita"]') ||
                    document.querySelector('form[action*="update_attivita"]') ||
                    document.querySelector('form.modifica-form');
                    
        if (!state.form) {
            log('[ModificaAttivita] Form non trovato');
            return;
        }

        // Salva stato originale
        captureOriginalState();

        // Configura listeners base
        Forms.initializeFormListeners({
            tipologiaSelectId: 'tipologia_id',
            onTipologiaChange: handleTipologiaChange
        });

        // Mostra sezione corretta basata sul valore iniziale
        Forms.toggleActivityDetails('tipologia_id');

        // Validazione date
        Forms.initializeDateValidation();
        
        // Sezione GETRA
        Forms.initializeGetraSection();
        
        // Marca campi richiesti
        Forms.markRequiredFields();
        
        // Setup handlers
        setupFormSubmitHandler();
        setupUnsavedChangesWarning();
        setupChangeTracking();
        addResetButton();
        
        state.initialized = true;
        log('[ModificaAttivita] ✅ Form modifica inizializzato');
        
        // Emetti evento
        emitEvent('modifica-attivita:ready');
    }

    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('[ModificaAttivita] Cleanup in corso...');

        // Clear timeout
        if (state.changeTimeout) {
            clearTimeout(state.changeTimeout);
            state.changeTimeout = null;
        }

        // Rimuovi event handlers
        state.eventHandlers.forEach((handler, element) => {
            if (element && element.removeEventListener) {
                const [event, fn, options] = handler;
                element.removeEventListener(event, fn, options);
            }
        });
        state.eventHandlers.clear();

        // Rimuovi elementi UI creati
        if (state.modifiedIndicator && state.modifiedIndicator.parentNode) {
            state.modifiedIndicator.remove();
            state.modifiedIndicator = null;
        }

        if (state.resetButton && state.resetButton.parentNode) {
            state.resetButton.remove();
            state.resetButton = null;
        }

        if (state.loader && state.loader.parentNode) {
            state.loader.remove();
            state.loader = null;
        }

        // Reset stato
        state.form = null;
        state.originalFormData = null;
        state.isModified = false;
        state.initialized = false;

        // Rimuovi handler beforeunload globale
        window.onbeforeunload = null;

        log('[ModificaAttivita] ✅ Cleanup completato');
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function log(...args) {
        if (config.DEBUG || window.TALON_CONFIG?.debug?.enabled) {
            console.log(...args);
        }
    }

    function isModificaPage() {
        return window.location.pathname.includes('modifica') ||
               window.location.pathname.includes('edit') ||
               window.location.pathname.includes('update') ||
               document.querySelector('form[action*="aggiorna_attivita"]');
    }

    function emitEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, {
            detail: detail,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    function addEventHandler(element, event, handler, options = {}) {
        if (!element) return;
        
        element.addEventListener(event, handler, options);
        state.eventHandlers.set(element, [event, handler, options]);
    }

    // ========================================
    // GESTIONE STATO FORM
    // ========================================
    
    function captureOriginalState() {
        if (!state.form) return;
        
        const formData = new FormData(state.form);
        state.originalFormData = {};
        
        formData.forEach((value, key) => {
            if (state.originalFormData[key]) {
                if (!Array.isArray(state.originalFormData[key])) {
                    state.originalFormData[key] = [state.originalFormData[key]];
                }
                state.originalFormData[key].push(value);
            } else {
                state.originalFormData[key] = value;
            }
        });
        
        log('[ModificaAttivita] Stato originale catturato:', Object.keys(state.originalFormData).length, 'campi');
    }

    function handleTipologiaChange(value, text) {
        log(`[ModificaAttivita] Tipologia cambiata: ${text} (ID: ${value})`);
        
        // Controlla se ci sono dati nelle sezioni che verranno nascoste
        if (checkDataInInactiveSections()) {
            if (!confirm('Cambiando tipologia, i dati nelle altre sezioni non verranno salvati. Continuare?')) {
                // Ripristina valore precedente
                restorePreviousTipologia();
                return;
            }
        }
        
        // Aggiorna campi richiesti
        if (window.TalonAttivitaForms) {
            window.TalonAttivitaForms.markRequiredFields();
        }
        
        // Marca form come modificato
        markFormAsModified();
    }

    function checkDataInInactiveSections() {
        const inactiveSections = document.querySelectorAll('[data-active="false"]');
        
        for (let section of inactiveSections) {
            const hasData = Array.from(section.querySelectorAll('input, select, textarea'))
                .some(field => {
                    if (field.type === 'number') {
                        return field.value && field.value !== '0';
                    }
                    return field.value && field.value !== '';
                });
            
            if (hasData) return true;
        }
        
        return false;
    }

    function restorePreviousTipologia() {
        const tipologiaSelect = document.getElementById('tipologia_id');
        if (!tipologiaSelect || !state.originalFormData) return;
        
        const originalValue = state.originalFormData['tipologia_id'];
        if (originalValue) {
            tipologiaSelect.value = originalValue;
            tipologiaSelect.dispatchEvent(new Event('change'));
        }
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

            // Conferma modifiche
            if (!confirm('Confermare l\'aggiornamento dell\'attività?')) {
                e.preventDefault();
                return false;
            }

            // Reset flag modifiche
            resetModifiedFlag();
            
            // Mostra loader
            showLoader();
        };

        addEventHandler(state.form, 'submit', submitHandler);
    }

    // ========================================
    // TRACKING MODIFICHE
    // ========================================
    
    function setupUnsavedChangesWarning() {
        // Handler per beforeunload (solo se non SPA)
        const beforeUnloadHandler = function(e) {
            if (state.isModified && !isNavigatingSPA()) {
                const message = 'Ci sono modifiche non salvate. Sei sicuro di voler uscire?';
                e.returnValue = message;
                return message;
            }
        };
        
        // Usa handler personalizzato per evitare conflitti
        window.onbeforeunload = beforeUnloadHandler;
    }

    function isNavigatingSPA() {
        // Controlla se stiamo navigando via SPA
        return window.TalonApp?.isNavigating || false;
    }

    function setupChangeTracking() {
        if (!state.form) return;

        const inputHandler = function(e) {
            // Ignora campi che non sono input utente
            if (e.target.type === 'hidden' || e.target.readOnly || e.target.disabled) {
                return;
            }

            clearTimeout(state.changeTimeout);
            state.changeTimeout = setTimeout(() => {
                checkForChanges();
            }, config.CHANGE_DETECTION_DELAY);
        };

        addEventHandler(state.form, 'input', inputHandler);
        addEventHandler(state.form, 'change', inputHandler);
    }

    function checkForChanges() {
        if (!state.originalFormData || !state.form) return;

        const currentData = new FormData(state.form);
        let hasChanges = false;

        // Confronta con stato originale
        currentData.forEach((value, key) => {
            const originalValue = state.originalFormData[key];
            
            if (Array.isArray(originalValue)) {
                if (!originalValue.includes(value)) {
                    hasChanges = true;
                    logChange(key, originalValue, value);
                }
            } else if (originalValue !== value) {
                hasChanges = true;
                logChange(key, originalValue, value);
            }
        });

        // Controlla anche campi rimossi
        Object.keys(state.originalFormData).forEach(key => {
            if (!currentData.has(key)) {
                hasChanges = true;
                logChange(key, state.originalFormData[key], null);
            }
        });

        if (hasChanges !== state.isModified) {
            if (hasChanges) {
                markFormAsModified();
            } else {
                resetModifiedFlag();
            }
        }
    }

    function logChange(field, oldValue, newValue) {
        log(`[ModificaAttivita] Campo modificato: ${field}`);
        log(`  Da: ${oldValue}`);
        log(`  A: ${newValue}`);
    }

    function markFormAsModified() {
        state.isModified = true;
        updateModifiedIndicator(true);
        emitEvent('modifica-attivita:modified');
    }

    function resetModifiedFlag() {
        state.isModified = false;
        updateModifiedIndicator(false);
        emitEvent('modifica-attivita:reset');
    }

    // ========================================
    // UI FEEDBACK
    // ========================================
    
    function updateModifiedIndicator(isModified) {
        if (!state.modifiedIndicator) {
            state.modifiedIndicator = document.createElement('div');
            state.modifiedIndicator.id = 'modified-indicator';
            state.modifiedIndicator.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                padding: 10px 15px;
                border-radius: 5px;
                font-size: 0.9rem;
                font-weight: 500;
                z-index: 1000;
                transition: all 0.3s ease;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            `;
            document.body.appendChild(state.modifiedIndicator);
        }

        if (isModified) {
            state.modifiedIndicator.textContent = '⚠️ Modifiche non salvate';
            state.modifiedIndicator.style.backgroundColor = '#fff3cd';
            state.modifiedIndicator.style.color = '#856404';
            state.modifiedIndicator.style.border = '1px solid #ffeaa7';
            state.modifiedIndicator.style.display = 'block';
        } else {
            state.modifiedIndicator.style.display = 'none';
        }
    }

    function addResetButton() {
        const submitButton = state.form?.querySelector('button[type="submit"]');
        if (!submitButton) return;

        // Verifica se esiste già
        if (state.resetButton) return;

        state.resetButton = document.createElement('button');
        state.resetButton.type = 'button';
        state.resetButton.className = 'btn btn-secondary';
        state.resetButton.textContent = 'Annulla Modifiche';
        state.resetButton.style.marginLeft = '10px';
        
        const resetHandler = function() {
            if (confirm('Vuoi annullare tutte le modifiche e ripristinare i valori originali?')) {
                resetToOriginalState();
            }
        };
        
        addEventHandler(state.resetButton, 'click', resetHandler);
        submitButton.parentNode.insertBefore(state.resetButton, submitButton.nextSibling);
    }

    function resetToOriginalState() {
        if (!state.originalFormData || !state.form) return;

        // Ripristina tutti i valori
        Object.keys(state.originalFormData).forEach(key => {
            const field = state.form.elements[key];
            if (field) {
                const value = state.originalFormData[key];
                
                if (field instanceof RadioNodeList) {
                    // Radio o checkbox multipli
                    if (Array.isArray(value)) {
                        // Deseleziona tutto prima
                        state.form.querySelectorAll(`[name="${key}"]`).forEach(input => {
                            input.checked = false;
                        });
                        // Seleziona valori originali
                        value.forEach(v => {
                            const input = state.form.querySelector(`[name="${key}"][value="${v}"]`);
                            if (input) input.checked = true;
                        });
                    } else {
                        const input = state.form.querySelector(`[name="${key}"][value="${value}"]`);
                        if (input) input.checked = true;
                    }
                } else if (field.type === 'checkbox') {
                    field.checked = value === 'on';
                } else {
                    field.value = value || '';
                }
            }
        });

        // Trigger change per aggiornare UI
        const tipologiaSelect = document.getElementById('tipologia_id');
        if (tipologiaSelect) {
            tipologiaSelect.dispatchEvent(new Event('change'));
        }

        resetModifiedFlag();
        showSuccess('Modifiche annullate');
    }

    function showLoader() {
        if (state.loader) return;
        
        state.loader = document.createElement('div');
        state.loader.className = 'form-loader';
        state.loader.innerHTML = '<div class="spinner"></div><p>Aggiornamento in corso...</p>';
        state.loader.style.cssText = `
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
        document.body.appendChild(state.loader);
        
        // Inietta stili se necessario
        injectStyles();
    }

    function showNotification(message, type = 'info', duration = config.NOTIFICATION_DURATION) {
        // Usa TalonApp se disponibile
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast(message, type);
            return;
        }
        
        // Usa TALON_API se disponibile
        if (window.TALON_API) {
            if (type === 'success' && window.TALON_API.showSuccess) {
                window.TALON_API.showSuccess(message, duration);
                return;
            }
            if (type === 'error' && window.TALON_API.showError) {
                window.TALON_API.showError(message, duration);
                return;
            }
        }
        
        // Fallback console
        console.log(`[${type.toUpperCase()}]`, message);
    }

    function showSuccess(message, duration) {
        showNotification(message, 'success', duration);
    }

    function showError(message, duration) {
        showNotification(message, 'error', duration || 5000);
        console.error('❌', message);
    }

    // ========================================
    // STYLES
    // ========================================
    
    function injectStyles() {
        if (document.getElementById('modifica-attivita-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'modifica-attivita-styles';
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
            #modified-indicator {
                animation: slideInRight 0.3s ease-out;
            }
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ========================================
    // PUBLIC API
    // ========================================
    
    window.TalonModificaAttivita = {
        // Core methods
        initialize: initialize,
        cleanup: cleanup,
        
        // Form methods
        resetToOriginal: resetToOriginalState,
        checkChanges: checkForChanges,
        
        // State methods
        isModified: () => state.isModified,
        isInitialized: () => state.initialized,
        getOriginalData: () => ({ ...state.originalFormData }),
        
        // UI methods
        showSuccess: showSuccess,
        showError: showError,
        
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

    log('[ModificaAttivita] Modulo caricato v' + window.TalonModificaAttivita.version + ' (SPA Ready)');

})(window, document);