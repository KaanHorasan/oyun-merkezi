// Günlük görev ve başarım tanımları. Yeni görev/başarım eklemek için yalnızca bu dosyayı düzenlemek yeter.
// Oyunlar sadece "istatistik" bildirir (record); görev ve başarımlar bu istatistiklerden hesaplanır.

/** Oyunların bildirdiği istatistikler. 'sum': toplanır, 'max': en yüksek değer tutulur. */
export type StatId =
  | 'ms.cells' // Mayın Tarlası: açılan güvenli kare
  | 'ms.flags' // doğru yere konan bayrak (mayın)
  | 'ms.explosions' // patlayan bölge (mayın veya yanlış bayrak)
  | 'ms.repairs' // onarılan bölge
  | 'ms.maxOpen' // tek hamlede açılan en çok kare
  | 'tt.lines' // Tetris: temizlenen satır
  | 'tt.tetrises' // 4 satırı birden temizleme
  | 'tt.games' // biten oyun
  | 'tt.bestScore' // en yüksek skor
  | 'tt.maxLevel' // ulaşılan en yüksek seviye
  | 'quests.claimed'; // ödülü alınan günlük görev

export const STAT_KIND: Record<StatId, 'sum' | 'max'> = {
  'ms.cells': 'sum',
  'ms.flags': 'sum',
  'ms.explosions': 'sum',
  'ms.repairs': 'sum',
  'ms.maxOpen': 'max',
  'tt.lines': 'sum',
  'tt.tetrises': 'sum',
  'tt.games': 'sum',
  'tt.bestScore': 'max',
  'tt.maxLevel': 'max',
  'quests.claimed': 'sum',
};

export type GameTag = 'tetris' | 'minesweeper' | 'general';
export const GAME_LABEL: Record<GameTag, string> = {
  tetris: 'Tetris',
  minesweeper: 'Mayın Tarlası',
  general: 'Genel',
};

// ---------- Günlük görevler ----------

export type QuestTemplate = {
  id: string;
  game: 'tetris' | 'minesweeper';
  stat: StatId;
  /** {n} yerine hedef yazılır */
  text: string;
  /** Kolaydan zora hedefler; rewards aynı sırada ödüller */
  targets: number[];
  rewards: number[];
};

export const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: 'tt-lines', game: 'tetris', stat: 'tt.lines', text: "Tetris'te {n} satır temizle", targets: [8, 15, 25], rewards: [20, 35, 55] },
  { id: 'tt-score', game: 'tetris', stat: 'tt.bestScore', text: "Tetris'te tek oyunda {n} puana ulaş", targets: [400, 900, 1800], rewards: [20, 40, 65] },
  { id: 'tt-tetris', game: 'tetris', stat: 'tt.tetrises', text: '4 satırı birden temizle ({n} kez)', targets: [1, 2, 3], rewards: [30, 55, 80] },
  { id: 'tt-games', game: 'tetris', stat: 'tt.games', text: '{n} Tetris oyunu bitir', targets: [2, 3, 5], rewards: [15, 25, 40] },
  { id: 'ms-cells', game: 'minesweeper', stat: 'ms.cells', text: "Mayın Tarlası'nda {n} güvenli kare aç", targets: [100, 250, 500], rewards: [20, 40, 70] },
  { id: 'ms-flags', game: 'minesweeper', stat: 'ms.flags', text: '{n} mayına doğru bayrak koy', targets: [5, 12, 25], rewards: [20, 40, 70] },
  { id: 'ms-open', game: 'minesweeper', stat: 'ms.maxOpen', text: 'Tek hamlede {n} kare aç', targets: [30, 80, 150], rewards: [20, 40, 65] },
];

/** Bütün günlük görevler tamamlanınca verilen ek ödül */
export const BONUS_REWARD = 50;
export const DAILY_QUEST_COUNT = 3;

