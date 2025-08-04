from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from auth import (
    login_required, permission_required,
    admin_required, operatore_or_admin_required,
    log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
import sqlite3
import os
from datetime import datetime

# ===========================================
# CONFIGURAZIONE DATABASE
# ===========================================

DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'talon_data.db')

def get_db_connection():
    """Connessione al database"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

operazioni_bp = Blueprint('operazioni', __name__, template_folder='../templates')

# ===========================================
# FUNZIONI HELPER
# ===========================================

def validate_operazione_data(form_data, operazione_id=None):
    """Valida i dati di un'operazione"""
    errors = []
    required_fields = ['nome_missione', 'teatro_operativo', 'nazione']
    
    for field in required_fields:
        if not form_data.get(field, '').strip():
            errors.append(f'Il campo {field.replace("_", " ")} è obbligatorio.')
    
    # Validazione date
    data_inizio = form_data.get('data_inizio')
    data_fine = form_data.get('data_fine')
    
    if data_inizio and data_fine:
        try:
            inizio = datetime.strptime(data_inizio, '%Y-%m-%d')
            fine = datetime.strptime(data_fine, '%Y-%m-%d')
            if fine < inizio:
                errors.append('La data di fine non può essere precedente alla data di inizio.')
        except ValueError:
            errors.append('Formato data non valido. Utilizzare YYYY-MM-DD.')
    
    return errors

def check_duplicate_operazione(conn, nome_missione, nome_breve, exclude_id=None):
    """Verifica se esiste già un'operazione con lo stesso nome"""
    if exclude_id:
        existing = conn.execute(
            'SELECT id FROM operazioni WHERE (nome_missione = ? OR (nome_breve = ? AND nome_breve != "")) AND id != ?',
            (nome_missione, nome_breve, exclude_id)
        ).fetchone()
    else:
        existing = conn.execute(
            'SELECT id FROM operazioni WHERE nome_missione = ? OR (nome_breve = ? AND nome_breve != "")',
            (nome_missione, nome_breve)
        ).fetchone()
    
    return existing is not None

def get_operazione_stato(operazione):
    """Calcola lo stato di un'operazione"""
    if not operazione['data_inizio']:
        return 'pianificata'
    
    try:
        inizio = datetime.strptime(operazione['data_inizio'], '%Y-%m-%d')
        oggi = datetime.now()
        
        if inizio > oggi:
            return 'pianificata'
        elif operazione['data_fine']:
            fine = datetime.strptime(operazione['data_fine'], '%Y-%m-%d')
            return 'conclusa' if fine < oggi else 'attiva'
        else:
            return 'attiva'
    except ValueError:
        return 'sconosciuto'

