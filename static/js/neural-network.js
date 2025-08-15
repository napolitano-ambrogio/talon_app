/**
 * ========================================
 * TALON NEURAL NETWORK
 * File: static/js/neural-network.js
 * 
 * Versione: 5.1.0 - Standard Version
 * Descrizione: Neural network visuale
 * ========================================
 */

(function(window, document) {
    'use strict';

    // ========================================
    // CONFIGURAZIONE
    // ========================================
    
    const CONFIG = {
        // Configurazione nodi
        NODES: {
            COUNT: 150,
            SIZE_MIN: 1,
            SIZE_MAX: 2,
            COLOR: '#3b82f6',
            OPACITY: 0.8,
            SPEED: 0.2,
            RANDOMNESS: 0.01
        },
        
        // Configurazione connessioni
        CONNECTIONS: {
            COLOR: '#60a5fa',
            OPACITY: 0.7,
            LINE_WIDTH: 1,
            DISTANCE: 150,
            SEPARATION_DISTANCE: 180,
            FADE_SPEED: 0.95
        },
        
        // Performance
        PERFORMANCE: {
            FPS_TARGET: 60,
            AUTO_PAUSE: true,
            VISIBILITY_CHECK: true,
            CANVAS_RESOLUTION: window.devicePixelRatio || 1
        },
        
    };

    // ========================================
    // CLASSE NODE
    // ========================================
    
    class Node {
        constructor(x, y, canvas) {
            this.id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            this.x = x;
            this.y = y;
            this.canvas = canvas;
            
            // Proprietà fisiche
            this.size = CONFIG.NODES.SIZE_MIN + 
                       Math.random() * (CONFIG.NODES.SIZE_MAX - CONFIG.NODES.SIZE_MIN);
            this.vx = (Math.random() - 0.5) * CONFIG.NODES.SPEED;
            this.vy = (Math.random() - 0.5) * CONFIG.NODES.SPEED;
            
            // Limiti velocità
            this.maxSpeed = CONFIG.NODES.SPEED;
            this.minSpeed = CONFIG.NODES.SPEED * 0.3;
            
            // Stato
            this.connections = new Set();
            this.isActive = true;
        }
        
        update(deltaTime) {
            if (!this.isActive) return;
            
            // Aggiorna posizione basata su deltaTime per FPS indipendente
            const factor = deltaTime / 16.67; // Normalizza a 60 FPS
            
            this.x += this.vx * factor;
            this.y += this.vy * factor;
            
            // Aggiungi casualità
            this.vx += (Math.random() - 0.5) * CONFIG.NODES.RANDOMNESS * factor;
            this.vy += (Math.random() - 0.5) * CONFIG.NODES.RANDOMNESS * factor;
            
            // Limita velocità
            this.limitSpeed();
            
            // Gestisci bordi
            this.handleBoundaries();
        }
        
        limitSpeed() {
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            
            if (speed > this.maxSpeed) {
                const ratio = this.maxSpeed / speed;
                this.vx *= ratio;
                this.vy *= ratio;
            } else if (speed < this.minSpeed && speed > 0) {
                const ratio = this.minSpeed / speed;
                this.vx *= ratio;
                this.vy *= ratio;
            }
        }
        
        handleBoundaries() {
            const margin = this.size + 10;
            const width = this.canvas.width / CONFIG.PERFORMANCE.CANVAS_RESOLUTION;
            const height = this.canvas.height / CONFIG.PERFORMANCE.CANVAS_RESOLUTION;
            
            if (this.x <= margin || this.x >= width - margin) {
                this.vx = -this.vx;
                this.x = Math.max(margin, Math.min(width - margin, this.x));
            }
            
            if (this.y <= margin || this.y >= height - margin) {
                this.vy = -this.vy;
                this.y = Math.max(margin, Math.min(height - margin, this.y));
            }
        }
        
        distanceTo(other) {
            const dx = this.x - other.x;
            const dy = this.y - other.y;
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        draw(ctx) {
            if (!this.isActive) return;
            
            ctx.save();
            
            // Nodo principale
            ctx.fillStyle = CONFIG.NODES.COLOR + Math.floor(CONFIG.NODES.OPACITY * 255).toString(16).padStart(2, '0');
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            
            // Bordo sottile
            ctx.strokeStyle = CONFIG.NODES.COLOR;
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.restore();
        }
        
        destroy() {
            this.isActive = false;
            this.connections.clear();
        }
    }

    // ========================================
    // CLASSE CONNECTION
    // ========================================
    
    class Connection {
        constructor(nodeA, nodeB) {
            this.id = `conn-${nodeA.id}-${nodeB.id}`;
            this.nodeA = nodeA;
            this.nodeB = nodeB;
            this.opacity = 0;
            this.targetOpacity = 1;
            this.isActive = true;
        }
        
        update(deltaTime) {
            if (!this.isActive) return false;
            
            const distance = this.nodeA.distanceTo(this.nodeB);
            
            // Calcola opacità target basata su distanza
            if (distance <= CONFIG.CONNECTIONS.DISTANCE) {
                this.targetOpacity = 1 - (distance / CONFIG.CONNECTIONS.DISTANCE) * 0.7;
            } else if (distance <= CONFIG.CONNECTIONS.SEPARATION_DISTANCE) {
                this.targetOpacity = (1 - (distance - CONFIG.CONNECTIONS.DISTANCE) / 
                    (CONFIG.CONNECTIONS.SEPARATION_DISTANCE - CONFIG.CONNECTIONS.DISTANCE)) * 0.3;
            } else {
                this.targetOpacity = 0;
            }
            
            // Smooth opacity transition
            const opacityDiff = this.targetOpacity - this.opacity;
            this.opacity += opacityDiff * 0.1;
            
            // Rimuovi se troppo lontano o opacità troppo bassa
            if (distance > CONFIG.CONNECTIONS.SEPARATION_DISTANCE || this.opacity < 0.01) {
                this.isActive = false;
                return false;
            }
            
            return true;
        }
        
        draw(ctx) {
            if (!this.isActive || this.opacity < 0.01) return;
            
            ctx.save();
            
            const alpha = Math.floor(this.opacity * CONFIG.CONNECTIONS.OPACITY * 255)
                .toString(16).padStart(2, '0');
            
            ctx.strokeStyle = CONFIG.CONNECTIONS.COLOR + alpha;
            ctx.lineWidth = CONFIG.CONNECTIONS.LINE_WIDTH;
            ctx.beginPath();
            ctx.moveTo(this.nodeA.x, this.nodeA.y);
            ctx.lineTo(this.nodeB.x, this.nodeB.y);
            ctx.stroke();
            
            ctx.restore();
        }
        
        destroy() {
            this.isActive = false;
        }
    }

    // ========================================
    // CLASSE PRINCIPALE NEURAL NETWORK
    // ========================================
    
    class NeuralNetwork {
        constructor(canvasId) {
            this.canvasId = canvasId;
            this.canvas = null;
            this.ctx = null;
            this.nodes = [];
            this.connections = new Map();
            
            // Stato
            this.state = {
                initialized: false,
                running: false,
                visible: true,
                paused: false
            };
            
            // Performance
            this.performance = {
                fps: 0,
                frameCount: 0,
                lastTime: 0,
                lastFpsUpdate: 0,
                deltaTime: 0
            };
            
            // Animation
            this.animationId = null;
            this.resizeTimeout = null;
            
            // Event handlers
            this.boundHandlers = {
                resize: this.handleResize.bind(this),
                visibilityChange: this.handleVisibilityChange.bind(this)
            };
        }

        // ========================================
        // INIZIALIZZAZIONE
        // ========================================
        
        async init() {
            if (this.state.initialized) {
                this.log('warn', 'Already initialized');
                return false;
            }
            
            this.log('info', 'Initializing Neural Network...');
            
            try {
                // Trova canvas
                this.canvas = document.getElementById(this.canvasId);
                if (!this.canvas) {
                    throw new Error(`Canvas '${this.canvasId}' not found`);
                }
                
                // Setup canvas
                this.setupCanvas();
                
                // Crea nodi
                this.createNodes();
                
                // Setup event handlers
                this.setupEventHandlers();
                
                // Start animation
                this.start();
                
                this.state.initialized = true;
                this.log('success', `✅ Initialized with ${this.nodes.length} nodes`);
                
                return true;
                
            } catch (error) {
                this.log('error', 'Initialization failed:', error);
                return false;
            }
        }

        setupCanvas() {
            this.ctx = this.canvas.getContext('2d', {
                alpha: true,
                desynchronized: true
            });
            
            this.resizeCanvas();
            
            // Ottimizzazioni rendering
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        }

        resizeCanvas() {
            const rect = this.canvas.getBoundingClientRect();
            const dpr = CONFIG.PERFORMANCE.CANVAS_RESOLUTION;
            
            const width = rect.width || window.innerWidth;
            const height = rect.height || window.innerHeight;
            
            // Imposta dimensioni con device pixel ratio
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            
            // Scala il context
            this.ctx.scale(dpr, dpr);
            
            // Mantieni dimensioni CSS
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';
            
            this.log('debug', `Canvas resized: ${width}x${height} (DPR: ${dpr})`);
        }

        createNodes() {
            this.nodes = [];
            
            const width = this.canvas.width / CONFIG.PERFORMANCE.CANVAS_RESOLUTION;
            const height = this.canvas.height / CONFIG.PERFORMANCE.CANVAS_RESOLUTION;
            const margin = 50;
            
            for (let i = 0; i < CONFIG.NODES.COUNT; i++) {
                const x = margin + Math.random() * (width - margin * 2);
                const y = margin + Math.random() * (height - margin * 2);
                
                this.nodes.push(new Node(x, y, this.canvas));
            }
        }

        // ========================================
        // EVENT HANDLERS
        // ========================================
        
        setupEventHandlers() {
            // Window events
            window.addEventListener('resize', this.boundHandlers.resize);
            document.addEventListener('visibilitychange', this.boundHandlers.visibilityChange);
        }

        removeEventHandlers() {
            window.removeEventListener('resize', this.boundHandlers.resize);
            document.removeEventListener('visibilitychange', this.boundHandlers.visibilityChange);
        }

        handleResize() {
            clearTimeout(this.resizeTimeout);
            
            this.resizeTimeout = setTimeout(() => {
                if (!this.state.initialized) return;
                
                this.resizeCanvas();
                
                this.repositionNodes();
            }, 300);
        }

        handleVisibilityChange() {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        }

        repositionNodes() {
            const width = this.canvas.width / CONFIG.PERFORMANCE.CANVAS_RESOLUTION;
            const height = this.canvas.height / CONFIG.PERFORMANCE.CANVAS_RESOLUTION;
            const margin = 50;
            
            this.nodes.forEach(node => {
                node.x = Math.max(margin, Math.min(width - margin, node.x));
                node.y = Math.max(margin, Math.min(height - margin, node.y));
            });
        }

        // ========================================
        // ANIMATION LOOP
        // ========================================
        
        start() {
            if (this.state.running) return;
            
            this.state.running = true;
            this.state.paused = false;
            this.performance.lastTime = performance.now();
            
            this.animate();
            
            this.log('info', '▶️ Animation started');
        }

        stop() {
            if (!this.state.running) return;
            
            this.state.running = false;
            
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            
            this.log('info', '⏹️ Animation stopped');
        }

        pause() {
            if (!this.state.running || this.state.paused) return;
            
            this.state.paused = true;
            this.log('info', '⏸️ Animation paused');
        }

        resume() {
            if (!this.state.running || !this.state.paused) return;
            
            this.state.paused = false;
            this.performance.lastTime = performance.now();
            this.animate();
            
            this.log('info', '▶️ Animation resumed');
        }

        animate(currentTime = performance.now()) {
            if (!this.state.running || this.state.paused) return;
            
            // Calculate delta time
            this.performance.deltaTime = currentTime - this.performance.lastTime;
            this.performance.lastTime = currentTime;
            
            // Skip frame if delta is too large (tab was hidden)
            if (this.performance.deltaTime > 100) {
                this.performance.deltaTime = 16.67;
            }
            
            // Update
            this.update();
            
            // Draw
            this.draw();
            
            // Update FPS
            this.updateFPS(currentTime);
            
            // Next frame
            this.animationId = requestAnimationFrame((time) => this.animate(time));
        }

        update() {
            // Update nodes
            this.nodes.forEach(node => {
                node.update(this.performance.deltaTime);
            });
            
            // Update connections
            this.updateConnections();
        }

        updateConnections() {
            // Crea mappa per lookup veloce
            const connectionMap = new Map();
            
            // Check tutte le possibili connessioni
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const nodeA = this.nodes[i];
                    const nodeB = this.nodes[j];
                    const distance = nodeA.distanceTo(nodeB);
                    
                    if (distance <= CONFIG.CONNECTIONS.SEPARATION_DISTANCE) {
                        const key = `${nodeA.id}-${nodeB.id}`;
                        
                        let connection = this.connections.get(key);
                        
                        if (!connection) {
                            connection = new Connection(nodeA, nodeB);
                            this.connections.set(key, connection);
                        }
                        
                        if (connection.update(this.performance.deltaTime)) {
                            connectionMap.set(key, connection);
                        }
                    }
                }
            }
            
            // Sostituisci vecchie connessioni con quelle aggiornate
            this.connections = connectionMap;
        }

        draw() {
            // Clear canvas
            this.ctx.clearRect(0, 0, 
                this.canvas.width / CONFIG.PERFORMANCE.CANVAS_RESOLUTION,
                this.canvas.height / CONFIG.PERFORMANCE.CANVAS_RESOLUTION);
            
            // Draw connections first (behind nodes)
            this.connections.forEach(connection => {
                connection.draw(this.ctx);
            });
            
            // Draw nodes
            this.nodes.forEach(node => {
                node.draw(this.ctx);
            });
            
        }

        drawDebugInfo() {
            this.ctx.save();
            
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(10, 10, 200, 80);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px monospace';
            this.ctx.fillText(`FPS: ${this.performance.fps}`, 20, 30);
            this.ctx.fillText(`Nodes: ${this.nodes.length}`, 20, 45);
            this.ctx.fillText(`Connections: ${this.connections.size}`, 20, 60);
            this.ctx.fillText(`Delta: ${this.performance.deltaTime.toFixed(2)}ms`, 20, 75);
            
            this.ctx.restore();
        }

        updateFPS(currentTime) {
            this.performance.frameCount++;
            
            if (currentTime - this.performance.lastFpsUpdate >= 1000) {
                this.performance.fps = this.performance.frameCount;
                this.performance.frameCount = 0;
                this.performance.lastFpsUpdate = currentTime;
            }
        }

        // ========================================
        // PUBLIC API
        // ========================================
        
        destroy() {
            this.log('info', 'Destroying Neural Network...');
            
            // Stop animation
            this.stop();
            
            // Remove event handlers
            this.removeEventHandlers();
            
            // Clear timeouts
            clearTimeout(this.resizeTimeout);
            
            // Destroy nodes and connections
            this.nodes.forEach(node => node.destroy());
            this.connections.forEach(conn => conn.destroy());
            
            // Clear arrays
            this.nodes = [];
            this.connections.clear();
            
            // Clear canvas
            if (this.ctx) {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
            
            // Reset state
            this.state.initialized = false;
            this.canvas = null;
            this.ctx = null;
            
            this.log('success', '✅ Neural Network destroyed');
        }

        updateConfig(newConfig) {
            Object.keys(newConfig).forEach(key => {
                if (CONFIG.hasOwnProperty(key)) {
                    Object.assign(CONFIG[key], newConfig[key]);
                }
            });
            
            // Re-create nodes if count changed
            if (newConfig.NODES && newConfig.NODES.COUNT) {
                this.createNodes();
                this.connections.clear();
            }
            
            this.log('info', 'Configuration updated');
        }

        getStats() {
            return {
                running: this.state.running,
                paused: this.state.paused,
                fps: this.performance.fps,
                nodes: this.nodes.length,
                connections: this.connections.size,
                deltaTime: this.performance.deltaTime
            };
        }


        log(level, ...args) {
            // Console logging removed for production silence
        }
    }

    // ========================================
    // GESTIONE ISTANZA GLOBALE
    // ========================================
    
    class NeuralNetworkManager {
        constructor() {
            this.instances = new Map();
            this.initialized = false;
            
            // Auto-init al DOM ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                this.init();
            }
        }

        async init() {
            if (this.initialized) return;
            
            
            // Cerca e inizializza canvas esistenti
            await this.autoDetectCanvas();
            
            this.initialized = true;
        }


        async autoDetectCanvas() {
            // Cerca canvas con ID standard
            const canvasIds = ['network-canvas', 'neural-canvas', 'background-canvas'];
            
            for (const id of canvasIds) {
                const canvas = document.getElementById(id);
                if (canvas && !this.instances.has(id)) {
                    await this.create(id);
                }
            }
        }

        async create(canvasId) {
            // Distruggi istanza esistente se presente
            if (this.instances.has(canvasId)) {
                this.destroy(canvasId);
            }
            
            const network = new NeuralNetwork(canvasId);
            const success = await network.init();
            
            if (success) {
                this.instances.set(canvasId, network);
                }
            
            return network;
        }

        get(canvasId) {
            return this.instances.get(canvasId);
        }

        destroy(canvasId) {
            const network = this.instances.get(canvasId);
            if (network) {
                network.destroy();
                this.instances.delete(canvasId);
                }
        }

        destroyAll() {
            this.instances.forEach(network => network.destroy());
            this.instances.clear();
        }

        getAll() {
            return Array.from(this.instances.values());
        }

        pauseAll() {
            this.instances.forEach(network => network.pause());
        }

        resumeAll() {
            this.instances.forEach(network => network.resume());
        }
    }

    // ========================================
    // EXPORT & INIZIALIZZAZIONE
    // ========================================
    
    // Crea manager singleton
    const manager = new NeuralNetworkManager();
    
    // API Globale
    window.TalonNeuralNetwork = {
        // Manager methods
        create: (canvasId) => manager.create(canvasId),
        get: (canvasId) => manager.get(canvasId),
        destroy: (canvasId) => manager.destroy(canvasId),
        destroyAll: () => manager.destroyAll(),
        getAll: () => manager.getAll(),
        pauseAll: () => manager.pauseAll(),
        resumeAll: () => manager.resumeAll(),
        
        // Direct class access
        NeuralNetwork: NeuralNetwork,
        Node: Node,
        Connection: Connection,
        
        // Configuration
        getConfig: () => ({ ...CONFIG }),
        updateConfig: (newConfig) => {
            Object.assign(CONFIG, newConfig);
            manager.getAll().forEach(network => network.updateConfig(newConfig));
        },
        
        // Info
        version: '5.1.0',
        isInitialized: () => manager.initialized
    };
    
    // Alias for backward compatibility
    window.TALON_NeuralNetwork = window.TalonNeuralNetwork;
    

})(window, document);