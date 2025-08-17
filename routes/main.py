# routes/main.py - Blueprint principale per dashboard e amministrazione
from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, get_flashed_messages
from auth import (
    login_required, admin_required, operatore_or_admin_required,
    get_current_user_info, log_user_action, get_user_accessible_entities,
    is_admin, get_user_role, ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE,
    get_auth_db_connection  # usa la connessione centralizzata (PostgreSQL)
)
from psycopg2.extras import RealDictCursor
from datetime import datetime
import re

# ===========================================
# DEFINIZIONE BLUEPRINT
# ===========================================
main_bp = Blueprint(
    'main',
    __name__,
    template_folder='../templates',
    static_folder='../static'
)

# ===========================================
# HELPERS DATABASE
# ===========================================

def get_db_connection():
    """
    Wrapper per ottenere la connessione database dal modulo auth.
    Centralizza la gestione delle connessioni PostgreSQL.
    """
    return get_auth_db_connection()


# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@main_bp.route('/')
def index():
    """
    Route principale - redirect intelligente.
    Se l'utente è loggato va alla dashboard, altrimenti al login.
    """
    from flask import session
    if session.get('logged_in'):
        return redirect(url_for('main.dashboard'))
    return redirect(url_for('show_login'))

@main_bp.route('/dashboard')
@login_required
def dashboard():
    """
    Dashboard principale.
    Mostra statistiche e informazioni generali basate sul ruolo utente.
    """
    user_id = request.current_user['user_id']
    user_info = get_current_user_info()
    user_role = get_user_role()
    
    # Log accesso alla dashboard
    log_user_action(
        user_id,
        'ACCESS_DASHBOARD',
        f'Accesso dashboard - Ruolo: {user_role}',
        'dashboard'
    )
    
    # Ottieni statistiche base per tutti gli utenti
    stats = get_dashboard_stats(user_role)
    
    return render_template(
        'dashboard_new.html',
        user_info=user_info,
        user_role=user_role,
        stats=stats,
        SUPERSET_BASE_URL='http://127.0.0.1:8088',  # URL Superset
        SUPERSET_PROXY_URL='/superset-proxy'        # URL del nostro proxy
    )

@main_bp.route('/dashboard_admin')
@admin_required
def dashboard_admin():
    """
    Dashboard amministratore avanzata.
    Accessibile solo agli amministratori.
    """
    user_id = request.current_user['user_id']
    user_info = get_current_user_info()
    stats = get_admin_dashboard_stats()
    
    # Log accesso dashboard admin
    log_user_action(
        user_id,
        'ACCESS_ADMIN_DASHBOARD',
        'Accesso dashboard amministratore',
        'dashboard_admin'
    )
    
    return render_template(
        'dashboard_admin.html',
        user_info=user_info,
        stats=stats
    )

@main_bp.route('/organigramma')
@login_required
def organigramma_redirect():
    """
    Redirect pulito all'organigramma degli enti militari.
    """
    return redirect('/enti_militari/organigramma')

# ===========================================
# ROUTE AMMINISTRAZIONE
# ===========================================

@main_bp.route('/impostazioni')
@admin_required
def impostazioni():
    """
    Pagina impostazioni principali.
    Solo per amministratori.
    """
    user_info = get_current_user_info()
    
    # Log accesso
    log_user_action(
        request.current_user['user_id'],
        'ACCESS_SETTINGS',
        'Accesso impostazioni sistema',
        'impostazioni'
    )
    
    return render_template('impostazioni.html', user_info=user_info)

@main_bp.route('/impostazioni/utenti')
@admin_required
def gestione_utenti():
    """
    Gestione utenti.
    Lista tutti gli utenti del sistema con i loro ruoli.
    """
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query ottimizzata per ottenere tutti i dati utente
                cur.execute(
                    '''
                    SELECT 
                        u.id,
                        u.username,
                        u.nome,
                        u.cognome,
                        u.ruolo_id,
                        u.ente_militare_id,
                        u.accesso_globale,
                        u.attivo,
                        u.primo_accesso,
                        u.ultimo_accesso,
                        u.data_creazione,
                        u.data_modifica,
                        u.creato_da,
                        u.modificato_da,
                        r.nome AS ruolo_nome,
                        r.livello_accesso,
                        em.nome AS ente_nome,
                        CASE 
                            WHEN u.ultimo_accesso IS NOT NULL 
                            THEN u.ultimo_accesso 
                            ELSE NULL 
                        END as ultimo_accesso_formatted
                    FROM utenti u
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
                    WHERE (u.eliminato IS NULL OR u.eliminato = FALSE)
                    ORDER BY r.livello_accesso DESC, u.cognome, u.nome
                    '''
                )
                users = cur.fetchall()
        
        # Log accesso
        log_user_action(
            request.current_user['user_id'],
            'VIEW_USERS',
            f'Visualizzazione lista utenti ({len(users)} utenti)',
            'gestione_utenti'
        )
        
        return render_template('admin/users.html', users=users)
        
    except Exception as e:
        error_msg = f'Errore nel caricamento utenti: {str(e)}'
        flash(error_msg, 'error')
        
        return redirect(url_for('main.dashboard'))

@main_bp.route('/impostazioni/sistema')
@admin_required
def info_sistema():
    """
    Informazioni di sistema.
    Mostra statistiche database e versione sistema.
    """
    try:
        stats = get_system_info()
        
        # Log accesso
        log_user_action(
            request.current_user['user_id'],
            'VIEW_SYSTEM_INFO',
            'Visualizzazione info sistema',
            'info_sistema'
        )
        
        return render_template('admin/system_info.html', stats=stats)
        
    except Exception as e:
        error_msg = f'Errore nel caricamento info sistema: {str(e)}'
        flash(error_msg, 'error')
        
        return redirect(url_for('main.dashboard'))

# ===========================================
# FUNZIONI HELPER PER STATISTICHE
# ===========================================

