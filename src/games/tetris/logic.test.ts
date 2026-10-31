// Çalıştırma: npx tsx src/games/tetris/logic.test.ts
import {
  COLS, ROWS, PIECE_TYPES, collides, drawFromBag, getShape, hardDrop, holdPiece,
  moveHorizontal, newGame, rotate, spawnPiece, tick, cellValue, getGhost, getDropInterval,
  LOCK_DELAY_MS, MAX_LOCK_RESETS,
  type GameState, type PieceType,
} from './logic';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}

// 1) 7-bag: her 7 parçada her tür tam bir kez
{
  let bag: PieceType[] = [];
  const drawn: PieceType[] = [];
  for (let i = 0; i < 28; i++) {
    const d = drawFromBag(bag, Math.random);
    drawn.push(d.type);
    bag = d.bag;
  }
  let ok = true;
  for (let i = 0; i < 28; i += 7) {
    ok = ok && new Set(drawn.slice(i, i + 7)).size === 7;
  }
  check('7-bag: her 7 parçada 7 farklı tür', ok);
}

// 2) 4 kez döndürünce başa dönülür, her parçada 4 hücre var
{
  let ok = true;
  for (const t of PIECE_TYPES) {
    ok = ok && JSON.stringify(getShape(t, 0)) === JSON.stringify(getShape(t, 4));
    for (let r = 0; r < 4; r++) ok = ok && getShape(t, r).flat().filter(Boolean).length === 4;
  }
  check('Döndürme: 4 dönüş = başlangıç, parça başına 4 hücre', ok);
}

// 3) Duvar çarpışması
{
  let s = newGame();
  for (let i = 0; i < 20; i++) s = moveHorizontal(s, -1);
  const leftX = s.current.x;
  s = moveHorizontal(s, -1);
  check('Sol duvardan öteye geçilmez', s.current.x === leftX);
  for (let i = 0; i < 20; i++) s = moveHorizontal(s, 1);
  const rightX = s.current.x;
  s = moveHorizontal(s, 1);
  check('Sağ duvardan öteye geçilmez', s.current.x === rightX);
  check('Duvara dayalı konum çarpışma sayılmaz', !collides(s.board, s.current));
}

// 4) Tek satır silme
{
  let s: GameState = newGame();
  s.board[ROWS - 1] = Array(COLS).fill(1).map((v, c) => (c < 4 ? 0 : v));
  s = { ...s, current: { ...spawnPiece('I'), x: 0 }, next: 'O' };
  s = hardDrop(s);
  check('1 satır silinir', s.lines === 1);
  check('Satır silme puanı en az 100', s.score >= 100);
  check('Silinince tahta boş kalır', s.board.every((row) => row.every((c) => c === 0)));
}

// 5) 4 satır birden (Tetris)
{
  let s: GameState = newGame();
  for (let r = ROWS - 4; r < ROWS; r++) s.board[r] = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  let piece = spawnPiece('I');
  piece = { ...piece, rot: 1, x: -2 }; // dikey I, en sol sütunda
  s = hardDrop({ ...s, current: piece, next: 'O' });
  check('Dikey I ile 4 satır silinir', s.lines === 4);
  check('4 satır puanı en az 800', s.score >= 800);
}

// 6) Seviye atlama
{
  let s: GameState = newGame();
  s = { ...s, lines: 9 };
  s.board[ROWS - 1] = Array(COLS).fill(1).map((v, c) => (c < 4 ? 0 : v));
  s = hardDrop({ ...s, current: { ...spawnPiece('I'), x: 0 }, next: 'O' });
  check('10. satırda seviye 2 olur', s.level === 2);
}

// 7) Hold: bir parçada yalnızca bir kez
{
  let s = newGame();
  const first = s.current.type;
  const second = s.next;
  s = holdPiece(s);
  check('Hold: mevcut parça saklanır', s.hold === first);
  check('Hold: sıradaki parça gelir', s.current.type === second);
  const afterFirstHold = s;
  s = holdPiece(s);
  check('Hold: aynı parçada ikinci kez çalışmaz', s === afterFirstHold);
  s = hardDrop(s);
  s = holdPiece(s);
  check('Hold: kilitlenince tekrar kullanılabilir ve takas yapar', s.current.type === first);
}

// 8) Oyun sonu
{
  let s: GameState = newGame();
  for (let r = 0; r < 6; r++) s.board[r] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
  s = hardDrop(s);
  check('Tahta tepeye dolunca oyun biter', s.gameOver);
  check('Oyun sonu olayı bırakılır', s.event?.kind === 'gameover');
  const frozen = s;
  check('Oyun bitince hamleler işlemez', moveHorizontal(frozen, 1) === frozen && rotate(frozen) === frozen);
}

// 9) Rastgele oyun simülasyonu: çökmemeli, geçersiz durum üretmemeli
{
  let s = newGame();
  let steps = 0;
  while (!s.gameOver && steps < 5000) {
    const a = Math.floor(Math.random() * 6);
    if (a === 0) s = moveHorizontal(s, -1);
    else if (a === 1) s = moveHorizontal(s, 1);
    else if (a === 2) s = rotate(s);
    else if (a === 3) s = tick(s, 120);
    else if (a === 4) s = hardDrop(s);
    else s = holdPiece(s);
    steps++;
    if (!s.gameOver && collides(s.board, s.current)) throw new Error('Parça dolu hücrenin içinde!');
  }
  check('Rastgele simülasyon (' + steps + ' adım) tutarlı', true);
  check('cellValue 1..7 aralığında', PIECE_TYPES.every((t) => cellValue(t) >= 1 && cellValue(t) <= 7));
}

