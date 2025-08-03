from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from services.database import get_db_connection, get_all_descendants, build_tree
from auth import (
    login_required, permission_required, entity_access_required,
    admin_required, operatore_or_admin_required,
    log_user_action, get_accessible_entities, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
import sqlite3
from datetime import datetime

enti_militari_bp = Blueprint('enti_militari', __name__, template_folder='../templates')

ROOT_ENTE_ID = 1

# ===========================================
# FUNZIONI HELPER
# ===========================================

def validate_ente_militare_data(form_data, ente_id=None):
    """Valida i dati di un ente militare"""
    errors = []
    required_fields = ['nome', 'codice']
    
    for field in required_fields:
        if not form_data.get(field, '').strip():
            errors.append(f'Il campo {field} è obbligatorio.')
    
    # Validazione codice (formato specifico se necessario)
    codice = form_data.get('codice', '').strip()
    if codice and len(codice) < 2:
        errors.append('Il codice deve essere di almeno 2 caratteri.')
    
    # Validazione email (se fornita)
    email = form_data.get('email', '').strip()
    if email and '@' not in email:
        errors.append('Formato email non valido.')
    
    return errors

def check_duplicate_ente_militare(conn, nome, codice, exclude_id=None):
    """Verifica se esiste già un ente militare con lo stesso nome o codice"""
    if exclude_id:
        existing = conn.execute(
            'SELECT id FROM enti_militari WHERE (nome = ? OR codice = ?) AND id != ?',
            (nome, codice, exclude_id)
        ).fetchone()
    else:
        existing = conn.execute(
            'SELECT id FROM enti_militari WHERE nome = ? OR codice = ?',
            (nome, codice)
        ).fetchone()
    
    return existing is not None

def get_enti_militari_stats(conn, accessible_entities):
    """Recupera statistiche sugli enti militari"""
    try:
        stats = {}
        
        if not accessible_entities:
            return stats
        
        placeholders = ','.join(['?' for _ in accessible_entities])
        
        # Totale enti accessibili
        total = conn.execute(
            f'SELECT COUNT(*) as count FROM enti_militari WHERE id IN ({placeholders})',
            accessible_entities
        ).fetchone()
        stats['totale'] = total['count'] if total else 0
        
        # Distribuzione per livello gerarchico
        livelli = conn.execute(f"""
            WITH RECURSIVE hierarchy AS (
                SELECT id, nome, parent_id, 0 as level
                FROM enti_militari 
                WHERE parent_id IS NULL AND id IN ({placeholders})
                
                UNION ALL
                
                SELECT e.id, e.nome, e.parent_id, h.level + 1
                FROM enti_militari e
                JOIN hierarchy h ON e.parent_id = h.id
                WHERE e.id IN ({placeholders})
            )
            SELECT level, COUNT(*) as count
            FROM hierarchy
            GROUP BY level
            ORDER BY level
        """, accessible_entities + accessible_entities).fetchall()
        stats['per_livello'] = livelli
        
        # Enti creati negli ultimi 30 giorni
        recenti = conn.execute(f"""
            SELECT COUNT(*) as count 
            FROM enti_militari 
            WHERE data_creazione >= date('now', '-30 days')
            AND id IN ({placeholders})
        """, accessible_entities).fetchone()
        stats['recenti'] = recenti['count'] if recenti else 0
        
        # Enti senza parent (radici)
        radici = conn.execute(f"""
            SELECT COUNT(*) as count 
            FROM enti_militari 
            WHERE parent_id IS NULL
            AND id IN ({placeholders})
        """, accessible_entities).fetchone()
        stats['radici'] = radici['count'] if radici else 0
        
        return stats
    except sqlite3.OperationalError:
        return {}

def check_ente_militare_dependencies(conn, ente_id):
    """Verifica le dipendenze di un ente militare"""
    dependencies = []
    
    # Verifica enti figli
    children = conn.execute(
        'SELECT COUNT(*) as count FROM enti_militari WHERE parent_id = ?',
        (ente_id,)
    ).fetchone()
    if children and children['count'] > 0:
        dependencies.append(f"{children['count']} enti dipendenti")
    
    # Verifica utenti collegati
    try:
        users = conn.execute(
            'SELECT COUNT(*) as count FROM utenti WHERE ente_militare_id = ?',
            (ente_id,)
        ).fetchone()
        if users and users['count'] > 0:
            dependencies.append(f"{users['count']} utenti collegati")
    except sqlite3.OperationalError:
        pass
    
    # Verifica attività
    try:
        attivita = conn.execute(
            'SELECT COUNT(*) as count FROM attivita WHERE ente_svolgimento_id = ?',
            (ente_id,)
        ).fetchone()
        if attivita and attivita['count'] > 0:
            dependencies.append(f"{attivita['count']} attività collegate")
    except sqlite3.OperationalError:
        pass
    
    return dependencies

def get_available_parents(conn, accessible_entities, exclude_id=None):
    """Recupera enti disponibili come parent"""
    if not accessible_entities:
        return []
    
    placeholders = ','.join(['?' for _ in accessible_entities])
    params = accessible_entities.copy()
    
    base_query = f'SELECT id, nome, codice FROM enti_militari WHERE id IN ({placeholders})'
    
    if exclude_id:
        # Esclude l'ente stesso e i suoi discendenti per evitare cicli
        descendants = get_all_descendants(conn, exclude_id)
        descendant_ids = [d['id'] for d in descendants] + [exclude_id]
        
        exclude_placeholders = ','.join(['?' for _ in descendant_ids])
        base_query += f' AND id NOT IN ({exclude_placeholders})'
        params.extend(descendant_ids)
    
    base_query += ' ORDER BY nome'
    
    return conn.execute(base_query, params).fetchall()

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@enti_militari_bp.route('/organigramma')
@permission_required('VIEW_ENTI_MILITARI')
def organigramma():
    """Visualizza organigramma enti militari con controllo cono d'ombra"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    try:
        view_all = request.args.get('view') == 'all'
        search = request.args.get('search', '').strip()
        
        conn = get_db_connection()
        user_accessible_entities = get_accessible_entities()
        
        if not user_accessible_entities:
            conn.close()
            flash('Non hai accesso a nessun ente militare.', 'warning')
            return render_template('organigramma.html', tree=[], view_all=False, user_role=user_role)
        
        placeholders = ','.join(['?' for _ in user_accessible_entities])
        
        if view_all:
            # Vista completa - solo enti accessibili
            query = f'SELECT * FROM enti_militari WHERE id IN ({placeholders})'
            params = user_accessible_entities.copy()
            
            if search:
                query += ' AND (nome LIKE ? OR codice LIKE ?)'
                search_param = f'%{search.upper()}%'
                params.extend([search_param, search_param])
            
            query += ' ORDER BY nome'
            enti_list = conn.execute(query, params).fetchall()
        else:
            # Vista albero - discendenti dell'ente root accessibili
            all_descendants = get_all_descendants(conn, ROOT_ENTE_ID)
            enti_list = [ente for ente in all_descendants 
                        if ente['id'] in user_accessible_entities]
            
            if search:
                search_upper = search.upper()
                enti_list = [ente for ente in enti_list 
                           if search_upper in ente['nome'].upper() or 
                              search_upper in ente.get('codice', '').upper()]
        
        # Statistiche (solo per operatore+)
        stats = {}
        if is_operatore_or_above():
            stats = get_enti_militari_stats(conn, user_accessible_entities)
        
        conn.close()
        
        tree_structure = build_tree(enti_list)
        
        log_user_action(
            user_id,
            'VIEW_ORGANIGRAMMA',
            f'Visualizzato organigramma - View all: {view_all}, Enti: {len(enti_list)}, Search: {search}',
            'organigramma'
        )
        
        return render_template('organigramma.html', 
                             tree=tree_structure, 
                             view_all=view_all,
                             search=search,
                             stats=stats,
                             user_role=user_role)
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'organigramma: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@enti_militari_bp.route('/inserisci_militare')
@operatore_or_admin_required
@permission_required('CREATE_ENTI_MILITARI')
def inserisci_militare_form():
    """Form per inserire nuovo ente militare"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        user_accessible_entities = get_accessible_entities()
        
        if not user_accessible_entities:
            conn.close()
            flash('Non hai accesso a nessun ente per creare enti militari.', 'warning')
            return redirect(url_for('enti_militari.organigramma'))
        
        # Enti disponibili come parent
        enti_parent = get_available_parents(conn, user_accessible_entities)
        conn.close()
        
        log_user_action(
            user_id,
            'ACCESS_CREATE_ENTE_MILITARE_FORM',
            f'Accesso form creazione con {len(enti_parent)} enti parent disponibili'
        )
        
        return render_template('inserimento_ente.html', enti=enti_parent)
        
    except Exception as e:
        flash(f'Errore nel caricamento del form: {str(e)}', 'error')
        return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.route('/salva_militare', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_ENTI_MILITARI')
def salva_militare():
    """Salva nuovo ente militare con controlli completi"""
    user_id = request.current_user['user_id']
    
    # Validazione input
    validation_errors = validate_ente_militare_data(request.form)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('enti_militari.inserisci_militare_form'))
    
    try:
        nome = request.form['nome'].upper().strip()
        codice = request.form['codice'].upper().strip()
        parent_id = request.form.get('parent_id') or None
        indirizzo = request.form.get('indirizzo', '').upper().strip()
        civico = request.form.get('civico', '').upper().strip()
        cap = request.form.get('cap', '').strip()
        citta = request.form.get('citta', '').upper().strip()
        provincia = request.form.get('provincia', '').upper().strip()
        telefono = request.form.get('telefono', '').strip()
        email = request.form.get('email', '').strip().lower()
        note = request.form.get('note', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica accesso al parent se specificato
        if parent_id:
            parent_id = int(parent_id)
            user_accessible_entities = get_accessible_entities()
            if parent_id not in user_accessible_entities:
                conn.close()
                flash('Non hai accesso all\'ente parent specificato.', 'error')
                return redirect(url_for('enti_militari.inserisci_militare_form'))
        
        # Verifica duplicati
        if check_duplicate_ente_militare(conn, nome, codice):
            conn.close()
            flash('Esiste già un ente militare con questo nome o codice.', 'warning')
            return redirect(url_for('enti_militari.inserisci_militare_form'))
        
        # Inserimento con tracking
        cursor = conn.execute(
            '''INSERT INTO enti_militari 
               (nome, codice, parent_id, indirizzo, civico, cap, citta, provincia, 
                telefono, email, note, creato_da, data_creazione) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))''',
            (nome, codice, parent_id, indirizzo, civico, cap, citta, provincia, 
             telefono, email, note, user_id)
        )
        
        new_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'CREATE_ENTE_MILITARE',
            f'Creato ente militare: {nome} ({codice})',
            'ente_militare',
            new_id
        )
        
        flash(f'Ente militare "{nome}" creato con successo.', 'success')
        return redirect(url_for('enti_militari.visualizza_ente', id=new_id))
        
    except Exception as e:
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        log_user_action(
            user_id,
            'CREATE_ENTE_MILITARE_ERROR',
            f'Errore creazione ente militare: {str(e)}',
            'ente_militare',
            result='FAILED'
        )
        return redirect(url_for('enti_militari.inserisci_militare_form'))

@enti_militari_bp.route('/ente_militare/<int:id>')
@entity_access_required('id')
def visualizza_ente(id):
    """Visualizza dettagli ente militare con informazioni complete"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    try:
        conn = get_db_connection()
        
        # Query principale con info utenti e relazioni
        ente = conn.execute(
            '''SELECT em.*, 
                      u_creato.username as creato_da_username, u_creato.nome as creato_da_nome,
                      u_modificato.username as modificato_da_username, u_modificato.nome as modificato_da_nome
               FROM enti_militari em
               LEFT JOIN utenti u_creato ON em.creato_da = u_creato.id
               LEFT JOIN utenti u_modificato ON em.modificato_da = u_modificato.id
               WHERE em.id = ?''', 
            (id,)
        ).fetchone()
        
        if not ente:
            conn.close()
            flash('Ente militare non trovato.', 'error')
            return redirect(url_for('enti_militari.organigramma'))
        
        # Parent name
        parent_name = None
        if ente['parent_id']:
            parent = conn.execute(
                'SELECT nome FROM enti_militari WHERE id = ?', 
                (ente['parent_id'],)
            ).fetchone()
            if parent:
                parent_name = parent['nome']
        
        # Enti figli
        children = conn.execute(
            '''SELECT id, nome, codice 
               FROM enti_militari 
               WHERE parent_id = ? 
               ORDER BY nome''',
            (id,)
        ).fetchall()
        
        # Statistiche correlate (solo per operatore+)
        related_stats = {}
        if is_operatore_or_above():
            try:
                # Utenti appartenenti
                utenti_count = conn.execute(
                    'SELECT COUNT(*) as count FROM utenti WHERE ente_militare_id = ?',
                    (id,)
                ).fetchone()
                related_stats['utenti'] = utenti_count['count'] if utenti_count else 0
                
                # Attività dell'ente
                attivita_count = conn.execute(
                    'SELECT COUNT(*) as count FROM attivita WHERE ente_svolgimento_id = ?',
                    (id,)
                ).fetchone()
                related_stats['attivita'] = attivita_count['count'] if attivita_count else 0
                
                # Totale discendenti
                descendants = get_all_descendants(conn, id)
                related_stats['discendenti'] = len(descendants) - 1  # Esclude se stesso
                
                # Ultime attività
                ultime_attivita = conn.execute(
                    '''SELECT a.id, a.descrizione, a.data_inizio, ta.nome as tipologia
                       FROM attivita a
                       JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                       WHERE a.ente_svolgimento_id = ?
                       ORDER BY a.data_inizio DESC
                       LIMIT 5''',
                    (id,)
                ).fetchall()
                related_stats['ultime_attivita'] = ultime_attivita
                
            except sqlite3.OperationalError:
                related_stats = {'utenti': 0, 'attivita': 0, 'discendenti': 0, 'ultime_attivita': []}
        
        conn.close()
        
        log_user_action(
            user_id,
            'VIEW_ENTE_MILITARE',
            f'Visualizzato ente militare: {ente["nome"]} ({ente["codice"]})',
            'ente_militare',
            id
        )
        
        return render_template('descrizione_ente.html', 
                             ente=ente, 
                             parent_name=parent_name,
                             children=children,
                             related_stats=related_stats,
                             user_role=user_role)
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'ente: {str(e)}', 'error')
        return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.route('/modifica_militare/<int:id>')
@entity_access_required('id')
@operatore_or_admin_required
@permission_required('EDIT_ENTI_MILITARI')
def modifica_militare_form(id):
    """Form per modificare ente militare"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        ente = conn.execute('SELECT * FROM enti_militari WHERE id = ?', (id,)).fetchone()
        
        if not ente:
            conn.close()
            flash('Ente militare non trovato.', 'error')
            return redirect(url_for('enti_militari.organigramma'))
        
        # Enti disponibili come parent (escludendo se stesso e i discendenti)
        user_accessible_entities = get_accessible_entities()
        available_parents = get_available_parents(conn, user_accessible_entities, id)
        
        conn.close()
        
        log_user_action(
            user_id,
            'ACCESS_EDIT_ENTE_MILITARE_FORM',
            f'Accesso form modifica ente militare: {ente["nome"]}',
            'ente_militare',
            id
        )
        
        return render_template('modifica_ente.html', 
                             ente=ente, 
                             tutti_gli_enti=available_parents)
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'ente: {str(e)}', 'error')
        return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.route('/aggiorna_militare/<int:id>', methods=['POST'])
