# app.py - Versione ottimizzata con sistema auth a 3 ruoli + SSO Superset
import sys
import os

# FORZA DEBUG MODE PER SVILUPPO
os.environ['FLASK_ENV'] = 'development'
os.environ['FLASK_DEBUG'] = '1'

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify, render_template, redirect, session, flash, url_for, Response
import sqlite3
import hashlib
import datetime
from waitress import serve

# Importa il modulo SSO
try:
    from sso_superset import (
        generate_superset_token, 
        get_superset_sso_url,
        inject_sso_token_in_response,
        verify_superset_token
    )
    SSO_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Modulo SSO non disponibile: {e}")
    SSO_AVAILABLE = False

# Importa il modulo di autenticazione
from auth import (
    login_required, permission_required, entity_access_required,
    get_user_by_username, get_user_permissions, get_user_accessible_entities,
    log_user_action, get_current_user_info, setup_auth_context_processor,
    admin_required, operatore_or_admin_required, is_admin, is_operatore_or_above,
    get_user_role, update_session_with_role_info, validate_user_role_consistency,
    debug_user_permissions, get_system_auth_stats, ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)

# Importa i blueprint esistenti
from routes.main import main_bp
from routes.enti_militari import enti_militari_bp
from routes.enti_civili import enti_civili_bp
from routes.operazioni import operazioni_bp
from routes.attivita import attivita_bp

# Configurazione
DATABASE = 'talon_data.db'

