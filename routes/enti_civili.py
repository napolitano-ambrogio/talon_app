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

enti_civili_bp = Blueprint('enti_civili', __name__, template_folder='../templates')

# ===========================================
# FUNZIONI HELPER
# ===========================================

def validate_ente_civile_data(form_data, ente_id=None):
    """Valida i dati di un ente civile"""
    errors = []
    required_fields = ['nome', 'indirizzo', 'citta']
    
    for field in required_fields:
        if not form_data.get(field, '').strip():
            errors.append(f'Il campo {field} è obbligatorio.')
    
    # Validazione email (se fornita)
    email = form_data.get('email', '').strip()
    if email and '@' not in email:
        errors.append('Formato email non valido.')
    
    # Validazione CAP (se fornito)
    cap = form_data.get('cap', '').strip()
    if cap and (not cap.isdigit() or len(cap) != 5):
        errors.append('Il CAP deve essere di 5 cifre.')
    
    return errors

def check_duplicate_ente_civile(conn, nome, citta, exclude_id=None):
    """Verifica se esiste già un ente civile con lo stesso nome nella stessa città"""
    if exclude_id:
        existing = conn.execute(
            'SELECT id FROM enti_civili WHERE nome = ? AND citta = ? AND id != ?',
            (nome, citta, exclude_id)
        ).fetchone()
    else:
        existing = conn.execute(
            'SELECT id FROM enti_civili WHERE nome = ? AND citta = ?',
            (nome, citta)
        ).fetchone()
    
    return existing is not None

def get_enti_civili_stats(conn):
    """Recupera statistiche sugli enti civili"""
    try:
        stats = {}
        
        # Totale enti
        total = conn.execute('SELECT COUNT(*) as count FROM enti_civili').fetchone()
        stats['totale'] = total['count'] if total else 0
        
        # Enti per provincia
        per_provincia = conn.execute(
            '''SELECT provincia, COUNT(*) as count 
               FROM enti_civili 
               WHERE provincia IS NOT NULL AND provincia != "" 
               GROUP BY provincia 
               ORDER BY count DESC 
               LIMIT 10'''
        ).fetchall()
        stats['per_provincia'] = per_provincia
        
        # Enti creati negli ultimi 30 giorni
        recenti = conn.execute(
            '''SELECT COUNT(*) as count 
               FROM enti_civili 
               WHERE data_creazione >= date('now', '-30 days')'''
        ).fetchone()
        stats['recenti'] = recenti['count'] if recenti else 0
        
        # Enti con email
        con_email = conn.execute(
            '''SELECT COUNT(*) as count 
               FROM enti_civili 
               WHERE email IS NOT NULL AND email != ""'''
        ).fetchone()
        stats['con_email'] = con_email['count'] if con_email else 0
        
        return stats
    except sqlite3.OperationalError:
        return {}