def get_dashboard_stats(user_role):
    """
    Ottiene statistiche base per la dashboard principale.
    
    Args:
        user_role: Ruolo dell'utente corrente
        
    Returns:
        dict: Dizionario con le statistiche
    """
    stats = {
        'enti_militari': 0,
        'enti_civili': 0,
        'operazioni_attive': 0,
        'attivita_recenti': 0
    }
    
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Conta enti militari
                cur.execute('SELECT COUNT(*) AS count FROM enti_militari')
                stats['enti_militari'] = int(cur.fetchone()['count'])
                
                # Conta enti civili
                cur.execute('SELECT COUNT(*) AS count FROM enti_civili')
                stats['enti_civili'] = int(cur.fetchone()['count'])
                
                # Operazioni attive
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM operazioni
                    WHERE data_fine IS NULL OR data_fine >= CURRENT_DATE
                    '''
                )
                stats['operazioni_attive'] = int(cur.fetchone()['count'])
                
                # Attività recenti (ultimi 7 giorni)
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM attivita
                    WHERE data_ora >= CURRENT_DATE - INTERVAL '7 days'
                    '''
                )
                stats['attivita_recenti'] = int(cur.fetchone()['count'])
                
    except Exception as e:
        print(f"Errore nel recupero statistiche dashboard: {e}")
    
    return stats

def get_admin_dashboard_stats():
    """
    Ottiene statistiche avanzate per dashboard admin.
    Include dati su utenti, ruoli e utilizzo sistema.
    
    Returns:
        dict: Dizionario con statistiche avanzate
    """
    stats = {
        'users_by_role': {},
        'online_users_by_role': {},
        'enti_militari': 0,
        'enti_civili': 0,
        'operazioni_attive': 0,
        'operazioni_totali': 0,
        'attivita_oggi': 0,
        'attivita_settimana': 0,
        'attivita_mese': 0,
        'utenti_attivi': 0,
        'utenti_online': 0,
        'accessi_oggi': 0
    }
    
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Utenti per ruolo
                cur.execute(
                    '''
                    SELECT r.nome AS ruolo, COUNT(u.id) AS count
                    FROM ruoli r
                    LEFT JOIN utenti u ON u.ruolo_id = r.id
                      AND (u.attivo IS NULL OR u.attivo = TRUE)
                      AND (u.eliminato IS NULL OR u.eliminato = FALSE)
                    GROUP BY r.id, r.nome
                    ORDER BY r.livello_accesso DESC
                    '''
                )
                rows = cur.fetchall()
                stats['users_by_role'] = {row['ruolo']: int(row['count']) for row in rows}
                
                # Utenti online per ruolo (ultimi 15 minuti)
                cur.execute(
                    '''
                    SELECT r.nome AS ruolo, COUNT(u.id) AS count
                    FROM ruoli r
                    LEFT JOIN utenti u ON u.ruolo_id = r.id
                      AND (u.attivo IS NULL OR u.attivo = TRUE)
                      AND (u.eliminato IS NULL OR u.eliminato = FALSE)
                      AND u.ultimo_accesso >= NOW() - INTERVAL '15 minutes'
                    GROUP BY r.id, r.nome
                    ORDER BY r.livello_accesso DESC
                    '''
                )
                online_rows = cur.fetchall()
                stats['online_users_by_role'] = {row['ruolo']: int(row['count']) for row in online_rows}
                
                # Totale utenti online
                stats['utenti_online'] = sum(stats['online_users_by_role'].values())
                
                # Enti totali
                cur.execute('SELECT COUNT(*) AS count FROM enti_militari')
                stats['enti_militari'] = int(cur.fetchone()['count'])
                
                cur.execute('SELECT COUNT(*) AS count FROM enti_civili')
                stats['enti_civili'] = int(cur.fetchone()['count'])
                
                # Operazioni
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM operazioni
                    WHERE data_fine IS NULL OR data_fine >= CURRENT_DATE
                    '''
                )
                stats['operazioni_attive'] = int(cur.fetchone()['count'])
                
                cur.execute('SELECT COUNT(*) AS count FROM operazioni')
                stats['operazioni_totali'] = int(cur.fetchone()['count'])
                
                # Attività per periodo
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM attivita
                    WHERE DATE(data_ora) = CURRENT_DATE
                    '''
                )
                stats['attivita_oggi'] = int(cur.fetchone()['count'])
                
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM attivita
                    WHERE data_ora >= CURRENT_DATE - INTERVAL '7 days'
                    '''
                )
                stats['attivita_settimana'] = int(cur.fetchone()['count'])
                
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM attivita
                    WHERE data_ora >= CURRENT_DATE - INTERVAL '30 days'
                    '''
                )
                stats['attivita_mese'] = int(cur.fetchone()['count'])
                
                # Utenti attivi (login ultimi 30 giorni)
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM utenti
                    WHERE ultimo_accesso >= CURRENT_DATE - INTERVAL '30 days'
                      AND (attivo IS NULL OR attivo = TRUE)
                      AND (eliminato IS NULL OR eliminato = FALSE)
                    '''
                )
                stats['utenti_attivi'] = int(cur.fetchone()['count'])
                
                # Accessi oggi (corretto nome tabella)
                cur.execute(
                    '''
                    SELECT COUNT(DISTINCT utente_id) AS count
                    FROM log_utenti
                    WHERE DATE(timestamp) = CURRENT_DATE
                      AND azione = 'LOGIN_SUCCESS'
                    '''
                )
                result = cur.fetchone()
                stats['accessi_oggi'] = int(result['count']) if result else 0
                
                # Attività recenti (ultimi 10 eventi)
                cur.execute(
                    '''
                    SELECT 
                        l.azione as action,
                        l.dettagli as details,
                        l.timestamp,
                        l.risorsa_tipo as resource_type,
                        u.nome || ' ' || u.cognome as user_name,
                        u.username as user_email
                    FROM log_utenti l
                    LEFT JOIN utenti u ON u.id = l.utente_id
                    WHERE l.esito = 'SUCCESS'
                      AND l.azione NOT IN ('LOGIN_SUCCESS', 'LOGOUT', 'ACCESS_DASHBOARD', 'ACCESS_ADMIN_DASHBOARD')
                    ORDER BY l.timestamp DESC
                    LIMIT 10
                    '''
                )
                stats['recent_activities'] = cur.fetchall()
                
    except Exception as e:
        print(f"Errore nel recupero statistiche admin: {e}")
    
    return stats

def get_system_info():
    """
    Ottiene informazioni dettagliate di sistema.
    Include dimensione database, conteggi record e versione.
    
    Returns:
        dict: Dizionario con informazioni di sistema
    """
    info = {
        'database_size': 0,
        'database_size_mb': '0 MB',
        'total_records': 0,
        'table_counts': {},
        'system_version': '2.0.0',
        'postgres_version': '',
        'connection_count': 0
    }
    
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Dimensione database
                cur.execute("SELECT pg_database_size(current_database()) AS size_bytes")
                size_bytes = int(cur.fetchone()['size_bytes'])
                info['database_size'] = size_bytes
                info['database_size_mb'] = f"{round(size_bytes / (1024 * 1024), 2)} MB"
                
                # Versione PostgreSQL
                cur.execute("SELECT version() AS version")
                version_result = cur.fetchone()
                if version_result:
                    info['postgres_version'] = version_result['version'].split(' on ')[0]
                
                # Conteggio record per tabella
                tables = [
                    'utenti', 'ruoli', 'enti_militari', 'enti_civili',
                    'operazioni', 'attivita', 'log_utenti'
                ]
                total = 0
                for table in tables:
                    try:
                        cur.execute(f'SELECT COUNT(*) AS count FROM {table}')
                        count = int(cur.fetchone()['count'])
                        info['table_counts'][table] = count
                        total += count
                    except Exception:
                        info['table_counts'][table] = 0
                
                info['total_records'] = total
                
                # Numero connessioni attive
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                    '''
                )
                info['connection_count'] = int(cur.fetchone()['count'])
                
    except Exception as e:
        print(f"Errore nel recupero info sistema: {e}")
    
    return info

