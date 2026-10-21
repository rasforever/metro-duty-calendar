import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{const u=new URL(req.url,'http://localhost'),p=decodeURIComponent(u.pathname),target=path.resolve(root,'.'+(p.endsWith('/')?p+'index.html':p));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4173'));
