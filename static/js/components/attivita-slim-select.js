/**
 * ========================================
 * TALON - Attività Slim Select
 * File: static/js/components/attivita-slim-select.js
 * 
 * Versione: 1.0.0
 * Descrizione: Inizializzazione Slim Select avanzato per dropdown attività
 * Dependencies: SlimSelect library
 * Pattern: Ispirato a eventi-slim-select-initializer.js
 * ========================================
 */

class AttivitaSlimSelect {
    constructor() {
        this.instances = new Map();
        this.config = {
            defaultSettings: {
                showSearch: true,
                searchPlaceholder: 'Cerca...',
                searchText: 'Nessun elemento trovato',
                placeholderText: 'Seleziona...', // Placeholder generico
                searchHighlight: true,
                closeOnSelect: true,
                allowDeselect: true,
                openPosition: 'auto', // Apertura intelligente in base allo spazio disponibile
                contentPosition: 'absolute', // Posizionamento assoluto per controllo migliore
                hideSelected: false // Non nascondere le opzioni selezionate
            }
        };
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeAllSelects());
        } else {
            this.initializeAllSelects();
        }
    }

    async initializeAllSelects() {
        
        // Attendi che SlimSelect sia disponibile con retry più robusto
        let attempts = 0;
        const maxAttempts = 50; // 5 secondi max
        
        while (typeof SlimSelect === 'undefined' && attempts < maxAttempts) {
            console.warn(`⚠️ SlimSelect non disponibile, tentativo ${attempts + 1}/${maxAttempts}...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // Aumentato da 100ms a 500ms
            attempts++;
        }
        
        if (typeof SlimSelect === 'undefined') {
            console.error('❌ SlimSelect non disponibile dopo', maxAttempts, 'tentativi. Fallback a select normali.');
            this.fallbackToNormalSelects();
            return;
        }

        // Trova tutti i select direttamente (come nel template eventi)
        const selectsToInitialize = [
            '#ente_svolgimento_id',
            '#tipologia_id', 
            '#operazione_id',
            '#esercitazione_id',
            '#partenza_id',
            '#destinazione_id',
            '#tipo_vettore',
            '#tipo_vettore_stratevac'
        ];
        
        let initializedCount = 0;
        for (const selector of selectsToInitialize) {
            const select = document.querySelector(selector);
            if (select) {
                await this.initializeSelect(select);
                initializedCount++;
            } else {
                console.error('❌ Select non trovato:', selector);
            }
        }

        
        // Applica fix styling dopo l'inizializzazione per evitare problemi di rendering
        setTimeout(() => {
            this.applyGlobalStylesAndFixes();
        }, 200); // Delay maggiore per stabilità
    }

    async initializeSelect(element) {
        let selectElement;
        let selectId;
        
        // Gestione corretta dell'input: può essere un DIV container o un SELECT diretto
        if (element.classList && element.classList.contains('searchable-select')) {
            // È un DIV container, cerca il select dentro e usa data-select-id
            selectElement = element.querySelector('select');
            selectId = element.getAttribute('data-select-id');
        } else if (element.tagName === 'SELECT') {
            // È già un select
            selectElement = element;
            selectId = element.id;
        } else {
            // Fallback: prova a usare come originalSelect per compatibilità
            selectElement = element;
            selectId = element.id;
        }
        
        if (!selectElement) {
            return;
        }
        
        if (!selectId) {
            return;
        }


        try {
            // Ottieni la configurazione specifica per questo select
            const config = this.getSelectConfig(selectId, selectElement);
            
            
            // Usa la struttura CORRETTA dalla documentazione Context7
            // NON passare 'data' - lascia che SlimSelect legga dall'HTML
            const slimInstance = new SlimSelect({
                select: '#' + selectId,
                settings: config.settings,    // Oggetto diretto settings  
                events: {
                    ...config.events,
                    afterOpen: () => {
                        const content = document.querySelector(`[data-id="${slimInstance.settings.id}"].ss-content`);
                        if (!content) {
                            console.error('❌ Dropdown content non trovato per:', selectId);
                        }
                    }
                }
            });

            // Salva istanza per cleanup
            this.instances.set(selectId, slimInstance);
            
            // RIMOSSO: Reset selezione - mantiene i valori persistenti dall'HTML
            // slimInstance.setSelected([]);
            
            
        } catch (error) {
            console.error('❌ Errore inizializzazione SlimSelect:', selectId, error);
        }
    }

    getSelectConfig(selectId, originalSelect) {
        const baseSettings = { ...this.config.defaultSettings };
        let customEvents = {};

        // Configurazioni specifiche per tipo di select
        switch (selectId) {
            case 'ente_svolgimento_id':
                customEvents.searchFilter = this.createEntiSearchFilter();
                baseSettings.searchPlaceholder = 'Cerca per nome, codice o indirizzo...';
                baseSettings.placeholderText = 'Seleziona ente che svolge l\'attività';
                break;
                
            case 'partenza_id':
                customEvents.searchFilter = this.createEntiSearchFilter();
                baseSettings.searchPlaceholder = 'Cerca luogo di partenza...';
                baseSettings.placeholderText = 'Seleziona luogo partenza (opzionale)';
                break;
                
            case 'destinazione_id':
                customEvents.searchFilter = this.createEntiSearchFilter();
                baseSettings.searchPlaceholder = 'Cerca luogo di destinazione...';
                baseSettings.placeholderText = 'Seleziona luogo destinazione (opzionale)';
                break;
                
            case 'ente_appartenenza':
                customEvents.searchFilter = this.createEntiSearchFilter();
                baseSettings.searchPlaceholder = 'Cerca ente di appartenenza...';
                baseSettings.placeholderText = 'Seleziona ente di appartenenza';
                break;
                
            case 'tipologia_id':
                baseSettings.searchPlaceholder = 'Cerca tipologia attività...';
                baseSettings.placeholderText = 'Seleziona tipologia attività';
                break;
                
            case 'operazione_id':
                baseSettings.searchPlaceholder = 'Cerca operazione...';
                baseSettings.placeholderText = 'Seleziona operazione (opzionale)';
                customEvents.afterChange = (newVal) => {
                    if (newVal && newVal[0]?.value === 'new') {
                        this.handleAddNewOption(selectId, newVal[0].value);
                    }
                };
                break;
                
            case 'esercitazione_id':
                baseSettings.searchPlaceholder = 'Cerca esercitazione...';
                baseSettings.placeholderText = 'Seleziona esercitazione (opzionale)';
                customEvents.afterChange = (newVal) => {
                    if (newVal && newVal[0]?.value === 'new') {
                        this.handleAddNewOption(selectId, newVal[0].value);
                    }
                };
                break;
                
            case 'tipo_vettore':
            case 'tipo_vettore_stratevac':
                baseSettings.searchPlaceholder = 'Cerca tipo vettore...';
                baseSettings.placeholderText = 'Seleziona tipo vettore';
                customEvents.afterChange = (newVal) => {
                    // Integrazione con VettoreDecoder se disponibile
                    if (window.VettoreDecoder && newVal && newVal[0]?.value) {
                        const decoded = window.VettoreDecoder.decode(newVal[0].value);
                        if (decoded) {
                            console.log('🚁 Vettore decodificato:', decoded);
                        }
                    }
                };
                break;
        }

        return {
            settings: baseSettings,
            events: customEvents
        };
    }

    buildDataArray(selectElement, selectId) {
        const dataArray = [];
        const options = selectElement.querySelectorAll('option');
        
        options.forEach(option => {
            // Include placeholder options (disabled senza valore)
            const isPlaceholder = option.disabled && !option.value;
            
            const optionData = {
                text: option.textContent.trim(),
                value: option.value,
                selected: option.selected, // Rispetta la selezione originale del HTML
                disabled: option.disabled,
                placeholder: isPlaceholder
            };
            
            // HTML personalizzato per enti (nome + indirizzo)
            if (this.isEnteSelect(selectId)) {
                optionData.html = this.createEnteOptionHtml(option);
                optionData.data = {
                    codice: option.getAttribute('data-codice') || '',
                    indirizzo: option.getAttribute('data-indirizzo') || '',
                    tipo: option.getAttribute('data-tipo') || ''
                };
            }
            
            // HTML personalizzato per operazioni/esercitazioni
            if (this.isOperazioneEsercitazioneSelect(selectId)) {
                optionData.html = this.createOperazioneEsercitazioneHtml(option);
                optionData.data = this.extractOperazioneEsercitazioneData(option);
            }
            
            dataArray.push(optionData);
        });
        
        return dataArray;
    }

    isEnteSelect(selectId) {
        return ['ente_svolgimento_id', 'partenza_id', 'destinazione_id', 'ente_appartenenza'].includes(selectId);
    }

    isOperazioneEsercitazioneSelect(selectId) {
        return ['operazione_id', 'esercitazione_id'].includes(selectId);
    }

    createEnteOptionHtml(option) {
        const nomeEnte = option.textContent.trim();
        const indirizzo = option.getAttribute('data-indirizzo') || '';
        const codice = option.getAttribute('data-codice') || '';
        
        if (!indirizzo && !codice) {
            return nomeEnte;
        }
        
        return `
            <div style="font-size: 15px; font-weight: 500; text-transform: uppercase; line-height: 1.3; margin-bottom: 4px; color: #343a40;">
                ${nomeEnte}
            </div>
            <div style="font-size: 11px; font-weight: 400; font-style: italic; line-height: 1.2; color: #6c757d; opacity: 0.85;">
                ${codice ? `[${codice}] ` : ''}${indirizzo}
            </div>
        `;
    }

    createOperazioneEsercitazioneHtml(option) {
        const nome = option.textContent.trim();
        const details = option.getAttribute('data-details') || '';
        const isTemp = option.getAttribute('data-temp') === 'true';
        
        if (option.value === 'new') {
            return `<div style="font-style: italic; color: #007bff; font-weight: bold;">${nome}</div>`;
        }
        
        if (!details) {
            return nome;
        }
        
        const tempBadge = isTemp ? '<span style="color: #856404; font-size: 10px;">[TEMP]</span> ' : '';
        
        return `
            <div style="font-size: 14px; font-weight: 500; line-height: 1.3; margin-bottom: 2px;">
                ${tempBadge}${nome.replace(/^\[TEMP\]\s*/, '')}
            </div>
            <div style="font-size: 11px; font-style: italic; color: #6c757d;">
                ${details.replace(/^\[NON VALIDATA\]\s*/, '')}
            </div>
        `;
    }

    extractOperazioneEsercitazioneData(option) {
        return {
            temp: option.getAttribute('data-temp') === 'true',
            nome_missione: option.getAttribute('data-nome-missione') || '',
            nome_breve: option.getAttribute('data-nome-breve') || '',
            teatro_operativo: option.getAttribute('data-teatro-operativo') || '',
            nazione: option.getAttribute('data-nazione') || '',
            nome: option.getAttribute('data-nome') || '',
            anno: option.getAttribute('data-anno') || ''
        };
    }

    createEntiSearchFilter() {
        return (option, search) => {
            const searchLower = search.toLowerCase();
            const text = option.text.toLowerCase();
            const data = option.data || {};
            
            return text.includes(searchLower) || 
                   (data.codice && data.codice.toLowerCase().includes(searchLower)) || 
                   (data.indirizzo && data.indirizzo.toLowerCase().includes(searchLower));
        };
    }

    // Rimosso applyCustomStyling - nessun styling inline via JavaScript

    handleAddNewOption(selectId, value) {
        if (selectId === 'operazione_id' && window.openModal) {
            window.openModal('modal-nuova-operazione');
        } else if (selectId === 'esercitazione_id' && window.openModal) {
            window.openModal('modal-nuova-esercitazione');
        }
        
        // Reset selezione
        const instance = this.instances.get(selectId);
        if (instance) {
            instance.setSelected('');
        }
    }

    // Metodo per inizializzare select in un container specifico (per lazy loading)
    async initializeSelectsInContainer(container) {
        const selectContainers = container.querySelectorAll('.searchable-select[data-select-id]');
        
        if (selectContainers.length === 0) {
            return;
        }
        
        for (const selectContainer of selectContainers) {
            // Verifica che il container abbia la struttura corretta
            const selectElement = selectContainer.querySelector('select');
            const selectId = selectContainer.getAttribute('data-select-id');
            
            if (selectElement && selectId) {
                await this.initializeSelect(selectContainer);
            }
        }
        
    }

    // Metodi pubblici
    getInstance(selectId) {
        return this.instances.get(selectId);
    }

    destroyInstance(selectId) {
        const instance = this.instances.get(selectId);
        if (instance) {
            instance.destroy();
            this.instances.delete(selectId);
            console.log('🗑️ SlimSelect distrutto:', selectId);
        }
    }

    refreshInstance(selectId) {
        this.destroyInstance(selectId);
        const select = document.getElementById(selectId);
        if (select) {
            this.initializeSelect(select);
        }
    }

    // Fallback per select normali se SlimSelect non disponibile
    fallbackToNormalSelects() {
        const selectsToInitialize = [
            '#ente_svolgimento_id',
            '#tipologia_id', 
            '#operazione_id',
            '#esercitazione_id',
            '#partenza_id',
            '#destinazione_id',
            '#tipo_vettore',
            '#tipo_vettore_stratevac'
        ];
        
        selectsToInitialize.forEach(selector => {
            const select = document.querySelector(selector);
            if (select) {
                // Solo aggiunge classe CSS - nessun styling inline
                select.classList.add('form-control');
                
            }
        });
        
    }

    applyGlobalStylesAndFixes() {
        // Fix altezza dropdown content per visualizzare le opzioni
        const style = document.createElement('style');
        style.textContent = `
            .ss-content {
                max-height: 600px !important;
                min-height: 300px !important;
            }
            .ss-content .ss-list {
                max-height: 560px !important;
                overflow-y: auto !important;
            }
        `;
        document.head.appendChild(style);
    }

    getInstancesStatus() {
        return {
            count: this.instances.size,
            instances: Array.from(this.instances.keys())
        };
    }
}

// Inizializzazione automatica
const attivitaSlimSelect = new AttivitaSlimSelect();

// Fix aggiuntivi per problemi di rendering dopo eventi
window.addEventListener('resize', () => {
    // Re-applica fix dopo resize per evitare problemi di visualizzazione
    setTimeout(() => {
        if (attivitaSlimSelect && typeof attivitaSlimSelect.applyGlobalStylesAndFixes === 'function') {
            attivitaSlimSelect.applyGlobalStylesAndFixes();
        }
    }, 100);
});

// Nessun fix manuale - lascia che SlimSelect gestisca gli eventi

// Export globale
window.TalonAttivitaSlimSelect = attivitaSlimSelect;