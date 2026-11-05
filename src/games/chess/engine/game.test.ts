// Çalıştırma: npx tsx src/games/chess/engine/game.test.ts
// Aşama 2: durum kuralları (mat, pat, beraberlik), notasyon (SAN), PGN, oyun sınıfı.
import fixtures from './fixtures/random-positions.json';
import { Board } from './board';
import { boardFromFen, START_FEN, toFen } from './fen';
import { ChessGame } from './game';
import type { SavedGame } from './game';
import { findMoveUci, legalMoves } from './moves';
import { movetextOf } from './pgn';
import { findMoveSan, moveToSan } from './san';
import { isInsufficientMaterial, positionKey } from './status';
import { BLACK, KNIGHT, PAWN, QUEEN, WHITE, makePiece, parseSquare } from './types';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const play = (g: ChessGame, ...ucis: string[]) => ucis.forEach((u) => { if (!g.playUci(u)) throw new Error('yasadışı: ' + u); });
const sansOf = (g: ChessGame) => g.records.map((r) => r.san);

// ---------- Notasyon (SAN): elle yazılmış, bağımsız kütüphaneden doğrulanmış örnekler ----------
{
  const sanOf = (fen: string, uciMove: string) => {
    const b = boardFromFen(fen);
    return moveToSan(b, findMoveUci(b, uciMove)!);
  };
  check('Aynı dosyadaki iki kale: sıra numarası ile ayrılır (R4a2, R1a2)', sanOf('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1', 'a4a2') === 'R4a2' && sanOf('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1', 'a1a2') === 'R1a2');
  check('Aynı sıradaki iki at: dosya harfi ile ayrılır (Nbd2, Nfd2)', sanOf('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1', 'b1d2') === 'Nbd2' && sanOf('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1', 'f1d2') === 'Nfd2');
  const q = '6k1/8/8/8/Q6Q/8/8/Q3K3 w - - 0 1';
  check('Üç vezir: biri sıra, biri dosya+sıra, biri dosya ile ayrılır (Q1d4, Qa4d4, Qhd4)', sanOf(q, 'a1d4') === 'Q1d4' && sanOf(q, 'a4d4') === 'Qa4d4' && sanOf(q, 'h4d4') === 'Qhd4');
  check('Belirsizlik yoksa ek yazılmaz (tek kale: Rf1)', sanOf('4k3/8/8/8/8/8/8/R3K2R w - - 0 1', 'h1f1') === 'Rf1');
  check('Kısa ve uzun rok: O-O, O-O-O', sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1') === 'O-O' && sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1') === 'O-O-O');
  check('Terfi ve şah eki: a8=Q+', sanOf('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8q') === 'a8=Q+');
  check('Piyon alışı dosya harfi ile: exd5', sanOf('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5') === 'exd5');
  const b = boardFromFen('7k/8/8/KPp5/8/8/8/8 w - c6 0 1');
  check('Geçerken alma da alış sayılır: bxc6', moveToSan(b, findMoveUci(b, 'b5c6')!) === 'bxc6');
  check('findMoveSan hoşgörülü: işaretler ve 0-0 yazımı', (() => {
    const bb = boardFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    return findMoveSan(bb, 'O-O') === findMoveUci(bb, 'e1g1') && findMoveSan(bb, '0-0-0') === findMoveUci(bb, 'e1c1') && findMoveSan(bb, 'Rxh8+') === findMoveUci(bb, 'h1h8') && findMoveSan(bb, 'Rxh8') === findMoveUci(bb, 'h1h8') && findMoveSan(bb, 'Rh8') === null && findMoveSan(bb, 'Zz9') === null;
  })());
}