@main_bp.route('/attivita-recenti')
@admin_required
def recent_activities():
    """
    Visualizza tutte le attività recenti del sistema.
    Solo per amministratori.
    """
    try:
        page = request.args.get('page', 1, type=int)
        per_page = 50
        offset = (page - 1) * per_page
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Conta totale attività
                cur.execute(
                    '''
                    SELECT COUNT(*) as total
                    FROM log_utenti l
                    WHERE l.esito = 'SUCCESS'
                      AND l.azione NOT IN ('LOGIN_SUCCESS', 'LOGOUT', 'ACCESS_DASHBOARD', 'ACCESS_ADMIN_DASHBOARD')
                    '''
                )
                total_activities = cur.fetchone()['total']
                
                # Ottieni attività paginate
                cur.execute(
                    '''
                    SELECT 
                        l.azione as action,
                        l.dettagli as details,
                        l.timestamp,
                        l.risorsa_tipo as resource_type,
                        l.risorsa_id as resource_id,
                        l.ip_address,
                        u.nome || ' ' || u.cognome as user_name,
                        u.username as user_email,
                        r.nome as user_role
                    FROM log_utenti l
                    LEFT JOIN utenti u ON u.id = l.utente_id
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    WHERE l.esito = 'SUCCESS'
                      AND l.azione NOT IN ('LOGIN_SUCCESS', 'LOGOUT', 'ACCESS_DASHBOARD', 'ACCESS_ADMIN_DASHBOARD')
                    ORDER BY l.timestamp DESC
                    LIMIT %s OFFSET %s
                    ''', (per_page, offset)
                )
                activities = cur.fetchall()
        
        # Calcola paginazione
        total_pages = (total_activities + per_page - 1) // per_page
        
        # Log accesso
        log_user_action(
            request.current_user['user_id'],
            'VIEW_ALL_ACTIVITIES',
            f'Visualizzate attività recenti (pagina {page}, {len(activities)} elementi)',
            'activities'
        )
        
        return render_template(
            'admin/recent_activities.html',
            activities=activities,
            current_page=page,
            total_pages=total_pages,
            total_activities=total_activities,
            per_page=per_page
        )
        
    except Exception as e:
        error_msg = f'Errore nel caricamento attività: {str(e)}'
        flash(error_msg, 'error')
        
        return redirect(url_for('main.dashboard_admin'))

# ===========================================
# API ROUTES FOR USER MANAGEMENT CRUD
# ===========================================

@main_bp.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    """
    Crea un nuovo utente.
    """
    try:
        data = request.get_json()
        print(f"[CREATE_USER] Received data: {data}")  # Debug log
        
        if not data:
            return jsonify({'success': False, 'error': 'Nessun dato ricevuto'}), 400
        
        # Validazione dati richiesti
        required_fields = ['nome', 'cognome', 'password', 'ruolo_id', 'username']
        for field in required_fields:
            if not data.get(field):
                print(f"[CREATE_USER] Missing field: {field}")  # Debug log
                return jsonify({'success': False, 'error': f'Campo {field} richiesto'}), 400
        
        # Prendi username (email) dall'input
        username = data['username'].lower().strip()
        
        # Validazione formato email militare
        import re
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9._\-]*@esercito\.difesa\.it$', username):
            return jsonify({'success': False, 'error': 'Email non valida: deve iniziare con lettera/numero e terminare con @esercito.difesa.it'}), 400
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica se username già esiste
                cur.execute('SELECT id FROM utenti WHERE username = %s', (username,))
                if cur.fetchone():
                    return jsonify({'success': False, 'error': f'Utente {username} già esistente'}), 400
                
                # Hash password
                from werkzeug.security import generate_password_hash
                password_hash = generate_password_hash(data['password'])
                
                # Inserisci nuovo utente
                cur.execute('''
                    INSERT INTO utenti (
                        username, password_hash, nome, cognome,
                        ruolo_id, ente_militare_id,
                        accesso_globale, attivo, primo_accesso,
                        data_creazione, creato_da
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s
                    ) RETURNING id
                ''', (
                    username,
                    password_hash,
                    data['nome'],
                    data['cognome'],
                    data['ruolo_id'],
                    data.get('ente_militare_id'),
                    data.get('accesso_globale', False),
                    data.get('attivo', True),
                    True,  # primo_accesso
                    request.current_user['user_id']
                ))
                
                new_user_id = cur.fetchone()['id']
                print(f"[CREATE_USER] Created user with ID: {new_user_id}")  # Debug log
        
        # Log azione
        try:
            log_user_action(
                request.current_user['user_id'],
                'CREATE_USER',
                f'Creato utente: {username} (ID: {new_user_id})',
                'user_management'
            )
        except Exception as log_error:
            print(f"[CREATE_USER] Log error: {log_error}")  # Non-fatal
        
        return jsonify({'success': True, 'user_id': new_user_id, 'message': 'Utente creato con successo'})
        
    except Exception as e:
        print(f"[CREATE_USER] ERROR: {str(e)}")  # Debug log
        import traceback
        traceback.print_exc()  # Full stack trace
        return jsonify({'success': False, 'error': f'Errore nella creazione utente: {str(e)}'}), 500

