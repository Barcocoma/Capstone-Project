import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMaterialTailwindController } from "@/context";
import { API_ENDPOINTS } from "@/configs/api";

const CEMETERY_BOUNDS = { north: 14.2611, south: 14.2585, east: 121.1655, west: 121.1603 };
const MAIN_GATE = { lat: 14.259766592217202, lng: 121.1646436819092 };
const LOT_TYPE_COLORS = { standard: "#FFD700", premium: "#2196F3", deluxe: "#FF8C00" };

export default function DirectionalGuide() {
  const navigate = useNavigate();
  const { garden, sector, lotNumber, blockNumber } = useParams();
  const [controller] = useMaterialTailwindController();
  const { openSidenav } = controller;
  const mapRef = useRef(null);
  const map = useRef(null);
  const [config, setConfig] = useState({ sectorOverlayOpacity: 0.9, directionalOpacity: 1.0 });
  const [polyline, setPolyline] = useState(null);
  const overlayViewRef = useRef(null);
  const overlayDomRef = useRef({ container: null, canvas: null });
  const overlayImageRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [sectorCoords, setSectorCoords] = useState(null);
  const [lots, setLots] = useState([]);
  const [selectedLot, setSelectedLot] = useState(null);
  const [pathsBySector, setPathsBySector] = useState(null);
  const [infraMarkers, setInfraMarkers] = useState([]);
  const labelOverlayRef = useRef(null);
  const labelItemsRef = useRef([]);
  const startInfoRef = useRef(null);
  const destInfoRef = useRef(null);
  const animationTimerRef = useRef(null);
  const animationIdxRef = useRef(0);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  useEffect(() => { fetch(API_ENDPOINTS.MAP_UI_CONFIG).then(r=>r.json()).then(setConfig).catch(()=>{}); }, []);
  useEffect(() => { fetch(API_ENDPOINTS.MAP_MARKERS).then(r=>r.json()).then(d=> setInfraMarkers(Array.isArray(d.points)? d.points: [])).catch(()=> setInfraMarkers([])); }, []);

  useEffect(() => {
    if (!map.current && mapRef.current && window.google && window.google.maps) {
      map.current = new window.google.maps.Map(mapRef.current, {
        center: MAIN_GATE,
        zoom: 23,
        minZoom: 18,
        maxZoom: 26,
        restriction: { latLngBounds: CEMETERY_BOUNDS, strictBounds: true },
        mapTypeId: "satellite",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        zoomControl: false,
        gestureHandling: "greedy",
        clickableIcons: false,
        keyboardShortcuts: false
      });
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(API_ENDPOINTS.MAP_SECTORS_POLY);
      const sectors = await res.json();
      const s = sectors.find((d) => d.garden === decodeURIComponent(garden) && d.sector === decodeURIComponent(sector));
      if (s) setSectorCoords(s.coordinates);
      const lotsRes = await fetch(`${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(decodeURIComponent(garden))}&sector=${encodeURIComponent(decodeURIComponent(sector))}`);
      const lotsData = await lotsRes.json();
      setLots(lotsData.lots || []);
    };
    load();
  }, [garden, sector]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => { overlayImageRef.current = img; setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.src = `/img/map/${decodeURIComponent(garden)} - ${decodeURIComponent(sector)}.png`;
  }, [garden, sector]);

  useEffect(() => {
    if (!lots || !lots.length) return;
    const match = lots.find((l) => String(l.lotNumber) === String(lotNumber) && String(l.blockNumber) === String(blockNumber));
    setSelectedLot(match || null);
  }, [lots, lotNumber, blockNumber]);

  useEffect(() => {
    fetch(API_ENDPOINTS.MAP_SECTOR_PATHS).then(r => r.json()).then(setPathsBySector).catch(() => setPathsBySector(null));
  }, []);

  useEffect(() => {
    if (!map.current || !pathsBySector) return;
    const g = decodeURIComponent(garden);
    const s = decodeURIComponent(sector);
    let basePath = (pathsBySector[g] && pathsBySector[g][s] || []).map(([lat,lng]) => ({ lat, lng }));
    const path = basePath;
    if (!path.length) return;
    if (polyline) polyline.setMap(null);
    const line = new window.google.maps.Polyline({ path, strokeColor: "#0000FF", strokeOpacity: config.directionalOpacity, strokeWeight: 5, map: map.current });
    setPolyline(line);
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.current.fitBounds(bounds, 60);
    map.current.setOptions({ minZoom: 18, maxZoom: 26 });

    // Labels rendered by text overlay effect below

    // Animate along path
    if (animationTimerRef.current) { clearInterval(animationTimerRef.current); animationTimerRef.current = null; }
    animationIdxRef.current = 0;
    const points = path.slice();
    if (points.length > 1) {
      // After fitting bounds, wait a bit then follow
      setTimeout(() => {
        let step = 0;
        animationTimerRef.current = setInterval(() => {
          if (step >= points.length) { clearInterval(animationTimerRef.current); animationTimerRef.current = null; return; }
          map.current.panTo(points[step]);
          if (step === 0) { const z = map.current.getZoom(); map.current.setZoom(Math.max(19, z || 19)); }
          step += 1;
        }, 300);
      }, 500);
    }
  }, [garden, sector, selectedLot, sectorCoords, naturalSize, config.directionalOpacity, pathsBySector]);

  const calculateLotCenter = (lot) => {
    if (!sectorCoords || !lot || !naturalSize.width || !naturalSize.height) return null;
    const { x, y, width: w, height: h } = lot.coordinates;
    const lotCenterX = x + w / 2;
    const lotCenterY = y + h / 2;
    const [TL, BL, BR, TR] = sectorCoords;
    const s = lotCenterX / naturalSize.width;
    const t = lotCenterY / naturalSize.height;
    const lotLat = TL[0] * (1 - s) * (1 - t) + TR[0] * s * (1 - t) + BL[0] * (1 - s) * t + BR[0] * s * t;
    const lotLng = TL[1] * (1 - s) * (1 - t) + TR[1] * s * (1 - t) + BL[1] * (1 - s) * t + BR[1] * s * t;
    return { lat: lotLat, lng: lotLng };
  };

  // Overlay warped sector image and lots; highlight destination, grey others
  useEffect(() => {
    if (!map.current || !sectorCoords || !naturalSize.width || !naturalSize.height) return;
    const google = window.google;
    const [TL, BL, BR, TR] = sectorCoords.map(([lat, lng]) => ({ lat, lng }));
    const bilinear = (s, t, pTL, pTR, pBL, pBR) => {
      const x = pTL.x * (1 - s) * (1 - t) + pTR.x * s * (1 - t) + pBL.x * (1 - s) * t + pBR.x * s * t;
      const y = pTL.y * (1 - s) * (1 - t) + pTR.y * s * (1 - t) + pBL.y * (1 - s) * t + pBR.y * s * t;
      return { x, y };
    };
    const setTransformFromTriangles = (ctx, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) => {
      const denom = sx0 * (sy2 - sy1) + sx1 * (sy0 - sy2) + sx2 * (sy1 - sy0);
      if (denom === 0) return false;
      const a = (dx0 * (sy2 - sy1) + dx1 * (sy0 - sy2) + dx2 * (sy1 - sy0)) / denom;
      const b = (dy0 * (sy2 - sy1) + dy1 * (sy0 - sy2) + dy2 * (sy1 - sy0)) / denom;
      const c = (dx0 * (sx1 - sx2) + dx1 * (sx2 - sx0) + dx2 * (sx0 - sx1)) / denom;
      const d = (dy0 * (sx1 - sx2) + dy1 * (sx2 - sx0) + dy2 * (sx0 - sx1)) / denom;
      const e = (dx0 * (sx2 * sy1 - sx1 * sy2) + dx1 * (sx0 * sy2 - sx2 * sy0) + dx2 * (sx1 * sy0 - sx0 * sy1)) / denom;
      const f = (dy0 * (sx2 * sy1 - sx1 * sy2) + dy1 * (sx0 * sy2 - sx2 * sy0) + dy2 * (sx1 * sy0 - sx0 * sy1)) / denom;
      ctx.setTransform(a, b, c, d, e, f);
      return true;
    };

    const overlayView = new google.maps.OverlayView();
    overlayView.onAdd = () => {
      const pane = overlayView.getPanes();
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.pointerEvents = "none";
      const canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      container.appendChild(canvas);
      pane.overlayMouseTarget.appendChild(container);
      overlayDomRef.current.container = container;
      overlayDomRef.current.canvas = canvas;
    };

    const draw = () => {
      const projection = overlayView.getProjection();
      if (!projection || !overlayDomRef.current.canvas) return;
      const pTL = projection.fromLatLngToDivPixel(new google.maps.LatLng(TL.lat, TL.lng));
      const pBL = projection.fromLatLngToDivPixel(new google.maps.LatLng(BL.lat, BL.lng));
      const pBR = projection.fromLatLngToDivPixel(new google.maps.LatLng(BR.lat, BR.lng));
      const pTR = projection.fromLatLngToDivPixel(new google.maps.LatLng(TR.lat, TR.lng));
      const minX = Math.min(pTL.x, pBL.x, pBR.x, pTR.x);
      const maxX = Math.max(pTL.x, pBL.x, pBR.x, pTR.x);
      const minY = Math.min(pTL.y, pBL.y, pBR.y, pTR.y);
      const maxY = Math.max(pTL.y, pBL.y, pBR.y, pTR.y);
      const canvas = overlayDomRef.current.canvas;
      const container = overlayDomRef.current.container;
      const width = Math.max(1, Math.ceil(maxX - minX));
      const height = Math.max(1, Math.ceil(maxY - minY));
      container.style.left = `${minX}px`;
      container.style.top = `${minY}px`;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, width, height);

      const img = overlayImageRef.current;
      if (img) {
        const cols = 20, rows = 20;
        const imageOpacity = config?.sectorOverlayOpacity ?? 0.90;
        ctx.globalAlpha = imageOpacity;
        for (let r = 0; r < rows; r++) {
          const t0 = r / rows, t1 = (r + 1) / rows;
          for (let c = 0; c < cols; c++) {
            const s0 = c / cols, s1 = (c + 1) / cols;
            const dst00 = bilinear(s0, t0, pTL, pTR, pBL, pBR);
            const dst10 = bilinear(s1, t0, pTL, pTR, pBL, pBR);
            const dst01 = bilinear(s0, t1, pTL, pTR, pBL, pBR);
            const dst11 = bilinear(s1, t1, pTL, pTR, pBL, pBR);
            ctx.save();
            ctx.beginPath(); ctx.moveTo(dst00.x - minX, dst00.y - minY); ctx.lineTo(dst10.x - minX, dst10.y - minY); ctx.lineTo(dst11.x - minX, dst11.y - minY); ctx.closePath(); ctx.clip();
            setTransformFromTriangles(ctx, s0 * naturalSize.width, t0 * naturalSize.height, s1 * naturalSize.width, t0 * naturalSize.height, s1 * naturalSize.width, t1 * naturalSize.height, dst00.x - minX, dst00.y - minY, dst10.x - minX, dst10.y - minY, dst11.x - minX, dst11.y - minY);
            ctx.drawImage(img, 0, 0); ctx.restore();
            ctx.save();
            ctx.beginPath(); ctx.moveTo(dst00.x - minX, dst00.y - minY); ctx.lineTo(dst11.x - minX, dst11.y - minY); ctx.lineTo(dst01.x - minX, dst01.y - minY); ctx.closePath(); ctx.clip();
            setTransformFromTriangles(ctx, s0 * naturalSize.width, t0 * naturalSize.height, s1 * naturalSize.width, t1 * naturalSize.height, s0 * naturalSize.width, t1 * naturalSize.height, dst00.x - minX, dst00.y - minY, dst11.x - minX, dst11.y - minY, dst01.x - minX, dst01.y - minY);
            ctx.drawImage(img, 0, 0); ctx.restore();
          }
        }
        ctx.globalAlpha = 1.0;
      }

      // Draw lots - grey others, highlight selected
      (lots || []).forEach((lot) => {
        if (!lot.coordinates) return;
        const { x, y, width: w, height: h } = lot.coordinates;
        const p1 = bilinear(x / naturalSize.width, y / naturalSize.height, pTL, pTR, pBL, pBR);
        const p2 = bilinear((x + w) / naturalSize.width, y / naturalSize.height, pTL, pTR, pBL, pBR);
        const p3 = bilinear((x + w) / naturalSize.width, (y + h) / naturalSize.height, pTL, pTR, pBL, pBR);
        const p4 = bilinear(x / naturalSize.width, (y + h) / naturalSize.height, pTL, pTR, pBL, pBR);
        const poly = [ [p1.x - minX, p1.y - minY], [p2.x - minX, p2.y - minY], [p3.x - minX, p3.y - minY], [p4.x - minX, p4.y - minY] ];
        const isDest = selectedLot && Number(selectedLot.blockNumber) === Number(lot.blockNumber) && Number(selectedLot.lotNumber) === Number(lot.lotNumber);
        const color = isDest ? (LOT_TYPE_COLORS[lot.type] || "#00E676") : "#CCCCCC";
        const fill = isDest ? `${color}99` : `#CCCCCC80`;
        const stroke = isDest ? color : "#999999";
        const lineW = isDest ? 3 : 1.5;
        const ctx = overlayDomRef.current.canvas.getContext('2d');
        ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath();
        ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lineW; ctx.fill(); ctx.stroke();
      });
    };

    overlayView.draw = () => draw();
    overlayView.onRemove = () => {
      if (overlayDomRef.current.container && overlayDomRef.current.container.parentNode) {
        overlayDomRef.current.container.parentNode.removeChild(overlayDomRef.current.container);
      }
      overlayDomRef.current.canvas = null;
      overlayDomRef.current.container = null;
    };
    overlayView.setMap(map.current);
    overlayViewRef.current = overlayView;
    const listener = map.current.addListener('bounds_changed', draw);

    return () => {
      if (overlayViewRef.current) overlayViewRef.current.setMap(null);
      window.google?.maps?.event?.removeListener(listener);
    };
  }, [sectorCoords, naturalSize, lots, selectedLot, config]);

  // Text label overlay for infrastructure + route Start/Destination
  useEffect(() => {
    if (!map.current) return;
    const google = window.google;

    // Compose label points
    const labels = [...infraMarkers];
    labels.push({ title: 'Start', lat: MAIN_GATE.lat, lng: MAIN_GATE.lng, _variant: 'start' });
    if (selectedLot && sectorCoords && naturalSize.width && naturalSize.height) {
      const center = calculateLotCenter(selectedLot);
      if (center) labels.push({ title: 'Destination', lat: center.lat, lng: center.lng, _variant: 'dest' });
    }

    if (labelOverlayRef.current) { labelOverlayRef.current.setMap(null); labelOverlayRef.current = null; }

    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {
      const pane = overlay.getPanes();
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.pointerEvents = 'none';
      pane.overlayMouseTarget.appendChild(container);
      labelItemsRef.current = labels.flatMap(m => {
        const makeBubble = (title, color, outlined) => {
          const wrap = document.createElement('div');
          wrap.style.position = 'absolute';
          wrap.style.pointerEvents = 'none';
          const div = document.createElement('div');
          div.style.background = color || 'rgba(255,255,255,0.95)';
          div.style.border = outlined ? '1px solid rgba(255,255,255,0.6)' : '1px solid rgba(0,0,0,0.15)';
          div.style.borderRadius = '8px';
          div.style.padding = '3px 10px';
          div.style.fontSize = '12px';
          div.style.fontWeight = '700';
          div.style.color = color ? '#ffffff' : '#111827';
          div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.25)';
          div.textContent = title;
          const tail = document.createElement('div');
          tail.style.width = '0';
          tail.style.height = '0';
          tail.style.borderLeft = '6px solid transparent';
          tail.style.borderRight = '6px solid transparent';
          tail.style.borderTop = `8px solid ${color || 'rgba(255,255,255,0.95)'}`;
          tail.style.margin = '0 auto';
          tail.style.transform = 'translateY(-1px)';
          wrap.appendChild(div);
          wrap.appendChild(tail);
          container.appendChild(wrap);
          return wrap;
        };
        if (m.kind === 'segment' && m.from && m.to) {
          const a = m.from, b = m.to;
          const mid1 = { lat: (2*a.lat + b.lat)/3, lng: (2*a.lng + b.lng)/3 };
          const mid2 = { lat: (a.lat + 2*b.lat)/3, lng: (a.lng + 2*b.lng)/3 };
          const el1 = makeBubble(m.title, m.color, false);
          const el2 = makeBubble(m.title, m.color, false);
          return [ { el: el1, marker: { lat: mid1.lat, lng: mid1.lng } }, { el: el2, marker: { lat: mid2.lat, lng: mid2.lng } } ];
        } else {
          const color = m._variant === 'start' ? 'rgba(37,99,235,0.95)' : (m._variant === 'dest' ? 'rgba(14,165,233,0.95)' : (m.color || null));
          const outlined = !!m._variant;
          const el = makeBubble(m.title, color, outlined);
          return [ { el, marker: { lat: m.lat, lng: m.lng } } ];
        }
      });
      overlay._container = container;
    };
    overlay.draw = () => {
      const projection = overlay.getProjection();
      if (!projection || !overlay._container) return;
      labelItemsRef.current.forEach(item => {
        const latLng = new google.maps.LatLng(item.marker.lat, item.marker.lng);
        const pt = projection.fromLatLngToDivPixel(latLng);
        item.el.style.left = pt.x + 'px';
        item.el.style.top = pt.y + 'px';
        item.el.style.transform = 'translate(-50%, -100%)';
      });
    };
    overlay.onRemove = () => {
      if (overlay._container && overlay._container.parentNode) {
        overlay._container.parentNode.removeChild(overlay._container);
      }
      labelItemsRef.current = [];
      overlay._container = null;
    };
    overlay.setMap(map.current);
    labelOverlayRef.current = overlay;
    const redraw = map.current.addListener('bounds_changed', () => overlay.draw());
    return () => { overlay.setMap(null); window.google?.maps?.event?.removeListener(redraw); };
  }, [infraMarkers, selectedLot, sectorCoords, naturalSize]);

  const exitGuide = () => { navigate(`/dashboard/sector-on-map/${encodeURIComponent(garden)}/${encodeURIComponent(sector)}`); };

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "calc(100vh - 64px - 16px)" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%", borderRadius: 12 }} />
      {/* Hide exit button on mobile when menu is open */}
      {!(isMobile && openSidenav) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
          <button 
            onClick={exitGuide} 
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600 text-white text-xs sm:text-sm rounded-lg shadow-lg border border-red-700/40 hover:bg-red-700 transition-colors whitespace-nowrap"
          >
            Exit Directional Guide
          </button>
        </div>
      )}
    </div>
  );
}


