/**
 * ========================================
 * TALON SIDEBAR MODULE - SPA VERSION COMPLETA
 * File: static/js/sidebar.js
 * 
 * Versione: 3.0.0 - Full SPA Integration
 * Data: 2025
 * Funzionalità: Menu navigazione SPA, controlli ruoli, 
 *               drag&drop, logout, dashboard buttons
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE E COSTANTI
    // ========================================
    
    const CONFIG = {
        // Configurazione SPA
        SPA: {
            ENABLED: true,
            CLEANUP_ON_NAVIGATION: true,
            PERSIST_STATE: true,
            DEBUG: false
        },
        
        // Configurazione UI
        UI: {
            ANIMATION_DURATION: 300,
            TOAST_DURATION: 4000,
            DEBOUNCE_DELAY: 300
        },
        
        // Storage keys
        STORAGE: {
            PINNED_STATE: 'talon_sidebar_pinned',
            LOCKED_STATE: 'talon_sidebar_locked',
            MENU_ORDER: 'talon_sidebar_menu_order',
            USER_ROLE: 'talon_user_role'
        },
        
        // Ruoli e permessi
        ROLES: {
            'ADMIN': { level: 100, label: 'Amministratore', color: '#dc3545', icon: '👨‍💼' },
            'OPERATORE': { level: 50, label: 'Operatore', color: '#fd7e14', icon: '👷' },
            'VISUALIZZATORE': { level: 10, label: 'Visualizzatore', color: '#0d6efd', icon: '👁️' },
            'GUEST': { level: 0, label: 'Ospite', color: '#6c757d', icon: '👤' }
        },
        
        // Route mapping
        MENU_ROUTES: {
            'dashboard': { route: '/dashboard', minRole: 'VISUALIZZATORE' },
            'dashboard_admin': { route: '/dashboard_admin', minRole: 'ADMIN' },
            'enti_militari': { route: '/enti_militari/organigramma', minRole: 'VISUALIZZATORE' },
            'enti_civili': { route: '/enti_civili', minRole: 'VISUALIZZATORE' },
            'attivita': { route: '/attivita', minRole: 'VISUALIZZATORE' },
            'operazioni': { route: '/operazioni', minRole: 'VISUALIZZATORE' },
            'gestione_utenti': { route: '/admin/users', minRole: 'ADMIN' },
            'sistema': { route: '/admin/system-info', minRole: 'ADMIN' }
        },
        
        // Selettori DOM
        SELECTORS: {
            sidebar: '#sidebar',
            menuToggleBtn: '#menu-toggle-btn',
            tooltip: '#tooltip',
            menuList: '#menu-list',
            logoutBtn: '#logout-btn',
            userName: '#user-name',
            menuItems: '.sidebar li:not(.menu-divider)',
            menuLinks: '.sidebar a'
        }
    };

    // ========================================
    // CLASSE TALON SIDEBAR
    // ========================================
    
    class TalonSidebar {
        constructor() {
            // Stato
            this.state = {
                initialized: false,
                isPinned: false,
                isExpanded: false,
                isLocked: false,
                userRole: null,
                roleLevel: 0,
                draggedItem: null
            };
            
            // Elementi DOM
            this.elements = {};
            
            // Event handlers per cleanup
            this.eventHandlers = new Map();
            this.timers = new Set();
            
            // Bind dei metodi
            this.handleSPANavigation = this.handleSPANavigation.bind(this);
            this.handleSPACleanup = this.handleSPACleanup.bind(this);
            this.handleDocumentClick = this.handleDocumentClick.bind(this);
            this.toggle = this.toggle.bind(this);
            this.handleMenuClick = this.handleMenuClick.bind(this);
            this.handleLogout = this.handleLogout.bind(this);
        }

        // ========================================
        // INIZIALIZZAZIONE E CLEANUP
        // ========================================
        
        async init() {
            if (this.state.initialized) {
                this.log('warn', 'Already initialized');
                return;
            }
            
            this.log('info', 'Initializing Sidebar (SPA Version 3.0.0)...');
            
            try {
                // Trova elementi DOM
                if (!this.findElements()) {
                    this.log('warn', 'Required elements not found');
                    return false;
                }
                
                // Carica stato salvato
                this.loadPersistedState();
                
                // Rileva ruolo utente
                this.detectUserRole();
                
                // Rimuovi badge esistenti
                this.removeExistingRoleBadges();
                
                // Applica stato iniziale
                this.applyInitialState();
                
                // Setup event handlers
                this.setupEventHandlers();
                
                // Setup SPA integration
                this.setupSPAIntegration();
                
                // Inizializza componenti
                this.initializeDragAndDrop();
                this.initializeRoleControls();
                this.initializeUserInfo();
                this.initializeLogout();
                this.loadMenuOrder();
                
                // Fix menu links
                this.fixMenuLinks();
                
                // Inizializza bottoni dashboard
                this.initializeDashboardButtons();
                
                this.state.initialized = true;
                this.log('success', '✅ Sidebar initialized');
                
                // Emetti evento ready
                this.emit('sidebar:ready', { role: this.state.userRole });
                
                return true;
                
            } catch (error) {
                this.log('error', 'Initialization failed:', error);
                return false;
            }
        }

        cleanup() {
            this.log('info', 'Cleaning up Sidebar...');
            
            // Salva stato se configurato
            if (CONFIG.SPA.PERSIST_STATE) {
                this.saveState();
            }
            
            // Rimuovi event handlers
            this.removeAllEventHandlers();
            
            // Clear timers
            this.clearAllTimers();
            
            // Reset stato
            this.state.initialized = false;
            this.state.draggedItem = null;
            
            // Clear elementi DOM references
            this.elements = {};
            
            this.log('success', '✅ Sidebar cleanup completed');
        }

        destroy() {
            this.cleanup();
            
            // Rimuovi SPA listeners
            this.removeSPAIntegration();
            
            // Rimuovi stili dinamici
            this.removeStyles();
            
            // Emetti evento destroy
            this.emit('sidebar:destroyed');
            
            this.log('info', 'Sidebar destroyed');
        }

        // ========================================
        // GESTIONE DOM
        // ========================================
        
        findElements() {
            const selectors = CONFIG.SELECTORS;
            
            this.elements.sidebar = document.querySelector(selectors.sidebar);
            if (!this.elements.sidebar) return false;
            
            this.elements.menuToggleBtn = document.querySelector(selectors.menuToggleBtn);
            this.elements.tooltip = document.querySelector(selectors.tooltip);
            this.elements.menuList = document.querySelector(selectors.menuList);
            this.elements.logoutBtn = document.querySelector(selectors.logoutBtn);
            this.elements.userName = document.querySelector(selectors.userName);
            
            return true;
        }

        // ========================================
        // GESTIONE STATO
        // ========================================
        
        loadPersistedState() {
            if (!CONFIG.SPA.PERSIST_STATE) return;
            
            // Carica stato pinned
            const pinned = localStorage.getItem(CONFIG.STORAGE.PINNED_STATE);
            if (pinned !== null) {
                this.state.isPinned = pinned === 'true';
            }
            
            // Carica stato locked dalla sessione
            const locked = sessionStorage.getItem(CONFIG.STORAGE.LOCKED_STATE);
            if (locked !== null) {
                this.state.isLocked = locked === 'true';
            }
            
            this.log('debug', 'Loaded persisted state:', { 
                pinned: this.state.isPinned, 
                locked: this.state.isLocked 
            });
        }

        saveState() {
            if (!CONFIG.SPA.PERSIST_STATE) return;
            
            localStorage.setItem(CONFIG.STORAGE.PINNED_STATE, this.state.isPinned);
            sessionStorage.setItem(CONFIG.STORAGE.LOCKED_STATE, this.state.isLocked);
            
            this.log('debug', 'State saved');
        }

        applyInitialState() {
            const sidebar = this.elements.sidebar;
            if (!sidebar) return;
            
            // Applica classi iniziali con animazione
            sidebar.classList.add('loading');
            
            if (this.state.isPinned) {
                sidebar.classList.add('pinned', 'expanded');
                this.state.isExpanded = true;
            }
            
            const wasLocked = sessionStorage.getItem(CONFIG.STORAGE.LOCKED_STATE) === 'true';
            if (wasLocked && !this.state.isPinned) {
                this.state.isLocked = true;
                sidebar.classList.add('expanded', 'locked');
                this.state.isExpanded = true;
            }
            
            // Rimuovi classe loading dopo animazione
            requestAnimationFrame(() => {
                sidebar.classList.remove('loading');
            });
            
            this.updateTooltipText();
        }

        // ========================================
        // GESTIONE RUOLI - COMPLETA
        // ========================================
        
        detectUserRole() {
            // Priority: Flask > Meta > Body > Session > Script > Default
            this.state.userRole = 
                window.FLASK_USER_ROLE ||
                document.querySelector('meta[name="user-role"]')?.content ||
                document.body.getAttribute('data-user-role') ||
                document.getElementById('hidden-user-role')?.value ||
                sessionStorage.getItem(CONFIG.STORAGE.USER_ROLE) ||
                this.extractRoleFromScripts() ||
                'GUEST';
            
            const roleConfig = CONFIG.ROLES[this.state.userRole];
            if (roleConfig) {
                this.state.roleLevel = roleConfig.level;
            }
            
            // Propaga il ruolo
            this.propagateUserRole();
            
            this.log('info', `User role detected: ${this.state.userRole} (level: ${this.state.roleLevel})`);
        }

        extractRoleFromScripts() {
            const scripts = document.querySelectorAll('script:not([src])');
            for (let script of scripts) {
                const content = script.textContent;
                
                const patterns = [
                    /window\.userRole\s*=\s*["'](\w+)["']/,
                    /ruolo_nome["']\s*:\s*["'](\w+)["']/,
                    /user_role["']\s*:\s*["'](\w+)["']/,
                    /FLASK_USER_ROLE\s*=\s*["'](\w+)["']/
                ];
                
                for (let pattern of patterns) {
                    const match = content.match(pattern);
                    if (match && match[1]) {
                        const role = match[1].toUpperCase();
                        if (CONFIG.ROLES[role]) {
                            return role;
                        }
                    }
                }
            }
            
            return null;
        }

        propagateUserRole() {
            // Imposta globalmente
            window.userRole = this.state.userRole;
            window.TALON_USER_ROLE = this.state.userRole;
            document.body.setAttribute('data-user-role', this.state.userRole);
            sessionStorage.setItem(CONFIG.STORAGE.USER_ROLE, this.state.userRole);
            
            // Aggiungi classe CSS
            document.body.className = document.body.className
                .replace(/\brole-\w+\b/g, '')
                .trim() + ` role-${this.state.userRole.toLowerCase()}`;
        }

        initializeRoleControls() {
            this.log(`Initializing role controls for: ${this.state.userRole}`);
            
            this.applyRoleRestrictionsToMenu();
            this.updateUserInfoWithRole();
            this.applyRoleStyles();
            this.initializeRoleObserver();
        }

        applyRoleRestrictionsToMenu() {
            const menuItems = this.elements.menuList?.querySelectorAll('li');
            if (!menuItems) return;
            
            let hiddenCount = 0;
            let visibleCount = 0;
            
            menuItems.forEach(item => {
                if (item.classList.contains('menu-divider')) return;
                
                const shouldShow = this.evaluateMenuItemAccess(item);
                
                if (shouldShow) {
                    this.showMenuItem(item);
                    visibleCount++;
                } else {
                    this.hideMenuItem(item, this.getAccessDeniedReason(item));
                    hiddenCount++;
                }
            });
            
            this.log('debug', `Menu items - Visible: ${visibleCount}, Hidden: ${hiddenCount}`);
        }

        evaluateMenuItemAccess(item) {
            const userLevel = this.state.roleLevel;
            
            // Check min-role
            const minRole = item.getAttribute('data-min-role');
            if (minRole) {
                const minLevel = CONFIG.ROLES[minRole]?.level || 100;
                if (userLevel < minLevel) return false;
            }
            
            // Check admin-only
            if (item.hasAttribute('data-admin-only') && this.state.userRole !== 'ADMIN') {
                return false;
            }
            
            // Check operatore-plus
            if (item.hasAttribute('data-operatore-plus')) {
                if (this.state.userRole !== 'ADMIN' && this.state.userRole !== 'OPERATORE') {
                    return false;
                }
            }
            
            // Check visualizzatore-hidden
            if (item.hasAttribute('data-visualizzatore-hidden') && this.state.userRole === 'VISUALIZZATORE') {
                return false;
            }
            
            return true;
        }

        getAccessDeniedReason(item) {
            if (item.getAttribute('data-min-role')) {
                return `Richiede ruolo minimo: ${item.getAttribute('data-min-role')}`;
            }
            if (item.hasAttribute('data-admin-only')) {
                return 'Solo per amministratori';
            }
            if (item.hasAttribute('data-operatore-plus')) {
                return 'Richiede ruolo Operatore o superiore';
            }
            if (item.hasAttribute('data-visualizzatore-hidden')) {
                return 'Non disponibile per Visualizzatore';
            }
            return 'Accesso non autorizzato';
        }

        applyRoleStyles() {
            const sidebar = this.elements.sidebar;
            if (!sidebar) return;
            
            // Rimuovi classi esistenti
            Object.keys(CONFIG.ROLES).forEach(role => {
                sidebar.classList.remove(`role-${role.toLowerCase()}`);
            });
            
            // Aggiungi classe ruolo corrente
            sidebar.classList.add(`role-${this.state.userRole.toLowerCase()}`);
            
            // Imposta colore ruolo
            const roleConfig = CONFIG.ROLES[this.state.userRole];
            if (roleConfig) {
                sidebar.style.setProperty('--current-role-color', roleConfig.color);
            }
        }

        initializeRoleObserver() {
            if (!window.MutationObserver) return;
            
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1 && node.matches && node.matches('li')) {
                                this.applyRoleRestrictionsToMenuItem(node);
                            }
                        });
                    }
                });
            });
            
            if (this.elements.menuList) {
                observer.observe(this.elements.menuList, {
                    childList: true,
                    subtree: true
                });
            }
        }

        applyRoleRestrictionsToMenuItem(item) {
            const shouldShow = this.evaluateMenuItemAccess(item);
            
            if (shouldShow) {
                this.showMenuItem(item);
            } else {
                this.hideMenuItem(item, this.getAccessDeniedReason(item));
            }
        }

        hideMenuItem(item, reason = '') {
            item.classList.add('role-hidden');
            item.style.display = 'none';
            item.setAttribute('data-access-denied', reason);
            item.setAttribute('aria-hidden', 'true');
            item.setAttribute('draggable', 'false');
        }

        showMenuItem(item) {
            item.classList.remove('role-hidden');
            item.style.display = '';
            item.removeAttribute('data-access-denied');
            item.removeAttribute('aria-hidden');
            item.setAttribute('draggable', 'true');
        }

        updateUserInfoWithRole() {
            // Aggiorna body con info ruolo
            document.body.setAttribute('data-user-role', this.state.userRole);
            
            // Se esiste userName, aggiornalo
            if (this.elements.userName) {
                const username = this.elements.userName.textContent || 'Utente';
                document.body.setAttribute('data-username', username);
            }
            
            this.log('debug', `Role updated globally: ${this.state.userRole}`);
        }

        removeExistingRoleBadges() {
            // Rimuovi eventuali badge esistenti
            const existingBadges = document.querySelectorAll('.user-role-badge, [data-role]');
            existingBadges.forEach(badge => badge.remove());
        }

        // ========================================
        // NAVIGAZIONE MENU
        // ========================================
        
        handleMenuNavigation(menuId, linkElement) {
            this.log(`Menu clicked: ${menuId}`);
            
            // Verifica accesso
            const menuItem = linkElement.closest('li');
            if (!this.hasAccessToMenuItem(menuItem)) {
                this.showAccessDeniedMessage(menuItem);
                return;
            }
            
            const menuConfig = CONFIG.MENU_ROUTES[menuId];
            if (menuConfig) {
                // Verifica requisito di ruolo
                if (!this.hasMinimumRole(menuConfig.minRole)) {
                    this.showToast(`Accesso negato. Richiede ruolo: ${menuConfig.minRole}`, 'error');
                    return;
                }
                
                this.log(`Navigating to: ${menuConfig.route}`);
                
                // Animazione di feedback
                this.animateMenuClick(linkElement);
                
                // Navigazione SPA o normale
                this.addTimer(setTimeout(() => {
                    if (window.TalonApp?.navigate) {
                        window.TalonApp.navigate(menuConfig.route);
                    } else {
                        window.location.href = menuConfig.route;
                    }
                }, 150));
            } else {
                this.log('warn', `Route not found for menu: ${menuId}`);
                this.showNotImplementedMessage(menuId);
            }
        }

        fixMenuLinks() {
            const menuLinks = this.elements.menuList?.querySelectorAll('a');
            if (!menuLinks) return;
            
            menuLinks.forEach(link => {
                const menuItem = link.closest('li');
                const menuId = menuItem?.dataset.menuId;
                const href = link.getAttribute('href');
                
                // Se il link ha href valido e non è "#", mantienilo per SPA
                if (href && href !== '#' && href !== 'javascript:void(0)') {
                    // Aggiungi controllo accesso
                    link.addEventListener('click', (e) => {
                        if (!this.hasAccessToMenuItem(menuItem)) {
                            e.preventDefault();
                            this.showAccessDeniedMessage(menuItem);
                        }
                    });
                    return;
                }
                
                // Altrimenti, sostituisci con navigazione JavaScript
                link.removeAttribute('href');
                link.style.cursor = 'pointer';
                
                // Rimuovi vecchi event listeners clonando
                const newLink = link.cloneNode(true);
                link.parentNode.replaceChild(newLink, link);
                
                // Aggiungi nuovo event listener
                newLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleMenuNavigation(menuId, newLink);
                });
                
                this.log('debug', `Fixed menu link: ${menuId}`);
            });
        }

        // ========================================
        // DASHBOARD BUTTONS
        // ========================================
        
        initializeDashboardButtons() {
            this.log('Initializing dashboard buttons...');
            
            // Aspetta che la pagina sia completamente caricata
            this.addTimer(setTimeout(() => {
                this.setupActionButtons();
                this.setupViewButtons();
                this.applyRoleRestrictionsToButtons();
            }, 500));
        }

        setupActionButtons() {
            const buttonActions = {
                'Nuovo Utente': {
                    action: () => this.openCreateUserModal(),
                    minRole: 'ADMIN'
                },
                'Nuovo Ente Civile': {
                    action: () => this.navigateToRoute('/enti_civili/new'),
                    minRole: 'OPERATORE'
                },
                'Nuovo Ente Militare': {
                    action: () => this.navigateToRoute('/enti_militari/new'),
                    minRole: 'OPERATORE'
                },
                'Nuova Operazione': {
                    action: () => this.navigateToRoute('/operazioni/new'),
                    minRole: 'OPERATORE'
                },
                'Backup Database': {
                    action: () => this.confirmAndNavigate('/admin/backup', 'Avviare il backup del database?'),
                    minRole: 'ADMIN'
                },
                'Visualizza Log': {
                    action: () => this.openInNewTab('/admin/logs'),
                    minRole: 'ADMIN'
                }
            };
            
            Object.entries(buttonActions).forEach(([buttonText, config]) => {
                const buttons = this.findButtonsByText(buttonText);
                buttons.forEach(btn => {
                    if (this.hasMinimumRole(config.minRole)) {
                        this.enableButton(btn, config.action);
                        this.log('debug', `Button enabled: ${buttonText}`);
                    } else {
                        this.disableButton(btn, `Richiede ruolo: ${config.minRole}`);
                        this.log('debug', `Button disabled: ${buttonText} (requires ${config.minRole})`);
                    }
                });
            });
        }

        setupViewButtons() {
            const viewButtons = document.querySelectorAll('button, .btn');
            
            viewButtons.forEach(btn => {
                const btnText = btn.textContent.trim().toLowerCase();
                if (btnText === 'visualizza' || btnText === 'vedi' || btnText === 'mostra') {
                    const route = this.detectViewButtonRoute(btn);
                    if (route) {
                        this.enableButton(btn, () => this.navigateToRoute(route));
                        this.log('debug', `Configured view button for: ${route}`);
                    }
                }
            });
        }

        detectViewButtonRoute(button) {
            const container = button.closest('.card, .section, .widget, .dashboard-item, [data-section]');
            if (!container) return null;
            
            // Cerca attributo data-route
            const dataRoute = container.getAttribute('data-route');
            if (dataRoute) return dataRoute;
            
            // Altrimenti usa il titolo della sezione
            const heading = container.querySelector('h1, h2, h3, h4, h5, h6, .title, .card-title');
            const section = heading?.textContent.trim().toLowerCase();
            
            const routeMap = {
                'enti civili': '/enti_civili',
                'enti militari': '/enti_militari/organigramma',
                'operazioni': '/operazioni',
                'attività': '/attivita',
                'utenti': '/admin/users',
                'sistema': '/admin/system-info',
                'log': '/admin/logs',
                'backup': '/admin/backup'
            };
            
            // Cerca corrispondenza parziale
            for (let [key, route] of Object.entries(routeMap)) {
                if (section && section.includes(key)) {
                    return route;
                }
            }
            
            return null;
        }

        applyRoleRestrictionsToButtons() {
            // Disabilita tutti i bottoni di eliminazione per non-ADMIN
            if (this.state.userRole !== 'ADMIN') {
                const deleteButtons = document.querySelectorAll(
                    'button[data-action="delete"], ' +
                    '.btn-danger, ' +
                    'button[onclick*="delete"], ' +
                    'button[onclick*="elimina"]'
                );
                
                deleteButtons.forEach(btn => {
                    this.disableButton(btn, 'Solo ADMIN può eliminare');
                });
            }
            
            // Disabilita bottoni di modifica per VISUALIZZATORE
            if (this.state.userRole === 'VISUALIZZATORE') {
                const editButtons = document.querySelectorAll(
                    'button[data-action="edit"], ' +
                    'button[data-action="create"], ' +
                    '.btn-primary:not(.btn-view), ' +
                    '.btn-success, ' +
                    '.btn-warning'
                );
                
                editButtons.forEach(btn => {
                    this.disableButton(btn, 'Accesso in sola lettura');
                });
            }
            
            // Mostra tutti i bottoni per ADMIN
            if (this.state.userRole === 'ADMIN') {
                this.enableAllButtonsForAdmin();
            }
        }

        findButtonsByText(text) {
            return Array.from(document.querySelectorAll('button, .btn')).filter(btn => 
                btn.textContent.trim() === text
            );
        }

        enableButton(button, action) {
            button.disabled = false;
            button.style.pointerEvents = 'auto';
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
            button.removeAttribute('data-disabled-reason');
            button.removeAttribute('title');
            
            // Rimuovi vecchi event listeners clonando
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            // Aggiungi nuovo event listener
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                action();
            });
            
            return newButton;
        }

        disableButton(button, reason) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.setAttribute('title', reason);
            button.setAttribute('data-disabled-reason', reason);
            
            // Aggiungi event listener per mostrare messaggio
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showToast(reason, 'warning');
            });
        }

        enableAllButtonsForAdmin() {
            if (this.state.userRole !== 'ADMIN') return;
            
            document.querySelectorAll('button[disabled], .btn[disabled]').forEach(btn => {
                // Salta bottoni che devono rimanere disabilitati
                if (btn.hasAttribute('data-always-disabled')) return;
                
                btn.disabled = false;
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.removeAttribute('data-disabled-reason');
            });
            
            // Mostra elementi nascosti per admin
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.style.display = '';
                el.removeAttribute('aria-hidden');
            });
            
            this.log('debug', 'All controls enabled for ADMIN');
        }

        navigateToRoute(route) {
            this.log(`Navigating to: ${route}`);
            if (window.TalonApp?.navigate) {
                window.TalonApp.navigate(route);
            } else {
                window.location.href = route;
            }
        }

        openCreateUserModal() {
            this.log('Opening create user modal...');
            // First navigate to users page if not already there
            const currentPath = window.location.pathname;
            if (!currentPath.includes('/admin/users')) {
                // Navigate to users page first
                this.navigateToRoute('/admin/users');
                // Wait for page to load, then open modal
                setTimeout(() => {
                    this.triggerCreateUserModal();
                }, 1000);
            } else {
                // Already on users page, open modal directly
                this.triggerCreateUserModal();
            }
        }

        triggerCreateUserModal() {
            try {
                // Try to call the global function from users page
                if (typeof window.showCreateUserModal === 'function') {
                    window.showCreateUserModal();
                } else {
                    // Fallback - dispatch custom event
                    document.dispatchEvent(new CustomEvent('openCreateUserModal'));
                }
            } catch (error) {
                this.log('Error opening create user modal:', error);
                this.showToast('Errore nell\'apertura del modal utente', 'error');
            }
        }

        confirmAndNavigate(route, message) {
            if (confirm(message)) {
                this.navigateToRoute(route);
            }
        }

        openInNewTab(route) {
            this.log(`Opening in new tab: ${route}`);
            window.open(route, '_blank');
        }

        showNotImplementedMessage(menuId) {
            const message = `Funzionalità "${menuId}" non ancora implementata`;
            this.log('warn', message);
            this.showToast(message, 'warning');
        }

        // ========================================
        // EVENT HANDLERS
        // ========================================
        
        setupEventHandlers() {
            this.bindToggleEvents();
            this.bindHoverEvents();
            this.bindMenuClickEvents();
        }

        bindToggleEvents() {
            if (!this.elements.menuToggleBtn) return;
            
            this.addEventHandler(
                this.elements.menuToggleBtn,
                'click',
                (e) => {
                    e.stopPropagation();
                    this.togglePinned();
                }
            );
        }

        bindHoverEvents() {
            if (!this.elements.sidebar) return;
            
            this.addEventHandler(
                this.elements.sidebar,
                'mouseenter',
                () => {
                    if (!this.state.isPinned) {
                        if (this.state.isLocked) {
                            this.state.isLocked = false;
                            this.elements.sidebar.classList.remove('locked');
                            sessionStorage.removeItem(CONFIG.STORAGE.LOCKED_STATE);
                        }
                        this.expandSidebar();
                    }
                    this.updateTooltipText();
                }
            );
            
            this.addEventHandler(
                this.elements.sidebar,
                'mouseleave',
                () => {
                    if (!this.state.isPinned) {
                        this.collapseSidebar();
                        
                        if (this.elements.tooltip) {
                            this.elements.tooltip.textContent = 'Espandi il menu';
                        }
                    }
                }
            );
        }

        bindMenuClickEvents() {
            if (!this.elements.menuList) return;
            
            const menuLinks = this.elements.menuList.querySelectorAll('a');
            
            menuLinks.forEach(link => {
                this.addEventHandler(link, 'click', (e) => {
                    const menuItem = link.closest('li');
                    if (!this.hasAccessToMenuItem(menuItem)) {
                        e.preventDefault();
                        this.showAccessDeniedMessage(menuItem);
                        return;
                    }
                    
                    this.handleMenuClick(e, link);
                });
            });
        }

        handleMenuClick(e, link) {
            if (this.state.isPinned) {
                this.animateMenuClick(link);
                return;
            }
            
            if (this.state.isExpanded) {
                this.state.isLocked = true;
                this.elements.sidebar.classList.add('locked');
                sessionStorage.setItem(CONFIG.STORAGE.LOCKED_STATE, 'true');
            }
            
            this.animateMenuClick(link);
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

        handleDocumentClick(e) {
            // Chiudi sidebar se click fuori
            if (!this.state.isPinned && 
                this.state.isExpanded && 
                !this.elements.sidebar?.contains(e.target)) {
                this.collapseSidebar();
            }
        }

        // ========================================
        // USER INFO E LOGOUT
        // ========================================
        
        initializeUserInfo() {
            this.log('Skip user-info initialization (element removed)');
            
            // Mantieni info username per altri usi
            if (this.elements.userName) {
                const username = this.elements.userName.textContent || 'Utente';
                document.body.setAttribute('data-username', username);
            }
        }

        initializeLogout() {
            if (this.elements.logoutBtn) {
                this.addEventHandler(this.elements.logoutBtn, 'click', (e) => {
                    e.stopPropagation();
                    this.handleLogout();
                });
            }
        }

        async handleLogout() {
            if (confirm('Sei sicuro di voler effettuare il logout?')) {
                try {
                    this.log('Logout in progress...');
                    
                    // Mostra toast
                    this.showToast('Logout in corso...', 'info');
                    
                    // Pulisci dati locali
                    sessionStorage.clear();
                    localStorage.removeItem(CONFIG.STORAGE.MENU_ORDER);
                    
                    // Redirect con delay
                    this.addTimer(setTimeout(() => {
                        window.location.href = '/auth/logout';
                    }, 500));
                    
                } catch (error) {
                    this.log('error', 'Logout error:', error);
                    window.location.href = '/auth/logout';
                }
            }
        }

        // ========================================
        // SIDEBAR CONTROLS
        // ========================================
        
        togglePinned() {
            const svg = this.elements.menuToggleBtn?.querySelector('svg');
            
            if (!this.state.isPinned) {
                this.animateIcon(svg, 0, 90);
            } else {
                this.animateIcon(svg, 90, 0);
            }
            
            this.state.isPinned = !this.state.isPinned;
            
            if (this.state.isPinned) {
                this.elements.sidebar.classList.add('pinned', 'expanded');
                this.state.isExpanded = true;
                this.state.isLocked = false;
                sessionStorage.removeItem(CONFIG.STORAGE.LOCKED_STATE);
            } else {
                this.elements.sidebar.classList.remove('pinned');
            }
            
            localStorage.setItem(CONFIG.STORAGE.PINNED_STATE, this.state.isPinned.toString());
            this.updateTooltipText();
            this.elements.menuToggleBtn?.setAttribute('aria-expanded', this.state.isPinned.toString());
        }

        expandSidebar() {
            if (!this.state.isPinned) {
                this.elements.sidebar?.classList.add('expanded');
                this.state.isExpanded = true;
            }
        }

        collapseSidebar() {
            if (!this.state.isPinned && !this.state.isLocked) {
                this.elements.sidebar?.classList.remove('expanded', 'locked');
                this.state.isExpanded = false;
                this.state.isLocked = false;
                sessionStorage.removeItem(CONFIG.STORAGE.LOCKED_STATE);
            }
        }

        // ========================================
        // DRAG & DROP
        // ========================================
        
        initializeDragAndDrop() {
            if (!this.elements.menuList) return;
            
            this.addEventHandler(this.elements.menuList, 'dragstart', this.handleDragStart.bind(this));
            this.addEventHandler(this.elements.menuList, 'dragend', this.handleDragEnd.bind(this));
            this.addEventHandler(this.elements.menuList, 'dragover', this.handleDragOver.bind(this));
            this.addEventHandler(this.elements.menuList, 'drop', this.handleDrop.bind(this));
        }

        handleDragStart(e) {
            this.state.draggedItem = e.target.closest('li');
            if (!this.state.draggedItem) return;
            
            if (this.state.draggedItem.classList.contains('role-hidden') ||
                this.state.draggedItem.classList.contains('menu-divider')) {
                e.preventDefault();
                return;
            }
            
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setDragImage(this.state.draggedItem, 20, 20);
            }
            
            this.addTimer(setTimeout(() => {
                this.state.draggedItem.classList.add('dragging');
            }, 0));
        }

        handleDragEnd() {
            if (!this.state.draggedItem) return;
            
            this.state.draggedItem.classList.remove('dragging');
            
            const placeholder = this.elements.menuList?.querySelector('.drag-over');
            if (placeholder) {
                placeholder.classList.remove('drag-over');
            }
            
            this.saveMenuOrder();
            this.state.draggedItem = null;
        }

        handleDragOver(e) {
            e.preventDefault();
            if (!this.state.draggedItem) return;
            
            const afterElement = this.getDragAfterElement(this.elements.menuList, e.clientY);
            
            const currentPlaceholder = this.elements.menuList?.querySelector('.drag-over');
            if (currentPlaceholder) {
                currentPlaceholder.classList.remove('drag-over');
            }
            
            if (afterElement) {
                afterElement.classList.add('drag-over');
                this.elements.menuList.insertBefore(this.state.draggedItem, afterElement);
            } else {
                this.elements.menuList.appendChild(this.state.draggedItem);
            }
        }

        handleDrop(e) {
            e.preventDefault();
        }

        getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll(':scope > li:not(.dragging):not(.role-hidden):not(.menu-divider)')];
            
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        saveMenuOrder() {
            const order = [...this.elements.menuList.children]
                .filter(item => item.dataset.menuId && !item.classList.contains('role-hidden'))
                .map(item => item.dataset.menuId);
            localStorage.setItem(CONFIG.STORAGE.MENU_ORDER, JSON.stringify(order));
            this.log('debug', 'Menu order saved:', order);
        }

        loadMenuOrder() {
            const savedOrder = JSON.parse(localStorage.getItem(CONFIG.STORAGE.MENU_ORDER) || '[]');
            
            if (savedOrder && Array.isArray(savedOrder)) {
                savedOrder.forEach(menuId => {
                    const itemToMove = this.elements.menuList?.querySelector(`li[data-menu-id="${menuId}"]`);
                    if (itemToMove && !itemToMove.classList.contains('role-hidden')) {
                        this.elements.menuList.appendChild(itemToMove);
                    }
                });
                this.log('debug', 'Menu order loaded:', savedOrder);
            }
        }

        // ========================================
        // UI HELPERS
        // ========================================
        
        updateTooltipText() {
            if (this.elements.tooltip) {
                this.elements.tooltip.textContent = this.state.isPinned ? 
                    'Comprimi il menu' : 'Mantieni il menu espanso';
                this.log('debug', `Tooltip updated: ${this.elements.tooltip.textContent}`);
            } else {
                // Tooltip element not found - this is non-critical, just log as debug
                this.log('debug', 'Tooltip element #tooltip not found (non-critical)');
                // Prova a ri-trovare l'elemento in silenzio
                this.elements.tooltip = document.querySelector('#tooltip');
                if (this.elements.tooltip) {
                    this.elements.tooltip.textContent = this.state.isPinned ? 
                        'Comprimi il menu' : 'Mantieni il menu espanso';
                    this.log('debug', `Tooltip re-found and updated: ${this.elements.tooltip.textContent}`);
                }
            }
        }

        animateIcon(svg, fromDeg, toDeg) {
            if (!svg) return;
            
            svg.style.transition = 'none';
            svg.style.transform = `rotate(${fromDeg}deg) scale(1)`;
            
            void svg.getBoundingClientRect();
            
            svg.style.transition = 'transform 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            svg.style.transform = `rotate(${toDeg}deg) scale(${toDeg === 90 ? 1.1 : 1})`;
            
            this.addTimer(setTimeout(() => {
                svg.style.transition = '';
                svg.style.transform = '';
            }, 600));
        }

        animateMenuClick(link) {
            link.style.transform = 'scale(0.98)';
            this.addTimer(setTimeout(() => {
                link.style.transform = '';
            }, 150));
        }

        hasAccessToMenuItem(menuItem) {
            if (!menuItem) return false;
            
            return !menuItem.classList.contains('role-hidden') && 
                   menuItem.style.display !== 'none' &&
                   !menuItem.hasAttribute('data-access-denied');
        }

        hasMinimumRole(requiredRole) {
            const userLevel = this.state.roleLevel;
            const requiredLevel = CONFIG.ROLES[requiredRole]?.level || 100;
            return userLevel >= requiredLevel;
        }

        showAccessDeniedMessage(menuItem) {
            const reason = menuItem?.getAttribute('data-access-denied') || 'Accesso non autorizzato';
            this.log(`Access denied: ${reason}`);
            this.showToast(reason, 'error');
        }

        showToast(message, type = 'info') {
            // Usa TalonApp se disponibile
            if (window.TalonApp?.showToast) {
                window.TalonApp.showToast(message, type);
                return;
            }
            
            // Crea container toast se non esiste
            let toastContainer = document.getElementById('toast-container');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'toast-container';
                toastContainer.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    pointer-events: none;
                `;
                document.body.appendChild(toastContainer);
            }
            
            // Colori per tipo
            const colors = {
                'error': '#dc3545',
                'warning': '#ffc107',
                'success': '#28a745',
                'info': '#17a2b8'
            };
            
            // Icone per tipo
            const icons = {
                'error': '❌',
                'warning': '⚠️',
                'success': '✅',
                'info': 'ℹ️'
            };
            
            // Crea toast
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.style.cssText = `
                background: ${colors[type] || colors.info};
                color: ${type === 'warning' ? '#000' : '#fff'};
                padding: 12px 20px;
                border-radius: 8px;
                margin-bottom: 10px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
                pointer-events: auto;
                font-size: 14px;
                max-width: 350px;
                word-wrap: break-word;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            
            toast.innerHTML = `
                <span style="font-size: 1.2em;">${icons[type] || icons.info}</span>
                <span>${message}</span>
            `;
            
            toastContainer.appendChild(toast);
            
            // Animazione entrata
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(0)';
            });
            
            // Rimozione automatica
            this.addTimer(setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                this.addTimer(setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300));
            }, CONFIG.UI.TOAST_DURATION));
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
                // Salva stato prima del cleanup
                this.saveState();
                
                // Cleanup parziale
                this.clearAllTimers();
            }
        }

        handleSPANavigation() {
            this.log('debug', 'SPA navigation detected');
            
            // Verifica se sidebar ancora esiste
            const sidebar = document.querySelector(CONFIG.SELECTORS.sidebar);
            
            if (sidebar) {
                if (!this.state.initialized) {
                    // Re-inizializza
                    this.init();
                } else {
                    // Refresh componenti
                    this.findElements();
                    this.setupEventHandlers();
                    this.applyRoleRestrictionsToMenu();
                    this.initializeDashboardButtons();
                }
            } else {
                // Sidebar non presente
                if (this.state.initialized) {
                    this.cleanup();
                }
            }
        }

        // ========================================
        // UTILITY
        // ========================================
        
        addTimer(timer) {
            this.timers.add(timer);
            return timer;
        }

        clearAllTimers() {
            this.timers.forEach(timer => clearTimeout(timer));
            this.timers.clear();
        }

        emit(eventName, detail = {}) {
            const event = new CustomEvent(eventName, {
                detail: detail,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
        }

        log(level, ...args) {
            if (!CONFIG.SPA.DEBUG && level === 'debug') return;
            
            const prefix = '[TalonSidebar]';
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

        removeStyles() {
            const styleElement = document.getElementById('sidebar-spa-styles');
            if (styleElement) {
                styleElement.remove();
            }
        }

        // ========================================
        // PUBLIC API - COMPLETA
        // ========================================
        
        pin() {
            if (!this.state.isPinned) {
                this.togglePinned();
            }
        }

        unpin() {
            if (this.state.isPinned) {
                this.togglePinned();
            }
        }

        expand() {
            this.expandSidebar();
        }

        collapse() {
            this.state.isLocked = false;
            this.collapseSidebar();
        }

        toggle() {
            this.state.isPinned ? this.unpin() : this.pin();
        }

        getCurrentRole() {
            return this.state.userRole;
        }

        getRoleLevel() {
            return this.state.roleLevel;
        }

        updateUserRole(newRole) {
            if (!CONFIG.ROLES.hasOwnProperty(newRole)) {
                this.log('error', `Invalid role: ${newRole}`);
                return false;
            }
            
            const oldRole = this.state.userRole;
            this.state.userRole = newRole;
            this.state.roleLevel = CONFIG.ROLES[newRole].level;
            
            this.log(`Role updated from ${oldRole} to ${newRole}`);
            
            // Propaga il nuovo ruolo
            this.propagateUserRole();
            
            // Riapplica tutti i controlli
            this.applyRoleRestrictionsToMenu();
            this.updateUserInfoWithRole();
            this.applyRoleStyles();
            this.applyRoleRestrictionsToButtons();
            
            this.showToast(`Ruolo aggiornato: ${newRole}`, 'success');
            
            return true;
        }

        refreshDashboard() {
            this.initializeDashboardButtons();
            this.showToast('Dashboard aggiornata', 'info');
        }

        forceShowAllMenus() {
            if (this.state.userRole !== 'ADMIN') {
                this.showToast('Solo ADMIN può usare questa funzione', 'error');
                return;
            }
            
            document.querySelectorAll('.sidebar li.role-hidden').forEach(item => {
                item.classList.remove('role-hidden');
                item.style.display = '';
                item.removeAttribute('aria-hidden');
            });
            this.showToast('Tutti i menu mostrati (debug mode)', 'warning');
        }

        enableAllButtons() {
            if (this.state.userRole !== 'ADMIN') {
                this.showToast('Solo ADMIN può usare questa funzione', 'error');
                return;
            }
            
            document.querySelectorAll('button[disabled], .btn[disabled]').forEach(btn => {
                btn.disabled = false;
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
            });
            this.showToast('Tutti i bottoni abilitati (debug mode)', 'warning');
        }

        getStats() {
            const totalMenuItems = this.elements.menuList?.querySelectorAll('li:not(.menu-divider)').length || 0;
            const visibleMenuItems = this.elements.menuList?.querySelectorAll('li:not(.menu-divider):not(.role-hidden)').length || 0;
            const hiddenMenuItems = totalMenuItems - visibleMenuItems;
            
            return {
                role: this.state.userRole,
                roleLevel: this.getRoleLevel(),
                isPinned: this.state.isPinned,
                isExpanded: this.state.isExpanded,
                menuItems: {
                    total: totalMenuItems,
                    visible: visibleMenuItems,
                    hidden: hiddenMenuItems
                }
            };
        }
    }

    // ========================================
    // STILI CSS
    // ========================================
    
    function injectStyles() {
        if (document.getElementById('sidebar-spa-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'sidebar-spa-styles';
        styles.textContent = `
            /* Animazioni */
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            /* Controlli ruolo */
            .sidebar li[draggable="false"] {
                cursor: not-allowed !important;
            }
            
            .sidebar li.role-hidden {
                display: none !important;
            }
            
            /* Toast notifications */
            #toast-container {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .toast {
                animation: fadeIn 0.3s ease;
            }
            
            /* Bottoni disabilitati */
            button[disabled], .btn[disabled] {
                opacity: 0.6 !important;
                cursor: not-allowed !important;
                pointer-events: none !important;
            }
            
            button[data-disabled-reason] {
                position: relative;
            }
            
            /* Elementi admin */
            [data-admin-only] {
                transition: opacity 0.3s ease;
            }
            
            body:not([data-user-role="ADMIN"]) [data-admin-only] {
                display: none !important;
            }
            
            /* Indicatori ruolo */
            .sidebar.role-admin {
                --current-role-color: var(--role-admin-color, #dc3545);
            }
            
            .sidebar.role-operatore {
                --current-role-color: var(--role-operatore-color, #fd7e14);
            }
            
            .sidebar.role-visualizzatore {
                --current-role-color: var(--role-visualizzatore-color, #0d6efd);
            }
            
            .sidebar.role-guest {
                --current-role-color: #6c757d;
            }
            
            /* Badge ruolo con colore dinamico */
            .user-role-badge {
                background-color: var(--current-role-color) !important;
            }
        `;
        
        document.head.appendChild(styles);
    }

    // ========================================
    // INIZIALIZZAZIONE GLOBALE
    // ========================================
    
    // Inizializza su DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSidebar);
    } else {
        initializeSidebar();
    }
    
    function initializeSidebar() {
        console.log('[TalonSidebar] DOM ready, initializing v3.0.0...');
        
        // Inietta stili
        injectStyles();
        
        // Crea istanza globale
        window.talonSidebar = new TalonSidebar();
        window.talonSidebar.init();
        
        // API pubblica completa
        window.sidebarAPI = {
            // API base
            pin: () => window.talonSidebar.pin(),
            unpin: () => window.talonSidebar.unpin(),
            expand: () => window.talonSidebar.expand(),
            collapse: () => window.talonSidebar.collapse(),
            toggle: () => window.talonSidebar.toggle(),
            
            // API ruoli
            getCurrentRole: () => window.talonSidebar.getCurrentRole(),
            getRoleLevel: () => window.talonSidebar.getRoleLevel(),
            updateRole: (role) => window.talonSidebar.updateUserRole(role),
            hasMinimumRole: (role) => window.talonSidebar.hasMinimumRole(role),
            
            // API dashboard
            refreshDashboard: () => window.talonSidebar.refreshDashboard(),
            
            // API debug (solo ADMIN)
            debug: {
                showAllMenus: () => window.talonSidebar.forceShowAllMenus(),
                enableAllButtons: () => window.talonSidebar.enableAllButtons(),
                getStats: () => window.talonSidebar.getStats()
            },
            
            // API utility
            showToast: (message, type) => window.talonSidebar.showToast(message, type),
            navigate: (route) => window.talonSidebar.navigateToRoute(route),
            
            // Info
            version: '3.0.0',
            isInitialized: () => window.talonSidebar.state.initialized,
            status: () => window.talonSidebar.getStats()
        };
        
        // Esponi anche classe per estensioni
        window.TalonSidebar = TalonSidebar;
        
        console.log('[TalonSidebar] ✅ Version 3.0.0 SPA initialized!');
        console.log('[TalonSidebar] API available at window.sidebarAPI');
        console.log('[TalonSidebar] Status:', window.sidebarAPI.status());
    }

})(window, document);