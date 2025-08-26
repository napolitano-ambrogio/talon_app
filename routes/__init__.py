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

# Blueprint per test
from flask import Blueprint, render_template

test_bp = Blueprint('test', __name__, url_prefix='/test')

@test_bp.route('/dashboard')
def dashboard_test():
    """Pagina di test per verificare template e stili"""
    return render_template('dashboard_test.html')

@test_bp.route('/dashboard-fixed')
def dashboard_fixed():
    """Dashboard con layout corretto per Chart.js"""
    return render_template('dashboard_fixed.html')