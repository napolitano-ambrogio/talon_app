from flask import Blueprint, render_template, redirect, url_for, flash, request
from auth import (
    login_required, admin_required, operatore_or_admin_required,
    get_current_user_info, log_user_action, get_user_accessible_entities,
    is_admin, get_user_role, ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
import sqlite3
import os
from datetime import datetime

DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'talon_data.db')

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

main_bp = Blueprint(
    'main', 
    __name__,
    template_folder='../templates',
    static_folder='../static'
)

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
    conn = get_db_connection()
    stats = {}
    
    try:
        # Utenti per ruolo
        users_by_role = conn.execute(
            '''SELECT r.nome as ruolo, COUNT(u.id) as count
               FROM ruoli r
               LEFT JOIN utenti u ON u.ruolo_id = r.id AND u.attivo = 1
               GROUP BY r.id, r.nome'''
        ).fetchall()
        stats['users_by_role'] = {row['ruolo']: row['count'] for row in users_by_role}
        
        # Enti totali
        enti_militari = conn.execute('SELECT COUNT(*) as count FROM enti_militari').fetchone()
        stats['enti_militari'] = enti_militari['count'] if enti_militari else 0
        
        enti_civili = conn.execute('SELECT COUNT(*) as count FROM enti_civili').fetchone()
        stats['enti_civili'] = enti_civili['count'] if enti_civili else 0
        
        # Operazioni attive
        ops = conn.execute(
            'SELECT COUNT(*) as count FROM operazioni WHERE data_fine IS NULL OR data_fine >= date("now")'
        ).fetchone()
        stats['operazioni_attive'] = ops['count'] if ops else 0
        
    except Exception as e:
        print(f"Errore stats: {e}")
    finally:
        conn.close()
    
    return stats

def get_system_info():
    conn = get_db_connection()
    info = {
        'database_size': 0,
        'total_records': 0,
        'system_version': '2.0.0'
    }
    
    try:
        if os.path.exists(DATABASE_PATH):
            info['database_size'] = os.path.getsize(DATABASE_PATH) / (1024 * 1024)
        
        tables = ['utenti', 'enti_militari', 'enti_civili', 'operazioni', 'attivita']
        total = 0
        for table in tables:
            try:
                count = conn.execute(f'SELECT COUNT(*) as count FROM {table}').fetchone()
                total += count['count'] if count else 0
            except:
                pass
        info['total_records'] = total
        
    except Exception as e:
        print(f"Errore system info: {e}")
    finally:
        conn.close()
    
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