// Taş kayma animasyonu ve sürükle-bırak için saf yardımcılar (React'ten bağımsız, testli).
import type { ChessGame, MoveRecord } from './engine/game';
import { FLAG_CASTLE_K, FLAG_CASTLE_Q, fileOf, moveFlags, moveFrom, movePromo, moveTo, rankOf } from './engine/types';

/** Bir taşın kayacağı yol (0x88 kareler) */
export type SlideLeg = { from: number; to: number };

/** Ekranda gösterilecek bir hamle animasyonu; `id` her hamlede değişir */
export type SlideAnim = { id: number; legs: SlideLeg[] };

/**
 * Yapılan hamlede hangi taşlar kayar: hareket eden taş, rokta ayrıca kale.
 * `viaDrag`: taş zaten sürükle-bırakla yerine konduysa onu kaydırmayız (yalnızca rokun kalesi kayar).
 */
export function slideLegs(rec: MoveRecord, viaDrag: boolean): SlideLeg[] {
  const from = moveFrom(rec.move);
  const to = moveTo(rec.move);
  const legs: SlideLeg[] = viaDrag ? [] : [{ from, to }];
  const flags = moveFlags(rec.move);
  const rank = rankOf(to);
  if (flags & FLAG_CASTLE_K) legs.push({ from: rank * 16 + 7, to: rank * 16 + 5 });
  else if (flags & FLAG_CASTLE_Q) legs.push({ from: rank * 16 + 0, to: rank * 16 + 3 });
  return legs;
}

/** Kayma süresi (ms): uzak kareye biraz uzun sürer, hep 120–260 ms arası */
export function slideDuration(leg: SlideLeg): number {
  const dist = Math.max(Math.abs(fileOf(leg.from) - fileOf(leg.to)), Math.abs(rankOf(leg.from) - rankOf(leg.to)));
  return Math.min(260, 120 + Math.max(0, dist - 1) * 20);
}

/** Sürüklemenin başladığı sayılan en az hareket (px): kare genişliğinin %18'i, en az 6 px */
export const dragThreshold = (cell: number): number => Math.max(6, cell * 0.18);

export type DropKind = 'none' | 'move' | 'promotion';

/** `from` karesindeki taş `to` karesine bırakılırsa ne olur: yasadışı, hamle ya da terfi seçimi */
export function dropKind(game: ChessGame, from: number, to: number): DropKind {
  if (from < 0 || to < 0 || from === to) return 'none';
  const moves = game.legalMovesFrom(from).filter((m) => moveTo(m) === to);
  if (moves.length === 0) return 'none';
  return moves.some((m) => movePromo(m) !== 0) ? 'promotion' : 'move';
}
