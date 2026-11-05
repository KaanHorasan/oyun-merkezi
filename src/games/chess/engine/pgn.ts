import { START_FEN } from './fen';

/** Hamle metni: "1. e4 e5 2. Nf3 Nc6". Siyahla başlayan pozisyonda "1... e5 2. Nf3". */
export function movetextOf(startFen: string, sans: string[]): string {
  const fields = startFen.trim().split(/\s+/);
  const startBlack = fields[1] === 'b';
  const startNumber = Number(fields[5] ?? 1) || 1;
  const tokens: string[] = [];
  sans.forEach((san, i) => {
    const whiteMoves = startBlack ? i % 2 === 1 : i % 2 === 0;
    const number = startNumber + Math.floor((i + (startBlack ? 1 : 0)) / 2);
    if (whiteMoves) tokens.push(`${number}.`);
    else if (i === 0) tokens.push(`${number}...`);
    tokens.push(san);
  });
  return tokens.join(' ');
}

export type PgnResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export function toPgn(opts: {
  startFen: string;
  sans: string[];
  result: PgnResult;
  white?: string;
  black?: string;
  date?: Date;
}): string {
  const d = opts.date ?? new Date();
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  const headers: [string, string][] = [
    ['Event', 'Oyun Merkezi'],
    ['Site', '?'],
    ['Date', `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`],
    ['Round', '-'],
    ['White', opts.white ?? 'Beyaz'],
    ['Black', opts.black ?? 'Siyah'],
    ['Result', opts.result],
  ];
  if (opts.startFen !== START_FEN) {
    headers.push(['SetUp', '1'], ['FEN', opts.startFen]);
  }
  const head = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');
  const body = [movetextOf(opts.startFen, opts.sans), opts.result].filter(Boolean).join(' ');
  return `${head}\n\n${body}\n`;
}
