// lista_attivita.js

document.addEventListener('DOMContentLoaded', function() {
    // Gestione righe cliccabili
    const clickableRows = document.querySelectorAll('.clickable-row');
    clickableRows.forEach(row => {
        row.addEventListener('click', function() {
            const href = this.dataset.href;
            if (href) {
                window.location.href = href;
            }
        });
    });

    // Gestione ricerca
    const searchInput = document.getElementById('searchInput');
    const tableBody = document.getElementById('attivitaTableBody');
    const allRows = tableBody ? tableBody.querySelectorAll('tr.clickable-row') : [];
    const noResultsRow = document.getElementById('no-results-row');

    if (searchInput && allRows.length > 0) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toUpperCase();
            let visibleRows = 0;

            allRows.forEach(row => {
                const rowText = row.textContent.toUpperCase();
                if (rowText.includes(searchTerm)) {
                    row.style.display = '';
                    visibleRows++;
                } else {
                    row.style.display = 'none';
                }
            });

            if (noResultsRow) {
                noResultsRow.style.display = (visibleRows === 0 && allRows.length > 0) ? 'table-row' : 'none';
            }
        });
    }

    // Gestione ordinamento colonne
    const sortableHeaders = document.querySelectorAll('.styled-table th.sortable');
    
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const column = parseInt(this.dataset.column);
            const isAsc = this.classList.contains('sorted-asc');
            const order = isAsc ? 'desc' : 'asc';
            const tbody = document.getElementById('attivitaTableBody');
            
            if (!tbody) return;
            
            const rows = Array.from(tbody.querySelectorAll('tr.clickable-row'));
            
            if (rows.length === 0) return;

            // Rimuovi classi di ordinamento da tutti gli header
            sortableHeaders.forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
                const arrow = h.querySelector('[data-arrow]');
                if (arrow) {
                    arrow.textContent = '▲▼';
                }
            });

            // Aggiungi classe di ordinamento all'header corrente
            this.classList.add(order === 'asc' ? 'sorted-asc' : 'sorted-desc');
            const currentArrow = this.querySelector('[data-arrow]');
            if (currentArrow) {
                currentArrow.textContent = order === 'asc' ? '▲' : '▼';
            }

            // Ordina le righe
            rows.sort((a, b) => {
                const cellA = a.children[column];
                const cellB = b.children[column];
                
                if (!cellA || !cellB) return 0;
                
                let textA = cellA.textContent.trim();
                let textB = cellB.textContent.trim();
                
                // Gestione speciale per le date (formato GG/MM/AAAA)
                if (column === 0) { // Colonna data
                    const dateA = parseDate(textA);
                    const dateB = parseDate(textB);
                    
                    if (dateA && dateB) {
                        return order === 'asc' ? dateA - dateB : dateB - dateA;
                    }
                }
                
                // Ordinamento normale per testo
                textA = textA.toUpperCase();
                textB = textB.toUpperCase();
                
                if (order === 'asc') {
                    return textA.localeCompare(textB);
                } else {
                    return textB.localeCompare(textA);
                }
            });

            // Riappendi le righe ordinate al tbody
            rows.forEach(row => tbody.appendChild(row));
            
            // Assicurati che la riga "no results" sia sempre alla fine
            if (noResultsRow && noResultsRow.parentNode === tbody) {
                tbody.appendChild(noResultsRow);
            }
        });
    });

    // Funzione helper per parsare date in formato GG/MM/AAAA
    function parseDate(dateStr) {
        if (!dateStr) return null;
        
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // I mesi in JS partono da 0
        const year = parseInt(parts[2], 10);
        
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        
        return new Date(year, month, day);
    }
});