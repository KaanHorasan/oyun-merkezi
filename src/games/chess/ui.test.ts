// Çalıştırma: npx tsx src/games/chess/ui.test.ts
// Arayüzün saf mantığı: tahta eşlemesi, dokunma akışı, yakalanan taşlar.
import { ChessGame } from './engine/game';
import { BISHOP, BLACK, KNIGHT, QUEEN, ROOK, WHITE, makePiece, parseSquare, squareName } from './engine/types';
import { INITIAL_UI, cancelUi, checkedKingSquare, choosePromotion, tapSquare, targetsOf } from './controller';
import type { UiState } from './controller';
import { cellToSquare, isDarkSquare, squareOrigin, squareToCell, xyToSquare } from './geometry';
import { advantageOf, capturedBy, materialBalance } from './summary';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const sq = parseSquare;

// ---------- Tahta eşlemesi ----------
{
  check('Beyaz altta: a1 sol altta, h8 sağ üstte', squareToCell(sq('a1'), false).col === 0 && squareToCell(sq('a1'), false).row === 7 && squareToCell(sq('h8'), false).col === 7 && squareToCell(sq('h8'), false).row === 0);
  check('Çevrilince: a1 sağ üstte, h8 sol altta', squareToCell(sq('a1'), true).col === 7 && squareToCell(sq('a1'), true).row === 0 && squareToCell(sq('h8'), true).col === 0 && squareToCell(sq('h8'), true).row === 7);
  let roundTrip = true, pixel = true, unique = true;
  for (const flipped of [false, true]) {
    const seen = new Set<string>();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const s = r * 16 + f;
      const { col, row } = squareToCell(s, flipped);
      if (cellToSquare(col, row, flipped) !== s) roundTrip = false;
      seen.add(col + ',' + row);
      // karenin her yerine dokunmak o kareyi vermeli (sınır pikselleri dahil)
      const { x, y } = squareOrigin(s, 400, flipped);
      for (const [dx, dy] of [[0, 0], [25, 25], [49.9, 49.9], [10, 40]]) {
        if (xyToSquare(x + dx, y + dy, 400, flipped) !== s) pixel = false;
      }
    }
    if (seen.size !== 64) unique = false;
  }
  check('Kare <-> hücre eşlemesi gidiş-dönüş, her iki yönde de 64 farklı hücre', roundTrip && unique);
  check('Karenin her noktasına dokunmak o kareyi verir (her iki yön)', pixel);
  check('Tahta dışına dokunmak -1 verir', xyToSquare(-1, 10, 400, false) === -1 && xyToSquare(400, 10, 400, false) === -1 && xyToSquare(10, 401, 400, false) === -1 && xyToSquare(10, 10, 0, false) === -1);
  check('Kare renkleri: a1 koyu, h1 açık, a2 açık', isDarkSquare(sq('a1')) && !isDarkSquare(sq('h1')) && !isDarkSquare(sq('a2')) && isDarkSquare(sq('b2')));
  check('Orta noktalar: e4 beyaz altta (col 4, row 4)', (() => { const c = squareToCell(sq('e4'), false); return c.col === 4 && c.row === 4; })());
}

// ---------- Dokunma akışı ----------
{
  const g = new ChessGame();
  let ui: UiState = INITIAL_UI;
  let r = tapSquare(g, ui, sq('e4'));
  check('Boş kareye dokunmak hiçbir şey seçmez', r.ui.selected === null && r.moved === null);
  r = tapSquare(g, ui, sq('e7'));
  check('Rakibin taşı seçilemez', r.ui.selected === null);

  r = tapSquare(g, ui, sq('e2'));
  ui = r.ui;
  check('Kendi taşını seçer', ui.selected === sq('e2') && r.moved === null);
  check('Seçili piyonun hedefleri e3 ve e4 (alış yok)', (() => { const t = targetsOf(g, ui.selected); return t.length === 2 && t.every((x) => !x.capture) && t.some((x) => x.sq === sq('e3')) && t.some((x) => x.sq === sq('e4')); })());

  r = tapSquare(g, ui, sq('e2'));
  check('Seçili taşa tekrar dokunmak seçimi kaldırır', r.ui.selected === null);

  r = tapSquare(g, ui, sq('g1'));
  ui = r.ui;
  check('Başka kendi taşına dokunmak seçimi değiştirir', ui.selected === sq('g1'));

  r = tapSquare(g, ui, sq('e5'));
  check('Gidilemeyen boş kareye dokunmak seçimi temizler, hamle yapılmaz', r.ui.selected === null && r.moved === null && g.records.length === 0);

  ui = tapSquare(g, INITIAL_UI, sq('e2')).ui;
  r = tapSquare(g, ui, sq('e4'));
  check('Yasal kareye dokununca hamle yapılır, seçim temizlenir', r.moved?.san === 'e4' && r.ui.selected === null && g.turn === BLACK && g.records.length === 1);

  check('Sıra siyahta: beyaz taş seçilemez', tapSquare(g, INITIAL_UI, sq('d2')).ui.selected === null);
  check('Dışarı/geçersiz kare güvenle yok sayılır', tapSquare(g, INITIAL_UI, -1).ui.selected === null && tapSquare(g, INITIAL_UI, 0x88).ui.selected === null);
}

