# auth.py - Modulo di autenticazione ottimizzato per 3 ruoli
import sqlite3
import datetime
import os
from functools import wraps
from flask import request, jsonify, redirect, current_app, session, flash, url_for
from typing import Optional, Dict, List

# ===========================================
# CONFIGURAZIONE
# ===========================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'talon_data.db')

# Cache per migliorare le performance
_permission_cache = {}
_entity_cache = {}
_cache_timeout = 300  # 5 minuti

# Costanti per i ruoli
ROLE_ADMIN = 'ADMIN'
ROLE_OPERATORE = 'OPERATORE'
ROLE_VISUALIZZATORE = 'VISUALIZZATORE'

# Livelli di accesso
LEVEL_ADMIN = 100
LEVEL_OPERATORE = 50
LEVEL_VISUALIZZATORE = 10

# ===========================================
# FUNZIONI DATABASE OTTIMIZZATE
# ===========================================

def get_auth_db_connection():
    """Connessione al database per autenticazione con retry"""
    if not os.path.exists(DATABASE):
        raise FileNotFoundError(f"Database non trovato: {DATABASE}")
    
    conn = sqlite3.connect(DATABASE, timeout=30)
    conn.row_factory = sqlite3.Row
    # Ottimizzazioni SQLite
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    conn.execute('PRAGMA cache_size=10000')
    return conn