def get_operazioni_stats(conn):
    """Recupera statistiche sulle operazioni"""
    try:
        stats = {}
        
        # Totale operazioni
        total = conn.execute('SELECT COUNT(*) as count FROM operazioni').fetchone()
        stats['totale'] = total['count'] if total else 0
        
        # Operazioni per stato
        stati = {
            'attive': conn.execute(
                'SELECT COUNT(*) as count FROM operazioni WHERE data_inizio <= date("now") AND (data_fine IS NULL OR data_fine >= date("now"))'
            ).fetchone()['count'],
            'concluse': conn.execute(
                'SELECT COUNT(*) as count FROM operazioni WHERE data_fine < date("now")'
            ).fetchone()['count'],
            'pianificate': conn.execute(
                'SELECT COUNT(*) as count FROM operazioni WHERE data_inizio > date("now") OR data_inizio IS NULL'
            ).fetchone()['count']
        }
        stats['per_stato'] = stati
        
        return stats
    except sqlite3.OperationalError:
        return {}

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@operazioni_bp.route('/operazioni')
@permission_required('VIEW_OPERAZIONI')
def lista_operazioni():
    """Lista tutte le operazioni"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    try:
        conn = get_db_connection()
        
        # Query base
        operazioni = conn.execute(
            '''SELECT o.*, 
                      u_creato.username as creato_da_username, 
                      u_creato.nome as creato_da_nome
               FROM operazioni o
               LEFT JOIN utenti u_creato ON o.creato_da = u_creato.id
               ORDER BY o.data_inizio DESC NULLS LAST, o.nome_missione'''
        ).fetchall()
        
        # Statistiche (solo per operatore+)
        stats = {}
        if is_operatore_or_above():
            stats = get_operazioni_stats(conn)
        
        conn.close()
        
        # Calcola stati per ogni operazione
        operazioni_con_stato = []
        for op in operazioni:
            op_dict = dict(op)
            op_dict['stato'] = get_operazione_stato(op)
            operazioni_con_stato.append(op_dict)
        
        log_user_action(
            user_id,
            'VIEW_OPERAZIONI_LIST',
            f'Visualizzate {len(operazioni)} operazioni',
            'operazioni'
        )
        
        return render_template('lista_operazioni.html',
                             operazioni=operazioni_con_stato,
                             stats=stats,
                             user_role=user_role)
        
    except Exception as e:
        flash(f'Errore nel caricamento delle operazioni: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@operazioni_bp.route('/inserisci_operazione')
@operatore_or_admin_required
@permission_required('CREATE_OPERAZIONI')
def inserisci_operazione_form():
    """Form per inserire nuova operazione"""
    user_id = request.current_user['user_id']
    
    log_user_action(
        user_id,
        'ACCESS_CREATE_OPERAZIONE_FORM',
        'Accesso form creazione operazione'
    )
    
    return render_template('inserimento_operazione.html')

@operazioni_bp.route('/salva_operazione', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_OPERAZIONI')
def salva_operazione():
    """Salva nuova operazione"""
    user_id = request.current_user['user_id']
    
    # Validazione input
    validation_errors = validate_operazione_data(request.form)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('operazioni.inserisci_operazione_form'))
    
    try:
        nome_missione = request.form['nome_missione'].upper().strip()
        nome_breve = request.form.get('nome_breve', '').upper().strip()
        teatro = request.form['teatro_operativo'].upper().strip()
        nazione = request.form['nazione'].upper().strip()
        data_inizio = request.form.get('data_inizio') or None
        data_fine = request.form.get('data_fine') or None
        descrizione = request.form.get('descrizione', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica duplicati
        if check_duplicate_operazione(conn, nome_missione, nome_breve):
            conn.close()
            flash('Esiste già un\'operazione con questo nome missione o nome breve.', 'warning')
            return redirect(url_for('operazioni.inserisci_operazione_form'))
        
        # Inserimento
        cursor = conn.execute(
            '''INSERT INTO operazioni 
               (nome_missione, nome_breve, teatro_operativo, nazione, data_inizio, data_fine, 
                descrizione, creato_da, data_creazione) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))''',
            (nome_missione, nome_breve, teatro, nazione, data_inizio, data_fine, 
             descrizione, user_id)
        )
        
        new_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'CREATE_OPERAZIONE',
            f'Creata operazione: {nome_missione} ({nome_breve})',
            'operazione',
            new_id
        )
        
        flash(f'Operazione "{nome_missione}" creata con successo.', 'success')
        return redirect(url_for('operazioni.visualizza_operazione', id=new_id))
        
    except Exception as e:
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        return redirect(url_for('operazioni.inserisci_operazione_form'))

@operazioni_bp.route('/operazione/<int:id>')
@permission_required('VIEW_OPERAZIONI')
def visualizza_operazione(id):
    """Visualizza dettagli operazione"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    try:
        conn = get_db_connection()
        
        operazione = conn.execute(
            '''SELECT o.*, 
                      u_creato.username as creato_da_username, 
                      u_creato.nome as creato_da_nome,
                      u_modificato.username as modificato_da_username, 
                      u_modificato.nome as modificato_da_nome
               FROM operazioni o
               LEFT JOIN utenti u_creato ON o.creato_da = u_creato.id
               LEFT JOIN utenti u_modificato ON o.modificato_da = u_modificato.id
               WHERE o.id = ?''', 
            (id,)
        ).fetchone()
        
        if operazione is None:
            conn.close()
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        conn.close()
        
        # Calcola stato operazione
        stato = get_operazione_stato(operazione)
        
        log_user_action(
            user_id,
            'VIEW_OPERAZIONE',
            f'Visualizzata operazione: {operazione["nome_missione"]}',
            'operazione',
            id
        )
        
        return render_template('descrizione_operazione.html', 
                             operazione=operazione, 
                             stato=stato,
                             user_role=user_role)
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'operazione: {str(e)}', 'error')
        return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/modifica_operazione/<int:id>')
