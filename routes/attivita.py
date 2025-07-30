from flask import Blueprint, render_template, request, redirect, url_for
from services.database import get_db_connection
import sqlite3

attivita_bp = Blueprint('attivita', __name__, template_folder='../templates')

@attivita_bp.route('/attivita')
def lista_attivita():
    conn = get_db_connection()
    query = """
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
        ORDER BY a.data_inizio DESC
    """
    attivita_list = conn.execute(query).fetchall()
    conn.close()
    return render_template('lista_attivita.html', attivita_list=attivita_list)

@attivita_bp.route('/inserisci_attivita')
def inserisci_attivita_form():
    conn = get_db_connection()
    enti_militari = conn.execute('SELECT * FROM enti_militari ORDER BY nome').fetchall()
    enti_civili = conn.execute('SELECT * FROM enti_civili ORDER BY nome').fetchall()
    operazioni = conn.execute('SELECT * FROM operazioni ORDER BY nome_missione').fetchall()
    categorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id IS NULL ORDER BY nome').fetchall()
    tipologie_organizzate = {}
    for cat in categorie:
        sottocategorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id = ? ORDER BY nome', (cat['id'],)).fetchall()
        tipologie_organizzate[cat['nome']] = sottocategorie
    conn.close()
    return render_template('inserimento_attivita.html', 
                           enti_militari=enti_militari, 
                           enti_civili=enti_civili, 
                           operazioni=operazioni,
                           tipologie=tipologie_organizzate)

