/**
 * ========================================
 * TALON - OPERAZIONI MODULE
 * File: static/js/operazioni.js
 * 
 * Versione: 2.1.0 - Standard Version
 * Data: 2025
 * Funzionalità: Gestione operazioni e missioni
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
            BASE: '/api/operazioni',
            LIST: '/api/operazioni/list',
            DETAIL: '/api/operazioni/{id}',
            CREATE: '/api/operazioni/create',
            UPDATE: '/api/operazioni/update/{id}',
            DELETE: '/api/operazioni/delete/{id}',
            SEARCH: '/api/operazioni/search'
        },
        
        // UI Configuration
        UI: {
            ANIMATION_DURATION: 300,
            SEARCH_DEBOUNCE: 500,
            PAGE_SIZE: 20,
            DATE_FORMAT: 'DD/MM/YYYY'
        },
        
        // Selettori DOM
        SELECTORS: {
            container: '#operazioni-container, .operazioni-container',
            listView: '#operazioni-list, .operazioni-list',
            gridView: '#operazioni-grid, .operazioni-grid',
            searchInput: '#search-operazioni',
            filterPanel: '#filter-panel',
            statusFilter: '#status-filter',
            nazioneFilter: '#nazione-filter',
            dateRangeFilter: '#date-range-filter',
            addBtn: '#add-operazione-btn',
            exportBtn: '#export-operazioni-btn',
            viewToggle: '.view-mode-btn',
            modal: '#operazione-modal',
            detailPanel: '#operazione-detail'
        },
        
        // Stati operazione (solo 3 come richiesto)
        OPERATION_STATUS: {
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
            TERMINATA: { 
                label: 'Terminata', 
                icon: 'fa-check-circle', 
                color: '#28a745'
            }
        }
    };

    // ========================================
    // STATO APPLICAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        currentView: 'list', // 'list' | 'grid'
        operations: [],
        filteredOperations: [],
        selectedOperation: null,
        searchTerm: '',
        filters: {
            status: null,
            nazione: null,
            dateFrom: null,
            dateTo: null
        },
        isLoading: false,
        permissions: null
    };

    // ========================================
    // UTILITÀ
    // ========================================
    
    function log(level, ...args) {
        if (!CONFIG.DEBUG) return;
        const prefix = `[Operazioni]`;
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

    function formatDate(date) {
        if (!date) return 'N/D';
        const d = new Date(date);
        return d.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
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
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} mesi`;
        return `${Math.floor(diffDays / 365)} anni`;
    }

    function getOperationStatus(operation) {
        if (!operation.data_inizio) {
            return 'PIANIFICATA';
        }
        
        const now = new Date();
        const startDate = new Date(operation.data_inizio);
        const endDate = operation.data_fine ? new Date(operation.data_fine) : null;
        
        if (endDate && now > endDate) {
            return 'TERMINATA';
        } else if (now >= startDate) {
            return 'IN_CORSO';
        } else {
            return 'PIANIFICATA';
        }
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        if (state.initialized) {
            log('warn', 'Already initialized');
            return;
        }

        log('info', '🚀 Initializing Operazioni Module...');

        // Verifica se siamo nella pagina corretta
        if (!isOperazioniPage()) {
            log('debug', 'Not on operazioni page, skipping init');
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
        loadOperations();
        
        state.initialized = true;
        log('success', '✅ Operazioni Module initialized');
        
        // Emit evento
        document.dispatchEvent(new CustomEvent('operazioni:ready'));
    }

    function isOperazioniPage() {
        const container = document.querySelector(CONFIG.SELECTORS.container);
        const isInPath = window.location.pathname.includes('/operazioni');
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
    
    async function loadOperations() {
        if (state.isLoading) return;
        
        state.isLoading = true;
        showLoading();
        
        try {
            const data = await fetchOperations();
            state.operations = data;
            state.filteredOperations = data;
            
            renderCurrentView();
            log('success', `Loaded ${data.length} operations`);
            
        } catch (error) {
            log('error', 'Failed to load operations:', error);
            showError('Errore nel caricamento delle operazioni');
        } finally {
            state.isLoading = false;
            hideLoading();
        }
    }

    async function fetchOperations() {
        // Se abbiamo endpoint API, usa quello
        if (window.TALON_CONFIG?.api?.baseUrl) {
            try {
                const response = await fetch(
                    `${window.TALON_CONFIG.api.baseUrl}${CONFIG.API.LIST}`
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
                nome_missione: 'Operazione Mare Nostrum',
                nome_breve: 'MARE_NOSTRUM',
                teatro_operativo: 'Mediterraneo Centrale',
                nazione: 'Italia',
                data_inizio: '2025-01-15',
                data_fine: null,
                descrizione: 'Operazione di controllo e soccorso nel Mediterraneo centrale per la gestione dei flussi migratori',
                creato_da: 1,
                data_creazione: '2025-01-10T10:00:00',
                modificato_da: null,
                data_modifica: null
            },
            {
                id: 2,
                nome_missione: 'Supporto Emergenza Alluvione',
                nome_breve: 'ALLUVIONE_2025',
                teatro_operativo: 'Emilia Romagna',
                nazione: 'Italia',
                data_inizio: '2025-05-20',
                data_fine: '2025-06-15',
                descrizione: 'Intervento di supporto alla popolazione colpita dall\'alluvione in Emilia Romagna',
                creato_da: 1,
                data_creazione: '2025-05-19T08:00:00',
                modificato_da: 2,
                data_modifica: '2025-06-15T18:00:00'
            },
            {
                id: 3,
                nome_missione: 'Esercitazione Difesa Civile',
                nome_breve: 'DIFCIV_2025',
                teatro_operativo: 'Centro Italia',
                nazione: 'Italia',
                data_inizio: '2025-09-01',
                data_fine: null,
                descrizione: 'Esercitazione congiunta con la protezione civile per scenari di emergenza sismica',
                creato_da: 1,
                data_creazione: '2025-07-01T09:00:00',
                modificato_da: null,
                data_modifica: null
            },
            {
                id: 4,
                nome_missione: 'Operazione Strade Sicure',
                nome_breve: 'STRADE_SICURE',
                teatro_operativo: 'Territorio Nazionale',
                nazione: 'Italia',
                data_inizio: '2025-01-01',
                data_fine: null,
                descrizione: 'Controllo del territorio e supporto alle forze dell\'ordine nelle principali città italiane',
                creato_da: 1,
                data_creazione: '2024-12-15T10:00:00',
                modificato_da: null,
                data_modifica: null
            },
            {
                id: 5,
                nome_missione: 'Missione UNIFIL',
                nome_breve: 'UNIFIL',
                teatro_operativo: 'Libano Sud',
                nazione: 'Libano',
                data_inizio: '2024-06-01',
                data_fine: null,
                descrizione: 'Partecipazione alla missione ONU di peacekeeping in Libano',
                creato_da: 1,
                data_creazione: '2024-05-15T11:00:00',
                modificato_da: 3,
                data_modifica: '2025-01-10T14:00:00'
            },
            {
                id: 6,
                nome_missione: 'Addestramento Alpino',
                nome_breve: 'ALP_TRAINING',
                teatro_operativo: 'Alpi Orientali',
                nazione: 'Italia',
                data_inizio: '2025-02-01',
                data_fine: '2025-02-28',
                descrizione: 'Addestramento truppe alpine in ambiente montano invernale',
                creato_da: 2,
                data_creazione: '2025-01-20T09:30:00',
                modificato_da: 2,
                data_modifica: '2025-02-28T17:00:00'
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
            case 'grid':
                renderGridView();
                break;
            default:
                renderListView();
        }
    }

    function renderListView() {
        const container = document.querySelector(CONFIG.SELECTORS.listView);
        if (!container) return;

        const operations = state.filteredOperations;
        
        if (operations.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Nessuna operazione trovata
                </div>
            `;
            return;
        }

        const html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Nome Missione</th>
                            <th>Nome Breve</th>
                            <th>Teatro Operativo</th>
                            <th>Nazione</th>
                            <th>Data Inizio</th>
                            <th>Data Fine</th>
                            <th>Stato</th>
                            <th>Durata</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${operations.map(op => renderOperationRow(op)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        attachRowEventHandlers();
    }

    function renderOperationRow(operation) {
        const status = getOperationStatus(operation);
        const statusConfig = CONFIG.OPERATION_STATUS[status];
        const canEdit = state.permissions.canEdit;
        const canDelete = state.permissions.canDelete;
        
        const duration = calculateDuration(operation.data_inizio, operation.data_fine);

        return `
            <tr data-operation-id="${operation.id}" class="operation-row">
                <td>
                    <strong>${escapeHtml(operation.nome_missione)}</strong>
                </td>
                <td>
                    <code>${escapeHtml(operation.nome_breve || '-')}</code>
                </td>
                <td>${escapeHtml(operation.teatro_operativo || '-')}</td>
                <td>${escapeHtml(operation.nazione || '-')}</td>
                <td>
                    <small>${formatDate(operation.data_inizio)}</small>
                </td>
                <td>
                    <small>${formatDate(operation.data_fine) || 'In corso'}</small>
                </td>
                <td>
                    <span class="badge" style="background-color: ${statusConfig.color}">
                        <i class="fas ${statusConfig.icon} me-1"></i>
                        ${statusConfig.label}
                    </span>
                </td>
                <td>
                    <small>${duration}</small>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info view-btn" 
                                data-id="${operation.id}" 
                                title="Dettagli">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${canEdit ? `
                            <button class="btn btn-outline-warning edit-btn" 
                                    data-id="${operation.id}" 
                                    title="Modifica">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button class="btn btn-outline-danger delete-btn" 
                                    data-id="${operation.id}" 
                                    title="Elimina">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    function renderGridView() {
        const container = document.querySelector(CONFIG.SELECTORS.gridView);
        if (!container) return;

        const operations = state.filteredOperations;
        
        if (operations.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Nessuna operazione trovata
                </div>
            `;
            return;
        }

        const html = `
            <div class="row g-3">
                ${operations.map(op => renderOperationCard(op)).join('')}
            </div>
        `;

        container.innerHTML = html;
        attachCardEventHandlers();
    }

    function renderOperationCard(operation) {
        const status = getOperationStatus(operation);
        const statusConfig = CONFIG.OPERATION_STATUS[status];
        const canEdit = state.permissions.canEdit;
        const canDelete = state.permissions.canDelete;
        const duration = calculateDuration(operation.data_inizio, operation.data_fine);

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 operation-card" data-operation-id="${operation.id}">
                    <div class="card-header" style="background-color: ${statusConfig.color}20; border-left: 4px solid ${statusConfig.color};">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                ${escapeHtml(operation.nome_missione)}
                            </h6>
                            <span class="badge" style="background-color: ${statusConfig.color}">
                                <i class="fas ${statusConfig.icon}"></i> ${statusConfig.label}
                            </span>
                        </div>
                    </div>
                    <div class="card-body">
                        <p class="card-text">
                            <strong>Codice:</strong> <code>${escapeHtml(operation.nome_breve || 'N/D')}</code><br>
                            <strong>Teatro:</strong> ${escapeHtml(operation.teatro_operativo || 'N/D')}<br>
                            <strong>Nazione:</strong> ${escapeHtml(operation.nazione || 'N/D')}<br>
                            <strong>Periodo:</strong> ${formatDate(operation.data_inizio)} - ${formatDate(operation.data_fine) || 'In corso'}<br>
                            <strong>Durata:</strong> ${duration}
                        </p>
                        ${operation.descrizione ? `
                            <p class="card-text">
                                <small class="text-muted">${escapeHtml(operation.descrizione.substring(0, 100))}${operation.descrizione.length > 100 ? '...' : ''}</small>
                            </p>
                        ` : ''}
                    </div>
                    <div class="card-footer bg-transparent">
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-info view-btn" data-id="${operation.id}" title="Dettagli">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${canEdit ? `
                                <button class="btn btn-outline-warning edit-btn" data-id="${operation.id}" title="Modifica">
                                    <i class="fas fa-edit"></i>
                                </button>
                            ` : ''}
                            ${canDelete ? `
                                <button class="btn btn-outline-danger delete-btn" data-id="${operation.id}" title="Elimina">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
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

    function attachRowEventHandlers() {
        // Row click
        document.querySelectorAll('.operation-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const id = parseInt(row.dataset.operationId);
                handleView(id);
            });
        });

        attachCommonEventHandlers();
    }

    function attachCardEventHandlers() {
        // Card click
        document.querySelectorAll('.operation-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const id = parseInt(card.dataset.operationId);
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
            state.filteredOperations = state.operations;
        } else {
            state.filteredOperations = state.operations.filter(operation => {
                // Search filter
                const matchesSearch = !term || 
                    operation.nome_missione.toLowerCase().includes(term) ||
                    operation.nome_breve?.toLowerCase().includes(term) ||
                    operation.teatro_operativo?.toLowerCase().includes(term) ||
                    operation.nazione?.toLowerCase().includes(term) ||
                    operation.descrizione?.toLowerCase().includes(term);
                
                // Status filter
                const operationStatus = getOperationStatus(operation);
                const matchesStatus = !state.filters.status || 
                    operationStatus === state.filters.status;
                
                // Nazione filter
                const matchesNazione = !state.filters.nazione ||
                    operation.nazione === state.filters.nazione;
                
                // Date filter
                let matchesDate = true;
                if (state.filters.dateFrom || state.filters.dateTo) {
                    const opStart = new Date(operation.data_inizio);
                    const filterFrom = state.filters.dateFrom ? new Date(state.filters.dateFrom) : null;
                    const filterTo = state.filters.dateTo ? new Date(state.filters.dateTo) : null;
                    
                    if (filterFrom && opStart < filterFrom) matchesDate = false;
                    if (filterTo && opStart > filterTo) matchesDate = false;
                }
                
                return matchesSearch && matchesStatus && matchesNazione && matchesDate;
            });
        }

        renderCurrentView();
        log('debug', `Search performed: ${state.filteredOperations.length} results`);
    }

    function setupFilters() {
        // Status filter
        const statusFilter = document.querySelector(CONFIG.SELECTORS.statusFilter);
        if (statusFilter) {
            // Popola opzioni
            const options = ['<option value="">Tutti gli stati</option>'];
            Object.entries(CONFIG.OPERATION_STATUS).forEach(([key, config]) => {
                options.push(`<option value="${key}">${config.label}</option>`);
            });
            statusFilter.innerHTML = options.join('');
            
            statusFilter.addEventListener('change', (e) => {
                state.filters.status = e.target.value || null;
                performSearch();
            });
        }

        // Nazione filter
        const nazioneFilter = document.querySelector(CONFIG.SELECTORS.nazioneFilter);
        if (nazioneFilter) {
            // Estrai nazioni uniche dalle operazioni
            const nazioni = [...new Set(state.operations.map(op => op.nazione).filter(n => n))];
            const options = ['<option value="">Tutte le nazioni</option>'];
            nazioni.sort().forEach(nazione => {
                options.push(`<option value="${nazione}">${nazione}</option>`);
            });
            nazioneFilter.innerHTML = options.join('');
            
            nazioneFilter.addEventListener('change', (e) => {
                state.filters.nazione = e.target.value || null;
                performSearch();
            });
        }

        // Date range filter
        const dateFromInput = document.querySelector('#date-from');
        const dateToInput = document.querySelector('#date-to');
        
        if (dateFromInput) {
            dateFromInput.addEventListener('change', (e) => {
                state.filters.dateFrom = e.target.value || null;
                performSearch();
            });
        }
        
        if (dateToInput) {
            dateToInput.addEventListener('change', (e) => {
                state.filters.dateTo = e.target.value || null;
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
        return state.filters.status || 
               state.filters.nazione || 
               state.filters.dateFrom ||
               state.filters.dateTo;
    }

    function resetFilters() {
        state.filters = {
            status: null,
            nazione: null,
            dateFrom: null,
            dateTo: null
        };
        state.searchTerm = '';
        
        // Reset UI
        const searchInput = document.querySelector(CONFIG.SELECTORS.searchInput);
        if (searchInput) searchInput.value = '';
        
        const statusFilter = document.querySelector(CONFIG.SELECTORS.statusFilter);
        if (statusFilter) statusFilter.value = '';
        
        const nazioneFilter = document.querySelector(CONFIG.SELECTORS.nazioneFilter);
        if (nazioneFilter) nazioneFilter.value = '';
        
        const dateFromInput = document.querySelector('#date-from');
        if (dateFromInput) dateFromInput.value = '';
        
        const dateToInput = document.querySelector('#date-to');
        if (dateToInput) dateToInput.value = '';
        
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
        ['listView', 'gridView'].forEach(v => {
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
        const operation = state.operations.find(o => o.id === id);
        if (!operation) return;

        state.selectedOperation = operation;
        showDetailModal(operation);
    }

    function handleAdd() {
        state.selectedOperation = null;
        showOperationModal('create');
    }

    function handleEdit(id) {
        const operation = state.operations.find(o => o.id === id);
        if (!operation) return;

        state.selectedOperation = operation;
        showOperationModal('edit');
    }

    async function handleDelete(id) {
        const operation = state.operations.find(o => o.id === id);
        if (!operation) return;

        const confirmed = await showConfirmDialog(
            'Conferma Eliminazione',
            `Sei sicuro di voler eliminare l'operazione "${operation.nome_missione}"?`
        );

        if (confirmed) {
            try {
                await deleteOperation(id);
                showToast('Operazione eliminata con successo', 'success');
                loadOperations();
            } catch (error) {
                log('error', 'Delete failed:', error);
                showToast('Errore durante l\'eliminazione', 'error');
            }
        }
    }

    function handleExport() {
        const data = state.filteredOperations;
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `operazioni_${new Date().getTime()}.json`;
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

    function showDetailModal(operation) {
        const status = getOperationStatus(operation);
        const statusConfig = CONFIG.OPERATION_STATUS[status];
        const duration = calculateDuration(operation.data_inizio, operation.data_fine);
        
        const modalHtml = `
            <div class="modal fade" id="operationDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" style="background-color: ${statusConfig.color}20;">
                            <h5 class="modal-title">
                                ${escapeHtml(operation.nome_missione)}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>Informazioni Generali</h6>
                                    <dl>
                                        <dt>Nome Breve:</dt>
                                        <dd><code>${escapeHtml(operation.nome_breve || 'N/D')}</code></dd>
                                        
                                        <dt>Teatro Operativo:</dt>
                                        <dd>${escapeHtml(operation.teatro_operativo || 'N/D')}</dd>
                                        
                                        <dt>Nazione:</dt>
                                        <dd>${escapeHtml(operation.nazione || 'N/D')}</dd>
                                        
                                        <dt>Stato:</dt>
                                        <dd>
                                            <span class="badge" style="background-color: ${statusConfig.color}">
                                                <i class="fas ${statusConfig.icon} me-1"></i>
                                                ${statusConfig.label}
                                            </span>
                                        </dd>
                                    </dl>
                                </div>
                                <div class="col-md-6">
                                    <h6>Periodo</h6>
                                    <dl>
                                        <dt>Data Inizio:</dt>
                                        <dd>${formatDate(operation.data_inizio)}</dd>
                                        
                                        <dt>Data Fine:</dt>
                                        <dd>${formatDate(operation.data_fine) || 'In corso'}</dd>
                                        
                                        <dt>Durata:</dt>
                                        <dd>${duration}</dd>
                                    </dl>
                                </div>
                            </div>
                            
                            ${operation.descrizione ? `
                                <div class="row mt-3">
                                    <div class="col-12">
                                        <h6>Descrizione</h6>
                                        <p>${escapeHtml(operation.descrizione)}</p>
                                    </div>
                                </div>
                            ` : ''}
                            
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>Informazioni di Sistema</h6>
                                    <small class="text-muted">
                                        Creato il: ${operation.data_creazione ? new Date(operation.data_creazione).toLocaleString('it-IT') : 'N/D'}<br>
                                        ${operation.data_modifica ? `Modificato il: ${new Date(operation.data_modifica).toLocaleString('it-IT')}` : ''}
                                    </small>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${state.permissions.canEdit ? `
                                <button type="button" class="btn btn-warning" onclick="TalonOperazioni.edit(${operation.id})">
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
        const existingModal = document.getElementById('operationDetailModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Aggiungi nuovo modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Mostra modal
        const modal = new bootstrap.Modal(document.getElementById('operationDetailModal'));
        modal.show();
    }

    function showOperationModal(mode) {
        // Implementa modal per create/edit
        log('debug', `Show modal in ${mode} mode`);
    }

    // ========================================
    // UI HELPERS
    // ========================================
    
    function showLoading() {
        const containers = [
            CONFIG.SELECTORS.listView,
            CONFIG.SELECTORS.gridView
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
            CONFIG.SELECTORS.listView,
            CONFIG.SELECTORS.gridView
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
    
    async function deleteOperation(id) {
        if (window.TALON_CONFIG?.api?.baseUrl) {
            const url = CONFIG.API.DELETE.replace('{id}', id);
            const response = await fetch(`${window.TALON_CONFIG.api.baseUrl}${url}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Delete failed');
            }
            
            return await response.json();
        }
        
        // Mock delete
        state.operations = state.operations.filter(o => o.id !== id);
        return { success: true };
    }

    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('debug', 'Cleaning up Operazioni module...');
        
        state.initialized = false;
        state.operations = [];
        state.filteredOperations = [];
        state.selectedOperation = null;
        
        log('debug', 'Operazioni module cleaned up');
    }


    // ========================================
    // EXPORT API PUBBLICA
    // ========================================
    
    window.TalonOperazioni = {
        init: initialize,
        cleanup: cleanup,
        refresh: loadOperations,
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
    

    // Auto-init quando DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 100);
    }


})(window, document);