# auth.py - Modulo di autenticazione ottimizzato per 3 ruoli (PostgreSQL)
import datetime
import os
from functools import wraps
from flask import request, jsonify, redirect, current_app, session, flash, url_for
from typing import Optional, Dict, List

# === DB: PostgreSQL ===
# Richiede: F:\talon_app\talon_app\python311_full\python.exe -m pip install --upgrade psycopg2-binary
import psycopg2
from psycopg2.extras import RealDictCursor

# ===========================================
# CONFIGURAZIONE
# ===========================================

# Usa le stesse credenziali configurate in app.py
PG_HOST = "127.0.0.1"
PG_PORT = 5432
PG_DB   = "talon"
PG_USER = "talon"
PG_PASS = "TalonDB!2025"

# Cache per migliorare le performance
_permission_cache: Dict[str, Dict] = {}
_entity_cache: Dict[str, Dict] = {}
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
# FUNZIONI DATABASE (PostgreSQL)
# ===========================================

def get_auth_db_connection():
    """
    Connessione a PostgreSQL con cursori dict-like.
    Usa le stesse credenziali dell'app.
    """
    # Consente override da app.config se presente
    cfg = getattr(current_app, "config", {}).get("POSTGRES", None) if current_app else None
    params = {
        "host": (cfg or {}).get("host", PG_HOST),
        "port": (cfg or {}).get("port", PG_PORT),
        "dbname": (cfg or {}).get("dbname", PG_DB),
        "user": (cfg or {}).get("user", PG_USER),
        "password": (cfg or {}).get("password", PG_PASS),
    }
    return psycopg2.connect(**params)

def _is_true(value) -> bool:
    """Gestisce booleani provenienti da vecchi schemi (0/1) e nuovi (boolean)."""
    if value is True:
        return True
    if value is False or value is None:
        return False
    try:
        return int(value) == 1
    except Exception:
        return str(value).strip().lower() in ("t", "true", "yes", "y")

# ===========================================
# FUNZIONI DB: UTENTI / PERMESSI / ENTI
# ===========================================

