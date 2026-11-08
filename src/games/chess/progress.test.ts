// Çalıştırma: npx tsx src/games/chess/progress.test.ts
// Satranç -> görev/başarım istatistikleri (oyun bitince, kısa oyun sayılmaz, saymada sömürü yok).
import { ACHIEVEMENTS, QUEST_TEMPLATES, STAT_KIND } from '../../lib/progress/definitions';
import type { StatId } from '../../lib/progress/definitions';
import { ChessGame } from './engine/game';
import { BLACK, WHITE } from './engine/types';
import { MIN_PLIES, statsForFinishedGame } from './progress';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const play = (g: ChessGame, ...ucis: string[]) => ucis.forEach((u) => { if (!g.playUci(u)) throw new Error('yasadışı: ' + u); });
const val = (stats: { stat: StatId; value: number }[], id: StatId) => stats.find((s) => s.stat === id)?.value ?? 0;

// ---------- Tanımlar ----------
{
  const chessStats = new Set<StatId>(['ch.games', 'ch.timedGames', 'ch.checkmates', 'ch.captures', 'ch.promotions', 'ch.castles']);
  check('Satranç istatistiklerinin hepsi toplanan (sum) türde', [...chessStats].every((s) => STAT_KIND[s] === 'sum'));
  check('Her satranç istatistiğine bir başarım bağlı', [...chessStats].every((s) => ACHIEVEMENTS.some((a) => a.game === 'chess' && a.stat === s)));
  check('Satranç görev şablonları var ve hepsi satranç istatistiği kullanır', QUEST_TEMPLATES.filter((t) => t.game === 'chess').length >= 4 && QUEST_TEMPLATES.filter((t) => t.game === 'chess').every((t) => chessStats.has(t.stat)));
}

// ---------- Bitmemiş ve kısa oyunlar ----------
{
  const g = new ChessGame();
  play(g, 'e2e4', 'e7e5');
  check('Bitmemiş oyun sayılmaz', statsForFinishedGame(g, false).length === 0);

  const fool = new ChessGame();
  play(fool, 'f2f3', 'e7e5', 'g2g4', 'd8h4'); // çocuk matı: 4 yarım hamle
  check('Mat olsa bile çok kısa oyun (4 hamle) sayılmaz', fool.status.kind === 'checkmate' && fool.records.length < MIN_PLIES && statsForFinishedGame(fool, false).length === 0);

  const r = new ChessGame();
  play(r, 'e2e4', 'e7e5');
  r.resign(WHITE);
  check('Kısa oyunda teslim olmak da sayılmaz (hızlı oyun-bitirme sömürüsü yok)', statsForFinishedGame(r, false).length === 0);
}

// ---------- Uzun oyun: rok, bitirilen oyun ----------
{
  const g = new ChessGame();
  play(g, 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1', 'g8f6', 'd2d3', 'e8g8'); // 10 yarım hamle, iki rok
  check('10 hamlede oyun hâlâ bitmemiş', !g.isOver && g.records.length === MIN_PLIES);
  g.resign(BLACK);
  const st = statsForFinishedGame(g, false);
  check('Bitirilen oyun: 1 oyun, 2 rok, alış yok, süreli değil, mat değil', val(st, 'ch.games') === 1 && val(st, 'ch.castles') === 2 && val(st, 'ch.captures') === 0 && val(st, 'ch.timedGames') === 0 && val(st, 'ch.checkmates') === 0);
  check('Süreli oyun ayrıca sayılır', val(statsForFinishedGame(g, true), 'ch.timedGames') === 1);
}

// ---------- Alış, terfi, mat (kısa sınırı 1'e indirilerek, pozisyondan) ----------
{
  const cap = new ChessGame('k7/8/8/3p4/4P3/8/8/K7 w - - 0 1');
  play(cap, 'e4d5');
  cap.resign(BLACK);
  check('Alınan taş sayılır', val(statsForFinishedGame(cap, false, 1), 'ch.captures') === 1);

  const promo = new ChessGame('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  play(promo, 'a7a8q');
  promo.agreeDraw();
  const ps = statsForFinishedGame(promo, false, 1);
  check('Terfi sayılır, alış değil', val(ps, 'ch.promotions') === 1 && val(ps, 'ch.captures') === 0);

  const mate = new ChessGame('k7/8/1K6/8/8/8/8/7R w - - 0 1');
  play(mate, 'h1h8');
  const ms = statsForFinishedGame(mate, false, 1);
  check('Şah mat sayılır', mate.status.kind === 'checkmate' && val(ms, 'ch.checkmates') === 1 && val(ms, 'ch.games') === 1);

  const ep = new ChessGame('k7/8/8/3pP3/8/8/8/K7 w - d6 0 1');
  play(ep, 'e5d6');
  ep.resign(BLACK);
  check('Geçerken alma da alış sayılır', val(statsForFinishedGame(ep, false, 1), 'ch.captures') === 1);

  const timeout = new ChessGame('k7/8/8/8/8/8/8/K6R w - - 0 1');
  timeout.flag(BLACK);
  check('Süre bitimi de bitmiş oyundur', val(statsForFinishedGame(timeout, true, 0), 'ch.games') === 1);
}

console.log(`\n${passed} test geçti`);