def check_ente_dependencies(conn, ente_id):
    """Verifica le dipendenze di un ente civile"""
    dependencies = []
    
    # Verifica attività
    try:
        attivita = conn.execute(
            '''SELECT COUNT(*) as count 
               FROM attivita 
               WHERE partenza_civile_id = ? OR destinazione_civile_id = ?''',
            (ente_id, ente_id)
        ).fetchone()
        
        if attivita and attivita['count'] > 0:
            dependencies.append(f"{attivita['count']} attività collegate")
    except sqlite3.OperationalError:
        pass
    
    # Verifica altre tabelle (se esistono)
    try:
        contratti = conn.execute(
            'SELECT COUNT(*) as count FROM contratti WHERE ente_civile_id = ?',
            (ente_id,)
        ).fetchone()
        
        if contratti and contratti['count'] > 0:
            dependencies.append(f"{contratti['count']} contratti")
    except sqlite3.OperationalError:
        pass
    
    return dependencies

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@enti_civili_bp.route('/enti_civili')
@permission_required('VIEW_ENTI_CIVILI')
def enti_civili():
    """Lista tutti gli enti civili con filtri avanzati"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    # Parametri di filtro
    search = request.args.get('search', '').strip()
    provincia_filter = request.args.get('provincia')
    citta_filter = request.args.get('citta')
    page = request.args.get('page', 1, type=int)
    per_page = 50  # Paginazione
    
    try:
        conn = get_db_connection()
        
        # Query base
        base_query = 'SELECT * FROM enti_civili'
        count_query = 'SELECT COUNT(*) as total FROM enti_civili'
        where_clauses = []
        params = []
        
        # Applica filtri
        if search:
            where_clauses.append('(nome LIKE ? OR indirizzo LIKE ? OR citta LIKE ?)')
            search_param = f'%{search.upper()}%'
            params.extend([search_param, search_param, search_param])
        
        if provincia_filter:
            where_clauses.append('provincia = ?')
            params.append(provincia_filter.upper())
        
        if citta_filter:
            where_clauses.append('citta = ?')
            params.append(citta_filter.upper())
        
        # Costruisci query finale
        if where_clauses:
            where_clause = ' WHERE ' + ' AND '.join(where_clauses)
            base_query += where_clause
            count_query += where_clause
        
        # Conta totali
        total_enti = conn.execute(count_query, params).fetchone()['total']
        
        # Query con paginazione
        base_query += ' ORDER BY nome LIMIT ? OFFSET ?'
        params.extend([per_page, (page - 1) * per_page])
        
        enti_civili_list = conn.execute(base_query, params).fetchall()
        
        # Opzioni per filtri
        province = conn.execute(
            '''SELECT DISTINCT provincia 
               FROM enti_civili 
               WHERE provincia IS NOT NULL AND provincia != "" 
               ORDER BY provincia'''
        ).fetchall()
        
        citta = conn.execute(
            '''SELECT DISTINCT citta 
               FROM enti_civili 
               ORDER BY citta'''
        ).fetchall()
        
        # Statistiche (solo per admin/operatore)
        stats = {}
        if is_operatore_or_above():
            stats = get_enti_civili_stats(conn)
        
        conn.close()
        
        # Calcola paginazione
        total_pages = (total_enti + per_page - 1) // per_page
        
        log_user_action(
            user_id,
            'VIEW_ENTI_CIVILI_LIST',
            f'Visualizzati {len(enti_civili_list)} enti civili (pagina {page}/{total_pages}) - Filtri: search={search}, provincia={provincia_filter}',
            'enti_civili'
        )
        
        return render_template('enti_civili.html', 
                             enti_civili=enti_civili_list,
                             province=province,
                             citta_options=citta,
                             stats=stats,
                             filtri={
                                 'search': search,
                                 'provincia_filter': provincia_filter,
                                 'citta_filter': citta_filter
                             },
                             paginazione={
                                 'page': page,
                                 'per_page': per_page,
                                 'total': total_enti,
                                 'total_pages': total_pages
                             },
                             user_role=user_role)
        
    except Exception as e:
        flash(f'Errore nel caricamento degli enti civili: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@enti_civili_bp.route('/inserisci_civile')
@operatore_or_admin_required
@permission_required('CREATE_ENTI_CIVILI')
def inserisci_civile_form():
    """Form per inserire nuovo ente civile"""
    user_id = request.current_user['user_id']
    
    log_user_action(
        user_id,
        'ACCESS_CREATE_ENTE_CIVILE_FORM',
        'Accesso form creazione ente civile'
    )
    
    return render_template('inserimento_civile.html')

@enti_civili_bp.route('/salva_civile', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_ENTI_CIVILI')
def salva_civile():
    """Salva nuovo ente civile con validazione completa"""
    user_id = request.current_user['user_id']
    
    # Validazione input
    validation_errors = validate_ente_civile_data(request.form)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('enti_civili.inserisci_civile_form'))
    
    try:
        nome = request.form['nome'].upper().strip()
        indirizzo = request.form['indirizzo'].upper().strip()
        civico = request.form.get('civico', '').upper().strip()
        cap = request.form.get('cap', '').strip()
        citta = request.form['citta'].upper().strip()
        provincia = request.form.get('provincia', '').upper().strip()
        nazione = request.form.get('nazione', 'ITALIA').upper().strip()
        telefono = request.form.get('telefono', '').strip()
        email = request.form.get('email', '').strip().lower()
        note = request.form.get('note', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica duplicati
        if check_duplicate_ente_civile(conn, nome, citta):
            conn.close()
            flash('Esiste già un ente civile con questo nome nella stessa città.', 'warning')
            return redirect(url_for('enti_civili.inserisci_civile_form'))
        
        # Inserimento con tracking utente
        cursor = conn.execute(
            '''INSERT INTO enti_civili 
               (nome, indirizzo, civico, cap, citta, provincia, nazione, telefono, email, note,
                creato_da, data_creazione) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))''',
            (nome, indirizzo, civico, cap, citta, provincia, nazione, telefono, email, note, user_id)
        )
        
        new_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'CREATE_ENTE_CIVILE',
            f'Creato ente civile: {nome} ({citta})',
            'ente_civile',
            new_id
        )
        
        flash(f'Ente civile "{nome}" creato con successo.', 'success')
        return redirect(url_for('enti_civili.visualizza_civile', id=new_id))
        
    except Exception as e:
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        log_user_action(
            user_id,
            'CREATE_ENTE_CIVILE_ERROR',
            f'Errore creazione ente civile: {str(e)}',
            'ente_civile',
            result='FAILED'
        )
        return redirect(url_for('enti_civili.inserisci_civile_form'))

@enti_civili_bp.route('/ente_civile/<int:id>')
@permission_required('VIEW_ENTI_CIVILI')
def visualizza_civile(id):
    """Visualizza dettagli ente civile con informazioni aggiuntive"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    try:
        conn = get_db_connection()
        
        # Query principale con info utente creatore
        ente = conn.execute(
            '''SELECT ec.*, 
                      u_creato.username as creato_da_username, u_creato.nome as creato_da_nome,
                      u_modificato.username as modificato_da_username, u_modificato.nome as modificato_da_nome
               FROM enti_civili ec
               LEFT JOIN utenti u_creato ON ec.creato_da = u_creato.id
               LEFT JOIN utenti u_modificato ON ec.modificato_da = u_modificato.id
               WHERE ec.id = ?''', 
            (id,)
        ).fetchone()
        
        if ente is None:
            conn.close()
            flash('Ente civile non trovato.', 'error')
            return redirect(url_for('enti_civili.enti_civili'))
        
        # Statistiche correlate (solo per operatore+)
        related_stats = {}
        if is_operatore_or_above():
            try:
                # Attività correlate
                attivita_count = conn.execute(
                    '''SELECT COUNT(*) as count 
                       FROM attivita 
                       WHERE partenza_civile_id = ? OR destinazione_civile_id = ?''',
                    (id, id)
                ).fetchone()
                related_stats['attivita'] = attivita_count['count'] if attivita_count else 0
                
                # Ultime attività
                ultime_attivita = conn.execute(
                    '''SELECT a.id, a.descrizione, a.data_inizio, em.nome as ente_nome
                       FROM attivita a
                       JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                       WHERE a.partenza_civile_id = ? OR a.destinazione_civile_id = ?
                       ORDER BY a.data_inizio DESC
                       LIMIT 5''',
                    (id, id)
                ).fetchall()
                related_stats['ultime_attivita'] = ultime_attivita
                
            except sqlite3.OperationalError:
                related_stats['attivita'] = 0
                related_stats['ultime_attivita'] = []
        
        conn.close()
        
        log_user_action(
            user_id,
            'VIEW_ENTE_CIVILE',
            f'Visualizzato ente civile: {ente["nome"]} ({ente["citta"]})',
            'ente_civile',
            id
        )
        
        return render_template('descrizione_civile.html', 
                             ente=ente,
                             related_stats=related_stats,
                             user_role=user_role)
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'ente: {str(e)}', 'error')
        return redirect(url_for('enti_civili.enti_civili'))

