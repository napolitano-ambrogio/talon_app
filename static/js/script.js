/**
 * ========================================
 * TALON SIDEBAR MODULE - COMPLETE UPDATED VERSION
 * File: static/js/sidebar.js
 * 
 * Versione: 2.0 - Completamente aggiornata
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
        this.userInfo = document.getElementById('user-info');
        this.userName = document.getElementById('user-name');
        
        // Stati
        this.isPinned = localStorage.getItem('sidebarPinned') === 'true';
        this.isExpanded = false;
        this.isLocked = false;
        
        // Controlli ruoli
        this.userRole = this.getUserRole();
        this.roleHierarchy = { 'GUEST': 0, 'VISUALIZZATORE': 1, 'OPERATORE': 2, 'ADMIN': 3 };
        
        // Drag & Drop
        this.draggedItem = null;
        
        // Inizializza solo se la sidebar esiste
        if (this.sidebar) {
            this.init();
        }
    }

    init() {
        console.log('[TALON Sidebar] Inizializzazione versione 2.0...');
        this.applyInitialState();
        this.bindEvents();
        this.initializeDragAndDrop();
        this.loadMenuOrder();
        this.initializeUserInfo();
        this.initializeLogout();
        this.initializeRoleControls();
        
        // FIX: Gestione menu e bottoni
        this.fixMenuLinks();
        this.initializeDashboardButtons();
        
        console.log('[TALON Sidebar] Inizializzazione completata ✅');
    }

    /**
     * AGGIORNATO: Rileva ruolo utente con priorità corretta
     */
    getUserRole() {
        // Ordine di priorità per il rilevamento ruolo
        const roleFromWindow = window.userRole;
        const roleFromBody = document.body.getAttribute('data-user-role');
        const roleFromSession = sessionStorage.getItem('userRole');
        const roleFromTemplate = this.getRoleFromTemplate();
        
        const detectedRole = roleFromWindow || roleFromBody || roleFromTemplate || roleFromSession || 'GUEST';
        
        console.log('[TALON Sidebar] Rilevamento ruolo:');
        console.log('  - Window:', roleFromWindow);
        console.log('  - Body:', roleFromBody);
        console.log('  - Session:', roleFromSession);
        console.log('  - Template:', roleFromTemplate);
        console.log('  - Finale:', detectedRole);
        
        return detectedRole;
    }

    /**
     * NUOVO: Estrae ruolo dal template Flask (se disponibile)
     */
    getRoleFromTemplate() {
        // Cerca script tags con informazioni ruolo
        const scripts = document.querySelectorAll('script');
        for (let script of scripts) {
            const content = script.textContent;
            if (content.includes('ruolo_nome') || content.includes('userRole')) {
                const roleMatch = content.match(/['"]ADMIN['"]|['"]OPERATORE['"]|['"]VISUALIZZATORE['"]|['"]GUEST['"]/);
                if (roleMatch) {
                    return roleMatch[0].replace(/['"]/g, '');
                }
            }
        }
        
        // Cerca in attributi data del body
        const bodyRole = document.body.getAttribute('data-user-role');
        if (bodyRole && bodyRole !== 'null' && bodyRole !== 'undefined') {
            return bodyRole;
        }
        
        return null;
    }

    /**
     * AGGIORNATO: Corregge link menu senza href e gestisce navigazione
     */
    fixMenuLinks() {
        const menuLinks = this.menuList.querySelectorAll('a');
        
        menuLinks.forEach(link => {
            const menuItem = link.closest('li');
            const menuId = menuItem?.dataset.menuId;
            const href = link.getAttribute('href');
            
            // Se il link ha href="#" o è vuoto, sostituiscilo con navigazione JavaScript
            if (!href || href === '#' || href === 'javascript:void(0)') {
                link.removeAttribute('href');
                link.style.cursor = 'pointer';
                
                // Rimuovi vecchi event listeners
                const newLink = link.cloneNode(true);
                link.parentNode.replaceChild(newLink, link);
                
                // Aggiungi nuovo event listener
                newLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleMenuNavigation(menuId, newLink);
                });
                
                console.log(`[TALON Sidebar] Fixed menu link: ${menuId}`);
            }
        });
    }

    /**
     * AGGIORNATO: Gestisce navigazione menu con rotte corrette
     */
    handleMenuNavigation(menuId, linkElement) {
        console.log(`[TALON Sidebar] Menu clicked: ${menuId}`);
        
        // Verifica accesso
        const menuItem = linkElement.closest('li');
        if (!this.hasAccessToMenuItem(menuItem)) {
            this.showAccessDeniedMessage(menuItem);
            return;
        }
        
        // Mappa completa delle rotte CORRETTE
        const menuRoutes = {
            'dashboard': '/dashboard',                    // Dashboard Superset (dashboard.html)
            'dashboard_admin': '/dashboard_admin',        // Dashboard Admin (dashboard_admin.html)
            'enti_militari': '/enti_militari/organigramma', // Organigramma (organigramma.html)
            'enti_civili': '/enti_civili',               // Lista Enti Civili
            'attivita': '/attivita',                     // Lista Attività (lista_attivita.html)
            'operazioni': '/operazioni',                 // Lista Operazioni (lista_operazioni.html)
            'gestione_utenti': '/admin/users',           // Gestione Utenti
            'sistema': '/admin/system-info'              // Sistema
        };
        
        // Rimuovi il caso speciale per dashboard_admin - ora funziona
        const route = menuRoutes[menuId];
        if (route) {
            console.log(`[TALON Sidebar] Navigating to: ${route}`);
            
            // Animazione di feedback
            this.animateMenuClick(linkElement);
            
            // Navigazione ritardata per mostrare l'animazione
            setTimeout(() => {
                window.location.href = route;
            }, 150);
        } else {
            console.warn(`[TALON Sidebar] Route not found for menu: ${menuId}`);
            this.showNotImplementedMessage(menuId);
        }
        
        const route = menuRoutes[menuId];
        if (route) {
            console.log(`[TALON Sidebar] Navigating to: ${route}`);
            
            // Animazione di feedback
            this.animateMenuClick(linkElement);
            
            // Navigazione ritardata per mostrare l'animazione
            setTimeout(() => {
                window.location.href = route;
            }, 150);
        } else {
            console.warn(`[TALON Sidebar] Route not found for menu: ${menuId}`);
            this.showNotImplementedMessage(menuId);
        }
    }

    /**
     * NUOVO: Inizializza bottoni dashboard
     */
    initializeDashboardButtons() {
        console.log('[TALON Sidebar] Inizializzazione bottoni dashboard...');
        
        // Aspetta che la pagina sia completamente caricata
        setTimeout(() => {
            this.setupActionButtons();
            this.setupViewButtons();
            this.enableAllButtonsForAdmin();
        }, 1000);
    }

    /**
     * NUOVO: Configura bottoni azioni rapide con rotte corrette
     */
    setupActionButtons() {
        const buttonActions = {
            'Nuovo Utente': () => this.navigateToRoute('/admin/users/new'),
            'Nuovo Ente Civile': () => this.navigateToRoute('/enti_civili/new'),
            'Nuovo Ente Militare': () => this.navigateToRoute('/enti_militari/new'),
            'Nuova Operazione': () => this.navigateToRoute('/operazioni/new'),
            'Backup Database': () => this.confirmAndNavigate('/admin/backup', 'Avviare il backup del database?'),
            'Visualizza Log': () => this.openInNewTab('/admin/logs')
        };
        
        Object.entries(buttonActions).forEach(([buttonText, action]) => {
            const buttons = this.findButtonsByText(buttonText);
            buttons.forEach(btn => {
                this.enableButton(btn, action);
                console.log(`[TALON Sidebar] Configured button: ${buttonText}`);
            });
        });
    }

    /**
     * NUOVO: Configura bottoni visualizza
     */
    setupViewButtons() {
        const viewButtons = document.querySelectorAll('button, .btn');
        
        viewButtons.forEach(btn => {
            if (btn.textContent.trim() === 'Visualizza') {
                const route = this.detectViewButtonRoute(btn);
                if (route) {
                    this.enableButton(btn, () => this.navigateToRoute(route));
                    console.log(`[TALON Sidebar] Configured view button for: ${route}`);
                }
            }
        });
    }

    /**
     * NUOVO: Rileva rotta per bottoni visualizza
     */
    detectViewButtonRoute(button) {
        const container = button.closest('.card, .section, .widget, .dashboard-item');
        if (!container) return null;
        
        const heading = container.querySelector('h3, h4, h5, .card-title, .section-title');
        const section = heading?.textContent.trim().toLowerCase();
        
        const routeMap = {
            'enti civili': '/enti_civili',
            'enti militari': '/enti_militari/organigramma',
            'operazioni': '/operazioni',
            'attività': '/attivita',
            'utenti totali': '/admin/users',
            'attività recenti': '/attivita',
            'sistema': '/admin/system-info'
        };
        
        return routeMap[section] || null;
    }

    /**
     * NUOVO: Abilita tutti i bottoni per ADMIN
     */
    enableAllButtonsForAdmin() {
        if (this.userRole === 'ADMIN') {
            document.querySelectorAll('button[disabled], .btn[disabled]').forEach(btn => {
                btn.disabled = false;
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            });
            
            // Mostra elementi nascosti per admin
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.style.display = '';
            });
            
            console.log('[TALON Sidebar] Tutti i bottoni abilitati per ADMIN');
        }
    }

    /**
     * UTILITY: Trova bottoni per testo
     */
    findButtonsByText(text) {
        return Array.from(document.querySelectorAll('button, .btn')).filter(btn => 
            btn.textContent.trim() === text
        );
    }

    /**
     * UTILITY: Abilita bottone con azione
     */
    enableButton(button, action) {
        // Abilita il bottone
        button.disabled = false;
        button.style.pointerEvents = 'auto';
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
        
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

    /**
     * UTILITY: Navigazione
     */
    navigateToRoute(route) {
        console.log(`[TALON Sidebar] Navigating to: ${route}`);
        window.location.href = route;
    }

    /**
     * UTILITY: Navigazione con conferma
     */
    confirmAndNavigate(route, message) {
        if (confirm(message)) {
            this.navigateToRoute(route);
        }
    }

    /**
     * UTILITY: Apri in nuova tab
     */
    openInNewTab(route) {
        console.log(`[TALON Sidebar] Opening in new tab: ${route}`);
        window.open(route, '_blank');
    }

    /**
     * AGGIORNATO: Mostra messaggio per funzioni non implementate
     */
    showNotImplementedMessage(menuId) {
        const message = `Menu "${menuId}" non ancora implementato`;
        console.warn(`[TALON Sidebar] ${message}`);
        
        // Mostra notifica invece di alert
        this.showToast(message, 'warning');
    }

    /**
     * NUOVO: Sistema di notifiche toast
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
        
        // Crea toast
        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'};
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
            max-width: 300px;
            word-wrap: break-word;
        `;
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        // Animazione entrata
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 100);
        
        // Rimozione automatica
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // ==========================================
    // METODI ESISTENTI (aggiornati dove necessario)
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

    initializeRoleControls() {
        console.log(`[TALON Sidebar] Inizializzazione controlli ruoli per: ${this.userRole}`);
        this.applyRoleRestrictionsToMenu();
        this.updateUserInfoWithRole();
        
        // Aggiorna ruolo globalmente
        window.userRole = this.userRole;
        document.body.setAttribute('data-user-role', this.userRole);
        sessionStorage.setItem('userRole', this.userRole);
    }

    applyRoleRestrictionsToMenu() {
        const menuItems = this.menuList.querySelectorAll('li');
        const userLevel = this.roleHierarchy[this.userRole] || 0;
        
        menuItems.forEach(item => {
            const minRole = item.getAttribute('data-min-role');
            if (minRole) {
                const minLevel = this.roleHierarchy[minRole] || 3;
                if (userLevel < minLevel) {
                    this.hideMenuItem(item, `Richiede ruolo: ${minRole}`);
                    return;
                }
            }
            
            if (item.hasAttribute('data-admin-only') && this.userRole !== 'ADMIN') {
                this.hideMenuItem(item, 'Solo per ADMIN');
                return;
            }
            
            if (item.hasAttribute('data-visualizzatore-hidden') && this.userRole === 'VISUALIZZATORE') {
                this.hideMenuItem(item, 'Non disponibile per VISUALIZZATORE');
                return;
            }
            
            this.showMenuItem(item);
        });
        
        console.log(`[TALON Sidebar] Controlli ruoli applicati a ${menuItems.length} menu items`);
    }

    hideMenuItem(item, reason = '') {
        item.classList.add('role-hidden');
        item.style.display = 'none';
        item.setAttribute('data-access-denied', reason);
        item.setAttribute('draggable', 'false');
    }

    showMenuItem(item) {
        item.classList.remove('role-hidden');
        item.style.display = '';
        item.removeAttribute('data-access-denied');
        item.setAttribute('draggable', 'true');
    }

    hasAccessToMenuItem(menuItem) {
        if (!menuItem) return false;
        
        if (menuItem.classList.contains('role-hidden') || 
            menuItem.style.display === 'none') {
            return false;
        }
        
        const userLevel = this.roleHierarchy[this.userRole] || 0;
        
        const minRole = menuItem.getAttribute('data-min-role');
        if (minRole) {
            const minLevel = this.roleHierarchy[minRole] || 3;
            if (userLevel < minLevel) return false;
        }
        
        if (menuItem.hasAttribute('data-admin-only') && this.userRole !== 'ADMIN') {
            return false;
        }
        
        if (menuItem.hasAttribute('data-visualizzatore-hidden') && this.userRole === 'VISUALIZZATORE') {
            return false;
        }
        
        return true;
    }

    showAccessDeniedMessage(menuItem) {
        const reason = menuItem.getAttribute('data-access-denied') || 'Accesso non autorizzato';
        console.log(`[TALON Sidebar] Accesso negato: ${reason}`);
        this.showToast(reason, 'error');
    }

    updateUserInfoWithRole() {
        if (!this.userInfo) return;
        
        this.userInfo.setAttribute('data-user-role', this.userRole);
        
        const roleBadge = this.userInfo.querySelector('.user-role-badge');
        if (roleBadge) {
            roleBadge.textContent = this.userRole;
            roleBadge.title = `Ruolo attuale: ${this.userRole}`;
        }
        
        console.log(`[TALON Sidebar] Info utente aggiornate per ruolo: ${this.userRole}`);
    }

    initializeUserInfo() {
        if (this.userName && this.userInfo) {
            console.log('[TALON Sidebar] Info utente caricate dal template');
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
                
                // Redirect
                setTimeout(() => {
                    window.location.href = '/auth/logout';
                }, 500);
                
            } catch (error) {
                console.error('Errore durante il logout:', error);
                window.location.href = '/auth/logout';
            }
        }
    }

    // ==========================================
    // DRAG & DROP (invariato)
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
    // API PUBBLICA (aggiornata)
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

    updateUserRole(newRole) {
        const oldRole = this.userRole;
        this.userRole = newRole;
        
        console.log(`[TALON Sidebar] Ruolo aggiornato da ${oldRole} a ${newRole}`);
        
        // Aggiorna tutto il sistema
        window.userRole = newRole;
        document.body.setAttribute('data-user-role', newRole);
        sessionStorage.setItem('userRole', newRole);
        
        this.applyRoleRestrictionsToMenu();
        this.updateUserInfoWithRole();
        this.enableAllButtonsForAdmin();
        
        this.showToast(`Ruolo aggiornato: ${newRole}`, 'info');
    }

    // NUOVE API
    refreshDashboard() {
        this.initializeDashboardButtons();
        this.showToast('Dashboard aggiornata', 'info');
    }

    forceShowAllMenus() {
        document.querySelectorAll('.sidebar li.role-hidden').forEach(item => {
            item.classList.remove('role-hidden');
            item.style.display = '';
        });
        this.showToast('Tutti i menu mostrati (debug)', 'warning');
    }

    enableAllButtons() {
        document.querySelectorAll('button[disabled], .btn[disabled]').forEach(btn => {
            btn.disabled = false;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        });
        this.showToast('Tutti i bottoni abilitati (debug)', 'warning');
    }
}

// ==========================================
// STILI CSS AGGIUNTIVI
// ==========================================

const sidebarStyles = document.createElement('style');
sidebarStyles.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .sidebar li[draggable="false"] {
        cursor: not-allowed !important;
    }
    
    .sidebar li.role-hidden[draggable="true"] {
        draggable: false;
    }
    
    /* Stili per toast notifications */
    #toast-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    /* Fix per bottoni disabilitati */
    button[disabled], .btn[disabled] {
        opacity: 0.6 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
    }
    
    /* Stili per elementi admin */
    [data-admin-only] {
        transition: opacity 0.3s ease;
    }
    
    body:not([data-user-role="ADMIN"]) [data-admin-only] {
        display: none !important;
    }
`;
document.head.appendChild(sidebarStyles);

// ==========================================
// INIZIALIZZAZIONE GLOBALE
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[TALON Sidebar] DOM loaded, inizializzazione versione 2.0...');
    
    // Crea istanza globale
    window.talonSidebar = new TalonSidebar();
    
    // API pubblica estesa
    window.sidebarAPI = {
        // API base
        pin: () => window.talonSidebar.pin(),
        unpin: () => window.talonSidebar.unpin(),
        expand: () => window.talonSidebar.expand(),
        collapse: () => window.talonSidebar.collapse(),
        
        // API ruoli
        getCurrentRole: () => window.talonSidebar.getCurrentRole(),
        updateRole: (role) => window.talonSidebar.updateUserRole(role),
        
        // API dashboard
        refreshDashboard: () => window.talonSidebar.refreshDashboard(),
        
        // API debug
        showAllMenus: () => window.talonSidebar.forceShowAllMenus(),
        enableAllButtons: () => window.talonSidebar.enableAllButtons(),
        
        // API utility
        showToast: (message, type) => window.talonSidebar.showToast(message, type),
        
        // Info
        version: '2.0',
        status: () => {
            return {
                isPinned: window.talonSidebar.isPinned,
                isExpanded: window.talonSidebar.isExpanded,
                userRole: window.talonSidebar.userRole,
                menuCount: window.talonSidebar.menuList?.children.length || 0
            };
        }
    };
    
    console.log('[TALON Sidebar] ✅ Versione 2.0 inizializzata completamente!');
    console.log('[TALON Sidebar] API disponibili in window.sidebarAPI');
    console.log('[TALON Sidebar] Stato:', window.sidebarAPI.status());
});