@main_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """
    Aggiorna un utente esistente.
    """
    try:
        data = request.get_json()
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica che l'utente esista
                cur.execute('SELECT * FROM utenti WHERE id = %s', (user_id,))
                existing_user = cur.fetchone()
                if not existing_user:
                    return jsonify({'success': False, 'error': 'Utente non trovato'}), 404
                
                # Prepara i campi da aggiornare
                update_fields = []
                update_values = []
                
                # Gestione cambio username (email)
                if 'username' in data and data['username'] != existing_user['username']:
                    new_username = data['username'].lower().strip()
                    
                    # Verifica formato email militare
                    import re
                    if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9._\-]*@esercito\.difesa\.it$', new_username):
                        return jsonify({'success': False, 'error': 'Email non valida: deve iniziare con lettera/numero e terminare con @esercito.difesa.it'}), 400
                    
                    # Verifica unicità
                    cur.execute('SELECT id FROM utenti WHERE username = %s AND id != %s', (new_username, user_id))
                    if cur.fetchone():
                        return jsonify({'success': False, 'error': f'Email {new_username} già esistente'}), 400
                    
                    update_fields.append('username = %s')
                    update_values.append(new_username)
                
                # Campi semplici che possono essere aggiornati
                simple_fields = ['nome', 'cognome']
                for field in simple_fields:
                    if field in data:
                        update_fields.append(f'{field} = %s')
                        update_values.append(data[field])
                
                # Campi che possono essere aggiornati direttamente
                updatable_fields = ['ruolo_id', 'ente_militare_id', 'accesso_globale', 'attivo']
                
                for field in updatable_fields:
                    if field in data:
                        update_fields.append(f'{field} = %s')
                        update_values.append(data[field])
                
                # Gestione password
                if 'password' in data and data['password']:
                    from werkzeug.security import generate_password_hash
                    password_hash = generate_password_hash(data['password'])
                    update_fields.append('password_hash = %s')
                    update_values.append(password_hash)
                    update_fields.append('primo_accesso = %s')
                    update_values.append(True)
                
                if update_fields:
                    # Aggiungi campi di audit
                    update_fields.append('data_modifica = NOW()')
                    update_fields.append('modificato_da = %s')
                    update_values.append(request.current_user['user_id'])
                    
                    # Esegui update
                    update_query = f"UPDATE utenti SET {', '.join(update_fields)} WHERE id = %s"
                    update_values.append(user_id)
                    
                    cur.execute(update_query, update_values)
        
        # Log azione
        log_user_action(
            request.current_user['user_id'],
            'UPDATE_USER',
            f'Aggiornato utente ID: {user_id}',
            'user_management'
        )
        
        return jsonify({'success': True, 'message': 'Utente aggiornato con successo'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nell\'aggiornamento utente: {str(e)}'}), 500

@main_bp.route('/api/users/<int:user_id>/toggle', methods=['PUT'])
@admin_required
def toggle_user_status(user_id):
    """
    Attiva/disattiva un utente.
    """
    try:
        # Impedisci di disattivare se stesso
        if user_id == request.current_user['user_id']:
            return jsonify({'success': False, 'error': 'Non puoi disattivare te stesso'}), 400
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Ottieni stato attuale
                cur.execute('SELECT attivo, username FROM utenti WHERE id = %s', (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'success': False, 'error': 'Utente non trovato'}), 404
                
                new_status = not user['attivo']
                
                # Aggiorna stato
                cur.execute('''
                    UPDATE utenti 
                    SET attivo = %s, data_modifica = NOW(), modificato_da = %s
                    WHERE id = %s
                ''', (new_status, request.current_user['user_id'], user_id))
        
        action = 'ENABLE_USER' if new_status else 'DISABLE_USER'
        status_text = 'attivato' if new_status else 'disattivato'
        
        # Log azione
        log_user_action(
            request.current_user['user_id'],
            action,
            f'Utente {user["username"]} {status_text}',
            'user_management'
        )
        
        return jsonify({'success': True, 'message': f'Utente {status_text} con successo', 'new_status': new_status})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nel cambio stato utente: {str(e)}'}), 500

