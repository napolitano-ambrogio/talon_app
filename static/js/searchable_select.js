/**
 * ========================================
 * TALON SEARCHABLE SELECT COMPONENT - SPA VERSION
 * File: static/js/searchable_select.js
 * 
 * Versione: 2.0.0 - Full SPA Integration
 * Descrizione: Componente select con ricerca avanzata,
 *              completamente ottimizzato per SPA
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        // Search settings
        SEARCH: {
            MIN_CHARS: 0,
            DEBOUNCE_DELAY: 200,
            HIGHLIGHT_MATCHES: true,
            CASE_SENSITIVE: false,
            FUZZY_SEARCH: false,
            MAX_RESULTS: 100
        },
        
        // UI settings
        UI: {
            ANIMATION_DURATION: 200,
            DROPDOWN_MAX_HEIGHT: 400,
            SHOW_GROUPS: true,
            SHOW_DETAILS: true,
            SHOW_ICONS: true,
            SHOW_BADGES: true,
            PLACEHOLDER: 'Cerca o seleziona...',
            NO_RESULTS_TEXT: 'Nessun risultato trovato',
            LOADING_TEXT: 'Caricamento...'
        },
        
        // Behavior
        BEHAVIOR: {
            CLOSE_ON_SELECT: true,
            CLEAR_SEARCH_ON_SELECT: true,
            AUTO_FOCUS_SEARCH: true,
            KEYBOARD_NAVIGATION: true,
            MULTIPLE_SELECTION: false,
            AJAX_LOADING: false
        },
        
        // SPA settings
        SPA: {
            AUTO_REINIT: true,
            PERSIST_STATE: true,
            CLEANUP_ON_NAVIGATION: true,
            DEBUG: false
        },
        
        // CSS classes
        CLASSES: {
            CONTAINER: 'searchable-select',
            DISPLAY: 'searchable-select-display',
            DROPDOWN: 'searchable-select-dropdown',
            SEARCH: 'searchable-select-search',
            OPTIONS: 'searchable-select-options',
            OPTION: 'searchable-select-option',
            GROUP: 'searchable-select-group',
            SELECTED: 'selected',
            HIGHLIGHTED: 'highlighted',
            DISABLED: 'disabled',
            LOADING: 'loading',
            OPEN: 'open',
            MULTIPLE: 'multiple'
        }
    };

    // ========================================
    // SEARCHABLE SELECT CLASS
    // ========================================
    
    class SearchableSelect {
        constructor(element, options = {}) {
            this.element = element;
            this.config = { ...CONFIG, ...options };
            
            // Find select element
            this.selectId = element.dataset.selectId || element.getAttribute('data-select-id');
            this.select = document.getElementById(this.selectId);
            
            if (!this.select) {
                this.log('error', `Select element with id '${this.selectId}' not found`);
                return;
            }
            
            // State
            this.state = {
                initialized: false,
                isOpen: false,
                searchTerm: '',
                highlightedIndex: -1,
                selectedValues: new Set(),
                filteredOptions: [],
                ajaxLoading: false
            };
            
            // Elements
            this.elements = {};
            
            // Data
            this.options = [];
            this.groups = new Map();
            
            // Timers
            this.searchTimeout = null;
            this.animationTimeout = null;
            
            // Event handlers storage
            this.eventHandlers = new Map();
            
            // Bound methods
            this.handleDocumentClick = this.handleDocumentClick.bind(this);
            this.handleSelectChange = this.handleSelectChange.bind(this);
            this.handleSPACleanup = this.handleSPACleanup.bind(this);
            this.handleSPANavigation = this.handleSPANavigation.bind(this);
            
            // Initialize
            this.init();
        }

        // ========================================
        // INITIALIZATION
        // ========================================
        
        init() {
            if (this.state.initialized) {
                this.log('warn', 'Already initialized');
                return;
            }
            
            this.log('debug', 'Initializing SearchableSelect...');
            
            try {
                // Hide original select
                this.select.style.display = 'none';
                
                // Create UI elements
                this.createElements();
                
                // Collect options from select
                this.collectOptions();
                
                // Setup event handlers
                this.setupEventHandlers();
                
                // Setup SPA integration
                this.setupSPAIntegration();
                
                // Set initial value
                this.syncWithSelect();
                
                // Load saved state if persisting
                if (this.config.SPA.PERSIST_STATE) {
                    this.loadState();
                }
                
                this.state.initialized = true;
                this.log('success', '✅ SearchableSelect initialized');
                
                // Emit event
                this.emit('searchable-select:ready');
                
            } catch (error) {
                this.log('error', 'Initialization failed:', error);
            }
        }

        createElements() {
            // Clear container
            this.element.innerHTML = '';
            
            // Create wrapper
            this.elements.wrapper = document.createElement('div');
            this.elements.wrapper.className = this.config.CLASSES.CONTAINER + '-wrapper';
            
            // Create display element
            this.elements.display = document.createElement('div');
            this.elements.display.className = this.config.CLASSES.DISPLAY;
            this.elements.display.setAttribute('tabindex', '0');
            this.elements.display.setAttribute('role', 'combobox');
            this.elements.display.setAttribute('aria-expanded', 'false');
            this.elements.display.setAttribute('aria-haspopup', 'listbox');
            
            // Add display content
            this.elements.displayText = document.createElement('span');
            this.elements.displayText.className = 'display-text';
            this.elements.displayText.textContent = this.getPlaceholder();
            
            this.elements.displayIcon = document.createElement('span');
            this.elements.displayIcon.className = 'display-icon';
            this.elements.displayIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
            
            this.elements.display.appendChild(this.elements.displayText);
            this.elements.display.appendChild(this.elements.displayIcon);
            
            // Create dropdown
            this.elements.dropdown = document.createElement('div');
            this.elements.dropdown.className = this.config.CLASSES.DROPDOWN;
            this.elements.dropdown.style.display = 'none';
            this.elements.dropdown.setAttribute('role', 'listbox');
            
            // Create search input
            this.elements.searchWrapper = document.createElement('div');
            this.elements.searchWrapper.className = 'search-wrapper';
            
            this.elements.searchInput = document.createElement('input');
            this.elements.searchInput.type = 'text';
            this.elements.searchInput.className = this.config.CLASSES.SEARCH;
            this.elements.searchInput.placeholder = 'Cerca...';
            this.elements.searchInput.setAttribute('autocomplete', 'off');
            this.elements.searchInput.setAttribute('autocorrect', 'off');
            this.elements.searchInput.setAttribute('autocapitalize', 'off');
            this.elements.searchInput.setAttribute('spellcheck', 'false');
            
            this.elements.searchClear = document.createElement('button');
            this.elements.searchClear.className = 'search-clear';
            this.elements.searchClear.innerHTML = '<i class="fas fa-times"></i>';
            this.elements.searchClear.style.display = 'none';
            this.elements.searchClear.setAttribute('tabindex', '-1');
            
            this.elements.searchWrapper.appendChild(this.elements.searchInput);
            this.elements.searchWrapper.appendChild(this.elements.searchClear);
            
            // Create options container
            this.elements.optionsContainer = document.createElement('div');
            this.elements.optionsContainer.className = this.config.CLASSES.OPTIONS;
            this.elements.optionsContainer.style.maxHeight = this.config.UI.DROPDOWN_MAX_HEIGHT + 'px';
            
            // Create loading indicator
            this.elements.loadingIndicator = document.createElement('div');
            this.elements.loadingIndicator.className = 'loading-indicator';
            this.elements.loadingIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i> ${this.config.UI.LOADING_TEXT}
            `;
            this.elements.loadingIndicator.style.display = 'none';
            
            // Create no results message
            this.elements.noResults = document.createElement('div');
            this.elements.noResults.className = 'no-results';
            this.elements.noResults.textContent = this.config.UI.NO_RESULTS_TEXT;
            this.elements.noResults.style.display = 'none';
            
            // Assemble dropdown
            this.elements.dropdown.appendChild(this.elements.searchWrapper);
            this.elements.dropdown.appendChild(this.elements.loadingIndicator);
            this.elements.dropdown.appendChild(this.elements.optionsContainer);
            this.elements.dropdown.appendChild(this.elements.noResults);
            
            // Assemble wrapper
            this.elements.wrapper.appendChild(this.elements.display);
            this.elements.wrapper.appendChild(this.elements.dropdown);
            
            // Add to container
            this.element.appendChild(this.elements.wrapper);
            
            // Add multiple class if needed
            if (this.config.BEHAVIOR.MULTIPLE_SELECTION) {
                this.elements.wrapper.classList.add(this.config.CLASSES.MULTIPLE);
            }
        }

        collectOptions() {
            this.options = [];
            this.groups.clear();
            
            // Process all options
            const selectOptions = this.select.querySelectorAll('option');
            let currentGroup = null;
            
            selectOptions.forEach((option, index) => {
                // Skip placeholder options
                if (option.value === '' && option.disabled) {
                    return;
                }
                
                // Check if option is in a group
                const optgroup = option.closest('optgroup');
                if (optgroup && optgroup.label !== currentGroup) {
                    currentGroup = optgroup.label;
                    if (!this.groups.has(currentGroup)) {
                        this.groups.set(currentGroup, []);
                    }
                }
                
                // Create option data
                const optionData = {
                    index: index,
                    value: option.value,
                    text: option.textContent.trim(),
                    group: currentGroup,
                    disabled: option.disabled,
                    selected: option.selected,
                    element: option,
                    data: this.extractDataAttributes(option),
                    searchText: this.buildSearchText(option, currentGroup)
                };
                
                this.options.push(optionData);
                
                // Add to group if applicable
                if (currentGroup) {
                    this.groups.get(currentGroup).push(optionData);
                }
                
                // Track selected values
                if (option.selected) {
                    this.state.selectedValues.add(option.value);
                }
            });
            
            this.state.filteredOptions = [...this.options];
            this.log('debug', `Collected ${this.options.length} options`);
        }

        extractDataAttributes(option) {
            const data = {};
            const attributes = [
                'details', 'icon', 'badge', 'color',
                'codice', 'indirizzo', 'citta', 'provincia', 'cap',
                'teatro', 'nazione', 'tipo', 'stato'
            ];
            
            attributes.forEach(attr => {
                const value = option.getAttribute(`data-${attr}`);
                if (value) {
                    data[attr] = value;
                }
            });
            
            return data;
        }

        buildSearchText(option, group) {
            const parts = [
                option.textContent,
                option.value,
                group
            ];
            
            // Add all data attributes to search text
            Object.values(this.extractDataAttributes(option)).forEach(value => {
                if (value) parts.push(value);
            });
            
            return parts.join(' ').toLowerCase();
        }

        // ========================================
        // EVENT HANDLERS
        // ========================================
        
        setupEventHandlers() {
            // Display click
            this.addEventHandler(this.elements.display, 'click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
            });
            
            // Display keyboard
            this.addEventHandler(this.elements.display, 'keydown', (e) => {
                this.handleDisplayKeyboard(e);
            });
            
            // Search input
            this.addEventHandler(this.elements.searchInput, 'input', (e) => {
                this.handleSearchInput(e.target.value);
            });
            
            // Search keyboard
            this.addEventHandler(this.elements.searchInput, 'keydown', (e) => {
                this.handleSearchKeyboard(e);
            });
            
            // Search clear button
            this.addEventHandler(this.elements.searchClear, 'click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearSearch();
            });
            
            // Options container click delegation
            this.addEventHandler(this.elements.optionsContainer, 'click', (e) => {
                this.handleOptionClick(e);
            });
            
            // Options container hover delegation
            this.addEventHandler(this.elements.optionsContainer, 'mouseover', (e) => {
                this.handleOptionHover(e);
            });
            
            // Document click for closing
            document.addEventListener('click', this.handleDocumentClick);
            
            // Select change sync
            this.select.addEventListener('change', this.handleSelectChange);
        }

        addEventHandler(element, event, handler) {
            if (!element) return;
            
            element.addEventListener(event, handler);
            
            // Store for cleanup
            if (!this.eventHandlers.has(element)) {
                this.eventHandlers.set(element, new Map());
            }
            this.eventHandlers.get(element).set(event, handler);
        }

        removeEventHandlers() {
            // Remove stored event handlers
            this.eventHandlers.forEach((events, element) => {
                events.forEach((handler, event) => {
                    element.removeEventListener(event, handler);
                });
            });
            this.eventHandlers.clear();
            
            // Remove document handlers
            document.removeEventListener('click', this.handleDocumentClick);
            
            // Remove select handler
            this.select.removeEventListener('change', this.handleSelectChange);
        }

        handleDocumentClick(e) {
            if (!this.elements.wrapper.contains(e.target) && this.state.isOpen) {
                this.close();
            }
        }

        handleSelectChange() {
            // Sync display when select changes programmatically
            this.syncWithSelect();
        }

        handleDisplayKeyboard(e) {
            switch(e.key) {
                case 'Enter':
                case ' ':
                case 'ArrowDown':
                    e.preventDefault();
                    this.open();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (this.state.isOpen) {
                        this.close();
                    }
                    break;
            }
        }

        handleSearchInput(value) {
            this.state.searchTerm = value;
            
            // Show/hide clear button
            this.elements.searchClear.style.display = value ? 'block' : 'none';
            
            // Debounce search
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.performSearch(value);
            }, this.config.SEARCH.DEBOUNCE_DELAY);
        }

        handleSearchKeyboard(e) {
            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.navigateOptions(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.navigateOptions(-1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.selectHighlighted();
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (this.state.searchTerm) {
                        this.clearSearch();
                    } else {
                        this.close();
                    }
                    break;
                case 'Tab':
                    // Allow tab to move focus
                    this.close();
                    break;
            }
        }

        handleOptionClick(e) {
            const optionElement = e.target.closest(`.${this.config.CLASSES.OPTION}`);
            if (!optionElement) return;
            
            const value = optionElement.dataset.value;
            if (value !== undefined) {
                this.selectOption(value);
            }
        }

        handleOptionHover(e) {
            const optionElement = e.target.closest(`.${this.config.CLASSES.OPTION}`);
            if (!optionElement) return;
            
            const index = parseInt(optionElement.dataset.index);
            if (!isNaN(index)) {
                this.highlightOption(index);
            }
        }

        // ========================================
        // SEARCH & FILTER
        // ========================================
        
        performSearch(searchTerm) {
            const normalizedSearch = searchTerm.toLowerCase().trim();
            
            if (!normalizedSearch) {
                // Reset to all options
                this.state.filteredOptions = [...this.options];
            } else {
                // Filter options
                if (this.config.SEARCH.FUZZY_SEARCH) {
                    this.state.filteredOptions = this.fuzzySearch(normalizedSearch);
                } else {
                    this.state.filteredOptions = this.options.filter(option => {
                        return option.searchText.includes(normalizedSearch);
                    });
                }
                
                // Limit results
                if (this.config.SEARCH.MAX_RESULTS > 0) {
                    this.state.filteredOptions = this.state.filteredOptions.slice(0, this.config.SEARCH.MAX_RESULTS);
                }
            }
            
            this.renderOptions();
            this.state.highlightedIndex = -1;
        }

        fuzzySearch(searchTerm) {
            // Simple fuzzy search implementation
            const results = [];
            
            this.options.forEach(option => {
                let score = 0;
                let lastIndex = -1;
                
                for (let i = 0; i < searchTerm.length; i++) {
                    const char = searchTerm[i];
                    const index = option.searchText.indexOf(char, lastIndex + 1);
                    
                    if (index === -1) {
                        score = -1;
                        break;
                    }
                    
                    score += (index - lastIndex);
                    lastIndex = index;
                }
                
                if (score !== -1) {
                    results.push({ option, score });
                }
            });
            
            // Sort by score (lower is better)
            results.sort((a, b) => a.score - b.score);
            
            return results.map(r => r.option);
        }

        clearSearch() {
            this.elements.searchInput.value = '';
            this.state.searchTerm = '';
            this.elements.searchClear.style.display = 'none';
            this.performSearch('');
            
            if (this.config.BEHAVIOR.AUTO_FOCUS_SEARCH) {
                this.elements.searchInput.focus();
            }
        }

        // ========================================
        // RENDERING
        // ========================================
        
        renderOptions() {
            this.elements.optionsContainer.innerHTML = '';
            
            if (this.state.filteredOptions.length === 0) {
                this.elements.noResults.style.display = 'block';
                return;
            }
            
            this.elements.noResults.style.display = 'none';
            
            let currentGroup = null;
            
            this.state.filteredOptions.forEach((option, index) => {
                // Render group header if needed
                if (this.config.UI.SHOW_GROUPS && option.group && option.group !== currentGroup) {
                    currentGroup = option.group;
                    this.renderGroupHeader(currentGroup);
                }
                
                // Render option
                this.renderOption(option, index);
            });
        }

        renderGroupHeader(groupName) {
            const groupElement = document.createElement('div');
            groupElement.className = this.config.CLASSES.GROUP;
            groupElement.textContent = groupName;
            this.elements.optionsContainer.appendChild(groupElement);
        }

        renderOption(option, index) {
            const optionElement = document.createElement('div');
            optionElement.className = this.config.CLASSES.OPTION;
            optionElement.dataset.value = option.value;
            optionElement.dataset.index = index;
            optionElement.setAttribute('role', 'option');
            
            // Add classes
            if (option.disabled) {
                optionElement.classList.add(this.config.CLASSES.DISABLED);
            }
            if (this.state.selectedValues.has(option.value)) {
                optionElement.classList.add(this.config.CLASSES.SELECTED);
                optionElement.setAttribute('aria-selected', 'true');
            }
            if (index === this.state.highlightedIndex) {
                optionElement.classList.add(this.config.CLASSES.HIGHLIGHTED);
            }
            
            // Build content
            let html = '';
            
            // Icon
            if (this.config.UI.SHOW_ICONS && option.data.icon) {
                html += `<i class="${option.data.icon} option-icon"></i>`;
            }
            
            // Main text
            html += '<span class="option-text">';
            if (this.config.SEARCH.HIGHLIGHT_MATCHES && this.state.searchTerm) {
                html += this.highlightMatches(option.text, this.state.searchTerm);
            } else {
                html += this.escapeHtml(option.text);
            }
            html += '</span>';
            
            // Details
            if (this.config.UI.SHOW_DETAILS && option.data.details) {
                html += `<span class="option-details">${this.escapeHtml(option.data.details)}</span>`;
            }
            
            // Badge
            if (this.config.UI.SHOW_BADGES && option.data.badge) {
                const color = option.data.color || 'secondary';
                html += `<span class="badge bg-${color}">${this.escapeHtml(option.data.badge)}</span>`;
            }
            
            optionElement.innerHTML = html;
            this.elements.optionsContainer.appendChild(optionElement);
        }

        highlightMatches(text, searchTerm) {
            if (!searchTerm) return this.escapeHtml(text);
            
            const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
            return this.escapeHtml(text).replace(regex, '<mark>$1</mark>');
        }

        // ========================================
        // SELECTION
        // ========================================
        
        selectOption(value) {
            const option = this.options.find(opt => opt.value === value);
            if (!option || option.disabled) return;
            
            if (this.config.BEHAVIOR.MULTIPLE_SELECTION) {
                this.toggleMultipleSelection(value);
            } else {
                this.setSingleSelection(value);
            }
            
            // Update display
            this.updateDisplay();
            
            // Clear search if configured
            if (this.config.BEHAVIOR.CLEAR_SEARCH_ON_SELECT) {
                this.clearSearch();
            }
            
            // Close if configured
            if (this.config.BEHAVIOR.CLOSE_ON_SELECT && !this.config.BEHAVIOR.MULTIPLE_SELECTION) {
                this.close();
            }
            
            // Emit event
            this.emit('searchable-select:change', {
                value: value,
                option: option,
                selected: this.getSelectedValues()
            });
        }

        setSingleSelection(value) {
            // Clear previous selection
            this.state.selectedValues.clear();
            
            // Set new selection
            this.state.selectedValues.add(value);
            
            // Update original select
            this.select.value = value;
            
            // Trigger change event on select
            const event = new Event('change', { bubbles: true });
            this.select.dispatchEvent(event);
        }

        toggleMultipleSelection(value) {
            if (this.state.selectedValues.has(value)) {
                this.state.selectedValues.delete(value);
            } else {
                this.state.selectedValues.add(value);
            }
            
            // Update original select
            Array.from(this.select.options).forEach(option => {
                option.selected = this.state.selectedValues.has(option.value);
            });
            
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            this.select.dispatchEvent(event);
        }

        selectHighlighted() {
            if (this.state.highlightedIndex >= 0 && this.state.highlightedIndex < this.state.filteredOptions.length) {
                const option = this.state.filteredOptions[this.state.highlightedIndex];
                this.selectOption(option.value);
            }
        }

        // ========================================
        // NAVIGATION
        // ========================================
        
        navigateOptions(direction) {
            const maxIndex = this.state.filteredOptions.length - 1;
            let newIndex = this.state.highlightedIndex + direction;
            
            // Skip disabled options
            while (newIndex >= 0 && newIndex <= maxIndex) {
                const option = this.state.filteredOptions[newIndex];
                if (!option.disabled) {
                    break;
                }
                newIndex += direction;
            }
            
            // Clamp to valid range
            newIndex = Math.max(0, Math.min(maxIndex, newIndex));
            
            this.highlightOption(newIndex);
            this.scrollToHighlighted();
        }

        highlightOption(index) {
            // Remove previous highlight
            const prevHighlighted = this.elements.optionsContainer.querySelector(`.${this.config.CLASSES.HIGHLIGHTED}`);
            if (prevHighlighted) {
                prevHighlighted.classList.remove(this.config.CLASSES.HIGHLIGHTED);
            }
            
            // Add new highlight
            this.state.highlightedIndex = index;
            const newHighlighted = this.elements.optionsContainer.querySelector(`[data-index="${index}"]`);
            if (newHighlighted) {
                newHighlighted.classList.add(this.config.CLASSES.HIGHLIGHTED);
            }
        }

        scrollToHighlighted() {
            const highlighted = this.elements.optionsContainer.querySelector(`.${this.config.CLASSES.HIGHLIGHTED}`);
            if (!highlighted) return;
            
            const containerRect = this.elements.optionsContainer.getBoundingClientRect();
            const optionRect = highlighted.getBoundingClientRect();
            
            if (optionRect.bottom > containerRect.bottom) {
                this.elements.optionsContainer.scrollTop += optionRect.bottom - containerRect.bottom;
            } else if (optionRect.top < containerRect.top) {
                this.elements.optionsContainer.scrollTop -= containerRect.top - optionRect.top;
            }
        }

        // ========================================
        // DISPLAY & UI
        // ========================================
        
        updateDisplay() {
            const selectedOptions = this.options.filter(opt => 
                this.state.selectedValues.has(opt.value)
            );
            
            if (selectedOptions.length === 0) {
                this.elements.displayText.textContent = this.getPlaceholder();
                this.elements.display.classList.remove('has-value');
            } else if (selectedOptions.length === 1) {
                this.elements.displayText.textContent = selectedOptions[0].text;
                this.elements.display.classList.add('has-value');
            } else {
                this.elements.displayText.textContent = `${selectedOptions.length} selezionati`;
                this.elements.display.classList.add('has-value');
            }
        }

        syncWithSelect() {
            // Clear current selection
            this.state.selectedValues.clear();
            
            // Get selected values from select
            if (this.select.multiple) {
                Array.from(this.select.selectedOptions).forEach(option => {
                    this.state.selectedValues.add(option.value);
                });
            } else if (this.select.value) {
                this.state.selectedValues.add(this.select.value);
            }
            
            // Update display
            this.updateDisplay();
            
            // Re-render if open
            if (this.state.isOpen) {
                this.renderOptions();
            }
        }

        getPlaceholder() {
            // Check for placeholder option
            const placeholderOption = this.select.querySelector('option[value=""][disabled]');
            if (placeholderOption) {
                return placeholderOption.textContent;
            }
            
            return this.config.UI.PLACEHOLDER;
        }

        getSelectedValues() {
            return Array.from(this.state.selectedValues);
        }

        // ========================================
        // OPEN/CLOSE
        // ========================================
        
        toggle() {
            if (this.state.isOpen) {
                this.close();
            } else {
                this.open();
            }
        }

        open() {
            if (this.state.isOpen) return;
            
            this.state.isOpen = true;
            this.elements.dropdown.style.display = 'block';
            this.elements.display.classList.add(this.config.CLASSES.OPEN);
            this.elements.display.setAttribute('aria-expanded', 'true');
            
            // Update icon
            this.elements.displayIcon.innerHTML = '<i class="fas fa-chevron-up"></i>';
            
            // Position dropdown
            this.positionDropdown();
            
            // Render options
            this.renderOptions();
            
            // Focus search if configured
            if (this.config.BEHAVIOR.AUTO_FOCUS_SEARCH) {
                setTimeout(() => {
                    this.elements.searchInput.focus();
                }, 100);
            }
            
            // Animate
            this.animateDropdown(true);
            
            // Emit event
            this.emit('searchable-select:open');
        }

        close() {
            if (!this.state.isOpen) return;
            
            this.state.isOpen = false;
            this.elements.display.classList.remove(this.config.CLASSES.OPEN);
            this.elements.display.setAttribute('aria-expanded', 'false');
            
            // Update icon
            this.elements.displayIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
            
            // Animate then hide
            this.animateDropdown(false, () => {
                this.elements.dropdown.style.display = 'none';
            });
            
            // Clear search
            if (this.config.BEHAVIOR.CLEAR_SEARCH_ON_SELECT) {
                this.clearSearch();
            }
            
            // Reset highlight
            this.state.highlightedIndex = -1;
            
            // Emit event
            this.emit('searchable-select:close');
        }

        positionDropdown() {
            const displayRect = this.elements.display.getBoundingClientRect();
            const dropdownHeight = this.elements.dropdown.offsetHeight;
            const spaceBelow = window.innerHeight - displayRect.bottom;
            const spaceAbove = displayRect.top;
            
            // Reset positioning classes
            this.elements.dropdown.classList.remove('dropdown-above', 'dropdown-below');
            
            // Determine best position
            if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                // Position above
                this.elements.dropdown.classList.add('dropdown-above');
            } else {
                // Position below
                this.elements.dropdown.classList.add('dropdown-below');
            }
        }

        animateDropdown(opening, callback) {
            if (!this.config.UI.ANIMATION_DURATION) {
                if (callback) callback();
                return;
            }
            
            clearTimeout(this.animationTimeout);
            
            if (opening) {
                this.elements.dropdown.style.opacity = '0';
                this.elements.dropdown.style.transform = 'translateY(-10px)';
                
                requestAnimationFrame(() => {
                    this.elements.dropdown.style.transition = `all ${this.config.UI.ANIMATION_DURATION}ms ease`;
                    this.elements.dropdown.style.opacity = '1';
                    this.elements.dropdown.style.transform = 'translateY(0)';
                });
            } else {
                this.elements.dropdown.style.transition = `all ${this.config.UI.ANIMATION_DURATION}ms ease`;
                this.elements.dropdown.style.opacity = '0';
                this.elements.dropdown.style.transform = 'translateY(-10px)';
                
                this.animationTimeout = setTimeout(() => {
                    if (callback) callback();
                }, this.config.UI.ANIMATION_DURATION);
            }
        }

        // ========================================
        // SPA INTEGRATION
        // ========================================
        
        setupSPAIntegration() {
            if (window.TalonApp) {
                window.TalonApp.on('talon:cleanup', this.handleSPACleanup);
                window.TalonApp.on('talon:content:loaded', this.handleSPANavigation);
            } else {
                document.addEventListener('spa:cleanup', this.handleSPACleanup);
                document.addEventListener('spa:content-loaded', this.handleSPANavigation);
            }
        }

        removeSPAIntegration() {
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
            
            if (this.config.SPA.CLEANUP_ON_NAVIGATION) {
                // Save state before cleanup
                if (this.config.SPA.PERSIST_STATE) {
                    this.saveState();
                }
                
                // Close if open
                if (this.state.isOpen) {
                    this.close();
                }
            }
        }

        handleSPANavigation() {
            this.log('debug', 'SPA navigation detected');
            
            if (this.config.SPA.AUTO_REINIT) {
                // Check if select still exists
                const select = document.getElementById(this.selectId);
                if (select) {
                    // Re-collect options
                    this.select = select;
                    this.collectOptions();
                    this.syncWithSelect();
                } else {
                    // Element no longer exists, destroy
                    this.destroy();
                }
            }
        }

        // ========================================
        // STATE MANAGEMENT
        // ========================================
        
        saveState() {
            const state = {
                selectedValues: Array.from(this.state.selectedValues),
                searchTerm: this.state.searchTerm,
                isOpen: this.state.isOpen
            };
            
            try {
                sessionStorage.setItem(`searchable-select-${this.selectId}`, JSON.stringify(state));
            } catch (e) {
                this.log('error', 'Failed to save state:', e);
            }
        }

        loadState() {
            try {
                const saved = sessionStorage.getItem(`searchable-select-${this.selectId}`);
                if (saved) {
                    const state = JSON.parse(saved);
                    
                    // Restore selected values
                    if (state.selectedValues) {
                        this.state.selectedValues = new Set(state.selectedValues);
                        
                        // Sync with select
                        if (this.select.multiple) {
                            Array.from(this.select.options).forEach(option => {
                                option.selected = this.state.selectedValues.has(option.value);
                            });
                        } else if (state.selectedValues.length > 0) {
                            this.select.value = state.selectedValues[0];
                        }
                        
                        this.updateDisplay();
                    }
                    
                    // Restore search term if was open
                    if (state.isOpen && state.searchTerm) {
                        this.state.searchTerm = state.searchTerm;
                    }
                }
            } catch (e) {
                this.log('error', 'Failed to load state:', e);
            }
        }

        // ========================================
        // UTILITIES
        // ========================================
        
        emit(eventName, detail = {}) {
            const event = new CustomEvent(eventName, {
                detail: { ...detail, instance: this },
                bubbles: true,
                cancelable: true
            });
            this.element.dispatchEvent(event);
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        escapeRegex(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        log(level, ...args) {
            if (!this.config.SPA.DEBUG && level === 'debug') return;
            
            const prefix = '[SearchableSelect]';
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
        // PUBLIC API
        // ========================================
        
        getValue() {
            if (this.config.BEHAVIOR.MULTIPLE_SELECTION) {
                return this.getSelectedValues();
            }
            return this.getSelectedValues()[0] || null;
        }

        setValue(value) {
            if (this.config.BEHAVIOR.MULTIPLE_SELECTION) {
                if (Array.isArray(value)) {
                    this.state.selectedValues = new Set(value);
                } else {
                    this.state.selectedValues = new Set([value]);
                }
            } else {
                this.state.selectedValues = new Set([value]);
            }
            
            this.syncWithSelect();
        }

        reset() {
            this.state.selectedValues.clear();
            this.select.value = '';
            this.updateDisplay();
            this.clearSearch();
        }

        enable() {
            this.select.disabled = false;
            this.elements.display.removeAttribute('disabled');
            this.elements.display.classList.remove('disabled');
        }

        disable() {
            this.select.disabled = true;
            this.elements.display.setAttribute('disabled', 'disabled');
            this.elements.display.classList.add('disabled');
            this.close();
        }

        refresh() {
            this.collectOptions();
            this.syncWithSelect();
            if (this.state.isOpen) {
                this.renderOptions();
            }
        }

        destroy() {
            this.log('info', 'Destroying SearchableSelect...');
            
            // Close if open
            if (this.state.isOpen) {
                this.close();
            }
            
            // Remove event handlers
            this.removeEventHandlers();
            
            // Remove SPA integration
            this.removeSPAIntegration();
            
            // Clear timers
            clearTimeout(this.searchTimeout);
            clearTimeout(this.animationTimeout);
            
            // Clear state
            if (this.config.SPA.PERSIST_STATE) {
                this.saveState();
            }
            
            // Restore original select
            this.select.style.display = '';
            
            // Remove created elements
            this.element.innerHTML = '';
            
            // Clear references
            this.elements = {};
            this.options = [];
            this.groups.clear();
            
            this.state.initialized = false;
            
            this.log('success', '✅ SearchableSelect destroyed');
        }
    }

    // ========================================
    // SEARCHABLE SELECT MANAGER
    // ========================================
    
    class SearchableSelectManager {
        constructor() {
            this.instances = new Map();
            this.initialized = false;
            
            // Auto-init on DOM ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                this.init();
            }
        }

        init() {
            if (this.initialized) return;
            
            // console.log removed for production silence
            
            // Setup SPA listeners
            this.setupSPAListeners();
            
            // Auto-detect and initialize
            this.autoInitialize();
            
            this.initialized = true;
            // console.log removed for production silence
        }

        setupSPAListeners() {
            if (window.TalonApp) {
                window.TalonApp.on('talon:content:loaded', () => {
                    this.autoInitialize();
                });
            } else {
                document.addEventListener('spa:content-loaded', () => {
                    this.autoInitialize();
                });
            }
        }

        autoInitialize() {
            const elements = document.querySelectorAll('.searchable-select[data-select-id]');
            
            elements.forEach(element => {
                const selectId = element.dataset.selectId;
                
                // Skip if already initialized
                if (this.instances.has(selectId)) {
                    // Check if still valid
                    const instance = this.instances.get(selectId);
                    if (instance.state.initialized) {
                        return;
                    }
                }
                
                // Create new instance
                this.create(element);
            });
        }

        create(element, options = {}) {
            const selectId = element.dataset.selectId || element.getAttribute('data-select-id');
            
            // Destroy existing if present
            if (this.instances.has(selectId)) {
                this.destroy(selectId);
            }
            
            const instance = new SearchableSelect(element, options);
            this.instances.set(selectId, instance);
            
            return instance;
        }

        get(selectId) {
            return this.instances.get(selectId);
        }

        getAll() {
            return Array.from(this.instances.values());
        }

        destroy(selectId) {
            const instance = this.instances.get(selectId);
            if (instance) {
                instance.destroy();
                this.instances.delete(selectId);
            }
        }

        destroyAll() {
            this.instances.forEach(instance => instance.destroy());
            this.instances.clear();
        }

        refresh() {
            this.instances.forEach(instance => instance.refresh());
        }
    }

    // ========================================
    // INITIALIZATION & EXPORT
    // ========================================
    
    // Create manager singleton
    const manager = new SearchableSelectManager();
    
    // Export API
    window.TalonSearchableSelect = {
        // Manager methods
        create: (element, options) => manager.create(element, options),
        get: (selectId) => manager.get(selectId),
        getAll: () => manager.getAll(),
        destroy: (selectId) => manager.destroy(selectId),
        destroyAll: () => manager.destroyAll(),
        refresh: () => manager.refresh(),
        
        // Direct class access
        SearchableSelect: SearchableSelect,
        
        // Configuration
        getConfig: () => ({ ...CONFIG }),
        setConfig: (newConfig) => Object.assign(CONFIG, newConfig),
        
        // Info
        version: '2.0.0',
        isInitialized: () => manager.initialized
    };
    
    // Aliases for compatibility
    window.TALON_API = window.TALON_API || {};
    window.TALON_API.SearchableSelect = SearchableSelect;
    window.TALON_API.initializeSearchableSelects = () => manager.autoInitialize();
    window.TALON_API.refreshSearchableSelects = () => manager.refresh();
    

})(window, document);