/**
 * Geocoding interattivo con mappa per TALON
 * Permette di posizionare manualmente i punti e salvarli
 */

class GeocodingInterattivo {
    constructor() {
        this.map = null;
        this.marker = null;
        this.enteCorrente = null;
        this.entiDaGeocodificare = [];
        this.tuttiGliEnti = [];
        this.indiceCorrente = 0;
        this.coordsTemporanee = null;
        this.modalita = 'automatica';
        
        this.inizializzaMappa();
        this.caricaTuttiGliEnti();
        this.caricaEntiDaGeocodificare();
        this.impostaEventListeners();
    }
    
    inizializzaMappa() {
        // Inizializza mappa Leaflet centrata su Roma
        this.map = L.map('mappa-geocoding').setView([41.9028, 12.4964], 6);
        
        // Aggiungi tile layer gratuito OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
        
        // Event listener per click sulla mappa
        this.map.on('click', (e) => {
            this.posizionaMarker(e.latlng);
        });
    }
    
    async caricaTuttiGliEnti() {
        try {
            const response = await fetch('/api/tutti-gli-enti');
            const data = await response.json();
            
            this.tuttiGliEnti = data.enti || [];
            this.popolaSelectEnti();
            
        } catch (error) {
            console.error('Errore caricamento tutti gli enti:', error);
            this.mostraMessaggio('Errore nel caricamento della lista enti', 'error');
        }
    }
    
    popolaSelectEnti() {
        const select = document.getElementById('select-ente');
        select.innerHTML = '<option value="">-- Seleziona un ente --</option>';
        
        this.tuttiGliEnti.forEach(ente => {
            const option = document.createElement('option');
            option.value = JSON.stringify({
                id: ente.id,
                tipo: ente.tipo,
                nome: ente.nome,
                indirizzo: ente.indirizzo,
                ha_coordinate: ente.ha_coordinate,
                lat: ente.lat,
                lng: ente.lng
            });
            option.textContent = ente.label;
            
            // Evidenzia enti che hanno già coordinate
            if (ente.ha_coordinate) {
                option.style.backgroundColor = '#e8f5e8';
                option.textContent += ' ✓';
            }
            
            select.appendChild(option);
        });
    }
    
    async caricaEntiDaGeocodificare() {
        try {
            const response = await fetch('/api/enti-senza-coordinate');
            const data = await response.json();
            
            this.entiDaGeocodificare = data.enti || [];
            this.indiceCorrente = 0;
            
            this.aggiornaInterfaccia();
            
            if (this.entiDaGeocodificare.length > 0) {
                this.mostraEnteCorrente();
            } else {
                this.mostraMessaggio('Tutti gli enti sono già geocodificati!', 'success');
            }
            
        } catch (error) {
            console.error('Errore caricamento enti:', error);
            this.mostraMessaggio('Errore nel caricamento degli enti', 'error');
        }
    }
    
    caricaEnteSelezionato() {
        const select = document.getElementById('select-ente');
        const selectedValue = select.value;
        
        if (!selectedValue) {
            this.mostraMessaggio('Seleziona un ente dalla lista', 'warning');
            return;
        }
        
        try {
            const enteData = JSON.parse(selectedValue);
            
            // Imposta l'ente corrente
            this.enteCorrente = {
                id: enteData.id,
                nome: enteData.nome,
                indirizzo: enteData.indirizzo,
                tipo: enteData.tipo
            };
            
            // Aggiorna interfaccia
            document.getElementById('ente-nome').textContent = enteData.nome;
            document.getElementById('ente-indirizzo').textContent = enteData.indirizzo || 'Indirizzo non specificato';
            document.getElementById('ente-tipo').textContent = enteData.tipo.toUpperCase();
            document.getElementById('ente-progressivo').textContent = 'Manuale';
            
            // Aggiorna campo di modifica indirizzo
            document.getElementById('input-modifica-indirizzo').value = enteData.indirizzo || '';
            
            // Se l'ente ha già coordinate, mostrali sulla mappa
            if (enteData.ha_coordinate && enteData.lat && enteData.lng) {
                this.map.setView([enteData.lat, enteData.lng], 16);
                this.posizionaMarker({lat: enteData.lat, lng: enteData.lng});
                this.mostraMessaggio('Ente caricato con coordinate esistenti. Modifica se necessario.', 'info');
            } else {
                // Rimuovi marker esistente
                this.rimuoviMarker();
                this.coordsTemporanee = null;
                
                // Prova geocoding automatico se disponibile indirizzo
                if (enteData.indirizzo) {
                    this.geocodingAutomatico(enteData.indirizzo);
                } else {
                    this.map.setView([41.9028, 12.4964], 10);
                    this.mostraMessaggio('Ente caricato. Posiziona manualmente sulla mappa.', 'info');
                }
            }
            
            this.aggiornaInterfaccia();
            
        } catch (error) {
            console.error('Errore parsing ente selezionato:', error);
            this.mostraMessaggio('Errore nel caricamento dell\'ente selezionato', 'error');
        }
    }
    
