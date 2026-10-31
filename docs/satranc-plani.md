# Satranç: plan

Sıradaki oyun. Mevcut yapıya uyuyor: saf (arayüzsüz) oyun motoru + testler + ince arayüz, ortak cüzdan, görev ve başarımlar.

## 1. İlk sürüm (v1) kapsamı

- **Modlar:** bilgisayara karşı (4 seviye) ve aynı cihazda iki kişi. Online (uzaktan) şimdilik dışarıda.
- **Tam kurallar:** rok (kısa/uzun), geçerken alma (en passant), terfi (vezir/kale/fil/at seçimi), şah, şah mat, pat,
  50 hamle kuralı, 3 kez tekrar, yetersiz materyal.
- **Arayüz:** modern tahta, seçili taş için yasal hamle noktaları, dokun-dokun ve sürükle-bırak, son hamle ve şah
  vurgusu, alınan taşlar, hamle listesi, geri al, tahtayı çevir, terfi seçici, otomatik kayıt ve "devam et".
- **Platform:** ses, titreşim, ayarlar, ortak 🪙 cüzdan, günlük görevler, başarımlar.

v1'de yok (sonraya): satranç saati, online oyun, günlük bulmaca, tema mağazası.

## 2. Mimari

Mevcut desenin aynısı: önce saf mantık ve testleri, sonra arayüz.

```
src/games/chess/
├─ engine/
│  ├─ types.ts      taş, kare, hamle, pozisyon tipleri
│  ├─ board.ts      tahta (0x88 gösterimi), hamle yapma/geri alma
│  ├─ fen.ts        FEN okuma/yazma (başlangıç pozisyonu ve test pozisyonları)
│  ├─ moves.ts      hamle üretimi (sahte yasal + yasallık süzgeci)
│  ├─ status.ts     mat, pat, 50 hamle, 3 tekrar, yetersiz materyal
│  ├─ san.ts        cebirsel notasyon (Nf3, exd5, O-O, e8=Q+) ve PGN
│  ├─ zobrist.ts    pozisyon karması (tekrar tespiti, arama tablosu)
│  └─ ai/           değerlendirme, arama, seviyeler
├─ geometry.ts      tahta <-> ekran eşlemesi (çevirme dahil), testli
├─ persistence.ts   kayıtlı oyun, istatistikler
├─ pieces.tsx       kendi çizdiğimiz SVG taşlar
└─ ChessScreen.tsx  arayüz (menü + oyun)
```

**Tahta gösterimi:** 0x88. JavaScript'te 64 bitlik bitboard (BigInt) yavaştır; 0x88 hem hızlıdır hem kenar
kontrolleri basittir. Hamle yapma/geri alma (make/unmake) ile çalışılır, böylece arama hızlı olur.

## 3. Doğrulama stratejisi (en önemli kısım)

Satrançta hamle üretimi hatası sinsidir: nadir pozisyonlarda ortaya çıkar. Bunu **perft** ile kapatacağız:
bir pozisyondan belirli derinlikte üretilen toplam hamle dizisi sayısı, herkesçe bilinen sayılarla birebir tutmalı.

| Pozisyon | Derinlik 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Başlangıç | 20 | 400 | 8.902 | 197.281 | 4.865.609 |

Ayrıca standart "zor" test pozisyonları (Kiwipete, rok/geçerken alma/terfi tuzakları içeren pozisyonlar) aynı yöntemle
sınanır. Bunların hepsi herkesin kullandığı yayımlanmış değerlerdir; sayılar tutmuyorsa motor hatalıdır.

Diğer testler:
- FEN ve SAN/PGN gidiş-dönüş (yaz → oku → aynı pozisyon)
- Beraberlik kuralları (3 tekrar, 50 hamle, yetersiz materyal), pat ve mat örnekleri
- Rastgele yasal hamlelerle binlerce oyun: yasadışı durum çıkmamalı, hamle geri alınca karma (Zobrist) eski değere dönmeli
- Bilinen "1-2 hamlede mat" pozisyonlarında AI doğru hamleyi bulmalı
- AI'lar arası turnuva: seviyeler arasında beklenen güç sıralaması (zor > orta > çaylak)

## 4. Yapay zeka

Kendi motorumuz (Stockfish kullanmıyoruz: GPL lisansı, birkaç MB'lık WASM, mobilde yerel modül gerektirir; basit bir
oyun için fazla. İleride "Usta+" seviyesi olarak düşünülebilir).

- Negamax + alfa-beta budama, iteratif derinleşme ve süre bütçesi
- Hamle sıralama (önce alışlar, sonra iyi sessiz hamleler), sessizlik araması (quiescence)
- Değerlendirme: taş değerleri + kare tabloları (taşlar iyi karelerde dursun), şah güvenliği, piyon yapısı
- Pozisyon tablosu (Zobrist ile) ile tekrar hesaplamayı önleme
- Seviyeler: **Çaylak** (sığ arama + olasılıkla insani hatalar), **Orta**, **Zor**, **Usta** (en uzun süre)
- **Arayüzü dondurmamak:** arama küçük dilimlere bölünüp aralarda arayüze nefes aldırılır (her platformda çalışır).
  Gerekirse sonradan web'de Web Worker eklenir.
