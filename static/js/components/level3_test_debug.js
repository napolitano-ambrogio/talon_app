/**
 * Script di test per verificare le correzioni del livello 3
 * Esegui nella console del browser dopo aver navigato al livello 3
 */

window.Level3TestDebug = {
    
    /**
     * Test specifico per info card al livello 3
     */
    async testInfoCards() {
        console.log('📋 [Level3TestDebug] Test specifico info card al livello 3');
        
        if (eventState.currentLevel !== 3) {
            console.warn('⚠️ [Level3TestDebug] Non al livello 3. Naviga prima a un ente specifico');
            return false;
        }
        
        // Test elementi DOM
        const elements = {
            total: document.getElementById('eventTotalValue'),
            categories: document.getElementById('eventCategoriesValue'),
            entities: document.getElementById('eventEntitiesValue'),
            positive: document.getElementById('eventPositiveValue'),
            negative: document.getElementById('eventNegativeValue')
        };
        
        const found = Object.keys(elements).filter(key => !!elements[key]);
        console.log('🔍 [Level3TestDebug] Elementi trovati:', found);
        
        if (found.length < 5) {
            console.error('❌ [Level3TestDebug] Mancano elementi info card:', 
                         Object.keys(elements).filter(key => !elements[key]));
            return false;
        }
        
        // Leggi valori attuali
        const currentValues = {
            total: parseInt(elements.total.textContent) || 0,
            categories: parseInt(elements.categories.textContent) || 0,
            entities: parseInt(elements.entities.textContent) || 0,
            positive: parseInt(elements.positive.textContent) || 0,
            negative: parseInt(elements.negative.textContent) || 0
        };
        
        console.log('🔍 [Level3TestDebug] Verifica correzioni totalEvents:');
        
        // Test specifico per il bug totalEvents = 0
        const chartCanvas = document.getElementById('eventChart') || document.getElementById('eventChartCanvas');
        if (chartCanvas && window.Chart) {
            const chartInstance = Chart.getChart(chartCanvas);
            if (chartInstance && chartInstance.data && chartInstance.data.datasets[0]) {
                const chartData = chartInstance.data.datasets[0].data;
                const chartSum = chartData.reduce((sum, value) => sum + value, 0);
                
                console.log('📊 [Level3TestDebug] Confronto totalEvents fix:', {
                    chartDataSum: chartSum,
                    infocardTotal: currentValues.total,
                    bugFixed: chartSum > 0 && currentValues.total > 0 && chartSum === currentValues.total,
                    previouslyWas: 'totalEvents era 0 nonostante chartSum fosse > 0'
                });
                
                if (chartSum > 0 && currentValues.total === 0) {
                    console.error('❌ [Level3TestDebug] BUG ANCORA PRESENTE: totalEvents = 0 ma chartSum =', chartSum);
                    return false;
                }
            }
        }
        
        console.log('📋 [Level3TestDebug] Valori attuali info card:', currentValues);
        
        // Test aspettative livello 3
        const expectedStructure = {
            categories: 1, // Una tipologia
            entities: 1,   // Un ente
            totalShouldBePositive: true // Il totale dovrebbe essere > 0
        };
        
        const validation = {
            categoriesCorrect: currentValues.categories === expectedStructure.categories,
            entitiesCorrect: currentValues.entities === expectedStructure.entities,
            totalPositive: currentValues.total > 0,
            hasCharacterData: currentValues.positive >= 0 && currentValues.negative >= 0,
            totalMatchesSum: currentValues.total >= (currentValues.positive + currentValues.negative)
        };
        
        console.log('\u2705/\u274c [Level3TestDebug] Validazione info card:', validation);
        
        const allValid = Object.values(validation).every(v => v === true);
        console.log(allValid ? '\u2705' : '\u274c', '[Level3TestDebug] Info card validation result:', allValid);
        
        return allValid;
    },
    
    /**
     * Debug rapido info card - mostra valori correnti
     */
    debugInfoCards() {
        console.log('🔍 [Level3TestDebug] Debug rapido info card...');
        
        const elements = {
            total: document.getElementById('eventTotalValue'),
            categories: document.getElementById('eventCategoriesValue'),
            entities: document.getElementById('eventEntitiesValue'),
            positive: document.getElementById('eventPositiveValue'),
            negative: document.getElementById('eventNegativeValue')
        };
        
        const values = {};
        const elementsFound = {};
        
        Object.keys(elements).forEach(key => {
            elementsFound[key] = !!elements[key];
            values[key] = elements[key] ? elements[key].textContent : 'ELEMENTO_NON_TROVATO';
        });
        
        console.log('📋 [Level3TestDebug] Elementi DOM trovati:', elementsFound);
        console.log('📋 [Level3TestDebug] Valori correnti:', values);
        console.log('📋 [Level3TestDebug] Stato eventState:', {
            level: eventState.currentLevel,
            entity: eventState.currentEntity,
            category: eventState.currentCategory
        });
        
        // Verifica se siamo al livello 3
        if (eventState.currentLevel !== 3) {
            console.warn('⚠️ [Level3TestDebug] NON AL LIVELLO 3! Naviga prima a un ente specifico');
            return false;
        }
        
        // Controllo problemi comuni
        const issues = [];
        if (values.total === '0') issues.push('Totale = 0');
        if (values.categories !== '1') issues.push('Categorie != 1');
        if (values.entities !== '1') issues.push('Entità != 1');
        if (values.positive === '0' && values.negative === '0') issues.push('Positivi e negativi entrambi 0');
        
        if (issues.length > 0) {
            console.warn('⚠️ [Level3TestDebug] Problemi rilevati:', issues);
        } else {
            console.log('✅ [Level3TestDebug] Info card sembrano corrette!');
        }
        
        return issues.length === 0;
    },
    
    /**
     * Test specifico per verificare il fix del bug totalEvents = 0
     */
    async testTotalEventsFix() {
        console.log('🔧 [Level3TestDebug] Test specifico fix bug totalEvents = 0');
        
        if (eventState.currentLevel !== 3) {
            console.warn('⚠️ [Level3TestDebug] Non al livello 3. Naviga prima a un ente specifico');
            return false;
        }
        
        // Step 1: Verifica che ci siano dati nel grafico
        const chartCanvas = document.getElementById('eventChart') || document.getElementById('eventChartCanvas');
        if (!chartCanvas) {
            console.error('❌ [Level3TestDebug] Canvas grafico non trovato');
            return false;
        }
        
        const chartInstance = Chart.getChart(chartCanvas);
        if (!chartInstance || !chartInstance.data || !chartInstance.data.datasets[0]) {
            console.error('❌ [Level3TestDebug] Istanza grafico non valida');
            return false;
        }
        
        const chartData = chartInstance.data.datasets[0].data;
        const chartDataSum = chartData.reduce((sum, value) => sum + value, 0);
        
        console.log('📈 [Level3TestDebug] Dati grafico:', {
            chartData: chartData,
            chartDataSum: chartDataSum,
            hasData: chartDataSum > 0
        });
        
        // Step 2: Verifica che l'info card total sia allineata
        const totalValueEl = document.getElementById('eventTotalValue');
        if (!totalValueEl) {
            console.error('❌ [Level3TestDebug] Elemento eventTotalValue non trovato');
            return false;
        }
        
        const infocardTotal = parseInt(totalValueEl.textContent) || 0;
        
        // Step 3: Verifica il fix
        const fixSuccessful = {
            hasChartData: chartDataSum > 0,
            hasInfocardData: infocardTotal > 0,
            valuesMatch: chartDataSum === infocardTotal,
            bugFixed: chartDataSum > 0 && infocardTotal > 0
        };
        
        console.log(fixSuccessful.bugFixed ? '✅' : '❌', '[Level3TestDebug] Risultati test fix:', {
            chartDataSum: chartDataSum,
            infocardTotal: infocardTotal,
            ...fixSuccessful
        });
        
        if (!fixSuccessful.bugFixed) {
            console.error('🚨 [Level3TestDebug] IL BUG totalEvents = 0 è ANCORA PRESENTE!');
            console.log('🔍 [Level3TestDebug] Possibili cause:');
            console.log('  - stats.total_events non presente nella risposta API');
            console.log('  - stats.character_stats non gestito correttamente');
            console.log('  - Fallback su temporalSum non funzionante');
            
            // Debug aggiuntivo: forza refresh per vedere i log
            if (window.refreshLevel3Data) {
                console.log('🔄 [Level3TestDebug] Forzando refresh per vedere debug logs...');
                await refreshLevel3Data();
            }
        }
        
        return fixSuccessful.bugFixed;
    },
    
    /**
     * Test completo del filtro carattere al livello 3
     */
    async testCharacterFilter() {
        console.log('🧪 [Level3TestDebug] Test filtro carattere al livello 3');
        
        if (eventState.currentLevel !== 3) {
            console.warn('⚠️ [Level3TestDebug] Non al livello 3. Naviga prima a un ente specifico');
            return false;
        }
        
        console.log('🎯 [Level3TestDebug] Stato iniziale:', {
            level: eventState.currentLevel,
            entity: eventState.currentEntity,
            category: eventState.currentCategory
        });
        
        // Test 1: Verifica filtri disponibili
        const characterFilters = document.querySelectorAll('input[name="evento_carattere"]');
        console.log('🔧 [Level3TestDebug] Filtri carattere trovati:', characterFilters.length);
        
        if (characterFilters.length === 0) {
            console.error('❌ [Level3TestDebug] Nessun filtro carattere trovato');
            return false;
        }
        
        // Test 2: Ottieni valore filtro corrente
        const currentFilter = getEventCarattereFiltro();
        console.log('📊 [Level3TestDebug] Filtro corrente:', currentFilter);
        
        // Test 3: Test cambiamento filtro
        console.log('🔄 [Level3TestDebug] Test cambio filtro su "positivo"...');
        
        // Trova il radio button per "positivo"
        const positiveFilter = document.querySelector('input[name="evento_carattere"][value="positivo"]');
        if (positiveFilter) {
            positiveFilter.checked = true;
            
            // Simula cambio filtro
            console.log('⚡ [Level3TestDebug] Trigger evento refresh...');
            await refreshLevel3Data();
            
            console.log('✅ [Level3TestDebug] Test positivo completato');
        } else {
            console.warn('⚠️ [Level3TestDebug] Radio button positivo non trovato');
        }
        
        // Test 4: Test reset filtro
        setTimeout(async () => {
            console.log('🔄 [Level3TestDebug] Test reset filtro...');
            const allFilter = document.querySelector('input[name="evento_carattere"][value=""]');
            if (allFilter) {
                allFilter.checked = true;
                await refreshLevel3Data();
                console.log('✅ [Level3TestDebug] Test reset completato');
            }
        }, 2000);
        
        return true;
    },
    
    /**
     * Test visualizzazione grafico al livello 3
     */
    async testChartDisplay() {
        console.log('🧪 [Level3TestDebug] Test visualizzazione grafico al livello 3');
        
        if (eventState.currentLevel !== 3) {
            console.warn('⚠️ [Level3TestDebug] Non al livello 3');
            return false;
        }
        
        // Test richiesta diretta API con aggregate_for_chart=true
        console.log('🌐 [Level3TestDebug] Test richiesta API diretta...');
        
        const params = new URLSearchParams({
            period: eventState.currentPeriod,
            sottocategoria: eventState.currentCategory?.toLowerCase().replace(' ', '_'),
            ente: eventState.currentEntity,
            aggregate_for_chart: 'true',
            level: '3'
        });
        
        const caractere = getEventCarattereFiltro();
        if (caractere) {
            params.append('categoria', caractere);
        }
        
        try {
            const response = await fetch(`/eventi/api/dettagli?${params.toString()}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            
            console.log('📊 [Level3TestDebug] Risposta API:', {
                success: result.success,
                hasLabels: !!result.labels,
                hasData: !!result.data,
                hasBackgroundColor: !!result.backgroundColor,
                chartDataFlag: result.chart_data,
                labelsCount: result.labels?.length || 0,
                dataCount: result.data?.length || 0,
                totalEvents: Array.isArray(result.data) ? result.data.reduce((sum, val) => sum + val, 0) : 0
            });
            
            // Test creazione grafico
            if (result.labels && result.data) {
                console.log('🎨 [Level3TestDebug] Test creazione grafico con dati ricevuti...');
                console.log('📊 [Level3TestDebug] Tipo grafico atteso: LINEE (dati temporali)');
                
                const chartHeight = calculateOptimalChartHeight(result.labels.length);
                const chart = createEventChart(result.labels, result, result.backgroundColor, chartHeight);
                
                if (chart) {
                    console.log('✅ [Level3TestDebug] Grafico a linee creato con successo');
                    console.log('📈 [Level3TestDebug] Verifica tipo chart:', chart.config.type);
                    console.log('🎨 [Level3TestDebug] Dataset configurato:', {
                        label: chart.data.datasets[0].label,
                        tension: chart.data.datasets[0].tension,
                        fill: chart.data.datasets[0].fill,
                        pointRadius: chart.data.datasets[0].pointRadius
                    });
                    return chart.config.type === 'line';
                } else {
                    console.error('❌ [Level3TestDebug] Errore creazione grafico');
                    return false;
                }
            } else {
                console.warn('⚠️ [Level3TestDebug] Dati grafico mancanti nella risposta');
                return false;
            }
            
        } catch (error) {
            console.error('🚨 [Level3TestDebug] Errore test API:', error);
            return false;
        }
    },
    
    /**
     * Test integrazione completa livello 3
     */
    async testLevel3Integration() {
        console.log('🧪 [Level3TestDebug] Test integrazione completa livello 3');
        console.log('================================================');
        
        if (eventState.currentLevel !== 3) {
            console.warn('⚠️ [Level3TestDebug] Navigare prima al livello 3 (cliccare su un ente specifico)');
            return false;
        }
        
        // Test 1: Verifica stato
        console.log('1️⃣ [Level3TestDebug] Verifica stato applicazione...');
        const stateOk = eventState.currentEntity && eventState.currentCategory;
        console.log(stateOk ? '✅' : '❌', 'Stato:', {
            level: eventState.currentLevel,
            entity: eventState.currentEntity,
            category: eventState.currentCategory
        });
        
        // Test 2: Verifica elementi UI
        console.log('2️⃣ [Level3TestDebug] Verifica elementi UI...');
        const chartCanvas = document.getElementById('eventChartCanvas') || document.getElementById('eventChart');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        const characterFilters = document.querySelectorAll('input[name="evento_carattere"]');
        
        console.log('🎨 Chart canvas:', !!chartCanvas);
        console.log('📋 Details panel:', !!detailsPanel);
        console.log('🔧 Character filters:', characterFilters.length);
        
        // Test 3: Test info card
        console.log('3️⃣ [Level3TestDebug] Test info card...');
        const infoCardTestResult = await this.testInfoCards();
        
        // Test 4: Test filtro carattere
        console.log('4️⃣ [Level3TestDebug] Test filtro carattere...');
        const characterTestResult = await this.testCharacterFilter();
        
        // Test 4: Test grafico
        console.log('4️⃣ [Level3TestDebug] Test visualizzazione grafico...');
        const chartTestResult = await this.testChartDisplay();
        
        // Test 5: Test info cards
        console.log('5️⃣ [Level3TestDebug] Test info cards...');
        const totalValueEl = document.getElementById('eventTotalValue');
        const categoriesValueEl = document.getElementById('eventCategoriesValue');
        const entitiesValueEl = document.getElementById('eventEntitiesValue');
        const positiveValueEl = document.getElementById('eventPositiveValue');
        const negativeValueEl = document.getElementById('eventNegativeValue');
        
        const infoCardsFound = {
            total: !!totalValueEl,
            categories: !!categoriesValueEl,
            entities: !!entitiesValueEl,
            positive: !!positiveValueEl,
            negative: !!negativeValueEl
        };
        
        console.log('📋 [Level3TestDebug] Info cards elements:', infoCardsFound);
        
        if (totalValueEl && categoriesValueEl && entitiesValueEl) {
            const currentValues = {
                total: totalValueEl.textContent,
                categories: categoriesValueEl.textContent,
                entities: entitiesValueEl.textContent,
                positive: positiveValueEl?.textContent || 'N/A',
                negative: negativeValueEl?.textContent || 'N/A'
            };
            
            console.log('📋 [Level3TestDebug] Current info card values:', currentValues);
            
            // Valori attesi per livello 3
            const expectedValues = {
                categories: '1', // Una sola tipologia
                entities: '1'    // Un solo ente
            };
            
            const valuesCorrect = {
                categories: currentValues.categories === expectedValues.categories,
                entities: currentValues.entities === expectedValues.entities,
                hasPositiveNegative: currentValues.positive !== 'N/A' && currentValues.negative !== 'N/A'
            };
            
            console.log(valuesCorrect.categories && valuesCorrect.entities && valuesCorrect.hasPositiveNegative ? '✅' : '❌', 
                       '[Level3TestDebug] Info cards validation:', valuesCorrect);
        }
        
        // Test 6: Test refresh completo
        console.log('6️⃣ [Level3TestDebug] Test refresh completo...');
        try {
            await refreshLevel3Data();
            console.log('✅ [Level3TestDebug] Refresh completato senza errori');
        } catch (error) {
            console.error('❌ [Level3TestDebug] Errore durante refresh:', error);
        }
        
        console.log('================================================');
        console.log('🏁 [Level3TestDebug] Test completato!');
        console.log('📊 Risultati:', {
            stateOk,
            characterFilterOk: characterTestResult,
            chartDisplayOk: chartTestResult,
            uiElementsOk: !!chartCanvas && !!detailsPanel && characterFilters.length > 0
        });
        
        return stateOk && characterTestResult && chartTestResult;
    }
};

// Messaggio informativo
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('🔧 [Level3TestDebug] Strumenti di test livello 3 caricati');
    console.log('📋 Comandi disponibili:');
    console.log('  - Level3TestDebug.testLevel3Integration() - Test completo');
    console.log('  - Level3TestDebug.testTotalEventsFix() - Test specifico fix bug totalEvents=0 (NUOVO)');
    console.log('  - Level3TestDebug.debugInfoCards() - Debug rapido info card');
    console.log('  - Level3TestDebug.testInfoCards() - Test completo info card');
    console.log('  - Level3TestDebug.testCharacterFilter() - Test solo filtro carattere'); 
    console.log('  - Level3TestDebug.testChartDisplay() - Test solo visualizzazione grafico');
}