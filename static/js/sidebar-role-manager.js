/**
 * ========================================
 * TALON ROLE MANAGER - MODULO UTILITY
 * File: static/js/sidebar-role-manager.js
 * 
 * Versione: 1.2 - Ottimizzato
 * Funzionalità: Utility avanzate per gestione ruoli,
 *               controlli permessi e integrazioni DOM
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE E COSTANTI
    // ========================================
    
    const CONFIG = {
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
        
        PERMISSIONS: {
            'view': 'Visualizzare contenuti',
            'create': 'Creare nuovi elementi',
            'edit': 'Modificare elementi esistenti',
            'delete': 'Eliminare elementi',
            'report': 'Generare report',
            'admin': 'Accesso amministrativo'
        },
        
        SELECTORS: {
            roleElements: '[data-min-role], [data-requires-role], [data-admin-only], [data-operatore-plus], [data-visualizzatore-hidden]',
            permissionElements: '[data-requires-permission], [data-requires-permissions]',
            actionButtons: 'button[data-action], .btn[data-action], a[data-action]',
            forms: 'form:not(.search-form):not(.filter-form)',
            deleteButtons: '.btn-danger, .btn-elimina, button[data-action="delete"], button[name*="delete"], button[name*="elimina"]',
            editButtons: '.btn-warning, .btn-modifica, button[data-action="edit"], button[data-action="update"]',
            createButtons: '.btn-success, button[data-action="create"], button[data-action="new"]'
        }
    };

    // ========================================
    // CLASSE ROLE MANAGER
    // ========================================
    
    class TalonRoleManager {
        constructor() {
            this.currentRole = null;
            this.roleConfig = null;
            this.sidebarAPI = null;
            this.observers = [];
            this.initialized = false;
            
            // Auto-inizializza al DOMContentLoaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                this.init();
            }
        }

        /**
         * Inizializza il Role Manager
         */
        init() {
            console.log('[Role Manager] Inizializzazione...');
            
            // Attendi che sidebar.js sia caricato
            this.waitForSidebar().then(() => {
                this.detectCurrentRole();
                this.applyGlobalRoleControls();
                this.initializeObservers();
                this.setupEventDelegation();
                this.initializeDebugPanel();
                
                this.initialized = true;
                console.log('[Role Manager] ✅ Inizializzazione completata');
                
                // Emit evento custom
                this.emitEvent('roleManagerReady', {
                    role: this.currentRole,
                    permissions: this.getPermissions()
                });
            });
        }

        /**
         * Attende che la sidebar API sia disponibile
         */
        async waitForSidebar() {
            let attempts = 0;
            const maxAttempts = 50; // 5 secondi max
            
            while (!window.sidebarAPI && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (window.sidebarAPI) {
                this.sidebarAPI = window.sidebarAPI;
                console.log('[Role Manager] Sidebar API trovata');
            } else {
                console.warn('[Role Manager] Sidebar API non trovata, funzionalità limitata');
            }
        }

        /**
         * Rileva il ruolo corrente
         */
        detectCurrentRole() {
            // Usa sidebar API se disponibile
            if (this.sidebarAPI) {
                this.currentRole = this.sidebarAPI.getCurrentRole();
            } else {
                // Fallback detection
                this.currentRole = this.detectRoleFallback();
            }
            
            this.roleConfig = CONFIG.ROLES[this.currentRole] || CONFIG.ROLES.GUEST;
            console.log('[Role Manager] Ruolo rilevato:', this.currentRole, this.roleConfig);
        }

        /**
         * Rilevamento ruolo di fallback
         */
        detectRoleFallback() {
            // Prova vari metodi in ordine di priorità
            const methods = [
                () => window.FLASK_USER_ROLE,
                () => window.userRole,
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

        /**
         * Applica controlli ruolo globalmente
         */
        applyGlobalRoleControls() {
            console.log('[Role Manager] Applicazione controlli globali...');
            
            // Applica a elementi con attributi ruolo
            this.applyRoleVisibility();
            
            // Applica a elementi con permessi
            this.applyPermissionControls();
            
            // Applica a form
            this.applyFormRestrictions();
            
            // Applica a bottoni specifici
            this.applyButtonRestrictions();
            
            // Aggiungi indicatori visivi
            this.addVisualIndicators();
        }

        /**
         * Applica visibilità basata su ruolo
         */
        applyRoleVisibility() {
            const elements = document.querySelectorAll(CONFIG.SELECTORS.roleElements);
            let hiddenCount = 0;
            
            elements.forEach(element => {
                const shouldShow = this.evaluateRoleRequirement(element);
                
                if (shouldShow) {
                    this.showElement(element);
                } else {
                    this.hideElement(element, 'Ruolo insufficiente');
                    hiddenCount++;
                }
            });
            
            console.log(`[Role Manager] Elementi nascosti per ruolo: ${hiddenCount}/${elements.length}`);
        }

        /**
         * Valuta se l'elemento deve essere mostrato
         */
        evaluateRoleRequirement(element) {
            const userLevel = this.roleConfig.level;
            
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
                if (!requiredRoles.includes(this.currentRole)) return false;
            }
            
            // data-admin-only
            if (element.hasAttribute('data-admin-only') && this.currentRole !== 'ADMIN') {
                return false;
            }
            
            // data-operatore-plus
            if (element.hasAttribute('data-operatore-plus') && 
                this.currentRole !== 'ADMIN' && this.currentRole !== 'OPERATORE') {
                return false;
            }
            
            // data-visualizzatore-hidden
            if (element.hasAttribute('data-visualizzatore-hidden') && 
                this.currentRole === 'VISUALIZZATORE') {
                return false;
            }
            
            return true;
        }

        /**
         * Applica controlli permessi
         */
        applyPermissionControls() {
            const elements = document.querySelectorAll(CONFIG.SELECTORS.permissionElements);
            
            elements.forEach(element => {
                const required = element.getAttribute('data-requires-permission') || 
                               element.getAttribute('data-requires-permissions');
                
                if (!required) return;
                
                const permissions = required.split(',').map(p => p.trim());
                const hasPermission = this.hasAllPermissions(permissions);
                
                if (!hasPermission) {
                    this.disableElement(element, `Permessi richiesti: ${permissions.join(', ')}`);
                }
            });
        }

        /**
         * Verifica se l'utente ha tutti i permessi richiesti
         */
        hasAllPermissions(permissions) {
            const userPermissions = this.roleConfig.permissions;
            
            // Admin ha tutti i permessi
            if (userPermissions.includes('*')) return true;
            
            return permissions.every(perm => userPermissions.includes(perm));
        }

        /**
         * Verifica se l'utente ha almeno uno dei permessi
         */
        hasAnyPermission(permissions) {
            const userPermissions = this.roleConfig.permissions;
            
            // Admin ha tutti i permessi
            if (userPermissions.includes('*')) return true;
            
            return permissions.some(perm => userPermissions.includes(perm));
        }

        /**
         * Applica restrizioni ai form
         */
        applyFormRestrictions() {
            if (this.currentRole === 'VISUALIZZATORE') {
                const forms = document.querySelectorAll(CONFIG.SELECTORS.forms);
                
                forms.forEach(form => {
                    this.makeFormReadonly(form);
                });
                
                console.log(`[Role Manager] ${forms.length} form resi read-only`);
            }
        }

        /**
         * Rende un form read-only
         */
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

        /**
         * Applica restrizioni ai bottoni
         */
        applyButtonRestrictions() {
            // Bottoni eliminazione - solo ADMIN
            if (this.currentRole !== 'ADMIN') {
                document.querySelectorAll(CONFIG.SELECTORS.deleteButtons).forEach(btn => {
                    this.hideElement(btn, 'Solo amministratori possono eliminare');
                });
            }
            
            // Bottoni modifica - ADMIN e OPERATORE
            if (!['ADMIN', 'OPERATORE'].includes(this.currentRole)) {
                document.querySelectorAll(CONFIG.SELECTORS.editButtons).forEach(btn => {
                    this.hideElement(btn, 'Permesso di modifica richiesto');
                });
            }
            
            // Bottoni creazione - ADMIN e OPERATORE
            if (!['ADMIN', 'OPERATORE'].includes(this.currentRole)) {
                document.querySelectorAll(CONFIG.SELECTORS.createButtons).forEach(btn => {
                    this.hideElement(btn, 'Permesso di creazione richiesto');
                });
            }
        }

        /**
         * Aggiunge indicatori visivi
         */
        addVisualIndicators() {
            // Aggiungi badge ruolo se non esiste
            this.addRoleBadge();
            
            // Aggiungi tooltip agli elementi disabilitati
            this.addDisabledTooltips();
            
            // Aggiungi classi CSS per styling
            document.body.classList.add(`role-${this.currentRole.toLowerCase()}`);
            document.body.classList.add('role-manager-active');
        }

        /**
         * Aggiunge badge ruolo nell'interfaccia
         */
        addRoleBadge() {
            // Cerca container esistente o creane uno
            let badgeContainer = document.getElementById('role-badge-container');
            if (!badgeContainer) {
                badgeContainer = document.createElement('div');
                badgeContainer.id = 'role-badge-container';
                badgeContainer.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: rgba(255, 255, 255, 0.9);
                    padding: 10px 15px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    font-size: 14px;
                `;
                document.body.appendChild(badgeContainer);
            }
            
            badgeContainer.innerHTML = `
                <span style="font-size: 1.5em;">${this.roleConfig.icon}</span>
                <div>
                    <div style="font-weight: 600; color: ${this.roleConfig.color};">
                        ${this.roleConfig.label}
                    </div>
                    <div style="font-size: 0.85em; color: #6c757d;">
                        Livello ${this.roleConfig.level}
                    </div>
                </div>
            `;
        }

        /**
         * Aggiunge tooltip agli elementi disabilitati
         */
        addDisabledTooltips() {
            document.querySelectorAll('[data-disabled-reason]').forEach(element => {
                const reason = element.getAttribute('data-disabled-reason');
                
                // Crea tooltip al hover
                element.addEventListener('mouseenter', (e) => {
                    this.showTooltip(e.target, reason);
                });
                
                element.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });
            });
        }

        /**
         * Mostra tooltip
         */
        showTooltip(element, text) {
            // Rimuovi tooltip esistente
            this.hideTooltip();
            
            const tooltip = document.createElement('div');
            tooltip.id = 'role-manager-tooltip';
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
            `;
            tooltip.textContent = text;
            
            document.body.appendChild(tooltip);
            
            // Posiziona tooltip
            const rect = element.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
            
            // Aggiusta se esce dallo schermo
            if (tooltip.offsetLeft < 10) {
                tooltip.style.left = '10px';
            }
            if (tooltip.offsetLeft + tooltip.offsetWidth > window.innerWidth - 10) {
                tooltip.style.left = (window.innerWidth - tooltip.offsetWidth - 10) + 'px';
            }
        }

        /**
         * Nasconde tooltip
         */
        hideTooltip() {
            const tooltip = document.getElementById('role-manager-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        }

        /**
         * Nasconde elemento
         */
        hideElement(element, reason = '') {
            element.style.display = 'none';
            element.setAttribute('aria-hidden', 'true');
            element.setAttribute('data-role-hidden', 'true');
            if (reason) {
                element.setAttribute('data-disabled-reason', reason);
            }
        }

        /**
         * Mostra elemento
         */
        showElement(element) {
            element.style.display = '';
            element.removeAttribute('aria-hidden');
            element.removeAttribute('data-role-hidden');
            element.removeAttribute('data-disabled-reason');
        }

        /**
         * Disabilita elemento
         */
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

        /**
         * Abilita elemento
         */
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

        /**
         * Inizializza observer per cambiamenti DOM
         */
        initializeObservers() {
            if (!window.MutationObserver) return;
            
            const observer = new MutationObserver((mutations) => {
                // Debounce per evitare troppe esecuzioni
                clearTimeout(this.observerTimeout);
                this.observerTimeout = setTimeout(() => {
                    this.applyGlobalRoleControls();
                }, 100);
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-min-role', 'data-requires-role', 'data-requires-permission']
            });
            
            this.observers.push(observer);
            console.log('[Role Manager] DOM observer inizializzato');
        }

        /**
         * Setup event delegation per click su elementi disabilitati
         */
        setupEventDelegation() {
            document.addEventListener('click', (e) => {
                const target = e.target.closest('[data-role-disabled], [data-role-hidden]');
                if (target) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const reason = target.getAttribute('data-disabled-reason') || 'Accesso non autorizzato';
                    this.showNotification(reason, 'warning');
                }
            }, true);
        }

        /**
         * Mostra notifica
         */
        showNotification(message, type = 'info') {
            // Usa API sidebar se disponibile
            if (this.sidebarAPI && this.sidebarAPI.showToast) {
                this.sidebarAPI.showToast(message, type);
            } else {
                // Fallback semplice
                console.log(`[${type.toUpperCase()}] ${message}`);
                alert(message);
            }
        }

        /**
         * Inizializza pannello debug (solo per ADMIN)
         */
        initializeDebugPanel() {
            if (this.currentRole !== 'ADMIN') return;
            
            // Aggiungi comando console
            window.roleDebug = () => this.showDebugInfo();
            
            // Shortcut keyboard (Ctrl+Shift+D)
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                    e.preventDefault();
                    this.toggleDebugPanel();
                }
            });
        }

        /**
         * Toggle pannello debug
         */
        toggleDebugPanel() {
            let panel = document.getElementById('role-debug-panel');
            
            if (panel) {
                panel.remove();
            } else {
                this.createDebugPanel();
            }
        }

        /**
         * Crea pannello debug
         */
        createDebugPanel() {
            const panel = document.createElement('div');
            panel.id = 'role-debug-panel';
            panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 350px;
                max-height: 80vh;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.9);
                color: #fff;
                padding: 20px;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                font-size: 13px;
                z-index: 10000;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            `;
            
            const info = this.getDebugInfo();
            panel.innerHTML = `
                <h3 style="margin: 0 0 15px 0; color: #4caf50;">🔍 Role Manager Debug</h3>
                <button onclick="document.getElementById('role-debug-panel').remove()" 
                        style="position: absolute; top: 10px; right: 10px; 
                               background: #f44336; color: white; border: none; 
                               padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                    ✕
                </button>
                
                <div style="margin-bottom: 15px;">
                    <strong style="color: #ff9800;">Ruolo Corrente:</strong> 
                    <span style="color: ${info.role.color}">${info.role.name} (Livello ${info.role.level})</span>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong style="color: #ff9800;">Permessi:</strong>
                    <div style="margin-left: 10px; color: #03a9f4;">
                        ${info.permissions.join(', ') || 'Nessuno'}
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong style="color: #ff9800;">Statistiche Elementi:</strong>
                    <div style="margin-left: 10px;">
                        <div>Totali: ${info.stats.total}</div>
                        <div>Nascosti: ${info.stats.hidden}</div>
                        <div>Disabilitati: ${info.stats.disabled}</div>
                        <div>Form Read-only: ${info.stats.readonlyForms}</div>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong style="color: #ff9800;">API Disponibili:</strong>
                    <div style="margin-left: 10px; font-size: 11px;">
                        <div>window.roleManager</div>
                        <div>window.roleDebug()</div>
                        <div>Ctrl+Shift+D (toggle panel)</div>
                    </div>
                </div>
                
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #555;">
                    <button onclick="window.roleManager.testAllRoles()" 
                            style="background: #2196f3; color: white; border: none; 
                                   padding: 8px 15px; border-radius: 4px; cursor: pointer; 
                                   margin-right: 10px;">
                        Test Tutti i Ruoli
                    </button>
                    <button onclick="window.roleManager.exportDebugLog()" 
                            style="background: #4caf50; color: white; border: none; 
                                   padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                        Esporta Log
                    </button>
                </div>
            `;
            
            document.body.appendChild(panel);
        }

        /**
         * Ottiene informazioni debug
         */
        getDebugInfo() {
            return {
                role: {
                    name: this.currentRole,
                    level: this.roleConfig.level,
                    color: this.roleConfig.color
                },
                permissions: this.getPermissions(),
                stats: {
                    total: document.querySelectorAll(CONFIG.SELECTORS.roleElements).length,
                    hidden: document.querySelectorAll('[data-role-hidden="true"]').length,
                    disabled: document.querySelectorAll('[data-role-disabled="true"]').length,
                    readonlyForms: document.querySelectorAll('.readonly-form').length
                }
            };
        }

        /**
         * Mostra info debug in console
         */
        showDebugInfo() {
            const info = this.getDebugInfo();
            console.group('🔍 Role Manager Debug Info');
            console.log('Ruolo:', info.role);
            console.log('Permessi:', info.permissions);
            console.log('Statistiche:', info.stats);
            console.log('Configurazione:', CONFIG);
            console.groupEnd();
        }

        /**
         * Test cambio ruolo (solo debug)
         */
        testAllRoles() {
            if (this.currentRole !== 'ADMIN') {
                this.showNotification('Solo ADMIN può testare i ruoli', 'error');
                return;
            }
            
            const roles = Object.keys(CONFIG.ROLES);
            let index = 0;
            
            const interval = setInterval(() => {
                if (index >= roles.length) {
                    clearInterval(interval);
                    // Ripristina ruolo originale
                    if (this.sidebarAPI) {
                        this.sidebarAPI.updateRole('ADMIN');
                    }
                    this.showNotification('Test ruoli completato', 'success');
                    return;
                }
                
                const testRole = roles[index];
                console.log(`[Role Manager] Testing role: ${testRole}`);
                
                if (this.sidebarAPI) {
                    this.sidebarAPI.updateRole(testRole);
                }
                
                // Ricarica controlli
                this.currentRole = testRole;
                this.roleConfig = CONFIG.ROLES[testRole];
                this.applyGlobalRoleControls();
                
                index++;
            }, 2000);
        }

        /**
         * Esporta log debug
         */
        exportDebugLog() {
            const log = {
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                role: this.getDebugInfo(),
                elements: {
                    withRoleRestrictions: [],
                    withPermissionRestrictions: []
                }
            };
            
            // Raccogli elementi con restrizioni
            document.querySelectorAll(CONFIG.SELECTORS.roleElements).forEach(el => {
                log.elements.withRoleRestrictions.push({
                    tag: el.tagName,
                    id: el.id,
                    classes: el.className,
                    restrictions: {
                        minRole: el.getAttribute('data-min-role'),
                        requiresRole: el.getAttribute('data-requires-role'),
                        adminOnly: el.hasAttribute('data-admin-only'),
                        hidden: el.getAttribute('data-role-hidden') === 'true'
                    }
                });
            });
            
            // Download come JSON
            const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `role-manager-debug-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('Log debug esportato', 'success');
        }

        // ========================================
        // METODI UTILITY PUBBLICI
        // ========================================

        /**
         * Ottiene i permessi del ruolo corrente
         */
        getPermissions() {
            return [...this.roleConfig.permissions];
        }

        /**
         * Verifica se l'utente ha un permesso specifico
         */
        hasPermission(permission) {
            return this.hasAllPermissions([permission]);
        }

        /**
         * Aggiorna il ruolo (usa sidebar API se disponibile)
         */
        updateRole(newRole) {
            if (this.sidebarAPI) {
                return this.sidebarAPI.updateRole(newRole);
            }
            
            // Fallback manuale
            if (!CONFIG.ROLES[newRole]) {
                console.error(`[Role Manager] Ruolo non valido: ${newRole}`);
                return false;
            }
            
            this.currentRole = newRole;
            this.roleConfig = CONFIG.ROLES[newRole];
            this.applyGlobalRoleControls();
            
            return true;
        }

        /**
         * Refresh controlli ruolo
         */
        refresh() {
            this.detectCurrentRole();
            this.applyGlobalRoleControls();
            this.showNotification('Controlli ruolo aggiornati', 'info');
        }

        /**
         * Emette evento custom
         */
        emitEvent(eventName, detail) {
            const event = new CustomEvent(eventName, {
                detail: detail,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
        }

        /**
         * Distrugge il role manager
         */
        destroy() {
            // Rimuovi observer
            this.observers.forEach(observer => observer.disconnect());
            this.observers = [];
            
            // Rimuovi elementi UI
            document.getElementById('role-badge-container')?.remove();
            document.getElementById('role-debug-panel')?.remove();
            this.hideTooltip();
            
            // Rimuovi classi
            document.body.classList.remove(`role-${this.currentRole.toLowerCase()}`);
            document.body.classList.remove('role-manager-active');
            
            // Pulisci riferimenti
            this.initialized = false;
            
            console.log('[Role Manager] Distrutto');
        }
    }

    // ========================================
    // INIZIALIZZAZIONE E EXPORT
    // ========================================

    // Crea istanza singleton
    const roleManager = new TalonRoleManager();

    // Esporta API globale
    window.TalonRoleManager = TalonRoleManager;
    window.roleManager = roleManager;

    // API pubblica semplificata
    window.RoleManagerAPI = {
        // Info
        getCurrentRole: () => roleManager.currentRole,
        getPermissions: () => roleManager.getPermissions(),
        hasPermission: (perm) => roleManager.hasPermission(perm),
        
        // Azioni
        refresh: () => roleManager.refresh(),
        updateRole: (role) => roleManager.updateRole(role),
        
        // Debug (solo ADMIN)
        debug: () => roleManager.showDebugInfo(),
        testRoles: () => roleManager.testAllRoles(),
        
        // Utility
        showElement: (el) => roleManager.showElement(el),
        hideElement: (el, reason) => roleManager.hideElement(el, reason),
        disableElement: (el, reason) => roleManager.disableElement(el, reason),
        enableElement: (el) => roleManager.enableElement(el),
        
        // Info sistema
        version: '1.2',
        isInitialized: () => roleManager.initialized
    };

    console.log('[Role Manager] ✅ Modulo caricato. API disponibile in window.RoleManagerAPI');

})(window, document);