@entity_access_required('id')
@operatore_or_admin_required
@permission_required('EDIT_ENTI_MILITARI')
def aggiorna_militare(id):
    """Aggiorna ente militare esistente con controlli completi"""
    user_id = request.current_user['user_id']
    
    # Validazione input
    validation_errors = validate_ente_militare_data(request.form, id)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('enti_militari.modifica_militare_form', id=id))
    
    try:
        nome = request.form['nome'].upper().strip()
        codice = request.form['codice'].upper().strip()
        parent_id = request.form.get('parent_id') or None
        indirizzo = request.form.get('indirizzo', '').upper().strip()
        civico = request.form.get('civico', '').upper().strip()
        cap = request.form.get('cap', '').strip()
        citta = request.form.get('citta', '').upper().strip()
        provincia = request.form.get('provincia', '').upper().strip()
        telefono = request.form.get('telefono', '').strip()
        email = request.form.get('email', '').strip().lower()
        note = request.form.get('note', '').upper().strip()
        
        conn = get_db_connection()
        
        # Verifica che l'ente esista
        existing = conn.execute('SELECT nome, codice FROM enti_militari WHERE id = ?', (id,)).fetchone()
        if not existing:
            conn.close()
            flash('Ente militare non trovato.', 'error')
            return redirect(url_for('enti_militari.organigramma'))
        
        old_name = existing['nome']
        old_code = existing['codice']
        
        # Verifica accesso al parent se specificato
        if parent_id:
            parent_id = int(parent_id)
            user_accessible_entities = get_accessible_entities()
            
            if parent_id not in user_accessible_entities:
                conn.close()
                flash('Non hai accesso all\'ente parent specificato.', 'error')
                return redirect(url_for('enti_militari.modifica_militare_form', id=id))
            
            # Verifica che il parent non sia un discendente (evita cicli)
            descendants = get_all_descendants(conn, id)
            descendant_ids = [d['id'] for d in descendants]
            if parent_id in descendant_ids:
                conn.close()
                flash('Non è possibile impostare un discendente come parent.', 'error')
                return redirect(url_for('enti_militari.modifica_militare_form', id=id))
        
        # Verifica duplicati (escludendo se stesso)
        if check_duplicate_ente_militare(conn, nome, codice, id):
            conn.close()
            flash('Esiste già un ente militare con questo nome o codice.', 'warning')
            return redirect(url_for('enti_militari.modifica_militare_form', id=id))
        
        # Aggiornamento con tracking
        conn.execute(
            '''UPDATE enti_militari 
               SET nome=?, codice=?, parent_id=?, indirizzo=?, civico=?, cap=?, 
                   citta=?, provincia=?, telefono=?, email=?, note=?,
                   modificato_da=?, data_modifica=datetime('now')
               WHERE id = ?''',
            (nome, codice, parent_id, indirizzo, civico, cap, citta, provincia, 
             telefono, email, note, user_id, id)
        )
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'UPDATE_ENTE_MILITARE',
            f'Aggiornato ente militare da "{old_name} ({old_code})" a "{nome} ({codice})"',
            'ente_militare',
            id
        )
        
        flash(f'Ente militare "{nome}" aggiornato con successo.', 'success')
        return redirect(url_for('enti_militari.visualizza_ente', id=id))
        
    except Exception as e:
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
        log_user_action(
            user_id,
            'UPDATE_ENTE_MILITARE_ERROR',
            f'Errore aggiornamento ente militare {id}: {str(e)}',
            'ente_militare',
            id,
            result='FAILED'
        )
        return redirect(url_for('enti_militari.modifica_militare_form', id=id))