@enti_civili_bp.route('/modifica_civile/<int:id>')
@operatore_or_admin_required
@permission_required('EDIT_ENTI_CIVILI')
def modifica_civile_form(id):
    """Form per modificare ente civile"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        ente = conn.execute('SELECT * FROM enti_civili WHERE id = ?', (id,)).fetchone()
        conn.close()
        
        if ente is None:
            flash('Ente civile non trovato.', 'error')
            return redirect(url_for('enti_civili.enti_civili'))
        
        log_user_action(
            user_id,
            'ACCESS_EDIT_ENTE_CIVILE_FORM',
            f'Accesso form modifica ente civile: {ente["nome"]}',
            'ente_civile',
            id
        )
        
        return render_template('modifica_civile.html', ente=ente)
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'ente: {str(e)}', 'error')
        return redirect(url_for('enti_civili.enti_civili'))

@enti_civili_bp.route('/aggiorna_civile/<int:id>', methods=['POST'])
@operatore_or_admin_required
@permission_required('EDIT_ENTI_CIVILI')
def aggiorna_civile(id):
    """Aggiorna ente civile esistente con validazione completa"""
    user_id = request.current_user['user_id']
    
    # Validazione input
    validation_errors = validate_ente_civile_data(request.form, id)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('enti_civili.modifica_civile_form', id=id))
    
    try:
        nome = request.form['nome'].upper().strip()
        indirizzo = request.form['indirizzo'].upper().strip()
        civico = request.form.get('civico', '').upper().strip()
        cap = request.form.get('cap', '').strip()
        citta = request.form['citta'].upper().strip()
        provincia = request.form.get('provincia', '').upper().strip()
        nazione = request.form.get('nazione', 'ITALIA').upper().strip()
        telefono = request.form.get('telefono', '').strip()
        email = request.form.get('email', '').strip().lower()
        note = request.form.get('note', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica che l'ente esista
        existing = conn.execute('SELECT nome, citta FROM enti_civili WHERE id = ?', (id,)).fetchone()
        if not existing:
            conn.close()
            flash('Ente civile non trovato.', 'error')
            return redirect(url_for('enti_civili.enti_civili'))
        
        old_name = existing['nome']
        old_city = existing['citta']
        
        # Verifica duplicati (escludendo se stesso)
        if check_duplicate_ente_civile(conn, nome, citta, id):
            conn.close()
            flash('Esiste già un ente civile con questo nome nella stessa città.', 'warning')
            return redirect(url_for('enti_civili.modifica_civile_form', id=id))
        
        # Aggiornamento con tracking
        conn.execute(
            '''UPDATE enti_civili 
               SET nome=?, indirizzo=?, civico=?, cap=?, citta=?, provincia=?, 
                   nazione=?, telefono=?, email=?, note=?,
                   modificato_da=?, data_modifica=datetime('now')
               WHERE id = ?''',
            (nome, indirizzo, civico, cap, citta, provincia, nazione, telefono, email, note, user_id, id)
        )
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'UPDATE_ENTE_CIVILE',
            f'Aggiornato ente civile da "{old_name} ({old_city})" a "{nome} ({citta})"',
            'ente_civile',
            id
        )
        
        flash(f'Ente civile "{nome}" aggiornato con successo.', 'success')
        return redirect(url_for('enti_civili.visualizza_civile', id=id))
        
    except Exception as e:
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
        log_user_action(
            user_id,
            'UPDATE_ENTE_CIVILE_ERROR',
            f'Errore aggiornamento ente civile {id}: {str(e)}',
            'ente_civile',
            id,
            result='FAILED'
        )
        return redirect(url_for('enti_civili.modifica_civile_form', id=id))

@enti_civili_bp.route('/elimina_civile/<int:id>', methods=['POST'])
@admin_required
def elimina_civile(id):
    """Elimina ente civile - Solo ADMIN"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        
        # Recupera info prima di eliminare
        ente = conn.execute('SELECT nome, citta FROM enti_civili WHERE id = ?', (id,)).fetchone()
        if not ente:
            conn.close()
            flash('Ente civile non trovato.', 'error')
            return redirect(url_for('enti_civili.enti_civili'))
        
        nome_ente = ente['nome']
        citta_ente = ente['citta']
        
        # Verifica dipendenze
        dependencies = check_ente_dependencies(conn, id)
        if dependencies:
            conn.close()
            flash(f'Impossibile eliminare l\'ente "{nome_ente}": {", ".join(dependencies)}.', 'error')
            return redirect(url_for('enti_civili.enti_civili'))
        
        # Eliminazione
        conn.execute('DELETE FROM enti_civili WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'DELETE_ENTE_CIVILE',
            f'Eliminato ente civile: {nome_ente} ({citta_ente})',
            'ente_civile',
            id
        )
        
        flash(f'Ente civile "{nome_ente}" eliminato con successo.', 'success')
        
    except Exception as e:
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
        log_user_action(
            user_id,
            'DELETE_ENTE_CIVILE_ERROR',
            f'Errore eliminazione ente civile {id}: {str(e)}',
            'ente_civile',
            id,
            result='FAILED'
        )
    
    return redirect(url_for('enti_civili.enti_civili'))

