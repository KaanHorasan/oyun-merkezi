// Çalıştırma: npx tsx src/games/chess/engine/perft.test.ts
// Hamle üretiminin altın standardı: yayımlanmış perft sayıları (satranç programlama dünyasında herkesçe kullanılan
// test pozisyonları). Tek bir sayı bile tutmazsa hamle üretiminde hata vardır.
import { boardFromFen, START_FEN } from './fen';
import { perft } from './moves';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}

type Case = { name: string; fen: string; counts: number[] };

const CASES: Case[] = [
  { name: 'Başlangıç pozisyonu', fen: START_FEN, counts: [20, 400, 8902, 197281, 4865609] },
  {
    name: 'Kiwipete (rok, geçerken alma, terfi, çekilmeler)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862, 4085603],
  },
  { name: 'Pozisyon 3 (piyon oyun sonu, çekilmeler)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238, 674624] },
  {
    name: 'Pozisyon 4 (terfi ve rok tuzakları)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467, 422333],
  },
  {
    name: 'Pozisyon 4 (renkleri ters çevrilmiş)',
    fen: 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1',
    counts: [6, 264, 9467, 422333],
  },
  { name: 'Pozisyon 5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', counts: [44, 1486, 62379, 2103487] },
  {
    name: 'Pozisyon 6',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890, 3894594],
  },
];

const DEEP = process.argv.includes('--deep');

for (const c of CASES) {
  const board = boardFromFen(c.fen);
  const before = board.clone();
  const t0 = Date.now();
  const got: number[] = [];
  for (let d = 1; d <= c.counts.length; d++) got.push(perft(board, d));
  const ms = Date.now() - t0;
  const ok = got.every((n, i) => n === c.counts[i]);
  if (!ok) console.log('  beklenen:', c.counts.join(', '), '\n  bulunan: ', got.join(', '));
  check(`${c.name}: perft 1-${c.counts.length} = ${got.join(', ')} (${ms} ms)`, ok);
  check(`${c.name}: perft sonrası pozisyon bozulmadı`, board.sameAs(before));
}
void DEEP;

console.log('\n' + passed + ' kontrol geçti.');
