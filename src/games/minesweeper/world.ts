// Sonsuz Mayın Tarlası: dünya mantığı (arayüzden bağımsız, saf TypeScript).
//
// Fikir: Dünya sonsuz. Hiçbir mayın önceden saklanmaz; bir koordinatın mayın olup olmadığı
// (tohum, x, y) üçlüsünden deterministik bir karma (hash) ile hesaplanır. Sadece oyuncunun
// açtığı/bayrakladığı kareler 16x16'lık "bölümler" (chunk) halinde bellekte tutulur.

export const CHUNK_BITS = 4;
export const CHUNK = 1 << CHUNK_BITS; // bölüm kenarı: 16 kare
export const CHUNK_AREA = CHUNK * CHUNK;
/** İlk dokunuşun çevresinde bu yarıçapta (5x5) mayın olmaz; böylece oyun güvenli bir açılışla başlar. */
export const SAFE_RADIUS = 2;
/** Tek bir hamlede zincirleme açılabilecek en fazla kare sayısı (sonsuz dünyada sonsuz döngüyü önler). */
export const MAX_FLOOD = 6000;

// ---- Ekonomi (hepsi buradan ayarlanır) ----
/** Her bu kadar güvenli kare açışta 1 para kazanılır. */
export const CELLS_PER_COIN = 5;
/** Patlayan bir bölgeyi onarmanın taban maliyeti. */
export const REPAIR_BASE_COST = 20;
/** Bölgede açık her kare için maliyete eklenen para (bölgede ne kadar ilerlediysen o kadar değerli). */
export const REPAIR_COST_PER_REVEALED = 0.25;

export const HIDDEN = 0;
export const REVEALED = 1;
export const FLAGGED = 2;

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Record<Difficulty, { label: string; density: number }> = {
  easy: { label: 'Kolay', density: 0.12 },
  normal: { label: 'Normal', density: 0.16 },
  hard: { label: 'Zor', density: 0.2 },
};

export type Pos = { x: number; y: number };

export type Chunk = {
  /** 0 = kapalı, 1 = açık, 2 = bayraklı */
  state: Uint8Array;
  /** Açık karelerin komşu mayın sayısı (açıldığı anda hesaplanıp saklanır) */
  count: Uint8Array;
};

export type World = {
  seed: number;
  difficulty: Difficulty;
  density: number;
  /** İlk açılan karenin konumu (çevresi güvenli). Henüz açılış yapılmadıysa null. */
  safe: Pos | null;
  chunks: Map<number, Chunk>;
  /** Açılan güvenli kare sayısı (skor) */
  revealed: number;
  flags: number;
  /**
   * Patlayıp kilitlenen bölümler: bölüm anahtarı -> basılan mayının konumu.
   * Kilitli bölümde hamle yapılamaz; onarılınca (repairSection) tekrar oynanır.
   */
  locked: Map<number, Pos>;
  /** Toplam patlama sayısı (ileride başarımlar için) */
  explosions: number;
  /** Bu oyun için cüzdana şimdiye kadar verilmiş para (tekrar verilmesin diye kaydedilir) */
  coinsGranted: number;
  /** Her değişiklikte artar; arayüz yeniden çizim için kullanır */
  version: number;
};

/** kind 'mine': bir mayına basıldı ve o bölüm patladı (oyun bitmez). hit: basılan mayının konumu. */
export type RevealResult = { kind: 'none' | 'safe' | 'mine'; opened: number; hit?: Pos };
const NONE: RevealResult = { kind: 'none', opened: 0 };

// ---------- Karma ve mayın üretimi ----------

function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** (tohum, x, y) -> 0 .. 2^32-1 arası, komşu koordinatlarda bile birbirinden bağımsız görünen sayı */
export function cellHash(seed: number, x: number, y: number): number {
  let h = mix((seed ^ Math.imul(x, 0x9e3779b1)) >>> 0);
  h = mix((h ^ Math.imul(y, 0x85ebca77)) >>> 0);
  return h;
}

export function createWorld(seed: number, difficulty: Difficulty): World {
  return {
    seed: seed >>> 0,
    difficulty,
    density: DIFFICULTIES[difficulty].density,
    safe: null,
    chunks: new Map(),
    revealed: 0,
    flags: 0,
    locked: new Map(),
    explosions: 0,
    coinsGranted: 0,
    version: 0,
  };
}