# ===========================================
# ROUTE AGGIUNTIVE E UTILITÀ
# ===========================================

@enti_civili_bp.route('/enti_civili/export')
@permission_required('VIEW_ENTI_CIVILI')
def export_enti_civili():
    """Esporta enti civili in formato CSV"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        
        # Query con filtri se presenti
        search = request.args.get('search', '').strip()
        provincia_filter = request.args.get('provincia')
        
        base_query = '''SELECT nome, indirizzo, civico, cap, citta, provincia, nazione, 
                               telefono, email, note, data_creazione 
                        FROM enti_civili'''
        params = []
        where_clauses = []
        
        if search:
            where_clauses.append('(nome LIKE ? OR indirizzo LIKE ? OR citta LIKE ?)')
            search_param = f'%{search.upper()}%'
            params.extend([search_param, search_param, search_param])
        
        if provincia_filter:
            where_clauses.append('provincia = ?')
            params.append(provincia_filter.upper())
        
        if where_clauses:
            base_query += ' WHERE ' + ' AND '.join(where_clauses)
        
        base_query += ' ORDER BY nome'
        
        enti_export = conn.execute(base_query, params).fetchall()
        conn.close()
        
        # Genera CSV
        import csv
        from flask import Response
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Nome', 'Indirizzo', 'Civico', 'CAP', 'Città', 'Provincia', 
            'Nazione', 'Telefono', 'Email', 'Note', 'Data Creazione'
        ])
        
        # Dati
        for ente in enti_export:
            writer.writerow([
                ente['nome'], ente['indirizzo'], ente['civico'], ente['cap'],
                ente['citta'], ente['provincia'], ente['nazione'], ente['telefono'],
                ente['email'], ente['note'], ente['data_creazione']
            ])
        
        log_user_action(
            user_id,
            'EXPORT_ENTI_CIVILI',
            f'Esportati {len(enti_export)} enti civili in CSV',
            'enti_civili'
        )
        
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=enti_civili_export_{datetime.now().strftime("%Y%m%d_%H%M")}.csv'}
        )
        
    except Exception as e:
        flash(f'Errore nell\'export: {str(e)}', 'error')
        return redirect(url_for('enti_civili.enti_civili'))

@enti_civili_bp.route('/enti_civili/statistiche')
@operatore_or_admin_required
@permission_required('VIEW_ENTI_CIVILI')
def statistiche_enti_civili():
    """Statistiche dettagliate enti civili"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        stats = get_enti_civili_stats(conn)
        
        # Distribuzione per regione (se campo disponibile)
        per_regione = conn.execute(
            '''SELECT 
                CASE 
                    WHEN provincia IN ('MI', 'BG', 'BS', 'CO', 'CR', 'LC', 'LO', 'MN', 'PV', 'SO', 'VA') THEN 'LOMBARDIA'
                    WHEN provincia IN ('RM', 'FR', 'LT', 'RI', 'VT') THEN 'LAZIO'
                    WHEN provincia IN ('NA', 'AV', 'BN', 'CE', 'SA') THEN 'CAMPANIA'
                    WHEN provincia IN ('BA', 'BT', 'BR', 'FG', 'LE', 'TA') THEN 'PUGLIA'
                    WHEN provincia IN ('PA', 'AG', 'CL', 'CT', 'EN', 'ME', 'RG', 'SR', 'TP') THEN 'SICILIA'
                    ELSE 'ALTRE'
                END as regione,
                COUNT(*) as count
               FROM enti_civili 
               WHERE provincia IS NOT NULL AND provincia != ""
               GROUP BY regione
               ORDER BY count DESC'''
        ).fetchall()
        stats['per_regione'] = per_regione
        
        # Crescita negli ultimi 12 mesi
        crescita_mensile = conn.execute(
            '''SELECT 
                strftime('%Y-%m', data_creazione) as mese,
                COUNT(*) as nuovi_enti
               FROM enti_civili
               WHERE data_creazione >= date('now', '-12 months')
               GROUP BY strftime('%Y-%m', data_creazione)
               ORDER BY mese DESC'''
        ).fetchall()
        stats['crescita_mensile'] = crescita_mensile
        
        conn.close()
        
        log_user_action(
            user_id,
            'VIEW_ENTI_CIVILI_STATS',
            'Visualizzate statistiche enti civili'
        )
        
        return render_template('statistiche_enti_civili.html', stats=stats)
        
    except Exception as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        return redirect(url_for('enti_civili.enti_civili'))

