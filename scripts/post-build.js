// Web derlemesinden sonra çalışır: dist/ içindeki dosyaları tarayıp servis çalışanını (sw.js) üretir.
// Kullanım: npm run build:web
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) {
  console.error('dist/ bulunamadı. Önce `npx expo export --platform web` çalıştırın.');
  process.exit(1);
}

const SKIP = new Set(['sw.js', '_sitemap.html', '+not-found.html', '404.html', '.nojekyll']);

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push(rel);
  }
  return out;
}


// ---- HTML'e PWA etiketlerini ekle (manifest, ikon, tema rengi, "yükle" isteğini yakalayan betik) ----
// Not: Bu Expo sürümünde özel bir +html.tsx kullanmak stil dosyasını çıktıdan düşürdüğü için
// etiketler burada, derleme sonrasında ekleniyor.
const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
const base = ((appJson.expo && appJson.expo.experiments && appJson.expo.experiments.baseUrl) || '').replace(/\/$/, '');

const HEAD_MARKER = '<!--pwa-->';
const headSnippet = [
  HEAD_MARKER,
  `<link rel="manifest" href="${base}/manifest.json"/>`,
  `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png"/>`,
  '<meta name="theme-color" content="#111111"/>',
  '<meta name="description" content="Tetris, Mayın Tarlası ve daha fazlası tek uygulamada."/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-title" content="Oyun Merkezi"/>',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black"/>',
  '<style>body{background-color:#111}</style>',
  // Tarayıcının "yükle" isteği React açılmadan önce gelebilir; burada yakalanır.
  "<script>window.__installPrompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;});</script>",
].join('');

let injected = 0;
for (const f of walk(dist).filter((f) => f.endsWith('.html'))) {
  const full = path.join(dist, f);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes(HEAD_MARKER) || !html.includes('</head>')) continue;
  html = html.replace('</head>', headSnippet + '</head>');
  html = html.replace(/<title>[^<]*<\/title>/, '<title>Oyun Merkezi</title>');
  if (!/<title>/.test(html)) html = html.replace('</head>', '<title>Oyun Merkezi</title></head>');
  html = html.replace('<html lang="en"', '<html lang="tr"');
  fs.writeFileSync(full, html);
  injected++;
}
console.log(`PWA etiketleri ${injected} HTML dosyasına eklendi (base: "${base || '/'}")`);

const files = walk(dist)
  .filter((f) => !SKIP.has(f) && !f.includes('[') && !f.split('/').some((part) => part.startsWith('.')))
  .sort();

// Sayfaları .html olmadan, kapsam köküne göre göreli adreslerle önbelleğe al
const urls = new Set(['']);
for (const f of files) {
  if (f === 'index.html') continue;
  urls.add(encodeURI(f.endsWith('.html') ? f.slice(0, -5) : f));
}
const list = [...urls].sort();

const hash = crypto.createHash('sha1');
for (const f of files) {
  hash.update(f);
  if (f.endsWith('.html') || f.endsWith('.json')) hash.update(fs.readFileSync(path.join(dist, f)));
}
const version = hash.digest('hex').slice(0, 10);

const template = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8');
const sw = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(list, null, 2));
fs.writeFileSync(path.join(dist, 'sw.js'), sw);
console.log(`sw.js yazıldı: ${list.length} dosya önbelleğe alınacak (sürüm ${version})`);
