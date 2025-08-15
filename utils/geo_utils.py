# -*- coding: utf-8 -*-
"""
Utilità geografiche per TALON - SOLO PostGIS
Versione pulita senza coordinate decimali, trigger o funzioni custom
"""
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from typing import List, Dict, Tuple, Optional

class GeoManager:
    """Gestione geografica esclusivamente con PostGIS"""
    
    def __init__(self, db_config):
        self.db_config = db_config
        
    def get_connection(self):
        """Ottiene connessione al database"""
        conn = psycopg2.connect(
            host=self.db_config.get('host', 'localhost'),
            port=self.db_config.get('port', 5432),
            database=self.db_config.get('database', 'talon'),
            user=self.db_config.get('user', 'talon'),
            password=self.db_config.get('password', 'TalonDB!2025'),
            cursor_factory=RealDictCursor
        )
        conn.autocommit = True
        return conn
    
    def aggiorna_coordinate_ente(self, ente_id: int, lat: float, lon: float, tipo: str = 'militare') -> bool:
        """
        Aggiorna coordinate di un ente usando SOLO PostGIS
        
        Args:
            ente_id: ID dell'ente
            lat: Latitudine
            lon: Longitudine  
            tipo: 'militare' o 'civile'
        """
        table = 'enti_militari' if tipo == 'militare' else 'enti_civili'
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Aggiorna SOLO la geometria PostGIS
                cur.execute(f"""
                    UPDATE {table}
                    SET coordinate = ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    WHERE id = %s
                """, (lon, lat, ente_id))
                return cur.rowcount > 0
    
    def ottieni_coordinate_ente(self, ente_id: int, tipo: str = 'militare') -> Optional[Tuple[float, float]]:
        """
        Ottiene coordinate di un ente da geometria PostGIS
        
        Args:
            ente_id: ID dell'ente
            tipo: 'militare' o 'civile'
            
        Returns:
            Tupla (lat, lon) o None
        """
        table = 'enti_militari' if tipo == 'militare' else 'enti_civili'
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT ST_Y(coordinate) as lat, ST_X(coordinate) as lon
                    FROM {table}
                    WHERE id = %s AND coordinate IS NOT NULL
                """, (ente_id,))
                
                result = cur.fetchone()
                if result:
                    return (float(result['lat']), float(result['lon']))
                return None
    
    def trova_enti_vicini(self, lat: float, lon: float, raggio_km: int = 50, limite: int = 10) -> List[Dict]:
        """
        Trova enti vicini usando PostGIS puro
        
        Args:
            lat: Latitudine del centro
            lon: Longitudine del centro
            raggio_km: Raggio di ricerca in km
            limite: Numero massimo di risultati
            
        Returns:
            Lista di enti con distanza
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        'MILITARE' as tipo,
                        id,
                        nome,
                        ST_Y(coordinate) as latitudine,
                        ST_X(coordinate) as longitudine,
                        ST_Distance(
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                            coordinate::geography
                        ) / 1000 as distanza_km
                    FROM enti_militari
                    WHERE coordinate IS NOT NULL
                      AND ST_DWithin(
                          ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                          coordinate::geography,
                          %s * 1000
                      )
                    
                    UNION ALL
                    
                    SELECT 
                        'CIVILE' as tipo,
                        id,
                        nome,
                        ST_Y(coordinate) as latitudine,
                        ST_X(coordinate) as longitudine,
                        ST_Distance(
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                            coordinate::geography
                        ) / 1000 as distanza_km
                    FROM enti_civili
                    WHERE coordinate IS NOT NULL
                      AND ST_DWithin(
                          ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                          coordinate::geography,
                          %s * 1000
                      )
                    
                    ORDER BY distanza_km
                    LIMIT %s
                """, (lon, lat, lon, lat, raggio_km, lon, lat, lon, lat, raggio_km, limite))
                
                return cur.fetchall()
    
    def calcola_distanza(self, ente1_id: int, ente2_id: int, tipo1: str = 'militare', tipo2: str = 'militare') -> Optional[float]:
        """
        Calcola distanza tra due enti usando PostGIS
        
        Args:
            ente1_id: ID primo ente
            ente2_id: ID secondo ente
            tipo1: tipo primo ente ('militare' o 'civile')
            tipo2: tipo secondo ente ('militare' o 'civile')
            
        Returns:
            Distanza in km o None
        """
        table1 = 'enti_militari' if tipo1 == 'militare' else 'enti_civili'
        table2 = 'enti_militari' if tipo2 == 'militare' else 'enti_civili'
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT 
                        ST_Distance(e1.coordinate::geography, e2.coordinate::geography) / 1000 as km
                    FROM {table1} e1, {table2} e2
                    WHERE e1.id = %s AND e2.id = %s
                      AND e1.coordinate IS NOT NULL 
                      AND e2.coordinate IS NOT NULL
                """, (ente1_id, ente2_id))
                
                result = cur.fetchone()
                return float(result['km']) if result else None
    
    def genera_geojson_enti(self, tipo: str = 'tutti') -> Dict:
        """
        Genera GeoJSON usando PostGIS nativo
        
        Args:
            tipo: 'militari', 'civili' o 'tutti'
            
        Returns:
            Dizionario GeoJSON
        """
        features = []
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Enti militari
                if tipo in ['militari', 'tutti']:
                    cur.execute("""
                        SELECT 
                            id, nome, codice,
                            ST_AsGeoJSON(coordinate) as geojson,
                            indirizzo,
                            ST_Y(coordinate) as lat,
                            ST_X(coordinate) as lon
                        FROM enti_militari
                        WHERE coordinate IS NOT NULL
                    """)
                    
                    for row in cur.fetchall():
                        features.append({
                            'type': 'Feature',
                            'geometry': json.loads(row['geojson']),
                            'properties': {
                                'id': row['id'],
                                'nome': row['nome'],
                                'codice': row['codice'],
                                'tipo': 'militare',
                                'indirizzo': row['indirizzo'],
                                'lat': float(row['lat']) if row['lat'] else None,
                                'lon': float(row['lon']) if row['lon'] else None
                            }
                        })
                
                # Enti civili
                if tipo in ['civili', 'tutti']:
                    cur.execute("""
                        SELECT 
                            id, nome,
                            ST_AsGeoJSON(coordinate) as geojson,
                            indirizzo,
                            ST_Y(coordinate) as lat,
                            ST_X(coordinate) as lon
                        FROM enti_civili
                        WHERE coordinate IS NOT NULL
                    """)
                    
                    for row in cur.fetchall():
                        features.append({
                            'type': 'Feature',
                            'geometry': json.loads(row['geojson']),
                            'properties': {
                                'id': row['id'],
                                'nome': row['nome'],
                                'tipo': 'civile',
                                'indirizzo': row['indirizzo'],
                                'lat': float(row['lat']) if row['lat'] else None,
                                'lon': float(row['lon']) if row['lon'] else None
                            }
                        })
        
        return {
            'type': 'FeatureCollection',
            'features': features
        }
    
    def ottieni_statistiche_geografiche(self) -> Dict:
        """
        Ottiene statistiche geografiche usando PostGIS
        
        Returns:
            Dizionario con statistiche
        """
        stats = {}
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Conteggi enti con geometrie
                cur.execute("""
                    SELECT 
                        (SELECT COUNT(*) FROM enti_militari WHERE coordinate IS NOT NULL) as militari_geo,
                        (SELECT COUNT(*) FROM enti_militari) as militari_tot,
                        (SELECT COUNT(*) FROM enti_civili WHERE coordinate IS NOT NULL) as civili_geo,
                        (SELECT COUNT(*) FROM enti_civili) as civili_tot
                """)
                
                counts = cur.fetchone()
                
                stats['copertura'] = {
                    'militari': {
                        'con_coordinate': counts['militari_geo'],
                        'totali': counts['militari_tot'],
                        'percentuale': round(counts['militari_geo'] / counts['militari_tot'] * 100, 1) 
                                      if counts['militari_tot'] > 0 else 0
                    },
                    'civili': {
                        'con_coordinate': counts['civili_geo'],
                        'totali': counts['civili_tot'],
                        'percentuale': round(counts['civili_geo'] / counts['civili_tot'] * 100, 1)
                                      if counts['civili_tot'] > 0 else 0
                    }
                }
                
                # Bounding box con PostGIS
                cur.execute("""
                    SELECT 
                        ST_AsText(ST_Extent(coordinate)) as bbox,
                        ST_Area(ST_ConvexHull(ST_Collect(coordinate))::geography) / 1000000 as area_km2,
                        ST_Perimeter(ST_ConvexHull(ST_Collect(coordinate))::geography) / 1000 as perimeter_km
                    FROM (
                        SELECT coordinate FROM enti_militari WHERE coordinate IS NOT NULL
                        UNION ALL
                        SELECT coordinate FROM enti_civili WHERE coordinate IS NOT NULL
                    ) as tutti_enti
                """)
                
                spatial_stats = cur.fetchone()
                if spatial_stats and spatial_stats['bbox']:
                    stats['area_copertura'] = spatial_stats['bbox']
                    if spatial_stats['area_km2']:
                        stats['area_km2'] = round(float(spatial_stats['area_km2']), 2)
                    if spatial_stats['perimeter_km']:
                        stats['perimeter_km'] = round(float(spatial_stats['perimeter_km']), 2)
        
        return stats
    
    def ottieni_enti_in_area(self, polygon_wkt: str) -> List[Dict]:
        """
        Trova enti all'interno di un'area definita da poligono
        
        Args:
            polygon_wkt: Poligono in formato WKT (es: 'POLYGON((...))')
            
        Returns:
            Lista di enti nell'area
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        'MILITARE' as tipo,
                        id,
                        nome,
                        ST_Y(coordinate) as lat,
                        ST_X(coordinate) as lon
                    FROM enti_militari
                    WHERE coordinate IS NOT NULL
                      AND ST_Within(coordinate, ST_GeomFromText(%s, 4326))
                    
                    UNION ALL
                    
                    SELECT 
                        'CIVILE' as tipo,
                        id,
                        nome,
                        ST_Y(coordinate) as lat,
                        ST_X(coordinate) as lon
                    FROM enti_civili
                    WHERE coordinate IS NOT NULL
                      AND ST_Within(coordinate, ST_GeomFromText(%s, 4326))
                    
                    ORDER BY tipo, nome
                """, (polygon_wkt, polygon_wkt))
                
                return cur.fetchall()


