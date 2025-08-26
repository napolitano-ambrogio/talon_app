# F:\talon_app\routes\enti_militari.py
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from auth import (
    login_required, permission_required, entity_access_required,
    admin_required, operatore_or_admin_required,
    log_user_action, get_user_accessible_entities, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    clear_user_cache,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
import os
from datetime import datetime

# ===============================
# POSTGRESQL
# ===============================
import psycopg2
import psycopg2.extras

def pg_conn():
    """
    Connessione Postgres (usa env se presenti).
    Valori di default allineati alla migrazione.
    """
    return psycopg2.connect(
        host=os.environ.get("TALON_PG_HOST", "127.0.0.1"),
        port=int(os.environ.get("TALON_PG_PORT", "5432")),
        dbname=os.environ.get("TALON_PG_DB", "talon"),
        user=os.environ.get("TALON_PG_USER", "talon"),
        password=os.environ.get("TALON_PG_PASSWORD", "TalonDB!2025"),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )

def query_all(sql, params=None):
    conn = pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()
    finally:
        conn.close()

def query_one(sql, params=None):
    conn = pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()
    finally:
        conn.close()

def execute(sql, params=None, return_lastrowid=False):
    conn = pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            last_id = None
            if return_lastrowid:
                # Per tabelle con PK identity, ritorna l'ID
                try:
                    last = cur.fetchone()
                    if last and len(last) == 1:
                        last_id = list(last.values())[0]
                except Exception:
                    pass
        conn.commit()
        return last_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

enti_militari_bp = Blueprint('enti_militari', __name__, template_folder='../templates')

ROOT_ENTE_ID = 1

# ===========================================
# FUNZIONI DATABASE MANCANTI
# ===========================================

def get_all_descendants_conn(conn, parent_id):
    """Recupera tutti i discendenti di un ente (ricorsivo) usando una CTE."""
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH RECURSIVE tree AS (
                SELECT *, 0 as level
                FROM enti_militari
                WHERE id = %s
                UNION ALL
                SELECT e.*, tree.level + 1
                FROM enti_militari e
                JOIN tree ON e.parent_id = tree.id
            )
            SELECT * FROM tree ORDER BY level, nome;
            """,
            (parent_id,)
        )
        return cur.fetchall()

def get_all_descendants(conn_wrapper, parent_id):
    """Wrapper compatibile con codice esistente (accetta conn oppure la crea)."""
    # Qui conn_wrapper  una connessione PG gi aperta
    return get_all_descendants_conn(conn_wrapper, parent_id)

def build_tree(enti_list):
    """Costruisce struttura ad albero da lista piatta di enti"""
    if not enti_list:
        return []
    enti_dict = {}
    for ente in enti_list:
        d = dict(ente)
        d.setdefault('children', [])
        enti_dict[d['id']] = d
    tree = []
    for ente in enti_dict.values():
        pid = ente.get('parent_id')
        if pid is None or pid not in enti_dict:
            tree.append(ente)
        else:
            enti_dict[pid]['children'].append(ente)
    return tree

def get_accessible_entities():
    """Wrapper per recuperare enti accessibili dell'utente corrente"""
    from flask import session
    user_id = session.get('user_id')
    if user_id:
        return get_user_accessible_entities(user_id)
    return []

# ===========================================
# FUNZIONI HELPER
# ===========================================

def validate_ente_militare_data(form_data, ente_id=None):
    errors = []
    required_fields = ['nome']  # Rimosso 'codice' dai campi obbligatori
    for field in required_fields:
        if not form_data.get(field, '').strip():
            errors.append(f'Il campo {field} è obbligatorio.')
    codice = form_data.get('codice', '').strip()
    if codice and len(codice) < 2:
        errors.append('Il codice deve essere di almeno 2 caratteri.')
    email = form_data.get('email', '').strip()
    if email and '@' not in email:
        errors.append('Formato email non valido.')
    return errors

def check_duplicate_ente_militare(nome, codice, exclude_id=None):
    # Controlla solo duplicati sul nome, non sul codice (il codice può essere duplicato)
    if exclude_id:
        row = query_one(
            'SELECT id FROM enti_militari WHERE nome = %s AND id <> %s',
            (nome, exclude_id)
        )
    else:
        row = query_one(
            'SELECT id FROM enti_militari WHERE nome = %s',
            (nome,)
        )
    return row is not None

def get_enti_militari_stats(accessible_entities):
    """Statistiche con filtri di accesso."""
    if not accessible_entities:
        return {}
    conn = pg_conn()
    try:
        stats = {}

        # Totale enti accessibili
        with conn.cursor() as cur:
            cur.execute(
                'SELECT COUNT(*) AS count FROM enti_militari WHERE id = ANY(%s)',
                (accessible_entities,)
            )
            r = cur.fetchone()
            stats['totale'] = r['count'] if r else 0

        # Distribuzione per livello gerarchico (partendo dalle radici accessibili)
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH RECURSIVE hierarchy AS (
                    SELECT id, nome, parent_id, 0 AS level
                    FROM enti_militari
                    WHERE parent_id IS NULL AND id = ANY(%s)
                    UNION ALL
                    SELECT e.id, e.nome, e.parent_id, h.level + 1
                    FROM enti_militari e
                    JOIN hierarchy h ON e.parent_id = h.id
                    WHERE e.id = ANY(%s)
                )
                SELECT level, COUNT(*) AS count
                FROM hierarchy
                GROUP BY level
                ORDER BY level;
                """,
                (accessible_entities, accessible_entities)
            )
            stats['per_livello'] = cur.fetchall()

        # Enti creati ultimi 30 giorni
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM enti_militari
                WHERE data_creazione >= (NOW() - INTERVAL '30 days')
                  AND id = ANY(%s)
                """,
                (accessible_entities,)
            )
            r = cur.fetchone()
            stats['recenti'] = r['count'] if r else 0

        # Radici
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM enti_militari
                WHERE parent_id IS NULL
                  AND id = ANY(%s)
                """,
                (accessible_entities,)
            )
            r = cur.fetchone()
            stats['radici'] = r['count'] if r else 0

        return stats
    finally:
        conn.close()

def check_ente_militare_dependencies(ente_id):
    """Verifica dipendenze (figli, utenti, attività)."""
    conn = pg_conn()
    try:
        deps = []

        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) AS count FROM enti_militari WHERE parent_id = %s', (ente_id,))
            r = cur.fetchone()
            if r and r['count'] > 0:
                deps.append(f"{r['count']} enti dipendenti")

        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) AS count FROM utenti WHERE ente_militare_id = %s', (ente_id,))
            r = cur.fetchone()
            if r and r['count'] > 0:
                deps.append(f"{r['count']} utenti collegati")

        # Controllo COMPLETO di tutte le relazioni con attivita
        # I campi corretti sono: ente_svolgimento_id, destinazione_militare_id, partenza_militare_id
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS count 
                FROM attivita 
                WHERE ente_svolgimento_id = %s 
                   OR destinazione_militare_id = %s
                   OR partenza_militare_id = %s
                """, 
                (ente_id, ente_id, ente_id)
            )
            r = cur.fetchone()
            if r and r['count'] > 0:
                deps.append(f"{r['count']} attività collegate")

        # Controllo nella tabella operazioni (se esiste ente_responsabile_id)
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT COUNT(*) AS count FROM operazioni WHERE ente_responsabile_id = %s', (ente_id,))
                r = cur.fetchone()
                if r and r['count'] > 0:
                    deps.append(f"{r['count']} operazioni collegate")
        except Exception:
            # Se il campo non esiste, ignora
            pass

        return deps
    finally:
        conn.close()

