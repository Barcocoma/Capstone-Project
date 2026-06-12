import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button, Typography, Chip } from "@material-tailwind/react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useMaterialTailwindController } from "@/context";
import { API_ENDPOINTS } from "@/configs/api";

const STATUS_COLORS = {
  available: "#4CAF50",
  reserved: "#8B0000",
  occupied: "#9C27B0"
};

const LOT_TYPE_COLORS = {
  standard: "#FFD700",
  premium: "#2196F3",
  deluxe: "#FF8C00",
};

const SELECTED_LOT_COLORS = {
  fill: "#7C3AED", // distinct highlight (not used by status/type palettes)
  stroke: "#FFFFFF"
};

const CEMETERY_BOUNDS = { north: 14.2610, south: 14.2585, east: 121.1655, west: 121.1603 };

export default function SectorDetailPage() {
  const navigate = useNavigate();
  const { garden, sector } = useParams();
  const { user } = useAuth();
  const [controller] = useMaterialTailwindController();
  const { openSidenav } = controller;
  const mapRef = useRef(null);
  const map = useRef(null);
  const overlayViewRef = useRef(null);
  const overlayDomRef = useRef({ container: null, canvas: null, lotPolygons: [] });
  const overlayImageRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [sectorCoords, setSectorCoords] = useState(null);
  const [lots, setLots] = useState([]);
  const [selectedLot, setSelectedLot] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [showFilter, setShowFilter] = useState(true);
  const [uiConfig, setUiConfig] = useState({ sectorOverlayOpacity: 0.10 });
  const [infraMarkers, setInfraMarkers] = useState([]);
  const labelOverlayRef = useRef(null);
  const labelItemsRef = useRef([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const rafIdRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isCustomer = (user?.user_type === 'customer');
  const myUserId = user?.id;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  useEffect(() => {
    const loadSector = async () => {
      try {
        console.log('Loading sector data for:', garden, sector);
        const res = await fetch(API_ENDPOINTS.MAP_SECTORS_POLY);
        console.log('MAP_SECTORS_POLY response status:', res.status);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        console.log('MAP_SECTORS_POLY data:', data);
        const s = Array.isArray(data) ? data.find((d) => d.garden === decodeURIComponent(garden) && d.sector === decodeURIComponent(sector)) : null;
        if (s) {
          console.log('Found sector coordinates:', s.coordinates);
          setSectorCoords(s.coordinates);
        } else {
          console.warn('Sector not found for:', garden, sector);
        }
      } catch (error) {
        console.error('Error loading sector data:', error);
      }
    };
    loadSector();
  }, [garden, sector]);

  // Load shared infrastructure markers
  useEffect(() => {
    fetch(API_ENDPOINTS.MAP_MARKERS)
      .then(r => r.json())
      .then(data => setInfraMarkers(Array.isArray(data.points) ? data.points : []))
      .catch(()=> setInfraMarkers([]));
  }, []);

  useEffect(() => {
    const loadLots = async () => {
      try {
        const url = `${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(decodeURIComponent(garden))}&sector=${encodeURIComponent(decodeURIComponent(sector))}`;
        console.log('Loading lots from URL:', url);
        const res = await fetch(url);
        console.log('MAP_SECTOR_LOTS response status:', res.status);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        console.log('MAP_SECTOR_LOTS data:', data);
        setLots(data.lots || []);
        // If query has block & lot, preselect and zoom to it
        try {
          const params = new URLSearchParams(window.location.search || "");
          const qBlock = params.get('block');
          const qLot = params.get('lot');
          if (qBlock && qLot && Array.isArray(data.lots)) {
            const match = data.lots.find(l => String(l.blockNumber) === String(qBlock) && String(l.lotNumber) === String(qLot));
            if (match) setSelectedLot(match);
          }
        } catch (_) {}
      } catch (error) {
        console.error('Error loading lots data:', error);
      }
    };
    loadLots();
  }, [garden, sector]);

  // Fallback: if sector image not available, derive naturalSize from lot coordinates
  useEffect(() => {
    if ((!naturalSize.width || !naturalSize.height) && lots && lots.length > 0) {
      let maxX = 0, maxY = 0;
      lots.forEach(l => { if (l.coordinates) { const { x, y, width: w, height: h } = l.coordinates; maxX = Math.max(maxX, x + (w || 0)); maxY = Math.max(maxY, y + (h || 0)); } });
      if (maxX > 0 && maxY > 0) setNaturalSize({ width: Math.ceil(maxX), height: Math.ceil(maxY) });
    }
  }, [lots, naturalSize.width, naturalSize.height]);

  useEffect(() => {
    const img = new Image();
    const imagePath = `/img/map/${decodeURIComponent(garden)} - ${decodeURIComponent(sector)}.png`;
    console.log('Loading sector image:', imagePath);
    
    img.onload = () => { 
      console.log('Sector image loaded successfully:', imagePath);
      overlayImageRef.current = img; 
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight }); 
    };
    
    img.onerror = () => {
      console.error('Failed to load sector image:', imagePath);
    };
    
    img.src = imagePath;
  }, [garden, sector]);

  useEffect(() => {
    fetch(API_ENDPOINTS.MAP_UI_CONFIG).then(r => r.json()).then(cfg => setUiConfig(cfg || { sectorOverlayOpacity: 0.90 })).catch(() => {});
  }, []);

  const calculateLotCenter = (lot) => {
    if (!sectorCoords || !lot) return null;
    const { x, y, width: w, height: h } = lot.coordinates;
    const lotCenterX = x + w / 2;
    const lotCenterY = y + h / 2;
    const [TL, BL, BR, TR] = sectorCoords;
    const naturalWidth = naturalSize.width;
    const naturalHeight = naturalSize.height;
    const s = lotCenterX / naturalWidth;
    const t = lotCenterY / naturalHeight;
    const lotLat = TL[0] * (1 - s) * (1 - t) + TR[0] * s * (1 - t) + BL[0] * (1 - s) * t + BR[0] * s * t;
    const lotLng = TL[1] * (1 - s) * (1 - t) + TR[1] * s * (1 - t) + BL[1] * (1 - s) * t + BR[1] * s * t;
    return { lat: lotLat, lng: lotLng };
  };

  useEffect(() => {
    const init = () => {
      if (!map.current && mapRef.current) {
        map.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: 14.25978, lng: 121.16392 },
          zoom: 23,
          minZoom: 21,
          maxZoom: 26,
        mapTypeId: "satellite",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
          gestureHandling: "greedy",
          clickableIcons: false,
          keyboardShortcuts: false
        });
      }
    };
    
    // Check if Google Maps is already loaded
    if (window.google && window.google.maps) {
      init();
    } else {
      // Try to load Google Maps API with fallback
      const loadGoogleMaps = () => {
        const script = document.createElement('script');
        script.src = 'https://maps.gomaps.pro/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&libraries=geometry,places';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          console.log('Google Maps API loaded successfully');
          init();
        };
        script.onerror = () => {
          console.error('Failed to load Google Maps API');
          // Fallback: try official Google Maps API
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://maps.googleapis.com/maps/api/js?libraries=geometry,places';
          fallbackScript.async = true;
          fallbackScript.defer = true;
          fallbackScript.onload = () => {
            console.log('Fallback Google Maps API loaded');
            init();
          };
          fallbackScript.onerror = () => {
            console.error('Both Google Maps API sources failed');
          };
          document.head.appendChild(fallbackScript);
        };
        document.head.appendChild(script);
      };
      
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.api"]');
      if (!existingScript) {
        loadGoogleMaps();
      } else {
        // Wait for existing script to load
        const id = setInterval(() => {
          if (window.google && window.google.maps) {
            clearInterval(id);
            init();
          }
        }, 100);
        return () => clearInterval(id);
      }
    }
  }, []);

  // Keep a portal target that follows fullscreen changes
  useEffect(() => {
    const updateTarget = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
      setIsFullscreen(!!fsEl);
      setPortalTarget(fsEl || mapRef.current);
    };
    updateTarget();
    document.addEventListener('fullscreenchange', updateTarget);
    document.addEventListener('webkitfullscreenchange', updateTarget);
    document.addEventListener('MSFullscreenChange', updateTarget);
    return () => {
      document.removeEventListener('fullscreenchange', updateTarget);
      document.removeEventListener('webkitfullscreenchange', updateTarget);
      document.removeEventListener('MSFullscreenChange', updateTarget);
    };
  }, []);

  const resetView = () => {
    if (!map.current || !sectorCoords) return;
    const bounds = new window.google.maps.LatLngBounds();
    sectorCoords.forEach(([lat, lng]) => bounds.extend(new window.google.maps.LatLng(lat, lng)));
    map.current.fitBounds(bounds, 60);
    setTimeout(() => {
      map.current.setOptions({ maxZoom: 26 });
      map.current.setOptions({ minZoom: 21 });
      map.current.setOptions({ restriction: { latLngBounds: CEMETERY_BOUNDS, strictBounds: true } });
      const minZ = map.current.get('minZoom') || 21;
      setTimeout(() => { map.current.setZoom(minZ); }, 100);
    }, 150);
  };

  useEffect(() => { if (sectorCoords && map.current) setTimeout(resetView, 120); }, [sectorCoords]);

  // Drag functionality - optimized for performance
  const updatePosition = (clientX, clientY) => {
    if (!isDraggingRef.current || !dialogRef.current) return;
    
    const newX = clientX - dragStartRef.current.x;
    const newY = clientY - dragStartRef.current.y;
    
    // Get dialog dimensions - responsive sizing
    const isMobile = window.innerWidth < 640; // sm breakpoint
    const dialogWidth = isMinimized ? 320 : (isMobile ? window.innerWidth - 24 : 448);
    const dialogHeight = isMinimized ? 48 : (isMobile ? Math.min(window.innerHeight - 100, 500) : 448);
    
    // Constrain position within screen boundaries with padding
    const minX = 12; // 12px padding on mobile (0.75rem)
    const minY = 16;
    const maxX = window.innerWidth - dialogWidth - 12;
    const maxY = window.innerHeight - dialogHeight - 16;
    
    // Constrain position within screen boundaries
    const constrainedX = Math.max(minX, Math.min(newX, maxX));
    const constrainedY = Math.max(minY, Math.min(newY, maxY));
    
    // Direct DOM update for smooth dragging (no React re-render)
    if (dialogRef.current) {
      dialogRef.current.style.left = `${constrainedX}px`;
      dialogRef.current.style.top = `${constrainedY}px`;
    }
    
    // Update state for final position (batched)
    setDialogPosition({
      x: constrainedX,
      y: constrainedY
    });
  };

  const handleMouseMove = (e) => {
    e.preventDefault();
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      updatePosition(e.clientX, e.clientY);
    });
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      updatePosition(touch.clientX, touch.clientY);
    });
  };

  const handleStart = (clientX, clientY) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: clientX - dialogPosition.x,
      y: clientY - dialogPosition.y
    };
    setIsDragging(true);
    setDragStart(dragStartRef.current);
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('.no-drag')) return;
    e.preventDefault();
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleEnd = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false });
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
      return () => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging]);

  // Reset position when lot changes
  useEffect(() => {
    if (selectedLot) {
      const isMobile = window.innerWidth < 640; // sm breakpoint
      const dialogWidth = isMinimized ? Math.min(window.innerWidth - 24, 320) : (isMobile ? window.innerWidth - 24 : 448);
      const mapContainer = mapRef.current;
      
      if (isMobile) {
        // On mobile: position at top with proper spacing (12px from edges = 1.5rem)
        const x = 12; // 12px from left edge (0.75rem)
        
        if (mapContainer) {
          const mapRect = mapContainer.getBoundingClientRect();
          const y = mapRect.top + 80; // Below navbar, at top of map
          setDialogPosition({ x, y });
        } else {
          const y = 80;
          setDialogPosition({ x, y });
        }
      } else {
        // Desktop: original centered behavior
        const dialogHeight = isMinimized ? 48 : 448;
        
        if (mapContainer) {
          const mapRect = mapContainer.getBoundingClientRect();
          
          const centerX = mapRect.left + (mapRect.width - dialogWidth) / 2;
          const centerY = mapRect.top + (mapRect.height - dialogHeight) / 2;
          
          // Ensure it stays within map boundaries with padding
          const minX = Math.max(mapRect.left, 16);
          const minY = Math.max(mapRect.top, 16);
          const maxX = Math.min(mapRect.right - dialogWidth, window.innerWidth - dialogWidth - 16);
          const maxY = Math.min(mapRect.bottom - dialogHeight, window.innerHeight - dialogHeight - 16);
          
          const constrainedX = Math.max(minX, Math.min(centerX, maxX));
          const constrainedY = Math.max(minY, Math.min(centerY, maxY));
          
          setDialogPosition({ x: constrainedX, y: constrainedY });
        } else {
          // Fallback to screen center if map not ready
          const centerX = Math.max(16, (window.innerWidth - dialogWidth) / 2);
          const centerY = Math.max(16, (window.innerHeight - dialogHeight) / 2);
          setDialogPosition({ x: centerX, y: centerY });
        }
      }
    }
  }, [selectedLot, isMinimized]);

  // Restrict map bounds to current sector area
  useEffect(() => {
    if (!map.current || !sectorCoords || !sectorCoords.length) return;
    const lats = sectorCoords.map(([lat]) => lat);
    const lngs = sectorCoords.map(([, lng]) => lng);
    const margin = 0.0002;
    const boundsLiteral = {
      north: Math.max(...lats) + margin,
      south: Math.min(...lats) - margin,
      east: Math.max(...lngs) + margin,
      west: Math.min(...lngs) - margin,
    };
    map.current.setOptions({ maxZoom: 26 });
    map.current.setOptions({ minZoom: 21 });
    map.current.setOptions({
      restriction: { latLngBounds: boundsLiteral, strictBounds: true },
    });
  }, [sectorCoords]);

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
      container.style.pointerEvents = "auto";
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
        const imageOpacity = uiConfig?.sectorOverlayOpacity ?? 0.90;
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

      overlayDomRef.current.lotPolygons = [];
      overlayDomRef.current.clickableRegions = [];
      (lots || []).forEach((lot) => {
        const { x, y, width: w, height: h } = lot.coordinates;
        const p1 = bilinear(x / naturalSize.width, y / naturalSize.height, pTL, pTR, pBL, pBR);
        const p2 = bilinear((x + w) / naturalSize.width, y / naturalSize.height, pTL, pTR, pBL, pBR);
        const p3 = bilinear((x + w) / naturalSize.width, (y + h) / naturalSize.height, pTL, pTR, pBL, pBR);
        const p4 = bilinear(x / naturalSize.width, (y + h) / naturalSize.height, pTL, pTR, pBL, pBR);
        const poly = [ [p1.x - minX, p1.y - minY], [p2.x - minX, p2.y - minY], [p3.x - minX, p3.y - minY], [p4.x - minX, p4.y - minY] ];
        overlayDomRef.current.lotPolygons.push({ lot, screenPoints: poly });

        // Role-based color & interactivity: customers see only their own lots colored & clickable
        let fillColor;
        let strokeColor;
        let clickable = true;
        
        // Determine lot type color (for outline)
        const lotTypeColor = LOT_TYPE_COLORS[lot.type] || "#999";
        
        if (statusFilter) {
          // When status filter is active: fill shows status, outline always shows lot type
          if (lot.status === statusFilter) {
            fillColor = STATUS_COLORS[lot.status] || "#999";
          } else {
            fillColor = "#CCCCCC";
          }
          strokeColor = lotTypeColor; // Outline always shows lot type, even for non-matching lots
        } else {
          // When no status filter: both fill and outline show lot type
          fillColor = lotTypeColor;
          strokeColor = lotTypeColor;
        }
        
        if (isCustomer) {
          const owned = (myUserId && lot.ownerId && Number(lot.ownerId) === Number(myUserId));
          if (!owned) { 
            fillColor = "#CCCCCC"; 
            strokeColor = "#CCCCCC"; 
            clickable = false; 
          }
        }

          const ctx = overlayDomRef.current.canvas.getContext('2d');
          ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath();
          
          // Check if this is the selected lot for highlighting
          const isSelected = selectedLot && 
            selectedLot.blockNumber === lot.blockNumber && 
            selectedLot.lotNumber === lot.lotNumber;
          
          if (isSelected) {
            // Selected: use dedicated highlight colors to make it stand out clearly
            ctx.fillStyle = `${SELECTED_LOT_COLORS.fill}B3`; // ~70% opacity
            ctx.fill();
            ctx.strokeStyle = SELECTED_LOT_COLORS.stroke;
            ctx.lineWidth = 4;
            ctx.stroke();
          } else {
            // Normal drawing: fill uses fillColor, stroke uses strokeColor
            ctx.fillStyle = `${fillColor}80`; 
            ctx.strokeStyle = strokeColor; 
            ctx.lineWidth = 2; 
            ctx.fill(); 
            ctx.stroke();
          }
        if (clickable) {
          overlayDomRef.current.clickableRegions.push({ poly, lot });
        }
      });
    };

    const handleClick = (ev) => {
      const canvas = overlayDomRef.current.canvas; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left; const y = ev.clientY - rect.top;
      const pointInPolygon = (pt, poly) => {
        let inside = false; let xi, yi, xj, yj; const px = pt[0], py = pt[1];
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { xi = poly[i][0]; yi = poly[i][1]; xj = poly[j][0]; yj = poly[j][1]; const intersect = (yi > py) !== (yj > py) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi); if (intersect) inside = !inside; }
        return inside;
      };
      const regions = overlayDomRef.current.clickableRegions || [];
      const hit = regions.find((lp) => pointInPolygon([x, y], lp.poly));
      if (hit) setSelectedLot(hit.lot);
    };

    overlayView.draw = () => draw();
    overlayView.onRemove = () => {
      if (overlayDomRef.current.container && overlayDomRef.current.container.parentNode) {
        overlayDomRef.current.container.parentNode.removeChild(overlayDomRef.current.container);
      }
      overlayDomRef.current.canvas = null;
      overlayDomRef.current.container = null;
      overlayDomRef.current.lotPolygons = [];
    };
    overlayView.setMap(map.current);
    overlayViewRef.current = overlayView;
    const listener = map.current.addListener('bounds_changed', draw);

    // Click handler: ensure single click works
    const attachClick = () => {
      const canvas = overlayDomRef.current.canvas; if (!canvas) return;
      const handler = (ev) => { ev.preventDefault(); ev.stopPropagation(); handleClick(ev); };
      canvas.addEventListener('click', handler, { passive: false });
      overlayDomRef.current._clickHandler = handler;
    };
    setTimeout(attachClick, 50);

    return () => {
      if (overlayViewRef.current) overlayViewRef.current.setMap(null);
      if (overlayDomRef.current.canvas && overlayDomRef.current._clickHandler) overlayDomRef.current.canvas.removeEventListener('click', overlayDomRef.current._clickHandler);
        window.google?.maps?.event?.removeListener(listener);
      };
    }, [sectorCoords, naturalSize, lots, statusFilter, isCustomer, user, selectedLot]);

  // Overlay for text labels (infrastructure) – supports point + segment
  useEffect(() => {
    if (!map.current || !infraMarkers.length) return;
    const google = window.google;

    if (labelOverlayRef.current) { labelOverlayRef.current.setMap(null); labelOverlayRef.current = null; }

    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {
      const pane = overlay.getPanes();
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.pointerEvents = 'none';
      pane.overlayMouseTarget.appendChild(container);
      labelItemsRef.current = infraMarkers.flatMap(m => {
        const makeBubble = (title, color) => {
          const wrap = document.createElement('div');
          wrap.style.position = 'absolute';
          wrap.style.pointerEvents = 'none';
          const div = document.createElement('div');
          div.style.background = color || 'rgba(255,255,255,0.95)';
          div.style.border = '1px solid rgba(0,0,0,0.15)';
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
          const el1 = makeBubble(m.title, m.color);
          const el2 = makeBubble(m.title, m.color);
          return [ { el: el1, marker: { lat: mid1.lat, lng: mid1.lng } }, { el: el2, marker: { lat: mid2.lat, lng: mid2.lng } } ];
        } else {
          const el = makeBubble(m.title, m.color);
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
  }, [infraMarkers]);

  const closeTabOrBack = () => {
    if (isCustomer) {
      navigate('/dashboard/customer-lot-map');
    } else {
      navigate('/dashboard/lot-map');
    }
  };
  const zoomIn = () => { const z = map.current?.getZoom() || 23; const maxZ = map.current?.get('maxZoom') || 26; map.current?.setZoom(Math.min(z + 1, maxZ)); };
  const zoomOut = () => { const z = map.current?.getZoom() || 23; const minZ = map.current?.get('minZoom') || 21; map.current?.setZoom(Math.max(z - 1, minZ)); };

  const decodedGarden = decodeURIComponent(garden || "");
  const decodedSector = decodeURIComponent(sector || "");

  return (
    <div className="relative w-full">
      <div ref={mapRef} style={{ width: "100%", height: "calc(100vh - 64px - 16px)", minHeight: 520, borderRadius: 12, marginTop: 8, position: 'relative' }} />
      {/* Hide control buttons on mobile when sidenav menu is open */}
      {!(isMobile && openSidenav) && (
        <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
          <Button size="sm" color="blue" onClick={closeTabOrBack}>← Back</Button>
          <Button size="sm" color="gray" onClick={resetView}>Reset View</Button>
          <Button size="sm" color="gray" onClick={zoomIn}>Zoom In</Button>
          <Button size="sm" color="gray" onClick={zoomOut}>Zoom Out</Button>
        </div>
      )}

      {/* Lot Legend and Filter (staff/admin) - Hide on mobile when menu is open */}
      {!isCustomer && !(isMobile && openSidenav) && (
        <div className="absolute bottom-6 left-6 z-[1000] flex flex-col gap-3">
          <button
            type="button"
            className="max-w-xs rounded-md bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1"
          >
            {decodedGarden || 'Garden'} • Sector {decodedSector || ''}
          </button>
          {showFilter ? (
            <div className="bg-white/90 rounded-lg p-4 shadow-lg max-w-xs">
              <div className="flex items-center justify-between mb-2">
                <Typography variant="h6">Lot Legend</Typography>
                <Button size="sm" variant="text" color="blue" onClick={()=>setShowFilter(false)}>Hide Legend</Button>
              </div>
              <div className="mb-3">
                <Typography variant="small" className="font-semibold mb-2 text-gray-700">Filter by Status</Typography>
                <div className="flex gap-2 flex-wrap">
                  {['available','reserved','occupied'].map(st => (
                    <button key={st} onClick={()=> setStatusFilter(prev=> prev===st ? null : st)} className={`px-2 py-1 rounded text-xs border shadow-sm ${statusFilter===st? 'text-white border-transparent' : 'bg-white text-gray-800 border-gray-400 hover:bg-gray-50'}`} style={{ backgroundColor: statusFilter===st ? (STATUS_COLORS[st] || '#1976d2') : undefined }}>
                      {st.charAt(0).toUpperCase()+st.slice(1)}
                    </button>
                  ))}
                  {statusFilter && (
                    <button onClick={()=> setStatusFilter(null)} className="px-2 py-1 rounded text-xs bg-gray-200 text-gray-800 border border-gray-300">Clear</button>
                  )}
                </div>
              </div>
              <div>
                <Typography variant="small" className="font-semibold mb-2 text-gray-700">Lot Types</Typography>
                <div className="space-y-1">
                  {Object.entries(LOT_TYPE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                      <span className="text-sm capitalize">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button onClick={()=>setShowFilter(true)} className="mt-2 px-3 py-1.5 text-sm bg-white/90 rounded shadow border border-gray-300 text-sm">Show Legend</button>
          )}
        </div>
      )}

      {selectedLot && portalTarget && createPortal(
        <div className={`${isFullscreen ? 'fixed' : 'absolute'} inset-0 pointer-events-none`} style={{ zIndex: 2147483647 }}>
          <div
            ref={dialogRef}
            className={`absolute bg-white rounded-lg shadow-xl pointer-events-auto flex flex-col transition-all duration-200 ${isMinimized ? 'w-72 sm:w-80 h-12' : 'w-[calc(100vw-1.5rem)] sm:w-[28rem] max-w-[calc(100vw-1.5rem)] sm:max-w-[28rem] h-auto max-h-[calc(100vh-11rem)] sm:max-h-[calc(100vh-6.25rem)]'} ${isDragging ? 'select-none' : ''}`}
            style={{ left: dialogPosition.x, top: dialogPosition.y, cursor: isDragging ? 'grabbing' : 'grab', userSelect: isDragging ? 'none' : 'auto', touchAction: 'none' }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with drag handle and minimize button */}
            <div className="flex items-center justify-between p-2 sm:p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg cursor-grab flex-shrink-0">
              <Typography variant="h6" className="text-sm font-semibold truncate flex-1 mr-2">
                {selectedLot.gardenName} S{selectedLot.sectorName} B{selectedLot.blockNumber} L{selectedLot.lotNumber}
              </Typography>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button
                  className="no-drag p-1 hover:bg-gray-200 rounded text-gray-600 text-sm"
                  onClick={() => setIsMinimized(!isMinimized)}
                >
                  {isMinimized ? '□' : '−'}
                </button>
                <button
                  className="no-drag p-1 hover:bg-gray-200 rounded text-gray-600 text-sm"
                  onClick={() => setSelectedLot(null)}
                >
                  ×
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                <div className="p-2 sm:p-3 md:p-4 overflow-y-auto flex-1">
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:gap-3 mb-2 sm:mb-3 md:mb-4">
                    <div className="text-sm"><strong className="block text-sm text-gray-600">Availability:</strong> <span className="capitalize">{selectedLot.status}</span></div>
                    <div className="text-sm"><strong className="block text-sm text-gray-600">Price:</strong> <span>₱{selectedLot.price?.toLocaleString() || 'N/A'}</span></div>
                    <div className="text-sm"><strong className="block text-sm text-gray-600">Type:</strong> <span className="capitalize">{selectedLot.type}</span></div>
                    <div className="text-sm"><strong className="block text-sm text-gray-600">Size:</strong> <span>1 meter x 2.5 meter</span></div>
                    <div className="text-sm col-span-2"><strong className="block text-sm text-gray-600">Block:</strong> <span>{selectedLot.blockNumber}</span></div>
                  </div>

                  {selectedLot.owner ? (
                    <div className="mb-2 sm:mb-3 p-2 sm:p-3 bg-blue-50 rounded">
                      <Typography variant="h6" className="font-semibold mb-1 sm:mb-2 text-sm">Owner Information</Typography>
                      <div className="text-sm"><strong>Name:</strong> {selectedLot.owner}</div>
                      {selectedLot.ownerContact && (<div className="text-sm"><strong>Contact:</strong> {selectedLot.ownerContact}</div>)}
                    </div>
                  ) : (
                    <div className="mb-2 sm:mb-3 p-2 sm:p-3 bg-gray-50 rounded">
                      <Typography variant="h6" className="font-semibold mb-1 sm:mb-2 text-sm">Owner Information</Typography>
                      <div className="text-gray-600 text-sm">No owner assigned yet. This lot is {selectedLot.status}.</div>
                    </div>
                  )}

                  <div className="mb-2 sm:mb-3 p-2 sm:p-3 bg-purple-50 rounded">
                    <Typography variant="h6" className="font-semibold mb-1 sm:mb-2 text-sm">Vault Details</Typography>
                    <div className="grid grid-cols-2 gap-1 sm:gap-2 text-sm">
                      <div className="col-span-2"><strong>Vault:</strong> {selectedLot.vault?.option || 'No vault selected'}</div>
                      <div><strong>L Body:</strong> {selectedLot.vault?.lower_body ?? 0}</div>
                      <div><strong>U Body:</strong> {selectedLot.vault?.upper_body ?? 0}</div>
                      <div><strong>L Bone:</strong> {selectedLot.vault?.lower_bone ?? 0}</div>
                      <div><strong>U Bone:</strong> {selectedLot.vault?.upper_bone ?? 0}</div>
                    </div>
                  </div>

                  {!!(selectedLot.deceasedRecords && selectedLot.deceasedRecords.length) && (
                    <div className="mb-2 sm:mb-3 p-2 sm:p-3 bg-amber-50 rounded">
                      <Typography variant="h6" className="font-semibold mb-1 sm:mb-2 text-sm">Deceased Records ({selectedLot.deceasedRecords.length})</Typography>
                      <div className="space-y-2 max-h-36 sm:max-h-40 md:max-h-48 overflow-y-auto">
                        {selectedLot.deceasedRecords.map((d)=> (
                          <div key={d.id} className="border border-amber-200 rounded p-1.5 sm:p-2 md:p-3">
                            <div className="font-semibold text-sm">{d.name}</div>
                            <div className="grid grid-cols-2 gap-1 sm:gap-1.5 text-sm mt-1">
                              <div><strong>Birth:</strong> {d.dateOfBirth || 'N/A'}</div>
                              <div><strong>Death:</strong> {d.dateOfDeath || 'N/A'}</div>
                              <div><strong>Burial:</strong> {d.burialDate || 'N/A'}</div>
                              <div><strong>Status:</strong> {d.status}</div>
                              <div className="col-span-2"><strong>Cause:</strong> {d.causeOfDeath || 'N/A'}</div>
                              <div className="col-span-2"><strong>Funeral:</strong> {d.funeralHome || 'N/A'}</div>
                              {d.notes && (<div className="col-span-2"><strong>Notes:</strong> {d.notes}</div>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="border-t border-gray-200 p-2 sm:p-3 flex gap-2 justify-end flex-shrink-0">
                  <Button size="sm" color="blue" onClick={() => navigate(`/dashboard/directional-guide/${encodeURIComponent(garden)}/${encodeURIComponent(sector)}/${selectedLot.lotNumber}/${selectedLot.blockNumber}`)} className="no-drag text-sm px-2 py-1.5 sm:px-3 sm:py-2">Show Direction</Button>
                </div>
              </>
            )}
          </div>
        </div>,
        portalTarget
      )}
    </div>
  );
}


