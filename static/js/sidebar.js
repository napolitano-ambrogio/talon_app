/**
 * ========================================
 * TALON SIDEBAR MODULE - CORRECTED VERSION
 * File: static/js/sidebar.js
 * 
 * Struttura del file:
 * 1. Classe TalonSidebar
 * 2. Inizializzazione e Setup
 * 3. Gestione Stati
 * 4. Eventi Toggle e Hover
 * 5. Eventi Menu
 * 6. Drag and Drop
 * 7. API Pubblica
 * 8. Inizializzazione Globale
 * ========================================
 */

/**
 * ========================================
 * 1. CLASSE TALONSIDEBAR
 * ========================================
 */
class TalonSidebar {
    constructor() {
        // Elementi DOM
        this.sidebar = document.getElementById('sidebar');
        this.menuToggleBtn = document.getElementById('menu-toggle-btn');
        this.tooltip = document.getElementById('tooltip');
        this.menuList = document.getElementById('menu-list');
        
        // Stati
        this.isPinned = localStorage.getItem('sidebarPinned') === 'true';
        this.isExpanded = false;
        this.isLocked = false; // Mantiene la sidebar aperta dopo click su menu
        
        // Drag & Drop
        this.draggedItem = null;
        
        // Inizializza solo se la sidebar esiste
        if (this.sidebar) {
            this.init();
        }
    }

    /**
     * ========================================
     * 2. INIZIALIZZAZIONE E SETUP
     * ========================================
     */
    init() {
        this.applyInitialState();
        this.bindEvents();
        this.initializeDragAndDrop();
        this.loadMenuOrder();
    }

    /**
     * Applica lo stato iniziale della sidebar
     */
    applyInitialState() {
        // Disabilita temporaneamente le transizioni per evitare animazioni al caricamento
        this.sidebar.classList.add('loading');
        
        // Se la sidebar era pinnata, ripristina lo stato
        if (this.isPinned) {
            this.sidebar.classList.add('pinned');
            this.sidebar.classList.add('expanded');
            this.isExpanded = true;
        }
        
        // Ripristina stato "locked" se l'utente aveva cliccato su un menu
        const wasLocked = sessionStorage.getItem('sidebarLocked') === 'true';
        if (wasLocked && !this.isPinned) {
            this.isLocked = true;
            this.sidebar.classList.add('expanded');
            this.sidebar.classList.add('locked');
            this.isExpanded = true;
        }
        
        this.updateTooltipText();
        
        // Riabilita le transizioni dopo il caricamento
        requestAnimationFrame(() => {
            this.sidebar.classList.remove('loading');
        });
    }

    /**
     * ========================================
     * 3. GESTIONE STATI
     * ========================================
     */
    
    /**
     * Espande la sidebar (se non è pinnata)
     */
    expandSidebar() {
        if (!this.isPinned) {
            this.sidebar.classList.add('expanded');
            this.isExpanded = true;
        }
    }

    /**
     * Comprime la sidebar (se non è pinnata o locked)
     */
    collapseSidebar() {
        if (!this.isPinned && !this.isLocked) {
            this.sidebar.classList.remove('expanded');
            this.sidebar.classList.remove('locked');
            this.isExpanded = false;
            this.isLocked = false;
            sessionStorage.removeItem('sidebarLocked');
        }
    }

    /**
     * Aggiorna il testo del tooltip basato sullo stato
     */
    updateTooltipText() {
        if (this.tooltip) {
            this.tooltip.textContent = this.isPinned ? 
                'Comprimi il menu' : 'Mantieni il menu espanso';
        }
    }

    /**
     * ========================================
     * 4. EVENTI TOGGLE E HOVER
     * ========================================
     */
    
    /**
     * Collega tutti gli eventi necessari
     */
    bindEvents() {
        this.bindToggleEvents();
        this.bindHoverEvents();
        this.bindMenuClickEvents();
    }

