# Oyun Merkezi

Birden fazla mobil oyunu tek uygulamada toplayan platform (Expo + React Native + TypeScript).
Telefonda Expo Go ile, tarayıcıda ise GitHub Pages üzerinden çalışır.

## Yerelde çalıştırma

Yeni paket eklendiğinde (ses, titreşim, kayıt) önce `npm install` çalıştır.

```bash
npm install
npx expo start          # telefon: Expo Go ile QR kodu okut
npx expo start --web    # tarayıcı
```

## Web'e yayınlama (GitHub Pages)

1. GitHub'da **oyun-merkezi** adında yeni bir repo aç (public olması Pages'in ücretsiz çalışması için en kolay yol).
2. Proje klasöründe:

   ```bash
   git init
   git add .
   git commit -m "ilk sürüm"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADIN/oyun-merkezi.git
   git push -u origin main
   ```

3. GitHub'da repo → **Settings → Pages → Build and deployment → Source: GitHub Actions** seç.
4. **Actions** sekmesinde "Web'e yayınla" iş akışı çalışır. Bitince site şu adreste olur:
   `https://KULLANICI_ADIN.github.io/oyun-merkezi/`

Bundan sonra her `git push` siteyi otomatik günceller.

### Repo adını farklı seçersen

`app.json` içindeki şu satırı repo adınla aynı yap:

```json
"experiments": { "baseUrl": "/repo-adin" }
```

(Özel alan adı veya `kullanici.github.io` adlı özel bir repo kullanırsan `baseUrl` satırını sil.)

## Sonsuz Mayın Tarlası

Her yöne sonsuza uzanan bir mayın tarlası. **Oyun bitmez**: mayına basarsan ya da yanlış bayrak koyarsan sadece o bölüm (16×16 kare) patlar ve kilitlenir.
Bölümü oyun içi parayla onarırsın. Skor, açtığın güvenli kare sayısıdır.

