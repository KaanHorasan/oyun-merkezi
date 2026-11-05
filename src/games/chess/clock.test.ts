// Çalıştırma: npx tsx src/games/chess/clock.test.ts
// Satranç saati: hamle başı ve toplam süre modları, durdurma, geri alma, kayıt; süre bitimiyle oyunun sonu.
import { ChessClock, createClock, describeControl, formatClock, lowThresholdMs, presetById, TIME_PRESETS } from './clock';
import type { TimedControl } from './clock';
import { ChessGame } from './engine/game';
import { BLACK, WHITE } from './engine/types';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const S = 1000;

// ---------- Metinler ----------
{
  check('formatClock: dakika:saniye (yukarı yuvarlar)', formatClock(300_000) === '5:00' && formatClock(59_001) === '1:00' && formatClock(65_000) === '1:05' && formatClock(10_000) === '0:10');
  check('formatClock: 10 saniyenin altında onda birli', formatClock(9_900) === '9.9' && formatClock(7_300) === '7.3' && formatClock(40) === '0.1');
  check('formatClock: bittiğinde ve eksi değerde 0.0', formatClock(0) === '0.0' && formatClock(-5) === '0.0' && formatClock(NaN) === '0.0');
  check('formatClock: saati aşınca h:mm:ss', formatClock(3_725_000) === '1:02:05');
  check('describeControl', describeControl({ kind: 'none' }) === 'Süresiz' && describeControl({ kind: 'perMove', sec: 15 }) === 'Hamle başı 15 sn' && describeControl({ kind: 'total', baseSec: 180, incSec: 2 }) === '3 dk + 2 sn' && describeControl({ kind: 'total', baseSec: 600, incSec: 0 }) === '10 dk' && describeControl({ kind: 'total', baseSec: 90, incSec: 0 }) === '1 dk 30 sn');
  check('Hazır süreler: kimlikler benzersiz, bilinmeyen kimlik "Süresiz" olur', new Set(TIME_PRESETS.map((p) => p.id)).size === TIME_PRESETS.length && presetById('yok-boyle-bir-sey').id === 'none' && presetById('pm15').control.kind === 'perMove');
  check('createClock: süresizde null, zamanlıda saat', createClock({ kind: 'none' }) === null && createClock({ kind: 'perMove', sec: 10 }) instanceof ChessClock);
  check('Uyarı eşiği: hamle başı 5 sn, toplam 10 sn', lowThresholdMs({ kind: 'perMove', sec: 15 }) === 5000 && lowThresholdMs({ kind: 'total', baseSec: 300, incSec: 0 }) === 10000);
}

// ---------- Hamle başı süre ----------
{
  const c = new ChessClock({ kind: 'perMove', sec: 10 });
  const t0 = 1_000_000;
  check('Başlangıçta saat çalışmaz, ikisi de tam süre', !c.started && c.running === null && c.read(WHITE, t0) === 10 * S && c.read(BLACK, t0) === 10 * S);
  c.resume(WHITE, t0);
  check('İlk hamleden önce resume saati başlatmaz', c.running === null && c.flagged(t0 + 99 * S) === null);
  c.moved(WHITE, t0);
  check('Beyazın ilk hamlesi: saat siyaha geçer', c.started && c.running === BLACK);
  check('Siyahın süresi akar, beyazınki tam kalır', c.read(BLACK, t0 + 3 * S) === 7 * S && c.read(WHITE, t0 + 3 * S) === 10 * S);
  check('Süre dolmadan bayrak düşmez', c.flagged(t0 + 9_999) === null);
  check('Süre dolunca bayrak düşer (siyah)', c.flagged(t0 + 10 * S) === BLACK && c.read(BLACK, t0 + 50 * S) === 0);
  c.moved(BLACK, t0 + 4 * S);
  check('Hamle yapınca süre baştan başlar, sıra beyazda', c.running === WHITE && c.read(WHITE, t0 + 4 * S) === 10 * S && c.read(BLACK, t0 + 4 * S) === 10 * S);
  check('Beyazın süresi 10 sn sonra dolar', c.flagged(t0 + 14 * S) === WHITE);
}

