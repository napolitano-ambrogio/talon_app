from flask import Blueprint, render_template, request, redirect, url_for
from services.database import get_db_connection

enti_civili_bp = Blueprint('enti_civili', __name__, template_folder='../templates')

@enti_civili_bp.route('/enti_civili')
def enti_civili():
    conn = get_db_connection()
    enti_civili = conn.execute('SELECT * FROM enti_civili ORDER BY nome').fetchall()
    conn.close()
    return render_template('enti_civili.html', enti_civili=enti_civili)

@enti_civili_bp.route('/inserisci_civile')
def inserisci_civile_form():
    return render_template('inserimento_civile.html')

@enti_civili_bp.route('/salva_civile', methods=['POST'])
def salva_civile():
    nome = request.form['nome'].upper()
    indirizzo = request.form['indirizzo'].upper()
    civico = request.form['civico'].upper()
    cap = request.form['cap'].upper()
    citta = request.form['citta'].upper()
    provincia = request.form['provincia'].upper()
    nazione = request.form['nazione'].upper()
    telefono = request.form['telefono']
    email = request.form['email'].upper()
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO enti_civili (nome, indirizzo, civico, cap, citta, provincia, nazione, telefono, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (nome, indirizzo, civico, cap, citta, provincia, nazione, telefono, email)
    )
    conn.commit()
    conn.close()
    return redirect(url_for('enti_civili.enti_civili'))

@enti_civili_bp.route('/ente_civile/<int:id>')
def visualizza_civile(id):
    conn = get_db_connection()
    ente = conn.execute('SELECT * FROM enti_civili WHERE id = ?', (id,)).fetchone()
    conn.close()
    if ente is None: return "Ente civile non trovato!", 404
    return render_template('descrizione_civile.html', ente=ente)

@enti_civili_bp.route('/modifica_civile/<int:id>')
def modifica_civile_form(id):
    conn = get_db_connection()
    ente = conn.execute('SELECT * FROM enti_civili WHERE id = ?', (id,)).fetchone()
    conn.close()
    if ente is None: return "Ente civile non trovato!", 404
    return render_template('modifica_civile.html', ente=ente)

@enti_civili_bp.route('/aggiorna_civile/<int:id>', methods=['POST'])
def aggiorna_civile(id):
    nome = request.form['nome'].upper()
    indirizzo = request.form['indirizzo'].upper()
    civico = request.form['civico'].upper()
    cap = request.form['cap'].upper()
    citta = request.form['citta'].upper()
    provincia = request.form['provincia'].upper()
    nazione = request.form['nazione'].upper()
    telefono = request.form['telefono']
    email = request.form['email'].upper()
    conn = get_db_connection()
    conn.execute(
        'UPDATE enti_civili SET nome=?, indirizzo=?, civico=?, cap=?, citta=?, provincia=?, nazione=?, telefono=?, email=? WHERE id = ?',
        (nome, indirizzo, civico, cap, citta, provincia, nazione, telefono, email, id)
    )
    conn.commit()
    conn.close()
    return redirect(url_for('enti_civili.enti_civili'))

@enti_civili_bp.route('/elimina_civile/<int:id>', methods=['POST'])
def elimina_civile(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM enti_civili WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return redirect(url_for('enti_civili.enti_civili'))
