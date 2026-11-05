// Tahta <-> ekran eşlemesi (tahtayı çevirme dahil). Çizim ve dokunma AYNI formülleri kullanır.
import { fileOf, rankOf } from './engine/types';

/** Karenin tahtadaki sütunu/satırı (0,0 = sol üst). Normalde beyaz altta: a1 sol altta. Çevrilince siyah altta. */
export function squareToCell(sq: number, flipped: boolean): { col: number; row: number } {
  const f = fileOf(sq);
  const r = rankOf(sq);
  return flipped ? { col: 7 - f, row: r } : { col: f, row: 7 - r };
}

/** Sütun/satırdan 0x88 kare */
export function cellToSquare(col: number, row: number, flipped: boolean): number {
  const f = flipped ? 7 - col : col;
  const r = flipped ? row : 7 - row;
  return r * 16 + f;
}

/** Tahta içindeki bir piksel noktasının hangi kareye denk geldiği; tahta dışındaysa -1 */
export function xyToSquare(x: number, y: number, boardSize: number, flipped: boolean): number {
  if (!(boardSize > 0) || x < 0 || y < 0 || x >= boardSize || y >= boardSize) return -1;
  const cell = boardSize / 8;
  return cellToSquare(Math.min(7, Math.floor(x / cell)), Math.min(7, Math.floor(y / cell)), flipped);
}

/** Karenin sol-üst köşesi (piksel) */
export function squareOrigin(sq: number, boardSize: number, flipped: boolean): { x: number; y: number } {
  const { col, row } = squareToCell(sq, flipped);
  const cell = boardSize / 8;
  return { x: col * cell, y: row * cell };
}

/** Karenin rengi: a1 koyu */
export const isDarkSquare = (sq: number): boolean => ((fileOf(sq) + rankOf(sq)) & 1) === 0;
