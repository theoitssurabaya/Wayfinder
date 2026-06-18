import React, { useState, useEffect, useRef, useMemo } from "react";
import { Stage, Layer, Rect, Text, Line, Group, Circle } from "react-konva";
import Konva from "konva";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { translateName } from "../utils/translator";

function getTotalPathLength(pathPoints) {
  let total = 0;
  for (let i = 0; i < pathPoints.length - 2; i += 2) {
    const x1 = pathPoints[i];
    const y1 = pathPoints[i + 1];
    const x2 = pathPoints[i + 2];
    const y2 = pathPoints[i + 3];
    const dx = x2 - x1;
    const dy = y2 - y1;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function getPointAtDistance(pathPoints, distance) {
  let currentDist = 0;
  for (let i = 0; i < pathPoints.length - 2; i += 2) {
    const x1 = pathPoints[i];
    const y1 = pathPoints[i + 1];
    const x2 = pathPoints[i + 2];
    const y2 = pathPoints[i + 3];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (currentDist + segLen >= distance) {
      const ratio = (distance - currentDist) / segLen;
      const x = x1 + dx * ratio;
      const y = y1 + dy * ratio;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return { x, y, angle };
    }
    currentDist += segLen;
  }

  const lastX = pathPoints[pathPoints.length - 2];
  const lastY = pathPoints[pathPoints.length - 1];

  if (pathPoints.length >= 4) {
    const dx = pathPoints[pathPoints.length - 2] - pathPoints[pathPoints.length - 4];
    const dy = pathPoints[pathPoints.length - 1] - pathPoints[pathPoints.length - 3];
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { x: lastX, y: lastY, angle };
  }
  return { x: lastX, y: lastY, angle: 0 };
}

export default function SharedMap({ path = [], activePath = null, currentFloor = "Lantai 1", onRoomClick, showGrid = true, showBorder = false, language = "id", isDarkMode = false }) {
  const [rooms, setRooms] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const lineRef = useRef(null);
  const personRef = useRef(null);
  const leftFootRef = useRef(null);
  const rightFootRef = useRef(null);

  const GRID_SIZE = 25;

  const mapBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    rooms.forEach((room) => {
      if (room.floor === currentFloor) {
        minX = Math.min(minX, room.x);
        minY = Math.min(minY, room.y);
        maxX = Math.max(maxX, room.x + room.width);
        maxY = Math.max(maxY, room.y + room.height);
      }
    });

    kiosks.forEach((kiosk) => {
      if (kiosk.floor === currentFloor) {
        minX = Math.min(minX, kiosk.x);
        minY = Math.min(minY, kiosk.y);
        maxX = Math.max(maxX, kiosk.x + kiosk.width);
        maxY = Math.max(maxY, kiosk.y + kiosk.height);
      }
    });

    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      return null;
    }

    const padding = 25;
    return {
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + 2 * padding,
      height: (maxY - minY) + 2 * padding
    };
  }, [rooms, kiosks, currentFloor]);

  const scaleAndOffset = useMemo(() => {
    if (!mapBounds || mapSize.width === 0 || mapSize.height === 0) {
      return { scale: 1, x: 0, y: 0 };
    }
    const padding = 20;
    const availableWidth = mapSize.width - padding * 2;
    const availableHeight = mapSize.height - padding * 2;
    const scaleX = availableWidth / mapBounds.width;
    const scaleY = availableHeight / mapBounds.height;
    const scale = Math.min(scaleX, scaleY, 2); // Batasi skala maksimum ke 2x untuk menghindari peregangan berlebihan

    // Pusatkan batas peta di stage
    const x = (mapSize.width - mapBounds.width * scale) / 2 - mapBounds.x * scale;
    const y = (mapSize.height - mapBounds.height * scale) / 2 - mapBounds.y * scale;

    return { scale, x, y };
  }, [mapBounds, mapSize]);

  const calculatedMapSize = useMemo(() => {
    let maxX = mapSize.width || 2000;
    let maxY = mapSize.height || 1500;

    rooms.forEach(room => {
      if (room.floor === currentFloor) {
        const right = room.x + room.width;
        const bottom = room.y + room.height;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }
    });

    kiosks.forEach(kiosk => {
      if (kiosk.floor === currentFloor) {
        const right = kiosk.x + kiosk.width;
        const bottom = kiosk.y + kiosk.height;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }
    });

    return {
      width: maxX + 1000,
      height: maxY + 1000
    };
  }, [rooms, kiosks, currentFloor, mapSize.width, mapSize.height]);



  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setMapSize({
          width: containerRef.current.clientWidth || 2000,
          height: containerRef.current.clientHeight || 1500,
        });
      }
    };

    setTimeout(updateSize, 100);
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const unsubscribeRooms = onSnapshot(collection(db, "Rooms"), (snapshot) => {
      const loadedRooms = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedRooms.push({
          id: docSnap.id,
          floor: data.floor || "Lantai 1",
          name: data.name || "Tanpa Nama",
          name_en: data.name_en,
          x: (data.grid_x || 0) * GRID_SIZE,
          y: (data.grid_y || 0) * GRID_SIZE,
          width: (data.grid_width || 1) * GRID_SIZE,
          height: (data.grid_height || 1) * GRID_SIZE,
          endpoints: data.endpoints && data.endpoints.length > 0 ? data.endpoints : ['bottom'],
        });
      });
      setRooms(loadedRooms);
    }, (error) => console.error("Gagal memuat peta:", error));

    return () => unsubscribeRooms();
  }, []);

  useEffect(() => {
    const unsubscribeKiosks = onSnapshot(collection(db, "Kiosks"), (snapshot) => {
      const loadedKiosks = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedKiosks.push({
          id: docSnap.id,
          floor: data.floor || "Lantai 1",
          name: data.name || "Kiosk",
          name_en: data.name_en,
          x: (data.grid_x || 0) * GRID_SIZE,
          y: (data.grid_y || 0) * GRID_SIZE,
          width: (data.grid_width || 2) * GRID_SIZE,
          height: (data.grid_height || 2) * GRID_SIZE,
        });
      });
      setKiosks(loadedKiosks);
    }, (error) => console.error("Gagal memuat kiosk:", error));

    return () => unsubscribeKiosks();
  }, []);

  const pathPoints = useMemo(() => {
    const filteredPath = path.filter(p => !p.floor || p.floor === currentFloor);
    return filteredPath.flatMap((point) => [
      (point.x || 0) * GRID_SIZE + GRID_SIZE / 2,
      (point.y || 0) * GRID_SIZE + GRID_SIZE / 2
    ]);
  }, [path, currentFloor]);

  const activePathPoints = useMemo(() => {
    if (!activePath) return pathPoints;
    const filteredPath = activePath.filter(p => !p.floor || p.floor === currentFloor);
    return filteredPath.flatMap((point) => [
      (point.x || 0) * GRID_SIZE + GRID_SIZE / 2,
      (point.y || 0) * GRID_SIZE + GRID_SIZE / 2
    ]);
  }, [activePath, pathPoints, currentFloor]);

  useEffect(() => {
    if (!lineRef.current) return;

    let totalPathLength = 0;
    if (activePathPoints.length >= 4) {
      totalPathLength = getTotalPathLength(activePathPoints);
    }

    // Kecepatan jalan: semakin kecil angka = semakin lambat
    // totalPathLength / X  → orang menempuh seluruh jalur dalam X detik
    const WALK_SPEED = Math.max(15, totalPathLength / 5);
    const LEG_SWING_FREQ = 0.006; // frekuensi ayunan kaki

    const anim = new Konva.Animation((frame) => {
      if (!lineRef.current) return;

      // Animasi garis putus-putus bergerak
      const dashOffset = (frame.time / 25) % 20;
      lineRef.current.dashOffset(-dashOffset);

      if (personRef.current && activePathPoints.length >= 4 && totalPathLength > 0) {
        const distance = Math.min((frame.time / 1000) * WALK_SPEED, totalPathLength);
        const isMoving = distance < totalPathLength;
        const { x, y, angle } = getPointAtDistance(activePathPoints, distance);

        personRef.current.x(x);
        personRef.current.y(y);
        personRef.current.rotation(angle);

        if (leftFootRef.current && rightFootRef.current) {
          const footSwing = isMoving ? Math.sin(frame.time * LEG_SWING_FREQ) * 8 : 0;
          leftFootRef.current.x(footSwing);
          rightFootRef.current.x(-footSwing);
        }
      }
    }, lineRef.current.getLayer());

    anim.start();
    return () => anim.stop();
  }, [activePathPoints]);

  const drawGrid = () => {
    const lines = [];
    const { width, height } = calculatedMapSize;
    const gridColor = isDarkMode ? "#334155" : "#e0e0e0";
    for (let i = 0; i < width / GRID_SIZE; i++) {
      lines.push(<Line key={`v${i}`} points={[Math.round(i * GRID_SIZE), 0, Math.round(i * GRID_SIZE), height]} stroke={gridColor} strokeWidth={1} listening={false} perfectDrawEnabled={false} />);
    }
    for (let j = 0; j < height / GRID_SIZE; j++) {
      lines.push(<Line key={`h${j}`} points={[0, Math.round(j * GRID_SIZE), width, Math.round(j * GRID_SIZE)]} stroke={gridColor} strokeWidth={1} listening={false} perfectDrawEnabled={false} />);
    }
    return lines;
  };

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", background: isDarkMode ? "#0f172a" : "#f5f5f5" }}>
      {mapSize.width > 0 && mapSize.height > 0 && (
        <Stage width={mapSize.width} height={mapSize.height}>
          <Layer>
            <Group scaleX={scaleAndOffset.scale} scaleY={scaleAndOffset.scale} x={scaleAndOffset.x} y={scaleAndOffset.y}>
              {showGrid && drawGrid()}

              {/* Kotak Pembatas Visual (Garis Warp/Wrap) */}
              {showBorder && mapBounds && (
                <Rect
                  x={mapBounds.x}
                  y={mapBounds.y}
                  width={mapBounds.width}
                  height={mapBounds.height}
                  fill={isDarkMode ? "#0f172a" : "#ffffff"}
                  stroke={isDarkMode ? "#3b82f6" : "#1a73c8"}
                  strokeWidth={isDarkMode ? 1.5 : 2.5}
                  cornerRadius={16}
                  shadowColor="rgba(26, 115, 200, 0.08)"
                  shadowBlur={10}
                  shadowOffset={{ x: 0, y: 4 }}
                  listening={false}
                  perfectDrawEnabled={false}
                  shadowForStrokeEnabled={false}
                />
              )}

              {/* Render Ruangan bersih senada background (Tanpa Endpoint) */}
              {rooms
                .filter((room) => room.floor === currentFloor)
                .map((room) => {
                  const textContent = translateName(room.name || "Tanpa Nama", language, room.name_en);
                  const longestWordLen = Math.max(...textContent.split(' ').map(w => w.length), 1);
                  const actualUsableWidth = Math.max(10, room.width - 12);

                  // Sesuaikan ukuran font untuk keterbacaan dan word wrapping yang lebih baik
                  const maxFontSizeWidth = actualUsableWidth / (longestWordLen * 0.6);
                  const maxFontSizeHeight = room.height / 2;
                  // Batasi ukuran font secara ketat agar huruf dari kata yang sama tidak terpisah
                  const fontSize = Math.min(maxFontSizeWidth, Math.max(9, Math.min(16, maxFontSizeHeight)));

                  return (
                    <Group
                      key={room.id}
                      onClick={(e) => onRoomClick && onRoomClick(room, e)}
                      onTap={(e) => onRoomClick && onRoomClick(room, e)}
                      onMouseEnter={(e) => { if (onRoomClick) { e.target.getStage().container().style.cursor = 'pointer'; } }}
                      onMouseLeave={(e) => { if (onRoomClick) { e.target.getStage().container().style.cursor = 'default'; } }}
                    >
                      <Rect x={room.x} y={room.y} width={room.width} height={room.height} fill={isDarkMode ? "#1e293b" : "#f8f9fa"} stroke={isDarkMode ? "#334155" : "#dae0e5"} strokeWidth={2} perfectDrawEnabled={false} shadowForStrokeEnabled={false} />
                      <Text
                        text={textContent}
                        x={room.x} y={room.y} width={room.width} height={room.height}
                        fontSize={fontSize} fontStyle="bold" fill={isDarkMode ? "#f8fafc" : "#495057"}
                        align="center" verticalAlign="middle" padding={5}
                        wrap="word" ellipsis={false}
                        perfectDrawEnabled={false}
                        listening={false}
                      />
                    </Group>
                  );
                })}

              {/* Render Kiosks (biru) dan Pintu Masuk (hijau) */}
              {kiosks
                .filter((kiosk) => kiosk.floor === currentFloor)
                .map((kiosk) => {
                  const textContent = translateName(kiosk.name || "Kiosk", language, kiosk.name_en);
                  const isPintu = kiosk.name?.toLowerCase().includes('pintu');
                  const fillCol = isPintu ? "#4CAF50" : "#2196F3";
                  const strokeCol = isPintu ? "#2E7D32" : "#0D47A1";
                  
                  const longestWordLen = Math.max(...textContent.split(' ').map(w => w.length), 1);
                  const actualUsableWidth = Math.max(10, kiosk.width - 12);

                  // Sesuaikan ukuran font untuk keterbacaan dan word wrapping yang lebih baik
                  const maxFontSizeWidth = actualUsableWidth / (longestWordLen * 0.6);
                  const maxFontSizeHeight = kiosk.height / 2;
                  // Batasi ukuran font secara ketat agar huruf dari kata yang sama tidak terpisah
                  const fontSize = Math.min(maxFontSizeWidth, Math.max(9, Math.min(16, maxFontSizeHeight)));

                  return (
                    <React.Fragment key={kiosk.id}>
                      <Rect x={kiosk.x} y={kiosk.y} width={kiosk.width} height={kiosk.height} fill={fillCol} stroke={strokeCol} strokeWidth={2} perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />

                      <Text
                        text={textContent}
                        x={kiosk.x} y={kiosk.y} width={kiosk.width} height={kiosk.height}
                        fontSize={fontSize} fontStyle="bold" fill="#ffffff"
                        align="center" verticalAlign="middle" padding={5}
                        wrap="word" ellipsis={false}
                        perfectDrawEnabled={false}
                        listening={false}
                      />
                    </React.Fragment>
                  );
                })}

              {/* Akhir Static Layer */}
            </Group>
          </Layer>

          {/* Layer Animasi Terpisah (SANGAT PENTING UNTUK PERFORMA MOBILE) */}
          <Layer>
            <Group scaleX={scaleAndOffset.scale} scaleY={scaleAndOffset.scale} x={scaleAndOffset.x} y={scaleAndOffset.y}>
              {/* Garis Rute & Animasi Orang Berjalan */}
              {pathPoints.length > 0 && (
                <>
                  {/* Rute keseluruhan (redup) */}
                  <Line points={pathPoints} stroke="rgba(255, 0, 0, 0.2)" strokeWidth={5} lineCap="round" lineJoin="round" tension={0} />

                  {/* Rute aktif & Animasi */}
                  {activePathPoints.length > 0 && (
                    <>
                      <Line ref={lineRef} points={activePathPoints} stroke="red" strokeWidth={5} dash={[10, 10]} lineCap="round" lineJoin="round" tension={0} />
                      {activePathPoints.length >= 4 && (
                        <Group ref={personRef}>
                          <Rect ref={leftFootRef} x={0} y={-8} width={10} height={6} fill="#333" cornerRadius={3} offsetX={5} offsetY={3} />
                          <Rect ref={rightFootRef} x={0} y={8} width={10} height={6} fill="#333" cornerRadius={3} offsetX={5} offsetY={3} />
                          <Rect x={0} y={0} width={16} height={24} fill="#2196F3" cornerRadius={8} offsetX={8} offsetY={12} />
                          <Circle x={0} y={0} radius={7} fill="#FFCCBC" stroke="#333" strokeWidth={1} />
                        </Group>
                      )}
                    </>
                  )}
                </>
              )}
            </Group>
          </Layer>
        </Stage>
      )}
    </div>
  );
}