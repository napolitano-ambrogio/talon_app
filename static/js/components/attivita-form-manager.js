/**
 * ========================================
 * TALON - Attività Form Manager
 * File: static/js/components/attivita-form-manager.js
 * 
 * Versione: 1.0.0
 * Descrizione: Gestione form attività (maiuscole, validazione, toggle)
 * Dependencies: None
 * Pattern: Ispirato a eventi-form-handler.js
 * ========================================
 */

class AttivitaFormManager {
    constructor() {
        this.tipologiaMapping = this.initializeTipologiaMapping();
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeFormHandlers());
        } else {
            this.initializeFormHandlers();
        }
    }

    initializeFormHandlers() {
        this.setupUppercaseInputs();
        this.setupToggleSwitches();
        this.setupTipologiaListener();
        this.setupFormValidation();
        this.setupNavigationButtons();
    }

    // Mappatura tipologie attività → sezioni dettagli da mostrare
    initializeTipologiaMapping() {
        return {
            '2': 'dettagli-rifornimenti',           // Rifornimenti
            '3': 'dettagli-mantenimento',          // Mantenimento
            '4': 'dettagli-trasporti',             // Trasporti
            '11': 'dettagli-med-curativa',         // Medicina Curativa
            '12': 'dettagli-stratevac',            // STRATEVAC
            '15': 'dettagli-getra',                // GETRA
            '20': 'dettagli-formazione',           // Formazione
            '21': 'dettagli-training-on-the-job', // Training on the Job
            '23': 'dettagli-esercitazione'         // Esercitazione
        };
    }

    setupUppercaseInputs() {
        // Gestione maiuscole per input testo (escludendo numerici e date)
        const textInputs = document.querySelectorAll('input[type="text"], textarea');
        
        textInputs.forEach(input => {
            // Escludi campi numerici e date
            if (input.type === 'number' || input.type === 'date' || 
                input.id.includes('quantita') || input.id.includes('numero_') || 
                input.id.includes('volume')) {
                return;
            }
            
            // Applica stile maiuscolo
            input.style.textTransform = 'uppercase';
            
            // Event listener per conversione in tempo reale
            input.addEventListener('input', (event) => {
                this.handleUppercaseInput(event.target);
            });
            
            // Converti valore esistente
            if (input.value) {
                input.value = input.value.toUpperCase();
            }
        });
    }

    handleUppercaseInput(input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.toUpperCase();
        input.setSelectionRange(start, end);
    }

    setupToggleSwitches() {
        // Setup toggle switch per operazione/esercitazione
        window.toggleSwitch = (type) => {
            const checkbox = document.getElementById('toggle-' + type);
            const container = document.getElementById(type + '-container');
            const button = document.getElementById(type + '-slider-button');
            const switchDiv = button.parentElement;
            const select = document.getElementById(type === 'operazione' ? 'operazione_id' : 'esercitazione_id');
            
            // Toggle lo stato
            checkbox.checked = !checkbox.checked;
            
            if (checkbox.checked) {
                // Attiva lo switch
                switchDiv.style.backgroundColor = '#007bff';
                button.style.transform = 'translateX(26px)';
                container.style.display = 'block';
            } else {
                // Disattiva lo switch
                switchDiv.style.backgroundColor = '#ccc';
                button.style.transform = 'translateX(0)';
                container.style.display = 'none';
                // Pulisci la selezione
                if (select) {
                    select.value = '';
                    // Pulisci anche il searchable select se presente
                    const searchableWrapper = container.querySelector('.searchable-select');
                    if (searchableWrapper) {
                        const searchableInput = searchableWrapper.querySelector('input');
                        if (searchableInput) {
                            searchableInput.value = '';
                        }
                    }
                }
            }
        };
    }

    setupTipologiaListener() {
        const tipologiaSelect = document.getElementById('tipologia_id');
        if (tipologiaSelect) {
            tipologiaSelect.addEventListener('change', (e) => {
                this.handleTipologiaChange(e.target.value);
            });
        }
    }

    handleTipologiaChange(tipologiaId) {
        // Nascondi tutte le sezioni dettagli
        const allSections = document.querySelectorAll('.detail-section');
        allSections.forEach(section => {
            section.style.display = 'none';
            section.setAttribute('data-active', 'false');
        });

        // Mostra la sezione appropriata se mappata
        if (this.tipologiaMapping[tipologiaId]) {
            const targetSection = document.getElementById(this.tipologiaMapping[tipologiaId]);
            if (targetSection) {
                targetSection.style.display = 'block';
                targetSection.setAttribute('data-active', 'true');
                console.log(`📋 Sezione ${this.tipologiaMapping[tipologiaId]} attivata per tipologia ${tipologiaId}`);
            }
        }

        // Trigger evento personalizzato per altri componenti
        window.dispatchEvent(new CustomEvent('tipologia:changed', {
            detail: { 
                tipologiaId: tipologiaId,
                sectionId: this.tipologiaMapping[tipologiaId] || null
            }
        }));
    }

    setupFormValidation() {
        const form = document.getElementById('form-inserimento-attivita');
        if (form) {
            form.addEventListener('submit', (e) => {
                if (!this.validateForm()) {
                    e.preventDefault();
                }
            });
        }
    }

    validateForm() {
        const requiredFields = document.querySelectorAll('[required]');
        let isValid = true;
        const errors = [];

        requiredFields.forEach(field => {
            // Skip hidden fields
            if (field.offsetParent === null) return;
            
            if (!field.value.trim()) {
                isValid = false;
                errors.push(`Il campo ${field.getAttribute('aria-label') || field.name || 'obbligatorio'} è richiesto`);
                field.classList.add('is-invalid');
            } else {
                field.classList.remove('is-invalid');
            }
        });

        if (!isValid) {
            this.showValidationErrors(errors);
        }

        return isValid;
    }

    showValidationErrors(errors) {
        // Rimuovi alert precedenti
        const existingAlerts = document.querySelectorAll('.validation-alert');
        existingAlerts.forEach(alert => alert.remove());

        // Crea nuovo alert
        const alertContainer = document.createElement('div');
        alertContainer.className = 'alert alert-danger alert-dismissible fade show mt-3 validation-alert';
        alertContainer.innerHTML = `
            <strong><i class="fas fa-exclamation-triangle"></i> Errori di validazione:</strong>
            <ul class="mb-0 mt-2">
                ${errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // Inserisci all'inizio del container form
        const formContainer = document.querySelector('.form-container');
        if (formContainer) {
            formContainer.insertBefore(alertContainer, formContainer.firstChild);
        }
    }

    setupNavigationButtons() {
        // Gestione pulsante reset
        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => this.resetForm());
        }
    }

    resetForm() {
        const form = document.getElementById('form-inserimento-attivita');
        if (form) {
            // Reset form standard
            form.reset();
            
            // Nascondi sezioni dettagli
            const allSections = document.querySelectorAll('.detail-section');
            allSections.forEach(section => {
                section.style.display = 'none';
                section.setAttribute('data-active', 'false');
            });
            
            // Reset toggle switches
            ['operazione', 'esercitazione'].forEach(type => {
                const checkbox = document.getElementById('toggle-' + type);
                const container = document.getElementById(type + '-container');
                const button = document.getElementById(type + '-slider-button');
                const switchDiv = button?.parentElement;
                
                if (checkbox) checkbox.checked = false;
                if (container) container.style.display = 'none';
                if (switchDiv) switchDiv.style.backgroundColor = '#ccc';
                if (button) button.style.transform = 'translateX(0)';
            });
            
            // Rimuovi alert di validazione
            const alerts = document.querySelectorAll('.validation-alert');
            alerts.forEach(alert => alert.remove());
            
            console.log('🔄 Form attività resettato');
        }
    }

    // Metodi pubblici per controllo esterno
    getTipologiaMapping() {
        return this.tipologiaMapping;
    }

    refreshUppercaseInputs() {
        this.setupUppercaseInputs();
    }

    showSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'block';
            section.setAttribute('data-active', 'true');
        }
    }

    hideSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'none';
            section.setAttribute('data-active', 'false');
        }
    }
}

// Inizializzazione automatica
const attivitaFormManager = new AttivitaFormManager();

// Export globale per debug e controllo esterno
window.TalonAttivitaFormManager = attivitaFormManager;