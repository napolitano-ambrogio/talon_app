#!/usr/bin/env python
# Test script per debug avvio TALON

import sys
import traceback

print("[TEST] Inizio test avvio TALON...")

try:
    print("[TEST] Import app...")
    from app import create_app
    
    print("[TEST] Creazione app Flask...")
    app = create_app()
    
    print("[TEST] App creata con successo!")
    print(f"[TEST] Debug mode: {app.debug}")
    print(f"[TEST] Blueprint registrati: {list(app.blueprints.keys())}")
    
    print("[TEST] Avvio server Flask...")
    app.run(host='0.0.0.0', port=5000, debug=False)
    
except Exception as e:
    print(f"[ERRORE] Errore durante l'avvio: {e}")
    traceback.print_exc()
    sys.exit(1)