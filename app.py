# app.py - Versione ottimizzata con sistema auth a 3 ruoli
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify, render_template, redirect, session, flash, url_for, Response
import sqlite3
import hashlib
import datetime
from waitress import serve

# Importa il modulo di autenticazione AGGIORNATO
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
    
    # ===========================================
    # CONFIGURAZIONE APP E SESSIONI
    # ===========================================
    
    app.config['SECRET_KEY'] = 'talon-secret-key-super-secure-2025-auth-v2'
    app.config['user_sessions'] = {}  # Sessioni in memoria per token API
    
    # Configurazione sessioni Flask ottimizzata
    app.config['SESSION_PERMANENT'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=7)
    app.config['SESSION_COOKIE_SECURE'] = False  # HTTP OK per sviluppo
    app.config['SESSION_COOKIE_HTTPONLY'] = True  # Maggiore sicurezza
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Protezione CSRF
    app.config['SESSION_COOKIE_PATH'] = '/'
    
    # Database configuration
    app.config['DATABASE'] = DATABASE
    
    # 🎯 CONFIGURA IL CONTEXT PROCESSOR PER I TEMPLATE
    setup_auth_context_processor(app)
    
    # ===========================================
    # FUNZIONI DATABASE SEMPLIFICATE
    # ===========================================

    def get_db_connection():
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        return conn

    def verify_password(stored_hash: str, password: str, username: str = None) -> bool:
        """Verifica password con fallback per admin di test"""
        # Fallback per admin di test
        if username == 'admin' and password == 'admin123':
            return True
        
        # Verifica hash MD5 semplice
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
    # ROUTE PER FAVICON
    # ===========================================
    
    @app.route('/favicon.ico')
    def favicon():
        """Gestisce la richiesta del favicon"""
        # Prova a servire il favicon dalla cartella static
        favicon_path = os.path.join(app.static_folder, 'favicon.ico')
        if os.path.exists(favicon_path):
            return app.send_static_file('favicon.ico')
        else:
            # Se non esiste, ritorna 204 No Content
            return Response(status=204)

    # ===========================================
    # ROUTE DI AUTENTICAZIONE
    # ===========================================

    @app.route('/login', methods=['GET'])
    @app.route('/auth/login', methods=['GET'])
    def show_login():
        """Mostra pagina di login"""
        # Se già loggato, redirect alla dashboard
        if session.get('logged_in') and session.get('user_id'):
            return redirect(url_for('main.dashboard'))
        
        return render_template('login.html')

    @app.route('/login', methods=['POST'])
    @app.route('/auth/login', methods=['POST'])
    def process_login():
        """Processa il login sia web che API"""
        # Determina se è una richiesta API o web
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
        except sqlite3.OperationalError:
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
                    'grado': user.get('grado'),
                    'ruolo': user.get('ruolo_nome'),
                    'ente_appartenenza': user.get('ente_nome'),
                    'livello_accesso': user.get('livello_accesso', 0)
                },
                'permissions': permissions,
                'accessible_entities': accessible_entities,
                'session_info': {
                    'login_time': session['login_time'],
                    'expires': (datetime.datetime.now() + app.config['PERMANENT_SESSION_LIFETIME']).isoformat()
                }
            })
        else:
            # Risposta web
            flash(f'Benvenuto, {user["nome"]} {user["cognome"]}!', 'success')
            
            # Redirect intelligente
            next_page = request.args.get('next')
            if next_page and next_page.startswith('/'):
                return redirect(next_page)
            
            # Redirect basato sul ruolo
            user_role = session.get('ruolo_nome', '').upper()
            return redirect(url_for('main.dashboard'))

    @app.route('/logout', methods=['GET', 'POST'])
    @app.route('/auth/logout', methods=['GET', 'POST'])
    def logout():
        """Logout dell'utente"""
        user_id = session.get('user_id')
        username = session.get('username')
        
        # Log del logout
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
                'grado': user.get('grado'),
                'ruolo': user.get('ruolo_nome'),
                'ente_appartenenza': user.get('ente_nome'),
                'livello_accesso': user.get('livello_accesso', 0),
                'accesso_globale': user.get('accesso_globale', False)
            },
            'permissions': permissions,
            'accessible_entities': accessible_entities,
            'session_info': {
                'login_time': session.get('login_time'),
                'is_admin': is_admin(),
                'is_operatore_or_above': is_operatore_or_above(),
                'role': get_user_role()
            }
        })

    # ===========================================
    # ROUTE PRINCIPALI
    # ===========================================
    
    @app.route('/')
    def root():
        """Root redirect intelligente"""
        if session.get('logged_in'):
            return redirect(url_for('main.dashboard'))
        else:
            return redirect(url_for('show_login'))

    # ===========================================
    # ROUTE DI AMMINISTRAZIONE (IMPOSTAZIONI)
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

    @app.route('/impostazioni/sistema')
    @app.route('/admin/system-info')
    @admin_required
    def admin_system_info():
        """Informazioni sistema (solo admin)"""
        try:
            stats = get_system_auth_stats()
            role_consistency = validate_user_role_consistency()
            
            return render_template('admin/system_info.html', 
                                 stats=stats, 
                                 role_consistency=role_consistency)
        except Exception as e:
            flash(f'Errore nel caricamento statistiche: {str(e)}', 'error')
            return redirect(url_for('main.dashboard'))

    # ===========================================
    # ROUTE DI DEBUG (SOLO SVILUPPO)
    # ===========================================
    
    @app.route('/debug/session')
    def debug_session():
        """Debug informazioni sessione"""
        if not app.debug:
            return jsonify({'error': 'Debug non disponibile in produzione'}), 403
        
        user_info = get_current_user_info()
        
        debug_info = {
            'flask_session': dict(session),
            'session_valid': session.get('session_valid', False),
            'user_logged_in': session.get('logged_in', False),
            'user_id': session.get('user_id'),
            'username': session.get('username'),
            'user_role': session.get('ruolo_nome'),
            'is_admin': session.get('is_admin', False),
            'user_info': user_info,
            'accessible_entities_count': len(get_user_accessible_entities(session.get('user_id'))) if session.get('user_id') else 0
        }
        
        return jsonify(debug_info)

    @app.route('/debug/user/<int:user_id>')
    @admin_required
    def debug_user_info(user_id):
        """Debug informazioni specifiche utente (solo admin)"""
        try:
            debug_info = debug_user_permissions(user_id)
            return jsonify(debug_info)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/quick-login/<username>')
    def quick_login(username):
        """Login rapido per sviluppo - DA RIMUOVERE IN PRODUZIONE"""
        if not app.debug:
            return jsonify({'error': 'Non disponibile in produzione'}), 403
        
        user = get_user_by_username(username)
        if not user:
            return jsonify({'error': f'Utente {username} non trovato'}), 404
        
        # Forza login
        session.permanent = True
        session.clear()
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['logged_in'] = True
        session['login_time'] = datetime.datetime.now().isoformat()
        session['session_valid'] = True
        
        update_session_with_role_info(user['id'])
        
        log_user_action(
            user_id=user['id'],
            action='QUICK_LOGIN_DEBUG',
            details=f"Quick login debug per {username}",
            ip_address=request.remote_addr
        )
        
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
                'code': 'AUTHENTICATION_REQUIRED',
                'login_url': url_for('show_login', _external=True)
            }), 401
        
        flash('Devi effettuare il login per accedere a questa pagina.', 'warning')
        return redirect(url_for('show_login', next=request.url))

    @app.errorhandler(403)
    def forbidden(error):
        """Gestione errore 403 - Accesso negato"""
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Accesso negato',
                'code': 'ACCESS_DENIED',
                'required_permission': getattr(error, 'required_permission', None)
            }), 403
        
        flash('Non hai i privilegi necessari per accedere a questa risorsa.', 'error')
        return render_template('errors/403.html'), 403

    @app.errorhandler(404)
    def page_not_found(error):
        """Gestione errore 404 - Pagina non trovata"""
        if request.path.startswith('/api/'):
            return jsonify({
                'error': 'Endpoint non trovato',
                'code': 'NOT_FOUND',
                'path': request.path
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
    # CONTEXT PROCESSORS AGGIUNTIVI
    # ===========================================
    
    @app.context_processor
    def inject_app_info():
        """Inietta informazioni app nei template"""
        return {
            'app_name': 'TALON System',
            'app_version': '2.0.0',
            'current_year': datetime.datetime.now().year,
            'debug_mode': app.debug
        }
    
    # ✅ CONTEXT PROCESSOR PER CSRF TOKEN DUMMY
    @app.context_processor
    def inject_csrf_token():
        """Inietta csrf_token dummy nei template per evitare errori"""
        def csrf_token():
            # Ritorna una stringa vuota o un token dummy
            # Questo previene errori nei template senza bisogno di Flask-WTF
            return ''
        return dict(csrf_token=csrf_token)

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
    # INIZIALIZZAZIONE APPLICAZIONE - FLASK 2.2+ COMPATIBLE
    # ===========================================
    
    # ✅ SOSTITUISCE @app.before_first_request (rimosso in Flask 2.2+)
    with app.app_context():
        try:
            # Valida consistenza ruoli
            if not validate_user_role_consistency():
                app.logger.warning("Inconsistenze rilevate nel sistema dei ruoli")
            
            app.logger.info("TALON System inizializzato correttamente")
            print("🔧 Database e sistema ruoli verificati")
        except Exception as e:
            app.logger.error(f"Errore nell'inizializzazione: {e}")
            print(f"❌ Errore inizializzazione: {e}")

    return app

def main():
    """Funzione principale"""
    app = create_app()
    
    # Configurazione logging
    if not app.debug:
        import logging
        from logging.handlers import RotatingFileHandler
        
        # Crea directory logs se non esiste
        os.makedirs('logs', exist_ok=True)
        
        file_handler = RotatingFileHandler('logs/talon.log', maxBytes=10240000, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('TALON System startup')
    
    print("=" * 50)
    print("🎯 TALON SYSTEM v2.0 - SISTEMA AUTENTICAZIONE A 3 RUOLI")
    print("=" * 50)
    print("👤 CREDENZIALI DI TEST:")
    print("   Username: admin")
    print("   Password: admin123")
    print("=" * 50)
    print("🔐 RUOLI DISPONIBILI:")
    print(f"   • {ROLE_ADMIN} - Accesso completo al sistema")
    print(f"   • {ROLE_OPERATORE} - Modifica dati nel cono d'ombra")
    print(f"   • {ROLE_VISUALIZZATORE} - Solo visualizzazione")
    print("=" * 50)
    print("🌐 ENDPOINTS PRINCIPALI:")
    print("   • /login - Login web")
    print("   • /logout - Logout")
    print("   • /impostazioni - Gestione sistema (admin)")
    print("   • /debug/session - Debug sessione (dev)")
    print("=" * 50)
    
    if app.debug:
        print("🚨 MODALITÀ DEBUG ATTIVA")
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    else:
        print("🚀 MODALITÀ PRODUZIONE")
        serve(app, host='0.0.0.0', port=5000, threads=16)

if __name__ == '__main__':
    main()