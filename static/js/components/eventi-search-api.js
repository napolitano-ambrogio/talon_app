/**
 * ========================================
 * TALON - Eventi Search API
 * File: static/js/components/eventi-search-api.js
 * 
 * Versione: 1.0.0
 * Descrizione: Gestione ricerca eventi e API calls
 * Dependencies: eventi-modal-manager.js
 * ========================================
 */

class EventiSearchAPI {
    constructor() {
        this.modalManager = null;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        // Riferimento al modal manager
        this.modalManager = window.eventiModalManager;
        this.setupGlobalFunctions();
    }

    setupGlobalFunctions() {
        // Esporta funzioni globali per compatibilità template
        window.cercaEventi = () => this.cercaEventi();
        window.toggleSeguitoEvento = (eventoId) => this.toggleSeguitoEvento(eventoId);
        window.confermaSeguitiSelezionati = () => this.confermaSeguitiSelezionati();
        window.rimuoviSeguitoSelezionato = (eventoId) => this.rimuoviSeguitoSelezionato(eventoId);
        window.rimuoviSeguitoDaLista = (index) => this.rimuoviSeguitoDaLista(index);
    }

    async cercaEventi() {
        const protocollo = document.getElementById('search-protocollo')?.value.trim().toUpperCase();
        const data = document.getElementById('search-data')?.value;
        
        if (!protocollo && !data) {
            alert('Inserire almeno un criterio di ricerca (Protocollo o Data)');
            return;
        }
        
        try {
            const params = new URLSearchParams();
            if (protocollo) params.append('protocollo', protocollo);
            if (data) params.append('data', data);
            
            const response = await fetch(`/eventi/api/cerca-seguiti?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const risultati = await response.json();
            
            // Salva risultati per riferimento
            if (this.modalManager) {
                this.modalManager.setUltimiRisultati(risultati);
            }
            window.ultimiRisultatiRicerca = risultati;
            
            this.mostraRisultatiRicerca(risultati);
            
        } catch (error) {
            console.error('[SEARCH] Errore durante la ricerca:', error);
            this.mostraErroreRicerca(error.message);
        }
    }

    mostraRisultatiRicerca(risultati) {
        const container = document.getElementById('risultati-ricerca');
        if (!container) return;
        
        if (!risultati || risultati.length === 0) {
            container.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-search"></i> Nessun evento trovato con i criteri specificati
                </div>`;
            return;
        }
        
        const seguitiSelezionati = this.modalManager ? 
            this.modalManager.getSeguitiSelezionati() : [];
        
        let html = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i> Trovati ${risultati.length} eventi
            </div>
            <div class="table-responsive">
                <table class="table table-hover table-sm">
                    <thead class="table-primary">
                        <tr>
                            <th width="50px">Azione</th>
                            <th>ID</th>
                            <th>Protocollo</th>
                            <th>Data Msg</th>
                            <th>Ente</th>
                            <th>Carattere</th>
                            <th>Tipo</th>
                            <th>Dettagli</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        risultati.forEach(evento => {
            const isSelezionato = seguitiSelezionati.some(s => s.id === evento.id);
            const buttonClass = isSelezionato ? 'btn-warning' : 'btn-outline-primary';
            const buttonIcon = isSelezionato ? 'fa-check' : 'fa-plus';
            const buttonText = isSelezionato ? 'Selezionato' : 'Seleziona';
            
            html += `
                <tr class="${isSelezionato ? 'table-warning' : ''}">
                    <td>
                        <button type="button" class="btn ${buttonClass} btn-sm" 
                                onclick="toggleSeguitoEvento(${evento.id})" 
                                id="btn-seguito-${evento.id}">
                            <i class="fas ${buttonIcon}"></i>
                        </button>
                    </td>
                    <td><strong>#${evento.id}</strong></td>
                    <td><code>${evento.prot_msg_evento || 'N/D'}</code></td>
                    <td>${evento.data_msg_evento ? new Date(evento.data_msg_evento).toLocaleDateString('it-IT') : 'N/D'}</td>
                    <td><small>${evento.ente_nome || 'N/D'}</small></td>
                    <td><span class="badge ${evento.carattere === 'positivo' ? 'bg-success' : 'bg-danger'}">${evento.carattere ? evento.carattere.toUpperCase() : 'N/D'}</span></td>
                    <td><span class="badge bg-secondary">${evento.tipo_evento ? evento.tipo_evento.replace('tipo_', 'TIPO ').toUpperCase() : 'N/D'}</span></td>
                    <td><small>${evento.dettagli_evento ? evento.dettagli_evento.substring(0, 50) + (evento.dettagli_evento.length > 50 ? '...' : '') : 'N/D'}</small></td>
                </tr>`;
        });
        
        html += `
                    </tbody>
                </table>
            </div>`;
        
        container.innerHTML = html;
    }

    mostraErroreRicerca(message) {
        const container = document.getElementById('risultati-ricerca');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> Errore durante la ricerca: ${message}
                </div>`;
        }
    }

    toggleSeguitoEvento(eventoId) {
        if (!this.modalManager) {
            console.error('[SEARCH] Modal manager non disponibile');
            return;
        }
        
        const seguitiSelezionati = this.modalManager.getSeguitiSelezionati();
        const index = seguitiSelezionati.findIndex(s => s.id === eventoId);
        
        if (index === -1) {
            // Aggiungi evento
            const row = document.querySelector(`#btn-seguito-${eventoId}`)?.closest('tr');
            if (row) {
                const cells = row.querySelectorAll('td');
                const evento = {
                    id: eventoId,
                    protocollo: cells[2]?.textContent.trim() || '',
                    data_msg: cells[3]?.textContent.trim() || '',
                    ente_nome: cells[4]?.textContent.trim() || '',
                    carattere: cells[5]?.textContent.trim() || '',
                    tipo_evento: cells[6]?.textContent.trim() || '',
                    dettagli: cells[7]?.textContent.trim() || ''
                };
                
                seguitiSelezionati.push(evento);
            }
        } else {
            // Rimuovi evento
            seguitiSelezionati.splice(index, 1);
        }
        
        this.modalManager.setSeguitiSelezionati(seguitiSelezionati);
        this.aggiornaUISeguitiSelezionati();
        
        // Ricarica risultati per aggiornare UI
        const ultimiRisultati = this.modalManager.getUltimiRisultati();
        if (ultimiRisultati.length > 0) {
            this.mostraRisultatiRicerca(ultimiRisultati);
        }
    }