export function isMine(world: World, x: number, y: number): boolean {
  const s = world.safe;
  if (s && Math.abs(x - s.x) <= SAFE_RADIUS && Math.abs(y - s.y) <= SAFE_RADIUS) return false;
  return cellHash(world.seed, x, y) / 4294967296 < world.density;
}

export function neighborMines(world: World, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx !== 0 || dy !== 0) && isMine(world, x + dx, y + dy)) n++;
    }
  }
  return n;
}

// ---------- Bölümler (chunk) ----------

// Negatif koordinatlarda da doğru çalışır: -1 >> 4 === -1, -1 & 15 === 15
export const chunkKey = (cx: number, cy: number): number => (cx + 524288) * 1048576 + (cy + 524288);
export const localIndex = (x: number, y: number): number => ((y & (CHUNK - 1)) << CHUNK_BITS) | (x & (CHUNK - 1));

export function getChunk(world: World, cx: number, cy: number): Chunk | undefined {
  return world.chunks.get(chunkKey(cx, cy));
}

function ensureChunk(world: World, cx: number, cy: number): Chunk {
  const key = chunkKey(cx, cy);
  let chunk = world.chunks.get(key);
  if (!chunk) {
    chunk = { state: new Uint8Array(CHUNK_AREA), count: new Uint8Array(CHUNK_AREA) };
    world.chunks.set(key, chunk);
  }
  return chunk;
}

export function cellState(world: World, x: number, y: number): number {
  const chunk = world.chunks.get(chunkKey(x >> CHUNK_BITS, y >> CHUNK_BITS));
  return chunk ? chunk.state[localIndex(x, y)] : HIDDEN;
}

export function cellCount(world: World, x: number, y: number): number {
  const chunk = world.chunks.get(chunkKey(x >> CHUNK_BITS, y >> CHUNK_BITS));
  return chunk ? chunk.count[localIndex(x, y)] : 0;
}

export function isLockedChunk(world: World, cx: number, cy: number): boolean {
  return world.locked.has(chunkKey(cx, cy));
}

export function isLockedAt(world: World, x: number, y: number): boolean {
  return world.locked.size > 0 && world.locked.has(chunkKey(x >> CHUNK_BITS, y >> CHUNK_BITS));
}

// ---------- Hamleler ----------

/** (sx, sy) karesini ve sıfır komşulu bölgeyi açar. Kare kapalı ve mayınsız olmalı. */
function openFrom(world: World, sx: number, sy: number): number {
  let opened = 0;
  const qx: number[] = [];
  const qy: number[] = [];

  const open = (x: number, y: number) => {
    const chunk = ensureChunk(world, x >> CHUNK_BITS, y >> CHUNK_BITS);
    const i = localIndex(x, y);
    const c = neighborMines(world, x, y);
    chunk.state[i] = REVEALED;
    chunk.count[i] = c;
    world.revealed++;
    opened++;
    if (c === 0) {
      qx.push(x);
      qy.push(y);
    }
  };

  open(sx, sy);
  let head = 0;
  while (head < qx.length && opened < MAX_FLOOD) {
    const x = qx[head];
    const y = qy[head];
    head++;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        // Sıfır komşulu karenin hiçbir komşusu mayın olamaz. Bayraklı kareler ve kilitli bölümler açılmaz.
        if (cellState(world, x + dx, y + dy) === HIDDEN && !isLockedAt(world, x + dx, y + dy)) open(x + dx, y + dy);
      }
    }
  }
  return opened;
}

export function reveal(world: World, x: number, y: number): RevealResult {
  if (isLockedAt(world, x, y) || cellState(world, x, y) !== HIDDEN) return NONE;
  if (!world.safe) world.safe = { x, y }; // ilk açılış her zaman güvenli
  world.version++;
  if (isMine(world, x, y)) {
    // Oyun bitmez: yalnızca bu bölüm patlar ve kilitlenir.
    world.locked.set(chunkKey(x >> CHUNK_BITS, y >> CHUNK_BITS), { x, y });
    world.explosions++;
    return { kind: 'mine', opened: 0, hit: { x, y } };
  }
  return { kind: 'safe', opened: openFrom(world, x, y) };
}

