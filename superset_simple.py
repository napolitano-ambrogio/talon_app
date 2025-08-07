"""
Integrazione semplice con Superset per TALON
Solo le funzioni essenziali per l'autenticazione
"""

from flask import Blueprint, jsonify, request, session
import requests
import re
from functools import wraps

superset_simple = Blueprint('superset_simple', __name__)

# Configurazione
SUPERSET_BASE_URL = "http://127.0.0.1:8088"

# Sessione globale per Superset
superset_session = None

def require_auth(f):
    """Decorator per verificare autenticazione TALON"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Non autenticato in TALON'}), 401
        return f(*args, **kwargs)
    return decorated_function

@superset_simple.route('/api/superset/simple/login', methods=['POST'])
@require_auth
def simple_login():
    """Login semplice in Superset"""
    global superset_session
    
    try:
        data = request.get_json()
        password = data.get('password')
        
        if not password:
            return jsonify({
                'success': False,
                'error': 'Password richiesta'
            })
        
        # Usa username dalla sessione TALON o default
        try:
            username = session.get('username')
            if not username:
                username = 'admin'
        except:
            username = 'admin'
        
        # Crea nuova sessione
        superset_session = requests.Session()
        
        # Step 1: Ottieni pagina login per CSRF
        login_page = superset_session.get(f"{SUPERSET_BASE_URL}/login/")
        
        # Step 2: Estrai CSRF token se presente
        csrf_token = None
        if 'csrf_token' in login_page.text:
            match = re.search(r'name="csrf_token".*?value="([^"]+)"', login_page.text)
            if match:
                csrf_token = match.group(1)
        
        # Step 3: Prepara dati login
        login_data = {
            'username': username,
            'password': password,
        }
        if csrf_token:
            login_data['csrf_token'] = csrf_token
        
        # Step 4: Effettua login
        response = superset_session.post(
            f"{SUPERSET_BASE_URL}/login/",
            data=login_data,
            allow_redirects=True
        )
        
        # Step 5: Verifica successo
        if response.status_code == 200:
            if '/superset/welcome' in response.url or '/dashboard' in response.url:
                return jsonify({
                    'success': True,
                    'message': 'Login effettuato con successo'
                })
            elif 'Invalid login' in response.text or 'Wrong username' in response.text:
                superset_session = None
                return jsonify({
                    'success': False,
                    'error': 'Credenziali non valide'
                })
        
        superset_session = None
        return jsonify({
            'success': False,
            'error': 'Login fallito'
        })
        
    except Exception as e:
        superset_session = None
        return jsonify({
            'success': False,
            'error': str(e)
        })

@superset_simple.route('/api/superset/simple/check', methods=['GET'])
@require_auth
def simple_check():
    """Verifica se siamo connessi a Superset"""
    global superset_session
    
    is_connected = superset_session is not None
    
    # Prova a verificare la sessione
    if is_connected:
        try:
            response = superset_session.get(
                f"{SUPERSET_BASE_URL}/superset/welcome/",
                allow_redirects=False,
                timeout=2
            )
            if response.status_code != 200:
                is_connected = False
                superset_session = None
        except:
            is_connected = False
            superset_session = None
    
    return jsonify({
        'success': True,
        'connected': is_connected
    })

@superset_simple.route('/api/superset/simple/dashboards', methods=['GET'])
@require_auth
def simple_dashboards():
    """Ritorna lista di dashboard - prova a recuperarle da Superset o usa esempi"""
    global superset_session
    dashboards = []
    
    # Se abbiamo una sessione attiva, prova a recuperare le dashboard reali
    if superset_session:
        try:
            # Prova a recuperare la pagina delle dashboard
            response = superset_session.get(f"{SUPERSET_BASE_URL}/dashboard/list/")
            
            if response.status_code == 200:
                # Cerca dashboard nel HTML
                import re
                
                # Pattern per trovare dashboard nel HTML
                # Cerca link del tipo /superset/dashboard/ID/
                pattern = r'/superset/dashboard/(\d+)/[^"]*"[^>]*>([^<]+)'
                matches = re.findall(pattern, response.text)
                
                seen_ids = set()
                for match in matches:
                    dash_id = match[0]
                    dash_title = match[1].strip()
                    
                    if dash_id not in seen_ids:
                        seen_ids.add(dash_id)
                        dashboards.append({
                            'id': int(dash_id),
                            'title': dash_title if dash_title else f'Dashboard {dash_id}',
                            'type': 'dashboard'
                        })
                
                # Se abbiamo trovato dashboard reali, ritornale
                if dashboards:
                    return jsonify({
                        'success': True,
                        'dashboards': dashboards,
                        'source': 'superset'
                    })
        except Exception as e:
            print(f"Errore recupero dashboard: {e}")
    
    # Fallback: genera lista dashboard di esempio (ID 1-10)
    for i in range(1, 11):
        dashboards.append({
            'id': i,
            'title': f'Dashboard {i}',
            'type': 'dashboard'
        })
    
    return jsonify({
        'success': True,
        'dashboards': dashboards,
        'source': 'example'
    })

@superset_simple.route('/api/superset/simple/charts', methods=['GET'])
@require_auth
def simple_charts():
    """Ritorna lista di grafici - prova a recuperarli da Superset o usa esempi"""
    global superset_session
    charts = []
    
    # Se abbiamo una sessione attiva, prova a recuperare i grafici reali
    if superset_session:
        try:
            # Prova a recuperare la pagina dei grafici
            response = superset_session.get(f"{SUPERSET_BASE_URL}/chart/list/")
            
            if response.status_code == 200:
                # Cerca grafici nel HTML
                import re
                
                # Pattern per trovare grafici
                # Cerca parametri slice_id=ID
                pattern = r'slice_id=(\d+)[^>]*>([^<]+)'
                matches = re.findall(pattern, response.text)
                
                # Pattern alternativo per explore
                pattern2 = r'/explore/[^?]*\?.*?slice_id=(\d+)'
                matches2 = re.findall(pattern2, response.text)
                
                seen_ids = set()
                
                # Processa i match del primo pattern
                for match in matches:
                    chart_id = match[0]
                    chart_title = match[1].strip()
                    
                    if chart_id not in seen_ids:
                        seen_ids.add(chart_id)
                        charts.append({
                            'id': int(chart_id),
                            'title': chart_title if chart_title else f'Grafico {chart_id}',
                            'type': 'chart'
                        })
                
                # Aggiungi ID trovati dal secondo pattern
                for chart_id in matches2:
                    if chart_id not in seen_ids:
                        seen_ids.add(chart_id)
                        charts.append({
                            'id': int(chart_id),
                            'title': f'Grafico {chart_id}',
                            'type': 'chart'
                        })
                
                # Se abbiamo trovato grafici reali, ritornali
                if charts:
                    return jsonify({
                        'success': True,
                        'charts': charts,
                        'source': 'superset'
                    })
        except Exception as e:
            print(f"Errore recupero grafici: {e}")
    
    # Fallback: genera lista grafici di esempio (ID 1-20)
    for i in range(1, 21):
        charts.append({
            'id': i,
            'title': f'Grafico {i}',
            'type': 'chart'
        })
    
    return jsonify({
        'success': True,
        'charts': charts,
        'source': 'example'
    })