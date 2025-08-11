#!/usr/bin/env python3
"""
SQLite -> PostgreSQL migration script for TALON

What it does
------------
- Reads schema (tables only) from SQLite (ignores views, triggers)
- Recreates tables in PostgreSQL with compatible data types
- Copies all data in batches
- Adds PRIMARY KEYs and UNIQUE constraints
- Cleans orphan rows before adding FKs
- Adds FOREIGN KEYs NOT VALID, then validates them later (deferred validation)
- Optionally, sets identity sequences to MAX(id)

What it does NOT do
-------------------
- Does not create views or triggers (you'll recreate them directly in Postgres)
- Does not copy CHECK constraints that are SQLite-specific
- Does not create non-unique secondary indexes (you can add later if needed)

Usage
-----
1) pip install psycopg2-binary
2) Adjust CONFIG if needed
3) python migrate_sqlite_to_postgres.py
"""

import os
import sqlite3
import sys
from typing import Dict, List, Tuple

try:
    import psycopg2
    import psycopg2.extras
except Exception:
    print("ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
    raise

# ================== CONFIG ==================

SQLITE_PATH = r"F:\talon_app\talon_data.db"   # Path to your SQLite DB on the USB key
PG_CONN = {
    "host": "127.0.0.1",
    "port": 5432,
    "dbname": "talon",
    "user": "talon",
    "password": "TalonDB!2025",
}

BATCH_SIZE = 5000
DROP_AND_RECREATE = True    # CAUTION
SET_SEQUENCES = True        # Align identity sequences to MAX(id)

# ================== TYPE MAPPING ==================

def map_sqlite_type_to_pg(stype: str) -> str:
    if not stype:
        return "TEXT"
    t = stype.upper().strip()
    if "INT" in t:
        return "INTEGER"
    if any(x in t for x in ["CHAR", "CLOB", "TEXT"]):
        return "TEXT"
    if "BLOB" in t:
        return "BYTEA"
    if any(x in t for x in ["REAL", "FLOA", "DOUB"]):
        return "DOUBLE PRECISION"
    if any(x in t for x in ["DEC", "NUMERIC"]):
        return t.replace("NUMERIC", "DECIMAL")
    if "BOOLEAN" in t:
        return "BOOLEAN"
    if "DATE" in t and "TIME" in t:
        return "TIMESTAMP"
    if t == "DATETIME":
        return "TIMESTAMP"
    if "DATE" in t:
        return "DATE"
    if "TIME" in t:
        return "TIME"
    return "TEXT"

# ================== HELPERS ==================

def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'

def get_pg_boolean_columns(pg_conn, table_name: str) -> set:
    with pg_conn.cursor() as c:
        c.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = %s
              AND data_type = 'boolean'
        """, (table_name,))
        return {r[0] for r in c.fetchall()}

def fetch_sqlite_tables(conn: sqlite3.Connection) -> List[Tuple[str, str]]:
    cur = conn.execute("""
        SELECT name, sql
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name;
    """)
    return cur.fetchall()

def fetch_table_info(conn: sqlite3.Connection, table: str):
    return conn.execute(f"PRAGMA table_info({table})").fetchall()

def fetch_index_info(conn: sqlite3.Connection, table: str):
    uniques = []
    idxlist = conn.execute(f"PRAGMA index_list({table})").fetchall()
    for idx in idxlist:
        idx_name = idx[1]
        is_unique = bool(idx[2])
        if is_unique:
            cols = conn.execute(f"PRAGMA index_info({idx_name})").fetchall()
            colnames = [c[2] for c in cols]  # (seqno, cid, name)
            uniques.append((idx_name, colnames))
    return uniques

def fetch_foreign_keys(conn: sqlite3.Connection, table: str):
    rows = conn.execute(f"PRAGMA foreign_key_list({table})").fetchall()
    fks = []
    for r in rows:
        fks.append({
            "id": r[0],
            "seq": r[1],
            "ref_table": r[2],
            "from_col": r[3],
            "to_col": r[4],
            "on_update": r[5],
            "on_delete": r[6],
            "match": r[7] if len(r) > 7 else None,
        })
    fks_by_id: Dict[int, Dict] = {}
    for fk in fks:
        fid = fk["id"]
        if fid not in fks_by_id:
            fks_by_id[fid] = {
                "ref_table": fk["ref_table"],
                "pairs": [],
                "on_update": fk["on_update"],
                "on_delete": fk["on_delete"],
                "match": fk["match"],
            }
        fks_by_id[fid]["pairs"].append((fk["from_col"], fk["to_col"]))
    return list(fks_by_id.values())

def normalize_default(pg_type: str, dflt_value: str) -> str:
    if dflt_value is None:
        return None
    val = str(dflt_value).strip()
    while val.startswith("(") and val.endswith(")"):
        val = val[1:-1].strip()

    if pg_type.upper() == "BOOLEAN":
        v = val.strip("'").strip('"').lower()
        if v in ("0", "false", "f"):
            return "FALSE"
        if v in ("1", "true", "t"):
            return "TRUE"
        return f"{val}::boolean"

    up = val.upper().replace(" ", "")
    if pg_type.upper() in ("TIMESTAMP", "DATE", "TIME"):
        if "DATETIME('NOW')" in up or "DATE('NOW')" in up or "TIME('NOW')" in up:
            if pg_type.upper() == "TIMESTAMP":
                return "CURRENT_TIMESTAMP"
            if pg_type.upper() == "DATE":
                return "CURRENT_DATE"
            if pg_type.upper() == "TIME":
                return "CURRENT_TIME"

    if val.replace(".", "", 1).lstrip("+-").isdigit():
        return val
    if (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"')):
        return val
    return None

def build_create_table_sql(table: str, cols, uniques, pk_cols) -> str:
    col_defs = []
    single_int_pk = (len(pk_cols) == 1)
    pk_colname = pk_cols[0] if single_int_pk else None

    for c in cols:
        cid, name, ctype, notnull, dflt_value, pk = c
        pg_type = map_sqlite_type_to_pg(ctype)
        line = f'{qident(name)} {pg_type}'

        # Single integer PK: make it identity + PRIMARY KEY
        if single_int_pk and name == pk_colname and pg_type.upper() in ("INTEGER", "BIGINT"):
            line = f'{qident(name)} {pg_type} GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY'

        if notnull:
            line += " NOT NULL"

        if dflt_value is not None:
            norm = normalize_default(pg_type, dflt_value)
            if norm is not None:
                line += f" DEFAULT {norm}"

        col_defs.append(line)

    constraints = []
    # Composite PK or non-integer PKs: add table-level PRIMARY KEY
    if pk_cols:
        if not (single_int_pk and map_sqlite_type_to_pg(next(c[2] for c in cols if c[1] == pk_colname)).upper() in ("INTEGER", "BIGINT")):
            constraints.append("PRIMARY KEY (" + ", ".join(qident(c) for c in pk_cols) + ")")

    for _, ucols in uniques:
        constraints.append("UNIQUE (" + ", ".join(qident(c) for c in ucols) + ")")

    all_defs = col_defs + constraints
    sql = f"CREATE TABLE IF NOT EXISTS {qident(table)} (\n  " + ",\n  ".join(all_defs) + "\n);"
    return sql

def to_bool_or_none(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if s in ('1', 't', 'true', 'y', 'yes'):
        return True
    if s in ('0', 'f', 'false', 'n', 'no'):
        return False
    try:
        return bool(int(s))
    except:
        return None

def copy_table_data(sqlite_conn, pg_conn, table, col_meta):
    scol_names = [c[1] for c in col_meta]
    col_list_sql = ", ".join(['"{}"'.format(n) for n in scol_names])
    insert_sql = f'INSERT INTO "{table}" ({col_list_sql}) VALUES %s'

    bool_cols = get_pg_boolean_columns(pg_conn, table)

    scur = sqlite_conn.cursor()
    scur.execute(f'SELECT {col_list_sql} FROM "{table}"')
    rows = scur.fetchmany(BATCH_SIZE)

    total = 0
    with pg_conn.cursor() as pcur:
        while rows:
            batch = []
            for r in rows:
                r_list = list(r)
                for i, colname in enumerate(scol_names):
                    if colname in bool_cols and r_list[i] is not None:
                        r_list[i] = to_bool_or_none(r_list[i])
                batch.append(tuple(r_list))
            if batch:
                psycopg2.extras.execute_values(pcur, insert_sql, batch, page_size=BATCH_SIZE)
                total += len(batch)
            rows = scur.fetchmany(BATCH_SIZE)

    pg_conn.commit()
    return total

# ---------- FK Utilities: uniqueness check, orphan cleaning, add/validate ----------

def parent_has_unique_on_columns(pg_conn, ref_table: str, to_cols: List[str]) -> bool:
    """Return True if parent has a PK/UNIQUE covering exactly to_cols (order-insensitive)."""
    with pg_conn.cursor() as cur:
        cur.execute("""
            SELECT conkey, contype
            FROM pg_constraint
            WHERE conrelid = %s::regclass
              AND contype IN ('p','u')
        """, (ref_table,))
        for conkey, contype in cur.fetchall():
            with pg_conn.cursor() as cur2:
                cur2.execute("""
                    SELECT a.attname
                    FROM pg_attribute a
                    WHERE a.attrelid = %s::regclass
                      AND a.attnum = ANY(%s)
                    ORDER BY a.attnum
                """, (ref_table, conkey))
                cols = [r[0] for r in cur2.fetchall()]
            if set(cols) == set(to_cols):
                return True
    return False

def clean_orphans(pg_conn, child_table: str, ref_table: str, pairs: List[Tuple[str, str]]) -> int:
    """
    Delete rows in child_table where FK reference does not exist in ref_table.
    Works for single or composite key FKs.
    """
    child_conds = []
    join_conds = []
    for child_col, parent_col in pairs:
        child_conds.append(f"{qident('c')}.{qident(child_col)} IS NOT NULL")
        join_conds.append(f"{qident('p')}.{qident(parent_col)} = {qident('c')}.{qident(child_col)}")
    where_notnull = " AND ".join(child_conds) if child_conds else "TRUE"
    join_on = " AND ".join(join_conds) if join_conds else "TRUE"

    sql = f"""
        WITH bad AS (
            SELECT {qident('c')}.ctid
            FROM {qident(child_table)} {qident('c')}
            LEFT JOIN {qident(ref_table)} {qident('p')}
              ON {join_on}
            WHERE {where_notnull}
              AND {qident('p')}.ctid IS NULL
        )
        DELETE FROM {qident(child_table)} x
        USING bad
        WHERE x.ctid = bad.ctid;
    """
    with pg_conn.cursor() as cur:
        cur.execute(sql)
        deleted = cur.rowcount if cur.rowcount is not None else 0
    pg_conn.commit()
    return deleted

def add_foreign_keys_not_valid(pg_conn, table: str, fks):
    """
    Add FKs as NOT VALID (so existing rows are not validated immediately).
    Skip FKs whose parent does not have a unique/PK on referenced columns.
    Returns list of (constraint_name, fk_dict) actually created.
    """
    created = []
    # Each DDL is autonomous: if one fails, ROLLBACK and continue
    with pg_conn:
        with pg_conn.cursor() as cur:
            for i, fk in enumerate(fks, start=1):
                ref_table = fk["ref_table"]
                pairs = fk["pairs"]
                from_cols = ", ".join(qident(a) for a, _ in pairs)
                to_cols_list = [b for _, b in pairs]
                to_cols = ", ".join(qident(b) for _, b in pairs)

                # Check parent uniqueness
                if not parent_has_unique_on_columns(pg_conn, ref_table, to_cols_list):
                    print(f'\n[FK SKIPPED] {table} -> {ref_table}  (columns {to_cols_list} not unique/PK in parent)')
                    continue

                cname = f"{table}_fk_{i}"

                parts = [
                    f"ALTER TABLE {qident(table)}",
                    f"ADD CONSTRAINT {qident(cname)}",
                    f"FOREIGN KEY ({from_cols})",
                    f"REFERENCES {qident(ref_table)} ({to_cols})",
                ]

                # Options ON UPDATE/DELETE first
                if fk.get("on_update") and isinstance(fk["on_update"], str) and fk["on_update"].upper() != "NO ACTION":
                    parts.append(f"ON UPDATE {fk['on_update']}")
                if fk.get("on_delete") and isinstance(fk["on_delete"], str) and fk["on_delete"].upper() != "NO ACTION":
                    parts.append(f"ON DELETE {fk['on_delete']}")

                # DEFERRABLE then NOT VALID at the end
                parts.append("DEFERRABLE INITIALLY IMMEDIATE")
                parts.append("NOT VALID")

                clause = " ".join(parts)

                try:
                    cur.execute(clause + ";")
                    created.append((cname, fk))
                except Exception as e:
                    # Clear failed transaction and continue
                    pg_conn.rollback()
                    print(f"\n[FK ERROR] {table}: {e}\n\n → Clause: {clause}\n")
    return created

def validate_foreign_keys(pg_conn, table: str, created_constraints: List[Tuple[str, dict]]):
    """
    Run VALIDATE CONSTRAINT for each previously created NOT VALID FK.
    Continues on error and prints a clear message.
    """
    for cname, _ in created_constraints:
        try:
            with pg_conn:
                with pg_conn.cursor() as cur:
                    cur.execute(f"ALTER TABLE {qident(table)} VALIDATE CONSTRAINT {qident(cname)};")
        except Exception as e:
            print(f"[FK VALIDATE ERROR] {table}.{cname}: {e}")

# ---------- Sequences / Identity ----------

def set_identity_sequences(pg_conn, table: str, cols, pk_cols):
    """
    Align identity/serial sequence to MAX(id) for single-column integer PKs.
    Works for both IDENTITY and legacy SERIAL.
    """
    if len(pk_cols) != 1:
        return
    pk = pk_cols[0]
    for c in cols:
        if c[1] == pk:
            pg_type = map_sqlite_type_to_pg(c[2]).upper()
            if pg_type not in ("INTEGER", "BIGINT"):
                return
            break

    with pg_conn:
        with pg_conn.cursor() as cur:
            # Is it an IDENTITY column?
            cur.execute("""
                SELECT is_identity
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name=%s AND column_name=%s
            """, (table, pk))
            row = cur.fetchone()
            is_identity = (row and row[0] == 'YES')

            # Compute MAX(id)
            cur.execute(f'SELECT MAX({qident(pk)}) FROM {qident(table)};')
            max_id = cur.fetchone()[0]

            if max_id is None:
                return

            if is_identity:
                # Restart identity to next value after current max
                next_val = int(max_id) + 1
                cur.execute(f'ALTER TABLE {qident(table)} ALTER COLUMN {qident(pk)} RESTART WITH {next_val};')
            else:
                # Legacy serial: get sequence name and setval
                cur.execute("SELECT pg_get_serial_sequence(%s, %s)", (table, pk))
                res = cur.fetchone()
                if res and res[0]:
                    seq_name = res[0]
                    cur.execute("SELECT setval(%s, %s, true)", (seq_name, int(max_id)))

# ================== MAIN ==================

def main():
    print("=== TALON SQLite -> PostgreSQL migration ===")
    print(f"SQLite source: {SQLITE_PATH}")
    print(f"PostgreSQL: {PG_CONN['user']}@{PG_CONN['host']}:{PG_CONN['port']}/{PG_CONN['dbname']}")

    if not os.path.exists(SQLITE_PATH):
        print("ERROR: SQLite DB not found at:", SQLITE_PATH)
        sys.exit(1)

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_conn.execute("PRAGMA foreign_keys=ON;")

    pg_conn = psycopg2.connect(**PG_CONN)

    try:
        tables = fetch_sqlite_tables(sqlite_conn)
        if not tables:
            print("No tables found in SQLite.")
            return

        # Collect schema
        schema = {}
        for name, _ in tables:
            cols = fetch_table_info(sqlite_conn, name)
            pk_cols = [c[1] for c in cols if c[5] == 1]
            uniques = fetch_index_info(sqlite_conn, name)
            fks = fetch_foreign_keys(sqlite_conn, name)
            schema[name] = {"cols": cols, "pk_cols": pk_cols, "uniques": uniques, "fks": fks}

        # Drop (optional)
        if DROP_AND_RECREATE:
            with pg_conn:
                with pg_conn.cursor() as cur:
                    for table in schema.keys():
                        cur.execute(f"DROP TABLE IF EXISTS {qident(table)} CASCADE;")
            print("Dropped existing tables (CASCADE).")

        # Create tables (no FKs)
        with pg_conn:
            with pg_conn.cursor() as cur:
                for table, meta in schema.items():
                    cur.execute(build_create_table_sql(table, meta["cols"], meta["uniques"], meta["pk_cols"]))
        print("Created tables (without FKs).")

        # Copy data
        total_rows = 0
        for table, meta in schema.items():
            print(f"Copying data: {table} ...", end="", flush=True)
            inserted = copy_table_data(sqlite_conn, pg_conn, table, meta["cols"])
            total_rows += inserted
            print(f" {inserted} rows.")
            if SET_SEQUENCES:
                set_identity_sequences(pg_conn, table, meta["cols"], meta["pk_cols"])
        print(f"Data copy done. Total rows inserted: {total_rows}")

        # Clean orphans + add FKs NOT VALID
        created_map: Dict[str, List[Tuple[str, dict]]] = {}
        for table, meta in schema.items():
            if not meta["fks"]:
                continue
            print(f"Preparing foreign keys for {table} ...", end="", flush=True)

            # Clean orphans per-FK (so messages and counts are clear)
            total_deleted = 0
            for fk in meta["fks"]:
                deleted = clean_orphans(pg_conn, table, fk["ref_table"], fk["pairs"])
                total_deleted += deleted
            if total_deleted:
                print(f" cleaned {total_deleted} orphan rows.", end="")

            # Add NOT VALID FKs
            created = add_foreign_keys_not_valid(pg_conn, table, meta["fks"])
            created_map[table] = created
            print(" added constraints (NOT VALID).")

        # Validate constraints (deferred)
        for table, created in created_map.items():
            if not created:
                continue
            print(f"Validating foreign keys for {table} ...", end="", flush=True)
            validate_foreign_keys(pg_conn, table, created)
            print(" done.")

        print("Migration completed successfully.")
        print("NOTE: Views and triggers were intentionally NOT created. Recreate them manually in PostgreSQL as needed.")

    finally:
        try:
            sqlite_conn.close()
        except Exception:
            pass
        try:
            pg_conn.close()
        except Exception:
            pass

if __name__ == "__main__":
    main()
