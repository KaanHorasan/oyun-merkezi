// Satranç motoru: temel tipler ve yardımcılar (arayüzden bağımsız, saf TypeScript).
//
// Tahta "0x88" gösterimiyle tutulur: kare = satır * 16 + sütun (satır 0 = beyazın ilk sırası, sütun 0 = a).
// Tahta dışına çıkan kare, (kare & 0x88) != 0 ile tek işlemde anlaşılır.

export const WHITE = 0;
export const BLACK = 1;
export type Color = 0 | 1;

// Taş türleri (renksiz)
export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

// Taş kodu: tür | (renk << 3). Beyaz 1..6, siyah 9..14, boş 0.
export const pieceType = (p: number): number => p & 7;
export const pieceColor = (p: number): Color => (p >> 3) as Color;
export const makePiece = (color: Color, type: number): number => type | (color << 3);

// Rok hakları (bit maskesi)
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

// ---------- Kareler ----------

export const square = (file: number, rank: number): number => rank * 16 + file;
export const fileOf = (s: number): number => s & 7;
export const rankOf = (s: number): number => s >> 4;
export const offBoard = (s: number): boolean => (s & 0x88) !== 0;

/** 0x88 kareyi "e4" gibi adlandırır */
export const squareName = (s: number): string => String.fromCharCode(97 + fileOf(s)) + (rankOf(s) + 1);

/** "e4" -> kare; geçersizse -1 */
export function parseSquare(name: string): number {
  if (name.length !== 2) return -1;
  const file = name.charCodeAt(0) - 97;
  const rank = name.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return square(file, rank);
}

// ---------- Hamle: tek bir sayıya paketlenir ----------
// bit 0-6: nereden · bit 7-13: nereye · bit 14-16: terfi türü (0 yok) · bit 17-20: bayraklar

export const FLAG_DOUBLE = 1; // piyon iki adım
export const FLAG_EP = 2; // geçerken alma
export const FLAG_CASTLE_K = 4; // kısa rok
export const FLAG_CASTLE_Q = 8; // uzun rok

export const encodeMove = (from: number, to: number, promo = 0, flags = 0): number =>
  from | (to << 7) | (promo << 14) | (flags << 17);
export const moveFrom = (m: number): number => m & 0x7f;
export const moveTo = (m: number): number => (m >> 7) & 0x7f;
export const movePromo = (m: number): number => (m >> 14) & 7;
export const moveFlags = (m: number): number => (m >> 17) & 15;

const PROMO_CHARS = ['', '', 'n', 'b', 'r', 'q'];
const PROMO_FROM_CHAR: Record<string, number> = { n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };

/** "e2e4", "e7e8q" biçiminde (UCI) yazım */
export function moveToUci(m: number): string {
  return squareName(moveFrom(m)) + squareName(moveTo(m)) + PROMO_CHARS[movePromo(m)];
}

/** UCI metnini (from, to, promo) üçlüsüne çevirir; geçersizse null */
export function parseUciParts(uci: string): { from: number; to: number; promo: number } | null {
  if (uci.length < 4 || uci.length > 5) return null;
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from < 0 || to < 0) return null;
  let promo = 0;
  if (uci.length === 5) {
    promo = PROMO_FROM_CHAR[uci[4]] ?? 0;
    if (!promo) return null;
  }
  return { from, to, promo };
}

// FEN harfleri
export const PIECE_CHARS = ' PNBRQK';
export const pieceToChar = (p: number): string => {
  const c = PIECE_CHARS[pieceType(p)];
  return pieceColor(p) === WHITE ? c : c.toLowerCase();
};
export function charToPiece(ch: string): number {
  const idx = PIECE_CHARS.indexOf(ch.toUpperCase());
  if (idx < 1) return EMPTY;
  return makePiece(ch === ch.toUpperCase() ? WHITE : BLACK, idx);
}
