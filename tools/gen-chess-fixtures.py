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
    if not moves:
        entry['term'] = 'mate' if b.is_checkmate() else 'stale'
    idx = len(positions)
    if idx < N_AFTER:
        after, san = {}, {}
        for m in b.legal_moves:
            san[m.uci()] = b.san(m)          # SAN, hamle yapılmadan ÖNCE alınır (belirsizlik giderme, +, #)
            b.push(m)
            after[m.uci()] = fen_of(b)
            b.pop()
        entry['after'] = after
        entry['san'] = san
    entry['perft2'] = perft(b, 2)
    if idx < N_PERFT3:
        entry['perft3'] = perft(b, 3)
    positions.append(entry)


# ---------- Tam oyunlar: her hamle sonrası durum bayrakları ve PGN hamle metni ----------
ENDGAME_ROOTS = [
    'k7/8/8/8/8/8/8/K6R w - - 0 1',        # K+R vs K
    'k7/8/8/8/8/8/8/K5Q1 w - - 0 1',       # K+Q vs K
    'k7/8/8/8/8/8/8/K5B1 w - - 0 1',       # K+B vs K (yetersiz materyal)
    'k7/8/8/8/8/8/8/K5N1 w - - 0 1',       # K+N vs K (yetersiz materyal)
    'k7/8/8/8/8/8/8/K3NN2 w - - 0 1',      # K+2N vs K (yetersiz DEĞİL)
    'k6b/8/8/8/8/8/8/K1B5 w - - 0 1',      # K+B vs K+B (aynı renk fil)
    'k6b/8/8/8/8/8/8/K5B1 w - - 0 1',      # K+B vs K+B (zıt renk fil)
    '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',     # piyon oyun sonu
    'k7/8/8/8/8/8/8/K5nN w - - 0 1',      # K+N vs K+N
]

# Başlangıç pozisyonlarının hepsi gerçekten geçerli olmalı (python-chess bunu kendiliğinden denetlemez)
for fen in ROOTS + ENDGAME_ROOTS:
    assert chess.Board(fen).is_valid(), 'geçersiz başlangıç pozisyonu: ' + fen

def tkey(b):
    """python-chess'in kullandığı pozisyon anahtarı (tekrar sayımı için)"""
    return b._transposition_key()

def flags_of(b):
    """Durum bayrakları tek sayıda: mat=1, pat=2, yetersiz materyal=4, 3 tekrar=8, 50 hamle=16"""
    return (
        (1 if b.is_checkmate() else 0)
        | (2 if b.is_stalemate() else 0)
        | (4 if b.is_insufficient_material() else 0)
        | (8 if b.is_repetition(3) else 0)
        | (16 if b.is_fifty_moves() else 0)   # >= 100 yarım hamle ve yasal hamle var
    )

def random_game(root_fen, max_plies):
    b = chess.Board(root_fen)
    start = b.fen(en_passant='fen')
    seen = {tkey(b): 1}
    moves, flags = [], [flags_of(b)]
    for _ in range(max_plies):
        legal = list(b.legal_moves)
        if not legal:
            break
        pool = legal
        # tekrar ve 50 hamle durumlarına ulaşmak için bazen daha önce görülmüş pozisyonlara dön
        if random.random() < 0.6:
            back = []
            for m in legal:
                b.push(m)
                if tkey(b) in seen:
                    back.append(m)
                b.pop()
            if back:
                pool = back
        elif random.random() < 0.3:
            special = [m for m in legal if b.is_capture(m) or m.promotion]
            if special:
                pool = special
        m = random.choice(pool)
        moves.append(m.uci())
        b.push(m)
        seen[tkey(b)] = seen.get(tkey(b), 0) + 1
        flags.append(flags_of(b))
    start_board = chess.Board(root_fen)
    movetext = start_board.variation_san([chess.Move.from_uci(u) for u in moves])
    return {'start': start, 'moves': moves, 'flags': flags, 'movetext': movetext}

N_GAMES = int(os.environ.get('N_GAMES', 70))
games = []
for i in range(N_GAMES):
    if i % 3 == 0:
        root = chess.STARTING_FEN
        plies = random.randint(30, 220)
    else:
        root = random.choice(ENDGAME_ROOTS)
        plies = random.randint(40, 260)
    games.append(random_game(root, plies))

out = OUT
with open(out, 'w') as f:
    json.dump({'generator': 'tools/gen-chess-fixtures.py (python-chess)', 'positions': positions, 'games': games}, f, separators=(',', ':'))
n_rep = sum(1 for g in games for fl in g['flags'] if fl & 8)
n_fifty = sum(1 for g in games for fl in g['flags'] if fl & 16)
n_insuf = sum(1 for g in games for fl in g['flags'] if fl & 4)
n_mate = sum(1 for g in games for fl in g['flags'] if fl & 1) + sum(1 for p in positions if p.get('term') == 'mate')
n_stale = sum(1 for g in games for fl in g['flags'] if fl & 2) + sum(1 for p in positions if p.get('term') == 'stale')
print(f'{len(positions)} pozisyon, {len(games)} oyun yazıldı ({terminal} bitmiş oyun dahil) -> {out}')
print(f'pozisyon ve oyunlardaki durumlar: mat {n_mate}, pat {n_stale}, yetersiz materyal {n_insuf}, 3 tekrar {n_rep}, 50 hamle {n_fifty}')
