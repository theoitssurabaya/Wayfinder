from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import threading
import socket
import os
os.environ.pop("SSL_CERT_FILE", None)
import json
from dotenv import load_dotenv
import google.generativeai as genai
from app.core.database import db, listen_to_firestore 
from app.core import state as waypoint_graph
from app.services.nlp_service import cari_target_ruangan, latih_ulang_nlp
from app.services.a_star_service import cari_rute_grid
from loguru import logger

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Lock global untuk mencegah race condition dari Firebase thread pool.
sync_lock = threading.Lock()

def sinkronisasi_peta(data):
    """Mengupdate koordinat dan melatih ulang NLP saat database berubah."""
    with sync_lock:
        logger.info("[FIREBASE] Pembaruan denah terdeteksi dari React UI...")
        
        data_nlp_baru = {}
        
        temp_ruangan = {}
        temp_grid = {}
        for item in data:
            room_id = item.get("id_dokumen") 
            room_name = item.get("name", "Tanpa Nama")
            
            if room_id and "grid_x" in item and "grid_y" in item:
                gx = item["grid_x"]
                gy = item["grid_y"]
                gw = item.get("grid_width", 1)
                gh = item.get("grid_height", 1)
                
                endpoints = item.get("endpoints", ["bottom"])
                
                is_kiosk = item.get("type", "room") == "kiosk"
                door_coords = []
                for ep in endpoints:
                    if ep == "top":
                        cy = max(0, gy - 1) if is_kiosk else gy
                        door_coords.append((gx + gw//2, cy))
                    elif ep == "bottom":
                        cy = min(waypoint_graph.GRID_HEIGHT - 1, gy + gh) if is_kiosk else gy + gh - 1
                        door_coords.append((gx + gw//2, cy))
                    elif ep == "left":
                        cx = max(0, gx - 1) if is_kiosk else gx
                        door_coords.append((cx, gy + gh//2))
                    elif ep == "right":
                        cx = min(waypoint_graph.GRID_WIDTH - 1, gx + gw) if is_kiosk else gx + gw - 1
                        door_coords.append((cx, gy + gh//2))
                
                floor = item.get("floor", "Lantai 1")
                building = item.get("building", "Gedung A")
                
                temp_ruangan[room_id] = {
                    "x": gx,
                    "y": gy,
                    "w": gw,
                    "h": gh,
                    "door_coords": door_coords,
                    "name": room_name,
                    "name_en": item.get("name_en", ""),
                    "floor": floor,
                    "building": building,
                    "type": item.get("type", "room"),
                    "keywords": item.get("keywords", [])
                }
                
                grid_key = f"{building}_{floor}"
                if grid_key not in temp_grid:
                    temp_grid[grid_key] = [[0 for _ in range(waypoint_graph.GRID_WIDTH)] for _ in range(waypoint_graph.GRID_HEIGHT)]
                grid = temp_grid[grid_key]
                
                for dy in range(gh):
                    for dx in range(gw):
                        ny = gy + dy
                        nx = gx + dx
                        if 0 <= ny < waypoint_graph.GRID_HEIGHT and 0 <= nx < waypoint_graph.GRID_WIDTH:
                            grid[ny][nx] = 1
                
                kata_kunci = item.get("keywords", [])
                if room_name not in kata_kunci:
                    kata_kunci.append(room_name)
                
                data_nlp_baru[room_id] = kata_kunci
                
                logger.debug(f" -> Load: [{room_id}] '{room_name}' (X:{item['grid_x']}, Y:{item['grid_y']})")

        # Tambahkan nama ruangan induk ke node submap untuk pencocokan NLP yang lebih baik.
        for room_id, room in temp_ruangan.items():
            if room["floor"].startswith("submap_"):
                parent_id = room["floor"].replace("submap_", "")
                parent_room = temp_ruangan.get(parent_id)
                if parent_room:
                    parent_name = parent_room["name"]
                    kunci = data_nlp_baru.get(room_id, [])
                    # Tambahkan kombinasi nama (contoh: "Pintu Masuk Poli Gigi").
                    kunci.append(f"{room['name']} {parent_name}")

        waypoint_graph.RUANGAN_GRID.clear()
        waypoint_graph.RUANGAN_GRID.update(temp_ruangan)
        waypoint_graph.GRID_MAP.clear()
        waypoint_graph.GRID_MAP.update(temp_grid)

        latih_ulang_nlp(data_nlp_baru)
        logger.info("[FIREBASE] Sinkronisasi selesai. Matriks A* dan Model NLP siap digunakan!")

# Jalankan listener di thread terpisah agar tidak mengganggu FastAPI.
threading.Thread(target=listen_to_firestore, args=(sinkronisasi_peta,), daemon=True).start()

app = FastAPI(title="Smart Hospital Guide API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RequestRute(BaseModel):
    start_node_id: str
    teks_pencarian: str
    language: str = "id"
    current_floor: str = None

class RequestTranslate(BaseModel):
    names: list[str]

@app.post("/api/translate")
def translate_names(request: RequestTranslate):
    translations = {}
    names_to_translate = []
    
    for name in request.names:
        if not name:
            continue
        if "lift" in name.lower():
            translations[name] = {
                "id": name,
                "en": name
            }
        else:
            names_to_translate.append(name)
            
    if names_to_translate and GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"""
You are an expert translator for a smart hospital guide application. 
Your task is to process a list of hospital room names provided by the user. The names might be in Indonesian or English.
For each name, determine its correct Indonesian version and English version (medical/hospital terminology).
Return the result as a raw JSON object (without markdown blocks like ```json) where keys are the original input names, and values are objects with "id" (the Indonesian name) and "en" (the English name).

Example output format:
{{
  "Ruang IGD": {{"id": "Ruang IGD", "en": "Emergency Room"}},
  "Emergency Room": {{"id": "Ruang IGD", "en": "Emergency Room"}},
  "ICU": {{"id": "Ruang ICU", "en": "ICU"}}
}}

Names to translate:
{json.dumps(names_to_translate)}
"""
            response = model.generate_content(prompt)
            result_text = response.text.strip()
            if result_text.startswith("```json"):
                result_text = result_text.replace("```json", "").replace("```", "").strip()
            elif result_text.startswith("```"):
                result_text = result_text.replace("```", "").strip()
            
            translated_dict = json.loads(result_text)
            
            for name in names_to_translate:
                if name in translated_dict and isinstance(translated_dict[name], dict) and "id" in translated_dict[name] and "en" in translated_dict[name]:
                    translations[name] = translated_dict[name]
                else:
                    en_name = translated_dict.get(name, name) if not isinstance(translated_dict.get(name), dict) else name
                    translations[name] = {
                        "id": name,
                        "en": en_name
                    }
        except Exception as e:
            logger.error(f"Gemini translation failed: {e}")
            for name in names_to_translate:
                translations[name] = {
                    "id": name,
                    "en": name
                }
    else:
        for name in names_to_translate:
            translations[name] = {
                "id": name,
                "en": name
            }

    return {
        "status": "success",
        "translations": translations
    }

@app.post("/api/generate_keywords")
def generate_keywords(request: RequestTranslate):
    generated_keywords = {}
    names_to_process = []
    
    for name in request.names:
        if not name:
            continue
        if "lift" in name.lower() or "tangga" in name.lower():
            generated_keywords[name] = [name]
        else:
            names_to_process.append(name)
            
    if names_to_process and GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"""
You are an expert medical linguist for a smart hospital guide application.
Your task is to generate 20-30 relevant keywords for each Indonesian hospital room name provided.
These keywords must include related symptoms, layperson terms, slang, medical specialties, and common typos.
CRITICAL: The keywords MUST be generated in BOTH Indonesian and English within the same array.
Return the result as a raw JSON object (without markdown blocks like ```json) where keys are the original Indonesian names, and values are arrays of strings (the keywords).

Names to process:
{json.dumps(names_to_process)}
"""
            response = model.generate_content(prompt)
            result_text = response.text.strip()
            
            # Ekstraksi JSON yang tangguh.
            start_idx = result_text.find('{')
            end_idx = result_text.rfind('}')
            if start_idx != -1 and end_idx != -1:
                result_text = result_text[start_idx:end_idx+1]
            
            keyword_dict = json.loads(result_text)
            
            for name in names_to_process:
                kw_list = keyword_dict.get(name, [name])
                if not isinstance(kw_list, list):
                    kw_list = [str(kw_list)]
                # Pastikan nama asli ada di dalam keywords.
                if name not in kw_list:
                    kw_list.append(name)
                generated_keywords[name] = kw_list
        except Exception as e:
            logger.error(f"Gemini keyword generation failed: {e}")
            for name in names_to_process:
                generated_keywords[name] = [name]
    else:
        for name in names_to_process:
            generated_keywords[name] = [name]

    return {
        "status": "success",
        "keywords": generated_keywords
    }

@app.get("/")
def home():
    return {
        "message": "Server Smart Hospital Backend Aktif!",
        "status": "Bridge Active & Listening to Firestore"
    }

@app.get("/api/ip")
def get_server_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        s.close()
        return {"ip": ip}
    except Exception:
        return {"ip": "127.0.0.1"}

@app.post("/api/route")
def dapatkan_rute(request: RequestRute):
    hasil_nlp = cari_target_ruangan(request.teks_pencarian, request.start_node_id, request.language, request.current_floor)
    if hasil_nlp["status"] == "error":
        raise HTTPException(status_code=400, detail=hasil_nlp["pesan"])
        
    target_id = hasil_nlp["target_id"]
    
    hasil_rute = cari_rute_grid(request.start_node_id, target_id, request.language)
    if hasil_rute["status"] == "error":
         raise HTTPException(status_code=400, detail=hasil_rute["pesan"])
         
    return {
        "status": "success",
        "pesan": "Rute grid berhasil ditemukan",
        "data_target": {
            "id_ruangan": target_id,
            "nama_ruangan": waypoint_graph.RUANGAN_GRID.get(target_id, {}).get("name", target_id),
            "nama_ruangan_en": waypoint_graph.RUANGAN_GRID.get(target_id, {}).get("name_en", ""),
            "confidence_nlp": hasil_nlp["confidence_score"]
        },
        "jalur_koordinat": hasil_rute["jalur_grid"],
        "langkah_navigasi": hasil_rute["teks_navigasi"]
    }
