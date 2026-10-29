// Çalıştırma: npx tsx src/games/minesweeper/world.test.ts
import {
  CHUNK, FLAGGED, HIDDEN, MAX_FLOOD, REVEALED, SAFE_RADIUS,
  cellCount, cellHash, cellState, chord, createWorld, exportWorld, importWorld,
  isMine, neighborMines, reveal, toggleFlag,
} from './world';
import type { Difficulty, World } from './world';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}

// 1) Mayın yoğunluğu istenen orana yakın olmalı (hepsi için)
for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
  const w = createWorld(12345, diff);
  let mines = 0;
  const N = 400;
  for (let y = -N / 2; y < N / 2; y++) for (let x = -N / 2; x < N / 2; x++) if (isMine(w, x, y)) mines++;
  const ratio = mines / (N * N);
  check(`Yoğunluk ${diff}: ${(ratio * 100).toFixed(2)}% ≈ ${(w.density * 100).toFixed(0)}%`, Math.abs(ratio - w.density) < 0.005);
}

// 2) Komşu kareler birbirinden bağımsız olmalı (desen/çizgi oluşmasın)
{
  const w = createWorld(777, 'normal');
  const N = 400;
  let pairH = 0, pairV = 0, pairD = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const m = isMine(w, x, y);
      if (m && isMine(w, x + 1, y)) pairH++;
      if (m && isMine(w, x, y + 1)) pairV++;
      if (m && isMine(w, x + 1, y + 1)) pairD++;
    }
  }
  const expected = w.density * w.density;
  const tol = 0.003;
  check('Yatay komşular bağımsız', Math.abs(pairH / (N * N) - expected) < tol);
  check('Dikey komşular bağımsız', Math.abs(pairV / (N * N) - expected) < tol);
  check('Çapraz komşular bağımsız', Math.abs(pairD / (N * N) - expected) < tol);
}

// 3) Deterministik: aynı tohum aynı dünya, farklı tohum farklı dünya
{
  const a = createWorld(42, 'normal');
  const b = createWorld(42, 'normal');
  const c = createWorld(43, 'normal');
  let same = true, diff = 0;
  for (let y = -50; y < 50; y++) for (let x = -50; x < 50; x++) {
    if (isMine(a, x, y) !== isMine(b, x, y)) same = false;
    if (isMine(a, x, y) !== isMine(c, x, y)) diff++;
  }
  check('Aynı tohum aynı mayınları üretir', same);
  check('Farklı tohum farklı dünya üretir', diff > 500);
  check('Karma 32 bit aralığında', cellHash(1, -5, 9) >= 0 && cellHash(1, -5, 9) < 4294967296);
}

// 4) İlk açılış güvenli: 5x5 alanda mayın yok, tıklanan kare 0, çevresi açılır
for (const [sx, sy] of [[0, 0], [5, -7], [-100, 250], [-1, -1]] as [number, number][]) {
  const w = createWorld(2024, 'hard');
  const r = reveal(w, sx, sy);
  let noMines = true;
  for (let dy = -SAFE_RADIUS; dy <= SAFE_RADIUS; dy++) for (let dx = -SAFE_RADIUS; dx <= SAFE_RADIUS; dx++) {
    if (isMine(w, sx + dx, sy + dy)) noMines = false;
  }
  check(`İlk açılış (${sx},${sy}): güvenli alan mayınsız`, r.kind === 'safe' && noMines);
  check(`İlk açılış (${sx},${sy}): tıklanan kare 0 ve en az 25 kare açıldı`, cellCount(w, sx, sy) === 0 && r.opened >= 25 && w.revealed === r.opened);
}

// 5) Sayılar elle sayımla aynı olmalı
{
  const w = createWorld(99, 'normal');
  reveal(w, 3, 3);
  let ok = true, checkedCount = 0;
  for (let y = -30; y < 30; y++) for (let x = -30; x < 30; x++) {
    if (cellState(w, x, y) !== REVEALED) continue;
    let manual = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && isMine(w, x + dx, y + dy)) manual++;
    }
    if (manual !== cellCount(w, x, y) || manual !== neighborMines(w, x, y)) ok = false;
    if (isMine(w, x, y)) ok = false; // açık kare asla mayın olmamalı
    checkedCount++;
  }
  check(`Açık karelerin sayıları doğru (${checkedCount} kare), hiçbiri mayın değil`, ok && checkedCount > 25);
}

