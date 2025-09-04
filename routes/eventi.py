"""
Blueprint per la gestione degli Eventi
Gestisce dashboard, CRUD e API per eventi del Comando Logistico
"""

from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for, session
from auth import login_required, get_user_role, is_operatore_or_above, get_auth_db_connection
from datetime import datetime, timedelta
from psycopg2.extras import RealDictCursor
import json

# Creazione del blueprint
eventi = Blueprint('eventi', __name__, url_prefix='/eventi')

@eventi.route('/dashboard')
@login_required
def dashboard_eventi():
    """Dashboard principale per la Comunicazione Eventi"""
    
    user_role = get_user_role()
    
    # Solo OPERATORE e ADMIN possono accedere
    if not is_operatore_or_above():
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        return redirect(url_for('main.dashboard'))
    
    # Pagina bianca - nessuna elaborazione necessaria
    return render_template('eventi/dashboard_eventi.html',
                         user_role=user_role)

@eventi.route('/api/dashboard-data')
@login_required
def api_dashboard_data():
    """API per dati dashboard eventi (per Chart.js)"""
    
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    try:
        period = request.args.get('period', 'year')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        carattere_filtro = request.args.get('carattere_filtro', '')
        
        # Calcola il periodo - AGGIORNATO per usare data_msg_evento
        if period == 'custom' and start_date and end_date:
            date_filter = f"data_msg_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {
                'week': 7,
                'month': 30,
                'quarter': 90,
                'year': 365
            }
            days = days_map.get(period, 365)
            date_filter = f"data_msg_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        # Aggiungi filtro carattere se presente
        if carattere_filtro:
            date_filter += f" AND e.carattere = '{carattere_filtro}'"
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query per dati eventi solo del Comando Logistico e suoi figli
                # Livello 0: raggruppa per tipo_evento
                cur.execute(f"""
                    WITH RECURSIVE gerarchia_logistico AS (
                        SELECT id, nome, parent_id, 0 as livello
                        FROM enti_militari 
                        WHERE id = 1  -- COMANDO LOGISTICO DELL'ESERCITO
                        
                        UNION ALL
                        
                        SELECT e.id, e.nome, e.parent_id, g.livello + 1
                        FROM enti_militari e
                        INNER JOIN gerarchia_logistico g ON e.parent_id = g.id
                    )
                    SELECT 
                        e.tipo_evento,
                        COUNT(*) as count
                    FROM eventi e
                    INNER JOIN gerarchia_logistico g ON e.ente_id = g.id
                    WHERE {date_filter}
                    GROUP BY e.tipo_evento
                    ORDER BY e.tipo_evento
                """)
                chart_data = cur.fetchall()
                
                # Statistiche aggregate solo per Comando Logistico
                cur.execute(f"""
                    WITH RECURSIVE gerarchia_logistico AS (
                        SELECT id, nome, parent_id, 0 as livello
                        FROM enti_militari 
                        WHERE id = 1
                        
                        UNION ALL
                        
                        SELECT e.id, e.nome, e.parent_id, g.livello + 1
                        FROM enti_militari e
                        INNER JOIN gerarchia_logistico g ON e.parent_id = g.id
                    )
                    SELECT 
                        COUNT(*) as totale,
                        COUNT(CASE WHEN e.carattere = 'positivo' THEN 1 END) as positivi,
                        COUNT(CASE WHEN e.carattere = 'negativo' THEN 1 END) as negativi,
                        COUNT(DISTINCT e.ente_id) as enti_coinvolti,
                        COUNT(DISTINCT e.tipo_evento) as tipologie
                    FROM eventi e
                    INNER JOIN gerarchia_logistico g ON e.ente_id = g.id
                    WHERE {date_filter}
                """)
                stats = cur.fetchone()
                
        finally:
            conn.close()
            
        # Formatta i dati per Chart.js - livello 0 (tipi evento)
        labels = []
        data = []
        colors = []
        
        # Colori per i tipi evento (allineati al dashboard principale)
        tipo_colors = {
            'tipo_a': 'rgba(102, 126, 234, 0.8)',
            'tipo_b': 'rgba(118, 75, 162, 0.8)', 
            'tipo_c': 'rgba(240, 147, 251, 0.8)',
            'tipo_d': 'rgba(245, 87, 108, 0.8)',
            'tipo_e': 'rgba(79, 172, 254, 0.8)'
        }
        
        for row in chart_data:
            # Formatta il tipo evento sostituendo _ con spazio
            tipo_formatted = row['tipo_evento'].upper().replace('_', ' ')
            labels.append(tipo_formatted)
            data.append(row['count'])
            colors.append(tipo_colors.get(row['tipo_evento'], 'rgba(100, 100, 100, 0.8)'))
        
        return jsonify({
            'success': True,
            'chart': {
                'labels': labels,
                'data': data,
                'backgroundColor': colors
            },
            'stats': {
                'totale': stats['totale'] if stats else 0,
                'positivi': stats['positivi'] if stats else 0,
                'negativi': stats['negativi'] if stats else 0,
                'enti_coinvolti': stats['enti_coinvolti'] if stats else 0,
                'tipologie': stats['tipologie'] if stats else 0
            }
        })
        
    except Exception as e:
        print(f"[EVENTI] Errore API dashboard: {e}")
        return jsonify({'error': str(e)}), 500

@eventi.route('/lista')
@login_required
def lista_eventi():
    """Lista di tutti gli eventi del Comando Logistico dell'Esercito"""
    
    if not is_operatore_or_above():
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        return redirect(url_for('main.dashboard'))
    
    try:
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query completa per lista eventi con join per nomi e tipologia_evento
                cur.execute("""
                    SELECT 
                        e.id,
                        e.data_evento,
                        e.data_msg_evento,
                        e.carattere,
                        e.tipo_evento,
                        e.prot_msg_evento,
                        e.note,
                        e.creato_il,
                        em.nome as ente_nome,
                        te.nome as tipologia_nome,
                        te.descrizione as tipologia_descrizione,
                        u.nome || ' ' || u.cognome as creato_da_nome
                    FROM eventi e
                    JOIN enti_militari em ON e.ente_id = em.id
                    LEFT JOIN tipologia_evento te ON e.tipologia_evento_id = te.id
                    LEFT JOIN utenti u ON e.creato_da = u.id
                    WHERE check_ente_comando_logistico(em.id) = true
                    ORDER BY e.data_msg_evento DESC, e.creato_il DESC
                    LIMIT 1000
                """)
                eventi_data = cur.fetchall()
                
        finally:
            conn.close()
            
        print(f"[EVENTI] Lista eventi caricata: {len(eventi_data)} eventi trovati")
        
        return render_template('eventi/lista_eventi.html',
                             eventi_list=eventi_data,
                             user_role=get_user_role())
                             
    except Exception as e:
        print(f"[EVENTI] Errore caricamento lista eventi: {e}")
        flash('Errore durante il caricamento degli eventi.', 'error')
        return render_template('eventi/lista_eventi.html',
                             eventi_list=[],
                             user_role=get_user_role())

@eventi.route('/visualizza/<int:id>')
@login_required
def visualizza_evento(id):
    """Visualizza i dettagli di un singolo evento"""
    
    if not is_operatore_or_above():
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        return redirect(url_for('main.dashboard'))
    
    try:
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query per dettagli evento singolo con tipologia_evento
                cur.execute("""
                    SELECT 
                        e.*,
                        em.nome as ente_nome,
                        em.codice as ente_codice,
                        te.nome as tipologia_nome,
                        te.descrizione as tipologia_descrizione,
                        u_creato.nome || ' ' || u_creato.cognome as creato_da_nome,
                        u_modificato.nome || ' ' || u_modificato.cognome as modificato_da_nome
                    FROM eventi e
                    JOIN enti_militari em ON e.ente_id = em.id
                    LEFT JOIN tipologia_evento te ON e.tipologia_evento_id = te.id
                    LEFT JOIN utenti u_creato ON e.creato_da = u_creato.id
                    LEFT JOIN utenti u_modificato ON e.modificato_da = u_modificato.id
                    WHERE e.id = %s AND check_ente_comando_logistico(em.id) = true
                """, (id,))
                evento_data = cur.fetchone()
                
                if not evento_data:
                    flash('Evento non trovato o non autorizzato.', 'error')
                    return redirect(url_for('eventi.lista_eventi'))
                    
                print(f"[EVENTI] Evento {id} caricato: {evento_data['tipo_evento']} - {evento_data['ente_nome']}")
                
                # Prepara dati protocollo per il template - parsing JSONB con arricchimento dati
                rife_evento_raw = evento_data.get('rife_evento')
                prot_data = {}
                
                if rife_evento_raw:
                    try:
                        if isinstance(rife_evento_raw, str):
                            prot_data = json.loads(rife_evento_raw)
                        elif isinstance(rife_evento_raw, dict):
                            prot_data = rife_evento_raw
                        else:
                            print(f"[EVENTI] Formato rife_evento non riconosciuto: {type(rife_evento_raw)}")
                            prot_data = {}
                    except json.JSONDecodeError as e:
                        print(f"[EVENTI] Errore parsing JSON rife_evento: {e}")
                        prot_data = {}
                    
                    # Arricchisci i dati dei seguiti con informazioni complete dall'evento
                    if prot_data and 'seguiti_eventi' in prot_data:
                        print(f"[EVENTI] Elaborazione {len(prot_data['seguiti_eventi'])} seguiti eventi")
                        for seguito in prot_data['seguiti_eventi']:
                            if 'evento_id' in seguito:
                                try:
                                    print(f"[EVENTI] Processing seguito evento_id: {seguito['evento_id']}")
                                    print(f"[EVENTI] Dati seguiti originali: {seguito}")
                                    
                                    # Recupera i dati completi dell'evento seguito usando il cursor esistente
                                    cur.execute("""
                                        SELECT 
                                            e.prot_msg_evento, 
                                            e.data_msg_evento, 
                                            e.note as dettagli_evento, 
                                            e.carattere, 
                                            e.tipo_evento,
                                            te.nome as tipologia_nome,
                                            te.descrizione as tipologia_descrizione
                                        FROM eventi e
                                        LEFT JOIN tipologia_evento te ON e.tipologia_evento_id = te.id
                                        WHERE e.id = %s
                                    """, (seguito['evento_id'],))
                                    
                                    evento_seguito_data = cur.fetchone()
                                    print(f"[EVENTI] Dati recuperati dal DB per evento {seguito['evento_id']}: {evento_seguito_data}")
                                    
                                    if evento_seguito_data:
                                        # Forza l'aggiornamento con i dati dal database (non usare i dati JSONB)
                                        seguito['prot_msg_evento'] = str(evento_seguito_data['prot_msg_evento']) if evento_seguito_data['prot_msg_evento'] else 'N/D'
                                        
                                        # Gestione sicura della data
                                        try:
                                            if evento_seguito_data['data_msg_evento']:
                                                seguito['data_msg_evento'] = evento_seguito_data['data_msg_evento'].strftime('%d/%m/%Y')
                                            else:
                                                seguito['data_msg_evento'] = 'N/D'
                                        except Exception as date_err:
                                            print(f"[EVENTI] Errore formattazione data per evento {seguito['evento_id']}: {date_err}")
                                            seguito['data_msg_evento'] = 'N/D'
                                        
                                        seguito['dettagli_evento'] = str(evento_seguito_data['dettagli_evento']) if evento_seguito_data['dettagli_evento'] else 'N/D'
                                        seguito['carattere'] = str(evento_seguito_data['carattere']) if evento_seguito_data['carattere'] else 'N/D'
                                        seguito['tipo_evento'] = str(evento_seguito_data['tipo_evento']) if evento_seguito_data['tipo_evento'] else 'N/D'
                                        seguito['tipologia_nome'] = str(evento_seguito_data['tipologia_nome']) if evento_seguito_data['tipologia_nome'] else 'N/D'
                                        seguito['tipologia_descrizione'] = str(evento_seguito_data['tipologia_descrizione']) if evento_seguito_data['tipologia_descrizione'] else 'N/D'
                                        
                                        # Debug per tipologie
                                        print(f"[EVENTI] Debug tipologia per evento {seguito['evento_id']}:")
                                        print(f"  - tipologia_nome recuperato: '{evento_seguito_data['tipologia_nome']}'")
                                        print(f"  - tipologia_descrizione recuperata: '{evento_seguito_data['tipologia_descrizione']}'")
                                        print(f"  - tipologia_nome impostata: '{seguito['tipologia_nome']}'")
                                        print(f"  - tipologia_descrizione impostata: '{seguito['tipologia_descrizione']}')")
                                        
                                        print(f"[EVENTI] Evento seguito {seguito['evento_id']} AGGIORNATO:")
                                        print(f"  - Protocollo: {seguito['prot_msg_evento']}")
                                        print(f"  - Data: {seguito['data_msg_evento']}")
                                        print(f"  - Dettagli: {seguito['dettagli_evento'][:50]}{'...' if len(seguito['dettagli_evento']) > 50 else ''}")
                                    else:
                                        print(f"[EVENTI] ATTENZIONE: Evento seguito {seguito['evento_id']} non trovato nel database!")
                                        # Se l'evento non esiste, imposta valori di default
                                        seguito['prot_msg_evento'] = 'EVENTO NON TROVATO'
                                        seguito['data_msg_evento'] = 'N/D'
                                        seguito['dettagli_evento'] = 'Evento collegato non più presente nel sistema'
                                except Exception as e:
                                    print(f"[EVENTI] ERRORE recupero dati evento seguito {seguito.get('evento_id')}: {e}")
                                    # In caso di errore, imposta valori di fallback
                                    seguito['prot_msg_evento'] = 'ERRORE'
                                    seguito['data_msg_evento'] = 'N/D'
                                    seguito['dettagli_evento'] = f'Errore recupero dati: {str(e)}'
                
                print(f"[EVENTI] prot_data parsato e arricchito: {prot_data}")
                
        finally:
            conn.close()
        
        return render_template('eventi/visualizza_evento.html',
                             evento=evento_data,
                             prot_data=prot_data,
                             user_role=get_user_role())
                             
    except Exception as e:
        print(f"[EVENTI] Errore caricamento evento {id}: {e}")
        flash('Errore durante il caricamento dell\'evento.', 'error')
        return redirect(url_for('eventi.lista_eventi'))