@operatore_or_admin_required
@permission_required('EDIT_OPERAZIONI')
def modifica_operazione_form(id):
    """Form per modificare operazione"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        operazione = conn.execute('SELECT * FROM operazioni WHERE id = ?', (id,)).fetchone()
        conn.close()
        
        if operazione is None:
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        log_user_action(
            user_id,
            'ACCESS_EDIT_OPERAZIONE_FORM',
            f'Accesso form modifica operazione: {operazione["nome_missione"]}',
            'operazione',
            id
        )
        
        return render_template('modifica_operazione.html', operazione=operazione)
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'operazione: {str(e)}', 'error')
        return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/aggiorna_operazione/<int:id>', methods=['POST'])
@operatore_or_admin_required
@permission_required('EDIT_OPERAZIONI')
def aggiorna_operazione(id):
    """Aggiorna operazione esistente"""
    user_id = request.current_user['user_id']
    
    # Validazione input
    validation_errors = validate_operazione_data(request.form, id)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('operazioni.modifica_operazione_form', id=id))
    
    try:
        nome_missione = request.form['nome_missione'].upper().strip()
        nome_breve = request.form.get('nome_breve', '').upper().strip()
        teatro = request.form['teatro_operativo'].upper().strip()
        nazione = request.form['nazione'].upper().strip()
        data_inizio = request.form.get('data_inizio') or None
        data_fine = request.form.get('data_fine') or None
        descrizione = request.form.get('descrizione', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica che l'operazione esista
        existing = conn.execute('SELECT nome_missione FROM operazioni WHERE id = ?', (id,)).fetchone()
        if not existing:
            conn.close()
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        # Verifica duplicati (escludendo se stesso)
        if check_duplicate_operazione(conn, nome_missione, nome_breve, id):
            conn.close()
            flash('Esiste già un\'operazione con questo nome missione o nome breve.', 'warning')
            return redirect(url_for('operazioni.modifica_operazione_form', id=id))
        
        # Aggiornamento
        conn.execute(
            '''UPDATE operazioni 
               SET nome_missione=?, nome_breve=?, teatro_operativo=?, nazione=?, 
                   data_inizio=?, data_fine=?, descrizione=?,
                   modificato_da=?, data_modifica=datetime('now')
               WHERE id = ?''',
            (nome_missione, nome_breve, teatro, nazione, data_inizio, data_fine, 
             descrizione, user_id, id)
        )
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'UPDATE_OPERAZIONE',
            f'Aggiornata operazione: {nome_missione}',
            'operazione',
            id
        )
        
        flash(f'Operazione "{nome_missione}" aggiornata con successo.', 'success')
        return redirect(url_for('operazioni.visualizza_operazione', id=id))
        
    except Exception as e:
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
        return redirect(url_for('operazioni.modifica_operazione_form', id=id))

@operazioni_bp.route('/elimina_operazione/<int:id>', methods=['POST'])
@admin_required
def elimina_operazione(id):
    """Elimina operazione - Solo ADMIN"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        
        # Recupera info prima di eliminare
        operazione = conn.execute('SELECT nome_missione FROM operazioni WHERE id = ?', (id,)).fetchone()
        if not operazione:
            conn.close()
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        nome_operazione = operazione['nome_missione']
        
        # Verifica dipendenze (attività collegate)
        attivita = conn.execute(
            'SELECT COUNT(*) as count FROM attivita WHERE operazione_id = ?',
            (id,)
        ).fetchone()
        
        if attivita and attivita['count'] > 0:
            conn.close()
            flash(f'Impossibile eliminare l\'operazione: {attivita["count"]} attività collegate.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        # Eliminazione
        conn.execute('DELETE FROM operazioni WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'DELETE_OPERAZIONE',
            f'Eliminata operazione: {nome_operazione}',
            'operazione',
            id
        )
        
        flash(f'Operazione "{nome_operazione}" eliminata con successo.', 'success')
        
    except Exception as e:
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
    
    return redirect(url_for('operazioni.lista_operazioni'))

# ===========================================
# API ENDPOINTS
# ===========================================

@operazioni_bp.route('/api/operazioni/attive')
@login_required
def api_operazioni_attive():
    """API per recuperare operazioni attive"""
    try:
        conn = get_db_connection()
        operazioni_attive = conn.execute(
            '''SELECT id, nome_missione, nome_breve, data_inizio, data_fine
               FROM operazioni 
               WHERE data_inizio <= date('now') 
               AND (data_fine IS NULL OR data_fine >= date('now'))
               ORDER BY data_inizio DESC'''
        ).fetchall()
        conn.close()
        
        return jsonify([{
            'id': op['id'],
            'nome_missione': op['nome_missione'],
            'nome_breve': op['nome_breve'],
            'data_inizio': op['data_inizio'],
            'data_fine': op['data_fine']
        } for op in operazioni_attive])
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500