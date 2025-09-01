# routes/attivita.py - Blueprint per gestione attività
from flask import Blueprint, render_template, request, redirect, url_for, flash, Response, jsonify
from datetime import datetime, date
from psycopg2.extras import RealDictCursor
import csv
import io

# Import dal modulo auth (usa Postgres)
from auth import (
    login_required, permission_required, entity_access_required,
    admin_required, operatore_or_admin_required,
    get_user_accessible_entities, log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role, get_user_permissions,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE,
    get_auth_db_connection  # connessione centralizzata a PostgreSQL
)

# ===========================================
# DEFINIZIONE BLUEPRINT
# ===========================================
attivita_bp = Blueprint(
    'attivita',
    __name__,
    template_folder='../templates/attivita',  # Punta alla sottocartella attivita
    static_folder='../static'
)

# ===========================================
# HELPERS DATABASE
# ===========================================

def get_db_connection():
    """
    Wrapper per ottenere la connessione database dal modulo auth.
    Centralizza la gestione delle connessioni PostgreSQL.
    """
    return get_auth_db_connection()


# ===========================================
# FUNZIONI HELPER
# ===========================================

def _build_in_clause(ids):
    """
    Costruisce placeholders e parametri per una IN clause sicura.
    
    Args:
        ids: Lista di ID
        
    Returns:
        tuple: (placeholders string, params list)
    """
    placeholders = ','.join(['%s'] * len(ids))
    return placeholders, list(ids)

def get_location_name(conn, militare_id, civile_id):
    """
    Recupera il nome di una location (militare o civile).
    
    Args:
        conn: Connessione database
        militare_id: ID ente militare
        civile_id: ID ente civile
        
    Returns:
        str: Nome della location o None
    """
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

def resolve_ente_appartenenza_name(conn, ente_appartenenza_value):
    """
    Risolve il nome dell'ente di appartenenza dal valore salvato nel database.
    
    Args:
        conn: Connessione database
        ente_appartenenza_value: Valore dal database (formato "militare-id" o testo libero)
        
    Returns:
        str: Nome dell'ente o testo originale
    """
    if not ente_appartenenza_value:
        return None
        
    # Se è un riferimento a un ente militare
    if ente_appartenenza_value.startswith('militare-'):
        try:
            militare_id = int(ente_appartenenza_value.split('-', 1)[1])
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute('SELECT nome FROM enti_militari WHERE id = %s', (militare_id,))
                r = cur.fetchone()
                return r['nome'] if r else ente_appartenenza_value
        except (ValueError, IndexError):
            return ente_appartenenza_value
    
    # Se è testo libero, restituisce il valore originale
    return ente_appartenenza_value

def validate_activity_access(user_id, activity_id, accessible_entities):
    """
    Valida che l'utente abbia accesso all'attività.
    
    Args:
        user_id: ID utente
        activity_id: ID attività
        accessible_entities: Lista enti accessibili
        
    Returns:
        dict: Dati attività se accessibile, None altrimenti
    """
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
    """
    Recupera tipologie attività organizzate per categoria.
    
    Args:
        conn: Connessione database
        
    Returns:
        dict: Dizionario con tipologie organizzate per categoria
    """
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
    except Exception as e:
        print(f"Errore nel recupero tipologie: {e}")
        return {}