@eventi.route('/nuovo')
@login_required 
def inserisci_evento_form():
    """Form per inserimento nuovo evento"""
    
    print("[EVENTI] Accesso a /inserimento")
    print(f"[EVENTI] User role: {get_user_role()}")
    print(f"[EVENTI] Is operatore or above: {is_operatore_or_above()}")
    
    if not is_operatore_or_above():
        print("[EVENTI] Accesso negato - privilegi insufficienti")
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        return redirect(url_for('main.dashboard'))
    
    try:
        print("[EVENTI] Tentativo connessione database")
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                print("[EVENTI] Caricamento enti militari del Comando Logistico")
                # Query semplice per tutti gli enti del Comando Logistico
                cur.execute("""
                    SELECT DISTINCT e.id, e.nome, e.codice, e.indirizzo
                    FROM enti_militari e
                    WHERE check_ente_comando_logistico(e.id) = true
                      AND e.nome IS NOT NULL 
                      AND e.nome != ''
                    ORDER BY e.nome
                """)
                enti_militari = cur.fetchall()
                print(f"[EVENTI] Query completata - {len(enti_militari)} enti trovati")
                
                # Query per tipologie evento - AGGIUNTO per uniformità con modifica_evento
                print("[EVENTI] Caricamento tipologie evento")
                cur.execute("""
                    SELECT id, nome, descrizione
                    FROM tipologia_evento 
                    WHERE attivo = true
                    ORDER BY nome
                """)
                tipologie_evento = cur.fetchall()
                print(f"[EVENTI] Query tipologie completata - {len(tipologie_evento)} tipologie trovate")
                
        finally:
            conn.close()
            
        print(f"[EVENTI] Rendering template con {len(enti_militari)} enti e {len(tipologie_evento)} tipologie")
        
        return render_template('eventi/inserisci_evento.html',
                             enti_militari=enti_militari,
                             tipologie_evento=tipologie_evento,
                             user_role=get_user_role())
                             
    except Exception as e:
        print(f"[EVENTI] ERRORE caricamento form inserimento: {e}")
        print(f"[EVENTI] Tipo errore: {type(e)}")
        import traceback
        print(f"[EVENTI] Traceback: {traceback.format_exc()}")
        flash('Errore durante il caricamento del form.', 'error')
        return redirect(url_for('eventi.lista_eventi'))

@eventi.route('/salva', methods=['POST'], endpoint='salva_evento')
@login_required
def salva_evento():
    """Salva un nuovo evento"""
    
    if not is_operatore_or_above():
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        return redirect(url_for('main.dashboard'))
    
    print("[EVENTI] Richiesta salvataggio nuovo evento")
    print(f"[EVENTI] Dati ricevuti: {dict(request.form)}")
    
    try:
        # Estrai dati dal form
        ente_id = request.form.get('ente_id')
        carattere = request.form.get('carattere')
        tipo_evento = request.form.get('tipo_evento')
        data_evento = request.form.get('data_evento') or None
        tipologia_evento_id = request.form.get('tipologia_evento_id')
        note = request.form.get('note', '').upper()
        prot_msg_evento = request.form.get('prot_msg_evento', '').upper()
        
        # Validazione e formattazione protocollo a 7 cifre
        prot_msg_evento_clean = ''.join(filter(str.isdigit, prot_msg_evento))
        if not prot_msg_evento_clean.isdigit():
            print(f"[EVENTI] Errore validazione protocollo: '{prot_msg_evento}' non è numerico")
            flash('Il protocollo messaggio evento deve contenere solo numeri.', 'error')
            return redirect(url_for('eventi.inserisci_evento_form'))
        
        prot_msg_evento = prot_msg_evento_clean.zfill(7)  # Applica padding a 7 cifre
        print(f"[EVENTI] Protocollo formattato: '{prot_msg_evento}'")
        
        data_msg_evento = request.form.get('data_msg_evento')
        seguiti_eventi = request.form.get('seguiti_eventi', '').strip()
        
        print(f"[EVENTI] Campi estratti:")
        print(f"  - ente_id: '{ente_id}' ({'OK' if ente_id else 'VUOTO'})")
        print(f"  - carattere: '{carattere}' ({'OK' if carattere else 'VUOTO'})")
        print(f"  - tipo_evento: '{tipo_evento}' ({'OK' if tipo_evento else 'VUOTO'})")
        print(f"  - data_evento: '{data_evento}' ({'OK' if data_evento else 'VUOTO'})")
        print(f"  - tipologia_evento_id: '{tipologia_evento_id}' ({'OK' if tipologia_evento_id else 'VUOTO'})")
        print(f"  - prot_msg_evento: '{prot_msg_evento}' ({'OK' if prot_msg_evento else 'VUOTO'})")
        print(f"  - data_msg_evento: '{data_msg_evento}' ({'OK' if data_msg_evento else 'VUOTO'})")
        print(f"  - seguiti_eventi: '{seguiti_eventi[:100]}...' ({'OK' if seguiti_eventi else 'VUOTO'})")
        print(f"  - user_id: '{session.get('user_id')}' ({'OK' if session.get('user_id') else 'VUOTO'})")
        
        # Validazione (data_evento è ora opzionale)
        campi_obbligatori = [ente_id, carattere, tipo_evento, tipologia_evento_id, prot_msg_evento, data_msg_evento]
        if not all(campi_obbligatori):
            print(f"[EVENTI] VALIDAZIONE FALLITA - campi mancanti:")
            for i, campo in enumerate(['ente_id', 'carattere', 'tipo_evento', 'tipologia_evento_id', 'prot_msg_evento', 'data_msg_evento']):
                if not campi_obbligatori[i]:
                    print(f"  - {campo}: MANCANTE")
            flash('Tutti i campi obbligatori devono essere compilati.', 'error')
            return redirect(url_for('eventi.inserisci_evento_form'))
        
        print("[EVENTI] Validazione superata, procedo con l'inserimento database")
        
        # Salva nel database
        print(f"[EVENTI] Tentativo connessione database...")
        with get_auth_db_connection() as conn:
            print(f"[EVENTI] Connessione database riuscita")
            with conn.cursor() as cur:
                # Processa i dati JSONB dei seguiti
                rife_data = None
                if seguiti_eventi:
                    try:
                        import json
                        rife_data = json.loads(seguiti_eventi)
                        print(f"[EVENTI] Dati seguiti JSONB: {rife_data}")
                    except json.JSONDecodeError:
                        print(f"[EVENTI] Errore parsing JSON seguiti: {seguiti_eventi}")
                        rife_data = None
                
                print(f"[EVENTI] Esecuzione query INSERT...")
                cur.execute("""
                    INSERT INTO eventi (
                        ente_id, carattere, tipo_evento, data_evento, 
                        tipologia_evento_id, note, prot_msg_evento, data_msg_evento,
                        rife_evento, creato_da, creato_il
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                """, (
                    ente_id, carattere, tipo_evento, data_evento,
                    tipologia_evento_id, note, prot_msg_evento, data_msg_evento,
                    json.dumps(rife_data) if rife_data else None, session.get('user_id')
                ))
                print(f"[EVENTI] Query INSERT eseguita, commit...")
                conn.commit()
                print(f"[EVENTI] Commit completato")
                
        print("[EVENTI] Evento salvato con successo")
        flash('Evento salvato con successo.', 'success')
        return redirect(url_for('eventi.lista_eventi'))
        
    except Exception as e:
        print(f"[EVENTI] Errore durante il salvataggio: {e}")
        flash('Errore durante il salvataggio dell\'evento.', 'error')
        return redirect(url_for('eventi.inserisci_evento_form'))

