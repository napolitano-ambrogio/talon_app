/**
 * TALON System - Single Page Application Core
 * Version: 2.0.0
 * Description: Gestione completa navigazione SPA, routing, stati e transizioni
 */

// ============================================
// CONFIGURAZIONE GLOBALE
// ============================================

const TalonApp = (function() {
    'use strict';

    // Configurazione
    const CONFIG = {
        appName: 'TALON System',
        version: '2.0.0',
        apiBaseUrl: window.location.origin,
        debug: false,  // Disable debug logs - system working
        transitions: {
            fadeIn: 300,
            fadeOut: 200
        },
        cache: {
            enabled: true,
            ttl: 300000 // 5 minuti in millisecondi
        }
    };

    // ============================================
    // STATO APPLICAZIONE
    // ============================================

    const State = {
        currentRoute: null,
        previousRoute: null,
        isNavigating: false,
        isFullscreen: false,
        user: null,
        permissions: [],
        cache: new Map(),
        listeners: new Map(),
        history: [],
        pageWasRefreshed: false  // Track if page was refreshed
    };

    // ============================================
    // UTILITÀ
    // ============================================

    const Utils = {
        /**
         * Log condizionale basato su debug mode
         */
        log: function(...args) {
            if (CONFIG.debug) {
                console.log('[TALON SPA]', ...args);
            }
        },

        /**
         * Log errori
         */
        error: function(...args) {
            console.error('[TALON SPA ERROR]', ...args);
        },

        /**
         * Genera ID univoco
         */
        generateId: function() {
            return '_' + Math.random().toString(36).substr(2, 9);
        },

        /**
         * Debounce function
         */
        debounce: function(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Parse URL e estrai parametri
         */
        parseUrl: function(url) {
            const a = document.createElement('a');
            a.href = url;
            
            const searchParams = new URLSearchParams(a.search);
            const params = {};
            for (let [key, value] of searchParams) {
                params[key] = value;
            }

            return {
                pathname: a.pathname,
                search: a.search,
                hash: a.hash,
                params: params,
                full: url
            };
        },

        /**
         * Sanitizza HTML per prevenire XSS
         */
        sanitizeHtml: function(html) {
            const div = document.createElement('div');
            div.textContent = html;
            return div.innerHTML;
        }
    };

    // ============================================
    // GESTIONE CACHE
    // ============================================

    const Cache = {
        /**
         * Salva in cache
         */
        set: function(key, data, ttl = CONFIG.cache.ttl) {
            if (!CONFIG.cache.enabled) return;

            State.cache.set(key, {
                data: data,
                timestamp: Date.now(),
                ttl: ttl
            });

            Utils.log('Cache set:', key);
        },

        /**
         * Recupera dalla cache
         */
        get: function(key) {
            if (!CONFIG.cache.enabled) return null;

            // If page was refreshed, don't use cache
            if (State.pageWasRefreshed) {
                Utils.log('Page was refreshed, bypassing cache for key:', key);
                State.cache.delete(key);
                return null;
            }

            const cached = State.cache.get(key);
            if (!cached) return null;

            const age = Date.now() - cached.timestamp;
            if (age > cached.ttl) {
                State.cache.delete(key);
                Utils.log('Cache expired:', key);
                return null;
            }

            Utils.log('Cache hit:', key);
            return cached.data;
        },

        /**
         * Pulisci cache
         */
        clear: function() {
            State.cache.clear();
            Utils.log('Cache cleared');
        },

        /**
         * Invalida cache per pattern
         */
        invalidate: function(pattern) {
            const regex = new RegExp(pattern);
            for (let key of State.cache.keys()) {
                if (regex.test(key)) {
                    State.cache.delete(key);
                    Utils.log('Cache invalidated:', key);
                }
            }
        }
    };

    // ============================================
    // GESTIONE EVENTI
    // ============================================

    const Events = {
        /**
         * Sottoscrivi a un evento
         */
        on: function(event, callback) {
            if (!State.listeners.has(event)) {
                State.listeners.set(event, []);
            }
            State.listeners.get(event).push(callback);
        },

        /**
         * Rimuovi sottoscrizione
         */
        off: function(event, callback) {
            if (!State.listeners.has(event)) return;
            
            const callbacks = State.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        },

        /**
         * Emetti evento
         */
        emit: function(event, data) {
            if (!State.listeners.has(event)) return;
            
            State.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    Utils.error('Event callback error:', e);
                }
            });
        }
    };

    // ============================================
    // GESTIONE LOADER E UI
    // ============================================

    const UI = {
        /**
         * Mostra loader
         */
        showLoader: function() {
            let loader = document.getElementById('spa-loader');
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'spa-loader';
                loader.className = 'spa-loader';
                loader.innerHTML = `
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">Caricamento...</span>
                    </div>
                `;
                document.body.appendChild(loader);
            }
            loader.classList.add('active');
        },

        /**
         * Nascondi loader
         */
        hideLoader: function() {
            const loader = document.getElementById('spa-loader');
            if (loader) {
                loader.classList.remove('active');
            }
        },

        /**
         * Mostra toast notification
         */
        showToast: function(message, type = 'info', duration = 3000) {
            const toastContainer = this.getToastContainer();
            const toastId = Utils.generateId();
            
            const toast = document.createElement('div');
            toast.id = toastId;
            toast.className = `toast align-items-center text-white bg-${type} border-0`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');
            toast.setAttribute('aria-atomic', 'true');
            
            toast.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">
                        ${Utils.sanitizeHtml(message)}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" 
                            data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            `;
            
            toastContainer.appendChild(toast);
            
            // Bootstrap toast
            if (window.bootstrap && window.bootstrap.Toast) {
                const bsToast = new bootstrap.Toast(toast, {
                    autohide: true,
                    delay: duration
                });
                bsToast.show();
                
                toast.addEventListener('hidden.bs.toast', () => {
                    toast.remove();
                });
            } else {
                // Fallback senza Bootstrap
                setTimeout(() => {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 300);
                }, duration);
            }
        },

        /**
         * Ottieni o crea container per toast
         */
        getToastContainer: function() {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'toast-container position-fixed top-0 end-0 p-3';
                container.style.zIndex = '9999';
                document.body.appendChild(container);
            }
            return container;
        },

        /**
         * Aggiorna breadcrumb
         */
        updateBreadcrumb: function(breadcrumbHtml) {
            const breadcrumb = document.querySelector('.breadcrumb');
            if (breadcrumb && breadcrumbHtml) {
                breadcrumb.innerHTML = breadcrumbHtml;
            }
        },

        /**
         * Aggiorna titolo pagina
         */
        updateTitle: function(title) {
            document.title = title || CONFIG.appName;
        },

        /**
         * Gestisci transizione contenuto
         */
        transitionContent: async function(newContent) {
            const mainContent = document.querySelector('.main-content');
            if (!mainContent) return;

            // Fade out
            mainContent.style.opacity = '0';
            mainContent.style.transition = `opacity ${CONFIG.transitions.fadeOut}ms ease`;
            
            await new Promise(resolve => setTimeout(resolve, CONFIG.transitions.fadeOut));
            
            // Aggiorna contenuto
            mainContent.innerHTML = newContent;
            
            // Fade in
            mainContent.style.opacity = '1';
            mainContent.style.transition = `opacity ${CONFIG.transitions.fadeIn}ms ease`;
            
            // Reinizializza componenti
            this.reinitializeComponents();
        },

        /**
         * Reinizializza componenti UI dopo caricamento contenuto
         */
        reinitializeComponents: function() {
            // Reinizializza tooltip Bootstrap
            if (window.bootstrap && window.bootstrap.Tooltip) {
                const tooltipTriggerList = [].slice.call(
                    document.querySelectorAll('[data-bs-toggle="tooltip"]')
                );
                tooltipTriggerList.map(function(tooltipTriggerEl) {
                    return new bootstrap.Tooltip(tooltipTriggerEl);
                });
            }

            // Reinizializza popover Bootstrap
            if (window.bootstrap && window.bootstrap.Popover) {
                const popoverTriggerList = [].slice.call(
                    document.querySelectorAll('[data-bs-toggle="popover"]')
                );
                popoverTriggerList.map(function(popoverTriggerEl) {
                    return new bootstrap.Popover(popoverTriggerEl);
                });
            }

            // Emetti evento per altri moduli
            Events.emit('content:loaded');
        }
    };

    // ============================================
    // GESTIONE NAVIGAZIONE E ROUTING
    // ============================================

    const Router = {
        /**
         * Naviga a URL
         */
        navigate: async function(url, options = {}) {
            // Previeni navigazione multipla
            if (State.isNavigating) {
                Utils.log('Navigation already in progress');
                return;
            }

            // Parse URL
            const urlData = Utils.parseUrl(url);
            const isDashboardAdmin = urlData.pathname.includes('dashboard_admin');
            
            Utils.log('🚀 [Router.navigate] Starting navigation:', {
                url: urlData.pathname,
                isDashboardAdmin,
                currentRoute: State.currentRoute,
                options
            });
            
            // SPECIAL CASE: Always force reload for dashboard_admin
            if (isDashboardAdmin) {
                Utils.log('🔄 [Router.navigate] FORCING FULL RELOAD FOR DASHBOARD_ADMIN');
                options.force = true;
                // Clear cache for dashboard
                const cacheKey = `page:${urlData.pathname}`;
                State.cache.delete(cacheKey);
                Utils.log(`Cache cleared for: ${cacheKey}`);
            }
            
            // Se è lo stesso URL e non forziamo reload, reinizializza componenti invece di uscire
            // Ma forza sempre il reload se la pagina è stata refreshed
            if (urlData.pathname === State.currentRoute && !options.force && !State.pageWasRefreshed) {
                Utils.log('Same route detected, reinitializing page components...');
                // Reinizializza i componenti della pagina corrente
                try {
                    if (window.TalonSPA && window.TalonSPA.reinitializeComponents) {
                        window.TalonSPA.reinitializeComponents();
                    }
                    Utils.log('Page components reinitialized for same route');
                } catch (error) {
                    Utils.log('Error reinitializing components:', error);
                }
                return;
            }
            
            // Force reload if page was refreshed
            if (State.pageWasRefreshed) {
                Utils.log('Page was refreshed, forcing content reload even for same route');
                options.force = true;
            }

            State.isNavigating = true;
            State.previousRoute = State.currentRoute;
            State.currentRoute = urlData.pathname;

            Utils.log('Navigating to:', urlData.pathname);

            // Emetti evento pre-navigazione
            Events.emit('navigation:start', { url: urlData, options });

            try {
                // Mostra loader
                UI.showLoader();

                // Controlla cache
                const cacheKey = `page:${urlData.pathname}`;
                let data = Cache.get(cacheKey);

                if (!data || options.force) {
                    // Fetch nuovo contenuto
                    data = await this.fetchPage(urlData.pathname);
                    
                    if (data && data.success) {
                        Cache.set(cacheKey, data);
                    }
                }

                if (data && data.success) {
                    // Aggiorna URL browser
                    if (!options.silent) {
                        window.history.pushState(
                            { path: urlData.pathname },
                            data.title || '',
                            urlData.pathname + urlData.search
                        );
                    }

                    // Aggiorna UI
                    await UI.transitionContent(data.content || data.html);
                    UI.updateTitle(data.title);
                    UI.updateBreadcrumb(data.breadcrumb);

                    // Gestisci flash messages
                    if (data.flash_messages && data.flash_messages.length > 0) {
                        data.flash_messages.forEach(([type, message]) => {
                            const toastType = type === 'error' ? 'danger' : type;
                            UI.showToast(message, toastType);
                        });
                    }

                    // Scroll top
                    if (!options.preserveScroll) {
                        window.scrollTo(0, 0);
                    }

                    // Aggiorna storia
                    State.history.push({
                        url: urlData.pathname,
                        timestamp: Date.now()
                    });

                    // Emetti evento navigazione completata
                    Events.emit('navigation:complete', { url: urlData, data });

                    // Reset page refresh flag after first successful navigation
                    if (State.pageWasRefreshed) {
                        Utils.log('Resetting page refresh flag after successful navigation');
                        State.pageWasRefreshed = false;
                    }

                } else {
                    throw new Error(data?.error || 'Errore caricamento pagina');
                }

            } catch (error) {
                Utils.error('Navigation error:', error);
                UI.showToast('Errore durante la navigazione: ' + error.message, 'danger');
                
                // Emetti evento errore
                Events.emit('navigation:error', { url: urlData, error });
                
                // Ripristina route precedente
                State.currentRoute = State.previousRoute;

            } finally {
                State.isNavigating = false;
                UI.hideLoader();
            }
        },

        /**
         * Fetch pagina dal server
         */
        fetchPage: async function(url) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'X-SPA-Request': 'true',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json'
                    },
                    credentials: 'same-origin'
                });

                // Gestisci redirect (login)
                if (response.redirected) {
                    window.location.href = response.url;
                    return null;
                }

                // Gestisci errori HTTP
                if (!response.ok) {
                    if (response.status === 401) {
                        // Non autorizzato - redirect al login
                        window.location.href = '/login?next=' + encodeURIComponent(url);
                        return null;
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type');
                
                // Se è JSON, parsalo
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                }
                
                // Altrimenti assumi sia HTML
                const html = await response.text();
                return {
                    success: true,
                    html: html,
                    content: html
                };

            } catch (error) {
                Utils.error('Fetch error:', error);
                throw error;
            }
        },

        /**
         * Gestisci navigazione indietro/avanti browser
         */
        handlePopState: function(event) {
            if (event.state && event.state.path) {
                Router.navigate(event.state.path, { silent: true });
            }
        },

        /**
         * Intercetta click su link
         */
        interceptLinks: function() {
            document.addEventListener('click', function(e) {
                // Trova il link più vicino
                const link = e.target.closest('a');
                
                if (!link) return;

                // Ignora link esterni
                if (link.host !== window.location.host) return;

                // Ignora link con target
                if (link.target && link.target !== '_self') return;

                // Ignora link speciali
                if (link.getAttribute('data-spa-ignore') === 'true') return;
                
                // Ignora dashboard_admin - lascia gestire a TalonSPA
                if (link.href && link.href.includes('dashboard_admin')) {
                    console.log('[TALON App] Skipping dashboard_admin - delegating to TalonSPA');
                    return;
                }
                
                // Ignora download
                if (link.hasAttribute('download')) return;

                // Ignora logout (deve fare reload completo)
                if (link.pathname === '/logout' || link.pathname === '/auth/logout') return;

                // Ignora link a file
                const fileExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar'];
                if (fileExtensions.some(ext => link.pathname.endsWith(ext))) return;

                // Previeni comportamento default
                e.preventDefault();

                // Controlla se forzare la navigazione
                const forceNavigation = link.getAttribute('data-spa-force') === 'true';
                
                // Naviga con SPA
                Router.navigate(link.href, { force: forceNavigation });
            });
        },

        /**
         * Intercetta submit form
         */
        interceptForms: function() {
            document.addEventListener('submit', async function(e) {
                const form = e.target;
                
                // Ignora form con attributo spa-ignore
                if (form.getAttribute('data-spa-ignore') === 'true') return;
                
                // Ignora form di login
                if (form.action.includes('/login') || form.action.includes('/auth/login')) return;

                e.preventDefault();

                // Serializza form data
                const formData = new FormData(form);
                const method = form.method || 'POST';
                const action = form.action || window.location.href;

                try {
                    UI.showLoader();

                    const response = await fetch(action, {
                        method: method,
                        headers: {
                            'X-SPA-Request': 'true',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: method === 'GET' ? null : formData,
                        credentials: 'same-origin'
                    });

                    if (response.redirected) {
                        Router.navigate(response.url);
                        return;
                    }

                    const contentType = response.headers.get('content-type');
                    
                    if (contentType && contentType.includes('application/json')) {
                        const data = await response.json();
                        
                        if (data.redirect) {
                            Router.navigate(data.redirect);
                        } else if (data.success) {
                            UI.showToast(data.message || 'Operazione completata', 'success');
                            
                            // Invalida cache relativa
                            Cache.invalidate(action);
                            
                            // Ricarica pagina corrente
                            if (data.reload !== false) {
                                Router.navigate(window.location.pathname, { force: true });
                            }
                        } else {
                            UI.showToast(data.error || 'Errore durante l\'operazione', 'danger');
                        }
                    } else {
                        // Assumi successo se non è JSON
                        Router.navigate(window.location.pathname, { force: true });
                    }

                } catch (error) {
                    Utils.error('Form submission error:', error);
                    UI.showToast('Errore durante l\'invio del form', 'danger');
                } finally {
                    UI.hideLoader();
                }
            });
        }
    };

    // ============================================
    // GESTIONE FULLSCREEN
    // ============================================

    const Fullscreen = {
        /**
         * Toggle fullscreen
         */
        toggle: function() {
            if (!document.fullscreenElement) {
                this.enter();
            } else {
                this.exit();
            }
        },

        /**
         * Entra in fullscreen
         */
        enter: function() {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
            State.isFullscreen = true;
            this.updateButton();
        },

        /**
         * Esci da fullscreen
         */
        exit: function() {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            State.isFullscreen = false;
            this.updateButton();
        },

        /**
         * Aggiorna bottone fullscreen
         */
        updateButton: function() {
            const btn = document.getElementById('fullscreen-btn');
            if (btn) {
                const icon = btn.querySelector('i');
                if (icon) {
                    if (State.isFullscreen) {
                        icon.className = 'fas fa-compress';
                    } else {
                        icon.className = 'fas fa-expand';
                    }
                }
            }
        },

        /**
         * Inizializza listener fullscreen
         */
        init: function() {
            // Listener per cambio stato fullscreen
            document.addEventListener('fullscreenchange', () => {
                State.isFullscreen = !!document.fullscreenElement;
                this.updateButton();
                Events.emit('fullscreen:change', State.isFullscreen);
            });

            // Listener per bottone fullscreen
            const btn = document.getElementById('fullscreen-btn');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.toggle();
                });
            }
        }
    };

    // ============================================
    // API CLIENT
    // ============================================

    const API = {
        /**
         * Richiesta API generica
         */
        request: async function(url, options = {}) {
            const defaultOptions = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin'
            };

            const finalOptions = { ...defaultOptions, ...options };
            
            if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
                finalOptions.body = JSON.stringify(options.body);
            }

            try {
                const response = await fetch(CONFIG.apiBaseUrl + url, finalOptions);
                
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                }
                
                return await response.text();

            } catch (error) {
                Utils.error('API request error:', error);
                throw error;
            }
        },

        /**
         * GET request
         */
        get: function(url) {
            return this.request(url, { method: 'GET' });
        },

        /**
         * POST request
         */
        post: function(url, data) {
            return this.request(url, {
                method: 'POST',
                body: data
            });
        },

        /**
         * PUT request
         */
        put: function(url, data) {
            return this.request(url, {
                method: 'PUT',
                body: data
            });
        },

        /**
         * DELETE request
         */
        delete: function(url) {
            return this.request(url, { method: 'DELETE' });
        }
    };

    // ============================================
    // INIZIALIZZAZIONE
    // ============================================

    const init = function() {
        Utils.log('Initializing TALON SPA...');

        // Check if page was refreshed on init
        const navigationEntries = performance.getEntriesByType('navigation');
        if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') {
            State.pageWasRefreshed = true;
            Utils.log('Page refresh detected on initialization, clearing cache');
            // Clear all caches on page refresh
            Cache.clear();
        }

        // Inizializza routing
        Router.interceptLinks();
        Router.interceptForms();
        window.addEventListener('popstate', Router.handlePopState);

        // Inizializza fullscreen
        Fullscreen.init();

        // Inizializza UI
        UI.reinitializeComponents();

        // Imposta route iniziale
        State.currentRoute = window.location.pathname;

        // Salva stato iniziale nella history
        window.history.replaceState(
            { path: window.location.pathname },
            document.title,
            window.location.href
        );

        // Emetti evento ready
        Events.emit('app:ready');

        Utils.log('TALON SPA initialized successfully');
    };

    // ============================================
    // API PUBBLICA
    // ============================================

    return {
        // Core
        init: init,
        navigate: Router.navigate.bind(Router),
        
        // API
        api: API,
        
        // UI
        showToast: UI.showToast.bind(UI),
        showLoader: UI.showLoader.bind(UI),
        hideLoader: UI.hideLoader.bind(UI),
        
        // Eventi
        on: Events.on.bind(Events),
        off: Events.off.bind(Events),
        emit: Events.emit.bind(Events),
        
        // Cache
        cache: Cache,
        
        // Fullscreen
        fullscreen: Fullscreen,
        
        // Stato (read-only)
        getState: function() {
            return { ...State };
        },
        
        // Utilità
        utils: Utils,
        
        // Config
        config: CONFIG
    };
})();

// ============================================
// AUTO-INIT AL DOM READY
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', TalonApp.init);
} else {
    TalonApp.init();
}

// Esponi globalmente
window.TalonApp = TalonApp;