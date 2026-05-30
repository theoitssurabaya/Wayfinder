import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import SharedMap from "../components/SharedMap";
import { translateName } from "../utils/translator";
import "./Admin.css";

// ── Icon components ──
const SearchIcon = () => (
  <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const LoginIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

export default function App() {
  const navigate = useNavigate();
  const [search,      setSearch]      = useState("");
  const [outputText,  setOutputText]  = useState("");
  const [location,    setLocation]    = useState(""); 
  const [floor,       setFloor]       = useState("Lantai 1");
  const [floors,      setFloors]      = useState(["Lantai 1"]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [kiosks,      setKiosks]      = useState([]);
  const [rooms,       setRooms]       = useState([]); // STATE BARU: Daftar Ruangan
  const [pathData,    setPathData]    = useState([]);
  const [targetRoomName, setTargetRoomName] = useState("");
  const [navigationSteps, setNavigationSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'id');

  const getText = (key) => {
    const dict = {
      'logout': { id: 'Keluar', en: 'Logout' },
      'search_placeholder': { id: 'Cari nama poli atau keluhan Anda...', en: 'Search for a clinic or your symptoms...' },
      'output_placeholder': { id: 'Keterangan rute akan muncul di sini', en: 'Destination output text will appear here' },
      'select_kiosk': { id: 'Pilih Kiosk Awal', en: 'Select Start Kiosk' },
      'select_room': { id: 'Pilih Ruangan Tujuan', en: 'Select Destination Room' },
      'select_floor': { id: 'Pilih Lantai', en: 'Select Floor' },
      'fail_kiosk_first': { id: 'Silakan pilih Kiosk awal terlebih dahulu.', en: 'Please select a starting Kiosk first.' },
      'searching': { id: 'Mencari rute...', en: 'Searching for route...' },
      'failed': { id: 'Gagal:', en: 'Failed:' },
      'route_found': { id: 'Rute ditemukan!', en: 'Route found!' },
      'towards': { id: 'Menuju:', en: 'Towards:' },
      'no_nav_text': { id: 'Teks navigasi tidak tersedia.', en: 'Navigation text is not available.' },
      'edit': { id: 'Edit', en: 'Edit' },
      'confirm_logout': { id: 'Konfirmasi Logout', en: 'Confirm Logout' },
      'are_you_sure_logout': { id: 'Apakah Anda yakin ingin logout?', en: 'Are you sure you want to logout?' },
      'no': { id: 'Tidak', en: 'No' },
      'yes': { id: 'Iya', en: 'Yes' },
      'back_to_main_floor': { id: 'Kembali ke Lantai Utama', en: 'Back to Main Floor' }
    };
    return dict[key] ? dict[key][language] : key;
  };

  const toggleLanguage = () => {
    const newLang = language === 'id' ? 'en' : 'id';
    setLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  useEffect(() => {
    // 1. Listen ke Kiosks
    const unsubscribeKiosks = onSnapshot(collection(db, "Kiosks"), (kioskSnap) => {
      const loadedKiosks = [];
      const foundFloors = new Set(["Lantai 1"]);

      kioskSnap.forEach((docSnap) => {
        const data = docSnap.data();
        loadedKiosks.push({ id: docSnap.id, ...data });
        if (data.floor) foundFloors.add(data.floor);
      });
      setKiosks(loadedKiosks);
      
      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort();
      });
    });

    // 2. Listen ke Rooms
    const unsubscribeRooms = onSnapshot(collection(db, "Rooms"), (roomSnap) => {
      const foundFloors = new Set();
      const loadedRooms = [];

      roomSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.floor) foundFloors.add(data.floor);
        if (data.name && data.name !== "Tanpa Nama") {
          loadedRooms.push({ id: docSnap.id, name: data.name, floor: data.floor || "Lantai 1" });
        }
      });

      loadedRooms.sort((a, b) => a.name.localeCompare(b.name));
      setRooms(loadedRooms);

      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort();
      });
    });

    return () => {
      unsubscribeKiosks();
      unsubscribeRooms();
    };
  }, []);

  const activePath = useMemo(() => {
    if (activeStepIndex === -1 || !navigationSteps.length || !pathData.length) return null;
    const startIndex = activeStepIndex === 0 ? 0 : navigationSteps[activeStepIndex - 1].index_akhir;
    const endIndex = navigationSteps[activeStepIndex].index_akhir;
    return pathData.slice(startIndex, endIndex + 1);
  }, [pathData, navigationSteps, activeStepIndex]);

  const speakSteps = (langkahNavigasi) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      langkahNavigasi.forEach((step, index) => {
        const utterance = new SpeechSynthesisUtterance(step.teks);
        utterance.lang = language === 'en' ? 'en-US' : 'id-ID';
        utterance.rate = 1.15;
        utterance.onstart = () => {
          setActiveStepIndex(index);
          if (step.floor) {
            setFloor(step.floor);
          }
        };

        // Reset setelah langkah terakhir selesai dibacakan + 3 detik
        if (index === langkahNavigasi.length - 1) {
          utterance.onend = () => {
            setTimeout(() => {
              setSearch("");
              setOutputText("");
              setLocation("");
              setFloor("Lantai 1");
              setPathData([]);
              setNavigationSteps([]);
              setActiveStepIndex(-1);
              setTargetRoomName("");
            }, 10000);
          };
        }

        window.speechSynthesis.speak(utterance);
      });
    }
  };

  const executeSearch = async (overrideLocation, overrideTarget) => {
    const searchLocation = typeof overrideLocation === 'string' ? overrideLocation : location;
    const searchTarget = typeof overrideTarget === 'string' ? overrideTarget : search;
    
    if (!searchTarget.trim()) return;
    
    if (!searchLocation) {
      setOutputText(getText('fail_kiosk_first'));
      return;
    }

    setOutputText(getText('searching'));
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          start_node_id: searchLocation,
          teks_pencarian: searchTarget.trim(),
          language: language
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setOutputText(`${getText('failed')} ${data.detail || "Terjadi kesalahan"}`);
        setPathData([]);
        setNavigationSteps([]);
        setActiveStepIndex(-1);
      } else {
        const roomName = translateName(data.data_target.nama_ruangan, language);
        setTargetRoomName(roomName);
        setPathData(data.jalur_koordinat);
        setNavigationSteps(data.langkah_navigasi);
        setActiveStepIndex(0);
        
        let allText = getText('no_nav_text');
        if (data.langkah_navigasi && data.langkah_navigasi.length > 0) {
            allText = data.langkah_navigasi.map(l => l.teks).join("\n\n");
            const finalText = `${getText('route_found')}\n${getText('towards')} ${roomName}\n\n${allText}`;
            setOutputText(finalText);
            speakSteps(data.langkah_navigasi);
        } else {
            const fallbackText = `${getText('route_found')} ${getText('towards')} ${roomName}`;
            setOutputText(fallbackText);
            
            if (data.jalur_koordinat && data.jalur_koordinat.length > 0 && data.jalur_koordinat[0].floor) {
                setFloor(data.jalur_koordinat[0].floor);
            }
            
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(fallbackText);
              utterance.lang = language === 'en' ? 'en-US' : 'id-ID';
              utterance.rate = 1.15;
              window.speechSynthesis.speak(utterance);
            }
        }
      }
    } catch (error) {
      setOutputText(`Error: Tidak dapat terhubung ke server (${error.message})`);
      setPathData([]);
    }
  };

  const handleSearchKey = (e) => {
    if (e.key === "Enter") {
      executeSearch(location, search);
    }
  };

  const openLogoutConfirm = () => setIsConfirmOpen(true);
  const handleLogoutYes = () => {
    setIsConfirmOpen(false);
    navigate("/");
  };
  const handleLogoutNo = () => setIsConfirmOpen(false);

  return (
    <div>
      <header className="header">
        <span className="header-logo">Wayfinder</span>
        <div className="header-actions" style={{display: "flex", gap: "10px", alignItems: "center"}}>
          <button 
            onClick={toggleLanguage} 
            style={{background: "transparent", border: "1px solid white", color: "white", padding: "5px 10px", borderRadius: "5px", cursor: "pointer", fontWeight: "bold"}}
          >
            {language === 'id' ? '🇮🇩 ID' : '🇬🇧 EN'}
          </button>
          <button className="header-edit-btn" onClick={() => navigate("/edit")}>
            <EditIcon />
            {getText('edit')}
          </button>
          <button className="header-login-btn" onClick={openLogoutConfirm}>
            <LoginIcon />
            {getText('logout')}
          </button>
        </div>
      </header>

      {isConfirmOpen && (
        <div className="modal-overlay" onClick={handleLogoutNo}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{getText('confirm_logout')}</h3>
            <p>{getText('are_you_sure_logout')}</p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn no" onClick={handleLogoutNo}>{getText('no')}</button>
              <button className="confirm-btn yes" onClick={handleLogoutYes}>{getText('yes')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="main-layout">
        <aside className="left-panel">
          <div className="search-wrapper">
            <input
              className="search-input"
              type="text"
              placeholder={getText('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
            />
            <div style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => executeSearch(location, search)}>
              <SearchIcon />
            </div>
          </div>

          <textarea
            className="destination-output"
            placeholder={getText('output_placeholder')}
            value={outputText}
            readOnly
            style={{ minHeight: "100px" }}
          />

          {/* KIOSK DROPDOWN */}
          <div className="dropdown-wrapper">
            <select
              className="dropdown-select"
              value={location}
              onChange={(e) => {
                const newLocation = e.target.value;
                setLocation(newLocation);
                if (search.trim()) {
                  executeSearch(newLocation, search);
                }
              }}
            >
              <option value="" disabled>{getText('select_kiosk')}</option>
              {kiosks.map((kiosk) => (
                <option key={kiosk.id} value={kiosk.id}>
                  {translateName(kiosk.name || kiosk.id, language)}
                </option>
              ))}
            </select>
            <ChevronIcon />
          </div>

          {/* RUANGAN DROPDOWN (BARU) */}
          <div className="dropdown-wrapper" style={{ marginTop: "12px" }}>
            <select
              className="dropdown-select"
              value={(() => {
                const matchedRoom = rooms.find(r => r.name === search || translateName(r.name, language) === search);
                return matchedRoom ? matchedRoom.name : "";
              })()}
              onChange={(e) => {
                const rawName = e.target.value;
                const translatedName = translateName(rawName, language);
                setSearch(translatedName); 
                executeSearch(location, rawName);
              }}
            >
              <option value="" disabled>{getText('select_room')}</option>
              {floors.filter(f => !f.startsWith("submap_")).map((floorName) => (
                <optgroup key={floorName} label={translateName(floorName, language)}>
                  {rooms
                    .filter(room => room.floor === floorName || room.floor.startsWith(`submap_${rooms.find(r=>r.name===room.name)?.id}`))
                    .map((room) => (
                    <option key={room.id} value={room.name}>{translateName(room.name, language)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronIcon />
          </div>

          <div className="floor-group">
            <div className="dropdown-wrapper">
              <select
                className="dropdown-select"
                value={(() => {
                  if (floor.startsWith("submap_")) {
                    const parentId = floor.replace("submap_", "");
                    const parent = rooms.find(r => r.id === parentId);
                    return parent ? parent.floor : "Lantai 1";
                  }
                  return floor;
                })()}
                onChange={(e) => setFloor(e.target.value)}
              >
                <option value="" disabled>{getText('select_floor')}</option>
                {floors.filter(f => !f.startsWith("submap_")).map((f) => (
                  <option key={f} value={f}>{translateName(f, language)}</option>
                ))}
              </select>
              <ChevronIcon />
            </div>
            {floor && (
              <div className="floor-selected-chip">
                {(() => {
                  let dFloor = floor;
                  if (floor.startsWith("submap_")) {
                    const parentId = floor.replace("submap_", "");
                    const parent = rooms.find(r => r.id === parentId);
                    dFloor = parent ? parent.floor : "Lantai 1";
                  }
                  return translateName(dFloor, language);
                })()}
              </div>
            )}
          </div>
        </aside>
        
        <main className="map-panel" style={{ position: "relative" }}>
          {floor.startsWith("submap_") && (
              <button 
                  onClick={() => {
                      const parentRoomId = floor.replace("submap_", "");
                      const parentRoom = rooms.find(r => r.id === parentRoomId);
                      setFloor(parentRoom?.floor || "Lantai 1");
                  }}
                  style={{ position: "absolute", top: "20px", left: "20px", zIndex: 100, padding: "10px 20px", background: "#1A73C8", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
              >
                  {getText('back_to_main_floor')}
              </button>
          )}
          <TransformWrapper initialScale={1} minScale={0.05} maxScale={10} centerOnInit={true} limitToBounds={false} wheel={{ step: 0.015 }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", cursor: "grab" }} contentStyle={{ width: "100%", height: "100vh" }}>
              <div className="map-content" style={{ width: "100%", height: "100%" }}>
                <SharedMap 
                  path={pathData} 
                  activePath={null}
                  currentFloor={floor} 
                  language={language}
                  onRoomClick={(room) => {
                      if (floors.includes(`submap_${room.id}`)) {
                          setFloor(`submap_${room.id}`);
                      }
                  }}
                />
              </div>
            </TransformComponent>
          </TransformWrapper>
        </main>
      </div>
    </div>
  );
}