import heapq
from waypoint_graph import get_grid_map, GRID_WIDTH, GRID_HEIGHT, RUANGAN_GRID, hitung_manhattan

def _a_star_single_floor(start_node, target_node):
    floor = start_node.get("floor", "Lantai 1")
    grid = get_grid_map(floor)
    
    target_coords = set()
    if "door_coords" in target_node and target_node["door_coords"]:
        for c in target_node["door_coords"]:
            target_coords.add(c)
    else:
        for dy in range(target_node.get("h", 1)):
            for dx in range(target_node.get("w", 1)):
                target_coords.add((target_node["x"] + dx, target_node["y"] + dy))

    open_set = []
    came_from = {}
    g_score = {}
    f_score = {}
    
    for dy in range(start_node.get("h", 1)):
        for dx in range(start_node.get("w", 1)):
            sx = start_node["x"] + dx
            sy = start_node["y"] + dy
            
            g_score[(sx, sy)] = 0
            min_h = float('inf')
            for tx, ty in target_coords:
                h = hitung_manhattan(sx, sy, tx, ty)
                if h < min_h: min_h = h
            f_score[(sx, sy)] = min_h
            heapq.heappush(open_set, (min_h, (sx, sy)))
            
    while open_set:
        current_f, current = heapq.heappop(open_set)
        
        if current in target_coords:
            jalur = []
            curr = current
            while curr in came_from:
                jalur.append({"x": curr[0], "y": curr[1], "floor": floor})
                curr = came_from[curr]
            jalur.append({"x": curr[0], "y": curr[1], "floor": floor})
            jalur.reverse()
            return jalur
            
        cx, cy = current
        tetangga_list = [(cx, cy-1), (cx, cy+1), (cx-1, cy), (cx+1, cy)]
        
        for nx, ny in tetangga_list:
            if 0 <= nx < GRID_WIDTH and 0 <= ny < GRID_HEIGHT:
                if grid[ny][nx] == 0 or (nx, ny) in target_coords:
                    tentative_g = g_score[current] + 1 
                    if (nx, ny) not in g_score or tentative_g < g_score[(nx, ny)]:
                        came_from[(nx, ny)] = current
                        g_score[(nx, ny)] = tentative_g
                        min_h = float('inf')
                        for tx, ty in target_coords:
                            h = hitung_manhattan(nx, ny, tx, ty)
                            if h < min_h: min_h = h
                        f_score[(nx, ny)] = tentative_g + min_h
                        heapq.heappush(open_set, (f_score[(nx, ny)], (nx, ny)))
                        
    return None

def find_nearest_lift(start_node):
    floor = start_node.get("floor", "Lantai 1")
    lifts = []
    for r_id, room in RUANGAN_GRID.items():
        if room.get("floor", "Lantai 1") == floor:
            name = room.get("name", "").lower()
            if "lift" in name and "tangga" not in name:
                lifts.append(room)
                
    if not lifts:
        return None
        
    sx = start_node["x"]
    sy = start_node["y"]
    lifts.sort(key=lambda r: hitung_manhattan(sx, sy, r["x"], r["y"]))
    return lifts[0]

def cari_rute_grid(start_id, target_id):
    if start_id not in RUANGAN_GRID or target_id not in RUANGAN_GRID:
        return {"status": "error", "pesan": "Titik awal atau tujuan tidak valid di peta."}

    start_node = RUANGAN_GRID[start_id]
    target_node = RUANGAN_GRID[target_id]
    
    start_floor = start_node.get("floor", "Lantai 1")
    target_floor = target_node.get("floor", "Lantai 1")
    
    if start_floor == target_floor:
        jalur = _a_star_single_floor(start_node, target_node)
        if not jalur:
            return {"status": "error", "pesan": "Rute buntu. Tidak ada jalan menuju tujuan."}
            
        nav_text = generate_navigation_text(jalur, start_id, target_id)
        return {
            "status": "success",
            "jalur_grid": jalur,
            "teks_navigasi": nav_text
        }
    else:
        lift_start = find_nearest_lift(start_node)
        lift_target = find_nearest_lift(target_node)
        
        if not lift_start:
            return {"status": "error", "pesan": f"Tidak ditemukan Lift/Tangga di {start_floor}."}
        if not lift_target:
            return {"status": "error", "pesan": f"Tidak ditemukan Lift/Tangga di {target_floor}."}
            
        jalur_1 = _a_star_single_floor(start_node, lift_start)
        if not jalur_1:
            return {"status": "error", "pesan": f"Rute buntu menuju lift di {start_floor}."}
            
        jalur_2 = _a_star_single_floor(lift_target, target_node)
        if not jalur_2:
            return {"status": "error", "pesan": f"Rute buntu dari lift di {target_floor}."}
            
        jalur_gabungan = jalur_1 + jalur_2
        nav_text = generate_navigation_text(jalur_gabungan, start_id, target_id)
        
        return {
            "status": "success",
            "jalur_grid": jalur_gabungan,
            "teks_navigasi": nav_text
        }