- **Kontroller:** dokun = aç · basılı tut (web'de sağ tık) = bayrak · sürükle = haritada gez ·
  iki parmak (web'de tekerlek) = yakınlaştır · 🚩/⛏️ düğmesi = dokunmayı bayrak moduna çevirir ·
  bir sayının çevresine o kadar bayrak koyup sayıya dokun = kalan komşuları aç.
- **Bayrak bir iddiadır:** bayrak, "burada mayın var" demektir. Mayın olan yere güvenle konur; mayın olmayan yere koyarsan
  o bölüm patlar (mayına basmakla aynı sonuç). Bayrağı kaldırmak serbesttir. Oyun başlamadan (ilk açılıştan önce) bayrak konamaz.
- **Patlayan bölüm:** enkaza döner, içinde hamle yapılamaz, zincirleme açılma içine girmez. Üstündeki
  **🔧 Onar** düğmesiyle 🪙 harcayıp geri açarsın; bölüm eski haline döner; mayına basıldıysa o mayın etkisizleşir (bayrak olur), yanlış bayrak yüzünden patladıysa kare olduğu gibi kapalı kalır.
- **Para (🪙):** her 5 güvenli kare = 1 🪙. Cüzdan **tüm oyunlar için ortaktır** ve cihazda saklanır
  (`src/lib/wallet.ts`). Onarım maliyeti = 20 + bölümde açık kare sayısının dörtte biri.
- **Zorluk:** Kolay %12, Normal %16, Zor %20 mayın. Her zorluk için ayrı rekor tutulur.
- **İlk dokunuş her zaman güvenli:** çevresindeki 5x5 alanda mayın olmaz, açılış zincirleme genişler.
- **Kayıt:** oyun otomatik kaydedilir; menüden "Devam et" ile kaldığın yerden sürer.

Ekonomiyi ayarlamak için `src/games/minesweeper/world.ts` başındaki sabitler:
`CELLS_PER_COIN` (kaç kareye 1 🪙), `REPAIR_BASE_COST` (taban onarım), `REPAIR_COST_PER_REVEALED` (açık kare başına ek maliyet).

Nasıl çalışır (geliştirici notu):
- Dünya 16x16'lık **bölümlere (chunk)** ayrılır. Mayınlar saklanmaz; bir karenin mayın olup olmadığı
  (tohum, x, y) üçlüsünden karma ile hesaplanır. Bellekte ve kayıtta yalnızca açılan/bayraklanan kareler ile
  patlayan bölümler tutulur, bu yüzden dünya gerçekten sınırsızdır.
- Ekranda yalnızca görünen kareler çizilir; kaydırırken sadece kapsayıcı kayar.
- `world.ts` oyun mantığı (bölüm kilidi, onarım, para hesabı), `geometry.ts` kamera/dokunma matematiği,
  `persistence.ts` kayıt, `MinesweeperScreen.tsx` arayüz. Eski (oyunun bittiği sürümden kalma) kayıtlar da yüklenir.
- Sıradaki fikirler: bölüm tamamlama ödülü, günlük seri (streak) bonusu, hub'da üst bilgi/ayarlar.

## Günlük görevler ve başarımlar

Ana ekrandaki **🎯 Görevler** düğmesinden açılır (alınacak ödül varsa kırmızı rozet gösterir). Tüm oyunlar için ortaktır;
ödüller ortak 🪙 cüzdanına eklenir.

- **Günlük görevler:** her gün 3 görev (1 Tetris, 1 Mayın Tarlası, 1 serbest). Görevler tarihten türetilir, yani aynı gün
  herkes için aynıdır. Her gece yarısı (cihazın yerel saati) yenilenir; yalnızca o gün yaptıkların sayılır.
  Üçünü de bitirirsen **+50 🪙 bonus**. Ödülü "Ödülü al" ile sen alırsın.
- **Başarımlar:** tüm zamanların istatistiklerine göre basamaklı (I, II, III...) ödüller: Kaşif, Bayrakçı, Acı Tecrübe,
  Tamirci, Büyük Açılış, Satır Avcısı, Tetris Ustası, Yüksek Skor, Seviye Atlayıcı, Oyun Meraklısı, Günlük Düzenli.
  Atlanan basamaklar birlikte alınabilir.
- **Bildirim:** görev tamamlanınca / başarım açılınca ekranın üstünde kısa bir kart çıkar; dokununca Görevler açılır.
- Mayın Tarlası'nda doğru bayrak **kalıcıdır** (kaldırılamaz). Aksi halde aynı bayrağı koyup kaldırarak görev/başarım şişirilebilirdi.

Yeni görev veya başarım eklemek için yalnızca `src/lib/progress/definitions.ts` düzenlenir:
- `QUEST_TEMPLATES`: görev şablonları (kolaydan zora hedefler ve ödüller), `BONUS_REWARD`: bonus
- `ACHIEVEMENTS`: başarımlar ve basamakları
- Yeni bir istatistik için `StatId` ve `STAT_KIND` ('sum': toplanır, 'max': en yükseği tutulur) eklenir, sonra oyundan
  `record('istatistik', değer)` çağrılır (`src/lib/progress/progress.ts`).

Nasıl çalışır: oyunlar yalnızca istatistik bildirir; görev/başarım hesabı, gün sıfırlama ve ödül verme `engine.ts` içindedir
(React ve depolamadan bağımsız, testli). Tetris'te kilitlenen parça ve 4'lü temizleme gibi sayılar oyunun içinde kesin sayaçlarla
tutulur, ekran bunların farkını bildirir.

## Satranç

Aynı cihazda iki kişi, tam kurallarla. Ana ekrandaki **♟️ Satranç** kartından açılır. Plan ve kararlar: `docs/satranc-plani.md`.

- **Oynanış:** taşa dokun, gidebileceği kareler noktalarla görünür, sonra gideceği kareye dokun. Piyon son sıraya gelince
  taşı seçersin. Rok, geçerken alma, terfi, şah mat, pat tam uygulanır.
- **Araçlar:** Geri al, Çevir (tahtayı döndür), Teslim, Beraberlik; hamle listesi; alınan taşlar ve maddi üstünlük.
  Oyun bitince Yeni oyun, Geri al ve PGN paylaş. Oyun otomatik kaydedilir, menüden "Devam et" ile sürer.
- **Süre (satranç saati):** menüden yeni oyun için seçilir. *Hamle başı* (10/15/30/60 sn: her hamle için sabit süre, sıran gelince
  baştan başlar) ya da *toplam süre* (3 dk + 2 sn, 5 dk, 10 dk, 15 dk + 10 sn: her oyuncunun bir havuzu var, hamlede artış eklenir).
  Saat beyazın ilk hamlesinden sonra başlar; menüye, ayarlara ya da arka plana geçince durur. Süresi biten kaybeder; rakibinin
  mat edecek taşı yoksa berabere. Süre bitişi ve hamleler geri alınabilir, saat de geri döner. Seçim ve saat kayda dahildir.
- **Ekran ölçekleme:** dikey ekranda tahta üstte, yatay ekranda (telefon yan, tablet, bilgisayar) tahta solda ve sağda yan panel.
  Tahta, yazılar ve boşluklar ekran boyutuna göre büyür/küçülür (`layout.ts`, testli).
- **Ayarlar (⚙):** yasal hamle noktaları aç/kapa, tahtayı her hamlede otomatik çevir (karşılıklı oynarken), son saniye uyarısı
  (son 5 saniyede tık sesi/titreşim), ses, titreşim.
- **Beraberlikler otomatiktir:** aynı pozisyon 3 kez, 50 hamlede piyon hamlesi/alış yok, ya da mat için yeterli taş yok.
- **Bilerek v1'de yok:** yapay zeka, sürükle-bırak, taş animasyonu, para ödülü (iki kişilik modda kendi kendine
  oynayıp para kazanılmasın diye), satranç görevleri/başarımları.

Yapı (`src/games/chess/`):
- `engine/`: saf (arayüzsüz) motor. `board.ts` tahta (0x88, yap/geri al), `fen.ts`, `moves.ts` (hamle üretimi, perft),
  `status.ts` (yetersiz materyal, pozisyon anahtarı), `san.ts` (notasyon), `pgn.ts`, `game.ts` (`ChessGame`: hamle geçmişi,
  durum, geri al, teslim, kayıt).
- `clock.ts` satranç saati (saf mantık, testli), `layout.ts` ekran boyutuna göre yerleşim (saf, testli).
- `controller.ts` dokunma akışı, `geometry.ts` tahta-ekran eşlemesi, `summary.ts` alınan taşlar, `ChessBoard.tsx` tahta
  (tek bir SVG), `pieces.tsx` + `pieceShapes.ts` kendi çizdiğimiz taşlar, `ChessScreen.tsx` ekran, `persistence.ts` kayıt.

Doğrulama:
- **Perft:** yayımlanmış sayılarla birebir (`perft.test.ts`).
- **Bağımsız kütüphane (python-chess) karşılaştırması:** 900 pozisyonda yasal hamleler, hamle sonuçları, notasyon, mat/pat;
  70 oyunda her hamle sonrası beraberlik bayrakları ve PGN metni (`engine.test.ts`, `game.test.ts`,
  `engine/fixtures/random-positions.json`).
- Doğrulama setini yeniden üretmek için (testler için Python gerekmez): `pip install chess` ve
  `python3 tools/gen-chess-fixtures.py`.

## Müzik

Tetris'te arka planda **Korobeiniki** melodisi çalar. ⚙ Ayarlar'da müzik ve ses efektleri için ayrı açma/kapama anahtarı
ve ayrı **ses düzeyi çubuğu** (sürükle veya − / + düğmeleri) vardır. Ayarlar açıkken müzik çalmaya devam eder, böylece
ses düzeyini ayarlarken duyabilirsin; efekt çubuğunu bırakınca örnek bir ses çalar. Seçimler cihazda saklanır.
Oyun çalışırken çalar, duraklatınca / oyun bitince durur, yeni oyunda baştan başlar.

- Korobeiniki, 1861 tarihli bir Rus halk şarkısıdır ve melodisi telif dışıdır. Resmî Tetris oyun kaydı veya
  resmî Game Boy düzenlemesi **kullanılmadı**; melodi ve bas çizgisi `tools/make-music.py` içinde notalarla
  yazılıp kodla sentezlenir. (Kulağa tanıdık gelir ama birebir resmî kayıt değildir.)
- Notaları veya temposu değiştirmek için `tools/make-music.py` dosyasını düzenleyip `python3 tools/make-music.py`
  çalıştırın (numpy ve ffmpeg gerekir); `assets/sounds/music-tetris.wav` yeniden üretilir.
- Tarayıcılar sesi ilk dokunuştan önce engelleyebilir; ilk dokunuş/tuşta müzik başlar.

## Uygulama olarak yükleme (PWA)

Site, telefona uygulama gibi kurulabilir. Ana sayfadaki **📲 Uygulamayı yükle** butonu:

- **Android (Chrome/Edge):** tarayıcının yükleme penceresini açar; onaylayınca ana ekrana ikon eklenir.
- **iPhone/iPad (Safari):** Apple tarayıcıdan yüklemeye izin vermediği için adımları gösterir
  (Paylaş ⬆︎ → Ana Ekrana Ekle).
- Zaten kuruluysa (uygulama olarak açıldıysa) buton görünmez.

Kurulan uygulama tam ekran açılır ve ilk açılıştan sonra **internetsiz de çalışır**
(tüm dosyalar önbelleğe alınır). Yeni sürüm yayınlanınca bir sonraki açılışta kendiliğinden güncellenir.

Teknik notlar:
- `public/manifest.json`, `public/icons/`, `public/apple-touch-icon.png`: uygulama adı, renkleri ve ikonları
- `scripts/post-build.js` + `scripts/sw.template.js`: derlemeden sonra servis çalışanını (`sw.js`) üretir ve
  HTML'e manifest/ikon etiketlerini ekler. Bu yüzden web derlemesi için `npm run build:web` kullanılır
  (GitHub iş akışı bunu zaten yapar).
- Bu Expo sürümünde özel bir `src/app/+html.tsx` eklemek stil dosyasını çıktıdan düşürüyor, bu yüzden eklemeyin.
- Geliştirme modunda (`expo start`) servis çalışanı kapalıdır.

## Testler

Oyun mantığını (arayüzsüz) denemek için:

```bash
npx tsx src/games/tetris/logic.test.ts
npx tsx src/lib/volume.test.ts
npx tsx src/lib/walletCore.test.ts
npx tsx src/lib/progress/engine.test.ts
npx tsx src/games/minesweeper/world.test.ts
npx tsx src/games/minesweeper/geometry.test.ts
npx tsx src/games/chess/ui.test.ts                 # arayüz mantığı
npx tsx src/games/chess/engine/engine.test.ts      # motor (hızlı)
npx tsx src/games/chess/engine/game.test.ts        # durum kuralları, notasyon, PGN, oyun sınıfı
npx tsx src/games/chess/engine/perft.test.ts       # standart perft sayıları (yaklaşık 25 sn)
```

## Tetris kontrolleri

**Dokunmatik (telefon ve web):**
- Sağa/sola sürükle: parçayı kaydır
- Aşağı sürükle: yumuşak düşür
- Kısa dokun: döndür
- Aşağı hızlı fırlat: anında düşür
- Yukarı hızlı fırlat: parçayı sakla (Tut)
- İstersen ekran butonları da var; ⚙ Ayarlar'dan kapatılabilir

**Web klavyesi:** ← → ↓ hareket, ↑ veya X döndür, Z ters döndür, Boşluk hızlı düşür, C tut, P duraklat

**Diğer:** parça yere değince kısa kilit gecikmesi (kaydırmaya zaman verir), hayalet parça, ses, titreşim,
rekor kaydı (cihazda saklanır), uygulama arka plana geçince otomatik duraklatma.

## Yapı

- `src/app/` ekranlar (Expo Router): `index.tsx` hub, `game/[id].tsx` seçilen oyun
- `src/games/types.ts` ortak oyun arayüzü
- `src/games/registry.ts` tüm oyunların listesi (yeni oyun = yeni klasör + buraya bir kayıt)
- `src/lib/progress/` günlük görevler ve başarımlar (`definitions.ts` tanımlar, `engine.ts` motor, `progress.ts` oyunlara açılan `record`)
- `src/components/QuestsScreen.tsx`, `NoticeHost.tsx` Görevler ekranı ve bildirim kartı
- `src/lib/` ortak altyapı: `storage.ts` (kalıcı kayıt), `settings.ts` (ses/titreşim ayarları), `feedback.ts` (ses + titreşim), `wallet.ts` + `walletCore.ts` (ortak oyun içi para)
- `src/components/SettingsPanel.tsx` ortak ayarlar paneli (oyuna özel satırlar: hayalet parça, butonlar, satranç seçenekleri), `VolumeSlider.tsx` ses düzeyi çubuğu
- `assets/sounds/` ses efektleri ve müzik (kodla üretilmiş `.wav` dosyaları)
- `tools/make-music.py` Tetris müziği üreticisi
- `src/games/tetris/` Tetris: `logic.ts` (saf oyun mantığı), `logic.test.ts` (testler), `TetrisScreen.tsx` (arayüz)
- `src/games/minesweeper/` Sonsuz Mayın Tarlası: `world.ts` (mantık), `geometry.ts` (kamera), `persistence.ts` (kayıt), `MinesweeperScreen.tsx` (arayüz)
- `.github/workflows/deploy.yml` push'ta otomatik web yayını (`npm run build:web`)

## Yol haritası

1. [x] İskelet ve hub
2. [x] Web yayını altyapısı
3. [x] Tetris (hareketler, ses, titreşim, rekor, ayarlar, kilit gecikmesi)
   - [x] Uygulama olarak yükleme (PWA) ve internetsiz çalışma
   - [x] Arka plan müziği (Korobeiniki)
4. [x] Sonsuz Mayın Tarlası (ilk sürüm: sonsuz dünya, bölümler, kayıt, rekor)
   - [x] Mayına basınca yalnızca o bölüm patlar; onarım oyun içi parayla (ortak cüzdan)
   - [x] Günlük görevler ve başarımlar (ortak cüzdana ödül)
5. [ ] Satranç (plan: `docs/satranc-plani.md`)
   - [x] Aşama 1: motor çekirdeği (tahta, FEN, hamle üretimi, perft doğrulaması)
   - [x] Aşama 2: mat/pat/beraberlik, notasyon (SAN), PGN
   - [x] Aşama 3: arayüz (aynı cihazda iki kişi), hub kartı
   - [ ] Aşama 4: satranç görevleri ve başarımları (hafif ödüllü)
   - [ ] Aşama 5: cila (sürükle-bırak, taş animasyonu, temalar)
5. [ ] Hub cilası (ikonlar, ana ekran ayarları, uygulama adı/ikonu)
6. [ ] Online özellikler (opsiyonel)
