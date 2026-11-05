// Satranç saati: saf mantık (React'ten bağımsız, testli). Zamanı dışarıdan (`now`, ms) alır; kendi başına saymaz.
//
// İki mod:
//  - "Hamle başı" (perMove): her hamle için sabit süre. Sıra gelince süre baştan başlar; bitirmeden hamle yapılmazsa süre biter.
//  - "Toplam süre" (total): her oyuncunun bir havuzu vardır, hamle yapınca her hamle için `incSec` kadar eklenir (Fischer artışı).
//
// Saat, beyazın ilk hamlesinden sonra çalışmaya başlar (Lichess/chess.com gibi). İlk hamleye artış eklenmez.
import { BLACK, WHITE } from './engine/types';
import type { Color } from './engine/types';

/** Şimdiki zaman (ms). Saat mantığı zamanı dışarıdan aldığı için arayüz bunu çağırıp verir. */
export const nowMs = (): number => Date.now();

export type TimedControl = { kind: 'perMove'; sec: number } | { kind: 'total'; baseSec: number; incSec: number };
export type TimeControl = { kind: 'none' } | TimedControl;

export type TimePreset = {
  id: string;
  group: 'none' | 'perMove' | 'total';
  /** Seçim düğmesinde görünen kısa ad */
  label: string;
  control: TimeControl;
};

export const TIME_PRESETS: TimePreset[] = [
  { id: 'none', group: 'none', label: 'Süresiz', control: { kind: 'none' } },
  { id: 'pm10', group: 'perMove', label: '10 sn', control: { kind: 'perMove', sec: 10 } },
  { id: 'pm15', group: 'perMove', label: '15 sn', control: { kind: 'perMove', sec: 15 } },
  { id: 'pm30', group: 'perMove', label: '30 sn', control: { kind: 'perMove', sec: 30 } },
  { id: 'pm60', group: 'perMove', label: '60 sn', control: { kind: 'perMove', sec: 60 } },
  { id: 't3+2', group: 'total', label: '3 dk + 2 sn', control: { kind: 'total', baseSec: 180, incSec: 2 } },
  { id: 't5+0', group: 'total', label: '5 dk', control: { kind: 'total', baseSec: 300, incSec: 0 } },
  { id: 't10+0', group: 'total', label: '10 dk', control: { kind: 'total', baseSec: 600, incSec: 0 } },
  { id: 't15+10', group: 'total', label: '15 dk + 10 sn', control: { kind: 'total', baseSec: 900, incSec: 10 } },
];

export const DEFAULT_PRESET_ID = 'none';

/** Bilinmeyen kimlik (ör. eski/bozuk ayar) için "Süresiz" döner */
export const presetById = (id: string): TimePreset => TIME_PRESETS.find((p) => p.id === id) ?? TIME_PRESETS[0];

const fmtMinutes = (sec: number) => (sec % 60 === 0 ? `${sec / 60} dk` : `${Math.floor(sec / 60)} dk ${sec % 60} sn`);

/** "Hamle başı 15 sn", "5 dk", "3 dk + 2 sn", "Süresiz" */
export function describeControl(c: TimeControl): string {
  if (c.kind === 'none') return 'Süresiz';
  if (c.kind === 'perMove') return `Hamle başı ${c.sec} sn`;
  return c.incSec > 0 ? `${fmtMinutes(c.baseSec)} + ${c.incSec} sn` : fmtMinutes(c.baseSec);
}

