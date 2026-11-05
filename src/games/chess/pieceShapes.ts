// Satranç taşlarının çizimleri: 45x45'lik bir tuval üzerinde, kendi çizdiğimiz sade ve modern şekiller.
// Veri olarak tutulur; uygulamada react-native-svg ile (pieces.tsx), testlerde ve önizlemede düz SVG olarak çizilir.

export type Paint = 'body' | 'line' | 'dot';
export type Shape =
  | { t: 'path'; d: string; paint: Paint }
  | { t: 'circle'; cx: number; cy: number; r: number; paint: Paint };

export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Her taşın altındaki ortak ayaklık */
const BASE: Shape = { t: 'path', paint: 'body', d: 'M10 40.5 L35 40.5 L35 38 Q35 35.5 32.5 35.5 L12.5 35.5 Q10 35.5 10 38 Z' };

export const SHAPES: Record<PieceKind, Shape[]> = {
  p: [
    BASE,
    { t: 'path', paint: 'body', d: 'M15.5 35.5 C15.5 29.5 17.5 25.5 20.2 22.6 L18 22.6 L18 19.6 L27 19.6 L27 22.6 L24.8 22.6 C27.5 25.5 29.5 29.5 29.5 35.5 Z' },
    { t: 'circle', paint: 'body', cx: 22.5, cy: 13.2, r: 5.4 },
  ],
  r: [
    BASE,
    { t: 'path', paint: 'body', d: 'M13 10.5 L13 17.5 L16.2 20.5 L16.2 31.5 L12.8 35.5 L32.2 35.5 L28.8 31.5 L28.8 20.5 L32 17.5 L32 10.5 L27.8 10.5 L27.8 14 L24.3 14 L24.3 10.5 L20.7 10.5 L20.7 14 L17.2 14 L17.2 10.5 Z' },
    { t: 'path', paint: 'line', d: 'M16.2 20.5 L28.8 20.5' },
  ],
  b: [
    BASE,
    { t: 'path', paint: 'body', d: 'M22.5 9.2 C26.3 13.2 29.2 17.2 29.2 22 C29.2 25 27.7 27 26.2 28.5 C28 30 30 31.5 31.4 35.5 L13.6 35.5 C15 31.5 17 30 18.8 28.5 C17.3 27 15.8 25 15.8 22 C15.8 17.2 18.7 13.2 22.5 9.2 Z' },
    { t: 'circle', paint: 'body', cx: 22.5, cy: 7.6, r: 2.7 },
    { t: 'path', paint: 'line', d: 'M20.3 17.6 L24.9 22.4' },
  ],
  n: [
    BASE,
    { t: 'path', paint: 'body', d: 'M12.5 35.5 C12.5 29.5 14.5 25.6 18 22.8 C16.2 22.4 14 23.2 12.2 24.6 C10.8 23.2 11 21 12.8 19 C14.6 17 16 14.8 17.2 11.4 L18.6 12 L19.6 9.6 L21.6 11.6 C24.2 10.4 27.4 10.8 29.6 13 C33.4 16.8 33.8 25.2 32.4 31 C32 32.6 32.2 34 33 35.5 Z' },
    { t: 'circle', paint: 'dot', cx: 21.6, cy: 15.6, r: 1.25 },
    { t: 'path', paint: 'line', d: 'M14 21 L15.6 21.4' },
    { t: 'path', paint: 'line', d: 'M25.6 13.6 C28 16.6 28.8 21.4 27.6 27' },
  ],
  q: [
    BASE,
    { t: 'path', paint: 'body', d: 'M12.2 35.5 L9.6 15.6 L16 24.6 L16.6 12.4 L22.5 23.6 L28.4 12.4 L29 24.6 L35.4 15.6 L32.8 35.5 Z' },
    { t: 'circle', paint: 'body', cx: 9.4, cy: 13.4, r: 2.3 },
    { t: 'circle', paint: 'body', cx: 16.6, cy: 10.4, r: 2.3 },
    { t: 'circle', paint: 'body', cx: 22.5, cy: 8.8, r: 2.4 },
    { t: 'circle', paint: 'body', cx: 28.4, cy: 10.4, r: 2.3 },
    { t: 'circle', paint: 'body', cx: 35.6, cy: 13.4, r: 2.3 },
    { t: 'path', paint: 'line', d: 'M12.6 31.4 L32.4 31.4' },
  ],
  k: [
    BASE,
    { t: 'path', paint: 'body', d: 'M13 35.5 C11.6 28.5 14 23.4 17.4 20.4 C15.4 18.6 14.4 16.2 16.4 14.6 L28.6 14.6 C30.6 16.2 29.6 18.6 27.6 20.4 C31 23.4 33.4 28.5 32 35.5 Z' },
    { t: 'path', paint: 'body', d: 'M20.8 4.4 L24.2 4.4 L24.2 7.6 L27.4 7.6 L27.4 10.8 L24.2 10.8 L24.2 14.6 L20.8 14.6 L20.8 10.8 L17.6 10.8 L17.6 7.6 L20.8 7.6 Z' },
    { t: 'path', paint: 'line', d: 'M13.2 31.4 L31.8 31.4' },
  ],
};

export type PieceTheme = { body: string; outline: string; detail: string };

export const PIECE_THEMES: Record<'w' | 'b', PieceTheme> = {
  w: { body: '#ffffff', outline: '#1b2236', detail: '#1b2236' },
  b: { body: '#232b45', outline: '#0b0f1d', detail: '#b9c3e0' },
};

export const OUTLINE_WIDTH = 1.7;
export const LINE_WIDTH = 1.5;

/** Düz SVG metni olarak bir taş (önizleme ve testler için). Uygulama bunun yerine pieces.tsx'i kullanır. */
export function pieceToSvg(kind: PieceKind, color: 'w' | 'b'): string {
  const th = PIECE_THEMES[color];
  return SHAPES[kind]
    .map((s) => {
      const geo = s.t === 'path' ? `<path d="${s.d}"` : `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"`;
      if (s.paint === 'body')
        return `${geo} fill="${th.body}" stroke="${th.outline}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round"/>`;
      if (s.paint === 'line')
        return `${geo} fill="none" stroke="${th.detail}" stroke-width="${LINE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`;
      return `${geo} fill="${th.detail}"/>`;
    })
    .join('');
}