@enti_militari_bp.route('/elimina_militare/<int:id>', methods=['POST'])
@entity_access_required('id')
@admin_required
def elimina_militare(id):
    """Elimina ente militare - Solo ADMIN"""
    user_id = request.current_user['user_id']
    
    try:
        conn = get_db_connection()
        
        # Recupera info prima di eliminare
        ente = conn.execute('SELECT nome, codice FROM enti_militari WHERE id = ?', (id,)).fetchone()
        if not ente:
            conn.close()
            flash('Ente militare non trovato.', 'error')
            return redirect(url_for('enti_militari.organigramma'))
        
        nome_ente = ente['nome']
        codice_ente = ente['codice']
        
        # Verifica dipendenze
        dependencies = check_ente_militare_dependencies(conn, id)
        if dependencies:
            conn.close()
            flash(f'Impossibile eliminare l\'ente "{nome_ente}": {", ".join(dependencies)}.', 'error')
            return redirect(url_for('enti_militari.organigramma'))
        
        # Eliminazione
        conn.execute('DELETE FROM enti_militari WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        
        log_user_action(
            user_id,
            'DELETE_ENTE_MILITARE',
            f'Eliminato ente militare: {nome_ente} ({codice_ente})',
            'ente_militare',
            id
        )
        
        flash(f'Ente militare "{nome_ente}" eliminato con successo.', 'success')
        
    except Exception as e:
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
        log_user_action(
            user_id,
            'DELETE_ENTE_MILITARE_ERROR',
            f'Errore eliminazione ente militare {id}: {str(e)}',
            'ente_militare',
            id,
            result='FAILED'
        )
    
    return redirect(url_for('enti_militari.organigramma'))

# ===========================================
# ROUTE AGGIUNTIVE E UTILITÀ
# ===========================================

@enti_militari_bp.route('/enti_militari/export')
@permission_required('VIEW_ENTI_MILITARI')
def export_enti_militari():
    """Esporta enti militari in formato CSV"""
    user_id = request.current_user['user_id']
    accessible_entities = get_accessible_entities()
    
    if not accessible_entities:
        flash('Nessun ente accessibile per l\'export.', 'warning')
        return redirect(url_for('enti_militari.organigramma'))
    
    try:
        conn = get_db_connection()
        placeholders = ','.join(['?' for _ in accessible_entities])
        
        enti_export = conn.execute(f"""
            SELECT em.nome, em.codice, em.indirizzo, em.civico, em.cap, em.citta, 
                   em.provincia, em.telefono, em.email, em.note, em.data_creazione,
                   parent.nome as parent_nome
            FROM enti_militari em
            LEFT JOIN enti_militari parent ON em.parent_id = parent.id
            WHERE em.id IN ({placeholders})
            ORDER BY em.nome
        """, accessible_entities).fetchall()
        
        conn.close()
        
        # Genera CSV
        import csv
        from flask import Response
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Nome', 'Codice', 'Ente Parent', 'Indirizzo', 'Civico', 'CAP', 
            'Città', 'Provincia', 'Telefono', 'Email', 'Note', 'Data Creazione'
        ])
        
        # Dati
        for ente in enti_export:
            writer.writerow([
                ente['nome'], ente['codice'], ente['parent_nome'] or '',
                ente['indirizzo'], ente['civico'], ente['cap'], ente['citta'],
                ente['provincia'], ente['telefono'], ente['email'], 
                ente['note'], ente['data_creazione']
            ])
        
        log_user_action(
            user_id,
            'EXPORT_ENTI_MILITARI',
            f'Esportati {len(enti_export)} enti militari in CSV'
        )
        
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=enti_militari_export_{datetime.now().strftime("%Y%m%d_%H%M")}.csv'}
        )
        
    except Exception as e:
        flash(f'Errore nell\'export: {str(e)}', 'error')
        return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.route('/enti_militari/statistiche')
