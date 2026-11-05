import type { Board } from './board';
import { legalMoves } from './moves';
import {
  FLAG_CASTLE_K,
  FLAG_CASTLE_Q,
  PAWN,
  fileOf,
  moveFlags,
  moveFrom,
  movePromo,
  moveTo,
  pieceType,
  rankOf,
  squareName,
} from './types';

const LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];
const FILES = 'abcdefgh';

/**
 * Hamlenin cebirsel notasyonu (SAN): Nf3, exd5, O-O, e8=Q+, Rad1, N5xe4#...
 * Hamle yapılmadan ÖNCEKİ pozisyonda çağrılır. `legal` o pozisyonun yasal hamleleridir (belirsizlik giderme için).
 */
export function moveToSan(board: Board, m: number, legal: number[] = legalMoves(board)): string {
  const from = moveFrom(m);
  const to = moveTo(m);
  const flags = moveFlags(m);
  const promo = movePromo(m);
  const type = pieceType(board.pieceAt(from));
  const capture = board.pieceAt(to) !== 0 || (flags & 2) !== 0; // geçerken alma da alıştır

  let san: string;
  if (flags & FLAG_CASTLE_K) san = 'O-O';
  else if (flags & FLAG_CASTLE_Q) san = 'O-O-O';
  else if (type === PAWN) {
    san = (capture ? FILES[fileOf(from)] + 'x' : '') + squareName(to);
    if (promo) san += '=' + LETTER[promo];
  } else {
    // Aynı türden başka bir taş da aynı kareye gidebiliyorsa nereden geldiğini belirt
    let sameFile = false, sameRank = false, ambiguous = false;
    for (const o of legal) {
      if (o === m || moveTo(o) !== to || moveFrom(o) === from) continue;
      if (pieceType(board.pieceAt(moveFrom(o))) !== type) continue;
      ambiguous = true;
      if (fileOf(moveFrom(o)) === fileOf(from)) sameFile = true;
      if (rankOf(moveFrom(o)) === rankOf(from)) sameRank = true;
    }
    let dis = '';
    if (ambiguous) {
      if (!sameFile) dis = FILES[fileOf(from)];
      else if (!sameRank) dis = String(rankOf(from) + 1);
      else dis = FILES[fileOf(from)] + (rankOf(from) + 1);
    }
    san = LETTER[type] + dis + (capture ? 'x' : '') + squareName(to);
  }

  // Şah (+) veya mat (#) eki
  board.makeMove(m);
  if (board.inCheck()) san += legalMoves(board).length === 0 ? '#' : '+';
  board.unmakeMove();
  return san;
}

/** SAN metninden yasal hamleyi bulur (+, #, !, ? işaretlerine ve 0-0 yazımına hoşgörülü). Bulunamazsa null. */
export function findMoveSan(board: Board, text: string): number | null {
  const clean = (s: string) => s.replace(/[+#!?]/g, '').replace(/0/g, 'O').trim();
  const wanted = clean(text);
  const legal = legalMoves(board);
  for (const m of legal) if (clean(moveToSan(board, m, legal)) === wanted) return m;
  return null;
}
