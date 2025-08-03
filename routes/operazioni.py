from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from services.database import get_db_connection
from auth import (
    login_required, permission_required,
    admin_required, operatore_or_admin_required,
    log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
import sqlite3
from datetime import datetime

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
                'SELECT COUNT(*) as count FROM operazioni WHERE data_inizio > date("now")'
            ).fetchone()['count']
        }
        stats['per_stato'] = stati
        
        # Operazioni per teatro
        per_teatro = conn.execute(
            '''SELECT teatro_operativo, COUNT(*) as count 
               FROM operazioni 
               GROUP BY teatro_operativo 
               ORDER BY count DESC 
               LIMIT 10'''
        ).fetchall()
        stats['per_teatro'] = per_teatro
        
        # Operazioni create negli ultimi 30 giorni
        recenti = conn.execute(
            '''SELECT COUNT(*) as count 
               FROM operazioni 
               WHERE data_creazione >= date('now', '-30 days')'''
        ).fetchone()
        stats['recenti'] = recenti['count'] if recenti else 0
        
        return stats
    except sqlite3.OperationalError:
        return {}

def check_operazione_dependencies(conn, operazione_id):
    """Verifica le dipendenze di un'operazione"""
    dependencies = []
    
    # Verifica attività collegate
    try:
        attivita = conn.execute(
            'SELECT COUNT(*) as count FROM attivita WHERE operazione_id = ?',
            (operazione_id,)
        ).fetchone()
        
        if attivita and attivita['count'] > 0:
            dependencies.append(f"{attivita['count']} attività")
    except sqlite3.OperationalError:
        pass
    
    # Verifica partecipazioni (se tabella esiste)
    try:
        partecipazioni = conn.execute(
            'SELECT COUNT(*) as count FROM partecipazioni WHERE operazione_id = ?',
            (operazione_id,)
        ).fetchone()
        
        if partecipazioni and partecipazioni['count'] > 0:
            dependencies.append(f"{partecipazioni['count']} partecipazioni")
    except sqlite3.OperationalError:
        pass
    
    # Verifica equipaggiamenti (se tabella esiste)
    try:
        equipaggiamenti = conn.execute(
            'SELECT COUNT(*) as count FROM equipaggiamenti_operazione WHERE operazione_id = ?',
            (operazione_id,)
        ).fetchone()
        
        if equipaggiamenti and equipaggiamenti['count'] > 0:
            dependencies.append(f"{equipaggiamenti['count']} equipaggiamenti")
    except sqlite3.OperationalError:
        pass
    
    return dependencies

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@operazioni_bp.route('/operazioni')
@permission_required('VIEW_OPERAZIONI')
def lista_operazioni():
    """Lista tutte le operazioni con filtri avanzati"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    # Parametri di filtro
    search = request.args.get('search', '').strip()
    stato = request.args.get('stato', '')  # attiva, conclusa, pianificata
    teatro = request.args.get('teatro', '')
    nazione = request.args.get('nazione', '')
    anno = request.args.get('anno', '')
    page = request.args.get('page', 1, type=int)
    per_page = 25
    
    try:
        conn = get_db_connection()
        
        # Query base
        base_query = '''SELECT o.*, 
                               u_creato.username as creato_da_username, u_creato.nome as creato_da_nome,
                               u_modificato.username as modificato_da_username, u_modificato.nome as modificato_da_nome
                        FROM operazioni o
                        LEFT JOIN utenti u_creato ON o.creato_da = u_creato.id
                        LEFT JOIN utenti u_modificato ON o.modificato_da = u_modificato.id'''
        count_query = 'SELECT COUNT(*) as total FROM operazioni o'
        where_clauses = []
        params = []
        
        # Applica filtri
        if search:
            where_clauses.append('(o.nome_missione LIKE ? OR o.nome_breve LIKE ? OR o.teatro_operativo LIKE ? OR o.nazione LIKE ? OR o.descrizione LIKE ?)')
            search_param = f'%{search.upper()}%'
            params.extend([search_param] * 5)
        
        if stato == 'attiva':
            where_clauses.append('(o.data_inizio <= date("now") AND (o.data_fine IS NULL OR o.data_fine >= date("now")))')
        elif stato == 'conclusa':
            where_clauses.append('o.data_fine < date("now")')
        elif stato == 'pianificata':
            where_clauses.append('o.data_inizio > date("now")')
        
        if teatro:
            where_clauses.append('o.teatro_operativo = ?')
            params.append(teatro.upper())
        
        if nazione:
            where_clauses.append('o.nazione = ?')
            params.append(nazione.upper())
        
        if anno:
            where_clauses.append('strftime("%Y", o.data_inizio) = ?')
            params.append(anno)
        
        # Costruisci query finale
        if where_clauses:
            where_clause = ' WHERE ' + ' AND '.join(where_clauses)
            base_query += where_clause
            count_query += where_clause.replace('o.', '')
        
        # Conta totali
        total_operazioni = conn.execute(count_query, params).fetchone()['total']
        
        # Query con paginazione
        base_query += ' ORDER BY o.data_inizio DESC NULLS LAST, o.nome_missione LIMIT ? OFFSET ?'
        params.extend([per_page, (page - 1) * per_page])
        
        operazioni = conn.execute(base_query, params).fetchall()
        
        # Opzioni per filtri
        teatri = conn.execute(
            '''SELECT DISTINCT teatro_operativo 
               FROM operazioni 
               WHERE teatro_operativo IS NOT NULL AND teatro_operativo != "" 
               ORDER BY teatro_operativo'''
        ).fetchall()
        
        nazioni = conn.execute(
            '''SELECT DISTINCT nazione 
               FROM operazioni 
               WHERE nazione IS NOT NULL AND nazione != ""
               ORDER BY nazione'''
        ).fetchall()
        
        anni = conn.execute(
            '''SELECT DISTINCT strftime("%Y", data_inizio) as anno
               FROM operazioni 
               WHERE data_inizio IS NOT NULL
               ORDER BY anno DESC'''
        ).fetchall()
        
        # Statistiche (solo per operatore+)
        stats = {}
        if is_operatore_or_above():
            stats = get_operazioni_stats(conn)
        
        conn.close()
        
        # Calcola paginazione
        total_pages = (total_operazioni + per_page - 1) // per_page
        
        # Calcola stati per ogni operazione
        operazioni_con_stato = []
        for op in operazioni:
            op_dict = dict(op)
            op_dict['stato'] = get_operazione_stato(op)
            operazioni_con_stato.append(op_dict)
        
        log_user_action(
            user_id,
            'VIEW_OPERAZIONI_LIST',
            f'Visualizzate {len(operazioni)} operazioni (pagina {page}/{total_pages}) - Filtri: stato={stato}, teatro={teatro}',
            'operazioni'
        )
        
        return render_template('lista_operazioni.html',
                             operazioni=operazioni_con_stato,
                             teatri=teatri,
                             nazioni=nazioni,
                             anni=anni,
                             stats=stats,
                             filtri={
                                 'search': search,
                                 'stato': stato,
                                 'teatro': teatro,
                                 'nazione': nazione,
                                 'anno': anno
                             },
                             paginazione={
                                 'page': page,
                                 'per_page': per_page,
                                 'total': total_operazioni,
                                 'total_pages': total_pages
                             },
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
    """Salva nuova operazione con validazione completa"""
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
        obiettivi = request.form.get('obiettivi', '').upper().strip()
        note = request.form.get('note', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica duplicati
        if check_duplicate_operazione(conn, nome_missione, nome_breve):
            conn.close()
            flash('Esiste già un\'operazione con questo nome missione o nome breve.', 'warning')
            return redirect(url_for('operazioni.inserisci_operazione_form'))
        
        # Inserimento con tracking
        cursor = conn.execute(
            '''INSERT INTO operazioni 
               (nome_missione, nome_breve, teatro_operativo, nazione, data_inizio, data_fine, 
                descrizione, obiettivi, note, creato_da, data_creazione) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))''',
            (nome_missione, nome_breve, teatro, nazione, data_inizio, data_fine, 
             descrizione, obiettivi, note, user_id)
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
        log_user_action(
            user_id,
            'CREATE_OPERAZIONE_ERROR',
            f'Errore creazione operazione: {str(e)}',
            'operazione',
            result='FAILED'
        )
        return redirect(url_for('operazioni.inserisci_operazione_form'))

@operazioni_bp.route('/operazione/<int:id>')
@permission_required('VIEW_OPERAZIONI')
def visualizza_operazione(id):
    """Visualizza dettagli operazione con statistiche correlate"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    try:
        conn = get_db_connection()
        
        # Query principale con info utenti
        operazione = conn.execute(
            '''SELECT o.*, 
                      u_creato.username as creato_da_username, u_creato.nome as creato_da_nome,
                      u_modificato.username as modificato_da_username, u_modificato.nome as modificato_da_nome
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
        
        # Statistiche correlate (solo per operatore+)
        stats = {}
        if is_operatore_or_above():
            try:
                # Attività collegate
                attivita_stats = conn.execute(
                    '''SELECT COUNT(*) as totale,
                              COUNT(CASE WHEN data_fine IS NULL OR data_fine >= date('now') THEN 1 END) as attive,
                              COUNT(CASE WHEN data_fine < date('now') THEN 1 END) as concluse
                       FROM attivita WHERE operazione_id = ?''',
                    (id,)
                ).fetchone()
                stats['attivita'] = dict(attivita_stats) if attivita_stats else {'totale': 0, 'attive': 0, 'concluse': 0}
                
                # Enti coinvolti
                enti_coinvolti = conn.execute(
                    '''SELECT DISTINCT em.nome, em.codice, COUNT(a.id) as num_attivita
                       FROM attivita a
                       JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                       WHERE a.operazione_id = ?
                       GROUP BY em.id, em.nome, em.codice
                       ORDER BY num_attivita DESC''',
                    (id,)
                ).fetchall()
                stats['enti_coinvolti'] = enti_coinvolti
                
                # Personale totale impiegato
                personale_stats = conn.execute(
                    '''SELECT 
                        SUM(personale_ufficiali) as tot_ufficiali,
                        SUM(personale_sottufficiali) as tot_sottufficiali,
                        SUM(personale_graduati) as tot_graduati,
                        SUM(personale_civili) as tot_civili
                       FROM attivita WHERE operazione_id = ?''',
                    (id,)
                ).fetchone()
                stats['personale'] = dict(personale_stats) if personale_stats else {}
                
                # Timeline attività
                timeline = conn.execute(
                    '''SELECT a.id, a.descrizione, a.data_inizio, a.data_fine, 
                              em.nome as ente_nome, ta.nome as tipologia
                       FROM attivita a
                       JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                       JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                       WHERE a.operazione_id = ?
                       ORDER BY a.data_inizio DESC
                       LIMIT 10''',
                    (id,)
                ).fetchall()
                stats['timeline'] = timeline
                
            except sqlite3.OperationalError:
                stats = {'attivita': {'totale': 0, 'attive': 0, 'concluse': 0}, 
                        'enti_coinvolti': [], 'personale': {}, 'timeline': []}
        
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
                             stats=stats,
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
    """Aggiorna operazione esistente con validazione completa"""
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
        obiettivi = request.form.get('obiettivi', '').upper().strip()
        note = request.form.get('note', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica che l'operazione esista
        existing = conn.execute('SELECT nome_missione, nome_breve FROM operazioni WHERE id = ?', (id,)).fetchone()
        if not existing:
            conn.close()
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        old_name = existing['nome_missione']
        old_code = existing['nome_breve']
        
        # Verifica duplicati (escludendo se stesso)
        if check_duplicate_operazione(conn, nome_missione, nome_breve, id):
            conn.close()
            flash('Esiste già un\'operazione con questo nome missione o nome breve.', 'warning')
            return redirect(url_for('operazioni.modifica_operazione_form', id=id))
        
        # Aggiornamento con tracking
        conn.execute(
            '''UPDATE operazioni 
               SET nome_missione=?, nome_breve=?, teatro_operativo=?, nazione=?, 
                   data_inizio=?, data_fine=?, descrizione=?, obiettivi=?, note=?,
                   modificato_da=?, data_modifica=datetime('now')
               WHERE id = ?''',
            (nome_missione, nome_breve, teatro, nazione, data_inizio, data_fine, 
             descrizione, obiettivi, note, user_id, id)
        )
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'UPDATE_OPERAZIONE',
            f'Aggiornata operazione da "{old_name} ({old_code})" a "{nome_missione} ({nome_breve})"',
            'operazione',
            id
        )
        
        flash(f'Operazione "{nome_missione}" aggiornata con successo.', 'success')
        return redirect(url_for('operazioni.visualizza_operazione', id=id))
        
    except Exception as e:
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
        log_user_action(
            user_id,
            'UPDATE_OPERAZIONE_ERROR',
            f'Errore aggiornamento operazione {id}: {str(e)}',
            'operazione',
            id,
            result='FAILED'
        )
        return redirect(url_for('operazioni.modifica_operazione_form', id=id))

@operazioni_bp.route('/elimina_operazione/<int:id>', methods=['POST'])
@admin_required
def elimina_operazione(id):
    """Elimina operazione - Solo ADMIN"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        
        # Recupera info prima di eliminare
        operazione = conn.execute('SELECT nome_missione, nome_breve FROM operazioni WHERE id = ?', (id,)).fetchone()
        if not operazione:
            conn.close()
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        nome_operazione = operazione['nome_missione']
        nome_breve = operazione['nome_breve']
        
        # Verifica dipendenze
        dependencies = check_operazione_dependencies(conn, id)
        if dependencies:
            conn.close()
            flash(f'Impossibile eliminare l\'operazione "{nome_operazione}": {", ".join(dependencies)} collegate.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))
        
        # Eliminazione
        conn.execute('DELETE FROM operazioni WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'DELETE_OPERAZIONE',
            f'Eliminata operazione: {nome_operazione} ({nome_breve})',
            'operazione',
            id
        )
        
        flash(f'Operazione "{nome_operazione}" eliminata con successo.', 'success')
        
    except Exception as e:
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
        log_user_action(
            user_id,
            'DELETE_OPERAZIONE_ERROR',
            f'Errore eliminazione operazione {id}: {str(e)}',
            'operazione',
            id,
            result='FAILED'
        )
    
    return redirect(url_for('operazioni.lista_operazioni'))

# ===========================================
# ROUTE AGGIUNTIVE E UTILITÀ
# ===========================================

@operazioni_bp.route('/operazioni/stato/<stato>')
@permission_required('VIEW_OPERAZIONI')
def operazioni_per_stato(stato):
    """Filtra operazioni per stato"""
    if stato not in ['attiva', 'conclusa', 'pianificata']:
        flash('Stato operazione non valido.', 'error')
        return redirect(url_for('operazioni.lista_operazioni'))
    
    return redirect(url_for('operazioni.lista_operazioni', stato=stato))

@operazioni_bp.route('/operazioni/ricerca')
@permission_required('VIEW_OPERAZIONI')
def ricerca_operazioni():
    """Ricerca operazioni"""
    search = request.args.get('q', '').strip()
    if not search:
        flash('Inserire un termine di ricerca.', 'warning')
        return redirect(url_for('operazioni.lista_operazioni'))
    
    return redirect(url_for('operazioni.lista_operazioni', search=search))

@operazioni_bp.route('/operazioni/export')
@permission_required('VIEW_OPERAZIONI')
def export_operazioni():
    """Esporta operazioni in formato CSV"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        
        # Query con filtri se presenti
        search = request.args.get('search', '').strip()
        stato = request.args.get('stato', '')
        teatro = request.args.get('teatro', '')
        
        base_query = '''SELECT nome_missione, nome_breve, teatro_operativo, nazione, 
                               data_inizio, data_fine, descrizione, obiettivi, note, data_creazione 
                        FROM operazioni'''
        params = []
        where_clauses = []
        
        if search:
            where_clauses.append('(nome_missione LIKE ? OR nome_breve LIKE ? OR teatro_operativo LIKE ?)')
            search_param = f'%{search.upper()}%'
            params.extend([search_param, search_param, search_param])
        
        if stato == 'attiva':
            where_clauses.append('(data_inizio <= date("now") AND (data_fine IS NULL OR data_fine >= date("now")))')
        elif stato == 'conclusa':
            where_clauses.append('data_fine < date("now")')
        elif stato == 'pianificata':
            where_clauses.append('data_inizio > date("now")')
        
        if teatro:
            where_clauses.append('teatro_operativo = ?')
            params.append(teatro.upper())
        
        if where_clauses:
            base_query += ' WHERE ' + ' AND '.join(where_clauses)
        
        base_query += ' ORDER BY data_inizio DESC, nome_missione'
        
        operazioni_export = conn.execute(base_query, params).fetchall()
        conn.close()
        
        # Genera CSV
        import csv
        from flask import Response
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Nome Missione', 'Nome Breve', 'Teatro Operativo', 'Nazione', 
            'Data Inizio', 'Data Fine', 'Descrizione', 'Obiettivi', 'Note', 'Data Creazione'
        ])
        
        # Dati
        for op in operazioni_export:
            writer.writerow([
                op['nome_missione'], op['nome_breve'], op['teatro_operativo'], op['nazione'],
                op['data_inizio'], op['data_fine'], op['descrizione'], 
                op['obiettivi'], op['note'], op['data_creazione']
            ])
        
        log_user_action(
            user_id,
            'EXPORT_OPERAZIONI',
            f'Esportate {len(operazioni_export)} operazioni in CSV',
            'operazioni'
        )
        
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=operazioni_export_{datetime.now().strftime("%Y%m%d_%H%M")}.csv'}
        )
        
    except Exception as e:
        flash(f'Errore nell\'export: {str(e)}', 'error')
        return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/operazioni/statistiche')
@operatore_or_admin_required
@permission_required('VIEW_OPERAZIONI')
def statistiche_operazioni():
    """Statistiche dettagliate operazioni"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        stats = get_operazioni_stats(conn)
        
        # Durata media operazioni
        durata_stats = conn.execute(
            '''SELECT 
                AVG(julianday(data_fine) - julianday(data_inizio)) as durata_media_giorni,
                MIN(julianday(data_fine) - julianday(data_inizio)) as durata_min_giorni,
                MAX(julianday(data_fine) - julianday(data_inizio)) as durata_max_giorni
               FROM operazioni 
               WHERE data_inizio IS NOT NULL AND data_fine IS NOT NULL'''
        ).fetchone()
        stats['durata'] = dict(durata_stats) if durata_stats else {}
        
        # Operazioni per anno
        per_anno = conn.execute(
            '''SELECT 
                strftime('%Y', data_inizio) as anno,
                COUNT(*) as numero_operazioni,
                COUNT(CASE WHEN data_fine IS NOT NULL THEN 1 END) as concluse
               FROM operazioni
               WHERE data_inizio IS NOT NULL
               GROUP BY strftime('%Y', data_inizio)
               ORDER BY anno DESC'''
        ).fetchall()
        stats['per_anno'] = per_anno
        
        # Top 5 teatri operativi
        top_teatri = conn.execute(
            '''SELECT teatro_operativo, COUNT(*) as num_operazioni
               FROM operazioni
               GROUP BY teatro_operativo
               ORDER BY num_operazioni DESC
               LIMIT 5'''
        ).fetchall()
        stats['top_teatri'] = top_teatri
        
        conn.close()
        
        log_user_action(
            user_id,
            'VIEW_OPERAZIONI_STATS',
            'Visualizzate statistiche operazioni'
        )
        
        return render_template('statistiche_operazioni.html', stats=stats)
        
    except Exception as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/api/operazioni/cerca')
@login_required
def api_cerca_operazioni():
    """API per ricerca operazioni (per autocomplete)"""
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])
    
    try:
        conn = get_db_connection()
        operazioni = conn.execute(
            '''SELECT id, nome_missione, nome_breve, teatro_operativo 
               FROM operazioni 
               WHERE nome_missione LIKE ? OR nome_breve LIKE ?
               ORDER BY nome_missione 
               LIMIT 15''',
            (f'%{query.upper()}%', f'%{query.upper()}%')
        ).fetchall()
        conn.close()
        
        return jsonify([{
            'id': op['id'],
            'nome_missione': op['nome_missione'],
            'nome_breve': op['nome_breve'],
            'teatro_operativo': op['teatro_operativo'],
            'label': f"{op['nome_missione']} ({op['nome_breve'] or 'N/A'})"
        } for op in operazioni])
        
    except Exception:
        return jsonify([])

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

# ===========================================
# GESTIONE ERRORI
# ===========================================

@operazioni_bp.errorhandler(sqlite3.OperationalError)
def handle_db_error(error):
    """Gestione errori database specifici per operazioni"""
    flash('Errore nel database delle operazioni. Contattare l\'amministratore.', 'error')
    return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.errorhandler(ValueError)
def handle_value_error(error):
    """Gestione errori di validazione"""
    flash('Dati non validi forniti.', 'error')
    return redirect(url_for('operazioni.lista_operazioni'))