def create_app():
    app = Flask(
        __name__,
        template_folder='templates',
        static_folder='static'
    )
    
    # FORZA DEBUG MODE
    app.config['DEBUG'] = True
    app.debug = True
    
    # ===========================================
    # CONFIGURAZIONE APP E SESSIONI
    # ===========================================
    
    app.config['SECRET_KEY'] = 'talon-secret-key-super-secure-2025-auth-v2'
    app.config['user_sessions'] = {}  # Sessioni in memoria per token API
    app.config['USE_SSO'] = SSO_AVAILABLE  # Flag per SSO
    
    # Configurazione sessioni Flask
    app.config['SESSION_PERMANENT'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=7)
    app.config['SESSION_COOKIE_SECURE'] = False  # HTTP OK per sviluppo
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_PATH'] = '/'
    app.config['SESSION_COOKIE_NAME'] = 'talon_session'  # Nome diverso da Superset
    
    # Database configuration
    app.config['DATABASE'] = DATABASE
    
    # ===========================================
    # CONFIGURAZIONE ANTI-CACHE PER DEBUG
    # ===========================================
    
    if app.debug:
        app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
        
        @app.after_request
        def disable_caching_in_debug(response):
            if request.endpoint == 'static':
                response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
                response.headers['Pragma'] = 'no-cache'
                response.headers['Expires'] = '0'
            elif request.endpoint and not request.endpoint.startswith('api'):
                response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
                response.headers['Pragma'] = 'no-cache'
                response.headers['Expires'] = '0'
            return response
    
    # ===========================================
    # CONTEXT PROCESSORS
    # ===========================================
    
    @app.context_processor
    def inject_cache_buster():
        """Inietta cache buster nei template"""
        import time
        import random
        
        if app.debug:
            cache_buster = f"{int(time.time())}_{random.randint(1000, 9999)}"
        else:
            cache_buster = "2.0.0"
        
        return {
            'cache_buster': cache_buster,
            'is_debug': app.debug
        }
    
    @app.context_processor
    def inject_app_info():
        """Inietta informazioni app nei template"""
        return {
            'app_name': 'TALON System',
            'app_version': '2.0.0',
            'current_year': datetime.datetime.now().year,
            'debug_mode': app.debug,
            'sso_enabled': SSO_AVAILABLE
        }
    
    @app.context_processor
    def inject_csrf_token():
        """Inietta csrf_token dummy nei template"""
        def csrf_token():
            return ''
        return dict(csrf_token=csrf_token)
    
    @app.context_processor
    def inject_sso_helpers():
        """Inietta helper SSO nei template"""
        def get_sso_token():
            if SSO_AVAILABLE and session.get('logged_in'):
                try:
                    return generate_superset_token()
                except:
                    return None
            return None
        
        def get_sso_dashboard_url(dashboard_id):
            if SSO_AVAILABLE and session.get('logged_in'):
                try:
                    return get_superset_sso_url(dashboard_id)
                except:
                    return '#'
            return '#'
        
        return {
            'get_sso_token': get_sso_token,
            'get_sso_dashboard_url': get_sso_dashboard_url,
            'SUPERSET_BASE_URL': 'http://127.0.0.1:8088'
        }
    
    # Configura il context processor per autenticazione
    setup_auth_context_processor(app)
    
    # ===========================================
    # FUNZIONI DATABASE
    # ===========================================
    
    def get_db_connection():
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        return conn
    
    def verify_password(stored_hash: str, password: str, username: str = None) -> bool:
        """Verifica password con fallback per admin di test"""
        if username == 'admin' and password == 'admin123':
            return True
        if stored_hash:
            return stored_hash == hashlib.md5(password.encode()).hexdigest()
        return False
    
    def create_api_session_token(user_data: dict) -> str:
        """Crea token di sessione per API"""
        import time
        import random
        token = f"talon_{user_data['id']}_{int(time.time())}_{random.randint(10000,99999)}"
        
        app.config['user_sessions'][token] = {
            'user_id': user_data['id'],
            'username': user_data['username'],
            'created': datetime.datetime.now(),
            'expires': datetime.datetime.now() + datetime.timedelta(hours=24)
        }
        return token
    
    # ===========================================
    # ROUTE STATICHE
    # ===========================================
    
    @app.route('/favicon.ico')
    def favicon():
        """Gestisce la richiesta del favicon"""
        favicon_path = os.path.join(app.static_folder, 'favicon.ico')
        if os.path.exists(favicon_path):
            return app.send_static_file('favicon.ico')
        return Response(status=204)
    
    @app.route('/')
    def root():
        """Root redirect intelligente"""
        if session.get('logged_in'):
            return redirect(url_for('main.dashboard'))
        return redirect(url_for('show_login'))
    
    # ===========================================
    # ROUTE DI AUTENTICAZIONE
    # ===========================================
    
    @app.route('/login', methods=['GET'])
    @app.route('/auth/login', methods=['GET'])
    def show_login():
        """Mostra pagina di login"""
        if session.get('logged_in') and session.get('user_id'):
            return redirect(url_for('main.dashboard'))
        return render_template('login.html')
    
    @app.route('/login', methods=['POST'])
    @app.route('/auth/login', methods=['POST'])
    def process_login():
        """Processa il login sia web che API"""
        is_api_request = (request.is_json or 
                         request.headers.get('Content-Type', '').startswith('application/json'))
        
        if is_api_request:
            data = request.get_json()
            username = data.get('username')
            password = data.get('password')
        else:
            username = request.form.get('username')
            password = request.form.get('password')
        
        # Validazione input
        if not username or not password:
            error_msg = 'Username e password richiesti'
            if is_api_request:
                return jsonify({'error': error_msg, 'code': 'MISSING_CREDENTIALS'}), 400
            flash(error_msg, 'error')
            return redirect(url_for('show_login'))
        
        # Verifica credenziali
        user = get_user_by_username(username.strip())
        if not user or not verify_password(user.get('password_hash', ''), password, username):
            error_msg = 'Credenziali non valide'
            if is_api_request:
                return jsonify({'error': error_msg, 'code': 'INVALID_CREDENTIALS'}), 401
            flash(error_msg, 'error')
            return redirect(url_for('show_login'))
        
        # Verifica che l'utente sia attivo
        if not user.get('attivo', True):
            error_msg = 'Account disattivato'
            if is_api_request:
                return jsonify({'error': error_msg, 'code': 'ACCOUNT_DISABLED'}), 401
            flash(error_msg, 'error')
            return redirect(url_for('show_login'))
        
        # Login riuscito - crea sessione
        session.permanent = True
        session.clear()
        
        # Dati base di sessione
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['logged_in'] = True
        session['login_time'] = datetime.datetime.now().isoformat()
        session['session_valid'] = True
        session['nome'] = user.get('nome', '')
        session['cognome'] = user.get('cognome', '')
        session['email'] = user.get('email', f"{username}@talon.local")
        
        # Aggiorna sessione con informazioni ruolo
        update_session_with_role_info(user['id'])
        
        # Aggiorna ultimo accesso
        try:
            conn = get_db_connection()
            conn.execute(
                'UPDATE utenti SET ultimo_accesso = datetime("now") WHERE id = ?',
                (user['id'],)
            )
            conn.commit()
            conn.close()
        except:
            pass
        
        # Log del login
        log_user_action(
            user_id=user['id'], 
            action='LOGIN_SUCCESS',
            details=f"Login {'API' if is_api_request else 'WEB'} da {request.remote_addr}",
            ip_address=request.remote_addr
        )
        
        if is_api_request:
            # Risposta API
            token = create_api_session_token(user)
            permissions = get_user_permissions(user['id'])
            accessible_entities = get_user_accessible_entities(user['id'])
            
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id': user['id'],
                    'username': user['username'],
                    'nome': user['nome'],
                    'cognome': user['cognome'],
                    'ruolo': user.get('ruolo_nome'),
                    'livello_accesso': user.get('livello_accesso', 0)
                },
                'permissions': permissions,
                'accessible_entities': accessible_entities
            })
        else:
            # Risposta web
            flash(f'Benvenuto, {user["nome"]} {user["cognome"]}!', 'success')
            
            next_page = request.args.get('next')
            if next_page and next_page.startswith('/'):
                return redirect(next_page)
            
            return redirect(url_for('main.dashboard'))
    
    @app.route('/logout', methods=['GET', 'POST'])
    @app.route('/auth/logout', methods=['GET', 'POST'])
    def logout():
        """Logout dell'utente"""
        user_id = session.get('user_id')
        
        if user_id:
            log_user_action(
                user_id=user_id,
                action='LOGOUT',
                details=f"Logout da {request.remote_addr}",
                ip_address=request.remote_addr
            )
        
        # Pulisci token API se presente
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            sessions = app.config.get('user_sessions', {})
            if token in sessions:
                del sessions[token]
        
        # Pulisci sessione Flask
        session.clear()
        
        if request.is_json:
            return jsonify({'success': True, 'message': 'Logout effettuato'})
        else:
            flash('Logout effettuato correttamente.', 'info')
            return redirect(url_for('show_login'))
    
    # ===========================================
    # ROUTE SSO PER SUPERSET
    # ===========================================
    
    if SSO_AVAILABLE:
        @app.route('/api/sso/superset/token', methods=['GET', 'POST'])
        @login_required
        def get_superset_sso_token():
            """API endpoint per ottenere un token SSO per Superset"""
            try:
                token = generate_superset_token()
                return jsonify({
                    'success': True,
                    'token': token,
                    'expires_in': 28800,
                    'superset_url': 'http://127.0.0.1:8088'
                })
            except Exception as e:
                app.logger.error(f"Errore generazione token SSO: {e}")
                return jsonify({
                    'success': False,
                    'error': str(e)
                }), 500
        
        @app.route('/api/sso/superset/url', methods=['GET'])
        @login_required
        def get_superset_sso_url_endpoint():
            """Genera URL di Superset con token SSO"""
            dashboard_id = request.args.get('dashboard_id')
            return_url = request.args.get('return_url')
            
            try:
                url = get_superset_sso_url(dashboard_id, return_url)
                return jsonify({
                    'success': True,
                    'url': url
                })
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': str(e)
                }), 500
        
        @app.route('/superset/dashboard/<int:dashboard_id>')
        @login_required
        def superset_dashboard_proxy(dashboard_id):
            """Proxy per dashboard Superset con SSO automatico"""
            token = generate_superset_token()
            superset_url = f"http://127.0.0.1:8088/superset/dashboard/{dashboard_id}/?token={token}"
            superset_url += "&standalone=1&show_top_bar=0&hide_nav=1&embedded=1"
            return redirect(superset_url)
        
        @app.after_request
        def add_sso_token_cookie(response):
            """Aggiunge token SSO ai cookie se necessario"""
            if SSO_AVAILABLE and (request.path.startswith('/dashboard') or request.path.startswith('/superset')):
                try:
                    response = inject_sso_token_in_response(response)
                except:
                    pass
            return response
    
    # ===========================================
    # ROUTE API
    # ===========================================
    
    @app.route('/api/auth/me', methods=['GET'])
    @login_required
    def get_current_user_api():
        """Informazioni utente corrente (API)"""
        user = get_current_user_info()
        if not user:
            return jsonify({'error': 'Utente non trovato', 'code': 'USER_NOT_FOUND'}), 404
        
        permissions = get_user_permissions(user['id'])
        accessible_entities = get_user_accessible_entities(user['id'])
        
        return jsonify({
            'user': {
                'id': user['id'],
                'username': user['username'],
                'nome': user['nome'],
                'cognome': user['cognome'],
                'ruolo': user.get('ruolo_nome'),
                'livello_accesso': user.get('livello_accesso', 0)
            },
            'permissions': permissions,
            'accessible_entities': accessible_entities
        })
    
    # ===========================================
    # ROUTE DI AMMINISTRAZIONE
    # ===========================================
    
    @app.route('/impostazioni')
    @admin_required
    def impostazioni():
        """Pagina impostazioni (solo admin)"""
        return render_template('impostazioni.html')
    
    @app.route('/impostazioni/utenti')
    @app.route('/admin/users')
    @admin_required
    def admin_users():
        """Gestione utenti (solo admin)"""
        try:
            conn = get_db_connection()
            users = conn.execute(
                '''SELECT u.*, r.nome as ruolo_nome, em.nome as ente_nome
                   FROM utenti u
                   LEFT JOIN ruoli r ON r.id = u.ruolo_id
                   LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
                   ORDER BY u.cognome, u.nome'''
            ).fetchall()
            conn.close()
            return render_template('admin/users.html', users=users)
        except Exception as e:
            flash(f'Errore nel caricamento utenti: {str(e)}', 'error')
            return redirect(url_for('main.dashboard'))
    
    # ===========================================
    # ROUTE DI DEBUG (SOLO SVILUPPO)
    # ===========================================
    
    if app.debug:
        @app.route('/debug/session')
        def debug_session():
            """Debug informazioni sessione"""
            user_info = get_current_user_info()
            
            return jsonify({
                'flask_session': dict(session),
                'user_logged_in': session.get('logged_in', False),
                'user_id': session.get('user_id'),
                'username': session.get('username'),
                'user_role': session.get('ruolo_nome'),
                'sso_enabled': SSO_AVAILABLE,
                'user_info': user_info
            })
        
        @app.route('/quick-login/<username>')
        def quick_login(username):
            """Login rapido per sviluppo"""
            user = get_user_by_username(username)
            if not user:
                return jsonify({'error': f'Utente {username} non trovato'}), 404
            
            session.permanent = True
            session.clear()
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['logged_in'] = True
            session['login_time'] = datetime.datetime.now().isoformat()
            session['session_valid'] = True
            session['nome'] = user.get('nome', '')
            session['cognome'] = user.get('cognome', '')
            
            update_session_with_role_info(user['id'])
            
            flash(f'Quick login effettuato per {username}', 'info')
            return redirect(url_for('main.dashboard'))
    
    # ===========================================
    # GESTIONE ERRORI
    # ===========================================
    
    @app.errorhandler(401)
    def unauthorized(error):
        """Gestione errore 401 - Non autorizzato"""
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Autenticazione richiesta',
                'code': 'AUTHENTICATION_REQUIRED'
            }), 401
        flash('Devi effettuare il login per accedere a questa pagina.', 'warning')
        return redirect(url_for('show_login', next=request.url))
    
    @app.errorhandler(403)
    def forbidden(error):
        """Gestione errore 403 - Accesso negato"""
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Accesso negato',
                'code': 'ACCESS_DENIED'
            }), 403
        flash('Non hai i privilegi necessari per accedere a questa risorsa.', 'error')
        return render_template('errors/403.html'), 403
    
    @app.errorhandler(404)
    def page_not_found(error):
        """Gestione errore 404 - Pagina non trovata"""
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Endpoint non trovato',
                'code': 'NOT_FOUND'
            }), 404
        return render_template('errors/404.html'), 404
    
    @app.errorhandler(500)
    def internal_server_error(error):
        """Gestione errore 500 - Errore interno server"""
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Errore interno del server',
                'code': 'INTERNAL_ERROR'
            }), 500
        flash('Si è verificato un errore interno. Riprova più tardi.', 'error')
        return render_template('errors/500.html'), 500
    
    # ===========================================
    # TEMPLATE FILTERS
    # ===========================================
    
    @app.template_filter('datetime_format')
    def datetime_format(value, format='%d/%m/%Y %H:%M'):
        """Formatta datetime per i template"""
        if isinstance(value, str):
            try:
                value = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
            except:
                return value
        if isinstance(value, datetime.datetime):
            return value.strftime(format)
        return value
    
    @app.template_filter('role_badge_class')
    def role_badge_class(role):
        """Restituisce classe CSS per badge ruolo"""
        role_upper = str(role).upper()
        if role_upper == ROLE_ADMIN:
            return 'badge-danger'
        elif role_upper == ROLE_OPERATORE:
            return 'badge-warning'
        elif role_upper == ROLE_VISUALIZZATORE:
            return 'badge-info'
        return 'badge-secondary'
    
    # ===========================================
    # REGISTRAZIONE BLUEPRINT
    # ===========================================
    
    app.register_blueprint(main_bp)
    app.register_blueprint(enti_militari_bp)
    app.register_blueprint(enti_civili_bp)
    app.register_blueprint(operazioni_bp)
    app.register_blueprint(attivita_bp)
    
    # ===========================================
    # INIZIALIZZAZIONE APPLICAZIONE
    # ===========================================
    
    with app.app_context():
        try:
            if not validate_user_role_consistency():
                app.logger.warning("Inconsistenze rilevate nel sistema dei ruoli")
            app.logger.info("TALON System inizializzato correttamente")
            print("✅ Database e sistema ruoli verificati")
            if SSO_AVAILABLE:
                print("✅ Modulo SSO caricato correttamente")
            else:
                print("⚠️ Modulo SSO non disponibile")
        except Exception as e:
            app.logger.error(f"Errore nell'inizializzazione: {e}")
            print(f"❌ Errore inizializzazione: {e}")
    
    return app

