document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('login-overlay');
    const btnLogin = document.getElementById('btn-login');
    const inputUsername = document.getElementById('login-username');
    const inputPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const pdfImporter = document.getElementById('pdf-importer-container');
    const rememberCheckbox = document.getElementById('login-save-password');

    // Load saved passwords from localStorage (Custom Password Manager)
    let savedPasswords = JSON.parse(localStorage.getItem('agrogis_saved_passwords') || '{}');

    // Auto-fill password on load if username is already selected and saved
    if (savedPasswords[inputUsername.value]) {
        inputPassword.value = savedPasswords[inputUsername.value];
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }

    // Auto-fill password when user changes dropdown
    inputUsername.addEventListener('change', () => {
        if (savedPasswords[inputUsername.value]) {
            inputPassword.value = savedPasswords[inputUsername.value];
            if (rememberCheckbox) rememberCheckbox.checked = true;
        } else {
            inputPassword.value = '';
            if (rememberCheckbox) rememberCheckbox.checked = false;
        }
    });

    // Removing automatic bypass: Always ask for password!
    // The browser's native password manager will auto-fill credentials instead.
    // Add some focus effects to inputs
    [inputUsername, inputPassword].forEach(input => {
        input.addEventListener('focus', () => {
            input.style.borderColor = '#e85d04';
        });
        input.addEventListener('blur', () => {
            input.style.borderColor = 'rgba(255,255,255,0.1)';
        });
        input.addEventListener('keypress', (e) => {
            // Enter key naturally submits the form now, so no custom handler needed here
        });
    });

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent page reload
            performLogin();
        });
    }

    const togglePassword = document.getElementById('toggle-password');
    if (togglePassword) {
        togglePassword.addEventListener('click', () => {
            if (inputPassword.type === 'password') {
                inputPassword.type = 'text';
                togglePassword.textContent = '🔒';
            } else {
                inputPassword.type = 'password';
                togglePassword.textContent = '👁';
            }
        });
    }

    // Logout logic
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            window.location.reload();
        });
    }

    function performLogin() {
        const user = inputUsername.value.trim();
        const pass = inputPassword.value.trim();

        // Manage saved password
        if (rememberCheckbox) {
            if (rememberCheckbox.checked) {
                savedPasswords[user] = pass;
            } else {
                delete savedPasswords[user];
            }
            localStorage.setItem('agrogis_saved_passwords', JSON.stringify(savedPasswords));
        }

        // Nível 1: Apenas Visualizar
        if (user === 'AGROGIS_NDB' && pass === 'AGROGIS_NDB') {
            grantAccess(1);
        }
        // Nível 2: Administrador (Importar Programação)
        else if (user === 'AGROGIS_NDB_ADM' && pass === 'AGROGIS_NDB_ADM') {
            grantAccess(2);
        }
        else {
            loginError.style.display = 'block';
            inputUsername.style.borderColor = '#ff4d4d';
            inputPassword.style.borderColor = '#ff4d4d';
            
            // Add shake animation
            const container = document.querySelector('.login-container');
            container.style.transition = 'transform 0.1s';
            container.style.transform = 'translateX(-10px)';
            setTimeout(() => container.style.transform = 'translateX(10px)', 50);
            setTimeout(() => container.style.transform = 'translateX(-10px)', 100);
            setTimeout(() => container.style.transform = 'translateX(10px)', 150);
            setTimeout(() => container.style.transform = 'translateX(0)', 200);
        }
    }

    function grantAccess(level) {

        // Hide login modal smoothly
        if (loginOverlay) {
            loginOverlay.style.transition = 'opacity 0.5s ease, visibility 0.5s ease';
            loginOverlay.style.opacity = '0';
            loginOverlay.style.visibility = 'hidden';
            setTimeout(() => loginOverlay.remove(), 500);
        }

        // Always show the container so the UI structure remains consistent
        pdfImporter.style.display = 'block';

        const btnImport = document.getElementById('btn-import-pdf');
        
        if (level === 2) {
            // Nível 2 can use the import button
            if (btnImport) {
                btnImport.disabled = false;
                btnImport.style.opacity = '1';
                btnImport.style.cursor = 'pointer';
                btnImport.title = "Importar PDF de programação";
            }
        } else {
            // Nível 1 sees the button but it is blocked
            if (btnImport) {
                btnImport.disabled = true;
                btnImport.style.opacity = '0.4';
                btnImport.style.cursor = 'not-allowed';
                btnImport.title = "Apenas nível Operacional/Admin pode importar programação";
                
                // Prevent click on the file input if triggered manually
                btnImport.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, true);
            }
        }
    }
});