// 10) Yerçekimi: bir düşme aralığı kadar sürede 1 satır iner
{
  let s = newGame();
  const y0 = s.current.y;
  s = tick(s, getDropInterval(1) - 10);
  check('Aralıktan kısa sürede parça inmez', s.current.y === y0);
  s = tick(s, 20);
  check('Aralık dolunca parça 1 satır iner', s.current.y === y0 + 1);
}

// 11) Kilit gecikmesi
{
  let s: GameState = newGame();
  s = { ...s, current: getGhost(s) }; // parçayı zemine oturt
  const y = s.current.y;
  s = tick(s, 100);
  check('Yere değince hemen kilitlenmez', s.current.y === y && s.board.every((r) => r.every((c) => c === 0)));
  s = tick(s, LOCK_DELAY_MS);
  check('Kilit süresi dolunca kilitlenir', s.board.some((r) => r.some((c) => c !== 0)) && s.event?.kind === 'lock');
}

// 12) Yerdeyken hareket kilit sayacını sıfırlar, ama sonsuza kadar değil
{
  let s: GameState = newGame();
  s = { ...s, current: getGhost(s) };
  s = tick(s, LOCK_DELAY_MS - 100);
  s = moveHorizontal(s, 1);
  s = tick(s, LOCK_DELAY_MS - 100);
  check('Yerde kaydırınca kilit ertelenir', s.board.every((r) => r.every((c) => c === 0)));

  let locked = false;
  for (let i = 0; i < MAX_LOCK_RESETS + 10 && !locked; i++) {
    s = moveHorizontal(s, i % 2 === 0 ? -1 : 1);
    s = tick(s, LOCK_DELAY_MS - 100);
    locked = s.board.some((r) => r.some((c) => c !== 0));
  }
  check('Sonsuz erteleme yok: en fazla ' + MAX_LOCK_RESETS + ' sıfırlamadan sonra kilitlenir', locked);
}

// 13) Olaylar
{
  let s: GameState = newGame();
  s = rotate(s);
  check('Döndürme olayı bırakır', s.event?.kind === 'rotate');
  const id1 = s.event!.id;
  s = holdPiece(s);
  check('Olay id artar', s.event!.id === id1 + 1 && s.event!.kind === 'hold');

  s = newGame();
  s.board[ROWS - 1] = Array(COLS).fill(1).map((v, c) => (c < 4 ? 0 : v));
  s = hardDrop({ ...s, current: { ...spawnPiece('I'), x: 0 }, next: 'O' });
  check('Satır silince clear olayı', s.event?.kind === 'clear' && s.event.lines === 1);

  s = newGame();
  for (let r = ROWS - 4; r < ROWS; r++) s.board[r] = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  s = hardDrop({ ...s, current: { ...spawnPiece('I'), rot: 1, x: -2 }, next: 'O' });
  check('4 satır silince tetris olayı', s.event?.kind === 'tetris');
}

// 14) Hold ile doğacak yer doluysa oyun biter (parça blokların içine girmez)
{
  let s: GameState = newGame();
  s = { ...s, hold: 'O', current: { ...spawnPiece('T'), y: 10 } };
  for (let r = 0; r < 2; r++) for (let c = 3; c < 7; c++) s.board[r][c] = 1; // doğma bölgesini doldur
  const after = holdPiece(s);
  check('Hold: doğacak yer doluysa oyun biter', after.gameOver && after.event?.kind === 'gameover');
}

// 15) Kesin sayaçlar: kilitlenen parça ve 4'lü temizleme (görev/başarım takibi bunlara dayanır)
{
  let s: GameState = newGame();
  check('Başlangıçta sayaçlar sıfır', s.pieces === 0 && s.tetrises === 0);
  s = hardDrop(s);
  check('Parça kilitlenince sayaç artar', s.pieces === 1 && s.tetrises === 0);
  s = hardDrop(s);
  check('Her kilitlenmede bir artar', s.pieces === 2);

  // 4 satır birden: tetrises artar, 1-3 satırda artmaz
  let t: GameState = newGame();
  for (let r = ROWS - 4; r < ROWS; r++) t.board[r] = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  t = hardDrop({ ...t, current: { ...spawnPiece('I'), rot: 1, x: -2 }, next: 'O' });
  check('4 satır birden temizlenince tetrises 1 olur', t.tetrises === 1 && t.lines === 4 && t.pieces === 1);

  let u: GameState = newGame();
  u.board[ROWS - 1] = Array(COLS).fill(1).map((v, c) => (c < 4 ? 0 : v));
  u = hardDrop({ ...u, current: { ...spawnPiece('I'), x: 0 }, next: 'O' });
  check('Tek satır temizlemek tetrises sayısını artırmaz', u.lines === 1 && u.tetrises === 0);

  // zamanla kilitlenme de sayılır
  let v: GameState = newGame();
  v = { ...v, current: getGhost(v) };
  v = tick(v, LOCK_DELAY_MS + 50);
  check('Zamanla kilitlenen parça da sayılır', v.pieces === 1);
}

console.log('\n' + passed + ' kontrol geçti.');
