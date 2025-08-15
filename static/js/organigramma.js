/**
 * ========================================
 * TALON ORGANIGRAMMA MODULE - SPA VERSION
 * File: static/js/organigramma.js
 * 
 * Versione: 2.0.0 - Full SPA Integration
 * Descrizione: Gestione organigramma con albero
 *              espandibile e ricerca, ottimizzato per SPA
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        // Selettori DOM
        SELECTORS: {
            TREE_CONTAINER: '.tree, .organigramma-tree',
            TOGGLE_VIEW: '#view-toggle-checkbox',
            SEARCH_INPUT: '#organigrammaSearchInput',
            NO_RESULTS: '#no-results-message',
            TREE_ITEMS: '.tree li',
            TOGGLE_BUTTONS: '.tree .toggle-btn',
            ENTE_NAME: '.ente-name',
            EXPAND_ALL_BTN: '#expand-all-btn',
            COLLAPSE_ALL_BTN: '#collapse-all-btn'
        },
        
        // Impostazioni
        SETTINGS: {
            SEARCH_DELAY: 300,
            HIGHLIGHT_CLASS: 'search-highlighted',
            EXPANDED_CLASS: 'expanded',
            ANIMATION_DURATION: 300,
            SAVE_STATE: true,
            AUTO_EXPAND_SEARCH: true
        },
        
        // Storage keys
        STORAGE: {
            TREE_STATE: 'talon_organigramma_state',
            VIEW_MODE: 'talon_organigramma_view',
            LAST_SEARCH: 'talon_organigramma_search'
        },
        
        // SPA Settings
        SPA: {
            PERSIST_STATE: true,
            RESTORE_ON_NAVIGATION: true,
            DEBUG: false
        }
    };

    // ========================================
    // CLASSE ORGANIGRAMMA
    // ========================================
    
    class Organigramma {
        constructor() {
            this.state = {
                initialized: false,
                isSearching: false,
                expandedNodes: new Set(),
                currentView: 'tree',
                searchTerm: '',
                visibleNodes: new Set()
            };
            
            this.elements = {};
            this.searchTimeout = null;
            this.eventHandlers = new Map();
            
            // Bind methods
            this.handleSearch = this.handleSearch.bind(this);
            this.handleToggleClick = this.handleToggleClick.bind(this);
            this.handleViewToggle = this.handleViewToggle.bind(this);
            this.handleSPANavigation = this.handleSPANavigation.bind(this);
            this.handleSPACleanup = this.handleSPACleanup.bind(this);
        }

        // ========================================
        // INIZIALIZZAZIONE
        // ========================================
        
        init() {
            if (this.state.initialized) {
                this.log('warn', 'Already initialized');
                return false;
            }
            
            this.log('info', 'Initializing Organigramma...');
            
            // Trova elementi DOM
            if (!this.findElements()) {
                this.log('warn', 'Required elements not found');
                return false;
            }
            
            // Carica stato salvato
            if (CONFIG.SPA.PERSIST_STATE) {
                this.loadState();
            }
            
            // Setup componenti
            this.setupViewToggle();
            this.setupTreeToggle();
            this.setupSearch();
            this.setupControlButtons();
            
            // Setup eventi SPA
            this.setupSPAEvents();
            
            // Inizializza stato albero
            this.initializeTreeState();
            
            this.state.initialized = true;
            this.log('success', '✅ Organigramma initialized');
            
            // Emit evento
            this.emit('organigramma:ready');
            
            return true;
        }

        findElements() {
            // Tree container
            this.elements.tree = document.querySelector(CONFIG.SELECTORS.TREE_CONTAINER);
            if (!this.elements.tree) {
                return false;
            }
            
            // Altri elementi (opzionali)
            this.elements.viewToggle = document.querySelector(CONFIG.SELECTORS.TOGGLE_VIEW);
            this.elements.searchInput = document.querySelector(CONFIG.SELECTORS.SEARCH_INPUT);
            this.elements.noResults = document.querySelector(CONFIG.SELECTORS.NO_RESULTS);
            this.elements.expandAllBtn = document.querySelector(CONFIG.SELECTORS.EXPAND_ALL_BTN);
            this.elements.collapseAllBtn = document.querySelector(CONFIG.SELECTORS.COLLAPSE_ALL_BTN);
            
            // Raccogli tutti i nodi
            this.elements.treeItems = this.elements.tree.querySelectorAll('li');
            this.elements.toggleButtons = this.elements.tree.querySelectorAll(CONFIG.SELECTORS.TOGGLE_BUTTONS);
            
            return true;
        }

        // ========================================
        // GESTIONE VISTA
        // ========================================
        
        setupViewToggle() {
            if (!this.elements.viewToggle) return;
            
            this.log('debug', 'Setting up view toggle');
            
            // Rimuovi vecchi handler
            this.removeEventHandler(this.elements.viewToggle, 'change');
            
            // Aggiungi nuovo handler
            this.addEventHandler(this.elements.viewToggle, 'change', this.handleViewToggle);
            
            // Imposta stato iniziale
            const savedView = this.getSavedView();
            if (savedView === 'all') {
                this.elements.viewToggle.checked = true;
            }
        }

        handleViewToggle(event) {
            const showAll = event.target.checked;
            this.state.currentView = showAll ? 'all' : 'tree';
            
            this.log('info', `View changed to: ${this.state.currentView}`);
            
            // Salva preferenza
            if (CONFIG.SETTINGS.SAVE_STATE) {
                localStorage.setItem(CONFIG.STORAGE.VIEW_MODE, this.state.currentView);
            }
            
            // In SPA, aggiorna solo la visualizzazione invece di ricaricare
            if (window.TalonApp) {
                this.updateViewMode(showAll);
            } else {
                // Fallback: ricarica con parametro
                const url = new URL(window.location.href);
                if (showAll) {
                    url.searchParams.set('view', 'all');
                } else {
                    url.searchParams.delete('view');
                }
                window.location.href = url.href;
            }
        }

        updateViewMode(showAll) {
            // Aggiorna visualizzazione senza ricaricare
            if (showAll) {
                this.showAllNodes();
            } else {
                this.showTreeView();
            }
            
            this.emit('organigramma:view-changed', { view: this.state.currentView });
        }

        showAllNodes() {
            this.elements.treeItems.forEach(item => {
                item.style.display = '';
                item.classList.add(CONFIG.SETTINGS.EXPANDED_CLASS);
            });
        }

        showTreeView() {
            // Ripristina vista albero con stato salvato
            this.restoreTreeState();
        }

        getSavedView() {
            // Controlla parametro URL
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('view')) {
                return urlParams.get('view');
            }
            
            // Controlla localStorage
            if (CONFIG.SETTINGS.SAVE_STATE) {
                return localStorage.getItem(CONFIG.STORAGE.VIEW_MODE) || 'tree';
            }
            
            return 'tree';
        }

        // ========================================
        // GESTIONE ALBERO
        // ========================================
        
        setupTreeToggle() {
            this.log('debug', `Setting up ${this.elements.toggleButtons.length} toggle buttons`);
            
            this.elements.toggleButtons.forEach(btn => {
                // Rimuovi vecchi handler
                this.removeEventHandler(btn, 'click');
                
                // Aggiungi nuovo handler
                this.addEventHandler(btn, 'click', this.handleToggleClick);
            });
        }

        handleToggleClick(event) {
            event.stopPropagation();
            event.preventDefault();
            
            const button = event.currentTarget;
            const listItem = button.closest('li');
            
            if (!listItem) return;
            
            // Toggle stato espanso
            const isExpanded = listItem.classList.contains(CONFIG.SETTINGS.EXPANDED_CLASS);
            
            if (isExpanded) {
                this.collapseNode(listItem);
            } else {
                this.expandNode(listItem);
            }
            
            // Salva stato
            this.saveTreeState();
            
            // Emit evento
            this.emit('organigramma:node-toggled', {
                node: listItem,
                expanded: !isExpanded
            });
        }

        expandNode(node, animate = true) {
            node.classList.add(CONFIG.SETTINGS.EXPANDED_CLASS);
            
            const nodeId = this.getNodeId(node);
            this.state.expandedNodes.add(nodeId);
            
            if (animate) {
                this.animateExpansion(node, true);
            }
            
            // Aggiorna icona se presente
            const icon = node.querySelector('.toggle-icon, .toggle-btn i');
            if (icon) {
                icon.classList.remove('fa-plus', 'fa-chevron-right');
                icon.classList.add('fa-minus', 'fa-chevron-down');
            }
        }

        collapseNode(node, animate = true) {
            node.classList.remove(CONFIG.SETTINGS.EXPANDED_CLASS);
            
            const nodeId = this.getNodeId(node);
            this.state.expandedNodes.delete(nodeId);
            
            if (animate) {
                this.animateExpansion(node, false);
            }
            
            // Aggiorna icona se presente
            const icon = node.querySelector('.toggle-icon, .toggle-btn i');
            if (icon) {
                icon.classList.remove('fa-minus', 'fa-chevron-down');
                icon.classList.add('fa-plus', 'fa-chevron-right');
            }
        }

        animateExpansion(node, expanding) {
            const children = node.querySelector('ul');
            if (!children) return;
            
            if (expanding) {
                children.style.maxHeight = '0';
                children.style.overflow = 'hidden';
                children.style.transition = `max-height ${CONFIG.SETTINGS.ANIMATION_DURATION}ms ease-out`;
                
                requestAnimationFrame(() => {
                    children.style.maxHeight = children.scrollHeight + 'px';
                    
                    setTimeout(() => {
                        children.style.maxHeight = '';
                        children.style.overflow = '';
                        children.style.transition = '';
                    }, CONFIG.SETTINGS.ANIMATION_DURATION);
                });
            } else {
                children.style.maxHeight = children.scrollHeight + 'px';
                children.style.overflow = 'hidden';
                children.style.transition = `max-height ${CONFIG.SETTINGS.ANIMATION_DURATION}ms ease-in`;
                
                requestAnimationFrame(() => {
                    children.style.maxHeight = '0';
                });
            }
        }

        getNodeId(node) {
            // Genera ID univoco per il nodo
            return node.dataset.nodeId || 
                   node.id || 
                   Array.from(this.elements.treeItems).indexOf(node).toString();
        }

        // ========================================
        // GESTIONE RICERCA
        // ========================================
        
        setupSearch() {
            if (!this.elements.searchInput) return;
            
            this.log('debug', 'Setting up search');
            
            // Rimuovi vecchi handler
            this.removeEventHandler(this.elements.searchInput, 'input');
            this.removeEventHandler(this.elements.searchInput, 'keydown');
            
            // Aggiungi nuovi handler
            this.addEventHandler(this.elements.searchInput, 'input', this.handleSearch);
            this.addEventHandler(this.elements.searchInput, 'keydown', (e) => {
                if (e.key === 'Escape') {
                    this.clearSearch();
                }
            });
            
            // Ripristina ultima ricerca se presente
            const lastSearch = sessionStorage.getItem(CONFIG.STORAGE.LAST_SEARCH);
            if (lastSearch && CONFIG.SPA.RESTORE_ON_NAVIGATION) {
                this.elements.searchInput.value = lastSearch;
                this.performSearch(lastSearch);
            }
        }

        handleSearch(event) {
            const searchTerm = event.target.value.trim();
            
            // Clear timeout precedente
            clearTimeout(this.searchTimeout);
            
            // Salva termine di ricerca
            this.state.searchTerm = searchTerm;
            sessionStorage.setItem(CONFIG.STORAGE.LAST_SEARCH, searchTerm);
            
            // Debounce search
            this.searchTimeout = setTimeout(() => {
                this.performSearch(searchTerm);
            }, CONFIG.SETTINGS.SEARCH_DELAY);
        }

        performSearch(searchTerm) {
            this.log('debug', `Searching for: "${searchTerm}"`);
            
            const normalizedSearch = searchTerm.toLowerCase();
            this.state.isSearching = !!normalizedSearch;
            
            // Reset visualizzazione
            this.resetSearchHighlight();
            this.state.visibleNodes.clear();
            
            if (!normalizedSearch) {
                // Ripristina vista normale
                this.restoreTreeState();
                this.hideNoResults();
                this.emit('organigramma:search-cleared');
                return;
            }
            
            let hasResults = false;
            const matchedNodes = new Set();
            
            // Cerca in tutti i nodi
            this.elements.treeItems.forEach(item => {
                const enteName = item.querySelector(CONFIG.SELECTORS.ENTE_NAME);
                if (!enteName) return;
                
                const text = enteName.textContent.toLowerCase();
                const matches = text.includes(normalizedSearch);
                
                if (matches) {
                    // Mostra nodo e tutti i suoi parent
                    this.showNodeWithParents(item);
                    matchedNodes.add(item);
                    hasResults = true;
                    
                    // Evidenzia termine di ricerca
                    this.highlightSearchTerm(enteName, searchTerm);
                    
                    // Espandi automaticamente se configurato
                    if (CONFIG.SETTINGS.AUTO_EXPAND_SEARCH) {
                        this.expandNode(item, false);
                    }
                } else {
                    // Nascondi nodo
                    item.style.display = 'none';
                }
            });
            
            // Mostra/nascondi messaggio no results
            if (hasResults) {
                this.hideNoResults();
            } else {
                this.showNoResults(searchTerm);
            }
            
            // Emit evento
            this.emit('organigramma:search-performed', {
                term: searchTerm,
                results: matchedNodes.size
            });
        }

        showNodeWithParents(node) {
            // Mostra il nodo
            node.style.display = '';
            node.classList.add(CONFIG.SETTINGS.HIGHLIGHT_CLASS);
            this.state.visibleNodes.add(node);
            
            // Mostra e espandi tutti i parent
            let parent = node.parentElement;
            while (parent && parent !== this.elements.tree) {
                const parentLi = parent.closest('li');
                if (parentLi) {
                    parentLi.style.display = '';
                    this.expandNode(parentLi, false);
                    this.state.visibleNodes.add(parentLi);
                }
                parent = parent.parentElement;
            }
            
            // Mostra tutti i figli
            const children = node.querySelectorAll('li');
            children.forEach(child => {
                child.style.display = '';
                this.state.visibleNodes.add(child);
            });
        }

        highlightSearchTerm(element, term) {
            const text = element.textContent;
            const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
            
            // Usa mark tag per evidenziare
            element.innerHTML = text.replace(regex, '<mark>$1</mark>');
        }

        resetSearchHighlight() {
            // Rimuovi evidenziazioni
            this.elements.tree.querySelectorAll('mark').forEach(mark => {
                const text = mark.textContent;
                const parent = mark.parentNode;
                mark.replaceWith(text);
            });
            
            // Rimuovi classi highlight
            this.elements.tree.querySelectorAll(`.${CONFIG.SETTINGS.HIGHLIGHT_CLASS}`).forEach(item => {
                item.classList.remove(CONFIG.SETTINGS.HIGHLIGHT_CLASS);
            });
        }

        clearSearch() {
            if (this.elements.searchInput) {
                this.elements.searchInput.value = '';
                this.state.searchTerm = '';
                sessionStorage.removeItem(CONFIG.STORAGE.LAST_SEARCH);
                this.performSearch('');
            }
        }

        showNoResults(searchTerm) {
            // Disabilitato - la ricerca è gestita dal nuovo codice nell'organigramma.html
            return;
        }

        hideNoResults() {
            if (this.elements.noResults) {
                this.elements.noResults.style.display = 'none';
            }
        }

        // ========================================
        // CONTROLLI GLOBALI
        // ========================================
        
        setupControlButtons() {
            // Expand All
            if (this.elements.expandAllBtn) {
                this.removeEventHandler(this.elements.expandAllBtn, 'click');
                this.addEventHandler(this.elements.expandAllBtn, 'click', () => this.expandAll());
            }
            
            // Collapse All
            if (this.elements.collapseAllBtn) {
                this.removeEventHandler(this.elements.collapseAllBtn, 'click');
                this.addEventHandler(this.elements.collapseAllBtn, 'click', () => this.collapseAll());
            }
        }

        expandAll() {
            this.log('info', 'Expanding all nodes');
            
            this.elements.treeItems.forEach(item => {
                if (item.querySelector('ul')) {
                    this.expandNode(item, false);
                }
            });
            
            this.saveTreeState();
            this.emit('organigramma:expanded-all');
        }

        collapseAll() {
            this.log('info', 'Collapsing all nodes');
            
            this.elements.treeItems.forEach(item => {
                this.collapseNode(item, false);
            });
            
            this.saveTreeState();
            this.emit('organigramma:collapsed-all');
        }

        // ========================================
        // GESTIONE STATO
        // ========================================
        
        initializeTreeState() {
            // Carica stato salvato o usa default
            const savedState = this.loadState();
            
            if (savedState && savedState.expandedNodes) {
                // Ripristina nodi espansi
                savedState.expandedNodes.forEach(nodeId => {
                    const node = this.findNodeById(nodeId);
                    if (node) {
                        this.expandNode(node, false);
                    }
                });
            } else {
                // Espandi primo livello per default
                this.expandFirstLevel();
            }
        }

        expandFirstLevel() {
            const firstLevelItems = this.elements.tree.querySelectorAll(':scope > li');
            firstLevelItems.forEach(item => {
                if (item.querySelector('ul')) {
                    this.expandNode(item, false);
                }
            });
        }

        saveTreeState() {
            if (!CONFIG.SETTINGS.SAVE_STATE) return;
            
            const state = {
                expandedNodes: Array.from(this.state.expandedNodes),
                timestamp: Date.now()
            };
            
            try {
                sessionStorage.setItem(CONFIG.STORAGE.TREE_STATE, JSON.stringify(state));
                this.log('debug', 'Tree state saved');
            } catch (e) {
                this.log('error', 'Failed to save tree state:', e);
            }
        }

        loadState() {
            if (!CONFIG.SETTINGS.SAVE_STATE) return null;
            
            try {
                const savedState = sessionStorage.getItem(CONFIG.STORAGE.TREE_STATE);
                if (savedState) {
                    const state = JSON.parse(savedState);
                    
                    // Ripristina expanded nodes
                    if (state.expandedNodes) {
                        this.state.expandedNodes = new Set(state.expandedNodes);
                    }
                    
                    this.log('debug', 'Tree state loaded');
                    return state;
                }
            } catch (e) {
                this.log('error', 'Failed to load tree state:', e);
            }
            
            return null;
        }

        restoreTreeState() {
            // Mostra tutti i nodi
            this.elements.treeItems.forEach(item => {
                item.style.display = '';
            });
            
            // Ripristina stato espanso/collassato
            this.elements.treeItems.forEach(item => {
                const nodeId = this.getNodeId(item);
                if (this.state.expandedNodes.has(nodeId)) {
                    item.classList.add(CONFIG.SETTINGS.EXPANDED_CLASS);
                } else {
                    item.classList.remove(CONFIG.SETTINGS.EXPANDED_CLASS);
                }
            });
        }

        findNodeById(nodeId) {
            return Array.from(this.elements.treeItems).find(item => {
                return this.getNodeId(item) === nodeId;
            });
        }

        // ========================================
        // EVENTI SPA
        // ========================================
        
        setupSPAEvents() {
            // Integrazione con TalonApp
            if (window.TalonApp) {
                window.TalonApp.on('talon:cleanup', this.handleSPACleanup);
                window.TalonApp.on('talon:content:loaded', this.handleSPANavigation);
            } else {
                // Fallback su custom events
                document.addEventListener('spa:cleanup', this.handleSPACleanup);
                document.addEventListener('spa:content-loaded', this.handleSPANavigation);
            }
        }

        removeSPAEvents() {
            if (window.TalonApp) {
                window.TalonApp.off('talon:cleanup', this.handleSPACleanup);
                window.TalonApp.off('talon:content:loaded', this.handleSPANavigation);
            } else {
                document.removeEventListener('spa:cleanup', this.handleSPACleanup);
                document.removeEventListener('spa:content-loaded', this.handleSPANavigation);
            }
        }

        handleSPACleanup() {
            this.log('debug', 'SPA cleanup triggered');
            
            // Salva stato prima della navigazione
            if (CONFIG.SPA.PERSIST_STATE) {
                this.saveTreeState();
            }
        }

        handleSPANavigation() {
            this.log('debug', 'SPA navigation detected');
            
            // Re-inizializza se siamo ancora nella pagina organigramma
            const tree = document.querySelector(CONFIG.SELECTORS.TREE_CONTAINER);
            if (tree) {
                this.destroy();
                this.init();
            }
        }

        // ========================================
        // UTILITY
        // ========================================
        
        addEventHandler(element, event, handler) {
            if (!element) return;
            
            element.addEventListener(event, handler);
            
            // Salva per cleanup
            if (!this.eventHandlers.has(element)) {
                this.eventHandlers.set(element, new Map());
            }
            this.eventHandlers.get(element).set(event, handler);
        }

        removeEventHandler(element, event) {
            if (!element) return;
            
            const handlers = this.eventHandlers.get(element);
            if (handlers && handlers.has(event)) {
                const handler = handlers.get(event);
                element.removeEventListener(event, handler);
                handlers.delete(event);
            }
        }

        escapeRegex(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
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
            
            const prefix = '[Organigramma]';
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
        // DESTROY
        // ========================================
        
        destroy() {
            this.log('info', 'Destroying Organigramma...');
            
            // Clear timeouts
            clearTimeout(this.searchTimeout);
            
            // Remove event handlers
            this.eventHandlers.forEach((handlers, element) => {
                handlers.forEach((handler, event) => {
                    element.removeEventListener(event, handler);
                });
            });
            this.eventHandlers.clear();
            
            // Remove SPA events
            this.removeSPAEvents();
            
            // Save state before destroying
            if (CONFIG.SPA.PERSIST_STATE) {
                this.saveTreeState();
            }
            
            // Reset state
            this.state.initialized = false;
            this.state.expandedNodes.clear();
            this.state.visibleNodes.clear();
            
            // Clear references
            this.elements = {};
            
            this.log('success', '✅ Organigramma destroyed');
        }

        // ========================================
        // PUBLIC API
        // ========================================
        
        getState() {
            return {
                initialized: this.state.initialized,
                searching: this.state.isSearching,
                searchTerm: this.state.searchTerm,
                expandedNodes: Array.from(this.state.expandedNodes),
                view: this.state.currentView
            };
        }

        search(term) {
            if (this.elements.searchInput) {
                this.elements.searchInput.value = term;
                this.performSearch(term);
            }
        }

        resetSearch() {
            this.clearSearch();
        }

        toggleNode(nodeId) {
            const node = this.findNodeById(nodeId);
            if (node) {
                const isExpanded = node.classList.contains(CONFIG.SETTINGS.EXPANDED_CLASS);
                if (isExpanded) {
                    this.collapseNode(node);
                } else {
                    this.expandNode(node);
                }
                this.saveTreeState();
            }
        }
    }

    // ========================================
    // INIZIALIZZAZIONE E EXPORT
    // ========================================
    
    let instance = null;
    
    function getInstance() {
        if (!instance) {
            instance = new Organigramma();
        }
        return instance;
    }

    function init() {
        const organigramma = getInstance();
        return organigramma.init();
    }

    function destroy() {
        if (instance) {
            instance.destroy();
            instance = null;
        }
    }

    // Auto-inizializzazione
    function autoInit() {
        // Controlla se siamo nella pagina organigramma
        const hasTree = document.querySelector(CONFIG.SELECTORS.TREE_CONTAINER);
        if (hasTree) {
            init();
        }
    }

    // Setup auto-init per SPA
    if (window.TalonApp) {
        window.TalonApp.on('talon:content:loaded', autoInit);
    } else {
        // Fallback per DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', autoInit);
        } else {
            autoInit();
        }
        
        // Listen for SPA navigation
        document.addEventListener('spa:content-loaded', autoInit);
    }

    // API Pubblica
    window.TalonOrganigramma = {
        init: init,
        destroy: destroy,
        getInstance: getInstance,
        
        // Proxy methods
        expandAll: () => getInstance().expandAll(),
        collapseAll: () => getInstance().collapseAll(),
        search: (term) => getInstance().search(term),
        resetSearch: () => getInstance().resetSearch(),
        toggleNode: (nodeId) => getInstance().toggleNode(nodeId),
        getState: () => getInstance().getState(),
        
        // Configuration
        getConfig: () => ({ ...CONFIG }),
        setDebug: (enabled) => { CONFIG.SPA.DEBUG = enabled; },
        
        // Info
        version: '2.0.0'
    };

    // Alias for backward compatibility
    window.organigrammaAPI = window.TalonOrganigramma;


})(window, document);