@eventi.route('/modifica/<int:id>')
@login_required
def modifica_evento_form(id):
    """Mostra il form per modificare un evento"""
    
    print(f'[EVENTI DEBUG] ===== ROUTE MODIFICA CHIAMATA ID={id} =====')
    print(f'[EVENTI] Accesso a /modifica/{id}')
    print(f'[EVENTI] User role: {get_user_role()}')
    print(f'[EVENTI] Is operatore or above: {is_operatore_or_above()}')
    
    if not is_operatore_or_above():
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        print('[EVENTI] Accesso negato - privilegi insufficienti')
        return redirect(url_for('main.dashboard'))
    
    try:
        with get_auth_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query per ottenere l'evento da modificare con tipologia_evento
                cur.execute("""
                    SELECT e.*, em.nome as ente_nome, em.codice as ente_codice, em.indirizzo as ente_indirizzo,
                           te.nome as tipologia_nome, te.descrizione as tipologia_descrizione,
                           u_creato.username as creato_da_nome, u_modificato.username as modificato_da_nome
                    FROM eventi e
                    LEFT JOIN enti_militari em ON e.ente_id = em.id
                    LEFT JOIN tipologia_evento te ON e.tipologia_evento_id = te.id
                    LEFT JOIN utenti u_creato ON e.creato_da = u_creato.id
                    LEFT JOIN utenti u_modificato ON e.modificato_da = u_modificato.id
                    WHERE e.id = %s
                """, (id,))
                
                evento = cur.fetchone()
                if not evento:
                    flash('Evento non trovato.', 'error')
                    return redirect(url_for('eventi.lista_eventi'))
                
                # Query per enti militari (usando la stessa query del form nuovo evento)
                cur.execute("""
                    SELECT DISTINCT e.id, e.nome, e.codice, e.indirizzo
                    FROM enti_militari e
                    WHERE check_ente_comando_logistico(e.id) = true
                      AND e.nome IS NOT NULL 
                      AND e.nome != ''
                    ORDER BY e.nome
                """)
                enti_militari = cur.fetchall()
                
                # Query per tipologie evento
                cur.execute("""
                    SELECT id, nome, descrizione
                    FROM tipologia_evento 
                    WHERE attivo = true
                    ORDER BY nome
                """)
                tipologie_evento = cur.fetchall()
                
                print(f'[EVENTI] Caricato evento ID {id} per modifica')
                print(f'[EVENTI] Caricati {len(enti_militari)} enti militari per dropdown')
                
                # Prepara dati protocollo per il template - parsing JSONB con arricchimento dati
                rife_evento_raw = evento.get('rife_evento')
                prot_data = {}
                prot_data_json = ''
                
                if rife_evento_raw:
                    try:
                        if isinstance(rife_evento_raw, str):
                            prot_data = json.loads(rife_evento_raw)
                        elif isinstance(rife_evento_raw, dict):
                            prot_data = rife_evento_raw
                        else:
                            print(f"[EVENTI] Formato rife_evento non riconosciuto: {type(rife_evento_raw)}")
                            prot_data = {}
                    except json.JSONDecodeError as e:
                        print(f"[EVENTI] Errore parsing JSON rife_evento: {e}")
                        prot_data = {}
                    
                    # Arricchisci i dati dei seguiti con informazioni complete dall'evento
                    if prot_data and 'seguiti_eventi' in prot_data:
                        print(f"[EVENTI] Elaborazione {len(prot_data['seguiti_eventi'])} seguiti eventi per modifica")
                        for seguito in prot_data['seguiti_eventi']:
                            if 'evento_id' in seguito:
                                try:
                                    print(f"[EVENTI] Processing seguito evento_id: {seguito['evento_id']}")
                                    
                                    # Recupera i dati completi dell'evento seguito usando il cursor esistente
                                    cur.execute("""
                                        SELECT 
                                            e.prot_msg_evento, 
                                            e.data_msg_evento, 
                                            e.note as dettagli_evento, 
                                            e.carattere, 
                                            e.tipo_evento,
                                            te.nome as tipologia_nome,
                                            te.descrizione as tipologia_descrizione
                                        FROM eventi e
                                        LEFT JOIN tipologia_evento te ON e.tipologia_evento_id = te.id
                                        WHERE e.id = %s
                                    """, (seguito['evento_id'],))
                                    
                                    evento_seguito_data = cur.fetchone()
                                    print(f"[EVENTI] Dati recuperati dal DB per evento {seguito['evento_id']}: {evento_seguito_data}")
                                    
                                    if evento_seguito_data:
                                        # Arricchisci con i dati dal database
                                        seguito['prot_msg_evento'] = str(evento_seguito_data['prot_msg_evento']) if evento_seguito_data['prot_msg_evento'] else 'N/D'
                                        
                                        # Gestione sicura della data
                                        try:
                                            if evento_seguito_data['data_msg_evento']:
                                                seguito['data_msg_evento'] = evento_seguito_data['data_msg_evento'].strftime('%d/%m/%Y')
                                            else:
                                                seguito['data_msg_evento'] = 'N/D'
                                        except Exception as date_err:
                                            print(f"[EVENTI] Errore formattazione data per evento {seguito['evento_id']}: {date_err}")
                                            seguito['data_msg_evento'] = 'N/D'
                                        
                                        seguito['dettagli_evento'] = str(evento_seguito_data['dettagli_evento']) if evento_seguito_data['dettagli_evento'] else 'N/D'
                                        seguito['carattere'] = str(evento_seguito_data['carattere']) if evento_seguito_data['carattere'] else 'N/D'
                                        seguito['tipo_evento'] = str(evento_seguito_data['tipo_evento']) if evento_seguito_data['tipo_evento'] else 'N/D'
                                        seguito['tipologia_nome'] = str(evento_seguito_data['tipologia_nome']) if evento_seguito_data['tipologia_nome'] else 'N/D'
                                        seguito['tipologia_descrizione'] = str(evento_seguito_data['tipologia_descrizione']) if evento_seguito_data['tipologia_descrizione'] else 'N/D'
                                        
                                        # Debug per tipologie
                                        print(f"[EVENTI] Debug tipologia per evento {seguito['evento_id']}:")
                                        print(f"  - tipologia_nome recuperato: '{evento_seguito_data['tipologia_nome']}'")
                                        print(f"  - tipologia_descrizione recuperata: '{evento_seguito_data['tipologia_descrizione']}'")
                                        print(f"  - tipologia_nome impostata: '{seguito['tipologia_nome']}'")
                                        print(f"  - tipologia_descrizione impostata: '{seguito['tipologia_descrizione']}')")
                                        
                                        print(f"[EVENTI] Evento seguito {seguito['evento_id']} arricchito per modifica")
                                    else:
                                        print(f"[EVENTI] ATTENZIONE: Evento seguito {seguito['evento_id']} non trovato nel database!")
                                        # Se l'evento non esiste, imposta valori di default
                                        seguito['prot_msg_evento'] = 'EVENTO NON TROVATO'
                                        seguito['data_msg_evento'] = 'N/D'
                                        seguito['dettagli_evento'] = 'Evento collegato non più presente nel sistema'
                                except Exception as e:
                                    print(f"[EVENTI] ERRORE recupero dati evento seguito {seguito.get('evento_id')}: {e}")
                                    # In caso di errore, imposta valori di fallback
                                    seguito['prot_msg_evento'] = 'ERRORE'
                                    seguito['data_msg_evento'] = 'N/D'
                                    seguito['dettagli_evento'] = f'Errore recupero dati: {str(e)}'
                
                    # Prepara la versione JSON per il campo nascosto
                    prot_data_json = json.dumps(prot_data) if prot_data else ''
                
                print(f"[EVENTI] prot_data arricchito per modifica: {prot_data}")
                
                return render_template('eventi/modifica_evento.html',
                                     evento=evento,
                                     enti_militari=enti_militari,
                                     tipologie_evento=tipologie_evento,
                                     prot_data=prot_data,
                                     prot_data_json=prot_data_json,
                                     user_role=get_user_role())
                
    except Exception as e:
        print(f"[EVENTI] Errore caricamento evento per modifica ID {id}: {e}")
        print(f"[EVENTI] Tipo errore: {type(e).__name__}")
        import traceback
        print(f"[EVENTI] Traceback completo: {traceback.format_exc()}")
        flash('Errore nel caricamento dell\'evento.', 'error')
        return redirect(url_for('eventi.lista_eventi'))


