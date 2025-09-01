/**
 * ========================================
 * TALON - Eventi Modal Manager
 * File: static/js/components/eventi-modal-manager.js
 * 
 * Versione: 1.0.0
 * Descrizione: Gestione modal Bootstrap per eventi seguiti
 * Dependencies: Bootstrap (opzionale)
 * ========================================
 */

class EventiModalManager {
    constructor() {
        this.seguitiSelezionati = [];
        this.ultimiRisultatiRicerca = [];
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeModal());
        } else {
            this.initializeModal();
        }
    }

    initializeModal() {
        this.setupModalEvents();
        this.setupCloseButtons();
    }

    setupModalEvents() {
        // Solo se Bootstrap è disponibile
        if (typeof bootstrap === 'undefined') {
            return;
        }

        const modalElement = document.getElementById('modalSeguiti');
        if (!modalElement) return;

        // Event listener per quando il modal viene nascosto
        modalElement.addEventListener('hidden.bs.modal', () => {
            this.resetRicerca();
        });

        // Event listener per quando il modal viene mostrato
        modalElement.addEventListener('shown.bs.modal', () => {
            const searchInput = document.getElementById('search-protocollo');
            if (searchInput) {
                searchInput.focus();
            }
        });
    }

    setupCloseButtons() {
        // Gestione pulsanti di chiusura
        const closeButtons = document.querySelectorAll('#modalSeguiti .btn-close, #modalSeguiti [data-close-modal]');
        closeButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.chiudiModal();
            });
        });

        // Previeni chiusura accidentale cliccando sul contenuto
        const modalContent = document.querySelector('#modalSeguiti .modal-content');
        if (modalContent) {
            modalContent.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }
    }

    aprirModal() {
        try {
            this.resetRicerca();
            
            const modalElement = document.getElementById('modalSeguiti');
            if (!modalElement) {
                console.error('[MODAL] Elemento modalSeguiti non trovato');
                return;
            }

            // Approccio Bootstrap 5
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                const modal = new bootstrap.Modal(modalElement, {
                    backdrop: 'static',
                    keyboard: false,
                    focus: true
                });
                modal.show();
                
                // Fix per z-index se necessario
                setTimeout(() => this.fixModalZIndex(modalElement), 100);
            } 
            // Fallback jQuery
            else if (typeof $ !== 'undefined') {
                $('#modalSeguiti').modal('show');
            } 
            // Fallback manuale
            else {
                this.showModalManually(modalElement);
            }
            
        } catch (error) {
            console.error('[MODAL] Errore apertura modal:', error);
            alert('Errore nell\'apertura del modal. Verifica la console per dettagli.');
        }
    }

    fixModalZIndex(modalElement) {
        const backdrop = document.querySelector('.modal-backdrop');
        
        modalElement.style.zIndex = '99999';
        modalElement.style.position = 'fixed';
        
        if (backdrop) {
            backdrop.style.zIndex = '1000';
            backdrop.style.pointerEvents = 'none';
        }
        
        const dialog = modalElement.querySelector('.modal-dialog');
        if (dialog) {
            dialog.style.zIndex = '100000';
            dialog.style.position = 'relative';
        }
        
        const content = modalElement.querySelector('.modal-content');
        if (content) {
            content.style.zIndex = '100001';
            content.style.position = 'relative';
            content.style.pointerEvents = 'all';
        }
        
        modalElement.classList.add('show');
    }

    showModalManually(modalElement) {
        modalElement.style.display = 'block';
        modalElement.classList.add('show');
        document.body.classList.add('modal-open');
        
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.id = 'manual-backdrop';
        document.body.appendChild(backdrop);
    }

    chiudiModal() {
        try {
            const modalElement = document.getElementById('modalSeguiti');
            if (!modalElement) return;
            
            // Approccio Bootstrap
            if (typeof bootstrap !== 'undefined') {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                    setTimeout(() => {
                        modalElement.style.display = 'none';
                        modalElement.classList.remove('show');
                        document.body.classList.remove('modal-open');
                    }, 300);
                    return;
                }
            }
            
            // Fallback jQuery
            if (typeof $ !== 'undefined') {
                $('#modalSeguiti').modal('hide');
                return;
            }
            
            // Chiusura manuale
            this.hideModalManually(modalElement);
            
        } catch (error) {
            console.error('[MODAL] Errore chiusura modal:', error);
            // Fallback di emergenza
            const modalElement = document.getElementById('modalSeguiti');
            if (modalElement) {
                modalElement.style.display = 'none';
                modalElement.classList.remove('show');
            }
        }
    }

    hideModalManually(modalElement) {
        modalElement.style.display = 'none';
        modalElement.classList.remove('show');
        modalElement.classList.remove('fade');
        document.body.classList.remove('modal-open');
        
        // Rimuovi tutti i backdrop
        const allBackdrops = document.querySelectorAll('.modal-backdrop');
        allBackdrops.forEach(backdrop => backdrop.remove());
        
        const manualBackdrop = document.getElementById('manual-backdrop');
        if (manualBackdrop) {
            manualBackdrop.remove();
        }
        
        // Reset stili body
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }

    resetRicerca() {
        // Reset campi di ricerca
        const protocolloInput = document.getElementById('search-protocollo');
        const dataInput = document.getElementById('search-data');
        
        if (protocolloInput) protocolloInput.value = '';
        if (dataInput) dataInput.value = '';
        
        // Reset risultati
        const risultatiContainer = document.getElementById('risultati-ricerca');
        if (risultatiContainer) {
            risultatiContainer.innerHTML = `
                <div class="alert alert-info" id="info-ricerca">
                    <i class="fas fa-info-circle"></i> Inserisci i criteri di ricerca e premi "Cerca Eventi"
                </div>`;
        }
        
        // Reset seguiti selezionati
        this.seguitiSelezionati = [];
        const seguitiSection = document.getElementById('seguiti-selezionati');
        if (seguitiSection) {
            seguitiSection.style.display = 'none';
        }
    }

    // Getter/Setter per seguiti selezionati
    getSeguitiSelezionati() {
        return [...this.seguitiSelezionati];
    }

    setSeguitiSelezionati(seguiti) {
        this.seguitiSelezionati = [...seguiti];
    }

    clearSeguitiSelezionati() {
        this.seguitiSelezionati = [];
    }

    // Getter/Setter per ultimi risultati ricerca
    getUltimiRisultati() {
        return [...this.ultimiRisultatiRicerca];
    }

    setUltimiRisultati(risultati) {
        this.ultimiRisultatiRicerca = [...risultati];
    }
}

// Inizializzazione automatica
window.eventiModalManager = new EventiModalManager();

// Funzioni globali per compatibilità con template esistenti
window.aprirModalSeguiti = () => window.eventiModalManager.aprirModal();
window.chiudiModalSeguiti = () => window.eventiModalManager.chiudiModal();

// Export per utilizzo modulare
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventiModalManager;
}