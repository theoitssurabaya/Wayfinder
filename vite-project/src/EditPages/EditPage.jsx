import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Stage, Layer, Rect, Text, Line, Transformer } from "react-konva";
import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { translateName } from "../utils/translator";
import "./Edit.css";

const ElementShape = ({ shapeProps, isSelected, onSelect, onChange, setIsDraggingElement, GRID_SIZE, originalElements, language }) => {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleRename = () => {
    const typeLabel = shapeProps.type === 'kiosk' ? 'Kiosk' : 'Ruangan';
    const newName = window.prompt(`Masukkan Nama ${typeLabel}:`, shapeProps.name || "");
    if (newName !== null) {
      const currentLang = localStorage.getItem('language') || 'id';
      const englishKeywords = ['room', 'clinic', 'ward', 'pharmacy', 'emergency', 'lift', 'stairs', 'cashier', 'door'];
      const indoKeywords = ['ruang', 'poli', 'rawat', 'farmasi', 'apotek', 'ugd', 'igd', 'tangga', 'kasir', 'pintu'];
      
      const lowerName = newName.toLowerCase();
      const hasEnglish = englishKeywords.some(kw => lowerName.includes(kw));
      const hasIndo = indoKeywords.some(kw => lowerName.includes(kw));
      
      if (currentLang === 'id' && hasEnglish && !hasIndo) {
        alert("Anda sedang dalam mode Bahasa Indonesia (ID), namun Anda memasukkan nama dalam Bahasa Inggris. Tolong sesuaikan!");
      } else if (currentLang === 'en' && hasIndo && !hasEnglish) {
        alert("You are currently in English (EN) mode, but entered an Indonesian name. Please adjust accordingly!");
      }

      onChange({ ...shapeProps, name: newName });
    }
  };

  // ── RUMUS BARU: AUTO SHRINK FONT ──
  const textContent = translateName(shapeProps.name || (shapeProps.type === 'kiosk' ? 'Kiosk' : 'Tanpa Nama'), language);
  const textLen = textContent.length || 1;
  const usableWidth = shapeProps.width - 10;
  const dynamicFontSize = Math.max(
    5, 
    Math.min(usableWidth / 4, shapeProps.height / 2.5, (usableWidth * 2.5) / textLen)
  );

  // ── LOGIKA WARNA DINAMIS BERDASARKAN STATUS EDIT ──
  const getVisualColors = useCallback(() => {
    const DEFAULT_COLORS = { fill: "#f8f9fa", stroke: "#dae0e5", text: "#495057" }; 
    const KIOSK_COLORS = { fill: "#2196F3", stroke: "#0D47A1", text: "#FFFFFF" }; 
    
    if (shapeProps.type === 'kiosk') return KIOSK_COLORS;

    const original = originalElements.find(el => el.id === shapeProps.id);

    if (!original) {
        return { fill: "#d4edda", stroke: "#c3e6cb", text: "#155724" }; 
    }

    const posChanged = Math.abs(original.x - shapeProps.x) > 0.1 || Math.abs(original.y - shapeProps.y) > 0.1;
    const sizeChanged = Math.abs(original.width - shapeProps.width) > 0.1 || Math.abs(original.height - shapeProps.height) > 0.1;

    if (posChanged || sizeChanged) {
        return { fill: "#fff3cd", stroke: "#ffeeba", text: "#856404" }; 
    }

    return DEFAULT_COLORS;
  }, [shapeProps, originalElements]);

  const visualColors = getVisualColors();

  // Render penanda endpoint 
  const renderEndpoints = () => {
    if (shapeProps.type !== 'room') return null;
    const endpoints = shapeProps.endpoints || ['bottom'];
    const markerLen = 16; 
    const markerThick = 4;
    
    return endpoints.map((side) => {
      let mX, mY, mW, mH;
      if (side === 'top') {
        mX = shapeProps.x + shapeProps.width / 2 - markerThick / 2; mY = shapeProps.y - markerLen / 2; mW = markerThick; mH = markerLen;
      } else if (side === 'bottom') {
        mX = shapeProps.x + shapeProps.width / 2 - markerThick / 2; mY = shapeProps.y + shapeProps.height - markerLen / 2; mW = markerThick; mH = markerLen;
      } else if (side === 'left') {
        mX = shapeProps.x - markerLen / 2; mY = shapeProps.y + shapeProps.height / 2 - markerThick / 2; mW = markerLen; mH = markerThick;
      } else if (side === 'right') {
        mX = shapeProps.x + shapeProps.width - markerLen / 2; mY = shapeProps.y + shapeProps.height / 2 - markerThick / 2; mW = markerLen; mH = markerThick;
      }
      return <Rect key={side} x={mX} y={mY} width={mW} height={mH} fill="#B71C1C" listening={false} />;
    });
  };

  return (
    <React.Fragment>
      <Rect
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleRename}
        onDblTap={handleRename}
        ref={shapeRef}
        {...shapeProps}
        fill={visualColors.fill} 
        stroke={visualColors.stroke} 
        draggable
        strokeWidth={isSelected ? 3 : 2} 
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} 
        onDragStart={() => setIsDraggingElement(true)}
        onTransformStart={() => setIsDraggingElement(true)}
        dragBoundFunc={(pos) => ({
            x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
            y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
        })}
        onDragEnd={(e) => {
          setIsDraggingElement(false);
          onChange({
            ...shapeProps,
            x: Math.round(e.target.x() / GRID_SIZE) * GRID_SIZE,
            y: Math.round(e.target.y() / GRID_SIZE) * GRID_SIZE,
          });
        }}
        onTransformEnd={(e) => {
          setIsDraggingElement(false);
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: Math.round(node.x() / GRID_SIZE) * GRID_SIZE,
            y: Math.round(node.y() / GRID_SIZE) * GRID_SIZE,
            width: Math.max(GRID_SIZE, Math.round((node.width() * scaleX) / GRID_SIZE) * GRID_SIZE),
            height: Math.max(GRID_SIZE, Math.round((node.height() * scaleY) / GRID_SIZE) * GRID_SIZE),
          });
        }}
      />
      <Text
        text={textContent}
        x={shapeProps.x}
        y={shapeProps.y}
        width={shapeProps.width}
        height={shapeProps.height}
        fontSize={dynamicFontSize}
        fontStyle="bold"
        fill={visualColors.text} 
        align="center"
        verticalAlign="middle"
        padding={5}
        listening={false}
        wrap="word"
        ellipsis={false}
        perfectDrawEnabled={false}
      />
      
      {renderEndpoints()}

      {isSelected && (
        <Transformer ref={trRef} rotateEnabled={false} boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < GRID_SIZE || newBox.height < GRID_SIZE) return oldBox;
            return newBox;
        }} />
      )}
    </React.Fragment>
  );
};

