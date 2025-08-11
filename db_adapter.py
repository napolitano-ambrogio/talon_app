# db_adapter.py
import os
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    # fallback: il tuo SQLite locale (così puoi sviluppare in dual mode)
    "sqlite+pysqlite:///talon_data.db"
)

# future=True usa l’API 2.0 di SQLAlchemy
engine = create_engine(DATABASE_URL, future=True)

def get_conn() -> Connection:
    return engine.connect()

def _qmarks_to_named(sql: str, params):
    """
    Converte i ? di SQLite in :p1, :p2... e costruisce un dict parametri.
    Accetta tuple/list o dict (se passi già dict lascia tutto com’è).
    """
    if isinstance(params, dict):
        return sql, params
    if not params:
        return sql, {}
    out = {}
    parts = sql.split('?')
    new_sql = []
    for i, part in enumerate(parts):
        new_sql.append(part)
        if i < len(parts) - 1:
            key = f"p{i+1}"
            new_sql.append(f":{key}")
            out[key] = params[i]
    return ''.join(new_sql), out

def exec_all(conn: Connection, sql: str, params=None):
    sql2, bind = _qmarks_to_named(sql, params or ())
    res = conn.execute(text(sql2), bind)
    return res.mappings().all()

def exec_one(conn: Connection, sql: str, params=None):
    sql2, bind = _qmarks_to_named(sql, params or ())
    res = conn.execute(text(sql2), bind).mappings().first()
    return res

def exec_scalar(conn: Connection, sql: str, params=None):
    sql2, bind = _qmarks_to_named(sql, params or ())
    res = conn.execute(text(sql2), bind).scalar_one_or_none()
    return res

def exec_insert(conn: Connection, sql: str, params=None):
    sql2, bind = _qmarks_to_named(sql, params or ())
    res = conn.execute(text(sql2), bind)
    # In Postgres: prendi PK se c’è RETURNING, altrimenti None
    try:
        pk = res.inserted_primary_key
        return pk[0] if pk else None
    except Exception:
        return None

def commit(conn: Connection):
    conn.commit()

def begin(conn: Connection):
    return conn.begin()  # context manager
