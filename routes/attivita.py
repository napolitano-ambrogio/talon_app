from flask import Blueprint, render_template, request, redirect, url_for, jsonify
import sqlite3
import os

# ===========================================
# CONFIGURAZIONE DATABASE (ALLINEATA CON AUTH.PY)
# ===========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'talon_data.db')

def get_db_connection():
    """Connessione al database - allineata con auth.py"""
    global DATABASE_PATH
    
    print(f"DEBUG attivita.py: Connessione a {DATABASE_PATH}")
    print(f"DEBUG attivita.py: File esiste: {os.path.exists(DATABASE_PATH)}")
    
    if not os.path.exists(DATABASE_PATH):
        # Prova nella directory padre
        parent_db = os.path.join(os.path.dirname(BASE_DIR), 'talon_data.db')
        if os.path.exists(parent_db):
            DATABASE_PATH = parent_db
            print(f"DEBUG attivita.py: Uso database in directory padre: {DATABASE_PATH}")
        else:
            raise FileNotFoundError(f"Database non trovato: {DATABASE_PATH}")
    
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ===========================================
# IMPORT AUTENTICAZIONE
# ===========================================
from auth import (
    login_required, 
    permission_required, 
    entity_access_required,
    get_user_accessible_entities,
    log_user_action,
    get_current_user_info
)

attivita_bp = Blueprint('attivita', __name__, template_folder='../templates')

# ===========================================
# ROUTE PROTETTE
# ===========================================

@attivita_bp.route('/attivita')
@permission_required('VIEW_ATTIVITA')  # 🔒 PROTEZIONE: Solo utenti con permesso VIEW_ATTIVITA
def lista_attivita():
    """
    Lista attività - Filtrata per cono d'ombra
    Solo le attività degli enti accessibili all'utente
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    print(f"DEBUG: User {user_id} ha accesso a enti: {accessible_entities}")
    
    conn = get_db_connection()
    
    try:
        if accessible_entities:
            # Filtra per enti accessibili
            placeholders = ','.join(['?' for _ in accessible_entities])
            query = f"""
                SELECT
                    a.id,
                    a.data_inizio,
                    a.descrizione,
                    em.nome AS ente_nome,
                    ta.nome AS tipologia_nome,
                    o.nome_missione AS operazione_nome
                FROM attivita a
                JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                LEFT JOIN operazioni o ON a.operazione_id = o.id
                WHERE a.ente_svolgimento_id IN ({placeholders})
                ORDER BY a.data_inizio DESC
            """
            attivita_list = conn.execute(query, accessible_entities).fetchall()
        else:
            # Nessun ente accessibile
            attivita_list = []
        
        print(f"DEBUG: Trovate {len(attivita_list)} attività")
        
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore SQL in lista_attivita: {e}")
        # Verifica se le tabelle esistono
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        print(f"DEBUG: Tabelle disponibili: {[table['name'] for table in tables]}")
        attivita_list = []
    
    conn.close()
    
    # Log dell'accesso
    try:
        log_user_action(
            user_id, 
            'VIEW_ATTIVITA_LIST', 
            f'Visualizzate {len(attivita_list)} attività',
            'attivita',
            ip_address=request.remote_addr
        )
    except Exception as e:
        print(f"DEBUG: Errore logging: {e}")
    
    return render_template('lista_attivita.html', attivita_list=attivita_list)

@attivita_bp.route('/inserisci_attivita')
@permission_required('CREATE_ATTIVITA')  # 🔒 PROTEZIONE: Solo utenti con permesso CREATE_ATTIVITA
def inserisci_attivita_form():
    """
    Form inserimento attività - Solo enti accessibili
    L'utente può creare attività solo per enti nel suo cono d'ombra
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    conn = get_db_connection()
    
    try:
        # Mostra solo enti accessibili per la creazione
        if accessible_entities:
            placeholders = ','.join(['?' for _ in accessible_entities])
            enti_militari = conn.execute(
                f'SELECT * FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
                accessible_entities
            ).fetchall()
        else:
            enti_militari = []
        
        # Enti civili - tutti visibili (potrebbe essere modificato in futuro)
        enti_civili = conn.execute('SELECT * FROM enti_civili ORDER BY nome').fetchall()
        
        # Operazioni - tutte visibili
        operazioni = conn.execute('SELECT * FROM operazioni ORDER BY nome_missione').fetchall()
        
        # Tipologie attività
        categorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id IS NULL ORDER BY nome').fetchall()
        tipologie_organizzate = {}
        for cat in categorie:
            sottocategorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id = ? ORDER BY nome', (cat['id'],)).fetchall()
            tipologie_organizzate[cat['nome']] = sottocategorie
        
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore SQL in inserisci_attivita_form: {e}")
        enti_militari = []
        enti_civili = []
        operazioni = []
        tipologie_organizzate = {}
    
    conn.close()
    
    # Log dell'accesso
    try:
        log_user_action(
            user_id, 
            'ACCESS_CREATE_ATTIVITA_FORM', 
            f'Accesso form con {len(enti_militari)} enti accessibili',
            ip_address=request.remote_addr
        )
    except Exception as e:
        print(f"DEBUG: Errore logging: {e}")
    
    return render_template('inserimento_attivita.html', 
                           enti_militari=enti_militari, 
                           enti_civili=enti_civili, 
                           operazioni=operazioni,
                           tipologie=tipologie_organizzate)

