/**
 * ========================================
 * TALON SIMPLIFIED NEURAL NETWORK
 * File: static/js/neural-network.js
 * 
 * Versione: 4.0 - Semplificata e configurabile
 * Funzionalità: Nodi che si muovono e si collegano/scollegano
 *               in base alla distanza, senza effetti pulsanti
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // 🎛️ CONFIGURAZIONE PRINCIPALE
    // Modifica questi valori per personalizzare l'animazione
    // ========================================
    
    const USER_CONFIG = {
        // 📊 NODI
        NODE_COUNT: 50,                    // Numero di nodi (10-50)
        NODE_SIZE_MIN: 1,                  // Dimensione minima nodi (2-8)
        NODE_SIZE_MAX: 2,                  // Dimensione massima nodi (6-15)
        
        // 🎨 COLORI (formato esadecimale)
        NODE_COLOR: '#3b82f6',             // Colore nodi (blu)
        CONNECTION_COLOR: '#60a5fa',       // Colore connessioni (blu chiaro)
        
        // 🌫️ OPACITÀ (0.0 = trasparente, 1.0 = opaco)
        NODE_OPACITY: 0.8,                 // Opacità nodi (0.3-1.0)
        CONNECTION_OPACITY: 0.7,           // Opacità connessioni (0.2-1.0)
        
        // 📏 DISTANZE
        CONNECTION_DISTANCE: 400,          // Distanza massima per collegare nodi (100-300)
        SEPARATION_DISTANCE: 800,          // Distanza massima prima di separare (CONNECTION_DISTANCE + 30)
        
        // 🏃 MOVIMENTO
        NODE_SPEED: 0.2,                   // Velocità movimento nodi (0.1-2.0)
        MOVEMENT_RANDOMNESS: 0.01,         // Casualità movimento (0.005-0.05)
        
        // 📐 CONNESSIONI
        CONNECTION_LINE_WIDTH: 2,          // Spessore linee connessione (1-4)
        CONNECTION_FADE_SPEED: 0.95,       // Velocità dissolvenza (0.9-0.99)
        
        // 🎯 PERFORMANCE
        FPS_TARGET: 60,                    // FPS target (30-60)
        ENABLE_DEBUG: false                // Mostra info debug
    };

    // ========================================
    // CLASSE NODE (NODO SEMPLICE)
    // ========================================
    
    class SimpleNode {
        constructor(x, y, canvas) {
            this.x = x;
            this.y = y;
            this.canvas = canvas;
            
            // Dimensione fissa (no pulsazioni)
            this.size = USER_CONFIG.NODE_SIZE_MIN + 
                       Math.random() * (USER_CONFIG.NODE_SIZE_MAX - USER_CONFIG.NODE_SIZE_MIN);
            
            // Movimento casuale
            this.vx = (Math.random() - 0.5) * USER_CONFIG.NODE_SPEED;
            this.vy = (Math.random() - 0.5) * USER_CONFIG.NODE_SPEED;
            
            // Limiti di velocità
            this.maxSpeed = USER_CONFIG.NODE_SPEED;
            this.minSpeed = USER_CONFIG.NODE_SPEED * 0.3;
            
            // Connessioni a questo nodo
            this.connections = [];
            
            this.id = Math.random().toString(36).substr(2, 9);
        }
        
        update() {
            // Movimento base
            this.x += this.vx;
            this.y += this.vy;
            
            // Aggiungi casualità al movimento
            this.vx += (Math.random() - 0.5) * USER_CONFIG.MOVEMENT_RANDOMNESS;
            this.vy += (Math.random() - 0.5) * USER_CONFIG.MOVEMENT_RANDOMNESS;
            
            // Limita la velocità
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > this.maxSpeed) {
                this.vx = (this.vx / speed) * this.maxSpeed;
                this.vy = (this.vy / speed) * this.maxSpeed;
            } else if (speed < this.minSpeed) {
                this.vx = (this.vx / speed) * this.minSpeed;
                this.vy = (this.vy / speed) * this.minSpeed;
            }
            
            // Rimbalzi sui bordi
            this.handleBoundaries();
        }
        
        handleBoundaries() {
            const margin = this.size + 20;
            const width = this.canvas?.width / (window.devicePixelRatio || 1) || window.innerWidth;
            const height = this.canvas?.height / (window.devicePixelRatio || 1) || window.innerHeight;
            
            // Bordi orizzontali
            if (this.x <= margin) {
                this.x = margin;
                this.vx = Math.abs(this.vx);
            } else if (this.x >= width - margin) {
                this.x = width - margin;
                this.vx = -Math.abs(this.vx);
            }
            
            // Bordi verticali
            if (this.y <= margin) {
                this.y = margin;
                this.vy = Math.abs(this.vy);
            } else if (this.y >= height - margin) {
                this.y = height - margin;
                this.vy = -Math.abs(this.vy);
            }
        }
        
        getDistanceTo(otherNode) {
            const dx = this.x - otherNode.x;
            const dy = this.y - otherNode.y;
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        draw(ctx) {
            // Nodo semplice senza effetti
            const alpha = Math.floor(USER_CONFIG.NODE_OPACITY * 255).toString(16).padStart(2, '0');
            
            ctx.fillStyle = USER_CONFIG.NODE_COLOR + alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            
            // Bordo sottile per definizione
            ctx.strokeStyle = USER_CONFIG.NODE_COLOR + 'ff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    // ========================================
    // CLASSE CONNECTION (CONNESSIONE SEMPLICE)
    // ========================================
    
    class SimpleConnection {
        constructor(nodeA, nodeB) {
            this.nodeA = nodeA;
            this.nodeB = nodeB;
            this.opacity = 1.0;
            this.isActive = true;
            
            this.id = Math.random().toString(36).substr(2, 9);
        }
        
        update() {
            const distance = this.getDistance();
            
            // Connessione attiva se entro la distanza di connessione
            if (distance <= USER_CONFIG.CONNECTION_DISTANCE) {
                this.isActive = true;
                this.opacity = Math.min(1.0, this.opacity + 0.05);
            }
            // Inizia a dissolvere se supera la distanza di connessione
            else if (distance > USER_CONFIG.CONNECTION_DISTANCE) {
                this.opacity *= USER_CONFIG.CONNECTION_FADE_SPEED;
                if (this.opacity < 0.1) {
                    this.isActive = false;
                }
            }
            
            // Rimuovi se troppo lontano
            return distance <= USER_CONFIG.SEPARATION_DISTANCE && this.opacity > 0.05;
        }
        
        getDistance() {
            const dx = this.nodeA.x - this.nodeB.x;
            const dy = this.nodeA.y - this.nodeB.y;
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        draw(ctx) {
            if (!this.isActive || this.opacity < 0.05) return;
            
            // Calcola opacità basata su distanza e configurazione utente
            const distance = this.getDistance();
            const distanceAlpha = Math.max(0, 1 - (distance / USER_CONFIG.CONNECTION_DISTANCE));
            const finalAlpha = this.opacity * distanceAlpha * USER_CONFIG.CONNECTION_OPACITY;
            
            const alpha = Math.floor(finalAlpha * 255).toString(16).padStart(2, '0');
            
            ctx.strokeStyle = USER_CONFIG.CONNECTION_COLOR + alpha;
            ctx.lineWidth = USER_CONFIG.CONNECTION_LINE_WIDTH;
            ctx.beginPath();
            ctx.moveTo(this.nodeA.x, this.nodeA.y);
            ctx.lineTo(this.nodeB.x, this.nodeB.y);
            ctx.stroke();
        }
    }

    // ========================================
    // CLASSE PRINCIPALE NEURAL NETWORK
    // ========================================
    
    class SimplifiedNeuralNetwork {
        constructor(canvasId) {
            this.canvasId = canvasId;
            this.canvas = document.getElementById(canvasId);
            this.ctx = null;
            this.nodes = [];
            this.connections = [];
            this.animationId = null;
            this.isRunning = false;
            this.frameCount = 0;
            this.lastTime = 0;
            
            // Performance tracking
            this.fpsData = {
                fps: 0,
                lastFpsUpdate: 0,
                frameCount: 0
            };
            
            if (!this.canvas) {
                console.error(`[Simplified Neural Network] Canvas '${canvasId}' not found`);
                return;
            }
            
            this.init();
        }
        
        init() {
            console.log('[Simplified Neural Network] Initializing...');
            
            try {
                this.setupCanvas();
                this.createNodes();
                this.setupEventHandlers();
                this.start();
                
                console.log(`[Simplified Neural Network] ✅ Initialized with ${this.nodes.length} nodes`);
            } catch (error) {
                console.error('[Simplified Neural Network] Init failed:', error);
            }
        }
        
        setupCanvas() {
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        }
        
        resizeCanvas() {
            const rect = this.canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            
            const width = rect.width || window.innerWidth;
            const height = rect.height || window.innerHeight;
            
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            
            if (this.ctx) {
                this.ctx.scale(dpr, dpr);
            }
            
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';
        }
        
        createNodes() {
            this.nodes = [];
            
            const width = this.canvas.width / (window.devicePixelRatio || 1);
            const height = this.canvas.height / (window.devicePixelRatio || 1);
            
            for (let i = 0; i < USER_CONFIG.NODE_COUNT; i++) {
                const margin = 60;
                const x = margin + Math.random() * (width - margin * 2);
                const y = margin + Math.random() * (height - margin * 2);
                
                this.nodes.push(new SimpleNode(x, y, this.canvas));
            }
        }
        
        setupEventHandlers() {
            // Resize con debounce
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    this.resizeCanvas();
                    this.repositionNodes();
                }, 300);
            });
            
            // Pausa quando non visibile
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.pause();
                } else {
                    this.resume();
                }
            });
        }
        
        repositionNodes() {
            const width = this.canvas.width / (window.devicePixelRatio || 1);
            const height = this.canvas.height / (window.devicePixelRatio || 1);
            const margin = 60;
            
            this.nodes.forEach(node => {
                if (node.x > width - margin) {
                    node.x = width - margin;
                }
                if (node.y > height - margin) {
                    node.y = height - margin;
                }
            });
        }
        
        updateConnections() {
            // Mappa delle connessioni esistenti per performance
            const existingConnections = new Map();
            this.connections.forEach(conn => {
                const key = this.getConnectionKey(conn.nodeA, conn.nodeB);
                existingConnections.set(key, conn);
            });
            
            // Controlla tutte le possibili connessioni
            const newConnections = [];
            
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const nodeA = this.nodes[i];
                    const nodeB = this.nodes[j];
                    const distance = nodeA.getDistanceTo(nodeB);
                    const key = this.getConnectionKey(nodeA, nodeB);
                    
                    // Se i nodi sono abbastanza vicini
                    if (distance <= USER_CONFIG.SEPARATION_DISTANCE) {
                        let connection = existingConnections.get(key);
                        
                        if (!connection) {
                            // Crea nuova connessione
                            connection = new SimpleConnection(nodeA, nodeB);
                        }
                        
                        // Aggiorna la connessione
                        if (connection.update()) {
                            newConnections.push(connection);
                        }
                    }
                }
            }
            
            this.connections = newConnections;
        }
        
        getConnectionKey(nodeA, nodeB) {
            // Crea chiave univoca per la connessione (indipendente dall'ordine)
            return nodeA.id < nodeB.id ? `${nodeA.id}-${nodeB.id}` : `${nodeB.id}-${nodeA.id}`;
        }
        
        update(currentTime) {
            const deltaTime = currentTime - this.lastTime;
            this.lastTime = currentTime;
            this.frameCount++;
            
            // FPS tracking
            this.updateFPS(currentTime);
            
            // Aggiorna nodi
            this.nodes.forEach(node => node.update());
            
            // Aggiorna connessioni
            this.updateConnections();
        }
        
        updateFPS(currentTime) {
            this.fpsData.frameCount++;
            if (currentTime - this.fpsData.lastFpsUpdate > 1000) {
                this.fpsData.fps = this.fpsData.frameCount;
                this.fpsData.frameCount = 0;
                this.fpsData.lastFpsUpdate = currentTime;
            }
        }
        
        draw() {
            // Pulisci canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Disegna connessioni prima dei nodi
            this.connections.forEach(connection => connection.draw(this.ctx));
            
            // Disegna nodi
            this.nodes.forEach(node => node.draw(this.ctx));
            
            // Debug info
            if (USER_CONFIG.ENABLE_DEBUG) {
                this.drawDebugInfo();
            }
        }
        
        drawDebugInfo() {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            this.ctx.font = '14px monospace';
            this.ctx.fillText(`FPS: ${this.fpsData.fps}`, 15, 25);
            this.ctx.fillText(`Nodes: ${this.nodes.length}`, 15, 45);
            this.ctx.fillText(`Connections: ${this.connections.length}`, 15, 65);
            this.ctx.fillText(`Frame: ${this.frameCount}`, 15, 85);
        }
        
        animate(currentTime) {
            if (!this.isRunning) return;
            
            this.update(currentTime);
            this.draw();
            
            this.animationId = requestAnimationFrame((time) => this.animate(time));
        }
        
        start() {
            if (this.isRunning) return;
            
            this.isRunning = true;
            this.lastTime = performance.now();
            this.animate(this.lastTime);
            
            console.log('[Simplified Neural Network] ✅ Animation started');
        }
        
        stop() {
            if (!this.isRunning) return;
            
            this.isRunning = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            
            console.log('[Simplified Neural Network] Animation stopped');
        }
        
        pause() {
            if (this.isRunning) {
                this.stop();
                this._wasPausedBySystem = true;
            }
        }
        
        resume() {
            if (this._wasPausedBySystem) {
                this.start();
                this._wasPausedBySystem = false;
            }
        }
        
        destroy() {
            this.stop();
            this.nodes = [];
            this.connections = [];
            this.canvas = null;
            this.ctx = null;
            
            console.log('[Simplified Neural Network] Destroyed');
        }
        
        // ========================================
        // API PUBBLICA
        // ========================================
        
        updateConfig(newConfig) {
            // Aggiorna configurazione
            Object.assign(USER_CONFIG, newConfig);
            
            // Ricrea nodi se il numero è cambiato
            if (newConfig.NODE_COUNT && newConfig.NODE_COUNT !== this.nodes.length) {
                this.createNodes();
            }
            
            console.log('[Simplified Neural Network] Configuration updated:', newConfig);
        }
        
        getStats() {
            return {
                nodes: this.nodes.length,
                connections: this.connections.length,
                isRunning: this.isRunning,
                fps: this.fpsData.fps,
                frameCount: this.frameCount,
                config: { ...USER_CONFIG }
            };
        }
        
        getConfig() {
            return { ...USER_CONFIG };
        }
    }

    // ========================================
    // INIZIALIZZAZIONE E API GLOBALE
    // ========================================
    
    let networkInstance = null;
    
    function initializeSimplifiedNetwork() {
        const canvas = document.getElementById('network-canvas');
        if (!canvas) {
            console.warn('[Simplified Neural Network] Canvas not found, will retry...');
            return null;
        }
        
        try {
            if (networkInstance) {
                networkInstance.destroy();
            }
            
            networkInstance = new SimplifiedNeuralNetwork('network-canvas');
            return networkInstance;
        } catch (error) {
            console.error('[Simplified Neural Network] Init failed:', error);
            return null;
        }
    }
    
    // API globale semplificata
    window.SimplifiedNeuralNetwork = SimplifiedNeuralNetwork;
    window.TALON_NeuralNetwork = {
        // Controllo base
        init: initializeSimplifiedNetwork,
        start: () => networkInstance?.start(),
        stop: () => networkInstance?.stop(),
        destroy: () => {
            networkInstance?.destroy();
            networkInstance = null;
        },
        
        // Configurazione
        updateConfig: (config) => networkInstance?.updateConfig(config),
        getConfig: () => networkInstance?.getConfig() || USER_CONFIG,
        
        // Informazioni
        getStats: () => networkInstance?.getStats() || null,
        isRunning: () => networkInstance?.isRunning || false,
        getInstance: () => networkInstance,
        
        // Configurazione diretta
        config: USER_CONFIG
    };
    
    // Auto-inizializzazione con retry
    function attemptInit(attempts = 0) {
        if (attempts >= 5) {
            console.error('[Simplified Neural Network] Max init attempts reached');
            return;
        }
        
        const result = initializeSimplifiedNetwork();
        if (!result && attempts < 5) {
            setTimeout(() => attemptInit(attempts + 1), 100 * (attempts + 1));
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => attemptInit(), 100);
        });
    } else {
        setTimeout(() => attemptInit(), 100);
    }
    
    console.log('[Simplified Neural Network] 🧠 Module loaded - No pulses, just smooth connections');

})(window, document);