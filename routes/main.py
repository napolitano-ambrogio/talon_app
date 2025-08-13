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
# HELPERS SPA (Single Page Application)
# ===========================================

def is_spa_request():
    """
    Verifica se la richiesta corrente è una richiesta SPA.
    
    Returns:
        bool: True se è una richiesta AJAX/SPA, False altrimenti
    """
    return (
        request.headers.get('X-SPA-Request') == 'true' or
        request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    )

def render_spa_template(template_name, **context):
    """
    Renderizza un template con supporto SPA.
    Se è una richiesta SPA, ritorna JSON con HTML parziale.
    Altrimenti renderizza il template completo.
    
    Args:
        template_name: Nome del template da renderizzare
        **context: Variabili di contesto per il template
        
    Returns:
        Response: JSON per richieste SPA, HTML per richieste normali
    """
    if is_spa_request():
        # Renderizza il template completo
        html = render_template(template_name, **context)
        
        # Estrai le parti necessarie per SPA
        title = 'TALON System'
        content = html
        breadcrumb = ''
        
        # Estrai il titolo dalla pagina
        title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
        if title_match:
            title = title_match.group(1).strip()
        
        # Estrai il contenuto principale
        content_match = re.search(
            r'<div class="flex-grow-1 p-3 main-content"[^>]*>(.*?)(?=<footer|<script|</main>|$)',
            html,
            re.DOTALL | re.IGNORECASE
        )
        if content_match:
            content = content_match.group(1).strip()
        
        # Estrai breadcrumb se presente
        breadcrumb_match = re.search(
            r'<ol class="breadcrumb[^"]*">(.*?)</ol>',
            html,
            re.DOTALL | re.IGNORECASE
        )
        if breadcrumb_match:
            breadcrumb = breadcrumb_match.group(1).strip()
        
        # Estrai CSS aggiuntivi dalla sezione head (per dashboard_admin.css, ecc.)
        additional_css = []
        css_matches = re.findall(
            r'<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']*)["\'][^>]*>',
            html,
            re.IGNORECASE
        )
        for css_url in css_matches:
            if any(page_css in css_url for page_css in ['dashboard_admin.css', 'enti_militari.css', 'enti_civili.css']):
                additional_css.append(css_url)
        
        # Estrai JavaScript aggiuntivi (per Chart.js, ecc.)
        additional_js = []
        js_matches = re.findall(
            r'<script[^>]*src=["\']([^"\']*)["\'][^>]*></script>',
            html,
            re.IGNORECASE
        )
        for js_url in js_matches:
            # Include Chart.js and other external libraries
            if any(js_lib in js_url for js_lib in ['chart.js', 'chartjs', 'datatables', 'd3.js']):
                additional_js.append(js_url)
        
        # Restituisci JSON per SPA
        return jsonify({
            'success': True,
            'title': title,
            'content': content,
            'breadcrumb': breadcrumb,
            'template': template_name,
            'flash_messages': get_flashed_messages(with_categories=True),
            'additional_css': additional_css,
            'additional_js': additional_js
        })
    
    # Richiesta normale - renderizza template completo
    return render_template(template_name, **context)

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
    Dashboard principale con supporto SPA.
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
    
    return render_spa_template(
        'dashboard.html',
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
    Dashboard amministratore avanzata con supporto SPA.
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
    
    return render_spa_template(
        'dashboard_admin.html',
        user_info=user_info,
        stats=stats
    )

@main_bp.route('/organigramma')
@login_required
def organigramma():
    """
    Visualizza l'organigramma con supporto SPA.
    """
    user_info = get_current_user_info()
    
    # Log accesso
    log_user_action(
        request.current_user['user_id'],
        'VIEW_ORGANIGRAMMA',
        'Visualizzazione organigramma',
        'organigramma'
    )
    
    return render_spa_template(
        'organigramma.html',
        user_info=user_info
    )

# ===========================================
# ROUTE AMMINISTRAZIONE
# ===========================================

@main_bp.route('/impostazioni')
@admin_required
def impostazioni():
    """
    Pagina impostazioni principali con supporto SPA.
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
    
    return render_spa_template('impostazioni.html', user_info=user_info)

@main_bp.route('/impostazioni/utenti')
@admin_required
def gestione_utenti():
    """
    Gestione utenti con supporto SPA.
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
        
        return render_spa_template('admin/users.html', users=users)
        
    except Exception as e:
        error_msg = f'Errore nel caricamento utenti: {str(e)}'
        flash(error_msg, 'error')
        
        if is_spa_request():
            return jsonify({
                'success': False,
                'error': error_msg,
                'redirect': url_for('main.dashboard')
            }), 500
        
        return redirect(url_for('main.dashboard'))

@main_bp.route('/impostazioni/sistema')
@admin_required
def info_sistema():
    """
    Informazioni di sistema con supporto SPA.
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
        
        return render_spa_template('admin/system_info.html', stats=stats)
        
    except Exception as e:
        error_msg = f'Errore nel caricamento info sistema: {str(e)}'
        flash(error_msg, 'error')
        
        if is_spa_request():
            return jsonify({
                'success': False,
                'error': error_msg,
                'redirect': url_for('main.dashboard')
            }), 500
        
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
        
        return render_spa_template(
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
        
        if is_spa_request():
            return jsonify({
                'success': False,
                'error': error_msg,
                'redirect': url_for('main.dashboard_admin')
            }), 500
        
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