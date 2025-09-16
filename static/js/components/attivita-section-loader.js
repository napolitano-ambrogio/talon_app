/**
 * ========================================
 * TALON - Attività Section Loader
 * File: static/js/components/attivita-section-loader.js
 * 
 * Versione: 1.0.0
 * Descrizione: Caricamento dinamico sezioni dettagli con lazy loading
 * Dependencies: AttivitaFormManager
 * ========================================
 */

class AttivitaSectionLoader {
    constructor() {
        this.loadedSections = new Set();
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        // Ascolta cambiamenti tipologia
        window.addEventListener('tipologia:changed', (e) => {
            this.handleTipologiaChange(e.detail);
        });

        // Ascolta quando il bundle attività è pronto
        window.addEventListener('attivitaBundle:ready', () => {
            console.log('📦 Bundle attività pronto');
        });

    }

    async handleTipologiaChange(detail) {
        const { tipologiaId, sectionId } = detail;
        
        console.log('🔄 handleTipologiaChange ricevuto:', { tipologiaId, sectionId });
        
        if (!sectionId) {
            console.log('⚠️ sectionId mancante, uscita anticipata');
            return;
        }

        // Sempre inizializza i componenti quando la sezione diventa attiva
        // anche se è già stata caricata in precedenza
        console.log('🔄 Inizializzazione componenti per sezione attiva:', sectionId);

        // Tenta caricamento lazy se necessario
        try {
            await this.loadSectionIfNeeded(sectionId, tipologiaId);
        } catch (error) {
            console.error('❌ Errore caricamento sezione:', sectionId, error);
        }
    }

    async loadSectionIfNeeded(sectionId, tipologiaId) {
        const section = document.getElementById(sectionId);
        
        console.log('🔍 Cercando sezione nel DOM:', sectionId);
        console.log('📄 Sezione trovata:', section ? 'SÌ' : 'NO');
        
        // Debug: mostra tutte le sezioni detail presenti
        const allDetailSections = document.querySelectorAll('.detail-section');
        console.log('📋 Sezioni detail nel DOM:', Array.from(allDetailSections).map(s => s.id));
        
        if (section) {
            // Sezione già presente nel DOM
            console.log('✅ Sezione trovata nel DOM, inizializzo componenti:', sectionId);
            
            // Sempre inizializza i componenti quando la sezione viene mostrata
            await this.initializeSectionComponents(section, sectionId);
            this.loadedSections.add(sectionId);
            return;
        }

        // Sezione non presente nel DOM - questo NON dovrebbe succedere
        console.error('💥 ERRORE: Sezione non trovata nel DOM! ID:', sectionId);
        console.error('Le sezioni dovrebbero essere già incluse staticamente nel template.');
        console.error('Verifica che l\'ID nella mappatura sia corretto.');
    }


    async initializeSectionComponents(section, sectionId) {
        // Applica maiuscole ai nuovi input
        if (window.TalonAttivitaFormManager) {
            window.TalonAttivitaFormManager.refreshUppercaseInputs();
        }

        // Inizializza searchable select nella sezione
        const searchableSelects = section.querySelectorAll('.searchable-select[data-select-id]');
        if (searchableSelects.length > 0 && window.TalonAttivitaSlimSelect) {
            await window.TalonAttivitaSlimSelect.initializeSelectsInContainer(section);
        }

        // Setup event listener specifici per sezione
        this.setupSectionSpecificListeners(section, sectionId);
        
    }

    setupSectionSpecificListeners(section, sectionId) {
        switch (sectionId) {
            case 'dettagli-stratevac':
                this.setupStratevacListeners(section);
                break;
            case 'dettagli-getra':
                this.setupGetraListeners(section);
                break;
            // Aggiungi altri setup specifici se necessario
        }
    }

    setupStratevacListeners(section) {
        const forzaArmataSelect = section.querySelector('#forza_armata');
        const enteSelectContainer = section.querySelector('#ente_appartenenza_select_container');
        const enteTextContainer = section.querySelector('#ente_appartenenza_text_container');
        
        if (forzaArmataSelect && enteSelectContainer && enteTextContainer) {
            forzaArmataSelect.addEventListener('change', function() {
                if (this.value === 'ESERCITO ITALIANO') {
                    enteSelectContainer.style.display = 'block';
                    enteTextContainer.style.display = 'none';
                    section.querySelector('#ente_appartenenza_testo').value = '';
                } else {
                    enteSelectContainer.style.display = 'none';
                    enteTextContainer.style.display = 'block';
                    section.querySelector('#ente_appartenenza').value = '';
                }
            });
        }
        
        // Setup per tipo vettore STRATEVAC
        const vettoreStratevacSelect = section.querySelector('#tipo_vettore_stratevac');
        if (vettoreStratevacSelect) {
            console.log('🚁 Setup listener per tipo_vettore_stratevac in sezione STRATEVAC');
            
            // Inizializza SlimSelect per il vettore STRATEVAC se non già fatto
            if (window.TalonAttivitaSlimSelect && !window.TalonAttivitaSlimSelect.getInstance('tipo_vettore_stratevac')) {
                window.TalonAttivitaSlimSelect.initializeSelect(vettoreStratevacSelect);
                console.log('✅ SlimSelect inizializzato per tipo_vettore_stratevac nella sezione STRATEVAC');
            }
            
            // Integrazione con VettoreDecoder
            if (window.VettoreDecoder) {
                vettoreStratevacSelect.addEventListener('change', function(e) {
                    if (e.target.value) {
                        const decoded = window.VettoreDecoder.decode(e.target.value);
                        if (decoded) {
                            console.log('🔍 Vettore STRATEVAC decodificato:', decoded);
                        }
                    }
                });
            }
        }
    }

    setupGetraListeners(section) {
        // Setup specifici per GETRA
        const vettoreSelect = section.querySelector('#tipo_vettore');
        if (vettoreSelect) {
            console.log('🚁 Setup listener per tipo_vettore in sezione GETRA');
            
            // Inizializza SlimSelect per il vettore se non già fatto
            if (window.TalonAttivitaSlimSelect && !window.TalonAttivitaSlimSelect.getInstance('tipo_vettore')) {
                window.TalonAttivitaSlimSelect.initializeSelect(vettoreSelect);
                console.log('✅ SlimSelect inizializzato per tipo_vettore nella sezione GETRA');
            }
            
            // Integrazione con VettoreDecoder
            if (window.VettoreDecoder) {
                vettoreSelect.addEventListener('change', function(e) {
                    if (e.target.value) {
                        const decoded = window.VettoreDecoder.decode(e.target.value);
                        if (decoded) {
                            console.log('🔍 Vettore GETRA decodificato:', decoded);
                            // Potremmo aggiungere qui feedback visuale per l'utente
                        }
                    }
                });
            }
        }
    }


    // Metodi pubblici
    getSectionStatus() {
        return {
            loaded: Array.from(this.loadedSections),
            count: this.loadedSections.size
        };
    }

    initializeSection(sectionId, tipologiaId) {
        return this.loadSectionIfNeeded(sectionId, tipologiaId);
    }
}

// Inizializzazione automatica
const attivitaSectionLoader = new AttivitaSectionLoader();

// Export globale
window.TalonAttivitaSectionLoader = attivitaSectionLoader;