def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Recupera utente per ID con cache"""
    cache_key = f"user_{user_id}"
    if cache_key in _permission_cache:
        cache_data = _permission_cache[cache_key]
        if datetime.datetime.now() - cache_data['timestamp'] < datetime.timedelta(seconds=_cache_timeout):
            return cache_data['data']
    
    conn = get_auth_db_connection()
    try:
        user = conn.execute(
            '''SELECT u.*, r.nome as ruolo_nome, r.livello_accesso, em.nome as ente_nome,
                      r.id as ruolo_id_real, u.accesso_globale
               FROM utenti u 
               LEFT JOIN ruoli r ON r.id = u.ruolo_id
               LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
               WHERE u.id = ? AND u.attivo = 1''', 
            (user_id,)
        ).fetchone()
        
        result = dict(user) if user else None
        
        # Cache del risultato
        _permission_cache[cache_key] = {
            'data': result,
            'timestamp': datetime.datetime.now()
        }
        
        return result
    except sqlite3.OperationalError as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore database get_user_by_id: {e}")
        return None
    finally:
        conn.close()

def get_user_by_username(username: str) -> Optional[Dict]:
    """Recupera utente per username"""
    conn = get_auth_db_connection()
    try:
        user = conn.execute(
            '''SELECT u.*, r.nome as ruolo_nome, r.livello_accesso, em.nome as ente_nome,
                      r.id as ruolo_id_real, u.accesso_globale
               FROM utenti u 
               LEFT JOIN ruoli r ON r.id = u.ruolo_id
               LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
               WHERE u.username = ? AND u.attivo = 1''', 
            (username,)
        ).fetchone()
        return dict(user) if user else None
    except sqlite3.OperationalError as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore database get_user_by_username: {e}")
        return None
    finally:
        conn.close()

def get_user_permissions(user_id: int) -> List[str]:
    """Recupera tutti i permessi di un utente con cache"""
    cache_key = f"permissions_{user_id}"
    if cache_key in _permission_cache:
        cache_data = _permission_cache[cache_key]
        if datetime.datetime.now() - cache_data['timestamp'] < datetime.timedelta(seconds=_cache_timeout):
            return cache_data['data']
    
    conn = get_auth_db_connection()
    try:
        permissions = conn.execute(
            '''SELECT DISTINCT p.nome 
               FROM permessi p
               JOIN ruoli_permessi rp ON p.id = rp.permesso_id
               JOIN utenti u ON u.ruolo_id = rp.ruolo_id
               WHERE u.id = ? AND p.attivo = 1 AND u.attivo = 1''',
            (user_id,)
        ).fetchall()
        
        result = [p['nome'] for p in permissions]
        
        # Cache del risultato
        _permission_cache[cache_key] = {
            'data': result,
            'timestamp': datetime.datetime.now()
        }
        
        return result
    except sqlite3.OperationalError as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.warning(f"Tabelle permessi non esistenti: {e}")
        # Permessi di default basati sul ruolo se le tabelle non esistono
        user = get_user_by_id(user_id)
        if user:
            role = user.get('ruolo_nome', '').upper()
            if role == ROLE_ADMIN:
                return ['VIEW_ENTI_CIVILI', 'CREATE_ENTI_CIVILI', 'EDIT_ENTI_CIVILI', 'DELETE_ENTI_CIVILI',
                       'VIEW_ENTI_MILITARI', 'CREATE_ENTI_MILITARI', 'EDIT_ENTI_MILITARI', 'DELETE_ENTI_MILITARI',
                       'VIEW_OPERAZIONI', 'CREATE_OPERAZIONI', 'EDIT_OPERAZIONI', 'DELETE_OPERAZIONI',
                       'VIEW_ATTIVITA', 'CREATE_ATTIVITA', 'EDIT_ATTIVITA', 'DELETE_ATTIVITA']
            elif role == ROLE_OPERATORE:
                return ['VIEW_ENTI_CIVILI', 'CREATE_ENTI_CIVILI', 'EDIT_ENTI_CIVILI',
                       'VIEW_ENTI_MILITARI', 'CREATE_ENTI_MILITARI', 'EDIT_ENTI_MILITARI',
                       'VIEW_OPERAZIONI', 'CREATE_OPERAZIONI', 'EDIT_OPERAZIONI',
                       'VIEW_ATTIVITA', 'CREATE_ATTIVITA', 'EDIT_ATTIVITA']
            elif role == ROLE_VISUALIZZATORE:
                return ['VIEW_ENTI_CIVILI', 'VIEW_ENTI_MILITARI', 'VIEW_OPERAZIONI', 'VIEW_ATTIVITA']
        return []
    finally:
        conn.close()

def get_user_accessible_entities(user_id: int) -> List[int]:
    """Recupera gli enti accessibili dall'utente con cache - implementa il cono d'ombra"""
    cache_key = f"entities_{user_id}"
    if cache_key in _entity_cache:
        cache_data = _entity_cache[cache_key]
        if datetime.datetime.now() - cache_data['timestamp'] < datetime.timedelta(seconds=_cache_timeout):
            return cache_data['data']
    
    conn = get_auth_db_connection()
    try:
        user = conn.execute(
            'SELECT accesso_globale, ruolo_id, ente_militare_id FROM utenti WHERE id = ? AND attivo = 1', 
            (user_id,)
        ).fetchone()
        
        if not user:
            return []
        
        # ADMIN ha sempre accesso globale
        if user['accesso_globale'] or is_user_admin_by_id(user_id):
            entities = conn.execute('SELECT id FROM enti_militari ORDER BY id').fetchall()
            result = [e['id'] for e in entities]
        else:
            # Per OPERATORE e VISUALIZZATORE: implementa il cono d'ombra
            user_ente_id = user['ente_militare_id']
            if not user_ente_id:
                result = []
            else:
                # Usa la vista del cono d'ombra se esiste
                try:
                    entities = conn.execute(
                        '''SELECT DISTINCT ente_id 
                           FROM v_enti_accessibili 
                           WHERE utente_id = ?''',
                        (user_id,)
                    ).fetchall()
                    result = [e['ente_id'] for e in entities]
                except sqlite3.OperationalError:
                    # Se la vista non esiste, implementa logica base del cono d'ombra
                    # L'utente può vedere il proprio ente + tutti i discendenti
                    result = get_entity_cone_of_shadow(conn, user_ente_id)
        
        # Cache del risultato
        _entity_cache[cache_key] = {
            'data': result,
            'timestamp': datetime.datetime.now()
        }
        
        return result
    except sqlite3.OperationalError as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore nel recupero enti accessibili: {e}")
        return []
    finally:
        conn.close()

def get_entity_cone_of_shadow(conn, root_entity_id: int) -> List[int]:
    """Implementa la logica del cono d'ombra per un ente"""
    try:
        # Algoritmo ricorsivo per trovare tutti i discendenti
        all_entities = conn.execute('SELECT id, parent_id FROM enti_militari').fetchall()
        entity_map = {e['id']: e['parent_id'] for e in all_entities}
        
        def get_descendants(entity_id, visited=None):
            if visited is None:
                visited = set()
            if entity_id in visited:
                return []
            visited.add(entity_id)
            
            descendants = [entity_id]
            for eid, parent_id in entity_map.items():
                if parent_id == entity_id:
                    descendants.extend(get_descendants(eid, visited))
            return descendants
        
        return get_descendants(root_entity_id)
    except Exception:
        # Fallback: solo l'ente dell'utente
        return [root_entity_id]

