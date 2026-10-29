// Çalıştırma: npx tsx src/lib/volume.test.ts
import { clamp01, positionToValue, roundVolume, stepVolume } from './volume';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}

check('clamp: sınırların dışı kırpılır', clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.4) === 0.4);
check('clamp: geçersiz sayı 0 olur', clamp01(NaN) === 0 && clamp01(Infinity) === 0);
check('yuvarlama: %1 hassasiyet', roundVolume(0.3333) === 0.33 && roundVolume(0.999) === 1);
check('konum: ortası %50', positionToValue(100, 200) === 0.5);
check('konum: çubuğun dışı kırpılır', positionToValue(-20, 200) === 0 && positionToValue(260, 200) === 1);
check('konum: genişlik 0 ise çökmez', positionToValue(10, 0) === 0);
check('adım: +%10 / -%10', stepVolume(0.8, 0.1) === 0.9 && stepVolume(0.3, -0.1) === 0.2);
check('adım: kayan nokta hatası yok (0.1+0.2)', stepVolume(0.1, 0.2) === 0.3);
check('adım: sınırlarda kalır', stepVolume(0.95, 0.1) === 1 && stepVolume(0.05, -0.1) === 0);
console.log('\n' + passed + ' kontrol geçti.');
