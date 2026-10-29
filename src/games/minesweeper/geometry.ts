// Kamera/ekran geometrisi. Çizim (Board) ile dokunma eşlemesi (ekran -> kare) AYNI formülleri
// kullanır; böylece dokunduğun yer ile çizilen kare asla kaymaz.

import { CHUNK_BITS } from './world';

/** view.x/y: ekranın ortasına denk gelen dünya koordinatı (kare birimi, kesirli); view.cell: bir karenin piksel boyu */
export type View = { x: number; y: number; cell: number };
export type Size = { w: number; h: number };

export type ViewWindow = {
  /** Çizilecek karelerin aralığı (kenarlarda 1 kare pay var) */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** 16'lık bölüm sınırına hizalı "taban": kareler bu tabana göre konumlanır */
  baseX: number;
  baseY: number;
  /** Kapsayıcının kaydırma miktarı (piksel): translate = -off */
  offX: number;
  offY: number;
};

export function viewWindow(view: View, size: Size): ViewWindow {
  const { cell } = view;
  const left = view.x - size.w / (2 * cell);
  const top = view.y - size.h / (2 * cell);
  const baseX = (Math.floor(left) >> CHUNK_BITS) << CHUNK_BITS;
  const baseY = (Math.floor(top) >> CHUNK_BITS) << CHUNK_BITS;
  return {
    x0: Math.floor(left) - 1,
    x1: Math.floor(left + size.w / cell) + 1,
    y0: Math.floor(top) - 1,
    y1: Math.floor(top + size.h / cell) + 1,
    baseX,
    baseY,
    offX: (left - baseX) * cell,
    offY: (top - baseY) * cell,
  };
}

/** Kapsayıcı içinde karenin sol-üst köşesi (kapsayıcıya göre piksel) */
export function cellLocalPos(win: ViewWindow, cell: number, x: number, y: number) {
  return { left: (x - win.baseX) * cell, top: (y - win.baseY) * cell };
}

/** Ekran pikselinden (görünüm alanına göre) hangi kareye denk geldiği */
export function screenToCell(view: View, size: Size, px: number, py: number) {
  return {
    x: Math.floor(view.x + (px - size.w / 2) / view.cell),
    y: Math.floor(view.y + (py - size.h / 2) / view.cell),
  };
}

/** Karenin sol-üst köşesinin ekrandaki yeri (görünüm alanına göre piksel) */
export function cellToScreen(view: View, size: Size, x: number, y: number) {
  return {
    px: (x - view.x) * view.cell + size.w / 2,
    py: (y - view.y) * view.cell + size.h / 2,
  };
}
