# auth.py - Modulo di autenticazione con gestione sessioni web
import sqlite3
import datetime
import os
from functools import wraps
from flask import request, jsonify, redirect, current_app, session
from typing import Optional, Dict, List

# ===========================================
# CONFIGURAZIONE
# ===========================================

# Calcola il percorso assoluto del database
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'talon_data.db')

# ===========================================
# FUNZIONI DATABASE
# ===========================================

def get_auth_db_connection():
    """Connessione al database per autenticazione"""
    print(f"DEBUG: Tentativo connessione a: {DATABASE}")
    print(f"DEBUG: File esiste: {os.path.exists(DATABASE)}")
    
    if not os.path.exists(DATABASE):
        raise FileNotFoundError(f"Database non trovato: {DATABASE}")
    
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    
    # Verifica che la tabella utenti esista
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='utenti'")
        result = cursor.fetchone()
        if not result:
            print("DEBUG: Tabella 'utenti' non trovata nel database")
            # Elenca tutte le tabelle disponibili
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            print(f"DEBUG: Tabelle disponibili: {[table['name'] for table in tables]}")
    except Exception as e:
        print(f"DEBUG: Errore verifica tabelle: {e}")
    
    return conn

def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Recupera utente per ID"""
    conn = get_auth_db_connection()
    try:
        user = conn.execute(
            '''SELECT u.*, r.nome as ruolo_nome, r.livello_accesso, em.nome as ente_nome
               FROM utenti u 
               LEFT JOIN ruoli r ON r.id = u.ruolo_id
               LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
               WHERE u.id = ? AND u.attivo = 1''', 
            (user_id,)
        ).fetchone()
        conn.close()
        return dict(user) if user else None
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore get_user_by_id: {e}")
        conn.close()
        return None

def get_user_by_username(username: str) -> Optional[Dict]:
    """Recupera utente per username"""
    conn = get_auth_db_connection()
    try:
        user = conn.execute(
            '''SELECT u.*, r.nome as ruolo_nome, r.livello_accesso, em.nome as ente_nome
               FROM utenti u 
               LEFT JOIN ruoli r ON r.id = u.ruolo_id
               LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
               WHERE u.username = ? AND u.attivo = 1''', 
            (username,)
        ).fetchone()
        conn.close()
        return dict(user) if user else None
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore get_user_by_username: {e}")
        conn.close()
        return None

def get_user_permissions(user_id: int) -> List[str]:
    """Recupera tutti i permessi di un utente"""
    conn = get_auth_db_connection()
    try:
        permissions = conn.execute(
            '''SELECT DISTINCT p.nome 
               FROM permessi p
               JOIN ruoli_permessi rp ON p.id = rp.permesso_id
               JOIN utenti u ON u.ruolo_id = rp.ruolo_id
               WHERE u.id = ? AND p.attivo = 1''',
            (user_id,)
        ).fetchall()
        conn.close()
        return [p['nome'] for p in permissions]
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore get_user_permissions: {e}")
        # Se le tabelle non esistono ancora, dai permessi di default
        conn.close()
        return ['VIEW_ATTIVITA', 'CREATE_ATTIVITA', 'EDIT_ATTIVITA', 'VIEW_ENTI', 'CREATE_ENTI']

def get_user_accessible_entities(user_id: int) -> List[int]:
    """Recupera gli enti accessibili dall'utente (cono d'ombra)"""
    conn = get_auth_db_connection()
    try:
        # Prima controlla se l'utente ha accesso globale
        user = conn.execute('SELECT accesso_globale FROM utenti WHERE id = ?', (user_id,)).fetchone()
        if user and user['accesso_globale']:
            # Accesso globale - può vedere tutti gli enti
            entities = conn.execute('SELECT id FROM enti_militari').fetchall()
            conn.close()
            return [e['id'] for e in entities]
        
        # Usa la vista del cono d'ombra se esiste
        entities = conn.execute(
            '''SELECT DISTINCT ente_id 
               FROM v_enti_accessibili 
               WHERE utente_id = ?''',
            (user_id,)
        ).fetchall()
        conn.close()
        return [e['ente_id'] for e in entities]
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore get_user_accessible_entities: {e}")
        try:
            # Se la vista non esiste, restituisci tutti gli enti (per ora)
            entities = conn.execute('SELECT id FROM enti_militari').fetchall()
            conn.close()
            return [e['id'] for e in entities]
        except sqlite3.OperationalError:
            conn.close()
            return []

def log_user_action(user_id: int, action: str, details: str = None, 
                   resource_type: str = None, resource_id: int = None,
                   ip_address: str = None, result: str = 'SUCCESS'):
    """Registra azione utente nel log"""
    conn = get_auth_db_connection()
    try:
        conn.execute(
            '''INSERT INTO log_utenti 
               (utente_id, azione, dettagli, risorsa_tipo, risorsa_id, ip_address, esito)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (user_id, action, details, resource_type, resource_id, ip_address, result)
        )
        conn.commit()
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore log_user_action: {e}")
        # Tabella log non esiste ancora
        pass
    conn.close()

# ===========================================
# GESTIONE SESSIONI MISTA (TOKEN + SESSION)
# ===========================================

def verify_session_token(token: str) -> Optional[Dict]:
    """Verifica token di sessione (per API)"""
    sessions = current_app.config.get('user_sessions', {})
    session_data = sessions.get(token)
    
    if not session_data:
        return None
        
    # Verifica scadenza
    if datetime.datetime.now() > session_data['expires']:
        del sessions[token]
        return None
        
    return session_data

def get_current_user_session() -> Optional[Dict]:
    """Recupera sessione utente corrente (web session o token)"""
    # Metodo 1: Flask session (per pagine web)
    if 'user_id' in session and 'username' in session:
        return {
            'user_id': session['user_id'],
            'username': session['username']
        }
    
    # Metodo 2: Token Authorization header (per API)
    token = None
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
    
    # Metodo 3: Token nei cookie (fallback)
    elif 'auth_token' in request.cookies:
        token = request.cookies['auth_token']
    
    if token:
        return verify_session_token(token)
    
    return None

# ===========================================
# DECORATORI DI AUTENTICAZIONE AGGIORNATI
# ===========================================

def login_required(f):
    """
    Decoratore per richiedere login (supporta sia web session che token)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Recupera sessione utente (web o token)
        session_data = get_current_user_session()
        
        if not session_data:
            print(f"DEBUG: Nessuna sessione trovata per {request.path}")
            print(f"DEBUG: Flask session: {dict(session)}")
            print(f"DEBUG: Headers: {dict(request.headers)}")
            
            # Per richieste API, restituisci JSON
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Token di autenticazione mancante'}), 401
            # Per pagine web, reindirizza al login
            return redirect('/components/login')
        
        print(f"DEBUG: Sessione trovata per user_id: {session_data['user_id']}")
        
        # Aggiungi dati utente alla richiesta
        request.current_user = session_data
        
        # Log dell'accesso (opzionale)
        try:
            log_user_action(
                session_data['user_id'], 
                f'ACCESS_{request.method}',
                f'Route: {request.path}',
                ip_address=request.remote_addr
            )
        except Exception as e:
            print(f"DEBUG: Errore logging: {e}")
        
        return f(*args, **kwargs)
    
    return decorated_function

