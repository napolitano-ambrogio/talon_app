/**
 * Sistema Tooltip per Sidebar TALON
 * Gestisce tutti i tooltip in modo uniforme con JavaScript
 */

class SidebarTooltips {
    constructor() {
        this.tooltip = null;
        this.init();
    }

    init() {
        // Crea il tooltip elemento
        this.createTooltip();
        
        // Bind eventi
        this.bindEvents();
        
        // Sistema inizializzato (log rimosso per produzione)
    }

    createTooltip() {
        // Rimuovi tooltip esistenti
        const existing = document.querySelector('.sidebar-tooltip');
        if (existing) {
            existing.remove();
        }

        // Crea nuovo tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'sidebar-tooltip';
        this.tooltip.textContent = '';
        document.body.appendChild(this.tooltip);
    }

    bindEvents() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // Menu toggle button con stato dinamico
        const menuToggle = sidebar.querySelector('.menu-toggle');
        if (menuToggle) {
            menuToggle.addEventListener('mouseenter', (e) => {
                const tooltipText = this.getMenuToggleTooltipText();
                this.showTooltip(e.target, tooltipText);
            });
            menuToggle.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        }

        // Menu items quando sidebar è compressa
        const menuItems = sidebar.querySelectorAll('.sidebar-menu li a');
        menuItems.forEach(item => {
            item.addEventListener('mouseenter', (e) => {
                if (!sidebar.classList.contains('expanded') && !sidebar.classList.contains('pinned')) {
                    const label = e.target.getAttribute('aria-label') || e.target.querySelector('.menu-text')?.textContent || 'Menu';
                    this.showTooltip(e.target, label);
                }
            });
            item.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        });

        // Logout button quando sidebar è compressa
        const logoutBtn = sidebar.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('mouseenter', (e) => {
                if (!sidebar.classList.contains('expanded') && !sidebar.classList.contains('pinned')) {
                    this.showTooltip(e.target, 'Logout');
                }
            });
            logoutBtn.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        }
    }

    showTooltip(element, text) {
        if (!this.tooltip || !element) return;

        const rect = element.getBoundingClientRect();
        const sidebarRect = document.querySelector('.sidebar').getBoundingClientRect();
        
        // Posiziona tooltip
        const left = sidebarRect.right + 10;
        const top = rect.top + (rect.height / 2) - (this.tooltip.offsetHeight / 2);

        this.tooltip.textContent = text;
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';
        
        // Mostra tooltip con delay
        setTimeout(() => {
            this.tooltip.classList.add('show');
        }, 300);
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('show');
        }
    }

    getMenuToggleTooltipText() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return 'Toggle menu';
        
        if (sidebar.classList.contains('pinned')) {
            return 'Sblocca il menu';
        } else if (sidebar.classList.contains('expanded')) {
            return 'Comprimi il menu';
        } else {
            return 'Espandi il menu';
        }
    }
}

// Inizializza quando il DOM è pronto
document.addEventListener('DOMContentLoaded', function() {
    window.sidebarTooltips = new SidebarTooltips();
});

// Reinizializza se la sidebar viene modificata dinamicamente
window.reinitSidebarTooltips = function() {
    if (window.sidebarTooltips) {
        window.sidebarTooltips.init();
    }
};