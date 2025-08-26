"""
API endpoints per gestione operazioni ed esercitazioni temporanee
"""
from flask import Blueprint, request, jsonify, session
from auth import login_required
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import logging

# Configurazione logging
logger = logging.getLogger(__name__)

# Blueprint per API temporanee
api_temp_bp = Blueprint('api_temp', __name__, url_prefix='/api')

def get_db_connection():
    """Crea connessione al database"""
    return psycopg2.connect(
        "postgresql://talon:TalonDB!2025@localhost:5432/talon",
        cursor_factory=RealDictCursor
    )

@api_temp_bp.route('/operazioni_temp', methods=['POST'])
@login_required
def crea_operazione_temp():
    """Crea una nuova operazione temporanea"""
    try:
        data = request.json
        
        # Validazione dati
        if not data.get('nome_missione'):
            return jsonify({'success': False, 'error': 'Nome missione obbligatorio'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Inserisci operazione temporanea
        cur.execute("""
            INSERT INTO operazioni_temp 
            (nome_missione, nome_breve, teatro_operativo, nazione, note, inserito_da)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            data.get('nome_missione', '').upper(),
            data.get('nome_breve', '').upper() if data.get('nome_breve') else None,
            data.get('teatro_operativo', '').upper() if data.get('teatro_operativo') else None,
            data.get('nazione', '').upper() if data.get('nazione') else None,
            data.get('note', '').upper() if data.get('note') else None,
session.get('username', 'SISTEMA')
        ))
        
        new_id = cur.fetchone()['id']
        conn.commit()
        
        logger.info(f"Creata operazione temporanea ID: {new_id}")
        
        return jsonify({
            'success': True,
            'id': new_id,
            'message': 'Operazione temporanea creata con successo'
        })
        
    except Exception as e:
        logger.error(f"Errore creazione operazione temp: {str(e)}")
        if conn:
            conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@api_temp_bp.route('/esercitazioni_temp', methods=['POST'])
@login_required
def crea_esercitazione_temp():
    """Crea una nuova esercitazione temporanea"""
    try:
        data = request.json
        
        # Validazione dati
        if not data.get('nome'):
            return jsonify({'success': False, 'error': 'Nome esercitazione obbligatorio'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Inserisci esercitazione temporanea
        cur.execute("""
            INSERT INTO esercitazioni_temp 
            (nome, nome_breve, anno, note, inserito_da)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (
            data.get('nome', '').upper(),
            data.get('nome_breve', '').upper() if data.get('nome_breve') else None,
            data.get('anno') if data.get('anno') else None,
            data.get('note', '').upper() if data.get('note') else None,
session.get('username', 'SISTEMA')
        ))
        
        new_id = cur.fetchone()['id']
        conn.commit()
        
        logger.info(f"Creata esercitazione temporanea ID: {new_id}")
        
        return jsonify({
            'success': True,
            'id': new_id,
            'message': 'Esercitazione temporanea creata con successo'
        })
        
    except Exception as e:
        logger.error(f"Errore creazione esercitazione temp: {str(e)}")
        if conn:
            conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@api_temp_bp.route('/operazioni_temp', methods=['GET'])
@login_required
def lista_operazioni_temp():
    """Recupera lista operazioni temporanee non validate"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, nome_missione, nome_breve, teatro_operativo, nazione, 
                   data_inserimento, inserito_da, note
            FROM operazioni_temp
            WHERE validato = FALSE
            ORDER BY data_inserimento DESC
        """)
        
        operazioni = cur.fetchall()
        
        return jsonify({
            'success': True,
            'operazioni': operazioni
        })
        
    except Exception as e:
        logger.error(f"Errore recupero operazioni temp: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@api_temp_bp.route('/esercitazioni_temp', methods=['GET'])
@login_required
def lista_esercitazioni_temp():
    """Recupera lista esercitazioni temporanee non validate"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, nome, nome_breve, anno, 
                   data_inserimento, inserito_da, note
            FROM esercitazioni_temp
            WHERE validato = FALSE
            ORDER BY data_inserimento DESC
        """)
        
        esercitazioni = cur.fetchall()
        
        return jsonify({
            'success': True,
            'esercitazioni': esercitazioni
        })
        
    except Exception as e:
        logger.error(f"Errore recupero esercitazioni temp: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()