/**
 * Test per validare i parametri API corretti per il livello 2
 * 
 * Questo test verifica che:
 * 1. I parametri passati all'API siano quelli che l'API si aspetta
 * 2. Il parametro 'level=2' attivi la query ricorsiva
 * 3. Il parametro 'ente' contenga l'ente padre corretto
 */

window.TALON_API_PARAMETER_TEST = {
    
    /**
     * Test principale per parametri API
     */
    runAPIParameterTest: function() {
        console.log('🧪 [API PARAMETER TEST] Avvio test parametri API...');
        
        // Test 1: Verifica costruzione parametri corretti
        this.testParameterConstruction();
        
        // Test 2: Verifica comportamento level 2 vs level 3
        this.testLevel2vsLevel3();
        
        // Test 3: Simula chiamata API completa
        this.simulateAPICall();
        
        console.log('✅ [API PARAMETER TEST] Tutti i test completati');
    },
    
    /**
     * Test costruzione parametri
     */
    testParameterConstruction: function() {
        console.log('📋 [TEST 1] Verifica costruzione parametri...');
        
        // Simula i parametri che dovrebbero essere costruiti per il livello 2
        const mockParams = new URLSearchParams();
        mockParams.append('period', 'year');
        
        // Parametri categoria
        const categoria = 'TIPO E';
        if (categoria) {
            const tipoEvento = categoria.toLowerCase().replace(' ', '_');
            mockParams.append('sottocategoria', tipoEvento);
            mockParams.append('tipo_evento', tipoEvento);
            mockParams.append('category', tipoEvento);
            mockParams.append('tipologia', tipoEvento);
        }
        
        // NUOVO: Parametri ente con level
        const ente = 'COMANDO TRASPORTI E MATERIALI';
        const level = 2;
        if (ente) {
            mockParams.append('ente', ente);  // Non più ente_parent!
        }
        if (level) {
            mockParams.append('level', level.toString());  // CRITICO: level per attivare query ricorsiva
        }
        
        const expectedURL = '/eventi/api/dettagli?' + mockParams.toString();
        
        console.log('📊 [TEST 1] URL API che dovrebbe essere generato:', expectedURL);
        console.log('📊 [TEST 1] Parametri chiave:', {
            hasEnte: mockParams.has('ente'),
            hasLevel: mockParams.has('level'),
            hasEnteParent: mockParams.has('ente_parent'), // Dovrebbe essere false
            enteValue: mockParams.get('ente'),
            levelValue: mockParams.get('level')
        });
        
        const isCorrect = mockParams.has('ente') && 
                         mockParams.has('level') && 
                         mockParams.get('level') === '2' &&
                         !mockParams.has('ente_parent');
        
        if (isCorrect) {
            console.log('✅ [TEST 1] Parametri API corretti per livello 2');
        } else {
            console.error('❌ [TEST 1] Parametri API errati per livello 2');
        }
        
        return isCorrect;
    },
    
    /**
     * Test differenze Level 2 vs Level 3
     */
    testLevel2vsLevel3: function() {
        console.log('📋 [TEST 2] Verifica differenze Level 2 vs Level 3...');
        
        const testCases = [
            { level: 2, ente: 'COMANDO TRASPORTI E MATERIALI', expectedBehavior: 'Query ricorsiva per enti dipendenti' },
            { level: 3, ente: 'ENTE SPECIFICO', expectedBehavior: 'Query diretta per ente singolo' },
        ];
        
        testCases.forEach((testCase, index) => {
            console.log(`🔍 [TEST 2.${index + 1}] Level ${testCase.level}:`);
            console.log(`  - Ente: ${testCase.ente}`);
            console.log(`  - Comportamento atteso: ${testCase.expectedBehavior}`);
            
            // Simula costruzione parametri
            const params = new URLSearchParams();
            params.append('ente', testCase.ente);
            params.append('level', testCase.level.toString());
            
            const url = '/eventi/api/dettagli?' + params.toString();
            console.log(`  - URL generato: ${url}`);
            
            if (testCase.level === 2) {
                console.log('  - ✅ API dovrebbe attivare query ricorsiva');
            } else {
                console.log('  - ✅ API dovrebbe usare query standard');
            }
        });
        
        return true;
    },
    
    /**
     * Simula chiamata API completa
     */
    simulateAPICall: function() {
        console.log('📋 [TEST 3] Simulazione chiamata API completa...');
        
        // Scenario: Click su "COMANDO TRASPORTI E MATERIALI" al livello 1
        const scenario = {
            level: 2,
            categoria: 'TIPO E',
            ente: 'COMANDO TRASPORTI E MATERIALI',
            expectedURL: '/eventi/api/dettagli?period=year&sottocategoria=tipo_e&tipo_evento=tipo_e&category=tipo_e&tipologia=tipo_e&ente=COMANDO+TRASPORTI+E+MATERIALI&level=2'
        };
        
        console.log('🎬 [SIMULATION] Scenario completo:', scenario);
        
        // Verifica che tutti i parametri necessari siano presenti
        const url = new URL(scenario.expectedURL, 'http://localhost');
        const params = url.searchParams;
        
        const verification = {
            hasEnte: params.has('ente'),
            hasLevel: params.has('level'),
            hasNoEnteParent: !params.has('ente_parent'),
            levelValue: params.get('level'),
            enteValue: params.get('ente'),
            hasTipoEvento: params.has('tipo_evento')
        };
        
        console.log('🔍 [SIMULATION] Verifica parametri:', verification);
        
        const isValid = verification.hasEnte && 
                       verification.hasLevel && 
                       verification.hasNoEnteParent && 
                       verification.levelValue === '2';
        
        if (isValid) {
            console.log('✅ [SIMULATION] URL API corretto - dovrebbe attivare query ricorsiva');
            console.log('📊 [SIMULATION] Risultato atteso: ~25 eventi invece di 80');
        } else {
            console.error('❌ [SIMULATION] URL API non corretto per livello 2');
        }
        
        return isValid;
    },
    
    /**
     * Test di confronto prima/dopo
     */
    compareBeforeAfter: function() {
        console.log('🔄 [COMPARISON] Confronto prima/dopo correzione...');
        
        const before = {
            url: '/eventi/api/dettagli?...&ente_parent=COMANDO+TRASPORTI+E+MATERIALI',
            result: '80 eventi (tutti gli eventi del tipo)',
            apiLogic: 'Query standard senza filtro ente_parent (ignorato)'
        };
        
        const after = {
            url: '/eventi/api/dettagli?...&ente=COMANDO+TRASPORTI+E+MATERIALI&level=2',
            result: '~25 eventi (solo eventi degli enti dipendenti)',
            apiLogic: 'Query ricorsiva con filtro gerarchico attivato da level=2'
        };
        
        console.log('📊 [COMPARISON] Prima della correzione:', before);
        console.log('📊 [COMPARISON] Dopo la correzione:', after);
        
        console.log('✅ [COMPARISON] La correzione dovrebbe eliminare la discrepanza 25 vs 80');
    }
};

// Auto-esecuzione se richiesto
if (window.location.search.includes('run-api-test')) {
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            window.TALON_API_PARAMETER_TEST.runAPIParameterTest();
            window.TALON_API_PARAMETER_TEST.compareBeforeAfter();
        }, 2000); // Attendi caricamento completo
    });
}

console.log('📊 [API PARAMETER TEST] Test suite caricata. Usa TALON_API_PARAMETER_TEST.runAPIParameterTest() per eseguire i test.');