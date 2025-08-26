/**
 * ========================================
 * TALON - MODULO UNIFICATO ORDINAMENTO TABELLE
 * File: static/js/table-sorting.js
 * 
 * Versione: 1.0.0
 * Data: 2025
 * Descrizione: Gestione unificata ordinamento per tutte le tabelle
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Namespace per evitare conflitti
    window.TalonTableSort = window.TalonTableSort || {};

    /**
     * Inizializza l'ordinamento per una tabella
     * @param {Object} options - Opzioni di configurazione
     * @param {string} options.tableSelector - Selettore della tabella
     * @param {string} options.bodyId - ID del tbody (default: autodetect)
     * @param {boolean} options.maintainSearch - Mantieni filtri di ricerca (default: true)
     * @param {Function} options.customSort - Funzione di ordinamento custom per colonne specifiche
     */
    window.TalonTableSort.init = function(options) {
        const defaults = {
            tableSelector: '.styled-table',
            bodyId: null,
            maintainSearch: true,
            customSort: null,
            debug: false
        };

        const config = Object.assign({}, defaults, options);
        
        // Log debug
        if (config.debug) {
            console.log('[TableSort] Initializing with config:', config);
        }

        // Trova la tabella
        const table = document.querySelector(config.tableSelector);
        if (!table) {
            console.warn('[TableSort] Table not found:', config.tableSelector);
            return;
        }

        // Trova il tbody
        const tbody = config.bodyId 
            ? document.getElementById(config.bodyId)
            : table.querySelector('tbody');
            
        if (!tbody) {
            console.warn('[TableSort] Table body not found');
            return;
        }

        // Stato ordinamento
        let currentSortColumn = null;
        let currentSortOrder = 'asc';

        // Setup header cliccabili
        const sortableHeaders = table.querySelectorAll('th.sortable');
        
        if (config.debug) {
            console.log('[TableSort] Found sortable headers:', sortableHeaders.length);
        }
        
        sortableHeaders.forEach((header, index) => {
            // Assicurati che ci sia la struttura corretta
            if (!header.querySelector('.th-arrow')) {
                const existingContent = header.innerHTML;
                // Se non ha già la struttura, wrappala
                if (!existingContent.includes('th-label')) {
                    header.innerHTML = `
                        <span class="th-label">${header.textContent.trim()}</span>
                        <span class="th-arrow"></span>
                    `;
                }
            }
            
            // IMPORTANTE: Forza sempre il data-column con l'indice corretto
            // perché cellIndex potrebbe non essere affidabile
            header.setAttribute('data-column', index.toString());
            
            if (config.debug) {
                console.log(`[TableSort] Header ${index} setup:`, {
                    text: header.textContent.trim(),
                    dataColumn: header.dataset.column,
                    cellIndex: header.cellIndex
                });
            }

            // Aggiungi event listener
            header.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (config.debug) {
                    console.log('[TableSort] Header clicked:', index, this);
                }
                handleSort(this);
            });
        });

        /**
         * Gestisce l'ordinamento quando si clicca su un header
         */
        function handleSort(header) {
            const column = parseInt(header.dataset.column || header.cellIndex);
            // Trova TUTTE le righe tranne quelle speciali
            const allRows = tbody.querySelectorAll('tr');
            const rows = Array.from(allRows).filter(row => {
                // Escludi solo righe speciali
                return !row.classList.contains('no-data-row') && 
                       !row.classList.contains('no-results-row') &&
                       row.children.length > 0; // Assicurati che abbia celle
            });
            
            if (config.debug) {
                console.log('[TableSort] Sorting column:', column);
                console.log('[TableSort] Header clicked:', header);
                console.log('[TableSort] Header dataset:', header.dataset);
                console.log('[TableSort] Header cellIndex:', header.cellIndex);
                console.log('[TableSort] Total rows in tbody:', allRows.length);
                console.log('[TableSort] Sortable rows found:', rows.length);
                if (rows.length > 0) {
                    console.log('[TableSort] First row classes:', rows[0].className);
                    // Log i valori della colonna che stiamo ordinando
                    const columnValues = rows.map(row => {
                        const cell = row.children[column];
                        return cell ? cell.textContent.trim() : 'NO_CELL';
                    });
                    console.log('[TableSort] Column values before sort:', columnValues);
                }
            }
            
            // Se non ci sono righe, esci
            if (rows.length === 0) {
                console.warn('[TableSort] No rows found to sort');
                return;
            }

            // Determina direzione ordinamento
            if (currentSortColumn === column) {
                currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = column;
                currentSortOrder = 'asc';
            }

            // Aggiungi classe animazione
            header.classList.add('sorting');
            setTimeout(() => header.classList.remove('sorting'), 300);

            // Reset stili altri header
            sortableHeaders.forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });

            // Applica stile header corrente
            header.classList.add(currentSortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');

            // Ordina righe
            rows.sort((rowA, rowB) => {
                const cellA = rowA.children[column];
                const cellB = rowB.children[column];
                
                if (!cellA || !cellB) {
                    if (config.debug) {
                        console.warn('[TableSort] Missing cell at column', column);
                    }
                    return 0;
                }

                let valueA, valueB;

                // Controlla se c'è una funzione di ordinamento custom
                if (config.customSort && typeof config.customSort === 'function') {
                    const customResult = config.customSort(cellA, cellB, column, currentSortOrder);
                    if (customResult !== undefined) {
                        return customResult;
                    }
                }

                // Ordinamento standard
                valueA = getCellValue(cellA);
                valueB = getCellValue(cellB);
                
                if (config.debug) {
                    // Log sempre i primi confronti per debug
                    if (rows.indexOf(rowA) < 2 || rows.indexOf(rowB) < 2) {
                        console.log(`[TableSort] Comparing: "${valueA}" vs "${valueB}"`);
                    }
                }

                // Confronto
                const comparison = compareValues(valueA, valueB);
                return currentSortOrder === 'asc' ? comparison : -comparison;
            });

            // Ricostruisci tbody
            if (config.debug) {
                console.log('[TableSort] Rebuilding tbody with sorted rows');
                // Log i valori dopo l'ordinamento
                const sortedValues = rows.map(row => {
                    const cell = row.children[column];
                    return cell ? cell.textContent.trim() : 'NO_CELL';
                });
                console.log('[TableSort] Column values after sort:', sortedValues);
            }
            
            // Svuota il tbody
            while (tbody.firstChild) {
                tbody.removeChild(tbody.firstChild);
            }
            
            // Aggiungi righe ordinate
            rows.forEach(row => tbody.appendChild(row));
            
            // Preserva eventuali righe non ordinabili (es. no-results)
            const nonSortableRows = Array.from(document.querySelectorAll('tr.no-data-row, tr.no-results-row'));
            nonSortableRows.forEach(row => {
                if (row.parentNode !== tbody) {
                    tbody.appendChild(row);
                }
            });

            // Mantieni filtri di ricerca se configurato
            if (config.maintainSearch) {
                maintainSearchFilter();
            }

            if (config.debug) {
                console.log(`[TableSort] Sorted column ${column} in ${currentSortOrder} order`);
            }
        }

        /**
         * Estrae il valore di una cella per l'ordinamento
         */
        function getCellValue(cell) {
            // Controlla se ha un attributo data-sort
            if (cell.dataset.sort) {
                return cell.dataset.sort;
            }

            const text = cell.textContent.trim();
            
            // Gestione valori vuoti o placeholder
            if (text === '-' || text === '' || text === 'N/D') {
                return 'ZZZZZZ'; // Vai in fondo nell'ordinamento
            }

            // Controlla se è una data (formato DD/MM/YYYY)
            const dateMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (dateMatch) {
                // Converti in formato ISO per ordinamento corretto
                return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
            }

            // Altrimenti usa il testo
            return text.toUpperCase();
        }

        /**
         * Confronta due valori
         */
        function compareValues(a, b) {
            // Gestione valori speciali (devono andare in fondo)
            if (a === 'ZZZZZZ' && b === 'ZZZZZZ') return 0;
            if (a === 'ZZZZZZ') return 1;
            if (b === 'ZZZZZZ') return -1;
            
            // Controlla se entrambi sono anni (4 cifre)
            const yearA = /^\d{4}$/.test(a) ? parseInt(a) : null;
            const yearB = /^\d{4}$/.test(b) ? parseInt(b) : null;
            
            if (yearA && yearB) {
                return yearA - yearB;
            }
            
            // Prova confronto numerico generale
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }

            // Prova confronto date ISO
            const dateA = Date.parse(a);
            const dateB = Date.parse(b);
            
            if (!isNaN(dateA) && !isNaN(dateB)) {
                return dateA - dateB;
            }

            // Confronto stringhe con locale italiano
            return a.localeCompare(b, 'it-IT', {
                numeric: true,
                sensitivity: 'base'
            });
        }

        /**
         * Mantiene i filtri di ricerca attivi dopo l'ordinamento
         */
        function maintainSearchFilter() {
            const searchInput = document.getElementById('searchInput');
            if (!searchInput || !searchInput.value) return;

            const searchTerm = searchInput.value.toUpperCase();
            const rows = tbody.querySelectorAll('tr.clickable-row, tr[data-href]');
            
            rows.forEach(row => {
                const rowText = row.textContent.toUpperCase();
                row.style.display = rowText.includes(searchTerm) ? '' : 'none';
            });
        }

        // Ritorna oggetto con metodi pubblici
        return {
            resort: handleSort,
            reset: function() {
                currentSortColumn = null;
                currentSortOrder = 'asc';
                sortableHeaders.forEach(h => {
                    h.classList.remove('sorted-asc', 'sorted-desc');
                });
            }
        };
    };

    /**
     * Auto-inizializzazione per tabelle con classe .auto-sort
     */
    document.addEventListener('DOMContentLoaded', function() {
        const autoSortTables = document.querySelectorAll('.styled-table.auto-sort');
        autoSortTables.forEach(table => {
            TalonTableSort.init({
                tableSelector: '#' + table.id || '.styled-table'
            });
        });
    });

})(window, document);