// 6) Zincirleme açılma tutarlı: açık sıfır karenin tüm komşuları açık (sınır aşılmadıysa)
{
  const w = createWorld(31337, 'easy');
  const r = reveal(w, 0, 0);
  let closed = true;
  if (r.opened < MAX_FLOOD) {
    for (let y = -80; y < 80; y++) for (let x = -80; x < 80; x++) {
      if (cellState(w, x, y) === REVEALED && cellCount(w, x, y) === 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (cellState(w, x + dx, y + dy) !== REVEALED) closed = false;
        }
      }
    }
  }
  check(`Zincirleme açılma kapalı bir bölge bırakıyor (${r.opened} kare)`, closed);
  check('Zincirleme açılma sınırı aşmıyor', r.opened <= MAX_FLOOD + 9);
}

// 7) Mayına basma
{
  const w = createWorld(555, 'hard');
  reveal(w, 0, 0);
  let mx = 0, my = 0, found = false;
  for (let y = 5; y < 60 && !found; y++) for (let x = 5; x < 60 && !found; x++) {
    if (isMine(w, x, y) && cellState(w, x, y) === HIDDEN) { mx = x; my = y; found = true; }
  }
  const before = w.revealed;
  const r = reveal(w, mx, my);
  check('Mayına basınca patlar', r.kind === 'mine' && w.exploded?.x === mx && w.exploded?.y === my);
  check('Patlamada skor artmaz', w.revealed === before);
  check('Patlayınca başka hamle yapılamaz', reveal(w, 1, 1).kind === 'none' && toggleFlag(w, 1, 1) === 'none');
}

// 8) Bayrak
{
  const w = createWorld(8, 'normal');
  check('Bayrak koyulur', toggleFlag(w, 10, 10) === 'flagged' && cellState(w, 10, 10) === FLAGGED && w.flags === 1);
  check('Bayraklı kare açılmaz', reveal(w, 10, 10).kind === 'none' && cellState(w, 10, 10) === FLAGGED);
  check('Bayrak kaldırılır', toggleFlag(w, 10, 10) === 'unflagged' && cellState(w, 10, 10) === HIDDEN && w.flags === 0);
  reveal(w, 0, 0);
  check('Açık kareye bayrak konmaz', toggleFlag(w, 0, 0) === 'none');
  check('Negatif koordinatta bayrak', toggleFlag(w, -17, -33) === 'flagged' && cellState(w, -17, -33) === FLAGGED);
}

// 9) Chord (açık sayıya dokunma)
{
  const w = createWorld(2718, 'normal');
  reveal(w, 0, 0);
  // kenarda, çevresinde en az bir mayın ve kapalı komşusu olan açık bir sayı bul
  let target: [number, number] | null = null;
  outer: for (let y = -40; y < 40; y++) for (let x = -40; x < 40; x++) {
    if (cellState(w, x, y) === REVEALED && cellCount(w, x, y) > 0) {
      let hiddenNonMine = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && cellState(w, x + dx, y + dy) === HIDDEN && !isMine(w, x + dx, y + dy)) hiddenNonMine++;
      }
      if (hiddenNonMine > 0) { target = [x, y]; break outer; }
    }
  }
  check('Chord testi için uygun sayı bulundu', target !== null);
  const [tx, ty] = target!;
  check('Bayrak yokken chord işlemez', chord(w, tx, ty).kind === 'none');
  // tüm mayınlı komşulara doğru bayrak koy
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && isMine(w, tx + dx, ty + dy)) toggleFlag(w, tx + dx, ty + dy);
  }
  const r = chord(w, tx, ty);
  check('Doğru bayraklarla chord kalan komşuları açar', r.kind === 'safe' && r.opened > 0 && !w.exploded);

  // yanlış bayrakla chord patlatmalı
  const w2 = createWorld(2718, 'normal');
  reveal(w2, 0, 0);
  let t2: [number, number] | null = null;
  outer2: for (let y = -40; y < 40; y++) for (let x = -40; x < 40; x++) {
    if (cellState(w2, x, y) === REVEALED && cellCount(w2, x, y) === 1) {
      let wrongSpot: [number, number] | null = null;
      let hasMine = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!(dx || dy)) continue;
        if (cellState(w2, x + dx, y + dy) !== HIDDEN) continue;
        if (isMine(w2, x + dx, y + dy)) hasMine = true;
        else if (!wrongSpot) wrongSpot = [x + dx, y + dy];
      }
      if (hasMine && wrongSpot) { t2 = [x, y]; toggleFlag(w2, wrongSpot[0], wrongSpot[1]); break outer2; }
    }
  }
  check('Yanlış bayrak senaryosu bulundu', t2 !== null);
  const r2 = chord(w2, t2![0], t2![1]);
  check('Yanlış bayrakla chord mayına bastırır', r2.kind === 'mine' && w2.exploded !== null);
}

