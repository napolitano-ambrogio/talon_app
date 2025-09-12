/**
 * ========================================
 * TALON CACHE MANAGER - Sistema Caching Avanzato
 * File: talon-cache-manager.js
 * 
 * Versione: 1.0.0
 * Cache Manager con algoritmo LRU, TTL dinamico e gestione memoria
 * Ottimizzato per API dashboard eventi con pattern di accesso frequenti
 * ========================================
 */

window.TalonCacheManager = window.TalonCacheManager || {};

(function(namespace) {
    'use strict';

    /**
     * Classe principale per gestione cache avanzata
     */
    class TalonCacheManager {
        constructor(config = {}) {
            // Configurazione cache con valori di default
            this.config = {
                maxEntries: config.maxEntries || 100,
                maxMemoryMB: config.maxMemoryMB || 10,
                defaultTTL: config.defaultTTL || 5 * 60 * 1000, // 5 minuti
                cleanupInterval: config.cleanupInterval || 60 * 1000, // 1 minuto
                compressionEnabled: config.compressionEnabled || false,
                
                // Strategie TTL per endpoint specifici
                strategies: {
                    '/eventi/api/dashboard-data': 30 * 60 * 1000,      // 30 minuti - dati aggregati statici
                    '/eventi/api/enti-livello1': 15 * 60 * 1000,       // 15 minuti - enti cambiano poco
                    '/eventi/api/enti-livello2': 10 * 60 * 1000,       // 10 minuti - sottoenti
                    '/eventi/api/enti-stacked': 15 * 60 * 1000,        // 15 minuti - dati stacked
                    '/eventi/api/dettagli': 2 * 60 * 1000,             // 2 minuti - dettagli eventi
                    'default': 5 * 60 * 1000,                          // 5 minuti - default
                    ...config.strategies
                }
            };

            // Strutture dati cache
            this.cache = new Map();
            this.lruOrder = [];
            this.accessTimes = new Map();
            this.memoryUsage = 0;

            // Statistiche performance
            this.statistics = {
                hits: 0,
                misses: 0,
                evictions: 0,
                totalRequests: 0,
                memoryPeakMB: 0,
                averageResponseTime: 0,
                preloadHits: 0,
                compressionSavings: 0
            };

            // Preload queue per richieste anticipate
            this.preloadQueue = new Set();
            this.preloadInProgress = new Set();

            // Event emitters per debug e monitoring
            this.eventListeners = {
                hit: [],
                miss: [],
                eviction: [],
                memoryWarning: []
            };

            // Avvio pulizia automatica
            this.startCleanupTimer();

            console.log('🚀 [TalonCacheManager] Inizializzato con configurazione:', this.config);
        }

        // ========================================
        // OPERAZIONI CACHE PRINCIPALI
        // ========================================

        /**
         * Recupera valore dalla cache (LRU)
         * @param {string} key - Chiave cache
         * @returns {any|null} Valore cachato o null
         */
        async get(key) {
            this.statistics.totalRequests++;
            const entry = this.cache.get(key);
            
            if (!entry) {
                this.statistics.misses++;
                this.emit('miss', { key, timestamp: Date.now() });
                return null;
            }

            // Verifica TTL
            if (Date.now() > entry.expiresAt) {
                this.delete(key);
                this.statistics.misses++;
                this.emit('miss', { key, reason: 'expired', timestamp: Date.now() });
                return null;
            }

            // Aggiorna LRU order
            this.updateLRU(key);
            this.statistics.hits++;
            
            // Decompressione se necessaria
            const value = this.config.compressionEnabled && entry.compressed ? 
                         this.decompress(entry.data) : entry.data;

            this.emit('hit', { 
                key, 
                size: entry.size, 
                age: Date.now() - entry.createdAt,
                timestamp: Date.now() 
            });

            return value;
        }

        /**
         * Memorizza valore in cache
         * @param {string} key - Chiave cache
         * @param {any} value - Valore da cachare
         * @param {number} customTTL - TTL personalizzato in ms
         * @param {Object} options - Opzioni aggiuntive
         */
        set(key, value, customTTL = null, options = {}) {
            try {
                const ttl = customTTL || this.getTTLForKey(key);
                const now = Date.now();
                
                // Calcola dimensione entry
                const serialized = JSON.stringify(value);
                const compressed = this.config.compressionEnabled ? 
                                 this.compress(serialized) : null;
                
                const dataToStore = compressed || serialized;
                const entrySize = this.calculateSize(dataToStore);

                // Gestisci memoria prima di aggiungere
                this.ensureMemoryCapacity(entrySize);

                // Crea entry cache
                const entry = {
                    data: this.config.compressionEnabled ? (compressed || value) : value,
                    createdAt: now,
                    expiresAt: now + ttl,
                    size: entrySize,
                    accessCount: 1,
                    compressed: !!compressed,
                    metadata: {
                        url: this.extractURLFromKey(key),
                        level: this.extractLevelFromKey(key),
                        viewType: this.extractViewTypeFromKey(key),
                        ...options.metadata
                    }
                };

                // Rimuovi entry esistente se presente
                if (this.cache.has(key)) {
                    this.delete(key, false);
                }

                // Aggiungi alla cache
                this.cache.set(key, entry);
                this.updateLRU(key);
                this.memoryUsage += entrySize;

                // Aggiorna statistiche
                if (compressed) {
                    this.statistics.compressionSavings += serialized.length - compressed.length;
                }

                this.updateMemoryStats();

                console.log(`📦 [TalonCacheManager] Cached: ${key} (${this.formatBytes(entrySize)}, TTL: ${ttl/1000}s)`);
                
                return true;

            } catch (error) {
                console.error('🚨 [TalonCacheManager] Errore set cache:', error);
                return false;
            }
        }

        /**
         * Rimuove entry dalla cache
         * @param {string} key - Chiave da rimuovere
         * @param {boolean} updateStats - Se aggiornare le statistiche
         */
        delete(key, updateStats = true) {
            const entry = this.cache.get(key);
            if (!entry) return false;

            this.cache.delete(key);
            this.removeLRU(key);
            this.accessTimes.delete(key);
            this.memoryUsage -= entry.size;

            if (updateStats) {
                this.statistics.evictions++;
            }

            return true;
        }

        // ========================================
        // ALGORITMO LRU (Least Recently Used)
        // ========================================

        /**
         * Aggiorna ordine LRU per chiave
         * @param {string} key - Chiave da aggiornare
         */
        updateLRU(key) {
            // Rimuovi da posizione corrente
            const index = this.lruOrder.indexOf(key);
            if (index > -1) {
                this.lruOrder.splice(index, 1);
            }

            // Aggiungi in testa (più recente)
            this.lruOrder.unshift(key);
            this.accessTimes.set(key, Date.now());

            // Limita lunghezza array LRU
            if (this.lruOrder.length > this.config.maxEntries) {
                const lru = this.lruOrder.pop();
                this.delete(lru);
            }
        }

        /**
         * Rimuove chiave da ordine LRU
         * @param {string} key - Chiave da rimuovere
         */
        removeLRU(key) {
            const index = this.lruOrder.indexOf(key);
            if (index > -1) {
                this.lruOrder.splice(index, 1);
            }
        }

        /**
         * Eviction LRU quando memoria piena
         * @param {number} spaceNeeded - Spazio necessario in bytes
         */
        evictLRU(spaceNeeded = 0) {
            let freedSpace = 0;
            const evicted = [];

            // Rimuovi entries dalla coda (meno recenti)
            while (this.lruOrder.length > 0 && 
                   (this.memoryUsage + spaceNeeded > this.getMaxMemoryBytes() || 
                    spaceNeeded > freedSpace)) {
                
                const lruKey = this.lruOrder[this.lruOrder.length - 1];
                const entry = this.cache.get(lruKey);
                
                if (entry) {
                    freedSpace += entry.size;
                    evicted.push(lruKey);
                    this.delete(lruKey);
                } else {
                    this.lruOrder.pop();
                }
            }

            if (evicted.length > 0) {
                this.emit('eviction', { 
                    evicted, 
                    freedSpace, 
                    reason: spaceNeeded > 0 ? 'space_needed' : 'memory_limit',
                    timestamp: Date.now() 
                });
                
                console.log(`🗑️ [TalonCacheManager] Evicted ${evicted.length} entries (${this.formatBytes(freedSpace)} freed)`);
            }

            return freedSpace;
        }

        // ========================================
        // GESTIONE MEMORIA
        // ========================================

        /**
         * Assicura capacità memoria disponibile
         * @param {number} spaceNeeded - Spazio necessario
         */
        ensureMemoryCapacity(spaceNeeded) {
            const maxMemory = this.getMaxMemoryBytes();
            
            if (this.memoryUsage + spaceNeeded > maxMemory) {
                this.evictLRU(spaceNeeded);
                
                // Emetti warning se ancora sopra il limite
                if (this.memoryUsage > maxMemory * 0.9) {
                    this.emit('memoryWarning', {
                        current: this.memoryUsage,
                        max: maxMemory,
                        percentage: (this.memoryUsage / maxMemory) * 100,
                        timestamp: Date.now()
                    });
                }
            }
        }

        /**
         * Ottieni limite memoria in bytes
         * @returns {number} Limite memoria in bytes
         */
        getMaxMemoryBytes() {
            return this.config.maxMemoryMB * 1024 * 1024;
        }

        /**
         * Calcola dimensione di un oggetto
         * @param {any} obj - Oggetto da misurare
         * @returns {number} Dimensione in bytes
         */
        calculateSize(obj) {
            if (typeof obj === 'string') {
                return obj.length * 2; // UTF-16
            }
            
            try {
                return JSON.stringify(obj).length * 2;
            } catch {
                return 1024; // Stima default
            }
        }

        /**
         * Aggiorna statistiche memoria
         */
        updateMemoryStats() {
            const currentMB = this.memoryUsage / (1024 * 1024);
            if (currentMB > this.statistics.memoryPeakMB) {
                this.statistics.memoryPeakMB = currentMB;
            }
        }

        // ========================================
        // TTL E STRATEGIE CACHING
        // ========================================

        /**
         * Determina TTL per chiave specifica
         * @param {string} key - Chiave cache
         * @returns {number} TTL in millisecondi
         */
        getTTLForKey(key) {
            for (const [pattern, ttl] of Object.entries(this.config.strategies)) {
                if (pattern !== 'default' && key.includes(pattern)) {
                    return ttl;
                }
            }
            
            return this.config.strategies.default || this.config.defaultTTL;
        }

        // ========================================
        // INVALIDAZIONE CACHE
        // ========================================

        /**
         * Invalida cache basata su pattern
         * @param {string|RegExp} pattern - Pattern per invalidazione
         * @param {Object} options - Opzioni invalidazione
         */
        invalidate(pattern, options = {}) {
            const invalidated = [];
            const isRegex = pattern instanceof RegExp;
            
            for (const [key, entry] of this.cache.entries()) {
                const shouldInvalidate = isRegex ? 
                    pattern.test(key) : 
                    key.includes(pattern);
                    
                if (shouldInvalidate) {
                    // Verifica condizioni aggiuntive
                    if (options.olderThan && 
                        Date.now() - entry.createdAt < options.olderThan) {
                        continue;
                    }
                    
                    if (options.level && 
                        entry.metadata.level !== options.level) {
                        continue;
                    }
                    
                    this.delete(key);
                    invalidated.push(key);
                }
            }
            
            if (invalidated.length > 0) {
                console.log(`🔄 [TalonCacheManager] Invalidated ${invalidated.length} entries matching: ${pattern}`);
            }
            
            return invalidated;
        }

        /**
         * Invalida tutta la cache
         */
        invalidateAll() {
            const count = this.cache.size;
            this.cache.clear();
            this.lruOrder = [];
            this.accessTimes.clear();
            this.memoryUsage = 0;
            
            console.log(`🔄 [TalonCacheManager] Invalidated all cache (${count} entries)`);
            return count;
        }

        // ========================================
        // PRELOADING E OTTIMIZZAZIONI
        // ========================================

        /**
         * Precarica dati anticipando navigazione utente
         * @param {string} key - Chiave da precaricare
         * @param {Function} dataLoader - Funzione per caricare dati
         * @param {Object} options - Opzioni preload
         */
        async preload(key, dataLoader, options = {}) {
            if (this.cache.has(key) || this.preloadInProgress.has(key)) {
                return; // Già presente o in caricamento
            }

            if (this.preloadQueue.size >= 10) {
                return; // Limite preload queue
            }

            this.preloadQueue.add(key);
            this.preloadInProgress.add(key);

            try {
                const data = await dataLoader();
                const success = this.set(key, data, options.ttl, {
                    metadata: { preloaded: true, ...options.metadata }
                });

                if (success) {
                    this.statistics.preloadHits++;
                    console.log(`⚡ [TalonCacheManager] Preloaded: ${key}`);
                }
            } catch (error) {
                console.error(`🚨 [TalonCacheManager] Preload failed for ${key}:`, error);
            } finally {
                this.preloadQueue.delete(key);
                this.preloadInProgress.delete(key);
            }
        }

        // ========================================
        // COMPRESSIONE DATI
        // ========================================

        /**
         * Comprime dati per risparmiare memoria
         * @param {string} data - Dati da comprimere
         * @returns {string} Dati compressi
         */
        compress(data) {
            if (!this.config.compressionEnabled) return null;
            
            try {
                // Implementazione semplificata compressione LZ
                return this.simpleLZCompress(data);
            } catch (error) {
                console.error('🚨 [TalonCacheManager] Errore compressione:', error);
                return null;
            }
        }

        /**
         * Decomprime dati
         * @param {string} compressedData - Dati compressi
         * @returns {string} Dati decompressi
         */
        decompress(compressedData) {
            try {
                return this.simpleLZDecompress(compressedData);
            } catch (error) {
                console.error('🚨 [TalonCacheManager] Errore decompressione:', error);
                return compressedData;
            }
        }

        /**
         * Compressione LZ semplificata
         * @param {string} input - Input da comprimere
         * @returns {string} Output compresso
         */
        simpleLZCompress(input) {
            const dict = {};
            const data = input.split('');
            const out = [];
            let dictSize = 256;

            for (let i = 0; i < 256; i++) {
                dict[String.fromCharCode(i)] = i;
            }

            let w = '';
            for (const c of data) {
                const wc = w + c;
                if (dict[wc]) {
                    w = wc;
                } else {
                    out.push(dict[w]);
                    dict[wc] = dictSize++;
                    w = c;
                }
            }

            if (w) {
                out.push(dict[w]);
            }

            return out.join(',');
        }

        /**
         * Decompressione LZ semplificata
         * @param {string} input - Input compresso
         * @returns {string} Output decompresso
         */
        simpleLZDecompress(input) {
            const dict = {};
            const data = input.split(',').map(Number);
            let dictSize = 256;

            for (let i = 0; i < 256; i++) {
                dict[i] = String.fromCharCode(i);
            }

            let w = String.fromCharCode(data[0]);
            let result = w;

            for (let i = 1; i < data.length; i++) {
                const k = data[i];
                let entry;

                if (dict[k]) {
                    entry = dict[k];
                } else if (k === dictSize) {
                    entry = w + w.charAt(0);
                } else {
                    throw new Error('Invalid compressed data');
                }

                result += entry;
                dict[dictSize++] = w + entry.charAt(0);
                w = entry;
            }

            return result;
        }

        // ========================================
        // PULIZIA E MANUTENZIONE
        // ========================================

        /**
         * Avvia timer pulizia automatica
         */
        startCleanupTimer() {
            this.cleanupTimer = setInterval(() => {
                this.cleanup();
            }, this.config.cleanupInterval);
        }

        /**
         * Pulizia entries scadute
         */
        cleanup() {
            const now = Date.now();
            const expired = [];
            
            for (const [key, entry] of this.cache.entries()) {
                if (now > entry.expiresAt) {
                    expired.push(key);
                }
            }
            
            for (const key of expired) {
                this.delete(key);
            }
            
            if (expired.length > 0) {
                console.log(`🧹 [TalonCacheManager] Cleaned ${expired.length} expired entries`);
            }
        }

        /**
         * Arresta timer pulizia
         */
        stopCleanupTimer() {
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }
        }

        // ========================================
        // EVENTI E MONITORING
        // ========================================

        /**
         * Registra listener per eventi cache
         * @param {string} event - Tipo evento (hit, miss, eviction, memoryWarning)
         * @param {Function} callback - Funzione callback
         */
        on(event, callback) {
            if (!this.eventListeners[event]) {
                this.eventListeners[event] = [];
            }
            this.eventListeners[event].push(callback);
        }

        /**
         * Rimuove listener eventi
         * @param {string} event - Tipo evento
         * @param {Function} callback - Funzione callback
         */
        off(event, callback) {
            if (!this.eventListeners[event]) return;
            
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }

        /**
         * Emette evento
         * @param {string} event - Tipo evento
         * @param {any} data - Dati evento
         */
        emit(event, data) {
            if (!this.eventListeners[event]) return;
            
            for (const callback of this.eventListeners[event]) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`🚨 [TalonCacheManager] Errore callback evento ${event}:`, error);
                }
            }
        }

        // ========================================
        // STATISTICHE E REPORT
        // ========================================

        /**
         * Ottieni statistiche complete
         * @returns {Object} Statistiche cache
         */
        getStatistics() {
            const hitRatio = this.statistics.totalRequests > 0 ? 
                           (this.statistics.hits / this.statistics.totalRequests) * 100 : 0;

            return {
                ...this.statistics,
                hitRatio: parseFloat(hitRatio.toFixed(2)),
                currentEntries: this.cache.size,
                memoryUsageMB: parseFloat((this.memoryUsage / (1024 * 1024)).toFixed(2)),
                memoryUsagePercent: parseFloat(((this.memoryUsage / this.getMaxMemoryBytes()) * 100).toFixed(2)),
                lruQueueLength: this.lruOrder.length,
                preloadQueueLength: this.preloadQueue.size,
                compressionRatio: this.statistics.compressionSavings > 0 ? 
                                parseFloat((this.statistics.compressionSavings / (this.memoryUsage + this.statistics.compressionSavings) * 100).toFixed(2)) : 0
            };
        }

        /**
         * Genera report dettagliato cache
         * @returns {Object} Report completo
         */
        getDetailedReport() {
            const stats = this.getStatistics();
            const entries = [];
            
            for (const [key, entry] of this.cache.entries()) {
                entries.push({
                    key,
                    size: entry.size,
                    age: Date.now() - entry.createdAt,
                    ttlRemaining: entry.expiresAt - Date.now(),
                    accessCount: entry.accessCount,
                    compressed: entry.compressed,
                    metadata: entry.metadata
                });
            }
            
            // Ordina per dimensione decrescente
            entries.sort((a, b) => b.size - a.size);
            
            return {
                statistics: stats,
                entries: entries,
                topConsumers: entries.slice(0, 10),
                oldestEntries: entries.sort((a, b) => b.age - a.age).slice(0, 5),
                config: this.config,
                timestamp: new Date().toISOString()
            };
        }

        // ========================================
        // UTILITY E HELPER
        // ========================================

        /**
         * Estrae URL da chiave cache
         * @param {string} key - Chiave cache
         * @returns {string} URL estratto
         */
        extractURLFromKey(key) {
            const match = key.match(/^([^?]+)/);
            return match ? match[1] : '';
        }

        /**
         * Estrae livello da chiave cache
         * @param {string} key - Chiave cache
         * @returns {number|null} Livello estratto
         */
        extractLevelFromKey(key) {
            const match = key.match(/level[=:](\d+)/);
            return match ? parseInt(match[1]) : null;
        }

        /**
         * Estrae tipo vista da chiave cache
         * @param {string} key - Chiave cache
         * @returns {string|null} Tipo vista
         */
        extractViewTypeFromKey(key) {
            if (key.includes('tipologie') || key.includes('tipo_evento')) {
                return 'tipologie';
            } else if (key.includes('enti')) {
                return 'enti';
            }
            return null;
        }

        /**
         * Formatta bytes in formato leggibile
         * @param {number} bytes - Bytes da formattare
         * @returns {string} Formato leggibile
         */
        formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        /**
         * Distrugge cache manager
         */
        destroy() {
            this.stopCleanupTimer();
            this.invalidateAll();
            this.eventListeners = {};
            this.preloadQueue.clear();
            this.preloadInProgress.clear();
            
            console.log('🧹 [TalonCacheManager] Cache manager distrutto');
        }
    }

    // ========================================
    // EXPORT E INIZIALIZZAZIONE
    // ========================================

    // Esporta classe principale
    namespace.TalonCacheManager = TalonCacheManager;

    // Factory function per creare istanza configurata per TALON
    namespace.createTalonCache = function(config = {}) {
        const defaultConfig = {
            maxEntries: 100,
            maxMemoryMB: 10,
            defaultTTL: 5 * 60 * 1000,
            cleanupInterval: 60 * 1000,
            compressionEnabled: true,
            strategies: {
                '/eventi/api/dashboard-data': 30 * 60 * 1000,
                '/eventi/api/enti-livello1': 15 * 60 * 1000,
                '/eventi/api/enti-livello2': 10 * 60 * 1000,
                '/eventi/api/enti-stacked': 15 * 60 * 1000,
                '/eventi/api/dettagli': 2 * 60 * 1000,
                'default': 5 * 60 * 1000
            }
        };

        const mergedConfig = { ...defaultConfig, ...config };
        return new TalonCacheManager(mergedConfig);
    };

    // Istanza singleton globale per facilità d'uso
    namespace.globalCache = null;

    /**
     * Ottieni istanza cache globale
     * @param {Object} config - Configurazione opzionale
     * @returns {TalonCacheManager} Istanza cache globale
     */
    namespace.getGlobalCache = function(config = {}) {
        if (!namespace.globalCache) {
            namespace.globalCache = namespace.createTalonCache(config);
        }
        return namespace.globalCache;
    };

})(window.TalonCacheManager);

// Auto-inizializzazione se eseguito in ambiente browser
if (typeof window !== 'undefined' && window.document) {
    console.log('📦 [TalonCacheManager] Modulo caricato - v1.0.0');
}