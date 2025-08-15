/**
 * ========================================
 * TALON - DASHBOARD ADMIN
 * File: static/js/dashboard_admin.js
 * 
 * Versione: 2.1.0 - Standard Version
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
        initializing: false,  // Prevent multiple concurrent initializations
        chart: null,
        intervals: [],
        eventHandlers: new Map(),
        counters: [],
        currentPeriod: 'week',
        initializationCount: 0  // Debug counter
    };

    const config = {
        debug: true,  // Enable debug logs temporarily to debug SPA navigation
        autoRefreshInterval: 30000, // 30 secondi
        counterSpeed: 200,
        chartUpdateDelay: 100
    };

    // ========================================
    // INIZIALIZZAZIONE PRINCIPALE
    // ========================================
    
    function initialize() {
        state.initializationCount++;
        log(`🎯 Initializing Dashboard Admin - Call #${state.initializationCount}...`);
        
        // Prevent multiple concurrent initializations
        if (state.initializing) {
            log('❌ Dashboard Admin initialization already in progress, skipping call #' + state.initializationCount);
            return;
        }
        
        // Check if already initialized
        if (state.initialized) {
            log('✅ Dashboard Admin already initialized, skipping');
            return;
        }
        
        state.initializing = true;
        
        // Check if this is a page refresh - force reinitialization
        const navigationEntries = performance.getEntriesByType('navigation');
        const wasPageRefreshed = navigationEntries.length > 0 && 
            (navigationEntries[0].type === 'reload');
        
        // ALWAYS cleanup before reinitializing during SPA navigation
        if (state.initialized || wasPageRefreshed) {
            log('Cleaning up before reinitializing (page refresh detected: ' + wasPageRefreshed + ')');
            cleanup();
            state.initialized = false;
        }
        
        // Verifica se siamo nella pagina dashboard admin
        if (!isDashboardAdminPage()) {
            log('Not on admin dashboard page, skipping init');
            state.initializing = false;
            return;
        }
        
        log('✅ Admin dashboard detected, initializing components...');
        
        // Use standard delay for initialization
        setTimeout(() => {
            performInitialization();
        }, config.chartUpdateDelay);
    }
    
    function performInitialization() {
        log('🚀 Performing actual initialization...');
        
        try {
            initCounters();
            initOnlineUsersProgressBar();
            initChart();
            initPeriodButtons();
            updateLastUpdateTime();
            setupAutoRefresh();
            
            state.initialized = true;
            state.initializing = false;  // Release lock
            log('✅ Dashboard Admin initialized successfully');
            
            // Emetti evento personalizzato
            emitEvent('dashboard-admin:ready');
            
        } catch (error) {
            console.error('❌ Error during dashboard admin initialization:', error);
            log('Initialization failed, will retry once...');
            
            // Single retry after 1 second
            setTimeout(() => {
                try {
                    performInitialization();
                } catch (retryError) {
                    console.error('❌ Retry initialization also failed:', retryError);
                    state.initializing = false;  // Release lock even on failure
                }
            }, 1000);
        }
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
        state.initializing = false;
        state.counters = [];
        
        
        log('✅ Cleanup completed');
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function log(...args) {
        if (config.debug || window.TALON_CONFIG?.debug?.enabled) {
            // console.log removed for production silence
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
        const hasAdminTitle = titleElement ? (titleElement.textContent.includes('Admin') || titleElement.textContent.includes('Sistema')) : false;
        
        // Additional checks for admin dashboard content
        const hasStatsRow = !!document.querySelector('.stats-row');
        const hasSystemInfo = !!document.querySelector('.system-info');
        const hasQuickActions = !!document.querySelector('.quick-actions');
        
        // Log per debug
        log('Checking if dashboard admin page:', {
            pathname: path,
            isDashboardAdminPath: isDashboardAdminPath,
            wasPageRefreshed: wasPageRefreshed,
            hasContainer: hasContainer,
            hasChart: hasChart,
            hasCounters: hasCounters,
            hasAdminBreadcrumb: hasAdminBreadcrumb,
            hasAdminTitle: hasAdminTitle,
            titleText: titleElement?.textContent,
            hasStatsRow: hasStatsRow,
            hasSystemInfo: hasSystemInfo,
            hasQuickActions: hasQuickActions
        });
        
        // Per SPA, l'URL è l'indicatore più affidabile
        if (isDashboardAdminPath) {
            log('✅ Confirmed dashboard admin page by URL');
            return true;
        }
        
        // If page was refreshed, trust DOM elements more
        if (wasPageRefreshed) {
            const isAdminByDOM = hasContainer || hasChart || hasCounters || hasAdminBreadcrumb || hasStatsRow;
            log(wasPageRefreshed ? '✅ Confirmed dashboard admin page by DOM elements after refresh' : '❌ Not dashboard admin page by DOM elements');
            return isAdminByDOM;
        }
        
        // For SPA navigation, check multiple indicators
        const isAdminPage = hasContainer && (hasChart || hasCounters || hasStatsRow || hasAdminTitle);
        log(isAdminPage ? '✅ Confirmed dashboard admin page by combined indicators' : '❌ Not dashboard admin page');
        return isAdminPage;
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
        
        log(`Found ${counters.length} counters, checking visibility and CSS...`);
        
        // Wait for CSS to be applied and elements to be visible
        setTimeout(() => {
            // Anima ogni contatore dopo che CSS è applicato
            state.counters.forEach((counter, index) => {
                // Ensure element is visible before animating
                const isVisible = counter.offsetHeight > 0 && counter.offsetWidth > 0;
                const computedStyle = window.getComputedStyle(counter);
                const isDisplayed = computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
                
                log(`Counter ${index + 1}: visible=${isVisible}, displayed=${isDisplayed}, target=${counter.getAttribute('data-target')}`);
                
                if (isVisible && isDisplayed) {
                    animateCounter(counter);
                } else {
                    log(`Counter ${index + 1} not visible, retrying in 200ms...`);
                    setTimeout(() => animateCounter(counter), 200);
                }
            });
        }, 100); // Small delay to ensure CSS is applied
        
        log(`Initialized ${counters.length} counters`);
    }

    function animateCounter(counter) {
        if (!counter) {
            log('animateCounter called with null/undefined counter');
            return;
        }
        
        const target = +counter.getAttribute('data-target') || 0;
        
        log(`Animating counter to ${target}...`);
        
        // Ensure element is still visible
        const isVisible = counter.offsetHeight > 0 && counter.offsetWidth > 0;
        if (!isVisible) {
            log('Counter not visible during animation, skipping');
            counter.innerText = target; // Set final value directly
            return;
        }
        
        // Reset del contatore
        counter.innerText = '0';
        
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
                log(`Counter animation completed: ${target}`);
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
    // PROGRESS BAR UTENTI ONLINE
    // ========================================
    
    function initOnlineUsersProgressBar() {
        log('Initializing online users progress bar...');
        
        try {
            const progressBar = document.getElementById('online-progress-bar');
            if (!progressBar) {
                log('Online progress bar not found');
                return;
            }
            
            // Get total and online users from the cards
            const totalUsersCard = document.querySelector('[data-stat="users"] .card-value');
            const onlineUsersCard = document.querySelector('[data-stat="users-online"] .card-value');
            
            if (!totalUsersCard || !onlineUsersCard) {
                log('User cards not found for progress calculation');
                return;
            }
            
            const totalUsers = parseInt(totalUsersCard.getAttribute('data-target') || '0');
            const onlineUsers = parseInt(onlineUsersCard.getAttribute('data-target') || '0');
            
            log(`Calculating progress: ${onlineUsers}/${totalUsers} online`);
            
            // Calculate percentage (avoid division by zero)
            const percentage = totalUsers > 0 ? Math.round((onlineUsers / totalUsers) * 100) : 0;
            
            // Animate progress bar
            setTimeout(() => {
                progressBar.style.transition = 'width 1.5s ease-in-out';
                progressBar.style.width = `${percentage}%`;
                
                // Update progress bar title
                progressBar.setAttribute('title', `${onlineUsers} di ${totalUsers} utenti online (${percentage}%)`);
                
                log(`Progress bar animated to ${percentage}%`);
            }, 500); // Start animation after counter animation begins
            
        } catch (error) {
            log('Error initializing online users progress bar:', error);
        }
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
        
        // Check if Chart.js is loaded
        if (typeof Chart === 'undefined') {
            log('Chart.js not loaded, attempting to load...');
            loadChartJSAndInit();
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
            log('Chart.js might not be loaded or canvas not ready. Will retry...');
            // Retry after a short delay
            setTimeout(() => {
                try {
                    if (typeof Chart !== 'undefined' && document.getElementById('activityChart')) {
                        state.chart = new Chart(ctx, getChartConfig());
                        log('Chart initialized successfully on retry');
                    }
                } catch (retryError) {
                    console.error('Chart initialization failed on retry:', retryError);
                }
            }, 1000);
        }
    }
    
    function loadChartJSAndInit() {
        log('Loading Chart.js dynamically...');
        
        // Check if script is already being loaded
        if (document.querySelector('script[src*="chart.js"]')) {
            log('Chart.js script tag exists, waiting for load...');
            setTimeout(() => {
                if (typeof Chart !== 'undefined') {
                    initChart();
                } else {
                    log('Chart.js still not available after wait');
                }
            }, 2000);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = () => {
            log('Chart.js loaded dynamically, initializing chart...');
            setTimeout(() => initChart(), 100);
        };
        script.onerror = () => {
            log('Error loading Chart.js dynamically');
        };
        document.head.appendChild(script);
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
        
        // Inietta stili CSS
        injectStyles();
        
        // Inizializza il modulo principale
        initialize();
        
    }

    // ========================================
    // EXPORT TO GLOBAL NAMESPACE
    // ========================================
    
    // Public method to re-trigger counter animations
    function retriggerCounters() {
        log('🔄 Retriggering counter animations...');
        const counters = document.querySelectorAll('.counter');
        if (counters.length === 0) {
            log('No counters found for retrigger');
            return;
        }
        
        Array.from(counters).forEach((counter, index) => {
            const target = +counter.getAttribute('data-target') || 0;
            log(`Retriggering counter ${index + 1} to ${target}`);
            animateCounter(counter);
        });
        
        // Also retrigger the online users progress bar after counter animations
        setTimeout(() => {
            initOnlineUsersProgressBar();
        }, 300);
    }
    
    // Export functions to window.TalonDashboardAdmin namespace
    window.TalonDashboardAdmin = Object.assign(window.TalonDashboardAdmin || {}, {
        initialize: initialize,
        cleanup: cleanup,
        showNotification: showNotification,
        retriggerCounters: retriggerCounters
    });

    // Make showComingSoon globally available for onclick handlers (used in dashboard_admin.html)
    window.showComingSoon = showComingSoon;


    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDashboardAdmin);
    } else {
        initializeDashboardAdmin();
    }

})(window, document);