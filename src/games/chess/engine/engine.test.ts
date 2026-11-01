// Çalıştırma: npx tsx src/games/chess/engine/engine.test.ts
// (Yavaş, standart perft sayıları için: npx tsx src/games/chess/engine/perft.test.ts)
import fixtures from './fixtures/random-positions.json';
import { boardFromFen, parseFen, START_FEN, toFen } from './fen';
import { findMove, findMoveUci, legalMoves, legalMovesFrom, legalMovesUci, perft } from './moves';
import {
  BISHOP, BLACK, CASTLE_BK, CASTLE_BQ, CASTLE_WK, CASTLE_WQ, EMPTY, FLAG_CASTLE_K, FLAG_EP, KING, KNIGHT, QUEEN, ROOK, WHITE,
  makePiece, moveFlags, moveToUci, parseSquare, squareName,
} from './types';
import type { Board } from './board';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');
const uci = (fen: string) => legalMovesUci(boardFromFen(fen));

// ---------- Kareler ve hamle kodlaması ----------
{
  check('Kare adları: a1=0, h1=7, a8=0x70, h8=0x77', parseSquare('a1') === 0 && parseSquare('h1') === 7 && parseSquare('a8') === 0x70 && parseSquare('h8') === 0x77);
  check('Kare adı gidiş-dönüş (64 kare)', Array.from({ length: 64 }, (_, i) => (i >> 3) * 16 + (i & 7)).every((s) => parseSquare(squareName(s)) === s));
  check('Geçersiz kare adları reddedilir', ['', 'a', 'i1', 'a9', 'e44', '11'].every((n) => parseSquare(n) === -1));
}

// ---------- FEN: okuma, yazma ----------
{
  const b = boardFromFen(START_FEN);
  check('Başlangıç FEN gidiş-dönüş', toFen(b) === START_FEN);
  check('Başlangıç: şah kareleri e1/e8, rok hakları tam, sıra beyazda', b.king[WHITE] === parseSquare('e1') && b.king[BLACK] === parseSquare('e8') && b.castling === 15 && b.turn === WHITE);
  check('Başlangıç: taşlar yerinde (vezir d1, kale a1, at b8)', b.pieceAt(parseSquare('d1')) === makePiece(WHITE, QUEEN) && b.pieceAt(parseSquare('a1')) === makePiece(WHITE, ROOK) && b.pieceAt(parseSquare('b8')) === makePiece(BLACK, KNIGHT));
  check('Başlangıç: boş kareler boş (e4)', b.pieceAt(parseSquare('e4')) === EMPTY);

  const four = parseFen('4k3/8/8/8/8/8/8/4K3 w - -');
  check('4 alanlı FEN kabul edilir (sayaçlar 0 ve 1)', four.ok && four.board.halfmove === 0 && four.board.fullmove === 1);
  const ep = boardFromFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');
  check('Geçerken alma karesi okunur ve yazılır', ep.ep === parseSquare('e6') && toFen(ep).includes(' e6 '));
}

