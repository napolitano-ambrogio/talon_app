# routes/operazioni.py - versione PostgreSQL
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from auth import (
    login_required, permission_required,
    admin_required, operatore_or_admin_required,
    log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE
)
import os
from datetime import datetime
import psycopg2
import psycopg2.extras

# ===========================================
# CONFIGURAZIONE DATABASE (PostgreSQL)
# ===========================================

PG_CFG = {
    "host": os.environ.get("TALON_PG_HOST", "127.0.0.1"),
    "port": int(os.environ.get("TALON_PG_PORT", "5432")),
    "dbname": os.environ.get("TALON_PG_DB", "talon"),
    "user": os.environ.get("TALON_PG_USER", "talon"),
    "password": os.environ.get("TALON_PG_PASS", "TalonDB!2025"),
}

def get_db_connection():
    """Connessione a PostgreSQL con cursore dict-like"""
    conn = psycopg2.connect(**PG_CFG)
    # RealDictCursor restituisce dict per riga
    conn.autocommit = False
    return conn

operazioni_bp = Blueprint('operazioni', __name__, template_folder='../templates')

# ===========================================
# FUNZIONI HELPER
# ===========================================

def validate_operazione_data(form_data, operazione_id=None):
    errors = []
    required_fields = ['nome_missione', 'teatro_operativo', 'nazione']
    for field in required_fields:
        if not form_data.get(field, '').strip():
            errors.append(f'Il campo {field.replace("_", " ")}  obbligatorio.')
    data_inizio = form_data.get('data_inizio')
    data_fine = form_data.get('data_fine')
    if data_inizio and data_fine:
        try:
            inizio = datetime.strptime(data_inizio, '%Y-%m-%d')
            fine = datetime.strptime(data_fine, '%Y-%m-%d')
            if fine < inizio:
                errors.append('La data di fine non pu essere precedente alla data di inizio.')
        except ValueError:
            errors.append('Formato data non valido. Utilizzare YYYY-MM-DD.')
    return errors

def check_duplicate_operazione(conn, nome_missione, nome_breve, exclude_id=None):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if exclude_id:
            cur.execute(
                '''
                SELECT id FROM operazioni
                WHERE (nome_missione = %s OR (nome_breve = %s AND nome_breve <> ''))
                  AND id <> %s
                ''',
                (nome_missione, nome_breve, exclude_id)
            )
        else:
            cur.execute(
                '''
                SELECT id FROM operazioni
                WHERE nome_missione = %s OR (nome_breve = %s AND nome_breve <> '')
                ''',
                (nome_missione, nome_breve)
            )
        return cur.fetchone() is not None

def get_operazione_stato(operazione):
    if not operazione.get('data_inizio'):
        return 'pianificata'
    try:
        inizio = operazione['data_inizio']
        if isinstance(inizio, str):
            inizio = datetime.strptime(inizio, '%Y-%m-%d')
        oggi = datetime.now()
        if inizio > oggi:
            return 'pianificata'
        elif operazione.get('data_fine'):
            fine = operazione['data_fine']
            if isinstance(fine, str):
                fine = datetime.strptime(fine, '%Y-%m-%d')
            return 'conclusa' if fine < oggi else 'attiva'
        else:
            return 'attiva'
    except Exception:
        return 'sconosciuto'

def get_operazioni_stats(conn):
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            stats = {}
            cur.execute('SELECT COUNT(*) AS count FROM operazioni')
            stats['totale'] = cur.fetchone()['count']

            cur.execute('''
                SELECT
                  COUNT(*) FILTER (WHERE data_inizio <= CURRENT_DATE
                                   AND (data_fine IS NULL OR data_fine >= CURRENT_DATE)) AS attive,
                  COUNT(*) FILTER (WHERE data_fine < CURRENT_DATE) AS concluse,
                  COUNT(*) FILTER (WHERE data_inizio > CURRENT_DATE OR data_inizio IS NULL) AS pianificate
                FROM operazioni
            ''')
            r = cur.fetchone() or {}
            stats['per_stato'] = {
                'attive': r.get('attive', 0),
                'concluse': r.get('concluse', 0),
                'pianificate': r.get('pianificate', 0),
            }
            return stats
    except Exception:
        return {}

# ===========================================
# ROUTE PRINCIPALI
# ===========================================

