/**
 * ========================================
 * TALON - DASHBOARD MODULE (SPA VERSION)
 * File: static/js/dashboard.js
 * 
 * Versione: 2.0.0 - Full SPA Integration
 * Data: 2025
 * Funzionalità: Dashboard principale con grafici,
 *               statistiche e controlli real-time
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        DEBUG: window.TALON_CONFIG?.debug?.enabled || false,
        AUTO_REFRESH: true,
        REFRESH_INTERVAL: 60000, // 1 minuto
        ANIMATION_DURATION: 300,
        COUNTER_ANIMATION_SPEED: 200,
        CHART_UPDATE_DELAY: 100,
        
        // Selettori DOM
        SELECTORS: {
            dashboardContainer: '#dashboard-container, .dashboard-container',
            statsCards: '.stat-card, .card-stats',
            chartCanvas: '#mainChart, #dashboardChart, canvas.chart-main',
            refreshBtn: '#refreshDashboard, .btn-refresh',
            lastUpdate: '#lastUpdate, .last-update',
            counters: '[data-counter], .counter-value',
            progressBars: '.progress-bar',
            alerts: '.alert-dashboard',
            quickActions: '.quick-action-btn'
        },
        
        // API Endpoints
        API: {
            STATS: '/api/dashboard/stats',
            CHART_DATA: '/api/dashboard/chart',
            ACTIVITIES: '/api/dashboard/activities',
            REFRESH: '/api/dashboard/refresh'
        },
        
        // Colori per grafici
        CHART_COLORS: {
            primary: '#007bff',
            success: '#28a745',
            warning: '#ffc107',
            danger: '#dc3545',
            info: '#17a2b8',
            secondary: '#6c757d'
        }
    };

    // ========================================
    // STATO APPLICAZIONE
    // ========================================
    
    const state = {
        initialized: false,
        chart: null,
        refreshTimer: null,
        counters: new Map(),
        lastData: null,
        isRefreshing: false
    };

    // ========================================
    // UTILITÀ
    // ========================================
    
    function log(level, ...args) {
        if (!CONFIG.DEBUG) return;
        const prefix = `[Dashboard]`;
        const styles = {
            info: 'color: #17a2b8',
            success: 'color: #28a745',
            warn: 'color: #ffc107',
            error: 'color: #dc3545',
            debug: 'color: #6c757d'
        };
        // console.log removed for production silence
    }

    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    function formatDate(date) {
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        };
        return new Date(date).toLocaleString('it-IT', options);
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    function initialize() {
        if (state.initialized) {
            log('warn', 'Already initialized');
            return;
        }

        log('info', '🚀 Initializing Dashboard...');

        // Verifica se siamo nella pagina dashboard
        if (!isDashboardPage()) {
            log('debug', 'Not on dashboard page, skipping init');
            return;
        }

        // Setup componenti
        initializeCounters();
        initializeChart();
        initializeRefreshButton();
        initializeQuickActions();
        setupAutoRefresh();
        
        // Carica dati iniziali
        loadDashboardData();
        
        state.initialized = true;
        log('success', '✅ Dashboard initialized');
        
        // Emit evento
        document.dispatchEvent(new CustomEvent('dashboard:ready'));
    }

    function isDashboardPage() {
        const container = document.querySelector(CONFIG.SELECTORS.dashboardContainer);
        const isInPath = window.location.pathname.includes('/dashboard');
        return container || isInPath;
    }

    // ========================================
    // CONTATORI ANIMATI
    // ========================================
    
    function initializeCounters() {
        const counters = document.querySelectorAll(CONFIG.SELECTORS.counters);
        
        counters.forEach(counter => {
            const target = parseInt(counter.dataset.counter || counter.textContent);
            state.counters.set(counter, { target, current: 0 });
            
            // Anima al valore target
            animateCounter(counter, target);
        });
        
        log('debug', `Initialized ${counters.length} counters`);
    }

    function animateCounter(element, target, duration = 1000) {
        const start = state.counters.get(element)?.current || 0;
        const increment = (target - start) / (duration / CONFIG.COUNTER_ANIMATION_SPEED);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            
            if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
                current = target;
                clearInterval(timer);
            }
            
            element.textContent = formatNumber(Math.round(current));
            
            // Salva valore corrente
            if (state.counters.has(element)) {
                state.counters.get(element).current = current;
            }
        }, CONFIG.COUNTER_ANIMATION_SPEED);
    }

    // ========================================
    // GRAFICI
    // ========================================
    
    function initializeChart() {
        const canvas = document.querySelector(CONFIG.SELECTORS.chartCanvas);
        if (!canvas) {
            log('debug', 'Chart canvas not found');
            return;
        }

        // Distruggi grafico esistente se presente
        if (state.chart) {
            state.chart.destroy();
        }

        // Crea nuovo grafico
        const ctx = canvas.getContext('2d');
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Attività',
                    data: [],
                    borderColor: CONFIG.CHART_COLORS.primary,
                    backgroundColor: CONFIG.CHART_COLORS.primary + '20',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatNumber(value);
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        log('debug', 'Chart initialized');
    }

    function updateChart(data) {
        if (!state.chart) return;

        // Aggiorna con animazione
        setTimeout(() => {
            state.chart.data.labels = data.labels || [];
            state.chart.data.datasets[0].data = data.values || [];
            
            if (data.datasets) {
                state.chart.data.datasets = data.datasets;
            }
            
            state.chart.update('active');
            log('debug', 'Chart updated with new data');
        }, CONFIG.CHART_UPDATE_DELAY);
    }

    // ========================================
    // CARICAMENTO DATI
    // ========================================
    
    async function loadDashboardData() {
        if (state.isRefreshing) {
            log('debug', 'Already refreshing, skipping');
            return;
        }

        state.isRefreshing = true;
        showLoadingState();

        try {
            // Simula chiamata API o usa dati mockup
            const data = await fetchDashboardData();
            
            // Aggiorna UI
            updateStats(data.stats);
            updateChart(data.chart);
            updateActivities(data.activities);
            updateLastUpdateTime();
            
            state.lastData = data;
            log('success', 'Dashboard data loaded');
            
        } catch (error) {
            log('error', 'Failed to load dashboard data:', error);
            showError('Errore nel caricamento dei dati');
        } finally {
            state.isRefreshing = false;
            hideLoadingState();
        }
    }

    async function fetchDashboardData() {
        // Se abbiamo endpoint API, usa quelli
        if (window.TALON_CONFIG?.api?.baseUrl) {
            try {
                const response = await fetch(`${window.TALON_CONFIG.api.baseUrl}/api/dashboard/data`, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': window.TALON_CONFIG?.api?.csrfToken || ''
                    }
                });
                
                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                log('warn', 'API call failed, using mock data:', error);
            }
        }

        // Dati mock per sviluppo/demo
        return {
            stats: {
                users: Math.floor(Math.random() * 1000) + 100,
                activities: Math.floor(Math.random() * 5000) + 1000,
                operations: Math.floor(Math.random() * 500) + 50,
                alerts: Math.floor(Math.random() * 10)
            },
            chart: {
                labels: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
                values: Array.from({length: 7}, () => Math.floor(Math.random() * 100) + 20)
            },
            activities: [
                { type: 'info', message: 'Sistema operativo', time: 'ora' },
                { type: 'success', message: 'Backup completato', time: '10 min fa' },
                { type: 'warning', message: 'Manutenzione programmata', time: '1 ora fa' }
            ]
        };
    }

    // ========================================
    // AGGIORNAMENTO UI
    // ========================================
    
    function updateStats(stats) {
        if (!stats) return;

        // Aggiorna contatori
        Object.entries(stats).forEach(([key, value]) => {
            const element = document.querySelector(`[data-stat="${key}"]`);
            if (element) {
                const counter = element.querySelector('.counter-value, .stat-value');
                if (counter) {
                    animateCounter(counter, value);
                }
            }
        });

        log('debug', 'Stats updated');
    }

    function updateActivities(activities) {
        if (!activities) return;

        const container = document.querySelector('#activities-list, .activities-container');
        if (!container) return;

        // Crea HTML per attività
        const html = activities.map(activity => `
            <div class="activity-item alert alert-${activity.type} d-flex justify-content-between align-items-center">
                <span>${activity.message}</span>
                <small class="text-muted">${activity.time}</small>
            </div>
        `).join('');

        container.innerHTML = html;
        log('debug', 'Activities updated');
    }

    function updateLastUpdateTime() {
        const element = document.querySelector(CONFIG.SELECTORS.lastUpdate);
        if (element) {
            element.textContent = `Ultimo aggiornamento: ${formatDate(new Date())}`;
        }
    }

    // ========================================
    // REFRESH E AUTO-REFRESH
    // ========================================
    
    function initializeRefreshButton() {
        const refreshBtn = document.querySelector(CONFIG.SELECTORS.refreshBtn);
        if (!refreshBtn) return;

        refreshBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Anima bottone
            refreshBtn.classList.add('spinning');
            refreshBtn.disabled = true;
            
            await loadDashboardData();
            
            // Reset bottone
            setTimeout(() => {
                refreshBtn.classList.remove('spinning');
                refreshBtn.disabled = false;
            }, 500);
        });

        log('debug', 'Refresh button initialized');
    }

    function setupAutoRefresh() {
        if (!CONFIG.AUTO_REFRESH) return;

        // Clear existing timer
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
        }

        state.refreshTimer = setInterval(() => {
            log('debug', 'Auto-refresh triggered');
            loadDashboardData();
        }, CONFIG.REFRESH_INTERVAL);

        log('debug', `Auto-refresh enabled (${CONFIG.REFRESH_INTERVAL}ms)`);
    }

    // ========================================
    // QUICK ACTIONS
    // ========================================
    
    function initializeQuickActions() {
        const buttons = document.querySelectorAll(CONFIG.SELECTORS.quickActions);
        
        buttons.forEach(btn => {
            btn.addEventListener('click', handleQuickAction);
        });

        log('debug', `${buttons.length} quick actions initialized`);
    }

    function handleQuickAction(e) {
        e.preventDefault();
        const action = e.currentTarget.dataset.action;
        
        log('debug', `Quick action triggered: ${action}`);
        
        // Implementa azioni rapide
        switch(action) {
            case 'export':
                exportDashboardData();
                break;
            case 'print':
                window.print();
                break;
            case 'fullscreen':
                toggleFullscreen();
                break;
            default:
                log('warn', `Unknown action: ${action}`);
        }
    }

    // ========================================
    // UTILITÀ UI
    // ========================================
    
    function showLoadingState() {
        const container = document.querySelector(CONFIG.SELECTORS.dashboardContainer);
        if (container) {
            container.classList.add('loading');
        }
    }

    function hideLoadingState() {
        const container = document.querySelector(CONFIG.SELECTORS.dashboardContainer);
        if (container) {
            container.classList.remove('loading');
        }
    }

    function showError(message) {
        const alertHtml = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        const container = document.querySelector(CONFIG.SELECTORS.alerts) || 
                         document.querySelector(CONFIG.SELECTORS.dashboardContainer);
        
        if (container) {
            container.insertAdjacentHTML('afterbegin', alertHtml);
        }
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function exportDashboardData() {
        if (!state.lastData) {
            showError('Nessun dato da esportare');
            return;
        }

        const dataStr = JSON.stringify(state.lastData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `dashboard_${new Date().getTime()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        log('success', 'Data exported');
    }

    // ========================================
    // CLEANUP
    // ========================================
    
    function cleanup() {
        log('debug', 'Cleaning up dashboard...');
        
        // Clear timers
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }

        // Destroy chart
        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }

        // Clear state
        state.counters.clear();
        state.initialized = false;
        state.lastData = null;
        
        log('debug', 'Dashboard cleaned up');
    }

    // ========================================
    // INTEGRAZIONE SPA
    // ========================================
    
    function handleSPANavigation() {
        if (isDashboardPage()) {
            if (!state.initialized) {
                initialize();
            } else {
                // Ricarica solo i dati
                loadDashboardData();
            }
        } else {
            if (state.initialized) {
                cleanup();
            }
        }
    }

    // ========================================
    // EXPORT API PUBBLICA
    // ========================================
    
    window.TalonDashboard = {
        init: initialize,
        cleanup: cleanup,
        refresh: loadDashboardData,
        updateChart: updateChart,
        updateStats: updateStats,
        exportData: exportDashboardData,
        toggleFullscreen: toggleFullscreen,
        getState: () => ({ ...state }),
        getConfig: () => ({ ...CONFIG }),
        version: '2.0.0'
    };

    // ========================================
    // AUTO-INIT E EVENT LISTENERS
    // ========================================
    
    // Ascolta eventi SPA
    document.addEventListener('spa:content-loaded', handleSPANavigation);
    document.addEventListener('spa:before-navigate', () => {
        if (state.initialized && !isDashboardPage()) {
            cleanup();
        }
    });

    // Auto-init quando DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // Delay per assicurare che altri moduli siano pronti
        setTimeout(initialize, 100);
    }


})(window, document);