// 10) Negatif koordinatlar ve bölüm sınırları
{
  const w = createWorld(1, 'easy');
  reveal(w, -1, -1); // bölüm (-1,-1) içinde, 4 bölümün köşesi
  check('Negatif bölümde açılış', cellState(w, -1, -1) === REVEALED && w.revealed >= 25);
  check('Bölüm sınırı iki yanında da çalışır', cellState(w, -1, 0) === REVEALED && cellState(w, 0, -1) === REVEALED && cellState(w, 0, 0) === REVEALED);
  check('Kapalı uzak kare kapalı döner', cellState(w, 100000, -100000) === HIDDEN);
  check('Bölüm boyutu 16', CHUNK === 16);
}

// 11) Kaydet / yükle: aynı dünyayı geri vermeli
{
  const w = createWorld(4242, 'normal');
  reveal(w, 7, 7);
  toggleFlag(w, 40, 40);
  toggleFlag(w, -40, 25);
  reveal(w, -60, 90);
  const data = JSON.parse(JSON.stringify(exportWorld(w))); // JSON'dan geçsin (gerçek kayıt gibi)
  const w2 = importWorld(data);
  check('Yükleme başarılı', w2 !== null);
  let same = w2!.revealed === w.revealed && w2!.flags === w.flags && w2!.seed === w.seed && w2!.density === w.density;
  for (let y = -120; y < 150 && same; y++) for (let x = -120; x < 120 && same; x++) {
    if (cellState(w, x, y) !== cellState(w2!, x, y) || cellCount(w, x, y) !== cellCount(w2!, x, y)) same = false;
  }
  check('Yüklenen dünya birebir aynı (durum, sayılar, skor, bayraklar)', same);
  check('Güvenli bölge korunuyor', w2!.safe?.x === 7 && w2!.safe?.y === 7);
  check('Bozuk veri reddedilir', importWorld({ ...data, v: 2 }) === null && importWorld({ ...data, chunks: { '0,0': 'zz' } }) === null && importWorld(null as never) === null);
  const bytes = JSON.stringify(data).length;
  check(`Kayıt boyutu makul (${bytes} bayt, ${Object.keys(data.chunks).length} bölüm)`, bytes < 20000);
}

// 12) Uzun oyun simülasyonu: çökmemeli, bütünlüğü korumalı
{
  const w: World = createWorld(909, 'normal');
  reveal(w, 0, 0);
  let steps = 0;
  let seed = 1;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  while (!w.exploded && steps < 3000) {
    const x = Math.floor((rnd() - 0.5) * 300);
    const y = Math.floor((rnd() - 0.5) * 300);
    // sadece güvenli olduğunu bildiğimiz karelere bas (mayınsızlara), oyunun akışını zorla
    if (!isMine(w, x, y)) reveal(w, x, y);
    steps++;
  }
  let consistent = true;
  let counted = 0;
  for (let y = -160; y < 160; y++) for (let x = -160; x < 160; x++) {
    if (cellState(w, x, y) === REVEALED) {
      counted++;
      if (isMine(w, x, y)) consistent = false;
    }
  }
  check(`Uzun oyun (${steps} hamle, ${w.revealed} açık kare): tutarlı`, consistent && !w.exploded && counted <= w.revealed);
}

console.log('\n' + passed + ' kontrol geçti.');
