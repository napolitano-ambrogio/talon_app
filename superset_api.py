"""
API per l'integrazione con Apache Superset
Gestisce autenticazione e recupero di dashboard/grafici
"""

from flask import Blueprint, jsonify, request, session
import requests
import json
from functools import wraps

superset_api = Blueprint('superset_api', __name__)

# Configurazione Superset
SUPERSET_BASE_URL = "http://127.0.0.1:8088"
SUPERSET_API_URL = f"{SUPERSET_BASE_URL}/api/v1"

def require_auth(f):
    """Decorator per verificare autenticazione"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Non autenticato'}), 401
        return f(*args, **kwargs)
    return decorated_function

class SupersetClient:
    """Client per interagire con l'API di Superset"""
    
    def __init__(self, base_url=SUPERSET_BASE_URL):
        self.base_url = base_url
        self.api_url = f"{base_url}/api/v1"
        self.session = requests.Session()
        self.access_token = None
        self.refresh_token = None
        
    def login(self, username, password):
        """Autentica l'utente in Superset"""
        try:
            # Endpoint di login di Superset
            login_url = f"{self.api_url}/security/login"
            
            payload = {
                "username": username,
                "password": password,
                "provider": "db",
                "refresh": True
            }
            
            response = self.session.post(
                login_url,
                json=payload,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get('access_token')
                self.refresh_token = data.get('refresh_token')
                
                # Imposta il token nell'header per le richieste successive
                self.session.headers.update({
                    'Authorization': f'Bearer {self.access_token}'
                })
                
                return True, data
            else:
                return False, response.text
                
        except Exception as e:
            return False, str(e)
    
    def get_dashboards(self):
        """Recupera l'elenco delle dashboard"""
        try:
            if not self.access_token:
                return {'success': False, 'error': 'Non autenticato in Superset'}
            
            # Query per ottenere le dashboard
            params = {
                'q': json.dumps({
                    'page_size': 100,
                    'order_column': 'changed_on_delta_humanized',
                    'order_direction': 'desc'
                })
            }
            
            response = self.session.get(
                f"{self.api_url}/dashboard/",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                dashboards = []
                
                for dashboard in data.get('result', []):
                    dashboards.append({
                        'id': dashboard['id'],
                        'title': dashboard['dashboard_title'],
                        'url': f"{self.base_url}/superset/dashboard/{dashboard['id']}/",
                        'published': dashboard.get('published', False),
                        'changed_on': dashboard.get('changed_on_delta_humanized', ''),
                        'owner': dashboard.get('changed_by_name', ''),
                        'type': 'dashboard'
                    })
                
                return {'success': True, 'dashboards': dashboards}
            else:
                return {'success': False, 'error': f'Errore: {response.status_code}'}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_charts(self):
        """Recupera l'elenco dei grafici"""
        try:
            if not self.access_token:
                return {'success': False, 'error': 'Non autenticato in Superset'}
            
            # Query per ottenere i grafici
            params = {
                'q': json.dumps({
                    'page_size': 100,
                    'order_column': 'changed_on_delta_humanized',
                    'order_direction': 'desc'
                })
            }
            
            response = self.session.get(
                f"{self.api_url}/chart/",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                charts = []
                
                for chart in data.get('result', []):
                    # Costruisci l'URL del grafico
                    explore_url = f"{self.base_url}/explore/?slice_id={chart['id']}"
                    
                    charts.append({
                        'id': chart['id'],
                        'title': chart['slice_name'],
                        'url': explore_url,
                        'datasource': chart.get('datasource_name_text', ''),
                        'viz_type': chart.get('viz_type', ''),
                        'changed_on': chart.get('changed_on_delta_humanized', ''),
                        'owner': chart.get('changed_by_name', ''),
                        'type': 'chart',
                        'form_data_key': None  # Sarà popolato quando necessario
                    })
                
                return {'success': True, 'charts': charts}
            else:
                return {'success': False, 'error': f'Errore: {response.status_code}'}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_chart_form_data(self, chart_id):
        """Recupera il form_data_key per un grafico specifico"""
        try:
            if not self.access_token:
                return None
            
            # Ottieni i dettagli del grafico
            response = self.session.get(f"{self.api_url}/chart/{chart_id}")
            
            if response.status_code == 200:
                data = response.json()
                result = data.get('result', {})
                
                # Crea il form_data per l'explore
                form_data = result.get('form_data', {})
                
                # Salva il form_data e ottieni la chiave
                save_response = self.session.post(
                    f"{self.api_url}/explore/form_data",
                    json=form_data
                )
                
                if save_response.status_code == 201:
                    save_data = save_response.json()
                    return save_data.get('key')
                    
            return None
            
        except Exception as e:
            print(f"Errore recupero form_data: {e}")
            return None

# Istanza globale del client
superset_client = SupersetClient()

@superset_api.route('/api/superset/auth', methods=['POST'])
@require_auth
def authenticate_superset():
    """Autentica l'utente in Superset usando le stesse credenziali di TALON"""
    try:
        # Recupera username dalla sessione
        username = session.get('username')
        
        # Ricevi la password dal frontend (per sicurezza)
        data = request.get_json()
        password = data.get('password')
        
        if not password:
            # Se non viene fornita password, usa quella della sessione se salvata
            # (Nota: in produzione potresti voler gestire questo diversamente)
            return jsonify({
                'success': False,
                'error': 'Password richiesta',
                'need_password': True
            })
        
        # Autentica in Superset
        success, result = superset_client.login(username, password)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Autenticato in Superset',
                'access_token': result.get('access_token')
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Autenticazione fallita: {result}'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@superset_api.route('/api/superset/dashboards', methods=['GET'])
@require_auth
def get_dashboards():
    """Recupera l'elenco delle dashboard disponibili"""
    try:
        result = superset_client.get_dashboards()
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@superset_api.route('/api/superset/charts', methods=['GET'])
@require_auth
def get_charts():
    """Recupera l'elenco dei grafici disponibili"""
    try:
        result = superset_client.get_charts()
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@superset_api.route('/api/superset/all-content', methods=['GET'])
@require_auth
def get_all_content():
    """Recupera sia dashboard che grafici"""
    try:
        dashboards_result = superset_client.get_dashboards()
        charts_result = superset_client.get_charts()
        
        if dashboards_result['success'] and charts_result['success']:
            return jsonify({
                'success': True,
                'content': {
                    'dashboards': dashboards_result['dashboards'],
                    'charts': charts_result['charts']
                }
            })
        else:
            error = dashboards_result.get('error') or charts_result.get('error')
            return jsonify({
                'success': False,
                'error': error
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@superset_api.route('/api/superset/chart/<int:chart_id>/form-data', methods=['GET'])
@require_auth
def get_chart_form_data(chart_id):
    """Ottiene il form_data_key per un grafico specifico"""
    try:
        form_data_key = superset_client.get_chart_form_data(chart_id)
        
        if form_data_key:
            return jsonify({
                'success': True,
                'form_data_key': form_data_key
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Impossibile ottenere form_data_key'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@superset_api.route('/api/superset/check-auth', methods=['GET'])
@require_auth
def check_superset_auth():
    """Verifica se siamo autenticati in Superset"""
    try:
        is_authenticated = superset_client.access_token is not None
        return jsonify({
            'success': True,
            'authenticated': is_authenticated
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500