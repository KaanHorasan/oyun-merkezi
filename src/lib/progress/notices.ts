import { useSyncExternalStore } from 'react';
import type { ProgressNotice } from './engine';

// Ekranda kısa süre görünen bildirimler (görev tamamlandı, başarım kazanıldı...). Kuyruk halinde sırayla gösterilir.

export type Notice = ProgressNotice & { id: number };

const NOTICE_MS = 3600;

let current: Notice | null = null;
const queue: Notice[] = [];
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function advance() {
  if (timer) clearTimeout(timer);
  timer = null;
  current = queue.shift() ?? null;
  emit();
  if (current) timer = setTimeout(advance, NOTICE_MS);
}

export function pushNotice(n: ProgressNotice) {
  queue.push({ ...n, id: nextId++ });
  if (!current) advance();
}

export function dismissNotice() {
  advance();
}

export function useNotice(): Notice | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => null,
  );
}
