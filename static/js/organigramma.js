/**
 * ========================================
 * TALON ORGANIGRAMMA MODULE
 * File: static/js/organigramma.js
 * 
 * Gestione funzionalità specifiche per l'organigramma
 * ========================================
 */

(function() {
    'use strict';

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    document.addEventListener('DOMContentLoaded', function() {
        initializeOrganigramma();
    });

    function initializeOrganigramma() {
        // Gestione toggle visualizzazione
        initializeViewToggle();
        
        // Gestione espansione/collasso albero
        initializeTreeToggle();
        
        // Gestione ricerca
        initializeSearch();
        
        // Inizializza stato albero
        initializeTreeState();
    }

    // ========================================
    // TOGGLE VISUALIZZAZIONE
    // ========================================
    
    function initializeViewToggle() {
        const toggleCheckbox = document.getElementById('view-toggle-checkbox');
        
        if (!toggleCheckbox) {
            console.log('[Organigramma] Toggle checkbox non trovato');
            return;
        }
        
        console.log('[Organigramma] Inizializzazione toggle view');
        
        toggleCheckbox.addEventListener('change', function() {
            console.log('[Organigramma] Toggle changed:', this.checked);
            
            // Approccio semplificato: lavora direttamente con l'URL corrente
            const currentUrl = new URL(window.location.href);
            
            if (this.checked) {
                // Aggiungi view=all
                currentUrl.searchParams.set('view', 'all');
            } else {
                // Rimuovi view parameter
                currentUrl.searchParams.delete('view');
            }
            
            console.log('[Organigramma] Redirecting to:', currentUrl.href);
            
            // Redirect alla nuova URL
            window.location.href = currentUrl.href;
        });
        
        // Log stato iniziale
        console.log('[Organigramma] Toggle inizializzato. Stato:', toggleCheckbox.checked);
    }

    // ========================================
    // GESTIONE ALBERO
    // ========================================
    
    function initializeTreeToggle() {
        // Seleziona tutti i toggle button nell'albero
        const toggleButtons = document.querySelectorAll('.tree .toggle-btn');
        
        toggleButtons.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                
                const listItem = this.closest('li');
                if (!listItem) return;
                
                // Toggle classe expanded
                listItem.classList.toggle('expanded');
                
                // Salva stato in sessionStorage
                saveTreeState();
            });
        });
    }

    // ========================================
    // GESTIONE RICERCA
    // ========================================
    
    function initializeSearch() {
        const searchInput = document.getElementById('organigrammaSearchInput');
        const noResultsMessage = document.getElementById('no-results-message');
        
        if (!searchInput) return;
        
        // Debounce per performance
        let searchTimeout;
        
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            
            searchTimeout = setTimeout(() => {
                performSearch(this.value);
            }, 300);
        });
        
        // Funzione di ricerca
        function performSearch(searchTerm) {
            const normalizedSearch = searchTerm.toUpperCase().trim();
            const treeItems = document.querySelectorAll('.tree li');
            let hasResults = false;
            
            if (!normalizedSearch) {
                // Reset visualizzazione se ricerca vuota
                treeItems.forEach(item => {
                    item.style.display = '';
                    item.classList.remove('search-highlighted');
                });
                
                if (noResultsMessage) {
                    noResultsMessage.style.display = 'none';
                }
                
                // Ripristina stato albero salvato
                restoreTreeState();
                return;
            }
            
            // Nascondi tutti gli elementi
            treeItems.forEach(item => {
                item.style.display = 'none';
                item.classList.remove('search-highlighted');
            });
            
            // Mostra solo elementi che corrispondono
            treeItems.forEach(item => {
                const enteName = item.querySelector('.ente-name');
                if (!enteName) return;
                
                const text = enteName.textContent.toUpperCase();
                
                if (text.includes(normalizedSearch)) {
                    // Mostra elemento
                    item.style.display = '';
                    item.classList.add('search-highlighted');
                    hasResults = true;
                    
                    // Espandi e mostra tutti i parent
                    let parent = item.parentElement.closest('li');
                    while (parent) {
                        parent.style.display = '';
                        parent.classList.add('expanded');
                        parent = parent.parentElement.closest('li');
                    }
                    
                    // Mostra tutti i figli
                    const children = item.querySelectorAll('li');
                    children.forEach(child => {
                        child.style.display = '';
                    });
                }
            });
            
            // Gestione messaggio "nessun risultato"
            if (noResultsMessage) {
                noResultsMessage.style.display = hasResults ? 'none' : 'block';
            }
        }
    }

    // ========================================
    // GESTIONE STATO ALBERO
    // ========================================
    
    function initializeTreeState() {
        // Espandi primo livello per default (se non c'è stato salvato)
        const savedState = sessionStorage.getItem('organigrammaTreeState');
        
        if (!savedState) {
            // Espandi solo il primo livello
            const rootItems = document.querySelectorAll('.tree > li');
            rootItems.forEach(item => {
                if (item.querySelector('.toggle-btn')) {
                    item.classList.add('expanded');
                }
            });
        } else {
            restoreTreeState();
        }
    }
    
    function saveTreeState() {
        const expandedItems = [];
        const allItems = document.querySelectorAll('.tree li');
        
        allItems.forEach((item, index) => {
            if (item.classList.contains('expanded')) {
                expandedItems.push(index);
            }
        });
        
        sessionStorage.setItem('organigrammaTreeState', JSON.stringify(expandedItems));
    }
    
    function restoreTreeState() {
        const savedState = sessionStorage.getItem('organigrammaTreeState');
        if (!savedState) return;
        
        try {
            const expandedItems = JSON.parse(savedState);
            const allItems = document.querySelectorAll('.tree li');
            
            allItems.forEach((item, index) => {
                if (expandedItems.includes(index)) {
                    item.classList.add('expanded');
                } else {
                    item.classList.remove('expanded');
                }
            });
        } catch (e) {
            console.error('[Organigramma] Errore ripristino stato albero:', e);
        }
    }

    // ========================================
    // FUNZIONI UTILITY
    // ========================================
    
    function expandAll() {
        const allItems = document.querySelectorAll('.tree li');
        allItems.forEach(item => {
            if (item.querySelector('.toggle-btn')) {
                item.classList.add('expanded');
            }
        });
        saveTreeState();
    }
    
    function collapseAll() {
        const allItems = document.querySelectorAll('.tree li');
        allItems.forEach(item => {
            item.classList.remove('expanded');
        });
        saveTreeState();
    }
    
    // ========================================
    // API PUBBLICA
    // ========================================
    
    window.organigrammaAPI = {
        expandAll: expandAll,
        collapseAll: collapseAll,
        search: function(term) {
            const searchInput = document.getElementById('organigrammaSearchInput');
            if (searchInput) {
                searchInput.value = term;
                searchInput.dispatchEvent(new Event('input'));
            }
        },
        resetSearch: function() {
            const searchInput = document.getElementById('organigrammaSearchInput');
            if (searchInput) {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
            }
        }
    };

})();