@operazioni_bp.route('/operazioni')
@permission_required('VIEW_OPERAZIONI')
def lista_operazioni():
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    try:
        conn = get_db_connection()
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                '''
                SELECT o.*,
                       u_creato.username AS creato_da_username,
                       u_creato.nome AS creato_da_nome
                FROM operazioni o
                LEFT JOIN utenti u_creato ON o.creato_da = u_creato.id
                ORDER BY o.data_inizio DESC NULLS LAST, o.nome_missione
                '''
            )
            operazioni = cur.fetchall()

            stats = get_operazioni_stats(conn) if is_operatore_or_above() else {}

        # Calcola stato lato app
        operazioni_con_stato = []
        for op in operazioni:
            op_dict = dict(op)
            op_dict['stato'] = get_operazione_stato(op_dict)
            operazioni_con_stato.append(op_dict)

        log_user_action(
            user_id,
            'VIEW_OPERAZIONI_LIST',
            f'Visualizzate {len(operazioni)} operazioni',
            'operazioni'
        )
        return render_template('lista_operazioni.html',
                               operazioni=operazioni_con_stato,
                               stats=stats,
                               user_role=user_role)
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        flash(f'Errore nel caricamento delle operazioni: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@operazioni_bp.route('/inserisci_operazione')
@operatore_or_admin_required
@permission_required('CREATE_OPERAZIONI')
def inserisci_operazione_form():
    user_id = request.current_user['user_id']
    log_user_action(
        user_id,
        'ACCESS_CREATE_OPERAZIONE_FORM',
        'Accesso form creazione operazione'
    )
    return render_template('inserimento_operazione.html')

@operazioni_bp.route('/salva_operazione', methods=['POST'])
@operatore_or_admin_required
@permission_required('CREATE_OPERAZIONI')
def salva_operazione():
    user_id = request.current_user['user_id']

    validation_errors = validate_operazione_data(request.form)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('operazioni.inserisci_operazione_form'))

    try:
        nome_missione = request.form['nome_missione'].upper().strip()
        nome_breve = request.form.get('nome_breve', '').upper().strip()
        teatro = request.form['teatro_operativo'].upper().strip()
        nazione = request.form['nazione'].upper().strip()
        data_inizio = request.form.get('data_inizio') or None
        data_fine = request.form.get('data_fine') or None
        descrizione = request.form.get('descrizione', '').upper().strip()

        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                if check_duplicate_operazione(conn, nome_missione, nome_breve):
                    raise ValueError("DUPLICATO")

                cur.execute(
                    '''
                    INSERT INTO operazioni
                      (nome_missione, nome_breve, teatro_operativo, nazione,
                       data_inizio, data_fine, descrizione, creato_da, data_creazione)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                    ''',
                    (nome_missione, nome_breve, teatro, nazione,
                     data_inizio, data_fine, descrizione, user_id)
                )
                new_id = cur.fetchone()['id']

        log_user_action(
            user_id,
            'CREATE_OPERAZIONE',
            f'Creata operazione: {nome_missione} ({nome_breve})',
            'operazione',
            new_id
        )
        flash(f'Operazione "{nome_missione}" creata con successo.', 'success')
        return redirect(url_for('operazioni.visualizza_operazione', id=new_id))

    except ValueError as ve:
        if str(ve) == "DUPLICATO":
            if 'conn' in locals():
                conn.rollback(); conn.close()
            flash('Esiste gi un\'operazione con questo nome missione o nome breve.', 'warning')
            return redirect(url_for('operazioni.inserisci_operazione_form'))
        raise
    except Exception as e:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        flash(f'Errore durante il salvataggio: {str(e)}', 'error')
        return redirect(url_for('operazioni.inserisci_operazione_form'))

@operazioni_bp.route('/operazione/<int:id>')
@permission_required('VIEW_OPERAZIONI')
def visualizza_operazione(id):
    user_id = request.current_user['user_id']
    user_role = get_user_role()
    try:
        conn = get_db_connection()
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                '''
                SELECT o.*,
                       u_creato.username AS creato_da_username, u_creato.nome AS creato_da_nome,
                       u_modificato.username AS modificato_da_username, u_modificato.nome AS modificato_da_nome
                FROM operazioni o
                LEFT JOIN utenti u_creato    ON o.creato_da    = u_creato.id
                LEFT JOIN utenti u_modificato ON o.modificato_da = u_modificato.id
                WHERE o.id = %s
                ''',
                (id,)
            )
            operazione = cur.fetchone()

        if not operazione:
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))

        stato = get_operazione_stato(operazione)

        log_user_action(
            user_id,
            'VIEW_OPERAZIONE',
            f'Visualizzata operazione: {operazione["nome_missione"]}',
            'operazione',
            id
        )
        return render_template('descrizione_operazione.html',
                               operazione=operazione,
                               stato=stato,
                               user_role=user_role)
    except Exception as e:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        flash(f'Errore nel caricamento dell\'operazione: {str(e)}', 'error')
        return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/modifica_operazione/<int:id>')
@operatore_or_admin_required
@permission_required('EDIT_OPERAZIONI')
def modifica_operazione_form(id):
    user_id = request.current_user['user_id']
    try:
        conn = get_db_connection()
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute('SELECT * FROM operazioni WHERE id = %s', (id,))
            operazione = cur.fetchone()

        if not operazione:
            flash('Operazione non trovata.', 'error')
            return redirect(url_for('operazioni.lista_operazioni'))

        log_user_action(
            user_id,
            'ACCESS_EDIT_OPERAZIONE_FORM',
            f'Accesso form modifica operazione: {operazione["nome_missione"]}',
            'operazione',
            id
        )
        return render_template('modifica_operazione.html', operazione=operazione)

    except Exception as e:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        flash(f'Errore nel caricamento dell\'operazione: {str(e)}', 'error')
        return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/aggiorna_operazione/<int:id>', methods=['POST'])
