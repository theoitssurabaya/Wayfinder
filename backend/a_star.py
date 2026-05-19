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

def get_pintu_masuk(floor_name):
    for r_id, room in RUANGAN_GRID.items():
        if room.get("floor") == floor_name and room.get("name", "").lower() == "pintu masuk":
            return room
    return None

def cari_rute_grid(start_id, target_id):
    if start_id not in RUANGAN_GRID or target_id not in RUANGAN_GRID:
        return {"status": "error", "pesan": "Titik awal atau tujuan tidak valid di peta."}

    start_node = RUANGAN_GRID[start_id]
    target_node = RUANGAN_GRID[target_id]
    
    start_floor = start_node.get("floor", "Lantai 1")
    target_floor = target_node.get("floor", "Lantai 1")
    
    phases = []
    
    # 1. Keluar dari sub-map jika start di sub-map tapi target di luar
    curr_node = start_node
    curr_floor = start_floor
    
    if curr_floor.startswith("submap_") and target_floor != curr_floor:
        parent_id = curr_floor.replace("submap_", "")
        parent_room = RUANGAN_GRID.get(parent_id)
        pintu_masuk = get_pintu_masuk(curr_floor)
        
        if not parent_room or not pintu_masuk:
            return {"status": "error", "pesan": "Sub-Map awal tidak memiliki Pintu Masuk atau Induk yang valid."}
            
        jalur = _a_star_single_floor(curr_node, pintu_masuk)
        if not jalur:
            return {"status": "error", "pesan": "Rute buntu menuju pintu keluar sub-map."}
        phases.extend(jalur)
        
        curr_node = parent_room
        curr_floor = parent_room.get("floor", "Lantai 1")
        
    # 2. Tentukan target antara (apakah target di sub-map?)
    target_parent_room = None
    target_pintu_masuk = None
    actual_target_floor = target_floor
    
    if target_floor.startswith("submap_") and curr_floor != target_floor:
        parent_id = target_floor.replace("submap_", "")
        target_parent_room = RUANGAN_GRID.get(parent_id)
        target_pintu_masuk = get_pintu_masuk(target_floor)
        
        if not target_parent_room or not target_pintu_masuk:
            return {"status": "error", "pesan": "Sub-Map tujuan tidak memiliki Pintu Masuk atau Induk yang valid."}
        actual_target_floor = target_parent_room.get("floor", "Lantai 1")
        
    # 3. Pindah lantai via Lift (jika beda lantai standar)
    if curr_floor != actual_target_floor:
        lift_start = find_nearest_lift(curr_node)
        temp_target = target_parent_room if target_parent_room else target_node
        lift_target = find_nearest_lift(temp_target)
        
        if not lift_start or not lift_target:
            return {"status": "error", "pesan": f"Tidak ditemukan Lift/Tangga antar {curr_floor} dan {actual_target_floor}."}
            
        jalur_1 = _a_star_single_floor(curr_node, lift_start)
        if not jalur_1:
            return {"status": "error", "pesan": f"Rute buntu menuju lift di {curr_floor}."}
        phases.extend(jalur_1)
        
        curr_node = lift_target
        curr_floor = actual_target_floor
        
    # 4. Berjalan di lantai tujuan menuju target akhir / ruangan induk target
    temp_target = target_parent_room if target_parent_room else target_node
    jalur_2 = _a_star_single_floor(curr_node, temp_target)
    if not jalur_2:
        return {"status": "error", "pesan": f"Rute buntu menuju tujuan di {curr_floor}."}
    phases.extend(jalur_2)
    
    # 5. Masuk ke sub-map tujuan (jika ada)
    if target_parent_room:
        jalur_3 = _a_star_single_floor(target_pintu_masuk, target_node)
        if not jalur_3:
            return {"status": "error", "pesan": "Rute buntu di dalam sub-map tujuan."}
        phases.extend(jalur_3)
        
    nav_text = generate_navigation_text(phases, start_id, target_id)
    return {
        "status": "success",
        "jalur_grid": phases,
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
    is_after_transition = False

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
        
        # Pindah Ruangan / Lantai!
        if p1["floor"] != p2["floor"]:
            if p2["floor"].startswith("submap_"):
                parent_id = p2["floor"].replace("submap_", "")
                parent_name = RUANGAN_GRID.get(parent_id, {}).get("name", "Ruangan Induk")
                teks_transisi = f"Masuk ke dalam {parent_name}."
            elif p1["floor"].startswith("submap_"):
                parent_id = p1["floor"].replace("submap_", "")
                parent_name = RUANGAN_GRID.get(parent_id, {}).get("name", "Ruangan Induk")
                teks_transisi = f"Keluar dari {parent_name}."
            else:
                teks_transisi = f"Gunakan Lift/Tangga untuk menuju ke {p2['floor']}."
                
            langkah.append({
                "teks": teks_transisi,
                "index_akhir": i,
                "floor": p1["floor"] # Masih di floor sebelumnya untuk memicu transisi di UI
            })
            current_dir = None
            is_after_transition = True
            continue
            
        dir = get_direction(p1, p2)

        if not current_dir:
            current_dir = dir
        elif current_dir != dir:
            turn = get_turn(current_dir, dir)
            adj_room = get_adjacent_room(p1["x"], p1["y"], exclude_ids)
            
            if len(langkah) == 0:
                prefix = f"Dari {start_name}, berjalanlah ke arah {current_dir}"
            elif is_after_transition:
                if p1['floor'].startswith("submap_"):
                    prefix = f"Setelah masuk, berjalanlah ke arah {current_dir}"
                else:
                    prefix = f"Setelah keluar di {p1['floor']}, berjalanlah ke arah {current_dir}"
                is_after_transition = False
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
    elif is_after_transition:
        if path[-1]['floor'].startswith("submap_"):
            teks_akhir = f"Setelah masuk, lurus ke arah {current_dir} dan Anda akan sampai di {target_name}."
        else:
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