def get_available_parents(accessible_entities, exclude_id=None):
    """Parent disponibili (esclude se stesso e discendenti per evitare cicli)."""
    if not accessible_entities:
        return []

    conn = pg_conn()
    try:
        params = [accessible_entities]
        base = 'SELECT id, nome, codice FROM enti_militari WHERE id = ANY(%s)'

        if exclude_id:
            # esclude se stesso + discendenti
            descendants = get_all_descendants_conn(conn, exclude_id)
            descendant_ids = [d['id'] for d in descendants] + [exclude_id]
            base += ' AND id <> ALL(%s)'
            params.append(descendant_ids)

        base += ' ORDER BY nome'

        with conn.cursor() as cur:
            cur.execute(base, tuple(params))
            return cur.fetchall()
    finally:
        conn.close()

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@enti_militari_bp.route('/enti_militari/organigramma')
@permission_required('VIEW_ENTI_MILITARI')
def organigramma():
    """Visualizza organigramma enti militari con controllo cono d'ombra"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()

    try:
        view_all = request.args.get('view') == 'all'
        search = request.args.get('search', '').strip()

        # Usa direttamente get_user_accessible_entities invece del wrapper
        accessible = get_user_accessible_entities(user_id)
        
        if not accessible:
            flash('Non hai accesso a nessun ente militare.', 'warning')
            return render_template('enti/militari/organigramma.html', tree=[], view_all=False, user_role=user_role)

        conn = pg_conn()
        try:
            if view_all:
                # Vista completa - solo enti accessibili
                sql = 'SELECT * FROM enti_militari WHERE id = ANY(%s)'
                params = [accessible]

                if search:
                    sql += ' AND (UPPER(nome) LIKE %s OR UPPER(codice) LIKE %s)'
                    s = f'%{search.upper()}%'
                    params.extend([s, s])

                sql += ' ORDER BY nome'
                with conn.cursor() as cur:
                    cur.execute(sql, tuple(params))
                    enti_list = cur.fetchall()
            else:
                # Vista albero - discendenti del ROOT filtrati per accesso
                descendants = get_all_descendants_conn(conn, ROOT_ENTE_ID)
                enti_list = []
                for e in descendants:
                    if e['id'] in accessible:
                        if not search or (search.upper() in (e.get('nome') or '').upper()
                                          or search.upper() in (e.get('codice') or '').upper()):
                            enti_list.append(e)

            stats = {}
            if is_operatore_or_above():
                stats = get_enti_militari_stats(accessible)
        finally:
            conn.close()

        tree_structure = build_tree(enti_list)

        log_user_action(
            user_id,
            'VIEW_ORGANIGRAMMA',
            f'Visualizzato organigramma - View all: {view_all}, Enti: {len(enti_list)}, Search: {search}',
            'organigramma'
        )

        return render_template('enti/militari/organigramma.html',
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
    user_id = request.current_user['user_id']
    try:
        accessible = get_accessible_entities()
        if not accessible:
            flash('Non hai accesso a nessun ente per creare enti militari.', 'warning')
            return redirect('/enti_militari/organigramma')

        enti_parent = get_available_parents(accessible)

        log_user_action(
            user_id,
            'ACCESS_CREATE_ENTE_MILITARE_FORM',
            f'Accesso form creazione con {len(enti_parent)} enti parent disponibili'
        )

        return render_template('enti/militari/inserimento_ente.html', enti=enti_parent)

    except Exception as e:
        flash(f'Errore nel caricamento del form: {str(e)}', 'error')
        return redirect('/enti_militari/organigramma')

@enti_militari_bp.route('/salva_militare', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_ENTI_MILITARI')
def salva_militare():
    user_id = request.current_user['user_id']

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
        # Campi civico, cap, citta, provincia eliminati dallo schema
        telefono = request.form.get('telefono', '').strip()
        email = request.form.get('email', '').strip().lower()
        # Campo note non esiste nella tabella enti_militari

        if parent_id:
            parent_id = int(parent_id)
            accessible = get_accessible_entities()
            if parent_id not in accessible:
                flash('Non hai accesso all\'ente parent specificato.', 'error')
                return redirect(url_for('enti_militari.inserisci_militare_form'))

        if check_duplicate_ente_militare(nome, codice):
            flash('Esiste già un ente militare con questo nome.', 'warning')
            return redirect(url_for('enti_militari.inserisci_militare_form'))

        new_id = execute(
            """
            INSERT INTO enti_militari
                (nome, codice, parent_id, indirizzo,
                 telefono, email, creato_da, data_creazione)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, NOW())
            RETURNING id
            """,
            (nome, codice, parent_id, indirizzo,
             telefono, email, user_id),
            return_lastrowid=True
        )

        log_user_action(
            user_id,
            'CREATE_ENTE_MILITARE',
            f'Creato ente militare: {nome} ({codice})',
            'ente_militare',
            new_id
        )

        # Invalida cache enti per tutti gli utenti dopo creazione
        clear_user_cache()

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
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    
    # Cattura parametri per ritorno all'organigramma
    return_view = request.args.get('view', '')
    return_search = request.args.get('search', '')

    try:
        conn = pg_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT em.*,
                           u_creato.username AS creato_da_username, u_creato.nome AS creato_da_nome,
                           u_modificato.username AS modificato_da_username, u_modificato.nome AS modificato_da_nome,
                           CASE 
                               WHEN em.coordinate IS NOT NULL THEN 
                                   ST_Y(em.coordinate) || ', ' || ST_X(em.coordinate)
                               ELSE NULL
                           END AS coordinate_formatted
                    FROM enti_militari em
                    LEFT JOIN utenti u_creato ON em.creato_da = u_creato.id
                    LEFT JOIN utenti u_modificato ON em.modificato_da = u_modificato.id
                    WHERE em.id = %s
                    """,
                    (id,)
                )
                ente = cur.fetchone()

            if not ente:
                flash('Ente militare non trovato.', 'error')
                return redirect('/enti_militari/organigramma')

            parent_name = None
            if ente['parent_id']:
                r = query_one('SELECT nome FROM enti_militari WHERE id = %s', (ente['parent_id'],))
                if r:
                    parent_name = r['nome']

            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, nome, codice FROM enti_militari WHERE parent_id = %s ORDER BY nome",
                    (id,)
                )
                children = cur.fetchall()

            related_stats = {}
            if is_operatore_or_above():
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) AS count FROM utenti WHERE ente_militare_id = %s", (id,))
                    c = cur.fetchone()
                    related_stats['utenti'] = c['count'] if c else 0

                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) AS count FROM attivita WHERE ente_svolgimento_id = %s", (id,))
                    c = cur.fetchone()
                    related_stats['attivita'] = c['count'] if c else 0

                descendants = get_all_descendants_conn(conn, id)
                related_stats['discendenti'] = max(len(descendants) - 1, 0)

                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT a.id, a.descrizione, a.data_inizio, ta.nome AS tipologia
                        FROM attivita a
                        JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                        WHERE a.ente_svolgimento_id = %s
                        ORDER BY a.data_inizio DESC
                        LIMIT 5
                        """,
                        (id,)
                    )
                    related_stats['ultime_attivita'] = cur.fetchall()

        finally:
            conn.close()

        log_user_action(
            user_id,
            'VIEW_ENTE_MILITARE',
            f'Visualizzato ente militare: {ente["nome"]} ({ente["codice"]})',
            'ente_militare',
            id
        )

        return render_template('enti/militari/descrizione_ente.html',
                               ente=ente,
                               parent_name=parent_name,
                               children=children,
                               related_stats=related_stats,
                               user_role=user_role,
                               return_view=return_view,
                               return_search=return_search)

    except Exception as e:
        flash(f'Errore nel caricamento dell\'ente: {str(e)}', 'error')
        return redirect('/enti_militari/organigramma')

@enti_militari_bp.route('/modifica_militare/<int:id>')
@entity_access_required('id')
@operatore_or_admin_required
@permission_required('EDIT_ENTI_MILITARI')
def modifica_militare_form(id):
    user_id = request.current_user['user_id']
    
    # Cattura parametri per ritorno all'organigramma
    return_view = request.args.get('view', '')
    return_search = request.args.get('search', '')
    
    try:
        ente = query_one('SELECT * FROM enti_militari WHERE id = %s', (id,))
        if not ente:
            flash('Ente militare non trovato.', 'error')
            return redirect('/enti_militari/organigramma')

        accessible = get_accessible_entities()
        available_parents = get_available_parents(accessible, id)

        log_user_action(
            user_id,
            'ACCESS_EDIT_ENTE_MILITARE_FORM',
            f'Accesso form modifica ente militare: {ente["nome"]}',
            'ente_militare',
            id
        )

        return render_template('enti/militari/modifica_ente.html',
                               ente=ente,
                               tutti_gli_enti=available_parents,
                               return_view=return_view,
                               return_search=return_search)

    except Exception as e:
        flash(f'Errore nel caricamento dell\'ente: {str(e)}', 'error')
        return redirect('/enti_militari/organigramma')

@enti_militari_bp.route('/aggiorna_militare/<int:id>', methods=['POST'])
@entity_access_required('id')
@operatore_or_admin_required
@permission_required('EDIT_ENTI_MILITARI')
def aggiorna_militare(id):
    user_id = request.current_user['user_id']
    
    # Cattura parametri per ritorno all'organigramma
    return_view = request.args.get('view', '')
    return_search = request.args.get('search', '')

    validation_errors = validate_ente_militare_data(request.form, id)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('enti_militari.modifica_militare_form', id=id, view=return_view, search=return_search))

    try:
        nome = request.form['nome'].upper().strip()
        codice = request.form['codice'].upper().strip()
        parent_id = request.form.get('parent_id') or None
        indirizzo = request.form.get('indirizzo', '').upper().strip()
        # Campi civico, cap, citta, provincia eliminati dallo schema
        telefono = request.form.get('telefono', '').strip()
        email = request.form.get('email', '').strip().lower()
        # Campo note non esiste nella tabella enti_militari

        existing = query_one('SELECT nome, codice FROM enti_militari WHERE id = %s', (id,))
        if not existing:
            flash('Ente militare non trovato.', 'error')
            return redirect('/enti_militari/organigramma')

        old_name = existing['nome']
        old_code = existing['codice']

        if parent_id:
            parent_id = int(parent_id)
            accessible = get_accessible_entities()
            if parent_id not in accessible:
                flash('Non hai accesso all\'ente parent specificato.', 'error')
                return redirect(url_for('enti_militari.modifica_militare_form', id=id, view=return_view, search=return_search))

            # blocca loop gerarchici
            conn = pg_conn()
            try:
                descendants = get_all_descendants_conn(conn, id)
            finally:
                conn.close()
            descendant_ids = [d['id'] for d in descendants]
            if parent_id in descendant_ids:
                flash('Non  possibile impostare un discendente come parent.', 'error')
                return redirect(url_for('enti_militari.modifica_militare_form', id=id, view=return_view, search=return_search))

        if check_duplicate_ente_militare(nome, codice, id):
            flash('Esiste già un ente militare con questo nome.', 'warning')
            return redirect(url_for('enti_militari.modifica_militare_form', id=id, view=return_view, search=return_search))

        execute(
            """
            UPDATE enti_militari
               SET nome=%s, codice=%s, parent_id=%s, indirizzo=%s,
                   telefono=%s, email=%s,
                   modificato_da=%s, data_modifica=NOW()
             WHERE id = %s
            """,
            (nome, codice, parent_id, indirizzo,
             telefono, email, user_id, id)
        )

        log_user_action(
            user_id,
            'UPDATE_ENTE_MILITARE',
            f'Aggiornato ente militare da "{old_name} ({old_code})" a "{nome} ({codice})"',
            'ente_militare',
            id
        )

        # Invalida cache enti per tutti gli utenti dopo aggiornamento
        clear_user_cache()

        flash(f'Ente militare "{nome}" aggiornato con successo.', 'success')
        return redirect(url_for('enti_militari.visualizza_ente', id=id, view=return_view, search=return_search))

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
        return redirect(url_for('enti_militari.modifica_militare_form', id=id, view=return_view, search=return_search))

@enti_militari_bp.route('/elimina_militare/<int:id>', methods=['POST'])
@entity_access_required('id')
@admin_required
def elimina_militare(id):
    user_id = request.current_user['user_id']
    
    # Cattura parametri per ritorno all'organigramma
    return_view = request.args.get('view', '')
    return_search = request.args.get('search', '')
    
    try:
        ente = query_one('SELECT nome, codice FROM enti_militari WHERE id = %s', (id,))
        if not ente:
            flash('Ente militare non trovato.', 'error')
            return redirect(url_for('enti_militari.organigramma', view=return_view, search=return_search))

        nome_ente = ente['nome']
        codice_ente = ente['codice']

        dependencies = check_ente_militare_dependencies(id)
        if dependencies:
            flash(f'Impossibile eliminare l\'ente "{nome_ente}": {", ".join(dependencies)}.', 'error')
            return redirect(url_for('enti_militari.organigramma', view=return_view, search=return_search))

        execute('DELETE FROM enti_militari WHERE id = %s', (id,))

        log_user_action(
            user_id,
            'DELETE_ENTE_MILITARE',
            f'Eliminato ente militare: {nome_ente} ({codice_ente})',
            'ente_militare',
            id
        )

        # Invalida cache enti per tutti gli utenti dopo eliminazione
        clear_user_cache()

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
    return redirect(url_for('enti_militari.organigramma', view=return_view, search=return_search))

# ===========================================
# ROUTE AGGIUNTIVE E UTILIT
# ===========================================

@enti_militari_bp.route('/enti_militari/export')
@permission_required('VIEW_ENTI_MILITARI')
def export_enti_militari():
    user_id = request.current_user['user_id']
    accessible = get_accessible_entities()

    if not accessible:
        flash('Nessun ente accessibile per l\'export.', 'warning')
        return redirect('/enti_militari/organigramma')

    try:
        conn = pg_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT em.nome, em.codice, em.indirizzo, em.civico, em.cap, em.citta,
                           em.provincia, em.telefono, em.email, em.note, em.data_creazione,
                           parent.nome AS parent_nome
                    FROM enti_militari em
                    LEFT JOIN enti_militari parent ON em.parent_id = parent.id
                    WHERE em.id = ANY(%s)
                    ORDER BY em.nome
                    """,
                    (accessible,)
                )
                enti_export = cur.fetchall()
        finally:
            conn.close()

        # CSV
        import csv
        from flask import Response
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'Nome', 'Codice', 'Ente Parent', 'Indirizzo', 'Civico', 'CAP',
            'Citt', 'Provincia', 'Telefono', 'Email', 'Note', 'Data Creazione'
        ])
        for e in enti_export:
            writer.writerow([
                e['nome'], e['codice'], e.get('parent_nome') or '',
                e['indirizzo'], e['civico'], e['cap'], e['citta'],
                e['provincia'], e['telefono'], e['email'],
                e['note'], e['data_creazione']
            ])

        log_user_action(
            user_id,
            'EXPORT_ENTI_MILITARI',
            f'Esportati {len(enti_export)} enti militari in CSV'
        )

        output.seek(0)
        from flask import Response
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=enti_militari_export_{datetime.now().strftime("%Y%m%d_%H%M")}.csv'}
        )
    except Exception as e:
        flash(f'Errore nell\'export: {str(e)}', 'error')
        return redirect('/enti_militari/organigramma')