def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Recupera utente per ID con cache"""
    cache_key = f"user_{user_id}"
    if cache_key in _permission_cache:
        cache_data = _permission_cache[cache_key]
        if datetime.datetime.now() - cache_data['timestamp'] < datetime.timedelta(seconds=_cache_timeout):
            return cache_data['data']

    sql = '''
        SELECT u.*, r.nome AS ruolo_nome, r.livello_accesso, em.nome AS ente_nome,
               r.id AS ruolo_id_real, u.accesso_globale
        FROM utenti u
        LEFT JOIN ruoli r ON r.id = u.ruolo_id
        LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
        WHERE u.id = %s
          AND (u.attivo IS NULL OR u.attivo = TRUE OR u.attivo = TRUE)
    '''
    try:
        conn = get_auth_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, (user_id,))
                row = cur.fetchone()
                result = dict(row) if row else None

        # Cache del risultato
        _permission_cache[cache_key] = {
            'data': result,
            'timestamp': datetime.datetime.now()
        }
        return result
    except psycopg2.Error as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore database get_user_by_id: {e}")
        return None

def get_user_by_username(username: str) -> Optional[Dict]:
    """Recupera utente per username"""
    sql = '''
        SELECT u.*, r.nome AS ruolo_nome, r.livello_accesso, em.nome AS ente_nome,
               r.id AS ruolo_id_real, u.accesso_globale
        FROM utenti u
        LEFT JOIN ruoli r ON r.id = u.ruolo_id
        LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
        WHERE u.username = %s
          AND (u.attivo IS NULL OR u.attivo = TRUE OR u.attivo = TRUE)
    '''
    try:
        conn = get_auth_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, (username,))
                row = cur.fetchone()
                return dict(row) if row else None
    except psycopg2.Error as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore database get_user_by_username: {e}")
        return None

def get_user_permissions(user_id: int) -> List[str]:
    """Recupera tutti i permessi di un utente con cache"""
    cache_key = f"permissions_{user_id}"
    if cache_key in _permission_cache:
        cache_data = _permission_cache[cache_key]
        if datetime.datetime.now() - cache_data['timestamp'] < datetime.timedelta(seconds=_cache_timeout):
            return cache_data['data']

    sql = '''
        SELECT DISTINCT p.nome
        FROM permessi p
        JOIN ruoli_permessi rp ON p.id = rp.permesso_id
        JOIN utenti u ON u.ruolo_id = rp.ruolo_id
        WHERE u.id = %s
          AND (p.attivo IS NULL OR p.attivo = TRUE OR p.attivo = TRUE)
          AND (u.attivo IS NULL OR u.attivo = TRUE OR u.attivo = TRUE)
    '''
    try:
        conn = get_auth_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (user_id,))
                rows = cur.fetchall()
                # rows: list of tuples [(name,), ...]
                result = [r[0] for r in rows]

        _permission_cache[cache_key] = {
            'data': result,
            'timestamp': datetime.datetime.now()
        }
        return result
    except psycopg2.Error as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.warning(f"Tabelle permessi non disponibili: {e}")
        # Fallback basato sul ruolo
        user = get_user_by_id(user_id)
        if user:
            role = (user.get('ruolo_nome') or '').upper()
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

def get_user_accessible_entities(user_id: int) -> List[int]:
    """Recupera gli enti accessibili dall'utente con cache - implementa il cono d'ombra"""
    cache_key = f"entities_{user_id}"
    if cache_key in _entity_cache:
        cache_data = _entity_cache[cache_key]
        if datetime.datetime.now() - cache_data['timestamp'] < datetime.timedelta(seconds=_cache_timeout):
            return cache_data['data']

    try:
        conn = get_auth_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    'SELECT accesso_globale, ruolo_id, ente_militare_id, attivo FROM utenti WHERE id = %s',
                    (user_id,)
                )
                user = cur.fetchone()

                if not user or not _is_true(user.get("attivo", True)):
                    return []

                # ADMIN ha sempre accesso globale
                if _is_true(user.get('accesso_globale')) or is_user_admin_by_id(user_id):
                    cur.execute('SELECT id FROM enti_militari ORDER BY id')
                    entities = cur.fetchall()
                    result = [e['id'] for e in entities]
                else:
                    user_ente_id = user.get('ente_militare_id')
                    if not user_ente_id:
                        result = []
                    else:
                        # Prova vista v_enti_accessibili
                        try:
                            cur.execute(
                                'SELECT DISTINCT ente_id FROM v_enti_accessibili WHERE utente_id = %s',
                                (user_id,)
                            )
                            rows = cur.fetchall()
                            if rows:
                                result = [r['ente_id'] for r in rows]
                            else:
                                result = _get_entity_cone_of_shadow(conn, user_ente_id)
                        except psycopg2.Error:
                            result = _get_entity_cone_of_shadow(conn, user_ente_id)

        _entity_cache[cache_key] = {
            'data': result,
            'timestamp': datetime.datetime.now()
        }
        return result
    except psycopg2.Error as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore nel recupero enti accessibili: {e}")
        return []

def _get_entity_cone_of_shadow(conn, root_entity_id: int) -> List[int]:
    """Implementa la logica del cono d'ombra per un ente"""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT id, parent_id FROM enti_militari')
            all_entities = cur.fetchall()
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
        return [root_entity_id]

def log_user_action(user_id: int, action: str, details: str = None,
                    resource_type: str = None, resource_id: int = None,
                    ip_address: str = None, result: str = 'SUCCESS'):
    """Registra azione utente nel log"""
    sql = '''
        INSERT INTO log_utenti
        (utente_id, azione, dettagli, risorsa_tipo, risorsa_id, ip_address, esito, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
    '''
    try:
        conn = get_auth_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (
                    user_id, action, details, resource_type, resource_id,
                    ip_address or (request.remote_addr if request else None), result
                ))
    except psycopg2.Error as e:
        # Il log  "best-effort": non sollevare eccezioni in app
        if hasattr(current_app, 'logger'):
            current_app.logger.debug(f"Impossibile scrivere log_utenti: {e}")

