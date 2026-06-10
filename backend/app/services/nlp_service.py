# nlp_engine.py
import re
import difflib
import numpy as np
from sentence_transformers import SentenceTransformer, util

print("Memuat mesin NLP (Sentence Transformers)...")
# Menggunakan model multilingual yang mendukung bahasa Indonesia & Inggris
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

DATABASE_RUANGAN = {}
daftar_nama_ruangan = []
embeddings_ruangan = None

NLP_CACHE = {}

# Pengetahuan dasar asisten agar lebih pintar
KAMUS_SINONIM = {
    "ugd": "igd", "emergency": "igd", "darurat": "igd", "kecelakaan": "igd", "sekarat": "igd", "luka": "igd", "pendarahan": "igd", "kritis": "igd", "parah": "igd",
    "wc": "toilet", "kamar mandi": "toilet", "kencing": "toilet", "berak": "toilet", "buang air": "toilet", "pipis": "toilet", "pup": "toilet", "bab": "toilet", "bak": "toilet", "restroom": "toilet", "washroom": "toilet",
    "bayar": "kasir", "uang": "kasir", "pembayaran": "kasir", "tagihan": "kasir", "lunasi": "kasir", "administrasi": "kasir", "payment": "kasir", "bill": "kasir", "cashier": "kasir",
    "obat": "farmasi", "apotek": "farmasi", "apotik": "farmasi", "resep": "farmasi", "tebus": "farmasi", "pharmacy": "farmasi", "medicine": "farmasi",
    "rontgen": "radiologi", "xray": "radiologi", "scan": "radiologi", "mri": "radiologi", "usg": "radiologi", "ct": "radiologi", "radiology": "radiologi",
    "kandungan": "poli kandungan", "hamil": "poli kandungan", "melahirkan": "poli kandungan", "bayi": "poli anak", "anak": "poli anak",
    "gigi": "poli gigi", "cabut gigi": "poli gigi", "tambal gigi": "poli gigi",
    "mata": "poli mata", "kacamata": "poli mata", "rabun": "poli mata",
    "periksa": "poli", "dokter": "poli", "konsultasi": "poli", "kontrol": "poli", "pusing": "poli", "sakit": "poli", "demam": "poli", "berobat": "poli", "check up": "poli",
    "sholat": "mushola", "salat": "mushola", "masjid": "mushola", "ibadah": "mushola", "sembahyang": "mushola", "prayer": "mushola", "mosque": "mushola", "berdoa": "mushola", "musholla": "mushola", "musala": "mushola",
    "makan": "kantin", "minum": "kantin", "lapar": "kantin", "haus": "kantin", "jajan": "kantin", "eat": "kantin", "drink": "kantin", "food": "kantin", "canteen": "kantin", "cafeteria": "kantin", "ngopi": "kantin", "sarapan": "kantin",
    "menginap": "rawat inap", "besuk": "rawat inap", "jenguk": "rawat inap", "opname": "rawat inap", "bangsal": "rawat inap", "inpatient": "rawat inap", "ward": "rawat inap", "visit": "rawat inap", "kamar": "rawat inap",
    "checkup": "mcu", "cek kesehatan": "mcu", "medical check up": "mcu",
    "operasi": "bedah", "meninggal": "kamar jenazah", "mati": "kamar jenazah", "jenazah": "kamar jenazah", "mayat": "kamar jenazah", "morgue": "kamar jenazah",
    "doctor": "poli", "clinic": "poli", "poliklinik": "poli",
    "room": "ruang", "door": "pintu", "stairs": "tangga",
    "daftar": "pendaftaran", "antri": "pendaftaran", "registrasi": "pendaftaran", "loket": "pendaftaran", "nomor": "pendaftaran", "antrian": "pendaftaran", "registration": "pendaftaran",
    "parkir": "parkiran", "motor": "parkiran", "mobil": "parkiran", "kendaraan": "parkiran", "parking": "parkiran",
    "darah": "laboratorium", "lab": "laboratorium", "tes": "laboratorium", "test": "laboratorium", "sampel": "laboratorium"
}

# Fungsi pembersihan teks untuk NLP
def bersihkan_teks(teks_kotor):
    teks = teks_kotor.lower()
    
    # Perbaikan sinonim (misal: "mau ambil obat" -> "mau ambil farmasi")
    for slang, baku in KAMUS_SINONIM.items():
        teks = re.sub(rf'\b{slang}\b', baku, teks)
        
    teks = re.sub(r'[^\w\s]', '', teks)
    
    # Kata tugas yang tidak relevan (ID & EN)
    stopwords = [
        "mau", "ke", "di", "mana", "tolong", "antar", "cari", "ruang", "tempat", "saya", "ingin", "tanya", "mas", "mbak", "kasih", "tau", "arah", "jalan", "buat", "ambil",
        "tunjukkan", "bantuin", "dong", "aku", "nyari", "gimana", "caranya", "menuju", "cara", "pergi", "bisa", "tolongin", "dong", "pak", "bu", "sus", "suster", "dokter", "letak", "letaknya", "ada",
        "want", "to", "go", "where", "please", "take", "me", "find", "room", "place", "i", "ask", "show", "way", "direction", "get", "looking", "for", "how", "can", "is", "the", "a", "an"
    ]
    kata_akhir = [kata for kata in teks.split() if kata not in stopwords]
    
    return " ".join(kata_akhir)