@attivita_bp.route('/salva_attivita', methods=['POST'])
@permission_required('CREATE_ATTIVITA')  # 🔒 PROTEZIONE: Permesso creazione
@entity_access_required('ente_svolgimento_id')  # 🔒 PROTEZIONE: Accesso all'ente
def salva_attivita():
    """
    Salva attività - Con controllo cono d'ombra
    L'utente può creare attività solo per enti accessibili
    """
    user_id = request.current_user['user_id']
    ente_svolgimento_id = request.form.get('ente_svolgimento_id')
    
    # Il decoratore @entity_access_required ha già verificato l'accesso all'ente
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Processa partenza e destinazione
        partenza_val = request.form.get('partenza_id')
        destinazione_val = request.form.get('destinazione_id')
        partenza_militare_id, partenza_civile_id = None, None
        destinazione_militare_id, destinazione_civile_id = None, None
        
        if partenza_val:
            tipo, p_id = partenza_val.split('-')
            if tipo == 'militare': 
                partenza_militare_id = int(p_id)
            elif tipo == 'civile': 
                partenza_civile_id = int(p_id)
                
        if destinazione_val:
            tipo, d_id = destinazione_val.split('-')
            if tipo == 'militare': 
                destinazione_militare_id = int(d_id)
            elif tipo == 'civile': 
                destinazione_civile_id = int(d_id)
        
        # Inserisci attività con tracking utente
        cursor.execute("""
            INSERT INTO attivita (
                ente_svolgimento_id, tipologia_id, data_inizio, data_fine, descrizione,
                partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id,
                personale_ufficiali, personale_sottufficiali, personale_graduati, personale_civili, 
                note, operazione_id, creato_da, data_creazione
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            ente_svolgimento_id, 
            request.form.get('tipologia_id'),
            request.form.get('data_inizio'), 
            request.form.get('data_fine') or None,
            request.form.get('descrizione', '').upper(),
            partenza_militare_id, partenza_civile_id,
            destinazione_militare_id, destinazione_civile_id,
            request.form.get('personale_ufficiali', 0), 
            request.form.get('personale_sottufficiali', 0),
            request.form.get('personale_graduati', 0), 
            request.form.get('personale_civili', 0),
            request.form.get('note', '').upper(),
            request.form.get('operazione_id') or None,
            user_id  # 🆕 TRACKING: Chi ha creato l'attività
        ))
        
        attivita_id = cursor.lastrowid
        
        # Gestione dettagli specifici per tipologia
        tipologia_id = request.form.get('tipologia_id')
        
        # Verifica se la tipologia esiste
        tipologia_result = conn.execute('SELECT nome FROM tipologie_attivita WHERE id = ?', (tipologia_id,)).fetchone()
        if tipologia_result:
            tipologia_nome = tipologia_result['nome']
            
            if tipologia_nome == 'MOVIMENTI E TRASPORTI':
                cursor.execute("""
                    INSERT INTO dettagli_trasporti (
                        attivita_id, tipologia_carico, quantita, unita_di_misura, mezzo_impiegato
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    attivita_id,
                    request.form.get('tipologia_carico', '').upper(),
                    request.form.get('quantita') or None,
                    request.form.get('unita_di_misura', '').upper(),
                    request.form.get('mezzo_impiegato', '').upper()
                ))
            elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
                cursor.execute("""
                    INSERT INTO dettagli_mantenimento (
                        attivita_id, tipo_intervento, attivita_svolta, piattaforma_materiale
                    ) VALUES (?, ?, ?, ?)
                """, (
                    attivita_id,
                    request.form.get('tipo_intervento'),
                    request.form.get('attivita_svolta'),
                    request.form.get('piattaforma_materiale', '').upper()
                ))
            elif tipologia_nome == 'RIFORNIMENTI':
                cursor.execute("""
                    INSERT INTO dettagli_rifornimenti (
                        attivita_id, tipologia_rifornimento, dettaglio_materiale, quantita, unita_di_misura
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    attivita_id,
                    request.form.get('tipologia_rifornimento'),
                    request.form.get('dettaglio_materiale', '').upper(),
                    request.form.get('quantita_rifornimento') or None,
                    request.form.get('unita_di_misura_rifornimento', '').upper()
                ))
            elif tipologia_nome == 'GESTIONE TRANSITO':
                cursor.execute("""
                    INSERT INTO dettagli_getra (
                        attivita_id, tipo_vettore, seriale_vettore,
                        numero_personale, numero_mezzi, volume, unita_di_misura
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    attivita_id,
                    request.form.get('tipo_vettore', '').upper(),
                    request.form.get('seriale_vettore', '').upper(),
                    request.form.get('numero_personale') or None,
                    request.form.get('numero_mezzi') or None,
                    request.form.get('volume') or None,
                    request.form.get('unita_di_misura_getra', '').upper()
                ))
        
        conn.commit()
        
        # Log successo creazione
        try:
            log_user_action(
                user_id, 
                'CREATE_ATTIVITA', 
                f'Creata attività ID {attivita_id} per ente {ente_svolgimento_id}',
                'attivita',
                attivita_id,
                request.remote_addr
            )
        except Exception as e:
            print(f"DEBUG: Errore logging: {e}")
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Errore durante il salvataggio dell'attività: {e}")
        
        # Log errore
        try:
            log_user_action(
                user_id, 
                'CREATE_ATTIVITA_ERROR', 
                f'Errore creazione attività: {str(e)}',
                'attivita',
                None,
                request.remote_addr,
                'FAILED'
            )
        except Exception as log_error:
            print(f"DEBUG: Errore logging: {log_error}")
        
        return "Errore nel salvataggio dei dati", 500
    finally:
        conn.close()
    
    return redirect(url_for('attivita.lista_attivita'))

