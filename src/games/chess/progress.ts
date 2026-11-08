// Satranç -> ortak ilerleme sistemi (günlük görevler ve başarımlar). Saf mantık, testli.
//
// İstatistikler OYUN BİTİNCE bildirilir (hamle anında değil): iki kişilik modda "taş al, geri al, tekrar al" ile
// görev/başarım şişirilemesin. Çok kısa oyunlar (MIN_PLIES'ten az hamle) hiç sayılmaz. Oyun başına yalnızca bir kez bildirilir
// (bunu arayüz sağlar). Yapay zeka gelince galibiyet temelli ödüller ayrıca eklenecek (bkz. docs/satranc-plani.md).
import type { StatId } from '@/lib/progress/definitions';
import type { ChessGame } from './engine/game';
import { FLAG_CASTLE_K, FLAG_CASTLE_Q, moveFlags } from './engine/types';

/** Sayılması için gereken en az yarım hamle (taraf başına 5 hamle) */
export const MIN_PLIES = 10;

export type ChessStat = { stat: StatId; value: number };

/** Biten bir oyunun bildirilecek istatistikleri. Oyun bitmediyse ya da çok kısaysa boş liste. */
export function statsForFinishedGame(game: ChessGame, timed: boolean, minPlies = MIN_PLIES): ChessStat[] {
  if (!game.isOver || game.records.length < minPlies) return [];
  let captures = 0;
  let promotions = 0;
  let castles = 0;
  for (const r of game.records) {
    if (r.captured !== 0) captures++;
    if (r.promo !== 0) promotions++;
    if (moveFlags(r.move) & (FLAG_CASTLE_K | FLAG_CASTLE_Q)) castles++;
  }
  const out: ChessStat[] = [{ stat: 'ch.games', value: 1 }];
  if (timed) out.push({ stat: 'ch.timedGames', value: 1 });
  if (game.status.kind === 'checkmate') out.push({ stat: 'ch.checkmates', value: 1 });
  if (captures > 0) out.push({ stat: 'ch.captures', value: captures });
  if (promotions > 0) out.push({ stat: 'ch.promotions', value: promotions });
  if (castles > 0) out.push({ stat: 'ch.castles', value: castles });
  return out;
}
