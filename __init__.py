from flask import Flask

def create_app():
    """
    Application Factory: crea e configura l'istanza dell'applicazione Flask.
    """
    app = Flask(
        __name__,
        # I percorsi sono relativi a questa cartella 'talon_app'
        template_folder='templates',
        static_folder='static'
    )

    # Con i blueprint, è importante registrare le rotte
    with app.app_context():
        from .routes import enti_militari, enti_civili, operazioni, attivita, main
        
        app.register_blueprint(main.main_bp)
        app.register_blueprint(enti_militari.enti_militari_bp)
        app.register_blueprint(enti_civili.enti_civili_bp)
        app.register_blueprint(operazioni.operazioni_bp)
        app.register_blueprint(attivita.attivita_bp)

    return app
