# app.py - Versione ottimizzata con sistema auth a 3 ruoli + SSO Superset + SPA Support (PostgreSQL)
import sys
import os
import re
import json
from functools import wraps

# FORZA DEBUG MODE PER SVILUPPO
os.environ['FLASK_ENV'] = 'development'
os.environ['FLASK_DEBUG'] = '1'

# Aggiungi il percorso root al sys.path per import corretti
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify, render_template, redirect, session, flash, url_for, Response, get_flashed_messages
import hashlib
import datetime
from waitress import serve
import logging
import requests
import urllib.parse

# === DB: PostgreSQL ===
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool

# Configurazione Database PostgreSQL
PG_HOST = "127.0.0.1"
PG_PORT = 5432
PG_DB   = "talon"
PG_USER = "talon"
PG_PASS = "TalonDB!2025"

# Pool di connessioni per migliori performance
try:
    connection_pool = psycopg2.pool.SimpleConnectionPool(
        1, 20,  # min 1, max 20 connessioni
        host=PG_HOST,
        port=PG_PORT,
        database=PG_DB,
        user=PG_USER,
        password=PG_PASS,
        cursor_factory=RealDictCursor
    )
    print("[OK] Pool di connessioni PostgreSQL creato con successo")
except Exception as e:
    print(f"[ERROR] Errore creazione pool connessioni: {e}")
    connection_pool = None

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
    print(f"[WARNING] Modulo SSO non disponibile: {e}")
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

# Importa i blueprint dai percorsi corretti
from routes.main import main_bp
from routes.enti_militari import enti_militari_bp
from routes.enti_civili import enti_civili_bp
from routes.operazioni import operazioni_bp
from routes.attivita import attivita_bp

# ===========================================
# FUNZIONI SPA SUPPORT
# ===========================================

