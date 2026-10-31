// Çalıştırma: npx tsx src/games/minesweeper/geometry.test.ts
import { cellLocalPos, cellToScreen, chunkScreenRect, panCamera, screenToCell, viewWindow, visibleRect } from './geometry';
import type { Size, View } from './geometry';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}

let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const sizes: Size[] = [{ w: 390, h: 700 }, { w: 1280, h: 720 }, { w: 320, h: 480 }];
const cells = [22, 24, 33.7, 40, 64];

let drawMatchesScreen = true;
let tapMatchesDraw = true;
let coversViewport = true;
let baseAligned = true;
let samples = 0;

for (let n = 0; n < 400; n++) {
  const size = sizes[n % sizes.length];
  const cell = cells[n % cells.length];
  // negatif, sıfır ve çok uzak koordinatlar dahil, kesirli kamera konumları
  const view: View = { x: (rnd() - 0.5) * 2_000_000, y: (rnd() - 0.5) * 2_000_000, cell };
  if (n % 7 === 0) { view.x = rnd() * 5 - 2.5; view.y = rnd() * 5 - 2.5; }
  const win = viewWindow(view, size);

  if (win.baseX % 16 !== 0 || win.baseY % 16 !== 0) baseAligned = false;
  if (win.offX < 0 || win.offX >= 16 * cell + 1e-6 || win.offY < 0 || win.offY >= 16 * cell + 1e-6) baseAligned = false;

  // Pay dahil çizilen aralık, görünüm alanını tamamen kapsamalı
  const first = cellToScreen(view, size, win.x0, win.y0);
  const last = cellToScreen(view, size, win.x1, win.y1);
  if (first.px > 0 || first.py > 0 || last.px + cell < size.w || last.py + cell < size.h) coversViewport = false;

  for (let x = win.x0; x <= win.x1; x += 3) {
    for (let y = win.y0; y <= win.y1; y += 3) {
      samples++;
      // Çizimin konumu = kapsayıcı konumu - kaydırma; bu, ekrandaki gerçek konumla aynı olmalı
      const local = cellLocalPos(win, cell, x, y);
      const drawnPx = local.left - win.offX;
      const drawnPy = local.top - win.offY;
      const screen = cellToScreen(view, size, x, y);
      if (Math.abs(drawnPx - screen.px) > 1e-3 || Math.abs(drawnPy - screen.py) > 1e-3) drawMatchesScreen = false;

      // Karenin ortasına dokunmak o kareyi vermeli
      const hit = screenToCell(view, size, drawnPx + cell / 2, drawnPy + cell / 2);
      if (hit.x !== x || hit.y !== y) tapMatchesDraw = false;
      // İç köşelere yakın dokunuşlar da aynı kareyi vermeli
      const hit2 = screenToCell(view, size, drawnPx + cell * 0.05, drawnPy + cell * 0.95);
      if (hit2.x !== x || hit2.y !== y) tapMatchesDraw = false;
    }
  }
}

check(`Çizim konumu ekrandaki gerçek konumla aynı (${samples} örnek, uzak/negatif koordinatlar dahil)`, drawMatchesScreen);
check('Karenin üstüne dokunmak tam o kareyi verir (merkez ve köşeler)', tapMatchesDraw);
check('Çizilen aralık görünüm alanını tamamen kaplar', coversViewport);
check('Taban 16\'ya hizalı, kaydırma 0..16 kare arasında', baseAligned);

// Sabit örnekler: elle hesaplanabilir
{
  const size = { w: 400, h: 800 };
  const view = { x: 0.5, y: 0.5, cell: 40 };
  check('Ekranın tam ortası (0,0) karesini verir', screenToCell(view, size, 200, 400).x === 0 && screenToCell(view, size, 200, 400).y === 0);
  const right = screenToCell(view, size, 200 + 40, 400);
  check('Bir kare sağa dokunmak (1,0) verir', right.x === 1 && right.y === 0);
  const left = screenToCell(view, size, 200 - 41, 400);
  check('Soldaki kare (-1,0) verir (negatife geçiş)', left.x === -1);
  const w = viewWindow(view, size);
  check('Orta karenin ekran konumu doğru', Math.abs(cellToScreen(view, size, 0, 0).px - 180) < 1e-9);
  check('Taban negatif tarafta da hizalı', viewWindow({ x: -20.5, y: -3.2, cell: 40 }, size).baseX === -32);
  check('Pencere değerleri sayı', Number.isFinite(w.offX) && Number.isFinite(w.x0));
}

