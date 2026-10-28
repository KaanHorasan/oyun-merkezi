// Tetris oyun mantığı: arayüzden bağımsız, saf TypeScript.
// Tüm fonksiyonlar state'i değiştirmez, yeni bir state döndürür.

export const COLS = 10;
export const ROWS = 20;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** 0 = boş, 1..7 = PIECE_TYPES indeksi + 1 */
export type Cell = number;
export type Board = Cell[][];

/** x, y: parçanın matrisinin sol üst köşesinin tahtadaki konumu */
export type Piece = { type: PieceType; rot: number; x: number; y: number };

export type Rng = () => number;

export type GameState = {
  board: Board;
  current: Piece;
  next: PieceType;
  hold: PieceType | null;
  canHold: boolean;
  bag: PieceType[];
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
};

// ---------- Parça şekilleri ----------

const BASE_SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateClockwise(m: number[][]): number[][] {
  const n = m.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => m[n - 1 - c][r]));
}

// Her parça için 4 döndürme durumu önceden hesaplanır.
const SHAPES: Record<PieceType, number[][][]> = (() => {
  const result = {} as Record<PieceType, number[][][]>;
  for (const type of PIECE_TYPES) {
    const states = [BASE_SHAPES[type]];
    for (let i = 1; i < 4; i++) states.push(rotateClockwise(states[i - 1]));
    result[type] = states;
  }
  return result;
})();

export function getShape(type: PieceType, rot: number): number[][] {
  return SHAPES[type][((rot % 4) + 4) % 4];
}

export function cellValue(type: PieceType): Cell {
  return PIECE_TYPES.indexOf(type) + 1;
}

/** Parçanın dolu hücreleri: [satır, sütun] */
export function pieceCells(piece: Piece): [number, number][] {
  const shape = getShape(piece.type, piece.rot);
  const cells: [number, number][] = [];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) cells.push([piece.y + r, piece.x + c]);
    }
  }
  return cells;
}

// ---------- Tahta ----------

const emptyRow = (): Cell[] => Array<Cell>(COLS).fill(0);
export const emptyBoard = (): Board => Array.from({ length: ROWS }, emptyRow);

/** Duvara, zemine veya dolu bir hücreye çarpıyor mu? (tahtanın üstü serbest) */
export function collides(board: Board, piece: Piece): boolean {
  for (const [r, c] of pieceCells(piece)) {
    if (c < 0 || c >= COLS || r >= ROWS) return true;
    if (r >= 0 && board[r][c] !== 0) return true;
  }
  return false;
}

// ---------- 7-bag rastgele parça sistemi ----------

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function drawFromBag(bag: PieceType[], rng: Rng): { type: PieceType; bag: PieceType[] } {
  const source = bag.length === 0 ? shuffle(PIECE_TYPES, rng) : bag;
  const [type, ...rest] = source;
  return { type, bag: rest };
}

export function spawnPiece(type: PieceType): Piece {
  const size = BASE_SHAPES[type].length;
  return {
    type,
    rot: 0,
    x: Math.floor((COLS - size) / 2),
    y: type === 'I' ? -1 : 0, // I parçasının dolu satırı matrisin 2. satırı
  };
}

// ---------- Oyun akışı ----------

export function newGame(rng: Rng = Math.random): GameState {
  const first = drawFromBag([], rng);
  const second = drawFromBag(first.bag, rng);
  return {
    board: emptyBoard(),
    current: spawnPiece(first.type),
    next: second.type,
    bag: second.bag,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
  };
}

const LINE_SCORES = [0, 100, 300, 500, 800];

/** Seviye arttıkça düşme aralığı (ms) kısalır. */
export function getDropInterval(level: number): number {
  return Math.max(80, 800 - (level - 1) * 70);
}

export function moveHorizontal(state: GameState, dx: number): GameState {
  if (state.gameOver) return state;
  const moved = { ...state.current, x: state.current.x + dx };
  return collides(state.board, moved) ? state : { ...state, current: moved };
}

// Basitleştirilmiş duvar itmesi (tam SRS değil): dönüş sığmazsa yana/yukarı dener.
const KICKS: [number, number][] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
];

export function rotate(state: GameState, dir: 1 | -1 = 1): GameState {
  if (state.gameOver) return state;
  const rot = (state.current.rot + dir + 4) % 4;
  for (const [dx, dy] of KICKS) {
    const candidate = { ...state.current, rot, x: state.current.x + dx, y: state.current.y + dy };
    if (!collides(state.board, candidate)) return { ...state, current: candidate };
  }
  return state;
}

/** Oyuncunun yumuşak düşürmesi: 1 aşağı iner (+1 puan), asla kilitlemez. */
export function softDrop(state: GameState): GameState {
  if (state.gameOver) return state;
  const moved = { ...state.current, y: state.current.y + 1 };
  if (collides(state.board, moved)) return state;
  return { ...state, current: moved, score: state.score + 1 };
}

/** Zamanla düşme: aşağı inebiliyorsa iner, inemiyorsa kilitlenir. */
export function stepDown(state: GameState, rng: Rng = Math.random): GameState {
  if (state.gameOver) return state;
  const moved = { ...state.current, y: state.current.y + 1 };
  if (!collides(state.board, moved)) return { ...state, current: moved };
  return lockPiece(state, rng);
}

/** Parçanın şu an düşeceği en alt konum (hayalet parça). */
export function getGhost(state: GameState): Piece {
  let p = state.current;
  while (!collides(state.board, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
  return p;
}

export function hardDrop(state: GameState, rng: Rng = Math.random): GameState {
  if (state.gameOver) return state;
  const ghost = getGhost(state);
  const distance = ghost.y - state.current.y;
  return lockPiece({ ...state, current: ghost, score: state.score + 2 * distance }, rng);
}

export function holdPiece(state: GameState, rng: Rng = Math.random): GameState {
  if (state.gameOver || !state.canHold) return state;
  if (state.hold === null) {
    const draw = drawFromBag(state.bag, rng);
    return {
      ...state,
      hold: state.current.type,
      current: spawnPiece(state.next),
      next: draw.type,
      bag: draw.bag,
      canHold: false,
    };
  }
  return {
    ...state,
    hold: state.current.type,
    current: spawnPiece(state.hold),
    canHold: false,
  };
}

/** Parçayı tahtaya yazar, dolu satırları siler, puanı günceller, yeni parça getirir. */
function lockPiece(state: GameState, rng: Rng): GameState {
  const board = state.board.map((row) => row.slice());
  let overflow = false;
  for (const [r, c] of pieceCells(state.current)) {
    if (r < 0) overflow = true;
    else board[r][c] = cellValue(state.current.type);
  }
  if (overflow) return { ...state, board, gameOver: true };

  const remaining = board.filter((row) => row.some((cell) => cell === 0));
  const cleared = ROWS - remaining.length;
  while (remaining.length < ROWS) remaining.unshift(emptyRow());

  const lines = state.lines + cleared;
  const score = state.score + LINE_SCORES[cleared] * state.level;

  const piece = spawnPiece(state.next);
  const draw = drawFromBag(state.bag, rng);
  return {
    ...state,
    board: remaining,
    current: piece,
    next: draw.type,
    bag: draw.bag,
    canHold: true,
    score,
    lines,
    level: Math.floor(lines / 10) + 1,
    gameOver: collides(remaining, piece),
  };
}
