import heapq
from app.core.state import get_grid_map, GRID_WIDTH, GRID_HEIGHT, RUANGAN_GRID, hitung_manhattan

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

def cari_pasangan_lift_terbaik(start_node, target_node, curr_floor, target_floor):
    from app.core.state import hitung_manhattan
    lifts_start = [r for r in RUANGAN_GRID.values() if r.get("floor") == curr_floor and "lift" in r.get("name", "").lower() and "tangga" not in r.get("name", "").lower()]
    lifts_target = [r for r in RUANGAN_GRID.values() if r.get("floor") == target_floor and "lift" in r.get("name", "").lower() and "tangga" not in r.get("name", "").lower()]
    
    if not lifts_start or not lifts_target:
        return None, None
        
    best_pair = None
    min_dist = float('inf')
    
    for l1 in lifts_start:
        # Cari pasangan lift di lantai tujuan berdasarkan shaft yang sama (X,Y paling dekat)
        l2 = min(lifts_target, key=lambda l: hitung_manhattan(l1["x"], l1["y"], l["x"], l["y"]))
        
        # Hitung total estimasi jarak: Start -> Lift 1 -> (Pindah Lantai) -> Lift 2 -> Target
        dist1 = hitung_manhattan(start_node["x"], start_node["y"], l1["x"], l1["y"])
        dist2 = hitung_manhattan(l2["x"], l2["y"], target_node["x"], target_node["y"])
        
        if dist1 + dist2 < min_dist:
            min_dist = dist1 + dist2
            best_pair = (l1, l2)
            
    return best_pair

def get_pintu_masuk(floor_name):
    for r_id, room in RUANGAN_GRID.items():
        if room.get("floor") == floor_name and room.get("name", "").lower() == "pintu masuk":
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
    
    # 1. Keluar dari sub-map jika start di sub-map tapi target di luar
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
        
    # 2. Tentukan target antara (apakah target di sub-map?)
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
        
    # 3. Pindah lantai via Lift (jika beda lantai standar)
    if curr_floor != actual_target_floor:
        temp_target = target_parent_room if target_parent_room else target_node
        lift_start, lift_target = cari_pasangan_lift_terbaik(curr_node, temp_target, curr_floor, actual_target_floor)
        
        if not lift_start or not lift_target:
            if language == "id":
                msg = f"Tidak ditemukan Lift/Tangga antar {curr_floor} dan {actual_target_floor}."
            else:
                msg = f"No Elevator/Stairs found between {get_translated_floor(curr_floor, language)} and {get_translated_floor(actual_target_floor, language)}."
            return {"status": "error", "pesan": msg}
            
        jalur_1 = _a_star_single_floor(curr_node, lift_start)
        if not jalur_1:
            msg = f"Rute buntu menuju lift di {curr_floor}." if language == "id" else f"Dead end route to elevator on {get_translated_floor(curr_floor, language)}."
            return {"status": "error", "pesan": msg}
        phases.extend(jalur_1)
        
        curr_node = lift_target
        curr_floor = actual_target_floor
        
    # 4. Berjalan di lantai tujuan menuju target akhir / ruangan induk target
    temp_target = target_parent_room if target_parent_room else target_node
    jalur_2 = _a_star_single_floor(curr_node, temp_target)
    if not jalur_2:
        msg = f"Rute buntu menuju tujuan di {curr_floor}." if language == "id" else f"Dead end route to destination on {get_translated_floor(curr_floor, language)}."
        return {"status": "error", "pesan": msg}
    phases.extend(jalur_2)
    
    # 5. Masuk ke sub-map tujuan (jika ada)
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

def get_adjacent_room(x, y, floor, exclude_ids=None):
    if exclude_ids is None:
        exclude_ids = set()
    
    for r_id, room in RUANGAN_GRID.items():
        if r_id in exclude_ids:
            continue
            
        if room.get("floor", "Lantai 1") != floor:
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

