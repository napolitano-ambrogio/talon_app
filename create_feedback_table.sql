-- Creazione tabella feedback per sistema TALON
-- Esegui questo script su PostgreSQL per creare la tabella

CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('bug', 'feature', 'improvement', 'general')),
    titolo VARCHAR(255),
    messaggio TEXT NOT NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'in_lavorazione', 'risolto', 'chiuso', 'rifiutato')),
    priorita VARCHAR(10) DEFAULT 'media' CHECK (priorita IN ('bassa', 'media', 'alta', 'critica')),
    categoria VARCHAR(100),
    risposta_admin TEXT,
    risposta_da INTEGER REFERENCES utenti(id),
    risposta_timestamp TIMESTAMP WITH TIME ZONE,
    data_creazione TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_modifica TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    pagina_origine VARCHAR(255),
    metadata JSONB,
    allegati TEXT[], -- Array di percorsi file allegati
    tag TEXT[], -- Array di tag per categorizzazione
    voto_utilita INTEGER CHECK (voto_utilita >= 1 AND voto_utilita <= 5),
    numero_voti INTEGER DEFAULT 0,
    creato_da INTEGER NOT NULL REFERENCES utenti(id),
    modificato_da INTEGER REFERENCES utenti(id)
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_feedback_utente_id ON feedback(utente_id);
CREATE INDEX IF NOT EXISTS idx_feedback_stato ON feedback(stato);
CREATE INDEX IF NOT EXISTS idx_feedback_tipo ON feedback(tipo);
CREATE INDEX IF NOT EXISTS idx_feedback_priorita ON feedback(priorita);
CREATE INDEX IF NOT EXISTS idx_feedback_data_creazione ON feedback(data_creazione);
CREATE INDEX IF NOT EXISTS idx_feedback_categoria ON feedback(categoria);

-- Trigger per aggiornare automaticamente data_modifica
CREATE OR REPLACE FUNCTION update_feedback_modified_time()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_modifica = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_feedback_modified_time
    BEFORE UPDATE ON feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_feedback_modified_time();

-- Commenti sulle colonne
COMMENT ON TABLE feedback IS 'Tabella per gestire i feedback degli utenti del sistema TALON';
COMMENT ON COLUMN feedback.tipo IS 'Tipo di feedback: bug, feature, improvement, general';
COMMENT ON COLUMN feedback.stato IS 'Stato del feedback: aperto, in_lavorazione, risolto, chiuso, rifiutato';
COMMENT ON COLUMN feedback.priorita IS 'Priorità del feedback: bassa, media, alta, critica';
COMMENT ON COLUMN feedback.categoria IS 'Categoria libera per classificazione (es: UI, Performance, Sicurezza)';
COMMENT ON COLUMN feedback.risposta_admin IS 'Risposta dell\' amministratore al feedback';
COMMENT ON COLUMN feedback.risposta_da IS 'ID dell\' utente che ha risposto';
COMMENT ON COLUMN feedback.metadata IS 'Metadati aggiuntivi in formato JSON';
COMMENT ON COLUMN feedback.allegati IS 'Array di percorsi a file allegati';
COMMENT ON COLUMN feedback.tag IS 'Tag per categorizzazione e ricerca';
COMMENT ON COLUMN feedback.voto_utilita IS 'Voto utilità del feedback (1-5)';
COMMENT ON COLUMN feedback.pagina_origine IS 'Pagina da cui è stato inviato il feedback';

-- Dati di esempio per test (opzionale)
-- INSERT INTO feedback (utente_id, tipo, titolo, messaggio, creato_da, categoria, ip_address) 
-- VALUES (1, 'bug', 'Errore nel login', 'Il sistema non mi fa accedere con le credenziali corrette', 1, 'Autenticazione', '127.0.0.1');