export function toggleFlag(world: World, x: number, y: number): 'flagged' | 'unflagged' | 'none' {
  if (isLockedAt(world, x, y)) return 'none';
  const st = cellState(world, x, y);
  if (st === REVEALED) return 'none';
  const chunk = ensureChunk(world, x >> CHUNK_BITS, y >> CHUNK_BITS);
  const i = localIndex(x, y);
  world.version++;
  if (st === FLAGGED) {
    chunk.state[i] = HIDDEN;
    world.flags--;
    return 'unflagged';
  }
  chunk.state[i] = FLAGGED;
  world.flags++;
  return 'flagged';
}

/**
 * Açık bir sayıya dokunma: çevresindeki bayrak sayısı sayıya eşitse kalan kapalı komşuları açar.
 * (Yanlış bayrak varsa mayına basılır.)
 */
export function chord(world: World, x: number, y: number): RevealResult {
  if (isLockedAt(world, x, y) || cellState(world, x, y) !== REVEALED) return NONE;
  const need = cellCount(world, x, y);
  let flags = 0;
  const targets: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      const st = cellState(world, nx, ny);
      if (st === FLAGGED) flags++;
      else if (st === HIDDEN && !isLockedAt(world, nx, ny)) targets.push([nx, ny]);
    }
  }
  if (flags !== need || targets.length === 0) return NONE;

  let opened = 0;
  let hit: Pos | undefined;
  for (const [tx, ty] of targets) {
    if (cellState(world, tx, ty) !== HIDDEN) continue; // önceki açılışın zincirinde açılmış olabilir
    const r = reveal(world, tx, ty); // kilitli bölümdeki kareler reveal tarafından zaten atlanır
    opened += r.opened;
    if (r.kind === 'mine' && !hit) hit = r.hit; // yanlış bayrak: o bölüm patlar, kalan komşular açılmaya devam eder
  }
  if (hit) return { kind: 'mine', opened, hit };
  return opened > 0 ? { kind: 'safe', opened } : NONE;
}

// ---------- Onarım ve ekonomi ----------

/** Patlayan bölümü onarmanın maliyeti: taban + bölgede açtığın kare sayısına göre artan kısım. */
export function repairCost(world: World, cx: number, cy: number): number {
  const chunk = getChunk(world, cx, cy);
  let revealed = 0;
  if (chunk) for (let i = 0; i < CHUNK_AREA; i++) if (chunk.state[i] === REVEALED) revealed++;
  return REPAIR_BASE_COST + Math.ceil(revealed * REPAIR_COST_PER_REVEALED);
}

/**
 * Bölümü tekrar oynanabilir yapar ve patlayan mayını etkisizleştirir (bayrak olur).
 * Ödemeyi çağıran taraf yapar (cüzdan oyundan bağımsızdır). Bölüm kilitli değilse false döner.
 */
export function repairSection(world: World, cx: number, cy: number): boolean {
  const key = chunkKey(cx, cy);
  const hit = world.locked.get(key);
  if (!hit) return false;
  const chunk = ensureChunk(world, cx, cy);
  const i = localIndex(hit.x, hit.y);
  if (chunk.state[i] === HIDDEN) {
    chunk.state[i] = FLAGGED;
    world.flags++;
  }
  world.locked.delete(key);
  world.version++;
  return true;
}

/** Cüzdana henüz verilmemiş para (açılan kare sayısına göre). */
export function coinsDue(world: World): number {
  return Math.max(0, Math.floor(world.revealed / CELLS_PER_COIN) - world.coinsGranted);
}

export function markCoinsGranted(world: World, n: number): void {
  world.coinsGranted += n;
}

// ---------- Kaydetme / yükleme ----------

export type WorldData = {
  /** 2: bölüm kilitleri ve ekonomi alanları var. 1 (eski kayıt) yüklenebilir. */
  v: 1 | 2;
  seed: number;
  difficulty: Difficulty;
  safe: Pos | null;
  revealed: number;
  flags: number;
  explosions?: number;
  coinsGranted?: number;
  /** "cx,cy" -> patlayan mayının konumu */
  locked?: Record<string, Pos>;
  /** "cx,cy" -> 128 karakterlik onaltılık metin (kare başına 2 bit) */
  chunks: Record<string, string>;
};