@attivita_bp.route('/attivita/<int:id>')
@permission_required('VIEW_ATTIVITA')  # 🔒 PROTEZIONE: Permesso visualizzazione
def visualizza_attivita(id):
    """
    Visualizza singola attività - Con controllo accesso
    L'utente può vedere solo attività di enti accessibili
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    conn = get_db_connection()
    
    try:
        # Query con controllo accesso ente
        if accessible_entities:
            placeholders = ','.join(['?' for _ in accessible_entities])
            query_base = f"""
                SELECT
                    a.*,
                    em.nome as ente_nome,
                    ta.nome as tipologia_nome,
                    op.nome_missione as operazione_nome
                FROM attivita a
                JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
                LEFT JOIN operazioni op ON a.operazione_id = op.id
                WHERE a.id = ? AND a.ente_svolgimento_id IN ({placeholders})
            """
            params = [id] + accessible_entities
            attivita = conn.execute(query_base, params).fetchone()
        else:
            attivita = None
        
        if attivita is None: 
            conn.close()
            # Log tentativo accesso non autorizzato
            try:
                log_user_action(
                    user_id, 
                    'ACCESS_DENIED', 
                    f'Tentativo visualizzazione attività {id} non accessibile',
                    'attivita',
                    id,
                    request.remote_addr,
                    'FAILED'
                )
            except Exception as e:
                print(f"DEBUG: Errore logging: {e}")
            return "Attività non trovata o non accessibile!", 404
        
        # Funzione helper per nomi location
        def get_location_name(militare_id, civile_id):
            if militare_id:
                result = conn.execute('SELECT nome FROM enti_militari WHERE id = ?', (militare_id,)).fetchone()
                return result['nome'] if result else None
            if civile_id:
                result = conn.execute('SELECT nome FROM enti_civili WHERE id = ?', (civile_id,)).fetchone()
                return result['nome'] if result else None
            return None
        
        partenza = get_location_name(attivita['partenza_militare_id'], attivita['partenza_civile_id'])
        destinazione = get_location_name(attivita['destinazione_militare_id'], attivita['destinazione_civile_id'])
        
        # Recupera dettagli specifici
        dettagli_specifici = None
        if attivita['tipologia_nome'] == 'MOVIMENTI E TRASPORTI':
            dettagli_specifici = conn.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = ?', (id,)).fetchone()
        elif attivita['tipologia_nome'] == 'MANTENIMENTO E SQUADRE A CONTATTO':
            dettagli_specifici = conn.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = ?', (id,)).fetchone()
        elif attivita['tipologia_nome'] == 'RIFORNIMENTI':
            dettagli_specifici = conn.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = ?', (id,)).fetchone()
        elif attivita['tipologia_nome'] == 'GESTIONE TRANSITO':
            dettagli_specifici = conn.execute('SELECT * FROM dettagli_getra WHERE attivita_id = ?', (id,)).fetchone()

    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore SQL in visualizza_attivita: {e}")
        conn.close()
        return "Errore nel caricamento dei dati", 500

    conn.close()
    
    # Log visualizzazione
    try:
        log_user_action(
            user_id, 
            'VIEW_ATTIVITA', 
            f'Visualizzata attività {id}',
            'attivita',
            id,
            request.remote_addr
        )
    except Exception as e:
        print(f"DEBUG: Errore logging: {e}")
    
    return render_template('descrizione_attivita.html', 
                           attivita=attivita, 
                           partenza=partenza, 
                           destinazione=destinazione,
                           dettagli_specifici=dettagli_specifici)

@attivita_bp.route('/attivita/modifica/<int:id>')
@permission_required('EDIT_ATTIVITA')  # 🔒 PROTEZIONE: Permesso modifica
def modifica_attivita_form(id):
    """
    Form modifica attività - Con controlli accesso
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    conn = get_db_connection()
    
    try:
        # Verifica accesso all'attività
        if accessible_entities:
            placeholders = ','.join(['?' for _ in accessible_entities])
            attivita = conn.execute(
                f'SELECT * FROM attivita WHERE id = ? AND ente_svolgimento_id IN ({placeholders})',
                [id] + accessible_entities
            ).fetchone()
        else:
            attivita = None
        
        if attivita is None:
            conn.close()
            try:
                log_user_action(
                    user_id, 
                    'ACCESS_DENIED', 
                    f'Tentativo modifica attività {id} non accessibile',
                    'attivita',
                    id,
                    request.remote_addr,
                    'FAILED'
                )
            except Exception as e:
                print(f"DEBUG: Errore logging: {e}")
            return "Attività non trovata o non modificabile!", 404
        
        # Carica dati per il form (filtrati per accesso)
        if accessible_entities:
            placeholders = ','.join(['?' for _ in accessible_entities])
            enti_militari = conn.execute(
                f'SELECT * FROM enti_militari WHERE id IN ({placeholders}) ORDER BY nome',
                accessible_entities
            ).fetchall()
        else:
            enti_militari = []
        
        enti_civili = conn.execute('SELECT * FROM enti_civili ORDER BY nome').fetchall()
        operazioni = conn.execute('SELECT * FROM operazioni ORDER BY nome_missione').fetchall()
        
        categorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id IS NULL ORDER BY nome').fetchall()
        tipologie_organizzate = {}
        for cat in categorie:
            sottocategorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id = ? ORDER BY nome', (cat['id'],)).fetchall()
            tipologie_organizzate[cat['nome']] = sottocategorie
        
        # Carica dettagli esistenti
        dettagli_trasporti = conn.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = ?', (id,)).fetchone()
        dettagli_mantenimento = conn.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = ?', (id,)).fetchone()
        dettagli_rifornimenti = conn.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = ?', (id,)).fetchone()
        dettagli_getra = conn.execute('SELECT * FROM dettagli_getra WHERE attivita_id = ?', (id,)).fetchone()
        
    except sqlite3.OperationalError as e:
        print(f"DEBUG: Errore SQL in modifica_attivita_form: {e}")
        conn.close()
        return "Errore nel caricamento dei dati", 500
    
    conn.close()
    
    # Log accesso modifica
    try:
        log_user_action(
            user_id, 
            'ACCESS_EDIT_ATTIVITA_FORM', 
            f'Accesso form modifica attività {id}',
            'attivita',
            id,
            request.remote_addr
        )
    except Exception as e:
        print(f"DEBUG: Errore logging: {e}")
    
    return render_template('modifica_attivita.html',
                           attivita=attivita,
                           dettagli_trasporti=dettagli_trasporti or {},
                           dettagli_mantenimento=dettagli_mantenimento or {},
                           dettagli_rifornimenti=dettagli_rifornimenti or {},
                           dettagli_getra=dettagli_getra or {},
                           enti_militari=enti_militari,
                           enti_civili=enti_civili,
                           operazioni=operazioni,
                           tipologie=tipologie_organizzate)

