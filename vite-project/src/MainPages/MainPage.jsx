import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import SharedMap from "../components/SharedMap";
import { translateName } from "../utils/translator";
import { QRCodeCanvas } from "qrcode.react";
import "./Main.css";

// ── Icon components ──
const SearchIcon = () => (
  <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const MicIcon = ({ isListening }) => (
  <svg className={`mic-icon ${isListening ? "pulsing-mic" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
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
  
  // ── STATE KIOSK LOCK ──
  const [location,    setLocation]    = useState(localStorage.getItem("locked_kiosk_id") || ""); 
  const [isKioskLocked, setIsKioskLocked] = useState(!!localStorage.getItem("locked_kiosk_id"));

  const [isMobileMode, setIsMobileMode] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const [floor,       setFloor]       = useState("Lantai 1"); 
  const [floors,      setFloors]      = useState(["Lantai 1"]); 
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [kiosks,      setKiosks]      = useState([]);
  const [rooms,       setRooms]       = useState([]); 
  const [pathData,    setPathData]    = useState([]);
  const [targetRoomName, setTargetRoomName] = useState("");
  const [navigationSteps, setNavigationSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'id');
  const [isNavFinished, setIsNavFinished] = useState(false);
  const [countdownValue, setCountdownValue] = useState(10);
  const [serverIp, setServerIp] = useState("");
  const [customQrHost, setCustomQrHost] = useState("");
  const [isListening, setIsListening] = useState(false);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(language === 'en' ? "Microphone not supported in this browser." : "Mikrofon tidak didukung di browser ini.");
      return;
    }

    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'en' ? 'en-US' : 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSearch(transcript);
      executeSearch(location, transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const getText = (key) => {
    const dict = {
      'login': { id: 'Masuk', en: 'Login' },
      'search_placeholder': { id: 'Cari nama poli atau keluhan Anda...', en: 'Search for a clinic or your symptoms...' },
      'output_placeholder': { id: 'Keterangan rute akan muncul di sini', en: 'Destination output text will appear here' },
      'select_kiosk': { id: 'Pilih Kiosk Awal', en: 'Select Start Kiosk' },
      'select_room': { id: 'Pilih Ruangan Tujuan', en: 'Select Destination Room' },
      'select_floor': { id: 'Pilih Lantai', en: 'Select Floor' },
      'you_are_here': { id: '📍 Anda berada di:', en: '📍 You are at:' },
      'fail_kiosk_first': { id: 'Silakan pilih Kiosk awal terlebih dahulu.', en: 'Please select a starting Kiosk first.' },
      'searching': { id: 'Mencari rute...', en: 'Searching for route...' },
      'failed': { id: 'Gagal:', en: 'Failed:' },
      'route_found': { id: 'Rute ditemukan!', en: 'Route found!' },
      'towards': { id: 'Menuju:', en: 'Towards:' },
      'no_nav_text': { id: 'Teks navigasi tidak tersedia.', en: 'Navigation text is not available.' },
      'admin_login_title': { id: 'HALAMAN LOGIN ADMIN', en: 'ADMIN LOGIN PAGE' },
      'username': { id: 'Nama Pengguna', en: 'Username' },
      'password': { id: 'Kata Sandi', en: 'Password' },
      'login_btn': { id: 'MASUK', en: 'LOGIN' }
    };
    return dict[key] ? dict[key][language] : key;
  };

  const toggleLanguage = () => {
    const newLang = language === 'id' ? 'en' : 'id';
    setLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  // ── FITUR LOCK DEVICE & MOBILE HANDOFF ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lockId = params.get("set_kiosk");
    const unlock = params.get("unlock_kiosk");
    
    // Mobile Handoff Params
    const start = params.get("start");
    const end = params.get("end");
    const mobile = params.get("mobile");

    if (mobile === "true" && start && end) {
      setIsMobileMode(true);
      setLocation(start);
      setSearch(end);
      // Auto-trigger search
      executeSearch(start, end);
    }

    if (lockId) {
      localStorage.setItem("locked_kiosk_id", lockId);
      setLocation(lockId);
      if (language === 'en') {
        alert(`This device is now permanently locked as Kiosk: ${lockId}`);
      } else {
        alert(`Perangkat ini berhasil dikunci permanen sebagai Kiosk: ${lockId}`);
      }
      window.history.replaceState(null, "", window.location.pathname);
    } else if (unlock === "true") {
      localStorage.removeItem("locked_kiosk_id");
      setLocation("");
      setIsKioskLocked(false);
      if (language === 'en') {
        alert("Kiosk mode released. Device is back to normal mode.");
      } else {
        alert("Mode Kiosk dilepas. Perangkat kembali ke mode normal.");
      }
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [language]);

  const hasAutoSwitchedFloor = useRef(false);

  useEffect(() => {
    // 1. Listen ke Kiosks
    const unsubscribeKiosks = onSnapshot(collection(db, "Kiosks"), (kioskSnap) => {
      const loadedKiosks = [];
      const foundFloors = new Set(["Lantai 1"]);

      let floorToSwitch = null;

      kioskSnap.forEach((docSnap) => {
        const data = docSnap.data();
        loadedKiosks.push({ id: docSnap.id, ...data });
        if (data.floor) foundFloors.add(data.floor);
        
        const lockedId = localStorage.getItem("locked_kiosk_id");
        if (lockedId && docSnap.id === lockedId && data.floor) {
          floorToSwitch = data.floor;
        }
      });
      setKiosks(loadedKiosks);
      
      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort();
      });

      if (floorToSwitch && !hasAutoSwitchedFloor.current) {
        setFloor(floorToSwitch);
        hasAutoSwitchedFloor.current = true;
      }
    });

    // 2. Listen ke Rooms
    const unsubscribeRooms = onSnapshot(collection(db, "Rooms"), (roomSnap) => {
      const foundFloors = new Set();
      const loadedRooms = [];

      roomSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.floor) foundFloors.add(data.floor);
        // Hanya masukkan ruangan yang sudah diberi nama ke dalam dropdown
        if (data.name && data.name !== "Tanpa Nama" && data.name.toLowerCase() !== "pintu masuk") {
          loadedRooms.push({ id: docSnap.id, name: data.name, floor: data.floor || "Lantai 1" });
        }
      });

      // Urutkan ruangan berdasarkan abjad (A-Z) agar rapi
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

  const isMountedRef = useRef(true);
  const resetTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    let timeoutId;
    const fetchIp = () => {
      fetch("/api/ip")
        .then(res => res.json())
        .then(data => {
           setServerIp(data.ip);
           setCustomQrHost(data.ip);
        })
        .catch(err => {
           console.error("Gagal mendapatkan IP server, mencoba lagi...", err);
           timeoutId = setTimeout(fetchIp, 2000);
        });
    };
    fetchIp();

    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.utterances = [];
      }
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const speakSteps = (langkahNavigasi) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.utterances = []; // HACK: Mencegah Garbage Collection di browser Mobile

      const playNext = (index) => {
        if (!isMountedRef.current) return;
        if (index >= langkahNavigasi.length) return;
        
        const step = langkahNavigasi[index];
        const utterance = new SpeechSynthesisUtterance(step.teks);
        window.utterances.push(utterance);
        
        utterance.lang = language === 'en' ? 'en-US' : 'id-ID';
        utterance.rate = 1.15;
        
        utterance.onstart = () => {
          setActiveStepIndex(index);
          if (step.floor) {
            setFloor(step.floor);
          }
        };
        
        utterance.onend = () => {
          if (index === langkahNavigasi.length - 1) {
            setIsNavFinished(true);
            setCountdownValue(10);
            
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = setInterval(() => {
              setCountdownValue(prev => prev > 0 ? prev - 1 : 0);
            }, 1000);

            // Reset setelah langkah terakhir selesai dibacakan + 10 detik
            resetTimeoutRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              setSearch("");
              setOutputText("");
              
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              
              if (!isKioskLocked) {
                setLocation("");
              }
              
              setFloor("Lantai 1");
              setPathData([]);
              setNavigationSteps([]);
              setActiveStepIndex(-1);
              setTargetRoomName("");
              setIsNavFinished(false);
            }, 10000);
          } else {
            playNext(index + 1); // Panggil urutan selanjutnya hanya setelah yang ini selesai
          }
        };

        window.speechSynthesis.speak(utterance);
      };

      playNext(0);
    }
  };

  const executeSearch = async (overrideLocation, overrideTarget) => {
    const searchLocation = typeof overrideLocation === 'string' ? overrideLocation : location;
    const searchTarget = typeof overrideTarget === 'string' ? overrideTarget : search;
    
    if (!searchTarget.trim()) return;
    
    setIsNavFinished(false);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // HACK MOBILE: Pancing engine suara dengan audio kosong secara sinkron dengan klik tombol
    if ('speechSynthesis' in window) {
       const silentUtterance = new SpeechSynthesisUtterance('');
       silentUtterance.volume = 0;
       window.speechSynthesis.speak(silentUtterance);
    }
    
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
      
      const textResponse = await response.text();
      
      let data;
      try {
          // Baru coba ubah teks tersebut ke JSON
          data = JSON.parse(textResponse);
      } catch (parseError) {
          // Jika gagal, berarti Python mengirim error atau blank. Tampilkan aslinya!
          console.error("Server tidak mengembalikan JSON yang valid:", textResponse);
          throw new Error(`Server Backend Crash/Mati. Cek terminal Python! Respons: ${textResponse.substring(0, 50)}`);
      }
      
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
            
            const isMob = new URLSearchParams(window.location.search).get("mobile") === "true";
            if (isMob) {
                if (data.langkah_navigasi[0].floor) setFloor(data.langkah_navigasi[0].floor);
            } else {
                speakSteps(data.langkah_navigasi);
            }
        } else {
            const fallbackText = `${getText('route_found')} ${getText('towards')} ${roomName}`;
            setOutputText(fallbackText);
            
            if (data.jalur_koordinat && data.jalur_koordinat.length > 0 && data.jalur_koordinat[0].floor) {
                setFloor(data.jalur_koordinat[0].floor);
            }
            
            const isMob = new URLSearchParams(window.location.search).get("mobile") === "true";
            if ('speechSynthesis' in window && !isMob) {
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

  const activePath = useMemo(() => {
    if (activeStepIndex === -1 || !navigationSteps.length || !pathData.length) return null;
    const startIndex = activeStepIndex === 0 ? 0 : navigationSteps[activeStepIndex - 1].index_akhir;
    const endIndex = navigationSteps[activeStepIndex].index_akhir;
    return pathData.slice(startIndex, endIndex + 1);
  }, [pathData, navigationSteps, activeStepIndex]);

  const handleSearchKey = (e) => {
    if (e.key === "Enter") {
      executeSearch(location, search);
    }
  };

  const handleLogin = () => {
    if (username.trim() && password.trim()) {
      setIsLoginOpen(false);
      setUsername("");
      setPassword("");
      navigate("/admin");
    }
  };

  return (
    <div>
      {!isMobileMode && (
        <header className="header">
          <span className="header-logo">Wayfinder</span>
          <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
            <button 
              onClick={toggleLanguage} 
              style={{background: "transparent", border: "1px solid white", color: "white", padding: "5px 10px", borderRadius: "5px", cursor: "pointer", fontWeight: "bold"}}
            >
              {language === 'id' ? '🇮🇩 ID' : '🇬🇧 EN'}
            </button>
            <button className="header-login-btn Onclick" onClick={() => setIsLoginOpen(true)}>
              <LoginIcon />
              <span>{getText('login')}</span>
            </button>
          </div>
        </header>
      )}

      {isLoginOpen && (
        <div className="modal-overlay" onClick={() => setIsLoginOpen(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setIsLoginOpen(false)}>×</button>
            <h2>{getText('admin_login_title')}</h2>
            <div className="input-group">
              <label>{getText('username')}</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            </div>
            <div className="input-group">
              <label>{getText('password')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            </div>
            <button className="submit-login-btn" onClick={handleLogin}>{getText('login_btn')}</button>
          </div>
        </div>
      )}

      {isQrModalOpen && (
        <div className="modal-overlay" onClick={() => setIsQrModalOpen(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", width: "300px" }}>
            <button className="close-btn" onClick={() => setIsQrModalOpen(false)}>×</button>
            <h2 style={{ fontSize: "16px", marginBottom: "20px" }}>Scan & Go (Satu WiFi)</h2>
            <div style={{ background: "white", padding: "16px", borderRadius: "10px", display: "inline-block" }}>
              <QRCodeCanvas 
                value={(() => {
                  const host = customQrHost || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? serverIp : window.location.hostname);
                  const port = window.location.port ? `:${window.location.port}` : "";
                  return `${window.location.protocol}//${host}${port}/?start=${encodeURIComponent(location)}&end=${encodeURIComponent(search)}&mobile=true`;
                })()}
                size={200} 
              />
            </div>
            <p style={{ marginTop: "20px", fontSize: "13px", color: "var(--text-muted)" }}>
              Pindai menggunakan kamera HP Anda. Pastikan HP dan Kiosk terhubung ke WiFi yang sama.
            </p>
          </div>
        </div>
      )}

      <div className={`main-layout ${isMobileMode ? 'mobile-mode' : ''}`}>
        <aside className={`left-panel ${isMobileMode ? 'mobile-panel' : ''}`}>
          
          {!isMobileMode && (
            <>
              <div className="search-wrapper">
                <input
                  className="search-input"
                  type="text"
                  placeholder={getText('search_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKey}
                />
                 <div className="mic-btn-wrapper" onClick={startListening} title={language === 'en' ? 'Voice Search' : 'Pencarian Suara'}>
                  <MicIcon isListening={isListening} />
                </div>
                <div className="search-btn-wrapper" onClick={() => executeSearch(location, search)}>
                  <SearchIcon />
                </div>
              </div>

              {/* KIOSK DROPDOWN ATAU LOCKED KIOSK INFO */}
              {isKioskLocked ? (
                <div className="dropdown-wrapper" style={{ padding: "12px", background: "#e3f2fd", borderRadius: "8px", border: "1px solid #bbdefb", color: "#0d47a1", fontWeight: "bold", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {getText('you_are_here')} {kiosks.find(k => k.id === location)?.name || location}
                </div>
              ) : (
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
              )}

              {/* RUANGAN DROPDOWN */}
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
            </>
          )}

          {/* DYNAMIC NAVIGATION TEXT BOX */}
          {(outputText || navigationSteps.length > 0) && (
            <div className={`destination-output-dynamic ${isMobileMode ? 'mobile-nav-box' : ''}`}>
              {navigationSteps.length > 0 ? (
                <>
                  <div className="nav-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{getText('route_found')} {getText('towards')} {targetRoomName}</span>
                  </div>
                  {navigationSteps.map((step, idx) => (
                    <div 
                      key={idx} 
                      className={`nav-step ${activeStepIndex === idx ? 'active-step' : ''}`}
                      style={{ display: isMobileMode ? (activeStepIndex === idx ? 'block' : 'none') : 'block' }}
                      ref={(!isMobileMode && activeStepIndex === idx) ? (el) => el && el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) : null}
                    >
                      {step.teks}
                    </div>
                  ))}
                  
                  {isMobileMode && navigationSteps.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
                      <button 
                        onClick={() => {
                          const newIdx = Math.max(0, activeStepIndex - 1);
                          setActiveStepIndex(newIdx);
                          if (navigationSteps[newIdx]?.floor) setFloor(navigationSteps[newIdx].floor);
                        }}
                        disabled={activeStepIndex === 0}
                        style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', background: activeStepIndex === 0 ? '#ccc' : 'var(--blue-primary)', color: 'white', fontWeight: 'bold' }}
                      >
                        {language === 'en' ? 'Prev' : 'Mundur'}
                      </button>
                      <span style={{ alignSelf: 'center', fontWeight: 'bold', color: 'var(--blue-primary)' }}>
                        {activeStepIndex + 1} / {navigationSteps.length}
                      </span>
                      <button 
                        onClick={() => {
                          const newIdx = Math.min(navigationSteps.length - 1, activeStepIndex + 1);
                          setActiveStepIndex(newIdx);
                          if (navigationSteps[newIdx]?.floor) setFloor(navigationSteps[newIdx].floor);
                        }}
                        disabled={activeStepIndex === navigationSteps.length - 1}
                        style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', background: activeStepIndex === navigationSteps.length - 1 ? '#ccc' : 'var(--blue-primary)', color: 'white', fontWeight: 'bold' }}
                      >
                        {language === 'en' ? 'Next' : 'Maju'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="nav-step">{outputText}</div>
              )}
            </div>
          )}

          {isNavFinished && (
             <div style={{ marginTop: "10px", padding: "10px", background: "#fff3cd", color: "#856404", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", textAlign: "center", border: "1px solid #ffeeba" }}>
                {language === 'en' 
                  ? `Navigation complete. The screen will reset in ${countdownValue} seconds.` 
                  : `Navigasi selesai. Layar akan di-reset dalam ${countdownValue} detik.`}
             </div>
          )}

          {!isMobileMode && navigationSteps.length > 0 && (
            <button 
              className="show-qr-btn"
              onClick={() => setIsQrModalOpen(true)}
              style={{ marginTop: "15px" }}
            >
              📱 Tampilkan QR Code Navigasi
            </button>
          )}

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
                  Kembali ke Lantai Utama
              </button>
          )}
          <TransformWrapper initialScale={1} minScale={0.05} maxScale={10} centerOnInit={true} limitToBounds={false} wheel={{ step: 0.015 }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", cursor: "grab" }} contentStyle={{ width: "100%", height: "100vh" }}>
              <div className="map-content" style={{ width: "100%", height: "100%" }}>
                <SharedMap 
                  path={pathData} 
                  activePath={activePath} 
                  currentFloor={floor} 
                  language={language}
                  onRoomClick={(room) => {
                      if (floors.includes(`submap_${room.id}`)) {
                          setFloor(`submap_${room.id}`);
                      }
                  }}
                  showGrid={false}
                  showBorder={true}
                />
              </div>
            </TransformComponent>
          </TransformWrapper>
        </main>
      </div>
    </div>
  );
}