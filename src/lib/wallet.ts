import { useEffect, useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from './storage';
import { createWalletStore } from './walletCore';

const KEY = 'wallet:v1';

const store = createWalletStore({
  load: async () => (await loadJSON<{ coins: number }>(KEY, { coins: 0 })).coins,
  save: (coins) => {
    saveJSON(KEY, { coins });
  },
});

/** Cüzdan bakiyesi (değişince ekran kendiliğinden yenilenir). */
export function useWallet(): { coins: number } {
  const coins = useSyncExternalStore(store.subscribe, store.getBalance, () => 0);
  useEffect(() => {
    store.load();
  }, []);
  return { coins };
}

export const loadWallet = () => store.load();
export const getCoins = () => store.getBalance();
export const addCoins = (n: number) => store.add(n);
export const spendCoins = (n: number) => store.spend(n);
export const flushWallet = () => store.flush();