export default function EditPage() {
  const navigate = useNavigate();
  const [placedElements, setPlacedElements] = useState([]);
  const [mapSize, setMapSize] = useState({ width: 2000, height: 1500 });
  const [originalElements, setOriginalElements] = useState([]);
  
  // ── STATE UNDO / REDO ──
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [deletedElements, setDeletedElements] = useState([]);
  
  const [floors, setFloors] = useState(["Lantai 1"]);
  const [activeEditFloor, setActiveEditFloor] = useState("Lantai 1");
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'id');

  const getText = (key) => {
    const dict = {
      'save_map': { id: 'Simpan Peta', en: 'Save Map' },
      'cancel': { id: 'Batal', en: 'Cancel' },
      'drag_drop_info': { id: 'Drag item ke dalam peta', en: 'Drag items into the map' },
      'room': { id: 'Ruangan', en: 'Room' },
      'kiosk': { id: 'Kiosk', en: 'Kiosk' },
      'entrance': { id: 'Pintu Masuk', en: 'Entrance' },
      'exit': { id: 'Pintu Keluar', en: 'Exit' },
      'add_floor': { id: '+ Tambah', en: '+ Add' },
      'del_floor': { id: 'Hapus', en: 'Delete' },
      'save_confirm': { id: 'Konfirmasi Simpan', en: 'Confirm Save' },
      'cancel_confirm': { id: 'Konfirmasi Batal', en: 'Confirm Cancel' },
      'are_you_sure_save': { id: 'Apakah Anda yakin ingin menyimpan perubahan peta ke database?', en: 'Are you sure you want to save map changes to the database?' },
      'are_you_sure_cancel': { id: 'Semua perubahan yang belum disimpan akan hilang. Lanjutkan?', en: 'All unsaved changes will be lost. Continue?' },
      'yes': { id: 'Iya', en: 'Yes' },
      'no': { id: 'Tidak', en: 'No' },
      'edit_mode': { id: 'Mode Edit', en: 'Edit Mode' },
      'floor_management': { id: 'Manajemen Lantai', en: 'Floor Management' },
      'floors_count': { id: 'Lantai', en: 'Floors' },
      'back_to_main_floor': { id: 'Kembali ke Lantai Utama', en: 'Back to Main Floor' },
      'verification': { id: 'Verifikasi', en: 'Verification' },
      'selected': { id: 'Terpilih', en: 'Selected' },
      'no_element_selected': { id: 'Tidak ada elemen terpilih', en: 'No element selected' },
      'edit_panel': { id: 'Panel Edit', en: 'Edit Panel' },
      'template_elements': { id: 'Template Elemen', en: 'Element Templates' },
      'template_hint': { id: 'Tarik template langsung ke peta.', en: 'Drag templates directly onto the map.' },
      'drag_kiosk': { id: 'Tarik Kiosk', en: 'Drag Kiosk' },
      'del_element': { id: 'Hapus Elemen (Del)', en: 'Delete Element (Del)' },
      'enter_submap': { id: 'Masuk ke Bagian Dalam (Sub-Map)', en: 'Enter Inner Section (Sub-Map)' },
      'active_endpoint_side': { id: '📍 Sisi Endpoint Aktif', en: '📍 Active Endpoint Side' },
      'change_manual_hint': { id: 'Ubah manual jika template tidak sesuai:', en: 'Change manually if template does not fit:' },
      'top': { id: 'Atas', en: 'Top' },
      'bottom': { id: 'Bawah', en: 'Bottom' },
      'left': { id: 'Kiri', en: 'Left' },
      'right': { id: 'Kanan', en: 'Right' },
      'undo': { id: 'Urungkan', en: 'Undo' },
      'redo': { id: 'Ulangi', en: 'Redo' }
    };
    return dict[key] ? dict[key][language] : key;
  };

  const toggleLanguage = () => {
    const newLang = language === 'id' ? 'en' : 'id';
    setLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  const mapRef = useRef(null);
  const transformRef = useRef(null);
  const GRID_SIZE = 25;

  const calculatedMapSize = useMemo(() => {
    let maxX = mapSize.width || 2000;
    let maxY = mapSize.height || 1500;
    
    placedElements.forEach(el => {
      if (el.floor === activeEditFloor) {
        const right = el.x + el.width;
        const bottom = el.y + el.height;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }
    });
    
    return {
      width: maxX + 1000,
      height: maxY + 1000
    };
  }, [placedElements, activeEditFloor, mapSize.width, mapSize.height]);



  const saveHistory = useCallback((newElements) => {
    let newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    
    if (newHistory.length > 50) {
        newHistory = newHistory.slice(newHistory.length - 50);
    }
    
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [history, historyStep]);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [roomsSnapshot, kioskSnapshot] = await Promise.all([
          getDocs(collection(db, "Rooms")),
          getDocs(collection(db, "Kiosks"))
        ]);

        const allElements = [];
        const uniqueFloors = new Set(["Lantai 1"]);

        roomsSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.floor && !data.floor.startsWith("submap_")) uniqueFloors.add(data.floor);
          allElements.push({
            id: docSnap.id,
            type: 'room',
            floor: data.floor || "Lantai 1",
            name: data.name || "Tanpa Nama",
            x: (data.grid_x || 0) * GRID_SIZE,
            y: (data.grid_y || 0) * GRID_SIZE,
            width: (data.grid_width || 1) * GRID_SIZE,
            height: (data.grid_height || 1) * GRID_SIZE,
            endpoints: data.endpoints && data.endpoints.length > 0 ? data.endpoints : ['bottom']
          });
        });

        kioskSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.floor && !data.floor.startsWith("submap_")) uniqueFloors.add(data.floor);
          allElements.push({
            id: docSnap.id,
            type: 'kiosk',
            floor: data.floor || "Lantai 1",
            name: data.name || "Kiosk",
            x: (data.grid_x || 0) * GRID_SIZE,
            y: (data.grid_y || 0) * GRID_SIZE,
            width: (data.grid_width || 2) * GRID_SIZE,
            height: (data.grid_height || 2) * GRID_SIZE
          });
        });
        
        setPlacedElements(allElements);
        setOriginalElements(JSON.parse(JSON.stringify(allElements))); 
        
        setHistory([allElements]);
        setHistoryStep(0);
        
        const sortedFloors = Array.from(uniqueFloors).sort();
        setFloors(sortedFloors);
        setActiveEditFloor(sortedFloors[0] || "Lantai 1");
      } catch (error) {
        console.error("Gagal mengambil data:", error);
      }
    };
    fetchAllData();
  }, []);

  useEffect(() => {
    const updateMapSize = () => {
      if (mapRef.current) {
        setMapSize({ 
          width: mapRef.current.clientWidth || 2000, 
          height: mapRef.current.clientHeight || 1500 
        });
      }
    };
    setTimeout(updateMapSize, 100);
    window.addEventListener("resize", updateMapSize);
    return () => window.removeEventListener("resize", updateMapSize);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyStep > 0) {
        const prevStep = historyStep - 1;
        setHistoryStep(prevStep);
        setPlacedElements(history[prevStep]);
        setSelectedId(null); 
    }
  }, [history, historyStep]);

  const handleRedo = useCallback(() => {
    if (historyStep < history.length - 1) {
        const nextStep = historyStep + 1;
        setHistoryStep(nextStep);
        setPlacedElements(history[nextStep]);
        setSelectedId(null);
    }
  }, [history, historyStep]);

  const deleteSelectedElement = useCallback(() => {
    if (selectedId) {
      setDeletedElements((prev) => [...prev, selectedId]);
      const newElements = placedElements.filter((el) => el.id !== selectedId);
      setPlacedElements(newElements);
      saveHistory(newElements); 
      setSelectedId(null);
    }
  }, [selectedId, placedElements, saveHistory]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteSelectedElement();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, deleteSelectedElement, handleUndo, handleRedo]);

  const checkDeselect = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.attrs.id === "bg-grid";
    if (clickedOnEmpty) setSelectedId(null);
  };

  const generateNextRoomId = () => {
    let maxNumber = 0;
    placedElements.forEach((el) => {
      if (el.id.startsWith('R')) {
        const num = parseInt(el.id.substring(1), 10);
        if (!isNaN(num) && num > maxNumber) maxNumber = num;
      }
    });
    return `R${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const generateNextKioskId = () => {
    let maxNumber = 0;
    placedElements.forEach((el) => {
      if (el.id.startsWith('K')) {
        const num = parseInt(el.id.substring(1), 10);
        if (!isNaN(num) && num > maxNumber) maxNumber = num;
      }
    });
    return `K${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const handleAddFloor = () => {
    const newFloor = window.prompt("Masukkan nama lantai baru:\n(Contoh: Lantai 5, Gedung B, Basement)");
    if (newFloor && newFloor.trim() !== "") {
      const formattedFloor = newFloor.trim();
      if (floors.includes(formattedFloor)) {
        alert("Lantai tersebut sudah ada di daftar!");
        return;
      }
      const newFloorsList = [...floors, formattedFloor].sort();
      setFloors(newFloorsList);
      setActiveEditFloor(formattedFloor);
      setSelectedId(null);
    }
  };

  const handleDeleteFloor = () => {
    if (floors.length <= 1) {
      alert("Tidak dapat menghapus. Harus tersisa minimal satu lantai di editor!");
      return;
    }
    
    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus "${activeEditFloor}"?\n\nPERHATIAN: Seluruh elemen (Ruangan & Kiosk) yang berada di lantai ini akan terhapus dari database saat Anda menekan tombol Save.`
    );

    if (confirmDelete) {
      const elementsToDelete = placedElements.filter(el => el.floor === activeEditFloor);
      const idsToDelete = elementsToDelete.map(el => el.id);
      setDeletedElements(prev => [...prev, ...idsToDelete]);

      const newElements = placedElements.filter(el => el.floor !== activeEditFloor);
      setPlacedElements(newElements);
      saveHistory(newElements); 

      const remainingFloors = floors.filter(f => f !== activeEditFloor);
      setFloors(remainingFloors);
      setActiveEditFloor(remainingFloors[0]);
      setSelectedId(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const mapRect = mapRef.current.getBoundingClientRect();
    const clientX = e.clientX - mapRect.left;
    const clientY = e.clientY - mapRect.top;
    
    let dragData;
    try {
        dragData = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch (err) {
        return; 
    }

    if (transformRef.current && dragData) {
      const { scale, positionX, positionY } = transformRef.current.state;
      const x = (clientX - positionX) / scale;
      const y = (clientY - positionY) / scale;
      const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
      const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;

      let newElements = [...placedElements];
      let newId;

      if (dragData.type === "new-kiosk") {
        newId = generateNextKioskId();
        newElements.push({
          id: newId, type: 'kiosk', floor: activeEditFloor, 
          x: snappedX, y: snappedY, width: GRID_SIZE * (dragData.defaultGridWidth || 2), height: GRID_SIZE * (dragData.defaultGridHeight || 2),
          name: dragData.defaultName, 
        });
      } else if (dragData.type === "new-room") {
        newId = generateNextRoomId();
        newElements.push({
          id: newId, type: 'room', floor: activeEditFloor,
          x: snappedX, y: snappedY, width: GRID_SIZE * (dragData.defaultGridWidth || 4), height: GRID_SIZE * (dragData.defaultGridHeight || 2),
          endpoints: dragData.endpoints, name: dragData.defaultName, 
        });
      }
      
      setPlacedElements(newElements);
      saveHistory(newElements); 
      setSelectedId(newId);
    }
  };

  const handleConfirmYes = async () => {
    setIsConfirmOpen(false);
    if (confirmAction === "save") {
      try {
        const batch = writeBatch(db);
        deletedElements.forEach((id) => {
          const col = id.startsWith('K') ? "Kiosks" : "Rooms";
          batch.delete(doc(db, col, id));
        });

        placedElements.forEach((el) => {
          const col = el.type === 'kiosk' ? "Kiosks" : "Rooms";
          batch.set(doc(db, col, el.id.toString()), {
            id: el.id.toString(),
            name: el.name,
            floor: el.floor, 
            grid_x: Math.round(el.x / GRID_SIZE),
            grid_y: Math.round(el.y / GRID_SIZE),
            grid_width: Math.round(el.width / GRID_SIZE),
            grid_height: Math.round(el.height / GRID_SIZE),
            ...(el.type === 'room' && { endpoints: el.endpoints || ['bottom'] })
          }, { merge: true });
        });

        await batch.commit();
        alert("Denah dan setingan endpoint baru berhasil disimpan!");
        navigate("/admin");
      } catch (error) {
        console.error("Gagal simpan:", error);
      }
    } else navigate("/admin");
    setConfirmAction(null);
  };

  const drawGrid = () => {
    const lines = [];
    const { width, height } = calculatedMapSize;
    for (let i = 0; i < width / GRID_SIZE; i++) lines.push(<Line key={`v${i}`} points={[Math.round(i * GRID_SIZE), 0, Math.round(i * GRID_SIZE), height]} stroke="#9e9e9e" strokeWidth={1} />);
    for (let j = 0; j < height / GRID_SIZE; j++) lines.push(<Line key={`h${j}`} points={[0, Math.round(j * GRID_SIZE), width, Math.round(j * GRID_SIZE)]} stroke="#9e9e9e" strokeWidth={1} />);
    return lines;
  };

  return (
    <div className="edit-page-container">
      <header className="edit-page-header">
        <span className="edit-page-logo">Wayfinder - {getText('edit_mode')}</span>
        <button 
          onClick={toggleLanguage} 
          style={{background: "transparent", border: "1px solid white", color: "white", padding: "5px 10px", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", marginLeft: "15px"}}
        >
          {language === 'id' ? '🇮🇩 ID' : '🇬🇧 EN'}
        </button>
        {activeEditFloor.startsWith("submap_") && (
            <button 
                onClick={() => {
                    const parentRoomId = activeEditFloor.replace("submap_", "");
                    const parentRoom = placedElements.find(el => el.id === parentRoomId);
                    setActiveEditFloor(parentRoom ? parentRoom.floor : floors[0]);
                }}
                style={{ padding: "8px 15px", background: "#1A73C8", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", marginLeft: "20px" }}
            >
                <span>{getText('back_to_main_floor')}</span>
            </button>
        )}
        <div className="edit-page-actions">
          <button className="edit-page-btn cancel" onClick={() => setIsConfirmOpen(true)}><span>{getText('cancel')}</span></button>
          <button className="edit-page-btn save" onClick={() => { setConfirmAction("save"); setIsConfirmOpen(true); }}><span>{getText('save_map')}</span></button>
        </div>
      </header>

      {isConfirmOpen && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            <h3>{confirmAction === "save" ? getText('save_confirm') : getText('cancel_confirm')}</h3>
            <p>{confirmAction === "save" ? getText('are_you_sure_save') : getText('are_you_sure_cancel')}</p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn no" onClick={() => setIsConfirmOpen(false)}>{getText('no')}</button>
              <button className="confirm-btn yes" onClick={handleConfirmYes}>{getText('yes')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="edit-page-layout">
        <main className="edit-page-map" ref={mapRef} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          <TransformWrapper ref={transformRef} panning={{ disabled: isDraggingElement }} initialScale={1} minScale={0.05} maxScale={10} limitToBounds={false} wheel={{ step: 0.015 }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", cursor: isDraggingElement ? "grabbing" : "grab" }}>
              <div className="map-content" style={{ width: calculatedMapSize.width, height: calculatedMapSize.height, background: "#e0e0e0" }}>
                <Stage width={calculatedMapSize.width} height={calculatedMapSize.height} onMouseDown={checkDeselect} onTouchStart={checkDeselect}>
                  <Layer>
                    <Rect id="bg-grid" x={0} y={0} width={calculatedMapSize.width} height={calculatedMapSize.height} fill="transparent" />
                    {drawGrid()}
                    
                    {placedElements
                      .filter(el => el.floor === activeEditFloor)
                      .map((rect, i) => (
                        <ElementShape
                            key={rect.id}
                            shapeProps={rect}
                            isSelected={rect.id === selectedId}
                            setIsDraggingElement={setIsDraggingElement}
                            GRID_SIZE={GRID_SIZE}
                            onSelect={() => setSelectedId(rect.id)}
                            onChange={(newAttrs) => {
                                const index = placedElements.findIndex(e => e.id === rect.id);
                                const newElements = [...placedElements];
                                newElements[index] = newAttrs;
                                setPlacedElements(newElements);
                                saveHistory(newElements); 
                            }}
                            originalElements={originalElements} 
                            language={language}
                        />
                    ))}
                  </Layer>
                </Stage>
              </div>
            </TransformComponent>
          </TransformWrapper>
        </main>

        <aside className="edit-page-right-panel">
          <div style={{ background: "#ffffff", padding: "12px", borderRadius: "6px", border: "1px solid #cce5ff", marginBottom: "15px", boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#0056b3", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>🏢 {getText('floor_management')}</span>
              <span style={{ fontSize: "10px", background: "#e8f4f8", padding: "2px 6px", borderRadius: "10px", color: "#0d47a1" }}>{floors.length} {getText('floors_count')}</span>
            </h4>
            <select 
              value={activeEditFloor} 
              onChange={(e) => {
                setActiveEditFloor(e.target.value);
                setSelectedId(null);
              }}
              style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #b8daff", marginBottom: "10px", fontSize: "13px", fontWeight: "bold", color: "#0056b3", background: "#f8fbff", cursor: "pointer" }}
            >
              {floors.map(f => <option key={f} value={f}>{translateName(f, language)}</option>)}
            </select>

            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={handleAddFloor} style={{ flex: 1, padding: "7px", fontSize: "11px", background: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>{getText('add_floor')}</button>
              <button onClick={handleDeleteFloor} style={{ flex: 1, padding: "7px", fontSize: "11px", background: "#dc3545", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>{getText('del_floor')}</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px", marginBottom: "15px" }}>
              <button 
                  onClick={handleUndo}
                  disabled={historyStep <= 0}
                  style={{ flex: 1, padding: "8px", fontSize: "12px", background: historyStep <= 0 ? "#f1f3f5" : "#ffffff", color: historyStep <= 0 ? "#adb5bd" : "#495057", border: "1px solid #ced4da", borderRadius: "4px", cursor: historyStep <= 0 ? "not-allowed" : "pointer", fontWeight: "bold" }}
                  title="Undo (Ctrl+Z)"
              >
                  ↶ {getText('undo')}
              </button>
              <button 
                  onClick={handleRedo}
                  disabled={historyStep >= history.length - 1}
                  style={{ flex: 1, padding: "8px", fontSize: "12px", background: historyStep >= history.length - 1 ? "#f1f3f5" : "#ffffff", color: historyStep >= history.length - 1 ? "#adb5bd" : "#495057", border: "1px solid #ced4da", borderRadius: "4px", cursor: historyStep >= history.length - 1 ? "not-allowed" : "pointer", fontWeight: "bold" }}
                  title="Redo (Ctrl+Y)"
              >
                  {getText('redo')} ↷
              </button>
          </div>

          <h3>{getText('edit_panel')} - {translateName(activeEditFloor, language)}</h3>
          <div className="edit-tools">
            <p style={{fontSize: "12px", color: "#666"}}>
              {selectedId ? `${getText('selected')}: ${translateName(placedElements.find(el=>el.id === selectedId)?.name || "Kiosk", language)}` : getText('no_element_selected')}
            </p>
            <button 
              className="edit-page-btn delete" 
              onClick={deleteSelectedElement}
              disabled={!selectedId}
              style={{
                width: "100%", padding: "10px", backgroundColor: selectedId ? "#f44336" : "#ccc",
                color: "white", border: "none", borderRadius: "5px", cursor: selectedId ? "pointer" : "not-allowed", marginTop: "10px"
              }}
            >
              {getText('del_element')}
            </button>
            
            {selectedId && placedElements.find(el => el.id === selectedId)?.type === 'room' && (() => {
               const room = placedElements.find(el => el.id === selectedId);
               const updateRoom = (changes) => {
                   const newElements = placedElements.map(el => el.id === selectedId ? { ...el, ...changes } : el);
                   setPlacedElements(newElements);
                   saveHistory(newElements); 
               };
               return (
                   <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                       <button 
                           onClick={() => {
                               const submapId = `submap_${room.id}`;
                               setActiveEditFloor(submapId);
                               setSelectedId(null);
                               
                               const hasPintuMasuk = placedElements.some(el => el.floor === submapId && el.name.toLowerCase() === 'pintu masuk');
                               if (!hasPintuMasuk) {
                                   const newId = generateNextKioskId();
                                   const newElements = [...placedElements, {
                                       id: newId, type: 'kiosk',
                                       floor: submapId,
                                       x: 200, y: 200,
                                       width: GRID_SIZE * 2, height: GRID_SIZE * 2,
                                       name: "Pintu Masuk", fill: "#FF9800", stroke: "#E65100"
                                   }];
                                   setPlacedElements(newElements);
                                   saveHistory(newElements);
                               }
                           }}
                           style={{ width: "100%", padding: "10px", backgroundColor: "#2196F3", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
                       >
                           {getText('enter_submap')}
                       </button>
                       
                       <div className="endpoint-controls" style={{background: "#f9f9f9", padding: "10px", borderRadius: "5px", border: "1px solid #ddd"}}>
                       <h4 style={{margin: "0 0 10px 0", fontSize: "14px", color: "#B71C1C"}}>{getText('active_endpoint_side')}</h4>
                       <p style={{fontSize: "11px", color: "#666", marginBottom: "6px"}}>{getText('change_manual_hint')}</p>
                       <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "#fff", padding: "8px", borderRadius: "4px", border: "1px solid #eee"}}>
                           {['top', 'bottom', 'left', 'right'].map(side => {
                               const labels = {top: getText('top'), bottom: getText('bottom'), left: getText('left'), right: getText('right')};
                               const isChecked = (room.endpoints || []).includes(side);
                               return (
                                   <label key={side} style={{fontSize: "12px", display: "flex", alignItems: "center", gap: "5px", cursor: "pointer"}}>
                                       <input 
                                           type="checkbox" 
                                           checked={isChecked}
                                           onChange={() => {
                                               const curr = room.endpoints || [];
                                               const next = isChecked ? curr.filter(s => s !== side) : [...curr, side];
                                               updateRoom({ endpoints: next.length > 0 ? next : ['bottom'] });
                                           }}
                                       />
                                       {labels[side]}
                                   </label>
                               );
                           })}
                       </div>
                        </div>
                   </div>
               );
            })()}
          </div>

          <hr style={{margin: "20px 0", border: "0.5px solid #ddd"}} />

          <h3>{getText('template_elements')}</h3>
          <p style={{fontSize: "11px", color: "#666", marginTop: "-5px", marginBottom: "15px"}}>{getText('template_hint')}</p>
          
          <div className="dnd-zone" style={{display: "flex", flexDirection: "column", gap: "10px"}}>
            {[
              { name: "Ruangan Pintu Berlawanan", endpoints: ['left', 'right'], color: "#4caf50" },
              { name: "Ruangan 1 Pintu", endpoints: ['top'], color: "#4caf50" },
              { name: "Ruangan 2 Pintu", endpoints: ['left', 'bottom'], color: "#4caf50" },
              { name: "Ruangan 3 Pintu", endpoints: ['left', 'right', 'bottom'], color: "#4caf50" },
              { name: "Ruangan 4 Pintu", endpoints: ['top', 'bottom', 'left', 'right'], color: "#4caf50" }
            ].map(preset => (
              <div 
                key={preset.name}
                draggable 
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", JSON.stringify({
                    type: "new-room",
                    defaultName: preset.name,
                    endpoints: preset.endpoints,
                    defaultGridWidth: 4,
                    defaultGridHeight: 4
                  }));
                }} 
                onClick={() => {
                  const newId = generateNextRoomId();
                  const newElements = [...placedElements, {
                    id: newId, type: 'room', floor: activeEditFloor,
                    x: 200, y: 200, width: GRID_SIZE * 4, height: GRID_SIZE * 4,
                    name: preset.name, fill: "#e0e0e0", stroke: "#9e9e9e",
                    endpoints: preset.endpoints
                  }];
                  setPlacedElements(newElements);
                  saveHistory(newElements);
                }}
                style={{ 
                  width: "100%", height: "40px", background: preset.color, border: "1px solid #1b5e20",
                  cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px" 
                }}
              >
                <p style={{ color: "#1b5e20", padding: "5px", fontSize: "11px", textAlign: "center", fontWeight: "bold" }}>
                  {translateName(preset.name, language)}
                </p>
              </div>
            ))}

            <div style={{margin: "10px 0", borderTop: "1px solid #eee"}}></div>

            <div 
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "new-kiosk",
                  defaultName: "Kiosk Baru",
                  defaultGridWidth: 2,
                  defaultGridHeight: 2
                }));
              }} 
              onClick={() => {
                const newId = generateNextKioskId();
                const newElements = [...placedElements, {
                  id: newId, type: 'kiosk', floor: activeEditFloor,
                  x: 200, y: 200, width: GRID_SIZE * 2, height: GRID_SIZE * 2,
                  name: "Kiosk Baru"
                }];
                setPlacedElements(newElements);
                saveHistory(newElements);
              }}
              style={{ 
                width: GRID_SIZE * 2, height: GRID_SIZE * 2, background: "#2196F3", border: "1px solid #0D47A1",
                cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" 
              }}
            >
              <p style={{ color: "white", padding: "2px", fontSize: "10px", textAlign: "center", fontWeight: "bold" }}>
                {getText('drag_kiosk')}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}