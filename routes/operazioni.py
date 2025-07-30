from flask import Blueprint, render_template, request, redirect, url_for
from services.database import get_db_connection

operazioni_bp = Blueprint('operazioni', __name__, template_folder='../templates')

@operazioni_bp.route('/operazioni')
def lista_operazioni():
    conn = get_db_connection()
    operazioni = conn.execute('SELECT * FROM operazioni ORDER BY data_inizio DESC, nome_missione').fetchall()
    conn.close()
    return render_template('lista_operazioni.html', operazioni=operazioni)

@operazioni_bp.route('/inserisci_operazione')
def inserisci_operazione_form():
    return render_template('inserimento_operazione.html')

@operazioni_bp.route('/salva_operazione', methods=['POST'])
def salva_operazione():
    nome_missione = request.form['nome_missione'].upper()
    nome_breve = request.form.get('nome_breve', '').upper()
    teatro = request.form['teatro_operativo'].upper()
    nazione = request.form['nazione'].upper()
    data_inizio = request.form.get('data_inizio') or None
    data_fine = request.form.get('data_fine') or None
    descrizione = request.form.get('descrizione', '').upper()
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO operazioni (nome_missione, nome_breve, teatro_operativo, nazione, data_inizio, data_fine, descrizione) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (nome_missione, nome_breve, teatro, nazione, data_inizio, data_fine, descrizione)
    )
    conn.commit()
    conn.close()
    return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/operazione/<int:id>')
def visualizza_operazione(id):
    conn = get_db_connection()
    operazione = conn.execute('SELECT * FROM operazioni WHERE id = ?', (id,)).fetchone()
    conn.close()
    if operazione is None: return "Operazione non trovata!", 404
    return render_template('descrizione_operazione.html', operazione=operazione)

@operazioni_bp.route('/modifica_operazione/<int:id>')
def modifica_operazione_form(id):
    conn = get_db_connection()
    operazione = conn.execute('SELECT * FROM operazioni WHERE id = ?', (id,)).fetchone()
    conn.close()
    if operazione is None: return "Operazione non trovata!", 404
    return render_template('modifica_operazione.html', operazione=operazione)

@operazioni_bp.route('/aggiorna_operazione/<int:id>', methods=['POST'])
def aggiorna_operazione(id):
    nome_missione = request.form['nome_missione'].upper()
    nome_breve = request.form.get('nome_breve', '').upper()
    teatro = request.form['teatro_operativo'].upper()
    nazione = request.form['nazione'].upper()
    data_inizio = request.form.get('data_inizio') or None
    data_fine = request.form.get('data_fine') or None
    descrizione = request.form.get('descrizione', '').upper()
    conn = get_db_connection()
    conn.execute(
        'UPDATE operazioni SET nome_missione=?, nome_breve=?, teatro_operativo=?, nazione=?, data_inizio=?, data_fine=?, descrizione=? WHERE id = ?',
        (nome_missione, nome_breve, teatro, nazione, data_inizio, data_fine, descrizione, id)
    )
    conn.commit()
    conn.close()
    return redirect(url_for('operazioni.lista_operazioni'))

@operazioni_bp.route('/elimina_operazione/<int:id>', methods=['POST'])
def elimina_operazione(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM operazioni WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return redirect(url_for('operazioni.lista_operazioni'))
