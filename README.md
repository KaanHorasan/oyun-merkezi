# Oyun Merkezi

Birden fazla mobil oyunu tek uygulamada toplayan platform (Expo + React Native + TypeScript).
Telefonda Expo Go ile, tarayıcıda ise GitHub Pages üzerinden çalışır.

## Yerelde çalıştırma

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

## Yapı

- `src/app/` ekranlar (Expo Router): `index.tsx` hub, `game/[id].tsx` seçilen oyun
- `src/games/types.ts` ortak oyun arayüzü
- `src/games/registry.ts` tüm oyunların listesi (yeni oyun = yeni klasör + buraya bir kayıt)
- `src/games/minesweeper/`, `src/games/tetris/` oyunlar (şu an yer tutucu)
- `.github/workflows/deploy.yml` push'ta otomatik web yayını

## Yol haritası

1. [x] İskelet ve hub
2. [x] Web yayını altyapısı
3. [ ] Mayın Tarlası
4. [ ] Tetris
5. [ ] Cilalama (ses, ayarlar)
6. [ ] Online özellikler (opsiyonel)