    mostraEnteCorrente() {
        if (this.indiceCorrente >= this.entiDaGeocodificare.length) {
            this.mostraMessaggio('Geocoding completato per tutti gli enti!', 'success');
            return;
        }
        
        this.enteCorrente = this.entiDaGeocodificare[this.indiceCorrente];
        
        // Aggiorna info ente
        document.getElementById('ente-nome').textContent = this.enteCorrente.nome;
        document.getElementById('ente-indirizzo').textContent = this.enteCorrente.indirizzo || 'Indirizzo non specificato';
        document.getElementById('ente-tipo').textContent = this.enteCorrente.tipo.toUpperCase();
        document.getElementById('ente-progressivo').textContent = `${this.indiceCorrente + 1}/${this.entiDaGeocodificare.length}`;
        
        // Aggiorna campo di modifica indirizzo
        document.getElementById('input-modifica-indirizzo').value = this.enteCorrente.indirizzo || '';
        
        // Reset marker e coordinate
        this.rimuoviMarker();
        this.coordsTemporanee = null;
        
        // Prova geocoding automatico se disponibile indirizzo
        if (this.enteCorrente.indirizzo) {
            this.geocodingAutomatico(this.enteCorrente.indirizzo);
        } else {
            // Centra su Roma se non c'è indirizzo
            this.map.setView([41.9028, 12.4964], 10);
        }
        
        this.aggiornaInterfaccia();
    }
    
