/**
 * ========================================
 * TALON - MODIFICA ATTIVITÀ
 * File: static/js/modifica_attivita.js
 * 
 * Logica specifica per il form di
 * modifica attività esistente
 * ========================================
 */

(function() {
    'use strict';

    // Verifica dipendenze
    if (!window.TalonAttivitaForms) {
        console.error('[ModificaAttivita] Dipendenza mancante: TalonAttivitaForms');
        return;
    }

    const Forms = window.TalonAttivitaForms;

    // Stato originale per confronto modifiche
    let originalFormData = null;

    /**
     * Inizializzazione form modifica
     */
    function initializeModificaForm() {
        console.log('[ModificaAttivita] Inizializzazione form modifica...');

        // Salva stato originale
        captureOriginalState();

        // Configura listeners base
        Forms.initializeFormListeners({
            tipologiaSelectId: 'tipologia_id',
            onTipologiaChange: handleTipologiaChange
        });

        // Mostra sezione corretta basata sul valore iniziale
        Forms.toggleActivityDetails('tipologia_id');

        // Validazione date
        Forms.initializeDateValidation();
        
        // Sezione GETRA
        Forms.initializeGetraSection();
        
        // Marca campi richiesti
        Forms.markRequiredFields();
        
        // Listener per submit form
        setupFormSubmitHandler();
        
        // Avviso modifiche non salvate
        setupUnsavedChangesWarning();
        
        // Tracking modifiche
        setupChangeTracking();

        console.log('[ModificaAttivita] ✅ Form modifica inizializzato');
    }

    /**
     * Cattura lo stato originale del form
     */
    function captureOriginalState() {
        const form = document.querySelector('form[action*="aggiorna_attivita"]');
        if (!form) return;

        originalFormData = new FormData(form);
        
        // Converti in oggetto per confronto più facile
        const data = {};
        originalFormData.forEach((value, key) => {
            if (data[key]) {
                if (!Array.isArray(data[key])) {
                    data[key] = [data[key]];
                }
                data[key].push(value);
            } else {
                data[key] = value;
            }
        });
        
        originalFormData = data;
        console.log('[ModificaAttivita] Stato originale catturato');
    }

    /**
     * Gestisce il cambio di tipologia attività
     * @param {string} value - Valore selezionato
     * @param {string} text - Testo dell'opzione selezionata
     */
    function handleTipologiaChange(value, text) {
        console.log(`[ModificaAttivita] Tipologia cambiata: ${text} (ID: ${value})`);
        
        // Mostra avviso se ci sono dati nelle sezioni che verranno nascoste
        const inactiveSections = document.querySelectorAll('[data-active="false"]');
        let hasDataInInactiveSections = false;
        
        inactiveSections.forEach(section => {
            const hasData = Array.from(section.querySelectorAll('input, select, textarea'))
                .some(field => {
                    if (field.type === 'number') {
                        return field.value && field.value !== '0';
                    }
                    return field.value && field.value !== '';
                });
            
            if (hasData) {
                hasDataInInactiveSections = true;
            }
        });
        
        if (hasDataInInactiveSections) {
            if (!confirm('Cambiando tipologia, i dati nelle altre sezioni non verranno salvati. Continuare?')) {
                // Ripristina valore precedente
                const tipologiaSelect = document.getElementById('tipologia_id');
                // Trova l'opzione che corrisponde alla sezione attiva precedente
                const previousActiveSection = document.querySelector('[data-active="true"]');
                if (previousActiveSection) {
                    // Trova la tipologia corrispondente
                    for (let [tipologia, sectionId] of Object.entries(Forms.FORM_SECTIONS)) {
                        if (sectionId === previousActiveSection.id) {
                            // Trova e seleziona l'opzione corretta
                            for (let option of tipologiaSelect.options) {
                                if (option.text.trim().toUpperCase() === tipologia) {
                                    tipologiaSelect.value = option.value;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                }
                return;
            }
        }
        
        // Aggiorna campi richiesti
        Forms.markRequiredFields();
        
        // Marca form come modificato
        markFormAsModified();
    }

    /**
     * Setup handler per submit form
     */
    function setupFormSubmitHandler() {
        const form = document.querySelector('form[action*="aggiorna_attivita"]');
        if (!form) return;

        form.addEventListener('submit', function(e) {
            // Validazione base
            if (!Forms.validateActiveSection()) {
                e.preventDefault();
                showError('Compilare tutti i campi richiesti nella sezione attiva');
                return false;
            }

            // Validazione date
            if (!Forms.validateDateRange()) {
                e.preventDefault();
                showError('La data fine deve essere successiva alla data inizio');
                return false;
            }

            // Conferma modifiche
            if (!confirm('Confermare l\'aggiornamento dell\'attività?')) {
                e.preventDefault();
                return false;
            }

            // Reset flag modifiche
            resetModifiedFlag();
            
            // Mostra loader
            showLoader();
        });
    }

    /**
     * Setup avviso per modifiche non salvate
     */
    function setupUnsavedChangesWarning() {
        let isModified = false;

        window.addEventListener('beforeunload', function(e) {
            if (isModified) {
                const message = 'Ci sono modifiche non salvate. Sei sicuro di voler uscire?';
                e.returnValue = message;
                return message;
            }
        });

        // Marca come modificato su cambio
        window.markFormAsModified = function() {
            isModified = true;
            updateModifiedIndicator(true);
        };

        // Reset flag modificato
        window.resetModifiedFlag = function() {
            isModified = false;
            updateModifiedIndicator(false);
        };
    }

    /**
     * Setup tracking delle modifiche
     */
    function setupChangeTracking() {
        const form = document.querySelector('form[action*="aggiorna_attivita"]');
        if (!form) return;

        let changeTimeout;

        // Listener per tutti i cambiamenti
        form.addEventListener('input', handleFieldChange);
        form.addEventListener('change', handleFieldChange);

        function handleFieldChange(e) {
            // Ignora campi che non sono input utente
            if (e.target.type === 'hidden' || e.target.readOnly || e.target.disabled) {
                return;
            }

            clearTimeout(changeTimeout);
            changeTimeout = setTimeout(() => {
                checkForChanges();
            }, 500);
        }

        /**
         * Controlla se ci sono modifiche rispetto allo stato originale
         */
        function checkForChanges() {
            if (!originalFormData) return;

            const currentData = new FormData(form);
            let hasChanges = false;

            // Confronta con stato originale
            currentData.forEach((value, key) => {
                const originalValue = originalFormData[key];
                
                if (Array.isArray(originalValue)) {
                    if (!originalValue.includes(value)) {
                        hasChanges = true;
                        logChange(key, originalValue, value);
                    }
                } else if (originalValue !== value) {
                    hasChanges = true;
                    logChange(key, originalValue, value);
                }
            });

            // Controlla anche campi rimossi
            Object.keys(originalFormData).forEach(key => {
                if (!currentData.has(key)) {
                    hasChanges = true;
                    logChange(key, originalFormData[key], null);
                }
            });

            if (hasChanges) {
                markFormAsModified();
            } else {
                resetModifiedFlag();
            }
        }

        /**
         * Log delle modifiche per debug
         */
        function logChange(field, oldValue, newValue) {
            console.log(`[ModificaAttivita] Campo modificato: ${field}`);
            console.log(`  Da: ${oldValue}`);
            console.log(`  A: ${newValue}`);
        }
    }

    /**
     * Aggiorna indicatore visivo modifiche
     * @param {boolean} isModified - Se il form è stato modificato
     */
    function updateModifiedIndicator(isModified) {
        let indicator = document.getElementById('modified-indicator');
        
        if (!indicator) {
            // Crea indicatore se non esiste
            indicator = document.createElement('div');
            indicator.id = 'modified-indicator';
            indicator.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                padding: 10px 15px;
                border-radius: 5px;
                font-size: 0.9rem;
                font-weight: 500;
                z-index: 1000;
                transition: all 0.3s ease;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            `;
            document.body.appendChild(indicator);
        }

        if (isModified) {
            indicator.textContent = '⚠️ Modifiche non salvate';
            indicator.style.backgroundColor = '#fff3cd';
            indicator.style.color = '#856404';
            indicator.style.border = '1px solid #ffeaa7';
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }

    /**
     * Bottone per reset modifiche
     */
    function addResetButton() {
        const submitButton = document.querySelector('button[type="submit"]');
        if (!submitButton) return;

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'btn btn-secondary';
        resetButton.textContent = 'Annulla Modifiche';
        resetButton.style.marginLeft = '10px';
        
        resetButton.addEventListener('click', function() {
            if (confirm('Vuoi annullare tutte le modifiche e ripristinare i valori originali?')) {
                resetToOriginalState();
            }
        });

        submitButton.parentNode.insertBefore(resetButton, submitButton.nextSibling);
    }

    /**
     * Ripristina stato originale
     */
    function resetToOriginalState() {
        if (!originalFormData) return;

        const form = document.querySelector('form[action*="aggiorna_attivita"]');
        if (!form) return;

        // Ripristina tutti i valori
        Object.keys(originalFormData).forEach(key => {
            const field = form.elements[key];
            if (field) {
                const value = originalFormData[key];
                
                if (field instanceof RadioNodeList) {
                    // Radio o checkbox multipli
                    if (Array.isArray(value)) {
                        // Deseleziona tutto prima
                        form.querySelectorAll(`[name="${key}"]`).forEach(input => {
                            input.checked = false;
                        });
                        // Seleziona valori originali
                        value.forEach(v => {
                            const input = form.querySelector(`[name="${key}"][value="${v}"]`);
                            if (input) input.checked = true;
                        });
                    } else {
                        const input = form.querySelector(`[name="${key}"][value="${value}"]`);
                        if (input) input.checked = true;
                    }
                } else if (field.type === 'checkbox') {
                    field.checked = value === 'on';
                } else {
                    field.value = value || '';
                }
            }
        });

        // Trigger change per aggiornare UI
        const tipologiaSelect = document.getElementById('tipologia_id');
        if (tipologiaSelect) {
            tipologiaSelect.dispatchEvent(new Event('change'));
        }

        resetModifiedFlag();
        showSuccess('Modifiche annullate');
    }

    /**
     * Mostra loader
     */
    function showLoader() {
        const loader = document.createElement('div');
        loader.className = 'form-loader';
        loader.innerHTML = '<div class="spinner"></div><p>Aggiornamento in corso...</p>';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255,255,255,0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        document.body.appendChild(loader);
    }

    // ========================================
    // UTILITY NOTIFICATIONS
    // ========================================

    function showSuccess(message, duration = 3000) {
        if (window.TALON_API && window.TALON_API.showSuccess) {
            window.TALON_API.showSuccess(message, duration);
        } else {
            console.log('✅', message);
        }
    }

    function showError(message, duration = 5000) {
        if (window.TALON_API && window.TALON_API.showError) {
            window.TALON_API.showError(message, duration);
        } else {
            console.error('❌', message);
            alert(message);
        }
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================

    // Attendi che il DOM sia pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeModificaForm();
            addResetButton();
        });
    } else {
        // DOM già pronto
        initializeModificaForm();
        addResetButton();
    }

})();