@enti_civili_bp.route('/api/enti_civili/cerca')
@login_required
def api_cerca_enti_civili():
    """API per ricerca enti civili (per autocomplete)"""
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])
    
    try:
        conn = get_db_connection()
        enti = conn.execute(
            '''SELECT id, nome, citta 
               FROM enti_civili 
               WHERE nome LIKE ? OR citta LIKE ?
               ORDER BY nome 
               LIMIT 20''',
            (f'%{query.upper()}%', f'%{query.upper()}%')
        ).fetchall()
        conn.close()
        
        return jsonify([{
            'id': ente['id'],
            'nome': ente['nome'],
            'citta': ente['citta'],
            'label': f"{ente['nome']} ({ente['citta']})"
        } for ente in enti])
        
    except Exception:
        return jsonify([])

# ===========================================
# GESTIONE ERRORI
# ===========================================

@enti_civili_bp.errorhandler(sqlite3.OperationalError)
def handle_db_error(error):
    """Gestione errori database specifici per enti civili"""
    flash('Errore nel database degli enti civili. Contattare l\'amministratore.', 'error')
    return redirect(url_for('enti_civili.enti_civili'))

@enti_civili_bp.errorhandler(ValueError)
def handle_value_error(error):
    """Gestione errori di validazione"""
    flash('Dati non validi forniti.', 'error')
    return redirect(url_for('enti_civili.enti_civili'))