// ---------- Oyun akışı: çocuk matı ----------
{
  const g = new ChessGame();
  check('Yeni oyun: oynanıyor, sıra beyazda, şah yok', g.status.kind === 'playing' && g.turn === WHITE && !g.isOver && g.records.length === 0);
  play(g, 'e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6');
  check('Hamleler SAN ile kaydedilir', sansOf(g).join(' ') === 'e4 e5 Bc4 Nc6 Qh5 Nf6');
  const mate = g.playUci('h5f7')!;
  check('Mat: son hamle Qxf7#, alınan taş piyon, şah işareti', mate.san === 'Qxf7#' && mate.captured === makePiece(BLACK, PAWN) && mate.check && mate.piece === makePiece(WHITE, QUEEN));
  check('Mat: durum şah mat, kazanan beyaz, sonuç 1-0', g.status.kind === 'checkmate' && (g.status as { winner: number }).winner === WHITE && g.result === '1-0' && g.isOver);
  check('Oyun bitince yeni hamle yapılamaz', g.playUci('e8f7') === null && g.play(parseSquare('e8'), parseSquare('f7')) === null);
  const pgn = g.pgn({ date: new Date(2026, 10, 1) });
  check('PGN: başlıklar ve hamle metni', pgn.includes('[Result "1-0"]') && pgn.includes('[Date "2026.11.01"]') && pgn.includes('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0') && !pgn.includes('[FEN'));
  check('Geri al: mat kalkar, oyun yeniden oynanır', g.undo() && g.status.kind === 'playing' && g.records.length === 6 && g.result === '*');
  check('Geri alınca tahta tam eski haline döner', toFen(g.board) === 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
}

// ---------- Pat ----------
{
  const g = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  check('Pat: oyun biter, sonuç yarım', g.status.kind === 'stalemate' && g.result === '1/2-1/2' && g.isOver);
  const m = new ChessGame('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  check('Mat (siyah kazanır): sonuç 0-1', m.status.kind === 'checkmate' && m.result === '0-1');
}

// ---------- Beraberlik kuralları ----------
{
  const g = new ChessGame();
  play(g, 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1');
  check('Üç kez tekrar: 7. yarım hamlede henüz berabere değil', g.status.kind === 'playing');
  play(g, 'f6g8');
  check('Üç kez tekrar: başlangıç pozisyonu 3. kez oluşunca beraberlik', g.status.kind === 'draw' && (g.status as { reason: string }).reason === 'repetition' && g.result === '1/2-1/2');
  check('Beraberlik sonrası hamle yapılamaz', g.playUci('e2e4') === null);
  g.undo();
  check('Geri al: tekrar beraberliği kalkar', g.status.kind === 'playing');

  // Tekrar sayımı yalnızca AYNI pozisyonları sayar (sıra, rok hakkı farkı varsa farklı)
  const h = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  play(h, 'a1b1', 'a8b8', 'b1a1', 'b8a8', 'a1b1', 'a8b8', 'b1a1', 'b8a8');
  check('Rok hakkı kaybolduysa pozisyon aynı sayılmaz (tekrar yok)', h.status.kind === 'playing');

  const f = new ChessGame('4k3/8/8/8/8/8/8/R3K3 w - - 99 60');
  check('50 hamle: 99 yarım hamlede henüz berabere değil', f.status.kind === 'playing');
  play(f, 'a1a2');
  check('50 hamle kuralı: 100 yarım hamlede beraberlik', f.status.kind === 'draw' && (f.status as { reason: string }).reason === 'fifty');

  const f2 = new ChessGame('4k3/8/8/8/8/8/P7/R3K3 w - - 99 60');
  play(f2, 'a2a3');
  check('Piyon hamlesi sayacı sıfırlar (beraberlik yok)', f2.status.kind === 'playing' && f2.board.halfmove === 0);

  const cases: [string, boolean][] = [
    ['4k3/8/8/8/8/8/8/4K3 w - - 0 1', true], // şah + şah
    ['4k3/8/8/8/8/8/8/3BK3 w - - 0 1', true], // şah + fil
    ['4k3/8/8/8/8/8/8/3NK3 w - - 0 1', true], // şah + at
    ['4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1', true], // aynı renk iki fil
    ['4k3/8/8/8/8/8/8/2NNK3 w - - 0 1', false], // iki at: mat mümkün (zorunlu değil ama mümkün)
    ['2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1', false], // zıt renk filler
    ['4k3/8/8/8/8/8/8/R3K3 w - - 0 1', false],
    ['4k3/8/8/8/8/8/P7/4K3 w - - 0 1', false],
    ['4k1n1/8/8/8/8/8/8/3NK3 w - - 0 1', false], // at + at (kendi kendine mat mümkün)
  ];
  check('Yetersiz materyal: 9 örneğin hepsi bağımsız kütüphaneyle aynı', cases.every(([fen, expected]) => isInsufficientMaterial(boardFromFen(fen)) === expected));
  check('Yetersiz materyalde oyun hemen berabere biter', new ChessGame('4k3/8/8/8/8/8/8/3BK3 w - - 0 1').status.kind === 'draw');
}

// ---------- Teslim ve beraberlik teklifi ----------
{
  const g = new ChessGame();
  play(g, 'e2e4', 'e7e5');
  check('Beyaz teslim olursa siyah kazanır, sonuç 0-1', g.resign(WHITE) && g.status.kind === 'resigned' && g.result === '0-1');
  check('Teslimden sonra hamle yapılamaz, tekrar teslim olunamaz', g.playUci('g1f3') === null && g.resign(BLACK) === false);
  check('Geri al teslimi iptal eder ve hamle sayısı değişmez', g.undo() && g.status.kind === 'playing' && g.records.length === 2);
  check('Anlaşmalı beraberlik', g.agreeDraw() && g.status.kind === 'draw' && (g.status as { reason: string }).reason === 'agreement' && g.result === '1/2-1/2');
  g.undo();
  check('Beraberlik teklifi geri alınabilir', g.status.kind === 'playing');
}

// ---------- Kayıt / yükleme ----------
{
  const g = new ChessGame();
  play(g, 'e2e4', 'd7d5', 'e4d5', 'g8f6', 'f1b5', 'c7c6', 'd5c6', 'b8c6', 'g1f3');
  g.resign(BLACK);
  const json = JSON.parse(JSON.stringify(g.toSave())) as SavedGame;
  const back = ChessGame.fromSave(json)!;
  check('Kayıttan yükleme: aynı pozisyon, aynı hamleler, aynı durum', back !== null && toFen(back.board) === toFen(g.board) && sansOf(back).join(' ') === sansOf(g).join(' ') && back.status.kind === 'resigned' && back.result === '1-0');
  check('Kaydedilen oyunun alışları doğru izlenir', back.records.filter((r) => r.captured !== 0).length === 3);
  check('Yüklenen oyun geri alınabilir', back.undo() && back.status.kind === 'playing' && back.undo() && back.records.length === 8);
  check('Bozuk kayıt reddedilir (yasadışı hamle, sürüm, boş)', ChessGame.fromSave({ ...json, moves: ['e2e5'] }) === null && ChessGame.fromSave({ ...json, v: 2 as 1 }) === null && ChessGame.fromSave(null as never) === null && ChessGame.fromSave({ ...json, startFen: 'bozuk' }) === null);
  check('Bozuk teslim bilgisi reddedilir', ChessGame.fromSave({ ...json, ending: { kind: 'resigned', loser: 7 as 0 } }) === null);
  const fromFen = new ChessGame('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  play(fromFen, 'e2e4');
  const re = ChessGame.fromSave(fromFen.toSave())!;
  check('Özel başlangıç pozisyonlu oyun kaydı korunur (PGN SetUp/FEN başlığı dahil)', toFen(re.board) === toFen(fromFen.board) && re.pgn().includes('[SetUp "1"]') && re.pgn().includes('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]'));
}

// ---------- Hamle kayıtları ----------
{
  const g = new ChessGame('7k/8/8/KPp5/8/8/8/8 w - c6 0 1');
  const r = g.playUci('b5c6')!;
  check('Geçerken alma kaydı: alınan taş siyah piyon', r.captured === makePiece(BLACK, PAWN) && r.san === 'bxc6');
  const p = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
  const pr = p.play(parseSquare('a7'), parseSquare('a8'), KNIGHT)!;
  check('Terfi kaydı: at seçildi, san =N', pr.promo === KNIGHT && pr.san === 'a8=N');
  const d = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
  check('Terfi belirtilmezse vezir', d.play(parseSquare('a7'), parseSquare('a8'))!.promo === QUEEN);
  check('Yasadışı hamle null döner ve oyunu bozmaz', d.play(parseSquare('h1'), parseSquare('h8')) === null && d.records.length === 1);
}

// ---------- Bağımsız kütüphane (python-chess) ile karşılaştırma ----------
{
  type Pos = { fen: string; moves: string[]; after?: Record<string, string>; san?: Record<string, string>; term?: string };
  const positions = fixtures.positions as Pos[];
  let sanTotal = 0, sanOk = 0, parseOk = 0, termTotal = 0, termOk = 0;
  const problems: string[] = [];
  for (const fx of positions) {
    const b = boardFromFen(fx.fen);
    if (fx.san) {
      const legal = legalMoves(b);
      for (const [u, expected] of Object.entries(fx.san)) {
        sanTotal++;
        const m = findMoveUci(b, u)!;
        const got = moveToSan(b, m, legal);
        if (got === expected) sanOk++;
        else problems.push(`SAN farklı: ${u} @ ${fx.fen}: bizde ${got}, beklenen ${expected}`);
        if (findMoveSan(b, expected) === m) parseOk++;
        else problems.push(`SAN okunamadı: ${expected} @ ${fx.fen}`);
      }
    }
    if (fx.term) {
      termTotal++;
      const st = new ChessGame(fx.fen).status.kind;
      if ((fx.term === 'mate' && st === 'checkmate') || (fx.term === 'stale' && st === 'stalemate')) termOk++;
      else problems.push(`bitmiş oyun yanlış: ${fx.fen} -> ${st}, beklenen ${fx.term}`);
    }
  }
  if (problems.length) console.log(problems.slice(0, 6).join('\n'));
  check(`python-chess karşılaştırması: ${sanTotal} hamlenin notasyonu (belirsizlik giderme, +, #, terfi, rok) birebir aynı`, sanOk === sanTotal && sanTotal > 3000);
  check(`python-chess karşılaştırması: ${sanTotal} notasyon geri okununca aynı hamle bulunuyor`, parseOk === sanTotal);
  check(`python-chess karşılaştırması: ${termTotal} bitmiş pozisyonda mat/pat ayrımı doğru`, termOk === termTotal && termTotal > 20);

  // Tam oyunlar: her hamle sonrası durum bayrakları ve PGN hamle metni
  type Gm = { start: string; moves: string[]; flags: number[]; movetext: string };
  const games = (fixtures as unknown as { games: Gm[] }).games;
  let plies = 0, flagOk = 0, textOk = 0, statusOk = 0;
  const seenFlags = { mate: 0, stale: 0, insuf: 0, rep: 0, fifty: 0 };
  const gp: string[] = [];
  for (const gm of games) {
    // 1) Ham tahtada her pozisyonun bayrakları (oyun bittikten sonra da devam eder: python da devam ediyor)
    const board = boardFromFen(gm.start);
    const keys: string[] = [];
    const sans: string[] = [];
    const flagsOf = (): number => {
      const legal = legalMoves(board);
      keys.push(positionKey(board, legal));
      const key = keys[keys.length - 1];
      return (
        (legal.length === 0 && board.inCheck() ? 1 : 0) |
        (legal.length === 0 && !board.inCheck() ? 2 : 0) |
        (isInsufficientMaterial(board) ? 4 : 0) |
        (keys.filter((k) => k === key).length >= 3 ? 8 : 0) |
        (board.halfmove >= 100 && legal.length > 0 ? 16 : 0)
      );
    };
    let f = flagsOf();
    plies++;
    if (f === gm.flags[0]) flagOk++; else gp.push(`bayrak ply 0 @ ${gm.start}: ${f} != ${gm.flags[0]}`);
    gm.moves.forEach((u, i) => {
      const m = findMoveUci(board, u);
      if (m === null) { gp.push('yasadışı hamle ' + u); return; }
      sans.push(moveToSan(board, m));
      board.makeMove(m);
      f = flagsOf();
      plies++;
      if (f & 1) seenFlags.mate++;
      if (f & 2) seenFlags.stale++;
      if (f & 4) seenFlags.insuf++;
      if (f & 8) seenFlags.rep++;
      if (f & 16) seenFlags.fifty++;
      if (f === gm.flags[i + 1]) flagOk++; else gp.push(`bayrak ply ${i + 1} @ ${gm.start}: ${f} != ${gm.flags[i + 1]}`);
    });
    if (movetextOf(gm.start, sans) === gm.movetext) textOk++; else gp.push(`PGN hamle metni farklı @ ${gm.start}`);

    // 2) ChessGame: ilk bitiş noktasına kadar oynar, durum önceliğine uyar ve sonra hamleyi reddeder
    const expectedKind = (fl: number) => (fl & 1 ? 'checkmate' : fl & 2 ? 'stalemate' : fl & 12 ? 'draw' : fl & 16 ? 'draw' : 'playing');
    const g = new ChessGame(gm.start);
    let ok = g.status.kind === expectedKind(gm.flags[0]);
    for (let i = 0; i < gm.moves.length && ok; i++) {
      if (g.isOver) { ok = g.playUci(gm.moves[i]) === null; break; }
      ok = g.playUci(gm.moves[i]) !== null && g.status.kind === expectedKind(gm.flags[i + 1]);
      const fl = gm.flags[i + 1];
      if (ok && g.status.kind === 'draw') {
        const reason = (g.status as { reason: string }).reason;
        ok = fl & 4 ? reason === 'insufficient' : fl & 8 ? reason === 'repetition' : reason === 'fifty';
      }
    }
    if (ok) statusOk++; else gp.push(`ChessGame durumu farklı @ ${gm.start}`);
  }
  if (gp.length) console.log(gp.slice(0, 6).join('\n'));
  check(`python-chess karşılaştırması: ${games.length} oyun, ${plies} pozisyonda mat/pat/yetersiz materyal/3 tekrar/50 hamle bayrakları birebir aynı`, flagOk === plies);
  check(`python-chess karşılaştırması: bayrakların hepsi gerçekten görüldü (3 tekrar ${seenFlags.rep}, 50 hamle ${seenFlags.fifty}, yetersiz materyal ${seenFlags.insuf})`, seenFlags.rep > 100 && seenFlags.fifty > 100 && seenFlags.insuf > 100);
  check(`python-chess karşılaştırması: ${games.length} oyunun PGN hamle metni birebir aynı`, textOk === games.length);
  check(`ChessGame durumları: ${games.length} oyunda bitiş önceliği ve nedeni doğru, oyun bitince hamle reddediliyor`, statusOk === games.length);
}

// Tahta nesnesi doğrudan da kullanılabilir olmalı (ek güvence)
check('Board sınıfı dışarıdan kullanılabilir', new Board() instanceof Board && START_FEN.length > 20);

console.log('\n' + passed + ' kontrol geçti.');
