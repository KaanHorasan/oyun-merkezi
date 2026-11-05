// Arayüzün dokunma akışı (taş seç, yasal kareyi göster, hamle yap, terfi seç). Saf mantık: React'ten bağımsız, testli.
import type { ChessGame, MoveRecord } from './engine/game';
import { EMPTY, FLAG_EP, moveFlags, movePromo, moveTo, pieceColor } from './engine/types';

export type UiState = {
  selected: number | null;
  /** Terfi seçimi bekleyen hamle */
  promotion: { from: number; to: number } | null;
};

export const INITIAL_UI: UiState = { selected: null, promotion: null };

export type TapResult = { ui: UiState; moved: MoveRecord | null };

export type Target = { sq: number; capture: boolean };

/** Seçili taşın gidebileceği kareler (aynı karedeki terfi seçenekleri tek sayılır) */
export function targetsOf(game: ChessGame, from: number | null): Target[] {
  if (from === null) return [];
  const seen = new Set<number>();
  const out: Target[] = [];
  for (const m of game.legalMovesFrom(from)) {
    const to = moveTo(m);
    if (seen.has(to)) continue;
    seen.add(to);
    out.push({ sq: to, capture: game.board.pieceAt(to) !== EMPTY || (moveFlags(m) & FLAG_EP) !== 0 });
  }
  return out;
}

const isOwn = (game: ChessGame, sq: number): boolean => {
  const p = game.board.pieceAt(sq);
  return p !== EMPTY && pieceColor(p) === game.turn;
};

/** Bir kareye dokunuldu */
export function tapSquare(game: ChessGame, ui: UiState, sq: number): TapResult {
  if (sq < 0 || (sq & 0x88) !== 0) return { ui: INITIAL_UI, moved: null };
  if (game.isOver) return { ui: INITIAL_UI, moved: null };
  if (ui.promotion) return { ui: INITIAL_UI, moved: null }; // terfi seçicisi açıkken tahtaya dokunmak iptal eder

  if (ui.selected !== null) {
    if (sq === ui.selected) return { ui: INITIAL_UI, moved: null };
    const candidates = game.legalMovesFrom(ui.selected).filter((m) => moveTo(m) === sq);
    if (candidates.length > 0) {
      if (candidates.some((m) => movePromo(m) !== 0)) {
        return { ui: { selected: ui.selected, promotion: { from: ui.selected, to: sq } }, moved: null };
      }
      const moved = game.play(ui.selected, sq);
      return { ui: INITIAL_UI, moved };
    }
    if (isOwn(game, sq)) return { ui: { selected: sq, promotion: null }, moved: null };
    return { ui: INITIAL_UI, moved: null };
  }

  if (isOwn(game, sq)) return { ui: { selected: sq, promotion: null }, moved: null };
  return { ui: INITIAL_UI, moved: null };
}

/** Terfi seçicisinden bir taş seçildi (promoType: at/fil/kale/vezir) */
export function choosePromotion(game: ChessGame, ui: UiState, promoType: number): TapResult {
  if (!ui.promotion) return { ui, moved: null };
  const moved = game.play(ui.promotion.from, ui.promotion.to, promoType);
  return { ui: INITIAL_UI, moved };
}

export const cancelUi = (): UiState => INITIAL_UI;

/** Şah çekilen tarafın şahının karesi (yoksa -1): vurgulamak için */
export function checkedKingSquare(game: ChessGame): number {
  return game.board.inCheck() ? game.board.king[game.turn] : -1;
}