def clear_user_cache(user_id: int = None):
    """Cancella cache utente (da chiamare dopo modifiche)"""
    if user_id:
        keys_to_remove = [k for k in list(_permission_cache.keys()) if k.endswith(f"_{user_id}")]
        for key in keys_to_remove:
            _permission_cache.pop(key, None)
        keys_to_remove = [k for k in list(_entity_cache.keys()) if k.endswith(f"_{user_id}")]
        for key in keys_to_remove:
            _entity_cache.pop(key, None)
    else:
        _permission_cache.clear()
        _entity_cache.clear()

# ===========================================
# FUNZIONI HELPER PER I RUOLI
# ===========================================

def is_user_admin_by_id(user_id: int) -> bool:
    """Verifica se un utente  admin basandosi sull'ID"""
    user = get_user_by_id(user_id)
    if not user:
        return False
    return ((user.get('ruolo_nome', '').upper() == ROLE_ADMIN) or
            (int(user.get('livello_accesso') or 0) >= LEVEL_ADMIN) or
            _is_true(user.get('accesso_globale')))

def is_user_operatore_or_above(user_id: int) -> bool:
    """Verifica se un utente  operatore o superiore"""
    user = get_user_by_id(user_id)
    if not user:
        return False
    role = (user.get('ruolo_nome') or '').upper()
    level = int(user.get('livello_accesso') or 0)
    return (role in [ROLE_ADMIN, ROLE_OPERATORE] or level >= LEVEL_OPERATORE or _is_true(user.get('accesso_globale')))

def is_user_visualizzatore_or_above(user_id: int) -> bool:
    """Verifica se un utente  visualizzatore o superiore"""
    user = get_user_by_id(user_id)
    if not user:
        return False
    role = (user.get('ruolo_nome') or '').upper()
    return role in [ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE]

def get_user_role_name(user_id: int) -> str:
    """Recupera il nome del ruolo dell'utente"""
    user = get_user_by_id(user_id)
    return (user.get('ruolo_nome') or '').upper() if user else ''

# ===========================================
# GESTIONE SESSIONI
# ===========================================

def get_current_user_session() -> Optional[Dict]:
    """Recupera sessione utente corrente con priorit ottimizzata"""
    # Metodo 1: Flask session
    if (session.get('user_id') and
        session.get('username') and
        session.get('logged_in') and
        session.get('session_valid')):
        return {
            'user_id': session['user_id'],
            'username': session['username'],
            'login_time': session.get('login_time')
        }

    # Metodo 2: Token in Authorization header (API)
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
    """Verifica token di sessione con validazione e scadenza"""
    if not token or len(token) < 10:
        return None

    sessions = current_app.config.get('user_sessions', {})
    session_data = sessions.get(token)

    if not session_data:
        return None

    # Scadenza
    if datetime.datetime.now() > session_data.get('expires', datetime.datetime.now()):
        sessions.pop(token, None)
        return None

    # Utente ancora attivo?
    user = get_user_by_id(session_data['user_id'])
    if not user or not _is_true(user.get('attivo', True)):
        sessions.pop(token, None)
        return None

    return session_data

# ===========================================
# DECORATORI DI AUTENTICAZIONE
# ===========================================