export type DailyQuest = {
  id: string;
  game: 'tetris' | 'minesweeper';
  stat: StatId;
  text: string;
  target: number;
  reward: number;
};

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Metinden 32 bit karma (FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tohumdan tekrarlanabilir rastgele sayı üreteci (0..1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bir günün görevleri: tarihten (YYYY-AA-GG) türetilir, yani aynı gün herkes için aynıdır.
 * Her gün 1 Tetris + 1 Mayın Tarlası görevi ve kalan görevlerden 1 tane daha.
 */
export function pickDailyQuests(date: string, templates: QuestTemplate[] = QUEST_TEMPLATES): DailyQuest[] {
  const rnd = mulberry32(hashString('daily:' + date));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  const tetris = pick(templates.filter((t) => t.game === 'tetris'));
  const mines = pick(templates.filter((t) => t.game === 'minesweeper'));
  const third = pick(templates.filter((t) => t.id !== tetris.id && t.id !== mines.id));

  return [tetris, mines, third].map((t) => {
    const i = Math.floor(rnd() * t.targets.length);
    return {
      id: t.id,
      game: t.game,
      stat: t.stat,
      text: t.text.replace('{n}', fmt(t.targets[i])),
      target: t.targets[i],
      reward: t.rewards[i],
    };
  });
}

// ---------- Başarımlar ----------

export type AchievementTier = { target: number; reward: number };

export type AchievementDef = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  game: GameTag;
  stat: StatId;
  tiers: AchievementTier[];
};

export const ACHIEVEMENTS: AchievementDef[] = [
  // Mayın Tarlası
  { id: 'ms-explorer', title: 'Kaşif', desc: 'Güvenli kare aç', icon: '🧭', game: 'minesweeper', stat: 'ms.cells',
    tiers: [{ target: 100, reward: 25 }, { target: 1000, reward: 100 }, { target: 10000, reward: 400 }, { target: 100000, reward: 1500 }] },
  { id: 'ms-flagger', title: 'Bayrakçı', desc: 'Mayınlara doğru bayrak koy', icon: '🚩', game: 'minesweeper', stat: 'ms.flags',
    tiers: [{ target: 10, reward: 20 }, { target: 100, reward: 80 }, { target: 1000, reward: 300 }] },
  { id: 'ms-boom', title: 'Acı Tecrübe', desc: 'Bölge patlat', icon: '💥', game: 'minesweeper', stat: 'ms.explosions',
    tiers: [{ target: 1, reward: 10 }, { target: 10, reward: 30 }, { target: 50, reward: 100 }] },
  { id: 'ms-repair', title: 'Tamirci', desc: 'Patlayan bölgeleri onar', icon: '🔧', game: 'minesweeper', stat: 'ms.repairs',
    tiers: [{ target: 1, reward: 15 }, { target: 10, reward: 60 }, { target: 50, reward: 200 }] },
  { id: 'ms-bigopen', title: 'Büyük Açılış', desc: 'Tek hamlede en çok kare aç', icon: '🌊', game: 'minesweeper', stat: 'ms.maxOpen',
    tiers: [{ target: 50, reward: 25 }, { target: 200, reward: 75 }, { target: 1000, reward: 250 }] },

  // Tetris
  { id: 'tt-lines', title: 'Satır Avcısı', desc: 'Satır temizle', icon: '🧱', game: 'tetris', stat: 'tt.lines',
    tiers: [{ target: 10, reward: 20 }, { target: 100, reward: 80 }, { target: 1000, reward: 300 }, { target: 5000, reward: 1000 }] },
  { id: 'tt-tetris', title: 'Tetris Ustası', desc: '4 satırı birden temizle', icon: '4️⃣', game: 'tetris', stat: 'tt.tetrises',
    tiers: [{ target: 1, reward: 25 }, { target: 10, reward: 80 }, { target: 50, reward: 250 }] },
  { id: 'tt-score', title: 'Yüksek Skor', desc: 'Tek oyunda en yüksek skor', icon: '🏅', game: 'tetris', stat: 'tt.bestScore',
    tiers: [{ target: 1000, reward: 25 }, { target: 5000, reward: 100 }, { target: 20000, reward: 400 }] },
  { id: 'tt-level', title: 'Seviye Atlayıcı', desc: 'Ulaştığın en yüksek seviye', icon: '🚀', game: 'tetris', stat: 'tt.maxLevel',
    tiers: [{ target: 5, reward: 30 }, { target: 10, reward: 100 }, { target: 15, reward: 300 }] },
  { id: 'tt-games', title: 'Oyun Meraklısı', desc: 'Tetris oyunu bitir', icon: '🎮', game: 'tetris', stat: 'tt.games',
    tiers: [{ target: 1, reward: 10 }, { target: 10, reward: 50 }, { target: 50, reward: 200 }] },

  // Genel
  { id: 'daily', title: 'Günlük Düzenli', desc: 'Günlük görev ödülü al', icon: '🎯', game: 'general', stat: 'quests.claimed',
    tiers: [{ target: 1, reward: 20 }, { target: 10, reward: 100 }, { target: 50, reward: 400 }] },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const romanTier = (index: number) => ROMAN[index] ?? String(index + 1);
