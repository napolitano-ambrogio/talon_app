/**
 * ========================================
 * TALON - Dashboard Eventi Controller
 * File: dashboard-eventi-controller.js
 * 
 * Versione: 1.0.0
 * Controller principale per la gestione del dashboard eventi
 * Refactoring completo con best practices Chart.js
 * ========================================
 */

class TalonDashboardEventiController {
    constructor() {
        this.config = {
            performance: {
                animation: false,
                resizeDelay: 150,
                debounceDelay: 300
            },
            selectors: {
                periodBtns: '.period-btn',
                caractereBtns: 'input[name="evento_carattere"]',
                tabBtns: '.tab-btn',
                customPeriodSelector: '#eventCustomPeriodSelector',
                periodInfo: '#eventPeriodInfo'
            }
        };

        this.state = {
            isInitialized: false,
            resizeTimeout: null,
            activeView: 'tipologie'
        };

        this.charts = {
            tipologie: null,
            enti: null,
            active: null
        };

        this.init();
    }

    /**
     * Inizializzazione del controller
     */
    init() {
        if (this.state.isInitialized) return;

        try {
            this.setupBodyClass();
            this.setupResizeHandler();
            this.createChartInstances();
            this.bindEventHandlers();
            this.adjustLayoutHeight();
            
            this.state.isInitialized = true;
        } catch (error) {
            console.error('❌ Errore inizializzazione dashboard eventi:', error);
        }
    }

    /**
     * Setup classe body per stili specifici
     */
    setupBodyClass() {
        if (!document.body.classList.contains('eventi-dashboard')) {
            document.body.classList.add('eventi-dashboard');
        }
    }

    /**
     * Setup gestore resize ottimizzato
     */
    setupResizeHandler() {
        window.addEventListener('resize', () => {
            clearTimeout(this.state.resizeTimeout);
            this.state.resizeTimeout = setTimeout(() => {
                this.adjustLayoutHeight();
            }, this.config.performance.debounceDelay);
        });
    }

    /**
     * Calcolo ottimizzato dell'altezza layout
     */
    adjustLayoutHeight() {
        const mainContent = document.getElementById('main-content');
        const header = document.querySelector('.talon-header');
        const footer = document.querySelector('.page-footer');

        if (mainContent && header && footer) {
            const headerHeight = header.offsetHeight;
            const footerHeight = footer.offsetHeight;
            const minHeight = Math.max(400, window.innerHeight - headerHeight - footerHeight - 40);
            
            mainContent.style.minHeight = `${minHeight}px`;
        }
    }

    /**
     * Creazione istanze chart con configurazione ottimizzata
     */
    createChartInstances() {
        if (typeof TalonEventDrillDownChart === 'undefined') {
            throw new Error('TalonEventDrillDownChart non disponibile');
        }

        // Istanza per vista tipologie (default attiva)
        this.charts.tipologie = new TalonEventDrillDownChart({
            canvas: 'eventChartCanvas',
            period: 'year',
            viewType: 'tipologie',
            animation: this.config.performance.animation
        });

        this.charts.active = this.charts.tipologie;
        window.eventDrillDownChart = this.charts.tipologie;
    }

    /**
     * Binding di tutti gli event handler
     */
    bindEventHandlers() {
        this.bindPeriodHandlers();
        this.bindCharacterHandlers();
        this.bindTabHandlers();
        this.bindCustomPeriodHandlers();
    }

    /**
     * Gestori per i bottoni periodo
     */
    bindPeriodHandlers() {
        document.querySelectorAll(`${this.config.selectors.periodBtns}[data-period]:not([data-period="custom"])`).forEach(btn => {
            btn.addEventListener('click', (event) => {
                const period = event.target.getAttribute('data-period');
                this.handlePeriodChange(period, event.target);
            });
        });
    }

    /**
     * Gestori per i filtri carattere
     */
    bindCharacterHandlers() {
        document.querySelectorAll(this.config.selectors.caractereBtns).forEach(input => {
            input.addEventListener('change', (event) => {
                this.handleCharacterChange(event.target);
            });
        });
    }

    /**
     * Gestori per le schede vista
     */
    bindTabHandlers() {
        document.querySelectorAll(this.config.selectors.tabBtns).forEach(button => {
            button.addEventListener('click', (event) => {
                const targetView = event.target.getAttribute('data-view');
                this.handleViewChange(targetView, event.target);
            });
        });
    }

    /**
     * Gestori per periodo personalizzato
     */
    bindCustomPeriodHandlers() {
        // Funzioni globali richieste dal template
        window.toggleEventCustomPeriod = () => this.toggleCustomPeriod();
        window.applyEventCustomPeriod = () => this.applyCustomPeriod();
        window.cancelEventCustomPeriod = () => this.cancelCustomPeriod();
    }

    /**
     * Gestione cambio periodo
     */
    handlePeriodChange(period, targetBtn) {
        // Aggiorna stati visivi
        document.querySelectorAll(this.config.selectors.periodBtns).forEach(btn => 
            btn.classList.remove('active')
        );
        targetBtn.classList.add('active');

        // Nascondi elementi periodo custom
        this.hideCustomPeriodElements();

        // Applica al chart attivo
        if (this.charts.active?.setPeriod) {
            this.charts.active.setPeriod(period);
        }
    }

    /**
     * Gestione cambio filtro carattere
     */
    handleCharacterChange(targetInput) {
        // Aggiorna stili visivi
        document.querySelectorAll('.carattere-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '#e9ecef';
            btn.style.color = '#495057';
        });

        const selectedLabel = document.querySelector(`label[for="${targetInput.id}"]`);
        if (selectedLabel) {
            selectedLabel.classList.add('active');
            selectedLabel.style.background = '#667eea';
            selectedLabel.style.color = 'white';
        }