def spa_response(f):
    """
    Decoratore per supportare navigazione SPA.
    Rileva richieste AJAX e ritorna solo il contenuto necessario.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Esegui la funzione originale
        response = f(*args, **kwargs)
        
        # Verifica se è una richiesta SPA
        is_spa_request = (
            request.headers.get('X-SPA-Request') == 'true' or
            request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        )
        
        if is_spa_request and isinstance(response, str):
            # È una risposta HTML, dobbiamo processarla per SPA
            try:
                # Crea una risposta minima con solo il contenuto necessario
                spa_data = {
                    'html': response,
                    'title': 'TALON System',
                    'success': True
                }
                
                # Se possiamo estrarre il titolo dalla risposta
                title_match = re.search(r'<title>(.*?)</title>', response, re.IGNORECASE)
                if title_match:
                    spa_data['title'] = title_match.group(1)
                
                # Ritorna JSON per richieste SPA
                return jsonify(spa_data)
                
            except Exception as e:
                print(f"Errore processing SPA response: {e}")
                # In caso di errore, ritorna la risposta normale
                return response
        
        return response
    
    return decorated_function

def render_template_spa(template_name, **context):
    """
    Versione di render_template che supporta SPA.
    Se è una richiesta SPA, ritorna JSON con HTML parziale.
    """
    is_spa = (
        request.headers.get('X-SPA-Request') == 'true' or
        request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    )
    
    if is_spa:
        # Renderizza il template completo
        full_html = render_template(template_name, **context)
        
        # Estrai le parti necessarie
        title = 'TALON System'
        content = full_html
        breadcrumb = ''
        
        # Estrai il titolo
        title_match = re.search(r'<title>(.*?)</title>', full_html, re.IGNORECASE)
        if title_match:
            title = title_match.group(1).strip()
        
        # Estrai il contenuto principale
        content_match = re.search(
            r'<div class="flex-grow-1 p-3 main-content"[^>]*>(.*?)</div>\s*(?:<footer|$)',
            full_html,
            re.DOTALL | re.IGNORECASE
        )
        if content_match:
            content = content_match.group(1).strip()
        
        # Estrai breadcrumb
        breadcrumb_match = re.search(
            r'<ol class="breadcrumb[^"]*">(.*?)</ol>',
            full_html,
            re.DOTALL | re.IGNORECASE
        )
        if breadcrumb_match:
            breadcrumb = breadcrumb_match.group(1).strip()
        
        # Ottieni flash messages
        flash_messages = get_flashed_messages(with_categories=True)
        
        # Restituisci JSON per SPA
        return jsonify({
            'success': True,
            'title': title,
            'content': content,
            'breadcrumb': breadcrumb,
            'template': template_name,
            'flash_messages': flash_messages
        })
    
    # Richiesta normale
    return render_template(template_name, **context)

def create_app():
    """
    Factory function per creare l'applicazione Flask.
    Organizzata per modularità e manutenibilità.
    """
    app = Flask(
        __name__,
        template_folder='templates',
        static_folder='static'
    )
    
    # FORZA DEBUG MODE
    app.config['DEBUG'] = True
    app.debug = True
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
    )
    app.logger.setLevel(logging.INFO)
    
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
    
    # Database configuration (PostgreSQL)
    app.config['POSTGRES'] = {
        "host": PG_HOST,
        "port": PG_PORT,
        "database": PG_DB,
        "user": PG_USER,
        "password": PG_PASS,
    }
    
    # ===========================================
    # MIDDLEWARE SPA
    # ===========================================
    
    @app.before_request
    def before_request_spa():
        """Prepara richieste SPA"""
        if request.headers.get('X-SPA-Request') == 'true':
            request.is_spa = True
        else:
            request.is_spa = False
    
    # ===========================================
    # CONFIGURAZIONE ANTI-CACHE PER DEBUG + SPA
    # ===========================================
    
    if app.debug:
        app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
        
        @app.after_request
        def after_request_handler(response):
            """Gestisce headers per cache e SPA"""
            # Aggiungi header per identificare risposte SPA
            if hasattr(request, 'is_spa') and request.is_spa:
                response.headers['X-SPA-Response'] = 'true'
            
            # Disabilita cache in debug
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
            'sso_enabled': SSO_AVAILABLE,
            'db_type': 'PostgreSQL',
            'db_name': PG_DB
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
    # FUNZIONI DATABASE (PostgreSQL con Pool)
    # ===========================================
    
    def get_db_connection():
        """
        Restituisce una connessione dal pool PostgreSQL.
        Usa RealDictCursor per ottenere risultati come dizionari.
        """
        if connection_pool:
            try:
                conn = connection_pool.getconn()
                if conn:
                    # Test rapido della connessione
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                    return conn
            except Exception as e:
                app.logger.error(f"Errore ottenimento connessione dal pool: {e}")
                # Prova connessione diretta come fallback
        
        # Fallback: connessione diretta se il pool non funziona
        try:
            return psycopg2.connect(
                host=PG_HOST,
                port=PG_PORT,
                database=PG_DB,
                user=PG_USER,
                password=PG_PASS,
                cursor_factory=RealDictCursor
            )
        except Exception as e:
            app.logger.error(f"Errore connessione diretta PostgreSQL: {e}")
            raise
    
    def return_db_connection(conn):
        """Restituisce la connessione al pool"""
        if connection_pool and conn:
            try:
                connection_pool.putconn(conn)
            except Exception as e:
                app.logger.error(f"Errore restituzione connessione al pool: {e}")
                try:
                    conn.close()
                except:
                    pass
    
    def verify_password(stored_hash: str, password: str, username: str = None) -> bool:
        """Verifica password con Werkzeug e fallback per hash legacy"""
        from werkzeug.security import check_password_hash
        
        if not stored_hash or not password:
            return False
            
        try:
            # Prova prima con Werkzeug (formato moderno)
            if stored_hash.startswith('pbkdf2:') or stored_hash.startswith('scrypt:'):
                return check_password_hash(stored_hash, password)
            
            # Fallback per hash MD5 legacy
            if len(stored_hash) == 32 and stored_hash.isalnum():  # MD5 hash length
                computed_hash = hashlib.md5(password.encode()).hexdigest()
                return stored_hash == computed_hash
            
            # Fallback per admin di test per sviluppo
            if username == 'admin' and password == 'admin123':
                return True
                
        except Exception as e:
            app.logger.error(f"Errore verifica password per {username}: {e}")
            
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
    # HEALTH CHECK E STATUS
    # ===========================================
    
    @app.route('/health')
    def health_check():
        """Health check endpoint"""
        status = {
            'status': 'healthy',
            'timestamp': datetime.datetime.now().isoformat(),
            'version': '2.0.0',
            'database': 'unknown',
            'sso': SSO_AVAILABLE,
            'spa_enabled': True
        }
        
        # Test connessione database
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT version()")
                db_version = cur.fetchone()
                status['database'] = 'connected'
                status['db_version'] = str(db_version['version'])[:50] if db_version else 'unknown'
            return_db_connection(conn)
        except Exception as e:
            status['database'] = f'error: {str(e)}'
            status['status'] = 'degraded'
        
        return jsonify(status), 200 if status['status'] == 'healthy' else 503

    # Test SPA
    @app.route('/test-spa')
    def test_spa():
        """Endpoint test per verificare funzionalità SPA"""
        return render_template('test-spa.html')
    
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
    
    @app.route('/external/<path:filename>')
    def external_files(filename):
        """Serve file dalla directory esterna F:\\tools\\Script"""
        external_path = 'F:\\tools\\Script'
        file_path = os.path.join(external_path, filename)
        
        # Verifica sicurezza: il file deve essere nella directory external
        if not os.path.abspath(file_path).startswith(os.path.abspath(external_path)):
            return Response(status=404)
        
        # Verifica che il file esista
        if not os.path.exists(file_path):
            return Response(status=404)
        
        try:
            from flask import send_file
            return send_file(file_path)
        except Exception as e:
            app.logger.error(f"Errore serving external file {filename}: {e}")
            return Response(status=500)
    
    @app.route('/superset-proxy/<path:path>')
    def superset_proxy(path):
        """
        Proxy per le richieste Superset che mantiene l'autenticazione
        """
        if not session.get('logged_in') or not session.get('superset_authenticated'):
            return Response('Non autorizzato', status=401)
        
        SUPERSET_URL = "http://127.0.0.1:8088"
        superset_cookies = session.get('superset_cookies', {})
        
        try:
            # Forwarda la richiesta a Superset mantenendo i cookie di autenticazione
            target_url = f"{SUPERSET_URL}/{path}"
            
            headers = {}
            for key, value in request.headers.items():
                if key.lower() not in ['host', 'content-length']:
                    headers[key] = value
            
            response = requests.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=request.get_data(),
                cookies=superset_cookies,
                allow_redirects=False
            )
            
            # Crea la risposta
            flask_response = Response(
                response.content,
                status=response.status_code,
                headers=dict(response.headers)
            )
            
            return flask_response
            
        except Exception as e:
            app.logger.error(f"Errore nel proxy Superset: {e}")
            return Response('Errore del proxy', status=500)
    
    # ===========================================
    # SUPERSET INTEGRATION
    # ===========================================
    
    def authenticate_superset_user(username, password):
        """
        Autentica automaticamente l'utente su Superset usando le credenziali TALON
        """
        # Configurazione Superset - modificare in base alla configurazione
        SUPERSET_URL = "http://127.0.0.1:8088"  # URL del tuo Superset
        
        try:
            app.logger.info(f"Tentativo di autenticazione Superset per utente: {username}")
            
            # Crea una sessione per mantenere i cookies
            session_requests = requests.Session()
            
            # 1. Ottieni la pagina di login per prendere il CSRF token
            login_page = session_requests.get(f"{SUPERSET_URL}/login/")
            if login_page.status_code != 200:
                app.logger.error(f"Impossibile accedere alla pagina di login Superset: {login_page.status_code}")
                return False
            
            # 2. Cerca il CSRF token nella risposta (Superset usa Flask-WTF)
            csrf_token = None
            if 'csrf_token' in login_page.text:
                import re
                csrf_match = re.search(r'name="csrf_token".*?value="([^"]+)"', login_page.text)
                if csrf_match:
                    csrf_token = csrf_match.group(1)
            
            # 3. Prepara i dati di login
            login_data = {
                'username': username,
                'password': password
            }
            
            if csrf_token:
                login_data['csrf_token'] = csrf_token
            
            # 4. Effettua il login
            headers = {
                'Referer': f"{SUPERSET_URL}/login/",
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            
            login_response = session_requests.post(
                f"{SUPERSET_URL}/login/",
                data=login_data,
                headers=headers,
                allow_redirects=False
            )
            
            # 5. Controlla se il login è riuscito
            if login_response.status_code == 302:  # Redirect dopo login riuscito
                redirect_location = login_response.headers.get('Location', '')
                if '/login' not in redirect_location:  # Non reindirizza al login = successo
                    app.logger.info(f"Autenticazione Superset riuscita per: {username}")
                    
                    # Opzionalmente, salva i cookie di sessione Superset per uso futuro
                    # Potresti voler memorizzare i cookie nella sessione Flask per uso negli iframe
                    superset_cookies = session_requests.cookies.get_dict()
                    if superset_cookies:
                        # Salva i cookie Superset nella sessione TALON per uso negli iframe
                        session['superset_cookies'] = superset_cookies
                        session['superset_authenticated'] = True
                    
                    return True
                else:
                    app.logger.warning(f"Login Superset fallito per {username}: redirect al login")
                    return False
            else:
                app.logger.warning(f"Login Superset fallito per {username}: status code {login_response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            app.logger.error(f"Errore di connessione durante l'autenticazione Superset: {e}")
            return False
        except Exception as e:
            app.logger.error(f"Errore imprevisto durante l'autenticazione Superset: {e}")
            return False
    
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
        
        try:
            # Verifica credenziali
            user = get_user_by_username(username.strip())
            
            if not user:
                error_msg = 'Credenziali non valide'
                app.logger.warning(f"Login fallito - utente non trovato: {username}")
                if is_api_request:
                    return jsonify({'error': error_msg, 'code': 'INVALID_CREDENTIALS'}), 401
                flash(error_msg, 'error')
                return redirect(url_for('show_login'))
            
            # Verifica password
            password_hash = user.get('password_hash') or user.get('password', '')
            if not verify_password(password_hash, password, username):
                error_msg = 'Credenziali non valide'
                app.logger.warning(f"Login fallito - password errata per: {username}")
                if is_api_request:
                    return jsonify({'error': error_msg, 'code': 'INVALID_CREDENTIALS'}), 401
                flash(error_msg, 'error')
                return redirect(url_for('show_login'))
            
            # Verifica che l'utente sia attivo
            if not user.get('attivo', True):
                error_msg = 'Account disattivato'
                app.logger.warning(f"Login fallito - account disattivato: {username}")
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
                with conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            'UPDATE utenti SET ultimo_accesso = NOW() WHERE id = %s', 
                            (user['id'],)
                        )
                        conn.commit()
                return_db_connection(conn)
            except Exception as e:
                app.logger.error(f"Impossibile aggiornare ultimo_accesso: {e}")
            
            # Log del login
            log_user_action(
                user_id=user['id'], 
                action='LOGIN_SUCCESS',
                details=f"Login {'API' if is_api_request else 'WEB'} da {request.remote_addr}",
                ip_address=request.remote_addr
            )
            
            app.logger.info(f"Login riuscito per utente: {username}")
            
            # Autentica automaticamente su Superset con le stesse credenziali
            try:
                superset_login_result = authenticate_superset_user(username, password)
                if superset_login_result:
                    app.logger.info(f"Autenticazione Superset riuscita per: {username}")
                else:
                    app.logger.warning(f"Autenticazione Superset fallita per: {username}")
            except Exception as e:
                app.logger.error(f"Errore durante l'autenticazione Superset per {username}: {e}")
            
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
                        'nome': user.get('nome', ''),
                        'cognome': user.get('cognome', ''),
                        'ruolo': user.get('ruolo_nome'),
                        'livello_accesso': user.get('livello_accesso', 0)
                    },
                    'permissions': permissions,
                    'accessible_entities': accessible_entities
                })
            else:
                # Risposta web
                nome_completo = f"{user.get('nome', '')} {user.get('cognome', '')}".strip()
                if nome_completo:
                    flash(f'Benvenuto, {nome_completo}!', 'success')
                else:
                    flash(f'Benvenuto, {username}!', 'success')
                
                next_page = request.args.get('next')
                if next_page and next_page.startswith('/'):
                    return redirect(next_page)
                
                return redirect(url_for('main.dashboard'))
                
        except Exception as e:
            app.logger.error(f"Errore durante il login: {e}")
            error_msg = 'Errore durante il login. Riprova.'
            if is_api_request:
                return jsonify({'error': error_msg, 'code': 'LOGIN_ERROR'}), 500
            flash(error_msg, 'error')
            return redirect(url_for('show_login'))
    
    @app.route('/logout', methods=['GET', 'POST'])
    @app.route('/auth/logout', methods=['GET', 'POST'])
    def logout():
        """Logout dell'utente - NON usa SPA per forzare reload completo"""
        user_id = session.get('user_id')
        username = session.get('username')
        
        if user_id:
            log_user_action(
                user_id=user_id,
                action='LOGOUT',
                details=f"Logout da {request.remote_addr}",
                ip_address=request.remote_addr
            )
            app.logger.info(f"Logout utente: {username}")
        
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
                'nome': user.get('nome', ''),
                'cognome': user.get('cognome', ''),
                'ruolo': user.get('ruolo_nome'),
                'livello_accesso': user.get('livello_accesso', 0)
            },
            'permissions': permissions,
            'accessible_entities': accessible_entities
        })
    
    # ===========================================
    # ROUTE DI AMMINISTRAZIONE (con supporto SPA)
    # ===========================================
    
    @app.route('/impostazioni')
    @admin_required
    @spa_response
    def impostazioni():
        """Pagina impostazioni (solo admin) con supporto SPA"""
        return render_template_spa('impostazioni.html')
    
    @app.route('/impostazioni/utenti')
    @app.route('/admin/users')
    @admin_required
    @spa_response
    def admin_users():
        """Gestione utenti (solo admin) con supporto SPA"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT u.*, r.nome as ruolo_nome, em.nome as ente_nome
                    FROM utenti u
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
                    WHERE (u.eliminato IS NULL OR u.eliminato = FALSE)
                    ORDER BY u.cognome, u.nome
                    '''
                )
                users = cur.fetchall()
            
            return render_template_spa('admin/users.html', users=users)
            
        except Exception as e:
            app.logger.error(f"Errore nel caricamento utenti: {e}")
            flash(f'Errore nel caricamento utenti: {str(e)}', 'error')
            
            # Se è una richiesta SPA, ritorna JSON con errore
            if hasattr(request, 'is_spa') and request.is_spa:
                return jsonify({
                    'success': False,
                    'error': str(e),
                    'redirect': url_for('main.dashboard')
                }), 500
            
            return redirect(url_for('main.dashboard'))
        finally:
            if conn:
                return_db_connection(conn)
    
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
                'spa_enabled': True,
                'user_info': user_info,
                'database': {
                    'type': 'PostgreSQL',
                    'name': PG_DB,
                    'host': PG_HOST,
                    'port': PG_PORT,
                    'user': PG_USER
                }
            })
        
        @app.route('/debug/db-test')
        def debug_db_test():
            """Test connessione database"""
            try:
                conn = get_db_connection()
                with conn.cursor() as cur:
                    # Info database
                    cur.execute("SELECT version()")
                    db_version = cur.fetchone()
                    
                    # Conta tabelle
                    cur.execute("""
                        SELECT COUNT(*) as count 
                        FROM information_schema.tables 
                        WHERE table_schema = 'public'
                    """)
                    table_count = cur.fetchone()
                    
                    # Conta utenti
                    cur.execute("SELECT COUNT(*) as count FROM utenti")
                    user_count = cur.fetchone()
                    
                    # Lista ruoli
                    cur.execute("SELECT nome FROM ruoli ORDER BY id")
                    roles = cur.fetchall()
                
                return_db_connection(conn)
                
                return jsonify({
                    'status': 'connected',
                    'database': PG_DB,
                    'version': db_version['version'] if db_version else 'unknown',
                    'tables': table_count['count'] if table_count else 0,
                    'users': user_count['count'] if user_count else 0,
                    'roles': [r['nome'] for r in roles] if roles else []
                })
                
            except Exception as e:
                return jsonify({
                    'status': 'error',
                    'error': str(e)
                }), 500
        
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
        app.logger.error(f"Errore 500: {error}")
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Errore interno del server',
                'code': 'INTERNAL_ERROR'
            }), 500
        flash('Si è verificato un errore interno. Riprova più tardi.', 'error')
        return render_template('errors/500.html'), 500
    
    @app.errorhandler(psycopg2.OperationalError)
    def handle_db_error(error):
        """Gestione errori database"""
        app.logger.error(f"Errore database: {error}")
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Errore connessione database',
                'code': 'DATABASE_ERROR'
            }), 503
        flash('Errore di connessione al database. Riprova più tardi.', 'error')
        return render_template('errors/503.html'), 503
    
    # ===========================================
    # TEMPLATE FILTERS
    # ===========================================
    
    @app.template_filter('datetime_format')
    def datetime_format(value, format='%d/%m/%Y %H:%M'):
        """Formatta datetime per i template"""
        if value is None:
            return ''
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
        if role is None:
            return 'badge-secondary'
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
            # Test connessione database
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                result = cur.fetchone()
                if result:
                    app.logger.info("[OK] Connessione PostgreSQL verificata")
                    print("[OK] Database PostgreSQL connesso correttamente")
            return_db_connection(conn)
            
            # Valida sistema ruoli
            if not validate_user_role_consistency():
                app.logger.warning("[WARNING] Inconsistenze rilevate nel sistema dei ruoli")
                print("[WARNING] Inconsistenze nel sistema dei ruoli - verificare")
            else:
                print("[OK] Sistema ruoli verificato")
            
            app.logger.info("TALON System inizializzato correttamente")
            
            if SSO_AVAILABLE:
                print("[OK] Modulo SSO caricato correttamente")
            else:
                print("[WARNING] Modulo SSO non disponibile")
            
            print("[OK] SPA Navigation abilitato")
                
        except Exception as e:
            app.logger.error(f"Errore nell'inizializzazione: {e}")
            print(f"[ERROR] Errore inizializzazione: {e}")
            print("   Verificare che PostgreSQL sia in esecuzione")
            print(f"   Database: {PG_DB}")
            print(f"   User: {PG_USER}")
    
    return app

def main():
    """
    Funzione principale per avviare l'applicazione.
    Gestisce modalità debug e produzione.
    """
    app = create_app()
    
    FORCE_DEBUG = True  # Cambia a False per produzione
    
    if not FORCE_DEBUG and not app.debug:
        import logging
        from logging.handlers import RotatingFileHandler
        
        # Crea directory logs se non esiste
        os.makedirs('logs', exist_ok=True)
        
        # Setup logging file per produzione
        file_handler = RotatingFileHandler('logs/talon.log', maxBytes=10240000, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('TALON System startup')
    
    print("=" * 60)
    print("[TARGET] TALON SYSTEM v2.0 - SISTEMA AUTENTICAZIONE + SSO + SPA")
    print("=" * 60)
    print("[DB] DATABASE:")
    print(f"   * Tipo: PostgreSQL")
    print(f"   * Nome: {PG_DB}")
    print(f"   * Host: {PG_HOST}:{PG_PORT}")
    print(f"   * User: {PG_USER}")
    print("=" * 60)
    print("[CHART] SERVIZI:")
    print("   * TALON:    http://127.0.0.1:5000")
    print("   * SUPERSET: http://127.0.0.1:8088")
    print("=" * 60)
    print("[USER] CREDENZIALI DI TEST:")
    print("   Username: admin")
    print("   Password: admin123")
    print("=" * 60)
    print("[LOCK] RUOLI DISPONIBILI:")
    print(f"   * {ROLE_ADMIN} - Accesso completo")
    print(f"   * {ROLE_OPERATORE} - Modifica dati")
    print(f"   * {ROLE_VISUALIZZATORE} - Solo visualizzazione")
    print("=" * 60)
    print("[NEW] FUNZIONALITÀ:")
    
    if SSO_AVAILABLE:
        print("   [OK] SSO ATTIVO - Login unico TALON -> Superset")
    else:
        print("   [WARN] SSO NON ATTIVO - Crea sso_superset.py")
    
    print("   [OK] SPA Navigation - Navigazione senza reload")
    print("   [OK] Fullscreen persistente tra pagine")
    print("   [OK] Loading animations")
    print("   [OK] Toast notifications")
    print("   [OK] Modular JavaScript structure")
    
    print("=" * 60)
    
    # Test connessione database prima di avviare
    try:
        test_conn = psycopg2.connect(
            host=PG_HOST,
            port=PG_PORT,
            database=PG_DB,
            user=PG_USER,
            password=PG_PASS
        )
        test_conn.close()
        print("[OK] Test connessione PostgreSQL riuscito")
    except Exception as e:
        print(f"[ERROR] ERRORE: Impossibile connettersi a PostgreSQL")
        print(f"   {e}")
        print("\n[WARNING] Verificare che:")
        print("   1. PostgreSQL sia in esecuzione")
        print(f"   2. Il database '{PG_DB}' esista")
        print(f"   3. L'utente '{PG_USER}' abbia i permessi corretti")
        print("   4. La password sia corretta")
        print("\nProvare: F:\\PostgreSQL\\bin\\psql -U talon -d talon")
        return
    
    print("=" * 60)
    
    if FORCE_DEBUG or app.debug:
        print("[ALERT] MODALITÀ DEBUG ATTIVA")
        print("[SAVE] Cache disabilitata")
        print("=" * 60)
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    else:
        print("[LAUNCH] MODALITÀ PRODUZIONE")
        print("=" * 60)
        serve(app, host='0.0.0.0', port=5000, threads=16)

if __name__ == '__main__':
    main()