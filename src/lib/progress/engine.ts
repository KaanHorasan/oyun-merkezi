// İlerleme motoru: istatistikleri toplar, günlük görevleri ve başarımları hesaplar, ödülleri verir.
// React, depolama, saat ve cüzdandan bağımsızdır (hepsi dışarıdan verilir), bu yüzden testlenebilir.

import {
  ACHIEVEMENTS,
  BONUS_REWARD,
  STAT_KIND,
  pickDailyQuests,
  romanTier,
} from './definitions';
import type { AchievementDef, DailyQuest, GameTag, StatId } from './definitions';

type NumMap = Record<string, number>;

export type ProgressData = {
  v: 1;
  /** Tüm zamanların istatistikleri (başarımlar bunlardan hesaplanır) */
  stats: { sum: NumMap; max: NumMap };
  /** Sadece bugünün istatistikleri (günlük görevler bunlardan hesaplanır); gün değişince sıfırlanır */
  daily: { date: string; sum: NumMap; max: NumMap; claimed: string[]; bonusClaimed: boolean };
  /** Başarım -> ödülü alınmış basamak numaraları */
  ach: Record<string, number[]>;
};

export type ProgressNotice = {
  kind: 'quest' | 'achievement' | 'bonus';
  icon: string;
  title: string;
  body: string;
};

export type ProgressDeps = {
  storage: { load: () => Promise<unknown>; save: (data: ProgressData) => void | Promise<void> };
  now: () => Date;
  /** Cüzdana para ekler */
  grant: (coins: number) => void;
  notify?: (notice: ProgressNotice) => void;
  saveDelayMs?: number;
};

export type QuestView = DailyQuest & { progress: number; done: boolean; claimed: boolean };
export type TierView = { target: number; reward: number; unlocked: boolean; claimed: boolean };
export type AchievementView = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  game: GameTag;
  stat: StatId;
  value: number;
  tiers: TierView[];
  /** Açılmış ama henüz alınmamış basamakların toplam ödülü */
  claimableReward: number;
  /** Henüz açılmamış ilk basamak (hepsi açıksa null) */
  nextTier: TierView | null;
};
export type ProgressView = {
  loaded: boolean;
  date: string;
  /** Günlük görevlerin yenileneceği an (ms, epoch) */
  nextResetAt: number;
  quests: QuestView[];
  bonus: { reward: number; done: boolean; claimed: boolean; completed: number; total: number };
  achievements: AchievementView[];
  /** Ödülü alınmayı bekleyen öğe sayısı (rozet için) */
  claimable: number;
};

// ---------- Tarih ----------

const pad = (n: number) => (n < 10 ? '0' : '') + n;

/** Cihazın yerel saatine göre gün anahtarı: YYYY-AA-GG */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Bir sonraki yerel gece yarısı (ms, epoch) */
export function nextMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

// ---------- Veri ----------

const emptyDaily = (date: string): ProgressData['daily'] => ({ date, sum: {}, max: {}, claimed: [], bonusClaimed: false });

export const emptyData = (date: string): ProgressData => ({
  v: 1,
  stats: { sum: {}, max: {} },
  daily: emptyDaily(date),
  ach: {},
});

