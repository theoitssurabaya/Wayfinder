import { useState, useEffect, useMemo, useRef } from "react";
import LogoImg from '../assets/Logo.png';
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { collection, onSnapshot, doc } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "../firebase";
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

const TargetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="3"></circle>
    <line x1="12" y1="2" x2="12" y2="4"></line>
    <line x1="12" y1="20" x2="12" y2="22"></line>
    <line x1="2" y1="12" x2="4" y2="12"></line>
    <line x1="20" y1="12" x2="22" y2="12"></line>
  </svg>
);

const PinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"></path>
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
  const [search, setSearch] = useState("");
  const [outputText, setOutputText] = useState("");

  // ── STATE KIOSK LOCK ──
  const [location, setLocation] = useState(localStorage.getItem("locked_kiosk_id") || "");
  const [isKioskLocked, setIsKioskLocked] = useState(!!localStorage.getItem("locked_kiosk_id"));

  const [isMobileMode, setIsMobileMode] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const [floor, setFloor] = useState("Lantai 1");
  const [floors, setFloors] = useState(["Lantai 1"]);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [kiosks, setKiosks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [pathData, setPathData] = useState([]);
  const [targetRoomName, setTargetRoomName] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  const [navigationSteps, setNavigationSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'id');
  const [isNavFinished, setIsNavFinished] = useState(false);
  const [countdownValue, setCountdownValue] = useState(10);
  const [serverIp, setServerIp] = useState("");
  const [customQrHost, setCustomQrHost] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
  }, [isDarkMode]);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(language === 'en' ? "Microphone not supported in this browser." : "Mikrofon tidak didukung di browser ini.");
      return;
    }

    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'en' ? 'en-US' : 'id-ID';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setSearch("");
      latestTranscriptRef.current = "";
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      latestTranscriptRef.current = transcript;
      setSearch(transcript);

      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

      silenceTimeoutRef.current = setTimeout(() => {
        silenceTimeoutRef.current = null;
        recognition.stop();
        if (latestTranscriptRef.current.trim()) {
          executeSearch(location, latestTranscriptRef.current);
          latestTranscriptRef.current = "";
        }
      }, 3000);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      latestTranscriptRef.current = "";
    };

    recognition.onend = () => {
      setIsListening(false);
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
        if (latestTranscriptRef.current.trim()) {
          executeSearch(location, latestTranscriptRef.current);
          latestTranscriptRef.current = "";
        }
      }
    };

    recognition.start();
  };

  const getText = (key) => {
    const dict = {
      'login': { id: 'Masuk', en: 'Login' },
      'search_placeholder': { id: 'Cari poli atau keluhan...', en: 'Search clinic or symptoms...' },
      'output_placeholder': { id: 'Keterangan rute akan muncul di sini', en: 'Destination output text will appear here' },
      'select_kiosk': { id: 'Pilih Kios Awal', en: 'Select Start Kiosk' },
      'select_room': { id: 'Pilih Ruangan Tujuan', en: 'Select Destination Room' },
      'select_floor': { id: 'Pilih Lantai', en: 'Select Floor' },
      'you_are_here': { id: '📍 Anda berada di:', en: '📍 You are at:' },
      'fail_kiosk_first': { id: 'Silakan pilih Kios awal terlebih dahulu.', en: 'Please select a starting Kiosk first.' },
      'searching': { id: 'Mencari rute...', en: 'Searching for route...' },
      'failed': { id: 'Gagal:', en: 'Failed:' },
      'route_found': { id: 'Rute ditemukan!', en: 'Route found!' },
      'towards': { id: 'Menuju:', en: 'Towards:' },
      'no_nav_text': { id: 'Teks navigasi tidak tersedia.', en: 'Navigation text is not available.' },
      'admin_login_title': { id: 'HALAMAN LOGIN ADMIN', en: 'ADMIN LOGIN PAGE' },
      'username': { id: 'Email Pengguna', en: 'Email' },
      'password': { id: 'Kata Sandi', en: 'Password' },
      'login_btn': { id: 'MASUK', en: 'LOGIN' }
    };
    return dict[key] ? dict[key][language] : key;
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    localStorage.setItem('language', newLang);

    const translatedSearch = search ? translateName(search, newLang) : search;
    if (search) setSearch(translatedSearch);
    if (targetRoomName) setTargetRoomName(translateName(targetRoomName, newLang));

    if (navigationSteps.length > 0 && !isNavFinished) {
      executeSearch(location, translatedSearch, newLang, activeStepIndex >= 0 ? activeStepIndex : 0);
    } else if (outputText) {
      setOutputText(""); // Clear stale output text
    }
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
    const expires = params.get("expires");

    if (mobile === "true" && start && end) {
      if (expires && Date.now() > parseInt(expires, 10)) {
        setIsSessionExpired(true);
        return;
      }
      setIsMobileMode(true);
      setLocation(start);
      setSearch(end);
      // Auto-trigger search
      executeSearch(start, end);
    }

    if (lockId) {
      localStorage.setItem("locked_kiosk_id", lockId);
      setLocation(lockId);
      setIsKioskLocked(true);
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
  const floorOrderRef = useRef([]);

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
        return Array.from(combined).sort((a, b) => {
          const idxA = floorOrderRef.current.indexOf(a);
          const idxB = floorOrderRef.current.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });
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
          loadedRooms.push({ id: docSnap.id, name: data.name, name_en: data.name_en, floor: data.floor || "Lantai 1" });
        }
      });

      // Urutkan ruangan berdasarkan abjad (A-Z) agar rapi
      loadedRooms.sort((a, b) => a.name.localeCompare(b.name));
      setRooms(loadedRooms);

      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort((a, b) => {
          const idxA = floorOrderRef.current.indexOf(a);
          const idxB = floorOrderRef.current.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });
      });
    });

    // 3. Listen ke MapConfig untuk urutan lantai
    const unsubscribeConfig = onSnapshot(doc(db, "Settings", "MapConfig"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().floorOrder) {
        floorOrderRef.current = docSnap.data().floorOrder;
        setFloors(prev => {
          return [...prev].sort((a, b) => {
            const idxA = floorOrderRef.current.indexOf(a);
            const idxB = floorOrderRef.current.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
          });
        });
      }
    });

    return () => {
      unsubscribeKiosks();
      unsubscribeRooms();
      unsubscribeConfig();
    };
  }, []);

  const isMountedRef = useRef(true);
  const resetTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const latestTranscriptRef = useRef("");

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
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const speakSteps = (langkahNavigasi, startIndex = 0, currentLang = language) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.utterances = []; // HACK: Mencegah Garbage Collection di browser Mobile

      const playNext = (index) => {
        if (!isMountedRef.current) return;
        if (index >= langkahNavigasi.length) return;

        const step = langkahNavigasi[index];
        const utterance = new SpeechSynthesisUtterance(step.teks);
        window.utterances.push(utterance);

        utterance.lang = currentLang === 'en' ? 'en-US' : 'id-ID';
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

      playNext(startIndex);
    }
  };

  const executeSearch = async (overrideLocation, overrideTarget, overrideLang, resumeStepIndex = 0) => {
    const searchLocation = typeof overrideLocation === 'string' ? overrideLocation : location;
    const searchTarget = typeof overrideTarget === 'string' ? overrideTarget : search;
    const currentLang = overrideLang || language;

    if (!searchTarget.trim()) return;

    setIsNavFinished(false);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);

    // HACK MOBILE: Pancing engine suara dengan audio kosong secara sinkron dengan klik tombol
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
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
          language: currentLang,
          current_floor: floor
        })
      });

      const textResponse = await response.text();

      let data;
      try {
        // Baru coba ubah teks tersebut ke JSON
        data = JSON.parse(textResponse);
      } catch {
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
        const roomName = translateName(data.data_target.nama_ruangan, currentLang, data.data_target.nama_ruangan_en);
        setTargetRoomName(roomName);
        setSearch(roomName); // Update dropdown to show the translated room name
        setPathData(data.jalur_koordinat);
        setNavigationSteps(data.langkah_navigasi);
        setActiveStepIndex(resumeStepIndex);

        let allText = getText('no_nav_text');
        if (data.langkah_navigasi && data.langkah_navigasi.length > 0) {
          allText = data.langkah_navigasi.map(l => l.teks).join("\n\n");
          const finalText = `${getText('route_found')}\n${getText('towards')} ${roomName}\n\n${allText}`;
          setOutputText(finalText);

          const isMob = new URLSearchParams(window.location.search).get("mobile") === "true";
          if (isMob) {
            if (data.langkah_navigasi[0].floor) setFloor(data.langkah_navigasi[0].floor);
          } else {
            speakSteps(data.langkah_navigasi, resumeStepIndex, currentLang);
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

  const handleLogin = async () => {
    const u = username.trim();
    const p = password.trim();
    try {
      await signInWithEmailAndPassword(auth, u, p);
      setIsLoginOpen(false);
      setUsername("");
      setPassword("");
      setErrorMsg("");
      navigate("/admin", { state: { authorized: true } });
    } catch {
      setErrorMsg("Akun tidak valid, silahkan coba lagi!");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  if (isSessionExpired) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text-main)', textAlign: 'center', padding: '20px' }}>
        <h1 style={{ fontSize: '24px', color: '#e74c3c' }}>Sesi Navigasi Berakhir</h1>
        <p style={{ marginTop: '10px', fontSize: '16px', maxWidth: '400px', lineHeight: '1.5' }}>
          Tautan rute ini sudah kedaluwarsa. Silakan pindai ulang QR Code dari Kiosk terdekat jika Anda membutuhkan panduan lagi.
        </p>
      </div>
    );
  }

  return (
    <div>
      {!isMobileMode && (
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={LogoImg} alt="Wayfinder Logo" style={{ height: '35px', width: 'auto', filter: isDarkMode ? "brightness(0.1)" : "none" }} />
            <span className="header-logo">Wayfinder</span>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <label className="theme-switch" title={isDarkMode ? "Light Mode" : "Dark Mode"}>
              <input
                type="checkbox"
                checked={isDarkMode}
                onChange={() => {
                  const newMode = !isDarkMode;
                  setIsDarkMode(newMode);
                  localStorage.setItem('theme', newMode ? 'dark' : 'light');
                }}
              />
              <span className="slider">
                <span className="slider-icon">🌙</span>
                <span className="slider-icon">☀️</span>
              </span>
            </label>
            <select
              value={language}
              onChange={handleLanguageChange}
              style={{ background: "transparent", border: "1px solid white", color: "white", padding: "5px 10px", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", outline: "none" }}
            >
              <option value="id" style={{ color: "black" }}>🇮🇩 ID</option>
              <option value="en" style={{ color: "black" }}>🇬🇧 EN</option>
            </select>
            <button className="header-login-btn Onclick" onClick={() => { setIsLoginOpen(true); setErrorMsg(""); setUsername(""); setPassword(""); }}>
              <LoginIcon />
              <span>{getText('login')}</span>
            </button>
          </div>
        </header>
      )}

      {isLoginOpen && (
        <div className="modal-overlay glass-overlay" onClick={() => { setIsLoginOpen(false); setErrorMsg(""); }}>
          <div className={`login-modal-card ${isShaking ? "shake-anim" : ""}`} onClick={(e) => e.stopPropagation()}>
            <button className="close-modal-btn" onClick={() => { setIsLoginOpen(false); setErrorMsg(""); }}>×</button>
            <div className="login-header">
              <div className="login-icon-badge">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <h2>{getText('admin_login_title')}</h2>
              <p className="login-subtitle">Silahkan masukkan akun administrator Anda</p>
            </div>

            {errorMsg && (
              <div className="login-error-alert animate-fade-in">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="login-form-body">
              <div className="modern-input-group">
                <label>{getText('username')}</label>
                <div className="input-with-icon">
                  <svg className="field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <input
                    type="text"
                    placeholder="Contoh: admin@email.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
              </div>

              <div className="modern-input-group">
                <label>{getText('password')}</label>
                <div className="input-with-icon">
                  <svg className="field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
              </div>

              <button className="modern-submit-btn" onClick={handleLogin}>
                <span>{getText('login_btn')}</span>
                <svg className="btn-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {isQrModalOpen && (
        <div className="modal-overlay" onClick={() => setIsQrModalOpen(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", width: "300px" }}>
            <button className="close-btn" onClick={() => setIsQrModalOpen(false)}>×</button>
            <div style={{ background: "white", padding: "16px", borderRadius: "10px", display: "inline-block" }}>
              <QRCodeCanvas
                value={(() => {
                  const host = customQrHost || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? serverIp : window.location.hostname);
                  const port = window.location.port ? `:${window.location.port}` : "";
                  const expires = Date.now() + 30 * 60 * 1000;
                  return `${window.location.protocol}//${host}${port}/?start=${encodeURIComponent(location)}&end=${encodeURIComponent(search)}&mobile=true&expires=${expires}`;
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
        {isMobileMode && (
          <div style={{ position: "absolute", top: "15px", right: "15px", zIndex: 1000, display: "flex", gap: "8px" }}>
            <label className="theme-switch" title={isDarkMode ? "Light Mode" : "Dark Mode"}>
              <input
                type="checkbox"
                checked={isDarkMode}
                onChange={() => {
                  const newMode = !isDarkMode;
                  setIsDarkMode(newMode);
                  localStorage.setItem('theme', newMode ? 'dark' : 'light');
                }}
              />
              <span className="slider">
                <span className="slider-icon">🌙</span>
                <span className="slider-icon">☀️</span>
              </span>
            </label>
            <select
              value={language}
              onChange={handleLanguageChange}
              style={{ background: "var(--white)", border: "1px solid var(--border)", color: "var(--text-main)", padding: "8px 12px", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", boxShadow: "var(--shadow-md)", outline: "none" }}
            >
              <option value="id" style={{ color: "black" }}>🇮🇩 ID</option>
              <option value="en" style={{ color: "black" }}>🇬🇧 EN</option>
            </select>
          </div>
        )}
        <aside className={`left-panel ${isMobileMode ? 'mobile-panel' : ''}`}>

          {!isMobileMode && (
            <>
              <div className="route-planner-container">
                <div className="route-planner-timeline">
                  <div className="timeline-icon-target">
                    <TargetIcon />
                  </div>
                  <div className="timeline-line"></div>
                  <div className="timeline-icon-pin">
                    <PinIcon />
                  </div>
                </div>
                <div className="route-planner-inputs">
                  {/* KIOSK DROPDOWN ATAU LOCKED KIOSK INFO */}
                  {isKioskLocked ? (
                    <div className="dropdown-wrapper kiosk-input" style={{ padding: "12px", background: "var(--white)", borderRadius: "8px", border: "1.5px solid var(--border)", color: "var(--text-main)", fontWeight: "600", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                      {getText('you_are_here')} {kiosks.find(k => k.id === location)?.name || location}
                    </div>
                  ) : (
                    <div className="dropdown-wrapper kiosk-input">
                      <select
                        className="dropdown-select route-select"
                        value={location}
                        required
                        onChange={(e) => {
                          const newLocation = e.target.value;
                          setLocation(newLocation);
                          if (search.trim()) {
                            executeSearch(newLocation, search);
                          }
                        }}
                      >
                        <option value="" disabled>{getText('select_kiosk')}</option>
                        {kiosks.filter(k => !k.name?.toLowerCase().includes('pintu')).map((kiosk) => (
                          <option key={kiosk.id} value={kiosk.id}>
                            {translateName(kiosk.name || kiosk.id, language, kiosk.name_en)}
                          </option>
                        ))}
                      </select>
                      <ChevronIcon />
                    </div>
                  )}

                  {/* SEARCH & ROOM DROPDOWN */}
                  <div className="search-wrapper destination-input" style={{ position: "relative" }}>
                    <form onSubmit={(e) => { e.preventDefault(); executeSearch(location, search); }} style={{ width: "100%", margin: 0 }}>
                      <input
                        className="search-input route-search"
                        style={{ paddingRight: "74px", width: "100%" }}
                        type="search"
                        placeholder={isListening ? (language === 'en' ? 'Listening...' : 'Mendengarkan...') : getText('search_placeholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </form>

                    <div className="mic-btn-wrapper" onClick={startListening} title={language === 'en' ? 'Voice Search' : 'Pencarian Suara'}>
                      <MicIcon isListening={isListening} />
                    </div>

                    {/* Invisible Dropdown Over Chevron */}
                    <select
                      className="dropdown-select route-select"
                      style={{
                        opacity: 0, position: "absolute", top: 0, left: 0, width: "100%", height: "100%", cursor: "pointer", zIndex: 2, clipPath: "inset(0 0 0 calc(100% - 40px))"
                      }}
                      value={(() => {
                        const matchedRoom = rooms.find(r => r.name === search || r.id === search || translateName(r.name, language, r.name_en) === search);
                        return matchedRoom ? matchedRoom.id : "";
                      })()}
                      onChange={(e) => {
                        const rawId = e.target.value;
                        const selectedRoom = rooms.find(r => r.id === rawId);
                        if (selectedRoom) {
                          let disp = translateName(selectedRoom.name, language, selectedRoom.name_en);
                          if (selectedRoom.floor.startsWith("submap_")) {
                            const pId = selectedRoom.floor.replace("submap_", "");
                            const pRoom = rooms.find(r => r.id === pId);
                            if (pRoom) disp += " " + translateName(pRoom.name, language, pRoom.name_en);
                          }
                          setSearch(disp);
                        }
                        executeSearch(location, rawId);
                      }}
                    >
                      <option value="" disabled>{getText('select_room') || getText('search_placeholder')}</option>
                      {floors.filter(f => !f.startsWith("submap_")).map((floorName) => (
                        <optgroup key={floorName} label={translateName(floorName, language)}>
                          {rooms
                            .filter(room => {
                              if (room.floor === floorName) return true;
                              if (room.floor.startsWith("submap_")) {
                                const parentId = room.floor.replace("submap_", "");
                                const parentRoom = rooms.find(r => r.id === parentId);
                                return parentRoom && parentRoom.floor === floorName;
                              }
                              return false;
                            })
                            .map((room) => {
                              let displayName = translateName(room.name, language, room.name_en);
                              if (room.floor.startsWith("submap_")) {
                                const parentId = room.floor.replace("submap_", "");
                                const parentRoom = rooms.find(r => r.id === parentId);
                                if (parentRoom) displayName += " " + translateName(parentRoom.name, language, parentRoom.name_en);
                              }
                              return <option key={room.id} value={room.id}>{displayName}</option>;
                            })}
                        </optgroup>
                      ))}
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
              </div>

              {/* QUICK ACTIONS — hanya tampil saat belum ada tujuan dipilih */}
              <div className={`quick-actions-section${search.trim() ? ' quick-actions-hidden' : ''}`}>
                <p className="quick-actions-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  {language === 'id' ? 'Pencarian Cepat' : 'Quick Searches'}
                </p>
                <div className="quick-actions">
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'Pintu Masuk' : 'Entrance'; setSearch(q); executeSearch(location, q); }}>
                    <span>🚪</span> {language === 'id' ? 'Pintu Masuk' : 'Entrance'}
                  </button>
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'IGD' : 'ER'; setSearch(q); executeSearch(location, q); }}>
                    <span>🚨</span> {language === 'id' ? 'IGD' : 'ER'}
                  </button>
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'Toilet' : 'Restroom'; setSearch(q); executeSearch(location, q); }}>
                    <span>🚻</span> {language === 'id' ? 'Toilet' : 'Restroom'}
                  </button>
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'Farmasi' : 'Pharmacy'; setSearch(q); executeSearch(location, q); }}>
                    <span>💊</span> {language === 'id' ? 'Farmasi' : 'Pharmacy'}
                  </button>
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'Mushola' : 'Prayer Room'; setSearch(q); executeSearch(location, q); }}>
                    <span>🕌</span> {language === 'id' ? 'Mushola' : 'Prayer Room'}
                  </button>
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'Tangga Darurat' : 'Emergency Stairs'; setSearch(q); executeSearch(location, q); }}>
                    <span>🏃</span> {language === 'id' ? 'Tangga Darurat' : 'Emergency Stairs'}
                  </button>
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'Lift' : 'Elevator'; setSearch(q); executeSearch(location, q); }}>
                    <span>🛗</span> {language === 'id' ? 'Lift' : 'Elevator'}
                  </button>
                  <button className="quick-action-btn" onClick={() => { const q = language === 'id' ? 'Pusat Informasi' : 'Information Center'; setSearch(q); executeSearch(location, q); }}>
                    <span>ℹ️</span> {language === 'id' ? 'Pusat Informasi' : 'Information Center'}
                  </button>
                </div>
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
                        style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', background: activeStepIndex === 0 ? (isDarkMode ? '#334155' : '#ccc') : 'var(--blue-primary)', color: 'white', fontWeight: 'bold' }}
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
                        style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', background: activeStepIndex === navigationSteps.length - 1 ? (isDarkMode ? '#334155' : '#ccc') : 'var(--blue-primary)', color: 'white', fontWeight: 'bold' }}
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
            <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 9999, padding: "12px 24px", background: isDarkMode ? "rgba(234, 179, 8, 0.2)" : "#fff3cd", color: isDarkMode ? "#fde047" : "#856404", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", textAlign: "center", border: isDarkMode ? "1px solid rgba(234, 179, 8, 0.4)" : "1px solid #ffeeba", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
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

          {!isMobileMode && navigationSteps.length > 0 && (
            <button
              onClick={() => {
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
                setPathData([]);
                setNavigationSteps([]);
                setActiveStepIndex(-1);
                setTargetRoomName("");
                setOutputText("");
                setIsNavFinished(false);
                setSearch("");
              }}
              style={{
                marginTop: "10px",
                width: "100%",
                padding: "12px",
                background: isDarkMode ? "rgba(239, 68, 68, 0.15)" : "#e74c3c",
                color: isDarkMode ? "#ef4444" : "white",
                border: isDarkMode ? "1px solid rgba(239, 68, 68, 0.3)" : "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span>🛑</span> {language === 'id' ? 'Hentikan Navigasi' : 'Stop Navigation'}
            </button>
          )}

        </aside>

        <main className="map-panel" style={{ position: "relative" }}>

          {/* VERTICAL FLOOR SCRUBBER (OPTION 1) */}
          <div className="vertical-scrubber-wrapper">
            {(() => {
              const visibleFloors = floors.filter(f => {
                if (f.startsWith("submap_")) return false;
                if (isMobileMode && navigationSteps.length > 0) {
                  return navigationSteps.some(step => step.floor === f);
                }
                return true;
              });

              const initialCounts = {};
              visibleFloors.forEach(f => {
                if (!f.toLowerCase().startsWith("lantai ") && f.length > 0) {
                  const initial = f.charAt(0).toUpperCase();
                  initialCounts[initial] = (initialCounts[initial] || 0) + 1;
                }
              });

              return visibleFloors.map((f) => {
                const isActive = (() => {
                  if (floor.startsWith("submap_")) {
                    const parentId = floor.replace("submap_", "");
                    const parent = rooms.find(r => r.id === parentId);
                    return parent ? parent.floor === f : false;
                  }
                  return floor === f;
                })();

                let shortName = f;
                if (f.toLowerCase().startsWith("lantai ")) {
                  shortName = f.substring(7).trim();
                } else if (f) {
                  const initial = f.charAt(0).toUpperCase();
                  if (initialCounts[initial] > 1) {
                    const match = f.match(/^([a-zA-Z])[a-z]*\s*(\d+)/i);
                    if (match && match[2]) {
                      shortName = (match[1] + match[2]).toUpperCase();
                    } else {
                      shortName = f.substring(0, 2);
                      shortName = shortName.charAt(0).toUpperCase() + (shortName.length > 1 ? shortName.charAt(1).toLowerCase() : "");
                    }
                  } else {
                    shortName = initial;
                  }
                }

                return (
                  <button
                    key={f}
                    className={`scrubber-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setFloor(f)}
                    title={f}
                  >
                    {shortName}
                  </button>
                );
              });
            })()}
          </div>

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
          <TransformWrapper initialScale={1} minScale={0.05} maxScale={10} centerOnInit={true} limitToBounds={false} wheel={{ step: 0.002, smooth: true }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", cursor: "grab" }} contentStyle={{ width: "100%", height: "100vh" }}>
              <div className="map-content" style={{ width: "100%", height: "100%" }}>
                <SharedMap
                  path={pathData}
                  activePath={activePath}
                  currentFloor={floor}
                  language={language}
                  selectedKiosk={location}
                  isDarkMode={isDarkMode}
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