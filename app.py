# app.py - Versione aggiornata con modulo auth.py e sessioni web
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify, render_template, redirect, session
import sqlite3
import hashlib
import datetime
from waitress import serve

# Importa il modulo di autenticazione
from auth import (
    login_required, permission_required, entity_access_required,
    get_user_by_username, get_user_permissions, get_user_accessible_entities,
    log_user_action, get_current_user_info
)

# Importa i blueprint esistenti
from routes.main import main_bp
from routes.enti_militari import enti_militari_bp
from routes.enti_civili import enti_civili_bp
from routes.operazioni import operazioni_bp
from routes.attivita import attivita_bp

# Configurazione
DATABASE = 'talon_data.db'  # Aggiorna se necessario

def create_app():
    app = Flask(
        __name__,
        template_folder='templates',
        static_folder='static'
    )
    
    app.config['SECRET_KEY'] = 'talon-secret-key-change-this-in-production'
    app.config['user_sessions'] = {}  # Sessioni in memoria per token API
    app.config['SESSION_PERMANENT'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(hours=24)
    app.config['SESSION_COOKIE_SECURE'] = False  # Per sviluppo locale
    app.config['SESSION_COOKIE_HTTPONLY'] = True

    # ===========================================
    # FUNZIONI DATABASE SEMPLIFICATE
    # ===========================================

    def get_db_connection():
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        return conn

    def simple_password_check(stored_hash: str, password: str) -> bool:
        """Verifica password semplice (solo per test)"""
        if password == 'admin123':
            return True
        return stored_hash == hashlib.md5(password.encode()).hexdigest()

    def create_simple_session(user_data: dict) -> str:
        """Crea una sessione semplice"""
        import time
        import random
        token = f"talon_{user_data['id']}_{int(time.time())}_{random.randint(1000,9999)}"
        
        app.config['user_sessions'][token] = {
            'user_id': user_data['id'],
            'username': user_data['username'],
            'created': datetime.datetime.now(),
            'expires': datetime.datetime.now() + datetime.timedelta(hours=24)
        }
        return token

    # ===========================================
    # ROUTE DI AUTENTICAZIONE
    # ===========================================

    @app.route('/components/login')
    def login_component():
        """Pagina di login"""
        return render_template('components/login.html')
    
    @app.route('/login-web', methods=['GET', 'POST'])
    def login_web():
        """Login web tradizionale (non API) per test"""
        if request.method == 'GET':
            return render_template('login_web.html')
        
        # POST - Processare login
        username = request.form.get('username')
        password = request.form.get('password')
        
        if not username or not password:
            return render_template('login_web.html', error='Username e password richiesti')
        
        user = get_user_by_username(username)
        if not user or not simple_password_check(user.get('password_hash', ''), password):
            return render_template('login_web.html', error='Credenziali non valide')
        
        # Salva nella sessione Flask
        session.clear()
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['logged_in'] = True
        session.permanent = True
        
        print(f"DEBUG: Web login successful for {username}")
        print(f"DEBUG: Session: {dict(session)}")
        
        # Log del login
        log_user_action(user['id'], 'WEB_LOGIN', ip_address=request.remote_addr)
        
        return redirect('/attivita')

    @app.route('/api/auth/login', methods=['POST'])
    def login():
        """Endpoint di login con supporto sessioni web"""
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username e password richiesti'}), 400
        
        user = get_user_by_username(username)
        if not user:
            return jsonify({'error': 'Credenziali non valide'}), 401
        
        if not simple_password_check(user.get('password_hash', ''), password):
            return jsonify({'error': 'Credenziali non valide'}), 401
        
        # Crea sessione token (per API)
        token = create_simple_session(user)
        
        # *** IMPORTANTE: Salva anche nella sessione Flask (per pagine web) ***
        session.clear()  # Pulisci eventuali sessioni precedenti
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['logged_in'] = True
        session.permanent = True  # Rende la sessione permanente
        
        # Forza il salvataggio della sessione
        session.modified = True
        
        print(f"DEBUG: Login successful for {username}")
        print(f"DEBUG: Flask session creata: {dict(session)}")
        print(f"DEBUG: Session modified: {session.modified}")
        print(f"DEBUG: Token creato: {token}")
        
        # Aggiorna ultimo accesso
        conn = get_db_connection()
        try:
            conn.execute(
                'UPDATE utenti SET ultimo_accesso = datetime("now") WHERE id = ?',
                (user['id'],)
            )
            conn.commit()
        except sqlite3.OperationalError:
            pass
        conn.close()
        
        log_user_action(user['id'], 'LOGIN', ip_address=request.remote_addr)
        
        permissions = get_user_permissions(user['id'])
        accessible_entities = get_user_accessible_entities(user['id'])
        
        response_data = {
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'nome': user['nome'],
                'cognome': user['cognome'],
                'grado': user['grado'],
                'ruolo': user['ruolo_nome'],
                'ente_appartenenza': user['ente_nome']
            },
            'permissions': permissions,
            'accessible_entities': accessible_entities
        }
        
        # Crea risposta standard
        response = jsonify(response_data)
        
        return response

    @app.route('/api/auth/me', methods=['GET'])
    @login_required
    def get_current_user():
        """Informazioni utente corrente"""
        user = get_current_user_info()
        permissions = get_user_permissions(request.current_user['user_id'])
        accessible_entities = get_user_accessible_entities(request.current_user['user_id'])
        
        return jsonify({
            'user': {
                'id': user['id'],
                'username': user['username'],
                'nome': user['nome'],
                'cognome': user['cognome'],
                'grado': user['grado'],
                'ruolo': user['ruolo_nome'],
                'ente_appartenenza': user['ente_nome']
            },
            'permissions': permissions,
            'accessible_entities': accessible_entities
        })

    @app.route('/api/auth/logout', methods=['POST'])
    @login_required
    def logout():
        """Logout"""
        # Pulisci token API
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        sessions = app.config.get('user_sessions', {})
        if token in sessions:
            del sessions[token]
        
        # *** IMPORTANTE: Pulisci anche la sessione Flask ***
        user_id = session.get('user_id')
        session.clear()
        
        print(f"DEBUG: Logout effettuato, sessione pulita")
        
        if user_id:
            log_user_action(user_id, 'LOGOUT', ip_address=request.remote_addr)
        
        return jsonify({'message': 'Logout effettuato'})

    # ===========================================
    # ROUTE DASHBOARD
    # ===========================================

    @app.route('/dashboard')
    def dashboard():
        """Dashboard principale (senza protezione per ora)"""
        return render_template('dashboard.html')

    @app.route('/')
    def index():
        """Redirect da root a dashboard"""
        return redirect('/dashboard')

    # ===========================================
    # ROUTE DI DEBUG (TEMPORANEE)
    # ===========================================
    
    @app.route('/debug/session')
    def debug_session():
        """Route di debug per verificare la sessione"""
        return jsonify({
            'flask_session': dict(session),
            'has_user_id': 'user_id' in session,
            'user_id': session.get('user_id'),
            'username': session.get('username'),
            'logged_in': session.get('logged_in')
        })
    
    @app.route('/quick-login')
    def quick_login():
        """Login rapido per test - DA RIMUOVERE IN PRODUZIONE"""
        user = get_user_by_username('admin')
        if user:
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['logged_in'] = True
            session.permanent = True
            
            print(f"DEBUG: Quick login effettuato")
            print(f"DEBUG: Session dopo quick login: {dict(session)}")
            
            return redirect('/attivita')
        else:
            return "Utente admin non trovato", 404

    # ===========================================
    # GESTIONE ERRORI
    # ===========================================

    @app.errorhandler(401)
    def unauthorized(error):
        print(f"DEBUG: 401 error per {request.path}")
        print(f"DEBUG: Sessione corrente: {dict(session)}")
        
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Non autenticato'}), 401
        return redirect('/components/login')

    @app.errorhandler(403)
    def forbidden(error):
        print(f"DEBUG: 403 error per {request.path}")
        
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Accesso negato'}), 403
        return render_template('errors/403.html'), 403

    # ===========================================
    # REGISTRAZIONE BLUEPRINT
    # ===========================================

    app.register_blueprint(main_bp)
    app.register_blueprint(enti_militari_bp)
    app.register_blueprint(enti_civili_bp)
    app.register_blueprint(operazioni_bp)
    app.register_blueprint(attivita_bp)

    return app

if __name__ == '__main__':
    app = create_app()
    
    print("=== TALON AUTENTICAZIONE ===")
    print("Credenziali di test:")
    print("Username: admin")
    print("Password: admin123")
    print("============================")
    print("DEBUG: Avvio server con gestione sessioni web")
    
    serve(app, host='0.0.0.0', port=5000, threads=16)