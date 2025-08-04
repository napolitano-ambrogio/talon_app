from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from auth import (
    login_required, admin_required, operatore_or_admin_required,
    get_current_user_info, log_user_action, get_user_accessible_entities,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
import sqlite3
import os
from datetime import datetime, timedelta

# Definizione percorso database
DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'talon_data.db')

def get_db_connection():
    """Connessione al database"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Definiamo un "Blueprint", un modulo per le nostre rotte
main_bp = Blueprint(
    'main', 
    __name__,
    template_folder='../templates',
    static_folder='../static'
)

# ===========================================
# ROUTE PRINCIPALI - SEMPLIFICATE
# ===========================================

@main_bp.route('/')
def index():
    """Redirect dalla root alla dashboard appropriata."""
    from flask import session
    if session.get('logged_in'):
        return redirect(url_for('main.dashboard'))
    else:
        return redirect(url_for('show_login'))

@main_bp.route('/dashboard')
@login_required
def dashboard():
    """Dashboard principale - SUPERSET (dashboard.html)"""
    user_id = request.current_user['user_id']
    user_info = get_current_user_info()
    user_role = get_user_role()
    accessible_entities = get_user_accessible_entities(user_id)
    
    # Recupera statistiche per la dashboard
    stats = get_dashboard_stats(user_id, accessible_entities)
    
    # Attività recenti
    recent_activities = get_recent_activities(user_id, accessible_entities, 5)
    
    # Notifiche utente
    notifications = get_user_notifications(user_id)
    
    # Log accesso dashboard
    log_user_action(
        user_id,
        'ACCESS_DASHBOARD',
        f'Accesso dashboard - Ruolo: {user_role}',
        'dashboard'
    )
    
    # Dashboard per tutti gli utenti con dati appropriati al ruolo
    return render_template('dashboard.html',
                         user_info=user_info,
                         user_role=user_role,
                         stats=stats,
                         recent_activities=recent_activities,
                         notifications=notifications,
                         accessible_entities_count=len(accessible_entities))

@main_bp.route('/dashboard_admin')
@admin_required 
def dashboard_admin():
    """Dashboard Amministratore - ADMIN ONLY (dashboard_admin.html)"""
    user_id = request.current_user['user_id']
    user_info = get_current_user_info()
    user_role = get_user_role()
    accessible_entities = get_user_accessible_entities(user_id)
    
    # Recupera statistiche avanzate per admin
    stats = get_admin_dashboard_stats()
    
    # Attività recenti sistema
    recent_activities = get_system_recent_activities(10)
    
    # Log di sistema
    system_logs = get_system_logs(5)
    
    # Notifiche admin
    notifications = get_admin_notifications()
    
    # Log accesso dashboard admin
    log_user_action(
        user_id,
        'ACCESS_ADMIN_DASHBOARD',
        f'Accesso dashboard amministratore - Enti totali: {stats.get("enti_militari", 0)}',
        'dashboard_admin'
    )
    
    return render_template('dashboard_admin.html',
                         user_info=user_info,
                         user_role=user_role,
                         stats=stats,
                         recent_activities=recent_activities,
                         system_logs=system_logs,
                         notifications=notifications,
                         accessible_entities_count=len(accessible_entities))

# ===========================================
# ROUTE DI SUPPORTO CORRETTE
# ===========================================

@main_bp.route('/impostazioni')
@admin_required
def impostazioni():
    """Pagina impostazioni principali - ADMIN ONLY"""
    user_info = get_current_user_info()
    return render_template('impostazioni.html', user_info=user_info)

@main_bp.route('/impostazioni/utenti')
@admin_required
def gestione_utenti():
    """Gestione utenti - ADMIN ONLY"""
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
        
        user_info = get_current_user_info()
        return render_template('admin/users.html', users=users, user_info=user_info)
    except Exception as e:
        flash(f'Errore nel caricamento utenti: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@main_bp.route('/impostazioni/sistema')
@admin_required
def info_sistema():
    """Informazioni sistema - ADMIN ONLY"""
    try:
        stats = get_system_info()
        user_info = get_current_user_info()
        return render_template('admin/system_info.html', 
                             stats=stats, 
                             user_info=user_info)
    except Exception as e:
        flash(f'Errore nel caricamento info sistema: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

# ===========================================
# ROUTE PLACEHOLDER PER MODULI NON IMPLEMENTATI
# ===========================================

@main_bp.route('/reports')
@operatore_or_admin_required
def reports():
    """Reports - OPERATORE e ADMIN"""
    user_info = get_current_user_info()
    return render_template('placeholder.html',
                         page_title='Reports',
                         message='Modulo Reports in fase di sviluppo. Sarà disponibile nella prossima versione.',
                         user_info=user_info)

@main_bp.route('/export')
@operatore_or_admin_required
def export():
    """Export dati - OPERATORE e ADMIN"""
    user_info = get_current_user_info()
    return render_template('placeholder.html',
                         page_title='Export Dati',
                         message='Funzionalità di export avanzato in fase di sviluppo.',
                         user_info=user_info)

# ===========================================
# ROUTE AZIONI RAPIDE
# ===========================================

@main_bp.route('/quick-action/new-user')
@admin_required
def quick_new_user():
    """Azione rapida: nuovo utente"""
    return redirect(url_for('main.gestione_utenti'))

@main_bp.route('/quick-action/new-ente-civile')
@operatore_or_admin_required
def quick_new_ente_civile():
    """Azione rapida: nuovo ente civile"""
    return redirect(url_for('enti_civili.inserisci_civile_form'))

@main_bp.route('/quick-action/new-ente-militare')
@operatore_or_admin_required
def quick_new_ente_militare():
    """Azione rapida: nuovo ente militare"""
    return redirect(url_for('enti_militari.inserisci_militare_form'))

@main_bp.route('/quick-action/new-operazione')
@operatore_or_admin_required
def quick_new_operazione():
    """Azione rapida: nuova operazione"""
    return redirect(url_for('operazioni.inserisci_operazione_form'))

@main_bp.route('/quick-action/new-attivita')
@operatore_or_admin_required
def quick_new_attivita():
    """Azione rapida: nuova attività"""
    return redirect(url_for('attivita.inserisci_attivita_form'))

# ===========================================
# FUNZIONI HELPER
# ===========================================

def get_dashboard_stats(user_id, accessible_entities):
    """Recupera statistiche per la dashboard basate sul ruolo utente"""
    conn = get_db_connection()
    stats = {}
    
    try:
        # Statistiche di base
        stats['enti_militari'] = 0
        stats['enti_civili'] = 0
        stats['operazioni'] = 0
        stats['attivita'] = 0
        stats['utenti'] = 0
        
        # Enti civili (visibili a tutti)
        try:
            enti_civili = conn.execute('SELECT COUNT(*) as count FROM enti_civili').fetchone()
            stats['enti_civili'] = enti_civili['count'] if enti_civili else 0
        except:
            pass
        
        # Enti militari (solo accessibili)
        if accessible_entities:
            try:
                placeholders = ','.join(['?' for _ in accessible_entities])
                enti_militari = conn.execute(
                    f'SELECT COUNT(*) as count FROM enti_militari WHERE id IN ({placeholders})',
                    accessible_entities
                ).fetchone()
                stats['enti_militari'] = enti_militari['count'] if enti_militari else 0
            except:
                pass
        
        # Operazioni
        try:
            operazioni = conn.execute(
                'SELECT COUNT(*) as count FROM operazioni WHERE data_fine IS NULL OR data_fine >= date("now")'
            ).fetchone()
            stats['operazioni'] = operazioni['count'] if operazioni else 0
        except:
            pass
        
        # Attività (solo quelle accessibili)
        if accessible_entities:
            try:
                placeholders = ','.join(['?' for _ in accessible_entities])
                attivita = conn.execute(
                    f'SELECT COUNT(*) as count FROM attivita WHERE ente_svolgimento_id IN ({placeholders})',
                    accessible_entities
                ).fetchone()
                stats['attivita'] = attivita['count'] if attivita else 0
            except:
                pass
        
        # Utenti (solo per admin)
        if is_admin():
            try:
                utenti = conn.execute('SELECT COUNT(*) as count FROM utenti WHERE attivo = 1').fetchone()
                stats['utenti'] = utenti['count'] if utenti else 0
            except:
                pass
    
    except Exception as e:
        print(f"Errore stats: {e}")
        pass
    finally:
        conn.close()
    
    return stats

def get_admin_dashboard_stats():
    """Statistiche avanzate per dashboard admin"""
    conn = get_db_connection()
    stats = get_dashboard_stats(1, None)  # Admin ha accesso a tutto
    
    try:
        # Statistiche aggiuntive per admin
        # Utenti per ruolo
        users_by_role = conn.execute(
            '''SELECT r.nome as ruolo, COUNT(u.id) as count
               FROM ruoli r
               LEFT JOIN utenti u ON u.ruolo_id = r.id AND u.attivo = 1
               GROUP BY r.id, r.nome'''
        ).fetchall()
        stats['users_by_role'] = {row['ruolo']: row['count'] for row in users_by_role}
        
        # Attività ultimo mese
        activities_month = conn.execute(
            '''SELECT COUNT(*) as count 
               FROM attivita 
               WHERE data_creazione >= date('now', '-30 days')'''
        ).fetchone()
        stats['activities_month'] = activities_month['count'] if activities_month else 0
        
        # Operazioni attive vs concluse
        ops_status = conn.execute(
            '''SELECT 
                COUNT(CASE WHEN data_fine IS NULL OR data_fine >= date('now') THEN 1 END) as attive,
                COUNT(CASE WHEN data_fine < date('now') THEN 1 END) as concluse
               FROM operazioni'''
        ).fetchone()
        stats['ops_attive'] = ops_status['attive'] if ops_status else 0
        stats['ops_concluse'] = ops_status['concluse'] if ops_status else 0
        
    except Exception as e:
        print(f"Errore admin stats: {e}")
    finally:
        conn.close()
    
    return stats

def get_recent_activities(user_id, accessible_entities, limit=10):
    """Recupera attività recenti per la dashboard"""
    if not accessible_entities:
        return []
    
    conn = get_db_connection()
    activities = []
    
    try:
        placeholders = ','.join(['?' for _ in accessible_entities])
        activities = conn.execute(f'''
            SELECT a.id, a.descrizione, a.data_inizio, em.nome as ente_nome, 
                   ta.nome as tipologia, a.data_creazione
            FROM attivita a
            JOIN enti_militari em ON a.ente_svolgimento_id = em.id
            JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
            WHERE a.ente_svolgimento_id IN ({placeholders})
            ORDER BY a.data_creazione DESC
            LIMIT ?
        ''', accessible_entities + [limit]).fetchall()
    except Exception as e:
        print(f"Errore recent activities: {e}")
    finally:
        conn.close()
    
    return activities

def get_system_recent_activities(limit=10):
    """Attività recenti di sistema (per admin)"""
    conn = get_db_connection()
    activities = []
    
    try:
        activities = conn.execute('''
            SELECT l.*, u.username, u.nome, u.cognome
            FROM log_utenti l
            JOIN utenti u ON l.utente_id = u.id
            WHERE l.esito = 'SUCCESS'
            ORDER BY l.timestamp DESC
            LIMIT ?
        ''', (limit,)).fetchall()
    except Exception:
        pass
    finally:
        conn.close()
    
    return activities

def get_system_logs(limit=5):
    """Log di sistema recenti (per admin)"""
    conn = get_db_connection()
    logs = []
    
    try:
        logs = conn.execute('''
            SELECT l.*, u.username
            FROM log_utenti l
            JOIN utenti u ON l.utente_id = u.id
            WHERE l.azione IN ('LOGIN_SUCCESS', 'LOGOUT', 'ACCESS_DENIED_ADMIN', 
                              'CREATE_ENTE_MILITARE', 'DELETE_ENTE_MILITARE',
                              'CREATE_OPERAZIONE', 'DELETE_OPERAZIONE')
            ORDER BY l.timestamp DESC
            LIMIT ?
        ''', (limit,)).fetchall()
    except Exception:
        pass
    finally:
        conn.close()
    
    return logs

def get_user_notifications(user_id):
    """Recupera notifiche per l'utente"""
    user_role = get_user_role()
    notifications = []
    
    # Notifiche base per tutti
    notifications.append({
        'type': 'info',
        'message': f'Benvenuto nel sistema TALON. Il tuo ruolo è: {user_role}',
        'timestamp': datetime.now()
    })
    
    # Notifiche specifiche per ruolo
    if user_role == ROLE_ADMIN:
        notifications.append({
            'type': 'success',
            'message': 'Sistema di autenticazione a 3 ruoli attivo e funzionante.',
            'timestamp': datetime.now()
        })
    elif user_role == ROLE_OPERATORE:
        notifications.append({
            'type': 'warning',
            'message': 'Ricorda: puoi modificare solo gli enti nel tuo cono d\'ombra.',
            'timestamp': datetime.now()
        })
    elif user_role == ROLE_VISUALIZZATORE:
        notifications.append({
            'type': 'info',
            'message': 'Accesso in sola lettura. Contatta un amministratore per modifiche.',
            'timestamp': datetime.now()
        })
    
    return notifications

