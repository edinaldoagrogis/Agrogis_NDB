const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
};

const server = http.createServer((request, response) => {
    console.log(`Recebendo requisição para: ${request.url}`);
    
    let filePath = '.' + request.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code == 'ENOENT') {
                response.writeHead(404, { 'Content-Type': 'text/html' });
                response.end('404 - Arquivo não encontrado', 'utf-8');
            } else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
            }
        } else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================`);
    console.log(`🔥 SERVIDOR LOCAL INICIADO COM SUCESSO!`);
    console.log(`======================================\n`);
    
    const interfaces = os.networkInterfaces();
    let localIp = '';
    
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                localIp = alias.address;
                console.log(`👉 Link para abrir no CELULAR: http://${localIp}:${PORT}`);
            }
        }
    }
    
    if (!localIp) {
        console.log(`👉 Link para abrir no CELULAR: http://[SEU-IP-AQUI]:${PORT}`);
    }
    
    console.log(`👉 Link para abrir no PC: http://localhost:${PORT}`);
    console.log(`\nMantenha esta janela aberta enquanto estiver testando no celular!`);
});
