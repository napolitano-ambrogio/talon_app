/**
 * ========================================
 * TALON ROLE MANAGER - SPA VERSION
 * File: static/js/sidebar-role-manager.js
 * 
 * Versione: 2.0.0 - Full SPA Integration
 * Funzionalità: Utility avanzate per gestione ruoli,
 *               controlli permessi e integrazioni DOM
 *               con supporto completo SPA
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE E COSTANTI
    // ========================================
    
    const CONFIG = {
        // SPA Configuration
        SPA: {
            ENABLED: true,
            CLEANUP_ON_NAVIGATION: true,
            REINIT_ON_CONTENT_LOADED: true,
            DEBUG: false
        },
        
        // Roles Configuration
        ROLES: {
            'ADMIN': {
                level: 100,
                label: 'Amministratore',
                color: '#dc3545',
                icon: '👨‍💼',
                permissions: ['*'] // Tutti i permessi
            },
            'OPERATORE': {
                level: 50,
                label: 'Operatore',
                color: '#fd7e14',
                icon: '👷',
                permissions: ['view', 'create', 'edit', 'report']
            },
            'VISUALIZZATORE': {
                level: 10,
                label: 'Visualizzatore',
                color: '#0d6efd',
                icon: '👁️',
                permissions: ['view', 'report']
            },
            'GUEST': {
                level: 0,
                label: 'Ospite',
                color: '#6c757d',
                icon: '👤',
                permissions: []
            }
        },
        
        // Permissions
        PERMISSIONS: {
            'view': 'Visualizzare contenuti',
            'create': 'Creare nuovi elementi',
            'edit': 'Modificare elementi esistenti',
            'delete': 'Eliminare elementi',
            'report': 'Generare report',
            'admin': 'Accesso amministrativo'
        },
        
        // DOM Selectors
        SELECTORS: {
            roleElements: '[data-min-role], [data-requires-role], [data-admin-only], [data-operatore-plus], [data-visualizzatore-hidden]',
            permissionElements: '[data-requires-permission], [data-requires-permissions]',
            actionButtons: 'button[data-action], .btn[data-action], a[data-action]',
            forms: 'form:not(.search-form):not(.filter-form)',
            deleteButtons: '.btn-danger, .btn-elimina, button[data-action="delete"], button[name*="delete"], button[name*="elimina"]',
            editButtons: '.btn-warning, .btn-modifica, button[data-action="edit"], button[data-action="update"]',
            createButtons: '.btn-success, button[data-action="create"], button[data-action="new"]'
        },
        
        // UI Configuration
        UI: {
            DEBOUNCE_DELAY: 300,
            TOOLTIP_DURATION: 3000,
            ANIMATION_DURATION: 300
        }
    };

    // ========================================
    // CLASSE TALON ROLE MANAGER
    // ========================================
    
    class TalonRoleManager {
        constructor() {
            // State
            this.state = {
                initialized: false,
                currentRole: null,
                roleConfig: null,
                roleLevel: 0,
                sidebarAPI: null
            };
            
            // DOM Elements cache
            this.elementCache = new Map();
            
            // Observers
            this.observers = [];
            this.observerTimeout = null;
            
            // Event handlers for cleanup
            this.eventHandlers = new Map();
            this.timers = new Set();
            
            // Bind methods
            this.handleSPANavigation = this.handleSPANavigation.bind(this);
            this.handleSPACleanup = this.handleSPACleanup.bind(this);
            this.handleMutations = this.handleMutations.bind(this);
            this.handleDisabledClick = this.handleDisabledClick.bind(this);
        }

        // ========================================
        // INIZIALIZZAZIONE E CLEANUP
        // ========================================
        
        async init() {
            if (this.state.initialized) {
                this.log('warn', 'Already initialized');
                return;
            }
            
            this.log('info', 'Initializing Role Manager (SPA Version)...');
            
            try {
                // Attendi sidebar API se disponibile
                await this.waitForSidebar();
                
                // Rileva ruolo corrente
                this.detectCurrentRole();
                
                // Applica controlli globali
                this.applyGlobalRoleControls();
                
                // Setup observers
                this.initializeObservers();
                
                // Setup event delegation
                this.setupEventDelegation();
                
                // Setup SPA integration
                this.setupSPAIntegration();
                
                // Aggiungi classi CSS
                this.addCSSClasses();
                
                // Aggiungi tooltip handler
                this.initializeTooltips();
                
                this.state.initialized = true;
                this.log('success', '✅ Role Manager initialized');
                
                // Emit evento ready
                this.emitEvent('roleManager:ready', {
                    role: this.state.currentRole,
                    permissions: this.getPermissions()
                });
                
                return true;
                
            } catch (error) {
                this.log('error', 'Initialization failed:', error);
                return false;
            }
        }

        cleanup() {
            this.log('info', 'Cleaning up Role Manager...');
            
            // Rimuovi observers
            this.disconnectObservers();
            
            // Clear timers
            this.clearAllTimers();
            
            // Rimuovi event handlers
            this.removeAllEventHandlers();
            
            // Clear cache
            this.elementCache.clear();
            
            // Reset state
            this.state.initialized = false;
            
            this.log('success', '✅ Role Manager cleanup completed');
        }

        destroy() {
            this.cleanup();
            
            // Rimuovi SPA listeners
            this.removeSPAIntegration();
            
            // Rimuovi classi CSS
            this.removeCSSClasses();
            
            // Rimuovi tooltip
            this.hideTooltip();
            
            // Emit evento destroy
            this.emitEvent('roleManager:destroyed');
            
            this.log('info', 'Role Manager destroyed');
        }

        // ========================================
        // GESTIONE RUOLI
        // ========================================
        
        async waitForSidebar() {
            let attempts = 0;
            const maxAttempts = 50; // 5 secondi max
            
            while (!window.sidebarAPI && attempts < maxAttempts) {
                await this.delay(100);
                attempts++;
            }
            
            if (window.sidebarAPI) {
                this.state.sidebarAPI = window.sidebarAPI;
                this.log('debug', 'Sidebar API found');
            } else {
                this.log('warn', 'Sidebar API not found, limited functionality');
            }
        }

        detectCurrentRole() {
            // Usa sidebar API se disponibile
            if (this.state.sidebarAPI) {
                this.state.currentRole = this.state.sidebarAPI.getCurrentRole();
            } else {
                // Fallback detection
                this.state.currentRole = this.detectRoleFallback();
            }
            
            this.state.roleConfig = CONFIG.ROLES[this.state.currentRole] || CONFIG.ROLES.GUEST;
            this.state.roleLevel = this.state.roleConfig.level;
            
            this.log('info', `Role detected: ${this.state.currentRole} (level: ${this.state.roleLevel})`);
        }

        detectRoleFallback() {
            // Prova vari metodi in ordine di priorità
            const methods = [
                () => window.FLASK_USER_ROLE,
                () => window.userRole,
                () => window.TALON_USER_ROLE,
                () => document.querySelector('meta[name="user-role"]')?.content,
                () => document.body.getAttribute('data-user-role'),
                () => document.getElementById('hidden-user-role')?.value,
                () => sessionStorage.getItem('userRole')
            ];
            
            for (let method of methods) {
                try {
                    const role = method();
                    if (role && CONFIG.ROLES[role]) {
                        return role;
                    }
                } catch (e) {
                    // Ignora errori
                }
            }
            
            return 'GUEST';
        }

        // ========================================
        // CONTROLLI GLOBALI
        // ========================================
        
        applyGlobalRoleControls() {
            this.log('debug', 'Applying global role controls...');
            
            // Applica a elementi con attributi ruolo
            this.applyRoleVisibility();
            
            // Applica a elementi con permessi
            this.applyPermissionControls();
            
            // Applica a form
            this.applyFormRestrictions();
            
            // Applica a bottoni specifici
            this.applyButtonRestrictions();
            
            this.log('debug', 'Global role controls applied');
        }

        applyRoleVisibility() {
            const elements = this.querySelectorAllCached(CONFIG.SELECTORS.roleElements);
            let hiddenCount = 0;
            let visibleCount = 0;
            
            elements.forEach(element => {
                const shouldShow = this.evaluateRoleRequirement(element);
                
                if (shouldShow) {
                    this.showElement(element);
                    visibleCount++;
                } else {
                    this.hideElement(element, this.getRoleRequirementReason(element));
                    hiddenCount++;
                }
            });
            
            this.log('debug', `Role visibility - Hidden: ${hiddenCount}, Visible: ${visibleCount}`);
        }

        evaluateRoleRequirement(element) {
            const userLevel = this.state.roleLevel;
            
            // data-min-role
            const minRole = element.getAttribute('data-min-role');
            if (minRole) {
                const minLevel = CONFIG.ROLES[minRole]?.level || 100;
                if (userLevel < minLevel) return false;
            }
            
            // data-requires-role
            const requiresRole = element.getAttribute('data-requires-role');
            if (requiresRole) {
                const requiredRoles = requiresRole.split(',').map(r => r.trim());
                if (!requiredRoles.includes(this.state.currentRole)) return false;
            }
            
            // data-admin-only
            if (element.hasAttribute('data-admin-only') && this.state.currentRole !== 'ADMIN') {
                return false;
            }
            
            // data-operatore-plus
            if (element.hasAttribute('data-operatore-plus') && 
                this.state.currentRole !== 'ADMIN' && this.state.currentRole !== 'OPERATORE') {
                return false;
            }
            
            // data-visualizzatore-hidden
            if (element.hasAttribute('data-visualizzatore-hidden') && 
                this.state.currentRole === 'VISUALIZZATORE') {
                return false;
            }
            
            return true;
        }

        getRoleRequirementReason(element) {
            if (element.getAttribute('data-min-role')) {
                return `Richiede ruolo minimo: ${element.getAttribute('data-min-role')}`;
            }
            if (element.getAttribute('data-requires-role')) {
                return `Richiede uno dei ruoli: ${element.getAttribute('data-requires-role')}`;
            }
            if (element.hasAttribute('data-admin-only')) {
                return 'Solo per amministratori';
            }
            if (element.hasAttribute('data-operatore-plus')) {
                return 'Richiede ruolo Operatore o superiore';
            }
            if (element.hasAttribute('data-visualizzatore-hidden')) {
                return 'Non disponibile per Visualizzatore';
            }
            return 'Ruolo insufficiente';
        }

        applyPermissionControls() {
            const elements = this.querySelectorAllCached(CONFIG.SELECTORS.permissionElements);
            
            elements.forEach(element => {
                const required = element.getAttribute('data-requires-permission') || 
                               element.getAttribute('data-requires-permissions');
                
                if (!required) return;
                
                const permissions = required.split(',').map(p => p.trim());
                const hasPermission = this.hasAllPermissions(permissions);
                
                if (!hasPermission) {
                    this.disableElement(element, `Permessi richiesti: ${permissions.join(', ')}`);
                } else {
                    this.enableElement(element);
                }
            });
        }

        hasAllPermissions(permissions) {
            const userPermissions = this.state.roleConfig.permissions;
            
            // Admin ha tutti i permessi
            if (userPermissions.includes('*')) return true;
            
            return permissions.every(perm => userPermissions.includes(perm));
        }

        hasAnyPermission(permissions) {
            const userPermissions = this.state.roleConfig.permissions;
            
            // Admin ha tutti i permessi
            if (userPermissions.includes('*')) return true;
            
            return permissions.some(perm => userPermissions.includes(perm));
        }

        applyFormRestrictions() {
            if (this.state.currentRole === 'VISUALIZZATORE') {
                const forms = this.querySelectorAllCached(CONFIG.SELECTORS.forms);
                
                forms.forEach(form => {
                    this.makeFormReadonly(form);
                });
                
                this.log('debug', `${forms.length} forms made read-only`);
            } else if (this.state.currentRole === 'OPERATORE') {
                // Operatore può modificare ma non eliminare
                const forms = this.querySelectorAllCached(CONFIG.SELECTORS.forms);
                
                forms.forEach(form => {
                    this.enableFormWithRestrictions(form);
                });
            }
        }

        makeFormReadonly(form) {
            // Disabilita tutti gli input
            form.querySelectorAll('input, textarea, select').forEach(field => {
                field.setAttribute('readonly', 'readonly');
                field.setAttribute('disabled', 'disabled');
                field.style.cursor = 'not-allowed';
                field.style.backgroundColor = '#e9ecef';
            });
            
            // Nascondi bottoni submit
            form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(btn => {
                this.hideElement(btn, 'Non disponibile in modalità lettura');
            });
            
            // Aggiungi overlay
            form.classList.add('readonly-form');
            form.setAttribute('data-readonly-reason', 'Accesso in sola lettura');
        }

        enableFormWithRestrictions(form) {
            // Abilita la maggior parte dei campi
            form.querySelectorAll('input, textarea, select').forEach(field => {
                field.removeAttribute('readonly');
                field.removeAttribute('disabled');
                field.style.cursor = '';
                field.style.backgroundColor = '';
            });
            
            // Ma nascondi bottoni di eliminazione
            form.querySelectorAll(CONFIG.SELECTORS.deleteButtons).forEach(btn => {
                this.hideElement(btn, 'Solo amministratori possono eliminare');
            });
        }

        applyButtonRestrictions() {
            // Bottoni eliminazione - solo ADMIN
            if (this.state.currentRole !== 'ADMIN') {
                this.querySelectorAllCached(CONFIG.SELECTORS.deleteButtons).forEach(btn => {
                    this.hideElement(btn, 'Solo amministratori possono eliminare');
                });
            }
            
            // Bottoni modifica - ADMIN e OPERATORE
            if (!['ADMIN', 'OPERATORE'].includes(this.state.currentRole)) {
                this.querySelectorAllCached(CONFIG.SELECTORS.editButtons).forEach(btn => {
                    this.disableElement(btn, 'Permesso di modifica richiesto');
                });
            }
            
            // Bottoni creazione - ADMIN e OPERATORE
            if (!['ADMIN', 'OPERATORE'].includes(this.state.currentRole)) {
                this.querySelectorAllCached(CONFIG.SELECTORS.createButtons).forEach(btn => {
                    this.disableElement(btn, 'Permesso di creazione richiesto');
                });
            }
        }

        // ========================================
        // GESTIONE ELEMENTI DOM
        // ========================================
        
        hideElement(element, reason = '') {
            element.style.display = 'none';
            element.setAttribute('aria-hidden', 'true');
            element.setAttribute('data-role-hidden', 'true');
            if (reason) {
                element.setAttribute('data-disabled-reason', reason);
            }
        }

        showElement(element) {
            element.style.display = '';
            element.removeAttribute('aria-hidden');
            element.removeAttribute('data-role-hidden');
            element.removeAttribute('data-disabled-reason');
        }

        disableElement(element, reason = '') {
            if (element.tagName === 'BUTTON' || element.tagName === 'INPUT') {
                element.disabled = true;
            }
            element.style.opacity = '0.5';
            element.style.pointerEvents = 'none';
            element.style.cursor = 'not-allowed';
            element.setAttribute('data-role-disabled', 'true');
            if (reason) {
                element.setAttribute('data-disabled-reason', reason);
                element.setAttribute('title', reason);
            }
        }

        enableElement(element) {
            if (element.tagName === 'BUTTON' || element.tagName === 'INPUT') {
                element.disabled = false;
            }
            element.style.opacity = '';
            element.style.pointerEvents = '';
            element.style.cursor = '';
            element.removeAttribute('data-role-disabled');
            element.removeAttribute('data-disabled-reason');
            element.removeAttribute('title');
        }

        // ========================================
        // OBSERVERS
        // ========================================
        
        initializeObservers() {
            if (!window.MutationObserver) return;
            
            const observer = new MutationObserver(this.handleMutations);
            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-min-role', 'data-requires-role', 'data-requires-permission']
            });
            
            this.observers.push(observer);
            this.log('debug', 'DOM observer initialized');
        }

        handleMutations(mutations) {
            // Debounce per evitare troppe esecuzioni
            this.clearTimer(this.observerTimeout);
            this.observerTimeout = this.addTimer(setTimeout(() => {
                // Controlla solo i nuovi elementi aggiunti
                const newElements = new Set();
                
                mutations.forEach(mutation => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) { // Element node
                                newElements.add(node);
                                // Aggiungi anche i discendenti
                                if (node.querySelectorAll) {
                                    node.querySelectorAll('*').forEach(child => {
                                        newElements.add(child);
                                    });
                                }
                            }
                        });
                    } else if (mutation.type === 'attributes') {
                        newElements.add(mutation.target);
                    }
                });
                
                // Applica controlli solo ai nuovi elementi
                newElements.forEach(element => {
                    this.applyRoleControlsToElement(element);
                });
                
            }, CONFIG.UI.DEBOUNCE_DELAY));
        }

        applyRoleControlsToElement(element) {
            // Verifica se l'elemento ha attributi di ruolo
            if (element.matches && element.matches(CONFIG.SELECTORS.roleElements)) {
                const shouldShow = this.evaluateRoleRequirement(element);
                if (shouldShow) {
                    this.showElement(element);
                } else {
                    this.hideElement(element, this.getRoleRequirementReason(element));
                }
            }
            
            // Verifica permessi
            if (element.matches && element.matches(CONFIG.SELECTORS.permissionElements)) {
                const required = element.getAttribute('data-requires-permission') || 
                               element.getAttribute('data-requires-permissions');
                if (required) {
                    const permissions = required.split(',').map(p => p.trim());
                    const hasPermission = this.hasAllPermissions(permissions);
                    
                    if (!hasPermission) {
                        this.disableElement(element, `Permessi richiesti: ${permissions.join(', ')}`);
                    }
                }
            }
            
            // Verifica bottoni
            if (element.matches) {
                if (element.matches(CONFIG.SELECTORS.deleteButtons) && this.state.currentRole !== 'ADMIN') {
                    this.hideElement(element, 'Solo amministratori possono eliminare');
                } else if (element.matches(CONFIG.SELECTORS.editButtons) && 
                          !['ADMIN', 'OPERATORE'].includes(this.state.currentRole)) {
                    this.disableElement(element, 'Permesso di modifica richiesto');
                } else if (element.matches(CONFIG.SELECTORS.createButtons) && 
                          !['ADMIN', 'OPERATORE'].includes(this.state.currentRole)) {
                    this.disableElement(element, 'Permesso di creazione richiesto');
                }
            }
        }

        disconnectObservers() {
            this.observers.forEach(observer => observer.disconnect());
            this.observers = [];
        }

        // ========================================
        // EVENT DELEGATION
        // ========================================
        
        setupEventDelegation() {
            // Click su elementi disabilitati
            this.addEventHandler(
                document,
                'click',
                this.handleDisabledClick,
                true // useCapture per intercettare prima
            );
            
            // Hover per tooltip
            this.addEventHandler(
                document,
                'mouseenter',
                (e) => this.handleTooltipHover(e, true),
                true
            );
            
            this.addEventHandler(
                document,
                'mouseleave',
                (e) => this.handleTooltipHover(e, false),
                true
            );
        }

        handleDisabledClick(e) {
            // Fix: usa jQuery invece di closest() nativo per compatibilità
            const target = $(e.target).closest('[data-role-disabled], [data-role-hidden]')[0];
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                
                const reason = target.getAttribute('data-disabled-reason') || 'Accesso non autorizzato';
                this.showNotification(reason, 'warning');
            }
        }

        handleTooltipHover(e, isEntering) {
            // Fix: usa jQuery invece di closest() nativo per compatibilità
            const target = $(e.target).closest('[data-disabled-reason]')[0];
            if (!target) return;
            
            if (isEntering) {
                const reason = target.getAttribute('data-disabled-reason');
                if (reason) {
                    this.showTooltip(target, reason);
                }
            } else {
                this.hideTooltip();
            }
        }

        // ========================================
        // TOOLTIPS
        // ========================================
        
        initializeTooltips() {
            // I tooltip sono gestiti tramite event delegation
            this.log('debug', 'Tooltips initialized via event delegation');
        }

        showTooltip(element, text) {
            // Rimuovi tooltip esistente
            this.hideTooltip();
            
            const tooltip = document.createElement('div');
            tooltip.id = 'role-manager-tooltip';
            tooltip.className = 'role-manager-tooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: #333;
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 13px;
                z-index: 10000;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                max-width: 250px;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            tooltip.textContent = text;
            
            document.body.appendChild(tooltip);
            
            // Posiziona tooltip
            const rect = element.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 10;
            
            // Aggiusta se esce dallo schermo
            if (left < 10) {
                left = 10;
            }
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }
            if (top < 10) {
                // Mostra sotto l'elemento se non c'è spazio sopra
                top = rect.bottom + 10;
            }
            
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            
            // Fade in
            requestAnimationFrame(() => {
                tooltip.style.opacity = '1';
            });
        }

        hideTooltip() {
            const tooltip = document.getElementById('role-manager-tooltip');
            if (tooltip) {
                tooltip.style.opacity = '0';
                this.addTimer(setTimeout(() => {
                    tooltip.remove();
                }, 300));
            }
        }

        // ========================================
        // NOTIFICHE
        // ========================================
        
        showNotification(message, type = 'info') {
            // Usa API sidebar se disponibile
            if (this.state.sidebarAPI?.showToast) {
                this.state.sidebarAPI.showToast(message, type);
                return;
            }
            
            // Usa TalonApp se disponibile
            if (window.TalonApp?.showToast) {
                window.TalonApp.showToast(message, type);
                return;
            }
            
            // Fallback console
            this.log(type, message);
        }

        // ========================================
        // CSS CLASSES
        // ========================================
        
        addCSSClasses() {
            // Rimuovi classi ruolo esistenti
            Object.keys(CONFIG.ROLES).forEach(role => {
                document.body.classList.remove(`role-${role.toLowerCase()}`);
            });
            
            // Aggiungi classi attuali
            document.body.classList.add(`role-${this.state.currentRole.toLowerCase()}`);
            document.body.classList.add('role-manager-active');
            
            // Aggiungi CSS custom properties
            const roleConfig = CONFIG.ROLES[this.state.currentRole];
            if (roleConfig) {
                document.documentElement.style.setProperty('--role-color', roleConfig.color);
                document.documentElement.style.setProperty('--role-level', roleConfig.level);
            }
        }

        removeCSSClasses() {
            Object.keys(CONFIG.ROLES).forEach(role => {
                document.body.classList.remove(`role-${role.toLowerCase()}`);
            });
            document.body.classList.remove('role-manager-active');
            
            document.documentElement.style.removeProperty('--role-color');
            document.documentElement.style.removeProperty('--role-level');
        }

        // ========================================
        // SPA INTEGRATION
        // ========================================
        
        setupSPAIntegration() {
            if (window.TalonApp) {
                window.TalonApp.on('navigation:start', this.handleSPACleanup);
                window.TalonApp.on('content:loaded', this.handleSPANavigation);
            } else {
                document.addEventListener('spa:navigation-start', this.handleSPACleanup);
                document.addEventListener('spa:content-loaded', this.handleSPANavigation);
            }
        }

        removeSPAIntegration() {
            if (window.TalonApp) {
                window.TalonApp.off('navigation:start', this.handleSPACleanup);
                window.TalonApp.off('content:loaded', this.handleSPANavigation);
            } else {
                document.removeEventListener('spa:navigation-start', this.handleSPACleanup);
                document.removeEventListener('spa:content-loaded', this.handleSPANavigation);
            }
        }

        handleSPACleanup() {
            this.log('debug', 'SPA cleanup triggered');
            
            if (CONFIG.SPA.CLEANUP_ON_NAVIGATION) {
                // Cleanup parziale - mantieni configurazione
                this.hideTooltip();
                this.clearAllTimers();
                this.elementCache.clear();
            }
        }

        handleSPANavigation() {
            this.log('debug', 'SPA navigation detected');
            
            if (CONFIG.SPA.REINIT_ON_CONTENT_LOADED) {
                // Re-applica controlli al nuovo contenuto
                this.detectCurrentRole();
                this.applyGlobalRoleControls();
                
                this.log('debug', 'Role controls reapplied after navigation');
            }
        }

        // ========================================
        // UTILITY METHODS
        // ========================================
        
        querySelectorAllCached(selector) {
            // Cache per performance
            if (!this.elementCache.has(selector)) {
                this.elementCache.set(selector, document.querySelectorAll(selector));
            }
            return this.elementCache.get(selector);
        }

        addEventHandler(element, event, handler, useCapture = false) {
            element.addEventListener(event, handler, useCapture);
            
            if (!this.eventHandlers.has(element)) {
                this.eventHandlers.set(element, []);
            }
            
            this.eventHandlers.get(element).push({ event, handler, useCapture });
        }

        removeAllEventHandlers() {
            this.eventHandlers.forEach((handlers, element) => {
                handlers.forEach(({ event, handler, useCapture }) => {
                    element.removeEventListener(event, handler, useCapture);
                });
            });
            
            this.eventHandlers.clear();
        }

        addTimer(timer) {
            this.timers.add(timer);
            return timer;
        }

        clearTimer(timer) {
            if (timer) {
                clearTimeout(timer);
                this.timers.delete(timer);
            }
        }

        clearAllTimers() {
            this.timers.forEach(timer => clearTimeout(timer));
            this.timers.clear();
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        emitEvent(eventName, detail) {
            const event = new CustomEvent(eventName, {
                detail: detail,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
        }

        log(level, ...args) {
            if (!CONFIG.SPA.DEBUG && level === 'debug') return;
            
            const prefix = '[RoleManager]';
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
        // PUBLIC API
        // ========================================
        
        getPermissions() {
            return [...this.state.roleConfig.permissions];
        }

        hasPermission(permission) {
            return this.hasAllPermissions([permission]);
        }

        getCurrentRole() {
            return this.state.currentRole;
        }

        getRoleLevel() {
            return this.state.roleLevel;
        }

        getRoleConfig() {
            return { ...this.state.roleConfig };
        }

        updateRole(newRole) {
            // Usa sidebar API se disponibile
            if (this.state.sidebarAPI?.updateRole) {
                return this.state.sidebarAPI.updateRole(newRole);
            }
            
            // Fallback manuale
            if (!CONFIG.ROLES[newRole]) {
                this.log('error', `Invalid role: ${newRole}`);
                return false;
            }
            
            this.state.currentRole = newRole;
            this.state.roleConfig = CONFIG.ROLES[newRole];
            this.state.roleLevel = this.state.roleConfig.level;
            
            // Riapplica controlli
            this.applyGlobalRoleControls();
            this.addCSSClasses();
            
            this.showNotification(`Ruolo aggiornato: ${newRole}`, 'success');
            
            return true;
        }

        refresh() {
            this.detectCurrentRole();
            this.applyGlobalRoleControls();
            this.showNotification('Controlli ruolo aggiornati', 'info');
        }

        getDebugInfo() {
            return {
                role: {
                    name: this.state.currentRole,
                    level: this.state.roleLevel,
                    color: this.state.roleConfig.color
                },
                permissions: this.getPermissions(),
                stats: {
                    total: document.querySelectorAll(CONFIG.SELECTORS.roleElements).length,
                    hidden: document.querySelectorAll('[data-role-hidden="true"]').length,
                    disabled: document.querySelectorAll('[data-role-disabled="true"]').length,
                    readonlyForms: document.querySelectorAll('.readonly-form').length
                },
                cache: {
                    size: this.elementCache.size,
                    timers: this.timers.size,
                    handlers: this.eventHandlers.size,
                    observers: this.observers.length
                }
            };
        }

        showDebugInfo() {
            const info = this.getDebugInfo();
            console.group('🔍 Role Manager Debug Info');
            console.log('Role:', info.role);
            console.log('Permissions:', info.permissions);
            console.log('Statistics:', info.stats);
            console.log('Cache:', info.cache);
            console.log('Configuration:', CONFIG);
            console.groupEnd();
        }
    }

    // ========================================
    // MANAGER SINGLETON
    // ========================================
    
    class RoleManagerSingleton {
        constructor() {
            this.instance = null;
            this.initialized = false;
            
            // Auto-init su DOM ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                this.init();
            }
        }

        async init() {
            if (this.initialized) return;
            
            console.log('[RoleManager Singleton] Initializing...');
            
            // Inietta stili
            this.injectStyles();
            
            // Crea istanza
            await this.create();
            
            // Setup SPA listeners
            this.setupSPAListeners();
            
            this.initialized = true;
            console.log('[RoleManager Singleton] ✅ Ready');
        }

        setupSPAListeners() {
            if (window.TalonApp) {
                window.TalonApp.on('content:loaded', () => {
                    this.checkAndInitialize();
                });
            } else {
                document.addEventListener('spa:content-loaded', () => {
                    this.checkAndInitialize();
                });
            }
        }

        async checkAndInitialize() {
            if (!this.instance) {
                await this.create();
            } else if (this.instance.state.initialized) {
                // Refresh su nuova pagina
                this.instance.refresh();
            }
        }

        async create() {
            if (this.instance) {
                this.instance.destroy();
            }
            
            this.instance = new TalonRoleManager();
            await this.instance.init();
            
            return this.instance;
        }

        get() {
            return this.instance;
        }

        destroy() {
            if (this.instance) {
                this.instance.destroy();
                this.instance = null;
            }
        }

        injectStyles() {
            if (document.getElementById('role-manager-spa-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'role-manager-spa-styles';
            styles.textContent = `
                /* Role-based visibility */
                [data-role-hidden="true"] {
                    display: none !important;
                }
                
                [data-role-disabled="true"] {
                    opacity: 0.5 !important;
                    cursor: not-allowed !important;
                    pointer-events: none !important;
                }
                
                /* Readonly forms */
                .readonly-form {
                    position: relative;
                }
                
                .readonly-form::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(255, 255, 255, 0.5);
                    pointer-events: none;
                }
                
                /* Tooltip */
                .role-manager-tooltip {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.4;
                }
                
                /* Role-specific styles */
                body.role-admin {
                    --role-indicator: '👨‍💼';
                }
                
                body.role-operatore {
                    --role-indicator: '👷';
                }
                
                body.role-visualizzatore {
                    --role-indicator: '👁️';
                }
                
                body.role-guest {
                    --role-indicator: '👤';
                }
                
                /* Disabled elements with reason */
                [data-disabled-reason] {
                    position: relative;
                }
                
                [data-disabled-reason]:hover::after {
                    content: attr(data-disabled-reason);
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 8px 12px;
                    background: #333;
                    color: white;
                    font-size: 12px;
                    border-radius: 4px;
                    white-space: nowrap;
                    pointer-events: none;
                    z-index: 10000;
                    margin-bottom: 5px;
                }
                
                /* Admin-only elements */
                body:not(.role-admin) [data-admin-only] {
                    display: none !important;
                }
                
                /* Operatore+ elements */
                body:not(.role-admin):not(.role-operatore) [data-operatore-plus] {
                    display: none !important;
                }
                
                /* Visualizzatore hidden elements */
                body.role-visualizzatore [data-visualizzatore-hidden] {
                    display: none !important;
                }
            `;
            
            document.head.appendChild(styles);
        }
    }

    // ========================================
    // INIZIALIZZAZIONE E EXPORT
    // ========================================
    
    // Crea singleton manager
    const manager = new RoleManagerSingleton();
    
    // Export API globale
    window.TalonRoleManager = {
        // Manager methods
        getInstance: () => manager.get(),
        create: () => manager.create(),
        destroy: () => manager.destroy(),
        
        // Quick access API (proxy to instance)
        getCurrentRole: () => manager.get()?.getCurrentRole(),
        getRoleLevel: () => manager.get()?.getRoleLevel(),
        getPermissions: () => manager.get()?.getPermissions(),
        hasPermission: (perm) => manager.get()?.hasPermission(perm),
        
        // Actions
        refresh: () => manager.get()?.refresh(),
        updateRole: (role) => manager.get()?.updateRole(role),
        
        // Element control
        showElement: (el) => manager.get()?.showElement(el),
        hideElement: (el, reason) => manager.get()?.hideElement(el, reason),
        disableElement: (el, reason) => manager.get()?.disableElement(el, reason),
        enableElement: (el) => manager.get()?.enableElement(el),
        
        // Debug
        debug: () => manager.get()?.showDebugInfo(),
        getDebugInfo: () => manager.get()?.getDebugInfo(),
        
        // Info
        version: '2.0.0',
        isInitialized: () => manager.initialized,
        getConfig: () => ({ ...CONFIG })
    };
    
    // Aliases for backward compatibility
    window.RoleManagerAPI = window.TalonRoleManager;
    window.roleManager = manager.get();
    
    console.log('%c🛡️ Talon Role Manager v2.0.0 - SPA Ready', 
        'color: #fd7e14; font-weight: bold; font-size: 14px;');

})(window, document);