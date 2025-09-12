/**
 * ========================================
 * TALON - Attività Slim Select Initializer
 * File: static/js/components/attivita-slim-select-initializer.js
 * 
 * Versione: 1.0.0
 * Descrizione: Gestione inizializzazione Slim Select per form attività
 * Dependencies: Slim Select
 * Pattern: Basato su eventi-slim-select-initializer.js
 * ========================================
 */

class AttivitaSlimSelectInitializer {
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
                this.initializeSlimSelects();
            });
        } else {
            this.initializeSlimSelects();
        }
    }

    // Metodi di placeholder rimossi per allinearsi con eventi

    showInitializedSelects() {
        // Mostra i select inizializzati come eventi
        const selectsToInitialize = [
            'ente_svolgimento_id',
            'tipologia_id', 
            'operazione_id',
            'esercitazione_id',
            'partenza_id',
            'destinazione_id'
        ];
        
        selectsToInitialize.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select && this.instances.has(selectId)) {
                // Trova il container Slim Select creato
                const slimContainer = select.parentNode.querySelector('.ss-main');
                if (slimContainer) {
                    // Applica classi direttamente al .ss-main come eventi
                    slimContainer.classList.add('talon-slim-select', 'slim-select-ready');
                    
                    // Rimuovi classe di inizializzazione dal select originale
                    select.classList.remove('slim-select-initializing');
                    select.classList.add('slim-select-ready');
                }
            }
        });
    }

    initializeSlimSelects() {
        // Verifica disponibilità Slim Select con retry limitato
        if (typeof SlimSelect === 'undefined') {
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.warn(`[ATTIVITA] SlimSelect non disponibile, riprovo ${this.retryCount}/${this.maxRetries} tra 500ms`);
                setTimeout(() => this.initializeSlimSelects(), 500);
                return;
            } else {
                console.error('[ATTIVITA] SlimSelect non disponibile dopo tutti i tentativi, uso fallback nativo');
                this.initializeNativeFallbacks();
                return;
            }
        }

        // Reset retry counter on success
        this.retryCount = 0;

        // TEST - Inizializza SOLO ente_svolgimento_id
        console.log('[ATTIVITA] 🔍 TEST MODE - Inizializzo SOLO ente_svolgimento_id');
        this.initializeEnteSelect();
        
        // Altri select disabilitati temporaneamente per il test
        // this.initializeTipologiaSelect();
        // this.initializeOperazioneSelect();
        // this.initializeEsercitazioneSelect();
        // this.initializePartenzaSelect();
        // this.initializeDestinazioneSelect();
        
        // NO STYLING EXTRA - Test configurazione minima
        console.log('[ATTIVITA] 🔍 Inizializzazione completata - nessun styling extra applicato');
        
        // Performance measurement
        setTimeout(() => this.measurePerformance(), 500);
    }

    initializeEnteSelect() {
        const enteSelect = document.getElementById('ente_svolgimento_id');
        if (!enteSelect) {
            console.warn('[ATTIVITA] Elemento ente_svolgimento_id non trovato');
            return;
        }

        console.log('[ATTIVITA] 🔍 Inizializzazione SEMPLIFICATA ente_svolgimento_id');
        console.log('[ATTIVITA] 🔍 SlimSelect disponibile?', typeof SlimSelect);

        try {
            // CONFIGURAZIONE MINIMA PER TEST
            const slimInstance = new SlimSelect({
                select: '#ente_svolgimento_id'
            });
            
            this.instances.set('ente_svolgimento_id', slimInstance);
            console.log('[ATTIVITA] ✅ SlimSelect inizializzato con configurazione MINIMA: ente_svolgimento_id');
            
        } catch (error) {
            console.error('[ATTIVITA] ❌ Errore inizializzazione ente_svolgimento_id:', error);
            console.error('[ATTIVITA] ❌ Stack trace:', error.stack);
            this.fallbackToNativeSelect(enteSelect, 'ente_svolgimento_id');
        }
    }

    initializeTipologiaSelect() {
        const tipologiaSelect = document.getElementById('tipologia_id');
        if (!tipologiaSelect) {
            console.warn('[ATTIVITA] Elemento tipologia_id non trovato');
            return;
        }

        try {
            const slimInstance = new SlimSelect({
                select: '#tipologia_id',
                settings: {
                    showSearch: true,
                    searchPlaceholder: 'Cerca tipologia...',
                    searchText: 'Nessuna tipologia trovata',
                    placeholderText: 'Seleziona tipologia attività',
                    closeOnSelect: true,
                    allowDeselect: false,
                    openPosition: 'auto'
                }
            });
            
            this.instances.set('tipologia_id', slimInstance);
            console.log('[ATTIVITA] ✅ SlimSelect inizializzato: tipologia_id');
            
        } catch (error) {
            console.error('[ATTIVITA] ❌ Errore inizializzazione tipologia_id:', error);
            this.fallbackToNativeSelect(tipologiaSelect, 'tipologia_id');
        }
    }

    initializeOperazioneSelect() {
        const operazioneSelect = document.getElementById('operazione_id');
        if (!operazioneSelect) {
            console.warn('[ATTIVITA] Elemento operazione_id non trovato');
            return;
        }

        try {
            const slimInstance = new SlimSelect({
                select: '#operazione_id',
                data: this.buildOperazioneDataWithHTML(operazioneSelect),
                settings: {
                    showSearch: true,
                    searchPlaceholder: 'Cerca operazione, missione, teatro...',
                    searchText: 'Nessuna operazione trovata',
                    placeholderText: 'Seleziona operazione (opzionale)',
                    closeOnSelect: true,
                    allowDeselect: true,
                    openPosition: 'auto',
                    searchHighlight: true,
                    hideSelectedOption: false,
                    showOptionTooltips: true
                },
                events: {
                    searchFilter: (option, search) => {
                        const text = option.text.toLowerCase();
                        const searchLower = search.toLowerCase();
                        
                        if (option.data) {
                            const nomeMissione = (option.data.nome_missione || '').toLowerCase();
                            const nomeBreve = (option.data.nome_breve || '').toLowerCase();
                            const teatro = (option.data.teatro_operativo || '').toLowerCase();
                            const nazione = (option.data.nazione || '').toLowerCase();
                            
                            return text.includes(searchLower) || 
                                   nomeMissione.includes(searchLower) ||
                                   nomeBreve.includes(searchLower) ||
                                   teatro.includes(searchLower) ||
                                   nazione.includes(searchLower);
                        }
                        
                        return text.includes(searchLower);
                    }
                }
            });
            
            this.instances.set('operazione_id', slimInstance);
            console.log('[ATTIVITA] ✅ SlimSelect inizializzato: operazione_id');
            
        } catch (error) {
            console.error('[ATTIVITA] ❌ Errore inizializzazione operazione_id:', error);
            this.fallbackToNativeSelect(operazioneSelect, 'operazione_id');
        }
    }

    initializeEsercitazioneSelect() {
        const esercitazioneSelect = document.getElementById('esercitazione_id');
        if (!esercitazioneSelect) {
            console.warn('[ATTIVITA] Elemento esercitazione_id non trovato');
            return;
        }

        try {
            const slimInstance = new SlimSelect({
                select: '#esercitazione_id',
                data: this.buildEsercitazioneDataWithHTML(esercitazioneSelect),
                settings: {
                    showSearch: true,
                    searchPlaceholder: 'Cerca esercitazione, nome breve, anno...',
                    searchText: 'Nessuna esercitazione trovata',
                    placeholderText: 'Seleziona esercitazione (opzionale)',
                    closeOnSelect: true,
                    allowDeselect: true,
                    openPosition: 'auto',
                    searchHighlight: true,
                    hideSelectedOption: false,
                    showOptionTooltips: true
                },
                events: {
                    searchFilter: (option, search) => {
                        const text = option.text.toLowerCase();
                        const searchLower = search.toLowerCase();
                        
                        if (option.data) {
                            const nomeBreve = (option.data.nome_breve || '').toLowerCase();
                            const anno = (option.data.anno || '').toString().toLowerCase();
                            
                            return text.includes(searchLower) || 
                                   nomeBreve.includes(searchLower) ||
                                   anno.includes(searchLower);
                        }
                        
                        return text.includes(searchLower);
                    }
                }
            });
            
            this.instances.set('esercitazione_id', slimInstance);
            console.log('[ATTIVITA] ✅ SlimSelect inizializzato: esercitazione_id');
            
        } catch (error) {
            console.error('[ATTIVITA] ❌ Errore inizializzazione esercitazione_id:', error);
            this.fallbackToNativeSelect(esercitazioneSelect, 'esercitazione_id');
        }
    }

    initializePartenzaSelect() {
        const partenzaSelect = document.getElementById('partenza_id');
        if (!partenzaSelect) {
            console.warn('[ATTIVITA] Elemento partenza_id non trovato');
            return;
        }

        try {
            const slimInstance = new SlimSelect({
                select: '#partenza_id',
                data: this.buildLuoghiDataWithHTML(partenzaSelect),
                settings: {
                    showSearch: true,
                    searchPlaceholder: 'Cerca luogo, codice, nazione...',
                    searchText: 'Nessun luogo trovato',
                    placeholderText: 'Seleziona luogo partenza (opzionale)',
                    closeOnSelect: true,
                    allowDeselect: true,
                    openPosition: 'auto',
                    searchHighlight: true,
                    hideSelectedOption: false,
                    showOptionTooltips: true
                },
                events: {
                    searchFilter: (option, search) => {
                        const text = option.text.toLowerCase();
                        const searchLower = search.toLowerCase();
                        
                        if (option.data) {
                            const codice = (option.data.codice || '').toLowerCase();
                            const indirizzo = (option.data.indirizzo || '').toLowerCase();
                            const nazione = (option.data.nazione || '').toLowerCase();
                            const tipo = (option.data.tipo || '').toLowerCase();
                            
                            return text.includes(searchLower) || 
                                   codice.includes(searchLower) ||
                                   indirizzo.includes(searchLower) ||
                                   nazione.includes(searchLower) ||
                                   tipo.includes(searchLower);
                        }
                        
                        return text.includes(searchLower);
                    }
                }
            });
            
            this.instances.set('partenza_id', slimInstance);
            console.log('[ATTIVITA] ✅ SlimSelect inizializzato: partenza_id');
            
        } catch (error) {
            console.error('[ATTIVITA] ❌ Errore inizializzazione partenza_id:', error);
            this.fallbackToNativeSelect(partenzaSelect, 'partenza_id');
        }
    }

    initializeDestinazioneSelect() {
        const destinazioneSelect = document.getElementById('destinazione_id');
        if (!destinazioneSelect) {
            console.warn('[ATTIVITA] Elemento destinazione_id non trovato');
            return;
        }

        try {
            const slimInstance = new SlimSelect({
                select: '#destinazione_id',
                data: this.buildLuoghiDataWithHTML(destinazioneSelect),
                settings: {
                    showSearch: true,
                    searchPlaceholder: 'Cerca luogo, codice, nazione...',
                    searchText: 'Nessun luogo trovato',
                    placeholderText: 'Seleziona luogo destinazione (opzionale)',
                    closeOnSelect: true,
                    allowDeselect: true,
                    openPosition: 'auto',
                    searchHighlight: true,
                    hideSelectedOption: false,
                    showOptionTooltips: true
                },
                events: {
                    searchFilter: (option, search) => {
                        const text = option.text.toLowerCase();
                        const searchLower = search.toLowerCase();
                        
                        if (option.data) {
                            const codice = (option.data.codice || '').toLowerCase();
                            const indirizzo = (option.data.indirizzo || '').toLowerCase();
                            const nazione = (option.data.nazione || '').toLowerCase();
                            const tipo = (option.data.tipo || '').toLowerCase();
                            
                            return text.includes(searchLower) || 
                                   codice.includes(searchLower) ||
                                   indirizzo.includes(searchLower) ||
                                   nazione.includes(searchLower) ||
                                   tipo.includes(searchLower);
                        }
                        
                        return text.includes(searchLower);
                    }
                }
            });
            
            this.instances.set('destinazione_id', slimInstance);
            console.log('[ATTIVITA] ✅ SlimSelect inizializzato: destinazione_id');
            
        } catch (error) {
            console.error('[ATTIVITA] ❌ Errore inizializzazione destinazione_id:', error);
            this.fallbackToNativeSelect(destinazioneSelect, 'destinazione_id');
        }
    }

    buildEnteDataWithHTML() {
        const enteSelect = document.getElementById('ente_svolgimento_id');
        if (!enteSelect) return [];
        
        const data = [];
        const options = enteSelect.querySelectorAll('option');
        
        options.forEach(option => {
            if (option.value === '') {
                // Opzione placeholder come eventi
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

    buildOperazioneDataWithHTML(selectElement) {
        if (!selectElement) return [];
        
        const data = [];
        const options = selectElement.querySelectorAll('option');
        
        options.forEach(option => {
            if (option.value === '') {
                // Opzione placeholder - include nel data array
                data.push({
                    text: option.textContent,
                    value: '',
                    placeholder: true
                });
            } else {
                const nome = option.textContent.trim();
                const nomeBreve = option.getAttribute('data-nome-breve') || '';
                const nomeMissione = option.getAttribute('data-nome-missione') || '';
                const teatroOperativo = option.getAttribute('data-teatro-operativo') || '';
                const nazione = option.getAttribute('data-nazione') || '';
                
                // Costruisci HTML con dettagli operazione
                let html = nome;
                const details = [];
                if (nomeBreve) details.push(nomeBreve);
                if (teatroOperativo) details.push(teatroOperativo);
                if (nazione) details.push(nazione);
                
                if (details.length > 0) {
                    html += `<span style="margin: 0 0.3em;"> - </span><span style="font-size: 0.85em; font-style: italic; color: #666; vertical-align: top; display: inline-block; transform: translateY(0.25em);">${details.join(' - ')}</span>`;
                }
                
                data.push({
                    text: nome,
                    html: html,
                    value: option.value,
                    data: {
                        nome: nome,
                        nome_breve: nomeBreve,
                        nome_missione: nomeMissione,
                        teatro_operativo: teatroOperativo,
                        nazione: nazione
                    }
                });
            }
        });
        
        return data;
    }

    buildEsercitazioneDataWithHTML(selectElement) {
        if (!selectElement) return [];
        
        const data = [];
        const options = selectElement.querySelectorAll('option');
        
        options.forEach(option => {
            if (option.value === '') {
                // Opzione placeholder - include nel data array
                data.push({
                    text: option.textContent,
                    value: '',
                    placeholder: true
                });
            } else {
                const nome = option.textContent.trim();
                const nomeBreve = option.getAttribute('data-nome-breve') || '';
                const anno = option.getAttribute('data-anno') || '';
                
                // Costruisci HTML con dettagli esercitazione
                let html = nome;
                const details = [];
                if (nomeBreve) details.push(nomeBreve);
                if (anno) details.push(anno);
                
                if (details.length > 0) {
                    html += `<span style="margin: 0 0.3em;"> - </span><span style="font-size: 0.85em; font-style: italic; color: #666; vertical-align: top; display: inline-block; transform: translateY(0.25em);">${details.join(' - ')}</span>`;
                }
                
                data.push({
                    text: nome,
                    html: html,
                    value: option.value,
                    data: {
                        nome: nome,
                        nome_breve: nomeBreve,
                        anno: anno
                    }
                });
            }
        });
        
        return data;
    }

    buildLuoghiDataWithHTML(selectElement) {
        if (!selectElement) return [];
        
        const data = [];
        const options = selectElement.querySelectorAll('option');
        const optgroups = selectElement.querySelectorAll('optgroup');
        
        if (optgroups.length > 0) {
            // Gestione con optgroup
            optgroups.forEach(optgroup => {
                const groupData = {
                    label: optgroup.label,
                    options: []
                };
                
                const groupOptions = optgroup.querySelectorAll('option');
                groupOptions.forEach(option => {
                    if (option.value !== '') {
                        const nome = option.textContent.trim();
                        const indirizzo = option.getAttribute('data-indirizzo') || '';
                        const codice = option.getAttribute('data-codice') || '';
                        
                        let html = nome;
                        if (indirizzo) {
                            html += `<span style="margin: 0 0.3em;"> - </span><span style="font-size: 0.85em; font-style: italic; color: #666;">${indirizzo}</span>`;
                        }
                        
                        groupData.options.push({
                            text: nome,
                            html: html,
                            value: option.value,
                            data: {
                                codice: codice,
                                indirizzo: indirizzo,
                                nome: nome,
                                nazione: option.getAttribute('data-nazione') || '',
                                tipo: option.getAttribute('data-tipo') || ''
                            }
                        });
                    }
                });
                
                if (groupData.options.length > 0) {
                    data.push(groupData);
                }
            });
        } else {
            // Gestione normale senza optgroup - include placeholder
            options.forEach(option => {
                if (option.value === '') {
                    // Opzione placeholder - include nel data array
                    data.push({
                        text: option.textContent,
                        value: '',
                        placeholder: true
                    });
                } else {
                    const nome = option.textContent.trim();
                    const indirizzo = option.getAttribute('data-indirizzo') || '';
                    const codice = option.getAttribute('data-codice') || '';
                    
                    let html = nome;
                    if (indirizzo) {
                        html += `<span style="margin: 0 0.3em;"> - </span><span style="font-size: 0.85em; font-style: italic; color: #666;">${indirizzo}</span>`;
                    }
                    
                    data.push({
                        text: nome,
                        html: html,
                        value: option.value,
                        data: {
                            codice: codice,
                            indirizzo: indirizzo,
                            nome: nome,
                            nazione: option.getAttribute('data-nazione') || '',
                            tipo: option.getAttribute('data-tipo') || ''
                        }
                    });
                }
            });
        }
        
        return data;
    }

    fallbackToNativeSelect(selectElement, selectId) {
        console.log(`[ATTIVITA] 🔄 Fallback a select nativo per: ${selectId}`);
        
        if (selectElement) {
            // Rimuovi classi di inizializzazione
            selectElement.classList.remove('slim-select-initializing');
            selectElement.classList.add('form-control');
            
            // Assicurati che sia visibile
            selectElement.style.display = '';
            selectElement.style.visibility = 'visible';
            selectElement.style.opacity = '1';
        }
    }

    initializeNativeFallbacks() {
        const selectsToFallback = [
            'ente_svolgimento_id',
            'tipologia_id', 
            'operazione_id',
            'esercitazione_id',
            'partenza_id',
            'destinazione_id'
        ];
        
        selectsToFallback.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                // Applica fallback nativo
                this.fallbackToNativeSelect(select, selectId);
                
                // Mostra il select nativo
                select.classList.remove('slim-select-initializing');
                select.classList.add('slim-select-ready');
            }
        });
        
        console.log('[ATTIVITA] 🔄 Tutti i select configurati come nativi');
    }

    applyStylesAndFixes() {
        // Applica classi CSS direttamente al .ss-main come eventi
        setTimeout(() => {
            this.applyStyling();
        }, 500);
    }

    applyStyling() {
        // Applica styling direttamente al .ss-main come eventi
        this.instances.forEach((instance, selectId) => {
            const select = document.getElementById(selectId);
            if (select) {
                const slimContainer = select.parentNode.querySelector('.ss-main');
                if (slimContainer) {
                    // Applica la classe direttamente al .ss-main come eventi
                    slimContainer.classList.add('talon-slim-select');
                }
            }
        });
        
        console.log('[ATTIVITA] 🎨 Stili applicati ai select SlimSelect');
    }

    measurePerformance() {
        const endTime = Date.now();
        const duration = endTime - this.initStartTime;
        const initializedCount = this.instances.size;
        
        console.log(`[ATTIVITA] ⚡ Performance - ${initializedCount} select inizializzati in ${duration}ms`);
    }

    // Metodi pubblici per accesso esterno
    getInstance(selectId) {
        return this.instances.get(selectId);
    }

    getAllInstances() {
        return this.instances;
    }

    refreshInstance(selectId) {
        const instance = this.instances.get(selectId);
        if (instance) {
            instance.destroy();
            this.instances.delete(selectId);
            
            // Re-inizializza
            setTimeout(() => {
                switch (selectId) {
                    case 'ente_svolgimento_id':
                        this.initializeEnteSelect();
                        break;
                    case 'tipologia_id':
                        this.initializeTipologiaSelect();
                        break;
                    case 'operazione_id':
                        this.initializeOperazioneSelect();
                        break;
                    case 'esercitazione_id':
                        this.initializeEsercitazioneSelect();
                        break;
                    case 'partenza_id':
                        this.initializePartenzaSelect();
                        break;
                    case 'destinazione_id':
                        this.initializeDestinazioneSelect();
                        break;
                }
            }, 100);
        }
    }

    destroy() {
        console.log('[ATTIVITA] 🗑️ Distruggendo tutte le istanze SlimSelect...');
        
        this.instances.forEach((instance, selectId) => {
            try {
                instance.destroy();
                console.log(`[ATTIVITA] ✅ Istanza distrutta: ${selectId}`);
            } catch (error) {
                console.error(`[ATTIVITA] ❌ Errore distruzione ${selectId}:`, error);
            }
        });
        
        this.instances.clear();
        console.log('[ATTIVITA] 🎯 Tutte le istanze SlimSelect distrutte');
    }
}

// Inizializzazione automatica
const attivitaSlimSelectInitializer = new AttivitaSlimSelectInitializer();

// Export globale per debugging e accesso esterno
window.TalonAttivitaSlimSelect = attivitaSlimSelectInitializer;

console.log('[ATTIVITA] 🚀 Attività Slim Select Initializer caricato');