// Çalıştırma: npx tsx src/games/chess/layout.test.ts
// Ekran boyutuna göre yerleşim: dikey/yatay seçimi, tahtanın sığması, ölçek sınırları.
import { HEADER_HEIGHT, MAX_BOARD_LANDSCAPE, MAX_BOARD_PORTRAIT, MIN_BOARD, SIDE_MAX, SIDE_MIN, computeLayout } from './layout';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}

const phone = computeLayout(390, 844, { top: 47, bottom: 34, left: 0, right: 0 });
check('Telefon dikey: dikey düzen, tahta genişliğe sığar', phone.mode === 'portrait' && phone.boardSize <= 390 - 24 && phone.boardSize >= MIN_BOARD && phone.sideWidth === 0);
check('Telefon dikey: ölçek 1 civarı', phone.scale > 0.9 && phone.scale < 1.05);

const small = computeLayout(320, 568);
check('Küçük telefon (320x568): tahta en az MIN_BOARD, ölçek alt sınırda ya da üstünde', small.mode === 'portrait' && small.boardSize >= MIN_BOARD && small.boardSize <= 320 - 24 && small.scale >= 0.85);

const phoneSide = computeLayout(844, 390, { top: 0, bottom: 21, left: 47, right: 47 });
const availW = 844 - 94;
const availH = 390 - 21 - HEADER_HEIGHT;
check('Telefon yan: yatay düzen', phoneSide.mode === 'landscape');
check('Telefon yan: tahta yüksekliğe sığar', phoneSide.boardSize <= availH - 16 && phoneSide.boardSize >= MIN_BOARD);
check('Telefon yan: tahta + panel genişliğe sığar, panel en az SIDE_MIN', phoneSide.sideWidth >= SIDE_MIN && phoneSide.boardSize + phoneSide.sideWidth + 36 <= availW);

const tabletPortrait = computeLayout(820, 1180);
check('Tablet dikey: dikey düzen, büyük tahta ve büyük ölçek', tabletPortrait.mode === 'portrait' && tabletPortrait.boardSize > 600 && tabletPortrait.boardSize <= MAX_BOARD_PORTRAIT && tabletPortrait.scale > 1.2);

const tabletLand = computeLayout(1180, 820);
check('Tablet yan: yatay düzen, tahta çok büyük olmaz', tabletLand.mode === 'landscape' && tabletLand.boardSize <= MAX_BOARD_LANDSCAPE && tabletLand.boardSize > 600);

const desktop = computeLayout(1920, 1080);
check('Geniş bilgisayar ekranı: tahta üst sınırı aşmaz, panel üst sınırı aşmaz', desktop.mode === 'landscape' && desktop.boardSize <= MAX_BOARD_LANDSCAPE && desktop.sideWidth <= SIDE_MAX && desktop.scale <= 1.35);

const square = computeLayout(700, 700);
check('Kareye yakın pencere: dikey düzen', square.mode === 'portrait');

check('Kare pencerede kenar boşlukları korunur', square.boardSize <= 700 - 24);

// Tarama: hiçbir ekranda tahta ekrandan taşmamalı; ölçek her zaman sınırlar içinde
{
  let ok = true;
  let scaleOk = true;
  for (let w = 280; w <= 2200; w += 40) {
    for (let h = 400; h <= 1600; h += 40) {
      const l = computeLayout(w, h);
      const aw = w;
      const ah = h - HEADER_HEIGHT;
      if (l.scale < 0.85 || l.scale > 1.35) scaleOk = false;
      if (l.boardSize < MIN_BOARD && aw >= MIN_BOARD + 24 && ah >= MIN_BOARD) ok = false;
      if (l.mode === 'portrait' && aw - 24 >= MIN_BOARD && l.boardSize > aw - 24) ok = false;
      if (l.mode === 'landscape' && (l.boardSize > ah - 16 || l.boardSize + l.sideWidth + 36 > aw)) ok = false;
    }
  }
  check('Tarama (280-2200 x 400-1600): tahta hiçbir boyutta taşmaz', ok);
  check('Tarama: ölçek her zaman 0.85-1.35 arasında', scaleOk);
}

check('Çok küçük ya da sıfır boyutta bile çökmez', (() => { const l = computeLayout(0, 0); return l.boardSize >= MIN_BOARD && Number.isFinite(l.scale); })());

console.log(`\n${passed} test geçti`);