@operatore_or_admin_required
@permission_required('VIEW_ENTI_MILITARI')
def statistiche_enti_militari():
    """Statistiche dettagliate enti militari"""
    user_id = request.current_user['user_id']
    accessible_entities = get_accessible_entities()
    
    if not accessible_entities:
        flash('Nessun ente accessibile per le statistiche.', 'warning')
        return redirect(url_for('enti_militari.organigramma'))
    
    try:
        conn = get_db_connection()
        stats = get_enti_militari_stats(conn, accessible_entities)
        
        placeholders = ','.join(['?' for _ in accessible_entities])
        
        # Crescita negli ultimi 12 mesi
        crescita_mensile = conn.execute(f"""
            SELECT 
                strftime('%Y-%m', data_creazione) as mese,
                COUNT(*) as nuovi_enti
            FROM enti_militari
            WHERE data_creazione >= date('now', '-12 months')
            AND id IN ({placeholders})
            GROUP BY strftime('%Y-%m', data_creazione)
            ORDER BY mese DESC
        """, accessible_entities).fetchall()
        stats['crescita_mensile'] = crescita_mensile
        
        # Top 10 enti per numero di figli
        top_parents = conn.execute(f"""
            SELECT parent.nome, parent.codice, COUNT(child.id) as num_figli
            FROM enti_militari parent
            JOIN enti_militari child ON parent.id = child.parent_id
            WHERE parent.id IN ({placeholders}) AND child.id IN ({placeholders})
            GROUP BY parent.id, parent.nome, parent.codice
            ORDER BY num_figli DESC
            LIMIT 10
        """, accessible_entities + accessible_entities).fetchall()
        stats['top_parents'] = top_parents
        
        conn.close()
        
        log_user_action(
            user_id,
            'VIEW_ENTI_MILITARI_STATS',
            'Visualizzate statistiche enti militari'
        )
        
        return render_template('statistiche_enti_militari.html', stats=stats)
        
    except Exception as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.route('/api/enti_militari/cerca')
