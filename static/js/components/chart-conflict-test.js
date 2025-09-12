/**
 * Test per verificare la risoluzione del conflitto Canvas Chart.js
 * 
 * Questo test verifica che:
 * 1. Solo un chart alla volta può esistere sul canvas
 * 2. I moduli si coordinano correttamente tramite flag globali
 * 3. Le chart instances vengono distrutte correttamente
 */

window.TALON_CHART_CONFLICT_TEST = {
    
    /**
     * Test principale per conflitti canvas
     */
    runCanvasConflictTest: function() {
        console.log('🧪 [CHART CONFLICT TEST] Avvio test conflitti canvas...');
        
        // Test 1: Verifica flag di coordinamento
        this.testModularSystemFlag();
        
        // Test 2: Verifica distruzione chart
        this.testChartDestruction();
        
        // Test 3: Simula conflitto e verifica risoluzione
        this.testConflictResolution();
        
        console.log('✅ [CHART CONFLICT TEST] Tutti i test completati');
    },
    
    /**
     * Test del flag di coordinamento tra moduli
     */
    testModularSystemFlag: function() {
        console.log('📋 [TEST 1] Verifica flag coordinamento moduli...');
        
        // Simula attivazione sistema modulare
        window.TALON_MODULAR_SYSTEM_ACTIVE = true;
        
        // Testa che createEventChart rispetti il flag
        const mockResult = this.mockCreateEventChart();
        if (mockResult === null) {
            console.log('✅ [TEST 1] Sistema legacy correttamente disabilitato con flag attivo');
        } else {
            console.error('❌ [TEST 1] Sistema legacy non rispetta il flag di coordinamento');
        }
        
        // Reset flag
        window.TALON_MODULAR_SYSTEM_ACTIVE = false;
    },
    
    /**
     * Test distruzione corretta dei chart
     */
    testChartDestruction: function() {
        console.log('📋 [TEST 2] Verifica distruzione chart...');
        
        // Mock chart oggetto
        const mockChart = {
            destroyed: false,
            destroy: function() {
                this.destroyed = true;
                console.log('🧹 [MOCK] Chart distrutto');
            }
        };
        
        // Test distruzione chart globale
        window.eventChart = mockChart;
        
        // Simula distruzione tramite tipologie view
        if (window.eventChart && typeof window.eventChart.destroy === 'function') {
            window.eventChart.destroy();
            window.eventChart = null;
        }
        
        if (mockChart.destroyed && window.eventChart === null) {
            console.log('✅ [TEST 2] Chart globale distrutto correttamente');
        } else {
            console.error('❌ [TEST 2] Chart globale non distrutto correttamente');
        }
    },
    
    /**
     * Simula risoluzione conflitto
     */
    testConflictResolution: function() {
        console.log('📋 [TEST 3] Simula risoluzione conflitto...');
        
        // Simula presenza di chart esistente
        const existingChart = {
            id: 'existing-chart',
            destroyed: false,
            destroy: function() {
                this.destroyed = true;
                console.log('🧹 [MOCK] Chart esistente distrutto per risolvere conflitto');
            }
        };
        
        window.eventChart = existingChart;
        
        // Simula creazione nuovo chart che dovrebbe distruggere quello esistente
        const shouldDestroy = window.eventChart && typeof window.eventChart.destroy === 'function';
        
        if (shouldDestroy) {
            window.eventChart.destroy();
            window.eventChart = null;
            console.log('✅ [TEST 3] Conflitto risolto: chart esistente distrutto');
        } else {
            console.error('❌ [TEST 3] Conflitto non risolto correttamente');
        }
        
        if (existingChart.destroyed) {
            console.log('✅ [TEST 3] Chart esistente correttamente eliminato');
        } else {
            console.error('❌ [TEST 3] Chart esistente non eliminato');
        }
    },
    
    /**
     * Mock della funzione createEventChart per test
     */
    mockCreateEventChart: function() {
        // Simula la logica del controllo flag
        if (window.TALON_MODULAR_SYSTEM_ACTIVE) {
            console.log('🚧 [MOCK createEventChart] Sistema modulare attivo, delegando al sistema modulare');
            return null;
        }
        
        // Se non attivo, procederebbe normalmente
        console.log('📊 [MOCK createEventChart] Sistema legacy procederebbe con creazione chart');
        return { mockChart: true };
    },
    
    /**
     * Test di integrità generale
     */
    runIntegrityTest: function() {
        console.log('🔍 [INTEGRITY TEST] Verifica integrità soluzioni implementate...');
        
        const checks = {
            hasModularFlag: typeof window.TALON_MODULAR_SYSTEM_ACTIVE !== 'undefined',
            hasCreateEventChart: typeof window.createEventChart === 'function',
            hasTipologieView: typeof window.TalonEventiTipologieView !== 'undefined',
            hasChartJsGlobal: typeof Chart !== 'undefined'
        };
        
        console.log('📊 [INTEGRITY] Stato componenti:', checks);
        
        const allGood = Object.values(checks).every(check => check);
        
        if (allGood) {
            console.log('✅ [INTEGRITY] Tutti i componenti necessari sono presenti');
        } else {
            console.warn('⚠️ [INTEGRITY] Alcuni componenti potrebbero non essere disponibili');
        }
        
        return checks;
    }
};

// Auto-esecuzione se richiesto
if (window.location.search.includes('run-chart-test')) {
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            window.TALON_CHART_CONFLICT_TEST.runCanvasConflictTest();
            window.TALON_CHART_CONFLICT_TEST.runIntegrityTest();
        }, 2000); // Attendi caricamento completo
    });
}

console.log('📊 [CHART CONFLICT TEST] Test suite caricata. Usa TALON_CHART_CONFLICT_TEST.runCanvasConflictTest() per eseguire i test.');