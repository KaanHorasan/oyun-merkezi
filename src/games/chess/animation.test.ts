// Çalıştırma: npx tsx src/games/chess/animation.test.ts
// Kayma animasyonu ve sürükle-bırak yardımcıları.
import { dragThreshold, dropKind, slideDuration, slideLegs } from './animation';
import { ChessGame } from './engine/game';
import { parseSquare } from './engine/types';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const sq = parseSquare;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

{
  const g = new ChessGame();
  const e4 = g.playUci('e2e4')!;
  check('Normal hamle: tek yol', same(slideLegs(e4, false), [{ from: sq('e2'), to: sq('e4') }]));
  check('Sürükleyerek yapılan normal hamle kaydırılmaz', slideLegs(e4, true).length === 0);
}
{
  const g = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const ks = g.playUci('e1g1')!;
  check('Kısa rok: şah e1-g1 ve kale h1-f1', same(slideLegs(ks, false), [{ from: sq('e1'), to: sq('g1') }, { from: sq('h1'), to: sq('f1') }]));
  check('Kısa rokta sürüklenen şah kaymaz, kale kayar', same(slideLegs(ks, true), [{ from: sq('h1'), to: sq('f1') }]));
  const qs = g.playUci('e8c8')!;
  check('Siyah uzun rok: kale a8-d8', same(slideLegs(qs, false), [{ from: sq('e8'), to: sq('c8') }, { from: sq('a8'), to: sq('d8') }]));
}
{
  const g = new ChessGame('4k3/P7/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const ep = g.playUci('e5d6')!;
  check('Geçerken alma tek yoldur', slideLegs(ep, false).length === 1);
}
{
  check('Süre 120–260 ms arasında ve uzaklıkla artar', slideDuration({ from: sq('e2'), to: sq('e3') }) === 120 && slideDuration({ from: sq('a1'), to: sq('h8') }) > slideDuration({ from: sq('e2'), to: sq('e4') }) && slideDuration({ from: sq('a1'), to: sq('h8') }) <= 260);
  check('Sürükleme eşiği: küçük karede 6 px, büyükte kare payı', dragThreshold(20) === 6 && Math.abs(dragThreshold(100) - 18) < 1e-9);
}
{
  const g = new ChessGame();
  check('Yasal hamleye bırakmak: move', dropKind(g, sq('e2'), sq('e4')) === 'move');
  check('Yasadışı kareye, aynı kareye ve tahta dışına bırakmak: none', dropKind(g, sq('e2'), sq('e5')) === 'none' && dropKind(g, sq('e2'), sq('e2')) === 'none' && dropKind(g, sq('e2'), -1) === 'none' && dropKind(g, -1, sq('e4')) === 'none');
  check('Rakip taşı sürüklemek yasadışıdır', dropKind(g, sq('e7'), sq('e5')) === 'none');
  const p = new ChessGame('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  check('Son sıraya piyon bırakmak: terfi seçimi', dropKind(p, sq('a7'), sq('a8')) === 'promotion');
  const r = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  check('Şahı iki kare yana bırakmak rok hamlesidir', dropKind(r, sq('e1'), sq('g1')) === 'move');
}

console.log(`\n${passed} test geçti`);
