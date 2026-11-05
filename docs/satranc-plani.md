# Satranç: plan

Sıradaki oyun. Mevcut yapıya uyuyor: saf (arayüzsüz) oyun motoru + testler + ince arayüz, ortak cüzdan, görev ve başarımlar.

## 1. İlk sürüm (v1) kapsamı

- **Mod:** yalnızca **aynı cihazda iki kişi**. Bilgisayara karşı (yapay zeka) bilinçli olarak sonraya bırakıldı (karar: ilk sürümde yok).
  Online (uzaktan) da şimdilik dışarıda.
- **Tam kurallar:** rok (kısa/uzun), geçerken alma (en passant), terfi (vezir/kale/fil/at seçimi), şah, şah mat, pat,
  50 hamle kuralı, 3 kez tekrar, yetersiz materyal.
- **Arayüz:** modern tahta, seçili taş için yasal hamle noktaları, dokun-dokun ve sürükle-bırak, son hamle ve şah
  vurgusu, alınan taşlar, hamle listesi, geri al, tahtayı çevir, terfi seçici, otomatik kayıt ve "devam et".
- **Platform:** ses, titreşim, ayarlar, ortak 🪙 cüzdan, günlük görevler, başarımlar.

v1'de yok (sonraya): **yapay zeka**, online oyun, günlük bulmaca, tema mağazası.

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

## 4. Yapay zeka (ertelendi: ilk sürümde yok)

Aşağıdaki plan, yapay zeka eklenirken kullanılacak. Motor çekirdeği (aşama 1-2) zaten buna göre tasarlandı: hamle yapma/geri alma
hızlı, pozisyon karması (aşama 2) ve test altyapısı hazır olacak.

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
- **Para ödülü (🪙):** yapay zeka gelince galibiyet ödülü seviyeye göre verilecek (Çaylak az, Usta çok); beraberlik yarısı;
  teslim olmak ödül vermez. **Sömürüyü engellemek için:** ödül için en az bir hamle sayısı (ör. 10) gerekir ve günlük kazanç
  sınırı olur.
  **Yapay zeka yokken (v1):** iki kişilik modda kişi kendi kendine iki tarafı da oynayıp (iki hamlede mat gibi) para kazanabilir.
  Bu yüzden v1'de **oyun sonu para ödülü yok**. Görevler "N oyun bitir" gibi hafif, başarımlar tek seferlik ve düşük ödüllü
  ("İlk Mat" gibi) olur; asıl ödüller yapay zekayla birlikte açılır.
- **Para harcama yerleri:** ipucu, geri alma (ilk birkaçı ücretsiz olabilir), tema ve taş stilleri. (Mayın Tarlası'nda para
  onarıma gidiyor; satrançta kayıp ceza değil, o yüzden harcama alanı "kozmetik + yardım".)

## 7. Aşamalar

| Aşama | İçerik | Durum |
|---|---|---|
| 1 | Motor çekirdeği: tahta, FEN, hamle üretimi, **perft doğrulaması** | **Tamamlandı** |
| 2 | Kural durumu: mat/pat/beraberlik, SAN/PGN, tekrar tespiti | **Tamamlandı** |
| 3 | Arayüz v1 (aynı cihazda iki kişi): tahta, SVG taşlar, hamle, vurgular, terfi, geri al, kayıt | **Tamamlandı** (sürükle-bırak ve animasyon yok) |
| 4 | Görev ve başarımlar (hafif ödüller, yukarıdaki nota bak). Ses/titreşim ve ayarlar aşama 3'te eklendi | Sırada |
| 5 | Cila: sürükle-bırak, taş kayma animasyonu, temalar (PGN paylaş aşama 3'te eklendi) | Sonra |
| Sonra | **Yapay zeka** (4 seviye), ipucu, **günlük bulmaca**, online oyun | Ertelendi, ayrı planlanır |
| Ek | Satranç saati (hamle başı + toplam süre) ve ekran boyutuna göre ölçekleme | **Tamamlandı** |

### Aşama 1 sonucu

`src/games/chess/engine/` altında: `types.ts`, `board.ts` (0x88, yap/geri al, saldırı tespiti), `fen.ts` (okuma, doğrulama, yazma),
`moves.ts` (hamle üretimi, yasallık, perft). Doğrulama:
- Standart perft pozisyonlarının hepsi yayımlanmış sayılarla birebir tutuyor (başlangıçta 5. derinlik: 4.865.609).
- 900 rastgele pozisyonda yasal hamle listesi ve her hamlenin sonucu FEN'i, bağımsız bir kütüphaneyle (python-chess) birebir aynı.
- Yaklaşık 1 milyon hamlelik rastgele oyunda yap/geri al hiç bozulmuyor.

### Aşama 2 ve 3 sonucu

- **Aşama 2:** `status.ts`, `san.ts`, `pgn.ts`, `game.ts`. Yetersiz materyal tanımı python-chess ile birebir; 3 tekrar ve 50 hamle
  kuralları otomatik uygulanır (oyuncuya "talep et" sorulmaz, basitlik için). Notasyon 3.105 hamlede, her hamle sonrası durum
  bayrakları 70 oyunda bağımsız kütüphaneyle birebir aynı.
- **Aşama 3:** menü + iki oyunculu tahta, kendi çizdiğimiz SVG taşlar, yasal hamle noktaları, son hamle ve şah vurgusu, terfi
  seçici, alınan taşlar ve maddi üstünlük, hamle listesi, geri al, çevir, teslim, anlaşmalı beraberlik, PGN paylaş, otomatik kayıt,
  isteğe bağlı otomatik çevirme. Dokunma akışı (`controller.ts`) ve tahta eşlemesi (`geometry.ts`) testli.
- **Bilinen eksikler:** sürükle-bırak, taş animasyonu, satranç görevleri ve başarımları. Para ödülü bilerek yok.

### Süre (saat) ve ekran ölçekleme

- **Süre:** `clock.ts` (saf mantık, `clock.test.ts`). İki mod: *hamle başı* (10/15/30/60 sn) ve *toplam süre + artış*
  (3+2, 5+0, 10+0, 15+10). Süre menüden yeni oyun için seçilir (`chessTime` ayarı). Saat beyazın ilk hamlesinden sonra başlar,
  ilk hamleye artış eklenmez. Menü/ayarlar/onay penceresi/arka plan saati durdurur. Süre bitince `ChessGame.flag()`: rakip
  kazanır; rakibin mat edecek taşı yoksa (FIDE kuralı, `cannotEverMate`) berabere. Geri al hem hamleyi hem süreyi geri alır;
  süre bitişini geri alınca süresi biten tarafa kısa ek süre verilir. Saat kayda dahildir (devam edince kaldığı yerden).
- **Ölçekleme:** `layout.ts` (saf, `layout.test.ts`). Dikeyde tahta üstte; yatayda (genişlik >= 1,25 x yükseklik) tahta solda,
  yan panel sağda. Yazı/boşluk ölçeği 0,85 - 1,35; tahta 200 - 760 (dikey) / 900 (yatay) px arasında.
- **Sonraya:** özel süre (kendin gir), "süre bitince rastgele hamle" gibi seçenekler, PGN'e `TimeControl` etiketi.

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

1. İlk sürüm yalnızca aynı cihazda iki kişi (karar verildi). Yapay zeka sonra.
2. Yapay zeka gelince dört rakip seviyesi: Çaylak, Orta, Zor, Usta.
3. Kendi çizdiğimiz SVG taşlar; tema ve taş stilleri sonra 🪙 ile.
4. Online v1'de yok (saat sonradan eklendi).
5. Günlük bulmaca v2.
