/**
 * ========================================
 * TALON - ENTI CIVILI MODULE (SPA VERSION)
 * File: static/js/enti-civili.js
 * 
 * Versione: 2.0.0 - Full SPA Integration
 * Data: 2025
 * Funzionalità: Gestione infrastrutture civili (porti,
 *               aeroporti, stazioni, ospedali, protezione civile)
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
            BASE: '/api/enti_civili',
            LIST: '/api/enti_civili/list',
            DETAIL: '/api/enti_civili/{id}',
            CREATE: '/api/enti_civili/create',
            UPDATE: '/api/enti_civili/update/{id}',
            DELETE: '/api/enti_civili/delete/{id}',
            SEARCH: '/api/enti_civili/search'
        },
        
        // UI Configuration
        UI: {
            ANIMATION_DURATION: 300,
            SEARCH_DEBOUNCE: 500,
            PAGE_SIZE: 25
        },
        
        // Selettori DOM
        SELECTORS: {
            container: '#enti-civili-container, .enti-civili-container',
            gridView: '#enti-grid, .enti-grid',
            listView: '#enti-list, .enti-list',
            searchInput: '#search-enti-civili',
            filterPanel: '#filter-panel',
            addBtn: '#add-ente-civile-btn',
            exportBtn: '#export-civili-btn',
            viewToggle: '.view-mode-btn',
            modal: '#ente-civile-modal',
            detailCard: '#ente-detail-card'
        },
        
        // Tipi di infrastrutture civili
        INFRASTRUCTURE_TYPES: {
            AEROPORTO: { 
                label: 'Aeroporto', 
                icon: 'fa-plane', 
                color: '#007bff'
            },
            PORTO: { 
                label: 'Porto', 
                icon: 'fa-ship', 
                color: '#17a2b8'
            },
            STAZIONE: { 
                label: 'Stazione Ferroviaria', 
                icon: 'fa-train', 
                color: '#28a745'
            },
            OSPEDALE: { 
                label: 'Ospedale', 
                icon: 'fa-hospital', 
                color: '#dc3545'
            },
            PROTEZIONE_CIVILE: { 
                label: 'Protezione Civile', 
                icon: 'fa-shield-alt', 
                color: '#fd7e14'
            },
            CENTRALE_ELETTRICA: { 
                label: 'Centrale Elettrica', 
                icon: 'fa-bolt', 
                color: '#ffc107'
            },
            IMPIANTO_IDRICO: { 
                label: 'Impianto Idrico', 
                icon: 'fa-tint', 
                color: '#6610f2'
            },
            TELECOMUNICAZIONI: { 
                label: 'Centro Telecomunicazioni', 
                icon: 'fa-broadcast-tower', 
                color: '#e83e8c'
            },
            ALTRO: { 
                label: 'Altra Infrastruttura', 
                icon: 'fa-building', 
                color: '#6c757d'
            }
        }
    };

    // ========================================
    // STATO APPLICAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        currentView: 'grid', // 'grid' | 'list'
        entities: [],
        filteredEntities: [],
        selectedEntity: null,
        searchTerm: '',
        filters: {
            tipo: null,
            provincia: null
        },
        isLoading: false,
        permissions: null
    };

    // ========================================
    // UTILITÀ
    // ========================================
    
    function log(level, ...args) {
        if (!CONFIG.DEBUG) return;
        const prefix = `[EntiCivili]`;
        const styles = {
            info: 'color: #17a2b8',
            success: 'color: #28a745',
            warn: 'color: #ffc107',
            error: 'color: #dc3545',
            debug: 'color: #6c757d'
        };
        console.log(`%c${prefix}`, styles[level] || styles.debug, ...args);
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

    function formatAddress(entity) {
        const parts = [];
        if (entity.indirizzo) parts.push(entity.indirizzo);
        if (entity.civico) parts.push(entity.civico);
        if (entity.cap) parts.push(entity.cap);
        if (entity.citta) parts.push(entity.citta);
        if (entity.provincia) parts.push(`(${entity.provincia})`);
        return parts.join(' ') || 'N/D';
    }

    function getInfrastructureType(nome) {
        const nomeUpper = nome.toUpperCase();
        if (nomeUpper.includes('AEROPORTO')) return 'AEROPORTO';
        if (nomeUpper.includes('PORTO')) return 'PORTO';
        if (nomeUpper.includes('STAZIONE')) return 'STAZIONE';
        if (nomeUpper.includes('OSPEDALE')) return 'OSPEDALE';
        if (nomeUpper.includes('PROTEZIONE CIVILE')) return 'PROTEZIONE_CIVILE';
        if (nomeUpper.includes('CENTRALE')) return 'CENTRALE_ELETTRICA';
        if (nomeUpper.includes('IDRICO')) return 'IMPIANTO_IDRICO';
        if (nomeUpper.includes('TELECOM')) return 'TELECOMUNICAZIONI';
        return 'ALTRO';
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        if (state.initialized) {
            log('warn', 'Already initialized');
            return;
        }

        log('info', '🚀 Initializing Enti Civili Module...');

        // Verifica se siamo nella pagina corretta
        if (!isEntiCiviliPage()) {
            log('debug', 'Not on enti civili page, skipping init');
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
        log('success', '✅ Enti Civili Module initialized');
        
        // Emit evento
        document.dispatchEvent(new CustomEvent('enti-civili:ready'));
    }

    function isEntiCiviliPage() {
        const container = document.querySelector(CONFIG.SELECTORS.container);
        const isInPath = window.location.pathname.includes('/enti_civili');
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
            showError('Errore nel caricamento degli enti civili');
        } finally {
            state.isLoading = false;
            hideLoading();
        }
    }

    async function fetchEntities() {
        // Se abbiamo endpoint API, usa quello
        if (window.TALON_CONFIG?.api?.baseUrl) {
            try {
                const response = await fetch(
                    `${window.TALON_CONFIG.api.baseUrl}${CONFIG.API.LIST}`, 
                    {
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-CSRFToken': window.TALON_CONFIG?.api?.csrfToken || ''
                        }
                    }
                );
                
                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                log('warn', 'API call failed, using mock data:', error);
            }
        }

        // Dati mock per sviluppo/demo - SOLO CAMPI DA SCHEMA DATABASE
        return [
            {
                id: 1,
                nome: 'Aeroporto Internazionale di Milano Malpensa',
                indirizzo: 'Via del Gregge',
                civico: '11',
                cap: '21010',
                telefono: '02-232323',
                email: 'info@aeroporto-malpensa.it',
                citta: 'Ferno',
                provincia: 'VA',
                nazione: 'Italia',
                creato_da: 1,
                data_creazione: '2025-01-15T10:00:00',
                modificato_da: null,
                data_modifica: null
            },
            {
                id: 2,
                nome: 'Porto di Genova',
                indirizzo: 'Calata Sanità',
                civico: 'SN',
                cap: '16126',
                telefono: '010-2411',
                email: 'info@porto.genova.it',
                citta: 'Genova',
                provincia: 'GE',
                nazione: 'Italia',
                creato_da: 1,
                data_creazione: '2025-01-15T10:00:00',
                modificato_da: null,
                data_modifica: null
            },
            {
                id: 3,
                nome: 'Stazione Centrale di Milano',
                indirizzo: 'Piazza Duca d\'Aosta',
                civico: '1',
                cap: '20124',
                telefono: '02-892021',
                email: 'info@rfi.it',
                citta: 'Milano',
                provincia: 'MI',
                nazione: 'Italia',
                creato_da: 1,
                data_creazione: '2025-01-15T10:00:00',
                modificato_da: null,
                data_modifica: null
            },
            {
                id: 4,
                nome: 'Ospedale San Raffaele',
                indirizzo: 'Via Olgettina',
                civico: '60',
                cap: '20132',
                telefono: '02-26431',
                email: 'info@hsr.it',
                citta: 'Milano',
                provincia: 'MI',
                nazione: 'Italia',
                creato_da: 1,
                data_creazione: '2025-01-15T10:00:00',
                modificato_da: null,
                data_modifica: null
            },
            {
                id: 5,
                nome: 'Protezione Civile Lombardia',
                indirizzo: 'Piazza Città di Lombardia',
                civico: '1',
                cap: '20124',
                telefono: '02-67651',
                email: 'protezionecivile@regione.lombardia.it',
                citta: 'Milano',
                provincia: 'MI',
                nazione: 'Italia',
                creato_da: 1,
                data_creazione: '2025-01-15T10:00:00',
                modificato_da: null,
                data_modifica: null
            }
        ];
    }

    // ========================================
    // RENDERING VISTE
    // ========================================
    
    function renderCurrentView() {
        switch (state.currentView) {
            case 'grid':
                renderGridView();
                break;
            case 'list':
                renderListView();
                break;
            default:
                renderGridView();
        }
    }

    function renderGridView() {
        const container = document.querySelector(CONFIG.SELECTORS.gridView);
        if (!container) return;

        const entities = state.filteredEntities;
        
        if (entities.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Nessun ente civile trovato
                </div>
            `;
            return;
        }

        const html = `
            <div class="row g-3">
                ${entities.map(entity => renderEntityCard(entity)).join('')}
            </div>
        `;

        container.innerHTML = html;
        attachCardEventHandlers();
    }

    function renderEntityCard(entity) {
        const tipo = getInfrastructureType(entity.nome);
        const typeConfig = CONFIG.INFRASTRUCTURE_TYPES[tipo];
        const canEdit = state.permissions.canEdit;
        const canDelete = state.permissions.canDelete;

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 entity-card" data-entity-id="${entity.id}">
                    <div class="card-header" style="background-color: ${typeConfig.color}20; border-left: 4px solid ${typeConfig.color};">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="fas ${typeConfig.icon}" style="color: ${typeConfig.color}"></i>
                                ${escapeHtml(entity.nome)}
                            </h6>
                            <span class="badge" style="background-color: ${typeConfig.color}">
                                ${typeConfig.label}
                            </span>
                        </div>
                    </div>
                    <div class="card-body">
                        <p class="card-text">
                            <small class="text-muted">
                                <i class="fas fa-map-marker-alt"></i> ${escapeHtml(formatAddress(entity))}<br>
                                ${entity.telefono ? `<i class="fas fa-phone"></i> ${escapeHtml(entity.telefono)}<br>` : ''}
                                ${entity.email ? `<i class="fas fa-envelope"></i> ${escapeHtml(entity.email)}` : ''}
                            </small>
                        </p>
                    </div>
                    <div class="card-footer bg-transparent">
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-info view-btn" data-id="${entity.id}" title="Dettagli">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${canEdit ? `
                                <button class="btn btn-outline-warning edit-btn" data-id="${entity.id}" title="Modifica">
                                    <i class="fas fa-edit"></i>
                                </button>
                            ` : ''}
                            ${canDelete ? `
                                <button class="btn btn-outline-danger delete-btn" data-id="${entity.id}" title="Elimina">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderListView() {
        const container = document.querySelector(CONFIG.SELECTORS.listView);
        if (!container) return;

        const entities = state.filteredEntities;
        
        if (entities.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Nessun ente civile trovato
                </div>
            `;
            return;
        }

        const html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Nome</th>
                            <th>Indirizzo</th>
                            <th>Città</th>
                            <th>Contatti</th>
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
        const tipo = getInfrastructureType(entity.nome);
        const typeConfig = CONFIG.INFRASTRUCTURE_TYPES[tipo];
        const canEdit = state.permissions.canEdit;
        const canDelete = state.permissions.canDelete;

        return `
            <tr data-entity-id="${entity.id}" class="entity-row">
                <td>
                    <span class="badge" style="background-color: ${typeConfig.color}">
                        <i class="fas ${typeConfig.icon} me-1"></i>
                        ${typeConfig.label}
                    </span>
                </td>
                <td>
                    <strong>${escapeHtml(entity.nome)}</strong>
                </td>
                <td>${escapeHtml(formatAddress(entity))}</td>
                <td>${escapeHtml(entity.citta || '-')} ${entity.provincia ? `(${entity.provincia})` : ''}</td>
                <td>
                    <small>
                        ${entity.telefono ? `<i class="fas fa-phone"></i> ${escapeHtml(entity.telefono)}<br>` : ''}
                        ${entity.email ? `<i class="fas fa-envelope"></i> ${escapeHtml(entity.email)}` : ''}
                    </small>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info view-btn" data-id="${entity.id}" title="Dettagli">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${canEdit ? `
                            <button class="btn btn-outline-warning edit-btn" data-id="${entity.id}" title="Modifica">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button class="btn btn-outline-danger delete-btn" data-id="${entity.id}" title="Elimina">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
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

    function attachCardEventHandlers() {
        // Card click
        document.querySelectorAll('.entity-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const id = parseInt(card.dataset.entityId);
                handleView(id);
            });
        });

        attachCommonEventHandlers();
    }

    function attachRowEventHandlers() {
        // Row click
        document.querySelectorAll('.entity-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const id = parseInt(row.dataset.entityId);
                handleView(id);
            });
        });

        attachCommonEventHandlers();
    }

    function attachCommonEventHandlers() {
        // View buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                handleView(id);
            });
        });

        // Edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                handleEdit(id);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                handleDelete(id);
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
        
        if (!term && !hasActiveFilters()) {
            state.filteredEntities = state.entities;
        } else {
            state.filteredEntities = state.entities.filter(entity => {
                // Search filter
                const matchesSearch = !term || 
                    entity.nome.toLowerCase().includes(term) ||
                    entity.citta?.toLowerCase().includes(term) ||
                    entity.indirizzo?.toLowerCase().includes(term) ||
                    entity.email?.toLowerCase().includes(term);
                
                // Type filter
                const matchesType = !state.filters.tipo || 
                    getInfrastructureType(entity.nome) === state.filters.tipo;
                
                // Province filter
                const matchesProvincia = !state.filters.provincia ||
                    entity.provincia === state.filters.provincia;
                
                return matchesSearch && matchesType && matchesProvincia;
            });
        }

        renderCurrentView();
        log('debug', `Search performed: ${state.filteredEntities.length} results`);
    }

    function setupFilters() {
        // Type filter
        const typeFilter = document.querySelector('#type-filter');
        if (typeFilter) {
            // Popola opzioni
            const options = ['<option value="">Tutti i tipi</option>'];
            Object.entries(CONFIG.INFRASTRUCTURE_TYPES).forEach(([key, config]) => {
                options.push(`<option value="${key}">${config.label}</option>`);
            });
            typeFilter.innerHTML = options.join('');
            
            typeFilter.addEventListener('change', (e) => {
                state.filters.tipo = e.target.value || null;
                performSearch();
            });
        }

        // Province filter
        const provinceFilter = document.querySelector('#province-filter');
        if (provinceFilter) {
            provinceFilter.addEventListener('change', (e) => {
                state.filters.provincia = e.target.value || null;
                performSearch();
            });
        }

        // Reset filters button
        const resetBtn = document.querySelector('#reset-filters');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetFilters);
        }
    }

    function hasActiveFilters() {
        return state.filters.tipo || state.filters.provincia;
    }

    function resetFilters() {
        state.filters = {
            tipo: null,
            provincia: null
        };
        state.searchTerm = '';
        
        // Reset UI
        const searchInput = document.querySelector(CONFIG.SELECTORS.searchInput);
        if (searchInput) searchInput.value = '';
        
        const typeFilter = document.querySelector('#type-filter');
        if (typeFilter) typeFilter.value = '';
        
        const provinceFilter = document.querySelector('#province-filter');
        if (provinceFilter) provinceFilter.value = '';
        
        performSearch();
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

        // Nascondi tutti i container
        ['gridView', 'listView'].forEach(v => {
            const container = document.querySelector(CONFIG.SELECTORS[v]);
            if (container) {
                container.style.display = v === view + 'View' ? 'block' : 'none';
            }
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
        showDetailModal(entity);
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
                loadEntities();
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
        a.download = `enti_civili_${new Date().getTime()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showToast('Dati esportati con successo', 'success');
    }

    // ========================================
    // MODALI
    // ========================================
    
    function setupModals() {
        // Setup modal handlers se necessario
        log('debug', 'Modals setup completed');
    }

    function showDetailModal(entity) {
        const tipo = getInfrastructureType(entity.nome);
        const typeConfig = CONFIG.INFRASTRUCTURE_TYPES[tipo];
        
        const modalHtml = `
            <div class="modal fade" id="entityDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" style="background-color: ${typeConfig.color}20;">
                            <h5 class="modal-title">
                                <i class="fas ${typeConfig.icon}" style="color: ${typeConfig.color}"></i>
                                ${escapeHtml(entity.nome)}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>Informazioni Generali</h6>
                                    <dl>
                                        <dt>Tipo Infrastruttura:</dt>
                                        <dd>
                                            <span class="badge" style="background-color: ${typeConfig.color}">
                                                ${typeConfig.label}
                                            </span>
                                        </dd>
                                        <dt>Nome:</dt>
                                        <dd>${escapeHtml(entity.nome)}</dd>
                                        <dt>Nazione:</dt>
                                        <dd>${escapeHtml(entity.nazione || 'Italia')}</dd>
                                    </dl>
                                </div>
                                <div class="col-md-6">
                                    <h6>Contatti</h6>
                                    <dl>
                                        <dt>Telefono:</dt>
                                        <dd>${escapeHtml(entity.telefono || 'N/D')}</dd>
                                        <dt>Email:</dt>
                                        <dd>${escapeHtml(entity.email || 'N/D')}</dd>
                                    </dl>
                                </div>
                            </div>
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>Indirizzo</h6>
                                    <address>
                                        ${escapeHtml(entity.indirizzo || '')} ${escapeHtml(entity.civico || '')}<br>
                                        ${escapeHtml(entity.cap || '')} ${escapeHtml(entity.citta || '')}<br>
                                        ${entity.provincia ? `Provincia: ${entity.provincia}` : ''}
                                    </address>
                                </div>
                            </div>
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>Informazioni di Sistema</h6>
                                    <small class="text-muted">
                                        Creato il: ${new Date(entity.data_creazione).toLocaleString('it-IT')}<br>
                                        ${entity.data_modifica ? `Modificato il: ${new Date(entity.data_modifica).toLocaleString('it-IT')}` : ''}
                                    </small>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${state.permissions.canEdit ? `
                                <button type="button" class="btn btn-warning" onclick="TalonEntiCivili.edit(${entity.id})">
                                    <i class="fas fa-edit"></i> Modifica
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Chiudi</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Rimuovi modal esistente
        const existingModal = document.getElementById('entityDetailModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Aggiungi nuovo modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Mostra modal
        const modal = new bootstrap.Modal(document.getElementById('entityDetailModal'));
        modal.show();
    }

    function showEntityModal(mode) {
        // Implementa modal per create/edit
        log('debug', `Show modal in ${mode} mode`);
    }

    // ========================================
    // UI HELPERS
    // ========================================
    
    function showLoading() {
        const containers = [
            CONFIG.SELECTORS.gridView,
            CONFIG.SELECTORS.listView
        ];
        
        containers.forEach(selector => {
            const container = document.querySelector(selector);
            if (container) {
                container.classList.add('loading');
            }
        });
    }

    function hideLoading() {
        const containers = [
            CONFIG.SELECTORS.gridView,
            CONFIG.SELECTORS.listView
        ];
        
        containers.forEach(selector => {
            const container = document.querySelector(selector);
            if (container) {
                container.classList.remove('loading');
            }
        });
    }

    function showError(message) {
        showToast(message, 'error');
    }

    function showToast(message, type = 'info') {
        if (window.TalonApp?.showToast) {
            window.TalonApp.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
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
        log('debug', 'Cleaning up Enti Civili module...');
        
        state.initialized = false;
        state.entities = [];
        state.filteredEntities = [];
        state.selectedEntity = null;
        
        log('debug', 'Enti Civili module cleaned up');
    }

    // ========================================
    // INTEGRAZIONE SPA
    // ========================================
    
    function handleSPANavigation() {
        if (isEntiCiviliPage()) {
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
    
    window.TalonEntiCivili = {
        init: initialize,
        cleanup: cleanup,
        refresh: loadEntities,
        getState: () => ({ ...state }),
        getConfig: () => ({ ...CONFIG }),
        switchView: switchView,
        search: performSearch,
        resetFilters: resetFilters,
        edit: (id) => handleEdit(id),
        delete: (id) => handleDelete(id),
        export: handleExport,
        version: '2.0.0'
    };

    // ========================================
    // AUTO-INIT E EVENT LISTENERS
    // ========================================
    
    // Ascolta eventi SPA
    document.addEventListener('spa:content-loaded', handleSPANavigation);
    document.addEventListener('spa:before-navigate', () => {
        if (state.initialized && !isEntiCiviliPage()) {
            cleanup();
        }
    });

    // Auto-init quando DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 100);
    }

    // Log versione
    console.log('%c🏛️ TALON Enti Civili Module v2.0.0 - Ready', 
        'color: #17a2b8; font-weight: bold;');

})(window, document);