@eventi.route('/aggiorna/<int:id>', methods=['POST'])
@login_required  
def aggiorna_evento(id):
    """Aggiorna un evento esistente"""
    
    if not is_operatore_or_above():
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        return redirect(url_for('main.dashboard'))
    
    print(f"[EVENTI] Richiesta aggiornamento evento ID {id}")
    print(f"[EVENTI] Dati ricevuti: {dict(request.form)}")
    
    try:
        # Estrai dati dal form
        ente_id = request.form.get('ente_id')
        carattere = request.form.get('carattere')
        tipo_evento = request.form.get('tipo_evento')
        data_evento = request.form.get('data_evento') or None
        tipologia_evento_id = request.form.get('tipologia_evento_id')
        note = request.form.get('note', '').upper()
        prot_msg_evento = request.form.get('prot_msg_evento', '').upper()
        
        # Validazione e formattazione protocollo a 7 cifre
        prot_msg_evento_clean = ''.join(filter(str.isdigit, prot_msg_evento))
        if not prot_msg_evento_clean.isdigit():
            print(f"[EVENTI] Errore validazione protocollo: '{prot_msg_evento}' non è numerico")
            flash('Il protocollo messaggio evento deve contenere solo numeri.', 'error')
            return redirect(url_for('eventi.modifica_evento_form', id=id))
        
        prot_msg_evento = prot_msg_evento_clean.zfill(7)  # Applica padding a 7 cifre
        print(f"[EVENTI] Protocollo formattato: '{prot_msg_evento}'")
        
        data_msg_evento = request.form.get('data_msg_evento')
        seguiti_eventi = request.form.get('seguiti_eventi', '').strip()
        
        print(f"[EVENTI] Campi estratti per aggiornamento:")
        print(f"  - ente_id: '{ente_id}' ({'OK' if ente_id else 'VUOTO'})")
        print(f"  - carattere: '{carattere}' ({'OK' if carattere else 'VUOTO'})")
        print(f"  - tipo_evento: '{tipo_evento}' ({'OK' if tipo_evento else 'VUOTO'})")
        print(f"  - data_evento: '{data_evento}' ({'OK' if data_evento else 'VUOTO'})")
        print(f"  - note: '{note[:50]}...' ({'OK' if note else 'VUOTO'})")
        print(f"  - prot_msg_evento: '{prot_msg_evento}' ({'OK' if prot_msg_evento else 'VUOTO'})")
        print(f"  - data_msg_evento: '{data_msg_evento}' ({'OK' if data_msg_evento else 'VUOTO'})")
        print(f"  - seguiti_eventi: '{seguiti_eventi[:100]}...' ({'OK' if seguiti_eventi else 'VUOTO'})")
        
        # Validazione
        campi_obbligatori = [ente_id, carattere, tipo_evento, note, prot_msg_evento, data_msg_evento]
        if not all(campi_obbligatori):
            print(f"[EVENTI] VALIDAZIONE FALLITA - campi mancanti:")
            for i, campo in enumerate(['ente_id', 'carattere', 'tipo_evento', 'note', 'prot_msg_evento', 'data_msg_evento']):
                if not campi_obbligatori[i]:
                    print(f"  - {campo}: MANCANTE")
            flash('Tutti i campi obbligatori devono essere compilati.', 'error')
            return redirect(url_for('eventi.modifica_evento_form', id=id))
        
        print("[EVENTI] Validazione superata, procedo con l'aggiornamento database")
        
        # Aggiorna nel database
        with get_auth_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica che l'evento esista
                cur.execute("SELECT id FROM eventi WHERE id = %s", (id,))
                evento_esistente = cur.fetchone()
                
                if not evento_esistente:
                    flash('Evento non trovato.', 'error')
                    return redirect(url_for('eventi.lista_eventi'))
                
                print(f"[EVENTI] Evento ID {id} esistente, procedo con aggiornamento")
                
                # Parse dei seguiti eventi JSON 
                rife_evento_json = None
                if seguiti_eventi:
                    try:
                        rife_evento_data = json.loads(seguiti_eventi)
                        rife_evento_json = json.dumps(rife_evento_data)  # Re-stringify per il database
                        print(f"[EVENTI] Seguiti eventi parsati correttamente: {len(rife_evento_data.get('seguiti_eventi', []))} elementi")
                    except json.JSONDecodeError as json_err:
                        print(f"[EVENTI] Errore parsing JSON seguiti eventi: {json_err}")
                        flash('Errore nel formato dei dati seguiti eventi.', 'error')
                        return redirect(url_for('eventi.modifica_evento_form', id=id))
                else:
                    print("[EVENTI] Nessun seguito eventi fornito")
                
                # Query di aggiornamento
                cur.execute("""
                    UPDATE eventi SET
                        ente_id = %s,
                        carattere = %s,
                        tipo_evento = %s,
                        data_evento = %s,
                        tipologia_evento_id = %s,
                        note = %s,
                        prot_msg_evento = %s,
                        data_msg_evento = %s,
                        rife_evento = %s,
                        modificato_da = %s,
                        modificato_il = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (
                    ente_id,
                    carattere,
                    tipo_evento,
                    data_evento,
                    tipologia_evento_id,
                    note,
                    prot_msg_evento,
                    data_msg_evento,
                    rife_evento_json,
                    session.get('user_id'),
                    id
                ))
                
                conn.commit()
                print(f"[EVENTI] Evento ID {id} aggiornato con successo")
                flash('Evento aggiornato con successo.', 'success')
                return redirect(url_for('eventi.visualizza_evento', id=id))
                
    except Exception as e:
        print(f"[EVENTI] Errore durante aggiornamento evento ID {id}: {e}")
        import traceback
        print(f"[EVENTI] Traceback: {traceback.format_exc()}")
        flash('Errore durante l\'aggiornamento dell\'evento.', 'error')
        return redirect(url_for('eventi.modifica_evento_form', id=id))

@eventi.route('/elimina/<int:id>', methods=['POST'])
@login_required  
def elimina_evento(id):
    """Elimina un evento esistente"""
    
    if not is_operatore_or_above():
        flash('Accesso negato. Privilegi insufficienti.', 'error')
        return redirect(url_for('main.dashboard'))
    
    try:
        with get_auth_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica che l'evento esista
                cur.execute("SELECT id FROM eventi WHERE id = %s", (id,))
                evento = cur.fetchone()
                
                if not evento:
                    flash('Evento non trovato.', 'error')
                    return redirect(url_for('eventi.lista_eventi'))
                
                # Elimina l'evento
                cur.execute("DELETE FROM eventi WHERE id = %s", (id,))
                conn.commit()
                
                print(f"[EVENTI] Evento ID {id} eliminato con successo")
                flash('Evento eliminato con successo.', 'success')
                return redirect(url_for('eventi.lista_eventi'))
                
    except Exception as e:
        print(f"[EVENTI] Errore durante eliminazione evento ID {id}: {e}")
        flash('Errore durante l\'eliminazione dell\'evento.', 'error')
        return redirect(url_for('eventi.lista_eventi'))

@eventi.route('/api/enti-livello1')
@login_required  
def api_enti_livello1():
    """API per ottenere enti di livello 1 (Comando Logistico + figli diretti) filtrati per tipo evento"""
    
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    try:
        period = request.args.get('period', 'year')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        tipo_evento = request.args.get('tipo_evento', '')
        carattere_filtro = request.args.get('carattere_filtro', '')
        
        # Calcola il periodo - AGGIORNATO per usare data_msg_evento
        if period == 'custom' and start_date and end_date:
            date_filter = f"data_msg_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {
                'week': 7,
                'month': 30,
                'quarter': 90,
                'year': 365
            }
            days = days_map.get(period, 365)
            date_filter = f"data_msg_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        # Costruisci filtri aggiuntivi
        additional_filters = []
        if tipo_evento:
            additional_filters.append(f"e.tipo_evento = '{tipo_evento}'")
        if carattere_filtro:
            additional_filters.append(f"e.carattere = '{carattere_filtro}'")
        
        where_clause = date_filter
        if additional_filters:
            where_clause += " AND " + " AND ".join(additional_filters)
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Query CORRETTA per enti di livello 1 con aggregazione ricorsiva
                cur.execute(f"""
                    WITH enti_primo_livello AS (
                        SELECT id, nome FROM enti_militari WHERE parent_id = 1 OR id = 1
                    ),
                    eventi_aggregati AS (
                        SELECT 
                            CASE 
                                WHEN em.id = 1 THEN em.id  -- Comando principale stesso
                                WHEN em.parent_id = 1 THEN em.id  -- Enti diretti
                                WHEN parent.parent_id = 1 THEN parent.id  -- Nipoti → Padre
                                WHEN grandparent.parent_id = 1 THEN grandparent.id  -- Pronipoti → Nonno
                                ELSE em.id 
                            END as ente_primo_livello_id
                        FROM eventi e
                        JOIN enti_militari em ON e.ente_id = em.id
                        LEFT JOIN enti_militari parent ON em.parent_id = parent.id
                        LEFT JOIN enti_militari grandparent ON parent.parent_id = grandparent.id
                        WHERE {where_clause}
                    )
                    SELECT 
                        epl.id,
                        epl.nome,
                        COUNT(*) as count
                    FROM eventi_aggregati ea
                    JOIN enti_primo_livello epl ON ea.ente_primo_livello_id = epl.id
                    GROUP BY epl.id, epl.nome
                    ORDER BY epl.nome
                """)
                enti_data = cur.fetchall()
                
        finally:
            conn.close()
        
        if not enti_data:
            return jsonify({
                'success': True,
                'data': {
                    'labels': [],
                    'values': [],
                    'backgroundColor': []
                }
            })
        
        # Formatta i dati per Chart.js
        labels = []
        values = []
        colors = []
        
        # Colori per gli enti (palette diversa dai tipi evento)
        ente_colors = [
            'rgba(54, 162, 235, 0.8)',   # Blu
            'rgba(255, 99, 132, 0.8)',   # Rosa
            'rgba(255, 205, 86, 0.8)',   # Giallo
            'rgba(75, 192, 192, 0.8)',   # Verde acqua
            'rgba(153, 102, 255, 0.8)',  # Viola
            'rgba(255, 159, 64, 0.8)',   # Arancione
            'rgba(199, 199, 199, 0.8)',  # Grigio
            'rgba(83, 102, 255, 0.8)'    # Blu scuro
        ]
        
        for i, row in enumerate(enti_data):
            labels.append(row['nome'])
            values.append(row['count'])
            colors.append(ente_colors[i % len(ente_colors)])
        
        return jsonify({
            'success': True,
            'data': {
                'labels': labels,
                'values': values,
                'backgroundColor': colors
            }
        })
        
    except Exception as e:
        print(f"[EVENTI] Errore API enti livello 1: {e}")
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/enti-stacked')
@login_required
def api_enti_stacked():
    """API per dati stacked per la vista per-ente (Comando Logistico + figli diretti con breakdown per tipo evento)"""
    
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    try:
        period = request.args.get('period', 'year')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        carattere_filtro = request.args.get('carattere_filtro', '')
        ente_parent = request.args.get('ente_parent')  # Parametro per drill-down livello 1-2
        ente_parent_nome = request.args.get('ente_parent_nome')  # Nome ente per drill-down livello 1-2
        ente_specifico_nome = request.args.get('ente_specifico_nome')  # Nome ente specifico livello 3
        livello_3 = request.args.get('livello_3') == 'true'  # Flag per livello 3
        
        # Calcola il periodo
        if period == 'custom' and start_date and end_date:
            date_filter = f"e.data_msg_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {
                'week': 7,
                'month': 30,
                'quarter': 90,
                'year': 365
            }
            days = days_map.get(period, 365)
            date_filter = f"e.data_msg_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        # Aggiungi filtro carattere se presente
        additional_filters = []
        if carattere_filtro:
            additional_filters.append(f"e.carattere = '{carattere_filtro}'")
        
        where_clause = date_filter
        if additional_filters:
            where_clause += " AND " + " AND ".join(additional_filters)
        
        # Converti nome ente in ID se fornito
        if ente_parent_nome and not ente_parent:
            conn_temp = get_auth_db_connection()
            try:
                with conn_temp.cursor() as cur_temp:
                    cur_temp.execute("SELECT id FROM enti_militari WHERE nome = %s", (ente_parent_nome,))
                    result = cur_temp.fetchone()
                    if result:
                        ente_parent = result[0]
                        print(f"[EVENTI API STACKED DEBUG] Converted '{ente_parent_nome}' to ID: {ente_parent}")
                    else:
                        print(f"[EVENTI API STACKED DEBUG] WARNING: Ente '{ente_parent_nome}' not found")
            finally:
                conn_temp.close()
        
        # Converti nome ente specifico per livello 3
        ente_specifico_id = None
        if ente_specifico_nome and livello_3:
            conn_temp = get_auth_db_connection()
            try:
                with conn_temp.cursor() as cur_temp:
                    cur_temp.execute("SELECT id FROM enti_militari WHERE nome = %s", (ente_specifico_nome,))
                    result = cur_temp.fetchone()
                    if result:
                        ente_specifico_id = result[0]
                        print(f"[EVENTI API STACKED DEBUG] Level 3 - Converted '{ente_specifico_nome}' to ID: {ente_specifico_id}")
                    else:
                        print(f"[EVENTI API STACKED DEBUG] WARNING: Ente specifico '{ente_specifico_nome}' not found")
            finally:
                conn_temp.close()
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Prima controlla se ci sono eventi nel database
                cur.execute(f"SELECT COUNT(*) as total FROM eventi e WHERE {where_clause}")
                total_eventi = cur.fetchone()['total']
                print(f"[EVENTI API STACKED DEBUG] Total events in period: {total_eventi}")
                
                if total_eventi == 0:
                    print(f"[EVENTI API STACKED DEBUG] No events found with filter: {where_clause}")
                    stacked_data = []
                else:
                    if livello_3 and ente_specifico_id:
                        # Livello 3: mostra tipi evento per ente specifico con aggregazione ricorsiva
                        print(f"[EVENTI API STACKED DEBUG] Level 3 - Event types for ente: {ente_specifico_id}")
                        cur.execute(f"""
                            WITH RECURSIVE gerarchia_ente AS (
                                SELECT id, nome, parent_id, 0 as livello
                                FROM enti_militari 
                                WHERE id = {ente_specifico_id}
                                
                                UNION ALL
                                
                                SELECT e.id, e.nome, e.parent_id, g.livello + 1
                                FROM enti_militari e
                                INNER JOIN gerarchia_ente g ON e.parent_id = g.id
                            )
                            SELECT 
                                e.tipo_evento,
                                COUNT(*) as count
                            FROM eventi e
                            INNER JOIN gerarchia_ente g ON e.ente_id = g.id
                            WHERE {where_clause}
                            GROUP BY e.tipo_evento
                            ORDER BY e.tipo_evento
                        """)
                    elif ente_parent:
                        # Drill-down livello 1+: mostra ente padre + figli diretti con aggregazione ricorsiva
                        print(f"[EVENTI API STACKED DEBUG] Drill-down for parent: {ente_parent} (shows parent + children)")
                        cur.execute(f"""
                            WITH eventi_aggregati AS (
                                SELECT 
                                    CASE 
                                        WHEN em.id = {ente_parent} THEN em.id  -- Ente padre stesso
                                        WHEN em.parent_id = {ente_parent} THEN em.id  -- Figli diretti
                                        WHEN parent.parent_id = {ente_parent} THEN parent.id  -- Nipoti → Padre
                                        WHEN grandparent.parent_id = {ente_parent} THEN grandparent.id  -- Pronipoti → Nonno
                                        ELSE NULL
                                    END as ente_target_id,
                                    e.tipo_evento
                                FROM eventi e
                                JOIN enti_militari em ON e.ente_id = em.id
                                LEFT JOIN enti_militari parent ON em.parent_id = parent.id
                                LEFT JOIN enti_militari grandparent ON parent.parent_id = grandparent.id
                                WHERE {where_clause}
                                AND (em.id = {ente_parent} OR em.parent_id = {ente_parent} OR parent.parent_id = {ente_parent} OR grandparent.parent_id = {ente_parent})
                            )
                            SELECT 
                                em_target.nome,
                                ea.tipo_evento,
                                COUNT(*) as count
                            FROM eventi_aggregati ea
                            JOIN enti_militari em_target ON ea.ente_target_id = em_target.id
                            WHERE ea.ente_target_id IS NOT NULL
                            GROUP BY em_target.nome, ea.tipo_evento
                            ORDER BY em_target.nome, ea.tipo_evento
                        """)
                    else:
                        # Query con aggregazione ricorsiva per enti di primo livello (livello 0)
                        cur.execute(f"""
                            WITH eventi_aggregati AS (
                                SELECT 
                                    CASE 
                                        WHEN em.id = 1 THEN em.id  -- Comando principale stesso
                                        WHEN em.parent_id = 1 THEN em.id  -- Enti diretti
                                        WHEN parent.parent_id = 1 THEN parent.id  -- Nipoti → Padre
                                        WHEN grandparent.parent_id = 1 THEN grandparent.id  -- Pronipoti → Nonno
                                        ELSE NULL -- Escludi eventi fuori gerarchia
                                    END as ente_primo_livello_id,
                                    e.tipo_evento
                                FROM eventi e
                                JOIN enti_militari em ON e.ente_id = em.id
                                LEFT JOIN enti_militari parent ON em.parent_id = parent.id
                                LEFT JOIN enti_militari grandparent ON parent.parent_id = grandparent.id
                                WHERE {where_clause}
                                AND (em.id = 1 OR em.parent_id = 1 OR parent.parent_id = 1 OR grandparent.parent_id = 1)
                            )
                            SELECT 
                                em_target.nome,
                                ea.tipo_evento,
                                COUNT(*) as count
                            FROM eventi_aggregati ea
                            JOIN enti_militari em_target ON ea.ente_primo_livello_id = em_target.id
                            WHERE ea.ente_primo_livello_id IS NOT NULL
                            GROUP BY em_target.nome, ea.tipo_evento
                            ORDER BY em_target.nome, ea.tipo_evento
                        """)
                stacked_data = cur.fetchall()
                
                # Debug della query per capire perché i totali sono 0
                print(f"[EVENTI API STACKED RICORSIVA] Query executed successfully. Raw results count: {len(stacked_data)}")
                for i, row in enumerate(stacked_data[:5]):  # Prime 5 righe per debug
                    print(f"[EVENTI API STACKED] Row {i}: {dict(row)}")
                
                if stacked_data:
                    print(f"[EVENTI API STACKED DEBUG] First row example: {dict(stacked_data[0])}")
                else:
                    print("[EVENTI API STACKED DEBUG] No stacked_data found")
                
        finally:
            conn.close()
        
        if not stacked_data:
            return jsonify({
                'success': True,
                'stackedData': {
                    'labels': [],
                    'totals': [],
                    'backgroundColor': [],
                    'breakdown': {}
                }
            })
        
        # Elabora i dati per il formato stacked
        if livello_3 and ente_specifico_id:
            # Livello 3: dati per tipo evento (come vista tipologie livello 0)
            labels = []
            totals = []
            backgroundColor = []
            
            # Colori per i tipi evento
            tipo_colors = [
                'rgba(54, 162, 235, 0.8)',   # Blu - TIPO A
                'rgba(255, 99, 132, 0.8)',   # Rosa - TIPO B  
                'rgba(255, 205, 86, 0.8)',   # Giallo - TIPO C
                'rgba(75, 192, 192, 0.8)',   # Verde acqua - TIPO D
                'rgba(153, 102, 255, 0.8)',  # Viola - TIPO E
            ]
            
            for i, row in enumerate(stacked_data):
                labels.append(row['tipo_evento'])
                totals.append(row['count'])
                backgroundColor.append(tipo_colors[i % len(tipo_colors)])
            
            return jsonify({
                'success': True,
                'stackedData': {
                    'labels': labels,
                    'totals': totals,
                    'backgroundColor': backgroundColor,
                    'breakdown': {}  # Non serve breakdown per livello 3
                }
            })
        else:
            # Livelli 0-2: dati per enti (comportamento originale)
            enti_map = {}
            tipi_evento_trovati = set()
            
            # Prima passata: raccoglie tutti i tipi evento trovati e inizializza enti
            for row in stacked_data:
                ente_nome = row['nome']
                tipo_evento = row['tipo_evento']
                tipi_evento_trovati.add(tipo_evento)
                
                if ente_nome not in enti_map:
                    enti_map[ente_nome] = {}
        
        # Usa i tipi evento trovati nel database invece di hardcode
        tipi_evento = list(tipi_evento_trovati) if tipi_evento_trovati else ['TIPO A', 'TIPO B', 'TIPO C', 'TIPO D', 'TIPO E']
        
        # Inizializza tutti gli enti con tutti i tipi evento a 0
        for ente_nome in enti_map:
            enti_map[ente_nome] = {tipo: 0 for tipo in tipi_evento}
        
        # Popola i dati per tipo evento
        for row in stacked_data:
            ente_nome = row['nome']
            tipo_evento = row['tipo_evento']
            count = row['count']
            if ente_nome in enti_map and tipo_evento in enti_map[ente_nome]:
                enti_map[ente_nome][tipo_evento] = count
        
        # Formatta per Chart.js
        labels = list(enti_map.keys())
        totals = []
        breakdown = {}
        
        # Colori per gli enti
        ente_colors = [
            'rgba(54, 162, 235, 0.8)',   # Blu
            'rgba(255, 99, 132, 0.8)',   # Rosa
            'rgba(255, 205, 86, 0.8)',   # Giallo
            'rgba(75, 192, 192, 0.8)',   # Verde acqua
            'rgba(153, 102, 255, 0.8)',  # Viola
            'rgba(255, 159, 64, 0.8)',   # Arancione
            'rgba(199, 199, 199, 0.8)',  # Grigio
            'rgba(83, 102, 255, 0.8)'    # Blu scuro
        ]
        
        backgroundColor = []
        
        for i, (ente_nome, tipo_counts) in enumerate(enti_map.items()):
            # Calcola totale per questo ente
            totale_ente = sum(tipo_counts.values())
            totals.append(totale_ente)
            
            # Breakdown per tipo evento
            breakdown[ente_nome] = tipo_counts
            
            # Colore per questo ente
            color_index = i % len(ente_colors)
            backgroundColor.append(ente_colors[color_index])
        
        # Statistiche aggregate
        total_events = sum(totals)
        unique_entities = len(labels)
        
        # Calcolo eventi positivi/negativi se disponibili
        positive_events = 0
        negative_events = 0
        
        if not carattere_filtro:
            # Query separata per carattere solo se non è già filtrato
            with get_auth_db_connection() as conn_stats:
                with conn_stats.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(f"""
                        SELECT carattere, COUNT(*) as count
                        FROM eventi e
                        JOIN enti_militari em ON e.ente_id = em.id
                        LEFT JOIN enti_militari parent ON em.parent_id = parent.id
                        LEFT JOIN enti_militari grandparent ON parent.parent_id = grandparent.id
                        WHERE {date_filter}
                        AND (em.id = 1 OR em.parent_id = 1 OR parent.parent_id = 1 OR grandparent.parent_id = 1)
                        GROUP BY carattere
                    """)
                    carattere_data = cur.fetchall()
                    
                    for row in carattere_data:
                        if row['carattere'] == 'positivo':
                            positive_events = row['count']
                        elif row['carattere'] == 'negativo':
                            negative_events = row['count']
        
        stats = {
            'total_events': total_events,
            'categories': len(tipi_evento),  # Sempre 5 tipi evento
            'entities': unique_entities,
            'positive_events': positive_events,
            'negative_events': negative_events
        }
        
        # Debug logging per verificare dati
        print(f"[EVENTI API STACKED] Raw data count: {len(stacked_data)}")
        print(f"[EVENTI API STACKED] Labels: {labels}")
        print(f"[EVENTI API STACKED] Totals: {totals}")
        print(f"[EVENTI API STACKED] Stats: {stats}")
        print(f"[EVENTI API STACKED] Breakdown keys: {list(breakdown.keys()) if breakdown else 'None'}")
        print(f"[EVENTI API STACKED] Date filter used: {where_clause}")
        
        return jsonify({
            'success': True,
            'stackedData': {
                'labels': labels,
                'totals': totals,
                'backgroundColor': backgroundColor,
                'breakdown': breakdown
            },
            'stats': stats
        })
        
    except Exception as e:
        print(f"[EVENTI] Errore API enti stacked: {e}")
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/enti-livello2')
@login_required  
def api_enti_livello2():
    """API per ottenere tutti gli enti dipendenti (ricorsivi) dall'ente di livello 1 selezionato"""
    
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    try:
        period = request.args.get('period', 'year')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        tipo_evento = request.args.get('tipo_evento', '')
        carattere_filtro = request.args.get('carattere_filtro', '')
        ente_parent = request.args.get('ente_parent', '')
        
        if not ente_parent:
            return jsonify({'error': 'Parametro ente_parent richiesto'}), 400
        
        # Calcola il periodo - AGGIORNATO per usare data_msg_evento
        if period == 'custom' and start_date and end_date:
            date_filter = f"data_msg_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {
                'week': 7,
                'month': 30,
                'quarter': 90,
                'year': 365
            }
            days = days_map.get(period, 365)
            date_filter = f"data_msg_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        # Costruisci filtri aggiuntivi
        additional_filters = []
        if tipo_evento:
            additional_filters.append(f"e.tipo_evento = '{tipo_evento}'")
        if carattere_filtro:
            additional_filters.append(f"e.carattere = '{carattere_filtro}'")
        
        where_clause = date_filter
        if additional_filters:
            where_clause += " AND " + " AND ".join(additional_filters)
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Prima ottieni l'ID dell'ente parent dal nome
                cur.execute("SELECT id FROM enti_militari WHERE nome = %s", (ente_parent,))
                parent_result = cur.fetchone()
                
                if not parent_result:
                    return jsonify({'error': f'Ente parent "{ente_parent}" non trovato'}), 404
                
                parent_id = parent_result['id']
                
                # Query ricorsiva per tutti gli enti dipendenti
                cur.execute(f"""
                    WITH RECURSIVE gerarchia_enti AS (
                        -- Caso base: ente selezionato
                        SELECT id, nome, parent_id, 0 as livello_rel
                        FROM enti_militari 
                        WHERE id = %s
                        
                        UNION ALL
                        
                        -- Caso ricorsivo: tutti gli enti dipendenti
                        SELECT em.id, em.nome, em.parent_id, g.livello_rel + 1
                        FROM enti_militari em
                        INNER JOIN gerarchia_enti g ON em.parent_id = g.id
                    )
                    SELECT 
                        g.id,
                        g.nome,
                        g.livello_rel,
                        COUNT(e.id) as count
                    FROM gerarchia_enti g
                    LEFT JOIN eventi e ON e.ente_id = g.id AND {where_clause}
                    GROUP BY g.id, g.nome, g.livello_rel
                    HAVING COUNT(e.id) > 0  -- Solo enti con eventi
                    ORDER BY g.nome
                """, (parent_id,))
                enti_data = cur.fetchall()
                
        finally:
            conn.close()
        
        if not enti_data:
            return jsonify({
                'success': True,
                'data': {
                    'labels': [],
                    'values': [],
                    'backgroundColor': []
                }
            })
        
        # Formatta i dati per Chart.js
        labels = []
        values = []
        colors = []
        
        # Colori per livello 2 (palette più scura/diversa)
        ente_colors_l2 = [
            'rgba(220, 38, 127, 0.8)',   # Rosa scuro
            'rgba(156, 39, 176, 0.8)',   # Viola scuro  
            'rgba(63, 81, 181, 0.8)',    # Indaco
            'rgba(3, 169, 244, 0.8)',    # Blu cielo
            'rgba(0, 150, 136, 0.8)',    # Teal
            'rgba(76, 175, 80, 0.8)',    # Verde
            'rgba(255, 152, 0, 0.8)',    # Arancione
            'rgba(121, 85, 72, 0.8)',    # Marrone
            'rgba(96, 125, 139, 0.8)',   # Blu grigio
            'rgba(233, 30, 99, 0.8)'     # Rosa intenso
        ]
        
        for i, row in enumerate(enti_data):
            # Usa il nome dell'ente senza prefissi
            nome_display = row['nome']
            
            labels.append(nome_display)
            values.append(row['count'])
            colors.append(ente_colors_l2[i % len(ente_colors_l2)])
        
        return jsonify({
            'success': True,
            'data': {
                'labels': labels,
                'values': values,
                'backgroundColor': colors
            }
        })
        
    except Exception as e:
        print(f"[EVENTI] Errore API enti livello 2: {e}")
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/enti-comando-logistico')
@login_required
def api_enti_comando_logistico():
    """API per ottenere lista enti dipendenti dal Comando Logistico"""
    
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    try:
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Ottiene tutti gli enti che possono avere eventi
                # (usando la stessa funzione di controllo della tabella eventi)
                cur.execute("""
                    SELECT id, nome, codice
                    FROM enti_militari 
                    WHERE check_ente_comando_logistico(id) = true
                    ORDER BY nome
                """)
                enti = cur.fetchall()
                
        finally:
            conn.close()
            
        return jsonify([{
            'id': ente['id'],
            'nome': ente['nome'],
            'codice': ente['codice']
        } for ente in enti])
        
    except Exception as e:
        print(f"[EVENTI] Errore API enti: {e}")
        return jsonify({'error': str(e)}), 500

