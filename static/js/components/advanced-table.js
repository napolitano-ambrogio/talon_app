/* ============================================
   ADVANCED TABLE COMPONENT - JavaScript
   File: static/js/components/advanced-table.js
   
   Tabella avanzata con ordinamento, drag&drop,
   ridimensionamento colonne e paginazione
   ============================================ */

class AdvancedTable {
    constructor(options = {}) {
        this.tableSelector = options.tableSelector || '.advanced-table';
        this.searchInputSelector = options.searchInputSelector || null;
        this.itemsPerPage = options.itemsPerPage || 100;
        this.enableSorting = options.enableSorting !== false;
        this.enableDragDrop = options.enableDragDrop !== false;
        this.enablePagination = options.enablePagination !== false;
        this.enableColumnResize = options.enableColumnResize !== false;
        
        // Selettori personalizzabili per paginazione
        this.topControlsSelector = options.topControlsSelector || '#topPaginationControls';
        this.bottomControlsSelector = options.bottomControlsSelector || '#bottomPaginationControls';
        this.topInfoSelector = options.topInfoSelector || '#topPageInfo';
        this.bottomInfoSelector = options.bottomInfoSelector || '#bottomPageInfo';
        
        this.table = document.querySelector(this.tableSelector);
        if (!this.table) {
            console.warn('AdvancedTable: tabella non trovata con selettore', this.tableSelector);
            return;
        }
        
        this.init();
    }
    
    init() {
        console.log('[AdvancedTable] Inizializzazione...');
        
        if (this.enableColumnResize) {
            this.initColumnResizing();
        }
        
        if (this.enableDragDrop) {
            this.initColumnDragDrop();
        }
        
        if (this.enableSorting) {
            this.initColumnSorting();
        }
        
        if (this.enablePagination) {
            this.initSmartPagination();
        }
        
        console.log('[AdvancedTable] Inizializzazione completata');
    }
    
    // Sistema di ordinamento colonne
    initColumnSorting() {
        this.currentSortColumn = -1;
        this.currentSortDirection = 'none';
        
        const headers = this.table.querySelectorAll('th.sortable');
        
        headers.forEach((header, index) => {
            header.addEventListener('click', (e) => {
                if (e.target.classList.contains('column-resizer')) {
                    return;
                }
                this.sortByColumn(index, header);
            });
        });
    }
    
    sortByColumn(columnIndex, headerElement) {
        const headers = this.table.querySelectorAll('th.sortable');
        
        // Semplice alternanza: crescente ↔ decrescente
        let newDirection = 'asc';
        if (this.currentSortColumn === columnIndex && this.currentSortDirection === 'asc') {
            newDirection = 'desc';
        }
        
        // Rimuovi classi di ordinamento da tutti gli headers
        headers.forEach(h => {
            h.classList.remove('sort-asc', 'sort-desc');
        });
        
        // Applica la classe appropriata
        headerElement.classList.add(`sort-${newDirection}`);
        this.currentSortColumn = columnIndex;
        this.currentSortDirection = newDirection;
        
        // Esegui l'ordinamento
        this.performSort(columnIndex, newDirection, headerElement);
        
        // Aggiorna la paginazione se attiva
        if (this.pagination && typeof this.pagination.refresh === 'function') {
            this.pagination.refresh();
        }
    }
    
    performSort(columnIndex, direction, headerElement) {
        const tbody = this.table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr:not(.no-data-row)'));
        const sortType = headerElement.dataset.sortType || 'text';
        
        rows.sort((a, b) => {
            const cellA = a.children[columnIndex];
            const cellB = b.children[columnIndex];
            
            let valueA, valueB;
            
            if (sortType === 'date') {
                valueA = cellA.dataset.sort || cellA.textContent.trim();
                valueB = cellB.dataset.sort || cellB.textContent.trim();
                
                if (valueA.includes('-')) {
                    valueA = new Date(valueA);
                    valueB = new Date(valueB);
                } else {
                    valueA = this.parseItalianDate(valueA);
                    valueB = this.parseItalianDate(valueB);
                }
            } else {
                valueA = cellA.textContent.trim().toLowerCase();
                valueB = cellB.textContent.trim().toLowerCase();
                
                const numA = parseFloat(valueA);
                const numB = parseFloat(valueB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    valueA = numA;
                    valueB = numB;
                }
            }
            
            if (!valueA && valueB) return 1;
            if (valueA && !valueB) return -1;
            if (!valueA && !valueB) return 0;
            
            let comparison = 0;
            if (valueA < valueB) comparison = -1;
            else if (valueA > valueB) comparison = 1;
            
            return direction === 'asc' ? comparison : -comparison;
        });
        
        rows.forEach(row => tbody.appendChild(row));
    }
    
