// Çalıştırma: npx tsx src/lib/progress/engine.test.ts
import {
  ACHIEVEMENTS, BONUS_REWARD, DAILY_QUEST_COUNT, QUEST_TEMPLATES, STAT_KIND, hashString, pickDailyQuests,
} from './definitions';
import type { StatId } from './definitions';
import { createProgressStore, localDateKey, nextMidnight, sanitize } from './engine';
import type { ProgressNotice } from './engine';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(opts: { saved?: unknown; start?: Date } = {}) {
  let saved: unknown = opts.saved ?? null;
  let clock = opts.start ?? new Date(2026, 9, 30, 12, 0, 0);
  const granted: number[] = [];
  const notices: ProgressNotice[] = [];
  const store = createProgressStore({
    storage: {
      load: async () => saved,
      save: (d) => {
        saved = JSON.parse(JSON.stringify(d));
      },
    },
    now: () => clock,
    grant: (n) => granted.push(n),
    notify: (n) => notices.push(n),
    saveDelayMs: 1,
  });
  return {
    store,
    granted,
    notices,
    getSaved: () => saved,
    setClock: (d: Date) => (clock = d),
    total: () => granted.reduce((a, b) => a + b, 0),
  };
}

/** Bugünün bütün görevlerini tamamlatır */
function completeAll(s: ReturnType<typeof setup>) {
  for (const q of s.store.getView().quests) s.store.record(q.stat, q.target);
}

