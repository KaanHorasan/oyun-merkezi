import { BISHOP_DIRS, KING_STEPS, KNIGHT_STEPS, ROOK_DIRS } from './board';
import type { Board } from './board';
import {
  BISHOP,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  EMPTY,
  FLAG_CASTLE_K,
  FLAG_CASTLE_Q,
  FLAG_DOUBLE,
  FLAG_EP,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  encodeMove,
  moveFrom,
  movePromo,
  moveTo,
  moveToUci,
  parseUciParts,
  pieceColor,
  pieceType,
} from './types';
import type { Color } from './types';

const PROMOTIONS = [QUEEN, ROOK, BISHOP, KNIGHT];

/**
 * Sözde yasal (pseudo-legal) hamleler: taşların hareket kurallarına uyar ama kendi şahını açıkta bırakabilir.
 * Rok için şahın tehdit altında olmaması ve geçtiği karelerin tehdit altında olmaması burada denetlenir.
 */
export function generatePseudoMoves(board: Board, out: number[]): void {
  const sqs = board.squares;
  const us = board.turn;
  const them = (us ^ 1) as Color;
  const pushDir = us === WHITE ? 16 : -16;
  const startRank = us === WHITE ? 1 : 6;
  const lastRank = us === WHITE ? 7 : 0;

  for (let from = 0; from < 128; from++) {
    if (from & 0x88) {
      from += 7;
      continue;
    }
    const piece = sqs[from];
    if (piece === EMPTY || pieceColor(piece) !== us) continue;
    const type = pieceType(piece);

    if (type === PAWN) {
      const one = from + pushDir;
      if (sqs[one] === EMPTY) {
        if (one >> 4 === lastRank) {
          for (const promo of PROMOTIONS) out.push(encodeMove(from, one, promo));
        } else {
          out.push(encodeMove(from, one));
          if (from >> 4 === startRank && sqs[one + pushDir] === EMPTY) {
            out.push(encodeMove(from, one + pushDir, 0, FLAG_DOUBLE));
          }
        }
      }
      for (const df of [-1, 1]) {
        const to = from + pushDir + df;
        if (to & 0x88) continue;
        const target = sqs[to];
        if (target !== EMPTY && pieceColor(target) === them) {
          if (to >> 4 === lastRank) {
            for (const promo of PROMOTIONS) out.push(encodeMove(from, to, promo));
          } else {
            out.push(encodeMove(from, to));
          }
        } else if (to === board.ep) {
          out.push(encodeMove(from, to, 0, FLAG_EP));
        }
      }
      continue;
    }

    if (type === KNIGHT || type === KING) {
      const steps = type === KNIGHT ? KNIGHT_STEPS : KING_STEPS;
      for (let i = 0; i < 8; i++) {
        const to = from + steps[i];
        if (to & 0x88) continue;
        const target = sqs[to];
        if (target === EMPTY || pieceColor(target) === them) out.push(encodeMove(from, to));
      }
      continue;
    }

    // Kayan taşlar: fil, kale, vezir
    const diagonal = type === BISHOP || type === QUEEN;
    const straight = type === ROOK || type === QUEEN;
    if (diagonal) slide(sqs, from, BISHOP_DIRS, them, out);
    if (straight) slide(sqs, from, ROOK_DIRS, them, out);
  }

  generateCastling(board, us, them, out);
}

function slide(sqs: Int8Array, from: number, dirs: number[], them: Color, out: number[]): void {
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    let to = from + d;
    while (!(to & 0x88)) {
      const target = sqs[to];
      if (target === EMPTY) {
        out.push(encodeMove(from, to));
      } else {
        if (pieceColor(target) === them) out.push(encodeMove(from, to));
        break;
      }
      to += d;
    }
  }
}

