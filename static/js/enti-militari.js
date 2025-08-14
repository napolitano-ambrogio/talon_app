/**
 * ========================================
 * TALON - ENTI MILITARI MODULE (SPA VERSION)
 * File: static/js/enti-militari.js
 * 
 * Versione: 2.0.0 - Full SPA Integration
 * Data: 2025
 * Funzionalità: Gestione enti militari, organigramma,
 *               struttura gerarchica e relazioni
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        DEBUG: window.TALON_CONFIG?.debug?.enabled || false,
        
        // API Endpoints
        API: {
            BASE: '/api/enti_militari',
            LIST: '/api/enti_militari/list',
            DETAIL: '/api/enti_militari/{id}',
            CREATE: '/api/enti_militari/create',
            UPDATE: '/api/enti_militari/update/{id}',
            DELETE: '/api/enti_militari/delete/{id}',
            ORGANIGRAMMA: '/api/enti_militari/organigramma',
            HIERARCHY: '/api/enti_militari/hierarchy',
            SEARCH: '/api/enti_militari/search'
        },
        
        // UI Configuration
        UI: {
            ANIMATION_DURATION: 300,
            SEARCH_DEBOUNCE: 500,
            PAGE_SIZE: 20,
            MAX_TREE_DEPTH: 10
        },
        
        // Selettori DOM
        SELECTORS: {
            container: '#enti-militari-container, .enti-militari-container',
            listView: '#enti-list, .enti-list',
            treeView: '#organigramma-tree, .organigramma-tree',
            searchInput: '#search-enti',
            filterForm: '#filter-form',
            addBtn: '#add-ente-btn',
            exportBtn: '#export-btn',
            viewToggle: '.view-toggle-btn',
            modal: '#ente-modal',
            detailPanel: '#ente-detail'
        },
        
        // Tipi di enti militari
        ENTITY_TYPES: {
            COMANDO: { label: 'Comando', icon: 'fa-building', color: '#dc3545' },
            BRIGATA: { label: 'Brigata', icon: 'fa-flag', color: '#fd7e14' },
            REGGIMENTO: { label: 'Reggimento', icon: 'fa-shield-alt', color: '#ffc107' },
            BATTAGLIONE: { label: 'Battaglione', icon: 'fa-users', color: '#28a745' },
            COMPAGNIA: { label: 'Compagnia', icon: 'fa-user-friends', color: '#17a2b8' },
            PLOTONE: { label: 'Plotone', icon: 'fa-user-shield', color: '#6c757d' }
        }
    };

    // ========================================
    // STATO APPLICAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        currentView: 'list', // 'list' | 'tree' | 'organigramma'
        entities: [],
        filteredEntities: [],
        selectedEntity: null,
        searchTerm: '',
        filters: {},
        treeInstance: null,
        isLoading: false,
        permissions: null
    };

    // ========================================
    // UTILITÀ
    // ========================================
    
    function log(level, ...args) {
        if (!CONFIG.DEBUG) return;
        const prefix = `[EntiMilitari]`;
        const styles = {
            info: 'color: #17a2b8',
            success: 'color: #28a745',
            warn: 'color: #ffc107',
            error: 'color: #dc3545',
            debug: 'color: #6c757d'
        };
        // console.log removed for production silence
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        if (state.initialized) {
            log('warn', 'Already initialized');
            return;
        }

        log('info', '🚀 Initializing Enti Militari Module...');

        // Verifica se siamo nella pagina corretta
        if (!isEntiMilitariPage()) {
            log('debug', 'Not on enti militari page, skipping init');
            return;
        }

        // Rileva permessi utente
        detectPermissions();
        
        // Setup componenti
        setupEventHandlers();
        setupSearch();
        setupFilters();
        setupViewToggle();
        setupModals();
        
        // Carica dati iniziali
        loadEntities();
        
        state.initialized = true;
        log('success', '✅ Enti Militari Module initialized');
        
        // Emit evento
        document.dispatchEvent(new CustomEvent('enti-militari:ready'));
    }

    function isEntiMilitariPage() {
        const container = document.querySelector(CONFIG.SELECTORS.container);
        const isInPath = window.location.pathname.includes('/enti_militari');
        return container || isInPath;
    }

    function detectPermissions() {
        state.permissions = {
            canCreate: window.TalonPermissions?.canCreate || false,
            canEdit: window.TalonPermissions?.canEdit || false,
            canDelete: window.TalonPermissions?.canDelete || false,
            isAdmin: window.TalonPermissions?.isAdmin || false
        };
        
        log('debug', 'Permissions detected:', state.permissions);
    }

    // ========================================
    // CARICAMENTO DATI
    // ========================================
    
    async function loadEntities() {
        if (state.isLoading) return;
        
        state.isLoading = true;
        showLoading();
        
        try {
            const data = await fetchEntities();
            state.entities = data;
            state.filteredEntities = data;
            
            renderCurrentView();
            log('success', `Loaded ${data.length} entities`);
            
        } catch (error) {
            log('error', 'Failed to load entities:', error);
            showError('Errore nel caricamento degli enti militari');
        } finally {
            state.isLoading = false;
            hideLoading();
        }
    }

    async function fetchEntities() {
        // Se abbiamo endpoint API, usa quello
        if (window.TALON_CONFIG?.api?.baseUrl) {
            try {
                const response = await fetch(`${window.TALON_CONFIG.api.baseUrl}${CONFIG.API.LIST}`, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': window.TALON_CONFIG?.api?.csrfToken || ''
                    }
                });
                
                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                log('warn', 'API call failed, using mock data:', error);
            }
        }

        // Dati mock per sviluppo/demo
        return [
            {
                id: 1,
                nome: 'Comando Forze Operative Nord',
                tipo: 'COMANDO',
                livello: 1,
                parent_id: null,
                descrizione: 'Comando principale area nord',
                personale: 250,
                comandante: 'Gen. Mario Rossi',
                sede: 'Milano',
                children: [2, 3]
            },
            {
                id: 2,
                nome: '1ª Brigata Meccanizzata',
                tipo: 'BRIGATA',
                livello: 2,
                parent_id: 1,
                descrizione: 'Brigata meccanizzata',
                personale: 3500,
                comandante: 'Col. Giuseppe Verdi',
                sede: 'Torino',
                children: [4, 5]
            },
            {
                id: 3,
                nome: '2ª Brigata Alpina',
                tipo: 'BRIGATA',
                livello: 2,
                parent_id: 1,
                descrizione: 'Brigata truppe alpine',
                personale: 3200,
                comandante: 'Col. Franco Bianchi',
                sede: 'Bolzano',
                children: [6]
            },
            {
                id: 4,
                nome: '1° Reggimento Fanteria',
                tipo: 'REGGIMENTO',
                livello: 3,
                parent_id: 2,
                descrizione: 'Reggimento fanteria meccanizzata',
                personale: 800,
                comandante: 'Ten.Col. Luigi Neri',
                sede: 'Vercelli',
                children: []
            },
            {
                id: 5,
                nome: '2° Reggimento Artiglieria',
                tipo: 'REGGIMENTO',
                livello: 3,
                parent_id: 2,
                descrizione: 'Reggimento artiglieria campale',
                personale: 600,
                comandante: 'Ten.Col. Paolo Gialli',
                sede: 'Novara',
                children: []
            },
            {
                id: 6,
                nome: '3° Reggimento Alpini',
                tipo: 'REGGIMENTO',
                livello: 3,
                parent_id: 3,
                descrizione: 'Reggimento alpini',
                personale: 750,
                comandante: 'Ten.Col. Marco Blu',
                sede: 'Merano',
                children: []
            }
        ];
    }

    // ========================================
    // RENDERING VISTE
    // ========================================
    
    function renderCurrentView() {
        switch (state.currentView) {
            case 'list':
                renderListView();
                break;
            case 'tree':
                renderTreeView();
                break;
            case 'organigramma':
                renderOrganigramma();
                break;
            default:
                renderListView();
        }
    }

    function renderListView() {
        const container = document.querySelector(CONFIG.SELECTORS.listView);
        if (!container) return;

        const entities = state.filteredEntities;
        
        if (entities.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Nessun ente militare trovato
                </div>
            `;
            return;
        }

        const html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th>Comandante</th>
                            <th>Sede</th>
                            <th>Personale</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entities.map(entity => renderEntityRow(entity)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        attachRowEventHandlers();
    }

    function renderEntityRow(entity) {
        const typeConfig = CONFIG.ENTITY_TYPES[entity.tipo] || {};
        const canEdit = state.permissions.canEdit;
        const canDelete = state.permissions.canDelete;

        return `
            <tr data-entity-id="${entity.id}" class="entity-row">
                <td>
                    <i class="fas ${typeConfig.icon} me-2" style="color: ${typeConfig.color}"></i>
                    <strong>${escapeHtml(entity.nome)}</strong>
                </td>
                <td>
                    <span class="badge" style="background-color: ${typeConfig.color}">
                        ${typeConfig.label || entity.tipo}
                    </span>
                </td>
                <td>${escapeHtml(entity.comandante || '-')}</td>
                <td>${escapeHtml(entity.sede || '-')}</td>
                <td>
                    <span class="badge bg-secondary">
                        <i class="fas fa-users"></i> ${entity.personale || 0}
                    </span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info view-btn" 
                                data-id="${entity.id}" 
                                title="Visualizza">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${canEdit ? `
                            <button class="btn btn-outline-warning edit-btn" 
                                    data-id="${entity.id}" 
                                    title="Modifica">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button class="btn btn-outline-danger delete-btn" 
                                    data-id="${entity.id}" 
                                    title="Elimina">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    function renderTreeView() {
        const container = document.querySelector(CONFIG.SELECTORS.treeView);
        if (!container) return;

        // Costruisci struttura ad albero
        const tree = buildTree(state.filteredEntities);
        
        container.innerHTML = `
            <div class="tree-view">
                ${renderTreeNodes(tree)}
            </div>
        `;
        
        attachTreeEventHandlers();
    }

    function buildTree(entities) {
        const map = {};
        const roots = [];

        // Crea mappa
        entities.forEach(entity => {
            map[entity.id] = { ...entity, children: [] };
        });

        // Costruisci albero
        entities.forEach(entity => {
            if (entity.parent_id && map[entity.parent_id]) {
                map[entity.parent_id].children.push(map[entity.id]);
            } else {
                roots.push(map[entity.id]);
            }
        });

        return roots;
    }

    function renderTreeNodes(nodes, level = 0) {
        if (!nodes || nodes.length === 0) return '';

        return `
            <ul class="tree-level tree-level-${level}">
                ${nodes.map(node => {
                    const typeConfig = CONFIG.ENTITY_TYPES[node.tipo] || {};
                    return `
                        <li class="tree-node" data-entity-id="${node.id}">
                            <div class="tree-node-content">
                                <span class="tree-toggle ${node.children.length > 0 ? 'has-children' : ''}">
                                    ${node.children.length > 0 ? '<i class="fas fa-chevron-right"></i>' : ''}
                                </span>
                                <i class="fas ${typeConfig.icon} me-2" style="color: ${typeConfig.color}"></i>
                                <span class="tree-node-name">${escapeHtml(node.nome)}</span>
                                <span class="badge bg-secondary ms-2">
                                    <i class="fas fa-users"></i> ${node.personale || 0}
                                </span>
                            </div>
                            ${node.children.length > 0 ? renderTreeNodes(node.children, level + 1) : ''}
                        </li>
                    `;
                }).join('')}
            </ul>
        `;
    }

    function renderOrganigramma() {
        const container = document.querySelector(CONFIG.SELECTORS.treeView);
        if (!container) return;

        // Usa una libreria di organigramma se disponibile
        // Per ora usa la vista ad albero con stile diverso
        container.classList.add('organigramma-view');
        renderTreeView();
    }

    // ========================================
    // GESTIONE EVENTI
    // ========================================
    
    function setupEventHandlers() {
        // Bottone aggiungi
        const addBtn = document.querySelector(CONFIG.SELECTORS.addBtn);
        if (addBtn && state.permissions.canCreate) {
            addBtn.addEventListener('click', handleAdd);
        }

        // Bottone export
        const exportBtn = document.querySelector(CONFIG.SELECTORS.exportBtn);
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExport);
        }
    }

    function attachRowEventHandlers() {
        // View buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                handleView(id);
            });
        });

        // Edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                handleEdit(id);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                handleDelete(id);
            });
        });

        // Row click
        document.querySelectorAll('.entity-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const id = parseInt(row.dataset.entityId);
                handleView(id);
            });
        });
    }

    function attachTreeEventHandlers() {
        // Toggle nodi
        document.querySelectorAll('.tree-toggle.has-children').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const node = e.target.closest('.tree-node');
                node.classList.toggle('expanded');
                
                const icon = toggle.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-right');
                    icon.classList.toggle('fa-chevron-down');
                }
            });
        });

        // Click su nodo
        document.querySelectorAll('.tree-node-content').forEach(content => {
            content.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.closest('.tree-node').dataset.entityId);
                handleView(id);
            });
        });
    }

    // ========================================
    // RICERCA E FILTRI
    // ========================================
    
    function setupSearch() {
        const searchInput = document.querySelector(CONFIG.SELECTORS.searchInput);
        if (!searchInput) return;

        const debouncedSearch = debounce(performSearch, CONFIG.UI.SEARCH_DEBOUNCE);
        
        searchInput.addEventListener('input', (e) => {
            state.searchTerm = e.target.value;
            debouncedSearch();
        });

        log('debug', 'Search setup completed');
    }

    function performSearch() {
        const term = state.searchTerm.toLowerCase();
        
        if (!term) {
            state.filteredEntities = state.entities;
        } else {
            state.filteredEntities = state.entities.filter(entity => {
                return entity.nome.toLowerCase().includes(term) ||
                       entity.comandante?.toLowerCase().includes(term) ||
                       entity.sede?.toLowerCase().includes(term) ||
                       entity.tipo.toLowerCase().includes(term);
            });
        }

        renderCurrentView();
        log('debug', `Search performed: ${state.filteredEntities.length} results`);
    }

    function setupFilters() {
        const filterForm = document.querySelector(CONFIG.SELECTORS.filterForm);
        if (!filterForm) return;

        filterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            applyFilters();
        });

        // Reset filters
        const resetBtn = filterForm.querySelector('.reset-filters');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetFilters);
        }
    }

    function applyFilters() {
        // Implementa logica filtri
        log('debug', 'Filters applied');
    }

    function resetFilters() {
        state.filters = {};
        state.filteredEntities = state.entities;
        renderCurrentView();
        log('debug', 'Filters reset');
    }

    // ========================================
    // TOGGLE VISTA
    // ========================================
    
    function setupViewToggle() {
        const toggleButtons = document.querySelectorAll(CONFIG.SELECTORS.viewToggle);
        
        toggleButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                if (view && view !== state.currentView) {
                    switchView(view);
                }
            });
        });
    }

    function switchView(view) {
        state.currentView = view;
        
        // Aggiorna UI bottoni
        document.querySelectorAll(CONFIG.SELECTORS.viewToggle).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        renderCurrentView();
        log('debug', `Switched to ${view} view`);
    }

    // ========================================
    // OPERAZIONI CRUD
    // ========================================
    
    function handleView(id) {
        const entity = state.entities.find(e => e.id === id);
        if (!entity) return;

        state.selectedEntity = entity;
        showDetailPanel(entity);
    }

    function handleAdd() {
        state.selectedEntity = null;
        showEntityModal('create');
    }

    function handleEdit(id) {
        const entity = state.entities.find(e => e.id === id);
        if (!entity) return;

        state.selectedEntity = entity;
        showEntityModal('edit');
    }

    async function handleDelete(id) {
        const entity = state.entities.find(e => e.id === id);
        if (!entity) return;

        const confirmed = await showConfirmDialog(
            'Conferma Eliminazione',
            `Sei sicuro di voler eliminare "${entity.nome}"?`
        );

        if (confirmed) {
            try {
                await deleteEntity(id);
                showToast('Ente eliminato con successo', 'success');
                loadEntities(); // Ricarica lista
            } catch (error) {
                log('error', 'Delete failed:', error);
                showToast('Errore durante l\'eliminazione', 'error');
            }
        }
    }

    function handleExport() {
        const data = state.filteredEntities;
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `enti_militari_${new Date().getTime()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showToast('Dati esportati con successo', 'success');
    }

    // ========================================
    // UI HELPERS
    // ========================================
    
    function showDetailPanel(entity) {
        const panel = document.querySelector(CONFIG.SELECTORS.detailPanel);
        if (!panel) return;

        const typeConfig = CONFIG.ENTITY_TYPES[entity.tipo] || {};
        
        panel.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h5>
                        <i class="fas ${typeConfig.icon}" style="color: ${typeConfig.color}"></i>
                        ${escapeHtml(entity.nome)}
                    </h5>
                </div>
                <div class="card-body">
                    <dl class="row">
                        <dt class="col-sm-4">Tipo:</dt>
                        <dd class="col-sm-8">
                            <span class="badge" style="background-color: ${typeConfig.color}">
                                ${typeConfig.label || entity.tipo}
                            </span>
                        </dd>
                        
                        <dt class="col-sm-4">Comandante:</dt>
                        <dd class="col-sm-8">${escapeHtml(entity.comandante || '-')}</dd>
                        
                        <dt class="col-sm-4">Sede:</dt>
                        <dd class="col-sm-8">${escapeHtml(entity.sede || '-')}</dd>
                        
                        <dt class="col-sm-4">Personale:</dt>
                        <dd class="col-sm-8">
                            <i class="fas fa-users"></i> ${entity.personale || 0}
                        </dd>
                        
                        <dt class="col-sm-4">Descrizione:</dt>
                        <dd class="col-sm-8">${escapeHtml(entity.descrizione || '-')}</dd>
                    </dl>
                </div>
            </div>
        `;

        panel.style.display = 'block';
    }

    function showEntityModal(mode) {
        // Implementa modal per create/edit
        log('debug', `Show modal in ${mode} mode`);
    }

    function setupModals() {
        // Setup modal handlers
        log('debug', 'Modals setup completed');
    }

    function showLoading() {
        const container = document.querySelector(CONFIG.SELECTORS.container);
        if (container) {
            container.classList.add('loading');
        }
    }

    function hideLoading() {
        const container = document.querySelector(CONFIG.SELECTORS.container);
        if (container) {
            container.classList.remove('loading');
        }
    }

    function showError(message) {
        showToast(message, 'error');
    }

    function showToast(message, type = 'info') {
        if (window.TalonApp?.showToast) {
            window.TalonApp.showToast(message, type);
        } else {
            // console.log removed for production silence
        }
    }

    async function showConfirmDialog(title, message) {
        if (window.confirm) {
            return window.confirm(`${title}\n\n${message}`);
        }
        return false;
    }

    // ========================================
    // API CALLS
    // ========================================
    
    async function deleteEntity(id) {
        if (window.TALON_CONFIG?.api?.baseUrl) {
            const url = CONFIG.API.DELETE.replace('{id}', id);
            const response = await fetch(`${window.TALON_CONFIG.api.baseUrl}${url}`, {
                method: 'DELETE',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': window.TALON_CONFIG?.api?.csrfToken || ''
                }
            });
            
            if (!response.ok) {
                throw new Error('Delete failed');
            }
            
            return await response.json();
        }
        
        // Mock delete
        state.entities = state.entities.filter(e => e.id !== id);
        return { success: true };
    }

    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('debug', 'Cleaning up Enti Militari module...');
        
        state.initialized = false;
        state.entities = [];
        state.filteredEntities = [];
        state.selectedEntity = null;
        
        log('debug', 'Enti Militari module cleaned up');
    }

    // ========================================
    // INTEGRAZIONE SPA
    // ========================================
    
    function handleSPANavigation() {
        if (isEntiMilitariPage()) {
            if (!state.initialized) {
                initialize();
            } else {
                loadEntities();
            }
        } else {
            if (state.initialized) {
                cleanup();
            }
        }
    }

    // ========================================
    // EXPORT API PUBBLICA
    // ========================================
    
    window.TalonEntiMilitari = {
        init: initialize,
        cleanup: cleanup,
        refresh: loadEntities,
        getState: () => ({ ...state }),
        getConfig: () => ({ ...CONFIG }),
        switchView: switchView,
        search: performSearch,
        export: handleExport,
        version: '2.0.0'
    };

    // ========================================
    // AUTO-INIT E EVENT LISTENERS
    // ========================================
    
    // Ascolta eventi SPA
    document.addEventListener('spa:content-loaded', handleSPANavigation);
    document.addEventListener('spa:before-navigate', () => {
        if (state.initialized && !isEntiMilitariPage()) {
            cleanup();
        }
    });

    // Auto-init quando DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 100);
    }


})(window, document);