@attivita_bp.route('/attivita/aggiorna/<int:id>', methods=['POST'])
@permission_required('EDIT_ATTIVITA')  # 🔒 PROTEZIONE: Permesso modifica
@entity_access_required('ente_svolgimento_id')  # 🔒 PROTEZIONE: Accesso ente
def aggiorna_attivita(id):
    """
    Aggiorna attività - Con controlli completi
    """
    user_id = request.current_user['user_id']
    
    # Verifica che l'attività esista e sia accessibile
    accessible_entities = get_user_accessible_entities(user_id)
    
    conn = get_db_connection()
    
    try:
        if accessible_entities:
            placeholders = ','.join(['?' for _ in accessible_entities])
            existing_activity = conn.execute(
                f'SELECT * FROM attivita WHERE id = ? AND ente_svolgimento_id IN ({placeholders})',
                [id] + accessible_entities
            ).fetchone()
        else:
            existing_activity = None
        
        if not existing_activity:
            conn.close()
            try:
                log_user_action(
                    user_id, 
                    'ACCESS_DENIED', 
                    f'Tentativo aggiornamento attività {id} non accessibile',
                    'attivita',
                    id,
                    request.remote_addr,
                    'FAILED'
                )
            except Exception as e:
                print(f"DEBUG: Errore logging: {e}")
            return "Attività non trovata o non modificabile!", 404
        
        # Processa partenza e destinazione
        partenza_val = request.form.get('partenza_id')
        destinazione_val = request.form.get('destinazione_id')
        partenza_militare_id, partenza_civile_id = None, None
        destinazione_militare_id, destinazione_civile_id = None, None
        
        if partenza_val:
            tipo, p_id = partenza_val.split('-')
            if tipo == 'militare': partenza_militare_id = int(p_id)
            elif tipo == 'civile': partenza_civile_id = int(p_id)
        if destinazione_val:
            tipo, d_id = destinazione_val.split('-')
            if tipo == 'militare': destinazione_militare_id = int(d_id)
            elif tipo == 'civile': destinazione_civile_id = int(d_id)
        
        # Aggiorna attività con tracking
        conn.execute("""
            UPDATE attivita SET
                ente_svolgimento_id=?, tipologia_id=?, data_inizio=?, data_fine=?, descrizione=?,
                partenza_militare_id=?, partenza_civile_id=?, destinazione_militare_id=?, destinazione_civile_id=?,
                personale_ufficiali=?, personale_sottufficiali=?, personale_graduati=?, personale_civili=?, 
                note=?, operazione_id=?, modificato_da=?, data_modifica=datetime('now')
            WHERE id = ?
        """, (
            request.form.get('ente_svolgimento_id'), request.form.get('tipologia_id'),
            request.form.get('data_inizio'), request.form.get('data_fine') or None,
            request.form.get('descrizione', '').upper(),
            partenza_militare_id, partenza_civile_id,
            destinazione_militare_id, destinazione_civile_id,
            request.form.get('personale_ufficiali', 0), request.form.get('personale_sottufficiali', 0),
            request.form.get('personale_graduati', 0), request.form.get('personale_civili', 0),
            request.form.get('note', '').upper(),
            request.form.get('operazione_id') or None,
            user_id,  # 🆕 TRACKING: Chi ha modificato
            id
        ))
        
        # Gestione dettagli per tipologia
        tipologia_id = request.form.get('tipologia_id')
        tipologia_result = conn.execute('SELECT nome FROM tipologie_attivita WHERE id = ?', (tipologia_id,)).fetchone()
        
        if tipologia_result:
            tipologia_nome = tipologia_result['nome']
            
            # Elimina dettagli esistenti
            conn.execute('DELETE FROM dettagli_trasporti WHERE attivita_id = ?', (id,))
            conn.execute('DELETE FROM dettagli_mantenimento WHERE attivita_id = ?', (id,))
            conn.execute('DELETE FROM dettagli_rifornimenti WHERE attivita_id = ?', (id,))
            conn.execute('DELETE FROM dettagli_getra WHERE attivita_id = ?', (id,))
            
            # Inserisci nuovi dettagli
            if tipologia_nome == 'MOVIMENTI E TRASPORTI':
                conn.execute("""
                    INSERT INTO dettagli_trasporti (
                        attivita_id, tipologia_carico, quantita, unita_di_misura, mezzo_impiegato
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    id,
                    request.form.get('tipologia_carico', '').upper(),
                    request.form.get('quantita') or None,
                    request.form.get('unita_di_misura', '').upper(),
                    request.form.get('mezzo_impiegato', '').upper()
                ))
            elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
                conn.execute("""
                    INSERT INTO dettagli_mantenimento (
                        attivita_id, tipo_intervento, attivita_svolta, piattaforma_materiale
                    ) VALUES (?, ?, ?, ?)
                """, (
                    id,
                    request.form.get('tipo_intervento'),
                    request.form.get('attivita_svolta'),
                    request.form.get('piattaforma_materiale', '').upper()
                ))
            elif tipologia_nome == 'RIFORNIMENTI':
                conn.execute("""
                    INSERT INTO dettagli_rifornimenti (
                        attivita_id, tipologia_rifornimento, dettaglio_materiale, quantita, unita_di_misura
                    ) VALUES (?, ?, ?, ?, ?)
                """, (
                    id,
                    request.form.get('tipologia_rifornimento'),
                    request.form.get('dettaglio_materiale', '').upper(),
                    request.form.get('quantita_rifornimento') or None,
                    request.form.get('unita_di_misura_rifornimento', '').upper()
                ))
            elif tipologia_nome == 'GESTIONE TRANSITO':
                conn.execute("""
                    INSERT INTO dettagli_getra (
                        attivita_id, tipo_vettore, seriale_vettore,
                        numero_personale, numero_mezzi, volume, unita_di_misura
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    id,
                    request.form.get('tipo_vettore', '').upper(),
                    request.form.get('seriale_vettore', '').upper(),
                    request.form.get('numero_personale') or None,
                    request.form.get('numero_mezzi') or None,
                    request.form.get('volume') or None,
                    request.form.get('unita_di_misura_getra', '').upper()
                ))
        
        conn.commit()
        
        # Log successo modifica
        try:
            log_user_action(
                user_id, 
                'UPDATE_ATTIVITA', 
                f'Aggiornata attività {id}',
                'attivita',
                id,
                request.remote_addr
            )
        except Exception as e:
            print(f"DEBUG: Errore logging: {e}")
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Errore durante l'aggiornamento dell'attività: {e}")
        
        # Log errore
        try:
            log_user_action(
                user_id, 
                'UPDATE_ATTIVITA_ERROR', 
                f'Errore aggiornamento attività {id}: {str(e)}',
                'attivita',
                id,
                request.remote_addr,
                'FAILED'
            )
        except Exception as log_error:
            print(f"DEBUG: Errore logging: {log_error}")
        
        return "Errore nel salvataggio dei dati", 500
    finally:
        conn.close()
    
    return redirect(url_for('attivita.visualizza_attivita', id=id))

