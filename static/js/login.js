/**
 * ========================================
 * TALON - LOGIN FORM HANDLER (SPA VERSION)
 * File: static/js/login.js
 * 
 * Versione: 2.0.0 - Ottimizzata per SPA
 * Gestisce la logica del form di login
 * con supporto completo SPA
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Namespace globale
    window.TalonLogin = window.TalonLogin || {};

    // ========================================
    // STATO E CONFIGURAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        form: null,
        submitBtn: null,
        inputs: [],
        eventHandlers: new Map(),
        submitTimeout: null,
        networkCheckInterval: null,
        isSubmitting: false
    };

    const config = {
        SUBMIT_TIMEOUT: 5000,
        NETWORK_CHECK_INTERVAL: 10000,
        DEBUG_MODE: localStorage.getItem('talonDebugMode') === 'true',
        ANIMATION_DURATION: 300
    };

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        log('[TALON Login] Inizializzazione sistema login (SPA)...');

        // Cleanup precedente se necessario
        if (state.initialized) {
            cleanup();
        }

        // Verifica se siamo nella pagina login
        if (!isLoginPage()) {
            log('[TALON Login] Non nella pagina login, skip init');
            return;
        }

        // Trova elementi DOM
        if (!initializeDOM()) {
            log('[TALON Login] Elementi DOM non trovati');
            return;
        }

        // Setup handlers
        setupFormSubmitHandler();
        setupInputHandlers();
        setupKeyboardHandlers();
        setupConnectionHandlers();
        
        // Setup debug mode se attivo
        if (config.DEBUG_MODE) {
            setupDebugMode();
        }

        // Auto-focus primo campo
        autoFocusFirstField();
        
        // Check neural network
        checkNeuralNetwork();

        state.initialized = true;
        log('[TALON Login] ✅ Sistema login inizializzato');
        
        // Emetti evento
        emitEvent('login:ready');
    }

    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('[TALON Login] Cleanup in corso...');

        // Clear timeouts
        if (state.submitTimeout) {
            clearTimeout(state.submitTimeout);
            state.submitTimeout = null;
        }

        // Clear intervals
        if (state.networkCheckInterval) {
            clearInterval(state.networkCheckInterval);
            state.networkCheckInterval = null;
        }

        // Rimuovi event handlers
        state.eventHandlers.forEach((handlers, element) => {
            if (element && element.removeEventListener) {
                handlers.forEach(([event, handler]) => {
                    element.removeEventListener(event, handler);
                });
            }
        });
        state.eventHandlers.clear();

        // Rimuovi elementi dinamici
        document.querySelectorAll('.alert-network-error').forEach(el => el.remove());

        // Reset stato
        state.form = null;
        state.submitBtn = null;
        state.inputs = [];
        state.isSubmitting = false;
        state.initialized = false;

        log('[TALON Login] ✅ Cleanup completato');
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function log(...args) {
        if (config.DEBUG_MODE) {
            console.log(...args);
        }
    }

    function isLoginPage() {
        return window.location.pathname.includes('login') ||
               document.getElementById('loginForm') ||
               document.querySelector('form[action*="login"]');
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
        
        // Salva handler per cleanup
        if (!state.eventHandlers.has(element)) {
            state.eventHandlers.set(element, []);
        }
        state.eventHandlers.get(element).push([event, handler]);
    }

    // ========================================
    // INIZIALIZZAZIONE DOM
    // ========================================
    
    function initializeDOM() {
        state.form = document.getElementById('loginForm') || 
                    document.querySelector('form[action*="login"]');
        
        if (!state.form) return false;

        state.submitBtn = document.getElementById('loginBtn') ||
                         state.form.querySelector('button[type="submit"]') ||
                         state.form.querySelector('input[type="submit"]');
        
        state.inputs = Array.from(state.form.querySelectorAll('input'));
        
        return true;
    }

    // ========================================
    // FORM SUBMIT HANDLER
    // ========================================
    
    function setupFormSubmitHandler() {
        if (!state.form) return;

        const submitHandler = function(e) {
            // Previeni submit multipli
            if (state.isSubmitting) {
                e.preventDefault();
                return;
            }

            state.isSubmitting = true;

            // Disabilita il pulsante e mostra loading
            if (state.submitBtn) {
                state.submitBtn.disabled = true;
                state.submitBtn.classList.add('loading');
                
                const originalText = state.submitBtn.textContent;
                state.submitBtn.textContent = 'ACCESSO IN CORSO...';
                
                // Salva testo originale per ripristino
                state.submitBtn.dataset.originalText = originalText;
            }
            
            log('[TALON Login] Invio credenziali in corso...');
            
            // Timeout di sicurezza
            state.submitTimeout = setTimeout(() => {
                resetSubmitButton();
                state.isSubmitting = false;
                log('[TALON Login] Timeout - pulsante riabilitato');
            }, config.SUBMIT_TIMEOUT);
        };

        addEventHandler(state.form, 'submit', submitHandler);
    }

    function resetSubmitButton() {
        if (!state.submitBtn) return;
        
        state.submitBtn.disabled = false;
        state.submitBtn.classList.remove('loading');
        
        const originalText = state.submitBtn.dataset.originalText || 'ACCEDI';
        state.submitBtn.textContent = originalText;
    }

    // ========================================
    // INPUT HANDLERS
    // ========================================
    
    function setupInputHandlers() {
        state.inputs.forEach(input => {
            // Focus handler
            const focusHandler = function() {
                this.parentElement?.classList.add('focused');
                log(`[TALON Login] Focus su campo: ${this.name}`);
            };
            
            const blurHandler = function() {
                this.parentElement?.classList.remove('focused');
                // Trim value
                this.value = this.value.trim();
            };
            
            addEventHandler(input, 'focus', focusHandler);
            addEventHandler(input, 'blur', blurHandler);
            
            // Validazione in tempo reale
            const inputHandler = function() {
                // Aggiungi classe has-content
                if (this.value.trim() !== '') {
                    this.classList.add('has-content');
                } else {
                    this.classList.remove('has-content');
                }
                
                // Validazione email militare
                if (this.name === 'username') {
                    validateEmail(this);
                }
                
                // Rimuovi errori precedenti
                this.classList.remove('is-invalid');
            };
            
            addEventHandler(input, 'input', inputHandler);
        });
    }

    function validateEmail(input) {
        const emailRegex = /^[a-zA-Z0-9][a-zA-Z0-9._\-]*@esercito\.difesa\.it$/;
        const isValid = emailRegex.test(input.value);
        
        if (!isValid && input.value.length > 0) {
            input.style.borderColor = '#ef4444';
            input.classList.add('is-invalid');
            showFieldError(input, 'Email deve terminare con @esercito.difesa.it');
        } else {
            input.style.borderColor = '';
            input.classList.remove('is-invalid');
            hideFieldError(input);
        }
        
        return isValid;
    }

    function showFieldError(field, message) {
        let errorEl = field.parentNode?.querySelector('.field-error');
        if (!errorEl) {
            errorEl = document.createElement('small');
            errorEl.className = 'field-error text-danger';
            field.parentNode?.appendChild(errorEl);
        }
        errorEl.textContent = message;
    }

    function hideFieldError(field) {
        const errorEl = field.parentNode?.querySelector('.field-error');
        if (errorEl) {
            errorEl.remove();
        }
    }

    // ========================================
    // KEYBOARD HANDLERS
    // ========================================
    
    function setupKeyboardHandlers() {
        if (!state.form) return;

        // Gestione Enter
        const keydownHandler = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                
                // Verifica campi required
                if (validateForm()) {
                    state.form.requestSubmit();
                }
            }
        };
        
        addEventHandler(state.form, 'keydown', keydownHandler);
        
        // Tab navigation logging
        state.inputs.forEach((input, index) => {
            const tabHandler = function(e) {
                if (e.key === 'Tab') {
                    const nextInput = state.inputs[index + 1];
                    log(`[TALON Login] Tab navigation: ${this.name} -> ${nextInput?.name || 'submit'}`);
                }
            };
            
            addEventHandler(input, 'keydown', tabHandler);
        });
    }

    function validateForm() {
        let isValid = true;
        const errors = [];
        
        state.inputs.forEach(input => {
            if (input.hasAttribute('required') && !input.value.trim()) {
                input.classList.add('is-invalid');
                errors.push(`${input.name} è obbligatorio`);
                isValid = false;
                
                // Focus sul primo campo con errore
                if (errors.length === 1) {
                    input.focus();
                    shakeElement(input);
                }
            }
        });
        
        // Validazione specifica email militare
        const emailInput = state.form.querySelector('input[name="username"]');
        if (emailInput && !validateEmail(emailInput)) {
            isValid = false;
        }
        
        if (!isValid && errors.length > 0) {
            log('[TALON Login] Errori validazione:', errors);
            showNetworkError(errors[0]);
        }
        
        return isValid;
    }

    // ========================================
    // CONNECTION HANDLERS
    // ========================================
    
    function setupConnectionHandlers() {
        // Online handler
        const onlineHandler = function() {
            log('[TALON Login] ✅ Connessione ripristinata');
            
            // Riabilita form
            if (state.submitBtn && !state.isSubmitting) {
                resetSubmitButton();
            }
            
            // Rimuovi errori di rete
            document.querySelectorAll('.alert-network-error').forEach(alert => alert.remove());
            
            updateConnectionStatus(true);
        };
        
        // Offline handler
        const offlineHandler = function() {
            log('[TALON Login] ❌ Connessione persa');
            
            // Disabilita form temporaneamente
            if (state.submitBtn && state.submitBtn.classList.contains('loading')) {
                state.submitBtn.disabled = false;
                state.submitBtn.classList.remove('loading');
                state.submitBtn.textContent = 'CONNESSIONE PERSA';
                
                showNetworkError('Connessione Internet persa. Controlla la tua connessione.');
            }
            
            updateConnectionStatus(false);
        };
        
        addEventHandler(window, 'online', onlineHandler);
        addEventHandler(window, 'offline', offlineHandler);
        
        // Check iniziale
        updateConnectionStatus(navigator.onLine);
    }

    function updateConnectionStatus(isOnline) {
        const statusEl = document.querySelector('.connection-status');
        if (statusEl) {
            statusEl.textContent = isOnline ? 'Online' : 'Offline';
            statusEl.className = `connection-status ${isOnline ? 'text-success' : 'text-danger'}`;
        }
    }

    // ========================================
    // UI FEEDBACK
    // ========================================
    
    function showNetworkError(message) {
        // Rimuovi errori esistenti
        document.querySelectorAll('.alert-network-error').forEach(alert => alert.remove());
        
        // Crea nuovo alert
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-danger alert-network-error';
        alertDiv.style.cssText = `
            margin: 1rem 0;
            animation: slideDown 0.3s ease-out;
        `;
        alertDiv.textContent = message;
        
        // Inserisci prima del form
        state.form?.parentNode?.insertBefore(alertDiv, state.form);
        
        // Auto-rimuovi dopo 5 secondi
        setTimeout(() => {
            alertDiv.style.animation = 'slideUp 0.3s ease-out';
            setTimeout(() => alertDiv.remove(), 300);
        }, 5000);
    }

    function shakeElement(element) {
        element.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }

    function autoFocusFirstField() {
        setTimeout(() => {
            const firstEmptyInput = state.inputs.find(input => 
                !input.value.trim() && input.type !== 'hidden'
            );
            if (firstEmptyInput) {
                firstEmptyInput.focus();
            }
        }, 500);
    }

    // ========================================
    // NEURAL NETWORK INTEGRATION
    // ========================================
    
    function checkNeuralNetwork() {
        setTimeout(() => {
            if (window.TALON_NeuralNetwork && window.TALON_NeuralNetwork.isInitialized()) {
                log('[TALON Login] ✅ Neural Network attiva');
                
                // Effetti su interazione form
                state.inputs.forEach(input => {
                    const neuralFocusHandler = () => {
                        if (window.TALON_NeuralNetwork.activateNodes) {
                            window.TALON_NeuralNetwork.activateNodes(2);
                        }
                    };
                    addEventHandler(input, 'focus', neuralFocusHandler);
                });
                
                // Effetto durante submit
                const neuralSubmitHandler = () => {
                    if (window.TALON_NeuralNetwork.activateNodes) {
                        window.TALON_NeuralNetwork.activateNodes(5);
                    }
                };
                addEventHandler(state.form, 'submit', neuralSubmitHandler);
                
            } else {
                log('[TALON Login] ⚠️ Neural Network non disponibile');
            }
        }, 1000);
    }

    // ========================================
    // DEBUG MODE
    // ========================================
    
    function setupDebugMode() {
        log('[TALON Login] 🐛 Debug mode attivo');
        
        // Esponi funzioni debug
        window.TalonLoginDebug = {
            validateForm: validateForm,
            shakeForm: () => shakeElement(state.form),
            simulateSubmit: () => state.form?.requestSubmit(),
            fillTestData: () => {
                const emailInput = state.form?.querySelector('input[name="username"]');
                const passwordInput = state.form?.querySelector('input[name="password"]');
                if (emailInput) emailInput.value = 'mario.rossi@esercito.difesa.it';
                if (passwordInput) passwordInput.value = 'password123';
                log('Test data inserted');
            },
            getState: () => ({ ...state }),
            toggleDebug: () => {
                config.DEBUG_MODE = !config.DEBUG_MODE;
                localStorage.setItem('talonDebugMode', config.DEBUG_MODE.toString());
                log('Debug mode:', config.DEBUG_MODE);
            }
        };
        
        log('[TALON Login] Debug commands available:', Object.keys(window.TalonLoginDebug));
    }

    // ========================================
    // STYLES
    // ========================================
    
    function injectStyles() {
        if (document.getElementById('login-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'login-styles';
        style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
            
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes slideUp {
                from {
                    opacity: 1;
                    transform: translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateY(-10px);
                }
            }
            
            .loading {
                position: relative;
                color: transparent !important;
            }
            
            .loading::after {
                content: "";
                position: absolute;
                width: 16px;
                height: 16px;
                top: 50%;
                left: 50%;
                margin-left: -8px;
                margin-top: -8px;
                border: 2px solid #f3f3f3;
                border-radius: 50%;
                border-top: 2px solid #3498db;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .field-error {
                display: block;
                margin-top: 0.25rem;
                font-size: 0.875em;
            }
        `;
        document.head.appendChild(style);
    }

    // ========================================
    // PUBLIC API
    // ========================================
    
    window.TalonLogin = {
        // Core methods
        initialize: initialize,
        cleanup: cleanup,
        
        // Validation
        validateForm: validateForm,
        
        // UI methods
        showError: showNetworkError,
        shake: shakeElement,
        
        // State
        isInitialized: () => state.initialized,
        isSubmitting: () => state.isSubmitting,
        
        // Config
        getConfig: () => ({ ...config }),
        setDebug: (value) => { 
            config.DEBUG_MODE = value;
            localStorage.setItem('talonDebugMode', value.toString());
        },
        
        // Version
        version: '2.0.0'
    };

    // ========================================
    // SPA INTEGRATION
    // ========================================
    
    // Inietta stili una volta sola
    injectStyles();
    
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

    log('[TALON Login] Modulo caricato v' + window.TalonLogin.version + ' (SPA Ready)');

})(window, document);