// Oyun içi para cüzdanının çekirdeği (React ve depolamadan bağımsız, testlenebilir).
// Tüm oyunlar aynı cüzdanı kullanır; ileride günlük görev/başarım ödülleri de buraya eklenir.

export type WalletStorage = {
  load: () => Promise<number>;
  save: (balance: number) => void | Promise<void>;
};

export function createWalletStore(storage: WalletStorage, saveDelayMs = 300) {
  let balance = 0;
  let loaded = false;
  let pendingAdds = 0; // yükleme bitmeden kazanılan para (kaybolmasın)
  let loading: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      storage.save(balance);
    }, saveDelayMs);
  };

  return {
    getBalance: () => balance,
    isLoaded: () => loaded,

    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    load(): Promise<void> {
      if (loaded) return Promise.resolve();
      if (!loading) {
        loading = storage.load().then((saved) => {
          const base = Number.isFinite(saved) ? Math.max(0, Math.floor(saved)) : 0;
          const hadPending = pendingAdds > 0;
          balance = base + pendingAdds;
          pendingAdds = 0;
          loaded = true;
          if (hadPending) scheduleSave();
          emit();
        });
      }
      return loading;
    },

    /** Para ekler. Yükleme bitmeden de kabul edilir, kaybolmaz. */
    add(n: number) {
      const amount = Math.floor(n);
      if (!(amount > 0)) return;
      balance += amount;
      if (loaded) scheduleSave();
      else pendingAdds += amount;
      emit();
    },

    /** Yeterli para varsa harcar ve true döner; yoksa hiçbir şey değişmez. Bakiye asla negatif olmaz. */
    spend(n: number): boolean {
      const amount = Math.floor(n);
      if (!loaded || !(amount >= 0) || amount > balance) return false;
      balance -= amount;
      scheduleSave();
      emit();
      return true;
    },

    /** Bekleyen kaydı hemen yazar (uygulama arka plana giderken). */
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (loaded) storage.save(balance);
    },
  };
}
