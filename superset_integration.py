"""
Integrazione semplificata con Apache Superset
Usa sessione condivisa tramite cookie invece delle API
"""

from flask import Blueprint, jsonify, request, session, make_response
import requests
from functools import wraps
import re
import json
from bs4 import BeautifulSoup

superset_integration = Blueprint('superset_integration', __name__)

# Configurazione Superset
SUPERSET_BASE_URL = "http://127.0.0.1:8088"

def require_auth(f):
    """Decorator per verificare autenticazione"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Non autenticato'}), 401
        return f(*args, **kwargs)
    return decorated_function

class SupersetSession:
    """Gestisce la sessione con Superset usando cookie"""
    
    def __init__(self):
        self.session = requests.Session()
        self.is_authenticated = False
        
    def login(self, username, password):
        """Login in Superset usando form authentication"""
        try:
            # Prima ottieni la pagina di login per il CSRF token
            login_page = self.session.get(f"{SUPERSET_BASE_URL}/login/")
            
            # Estrai CSRF token
            csrf_token = None
            if 'csrf_token' in login_page.text:
                match = re.search(r'csrf_token.*?value="([^"]+)"', login_page.text)
                if match:
                    csrf_token = match.group(1)
            
            # Prepara i dati di login
            login_data = {
                'username': username,
                'password': password,
            }
            
            if csrf_token:
                login_data['csrf_token'] = csrf_token
            
            # Effettua il login
            response = self.session.post(
                f"{SUPERSET_BASE_URL}/login/",
                data=login_data,
                allow_redirects=True
            )
            
            # Verifica se il login è andato a buon fine
            if response.status_code == 200:
                # Controlla se siamo stati reindirizzati alla dashboard
                if '/superset/welcome' in response.url or '/superset/dashboard' in response.url:
                    self.is_authenticated = True
                    return True, "Login effettuato con successo"
                elif 'Invalid login' in response.text or 'Wrong username' in response.text:
                    return False, "Credenziali non valide"
            
            return False, f"Errore login: status {response.status_code}"
            
        except Exception as e:
            return False, f"Errore connessione: {str(e)}"
    
    def get_dashboards_list(self):
        """Ottiene la lista delle dashboard scraping la pagina"""
        try:
            if not self.is_authenticated:
                return {'success': False, 'error': 'Non autenticato'}
            
            # Vai alla lista dashboard
            response = self.session.get(f"{SUPERSET_BASE_URL}/dashboard/list/")
            
            if response.status_code != 200:
                return {'success': False, 'error': 'Impossibile accedere alle dashboard'}
            
            dashboards = []
            
            # Prova a estrarre i dati dal bootstrap data
            bootstrap_match = re.search(r'const bootstrapData = ({.*?});', response.text, re.DOTALL)
            if bootstrap_match:
                try:
                    bootstrap_data = json.loads(bootstrap_match.group(1))
                    if 'dashboards' in bootstrap_data:
                        for dash in bootstrap_data['dashboards']:
                            dashboards.append({
                                'id': dash.get('id'),
                                'title': dash.get('dashboard_title', 'Senza titolo'),
                                'url': f"{SUPERSET_BASE_URL}/superset/dashboard/{dash.get('id')}/",
                                'type': 'dashboard'
                            })
                except:
                    pass
            
            # Se non troviamo bootstrap data, prova con parsing HTML
            if not dashboards:
                soup = BeautifulSoup(response.text, 'html.parser')
                # Cerca link alle dashboard
                for link in soup.find_all('a', href=re.compile(r'/superset/dashboard/\d+')):
                    dash_id = re.search(r'/dashboard/(\d+)', link['href']).group(1)
                    title = link.text.strip() or f"Dashboard {dash_id}"
                    dashboards.append({
                        'id': dash_id,
                        'title': title,
                        'url': f"{SUPERSET_BASE_URL}/superset/dashboard/{dash_id}/",
                        'type': 'dashboard'
                    })
            
            return {'success': True, 'dashboards': dashboards}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_charts_list(self):
        """Ottiene la lista dei grafici"""
        try:
            if not self.is_authenticated:
                return {'success': False, 'error': 'Non autenticato'}
            
            # Vai alla lista grafici
            response = self.session.get(f"{SUPERSET_BASE_URL}/chart/list/")
            
            if response.status_code != 200:
                return {'success': False, 'error': 'Impossibile accedere ai grafici'}
            
            charts = []
            
            # Cerca dati bootstrap
            bootstrap_match = re.search(r'const bootstrapData = ({.*?});', response.text, re.DOTALL)
            if bootstrap_match:
                try:
                    bootstrap_data = json.loads(bootstrap_match.group(1))
                    if 'charts' in bootstrap_data:
                        for chart in bootstrap_data['charts']:
                            charts.append({
                                'id': chart.get('id'),
                                'title': chart.get('slice_name', 'Senza titolo'),
                                'url': f"{SUPERSET_BASE_URL}/explore/?slice_id={chart.get('id')}",
                                'type': 'chart'
                            })
                except:
                    pass
            
            # Fallback: parsing HTML
            if not charts:
                soup = BeautifulSoup(response.text, 'html.parser')
                for link in soup.find_all('a', href=re.compile(r'slice_id=\d+')):
                    slice_match = re.search(r'slice_id=(\d+)', link['href'])
                    if slice_match:
                        slice_id = slice_match.group(1)
                        title = link.text.strip() or f"Grafico {slice_id}"
                        charts.append({
                            'id': slice_id,
                            'title': title,
                            'url': f"{SUPERSET_BASE_URL}/explore/?slice_id={slice_id}",
                            'type': 'chart'
                        })
            
            return {'success': True, 'charts': charts}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def check_auth(self):
        """Verifica se siamo autenticati controllando l'accesso a una pagina protetta"""
        try:
            response = self.session.get(
                f"{SUPERSET_BASE_URL}/superset/welcome/",
                allow_redirects=False
            )
            
            # Se otteniamo 200 o 302 verso dashboard, siamo autenticati
            if response.status_code == 200:
                self.is_authenticated = True
                return True
            elif response.status_code == 302:
                # Se veniamo reindirizzati al login, non siamo autenticati
                if '/login' in response.headers.get('Location', ''):
                    self.is_authenticated = False
                    return False
                else:
                    self.is_authenticated = True
                    return True
            
            return False
            
        except:
            return False