- Güç iddiası yok: seviyeleri kendi aralarında turnuvayla ölçeriz, gerçek bir Elo vaat etmeyiz.

## 5. Arayüz ve his

- **Taşlar:** Unicode satranç simgeleri (♔♕♖) cihazdan cihaza farklı çıkıyor (bazı sistemlerde emoji gibi). Bu yüzden
  **kendi çizdiğimiz sade, modern SVG taşlar** (lisans sorunu da yok). Tahta teması ve taş stili ileride 🪙 ile açılabilir.
- **Hamle girişi:** dokun-seç → noktalar → dokun-oyna; sürükle-bırak da desteklenir. Yanlışlıkla dokunmaya karşı
  "taşı seçince vurgula" yeterli, hamle onayı isteğe bağlı ayar.
- **Geri bildirim:** taş koyma, alma, şah, mat için ayrı ses ve titreşim. Bilgisayar düşünürken "düşünüyor..." göstergesi.
- **Ayarlar:** yasal hamle noktaları aç/kapa, otomatik vezir terfisi, tahta rengi, hamle onayı.

## 6. Platform entegrasyonu

Ortak ilerleme sistemine yeni istatistikler eklenir (`src/lib/progress/definitions.ts`):

- İstatistikler: `ch.games` (biten oyun), `ch.wins`, `ch.checkmates` (mat ederek kazanılan), `ch.winsHard` (Zor ve üstü),
  `ch.captures`, `ch.promotions`, `ch.winStreak` (en iyi seri, "max")
- Günlük görevler: "N oyun bitir", "Bilgisayara karşı N oyun kazan", "N taş al", "Bir piyonu terfi ettir"
- Başarımlar: İlk Galibiyet, Mat Ustası (1/10/50), Rokçu (ilk rok), Terfi (1/10), Zor Rakibi Yen, Galibiyet Serisi (3/5/10)
- **Para ödülü (🪙):** galibiyet, seviyeye göre (Çaylak az, Usta çok); beraberlik yarısı; teslim olmak ödül vermez.
  **Sömürüyü engellemek için:** ödül için en az bir hamle sayısı (ör. 10) gerekir ve günlük kazanç sınırı olur
  (aksi halde Çaylak'a karşı peş peşe hızlı galibiyetle para basılır).
- **Para harcama yerleri:** ipucu, geri alma (ilk birkaçı ücretsiz olabilir), tema ve taş stilleri. (Mayın Tarlası'nda para
  onarıma gidiyor; satrançta kayıp ceza değil, o yüzden harcama alanı "kozmetik + yardım".)

## 7. Aşamalar

| Aşama | İçerik | Büyüklük |
|---|---|---|
| 1 | Motor çekirdeği: tahta, FEN, hamle üretimi, **perft doğrulaması** | 1 oturum |
| 2 | Kural durumu: mat/pat/beraberlik, SAN/PGN, tekrar tespiti | 1 oturum |
| 3 | Arayüz v1 (aynı cihazda iki kişi): tahta, SVG taşlar, hamle, vurgular, terfi, geri al, kayıt | 1-2 oturum |
| 4 | Yapay zeka: değerlendirme, arama, 4 seviye, dilimli çalışma, güç testleri | 1-2 oturum |
| 5 | Platform: ses/titreşim, ayarlar, para ödülü, görev ve başarımlar | 1 oturum |
| 6 | Cila: taş kayma animasyonu, temalar, ipucu, PGN paylaş | 1 oturum |
| Sonra | Satranç saati, **günlük bulmaca**, online oyun | ayrı planlanır |

**Günlük bulmaca** bu platforma çok uyar: "bugünün bulmacası" günlük görev gibi çalışır. Veri için Lichess'in açık (CC0)
bulmaca veritabanından küçük bir seçki alınabilir. v2 için öneriyorum.

**Online (arkadaşla uzaktan)** ayrı ve büyük bir iş: sunucu (Firebase/Supabase gibi), eşleştirme, gerçek zamanlı hamle
senkronu, bağlantı kopması, hile önleme. Şimdilik kapsam dışı; motor saf olduğu için sonradan eklemek mümkün.

## 8. Riskler

- **Hamle üretimi hataları:** perft ile kapatılır, ilk aşamada bitirmeden arayüze geçilmez.
- **AI hızı (özellikle eski telefonlarda):** süre bütçeli ve dilimli arama; seviyeye göre derinlik sınırı.
- **Dokunma doğruluğu:** büyük hedefler, seçili taşın vurgulanması, isteğe bağlı hamle onayı.
- **Kapsam şişmesi:** saat, online, bulmaca v1'e girmiyor.

## 9. Başlamadan önce kararlar (önerilerim)

1. İlk sürüm hem bilgisayara karşı hem aynı cihazda iki kişi (evet).
2. Dört rakip seviyesi: Çaylak, Orta, Zor, Usta.
3. Kendi çizdiğimiz SVG taşlar; tema ve taş stilleri sonra 🪙 ile.
4. Saat ve online v1'de yok.
5. Günlük bulmaca v2.