def translate_room_name(name, language="en"):
    if language == "id" or not name: return name
    
    dict_en = {
        "Poli Gigi": "Dental Clinic",
        "Poli Mata": "Eye Clinic",
        "Poli Kandungan": "Obstetrics Clinic",
        "Poli Anak": "Pediatric Clinic",
        "Poli Umum": "General Clinic",
        "Poli Penyakit Dalam": "Internal Medicine",
        "Poli Jantung": "Cardiology Clinic",
        "Poli Syaraf": "Neurology Clinic",
        "Poli Spesialis Lanjutan": "Advanced Specialist Clinic",
        "Poli Spesialis": "Specialist Clinic",
        "Poli": "Clinic",
        "Ruang Operasi": "Operating Room",
        "Ruang Tunggu": "Waiting Room",
        "Ruang Pendaftaran": "Registration Room",
        "Ruang Nakes": "Medical Staff Room",
        "Pendaftaran": "Registration",
        "Registrasi": "Registration",
        "Ruang": "Room",
        "Unit Gawat Darurat (IGD)": "Emergency Room (ER)",
        "Instalasi Gawat Darurat": "Emergency Room (ER)",
        "IGD": "Emergency Room (ER)",
        "UGD": "Emergency Room (ER)",
        "Gawat Darurat": "Emergency",
        "Instalasi Rawat Inap": "Inpatient Installation",
        "Instalasi Radiologi": "Radiology Installation",
        "Rehabilitasi Medik": "Medical Rehabilitation",
        "Medical Check Up (MCU)": "Medical Check Up (MCU)",
        "Pusat Informasi": "Information Center",
        "Apotek": "Pharmacy",
        "Farmasi": "Pharmacy",
        "Kasir & Administrasi": "Cashier & Administration",
        "Kasir": "Cashier",
        "Administrasi": "Administration",
        "Kantin": "Canteen",
        "Toilet": "Toilet",
        "Kamar Mandi": "Toilet",
        "Mushola": "Prayer Room",
        "Masjid": "Mosque",
        "Radiologi": "Radiology",
        "Rawat Inap": "Inpatient Ward",
        "Rawat Jalan": "Outpatient Clinic",
        "Unit Rawat Jalan": "Outpatient Unit",
        "Laboratorium Darah": "Blood Laboratory",
        "Laboratorium": "Laboratory",
        "Pintu Masuk": "Entrance",
        "Pintu Keluar": "Exit",
        "Kiosk Basement": "Basement Kiosk",
        "Kiosk Baru": "New Kiosk",
        "Kiosk": "Kiosk",
        "Ruangan Induk": "Main Room",
        "Ruangan Pintu Berlawanan": "Opposing Door Room",
        "Ruangan 1 Pintu": "One Door Room",
        "Ruangan 2 Pintu": "Two Door Room",
        "Ruangan 3 Pintu": "Three Door Room",
        "Ruangan 4 Pintu": "Four Door Room",
        "Tangga Darurat": "Emergency Stairs",
        "Lift": "Elevator",
        "Tangga": "Stairs",
        "Taman": "Garden"
    }
    
    if name in dict_en: return dict_en[name]
    
    translated = name
    import re
    sorted_keys = sorted(dict_en.keys(), key=len, reverse=True)
    for id_word in sorted_keys:
        en_word = dict_en[id_word]
        escaped_word = re.escape(id_word)
        translated = re.sub(rf'\b{escaped_word}\b', en_word, translated, flags=re.IGNORECASE)
    return translated

def generate_navigation_text(path, start_id, target_id, language="id"):
    if not path or len(path) < 2:
        msg = "Anda sudah sampai di tujuan." if language == "id" else "You have reached your destination."
        return [{"teks": msg, "index_akhir": len(path) - 1 if path else 0, "floor": path[0]["floor"] if path else "Lantai 1"}]

    start_name = translate_room_name(RUANGAN_GRID.get(start_id, {}).get("name", "Kiosk"), language)
    target_name = translate_room_name(RUANGAN_GRID.get(target_id, {}).get("name", "Tujuan"), language)
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
        
        # Pindah Ruangan / Lantai!
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
            adj_room = translate_room_name(get_adjacent_room(p1["x"], p1["y"], p1["floor"], exclude_ids), language)
            
            if len(langkah) == 0:
                if language == "id": prefix = f"Dari {start_name}, berjalanlah ke arah {current_dir}"
                else: prefix = f"From {start_name}, walk {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'}"
            elif is_after_transition:
                if p1['floor'].startswith("submap_"):
                    if language == "id": prefix = f"Setelah masuk, berjalanlah ke arah {current_dir}"
                    else: prefix = f"After entering, walk {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'}"
                else:
                    if language == "id": prefix = f"Setelah keluar di {p1['floor']}, berjalanlah ke arah {current_dir}"
                    else: 
                        t_floor1 = get_translated_floor(p1['floor'], language)
                        prefix = f"After exiting at {t_floor1}, walk {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'}"
                is_after_transition = False
            else:
                prefix = "Setelah belok, lurus terus" if language == "id" else "After turning, go straight"
                
            if adj_room:
                if language == "id": teks = f"{prefix} sampai ketemu {adj_room}, lalu belok {turn}."
                else: teks = f"{prefix} until you see {adj_room}, then turn {turn}."
            else:
                if language == "id": teks = f"{prefix} sampai persimpangan, lalu belok {turn}."
                else: teks = f"{prefix} until the intersection, then turn {turn}."
            
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
            if language == "id": teks_akhir = f"Dari {start_name}, berjalanlah ke arah {current_dir} dan Anda akan sampai di {target_name}."
            else: teks_akhir = f"From {start_name}, walk {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'} and you will arrive at {target_name}."
    elif is_after_transition:
        if current_dir is None:
            if language == "id": teks_akhir = f"Anda sudah sampai di {path[-1]['floor']}."
            else: teks_akhir = f"You have arrived at {get_translated_floor(path[-1]['floor'], language)}."
        else:
            if path[-1]['floor'].startswith("submap_"):
                if language == "id": teks_akhir = f"Setelah masuk, lurus ke arah {current_dir} dan Anda akan sampai di {target_name}."
                else: teks_akhir = f"After entering, go straight {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'} and you will arrive at {target_name}."
            else:
                if language == "id": teks_akhir = f"Dari Lift di {path[-1]['floor']}, berjalanlah ke arah {current_dir} dan Anda akan sampai di {target_name}."
                else: teks_akhir = f"From the Lift at {get_translated_floor(path[-1]['floor'], language)}, walk {'Up' if current_dir=='Atas' else 'Down' if current_dir=='Bawah' else 'Right' if current_dir=='Kanan' else 'Left'} and you will arrive at {target_name}."
    else:
        teks_akhir = f"Setelah belok, lurus terus dan Anda akan sampai di {target_name}." if language == "id" else f"After turning, go straight and you will arrive at {target_name}."

    langkah.append({
        "teks": teks_akhir,
        "index_akhir": len(path) - 1,
        "floor": path[-1]["floor"]
    })

    return langkah