/** Saat metni: 10 saniyenin altında onda birli ("7.3"), üstünde "m:ss" (1 saati aşarsa "h:mm:ss"). Yukarı yuvarlar: 0.0 yalnızca süre bitince görünür. */
export function formatClock(ms: number): string {
  if (!(ms > 0)) return '0.0';
  const tenths = Math.ceil(ms / 100);
  if (tenths < 100) return (tenths / 10).toFixed(1);
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Kırmızı uyarı eşiği: toplam süre modunda 10 sn, hamle başı modunda 5 sn */
export const lowThresholdMs = (c: TimedControl): number => (c.kind === 'perMove' ? 5000 : 10000);

/** Kayda geçen saat durumu. Saat kayıt anında durur; "Devam et" ile kaldığı yerden sürer. */
export type ClockSave = {
  control: TimedControl;
  /** [beyaz, siyah] kalan süre (ms) */
  remaining: [number, number];
  /** Her hamleden önceki [beyaz, siyah] değerleri; geri alırken kullanılır */
  history: [number, number][];
};

/** Zamanlı kontrol ise saat kurar, "Süresiz" ise null döner */
export function createClock(control: TimeControl): ChessClock | null {
  return control.kind === 'none' ? null : new ChessClock(control);
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isPair = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);

export class ChessClock {
  readonly control: TimedControl;
  private rem: [number, number];
  private hist: [number, number][] = [];
  private runningColor: Color | null = null;
  private since = 0;

  constructor(control: TimedControl) {
    this.control = control;
    const start = this.initialMs();
    this.rem = [start, start];
  }

  /** Kayıttan saat kurar; bozuksa null */
  static fromSave(save: unknown): ChessClock | null {
    try {
      const s = save as ClockSave | null | undefined;
      const c = s?.control;
      if (!c || !s || !isPair(s.remaining) || !Array.isArray(s.history) || !s.history.every(isPair)) return null;
      const valid =
        (c.kind === 'perMove' && isNum(c.sec) && c.sec > 0) ||
        (c.kind === 'total' && isNum(c.baseSec) && c.baseSec > 0 && isNum(c.incSec));
      if (!valid) return null;
      const clock = new ChessClock(c.kind === 'perMove' ? { kind: 'perMove', sec: c.sec } : { kind: 'total', baseSec: c.baseSec, incSec: c.incSec });
      clock.rem = [s.remaining[0], s.remaining[1]];
      clock.hist = s.history.map((p) => [p[0], p[1]]);
      return clock;
    } catch {
      return null;
    }
  }

  private initialMs(): number {
    return (this.control.kind === 'perMove' ? this.control.sec : this.control.baseSec) * 1000;
  }

  /** İlk hamle yapıldıktan sonra true */
  get started(): boolean {
    return this.hist.length > 0;
  }

  /** Şu an kimin süresi akıyor (durdurulmuşsa ya da henüz başlamadıysa null) */
  get running(): Color | null {
    return this.runningColor;
  }

  /** `color`ın o ana kadar kalan süresi (ms) */
  read(color: Color, now: number): number {
    const elapsed = this.runningColor === color ? Math.max(0, now - this.since) : 0;
    return Math.max(0, this.rem[color] - elapsed);
  }

  /** Süresi biten oyuncu (yoksa null) */
  flagged(now: number): Color | null {
    const c = this.runningColor;
    return c !== null && this.read(c, now) <= 0 ? c : null;
  }

  /** Saati `color` için çalıştırır (yalnızca ilk hamleden sonra ve saat duruyorsa) */
  resume(color: Color, now: number): void {
    if (!this.started || this.runningColor !== null) return;
    this.runningColor = color;
    this.since = now;
  }

  /** Akan süreyi işleyip saati durdurur */
  pause(now: number): void {
    const c = this.runningColor;
    if (c === null) return;
    this.rem[c] = this.read(c, now);
    this.runningColor = null;
  }

  /** `mover` hamle yaptı: süresini işler, artışı ekler (hamle başı modunda iki tarafı da baştan kurar), saati rakibe geçirir */
  moved(mover: Color, now: number): void {
    const first = !this.started;
    const other: Color = mover === WHITE ? BLACK : WHITE;
    const left = this.read(mover, now);
    this.hist.push([this.rem[WHITE], this.rem[BLACK]]);
    if (this.control.kind === 'perMove') {
      const full = this.control.sec * 1000;
      this.rem = [full, full];
    } else {
      this.rem[mover] = first ? left : left + this.control.incSec * 1000;
    }
    this.runningColor = other;
    this.since = now;
  }

  /** Geri alınan hamleden önceki süreleri döndürür; `mover` hamlesi geri alınan taraftır, saat yine onun için işler */
  undoMove(mover: Color, now: number): void {
    const snap = this.hist.pop();
    if (!snap) return;
    this.rem = [snap[0], snap[1]];
    this.runningColor = this.started ? mover : null;
    this.since = now;
  }

  /** Süre bitişi geri alınınca: süresi biten tarafa kısa bir ek süre verir ve saati onun için çalıştırır */
  grantTime(color: Color, now: number): void {
    const grant = this.control.kind === 'perMove' ? this.control.sec * 1000 : 15000;
    this.rem[color] = Math.max(this.rem[color], grant);
    if (this.started) {
      this.runningColor = color;
      this.since = now;
    }
  }

  toSave(now: number): ClockSave {
    return {
      control: this.control,
      remaining: [this.read(WHITE, now), this.read(BLACK, now)],
      history: this.hist.map((p) => [p[0], p[1]] as [number, number]),
    };
  }
}
