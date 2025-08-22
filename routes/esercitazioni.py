# routes/esercitazioni.py - Blueprint per gestione esercitazioni
from flask import Blueprint, render_template, request, redirect, url_for, flash, Response, jsonify
from datetime import datetime, date
from psycopg2.extras import RealDictCursor
import csv
import io

# Import dal modulo auth (usa Postgres)
from auth import (
    login_required, permission_required, entity_access_required,
    admin_required, operatore_or_admin_required,
    get_user_accessible_entities, log_user_action, get_current_user_info,
    is_admin, is_operatore_or_above, get_user_role, get_user_permissions,
    ROLE_ADMIN, ROLE_OPERATORE, ROLE_VISUALIZZATORE,
    get_auth_db_connection  # connessione centralizzata a PostgreSQL
)

# ===========================================
# DEFINIZIONE BLUEPRINT
# ===========================================
esercitazioni_bp = Blueprint(
    'esercitazioni',
    __name__,
    url_prefix='/esercitazioni',
    template_folder='../templates',
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
# FUNZIONI HELPER
# ===========================================

def get_esercitazioni_list():
    """
    Recupera l'elenco completo delle esercitazioni.
    
    Returns:
        list: Lista di dizionari con i dati delle esercitazioni
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id, nome, nome_breve, anno
            FROM esercitazioni
            ORDER BY anno DESC, nome ASC
        """)
        
        esercitazioni = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return [dict(e) for e in esercitazioni]
        
    except Exception as e:
        print(f"Errore nel recupero esercitazioni: {str(e)}")
        return []

def get_esercitazione_by_id(esercitazione_id):
    """
    Recupera una singola esercitazione per ID.
    
    Args:
        esercitazione_id (int): ID dell'esercitazione
        
    Returns:
        dict or None: Dati dell'esercitazione o None se non trovata
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id, nome, nome_breve, anno
            FROM esercitazioni
            WHERE id = %s
        """, (esercitazione_id,))
        
        esercitazione = cursor.fetchone()
        cursor.close()
        conn.close()
        
        return dict(esercitazione) if esercitazione else None
        
    except Exception as e:
        print(f"Errore nel recupero esercitazione {esercitazione_id}: {str(e)}")
        return None

# ===========================================
# ROUTES
# ===========================================

