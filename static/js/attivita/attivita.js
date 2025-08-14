/**
 * ========================================
 * TALON - ATTIVITÀ MODULE REFACTORED (SPA VERSION)
 * File: static/js/attivita.js
 * 
 * Versione: 3.0.0 - Refactored with integrated list
 * Data: 2025
 * Funzionalità: Gestione completa attività con lista integrata
 * Dipendenze: attivita_utils.js, attivita_forms.js
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Verifica dipendenze
    if (!window.TalonAttivitaUtils) {
        console.error('[Attività] Dipendenza mancante: TalonAttivitaUtils. Carica attivita_utils.js prima di questo modulo.');
        return;
    }

    // Import utilities
    const Utils = window.TalonAttivitaUtils;
    const { log, debounce, escapeHtml, formatDate, calculateDuration, emitEvent, navigateTo } = Utils;
    const { showSuccess, showError, showInfo, showLoader, hideLoader, showConfirmDialog } = Utils;
    const { getActivityStatus, getTotalPersonale, ACTIVITY_STATUS } = Utils;

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        DEBUG: window.TALON_CONFIG?.debug?.enabled || false,
        
        // API Endpoints
        API: {
            BASE: '/api/attivita',
            LIST: '/api/attivita/list',
            DETAIL: '/api/attivita/{id}',
            CREATE: '/api/attivita/create',
            UPDATE: '/api/attivita/update/{id}',
            DELETE: '/api/attivita/delete/{id}',
            SEARCH: '/api/attivita/search',
            ENTI_MILITARI: '/api/enti_militari/list',
            ENTI_CIVILI: '/api/enti_civili/list',
            OPERAZIONI: '/api/operazioni/list',
            TIPOLOGIE: '/api/attivita/tipologie'
        },
        
        // UI Configuration
        UI: {
            ANIMATION_DURATION: 300,
            SEARCH_DEBOUNCE: 500,
            PAGE_SIZE: 25,
            DATE_FORMAT: 'DD/MM/YYYY'
        },
        
        // Selettori DOM
        SELECTORS: {
            // Container principali
            container: '#attivita-container, .attivita-container',
            
            // Viste
            listView: '#attivita-list, .attivita-list',
            gridView: '#attivita-grid, .attivita-grid',
            timelineView: '#attivita-timeline, .attivita-timeline',
            
            // Tabella lista
            tableBody: '#attivitaTableBody, tbody.attivita-tbody, table tbody',
            tableHeaders: '.styled-table th.sortable, th[data-sortable]',
            clickableRows: '.clickable-row, tr[data-href]',
            
            // Controlli
            searchInput: '#searchInput, #search-attivita, input[type="search"], .search-input',
            filterPanel: '#filter-panel',
            operazioneFilter: '#operazione-filter',
            dateRangeFilter: '#date-range-filter',
            addBtn: '#add-attivita-btn',
            exportBtn: '#export-attivita-btn',
            viewToggle: '.view-mode-btn',
            
            // Modali
            modal: '#attivita-modal',
            detailPanel: '#attivita-detail'
        },
        
        // Tipologie attività
        ACTIVITY_TYPES: {
            1: { label: 'Trasporto Personale', icon: 'fa-users', color: '#17a2b8' },
            2: { label: 'Trasporto Materiali', icon: 'fa-boxes', color: '#28a745' },
            3: { label: 'Trasferimento', icon: 'fa-exchange-alt', color: '#ffc107' },
            4: { label: 'Addestramento', icon: 'fa-graduation-cap', color: '#6610f2' },
            5: { label: 'Esercitazione', icon: 'fa-running', color: '#fd7e14' },
            6: { label: 'Supporto', icon: 'fa-hands-helping', color: '#007bff' },
            7: { label: 'Emergenza', icon: 'fa-ambulance', color: '#dc3545' },
            8: { label: 'Altro', icon: 'fa-tasks', color: '#6c757d' }
        }
    };

    // ========================================
    // STATO APPLICAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        currentView: 'list',
        activities: [],
        filteredActivities: [],
        selectedActivity: null,
        
        // Ricerca e filtri
        searchTerm: '',
        searchTimeout: null,
        filters: {
            operazione: null,
            dateFrom: null,
            dateTo: null,
            tipologia: null
        },
        
        // Ordinamento
        currentSortColumn: null,
        currentSortOrder: 'asc',
        
        // Dati relazionati
        entiMilitari: [],
        entiCivili: [],
        operazioni: [],
        tipologie: [],
        
        // UI State
        isLoading: false,
        permissions: null,
        eventManager: new Utils.EventManager(),
        
        // DOM References
        dom: {
            container: null,
            tableBody: null,
            searchInput: null,
            allRows: [],
            visibleRows: []
        }
    };

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        if (state.initialized) {
            log('Attività', 'warn', 'Already initialized');
            return;
        }

        log('Attività', 'info', '🚀 Initializing Module v3.0...');

        // Verifica se siamo nella pagina corretta
        if (!isAttivitaPage()) {
            log('Attività', 'debug', 'Not on attività page, skipping init');
            return;
        }

        // Inizializza DOM
        initializeDOM();
        
        // Rileva permessi utente
        detectPermissions();
        
        // Setup componenti in base alla vista
        if (isListView()) {
            setupListView();
        } else {
            setupMainView();
        }
        
        // Carica dati iniziali
        Promise.all([
            loadRelatedData(),
            loadActivities()
        ]).then(() => {
            log('Attività', 'success', '✅ All data loaded');
            hideLoader();
        }).catch(error => {
            log('Attività', 'error', 'Failed to load data:', error);
            showError('Errore nel caricamento dei dati');
            hideLoader();
        });
        
        state.initialized = true;
        log('Attività', 'success', '✅ Module initialized');
        
        // Emit evento
        emitEvent('attivita:ready');
    }

    function initializeDOM() {
        // Container principale
        state.dom.container = document.querySelector(CONFIG.SELECTORS.container);
        
        // Tabella (per lista)
        state.dom.tableBody = document.querySelector(CONFIG.SELECTORS.tableBody);
        
        // Search input
        state.dom.searchInput = document.querySelector(CONFIG.SELECTORS.searchInput);
        
        // Se abbiamo una tabella, salva le righe
        if (state.dom.tableBody) {
            state.dom.allRows = Array.from(state.dom.tableBody.querySelectorAll('tr'));
            state.dom.visibleRows = [...state.dom.allRows];
        }
    }

    function isAttivitaPage() {
        return window.location.pathname.includes('/attivita') ||
               document.querySelector(CONFIG.SELECTORS.container) ||
               document.querySelector(CONFIG.SELECTORS.tableBody);
    }

    function isListView() {
        // Determina se siamo in vista lista basandoci su URL o DOM
        return window.location.pathname.includes('/lista') ||
               window.location.pathname.includes('/list') ||
               (state.dom.tableBody && !document.querySelector(CONFIG.SELECTORS.gridView));
    }

    function detectPermissions() {
        state.permissions = {
            canCreate: window.TalonPermissions?.canCreate || false,
            canEdit: window.TalonPermissions?.canEdit || false,
            canDelete: window.TalonPermissions?.canDelete || false,
            isAdmin: window.TalonPermissions?.isAdmin || false
        };
        
        log('Attività', 'debug', 'Permissions detected:', state.permissions);
    }

    // ========================================
    // SETUP VISTE
    // ========================================
    
    function setupListView() {
        log('Attività', 'info', 'Setting up list view');
        
        // Setup righe cliccabili
        setupClickableRows();
        
        // Setup ricerca
        setupSearch();
        
        // Setup ordinamento
        setupSorting();
        
        // Setup filtri
        setupFilters();
        
        // Setup azioni
        setupListActions();
    }

    function setupMainView() {
        log('Attività', 'info', 'Setting up main view');
        
        // Setup handlers base
        setupEventHandlers();
        
        // Setup ricerca
        setupSearch();
        
        // Setup filtri
        setupFilters();
        
        // Setup toggle vista
        setupViewToggle();
        
        // Setup modali
        setupModals();
    }

    // ========================================
    // GESTIONE RIGHE CLICCABILI (Lista)
    // ========================================
    
    function setupClickableRows() {
        if (!state.dom.tableBody) return;

        const clickableRows = state.dom.tableBody.querySelectorAll(CONFIG.SELECTORS.clickableRows);
        
        clickableRows.forEach(row => {
            // Aggiungi stile cursore
            row.style.cursor = 'pointer';
            
            // Click handler
            state.eventManager.add(row, 'click', function(e) {
                // Ignora click su bottoni o link
                if (e.target.closest('button, a, input, select')) {
                    return;
                }
                
                const href = this.dataset.href;
                const activityId = this.dataset.activityId;
                
                if (href) {
                    animateRowClick(this);
                    setTimeout(() => navigateTo(href), CONFIG.UI.ANIMATION_DURATION);
                } else if (activityId) {
                    handleView(parseInt(activityId));
                }
            });
            
            // Hover effect
            state.eventManager.add(row, 'mouseenter', function() {
                this.classList.add('table-active');
            });
            
            state.eventManager.add(row, 'mouseleave', function() {
                this.classList.remove('table-active');
            });
        });
        
        log('Attività', 'debug', `Initialized ${clickableRows.length} clickable rows`);
    }

    function animateRowClick(row) {
        row.style.transform = 'scale(0.98)';
        row.style.transition = 'transform 0.1s ease';
        
        setTimeout(() => {
            row.style.transform = '';
        }, 100);
    }

    // ========================================
    // RICERCA
    // ========================================
    
    function setupSearch() {
        if (!state.dom.searchInput) return;

        // Crea elemento no-results se necessario
        let noResultsRow = document.getElementById('no-results-row');
        if (!noResultsRow && state.dom.tableBody) {
            noResultsRow = createNoResultsRow();
        }

        const searchHandler = debounce(function() {
            state.searchTerm = this.value.trim();
            performSearch();
        }, CONFIG.UI.SEARCH_DEBOUNCE);

        state.eventManager.add(state.dom.searchInput, 'input', searchHandler);
        
        // Clear search on ESC
        state.eventManager.add(state.dom.searchInput, 'keydown', function(e) {
            if (e.key === 'Escape' && this.value) {
                this.value = '';
                state.searchTerm = '';
                performSearch();
            }
        });
        
        log('Attività', 'debug', 'Search initialized');
    }

    function createNoResultsRow() {
        if (!state.dom.tableBody) return null;
        
        const colspan = state.dom.allRows[0]?.children.length || 1;
        const row = document.createElement('tr');
        row.id = 'no-results-row';
        row.style.display = 'none';
        row.innerHTML = `
            <td colspan="${colspan}" class="text-center text-muted py-4">
                <i class="fas fa-search mb-2" style="font-size: 2em;"></i>
                <p class="mb-0">Nessun risultato trovato</p>
            </td>
        `;
        state.dom.tableBody.appendChild(row);
        return row;
    }

    function performSearch() {
        const term = state.searchTerm.toLowerCase();
        
        if (!term && !hasActiveFilters()) {
            state.filteredActivities = state.activities;
            
            // Per vista lista, mostra tutte le righe
            if (state.dom.allRows.length > 0) {
                state.dom.allRows.forEach(row => {
                    row.style.display = '';
                    row.classList.remove('search-match');
                });
                state.dom.visibleRows = [...state.dom.allRows];
            }
        } else {
            // Filtra attività
            state.filteredActivities = state.activities.filter(activity => {
                // Search filter
                const matchesSearch = !term || 
                    activity.descrizione?.toLowerCase().includes(term) ||
                    activity.note?.toLowerCase().includes(term) ||
                    getTipologiaName(activity.tipologia_id).toLowerCase().includes(term);
                
                // Altri filtri
                const matchesOperation = !state.filters.operazione ||
                    activity.operazione_id === parseInt(state.filters.operazione);
                
                const matchesTipologia = !state.filters.tipologia ||
                    activity.tipologia_id === parseInt(state.filters.tipologia);
                
                // Date filter
                let matchesDate = true;
                if (state.filters.dateFrom || state.filters.dateTo) {
                    const activityStart = new Date(activity.data_inizio);
                    const filterFrom = state.filters.dateFrom ? new Date(state.filters.dateFrom) : null;
                    const filterTo = state.filters.dateTo ? new Date(state.filters.dateTo) : null;
                    
                    if (filterFrom && activityStart < filterFrom) matchesDate = false;
                    if (filterTo && activityStart > filterTo) matchesDate = false;
                }
                
                return matchesSearch && matchesOperation && matchesTipologia && matchesDate;
            });
            
            // Per vista lista, filtra righe DOM
            if (state.dom.allRows.length > 0) {
                filterTableRows(term);
            }
        }

        // Aggiorna vista corrente
        if (!isListView()) {
            renderCurrentView();
        }
        
        // Gestione no results
        updateNoResultsMessage();
        
        log('Attività', 'debug', `Search performed: ${state.filteredActivities.length} results`);
        
        // Emit evento
        emitEvent('attivita:search', {
            searchTerm: term,
            results: state.filteredActivities.length,
            total: state.activities.length
        });
    }

    function filterTableRows(searchTerm) {
        if (!state.dom.tableBody) return;
        
        const normalizedSearch = searchTerm.toUpperCase();
        state.dom.visibleRows = [];
        
        state.dom.allRows.forEach(row => {
            const rowText = row.textContent.toUpperCase();
            if (rowText.includes(normalizedSearch)) {
                row.style.display = '';
                row.classList.add('search-match');
                state.dom.visibleRows.push(row);
                
                // Evidenzia termine di ricerca
                highlightSearchTerm(row, searchTerm);
            } else {
                row.style.display = 'none';
                row.classList.remove('search-match');
            }
        });
    }

    function highlightSearchTerm(row, term) {
        if (!term) return;
        
        row.querySelectorAll('td').forEach(cell => {
            if (!cell.querySelector('button, a, input, select')) {
                const text = cell.textContent;
                const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                if (regex.test(text)) {
                    cell.classList.add('has-search-match');
                }
            }
        });
    }

    function updateNoResultsMessage() {
        const noResultsRow = document.getElementById('no-results-row');
        if (!noResultsRow) return;
        
        const hasResults = isListView() ? 
            state.dom.visibleRows.length > 0 : 
            state.filteredActivities.length > 0;
        
        if (!hasResults && (state.searchTerm || hasActiveFilters())) {
            noResultsRow.style.display = 'table-row';
            const message = state.searchTerm ? 
                `Nessun risultato per "${state.searchTerm}"` : 
                'Nessun risultato con i filtri applicati';
            noResultsRow.querySelector('p').textContent = message;
        } else {
            noResultsRow.style.display = 'none';
        }
    }

    // ========================================
    // ORDINAMENTO
    // ========================================
    
    function setupSorting() {
        const sortableHeaders = document.querySelectorAll(CONFIG.SELECTORS.tableHeaders);
        
        sortableHeaders.forEach(header => {
            // Aggiungi indicatore ordinamento
            if (!header.querySelector('[data-arrow]')) {
                const arrow = document.createElement('span');
                arrow.setAttribute('data-arrow', 'true');
                arrow.className = 'sort-arrow ms-1';
                arrow.textContent = '↕';
                header.appendChild(arrow);
            }
            
            // Stile
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            
            state.eventManager.add(header, 'click', function() {
                const column = parseInt(this.dataset.column || this.cellIndex);
                sortTable(column, this);
            });
        });
        
        log('Attività', 'debug', `Sorting initialized for ${sortableHeaders.length} columns`);
    }

    function sortTable(column, header) {
        if (!state.dom.tableBody) return;
        
        // Determina direzione
        const isAsc = header.classList.contains('sorted-asc');
        const order = isAsc ? 'desc' : 'asc';
        
        // Righe da ordinare
        const rowsToSort = state.dom.visibleRows.length > 0 ? 
            [...state.dom.visibleRows] : [...state.dom.allRows];
        
        if (rowsToSort.length === 0) return;

        // Reset classi ordinamento
        document.querySelectorAll(CONFIG.SELECTORS.tableHeaders).forEach(h => {
            h.classList.remove('sorted-asc', 'sorted-desc');
            const arrow = h.querySelector('[data-arrow]');
            if (arrow) {
                arrow.textContent = '↕';
                arrow.classList.remove('text-primary');
            }
        });

        // Aggiungi classe corrente
        header.classList.add(order === 'asc' ? 'sorted-asc' : 'sorted-desc');
        const currentArrow = header.querySelector('[data-arrow]');
        if (currentArrow) {
            currentArrow.textContent = order === 'asc' ? '↑' : '↓';
            currentArrow.classList.add('text-primary');
        }

        // Ordina righe
        rowsToSort.sort((a, b) => {
            const cellA = a.children[column];
            const cellB = b.children[column];
            
            if (!cellA || !cellB) return 0;
            
            let textA = cellA.textContent.trim();
            let textB = cellB.textContent.trim();
            
            // Gestione date (DD/MM/YYYY)
            if (column === 0 || header.dataset.type === 'date') {
                const dateA = Utils.parseITDate(textA);
                const dateB = Utils.parseITDate(textB);
                
                if (dateA && dateB) {
                    return order === 'asc' ? dateA - dateB : dateB - dateA;
                }
            }
            
            // Gestione numeri
            const numA = parseFloat(textA.replace(/[^\d.-]/g, ''));
            const numB = parseFloat(textB.replace(/[^\d.-]/g, ''));
            
            if (!isNaN(numA) && !isNaN(numB)) {
                return order === 'asc' ? numA - numB : numB - numA;
            }
            
            // Ordinamento alfabetico
            textA = textA.toUpperCase();
            textB = textB.toUpperCase();
            
            if (order === 'asc') {
                return textA.localeCompare(textB, 'it');
            } else {
                return textB.localeCompare(textA, 'it');
            }
        });

        // Riappendi righe ordinate
        const fragment = document.createDocumentFragment();
        rowsToSort.forEach(row => fragment.appendChild(row));
        state.dom.tableBody.appendChild(fragment);
        
        // No results sempre alla fine
        const noResultsRow = document.getElementById('no-results-row');
        if (noResultsRow && noResultsRow.parentNode === state.dom.tableBody) {
            state.dom.tableBody.appendChild(noResultsRow);
        }
        
        state.currentSortColumn = column;
        state.currentSortOrder = order;
        
        log('Attività', 'debug', `Table sorted by column ${column} (${order})`);
        
        emitEvent('attivita:sorted', { column, order });
    }

    // ========================================
    // FILTRI
    // ========================================
    
    function setupFilters() {
        // Operation filter
        const operationFilter = document.querySelector(CONFIG.SELECTORS.operazioneFilter);
        if (operationFilter) {
            // Popola opzioni
            populateOperationFilter(operationFilter);
            
            state.eventManager.add(operationFilter, 'change', (e) => {
                state.filters.operazione = e.target.value || null;
                performSearch();
            });
        }

        // Date range filter
        const dateFromInput = document.querySelector('#date-from');
        const dateToInput = document.querySelector('#date-to');
        
        if (dateFromInput) {
            state.eventManager.add(dateFromInput, 'change', (e) => {
                state.filters.dateFrom = e.target.value || null;
                performSearch();
            });
        }
        
        if (dateToInput) {
            state.eventManager.add(dateToInput, 'change', (e) => {
                state.filters.dateTo = e.target.value || null;
                performSearch();
            });
        }

        // Reset filters button
        const resetBtn = document.querySelector('#reset-filters');
        if (resetBtn) {
            state.eventManager.add(resetBtn, 'click', resetFilters);
        }
    }

    function populateOperationFilter(selectElement) {
        const options = ['<option value="">Tutte le operazioni</option>'];
        state.operazioni.forEach(op => {
            options.push(`<option value="${op.id}">${escapeHtml(op.nome_missione)}</option>`);
        });
        selectElement.innerHTML = options.join('');
    }

    function hasActiveFilters() {
        return state.filters.operazione || 
               state.filters.tipologia ||
               state.filters.dateFrom ||
               state.filters.dateTo;
    }

    function resetFilters() {
        state.filters = {
            operazione: null,
            tipologia: null,
            dateFrom: null,
            dateTo: null
        };
        state.searchTerm = '';
        
        // Reset UI
        if (state.dom.searchInput) state.dom.searchInput.value = '';
        
        const operationFilter = document.querySelector(CONFIG.SELECTORS.operazioneFilter);
        if (operationFilter) operationFilter.value = '';
        
        const dateFromInput = document.querySelector('#date-from');
        if (dateFromInput) dateFromInput.value = '';
        
        const dateToInput = document.querySelector('#date-to');
        if (dateToInput) dateToInput.value = '';
        
        performSearch();
        log('Attività', 'debug', 'Filters reset');
    }

    // ========================================
    // GESTIONE EVENTI
    // ========================================
    
    function setupEventHandlers() {
        // Bottone aggiungi
        const addBtn = document.querySelector(CONFIG.SELECTORS.addBtn);
        if (addBtn && state.permissions.canCreate) {
            state.eventManager.add(addBtn, 'click', handleAdd);
        }

        // Bottone export
        const exportBtn = document.querySelector(CONFIG.SELECTORS.exportBtn);
        if (exportBtn) {
            state.eventManager.add(exportBtn, 'click', handleExport);
        }
    }

    function setupListActions() {
        // Azioni specifiche per vista lista
        attachActionButtons();
    }

    function attachActionButtons() {
        // View buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            state.eventManager.add(btn, 'click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                handleView(id);
            });
        });

        // Edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            state.eventManager.add(btn, 'click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                handleEdit(id);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            state.eventManager.add(btn, 'click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                handleDelete(id);
            });
        });
    }

    // ========================================
    // TOGGLE VISTA
    // ========================================
    
    function setupViewToggle() {
        const toggleButtons = document.querySelectorAll(CONFIG.SELECTORS.viewToggle);
        
        toggleButtons.forEach(btn => {
            state.eventManager.add(btn, 'click', (e) => {
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
        ['listView', 'gridView', 'timelineView'].forEach(v => {
            const container = document.querySelector(CONFIG.SELECTORS[v]);
            if (container) {
                container.style.display = v === view + 'View' ? 'block' : 'none';
            }
        });

        renderCurrentView();
        log('Attività', 'debug', `Switched to ${view} view`);
    }

    // ========================================
    // RENDERING
    // ========================================
    
    function renderCurrentView() {
        // Solo per viste non-lista
        if (isListView()) return;
        
        switch (state.currentView) {
            case 'list':
                renderListView();
                break;
            case 'grid':
                renderGridView();
                break;
            case 'timeline':
                renderTimelineView();
                break;
            default:
                renderListView();
        }
    }

    function renderListView() {
        const container = document.querySelector(CONFIG.SELECTORS.listView);
        if (!container) return;

        const activities = state.filteredActivities;
        
        if (activities.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Nessuna attività trovata
                </div>
            `;
            return;
        }

        // Rendering tabella (codice semplificato)
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th class="sortable">Data</th>
                            <th>Tipologia</th>
                            <th>Descrizione</th>
                            <th>Ente</th>
                            <th>Operazione</th>
                            <th>Personale</th>
                            <th>Stato</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activities.map(activity => renderActivityRow(activity)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Re-attach handlers dopo rendering
        attachActionButtons();
    }

    function renderActivityRow(activity) {
        const status = getActivityStatus(activity);
        const statusConfig = ACTIVITY_STATUS[status];
        const totalPersonale = getTotalPersonale(activity);
        const canEdit = state.permissions.canEdit;
        const canDelete = state.permissions.canDelete;
        
        const enteName = getEntityName(activity.ente_svolgimento_id, true);
        const operationName = getOperationName(activity.operazione_id);
        const tipologia = getTipologiaName(activity.tipologia_id);

        return `
            <tr data-activity-id="${activity.id}" class="activity-row clickable-row">
                <td>${formatDate(activity.data_inizio)}</td>
                <td><span class="badge bg-secondary">${escapeHtml(tipologia)}</span></td>
                <td><strong>${escapeHtml(activity.descrizione || 'N/D')}</strong></td>
                <td>${escapeHtml(enteName)}</td>
                <td>${escapeHtml(operationName)}</td>
                <td><span class="badge bg-info"><i class="fas fa-users"></i> ${totalPersonale}</span></td>
                <td>
                    <span class="badge" style="background-color: ${statusConfig.color}">
                        <i class="fas ${statusConfig.icon}"></i> ${statusConfig.label}
                    </span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info view-btn" data-id="${activity.id}" title="Dettagli">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${canEdit ? `
                            <button class="btn btn-outline-warning edit-btn" data-id="${activity.id}" title="Modifica">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button class="btn btn-outline-danger delete-btn" data-id="${activity.id}" title="Elimina">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    function renderGridView() {
        // Implementazione vista grid (semplificata)
        const container = document.querySelector(CONFIG.SELECTORS.gridView);
        if (!container) return;

        const activities = state.filteredActivities;
        
        container.innerHTML = `
            <div class="row g-3">
                ${activities.map(activity => renderActivityCard(activity)).join('')}
            </div>
        `;
        
        attachActionButtons();
    }

    function renderActivityCard(activity) {
        const status = getActivityStatus(activity);
        const statusConfig = ACTIVITY_STATUS[status];
        const totalPersonale = getTotalPersonale(activity);
        const tipologia = getTipologiaName(activity.tipologia_id);
        
        return `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 activity-card" data-activity-id="${activity.id}">
                    <div class="card-header" style="background-color: ${statusConfig.color}20;">
                        <h6 class="mb-0">${escapeHtml(tipologia)}</h6>
                    </div>
                    <div class="card-body">
                        <p>${escapeHtml(activity.descrizione || 'N/D')}</p>
                        <div class="d-flex justify-content-between">
                            <span class="badge bg-info">
                                <i class="fas fa-users"></i> ${totalPersonale}
                            </span>
                            <span class="badge" style="background-color: ${statusConfig.color}">
                                ${statusConfig.label}
                            </span>
                        </div>
                    </div>
                    <div class="card-footer">
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-info view-btn" data-id="${activity.id}">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${state.permissions.canEdit ? `
                                <button class="btn btn-outline-warning edit-btn" data-id="${activity.id}">
                                    <i class="fas fa-edit"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderTimelineView() {
        // Implementazione vista timeline (semplificata)
        const container = document.querySelector(CONFIG.SELECTORS.timelineView);
        if (!container) return;

        const activities = state.filteredActivities.sort((a, b) => 
            new Date(b.data_inizio) - new Date(a.data_inizio)
        );
        
        container.innerHTML = `
            <div class="timeline">
                ${activities.map((activity, index) => renderTimelineItem(activity, index)).join('')}
            </div>
        `;
    }

    function renderTimelineItem(activity, index) {
        const status = getActivityStatus(activity);
        const statusConfig = ACTIVITY_STATUS[status];
        const tipologia = getTipologiaName(activity.tipologia_id);
        const isLeft = index % 2 === 0;

        return `
            <div class="timeline-item ${isLeft ? 'left' : 'right'}" data-activity-id="${activity.id}">
                <div class="timeline-badge" style="background-color: ${statusConfig.color}">
                    <i class="fas ${statusConfig.icon}"></i>
                </div>
                <div class="timeline-panel">
                    <h6>${escapeHtml(tipologia)}</h6>
                    <p>${escapeHtml(activity.descrizione || 'N/D')}</p>
                    <small class="text-muted">
                        <i class="fas fa-calendar"></i> ${formatDate(activity.data_inizio)}
                    </small>
                </div>
            </div>
        `;
    }

    // ========================================
    // OPERAZIONI CRUD
    // ========================================
    
    function handleView(id) {
        const activity = state.activities.find(a => a.id === id);
        if (!activity) return;

        state.selectedActivity = activity;
        showDetailModal(activity);
    }

    function handleAdd() {
        navigateTo('/attivita/nuovo');
    }

    function handleEdit(id) {
        navigateTo(`/attivita/modifica/${id}`);
    }

    async function handleDelete(id) {
        const activity = state.activities.find(a => a.id === id);
        if (!activity) return;

        const confirmed = await showConfirmDialog(
            'Conferma Eliminazione',
            `Sei sicuro di voler eliminare questa attività?`,
            { confirmClass: 'danger', confirmText: 'Elimina' }
        );

        if (confirmed) {
            try {
                showLoader('Eliminazione in corso...');
                await deleteActivity(id);
                showSuccess('Attività eliminata con successo');
                await loadActivities();
            } catch (error) {
                log('Attività', 'error', 'Delete failed:', error);
                showError('Errore durante l\'eliminazione');
            } finally {
                hideLoader();
            }
        }
    }

    function handleExport() {
        const data = state.filteredActivities;
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `attivita_export_${new Date().getTime()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showSuccess('Dati esportati con successo');
    }

    // ========================================
    // MODALI
    // ========================================
    
    function setupModals() {
        log('Attività', 'debug', 'Modals setup completed');
    }

    function showDetailModal(activity) {
        // Usa utility per modal (implementazione semplificata)
        const status = getActivityStatus(activity);
        const statusConfig = ACTIVITY_STATUS[status];
        
        const modalContent = `
            <h5>Attività #${activity.id}</h5>
            <p><strong>Descrizione:</strong> ${escapeHtml(activity.descrizione || 'N/D')}</p>
            <p><strong>Stato:</strong> <span class="badge" style="background-color: ${statusConfig.color}">
                ${statusConfig.label}
            </span></p>
            <p><strong>Data:</strong> ${formatDate(activity.data_inizio)}</p>
        `;
        
        // Implementazione modal con Bootstrap o custom
        showInfo('Dettaglio attività visualizzato');
    }

    // ========================================
    // CARICAMENTO DATI
    // ========================================
    
    async function loadRelatedData() {
        try {
            const [entiMilitari, entiCivili, operazioni] = await Promise.all([
                fetchEntiMilitari(),
                fetchEntiCivili(),
                fetchOperazioni()
            ]);
            
            state.entiMilitari = entiMilitari;
            state.entiCivili = entiCivili;
            state.operazioni = operazioni;
            
            log('Attività', 'debug', 'Related data loaded');
        } catch (error) {
            log('Attività', 'error', 'Failed to load related data:', error);
            throw error;
        }
    }

    async function loadActivities() {
        if (state.isLoading) return;
        
        state.isLoading = true;
        showLoader('Caricamento attività...');
        
        try {
            const data = await fetchActivities();
            state.activities = data;
            state.filteredActivities = data;
            
            if (!isListView()) {
                renderCurrentView();
            }
            
            log('Attività', 'success', `Loaded ${data.length} activities`);
            
        } catch (error) {
            log('Attività', 'error', 'Failed to load activities:', error);
            showError('Errore nel caricamento delle attività');
            throw error;
        } finally {
            state.isLoading = false;
            hideLoader();
        }
    }

    // ========================================
    // API CALLS
    // ========================================
    
    async function fetchActivities() {
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
                log('Attività', 'warn', 'API call failed, using mock data:', error);
            }
        }

        // Mock data per sviluppo
        return getMockActivities();
    }

    async function fetchEntiMilitari() {
        // Mock data
        return [
            { id: 1, nome: 'Comando Forze Operative Nord' },
            { id: 2, nome: '1ª Brigata Meccanizzata' },
            { id: 3, nome: '2ª Brigata Alpina' }
        ];
    }

    async function fetchEntiCivili() {
        // Mock data
        return [
            { id: 1, nome: 'Aeroporto Milano Malpensa' },
            { id: 2, nome: 'Porto di Genova' },
            { id: 3, nome: 'Ospedale San Raffaele' },
            { id: 4, nome: 'Protezione Civile Lombardia' }
        ];
    }

    async function fetchOperazioni() {
        // Mock data
        return [
            { id: 1, nome_missione: 'Operazione Mare Nostrum' },
            { id: 2, nome_missione: 'Supporto Emergenza Alluvione' },
            { id: 3, nome_missione: 'Esercitazione Difesa Civile' },
            { id: 4, nome_missione: 'Operazione Strade Sicure' }
        ];
    }

    async function deleteActivity(id) {
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
        state.activities = state.activities.filter(a => a.id !== id);
        return { success: true };
    }

    // ========================================
    // HELPER FUNCTIONS
    // ========================================
    
    function getEntityName(entityId, isMilitary) {
        const entities = isMilitary ? state.entiMilitari : state.entiCivili;
        const entity = entities.find(e => e.id === entityId);
        return entity ? entity.nome : 'N/D';
    }

    function getOperationName(operationId) {
        const operation = state.operazioni.find(o => o.id === operationId);
        return operation ? operation.nome_missione : 'N/D';
    }

    function getTipologiaName(tipologiaId) {
        const tipologia = CONFIG.ACTIVITY_TYPES[tipologiaId];
        return tipologia ? tipologia.label : 'Altro';
    }

    function getMockActivities() {
        return [
            {
                id: 1,
                ente_svolgimento_id: 1,
                tipologia_id: 1,
                data_inizio: '2025-08-13',
                data_fine: '2025-08-13',
                descrizione: 'Trasporto personale da Milano a Roma',
                personale_ufficiali: 5,
                personale_sottufficiali: 10,
                personale_graduati: 20,
                personale_civili: 0,
                operazione_id: 1
            },
            {
                id: 2,
                ente_svolgimento_id: 2,
                tipologia_id: 2,
                data_inizio: '2025-08-14',
                data_fine: null,
                descrizione: 'Trasporto materiali logistici',
                personale_ufficiali: 2,
                personale_sottufficiali: 5,
                personale_graduati: 8,
                personale_civili: 3,
                operazione_id: 2
            }
        ];
    }

    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('Attività', 'debug', 'Cleaning up module...');
        
        // Rimuovi tutti gli event listeners
        state.eventManager.removeAll();
        
        // Clear timeouts
        if (state.searchTimeout) {
            clearTimeout(state.searchTimeout);
            state.searchTimeout = null;
        }
        
        // Reset stato
        state.initialized = false;
        state.activities = [];
        state.filteredActivities = [];
        state.selectedActivity = null;
        state.dom = {
            container: null,
            tableBody: null,
            searchInput: null,
            allRows: [],
            visibleRows: []
        };
        
        log('Attività', 'debug', 'Module cleaned up');
    }

    // ========================================
    // INTEGRAZIONE SPA
    // ========================================
    
    function handleSPANavigation() {
        if (isAttivitaPage()) {
            if (!state.initialized) {
                initialize();
            } else {
                loadActivities();
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
    
    window.TalonAttivita = {
        // Core
        init: initialize,
        cleanup: cleanup,
        refresh: loadActivities,
        
        // State
        getState: () => ({ ...state }),
        getConfig: () => ({ ...CONFIG }),
        
        // Search & Filter
        search: (term) => {
            if (state.dom.searchInput) {
                state.dom.searchInput.value = term;
                state.searchTerm = term;
                performSearch();
            }
        },
        clearSearch: () => {
            state.searchTerm = '';
            if (state.dom.searchInput) state.dom.searchInput.value = '';
            performSearch();
        },
        resetFilters: resetFilters,
        
        // Views
        switchView: switchView,
        
        // Sorting
        sortByColumn: (column, order = 'asc') => {
            const header = document.querySelector(`th[data-column="${column}"], th:nth-child(${column + 1})`);
            if (header) {
                header.classList.remove('sorted-asc', 'sorted-desc');
                header.classList.add(order === 'asc' ? 'sorted-desc' : 'sorted-asc');
                header.click();
            }
        },
        
        // CRUD
        view: handleView,
        edit: handleEdit,
        delete: handleDelete,
        export: handleExport,
        
        // Version
        version: '3.0.0'
    };

    // ========================================
    // AUTO-INIT E EVENT LISTENERS
    // ========================================
    
    // Ascolta eventi SPA
    document.addEventListener('spa:content-loaded', handleSPANavigation);
    document.addEventListener('spa:before-navigate', () => {
        if (state.initialized && !isAttivitaPage()) {
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