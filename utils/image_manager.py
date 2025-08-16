# -*- coding: utf-8 -*-
"""
Gestione upload e manipolazione immagini per TALON
Con controlli di sicurezza avanzati
"""
import os
import re
import time
import hashlib
from datetime import datetime
from PIL import Image, ImageOps
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage

class ImageManager:
    
    # Configurazione sicurezza
    ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif'}
    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
    MAX_IMAGE_WIDTH = 1920
    MAX_IMAGE_HEIGHT = 1080
    
    # Magic numbers per validazione tipo file
    IMAGE_SIGNATURES = {
        b'\xff\xd8\xff': 'jpg',
        b'\x89\x50\x4e\x47\x0d\x0a\x1a\x0a': 'png',
        b'\x47\x49\x46\x38': 'gif'
    }
    
    def __init__(self, upload_folder):
        self.upload_folder = upload_folder
        self.ensure_upload_folder()
    
    def ensure_upload_folder(self):
        """Assicura che la cartella di upload esista"""
        if not os.path.exists(self.upload_folder):
            os.makedirs(self.upload_folder, mode=0o755)
            print(f"Cartella upload creata: {self.upload_folder}")
    
    def sanitize_filename(self, nome_operazione):
        """Sanitizza il nome dell'operazione per uso nel filename"""
        if not nome_operazione:
            return "unnamed"
        
        # Rimuovi caratteri speciali e sostituisci spazi
        sanitized = re.sub(r'[^\w\s-]', '', nome_operazione.lower())
        sanitized = re.sub(r'[-\s]+', '_', sanitized)
        sanitized = sanitized.strip('_')
        
        # Limita lunghezza
        return sanitized[:50] if sanitized else "unnamed"
    
    def generate_filename(self, operazione_id, nome_operazione, original_filename):
        """Genera nome file sicuro secondo il pattern richiesto"""
        # Estrazione estensione sicura
        ext = self.get_safe_extension(original_filename)
        
        # Nome sanitizzato
        nome_sanitized = self.sanitize_filename(nome_operazione)
        
        # Timestamp per unicità
        timestamp = int(time.time())
        
        # Pattern: op_{id}_{nome_breve_sanitized}_{timestamp}.{ext}
        filename = f"op_{operazione_id}_{nome_sanitized}_{timestamp}.{ext}"
        
        return filename
    
    def get_safe_extension(self, filename):
        """Estrae estensione in modo sicuro"""
        if '.' not in filename:
            return 'jpg'
        
        ext = filename.rsplit('.', 1)[1].lower()
        return ext if ext in self.ALLOWED_EXTENSIONS else 'jpg'
    
    def validate_file_signature(self, file_data):
        """Valida il file usando i magic numbers"""
        for signature, file_type in self.IMAGE_SIGNATURES.items():
            if file_data.startswith(signature):
                return file_type
        return None
    
    def validate_image_file(self, file: FileStorage):
        """Validazione completa del file immagine"""
        errors = []
        
        # 1. Controllo nome file
        if not file or not file.filename:
            errors.append("Nessun file selezionato")
            return errors
        
        # 2. Controllo estensione
        ext = self.get_safe_extension(file.filename)
        if ext not in self.ALLOWED_EXTENSIONS:
            errors.append(f"Estensione non permessa. Usa: {', '.join(self.ALLOWED_EXTENSIONS)}")
        
        # 3. Controllo dimensione
        file.seek(0, 2)  # Vai alla fine
        file_size = file.tell()
        file.seek(0)  # Torna all'inizio
        
        if file_size > self.MAX_FILE_SIZE:
            errors.append(f"File troppo grande. Massimo {self.MAX_FILE_SIZE // (1024*1024)}MB")
        
        if file_size == 0:
            errors.append("File vuoto")
        
        # 4. Controllo magic number
        file_data = file.read(max(len(sig) for sig in self.IMAGE_SIGNATURES.keys()))
        file.seek(0)
        
        detected_type = self.validate_file_signature(file_data)
        if not detected_type:
            errors.append("Tipo di file non valido (non è un'immagine)")
        
        # 5. Controllo con PIL per validazione immagine
        try:
            file.seek(0)
            img = Image.open(file)
            img.verify()  # Verifica integrità
            file.seek(0)  # Reset per uso successivo
            
            # Controllo dimensioni
            width, height = img.size
            if width > self.MAX_IMAGE_WIDTH or height > self.MAX_IMAGE_HEIGHT:
                errors.append(f"Immagine troppo grande. Massimo {self.MAX_IMAGE_WIDTH}x{self.MAX_IMAGE_HEIGHT}")
                
        except Exception as e:
            errors.append(f"Immagine corrotta o non valida: {str(e)}")
        
        return errors
    
    def process_and_save_image(self, file: FileStorage, operazione_id, nome_operazione):
        """Processa e salva l'immagine con ottimizzazioni"""
        
        # 1. Validazione
        validation_errors = self.validate_image_file(file)
        if validation_errors:
            return {
                'success': False,
                'errors': validation_errors
            }
        
        try:
            # 2. Genera nome file
            filename = self.generate_filename(operazione_id, nome_operazione, file.filename)
            filepath = os.path.join(self.upload_folder, filename)
            
            # 3. Apri e processa immagine
            file.seek(0)
            img = Image.open(file)
            
            # Rimuovi metadati EXIF per sicurezza
            img = ImageOps.exif_transpose(img)
            
            # Converti a RGB se necessario
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if len(img.split()) > 3 else None)
                img = background
            
            # Ridimensiona se necessario mantenendo proporzioni
            if img.size[0] > self.MAX_IMAGE_WIDTH or img.size[1] > self.MAX_IMAGE_HEIGHT:
                img.thumbnail((self.MAX_IMAGE_WIDTH, self.MAX_IMAGE_HEIGHT), Image.Resampling.LANCZOS)
            
            # 4. Salva con qualità ottimizzata
            img.save(filepath, 'JPEG', quality=85, optimize=True)
            
            # 5. Ottieni informazioni file finale
            final_size = os.path.getsize(filepath)
            
            return {
                'success': True,
                'filename': filename,
                'filepath': filepath,
                'relative_path': f'uploads/operazioni/{filename}',
                'url_path': f'/static/uploads/operazioni/{filename}',
                'file_size': final_size,
                'image_type': 'jpg',  # Sempre JPG dopo conversione
                'original_filename': file.filename
            }
            
        except Exception as e:
            return {
                'success': False,
                'errors': [f'Errore durante il salvataggio: {str(e)}']
            }
    
    def delete_image(self, image_path):
        """Elimina un'immagine dal filesystem"""
        try:
            if image_path and os.path.exists(image_path):
                os.remove(image_path)
                return True
        except Exception as e:
            print(f"Errore eliminazione immagine {image_path}: {e}")
        return False
    
    def get_image_info(self, image_path):
        """Ottieni informazioni su un'immagine esistente"""
        try:
            if not os.path.exists(image_path):
                return None
            
            img = Image.open(image_path)
            return {
                'size': os.path.getsize(image_path),
                'dimensions': img.size,
                'format': img.format.lower() if img.format else 'unknown'
            }
        except Exception:
            return None