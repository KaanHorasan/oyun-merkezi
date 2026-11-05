// Satranç ekranının ekran boyutuna göre yerleşimi. Saf mantık (React'ten bağımsız, testli).
//
// - Dikey (telefon, dar pencere): tahta üstte, altında oyuncu çubukları, durum, hamleler ve düğmeler.
// - Yatay (telefon yan, tablet, bilgisayar): tahta solda, sağda yan panel (oyuncular, durum, düğmeler, hamleler).
// - `scale`: yazı ve boşlukların ölçeği; küçük ekranda biraz küçülür, tablet/bilgisayarda büyür.

export type Insets = { top: number; bottom: number; left: number; right: number };

export type Layout = {
  mode: 'portrait' | 'landscape';
  /** Tahtanın kenar uzunluğu (px) */
  boardSize: number;
  /** Arayüz ölçeği (0.85 – 1.35) */
  scale: number;
  /** Yatay düzende yan panel genişliği; dikeyde 0 */
  sideWidth: number;
};

export const HEADER_HEIGHT = 48; // "‹ Menü / Satranç / ⚙" çubuğu
const PAD = 12; // yan boşluk
const GAP = 12; // yatayda tahta ile panel arası
export const MIN_BOARD = 200;
export const MAX_BOARD_PORTRAIT = 760;
export const MAX_BOARD_LANDSCAPE = 900;
export const SIDE_MIN = 260;
export const SIDE_MAX = 440;
/** Dikeyde tahtanın dışındaki her şeyin (oyuncu çubukları, durum, hamleler, düğmeler) 1.0 ölçekteki yaklaşık yüksekliği */
const CHROME = 290;
/** Yatay düzene geçmek için genişlik/yükseklik oranı */
const LANDSCAPE_RATIO = 1.25;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function computeLayout(width: number, height: number, insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 }): Layout {
  const availW = Math.max(0, width - insets.left - insets.right);
  const availH = Math.max(0, height - insets.top - insets.bottom - HEADER_HEIGHT);
  const scale = clamp(Math.min(availW, availH) / 400, 0.85, 1.35);

  // Yatay düzen: yeterince geniş ve panele (en az SIDE_MIN) yer kalıyorsa
  if (availW >= availH * LANDSCAPE_RATIO) {
    const board = Math.floor(Math.min(availH - 16, availW - PAD * 2 - GAP - SIDE_MIN, MAX_BOARD_LANDSCAPE));
    if (board >= MIN_BOARD) {
      const sideWidth = Math.floor(clamp(availW - board - PAD * 2 - GAP, SIDE_MIN, SIDE_MAX));
      return { mode: 'landscape', boardSize: board, scale, sideWidth };
    }
  }

  const board = Math.floor(clamp(Math.min(availW - PAD * 2, availH - CHROME * scale), MIN_BOARD, MAX_BOARD_PORTRAIT));
  return { mode: 'portrait', boardSize: board, scale, sideWidth: 0 };
}
