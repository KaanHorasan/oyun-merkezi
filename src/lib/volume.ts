/** Ses düzeyi yardımcıları (0 = sessiz, 1 = en yüksek). */

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** %1 hassasiyete yuvarlar (gereksiz küçük farklar yüzünden sürekli kayıt yapılmasın). */
export const roundVolume = (v: number): number => Math.round(clamp01(v) * 100) / 100;

/** Çubuk üzerinde x konumundan (px) ses düzeyi hesaplar. */
export const positionToValue = (x: number, width: number): number => (width > 0 ? roundVolume(x / width) : 0);

/** Düğmelerle ± adım (varsayılan %10). Kayan nokta hatası olmasın diye yuvarlanır. */
export const stepVolume = (v: number, delta: number): number => roundVolume(v + delta);
