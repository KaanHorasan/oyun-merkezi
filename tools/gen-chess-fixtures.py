#!/usr/bin/env python3
"""
Satranç motoru için BAĞIMSIZ doğrulama seti üretir (python-chess kütüphanesi ile).
Her pozisyon için: yasal hamle listesi, (bir kısmı için) her hamlenin sonucu FEN'i ve perft sayıları.
Motor testleri bu dosyayı okuyup kendi sonuçlarını karşılaştırır; testleri çalıştırmak için Python gerekmez.

Kullanım:  pip install chess  ve  python3 tools/gen-chess-fixtures.py
"""
import json
import os
import random
import chess

# Boyutlar ortam değişkenleriyle ayarlanabilir (varsayılanlar proje için kullanılanlardır)
N_POSITIONS = int(os.environ.get('N_POSITIONS', 900))
N_AFTER = int(os.environ.get('N_AFTER', 200))      # hamle sonrası FEN'i de kaydedilecek pozisyon sayısı
N_PERFT3 = int(os.environ.get('N_PERFT3', 40))     # perft 3 hesaplanacak pozisyon sayısı
OUT = os.environ.get('OUT', 'src/games/chess/engine/fixtures/random-positions.json')

random.seed(20261101)

ROOTS = [
    chess.STARTING_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',          # Kiwipete
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',                                    # pozisyon 3
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',              # pozisyon 4
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',                     # pozisyon 5
    'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',      # pozisyon 6
    'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',                                         # sadece rok
    'n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1',                                      # terfi yoğun
    '8/8/8/8/k2Pp2Q/8/8/3K4 b - d3 0 1',                                            # geçerken alma + çekilme
    '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',                                              # piyon oyun sonu
    '7k/8/8/KPp4r/8/8/8/8 w - c6 0 1',                                              # yatay çekilme: ep yasadışı
]

def random_position():
    b = chess.Board(random.choice(ROOTS))
    plies = random.randint(0, 110)
    for _ in range(plies):
        moves = list(b.legal_moves)
        if not moves:
            break
        # taş sayısı azalsın ve terfi/alış görülsün diye bunları daha sık seç
        special = [m for m in moves if b.is_capture(m) or m.promotion]
        pool = special if special and random.random() < 0.45 else moves
        b.push(random.choice(pool))
    return b

def fen_of(b):
    # ep karesi her çift adımdan sonra yazılsın (standart FEN); bizim motor da böyle yapar
    return b.fen(en_passant='fen')

def perft(b, d):
    if d == 0:
        return 1
    if d == 1:
        return b.legal_moves.count()
    n = 0
    for m in b.legal_moves:
        b.push(m)
        n += perft(b, d - 1)
        b.pop()
    return n

positions, seen = [], set()
terminal = 0
# ROOTS'un kendisi de dahil
candidates = [chess.Board(f) for f in ROOTS]
while len(positions) < N_POSITIONS:
    b = candidates.pop(0) if candidates else random_position()
    fen = fen_of(b)
    if fen in seen:
        continue
    seen.add(fen)
    moves = sorted(m.uci() for m in b.legal_moves)
    if not moves:
        terminal += 1
        if terminal > 25:
            continue
    entry = {'fen': fen, 'moves': moves}
    idx = len(positions)
    if idx < N_AFTER:
        after = {}
        for m in b.legal_moves:
            b.push(m)
            after[m.uci()] = fen_of(b)
            b.pop()
        entry['after'] = after
    entry['perft2'] = perft(b, 2)
    if idx < N_PERFT3:
        entry['perft3'] = perft(b, 3)
    positions.append(entry)

out = OUT
with open(out, 'w') as f:
    json.dump({'generator': 'tools/gen-chess-fixtures.py (python-chess)', 'positions': positions}, f, separators=(',', ':'))
print(f'{len(positions)} pozisyon yazıldı ({terminal} bitmiş oyun dahil) -> {out}')
