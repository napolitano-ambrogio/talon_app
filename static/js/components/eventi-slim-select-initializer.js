/**
 * ========================================
 * TALON - Eventi Slim Select Initializer
 * File: static/js/components/eventi-slim-select-initializer.js
 * 
 * Versione: 1.0.0
 * Descrizione: Gestione inizializzazione Slim Select per form eventi
 * Dependencies: Slim Select
 * ========================================
 */

class EventiSlimSelectInitializer {
    constructor() {
        this.instances = new Map();
        this.initStartTime = Date.now();
        this.retryCount = 0;
        this.maxRetries = 3;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.prepareSelectsForInitialization();
                this.initializeSlimSelects();
            });
        } else {
            this.prepareSelectsForInitialization();
            this.initializeSlimSelects();
        }
    }

    prepareSelectsForInitialization() {
        // Prepara i select per evitare FOUC
        const enteSelect = document.getElementById('ente_id');
        const tipologiaSelect = document.getElementById('tipologia_evento_id');
        
        [enteSelect, tipologiaSelect].forEach(select => {
            if (select) {
                // Nascondi il select originale subito
                select.classList.add('slim-select-initializing');
                
                // Crea placeholder visuale
                this.createLoadingPlaceholder(select);
            }
        });
    }

    createLoadingPlaceholder(selectElement) {
        const placeholder = document.createElement('div');
        placeholder.className = 'slim-select-placeholder slim-select-loading';
        placeholder.setAttribute('data-select-id', selectElement.id);
        
        // Prendi il testo dell'opzione selezionata o placeholder
        const selectedOption = selectElement.options[selectElement.selectedIndex];
        const placeholderText = selectedOption && selectedOption.value ? 
            selectedOption.textContent : 
            selectElement.querySelector('option[disabled]')?.textContent || 'Caricamento...';
            
        placeholder.textContent = placeholderText;
        
        // Inserisci dopo il select
        selectElement.parentNode.insertBefore(placeholder, selectElement.nextSibling);
        
        // Salva riferimento per rimozione successiva
        selectElement._loadingPlaceholder = placeholder;
    }

    removeLoadingPlaceholder(selectElement) {
        if (selectElement._loadingPlaceholder) {
            selectElement._loadingPlaceholder.remove();
            delete selectElement._loadingPlaceholder;
        }
    }




    showInitializedSelects() {
        // Mostra i select inizializzati con fade-in smooth
        const enteSelect = document.getElementById('ente_id');
        const tipologiaSelect = document.getElementById('tipologia_evento_id');
        
        [enteSelect, tipologiaSelect].forEach(select => {
            if (select && this.instances.has(select.id)) {
                // Rimuovi placeholder di caricamento
                this.removeLoadingPlaceholder(select);
                
                // Trova il container Slim Select creato
                const slimContainer = select.parentNode.querySelector('.ss-main');
                if (slimContainer) {
                    // Applica classi per fade-in smooth
                    slimContainer.classList.add('talon-slim-select', 'slim-select-ready');
                    
                    // Rimuovi classe di inizializzazione dal select originale
                    select.classList.remove('slim-select-initializing');
                    select.classList.add('slim-select-ready');
                    
                    // Select inizializzato correttamente
                }
            }
        });
    }

    initializeSlimSelects() {
        // Verifica disponibilità Slim Select con retry limitato
        if (typeof SlimSelect === 'undefined') {
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.warn(`[EVENTI] SlimSelect non disponibile, riprovo ${this.retryCount}/${this.maxRetries} tra 500ms`);
                setTimeout(() => this.initializeSlimSelects(), 500);
                return;
            } else {
                console.error('[EVENTI] SlimSelect non disponibile dopo tutti i tentativi, uso fallback nativo');
                this.initializeNativeFallbacks();
                return;
            }
        }

        // Reset retry counter on success
        this.retryCount = 0;

        // Inizializzazione immediata senza timeout per ridurre FOUC
        this.initializeEnteSelect();
        this.initializeTipologiaSelect();
        
        // Applica fix dopo breve pausa per DOM update
        setTimeout(() => {
            this.applyStylesAndFixes();
            this.showInitializedSelects();
            
            // Performance measurement
            setTimeout(() => this.measurePerformance(), 500);
        }, 100);
    }

    buildEnteDataWithHTML() {
        const enteSelect = document.getElementById('ente_id');
        if (!enteSelect) return [];
        
        const data = [];
        const options = enteSelect.querySelectorAll('option');
        
        options.forEach(option => {
            if (option.value === '') {
                // Opzione placeholder
                data.push({
                    text: option.textContent,
                    value: '',
                    placeholder: true
                });
            } else {
                const nome = option.textContent.trim();
                const indirizzo = option.getAttribute('data-indirizzo') || '';
                const codice = option.getAttribute('data-codice') || '';
                
                // Costruisci HTML con nome e indirizzo sulla stessa linea per il dropdown
                let html = nome;
                if (indirizzo) {
                    html += `<span style="margin: 0 0.3em;"> - </span><span style="font-size: 0.85em; font-style: italic; color: #666; vertical-align: top; display: inline-block; transform: translateY(0.25em);">${indirizzo}</span>`;
                }
                
                data.push({
                    text: nome, // Solo nome per ricerca e campo chiuso
                    html: html, // HTML con indirizzo per dropdown
                    value: option.value,
                    data: {
                        codice: codice,
                        indirizzo: indirizzo,
                        nome: nome
                    }
                });
            }
        });
        
        return data;
    }

    initializeEnteSelect() {
        const enteSelect = document.getElementById('ente_id');
        if (!enteSelect) {
            console.warn('[EVENTI] Elemento ente_id non trovato');
            return;
        }

        // Controlla se Slim Select è disabilitato per questo elemento
        if (enteSelect.hasAttribute('data-slim-select-disabled')) {
            console.log('[EVENTI] Slim Select disabilitato per ente_id, uso select nativo');
            this.fallbackToNativeSelect(enteSelect, 'ente_id');
            return;
        }

        // Cattura il valore selezionato prima dell'inizializzazione di SlimSelect
        const selectedValue = enteSelect.value;
        console.log('[EVENTI] Valore ente pre-SlimSelect:', selectedValue);

        try {
            const slimInstance = new SlimSelect({
                select: '#ente_id',
                data: this.buildEnteDataWithHTML(),
                settings: {
                    showSearch: true,
                    searchPlaceholder: 'Cerca per nome, codice o indirizzo...',
                    searchText: 'Nessun ente trovato',
                    placeholderText: 'Seleziona ente militare...',
                    closeOnSelect: true,
                    openPosition: 'auto',
                    searchHighlight: true,
                    allowDeselect: false,
                    hideSelectedOption: false,
                    showOptionTooltips: true
                },
                events: {
                    searchFilter: (option, search) => {
                        // Ricerca migliorata: nome + codice + indirizzo
                        const text = option.text.toLowerCase();
                        const searchLower = search.toLowerCase();
                        
                        // Usa i dati strutturati di Slim Select
                        if (option.data) {
                            const codice = (option.data.codice || '').toLowerCase();
                            const indirizzo = (option.data.indirizzo || '').toLowerCase();
                            
                            return text.includes(searchLower) || 
                                   codice.includes(searchLower) ||
                                   indirizzo.includes(searchLower);
                        }
                        
                        // Fallback solo per nome
                        return text.includes(searchLower);
                    },
                    afterChange: (newVal) => {
                        // Forza il display del solo nome nel campo chiuso
                        if (newVal && newVal.length > 0) {
                            this.forceSimpleDisplayInClosedField(newVal[0]);
                        }
                    }
                }
            });

            this.instances.set('ente_id', slimInstance);
            
            // Ripristina il valore selezionato dopo l'inizializzazione di SlimSelect
            if (selectedValue) {
                setTimeout(() => {
                    slimInstance.setSelected(selectedValue);
                    console.log('[EVENTI] Valore ente ripristinato post-SlimSelect:', selectedValue);
                    
                    // Forza il display del solo nome dopo il ripristino
                    setTimeout(() => {
                        const selectedData = slimInstance.getSelected();
                        if (selectedData && selectedData.length > 0) {
                            this.forceSimpleDisplayInClosedField(selectedData[0]);
                        }
                    }, 50);
                }, 100);
            }
            
        } catch (error) {
            console.error('[EVENTI] Errore inizializzazione ente_id:', error);
            this.fallbackToNativeSelect(enteSelect, 'ente_id');
        }
    }

    initializeTipologiaSelect() {
        const tipologiaSelect = document.getElementById('tipologia_evento_id');
        if (!tipologiaSelect) {
            console.warn('[EVENTI] Elemento tipologia_evento_id non trovato');
            return;
        }

        try {
            const slimInstance = new SlimSelect({
                select: '#tipologia_evento_id',
                settings: {
                    showSearch: true,
                    searchPlaceholder: 'Cerca tipologia evento...',
                    searchText: 'Nessuna tipologia trovata',
                    placeholderText: 'Seleziona tipologia evento...',
                    closeOnSelect: true,
                    openPosition: 'auto',
                    searchHighlight: true,
                    allowDeselect: false,
                    hideSelectedOption: false,
                    showOptionTooltips: true,
                    searchFilter: (option, search) => {
                        // Ricerca semplice come ente militare
                        const text = option.text.toLowerCase();
                        const searchLower = search.toLowerCase();
                        return text.includes(searchLower);
                    }
                }
            });

            this.instances.set('tipologia_evento_id', slimInstance);
            
        } catch (error) {
            console.error('[EVENTI] Errore inizializzazione tipologia_evento_id:', error);
            this.fallbackToNativeSelect(tipologiaSelect, 'tipologia_evento_id');
        }
    }

    forceSimpleDisplayInClosedField(selectedOption) {
        // Metodo per forzare il display del solo nome nel campo chiuso
        if (!selectedOption || !selectedOption.data || !selectedOption.data.nome) return;
        
        setTimeout(() => {
            const singleSelected = document.querySelector('#ente_id + .ss-main .ss-single-selected');
            if (singleSelected) {
                // Sostituisci tutto il contenuto HTML con solo il nome
                singleSelected.innerHTML = selectedOption.data.nome;
                console.log('[EVENTI] Display campo chiuso forzato a:', selectedOption.data.nome);
            }
        }, 10);
    }

    applyStylesAndFixes() {
        // Applica classe CSS e fix per input search
        setTimeout(() => {
            this.applyStyling();
            this.fixSearchInputs();
            this.startPeriodicFix();
        }, 500);
    }

    applyStyling() {
        // Styling viene applicato in showInitializedSelects() per evitare duplicazioni
        // Questo metodo è mantenuto per compatibilità ma non fa più nulla
    }

    fixSearchInputs() {
        const searchInputs = document.querySelectorAll('input[type="search"]:not([id])');
        searchInputs.forEach((input, index) => {
            this.assignSearchInputId(input, index);
        });
    }

    assignSearchInputId(input, index) {
        // Identifica il select parent per creare ID specifici
        let selectContext = 'unknown';
        const parentContainer = input.closest('.ss-main');
        
        if (parentContainer) {
            const previousSelect = parentContainer.previousElementSibling;
            if (previousSelect && previousSelect.id) {
                selectContext = previousSelect.id;
            }
        }
        
        const uniqueId = `${selectContext}_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
        input.id = uniqueId;
        input.name = uniqueId;
        input.setAttribute('aria-label', `Campo di ricerca per ${selectContext}`);
        input.setAttribute('autocomplete', 'off');
    }

    startPeriodicFix() {
        // Backup periodico per input creati dinamicamente
        let fixAttempts = 0;
        const searchFixer = setInterval(() => {
            const unfixedInputs = document.querySelectorAll('input[type="search"]:not([id])');
            
            if (unfixedInputs.length > 0) {
                unfixedInputs.forEach((input, index) => {
                    this.assignDynamicSearchInputId(input, index, fixAttempts);
                });
            }
            
            fixAttempts++;
            if (fixAttempts >= 5) { // Ferma dopo 5 tentativi (5 secondi)
                clearInterval(searchFixer);
            }
        }, 1000);
    }

    initializeNativeFallbacks() {
        
        const enteSelect = document.getElementById('ente_id');
        const tipologiaSelect = document.getElementById('tipologia_evento_id');
        
        [enteSelect, tipologiaSelect].forEach(select => {
            if (select) {
                // Rimuovi placeholder di caricamento
                this.removeLoadingPlaceholder(select);
                
                // Applica fallback nativo
                this.fallbackToNativeSelect(select, select.id);
                
                // Mostra il select nativo
                select.classList.remove('slim-select-initializing');
                select.classList.add('slim-select-ready');
            }
        });
    }

    assignDynamicSearchInputId(input, index, attempts) {
        let selectContext = 'dynamic';
        const parentContainer = input.closest('.ss-main');
        
        if (parentContainer) {
            const previousSelect = parentContainer.previousElementSibling;
            if (previousSelect && previousSelect.id) {
                selectContext = previousSelect.id;
            }
        }
        
        const uniqueId = `${selectContext}_dynamic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${attempts}_${index}`;
        input.id = uniqueId;
        input.name = uniqueId;
        input.setAttribute('aria-label', `Campo di ricerca dinamico per ${selectContext}`);
        input.setAttribute('autocomplete', 'off');
    }

    fallbackToNativeSelect(selectElement, selectId) {
        // Fallback a select nativo in caso di errore
        
        // Rimuovi classi Slim Select e aggiungi Bootstrap
        selectElement.classList.remove('form-control');
        selectElement.classList.add('form-select');
        
        // Applica styling nativo
        selectElement.style.height = '42px';
        selectElement.style.minHeight = '42px';
        
        // Notifica all'utente (opzionale)
        const notification = document.createElement('div');
        notification.className = 'alert alert-warning alert-dismissible fade show mt-2';
        notification.innerHTML = `
            <small>
                <i class="fas fa-info-circle"></i> 
                Select semplificato attivo per ${selectId}
                <button type="button" class="btn-close btn-close-sm ms-auto" data-bs-dismiss="alert"></button>
            </small>
        `;
        
        selectElement.parentNode.insertBefore(notification, selectElement.nextSibling);
        
        // Auto-rimuovi notifica dopo 5 secondi
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    // Performance monitoring
    measurePerformance() {
        const performanceData = {
            instances: this.instances.size,
            memoryUsage: this.estimateMemoryUsage(),
            initTime: Date.now() - this.initStartTime
        };
        
        return performanceData;
    }

    estimateMemoryUsage() {
        // Stima approssimativa dell'uso memoria
        let estimated = 0;
        this.instances.forEach((instance, key) => {
            estimated += 50; // ~50KB per istanza stimata
        });
        return `${estimated}KB (stimato)`;
    }

    // Metodi pubblici per controllo esterno
    getInstance(selectId) {
        return this.instances.get(selectId);
    }

    getAllInstances() {
        return new Map(this.instances);
    }

    reinitialize() {
        this.destroy();
        this.instances.clear();
        setTimeout(() => this.initializeSlimSelects(), 100);
    }

    destroy() {
        this.instances.forEach((instance, key) => {
            try {
                if (instance && typeof instance.destroy === 'function') {
                    instance.destroy();
                }
            } catch (error) {
                console.warn(`[EVENTI] Errore distruzione ${key}:`, error);
            }
        });
        this.instances.clear();
    }

    // Validazione stato
    validateInstances() {
        const validation = {
            total: this.instances.size,
            healthy: 0,
            errors: []
        };

        this.instances.forEach((instance, key) => {
            try {
                if (instance && instance.data) {
                    validation.healthy++;
                } else {
                    validation.errors.push(`${key}: istanza non valida`);
                }
            } catch (error) {
                validation.errors.push(`${key}: ${error.message}`);
            }
        });

        return validation;
    }
}

// Inizializzazione automatica
window.eventiSlimSelectInitializer = new EventiSlimSelectInitializer();


// Export per utilizzo modulare
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventiSlimSelectInitializer;
}