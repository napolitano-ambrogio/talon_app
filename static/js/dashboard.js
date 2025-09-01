'use strict';

const Dashboard = {
    autoRefreshInterval: null,
    autoRefreshState: 0,
    
    STORAGE_KEY: 'talon_autorefresh_settings',
    
    STATES: [
        { text: 'AUTO-REFRESH OFF', minutes: 0 },
        { text: 'AUTO-REFRESH 15 MIN', minutes: 15 },
        { text: 'AUTO-REFRESH 30 MIN', minutes: 30 },
        { text: 'AUTO-REFRESH 60 MIN', minutes: 60 }
    ],

    NOTIFICATION_COLORS: {
        success: '#28a745',
        error: '#dc3545', 
        warning: '#ffc107',
        info: '#17a2b8'
    },

    init() {
        // Dashboard caricata (log rimosso per produzione)
        this.loadAutoRefreshSettings();
        this.bindEvents();
    },

    bindEvents() {
        const btn = document.getElementById('autoRefreshBtn');
        if (btn) {
            btn.addEventListener('click', () => this.cycleAutoRefresh());
        }
    },

    cycleAutoRefresh() {
        this.clearCurrentInterval();
        
        this.autoRefreshState = (this.autoRefreshState + 1) % this.STATES.length;
        const currentState = this.STATES[this.autoRefreshState];
        
        this.updateButton(currentState);
        
        if (currentState.minutes > 0) {
            this.startAutoRefresh(currentState);
            this.showNotification(`Auto-refresh: ${currentState.minutes} minuti`, 'success');
        } else {
            this.showNotification('Auto-refresh disattivato', 'info');
        }
        
        this.saveSettings();
    },

    clearCurrentInterval() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    },

    updateButton(state) {
        const btn = document.getElementById('autoRefreshBtn');
        if (!btn) return;
        
        btn.textContent = state.text;
        btn.className = state.minutes > 0 
            ? 'btn btn-warning dashboard__auto-refresh-btn--active' 
            : 'btn btn-info dashboard__auto-refresh-btn';
    },

    startAutoRefresh(state) {
        this.autoRefreshInterval = setInterval(() => {
            window.location.reload();
        }, state.minutes * 60 * 1000);
    },

    saveSettings() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ 
                state: this.autoRefreshState 
            }));
        } catch (error) {
            console.error('Errore salvataggio auto-refresh:', error);
        }
    },

    loadAutoRefreshSettings() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) return;
            
            const settings = JSON.parse(saved);
            this.autoRefreshState = settings.state || 0;
            
            const currentState = this.STATES[this.autoRefreshState];
            if (currentState) {
                this.updateButton(currentState);
            }
        } catch (error) {
            console.error('Errore caricamento auto-refresh:', error);
        }
    },

    showNotification(message, type = 'info') {
        this.removeExistingNotifications();
        
        const notification = this.createNotificationElement(message, type);
        document.body.appendChild(notification);
        
        this.animateNotification(notification);
    },

    removeExistingNotifications() {
        document.querySelectorAll('.notification').forEach(n => n.remove());
    },

    createNotificationElement(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.setAttribute('role', 'alert');
        notification.setAttribute('aria-live', 'polite');
        
        const backgroundColor = this.NOTIFICATION_COLORS[type] || this.NOTIFICATION_COLORS.info;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 400px;
            word-wrap: break-word;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: ${backgroundColor};
            transform: translateX(100%);
        `;
        
        return notification;
    },

    animateNotification(notification) {
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => Dashboard.init());