// ---------- FEN: geçersiz girdiler reddedilir ----------
{
  const bad: [string, string][] = [
    ['boş metin', ''],
    ['anlamsız metin', 'merhaba dünya'],
    ['7 sıra', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1'],
    ['9 kare', 'rnbqkbnrr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['eksik kare', 'rnbqkbn/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['geçersiz taş harfi', 'rnbqkbnx/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['beyaz şah yok', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w kq - 0 1'],
    ['iki beyaz şah', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKKBNR w kq - 0 1'],
    ['birinci sırada piyon', '4k3/8/8/8/8/8/8/P3K3 w - - 0 1'],
    ['sekizinci sırada piyon', '4k2P/8/8/8/8/8/8/4K3 w - - 0 1'],
    ['geçersiz sıra', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1'],
    ['geçersiz rok alanı', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkqX - 0 1'],
    ['tekrarlı rok hakkı', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KK - 0 1'],
    ['kale yokken rok hakkı', '4k3/8/8/8/8/8/8/4K3 w K - 0 1'],
    ['geçerken alma yanlış sırada', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e4 0 1'],
    ['geçerken alma tahtayla tutarsız', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1'],
    ['negatif yarım hamle', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1'],
    ['hamle numarası 0', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0'],
    ['sırası olmayan şah tehdit altında', '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'],
  ];
  let allRejected = true;
  const leaked: string[] = [];
  for (const [name, fen] of bad) {
    const r = parseFen(fen);
    if (r.ok) {
      allRejected = false;
      leaked.push(name);
    }
  }
  check(`${bad.length} geçersiz FEN reddedilir${leaked.length ? ' (kabul edilenler: ' + leaked.join(', ') + ')' : ''}`, allRejected);
  const r = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1');
  check('Reddedilen FEN anlamlı bir hata mesajı verir', !r.ok && r.error.length > 5);
  let threw = false;
  try {
    boardFromFen('bozuk');
  } catch {
    threw = true;
  }
  check('boardFromFen geçersiz FEN\'de hata fırlatır', threw);
}

// ---------- Başlangıç pozisyonunun hamleleri ----------
{
  const expected = ['a2a3', 'a2a4', 'b2b3', 'b2b4', 'c2c3', 'c2c4', 'd2d3', 'd2d4', 'e2e3', 'e2e4', 'f2f3', 'f2f4', 'g2g3', 'g2g4', 'h2h3', 'h2h4', 'b1a3', 'b1c3', 'g1f3', 'g1h3'];
  check('Başlangıçta tam olarak bu 20 hamle yasal', sameSet(uci(START_FEN), expected));
}

// ---------- Kurallar: geçerken alma ----------
{
  check('Yatay çekilme: geçerken alma yasadışı (b5c6 yok)', sameSet(uci('7k/8/8/KPp4r/8/8/8/8 w - c6 0 1'), ['a5a4', 'a5a6', 'a5b6', 'b5b6']));
  const free = boardFromFen('7k/8/8/KPp5/8/8/8/8 w - c6 0 1');
  check('Kale yokken geçerken alma yasal', sameSet(legalMovesUci(free), ['a5a4', 'a5a6', 'a5b6', 'b5b6', 'b5c6']));
  const m = findMoveUci(free, 'b5c6')!;
  check('Geçerken alma hamlesi EP bayrağı taşır', (moveFlags(m) & FLAG_EP) !== 0);
  free.makeMove(m);
  check('Geçerken almada alınan piyon (c5) tahtadan kalkar, alan piyon c6\'ya gider', free.pieceAt(parseSquare('c5')) === EMPTY && free.pieceAt(parseSquare('c6')) === makePiece(WHITE, 1) && free.pieceAt(parseSquare('b5')) === EMPTY);
  free.unmakeMove();
  check('Geçerken alma geri alınınca iki piyon da yerine döner', free.pieceAt(parseSquare('c5')) === makePiece(BLACK, 1) && free.pieceAt(parseSquare('b5')) === makePiece(WHITE, 1) && free.ep === parseSquare('c6'));
}

// ---------- Kurallar: rok ----------
{
  check('Rok: f1 tehdit altındayken kısa rok yok, uzun rok var', (() => {
    const mv = uci('4k3/8/8/5r2/8/8/8/R3K2R w KQ - 0 1');
    return !mv.includes('e1g1') && mv.includes('e1c1');
  })());
  check('Rok: şah çekiliyken rok yok (sadece şah hamleleri)', sameSet(uci('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1'), ['e1d1', 'e1e2', 'e1f1']));
  check('Rok: b1 tehdit altında olsa da uzun rok yapılabilir', uci('1r2k3/8/8/8/8/8/8/R3K3 w Q - 0 1').includes('e1c1'));
  check('Rok: iki taraf da serbestken ikisi de yasal', (() => {
    const mv = uci('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    return mv.includes('e1g1') && mv.includes('e1c1') && mv.length === 26;
  })());

  const b = boardFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const castle = findMoveUci(b, 'e1g1')!;
  check('Kısa rok kısa rok bayrağı taşır', (moveFlags(castle) & FLAG_CASTLE_K) !== 0);
  b.makeMove(castle);
  check('Kısa rokta şah g1, kale f1, h1 ve e1 boş', b.pieceAt(parseSquare('g1')) === makePiece(WHITE, KING) && b.pieceAt(parseSquare('f1')) === makePiece(WHITE, ROOK) && b.pieceAt(parseSquare('h1')) === EMPTY && b.pieceAt(parseSquare('e1')) === EMPTY);
  check('Rok sonrası beyaz iki rok hakkını da kaybeder, siyahınki kalır', (b.castling & (CASTLE_WK | CASTLE_WQ)) === 0 && (b.castling & (CASTLE_BK | CASTLE_BQ)) === (CASTLE_BK | CASTLE_BQ));
  check('Rok sonrası şah karesi güncellenir', b.king[WHITE] === parseSquare('g1'));
  b.unmakeMove();
  check('Rok geri alınınca her şey eski yerinde', toFen(b) === 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');

  const long = boardFromFen('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
  long.makeMove(findMoveUci(long, 'e8c8')!);
  check('Siyah uzun rok: şah c8, kale d8', long.pieceAt(parseSquare('c8')) === makePiece(BLACK, KING) && long.pieceAt(parseSquare('d8')) === makePiece(BLACK, ROOK) && long.pieceAt(parseSquare('a8')) === EMPTY);

  // Rok hakkı kaybı
  const r1 = boardFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  r1.makeMove(findMoveUci(r1, 'a1b1')!);
  check('Kale oynayınca o taraf rok hakkını kaybeder (yalnız uzun)', (r1.castling & CASTLE_WQ) === 0 && (r1.castling & CASTLE_WK) !== 0);
  const r2 = boardFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  r2.makeMove(findMoveUci(r2, 'h1h8')!);
  check('Rakibin kalesini almak, rakibin o taraf rok hakkını da siler', (r2.castling & CASTLE_BK) === 0 && (r2.castling & CASTLE_BQ) !== 0 && (r2.castling & CASTLE_WK) === 0);
  const r3 = boardFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  r3.makeMove(findMoveUci(r3, 'e1e2')!);
  check('Şah oynayınca iki rok hakkı da gider', (r3.castling & (CASTLE_WK | CASTLE_WQ)) === 0);
}

// ---------- Kurallar: terfi ----------
{
  const p = boardFromFen('8/P7/8/8/8/8/8/k6K w - - 0 1');
  check('Terfi: dört seçenek de yasal', sameSet(legalMovesUci(p), ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n', 'h1g1', 'h1g2', 'h1h2']));
  check('findMove terfi belirtilmezse vezir seçer', moveToUci(findMove(p, parseSquare('a7'), parseSquare('a8'))!) === 'a7a8q');
  check('findMove istenen terfiyi seçer (at)', moveToUci(findMove(p, parseSquare('a7'), parseSquare('a8'), KNIGHT)!) === 'a7a8n');
  p.makeMove(findMove(p, parseSquare('a7'), parseSquare('a8'), BISHOP)!);
  check('Terfi sonrası tahtada fil var, piyon yok', p.pieceAt(parseSquare('a8')) === makePiece(WHITE, BISHOP) && p.pieceAt(parseSquare('a7')) === EMPTY);
  p.unmakeMove();
  check('Terfi geri alınınca piyon geri gelir', p.pieceAt(parseSquare('a7')) === makePiece(WHITE, 1) && p.pieceAt(parseSquare('a8')) === EMPTY);

  const c = boardFromFen('1n6/P7/8/8/8/8/8/k6K w - - 0 1');
  check('Alarak terfi: 4 + 4 seçenek', sameSet(legalMovesUci(c), ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n', 'a7b8q', 'a7b8r', 'a7b8b', 'a7b8n', 'h1g1', 'h1g2', 'h1h2']));
  c.makeMove(findMoveUci(c, 'a7b8q')!);
  c.unmakeMove();
  check('Alarak terfi geri alınınca alınan at geri gelir', c.pieceAt(parseSquare('b8')) === makePiece(BLACK, KNIGHT) && c.pieceAt(parseSquare('a7')) === makePiece(WHITE, 1));
  check('findMove yasadışı hamle için null döner', findMove(p, parseSquare('a1'), parseSquare('a2')) === null && findMoveUci(p, 'zzzz') === null && findMoveUci(p, 'a7a8x') === null);
}

// ---------- Mat ve pat ----------
{
  const mate = boardFromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  check('Çocuk matı benzeri (Fool\'s mate): şah çekili ve yasal hamle yok', mate.inCheck() && legalMoves(mate).length === 0);
  const stale = boardFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  check('Pat: şah çekili değil ama yasal hamle yok', !stale.inCheck() && legalMoves(stale).length === 0);
  check('Normal pozisyonda şah çekili değil', !boardFromFen(START_FEN).inCheck());
}

// ---------- Sayaçlar ve FEN akışı ----------
{
  const b = boardFromFen(START_FEN);
  b.makeMove(findMoveUci(b, 'e2e4')!);
  check('1.e4 sonrası FEN (geçerken alma karesi e3, sıra siyahta)', toFen(b) === 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  b.makeMove(findMoveUci(b, 'g8f6')!);
  check('1...Nf6 sonrası FEN (yarım hamle 1, hamle no 2, ep temizlendi)', toFen(b) === 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2');
  check('Hamle yığını ve ply doğru', b.ply === 2 && b.moveStack.length === 2 && moveToUci(b.moveStack[0]) === 'e2e4');
  b.unmakeMove();
  b.unmakeMove();
  check('İki hamle geri alınca başlangıç FEN\'i', toFen(b) === START_FEN && b.ply === 0);
  check('Boş yığında geri alma güvenli (undefined)', b.unmakeMove() === undefined && toFen(b) === START_FEN);
  const copy = b.clone();
  copy.makeMove(findMoveUci(copy, 'd2d4')!);
  check('clone bağımsızdır (kopya değişince asıl değişmez)', toFen(b) === START_FEN && toFen(copy) !== START_FEN);
  check('legalMovesFrom yalnızca o taşın hamlelerini verir (e2: e3, e4)', sameSet(legalMovesFrom(boardFromFen(START_FEN), parseSquare('e2')).map(moveToUci), ['e2e3', 'e2e4']));
}

// ---------- Hamle yapma/geri alma bütünlüğü: rastgele oyunlar ----------
{
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const roots = [START_FEN, 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'];
  let ok = true, positions = 0, moves = 0, promotions = 0, castles = 0, eps = 0, checks = 0;
  const consistent = (b: Board): boolean => {
    let wk = -1, bk = -1;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      if (b.squares[s] === makePiece(WHITE, KING)) { if (wk >= 0) return false; wk = s; }
      if (b.squares[s] === makePiece(BLACK, KING)) { if (bk >= 0) return false; bk = s; }
    }
    return wk === b.king[WHITE] && bk === b.king[BLACK];
  };
  for (let g = 0; g < 250 && ok; g++) {
    const b = boardFromFen(roots[g % roots.length]);
    for (let ply = 0; ply < 140; ply++) {
      const list = legalMoves(b);
      if (list.length === 0) break;
      positions++;
      const snapshot = b.clone();
      const fenBefore = toFen(b);
      for (const m of list) {
        moves++;
        b.makeMove(m);
        if (!consistent(b) || b.inCheck((b.turn ^ 1) as 0 | 1)) ok = false; // yapan tarafın şahı açıkta kalmamalı
        b.unmakeMove();
        if (!b.sameAs(snapshot)) ok = false;
      }
      if (toFen(b) !== fenBefore) ok = false;
      const parsed = parseFen(fenBefore);
      if (!parsed.ok || toFen(parsed.board) !== fenBefore) ok = false;
      const m = list[Math.floor(rnd() * list.length)];
      if ((m >> 14) & 7) promotions++;
      if (moveFlags(m) & (FLAG_CASTLE_K | 8)) castles++;
      if (moveFlags(m) & FLAG_EP) eps++;
      b.makeMove(m);
      if (b.inCheck()) checks++;
    }
  }
  check(`Rastgele oyunlar (${positions} pozisyon, ${moves} hamle): yap/geri al birebir, şah tutarlı, FEN gidiş-dönüş`, ok);
  check(`Rastgele oyunlar kuralların dar köşelerine de uğradı (terfi ${promotions}, rok ${castles}, geçerken alma ${eps}, şah ${checks})`, promotions > 0 && castles > 0 && checks > 0);
}

// ---------- Bağımsız kütüphane (python-chess) ile karşılaştırma ----------
{
  type Fx = { fen: string; moves: string[]; perft2: number; perft3?: number; after?: Record<string, string> };
  const list = fixtures.positions as Fx[];
  let movesOk = 0, fenOk = 0, perft2Ok = 0, perft3Ok = 0, perft3Total = 0, afterOk = 0, afterTotal = 0, terminal = 0;
  const problems: string[] = [];
  for (const fx of list) {
    const parsed = parseFen(fx.fen);
    if (!parsed.ok) { problems.push('FEN okunamadı: ' + fx.fen + ' ' + parsed.error); continue; }
    const b = parsed.board;
    if (fx.moves.length === 0) terminal++;
    if (toFen(b) === fx.fen) fenOk++; else problems.push('FEN gidiş-dönüş: ' + fx.fen);
    const got = legalMovesUci(b);
    if (sameSet(got, fx.moves)) movesOk++;
    else problems.push(`hamle listesi farklı: ${fx.fen}\n   bizde  : ${got.sort().join(' ')}\n   beklenen: ${[...fx.moves].sort().join(' ')}`);
    if (perft(b, 2) === fx.perft2) perft2Ok++; else problems.push('perft2: ' + fx.fen);
    if (fx.perft3 !== undefined) {
      perft3Total++;
      if (perft(b, 3) === fx.perft3) perft3Ok++; else problems.push('perft3: ' + fx.fen);
    }
    if (fx.after) {
      for (const [u, expectedFen] of Object.entries(fx.after)) {
        afterTotal++;
        const m = findMoveUci(b, u);
        if (m === null) { problems.push(`hamle bulunamadı ${u} @ ${fx.fen}`); continue; }
        b.makeMove(m);
        const f = toFen(b);
        b.unmakeMove();
        if (f === expectedFen && toFen(b) === fx.fen) afterOk++;
        else problems.push(`hamle sonrası FEN: ${u} @ ${fx.fen}\n   bizde  : ${f}\n   beklenen: ${expectedFen}`);
      }
    }
  }
  if (problems.length) console.log(problems.slice(0, 6).join('\n'));
  check(`python-chess karşılaştırması: ${list.length} pozisyonda yasal hamle listesi birebir aynı (${terminal} bitmiş oyun dahil)`, movesOk === list.length);
  check(`python-chess karşılaştırması: ${list.length} pozisyonda FEN gidiş-dönüş birebir aynı`, fenOk === list.length);
  check(`python-chess karşılaştırması: perft 2 (${perft2Ok}/${list.length}) ve perft 3 (${perft3Ok}/${perft3Total})`, perft2Ok === list.length && perft3Ok === perft3Total);
  check(`python-chess karşılaştırması: ${afterTotal} hamlenin sonucu FEN'i birebir aynı (ep, rok hakları, sayaçlar dahil)`, afterOk === afterTotal && afterTotal > 1000);
}

console.log('\n' + passed + ' kontrol geçti.');
