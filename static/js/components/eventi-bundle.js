/**
 * ========================================
 * TALON - Eventi Bundle Loader
 * File: static/js/components/eventi-bundle.js
 * 
 * Versione: 1.0.0
 * Descrizione: Carica tutti i componenti eventi nell'ordine corretto
 * Include: ModalManager, SearchAPI, FormHandler, SlimSelectInitializer
 * ========================================
 */

(function() {
    'use strict';
    
    console.log('🚀 EVENTI BUNDLE v1.0 - Caricamento componenti eventi...');
    
    // Configurazione componenti in ordine di dipendenza
    const componenti = [
        'eventi-modal-manager.js',    // Base - nessuna dipendenza
        'eventi-search-api.js',       // Dipende da modal-manager
        'eventi-form-handler.js',     // Indipendente
        'eventi-slim-select-initializer.js' // Può usare gli altri
    ];
    
    // Funzione per caricare script in sequenza
    function caricaScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(`✅ Componente caricato: ${src}`);
                resolve();
            };
            script.onerror = () => {
                console.error(`❌ Errore caricamento: ${src}`);
                reject(new Error(`Errore caricamento ${src}`));
            };
            document.head.appendChild(script);
        });
    }
    
    // Carica tutti i componenti in sequenza
    async function caricaEventiBundle() {
        const baseUrl = '/static/js/components/';
        const cacheVersion = '?v=' + (window.EVENTI_CACHE_VERSION || Date.now());
        
        try {
            for (const componente of componenti) {
                await caricaScript(baseUrl + componente + cacheVersion);
                // Piccola pausa per permettere l'inizializzazione
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            console.log('🎉 EVENTI BUNDLE - Tutti i componenti caricati con successo!');
            
            // Dispatch evento per notificare il completamento
            window.dispatchEvent(new CustomEvent('eventiBundle:ready', {
                detail: { componenti: componenti }
            }));
            
        } catch (error) {
            console.error('💥 EVENTI BUNDLE - Errore durante il caricamento:', error);
        }
    }
    
    // Avvia il caricamento quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', caricaEventiBundle);
    } else {
        caricaEventiBundle();
    }
    
})();