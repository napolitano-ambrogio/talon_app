#!/usr/bin/env python3
# debug_attivita.py - Script per testare la route attività

import os
import sqlite3
import sys

# Aggiungi la directory del progetto al path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_database_connection():
    """Testa la connessione al database"""
    print("=== TEST CONNESSIONE DATABASE ===")
    
    # Prova diversi percorsi
    test_paths = [
        'talon_data.db',
        './talon_data.db',
        os.path.join(os.path.dirname(__file__), 'talon_data.db')
    ]
    
    for path in test_paths:
        if os.path.exists(path):
            print(f"✓ Database trovato: {path}")
            abs_path = os.path.abspath(path)
            print(f"  Percorso assoluto: {abs_path}")
            
            try:
                conn = sqlite3.connect(path)
                conn.row_factory = sqlite3.Row
                
                # Verifica tabelle essenziali
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [row[0] for row in cursor.fetchall()]
                
                required_tables = ['utenti', 'enti_militari', 'attivita', 'tipologie_attivita']
                missing_tables = [t for t in required_tables if t not in tables]
                
                if missing_tables:
                    print(f"  ✗ Tabelle mancanti: {missing_tables}")
                else:
                    print(f"  ✓ Tutte le tabelle essenziali presenti")
                
                # Conta record nelle tabelle principali
                for table in ['utenti', 'enti_militari', 'attivita']:
                    if table in tables:
                        cursor.execute(f"SELECT COUNT(*) FROM {table}")
                        count = cursor.fetchone()[0]
                        print(f"  {table}: {count} record")
                
                conn.close()
                return path
                
            except Exception as e:
                print(f"  ✗ Errore connessione: {e}")
        else:
            print(f"✗ Database non trovato: {path}")
    
    return None

def test_auth_import():
    """Testa l'import del modulo auth"""
    print("\n=== TEST IMPORT AUTH ===")
    
    try:
        from auth import get_user_by_username, get_user_permissions, get_user_accessible_entities
        print("✓ Import auth.py riuscito")
        
        # Testa utente admin
        admin_user = get_user_by_username('admin')
        if admin_user:
            print(f"✓ Utente admin trovato: ID {admin_user['id']}")
            print(f"  Username: {admin_user['username']}")
            print(f"  Ruolo: {admin_user.get('ruolo_nome', 'N/A')}")
            
            # Testa permessi
            permissions = get_user_permissions(admin_user['id'])
            print(f"  Permessi: {len(permissions)} totali")
            attivita_perms = [p for p in permissions if 'ATTIVITA' in p]
            print(f"  Permessi attività: {attivita_perms}")
            
            # Testa enti accessibili
            accessible_entities = get_user_accessible_entities(admin_user['id'])
            print(f"  Enti accessibili: {len(accessible_entities)} enti")
            if len(accessible_entities) > 0:
                print(f"  Primi 5 enti: {accessible_entities[:5]}")
            
            return admin_user
        else:
            print("✗ Utente admin non trovato")
            return None
            
    except Exception as e:
        print(f"✗ Errore import auth: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_attivita_query(user_id, accessible_entities, db_path):
    """Testa la query delle attività"""
    print("\n=== TEST QUERY ATTIVITA ===")
    
    if not accessible_entities:
        print("✗ Nessun ente accessibile - la query non restituirà risultati")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        
        # Replica la query di lista_attivita()
        placeholders = ','.join(['?' for _ in accessible_entities])
        query = f"""
            SELECT
                a.id,
                a.data_inizio,
                a.descrizione,
                em.nome AS ente_nome,
                ta.nome AS tipologia_nome,
                o.nome_missione AS operazione_nome
            FROM attivita a
            JOIN enti_militari em ON a.ente_svolgimento_id = em.id
            JOIN tipologie_attivita ta ON a.tipologia_id = ta.id
            LEFT JOIN operazioni o ON a.operazione_id = o.id
            WHERE a.ente_svolgimento_id IN ({placeholders})
            ORDER BY a.data_inizio DESC
        """
        
        print(f"Query: {query}")
        print(f"Parametri: {accessible_entities}")
        
        result = conn.execute(query, accessible_entities).fetchall()
        print(f"✓ Query eseguita con successo")
        print(f"✓ Risultati trovati: {len(result)}")
        
        if len(result) > 0:
            print("Prime 3 attività:")
            for i, row in enumerate(result[:3]):
                print(f"  {i+1}. ID {row['id']}: {row['descrizione'][:50]}...")
        
        conn.close()
        
    except Exception as e:
        print(f"✗ Errore query attività: {e}")
        import traceback
        traceback.print_exc()

def test_flask_route():
    """Testa se la route è registrata correttamente"""
    print("\n=== TEST FLASK ROUTE ===")
    
    try:
        from app import create_app
        app = create_app()
        
        with app.app_context():
            # Verifica le route registrate
            routes = []
            for rule in app.url_map.iter_rules():
                if 'attivita' in rule.rule:
                    routes.append(f"{rule.rule} -> {rule.endpoint}")
            
            if routes:
                print("✓ Route attività trovate:")
                for route in routes:
                    print(f"  {route}")
            else:
                print("✗ Nessuna route attività trovata")
                
                # Verifica blueprint registrati
                print("Blueprint registrati:")
                for name, bp in app.blueprints.items():
                    print(f"  {name}: {bp}")
                    
    except Exception as e:
        print(f"✗ Errore test Flask route: {e}")
        import traceback
        traceback.print_exc()

def main():
    print("DIAGNOSI PROBLEMI PAGINA ATTIVITÀ")
    print("=" * 50)
    
    # Test 1: Database
    db_path = test_database_connection()
    if not db_path:
        print("\n❌ PROBLEMA: Database non trovato o non accessibile")
        return
    
    # Test 2: Autenticazione
    admin_user = test_auth_import()
    if not admin_user:
        print("\n❌ PROBLEMA: Autenticazione non funziona")
        return
    
    # Test 3: Permessi e query
    try:
        from auth import get_user_accessible_entities
        accessible_entities = get_user_accessible_entities(admin_user['id'])
        test_attivita_query(admin_user['id'], accessible_entities, db_path)
    except Exception as e:
        print(f"\n❌ PROBLEMA nel test query: {e}")
    
    # Test 4: Route Flask
    test_flask_route()
    
    print("\n" + "=" * 50)
    print("DIAGNOSI COMPLETATA")
    print("Controlla i risultati sopra per identificare il problema")

if __name__ == '__main__':
    main()