// ---------- Toplam süre + artış ----------
{
  const c = new ChessClock({ kind: 'total', baseSec: 180, incSec: 2 });
  const t0 = 5_000_000;
  c.moved(WHITE, t0); // ilk hamle: artış yok, süre akmadı
  check('Toplam süre: ilk hamleye artış eklenmez', c.read(WHITE, t0) === 180 * S && c.running === BLACK);
  c.moved(BLACK, t0 + 5 * S); // siyah 5 sn düşündü, +2 artış
  check('Siyah: 180 - 5 + 2 = 177 sn', c.read(BLACK, t0 + 5 * S) === 177 * S && c.running === WHITE);
  c.moved(WHITE, t0 + 15 * S); // beyaz 10 sn düşündü, +2
  check('Beyaz: 180 - 10 + 2 = 172 sn', c.read(WHITE, t0 + 15 * S) === 172 * S && c.read(BLACK, t0 + 15 * S) === 177 * S);
  check('Toplam süre: rakibin saati aynı kalır, sıra siyahta', c.running === BLACK);
  const d = new ChessClock({ kind: 'total', baseSec: 60, incSec: 0 });
  d.moved(WHITE, 0);
  check('Toplam süre biterse bayrak düşer', d.flagged(59_999) === null && d.flagged(60 * S) === BLACK);
}

// ---------- Durdurma / devam ----------
{
  const c = new ChessClock({ kind: 'total', baseSec: 300, incSec: 0 });
  c.moved(WHITE, 0);
  c.pause(20 * S);
  check('Durdurunca akan süre işlenir ve saat durur', c.running === null && c.read(BLACK, 500 * S) === 280 * S);
  c.resume(BLACK, 100 * S);
  check('Devam edince kalan süreden sürer', c.running === BLACK && c.read(BLACK, 110 * S) === 270 * S);
  c.pause(110 * S);
  c.pause(300 * S); // çift durdurma zarar vermez
  check('Çift durdurma süreyi bozmaz', c.read(BLACK, 400 * S) === 270 * S);
}

// ---------- Geri alma ----------
{
  const c = new ChessClock({ kind: 'total', baseSec: 180, incSec: 2 });
  c.moved(WHITE, 0);
  c.moved(BLACK, 5 * S);
  c.moved(WHITE, 12 * S);
  // beyaz: 180 - 7 + 2 = 175, siyah: 177. Şimdi beyazın son hamlesi geri alınır
  c.undoMove(WHITE, 20 * S);
  check('Geri alınca beyazın süresi hamle öncesine döner, saat yine beyazda', c.running === WHITE && c.read(WHITE, 20 * S) === 180 * S && c.read(BLACK, 20 * S) === 177 * S);
  c.undoMove(BLACK, 30 * S);
  check('Siyahın hamlesi de geri alınır', c.running === BLACK && c.read(BLACK, 30 * S) === 180 * S);
  c.undoMove(WHITE, 40 * S);
  check('İlk hamle de geri alınınca saat başlamamış duruma döner', !c.started && c.running === null && c.read(WHITE, 99 * S) === 180 * S && c.read(BLACK, 99 * S) === 180 * S);
  c.undoMove(WHITE, 50 * S);
  check('Geçmiş boşken geri almak bir şey yapmaz', !c.started && c.running === null);

  const p = new ChessClock({ kind: 'perMove', sec: 15 });
  p.moved(WHITE, 0);
  p.moved(BLACK, 9 * S);
  p.undoMove(BLACK, 20 * S);
  check('Hamle başı modunda geri alınca sıra sahibine tam süre verilir', p.running === BLACK && p.read(BLACK, 20 * S) === 15 * S);
}

