# nlp_engine.py
import re
import difflib
import numpy as np
from sentence_transformers import SentenceTransformer, util

print("Memuat mesin NLP (Sentence Transformers)...")
# Menggunakan model multilingual MPNet yang lebih pintar dan akurat untuk semantik
model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')

DATABASE_RUANGAN = {}
daftar_nama_ruangan = []
embeddings_ruangan = None

NLP_CACHE = {}

# Pengetahuan dasar asisten agar lebih pintar
KAMUS_SINONIM = {
    # IGD & Darurat
    "ugd": "igd", "emergency": "igd", "darurat": "igd", "kecelakaan": "igd", "sekarat": "igd", "luka": "igd", "pendarahan": "igd", "kritis": "igd", "parah": "igd", "tabrakan": "igd", "pingsan": "igd", "luka bakar": "igd", "keracunan": "igd", "sesak napas berat": "igd", "serangan jantung": "igd",

    # Toilet
    "wc": "toilet", "kamar mandi": "toilet", "kencing": "toilet", "berak": "toilet", "buang air": "toilet", "pipis": "toilet", "pup": "toilet", "bab": "toilet", "bak": "toilet", "restroom": "toilet", "washroom": "toilet", "wastafel": "toilet",

    # Administrasi & Keuangan
    "bayar": "kasir", "uang": "kasir", "pembayaran": "kasir", "tagihan": "kasir", "lunasi": "kasir", "administrasi": "kasir", "payment": "kasir", "bill": "kasir", "cashier": "kasir", "bpjs": "pendaftaran", "asuransi": "pendaftaran",
    "daftar": "pendaftaran", "antri": "pendaftaran", "registrasi": "pendaftaran", "loket": "pendaftaran", "nomor": "pendaftaran", "antrian": "pendaftaran", "registration": "pendaftaran",

    # Farmasi & Obat
    "obat": "farmasi", "apotek": "farmasi", "apotik": "farmasi", "resep": "farmasi", "tebus": "farmasi", "pharmacy": "farmasi", "medicine": "farmasi", "ambil obat": "farmasi", "sirup": "farmasi", "pil": "farmasi",

    # Radiologi & Imaging
    "rontgen": "radiologi", "xray": "radiologi", "scan": "radiologi", "mri": "radiologi", "usg": "radiologi", "ct": "radiologi", "radiology": "radiologi", "foto": "radiologi", "sinar x": "radiologi",

    # Laboratorium
    "lab": "laboratorium", "tes": "laboratorium", "test": "laboratorium", "sampel": "laboratorium", "swab": "laboratorium", "pcr": "laboratorium",

    # Rawat Inap & Fasilitas
    "menginap": "rawat inap", "besuk": "rawat inap", "jenguk": "rawat inap", "opname": "rawat inap", "bangsal": "rawat inap", "inpatient": "rawat inap", "ward": "rawat inap", "visit": "rawat inap", "kamar": "rawat inap", "ruang rawat": "rawat inap", "vip": "rawat inap", "vvip": "rawat inap",
    "icu": "icu", "nicu": "nicu", "picu": "picu", "hcu": "icu", "perawatan intensif": "icu", "koma": "icu",

    # Operasi & Kamar Jenazah
    "operasi": "ruang operasi", "ok": "ruang operasi", "pembedahan": "ruang operasi", "caesar": "ruang operasi", "kamar bedah": "ruang operasi",
    "meninggal": "kamar jenazah", "mati": "kamar jenazah", "jenazah": "kamar jenazah", "mayat": "kamar jenazah", "morgue": "kamar jenazah", "kremasi": "kamar jenazah",

    # MCU (Medical Check Up)
    "checkup": "mcu", "cek kesehatan": "mcu", "medical check up": "mcu", "screening": "mcu", "tes kesehatan": "mcu", "medical": "mcu",

    # Fasilitas Umum
    "sholat": "mushola", "salat": "mushola", "masjid": "mushola", "ibadah": "mushola", "sembahyang": "mushola", "prayer": "mushola", "mosque": "mushola", "berdoa": "mushola", "musholla": "mushola", "musala": "mushola",
    "makan": "kantin", "minum": "kantin", "lapar": "kantin", "haus": "kantin", "jajan": "kantin", "eat": "kantin", "drink": "kantin", "food": "kantin", "canteen": "kantin", "cafeteria": "kantin", "ngopi": "kantin", "sarapan": "kantin", "kopi": "kantin", "snack": "kantin", "restoran": "kantin",
    "parkir": "parkiran", "motor": "parkiran", "mobil": "parkiran", "kendaraan": "parkiran", "parking": "parkiran", "basement": "parkiran", "valet": "parkiran",
    "taman": "taman", "garden": "taman", "udara segar": "taman", "merokok": "taman",
    "informasi": "pusat informasi", "info": "pusat informasi", "cs": "pusat informasi", "customer service": "pusat informasi", "satpam": "pusat informasi", "security": "pusat informasi", "resepsionis": "pusat informasi",
    "atm": "atm", "tarik tunai": "atm", "ambil uang": "atm", "bank": "atm",
    "tunggu": "ruang tunggu", "menunggu": "ruang tunggu", "duduk": "ruang tunggu", "istirahat": "ruang tunggu",

    # Navigasi & Bangunan
    "room": "ruang", "door": "pintu", "stairs": "tangga", "naik": "lift", "turun": "lift", "elevator": "lift", "eskalator": "tangga", "keluar": "pintu keluar", "exit": "pintu keluar", "masuk": "pintu masuk", "entrance": "pintu masuk",

    # Poliklinik & Spesialisasi
    "periksa": "poli", "dokter": "poli", "konsultasi": "poli", "kontrol": "poli", "pusing": "poli", "sakit": "poli", "demam": "poli", "berobat": "poli", "check up": "poli", "doctor": "poli", "clinic": "poli", "poliklinik": "poli", "rawat jalan": "poli",
    
    # Keluhan Umum -> Poli Umum / Penyakit Dalam
    "batuk": "poli umum", "pilek": "poli umum", "flu": "poli umum", "mual": "poli umum", "muntah": "poli umum", "diare": "poli umum", "mencret": "poli umum", "masuk angin": "poli umum", "meriang": "poli umum", "lemas": "poli penyakit dalam", "lambung": "poli penyakit dalam", "maag": "poli penyakit dalam", "asam urat": "poli penyakit dalam", "diabetes": "poli penyakit dalam", "gula darah": "poli penyakit dalam", "kolesterol": "poli penyakit dalam", "hipertensi": "poli penyakit dalam", "tensi": "poli penyakit dalam",

    # Poli Kandungan (Obgyn) & Anak
    "kandungan": "poli kandungan", "hamil": "poli kandungan", "melahirkan": "poli kandungan", "usg kandungan": "poli kandungan", "ibu hamil": "poli kandungan", "keguguran": "poli kandungan", "bersalin": "poli kandungan", "bidan": "poli kandungan", "obgyn": "poli kandungan",
    "bayi": "poli anak", "anak": "poli anak", "balita": "poli anak", "imunisasi": "poli anak", "vaksin anak": "poli anak", "tumbuh kembang": "poli anak", "pediatri": "poli anak",

    # Poli Gigi & Mulut
    "gigi": "poli gigi", "cabut gigi": "poli gigi", "tambal gigi": "poli gigi", "kawat gigi": "poli gigi", "behel": "poli gigi", "karang gigi": "poli gigi", "sakit gigi": "poli gigi", "gusi": "poli gigi", "sariawan": "poli gigi", "mulut": "poli gigi",

    # Poli Mata & THT
    "mata": "poli mata", "kacamata": "poli mata", "rabun": "poli mata", "katarak": "poli mata", "minus": "poli mata", "silinder": "poli mata", "buta": "poli mata", "sakit mata": "poli mata",
    "tht": "poli tht", "telinga": "poli tht", "hidung": "poli tht", "tenggorokan": "poli tht", "amandel": "poli tht", "budek": "poli tht", "tuli": "poli tht", "sinusitis": "poli tht", "mimisan": "poli tht",

    # Poli Jantung & Saraf
    "jantung": "poli jantung", "dada": "poli jantung", "sesak nafas": "poli jantung", "kardiologi": "poli jantung", "debar": "poli jantung", "ring jantung": "poli jantung",
    "saraf": "poli saraf", "syaraf": "poli saraf", "stroke": "poli saraf", "lumpuh": "poli saraf", "kesemutan": "poli saraf", "kejang": "poli saraf", "epilepsi": "poli saraf", "neurologi": "poli saraf", "parkinson": "poli saraf", "vertigo": "poli saraf", "sakit kepala": "poli saraf", "migrain": "poli saraf",

    # Poli Ortopedi (Tulang) & Rehab Medik
    "kaki": "poli ortopedi", "tangan": "poli ortopedi", "tulang": "poli ortopedi", "patah": "poli ortopedi", "retak": "poli ortopedi", "sendi": "poli ortopedi", "keseleo": "poli ortopedi", "otot": "poli ortopedi", "saraf terjepit": "poli ortopedi", "hnp": "poli ortopedi", "rematik": "poli ortopedi",
    "fisioterapi": "rehabilitasi medik", "terapi": "rehabilitasi medik", "rehab": "rehabilitasi medik", "pijat": "rehabilitasi medik",

    # Poli Kulit, Kelamin, & Kecantikan
    "kulit": "poli kulit", "gatal": "poli kulit", "panu": "poli kulit", "jerawat": "poli kulit", "alergi": "poli kulit", "kadas": "poli kulit", "kurap": "poli kulit", "kelamin": "poli kulit", "sipilis": "poli kulit", "kecantikan": "poli kulit", "skincare": "poli kulit",

    # Poli Paru
    "paru": "poli paru", "tbc": "poli paru", "asma": "poli paru", "bronkitis": "poli paru", "batuk berdarah": "poli paru", "flek paru": "poli paru",

    # Poli Jiwa / Psikiatri
    "jiwa": "poli jiwa", "psikiater": "poli jiwa", "psikolog": "poli jiwa", "stres": "poli jiwa", "depresi": "poli jiwa", "gila": "poli jiwa", "mental": "poli jiwa", "cemas": "poli jiwa", "insomnia": "poli jiwa", "susah tidur": "poli jiwa",

    # English to Indonesian Mappings

    # ER & Emergency
    "er": "igd", "emergency": "igd", "casualty": "igd", "accident": "igd", "critical": "igd", "bleeding": "igd", "faint": "igd", "heart attack": "igd", "poisoning": "igd", "burns": "igd",

    # Toilet
    "restroom": "toilet", "washroom": "toilet", "bathroom": "toilet", "lavatory": "toilet", "men's room": "toilet", "women's room": "toilet", "urinal": "toilet", "pee": "toilet", "poop": "toilet",

    # Admin & Finance
    "cashier": "kasir", "billing": "kasir", "payment": "kasir", "pay": "kasir", "bill": "kasir", 
    "registration": "pendaftaran", "register": "pendaftaran", "admission": "pendaftaran", "reception": "pendaftaran", "queue": "pendaftaran", "enrollment": "pendaftaran",

    # Pharmacy & Meds
    "pharmacy": "farmasi", "medicine": "farmasi", "drugs": "farmasi", "pill": "farmasi", "prescription": "farmasi", "medication": "farmasi", "drugstore": "farmasi",

    # Radiology & Lab
    "radiology": "radiologi", "xray": "radiologi", "x-ray": "radiologi", "mri": "radiologi", "ultrasound": "radiologi", "scan": "radiologi", "imaging": "radiologi",
    "laboratory": "laboratorium", "lab": "laboratorium", "swab": "laboratorium", "sample": "laboratorium",

    # Inpatient & ICU
    "inpatient": "rawat inap", "ward": "rawat inap", "hospitalization": "rawat inap", "admission": "rawat inap", "visiting": "rawat inap", "stay": "rawat inap",
    "intensive care": "icu", "critical care": "icu",

    # Surgery & Morgue
    "surgery": "ruang operasi", "operating room": "ruang operasi", "operation": "ruang operasi", "surgeon": "ruang operasi", "theater": "ruang operasi",
    "morgue": "kamar jenazah", "mortuary": "kamar jenazah", "dead": "kamar jenazah", "corpse": "kamar jenazah",

    # General Facilities
    "mosque": "mushola", "prayer room": "mushola", "pray": "mushola",
    "canteen": "kantin", "cafeteria": "kantin", "food court": "kantin", "cafe": "kantin", "eat": "kantin", "drink": "kantin", "food": "kantin", "breakfast": "kantin", "coffee": "kantin",
    "parking": "parkiran", "car park": "parkiran", "basement": "parkiran", "valet": "parkiran",
    "garden": "taman", "park": "taman", "smoking area": "taman",
    "information": "pusat informasi", "customer service": "pusat informasi", "help desk": "pusat informasi", "security": "pusat informasi", "guard": "pusat informasi",
    "atm": "atm", "cash machine": "atm", "withdraw": "atm", "bank": "atm",
    "waiting room": "ruang tunggu", "wait": "ruang tunggu", "lounge": "ruang tunggu",

    # Navigation
    "stairs": "tangga", "staircase": "tangga", "elevator": "lift", "escalator": "tangga", "entrance": "pintu masuk", "entry": "pintu masuk", "exit": "pintu keluar", "out": "pintu keluar", "in": "pintu masuk", "door": "pintu",

    # Clinics (Outpatient)
    "specialist clinic": "poli spesialis", "specialist": "spesialis",
    "children clinic": "poli anak", "kids clinic": "poli anak", "dental clinic": "poli gigi", "eye clinic": "poli mata",
    "heart clinic": "poli jantung", "nerve clinic": "poli saraf", "skin clinic": "poli kulit", "lung clinic": "poli paru",
    "clinic": "poli", "outpatient": "poli", "doctor": "poli", "consultation": "poli", "checkup": "poli", "polyclinic": "poli",

    # General Symptoms -> Poli Umum / Penyakit Dalam
    "general": "umum", "general practitioner": "poli umum", "gp": "poli umum", "general clinic": "poli umum",
    "internal medicine": "poli penyakit dalam", "internal": "penyakit dalam",
    "cough": "poli umum", "cold": "poli umum", "flu": "poli umum", "fever": "poli umum", "nausea": "poli umum", "vomiting": "poli umum", "diarrhea": "poli umum", "weakness": "poli penyakit dalam", "stomachache": "poli penyakit dalam", "gastric": "poli penyakit dalam", "diabetes": "poli penyakit dalam", "cholesterol": "poli penyakit dalam", "hypertension": "poli penyakit dalam", "blood pressure": "poli penyakit dalam",

    # Obgyn & Pediatrics
    "obstetrics": "poli kandungan", "gynecology": "poli kandungan", "obgyn": "poli kandungan", "maternity": "poli kandungan", "pregnancy": "poli kandungan", "pregnant": "poli kandungan", "delivery": "poli kandungan", "midwife": "poli kandungan", "miscarriage": "poli kandungan",
    "pediatrics": "poli anak", "pediatrician": "poli anak", "child": "poli anak", "kids": "poli anak", "baby": "poli anak", "infant": "poli anak", "vaccination": "poli anak", "immunization": "poli anak",

    # Dental
    "dental": "poli gigi", "dentist": "poli gigi", "toothache": "poli gigi", "teeth": "poli gigi", "tooth": "poli gigi", "braces": "poli gigi", "cavity": "poli gigi", "gums": "poli gigi",

    # Eye & ENT
    "eye": "poli mata", "ophthalmology": "poli mata", "glasses": "poli mata", "vision": "poli mata", "blind": "poli mata", "cataract": "poli mata",
    "ent": "poli tht", "ear": "poli tht", "nose": "poli tht", "throat": "poli tht", "deaf": "poli tht", "sinus": "poli tht", "tonsil": "poli tht",

    # Cardiology & Neurology
    "cardiology": "poli jantung", "heart": "poli jantung", "chest pain": "poli jantung", "palpitation": "poli jantung",
    "neurology": "poli saraf", "nerve": "poli saraf", "stroke": "poli saraf", "paralysis": "poli saraf", "seizure": "poli saraf", "epilepsy": "poli saraf", "headache": "poli saraf", "migraine": "poli saraf", "dizzy": "poli saraf", "vertigo": "poli saraf",

    # Orthopedics & Rehab
    "orthopedics": "poli ortopedi", "bone": "poli ortopedi", "fracture": "poli ortopedi", "joint": "poli ortopedi", "muscle": "poli ortopedi", "sprain": "poli ortopedi", "rheumatism": "poli ortopedi",
    "physiotherapy": "rehabilitasi medik", "rehab": "rehabilitasi medik", "therapy": "rehabilitasi medik", "massage": "rehabilitasi medik",

    # Dermatology
    "dermatology": "poli kulit", "skin": "poli kulit", "itchy": "poli kulit", "acne": "poli kulit", "allergy": "poli kulit", "venereal": "poli kulit", "syphilis": "poli kulit", "beauty": "poli kulit", "skincare": "poli kulit",

    # Pulmonology
    "pulmonology": "poli paru", "lung": "poli paru", "asthma": "poli paru", "tuberculosis": "poli paru", "tb": "poli paru", "bronchitis": "poli paru",

    # Psychiatry
    "psychiatry": "poli jiwa", "psychiatrist": "poli jiwa", "psychology": "poli jiwa", "stress": "poli jiwa", "depression": "poli jiwa", "crazy": "poli jiwa", "mental": "poli jiwa", "anxiety": "poli jiwa", "insomnia": "poli jiwa",

    # Additional Special Facilities (Dialysis, Nutrition, Lactation, Medical Records, etc)
    "hemodialisa": "hemodialisa", "cuci darah": "hemodialisa", "hd": "hemodialisa", "dialysis": "hemodialisa",
    "gizi": "poli gizi", "nutrisi": "poli gizi", "diet": "poli gizi", "nutrition": "poli gizi", "dietitian": "poli gizi",
    "laktasi": "ruang laktasi", "menyusui": "ruang laktasi", "asi": "ruang laktasi", "nursing room": "ruang laktasi", "breastfeeding": "ruang laktasi",
    "ruang bersalin": "ruang bersalin", "vk": "ruang bersalin", "delivery room": "ruang bersalin", "labor room": "ruang bersalin",
    "rekam medis": "rekam medis", "medical record": "rekam medis", "berkas": "rekam medis",
    "isolasi": "ruang isolasi", "menular": "ruang isolasi", "isolation": "ruang isolasi",
    "donor darah": "donor darah", "pmi": "donor darah", "blood donation": "donor darah",
    "nurse station": "ruang perawat", "jaga perawat": "ruang perawat",

    # Comprehensive Production Additions (Specialized Clinics, Admin, Facilities)
    "bedah": "poli bedah", "surgery clinic": "poli bedah", "bedah umum": "poli bedah",
    "urologi": "poli urologi", "saluran kemih": "poli urologi", "prostat": "poli urologi", "kencing batu": "poli urologi", "urology": "poli urologi",
    "onkologi": "poli onkologi", "kanker": "poli onkologi", "tumor": "poli onkologi", "kemoterapi": "poli onkologi", "kemo": "poli onkologi", "chemo": "poli onkologi", "oncology": "poli onkologi",
    "geriatri": "poli geriatri", "lansia": "poli geriatri", "manula": "poli geriatri", "orang tua": "poli geriatri", "geriatrics": "poli geriatri",
    "andrologi": "poli andrologi", "fertilitas": "poli fertilitas", "bayi tabung": "poli fertilitas", "ivf": "poli fertilitas", "kesuburan": "poli fertilitas", "promil": "poli fertilitas",
    "perinatologi": "ruang perinatologi", "inkubator": "ruang perinatologi", "ruang bayi": "ruang perinatologi", "nursery": "ruang perinatologi",
    "paviliun": "vip", "eksekutif": "vip", "premium": "vip", "executive": "vip",
    "jkn": "pendaftaran", "kis": "pendaftaran", "klaim": "pendaftaran", "bpjs kesehatan": "pendaftaran",
    "minimarket": "minimarket", "koperasi": "minimarket", "mart": "minimarket", "toko": "minimarket", "swalayan": "minimarket", "convenience store": "minimarket",
    "forensik": "kamar jenazah", "visum": "kamar jenazah", "otopsi": "kamar jenazah", "autopsi": "kamar jenazah", "forensic": "kamar jenazah",
    "ambulans": "igd", "ambulance": "igd", "mobil jenazah": "kamar jenazah"
}

