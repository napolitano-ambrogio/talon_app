# -*- coding: utf-8 -*-
"""
Blueprint per geocoding interattivo TALON
"""
from flask import Blueprint, render_template, request, jsonify
import psycopg2
from psycopg2.extras import RealDictCursor
import sys
import os

# Import per autenticazione
from auth import login_required, permission_required, operatore_or_admin_required

# Aggiungi il percorso per importare geo_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'utils'))
from geo_utils import GeoManager

geocoding_bp = Blueprint('geocoding', __name__)

# Configurazione database
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'talon',
    'user': 'talon',
    'password': 'TalonDB!2025'
}

def get_db_connection():
    """Ottiene connessione database"""
    conn = psycopg2.connect(
        host=DB_CONFIG.get('host', 'localhost'),
        port=DB_CONFIG.get('port', 5432),
        database=DB_CONFIG.get('database', 'talon'),
        user=DB_CONFIG.get('user', 'talon'),
        password=DB_CONFIG.get('password', 'TalonDB!2025'),
        cursor_factory=RealDictCursor
    )
    conn.autocommit = True
    return conn

@geocoding_bp.route('/geocoding')
@login_required
@operatore_or_admin_required
def geocoding_interattivo():
    """Pagina principale geocoding interattivo embedded in TALON"""
    return render_template('geocoding_embedded.html')

@geocoding_bp.route('/api/tutti-gli-enti')
@login_required
@operatore_or_admin_required
def tutti_gli_enti():
    """API per ottenere tutti gli enti (civili e militari) con informazioni sulle coordinate"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Query per enti militari
                cur.execute("""
                    SELECT 
                        id, nome, indirizzo, 'militare' as tipo,
                        CASE WHEN coordinate IS NOT NULL THEN true ELSE false END as ha_coordinate,
                        ST_Y(coordinate) as lat, ST_X(coordinate) as lng
                    FROM enti_militari
                    ORDER BY nome
                """)
                enti_militari = cur.fetchall()
                
                # Query per enti civili  
                cur.execute("""
                    SELECT 
                        id, nome, indirizzo, 'civile' as tipo,
                        CASE WHEN coordinate IS NOT NULL THEN true ELSE false END as ha_coordinate,
                        ST_Y(coordinate) as lat, ST_X(coordinate) as lng
                    FROM enti_civili
                    ORDER BY nome
                """)
                enti_civili = cur.fetchall()
                
                # Combina i risultati
                tutti_enti = []
                
                for ente in enti_militari:
                    tutti_enti.append({
                        'id': ente['id'],
                        'nome': ente['nome'],
                        'indirizzo': ente['indirizzo'] or '',
                        'tipo': 'militare',
                        'ha_coordinate': ente['ha_coordinate'],
                        'lat': float(ente['lat']) if ente['lat'] else None,
                        'lng': float(ente['lng']) if ente['lng'] else None,
                        'label': f"🏛️ {ente['nome']} ({ente['indirizzo'] or 'Indirizzo non specificato'})"
                    })
                
                for ente in enti_civili:
                    tutti_enti.append({
                        'id': ente['id'],
                        'nome': ente['nome'], 
                        'indirizzo': ente['indirizzo'] or '',
                        'tipo': 'civile',
                        'ha_coordinate': ente['ha_coordinate'],
                        'lat': float(ente['lat']) if ente['lat'] else None,
                        'lng': float(ente['lng']) if ente['lng'] else None,
                        'label': f"🏢 {ente['nome']} ({ente['indirizzo'] or 'Indirizzo non specificato'})"
                    })
                
                # Ordina per tipo (militari prima) e poi per nome
                tutti_enti.sort(key=lambda x: (x['tipo'] == 'civile', x['nome']))
                
                return jsonify({
                    'success': True,
                    'enti': tutti_enti,
                    'totale': len(tutti_enti)
                })
                
    except Exception as e:
        print(f"Errore caricamento tutti gli enti: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'enti': []
        }), 500

@geocoding_bp.route('/api/enti-senza-coordinate')
@login_required
@operatore_or_admin_required
def enti_senza_coordinate():
    """API per ottenere enti senza coordinate"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Query per enti militari senza coordinate
                cur.execute("""
                    SELECT 
                        id, nome, indirizzo, 'militare' as tipo
                    FROM enti_militari
                    WHERE coordinate IS NULL
                    ORDER BY nome
                """)
                enti_militari = cur.fetchall()
                
                # Query per enti civili senza coordinate  
                cur.execute("""
                    SELECT 
                        id, nome, indirizzo, 'civile' as tipo
                    FROM enti_civili
                    WHERE coordinate IS NULL
                    ORDER BY nome
                """)
                enti_civili = cur.fetchall()
                
                # Combina i risultati
                tutti_enti = []
                
                for ente in enti_militari:
                    tutti_enti.append({
                        'id': ente['id'],
                        'nome': ente['nome'],
                        'indirizzo': ente['indirizzo'] or '',
                        'tipo': 'militare'
                    })
                
                for ente in enti_civili:
                    tutti_enti.append({
                        'id': ente['id'],
                        'nome': ente['nome'], 
                        'indirizzo': ente['indirizzo'] or '',
                        'tipo': 'civile'
                    })
                
                # Ordina per tipo (militari prima) e poi per nome
                tutti_enti.sort(key=lambda x: (x['tipo'] == 'civile', x['nome']))
                
                return jsonify({
                    'success': True,
                    'enti': tutti_enti,
                    'totale': len(tutti_enti)
                })
                
    except Exception as e:
        print(f"Errore caricamento enti: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'enti': []
        }), 500