def permission_required(permission_name: str):
    """
    Decoratore per richiedere un permesso specifico.
    """
    def decorator(f):
        @wraps(f)
        @login_required  # Richiede prima il login
        def decorated_function(*args, **kwargs):
            user_id = request.current_user['user_id']
            user_permissions = get_user_permissions(user_id)
            
            print(f"DEBUG: User {user_id} ha permessi: {user_permissions}")
            print(f"DEBUG: Permesso richiesto: {permission_name}")
            
            # Verifica se l'utente ha il permesso richiesto
            if permission_name not in user_permissions:
                print(f"DEBUG: Accesso negato - permesso {permission_name} mancante")
                
                try:
                    log_user_action(
                        user_id,
                        'ACCESS_DENIED',
                        f'Tentativo accesso senza permesso: {permission_name}',
                        'permission',
                        None,
                        request.remote_addr,
                        'FAILED'
                    )
                except Exception as e:
                    print(f"DEBUG: Errore logging: {e}")
                
                if request.path.startswith('/api/'):
                    return jsonify({'error': f'Permesso "{permission_name}" richiesto'}), 403
                
                # Per pagine web, mostra errore 403
                return f"Accesso negato: permesso {permission_name} richiesto", 403
            
            print(f"DEBUG: Permesso {permission_name} concesso")
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def entity_access_required(entity_param_name: str = 'ente_id'):
    """
    Decoratore per verificare accesso a un ente specifico (cono d'ombra).
    """
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            user_id = request.current_user['user_id']
            
            # Estrai ID ente dalla richiesta
            entity_id = None
            
            # Cerca nei parametri URL
            if entity_param_name in kwargs:
                entity_id = kwargs[entity_param_name]
            # Cerca nei form data
            elif entity_param_name in request.form:
                entity_id = request.form[entity_param_name]
            # Cerca nei JSON data
            elif request.is_json and entity_param_name in request.json:
                entity_id = request.json[entity_param_name]
            # Cerca nei query parameters
            elif entity_param_name in request.args:
                entity_id = request.args[entity_param_name]
            
            if not entity_id:
                if request.path.startswith('/api/'):
                    return jsonify({'error': f'Parametro {entity_param_name} mancante'}), 400
                return "Parametro ente mancante", 400
            
            # Verifica accesso all'ente
            accessible_entities = get_user_accessible_entities(user_id)
            
            if int(entity_id) not in accessible_entities:
                try:
                    log_user_action(
                        user_id,
                        'ACCESS_DENIED',
                        f'Tentativo accesso ente non autorizzato: {entity_id}',
                        'entity',
                        entity_id,
                        request.remote_addr,
                        'FAILED'
                    )
                except Exception as e:
                    print(f"DEBUG: Errore logging: {e}")
                
                if request.path.startswith('/api/'):
                    return jsonify({'error': 'Accesso non autorizzato a questo ente'}), 403
                
                return "Accesso non autorizzato a questo ente", 403
            
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