function numMap(x: unknown): NumMap {
  const out: NumMap = {};
  if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

/** Bozuk/eksik kayıt gelirse çökmeden temiz veriye dön; farklı güne ait günlük ilerleme atılır. */
export function sanitize(raw: unknown, today: string): ProgressData {
  const data = emptyData(today);
  if (!raw || typeof raw !== 'object') return data;
  const r = raw as Record<string, any>;
  if (r.v !== 1) return data;

  data.stats.sum = numMap(r.stats?.sum);
  data.stats.max = numMap(r.stats?.max);

  const d = r.daily;
  if (d && typeof d === 'object' && d.date === today) {
    data.daily = {
      date: today,
      sum: numMap(d.sum),
      max: numMap(d.max),
      claimed: Array.isArray(d.claimed) ? d.claimed.filter((x: unknown) => typeof x === 'string') : [],
      bonusClaimed: d.bonusClaimed === true,
    };
  }

  if (r.ach && typeof r.ach === 'object') {
    for (const [id, tiers] of Object.entries(r.ach as Record<string, unknown>)) {
      if (Array.isArray(tiers)) data.ach[id] = tiers.filter((n) => Number.isInteger(n) && n >= 0);
    }
  }
  return data;
}

const lifetimeValue = (d: ProgressData, stat: StatId) =>
  (STAT_KIND[stat] === 'sum' ? d.stats.sum[stat] : d.stats.max[stat]) ?? 0;
const dailyValue = (d: ProgressData, stat: StatId) =>
  (STAT_KIND[stat] === 'sum' ? d.daily.sum[stat] : d.daily.max[stat]) ?? 0;

/** "Tamamlandı" işaretleri kümesi: yeni eklenenleri bildirim için buluruz */
function marks(d: ProgressData): Set<string> {
  const s = new Set<string>();
  const quests = pickDailyQuests(d.daily.date);
  let done = 0;
  for (const q of quests) {
    if (dailyValue(d, q.stat) >= q.target) {
      s.add('q:' + q.id);
      done++;
    }
  }
  if (done === quests.length) s.add('bonus');
  for (const a of ACHIEVEMENTS) {
    const v = lifetimeValue(d, a.stat);
    a.tiers.forEach((t, i) => {
      if (v >= t.target) s.add(`a:${a.id}:${i}`);
    });
  }
  return s;
}

// ---------- Motor ----------

export function createProgressStore(deps: ProgressDeps) {
  const saveDelay = deps.saveDelayMs ?? 400;
  const today = () => localDateKey(deps.now());

  let data = emptyData(today());
  let loaded = false;
  let loading: Promise<void> | null = null;
  let pending: [StatId, number][] = []; // yükleme bitmeden gelen kayıtlar kaybolmasın
  let cached: ProgressView | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const bump = () => {
    cached = null;
    listeners.forEach((l) => l());
  };

  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      deps.storage.save(data);
    }, saveDelay);
  };

  /** Gün değiştiyse günlük ilerlemeyi sıfırlar. Değiştiyse true. */
  const ensureToday = (): boolean => {
    const t = today();
    if (data.daily.date === t) return false;
    data.daily = emptyDaily(t);
    return true;
  };

  const questList = (): DailyQuest[] => pickDailyQuests(data.daily.date);

  const notifyNew = (before: Set<string>) => {
    if (!deps.notify) return;
    const after = marks(data);
    const quests = questList();
    for (const mark of after) {
      if (before.has(mark)) continue;
      if (mark === 'bonus') {
        deps.notify({
          kind: 'bonus',
          icon: '🎁',
          title: 'Tüm günlük görevler tamamlandı!',
          body: `Bonus ödül: +${BONUS_REWARD} 🪙 (Görevler ekranından al)`,
        });
      } else if (mark.startsWith('q:')) {
        const q = quests.find((x) => 'q:' + x.id === mark);
        if (q) deps.notify({ kind: 'quest', icon: '🎯', title: 'Görev tamamlandı', body: `${q.text} · +${q.reward} 🪙` });
      } else if (mark.startsWith('a:')) {
        const [, id, idx] = mark.split(':');
        const def = ACHIEVEMENTS.find((a) => a.id === id);
        const i = Number(idx);
        if (def) {
          deps.notify({
            kind: 'achievement',
            icon: def.icon,
            title: `Başarım: ${def.title} ${romanTier(i)}`,
            body: `${def.desc}: ${def.tiers[i].target.toLocaleString('tr-TR')} · +${def.tiers[i].reward} 🪙`,
          });
        }
      }
    }
  };

  const apply = (stat: StatId, rawValue: number): boolean => {
    const value = Math.floor(rawValue);
    if (!(value > 0)) return false;
    if (STAT_KIND[stat] === 'sum') {
      data.stats.sum[stat] = (data.stats.sum[stat] ?? 0) + value;
      data.daily.sum[stat] = (data.daily.sum[stat] ?? 0) + value;
      return true;
    }
    let changed = false;
    if (value > (data.stats.max[stat] ?? 0)) {
      data.stats.max[stat] = value;
      changed = true;
    }
    if (value > (data.daily.max[stat] ?? 0)) {
      data.daily.max[stat] = value;
      changed = true;
    }
    return changed;
  };

  const recordNow = (stat: StatId, value: number) => {
    ensureToday();
    const before = marks(data);
    if (!apply(stat, value)) return;
    bump();
    scheduleSave();
    notifyNew(before);
  };

  const buildView = (): ProgressView => {
    const quests: QuestView[] = questList().map((q) => {
      const value = dailyValue(data, q.stat);
      return { ...q, progress: Math.min(value, q.target), done: value >= q.target, claimed: data.daily.claimed.includes(q.id) };
    });
    const completed = quests.filter((q) => q.done).length;
    const bonus = {
      reward: BONUS_REWARD,
      done: completed === quests.length,
      claimed: data.daily.bonusClaimed,
      completed,
      total: quests.length,
    };
    const achievements: AchievementView[] = ACHIEVEMENTS.map((a: AchievementDef) => {
      const value = lifetimeValue(data, a.stat);
      const claimedTiers = data.ach[a.id] ?? [];
      const tiers: TierView[] = a.tiers.map((t, i) => ({
        target: t.target,
        reward: t.reward,
        unlocked: value >= t.target,
        claimed: claimedTiers.includes(i),
      }));
      return {
        id: a.id,
        title: a.title,
        desc: a.desc,
        icon: a.icon,
        game: a.game,
        stat: a.stat,
        value,
        tiers,
        claimableReward: tiers.filter((t) => t.unlocked && !t.claimed).reduce((n, t) => n + t.reward, 0),
        nextTier: tiers.find((t) => !t.unlocked) ?? null,
      };
    });
    const claimable =
      quests.filter((q) => q.done && !q.claimed).length +
      (bonus.done && !bonus.claimed ? 1 : 0) +
      achievements.filter((a) => a.claimableReward > 0).length;
    return {
      loaded,
      date: data.daily.date,
      nextResetAt: nextMidnight(deps.now()),
      quests,
      bonus,
      achievements,
      claimable,
    };
  };

  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    getView(): ProgressView {
      if (!cached) cached = buildView();
      return cached;
    },

    load(): Promise<void> {
      if (loaded) return Promise.resolve();
      if (!loading) {
        loading = deps.storage.load().then((raw) => {
          data = sanitize(raw, today());
          loaded = true;
          const queued = pending;
          pending = [];
          bump();
          for (const [stat, value] of queued) recordNow(stat, value);
        });
      }
      return loading;
    },

    /** Bir oyun olayını bildirir. sum istatistikler toplanır, max istatistikler en yüksek değeri tutar. */
    record(stat: StatId, value = 1) {
      if (!Number.isFinite(value)) return;
      if (!loaded) {
        pending.push([stat, value]);
        return;
      }
      recordNow(stat, value);
    },

    /** Gün değişmiş olabilir (uygulama açık kalmışsa): kontrol edip arayüzü yeniler. */
    refresh() {
      if (ensureToday()) {
        bump();
        scheduleSave();
      } else {
        bump(); // geri sayım gibi zamana bağlı alanlar tazelensin
      }
    },

    claimQuest(id: string): boolean {
      if (!loaded) return false;
      ensureToday();
      const q = buildView().quests.find((x) => x.id === id);
      if (!q || !q.done || q.claimed) return false;
      data.daily.claimed.push(id);
      deps.grant(q.reward);
      bump();
      scheduleSave();
      recordNow('quests.claimed', 1); // "Günlük Düzenli" başarımı için
      return true;
    },

    claimBonus(): boolean {
      if (!loaded) return false;
      ensureToday();
      const b = buildView().bonus;
      if (!b.done || b.claimed) return false;
      data.daily.bonusClaimed = true;
      deps.grant(b.reward);
      bump();
      scheduleSave();
      return true;
    },

    /** Açılmış ve henüz alınmamış tüm basamakların ödülünü alır. Verilen toplam parayı döner (0: alınacak yok). */
    claimAchievement(id: string): number {
      if (!loaded) return 0;
      const a = buildView().achievements.find((x) => x.id === id);
      if (!a || a.claimableReward <= 0) return 0;
      const claimed = new Set(data.ach[id] ?? []);
      a.tiers.forEach((t, i) => {
        if (t.unlocked) claimed.add(i);
      });
      data.ach[id] = [...claimed].sort((x, y) => x - y);
      deps.grant(a.claimableReward);
      bump();
      scheduleSave();
      return a.claimableReward;
    },

    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (loaded) deps.storage.save(data);
    },
  };
}

export type ProgressStore = ReturnType<typeof createProgressStore>;
