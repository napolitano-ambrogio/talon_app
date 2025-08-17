#!/usr/bin/env python3
"""
Sistema di Backup Enterprise per TALON
Implementa backup automatici, manuali, retention policy e ripristini
"""

import os
import subprocess
import json
import shutil
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import sqlite3
import psycopg2
from psycopg2.extras import RealDictCursor
import threading
import time
from pathlib import Path
import gzip
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TalonBackupManager:
    """
    Sistema di backup enterprise per TALON
    Implementa tutte le best practice per backup enterprise
    """
    
    def __init__(self, config_file='backup_config.json'):
        self.config_file = config_file
        self.config = self._load_config()
        self.backup_db = self._init_backup_database()
        
        # Paths
        self.backup_root = self.config.get('backup_root', 'F:\\talon_backups')
        self.pg_dump_path = self.config.get('pg_dump_path', 'F:\\PostgreSQL\\bin\\pg_dump.exe')
        self.psql_path = self.config.get('psql_path', 'F:\\PostgreSQL\\bin\\psql.exe')
        
        # Database connection
        self.db_host = self.config.get('db_host', 'localhost')
        self.db_port = self.config.get('db_port', 5432)
        self.db_name = self.config.get('db_name', 'talon')
        self.db_user = self.config.get('db_user', 'talon')
        self.db_password = self.config.get('db_password', 'TalonDB!2025')
        
        # Policies
        self.retention_policy = self.config.get('retention_policy', {
            'daily': 7,    # Keep 7 daily backups
            'weekly': 4,   # Keep 4 weekly backups  
            'monthly': 12, # Keep 12 monthly backups
            'yearly': 3    # Keep 3 yearly backups
        })
        
        # Create directories
        self._create_directory_structure()
        
        # Scheduler thread
        self.scheduler_running = False
        self.scheduler_thread = None
    
    def _load_config(self) -> Dict:
        """Carica configurazione da file JSON"""
        default_config = {
            "backup_root": "F:\\talon_backups",
            "pg_dump_path": "F:\\PostgreSQL\\bin\\pg_dump.exe",
            "psql_path": "F:\\PostgreSQL\\bin\\psql.exe",
            "db_host": "localhost",
            "db_port": 5432,
            "db_name": "talon",
            "db_user": "talon",
            "db_password": "TalonDB!2025",
            "retention_policy": {
                "daily": 7,
                "weekly": 4,
                "monthly": 12,
                "yearly": 3
            },
            "schedule": {
                "enabled": True,
                "daily_time": "02:00",
                "weekly_day": "sunday",
                "monthly_day": 1
            },
            "compression": {
                "enabled": True,
                "level": 6
            },
            "encryption": {
                "enabled": False,
                "key_file": ""
            }
        }
        
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                # Merge with defaults
                for key, value in default_config.items():
                    if key not in config:
                        config[key] = value
                return config
        except Exception as e:
            logger.warning(f"Errore caricamento config: {e}. Uso default.")
        
        return default_config
    
    def _save_config(self):
        """Salva configurazione su file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=4)
        except Exception as e:
            logger.error(f"Errore salvataggio config: {e}")
    
    def _init_backup_database(self) -> str:
        """Inizializza database SQLite per tracking backup"""
        db_path = os.path.join(self.config.get('backup_root', 'F:\\talon_backups'), 'backup_metadata.db')
        
        try:
            conn = sqlite3.connect(db_path)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS backups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    backup_id TEXT UNIQUE NOT NULL,
                    backup_type TEXT NOT NULL,  -- full, incremental, differential
                    backup_method TEXT NOT NULL, -- manual, scheduled
                    file_path TEXT NOT NULL,
                    file_size INTEGER,
                    compressed BOOLEAN DEFAULT FALSE,
                    encrypted BOOLEAN DEFAULT FALSE,
                    status TEXT DEFAULT 'completed', -- running, completed, failed
                    error_message TEXT,
                    duration_seconds INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    retention_category TEXT, -- daily, weekly, monthly, yearly
                    database_size INTEGER,
                    tables_included TEXT, -- JSON array
                    checksum TEXT,
                    created_by_user TEXT
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS restore_operations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    backup_id TEXT NOT NULL,
                    restore_type TEXT NOT NULL, -- full, selective, point_in_time
                    target_database TEXT,
                    status TEXT DEFAULT 'running', -- running, completed, failed
                    error_message TEXT,
                    duration_seconds INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    created_by_user TEXT,
                    FOREIGN KEY (backup_id) REFERENCES backups (backup_id)
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS scheduled_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_name TEXT UNIQUE NOT NULL,
                    backup_type TEXT NOT NULL,
                    schedule_pattern TEXT NOT NULL, -- cron-like
                    enabled BOOLEAN DEFAULT TRUE,
                    last_run DATETIME,
                    next_run DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
            conn.close()
            return db_path
        except Exception as e:
            logger.error(f"Errore inizializzazione backup database: {e}")
            raise
    
    def _create_directory_structure(self):
        """Crea struttura directory per i backup"""
        directories = [
            self.backup_root,
            os.path.join(self.backup_root, 'full'),
            os.path.join(self.backup_root, 'incremental'),
            os.path.join(self.backup_root, 'differential'),
            os.path.join(self.backup_root, 'manual'),
            os.path.join(self.backup_root, 'scheduled'),
            os.path.join(self.backup_root, 'archive'),
            os.path.join(self.backup_root, 'temp')
        ]
        
        for directory in directories:
            os.makedirs(directory, exist_ok=True)
    
    def _get_db_connection(self):
        """Ottiene connessione al database TALON"""
        try:
            return psycopg2.connect(
                host=self.db_host,
                port=self.db_port,
                database=self.db_name,
                user=self.db_user,
                password=self.db_password
            )
        except Exception as e:
            logger.error(f"Errore connessione database: {e}")
            raise
    
    def get_database_stats(self) -> Dict:
        """Ottiene statistiche del database"""
        try:
            conn = self._get_db_connection()
            with conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Dimensione database
                    cur.execute("SELECT pg_size_pretty(pg_database_size('talon')) as size")
                    db_size = cur.fetchone()['size']
                    
                    # Numero tabelle
                    cur.execute("""
                        SELECT COUNT(*) as table_count 
                        FROM information_schema.tables 
                        WHERE table_schema = 'public'
                    """)
                    table_count = cur.fetchone()['table_count']
                    
                    # Statistiche record per tabelle principali
                    tables = ['attivita', 'enti_militari', 'enti_civili', 'operazioni', 'utenti']
                    table_stats = {}
                    
                    for table in tables:
                        try:
                            cur.execute(f"SELECT COUNT(*) as count FROM {table}")
                            table_stats[table] = cur.fetchone()['count']
                        except:
                            table_stats[table] = 0
                    
                    return {
                        'database_size': db_size,
                        'table_count': table_count,
                        'table_stats': table_stats,
                        'last_updated': datetime.now().isoformat()
                    }
        except Exception as e:
            logger.error(f"Errore statistiche database: {e}")
            return {}
    
    def create_backup(self, backup_type='full', method='manual', user_id=None) -> Dict:
        """
        Crea un backup del database
        
        Args:
            backup_type: 'full', 'incremental', 'differential', 'schema_only', 'data_only'
            method: 'manual', 'scheduled'
            user_id: ID utente che ha richiesto il backup
        """
        backup_id = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{backup_type}"
        start_time = datetime.now()
        
        try:
            # Determina directory e file
            method_dir = 'scheduled' if method == 'scheduled' else 'manual'
            type_dir = backup_type
            
            backup_dir = os.path.join(self.backup_root, method_dir, type_dir)
            os.makedirs(backup_dir, exist_ok=True)
            
            backup_file = os.path.join(backup_dir, f"{backup_id}.sql")
            
            # Prepara comando pg_dump
            cmd = [
                self.pg_dump_path,
                f"--host={self.db_host}",
                f"--port={self.db_port}",
                f"--username={self.db_user}",
                f"--dbname={self.db_name}",
                "--verbose",
                "--no-password"
            ]
            
            # Opzioni specifiche per tipo backup
            if backup_type == 'full':
                cmd.extend(["--clean", "--create"])
            elif backup_type == 'schema_only':
                cmd.append("--schema-only")
            elif backup_type == 'data_only':
                cmd.append("--data-only")
            
            cmd.extend([f"--file={backup_file}"])
            
            # Variabile ambiente per password
            env = os.environ.copy()
            env['PGPASSWORD'] = self.db_password
            
            # Registra backup in database
            self._register_backup_start(backup_id, backup_type, method, backup_file, user_id)
            
            # Esegui backup
            logger.info(f"Avvio backup {backup_id}")
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            if result.returncode == 0:
                # Backup riuscito
                file_size = os.path.getsize(backup_file)
                
                # Comprimi se abilitato
                if self.config.get('compression', {}).get('enabled', True):
                    compressed_file = self._compress_backup(backup_file)
                    if compressed_file:
                        os.remove(backup_file)  # Rimuovi originale
                        backup_file = compressed_file
                        file_size = os.path.getsize(backup_file)
                
                # Calcola checksum
                checksum = self._calculate_checksum(backup_file)
                
                # Determina retention category e expiry
                retention_category, expires_at = self._determine_retention(backup_type, method, start_time)
                
                # Aggiorna database con path corretto (compresso se applicabile)
                self._register_backup_completion(
                    backup_id, 'completed', file_size, duration, 
                    checksum, retention_category, expires_at, None, backup_file
                )
                
                logger.info(f"Backup {backup_id} completato: {file_size} bytes in {duration:.1f}s")
                
                return {
                    'success': True,
                    'backup_id': backup_id,
                    'file_path': backup_file,
                    'file_size': file_size,
                    'duration': duration,
                    'checksum': checksum,
                    'retention_category': retention_category,
                    'expires_at': expires_at
                }
            else:
                # Backup fallito
                error_msg = result.stderr or "Errore sconosciuto"
                self._register_backup_completion(backup_id, 'failed', 0, duration, None, None, None, error_msg)
                
                logger.error(f"Backup {backup_id} fallito: {error_msg}")
                
                return {
                    'success': False,
                    'backup_id': backup_id,
                    'error': error_msg,
                    'duration': duration
                }
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Errore backup {backup_id}: {error_msg}")
            
            try:
                duration = (datetime.now() - start_time).total_seconds()
                self._register_backup_completion(backup_id, 'failed', 0, duration, None, None, None, error_msg)
            except:
                pass
            
            return {
                'success': False,
                'backup_id': backup_id,
                'error': error_msg
            }
    
    def _register_backup_start(self, backup_id, backup_type, method, file_path, user_id):
        """Registra inizio backup nel database metadata"""
        try:
            conn = sqlite3.connect(self.backup_db)
            # Usa timestamp locale invece di CURRENT_TIMESTAMP (UTC)
            local_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            conn.execute('''
                INSERT INTO backups (
                    backup_id, backup_type, backup_method, file_path, 
                    status, created_by_user, created_at
                ) VALUES (?, ?, ?, ?, 'running', ?, ?)
            ''', (backup_id, backup_type, method, file_path, user_id, local_timestamp))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Errore registrazione backup: {e}")
    
    def _register_backup_completion(self, backup_id, status, file_size, duration, 
                                   checksum, retention_category, expires_at, error_msg=None, file_path=None):
        """Registra completamento backup nel database metadata"""
        try:
            conn = sqlite3.connect(self.backup_db)
            if file_path:
                # Aggiorna anche il file_path se fornito (per file compressi)
                conn.execute('''
                    UPDATE backups SET 
                        status = ?, file_size = ?, duration_seconds = ?, 
                        checksum = ?, retention_category = ?, expires_at = ?, error_message = ?, file_path = ?
                    WHERE backup_id = ?
                ''', (status, file_size, duration, checksum, retention_category, 
                      expires_at, error_msg, file_path, backup_id))
            else:
                conn.execute('''
                    UPDATE backups SET 
                        status = ?, file_size = ?, duration_seconds = ?, 
                        checksum = ?, retention_category = ?, expires_at = ?, error_message = ?
                    WHERE backup_id = ?
                ''', (status, file_size, duration, checksum, retention_category, 
                      expires_at, error_msg, backup_id))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Errore aggiornamento backup: {e}")
    
    def _compress_backup(self, file_path: str) -> Optional[str]:
        """Comprimi backup con gzip"""
        try:
            compressed_path = file_path + '.gz'
            with open(file_path, 'rb') as f_in:
                with gzip.open(compressed_path, 'wb', compresslevel=self.config.get('compression', {}).get('level', 6)) as f_out:
                    shutil.copyfileobj(f_in, f_out)
            return compressed_path
        except Exception as e:
            logger.error(f"Errore compressione: {e}")
            return None
    
    def _calculate_checksum(self, file_path: str) -> str:
        """Calcola checksum MD5 del file"""
        import hashlib
        try:
            hash_md5 = hashlib.md5()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception as e:
            logger.error(f"Errore calcolo checksum: {e}")
            return ""
    
    def _determine_retention(self, backup_type: str, method: str, backup_time: datetime) -> Tuple[str, datetime]:
        """Determina categoria retention e data scadenza"""
        now = backup_time
        
        # Determina categoria basata su tipo e metodo
        if method == 'manual':
            # Backup manuali: retention più lunga
            category = 'monthly'
            expires_at = now + timedelta(days=30 * self.retention_policy['monthly'])
        else:
            # Backup automatici: logica più complessa
            if backup_type == 'full':
                if now.weekday() == 6:  # Domenica
                    if now.day <= 7:  # Prima settimana del mese
                        category = 'monthly'
                        expires_at = now + timedelta(days=30 * self.retention_policy['monthly'])
                    else:
                        category = 'weekly'
                        expires_at = now + timedelta(days=7 * self.retention_policy['weekly'])
                else:
                    category = 'daily'
                    expires_at = now + timedelta(days=self.retention_policy['daily'])
            else:
                category = 'daily'
                expires_at = now + timedelta(days=self.retention_policy['daily'])
        
        return category, expires_at
    
    def list_backups(self, limit: int = 50, status: str = None) -> List[Dict]:
        """Lista backup disponibili"""
        try:
            conn = sqlite3.connect(self.backup_db)
            conn.row_factory = sqlite3.Row
            
            query = "SELECT * FROM backups"
            params = []
            
            if status:
                query += " WHERE status = ?"
                params.append(status)
            
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            
            cursor = conn.execute(query, params)
            backups = [dict(row) for row in cursor.fetchall()]
            conn.close()
            
            return backups
        except Exception as e:
            logger.error(f"Errore lista backup: {e}")
            return []
    
    def get_backup_details(self, backup_id: str) -> Optional[Dict]:
        """Ottiene dettagli di un backup specifico"""
        try:
            conn = sqlite3.connect(self.backup_db)
            conn.row_factory = sqlite3.Row
            
            cursor = conn.execute("SELECT * FROM backups WHERE backup_id = ?", (backup_id,))
            backup = cursor.fetchone()
            conn.close()
            
            if backup:
                return dict(backup)
            return None
        except Exception as e:
            logger.error(f"Errore dettagli backup: {e}")
            return None
    
    def delete_backup(self, backup_id: str, user_id: str = None) -> bool:
        """Elimina un backup"""
        try:
            backup = self.get_backup_details(backup_id)
            if not backup:
                return False
            
            # Elimina file fisico
            if os.path.exists(backup['file_path']):
                os.remove(backup['file_path'])
            
            # Elimina dal database
            conn = sqlite3.connect(self.backup_db)
            conn.execute("DELETE FROM backups WHERE backup_id = ?", (backup_id,))
            conn.commit()
            conn.close()
            
            logger.info(f"Backup {backup_id} eliminato da {user_id}")
            return True
        except Exception as e:
            logger.error(f"Errore eliminazione backup {backup_id}: {e}")
            return False
    
    def cleanup_expired_backups(self) -> Dict:
        """Pulisce backup scaduti secondo retention policy"""
        try:
            now = datetime.now()
            conn = sqlite3.connect(self.backup_db)
            
            # Trova backup scaduti
            cursor = conn.execute("""
                SELECT backup_id, file_path FROM backups 
                WHERE expires_at < ? AND status = 'completed'
            """, (now,))
            
            expired_backups = cursor.fetchall()
            deleted_count = 0
            errors = []
            
            for backup_id, file_path in expired_backups:
                try:
                    # Elimina file
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    
                    # Elimina dal database
                    conn.execute("DELETE FROM backups WHERE backup_id = ?", (backup_id,))
                    deleted_count += 1
                    logger.info(f"Backup scaduto eliminato: {backup_id}")
                except Exception as e:
                    errors.append(f"{backup_id}: {str(e)}")
            
            conn.commit()
            conn.close()
            
            return {
                'deleted_count': deleted_count,
                'errors': errors
            }
        except Exception as e:
            logger.error(f"Errore pulizia backup: {e}")
            return {'deleted_count': 0, 'errors': [str(e)]}
    
    def restore_backup(self, backup_id: str, restore_type: str = 'full', 
                      target_db: str = None, user_id: str = None) -> Dict:
        """
        Ripristina un backup
        
        Args:
            backup_id: ID del backup da ripristinare
            restore_type: 'full', 'selective', 'point_in_time'
            target_db: Database di destinazione (default: stesso db)
            user_id: Utente che richiede il ripristino
        """
        restore_id = f"restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        start_time = datetime.now()
        
        try:
            # Ottieni dettagli backup
            backup = self.get_backup_details(backup_id)
            if not backup:
                return {'success': False, 'error': 'Backup non trovato'}
            
            if not os.path.exists(backup['file_path']):
                return {'success': False, 'error': 'File backup non trovato'}
            
            target_database = target_db or self.db_name
            
            # Registra operazione di ripristino
            self._register_restore_start(restore_id, backup_id, restore_type, target_database, user_id)
            
            # Prepara file per ripristino
            restore_file = backup['file_path']
            
            # Decomprimi se necessario
            if restore_file.endswith('.gz'):
                temp_file = os.path.join(self.backup_root, 'temp', f"temp_{restore_id}.sql")
                with gzip.open(restore_file, 'rb') as f_in:
                    with open(temp_file, 'wb') as f_out:
                        shutil.copyfileobj(f_in, f_out)
                restore_file = temp_file
            
            # Comando psql per ripristino
            cmd = [
                self.psql_path,
                f"--host={self.db_host}",
                f"--port={self.db_port}",
                f"--username={self.db_user}",
                f"--dbname={target_database}",
                f"--file={restore_file}",
                "--no-password"
            ]
            
            # Variabile ambiente per password
            env = os.environ.copy()
            env['PGPASSWORD'] = self.db_password
            
            # Esegui ripristino
            logger.info(f"Avvio ripristino {restore_id} da backup {backup_id}")
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            # Pulisci file temporaneo
            if restore_file != backup['file_path']:
                os.remove(restore_file)
            
            if result.returncode == 0:
                # Ripristino riuscito
                self._register_restore_completion(restore_id, 'completed', duration)
                
                logger.info(f"Ripristino {restore_id} completato in {duration:.1f}s")
                
                return {
                    'success': True,
                    'restore_id': restore_id,
                    'backup_id': backup_id,
                    'duration': duration,
                    'target_database': target_database
                }
            else:
                # Ripristino fallito
                error_msg = result.stderr or "Errore sconosciuto"
                self._register_restore_completion(restore_id, 'failed', duration, error_msg)
                
                logger.error(f"Ripristino {restore_id} fallito: {error_msg}")
                
                return {
                    'success': False,
                    'restore_id': restore_id,
                    'error': error_msg,
                    'duration': duration
                }
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Errore ripristino {restore_id}: {error_msg}")
            
            try:
                duration = (datetime.now() - start_time).total_seconds()
                self._register_restore_completion(restore_id, 'failed', duration, error_msg)
            except:
                pass
            
            return {
                'success': False,
                'restore_id': restore_id,
                'error': error_msg
            }
    
    def _register_restore_start(self, restore_id: str, backup_id: str, restore_type: str, 
                               target_db: str, user_id: str):
        """Registra inizio operazione ripristino"""
        try:
            conn = sqlite3.connect(self.backup_db)
            # Usa timestamp locale
            local_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            conn.execute('''
                INSERT INTO restore_operations (
                    id, backup_id, restore_type, target_database, 
                    status, created_by_user, created_at
                ) VALUES (?, ?, ?, ?, 'running', ?, ?)
            ''', (restore_id, backup_id, restore_type, target_db, user_id, local_timestamp))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Errore registrazione ripristino: {e}")
    
    def _register_restore_completion(self, restore_id: str, status: str, duration: float, error_msg: str = None):
        """Registra completamento operazione ripristino"""
        try:
            conn = sqlite3.connect(self.backup_db)
            # Usa timestamp locale
            local_timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            conn.execute('''
                UPDATE restore_operations SET 
                    status = ?, duration_seconds = ?, error_message = ?, 
                    completed_at = ?
                WHERE id = ?
            ''', (status, duration, error_msg, local_timestamp, restore_id))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Errore aggiornamento ripristino: {e}")
    
    def get_system_status(self) -> Dict:
        """Ottiene stato generale del sistema backup"""
        try:
            conn = sqlite3.connect(self.backup_db)
            
            # Statistiche backup
            cursor = conn.execute("""
                SELECT 
                    COUNT(*) as total_backups,
                    SUM(file_size) as total_size,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_backups,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_backups,
                    MAX(created_at) as last_backup
                FROM backups
            """)
            backup_stats = cursor.fetchone()
            
            # Backup recenti per tipo
            cursor = conn.execute("""
                SELECT backup_type, COUNT(*) as count
                FROM backups 
                WHERE created_at > datetime('now', '-7 days')
                GROUP BY backup_type
            """)
            recent_by_type = dict(cursor.fetchall())
            
            # Spazio disco backup
            total_backup_size = 0
            for root, dirs, files in os.walk(self.backup_root):
                for file in files:
                    try:
                        total_backup_size += os.path.getsize(os.path.join(root, file))
                    except:
                        pass
            
            conn.close()
            
            return {
                'backup_stats': {
                    'total_backups': backup_stats[0] or 0,
                    'total_size_bytes': backup_stats[1] or 0,
                    'total_size_mb': round((backup_stats[1] or 0) / 1024 / 1024, 2),
                    'completed_backups': backup_stats[2] or 0,
                    'failed_backups': backup_stats[3] or 0,
                    'last_backup': backup_stats[4]
                },
                'recent_by_type': recent_by_type,
                'disk_usage': {
                    'backup_directory_size_mb': round(total_backup_size / 1024 / 1024, 2),
                    'backup_root': self.backup_root
                },
                'retention_policy': self.retention_policy,
                'scheduler_status': self.scheduler_running
            }
        except Exception as e:
            logger.error(f"Errore stato sistema: {e}")
            return {}
    
    def update_config(self, new_config: Dict) -> bool:
        """Aggiorna configurazione sistema"""
        try:
            self.config.update(new_config)
            self._save_config()
            
            # Aggiorna paths se necessario
            if 'backup_root' in new_config:
                self.backup_root = new_config['backup_root']
                self._create_directory_structure()
            
            return True
        except Exception as e:
            logger.error(f"Errore aggiornamento config: {e}")
            return False

# Istanza globale del backup manager
backup_manager = TalonBackupManager()