def get_admin_notifications():
    """Notifiche specifiche per admin"""
    notifications = get_user_notifications(1)  # Base notifications
    
    conn = get_db_connection()
    try:
        # Controlla utenti inattivi
        inactive_users = conn.execute(
            '''SELECT COUNT(*) as count 
               FROM utenti 
               WHERE attivo = 1 AND ultimo_accesso < date('now', '-30 days')'''
        ).fetchone()
        
        if inactive_users and inactive_users['count'] > 0:
            notifications.append({
                'type': 'warning',
                'message': f'{inactive_users["count"]} utenti non accedono da oltre 30 giorni.',
                'timestamp': datetime.now()
            })
        
        # Controlla attività sospette
        failed_logins = conn.execute(
            '''SELECT COUNT(*) as count 
               FROM log_utenti 
               WHERE azione = 'LOGIN_FAILED' 
               AND timestamp >= datetime('now', '-1 hour')'''
        ).fetchone()
        
        if failed_logins and failed_logins['count'] > 5:
            notifications.append({
                'type': 'danger',
                'message': f'{failed_logins["count"]} tentativi di login falliti nell\'ultima ora.',
                'timestamp': datetime.now()
            })
    except Exception:
        pass
    finally:
        conn.close()
    
    return notifications

def get_system_info():
    """Informazioni di sistema"""
    conn = get_db_connection()
    info = {
        'database_size': 0,
        'total_records': 0,
        'last_backup': None,
        'system_version': '2.0.0',
        'python_version': '3.x'
    }
    
    try:
        # Dimensione database
        if os.path.exists(DATABASE_PATH):
            info['database_size'] = os.path.getsize(DATABASE_PATH) / (1024 * 1024)  # MB
        
        # Totale record
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
# GESTIONE ERRORI
# ===========================================

@main_bp.errorhandler(404)
def handle_not_found(error):
    """Gestione errore 404"""
    return render_template('errors/404.html'), 404

@main_bp.errorhandler(500)
def handle_internal_error(error):
    """Gestione errore 500"""
    return render_template('errors/500.html'), 500

# ===========================================
# CONTEXT PROCESSORS
# ===========================================

@main_bp.app_context_processor
def inject_globals():
    """Inietta variabili globali nei template"""
    return {
        'current_year': datetime.now().year,
        'app_version': '2.0.0',
        'role_admin': ROLE_ADMIN,
        'role_operatore': ROLE_OPERATORE,
        'role_visualizzatore': ROLE_VISUALIZZATORE
    }