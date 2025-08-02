# app.py - Il punto di ingresso principale dell'applicazione TALON

# --- CORREZIONE DEFINITIVA PER GLI IMPORT ---
import sys
import os
# Aggiunge la directory del file corrente (talon_app) al percorso di ricerca di Python
# Questo risolve il ModuleNotFoundError per 'routes' e 'services'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# ---------------------------------------------

from flask import Flask
from waitress import serve

# Importa i moduli (Blueprints) che definiscono le rotte
from routes.main import main_bp
from routes.enti_militari import enti_militari_bp
from routes.enti_civili import enti_civili_bp
from routes.operazioni import operazioni_bp
from routes.attivita import attivita_bp

# Funzione per creare l'applicazione Flask
def create_app():
    """Crea e configura un'istanza dell'applicazione Flask."""
    
    app = Flask(
        __name__,
        # I percorsi sono relativi alla cartella 'talon_app'
        template_folder='templates',
        static_folder='static'
    )

    # Registra tutti i blueprint (i nostri moduli di rotte)
    app.register_blueprint(main_bp)
    app.register_blueprint(enti_militari_bp)
    app.register_blueprint(enti_civili_bp)
    app.register_blueprint(operazioni_bp)
    app.register_blueprint(attivita_bp)

    return app

# Esecuzione dell'applicazione
if __name__ == '__main__':
    app = create_app()
    # Usa Waitress come server di produzione
    serve(app, host='0.0.0.0', port=5000, threads=16)