def main():
    """Funzione principale"""
    app = create_app()
    
    FORCE_DEBUG = True  # Cambia a False per produzione
    
    if not FORCE_DEBUG and not app.debug:
        import logging
        from logging.handlers import RotatingFileHandler
        
        os.makedirs('logs', exist_ok=True)
        
        file_handler = RotatingFileHandler('logs/talon.log', maxBytes=10240000, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('TALON System startup')
    
    print("=" * 60)
    print("🎯 TALON SYSTEM v2.0 - SISTEMA AUTENTICAZIONE + SSO")
    print("=" * 60)
    print("📊 SERVIZI:")
    print("   • TALON:    http://127.0.0.1:5000")
    print("   • SUPERSET: http://127.0.0.1:8088")
    print("=" * 60)
    print("👤 CREDENZIALI DI TEST:")
    print("   Username: admin")
    print("   Password: admin123")
    print("=" * 60)
    print("🔐 RUOLI DISPONIBILI:")
    print(f"   • {ROLE_ADMIN} - Accesso completo")
    print(f"   • {ROLE_OPERATORE} - Modifica dati")
    print(f"   • {ROLE_VISUALIZZATORE} - Solo visualizzazione")
    print("=" * 60)
    
    if SSO_AVAILABLE:
        print("🔑 SSO ATTIVO - Login unico TALON → Superset")
    else:
        print("⚠️ SSO NON ATTIVO - Crea sso_superset.py")
    
    print("=" * 60)
    
    if FORCE_DEBUG or app.debug:
        print("🚨 MODALITÀ DEBUG ATTIVA")
        print("💾 Cache disabilitata")
        print("=" * 60)
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    else:
        print("🚀 MODALITÀ PRODUZIONE")
        print("=" * 60)
        serve(app, host='0.0.0.0', port=5000, threads=16)

if __name__ == '__main__':
    main()