@login_required
def api_cerca_enti_militari():
    """API per ricerca enti militari (per autocomplete)"""
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])
    
    try:
        accessible_entities = get_accessible_entities()
        if not accessible_entities:
            return jsonify([])
        
        conn = get_db_connection()
        placeholders = ','.join(['?' for _ in accessible_entities])
        
        enti = conn.execute(f"""
            SELECT id, nome, codice 
            FROM enti_militari 
            WHERE (nome LIKE ? OR codice LIKE ?)
            AND id IN ({placeholders})
            ORDER BY nome 
            LIMIT 20
        """, [f'%{query.upper()}%', f'%{query.upper()}%'] + accessible_entities).fetchall()
        
        conn.close()
        
        return jsonify([{
            'id': ente['id'],
            'nome': ente['nome'],
            'codice': ente['codice'],
            'label': f"{ente['nome']} ({ente['codice']})"
        } for ente in enti])
        
    except Exception:
        return jsonify([])

@enti_militari_bp.route('/api/enti_militari/albero/<int:root_id>')
@login_required
def api_albero_enti(root_id):
    """API per recuperare albero enti a partire da un nodo"""
    try:
        accessible_entities = get_accessible_entities()
        if root_id not in accessible_entities:
            return jsonify({'error': 'Accesso negato'}), 403
        
        conn = get_db_connection()
        descendants = get_all_descendants(conn, root_id)
        
        # Filtra solo enti accessibili
        filtered_descendants = [ente for ente in descendants 
                              if ente['id'] in accessible_entities]
        
        tree = build_tree(filtered_descendants)
        conn.close()
        
        return jsonify(tree)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ===========================================
# GESTIONE ERRORI
# ===========================================

@enti_militari_bp.errorhandler(sqlite3.OperationalError)
def handle_db_error(error):
    """Gestione errori database specifici per enti militari"""
    flash('Errore nel database degli enti militari. Contattare l\'amministratore.', 'error')
    return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.errorhandler(ValueError)
def handle_value_error(error):
    """Gestione errori di validazione"""
    flash('Dati non validi forniti.', 'error')
    return redirect(url_for('enti_militari.organigramma'))