import webview
import subprocess
import os
import sys
import psutil

class Api:
    def __init__(self):
        self.server_process = None

    def start_server(self):
        if self.server_process is None:
            print("[Desktop App] Iniciando servidor FastAPI em segundo plano...")
            # We need to start the backend/main.py
            # Get the path to backend/main.py relative to this script
            base_path = os.path.dirname(os.path.abspath(__file__))
            backend_script = os.path.join(base_path, "backend", "main.py")
            
            # Start the process in the background. Use python executable.
            # Creation flags to hide the console window (Windows only)
            CREATE_NO_WINDOW = 0x08000000
            
            try:
                self.server_process = subprocess.Popen(
                    [sys.executable, backend_script],
                    cwd=os.path.join(base_path, "backend"),
                    creationflags=CREATE_NO_WINDOW
                )
                print(f"[Desktop App] Servidor iniciado (PID: {self.server_process.pid})")
                return {"status": "success", "message": "Servidor iniciado"}
            except Exception as e:
                print(f"[Desktop App] Erro ao iniciar servidor: {e}")
                return {"status": "error", "message": str(e)}
        else:
            print("[Desktop App] Servidor já está rodando.")
            return {"status": "success", "message": "Servidor já está rodando"}

    def stop_server(self):
        if self.server_process is not None:
            print(f"[Desktop App] Encerrando servidor (PID: {self.server_process.pid})...")
            try:
                # Use psutil to kill the process and all its children to be safe
                parent = psutil.Process(self.server_process.pid)
                for child in parent.children(recursive=True):
                    child.kill()
                parent.kill()
                self.server_process = None
                print("[Desktop App] Servidor encerrado com sucesso.")
                return {"status": "success", "message": "Servidor encerrado"}
            except Exception as e:
                print(f"[Desktop App] Erro ao encerrar servidor: {e}")
                # Fallback to normal terminate
                try:
                    self.server_process.terminate()
                    self.server_process = None
                except:
                    pass
                return {"status": "error", "message": str(e)}
        return {"status": "success", "message": "Nenhum servidor rodando"}

if __name__ == '__main__':
    api = Api()
    
    # Resolves path to index.html
    base_path = os.path.dirname(os.path.abspath(__file__))
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
    
    # Start the app
    # window.on_closing is used to make sure the server shuts down when the user closes the app
    def on_closing():
        api.stop_server()
        
    window.events.closing += on_closing
    
    webview.start()
