import { loadJSON, removeKey, saveJSON } from '@/lib/storage';
import { ChessClock, nowMs } from './clock';
import type { ClockSave } from './clock';
import { ChessGame } from './engine/game';
import type { SavedGame } from './engine/game';

const KEY = 'chess:save:v1';

type Stored = SavedGame & { flipped?: boolean; clock?: ClockSave };

/** Saat kayda o anki süreleriyle yazılır (saat durmuş sayılır; "Devam et" kaldığı yerden sürdürür). */
export function saveChess(game: ChessGame, flipped: boolean, clock: ChessClock | null = null): void {
  const data: Stored = { ...game.toSave(), flipped };
  if (clock) data.clock = clock.toSave(nowMs());
  saveJSON(KEY, data);
}

export type LoadedChess = { game: ChessGame; flipped: boolean; /** Süresiz oyunda null */ clock: ChessClock | null };

/** Kayıtlı oyun varsa ve geçerliyse döner (bozuksa null). Saat kaydı yoksa/bozuksa oyun süresiz devam eder. */
export async function loadChess(): Promise<LoadedChess | null> {
  const stored = await loadJSON<Stored | null>(KEY, null);
  if (!stored) return null;
  const game = ChessGame.fromSave(stored);
  if (!game) return null;
  return { game, flipped: stored.flipped === true, clock: stored.clock ? ChessClock.fromSave(stored.clock) : null };
}

export async function clearChess(): Promise<void> {
  await removeKey(KEY);
}
