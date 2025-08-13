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
        
        # Restituisci JSON per SPA
        return jsonify({
            'success': True,
            'title': title,
            'content': content,
            'breadcrumb': breadcrumb,
            'template': template_name,
            'flash_messages': get_flashed_messages(with_categories=True)
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
        stats=stats
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
                        u.*,
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
        'enti_militari': 0,
        'enti_civili': 0,
        'operazioni_attive': 0,
        'operazioni_totali': 0,
        'attivita_oggi': 0,
        'attivita_settimana': 0,
        'attivita_mese': 0,
        'utenti_attivi': 0,
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
                    GROUP BY r.id, r.nome
                    ORDER BY r.livello_accesso DESC
                    '''
                )
                rows = cur.fetchall()
                stats['users_by_role'] = {row['ruolo']: int(row['count']) for row in rows}
                
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
                    '''
                )
                stats['utenti_attivi'] = int(cur.fetchone()['count'])
                
                # Accessi oggi
                cur.execute(
                    '''
                    SELECT COUNT(DISTINCT user_id) AS count
                    FROM log_azioni
                    WHERE DATE(timestamp) = CURRENT_DATE
                      AND action = 'LOGIN_SUCCESS'
                    '''
                )
                result = cur.fetchone()
                stats['accessi_oggi'] = int(result['count']) if result else 0
                
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
                    'operazioni', 'attivita', 'log_azioni'
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
        'app_name': 'TALON System'
    }