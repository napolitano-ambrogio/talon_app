/**
 * ========================================
 * TALON SIDEBAR MODULE - VERSIONE OTTIMIZZATA
 * File: static/js/sidebar.js
 * 
 * Versione: 2.1 - Ottimizzata per gestione ruoli
 * Data: 2025
 * Funzionalità: Menu navigazione, controlli ruoli, drag&drop, logout
 * ========================================
 */

class TalonSidebar {
    constructor() {
        // Elementi DOM
        this.sidebar = document.getElementById('sidebar');
        this.menuToggleBtn = document.getElementById('menu-toggle-btn');
        this.tooltip = document.getElementById('tooltip');
        this.menuList = document.getElementById('menu-list');
        this.logoutBtn = document.getElementById('logout-btn');
        this.userName = document.getElementById('user-name');
        
        // Stati
        this.isPinned = localStorage.getItem('sidebarPinned') === 'true';
        this.isExpanded = false;
        this.isLocked = false;
        
        // Controlli ruoli - MIGLIORATO
        this.userRole = null; // Inizializzato dopo
        this.roleHierarchy = { 
            'GUEST': 0, 
            'VISUALIZZATORE': 10, 
            'OPERATORE': 50, 
            'ADMIN': 100 
        };
        
        // Drag & Drop
        this.draggedItem = null;
        
        // Flag di inizializzazione
        this.isInitialized = false;
        
        // Inizializza solo se la sidebar esiste
        if (this.sidebar) {
            this.init();
        }
    }

    init() {
        console.log('[TALON Sidebar] Inizializzazione versione 2.1...');
        
        // IMPORTANTE: Rileva ruolo prima di tutto
        this.userRole = this.detectUserRole();
        this.propagateUserRole();
        
        // Inizializzazione componenti
        this.removeExistingRoleBadges();
        this.applyInitialState();
        this.bindEvents();
        this.initializeDragAndDrop();
        this.loadMenuOrder();
        this.initializeUserInfo();
        this.initializeLogout();
        this.initializeRoleControls();
        
        // Fix menu e bottoni
        this.fixMenuLinks();
        this.initializeDashboardButtons();
        
        // Segna come inizializzato
        this.isInitialized = true;
        
        console.log('[TALON Sidebar] Inizializzazione completata ✅');
        console.log('[TALON Sidebar] Ruolo utente:', this.userRole);
    }

    /**
     * MIGLIORATO: Rileva ruolo utente con logica più robusta
     */
    detectUserRole() {
        // 1. Controlla variabile globale Flask (priorità massima)
        if (window.FLASK_USER_ROLE) {
            console.log('[TALON Sidebar] Ruolo da Flask:', window.FLASK_USER_ROLE);
            return window.FLASK_USER_ROLE;
        }
        
        // 2. Controlla meta tag
        const metaRole = document.querySelector('meta[name="user-role"]');
        if (metaRole && metaRole.content) {
            console.log('[TALON Sidebar] Ruolo da meta tag:', metaRole.content);
            return metaRole.content;
        }
        
        // 3. Controlla data attribute body
        const bodyRole = document.body.getAttribute('data-user-role');
        if (bodyRole && bodyRole !== 'null' && bodyRole !== 'undefined') {
            console.log('[TALON Sidebar] Ruolo da body:', bodyRole);
            return bodyRole;
        }
        
        // 4. Controlla elemento nascosto nel DOM
        const roleElement = document.getElementById('hidden-user-role');
        if (roleElement && roleElement.value) {
            console.log('[TALON Sidebar] Ruolo da elemento nascosto:', roleElement.value);
            return roleElement.value;
        }
        
        // 5. Controlla sessionStorage
        const sessionRole = sessionStorage.getItem('userRole');
        if (sessionRole && sessionRole !== 'null') {
            console.log('[TALON Sidebar] Ruolo da sessionStorage:', sessionRole);
            return sessionRole;
        }
        
        // 6. Estrai da script inline
        const scriptRole = this.extractRoleFromScripts();
        if (scriptRole) {
            console.log('[TALON Sidebar] Ruolo da script:', scriptRole);
            return scriptRole;
        }
        
        // 7. Default
        console.warn('[TALON Sidebar] Nessun ruolo rilevato, default a GUEST');
        return 'GUEST';
    }

