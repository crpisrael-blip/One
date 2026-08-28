// שרת סטטי מינימלי להרצת האתר הסטטי של אורטק (ללא תלות ב-npm).
// שימוש: node .claude/skills/run-ortrack/serve.mjs [root] [port]  ואז לפתוח בדפדפן.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT = process.argv[2] || process.cwd();
const portArg = Number(process.argv[3]);
const PORT = Number.isInteger(portArg) && portArg > 0 ? portArg : 8765;
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.map':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
};
const server = createServer(async (req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400); res.end('bad url'); return; }
  if (p === '/') p = '/index.html';
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`❌ פורט ${PORT} תפוס. הרץ עם פורט אחר.`);
  else console.error('❌ שגיאת שרת:', e.message);
  process.exit(1);
});
server.listen(PORT, () => console.log(`מגיש ${ROOT} על http://localhost:${PORT}`));
