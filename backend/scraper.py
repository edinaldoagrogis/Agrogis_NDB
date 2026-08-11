import time
import os
import json
from selenium import webdriver
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.edge.options import Options as EdgeOptions
from webdriver_manager.microsoft import EdgeChromiumDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class DJISmartFarmScraper:
    def __init__(self, headless=False):
        self.headless = headless
        self.options = EdgeOptions()
        if headless:
            self.options.add_argument("--headless")
        self.options.add_argument("--no-sandbox")
        self.options.add_argument("--disable-dev-shm-usage")
        self.options.add_argument("--window-size=1920,1080")
        
        # Perfil persistente
        profile_path = os.path.join(os.getcwd(), "edge_profile")
        self.options.add_argument(f"user-data-dir={profile_path}")
        
        self.options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.18")
        
        self.driver = None

    def _init_driver(self):
        try:
            self.driver = webdriver.Edge(service=EdgeService(EdgeChromiumDriverManager().install()), options=self.options)
        except Exception as e:
            print(f"Erro ao inicializar o EdgeDriver: {e}")
            raise e

    def get_shared_fields(self, email, password):
        """
        Abre o navegador visível para o usuário logar manualmente,
        aguarda 60 segundos, e suga o localStorage para pegarmos a API key.
        """
        import json
        
        print(f"[RPA] MODO HACKER: O navegador vai abrir agora.")
        print(f"[RPA] POR FAVOR, LOGUE NA SUA CONTA E ABRA A TELA DO MAPA COMPARTILHADO.")
        self._init_driver()
        
        try:
            # 💉 INJETANDO O VÍRUS DE INTERCEPTAÇÃO ANTES DA PÁGINA CARREGAR
            interceptor_js = """
                var interceptedData = [];
                // 1. Interceptar XMLHttpRequest (AJAX Clássico)
                var originalOpen = window.XMLHttpRequest.prototype.open;
                var originalSend = window.XMLHttpRequest.prototype.send;
                window.XMLHttpRequest.prototype.open = function(method, url) {
                    this._url = url;
                    originalOpen.apply(this, arguments);
                };
                window.XMLHttpRequest.prototype.send = function() {
                    this.addEventListener('load', function() {
                        try {
                            var text = this.responseText;
                            if (text && (text.includes("coordinates") || text.includes("polygon") || text.includes("area_ha"))) {
                                interceptedData.push({url: this._url, data: text});
                                window.localStorage.setItem('dji_intercepted_data', JSON.stringify(interceptedData));
                            }
                        } catch(e) {}
                    });
                    originalSend.apply(this, arguments);
                };
                
                // 2. Interceptar API Fetch Moderna
                var originalFetch = window.fetch;
                window.fetch = async function() {
                    var url = arguments[0];
                    var response = await originalFetch.apply(this, arguments);
                    var clone = response.clone();
                    clone.text().then(text => {
                        if (text && (text.includes("coordinates") || text.includes("polygon") || text.includes("area_ha"))) {
                            interceptedData.push({url: url, data: text});
                            window.localStorage.setItem('dji_intercepted_data', JSON.stringify(interceptedData));
                        }
                    }).catch(e => {});
                    return response;
                };
            """
            
            try:
                self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': interceptor_js})
            except Exception as cdp_e:
                print(f"[RPA] Aviso: CDP Injection não suportado, tentando injetar manualmente. ({cdp_e})")

            # 🌐 ACESSAR O SITE DA DJI
            self.driver.get("https://www.djiag.com/login")
            
            print("[RPA] Aguardando o mapa carregar na tela (máximo 120 segundos)...")
            intercepted_geojson = None
            
            # Limpar o cache antigo, caso exista
            self.driver.execute_script("window.localStorage.removeItem('dji_intercepted_data');")
            
            for i in range(120):
                time.sleep(1)
                try:
                    data_str = self.driver.execute_script("return window.localStorage.getItem('dji_intercepted_data');")
                    if data_str:
                        items = json.loads(data_str)
                        if len(items) > 0:
                            intercepted_geojson = json.loads(items[0]['data'])
                            print(f"[RPA] SUCESSO! Coordenadas capturadas em {i+1} segundos!")
                            break
                except:
                    pass
            
            if intercepted_geojson:
                import uuid
                from datetime import datetime
                
                # Gerar ID único para o mapa
                map_id = f"dji_{uuid.uuid4().hex[:8]}"
                now_str = datetime.now().strftime('%Y-%m-%d %H:%M')
                
                new_map = {
                    "id": map_id,
                    "name": f"Talhão DJI ({now_str})",
                    "area_ha": 0.0, # Pode ser calculado depois
                    "date": now_str,
                    "geojson": intercepted_geojson
                }
                
                # Ler mapas existentes
                maps_file = "dji_saved_maps.json"
                saved_maps = []
                if os.path.exists(maps_file):
                    try:
                        with open(maps_file, "r", encoding="utf-8") as f:
                            saved_maps = json.load(f)
                    except:
                        pass
                
                # Adicionar novo mapa
                saved_maps.append(new_map)
                
                # Salvar arquivo atualizado
                with open(maps_file, "w", encoding="utf-8") as f:
                    json.dump(saved_maps, f, ensure_ascii=False, indent=4)
                    
                print(f"[RPA] Arquivo de mapa DJI salvo com ID {map_id}. O navegador será fechado agora.")
                return [new_map]
            else:
                raise Exception("Nenhum mapa foi interceptado a tempo. Verifique se você fez o login e abriu o mapa.")
            
        except Exception as e:
            print(f"[RPA] Erro durante a extração: {e}")
            raise e
        finally:
            if self.driver:
                self.driver.quit()

if __name__ == "__main__":
    # Teste rápido local
    scraper = DJISmartFarmScraper(headless=False)
    scraper.get_shared_fields("geoportal.ndb@gmail.com", "senha")
