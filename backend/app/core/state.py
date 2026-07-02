import math

# 0 = Lorong bebas (jalur navigasi).
# 1 = Tembok / Kotak ruangan (rintangan).

# Peta rumah sakit ukurannya luas, kita siapkan matriks 100x100.
GRID_WIDTH = 100
GRID_HEIGHT = 100
GRID_MAP = {}  # Dictionary: { "Lantai 1": [[0...]], "Lantai 2": [[0...]] }.

def get_grid_map(floor, building="Gedung Utama"):
    key = f"{building}_{floor}"
    if key not in GRID_MAP:
        GRID_MAP[key] = [[0 for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]
    return GRID_MAP[key]

# Mapping ID ruangan ke letak grid (X = Kolom, Y = Baris).
RUANGAN_GRID = {}

# Fungsi jarak Manhattan (jauh lebih ringan dari Euclidean untuk sistem grid).
def hitung_manhattan(x1, y1, x2, y2):
    return abs(x1 - x2) + abs(y1 - y2)