    aggiornaUISeguitiSelezionati() {
        const container = document.getElementById('lista-seguiti-modal');
        const section = document.getElementById('seguiti-selezionati');
        
        const seguitiSelezionati = this.modalManager ? 
            this.modalManager.getSeguitiSelezionati() : [];
        
        if (seguitiSelezionati.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }
        
        if (section) section.style.display = 'block';
        
        if (container) {
            let html = '';
            seguitiSelezionati.forEach(evento => {
                html += `
                    <div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-white rounded border">
                        <div>
                            <strong>#${evento.id}</strong> - ${evento.protocollo} 
                            <span class="text-muted">(${evento.data_msg})</span>
                            <br><small>${evento.ente_nome}</small>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger" 
                                onclick="rimuoviSeguitoSelezionato(${evento.id})"
                                title="Rimuovi">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>`;
            });
            
            container.innerHTML = html;
        }
    }

    rimuoviSeguitoSelezionato(eventoId) {
        if (!this.modalManager) return;
        
        const seguitiSelezionati = this.modalManager.getSeguitiSelezionati();
        const index = seguitiSelezionati.findIndex(s => s.id === eventoId);
        
        if (index !== -1) {
            seguitiSelezionati.splice(index, 1);
            this.modalManager.setSeguitiSelezionati(seguitiSelezionati);
            this.aggiornaUISeguitiSelezionati();
        }
    }

    confermaSeguitiSelezionati() {
        if (!this.modalManager) return;
        
        const seguitiSelezionati = this.modalManager.getSeguitiSelezionati();
        const seguitiData = {
            seguiti_eventi: seguitiSelezionati.map(s => ({
                evento_id: s.id,
                protocollo: s.protocollo,
                data_msg_evento: s.data_msg,
                note: `Collegato a evento #${s.id}`
            }))
        };
        
        const hiddenInput = document.getElementById('seguiti_eventi');
        if (hiddenInput) {
            hiddenInput.value = JSON.stringify(seguitiData);
        }
        
        this.aggiornaListaSeguiti();
        this.modalManager.chiudiModal();
        
        // Reset seguiti selezionati
        this.modalManager.clearSeguitiSelezionati();
        const section = document.getElementById('seguiti-selezionati');
        if (section) section.style.display = 'none';
    }

    aggiornaListaSeguiti() {
        const hiddenInput = document.getElementById('seguiti_eventi');
        if (!hiddenInput) return;
        
        const data = JSON.parse(hiddenInput.value || '{}');
        const container = document.getElementById('seguiti-container');
        const section = document.getElementById('lista-seguiti');
        
        if (!data.seguiti_eventi || data.seguiti_eventi.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }
        
        if (section) section.style.display = 'block';
        
        if (container) {
            let html = '';
            data.seguiti_eventi.forEach((seguito, index) => {
                html += `
                    <div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-white rounded border">
                        <div>
                            <strong>Evento #${seguito.evento_id}</strong> - ${seguito.protocollo}
                            <br><small class="text-muted">${seguito.note}</small>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger" 
                                onclick="rimuoviSeguitoDaLista(${index})"
                                title="Rimuovi collegamento">
                            <i class="fas fa-unlink"></i>
                        </button>
                    </div>`;
            });
            
            container.innerHTML = html;
        }
    }

    rimuoviSeguitoDaLista(index) {
        const hiddenInput = document.getElementById('seguiti_eventi');
        if (!hiddenInput) return;
        
        const data = JSON.parse(hiddenInput.value || '{}');
        if (data.seguiti_eventi && data.seguiti_eventi[index]) {
            data.seguiti_eventi.splice(index, 1);
            hiddenInput.value = JSON.stringify(data);
            this.aggiornaListaSeguiti();
        }
    }
}

// Inizializzazione automatica
window.eventiSearchAPI = new EventiSearchAPI();

// Export per utilizzo modulare
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventiSearchAPI;
}