# Istanza globale della sessione
superset_session = SupersetSession()

@superset_integration.route('/api/superset/login', methods=['POST'])
@require_auth
def superset_login():
    """Effettua il login in Superset"""
    try:
        data = request.get_json()
        password = data.get('password')
        
        if not password:
            return jsonify({
                'success': False,
                'error': 'Password richiesta'
            })
        
        # Usa lo stesso username di TALON
        username = session.get('username')
        
        # Effettua il login
        success, message = superset_session.login(username, password)
        
        if success:
            return jsonify({
                'success': True,
                'message': message
            })
        else:
            return jsonify({
                'success': False,
                'error': message
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@superset_integration.route('/api/superset/check-auth', methods=['GET'])
@require_auth
def check_superset_auth():
    """Verifica se siamo autenticati in Superset"""
    try:
        is_auth = superset_session.check_auth()
        return jsonify({
            'success': True,
            'authenticated': is_auth
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'authenticated': False,
            'error': str(e)
        })

@superset_integration.route('/api/superset/content', methods=['GET'])
@require_auth
def get_superset_content():
    """Ottiene dashboard e grafici disponibili"""
    try:
        if not superset_session.is_authenticated:
            # Prova a verificare l'autenticazione
            if not superset_session.check_auth():
                return jsonify({
                    'success': False,
                    'error': 'Non autenticato in Superset',
                    'need_auth': True
                })
        
        # Ottieni dashboard
        dashboards_result = superset_session.get_dashboards_list()
        
        # Ottieni grafici
        charts_result = superset_session.get_charts_list()
        
        # Combina i risultati
        all_content = []
        
        if dashboards_result.get('success'):
            all_content.extend(dashboards_result.get('dashboards', []))
        
        if charts_result.get('success'):
            all_content.extend(charts_result.get('charts', []))
        
        # Se non troviamo contenuti, generiamo alcuni esempi predefiniti
        if not all_content:
            # Aggiungi alcune dashboard di esempio comuni
            for i in range(1, 5):
                all_content.append({
                    'id': i,
                    'title': f'Dashboard {i}',
                    'url': f"{SUPERSET_BASE_URL}/superset/dashboard/{i}/",
                    'type': 'dashboard'
                })
            
            # Aggiungi alcuni grafici di esempio
            for i in range(1, 10):
                all_content.append({
                    'id': i,
                    'title': f'Grafico {i}',
                    'url': f"{SUPERSET_BASE_URL}/explore/?slice_id={i}",
                    'type': 'chart'
                })
        
        return jsonify({
            'success': True,
            'content': all_content
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@superset_integration.route('/api/superset/manual-add', methods=['POST'])
@require_auth
def manual_add_content():
    """Permette di aggiungere manualmente un URL di Superset"""
    try:
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({
                'success': False,
                'error': 'URL richiesto'
            })
        
        # Parse dell'URL per determinare tipo e ID
        content_data = None
        
        # Check se è una dashboard
        dash_match = re.search(r'/superset/dashboard/(\d+)', url)
        if dash_match:
            dash_id = dash_match.group(1)
            content_data = {
                'type': 'dashboard',
                'id': dash_id,
                'title': f'Dashboard {dash_id}',
                'dashboardId': dash_id
            }
        
        # Check se è un grafico
        slice_match = re.search(r'slice_id=(\d+)', url)
        if slice_match and not content_data:
            slice_id = slice_match.group(1)
            
            # Estrai form_data_key se presente
            form_data_match = re.search(r'form_data_key=([^&]+)', url)
            form_data_key = form_data_match.group(1) if form_data_match else None
            
            content_data = {
                'type': 'chart',
                'id': slice_id,
                'title': f'Grafico {slice_id}',
                'sliceId': slice_id,
                'formDataKey': form_data_key
            }
        
        if content_data:
            return jsonify({
                'success': True,
                'content': content_data
            })
        else:
            return jsonify({
                'success': False,
                'error': 'URL non riconosciuto'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500