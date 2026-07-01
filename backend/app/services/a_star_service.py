import heapq
from app.core.state import get_grid_map, GRID_WIDTH, GRID_HEIGHT, RUANGAN_GRID, hitung_manhattan

def _a_star_single_floor(start_node, target_node):
    floor = start_node.get("floor", "Lantai 1")
    grid = get_grid_map(floor)
    
    def get_valid_coords(node):
        coords = set()
        is_kiosk = node.get("type") == "kiosk"
        is_entrance = is_kiosk and "pintu" in node.get("name", "").lower()
        
        if is_kiosk and not is_entrance:
            if "door_coords" in node and node["door_coords"]:
                for c in node["door_coords"]:
                    coords.add(c)
            else:
                for dy in range(node.get("h", 1)):
                    for dx in range(node.get("w", 1)):
                        coords.add((node["x"] + dx, node["y"] + dy))
        else:
            if "door_coords" in node and node["door_coords"]:
                for c in node["door_coords"]:
                    coords.add(c)
            else:
                for dy in range(node.get("h", 1)):
                    for dx in range(node.get("w", 1)):
                        coords.add((node["x"] + dx, node["y"] + dy))
        return coords

    target_coords = get_valid_coords(target_node)
    
    # Expand target_coords to include adjacent walkable cells to make stopping more flexible
    expanded_target_coords = set(target_coords)
    for tx, ty in target_coords:
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)]:
            nx, ny = tx + dx, ty + dy
            if 0 <= nx < GRID_WIDTH and 0 <= ny < GRID_HEIGHT:
                if grid[ny][nx] == 0:
                    expanded_target_coords.add((nx, ny))
    target_coords = expanded_target_coords
    
    open_set = []
    came_from = {}
    g_score = {}
    f_score = {}
    
    start_coords = get_valid_coords(start_node)

    for sx, sy in start_coords:
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
                    # Turn penalty
                    turn_penalty = 0
                    if current in came_from:
                        prev = came_from[current]
                        if (current[0] - prev[0]) != (nx - current[0]) or (current[1] - prev[1]) != (ny - current[1]):
                            turn_penalty = 0.5
                            
                    # Wall-hugging penalty (prefer walking in the middle of corridors)
                    wall_penalty = 0
                    for wx, wy in [(nx-1, ny), (nx+1, ny), (nx, ny-1), (nx, ny+1), (nx-1, ny-1), (nx+1, ny+1), (nx-1, ny+1), (nx+1, ny-1)]:
                        if 0 <= wx < GRID_WIDTH and 0 <= wy < GRID_HEIGHT:
                            # If adjacent cell is a wall, add a small penalty
                            if grid[wy][wx] == 1 and (wx, wy) not in target_coords:
                                wall_penalty += 0.1
                                
                    tentative_g = g_score[current] + 1 + turn_penalty + wall_penalty
                    
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

def cari_pasangan_lift_terbaik(start_node, target_node, curr_floor, target_floor):
    from app.core.state import hitung_manhattan
    lifts_start = [r for r in RUANGAN_GRID.values() if r.get("floor") == curr_floor and ("lift" in r.get("name", "").lower() or "elevator" in r.get("name", "").lower()) and "tangga" not in r.get("name", "").lower() and "stairs" not in r.get("name", "").lower()]
    lifts_target = [r for r in RUANGAN_GRID.values() if r.get("floor") == target_floor and ("lift" in r.get("name", "").lower() or "elevator" in r.get("name", "").lower()) and "tangga" not in r.get("name", "").lower() and "stairs" not in r.get("name", "").lower()]
    
    if not lifts_start or not lifts_target:
        return None, None
        
    best_pair = None
    min_dist = float('inf')
    
    for l1 in lifts_start:
        # Cari pasangan lift di lantai tujuan berdasarkan shaft yang sama (x,y paling dekat).
        l2 = min(lifts_target, key=lambda l: hitung_manhattan(l1["x"], l1["y"], l["x"], l["y"]))
        
        # Hitung total estimasi jarak: Start -> Lift 1 -> (Pindah Lantai) -> Lift 2 -> Target.
        dist1 = hitung_manhattan(start_node["x"], start_node["y"], l1["x"], l1["y"])
        dist2 = hitung_manhattan(l2["x"], l2["y"], target_node["x"], target_node["y"])
        
        if dist1 + dist2 < min_dist:
            min_dist = dist1 + dist2
            best_pair = (l1, l2)
            
    return best_pair

