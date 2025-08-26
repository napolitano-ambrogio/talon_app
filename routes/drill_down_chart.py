# routes/drill_down_chart.py - Blueprint per gestione Drill-Down Chart
from flask import Blueprint, render_template, request, jsonify
from psycopg2.extras import RealDictCursor
from datetime import datetime

# Import dal modulo auth (usa PostgreSQL)
from auth import (
    login_required, permission_required,
    get_current_user_info, log_user_action,
    is_admin, is_operatore_or_above,
    get_auth_db_connection
)

# ===========================================
# DEFINIZIONE BLUEPRINT
# ===========================================
drill_down_bp = Blueprint(
    'drill_down',
    __name__,
    url_prefix='/drill-down',
    template_folder='../templates/components',
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
# ROUTE PRINCIPALE
# ===========================================

@drill_down_bp.route('/')
@login_required
def index():
    """Vista principale per il grafico drill-down"""
    # Usa il template standalone che non richiede base.html
    return render_template('drill-down_chart.html')

@drill_down_bp.route('/test')
def test():
    """Test route semplice per verificare che funzioni"""
    return """
    <html>
    <head><title>TEST DRILL DOWN</title></head>
    <body style="background: red !important; padding: 100px;">
        <h1 style="color: white;">TEST DRILL DOWN ROUTE FUNZIONA!</h1>
        <div style="background: green; padding: 50px; margin: 50px; border: 10px solid blue;">
            <h2>Container Test</h2>
        </div>
    </body>
    </html>
    """

# ===========================================
# API ENDPOINTS
# ===========================================

@drill_down_bp.route('/api/categorie')
@login_required
def api_categorie():
    """API per ottenere le categorie principali di attività"""
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Determina l'intervallo temporale
            if period == 'custom' and start_date and end_date:
                # Usa intervallo personalizzato
                date_condition = "a.data_inizio >= %s AND a.data_inizio <= %s"
                date_params = (start_date, end_date)
            else:
                # Usa intervallo predefinito
                interval_map = {
                    'week': '7 days',
                    'month': '30 days', 
                    'quarter': '90 days',
                    'year': '365 days'
                }
                interval = interval_map.get(period, '30 days')
                date_condition = "a.data_inizio >= CURRENT_DATE - INTERVAL %s"
                date_params = (interval,)
            
            # Verifica se le tabelle esistono
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
            tables = [row['table_name'] for row in cur.fetchall()]
            
            if 'attivita' not in tables or 'tipologie_attivita' not in tables:
                return jsonify({'success': False, 'error': 'Tabelle database non disponibili'}), 500
            
            # Query per categorie principali - usa le tipologie parent (root)
            query = f"""
                    SELECT 
                        t_parent.nome as label,
                        COUNT(DISTINCT a.id) as value
                    FROM attivita a
                    JOIN tipologie_attivita t ON a.tipologia_id = t.id
                    JOIN tipologie_attivita t_parent ON t.parent_id = t_parent.id
                    WHERE {date_condition}
                    GROUP BY t_parent.id, t_parent.nome
                    HAVING COUNT(DISTINCT a.id) > 0
                    ORDER BY value DESC
                """
                
            cur.execute(query, date_params)
            results = cur.fetchall()
            
            if not results:
                return jsonify({'success': False, 'error': 'Nessun dato disponibile nel database'}), 404
            
            labels = [r['label'] for r in results]
            values = [r['value'] for r in results]
            
            # Log per audit
            log_user_action(
                get_current_user_info()['id'], 
                'drill_down_view',
                f'Visualizzazione categorie periodo: {period}'
            )
            
            return jsonify({
                'success': True,
                'data': {
                    'labels': labels,
                    'values': values
                }
            })
            
    except Exception as e:
        log_user_action(
            get_current_user_info()['id'], 
            'drill_down_error',
            f'Errore categorie: {str(e)}'
        )
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@drill_down_bp.route('/api/sottocategorie')
@login_required
def api_sottocategorie():
    """API per ottenere le sottocategorie di una categoria"""
    categoria = request.args.get('categoria')
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    if not categoria:
        return jsonify({'success': False, 'error': 'Categoria richiesta'}), 400
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Verifica esistenza tabelle
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
            tables = [row['table_name'] for row in cur.fetchall()]
            
            if 'attivita' not in tables or 'tipologie_attivita' not in tables:
                return jsonify({'success': False, 'error': 'Tabelle database non disponibili'}), 500
            
            # Determina l'intervallo temporale
            if period == 'custom' and start_date and end_date:
                # Usa intervallo personalizzato
                date_condition = "a.data_inizio >= %s AND a.data_inizio <= %s"
                # La categoria va sempre alla fine per il parametro ILIKE
                date_params = (start_date, end_date, categoria)
            else:
                # Usa intervallo predefinito
                interval_map = {
                    'week': '7 days',
                    'month': '30 days',
                    'quarter': '90 days',
                    'year': '365 days'
                }
                interval = interval_map.get(period, '30 days')
                date_condition = "a.data_inizio >= CURRENT_DATE - INTERVAL %s"
                # La categoria va sempre alla fine per il parametro ILIKE
                date_params = (interval, categoria)
            
            # Query per sottocategorie - trova figli della categoria selezionata
            query = f"""
                SELECT 
                    t.nome as label,
                    COUNT(DISTINCT a.id) as value
                FROM attivita a
                JOIN tipologie_attivita t ON a.tipologia_id = t.id
                JOIN tipologie_attivita t_parent ON t.parent_id = t_parent.id
                WHERE {date_condition}
                  AND t_parent.nome ILIKE %s  -- Categoria parent selezionata
                GROUP BY t.id, t.nome
                HAVING COUNT(DISTINCT a.id) > 0
                ORDER BY value DESC
                LIMIT 15
            """
            
            cur.execute(query, date_params)
            results = cur.fetchall()
            
            if not results:
                return jsonify({'success': False, 'error': 'Nessun dato disponibile per questa categoria'}), 404
            
            labels = [r['label'] for r in results]
            values = [r['value'] for r in results]
            
            return jsonify({
                'success': True,
                'data': {
                    'labels': labels,
                    'values': values
                }
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@drill_down_bp.route('/api/enti')
@login_required
def api_enti():
    """API per ottenere gli enti che svolgono una sottocategoria di attività"""
    sottocategoria = request.args.get('sottocategoria')
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    if not sottocategoria:
        return jsonify({'success': False, 'error': 'Sottocategoria richiesta'}), 400
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Determina l'intervallo temporale
            if period == 'custom' and start_date and end_date:
                # Usa intervallo personalizzato
                date_condition = "a.data_inizio >= %s AND a.data_inizio <= %s"
                date_params = (start_date, end_date)
            else:
                # Usa intervallo predefinito
                interval_map = {
                    'week': '7 days',
                    'month': '30 days',
                    'quarter': '90 days',
                    'year': '365 days'
                }
                interval = interval_map.get(period, '30 days')
                date_condition = "a.data_inizio >= CURRENT_DATE - INTERVAL %s"
                date_params = (interval,)
            
            # Query per enti coinvolti usando ente_svolgimento_id
            query = f"""
                SELECT 
                    COALESCE(em.nome, 'Ente non specificato') as label,
                    COUNT(DISTINCT a.id) as value
                FROM attivita a
                LEFT JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                LEFT JOIN tipologie_attivita t ON a.tipologia_id = t.id
                WHERE t.nome ILIKE %s
                    AND {date_condition}
                GROUP BY em.nome, em.id
                HAVING COUNT(DISTINCT a.id) > 0
                ORDER BY value DESC
                LIMIT 15
            """
            
            # Prepara il pattern di ricerca e i parametri
            search_pattern = f'%{sottocategoria}%'
            final_params = (search_pattern,) + date_params
            
            cur.execute(query, final_params)
            results = cur.fetchall()
            
            if not results:
                return jsonify({'success': False, 'error': 'Nessun ente trovato per questa sottocategoria'}), 404
            
            labels = [r['label'] for r in results]
            values = [r['value'] for r in results]
            
            return jsonify({
                'success': True,
                'data': {
                    'labels': labels,
                    'values': values
                }
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@drill_down_bp.route('/api/dettagli')
@login_required
def api_dettagli():
    """API per ottenere i dettagli delle attività di un ente"""
    ente = request.args.get('ente')
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    if not ente:
        return jsonify({'success': False, 'error': 'Ente richiesto'}), 400
    
    # Controllo permessi per dettagli
    if not is_operatore_or_above():
        return jsonify({'success': False, 'error': 'Permessi insufficienti'}), 403
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Determina l'intervallo temporale
            if period == 'custom' and start_date and end_date:
                # Usa intervallo personalizzato
                date_condition = "a.data_inizio >= %s AND a.data_inizio <= %s"
                date_params = (ente, start_date, end_date)
            else:
                # Usa intervallo predefinito
                interval_map = {
                    'week': '7 days',
                    'month': '30 days',
                    'quarter': '90 days',
                    'year': '365 days'
                }
                interval = interval_map.get(period, '30 days')
                date_condition = "a.data_inizio >= CURRENT_DATE - INTERVAL %s"
                date_params = (ente, interval)
            
            # Query dettagliata per attività dell'ente (sintassi PostgreSQL corretta)
            query = f"""
                SELECT 
                    a.id,
                    a.descrizione,
                    a.data_inizio::date as data,
                    a.data_fine::date as data_fine,
                    CASE 
                        -- Se inizia in futuro: pianificata
                        WHEN a.data_inizio > CURRENT_DATE THEN 'Pianificata'
                        -- Se finita nel passato: conclusa 
                        WHEN a.data_fine IS NOT NULL AND a.data_fine < CURRENT_DATE THEN 'Conclusa'
                        -- Se attivita di un solo giorno e quel giorno è passato: conclusa
                        WHEN a.data_fine IS NULL AND a.data_inizio < CURRENT_DATE THEN 'Conclusa'  
                        -- Se è in corso (oggi o non ancora finita): in corso
                        ELSE 'In corso'
                    END as stato,
                    CASE 
                        WHEN a.data_fine IS NOT NULL THEN 
                            GREATEST((a.data_fine - a.data_inizio + 1), 1)
                        WHEN a.data_inizio < CURRENT_DATE THEN 
                            -- Attività senza data_fine ma nel passato = durata 1 giorno
                            1
                        ELSE 
                            -- Attività in corso o futura
                            GREATEST((CURRENT_DATE - a.data_inizio + 1), 1)
                    END as durata_giorni,
                    u.username as responsabile,
                    t.nome as tipologia,
                    o.nome_breve as operazione
                FROM attivita a
                LEFT JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                LEFT JOIN utenti u ON a.creato_da = u.id
                LEFT JOIN tipologie_attivita t ON a.tipologia_id = t.id
                LEFT JOIN operazioni o ON a.operazione_id = o.id
                WHERE em.nome = %s
                    AND {date_condition}
                ORDER BY a.data_inizio DESC
            """
            
            cur.execute(query, date_params)
            results = cur.fetchall()
            
            # Formatta i risultati
            details = []
            for r in results:
                # Calcola durata in giorni (minimo 1 giorno)
                durata_str = 'N/D'
                if r['durata_giorni'] is not None:
                    if hasattr(r['durata_giorni'], 'days'):
                        # È un oggetto timedelta
                        giorni = max(r['durata_giorni'].days, 1)
                    else:
                        # Prova a convertire come intero
                        try:
                            giorni = max(int(r['durata_giorni']), 1)
                        except:
                            giorni = 1
                    
                    durata_str = f'{giorni} giorn{"o" if giorni == 1 else "i"}'
                
                # Formatta data inizio in formato GG/MM/AAAA
                data_inizio_formatted = r['data'].strftime('%d/%m/%Y') if r['data'] else 'N/D'
                
                # Formatta data fine (// se durata 1 giorno, altrimenti GG/MM/AAAA)
                if giorni == 1:
                    data_fine_formatted = '//'
                elif r['data_fine']:
                    data_fine_formatted = r['data_fine'].strftime('%d/%m/%Y')
                else:
                    data_fine_formatted = 'In corso'
                
                details.append({
                    'id': f'ATT{r["id"]:04d}',
                    'data_inizio': data_inizio_formatted,
                    'data_fine': data_fine_formatted,
                    'descrizione': r['descrizione'] or f'Attività #{r["id"]}',
                    'durata': durata_str,
                    'stato': r['stato'],
                    'responsabile': r['responsabile'] or 'Sistema',
                    'in_favore_di': r['operazione'] or 'N/D'
                })
            
            # Log visualizzazione dettagli
            log_user_action(
                get_current_user_info()['id'],
                'drill_down_details',
                f'Visualizzati dettagli ente: {ente}'
            )
            
            return jsonify({
                'success': True,
                'data': details
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@drill_down_bp.route('/api/enti-coinvolti')
@login_required
def api_enti_coinvolti():
    """API per ottenere il numero di enti coinvolti per il livello specifico"""
    level = request.args.get('level', '0')
    categoria = request.args.get('categoria', '')
    sottocategoria = request.args.get('sottocategoria', '')
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Determina l'intervallo temporale
            if period == 'custom' and start_date and end_date:
                date_condition = "a.data_inizio >= %s AND a.data_inizio <= %s"
                date_params_base = (start_date, end_date)
            else:
                interval_map = {
                    'week': '7 days',
                    'month': '30 days',
                    'quarter': '90 days',
                    'year': '365 days'
                }
                interval = interval_map.get(period, '30 days')
                date_condition = "a.data_inizio >= CURRENT_DATE - INTERVAL %s"
                date_params_base = (interval,)
            
            if level == '0':
                # Livello 0: tutti gli enti coinvolti nel periodo
                query = f"""
                    SELECT COUNT(DISTINCT em.id) as enti_count
                    FROM attivita a
                    LEFT JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                    WHERE {date_condition}
                        AND em.id IS NOT NULL
                """
                cur.execute(query, date_params_base)
                
            elif level == '1' and categoria:
                # Livello 1: enti coinvolti nella categoria specifica
                query = f"""
                    SELECT COUNT(DISTINCT em.id) as enti_count
                    FROM attivita a
                    JOIN tipologie_attivita t ON a.tipologia_id = t.id
                    JOIN tipologie_attivita t_parent ON t.parent_id = t_parent.id
                    LEFT JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                    WHERE {date_condition}
                        AND t_parent.nome ILIKE %s
                        AND em.id IS NOT NULL
                """
                cur.execute(query, date_params_base + (categoria,))
                
            elif level == '2' and sottocategoria:
                # Livello 2: enti coinvolti nella sottocategoria specifica
                query = f"""
                    SELECT COUNT(DISTINCT em.id) as enti_count
                    FROM attivita a
                    LEFT JOIN tipologie_attivita t ON a.tipologia_id = t.id
                    LEFT JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                    WHERE t.nome ILIKE %s
                        AND {date_condition}
                        AND em.id IS NOT NULL
                """
                search_pattern = f'%{sottocategoria}%'
                cur.execute(query, (search_pattern,) + date_params_base)
            else:
                return jsonify({'success': False, 'error': 'Parametri non validi'}), 400
            
            result = cur.fetchone()
            enti_count = result['enti_count'] if result else 0
            
            return jsonify({
                'success': True,
                'enti_coinvolti': enti_count
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@drill_down_bp.route('/api/statistiche')
@login_required
def api_statistiche():
    """API per statistiche generali del periodo selezionato"""
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Determina l'intervallo temporale
            if period == 'custom' and start_date and end_date:
                date_condition = "a.data_inizio >= %s AND a.data_inizio <= %s"
                date_params = (start_date, end_date)
            else:
                interval_map = {
                    'week': '7 days',
                    'month': '30 days',
                    'quarter': '90 days',
                    'year': '365 days'
                }
                interval = interval_map.get(period, '30 days')
                date_condition = "a.data_inizio >= CURRENT_DATE - INTERVAL %s"
                date_params = (interval,)
            
            # Query per statistiche usando schema reale
            query = f"""
                SELECT 
                    COUNT(DISTINCT a.id) as totale_attivita,
                    COUNT(DISTINCT CASE WHEN a.data_fine IS NULL THEN a.id END) as attivita_in_corso,
                    COUNT(DISTINCT CASE WHEN a.data_fine < CURRENT_DATE THEN a.id END) as attivita_completate,
                    COUNT(DISTINCT CASE WHEN a.data_inizio > CURRENT_DATE THEN a.id END) as attivita_pianificate,
                    COUNT(DISTINCT t.id) as tipologie_coinvolte,
                    COUNT(DISTINCT em.id) as enti_coinvolti
                FROM attivita a
                LEFT JOIN tipologie_attivita t ON a.tipologia_id = t.id
                LEFT JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                WHERE {date_condition}
            """
            
            cur.execute(query, date_params)
            stats = cur.fetchone()
            
            return jsonify({
                'success': True,
                'stats': {
                    'totale': stats['totale_attivita'] or 0,
                    'in_corso': stats['attivita_in_corso'] or 0,
                    'completate': stats['attivita_completate'] or 0,
                    'pianificate': stats['attivita_pianificate'] or 0,
                    'operazioni': stats['tipologie_coinvolte'] or 0,
                    'enti': stats['enti_coinvolti'] or 0
                }
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@drill_down_bp.route('/api/export')
@login_required
@permission_required('export_data')
def api_export():
    """API per esportare i dati visualizzati"""
    level = request.args.get('level', '0')
    category = request.args.get('category', '')
    period = request.args.get('period', 'month')
    
    # Solo admin e operatori possono esportare
    if not is_operatore_or_above():
        return jsonify({'success': False, 'error': 'Permessi insufficienti'}), 403
    
    try:
        # Prepara i dati per l'export basandosi sul livello
        if level == '0':
            # Esporta categorie principali
            filename = f'drill_down_categorie_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        elif level == '1':
            # Esporta sottocategorie
            filename = f'drill_down_sottocategorie_{category}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        elif level == '2':
            # Esporta enti
            filename = f'drill_down_enti_{category}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        else:
            # Esporta dettagli
            filename = f'drill_down_dettagli_{category}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        
        # Log export
        log_user_action(
            get_current_user_info()['id'],
            'drill_down_export',
            f'Export livello {level}, categoria: {category}'
        )
        
        return jsonify({
            'success': True,
            'filename': filename,
            'message': 'Export completato con successo'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ===========================================
# ERROR HANDLERS
# ===========================================

@drill_down_bp.errorhandler(404)
def not_found(error):
    """Gestione errore 404"""
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'error': 'Endpoint non trovato'}), 404
    return render_template('errors/404.html'), 404

@drill_down_bp.errorhandler(500)
def internal_error(error):
    """Gestione errore 500"""
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'error': 'Errore interno del server'}), 500
    return render_template('errors/500.html'), 500