// Bölüm dikdörtgeni ve görünen kısım
{
  const size = { w: 400, h: 800 };
  const view = { x: 0.5, y: 0.5, cell: 40 };
  const r = chunkScreenRect(view, size, 0, 0); // bölüm (0,0): kareler 0..15
  const corner = cellToScreen(view, size, 0, 0);
  check('Bölüm dikdörtgeni köşesi ilk karenin köşesiyle aynı, boyutu 16 kare', r.left === corner.px && r.top === corner.py && r.width === 640 && r.height === 640);

  const vis = visibleRect(r, size)!;
  check('Taşan bölümün görünen kısmı ekranla sınırlanır', vis.left === r.left && vis.top === r.top && vis.width === 400 - r.left && vis.height === 800 - r.top);

  const far = chunkScreenRect(view, size, 50, 50);
  check('Ekran dışındaki bölüm görünmez (null)', visibleRect(far, size) === null);
  check('Kenara sadece değen bölüm görünmez sayılır', visibleRect({ left: -100, top: 0, width: 100, height: 100 }, size) === null);

  // Rastgele: görünen kısım her zaman ekranın içinde ve bölümün içinde
  let inside = true;
  for (let n = 0; n < 500; n++) {
    const v = { x: (rnd() - 0.5) * 400, y: (rnd() - 0.5) * 400, cell: cells[n % cells.length] };
    const sz = sizes[n % sizes.length];
    const cx = Math.floor((rnd() - 0.5) * 30), cy = Math.floor((rnd() - 0.5) * 30);
    const rect = chunkScreenRect(v, sz, cx, cy);
    const vr = visibleRect(rect, sz);
    if (vr) {
      if (vr.left < 0 || vr.top < 0 || vr.left + vr.width > sz.w + 1e-9 || vr.top + vr.height > sz.h + 1e-9) inside = false;
      if (vr.left < rect.left - 1e-9 || vr.top < rect.top - 1e-9 || vr.left + vr.width > rect.left + rect.width + 1e-9) inside = false;
      // görünen kısmın ortasına dokunmak o bölümün karesini vermeli
      const hit = screenToCell(v, sz, vr.left + vr.width / 2, vr.top + vr.height / 2);
      if (hit.x >> 4 !== cx || hit.y >> 4 !== cy) inside = false;
    }
  }
  check('Görünen kısım hep ekranın ve bölümün içinde, ortası o bölüme denk gelir', inside);
}

// Sürükleme (kamera kaydırma)
{
  const start = { x: 100, y: 100, cell: 40 };
  const p = panCamera(start, -200, -120);
  check('Parmak sola/yukarı kayınca kamera sağa/aşağı gider (200px/40 = 5 kare, 120px = 3 kare)', p.x === 105 && p.y === 103);
  check('Hareket yoksa kamera yerinde kalır', panCamera(start, 0, 0).x === 100 && panCamera(start, 0, 0).y === 100);
  check('Zoom\'a göre ölçeklenir (cell 20: 200px = 10 kare)', panCamera({ x: 0, y: 0, cell: 20 }, -200, 0).x === 10);

  // Parmağın altındaki dünya noktası sürükleme boyunca aynı kalmalı (rastgele durumlar, negatif/uzak koordinatlar dahil)
  let sticks = true;
  for (let n = 0; n < 500; n++) {
    const sz = sizes[n % sizes.length];
    const v = { x: (rnd() - 0.5) * 1_000_000, y: (rnd() - 0.5) * 1_000_000, cell: cells[n % cells.length] };
    const fx = Math.floor((rnd() - 0.5) * 50) + Math.round(v.x), fy = Math.floor((rnd() - 0.5) * 50) + Math.round(v.y);
    const dx = (rnd() - 0.5) * 600, dy = (rnd() - 0.5) * 600;
    const before = cellToScreen(v, sz, fx, fy);
    const moved = { ...v, ...panCamera(v, dx, dy) };
    const after = cellToScreen(moved, sz, fx, fy);
    if (Math.abs(after.px - (before.px + dx)) > 1e-6 || Math.abs(after.py - (before.py + dy)) > 1e-6) sticks = false;
  }
  check('Sürüklerken kare, parmakla birlikte aynı miktarda hareket eder (kayma/geri atlama yok)', sticks);

  // Aynı başlangıçtan art arda hesaplananlar kendi içinde tutarlı: son konum yalnızca son dx/dy'ye bağlı
  const a = panCamera(start, -50, 0), b = panCamera(start, -200, 0);
  check('Konum her zaman sürükleme BAŞLANGICINA göre hesaplanır (ara değerlerden bağımsız)', b.x === 105 && a.x === 101.25);
}

console.log('\n' + passed + ' kontrol geçti.');