# Registrazione gestori errore specifici per il blueprint
@eventi.errorhandler(404)
def not_found_error(error):
    flash('Pagina eventi non trovata', 'error')
    return redirect(url_for('eventi.dashboard_eventi'))

@eventi.route('/api/categorie')
@login_required
def api_eventi_categorie():
    """API LIVELLO 0: Categorie eventi del Comando Logistico dell'Esercito (Tipo A, B, C, D, E)"""
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    period = request.args.get('period', 'year')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    carattere_filter = request.args.get('carattere', '')
    
    print(f"[EVENTI API] /api/categorie - Livello 0: Comando Logistico - carattere_filter={carattere_filter}")
    
    try:
        # Calcola il filtro temporale
        if period == 'custom' and start_date and end_date:
            date_filter = f"e.data_msg_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {'week': 7, 'month': 30, 'quarter': 90, 'year': 365}
            days = days_map.get(period, 365)
            date_filter = f"e.data_msg_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        # Costruisci condizioni WHERE
        where_conditions = [date_filter]
        if carattere_filter and carattere_filter in ['positivo', 'negativo']:
            where_conditions.append(f"e.carattere = '{carattere_filter}'")
        
        where_clause = ' AND '.join(where_conditions)
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # LIVELLO 0: Categorie eventi aggregate per tutto il Comando Logistico
                cur.execute(f"""
                    SELECT 
                        e.tipo_evento as categoria,
                        COUNT(*) as count
                    FROM eventi e
                    JOIN enti_militari em ON e.ente_id = em.id
                    WHERE {where_clause}
                    GROUP BY e.tipo_evento
                    ORDER BY e.tipo_evento
                """)
                results = cur.fetchall()
                
        finally:
            conn.close()
        
        # Funzione per formattare i nomi dei tipi evento
        def format_tipo_evento(tipo):
            if tipo and tipo.startswith('tipo_'):
                letter = tipo.split('_')[1].upper()
                return f"Tipo {letter}"
            return tipo
        
        # Prepara i dati per il grafico
        labels = [format_tipo_evento(row['categoria']) for row in results]
        values = [row['count'] for row in results]
        
        print(f"[EVENTI API] Livello 0 - Trovati {len(results)} tipi evento: {labels}")
        
        return jsonify({
            'success': True,
            'data': {
                'labels': labels,
                'values': values
            }
        })
        
    except Exception as e:
        print(f"[EVENTI] Errore API categorie livello 0: {e}")
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/sottocategorie')
@login_required
def api_eventi_sottocategorie():
    """API DEPRECATA: Mantenuta per compatibilità, reindirizza a categorie per enti primo livello"""
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    # Reindirizza alla nuova logica usando /api/enti con level=1
    return api_eventi_enti()