@main_bp.route('/api/users/deleted', methods=['GET'])
@admin_required
def get_deleted_users():
    """Recupera la lista degli utenti eliminati (solo admin)"""
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    '''
                    SELECT 
                        u.id, u.username, u.nome, u.cognome, u.data_creazione, u.data_modifica,
                        r.nome as ruolo_nome, r.livello_accesso,
                        em.nome AS ente_nome,
                        modifier.username AS modificato_da_username
                    FROM utenti u
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
                    LEFT JOIN utenti modifier ON modifier.id = u.modificato_da
                    WHERE u.eliminato = TRUE
                    ORDER BY u.data_modifica DESC
                    '''
                )
                deleted_users = cur.fetchall()
        
        return jsonify({
            'success': True,
            'deleted_users': [dict(user) for user in deleted_users],
            'count': len(deleted_users)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nel recupero utenti eliminati: {str(e)}'}), 500

@main_bp.route('/api/users/<int:user_id>/restore', methods=['POST'])
@admin_required
def restore_user(user_id):
    """Ripristina un utente eliminato (solo admin)"""
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica che l'utente esista ed sia eliminato
                cur.execute('SELECT username, eliminato FROM utenti WHERE id = %s', (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'success': False, 'error': 'Utente non trovato'}), 404
                
                if not user['eliminato']:
                    return jsonify({'success': False, 'error': 'Utente non è eliminato'}), 400
                
                # Ripristina l'utente
                cur.execute('''
                    UPDATE utenti 
                    SET eliminato = FALSE, attivo = TRUE, data_modifica = NOW(), modificato_da = %s
                    WHERE id = %s
                ''', (request.current_user['user_id'], user_id))
        
        # Log azione
        log_user_action(
            request.current_user['user_id'],
            'USER_RESTORED',
            f'Utente {user["username"]} ripristinato',
            'user_management'
        )
        
        return jsonify({'success': True, 'message': 'Utente ripristinato con successo'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nel ripristino utente: {str(e)}'}), 500

@main_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """
    Elimina un utente (soft delete - lo disattiva).
    """
    try:
        # Impedisci di eliminare se stesso
        if user_id == request.current_user['user_id']:
            return jsonify({'success': False, 'error': 'Non puoi eliminare te stesso'}), 400
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica che l'utente esista
                cur.execute('SELECT username FROM utenti WHERE id = %s', (user_id,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'success': False, 'error': 'Utente non trovato'}), 404
                
                # Soft delete - marca l'utente come eliminato
                cur.execute('''
                    UPDATE utenti 
                    SET eliminato = TRUE, attivo = FALSE, data_modifica = NOW(), modificato_da = %s
                    WHERE id = %s
                ''', (request.current_user['user_id'], user_id))
        
        # Log azione
        log_user_action(
            request.current_user['user_id'],
            'DELETE_USER',
            f'Eliminato utente: {user["username"]} (ID: {user_id})',
            'user_management'
        )
        
        return jsonify({'success': True, 'message': 'Utente eliminato con successo'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nell\'eliminazione utente: {str(e)}'}), 500

@main_bp.route('/api/users/<int:user_id>', methods=['GET'])
@admin_required
def get_user_details(user_id):
    """
    Ottiene i dettagli di un utente specifico.
    """
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute('''
                    SELECT 
                        u.*,
                        r.nome AS ruolo_nome,
                        r.livello_accesso,
                        em.nome AS ente_nome,
                        creator.username AS creato_da_username,
                        modifier.username AS modificato_da_username
                    FROM utenti u
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
                    LEFT JOIN utenti creator ON creator.id = u.creato_da
                    LEFT JOIN utenti modifier ON modifier.id = u.modificato_da
                    WHERE u.id = %s
                ''', (user_id,))
                
                user = cur.fetchone()
                if not user:
                    return jsonify({'success': False, 'error': 'Utente non trovato'}), 404
                
                # Converti in dict per JSON serialization
                user_dict = dict(user)
                
                # Formatta le date
                for date_field in ['ultimo_accesso', 'data_creazione', 'data_modifica']:
                    if user_dict.get(date_field):
                        user_dict[date_field] = user_dict[date_field].isoformat()
        
        return jsonify({'success': True, 'user': user_dict})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nel recupero dettagli utente: {str(e)}'}), 500

@main_bp.route('/api/dropdown-data', methods=['GET'])
@admin_required
def get_dropdown_data():
    """
    Ottiene i dati per i dropdown del form utenti (ruoli ed enti militari).
    """
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Ruoli attivi
                cur.execute('''
                    SELECT id, nome, descrizione, livello_accesso
                    FROM ruoli 
                    WHERE attivo = TRUE 
                    ORDER BY livello_accesso DESC, nome
                ''')
                roles = cur.fetchall()
                
                # Enti militari
                cur.execute('''
                    SELECT id, nome, codice
                    FROM enti_militari 
                    ORDER BY nome
                ''')
                enti_militari = cur.fetchall()
        
        return jsonify({
            'success': True,
            'roles': [dict(role) for role in roles],
            'enti_militari': [dict(ente) for ente in enti_militari]
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nel recupero dati dropdown: {str(e)}'}), 500

# ===========================================
# CONTEXT PROCESSORS
# ===========================================

@main_bp.app_context_processor
def inject_globals():
    """
    Inietta variabili globali nei template del blueprint.
    Queste variabili sono disponibili in tutti i template.
    """
    return {
        'current_year': datetime.now().year,
        'app_version': '2.0.0',
        'app_name': 'TALON System',
        'get_activity_icon': get_activity_icon,
        'get_activity_color': get_activity_color,
        'get_activity_title': get_activity_title
    }

# ===========================================
# ACTIVITY HELPERS FOR RECENT ACTIVITIES
# ===========================================

def get_activity_icon(action):
    """Restituisce l'icona FontAwesome per un'azione"""
    icon_map = {
        'CREATE_USER': 'fa-user-plus',
        'UPDATE_USER': 'fa-user-edit',
        'DELETE_USER': 'fa-user-times',
        'ENABLE_USER': 'fa-user-check',
        'DISABLE_USER': 'fa-user-slash',
        'CREATE_ENTE_MILITARE': 'fa-shield-alt',
        'UPDATE_ENTE_MILITARE': 'fa-edit',
        'DELETE_ENTE_MILITARE': 'fa-trash-alt',
        'CREATE_ENTE_CIVILE': 'fa-building',
        'UPDATE_ENTE_CIVILE': 'fa-edit',
        'DELETE_ENTE_CIVILE': 'fa-trash-alt',
        'EXPORT_ENTI_MILITARI': 'fa-file-export',
        'EXPORT_ENTI_CIVILI': 'fa-file-export',
        'VIEW_ORGANIGRAMMA': 'fa-sitemap',
        'ACCESS_SETTINGS': 'fa-cogs',
        'VIEW_SYSTEM_INFO': 'fa-info-circle'
    }
    return icon_map.get(action, 'fa-cog')

def get_activity_color(action):
    """Restituisce il colore per un'azione"""
    color_map = {
        'CREATE_USER': '#2ecc71',
        'UPDATE_USER': '#f39c12',
        'DELETE_USER': '#e74c3c',
        'ENABLE_USER': '#27ae60',
        'DISABLE_USER': '#e67e22',
        'CREATE_ENTE_MILITARE': '#3498db',
        'UPDATE_ENTE_MILITARE': '#f39c12',
        'DELETE_ENTE_MILITARE': '#e74c3c',
        'CREATE_ENTE_CIVILE': '#9b59b6',
        'UPDATE_ENTE_CIVILE': '#f39c12',
        'DELETE_ENTE_CIVILE': '#e74c3c',
        'EXPORT_ENTI_MILITARI': '#34495e',
        'EXPORT_ENTI_CIVILI': '#34495e',
        'VIEW_ORGANIGRAMMA': '#16a085',
        'ACCESS_SETTINGS': '#95a5a6',
        'VIEW_SYSTEM_INFO': '#3498db'
    }
    return color_map.get(action, '#7f8c8d')

def get_activity_title(action):
    """Restituisce il titolo leggibile per un'azione"""
    title_map = {
        'CREATE_USER': 'Nuovo utente creato',
        'UPDATE_USER': 'Utente modificato',
        'DELETE_USER': 'Utente eliminato',
        'ENABLE_USER': 'Utente abilitato',
        'DISABLE_USER': 'Utente disabilitato',
        'CREATE_ENTE_MILITARE': 'Ente militare creato',
        'UPDATE_ENTE_MILITARE': 'Ente militare modificato',
        'DELETE_ENTE_MILITARE': 'Ente militare eliminato',
        'CREATE_ENTE_CIVILE': 'Ente civile creato',
        'UPDATE_ENTE_CIVILE': 'Ente civile modificato',
        'DELETE_ENTE_CIVILE': 'Ente civile eliminato',
        'EXPORT_ENTI_MILITARI': 'Export enti militari',
        'EXPORT_ENTI_CIVILI': 'Export enti civili',
        'VIEW_ORGANIGRAMMA': 'Organigramma visualizzato',
        'ACCESS_SETTINGS': 'Accesso impostazioni',
        'VIEW_SYSTEM_INFO': 'Info sistema visualizzate'
    }
    return title_map.get(action, action.replace('_', ' ').title())

@main_bp.route('/superset')
@login_required
def superset_embedded():
    """
    Pagina con Superset embedded direttamente in Talon
    """
    user_info = get_current_user_info()
    if not user_info:
        flash('Errore: utente non trovato', 'error')
        return redirect(url_for('main.dashboard'))
    
    # Log accesso a Superset
    log_user_action(
        user_info['id'],
        'ACCESS_SUPERSET',
        'Accesso alla dashboard di analisi Superset',
        'superset'
    )
    
    return render_template('superset_embedded.html', 
                             user_info=user_info,
                             page_title="Dashboard di Analisi")

# ===========================================
# GESTIONE FEEDBACK
# ===========================================

@main_bp.route('/api/feedback', methods=['POST'])
@login_required
def create_feedback():
    """
    Crea un nuovo feedback dall'utente corrente.
    """
    try:
        data = request.get_json()
        
        # Validazione dati
        if not data:
            return jsonify({'success': False, 'error': 'Nessun dato ricevuto'}), 400
        
        required_fields = ['tipo', 'messaggio']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'Campo {field} richiesto'}), 400
        
        # Validazione tipo
        valid_types = ['bug', 'feature', 'improvement', 'general']
        if data['tipo'] not in valid_types:
            return jsonify({'success': False, 'error': 'Tipo feedback non valido'}), 400
        
        user_id = request.current_user['user_id']
        
        # Genera titolo automatico se non fornito
        titolo = data.get('titolo')
        if not titolo:
            tipo_labels = {
                'bug': 'Segnalazione Bug',
                'feature': 'Richiesta Funzionalità', 
                'improvement': 'Proposta Miglioramento',
                'general': 'Feedback Generale'
            }
            titolo = f"{tipo_labels.get(data['tipo'], 'Feedback')} - {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Inserisci feedback
                cur.execute('''
                    INSERT INTO feedback (
                        utente_id, tipo, titolo, messaggio, categoria,
                        ip_address, user_agent, pagina_origine, 
                        creato_da, data_creazione
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                ''', (
                    user_id,
                    data['tipo'],
                    titolo,
                    data['messaggio'],
                    data.get('categoria'),
                    request.remote_addr,
                    request.headers.get('User-Agent', ''),
                    data.get('pagina_origine', request.referrer or 'N/A'),
                    user_id
                ))
                
                feedback_id = cur.fetchone()['id']
        
        # Log azione
        log_user_action(
            user_id,
            'CREATE_FEEDBACK',
            f'Nuovo feedback creato: {data["tipo"]} - {titolo}',
            'feedback'
        )
        
        return jsonify({
            'success': True, 
            'feedback_id': feedback_id,
            'message': 'Feedback inviato con successo'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nella creazione feedback: {str(e)}'}), 500

@main_bp.route('/api/feedback', methods=['GET'])
@admin_required
def get_feedback_list():
    """
    Ottiene la lista di tutti i feedback (solo admin).
    """
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        stato = request.args.get('stato')
        tipo = request.args.get('tipo')
        
        offset = (page - 1) * per_page
        
        # Costruisci query con filtri
        where_conditions = []
        params = []
        
        if stato:
            where_conditions.append('f.stato = %s')
            params.append(stato)
        
        if tipo:
            where_conditions.append('f.tipo = %s')
            params.append(tipo)
        
        where_clause = 'WHERE ' + ' AND '.join(where_conditions) if where_conditions else ''
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Conta totale feedback
                count_query = f"SELECT COUNT(*) as total FROM feedback f {where_clause}"
                cur.execute(count_query, params)
                total_feedback = cur.fetchone()['total']
                
                # Ottieni feedback paginati
                feedback_query = f'''
                    SELECT 
                        f.*,
                        u.nome || ' ' || u.cognome as utente_nome,
                        u.username as utente_email,
                        r.nome as utente_ruolo,
                        admin_u.nome || ' ' || admin_u.cognome as risposta_da_nome
                    FROM feedback f
                    LEFT JOIN utenti u ON u.id = f.utente_id
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    LEFT JOIN utenti admin_u ON admin_u.id = f.risposta_da
                    {where_clause}
                    ORDER BY f.data_creazione DESC
                    LIMIT %s OFFSET %s
                '''
                
                params.extend([per_page, offset])
                cur.execute(feedback_query, params)
                feedback_list = cur.fetchall()
        
        total_pages = (total_feedback + per_page - 1) // per_page
        
        return jsonify({
            'success': True,
            'feedback': [dict(fb) for fb in feedback_list],
            'pagination': {
                'current_page': page,
                'total_pages': total_pages,
                'total_feedback': total_feedback,
                'per_page': per_page
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nel recupero feedback: {str(e)}'}), 500

@main_bp.route('/api/feedback/<int:feedback_id>', methods=['PUT'])
@admin_required
def update_feedback(feedback_id):
    """
    Aggiorna stato e risposta di un feedback (solo admin).
    """
    try:
        data = request.get_json()
        
        # Validazione stato
        if 'stato' in data:
            valid_states = ['aperto', 'in_lavorazione', 'risolto', 'chiuso', 'rifiutato']
            if data['stato'] not in valid_states:
                return jsonify({'success': False, 'error': 'Stato non valido'}), 400
        
        # Validazione priorità
        if 'priorita' in data:
            valid_priorities = ['bassa', 'media', 'alta', 'critica']
            if data['priorita'] not in valid_priorities:
                return jsonify({'success': False, 'error': 'Priorità non valida'}), 400
        
        admin_user_id = request.current_user['user_id']
        
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica che il feedback esista
                cur.execute('SELECT * FROM feedback WHERE id = %s', (feedback_id,))
                feedback = cur.fetchone()
                if not feedback:
                    return jsonify({'success': False, 'error': 'Feedback non trovato'}), 404
                
                # Prepara campi da aggiornare
                update_fields = []
                update_values = []
                
                # Campi aggiornabili
                updatable_fields = ['stato', 'priorita', 'categoria']
                for field in updatable_fields:
                    if field in data:
                        update_fields.append(f'{field} = %s')
                        update_values.append(data[field])
                
                # Gestione risposta admin
                if 'risposta_admin' in data and data['risposta_admin']:
                    update_fields.append('risposta_admin = %s')
                    update_values.append(data['risposta_admin'])
                    update_fields.append('risposta_da = %s')
                    update_values.append(admin_user_id)
                    update_fields.append('risposta_timestamp = NOW()')
                
                if update_fields:
                    # Aggiungi campi di audit
                    update_fields.append('data_modifica = NOW()')
                    update_fields.append('modificato_da = %s')
                    update_values.append(admin_user_id)
                    
                    # Esegui update
                    update_query = f"UPDATE feedback SET {', '.join(update_fields)} WHERE id = %s"
                    update_values.append(feedback_id)
                    
                    cur.execute(update_query, update_values)
        
        # Log azione
        log_user_action(
            admin_user_id,
            'UPDATE_FEEDBACK',
            f'Feedback ID: {feedback_id} aggiornato',
            'feedback'
        )
        
        return jsonify({'success': True, 'message': 'Feedback aggiornato con successo'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nell\'aggiornamento feedback: {str(e)}'}), 500

@main_bp.route('/api/feedback/stats', methods=['GET'])
@admin_required
def get_feedback_stats():
    """
    Ottiene statistiche sui feedback (solo admin).
    """
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Conteggi per stato
                cur.execute('''
                    SELECT stato, COUNT(*) as count 
                    FROM feedback 
                    GROUP BY stato 
                    ORDER BY count DESC
                ''')
                stats_by_state = cur.fetchall()
                
                # Conteggi per tipo
                cur.execute('''
                    SELECT tipo, COUNT(*) as count 
                    FROM feedback 
                    GROUP BY tipo 
                    ORDER BY count DESC
                ''')
                stats_by_type = cur.fetchall()
                
                # Conteggi per priorità
                cur.execute('''
                    SELECT priorita, COUNT(*) as count 
                    FROM feedback 
                    GROUP BY priorita 
                    ORDER BY 
                        CASE priorita 
                            WHEN 'critica' THEN 1 
                            WHEN 'alta' THEN 2 
                            WHEN 'media' THEN 3 
                            WHEN 'bassa' THEN 4 
                        END
                ''')
                stats_by_priority = cur.fetchall()
                
                # Feedback recenti (ultimi 7 giorni)
                cur.execute('''
                    SELECT COUNT(*) as count
                    FROM feedback 
                    WHERE data_creazione >= NOW() - INTERVAL '7 days'
                ''')
                recent_feedback = cur.fetchone()['count']
                
                # Feedback risolti questo mese
                cur.execute('''
                    SELECT COUNT(*) as count
                    FROM feedback 
                    WHERE stato = 'risolto' 
                      AND data_modifica >= DATE_TRUNC('month', NOW())
                ''')
                resolved_this_month = cur.fetchone()['count']
        
        return jsonify({
            'success': True,
            'stats': {
                'by_state': [dict(stat) for stat in stats_by_state],
                'by_type': [dict(stat) for stat in stats_by_type],
                'by_priority': [dict(stat) for stat in stats_by_priority],
                'recent_feedback': recent_feedback,
                'resolved_this_month': resolved_this_month
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Errore nel recupero statistiche: {str(e)}'}), 500

@main_bp.route('/admin/feedback')
@admin_required
def admin_feedback_page():
    """
    Pagina amministrazione feedback (solo admin).
    """
    user_info = get_current_user_info()
    
    # Log accesso
    log_user_action(
        request.current_user['user_id'],
        'VIEW_FEEDBACK_ADMIN',
        'Accesso pagina amministrazione feedback',
        'feedback'
    )
    
    return render_template('admin/feedback.html', user_info=user_info)

# ===========================================
# SISTEMA BACKUP ENTERPRISE
# ===========================================

@main_bp.route('/admin/backup')
@admin_required
def backup_dashboard():
    """
    Dashboard sistema backup enterprise
    """
    from backup_manager import backup_manager
    
    try:
        user_info = get_current_user_info()
        
        # Ottieni statistiche sistema backup
        backup_status = backup_manager.get_system_status()
        db_stats = backup_manager.get_database_stats()
        recent_backups = backup_manager.list_backups(limit=10)
        
        # Log accesso
        log_user_action(
            request.current_user['user_id'],
            'ACCESS_BACKUP_DASHBOARD',
            'Accesso dashboard backup enterprise',
            'backup'
        )
        
        return render_template(
            'admin/backup_dashboard.html',
            user_info=user_info,
            backup_status=backup_status,
            db_stats=db_stats,
            recent_backups=recent_backups
        )
    except Exception as e:
        flash(f'Errore caricamento dashboard backup: {str(e)}', 'error')
        return redirect(url_for('main.dashboard_admin'))

@main_bp.route('/api/backup/create', methods=['POST'])
@admin_required
def api_create_backup():
    """
    API per creare un nuovo backup
    """
    from backup_manager import backup_manager
    
    try:
        data = request.get_json() or {}
        backup_type = data.get('backup_type', 'full')
        method = data.get('method', 'manual')
        user_id = str(request.current_user['user_id'])
        
        # Validazione tipo backup
        valid_types = ['full', 'data_only', 'schema_only']
        if backup_type not in valid_types:
            return jsonify({
                'success': False, 
                'error': f'Tipo backup non valido. Usa: {", ".join(valid_types)}'
            }), 400
        
        # Crea backup
        result = backup_manager.create_backup(
            backup_type=backup_type,
            method=method,
            user_id=user_id
        )
        
        # Log operazione
        if result['success']:
            log_user_action(
                request.current_user['user_id'],
                'CREATE_BACKUP',
                f'Backup {backup_type} creato: {result["backup_id"]}',
                'backup',
                result['backup_id']
            )
        else:
            log_user_action(
                request.current_user['user_id'],
                'CREATE_BACKUP_FAILED',
                f'Backup {backup_type} fallito: {result.get("error", "Errore sconosciuto")}',
                'backup'
            )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Errore API create backup: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500

@main_bp.route('/api/backup/list')
@admin_required
def api_list_backups():
    """
    API per listare backup disponibili
    """
    from backup_manager import backup_manager
    
    try:
        limit = request.args.get('limit', 50, type=int)
        status = request.args.get('status')
        
        backups = backup_manager.list_backups(limit=limit, status=status)
        
        return jsonify({
            'success': True,
            'backups': backups
        })
        
    except Exception as e:
        logger.error(f"Errore API list backups: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500

@main_bp.route('/api/backup/<backup_id>')
@admin_required
def api_backup_details(backup_id):
    """
    API per dettagli backup specifico
    """
    from backup_manager import backup_manager
    
    try:
        backup = backup_manager.get_backup_details(backup_id)
        
        if not backup:
            return jsonify({
                'success': False,
                'error': 'Backup non trovato'
            }), 404
        
        return jsonify({
            'success': True,
            'backup': backup
        })
        
    except Exception as e:
        logger.error(f"Errore API backup details: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500

@main_bp.route('/api/backup/<backup_id>/restore', methods=['POST'])
@admin_required
def api_restore_backup(backup_id):
    """
    API per ripristinare un backup
    """
    from backup_manager import backup_manager
    
    try:
        data = request.get_json() or {}
        restore_type = data.get('restore_type', 'full')
        target_db = data.get('target_db')
        user_id = str(request.current_user['user_id'])
        
        # Validazione
        valid_restore_types = ['full', 'selective', 'point_in_time']
        if restore_type not in valid_restore_types:
            return jsonify({
                'success': False,
                'error': f'Tipo ripristino non valido. Usa: {", ".join(valid_restore_types)}'
            }), 400
        
        # Ripristina backup
        result = backup_manager.restore_backup(
            backup_id=backup_id,
            restore_type=restore_type,
            target_db=target_db,
            user_id=user_id
        )
        
        # Log operazione
        if result['success']:
            log_user_action(
                request.current_user['user_id'],
                'RESTORE_BACKUP',
                f'Ripristino {restore_type} da backup {backup_id}: {result["restore_id"]}',
                'backup',
                backup_id
            )
        else:
            log_user_action(
                request.current_user['user_id'],
                'RESTORE_BACKUP_FAILED',
                f'Ripristino {restore_type} da backup {backup_id} fallito: {result.get("error", "Errore sconosciuto")}',
                'backup',
                backup_id
            )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Errore API restore backup: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500

@main_bp.route('/api/backup/<backup_id>/delete', methods=['DELETE'])
@admin_required
def api_delete_backup(backup_id):
    """
    API per eliminare un backup
    """
    from backup_manager import backup_manager
    
    try:
        user_id = str(request.current_user['user_id'])
        
        # Elimina backup
        success = backup_manager.delete_backup(backup_id, user_id)
        
        if success:
            log_user_action(
                request.current_user['user_id'],
                'DELETE_BACKUP',
                f'Backup eliminato: {backup_id}',
                'backup',
                backup_id
            )
            
            return jsonify({
                'success': True,
                'message': 'Backup eliminato con successo'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Backup non trovato o errore eliminazione'
            }), 404
        
    except Exception as e:
        logger.error(f"Errore API delete backup: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500

@main_bp.route('/api/backup/cleanup', methods=['POST'])
@admin_required
def api_cleanup_backups():
    """
    API per pulizia backup scaduti
    """
    from backup_manager import backup_manager
    
    try:
        user_id = request.current_user['user_id']
        
        # Esegui pulizia
        result = backup_manager.cleanup_expired_backups()
        
        # Log operazione
        log_user_action(
            user_id,
            'CLEANUP_BACKUPS',
            f'Pulizia backup: {result["deleted_count"]} eliminati',
            'backup'
        )
        
        return jsonify({
            'success': True,
            'deleted_count': result['deleted_count'],
            'errors': result['errors']
        })
        
    except Exception as e:
        logger.error(f"Errore API cleanup backups: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500

@main_bp.route('/api/backup/status')
@admin_required
def api_backup_status():
    """
    API per stato generale sistema backup
    """
    from backup_manager import backup_manager
    
    try:
        status = backup_manager.get_system_status()
        db_stats = backup_manager.get_database_stats()
        
        return jsonify({
            'success': True,
            'backup_status': status,
            'database_stats': db_stats
        })
        
    except Exception as e:
        logger.error(f"Errore API backup status: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500

@main_bp.route('/api/backup/config', methods=['GET', 'POST'])
@admin_required
def api_backup_config():
    """
    API per gestione configurazione backup
    """
    from backup_manager import backup_manager
    
    try:
        if request.method == 'GET':
            # Ottieni configurazione attuale
            return jsonify({
                'success': True,
                'config': backup_manager.config
            })
        
        elif request.method == 'POST':
            # Aggiorna configurazione
            data = request.get_json() or {}
            user_id = request.current_user['user_id']
            
            # Aggiorna config
            success = backup_manager.update_config(data)
            
            if success:
                log_user_action(
                    user_id,
                    'UPDATE_BACKUP_CONFIG',
                    'Configurazione backup aggiornata',
                    'backup_config'
                )
                
                return jsonify({
                    'success': True,
                    'message': 'Configurazione aggiornata'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Errore aggiornamento configurazione'
                }), 500
        
    except Exception as e:
        logger.error(f"Errore API backup config: {e}")
        return jsonify({
            'success': False,
            'error': f'Errore interno: {str(e)}'
        }), 500