@esercitazioni_bp.route('/lista')
@login_required
@operatore_or_admin_required
def lista_esercitazioni():
    """Lista di tutte le esercitazioni"""
    try:
        esercitazioni_list = get_esercitazioni_list()
        
        # Log dell'azione
        log_user_action("Visualizzazione lista esercitazioni", "esercitazioni", None)
        
        return render_template(
            'elenco_esercitazioni.html',
            esercitazioni_list=esercitazioni_list
        )
        
    except Exception as e:
        flash(f'Errore nel caricamento delle esercitazioni: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@esercitazioni_bp.route('/visualizza/<int:id>')
@login_required  
@operatore_or_admin_required
def visualizza_esercitazione(id):
    """Visualizza i dettagli di una singola esercitazione"""
    try:
        esercitazione = get_esercitazione_by_id(id)
        
        if not esercitazione:
            flash('Esercitazione non trovata', 'error')
            return redirect(url_for('esercitazioni.lista_esercitazioni'))
        
        # Log dell'azione
        log_user_action(f"Visualizzazione esercitazione", "esercitazioni", id)
        
        return render_template(
            'esercitazioni/visualizza_esercitazione.html',
            esercitazione=esercitazione
        )
        
    except Exception as e:
        flash(f'Errore nel caricamento dell\'esercitazione: {str(e)}', 'error')
        return redirect(url_for('esercitazioni.lista_esercitazioni'))

@esercitazioni_bp.route('/inserisci', methods=['GET', 'POST'])
@login_required
@operatore_or_admin_required
def inserisci_esercitazione_form():
    """Form per inserire una nuova esercitazione"""
    if request.method == 'GET':
        return render_template('esercitazioni/inserimento_esercitazione.html')
    
    # POST - Inserimento
    try:
        nome = request.form.get('nome', '').strip()
        nome_breve = request.form.get('nome_breve', '').strip() or None
        anno = request.form.get('anno', '').strip()
        
        # Validazione
        if not nome:
            flash('Il nome dell\'esercitazione è obbligatorio', 'error')
            return render_template('esercitazioni/inserimento_esercitazione.html')
        
        # Conversione anno
        anno_int = None
        if anno:
            try:
                anno_int = int(anno)
            except ValueError:
                flash('Anno non valido', 'error')
                return render_template('esercitazioni/inserimento_esercitazione.html')
        
        # Inserimento nel database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO esercitazioni (nome, nome_breve, anno)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (nome.upper(), nome_breve.upper() if nome_breve else None, anno_int))
        
        esercitazione_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        
        # Log dell'azione
        log_user_action(f"Inserimento esercitazione: {nome}", "esercitazioni", esercitazione_id)
        
        flash('Esercitazione inserita con successo', 'success')
        return redirect(url_for('esercitazioni.lista_esercitazioni'))
        
    except Exception as e:
        flash(f'Errore nell\'inserimento dell\'esercitazione: {str(e)}', 'error')
        return render_template('esercitazioni/inserimento_esercitazione.html')

@esercitazioni_bp.route('/modifica/<int:id>', methods=['GET', 'POST'])
@login_required
@operatore_or_admin_required  
def modifica_esercitazione(id):
    """Form per modificare un'esercitazione esistente"""
    if request.method == 'GET':
        # Carica i dati dell'esercitazione
        esercitazione = get_esercitazione_by_id(id)
        
        if not esercitazione:
            flash('Esercitazione non trovata', 'error')
            return redirect(url_for('esercitazioni.lista_esercitazioni'))
        
        return render_template(
            'esercitazioni/modifica_esercitazione.html',
            esercitazione=esercitazione
        )
    
    # POST - Modifica
    try:
        nome = request.form.get('nome', '').strip()
        nome_breve = request.form.get('nome_breve', '').strip() or None
        anno = request.form.get('anno', '').strip()
        
        # Validazione
        if not nome:
            flash('Il nome dell\'esercitazione è obbligatorio', 'error')
            esercitazione = get_esercitazione_by_id(id)
            return render_template('esercitazioni/modifica_esercitazione.html', esercitazione=esercitazione)
        
        # Conversione anno
        anno_int = None
        if anno:
            try:
                anno_int = int(anno)
            except ValueError:
                flash('Anno non valido', 'error')
                esercitazione = get_esercitazione_by_id(id)
                return render_template('esercitazioni/modifica_esercitazione.html', esercitazione=esercitazione)
        
        # Aggiornamento nel database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE esercitazioni
            SET nome = %s, nome_breve = %s, anno = %s
            WHERE id = %s
        """, (nome.upper(), nome_breve.upper() if nome_breve else None, anno_int, id))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        # Log dell'azione
        log_user_action(f"Modifica esercitazione: {nome}", "esercitazioni", id)
        
        flash('Esercitazione modificata con successo', 'success')
        return redirect(url_for('esercitazioni.lista_esercitazioni'))
        
    except Exception as e:
        flash(f'Errore nella modifica dell\'esercitazione: {str(e)}', 'error')
        esercitazione = get_esercitazione_by_id(id)
        return render_template('esercitazioni/modifica_esercitazione.html', esercitazione=esercitazione)

@esercitazioni_bp.route('/elimina/<int:id>', methods=['POST'])
@login_required
@admin_required
def elimina_esercitazione(id):
    """Elimina un'esercitazione (solo admin)"""
    try:
        # Verifica se l'esercitazione esiste
        esercitazione = get_esercitazione_by_id(id)
        if not esercitazione:
            flash('Esercitazione non trovata', 'error')
            return redirect(url_for('esercitazioni.lista_esercitazioni'))
        
        # Verifica se ci sono attività collegate
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT COUNT(*) FROM attivita WHERE esercitazione_id = %s
        """, (id,))
        
        attivita_collegate = cursor.fetchone()[0]
        
        if attivita_collegate > 0:
            flash(f'Impossibile eliminare: ci sono {attivita_collegate} attività collegate a questa esercitazione', 'error')
            cursor.close()
            conn.close()
            return redirect(url_for('esercitazioni.lista_esercitazioni'))
        
        # Eliminazione
        cursor.execute("DELETE FROM esercitazioni WHERE id = %s", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        
        # Log dell'azione
        log_user_action(f"Eliminazione esercitazione: {esercitazione['nome']}", "esercitazioni", id)
        
        flash('Esercitazione eliminata con successo', 'success')
        return redirect(url_for('esercitazioni.lista_esercitazioni'))
        
    except Exception as e:
        flash(f'Errore nell\'eliminazione dell\'esercitazione: {str(e)}', 'error')
        return redirect(url_for('esercitazioni.lista_esercitazioni'))