@eventi.route('/api/enti')
@login_required  
def api_eventi_enti():
    """API MULTILIVELLO: Gestisce livelli 1, 2, 3 del drill-down gerarchico con categorie eventi per livello"""
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    # Parametri dalla drill-down
    categoria_selezionata = request.args.get('categoria', '')  # Tipo evento dal livello precedente
    carattere_filtro = request.args.get('carattere_filtro', '')  # Dal toggle carattere
    ente_primo_livello = request.args.get('ente_primo_livello', '')  # Nome ente primo livello selezionato
    ente_secondo_livello = request.args.get('ente_secondo_livello', '')  # Nome ente secondo livello selezionato
    level = request.args.get('level', '1')  # Livello drill-down (1, 2, 3)
    period = request.args.get('period', 'year')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    print(f"[EVENTI API] /api/enti - Livello {level}: categoria={categoria_selezionata}, carattere_filtro={carattere_filtro}, ente_primo={ente_primo_livello}, ente_secondo={ente_secondo_livello}")
    
    # Converti categoria formattata ("Tipo A") a formato database ("tipo_a")
    def unformat_tipo_evento(tipo_formatted):
        if tipo_formatted and tipo_formatted.startswith('Tipo '):
            letter = tipo_formatted.split(' ')[1].lower()
            return f"tipo_{letter}"
        return tipo_formatted
    
    tipo_evento_db = unformat_tipo_evento(categoria_selezionata) if categoria_selezionata else None
    
    try:
        # Calcola il filtro temporale
        if period == 'custom' and start_date and end_date:
            date_filter = f"e.data_msg_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {'week': 7, 'month': 30, 'quarter': 90, 'year': 365}
            days = days_map.get(period, 365)
            date_filter = f"e.data_msg_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Costruisci condizioni WHERE base
                where_conditions = [date_filter]
                params = []
                
                if tipo_evento_db:
                    where_conditions.append("e.tipo_evento = %s")
                    params.append(tipo_evento_db)
                
                if carattere_filtro and carattere_filtro in ['positivo', 'negativo']:
                    where_conditions.append("e.carattere = %s")
                    params.append(carattere_filtro)
                
                where_clause = " AND ".join(where_conditions)
                
                if level == '1':
                    # LIVELLO 1: Categorie eventi aggregate per Enti primo livello
                    # Mostra gli enti primi livello che hanno eventi del tipo selezionato
                    print(f"[EVENTI API] Livello 1 - Enti primo livello per tipo {tipo_evento_db}")
                    cur.execute(f"""
                        WITH enti_primo_livello AS (
                            SELECT id, nome FROM enti_militari WHERE parent_id = 1 OR id = 1
                        ),
                        eventi_aggregati AS (
                            SELECT 
                                CASE 
                                    WHEN em.id = 1 THEN em.id  -- Comando principale stesso
                                    WHEN em.parent_id = 1 THEN em.id  -- Ente primo livello diretto
                                    WHEN parent.parent_id = 1 THEN parent.id  -- Padre è primo livello
                                    WHEN grandparent.parent_id = 1 THEN grandparent.id  -- Nonno è primo livello
                                    ELSE em.id 
                                END as ente_primo_livello_id
                            FROM eventi e
                            JOIN enti_militari em ON e.ente_id = em.id
                            LEFT JOIN enti_militari parent ON em.parent_id = parent.id
                            LEFT JOIN enti_militari grandparent ON parent.parent_id = grandparent.id
                            WHERE {where_clause}
                        )
                        SELECT 
                            epl.nome as ente,
                            COUNT(*) as count
                        FROM eventi_aggregati ea
                        JOIN enti_primo_livello epl ON ea.ente_primo_livello_id = epl.id
                        GROUP BY epl.id, epl.nome
                        ORDER BY epl.nome
                    """, params)
                    
                elif level == '2' and ente_primo_livello:
                    # LIVELLO 2: Categorie eventi per Enti secondo livello dell'ente primo selezionato
                    # Mostra gli enti secondo livello (figli dell'ente primo) che hanno eventi del tipo selezionato
                    print(f"[EVENTI API] Livello 2 - Enti secondo livello per {ente_primo_livello}")
                    cur.execute(f"""
                        WITH ente_primo AS (
                            SELECT id FROM enti_militari WHERE nome = %s AND parent_id = 1
                        )
                        SELECT 
                            em.nome as ente,
                            COUNT(*) as count
                        FROM eventi e
                        JOIN enti_militari em ON e.ente_id = em.id
                        WHERE {where_clause} 
                        AND (
                            em.parent_id = (SELECT id FROM ente_primo) OR
                            EXISTS (
                                SELECT 1 FROM enti_militari parent 
                                WHERE parent.id = em.parent_id 
                                AND parent.parent_id = (SELECT id FROM ente_primo)
                            )
                        )
                        GROUP BY em.id, em.nome
                        ORDER BY em.nome
                    """, params + [ente_primo_livello])
                    
                elif level == '3' and ente_secondo_livello:
                    # LIVELLO 3: Categorie eventi per Enti terzo livello dell'ente secondo selezionato
                    # Mostra gli enti terzo livello (figli dell'ente secondo) che hanno eventi del tipo selezionato
                    print(f"[EVENTI API] Livello 3 - Enti terzo livello per {ente_secondo_livello}")
                    cur.execute(f"""
                        WITH ente_secondo AS (
                            SELECT id FROM enti_militari WHERE nome = %s
                        )
                        SELECT 
                            em.nome as ente,
                            COUNT(*) as count
                        FROM eventi e
                        JOIN enti_militari em ON e.ente_id = em.id
                        WHERE {where_clause} 
                        AND (
                            em.id = (SELECT id FROM ente_secondo) OR
                            em.parent_id = (SELECT id FROM ente_secondo)
                        )
                        GROUP BY em.id, em.nome
                        ORDER BY em.nome
                    """, params + [ente_secondo_livello])
                else:
                    return jsonify({'error': f'Livello {level} non supportato o parametri mancanti'}), 400
                    
                results = cur.fetchall()
                
        finally:
            conn.close()
            
        # Prepara risposta
        labels = [row['ente'] for row in results]
        values = [row['count'] for row in results]
        
        print(f"[EVENTI API] Livello {level} - Trovati {len(results)} enti: {labels}")
        
        return jsonify({
            'success': True,
            'data': {
                'labels': labels,
                'values': values
            }
        })
        
    except Exception as e:
        print(f"[EVENTI] Errore API enti livello {level}: {e}")
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/dettagli')
@login_required
def api_eventi_dettagli():
    """API per ottenere i dettagli degli eventi di un ente"""
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    # Fix parameter mapping: frontend sends categoria/sottocategoria
    carattere_filter = request.args.get('carattere', '') or request.args.get('categoria', '')  # for filtering by carattere (positive/negative)
    tipo_evento = request.args.get('sottocategoria', '')  # for filtering by tipo_evento (e.g., tipo_e)
    ente_nome = request.args.get('ente', '')
    level = request.args.get('level', '0')  # Level indicates drill-down depth
    aggregate_for_chart = request.args.get('aggregate_for_chart', 'false')  # NEW: Request chart aggregation
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    print(f"[EVENTI API] Dettagli richiesti con parametri:")
    print(f"  - ente: '{ente_nome}'")
    print(f"  - carattere_filter: '{carattere_filter}'") 
    print(f"  - sottocategoria (tipo_evento): '{tipo_evento}'")
    print(f"  - level: '{level}'")
    print(f"  - period: '{period}'")
    print(f"  - start_date: '{start_date}'")
    print(f"  - end_date: '{end_date}'")
    
    try:
        # Calcola il filtro temporale - AGGIORNATO per usare data_msg_evento
        if period == 'custom' and start_date and end_date:
            date_filter = f"e.data_msg_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {'week': 7, 'month': 30, 'quarter': 90, 'year': 365}
            days = days_map.get(period, 30)
            date_filter = f"e.data_msg_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                
                # Al livello 2, usa query ricorsiva come enti-livello2 per includere enti dipendenti
                if level == '2' and ente_nome:
                    print(f"[EVENTI API] Livello 2 rilevato - usando query ricorsiva per ente: {ente_nome}")
                    
                    # Prima ottieni l'ID dell'ente parent dal nome
                    cur.execute("SELECT id FROM enti_militari WHERE nome = %s", (ente_nome,))
                    parent_result = cur.fetchone()
                    
                    if not parent_result:
                        return jsonify({'error': f'Ente parent "{ente_nome}" non trovato'}), 404
                    
                    parent_id = parent_result['id']
                    
                    # Costruisci filtri aggiuntivi per la query ricorsiva
                    additional_filters = []
                    recursive_params = [parent_id]
                    
                    if carattere_filter:
                        additional_filters.append("e.carattere = %s")
                        recursive_params.append(carattere_filter)
                    if tipo_evento:
                        additional_filters.append("e.tipo_evento = %s")
                        recursive_params.append(tipo_evento)
                    
                    where_clause_recursive = date_filter
                    if additional_filters:
                        where_clause_recursive += " AND " + " AND ".join(additional_filters)
                    
                    # Query ricorsiva per ottenere tutti gli eventi degli enti dipendenti
                    cur.execute(f"""
                        WITH RECURSIVE gerarchia_enti AS (
                            -- Caso base: ente selezionato
                            SELECT id, nome, parent_id, 0 as livello_rel
                            FROM enti_militari 
                            WHERE id = %s
                            
                            UNION ALL
                            
                            -- Caso ricorsivo: tutti gli enti dipendenti
                            SELECT em.id, em.nome, em.parent_id, g.livello_rel + 1
                            FROM enti_militari em
                            INNER JOIN gerarchia_enti g ON em.parent_id = g.id
                        )
                        SELECT 
                            e.id,
                            e.data_evento,
                            e.data_msg_evento,
                            e.prot_msg_evento,
                            e.carattere,
                            e.tipo_evento,
                            e.rife_evento,
                            e.note,
                            em.nome as ente_nome,
                            te.nome as tipologia_nome,
                            te.descrizione as tipologia_descrizione,
                            u.nome || ' ' || u.cognome as creato_da_nome
                        FROM eventi e
                        JOIN enti_militari em ON e.ente_id = em.id
                        JOIN gerarchia_enti g ON em.id = g.id  -- Include solo enti nella gerarchia
                        LEFT JOIN tipologia_evento te ON e.tipologia_evento_id = te.id
                        LEFT JOIN utenti u ON e.creato_da = u.id
                        WHERE {where_clause_recursive}
                        ORDER BY e.data_msg_evento DESC, e.id DESC
                        LIMIT 1000
                    """, recursive_params)
                    
                else:
                    # Livelli 0, 1, 3+ - usa query standard (non ricorsiva)
                    print(f"[EVENTI API] Livello {level} - usando query standard")
                    
                    where_conditions = [date_filter]
                    params = []
                    
                    if carattere_filter:
                        where_conditions.append("e.carattere = %s")
                        params.append(carattere_filter)
                    if tipo_evento:
                        where_conditions.append("e.tipo_evento = %s")
                        params.append(tipo_evento)
                    if ente_nome:
                        where_conditions.append("em.nome = %s")
                        params.append(ente_nome)
                    
                    where_clause = " AND ".join(where_conditions)
                
                    print(f"[EVENTI API] Esecuzione query standard con WHERE: {where_clause}")
                    print(f"[EVENTI API] Parametri query: {params}")
                    
                    # Query corretta con struttura database reale
                    cur.execute(f"""
                        SELECT 
                            e.id,
                            e.data_evento,
                            e.data_msg_evento,
                            e.prot_msg_evento,
                            e.carattere,
                            e.tipo_evento,
                            e.rife_evento,
                            e.note,
                            em.nome as ente_nome,
                            te.nome as tipologia_nome,
                            te.descrizione as tipologia_descrizione,
                            u.nome || ' ' || u.cognome as creato_da_nome
                        FROM eventi e
                        JOIN enti_militari em ON e.ente_id = em.id
                        LEFT JOIN tipologia_evento te ON e.tipologia_evento_id = te.id
                        LEFT JOIN utenti u ON e.creato_da = u.id
                        WHERE {where_clause}
                        ORDER BY e.data_msg_evento DESC, e.id DESC
                        LIMIT 100
                    """, params)
                
                results = cur.fetchall()
                
                print(f"[EVENTI API] Query eseguita, risultati trovati: {len(results)}")
                if results:
                    print(f"[EVENTI API] Primo risultato: ID={results[0]['id']}, Ente={results[0]['ente_nome']}")
                else:
                    print(f"[EVENTI API] NESSUN RISULTATO - Query: {where_clause}")
                    print(f"[EVENTI API] Parametri query: {params}")

                # Calcola statistiche caratteri per validazione
                character_stats = {'positivi': 0, 'negativi': 0, 'totale': len(results)}
                for row in results:
                    if row['carattere']:
                        carattere_norm = row['carattere'].lower().strip()
                        if carattere_norm == 'positivo':
                            character_stats['positivi'] += 1
                        elif carattere_norm == 'negativo':
                            character_stats['negativi'] += 1
                
                print(f"[EVENTI API] Statistiche caratteri: {character_stats}")
                
        finally:
            conn.close()
            
        # Formatta i risultati - AGGIORNATO con nuovi campi
        try:
            formatted_results = [{
                'id': row['id'],
                'data_evento': row['data_evento'].strftime('%d/%m/%Y') if row['data_evento'] else '',
                'data_msg_evento': row['data_msg_evento'].strftime('%d/%m/%Y') if row['data_msg_evento'] else '',
                'prot_msg_evento': row['prot_msg_evento'] or '',
                'carattere': row['carattere'],
                'tipo_evento': row['tipo_evento'], 
                'ente_nome': row['ente_nome'],
                'tipologia_nome': row['tipologia_nome'] or '',
                'tipologia_descrizione': row['tipologia_descrizione'] or '',
                'rife_evento': row['rife_evento'],
                'note': row['note'] or '',
                'creato_da': row['creato_da_nome'] or 'N/D'
            } for row in results]
        except Exception as format_error:
            print(f"[EVENTI API] Errore formattazione risultati: {format_error}")
            # Return basic format se la formattazione fallisce
            formatted_results = [{
                'id': row['id'],
                'data_evento': str(row['data_evento']) if row['data_evento'] else '',
                'data_msg_evento': str(row['data_msg_evento']) if row['data_msg_evento'] else '',
                'prot_msg_evento': str(row['prot_msg_evento']) if row['prot_msg_evento'] else '',
                'carattere': str(row['carattere']) if row['carattere'] else '',
                'tipo_evento': str(row['tipo_evento']) if row['tipo_evento'] else '', 
                'ente_nome': str(row['ente_nome']) if row['ente_nome'] else '',
                'tipologia_nome': str(row['tipologia_nome']) if row['tipologia_nome'] else '',
                'tipologia_descrizione': str(row['tipologia_descrizione']) if row['tipologia_descrizione'] else '',
                'rife_evento': row['rife_evento'] if row['rife_evento'] else None,
                'note': str(row['note']) if row['note'] else '',
                'creato_da': str(row['creato_da_nome']) if row['creato_da_nome'] else 'N/D'
            } for row in results]
        
        # NEW: Se richiesta aggregazione per grafico, restituisci dati in formato chart
        if aggregate_for_chart == 'true' and level == '3':
            print(f"[EVENTI API] Livello 3 - Preparazione dati aggregati per grafico")
            
            # Aggrega eventi per mese per creare grafico temporale
            from collections import defaultdict
            from datetime import datetime
            
            monthly_data = defaultdict(int)
            
            for event in results:
                try:
                    if event['data_msg_evento']:
                        # Estrai anno-mese dalla data
                        date_obj = event['data_msg_evento']
                        if isinstance(date_obj, str):
                            date_obj = datetime.strptime(date_obj, '%Y-%m-%d')
                        
                        month_key = date_obj.strftime('%Y-%m')
                        monthly_data[month_key] += 1
                except Exception as e:
                    print(f"[EVENTI API] Errore parsing data: {e}")
                    continue
            
            # Ordina per mese e prepara dati chart
            sorted_months = sorted(monthly_data.keys())
            labels = []
            values = []
            
            for month in sorted_months:
                try:
                    month_obj = datetime.strptime(month, '%Y-%m')
                    # Formato italiano per le etichette
                    month_label = month_obj.strftime('%b %Y')
                    labels.append(month_label)
                    values.append(monthly_data[month])
                except:
                    labels.append(month)
                    values.append(monthly_data[month])
            
            # Colori per il grafico livello 3
            colors = ['rgba(74, 144, 226, 0.8)' for _ in values]
            
            print(f"[EVENTI API] Dati chart generati: {len(labels)} mesi, {sum(values)} eventi totali")
            
            return jsonify({
                'success': True,
                'labels': labels,
                'data': values,
                'backgroundColor': colors,
                'stats': {
                    'total_events': sum(values),
                    'character_stats': character_stats
                },
                'chart_data': True  # Indica che sono dati per grafico
            })
        
        # Risposta standard per dettagli
        print(f"[EVENTI API] Ritorno risultati: {len(formatted_results)} eventi con stats: {character_stats}")
        return jsonify({
            'success': True,
            'data': formatted_results,
            'total': len(formatted_results),
            'character_stats': character_stats  # Add character statistics to response
        })
        
    except Exception as e:
        print(f"[EVENTI API] ERRORE GENERALE: {e}")
        import traceback
        print(f"[EVENTI API] Stack trace completo:")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/test-dettagli')
