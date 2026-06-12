import React, { useEffect, useRef, useState } from "react";
import { Typography } from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "@/configs/api";
import { useAuth } from "@/context/AuthContext";
import { useMaterialTailwindController } from "@/context";

// Divine Life Memorial Park center and bounds
const CEMETERY_CENTER = { lat: 14.25978388400147, lng: 121.16392465423067 };
const CEMETERY_BOUNDS = {
  north: 14.2611,
  south: 14.2585,
  east: 121.1655,
  west: 121.1603
};

// Infrastructure labels will be loaded from API and rendered as text labels

const colorMap = {
  "Joy Garden": "#FFD700",
  "Peace Garden": "#00CED1",
  "Hope Garden": "#90EE90",
  "Faith Garden": "#87CEEB",
  "Love Garden": "#F4A460",
};

export default function GoogleMapView() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const polygonsRef = useRef([]);
  const ownedLotsMarkersRef = useRef([]);
  const containerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [sectors, setSectors] = useState([]);
  const [infraMarkers, setInfraMarkers] = useState([]);
  const [customerLots, setCustomerLots] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const labelOverlayRef = useRef(null);
  const labelItemsRef = useRef([]);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [controller] = useMaterialTailwindController();
  const { openSidenav } = controller;
  
  const isCustomer = user?.user_type === 'customer' || user?.account_type === 'customer';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  useEffect(() => {
    const url = API_ENDPOINTS.MAP_SECTORS_POLY;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => Array.isArray(data) ? setSectors(data) : setSectors([]))
      .catch((e)=>{
        console.warn('Failed to load sectors:', e);
        setSectors([]);
      });
  }, []);

  // Load shared infrastructure markers
  useEffect(() => {
    fetch(API_ENDPOINTS.MAP_MARKERS)
      .then(r => r.json())
      .then(data => setInfraMarkers(Array.isArray(data.points) ? data.points : []))
      .catch(()=> setInfraMarkers([]));
  }, []);

  // Load customer's owned lots if user is customer
  useEffect(() => {
    if (!isCustomer || !user?.id) return;
    
    fetch('/api/get_customer_lots.php', {
      method: 'GET',
      headers: {
        'X-User-Id': user.id.toString(),
        'Content-Type': 'application/json'
      }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.customerLots) {
          setCustomerLots(data.customerLots);
        }
      })
      .catch(err => {
        console.warn('Failed to load customer lots:', err);
      });
  }, [isCustomer, user?.id]);

  // Fullscreen toggle with F key
  useEffect(() => {
    const toggleFullscreen = () => {
      if (!containerRef.current) return;
      
      const element = containerRef.current;
      
      // Check if currently in fullscreen
      const isFullscreen = document.fullscreenElement || 
                          document.webkitFullscreenElement || 
                          document.mozFullScreenElement || 
                          document.msFullscreenElement;
      
      if (!isFullscreen) {
        // Enter fullscreen
        if (element.requestFullscreen) {
          element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          element.msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    };

    const handleKeyPress = (e) => {
      // Check if F key is pressed (case insensitive) and not in an input field
      if ((e.key === 'f' || e.key === 'F') && 
          e.target.tagName !== 'INPUT' && 
          e.target.tagName !== 'TEXTAREA' &&
          !e.target.isContentEditable) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    const handleFullscreenChange = () => {
      // Update fullscreen state
      const isCurrentlyFullscreen = !!(document.fullscreenElement || 
                                       document.webkitFullscreenElement || 
                                       document.mozFullScreenElement || 
                                       document.msFullscreenElement);
      setIsFullscreen(isCurrentlyFullscreen);
      
      // Trigger map resize when entering/exiting fullscreen
      if (mapInstance.current) {
        setTimeout(() => {
          window.google?.maps?.event?.trigger(mapInstance.current, 'resize');
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Initialize map when Google script is ready
  useEffect(() => {
    const init = () => {
      setStatus("loaded");
      if (!mapInstance.current && mapRef.current) {
        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          center: CEMETERY_CENTER,
          zoom: 19,
          minZoom: 18,
          maxZoom: 21,
          restriction: { latLngBounds: CEMETERY_BOUNDS, strictBounds: true },
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
          clickableIcons: false,
          keyboardShortcuts: false,
          mapTypeId: "satellite",
        });
        // labels rendered via overlay below
      }
    };
    if (window.google && window.google.maps) {
      init();
    } else {
      setStatus("not_loaded");
      // Poll briefly in case the script is still downloading
      const id = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(id);
          clearTimeout(fallbackTimer);
          init();
        }
      }, 100);

      // Fallback loader: if SDK still not present after a short delay,
      // inject an additional script from the official Google domain using
      // the same API key (if found in existing script tags). This does not
      // remove or modify existing scripts.
      const fallbackTimer = setTimeout(() => {
        if (window.google && window.google.maps) return;
        try {
          const scripts = Array.from(document.querySelectorAll('script[src]'));
          const existing = scripts.find(s => /maps\.*api\/js/i.test(s.src));
          let key = "";
          if (existing) {
            try {
              const u = new URL(existing.src, window.location.origin);
              key = u.searchParams.get("key") || "";
            } catch (_) {}
          }
          const src = `https://maps.googleapis.com/maps/api/js?${key ? `key=${key}&` : ""}libraries=geometry,places`;
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.defer = true;
          s.onload = () => {
            setStatus("loaded");
            init();
          };
          s.onerror = () => setStatus("not_loaded");
          document.head.appendChild(s);
        } catch (_) {
          // ignore
        }
      }, 2000);

      return () => {
        clearInterval(id);
        clearTimeout(fallbackTimer);
      };
    }
  }, []);

  useEffect(() => {
    if (!mapInstance.current || sectors.length === 0) return;
    polygonsRef.current.forEach((poly) => poly.setMap(null));
    polygonsRef.current = [];
    
    // Create a set of sectors that contain customer's lots (for customers)
    const sectorsWithOwnedLots = new Set();
    if (isCustomer && customerLots.length > 0) {
      customerLots.forEach(lot => {
        const sectorKey = `${lot.garden_name || ''}-${lot.sector_name || ''}`;
        sectorsWithOwnedLots.add(sectorKey.toLowerCase());
      });
    }
    
    // Create bounds to fit all sectors
    const bounds = new window.google.maps.LatLngBounds();
    
    sectors.forEach((sector) => {
      const sectorKey = `${sector.garden}-${sector.sector}`;
      const hasOwnedLots = sectorsWithOwnedLots.has(sectorKey.toLowerCase());
      
      // Use different colors/styling for sectors with owned lots (for customers)
      const baseColor = colorMap[sector.garden] || "#333";
      const strokeColor = hasOwnedLots && isCustomer ? "#FF0000" : baseColor;
      const strokeWeight = hasOwnedLots && isCustomer ? 5 : 3;
      const fillOpacity = hasOwnedLots && isCustomer ? 0.6 : 0.4;
      
      const polygon = new window.google.maps.Polygon({
        paths: sector.coordinates.map(([lat, lng]) => ({ lat, lng })),
        map: mapInstance.current,
        strokeColor: strokeColor,
        strokeOpacity: 0.9,
        strokeWeight: strokeWeight,
        fillColor: baseColor,
        fillOpacity: fillOpacity,
        clickable: true,
        zIndex: hasOwnedLots && isCustomer ? 15 : 10, // Higher z-index for owned sectors
      });
      
      // Extend bounds with all coordinates of this sector
      sector.coordinates.forEach(([lat, lng]) => {
        bounds.extend(new window.google.maps.LatLng(lat, lng));
      });
      
      polygon.addListener("click", () => {
        const gardenName = encodeURIComponent(sector.garden);
        const sectorName = encodeURIComponent(sector.sector);
        navigate(`/dashboard/sector-on-map/${gardenName}/${sectorName}`);
      });
      polygon.addListener("mouseover", () => {
        polygon.setOptions({ fillOpacity: 0.7, strokeColor: "#1976d2", strokeWeight: 4 });
        mapInstance.current.setOptions({ draggableCursor: "pointer" });
      });
      polygon.addListener("mouseout", () => {
        polygon.setOptions({ 
          fillOpacity: fillOpacity, 
          strokeColor: strokeColor, 
          strokeWeight: strokeWeight 
        });
        mapInstance.current.setOptions({ draggableCursor: null });
      });
      polygonsRef.current.push(polygon);
    });
    
    // Fit map to show all sectors with padding
    if (polygonsRef.current.length > 0) {
      mapInstance.current.fitBounds(bounds, {
        top: 80,
        right: 80,
        bottom: 80,
        left: 80
      });
    }
    
    return () => { polygonsRef.current.forEach((poly) => poly.setMap(null)); polygonsRef.current = []; };
  }, [sectors, navigate, isCustomer, customerLots]);

  // Text labels overlay for infrastructure (supports point + segment)
  useEffect(() => {
    if (!mapInstance.current) return;
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
          return [ { el: el1, marker: { kind: 'point', lat: mid1.lat, lng: mid1.lng } }, { el: el2, marker: { kind: 'point', lat: mid2.lat, lng: mid2.lng } } ];
        } else {
          const el = makeBubble(m.title, m.color);
          return [ { el, marker: { kind: 'point', lat: m.lat, lng: m.lng } } ];
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
    overlay.setMap(mapInstance.current);
    labelOverlayRef.current = overlay;
    const redraw = mapInstance.current.addListener('bounds_changed', () => overlay.draw());
    return () => { overlay.setMap(null); window.google?.maps?.event?.removeListener(redraw); };
  }, [infraMarkers]);

  let errorMsg = null;
  if (status === "not_loaded") {
    errorMsg = (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-2 absolute top-4 left-1/2 transform -translate-x-1/2 z-50 text-xs sm:text-sm">
        Map failed to load. Check your API key and network.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {errorMsg}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-white/90 rounded-lg px-2 sm:px-4 md:px-6 py-1 sm:py-2 shadow-lg max-w-[calc(100vw-2rem)]">
        <Typography variant="h5" color="blue-gray" className="text-xs sm:text-base md:text-xl lg:text-2xl text-center leading-tight sm:leading-normal">
          Divine Life Memorial Park
        </Typography>
      </div>
      <div 
        ref={mapRef} 
        style={{ 
          width: "100%", 
          height: isFullscreen ? "100vh" : "calc(100vh - 64px - 16px)", 
          minHeight: isFullscreen ? "100vh" : 400, 
          borderRadius: isFullscreen ? 0 : 12, 
          marginTop: isFullscreen ? 0 : 8 
        }} 
        className={isFullscreen ? "" : "sm:min-h-[520px]"} 
      />
      <div className="absolute bottom-4 sm:bottom-20 md:bottom-6 left-2 sm:left-6 bg-white/90 rounded-lg p-2 sm:p-3 md:p-4 shadow-lg z-10 max-w-[calc(100vw-1rem)] sm:max-w-[250px] md:max-w-xs">
        <Typography variant="h6" color="blue-gray" className="mb-1 sm:mb-2 text-xs sm:text-sm md:text-base">Map Legend</Typography>
        <div className="mt-1 sm:mt-2 space-y-1">
          {Object.entries(colorMap).map(([garden, color]) => (
            <div key={garden} className="flex items-center gap-1 sm:gap-2">
              <span style={{ display: "inline-block", width: 12, height: 12, background: color, border: "1.5px solid #333", borderRadius: 3 }} className="sm:w-[16px] sm:h-[16px] md:w-[18px] md:h-[18px] flex-shrink-0" />
              <span className="text-sm font-medium truncate">{garden}</span>
            </div>
          ))}
        </div>
        {isCustomer && customerLots.length > 0 && (
          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-blue-gray-200">
            <div className="flex items-center gap-1 sm:gap-2">
              <span style={{ 
                display: "inline-block", 
                width: 12, 
                height: 12, 
                background: "transparent", 
                border: "2px solid #FF0000", 
                borderRadius: 3 
              }} className="sm:w-[16px] sm:h-[16px] sm:border-[2.5px] md:w-[18px] md:h-[18px] md:border-[3px] flex-shrink-0" />
              <span className="text-sm font-medium text-red-700 truncate">Your Lots ({customerLots.length})</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


