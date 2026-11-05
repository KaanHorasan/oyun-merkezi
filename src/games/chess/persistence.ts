import { loadJSON, removeKey, saveJSON } from '@/lib/storage';
import { ChessGame } from './engine/game';
import type { SavedGame } from './engine/game';

const KEY = 'chess:save:v1';

type Stored = SavedGame & { flipped?: boolean };

export function saveChess(game: ChessGame, flipped: boolean): void {
  const data: Stored = { ...game.toSave(), flipped };
  saveJSON(KEY, data);
}

export type LoadedChess = { game: ChessGame; flipped: boolean };

/** Kayıtlı oyun varsa ve geçerliyse döner (bozuksa null). */
export async function loadChess(): Promise<LoadedChess | null> {
  const stored = await loadJSON<Stored | null>(KEY, null);
  if (!stored) return null;
  const game = ChessGame.fromSave(stored);
  return game ? { game, flipped: stored.flipped === true } : null;
}

export async function clearChess(): Promise<void> {
  await removeKey(KEY);
}