    async geocodingAutomatico(indirizzo) {
        try {
            document.getElementById('status-geocoding').textContent = 'Geocoding in corso...';
            document.getElementById('status-geocoding').className = 'status info';
            
            // Prova prima Nominatim di OpenStreetMap
            let result = await this.provaNominatim(indirizzo);
            
            // Se Nominatim fallisce, prova un fallback locale
            if (!result) {
                result = await this.provaFallbackLocale(indirizzo);
            }
            
            if (result) {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                
                // Verifica che le coordinate siano valide
                if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                    this.map.setView([lat, lon], 16);
                    this.posizionaMarker({lat: lat, lng: lon});
                    
                    document.getElementById('status-geocoding').textContent = 'Posizione trovata! Verifica e sposta se necessario.';
                    document.getElementById('status-geocoding').className = 'status success';
                    return;
                }
            }
            
            throw new Error('Nessun risultato trovato');
            
        } catch (error) {
            console.warn('Geocoding automatico fallito:', error);
            document.getElementById('status-geocoding').textContent = 'Geocoding automatico fallito. Posiziona manualmente il marker.';
            document.getElementById('status-geocoding').className = 'status warning';
            
            // Centra sulla regione più probabile in base all'indirizzo
            this.centraSuRegione(indirizzo);
        }
    }
    
    async provaNominatim(indirizzo) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=3&addressdetails=1&q=${encodeURIComponent(indirizzo)}`;
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'TALON-Geocoder/1.0'
                }
            });
            
            if (!response.ok) throw new Error('Network error');
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                return {
                    lat: data[0].lat,
                    lon: data[0].lon,
                    display_name: data[0].display_name
                };
            }
            
            return null;
        } catch (error) {
            console.warn('Nominatim fallito:', error);
            return null;
        }
    }
    
    async provaFallbackLocale(indirizzo) {
        // Database locale di città principali mondiali per fallback
        const cittaPrincipali = {
            'roma': {lat: 41.9028, lon: 12.4964},
            'milano': {lat: 45.4642, lon: 9.1900},
            'napoli': {lat: 40.8518, lon: 14.2681},
            'torino': {lat: 45.0703, lon: 7.6869},
            'firenze': {lat: 43.7696, lon: 11.2558},
            'venezia': {lat: 45.4408, lon: 12.3155},
            'bologna': {lat: 44.4949, lon: 11.3426},
            'parigi': {lat: 48.8566, lon: 2.3522},
            'london': {lat: 51.5074, lon: -0.1278},
            'londra': {lat: 51.5074, lon: -0.1278},
            'madrid': {lat: 40.4168, lon: -3.7038},
            'berlino': {lat: 52.5200, lon: 13.4050},
            'berlin': {lat: 52.5200, lon: 13.4050},
            'vienna': {lat: 48.2082, lon: 16.3738},
            'new york': {lat: 40.7128, lon: -74.0060},
            'los angeles': {lat: 34.0522, lon: -118.2437},
            'tokyo': {lat: 35.6762, lon: 139.6503},
            'sydney': {lat: -33.8688, lon: 151.2093},
            'moscow': {lat: 55.7558, lon: 37.6176},
            'mosca': {lat: 55.7558, lon: 37.6176},
            'pechino': {lat: 39.9042, lon: 116.4074},
            'beijing': {lat: 39.9042, lon: 116.4074}
        };
        
        // Cerca una corrispondenza parziale
        const indirizzoCleaned = indirizzo.toLowerCase().trim();
        
        for (const [citta, coords] of Object.entries(cittaPrincipali)) {
            if (indirizzoCleaned.includes(citta)) {
                return {
                    lat: coords.lat,
                    lon: coords.lon,
                    display_name: `${citta} (approssimativo)`
                };
            }
        }
        
        return null;
    }
    
    centraSuRegione(indirizzo) {
        const cittaItaliane = {
            'ROMA': [41.9028, 12.4964, 11],
            'MILANO': [45.4642, 9.1900, 11], 
            'NAPOLI': [40.8518, 14.2681, 11],
            'TORINO': [45.0703, 7.6869, 11],
            'PALERMO': [38.1157, 13.3615, 11],
            'FIRENZE': [43.7696, 11.2558, 11],
            'BOLOGNA': [44.4949, 11.3426, 11],
            'VENEZIA': [45.4408, 12.3155, 11],
            'GENOVA': [44.4056, 8.9463, 11],
            'BARI': [41.1171, 16.8719, 11]
        };
        
        const indirizzoUpper = indirizzo.toUpperCase();
        
        for (const [citta, [lat, lon, zoom]] of Object.entries(cittaItaliane)) {
            if (indirizzoUpper.includes(citta)) {
                this.map.setView([lat, lon], zoom);
                return;
            }
        }
        
        // Default: centro Italia
        this.map.setView([41.9, 12.5], 8);
    }
    
    posizionaMarker(latlng) {
        // Rimuovi marker esistente
        this.rimuoviMarker();
        
        // Crea nuovo marker
        this.marker = L.marker([latlng.lat, latlng.lng], {
            draggable: true,
            icon: L.icon({
                iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                shadowSize: [41, 41]
            })
        }).addTo(this.map);
        
        // Event listener per trascinamento
        this.marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            this.coordsTemporanee = {lat: pos.lat, lng: pos.lng};
            this.aggiornaCoordinate();
        });
        
        // Salva coordinate temporanee
        this.coordsTemporanee = {lat: latlng.lat, lng: latlng.lng};
        this.aggiornaCoordinate();
    }
    
    rimuoviMarker() {
        if (this.marker) {
            this.map.removeLayer(this.marker);
            this.marker = null;
        }
    }
    
    aggiornaCoordinate() {
        if (this.coordsTemporanee) {
            document.getElementById('coordinate-lat').textContent = this.coordsTemporanee.lat.toFixed(6);
            document.getElementById('coordinate-lng').textContent = this.coordsTemporanee.lng.toFixed(6);
            document.getElementById('btn-salva').disabled = false;
        } else {
            document.getElementById('coordinate-lat').textContent = '---';
            document.getElementById('coordinate-lng').textContent = '---';
            document.getElementById('btn-salva').disabled = true;
        }
    }
    
    async salvaCoordinate() {
        if (!this.coordsTemporanee || !this.enteCorrente) {
            this.mostraMessaggio('Nessuna coordinata da salvare', 'error');
            return;
        }
        
        try {
            document.getElementById('btn-salva').disabled = true;
            document.getElementById('btn-salva').textContent = 'Salvando...';
            
            const response = await fetch('/api/salva-coordinate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ente_id: this.enteCorrente.id,
                    tipo: this.enteCorrente.tipo,
                    lat: this.coordsTemporanee.lat,
                    lng: this.coordsTemporanee.lng
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.mostraMessaggio(`Coordinate salvate per ${this.enteCorrente.nome}`, 'success');
                
                // In modalità automatica, passa al prossimo ente
                if (this.modalita === 'automatica') {
                    this.indiceCorrente++;
                    setTimeout(() => {
                        this.mostraEnteCorrente();
                    }, 1500);
                } else {
                    // In modalità manuale, aggiorna la lista degli enti
                    setTimeout(() => {
                        this.caricaTuttiGliEnti();
                        this.mostraMessaggio('Coordinate aggiornate. Seleziona un altro ente se necessario.', 'info');
                    }, 1500);
                }
                
            } else {
                throw new Error(result.error || 'Errore nel salvataggio');
            }
            
        } catch (error) {
            console.error('Errore salvataggio:', error);
            this.mostraMessaggio('Errore nel salvataggio delle coordinate', 'error');
        } finally {
            document.getElementById('btn-salva').disabled = false;
            document.getElementById('btn-salva').textContent = 'Salva Coordinate';
        }
    }
    
    saltaEnte() {
        const conferma = confirm(`Saltare la geocodifica per "${this.enteCorrente.nome}"?`);
        if (conferma) {
            this.mostraMessaggio(`Saltato: ${this.enteCorrente.nome}`, 'warning');
            this.indiceCorrente++;
            setTimeout(() => {
                this.mostraEnteCorrente();
            }, 1000);
        }
    }
    
    async salvaIndirizzoAggiornato() {
        const nuovoIndirizzo = document.getElementById('input-modifica-indirizzo').value.trim();
        
        if (!nuovoIndirizzo) {
            this.mostraMessaggio('Inserisci un indirizzo valido', 'error');
            return;
        }
        
        if (nuovoIndirizzo === this.enteCorrente.indirizzo) {
            this.mostraMessaggio('L\'indirizzo non è cambiato', 'warning');
            return;
        }
        
        const conferma = confirm(`Aggiornare l'indirizzo di "${this.enteCorrente.nome}" da:\n"${this.enteCorrente.indirizzo}"\na:\n"${nuovoIndirizzo}"?`);
        
        if (!conferma) return;
        
        try {
            document.getElementById('btn-salva-indirizzo').disabled = true;
            document.getElementById('btn-salva-indirizzo').textContent = 'Salvando...';
            
            const response = await fetch('/api/aggiorna-indirizzo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ente_id: this.enteCorrente.id,
                    tipo: this.enteCorrente.tipo,
                    nuovo_indirizzo: nuovoIndirizzo
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.mostraMessaggio(`Indirizzo aggiornato per ${this.enteCorrente.nome}`, 'success');
                
                // Aggiorna l'ente corrente
                this.enteCorrente.indirizzo = nuovoIndirizzo;
                document.getElementById('ente-indirizzo').textContent = nuovoIndirizzo;
                
                // Prova nuovo geocoding automatico
                setTimeout(() => {
                    this.geocodingAutomatico(nuovoIndirizzo);
                }, 1500);
                
            } else {
                throw new Error(result.error || 'Errore nell\'aggiornamento');
            }
            
        } catch (error) {
            console.error('Errore aggiornamento indirizzo:', error);
            this.mostraMessaggio('Errore nell\'aggiornamento dell\'indirizzo', 'error');
        } finally {
            document.getElementById('btn-salva-indirizzo').disabled = false;
            document.getElementById('btn-salva-indirizzo').textContent = 'Aggiorna Indirizzo';
        }
    }
    
    precedenteEnte() {
        if (this.indiceCorrente > 0) {
            this.indiceCorrente--;
            this.mostraEnteCorrente();
        }
    }
    
    cercaIndirizzo() {
        const query = document.getElementById('input-ricerca').value.trim();
        if (!query) return;
        
        this.geocodingAutomatico(query);
    }
    
    mostraMessaggio(testo, tipo = 'info') {
        const messaggioEl = document.getElementById('messaggio-status');
        messaggioEl.textContent = testo;
        messaggioEl.className = `status ${tipo}`;
        
        // Auto-hide dopo 3 secondi per successo e warning
        if (tipo === 'success' || tipo === 'warning') {
            setTimeout(() => {
                messaggioEl.textContent = '';
                messaggioEl.className = 'status';
            }, 3000);
        }
    }
    
    aggiornaInterfaccia() {
        const haCoordinate = this.coordsTemporanee !== null;
        
        document.getElementById('btn-salva').disabled = !haCoordinate;
    }
    
    impostaEventListeners() {
        // Bottoni principali
        document.getElementById('btn-salva').addEventListener('click', () => this.salvaCoordinate());
        document.getElementById('btn-salva-indirizzo').addEventListener('click', () => this.salvaIndirizzoAggiornato());
        
        // Ricerca indirizzo
        document.getElementById('btn-cerca').addEventListener('click', () => this.cercaIndirizzo());
        document.getElementById('input-ricerca').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.cercaIndirizzo();
            }
        });
        
        // Controlli modalità
        document.querySelectorAll('input[name="modalita"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.modalita = e.target.value;
                this.cambiaModalita();
            });
        });
        
        // Caricamento ente selezionato
        document.getElementById('btn-carica-ente').addEventListener('click', () => {
            this.caricaEnteSelezionato();
        });
        
        // Bottone aiuto
        const btnHelp = document.getElementById('btn-help');
        if (btnHelp) {
            btnHelp.addEventListener('click', () => {
                this.mostraAiuto();
            });
        }
    }
    
    mostraAiuto() {
        const helpText = `
🗺️ GUIDA GEOCODING INTERATTIVO TALON

📋 MODALITÀ OPERATIVE:
• Automatica: Processa sequenzialmente gli enti senza coordinate
• Manuale: Seleziona qualsiasi ente per modificare le coordinate

🎯 COME UTILIZZARE:
1. Scegli la modalità (automatica/manuale)
2. In modalità manuale: seleziona l'ente dalla lista
3. Verifica e correggi l'indirizzo se necessario
4. Usa la ricerca per trovare la posizione
5. Clicca sulla mappa per posizionare il marker
6. Trascina il marker per aggiustamenti precisi
7. Salva le coordinate nel database

🔍 FUNZIONI RICERCA:
• Geocoding automatico basato sull'indirizzo
• Ricerca manuale per indirizzi alternativi
• Navigazione rapida (Italia, zoom marker)

💾 SALVATAGGIO:
• Coordinate salvate in formato PostGIS (SRID 4326)
• Aggiornamento automatico nel database TALON
• Feedback visivo per ogni operazione

✅ INDICATORI:
• Verde: Enti già georeferenziati
• Marker trascinabile: Posizione modificabile
• Progressivo: Stato avanzamento (modalità automatica)

🎨 SUGGERIMENTI:
• Usa il drag & drop del marker per precisione
• Verifica sempre l'indirizzo prima di salvare
• La ricerca funziona meglio con indirizzi completi
        `;
        
        alert(helpText);
    }
    
    cambiaModalita() {
        const selezioneManuale = document.getElementById('selezione-ente-manuale');
        
        if (this.modalita === 'manuale') {
            selezioneManuale.style.display = 'block';
        } else {
            selezioneManuale.style.display = 'none';
            // Ritorna alla modalità automatica
            this.mostraEnteCorrente();
        }
    }
}

// Inizializza quando la pagina è caricata
document.addEventListener('DOMContentLoaded', () => {
    window.geocodingApp = new GeocodingInterattivo();
});