/**
 * ========================================
 * TALON - SEARCHABLE SELECT COMPONENT
 * File: static/js/searchable_select.js
 * 
 * Componente per select con ricerca integrata
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Namespace globale
    window.TALON_API = window.TALON_API || {};

    /**
     * Classe SearchableSelect
     */
    class SearchableSelect {
        constructor(element) {
            this.container = element;
            this.selectId = element.dataset.selectId;
            this.select = document.getElementById(this.selectId);
            
            if (!this.select) {
                console.error(`[SearchableSelect] Select con ID '${this.selectId}' non trovato`);
                return;
            }

            this.options = [];
            this.filteredOptions = [];
            this.selectedIndex = -1;
            this.isOpen = false;
            
            this.init();
        }

        init() {
            // Raccogli le opzioni dal select originale
            this.collectOptions();
            
            // Crea la struttura HTML
            this.render();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Imposta valore iniziale se presente
            if (this.select.value) {
                this.setValue(this.select.value);
            }
        }

        collectOptions() {
            this.options = [];
            const selectOptions = this.select.querySelectorAll('option');
            
            selectOptions.forEach((option, index) => {
                if (option.value === '' && option.disabled) {
                    // Placeholder option
                    this.placeholder = option.textContent;
                } else {
                    const optgroup = option.closest('optgroup');
                    this.options.push({
                        value: option.value,
                        text: option.textContent.trim(),
                        group: optgroup ? optgroup.label : null,
                        element: option,
                        index: index,
                        // Dati aggiuntivi per la ricerca
                        searchText: this.buildSearchText(option)
                    });
                }
            });
            
            this.filteredOptions = [...this.options];
        }

        buildSearchText(option) {
            // Costruisce il testo di ricerca includendo tutti i data attributes
            let searchParts = [option.textContent.trim()];
            
            // Aggiungi tutti i data attributes al testo di ricerca
            const dataAttrs = ['codice', 'indirizzo', 'citta', 'provincia', 'cap', 'tipo', 'details'];
            dataAttrs.forEach(attr => {
                const value = option.dataset[attr];
                if (value) {
                    searchParts.push(value);
                }
            });
            
            return searchParts.join(' ').toLowerCase();
        }

        render() {
            // Crea wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'searchable-select-wrapper';
            
            // Input di ricerca
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'searchable-select-input form-control';
            input.placeholder = this.placeholder || 'Cerca o seleziona...';
            input.setAttribute('autocomplete', 'off');
            
            // Dropdown
            const dropdown = document.createElement('div');
            dropdown.className = 'searchable-select-dropdown';
            dropdown.style.display = 'none';
            
            // Lista opzioni
            const optionsList = document.createElement('div');
            optionsList.className = 'searchable-select-options';
            
            // Aggiungi elementi al DOM
            wrapper.appendChild(input);
            wrapper.appendChild(dropdown);
            dropdown.appendChild(optionsList);
            
            // Sostituisci il container
            this.container.innerHTML = '';
            this.container.appendChild(wrapper);
            
            // Salva riferimenti
            this.input = input;
            this.dropdown = dropdown;
            this.optionsList = optionsList;
            this.wrapper = wrapper;
        }

        setupEventListeners() {
            // Focus input
            this.input.addEventListener('focus', () => {
                this.open();
            });
            
            // Input change
            this.input.addEventListener('input', (e) => {
                this.filter(e.target.value);
            });
            
            // Keyboard navigation
            this.input.addEventListener('keydown', (e) => {
                this.handleKeyboard(e);
            });
            
            // Click outside
            document.addEventListener('click', (e) => {
                if (!this.wrapper.contains(e.target)) {
                    this.close();
                }
            });
            
            // Prevent form submit on enter
            this.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                }
            });
        }

        open() {
            if (this.isOpen) return;
            
            this.isOpen = true;
            this.dropdown.style.display = 'block';
            this.renderOptions();
            
            // Posiziona il dropdown
            this.positionDropdown();
        }

        close() {
            if (!this.isOpen) return;
            
            this.isOpen = false;
            this.dropdown.style.display = 'none';
            this.selectedIndex = -1;
        }

        positionDropdown() {
            const rect = this.input.getBoundingClientRect();
            const dropdownHeight = this.dropdown.offsetHeight;
            const spaceBelow = window.innerHeight - rect.bottom;
            
            // Se non c'è spazio sotto, mostra sopra
            if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
                this.dropdown.style.bottom = '100%';
                this.dropdown.style.top = 'auto';
                this.dropdown.style.marginBottom = '5px';
                this.dropdown.style.marginTop = '0';
            } else {
                this.dropdown.style.top = '100%';
                this.dropdown.style.bottom = 'auto';
                this.dropdown.style.marginTop = '5px';
                this.dropdown.style.marginBottom = '0';
            }
        }

        filter(query) {
            const normalizedQuery = query.toLowerCase().trim();
            
            if (!normalizedQuery) {
                this.filteredOptions = [...this.options];
            } else {
                // Filtra le opzioni
                this.filteredOptions = this.options.filter(option => {
                    return option.searchText.includes(normalizedQuery);
                });
            }
            
            this.renderOptions();
        }

        renderOptions() {
            this.optionsList.innerHTML = '';
            
            if (this.filteredOptions.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'searchable-select-no-results';
                noResults.textContent = 'Nessun risultato trovato';
                this.optionsList.appendChild(noResults);
                return;
            }
            
            let currentGroup = null;
            
            this.filteredOptions.forEach((option, index) => {
                // Aggiungi header del gruppo se necessario
                if (option.group && option.group !== currentGroup) {
                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'searchable-select-group';
                    groupHeader.textContent = option.group;
                    this.optionsList.appendChild(groupHeader);
                    currentGroup = option.group;
                }
                
                // Crea elemento opzione
                const optionEl = document.createElement('div');
                optionEl.className = 'searchable-select-option';
                if (index === this.selectedIndex) {
                    optionEl.classList.add('selected');
                }
                
                // Testo principale
                const mainText = document.createElement('div');
                mainText.className = 'option-main-text';
                mainText.textContent = option.text;
                optionEl.appendChild(mainText);
                
                // Dettagli aggiuntivi se presenti
                const details = option.element.dataset.details;
                if (details) {
                    const detailsEl = document.createElement('div');
                    detailsEl.className = 'option-details';
                    detailsEl.textContent = details;
                    optionEl.appendChild(detailsEl);
                }
                
                // Click handler
                optionEl.addEventListener('click', () => {
                    this.selectOption(option);
                });
                
                // Hover handler
                optionEl.addEventListener('mouseenter', () => {
                    this.selectedIndex = index;
                    this.updateSelectedClass();
                });
                
                this.optionsList.appendChild(optionEl);
            });
        }

        selectOption(option) {
            // Imposta il valore nel select originale
            this.select.value = option.value;
            
            // Imposta il testo nell'input
            this.input.value = option.text;
            
            // Trigger change event sul select originale
            const event = new Event('change', { bubbles: true });
            this.select.dispatchEvent(event);
            
            // Chiudi il dropdown
            this.close();
        }

        handleKeyboard(e) {
            if (!this.isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                this.open();
                return;
            }
            
            if (!this.isOpen) return;
            
            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredOptions.length - 1);
                    this.updateSelectedClass();
                    this.scrollToSelected();
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                    this.updateSelectedClass();
                    this.scrollToSelected();
                    break;
                    
                case 'Enter':
                    e.preventDefault();
                    if (this.selectedIndex >= 0 && this.filteredOptions[this.selectedIndex]) {
                        this.selectOption(this.filteredOptions[this.selectedIndex]);
                    }
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    this.input.blur();
                    break;
            }
        }

        updateSelectedClass() {
            const options = this.optionsList.querySelectorAll('.searchable-select-option');
            options.forEach((el, index) => {
                if (index === this.selectedIndex) {
                    el.classList.add('selected');
                } else {
                    el.classList.remove('selected');
                }
            });
        }

        scrollToSelected() {
            const options = this.optionsList.querySelectorAll('.searchable-select-option');
            if (options[this.selectedIndex]) {
                options[this.selectedIndex].scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
            }
        }

        setValue(value) {
            const option = this.options.find(opt => opt.value === value);
            if (option) {
                this.input.value = option.text;
                this.select.value = value;
            }
        }

        getValue() {
            return this.select.value;
        }

        reset() {
            this.select.value = '';
            this.input.value = '';
            this.filteredOptions = [...this.options];
            this.selectedIndex = -1;
        }

        destroy() {
            // Rimuovi event listeners
            document.removeEventListener('click', this.handleClickOutside);
            
            // Ripristina il select originale
            this.select.style.display = '';
            
            // Rimuovi il wrapper
            this.container.innerHTML = '';
        }
    }

    /**
     * Inizializza tutti i searchable selects nella pagina
     */
    function initializeSearchableSelects() {
        const elements = document.querySelectorAll('.searchable-select[data-select-id]');
        const instances = [];
        
        elements.forEach(element => {
            const instance = new SearchableSelect(element);
            instances.push(instance);
        });
        
        console.log(`[SearchableSelect] Inizializzati ${instances.length} select`);
        return instances;
    }

    /**
     * Refresh searchable selects (utile dopo modifiche DOM)
     */
    function refreshSearchableSelects() {
        const elements = document.querySelectorAll('.searchable-select[data-select-id]');
        
        elements.forEach(element => {
            // Controlla se già inizializzato
            if (!element.querySelector('.searchable-select-wrapper')) {
                new SearchableSelect(element);
            }
        });
    }

    // Esporta API pubblica
    window.TALON_API.SearchableSelect = SearchableSelect;
    window.TALON_API.initializeSearchableSelects = initializeSearchableSelects;
    window.TALON_API.refreshSearchableSelects = refreshSearchableSelects;

    // Auto-inizializzazione al caricamento del DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSearchableSelects);
    } else {
        // DOM già pronto
        setTimeout(initializeSearchableSelects, 0);
    }

    console.log('[SearchableSelect] Modulo caricato');

})(window, document);