def process_location_ids(partenza_val, destinazione_val):
    """
    Processa gli ID di partenza e destinazione dal form.
    
    Args:
        partenza_val: Valore campo partenza (formato: "tipo-id")
        destinazione_val: Valore campo destinazione (formato: "tipo-id")
        
    Returns:
        tuple: (partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id)
    """
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
    """
    Salva i dettagli specifici dell'attività basati sulla tipologia.
    
    Args:
        conn: Connessione database
        activity_id: ID attività
        tipologia_nome: Nome della tipologia
        form_data: Dati del form
    """
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
                (form_data.get('tipo_intervento') or '').upper(),
                (form_data.get('attivita_svolta') or '').upper(),
                (form_data.get('piattaforma_materiale') or '').upper()
            ))

        elif tipologia_nome == 'RIFORNIMENTI':
            # Converti quantità in intero se presente
            quantita_rifornimento = form_data.get('quantita_rifornimento')
            if quantita_rifornimento:
                try:
                    quantita_rifornimento = int(float(quantita_rifornimento))
                except (ValueError, TypeError):
                    quantita_rifornimento = None
            else:
                quantita_rifornimento = None
                
            cur.execute("""
                INSERT INTO dettagli_rifornimenti (
                    attivita_id, tipologia_rifornimento, dettaglio_materiale, quantita, unita_di_misura
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                activity_id,
                (form_data.get('tipologia_rifornimento') or '').upper(),
                (form_data.get('dettaglio_materiale') or '').upper(),
                quantita_rifornimento,
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

        elif tipologia_nome == 'ATTIVITÀ DI TRAINING ON THE JOB':
            cur.execute("""
                INSERT INTO dettagli_training_on_the_job (
                    attivita_id, tipo_training
                ) VALUES (%s, %s)
            """, (
                activity_id,
                (form_data.get('tipo_training') or '').upper()
            ))

        elif tipologia_nome == 'SGOMBERI SANITARI/VETERINARI':
            # Gestione ente_appartenenza
            ente_appartenenza = form_data.get('ente_appartenenza')
            if ente_appartenenza == 'altro':
                ente_appartenenza = (form_data.get('ente_appartenenza_testo') or '').upper()
            else:
                ente_appartenenza = ente_appartenenza or None
                
            cur.execute("""
                INSERT INTO dettagli_stratevac (
                    attivita_id, priorita, tipo_vettore, seriale_vettore,
                    num_unita, grado, ente_appartenenza, forza_armata,
                    motivo_sgombero, trasporto_a_cura
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                activity_id,
                form_data.get('priorita') or None,
                (form_data.get('tipo_vettore_stratevac') or '').upper() or None,
                (form_data.get('seriale_vettore_stratevac') or '').upper() or None,
                form_data.get('num_unita') or None,
                (form_data.get('grado') or '').upper() or None,
                ente_appartenenza,
                form_data.get('forza_armata') or None,
                (form_data.get('motivo_sgombero') or '').upper() or None,
                form_data.get('trasporto_a_cura') or None
            ))

        elif tipologia_nome == 'CORSI DI FORMAZIONE':
            cur.execute("""
                INSERT INTO dettagli_formazione (
                    attivita_id, tipo_formazione, nome_corso
                ) VALUES (%s, %s, %s)
            """, (
                activity_id,
                (form_data.get('tipo_formazione') or '').upper(),
                (form_data.get('nome_corso') or '').upper()
            ))

        elif tipologia_nome == 'MEDICINA CURATIVA':
            # Gestione corretta dei valori vuoti
            tipo_intervento = form_data.get('tipo_intervento_med')
            if tipo_intervento and tipo_intervento.strip():
                tipo_intervento = tipo_intervento.strip()
            else:
                tipo_intervento = None
                
            a_favore = form_data.get('a_favore')
            if a_favore and a_favore.strip():
                a_favore = a_favore.strip()
            else:
                a_favore = None
                
            cur.execute("""
                INSERT INTO dettagli_med_curativa (
                    attivita_id, num_interventi, tipo_intervento, a_favore
                ) VALUES (%s, %s, %s, %s)
            """, (
                activity_id,
                form_data.get('num_interventi') or None,
                tipo_intervento,
                a_favore
            ))

        elif tipologia_nome == 'ESERCITAZIONI':
            cur.execute("""
                INSERT INTO dettagli_esercitazione (
                    attivita_id, tipo_esercitazione, nome_esercitazione, descrizione_esercitazione
                ) VALUES (%s, %s, %s, %s)
            """, (
                activity_id,
                (form_data.get('tipo_esercitazione') or '').upper(),
                (form_data.get('nome_esercitazione') or '').upper(),
                (form_data.get('descrizione_esercitazione') or '').upper()
            ))

