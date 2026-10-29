import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from './storage';

export type Settings = {
  sound: boolean;
  music: boolean;
  /** 0..1 */
  sfxVolume: number;
  /** 0..1 */
  musicVolume: number;
  vibration: boolean;
  ghost: boolean;
  showButtons: boolean;
};

const DEFAULTS: Settings = {
  sound: true,
  music: true,
  sfxVolume: 0.8,
  musicVolume: 0.35,
  vibration: true,
  ghost: true,
  showButtons: true,
};
const KEY = 'settings:v1';

let current: Settings = DEFAULTS;
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
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
    emit();
    // Ses çubuğu sürüklenirken saniyede onlarca değişiklik olur; kaydı bekletip tek seferde yaz.
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveJSON(KEY, current), 300);
  }, []);

  return [settings, update];
}
