from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, Response
from datetime import datetime
from psycopg2.extras import RealDictCursor

# Import: auth fornisce la connessione centralizzata a Postgres
from auth import (
    login_required, permission_required,
    admin_required, operatore_or_admin_required,
    log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE,
    get_auth_db_connection  # <-- usa Postgres
)

enti_civili_bp = Blueprint('enti_civili', __name__, template_folder='../templates')

# ===========================================
# DB HELPER (wrapper)
# ===========================================
def get_db_connection():
    return get_auth_db_connection()

# ===========================================
# FUNZIONI HELPER
# ===========================================
def validate_ente_civile_data(form_data, ente_id=None):
    errors = []
    required_fields = ['nome', 'indirizzo']
    for field in required_fields:
        if not form_data.get(field, '').strip():
            errors.append(f'Il campo {field}  obbligatorio.')

    email = form_data.get('email', '').strip()
    if email and '@' not in email:
        errors.append('Formato email non valido.')

    # Validazione CAP rimossa - non più necessaria

    return errors

def check_duplicate_ente_civile(conn, nome, indirizzo, exclude_id=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if exclude_id:
            cur.execute(
                'SELECT id FROM enti_civili WHERE nome = %s AND indirizzo = %s AND id <> %s',
                (nome, indirizzo, exclude_id)
            )
        else:
            cur.execute(
                'SELECT id FROM enti_civili WHERE nome = %s AND indirizzo = %s',
                (nome, indirizzo)
            )
        return cur.fetchone() is not None

def get_enti_civili_stats(conn):
    stats = {}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Totale enti
        cur.execute('SELECT COUNT(*) AS count FROM enti_civili')
        stats['totale'] = int(cur.fetchone()['count'])

        # Statistiche per provincia non più disponibili (colonna eliminata)
        stats['per_provincia'] = []

        # Enti creati negli ultimi 30 giorni
        cur.execute(
            '''SELECT COUNT(*) AS count
               FROM enti_civili
               WHERE data_creazione >= NOW() - INTERVAL '30 days' '''
        )
        stats['recenti'] = int(cur.fetchone()['count'])

        # Enti con email
        cur.execute(
            '''SELECT COUNT(*) AS count
               FROM enti_civili
               WHERE email IS NOT NULL AND TRIM(email) <> '' '''
        )
        stats['con_email'] = int(cur.fetchone()['count'])
    return stats

def check_ente_dependencies(conn, ente_id):
    dependencies = []
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Attivit collegate (partenza/destinazione)
        cur.execute(
            '''SELECT COUNT(*) AS count
               FROM attivita
               WHERE partenza_civile_id = %s OR destinazione_civile_id = %s''',
            (ente_id, ente_id)
        )
        c = int(cur.fetchone()['count'])
        if c > 0:
            dependencies.append(f"{c} attivit collegate")

        # Altre tabelle opzionali (se esistono)
        try:
            cur.execute('SELECT COUNT(*) AS count FROM contratti WHERE ente_civile_id = %s', (ente_id,))
            c = int(cur.fetchone()['count'])
            if c > 0:
                dependencies.append(f"{c} contratti")
        except Exception:
            pass
    return dependencies

# ===========================================
# ROUTE PRINCIPALI
# ===========================================
@enti_civili_bp.route('/enti_civili')
@permission_required('VIEW_ENTI_CIVILI')
def enti_civili():
    """Lista tutti gli enti civili con filtri avanzati (paginata)"""
    user_id = request.current_user['user_id']
    user_role = get_user_role()

    search = request.args.get('search', '').strip()
    # Filtri provincia e citta rimossi
    page = request.args.get('page', 1, type=int)
    per_page = 50

    conn = get_db_connection()
    try:
        enti_civili_list = []
        total_enti = 0
        province = []
        citta_opts = []
        stats = {}

        where = []
        params = []

        if search:
            where.append('(nome ILIKE %s OR indirizzo ILIKE %s)')
            like = f'%{search}%'
            params.extend([like, like])

        # Filtro provincia rimosso

        # Filtro citta rimosso

        where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''

        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Count
                cur.execute(f'SELECT COUNT(*) AS total FROM enti_civili {where_sql}', params)
                total_enti = int(cur.fetchone()['total'])

                # Page
                cur.execute(
                    f'''SELECT *
                        FROM enti_civili
                        {where_sql}
                        ORDER BY nome
                        LIMIT %s OFFSET %s''',
                    params + [per_page, (page - 1) * per_page]
                )
                enti_civili_list = cur.fetchall()

                # Filtri options - Non più necessari con schema semplificato
                province = []
                citta_opts = []

                if is_operatore_or_above():
                    stats = get_enti_civili_stats(conn)

        total_pages = (total_enti + per_page - 1) // per_page

        log_user_action(
            user_id,
            'VIEW_ENTI_CIVILI_LIST',
            f'Visualizzati {len(enti_civili_list)} enti civili (pagina {page}/{total_pages}) - '
            f'Filtri: search={search}',
            'enti_civili'
        )

        return render_template(
            'enti_civili.html',
            enti_civili=enti_civili_list,
            province=province,
            citta_options=citta_opts,
            stats=stats,
            filtri={
                'search': search,
                # Filtri provincia e citta rimossi
            },
            paginazione={
                'page': page,
                'per_page': per_page,
                'total': total_enti,
                'total_pages': total_pages
            },
            user_role=user_role
        )

    except Exception as e:
        flash(f'Errore nel caricamento degli enti civili: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@enti_civili_bp.route('/inserisci_civile')
@operatore_or_admin_required
@permission_required('CREATE_ENTI_CIVILI')
def inserisci_civile_form():
    user_id = request.current_user['user_id']
    log_user_action(user_id, 'ACCESS_CREATE_ENTE_CIVILE_FORM', 'Accesso form creazione ente civile')
    return render_template('inserimento_civile.html')

@enti_civili_bp.route('/salva_civile', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_ENTI_CIVILI')
def salva_civile():
    user_id = request.current_user['user_id']

    # Validazione input
    validation_errors = validate_ente_civile_data(request.form)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('enti_civili.inserisci_civile_form'))

    nome = request.form['nome'].upper().strip()
    indirizzo = request.form['indirizzo'].upper().strip()
    # Campi civico, cap, citta, provincia eliminati dallo schema
    nazione = request.form.get('nazione', 'ITALIA').upper().strip()
    telefono = request.form.get('telefono', '').strip()
    email = request.form.get('email', '').strip().lower()

    conn = get_db_connection()
    try:
        with conn:
            if check_duplicate_ente_civile(conn, nome, indirizzo):
                flash('Esiste gi un ente civile con questo nome nella stessa citt.', 'warning')
                return redirect(url_for('enti_civili.inserisci_civile_form'))

            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    '''INSERT INTO enti_civili
                       (nome, indirizzo, nazione,
                        telefono, email, creato_da, data_creazione)
                       VALUES (%s, %s, %s, %s, %s, %s, NOW())
                       RETURNING id''',
                    (nome, indirizzo, nazione,
                     telefono, email, user_id)
                )
                new_id = int(cur.fetchone()['id'])

        log_user_action(
            user_id, 'CREATE_ENTE_CIVILE',
            f'Creato ente civile: {nome}',
            'ente_civile', new_id
        )
        flash(f'Ente civile "{nome}" creato con successo.', 'success')
        return redirect(url_for('enti_civili.visualizza_civile', id=new_id))

    except Exception as e:
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        log_user_action(
            user_id, 'CREATE_ENTE_CIVILE_ERROR',
            f'Errore creazione ente civile: {str(e)}', 'ente_civile', result='FAILED'
        )
        return redirect(url_for('enti_civili.inserisci_civile_form'))

@enti_civili_bp.route('/ente_civile/<int:id>')
@permission_required('VIEW_ENTI_CIVILI')
def visualizza_civile(id):
    user_id = request.current_user['user_id']
    user_role = get_user_role()

    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    '''SELECT ec.*,
                              u_creato.username AS creato_da_username, u_creato.nome AS creato_da_nome,
                              u_modificato.username AS modificato_da_username, u_modificato.nome AS modificato_da_nome,
                              CASE 
                                  WHEN ec.coordinate IS NOT NULL THEN 
                                      ST_Y(ec.coordinate) || ', ' || ST_X(ec.coordinate)
                                  ELSE NULL
                              END AS coordinate_formatted
                       FROM enti_civili ec
                       LEFT JOIN utenti u_creato ON ec.creato_da = u_creato.id
                       LEFT JOIN utenti u_modificato ON ec.modificato_da = u_modificato.id
                       WHERE ec.id = %s''',
                    (id,)
                )
                ente = cur.fetchone()

                if not ente:
                    flash('Ente civile non trovato.', 'error')
                    return redirect(url_for('enti_civili.enti_civili'))

                related_stats = {}
                if is_operatore_or_above():
                    # Attivit correlate
                    cur.execute(
                        '''SELECT COUNT(*) AS count
                           FROM attivita
                           WHERE partenza_civile_id = %s OR destinazione_civile_id = %s''',
                        (id, id)
                    )
                    related_stats['attivita'] = int(cur.fetchone()['count'])

                    # Ultime attivit
                    cur.execute(
                        '''SELECT a.id, a.descrizione, a.data_inizio, em.nome AS ente_nome
                           FROM attivita a
                           JOIN enti_militari em ON a.ente_svolgimento_id = em.id
                           WHERE a.partenza_civile_id = %s OR a.destinazione_civile_id = %s
                           ORDER BY a.data_inizio DESC
                           LIMIT 5''',
                        (id, id)
                    )
                    related_stats['ultime_attivita'] = cur.fetchall()

        log_user_action(
            user_id, 'VIEW_ENTE_CIVILE',
            f'Visualizzato ente civile: {ente["nome"]}',
            'ente_civile', id
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
    user_id = request.current_user['user_id']
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT * FROM enti_civili WHERE id = %s', (id,))
            ente = cur.fetchone()
        if not ente:
            flash('Ente civile non trovato.', 'error')
            return redirect(url_for('enti_civili.enti_civili'))

        log_user_action(
            user_id, 'ACCESS_EDIT_ENTE_CIVILE_FORM',
            f'Accesso form modifica ente civile: {ente["nome"]}',
            'ente_civile', id
        )
        return render_template('modifica_civile.html', ente=ente)
    except Exception as e:
        flash(f'Errore nel caricamento dell\'ente: {str(e)}', 'error')
        return redirect(url_for('enti_civili.enti_civili'))
    finally:
        conn.close()

@enti_civili_bp.route('/aggiorna_civile/<int:id>', methods=['POST'])
@operatore_or_admin_required
@permission_required('EDIT_ENTI_CIVILI')
def aggiorna_civile(id):
    user_id = request.current_user['user_id']

    validation_errors = validate_ente_civile_data(request.form, id)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('enti_civili.modifica_civile_form', id=id))

    nome = request.form['nome'].upper().strip()
    indirizzo = request.form['indirizzo'].upper().strip()
    # Campi civico, cap, citta, provincia eliminati dallo schema
    nazione = request.form.get('nazione', 'ITALIA').upper().strip()
    telefono = request.form.get('telefono', '').strip()
    email = request.form.get('email', '').strip().lower()

    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Esistenza + vecchi valori
                cur.execute('SELECT nome, indirizzo FROM enti_civili WHERE id = %s', (id,))
                existing = cur.fetchone()
                if not existing:
                    flash('Ente civile non trovato.', 'error')
                    return redirect(url_for('enti_civili.enti_civili'))

                if check_duplicate_ente_civile(conn, nome, indirizzo, id):
                    flash('Esiste gi un ente civile con questo nome nella stessa citt.', 'warning')
                    return redirect(url_for('enti_civili.modifica_civile_form', id=id))

                cur.execute(
                    '''UPDATE enti_civili
                       SET nome=%s, indirizzo=%s,
                           nazione=%s, telefono=%s, email=%s,
                           modificato_da=%s, data_modifica=NOW()
                       WHERE id = %s''',
                    (nome, indirizzo, nazione,
                     telefono, email, user_id, id)
                )

        log_user_action(
            user_id, 'UPDATE_ENTE_CIVILE',
            f'Aggiornato ente civile: {existing["nome"]} -> {nome}',
            'ente_civile', id
        )
        flash(f'Ente civile "{nome}" aggiornato con successo.', 'success')
        return redirect(url_for('enti_civili.visualizza_civile', id=id))

    except Exception as e:
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
        log_user_action(
            user_id, 'UPDATE_ENTE_CIVILE_ERROR',
            f'Errore aggiornamento ente civile {id}: {str(e)}',
            'ente_civile', id, result='FAILED'
        )
        return redirect(url_for('enti_civili.modifica_civile_form', id=id))
    finally:
        conn.close()