def get_activity_details(conn, activity_id, tipologia_nome):
    """
    Recupera i dettagli specifici dell'attività.
    
    Args:
        conn: Connessione database
        activity_id: ID attività
        tipologia_nome: Nome della tipologia
        
    Returns:
        dict: Dettagli specifici o dizionario vuoto
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # MOVIMENTI E TRASPORTI (ID 4)
        if tipologia_nome == 'MOVIMENTI E TRASPORTI':
            cur.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # MANTENIMENTO E SQUADRE A CONTATTO (ID 3)
        elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
            cur.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # RIFORNIMENTI (ID 2)
        elif tipologia_nome == 'RIFORNIMENTI':
            cur.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # GESTIONE TRANSITO (ID 15) - GETRA
        elif tipologia_nome == 'GESTIONE TRANSITO':
            cur.execute('SELECT * FROM dettagli_getra WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # ESERCITAZIONI (ID 23)
        elif tipologia_nome == 'ESERCITAZIONI':
            cur.execute('SELECT * FROM dettagli_esercitazione WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # CORSI DI FORMAZIONE (ID 20)
        elif tipologia_nome == 'CORSI DI FORMAZIONE':
            cur.execute('SELECT * FROM dettagli_formazione WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # ATTIVITÀ DI TRAINING ON THE JOB (ID 21)
        elif tipologia_nome == 'ATTIVITÀ DI TRAINING ON THE JOB':
            cur.execute('SELECT * FROM dettagli_training_on_the_job WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # MEDICINA CURATIVA
        elif tipologia_nome == 'MEDICINA CURATIVA':
            cur.execute('SELECT * FROM dettagli_med_curativa WHERE attivita_id = %s', (activity_id,))
            return cur.fetchone() or {}
        
        # SGOMBERI SANITARI/VETERINARI (ID 12)
        elif tipologia_nome == 'SGOMBERI SANITARI/VETERINARI':
            cur.execute('SELECT * FROM dettagli_stratevac WHERE attivita_id = %s', (activity_id,))
            dettagli = cur.fetchone()
            if dettagli and dettagli.get('ente_appartenenza'):
                # Risolvi il nome dell'ente di appartenenza
                dettagli = dict(dettagli)  # Converti in dict modificabile
                dettagli['ente_appartenenza'] = resolve_ente_appartenenza_name(conn, dettagli['ente_appartenenza'])
            return dettagli or {}
            
    return {}

def get_enti_form_data(conn, accessible_entities=None):
    """
    Recupera i dati degli enti per i form.
    
    Args:
        conn: Connessione database
        accessible_entities: Lista ID enti accessibili (opzionale)
        
    Returns:
        tuple: (enti_militari list, enti_civili list)
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Enti militari - solo quelli accessibili se specificato
        if accessible_entities:
            placeholders, params = _build_in_clause(accessible_entities)
            cur.execute(
                f'''SELECT id, nome, codice, indirizzo
                   FROM enti_militari
                   WHERE id IN ({placeholders}) 
                   ORDER BY nome''',
                params
            )
        else:
            cur.execute(
                '''SELECT id, nome, codice, indirizzo
                   FROM enti_militari
                   ORDER BY nome'''
            )
        enti_militari = cur.fetchall()

        # Enti civili - tutti disponibili
        cur.execute(
            '''SELECT id, nome, indirizzo, nazione
               FROM enti_civili 
               ORDER BY nome'''
        )
        enti_civili = cur.fetchall()

        return enti_militari, enti_civili

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@attivita_bp.route('/attivita')
@permission_required('VIEW_ATTIVITA')
def lista_attivita():
    """
    Lista attività filtrata per cono d'ombra dell'utente.
    """
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
                    e.nome AS esercitazione_nome,
                    u_creato.username as creato_da_username,
                    u_modificato.username as modificato_da_username,
                    a.data_creazione, a.data_modifica
                FROM attivita a
                JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                LEFT JOIN operazioni o ON a.operazione_id = o.id
                LEFT JOIN esercitazioni e ON a.esercitazione_id = e.id
                LEFT JOIN utenti u_creato ON a.creato_da = u_creato.id
                LEFT JOIN utenti u_modificato ON a.modificato_da = u_modificato.id
                WHERE a.ente_svolgimento_id IN ({placeholders})
            """
            qparams = params[:]

            # Applica filtri
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

                    # Enti per filtro dropdown
                    cur.execute(
                        f'SELECT id, nome FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
                        params
                    )
                    enti_per_filtro = cur.fetchall()

    except Exception as e:
        flash(f'Errore nel caricamento delle attività: {str(e)}', 'error')
        attivita_list = []
        enti_per_filtro = []
    finally:
        conn.close()

    # Log accesso
    log_user_action(
        user_id,
        'VIEW_ATTIVITA_LIST',
        f'Visualizzate {len(attivita_list)} attività - Filtri: search={search}, ente={ente_filter}',
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
    """
    Form inserimento attività.
    Solo enti accessibili all'utente.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    if not accessible_entities:
        flash('Non hai accesso a nessun ente per creare attività.', 'warning')
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            # Recupera dati per il form
            enti_militari, enti_civili = get_enti_form_data(conn, accessible_entities)

            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Operazioni attive
                cur.execute(
                    '''SELECT id, nome_missione, nome_breve, teatro_operativo, nazione
                       FROM operazioni 
                       WHERE data_fine IS NULL OR data_fine >= CURRENT_DATE
                       ORDER BY nome_missione'''
                )
                operazioni = cur.fetchall()

                # Esercitazioni
                cur.execute(
                    '''SELECT id, nome, nome_breve, anno
                       FROM esercitazioni
                       ORDER BY anno DESC, nome ASC'''
                )
                esercitazioni = cur.fetchall()

                # Operazioni temporanee (non validate)
                cur.execute(
                    '''SELECT id, nome_missione, nome_breve, teatro_operativo, nazione
                       FROM operazioni_temp 
                       WHERE validato = FALSE
                       ORDER BY data_inserimento DESC'''
                )
                operazioni_temp = cur.fetchall()

                # Esercitazioni temporanee (non validate)
                cur.execute(
                    '''SELECT id, nome, nome_breve, anno
                       FROM esercitazioni_temp
                       WHERE validato = FALSE
                       ORDER BY data_inserimento DESC'''
                )
                esercitazioni_temp = cur.fetchall()

            tipologie_organizzate = get_tipologie_organizzate(conn)

    except Exception as e:
        flash(f'Errore nel caricamento dei dati del form: {str(e)}', 'error')
        enti_militari, enti_civili, operazioni, esercitazioni, operazioni_temp, esercitazioni_temp, tipologie_organizzate = [], [], [], [], [], [], {}
    finally:
        conn.close()

    # Log accesso
    log_user_action(
        user_id,
        'ACCESS_CREATE_ATTIVITA_FORM',
        f'Accesso form creazione con {len(enti_militari)} enti accessibili',
        ip_address=request.remote_addr
    )

    return render_template(
        'inserimento_attivita.html',
        enti_militari=enti_militari,
        enti_civili=enti_civili,
        operazioni=operazioni,
        esercitazioni=esercitazioni,
        operazioni_temp=operazioni_temp,
        esercitazioni_temp=esercitazioni_temp,
        tipologie=tipologie_organizzate
    )

