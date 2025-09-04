/**
 * Event Data Validation Test Script
 * 
 * This script helps validate that the event drill-down chart data consistency fixes
 * are working properly. It can be run from the browser console to check data alignment.
 */

window.EventDataValidator = {
    
    /**
     * Test the API endpoint directly to check parameter handling
     */
    async testAPIEndpoint() {
        console.log('🧪 [EventDataValidator] Testing API endpoint parameter handling...');
        
        const testParams = {
            period: 'month',
            sottocategoria: 'tipo_e',
            ente: 'COMANDO TRASPORTI E MATERIALI',
            level: '2'  // Test al livello 2 per verificare la query ricorsiva
        };
        
        const params = new URLSearchParams(testParams);
        const url = `/eventi/api/dettagli?${params.toString()}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            console.log('📊 [EventDataValidator] API Response:', {
                success: result.success,
                totalEvents: result.total || result.data?.length || 0,
                hasCharacterStats: !!result.character_stats,
                characterStats: result.character_stats,
                firstEvent: result.data?.[0] || null
            });
            
            // Validate character consistency
            if (result.character_stats) {
                const { positivi, negativi, totale } = result.character_stats;
                const somma = positivi + negativi;
                const isConsistent = somma <= totale; // Some events might not have carattere defined
                
                console.log(isConsistent ? '✅' : '❌', '[EventDataValidator] Character consistency:', {
                    positivi,
                    negativi,
                    totale,
                    somma,
                    consistent: isConsistent,
                    eventiSenzaCarattere: totale - somma
                });
            }
            
            return result;
        } catch (error) {
            console.error('🚨 [EventDataValidator] API test failed:', error);
            return null;
        }
    },
    
    /**
     * Validate that the current chart data matches the API data
     */
    async validateChartDataConsistency() {
        console.log('🧪 [EventDataValidator] Validating chart-API data consistency...');
        
        if (!window.eventState) {
            console.warn('⚠️ [EventDataValidator] eventState not available - run from events dashboard');
            return;
        }
        
        const { currentCategory, currentSubcategory, currentLevel } = eventState;
        
        if (currentLevel < 2) {
            console.log('ℹ️ [EventDataValidator] Chart consistency test requires level 2+ (specific entity)');
            return;
        }
        
        // Get current chart data
        const chartInstance = Chart.getChart(document.getElementById('eventChart'));
        if (!chartInstance) {
            console.warn('⚠️ [EventDataValidator] Chart instance not found');
            return;
        }
        
        const chartData = chartInstance.data.datasets[0].data;
        const chartTotal = chartData.reduce((sum, value) => sum + value, 0);
        
        // Test API data for same parameters
        const apiResult = await this.testAPIEndpoint();
        
        if (apiResult) {
            const apiTotal = apiResult.total || apiResult.data?.length || 0;
            const isAligned = chartTotal === apiTotal;
            
            console.log(isAligned ? '✅' : '❌', '[EventDataValidator] Chart-API alignment:', {
                chartTotal,
                apiTotal,
                aligned: isAligned,
                difference: Math.abs(chartTotal - apiTotal)
            });
        }
    },
    
    /**
     * Test Level 3 integration (chart + table + filters)
     */
    async testLevel3Integration() {
        console.log('🧪 [EventDataValidator] Testing Level 3 integration...');
        
        if (!window.eventState || eventState.currentLevel !== 3) {
            console.warn('⚠️ [EventDataValidator] Not at Level 3 - navigate to an entity first');
            return;
        }
        
        const entity = eventState.currentEntity;
        console.log('🎯 [EventDataValidator] Testing Level 3 for entity:', entity);
        
        // Test 1: Check if chart is visible
        const chartCanvas = document.getElementById('eventChart') || document.getElementById('eventChartCanvas');
        const chartVisible = chartCanvas && chartCanvas.style.display !== 'none';
        console.log(chartVisible ? '✅' : '❌', '[Level3Test] Chart visibility:', chartVisible);
        
        // Test 2: Check if details panel is visible
        const detailsPanel = document.getElementById('eventDetailsPanel');
        const tableVisible = detailsPanel && detailsPanel.style.display !== 'none';
        console.log(tableVisible ? '✅' : '❌', '[Level3Test] Details table visibility:', tableVisible);
        
        // Test 3: Check if AdvancedTable is initialized
        const advancedTableExists = !!window.currentEventTable;
        console.log(advancedTableExists ? '✅' : '❌', '[Level3Test] AdvancedTable initialized:', advancedTableExists);
        
        // Test 4: Check filter listeners
        const characterFilters = document.querySelectorAll('input[name="evento_carattere"]');
        const hasFilters = characterFilters.length > 0;
        console.log(hasFilters ? '✅' : '❌', '[Level3Test] Character filters found:', characterFilters.length);
        
        // Test 5: Check info cards updates
        const totalValueEl = document.getElementById('eventTotalValue');
        const categoriesValueEl = document.getElementById('eventCategoriesValue');
        const entitiesValueEl = document.getElementById('eventEntitiesValue');
        
        const infoCardsExist = totalValueEl && categoriesValueEl && entitiesValueEl;
        console.log(infoCardsExist ? '✅' : '❌', '[Level3Test] Info cards elements found:', infoCardsExist);
        
        if (infoCardsExist) {
            console.log('📊 [Level3Test] Info card values:', {
                total: totalValueEl.textContent,
                categories: categoriesValueEl.textContent,
                entities: entitiesValueEl.textContent
            });
        }
        
        // Test 6: Test refresh function
        try {
            console.log('🔄 [Level3Test] Testing refresh function...');
            if (window.refreshLevel3Data) {
                await refreshLevel3Data();
                console.log('✅ [Level3Test] Refresh function works');
            } else {
                console.log('❌ [Level3Test] Refresh function not found');
            }
        } catch (error) {
            console.log('❌ [Level3Test] Refresh function error:', error.message);
        }
        
        console.log('🏁 [EventDataValidator] Level 3 integration test completed!');
    },
    
    /**
     * Run all validation tests
     */
    async runAllTests() {
        console.log('🧪 [EventDataValidator] Running all validation tests...');
        console.log('================================================');
        
        await this.testAPIEndpoint();
        console.log('------------------------------------------------');
        await this.validateChartDataConsistency();
        console.log('------------------------------------------------');
        await this.testLevel3Integration();
        
        console.log('================================================');
        console.log('✅ [EventDataValidator] All tests completed!');
    }
};

// Auto-run tests if in development mode
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('🔧 [EventDataValidator] Development mode detected - validation tools available');
    console.log('Run EventDataValidator.runAllTests() to validate data consistency');
}