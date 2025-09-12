-- ==============================================
-- Migrazione Database: Aggiunta colonna sac_pianificata
-- Data: 2025-09-10
-- Descrizione: Aggiunge il campo boolean sac_pianificata alla tabella attivita
--              per gestire la pianificazione delle Squadre a Contatto (SAC)
-- ==============================================

-- Passo 1: Aggiunge la colonna sac_pianificata
-- DEFAULT TRUE significa che di default le attività SAC sono pianificate
ALTER TABLE attivita 
ADD COLUMN IF NOT EXISTS sac_pianificata BOOLEAN DEFAULT TRUE;

-- Passo 2: Imposta valori corretti per i record esistenti

-- Per attività ordinarie, sac_pianificata non è applicabile (NULL)
UPDATE attivita 
SET sac_pianificata = NULL 
WHERE modalita_effettuazione = 'ordinaria';

-- Per squadre a contatto esistenti, imposta TRUE (pianificata) se ancora NULL
-- Questo gestisce sia record nuovi che eventuali record già esistenti
UPDATE attivita 
SET sac_pianificata = TRUE 
WHERE modalita_effettuazione IN ('squadra_contatto_nazionale', 'squadra_contatto_teatro')
  AND sac_pianificata IS NULL;

-- Passo 3: Aggiunge commento alla colonna per documentazione
COMMENT ON COLUMN attivita.sac_pianificata IS 
    'Indica se una Squadra a Contatto è pianificata (TRUE) o non pianificata (FALSE). NULL per attività ordinarie.';

-- ==============================================
-- Note per il rollback (se necessario):
-- ALTER TABLE attivita DROP COLUMN IF EXISTS sac_pianificata;
-- ==============================================