// ---------- Süre bitişini geri alma ----------
{
  const c = new ChessClock({ kind: 'total', baseSec: 60, incSec: 0 });
  c.moved(WHITE, 0);
  c.pause(70 * S);
  check('Süre biten oyuncunun kalan süresi 0', c.read(BLACK, 80 * S) === 0);
  c.grantTime(BLACK, 80 * S);
  check('Süre bitişi geri alınınca 15 sn ek süre verilir ve saat işler', c.running === BLACK && c.read(BLACK, 80 * S) === 15 * S && c.flagged(80 * S) === null);
  const p = new ChessClock({ kind: 'perMove', sec: 30 });
  p.moved(WHITE, 0);
  p.pause(40 * S);
  p.grantTime(BLACK, 50 * S);
  check('Hamle başı modunda tam hamle süresi geri verilir', p.read(BLACK, 50 * S) === 30 * S);
}

// ---------- Kayıt ----------
{
  const c = new ChessClock({ kind: 'total', baseSec: 300, incSec: 3 });
  c.moved(WHITE, 0);
  c.moved(BLACK, 4 * S);
  const save = JSON.parse(JSON.stringify(c.toSave(10 * S))); // beyaz 6 sn harcamış (akıyor)
  const r = ChessClock.fromSave(save)!;
  check('Kayıttan okuma: süreler ve geçmiş korunur', r !== null && r.control.kind === 'total' && r.read(WHITE, 99 * S) === 294 * S && r.read(BLACK, 99 * S) === 299 * S && r.started);
  check('Kayıttan gelen saat durmuş olarak başlar', r.running === null);
  r.resume(WHITE, 100 * S);
  r.moved(WHITE, 101 * S);
  r.undoMove(WHITE, 102 * S);
  check('Kayıttan gelen geçmişle geri alma çalışır', r.read(WHITE, 102 * S) === 294 * S);
  const control: TimedControl = { kind: 'perMove', sec: 10 };
  check('Bozuk kayıtlar reddedilir', ChessClock.fromSave(null) === null && ChessClock.fromSave({}) === null && ChessClock.fromSave({ control, remaining: [1, 'x'], history: [] }) === null && ChessClock.fromSave({ control: { kind: 'perMove', sec: -3 }, remaining: [1, 1], history: [] }) === null && ChessClock.fromSave({ control, remaining: [1, 1], history: [[1]] }) === null && ChessClock.fromSave({ control: { kind: 'total' }, remaining: [1, 1], history: [] }) === null);
}

// ---------- Süre bitimiyle oyun sonu ----------
{
  const g = new ChessGame();
  check('Başta oyun bitmemiş, süre kaybı yok', !g.isOver && g.timeoutLoser === null);
  check('Beyazın süresi biter: siyah kazanır', g.flag(WHITE) && g.status.kind === 'timeout' && g.status.winner === BLACK && g.isOver && g.result === '0-1' && g.timeoutLoser === WHITE);
  check('Biten oyunda tekrar bayrak düşmez, hamle yapılamaz', !g.flag(BLACK) && g.playUci('e2e4') === null);
  check('Kayıt yazılıp okununca süre kaybı korunur', (() => { const r = ChessGame.fromSave(JSON.parse(JSON.stringify(g.toSave())))!; return r.status.kind === 'timeout' && r.timeoutLoser === WHITE && r.result === '0-1'; })());
  check('Geri al süre kaybını kaldırır', g.undo() && !g.isOver && g.timeoutLoser === null && g.playUci('e2e4') !== null);

  const h = new ChessGame('k7/8/8/8/8/8/8/K6R w - - 0 1');
  check('Siyahın süresi biter, beyazın kalesi var: beyaz kazanır', h.flag(BLACK) && h.status.kind === 'timeout' && h.status.winner === WHITE && h.result === '1-0');
  const k = new ChessGame('k7/8/8/8/8/8/8/K6R w - - 0 1');
  check('Beyazın süresi biter ama siyahta yalnızca şah var: berabere', k.flag(WHITE) && k.status.kind === 'draw' && k.status.reason === 'timeout-insufficient' && k.result === '1/2-1/2' && k.timeoutLoser === WHITE);
  check('Bu beraberlik de geri alınabilir', k.undo() && !k.isOver);
}

console.log(`\n${passed} test geçti`);
