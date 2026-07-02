import os
import re
import numpy as np
from sentence_transformers import SentenceTransformer, util
from rapidfuzz import process, fuzz
import google.generativeai as genai
from firebase_admin import firestore
from app.core.database import db


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

print("Memuat mesin NLP (Sentence Transformers)...")
# Menggunakan model multilingual MPNet yang lebih pintar dan akurat untuk semantik.
# Force CPU to prevent CUDA OOM errors during uvicorn --reload (GPU too small for multiple instances).
model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2', device='cpu')

DATABASE_RUANGAN = {}
daftar_nama_ruangan = []
embeddings_ruangan = None

NLP_CACHE = {}


def bersihkan_teks(teks_kotor):
    teks = teks_kotor.lower()
        
    teks = re.sub(r'[^\w\s]', '', teks)
    
    # Kata tugas yang tidak relevan (id & en).
    stopwords = [
        "mau", "ke", "di", "mana", "tolong", "antar", "cari", "ruang", "tempat", "saya", "ingin", "tanya", "mas", "mbak", "kasih", "tau", "arah", "jalan", "buat", "ambil",
        "tunjukkan", "bantuin", "dong", "aku", "nyari", "gimana", "caranya", "menuju", "cara", "pergi", "bisa", "tolongin", "dong", "pak", "bu", "sus", "suster", "dokter", "letak", "letaknya", "ada",
        "want", "to", "go", "where", "please", "take", "me", "find", "room", "place", "i", "ask", "show", "way", "direction", "get", "looking", "for", "how", "can", "is", "the", "a", "an"
    ]
    kata_akhir = [kata for kata in teks.split() if kata not in stopwords]
    
    return " ".join(kata_akhir)

# Fungsi untuk melatih ulang model NLP dengan data terbaru dari Firebase.
def latih_ulang_nlp(data_kamus_baru):
    global DATABASE_RUANGAN, daftar_nama_ruangan, embeddings_ruangan
    
    if not data_kamus_baru:
        print("[NLP] Peringatan: Database kosong, tidak ada yang dilatih.")
        return

    korpus_dokumen = []
    for sinonim in data_kamus_baru.values():
        teks_gabungan = " ".join(sinonim)
        korpus_dokumen.append(bersihkan_teks(teks_gabungan))

    new_embeddings = model.encode(korpus_dokumen, convert_to_tensor=True)
    
    DATABASE_RUANGAN = data_kamus_baru
    daftar_nama_ruangan = list(DATABASE_RUANGAN.keys())
    embeddings_ruangan = new_embeddings
    
    NLP_CACHE.clear()

    print(f"[NLP] Model berhasil dilatih ulang! ({len(daftar_nama_ruangan)} Ruangan Aktif)")

