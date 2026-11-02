import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const resource = relative(root,path);
    if (!path.startsWith(root + sep) || !['index.html','sw.js','manifest.webmanifest'].includes(resource) && !resource.startsWith('src' + sep) && !resource.startsWith('public' + sep)) {
      res.writeHead(404); return res.end('Not found');
    }
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}); res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT || 5173),'0.0.0.0',()=>console.log('Taskly listening on port ' + (process.env.PORT || 5173)));
