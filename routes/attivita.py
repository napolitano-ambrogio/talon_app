from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from datetime import datetime
from psycopg2.extras import RealDictCursor

# Import dal modulo auth (usa Postgres)
from auth import (
    login_required, permission_required, entity_access_required,
    admin_required, operatore_or_admin_required,
    get_user_accessible_entities, log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE,
    get_auth_db_connection  # connessione centralizzata a PostgreSQL
)

attivita_bp = Blueprint('attivita', __name__, template_folder='../templates')

# ===========================================
# DB HELPER (wrapper)
# ===========================================
def get_db_connection():
    return get_auth_db_connection()

# ===========================================
# FUNZIONI HELPER
# ===========================================
def _build_in_clause(ids):
    """Ritorna (placeholders, params) per una IN clause sicura."""
    placeholders = ','.join(['%s'] * len(ids))
    return placeholders, list(ids)

def get_location_name(conn, militare_id, civile_id):
    """Recupera il nome di una location (militare o civile)"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if militare_id:
            cur.execute('SELECT nome FROM enti_militari WHERE id = %s', (militare_id,))
            r = cur.fetchone()
            return r['nome'] if r else None
        if civile_id:
            cur.execute('SELECT nome FROM enti_civili WHERE id = %s', (civile_id,))
            r = cur.fetchone()
            return r['nome'] if r else None
    return None

def validate_activity_access(user_id, activity_id, accessible_entities):
    """Valida che l'utente abbia accesso all'attivit"""
    if not accessible_entities:
        return None
    conn = get_db_connection()
    try:
        placeholders, params = _build_in_clause(accessible_entities)
        sql = f'''
            SELECT * FROM attivita
            WHERE id = %s AND ente_svolgimento_id IN ({placeholders})
        '''
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, [activity_id] + params)
                return cur.fetchone()
    finally:
        conn.close()

def get_tipologie_organizzate(conn):
    """Recupera tipologie attivit organizzate per categoria"""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT * FROM tipologie_attivita WHERE parent_id IS NULL ORDER BY nome')
            categorie = cur.fetchall()

            tipologie_organizzate = {}
            for cat in categorie:
                cur.execute('SELECT * FROM tipologie_attivita WHERE parent_id = %s ORDER BY nome', (cat['id'],))
                sottocategorie = cur.fetchall()
                tipologie_organizzate[cat['nome']] = sottocategorie

            return tipologie_organizzate
    except Exception:
        return {}

def process_location_ids(partenza_val, destinazione_val):
    """Processa gli ID di partenza e destinazione"""
    partenza_militare_id = partenza_civile_id = None
    destinazione_militare_id = destinazione_civile_id = None

    if partenza_val and '-' in partenza_val:
        tipo, p_id = partenza_val.split('-', 1)
        if tipo == 'militare':
            partenza_militare_id = int(p_id)
        elif tipo == 'civile':
            partenza_civile_id = int(p_id)

    if destinazione_val and '-' in destinazione_val:
        tipo, d_id = destinazione_val.split('-', 1)
        if tipo == 'militare':
            destinazione_militare_id = int(d_id)
        elif tipo == 'civile':
            destinazione_civile_id = int(d_id)

    return partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id

def save_activity_details(conn, activity_id, tipologia_nome, form_data):
    """Salva i dettagli specifici dell'attivit basati sulla tipologia"""
    with conn.cursor() as cur:
        if tipologia_nome == 'MOVIMENTI E TRASPORTI':
            cur.execute("""
                INSERT INTO dettagli_trasporti (
                    attivita_id, tipologia_carico, quantita, unita_di_misura, mezzo_impiegato
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                activity_id,
                (form_data.get('tipologia_carico') or '').upper(),
                form_data.get('quantita') or None,
                (form_data.get('unita_di_misura') or '').upper(),
                (form_data.get('mezzo_impiegato') or '').upper()
            ))

        elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
            cur.execute("""
                INSERT INTO dettagli_mantenimento (
                    attivita_id, tipo_intervento, attivita_svolta, piattaforma_materiale
                ) VALUES (%s, %s, %s, %s)
            """, (
                activity_id,
                form_data.get('tipo_intervento'),
                form_data.get('attivita_svolta'),
                (form_data.get('piattaforma_materiale') or '').upper()
            ))

        elif tipologia_nome == 'RIFORNIMENTI':
            cur.execute("""
                INSERT INTO dettagli_rifornimenti (
                    attivita_id, tipologia_rifornimento, dettaglio_materiale, quantita, unita_di_misura
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                activity_id,
                form_data.get('tipologia_rifornimento'),
                (form_data.get('dettaglio_materiale') or '').upper(),
                form_data.get('quantita_rifornimento') or None,
                (form_data.get('unita_di_misura_rifornimento') or '').upper()
            ))

        elif tipologia_nome == 'GESTIONE TRANSITO':
            cur.execute("""
                INSERT INTO dettagli_getra (
                    attivita_id, tipo_vettore, seriale_vettore,
                    numero_personale, numero_mezzi, volume, unita_di_misura
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                activity_id,
                (form_data.get('tipo_vettore') or '').upper(),
                (form_data.get('seriale_vettore') or '').upper(),
                form_data.get('numero_personale') or None,
                form_data.get('numero_mezzi') or None,
                form_data.get('volume') or None,
                (form_data.get('unita_di_misura_getra') or '').upper()
            ))

def get_activity_details(conn, activity_id, tipologia_nome):
    """Recupera i dettagli specifici dell'attivit"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if tipologia_nome == 'MOVIMENTI E TRASPORTI':
            cur.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone()
        elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
            cur.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone()
        elif tipologia_nome == 'RIFORNIMENTI':
            cur.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone()
        elif tipologia_nome == 'GESTIONE TRANSITO':
            cur.execute('SELECT * FROM dettagli_getra WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone()
    return {}

# ===========================================
# ROUTE PRINCIPALI
# ===========================================
@attivita_bp.route('/attivita')
@permission_required('VIEW_ATTIVITA')
def lista_attivita():
    """Lista attivit filtrata per cono d'ombra dell'utente"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    user_role = get_user_role()

    # Parametri di filtro
    search = request.args.get('search', '').strip()
    ente_filter = request.args.get('ente')
    data_from = request.args.get('data_from')
    data_to = request.args.get('data_to')

    conn = get_db_connection()

    try:
        attivita_list = []
        enti_per_filtro = []
        if accessible_entities:
            placeholders, params = _build_in_clause(accessible_entities)
            base_query = f"""
                SELECT
                    a.id, a.data_inizio, a.data_fine, a.descrizione,
                    em.nome AS ente_nome,
                    ta.nome AS tipologia_nome,
                    o.nome_missione AS operazione_nome,
                    u_creato.username as creato_da_username,
                    u_modificato.username as modificato_da_username,
                    a.data_creazione, a.data_modifica
                FROM attivita a
                JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                LEFT JOIN operazioni o ON a.operazione_id = o.id
                LEFT JOIN utenti u_creato ON a.creato_da = u_creato.id
                LEFT JOIN utenti u_modificato ON a.modificato_da = u_modificato.id
                WHERE a.ente_svolgimento_id IN ({placeholders})
            """
            qparams = params[:]

            if search:
                base_query += " AND (a.descrizione ILIKE %s OR em.nome ILIKE %s OR ta.nome ILIKE %s)"
                like = f'%{search}%'
                qparams.extend([like, like, like])

            if ente_filter:
                base_query += " AND a.ente_svolgimento_id = %s"
                qparams.append(int(ente_filter))

            if data_from:
                base_query += " AND a.data_inizio >= %s"
                qparams.append(data_from)

            if data_to:
                base_query += " AND a.data_inizio <= %s"
                qparams.append(data_to)

            base_query += " ORDER BY a.data_inizio DESC, a.id DESC"

            with conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(base_query, qparams)
                    attivita_list = cur.fetchall()

                    cur.execute(
                        f'SELECT id, nome FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
                        params
                    )
                    enti_per_filtro = cur.fetchall()

    except Exception as e:
        flash(f'Errore nel caricamento delle attivit: {str(e)}', 'error')
        attivita_list = []
        enti_per_filtro = []
    finally:
        conn.close()

    # Log
    log_user_action(
        user_id,
        'VIEW_ATTIVITA_LIST',
        f'Visualizzate {len(attivita_list)} attivit - Filtri: search={search}, ente={ente_filter}',
        'attivita',
        ip_address=request.remote_addr
    )

    return render_template(
        'lista_attivita.html',
        attivita_list=attivita_list,
        enti_per_filtro=enti_per_filtro,
        filtri={
            'search': search,
            'ente_filter': ente_filter,
            'data_from': data_from,
            'data_to': data_to
        },
        user_role=user_role
    )

@attivita_bp.route('/inserisci_attivita')
@operatore_or_admin_required
@permission_required('CREATE_ATTIVITA')
def inserisci_attivita_form():
    """Form inserimento attivit - Solo enti accessibili"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    if not accessible_entities:
        flash('Non hai accesso a nessun ente per creare attivit.', 'warning')
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                placeholders, params = _build_in_clause(accessible_entities)
                cur.execute(
                    f'SELECT id, nome, codice FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
                    params
                )
                enti_militari = cur.fetchall()

                cur.execute('SELECT id, nome FROM enti_civili ORDER BY nome')
                enti_civili = cur.fetchall()

                cur.execute(
                    '''SELECT id, nome_missione, nome_breve 
                       FROM operazioni 
                       WHERE data_fine IS NULL OR data_fine >= CURRENT_DATE
                       ORDER BY nome_missione'''
                )
                operazioni = cur.fetchall()

                tipologie_organizzate = get_tipologie_organizzate(conn)

    except Exception as e:
        flash(f'Errore nel caricamento dei dati del form: {str(e)}', 'error')
        enti_militari, enti_civili, operazioni, tipologie_organizzate = [], [], [], {}
    finally:
        conn.close()

    log_user_action(
        user_id,
        'ACCESS_CREATE_ATTIVITA_FORM',
        f'Accesso form creazione con {len(enti_militari)} enti accessibili',
        ip_address=request.remote_addr
    )

    return render_template('inserimento_attivita.html',
                           enti_militari=enti_militari,
                           enti_civili=enti_civili,
                           operazioni=operazioni,
                           tipologie=tipologie_organizzate)

@attivita_bp.route('/salva_attivita', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_ATTIVITA')
def salva_attivita():
    """Salva nuova attivit con controlli completi"""
    user_id = request.current_user['user_id']

    # Validazione input base
    required_fields = ['ente_svolgimento_id', 'tipologia_id', 'data_inizio', 'descrizione']
    for field in required_fields:
        if not request.form.get(field, '').strip():
            flash(f'Il campo {field.replace("_", " ")}  obbligatorio.', 'error')
            return redirect(url_for('attivita.inserisci_attivita_form'))

    ente_svolgimento_id = int(request.form['ente_svolgimento_id'])

    # Verifica accesso all'ente
    accessible_entities = get_user_accessible_entities(user_id)
    if ente_svolgimento_id not in accessible_entities:
        flash('Non hai accesso all\'ente selezionato.', 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_CREATE_ATTIVITA',
            f'Tentativo creazione attivit per ente {ente_svolgimento_id} non accessibile',
            'attivita',
            result='FAILED'
        )
        return redirect(url_for('attivita.inserisci_attivita_form'))

    # Validazione date
    data_inizio = request.form['data_inizio']
    data_fine = request.form.get('data_fine')

    if data_fine:
        try:
            inizio = datetime.strptime(data_inizio, '%Y-%m-%d')
            fine = datetime.strptime(data_fine, '%Y-%m-%d')
            if fine < inizio:
                flash('La data di fine non pu essere precedente alla data di inizio.', 'error')
                return redirect(url_for('attivita.inserisci_attivita_form'))
        except ValueError:
            flash('Formato data non valido.', 'error')
            return redirect(url_for('attivita.inserisci_attivita_form'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Processa location
                partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id = \
                    process_location_ids(request.form.get('partenza_id'), request.form.get('destinazione_id'))

                # Inserisci attivit (RETURNING id)
                cur.execute("""
                    INSERT INTO attivita (
                        ente_svolgimento_id, tipologia_id, data_inizio, data_fine, descrizione,
                        partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id,
                        personale_ufficiali, personale_sottufficiali, personale_graduati, personale_civili, 
                        note, operazione_id, creato_da, data_creazione
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                """, (
                    ente_svolgimento_id,
                    request.form['tipologia_id'],
                    data_inizio,
                    data_fine or None,
                    (request.form['descrizione'] or '').upper().strip(),
                    partenza_militare_id, partenza_civile_id,
                    destinazione_militare_id, destinazione_civile_id,
                    request.form.get('personale_ufficiali', 0) or 0,
                    request.form.get('personale_sottufficiali', 0) or 0,
                    request.form.get('personale_graduati', 0) or 0,
                    request.form.get('personale_civili', 0) or 0,
                    (request.form.get('note', '') or '').upper().strip(),
                    request.form.get('operazione_id') or None,
                    user_id
                ))
                new_id = cur.fetchone()['id']

                # Salva dettagli specifici per tipologia
                cur.execute('SELECT nome FROM tipologie_attivita WHERE id = %s', (request.form['tipologia_id'],))
                tipologia_result = cur.fetchone()
                if tipologia_result:
                    save_activity_details(conn, new_id, tipologia_result['nome'], request.form)

        log_user_action(
            user_id,
            'CREATE_ATTIVITA',
            f'Creata attivit ID {new_id} per ente {ente_svolgimento_id}',
            'attivita',
            new_id
        )

        flash('Attivit creata con successo.', 'success')
        return redirect(url_for('attivita.visualizza_attivita', id=new_id))

    except Exception as e:
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        log_user_action(
            user_id,
            'CREATE_ATTIVITA_ERROR',
            f'Errore creazione attivit: {str(e)}',
            'attivita',
            result='FAILED'
        )
        return redirect(url_for('attivita.inserisci_attivita_form'))
    finally:
        conn.close()

@attivita_bp.route('/attivita/<int:id>')
@permission_required('VIEW_ATTIVITA')
def visualizza_attivita(id):
    """Visualizza singola attivit con controllo accesso"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica accesso
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        flash('Attivit non trovata o non accessibile.', 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_VIEW_ATTIVITA',
            f'Tentativo visualizzazione attivit {id} non accessibile',
            'attivita',
            id,
            result='FAILED'
        )
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                query = """
                    SELECT
                        a.*,
                        em.nome as ente_nome, em.codice as ente_codice,
                        ta.nome as tipologia_nome,
                        op.nome_missione as operazione_nome, op.nome_breve as operazione_breve,
                        u_creato.username as creato_da_username, u_creato.nome as creato_da_nome,
                        u_modificato.username as modificato_da_username, u_modificato.nome as modificato_da_nome
                    FROM attivita a
                    JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                    JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                    LEFT JOIN operazioni op ON a.operazione_id = op.id
                    LEFT JOIN utenti u_creato ON a.creato_da = u_creato.id
                    LEFT JOIN utenti u_modificato ON a.modificato_da = u_modificato.id
                    WHERE a.id = %s
                """
                cur.execute(query, (id,))
                attivita_completa = cur.fetchone()
                if not attivita_completa:
                    flash('Attivit non trovata.', 'error')
                    return redirect(url_for('attivita.lista_attivita'))

                partenza = get_location_name(conn, attivita_completa['partenza_militare_id'],
                                             attivita_completa['partenza_civile_id'])
                destinazione = get_location_name(conn, attivita_completa['destinazione_militare_id'],
                                                 attivita_completa['destinazione_civile_id'])

                dettagli_specifici = get_activity_details(conn, id, attivita_completa['tipologia_nome'])

    except Exception as e:
        flash(f'Errore nel caricamento dell\'attivit: {str(e)}', 'error')
        return redirect(url_for('attivita.lista_attivita'))
    finally:
        conn.close()

    log_user_action(
        user_id,
        'VIEW_ATTIVITA',
        f'Visualizzata attivit {id}',
        'attivita',
        id
    )

    return render_template('descrizione_attivita.html',
                           attivita=attivita_completa,
                           partenza=partenza,
                           destinazione=destinazione,
                           dettagli_specifici=dettagli_specifici)

@attivita_bp.route('/attivita/modifica/<int:id>')
@operatore_or_admin_required
@permission_required('EDIT_ATTIVITA')
def modifica_attivita_form(id):
    """Form modifica attivit con controlli accesso"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica accesso
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        flash('Attivit non trovata o non modificabile.', 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_EDIT_ATTIVITA',
            f'Tentativo modifica attivit {id} non accessibile',
            'attivita',
            id,
            result='FAILED'
        )
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                placeholders, params = _build_in_clause(accessible_entities)
                cur.execute(
                    f'SELECT id, nome, codice FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
                    params
                )
                enti_militari = cur.fetchall()

                cur.execute('SELECT id, nome FROM enti_civili ORDER BY nome')
                enti_civili = cur.fetchall()

                cur.execute('SELECT id, nome_missione, nome_breve FROM operazioni ORDER BY nome_missione')
                operazioni = cur.fetchall()

                tipologie_organizzate = get_tipologie_organizzate(conn)

                dettagli = {
                    'trasporti': None, 'mantenimento': None, 'rifornimenti': None, 'getra': None
                }
                cur.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = %s', (id,))
                dettagli['trasporti'] = cur.fetchone()
                cur.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = %s', (id,))
                dettagli['mantenimento'] = cur.fetchone()
                cur.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = %s', (id,))
                dettagli['rifornimenti'] = cur.fetchone()
                cur.execute('SELECT * FROM dettagli_getra WHERE attivita_id = %s', (id,))
                dettagli['getra'] = cur.fetchone()

    except Exception as e:
        flash(f'Errore nel caricamento dei dati: {str(e)}', 'error')
        return redirect(url_for('attivita.visualizza_attivita', id=id))
    finally:
        conn.close()

    log_user_action(
        user_id,
        'ACCESS_EDIT_ATTIVITA_FORM',
        f'Accesso form modifica attivit {id}',
        'attivita',
        id
    )

    return render_template('modifica_attivita.html',
                           attivita=attivita,
                           dettagli_trasporti=dettagli['trasporti'] or {},
                           dettagli_mantenimento=dettagli['mantenimento'] or {},
                           dettagli_rifornimenti=dettagli['rifornimenti'] or {},
                           dettagli_getra=dettagli['getra'] or {},
                           enti_militari=enti_militari,
                           enti_civili=enti_civili,
                           operazioni=operazioni,
                           tipologie=tipologie_organizzate)

@attivita_bp.route('/attivita/aggiorna/<int:id>', methods=['POST'])
@operatore_or_admin_required
@permission_required('EDIT_ATTIVITA')
def aggiorna_attivita(id):
    """Aggiorna attivit esistente con controlli completi"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica accesso
    existing_activity = validate_activity_access(user_id, id, accessible_entities)
    if not existing_activity:
        flash('Attivit non trovata o non modificabile.', 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_UPDATE_ATTIVITA',
            f'Tentativo aggiornamento attivit {id} non accessibile',
            'attivita',
            id,
            result='FAILED'
        )
        return redirect(url_for('attivita.lista_attivita'))

    # Validazione input
    required_fields = ['ente_svolgimento_id', 'tipologia_id', 'data_inizio', 'descrizione']
    for field in required_fields:
        if not request.form.get(field, '').strip():
            flash(f'Il campo {field.replace("_", " ")}  obbligatorio.', 'error')
            return redirect(url_for('attivita.modifica_attivita_form', id=id))

    ente_svolgimento_id = int(request.form['ente_svolgimento_id'])

    if ente_svolgimento_id not in accessible_entities:
        flash('Non hai accesso all\'ente selezionato.', 'error')
        return redirect(url_for('attivita.modifica_attivita_form', id=id))

    # Validazione date
    data_inizio = request.form['data_inizio']
    data_fine = request.form.get('data_fine')

    if data_fine:
        try:
            inizio = datetime.strptime(data_inizio, '%Y-%m-%d')
            fine = datetime.strptime(data_fine, '%Y-%m-%d')
            if fine < inizio:
                flash('La data di fine non pu essere precedente alla data di inizio.', 'error')
                return redirect(url_for('attivita.modifica_attivita_form', id=id))
        except ValueError:
            flash('Formato data non valido.', 'error')
            return redirect(url_for('attivita.modifica_attivita_form', id=id))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor() as cur:
                # Processa location
                partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id = \
                    process_location_ids(request.form.get('partenza_id'), request.form.get('destinazione_id'))

                # Aggiorna attivit
                cur.execute("""
                    UPDATE attivita SET
                        ente_svolgimento_id=%s, tipologia_id=%s, data_inizio=%s, data_fine=%s, descrizione=%s,
                        partenza_militare_id=%s, partenza_civile_id=%s, destinazione_militare_id=%s, destinazione_civile_id=%s,
                        personale_ufficiali=%s, personale_sottufficiali=%s, personale_graduati=%s, personale_civili=%s, 
                        note=%s, operazione_id=%s, modificato_da=%s, data_modifica=NOW()
                    WHERE id = %s
                """, (
                    ente_svolgimento_id, request.form['tipologia_id'],
                    data_inizio, data_fine or None,
                    (request.form['descrizione'] or '').upper().strip(),
                    partenza_militare_id, partenza_civile_id,
                    destinazione_militare_id, destinazione_civile_id,
                    request.form.get('personale_ufficiali', 0) or 0,
                    request.form.get('personale_sottufficiali', 0) or 0,
                    request.form.get('personale_graduati', 0) or 0,
                    request.form.get('personale_civili', 0) or 0,
                    (request.form.get('note', '') or '').upper().strip(),
                    request.form.get('operazione_id') or None,
                    user_id,
                    id
                ))

                # Elimina dettagli esistenti
                for table in ['dettagli_trasporti', 'dettagli_mantenimento', 'dettagli_rifornimenti', 'dettagli_getra']:
                    cur.execute(f'DELETE FROM {table} WHERE attivita_id = %s', (id,))

                # Inserisci nuovi dettagli
                with conn.cursor(cursor_factory=RealDictCursor) as cur2:
                    cur2.execute('SELECT nome FROM tipologie_attivita WHERE id = %s', (request.form['tipologia_id'],))
                    tipologia_result = cur2.fetchone()
                if tipologia_result:
                    save_activity_details(conn, id, tipologia_result['nome'], request.form)

        log_user_action(
            user_id,
            'UPDATE_ATTIVITA',
            f'Aggiornata attivit {id}',
            'attivita',
            id
        )

        flash('Attivit aggiornata con successo.', 'success')
        return redirect(url_for('attivita.visualizza_attivita', id=id))

    except Exception as e:
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
        log_user_action(
            user_id,
            'UPDATE_ATTIVITA_ERROR',
            f'Errore aggiornamento attivit {id}: {str(e)}',
            'attivita',
            id,
            result='FAILED'
        )
        return redirect(url_for('attivita.modifica_attivita_form', id=id))
    finally:
        conn.close()

@attivita_bp.route('/attivita/elimina/<int:id>', methods=['POST'])
@admin_required
def elimina_attivita(id):
    """Elimina attivit - Solo ADMIN"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Anche se  admin, verifica che l'attivit esista (per log coerente)
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        flash('Attivit non trovata.', 'error')
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    '''SELECT a.descrizione, em.nome as ente_nome 
                       FROM attivita a 
                       JOIN enti_militari em ON a.ente_svolgimento_id = em.id 
                       WHERE a.id = %s''',
                    (id,)
                )
                info_attivita = cur.fetchone()

                for table in ['dettagli_trasporti', 'dettagli_mantenimento', 'dettagli_rifornimenti', 'dettagli_getra']:
                    cur.execute(f'DELETE FROM {table} WHERE attivita_id = %s', (id,))

                cur.execute('DELETE FROM attivita WHERE id = %s', (id,))

        descrizione = (info_attivita['descrizione'][:50] if info_attivita and info_attivita.get('descrizione') else f'ID {id}')
        ente_nome = info_attivita['ente_nome'] if info_attivita and info_attivita.get('ente_nome') else 'N/A'

        log_user_action(
            user_id,
            'DELETE_ATTIVITA',
            f'Eliminata attivit "{descrizione}" dell\'ente {ente_nome}',
            'attivita',
            id
        )

        flash('Attivit eliminata con successo.', 'success')

    except Exception as e:
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
        log_user_action(
            user_id,
            'DELETE_ATTIVITA_ERROR',
            f'Errore eliminazione attivit {id}: {str(e)}',
            'attivita',
            id,
            result='FAILED'
        )
    finally:
        conn.close()

    return redirect(url_for('attivita.lista_attivita'))

# ===========================================
# ROUTE AGGIUNTIVE E UTILIT
# ===========================================
@attivita_bp.route('/attivita/export')
@permission_required('VIEW_ATTIVITA')
def export_attivita():
    """Esporta attivit in formato CSV"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    if not accessible_entities:
        flash('Nessuna attivit accessibile per l\'export.', 'warning')
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        placeholders, params = _build_in_clause(accessible_entities)
        query = f"""
            SELECT
                a.id, a.data_inizio, a.data_fine, a.descrizione,
                em.nome AS ente_nome, ta.nome AS tipologia_nome,
                o.nome_missione AS operazione_nome,
                a.personale_ufficiali, a.personale_sottufficiali,
                a.personale_graduati, a.personale_civili,
                a.note, a.data_creazione
            FROM attivita a
            JOIN enti_militari em ON a.ente_svolgimento_id = em.id
            JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
            LEFT JOIN operazioni o ON a.operazione_id = o.id
            WHERE a.ente_svolgimento_id IN ({placeholders})
            ORDER BY a.data_inizio DESC
        """

        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                attivita_export = cur.fetchall()

    except Exception as e:
        flash(f'Errore nell\'export: {str(e)}', 'error')
        return redirect(url_for('attivita.lista_attivita'))
    finally:
        conn.close()

    # Genera CSV
    import csv
    from flask import Response
    import io

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        'ID', 'Data Inizio', 'Data Fine', 'Descrizione', 'Ente', 'Tipologia',
        'Operazione', 'Ufficiali', 'Sottufficiali', 'Graduati', 'Civili',
        'Note', 'Data Creazione'
    ])

    # Dati
    for a in attivita_export:
        writer.writerow([
            a['id'], a['data_inizio'], a['data_fine'],
            a['descrizione'], a['ente_nome'], a['tipologia_nome'],
            a['operazione_nome'] or '', a['personale_ufficiali'],
            a['personale_sottufficiali'], a['personale_graduati'],
            a['personale_civili'], a['note'], a['data_creazione']
        ])

    log_user_action(
        user_id,
        'EXPORT_ATTIVITA',
        f'Esportate {len(attivita_export)} attivit in CSV',
        'attivita'
    )

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename=attivita_export_{datetime.now().strftime("%Y%m%d_%H%M")}.csv'}
    )

@attivita_bp.route('/attivita/statistiche')
@permission_required('VIEW_ATTIVITA')
def statistiche_attivita():
    """Statistiche attivit per l'utente corrente"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    if not accessible_entities:
        flash('Nessuna attivit accessibile per le statistiche.', 'warning')
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        placeholders, params = _build_in_clause(accessible_entities)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Statistiche generali
                cur.execute(f"""
                    SELECT 
                        COUNT(*) as totale_attivita,
                        COUNT(*) FILTER (WHERE data_fine IS NULL OR data_fine >= CURRENT_DATE) as attivita_attive,
                        COUNT(*) FILTER (WHERE data_fine < CURRENT_DATE) as attivita_concluse,
                        COALESCE(SUM(personale_ufficiali + personale_sottufficiali + personale_graduati + personale_civili), 0) as totale_personale
                    FROM attivita a
                    WHERE a.ente_svolgimento_id IN ({placeholders})
                """, params)
                stats_generali = cur.fetchone()

                # Attivit per ente
                cur.execute(f"""
                    SELECT 
                        em.nome as ente_nome,
                        COUNT(*) as numero_attivita,
                        COALESCE(SUM(personale_ufficiali + personale_sottufficiali + personale_graduati + personale_civili), 0) as personale_totale
                    FROM attivita a
                    JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                    WHERE a.ente_svolgimento_id IN ({placeholders})
                    GROUP BY em.id, em.nome
                    ORDER BY numero_attivita DESC
                """, params)
                stats_per_ente = cur.fetchall()

                # Attivit per tipologia
                cur.execute(f"""
                    SELECT 
                        ta.nome as tipologia_nome,
                        COUNT(*) as numero_attivita
                    FROM attivita a
                    JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                    WHERE a.ente_svolgimento_id IN ({placeholders})
                    GROUP BY ta.id, ta.nome
                    ORDER BY numero_attivita DESC
                """, params)
                stats_per_tipologia = cur.fetchall()

                # Attivit per mese (ultimi 12 mesi)
                cur.execute(f"""
                    SELECT 
                        TO_CHAR(date_trunc('month', data_inizio), 'YYYY-MM') AS mese,
                        COUNT(*) AS numero_attivita
                    FROM attivita a
                    WHERE a.ente_svolgimento_id IN ({placeholders})
                      AND data_inizio >= (CURRENT_DATE - INTERVAL '12 months')
                    GROUP BY date_trunc('month', data_inizio)
                    ORDER BY mese DESC
                """, params)
                stats_per_mese = cur.fetchall()

    except Exception as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        stats_generali, stats_per_ente, stats_per_tipologia, stats_per_mese = None, [], [], []
    finally:
        conn.close()

    log_user_action(
        user_id,
        'VIEW_ATTIVITA_STATS',
        'Visualizzate statistiche attivit',
        'attivita'
    )

    return render_template('statistiche_attivita.html',
                           stats_generali=stats_generali,
                           stats_per_ente=stats_per_ente,
                           stats_per_tipologia=stats_per_tipologia,
                           stats_per_mese=stats_per_mese)

# ===========================================
# GESTIONE ERRORI SPECIFICHE
# ===========================================
@attivita_bp.errorhandler(Exception)
def handle_db_error(error):
    """Gestione errori generici per attivit"""
    flash('Errore nel database delle attivit. Contattare l\'amministratore.', 'error')
    return redirect(url_for('attivita.lista_attivita'))