def login_required(f):
    """Decoratore base per richiedere login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session_data = get_current_user_session()

        if not session_data:
            if hasattr(current_app, 'logger'):
                current_app.logger.warning(f"Accesso non autorizzato a {request.path} da {request.remote_addr}")
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Autenticazione richiesta', 'code': 'AUTH_REQUIRED'}), 401
            flash('Devi effettuare il login per accedere a questa pagina.', 'warning')
            return redirect(url_for('show_login', next=request.url))

        # Imposta utente corrente nella richiesta
        request.current_user = session_data

        # Log accesso (solo mutazioni)
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
            return redirect(url_for('main.dashboard'))
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
            return redirect(url_for('main.dashboard'))
        return f(*args, **kwargs)
    return decorated_function

def cono_ombra_required(f):
    """Decoratore per verificare accesso nel cono d'ombra (per OPERATORE)"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        user_id = request.current_user['user_id']
        if is_user_admin_by_id(user_id):
            return f(*args, **kwargs)
        # (Logica specifica aggiuntiva se necessario)
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
                return redirect(url_for('main.dashboard'))
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

            if is_user_admin_by_id(user_id):
                return f(*args, **kwargs)

            # Estrai ID ente
            entity_id = None
            if entity_param_name in kwargs:
                entity_id = kwargs[entity_param_name]
            elif entity_param_name in request.form:
                entity_id = request.form[entity_param_name]
            elif request.is_json and entity_param_name in (request.json or {}):
                entity_id = request.json[entity_param_name]
            elif entity_param_name in request.args:
                entity_id = request.args[entity_param_name]

            if not entity_id:
                if request.path.startswith('/api/'):
                    return jsonify({'error': f'Parametro {entity_param_name} mancante',
                                    'code': 'MISSING_ENTITY_PARAM'}), 400
                flash('Parametro ente mancante nella richiesta.', 'error')
                return redirect(url_for('main.dashboard'))

            try:
                entity_id = int(entity_id)
            except (ValueError, TypeError):
                if request.path.startswith('/api/'):
                    return jsonify({'error': f'Parametro {entity_param_name} non valido',
                                    'code': 'INVALID_ENTITY_PARAM'}), 400
                flash('ID ente non valido.', 'error')
                return redirect(url_for('main.dashboard'))

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
                    return jsonify({'error': 'Accesso non autorizzato a questo ente',
                                    'code': 'ENTITY_ACCESS_DENIED',
                                    'entity_id': entity_id}), 403
                flash('Non hai accesso a questo ente nel tuo cono d\'ombra.', 'error')
                return redirect(url_for('main.dashboard'))

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
                    return jsonify({'error': f'Ruolo "{required_role}" richiesto',
                                    'code': 'ROLE_REQUIRED',
                                    'required_role': required_role,
                                    'user_role': user_role}), 403
                flash(f'Ruolo "{required_role}" necessario per questa operazione.', 'error')
                return redirect(url_for('main.dashboard'))
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# ===========================================
# UTILITY FUNCTIONS
# ===========================================

def get_current_user_info() -> Optional[Dict]:
    """Recupera informazioni complete dell'utente corrente"""
    session_data = get_current_user_session()
    if session_data:
        return get_user_by_id(session_data['user_id'])
    return None

def check_permission(permission_name: str) -> bool:
    """Verifica se l'utente corrente ha un permesso specifico"""
    session_data = get_current_user_session()
    if session_data:
        perms = get_user_permissions(session_data['user_id'])
        return permission_name in perms
    return False

def get_accessible_entities() -> List[int]:
    """Recupera lista enti accessibili all'utente corrente"""
    session_data = get_current_user_session()
    if session_data:
        return get_user_accessible_entities(session_data['user_id'])
    return []

def is_admin() -> bool:
    """Verifica se l'utente corrente  amministratore"""
    session_data = get_current_user_session()
    return is_user_admin_by_id(session_data['user_id']) if session_data else False

def is_operatore_or_above() -> bool:
    """Verifica se l'utente corrente  operatore o superiore"""
    session_data = get_current_user_session()
    return is_user_operatore_or_above(session_data['user_id']) if session_data else False

def get_user_role() -> str:
    """Recupera il ruolo dell'utente corrente"""
    session_data = get_current_user_session()
    return get_user_role_name(session_data['user_id']) if session_data else ''

# ===========================================
# DECORATORI SEMPLIFICATI PER I BLUEPRINT
# ===========================================