    parseItalianDate(dateStr) {
        if (!dateStr || dateStr === '') return new Date(0);
        
        const parts = dateStr.split('/');
        if (parts.length !== 3) return new Date(0);
        
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        
        return new Date(year, month, day);
    }
    
    // Sistema di drag&drop colonne
    initColumnDragDrop() {
        const headers = this.table.querySelectorAll('th.sortable');
        let draggedColumn = null;
        let draggedIndex = -1;
        
        headers.forEach((header, index) => {
            header.draggable = true;
            header.style.cursor = 'move';
            
            header.addEventListener('dragstart', (e) => this.handleDragStart(e, header, index, headers));
            header.addEventListener('dragover', (e) => this.handleDragOver(e, header));
            header.addEventListener('dragenter', (e) => this.handleDragEnter(e, header));
            header.addEventListener('dragleave', (e) => this.handleDragLeave(e, header));
            header.addEventListener('drop', (e) => this.handleDrop(e, header, headers));
            header.addEventListener('dragend', (e) => this.handleDragEnd(e, headers));
        });
        
        this.draggedColumn = null;
        this.draggedIndex = -1;
    }
    
    handleDragStart(e, header, index, headers) {
        if (e.target.classList.contains('column-resizer')) {
            e.preventDefault();
            return false;
        }
        
        this.draggedColumn = header;
        this.draggedIndex = index;
        
        header.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', header.outerHTML);
    }
    
    handleDragOver(e, header) {
        if (e.preventDefault) e.preventDefault();
        
        if (header !== this.draggedColumn) {
            this.updateDropIndicator(e, header);
        }
        
        e.dataTransfer.dropEffect = 'move';
        return false;
    }
    
    handleDragEnter(e, header) {
        if (header !== this.draggedColumn) {
            header.classList.add('drag-over');
        }
    }
    
    handleDragLeave(e, header) {
        if (!header.contains(e.relatedTarget)) {
            header.classList.remove('drag-over');
            this.removeDropIndicators(header);
        }
    }
    
    updateDropIndicator(e, targetHeader) {
        this.removeDropIndicators(targetHeader);
        
        const rect = targetHeader.getBoundingClientRect();
        const mouseX = e.clientX;
        
        const leftZone = rect.left + 10;
        const rightZone = rect.right - 10;
        
        let isLeftSide;
        if (mouseX <= leftZone) {
            isLeftSide = true;
        } else if (mouseX >= rightZone) {
            isLeftSide = false;
        } else {
            return;
        }
        
        const indicator = document.createElement('div');
        indicator.className = isLeftSide ? 'drop-indicator-left' : 'drop-indicator-right';
        targetHeader.appendChild(indicator);
        
        targetHeader.dataset.dropSide = isLeftSide ? 'left' : 'right';
        
        // Debug: conferma creazione indicatore
        console.log(`[AdvancedTable] Creato indicatore ${isLeftSide ? 'sinistro' : 'destro'} su colonna:`, targetHeader.textContent.trim());
    }
    
    removeDropIndicators(header) {
        const leftIndicator = header.querySelector('.drop-indicator-left');
        const rightIndicator = header.querySelector('.drop-indicator-right');
        if (leftIndicator) leftIndicator.remove();
        if (rightIndicator) rightIndicator.remove();
        delete header.dataset.dropSide;
    }
    
    handleDrop(e, header, headers) {
        if (e.stopPropagation) e.stopPropagation();
        
        if (this.draggedColumn !== header) {
            const dropIndex = Array.from(headers).indexOf(header);
            const dropSide = header.dataset.dropSide;
            
            let newPosition;
            
            if (dropSide === 'left') {
                newPosition = dropIndex;
            } else {
                newPosition = dropIndex + 1;
            }
            
            if (newPosition === this.draggedIndex || newPosition === this.draggedIndex + 1) {
                return false;
            }
            
            this.moveColumnToPosition(this.draggedIndex, newPosition);
        }
        
        return false;
    }
    
    handleDragEnd(e, headers) {
        headers.forEach(header => {
            header.classList.remove('dragging', 'drag-over');
            
            header.style.removeProperty('opacity');
            header.style.removeProperty('transform');
            header.style.removeProperty('background-color');
            header.style.removeProperty('box-shadow');
            header.style.removeProperty('z-index');
            header.style.removeProperty('cursor');
            
            this.removeDropIndicators(header);
        });
        
        this.draggedColumn = null;
        this.draggedIndex = -1;
    }
    