@login_required
def api_test_dettagli():
    """API di test semplificata per debug errore 500"""
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    try:
        print("[EVENTI TEST] Inizio test API semplificata...")
        
        conn = get_auth_db_connection()
        print("[EVENTI TEST] Connessione database ottenuta")
        
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                print("[EVENTI TEST] Cursor creato")
                
                # Test query molto semplice
                cur.execute("SELECT COUNT(*) as total FROM eventi LIMIT 1")
                result = cur.fetchone()
                print(f"[EVENTI TEST] Query test eseguita, risultato: {result}")
                
                # Debug: Verifica struttura tabella eventi
                cur.execute("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'eventi'
                    ORDER BY ordinal_position
                """)
                columns = cur.fetchall()
                print(f"[EVENTI TEST] Colonne tabella eventi:")
                for col in columns:
                    print(f"  - {col['column_name']} ({col['data_type']})")
                
                return jsonify({
                    'success': True,
                    'test_result': dict(result),
                    'columns': [dict(col) for col in columns],
                    'message': 'Test API funzionante'
                })
                
        finally:
            conn.close()
            print("[EVENTI TEST] Connessione chiusa")
            
    except Exception as e:
        print(f"[EVENTI TEST] ERRORE: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'test': 'failed'}), 500

@eventi.route('/api/statistiche')
@login_required
def api_eventi_statistiche():
    """API per statistiche generali eventi del periodo"""
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    carattere_filter = request.args.get('carattere', '')
    
    try:
        # Calcola il filtro temporale
        if period == 'custom' and start_date and end_date:
            date_filter = f"data_evento BETWEEN '{start_date}' AND '{end_date}'"
        else:
            days_map = {'week': 7, 'month': 30, 'quarter': 90, 'year': 365}
            days = days_map.get(period, 30)
            date_filter = f"data_evento >= CURRENT_DATE - INTERVAL '{days} days'"
        
        # Aggiungi filtro carattere se specificato
        where_conditions = [date_filter]
        if carattere_filter and carattere_filter in ['positivo', 'negativo']:
            where_conditions.append(f"carattere = '{carattere_filter}'")
        
        where_clause = ' AND '.join(where_conditions)
        
        conn = get_auth_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"""
                    SELECT 
                        COUNT(*) as totale,
                        SUM(CASE WHEN carattere = 'positivo' THEN 1 ELSE 0 END) as positivi,
                        SUM(CASE WHEN carattere = 'negativo' THEN 1 ELSE 0 END) as negativi,
                        COUNT(DISTINCT ente_id) as enti_coinvolti
                    FROM eventi 
                    WHERE {where_clause}
                """)
                result = cur.fetchone()
                
        finally:
            conn.close()
            
        return jsonify({
            'success': True,
            'stats': {
                'totale': result['totale'] or 0,
                'positivi': result['positivi'] or 0,
                'negativi': result['negativi'] or 0,
                'enti': result['enti_coinvolti'] or 0
            }
        })
        
    except Exception as e:
        print(f"[EVENTI] Errore API statistiche: {e}")
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/drill-down')
@login_required
def api_eventi_drill_down():
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    level = request.args.get('level', '0')
    selection_level_0 = request.args.get('selection_level_0', '')
    
    if level == '0':
        return api_eventi_categorie()
    
    elif level == '1':
        print(f"[EVENTI API] Drill-down Livello 1: selection_level_0='{selection_level_0}'")
        if not selection_level_0:
            return jsonify({'error': 'selection_level_0 richiesto per livello 1'}), 400
        
        # Converte "Tipo A" in "tipo_a"
        if selection_level_0.startswith('Tipo '):
            tipo_db = f"tipo_{selection_level_0.split(' ')[1].lower()}"
        else:
            tipo_db = selection_level_0
        
        print(f"[EVENTI API] Convertito in tipo_db: '{tipo_db}'")
        
        try:
            conn = get_auth_db_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    -- Approccio semplice: query diretta con logica a step
                    SELECT 
                        CASE 
                            -- Se l'ente ha parent_id NULL: è la radice, usa se stesso
                            WHEN em.parent_id IS NULL THEN em.nome
                            
                            -- Se il parent ha parent_id NULL: è figlio diretto della radice
                            WHEN p1.parent_id IS NULL THEN em.nome
                            
                            -- Se il grandparent ha parent_id NULL: usa parent
                            WHEN p2.parent_id IS NULL THEN p1.nome
                            
                            -- Se il great-grandparent ha parent_id NULL: usa grandparent
                            WHEN p3.parent_id IS NULL THEN p2.nome
                            
                            -- Se il great-great-grandparent ha parent_id NULL: usa great-grandparent  
                            WHEN p4.parent_id IS NULL THEN p3.nome
                            
                            -- Fallback per livelli più profondi: 'ALTRO'
                            ELSE 'ALTRO'
                        END as ente,
                        COUNT(*) as count
                    FROM eventi e
                    JOIN enti_militari em ON e.ente_id = em.id
                    LEFT JOIN enti_militari p1 ON em.parent_id = p1.id
                    LEFT JOIN enti_militari p2 ON p1.parent_id = p2.id
                    LEFT JOIN enti_militari p3 ON p2.parent_id = p3.id
                    LEFT JOIN enti_militari p4 ON p3.parent_id = p4.id
                    WHERE e.tipo_evento = %s
                    AND e.data_msg_evento >= CURRENT_DATE - INTERVAL '365 days'
                    AND check_ente_comando_logistico(em.id) = true
                    GROUP BY 
                        CASE 
                            WHEN em.parent_id IS NULL THEN em.nome
                            WHEN p1.parent_id IS NULL THEN em.nome
                            WHEN p2.parent_id IS NULL THEN p1.nome
                            WHEN p3.parent_id IS NULL THEN p2.nome
                            WHEN p4.parent_id IS NULL THEN p3.nome
                            ELSE 'ALTRO'
                        END
                    HAVING 
                        CASE 
                            WHEN em.parent_id IS NULL THEN em.nome
                            WHEN p1.parent_id IS NULL THEN em.nome
                            WHEN p2.parent_id IS NULL THEN p1.nome
                            WHEN p3.parent_id IS NULL THEN p2.nome
                            WHEN p4.parent_id IS NULL THEN p3.nome
                            ELSE 'ALTRO'
                        END <> 'ALTRO'
                    ORDER BY CASE
                        WHEN p1.parent_id IS NULL THEN p1.nome
                        WHEN p2.parent_id IS NULL THEN p1.nome
                        WHEN p3.parent_id IS NULL THEN p2.nome
                        WHEN p4.parent_id IS NULL THEN p3.nome
                        ELSE 'ALTRO'
                    END
                """, [tipo_db])
                
                results = cur.fetchall()
                print(f"[EVENTI API] Query risultati: {len(results)} enti trovati")
                
                labels = [row['ente'] for row in results]
                values = [row['count'] for row in results]
                
                print(f"[EVENTI API] Risultati finali: labels={labels}, values={values}")
                print(f"[EVENTI API] Totale eventi: {sum(values)}")
                
                return jsonify({
                    'success': True,
                    'data': {
                        'labels': labels,
                        'values': values
                    }
                })
                
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            conn.close()
    
    return jsonify({'error': f'Livello {level} non implementato'}), 400