function packState(state: Uint8Array): string {
  const bytes = new Uint8Array(CHUNK_AREA / 4);
  for (let i = 0; i < CHUNK_AREA; i++) bytes[i >> 2] |= (state[i] & 3) << ((i & 3) * 2);
  let s = '';
  for (const b of bytes) s += (b < 16 ? '0' : '') + b.toString(16);
  return s;
}

function unpackState(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{128}$/.test(hex)) return null;
  const state = new Uint8Array(CHUNK_AREA);
  for (let i = 0; i < CHUNK_AREA; i++) {
    const byte = parseInt(hex.substr((i >> 2) * 2, 2), 16);
    const v = (byte >> ((i & 3) * 2)) & 3;
    state[i] = v === REVEALED || v === FLAGGED ? v : HIDDEN;
  }
  return state;
}

export function exportWorld(world: World): WorldData {
  const chunks: Record<string, string> = {};
  for (const [key, chunk] of world.chunks) {
    if (!chunk.state.some((v) => v !== HIDDEN)) continue; // tamamen kapalı bölümü saklama
    const cx = Math.floor(key / 1048576) - 524288;
    const cy = (key % 1048576) - 524288;
    chunks[`${cx},${cy}`] = packState(chunk.state);
  }
  const locked: Record<string, Pos> = {};
  for (const [key, pos] of world.locked) {
    const cx = Math.floor(key / 1048576) - 524288;
    const cy = (key % 1048576) - 524288;
    locked[`${cx},${cy}`] = { x: pos.x, y: pos.y };
  }
  return {
    v: 2,
    seed: world.seed,
    difficulty: world.difficulty,
    safe: world.safe,
    revealed: world.revealed,
    flags: world.flags,
    explosions: world.explosions,
    coinsGranted: world.coinsGranted,
    locked,
    chunks,
  };
}

/** Bozuk/uyumsuz veri gelirse null döner. Sayılar, güvenli bölge dahil yeniden hesaplanır. */
export function importWorld(data: WorldData): World | null {
  try {
    if (!data || (data.v !== 1 && data.v !== 2) || !(data.difficulty in DIFFICULTIES) || typeof data.seed !== 'number') return null;
    const world = createWorld(data.seed, data.difficulty);
    if (data.safe) {
      if (!Number.isInteger(data.safe.x) || !Number.isInteger(data.safe.y)) return null;
      world.safe = { x: data.safe.x, y: data.safe.y };
    }
    if (data.v === 2) {
      world.explosions = Number.isInteger(data.explosions) ? (data.explosions as number) : 0;
      world.coinsGranted = Number.isInteger(data.coinsGranted) ? (data.coinsGranted as number) : 0;
      for (const [key, pos] of Object.entries(data.locked ?? {})) {
        const m = /^(-?\d+),(-?\d+)$/.exec(key);
        if (!m || !pos || !Number.isInteger(pos.x) || !Number.isInteger(pos.y)) return null;
        const cx = parseInt(m[1], 10);
        const cy = parseInt(m[2], 10);
        if (pos.x >> CHUNK_BITS !== cx || pos.y >> CHUNK_BITS !== cy) return null; // mayın kendi bölümünde olmalı
        world.locked.set(chunkKey(cx, cy), { x: pos.x, y: pos.y });
      }
    }
    for (const [key, hex] of Object.entries(data.chunks)) {
      const m = /^(-?\d+),(-?\d+)$/.exec(key);
      const state = unpackState(hex);
      if (!m || !state) return null;
      const cx = parseInt(m[1], 10);
      const cy = parseInt(m[2], 10);
      const chunk = ensureChunk(world, cx, cy);
      chunk.state.set(state);
      for (let i = 0; i < CHUNK_AREA; i++) {
        if (state[i] === REVEALED) {
          const x = (cx << CHUNK_BITS) + (i & (CHUNK - 1));
          const y = (cy << CHUNK_BITS) + (i >> CHUNK_BITS);
          chunk.count[i] = neighborMines(world, x, y);
          world.revealed++;
        } else if (state[i] === FLAGGED) {
          world.flags++;
        }
      }
    }
    return world;
  } catch {
    return null;
  }
}
