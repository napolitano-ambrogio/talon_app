from flask import Blueprint, render_template, request, redirect, url_for, flash
import sqlite3
import os
from datetime import datetime

# ===========================================
# CONFIGURAZIONE DATABASE OTTIMIZZATA
# ===========================================

def get_database_path():
    """Trova il percorso corretto del database"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Possibili percorsi del database
    possible_paths = [
        os.path.join(base_dir, 'talon_data.db'),
        os.path.join(os.path.dirname(base_dir), 'talon_data.db'),
        os.path.join(base_dir, '..', 'talon_data.db'),
        'talon_data.db'
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return os.path.abspath(path)
    
    # Se non trovato, usa il primo percorso come default
    return possible_paths[0]

DATABASE_PATH = get_database_path()

def get_db_connection():
    """Connessione al database ottimizzata"""
    if not os.path.exists(DATABASE_PATH):
        raise FileNotFoundError(f"Database non trovato: {DATABASE_PATH}")
    
    conn = sqlite3.connect(DATABASE_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    # Ottimizzazioni SQLite
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn

# ===========================================
# IMPORT AUTENTICAZIONE OTTIMIZZATA
# ===========================================

from auth import (
    login_required, permission_required, entity_access_required,
    admin_required, operatore_or_admin_required,
    get_user_accessible_entities, log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)

attivita_bp = Blueprint('attivita', __name__, template_folder='../templates')

# ===========================================
# FUNZIONI HELPER
# ===========================================

def get_location_name(conn, militare_id, civile_id):
    """Recupera il nome di una location (militare o civile)"""
    if militare_id:
        result = conn.execute('SELECT nome FROM enti_militari WHERE id = ?', (militare_id,)).fetchone()
        return result['nome'] if result else None
    if civile_id:
        result = conn.execute('SELECT nome FROM enti_civili WHERE id = ?', (civile_id,)).fetchone()
        return result['nome'] if result else None
    return None

def validate_activity_access(user_id, activity_id, accessible_entities):
    """Valida che l'utente abbia accesso all'attività"""
    if not accessible_entities:
        return None
    
    conn = get_db_connection()
    try:
        placeholders = ','.join(['?' for _ in accessible_entities])
        activity = conn.execute(
            f'SELECT * FROM attivita WHERE id = ? AND ente_svolgimento_id IN ({placeholders})',
            [activity_id] + accessible_entities
        ).fetchone()
        return activity
    except sqlite3.OperationalError:
        return None
    finally:
        conn.close()

def get_tipologie_organizzate(conn):
    """Recupera tipologie attività organizzate per categoria"""
    try:
        categorie = conn.execute(
            'SELECT * FROM tipologie_attivita WHERE parent_id IS NULL ORDER BY nome'
        ).fetchall()
        
        tipologie_organizzate = {}
        for cat in categorie:
            sottocategorie = conn.execute(
                'SELECT * FROM tipologie_attivita WHERE parent_id = ? ORDER BY nome', 
                (cat['id'],)
            ).fetchall()
            tipologie_organizzate[cat['nome']] = sottocategorie
        
        return tipologie_organizzate
    except sqlite3.OperationalError:
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
    """Salva i dettagli specifici dell'attività basati sulla tipologia"""
    try:
        if tipologia_nome == 'MOVIMENTI E TRASPORTI':
            conn.execute("""
                INSERT INTO dettagli_trasporti (
                    attivita_id, tipologia_carico, quantita, unita_di_misura, mezzo_impiegato
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                activity_id,
                form_data.get('tipologia_carico', '').upper(),
                form_data.get('quantita') or None,
                form_data.get('unita_di_misura', '').upper(),
                form_data.get('mezzo_impiegato', '').upper()
            ))
        
        elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
            conn.execute("""
                INSERT INTO dettagli_mantenimento (
                    attivita_id, tipo_intervento, attivita_svolta, piattaforma_materiale
                ) VALUES (?, ?, ?, ?)
            """, (
                activity_id,
                form_data.get('tipo_intervento'),
                form_data.get('attivita_svolta'),
                form_data.get('piattaforma_materiale', '').upper()
            ))
        
        elif tipologia_nome == 'RIFORNIMENTI':
            conn.execute("""
                INSERT INTO dettagli_rifornimenti (
                    attivita_id, tipologia_rifornimento, dettaglio_materiale, quantita, unita_di_misura
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                activity_id,
                form_data.get('tipologia_rifornimento'),
                form_data.get('dettaglio_materiale', '').upper(),
                form_data.get('quantita_rifornimento') or None,
                form_data.get('unita_di_misura_rifornimento', '').upper()
            ))
        
        elif tipologia_nome == 'GESTIONE TRANSITO':
            conn.execute("""
                INSERT INTO dettagli_getra (
                    attivita_id, tipo_vettore, seriale_vettore,
                    numero_personale, numero_mezzi, volume, unita_di_misura
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                activity_id,
                form_data.get('tipo_vettore', '').upper(),
                form_data.get('seriale_vettore', '').upper(),
                form_data.get('numero_personale') or None,
                form_data.get('numero_mezzi') or None,
                form_data.get('volume') or None,
                form_data.get('unita_di_misura_getra', '').upper()
            ))
    except sqlite3.OperationalError as e:
        # Se le tabelle dettagli non esistono, continua senza errore
        pass

def get_activity_details(conn, activity_id, tipologia_nome):
    """Recupera i dettagli specifici dell'attività"""
    details = {}
    try:
        if tipologia_nome == 'MOVIMENTI E TRASPORTI':
            details = conn.execute(
                'SELECT * FROM dettagli_trasporti WHERE attivita_id = ?', (activity_id,)
            ).fetchone()
        elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
            details = conn.execute(
                'SELECT * FROM dettagli_mantenimento WHERE attivita_id = ?', (activity_id,)
            ).fetchone()
        elif tipologia_nome == 'RIFORNIMENTI':
            details = conn.execute(
                'SELECT * FROM dettagli_rifornimenti WHERE attivita_id = ?', (activity_id,)
            ).fetchone()
        elif tipologia_nome == 'GESTIONE TRANSITO':
            details = conn.execute(
                'SELECT * FROM dettagli_getra WHERE attivita_id = ?', (activity_id,)
            ).fetchone()
    except sqlite3.OperationalError:
        pass
    
    return details

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@attivita_bp.route('/attivita')
@permission_required('VIEW_ATTIVITA')
def lista_attivita():
    """Lista attività filtrata per cono d'ombra dell'utente"""
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
        if accessible_entities:
            # Query base con filtri
            base_query = """
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
                WHERE a.ente_svolgimento_id IN ({})
            """.format(','.join(['?' for _ in accessible_entities]))
            
            params = accessible_entities.copy()
            
            # Applica filtri
            if search:
                base_query += " AND (a.descrizione LIKE ? OR em.nome LIKE ? OR ta.nome LIKE ?)"
                search_param = f'%{search.upper()}%'
                params.extend([search_param, search_param, search_param])
            
            if ente_filter:
                base_query += " AND a.ente_svolgimento_id = ?"
                params.append(int(ente_filter))
            
            if data_from:
                base_query += " AND a.data_inizio >= ?"
                params.append(data_from)
            
            if data_to:
                base_query += " AND a.data_inizio <= ?"
                params.append(data_to)
            
            base_query += " ORDER BY a.data_inizio DESC, a.id DESC"
            
            attivita_list = conn.execute(base_query, params).fetchall()
            
            # Lista enti per filtro (solo quelli accessibili)
            placeholders = ','.join(['?' for _ in accessible_entities])
            enti_per_filtro = conn.execute(
                f'SELECT id, nome FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
                accessible_entities
            ).fetchall()
        else:
            attivita_list = []
            enti_per_filtro = []
        
    except sqlite3.OperationalError as e:
        flash(f'Errore nel caricamento delle attività: {str(e)}', 'error')
        attivita_list = []
        enti_per_filtro = []
    finally:
        conn.close()
    
    # Log dell'accesso
    log_user_action(
        user_id, 
        'VIEW_ATTIVITA_LIST', 
        f'Visualizzate {len(attivita_list)} attività - Filtri: search={search}, ente={ente_filter}',
        'attivita',
        ip_address=request.remote_addr
    )
    
    return render_template('lista_attivita.html', 
                         attivita_list=attivita_list,
                         enti_per_filtro=enti_per_filtro,
                         filtri={
                             'search': search,
                             'ente_filter': ente_filter,
                             'data_from': data_from,
                             'data_to': data_to
                         },
                         user_role=user_role)

@attivita_bp.route('/inserisci_attivita')
@operatore_or_admin_required
@permission_required('CREATE_ATTIVITA')
def inserisci_attivita_form():
    """Form inserimento attività - Solo enti accessibili"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    if not accessible_entities:
        flash('Non hai accesso a nessun ente per creare attività.', 'warning')
        return redirect(url_for('attivita.lista_attivita'))
    
    conn = get_db_connection()
    
    try:
        # Enti militari accessibili
        placeholders = ','.join(['?' for _ in accessible_entities])
        enti_militari = conn.execute(
            f'SELECT id, nome, codice FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
            accessible_entities
        ).fetchall()
        
        # Enti civili - tutti visibili per ora
        enti_civili = conn.execute('SELECT id, nome FROM enti_civili ORDER BY nome').fetchall()
        
        # Operazioni attive
        operazioni = conn.execute(
            '''SELECT id, nome_missione, nome_breve 
               FROM operazioni 
               WHERE data_fine IS NULL OR data_fine >= date('now')
               ORDER BY nome_missione'''
        ).fetchall()
        
        # Tipologie organizzate
        tipologie_organizzate = get_tipologie_organizzate(conn)
        
    except sqlite3.OperationalError as e:
        flash(f'Errore nel caricamento dei dati del form: {str(e)}', 'error')
        enti_militari = []
        enti_civili = []
        operazioni = []
        tipologie_organizzate = {}
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
    """Salva nuova attività con controlli completi"""
    user_id = request.current_user['user_id']
    
    # Validazione input base
    required_fields = ['ente_svolgimento_id', 'tipologia_id', 'data_inizio', 'descrizione']
    for field in required_fields:
        if not request.form.get(field, '').strip():
            flash(f'Il campo {field.replace("_", " ")} è obbligatorio.', 'error')
            return redirect(url_for('attivita.inserisci_attivita_form'))
    
    ente_svolgimento_id = int(request.form['ente_svolgimento_id'])
    
    # Verifica accesso all'ente
    accessible_entities = get_user_accessible_entities(user_id)
    if ente_svolgimento_id not in accessible_entities:
        flash('Non hai accesso all\'ente selezionato.', 'error')
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
                flash('La data di fine non può essere precedente alla data di inizio.', 'error')
                return redirect(url_for('attivita.inserisci_attivita_form'))
        except ValueError:
            flash('Formato data non valido.', 'error')
            return redirect(url_for('attivita.inserisci_attivita_form'))
    
    conn = get_db_connection()
    
    try:
        # Processa location
        partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id = \
            process_location_ids(request.form.get('partenza_id'), request.form.get('destinazione_id'))
        
        # Inserisci attività
        cursor = conn.execute("""
            INSERT INTO attivita (
                ente_svolgimento_id, tipologia_id, data_inizio, data_fine, descrizione,
                partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id,
                personale_ufficiali, personale_sottufficiali, personale_graduati, personale_civili, 
                note, operazione_id, creato_da, data_creazione
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            ente_svolgimento_id, 
            request.form['tipologia_id'],
            data_inizio, 
            data_fine or None,
            request.form['descrizione'].upper().strip(),
            partenza_militare_id, partenza_civile_id,
            destinazione_militare_id, destinazione_civile_id,
            request.form.get('personale_ufficiali', 0) or 0, 
            request.form.get('personale_sottufficiali', 0) or 0,
            request.form.get('personale_graduati', 0) or 0, 
            request.form.get('personale_civili', 0) or 0,
            request.form.get('note', '').upper().strip(),
            request.form.get('operazione_id') or None,
            user_id
        ))
        
        attivita_id = cursor.lastrowid
        
        # Salva dettagli specifici per tipologia
        tipologia_result = conn.execute(
            'SELECT nome FROM tipologie_attivita WHERE id = ?', 
            (request.form['tipologia_id'],)
        ).fetchone()
        
        if tipologia_result:
            save_activity_details(conn, attivita_id, tipologia_result['nome'], request.form)
        
        conn.commit()
        
        log_user_action(
            user_id, 
            'CREATE_ATTIVITA', 
            f'Creata attività ID {attivita_id} per ente {ente_svolgimento_id}',
            'attivita',
            attivita_id
        )
        
        flash('Attività creata con successo.', 'success')
        return redirect(url_for('attivita.visualizza_attivita', id=attivita_id))
        
    except sqlite3.Error as e:
        conn.rollback()
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
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
    """Visualizza singola attività con controllo accesso"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    # Verifica accesso
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        flash('Attività non trovata o non accessibile.', 'error')
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
        # Query completa con join
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
            WHERE a.id = ?
        """
        
        attivita_completa = conn.execute(query, (id,)).fetchone()
        
        if not attivita_completa:
            conn.close()
            flash('Attività non trovata.', 'error')
            return redirect(url_for('attivita.lista_attivita'))
        
        # Recupera nomi location
        partenza = get_location_name(conn, attivita_completa['partenza_militare_id'], 
                                   attivita_completa['partenza_civile_id'])
        destinazione = get_location_name(conn, attivita_completa['destinazione_militare_id'], 
                                       attivita_completa['destinazione_civile_id'])
        
        # Recupera dettagli specifici
        dettagli_specifici = get_activity_details(conn, id, attivita_completa['tipologia_nome'])
        
    except sqlite3.OperationalError as e:
        flash(f'Errore nel caricamento dell\'attività: {str(e)}', 'error')
        return redirect(url_for('attivita.lista_attivita'))
    finally:
        conn.close()
    
    log_user_action(
        user_id, 
        'VIEW_ATTIVITA', 
        f'Visualizzata attività {id}',
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
    """Form modifica attività con controlli accesso"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    # Verifica accesso
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        flash('Attività non trovata o non modificabile.', 'error')
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
        # Carica dati per il form
        placeholders = ','.join(['?' for _ in accessible_entities])
        enti_militari = conn.execute(
            f'SELECT id, nome, codice FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
            accessible_entities
        ).fetchall()
        
        enti_civili = conn.execute('SELECT id, nome FROM enti_civili ORDER BY nome').fetchall()
        
        operazioni = conn.execute(
            'SELECT id, nome_missione, nome_breve FROM operazioni ORDER BY nome_missione'
        ).fetchall()
        
        tipologie_organizzate = get_tipologie_organizzate(conn)
        
        # Carica tutti i dettagli esistenti
        dettagli = {
            'trasporti': conn.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = ?', (id,)).fetchone(),
            'mantenimento': conn.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = ?', (id,)).fetchone(),
            'rifornimenti': conn.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = ?', (id,)).fetchone(),
            'getra': conn.execute('SELECT * FROM dettagli_getra WHERE attivita_id = ?', (id,)).fetchone()
        }
        
    except sqlite3.OperationalError as e:
        flash(f'Errore nel caricamento dei dati: {str(e)}', 'error')
        return redirect(url_for('attivita.visualizza_attivita', id=id))
    finally:
        conn.close()
    
    log_user_action(
        user_id, 
        'ACCESS_EDIT_ATTIVITA_FORM', 
        f'Accesso form modifica attività {id}',
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
    """Aggiorna attività esistente con controlli completi"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    # Verifica accesso
    existing_activity = validate_activity_access(user_id, id, accessible_entities)
    if not existing_activity:
        flash('Attività non trovata o non modificabile.', 'error')
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
            flash(f'Il campo {field.replace("_", " ")} è obbligatorio.', 'error')
            return redirect(url_for('attivita.modifica_attivita_form', id=id))
    
    ente_svolgimento_id = int(request.form['ente_svolgimento_id'])
    
    # Verifica accesso al nuovo ente (se cambiato)
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
                flash('La data di fine non può essere precedente alla data di inizio.', 'error')
                return redirect(url_for('attivita.modifica_attivita_form', id=id))
        except ValueError:
            flash('Formato data non valido.', 'error')
            return redirect(url_for('attivita.modifica_attivita_form', id=id))
    
    conn = get_db_connection()
    
    try:
        # Processa location
        partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id = \
            process_location_ids(request.form.get('partenza_id'), request.form.get('destinazione_id'))
        
        # Aggiorna attività
        conn.execute("""
            UPDATE attivita SET
                ente_svolgimento_id=?, tipologia_id=?, data_inizio=?, data_fine=?, descrizione=?,
                partenza_militare_id=?, partenza_civile_id=?, destinazione_militare_id=?, destinazione_civile_id=?,
                personale_ufficiali=?, personale_sottufficiali=?, personale_graduati=?, personale_civili=?, 
                note=?, operazione_id=?, modificato_da=?, data_modifica=datetime('now')
            WHERE id = ?
        """, (
            ente_svolgimento_id, request.form['tipologia_id'],
            data_inizio, data_fine or None,
            request.form['descrizione'].upper().strip(),
            partenza_militare_id, partenza_civile_id,
            destinazione_militare_id, destinazione_civile_id,
            request.form.get('personale_ufficiali', 0) or 0, 
            request.form.get('personale_sottufficiali', 0) or 0,
            request.form.get('personale_graduati', 0) or 0, 
            request.form.get('personale_civili', 0) or 0,
            request.form.get('note', '').upper().strip(),
            request.form.get('operazione_id') or None,
            user_id,
            id
        ))
        
        # Gestione dettagli per tipologia - elimina quelli esistenti
        detail_tables = ['dettagli_trasporti', 'dettagli_mantenimento', 'dettagli_rifornimenti', 'dettagli_getra']
        for table in detail_tables:
            try:
                conn.execute(f'DELETE FROM {table} WHERE attivita_id = ?', (id,))
            except sqlite3.OperationalError:
                pass  # Tabella non esiste
        
        # Inserisci nuovi dettagli
        tipologia_result = conn.execute(
            'SELECT nome FROM tipologie_attivita WHERE id = ?', 
            (request.form['tipologia_id'],)
        ).fetchone()
        
        if tipologia_result:
            save_activity_details(conn, id, tipologia_result['nome'], request.form)
        
        conn.commit()
        
        log_user_action(
            user_id, 
            'UPDATE_ATTIVITA', 
            f'Aggiornata attività {id}',
            'attivita',
            id
        )
        
        flash('Attività aggiornata con successo.', 'success')
        return redirect(url_for('attivita.visualizza_attivita', id=id))
        
    except sqlite3.Error as e:
        conn.rollback()
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
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
    """Elimina attività - Solo ADMIN"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    # Anche se è admin, verifica che l'attività esista
    attivita = validate_activity_access(user_id, id, accessible_entities)
    if not attivita:
        flash('Attività non trovata.', 'error')
        return redirect(url_for('attivita.lista_attivita'))
    
    conn = get_db_connection()
    
    try:
        # Recupera info attività per il log
        info_attivita = conn.execute(
            '''SELECT a.descrizione, em.nome as ente_nome 
               FROM attivita a 
               JOIN enti_militari em ON a.ente_svolgimento_id = em.id 
               WHERE a.id = ?''', 
            (id,)
        ).fetchone()
        
        # Elimina dettagli (se esistono)
        detail_tables = ['dettagli_trasporti', 'dettagli_mantenimento', 'dettagli_rifornimenti', 'dettagli_getra']
        for table in detail_tables:
            try:
                conn.execute(f'DELETE FROM {table} WHERE attivita_id = ?', (id,))
            except sqlite3.OperationalError:
                pass
        
        # Elimina attività
        conn.execute('DELETE FROM attivita WHERE id = ?', (id,))
        conn.commit()
        
        descrizione = info_attivita['descrizione'][:50] if info_attivita else f'ID {id}'
        ente_nome = info_attivita['ente_nome'] if info_attivita else 'N/A'
        
        log_user_action(
            user_id, 
            'DELETE_ATTIVITA', 
            f'Eliminata attività "{descrizione}" dell\'ente {ente_nome}',
            'attivita',
            id
        )
        
        flash('Attività eliminata con successo.', 'success')
        
    except sqlite3.Error as e:
        conn.rollback()
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
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
# ROUTE AGGIUNTIVE E UTILITÀ
# ===========================================

@attivita_bp.route('/attivita/export')
@permission_required('VIEW_ATTIVITA')
def export_attivita():
    """Esporta attività in formato CSV"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    if not accessible_entities:
        flash('Nessuna attività accessibile per l\'export.', 'warning')
        return redirect(url_for('attivita.lista_attivita'))
    
    conn = get_db_connection()
    
    try:
        placeholders = ','.join(['?' for _ in accessible_entities])
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
        
        attivita_export = conn.execute(query, accessible_entities).fetchall()
        
    except sqlite3.OperationalError as e:
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
    for attivita in attivita_export:
        writer.writerow([
            attivita['id'], attivita['data_inizio'], attivita['data_fine'],
            attivita['descrizione'], attivita['ente_nome'], attivita['tipologia_nome'],
            attivita['operazione_nome'] or '', attivita['personale_ufficiali'],
            attivita['personale_sottufficiali'], attivita['personale_graduati'],
            attivita['personale_civili'], attivita['note'], attivita['data_creazione']
        ])
    
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
    """Statistiche attività per l'utente corrente"""
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    if not accessible_entities:
        flash('Nessuna attività accessibile per le statistiche.', 'warning')
        return redirect(url_for('attivita.lista_attivita'))
    
    conn = get_db_connection()
    
    try:
        placeholders = ','.join(['?' for _ in accessible_entities])
        
        # Statistiche generali
        stats_generali = conn.execute(f"""
            SELECT 
                COUNT(*) as totale_attivita,
                COUNT(CASE WHEN data_fine IS NULL OR data_fine >= date('now') THEN 1 END) as attivita_attive,
                COUNT(CASE WHEN data_fine < date('now') THEN 1 END) as attivita_concluse,
                SUM(personale_ufficiali + personale_sottufficiali + personale_graduati + personale_civili) as totale_personale
            FROM attivita a
            WHERE a.ente_svolgimento_id IN ({placeholders})
        """, accessible_entities).fetchone()
        
        # Attività per ente
        stats_per_ente = conn.execute(f"""
            SELECT 
                em.nome as ente_nome,
                COUNT(*) as numero_attivita,
                SUM(personale_ufficiali + personale_sottufficiali + personale_graduati + personale_civili) as personale_totale
            FROM attivita a
            JOIN enti_militari em ON a.ente_svolgimento_id = em.id
            WHERE a.ente_svolgimento_id IN ({placeholders})
            GROUP BY em.id, em.nome
            ORDER BY numero_attivita DESC
        """, accessible_entities).fetchall()
        
        # Attività per tipologia
        stats_per_tipologia = conn.execute(f"""
            SELECT 
                ta.nome as tipologia_nome,
                COUNT(*) as numero_attivita
            FROM attivita a
            JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
            WHERE a.ente_svolgimento_id IN ({placeholders})
            GROUP BY ta.id, ta.nome
            ORDER BY numero_attivita DESC
        """, accessible_entities).fetchall()
        
        # Attività per mese (ultimi 12 mesi)
        stats_per_mese = conn.execute(f"""
            SELECT 
                strftime('%Y-%m', data_inizio) as mese,
                COUNT(*) as numero_attivita
            FROM attivita a
            WHERE a.ente_svolgimento_id IN ({placeholders})
            AND data_inizio >= date('now', '-12 months')
            GROUP BY strftime('%Y-%m', data_inizio)
            ORDER BY mese DESC
        """, accessible_entities).fetchall()
        
    except sqlite3.OperationalError as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        stats_generali = None
        stats_per_ente = []
        stats_per_tipologia = []
        stats_per_mese = []
    finally:
        conn.close()
    
    log_user_action(
        user_id, 
        'VIEW_ATTIVITA_STATS', 
        'Visualizzate statistiche attività',
        'attivita'
    )
    
    return render_template('statistiche_attivita.html',
                         stats_generali=stats_generali,
                         stats_per_ente=stats_per_ente,
                         stats_per_tipologia=stats_per_tipologia,
                         stats_per_mese=stats_per_mese)

@attivita_bp.route('/api/attivita/tipologie/<int:categoria_id>')
@login_required
def api_tipologie_per_categoria(categoria_id):
    """API per recuperare tipologie per categoria (per form dinamici)"""
    conn = get_db_connection()
    
    try:
        tipologie = conn.execute(
            'SELECT id, nome FROM tipologie_attivita WHERE parent_id = ? ORDER BY nome',
            (categoria_id,)
        ).fetchall()
        
        return jsonify([{'id': t['id'], 'nome': t['nome']} for t in tipologie])
        
    except sqlite3.OperationalError:
        return jsonify([])
    finally:
        conn.close()

# ===========================================
# GESTIONE ERRORI SPECIFICHE
# ===========================================

@attivita_bp.errorhandler(sqlite3.OperationalError)
def handle_db_error(error):
    """Gestione errori database specifici per attività"""
    flash('Errore nel database delle attività. Contattare l\'amministratore.', 'error')
    return redirect(url_for('attivita.lista_attivita'))

@attivita_bp.errorhandler(ValueError)
def handle_value_error(error):
    """Gestione errori di validazione"""
    flash('Dati non validi forniti.', 'error')
    return redirect(url_for('attivita.lista_attivita'))