@geocoding_bp.route('/api/salva-coordinate', methods=['POST'])
@login_required
@operatore_or_admin_required
def salva_coordinate():
    """API per salvare coordinate di un ente"""
    try:
        data = request.get_json()
        
        # Validazione dati
        required_fields = ['ente_id', 'tipo', 'lat', 'lng']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Campo mancante: {field}'
                }), 400
        
        ente_id = int(data['ente_id'])
        tipo = data['tipo'].lower()
        lat = float(data['lat'])
        lng = float(data['lng'])
        
        # Validazione tipo
        if tipo not in ['militare', 'civile']:
            return jsonify({
                'success': False,
                'error': 'Tipo ente non valido'
            }), 400
        
        # Validazione coordinate globali
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            return jsonify({
                'success': False,
                'error': 'Coordinate non valide (fuori dai limiti terrestri)'
            }), 400
        
        # Usa GeoManager per salvare
        geo_manager = GeoManager(DB_CONFIG)
        success = geo_manager.aggiorna_coordinate_ente(ente_id, lat, lng, tipo)
        
        if success:
            # Ottieni nome ente per conferma
            table = 'enti_militari' if tipo == 'militare' else 'enti_civili'
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT nome FROM {table} WHERE id = %s", (ente_id,))
                    result = cur.fetchone()
                    nome_ente = result['nome'] if result else f"Ente {ente_id}"
            
            return jsonify({
                'success': True,
                'message': f'Coordinate salvate per {nome_ente}',
                'coordinate': {
                    'lat': lat,
                    'lng': lng,
                    'postgis': f'ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)'
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Errore nel salvataggio - ente non trovato'
            }), 404
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Errore nei dati: {str(e)}'
        }), 400
    except Exception as e:
        print(f"Errore salvataggio coordinate: {e}")
        return jsonify({
            'success': False,
            'error': 'Errore interno del server'
        }), 500

