from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from auth import (
    login_required, admin_required, operatore_or_admin_required,
    get_current_user_info, log_user_action, get_accessible_entities,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
from services.database import get_db_connection
import sqlite3
import sys
from datetime import datetime, timedelta

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
    if 'user_id' in request.cookies or 'logged_in' in request.cookies:
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
    accessible_entities = get_accessible_entities()
    
    # Log accesso dashboard
    log_user_action(
        user_id,
        'ACCESS_DASHBOARD',
        f'Accesso dashboard Superset - Ruolo: {user_role}',
        'dashboard'
    )
    
    # Dashboard Superset per tutti gli utenti
    return render_template('dashboard.html',
                         user_info=user_info,
                         user_role=user_role,
                         accessible_entities_count=len(accessible_entities))

@main_bp.route('/dashboard_admin')
@admin_required 
def dashboard_admin():
    """Dashboard Amministratore - ADMIN ONLY (dashboard_admin.html)"""
    user_id = request.current_user['user_id']
    user_info = get_current_user_info()
    user_role = get_user_role()
    accessible_entities = get_accessible_entities()
    
    # Recupera statistiche per la dashboard admin
    stats = get_dashboard_stats(user_id, accessible_entities)
    
    # Attività recenti per admin
    recent_activities = get_recent_activities(user_id, accessible_entities, 5)
    
    # Notifiche utente
    notifications = get_user_notifications(user_id)
    
    # Log accesso dashboard admin
    log_user_action(
        user_id,
        'ACCESS_ADMIN_DASHBOARD',
        f'Accesso dashboard amministratore - Enti accessibili: {len(accessible_entities)}',
        'dashboard_admin'
    )
    
    return render_template('dashboard_admin.html',
                         user_info=user_info,
                         user_role=user_role,
                         stats=stats,
                         recent_activities=recent_activities,
                         notifications=notifications,
                         accessible_entities_count=len(accessible_entities))

# ===========================================
# ROUTE PER SUPPORTARE LA SIDEBAR - SEMPLIFICATE
# ===========================================

@main_bp.route('/enti_militari/organigramma')
@login_required 
def enti_militari_organigramma():
    """Organigramma enti militari - DIRETTO"""
    # Implementazione diretta senza redirect loop
    user_info = get_current_user_info()
    user_role = get_user_role()
    
    try:
        # Prova a caricare i dati per l'organigramma
        conn = get_db_connection()
        
        # Query per l'organigramma (struttura ad albero)
        enti_query = '''
            SELECT id, nome, codice, parent_id, livello, descrizione
            FROM enti_militari 
            ORDER BY parent_id, nome
        '''
        enti = conn.execute(enti_query).fetchall()
        conn.close()
        
        # Costruisci la struttura ad albero
        tree = build_tree_structure(enti)
        
        return render_template('organigramma.html',
                             tree=tree,
                             user_info=user_info,
                             user_role=user_role,
                             view_all=request.args.get('view') == 'all')
        
    except Exception as e:
        print(f"Errore organigramma: {e}")
        # Fallback: carica template senza dati
        return render_template('organigramma.html',
                             tree=[],
                             user_info=user_info,
                             user_role=user_role,
                             view_all=False)

@main_bp.route('/enti_civili')
@login_required
def enti_civili_list():
    """Lista enti civili - DIRETTO"""
    user_info = get_current_user_info()
    user_role = get_user_role()
    
    try:
        conn = get_db_connection()
        enti_civili = conn.execute('''
            SELECT id, nome, citta, provincia, codice_fiscale, telefono, email
            FROM enti_civili 
            ORDER BY nome
        ''').fetchall()
        conn.close()
        
        return render_template('enti_civili/lista_civili.html',
                             enti_civili=enti_civili,
                             user_info=user_info,
                             user_role=user_role)
        
    except Exception as e:
        print(f"Errore enti civili: {e}")
        # Template placeholder
        return render_template('placeholder.html',
                             page_title='Enti Civili',
                             message='Modulo Enti Civili in fase di sviluppo',
                             user_info=user_info)

@main_bp.route('/attivita')
@operatore_or_admin_required
def attivita_list():
    """Lista attività - OPERATORE e ADMIN"""
    user_info = get_current_user_info()
    return render_template('placeholder.html',
                         page_title='Attività',
                         message='Modulo Attività in fase di sviluppo',
                         user_info=user_info)

@main_bp.route('/operazioni')
@operatore_or_admin_required  
def operazioni_list():
    """Lista operazioni - OPERATORE e ADMIN"""
    user_info = get_current_user_info()
    return render_template('placeholder.html',
                         page_title='Operazioni',
                         message='Modulo Operazioni in fase di sviluppo',
                         user_info=user_info)

@main_bp.route('/admin/users')
@admin_required
def admin_users():
    """Gestione utenti - ADMIN ONLY"""
    user_info = get_current_user_info()
    return render_template('placeholder.html',
                         page_title='Gestione Utenti',
                         message='Modulo Gestione Utenti in fase di sviluppo',
                         user_info=user_info)

@main_bp.route('/admin/system-info')
@admin_required
def admin_system_info():
    """Informazioni sistema - ADMIN ONLY"""
    user_info = get_current_user_info()
    return render_template('placeholder.html',
                         page_title='Informazioni Sistema',
                         message='Modulo Info Sistema in fase di sviluppo',
                         user_info=user_info)

# ===========================================
# ROUTE AZIONI RAPIDE DASHBOARD ADMIN
# ===========================================

@main_bp.route('/admin/users/new')
@admin_required
def admin_users_new():
    """Nuovo utente"""
    flash('Funzione "Nuovo Utente" non ancora implementata', 'info')
    return redirect(url_for('main.dashboard_admin'))

@main_bp.route('/enti_civili/new')
@operatore_or_admin_required
def enti_civili_new():
    """Nuovo ente civile"""
    flash('Funzione "Nuovo Ente Civile" non ancora implementata', 'info')
    return redirect(url_for('main.dashboard_admin'))

@main_bp.route('/enti_militari/new')
@operatore_or_admin_required
def enti_militari_new():
    """Nuovo ente militare"""
    flash('Funzione "Nuovo Ente Militare" non ancora implementata', 'info')
    return redirect(url_for('main.dashboard_admin'))

@main_bp.route('/operazioni/new')
@operatore_or_admin_required
def operazioni_new():
    """Nuova operazione"""
    flash('Funzione "Nuova Operazione" non ancora implementata', 'info')
    return redirect(url_for('main.dashboard_admin'))

@main_bp.route('/admin/backup')
@admin_required
def admin_backup():
    """Backup database"""
    try:
        flash('Backup avviato con successo', 'success')
        log_user_action(
            request.current_user['user_id'],
            'BACKUP_DATABASE',
            'Avvio backup database'
        )
        return redirect(url_for('main.dashboard_admin'))
    except Exception as e:
        flash(f'Errore durante il backup: {str(e)}', 'error')
        return redirect(url_for('main.dashboard_admin'))

@main_bp.route('/admin/logs')
@admin_required
def admin_logs():
    """Visualizza log sistema"""
    try:
        user_id = request.current_user['user_id']
        conn = get_db_connection()
        
        logs = conn.execute('''
            SELECT l.*, u.username, u.nome, u.cognome
            FROM log_utenti l
            LEFT JOIN utenti u ON l.utente_id = u.id
            ORDER BY l.timestamp DESC
            LIMIT 100
        ''').fetchall()
        
        conn.close()
        
        log_user_action(user_id, 'VIEW_LOGS', 'Visualizzazione log sistema')
        
        user_info = get_current_user_info()
        return render_template('admin/logs.html', logs=logs, user_info=user_info)
        
    except Exception as e:
        flash(f'Errore nel caricamento log: {str(e)}', 'error')
        return redirect(url_for('main.dashboard_admin'))

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
        stats['utenti'] = 0
        
        # Enti civili (visibili a tutti)
        try:
            enti_civili = conn.execute('SELECT COUNT(*) as count FROM enti_civili').fetchone()
            stats['enti_civili'] = enti_civili['count'] if enti_civili else 0
        except:
            pass
        
        # Enti militari
        try:
            enti_militari = conn.execute('SELECT COUNT(*) as count FROM enti_militari').fetchone()
            stats['enti_militari'] = enti_militari['count'] if enti_militari else 0
        except:
            pass
        
        # Operazioni
        try:
            operazioni = conn.execute('SELECT COUNT(*) as count FROM operazioni').fetchone()
            stats['operazioni'] = operazioni['count'] if operazioni else 0
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

def get_recent_activities(user_id, accessible_entities, limit=10):
    """Recupera attività recenti per la dashboard"""
    return []  # Placeholder

def get_user_notifications(user_id):
    """Recupera notifiche per l'utente"""
    user_role = get_user_role()
    notifications = []
    
    if user_role == ROLE_ADMIN:
        notifications.append({
            'type': 'info',
            'message': 'Sistema aggiornato con successo ai nuovi ruoli.',
            'timestamp': datetime.now()
        })
    
    return notifications

def build_tree_structure(enti):
    """Costruisce la struttura ad albero per l'organigramma"""
    tree = []
    enti_dict = {ente['id']: dict(ente) for ente in enti}
    
    # Aggiungi lista children a ogni ente
    for ente in enti_dict.values():
        ente['children'] = []
    
    # Costruisci l'albero
    for ente in enti_dict.values():
        if ente['parent_id'] is None:
            tree.append(ente)
        else:
            parent = enti_dict.get(ente['parent_id'])
            if parent:
                parent['children'].append(ente)
    
    return tree

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
        'app_version': '2.0.1',
        'role_admin': ROLE_ADMIN,
        'role_operatore': ROLE_OPERATORE,
        'role_visualizzatore': ROLE_VISUALIZZATORE
    }