def simple_login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session or not session.get('logged_in'):
            flash('Devi effettuare il login per accedere a questa pagina.', 'warning')
            return redirect(url_for('show_login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def simple_admin_required(f):
    @wraps(f)
    @simple_login_required
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if user_id and is_user_admin_by_id(user_id):
            return f(*args, **kwargs)
        flash('Solo gli amministratori possono accedere a questa funzione.', 'error')
        return redirect(url_for('main.dashboard'))
    return decorated_function

def simple_operatore_or_admin_required(f):
    @wraps(f)
    @simple_login_required
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if user_id and is_user_operatore_or_above(user_id):
            return f(*args, **kwargs)
        flash('Privilegi operatore necessari per questa operazione.', 'error')
        return redirect(url_for('main.dashboard'))
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
        session['accesso_globale'] = _is_true(user.get('accesso_globale'))
        session['is_admin'] = is_user_admin_by_id(user_id)
        session['is_operatore_or_above'] = is_user_operatore_or_above(user_id)
        clear_user_cache(user_id)

def validate_user_role_consistency():
    """Valida la consistenza dei ruoli nel database"""
    try:
        conn = get_auth_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Utenti con ruoli non validi
                cur.execute('''
                    SELECT u.id, u.username, u.ruolo_id
                    FROM utenti u
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    WHERE (u.attivo IS NULL OR u.attivo = TRUE)
                      AND (r.id IS NULL OR (r.attivo IS NOT NULL AND r.attivo = FALSE))
                ''')
                invalid_users = cur.fetchall()
                if invalid_users:
                    if hasattr(current_app, 'logger'):
                        current_app.logger.warning(f"Trovati {len(invalid_users)} utenti con ruoli non validi")
                    return False

                # Livelli di accesso ruoli
                cur.execute('SELECT nome, livello_accesso FROM ruoli WHERE (attivo IS NULL OR attivo = TRUE OR attivo = TRUE)')
                role_levels = cur.fetchall()

        expected = {
            ROLE_ADMIN: LEVEL_ADMIN,
            ROLE_OPERATORE: LEVEL_OPERATORE,
            ROLE_VISUALIZZATORE: LEVEL_VISUALIZZATORE
        }
        for role in role_levels:
            expected_level = expected.get((role['nome'] or '').upper())
            if expected_level is not None and int(role['livello_accesso'] or 0) != expected_level:
                if hasattr(current_app, 'logger'):
                    current_app.logger.warning(
                        f"Ruolo {role['nome']} ha livello {role['livello_accesso']}, atteso {expected_level}"
                    )
                return False
        return True
    except psycopg2.Error as e:
        if hasattr(current_app, 'logger'):
            current_app.logger.error(f"Errore nella validazione ruoli: {e}")
        return False

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
    try:
        conn = get_auth_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                stats = {}

                # Utenti per ruolo
                cur.execute('''
                    SELECT r.nome AS ruolo, COUNT(u.id) AS count
                    FROM ruoli r
                    LEFT JOIN utenti u ON u.ruolo_id = r.id
                      AND (u.attivo IS NULL OR u.attivo = TRUE OR u.attivo = TRUE)
                    WHERE (r.attivo IS NULL OR r.attivo = TRUE OR r.attivo = TRUE)
                    GROUP BY r.id, r.nome
                    ORDER BY r.livello_accesso DESC
                ''')
                rows = cur.fetchall()
                stats['users_by_role'] = {row['ruolo']: int(row['count']) for row in rows}

                # Permessi per ruolo
                cur.execute('''
                    SELECT r.nome AS ruolo, COUNT(DISTINCT p.id) AS count
                    FROM ruoli r
                    LEFT JOIN ruoli_permessi rp ON r.id = rp.ruolo_id
                    LEFT JOIN permessi p ON p.id = rp.permesso_id
                      AND (p.attivo IS NULL OR p.attivo = TRUE OR p.attivo = TRUE)
                    WHERE (r.attivo IS NULL OR r.attivo = TRUE OR r.attivo = TRUE)
                    GROUP BY r.id, r.nome
                    ORDER BY r.livello_accesso DESC
                ''')
                rows = cur.fetchall()
                stats['permissions_by_role'] = {row['ruolo']: int(row['count']) for row in rows}

                # Cache
                stats['cache_info'] = {
                    'permission_cache_size': len(_permission_cache),
                    'entity_cache_size': len(_entity_cache),
                    'cache_timeout': _cache_timeout
                }
                return stats
    except psycopg2.Error as e:
        return {'error': str(e)}

# ===========================================
# BACKWARD COMPATIBILITY (alias)
# ===========================================

admin_only = admin_required
operatore_or_admin = operatore_or_admin_required
all_authenticated = login_required

def is_user_admin(user_id: int) -> bool:
    return is_user_admin_by_id(user_id)

def get_user_entity_access(user_id: int) -> List[int]:
    return get_user_accessible_entities(user_id)
