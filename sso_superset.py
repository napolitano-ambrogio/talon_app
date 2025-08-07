# sso_superset.py - Modulo SSO per integrazione TALON → Superset
# Da inserire nella directory principale di TALON

import jwt
import datetime
from flask import session, current_app, make_response, jsonify
import hashlib
import json

# Chiave segreta condivisa tra TALON e Superset - DEVE essere identica in entrambi i sistemi
JWT_SECRET_KEY = 'h5P0T4bc6jX4eKfwN2VSeYkO0AZKPXMZz9cLbRBxnu5Mexj95pQPdl5jF1VBkB3G'
JWT_ALGORITHM = 'HS256'

def generate_superset_token(user_data=None):
    """
    Genera un token JWT per l'autenticazione SSO in Superset
    
    Args:
        user_data: Dizionario con i dati utente (opzionale, usa la sessione se non fornito)
    
    Returns:
        str: Token JWT per Superset
    """
    # Usa i dati dalla sessione Flask se non forniti
    if user_data is None:
        user_data = {
            'username': session.get('username'),
            'user_id': session.get('user_id'),
            'role': session.get('ruolo_nome', 'VISUALIZZATORE'),
            'nome': session.get('nome', ''),
            'cognome': session.get('cognome', ''),
            'email': session.get('email', f"{session.get('username')}@talon.local"),
            'ente_militare_id': session.get('ente_militare_id'),
            'accesso_globale': session.get('accesso_globale', False)
        }
    
    # Verifica che ci sia almeno l'username
    if not user_data.get('username'):
        raise ValueError("Username mancante per generazione token SSO")
    
    # Prepara il payload JWT
    payload = {
        'sub': user_data['username'],  # Subject (username)
        'user_id': user_data['user_id'],
        'role': user_data['role'].upper(),
        'nome': user_data['nome'],
        'cognome': user_data['cognome'],
        'email': user_data['email'],
        'ente_militare_id': user_data['ente_militare_id'],
        'accesso_globale': user_data['accesso_globale'],
        'iat': datetime.datetime.utcnow(),  # Issued at
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=8),  # Expires in 8 hours
        'iss': 'TALON',  # Issuer
        'aud': 'Superset'  # Audience
    }
    
    # Genera il token
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    
    # Log per debug
    if current_app and current_app.debug:
        current_app.logger.debug(f"Token SSO generato per {user_data['username']}")
    
    return token

def get_superset_sso_url(dashboard_id=None, return_url=None):
    """
    Genera l'URL di Superset con token SSO
    
    Args:
        dashboard_id: ID della dashboard da aprire (opzionale)
        return_url: URL di ritorno dopo login (opzionale)
    
    Returns:
        str: URL completo di Superset con token
    """
    # Base URL di Superset
    SUPERSET_BASE_URL = 'http://127.0.0.1:8088'
    
    # Genera il token
    token = generate_superset_token()
    
    # Costruisci l'URL
    if dashboard_id:
        # Vai direttamente alla dashboard
        url = f"{SUPERSET_BASE_URL}/superset/dashboard/{dashboard_id}/?token={token}"
        url += "&standalone=1&show_top_bar=0&hide_nav=1&embedded=1"
    elif return_url:
        # Vai a un URL specifico dopo login
        url = f"{SUPERSET_BASE_URL}/login/?token={token}&next={return_url}"
    else:
        # Vai alla home di Superset
        url = f"{SUPERSET_BASE_URL}/login/?token={token}"
    
    return url

def create_superset_iframe_with_sso(dashboard_id, width='100%', height='600px'):
    """
    Crea il codice HTML per un iframe di Superset con SSO
    
    Args:
        dashboard_id: ID della dashboard Superset
        width: Larghezza dell'iframe
        height: Altezza dell'iframe
    
    Returns:
        str: HTML dell'iframe con token SSO
    """
    url = get_superset_sso_url(dashboard_id)
    
    iframe_html = f'''
    <iframe 
        src="{url}"
        width="{width}"
        height="{height}"
        frameborder="0"
        style="border: 1px solid #ddd; border-radius: 4px;"
        loading="lazy"
        allowfullscreen>
    </iframe>
    '''
    
    return iframe_html

def inject_sso_token_in_response(response):
    """
    Inietta il token SSO nei cookie della risposta
    
    Args:
        response: Flask Response object
    
    Returns:
        Response: Response con cookie JWT aggiunto
    """
    if session.get('logged_in') and session.get('username'):
        token = generate_superset_token()
        response.set_cookie(
            'jwt_token',
            value=token,
            max_age=28800,  # 8 ore
            httponly=False,  # Deve essere leggibile da JavaScript
            secure=False,    # Per sviluppo in HTTP
            samesite='Lax'
        )
    return response

# Funzione helper per verificare se un token è valido
def verify_superset_token(token):
    """
    Verifica e decodifica un token JWT
    
    Args:
        token: Token JWT da verificare
    
    Returns:
        dict: Payload del token se valido, None altrimenti
    """
    try:
        payload = jwt.decode(
            token, 
            JWT_SECRET_KEY, 
            algorithms=[JWT_ALGORITHM],
            audience='Superset',
            issuer='TALON'
        )
        return payload
    except jwt.ExpiredSignatureError:
        print("Token scaduto")
        return None
    except jwt.InvalidTokenError as e:
        print(f"Token non valido: {e}")
        return None

# Dizionario per mapping ruoli TALON → Superset
ROLE_MAPPING = {
    'ADMIN': 'Admin',
    'OPERATORE': 'Alpha',
    'VISUALIZZATORE': 'Gamma'
}

def get_superset_role(talon_role):
    """Mappa il ruolo TALON con quello di Superset"""
    return ROLE_MAPPING.get(talon_role.upper(), 'Gamma')