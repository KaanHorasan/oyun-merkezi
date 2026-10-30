// Çalıştırma: npx tsx src/games/minesweeper/world.test.ts
import {
  CELLS_PER_COIN, CHUNK, FLAGGED, HIDDEN, MAX_FLOOD, REPAIR_BASE_COST, REVEALED, SAFE_RADIUS,
  cellCount, cellHash, cellState, chord, chunkKey, coinsDue, createWorld, exportWorld, importWorld,
  isLockedAt, isLockedChunk, isMine, markCoinsGranted, neighborMines, repairCost, repairSection, reveal, toggleFlag,
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

// 7) Mayına basma: oyun BİTMEZ, yalnızca o bölüm kilitlenir
{
  const w = createWorld(555, 'hard');
  reveal(w, 0, 0);
  let mx = 0, my = 0, found = false;
  for (let y = 5; y < 60 && !found; y++) for (let x = 5; x < 60 && !found; x++) {
    if (isMine(w, x, y) && cellState(w, x, y) === HIDDEN) { mx = x; my = y; found = true; }
  }
  const before = w.revealed;
  const r = reveal(w, mx, my);
  const cx = mx >> 4, cy = my >> 4;
  check('Mayına basınca o bölüm patlar ve kilitlenir', r.kind === 'mine' && r.hit?.x === mx && r.hit?.y === my && isLockedChunk(w, cx, cy));
  check('Patlama sayacı artar, skor artmaz', w.explosions === 1 && w.revealed === before);
  check('Kilitli bölümde açma ve bayrak çalışmaz', reveal(w, mx, my).kind === 'none' && toggleFlag(w, mx, my) === 'none' && isLockedAt(w, cx * 16 + 3, cy * 16 + 3));
  // başka bir bölümde oyun devam eder
  let other: [number, number] | null = null;
  for (let y = -80; y < -20 && !other; y++) for (let x = -80; x < -20 && !other; x++) {
    if (!isMine(w, x, y) && cellState(w, x, y) === HIDDEN && !isLockedAt(w, x, y)) other = [x, y];
  }
  const r2 = reveal(w, other![0], other![1]);
  check('Başka bölümde oyun devam eder', r2.kind === 'safe' && r2.opened > 0);
}

// 7b) Zincirleme açılma kilitli bölüme girmez
{
  const w = createWorld(31337, 'easy');
  w.locked.set(chunkKey(0, -1), { x: 5, y: -5 }); // x 0..15, y -16..-1 kilitli
  const r = reveal(w, -3, -3);
  let leaked = false;
  for (let y = -16; y <= -1; y++) for (let x = 0; x <= 15; x++) if (cellState(w, x, y) !== HIDDEN) leaked = true;
  check(`Açılma kilitli bölgeye sızmaz (${r.opened} kare açıldı)`, r.kind === 'safe' && r.opened >= 25 && !leaked);
}

// 7c) Kilitli bölüm dondurulur: her kareye her hamle denense bile hiçbir şey değişmez
{
  const w = createWorld(2468, 'normal');
  reveal(w, 50, 50); // bölüm (3,3) ve çevresinde açık kareler
  const cx = 3, cy = 3;
  w.locked.set(chunkKey(cx, cy), { x: 48, y: 48 });
  const snap = () => {
    const out: string[] = [];
    for (let y = cy * 16; y < cy * 16 + 16; y++) for (let x = cx * 16; x < cx * 16 + 16; x++) out.push(cellState(w, x, y) + ':' + cellCount(w, x, y));
    return out.join(',');
  };
  const before = snap();
  const flagsBefore = w.flags, revealedBefore = w.revealed;
  let allNone = true;
  for (let y = cy * 16; y < cy * 16 + 16; y++) for (let x = cx * 16; x < cx * 16 + 16; x++) {
    if (reveal(w, x, y).kind !== 'none') allNone = false;
    if (toggleFlag(w, x, y) !== 'none') allNone = false;
    if (chord(w, x, y).kind !== 'none') allNone = false;
  }
  check('Kilitli bölümde hiçbir hamle işlemez', allNone);
  check('Kilitli bölümün durumu aynen korunur (açık kareler ve sayılar dahil)', snap() === before && w.flags === flagsBefore && w.revealed === revealedBefore);
  // dışarıdan komşu açık sayıdan chord yapılsa bile içeriye sızmamalı
  let leaked = false;
  for (let y = cy * 16 - 1; y <= cy * 16 + 16; y++) for (let x = cx * 16 - 1; x <= cx * 16 + 16; x++) {
    const inside = x >= cx * 16 && x < cx * 16 + 16 && y >= cy * 16 && y < cy * 16 + 16;
    if (!inside && cellState(w, x, y) === REVEALED) chord(w, x, y);
  }
  if (snap() !== before) leaked = true;
  check('Dışarıdaki sayılara dokunmak kilitli bölüme sızmaz', !leaked);
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
  check('Doğru bayraklarla chord kalan komşuları açar', r.kind === 'safe' && r.opened > 0 && w.locked.size === 0);

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
  check('Yanlış bayrakla chord bir bölümü patlatır (oyun bitmez)', r2.kind === 'mine' && w2.locked.size >= 1 && r2.hit !== undefined);
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

// 11) Kaydet / yükle: aynı dünyayı geri vermeli (kilitli bölümler ve ekonomi dahil)
{
  const w = createWorld(4242, 'normal');
  reveal(w, 7, 7);
  toggleFlag(w, 40, 40);
  toggleFlag(w, -40, 25);
  reveal(w, -60, 90);
  // gerçek bir patlama üret
  let mx = 0, my = 0, found = false;
  for (let y = 20; y < 90 && !found; y++) for (let x = 20; x < 90 && !found; x++) {
    if (isMine(w, x, y) && cellState(w, x, y) === HIDDEN && !isLockedAt(w, x, y)) { mx = x; my = y; found = true; }
  }
  reveal(w, mx, my);
  markCoinsGranted(w, 17);
  const data = JSON.parse(JSON.stringify(exportWorld(w))); // JSON'dan geçsin (gerçek kayıt gibi)
  const w2 = importWorld(data);
  check('Yükleme başarılı', w2 !== null);
  let same = w2!.revealed === w.revealed && w2!.flags === w.flags && w2!.seed === w.seed && w2!.density === w.density;
  for (let y = -120; y < 150 && same; y++) for (let x = -120; x < 120 && same; x++) {
    if (cellState(w, x, y) !== cellState(w2!, x, y) || cellCount(w, x, y) !== cellCount(w2!, x, y)) same = false;
  }
  check('Yüklenen dünya birebir aynı (durum, sayılar, skor, bayraklar)', same);
  check('Güvenli bölge korunuyor', w2!.safe?.x === 7 && w2!.safe?.y === 7);
  check('Kilitli bölümler, patlama sayısı ve verilmiş para korunuyor',
    w2!.locked.size === w.locked.size && isLockedAt(w2!, mx, my) && w2!.explosions === 1 && w2!.coinsGranted === 17 &&
    w2!.locked.get(chunkKey(mx >> 4, my >> 4))?.x === mx);
  check('Bozuk veri reddedilir', importWorld({ ...data, v: 9 }) === null && importWorld({ ...data, chunks: { '0,0': 'zz' } }) === null && importWorld(null as never) === null);
  check('Mayın yanlış bölüme ait kilit reddedilir', importWorld({ ...data, locked: { '0,0': { x: 500, y: 500 } } }) === null);
  const bytes = JSON.stringify(data).length;
  check(`Kayıt boyutu makul (${bytes} bayt, ${Object.keys(data.chunks).length} bölüm)`, bytes < 20000);

  // Eski (v1) kayıt hâlâ yüklenebilmeli
  const v1 = { v: 1, seed: data.seed, difficulty: data.difficulty, safe: data.safe, revealed: data.revealed, flags: data.flags, chunks: data.chunks };
  const w3 = importWorld(v1 as never);
  check('Eski v1 kayıt yüklenir (kilit yok, verilmiş para 0)', w3 !== null && w3.locked.size === 0 && w3.coinsGranted === 0 && w3.revealed === w.revealed);
}

// 11b) Onarım ve maliyet
{
  const w = createWorld(555, 'hard');
  reveal(w, 0, 0);
  let mx = 0, my = 0, found = false;
  for (let y = 5; y < 60 && !found; y++) for (let x = 5; x < 60 && !found; x++) {
    if (isMine(w, x, y) && cellState(w, x, y) === HIDDEN) { mx = x; my = y; found = true; }
  }
  reveal(w, mx, my);
  const cx = mx >> 4, cy = my >> 4;
  const cost = repairCost(w, cx, cy);
  check(`Onarım maliyeti tabandan başlar (${cost})`, cost >= REPAIR_BASE_COST);
  // bölümde bir miktar kare açıkken maliyet artmalı
  const w2 = createWorld(555, 'hard');
  reveal(w2, 0, 0);
  const costFresh = repairCost(w2, 0, 0); // ilk açılışın olduğu bölüm, açık kareli
  check('Çok kare açılmış bölüm daha pahalı', costFresh > REPAIR_BASE_COST);
  check('Kilitli olmayan bölüm onarılamaz', repairSection(w2, 0, 0) === false);

  const flagsBefore = w.flags;
  check('Onarım başarılı', repairSection(w, cx, cy) === true && !isLockedChunk(w, cx, cy) && w.locked.size === 0);
  check('Patlayan mayın etkisizleştirilir (bayrak olur)', cellState(w, mx, my) === FLAGGED && w.flags === flagsBefore + 1);
  check('Onarılan bölümde tekrar oynanır', toggleFlag(w, mx, my) === 'unflagged');
  toggleFlag(w, mx, my); // tekrar bayrak
  check('Etkisiz mayına yanlışlıkla basılamaz (bayraklı)', reveal(w, mx, my).kind === 'none');
  check('İkinci onarım işe yaramaz', repairSection(w, cx, cy) === false);
}

// 11c) Para hesabı
{
  const w = createWorld(1, 'easy');
  check('Başlangıçta para yok', coinsDue(w) === 0);
  const r = reveal(w, 0, 0);
  const expected = Math.floor(r.opened / CELLS_PER_COIN);
  check(`Açılan karelere göre para hesaplanır (${r.opened} kare -> ${expected})`, coinsDue(w) === expected && expected > 0);
  markCoinsGranted(w, expected);
  check('Verilen para tekrar istenmez', coinsDue(w) === 0);
  reveal(w, 200, 200);
  check('Yeni açılışlar yeni para getirir', coinsDue(w) === Math.floor(w.revealed / CELLS_PER_COIN) - expected);
}

// 12) Uzun oyun simülasyonu: patlamalar, onarımlar, bayraklar karışık; bütünlük bozulmamalı
{
  const w: World = createWorld(909, 'normal');
  reveal(w, 0, 0);
  let steps = 0, blocked = 0, boomed = 0, repaired = 0;
  let seed = 1;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let ok = true;
  while (steps < 4000) {
    const x = Math.floor((rnd() - 0.5) * 300);
    const y = Math.floor((rnd() - 0.5) * 300);
    const locked = isLockedAt(w, x, y);
    const snapshotBefore = cellState(w, x, y);
    const roll = rnd();
    if (roll < 0.04) {
      // bazen mayına bilerek bas
      if (isMine(w, x, y) && !locked && snapshotBefore === HIDDEN) { reveal(w, x, y); boomed++; }
    } else if (roll < 0.06 && w.locked.size > 0) {
      const key = w.locked.keys().next().value as number;
      const cx = Math.floor(key / 1048576) - 524288;
      const cy = (key % 1048576) - 524288;
      if (repairSection(w, cx, cy)) repaired++;
    } else if (roll < 0.1) {
      toggleFlag(w, x, y);
    } else if (!isMine(w, x, y)) {
      const r = reveal(w, x, y);
      if (locked && r.kind !== 'none') ok = false; // kilitli bölüm asla değişmemeli
      if (locked) blocked++;
    }
    steps++;
  }
  let consistent = true;
  let counted = 0, flagged = 0;
  for (let y = -160; y < 160; y++) for (let x = -160; x < 160; x++) {
    const st = cellState(w, x, y);
    if (st === REVEALED) { counted++; if (isMine(w, x, y)) consistent = false; }
    if (st === FLAGGED) flagged++;
  }
  check(`Uzun oyun (${steps} hamle, ${boomed} patlama, ${repaired} onarım, ${w.revealed} açık kare): tutarlı`,
    ok && consistent && counted <= w.revealed && w.explosions >= boomed && flagged <= w.flags && w.locked.size <= w.explosions);
  check(`Kilitli bölümlere yapılan ${blocked} hamle hiçbir şeyi değiştirmedi`, ok);
}

console.log('\n' + passed + ' kontrol geçti.');
