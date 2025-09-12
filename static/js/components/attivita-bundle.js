/**
 * ========================================
 * TALON - Attività Bundle Loader
 * File: static/js/components/attivita-bundle.js
 * 
 * Versione: 1.0.0
 * Descrizione: Carica tutti i componenti attività nell'ordine corretto
 * Include: FormManager, SectionLoader, ModalManager
 * Pattern: Ispirato a eventi-bundle.js per consistenza architetturale
 * ========================================
 */

(function() {
    'use strict';
    
    
    // Configurazione componenti in ordine di dipendenza
    const componenti = [
        'attivita-form-manager.js',           // Base - gestione form generale
        'attivita-section-loader.js',         // Caricamento dinamico sezioni dettagli
        'attivita-modal-manager.js',          // Gestione modal (operazioni/esercitazioni)
        'attivita-slim-select.js'             // Inizializzazione Slim Select per select (ORIGINALE)
        // 'attivita-slim-select-initializer.js' // DISABILITATO - causava conflitto
    ];
    
    // Funzione per caricare script in sequenza
    function caricaScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                resolve();
            };
            script.onerror = () => {
                console.error(`❌ Errore caricamento componente attività: ${src}`);
                reject(new Error(`Errore caricamento ${src}`));
            };
            document.head.appendChild(script);
        });
    }
    
    // Verifica dipendenze critiche
    function verificaDipendenze() {
        const dipendenzeCritiche = [
            { nome: 'SlimSelect', oggetto: 'SlimSelect' },
            { nome: 'jQuery', oggetto: '$' }
        ];
        
        const mancanti = [];
        dipendenzeCritiche.forEach(dep => {
            if (typeof window[dep.oggetto] === 'undefined') {
                mancanti.push(dep.nome);
            }
        });
        
        if (mancanti.length > 0) {
            console.warn(`⚠️ ATTIVITA BUNDLE - Dipendenze mancanti: ${mancanti.join(', ')}`);
            console.warn('🔄 Alcuni componenti potrebbero funzionare in modalità fallback.');
        }
        
        return mancanti;
    }
    
    // Carica tutti i componenti in sequenza
    async function caricaAttivitaBundle() {
        const baseUrl = '/static/js/components/';
        const cacheVersion = '?v=' + (window.ATTIVITA_CACHE_VERSION || Date.now());
        
        try {
            // Verifica dipendenze prima del caricamento
            const dipendenzeMancanti = verificaDipendenze();
            
            for (const componente of componenti) {
                await caricaScript(baseUrl + componente + cacheVersion);
                // Piccola pausa per permettere l'inizializzazione
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            
            // Dispatch evento per notificare il completamento
            window.dispatchEvent(new CustomEvent('attivitaBundle:ready', {
                detail: { 
                    componenti: componenti,
                    dipendenzeMancanti: dipendenzeMancanti,
                    timestamp: Date.now()
                }
            }));
            
        } catch (error) {
            console.error('💥 ATTIVITA BUNDLE - Errore durante il caricamento:', error);
            
            // Fallback ai vecchi script se bundle fallisce
            fallbackToLegacyScripts();
        }
    }
    
    // Fallback ai vecchi script in caso di errore
    function fallbackToLegacyScripts() {
        const legacyScripts = [
            '/static/js/attivita/attivita_utils.js',
            '/static/js/attivita/attivita_forms.js',
            '/static/js/attivita/inserimento_attivita.js'
        ];
        
        legacyScripts.forEach(src => {
            const script = document.createElement('script');
            script.src = src + '?v=' + Date.now();
            document.head.appendChild(script);
        });
        
    }
    
    // Avvia il caricamento quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', caricaAttivitaBundle);
    } else {
        caricaAttivitaBundle();
    }
    
    // Export globale per debug
    window.TalonAttivitaBundle = {
        version: '1.0.0',
        components: componenti,
        reload: caricaAttivitaBundle
    };
    
})();