@enti_civili_bp.route('/elimina_civile/<int:id>', methods=['POST'])
@admin_required
def elimina_civile(id):
    user_id = request.current_user['user_id']
    conn = get_db_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute('SELECT nome, indirizzo FROM enti_civili WHERE id = %s', (id,))
                ente = cur.fetchone()
                if not ente:
                    flash('Ente civile non trovato.', 'error')
                    return redirect(url_for('enti_civili.enti_civili'))

                dependencies = check_ente_dependencies(conn, id)
                if dependencies:
                    flash(f'Impossibile eliminare l\'ente "{ente["nome"]}": {", ".join(dependencies)}.', 'error')
                    return redirect(url_for('enti_civili.enti_civili'))

                cur.execute('DELETE FROM enti_civili WHERE id = %s', (id,))

        log_user_action(
            user_id, 'DELETE_ENTE_CIVILE',
            f'Eliminato ente civile: {ente["nome"]}',
            'ente_civile', id
        )
        flash(f'Ente civile "{ente["nome"]}" eliminato con successo.', 'success')
    except Exception as e:
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
        log_user_action(
            user_id, 'DELETE_ENTE_CIVILE_ERROR',
            f'Errore eliminazione ente civile {id}: {str(e)}',
            'ente_civile', id, result='FAILED'
        )
    finally:
        conn.close()
    return redirect(url_for('enti_civili.enti_civili'))