def get_pintu_masuk(floor_name):
    for r_id, room in RUANGAN_GRID.items():
        if room.get("floor") == floor_name:
            nama = room.get("name", "").lower()
            if "pintu masuk" in nama or "entrance" in nama:
                return room
    return None

def cari_rute_grid(start_id, target_id, language="id"):
    if start_id not in RUANGAN_GRID or target_id not in RUANGAN_GRID:
        return {"status": "error", "pesan": "Titik awal atau tujuan tidak valid di peta." if language == "id" else "Start or destination point is invalid on the map."}

    start_node = RUANGAN_GRID[start_id]
    target_node = RUANGAN_GRID[target_id]
    
    start_floor = start_node.get("floor", "Lantai 1")
    target_floor = target_node.get("floor", "Lantai 1")
    
    phases = []
    
    # Keluar dari sub-map jika start di sub-map tapi target di luar.
    curr_node = start_node
    curr_floor = start_floor
    
    if curr_floor.startswith("submap_") and target_floor != curr_floor:
        parent_id = curr_floor.replace("submap_", "")
        parent_room = RUANGAN_GRID.get(parent_id)
        pintu_masuk = get_pintu_masuk(curr_floor)
        
        if not parent_room or not pintu_masuk:
            msg = "Sub-Map awal tidak memiliki Pintu Masuk atau Induk yang valid." if language == "id" else "Starting Sub-Map does not have a valid Entrance or Parent room."
            return {"status": "error", "pesan": msg}
            
        jalur = _a_star_single_floor(curr_node, pintu_masuk)
        if not jalur:
            msg = "Rute buntu menuju pintu keluar sub-map." if language == "id" else "Dead end route to sub-map exit."
            return {"status": "error", "pesan": msg}
        phases.extend(jalur)
        
        curr_node = parent_room
        curr_floor = parent_room.get("floor", "Lantai 1")
        
    # Tentukan target antara (apakah target di sub-map?).
    target_parent_room = None
    target_pintu_masuk = None
    actual_target_floor = target_floor
    
    if target_floor.startswith("submap_") and curr_floor != target_floor:
        parent_id = target_floor.replace("submap_", "")
        target_parent_room = RUANGAN_GRID.get(parent_id)
        target_pintu_masuk = get_pintu_masuk(target_floor)
        
        if not target_parent_room or not target_pintu_masuk:
            msg = "Sub-Map tujuan tidak memiliki Pintu Masuk atau Induk yang valid." if language == "id" else "Destination Sub-Map does not have a valid Entrance or Parent room."
            return {"status": "error", "pesan": msg}
        actual_target_floor = target_parent_room.get("floor", "Lantai 1")
        
    # Pindah lantai via Lift (jika beda lantai standar).
    if curr_floor != actual_target_floor:
        temp_target = target_parent_room if target_parent_room else target_node
        lift_start, lift_target = cari_pasangan_lift_terbaik(curr_node, temp_target, curr_floor, actual_target_floor)
        
        if not lift_start or not lift_target:
            clean_curr = get_clean_floor_name(curr_floor, language)
            clean_target = get_clean_floor_name(actual_target_floor, language)
            if language == "id":
                msg = f"Tidak ditemukan Lift/Tangga antar {clean_curr} dan {clean_target}."
            else:
                msg = f"No Elevator/Stairs found between {clean_curr} and {clean_target}."
            return {"status": "error", "pesan": msg}
            
        jalur_1 = _a_star_single_floor(curr_node, lift_start)
        if not jalur_1:
            clean_curr = get_clean_floor_name(curr_floor, language)
            msg = f"Rute buntu menuju lift di {clean_curr}." if language == "id" else f"Dead end route to elevator on {clean_curr}."
            return {"status": "error", "pesan": msg}
        phases.extend(jalur_1)
        
        curr_node = lift_target
        curr_floor = actual_target_floor
        
    # Berjalan di lantai tujuan menuju target akhir / ruangan induk target.
    temp_target = target_parent_room if target_parent_room else target_node
    jalur_2 = _a_star_single_floor(curr_node, temp_target)
    if not jalur_2:
        clean_curr = get_clean_floor_name(curr_floor, language)
        msg = f"Rute buntu menuju tujuan di {clean_curr}." if language == "id" else f"Dead end route to destination on {clean_curr}."
        return {"status": "error", "pesan": msg}
    phases.extend(jalur_2)
    
    # Masuk ke sub-map tujuan (jika ada).
    if target_parent_room:
        jalur_3 = _a_star_single_floor(target_pintu_masuk, target_node)
        if not jalur_3:
            msg = "Rute buntu di dalam sub-map tujuan." if language == "id" else "Dead end route inside destination sub-map."
            return {"status": "error", "pesan": msg}
        phases.extend(jalur_3)
        
    nav_text = generate_navigation_text(phases, start_id, target_id, language)
    return {
        "status": "success",
        "jalur_grid": phases,
        "teks_navigasi": nav_text
    }