async function main() {
  // ---------- Tanımların tutarlılığı ----------
  {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    check('Başarım kimlikleri benzersiz', new Set(ids).size === ids.length);
    check('Görev şablonu kimlikleri benzersiz', new Set(QUEST_TEMPLATES.map((t) => t.id)).size === QUEST_TEMPLATES.length);
    let tiersOk = true;
    for (const a of ACHIEVEMENTS) {
      if (!(a.stat in STAT_KIND) || a.tiers.length === 0) tiersOk = false;
      a.tiers.forEach((t, i) => {
        if (!(t.target > 0) || !(t.reward > 0)) tiersOk = false;
        if (i > 0 && (t.target <= a.tiers[i - 1].target || t.reward <= a.tiers[i - 1].reward)) tiersOk = false; // basamaklar artmalı
      });
    }
    check('Başarım basamakları artan hedef ve ödülle tanımlı, istatistikleri geçerli', tiersOk);
    let tplOk = true;
    for (const t of QUEST_TEMPLATES) {
      if (!(t.stat in STAT_KIND) || t.targets.length !== t.rewards.length || !t.text.includes('{n}')) tplOk = false;
      t.targets.forEach((x, i) => {
        if (i > 0 && (x <= t.targets[i - 1] || t.rewards[i] <= t.rewards[i - 1])) tplOk = false;
      });
    }
    check('Görev şablonları tutarlı (hedef ve ödül sayısı eşit, artan zorluk)', tplOk);
    check('Hem Tetris hem Mayın Tarlası şablonu var, en az 4 şablon', QUEST_TEMPLATES.some((t) => t.game === 'tetris') && QUEST_TEMPLATES.some((t) => t.game === 'minesweeper') && QUEST_TEMPLATES.length >= 4);
  }

  // ---------- Günlük seçim ----------
  {
    const a = pickDailyQuests('2026-10-30');
    const b = pickDailyQuests('2026-10-30');
    check('Aynı gün aynı görevler (deterministik)', JSON.stringify(a) === JSON.stringify(b));
    check(`Her gün ${DAILY_QUEST_COUNT} görev`, a.length === DAILY_QUEST_COUNT);
    let distinct = true, bothGames = true;
    const seenTemplates = new Set<string>();
    const seenSets = new Set<string>();
    for (let d = 1; d <= 120; d++) {
      const date = `2026-${String(1 + Math.floor((d - 1) / 28)).padStart(2, '0')}-${String(1 + ((d - 1) % 28)).padStart(2, '0')}`;
      const q = pickDailyQuests(date);
      if (new Set(q.map((x) => x.id)).size !== q.length) distinct = false;
      if (!q.some((x) => x.game === 'tetris') || !q.some((x) => x.game === 'minesweeper')) bothGames = false;
      q.forEach((x) => seenTemplates.add(x.id));
      seenSets.add(q.map((x) => x.id + x.target).join('|'));
    }
    check('120 gün boyunca görevler hep farklı şablonlardan', distinct);
    check('Her gün hem Tetris hem Mayın Tarlası görevi var', bothGames);
    check('Tüm şablonlar bir şekilde seçiliyor', seenTemplates.size === QUEST_TEMPLATES.length);
    check(`Günler birbirinden farklı görev setleri veriyor (${seenSets.size} farklı set)`, seenSets.size > 20);
    check('Hedefler ve ödüller şablondan geliyor', a.every((q) => q.target > 0 && q.reward > 0 && q.text.length > 5 && !q.text.includes('{n}')));
    check('Karma fonksiyonu kararlı', hashString('abc') === hashString('abc') && hashString('abc') !== hashString('abd'));
  }

  // ---------- Tarih ----------
  {
    check('Yerel gün anahtarı biçimi', localDateKey(new Date(2026, 0, 5, 23, 59)) === '2026-01-05');
    const mid = new Date(nextMidnight(new Date(2026, 11, 31, 10, 0)));
    check('Gece yarısı hesabı yıl sonunda da doğru', mid.getFullYear() === 2027 && mid.getMonth() === 0 && mid.getDate() === 1 && mid.getHours() === 0);
  }

  // ---------- Kayıt (record) ----------
  {
    const s = setup();
    await s.store.load();
    s.store.record('ms.cells', 40);
    s.store.record('ms.cells', 60);
    s.store.record('tt.bestScore', 1500);
    s.store.record('tt.bestScore', 900); // düşük değer yok sayılır
    s.store.record('tt.bestScore', 2000);
    const view = s.store.getView();
    check('Toplanan istatistik toplanır', view.achievements.find((a) => a.id === 'ms-explorer')!.value === 100);
    check('En yüksek istatistik en yüksek değeri tutar', view.achievements.find((a) => a.id === 'tt-score')!.value === 2000);
    s.store.record('ms.cells', 0);
    s.store.record('ms.cells', -5);
    s.store.record('ms.cells', NaN);
    check('Geçersiz değerler yok sayılır', s.store.getView().achievements.find((a) => a.id === 'ms-explorer')!.value === 100);
    s.store.record('ms.cells', 2.9);
    check('Kesirli değer aşağı yuvarlanır', s.store.getView().achievements.find((a) => a.id === 'ms-explorer')!.value === 102);
    const v1 = s.store.getView();
    check('Değişiklik yoksa aynı görünüm nesnesi döner (React için kararlı)', s.store.getView() === v1);
  }

  // ---------- Günlük görev: ilerleme, ödül, çift tahsilat ----------
  {
    const s = setup();
    await s.store.load();
    const q0 = s.store.getView().quests[0];
    check('Başta görev bitmemiş', !q0.done && q0.progress === 0);
    check('Bitmemiş görevin ödülü alınamaz', s.store.claimQuest(q0.id) === false && s.total() === 0);

    s.store.record(q0.stat, q0.target - 1);
    check('Hedefin altında görev tamamlanmaz ve görev bildirimi gelmez', !s.store.getView().quests[0].done && !s.notices.some((n) => n.kind === 'quest'));
    // toplanan istatistikte 1 eklemek yeter; "en yüksek" istatistikte hedefin kendisi kaydedilmeli
    if (STAT_KIND[q0.stat] === 'sum') s.store.record(q0.stat, 1);
    else s.store.record(q0.stat, q0.target);
    const done = s.store.getView().quests[0];
    check('Hedefe ulaşınca tamamlanır', done.done && done.progress === done.target);
    check('Tamamlanınca bildirim gelir', s.notices.some((n) => n.kind === 'quest'));
    s.store.record(q0.stat, q0.target * 3);
    check('Hedef aşılınca tekrar bildirim gelmez', s.notices.filter((n) => n.kind === 'quest').length === 1);
    check('İlerleme hedefle sınırlanır', s.store.getView().quests[0].progress === q0.target);

    check('Ödül alınır', s.store.claimQuest(q0.id) === true && s.total() === q0.reward);
    check('Aynı görevin ödülü ikinci kez alınamaz', s.store.claimQuest(q0.id) === false && s.total() === q0.reward);
    check('Alınan görev "alındı" görünür', s.store.getView().quests[0].claimed);
    check('Olmayan görev kimliği reddedilir', s.store.claimQuest('yok') === false);
  }

  // ---------- Bonus ----------
  {
    const s = setup();
    await s.store.load();
    const qs = s.store.getView().quests;
    s.store.record(qs[0].stat, qs[0].target);
    s.store.record(qs[1].stat, qs[1].target);
    check('İki görevle bonus açılmaz', !s.store.getView().bonus.done && s.store.claimBonus() === false);
    s.store.record(qs[2].stat, qs[2].target);
    check('Hepsi bitince bonus açılır ve bildirim gelir', s.store.getView().bonus.done && s.notices.some((n) => n.kind === 'bonus'));
    const before = s.total();
    check('Bonus alınır', s.store.claimBonus() === true && s.total() === before + BONUS_REWARD);
    check('Bonus ikinci kez alınamaz', s.store.claimBonus() === false && s.total() === before + BONUS_REWARD);
  }

  // ---------- Başarımlar ----------
  {
    const s = setup();
    await s.store.load();
    s.store.record('ms.cells', 100);
    const exp = () => s.store.getView().achievements.find((a) => a.id === 'ms-explorer')!;
    check('İlk basamak açılır', exp().tiers[0].unlocked && !exp().tiers[1].unlocked && exp().claimableReward === 25);
    check('Başarım bildirimi gelir', s.notices.some((n) => n.kind === 'achievement' && n.title.includes('Kaşif') && n.title.includes('I')));
    check('Sonraki basamak doğru gösterilir', exp().nextTier?.target === 1000);
    check('Alınacak ödül varken rozet sayısı artar', s.store.getView().claimable >= 1);

    check('Ödül alınır', s.store.claimAchievement('ms-explorer') === 25 && s.total() === 25);
    check('Aynı basamak ikinci kez alınamaz', s.store.claimAchievement('ms-explorer') === 0 && s.total() === 25);

    s.store.record('ms.cells', 900);
    check('İkinci basamak ayrıca açılır', exp().tiers[1].unlocked && exp().claimableReward === 100);
    s.store.record('ms.cells', 9000);
    check('Atlanan basamaklar birlikte alınabilir (II + III)', exp().claimableReward === 100 + 400);
    check('İki basamağın ödülü birlikte verilir', s.store.claimAchievement('ms-explorer') === 500 && s.total() === 525);
    check('Hiçbir şey alınacak kalmadı', exp().claimableReward === 0 && s.store.claimAchievement('yok') === 0);
  }

  // ---------- "Günlük Düzenli" başarımı görev ödülü almaya bağlı ----------
  {
    const s = setup();
    await s.store.load();
    const q = s.store.getView().quests[0];
    s.store.record(q.stat, q.target);
    s.store.claimQuest(q.id);
    const daily = s.store.getView().achievements.find((a) => a.id === 'daily')!;
    check('Görev ödülü almak "Günlük Düzenli" başarımını ilerletir', daily.value === 1 && daily.tiers[0].unlocked);
  }

  // ---------- Gün değişimi ----------
  {
    const s = setup({ start: new Date(2026, 9, 30, 23, 30) });
    await s.store.load();
    const day1 = s.store.getView();
    const q = day1.quests[0];
    s.store.record(q.stat, q.target);
    s.store.claimQuest(q.id);
    s.store.record('tt.bestScore', 1500);
    s.store.record('ms.cells', 150);

    const lifeBefore = Object.fromEntries(s.store.getView().achievements.map((a) => [a.id, a.value]));
    s.setClock(new Date(2026, 9, 31, 0, 5));
    s.store.refresh();
    const day2 = s.store.getView();
    check('Gün değişince tarih güncellenir', day2.date === '2026-10-31' && day1.date === '2026-10-30');
    check('Günlük ilerleme sıfırlanır', day2.quests.every((x) => x.progress === 0 && !x.done && !x.claimed) && !day2.bonus.claimed);
    check('Yeni günün görevleri o güne göre seçilir', JSON.stringify(day2.quests.map((x) => x.id + x.target)) === JSON.stringify(pickDailyQuests('2026-10-31').map((x) => x.id + x.target)));
    check('Tüm zamanların istatistikleri gün değişince aynen korunur', day2.achievements.every((a) => a.value === lifeBefore[a.id]) && lifeBefore['ms-explorer'] === 150 && lifeBefore['tt-score'] >= 1500);
    check('Alınmış başarım ödülleri korunur', day2.achievements.find((a) => a.id === 'daily')!.value === 1);

    // günlük "en yüksek" istatistik de sıfırlanır; ancak yeni gün düşük skor yeni günün ilerlemesi sayılır
    const tq = day2.quests.find((x) => x.stat === 'tt.bestScore');
    s.store.record('tt.bestScore', 100);
    const after = s.store.getView();
    check('Eski günün skoru yeni günün görevine sayılmaz', !after.quests.some((x) => x.stat === 'tt.bestScore' && x.progress > 100));
    check('Düşük skor tüm zamanların en yükseğini düşürmez', after.achievements.find((a) => a.id === 'tt-score')!.value === lifeBefore['tt-score']);
    void tq;

    // record sırasında da otomatik gün değişimi
    s.setClock(new Date(2026, 10, 2, 9, 0));
    s.store.record('ms.cells', 10);
    check('record çağrısı da gün değişimini yakalar', s.store.getView().date === '2026-11-02');
  }

  // ---------- Kayıt ve geri yükleme ----------
  {
    const s = setup();
    await s.store.load();
    const q = s.store.getView().quests[1];
    s.store.record(q.stat, q.target);
    s.store.claimQuest(q.id);
    s.store.record('tt.lines', 120);
    s.store.claimAchievement('tt-lines');
    await wait(15);
    const saved = s.getSaved();
    check('Veri kaydedildi', saved !== null && typeof saved === 'object');

    const s2 = setup({ saved });
    await s2.store.load();
    const v = s2.store.getView();
    check('Yeniden açınca ilerleme geri gelir', v.quests[1].claimed && v.achievements.find((a) => a.id === 'tt-lines')!.value === 120);
    check('Alınan başarım ödülü yeniden alınamaz', s2.store.claimAchievement('tt-lines') === 0);
    check('Yeniden açınca eski ilerleme için bildirim gelmez', s2.notices.length === 0);
  }

  // ---------- Yükleme bitmeden gelen kayıtlar kaybolmaz ----------
  {
    const s = setup();
    s.store.record('ms.cells', 30); // henüz yüklenmedi
    s.store.record('ms.cells', 20);
    check('Yüklemeden önce görünüm "yüklenmedi" der', s.store.getView().loaded === false);
    check('Yüklemeden önce ödül alınamaz', s.store.claimQuest('x') === false && s.store.claimBonus() === false && s.store.claimAchievement('x') === 0);
    await s.store.load();
    check('Yüklemeden önce gelen kayıtlar sonradan uygulanır', s.store.getView().achievements.find((a) => a.id === 'ms-explorer')!.value === 50 && s.store.getView().loaded);
  }

  // ---------- Bozuk kayıt ----------
  {
    const today = '2026-10-30';
    check('null kayıt temiz veri verir', JSON.stringify(sanitize(null, today).stats) === '{"sum":{},"max":{}}');
    check('Metin kayıt temiz veri verir', sanitize('bozuk', today).daily.date === today);
    check('Yanlış sürüm temiz veri verir', Object.keys(sanitize({ v: 99, stats: { sum: { 'ms.cells': 5 } } }, today).stats.sum).length === 0);
    const dirty = sanitize({ v: 1, stats: { sum: { 'ms.cells': -5, 'tt.lines': 'x', 'tt.games': 7 }, max: null }, daily: { date: today, sum: { 'ms.cells': 3 }, claimed: [1, 'a'], bonusClaimed: 'evet' }, ach: { x: [1, -2, 'a', 3.5, 4] } }, today);
    check('Negatif/yanlış tipli değerler atılır', dirty.stats.sum['ms.cells'] === undefined && dirty.stats.sum['tt.lines'] === undefined && dirty.stats.sum['tt.games'] === 7);
    check('Geçerli günlük veri korunur, bozuk alanlar düzelir', dirty.daily.sum['ms.cells'] === 3 && dirty.daily.claimed.length === 1 && dirty.daily.bonusClaimed === false);
    check('Başarım basamak listesi temizlenir', JSON.stringify(dirty.ach.x) === '[1,4]');
    check('Başka güne ait günlük ilerleme atılır', sanitize({ v: 1, daily: { date: '2026-10-29', sum: { 'ms.cells': 99 } } }, today).daily.sum['ms.cells'] === undefined);

    const s = setup({ saved: { v: 1, stats: 'çöp', daily: 5, ach: [] } });
    await s.store.load();
    check('Bozuk kayıtla açılış çökmez, görünüm temiz', s.store.getView().loaded && s.store.getView().quests.length === DAILY_QUEST_COUNT);
  }

  // ---------- Rastgele oyun: tutarlılık ----------
  {
    const s = setup();
    await s.store.load();
    let seed = 5;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const stats = Object.keys(STAT_KIND) as StatId[];
    let granted = 0, ok = true;
    for (let i = 0; i < 3000; i++) {
      const r = rnd();
      if (r < 0.6) s.store.record(stats[Math.floor(rnd() * stats.length)], Math.floor(rnd() * 400));
      else if (r < 0.75) s.store.claimQuest(s.store.getView().quests[Math.floor(rnd() * 3)].id);
      else if (r < 0.8) s.store.claimBonus();
      else if (r < 0.95) granted += s.store.claimAchievement(ACHIEVEMENTS[Math.floor(rnd() * ACHIEVEMENTS.length)].id);
      else { s.setClock(new Date(2026, 10, 1 + Math.floor(i / 100), 10)); s.store.refresh(); }
      const v = s.store.getView();
      if (v.claimable < 0 || v.quests.some((q) => q.progress > q.target)) ok = false;
    }
    // verilen toplam para = tüm ödüllerin toplamı; hiçbir ödül iki kez verilmemeli
    const questRewards = s.granted.length; // her grant bir ödül
    check(`Rastgele kullanım (3000 adım, ${questRewards} ödül): tutarlı`, ok && s.total() >= granted);
    // bir başarım basamağının ödülü en fazla bir kez verilmeli: toplam başarım ödülü, tüm basamak ödüllerinin toplamını aşamaz
    const maxAch = ACHIEVEMENTS.reduce((n, a) => n + a.tiers.reduce((m, t) => m + t.reward, 0), 0);
    check('Başarım ödülleri toplamı üst sınırı aşmaz (çift tahsilat yok)', granted <= maxAch);
  }

  console.log('\n' + passed + ' kontrol geçti.');
}
main();