@attivita_bp.route('/salva_attivita', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_ATTIVITA')
def salva_attivita():
    """
    Salva nuova attività con controlli completi.
    """
    user_id = request.current_user['user_id']

    # Validazione input base
    required_fields = ['ente_svolgimento_id', 'tipologia_id', 'data_inizio', 'descrizione']
    for field in required_fields:
        if not request.form.get(field, '').strip():
            error_msg = f'Il campo {field.replace("_", " ")} è obbligatorio.'
            flash(error_msg, 'error')
            return redirect(url_for('attivita.inserisci_attivita_form'))

    ente_svolgimento_id = int(request.form['ente_svolgimento_id'])

    # Verifica accesso all'ente
    accessible_entities = get_user_accessible_entities(user_id)
    if ente_svolgimento_id not in accessible_entities:
        error_msg = 'Non hai accesso all\'ente selezionato.'
        flash(error_msg, 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_CREATE_ATTIVITA',
            f'Tentativo creazione attività per ente {ente_svolgimento_id} non accessibile',
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
                error_msg = 'La data di fine non può essere precedente alla data di inizio.'
                flash(error_msg, 'error')
                return redirect(url_for('attivita.inserisci_attivita_form'))
        except ValueError:
            error_msg = 'Formato data non valido.'
            flash(error_msg, 'error')
            return redirect(url_for('attivita.inserisci_attivita_form'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Processa location
                partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id = \
                    process_location_ids(request.form.get('partenza_id'), request.form.get('destinazione_id'))

                # Inserisci attività
                cur.execute("""
                    INSERT INTO attivita (
                        ente_svolgimento_id, tipologia_id, data_inizio, data_fine, descrizione,
                        partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id,
                        personale_ufficiali, personale_sottufficiali, personale_graduati, personale_civili, 
                        note, operazione_id, esercitazione_id, creato_da, data_creazione
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
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
                    request.form.get('esercitazione_id') or None,
                    user_id
                ))
                new_id = cur.fetchone()['id']

                # Salva dettagli specifici per tipologia
                cur.execute('SELECT nome FROM tipologie_attivita WHERE id = %s', (request.form['tipologia_id'],))
                tipologia_result = cur.fetchone()
                if tipologia_result:
                    save_activity_details(conn, new_id, tipologia_result['nome'], request.form)

        # Log successo
        log_user_action(
            user_id,
            'CREATE_ATTIVITA',
            f'Creata attività ID {new_id} per ente {ente_svolgimento_id}',
            'attivita',
            new_id
        )

        flash('Attività creata con successo.', 'success')
        return redirect(url_for('attivita.visualizza_attivita', id=new_id))

    except Exception as e:
        error_msg = f'Errore durante il salvataggio: {str(e)}'
        flash(error_msg, 'error')
        log_user_action(
            user_id,
            'CREATE_ATTIVITA_ERROR',
            f'Errore creazione attività: {str(e)}',
            'attivita',
            result='FAILED'
        )
        
        return redirect(url_for('attivita.inserisci_attivita_form'))
    finally:
        conn.close()

@attivita_bp.route('/attivita/<int:id>')
@permission_required('VIEW_ATTIVITA')
def visualizza_attivita(id):
    """
    Visualizza singola attività con controllo accesso.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica accesso
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        error_msg = 'Attività non trovata o non accessibile.'
        flash(error_msg, 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_VIEW_ATTIVITA',
            f'Tentativo visualizzazione attività {id} non accessibile',
            'attivita',
            id,
            result='FAILED'
        )
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query completa per recuperare tutti i dettagli
                query = """
                    SELECT
                        a.*,
                        em.nome as ente_nome, em.codice as ente_codice,
                        ta.nome as tipologia_nome,
                        op.nome_missione as operazione_nome, op.nome_breve as operazione_breve,
                        e.nome as esercitazione_nome, e.nome_breve as esercitazione_breve, e.anno as esercitazione_anno,
                        u_creato.username as creato_da_username, u_creato.nome as creato_da_nome,
                        u_modificato.username as modificato_da_username, u_modificato.nome as modificato_da_nome
                    FROM attivita a
                    JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                    JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                    LEFT JOIN operazioni op ON a.operazione_id = op.id
                    LEFT JOIN esercitazioni e ON a.esercitazione_id = e.id
                    LEFT JOIN utenti u_creato ON a.creato_da = u_creato.id
                    LEFT JOIN utenti u_modificato ON a.modificato_da = u_modificato.id
                    WHERE a.id = %s
                """
                cur.execute(query, (id,))
                attivita_completa = cur.fetchone()
                
                if not attivita_completa:
                    flash('Attività non trovata.', 'error')
                    return redirect(url_for('attivita.lista_attivita'))

                # Recupera nomi location
                partenza = get_location_name(conn, attivita_completa['partenza_militare_id'],
                                             attivita_completa['partenza_civile_id'])
                destinazione = get_location_name(conn, attivita_completa['destinazione_militare_id'],
                                                 attivita_completa['destinazione_civile_id'])

                # Recupera dettagli specifici
                dettagli_specifici = get_activity_details(conn, id, attivita_completa['tipologia_nome'])

    except Exception as e:
        error_msg = f'Errore nel caricamento dell\'attività: {str(e)}'
        flash(error_msg, 'error')
        return redirect(url_for('attivita.lista_attivita'))
    finally:
        conn.close()

    # Log visualizzazione
    log_user_action(
        user_id,
        'VIEW_ATTIVITA',
        f'Visualizzata attività {id}',
        'attivita',
        id
    )
    
    # Determina i permessi dell'utente
    user_permissions = get_user_permissions(user_id)
    can_edit = 'EDIT_ATTIVITA' in user_permissions
    can_delete = 'DELETE_ATTIVITA' in user_permissions

    # Controlla se proviene dal drilldown
    from_drilldown = request.args.get('from') == 'drilldown'
    
    # Estrae parametri dello stato del drilldown
    drilldown_state = {}
    if from_drilldown:
        drilldown_state = {
            'level': request.args.get('level', '0'),
            'period': request.args.get('period', 'year'),
            'category': request.args.get('category', ''),
            'subcategory': request.args.get('subcategory', ''),
            'start_date': request.args.get('start_date', ''),
            'end_date': request.args.get('end_date', '')
        }

    return render_template(
        'attivita/visualizza_attivita.html',
        attivita=attivita_completa,
        partenza=partenza,
        destinazione=destinazione,
        dettagli_specifici=dettagli_specifici,
        can_edit=can_edit,
        can_delete=can_delete,
        today=date.today(),
        from_drilldown=from_drilldown,
        drilldown_state=drilldown_state
    )

@attivita_bp.route('/attivita/modifica/<int:id>')
@operatore_or_admin_required
@permission_required('EDIT_ATTIVITA')
def modifica_attivita_form(id):
    """
    Form modifica attività con controlli accesso.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica accesso di base
    basic_access = validate_activity_access(user_id, id, accessible_entities)
    if not basic_access:
        error_msg = 'Attività non trovata o non modificabile.'
        flash(error_msg, 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_EDIT_ATTIVITA',
            f'Tentativo modifica attività {id} non accessibile',
            'attivita',
            id,
            result='FAILED'
        )
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Recupera attività completa con tipologia_nome
                cur.execute('''
                    SELECT a.*, ta.nome AS tipologia_nome,
                           em_svolgimento.nome AS ente_svolgimento_nome,
                           em_partenza.nome AS partenza_militare_nome,
                           ec_partenza.nome AS partenza_civile_nome,
                           em_destinazione.nome AS destinazione_militare_nome,
                           ec_destinazione.nome AS destinazione_civile_nome,
                           o.nome_missione AS operazione_nome,
                           e.nome AS esercitazione_nome,
                           u_creato.username AS creato_da_nome,
                           u_modificato.username AS modificato_da_nome
                    FROM attivita a
                    JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                    LEFT JOIN enti_militari em_svolgimento ON a.ente_svolgimento_id = em_svolgimento.id
                    LEFT JOIN enti_militari em_partenza ON a.partenza_militare_id = em_partenza.id
                    LEFT JOIN enti_civili ec_partenza ON a.partenza_civile_id = ec_partenza.id
                    LEFT JOIN enti_militari em_destinazione ON a.destinazione_militare_id = em_destinazione.id
                    LEFT JOIN enti_civili ec_destinazione ON a.destinazione_civile_id = ec_destinazione.id
                    LEFT JOIN operazioni o ON a.operazione_id = o.id
                    LEFT JOIN esercitazioni e ON a.esercitazione_id = e.id
                    LEFT JOIN utenti u_creato ON a.creato_da = u_creato.id
                    LEFT JOIN utenti u_modificato ON a.modificato_da = u_modificato.id
                    WHERE a.id = %s
                ''', (id,))
                attivita = cur.fetchone()
                
                if not attivita:
                    error_msg = 'Attività non trovata.'
                    flash(error_msg, 'error')
                    return redirect(url_for('attivita.lista_attivita'))

            # Recupera dati per il form
            enti_militari, enti_civili = get_enti_form_data(conn, accessible_entities)

            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Operazioni
                cur.execute(
                    '''SELECT id, nome_missione, nome_breve, teatro_operativo, nazione
                       FROM operazioni 
                       ORDER BY nome_missione'''
                )
                operazioni = cur.fetchall()

                # Esercitazioni
                cur.execute(
                    '''SELECT id, nome, nome_breve, anno
                       FROM esercitazioni
                       ORDER BY anno DESC, nome ASC'''
                )
                esercitazioni = cur.fetchall()

                # Operazioni temporanee (non validate)
                cur.execute(
                    '''SELECT id, nome_missione, nome_breve, teatro_operativo, nazione
                       FROM operazioni_temp 
                       WHERE validato = FALSE
                       ORDER BY data_inserimento DESC'''
                )
                operazioni_temp = cur.fetchall()

                # Esercitazioni temporanee (non validate)
                cur.execute(
                    '''SELECT id, nome, nome_breve, anno
                       FROM esercitazioni_temp
                       WHERE validato = FALSE
                       ORDER BY data_inserimento DESC'''
                )
                esercitazioni_temp = cur.fetchall()

                tipologie_organizzate = get_tipologie_organizzate(conn)

                # Recupera tutti i dettagli specifici
                dettagli = {
                    'trasporti': None, 
                    'mantenimento': None, 
                    'rifornimenti': None, 
                    'getra': None,
                    'training_on_the_job': None,
                    'formazione': None,
                    'esercitazione': None,
                    'med_curativa': None,
                    'stratevac': None
                }
                
                cur.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = %s', (id,))
                dettagli['trasporti'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = %s', (id,))
                dettagli['mantenimento'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = %s', (id,))
                dettagli['rifornimenti'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_getra WHERE attivita_id = %s', (id,))
                dettagli['getra'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_training_on_the_job WHERE attivita_id = %s', (id,))
                dettagli['training_on_the_job'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_formazione WHERE attivita_id = %s', (id,))
                dettagli['formazione'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_esercitazione WHERE attivita_id = %s', (id,))
                dettagli['esercitazione'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_med_curativa WHERE attivita_id = %s', (id,))
                dettagli['med_curativa'] = cur.fetchone()
                
                cur.execute('SELECT * FROM dettagli_stratevac WHERE attivita_id = %s', (id,))
                dettagli_stratevac = cur.fetchone()
                # Per la modifica, manteniamo il valore originale "militare-id" per il form
                dettagli['stratevac'] = dettagli_stratevac

    except Exception as e:
        error_msg = f'Errore nel caricamento dei dati: {str(e)}'
        flash(error_msg, 'error')
        return redirect(url_for('attivita.visualizza_attivita', id=id))
    finally:
        conn.close()

    # Log accesso
    log_user_action(
        user_id,
        'ACCESS_EDIT_ATTIVITA_FORM',
        f'Accesso form modifica attività {id}',
        'attivita',
        id
    )

    return render_template(
        'modifica_attivita.html',
        attivita=attivita,
        dettagli_trasporti=dettagli['trasporti'] or {},
        dettagli_mantenimento=dettagli['mantenimento'] or {},
        dettagli_rifornimenti=dettagli['rifornimenti'] or {},
        dettagli_getra=dettagli['getra'] or {},
        dettagli_training_on_the_job=dettagli['training_on_the_job'] or {},
        dettagli_formazione=dettagli['formazione'] or {},
        dettagli_esercitazione=dettagli['esercitazione'] or {},
        dettagli_med_curativa=dettagli['med_curativa'] or {},
        dettagli_stratevac=dettagli['stratevac'] or {},
        enti_militari=enti_militari,
        enti_civili=enti_civili,
        operazioni=operazioni,
        esercitazioni=esercitazioni,
        operazioni_temp=operazioni_temp,
        esercitazioni_temp=esercitazioni_temp,
        tipologie=tipologie_organizzate
    )

@attivita_bp.route('/attivita/aggiorna/<int:id>', methods=['POST'])
@operatore_or_admin_required
@permission_required('EDIT_ATTIVITA')
def aggiorna_attivita(id):
    """
    Aggiorna attività esistente con controlli completi.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica accesso
    existing_activity = validate_activity_access(user_id, id, accessible_entities)
    if not existing_activity:
        error_msg = 'Attività non trovata o non modificabile.'
        flash(error_msg, 'error')
        log_user_action(
            user_id,
            'ACCESS_DENIED_UPDATE_ATTIVITA',
            f'Tentativo aggiornamento attività {id} non accessibile',
            'attivita',
            id,
            result='FAILED'
        )
        return redirect(url_for('attivita.lista_attivita'))

    # Validazione input
    required_fields = ['ente_svolgimento_id', 'tipologia_id', 'data_inizio', 'descrizione']
    for field in required_fields:
        if not request.form.get(field, '').strip():
            error_msg = f'Il campo {field.replace("_", " ")} è obbligatorio.'
            flash(error_msg, 'error')
            return redirect(url_for('attivita.modifica_attivita_form', id=id))

    ente_svolgimento_id = int(request.form['ente_svolgimento_id'])

    if ente_svolgimento_id not in accessible_entities:
        error_msg = 'Non hai accesso all\'ente selezionato.'
        flash(error_msg, 'error')
        return redirect(url_for('attivita.modifica_attivita_form', id=id))

    # Validazione date
    data_inizio = request.form['data_inizio']
    data_fine = request.form.get('data_fine')

    if data_fine:
        try:
            inizio = datetime.strptime(data_inizio, '%Y-%m-%d')
            fine = datetime.strptime(data_fine, '%Y-%m-%d')
            if fine < inizio:
                error_msg = 'La data di fine non può essere precedente alla data di inizio.'
                flash(error_msg, 'error')
                return redirect(url_for('attivita.modifica_attivita_form', id=id))
        except ValueError:
            error_msg = 'Formato data non valido.'
            flash(error_msg, 'error')
            return redirect(url_for('attivita.modifica_attivita_form', id=id))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor() as cur:
                # Processa location
                partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id = \
                    process_location_ids(request.form.get('partenza_id'), request.form.get('destinazione_id'))

                # Aggiorna attività
                cur.execute("""
                    UPDATE attivita SET
                        ente_svolgimento_id=%s, tipologia_id=%s, data_inizio=%s, data_fine=%s, descrizione=%s,
                        partenza_militare_id=%s, partenza_civile_id=%s, destinazione_militare_id=%s, destinazione_civile_id=%s,
                        personale_ufficiali=%s, personale_sottufficiali=%s, personale_graduati=%s, personale_civili=%s, 
                        note=%s, operazione_id=%s, esercitazione_id=%s, modificato_da=%s, data_modifica=NOW()
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
                    request.form.get('esercitazione_id') or None,
                    user_id,
                    id
                ))

                # Elimina dettagli esistenti
                for table in ['dettagli_trasporti', 'dettagli_mantenimento', 'dettagli_rifornimenti', 'dettagli_getra', 
                             'dettagli_training_on_the_job', 'dettagli_formazione', 'dettagli_esercitazione', 'dettagli_stratevac', 'dettagli_med_curativa']:
                    cur.execute(f'DELETE FROM {table} WHERE attivita_id = %s', (id,))

                # Inserisci nuovi dettagli
                with conn.cursor(cursor_factory=RealDictCursor) as cur2:
                    cur2.execute('SELECT nome FROM tipologie_attivita WHERE id = %s', (request.form['tipologia_id'],))
                    tipologia_result = cur2.fetchone()
                if tipologia_result:
                    save_activity_details(conn, id, tipologia_result['nome'], request.form)

        # Log successo
        log_user_action(
            user_id,
            'UPDATE_ATTIVITA',
            f'Aggiornata attività {id}',
            'attivita',
            id
        )

        flash('Attività aggiornata con successo.', 'success')
        return redirect(url_for('attivita.visualizza_attivita', id=id))

    except Exception as e:
        error_msg = f'Errore durante l\'aggiornamento: {str(e)}'
        flash(error_msg, 'error')
        log_user_action(
            user_id,
            'UPDATE_ATTIVITA_ERROR',
            f'Errore aggiornamento attività {id}: {str(e)}',
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
    """
    Elimina attività - Solo ADMIN.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica che l'attività esista
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        error_msg = 'Attività non trovata.'
        flash(error_msg, 'error')
        return redirect(url_for('attivita.lista_attivita'))

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Recupera info per il log
                cur.execute(
                    '''SELECT a.descrizione, em.nome as ente_nome 
                       FROM attivita a 
                       JOIN enti_militari em ON a.ente_svolgimento_id = em.id 
                       WHERE a.id = %s''',
                    (id,)
                )
                info_attivita = cur.fetchone()

                # Elimina dettagli correlati
                for table in ['dettagli_trasporti', 'dettagli_mantenimento', 'dettagli_rifornimenti', 'dettagli_getra',
                             'dettagli_training_on_the_job', 'dettagli_formazione', 'dettagli_esercitazione', 'dettagli_stratevac']:
                    cur.execute(f'DELETE FROM {table} WHERE attivita_id = %s', (id,))

                # Elimina attività principale
                cur.execute('DELETE FROM attivita WHERE id = %s', (id,))

        # Prepara info per il log
        descrizione = (info_attivita['descrizione'][:50] if info_attivita and info_attivita.get('descrizione') else f'ID {id}')
        ente_nome = info_attivita['ente_nome'] if info_attivita and info_attivita.get('ente_nome') else 'N/A'

        # Log eliminazione
        log_user_action(
            user_id,
            'DELETE_ATTIVITA',
            f'Eliminata attività "{descrizione}" dell\'ente {ente_nome}',
            'attivita',
            id
        )

        flash('Attività eliminata con successo.', 'success')

    except Exception as e:
        error_msg = f'Errore durante l\'eliminazione: {str(e)}'
        flash(error_msg, 'error')
        log_user_action(
            user_id,
            'DELETE_ATTIVITA_ERROR',
            f'Errore eliminazione attività {id}: {str(e)}',
            'attivita',
            id,
            result='FAILED'
        )
            
    finally:
        conn.close()

    return redirect(url_for('attivita.lista_attivita'))

# ===========================================
# API ROUTES
# ===========================================

@attivita_bp.route('/api/attivita/delete/<int:id>', methods=['DELETE'])
@admin_required
def api_elimina_attivita(id):
    """
    API per eliminare attività - Solo ADMIN.
    Restituisce JSON response per chiamate AJAX.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    # Verifica che l'attività esista
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        return jsonify({
            'success': False,
            'error': 'Attività non trovata.'
        }), 404

    conn = get_db_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Ottieni info attività per il log
                cur.execute('''
                    SELECT a.descrizione, em.nome as ente_nome
                    FROM attivita a
                    LEFT JOIN enti_militari em ON em.id = a.ente_svolgimento_id
                    WHERE a.id = %s
                ''', (id,))
                info_attivita = cur.fetchone()

                # Elimina prima i dettagli collegati
                cur.execute('DELETE FROM dettagli_medicina_curativa WHERE attivita_id = %s', (id,))
                cur.execute('DELETE FROM dettagli_getra WHERE attivita_id = %s', (id,))
                cur.execute('DELETE FROM dettagli_stratevac WHERE attivita_id = %s', (id,))

                # Elimina attività principale
                cur.execute('DELETE FROM attivita WHERE id = %s', (id,))

        # Prepara info per il log
        descrizione = (info_attivita['descrizione'][:50] if info_attivita and info_attivita.get('descrizione') else f'ID {id}')
        ente_nome = info_attivita['ente_nome'] if info_attivita and info_attivita.get('ente_nome') else 'N/A'

        # Log eliminazione
        log_user_action(
            user_id,
            'DELETE_ATTIVITA',
            f'Eliminata attività "{descrizione}" dell\'ente {ente_nome}',
            'attivita',
            id
        )

        return jsonify({
            'success': True,
            'message': 'Attività eliminata con successo.'
        })

    except Exception as e:
        error_msg = f'Errore durante l\'eliminazione: {str(e)}'
        log_user_action(
            user_id,
            'DELETE_ATTIVITA_ERROR',
            f'Errore eliminazione attività {id}: {str(e)}',
            'attivita',
            id,
            result='FAILED'
        )
        
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500
            
    finally:
        conn.close()

# ===========================================
# ROUTE AGGIUNTIVE E UTILITÀ
# ===========================================

@attivita_bp.route('/attivita/export')
@permission_required('VIEW_ATTIVITA')
def export_attivita():
    """
    Esporta attività in formato CSV.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    if not accessible_entities:
        flash('Nessuna attività accessibile per l\'export.', 'warning')
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
            a['operazione_nome'] or 'NAZIONALE', a['personale_ufficiali'],
            a['personale_sottufficiali'], a['personale_graduati'],
            a['personale_civili'], a['note'], a['data_creazione']
        ])

    # Log export
    log_user_action(
        user_id,
        'EXPORT_ATTIVITA',
        f'Esportate {len(attivita_export)} attività in CSV',
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
    """
    Statistiche attività per l'utente corrente.
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)

    if not accessible_entities:
        flash('Nessuna attività accessibile per le statistiche.', 'warning')
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

                # Attività per ente
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

                # Attività per tipologia
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

                # Attività per mese (ultimi 12 mesi)
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
        error_msg = f'Errore nel caricamento delle statistiche: {str(e)}'
        flash(error_msg, 'error')
        stats_generali, stats_per_ente, stats_per_tipologia, stats_per_mese = None, [], [], []
            
    finally:
        conn.close()

    # Log visualizzazione statistiche
    log_user_action(
        user_id,
        'VIEW_ATTIVITA_STATS',
        'Visualizzate statistiche attività',
        'attivita'
    )

    return render_template(
        'statistiche_attivita.html',
        stats_generali=stats_generali,
        stats_per_ente=stats_per_ente,
        stats_per_tipologia=stats_per_tipologia,
        stats_per_mese=stats_per_mese
    )