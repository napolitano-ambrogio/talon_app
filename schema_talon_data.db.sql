BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS attivita (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ente_svolgimento_id INTEGER NOT NULL,
                tipologia_id INTEGER NOT NULL,
                data_inizio DATE NOT NULL,
                data_fine DATE,
                descrizione TEXT,
                partenza_militare_id INTEGER,
                partenza_civile_id INTEGER,
                destinazione_militare_id INTEGER,
                destinazione_civile_id INTEGER,
                personale_ufficiali INTEGER DEFAULT 0,
                personale_sottufficiali INTEGER DEFAULT 0,
                personale_graduati INTEGER DEFAULT 0,
                personale_civili INTEGER DEFAULT 0,
                note TEXT, operazione_id INTEGER REFERENCES operazioni(id),
                FOREIGN KEY (ente_svolgimento_id) REFERENCES enti_militari (id),
                FOREIGN KEY (tipologia_id) REFERENCES tipologie_attivita (id),
                FOREIGN KEY (partenza_militare_id) REFERENCES enti_militari (id),
                FOREIGN KEY (partenza_civile_id) REFERENCES enti_civili (id),
                FOREIGN KEY (destinazione_militare_id) REFERENCES enti_militari (id),
                FOREIGN KEY (destinazione_civile_id) REFERENCES enti_civili (id)
            );
CREATE TABLE IF NOT EXISTS dettagli_getra (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    attivita_id      INTEGER NOT NULL,
    tipo_vettore     TEXT,
    seriale_vettore  TEXT,
    numero_personale INTEGER,
    numero_mezzi     INTEGER,
    volume           INTEGER, unita_di_misura TEXT,
    FOREIGN KEY (attivita_id) REFERENCES attivita(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS dettagli_mantenimento (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attivita_id INTEGER NOT NULL UNIQUE,
                tipo_intervento TEXT,
                attivita_svolta TEXT,
                piattaforma_materiale TEXT,
                FOREIGN KEY (attivita_id) REFERENCES attivita (id) ON DELETE CASCADE
            );
CREATE TABLE IF NOT EXISTS dettagli_rifornimenti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attivita_id INTEGER NOT NULL UNIQUE,
                tipologia_rifornimento TEXT,
                dettaglio_materiale TEXT,
                quantita REAL,
                unita_di_misura TEXT,
                FOREIGN KEY (attivita_id) REFERENCES attivita (id) ON DELETE CASCADE
            );
CREATE TABLE IF NOT EXISTS dettagli_trasporti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attivita_id INTEGER NOT NULL UNIQUE,
                tipologia_carico TEXT,
                quantita REAL,
                unita_di_misura TEXT,
                mezzo_impiegato TEXT,
                FOREIGN KEY (attivita_id) REFERENCES attivita (id) ON DELETE CASCADE
            );
CREATE TABLE IF NOT EXISTS "enti_civili" (
	"id"	INTEGER,
	"nome"	TEXT NOT NULL,
	"indirizzo"	TEXT,
	"civico"	TEXT,
	"cap"	TEXT,
	"telefono"	TEXT,
	"email"	TEXT,
	"citta"	TEXT,
	"provincia"	TEXT,
	"nazione"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "enti_militari" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    codice TEXT,
    parent_id INTEGER,
    indirizzo TEXT,
    civico TEXT,
    cap TEXT,
    telefono TEXT,
    email TEXT, citta TEXT, provincia TEXT,
    FOREIGN KEY (parent_id) REFERENCES "enti_militari" (id)
);
CREATE TABLE IF NOT EXISTS operazioni (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_missione TEXT NOT NULL UNIQUE,
                teatro_operativo TEXT,
                nazione TEXT,
                data_inizio DATE,
                data_fine DATE,
                descrizione TEXT
            , nome_breve TEXT);
CREATE TABLE IF NOT EXISTS tipologie_attivita (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE,
                parent_id INTEGER,
                FOREIGN KEY (parent_id) REFERENCES tipologie_attivita (id)
            );
CREATE VIEW v_attivita_completa AS
SELECT
    /* chiave */
    a.id                                    AS attivita_id,

    /* tipologia e missione */
    ta.nome                                 AS tipologia,
    op.nome_missione                        AS missione,

    /* date e descrizione */
    a.data_inizio,
    a.data_fine,
    a.descrizione                           AS descr_attivita,
    a.note,

    /* ente che svolge l’attività */
    ems.nome                                AS ente_svolgimento,

    /* partenza e destinazione (militare / civile) */
    emp.nome                                AS partenza_militare,
    ecp.nome                                AS partenza_civile,
    emd.nome                                AS destinazione_militare,
    ecd.nome                                AS destinazione_civile,

    /* personale impiegato */
    a.personale_ufficiali,
    a.personale_sottufficiali,
    a.personale_graduati,
    a.personale_civili,

    /* ---- DETTAGLI TRASPORTI ---------------------------------- */
    dt.tipologia_carico                     AS trasporto_tipologia_carico,
    dt.quantita                             AS trasporto_quantita,
    dt.unita_di_misura                      AS trasporto_um,
    dt.mezzo_impiegato                      AS trasporto_mezzo,

    /* ---- DETTAGLI RIFORNIMENTI ------------------------------- */
    dr.tipologia_rifornimento               AS rifornimento_tipologia,
    dr.dettaglio_materiale                  AS rifornimento_materiale,
    dr.quantita                             AS rifornimento_quantita,
    dr.unita_di_misura                      AS rifornimento_um,

    /* ---- DETTAGLI MANTENIMENTO ------------------------------- */
    dm.tipo_intervento                      AS mant_tipo_intervento,
    dm.attivita_svolta                      AS mant_attivita_svolta,
    dm.piattaforma_materiale                AS mant_piattaforma_materiale,

    /* ---- DETTAGLI GETRA -------------------------------------- */
    dg.tipo_vettore                         AS getra_tipo_vettore,
    dg.seriale_vettore                      AS getra_seriale_vettore,
    dg.numero_mezzi                         AS getra_numero_mezzi,
    dg.numero_personale                     AS getra_numero_personale,
    dg.volume                               AS getra_volume,
    dg.unita_di_misura                      AS getra_um

FROM attivita AS a
/* lookup principali */
LEFT JOIN tipologie_attivita  ta ON ta.id = a.tipologia_id
LEFT JOIN operazioni          op ON op.id = a.operazione_id
/* enti */
LEFT JOIN enti_militari       ems ON ems.id = a.ente_svolgimento_id
LEFT JOIN enti_militari       emp ON emp.id = a.partenza_militare_id
LEFT JOIN enti_civili         ecp ON ecp.id = a.partenza_civile_id
LEFT JOIN enti_militari       emd ON emd.id = a.destinazione_militare_id
LEFT JOIN enti_civili         ecd ON ecd.id = a.destinazione_civile_id
/* tabelle di dettaglio */
LEFT JOIN dettagli_trasporti      dt ON dt.attivita_id = a.id
LEFT JOIN dettagli_rifornimenti   dr ON dr.attivita_id = a.id
LEFT JOIN dettagli_mantenimento   dm ON dm.attivita_id = a.id
LEFT JOIN dettagli_getra          dg ON dg.attivita_id = a.id;
CREATE UNIQUE INDEX uq_dettagli_getra_attivita
    ON dettagli_getra(attivita_id);
COMMIT;
