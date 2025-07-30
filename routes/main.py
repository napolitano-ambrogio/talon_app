from flask import Blueprint, render_template

# Definiamo un "Blueprint", un modulo per le nostre rotte
main_bp = Blueprint(
    'main', 
    __name__,
    template_folder='../templates', # Specifica dove trovare i template
    static_folder='../static'      # Specifica dove trovare i file statici
)

@main_bp.route('/')
def dashboard():
    """Mostra la dashboard principale."""
    return render_template('dashboard.html')