# Fungsi pembersihan teks untuk NLP
def bersihkan_teks(teks_kotor):
    teks = teks_kotor.lower()
    
    # Sort keys by length descending so compound words are replaced before single words
    sorted_synonyms = sorted(KAMUS_SINONIM.items(), key=lambda item: len(item[0]), reverse=True)
    
    # Perbaikan sinonim (misal: "mau ambil obat" -> "mau ambil farmasi")
    for slang, baku in sorted_synonyms:
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

def cari_target_ruangan(input_pengunjung, start_node_id=None, language="id", current_floor=None):
    if embeddings_ruangan is None or not daftar_nama_ruangan:
        pesan = "Sistem sedang memuat data peta, mohon tunggu." if language == "id" else "System is loading map data, please wait."
        return {"status": "error", "pesan": pesan}

    from app.core import state as waypoint_graph

    input_bersih = bersihkan_teks(input_pengunjung)

    # EXACT & WORD INTERSECTION MATCH CHECK
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
        
        # 1. Match Exact ID or Exact Name (Raw)
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
                
                # Exact Keyword Match
                if input_bersih == teks_bersih:
                    if r_id not in perfect_matches and r_id not in keyword_perfect_matches:
                        keyword_perfect_matches.append(r_id)
                # Substring utuh
                elif input_bersih and input_bersih in teks_bersih:
                    if r_id not in perfect_matches and r_id not in keyword_perfect_matches and r_id not in substring_matches:
                        substring_matches.append(r_id)
        
        # 2. Word Intersection (Irisan Kata Baku)
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
            from app.core import state as waypoint_graph
            # Prioritize current_floor if given
            if current_floor:
                for m_id in exact_matches:
                    m_room = waypoint_graph.RUANGAN_GRID.get(m_id)
                    if m_room and m_room.get("floor") == current_floor:
                        return {"status": "success", "target_id": m_id, "confidence_score": 1.0}
            
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
            from app.core import state as waypoint_graph
            # Prioritize current_floor if given
            if current_floor:
                for idx in kandidat_indeks:
                    kandidat_id = daftar_nama_ruangan[idx]
                    kandidat_room = waypoint_graph.RUANGAN_GRID.get(kandidat_id)
                    if kandidat_room and kandidat_room.get("floor") == current_floor:
                        return {"status": "success", "target_id": kandidat_id, "confidence_score": float(max_score)}

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