/**
 * ========================================
 * TALON - ATTIVITÀ UTILS (SPA VERSION)
 * File: static/js/attivita_utils.js
 * 
 * Versione: 2.0.0 - Utility condivise
 * Funzionalità comuni per tutti i moduli attività
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        NOTIFICATION_DURATION: 3000,
        ANIMATION_DURATION: 300,
        DEBOUNCE_DELAY: 300,
        DEBUG: window.TALON_CONFIG?.debug?.enabled || false
    };

    // ========================================
    // LOGGING
    // ========================================
    
    function log(module, level, ...args) {
        if (!CONFIG.DEBUG) return;
        
        const styles = {
            info: 'color: #17a2b8',
            success: 'color: #28a745',
            warn: 'color: #ffc107',
            error: 'color: #dc3545',
            debug: 'color: #6c757d'
        };
        
        // console.log removed for production silence
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function debounce(func, wait = CONFIG.DEBOUNCE_DELAY) {
        let timeout;
        return function executedFunction(...args) {
            const context = this;
            const later = () => {
                clearTimeout(timeout);
                func.apply(context, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, m => map[m]);
    }

    function formatDate(date, format = 'DD/MM/YYYY') {
        if (!date) return 'N/D';
        const d = new Date(date);
        
        if (format === 'DD/MM/YYYY') {
            return d.toLocaleDateString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }
        
        return d.toLocaleDateString('it-IT');
    }

    function parseITDate(dateStr) {
        if (!dateStr) return null;
        
        // Formato DD/MM/YYYY
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        
        return new Date(year, month, day);
    }

    function calculateDuration(startDate, endDate) {
        if (!startDate) return 'N/D';
        
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date();
        
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Oggi';
        if (diffDays === 1) return '1 giorno';
        if (diffDays < 30) return `${diffDays} giorni`;
        return `${Math.floor(diffDays / 30)} mesi`;
    }

    // ========================================
    // NOTIFICHE
    // ========================================
    
    let notificationTimeout = null;
    let notificationContainer = null;

    function showNotification(message, type = 'info', duration = CONFIG.NOTIFICATION_DURATION) {
        // Usa TalonApp se disponibile
        if (window.TalonApp?.showToast) {
            window.TalonApp.showToast(message, type);
            return;
        }

        // Crea container se non esiste
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'talon-notifications';
            notificationContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
            `;
            document.body.appendChild(notificationContainer);
        }

        // Rimuovi notifiche esistenti
        notificationContainer.innerHTML = '';

        // Crea notifica
        const notification = document.createElement('div');
        notification.className = `alert alert-${getBootstrapType(type)} alert-dismissible fade show`;
        notification.setAttribute('role', 'alert');
        
        notification.innerHTML = `
            ${getIcon(type)} ${escapeHtml(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        notificationContainer.appendChild(notification);

        // Auto-rimuovi dopo duration
        clearTimeout(notificationTimeout);
        notificationTimeout = setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }

    function getBootstrapType(type) {
        const typeMap = {
            'success': 'success',
            'error': 'danger',
            'warn': 'warning',
            'info': 'info'
        };
        return typeMap[type] || 'info';
    }

    function getIcon(type) {
        const icons = {
            'success': '<i class="fas fa-check-circle me-2"></i>',
            'error': '<i class="fas fa-exclamation-circle me-2"></i>',
            'warn': '<i class="fas fa-exclamation-triangle me-2"></i>',
            'info': '<i class="fas fa-info-circle me-2"></i>'
        };
        return icons[type] || icons.info;
    }

    // ========================================
    // LOADER
    // ========================================
    
    let loaderElement = null;

    function showLoader(message = 'Caricamento in corso...') {
        hideLoader(); // Rimuovi loader esistente
        
        loaderElement = document.createElement('div');
        loaderElement.className = 'talon-loader';
        loaderElement.innerHTML = `
            <div class="talon-loader-overlay">
                <div class="talon-loader-content">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-3 mb-0">${escapeHtml(message)}</p>
                </div>
            </div>
        `;
        
        // Inietta stili se necessario
        injectLoaderStyles();
        
        document.body.appendChild(loaderElement);
    }

    function hideLoader() {
        if (loaderElement && loaderElement.parentNode) {
            loaderElement.remove();
            loaderElement = null;
        }
    }

    function injectLoaderStyles() {
        if (document.getElementById('talon-loader-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'talon-loader-styles';
        style.textContent = `
            .talon-loader-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }
            .talon-loader-content {
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }

    // ========================================
    // DIALOG
    // ========================================
    
    async function showConfirmDialog(title, message, options = {}) {
        // Usa Bootstrap Modal se disponibile
        if (window.bootstrap?.Modal) {
            return showBootstrapConfirm(title, message, options);
        }
        
        // Fallback su confirm nativo
        return window.confirm(`${title}\n\n${message}`);
    }

    function showBootstrapConfirm(title, message, options = {}) {
        return new Promise((resolve) => {
            const modalId = 'talon-confirm-modal';
            
            // Rimuovi modal esistente
            const existingModal = document.getElementById(modalId);
            if (existingModal) existingModal.remove();
            
            const modalHtml = `
                <div class="modal fade" id="${modalId}" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${escapeHtml(title)}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p>${escapeHtml(message)}</p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    ${options.cancelText || 'Annulla'}
                                </button>
                                <button type="button" class="btn btn-${options.confirmClass || 'primary'}" id="${modalId}-confirm">
                                    ${options.confirmText || 'Conferma'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            const modalElement = document.getElementById(modalId);
            const modal = new bootstrap.Modal(modalElement);
            
            // Handler conferma
            document.getElementById(`${modalId}-confirm`).addEventListener('click', () => {
                modal.hide();
                resolve(true);
            });
            
            // Handler chiusura
            modalElement.addEventListener('hidden.bs.modal', () => {
                modalElement.remove();
                resolve(false);
            });
            
            modal.show();
        });
    }

    // ========================================
    // EVENT MANAGEMENT
    // ========================================
    
    class EventManager {
        constructor() {
            this.handlers = new Map();
        }

        add(element, event, handler, options = {}) {
            if (!element) return;
            
            element.addEventListener(event, handler, options);
            
            // Salva per cleanup
            if (!this.handlers.has(element)) {
                this.handlers.set(element, []);
            }
            this.handlers.get(element).push([event, handler, options]);
        }

        removeAll() {
            this.handlers.forEach((handlers, element) => {
                handlers.forEach(([event, handler, options]) => {
                    element.removeEventListener(event, handler, options);
                });
            });
            this.handlers.clear();
        }

        removeElement(element) {
            const handlers = this.handlers.get(element);
            if (handlers) {
                handlers.forEach(([event, handler, options]) => {
                    element.removeEventListener(event, handler, options);
                });
                this.handlers.delete(element);
            }
        }
    }

    // ========================================
    // STATO ATTIVITÀ
    // ========================================
    
    const ACTIVITY_STATUS = {
        PIANIFICATA: { 
            label: 'Pianificata', 
            icon: 'fa-calendar', 
            color: '#6c757d'
        },
        IN_CORSO: { 
            label: 'In Corso', 
            icon: 'fa-play-circle', 
            color: '#ffc107'
        },
        COMPLETATA: { 
            label: 'Completata', 
            icon: 'fa-check-circle', 
            color: '#28a745'
        }
    };

    function getActivityStatus(activity) {
        if (!activity.data_inizio) {
            return 'PIANIFICATA';
        }
        
        const now = new Date();
        const startDate = new Date(activity.data_inizio);
        const endDate = activity.data_fine ? new Date(activity.data_fine) : null;
        
        if (endDate && now > endDate) {
            return 'COMPLETATA';
        } else if (now >= startDate) {
            return 'IN_CORSO';
        } else {
            return 'PIANIFICATA';
        }
    }

    function getTotalPersonale(activity) {
        return (activity.personale_ufficiali || 0) +
               (activity.personale_sottufficiali || 0) +
               (activity.personale_graduati || 0) +
               (activity.personale_civili || 0);
    }

    // ========================================
    // NAVIGAZIONE SPA
    // ========================================
    
    function navigateTo(href) {
        // Usa TalonApp per navigazione SPA se disponibile
        if (window.TalonApp?.navigate) {
            window.TalonApp.navigate(href);
        } else {
            window.location.href = href;
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

    // ========================================
    // LOCAL STORAGE
    // ========================================
    
    function saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Errore salvataggio localStorage:', e);
            return false;
        }
    }

    function loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Errore lettura localStorage:', e);
            return null;
        }
    }

    function removeFromStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('Errore rimozione localStorage:', e);
            return false;
        }
    }

    // ========================================
    // API PUBBLICA
    // ========================================
    
    window.TalonAttivitaUtils = {
        // Configurazione
        CONFIG,
        
        // Logging
        log,
        
        // Utility
        debounce,
        escapeHtml,
        formatDate,
        parseITDate,
        calculateDuration,
        
        // UI Feedback
        showNotification,
        showSuccess: (msg, duration) => showNotification(msg, 'success', duration),
        showError: (msg, duration) => showNotification(msg, 'error', duration || 5000),
        showWarning: (msg, duration) => showNotification(msg, 'warn', duration),
        showInfo: (msg, duration) => showNotification(msg, 'info', duration),
        
        // Loader
        showLoader,
        hideLoader,
        
        // Dialog
        showConfirmDialog,
        
        // Event Management
        EventManager,
        
        // Stato Attività
        ACTIVITY_STATUS,
        getActivityStatus,
        getTotalPersonale,
        
        // Navigazione
        navigateTo,
        emitEvent,
        
        // Storage
        storage: {
            save: saveToStorage,
            load: loadFromStorage,
            remove: removeFromStorage
        },
        
        // Versione
        version: '2.0.0'
    };


})(window, document);