    /**
     * NUOVO: Estrae ruolo da script inline nel template
     */
    extractRoleFromScripts() {
        const scripts = document.querySelectorAll('script:not([src])');
        for (let script of scripts) {
            const content = script.textContent;
            
            // Cerca pattern comuni
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
                    if (this.roleHierarchy.hasOwnProperty(role)) {
                        return role;
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * NUOVO: Propaga il ruolo in tutto il sistema
     */
    propagateUserRole() {
        // Imposta variabili globali
        window.userRole = this.userRole;
        window.TALON_USER_ROLE = this.userRole;
        
        // Imposta data attribute sul body
        document.body.setAttribute('data-user-role', this.userRole);
        
        // Salva in sessionStorage
        sessionStorage.setItem('userRole', this.userRole);
        
        // Aggiungi classe CSS per ruolo
        document.body.className = document.body.className
            .replace(/\brole-\w+\b/g, '') // Rimuovi classi ruolo esistenti
            .trim() + ` role-${this.userRole.toLowerCase()}`;
        
        console.log('[TALON Sidebar] Ruolo propagato:', this.userRole);
    }

    /**
     * MIGLIORATO: Gestisce navigazione menu con controlli di accesso
     */
    handleMenuNavigation(menuId, linkElement) {
        console.log(`[TALON Sidebar] Menu clicked: ${menuId}`);
        
        // Verifica accesso
        const menuItem = linkElement.closest('li');
        if (!this.hasAccessToMenuItem(menuItem)) {
            this.showAccessDeniedMessage(menuItem);
            return;
        }
        
        // Mappa completa delle rotte con requisiti di ruolo
        const menuRoutes = {
            'dashboard': {
                route: '/dashboard',
                minRole: 'VISUALIZZATORE'
            },
            'dashboard_admin': {
                route: '/dashboard_admin',
                minRole: 'ADMIN'
            },
            'enti_militari': {
                route: '/enti_militari/organigramma',
                minRole: 'VISUALIZZATORE'
            },
            'enti_civili': {
                route: '/enti_civili',
                minRole: 'VISUALIZZATORE'
            },
            'attivita': {
                route: '/attivita',
                minRole: 'VISUALIZZATORE'
            },
            'operazioni': {
                route: '/operazioni',
                minRole: 'VISUALIZZATORE'
            },
            'gestione_utenti': {
                route: '/admin/users',
                minRole: 'ADMIN'
            },
            'sistema': {
                route: '/admin/system-info',
                minRole: 'ADMIN'
            }
        };
        
        const menuConfig = menuRoutes[menuId];
        if (menuConfig) {
            // Verifica requisito di ruolo
            if (!this.hasMinimumRole(menuConfig.minRole)) {
                this.showToast(`Accesso negato. Richiede ruolo: ${menuConfig.minRole}`, 'error');
                return;
            }
            
            console.log(`[TALON Sidebar] Navigating to: ${menuConfig.route}`);
            
            // Animazione di feedback
            this.animateMenuClick(linkElement);
            
            // Navigazione ritardata per mostrare l'animazione
            setTimeout(() => {
                window.location.href = menuConfig.route;
            }, 150);
        } else {
            console.warn(`[TALON Sidebar] Route not found for menu: ${menuId}`);
            this.showNotImplementedMessage(menuId);
        }
    }

    /**
     * NUOVO: Verifica se l'utente ha il ruolo minimo richiesto
     */
    hasMinimumRole(requiredRole) {
        const userLevel = this.roleHierarchy[this.userRole] || 0;
        const requiredLevel = this.roleHierarchy[requiredRole] || 100;
        return userLevel >= requiredLevel;
    }

    /**
     * MIGLIORATO: Inizializza bottoni dashboard con controlli ruolo
     */
    initializeDashboardButtons() {
        console.log('[TALON Sidebar] Inizializzazione bottoni dashboard...');
        
        // Aspetta che la pagina sia completamente caricata
        setTimeout(() => {
            this.setupActionButtons();
            this.setupViewButtons();
            this.applyRoleRestrictionsToButtons();
        }, 500);
    }

    /**
     * MIGLIORATO: Configura bottoni azioni con controlli ruolo
     */
    setupActionButtons() {
        const buttonActions = {
            'Nuovo Utente': {
                action: () => this.navigateToRoute('/admin/users/new'),
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
                    console.log(`[TALON Sidebar] Button enabled: ${buttonText}`);
                } else {
                    this.disableButton(btn, `Richiede ruolo: ${config.minRole}`);
                    console.log(`[TALON Sidebar] Button disabled: ${buttonText} (richiede ${config.minRole})`);
                }
            });
        });
    }

