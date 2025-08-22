# TALON Project Configuration

## Progetto TALON V1
- Sistema di gestione attività militari e civili
- Database PostgreSQL locale
- Framework Flask con autenticazione
- Interfaccia web responsive

## Istruzioni Specifiche
- Rispondi sempre in italiano
- L'applicazione TALON deve funzionare prioritariamente sempre offline
- Non usare mai icone oppure emoji se non espressamente richiesto
- Tutti i campi devono essere forzatamente scritti in MAIUSCOLO anche se in input si ha un testo in minuscolo

## Database
- Tipo: PostgreSQL
- Host: localhost:5432
- Database: talon
- User: talon
- Password: TalonDB!2025
- Comando: echo "QUERY_SQL" | "F:\PostgreSQL\bin\psql" "postgresql://talon:TalonDB%212025@localhost:5432/talon"

## Struttura Directory
- `/routes/`: Blueprint Flask per le rotte
- `/templates/`: Template Jinja2
- `/static/`: File statici (CSS, JS, immagini)
- `/utils/`: Utilità e helper functions

## Avvio Applicazione
- File principale: app.py
- URL: http://127.0.0.1:5000
- Credenziali admin: ambrogio.napolita@esercito.difesa.it / admin123