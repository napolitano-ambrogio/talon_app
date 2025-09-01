/**
 * ========================================
 * TALON - Eventi Form Handler
 * File: static/js/components/eventi-form-handler.js
 * 
 * Versione: 1.0.0
 * Descrizione: Gestione campi form eventi (maiuscole, date, navigazione)
 * Dependencies: None
 * ========================================
 */

class EventiFormHandler {
    constructor() {
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
        this.setupDateFields();
        this.setupNavigationButtons();
    }

    setupUppercaseInputs() {
        // Gestione maiuscole per input testo
        const textInputs = document.querySelectorAll('input[type="text"], textarea');
        
        textInputs.forEach(input => {
            // Escludi campi numerici e date
            if (input.type === 'number' || input.type === 'date') {
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

    setupDateFields() {
        // Imposta data evento vuota all'inizializzazione
        const dataEvento = document.getElementById('data_evento');
        if (dataEvento) {
            dataEvento.value = '';
        }
    }

    setupNavigationButtons() {
        // Gestione pulsante annulla con navigazione intelligente
        const btnAnnulla = document.getElementById('btn-annulla');
        if (btnAnnulla) {
            btnAnnulla.addEventListener('click', () => this.handleCancelNavigation());
        }
    }

    handleCancelNavigation() {
        const backUrl = document.referrer;
        
        // Determina la destinazione basata sull'URL di provenienza
        if (backUrl && backUrl.includes('/eventi/dashboard')) {
            window.location.href = '/eventi/dashboard';
        }
        else if (backUrl && backUrl.includes('/eventi/lista')) {
            window.location.href = '/eventi/lista';
        }
        else {
            // Default fallback
            window.location.href = '/eventi/lista';
        }
    }

    // Metodi pubblici per controllo esterno
    refreshUppercaseInputs() {
        this.setupUppercaseInputs();
    }

    resetFormFields() {
        // Reset campi form a valori default
        const dataEvento = document.getElementById('data_evento');
        if (dataEvento) {
            dataEvento.value = '';
        }

        // Reset altri campi se necessario
        const textInputs = document.querySelectorAll('input[type="text"], textarea');
        textInputs.forEach(input => {
            if (input.value) {
                input.value = input.value.toUpperCase();
            }
        });
    }

    validateForm() {
        // Validazione base form
        const requiredFields = document.querySelectorAll('[required]');
        let isValid = true;
        const errors = [];

        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                isValid = false;
                errors.push(`Il campo ${field.getAttribute('aria-label') || field.name} è obbligatorio`);
                field.classList.add('is-invalid');
            } else {
                field.classList.remove('is-invalid');
            }
        });

        return { isValid, errors };
    }

    showValidationErrors(errors) {
        // Mostra errori di validazione
        const alertContainer = document.createElement('div');
        alertContainer.className = 'alert alert-danger alert-dismissible fade show mt-3';
        alertContainer.innerHTML = `
            <strong>Errori di validazione:</strong>
            <ul class="mb-0 mt-2">
                ${errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // Inserisci all'inizio del form
        const form = document.querySelector('form');
        if (form) {
            form.insertBefore(alertContainer, form.firstChild);
        }
    }
}

// Inizializzazione automatica
window.eventiFormHandler = new EventiFormHandler();

// Export per utilizzo modulare
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventiFormHandler;
}