def get_room_display_name(room_obj, language="id"):
    if not room_obj:
        return ""
    name = room_obj.get("name", "Ruangan")
    if language == "id":
        return name
        
    name_en = room_obj.get("name_en")
    if name_en:
        return name_en
        
    return name

def get_nearest_landmark(x, y, floor, exclude_ids=None):
    if exclude_ids is None:
        exclude_ids = set()
    
    closest_room = None
    min_dist = float('inf')
    closest_room_center_dist = float('inf')
    
    for r_id, room in RUANGAN_GRID.items():
        if r_id in exclude_ids:
            continue
            
        if room.get("floor", "Lantai 1") != floor:
            continue
            
        # Boleh memasukkan Kiosk sebagai patokan jika ada namanya, tapi prioritas lebih rendah?
        # User bilang "correlated to rooms or kiosk that its near", jadi kita hapus filter Kiosk!
        # if room.get("name") and "Kiosk" in room.get("name", ""):
        #     continue
            
        name = room.get("name", "")
        if not name or name.lower() == "tanpa nama" or "jalan" in name.lower() or "lorong" in name.lower() or name.lower() == "pintu masuk":
            continue

        rx = room["x"]
        ry = room["y"]
        rw = room.get("w", 1)
        rh = room.get("h", 1)
        
        # Hitung jarak terpendek dari titik (x,y) ke kotak ruangan (bounding box)
        dx = max(rx - x, 0, x - (rx + rw - 1))
        dy = max(ry - y, 0, y - (ry + rh - 1))
        dist = dx + dy
        
        # Tie breaker: jarak ke tengah ruangan
        cx = rx + rw / 2
        cy = ry + rh / 2
        center_dist = abs(cx - x) + abs(cy - y)
        
        if dist < min_dist or (dist == min_dist and closest_room and center_dist < closest_room_center_dist):
            min_dist = dist
            closest_room = room
            closest_room_center_dist = center_dist
            
    # Hanya gunakan patokan jika benar-benar dekat dengan titik belok (jarak <= 2 tile).
    if closest_room and min_dist <= 2:
        return closest_room
    return None

def get_clean_floor_name(floor_str, language="en"):
    if floor_str.startswith("submap_"):
        parent_id = floor_str.replace("submap_", "")
        parent_name = RUANGAN_GRID.get(parent_id, {}).get("name", "Ruangan Induk")
        if language == "id": return parent_name
        return parent_name
    return get_translated_floor(floor_str, language)

