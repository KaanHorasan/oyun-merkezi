// Çalıştırma: npx tsx src/lib/walletCore.test.ts
import { createWalletStore } from './walletCore';

let passed = 0;
function check(name: string, ok: boolean) {
  if (!ok) throw new Error('BAŞARISIZ: ' + name);
  passed++;
  console.log('✓ ' + name);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function memoryStorage(initial: number, loadDelay = 0) {
  const saves: number[] = [];
  return {
    saves,
    storage: {
      load: async () => {
        if (loadDelay) await wait(loadDelay);
        return initial;
      },
      save: (n: number) => {
        saves.push(n);
      },
    },
  };
}

async function main() {
  // Yükleme ve temel işlemler
  {
    const m = memoryStorage(50);
    const w = createWalletStore(m.storage, 5);
    check('Yüklemeden önce bakiye 0 ve yüklü değil', w.getBalance() === 0 && !w.isLoaded());
    await w.load();
    check('Kayıtlı bakiye yüklenir', w.getBalance() === 50 && w.isLoaded());
    w.add(25);
    check('Para eklenir', w.getBalance() === 75);
    check('Yeterli para varsa harcanır', w.spend(30) === true && w.getBalance() === 45);
    check('Yetersiz parada harcama reddedilir, bakiye değişmez', w.spend(100) === false && w.getBalance() === 45);
    check('Tam bakiye kadar harcanabilir, 0 olur', w.spend(45) === true && w.getBalance() === 0);
    check('Bakiye asla negatif olmaz', w.spend(1) === false && w.getBalance() === 0);
  }

  // Geçersiz değerler
  {
    const w = createWalletStore(memoryStorage(10).storage, 5);
    await w.load();
    w.add(-5);
    w.add(0);
    w.add(NaN);
    check('Negatif/0/NaN ekleme yok sayılır', w.getBalance() === 10);
    check('Negatif harcama reddedilir', w.spend(-3) === false && w.getBalance() === 10);
    w.add(2.9);
    check('Kesirli ekleme aşağı yuvarlanır', w.getBalance() === 12);
  }

  // Yükleme bitmeden kazanılan para kaybolmamalı
  {
    const m = memoryStorage(100, 20);
    const w = createWalletStore(m.storage, 5);
    const loading = w.load();
    w.add(7); // henüz yüklenmedi
    check('Yüklemeden önce harcama yapılamaz', w.spend(1) === false);
    await loading;
    check('Yüklemeden önce kazanılan para kayıtlı bakiyeye eklenir', w.getBalance() === 107);
    await wait(30);
    check('O para da kaydedilir', m.saves[m.saves.length - 1] === 107);
  }

  // Kayıt geciktirilir ve birleştirilir
  {
    const m = memoryStorage(0);
    const w = createWalletStore(m.storage, 15);
    await w.load();
    for (let i = 0; i < 20; i++) w.add(1);
    check('Peş peşe değişikliklerde hemen yazılmaz', m.saves.length === 0);
    await wait(40);
    check('Gecikmeden sonra tek seferde güncel bakiye yazılır', m.saves.length === 1 && m.saves[0] === 20);
    w.add(5);
    w.flush();
    check('flush bekleyen kaydı hemen yazar', m.saves[m.saves.length - 1] === 25);
  }

  // Abonelik
  {
    const w = createWalletStore(memoryStorage(0).storage, 5);
    let calls = 0;
    const unsub = w.subscribe(() => calls++);
    await w.load();
    w.add(3);
    w.spend(1);
    check('Değişikliklerde abonelere haber verilir', calls === 3);
    unsub();
    w.add(1);
    check('Abonelik iptal edilince haber verilmez', calls === 3);
  }

  // Bozuk kayıt değeri
  {
    const w = createWalletStore({ load: async () => NaN, save: () => {} }, 5);
    await w.load();
    check('Bozuk kayıtlı değer 0 sayılır', w.getBalance() === 0);
    const w2 = createWalletStore({ load: async () => -40, save: () => {} }, 5);
    await w2.load();
    check('Negatif kayıtlı değer 0 sayılır', w2.getBalance() === 0);
  }

  console.log('\n' + passed + ' kontrol geçti.');
}
main();
