"""
Script di test per verificare la connessione a Superset
Esegui questo script SEPARATAMENTE per testare la connessione
"""

import requests
import re
import json

SUPERSET_BASE_URL = "http://127.0.0.1:8088"

def test_superset_connection():
    """Test 1: Verifica che Superset sia raggiungibile"""
    print("=" * 50)
    print("TEST 1: Connessione a Superset")
    print("=" * 50)
    
    try:
        response = requests.get(f"{SUPERSET_BASE_URL}/login/", timeout=5)
        if response.status_code == 200:
            print("✅ Superset è raggiungibile")
            print(f"   URL: {SUPERSET_BASE_URL}")
            return True
        else:
            print(f"❌ Superset risponde con status: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Impossibile connettersi a Superset")
        print(f"   Assicurati che Superset sia in esecuzione su {SUPERSET_BASE_URL}")
        return False
    except Exception as e:
        print(f"❌ Errore: {e}")
        return False

def test_superset_login(username, password):
    """Test 2: Prova il login in Superset"""
    print("\n" + "=" * 50)
    print("TEST 2: Login in Superset")
    print("=" * 50)
    
    session = requests.Session()
    
    try:
        # Step 1: Ottieni la pagina di login
        print("📍 Recupero pagina di login...")
        login_page = session.get(f"{SUPERSET_BASE_URL}/login/")
        
        # Step 2: Cerca il CSRF token
        csrf_token = None
        if 'csrf_token' in login_page.text:
            match = re.search(r'name="csrf_token".*?value="([^"]+)"', login_page.text)
            if match:
                csrf_token = match.group(1)
                print("✅ CSRF token trovato")
            else:
                print("⚠️  CSRF token non trovato nel formato atteso")
        
        # Step 3: Prepara i dati di login
        login_data = {
            'username': username,
            'password': password,
        }
        
        if csrf_token:
            login_data['csrf_token'] = csrf_token
        
        # Step 4: Effettua il login
        print(f"📍 Tentativo login con username: {username}")
        response = session.post(
            f"{SUPERSET_BASE_URL}/login/",
            data=login_data,
            allow_redirects=True
        )
        
        # Step 5: Verifica il risultato
        if response.status_code == 200:
            if '/superset/welcome' in response.url or '/dashboard/list' in response.url:
                print("✅ Login effettuato con successo!")
                print(f"   Reindirizzato a: {response.url}")
                return True, session
            elif 'Invalid login' in response.text or 'Wrong username' in response.text:
                print("❌ Credenziali non valide")
                return False, None
            else:
                print("⚠️  Login status incerto")
                print(f"   URL finale: {response.url}")
                return False, None
        else:
            print(f"❌ Errore HTTP: {response.status_code}")
            return False, None
            
    except Exception as e:
        print(f"❌ Errore durante il login: {e}")
        return False, None

def test_get_content(session):
    """Test 3: Prova a recuperare contenuti"""
    print("\n" + "=" * 50)
    print("TEST 3: Recupero contenuti da Superset")
    print("=" * 50)
    
    if not session:
        print("❌ Sessione non valida")
        return
    
    try:
        # Prova a recuperare la lista dashboard
        print("📍 Recupero lista dashboard...")
        response = session.get(f"{SUPERSET_BASE_URL}/dashboard/list/")
        
        if response.status_code == 200:
            print("✅ Accesso alla lista dashboard riuscito")
            
            # Cerca di estrarre qualche dashboard
            matches = re.findall(r'/superset/dashboard/(\d+)', response.text)
            if matches:
                print(f"   Trovate {len(set(matches))} dashboard")
                for dash_id in set(matches)[:5]:  # Mostra max 5
                    print(f"   - Dashboard ID: {dash_id}")
            else:
                print("   Nessuna dashboard trovata nel HTML")
        else:
            print(f"❌ Errore accesso dashboard: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Errore: {e}")

def main():
    """Esegui tutti i test"""
    print("\n" + "🚀 INIZIO TEST CONNESSIONE SUPERSET" + "\n")
    
    # Test 1: Connessione
    if not test_superset_connection():
        print("\n⛔ Test interrotto: Superset non raggiungibile")
        return
    
    # Chiedi credenziali
    print("\n" + "=" * 50)
    print("Inserisci le credenziali per Superset")
    print("(le stesse che usi per TALON)")
    print("=" * 50)
    
    username = input("Username: ").strip()
    password = input("Password: ").strip()
    
    if not username or not password:
        print("⛔ Credenziali non valide")
        return
    
    # Test 2: Login
    success, session = test_superset_login(username, password)
    
    if success:
        # Test 3: Recupero contenuti
        test_get_content(session)
    
    print("\n" + "🏁 TEST COMPLETATO" + "\n")

if __name__ == "__main__":
    main()