@eventi.route('/api/cerca-seguiti')
@login_required
def cerca_eventi_seguiti():
    """API per cercare eventi da utilizzare come seguiti"""
    
    if not is_operatore_or_above():
        return jsonify({'error': 'Accesso negato'}), 403
    
    # Parametri di ricerca
    protocollo = request.args.get('protocollo', '').strip().upper()
    data_msg = request.args.get('data', '').strip()
    
    print(f"[SEGUITI API] Ricerca eventi - protocollo: '{protocollo}', data: '{data_msg}'")
    
    if not protocollo and not data_msg:
        return jsonify({'error': 'Almeno un criterio di ricerca è richiesto'}), 400
    
    try:
        with get_auth_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                
                # Costruisci la query dinamicamente
                where_conditions = []
                params = []
                
                if protocollo:
                    where_conditions.append("UPPER(e.prot_msg_evento) LIKE %s")
                    params.append(f"%{protocollo}%")
                
                if data_msg:
                    where_conditions.append("e.data_msg_evento = %s")
                    params.append(data_msg)
                
                where_clause = " AND ".join(where_conditions)
                
                query = f"""
                    SELECT 
                        e.id,
                        e.prot_msg_evento,
                        e.data_msg_evento,
                        e.carattere,
                        e.tipo_evento,
                        e.note as dettagli_evento,
                        e.creato_il,
                        em.nome as ente_nome,
                        em.codice as ente_codice
                    FROM eventi e
                    INNER JOIN enti_militari em ON e.ente_id = em.id
                    WHERE {where_clause}
                        AND check_ente_comando_logistico(em.id) = true
                    ORDER BY e.data_msg_evento DESC, e.creato_il DESC
                    LIMIT 50
                """
                
                print(f"[SEGUITI API] Query: {query}")
                print(f"[SEGUITI API] Params: {params}")
                
                cur.execute(query, params)
                eventi = cur.fetchall()
                
                print(f"[SEGUITI API] Trovati {len(eventi)} eventi")
                
                # Converti RealDictRow in dict normali per JSON
                risultati = []
                for evento in eventi:
                    risultati.append({
                        'id': evento['id'],
                        'prot_msg_evento': evento['prot_msg_evento'],
                        'data_msg_evento': evento['data_msg_evento'].isoformat() if evento['data_msg_evento'] else None,
                        'carattere': evento['carattere'],
                        'tipo_evento': evento['tipo_evento'],
                        'dettagli_evento': evento['dettagli_evento'],
                        'ente_nome': evento['ente_nome'],
                        'ente_codice': evento['ente_codice'],
                        'creato_il': evento['creato_il'].isoformat() if evento['creato_il'] else None
                    })
                
                return jsonify(risultati)
                
    except Exception as e:
        print(f"[SEGUITI API] Errore: {e}")
        import traceback
        print(f"[SEGUITI API] Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Errore durante la ricerca: {str(e)}'}), 500


@eventi.route('/api/debug-tipologie')
@login_required
def debug_tipologie():
    """Debug endpoint per controllare tipologie evento"""
    if not is_admin():
        return jsonify({'error': 'Accesso negato'}), 403
    
    try:
        with get_auth_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Verifica tutte le tipologie (anche non attive)
                cur.execute("SELECT id, nome, descrizione, attivo FROM tipologia_evento ORDER BY id")
                tutte_tipologie = cur.fetchall()
                
                # Verifica quanti eventi hanno tipologia_evento_id
                cur.execute("""
                    SELECT 
                        COUNT(*) as totale_eventi,
                        COUNT(tipologia_evento_id) as eventi_con_tipologia,
                        COUNT(*) - COUNT(tipologia_evento_id) as eventi_senza_tipologia
                    FROM eventi
                """)
                statistiche_eventi = cur.fetchone()
                
                # Esempi di eventi per debug
                cur.execute("""
                    SELECT id, prot_msg_evento, tipologia_evento_id, ente_id
                    FROM eventi 
                    ORDER BY id DESC 
                    LIMIT 5
                """)
                esempi_eventi = cur.fetchall()
                
                return jsonify({
                    'tipologie_totali': len(tutte_tipologie),
                    'tipologie': [dict(row) for row in tutte_tipologie],
                    'statistiche_eventi': dict(statistiche_eventi),
                    'esempi_eventi': [dict(row) for row in esempi_eventi]
                })
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@eventi.route('/api/init-tipologie', methods=['POST'])
@login_required
def init_tipologie():
    """Inizializza tipologie evento di base se non esistono"""
    if not is_admin():
        return jsonify({'error': 'Accesso negato'}), 403
    
    tipologie_base = [
        {'nome': 'INCIDENTE STRADALE', 'descrizione': 'INCIDENTI STRADALI CHE COINVOLGONO PERSONALE O MEZZI MILITARI'},
        {'nome': 'INCIDENTE AERONAUTICO', 'descrizione': 'INCIDENTI CHE COINVOLGONO AEROMOBILI MILITARI'},
        {'nome': 'INCIDENTE NAVALE', 'descrizione': 'INCIDENTI CHE COINVOLGONO UNITÀ NAVALI'},
        {'nome': 'INCIDENTE DI SERVIZIO', 'descrizione': 'INCIDENTI OCCORSI DURANTE IL SERVIZIO MILITARE'},
        {'nome': 'MALATTIA PROFESSIONALE', 'descrizione': 'MALATTIE CORRELATE ALL\'ATTIVITÀ LAVORATIVA MILITARE'},
        {'nome': 'EVENTO DI SICUREZZA', 'descrizione': 'EVENTI RELATIVI ALLA SICUREZZA DELLE INSTALLAZIONI'},
        {'nome': 'ALTRO', 'descrizione': 'ALTRI TIPI DI EVENTI NON CLASSIFICABILI NELLE CATEGORIE PRECEDENTI'}
    ]
    
    try:
        with get_auth_db_connection() as conn:
            with conn.cursor() as cur:
                tipologie_create = 0
                
                for tipologia in tipologie_base:
                    # Verifica se esiste già
                    cur.execute("SELECT id FROM tipologia_evento WHERE nome = %s", (tipologia['nome'],))
                    if not cur.fetchone():
                        # Crea la tipologia
                        cur.execute("""
                            INSERT INTO tipologia_evento (nome, descrizione, attivo)
                            VALUES (%s, %s, true)
                        """, (tipologia['nome'], tipologia['descrizione']))
                        tipologie_create += 1
                
                conn.commit()
                
                return jsonify({
                    'success': True,
                    'tipologie_create': tipologie_create,
                    'messaggio': f'Sono state create {tipologie_create} tipologie di base'
                })
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@eventi.errorhandler(500)
def internal_error(error):
    # Se è una richiesta API, restituisci JSON
    if request.path.startswith('/eventi/api/'):
        return jsonify({'error': 'Errore interno del server'}), 500
    
    # Altrimenti, gestisci come una normale pagina web
    flash('Errore interno nel sistema eventi', 'error')
    return redirect(url_for('main.dashboard'))