import type { Board } from './board';
import { BISHOP, BLACK, EMPTY, FLAG_EP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, moveFlags, pieceColor, pieceToChar, pieceType } from './types';
import type { Color } from './types';

/**
 * Bir renk, ne kadar uğraşırsa uğraşsın rakibini mat edemez mi?
 * (Tanım, python-chess'in `has_insufficient_material` kuralıyla birebir aynıdır; testler onunla karşılaştırır.)
 */
function cannotEverMate(board: Board, color: Color): boolean {
  let ownPieces = 0; // şah dahil
  let ownKnights = 0, ownBishops = 0, ownMajors = 0; // piyon, kale, vezir
  let oppNonKingNonQueen = 0;
  let allKnights = 0, allPawns = 0;
  let bishopsOnLight = 0, bishopsOnDark = 0; // iki rengin filleri birlikte

  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const p = board.squares[s];
    if (p === EMPTY) continue;
    const type = pieceType(p);
    const mine = pieceColor(p) === color;
    if (type === KNIGHT) allKnights++;
    if (type === PAWN) allPawns++;
    if (type === BISHOP) {
      if (((s & 7) + (s >> 4)) & 1) bishopsOnLight++;
      else bishopsOnDark++;
    }
    if (mine) {
      ownPieces++;
      if (type === PAWN || type === ROOK || type === QUEEN) ownMajors++;
      else if (type === KNIGHT) ownKnights++;
      else if (type === BISHOP) ownBishops++;
    } else if (type !== KING && type !== QUEEN) {
      oppNonKingNonQueen++;
    }
  }

  if (ownMajors > 0) return false;
  // Tek at: yalnızca tek başına ve rakibin piyonu/atı/fili/kalesi yoksa yetersiz (aksi halde kendi kendine mat mümkün)
  if (ownKnights > 0) return ownPieces <= 2 && oppNonKingNonQueen === 0;
  // Filler: hepsi aynı renk karede, ortada piyon ve at yoksa yetersiz
  if (ownBishops > 0) {
    const sameColor = bishopsOnLight === 0 || bishopsOnDark === 0;
    return sameColor && allPawns === 0 && allKnights === 0;
  }
  return true; // yalnızca şah
}

/** İki taraf da mat edemiyorsa oyun kendiliğinden berabere biter (ör. şah + şah, şah + fil + şah). */
export function isInsufficientMaterial(board: Board): boolean {
  return cannotEverMate(board, WHITE) && cannotEverMate(board, BLACK);
}

/**
 * Pozisyon anahtarı: tahta + sıra + rok hakları + (yalnızca gerçekten yasal bir geçerken alma varsa) ep karesi.
 * Üç kez tekrar sayımı bu anahtarla yapılır. `legal`, o pozisyonun yasal hamleleridir.
 */
export function positionKey(board: Board, legal: number[]): string {
  let s = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board.squares[r * 16 + f];
      s += p === EMPTY ? '.' : pieceToChar(p);
    }
  }
  let ep = -1;
  if (board.ep >= 0 && legal.some((m) => moveFlags(m) & FLAG_EP)) ep = board.ep;
  return `${s} ${board.turn === WHITE ? 'w' : 'b'} ${board.castling} ${ep}`;
}

export const opposite = (c: Color): Color => (c === WHITE ? BLACK : WHITE);
