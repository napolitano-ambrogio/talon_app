/**
 * ========================================
 * TALON - INSERIMENTO ATTIVITÀ
 * File: static/js/inserimento_attivita.js
 * 
 * Logica specifica per il form di
 * inserimento nuova attività
 * ========================================
 */

(function() {
    'use strict';

    // Verifica dipendenze
    if (!window.TalonAttivitaForms) {
        console.error('[InserimentoAttivita] Dipendenza mancante: TalonAttivitaForms');
        return;
    }

    const Forms = window.TalonAttivitaForms;

    /**
     * Inizializzazione form inserimento
     */
    function initializeInserimentoForm() {
        console.log('[InserimentoAttivita] Inizializzazione form inserimento...');

        // Configura listeners base
        Forms.initializeFormListeners({
            tipologiaSelectId: 'tipologia_id',
            onTipologiaChange: handleTipologiaChange
        });

        // Inizializzazione specifica per inserimento
        initializeDefaults();
        
        // Validazione date
        Forms.initializeDateValidation();
        
        // Sezione GETRA
        Forms.initializeGetraSection();
        
        // Marca campi richiesti
        Forms.markRequiredFields();
        
        // Listener per submit form
        setupFormSubmitHandler();
        
        // Auto-save bozza
        setupAutoSave();
        
        // Inizializza searchable selects se disponibili
        if (window.TALON_API && window.TALON_API.refreshSearchableSelects) {
            setTimeout(() => {
                window.TALON_API.refreshSearchableSelects();
                console.log('[InserimentoAttivita] Searchable selects inizializzati');
            }, 100);
        } else {
            console.warn('[InserimentoAttivita] TALON_API.refreshSearchableSelects non disponibile');
        }

        console.log('[InserimentoAttivita] ✅ Form inserimento inizializzato');
    }

    /**
     * Gestisce il cambio di tipologia attività
     * @param {string} value - Valore selezionato
     * @param {string} text - Testo dell'opzione selezionata
     */
    function handleTipologiaChange(value, text) {
        console.log(`[InserimentoAttivita] Tipologia cambiata: ${text} (ID: ${value})`);
        
        // Reset campi delle sezioni non attive
        resetInactiveSections();
        
        // Aggiorna campi richiesti
        Forms.markRequiredFields();
        
        // Focus sul primo campo della sezione attiva
        focusFirstFieldInActiveSection();
    }

    /**
     * Inizializza valori di default
     */
    function initializeDefaults() {
        // Data inizio = oggi per default
        const dataInizio = document.getElementById('data_inizio');
        if (dataInizio && !dataInizio.value) {
            const oggi = new Date().toISOString().split('T')[0];
            dataInizio.value = oggi;
        }

        // Valori di default per personale
        const defaultValues = {
            'personale_ufficiali': 0,
            'personale_sottufficiali': 0,
            'personale_graduati': 0,
            'personale_civili': 0
        };

        Object.keys(defaultValues).forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && !field.value) {
                field.value = defaultValues[fieldId];
            }
        });
    }

    /**
     * Reset campi nelle sezioni non attive
     */
    function resetInactiveSections() {
        document.querySelectorAll('[data-active="false"]').forEach(section => {
            // Mantieni i dati solo se l'utente ha già compilato qualcosa
            const hasData = Array.from(section.querySelectorAll('input, select, textarea'))
                .some(field => field.value && field.value !== '0' && field.value !== '');
            
            if (!hasData) {
                // Reset solo se la sezione è vuota
                section.querySelectorAll('input, select, textarea').forEach(field => {
                    if (field.type !== 'hidden') {
                        field.value = '';
                    }
                });
            }
        });
    }

    /**
     * Focus sul primo campo della sezione attiva
     */
    function focusFirstFieldInActiveSection() {
        setTimeout(() => {
            const activeSection = document.querySelector('[data-active="true"]');
            if (activeSection) {
                const firstField = activeSection.querySelector('input:not([type="hidden"]), select, textarea');
                if (firstField) {
                    firstField.focus();
                }
            }
        }, 100);
    }

    /**
     * Setup handler per submit form
     */
    function setupFormSubmitHandler() {
        const form = document.querySelector('form[action*="salva_attivita"]');
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

            // Conferma prima di salvare
            if (!confirm('Confermare il salvataggio della nuova attività?')) {
                e.preventDefault();
                return false;
            }

            // Pulisci auto-save
            clearAutoSave();
            
            // Mostra loader
            showLoader();
        });
    }

    /**
     * Setup auto-save per bozze
     */
    function setupAutoSave() {
        const form = document.querySelector('form[action*="salva_attivita"]');
        if (!form) return;

        let autoSaveTimeout;
        const AUTOSAVE_KEY = 'talon_inserimento_attivita_draft';

        // Carica bozza se presente
        loadDraft();

        // Listener per auto-save
        form.addEventListener('input', function() {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                saveDraft();
            }, 2000);
        });

        form.addEventListener('change', function() {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                saveDraft();
            }, 1000);
        });

        /**
         * Salva bozza in localStorage
         */
        function saveDraft() {
            const formData = new FormData(form);
            const draft = {};
            
            formData.forEach((value, key) => {
                if (draft[key]) {
                    if (!Array.isArray(draft[key])) {
                        draft[key] = [draft[key]];
                    }
                    draft[key].push(value);
                } else {
                    draft[key] = value;
                }
            });

            // Aggiungi informazioni sulla sezione attiva
            const activeSection = document.querySelector('[data-active="true"]');
            if (activeSection) {
                draft._activeSection = activeSection.id;
            }

            try {
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
                console.log('[InserimentoAttivita] Bozza salvata automaticamente');
                showInfo('Bozza salvata', 1000);
            } catch (e) {
                console.error('[InserimentoAttivita] Errore salvataggio bozza:', e);
            }
        }

        /**
         * Carica bozza da localStorage
         */
        function loadDraft() {
            const savedDraft = localStorage.getItem(AUTOSAVE_KEY);
            if (!savedDraft) return;

            if (confirm('È presente una bozza salvata. Vuoi recuperarla?')) {
                try {
                    const draft = JSON.parse(savedDraft);
                    
                    // Ripristina i valori
                    Object.keys(draft).forEach(key => {
                        if (key === '_activeSection') return;
                        
                        const field = form.elements[key];
                        if (field) {
                            if (field instanceof RadioNodeList) {
                                // Radio o checkbox multipli
                                if (Array.isArray(draft[key])) {
                                    draft[key].forEach(value => {
                                        const input = form.querySelector(`[name="${key}"][value="${value}"]`);
                                        if (input) input.checked = true;
                                    });
                                } else {
                                    const input = form.querySelector(`[name="${key}"][value="${draft[key]}"]`);
                                    if (input) input.checked = true;
                                }
                            } else if (field.type === 'checkbox') {
                                field.checked = draft[key] === 'on';
                            } else {
                                field.value = draft[key];
                            }
                        }
                    });

                    // Ripristina sezione attiva
                    if (draft._activeSection) {
                        const tipologiaSelect = document.getElementById('tipologia_id');
                        if (tipologiaSelect) {
                            // Trigger change per mostrare la sezione corretta
                            tipologiaSelect.dispatchEvent(new Event('change'));
                        }
                    }

                    showSuccess('Bozza recuperata con successo');
                    console.log('[InserimentoAttivita] Bozza caricata');
                } catch (e) {
                    console.error('[InserimentoAttivita] Errore caricamento bozza:', e);
                    localStorage.removeItem(AUTOSAVE_KEY);
                }
            } else {
                // Utente ha rifiutato, elimina bozza
                localStorage.removeItem(AUTOSAVE_KEY);
            }
        }
    }

    /**
     * Pulisce auto-save
     */
    function clearAutoSave() {
        localStorage.removeItem('talon_inserimento_attivita_draft');
        console.log('[InserimentoAttivita] Auto-save pulito');
    }

    /**
     * Mostra loader
     */
    function showLoader() {
        const loader = document.createElement('div');
        loader.className = 'form-loader';
        loader.innerHTML = '<div class="spinner"></div><p>Salvataggio in corso...</p>';
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
        
        // Aggiungi CSS per spinner
        const style = document.createElement('style');
        style.textContent = `
            .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #007bff;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(loader);
    }

    // ========================================
    // UTILITY NOTIFICATIONS
    // ========================================

    function showSuccess(message, duration = 3000) {
        showNotification(message, 'success', duration);
    }

    function showError(message, duration = 5000) {
        showNotification(message, 'error', duration);
        console.error('❌', message);
    }

    function showInfo(message, duration = 2000) {
        showNotification(message, 'info', duration);
    }

    function showNotification(message, type = 'info', duration = 3000) {
        // Rimuovi notifiche esistenti
        const existing = document.querySelector('.talon-notification');
        if (existing) {
            existing.remove();
        }

        // Crea notifica
        const notification = document.createElement('div');
        notification.className = `talon-notification talon-notification-${type}`;
        notification.textContent = message;
        
        // Stili inline per la notifica
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 300px;
        `;

        // Colori per tipo
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            info: '#17a2b8',
            warning: '#ffc107'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // Aggiungi animazione CSS se non esiste
        if (!document.querySelector('#talon-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'talon-notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Auto-rimuovi dopo duration
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================

    // Attendi che il DOM sia pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeInserimentoForm);
    } else {
        // DOM già pronto
        initializeInserimentoForm();
    }

})();