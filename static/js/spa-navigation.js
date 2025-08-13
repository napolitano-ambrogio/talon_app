/**
 * ========================================
 * TALON SPA NAVIGATION SYSTEM - VERSIONE 2.0
 * File: static/js/spa-navigation.js
 * 
 * Versione: 2.0.0 - Enhanced SPA Integration
 * Funzionalità: Sistema di navigazione SPA completo con
 *               prefetch, cache avanzata, state management
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        // SPA Settings
        SPA: {
            ENABLED: true,
            DEBUG: true,  // Enable debug logs to debug dashboard_admin rendering issue
            PREFETCH: true,
            PREFETCH_DELAY: 200,
            CACHE_ENABLED: true,
            CACHE_TTL: 300000, // 5 minuti
            HISTORY_LIMIT: 50
        },
        
        // Navigation
        NAVIGATION: {
            SCROLL_RESTORATION: 'auto',
            SCROLL_TO_TOP: true,
            ANIMATION_DURATION: 300,
            LOADING_DELAY: 100
        },
        
        // Selectors
        SELECTORS: {
            mainContent: '.main-content',
            sidebar: '.sidebar',
            breadcrumb: '.breadcrumb',
            pageTitle: 'title',
            flashMessages: '#flashMessages, .flash-messages',
            activeLinks: 'a.active, .nav-link.active',
            navigationLinks: 'a:not([data-no-spa])',
            forms: 'form:not([data-no-spa])'
        },
        
        // Routes to exclude
        EXCLUDED_ROUTES: [
            '/logout',
            '/auth/logout',
            '/login',
            '/auth/login',
            '/download',
            '/export'
        ],
        
        // File extensions to skip
        SKIP_EXTENSIONS: [
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', 
            '.zip', '.rar', '.jpg', '.png', '.gif'
        ]
    };

    // ========================================
    // CLASSE TALON SPA
    // ========================================
    
    class TalonSPA {
        constructor() {
            // State
            this.state = {
                initialized: false,
                enabled: true,
                isNavigating: false,
                currentUrl: window.location.href,
                previousUrl: null,
                scrollPositions: new Map(),
                navigationHistory: [],
                prefetchCache: new Map(),
                pageWasRefreshed: false  // Track if page was refreshed
            };
            
            // Cache
            this.cache = new Map();
            this.cacheTimestamps = new Map();
            
            // Timers
            this.timers = new Set();
            this.prefetchTimers = new Map();
            
            // Event handlers
            this.eventHandlers = new Map();
            
            // Script tracking
            this.loadedScripts = new Set();
            this.scriptCallbacks = new Map();
            
            // Bind methods
            this.handleClick = this.handleClick.bind(this);
            this.handleSubmit = this.handleSubmit.bind(this);
            this.handlePopState = this.handlePopState.bind(this);
            this.handleLinkHover = this.handleLinkHover.bind(this);
        }

        // ========================================
        // INIZIALIZZAZIONE
        // ========================================
        
        init() {
            if (this.state.initialized) {
                this.log('warn', 'Already initialized');
                return;
            }
            
            if (!this.state.enabled) {
                this.log('info', 'SPA Navigation disabled');
                return;
            }
            
            this.log('info', '🚀 Initializing SPA Navigation v2.0...');
            
            // Check if page was refreshed on init
            const navigationEntries = performance.getEntriesByType('navigation');
            if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') {
                this.state.pageWasRefreshed = true;
                this.log('info', 'Page refresh detected on initialization');
                // Clear all caches on page refresh
                this.clearCache();
            }
            
            try {
                // Setup event handlers
                this.attachNavigationHandlers();
                this.setupPopState();
                
                // Setup prefetch se abilitato
                if (CONFIG.SPA.PREFETCH) {
                    this.setupPrefetch();
                }
                
                // Salva stato iniziale
                this.saveCurrentState();
                
                // Setup scroll restoration
                if ('scrollRestoration' in history) {
                    history.scrollRestoration = CONFIG.NAVIGATION.SCROLL_RESTORATION;
                }
                
                this.state.initialized = true;
                this.log('success', '✅ SPA Navigation initialized');
                
                // Emit evento ready
                this.emit('spa:ready');
                
            } catch (error) {
                this.log('error', 'Initialization failed:', error);
                this.state.enabled = false;
            }
        }

        // ========================================
        // EVENT HANDLERS
        // ========================================
        
        attachNavigationHandlers() {
            // Click handler con event delegation
            this.addEventHandler(document, 'click', this.handleClick);
            
            // Form submit handler
            this.addEventHandler(document, 'submit', this.handleSubmit);
            
            // Sidebar links special handling
            this.attachSidebarHandlers();
            
            this.log('debug', 'Navigation handlers attached');
        }

        attachSidebarHandlers() {
            const sidebarLinks = document.querySelectorAll('.sidebar a, nav.sidebar-nav a');
            
            sidebarLinks.forEach(link => {
                // Priorità alta per sidebar
                this.addEventHandler(link, 'click', (e) => {
                    // Only log dashboard_admin clicks
                    if (link.href.includes('dashboard_admin')) {
                        this.log('info', '🎯 [Sidebar] Navigating to dashboard_admin');
                    }
                    
                    if (this.shouldInterceptLink(link)) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const isDashboardAdmin = link.href.includes('dashboard_admin');
                        this.navigateWithTransition(link.href, {
                            source: 'sidebar',
                            element: link,
                            force: isDashboardAdmin, // Always force for dashboard
                            noCache: isDashboardAdmin // Always bypass cache for dashboard
                        });
                    }
                }, true); // useCapture per priorità
            });
            
            this.log('debug', `Attached handlers to ${sidebarLinks.length} sidebar links`);
        }

        handleClick(e) {
            // Skip se già gestito dalla sidebar
            if (e.defaultPrevented) return;
            
            const link = e.target.closest('a');
            if (!link) return;
            
            if (this.shouldInterceptLink(link)) {
                e.preventDefault();
                
                // Check for special attributes
                const forceReload = link.getAttribute('data-spa-force') === 'true';
                const noCache = link.getAttribute('data-spa-no-cache') === 'true';
                
                this.log('info', `[Click Handler] Navigating to: ${link.href}`, {
                    forceReload,
                    noCache,
                    isDashboardAdmin: link.href.includes('dashboard_admin')
                });
                
                this.navigateWithTransition(link.href, {
                    source: 'click',
                    element: link,
                    force: forceReload,
                    noCache: noCache
                });
            }
        }

        handleSubmit(e) {
            const form = e.target;
            
            if (this.shouldInterceptForm(form)) {
                e.preventDefault();
                this.submitFormSPA(form);
            }
        }

        handlePopState(e) {
            if (e.state && e.state.url) {
                this.log('debug', 'Browser navigation to:', e.state.url);
                
                // Recupera scroll position salvata
                const scrollPos = this.state.scrollPositions.get(e.state.url);
                
                this.navigateWithTransition(e.state.url, {
                    source: 'popstate',
                    pushState: false,
                    scrollPosition: scrollPos
                });
            }
        }

        handleLinkHover(e) {
            // Fix: usa jQuery invece di closest() nativo per compatibilità
            const link = $(e.target).closest('a')[0];
            if (!link || !this.shouldInterceptLink(link)) return;
            
            // Clear existing timer for this link
            const existingTimer = this.prefetchTimers.get(link.href);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }
            
            // Set new prefetch timer
            const timer = setTimeout(() => {
                this.prefetchUrl(link.href);
                this.prefetchTimers.delete(link.href);
            }, CONFIG.SPA.PREFETCH_DELAY);
            
            this.prefetchTimers.set(link.href, timer);
        }

        // ========================================
        // NAVIGATION LOGIC
        // ========================================
        
        shouldInterceptLink(link) {
            // Basic checks
            if (!link || !link.href) return false;
            
            // Check attributes
            if (link.hasAttribute('data-no-spa')) return false;
            if (link.hasAttribute('data-spa-ignore')) return false;
            if (link.hasAttribute('download')) return false;
            if (link.hasAttribute('data-toggle') || link.hasAttribute('data-bs-toggle')) return false;
            
            // Check target
            if (link.target && link.target !== '_self') return false;
            
            // Parse URL
            try {
                const url = new URL(link.href, window.location.origin);
                
                // Check hostname
                if (url.hostname !== window.location.hostname) return false;
                
                // Check protocol
                if (!['http:', 'https:'].includes(url.protocol)) return false;
                
                // Check excluded routes
                if (CONFIG.EXCLUDED_ROUTES.some(route => url.pathname.includes(route))) {
                    return false;
                }
                
                // Check file extensions
                if (CONFIG.SKIP_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
                    return false;
                }
                
                // Skip same-page anchors
                if (url.pathname === window.location.pathname && url.hash) {
                    return false;
                }
                
            } catch (e) {
                return false;
            }
            
            return true;
        }

        shouldInterceptForm(form) {
            // Basic checks
            if (!form) return false;
            if (form.hasAttribute('data-no-spa')) return false;
            if (form.hasAttribute('data-spa-ignore')) return false;
            
            // Check for file uploads
            if (form.querySelector('input[type="file"]')) return false;
            
            // Only intercept GET forms for now
            const method = (form.method || 'GET').toUpperCase();
            return method === 'GET';
        }

        // ========================================
        // NAVIGATION EXECUTION
        // ========================================
        
        async navigateWithTransition(url, options = {}) {
            // Normalize options
            options = {
                source: 'navigation',
                pushState: true,
                scrollPosition: null,
                element: null,
                ...options
            };
            
            const isDashboardAdmin = url.includes('dashboard_admin');
            
            // Only log dashboard_admin navigations
            if (isDashboardAdmin) {
                this.log('info', `[Navigation] Starting dashboard_admin navigation`);
            }
            
            // Check if already navigating
            if (this.state.isNavigating) {
                this.log('debug', 'Navigation already in progress, queuing...');
                // Queue navigation
                setTimeout(() => this.navigateWithTransition(url, options), 100);
                return;
            }
            
            // SPECIAL CASE: Always force reload for dashboard_admin
            if (isDashboardAdmin) {
                this.log('info', '🔄 Dashboard_admin: forcing full reload');
                options.force = true;
                options.noCache = true;
                // Clear ALL caches for dashboard
                this.clearCache();
            }
            
            // Check if same URL - but always force if page was refreshed or noCache
            if (url === this.state.currentUrl && !options.force && !this.state.pageWasRefreshed && !options.noCache) {
                this.log('debug', 'Same URL detected, but reinitializing page components...');
                // Instead of skipping completely, reinitialize page components
                try {
                    await this.reinitializeComponents(url);
                    this.log('debug', 'Page components reinitialized for same URL');
                } catch (error) {
                    this.log('error', 'Error reinitializing components:', error);
                }
                return;
            }
            
            // Force navigation if page was refreshed, even for same URL
            if (this.state.pageWasRefreshed) {
                this.log('debug', 'Page was refreshed, forcing navigation even for same URL');
                options.force = true;
            }
            
            this.state.isNavigating = true;
            this.state.previousUrl = this.state.currentUrl;
            
            this.log('info', `Navigating to: ${url} (source: ${options.source})`);
            
            // Emit pre-navigation event
            this.emit('spa:navigation-start', { url, options });
            
            try {
                // Save current scroll position
                this.saveScrollPosition();
                
                // Cleanup before navigation
                await this.cleanupBeforeNavigation();
                
                // Show loading
                this.showLoading();
                
                // Get content (from cache or fetch)
                const content = await this.getContent(url, options);
                
                if (!content) {
                    throw new Error('Failed to get content');
                }
                
                // Handle redirect
                if (content.redirect) {
                    this.log('info', `Redirecting to: ${content.redirect}`);
                    window.location.href = content.redirect;
                    return;
                }
                
                // Update page
                this.log('info', '🔄 [Navigation] About to update page with content:', {
                    hasContent: !!content,
                    isHtml: content.isHtml,
                    hasHtmlProperty: !!content.html,
                    hasContentProperty: !!content.content,
                    contentLength: (content.html?.length || content.content?.length || 0)
                });
                
                await this.updatePage(content, url, options);
                
                this.log('info', '✅ [Navigation] Page update completed');
                
                // Update state
                this.state.currentUrl = url;
                
                // Add to history
                this.addToHistory(url);
                
                // Handle scroll
                this.handleScrollRestoration(options);
                
                // Emit completion event
                this.emit('spa:navigation-complete', { url, options });
                
                this.log('success', '✅ Navigation completed');
                
                // Reset page refresh flag after first successful navigation
                if (this.state.pageWasRefreshed) {
                    this.log('debug', 'Resetting page refresh flag after successful navigation');
                    this.state.pageWasRefreshed = false;
                }
                
            } catch (error) {
                this.log('error', 'Navigation failed:', error);
                this.handleNavigationError(error, url);
                
            } finally {
                this.state.isNavigating = false;
                this.hideLoading();
            }
        }

        async getContent(url, options = {}) {
            const isDashboardAdmin = url.includes('dashboard_admin');
            
            this.log('info', `[Get Content] URL: ${url}`, {
                isDashboardAdmin,
                noCache: options.noCache,
                force: options.force,
                pageWasRefreshed: this.state.pageWasRefreshed,
                cacheSize: this.cache.size
            });
            
            // If noCache option is set or page was refreshed, bypass cache
            if (options.noCache || this.state.pageWasRefreshed || isDashboardAdmin) {
                this.log('warn', `[Get Content] BYPASSING CACHE for ${url}`);
                this.cache.delete(url);
                this.cacheTimestamps.delete(url);
                this.state.prefetchCache.delete(url);
                // Don't use cache for this request
                const content = await this.fetchPage(url);
                this.log('info', `[Get Content] Fresh content fetched for ${url}`);
                return content;
            }
            
            // Check cache first (normal navigation)
            if (CONFIG.SPA.CACHE_ENABLED) {
                const cached = this.getFromCache(url);
                if (cached) {
                    this.log('debug', 'Using cached content');
                    return cached;
                }
            }
            
            // Check prefetch cache
            if (this.state.prefetchCache.has(url)) {
                const prefetched = this.state.prefetchCache.get(url);
                this.state.prefetchCache.delete(url);
                this.log('debug', 'Using prefetched content');
                return prefetched;
            }
            
            // Fetch new content
            this.log('info', `[Get Content] Fetching fresh content for ${url}`);
            return await this.fetchPage(url);
        }

        async fetchPage(url) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-SPA-Request': 'true',
                        'Accept': 'text/html, application/json'
                    },
                    credentials: 'same-origin'
                });
                
                // Handle redirects
                if (response.redirected) {
                    return { redirect: response.url };
                }
                
                // Handle errors
                if (!response.ok) {
                    if (response.status === 401) {
                        // Unauthorized - redirect to login
                        return { redirect: '/login?next=' + encodeURIComponent(url) };
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Parse response
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    const html = await response.text();
                    data = this.parseHTMLResponse(html);
                }
                
                // Cache if enabled
                if (CONFIG.SPA.CACHE_ENABLED && data.success !== false) {
                    this.addToCache(url, data);
                }
                
                return data;
                
            } catch (error) {
                this.log('error', 'Fetch failed:', error);
                throw error;
            }
        }

        parseHTMLResponse(html) {
            this.log('warn', '🔍 [Parse HTML] Parsing HTML response, length:', html.length);
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract components
            const mainContent = doc.querySelector(CONFIG.SELECTORS.mainContent);
            const breadcrumb = doc.querySelector(CONFIG.SELECTORS.breadcrumb);
            const title = doc.querySelector('title');
            const flashMessages = doc.querySelector(CONFIG.SELECTORS.flashMessages);
            
            this.log('warn', '🔍 [Parse HTML] Parsed components:', {
                selector: CONFIG.SELECTORS.mainContent,
                hasMainContent: !!mainContent,
                mainContentLength: mainContent?.innerHTML?.length || 0,
                mainContentPreview: mainContent?.innerHTML?.substring(0, 100) + '...',
                hasBreadcrumb: !!breadcrumb,
                hasTitle: !!title,
                titleText: title?.textContent,
                hasFlashMessages: !!flashMessages,
                isDashboardContent: !!mainContent?.innerHTML?.includes('dashboard-container')
            });
            
            // Extract scripts
            const scripts = [];
            if (mainContent) {
                mainContent.querySelectorAll('script').forEach(script => {
                    scripts.push({
                        src: script.src,
                        content: script.innerHTML,
                        type: script.type || 'text/javascript',
                        async: script.async,
                        defer: script.defer
                    });
                });
            }
            
            return {
                success: true,
                html: mainContent?.innerHTML,
                breadcrumb: breadcrumb?.innerHTML,
                title: title?.textContent,
                flashMessages: flashMessages?.outerHTML,
                scripts: scripts,
                isHtml: true
            };
        }

        async updatePage(content, url, options) {
            this.log('warn', '🎯 [Update Page] Starting page update for:', url);
            
            // Start transition
            await this.transitionOut();
            
            // Update content
            if (content.isHtml) {
                this.log('info', '[Update Page] Using HTML content update');
                this.updateHTMLContent(content);
            } else {
                this.log('info', '[Update Page] Using JSON content update');
                this.updateJSONContent(content);
            }
            
            // Update URL
            if (options.pushState) {
                window.history.pushState(
                    { url: url, timestamp: Date.now() },
                    content.title || '',
                    url
                );
            }
            
            // Update title
            if (content.title) {
                document.title = content.title;
            }
            
            // Handle flash messages
            if (content.flashMessages) {
                this.displayFlashMessages(content.flashMessages);
            } else if (content.flash_messages && Array.isArray(content.flash_messages)) {
                this.displayFlashMessagesArray(content.flash_messages);
            }
            
            // Load additional CSS files (for page-specific styles like dashboard_admin.css)
            if (content.additional_css && content.additional_css.length > 0) {
                await this.loadPageSpecificCSS(content.additional_css);
            }
            
            // Load additional JS files (for Chart.js, DataTables, etc.)
            if (content.additional_js && content.additional_js.length > 0) {
                await this.loadPageSpecificJS(content.additional_js);
            }
            
            // Load scripts
            if (content.scripts && content.scripts.length > 0) {
                await this.loadScripts(content.scripts);
            }
            
            // Transition in
            await this.transitionIn();
            
            // Fallback: ensure content is visible (in case transitions fail)
            setTimeout(() => {
                const mainContent = document.querySelector(CONFIG.SELECTORS.mainContent);
                if (mainContent) {
                    const currentOpacity = window.getComputedStyle(mainContent).opacity;
                    this.log('debug', '[Page Update] Post-transition opacity check:', currentOpacity);
                    
                    if (currentOpacity === '0' || currentOpacity === '') {
                        this.log('warn', '[Page Update] Content still hidden after transition, forcing visibility');
                        mainContent.style.opacity = '1';
                        mainContent.style.display = 'block';
                        mainContent.style.visibility = 'visible';
                        mainContent.style.transition = '';
                    }
                }
            }, CONFIG.NAVIGATION.ANIMATION_DURATION + 100);
            
            // Reinitialize components
            await this.reinitializeComponents(url);
            
            // Update active states
            this.updateActiveStates(url);
        }

        updateHTMLContent(content) {
            const mainContent = document.querySelector(CONFIG.SELECTORS.mainContent);
            const breadcrumb = document.querySelector(CONFIG.SELECTORS.breadcrumb);
            
            this.log('warn', '📝 [Update HTML] Starting content update:', {
                selector: CONFIG.SELECTORS.mainContent,
                hasMainContent: !!mainContent,
                mainContentElement: mainContent,
                currentMainContentHTML: mainContent?.innerHTML?.substring(0, 100) + '...',
                hasContentHtml: !!content.html,
                contentLength: content.html?.length || 0,
                hasBreadcrumb: !!breadcrumb,
                hasBreadcrumbContent: !!content.breadcrumb,
                newContentPreview: content.html?.substring(0, 100) + '...',
                allPossibleMainElements: document.querySelectorAll('main, .main, .main-content, [role="main"]')
            });
            
            if (mainContent && content.html) {
                this.log('info', '📝 [Update HTML] Updating main content...');
                
                // Clear existing content first
                mainContent.innerHTML = '';
                
                // Force a reflow to ensure DOM update
                void mainContent.offsetHeight;
                
                // Set new content
                mainContent.innerHTML = content.html;
                
                this.log('success', '✅ [Update HTML] Main content updated:', {
                    newLength: mainContent.innerHTML.length,
                    hasChart: !!mainContent.querySelector('#activityChart'),
                    hasCounters: !!mainContent.querySelector('.counter'),
                    isDashboardAdmin: !!mainContent.querySelector('.dashboard-container')
                });
            } else {
                if (!mainContent) {
                    this.log('error', '❌ [Update HTML] Main content element not found! Selector:', CONFIG.SELECTORS.mainContent);
                    // Try alternatives in order of preference
                    const alternatives = ['#main-content', 'main', '.main', '[role="main"]', 'body'];
                    
                    for (const selector of alternatives) {
                        const element = document.querySelector(selector);
                        if (element) {
                            this.log('warn', `Found alternative element with selector: ${selector}, using that instead`);
                            element.innerHTML = content.html || '';
                            break;
                        }
                    }
                }
                if (!content.html) {
                    this.log('error', '❌ [Update HTML] No HTML content to update!');
                }
            }
            
            if (breadcrumb && content.breadcrumb) {
                breadcrumb.innerHTML = content.breadcrumb;
                this.log('debug', 'Breadcrumb updated');
            }
        }

        updateJSONContent(content) {
            const mainContent = document.querySelector(CONFIG.SELECTORS.mainContent);
            const breadcrumb = document.querySelector(CONFIG.SELECTORS.breadcrumb);
            
            this.log('debug', '[Update JSON Content] Updating content:', {
                hasMainContent: !!mainContent,
                hasContent: !!content.content,
                contentLength: content.content?.length || 0,
                breadcrumbExists: !!breadcrumb
            });
            
            if (mainContent && content.content) {
                mainContent.innerHTML = content.content;
                
                // Ensure content is visible after update
                mainContent.style.display = 'block';
                mainContent.style.visibility = 'visible';
                
                // Force layout recalculation
                mainContent.offsetHeight;
                
                this.log('debug', '[Update JSON Content] Content updated, element styles:', {
                    display: mainContent.style.display,
                    visibility: mainContent.style.visibility,
                    opacity: mainContent.style.opacity,
                    offsetHeight: mainContent.offsetHeight,
                    scrollHeight: mainContent.scrollHeight
                });
            } else {
                this.log('warn', '[Update JSON Content] Failed to update content - missing elements or content');
            }
            
            if (breadcrumb && content.breadcrumb) {
                breadcrumb.innerHTML = content.breadcrumb;
            }
        }

        // ========================================
        // FORM HANDLING
        // ========================================
        
        async submitFormSPA(form) {
            const formData = new FormData(form);
            const params = new URLSearchParams(formData);
            const method = (form.method || 'GET').toUpperCase();
            const action = form.action || window.location.href;
            
            this.log('debug', `Submitting form via SPA: ${method} ${action}`);
            
            try {
                this.showLoading();
                
                let url = action;
                let options = {
                    method: method,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-SPA-Request': 'true'
                    },
                    credentials: 'same-origin'
                };
                
                if (method === 'GET') {
                    url = `${action}?${params.toString()}`;
                } else {
                    options.body = formData;
                }
                
                const response = await fetch(url, options);
                
                if (response.redirected) {
                    this.navigateWithTransition(response.url);
                    return;
                }
                
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    
                    if (data.redirect) {
                        this.navigateWithTransition(data.redirect);
                    } else if (data.success) {
                        // Show success message
                        if (data.message) {
                            this.showNotification(data.message, 'success');
                        }
                        
                        // Reload current page if needed
                        if (data.reload !== false) {
                            this.navigateWithTransition(window.location.href, { force: true });
                        }
                    } else {
                        // Show error
                        this.showNotification(data.error || 'Errore durante l\'operazione', 'error');
                    }
                } else {
                    // HTML response - navigate to it
                    const html = await response.text();
                    const content = this.parseHTMLResponse(html);
                    await this.updatePage(content, url, { pushState: true });
                }
                
            } catch (error) {
                this.log('error', 'Form submission failed:', error);
                this.showNotification('Errore durante l\'invio del form', 'error');
            } finally {
                this.hideLoading();
            }
        }

        // ========================================
        // PREFETCHING
        // ========================================
        
        setupPrefetch() {
            if (!CONFIG.SPA.PREFETCH) return;
            
            // Hover prefetch
            this.addEventHandler(document, 'mouseenter', this.handleLinkHover, true);
            
            // Touch prefetch
            this.addEventHandler(document, 'touchstart', (e) => {
                const link = e.target.closest('a');
                if (link && this.shouldInterceptLink(link)) {
                    this.prefetchUrl(link.href);
                }
            }, { passive: true });
            
            this.log('debug', 'Prefetch enabled');
        }

        async prefetchUrl(url) {
            // Skip if already cached or prefetched
            if (this.cache.has(url) || this.state.prefetchCache.has(url)) {
                return;
            }
            
            // Skip if currently navigating to this URL
            if (this.state.isNavigating && url === this.state.currentUrl) {
                return;
            }
            
            this.log('debug', `Prefetching: ${url}`);
            
            try {
                const content = await this.fetchPage(url);
                if (content && !content.redirect) {
                    this.state.prefetchCache.set(url, content);
                    
                    // Auto-clear after timeout
                    setTimeout(() => {
                        this.state.prefetchCache.delete(url);
                    }, CONFIG.SPA.CACHE_TTL);
                }
            } catch (error) {
                this.log('debug', 'Prefetch failed:', error);
            }
        }

        // ========================================
        // CACHE MANAGEMENT
        // ========================================
        
        addToCache(url, content) {
            if (!CONFIG.SPA.CACHE_ENABLED) return;
            
            this.cache.set(url, content);
            this.cacheTimestamps.set(url, Date.now());
            
            // Limit cache size
            if (this.cache.size > 50) {
                const oldestUrl = this.getOldestCacheEntry();
                if (oldestUrl) {
                    this.cache.delete(oldestUrl);
                    this.cacheTimestamps.delete(oldestUrl);
                }
            }
            
            this.log('debug', `Added to cache: ${url}`);
        }

        getFromCache(url) {
            if (!CONFIG.SPA.CACHE_ENABLED) return null;
            
            const cached = this.cache.get(url);
            if (!cached) return null;
            
            const timestamp = this.cacheTimestamps.get(url);
            const age = Date.now() - timestamp;
            
            if (age > CONFIG.SPA.CACHE_TTL) {
                this.cache.delete(url);
                this.cacheTimestamps.delete(url);
                return null;
            }
            
            return cached;
        }

        getOldestCacheEntry() {
            let oldestUrl = null;
            let oldestTime = Date.now();
            
            this.cacheTimestamps.forEach((time, url) => {
                if (time < oldestTime) {
                    oldestTime = time;
                    oldestUrl = url;
                }
            });
            
            return oldestUrl;
        }

        clearCache() {
            this.cache.clear();
            this.cacheTimestamps.clear();
            this.state.prefetchCache.clear();
            this.log('info', 'Cache cleared');
        }

        // ========================================
        // CLEANUP
        // ========================================
        
        async cleanupBeforeNavigation() {
            this.log('debug', 'Cleaning up before navigation...');
            
            // Emit cleanup event
            this.emit('spa:cleanup');
            
            // Clear prefetch timers
            this.prefetchTimers.forEach(timer => clearTimeout(timer));
            this.prefetchTimers.clear();
            
            // Clean up page-specific CSS
            this.cleanupPageSpecificCSS();
            
            // Clean up page-specific JS
            this.cleanupPageSpecificJS();
            
            // Destroy DataTables
            if (window.jQuery && $.fn.DataTable) {
                try {
                    $.fn.DataTable.tables({ api: true }).destroy();
                } catch (e) {
                    this.log('debug', 'DataTable cleanup error:', e);
                }
            }
            
            // Destroy Chart.js instances
            if (window.Chart) {
                for (let key in Chart.instances) {
                    try {
                        Chart.instances[key].destroy();
                    } catch (e) {
                        this.log('debug', 'Chart cleanup error:', e);
                    }
                }
            }
            
            // Clear intervals
            this.clearAllTimers();
            
            // Remove tooltips/popovers
            this.cleanupBootstrapComponents();
        }
        
        cleanupPageSpecificCSS() {
            this.log('debug', '[CSS Cleanup] Removing page-specific CSS...');
            
            // Remove SPA-loaded CSS files
            const spaLoadedCSS = document.querySelectorAll('link[data-spa-css="true"]');
            spaLoadedCSS.forEach(link => {
                this.log('debug', '[CSS Cleanup] Removing SPA CSS:', link.href);
                link.remove();
            });
            
            // Also remove known page-specific CSS files (fallback)
            const pageSpecificCSS = [
                'dashboard_admin.css',
                'enti_militari.css', 
                'enti_civili.css',
                'operazioni.css',
                'attivita.css'
            ];
            
            pageSpecificCSS.forEach(cssFile => {
                const links = document.querySelectorAll(`link[href*="${cssFile}"]`);
                links.forEach(link => {
                    if (!link.hasAttribute('data-spa-css')) { // Don't double-remove
                        this.log('debug', '[CSS Cleanup] Removing fallback CSS:', link.href);
                        link.remove();
                    }
                });
            });
        }
        
        cleanupPageSpecificJS() {
            this.log('debug', '[JS Cleanup] Removing page-specific JavaScript...');
            
            // Remove SPA-loaded JS files
            const spaLoadedJS = document.querySelectorAll('script[data-spa-js="true"]');
            spaLoadedJS.forEach(script => {
                this.log('debug', '[JS Cleanup] Removing SPA JavaScript:', script.src);
                script.remove();
            });
            
            // Clear Chart.js global if it was loaded dynamically
            if (window.Chart && document.querySelector('script[src*="chart.js"][data-spa-js="true"]')) {
                try {
                    // Destroy all chart instances
                    Object.keys(Chart.instances || {}).forEach(key => {
                        if (Chart.instances[key]) {
                            Chart.instances[key].destroy();
                        }
                    });
                    this.log('debug', '[JS Cleanup] Chart.js instances cleaned up');
                } catch (e) {
                    this.log('debug', '[JS Cleanup] Error cleaning Chart.js:', e);
                }
            }
        }

        cleanupBootstrapComponents() {
            if (!window.bootstrap) return;
            
            // Remove tooltips
            document.querySelectorAll('.tooltip').forEach(el => el.remove());
            
            // Remove popovers
            document.querySelectorAll('.popover').forEach(el => el.remove());
            
            // Dispose tooltip instances
            document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                const instance = bootstrap.Tooltip.getInstance(el);
                if (instance) instance.dispose();
            });
            
            // Dispose popover instances
            document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
                const instance = bootstrap.Popover.getInstance(el);
                if (instance) instance.dispose();
            });
        }

        // ========================================
        // REINITIALIZATION
        // ========================================
        
        async reinitializeComponents(url) {
            this.log('debug', 'Reinitializing components...');
            
            const path = new URL(url, window.location.origin).pathname;
            
            // Emit event for other modules
            this.emit('spa:content-loaded', { url: path });
            
            // Page-specific initialization
            await this.initializePageSpecific(path);
            
            // Global components
            this.initializeGlobalComponents();
            
            // Emit page-specific events after initialization
            if (path.includes('/dashboard_admin')) {
                this.emit('spa:dashboard-admin-ready');
            }
        }

        async initializePageSpecific(path) {
            this.log('debug', 'Initializing page-specific components for path:', path);
            
            // Dashboard
            if (path.includes('/dashboard') && !path.includes('admin')) {
                this.log('debug', 'Initializing main dashboard...');
                await this.initializeMainDashboard();
            } else if (path.includes('/dashboard_admin')) {
                this.log('debug', 'Initializing admin dashboard...');
                await this.initializeDashboardAdmin();
            }
            
            // Admin pages (impostazioni)
            else if (path.includes('/impostazioni')) {
                this.log('debug', 'Initializing admin settings page...');
                await this.initializeAdminPages();
            }
            
            // Attività
            else if (path.includes('/attivita')) {
                this.log('debug', 'Initializing attività...');
                await this.initializeAttivita();
            }
            
            // Enti
            else if (path.includes('/enti_militari')) {
                this.log('debug', 'Initializing enti militari...');
                await this.initializeEntiMilitari();
            } else if (path.includes('/enti_civili')) {
                this.log('debug', 'Initializing enti civili...');
                await this.initializeEntiCivili();
            }
            
            // Operazioni
            else if (path.includes('/operazioni')) {
                this.log('debug', 'Initializing operazioni...');
                await this.initializeOperazioni();
            }
            
            // Admin (generic admin pages)
            else if (path.includes('/admin')) {
                this.log('debug', 'Initializing generic admin...');
                await this.initializeAdmin();
            }
            
            this.log('debug', 'Page-specific initialization completed for path:', path);
        }

        initializeGlobalComponents() {
            // Bootstrap components
            if (window.bootstrap) {
                // Tooltips
                document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                    new bootstrap.Tooltip(el);
                });
                
                // Popovers
                document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
                    new bootstrap.Popover(el);
                });
            }
            
            // Searchable selects
            if (window.TalonSearchableSelect) {
                window.TalonSearchableSelect.refresh();
            }
            
            // Forms
            if (window.TalonAttivitaForms) {
                window.TalonAttivitaForms.initialize();
            }
        }

        async initializeMainDashboard() {
            this.log('debug', 'Initializing main dashboard...');
            
            // Call dashboard specific init
            if (typeof window.initDashboard === 'function') {
                await window.initDashboard();
            }
        }

        async initializeDashboardAdmin() {
            this.log('warn', '🎯 [Dashboard Admin Init] Starting SPA initialization...');
            
            // Check if already initializing or initialized to prevent multiple calls
            if (window.TalonDashboardAdmin && 
                (window.TalonDashboardAdmin._spaInitializing || 
                 window.TalonDashboardAdmin._spaInitialized)) {
                this.log('info', '✅ [Dashboard Admin Init] Already initializing/initialized, skipping');
                return;
            }
            
            // Check if the script is loaded
            if (!window.TalonDashboardAdmin) {
                this.log('error', '❌ [Dashboard Admin Init] TalonDashboardAdmin NOT FOUND!');
                this.log('info', 'Available global objects:', Object.keys(window).filter(k => k.includes('Talon')));
                
                // Try to reload the script
                this.log('warn', 'Attempting to reload dashboard_admin.js...');
                const script = document.createElement('script');
                script.src = '/static/js/dashboard_admin.js';
                script.onload = () => {
                    this.log('info', 'dashboard_admin.js reloaded, retrying initialization...');
                    if (window.TalonDashboardAdmin) {
                        window.TalonDashboardAdmin._spaInitializing = true;
                        window.TalonDashboardAdmin.initialize();
                    }
                };
                document.head.appendChild(script);
                return;
            }
            
            this.log('info', '✅ [Dashboard Admin Init] TalonDashboardAdmin found, calling initialize...');
            try {
                // Mark as initializing to prevent multiple calls
                window.TalonDashboardAdmin._spaInitializing = true;
                
                await new Promise((resolve) => {
                    window.TalonDashboardAdmin.initialize();
                    
                    // Wait for initialization to complete
                    const checkInitialized = () => {
                        // Check if DOM elements are present and chart is initialized
                        const hasChart = !!document.querySelector('#activityChart');
                        const hasCounters = !!document.querySelector('.counter');
                        const container = !!document.querySelector('.dashboard-container');
                        const mainContent = document.querySelector('.main-content');
                        
                        // Check CSS loading status
                        const dashboardContainer = document.querySelector('.dashboard-container');
                        const hasCSS = dashboardContainer ? 
                            window.getComputedStyle(dashboardContainer).background !== 'rgba(0, 0, 0, 0)' : false;
                        
                        // Check if Chart.js is available
                        const hasChartJS = typeof Chart !== 'undefined';
                        
                        this.log('debug', '[Dashboard Admin Init] Checking elements:', {
                            hasChart,
                            hasCounters, 
                            container,
                            hasCSS,
                            hasChartJS,
                            mainContentVisible: mainContent ? window.getComputedStyle(mainContent).opacity : 'N/A',
                            mainContentDisplay: mainContent ? window.getComputedStyle(mainContent).display : 'N/A',
                            containerBackground: dashboardContainer ? window.getComputedStyle(dashboardContainer).background : 'N/A'
                        });
                        
                        if (hasChart && hasCounters && container && hasCSS && hasChartJS) {
                            // Also ensure main content is visible
                            if (mainContent) {
                                mainContent.style.opacity = '1';
                                mainContent.style.display = 'block';
                                mainContent.style.visibility = 'visible';
                            }
                            
                            window.TalonDashboardAdmin._spaInitialized = true;
                            window.TalonDashboardAdmin._spaInitializing = false;
                            this.log('success', '✅ [Dashboard Admin Init] Initialization completed successfully with CSS and Chart.js');
                            
                            // Add fallback counter trigger after a short delay
                            setTimeout(() => {
                                if (window.TalonDashboardAdmin && window.TalonDashboardAdmin.retriggerCounters) {
                                    this.log('debug', '[Dashboard Admin Init] Fallback: Retriggering counters...');
                                    window.TalonDashboardAdmin.retriggerCounters();
                                }
                            }, 500);
                            
                            resolve();
                        } else {
                            // Keep checking for up to 8 seconds (increased timeout)
                            if (Date.now() - startTime < 8000) {
                                setTimeout(checkInitialized, 200);
                            } else {
                                this.log('warn', '⚠️ [Dashboard Admin Init] Initialization timeout, forcing visibility and proceeding');
                                
                                // Force visibility
                                if (mainContent) {
                                    mainContent.style.opacity = '1';
                                    mainContent.style.display = 'block';
                                    mainContent.style.visibility = 'visible';
                                    mainContent.style.transition = '';
                                }
                                
                                window.TalonDashboardAdmin._spaInitialized = true;
                                window.TalonDashboardAdmin._spaInitializing = false;
                                resolve();
                            }
                        }
                    };
                    
                    const startTime = Date.now();
                    setTimeout(checkInitialized, 300); // Initial delay
                });
                
            } catch (error) {
                this.log('error', '❌ [Dashboard Admin Init] Error initializing TalonDashboardAdmin:', error);
                window.TalonDashboardAdmin._spaInitializing = false;
            }
        }

        async initializeAttivita() {
            this.log('debug', 'Initializing attività...');
            
            if (window.TalonListaAttivita) {
                window.TalonListaAttivita.initialize();
            }
            
            if (window.TalonInserimentoAttivita) {
                window.TalonInserimentoAttivita.initialize();
            }
            
            if (window.TalonModificaAttivita) {
                window.TalonModificaAttivita.initialize();
            }
        }

        async initializeEntiMilitari() {
            this.log('debug', 'Initializing enti militari...');
            
            if (window.TalonOrganigramma) {
                window.TalonOrganigramma.init();
            }
        }

        async initializeEntiCivili() {
            this.log('debug', 'Initializing enti civili...');
            
            // DataTable initialization if needed
            this.initializeDataTables();
        }

        async initializeOperazioni() {
            this.log('debug', 'Initializing operazioni...');
            
            this.initializeDataTables();
        }

        async initializeAdminPages() {
            this.log('debug', 'Initializing admin pages (impostazioni)...');
            
            // Initialize common admin page components
            // Bootstrap components
            this.initializeGlobalComponents();
            
            // Tables if present
            if (document.querySelector('table')) {
                this.log('debug', 'Initializing table components...');
            }
            
            // Charts if present (for system info page)
            if (document.querySelector('canvas')) {
                this.log('debug', 'Found canvas elements, initializing charts...');
            }
            
            // Admin-specific functionality
            this.log('debug', 'Admin pages initialization completed');
        }

        async initializeAdmin() {
            this.log('debug', 'Initializing admin...');
            
            // Admin specific components
        }

        initializeDataTables() {
            if (!window.jQuery || !$.fn.DataTable) return;
            
            $('.datatable, table.table').each(function() {
                if (!$.fn.DataTable.isDataTable(this)) {
                    $(this).DataTable({
                        language: {
                            url: '//cdn.datatables.net/plug-ins/1.10.24/i18n/Italian.json'
                        },
                        responsive: true,
                        pageLength: 25
                    });
                }
            });
        }

        // ========================================
        // CSS LOADING
        // ========================================
        
        async loadPageSpecificCSS(cssUrls) {
            this.log('debug', '[CSS Loading] Loading page-specific CSS:', cssUrls);
            
            const promises = cssUrls.map(url => this.loadCSSFile(url));
            await Promise.all(promises);
            
            this.log('info', '[CSS Loading] All page-specific CSS loaded successfully');
        }
        
        loadCSSFile(url) {
            return new Promise((resolve, reject) => {
                // Extract base URL without cache buster for comparison
                const baseUrl = url.split('?')[0];
                
                // Check if CSS is already loaded (ignoring cache buster)
                const existingLink = document.querySelector(`link[href*="${baseUrl.split('/').pop()}"]`);
                if (existingLink) {
                    this.log('debug', '[CSS Loading] CSS already loaded:', url);
                    resolve();
                    return;
                }
                
                // Create and load CSS link
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                link.setAttribute('data-spa-css', 'true'); // Mark as SPA-loaded CSS
                
                link.onload = () => {
                    this.log('debug', '[CSS Loading] CSS loaded successfully:', url);
                    // Force style recalculation
                    document.body.offsetHeight;
                    resolve();
                };
                link.onerror = () => {
                    this.log('error', '[CSS Loading] Failed to load CSS:', url);
                    reject(new Error(`Failed to load CSS: ${url}`));
                };
                
                document.head.appendChild(link);
            });
        }

        // ========================================
        // JAVASCRIPT LOADING
        // ========================================
        
        async loadPageSpecificJS(jsUrls) {
            this.log('debug', '[JS Loading] Loading page-specific JavaScript:', jsUrls);
            
            const promises = jsUrls.map(url => this.loadJSFile(url));
            await Promise.all(promises);
            
            this.log('info', '[JS Loading] All page-specific JavaScript loaded successfully');
        }
        
        loadJSFile(url) {
            return new Promise((resolve, reject) => {
                // Extract base URL without cache buster for comparison
                const baseUrl = url.split('?')[0];
                
                // Check if JS is already loaded (ignoring cache buster)
                const existingScript = document.querySelector(`script[src*="${baseUrl.split('/').pop()}"]`);
                if (existingScript) {
                    this.log('debug', '[JS Loading] JavaScript already loaded:', url);
                    resolve();
                    return;
                }
                
                // Create and load script
                const script = document.createElement('script');
                script.src = url;
                script.setAttribute('data-spa-js', 'true'); // Mark as SPA-loaded JS
                
                script.onload = () => {
                    this.log('debug', '[JS Loading] JavaScript loaded successfully:', url);
                    
                    // Special handling for Chart.js
                    if (url.includes('chart.js') || url.includes('chartjs')) {
                        // Wait a bit for Chart.js to be fully initialized
                        setTimeout(() => {
                            if (typeof Chart !== 'undefined') {
                                this.log('info', '[JS Loading] Chart.js is now available globally');
                            }
                        }, 100);
                    }
                    
                    resolve();
                };
                script.onerror = () => {
                    this.log('error', '[JS Loading] Failed to load JavaScript:', url);
                    reject(new Error(`Failed to load JavaScript: ${url}`));
                };
                
                document.head.appendChild(script);
            });
        }

        // ========================================
        // SCRIPT LOADING
        // ========================================
        
        async loadScripts(scripts) {
            for (const script of scripts) {
                if (script.src) {
                    // External script
                    if (!this.loadedScripts.has(script.src)) {
                        await this.loadExternalScript(script);
                    }
                } else if (script.content) {
                    // Inline script
                    await this.executeInlineScript(script);
                }
            }
        }

        loadExternalScript(script) {
            return new Promise((resolve, reject) => {
                const scriptEl = document.createElement('script');
                scriptEl.type = script.type;
                scriptEl.src = script.src;
                
                if (script.async) scriptEl.async = true;
                if (script.defer) scriptEl.defer = true;
                
                scriptEl.onload = () => {
                    this.loadedScripts.add(script.src);
                    resolve();
                };
                
                scriptEl.onerror = () => {
                    this.log('error', `Failed to load script: ${script.src}`);
                    reject(new Error(`Failed to load script: ${script.src}`));
                };
                
                document.head.appendChild(scriptEl);
            });
        }

        executeInlineScript(script) {
            return new Promise((resolve) => {
                try {
                    const scriptEl = document.createElement('script');
                    scriptEl.type = script.type;
                    scriptEl.textContent = script.content;
                    document.body.appendChild(scriptEl);
                    
                    // Remove after execution
                    setTimeout(() => scriptEl.remove(), 0);
                    
                    resolve();
                } catch (error) {
                    this.log('error', 'Failed to execute inline script:', error);
                    resolve(); // Continue anyway
                }
            });
        }

        // ========================================
        // UI UPDATES
        // ========================================
        
        updateActiveStates(url) {
            const currentPath = new URL(url, window.location.origin).pathname;
            
            // Remove all active classes
            document.querySelectorAll(CONFIG.SELECTORS.activeLinks).forEach(link => {
                link.classList.remove('active');
            });
            
            // Add active class to matching links
            document.querySelectorAll('a').forEach(link => {
                try {
                    const linkPath = new URL(link.href, window.location.origin).pathname;
                    if (linkPath === currentPath) {
                        link.classList.add('active');
                        
                        // Also expand parent collapse if in navigation
                        const collapse = link.closest('.collapse');
                        if (collapse && window.bootstrap) {
                            const bsCollapse = bootstrap.Collapse.getInstance(collapse);
                            if (bsCollapse) {
                                bsCollapse.show();
                            }
                        }
                    }
                } catch (e) {
                    // Invalid URL, skip
                }
            });
        }

        displayFlashMessages(html) {
            // Remove existing flash messages
            document.querySelectorAll(CONFIG.SELECTORS.flashMessages).forEach(el => el.remove());
            
            // Insert new flash messages
            const mainContent = document.querySelector(CONFIG.SELECTORS.mainContent);
            if (mainContent) {
                mainContent.insertAdjacentHTML('beforebegin', html);
                
                // Auto-hide after 5 seconds
                setTimeout(() => {
                    const messages = document.querySelector(CONFIG.SELECTORS.flashMessages);
                    if (messages) {
                        messages.style.transition = 'opacity 0.5s';
                        messages.style.opacity = '0';
                        setTimeout(() => messages.remove(), 500);
                    }
                }, 5000);
            }
        }

        displayFlashMessagesArray(messages) {
            if (!messages || messages.length === 0) return;
            
            const container = document.createElement('div');
            container.className = 'flash-messages p-3';
            container.id = 'flashMessages';
            
            messages.forEach(([category, message]) => {
                const alertClass = category === 'error' ? 'danger' : category;
                const iconClass = category === 'error' ? 'exclamation-circle' : 
                                 category === 'success' ? 'check-circle' : 
                                 category === 'warning' ? 'exclamation-triangle' : 'info-circle';
                
                container.innerHTML += `
                    <div class="alert alert-${alertClass} alert-dismissible fade show" role="alert">
                        <i class="fas fa-${iconClass}"></i> ${message}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                `;
            });
            
            this.displayFlashMessages(container.outerHTML);
        }

        // ========================================
        // TRANSITIONS
        // ========================================
        
        async transitionOut() {
            const mainContent = document.querySelector(CONFIG.SELECTORS.mainContent);
            if (!mainContent) {
                this.log('warn', '[Transition Out] Main content element not found');
                return;
            }
            
            this.log('debug', '[Transition Out] Starting transition out');
            mainContent.style.opacity = '0';
            mainContent.style.transition = `opacity ${CONFIG.NAVIGATION.ANIMATION_DURATION}ms ease-out`;
            
            await this.delay(CONFIG.NAVIGATION.ANIMATION_DURATION);
            this.log('debug', '[Transition Out] Transition out completed');
        }

        async transitionIn() {
            const mainContent = document.querySelector(CONFIG.SELECTORS.mainContent);
            if (!mainContent) {
                this.log('warn', '[Transition In] Main content element not found');
                return;
            }
            
            this.log('debug', '[Transition In] Starting transition in');
            
            // Ensure content is visible before starting transition
            mainContent.style.display = 'block';
            mainContent.style.visibility = 'visible';
            
            // Force reflow before applying opacity
            mainContent.offsetHeight;
            
            mainContent.style.opacity = '1';
            mainContent.style.transition = `opacity ${CONFIG.NAVIGATION.ANIMATION_DURATION}ms ease-in`;
            
            await this.delay(CONFIG.NAVIGATION.ANIMATION_DURATION);
            
            // Clean up transition styles
            setTimeout(() => {
                mainContent.style.transition = '';
            }, CONFIG.NAVIGATION.ANIMATION_DURATION + 50);
            
            this.log('debug', '[Transition In] Transition in completed, opacity:', mainContent.style.opacity);
        }

        // ========================================
        // LOADING INDICATOR
        // ========================================
        
        showLoading() {
            // Check for custom loading implementation
            if (window.TalonLoading?.show) {
                window.TalonLoading.show('Caricamento...');
                return;
            }
            
            // Default loading bar
            let loader = document.getElementById('spa-loader');
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'spa-loader';
                loader.className = 'spa-loader';
                loader.innerHTML = `
                    <div class="spa-loader-bar"></div>
                `;
                document.body.appendChild(loader);
            }
            
            // Delay to prevent flash on fast loads
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = setTimeout(() => {
                loader.classList.add('active');
            }, CONFIG.NAVIGATION.LOADING_DELAY);
        }

        hideLoading() {
            clearTimeout(this.loadingTimeout);
            
            // Check for custom loading implementation
            if (window.TalonLoading?.hide) {
                window.TalonLoading.hide();
                return;
            }
            
            const loader = document.getElementById('spa-loader');
            if (loader) {
                loader.classList.remove('active');
            }
        }

        // ========================================
        // SCROLL MANAGEMENT
        // ========================================
        
        saveScrollPosition() {
            const url = this.state.currentUrl;
            const scrollPos = {
                x: window.scrollX,
                y: window.scrollY
            };
            
            this.state.scrollPositions.set(url, scrollPos);
            
            // Limit size
            if (this.state.scrollPositions.size > CONFIG.SPA.HISTORY_LIMIT) {
                const firstKey = this.state.scrollPositions.keys().next().value;
                this.state.scrollPositions.delete(firstKey);
            }
        }

        handleScrollRestoration(options) {
            if (options.scrollPosition) {
                // Restore saved position
                window.scrollTo(options.scrollPosition.x, options.scrollPosition.y);
            } else if (CONFIG.NAVIGATION.SCROLL_TO_TOP) {
                // Scroll to top
                window.scrollTo(0, 0);
            }
        }

        // ========================================
        // HISTORY MANAGEMENT
        // ========================================
        
        setupPopState() {
            window.addEventListener('popstate', this.handlePopState);
        }

        saveCurrentState() {
            window.history.replaceState(
                { url: window.location.href, timestamp: Date.now() },
                document.title,
                window.location.href
            );
        }

        addToHistory(url) {
            this.state.navigationHistory.push({
                url: url,
                timestamp: Date.now()
            });
            
            // Limit history size
            if (this.state.navigationHistory.length > CONFIG.SPA.HISTORY_LIMIT) {
                this.state.navigationHistory.shift();
            }
        }

        // ========================================
        // ERROR HANDLING
        // ========================================
        
        handleNavigationError(error, url) {
            this.log('error', 'Navigation error:', error);
            
            // Show error notification
            this.showNotification(
                'Errore durante la navigazione. Ricaricamento pagina...',
                'error'
            );
            
            // Fallback to normal navigation
            setTimeout(() => {
                window.location.href = url;
            }, 1500);
        }

        showNotification(message, type = 'info') {
            // Use TalonApp if available
            if (window.TalonApp?.showToast) {
                window.TalonApp.showToast(message, type);
                return;
            }
            
            // Fallback notification
            const notification = document.createElement('div');
            notification.className = `spa-notification spa-notification-${type}`;
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 10000;
                animation: slideIn 0.3s ease;
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        // ========================================
        // UTILITY METHODS
        // ========================================
        
        addEventHandler(element, event, handler, options = false) {
            element.addEventListener(event, handler, options);
            
            if (!this.eventHandlers.has(element)) {
                this.eventHandlers.set(element, []);
            }
            
            this.eventHandlers.get(element).push({ event, handler, options });
        }

        removeAllEventHandlers() {
            this.eventHandlers.forEach((handlers, element) => {
                handlers.forEach(({ event, handler, options }) => {
                    element.removeEventListener(event, handler, options);
                });
            });
            
            this.eventHandlers.clear();
        }

        addTimer(timer) {
            this.timers.add(timer);
            return timer;
        }

        clearAllTimers() {
            this.timers.forEach(timer => clearTimeout(timer));
            this.timers.clear();
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        emit(eventName, detail = {}) {
            const event = new CustomEvent(eventName, {
                detail: detail,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(event);
        }

        log(level, ...args) {
            if (!CONFIG.SPA.DEBUG && level === 'debug') return;
            
            const prefix = '[TalonSPA]';
            const methods = {
                'debug': 'log',
                'info': 'info',
                'warn': 'warn',
                'error': 'error',
                'success': 'log'
            };
            
            const method = methods[level] || 'log';
            console[method](prefix, ...args);
        }

        // ========================================
        // PUBLIC API
        // ========================================
        
        enable() {
            this.state.enabled = true;
            this.init();
            this.log('info', '✅ SPA Navigation enabled');
        }

        disable() {
            this.state.enabled = false;
            this.removeAllEventHandlers();
            this.clearAllTimers();
            this.log('info', '❌ SPA Navigation disabled');
        }

        navigate(url, options = {}) {
            return this.navigateWithTransition(url, options);
        }

        reload() {
            return this.navigateWithTransition(window.location.href, { force: true });
        }

        back() {
            window.history.back();
        }

        forward() {
            window.history.forward();
        }

        prefetch(url) {
            return this.prefetchUrl(url);
        }

        getCacheSize() {
            return this.cache.size;
        }

        getHistory() {
            return [...this.state.navigationHistory];
        }

        getCurrentUrl() {
            return this.state.currentUrl;
        }

        isNavigating() {
            return this.state.isNavigating;
        }
    }

    // ========================================
    // CSS STYLES
    // ========================================
    
    function injectStyles() {
        if (document.getElementById('spa-navigation-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'spa-navigation-styles';
        styles.textContent = `
            /* Loading bar */
            .spa-loader {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                z-index: 10000;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .spa-loader.active {
                opacity: 1;
            }
            
            .spa-loader-bar {
                height: 100%;
                background: linear-gradient(90deg, 
                    #007bff 0%, 
                    #00ff00 50%, 
                    #007bff 100%);
                background-size: 200% 100%;
                animation: spa-loading 1s linear infinite;
            }
            
            @keyframes spa-loading {
                0% { background-position: 0% 50%; }
                100% { background-position: 200% 50%; }
            }
            
            /* Transitions */
            .main-content {
                min-height: 400px;
                transition: opacity 0.3s ease;
            }
            
            /* Notifications */
            .spa-notification {
                background: #333;
                color: white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
            
            .spa-notification-success {
                background: #28a745;
            }
            
            .spa-notification-error {
                background: #dc3545;
            }
            
            .spa-notification-warning {
                background: #ffc107;
                color: #333;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            /* Prefetch indicator */
            a[data-prefetched] {
                position: relative;
            }
            
            a[data-prefetched]::after {
                content: '⚡';
                position: absolute;
                top: -5px;
                right: -5px;
                font-size: 10px;
                opacity: 0.5;
            }
        `;
        
        document.head.appendChild(styles);
    }

    // ========================================
    // INIZIALIZZAZIONE
    // ========================================
    
    // Inject styles
    injectStyles();
    
    // Create global instance
    const spa = new TalonSPA();
    
    // Export API
    window.TalonSPA = {
        // Core methods
        init: () => spa.init(),
        enable: () => spa.enable(),
        disable: () => spa.disable(),
        
        // Navigation
        navigate: (url, options) => spa.navigate(url, options),
        reload: () => spa.reload(),
        back: () => spa.back(),
        forward: () => spa.forward(),
        
        // Cache
        prefetch: (url) => spa.prefetch(url),
        clearCache: () => spa.clearCache(),
        getCacheSize: () => spa.getCacheSize(),
        
        // State
        getCurrentUrl: () => spa.getCurrentUrl(),
        getHistory: () => spa.getHistory(),
        isNavigating: () => spa.isNavigating(),
        
        // Config
        getConfig: () => ({ ...CONFIG }),
        setDebug: (enabled) => { CONFIG.SPA.DEBUG = enabled; },
        
        // Info
        version: '2.0.0'
    };
    
    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Check if user is logged in
            if (window.TALON_CONFIG?.user?.isLoggedIn !== false) {
                spa.init();
            }
        });
    } else {
        // Check if user is logged in
        if (window.TALON_CONFIG?.user?.isLoggedIn !== false) {
            spa.init();
        }
    }
    
    console.log('%c🚀 Talon SPA Navigation v2.0.0 - Ready', 
        'color: #00ff00; font-weight: bold; font-size: 14px;');

})(window, document);