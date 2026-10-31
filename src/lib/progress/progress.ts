import { useEffect, useSyncExternalStore } from 'react';
import { addCoins } from '../wallet';
import { loadJSON, saveJSON } from '../storage';
import type { StatId } from './definitions';
import { createProgressStore, emptyData } from './engine';
import type { ProgressView } from './engine';
import { pushNotice } from './notices';

const KEY = 'progress:v1';

const store = createProgressStore({
  storage: {
    load: () => loadJSON<unknown>(KEY, null),
    save: (data) => {
      saveJSON(KEY, data);
    },
  },
  now: () => new Date(),
  grant: addCoins, // ödüller ortak cüzdana gider
  notify: pushNotice,
});

// Sunucu tarafı (statik üretim) ve ilk çizim için sabit, "yüklenmedi" görünümü
const LOADING_VIEW: ProgressView = {
  loaded: false,
  date: emptyData('').daily.date,
  nextResetAt: 0,
  quests: [],
  bonus: { reward: 0, done: false, claimed: false, completed: 0, total: 0 },
  achievements: [],
  claimable: 0,
};

/** İlerleme görünümü ve eylemler. Değişince ekran kendiliğinden yenilenir. */
export function useProgress() {
  const view = useSyncExternalStore(store.subscribe, store.getView, () => LOADING_VIEW);
  useEffect(() => {
    store.load().then(() => store.refresh());
  }, []);
  return {
    view,
    refresh: store.refresh,
    claimQuest: store.claimQuest,
    claimBonus: store.claimBonus,
    claimAchievement: store.claimAchievement,
  };
}

/**
 * Oyunlardan çağrılır: bir istatistiği bildirir (ör. record('ms.cells', 12)).
 * Görev ve başarımlar buna göre kendiliğinden ilerler, tamamlananlar bildirim olarak gösterilir.
 */
export function record(stat: StatId, value = 1) {
  store.load();
  store.record(stat, value);
}

export const loadProgress = () => store.load();
export const flushProgress = () => store.flush();
