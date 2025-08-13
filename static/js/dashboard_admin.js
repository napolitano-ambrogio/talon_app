/**
 * ========================================
 * TALON - DASHBOARD ADMIN (SPA VERSION)
 * File: static/js/dashboard_admin.js
 * 
 * Versione: 2.0.0 - Ottimizzata per SPA
 * Gestione dashboard amministratore con
 * grafici, contatori e aggiornamenti real-time
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Namespace globale - protezione contro window undefined
    if (typeof window !== 'undefined') {
        window.TalonDashboardAdmin = window.TalonDashboardAdmin || {};
    } else {
        console.error('Window object not available in dashboard_admin.js');
        return;
    }

    // ========================================
    // STATO E CONFIGURAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        chart: null,
        intervals: [],
        eventHandlers: new Map(),
        counters: [],
        currentPeriod: 'week'
    };

    const config = {
        debug: false,  // Disable debug logs - system working
        autoRefreshInterval: 30000, // 30 secondi
        counterSpeed: 200,
        chartUpdateDelay: 100
    };

    // ========================================
    // INIZIALIZZAZIONE PRINCIPALE
    // ========================================
    
    function initialize() {
        log('🎯 Initializing Dashboard Admin (SPA Version)...');
        
        // Check if this is a page refresh - force reinitialization
        const navigationEntries = performance.getEntriesByType('navigation');
        const wasPageRefreshed = navigationEntries.length > 0 && 
            (navigationEntries[0].type === 'reload');
        
        // Cleanup precedente se necessario o se la pagina è stata refreshed
        if (state.initialized || wasPageRefreshed) {
            log('Cleaning up before reinitializing (page refresh detected: ' + wasPageRefreshed + ')');
            cleanup();
            state.initialized = false;
        }
        
        // Verifica se siamo nella pagina dashboard admin
        if (!isDashboardAdminPage()) {
            log('Not on admin dashboard page, skipping init');
            return;
        }
        
        log('✅ Admin dashboard detected, initializing components...');
        
        // Inizializza con delay per assicurare rendering DOM
        setTimeout(() => {
            initCounters();
            initChart();
            initRefreshButton();
            initPeriodButtons();
            updateLastUpdateTime();
            setupAutoRefresh();
            
            state.initialized = true;
            log('✅ Dashboard Admin initialized successfully');
            
            // Emetti evento personalizzato
            emitEvent('dashboard-admin:ready');
        }, config.chartUpdateDelay);
    }

    // ========================================
    // CLEANUP E GESTIONE MEMORIA
    // ========================================
    
    function cleanup() {
        log('🧹 Cleaning up Dashboard Admin...');
        
        // Pulisci intervalli
        state.intervals.forEach(interval => clearInterval(interval));
        state.intervals = [];
        
        // Distruggi grafico
        if (state.chart) {
            try {
                state.chart.destroy();
                state.chart = null;
            } catch (e) {
                log('Error destroying chart:', e);
            }
        }
        
        // Rimuovi event handlers
        state.eventHandlers.forEach((handler, element) => {
            if (element && element.removeEventListener) {
                element.removeEventListener('click', handler);
            }
        });
        state.eventHandlers.clear();
        
        // Reset stato
        state.initialized = false;
        state.counters = [];
        
        log('✅ Cleanup completed');
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function log(...args) {
        if (config.debug || window.TALON_CONFIG?.debug?.enabled) {
            console.log('[Dashboard Admin]', ...args);
        }
    }

    function isDashboardAdminPage() {
        // Controlla prima l'URL (più affidabile per SPA)
        const path = window.location.pathname;
        const isDashboardAdminPath = path.includes('dashboard_admin');
        
        // Check if page was refreshed - trust DOM more in this case
        const navigationEntries = performance.getEntriesByType('navigation');
        const wasPageRefreshed = navigationEntries.length > 0 && 
            (navigationEntries[0].type === 'reload');
        
        // Check DOM elements that are specific to admin dashboard
        const hasContainer = !!document.querySelector('.dashboard-container');
        const hasChart = !!document.querySelector('#activityChart');
        const hasCounters = !!document.querySelector('.counter');
        const hasAdminBreadcrumb = !!document.querySelector('.breadcrumb [href*="dashboard_admin"]');
        const titleElement = document.querySelector('h1, h2, h3');
        const hasAdminTitle = titleElement ? titleElement.textContent.includes('Admin') : false;
        
        // Log per debug
        log('Checking if dashboard admin page:', {
            pathname: path,
            isDashboardAdminPath: isDashboardAdminPath,
            wasPageRefreshed: wasPageRefreshed,
            hasContainer: hasContainer,
            hasChart: hasChart,
            hasCounters: hasCounters,
            hasAdminBreadcrumb: hasAdminBreadcrumb,
            hasAdminTitle: hasAdminTitle
        });
        
        // Per SPA, l'URL è l'indicatore più affidabile
        if (isDashboardAdminPath) {
            return true;
        }
        
        // If page was refreshed, trust DOM elements more
        if (wasPageRefreshed) {
            return hasContainer || hasChart || hasCounters || hasAdminBreadcrumb;
        }
        
        // Fallback sui selettori DOM (per compatibilità)
        return hasContainer || hasChart || hasCounters;
    }

    function emitEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, {
            detail: detail,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    function saveEventHandler(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
            state.eventHandlers.set(element, handler);
        }
    }

    // ========================================
    // ANIMAZIONE CONTATORI
    // ========================================
    
    function initCounters() {
        log('Initializing counters...');
        
        const counters = document.querySelectorAll('.counter');
        if (counters.length === 0) {
            log('No counters found');
            return;
        }
        
        state.counters = Array.from(counters);
        
        // Anima ogni contatore
        state.counters.forEach(counter => {
            animateCounter(counter);
        });
        
        log(`Initialized ${counters.length} counters`);
    }

    function animateCounter(counter) {
        // Reset del contatore
        counter.innerText = '0';
        
        const target = +counter.getAttribute('data-target') || 0;
        const speed = config.counterSpeed;
        const increment = target / speed;
        
        let current = 0;
        const updateCounter = () => {
            current += increment;
            
            if (current < target) {
                counter.innerText = Math.ceil(current);
                requestAnimationFrame(updateCounter);
            } else {
                counter.innerText = target;
            }
        };
        
        requestAnimationFrame(updateCounter);
    }

    function animateValue(element, start, end, duration) {
        const range = end - start;
        const increment = range / (duration / 10);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                element.innerText = end;
                clearInterval(timer);
            } else {
                element.innerText = Math.round(current);
            }
        }, 10);
    }

    // ========================================
    // GESTIONE GRAFICO
    // ========================================
    
    function initChart() {
        log('Initializing chart...');
        
        const ctx = document.getElementById('activityChart');
        if (!ctx) {
            log('Chart canvas not found');
            return;
        }
        
        // Distruggi grafico esistente se presente
        if (state.chart) {
            try {
                state.chart.destroy();
                state.chart = null;
            } catch (e) {
                log('Could not destroy existing chart:', e);
            }
        }
        
        // Forza la distruzione di eventuali chart già registrati su questo canvas
        Chart.getChart(ctx)?.destroy();
        
        try {
            state.chart = new Chart(ctx, getChartConfig());
            log('Chart initialized successfully');
        } catch (e) {
            console.error('Error initializing chart:', e);
        }
    }

    function getChartConfig() {
        return {
            type: 'line',
            data: getChartData(state.currentPeriod),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        };
    }

    function getChartData(period) {
        const data = {
            week: {
                labels: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
                datasets: [{
                    label: 'Utenti Attivi',
                    data: [65, 78, 90, 81, 86, 95, 84],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Operazioni',
                    data: [28, 48, 40, 35, 51, 42, 38],
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            month: {
                labels: ['1', '5', '10', '15', '20', '25', '30'],
                datasets: [{
                    label: 'Utenti Attivi',
                    data: [120, 150, 180, 170, 190, 210, 195],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Operazioni',
                    data: [80, 95, 110, 105, 120, 115, 108],
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            year: {
                labels: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
                datasets: [{
                    label: 'Utenti Attivi',
                    data: [500, 520, 580, 610, 650, 680, 700, 690, 720, 750, 780, 800],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Operazioni',
                    data: [200, 210, 230, 250, 280, 290, 310, 300, 320, 340, 350, 360],
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            }
        };
        
        return data[period] || data.week;
    }

    function updateChartData(period) {
        if (!state.chart) return;
        
        state.currentPeriod = period;
        const newData = getChartData(period);
        
        state.chart.data.labels = newData.labels;
        state.chart.data.datasets = newData.datasets;
        state.chart.update();
        
        log(`Chart updated for period: ${period}`);
    }

    // ========================================
    // GESTIONE PULSANTI E CONTROLLI
    // ========================================
    
    function initRefreshButton() {
        log('Initializing refresh button...');
        
        const refreshBtn = document.getElementById('refreshDashboard');
        if (!refreshBtn) {
            log('Refresh button not found');
            return;
        }
        
        const handler = function(e) {
            e.preventDefault();
            
            // Aggiungi classe loading
            this.classList.add('loading');
            this.disabled = true;
            
            // Simula refresh dei dati
            setTimeout(() => {
                refreshDashboardData();
                this.classList.remove('loading');
                this.disabled = false;
                
                // Mostra notifica
                showNotification('Dashboard aggiornata con successo!', 'success');
            }, 1000);
        };
        
        saveEventHandler(refreshBtn, 'click', handler);
        log('Refresh button initialized');
    }

    function initPeriodButtons() {
        log('Initializing period buttons...');
        
        const buttons = document.querySelectorAll('[data-period]');
        
        buttons.forEach(button => {
            const handler = function(e) {
                e.preventDefault();
                
                // Rimuovi active da tutti
                buttons.forEach(btn => btn.classList.remove('active'));
                // Aggiungi active al cliccato
                this.classList.add('active');
                
                // Aggiorna dati grafico
                updateChartData(this.dataset.period);
            };
            
            saveEventHandler(button, 'click', handler);
        });
        
        log(`Initialized ${buttons.length} period buttons`);
    }

    // ========================================
    // AGGIORNAMENTO DATI
    // ========================================
    
    function refreshDashboardData() {
        log('Refreshing dashboard data...');
        
        // Aggiorna contatori con valori casuali per demo
        state.counters.forEach(counter => {
            const currentValue = parseInt(counter.innerText);
            const variation = Math.floor(Math.random() * 10) - 5;
            const newValue = Math.max(0, currentValue + variation);
            
            animateValue(counter, currentValue, newValue, 500);
        });
        
        // Aggiorna grafico
        if (state.chart) {
            state.chart.data.datasets.forEach(dataset => {
                dataset.data = dataset.data.map(value => 
                    Math.max(0, value + Math.floor(Math.random() * 20) - 10)
                );
            });
            state.chart.update();
        }
        
        updateLastUpdateTime();
        log('Dashboard data refreshed');
    }

    function updateLastUpdateTime() {
        const timeElement = document.getElementById('lastUpdateTime');
        if (!timeElement) return;
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('it-IT');
        timeElement.innerText = timeString;
    }

    function setupAutoRefresh() {
        if (config.autoRefreshInterval > 0) {
            const intervalId = setInterval(() => {
                updateLastUpdateTime();
            }, config.autoRefreshInterval);
            
            state.intervals.push(intervalId);
            log(`Auto-refresh setup with interval: ${config.autoRefreshInterval}ms`);
        }
    }

    // ========================================
    // NOTIFICHE
    // ========================================
    
    function showNotification(message, type = 'info') {
        // Usa TalonApp se disponibile
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast(message, type);
            return;
        }
        
        // Fallback notification
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} notification`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            ${message}
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            animation: slideInRight 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-left: 4px solid currentColor;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    function showComingSoon() {
        showNotification('Funzionalità in fase di sviluppo', 'info');
    }

    // ========================================
    // STILI DINAMICI
    // ========================================
    
    function injectStyles() {
        if (document.getElementById('dashboard-admin-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'dashboard-admin-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    // Funzione di inizializzazione principale
    function initializeDashboardAdmin() {
        console.log('[Dashboard Admin] Initializing...');
        
        // Inietta stili CSS
        injectStyles();
        
        // Inizializza il modulo principale
        initialize();
        
        console.log('[Dashboard Admin] ✅ Initialized');
    }

    // ========================================
    // EXPORT TO GLOBAL NAMESPACE
    // ========================================
    
    // Export functions to window.TalonDashboardAdmin namespace
    window.TalonDashboardAdmin = Object.assign(window.TalonDashboardAdmin || {}, {
        initialize: initialize,
        cleanup: cleanup,
        refresh: refreshDashboardData,
        addNewChartAdmin: function() { return addNewChartAdmin(); }
    });

    // ========================================
    // GLOBAL FUNCTIONS FOR DASHBOARD ADMIN
    // ========================================
    
    // Make functions globally available for onclick handlers
    function addNewChartAdmin() {
        console.log('[Dashboard Admin] addNewChartAdmin called for admin dashboard');
        
        // This function is specifically for the admin dashboard page
        const userRole = window.FLASK_USER_ROLE || window.userRole || 'VISUALIZZATORE';
        const userLevel = getRoleLevel(userRole);
        
        console.log(`[Dashboard Admin] User role: ${userRole} (level: ${userLevel})`);
        
        // Role-based functionality
        if (userLevel >= 50) { // OPERATORE or ADMIN
            console.log('[Dashboard Admin] Opening chart creation modal...');
            
            // Check if Superset integration is available
            if (window.supersetAuthenticated !== undefined) {
                // Use existing Superset integration logic
                if (!window.supersetAuthenticated) {
                    if (sessionStorage.getItem('superset_authenticated') === 'true') {
                        window.supersetAuthenticated = true;
                        if (typeof openContentModal === 'function') {
                            openContentModal();
                        } else {
                            showChartCreationFallback();
                        }
                    } else {
                        if (typeof openSupersetLogin === 'function') {
                            openSupersetLogin(true);
                        } else {
                            showAuthenticationRequired();
                        }
                    }
                    return;
                }
                
                if (typeof openContentModal === 'function') {
                    openContentModal();
                } else {
                    showChartCreationFallback();
                }
            } else {
                showChartCreationFallback();
            }
        } else {
            // VISUALIZZATORE - Read only
            showInsufficientPermissions();
        }
    };

    // Helper functions for chart creation
    function getRoleLevel(role) {
        const roleLevels = {
            'ADMIN': 100,
            'OPERATORE': 50,
            'VISUALIZZATORE': 10,
            'GUEST': 0
        };
        return roleLevels[role] || 0;
    }

    function showChartCreationFallback() {
        console.log('[Dashboard] Showing chart creation fallback');
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast('Funzionalità di aggiunta grafico disponibile per Operatori e Amministratori', 'info');
        } else {
            alert('Funzionalità di aggiunta grafico disponibile per Operatori e Amministratori');
        }
    }

    function showAuthenticationRequired() {
        console.log('[Dashboard] Authentication required');
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast('Autenticazione Superset richiesta per aggiungere grafici', 'warning');
        } else {
            alert('Autenticazione Superset richiesta per aggiungere grafici');
        }
    }

    function showInsufficientPermissions() {
        console.log('[Dashboard] Insufficient permissions for chart creation');
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast('Solo Operatori e Amministratori possono aggiungere grafici', 'warning');
        } else {
            alert('Solo Operatori e Amministratori possono aggiungere grafici');
        }
    }

    // Also make it available globally for onclick handlers
    window.addNewChartAdmin = addNewChartAdmin;

    window.addNewChartWithData = function(chartData) {
        console.log('[Dashboard Admin] addNewChartWithData called with:', chartData);
        
        // Basic implementation - can be extended
        if (chartData && chartData.id) {
            console.log(`[Dashboard Admin] Adding chart with ID: ${chartData.id}`);
        }
        
        // Placeholder implementation
        if (window.TalonApp && window.TalonApp.showToast) {
            window.TalonApp.showToast('Chart data received', 'success');
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDashboardAdmin);
    } else {
        initializeDashboardAdmin();
    }

})(window, document);