@enti_militari_bp.route('/enti_militari/statistiche')
@operatore_or_admin_required
@permission_required('VIEW_ENTI_MILITARI')
def statistiche_enti_militari():
    user_id = request.current_user['user_id']
    accessible = get_accessible_entities()
    if not accessible:
        flash('Nessun ente accessibile per le statistiche.', 'warning')
        return redirect('/enti_militari/organigramma')

    try:
        conn = pg_conn()
        try:
            stats = get_enti_militari_stats(accessible)

            # Crescita ultimi 12 mesi
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT to_char(date_trunc('month', data_creazione), 'YYYY-MM') AS mese,
                           COUNT(*) AS nuovi_enti
                    FROM enti_militari
                    WHERE data_creazione >= (CURRENT_DATE - INTERVAL '12 months')
                      AND id = ANY(%s)
                    GROUP BY 1
                    ORDER BY mese DESC
                    """,
                    (accessible,)
                )
                stats['crescita_mensile'] = cur.fetchall()

            # Top 10 per numero di figli
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT p.nome, p.codice, COUNT(c.id) AS num_figli
                    FROM enti_militari p
                    JOIN enti_militari c ON p.id = c.parent_id
                    WHERE p.id = ANY(%s) AND c.id = ANY(%s)
                    GROUP BY p.id, p.nome, p.codice
                    ORDER BY num_figli DESC
                    LIMIT 10
                    """,
                    (accessible, accessible)
                )
                stats['top_parents'] = cur.fetchall()
        finally:
            conn.close()

        log_user_action(
            user_id,
            'VIEW_ENTI_MILITARI_STATS',
            'Visualizzate statistiche enti militari'
        )

        return render_template('statistiche_enti_militari.html', stats=stats)

    except Exception as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        return redirect('/enti_militari/organigramma')