@attivita_bp.route('/attivita/elimina/<int:id>', methods=['POST'])
@permission_required('DELETE_ATTIVITA')  # 🔒 PROTEZIONE: Permesso eliminazione
def elimina_attivita(id):
    """
    Elimina attività - Con controlli accesso
    """
    user_id = request.current_user['user_id']
    accessible_entities = get_user_accessible_entities(user_id)
    
    conn = get_db_connection()
    
    try:
        # Verifica accesso all'attività
        if accessible_entities:
            placeholders = ','.join(['?' for _ in accessible_entities])
            attivita = conn.execute(
                f'SELECT * FROM attivita WHERE id = ? AND ente_svolgimento_id IN ({placeholders})',
                [id] + accessible_entities
            ).fetchone()
        else:
            attivita = None
        
        if not attivita:
            conn.close()
            try:
                log_user_action(
                    user_id, 
                    'ACCESS_DENIED', 
                    f'Tentativo eliminazione attività {id} non accessibile',
                    'attivita',
                    id,
                    request.remote_addr,
                    'FAILED'
                )
            except Exception as e:
                print(f"DEBUG: Errore logging: {e}")
            return "Attività non trovata o non eliminabile!", 404
        
        # Elimina attività (CASCADE eliminerà automaticamente i dettagli)
        conn.execute('DELETE FROM attivita WHERE id = ?', (id,))
        conn.commit()
        
        # Log eliminazione
        try:
            log_user_action(
                user_id, 
                'DELETE_ATTIVITA', 
                f'Eliminata attività {id}',
                'attivita',
                id,
                request.remote_addr
            )
        except Exception as e:
            print(f"DEBUG: Errore logging: {e}")
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Errore durante l'eliminazione dell'attività: {e}")
        
        # Log errore
        try:
            log_user_action(
                user_id, 
                'DELETE_ATTIVITA_ERROR', 
                f'Errore eliminazione attività {id}: {str(e)}',
                'attivita',
                id,
                request.remote_addr,
                'FAILED'
            )
        except Exception as log_error:
            print(f"DEBUG: Errore logging: {log_error}")
        
        return "Errore nell'eliminazione dei dati", 500
    finally:
        conn.close()
    
    return redirect(url_for('attivita.lista_attivita'))