# ===========================================
# ROUTE AGGIUNTIVE E UTILIT
# ===========================================
@enti_civili_bp.route('/enti_civili/export')
@permission_required('VIEW_ENTI_CIVILI')
def export_enti_civili():
    user_id = request.current_user['user_id']

    search = request.args.get('search', '').strip()
    # Filtro provincia rimosso - colonna non più esistente

    where = []
    params = []
    if search:
        where.append('(nome ILIKE %s OR indirizzo ILIKE %s)')
        like = f'%{search}%'
        params.extend([like, like])
    # Filtro provincia rimosso

    where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f'''SELECT nome, indirizzo, nazione,
                           telefono, email, data_creazione
                    FROM enti_civili
                    {where_sql}
                    ORDER BY nome''',
                params
            )
            enti_export = cur.fetchall()

        # CSV
        import csv, io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Nome','Indirizzo','Nazione','Telefono','Email','Data Creazione'])
        for e in enti_export:
            writer.writerow([
                e['nome'], e['indirizzo'], e['nazione'], e['telefono'], e['email'],
                e['data_creazione']
            ])

        log_user_action(
            user_id, 'EXPORT_ENTI_CIVILI',
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
    finally:
        conn.close()

@enti_civili_bp.route('/enti_civili/statistiche')
@operatore_or_admin_required
@permission_required('VIEW_ENTI_CIVILI')
def statistiche_enti_civili():
    user_id = request.current_user['user_id']
    conn = get_db_connection()
    try:
        stats = get_enti_civili_stats(conn)

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Distribuzione per regione non più disponibile (colonna provincia eliminata)
            stats['per_regione'] = []

            # Crescita ultimi 12 mesi
            cur.execute(
                '''SELECT TO_CHAR(date_trunc('month', data_creazione), 'YYYY-MM') AS mese,
                          COUNT(*) AS nuovi_enti
                   FROM enti_civili
                   WHERE data_creazione >= (CURRENT_DATE - INTERVAL '12 months')
                   GROUP BY date_trunc('month', data_creazione)
                   ORDER BY mese DESC'''
            )
            stats['crescita_mensile'] = cur.fetchall()

        log_user_action(user_id, 'VIEW_ENTI_CIVILI_STATS', 'Visualizzate statistiche enti civili')
        return render_template('statistiche_enti_civili.html', stats=stats)

    except Exception as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        return redirect(url_for('enti_civili.enti_civili'))
    finally:
        conn.close()

@enti_civili_bp.route('/api/enti_civili/cerca')
@login_required
def api_cerca_enti_civili():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            like = f'%{q}%'
            cur.execute(
                '''SELECT id, nome, indirizzo
                   FROM enti_civili
                   WHERE nome ILIKE %s OR indirizzo ILIKE %s
                   ORDER BY nome
                   LIMIT 20''',
                (like, like)
            )
            enti = cur.fetchall()
        return jsonify([{
            'id': e['id'],
            'nome': e['nome'],
            'indirizzo': e['indirizzo'],
            'label': f'{e["nome"]} - {e["indirizzo"] or "Indirizzo non specificato"}'
        } for e in enti])
    except Exception:
        return jsonify([])

# ===========================================
# GESTIONE ERRORI
# ===========================================
@enti_civili_bp.errorhandler(Exception)
def handle_db_error(error):
    flash('Errore nel database degli enti civili. Contattare l\'amministratore.', 'error')
    return redirect(url_for('enti_civili.enti_civili'))