@enti_militari_bp.route('/api/enti_militari/cerca')
@login_required
def api_cerca_enti_militari():
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])

    try:
        accessible = get_accessible_entities()
        if not accessible:
            return jsonify([])

        conn = pg_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, nome, codice
                    FROM enti_militari
                    WHERE (UPPER(nome) LIKE %s OR UPPER(codice) LIKE %s)
                      AND id = ANY(%s)
                    ORDER BY nome
                    LIMIT 20
                    """,
                    (f'%{query.upper()}%', f'%{query.upper()}%', accessible)
                )
                enti = cur.fetchall()
        finally:
            conn.close()

        return jsonify([{
            'id': e['id'],
            'nome': e['nome'],
            'codice': e['codice'],
            'label': f"{e['nome']} ({e['codice']})"
        } for e in enti])

    except Exception:
        return jsonify([])

@enti_militari_bp.route('/api/enti_militari/albero/<int:root_id>')
@login_required
def api_albero_enti(root_id):
    try:
        accessible = get_accessible_entities()
        if root_id not in accessible:
            return jsonify({'error': 'Accesso negato'}), 403

        conn = pg_conn()
        try:
            descendants = get_all_descendants_conn(conn, root_id)
        finally:
            conn.close()

        filtered = [e for e in descendants if e['id'] in accessible]
        tree = build_tree(filtered)
        return jsonify(tree)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ===========================================
# GESTIONE ERRORI
# ===========================================

@enti_militari_bp.errorhandler(psycopg2.Error)
def handle_db_error(error):
    flash('Errore nel database degli enti militari. Contattare l\'amministratore.', 'error')
    return redirect('/enti_militari/organigramma')

@enti_militari_bp.errorhandler(ValueError)
def handle_value_error(error):
    flash('Dati non validi forniti.', 'error')
    return redirect('/enti_militari/organigramma')
