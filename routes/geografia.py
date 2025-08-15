# -*- coding: utf-8 -*-
"""
Route per gestione geografica TALON
"""
from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for
from auth import login_required, permission_required, get_current_user_info
import os
import sys
import json

# Aggiungi utils al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'utils'))

try:
    from geo_utils import GeoManager
    POSTGIS_AVAILABLE = True
except ImportError:
    POSTGIS_AVAILABLE = False
    print("Warning: PostGIS non disponibile. Installare PostGIS per abilitare funzionalità geografiche.")

geografia_bp = Blueprint('geografia', __name__)

def get_geo_manager():
    """Ottiene istanza GeoManager"""
    if not POSTGIS_AVAILABLE:
        return None
    
    db_config = {
        'host': os.environ.get("TALON_PG_HOST", "127.0.0.1"),
        'port': int(os.environ.get("TALON_PG_PORT", "5432")),
        'database': os.environ.get("TALON_PG_DB", "talon"),
        'user': os.environ.get("TALON_PG_USER", "postgres"),
        'password': os.environ.get("TALON_PG_PASSWORD", "postgres")
    }
    return GeoManager(db_config)

@geografia_bp.route('/mappa')
@login_required
@permission_required('VIEW_ENTI_MILITARI')
def mappa():
    """Visualizza mappa interattiva degli enti"""
    if not POSTGIS_AVAILABLE:
        flash('PostGIS non è installato. Le funzionalità geografiche non sono disponibili.', 'warning')
        return redirect(url_for('main.dashboard'))
    
    user_info = get_current_user_info()
    geo = get_geo_manager()
    
    try:
        # Ottieni statistiche geografiche
        stats = geo.ottieni_statistiche_geografiche()
        
        return render_template('geografia/mappa.html', 
                             user=user_info,
                             stats=stats)
    except Exception as e:
        flash(f'Errore nel caricamento della mappa: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@geografia_bp.route('/api/geojson/<tipo>')
@login_required  
@permission_required('VIEW_ENTI_MILITARI')
def api_geojson(tipo):
    """
    API per ottenere dati GeoJSON degli enti
    
    Args:
        tipo: 'militari', 'civili', 'tutti'
    """
    if not POSTGIS_AVAILABLE:
        return jsonify({'error': 'PostGIS non disponibile'}), 500
    
    geo = get_geo_manager()
    
    try:
        geojson = geo.genera_geojson_enti(tipo)
        return jsonify(geojson)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@geografia_bp.route('/api/enti-vicini')
@login_required
@permission_required('VIEW_ENTI_MILITARI') 
def api_enti_vicini():
    """
    API per trovare enti vicini a un punto
    
    Query params:
        - lat: latitudine
        - lon: longitudine  
        - raggio: raggio in km (default 50)
        - limite: max risultati (default 10)
    """
    if not POSTGIS_AVAILABLE:
        return jsonify({'error': 'PostGIS non disponibile'}), 500
    
    try:
        lat = float(request.args.get('lat', 41.9028))
        lon = float(request.args.get('lon', 12.4964))
        raggio = int(request.args.get('raggio', 50))
        limite = int(request.args.get('limite', 10))
        
        geo = get_geo_manager()
        enti = geo.trova_enti_vicini(lat, lon, raggio, limite)
        
        return jsonify(enti)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@geografia_bp.route('/aggiorna-coordinate/<tipo>/<int:id>', methods=['POST'])
@login_required
@permission_required('EDIT_ENTI_MILITARI')
def aggiorna_coordinate(tipo, id):
    """
    Aggiorna coordinate di un ente
    
    Args:
        tipo: 'militare' o 'civile'
        id: ID dell'ente
        
    POST data:
        - lat: latitudine
        - lon: longitudine
    """
    if not POSTGIS_AVAILABLE:
        return jsonify({'error': 'PostGIS non disponibile'}), 500
    
    try:
        data = request.get_json()
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        
        geo = get_geo_manager()
        success = geo.aggiorna_coordinate_ente(id, lat, lon, tipo)
        
        if success:
            return jsonify({'success': True, 'message': 'Coordinate aggiornate'})
        else:
            return jsonify({'error': 'Errore nell\'aggiornamento'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@geografia_bp.route('/geocodifica')
@login_required
@permission_required('EDIT_ENTI_MILITARI')
def geocodifica():
    """
    Pagina per geocodificare indirizzi degli enti
    """
    if not POSTGIS_AVAILABLE:
        flash('PostGIS non è installato.', 'warning')
        return redirect(url_for('main.dashboard'))
    
    user_info = get_current_user_info()
    geo = get_geo_manager()
    
    try:
        stats = geo.ottieni_statistiche_geografiche()
        return render_template('geografia/geocodifica.html',
                             user=user_info,
                             stats=stats)
    except Exception as e:
        flash(f'Errore: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

@geografia_bp.route('/api/geocodifica-batch', methods=['POST'])
@login_required
@permission_required('EDIT_ENTI_MILITARI')
def api_geocodifica_batch():
    """
    Geocodifica batch degli enti senza coordinate
    """
    if not POSTGIS_AVAILABLE:
        return jsonify({'error': 'PostGIS non disponibile'}), 500
    
    try:
        geo = get_geo_manager()
        risultati = []
        
        # Qui implementeresti la logica per geocodificare tutti gli enti
        # Per ora restituiamo un messaggio di successo
        
        return jsonify({
            'success': True,
            'processati': 0,
            'aggiornati': 0,
            'errori': 0,
            'dettagli': risultati
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@geografia_bp.route('/statistiche')
@login_required
@permission_required('VIEW_ENTI_MILITARI')
def statistiche():
    """Pagina statistiche geografiche"""
    if not POSTGIS_AVAILABLE:
        flash('PostGIS non è installato.', 'warning')
        return redirect(url_for('main.dashboard'))
    
    user_info = get_current_user_info()
    geo = get_geo_manager()
    
    try:
        stats = geo.ottieni_statistiche_geografiche()
        return render_template('geografia/statistiche.html',
                             user=user_info, 
                             stats=stats)
    except Exception as e:
        flash(f'Errore nel caricamento delle statistiche: {str(e)}', 'error')
        return redirect(url_for('main.dashboard'))

# Error handlers
@geografia_bp.errorhandler(Exception)
def handle_error(error):
    """Gestione errori generici"""
    flash(f'Errore geografico: {str(error)}', 'error')
    return redirect(url_for('main.dashboard'))