@operatore_or_admin_required
@permission_required('EDIT_OPERAZIONI')
def aggiorna_operazione(id):
    user_id = request.current_user['user_id']

    validation_errors = validate_operazione_data(request.form, id)
    if validation_errors:
        for error in validation_errors:
            flash(error, 'error')
        return redirect(url_for('operazioni.modifica_operazione_form', id=id))

    try:
        nome_missione = request.form['nome_missione'].upper().strip()
        nome_breve = request.form.get('nome_breve', '').upper().strip()
        teatro = request.form['teatro_operativo'].upper().strip()
        nazione = request.form['nazione'].upper().strip()
        data_inizio = request.form.get('data_inizio') or None
        data_fine = request.form.get('data_fine') or None
        descrizione = request.form.get('descrizione', '').upper().strip()

        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # Esistenza
                cur.execute('SELECT nome_missione FROM operazioni WHERE id = %s', (id,))
                existing = cur.fetchone()
                if not existing:
                    raise ValueError("NOT_FOUND")

                # Duplicati
                if check_duplicate_operazione(conn, nome_missione, nome_breve, id):
                    raise ValueError("DUPLICATO")

                cur.execute(
                    '''
                    UPDATE operazioni
                    SET nome_missione=%s, nome_breve=%s, teatro_operativo=%s, nazione=%s,
                        data_inizio=%s, data_fine=%s, descrizione=%s,
                        modificato_da=%s, data_modifica=NOW()
                    WHERE id = %s
                    ''',
                    (nome_missione, nome_breve, teatro, nazione,
                     data_inizio, data_fine, descrizione, user_id, id)
                )

        log_user_action(
            user_id,
            'UPDATE_OPERAZIONE',
            f'Aggiornata operazione: {nome_missione}',
            'operazione',
            id
        )
        flash(f'Operazione "{nome_missione}" aggiornata con successo.', 'success')
        return redirect(url_for('operazioni.visualizza_operazione', id=id))

    except ValueError as ve:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        if str(ve) == "NOT_FOUND":
            flash('Operazione non trovata.', 'error')
        elif str(ve) == "DUPLICATO":
            flash('Esiste gi un\'operazione con questo nome missione o nome breve.', 'warning')
        else:
            flash('Errore di validazione.', 'error')
        return redirect(url_for('operazioni.modifica_operazione_form', id=id))
    except Exception as e:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        flash(f'Errore durante l\'aggiornamento: {str(e)}', 'error')
        return redirect(url_for('operazioni.modifica_operazione_form', id=id))

@operazioni_bp.route('/elimina_operazione/<int:id>', methods=['POST'])
@admin_required
def elimina_operazione(id):
    user_id = request.current_user['user_id']
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute('SELECT nome_missione FROM operazioni WHERE id = %s', (id,))
                operazione = cur.fetchone()
                if not operazione:
                    raise ValueError("NOT_FOUND")

                # Dipendenze: attivit collegate
                cur.execute('SELECT COUNT(*) AS count FROM attivita WHERE operazione_id = %s', (id,))
                attivita = cur.fetchone()
                if attivita and attivita['count'] > 0:
                    raise ValueError(f"ATTIVITA_COLLEGATE:{attivita['count']}")

                cur.execute('DELETE FROM operazioni WHERE id = %s', (id,))

        log_user_action(
            user_id,
            'DELETE_OPERAZIONE',
            f'Eliminata operazione: {operazione["nome_missione"] if operazione else id}',
            'operazione',
            id
        )
        flash('Operazione eliminata con successo.', 'success')
    except ValueError as ve:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        msg = str(ve)
        if msg == "NOT_FOUND":
            flash('Operazione non trovata.', 'error')
        elif msg.startswith("ATTIVITA_COLLEGATE:"):
            n = msg.split(':', 1)[1]
            flash(f'Impossibile eliminare l\'operazione: {n} attivit collegate.', 'error')
        else:
            flash('Errore di validazione.', 'error')
    except Exception as e:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        flash(f'Errore durante l\'eliminazione: {str(e)}', 'error')
    return redirect(url_for('operazioni.lista_operazioni'))

# ===========================================
# API ENDPOINTS
# ===========================================

@operazioni_bp.route('/api/operazioni/attive')
@login_required
def api_operazioni_attive():
    try:
        conn = get_db_connection()
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                '''
                SELECT id, nome_missione, nome_breve, data_inizio, data_fine
                FROM operazioni
                WHERE data_inizio <= CURRENT_DATE
                  AND (data_fine IS NULL OR data_fine >= CURRENT_DATE)
                ORDER BY data_inizio DESC
                '''
            )
            rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        if 'conn' in locals():
            conn.rollback(); conn.close()
        return jsonify({'error': str(e)}), 500
