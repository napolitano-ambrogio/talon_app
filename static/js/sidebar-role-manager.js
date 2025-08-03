// sidebar-role-manager.js
// Script per gestire la visibilità degli elementi sidebar in base al ruolo

document.addEventListener('DOMContentLoaded', function() {
    // Ottieni il ruolo dell'utente dalla sessione (passato dal template)
    const userRole = getUserRoleFromSession();
    
    // Configurazione ruoli e livelli di accesso
    const ROLE_LEVELS = {
        'ADMIN': 100,
        'OPERATORE': 50,
        'VISUALIZZATORE': 10
    };
    
    // Funzione per ottenere il ruolo utente
    function getUserRoleFromSession() {
        // Il ruolo può essere passato in diversi modi dal template
        // Opzione 1: Da un elemento hidden
        const roleElement = document.getElementById('user-role-data');
        if (roleElement) {
            return roleElement.value || roleElement.textContent;
        }
        
        // Opzione 2: Da un data attribute del body
        const bodyRole = document.body.getAttribute('data-user-role');
        if (bodyRole) {
            return bodyRole;
        }
        
        // Opzione 3: Dal badge ruolo nella sidebar
        const roleBadge = document.querySelector('.user-role-badge');
        if (roleBadge) {
            return roleBadge.textContent.trim();
        }
        
        // Fallback
        return 'VISUALIZZATORE';
    }
    
    // Funzione per nascondere elementi basato sui requisiti di ruolo
    function applyRoleBasedVisibility() {
        const currentUserLevel = ROLE_LEVELS[userRole] || 0;
        
        // Gestisci elementi con data-min-role
        document.querySelectorAll('[data-min-role]').forEach(element => {
            const requiredRole = element.getAttribute('data-min-role');
            const requiredLevel = ROLE_LEVELS[requiredRole] || 100;
            
            if (currentUserLevel < requiredLevel) {
                element.style.display = 'none';
                element.setAttribute('aria-hidden', 'true');
            } else {
                element.style.display = '';
                element.removeAttribute('aria-hidden');
            }
        });
        
        // Gestisci elementi solo admin
        document.querySelectorAll('[data-admin-only]').forEach(element => {
            if (userRole !== 'ADMIN') {
                element.style.display = 'none';
                element.setAttribute('aria-hidden', 'true');
            } else {
                element.style.display = '';
                element.removeAttribute('aria-hidden');
            }
        });
        
        // Gestisci elementi che richiedono permessi di modifica
        document.querySelectorAll('[data-requires-edit]').forEach(element => {
            if (!canUserEdit()) {
                element.style.display = 'none';
                element.setAttribute('aria-hidden', 'true');
            }
        });
        
        // Gestisci elementi che richiedono permessi di eliminazione
        document.querySelectorAll('[data-requires-delete]').forEach(element => {
            if (!canUserDelete()) {
                element.style.display = 'none';
                element.setAttribute('aria-hidden', 'true');
            }
        });
    }
    
    // Funzioni di controllo permessi
    function canUserEdit() {
        return userRole === 'ADMIN' || userRole === 'OPERATORE';
    }
    
    function canUserDelete() {
        return userRole === 'ADMIN';
    }
    
    function canUserCreate() {
        return userRole === 'ADMIN' || userRole === 'OPERATORE';
    }
    
    // Funzione per aggiungere indicatori visivi del ruolo
    function addRoleIndicators() {
        // Aggiungi classe CSS basata sul ruolo al body
        document.body.classList.add(`role-${userRole.toLowerCase()}`);
        
        // Aggiungi tooltip ai menu item basato sui permessi
        document.querySelectorAll('.sidebar li a').forEach(link => {
            const menuItem = link.closest('li');
            const minRole = menuItem.getAttribute('data-min-role');
            
            if (minRole && ROLE_LEVELS[userRole] < ROLE_LEVELS[minRole]) {
                link.setAttribute('title', `Richiede ruolo: ${minRole}`);
                link.classList.add('disabled-menu-item');
            }
        });
    }
    
    // Funzione per gestire click su elementi disabilitati
    function handleDisabledClicks() {
        document.addEventListener('click', function(e) {
            const target = e.target.closest('[data-requires-permission]');
            if (target) {
                const requiredPermission = target.getAttribute('data-requires-permission');
                
                let hasPermission = false;
                switch(requiredPermission) {
                    case 'edit':
                        hasPermission = canUserEdit();
                        break;
                    case 'delete':
                        hasPermission = canUserDelete();
                        break;
                    case 'create':
                        hasPermission = canUserCreate();
                        break;
                    case 'admin':
                        hasPermission = userRole === 'ADMIN';
                        break;
                }
                
                if (!hasPermission) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Mostra messaggio di errore
                    showPermissionError(requiredPermission);
                }
            }
        });
    }
    
    // Funzione per mostrare errori di permesso
    function showPermissionError(requiredPermission) {
        const messages = {
            'edit': 'Non hai i permessi per modificare questo elemento.',
            'delete': 'Solo gli amministratori possono eliminare elementi.',
            'create': 'Non hai i permessi per creare nuovi elementi.',
            'admin': 'Questa funzione è riservata agli amministratori.'
        };
        
        const message = messages[requiredPermission] || 'Permessi insufficienti.';
        
        // Se hai un sistema di notifiche, usalo
        if (window.showAlert) {
            window.showAlert(message, 'warning');
        } else {
            alert(message);
        }
    }
    
    // Funzione per aggiornare contatori e statistiche
    function updateRoleStats() {
        // Conta elementi visibili vs nascosti
        const totalMenuItems = document.querySelectorAll('.sidebar li[data-menu-id]').length;
        const visibleMenuItems = document.querySelectorAll('.sidebar li[data-menu-id]:not([aria-hidden="true"])').length;
        
        console.log(`Ruolo: ${userRole}`);
        console.log(`Menu visibili: ${visibleMenuItems}/${totalMenuItems}`);
        
        // Aggiorna un eventuale elemento di debug
        const debugInfo = document.getElementById('role-debug-info');
        if (debugInfo) {
            debugInfo.innerHTML = `
                <strong>Ruolo:</strong> ${userRole}<br>
                <strong>Livello:</strong> ${ROLE_LEVELS[userRole]}<br>
                <strong>Menu accessibili:</strong> ${visibleMenuItems}/${totalMenuItems}<br>
                <strong>Può modificare:</strong> ${canUserEdit() ? 'Sì' : 'No'}<br>
                <strong>Può eliminare:</strong> ${canUserDelete() ? 'Sì' : 'No'}
            `;
        }
    }
    
    // Inizializzazione
    console.log('🔐 Inizializzazione sistema ruoli sidebar');
    console.log(`👤 Ruolo utente rilevato: ${userRole}`);
    
    applyRoleBasedVisibility();
    addRoleIndicators();
    handleDisabledClicks();
    updateRoleStats();
    
    // Esporta funzioni globali per uso in altri script
    window.TalonRoleManager = {
        userRole: userRole,
        canEdit: canUserEdit,
        canDelete: canUserDelete,
        canCreate: canUserCreate,
        refreshVisibility: applyRoleBasedVisibility
    };
    
    console.log('✅ Sistema ruoli sidebar inizializzato');
});