def cari_target_ruangan(input_pengunjung, start_node_id=None, language="id", current_floor=None):
    if embeddings_ruangan is None or not daftar_nama_ruangan:
        pesan = "Sistem sedang memuat data peta, mohon tunggu." if language == "id" else "System is loading map data, please wait."
        return {"status": "error", "pesan": pesan}

    from app.core import state as waypoint_graph

    input_bersih = bersihkan_teks(input_pengunjung)
    
    if not input_bersih:
         pesan = "Mohon masukkan tujuan yang lebih spesifik." if language == "id" else "Please enter a more specific destination."
         return {"status": "error", "pesan": pesan}

    # Heuristic: Deteksi jika user hanya ingin pergi ke suatu lantai.
    # Cocokkan input dengan semua nama lantai yang ada di database (kecuali submap).
    teks_cek = input_bersih.replace("naik", "").replace("turun", "").strip()
    
    # Kumpulkan semua nama lantai unik dari grid (abaikan submap).
    semua_lantai = set()
    for room in waypoint_graph.RUANGAN_GRID.values():
        fl = room.get("floor", "Lantai 1")
        if not fl.startswith("submap_"):
            semua_lantai.add(fl)
    
    # Cocokkan input yang sudah dibersihkan dengan nama lantai.
    target_floor_match = None
    for fl in semua_lantai:
        if teks_cek.lower() == fl.lower():
            target_floor_match = fl
            break
    
    if target_floor_match:
        for r_id, room in waypoint_graph.RUANGAN_GRID.items():
            if room.get("floor", "Lantai 1") == target_floor_match:
                nama = room.get("name", "").lower()
                if "lift" in nama and "tangga" not in nama:
                    return {
                        "status": "success",
                        "target_id": r_id,
                        "confidence_score": 1.0
                    }

    # Heuristic: Deteksi jika user ingin pulang/keluar
    if "pulang" in input_bersih or "keluar" in input_bersih or "exit" in input_bersih:
        entrance_nodes = []
        for r_id, room in waypoint_graph.RUANGAN_GRID.items():
            nama = room.get("name", "").lower()
            tipe = room.get("type", "room")
            
            # Kiosk entrance atau pintu keluar.
            is_entrance = (tipe == "kiosk" and "pintu" in nama) or "pintu keluar" in nama or "pintu masuk" in nama or "exit" in nama or "entrance" in nama or "lobi" in nama or "lobby" in nama
            
            if is_entrance:
                entrance_nodes.append(r_id)
        
        if entrance_nodes:
            terbaik_id = entrance_nodes[0]
            if start_node_id and start_node_id in waypoint_graph.RUANGAN_GRID:
                start_room = waypoint_graph.RUANGAN_GRID[start_node_id]
                sx = start_room.get("x", 0)
                sy = start_room.get("y", 0)
                sf = start_room.get("floor", "Lantai 1")
                
                min_jarak = float('inf')
                for pk_id in entrance_nodes:
                    pk_room = waypoint_graph.RUANGAN_GRID[pk_id]
                    penalty = 0 if pk_room.get("floor", "Lantai 1") == sf else 10000
                    jarak = abs(sx - pk_room.get("x", 0)) + abs(sy - pk_room.get("y", 0)) + penalty
                    if jarak < min_jarak:
                        min_jarak = jarak
                        terbaik_id = pk_id
            
            return {
                "status": "success",
                "target_id": terbaik_id,
                "confidence_score": 1.0
            }

    # Pemeriksaan kecocokan persis & irisan kata.
    perfect_matches = []
    keyword_perfect_matches = []
    substring_matches = []
    intersection_matches = []
    
    input_lower = input_pengunjung.lower().strip()
    input_words = set(input_bersih.split())
    
    kumpulan_kata_kunci = []
    mapping_kunci_ke_id = {}

    for r_id, room in waypoint_graph.RUANGAN_GRID.items():
        room_name_lower = room.get("name", "").lower().strip()
        room_keywords = [k.lower().strip() for k in room.get("keywords", [])]
        
        # Cocokkan ID persis atau nama persis (mentah).
        if input_lower == room_name_lower or input_pengunjung == r_id:
            perfect_matches.append(r_id)
            
        clean_room_name = bersihkan_teks(room_name_lower)
        clean_keywords = [bersihkan_teks(k) for k in room_keywords]
        
        semua_teks_bersih = [clean_room_name] + clean_keywords
        room_words = set()
        for teks_bersih in semua_teks_bersih:
            if teks_bersih:
                kumpulan_kata_kunci.append(teks_bersih)
                if teks_bersih not in mapping_kunci_ke_id:
                    mapping_kunci_ke_id[teks_bersih] = []
                mapping_kunci_ke_id[teks_bersih].append(r_id)
                room_words.update(teks_bersih.split())
                
                # Kecocokan kata kunci persis.
                if input_bersih == teks_bersih:
                    if r_id not in perfect_matches and r_id not in keyword_perfect_matches:
                        keyword_perfect_matches.append(r_id)
                # Substring utuh.
                elif input_bersih and input_bersih in teks_bersih:
                    if r_id not in perfect_matches and r_id not in keyword_perfect_matches and r_id not in substring_matches:
                        substring_matches.append(r_id)
        
        # Irisan kata baku.
        irisan = input_words.intersection(room_words)
        irisan_valid = [w for w in irisan if len(w) >= 3]
        if irisan_valid:
            if r_id not in perfect_matches and r_id not in substring_matches and r_id not in intersection_matches:
                intersection_matches.append(r_id)

    if perfect_matches:
        exact_matches = perfect_matches
    elif keyword_perfect_matches:
        exact_matches = keyword_perfect_matches
    elif substring_matches:
        exact_matches = substring_matches
    else:
        exact_matches = intersection_matches

    # Koreksi typo (jika irisan dan substring gagal).
    if not exact_matches and input_bersih:
        typo_matches = process.extract(input_bersih, kumpulan_kata_kunci, scorer=fuzz.WRatio, limit=1, score_cutoff=70)
        if not typo_matches:
            typo_matches = process.extract(input_lower, kumpulan_kata_kunci, scorer=fuzz.WRatio, limit=1, score_cutoff=70)
            
        if typo_matches:
            exact_matches = mapping_kunci_ke_id.get(typo_matches[0][0], [])

    if exact_matches:
        if len(exact_matches) == 1:
            return {"status": "success", "target_id": exact_matches[0], "confidence_score": 1.0}
        else:
            from app.core import state as waypoint_graph
            if start_node_id:
                start_room = waypoint_graph.RUANGAN_GRID.get(start_node_id)
                if start_room:
                    start_floor = start_room.get("floor", "Lantai 1")
                    start_x = start_room.get("x", 0)
                    start_y = start_room.get("y", 0)
                    terbaik_jarak = float('inf')
                    terbaik_id = exact_matches[0]
                    for m_id in exact_matches:
                        m_room = waypoint_graph.RUANGAN_GRID.get(m_id)
                        if not m_room: continue
                        
                        # Prioritaskan current_floor jika user sedang melihat lantai tertentu.
                        # Jika tidak, prioritaskan lantai tempat kiosk berada.
                        target_floor = current_floor if current_floor else start_floor
                        floor_penalty = 0 if m_room.get("floor", "Lantai 1") == target_floor else 10000
                        
                        jarak = abs(start_x - m_room.get("x", 0)) + abs(start_y - m_room.get("y", 0)) + floor_penalty
                        if jarak < terbaik_jarak:
                            terbaik_jarak = jarak
                            terbaik_id = m_id
                    return {"status": "success", "target_id": terbaik_id, "confidence_score": 1.0}
            
            # Cadangan jika tidak ada start_node_id.
            if current_floor:
                for m_id in exact_matches:
                    m_room = waypoint_graph.RUANGAN_GRID.get(m_id)
                    if m_room and m_room.get("floor") == current_floor:
                        return {"status": "success", "target_id": m_id, "confidence_score": 1.0}

            return {"status": "success", "target_id": exact_matches[0], "confidence_score": 1.0}

    if not input_bersih:
         pesan = "Mohon masukkan tujuan yang lebih spesifik." if language == "id" else "Please enter a more specific destination."
         return {"status": "error", "pesan": pesan}

    # Heuristic: Deteksi jika user hanya ingin pergi ke suatu lantai (misal: "turun lantai 1", "lantai 2", dsb).
    # Jika iya, kita akan arahkan mereka ke "Lift" di lantai tujuan tersebut.
    teks_cek = input_bersih.replace("naik", "").replace("turun", "").strip()
    match_lantai = re.fullmatch(r'lantai\s+(\w+)', teks_cek)  # Regex untuk menangkap angka maupun string "dasar".
    if match_lantai:
        target_floor = f"Lantai {match_lantai.group(1)}"
        from app.core import state as waypoint_graph
        for r_id, room in waypoint_graph.RUANGAN_GRID.items():
            if room.get("floor", "Lantai 1").lower() == target_floor.lower():
                nama = room.get("name", "").lower()
                if "lift" in nama and "tangga" not in nama:
                    return {
                        "status": "success",
                        "target_id": r_id,
                        "confidence_score": 1.0
                    }

    # Heuristic: Deteksi jika user ingin pulang/keluar
    if "pulang" in input_bersih or "keluar" in input_bersih or "exit" in input_bersih:
        from app.core import state as waypoint_graph
        entrance_nodes = []
        for r_id, room in waypoint_graph.RUANGAN_GRID.items():
            nama = room.get("name", "").lower()
            tipe = room.get("type", "room")
            
            is_entrance = (tipe == "kiosk" and "pintu" in nama) or "pintu keluar" in nama or "pintu masuk" in nama or "exit" in nama or "entrance" in nama or "lobi" in nama or "lobby" in nama or "pusat informasi" in nama
            
            if is_entrance:
                entrance_nodes.append(r_id)
        
        if entrance_nodes:
            terbaik_id = entrance_nodes[0]
            if start_node_id and start_node_id in waypoint_graph.RUANGAN_GRID:
                start_room = waypoint_graph.RUANGAN_GRID[start_node_id]
                sx = start_room.get("x", 0)
                sy = start_room.get("y", 0)
                sf = start_room.get("floor", "Lantai 1")
                
                min_jarak = float('inf')
                for pk_id in entrance_nodes:
                    pk_room = waypoint_graph.RUANGAN_GRID[pk_id]
                    penalty = 0 if pk_room.get("floor", "Lantai 1") == sf else 10000
                    jarak = abs(sx - pk_room.get("x", 0)) + abs(sy - pk_room.get("y", 0)) + penalty
                    if jarak < min_jarak:
                        min_jarak = jarak
                        terbaik_id = pk_id
            
            return {
                "status": "success",
                "target_id": terbaik_id,
                "confidence_score": 1.0
            }

    if input_bersih in NLP_CACHE:
        input_embedding = NLP_CACHE[input_bersih]
    else:
        input_embedding = model.encode(input_bersih, convert_to_tensor=True)
        NLP_CACHE[input_bersih] = input_embedding
    skor_kemiripan = util.cos_sim(input_embedding, embeddings_ruangan)[0].cpu().numpy()
    
    # Penalti tangga darurat jika user tidak secara spesifik mengetik "tangga".
    # Agar rute antar lantai via pencarian NLP selalu memprioritaskan "Lift".
    if "tangga" not in input_bersih:
        for i, r_id in enumerate(daftar_nama_ruangan):
            nama_keywords = " ".join(DATABASE_RUANGAN.get(r_id, [])).lower()
            if "tangga" in nama_keywords:
                skor_kemiripan[i] -= 0.50
    
    max_score = np.max(skor_kemiripan)
    terbaik_id = None
    
    if max_score >= 0.35:
        kandidat_indeks = np.where(skor_kemiripan >= max_score - 0.01)[0]
        
        if len(kandidat_indeks) == 1:
            terbaik_id = daftar_nama_ruangan[kandidat_indeks[0]]
        else:
            from app.core import state as waypoint_graph
            if start_node_id:
                start_room = waypoint_graph.RUANGAN_GRID.get(start_node_id)
                if start_room:
                    start_floor = start_room.get("floor", "Lantai 1")
                    start_x = start_room.get("x", 0)
                    start_y = start_room.get("y", 0)
                    
                    terbaik_jarak = float('inf')
                    
                    for idx in kandidat_indeks:
                        kandidat_id = daftar_nama_ruangan[idx]
                        kandidat_room = waypoint_graph.RUANGAN_GRID.get(kandidat_id)
                        if not kandidat_room: continue
                        
                        k_floor = kandidat_room.get("floor", "Lantai 1")
                        k_x = kandidat_room.get("x", 0)
                        k_y = kandidat_room.get("y", 0)
                        
                        # Prioritaskan current_floor jika user sedang melihat lantai tertentu.
                        # Jika tidak, prioritaskan lantai tempat kiosk berada.
                        target_floor = current_floor if current_floor else start_floor
                        floor_penalty = 0 if k_floor == target_floor else 10000 
                        
                        jarak_manhattan = abs(start_x - k_x) + abs(start_y - k_y)
                        total_jarak = jarak_manhattan + floor_penalty
                        
                        if total_jarak < terbaik_jarak:
                            terbaik_jarak = total_jarak
                            terbaik_id = kandidat_id
                
            if not terbaik_id:
                # Cadangan jika tidak ada start_node_id, minimal utamakan current_floor.
                if current_floor:
                    for idx in kandidat_indeks:
                        kandidat_id = daftar_nama_ruangan[idx]
                        kandidat_room = waypoint_graph.RUANGAN_GRID.get(kandidat_id)
                        if kandidat_room and kandidat_room.get("floor") == current_floor:
                            terbaik_id = kandidat_id
                            break
                            
                if not terbaik_id:
                    terbaik_id = daftar_nama_ruangan[kandidat_indeks[0]]
    if terbaik_id:
        return {
            "status": "success",
            "target_id": terbaik_id,
            "confidence_score": float(max_score)
        }
    else:
        # Cadangan Gemini jika skor lokal terlalu rendah.
        if GEMINI_API_KEY:
            try:
                print(f"[NLP] Lokal gagal (max_score: {max_score:.2f}). Memanggil Gemini untuk pencarian: '{input_pengunjung}'...")
                gemini_model = genai.GenerativeModel("gemini-2.5-flash")
                
                # Buat daftar ruangan untuk konteks.
                room_list_str = ""
                for r_id in daftar_nama_ruangan:
                    nama_ruangan = ", ".join(DATABASE_RUANGAN.get(r_id, []))
                    room_list_str += f"- ID: {r_id}, Deskripsi/Keywords: {nama_ruangan}\n"
                
                prompt = f"""
                Kamu adalah asisten navigasi rumah sakit. Pengguna mencari: "{input_pengunjung}"
                
                Berikut adalah daftar ruangan yang tersedia:
                {room_list_str}
                
                Berdasarkan pencarian pengguna, tentukan SATU ID ruangan yang paling tepat. 
                Hanya kembalikan ID ruangan tersebut, tanpa teks tambahan apapun. Jika benar-benar tidak ada yang cocok, kembalikan kata "NOT_FOUND".
                """
                
                response = gemini_model.generate_content(prompt)
                gemini_answer = response.text.strip()
                
                if gemini_answer != "NOT_FOUND" and gemini_answer in DATABASE_RUANGAN:
                    print(f"[NLP] Gemini berhasil mencocokkan! Memasukkan '{input_pengunjung}' ke keywords ruangan {gemini_answer}")
                    # Update firestore agar pintar ke depannya.
                    try:
                        db.collection('Rooms').document(gemini_answer).update({"keywords": firestore.ArrayUnion([input_pengunjung])})
                    except Exception as e:
                        print(f"[NLP] Gagal mengupdate keywords di Firestore: {e}")
                        
                    return {
                        "status": "success",
                        "target_id": gemini_answer,
                        "confidence_score": 0.99
                    }
            except Exception as e:
                print(f"[NLP] Gemini Fallback Error: {e}")

        pesan = "Maaf, tujuan tidak dikenali. Silakan coba kata kunci lain." if language == "id" else "Sorry, destination not recognized. Please try another keyword."
        return {
            "status": "error",
            "pesan": pesan
        }