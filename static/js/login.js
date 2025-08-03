/**
 * TALON LOGIN FORM HANDLER
 * File: static/js/login.js
 * 
 * Gestisce SOLO la logica del form di login
 * Neural Network gestita da neural-network.js
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('[TALON Login] Sistema di login inizializzato');
    
    // Elementi del DOM
    const form = document.getElementById('loginForm');
    const btn = document.getElementById('loginBtn');
    const inputs = document.querySelectorAll('input');
    
    // ========================================
    // GESTIONE SUBMIT FORM
    // ========================================
    
    form.addEventListener('submit', function(e) {
        // Disabilita il pulsante e mostra loading
        btn.disabled = true;
        btn.classList.add('loading');
        btn.textContent = 'ACCESSO IN CORSO...';
        
        console.log('[TALON Login] Invio credenziali in corso...');
        
        // Timeout di sicurezza - riabilita dopo 5 secondi se non redirect
        setTimeout(() => {
            if (btn.disabled) {
                btn.disabled = false;
                btn.classList.remove('loading');
                btn.textContent = 'ACCEDI';
                console.log('[TALON Login] Timeout - pulsante riabilitato');
            }
        }, 5000);
    });
    
    // ========================================
    // GESTIONE INPUT FIELDS
    // ========================================
    
    inputs.forEach(input => {
        // Effetto focus migliorato
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
            console.log(`[TALON Login] Focus su campo: ${this.name}`);
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.classList.remove('focused');
        });
        
        // Validazione in tempo reale
        input.addEventListener('input', function() {
            if (this.value.trim() !== '') {
                this.classList.add('has-content');
            } else {
                this.classList.remove('has-content');
            }
            
            // Validazione username (solo lettere e numeri)
            if (this.name === 'username') {
                const isValid = /^[a-zA-Z0-9_.-]*$/.test(this.value);
                if (!isValid && this.value.length > 0) {
                    this.style.borderColor = '#ef4444';
                } else {
                    this.style.borderColor = '';
                }
            }
        });
        
        // Rimuovi spazi iniziali e finali
        input.addEventListener('blur', function() {
            this.value = this.value.trim();
        });
    });
    
    // ========================================
    // GESTIONE KEYBOARD
    // ========================================
    
    // Gestione tasto Enter
    form.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            // Verifica che tutti i campi required siano compilati
            const requiredInputs = form.querySelectorAll('input[required]');
            let allValid = true;
            
            requiredInputs.forEach(input => {
                if (!input.value.trim()) {
                    allValid = false;
                    input.focus();
                    input.style.borderColor = '#ef4444';
                    setTimeout(() => {
                        input.style.borderColor = '';
                    }, 2000);
                }
            });
            
            if (allValid) {
                form.requestSubmit();
            }
        }
    });
    
    // Navigazione tra campi con Tab
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                // Comportamento tab normale, ma logga per debug
                console.log(`[TALON Login] Tab navigation: ${this.name} -> ${inputs[index + 1]?.name || 'submit'}`);
            }
        });
    });
    
    // ========================================
    // GESTIONE ERRORI E CONNESSIONE
    // ========================================
    
    // Gestione stato connessione
    window.addEventListener('online', function() {
        console.log('[TALON Login] ✅ Connessione ripristinata');
        
        // Riabilita form se era disabilitato
        if (btn.disabled && !btn.classList.contains('loading')) {
            btn.disabled = false;
            btn.textContent = 'ACCEDI';
        }
        
        // Rimuovi eventuali messaggi di errore di rete
        const networkErrors = document.querySelectorAll('.alert-network-error');
        networkErrors.forEach(alert => alert.remove());
    });
    
    window.addEventListener('offline', function() {
        console.log('[TALON Login] ❌ Connessione persa');
        
        // Disabilita form temporaneamente
        if (btn.classList.contains('loading')) {
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.textContent = 'CONNESSIONE PERSA';
            
            // Mostra messaggio di errore
            showNetworkError('Connessione Internet persa. Controlla la tua connessione.');
        }
    });
    
    // ========================================
    // FUNZIONI HELPER
    // ========================================
    
    function showNetworkError(message) {
        // Rimuovi errori esistenti
        const existingErrors = document.querySelectorAll('.alert-network-error');
        existingErrors.forEach(alert => alert.remove());
        
        // Crea nuovo alert
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-error alert-network-error';
        alertDiv.textContent = message;
        
        // Inserisci prima del form
        const flashContainer = document.querySelector('.flash-messages') || 
                              form.parentNode.insertBefore(document.createElement('div'), form);
        if (!flashContainer.classList.contains('flash-messages')) {
            flashContainer.className = 'flash-messages';
        }
        
        flashContainer.appendChild(alertDiv);
        
        // Rimuovi automaticamente dopo 5 secondi
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }
    
    // Validazione form completa
    function validateForm() {
        let isValid = true;
        const errors = [];
        
        // Controlla username
        const username = document.getElementById('username').value.trim();
        if (!username) {
            errors.push('Username è obbligatorio');
            isValid = false;
        } else if (username.length < 3) {
            errors.push('Username deve essere almeno 3 caratteri');
            isValid = false;
        } else if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
            errors.push('Username può contenere solo lettere, numeri, punti, trattini e underscore');
            isValid = false;
        }
        
        // Controlla password
        const password = document.getElementById('password').value;
        if (!password) {
            errors.push('Password è obbligatoria');
            isValid = false;
        } else if (password.length < 4) {
            errors.push('Password deve essere almeno 4 caratteri');
            isValid = false;
        }
        
        // Mostra errori se presenti
        if (!isValid) {
            console.log('[TALON Login] Errori validazione:', errors);
            // Potresti mostrare gli errori nell'UI se necessario
        }
        
        return isValid;
    }
    
    // ========================================
    // MIGLIORAMENTI UX
    // ========================================
    
    // Auto-focus sul primo campo vuoto all'avvio
    setTimeout(() => {
        const firstEmptyInput = Array.from(inputs).find(input => !input.value.trim());
        if (firstEmptyInput) {
            firstEmptyInput.focus();
        }
    }, 500);
    
    // Shake animation per errori
    function shakeElement(element) {
        element.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }
    
    // CSS per shake animation (se non presente)
    if (!document.querySelector('#shake-animation-css')) {
        const style = document.createElement('style');
        style.id = 'shake-animation-css';
        style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // ========================================
    // INTERAZIONE CON NEURAL NETWORK (OPZIONALE)
    // ========================================
    
    // Controllo se neural network è disponibile e reattiva
    setTimeout(() => {
        if (window.TALON_NeuralNetwork && window.TALON_NeuralNetwork.isRunning()) {
            console.log('[TALON Login] ✅ Neural Network attiva');
            
            // Effetti opzionali su interazione form
            inputs.forEach(input => {
                input.addEventListener('focus', () => {
                    // Piccolo boost di attività quando user interagisce
                    if (window.TALON_NeuralNetwork.activateNodes) {
                        window.TALON_NeuralNetwork.activateNodes(2);
                    }
                });
            });
            
            // Effetto speciale durante il submit
            form.addEventListener('submit', () => {
                if (window.TALON_NeuralNetwork.activateNodes) {
                    window.TALON_NeuralNetwork.activateNodes(5);
                }
            });
            
        } else {
            console.log('[TALON Login] ⚠️ Neural Network non disponibile');
        }
    }, 1000);
    
    // ========================================
    // DEBUG E SVILUPPO
    // ========================================
    
    // Debug mode (solo se localStorage debug attivo)
    if (localStorage.getItem('talonDebugMode') === 'true') {
        console.log('[TALON Login] 🐛 Debug mode attivo');
        
        // Esponi funzioni utili per debug
        window.TalonLoginDebug = {
            validateForm: validateForm,
            shakeForm: () => shakeElement(form),
            simulateSubmit: () => form.requestSubmit(),
            fillTestData: () => {
                document.getElementById('username').value = 'admin';
                document.getElementById('password').value = 'admin';
                console.log('Test data inserted');
            }
        };
        
        console.log('[TALON Login] Debug commands available:', Object.keys(window.TalonLoginDebug));
    }
    
    console.log('[TALON Login] ✅ Inizializzazione completata');
});