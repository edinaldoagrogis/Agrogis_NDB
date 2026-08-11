Set WshShell = CreateObject("WScript.Shell")
strPath = WScript.ScriptFullName
Set objFSO = CreateObject("Scripting.FileSystemObject")
strFolder = objFSO.GetParentFolderName(strPath)

' 1. Inicia o servidor backend oculto (0) na pasta backend
WshShell.Run "cmd /c cd /d """ & strFolder & "\backend"" && iniciar_api.bat", 0, False

' 2. Aguarda 2 segundos pro servidor subir
WScript.Sleep 2000

' 3. Abre o arquivo index.html no navegador padrão
WshShell.Run "cmd /c start """" """ & strFolder & "\index.html""", 0, False