// ---------- Alış hedefleri ve geçerken alma ----------
{
  const g = new ChessGame('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const t = targetsOf(g, sq('e4'));
  check('e4 piyonu: e5 (boş) ve d5 (alış)', t.length === 2 && t.find((x) => x.sq === sq('d5'))!.capture && !t.find((x) => x.sq === sq('e5'))!.capture);
  const ep = new ChessGame('7k/8/8/KPp5/8/8/8/8 w - c6 0 1');
  check('Geçerken alma hedefi alış olarak işaretlenir', targetsOf(ep, sq('b5')).find((x) => x.sq === sq('c6'))?.capture === true);
  check('Seçim yokken hedef listesi boş', targetsOf(g, null).length === 0);
}

// ---------- Terfi akışı ----------
{
  const g = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
  let r = tapSquare(g, INITIAL_UI, sq('a7'));
  r = tapSquare(g, r.ui, sq('a8'));
  check('Terfi karesine gidince hamle yapılmaz, terfi seçimi beklenir', r.moved === null && r.ui.promotion?.from === sq('a7') && r.ui.promotion?.to === sq('a8') && g.records.length === 0);
  const picked = choosePromotion(g, r.ui, KNIGHT);
  check('Terfi seçilince hamle yapılır (at)', picked.moved?.san === 'a8=N' && picked.ui.promotion === null && picked.ui.selected === null);

  const h = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
  let r2 = tapSquare(h, INITIAL_UI, sq('a7'));
  r2 = tapSquare(h, r2.ui, sq('a8'));
  const cancelled = tapSquare(h, r2.ui, sq('e4'));
  check('Terfi seçicisi açıkken tahtaya dokunmak iptal eder', cancelled.ui.promotion === null && cancelled.moved === null && h.records.length === 0);
  check('Terfi beklemiyorken choosePromotion işe yaramaz', choosePromotion(h, INITIAL_UI, QUEEN).moved === null);
  check('cancelUi temiz durum verir', cancelUi().selected === null && cancelUi().promotion === null);
}

// ---------- Oyun bitince ----------
{
  const g = new ChessGame();
  for (const u of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']) g.playUci(u);
  const r = tapSquare(g, INITIAL_UI, sq('e8'));
  check('Oyun bitince dokunmak hiçbir şeyi seçmez', r.ui.selected === null && r.moved === null);
  check('Mat sonrası şah çekili: siyah şah e8 vurgulanır', checkedKingSquare(g) === sq('e8'));
  const n = new ChessGame();
  check('Şah çekili değilken vurgu yok', checkedKingSquare(n) === -1);
}

// ---------- Yakalanan taşlar ve maddi durum ----------
{
  const g = new ChessGame();
  check('Başlangıçta maddi fark 0, kimse taş almadı', materialBalance(g.board) === 0 && capturedBy(g, WHITE).length === 0 && advantageOf(g.board, WHITE) === 0);
  for (const u of ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5']) g.playUci(u);
  const w = capturedBy(g, WHITE), b = capturedBy(g, BLACK);
  check('Beyaz bir siyah piyon, siyah bir beyaz piyon aldı', w.length === 1 && b.length === 1 && w[0] === makePiece(BLACK, 1) && b[0] === makePiece(WHITE, 1));
  check('Maddi fark 0 (piyon piyona)', materialBalance(g.board) === 0);
  g.playUci('f1b5'); g.playUci('a5b5');
  check('Vezir fil aldı: siyah +3 öndedir', materialBalance(g.board) === -3 && advantageOf(g.board, BLACK) === 3 && advantageOf(g.board, WHITE) === 0);
  check('Alınan taşlar değere göre sıralanır (siyahın aldıkları: fil önce)', (() => { const c = capturedBy(g, BLACK); return c[0] === makePiece(WHITE, BISHOP) && c[1] === makePiece(WHITE, 1); })());

  const p = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
  p.play(sq('a7'), sq('a8'), ROOK);
  check('Terfi maddi dengeyi tahtadaki gerçek duruma göre günceller (+5 -1 + piyon 1 → kale 5)', materialBalance(p.board) === 5);
}

console.log('\n' + passed + ' kontrol geçti.');
void squareName;
