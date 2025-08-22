#!/usr/bin/env python3
"""
Avvia TALON su porta 5001
"""
from app import create_app

if __name__ == '__main__':
    print("=" * 60)
    print("AVVIO TALON COMPLETO SU PORTA 5001")
    print("URL: http://localhost:5001")
    print("=" * 60)
    app = create_app()
    app.run(host='0.0.0.0', port=5001, debug=True)