def get_adjacent_room(x, y, exclude_ids=None):
    if exclude_ids is None:
        exclude_ids = set()
    
    for r_id, room in RUANGAN_GRID.items():
        if r_id in exclude_ids:
            continue
            
        rx = room["x"]
        ry = room["y"]
        rw = room.get("w", 1)
        rh = room.get("h", 1)
        
        # Cek apakah (x, y) berada dalam bounding box ruangan diperbesar 1 petak
        if (rx - 1 <= x <= rx + rw) and (ry - 1 <= y <= ry + rh):
            # Hindari Kiosk (kiosk_id biasa berawalan K) atau kita filter dari nama
            if room.get("name") and "Kiosk" not in room.get("name", ""):
                return room["name"]
    return None

def generate_navigation_text(path, start_id, target_id):
    if not path or len(path) < 2:
        return [{"teks": "Anda sudah sampai di tujuan.", "index_akhir": len(path) - 1 if path else 0, "floor": path[0]["floor"] if path else "Lantai 1"}]

    start_name = RUANGAN_GRID.get(start_id, {}).get("name", "Kiosk")
    target_name = RUANGAN_GRID.get(target_id, {}).get("name", "Tujuan")
    langkah = []
    current_dir = None
    is_after_lift = False

    def get_direction(p1, p2):
        if p2["x"] > p1["x"]: return 'Kanan'
        if p2["x"] < p1["x"]: return 'Kiri'
        if p2["y"] > p1["y"]: return 'Bawah'
        if p2["y"] < p1["y"]: return 'Atas'
        return None

    def get_turn(prev_dir, next_dir):
        if prev_dir == next_dir: return None
        turns = {
            'Atas': {'Kanan': 'Kanan', 'Kiri': 'Kiri'},
            'Bawah': {'Kanan': 'Kiri', 'Kiri': 'Kanan'},
            'Kanan': {'Atas': 'Kiri', 'Bawah': 'Kanan'},
            'Kiri': {'Atas': 'Kanan', 'Bawah': 'Kiri'}
        }
        return turns.get(prev_dir, {}).get(next_dir, 'Berbalik Arah')

    exclude_ids = {start_id, target_id}

    for i in range(len(path) - 1):
        p1 = path[i]
        p2 = path[i + 1]
        
        # Pindah Lantai!
        if p1["floor"] != p2["floor"]:
            langkah.append({
                "teks": f"Gunakan Lift/Tangga untuk menuju ke {p2['floor']}.",
                "index_akhir": i,
                "floor": p1["floor"] # Masih di lantai sebelumnya
            })
            current_dir = None # Arah reset ketika keluar lift
            is_after_lift = True
            continue
            
        dir = get_direction(p1, p2)

        if not current_dir:
            current_dir = dir
        elif current_dir != dir:
            turn = get_turn(current_dir, dir)
            adj_room = get_adjacent_room(p1["x"], p1["y"], exclude_ids)
            
            if len(langkah) == 0:
                prefix = f"Dari {start_name}, berjalanlah ke arah {current_dir}"
            elif is_after_lift:
                prefix = f"Dari Lift di {p1['floor']}, berjalanlah ke arah {current_dir}"
                is_after_lift = False
            else:
                prefix = f"Setelah belok, lurus terus"
                
            if adj_room:
                teks = f"{prefix} sampai ketemu {adj_room}, lalu bersiap belok {turn}."
            else:
                teks = f"{prefix} sampai persimpangan, lalu bersiap belok {turn}."
            
            langkah.append({
                "teks": teks,
                "index_akhir": i,
                "floor": p1["floor"]
            })
            
            current_dir = dir

    if len(langkah) == 0:
        teks_akhir = f"Dari {start_name}, berjalanlah ke arah {current_dir} dan Anda akan sampai di {target_name}."
    elif is_after_lift:
        teks_akhir = f"Dari Lift di {path[-1]['floor']}, berjalanlah ke arah {current_dir} dan Anda akan sampai di {target_name}."
    else:
        teks_akhir = f"Setelah belok, lurus terus dan Anda akan sampai di {target_name}."

    langkah.append({
        "teks": teks_akhir,
        "index_akhir": len(path) - 1,
        "floor": path[-1]["floor"]
    })

    return langkah


# --- TESTING LOKAL ---
if __name__ == "__main__":
    print("\n=== MENGUJI A* GRID MODE ===")
    hasil = cari_rute_grid("kiosk_lobi", "igd")
    if hasil["status"] == "success":
        print(f"Rute ditemukan! Melewati {len(hasil['jalur_grid'])} petak:")
        for petak in hasil['jalur_grid']:
            print(f" -> [X: {petak['x']}, Y: {petak['y']}]")
    else:
        print(hasil["pesan"])