    moveColumnToPosition(fromIndex, toPosition) {
        const headerRow = this.table.querySelector('thead tr');
        const bodyRows = this.table.querySelectorAll('tbody tr');
        
        const headerToMove = headerRow.children[fromIndex];
        headerToMove.remove();
        
        if (toPosition >= headerRow.children.length) {
            headerRow.appendChild(headerToMove);
        } else {
            const referenceHeader = headerRow.children[toPosition];
            headerRow.insertBefore(headerToMove, referenceHeader);
        }
        
        bodyRows.forEach(row => {
            if (row.children.length > fromIndex) {
                const cellToMove = row.children[fromIndex];
                cellToMove.remove();
                
                if (toPosition >= row.children.length) {
                    row.appendChild(cellToMove);
                } else {
                    const referenceCell = row.children[toPosition];
                    row.insertBefore(cellToMove, referenceCell);
                }
            }
        });
        
        this.reinitializeDragDrop();
    }
    
    reinitializeDragDrop() {
        const oldHeaders = this.table.querySelectorAll('th.sortable');
        oldHeaders.forEach(header => {
            header.classList.remove('dragging', 'drag-over');
            header.style.removeProperty('opacity');
            header.style.removeProperty('transform');
            header.style.removeProperty('background-color');
            header.style.removeProperty('box-shadow');
            header.style.removeProperty('z-index');
            header.style.removeProperty('cursor');
            
            const indicators = header.querySelectorAll('.drop-indicator-left, .drop-indicator-right');
            indicators.forEach(indicator => indicator.remove());
            
            delete header.dataset.dropSide;
            
            const newHeader = header.cloneNode(true);
            newHeader.classList.remove('dragging', 'drag-over');
            newHeader.style.cssText = '';
            delete newHeader.dataset.dropSide;
            
            header.parentNode.replaceChild(newHeader, header);
        });
        
        setTimeout(() => {
            this.initColumnDragDrop();
            this.initColumnSorting();
            if (this.enableColumnResize) {
                this.initColumnResizing();
            }
        }, 50);
    }
    
    // Sistema di ridimensionamento colonne
    initColumnResizing() {
        const headers = this.table.querySelectorAll('thead th');
        
        headers.forEach((header, index) => {
            if (index === headers.length - 1) return;
            
            const resizer = document.createElement('div');
            resizer.className = 'column-resizer';
            resizer.style.cssText = `
                position: absolute;
                top: 0;
                right: -2px;
                width: 4px;
                height: 100%;
                background: transparent;
                cursor: col-resize;
                z-index: 20;
                border-radius: 2px;
                transition: background-color 0.2s ease;
            `;
            
            header.style.position = 'relative';
            header.appendChild(resizer);
            
            this.setupColumnResizer(resizer, header, index);
        });
    }
    
    setupColumnResizer(resizer, header, index) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            startX = e.pageX;
            startWidth = parseInt(getComputedStyle(header).width, 10);
            
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
            
