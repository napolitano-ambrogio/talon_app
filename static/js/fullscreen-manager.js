/**
 * ========================================
 * TALON - FULLSCREEN MANAGER (SPA VERSION)
 * File: static/js/fullscreen-manager.js
 * 
 * Versione: 2.0.0 - Ottimizzata per SPA
 * Gestisce la persistenza dello stato fullscreen
 * tra le navigazioni SPA
 * ========================================
 */

(function(window, document) {
    'use strict';
    
    // Namespace globale
    window.TalonFullscreen = window.TalonFullscreen || {};
    
    // ========================================
    // CONFIGURAZIONE E STATO
    // ========================================
    
    const config = {
        STORAGE_KEY: 'talon_fullscreen_state',
        PROMPT_KEY: 'talon_fullscreen_prompt',
        PROMPT_TIMEOUT: 5000,
        ANIMATION_DURATION: 300,
        DEBUG: false
    };
    
    const state = {
        isActive: false,
        isInitialized: false,
        button: null,
        eventHandlers: new Map(),
        documentHandlers: new Map(),
        promptElement: null,
        lastToggleTime: 0  // Prevent rapid fire toggles
    };
    
    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function init() {
        // Prevent multiple initializations - use singleton pattern
        if (state.isInitialized) {
            log('🖥️ Fullscreen Manager already initialized, skipping');
            return;
        }
        
        log('🖥️ Initializing Fullscreen Manager (SPA Version)...');
        
        // Trova il bottone fullscreen
        state.button = findFullscreenButton();
        if (!state.button) {
            log('Fullscreen button not found, skipping init');
            return;
        }
        
        // Bind eventi
        bindEvents();
        
        // Check saved state but DO NOT auto-enter fullscreen
        checkSavedStateWithoutAutoEnter();
        
        // Aggiorna UI iniziale
        updateUI();
        
        state.isInitialized = true;
        log('✅ Fullscreen Manager initialized');
        
        // Emetti evento ready
        emitEvent('fullscreen:ready');
    }
    
    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('🧹 Cleaning up Fullscreen Manager...');
        
        // Rimuovi event handlers dal button
        if (state.button) {
            state.eventHandlers.forEach((handler, event) => {
                state.button.removeEventListener(event, handler);
            });
        }
        
        // Rimuovi document handlers
        state.documentHandlers.forEach((handler, event) => {
            document.removeEventListener(event, handler);
        });
        
        // Clear maps
        state.eventHandlers.clear();
        state.documentHandlers.clear();
        
        // Rimuovi prompt se presente
        if (state.promptElement && state.promptElement.parentNode) {
            state.promptElement.remove();
        }
        
        // Reset stato
        state.button = null;
        state.promptElement = null;
        state.isInitialized = false;
        
        log('✅ Cleanup completed');
    }
    
    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function log(...args) {
        if (config.DEBUG || window.TALON_CONFIG?.debug?.enabled) {
            // console.log removed for production silence
        }
    }
    
    function emitEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, {
            detail: detail,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }
    
    function findFullscreenButton() {
        // Cerca in vari possibili ID e classi
        const selectors = [
            '#fullscreen-btn',
            '#toggleFullscreen',
            '[data-action="fullscreen"]',
            '.fullscreen-btn',
            '.btn-fullscreen'
        ];
        
        for (let selector of selectors) {
            const button = document.querySelector(selector);
            if (button) {
                log('Found fullscreen button:', selector);
                return button;
            }
        }
        
        return null;
    }
    
    // ========================================
    // EVENT BINDING
    // ========================================
    
    function bindEvents() {
        // Click sul pulsante
        const clickHandler = function(e) {
            e.preventDefault();
            toggle();
        };
        state.button.addEventListener('click', clickHandler);
        state.eventHandlers.set('click', clickHandler);
        
        // Eventi fullscreen change
        const fullscreenEvents = [
            'fullscreenchange',
            'mozfullscreenchange',
            'webkitfullscreenchange',
            'msfullscreenchange'
        ];
        
        const changeHandler = function() {
            handleFullscreenChange();
        };
        
        fullscreenEvents.forEach(eventName => {
            document.addEventListener(eventName, changeHandler);
            state.documentHandlers.set(eventName, changeHandler);
        });
        
        // Gestione tasto F11 (non sempre catturabile)
        const keyHandler = function(e) {
            if (e.key === 'F11') {
                e.preventDefault();
                toggle();
            }
        };
        document.addEventListener('keydown', keyHandler);
        state.documentHandlers.set('keydown', keyHandler);
        
        log('Events bound successfully');
    }
    
    // ========================================
    // FULLSCREEN CONTROLS
    // ========================================
    
    function toggle() {
        // Prevent rapid toggles (debounce)
        const now = Date.now();
        if (now - state.lastToggleTime < 500) {  // 500ms debounce
            log('Toggle blocked: too rapid (debounced)');
            return;
        }
        state.lastToggleTime = now;
        
        if (!isFullscreen()) {
            enter();
        } else {
            exit();
        }
    }
    
    function enter() {
        // Get stack trace to see what called this function
        const stack = new Error().stack;
        log('enter() called from:', stack.split('\n')[2]?.trim() || 'unknown');
        
        // Verifica che la chiamata provenga da un'interazione utente
        if (!document.hasFocus()) {
            log('Fullscreen request blocked: document not focused');
            return;
        }
        
        // Additional check: prevent automatic calls during page load
        if (!state.isInitialized) {
            log('Fullscreen request blocked: manager not fully initialized');
            return;
        }
        
        // Prevent calls during SPA navigation
        if (window.TalonApp && window.TalonApp.getState && window.TalonApp.getState().isNavigating) {
            log('Fullscreen request blocked: SPA navigation in progress');
            return;
        }
        
        // Additional safety: check if this is a user-initiated call
        const userInitiated = document.querySelector(':focus') || 
                              document.activeElement?.tagName === 'BUTTON' ||
                              window.event?.isTrusted;
        
        if (!userInitiated) {
            log('Fullscreen request blocked: not user-initiated');
            return;
        }
        
        const elem = document.documentElement;
        
        const requestMethods = [
            'requestFullscreen',
            'mozRequestFullScreen',
            'webkitRequestFullscreen',
            'msRequestFullscreen'
        ];
        
        try {
            for (let method of requestMethods) {
                if (elem[method]) {
                    elem[method]().catch(error => {
                        log('Fullscreen request failed:', error.message);
                        // Non salvare lo stato se la richiesta fallisce
                        return;
                    });
                    break;
                }
            }
            
            saveState(true);
            log('Entering fullscreen');
        } catch (error) {
            log('Fullscreen error:', error.message);
        }
    }
    
    function exit() {
        const exitMethods = [
            'exitFullscreen',
            'mozCancelFullScreen',
            'webkitExitFullscreen',
            'msExitFullscreen'
        ];
        
        for (let method of exitMethods) {
            if (document[method]) {
                document[method]();
                break;
            }
        }
        
        saveState(false);
        log('Exiting fullscreen');
    }
    
    function isFullscreen() {
        return !!(
            document.fullscreenElement || 
            document.mozFullScreenElement || 
            document.webkitFullscreenElement || 
            document.msFullscreenElement
        );
    }
    
    // ========================================
    // STATE MANAGEMENT
    // ========================================
    
    function saveState(isActive) {
        localStorage.setItem(config.STORAGE_KEY, isActive ? 'true' : 'false');
        state.isActive = isActive;
        log('State saved:', isActive);
    }
    
    function checkSavedState() {
        // Disabilitato il ripristino automatico del fullscreen per evitare errori di permessi
        // Il fullscreen deve essere sempre iniziato da un'azione dell'utente
        const savedState = localStorage.getItem(config.STORAGE_KEY);
        log('Saved fullscreen state found:', savedState, '(auto-restore disabled)');
        
        // Se era in fullscreen, aggiorna solo l'UI del bottone senza tentare di entrare
        if (savedState === 'true') {
            log('Previous fullscreen state detected, but not auto-restoring (requires user gesture)');
        }
    }
    
    function checkSavedStateWithoutAutoEnter() {
        const savedState = localStorage.getItem(config.STORAGE_KEY);
        log('Saved fullscreen state found:', savedState, '(will not auto-enter)');
        
        // Simply log the state without any action
        if (savedState === 'true') {
            log('Previous fullscreen state detected - user can manually enable if desired');
            // Update button UI to indicate previous state
            state.isActive = false; // Always start inactive
        }
    }
    
    function showRestorePrompt() {
        // Rimuovi prompt esistente se presente
        if (state.promptElement && state.promptElement.parentNode) {
            state.promptElement.remove();
        }
        
        // Crea toast notification
        const prompt = document.createElement('div');
        prompt.className = 'toast show align-items-center text-white bg-primary border-0';
        prompt.setAttribute('role', 'alert');
        prompt.setAttribute('aria-live', 'assertive');
        prompt.setAttribute('aria-atomic', 'true');
        prompt.id = 'fullscreenPrompt';
        prompt.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            z-index: 10001;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            animation: slideInRight 0.3s ease-out;
        `;
        
        prompt.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-expand me-2"></i>
                    Vuoi ripristinare la modalità schermo intero?
                </div>
                <div class="me-2 m-auto">
                    <button type="button" class="btn btn-sm btn-light me-1" id="fullscreenYes">
                        Sì
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" id="fullscreenNo">
                        No
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(prompt);
        state.promptElement = prompt;
        
        // Gestione click Sì
        const yesBtn = document.getElementById('fullscreenYes');
        if (yesBtn) {
            yesBtn.addEventListener('click', function() {
                enter();
                removePrompt();
                sessionStorage.setItem(config.PROMPT_KEY, 'true');
            });
        }
        
        // Gestione click No
        const noBtn = document.getElementById('fullscreenNo');
        if (noBtn) {
            noBtn.addEventListener('click', function() {
                saveState(false);
                removePrompt();
                sessionStorage.setItem(config.PROMPT_KEY, 'true');
            });
        }
        
        // Auto-remove dopo timeout
        setTimeout(() => {
            removePrompt();
        }, config.PROMPT_TIMEOUT);
        
        log('Restore prompt shown');
    }
    
    function removePrompt() {
        if (state.promptElement && state.promptElement.parentNode) {
            state.promptElement.style.transition = 'opacity 0.3s';
            state.promptElement.style.opacity = '0';
            setTimeout(() => {
                if (state.promptElement && state.promptElement.parentNode) {
                    state.promptElement.remove();
                    state.promptElement = null;
                }
            }, config.ANIMATION_DURATION);
        }
    }
    
    // ========================================
    // EVENT HANDLERS
    // ========================================
    
    function handleFullscreenChange() {
        const isFullscreenNow = isFullscreen();
        saveState(isFullscreenNow);
        updateUI();
        
        // Notifica cambio stato
        showNotification(
            isFullscreenNow ? 
                'Modalità schermo intero attivata' : 
                'Modalità schermo intero disattivata',
            'info'
        );
        
        // Emetti evento
        emitEvent('fullscreen:change', { isFullscreen: isFullscreenNow });
        
        log('Fullscreen state changed:', isFullscreenNow);
    }
    
    // ========================================
    // UI UPDATES
    // ========================================
    
    function updateUI() {
        if (!state.button) return;
        
        const isFullscreenNow = isFullscreen();
        const icon = state.button.querySelector('i');
        
        if (isFullscreenNow) {
            if (icon) {
                icon.className = 'fas fa-compress';
            }
            state.button.title = 'Esci da schermo intero (F11)';
            state.button.classList.remove('btn-outline-secondary');
            state.button.classList.add('btn-primary');
        } else {
            if (icon) {
                icon.className = 'fas fa-expand';
            }
            state.button.title = 'Schermo intero (F11)';
            state.button.classList.remove('btn-primary');
            state.button.classList.add('btn-outline-secondary');
            
            // Se fullscreen era attivo, evidenzia il pulsante
            const savedState = localStorage.getItem(config.STORAGE_KEY);
            if (savedState === 'true') {
                addPulseAnimation();
            }
        }
    }
    
    function addPulseAnimation() {
        if (!state.button) return;
        
        state.button.classList.add('pulse-animation');
        setTimeout(() => {
            if (state.button) {
                state.button.classList.remove('pulse-animation');
            }
        }, 3000);
    }
    
    // ========================================
    // NOTIFICATIONS
    // ========================================
    
    function showNotification(message, type = 'info') {
        // Usa TalonApp se disponibile
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast(message, type);
            return;
        }
        
        // Usa TalonNotifications se disponibile
        if (window.TalonNotifications && window.TalonNotifications.show) {
            window.TalonNotifications.show(message, type);
            return;
        }
        
        // Log fallback
        log(message);
    }
    
    // ========================================
    // STYLES
    // ========================================
    
    function injectStyles() {
        if (document.getElementById('fullscreen-manager-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'fullscreen-manager-styles';
        style.textContent = `
            @keyframes pulse {
                0% {
                    box-shadow: 0 0 0 0 rgba(13, 110, 253, 0.7);
                }
                70% {
                    box-shadow: 0 0 0 10px rgba(13, 110, 253, 0);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(13, 110, 253, 0);
                }
            }
            
            .pulse-animation {
                animation: pulse 1.5s infinite;
            }
            
            #fullscreenPrompt {
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
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
    
    window.TalonFullscreen = {
        // Core methods
        init: init,
        cleanup: cleanup,
        toggle: toggle,
        enter: enter,
        exit: exit,
        
        // State methods
        isFullscreen: isFullscreen,
        isInitialized: () => state.isInitialized,
        
        // Force methods
        forceFullscreen: function() {
            if (!isFullscreen()) {
                enter();
            }
        },
        
        forceExit: function() {
            if (isFullscreen()) {
                exit();
            }
        },
        
        // Configuration
        getConfig: () => ({ ...config }),
        setDebug: (value) => { config.DEBUG = value; },
        
        // Version
        version: '2.0.0'
    };
    
    // ========================================
    // SPA INTEGRATION
    // ========================================
    
    // Inizializza stili una volta sola
    injectStyles();
    
    // Listener per eventi SPA
    if (window.TalonApp) {
        // Usa eventi TalonApp se disponibile
        window.TalonApp.on('content:loaded', init);
        window.TalonApp.on('navigation:start', () => {
            // Rimuovi solo prompt, non fare cleanup completo
            removePrompt();
        });
    } else {
        // Fallback su eventi custom
        document.addEventListener('spa:content-loaded', init);
        document.addEventListener('spa:navigation-start', () => {
            removePrompt();
        });
    }
    
    // Auto-inizializzazione per primo caricamento
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Add extra delay to ensure all SPA components are loaded
            setTimeout(init, 200);
        });
    } else {
        // Inizializza con delay per assicurare che DOM sia pronto
        setTimeout(init, 200);
    }
    
    log('Module loaded v' + window.TalonFullscreen.version + ' (SPA Ready)');
    
})(window, document);