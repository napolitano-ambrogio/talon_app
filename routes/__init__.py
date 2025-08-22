# routes/__init__.py

# Importa tutti i blueprint per facilitare gli import  
from .main import main_bp
from .enti_militari import enti_militari_bp  
from .enti_civili import enti_civili_bp
from .operazioni import operazioni_bp
from .attivita import attivita_bp
from .esercitazioni import esercitazioni_bp
from .drill_down_chart import drill_down_bp
from .geografia import geografia_bp