# Fungsi untuk melatih ulang model NLP dengan data terbaru dari Firebase
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

def cari_target_ruangan(input_pengunjung, start_node_id=None, language="id"):
    if embeddings_ruangan is None or not daftar_nama_ruangan:
        pesan = "Sistem sedang memuat data peta, mohon tunggu." if language == "id" else "System is loading map data, please wait."
        return {"status": "error", "pesan": pesan}

    from app.core import state as waypoint_graph

    input_bersih = bersihkan_teks(input_pengunjung)

    # EXACT & WORD INTERSECTION MATCH CHECK
    exact_matches = []
    input_lower = input_pengunjung.lower().strip()
    input_words = set(input_bersih.split())
    
    kumpulan_kata_kunci = []
    mapping_kunci_ke_id = {}

    for r_id, room in waypoint_graph.RUANGAN_GRID.items():
        room_name_lower = room.get("name", "").lower().strip()
        room_keywords = [k.lower().strip() for k in room.get("keywords", [])]
        
        # 1. Match Exact ID or Exact Name (Raw)
        if input_lower == room_name_lower or input_pengunjung == r_id:
            exact_matches.append(r_id)
            
        # Bersihkan nama ruangan dan keywords agar sinonimnya terseragamkan (misal: darurat -> igd)
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
                
                # Substring utuh (misal input "igd" dan nama ruangan "instalasi igd")
                if input_bersih and input_bersih in teks_bersih:
                    if r_id not in exact_matches:
                        exact_matches.append(r_id)
        
        # 2. Word Intersection (Irisan Kata Baku)
        # Jika ada kata baku yang sama persis (misal sama-sama memiliki kata "igd" atau "pendaftaran")
        # Abaikan jika kata irisannya terlalu umum (kurang dari 3 huruf)
        irisan = input_words.intersection(room_words)
        irisan_valid = [w for w in irisan if len(w) >= 3]
        if irisan_valid:
            if r_id not in exact_matches:
                exact_matches.append(r_id)

    # 3. Fuzzy Typo Match (Jika irisan dan substring gagal)
    if not exact_matches and input_bersih:
        typo_matches = difflib.get_close_matches(input_bersih, kumpulan_kata_kunci, n=1, cutoff=0.80)
        if not typo_matches:
            typo_matches = difflib.get_close_matches(input_lower, kumpulan_kata_kunci, n=1, cutoff=0.80)
            
        if typo_matches:
            exact_matches = mapping_kunci_ke_id.get(typo_matches[0], [])

    if exact_matches:
        if len(exact_matches) == 1:
            return {"status": "success", "target_id": exact_matches[0], "confidence_score": 1.0}
        else:
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
                        floor_penalty = 0 if m_room.get("floor", "Lantai 1") == start_floor else 10000
                        jarak = abs(start_x - m_room.get("x", 0)) + abs(start_y - m_room.get("y", 0)) + floor_penalty
                        if jarak < terbaik_jarak:
                            terbaik_jarak = jarak
                            terbaik_id = m_id
                    return {"status": "success", "target_id": terbaik_id, "confidence_score": 1.0}
            return {"status": "success", "target_id": exact_matches[0], "confidence_score": 1.0}

    if not input_bersih:
         pesan = "Mohon masukkan tujuan yang lebih spesifik." if language == "id" else "Please enter a more specific destination."
         return {"status": "error", "pesan": pesan}

    # HEURISTIC: Deteksi jika user HANYA ingin pergi ke suatu lantai (misal: "turun lantai 1", "lantai 2", dsb.)
    # Jika iya, kita akan arahkan mereka ke "Lift" di lantai tujuan tersebut.
    teks_cek = input_bersih.replace("naik", "").replace("turun", "").strip()
    match_lantai = re.fullmatch(r'lantai\s+(\w+)', teks_cek) # \w+ agar menangkap angka maupun string "dasar" dsb
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

    if input_bersih in NLP_CACHE:
        input_embedding = NLP_CACHE[input_bersih]
    else:
        input_embedding = model.encode(input_bersih, convert_to_tensor=True)
        NLP_CACHE[input_bersih] = input_embedding
    skor_kemiripan = util.cos_sim(input_embedding, embeddings_ruangan)[0].cpu().numpy()
    
    # Penalti Tangga Darurat jika user tidak secara spesifik mengetik "tangga"
    # agar rute antar lantai via pencarian NLP selalu memprioritaskan "Lift"
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
            if start_node_id:
                from app.core import state as waypoint_graph
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
                        
                        # Penalty besar jika lantai berbeda (10000)
                        floor_penalty = 0 if k_floor == start_floor else 10000 
                        jarak_manhattan = abs(start_x - k_x) + abs(start_y - k_y)
                        total_jarak = jarak_manhattan + floor_penalty
                        
                        if total_jarak < terbaik_jarak:
                            terbaik_jarak = total_jarak
                            terbaik_id = kandidat_id
                
            if not terbaik_id:
                terbaik_id = daftar_nama_ruangan[kandidat_indeks[0]]
    if terbaik_id:
        return {
            "status": "success",
            "target_id": terbaik_id,
            "confidence_score": float(max_score)
        }
    else:
        pesan = "Maaf, tujuan tidak dikenali. Silakan coba kata kunci lain." if language == "id" else "Sorry, destination not recognized. Please try another keyword."
        return {
            "status": "error",
            "pesan": pesan
        }