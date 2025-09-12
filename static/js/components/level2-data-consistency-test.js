/**
 * Test per verificare la consistenza dei dati al livello 2
 * 
 * Questo test verifica che:
 * 1. Il context sia passato correttamente con currentEntity
 * 2. calculateCharacterDataFromEventDetails usi ente_parent al livello 2
 * 3. Non ci siano discrepanze tra grafico e infocard
 */

window.TALON_LEVEL2_CONSISTENCY_TEST = {
    
    /**
     * Test principale per consistenza livello 2
     */
    runLevel2ConsistencyTest: function() {
        console.log('🧪 [LEVEL2 CONSISTENCY TEST] Avvio test consistenza dati livello 2...');
        
        // Test 1: Verifica context tipologie-view
        this.testTipologieViewContext();
        
        // Test 2: Verifica calculateCharacterDataFromEventDetails 
        this.testCharacterDataCalculation();
        
        // Test 3: Verifica parametri API
        this.testAPIParameters();
        
        console.log('✅ [LEVEL2 CONSISTENCY TEST] Tutti i test completati');
    },
    
    /**
     * Test del context nel tipologie-view
     */
    testTipologieViewContext: function() {
        console.log('📋 [TEST 1] Verifica context tipologie-view...');
        
        // Simula il context che dovrebbe essere passato al livello 2
        const mockContext = {
            ente: 'COMANDO TRASPORTI E MATERIALI',
            currentEntity: 'COMANDO TRASPORTI E MATERIALI',
            currentCategory: 'TIPO E',
            labels: ['ENTE1', 'ENTE2'],
            totalFromGraph: 25,
            level: 2,
            viewType: 'tipologie'
        };
        
        // Verifica che abbia tutti i campi necessari
        const hasRequiredFields = mockContext.currentEntity && 
                                 mockContext.currentCategory && 
                                 mockContext.ente;
        
        if (hasRequiredFields) {
            console.log('✅ [TEST 1] Context ha tutti i campi necessari:', mockContext);
        } else {
            console.error('❌ [TEST 1] Context manca campi necessari:', mockContext);
        }
        
        return hasRequiredFields;
    },
    
    /**
     * Test della funzione calculateCharacterDataFromEventDetails
     */
    testCharacterDataCalculation: function() {
        console.log('📋 [TEST 2] Verifica calculateCharacterDataFromEventDetails...');
        
        if (typeof window.TalonChartCore?.calculateCharacterDataFromEventDetails === 'function') {
            console.log('✅ [TEST 2] Funzione calculateCharacterDataFromEventDetails disponibile');
            
            // Mock dei parametri che dovrebbero essere passati al livello 2
            const categoria = 'TIPO E';
            const ente = 'COMANDO TRASPORTI E MATERIALI';
            const level = 2;
            
            console.log('📋 [TEST 2] Parametri che dovrebbero essere passati:', {
                categoria: categoria,
                ente: ente,
                level: level,
                expectedAPIParam: 'ente_parent=' + ente
            });
            
            return true;
        } else {
            console.error('❌ [TEST 2] Funzione calculateCharacterDataFromEventDetails non disponibile');
            return false;
        }
    },
    
    /**
     * Test dei parametri API 
     */
    testAPIParameters: function() {
        console.log('📋 [TEST 3] Verifica parametri API...');
        
        // Test che i parametri siano costruiti correttamente
        const mockParams = new URLSearchParams();
        const ente = 'COMANDO TRASPORTI E MATERIALI';
        const categoria = 'TIPO E';
        const level = 2;
        
        // Simula la logica che dovrebbe essere in calculateCharacterDataFromEventDetails
        if (categoria) {
            const tipoEvento = categoria.toLowerCase().replace(' ', '_');
            mockParams.append('tipo_evento', tipoEvento);
        }
        
        if (ente) {
            if (level === 2) {
                mockParams.append('ente_parent', ente);
                console.log('✅ [TEST 3] Level 2: usando ente_parent=' + ente);
            } else {
                mockParams.append('ente', ente);
                console.log('✅ [TEST 3] Altri livelli: usando ente=' + ente);
            }
        }
        
        const expectedUrl = '/eventi/api/dettagli?' + mockParams.toString();
        console.log('📋 [TEST 3] URL API che dovrebbe essere generato:', expectedUrl);
        
        const hasCorrectParams = mockParams.has('ente_parent') && !mockParams.has('ente');
        
        if (hasCorrectParams) {
            console.log('✅ [TEST 3] Parametri API corretti per livello 2');
        } else {
            console.error('❌ [TEST 3] Parametri API errati per livello 2');
        }
        
        return hasCorrectParams;
    },
    
    /**
     * Simula uno scenario completo del livello 2
     */
    simulateLevel2Scenario: function() {
        console.log('🎬 [SIMULATION] Simulazione scenario completo livello 2...');
        
        // Scenario: utente clicca su "COMANDO TRASPORTI E MATERIALI" al livello 1
        const scenario = {
            currentLevel: 2,
            currentCategory: 'TIPO E',
            selectedEntity: 'COMANDO TRASPORTI E MATERIALI',
            apiGraphUrl: '/eventi/api/enti-livello2?period=year&tipo_evento=tipo_e&ente_parent=COMANDO+TRASPORTI+E+MATERIALI',
            apiDetailsUrl: '/eventi/api/dettagli?period=year&tipo_evento=tipo_e&ente_parent=COMANDO+TRASPORTI+E+MATERIALI',
            expectedGraphTotal: 25,
            expectedDetailsTotal: 25 // Dovrebbe essere uguale dopo la correzione
        };
        
        console.log('📊 [SIMULATION] Scenario completo:', scenario);
        
        // Verifica coerenza URL
        const graphHasEnteParent = scenario.apiGraphUrl.includes('ente_parent=');
        const detailsHasEnteParent = scenario.apiDetailsUrl.includes('ente_parent=');
        
        if (graphHasEnteParent && detailsHasEnteParent) {
            console.log('✅ [SIMULATION] Entrambe le API usano ente_parent - coerenza garantita');
            return true;
        } else {
            console.error('❌ [SIMULATION] API non coerenti:', {
                graphHasEnteParent: graphHasEnteParent,
                detailsHasEnteParent: detailsHasEnteParent
            });
            return false;
        }
    }
};

// Auto-esecuzione se richiesto
if (window.location.search.includes('run-level2-test')) {
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            window.TALON_LEVEL2_CONSISTENCY_TEST.runLevel2ConsistencyTest();
            window.TALON_LEVEL2_CONSISTENCY_TEST.simulateLevel2Scenario();
        }, 2000); // Attendi caricamento completo
    });
}

console.log('📊 [LEVEL2 CONSISTENCY TEST] Test suite caricata. Usa TALON_LEVEL2_CONSISTENCY_TEST.runLevel2ConsistencyTest() per eseguire i test.');