@geocoding_bp.route('/api/statistiche-geocoding')
def statistiche_geocoding():
    """API per statistiche geocoding"""
    try:
        geo_manager = GeoManager(DB_CONFIG)
        stats = geo_manager.ottieni_statistiche_geografiche()
        
        return jsonify({
            'success': True,
            'statistiche': stats
        })
        
    except Exception as e:
        print(f"Errore statistiche geocoding: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@geocoding_bp.route('/api/enti-geocodificati')
def enti_geocodificati():
    """API per ottenere enti già geocodificati"""
    try:
        geo_manager = GeoManager(DB_CONFIG)
        
        # Genera GeoJSON di tutti gli enti
        geojson = geo_manager.genera_geojson_enti('tutti')
        
        return jsonify({
            'success': True,
            'geojson': geojson,
            'totale_features': len(geojson['features'])
        })
        
    except Exception as e:
        print(f"Errore caricamento enti geocodificati: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@geocoding_bp.route('/api/aggiorna-indirizzo', methods=['POST'])
@login_required
@operatore_or_admin_required
def aggiorna_indirizzo():
    """API per aggiornare l'indirizzo di un ente"""
    try:
        data = request.get_json()
        
        # Validazione dati
        required_fields = ['ente_id', 'tipo', 'nuovo_indirizzo']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Campo mancante: {field}'
                }), 400
        
        ente_id = int(data['ente_id'])
        tipo = data['tipo'].lower()
        nuovo_indirizzo = data['nuovo_indirizzo'].strip()
        
        # Validazione tipo
        if tipo not in ['militare', 'civile']:
            return jsonify({
                'success': False,
                'error': 'Tipo ente non valido'
            }), 400
        
        # Validazione indirizzo
        if len(nuovo_indirizzo) < 5:
            return jsonify({
                'success': False,
                'error': 'Indirizzo troppo corto'
            }), 400
        
        table = 'enti_militari' if tipo == 'militare' else 'enti_civili'
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Verifica che l'ente esista
                cur.execute(f"SELECT nome FROM {table} WHERE id = %s", (ente_id,))
                result = cur.fetchone()
                
                if not result:
                    return jsonify({
                        'success': False,
                        'error': 'Ente non trovato'
                    }), 404
                
                nome_ente = result['nome']
                
                # Aggiorna l'indirizzo
                cur.execute(f"""
                    UPDATE {table} 
                    SET indirizzo = %s 
                    WHERE id = %s
                """, (nuovo_indirizzo, ente_id))
                
                if cur.rowcount > 0:
                    return jsonify({
                        'success': True,
                        'message': f'Indirizzo aggiornato per {nome_ente}',
                        'ente': {
                            'id': ente_id,
                            'nome': nome_ente,
                            'nuovo_indirizzo': nuovo_indirizzo
                        }
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Errore nell\'aggiornamento'
                    }), 500
                    
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Errore nei dati: {str(e)}'
        }), 400
    except Exception as e:
        print(f"Errore aggiornamento indirizzo: {e}")
        return jsonify({
            'success': False,
            'error': 'Errore interno del server'
        }), 500

@geocoding_bp.route('/api/reset-coordinate', methods=['POST'])
def reset_coordinate():
    """API per resettare coordinate di un ente"""
    try:
        data = request.get_json()
        
        if 'ente_id' not in data or 'tipo' not in data:
            return jsonify({
                'success': False,
                'error': 'Parametri mancanti'
            }), 400
        
        ente_id = int(data['ente_id'])
        tipo = data['tipo'].lower()
        
        if tipo not in ['militare', 'civile']:
            return jsonify({
                'success': False,
                'error': 'Tipo ente non valido'
            }), 400
        
        table = 'enti_militari' if tipo == 'militare' else 'enti_civili'
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    UPDATE {table} 
                    SET coordinate = NULL 
                    WHERE id = %s
                """, (ente_id,))
                
                if cur.rowcount > 0:
                    return jsonify({
                        'success': True,
                        'message': 'Coordinate resettate'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Ente non trovato'
                    }), 404
                    
    except Exception as e:
        print(f"Errore reset coordinate: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Funzione per registrare il blueprint nell'app principale
def register_geocoding_blueprint(app):
    """Registra il blueprint nell'app Flask"""
    app.register_blueprint(geocoding_bp)
    print("OK Blueprint geocoding registrato")