function generateCastling(board: Board, us: Color, them: Color, out: number[]): void {
  const sqs = board.squares;
  const base = us === WHITE ? 0x00 : 0x70;
  const kingSq = base + 4;
  const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
  const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
  if (!(board.castling & (kingSide | queenSide))) return;
  if (board.isAttacked(kingSq, them)) return; // şah çekilirken rok yapılamaz

  // Kısa rok: f ve g boş; şah f ve g'den geçer (ve g'ye varır), bu kareler tehdit altında olmamalı
  if (board.castling & kingSide) {
    if (
      sqs[base + 5] === EMPTY &&
      sqs[base + 6] === EMPTY &&
      !board.isAttacked(base + 5, them) &&
      !board.isAttacked(base + 6, them)
    ) {
      out.push(encodeMove(kingSq, base + 6, 0, FLAG_CASTLE_K));
    }
  }
  // Uzun rok: b, c, d boş; şah d ve c'den geçer. b karesi tehdit altında olabilir (şah oradan geçmez)
  if (board.castling & queenSide) {
    if (
      sqs[base + 1] === EMPTY &&
      sqs[base + 2] === EMPTY &&
      sqs[base + 3] === EMPTY &&
      !board.isAttacked(base + 3, them) &&
      !board.isAttacked(base + 2, them)
    ) {
      out.push(encodeMove(kingSq, base + 2, 0, FLAG_CASTLE_Q));
    }
  }
}

/** Tüm yasal hamleler (kendi şahını açıkta bırakmayanlar) */
export function legalMoves(board: Board): number[] {
  const pseudo: number[] = [];
  generatePseudoMoves(board, pseudo);
  const us = board.turn;
  const them = (us ^ 1) as Color;
  const legal: number[] = [];
  for (let i = 0; i < pseudo.length; i++) {
    const m = pseudo[i];
    board.makeMove(m);
    if (!board.isAttacked(board.king[us], them)) legal.push(m);
    board.unmakeMove();
  }
  return legal;
}

/** Belirli bir kareden başlayan yasal hamleler (arayüzde taşa dokununca yasal kareleri göstermek için) */
export function legalMovesFrom(board: Board, from: number): number[] {
  return legalMoves(board).filter((m) => moveFrom(m) === from);
}

/** (nereden, nereye, terfi) ile eşleşen yasal hamleyi bulur; yoksa null. Terfi belirtilmezse vezir varsayılır. */
export function findMove(board: Board, from: number, to: number, promo = 0): number | null {
  const candidates = legalMoves(board).filter((m) => moveFrom(m) === from && moveTo(m) === to);
  if (candidates.length === 0) return null;
  const needsPromo = candidates.some((m) => movePromo(m) !== 0);
  const wanted = needsPromo ? promo || QUEEN : 0;
  return candidates.find((m) => movePromo(m) === wanted) ?? null;
}

/** "e2e4" gibi UCI metnindeki hamleyi bulur; yasal değilse null */
export function findMoveUci(board: Board, uci: string): number | null {
  const parts = parseUciParts(uci);
  if (!parts) return null;
  const candidates = legalMoves(board).filter(
    (m) => moveFrom(m) === parts.from && moveTo(m) === parts.to && movePromo(m) === parts.promo,
  );
  return candidates[0] ?? null;
}

export const legalMovesUci = (board: Board): string[] => legalMoves(board).map(moveToUci);

// ---------- perft: hamle üretiminin altın standardı ----------

/** Belirli derinlikte ulaşılabilen yaprak (pozisyon) sayısı. Yayımlanmış sayılarla karşılaştırılır. */
export function perft(board: Board, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(board);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (let i = 0; i < moves.length; i++) {
    board.makeMove(moves[i]);
    nodes += perft(board, depth - 1);
    board.unmakeMove();
  }
  return nodes;
}

/** Her kök hamlesi için perft (bir sayı tutmadığında hatayı bulmak için) */
export function perftDivide(board: Board, depth: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of legalMoves(board)) {
    board.makeMove(m);
    out[moveToUci(m)] = perft(board, depth - 1);
    board.unmakeMove();
  }
  return out;
}