        // Ricarica chart attivo
        if (this.charts.active?.refreshCurrentLevel) {
            this.charts.active.refreshCurrentLevel();
        }
    }

    /**
     * Gestione cambio vista (tipologie/enti)
     */
    handleViewChange(targetView, targetBtn) {
        if (this.state.activeView === targetView) return;

        // Aggiorna stati schede
        document.querySelectorAll(this.config.selectors.tabBtns).forEach(btn => 
            btn.classList.remove('active')
        );
        targetBtn.classList.add('active');

        // Aggiorna viste chart
        this.switchChartView(targetView);
        
        this.state.activeView = targetView;
    }

    /**
     * Switch tra le viste chart
     */
    switchChartView(targetView) {
        // Nascondi tutte le viste
        document.querySelectorAll('.chart-view').forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });

        // Mostra vista target
        const targetChartView = document.getElementById(`chartView${targetView.charAt(0).toUpperCase() + targetView.slice(1)}`);
        if (targetChartView) {
            targetChartView.classList.add('active');
            targetChartView.style.display = 'block';
        }

        // Gestione istanze chart
        if (targetView === 'enti') {
            this.activateEntiView();
        } else {
            this.activateTipologieView();
        }
    }

    /**
     * Attivazione vista enti
     */
    activateEntiView() {
        // Lazy loading dell'istanza enti
        if (!this.charts.enti) {
            this.charts.enti = new TalonEventDrillDownChart({
                canvas: 'eventEntiChartCanvas',
                period: 'year',
                viewType: 'enti',
                animation: this.config.performance.animation
            });
        }

        this.charts.active = this.charts.enti;
        window.eventDrillDownChart = this.charts.enti;
        
        this.syncGlobalState('enti');
    }

    /**
     * Attivazione vista tipologie
     */
    activateTipologieView() {
        this.charts.active = this.charts.tipologie;
        window.eventDrillDownChart = this.charts.tipologie;
        
        this.syncGlobalState('tipologie');
        
        // Refresh se necessario
        if (this.shouldRefreshTipologieView()) {
            setTimeout(() => {
                if (this.charts.tipologie?.refresh) {
                    this.charts.tipologie.refresh();
                }
            }, 100);
        }
    }

    /**
     * Sincronizzazione stato globale
     */
    syncGlobalState(viewType) {
        if (typeof eventState !== 'undefined') {
            eventState.viewType = viewType;
            eventState.currentLevel = this.charts.active.state?.currentLevel || 0;
            eventState.currentPeriod = this.charts.active.state?.currentPeriod || 'year';
        }
    }

    /**
     * Verifica se è necessario refresh della vista tipologie
     */
    shouldRefreshTipologieView() {
        return typeof eventChart === 'undefined' || eventChart.canvas.id !== 'eventChartCanvas';
    }

    /**
     * Toggle periodo personalizzato
     */
    toggleCustomPeriod() {
        const selector = document.getElementById('eventCustomPeriodSelector');
        const isVisible = selector.style.display !== 'none';
        
        selector.style.display = isVisible ? 'none' : 'block';
        
        // Aggiorna stato bottoni
        document.querySelectorAll(this.config.selectors.periodBtns).forEach(btn => 
            btn.classList.remove('active')
        );
        
        if (!isVisible) {
            document.querySelector('[data-period="custom"]')?.classList.add('active');
        }
    }

    /**
     * Applicazione periodo personalizzato
     */
    applyCustomPeriod() {
        const startDate = document.getElementById('eventStartDate').value;
        const endDate = document.getElementById('eventEndDate').value;

        if (!this.validateCustomPeriod(startDate, endDate)) return;

        // Applica al chart attivo
        if (this.charts.active?.setCustomPeriod) {
            this.charts.active.setCustomPeriod(startDate, endDate);
        }

        // Aggiorna UI
        this.hideCustomPeriodElements();
        this.showPeriodInfo(`Periodo personalizzato: ${startDate} - ${endDate}`);
    }

    /**
     * Annullamento periodo personalizzato
     */
    cancelCustomPeriod() {
        this.hideCustomPeriodElements();
        
        document.querySelectorAll(this.config.selectors.periodBtns).forEach(btn => 
            btn.classList.remove('active')
        );
        document.querySelector('[data-period="year"]')?.classList.add('active');
    }

    /**
     * Validazione periodo personalizzato
     */
    validateCustomPeriod(startDate, endDate) {
        if (!startDate || !endDate) {
            alert('Seleziona entrambe le date');
            return false;
        }

        if (new Date(startDate) > new Date(endDate)) {
            alert('La data di inizio deve essere precedente alla data di fine');
            return false;
        }

        return true;
    }

    /**
     * Nasconde elementi periodo personalizzato
     */
    hideCustomPeriodElements() {
        document.getElementById('eventCustomPeriodSelector').style.display = 'none';
        document.getElementById('eventPeriodInfo').style.display = 'none';
    }

    /**
     * Mostra informazioni periodo
     */
    showPeriodInfo(text) {
        const periodInfo = document.getElementById('eventPeriodInfo');
        const periodText = document.getElementById('eventPeriodInfoText');
        
        periodText.textContent = text;
        periodInfo.style.display = 'block';
    }

    /**
     * Metodo pubblico per ottenere il chart attivo
     */
    getActiveChart() {
        return this.charts.active;
    }

    /**
     * Metodo pubblico per cleanup
     */
    destroy() {
        // Cleanup degli event listener
        clearTimeout(this.state.resizeTimeout);
        
        // Cleanup delle istanze chart se necessario
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });

        this.state.isInitialized = false;
    }
}

// Export per compatibilità
window.TalonDashboardEventiController = TalonDashboardEventiController;