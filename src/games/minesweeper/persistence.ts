import { loadJSON, removeKey, saveJSON } from '@/lib/storage';
import { exportWorld, importWorld } from './world';
import type { Difficulty, World, WorldData } from './world';

const RUN_KEY = 'minesweeper:run:v1';
const BEST_KEY = 'minesweeper:best:v1';

export type ViewState = { x: number; y: number; cell: number }; // geometry.ts içindeki View ile aynı şekil
export type SavedRun = { world: WorldData; view: ViewState; savedAt: number };
export type BestScores = Record<Difficulty, number>;

export const EMPTY_BEST: BestScores = { easy: 0, normal: 0, hard: 0 };

export async function saveRun(world: World, view: ViewState): Promise<void> {
  const run: SavedRun = { world: exportWorld(world), view, savedAt: Date.now() };
  await saveJSON(RUN_KEY, run);
}

/** Kayıtlı oyun varsa ve geçerliyse döner (bozuksa null). */
export async function loadRun(): Promise<SavedRun | null> {
  const run = await loadJSON<SavedRun | null>(RUN_KEY, null);
  if (!run || !run.world || !run.view) return null;
  if (!Number.isFinite(run.view.x) || !Number.isFinite(run.view.y) || !Number.isFinite(run.view.cell)) return null;
  return run;
}

export function restoreWorld(run: SavedRun): World | null {
  return importWorld(run.world);
}

export async function clearRun(): Promise<void> {
  await removeKey(RUN_KEY);
}

export async function loadBest(): Promise<BestScores> {
  const saved = await loadJSON<Partial<BestScores>>(BEST_KEY, {});
  return { ...EMPTY_BEST, ...saved };
}

export async function saveBest(best: BestScores): Promise<void> {
  await saveJSON(BEST_KEY, best);
}
