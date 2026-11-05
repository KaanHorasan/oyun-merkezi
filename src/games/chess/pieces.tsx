import type { ReactElement } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { WHITE, pieceColor, pieceType } from './engine/types';
import { LINE_WIDTH, OUTLINE_WIDTH, PIECE_THEMES, SHAPES } from './pieceShapes';
import type { PieceKind } from './pieceShapes';

const KINDS: PieceKind[] = ['p', 'n', 'b', 'r', 'q', 'k'];

/** Taş kodundan (types.ts) çizim türü ve tarafı */
export const kindOf = (piece: number): PieceKind => KINDS[pieceType(piece) - 1];
export const sideOf = (piece: number): 'w' | 'b' => (pieceColor(piece) === WHITE ? 'w' : 'b');

function shapesOf(kind: PieceKind, side: 'w' | 'b'): ReactElement[] {
  const th = PIECE_THEMES[side];
  return SHAPES[kind].map((s, i) => {
    const style =
      s.paint === 'body'
        ? { fill: th.body, stroke: th.outline, strokeWidth: OUTLINE_WIDTH, strokeLinejoin: 'round' as const }
        : s.paint === 'line'
          ? { fill: 'none', stroke: th.detail, strokeWidth: LINE_WIDTH, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
          : { fill: th.detail };
    return s.t === 'path' ? <Path key={i} d={s.d} {...style} /> : <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...style} />;
  });
}

/** Başka bir Svg'nin içine yerleştirilen taş (tahta çiziminde kullanılır) */
export function PieceInSvg({ piece, x, y, size }: { piece: number; x: number; y: number; size: number }) {
  return <G transform={`translate(${x} ${y}) scale(${size / 45})`}>{shapesOf(kindOf(piece), sideOf(piece))}</G>;
}

/** Tek başına küçük taş simgesi (alınan taşlar, terfi seçicisi) */
export function PieceIcon({ piece, size }: { piece: number; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      {shapesOf(kindOf(piece), sideOf(piece))}
    </Svg>
  );
}
