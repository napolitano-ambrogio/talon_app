/**
 * ========================================
 * TALON - ATTIVITÀ FORMS SHARED
 * File: static/js/attivita_forms.js
 * 
 * Logica condivisa tra i form di inserimento
 * e modifica attività
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Namespace per evitare conflitti
    window.TalonAttivitaForms = window.TalonAttivitaForms || {};

    /**
     * Configurazione sezioni form
     */
    const FORM_SECTIONS = {
        'MOVIMENTI E TRASPORTI': 'dettagli-trasporti',
        'MANTENIMENTO E SQUADRE A CONTATTO': 'dettagli-mantenimento',
        'RIFORNIMENTI': 'dettagli-rifornimenti',
        'GESTIONE TRANSITO': 'dettagli-getra'
    };

    /**
     * Toggle visibilità sezioni dettaglio basato su tipologia
     * @param {string} selectId - ID del select tipologia
     */
    function toggleActivityDetails(selectId = 'tipologia_id') {
        const select = document.getElementById(selectId);
        if (!select) {
            console.warn(`[TalonAttivitaForms] Select con ID '${selectId}' non trovato`);
            return;
        }

        const selectedOption = select.options[select.selectedIndex];
        if (!selectedOption) return;

        const selectedText = selectedOption.text.trim().toUpperCase();
        
        // Debug info
        console.log(`[TalonAttivitaForms] Tipologia selezionata: ${selectedText}`);

        // Nascondi tutte le sezioni
        hideAllDetailSections();

        // Mostra la sezione corrispondente
        const sectionId = FORM_SECTIONS[selectedText];
        if (sectionId) {
            showSection(sectionId);
        }
    }

    /**
     * Nasconde tutte le sezioni di dettaglio
     */
    function hideAllDetailSections() {
        Object.values(FORM_SECTIONS).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
                section.setAttribute('data-active', 'false');
            }
        });
    }

    /**
     * Mostra una specifica sezione
     * @param {string} sectionId - ID della sezione da mostrare
     */
    function showSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'block';
            section.setAttribute('data-active', 'true');
            
            // Anima l'apparizione
            section.style.opacity = '0';
            setTimeout(() => {
                section.style.transition = 'opacity 0.3s ease-in';
                section.style.opacity = '1';
            }, 10);
            
            console.log(`[TalonAttivitaForms] Sezione attivata: ${sectionId}`);
        }
    }

    /**
     * Inizializza i listener per il form
     * @param {Object} config - Configurazione specifica per il form
     */
    function initializeFormListeners(config = {}) {
        const tipologiaSelectId = config.tipologiaSelectId || 'tipologia_id';
        
        // Listener per cambio tipologia
        const tipologiaSelect = document.getElementById(tipologiaSelectId);
        if (tipologiaSelect) {
            tipologiaSelect.addEventListener('change', function() {
                toggleActivityDetails(tipologiaSelectId);
                
                // Callback custom se fornito
                if (config.onTipologiaChange) {
                    config.onTipologiaChange(this.value, this.options[this.selectedIndex].text);
                }
            });
        }

        // Inizializza searchable selects se disponibili
        if (window.TALON_API && window.TALON_API.refreshSearchableSelects) {
            setTimeout(() => {
                window.TALON_API.refreshSearchableSelects();
            }, 100);
        }
    }

    /**
     * Validazione campi richiesti nella sezione attiva
     * @returns {boolean} - true se tutti i campi richiesti sono compilati
     */
    function validateActiveSection() {
        // Trova la sezione attiva
        const activeSection = document.querySelector('[data-active="true"]');
        if (!activeSection) return true;

        let isValid = true;
        const requiredFields = activeSection.querySelectorAll('[required], [data-required]');
        
        requiredFields.forEach(field => {
            if (!field.value || field.value.trim() === '') {
                field.classList.add('is-invalid');
                isValid = false;
            } else {
                field.classList.remove('is-invalid');
            }
        });

        if (!isValid) {
            console.warn('[TalonAttivitaForms] Campi richiesti mancanti nella sezione attiva');
        }

        return isValid;
    }

    /**
     * Reset di tutti i campi nelle sezioni di dettaglio
     */
    function resetDetailSections() {
        Object.values(FORM_SECTIONS).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                // Reset input text, number, date
                section.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]').forEach(input => {
                    input.value = '';
                });
                
                // Reset select
                section.querySelectorAll('select').forEach(select => {
                    select.selectedIndex = 0;
                });
                
                // Reset textarea
                section.querySelectorAll('textarea').forEach(textarea => {
                    textarea.value = '';
                });
                
                // Rimuovi classi di validazione
                section.querySelectorAll('.is-invalid').forEach(elem => {
                    elem.classList.remove('is-invalid');
                });
            }
        });
        
        console.log('[TalonAttivitaForms] Sezioni di dettaglio resettate');
    }

    /**
     * Popola i campi di una sezione con dati
     * @param {string} sectionId - ID della sezione
     * @param {Object} data - Dati da popolare
     */
    function populateSection(sectionId, data) {
        const section = document.getElementById(sectionId);
        if (!section || !data) return;

        Object.keys(data).forEach(fieldName => {
            const field = section.querySelector(`[name="${fieldName}"]`);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = !!data[fieldName];
                } else if (field.type === 'radio') {
                    const radio = section.querySelector(`[name="${fieldName}"][value="${data[fieldName]}"]`);
                    if (radio) radio.checked = true;
                } else {
                    field.value = data[fieldName] || '';
                }
            }
        });
        
        console.log(`[TalonAttivitaForms] Sezione ${sectionId} popolata con dati`);
    }

    /**
     * Ottiene i dati dalla sezione attiva
     * @returns {Object} - Oggetto con i dati della sezione attiva
     */
    function getActiveSectionData() {
        const activeSection = document.querySelector('[data-active="true"]');
        if (!activeSection) return {};

        const data = {};
        
        // Raccogli tutti i campi con name
        activeSection.querySelectorAll('[name]').forEach(field => {
            if (field.type === 'checkbox') {
                data[field.name] = field.checked;
            } else if (field.type === 'radio') {
                if (field.checked) {
                    data[field.name] = field.value;
                }
            } else {
                data[field.name] = field.value;
            }
        });

        return data;
    }

    /**
     * Aggiunge asterisco ai campi richiesti nella sezione attiva
     */
    function markRequiredFields() {
        document.querySelectorAll('.form-group label').forEach(label => {
            // Rimuovi asterischi esistenti
            label.textContent = label.textContent.replace(' *', '');
            
            // Trova il campo associato
            const fieldId = label.getAttribute('for');
            if (fieldId) {
                const field = document.getElementById(fieldId);
                if (field && (field.hasAttribute('required') || field.hasAttribute('data-required'))) {
                    // Aggiungi asterisco solo se il campo è nella sezione attiva
                    const section = field.closest('[data-active]');
                    if (!section || section.getAttribute('data-active') === 'true') {
                        label.textContent += ' *';
                        label.style.fontWeight = '600';
                    }
                }
            }
        });
    }

    /**
     * Inizializzazione automatica per sezioni GETRA
     */
    function initializeGetraSection() {
        const getraSection = document.getElementById('dettagli-getra');
        if (!getraSection) return;

        // Auto-calcolo volume se presenti tutti i dati
        const inputs = {
            personale: getraSection.querySelector('#numero_personale'),
            mezzi: getraSection.querySelector('#numero_mezzi'),
            volume: getraSection.querySelector('#volume')
        };

        // Listener per suggerimento unità di misura basato su volume
        if (inputs.volume) {
            inputs.volume.addEventListener('change', function() {
                const value = parseFloat(this.value);
                const unitSelect = getraSection.querySelector('#unita_di_misura_getra');
                
                if (unitSelect && value) {
                    // Suggerisci unità di misura appropriata
                    if (value < 100) {
                        unitSelect.value = 'KG';
                    } else if (value < 1000) {
                        unitSelect.value = 'M_LIN';
                    } else {
                        unitSelect.value = 'M3';
                    }
                }
            });
        }

        console.log('[TalonAttivitaForms] Sezione GETRA inizializzata');
    }

    /**
     * Helper per formattazione date
     * @param {string} dateString - Data in formato ISO
     * @returns {string} - Data in formato italiano DD/MM/YYYY
     */
    function formatDateIT(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    /**
     * Helper per parsing date italiane
     * @param {string} dateString - Data in formato DD/MM/YYYY
     * @returns {string} - Data in formato ISO per input date
     */
    function parseITDate(dateString) {
        if (!dateString) return '';
        const parts = dateString.split('/');
        if (parts.length !== 3) return '';
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    /**
     * Validazione date (data fine >= data inizio)
     */
    function validateDateRange() {
        const dataInizio = document.getElementById('data_inizio');
        const dataFine = document.getElementById('data_fine');
        
        if (dataInizio && dataFine && dataInizio.value && dataFine.value) {
            if (dataFine.value < dataInizio.value) {
                dataFine.classList.add('is-invalid');
                
                // Mostra messaggio di errore
                let errorMsg = dataFine.parentNode.querySelector('.invalid-feedback');
                if (!errorMsg) {
                    errorMsg = document.createElement('div');
                    errorMsg.className = 'invalid-feedback';
                    errorMsg.style.display = 'block';
                    dataFine.parentNode.appendChild(errorMsg);
                }
                errorMsg.textContent = 'La data fine deve essere successiva alla data inizio';
                
                return false;
            } else {
                dataFine.classList.remove('is-invalid');
                const errorMsg = dataFine.parentNode.querySelector('.invalid-feedback');
                if (errorMsg) errorMsg.remove();
            }
        }
        
        return true;
    }

    /**
     * Inizializza validazione date
     */
    function initializeDateValidation() {
        const dataInizio = document.getElementById('data_inizio');
        const dataFine = document.getElementById('data_fine');
        
        if (dataInizio) {
            dataInizio.addEventListener('change', validateDateRange);
        }
        
        if (dataFine) {
            dataFine.addEventListener('change', validateDateRange);
        }
    }

    // ========================================
    // API PUBBLICA
    // ========================================
    
    window.TalonAttivitaForms = {
        // Funzioni principali
        toggleActivityDetails,
        initializeFormListeners,
        validateActiveSection,
        resetDetailSections,
        populateSection,
        getActiveSectionData,
        
        // Helper
        hideAllDetailSections,
        showSection,
        markRequiredFields,
        initializeGetraSection,
        formatDateIT,
        parseITDate,
        validateDateRange,
        initializeDateValidation,
        
        // Costanti
        FORM_SECTIONS,
        
        // Versione
        version: '1.0.0'
    };

    console.log('[TalonAttivitaForms] Modulo caricato v' + window.TalonAttivitaForms.version);

})(window, document);