            this.table.style.pointerEvents = 'none';
        });
        
        const doResize = (e) => {
            if (!isResizing) return;
            
            const diff = e.pageX - startX;
            const newWidth = Math.max(80, startWidth + diff);
            
            requestAnimationFrame(() => {
                header.style.width = newWidth + 'px';
                
                const cells = this.table.querySelectorAll(`tbody tr td:nth-child(${index + 1})`);
                cells.forEach(cell => {
                    cell.style.width = newWidth + 'px';
                });
            });
        };
        
        const stopResize = () => {
            if (!isResizing) return;
            
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            this.table.style.pointerEvents = '';
            
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
        };
        
        resizer.addEventListener('mouseenter', () => {
            resizer.style.backgroundColor = '#4a90e2';
            resizer.style.boxShadow = '0 0 3px rgba(74, 144, 226, 0.5)';
        });
        
        resizer.addEventListener('mouseleave', () => {
            resizer.style.backgroundColor = 'transparent';
            resizer.style.boxShadow = 'none';
        });
    }
    
    // Sistema di paginazione smart
    initSmartPagination() {
        this.currentPage = 1;
        this.totalItems = 0;
        this.filteredItems = [];
        this.allItems = [];
        
        const tbody = this.table.querySelector('tbody');
        const searchInput = this.searchInputSelector ? document.querySelector(this.searchInputSelector) : null;
        
        this.pagination = {
            collectAllItems: () => {
                this.allItems = Array.from(tbody.querySelectorAll('tr:not(.no-data-row)'));
                this.filteredItems = [...this.allItems];
                this.totalItems = this.filteredItems.length;
            },
            
            renderPage: () => {
                const startIndex = (this.currentPage - 1) * this.itemsPerPage;
                const endIndex = Math.min(startIndex + this.itemsPerPage, this.filteredItems.length);
                
                this.allItems.forEach(row => {
                    row.style.display = 'none';
                });
                
                for (let i = startIndex; i < endIndex; i++) {
                    if (this.filteredItems[i]) {
                        this.filteredItems[i].style.display = '';
                    }
                }
                
                const noDataRow = tbody.querySelector('.no-data-row');
                if (this.filteredItems.length === 0) {
                    if (!noDataRow) {
                        const row = document.createElement('tr');
                        row.className = 'no-data-row';
                        const colSpan = this.table.querySelectorAll('thead th').length;
                        row.innerHTML = `<td colspan="${colSpan}" style="text-align: center;">Nessun risultato trovato.</td>`;
                        tbody.appendChild(row);
                    }
                } else if (noDataRow) {
                    noDataRow.remove();
                }
                
                this.updatePaginationInfo();
                this.renderPaginationControls();
            },
            
            refresh: () => {
                this.pagination.collectAllItems();
                this.pagination.renderPage();
            }
        };
        
        this.pagination.collectAllItems();
        this.pagination.renderPage();
        
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.filterItems(searchInput.value);
            });
        }
    }
    
    updatePaginationInfo() {
        const totalPages = Math.ceil(this.filteredItems.length / this.itemsPerPage);
        const startItem = this.filteredItems.length === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredItems.length);
        
        const infoText = `Pagina ${this.currentPage} di ${totalPages} (${startItem}-${endItem} di ${this.filteredItems.length} elementi)`;
        
        const topInfo = document.querySelector(this.topInfoSelector);
        const bottomInfo = document.querySelector(this.bottomInfoSelector);
        if (topInfo) topInfo.textContent = infoText;
        if (bottomInfo) bottomInfo.textContent = infoText;
    }
    
    renderPaginationControls() {
        const totalPages = Math.ceil(this.filteredItems.length / this.itemsPerPage);
        const topControls = document.querySelector(this.topControlsSelector);
        const bottomControls = document.querySelector(this.bottomControlsSelector);
        
        if (totalPages <= 1) {
            if (topControls) topControls.innerHTML = '';
            if (bottomControls) bottomControls.innerHTML = '';
            return;
        }
        
        const controlsHtml = this.generatePaginationHTML(totalPages);
        if (topControls) topControls.innerHTML = controlsHtml;
        if (bottomControls) bottomControls.innerHTML = controlsHtml;
        
        [topControls, bottomControls].forEach(container => {
            if (container) {
                container.querySelectorAll('.pagination-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const page = parseInt(btn.dataset.page);
                        if (page && page !== this.currentPage) {
                            this.goToPage(page);
                        }
                    });
                });
            }
        });
    }
    
    generatePaginationHTML(totalPages) {
        let html = '';
        
        html += `<button class="pagination-btn" data-page="${this.currentPage - 1}" ${this.currentPage === 1 ? 'disabled' : ''}>← Prec</button>`;
        
        const showPages = this.getVisiblePages(this.currentPage, totalPages);
        
        showPages.forEach((page, index) => {
            if (page === '...') {
                html += '<span class="pagination-ellipsis">...</span>';
            } else {
                const isActive = page === this.currentPage;
                html += `<button class="pagination-btn ${isActive ? 'active' : ''}" data-page="${page}">${page}</button>`;
            }
        });
        
        html += `<button class="pagination-btn" data-page="${this.currentPage + 1}" ${this.currentPage === totalPages ? 'disabled' : ''}>Succ →</button>`;
        
        return html;
    }
    
    getVisiblePages(current, total) {
        if (total <= 7) {
            return Array.from({length: total}, (_, i) => i + 1);
        }
        
        const pages = [];
        
        if (current <= 4) {
            for (let i = 1; i <= 5; i++) pages.push(i);
            pages.push('...');
            pages.push(total);
        } else if (current >= total - 3) {
            pages.push(1);
            pages.push('...');
            for (let i = total - 4; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            pages.push('...');
            for (let i = current - 1; i <= current + 1; i++) pages.push(i);
            pages.push('...');
            pages.push(total);
        }
        
        return pages;
    }
    
    goToPage(page) {
        const totalPages = Math.ceil(this.filteredItems.length / this.itemsPerPage);
        if (page < 1 || page > totalPages) return;
        
        this.currentPage = page;
        this.pagination.renderPage();
    }
    
    filterItems(searchTerm) {
        searchTerm = searchTerm.toLowerCase();
        
        if (!searchTerm) {
            this.filteredItems = [...this.allItems];
        } else {
            this.filteredItems = this.allItems.filter(row => {
                const text = row.textContent.toLowerCase();
                return text.includes(searchTerm);
            });
        }
        
        this.currentPage = 1;
        this.pagination.renderPage();
    }
}

// Export per uso in altri moduli
window.AdvancedTable = AdvancedTable;