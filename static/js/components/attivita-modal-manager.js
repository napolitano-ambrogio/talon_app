/**
 * ========================================
 * TALON - Attività Modal Manager
 * File: static/js/components/attivita-modal-manager.js
 * 
 * Versione: 1.0.0
 * Descrizione: Gestione modal per operazioni/esercitazioni temporanee
 * Dependencies: None
 * Pattern: Ispirato a eventi-modal-manager.js con ottimizzazioni
 * ========================================
 */

class AttivitaModalManager {
    constructor() {
        this.activeModals = new Map();
        this.config = {
            backdrop: 'static',
            keyboard: false,
            focus: true
        };
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeModalHandlers());
        } else {
            this.initializeModalHandlers();
        }
    }

    initializeModalHandlers() {
        this.setupGlobalFunctions();
        this.setupModalEventListeners();
        this.setupFormHandlers();
        this.setupClickOutsideHandler();
    }

    setupGlobalFunctions() {
        // Export funzioni globali per compatibilità con template esistenti
        window.openModal = (modalId) => this.openModal(modalId);
        window.closeModal = (modalId) => this.closeModal(modalId);
        window.salvaOperazioneTemp = () => this.salvaOperazioneTemp();
        window.salvaEsercitazioneTemp = () => this.salvaEsercitazioneTemp();
    }

    setupModalEventListeners() {
        // Gestione operazioni/esercitazioni select
        const operazioneSelect = document.getElementById('operazione_id');
        const esercitazioneSelect = document.getElementById('esercitazione_id');
        
        if (operazioneSelect) {
            operazioneSelect.addEventListener('change', (e) => {
                if (e.target.value === 'new') {
                    this.openModal('modal-nuova-operazione');
                    e.target.value = ''; // Reset
                }
            });
        }
        
        if (esercitazioneSelect) {
            esercitazioneSelect.addEventListener('change', (e) => {
                if (e.target.value === 'new') {
                    this.openModal('modal-nuova-esercitazione');
                    e.target.value = ''; // Reset
                }
            });
        }
    }

    setupFormHandlers() {
        // Setup form operazione temporanea
        const opForm = document.getElementById('form-nuova-operazione');
        if (opForm) {
            opForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.salvaOperazioneTemp();
            });
        }

        // Setup form esercitazione temporanea
        const esercForm = document.getElementById('form-nuova-esercitazione');
        if (esercForm) {
            esercForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.salvaEsercitazioneTemp();
            });
        }
    }

    setupClickOutsideHandler() {
        window.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal') && event.target.style.display === 'block') {
                // Non chiudere modal con backdrop static
                if (this.config.backdrop !== 'static') {
                    this.closeModal(event.target.id);
                }
            }
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error('❌ Modal non trovato:', modalId);
            return;
        }

        // Chiudi altri modal attivi
        this.closeAllModals();

        // Apri modal
        modal.style.display = 'block';
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        
        // Gestisci focus
        if (this.config.focus) {
            const firstInput = modal.querySelector('input, select, textarea');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }

        // Salva riferimento
        this.activeModals.set(modalId, {
            element: modal,
            openedAt: Date.now()
        });

        console.log('📖 Modal aperto:', modalId);
    }

    closeModal(modalId) {
        const modalData = this.activeModals.get(modalId);
        if (!modalData) return;

        const modal = modalData.element;
        
        // Chiudi modal
        modal.style.display = 'none';
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');

        // Reset form nel modal
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
            this.clearValidationErrors(form);
        }

        // Rimuovi riferimento
        this.activeModals.delete(modalId);

        console.log('📕 Modal chiuso:', modalId);
    }

    closeAllModals() {
        this.activeModals.forEach((_, modalId) => {
            this.closeModal(modalId);
        });
    }

    async salvaOperazioneTemp() {
        const form = document.getElementById('form-nuova-operazione');
        if (!form) return;

        const formData = this.extractFormData(form, {
            'new-op-nome': 'nome_missione',
            'new-op-nome-breve': 'nome_breve', 
            'new-op-teatro': 'teatro_operativo',
            'new-op-nazione': 'nazione',
            'new-op-note': 'note'
        });

        // Validazione
        if (!formData.nome_missione?.trim()) {
            this.showFormError(form, 'Il nome missione è obbligatorio!');
            return;
        }

        // Applica maiuscole
        Object.keys(formData).forEach(key => {
            if (typeof formData[key] === 'string') {
                formData[key] = formData[key].toUpperCase();
            }
        });

        try {
            this.showLoading(form, true);
            
            const response = await fetch('/api/operazioni_temp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                this.addOperazioneToSelect(data, formData);
                this.closeModal('modal-nuova-operazione');
                this.showSuccessMessage('Operazione temporanea salvata con successo!');
            } else {
                this.showFormError(form, data.error || 'Errore nel salvataggio');
            }

        } catch (error) {
            console.error('❌ Errore salvataggio operazione:', error);
            this.showFormError(form, 'Errore di connessione al server');
        } finally {
            this.showLoading(form, false);
        }
    }

    async salvaEsercitazioneTemp() {
        const form = document.getElementById('form-nuova-esercitazione');
        if (!form) return;

        const formData = this.extractFormData(form, {
            'new-eserc-nome': 'nome',
            'new-eserc-nome-breve': 'nome_breve',
            'new-eserc-anno': 'anno',
            'new-eserc-note': 'note'
        });

        // Validazione
        if (!formData.nome?.trim()) {
            this.showFormError(form, 'Il nome esercitazione è obbligatorio!');
            return;
        }

        // Applica maiuscole (eccetto anno)
        Object.keys(formData).forEach(key => {
            if (typeof formData[key] === 'string' && key !== 'anno') {
                formData[key] = formData[key].toUpperCase();
            }
        });

        // Converti anno
        if (formData.anno) {
            formData.anno = parseInt(formData.anno) || null;
        }

        try {
            this.showLoading(form, true);
            
            const response = await fetch('/api/esercitazioni_temp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                this.addEsercitazioneToSelect(data, formData);
                this.closeModal('modal-nuova-esercitazione');
                this.showSuccessMessage('Esercitazione temporanea salvata con successo!');
            } else {
                this.showFormError(form, data.error || 'Errore nel salvataggio');
            }

        } catch (error) {
            console.error('❌ Errore salvataggio esercitazione:', error);
            this.showFormError(form, 'Errore di connessione al server');
        } finally {
            this.showLoading(form, false);
        }
    }

    extractFormData(form, fieldMapping) {
        const data = {};
        Object.entries(fieldMapping).forEach(([inputId, dataKey]) => {
            const input = form.querySelector(`#${inputId}`);
            if (input) {
                data[dataKey] = input.value.trim();
            }
        });
        return data;
    }

    addOperazioneToSelect(responseData, formData) {
        const select = document.getElementById('operazione_id');
        if (!select) return;

        const option = new Option(
            `[TEMP] ${formData.nome_missione}`,
            `temp_${responseData.id}`,
            false,
            true // Seleziona automaticamente
        );
        
        // Aggiungi attributi data
        option.setAttribute('data-temp', 'true');
        option.setAttribute('data-nome-missione', formData.nome_missione);
        option.setAttribute('data-nome-breve', formData.nome_breve || '');
        option.setAttribute('data-teatro-operativo', formData.teatro_operativo || '');
        option.setAttribute('data-nazione', formData.nazione || '');
        
        const details = [
            formData.nome_breve,
            formData.teatro_operativo,
            formData.nazione
        ].filter(Boolean).join(' • ');
        
        option.setAttribute('data-details', `[NON VALIDATA] ${details}`);

        // Inserisci dopo opzione "Aggiungi nuovo..."
        const newOption = select.querySelector('option[value="new"]');
        const insertAfter = newOption?.nextElementSibling || select.firstElementChild;
        if (insertAfter) {
            select.insertBefore(option, insertAfter);
        } else {
            select.appendChild(option);
        }

        // Refresh SlimSelect se presente
        if (window.TalonAttivitaSlimSelect) {
            window.TalonAttivitaSlimSelect.refreshInstance('operazione_id');
        }
    }

    addEsercitazioneToSelect(responseData, formData) {
        const select = document.getElementById('esercitazione_id');
        if (!select) return;

        const option = new Option(
            `[TEMP] ${formData.nome}`,
            `temp_${responseData.id}`,
            false,
            true // Seleziona automaticamente
        );
        
        // Aggiungi attributi data
        option.setAttribute('data-temp', 'true');
        option.setAttribute('data-nome', formData.nome);
        option.setAttribute('data-nome-breve', formData.nome_breve || '');
        option.setAttribute('data-anno', formData.anno || '');
        
        const details = [
            formData.nome_breve,
            formData.anno
        ].filter(Boolean).join(' • ');
        
        option.setAttribute('data-details', `[NON VALIDATA] ${details}`);

        // Inserisci dopo opzione "Aggiungi nuovo..."
        const newOption = select.querySelector('option[value="new"]');
        const insertAfter = newOption?.nextElementSibling || select.firstElementChild;
        if (insertAfter) {
            select.insertBefore(option, insertAfter);
        } else {
            select.appendChild(option);
        }

        // Refresh SlimSelect se presente
        if (window.TalonAttivitaSlimSelect) {
            window.TalonAttivitaSlimSelect.refreshInstance('esercitazione_id');
        }
    }

    showFormError(form, message) {
        this.clearValidationErrors(form);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger mt-2 modal-error';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        
        form.insertBefore(errorDiv, form.firstChild);
    }

    clearValidationErrors(form) {
        const errors = form.querySelectorAll('.modal-error');
        errors.forEach(error => error.remove());
    }

    showLoading(form, show) {
        const submitBtn = form.querySelector('button[type="button"][onclick*="salva"]');
        if (!submitBtn) return;

        if (show) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtn.innerHTML.includes('Operazione') ? 
                'Salva Operazione' : 'Salva Esercitazione';
        }
    }

    showSuccessMessage(message) {
        // Toast-style success message
        const toast = document.createElement('div');
        toast.className = 'alert alert-success position-fixed';
        toast.style.cssText = 'top: 20px; right: 20px; z-index: 99999; min-width: 300px;';
        toast.innerHTML = `
            <i class="fas fa-check-circle"></i> ${message}
            <button type="button" class="btn-close float-end" onclick="this.parentElement.remove()"></button>
        `;
        
        document.body.appendChild(toast);
        
        // Auto-rimozione dopo 5 secondi
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    // Metodi pubblici
    getActiveModals() {
        return Array.from(this.activeModals.keys());
    }

    isModalActive(modalId) {
        return this.activeModals.has(modalId);
    }

    getModalCount() {
        return this.activeModals.size;
    }
}

// Inizializzazione automatica
const attivitaModalManager = new AttivitaModalManager();

// Export globale
window.TalonAttivitaModalManager = attivitaModalManager;