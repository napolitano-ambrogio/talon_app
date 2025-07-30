import sqlite3

# Definisce il percorso del file del database per essere usato da tutte le funzioni
DB_PATH = 'talon_app/talon_data.db'

def get_db_connection():
    """
    Crea una connessione al database.
    Restituisce un oggetto connessione che permette di accedere alle colonne per nome.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_all_descendants(conn, root_id):
    """
    Recupera ricorsivamente un ente radice e tutti i suoi discendenti dalla tabella enti_militari.
    Questo è utile per mostrare solo la gerarchia del Comando Logistico.
    """
    all_enti = conn.execute('SELECT * FROM enti_militari').fetchall()
    enti_by_parent = {}
    for ente in all_enti:
        pid = ente['parent_id']
        if pid not in enti_by_parent:
            enti_by_parent[pid] = []
        enti_by_parent[pid].append(dict(ente))

    descendants = []
    
    # Trova l'ente radice
    root_node = next((ente for ente in all_enti if ente['id'] == root_id), None)
    if not root_node:
        return []

    nodes_to_visit = [dict(root_node)]
    
    while nodes_to_visit:
        current_node = nodes_to_visit.pop(0)
        descendants.append(current_node)
        children = enti_by_parent.get(current_node['id'], [])
        nodes_to_visit.extend(children)
        
    return descendants

def build_tree(enti_list):
    """
    Costruisce una struttura ad albero (lista di dizionari annidati)
    a partire da una lista piatta di enti.
    """
    # Converte le righe del database in dizionari per una manipolazione più facile
    enti_map = {ente['id']: dict(ente) for ente in enti_list}
    tree = []
    
    # Itera su ogni ente per posizionarlo correttamente nell'albero
    for ente_id, ente in enti_map.items():
        if ente['parent_id']:
            # Se ha un genitore, trovalo e aggiungi questo ente come suo "figlio"
            parent = enti_map.get(ente['parent_id'])
            if parent:
                if 'children' not in parent:
                    parent['children'] = []
                parent['children'].append(ente)
        else:
            # Se non ha un genitore, è un nodo di primo livello
            tree.append(ente)
            
    return tree