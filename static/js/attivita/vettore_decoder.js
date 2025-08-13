/**
 * ========================================
 * TALON - VETTORE DECODER MODULE
 * File: static/js/attivita/vettore_decoder.js
 * 
 * Versione: 1.0.0
 * Descrizione: Decodifica i codici vettore GETRA
 *              per attività di Gestione Transito
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        DEBUG: window.TALON_CONFIG?.debug?.enabled || false,
        
        // Prefissi pianificazione
        PLANNING: {
            'S': {
                code: 'S',
                nameEng: 'Sourced',
                nameIta: 'Pianificata',
                descEng: 'Planned Mission',
                descIta: 'Missione Pianificata'
            },
            'U': {
                code: 'U',
                nameEng: 'Unsourced',
                nameIta: 'Non Pianificata',
                descEng: 'Unplanned Mission',
                descIta: 'Missione Non Pianificata'
            }
        },
        
        // Servizi/Vettori
        SERVICES: {
            'AF': {
                code: 'AF',
                nameEng: 'Air Force',
                nameIta: 'Aeronautica Militare',
                icon: '✈️',
                color: '#007bff'
            },
            'CC': {
                code: 'CC',
                nameEng: 'Commercial Cargo',
                nameIta: 'Cargo Commerciale',
                icon: '📦',
                color: '#28a745'
            },
            'CP': {
                code: 'CP',
                nameEng: 'Commercial Pax',
                nameIta: 'Passeggeri Commerciale',
                icon: '👥',
                color: '#17a2b8'
            },
            'CS': {
                code: 'CS',
                nameEng: 'Commercial Ship',
                nameIta: 'Nave Commerciale',
                icon: '🚢',
                color: '#6c757d'
            },
            'CT': {
                code: 'CT',
                nameEng: 'Commercial Train',
                nameIta: 'Treno Commerciale',
                icon: '🚂',
                color: '#fd7e14'
            },
            'CTR': {
                code: 'CTR',
                nameEng: 'Commercial Truck',
                nameIta: 'Camion Commerciale',
                icon: '🚚',
                color: '#20c997'
            },
            'A': {
                code: 'A',
                nameEng: 'Army',
                nameIta: 'Esercito',
                icon: '🪖',
                color: '#6f42c1'
            },
            'N': {
                code: 'N',
                nameEng: 'Navy',
                nameIta: 'Marina Militare',
                icon: '⚓',
                color: '#0056b3'
            },
            'USAF': {
                code: 'USAF',
                nameEng: 'US Air Force',
                nameIta: 'US Air Force',
                icon: '🇺🇸',
                color: '#dc3545'
            },
            'NATO': {
                code: 'NATO',
                nameEng: 'NATO',
                nameIta: 'NATO',
                icon: '🌐',
                color: '#004990'
            }
        },
        
        // Tipi operazione
        OPERATIONS: {
            'OPS': {
                code: 'OPS',
                nameEng: 'Operations',
                nameIta: 'Operazioni',
                descEng: 'Military Operations',
                descIta: 'Operazioni Militari',
                priority: 1,
                color: '#dc3545'
            },
            'CER': {
                code: 'CER',
                nameEng: 'Ceremony',
                nameIta: 'Cerimonia',
                descEng: 'Ceremonial Activities',
                descIta: 'Attività Cerimoniali',
                priority: 3,
                color: '#6c757d'
            },
            'PK': {
                code: 'PK',
                nameEng: 'Peace Keeping',
                nameIta: 'Peacekeeping',
                descEng: 'Peace Keeping Operations',
                descIta: 'Operazioni di Peacekeeping',
                priority: 2,
                color: '#17a2b8'
            },
            'HA': {
                code: 'HA',
                nameEng: 'Humanitarian Aid',
                nameIta: 'Aiuti Umanitari',
                descEng: 'Humanitarian Assistance',
                descIta: 'Assistenza Umanitaria',
                priority: 2,
                color: '#28a745'
            },
            'EXE': {
                code: 'EXE',
                nameEng: 'Exercises',
                nameIta: 'Esercitazioni',
                descEng: 'Training Exercises',
                descIta: 'Esercitazioni Addestrative',
                priority: 4,
                color: '#ffc107'
            }
        }
    };

    // ========================================
    // DECODER CLASS
    // ========================================
    
    class VettoreDecoder {
        constructor() {
            this.config = CONFIG;
            this.cache = new Map();
            this.initialized = false;
        }

        /**
         * Inizializza il decoder
         */
        initialize() {
            if (this.initialized) return;
            
            this.log('Inizializzazione VettoreDecoder...');
            
            // Setup cache
            this.cache.clear();
            
            // Marca come inizializzato
            this.initialized = true;
            
            this.log('VettoreDecoder inizializzato');
        }

        /**
         * Decodifica un codice vettore
         * @param {string} code - Codice vettore (es. "SAFOPS", "UCCPK")
         * @returns {Object|null} Oggetto con decodifica o null se non valido
         */
        decode(code) {
            if (!code || typeof code !== 'string') {
                this.log('warn', 'Codice vettore non valido:', code);
                return null;
            }

            // Normalizza il codice
            code = code.trim().toUpperCase();
            
            // Controlla cache
            if (this.cache.has(code)) {
                return this.cache.get(code);
            }

            // Parse del codice
            const result = this.parseCode(code);
            
            if (result) {
                // Aggiungi informazioni complete
                result.fullCode = code;
                result.fullDecodeEng = this.getFullDescription(result, 'eng');
                result.fullDecodeIta = this.getFullDescription(result, 'ita');
                result.priority = this.calculatePriority(result);
                result.icon = this.getIcon(result);
                result.color = this.getColor(result);
                
                // Salva in cache
                this.cache.set(code, result);
            }

            return result;
        }

        /**
         * Parse del codice vettore
         * @private
         */
        parseCode(code) {
            // Pattern: [S/U][SERVIZIO][OPERAZIONE]
            // Es: SAFOPS = S + AF + OPS
            
            if (code.length < 4) {
                this.log('warn', 'Codice troppo corto:', code);
                return null;
            }

            // Estrai prefisso pianificazione (primo carattere)
            const planningChar = code.charAt(0);
            const planning = this.config.PLANNING[planningChar];
            
            if (!planning) {
                this.log('warn', 'Prefisso pianificazione non valido:', planningChar);
                return null;
            }

            // Rimuovi prefisso pianificazione
            let remaining = code.substring(1);
            
            // Cerca il servizio (può essere di lunghezza variabile)
            let service = null;
            let operation = null;
            
            // Prova prima i servizi più lunghi (USAF, NATO)
            const serviceKeys = Object.keys(this.config.SERVICES)
                .sort((a, b) => b.length - a.length);
            
            for (const key of serviceKeys) {
                if (remaining.startsWith(key)) {
                    service = this.config.SERVICES[key];
                    remaining = remaining.substring(key.length);
                    break;
                }
            }
            
            if (!service) {
                this.log('warn', 'Servizio non trovato nel codice:', code);
                return null;
            }
            
            // Il resto dovrebbe essere l'operazione
            operation = this.config.OPERATIONS[remaining];
            
            if (!operation) {
                this.log('warn', 'Operazione non valida:', remaining);
                return null;
            }

            return {
                planning: planning,
                service: service,
                operation: operation,
                isValid: true
            };
        }

        /**
         * Genera descrizione completa
         * @private
         */
        getFullDescription(decoded, lang = 'eng') {
            if (!decoded || !decoded.isValid) return 'Codice non valido';
            
            const isEng = lang === 'eng';
            const planning = isEng ? decoded.planning.nameEng : decoded.planning.nameIta;
            const service = isEng ? decoded.service.nameEng : decoded.service.nameIta;
            const operation = isEng ? decoded.operation.nameEng : decoded.operation.nameIta;
            
            return `${planning} - ${service} - ${operation}`;
        }

        /**
         * Calcola priorità del vettore
         * @private
         */
        calculatePriority(decoded) {
            if (!decoded || !decoded.isValid) return 999;
            
            let priority = decoded.operation.priority || 5;
            
            // Missioni pianificate hanno priorità maggiore
            if (decoded.planning.code === 'S') {
                priority -= 0.5;
            }
            
            // Servizi militari hanno priorità maggiore
            if (['AF', 'A', 'N', 'USAF', 'NATO'].includes(decoded.service.code)) {
                priority -= 0.3;
            }
            
            return priority;
        }

        /**
         * Ottieni icona appropriata
         * @private
         */
        getIcon(decoded) {
            if (!decoded || !decoded.isValid) return '❓';
            return decoded.service.icon || '📍';
        }

        /**
         * Ottieni colore appropriato
         * @private
         */
        getColor(decoded) {
            if (!decoded || !decoded.isValid) return '#6c757d';
            
            // Usa colore dell'operazione per urgenza
            if (decoded.operation.code === 'OPS' || decoded.operation.code === 'HA') {
                return decoded.operation.color;
            }
            
            // Altrimenti usa colore del servizio
            return decoded.service.color || '#6c757d';
        }

        /**
         * Decodifica multipla
         * @param {Array} codes - Array di codici
         * @returns {Array} Array di decodifiche
         */
        decodeMultiple(codes) {
            if (!Array.isArray(codes)) return [];
            
            return codes.map(code => this.decode(code))
                       .filter(result => result !== null);
        }

        /**
         * Verifica se un codice è valido
         * @param {string} code - Codice da verificare
         * @returns {boolean}
         */
        isValid(code) {
            const decoded = this.decode(code);
            return decoded !== null && decoded.isValid;
        }

        /**
         * Ottieni tutti i codici possibili
         * @returns {Array} Array di tutti i codici validi
         */
        getAllCodes() {
            const codes = [];
            
            Object.keys(this.config.PLANNING).forEach(planningKey => {
                Object.keys(this.config.SERVICES).forEach(serviceKey => {
                    Object.keys(this.config.OPERATIONS).forEach(operationKey => {
                        codes.push(planningKey + serviceKey + operationKey);
                    });
                });
            });
            
            return codes;
        }

        /**
         * Cerca codici per criterio
         * @param {Object} criteria - Criteri di ricerca
         * @returns {Array} Codici che corrispondono ai criteri
         */
        searchCodes(criteria = {}) {
            const allCodes = this.getAllCodes();
            
            return allCodes.filter(code => {
                const decoded = this.decode(code);
                if (!decoded) return false;
                
                // Filtra per pianificazione
                if (criteria.planning && decoded.planning.code !== criteria.planning) {
                    return false;
                }
                
                // Filtra per servizio
                if (criteria.service && decoded.service.code !== criteria.service) {
                    return false;
                }
                
                // Filtra per operazione
                if (criteria.operation && decoded.operation.code !== criteria.operation) {
                    return false;
                }
                
                // Filtra per priorità
                if (criteria.maxPriority && decoded.priority > criteria.maxPriority) {
                    return false;
                }
                
                return true;
            });
        }

        /**
         * Ottieni statistiche sui codici
         * @param {Array} codes - Array di codici
         * @returns {Object} Statistiche
         */
        getStatistics(codes) {
            const stats = {
                total: 0,
                valid: 0,
                invalid: 0,
                byPlanning: {},
                byService: {},
                byOperation: {},
                priorities: []
            };
            
            codes.forEach(code => {
                stats.total++;
                const decoded = this.decode(code);
                
                if (decoded && decoded.isValid) {
                    stats.valid++;
                    
                    // Conta per pianificazione
                    const planningKey = decoded.planning.nameEng;
                    stats.byPlanning[planningKey] = (stats.byPlanning[planningKey] || 0) + 1;
                    
                    // Conta per servizio
                    const serviceKey = decoded.service.nameEng;
                    stats.byService[serviceKey] = (stats.byService[serviceKey] || 0) + 1;
                    
                    // Conta per operazione
                    const operationKey = decoded.operation.nameEng;
                    stats.byOperation[operationKey] = (stats.byOperation[operationKey] || 0) + 1;
                    
                    // Aggiungi priorità
                    stats.priorities.push(decoded.priority);
                } else {
                    stats.invalid++;
                }
            });
            
            // Calcola priorità media
            if (stats.priorities.length > 0) {
                stats.averagePriority = stats.priorities.reduce((a, b) => a + b, 0) / stats.priorities.length;
            }
            
            return stats;
        }

        /**
         * Esporta decodifica in formato HTML
         * @param {string} code - Codice da decodificare
         * @returns {string} HTML formattato
         */
        toHTML(code) {
            const decoded = this.decode(code);
            
            if (!decoded || !decoded.isValid) {
                return `<span class="vettore-invalid">Codice non valido: ${code}</span>`;
            }
            
            return `
                <div class="vettore-decoded" style="color: ${decoded.color}">
                    <div class="vettore-icon">${decoded.icon}</div>
                    <div class="vettore-code"><strong>${code}</strong></div>
                    <div class="vettore-desc-eng">${decoded.fullDecodeEng}</div>
                    <div class="vettore-desc-ita">${decoded.fullDecodeIta}</div>
                    <div class="vettore-priority">Priorità: ${decoded.priority}</div>
                </div>
            `;
        }

        /**
         * Clear cache
         */
        clearCache() {
            this.cache.clear();
            this.log('Cache svuotata');
        }

        /**
         * Get cache size
         */
        getCacheSize() {
            return this.cache.size;
        }

        /**
         * Logger utility
         * @private
         */
        log(level, ...args) {
            if (!this.config.DEBUG) return;
            
            if (level === 'warn' || level === 'error') {
                console[level]('[VettoreDecoder]', ...args);
            } else {
                console.log('[VettoreDecoder]', level, ...args);
            }
        }
    }

    // ========================================
    // INIZIALIZZAZIONE E EXPORT
    // ========================================
    
    // Crea istanza singleton
    const decoder = new VettoreDecoder();
    
    // Auto-inizializza
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => decoder.initialize());
    } else {
        decoder.initialize();
    }
    
    // Export globale
    window.VettoreDecoder = decoder;
    
    // Export per moduli (se supportato)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = decoder;
    }
    
    // Log versione
    if (CONFIG.DEBUG) {
        console.log('[VettoreDecoder] Modulo caricato v1.0.0');
        console.log('[VettoreDecoder] Codici disponibili:', decoder.getAllCodes().length);
    }

})(window, document);