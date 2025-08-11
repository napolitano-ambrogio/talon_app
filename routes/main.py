from flask import Blueprint, render_template, redirect, url_for, flash, request
from auth import (
    login_required, admin_required, operatore_or_admin_required,
    get_current_user_info, log_user_action, get_user_accessible_entities,
    is_admin, get_user_role, ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE,
    get_auth_db_connection  # <-- usa la connessione centralizzata (PostgreSQL)
)
from psycopg2.extras import RealDictCursor
from datetime import datetime

main_bp = Blueprint(
    'main',
    __name__,
    template_folder='../templates',
    static_folder='../static'
)

# ===========================================
# HELPERS DB (wrappa la connessione di auth.py)
# ===========================================
def get_db_connection():
    return get_auth_db_connection()

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@main_bp.route('/')
def index():
    from flask import session
    if session.get('logged_in'):
        return redirect(url_for('main.dashboard'))
    return redirect(url_for('show_login'))

@main_bp.route('/dashboard')
@login_required
def dashboard():
    """Dashboard principale con iframe Superset"""
    user_id = request.current_user['user_id']
    user_info = get_current_user_info()
    user_role = get_user_role()

    log_user_action(
        user_id,
        'ACCESS_DASHBOARD',
        f'Accesso dashboard - Ruolo: {user_role}',
        'dashboard'
    )

    return render_template('dashboard.html',
                           user_info=user_info,
                           user_role=user_role)

@main_bp.route('/dashboard_admin')
@admin_required
def dashboard_admin():
    """Dashboard amministratore"""
    user_id = request.current_user['user_id']
    user_info = get_current_user_info()
    stats = get_admin_dashboard_stats()

    log_user_action(
        user_id,
        'ACCESS_ADMIN_DASHBOARD',
        'Accesso dashboard amministratore',
        'dashboard_admin'
    )

    return render_template('dashboard_admin.html',
                           user_info=user_info,
                           stats=stats)

# ===========================================
# ROUTE AMMINISTRAZIONE
# ===========================================
@main_bp.route('/impostazioni')
@admin_required
def impostazioni():
    user_info = get_current_user_info()
    return render_template('impostazioni.html', user_info=user_info)

@main_bp.route('/impostazioni/utenti')
@admin_required
def gestione_utenti():
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    '''
                    SELECT u.*, r.nome AS ruolo_nome, em.nome AS ente_nome
                    FROM utenti u
                    LEFT JOIN ruoli r ON r.id = u.ruolo_id
                    LEFT JOIN enti_militari em ON em.id = u.ente_militare_id
                    ORDER BY u.cognome, u.nome
                    '''
                )
                users = cur.fetchall()
        return render_template('admin/users.html', users=users)
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@main_bp.route('/impostazioni/sistema')
@admin_required
def info_sistema():
    try:
        stats = get_system_info()
        return render_template('admin/system_info.html', stats=stats)
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

# ===========================================
# FUNZIONI HELPER
# ===========================================
def get_admin_dashboard_stats():
    stats = {}
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
                      AND (u.attivo IS NULL OR u.attivo = TRUE OR u.attivo = TRUE)
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

                # Operazioni attive (data_fine NULL o >= oggi)
                cur.execute(
                    '''
                    SELECT COUNT(*) AS count
                    FROM operazioni
                    WHERE data_fine IS NULL OR data_fine >= CURRENT_DATE
                    '''
                )
                stats['operazioni_attive'] = int(cur.fetchone()['count'])
    except Exception as e:
        print(f"Errore stats: {e}")
    return stats

def get_system_info():
    info = {
        'database_size': 0,
        'total_records': 0,
        'system_version': '2.0.0'
    }
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Dimensione DB (in MB)
                cur.execute("SELECT pg_database_size(current_database()) AS size_bytes")
                size_bytes = int(cur.fetchone()['size_bytes'])
                info['database_size'] = round(size_bytes / (1024 * 1024), 2)

                # Conteggio record principali
                tables = ['utenti', 'enti_militari', 'enti_civili', 'operazioni', 'attivita']
                total = 0
                for t in tables:
                    try:
                        cur.execute(f'SELECT COUNT(*) AS count FROM {t}')
                        total += int(cur.fetchone()['count'])
                    except Exception:
                        pass
                info['total_records'] = total
    except Exception as e:
        print(f"Errore system info: {e}")
    return info

# ===========================================
# CONTEXT PROCESSORS
# ===========================================
@main_bp.app_context_processor
def inject_globals():
    return {
        'current_year': datetime.now().year,
        'app_version': '2.0.0'
    }