# Funzioni di utilità PostGIS standalone
def crea_punto_wgs84(lat: float, lon: float) -> str:
    """Crea geometria punto in formato WKT"""
    return f"POINT({lon} {lat})"

def crea_buffer_km(lat: float, lon: float, raggio_km: float) -> str:
    """Crea buffer circolare in km intorno a un punto"""
    # Usa proiezione UTM approssimativa per l'Italia
    return f"ST_Buffer(ST_Transform(ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326), 3857), {raggio_km * 1000})"

def distanza_km_postgis(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    """Query PostGIS per calcolare distanza in km"""
    return f"""
        ST_Distance(
            ST_SetSRID(ST_MakePoint({lon1}, {lat1}), 4326)::geography,
            ST_SetSRID(ST_MakePoint({lon2}, {lat2}), 4326)::geography
        ) / 1000
    """


# Esempio di utilizzo
if __name__ == "__main__":
    # Configurazione database
    db_config = {
        'host': 'localhost',
        'port': 5432,
        'database': 'talon',
        'user': 'talon',
        'password': 'TalonDB!2025'
    }
    
    # Crea manager geografico
    geo = GeoManager(db_config)
    
    print("Test GeoManager - Solo PostGIS")
    print("=" * 35)
    
    # Test: aggiorna coordinate
    print("Test aggiornamento coordinate...")
    success = geo.aggiorna_coordinate_ente(1, 41.9028, 12.4964, 'militare')
    print(f"Aggiornamento: {'OK' if success else 'FAILED'}")
    
    # Test: ottieni coordinate
    print("Test lettura coordinate...")
    coords = geo.ottieni_coordinate_ente(1, 'militare')
    if coords:
        print(f"Coordinate ente 1: {coords[0]:.4f}, {coords[1]:.4f}")
    
    # Test: trova enti vicini
    print("Test ricerca enti vicini...")
    enti_vicini = geo.trova_enti_vicini(41.9028, 12.4964, 100)
    print(f"Enti trovati: {len(enti_vicini)}")
    
    # Test: statistiche
    print("Test statistiche...")
    stats = geo.ottieni_statistiche_geografiche()
    print(f"Enti militari: {stats['copertura']['militari']['con_coordinate']}/{stats['copertura']['militari']['totali']}")
    
    print("\nSolo PostGIS - Test completati!")