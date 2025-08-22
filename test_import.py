#!/usr/bin/env python
# Test import modulare

import sys
import traceback

def test_import(module_name):
    try:
        print(f"[TEST] Import {module_name}...", end=" ")
        __import__(module_name)
        print("OK")
        return True
    except Exception as e:
        print(f"ERRORE: {e}")
        return False

print("[TEST] Test import moduli TALON\n")

# Test moduli base
test_import("flask")
test_import("psycopg2")
test_import("auth")

print("\n[TEST] Test import routes:")
test_import("routes.main")
test_import("routes.enti_militari")
test_import("routes.enti_civili")
test_import("routes.operazioni")
test_import("routes.attivita")
test_import("routes.esercitazioni")
test_import("routes.drill_down_chart")
test_import("routes.geografia")

print("\n[TEST] Test import app principale:")
try:
    print("Import app.py...", end=" ")
    import app
    print("OK")
except Exception as e:
    print(f"ERRORE in app.py: {e}")
    traceback.print_exc()