def get_translated_floor(floor_str, language="en"):
    if language == "id": return floor_str
    import re
    match = re.search(r'Lantai\s+(\d+)', floor_str, re.IGNORECASE)
    if match:
        num = int(match.group(1))
        ordinals = ["Zero", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth"]
        if 0 < num < len(ordinals): return f"{ordinals[num]} Floor"
        return f"Floor {num}"
    return floor_str


def generate_navigation_text(path, start_id, target_id, language="id"):
    if not path or len(path) < 2:
        msg = "Anda sudah sampai di tujuan." if language == "id" else "You have reached your destination."
        return [{"teks": msg, "index_akhir": len(path) - 1 if path else 0, "floor": path[0]["floor"] if path else "Lantai 1"}]

    start_room = RUANGAN_GRID.get(start_id, {})
    target_room = RUANGAN_GRID.get(target_id, {})
    
    start_name = get_room_display_name(start_room, language)
    if not start_name: start_name = "Kiosk"
    
    target_name = get_room_display_name(target_room, language)
    if not target_name: target_name = "Tujuan" if language == "id" else "Destination"
    langkah = []
    current_dir = None
    is_after_transition = False

    def get_direction(p1, p2):
        if p2["x"] > p1["x"]: return 'Kanan'
        if p2["x"] < p1["x"]: return 'Kiri'
        if p2["y"] > p1["y"]: return 'Bawah'
        if p2["y"] < p1["y"]: return 'Atas'
        return None

    def get_relative_position(current_dir, turn_x, turn_y, room_obj):
        if not room_obj: return None
        rx = room_obj["x"]
        ry = room_obj["y"]
        rw = room_obj.get("w", 1)
        rh = room_obj.get("h", 1)
        
        if current_dir == 'Atas': # moving -y
            if rx + rw - 1 < turn_x: return "kiri" if language == "id" else "left"
            if rx > turn_x: return "kanan" if language == "id" else "right"
        elif current_dir == 'Bawah': # moving +y
            if rx + rw - 1 < turn_x: return "kanan" if language == "id" else "right"
            if rx > turn_x: return "kiri" if language == "id" else "left"
        elif current_dir == 'Kanan': # moving +x
            if ry + rh - 1 < turn_y: return "kiri" if language == "id" else "left"
            if ry > turn_y: return "kanan" if language == "id" else "right"
        elif current_dir == 'Kiri': # moving -x
            if ry + rh - 1 < turn_y: return "kanan" if language == "id" else "right"
            if ry > turn_y: return "kiri" if language == "id" else "left"
            
        return "dekat" if language == "id" else "near"

    def get_turn(prev_dir, next_dir):
        if prev_dir == next_dir: return None
        turns_id = {
            'Atas': {'Kanan': 'Kanan', 'Kiri': 'Kiri'},
            'Bawah': {'Kanan': 'Kiri', 'Kiri': 'Kanan'},
            'Kanan': {'Atas': 'Kiri', 'Bawah': 'Kanan'},
            'Kiri': {'Atas': 'Kanan', 'Bawah': 'Kiri'}
        }
        turns_en = {
            'Atas': {'Kanan': 'Right', 'Kiri': 'Left'},
            'Bawah': {'Kanan': 'Left', 'Kiri': 'Right'},
            'Kanan': {'Atas': 'Left', 'Bawah': 'Right'},
            'Kiri': {'Atas': 'Right', 'Bawah': 'Left'}
        }
        
        turn_map = turns_id if language == "id" else turns_en
        fallback = "Berbalik Arah" if language == "id" else "Turn around"
        return turn_map.get(prev_dir, {}).get(next_dir, fallback)

    exclude_ids = {start_id, target_id}

    for i in range(len(path) - 1):
        p1 = path[i]
        p2 = path[i + 1]
        
        # Pindah ruangan / lantai!
        if p1["floor"] != p2["floor"]:
            if p2["floor"].startswith("submap_"):
                parent_id = p2["floor"].replace("submap_", "")
                parent_name = RUANGAN_GRID.get(parent_id, {}).get("name", "Ruangan Induk")
                teks_transisi = f"Masuk ke dalam {parent_name}." if language == "id" else f"Enter {parent_name}."
            elif p1["floor"].startswith("submap_"):
                parent_id = p1["floor"].replace("submap_", "")
                parent_name = RUANGAN_GRID.get(parent_id, {}).get("name", "Ruangan Induk")
                teks_transisi = f"Keluar dari {parent_name}." if language == "id" else f"Exit from {parent_name}."
            else:
                t_floor = get_translated_floor(p2['floor'], language)
                teks_transisi = f"Gunakan Lift untuk menuju ke {p2['floor']}." if language == "id" else f"Use the Lift to go to {t_floor}."
                
            langkah.append({
                "teks": teks_transisi,
                "index_akhir": i,
                "floor": p1["floor"]  # Masih di floor sebelumnya untuk memicu transisi di UI.
            })
            current_dir = None
            is_after_transition = True
            continue
            
        dir = get_direction(p1, p2)

        if not current_dir:
            current_dir = dir
        elif current_dir != dir:
            turn = get_turn(current_dir, dir)
            adj_room_obj = get_nearest_landmark(p1["x"], p1["y"], p1["floor"], exclude_ids)
            adj_room = get_room_display_name(adj_room_obj, language) if adj_room_obj else None
            
            if len(langkah) == 0:
                dir_id = {'Atas':'Depan', 'Bawah':'Belakang', 'Kanan':'Kanan', 'Kiri':'Kiri'}.get(current_dir, current_dir)
                if language == "id": prefix = f"Menghadaplah ke arah {dir_id}."
                else: prefix = f"Face {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'}."
            elif is_after_transition:
                if p1['floor'].startswith("submap_"):
                    if language == "id": prefix = f"Setelah masuk,"
                    else: prefix = f"After entering,"
                else:
                    if language == "id": prefix = f"Setelah keluar di {p1['floor']},"
                    else: 
                        t_floor1 = get_translated_floor(p1['floor'], language)
                        prefix = f"After exiting at {t_floor1},"
                is_after_transition = False
            else:
                prefix = ""
                
            if adj_room:
                pos = get_relative_position(current_dir, p1["x"], p1["y"], adj_room_obj)
                if pos == "dekat" or pos == "near":
                    if prefix:
                        if language == "id": teks = f"{prefix} Jalan lurus, lalu belok {turn} di dekat {adj_room}."
                        else: teks = f"{prefix} Walk straight, then turn {turn} near {adj_room}."
                    else:
                        if language == "id": teks = f"Terus lurus, lalu belok {turn} di dekat {adj_room}."
                        else: teks = f"Go straight, then turn {turn} near {adj_room}."
                else:
                    if prefix:
                        if language == "id": teks = f"{prefix} Jalan lurus, lalu belok {turn} setelah melewati {adj_room} di sebelah {pos} Anda."
                        else: teks = f"{prefix} Walk straight, then turn {turn} after passing {adj_room} on your {pos}."
                    else:
                        if language == "id": teks = f"Terus lurus, lalu belok {turn} setelah melewati {adj_room} di sebelah {pos} Anda."
                        else: teks = f"Go straight, then turn {turn} after passing {adj_room} on your {pos}."
            else:
                if prefix:
                    if language == "id": teks = f"{prefix} Jalan lurus, lalu belok {turn}."
                    else: teks = f"{prefix} Walk straight, then turn {turn}."
                else:
                    if language == "id": teks = f"Terus lurus, lalu belok {turn}."
                    else: teks = f"Go straight, then turn {turn}."
            
            langkah.append({
                "teks": teks,
                "index_akhir": i,
                "floor": p1["floor"]
            })
            
            current_dir = dir

    if len(langkah) == 0:
        if current_dir is None:
            if language == "id": teks_akhir = f"Anda sudah berada di {target_name}."
            else: teks_akhir = f"You are already at {target_name}."
        else:
            dir_id = {'Atas':'Depan', 'Bawah':'Belakang', 'Kanan':'Kanan', 'Kiri':'Kiri'}.get(current_dir, current_dir)
            if language == "id": teks_akhir = f"Menghadaplah ke arah {dir_id}. Jalan lurus dan Anda akan sampai di {target_name}."
            else: teks_akhir = f"Face {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'}. Walk straight and you will arrive at {target_name}."
    elif is_after_transition:
        if current_dir is None:
            final_floor = path[-1]['floor']
            if final_floor.startswith("submap_"):
                parent_id = final_floor.replace("submap_", "")
                parent_name_id = RUANGAN_GRID.get(parent_id, {}).get("name", "Ruangan Induk")
                if language == "id": teks_akhir = f"Anda sudah sampai di {parent_name_id}."
                else: teks_akhir = f"You have arrived at {parent_name_id}."
            else:
                if language == "id": teks_akhir = f"Anda sudah sampai di {final_floor}."
                else: teks_akhir = f"You have arrived at {get_translated_floor(final_floor, language)}."
        else:
            if path[-1]['floor'].startswith("submap_"):
                if language == "id": teks_akhir = f"Setelah masuk, jalan lurus ke arah {current_dir} dan Anda akan sampai di {target_name}."
                else: teks_akhir = f"After entering, go straight {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'} and you will arrive at {target_name}."
            else:
                if language == "id": teks_akhir = f"Dari Lift di {path[-1]['floor']}, jalan lurus ke arah {current_dir} dan Anda akan sampai di {target_name}."
                else: teks_akhir = f"From the Lift at {get_translated_floor(path[-1]['floor'], language)}, walk straight {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'} and you will arrive at {target_name}."
    else:
        target_room_obj = RUANGAN_GRID.get(target_id)
        if target_room_obj:
            pos = get_relative_position(current_dir, path[-1]["x"], path[-1]["y"], target_room_obj)
            if pos == "dekat" or pos == "near":
                pos = "depan" if language == "id" else "front of"
                
            if pos == "depan" or pos == "front of":
                if language == "id": teks_akhir = f"{target_name} ada di {pos} Anda."
                else: teks_akhir = f"{target_name} is in {pos} you."
            else:
                if language == "id": teks_akhir = f"{target_name} ada di sebelah {pos} Anda."
                else: teks_akhir = f"{target_name} is on your {pos}."
        else:
            teks_akhir = f"{target_name} ada di depan Anda." if language == "id" else f"{target_name} is in front of you."

    langkah.append({
        "teks": teks_akhir,
        "index_akhir": len(path) - 1,
        "floor": path[-1]["floor"]
    })

    return langkah