@attivita_bp.route('/salva_attivita', methods=['POST'])
def salva_attivita():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
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
        cursor.execute("""
            INSERT INTO attivita (
                ente_svolgimento_id, tipologia_id, data_inizio, data_fine, descrizione,
                partenza_militare_id, partenza_civile_id, destinazione_militare_id, destinazione_civile_id,
                personale_ufficiali, personale_sottufficiali, personale_graduati, personale_civili, note, operazione_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            request.form.get('ente_svolgimento_id'), request.form.get('tipologia_id'),
            request.form.get('data_inizio'), request.form.get('data_fine') or None,
            request.form.get('descrizione', '').upper(),
            partenza_militare_id, partenza_civile_id,
            destinazione_militare_id, destinazione_civile_id,
            request.form.get('personale_ufficiali', 0), request.form.get('personale_sottufficiali', 0),
            request.form.get('personale_graduati', 0), request.form.get('personale_civili', 0),
            request.form.get('note', '').upper(),
            request.form.get('operazione_id') or None
        ))
        attivita_id = cursor.lastrowid
        tipologia_id = request.form.get('tipologia_id')
        tipologia_nome = conn.execute('SELECT nome FROM tipologie_attivita WHERE id = ?', (tipologia_id,)).fetchone()['nome']
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
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Errore durante il salvataggio dell'attività: {e}")
        return "Errore nel salvataggio dei dati", 500
    finally:
        conn.close()
    return redirect(url_for('attivita.lista_attivita'))

@attivita_bp.route('/attivita/<int:id>')
def visualizza_attivita(id):
    conn = get_db_connection()
    query_base = """
        SELECT
            a.*,
            em.nome as ente_nome,
            ta.nome as tipologia_nome,
            op.nome_missione as operazione_nome
        FROM attivita a
        JOIN enti_militari em ON a.ente_svolgimento_id = em.id
        JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
        LEFT JOIN operazioni op ON a.operazione_id = op.id
        WHERE a.id = ?
    """
    attivita = conn.execute(query_base, (id,)).fetchone()
    if attivita is None: return "Attività non trovata!", 404
    def get_location_name(militare_id, civile_id):
        if militare_id:
            return conn.execute('SELECT nome FROM enti_militari WHERE id = ?', (militare_id,)).fetchone()['nome']
        if civile_id:
            return conn.execute('SELECT nome FROM enti_civili WHERE id = ?', (civile_id,)).fetchone()['nome']
        return None
    partenza = get_location_name(attivita['partenza_militare_id'], attivita['partenza_civile_id'])
    destinazione = get_location_name(attivita['destinazione_militare_id'], attivita['destinazione_civile_id'])
    dettagli_specifici = None
    if attivita['tipologia_nome'] == 'MOVIMENTI E TRASPORTI':
        dettagli_specifici = conn.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = ?', (id,)).fetchone()
    elif attivita['tipologia_nome'] == 'MANTENIMENTO E SQUADRE A CONTATTO':
        dettagli_specifici = conn.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = ?', (id,)).fetchone()
    elif attivita['tipologia_nome'] == 'RIFORNIMENTI':
        dettagli_specifici = conn.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = ?', (id,)).fetchone()
    elif attivita['tipologia_nome'] == 'GESTIONE TRANSITO':
        dettagli_specifici = conn.execute('SELECT * FROM dettagli_getra WHERE attivita_id = ?', (id,)).fetchone()

    conn.close()
    return render_template('descrizione_attivita.html', 
                           attivita=attivita, 
                           partenza=partenza, 
                           destinazione=destinazione,
                           dettagli_specifici=dettagli_specifici)

@attivita_bp.route('/attivita/modifica/<int:id>')
def modifica_attivita_form(id):
    conn = get_db_connection()
    enti_militari = conn.execute('SELECT * FROM enti_militari ORDER BY nome').fetchall()
    enti_civili = conn.execute('SELECT * FROM enti_civili ORDER BY nome').fetchall()
    operazioni = conn.execute('SELECT * FROM operazioni ORDER BY nome_missione').fetchall()
    categorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id IS NULL ORDER BY nome').fetchall()
    tipologie_organizzate = {}
    for cat in categorie:
        sottocategorie = conn.execute('SELECT * FROM tipologie_attivita WHERE parent_id = ? ORDER BY nome', (cat['id'],)).fetchall()
        tipologie_organizzate[cat['nome']] = sottocategorie
    attivita = conn.execute('SELECT * FROM attivita WHERE id = ?', (id,)).fetchone()
    if attivita is None:
        conn.close()
        return "Attività non trovata!", 404
    dettagli_trasporti = conn.execute('SELECT * FROM dettagli_trasporti WHERE attivita_id = ?', (id,)).fetchone()
    dettagli_mantenimento = conn.execute('SELECT * FROM dettagli_mantenimento WHERE attivita_id = ?', (id,)).fetchone()
    dettagli_rifornimenti = conn.execute('SELECT * FROM dettagli_rifornimenti WHERE attivita_id = ?', (id,)).fetchone()
    dettagli_getra = conn.execute('SELECT * FROM dettagli_getra WHERE attivita_id = ?', (id,)).fetchone()
    
    conn.close()
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
def aggiorna_attivita(id):
    conn = get_db_connection()
    try:
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
        conn.execute("""
            UPDATE attivita SET
                ente_svolgimento_id=?, tipologia_id=?, data_inizio=?, data_fine=?, descrizione=?,
                partenza_militare_id=?, partenza_civile_id=?, destinazione_militare_id=?, destinazione_civile_id=?,
                personale_ufficiali=?, personale_sottufficiali=?, personale_graduati=?, personale_civili=?, note=?, operazione_id=?
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
            id
        ))
        tipologia_id = request.form.get('tipologia_id')
        tipologia_nome = conn.execute('SELECT nome FROM tipologie_attivita WHERE id = ?', (tipologia_id,)).fetchone()['nome']
        
        if tipologia_nome == 'MOVIMENTI E TRASPORTI':
            conn.execute("""
                INSERT INTO dettagli_trasporti (attivita_id, tipologia_carico, quantita, unita_di_misura, mezzo_impiegato)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(attivita_id) DO UPDATE SET
                    tipologia_carico=excluded.tipologia_carico, quantita=excluded.quantita,
                    unita_di_misura=excluded.unita_di_misura, mezzo_impiegato=excluded.mezzo_impiegato
            """, (
                id, request.form.get('tipologia_carico', '').upper(), request.form.get('quantita') or None,
                request.form.get('unita_di_misura', '').upper(), request.form.get('mezzo_impiegato', '').upper()
            ))
        elif tipologia_nome == 'MANTENIMENTO E SQUADRE A CONTATTO':
            conn.execute("""
                INSERT INTO dettagli_mantenimento (attivita_id, tipo_intervento, attivita_svolta, piattaforma_materiale)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(attivita_id) DO UPDATE SET
                    tipo_intervento=excluded.tipo_intervento, attivita_svolta=excluded.attivita_svolta,
                    piattaforma_materiale=excluded.piattaforma_materiale
            """, (
                id, request.form.get('tipo_intervento'), request.form.get('attivita_svolta'),
                request.form.get('piattaforma_materiale', '').upper()
            ))
        elif tipologia_nome == 'RIFORNIMENTI':
            conn.execute("""
                INSERT INTO dettagli_rifornimenti (attivita_id, tipologia_rifornimento, dettaglio_materiale, quantita, unita_di_misura)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(attivita_id) DO UPDATE SET
                    tipologia_rifornimento=excluded.tipologia_rifornimento, dettaglio_materiale=excluded.dettaglio_materiale,
                    quantita=excluded.quantita, unita_di_misura=excluded.unita_di_misura
            """, (
                id, request.form.get('tipologia_rifornimento'), request.form.get('dettaglio_materiale', '').upper(),
                request.form.get('quantita_rifornimento') or None,
                request.form.get('unita_di_misura_rifornimento', '').upper()
            ))
        elif tipologia_nome == 'GESTIONE TRANSITO':
            conn.execute("""
                INSERT INTO dettagli_getra (
                    attivita_id, tipo_vettore, seriale_vettore,
                    numero_personale, numero_mezzi, volume, unita_di_misura
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(attivita_id) DO UPDATE SET
                    tipo_vettore     = excluded.tipo_vettore,
                    seriale_vettore  = excluded.seriale_vettore,
                    numero_personale = excluded.numero_personale,
                    numero_mezzi     = excluded.numero_mezzi,
                    volume           = excluded.volume,
                    unita_di_misura  = excluded.unita_di_misura
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
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Errore durante l'aggiornamento dell'attività: {e}")
        return "Errore nel salvataggio dei dati", 500
    finally:
        conn.close()
    return redirect(url_for('attivita.visualizza_attivita', id=id))

@attivita_bp.route('/attivita/elimina/<int:id>', methods=['POST'])
def elimina_attivita(id):
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM attivita WHERE id = ?', (id,))
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Errore durante l'eliminazione dell'attività: {e}")
        return "Errore nell'eliminazione dei dati", 500
    finally:
        conn.close()
    return redirect(url_for('attivita.lista_attivita'))
