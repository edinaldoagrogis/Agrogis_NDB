document.addEventListener('DOMContentLoaded', () => {
    // --- APP INFO MODAL LOGIC ---
    const btnInfoApp = document.getElementById('btn-info-app');
    if (btnInfoApp) {
        btnInfoApp.addEventListener('click', () => {
            // Close the mobile dropdown if open
            const mobileDropdown = document.getElementById('mobile-menu-dropdown');
            if (mobileDropdown) mobileDropdown.style.display = 'none';

            const modal = document.createElement('div');
            modal.id = 'info-app-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 99999;
                display: flex; justify-content: center; align-items: center;
                backdrop-filter: blur(8px); animation: fadeIn 0.3s ease;
            `;
            
            let versionText = "v1_00000000";
            if (typeof APP_VERSION !== 'undefined') {
                versionText = APP_VERSION;
            }

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
                    <img src="app_icon_512.png" alt="NDB Mapas" style="width: 80px; height: 80px; border-radius: 18px; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                    <h2 style="color: #fff; margin: 0 0 20px 0; font-size: 20px; font-weight: 700;">Descrição do aplicativo</h2>
                    
                    <div style="text-align: left; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 10px; margin-bottom: 25px; border: 1px solid rgba(255,255,255,0.05);">
                        <p style="color: #a8b8b0; font-size: 14px; margin: 0 0 10px 0;"><strong>Nome:</strong> <span style="color: #fff;">NDB Mapas</span></p>
                        <p style="color: #a8b8b0; font-size: 14px; margin: 0 0 10px 0;"><strong>Autor:</strong> <span style="color: #fff;">Agrogis</span></p>
                        <p style="color: #a8b8b0; font-size: 14px; margin: 0;"><strong>Atualização:</strong> <span style="color: #2ec4b6;">${versionText}</span></p>
                    </div>
                    
                    <button id="btn-info-close" style="
                        width: 100%; padding: 12px;
                        background: transparent;
                        color: #a8b8b0; border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 10px; cursor: pointer; font-size: 14px; transition: background 0.2s;
                    " onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">Fechar</button>
                </div>
                <style>
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(40px) scale(0.95); }
                        to   { opacity: 1; transform: translateY(0) scale(1); }
                    }
                </style>
            `;

            document.body.appendChild(modal);

            document.getElementById('btn-info-close').addEventListener('click', () => {
                modal.remove();
            });
            
            // Clicar fora para fechar
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        });
    }
});