    /**
     * Eventi per il toggle button
     */
    bindToggleEvents() {
        if (!this.menuToggleBtn) return;
        
        this.menuToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePinned();
        });
    }

    /**
     * Gestisce il toggle dello stato pinned con animazione
     */
    togglePinned() {
        const svg = this.menuToggleBtn.querySelector('svg');
        
        // Gestione animazione icona
        if (!this.isPinned) {
            // Animazione: da 0° a 90° quando si pinna
            this.animateIcon(svg, 0, 90);
        } else {
            // Animazione: da 90° a 0° quando si unpinna
            this.animateIcon(svg, 90, 0);
        }
        
        // Cambia stato
        this.isPinned = !this.isPinned;
        
        // Aggiorna classi
        if (this.isPinned) {
            this.sidebar.classList.add('pinned');
            this.sidebar.classList.add('expanded');
            this.isExpanded = true;
            // Pulisci stati temporanei
            this.isLocked = false;
            sessionStorage.removeItem('sidebarLocked');
        } else {
            this.sidebar.classList.remove('pinned');
            // La sidebar rimane espansa finché l'utente non muove il mouse fuori
        }
        
        // Salva stato e aggiorna UI
        localStorage.setItem('sidebarPinned', this.isPinned.toString());
        this.updateTooltipText();
        this.menuToggleBtn.setAttribute('aria-expanded', this.isPinned.toString());
    }

    /**
     * Anima l'icona del toggle button
     */
    animateIcon(svg, fromDeg, toDeg) {
        if (!svg) return;
        
        // Reset iniziale senza transizione
        svg.style.transition = 'none';
        svg.style.transform = `rotate(${fromDeg}deg) scale(1)`;
        
        // Forza il reflow per assicurare che il reset sia applicato
        void svg.getBoundingClientRect();
        
        // Applica l'animazione
        svg.style.transition = 'transform 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        svg.style.transform = `rotate(${toDeg}deg) scale(${toDeg === 90 ? 1.1 : 1})`;
        
        // Pulisci gli stili inline dopo l'animazione
        setTimeout(() => {
            svg.style.transition = '';
            svg.style.transform = '';
        }, 600);
    }

    /**
     * Eventi hover per espandere/comprimere la sidebar
     */
    bindHoverEvents() {
        if (!this.sidebar) return;
        
        // Mouse entra nella sidebar
        this.sidebar.addEventListener('mouseenter', () => {
            if (!this.isPinned) {
                // Se era locked da un click precedente, ora è hover naturale
                if (this.isLocked) {
                    this.isLocked = false;
                    this.sidebar.classList.remove('locked');
                    sessionStorage.removeItem('sidebarLocked');
                }
                this.expandSidebar();
            }
            this.updateTooltipText();
        });
        
        // Mouse esce dalla sidebar
        this.sidebar.addEventListener('mouseleave', () => {
            if (!this.isPinned) {
                this.collapseSidebar();
                
                if (this.tooltip) {
                    this.tooltip.textContent = 'Espandi il menu';
                }
            }
        });
    }

    /**
     * ========================================
     * 5. EVENTI MENU
     * ========================================
     */
    
    /**
     * Eventi click sui menu items
     */
    bindMenuClickEvents() {
        if (!this.menuList) return;
        
        const menuLinks = this.menuList.querySelectorAll('a');
        
        menuLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                this.handleMenuClick(e, link);
            });
        });
    }

    /**
     * Gestisce il click su un menu item
     */
    handleMenuClick(e, link) {
        // Se la sidebar è già pinnata, non fare nulla di speciale
        if (this.isPinned) {
            // Solo l'animazione di feedback del link
            this.animateMenuClick(link);
            return;
        }
        
        // Se la sidebar non è pinnata ma è espansa, la blocca temporaneamente
        if (this.isExpanded) {
            this.isLocked = true;
            this.sidebar.classList.add('locked');
            sessionStorage.setItem('sidebarLocked', 'true');
        }
        
        // Effetto visivo di feedback
        this.animateMenuClick(link);
    }

    /**
     * Animazione feedback per click menu
     */
    animateMenuClick(link) {
        link.style.transform = 'scale(0.98)';
        setTimeout(() => {
            link.style.transform = '';
        }, 150);
    }

    /**
     * ========================================
     * 6. DRAG AND DROP
     * ========================================
     */
    
    /**
     * Inizializza il drag and drop per riordinare i menu
     */
    initializeDragAndDrop() {
        if (!this.menuList) return;

        this.menuList.addEventListener('dragstart', this.handleDragStart.bind(this));
        this.menuList.addEventListener('dragend', this.handleDragEnd.bind(this));
        this.menuList.addEventListener('dragover', this.handleDragOver.bind(this));
        this.menuList.addEventListener('drop', this.handleDrop.bind(this));
    }

    handleDragStart(e) {
        this.draggedItem = e.target.closest('li');
        if (!this.draggedItem) return;
        
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setDragImage(this.draggedItem, 20, 20);
        }
        
        // Aggiungi classe per styling
        setTimeout(() => {
            this.draggedItem.classList.add('dragging');
        }, 0);
    }

    handleDragEnd() {
        if (!this.draggedItem) return;
        
        // Rimuovi classi di drag
        this.draggedItem.classList.remove('dragging');
        
        const placeholder = this.menuList.querySelector('.drag-over');
        if (placeholder) {
            placeholder.classList.remove('drag-over');
        }
        
        // Salva il nuovo ordine
        this.saveMenuOrder();
        this.draggedItem = null;
    }

    handleDragOver(e) {
        e.preventDefault();
        if (!this.draggedItem) return;
        
        const afterElement = this.getDragAfterElement(this.menuList, e.clientY);
        
        // Rimuovi placeholder precedente
        const currentPlaceholder = this.menuList.querySelector('.drag-over');
        if (currentPlaceholder) {
            currentPlaceholder.classList.remove('drag-over');
        }
        
        // Riposiziona l'elemento
        if (afterElement) {
            afterElement.classList.add('drag-over');
            this.menuList.insertBefore(this.draggedItem, afterElement);
        } else {
            this.menuList.appendChild(this.draggedItem);
        }
    }

    handleDrop(e) {
        e.preventDefault();
    }

    /**
     * Trova l'elemento dopo il quale inserire l'elemento trascinato
     */
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll(':scope > li:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    /**
     * Salva l'ordine dei menu nel localStorage
     */
    saveMenuOrder() {
        const order = [...this.menuList.children].map(item => item.dataset.menuId);
        localStorage.setItem('sidebarMenuOrder', JSON.stringify(order));
    }

    /**
     * Carica l'ordine dei menu salvato
     */
    loadMenuOrder() {
        const savedOrder = JSON.parse(localStorage.getItem('sidebarMenuOrder') || '[]');
        
        if (savedOrder && Array.isArray(savedOrder)) {
            savedOrder.forEach(menuId => {
                const itemToMove = this.menuList.querySelector(`li[data-menu-id="${menuId}"]`);
                if (itemToMove) {
                    this.menuList.appendChild(itemToMove);
                }
            });
        }
    }

    /**
     * ========================================
     * 7. API PUBBLICA
     * ========================================
     */
    
    /**
     * Pinna la sidebar programmaticamente
     */
    pin() {
        if (!this.isPinned) {
            this.togglePinned();
        }
    }

    /**
     * Unpinna la sidebar programmaticamente
     */
    unpin() {
        if (this.isPinned) {
            this.togglePinned();
        }
    }

    /**
     * Restituisce lo stato pinned
     */
    isPinnedState() {
        return this.isPinned;
    }

    /**
     * Espande la sidebar programmaticamente
     */
    expand() {
        this.expandSidebar();
    }

    /**
     * Comprime la sidebar programmaticamente
     */
    collapse() {
        this.isLocked = false;
        this.collapseSidebar();
    }
}

/**
 * ========================================
 * 8. INIZIALIZZAZIONE GLOBALE
 * ========================================
 */
document.addEventListener('DOMContentLoaded', function() {
    // Crea istanza globale della sidebar
    window.talonSidebar = new TalonSidebar();
});