from flask import Blueprint, render_template, request, redirect, url_for
# Importiamo le funzioni dal nostro nuovo file di servizi
from services.database import get_db_connection, get_all_descendants, build_tree

enti_militari_bp = Blueprint('enti_militari', __name__, template_folder='../templates')

ROOT_ENTE_ID = 1

@enti_militari_bp.route('/organigramma')
def organigramma():
    view_all = request.args.get('view') == 'all'
    conn = get_db_connection()
    if view_all:
        enti_list = conn.execute('SELECT * FROM enti_militari ORDER BY nome').fetchall()
    else:
        enti_list = get_all_descendants(conn, ROOT_ENTE_ID)
    conn.close()
    tree_structure = build_tree(enti_list)
    return render_template('organigramma.html', tree=tree_structure, view_all=view_all)

@enti_militari_bp.route('/inserisci_militare')
def inserisci_militare_form():
    conn = get_db_connection()
    enti = conn.execute('SELECT id, nome FROM enti_militari ORDER BY nome').fetchall()
    conn.close()
    return render_template('inserimento_ente.html', enti=enti)

@enti_militari_bp.route('/salva_militare', methods=['POST'])
def salva_militare():
    nome = request.form['nome'].upper()
    codice = request.form['codice'].upper()
    parent_id = request.form['parent_id']
    indirizzo = request.form['indirizzo'].upper()
    civico = request.form['civico'].upper()
    cap = request.form['cap'].upper()
    citta = request.form['citta'].upper()
    provincia = request.form['provincia'].upper()
    telefono = request.form['telefono']
    email = request.form['email'].upper()
    if not parent_id: parent_id = None
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO enti_militari (nome, codice, parent_id, indirizzo, civico, cap, citta, provincia, telefono, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (nome, codice, parent_id, indirizzo, civico, cap, citta, provincia, telefono, email)
    )
    conn.commit()
    conn.close()
    return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.route('/ente_militare/<int:id>')
def visualizza_ente(id):
    conn = get_db_connection()
    ente = conn.execute('SELECT * FROM enti_militari WHERE id = ?', (id,)).fetchone()
    parent_name = None
    if ente and ente['parent_id']:
        parent = conn.execute('SELECT nome FROM enti_militari WHERE id = ?', (ente['parent_id'],)).fetchone()
        if parent: parent_name = parent['nome']
    conn.close()
    if ente is None: return "Ente non trovato!", 404
    return render_template('descrizione_ente.html', ente=ente, parent_name=parent_name)

@enti_militari_bp.route('/modifica_militare/<int:id>')
def modifica_militare_form(id):
    conn = get_db_connection()
    ente = conn.execute('SELECT * FROM enti_militari WHERE id = ?', (id,)).fetchone()
    tutti_gli_enti = conn.execute('SELECT id, nome FROM enti_militari WHERE id != ? ORDER BY nome', (id,)).fetchall()
    conn.close()
    if ente is None: return "Ente non trovato!", 404
    return render_template('modifica_ente.html', ente=ente, tutti_gli_enti=tutti_gli_enti)

@enti_militari_bp.route('/aggiorna_militare/<int:id>', methods=['POST'])
def aggiorna_militare(id):
    nome = request.form['nome'].upper()
    codice = request.form['codice'].upper()
    parent_id = request.form['parent_id']
    indirizzo = request.form['indirizzo'].upper()
    civico = request.form['civico'].upper()
    cap = request.form['cap'].upper()
    citta = request.form['citta'].upper()
    provincia = request.form['provincia'].upper()
    telefono = request.form['telefono']
    email = request.form['email'].upper()
    if not parent_id: parent_id = None
    conn = get_db_connection()
    conn.execute(
        'UPDATE enti_militari SET nome=?, codice=?, parent_id=?, indirizzo=?, civico=?, cap=?, citta=?, provincia=?, telefono=?, email=? WHERE id = ?',
        (nome, codice, parent_id, indirizzo, civico, cap, citta, provincia, telefono, email, id)
    )
    conn.commit()
    conn.close()
    return redirect(url_for('enti_militari.organigramma'))

@enti_militari_bp.route('/elimina_militare/<int:id>', methods=['POST'])
def elimina_militare(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM enti_militari WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return redirect(url_for('enti_militari.organigramma'))
