import webview
import os
import sys
import threading
import uvicorn

# Helper for PyInstaller _MEIPASS
def get_base_path():
    if hasattr(sys, '_MEIPASS'):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

base_path = get_base_path()

# Import the FastAPI backend
from backend.main import app as fastapi_app

class Api:
    def __init__(self):
        self.server_thread = None
        self.server = None

    def _run_uvicorn(self):
        # Starts the uvicorn server inside the thread
        config = uvicorn.Config(fastapi_app, host="0.0.0.0", port=8000, log_level="warning")
        self.server = uvicorn.Server(config)
        self.server.run()

    def start_server(self):
        if self.server_thread is None or not self.server_thread.is_alive():
            print("[Desktop App] Iniciando servidor FastAPI em thread...")
            self.server_thread = threading.Thread(target=self._run_uvicorn, daemon=True)
            self.server_thread.start()
            return {"status": "success", "message": "Servidor iniciado"}
        return {"status": "success", "message": "Servidor já está rodando"}

    def stop_server(self):
        if self.server is not None:
            print("[Desktop App] Encerrando servidor FastAPI...")
            self.server.should_exit = True
            self.server = None
            return {"status": "success", "message": "Servidor encerrado"}
        return {"status": "success", "message": "Nenhum servidor rodando"}

if __name__ == '__main__':
    api = Api()
    
    html_file = os.path.join(base_path, "index.html")
    
    # Create the webview window
    window = webview.create_window(
        'GeoPortal NDB - Holding Agrícola', 
        url=f'file:///{html_file.replace(chr(92), "/")}', 
        js_api=api,
        width=1280,
        height=800,
        min_size=(1024, 600)
    )
    
    # Ensure server shuts down when app closes
    def on_closing():
        api.stop_server()
        
    window.events.closing += on_closing
    
    webview.start()
