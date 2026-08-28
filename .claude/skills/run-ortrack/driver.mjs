// driver יחיד לאורטק: מגיש את האתר הסטטי וצולם דף נתון עם Chrome/Edge headless.
// שימוש:  node .claude/skills/run-ortrack/driver.mjs [page] [outPng] [port]
//   page   ברירת מחדל index.html  (אפשר גם patient.html / request.html / landing.html)
//   outPng ברירת מחדל _shot.png   (בתיקיית הסקיל)
// הדפים הציבוריים (request/patient/landing) נטענים דרך anon; index הוא מסך הכניסה.
import { createServer } from 'node:http';
import { readFile, stat, rm } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, '..', '..', '..');           // שורש הפרויקט (ortrack)
const page = process.argv[2] || 'index.html';
const outPng = resolve(process.argv[3] ? process.argv[3] : join(SKILL_DIR, '_shot.png'));
const portArg = Number(process.argv[4]);
const PORT = Number.isInteger(portArg) && portArg > 0 ? portArg : 8765;

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  // Linux / סביבת ענן (Playwright Chromium)
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].filter(Boolean);
const browser = BROWSERS.find(existsSync);
if (!browser) { console.error('לא נמצא Chrome/Edge — התקן אחד מהם'); process.exit(1); }

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.map':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
};
const server = createServer(async (req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); }   // כתובת פגומה לא מפילה את השרת
  catch { res.writeHead(400); res.end('bad url'); return; }
  if (p === '/') p = '/index.html';
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
});

server.on('error', (e) => {                                  // EADDRINUSE וכו' → הודעה נקייה, לא קריסה
  if (e.code === 'EADDRINUSE') console.error(`❌ פורט ${PORT} תפוס (שרת קודם עדיין רץ). הרץ עם פורט אחר.`);
  else console.error('❌ שגיאת שרת:', e.message);
  process.exit(1);
});

await rm(outPng, { force: true });                           // מוחקים ישן → קיום אחרי = צילום טרי בלבד
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/${page}`;
  console.log(`מגיש: ${ROOT}\nמצלם: ${url}`);
  const args = ['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
    '--window-size=1280,900','--virtual-time-budget=9000',`--screenshot=${outPng}`, url];
  const ch = spawn(browser, args, { stdio: 'ignore' });
  const watchdog = setTimeout(() => {                        // דפדפן תקוע → לא נתקע לנצח
    console.error('❌ הדפדפן תקוע (timeout)'); try { ch.kill(); } catch {} server.close(); process.exit(1);
  }, 30000);
  ch.on('error', (e) => {                                    // כשל בהפעלת הדפדפן → ניקוי ויציאה
    clearTimeout(watchdog); server.close(); console.error('❌ כשל בהפעלת הדפדפן:', e.message); process.exit(1);
  });
  ch.on('exit', async (code) => {
    clearTimeout(watchdog); server.close();
    try {
      const s = await stat(outPng);                          // קיים = נכתב עכשיו (מחקנו קודם)
      console.log(`✅ צילום: ${outPng} (${Math.round(s.size / 1024)}KB)`);
      process.exit(0);
    } catch {
      console.error(`❌ הצילום לא נוצר (קוד יציאה ${code})`);
      process.exit(1);
    }
  });
});