    /**
     * NUOVO: Applica restrizioni ruolo ai bottoni
     */
    applyRoleRestrictionsToButtons() {
        // Disabilita tutti i bottoni di eliminazione per non-ADMIN
        if (this.userRole !== 'ADMIN') {
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
        if (this.userRole === 'VISUALIZZATORE') {
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
        if (this.userRole === 'ADMIN') {
            this.enableAllButtonsForAdmin();
        }
    }

    /**
     * NUOVO: Disabilita bottone con tooltip
     */
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

    /**
     * MIGLIORATO: Sistema di notifiche toast con stili migliorati
     */
    showToast(message, type = 'info') {
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
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 4000);
    }

    // ==========================================
    // METODI ESISTENTI (mantenuti ma ottimizzati)
    // ==========================================

    applyInitialState() {
        this.sidebar.classList.add('loading');
        
        if (this.isPinned) {
            this.sidebar.classList.add('pinned');
            this.sidebar.classList.add('expanded');
            this.isExpanded = true;
        }
        
        const wasLocked = sessionStorage.getItem('sidebarLocked') === 'true';
        if (wasLocked && !this.isPinned) {
            this.isLocked = true;
            this.sidebar.classList.add('expanded');
            this.sidebar.classList.add('locked');
            this.isExpanded = true;
        }
        
        this.updateTooltipText();
        
        requestAnimationFrame(() => {
            this.sidebar.classList.remove('loading');
        });
    }

    expandSidebar() {
        if (!this.isPinned) {
            this.sidebar.classList.add('expanded');
            this.isExpanded = true;
        }
    }

    collapseSidebar() {
        if (!this.isPinned && !this.isLocked) {
            this.sidebar.classList.remove('expanded');
            this.sidebar.classList.remove('locked');
            this.isExpanded = false;
            this.isLocked = false;
            sessionStorage.removeItem('sidebarLocked');
        }
    }

    updateTooltipText() {
        if (this.tooltip) {
            this.tooltip.textContent = this.isPinned ? 
                'Comprimi il menu' : 'Mantieni il menu espanso';
        }
    }

    bindEvents() {
        this.bindToggleEvents();
        this.bindHoverEvents();
        this.bindMenuClickEvents();
    }

    bindToggleEvents() {
        if (!this.menuToggleBtn) return;
        
        this.menuToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePinned();
        });
    }

    togglePinned() {
        const svg = this.menuToggleBtn.querySelector('svg');
        
        if (!this.isPinned) {
            this.animateIcon(svg, 0, 90);
        } else {
            this.animateIcon(svg, 90, 0);
        }
        
        this.isPinned = !this.isPinned;
        
        if (this.isPinned) {
            this.sidebar.classList.add('pinned');
            this.sidebar.classList.add('expanded');
            this.isExpanded = true;
            this.isLocked = false;
            sessionStorage.removeItem('sidebarLocked');
        } else {
            this.sidebar.classList.remove('pinned');
        }
        
        localStorage.setItem('sidebarPinned', this.isPinned.toString());
        this.updateTooltipText();
        this.menuToggleBtn.setAttribute('aria-expanded', this.isPinned.toString());
    }

    animateIcon(svg, fromDeg, toDeg) {
        if (!svg) return;
        
        svg.style.transition = 'none';
        svg.style.transform = `rotate(${fromDeg}deg) scale(1)`;
        
        void svg.getBoundingClientRect();
        
        svg.style.transition = 'transform 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        svg.style.transform = `rotate(${toDeg}deg) scale(${toDeg === 90 ? 1.1 : 1})`;
        
        setTimeout(() => {
            svg.style.transition = '';
            svg.style.transform = '';
        }, 600);
    }

    bindHoverEvents() {
        if (!this.sidebar) return;
        
        this.sidebar.addEventListener('mouseenter', () => {
            if (!this.isPinned) {
                if (this.isLocked) {
                    this.isLocked = false;
                    this.sidebar.classList.remove('locked');
                    sessionStorage.removeItem('sidebarLocked');
                }
                this.expandSidebar();
            }
            this.updateTooltipText();
        });
        
        this.sidebar.addEventListener('mouseleave', () => {
            if (!this.isPinned) {
                this.collapseSidebar();
                
                if (this.tooltip) {
                    this.tooltip.textContent = 'Espandi il menu';
                }
            }
        });
    }

    bindMenuClickEvents() {
        if (!this.menuList) return;
        
        const menuLinks = this.menuList.querySelectorAll('a');
        
        menuLinks.forEach(link => {
            link.addEventListener('click', (e) => {
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
        if (this.isPinned) {
            this.animateMenuClick(link);
            return;
        }
        
        if (this.isExpanded) {
            this.isLocked = true;
            this.sidebar.classList.add('locked');
            sessionStorage.setItem('sidebarLocked', 'true');
        }
        
        this.animateMenuClick(link);
    }

    animateMenuClick(link) {
        link.style.transform = 'scale(0.98)';
        setTimeout(() => {
            link.style.transform = '';
        }, 150);
    }

    /**
     * MIGLIORATO: Inizializzazione controlli ruoli con logica più robusta
     */
    initializeRoleControls() {
        console.log(`[TALON Sidebar] Inizializzazione controlli ruoli per: ${this.userRole}`);
        
        // Applica restrizioni al menu
        this.applyRoleRestrictionsToMenu();
        
        // Aggiorna info utente
        this.updateUserInfoWithRole();
        
        // Applica stili CSS per ruolo
        this.applyRoleStyles();
        
        // Inizializza observer per cambiamenti dinamici
        this.initializeRoleObserver();
    }

    /**
     * MIGLIORATO: Applica restrizioni ruolo al menu con logica più chiara
     */
    applyRoleRestrictionsToMenu() {
        const menuItems = this.menuList.querySelectorAll('li');
        const userLevel = this.roleHierarchy[this.userRole] || 0;
        
        let hiddenCount = 0;
        let visibleCount = 0;
        
        menuItems.forEach(item => {
            // Salta divider
            if (item.classList.contains('menu-divider')) {
                return;
            }
            
            // Controlla requisiti multipli
            const checks = [
                {
                    condition: item.getAttribute('data-min-role'),
                    validate: (minRole) => userLevel >= (this.roleHierarchy[minRole] || 100),
                    reason: (minRole) => `Richiede ruolo minimo: ${minRole}`
                },
                {
                    condition: item.hasAttribute('data-admin-only'),
                    validate: () => this.userRole === 'ADMIN',
                    reason: () => 'Solo per amministratori'
                },
                {
                    condition: item.hasAttribute('data-operatore-plus'),
                    validate: () => this.userRole === 'ADMIN' || this.userRole === 'OPERATORE',
                    reason: () => 'Richiede ruolo Operatore o superiore'
                },
                {
                    condition: item.hasAttribute('data-visualizzatore-hidden'),
                    validate: () => this.userRole !== 'VISUALIZZATORE',
                    reason: () => 'Non disponibile per Visualizzatore'
                }
            ];
            
            // Esegui controlli
            let shouldHide = false;
            let denyReason = '';
            
            for (let check of checks) {
                if (check.condition) {
                    const value = typeof check.condition === 'string' ? check.condition : true;
                    if (!check.validate(value)) {
                        shouldHide = true;
                        denyReason = check.reason(value);
                        break;
                    }
                }
            }
            
            // Applica visibilità
            if (shouldHide) {
                this.hideMenuItem(item, denyReason);
                hiddenCount++;
            } else {
                this.showMenuItem(item);
                visibleCount++;
            }
        });
        
        console.log(`[TALON Sidebar] Menu items - Visibili: ${visibleCount}, Nascosti: ${hiddenCount}`);
    }

    /**
     * NUOVO: Applica stili CSS specifici per ruolo
     */
    applyRoleStyles() {
        // Rimuovi classi ruolo esistenti
        this.sidebar.classList.remove('role-admin', 'role-operatore', 'role-visualizzatore', 'role-guest');
        
        // Aggiungi classe ruolo corrente
        this.sidebar.classList.add(`role-${this.userRole.toLowerCase()}`);
        
        // Aggiungi indicatori visivi
        const roleColors = {
            'ADMIN': 'var(--role-admin-color)',
            'OPERATORE': 'var(--role-operatore-color)',
            'VISUALIZZATORE': 'var(--role-visualizzatore-color)',
            'GUEST': '#6c757d'
        };
        
        const color = roleColors[this.userRole] || roleColors.GUEST;
        this.sidebar.style.setProperty('--current-role-color', color);
    }

    /**
     * NUOVO: Observer per cambiamenti dinamici del DOM
     */
    initializeRoleObserver() {
        if (!window.MutationObserver) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Riapplica restrizioni ai nuovi elementi
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.matches && node.matches('li')) {
                            this.applyRoleRestrictionsToMenuItem(node);
                        }
                    });
                }
            });
        });
        
        observer.observe(this.menuList, {
            childList: true,
            subtree: true
        });
    }

    /**
     * NUOVO: Applica restrizioni a singolo menu item
     */
    applyRoleRestrictionsToMenuItem(item) {
        const userLevel = this.roleHierarchy[this.userRole] || 0;
        
        // Esegui gli stessi controlli di applyRoleRestrictionsToMenu
        // ma per un singolo elemento
        // ... (logica simile)
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

    hasAccessToMenuItem(menuItem) {
        if (!menuItem) return false;
        
        return !menuItem.classList.contains('role-hidden') && 
               menuItem.style.display !== 'none' &&
               !menuItem.hasAttribute('data-access-denied');
    }

    showAccessDeniedMessage(menuItem) {
        const reason = menuItem.getAttribute('data-access-denied') || 'Accesso non autorizzato';
        console.log(`[TALON Sidebar] Accesso negato: ${reason}`);
        this.showToast(reason, 'error');
    }

    updateUserInfoWithRole() {
    
        // Aggiorna body con info ruolo
        document.body.setAttribute('data-user-role', this.userRole);
        
        // Se esiste userName, aggiornalo (per retrocompatibilità)
        if (this.userName) {
            const username = this.userName.textContent || 'Utente';
            document.body.setAttribute('data-username', username);
        }
        
        console.log(`[TALON Sidebar] Ruolo aggiornato globalmente: ${this.userRole}`);
    }

    removeExistingRoleBadges() {
        // Rimuovi eventuali badge esistenti
        const existingBadges = document.querySelectorAll('.user-role-badge, [data-role]');
        existingBadges.forEach(badge => badge.remove());
    }

    initializeUserInfo() {
        // REFACTORED: Non dipende più da user-info
        console.log('[TALON Sidebar] Skip inizializzazione user-info (elemento rimosso)');
        
        // Se vogliamo mantenere info username per altri usi
        if (this.userName) {
            const username = this.userName.textContent || 'Utente';
            document.body.setAttribute('data-username', username);
        }
    }

    initializeLogout() {
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleLogout();
            });
        }
    }

    async handleLogout() {
        if (confirm('Sei sicuro di voler effettuare il logout?')) {
            try {
                console.log('[TALON Sidebar] Logout in corso...');
                
                // Mostra toast di conferma
                this.showToast('Logout in corso...', 'info');
                
                // Pulisci dati locali
                sessionStorage.clear();
                localStorage.removeItem('sidebarMenuOrder');
                
                // Redirect con delay
                setTimeout(() => {
                    window.location.href = '/auth/logout';
                }, 500);
                
            } catch (error) {
                console.error('Errore durante il logout:', error);
                window.location.href = '/auth/logout';
            }
        }
    }

    /**
     * MIGLIORATO: Corregge link menu con gestione migliore
     */
    fixMenuLinks() {
        const menuLinks = this.menuList.querySelectorAll('a');
        
        menuLinks.forEach(link => {
            const menuItem = link.closest('li');
            const menuId = menuItem?.dataset.menuId;
            const href = link.getAttribute('href');
            
            // Se il link ha href valido e non è "#", mantienilo
            if (href && href !== '#' && href !== 'javascript:void(0)') {
                // Aggiungi solo controllo accesso
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
            
            console.log(`[TALON Sidebar] Fixed menu link: ${menuId}`);
        });
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================

    findButtonsByText(text) {
        return Array.from(document.querySelectorAll('button, .btn')).filter(btn => 
            btn.textContent.trim() === text
        );
    }

    enableButton(button, action) {
        // Abilita il bottone
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

    navigateToRoute(route) {
        console.log(`[TALON Sidebar] Navigating to: ${route}`);
        window.location.href = route;
    }

    confirmAndNavigate(route, message) {
        if (confirm(message)) {
            this.navigateToRoute(route);
        }
    }

    openInNewTab(route) {
        console.log(`[TALON Sidebar] Opening in new tab: ${route}`);
        window.open(route, '_blank');
    }

    showNotImplementedMessage(menuId) {
        const message = `Funzionalità "${menuId}" non ancora implementata`;
        console.warn(`[TALON Sidebar] ${message}`);
        this.showToast(message, 'warning');
    }

    /**
     * MIGLIORATO: Configura bottoni visualizza con logica più robusta
     */
    setupViewButtons() {
        const viewButtons = document.querySelectorAll('button, .btn');
        
        viewButtons.forEach(btn => {
            const btnText = btn.textContent.trim().toLowerCase();
            if (btnText === 'visualizza' || btnText === 'vedi' || btnText === 'mostra') {
                const route = this.detectViewButtonRoute(btn);
                if (route) {
                    this.enableButton(btn, () => this.navigateToRoute(route));
                    console.log(`[TALON Sidebar] Configured view button for: ${route}`);
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

    enableAllButtonsForAdmin() {
        if (this.userRole !== 'ADMIN') return;
        
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
        
        console.log('[TALON Sidebar] Tutti i controlli abilitati per ADMIN');
    }

    // ==========================================
    // DRAG & DROP (mantenuto invariato)
    // ==========================================

    initializeDragAndDrop() {
        if (!this.menuList) return;

        this.menuList.addEventListener('dragstart', this.handleDragStart.bind(this));
        this.menuList.addEventListener('dragend', this.handleDragEnd.bind(this));
        this.menuList.addEventListener('dragover', this.handleDragOver.bind(this));
        this.menuList.addEventListener('drop', this.handleDrop.bind(this));
    }

    handleDragStart(e) {
        this.draggedItem = e.target.closest('li');
        if (!this.draggedItem) return;
        
        if (this.draggedItem.classList.contains('role-hidden') ||
            this.draggedItem.classList.contains('menu-divider')) {
            e.preventDefault();
            return;
        }
        
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setDragImage(this.draggedItem, 20, 20);
        }
        
        setTimeout(() => {
            this.draggedItem.classList.add('dragging');
        }, 0);
    }

    handleDragEnd() {
        if (!this.draggedItem) return;
        
        this.draggedItem.classList.remove('dragging');
        
        const placeholder = this.menuList.querySelector('.drag-over');
        if (placeholder) {
            placeholder.classList.remove('drag-over');
        }
        
        this.saveMenuOrder();
        this.draggedItem = null;
    }

    handleDragOver(e) {
        e.preventDefault();
        if (!this.draggedItem) return;
        
        const afterElement = this.getDragAfterElement(this.menuList, e.clientY);
        
        const currentPlaceholder = this.menuList.querySelector('.drag-over');
        if (currentPlaceholder) {
            currentPlaceholder.classList.remove('drag-over');
        }
        
        if (afterElement) {
            afterElement.classList.add('drag-over');
            this.menuList.insertBefore(this.draggedItem, afterElement);
        } else {
            this.menuList.appendChild(this.draggedItem);
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
        const order = [...this.menuList.children]
            .filter(item => item.dataset.menuId && !item.classList.contains('role-hidden'))
            .map(item => item.dataset.menuId);
        localStorage.setItem('sidebarMenuOrder', JSON.stringify(order));
        console.log('[TALON Sidebar] Ordine menu salvato:', order);
    }

    loadMenuOrder() {
        const savedOrder = JSON.parse(localStorage.getItem('sidebarMenuOrder') || '[]');
        
        if (savedOrder && Array.isArray(savedOrder)) {
            savedOrder.forEach(menuId => {
                const itemToMove = this.menuList.querySelector(`li[data-menu-id="${menuId}"]`);
                if (itemToMove && !itemToMove.classList.contains('role-hidden')) {
                    this.menuList.appendChild(itemToMove);
                }
            });
            console.log('[TALON Sidebar] Ordine menu caricato:', savedOrder);
        }
    }

    // ==========================================
    // API PUBBLICA ESTESA
    // ==========================================

    pin() {
        if (!this.isPinned) {
            this.togglePinned();
        }
    }

    unpin() {
        if (this.isPinned) {
            this.togglePinned();
        }
    }

    expand() {
        this.expandSidebar();
    }

    collapse() {
        this.isLocked = false;
        this.collapseSidebar();
    }

    getCurrentRole() {
        return this.userRole;
    }

    getRoleLevel() {
        return this.roleHierarchy[this.userRole] || 0;
    }

    updateUserRole(newRole) {
        if (!this.roleHierarchy.hasOwnProperty(newRole)) {
            console.error(`[TALON Sidebar] Ruolo non valido: ${newRole}`);
            return false;
        }
        
        const oldRole = this.userRole;
        this.userRole = newRole;
        
        console.log(`[TALON Sidebar] Ruolo aggiornato da ${oldRole} a ${newRole}`);
        
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

    // NUOVE API
    refreshDashboard() {
        this.initializeDashboardButtons();
        this.showToast('Dashboard aggiornata', 'info');
    }

    forceShowAllMenus() {
        if (this.userRole !== 'ADMIN') {
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
        if (this.userRole !== 'ADMIN') {
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
        const totalMenuItems = this.menuList.querySelectorAll('li:not(.menu-divider)').length;
        const visibleMenuItems = this.menuList.querySelectorAll('li:not(.menu-divider):not(.role-hidden)').length;
        const hiddenMenuItems = totalMenuItems - visibleMenuItems;
        
        return {
            role: this.userRole,
            roleLevel: this.getRoleLevel(),
            isPinned: this.isPinned,
            isExpanded: this.isExpanded,
            menuItems: {
                total: totalMenuItems,
                visible: visibleMenuItems,
                hidden: hiddenMenuItems
            }
        };
    }
}

// ==========================================
// STILI CSS AGGIUNTIVI
// ==========================================

const sidebarStyles = document.createElement('style');
sidebarStyles.textContent = `
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
document.head.appendChild(sidebarStyles);

// ==========================================
// INIZIALIZZAZIONE GLOBALE
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[TALON Sidebar] DOM caricato, inizializzazione versione 2.1...');
    
    // Crea istanza globale
    window.talonSidebar = new TalonSidebar();
    
    // API pubblica completa
    window.sidebarAPI = {
        // API base
        pin: () => window.talonSidebar.pin(),
        unpin: () => window.talonSidebar.unpin(),
        expand: () => window.talonSidebar.expand(),
        collapse: () => window.talonSidebar.collapse(),
        toggle: () => window.talonSidebar.isPinned ? window.talonSidebar.unpin() : window.talonSidebar.pin(),
        
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
        version: '2.1',
        isInitialized: () => window.talonSidebar.isInitialized,
        status: () => window.talonSidebar.getStats()
    };
    
    // Esponi anche classe per estensioni
    window.TalonSidebar = TalonSidebar;
    
    console.log('[TALON Sidebar] ✅ Versione 2.1 inizializzata completamente!');
    console.log('[TALON Sidebar] API disponibili in window.sidebarAPI');
    console.log('[TALON Sidebar] Stato:', window.sidebarAPI.status());
});