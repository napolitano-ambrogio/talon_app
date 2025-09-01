/**
 * ========================================
 * TALON SLIM SELECT MIGRATION GUIDE
 * File: static/js/components/slim-select-migration-guide.js
 * 
 * Versione: 3.0.0 - Migration Helper
 * Descrizione: Helper per migrazione da SearchableSelect a TalonSlimSelect
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // MIGRATION MAPPING
    // ========================================
    
    /**
     * Mappa la configurazione vecchia a quella nuova
     * @param {Object} oldConfig - Configurazione SearchableSelect vecchia
     * @returns {Object} Configurazione TalonSlimSelect nuova
     */
    function mapOldConfigToNew(oldConfig = {}) {
        const newConfig = {
            settings: {},
            events: {},
            talon: {}
        };

        // Mappa le configurazioni di ricerca
        if (oldConfig.SEARCH || oldConfig.searchOptions) {
            const searchConfig = oldConfig.SEARCH || oldConfig.searchOptions;
            
            if (searchConfig.DEBOUNCE_DELAY !== undefined) {
                newConfig.settings.timeoutDelay = searchConfig.DEBOUNCE_DELAY;
            }
            if (searchConfig.debounceDelay !== undefined) {
                newConfig.settings.timeoutDelay = searchConfig.debounceDelay;
            }
            
            if (searchConfig.HIGHLIGHT_MATCHES !== undefined) {
                newConfig.settings.searchHighlight = searchConfig.HIGHLIGHT_MATCHES;
            }
            if (searchConfig.highlightMatches !== undefined) {
                newConfig.settings.searchHighlight = searchConfig.highlightMatches;
            }
            
            if (searchConfig.MAX_RESULTS !== undefined) {
                newConfig.settings.maxValuesShown = searchConfig.MAX_RESULTS;
            }
            if (searchConfig.maxResults !== undefined) {
                newConfig.settings.maxValuesShown = searchConfig.maxResults;
            }
        }

        // Mappa le configurazioni UI
        if (oldConfig.UI || oldConfig.uiOptions) {
            const uiConfig = oldConfig.UI || oldConfig.uiOptions;
            
            if (uiConfig.PLACEHOLDER !== undefined) {
                newConfig.settings.placeholderText = uiConfig.PLACEHOLDER;
            }
            if (uiConfig.NO_RESULTS_TEXT !== undefined) {
                newConfig.settings.searchText = uiConfig.NO_RESULTS_TEXT;
            }
            if (uiConfig.LOADING_TEXT !== undefined) {
                newConfig.settings.searchingText = uiConfig.LOADING_TEXT;
            }
            
            if (uiConfig.SHOW_DETAILS !== undefined) {
                newConfig.settings.showOptionTooltips = uiConfig.SHOW_DETAILS;
            }
            if (uiConfig.showDetails !== undefined) {
                newConfig.settings.showOptionTooltips = uiConfig.showDetails;
            }
            
            if (uiConfig.AUTO_FOCUS_SEARCH !== undefined) {
                newConfig.settings.focusSearch = uiConfig.AUTO_FOCUS_SEARCH;
            }
            if (uiConfig.autoFocusSearch !== undefined) {
                newConfig.settings.focusSearch = uiConfig.autoFocusSearch;
            }
        }

        // Mappa le configurazioni di comportamento
        if (oldConfig.BEHAVIOR) {
            const behaviorConfig = oldConfig.BEHAVIOR;
            
            if (behaviorConfig.CLOSE_ON_SELECT !== undefined) {
                newConfig.settings.closeOnSelect = behaviorConfig.CLOSE_ON_SELECT;
            }
            if (behaviorConfig.MULTIPLE_SELECTION !== undefined) {
                newConfig.settings.maxSelected = behaviorConfig.MULTIPLE_SELECTION ? 1000 : 1;
            }
        }

        // Mappa placeholder e noResultsText semplici
        if (oldConfig.placeholder !== undefined) {
            newConfig.settings.placeholderText = oldConfig.placeholder;
        }
        if (oldConfig.noResultsText !== undefined) {
            newConfig.settings.searchText = oldConfig.noResultsText;
        }
        if (oldConfig.loadingText !== undefined) {
            newConfig.settings.searchingText = oldConfig.loadingText;
        }

        // Configurazioni TALON specifiche
        newConfig.talon = {
            logEvents: false,
            validateOnChange: true,
            autoUppercase: true,
            enableTooltips: true
        };

        return newConfig;
    }

    // ========================================
    // COMPATIBILITY LAYER
    // ========================================
    
    /**
     * Layer di compatibilità per codice esistente
     */
    class SearchableSelectCompatibility {
        constructor(element, options = {}) {
            console.warn('[Migration] Using compatibility layer for SearchableSelect. Please migrate to TalonSlimSelect.');
            
            // Converti configurazione vecchia in nuova
            const newConfig = mapOldConfigToNew(options);
            
            // Crea istanza TalonSlimSelect
            if (window.TalonSlimSelect) {
                this.slimInstance = window.TalonSlimSelect.create(element, newConfig);
                
                if (this.slimInstance) {
                    // Proxy methods per compatibilità
                    this.getValue = () => this.slimInstance.getValue();
                    this.setValue = (value) => this.slimInstance.setValue(value);
                    this.refresh = () => this.slimInstance.refresh();
                    this.destroy = () => this.slimInstance.destroy();
                    this.open = () => this.slimInstance.open();
                    this.close = () => this.slimInstance.close();
                    this.enable = () => this.slimInstance.enable();
                    this.disable = () => this.slimInstance.disable();
                    
                    // State proxy
                    this.state = {
                        initialized: true
                    };
                }
            } else {
                console.error('[Migration] TalonSlimSelect not available!');
            }
        }
    }

    // ========================================
    // AUTO MIGRATION
    // ========================================
    
    /**
     * Migra automaticamente elementi SearchableSelect esistenti
     */
    function autoMigrateElements() {
        // Cerca elementi con il vecchio pattern
        const oldElements = document.querySelectorAll('.searchable-select[data-select-id]');
        let migratedCount = 0;
        
        oldElements.forEach(element => {
            const selectId = element.dataset.selectId;
            
            // Skip se già migrato
            if (element.hasAttribute('data-slim-migrated')) {
                return;
            }
            
            // Verifica che TalonSlimSelect sia disponibile
            if (!window.TalonSlimSelect) {
                console.error('[Migration] TalonSlimSelect not available for auto-migration');
                return;
            }
            
            // Configurazione di default per migrazione
            const migrationConfig = {
                settings: {
                    showSearch: true,
                    focusSearch: true,
                    searchPlaceholder: 'Cerca...',
                    searchText: 'Nessun risultato trovato',
                    placeholderText: 'Seleziona valore...',
                    searchHighlight: true,
                    closeOnSelect: true,
                    showOptionTooltips: true
                },
                talon: {
                    logEvents: false,
                    validateOnChange: true,
                    autoUppercase: true,
                    enableTooltips: true
                }
            };
            
            // Crea istanza
            const instance = window.TalonSlimSelect.create(element, migrationConfig);
            
            if (instance) {
                element.setAttribute('data-slim-migrated', 'true');
                migratedCount++;
                
                console.log(`[Migration] Migrated element #${selectId} to TalonSlimSelect`);
            }
        });
        
        if (migratedCount > 0) {
            console.log(`[Migration] Auto-migrated ${migratedCount} SearchableSelect elements`);
        }
    }

    // ========================================
    // MIGRATION UTILITIES
    // ========================================
    
    /**
     * Verifica se il vecchio SearchableSelect è presente
     */
    function hasOldSearchableSelect() {
        return typeof window.SearchableSelect !== 'undefined' || 
               typeof window.TalonSearchableSelect !== 'undefined';
    }

    /**
     * Rimuove il vecchio SearchableSelect se presente
     */
    function removeOldSearchableSelect() {
        if (window.SearchableSelect) {
            delete window.SearchableSelect;
        }
        if (window.TalonSearchableSelect) {
            delete window.TalonSearchableSelect;
        }
        if (window.TALON_API && window.TALON_API.SearchableSelect) {
            delete window.TALON_API.SearchableSelect;
        }
        
        console.log('[Migration] Old SearchableSelect removed');
    }

    /**
     * Genera script di migrazione per template specifico
     */
    function generateMigrationScript(templateConfig) {
        const newConfig = mapOldConfigToNew(templateConfig);
        
        return `
// Migrazione automatica generata
if (window.TalonSlimSelect) {
    const element = document.querySelector('[data-select-id="YOUR_SELECT_ID"]');
    if (element) {
        TalonSlimSelect.create(element, ${JSON.stringify(newConfig, null, 2)});
    }
}
`;
    }

    // ========================================
    // EXPORT API
    // ========================================
    
    // Export funzioni di migrazione
    window.SlimSelectMigration = {
        mapOldConfigToNew: mapOldConfigToNew,
        SearchableSelectCompatibility: SearchableSelectCompatibility,
        autoMigrateElements: autoMigrateElements,
        hasOldSearchableSelect: hasOldSearchableSelect,
        removeOldSearchableSelect: removeOldSearchableSelect,
        generateMigrationScript: generateMigrationScript,
        
        // Utility
        version: '3.0.0'
    };

    // Setup compatibility layer se richiesto
    if (!window.SearchableSelect && window.TalonSlimSelect) {
        window.SearchableSelect = SearchableSelectCompatibility;
        console.log('[Migration] Compatibility layer installed');
    }

    // Auto-migrazione se configurata
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(autoMigrateElements, 200);
        });
    } else {
        setTimeout(autoMigrateElements, 200);
    }

})(window, document);