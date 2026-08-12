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
    
    // Check persistent login
    const savedAuthLevel = localStorage.getItem('agrogis_auth_level');
    if (savedAuthLevel) {
        // Delay slightly to ensure DOM is fully ready before hiding
        setTimeout(() => grantAccess(parseInt(savedAuthLevel)), 50);
    }

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
    const btnLogoutMobile = document.getElementById('btn-logout-mobile');
    
    function handleLogout() {
        localStorage.removeItem('agrogis_auth_level');
        window.location.reload();
    }
    
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }
    if (btnLogoutMobile) {
        btnLogoutMobile.addEventListener('click', handleLogout);
    }

    function performLogin() {
        try {
            const user = inputUsername.value.trim().toUpperCase();
            const pass = inputPassword.value.trim().toUpperCase();

            // Manage saved password
            if (rememberCheckbox) {
                if (rememberCheckbox.checked) {
                    savedPasswords[user] = pass;
                } else {
                    delete savedPasswords[user];
                }
                localStorage.setItem('agrogis_saved_passwords', JSON.stringify(savedPasswords));
            }

            // Only one login for the entire app
            if (user === 'NDB_MAPA' && pass === 'NDB_MAPA') {
                grantAccess(2); // Grant admin access or single tier access
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
        } catch (e) {
            alert('Erro no login: ' + e.message + '\n' + e.stack);
        }
    }
    window.performLogin = performLogin;

    function grantAccess(level) {
        try {
            // Save persistent login
            localStorage.setItem('agrogis_auth_level', level);

            // Hide login modal smoothly
            if (loginOverlay) {
                loginOverlay.style.transition = 'opacity 0.5s ease, visibility 0.5s ease';
                loginOverlay.style.opacity = '0';
                loginOverlay.style.visibility = 'hidden';
                setTimeout(() => {
                    loginOverlay.remove();
                    // After login overlay is gone, check if we should prompt install
                    const alreadyAsked = localStorage.getItem('agrogis_install_asked');
                    if (!alreadyAsked && window._deferredInstallPrompt) {
                        showInstallModal();
                    }
                }, 600);
            }

            // Always show the container so the UI structure remains consistent
            if (pdfImporter) {
                pdfImporter.style.display = 'block';
            }

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
        } catch (e) {
            alert('Erro ao dar acesso: ' + e.message + '\n' + e.stack);
        }
    }

    function showInstallModal() {
        localStorage.setItem('agrogis_install_asked', '1');

        const modal = document.createElement('div');
        modal.id = 'install-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 99999;
            display: flex; justify-content: center; align-items: center;
            backdrop-filter: blur(8px); animation: fadeIn 0.3s ease;
        `;
        modal.innerHTML = `
            <div style="
                background: linear-gradient(145deg, #1a2a1f, #0d1a10);
                border: 1px solid rgba(46,196,182,0.3);
                border-radius: 20px;
                padding: 36px 30px;
                max-width: 320px;
                width: 90%;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(46,196,182,0.1);
                animation: slideUp 0.4s cubic-bezier(0.2,0.8,0.2,1);
            ">
                <div style="font-size: 56px; margin-bottom: 16px;">📲</div>
                <img src="app_icon_512.png" alt="NDB Mapas" style="width: 80px; height: 80px; border-radius: 18px; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                <h2 style="color: #fff; margin: 0 0 8px 0; font-size: 20px; font-weight: 700;">Instalar NDB Mapas</h2>
                <p style="color: #a8b8b0; font-size: 14px; line-height: 1.5; margin: 0 0 28px 0;">Deseja instalar o <strong style='color:#2ec4b6;'>NDB Mapas</strong> no seu celular? Ele vai funcionar como um app nativo, sem precisar abrir o navegador!</p>
                <button id="btn-install-confirm" style="
                    width: 100%; padding: 14px;
                    background: linear-gradient(90deg, #2ec4b6, #1a9e93);
                    color: #fff; font-weight: 700; border: none;
                    border-radius: 10px; cursor: pointer;
                    font-size: 15px; margin-bottom: 10px;
                    letter-spacing: 0.5px;
                ">✅ Sim, Instalar Agora</button>
                <button id="btn-install-dismiss" style="
                    width: 100%; padding: 12px;
                    background: transparent;
                    color: #a8b8b0; border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 10px; cursor: pointer; font-size: 13px;
                ">Agora não</button>
            </div>
            <style>
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(40px) scale(0.95); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            </style>
        `;

        document.body.appendChild(modal);

        document.getElementById('btn-install-confirm').addEventListener('click', async () => {
            modal.remove();
            if (window._deferredInstallPrompt) {
                window._deferredInstallPrompt.prompt();
                await window._deferredInstallPrompt.userChoice;
                window._deferredInstallPrompt = null;
            }
        });

        document.getElementById('btn-install-dismiss').addEventListener('click', () => {
            modal.remove();
        });
    }
});
