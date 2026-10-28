import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from './storage';

export type Settings = {
  sound: boolean;
  vibration: boolean;
  ghost: boolean;
  showButtons: boolean;
};

const DEFAULTS: Settings = { sound: true, vibration: true, ghost: true, showButtons: true };
const KEY = 'settings:v1';

let current: Settings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const saved = await loadJSON<Partial<Settings>>(KEY, {});
  current = { ...DEFAULTS, ...saved };
  emit();
}

/** Tüm oyunların paylaştığı ayarlar. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULTS,
  );

  useEffect(() => {
    ensureLoaded();
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    current = { ...current, ...patch };
    saveJSON(KEY, current);
    emit();
  }, []);

  return [settings, update];
}
