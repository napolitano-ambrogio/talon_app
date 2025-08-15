#!/usr/bin/env python
"""
Modulo per l'autenticazione automatica su Superset
Approccio alternativo che esegue login programmatico
"""

import requests
import logging
from flask import session
import re

logger = logging.getLogger(__name__)

SUPERSET_BASE_URL = "http://127.0.0.1:8088"

def perform_superset_login(username, password):
    """
    Esegue login programmatico su Superset e salva i cookie in sessione.
    
    Args:
        username (str): Username
        password (str): Password
        
    Returns:
        bool: True se login riuscito, False altrimenti
    """
    try:
        logger.info(f"Tentativo login programmatico su Superset per: {username}")
        
        # Crea sessione per mantenere i cookie
        superset_session = requests.Session()
        
        # 1. Prima richiesta per ottenere il form di login e il CSRF token
        login_page_response = superset_session.get(f"{SUPERSET_BASE_URL}/login/")
        
        if login_page_response.status_code != 200:
            logger.error(f"Impossibile accedere alla pagina di login: {login_page_response.status_code}")
            return False
            
        # 2. Estrai CSRF token dalla pagina HTML
        csrf_token = extract_csrf_token(login_page_response.text)
        if not csrf_token:
            logger.warning("CSRF token non trovato, procedo senza")
            csrf_token = ""
        
        # 3. Prepara dati per il login
        login_data = {
            'username': username,
            'password': password,
            'csrf_token': csrf_token
        }
        
        # 4. Esegue POST di login
        login_response = superset_session.post(
            f"{SUPERSET_BASE_URL}/login/",
            data=login_data,
            allow_redirects=True,
            headers={
                'Referer': f"{SUPERSET_BASE_URL}/login/",
                'Origin': SUPERSET_BASE_URL
            }
        )
        
        # 5. Verifica se login è riuscito
        if login_response.status_code == 200:
            # Se veniamo reindirizzati a /welcome o se non vediamo più il form di login
            if ('/welcome' in login_response.url or 
                '/superset/welcome' in login_response.url or
                'login' not in login_response.url.lower()):
                
                logger.info(f"Login Superset riuscito per: {username}")
                
                # Salva i cookie in sessione Flask
                save_superset_cookies_to_session(superset_session.cookies)
                
                return True
            else:
                logger.error(f"Login Superset fallito per: {username} - ancora sulla pagina di login")
                return False
        else:
            logger.error(f"Errore HTTP durante login Superset: {login_response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Errore di rete durante login Superset: {e}")
        return False
    except Exception as e:
        logger.error(f"Errore generico durante login Superset: {e}")
        return False

def extract_csrf_token(html_content):
    """
    Estrae il CSRF token dalla pagina HTML di login
    
    Args:
        html_content (str): Contenuto HTML della pagina
        
    Returns:
        str: CSRF token o None se non trovato
    """
    try:
        # Cerca pattern comuni per CSRF token
        patterns = [
            r'name="csrf_token"[^>]*value="([^"]+)"',
            r'<input[^>]*name="csrf_token"[^>]*value="([^"]+)"',
            r'"csrf_token":\s*"([^"]+)"',
            r'csrf_token=([a-zA-Z0-9\._-]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                token = match.group(1)
                logger.debug(f"CSRF token trovato: {token[:20]}...")
                return token
                
        logger.debug("CSRF token non trovato")
        return None
        
    except Exception as e:
        logger.error(f"Errore estrazione CSRF token: {e}")
        return None

def save_superset_cookies_to_session(cookies):
    """
    Salva i cookie di Superset nella sessione Flask per uso futuro
    
    Args:
        cookies: Cookie jar della sessione requests
    """
    try:
        superset_cookies = {}
        for cookie in cookies:
            superset_cookies[cookie.name] = cookie.value
            
        session['superset_cookies'] = superset_cookies
        logger.debug(f"Salvati {len(superset_cookies)} cookie di Superset in sessione")
        
    except Exception as e:
        logger.error(f"Errore salvataggio cookie Superset: {e}")

def get_superset_url_with_auth(dashboard_id=None):
    """
    Genera URL di Superset utilizzando i cookie salvati
    
    Args:
        dashboard_id (int, optional): ID della dashboard
        
    Returns:
        str: URL di Superset
    """
    try:
        base_url = SUPERSET_BASE_URL
        
        if dashboard_id:
            # URL per dashboard specifica
            url = f"{base_url}/superset/dashboard/{dashboard_id}/?standalone=1&show_filters=0"
        else:
            # URL homepage
            url = f"{base_url}/superset/welcome/"
            
        return url
        
    except Exception as e:
        logger.error(f"Errore generazione URL Superset: {e}")
        return f"{SUPERSET_BASE_URL}/superset/welcome/"

def is_superset_authenticated():
    """
    Verifica se abbiamo cookie di autenticazione per Superset
    
    Returns:
        bool: True se autenticati, False altrimenti
    """
    return 'superset_cookies' in session and session['superset_cookies']

def create_superset_session():
    """
    Crea una sessione requests con i cookie di Superset salvati
    
    Returns:
        requests.Session: Sessione configurata con i cookie
    """
    superset_session = requests.Session()
    
    if 'superset_cookies' in session:
        cookies = session['superset_cookies']
        for name, value in cookies.items():
            superset_session.cookies.set(name, value)
            
    return superset_session