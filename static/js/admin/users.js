/**
 * ========================================
 * TALON - USERS MANAGEMENT
 * File: static/js/admin/users.js
 * ========================================
 */

(function(window, document) {
    'use strict';

    // Global variables
    let currentUserId = null;
    let isEditMode = false;
    let dropdownData = null;

    // Variables for table functionality
    let currentSortColumn = -1;
    let currentSortDirection = 'asc';

    // Initialize when DOM is ready
    function initialize() {
        if (typeof window.usersManagementInitialized !== 'undefined') {
            return; // Already initialized
        }

        // Load dropdown data on page load
        loadDropdownData();
        
        // Setup save button handler
        const saveBtn = document.getElementById('saveUserBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveUser);
        }
        
        // Setup email domain validation
        const usernameField = document.getElementById('username');
        if (usernameField) {
            usernameField.addEventListener('blur', validateEmailDomain);
        }
        
        // Listen for custom event from sidebar
        document.addEventListener('openCreateUserModal', function() {
            if (window.showCreateUserModal) {
                window.showCreateUserModal();
            }
        });

        // Set initial result count
        updateResultCount();
        
        // Add event listeners for real-time filtering
        const searchFilter = document.getElementById('searchFilter');
        if (searchFilter) {
            searchFilter.addEventListener('input', filterTable);
        }

        window.usersManagementInitialized = true;
    }

    // Validate email domain
    function validateEmailDomain() {
        const emailInput = document.getElementById('username');
        if (!emailInput) return;
        
        const email = emailInput.value.toLowerCase().trim();
        
        if (email) {
            // Regex che corrisponde a quella del backend
            const emailRegex = /^[a-zA-Z0-9][a-zA-Z0-9._%-]*@esercito\.difesa\.it$/;
            
            if (!emailRegex.test(email)) {
                emailInput.setCustomValidity('Email non valida: deve iniziare con lettera/numero e terminare con @esercito.difesa.it');
                emailInput.classList.add('is-invalid');
                emailInput.classList.remove('is-valid');
            } else {
                emailInput.setCustomValidity('');
                emailInput.classList.remove('is-invalid');
                emailInput.classList.add('is-valid');
            }
        } else {
            emailInput.setCustomValidity('');
            emailInput.classList.remove('is-invalid', 'is-valid');
        }
        
        emailInput.reportValidity();
    }

    // Load dropdown data
    async function loadDropdownData() {
        try {
            // Loading dropdown data...
            const response = await fetch('/api/dropdown-data');
            const data = await response.json();
            
            // Dropdown data response received
            if (data.success) {
                // Roles loaded
                // Enti militari loaded
                dropdownData = data;
                populateDropdowns();
            } else {
                // Dropdown data error
                return;
            }
        } catch (error) {
            // Error loading dropdown data
        }
    }

    // Populate dropdown fields
    function populateDropdowns() {
        if (!dropdownData) return;

        // Populate roles
        const roleSelect = document.getElementById('ruolo_id');
        if (roleSelect && dropdownData.roles) {
            roleSelect.innerHTML = '<option value="">Seleziona ruolo...</option>';
            dropdownData.roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role.id;
                option.textContent = `${role.nome} (Livello ${role.livello_accesso})`;
                roleSelect.appendChild(option);
            });
        }

        // Populate enti militari  
        const enteSelect = document.getElementById('ente_militare_id');
        if (enteSelect && dropdownData.enti_militari) {
            enteSelect.innerHTML = '<option value="">Nessun ente...</option>';
            dropdownData.enti_militari.forEach(ente => {
                const option = document.createElement('option');
                option.value = ente.id;
                option.textContent = ente.nome + (ente.codice ? ` (${ente.codice})` : '');
                enteSelect.appendChild(option);
            });
        }
    }

    // Define globally accessible functions
    window.showCreateUserModal = function() {
        isEditMode = false;
        currentUserId = null;
        
        // Reset form
        const userForm = document.getElementById('userForm');
        if (userForm) {
            userForm.reset();
        }
        
        const attivoField = document.getElementById('attivo');
        if (attivoField) {
            attivoField.checked = true;
        }
        
        // Clear email field and validation
        const emailInput = document.getElementById('username');
        if (emailInput) {
            emailInput.value = '';
            emailInput.setCustomValidity('');
            emailInput.classList.remove('is-invalid', 'is-valid');
        }
        
        // Reset password field and visibility icon
        const passwordField = document.getElementById('passwordModal');
        if (passwordField) {
            passwordField.type = 'password';
        }
        
        const passwordIcon = document.getElementById('passwordToggleIconModal');
        if (passwordIcon) {
            passwordIcon.className = 'fas fa-eye-slash';
        }
        
        // Update modal title and button
        const modalTitle = document.getElementById('userModalLabel');
        if (modalTitle) {
            modalTitle.textContent = 'Aggiungi Nuovo Utente';
        }
        
        const saveBtn = document.getElementById('saveUserBtn');
        if (saveBtn) {
            saveBtn.textContent = 'Crea Utente';
        }
        
        // Show modal
        const modal = document.getElementById('userModal');
        if (modal && window.bootstrap) {
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    };

    window.showUserDetails = async function(userId) {
        try {
            const response = await fetch(`/api/users/${userId}`);
            const data = await response.json();
            
            if (data.error) {
                showToast(data.error, 'error');
                return;
            }
            
            const user = data.user;
            
            // Populate modal with user details
            const modalBody = document.querySelector('#userDetailsModal .modal-body');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Nome:</strong> ${user.nome || 'N/D'}</p>
                            <p><strong>Cognome:</strong> ${user.cognome || 'N/D'}</p>
                            <p><strong>Email:</strong> ${user.username || 'N/D'}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Ruolo:</strong> ${user.ruolo || 'N/D'}</p>
                            <p><strong>Ente:</strong> ${user.ente_nome || 'N/D'}</p>
                            <p><strong>Stato:</strong> <span class="badge bg-${user.attivo ? 'success' : 'secondary'}">${user.attivo ? 'Attivo' : 'Disattivo'}</span></p>
                        </div>
                    </div>
                    <div class="row mt-3">
                        <div class="col-12">
                            <p><strong>Creato il:</strong> ${user.created_at ? new Date(user.created_at).toLocaleString('it-IT') : 'N/D'}</p>
                            <p><strong>Ultimo aggiornamento:</strong> ${user.updated_at ? new Date(user.updated_at).toLocaleString('it-IT') : 'N/D'}</p>
                        </div>
                    </div>
                `;
            }
            
            // Show modal
            const modal = document.getElementById('userDetailsModal');
            if (modal && window.bootstrap) {
                const bsModal = new bootstrap.Modal(modal);
                bsModal.show();
            }
            
        } catch (error) {
            // Error loading user details
            showToast('Errore nel caricamento dei dettagli utente', 'error');
        }
    };

    window.editUser = async function(userId) {
        isEditMode = true;
        currentUserId = userId;
        
        try {
            const response = await fetch(`/api/users/${userId}`);
            const data = await response.json();
            
            if (data.error) {
                showToast(data.error, 'error');
                return;
            }
            
            const user = data.user;
            
            // Populate form fields
            const fields = {
                'nome': user.nome,
                'cognome': user.cognome,
                'username': user.username,
                'ruolo': user.ruolo_id,
                'ente_id': user.ente_id,
                'attivo': user.attivo
            };
            
            Object.entries(fields).forEach(([fieldId, value]) => {
                const field = document.getElementById(fieldId);
                if (field) {
                    if (field.type === 'checkbox') {
                        field.checked = value;
                    } else {
                        field.value = value || '';
                    }
                }
            });
            
            // Hide password field for editing
            const passwordField = document.getElementById('passwordModal');
            if (passwordField) {
                passwordField.removeAttribute('required');
                passwordField.placeholder = 'Lascia vuoto per mantenere la password attuale';
            }
            
            // Update modal title and button
            const modalTitle = document.getElementById('userModalLabel');
            if (modalTitle) {
                modalTitle.textContent = 'Modifica Utente';
            }
            
            const saveBtn = document.getElementById('saveUserBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Aggiorna Utente';
            }
            
            // Show modal
            const modal = document.getElementById('userModal');
            if (modal && window.bootstrap) {
                const bsModal = new bootstrap.Modal(modal);
                bsModal.show();
            }
            
        } catch (error) {
            // Error loading user data
            showToast('Errore nel caricamento dei dati utente', 'error');
        }
    };

    // Save user (create or update)
    async function saveUser() {
        const form = document.getElementById('userForm');
        if (!form) return;
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const userData = {
            nome: formData.get('nome'),
            cognome: formData.get('cognome'),
            username: formData.get('username'),
            password: formData.get('password'),
            ruolo: formData.get('ruolo'),
            ente_id: formData.get('ente_id'),
            attivo: formData.has('attivo')
        };

        // Form data being sent
        
        try {
            const url = isEditMode ? `/api/users/${currentUserId}` : '/api/users';
            const method = isEditMode ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (data.success) {
                showToast(data.message, 'success');
                
                // Hide modal
                const modal = document.getElementById('userModal');
                if (modal && window.bootstrap) {
                    const bsModal = bootstrap.Modal.getInstance(modal);
                    if (bsModal) {
                        bsModal.hide();
                    }
                }
                
                // Reload page to show updated data
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                showToast(data.error || 'Errore durante il salvataggio', 'error');
            }
        } catch (error) {
            // Error saving user
            showToast('Errore di connessione', 'error');
        }
    }

    window.toggleUserStatus = async function(userId, currentStatus) {
        const action = currentStatus ? 'disattivare' : 'attivare';
        
        if (!confirm(`Sei sicuro di voler ${action} questo utente?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/users/${userId}/toggle`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(data.message, 'success');
                // Reload page to show updated status
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                showToast(data.error || 'Errore durante l\'operazione', 'error');
            }
        } catch (error) {
            // Error toggling user status
            showToast('Errore di connessione', 'error');
        }
    };

    // Show toast notification
    function showToast(message, type = 'info') {
        // Create toast element if it doesn't exist
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }

        const toastId = 'toast-' + Date.now();
        const bgClass = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-danger' : 'bg-info';
        
        const toastHtml = `
            <div id="${toastId}" class="toast ${bgClass} text-white" role="alert">
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;
        
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        const toastElement = document.getElementById(toastId);
        if (toastElement && window.bootstrap) {
            const toast = new bootstrap.Toast(toastElement);
            toast.show();
            
            // Remove toast after it's hidden
            toastElement.addEventListener('hidden.bs.toast', function() {
                toastElement.remove();
            });
        }
    }

    // Toggle password visibility
    function togglePasswordVisibility(inputId, iconId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        
        if (!input || !icon) return;
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye-slash';
        }
    }

    // Toggle disabled users visibility
    window.toggleDisabledUsers = function() {
        const showDisabled = document.getElementById('showDisabledUsers');
        if (!showDisabled) return;
        
        const isChecked = showDisabled.checked;
        const disabledRows = document.querySelectorAll('.disabled-user');
        
        disabledRows.forEach(row => {
            row.style.display = isChecked ? '' : 'none';
        });
        
        updateResultCount();
    };

    // Filter table based on search criteria
    function filterTable() {
        const searchFilter = document.getElementById('searchFilter');
        if (!searchFilter) return;
        
        const searchText = searchFilter.value.toLowerCase();
        const table = document.querySelector('.table tbody');
        if (!table) return;
        
        const rows = table.querySelectorAll('tr');
        let visibleCount = 0;
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let rowText = '';
            
            // Combine text from all cells
            cells.forEach(cell => {
                rowText += cell.textContent.toLowerCase() + ' ';
            });
            
            if (rowText.includes(searchText)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });
        
        updateResultCount(visibleCount);
    }

    // Clear all filters
    function clearFilters() {
        const searchFilter = document.getElementById('searchFilter');
        if (searchFilter) {
            searchFilter.value = '';
        }
        
        const showDisabled = document.getElementById('showDisabledUsers');
        if (showDisabled) {
            showDisabled.checked = false;
        }
        
        filterTable();
        if (window.toggleDisabledUsers) {
            window.toggleDisabledUsers();
        }
    }

    // Update result count display
    function updateResultCount(count = null) {
        const resultCount = document.getElementById('resultCount');
        if (!resultCount) return;
        
        if (count === null) {
            const table = document.querySelector('.table tbody');
            if (table) {
                const visibleRows = table.querySelectorAll('tr:not([style*="display: none"])');
                count = visibleRows.length;
            } else {
                count = 0;
            }
        }
        
        resultCount.textContent = `${count} utenti`;
    }

    // Global functions for password toggle
    window.togglePasswordVisibility = togglePasswordVisibility;

    // Force initialization function to be globally available immediately
    window.initializeUsersManagement = initialize;

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM is already ready
        setTimeout(initialize, 100);
    }

    // Initialize on page navigation
    document.addEventListener('talon:content-loaded', initialize);
    
    // Force initialization every time this script runs
    setTimeout(() => {
        if (window.location.pathname.includes('utenti')) {
            initialize();
        }
    }, 50);
    

})(window, document);