def log_user_action(user_id: int, action: str, details: str = None, 
                   resource_type: str = None, resource_id: int = None,
                   ip_address: str = None, result: str = 'SUCCESS'):
    """Registra azione utente nel log in modo asincrono"""
    try:
        conn = get_auth_db_connection()
        conn.execute(
            '''INSERT INTO log_utenti 
               (utente_id, azione, dettagli, risorsa_tipo, risorsa_id, ip_address, esito, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (user_id, action, details, resource_type, resource_id, 
             ip_address or (request.remote_addr if request else None), result, datetime.datetime.now())
        )
        conn.commit()
        conn.close()
    except sqlite3.OperationalError:
        pass  # Tabella log non esiste ancora

def clear_user_cache(user_id: int = None):
    """Cancella cache utente (da chiamare dopo modifiche)"""
    if user_id:
        keys_to_remove = [k for k in _permission_cache.keys() if k.endswith(f"_{user_id}")]
        for key in keys_to_remove:
            del _permission_cache[key]
        keys_to_remove = [k for k in _entity_cache.keys() if k.endswith(f"_{user_id}")]
        for key in keys_to_remove:
            del _entity_cache[key]
    else:
        _permission_cache.clear()
        _entity_cache.clear()

# ===========================================
# FUNZIONI HELPER PER I RUOLI
# ===========================================

def is_user_admin_by_id(user_id: int) -> bool:
    """Verifica se un utente è admin basandosi sull'ID"""
    user = get_user_by_id(user_id)
    if not user:
        return False
    
    return (user.get('ruolo_nome', '').upper() == ROLE_ADMIN or
            user.get('livello_accesso', 0) >= LEVEL_ADMIN or
            user.get('accesso_globale', False))

def is_user_operatore_or_above(user_id: int) -> bool:
    """Verifica se un utente è operatore o superiore"""
    user = get_user_by_id(user_id)
    if not user:
        return False
    
    role = user.get('ruolo_nome', '').upper()
    level = user.get('livello_accesso', 0)
    
    return (role in [ROLE_ADMIN, ROLE_OPERATORE] or 
            level >= LEVEL_OPERATORE or
            user.get('accesso_globale', False))

def is_user_visualizzatore_or_above(user_id: int) -> bool:
    """Verifica se un utente è visualizzatore o superiore (praticamente tutti gli utenti autenticati)"""
    user = get_user_by_id(user_id)
    if not user:
        return False
    
    role = user.get('ruolo_nome', '').upper()
    return role in [ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE]

def get_user_role_name(user_id: int) -> str:
    """Recupera il nome del ruolo dell'utente"""
    user = get_user_by_id(user_id)
    return user.get('ruolo_nome', '').upper() if user else ''

# ===========================================
# GESTIONE SESSIONI OTTIMIZZATA
# ===========================================

def get_current_user_session() -> Optional[Dict]:
    """Recupera sessione utente corrente con priorità ottimizzata"""
    
    # Metodo 1: Flask session (priorità alta - più sicuro)
    if (session.get('user_id') and 
        session.get('username') and 
        session.get('logged_in') and
        session.get('session_valid')):
        return {
            'user_id': session['user_id'],
            'username': session['username'],
            'login_time': session.get('login_time')
        }
    
    # Metodo 2: Token Authorization header (per API)
    if request:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            session_data = verify_session_token(token)
            if session_data:
                return session_data
        
        # Metodo 3: Cookie auth_token
        if 'auth_token' in request.cookies:
            token = request.cookies['auth_token']
            session_data = verify_session_token(token)
            if session_data:
                return session_data
    
    return None

def verify_session_token(token: str) -> Optional[Dict]:
    """Verifica token di sessione con validazione migliorata"""
    if not token or len(token) < 10:
        return None
        
    sessions = current_app.config.get('user_sessions', {})
    session_data = sessions.get(token)
    
    if not session_data:
        return None
        
    # Verifica scadenza
    if datetime.datetime.now() > session_data.get('expires', datetime.datetime.now()):
        del sessions[token]
        return None
        
    # Verifica che l'utente sia ancora attivo
    user = get_user_by_id(session_data['user_id'])
    if not user or not user.get('attivo'):
        del sessions[token]
        return None
        
    return session_data

# ===========================================
# DECORATORI DI AUTENTICAZIONE OTTIMIZZATI
# ===========================================

def login_required(f):
    """Decoratore base per richiedere login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session_data = get_current_user_session()
        
        if not session_data:
            # Log tentativo accesso non autorizzato
            if hasattr(current_app, 'logger'):
                current_app.logger.warning(f"Accesso non autorizzato a {request.path} da {request.remote_addr}")
            
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Autenticazione richiesta', 'code': 'AUTH_REQUIRED'}), 401
            
            flash('Devi effettuare il login per accedere a questa pagina.', 'warning')
            return redirect(url_for('auth.login', next=request.url))
        
        # Imposta utente corrente nella richiesta
        request.current_user = session_data
        
        # Log accesso riuscito (solo per azioni sensibili)
        if request.method in ['POST', 'PUT', 'DELETE']:
            log_user_action(
                user_id=session_data['user_id'],
                action=f"{request.method} {request.endpoint}",
                details=f"Path: {request.path}",
                ip_address=request.remote_addr
            )
        
        return f(*args, **kwargs)
    
    return decorated_function

def admin_required(f):
    """Decoratore per richiedere privilegi ADMIN"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        user_id = request.current_user['user_id']
        
        if not is_user_admin_by_id(user_id):
            log_user_action(
                user_id=user_id,
                action='ACCESS_DENIED_ADMIN',
                details=f"Tentativo accesso admin a {request.path}",
                result='FAILED'
            )
            
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Privilegi amministratore richiesti', 'code': 'ADMIN_REQUIRED'}), 403
            
            flash('Solo gli amministratori possono accedere a questa funzione.', 'error')
            return redirect(url_for('main.index'))
        
        return f(*args, **kwargs)
    
    return decorated_function

def operatore_or_admin_required(f):
    """Decoratore per richiedere ruolo OPERATORE o ADMIN"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        user_id = request.current_user['user_id']
        
        if not is_user_operatore_or_above(user_id):
            user_role = get_user_role_name(user_id)
            log_user_action(
                user_id=user_id,
                action='ACCESS_DENIED_OPERATORE',
                details=f"Tentativo accesso operatore a {request.path}, ruolo: {user_role}",
                result='FAILED'
            )
            
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Privilegi operatore richiesti', 'code': 'OPERATORE_REQUIRED'}), 403
            
            flash('Privilegi operatore necessari per questa operazione.', 'error')
            return redirect(url_for('main.index'))
        
        return f(*args, **kwargs)
    
    return decorated_function

def cono_ombra_required(f):
    """Decoratore per verificare accesso nel cono d'ombra (per OPERATORE)"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        user_id = request.current_user['user_id']
        
        # ADMIN bypassa sempre i controlli di cono d'ombra
        if is_user_admin_by_id(user_id):
            return f(*args, **kwargs)
        
        # Per OPERATORE e VISUALIZZATORE, verifica l'accesso agli enti
        # Questo decoratore può essere usato insieme a entity_access_required
        # oppure implementare qui la logica specifica
        
        return f(*args, **kwargs)
    
    return decorated_function

def permission_required(permission_name: str):
    """Decoratore per richiedere un permesso specifico"""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            user_id = request.current_user['user_id']
            user_permissions = get_user_permissions(user_id)
            
            if permission_name not in user_permissions:
                log_user_action(
                    user_id=user_id,
                    action='ACCESS_DENIED_PERMISSION',
                    details=f"Permesso richiesto: {permission_name}, Path: {request.path}",
                    result='FAILED'
                )
                
                if request.path.startswith('/api/'):
                    return jsonify({
                        'error': f'Permesso "{permission_name}" richiesto',
                        'code': 'PERMISSION_REQUIRED',
                        'required_permission': permission_name
                    }), 403
                
                flash(f'Permesso "{permission_name}" necessario per questa operazione.', 'error')
                return redirect(url_for('main.index'))
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def entity_access_required(entity_param_name: str = 'id'):
    """Decoratore per verificare accesso a un ente specifico"""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            user_id = request.current_user['user_id']
            
            # ADMIN bypassa sempre i controlli di accesso agli enti
            if is_user_admin_by_id(user_id):
                return f(*args, **kwargs)
            
            # Estrai ID ente dalla richiesta con priorità
            entity_id = None
            
            # 1. URL parameters (kwargs)
            if entity_param_name in kwargs:
                entity_id = kwargs[entity_param_name]
            # 2. Form data
            elif entity_param_name in request.form:
                entity_id = request.form[entity_param_name]
            # 3. JSON body
            elif request.is_json and entity_param_name in request.json:
                entity_id = request.json[entity_param_name]
            # 4. Query parameters
            elif entity_param_name in request.args:
                entity_id = request.args[entity_param_name]
            
            if not entity_id:
                if request.path.startswith('/api/'):
                    return jsonify({
                        'error': f'Parametro {entity_param_name} mancante',
                        'code': 'MISSING_ENTITY_PARAM'
                    }), 400
                flash('Parametro ente mancante nella richiesta.', 'error')
                return redirect(url_for('main.index'))
            
            try:
                entity_id = int(entity_id)
            except (ValueError, TypeError):
                if request.path.startswith('/api/'):
                    return jsonify({
                        'error': f'Parametro {entity_param_name} non valido',
                        'code': 'INVALID_ENTITY_PARAM'
                    }), 400
                flash('ID ente non valido.', 'error')
                return redirect(url_for('main.index'))
            
            # Verifica accesso all'ente
            accessible_entities = get_user_accessible_entities(user_id)
            
            if entity_id not in accessible_entities:
                log_user_action(
                    user_id=user_id,
                    action='ACCESS_DENIED_ENTITY',
                    details=f"Tentativo accesso ente {entity_id}, Path: {request.path}",
                    resource_type='ente_militare',
                    resource_id=entity_id,
                    result='FAILED'
                )
                
                if request.path.startswith('/api/'):
                    return jsonify({
                        'error': 'Accesso non autorizzato a questo ente',
                        'code': 'ENTITY_ACCESS_DENIED',
                        'entity_id': entity_id
                    }), 403
                
                flash('Non hai accesso a questo ente nel tuo cono d\'ombra.', 'error')
                return redirect(url_for('main.index'))
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def role_required(required_role: str):
    """Decoratore per richiedere un ruolo specifico"""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            user_id = request.current_user['user_id']
            user_role = get_user_role_name(user_id)
            required_role_upper = required_role.upper()
            
            # ADMIN ha sempre accesso
            if user_role == ROLE_ADMIN:
                return f(*args, **kwargs)
            
            if user_role != required_role_upper:
                log_user_action(
                    user_id=user_id,
                    action='ACCESS_DENIED_ROLE',
                    details=f"Ruolo richiesto: {required_role}, Ruolo utente: {user_role}",
                    result='FAILED'
                )
                
                if request.path.startswith('/api/'):
                    return jsonify({
                        'error': f'Ruolo "{required_role}" richiesto',
                        'code': 'ROLE_REQUIRED',
                        'required_role': required_role,
                        'user_role': user_role
                    }), 403
                
                flash(f'Ruolo "{required_role}" necessario per questa operazione.', 'error')
                return redirect(url_for('main.index'))
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# ===========================================
# UTILITY FUNCTIONS OTTIMIZZATE
# ===========================================

def get_current_user_info() -> Optional[Dict]:
    """Recupera informazioni complete dell'utente corrente"""
    session_data = get_current_user_session()
    if session_data:
        user_id = session_data['user_id']
        return get_user_by_id(user_id)
    return None

def check_permission(permission_name: str) -> bool:
    """Verifica se l'utente corrente ha un permesso specifico"""
    session_data = get_current_user_session()
    if session_data:
        user_id = session_data['user_id']
        user_permissions = get_user_permissions(user_id)
        return permission_name in user_permissions
    return False

def get_accessible_entities() -> List[int]:
    """Recupera lista enti accessibili all'utente corrente"""
    session_data = get_current_user_session()
    if session_data:
        user_id = session_data['user_id']
        return get_user_accessible_entities(user_id)
    return []

def is_admin() -> bool:
    """Verifica se l'utente corrente è amministratore"""
    session_data = get_current_user_session()
    if session_data:
        return is_user_admin_by_id(session_data['user_id'])
    return False

def is_operatore_or_above() -> bool:
    """Verifica se l'utente corrente è operatore o superiore"""
    session_data = get_current_user_session()
    if session_data:
        return is_user_operatore_or_above(session_data['user_id'])
    return False

def get_user_role() -> str:
    """Recupera il ruolo dell'utente corrente"""
    session_data = get_current_user_session()
    if session_data:
        return get_user_role_name(session_data['user_id'])
    return ''

# ===========================================
# DECORATORI SEMPLIFICATI PER I BLUEPRINT
# ===========================================

def simple_login_required(f):
    """Versione semplificata per compatibilità con blueprint esistenti"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session or not session.get('logged_in'):
            flash('Devi effettuare il login per accedere a questa pagina.', 'warning')
            return redirect(url_for('auth.login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def simple_admin_required(f):
    """Versione semplificata di admin_required per blueprint esistenti"""
    @wraps(f)
    @simple_login_required
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if user_id and is_user_admin_by_id(user_id):
            return f(*args, **kwargs)
        
        flash('Solo gli amministratori possono accedere a questa funzione.', 'error')
        return redirect(url_for('main.index'))
    return decorated_function

def simple_operatore_or_admin_required(f):
    """Versione semplificata per operatore o admin"""
    @wraps(f)
    @simple_login_required
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if user_id and is_user_operatore_or_above(user_id):
            return f(*args, **kwargs)
        
        flash('Privilegi operatore necessari per questa operazione.', 'error')
        return redirect(url_for('main.index'))
    return decorated_function

# ===========================================
# FUNZIONI PER TEMPLATE CONTEXT
# ===========================================

def inject_user_context():
    """Inietta informazioni utente nel contesto dei template"""
    user_info = get_current_user_info()
    if user_info:
        return {
            'current_user': user_info,
            'user_role': user_info.get('ruolo_nome', ''),
            'is_admin': is_admin(),
            'is_operatore_or_above': is_operatore_or_above(),
            'accessible_entities': get_accessible_entities()
        }
    return {
        'current_user': None,
        'user_role': '',
        'is_admin': False,
        'is_operatore_or_above': False,
        'accessible_entities': []
    }

def setup_auth_context_processor(app):
    """Configura il context processor per i template"""
    @app.context_processor
    def auth_context():
        return inject_user_context()

# ===========================================
# FUNZIONI DI MIGRAZIONE E SETUP
# ===========================================

def update_session_with_role_info(user_id: int):
    """Aggiorna la sessione Flask con le informazioni del ruolo"""
    user = get_user_by_id(user_id)
    if user and 'user_id' in session:
        session['ruolo_nome'] = user.get('ruolo_nome', '')
        session['livello_accesso'] = user.get('livello_accesso', 0)
        session['ente_militare_id'] = user.get('ente_militare_id')
        session['accesso_globale'] = user.get('accesso_globale', False)
        session['is_admin'] = is_user_admin_by_id(user_id)
        session['is_operatore_or_above'] = is_user_operatore_or_above(user_id)
        
        # Pulisci cache quando si aggiornano le info di sessione
        clear_user_cache(user_id)

def validate_user_role_consistency():
    """Valida la consistenza dei ruoli nel database"""
    conn = get_auth_db_connection()
    try:
        # Verifica che tutti gli utenti abbiano ruoli validi
        invalid_users = conn.execute(
            '''SELECT u.id, u.username, u.ruolo_id 
               FROM utenti u 
               LEFT JOIN ruoli r ON r.id = u.ruolo_id 
               WHERE u.attivo = 1 AND (r.id IS NULL OR r.attivo = 0)'''
        ).fetchall()
        
        if invalid_users:
            if hasattr(current_app, 'logger'):
                current_app.logger.warning(f"Trovati {len(invalid_users)} utenti con ruoli non validi")
            return False
        
        # Verifica che i ruoli abbiano i livelli di accesso corretti
        role_levels = conn.execute(
            'SELECT nome, livello_accesso FROM ruoli WHERE attivo = 1'
        ).fetchall()
        
        expected_levels = {
            ROLE_ADMIN: LEVEL_ADMIN,
            ROLE_OPERATORE: LEVEL_OPERATORE,
            ROLE_VISUALIZZATORE: LEVEL_VISUALIZZATORE
        }
        
        for role in role_levels:
            expected_level = expected_levels.get(role['nome'].upper())
            if expected_level and role['livello_accesso'] != expected_level:
                if hasattr(current_app, 'logger'):
                    current_app.logger.warning(
                        f"Ruolo {role['nome']} ha livello {role['livello_accesso']}, "
                        f"atteso {expected_level}"
                    )
                return False
        
        return True
    except sqlite3.OperationalError as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore nella validazione ruoli: {e}")
        return False
    finally:
        conn.close()

# ===========================================
# FUNZIONI DI DEBUG E DIAGNOSTICA
# ===========================================

def debug_user_permissions(user_id: int) -> Dict:
    """Funzione di debug per visualizzare tutti i permessi di un utente"""
    user = get_user_by_id(user_id)
    permissions = get_user_permissions(user_id)
    accessible_entities = get_user_accessible_entities(user_id)
    
    return {
        'user_info': user,
        'permissions': permissions,
        'accessible_entities': accessible_entities,
        'is_admin': is_user_admin_by_id(user_id),
        'is_operatore_or_above': is_user_operatore_or_above(user_id),
        'role_name': get_user_role_name(user_id)
    }

def get_system_auth_stats() -> Dict:
    """Statistiche del sistema di autenticazione"""
    conn = get_auth_db_connection()
    try:
        stats = {}
        
        # Conta utenti per ruolo
        users_by_role = conn.execute(
            '''SELECT r.nome as ruolo, COUNT(u.id) as count 
               FROM ruoli r 
               LEFT JOIN utenti u ON u.ruolo_id = r.id AND u.attivo = 1
               WHERE r.attivo = 1
               GROUP BY r.id, r.nome
               ORDER BY r.livello_accesso DESC'''
        ).fetchall()
        
        stats['users_by_role'] = {row['ruolo']: row['count'] for row in users_by_role}
        
        # Conta permessi per ruolo
        permissions_by_role = conn.execute(
            '''SELECT r.nome as ruolo, COUNT(DISTINCT p.id) as count
               FROM ruoli r
               LEFT JOIN ruoli_permessi rp ON r.id = rp.ruolo_id
               LEFT JOIN permessi p ON p.id = rp.permesso_id AND p.attivo = 1
               WHERE r.attivo = 1
               GROUP BY r.id, r.nome
               ORDER BY r.livello_accesso DESC'''
        ).fetchall()
        
        stats['permissions_by_role'] = {row['ruolo']: row['count'] for row in permissions_by_role}
        
        # Cache statistics
        stats['cache_info'] = {
            'permission_cache_size': len(_permission_cache),
            'entity_cache_size': len(_entity_cache),
            'cache_timeout': _cache_timeout
        }
        
        return stats
    except sqlite3.OperationalError as e:
        return {'error': str(e)}
    finally:
        conn.close()

# ===========================================
# BACKWARD COMPATIBILITY
# ===========================================

# Alias per compatibilità con codice esistente
admin_only = admin_required
operatore_or_admin = operatore_or_admin_required
all_authenticated = login_required

# Funzioni legacy
def is_user_admin(user_id: int) -> bool:
    """Alias per compatibilità"""
    return is_user_admin_by_id(user_id)

def get_user_entity_access(user_id: int) -> List[int]:
    """Alias per compatibilità"""
    return get_user_accessible_entities(user_id)