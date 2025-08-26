/**
 * ========================================
 * TALON - FORM CONTAINER FIXES
 * File: static/js/attivita/form_container_fixes.js
 * 
 * Versione: 1.0.0
 * JavaScript per fix dinamici dei container form
 * ========================================
 */

(function() {
    'use strict';
    
    // Namespace per i fix
    window.TalonFormFixes = window.TalonFormFixes || {};
    
    /**
     * Fix per container che si sovrappongono
     */
    function fixOverlappingContainers() {
        const formSections = document.querySelectorAll('.form-section');
        
        formSections.forEach((section, index) => {
            // Assicura z-index corretto
            section.style.zIndex = 100 - index;
            
            // Fix per sezioni nascoste che occupano spazio
            if (section.style.display === 'none' || 
                section.getAttribute('data-active') === 'false') {
                section.style.visibility = 'hidden';
                section.style.height = '0';
                section.style.margin = '0';
                section.style.padding = '0';
                section.style.overflow = 'hidden';
            }
        });
    }
    
    /**
     * Fix per dropdown che vanno fuori schermo
     */
    function fixDropdownPositioning() {
        const searchableSelects = document.querySelectorAll('.searchable-select');
        
        searchableSelects.forEach(select => {
            const dropdown = select.querySelector('.searchable-select-dropdown');
            if (!dropdown) return;
            
            const input = select.querySelector('.searchable-select-input');
            if (!input) return;
            
            // Listener per quando il dropdown si apre
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && 
                        mutation.attributeName === 'style') {
                        
                        if (dropdown.style.display === 'block') {
                            setTimeout(() => {
                                positionDropdown(dropdown, input);
                            }, 10);
                        }
                    }
                });
            });
            
            observer.observe(dropdown, {
                attributes: true,
                attributeFilter: ['style']
            });
        });
    }
    
    /**
     * Posiziona correttamente un dropdown
     */
    function positionDropdown(dropdown, input) {
        const rect = input.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Calcola spazio disponibile sotto e sopra
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        // Se non c'è abbastanza spazio sotto, mostra sopra
        if (spaceBelow < dropdownRect.height && spaceAbove > spaceBelow) {
            dropdown.classList.add('dropdown-above');
            dropdown.style.bottom = (rect.height + 5) + 'px';
            dropdown.style.top = 'auto';
        } else {
            dropdown.classList.remove('dropdown-above');
            dropdown.style.top = '100%';
            dropdown.style.bottom = 'auto';
        }
        
        // Limita altezza se necessario
        const maxHeight = Math.max(spaceBelow, spaceAbove) - 20;
        if (maxHeight < dropdownRect.height) {
            dropdown.style.maxHeight = maxHeight + 'px';
        }
    }
    
    /**
     * Fix per form rows che si rompono
     */
    function fixFormRows() {
        const formRows = document.querySelectorAll('.form-row');
        
        formRows.forEach(row => {
            const groups = row.querySelectorAll('.form-group');
            
            // Calcola larghezza disponibile
            const rowWidth = row.offsetWidth;
            const groupCount = groups.length;
            const gap = 15; // Gap tra i gruppi
            const minGroupWidth = 200; // Larghezza minima per gruppo
            
            const availableWidth = rowWidth - (gap * (groupCount - 1));
            const groupWidth = availableWidth / groupCount;
            
            // Se non c'è abbastanza spazio, forza layout verticale
            if (groupWidth < minGroupWidth) {
                row.style.flexDirection = 'column';
                groups.forEach(group => {
                    group.style.width = '100%';
                    group.style.marginBottom = '15px';
                });
            } else {
                row.style.flexDirection = 'row';
                groups.forEach(group => {
                    group.style.width = 'auto';
                    group.style.flex = '1';
                });
            }
        });
    }
    
    /**
     * Fix per modal che non si centrano
     */
    function fixModalCentering() {
        const modals = document.querySelectorAll('.modal');
        
        modals.forEach(modal => {
            const modalContent = modal.querySelector('.modal-content');
            if (!modalContent) return;
            
            // Listener per quando il modal si apre
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && 
                        mutation.attributeName === 'style') {
                        
                        if (modal.style.display === 'block') {
                            setTimeout(() => {
                                centerModal(modal, modalContent);
                            }, 10);
                        }
                    }
                });
            });
            
            observer.observe(modal, {
                attributes: true,
                attributeFilter: ['style']
            });
        });
    }
    
    /**
     * Centra un modal
     */
    function centerModal(modal, modalContent) {
        const modalRect = modalContent.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Se il modal è più alto della viewport, allinea in alto con scroll
        if (modalRect.height > viewportHeight - 40) {
            modalContent.style.marginTop = '20px';
            modalContent.style.marginBottom = '20px';
            modalContent.style.maxHeight = (viewportHeight - 40) + 'px';
            modalContent.style.overflowY = 'auto';
        } else {
            // Centra verticalmente
            const topMargin = Math.max(20, (viewportHeight - modalRect.height) / 2);
            modalContent.style.marginTop = topMargin + 'px';
            modalContent.style.marginBottom = 'auto';
            modalContent.style.maxHeight = 'none';
            modalContent.style.overflowY = 'visible';
        }
        
        // Centra orizzontalmente se necessario
        if (modalRect.width > viewportWidth - 40) {
            modalContent.style.width = '95%';
            modalContent.style.maxWidth = 'none';
        }
    }
    
    /**
     * Fix per input che non si allineano
     */
    function fixInputAlignment() {
        // Trova tutti gli input e select
        const inputs = document.querySelectorAll('.form-control, input, select, textarea');
        const searchableInputs = document.querySelectorAll('.searchable-select-input');
        
        // Standardizza altezza per tutti gli input
        inputs.forEach(input => {
            if (input.type === 'textarea' || input.tagName === 'TEXTAREA') {
                // Le textarea hanno altezza minima diversa
                input.style.minHeight = '80px';
            } else {
                input.style.height = '42px';
                input.style.minHeight = '42px';
            }
            input.style.boxSizing = 'border-box';
        });
        
        // Fix per searchable inputs
        searchableInputs.forEach(input => {
            input.style.height = '42px';
            input.style.minHeight = '42px';
            input.style.boxSizing = 'border-box';
        });
    }
    
    /**
     * Fix per sezioni che si nascondono/mostrano
     */
    function fixToggleSections() {
        // Observer per sezioni che cambiano visibilità
        const detailSections = document.querySelectorAll('.detail-section');
        
        detailSections.forEach(section => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && 
                        (mutation.attributeName === 'style' || 
                         mutation.attributeName === 'data-active')) {
                        
                        setTimeout(() => {
                            // Ricalcola layout dopo cambio visibilità
                            fixFormRows();
                            fixInputAlignment();
                        }, 100);
                    }
                });
            });
            
            observer.observe(section, {
                attributes: true,
                attributeFilter: ['style', 'data-active']
            });
        });
    }
    
    /**
     * Fix per viewport resize
     */
    function handleResize() {
        // Debounce della funzione resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                fixFormRows();
                fixDropdownPositioning();
                fixModalCentering();
            }, 250);
        });
    }
    
    /**
     * Applicazione intelligente dei fix
     */
    function applyIntelligentFixes() {
        // Fix solo se ci sono problemi evidenti
        const container = document.querySelector('.form-container, .attivita-form-container');
        if (!container) return;
        
        // Controlla se il container ha problemi di overflow
        if (container.scrollWidth > container.clientWidth) {
            container.style.overflowX = 'hidden';
        }
        
        // Controlla se ci sono sezioni che si sovrappongono
        const sections = container.querySelectorAll('.form-section');
        let hasOverlap = false;
        
        for (let i = 0; i < sections.length - 1; i++) {
            const current = sections[i].getBoundingClientRect();
            const next = sections[i + 1].getBoundingClientRect();
            
            if (current.bottom > next.top) {
                hasOverlap = true;
                break;
            }
        }
        
        if (hasOverlap) {
            fixOverlappingContainers();
        }
    }
    
    /**
     * Inizializzazione dei fix
     */
    function initFormFixes() {
        console.log('[Form Fixes] Inizializzazione fix container form...');
        
        // Applica tutti i fix
        fixInputAlignment();
        fixFormRows();
        fixDropdownPositioning();
        fixModalCentering();
        fixToggleSections();
        applyIntelligentFixes();
        
        // Setup event listeners
        handleResize();
        
        console.log('[Form Fixes] Fix applicati con successo');
    }
    
    /**
     * API pubblica
     */
    window.TalonFormFixes = {
        init: initFormFixes,
        fixInputAlignment: fixInputAlignment,
        fixFormRows: fixFormRows,
        fixDropdownPositioning: fixDropdownPositioning,
        fixModalCentering: fixModalCentering,
        applyIntelligentFixes: applyIntelligentFixes
    };
    
    // Auto-inizializzazione quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFormFixes);
    } else {
        // DOM già caricato, inizializza subito
        setTimeout(initFormFixes, 100);
    }
    
    // Re-applica fix quando il contenuto cambia dinamicamente
    const targetNode = document.body;
    const config = { childList: true, subtree: true, attributes: true };
    
    const callback = function(mutationsList, observer) {
        let needsRefix = false;
        
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                // Nuovo contenuto aggiunto
                const addedNodes = Array.from(mutation.addedNodes);
                if (addedNodes.some(node => 
                    node.nodeType === 1 && 
                    (node.classList.contains('form-section') || 
                     node.querySelector('.form-section')))) {
                    needsRefix = true;
                    break;
                }
            }
        }
        
        if (needsRefix) {
            setTimeout(() => {
                fixInputAlignment();
                fixFormRows();
                applyIntelligentFixes();
            }, 100);
        }
    };
    
    const observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    
})();