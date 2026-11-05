import type { Board } from './engine/board';
import type { ChessGame } from './engine/game';
import { BLACK, EMPTY, WHITE, pieceColor, pieceType } from './engine/types';
import type { Color } from './engine/types';

export const PIECE_VALUE = [0, 1, 3, 3, 5, 9, 0]; // boş, piyon, at, fil, kale, vezir, şah

/** `color` rengin aldığı (rakibin) taşlar, değeri yüksekten düşüğe */
export function capturedBy(game: ChessGame, color: Color): number[] {
  return game.records
    .filter((r) => r.captured !== EMPTY && r.mover === color)
    .map((r) => r.captured)
    .sort((a, b) => PIECE_VALUE[pieceType(b)] - PIECE_VALUE[pieceType(a)] || pieceType(b) - pieceType(a));
}

/** Tahtadaki maddi fark: beyaz - siyah (terfiler dahil, tahtadaki gerçek duruma göre) */
export function materialBalance(board: Board): number {
  let sum = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const p = board.squares[s];
    if (p === EMPTY) continue;
    sum += PIECE_VALUE[pieceType(p)] * (pieceColor(p) === WHITE ? 1 : -1);
  }
  return sum;
}

/** Bir tarafın maddi üstünlüğü (0 ya da pozitif) */
export const advantageOf = (board: Board, color: Color): number => {
  const b = materialBalance(board);
  return Math.max(0, color === WHITE ? b : -b);
};

export const colorName = (c: Color): string => (c === WHITE ? 'Beyaz' : 'Siyah');
export const otherColor = (c: Color): Color => (c === WHITE ? BLACK : WHITE);
