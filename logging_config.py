# logging_config.py
import logging
import sys

def setup_clean_logging(app):
    """Configura il logging per evitare caratteri problematici"""
    
    # Formattatore personalizzato che pulisce i messaggi
    class CleanFormatter(logging.Formatter):
        def format(self, record):
            # Pulisci il messaggio da caratteri non-ASCII
            if hasattr(record, 'msg'):
                record.msg = ''.join(char if ord(char) < 128 else '?' for char in str(record.msg))
            return super().format(record)
    
    # Configura il formatter
    formatter = CleanFormatter(
        '[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Configura gli handler
    for handler in app.logger.handlers:
        handler.setFormatter(formatter)
    
    # Aggiungi anche un handler per stdout
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    app.logger.addHandler(stdout_handler)
    
    return app
