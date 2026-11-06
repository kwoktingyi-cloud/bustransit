/* =========================================================================
   KMB (九巴) + CTB (城巴) + GMB (專線小巴) 實時到站與轉車導航系統
   （100% 清理重複 Function 完整版）
   ========================================================================= */

const KMB_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const CTB_BASE = "https://rt.data.gov.hk/v2/transport/citybus";
const GMB_BASE = "https://data.etagmb.gov.hk";

const API_BASE = {
  KMB: KMB_BASE,
  CTB: CTB_BASE,
  GMB: GMB_BASE
};

// 全域狀態變數
let allRoutes = [];
let uniqueRoutes = [];
let allStopsMap = new Map();
let currentRoute = null;
let currentServiceType = "1";
let currentDirection = null;
let currentDirectionCode = null;
let routeStops = [];
let inboundTerminalName = "?";
let outboundTerminalName = "?";
let currentInput = "";
let candidateRoutes = [];
let currentStopId = null;
let keyboardHidden = false;
let mainEtaTimer = null;
let transferEtaTimer = null;

let mode = "normal"; // normal | interchange_pick | interchange_pair
let originStopId = null;
let originSeq = null;
let transferStopId = null;
let transferSeq = null;
let transferStopName = null;
let currentTransferStopId = null;
let currentTransferSeq = null;

let transferRoute = null;
let transferServiceType = "1";
let transferDirection = null;
let transferDirectionCode = null;
let transferRouteStops = [];
let transferCurrentStopId = null;
let transferEtaTimesByStop = {};
let transferCurrentInput = "";
let transferCandidateRoutes = [];
let transferKeyboardHidden = false;

let routesByStopId = {};
let etaTimesByStop = {};
let cumulativeTravelFromOrigin = null;
let trackedTransferArriveTime = null;

let selectedEtaId = null;
let selectedEtaTime = null;
let selectedEtaStatus = null;

let map = null;
let stopsLayer = null;
let userLat = null;
let userLon = null;
let userLocationMarker = null;
let userToStopRouteLayer = null;

let allStopMarkers = [];
let secondRouteMarkers = [];
let transferLine = null;
let secondTransferStopId = null;

let osrmGeometryCache = new Map();
let mainRouteRenderToken = 0;
let secondRouteRenderToken = 0;
let currentSheetState = "collapsed";

let currentWalkDistMeters = null;
let currentWalkMinutes = null;
let busNotificationTimer = null;
let activeBusNotification = null;
let keepAliveAudio = null;
let bgTimerWorker = null;
let gpsWatchId = null;

// 專線小巴快取與輔助狀態
let gmbRouteDetailCache = new Map();
let gmbStopNameCache = new Map();
let gmbPrefetchLock = new Set();

const STORAGE_KEY = "bus_app_state";
const EXPIRY_TIME = 3600000;

// 後備小巴路線表（當動態拉取被防火牆或 CORS 攔截時自動頂上，確保永不空白）
const FALLBACK_GMB_ROUTES = {
  HKI: ["1","1A","2","3","3A","4A","4B","4C","4M","4S","5","5M","8","8X","9","10","10P","10S","11","12","13","14M","16A","16M","16X","18M","20","20M","21A","21M","22","22S","22X","23","23M","24A","24M","25","26","27","27A","28","28M","28S","29","29A","30","31","31X","32","32A","33","33M","35M","36X","37","37A","38","39C","39M","40","40X","43M","44M","45A","45S","47E","47M","47S","48M","49M","50","51","51A","51S","52","54","54M","54S","55","56","56A","56B","58","58A","58M","59","59A","59B","59S","59X","62","62A","63","63A","65","65A","65X","66","66A","68","69","69A","69X"],
  KLN: ["2","2A","3","5M","6","6A","6C","6X","8","8P","8S","9M","12","12A","12B","12S","13","13A","13B","15","16","16A","16B","16S","17M","18M","19","19A","19M","19S","20","20M","22A","22M","23","23B","23C","23M","24","24M","25A","25B","25M","26","26A","26H","26M","26W","26X","27M","27MS","28M","28MS","29A","29B","30A","30B","32M","33A","33M","34M","34S","35","36A","37A","37M","38M","39M","41A","41M","42","43M","44","44A","44M","44S","45B","45M","46","47","48","49","49M","50","51M","52","53M","54","54M","54S","56","57M","59","59M","60","62S","63","65","66S","68","69","69A","70","70A","71","72","73","74","74S","75","75A","75B","76A","76B","77M","78","78A","79K","79M","79S","79W","80M","81K","82","83A","83M","85","86","87","88","89A","89B","89C","90A","90B"],
  NT: ["1","1A","1S","2","3","3A","4","4A","5","6","7","9","9A","10","11","11A","11B","11M","11S","12","12A","13","15","15A","15M","16","17","17A","17K","17M","18","19S","20A","20B","20C","20E","20K","20M","20P","20R","20S","20T","20X","21A","21K","22K","23K","23S","25A","25B","25K","26","26A","27","27A","27B","28K","28S","29","31","31A","32","33","34","34A","35","36","37","38","39","39A","40","41","42","43","43A","43B","43C","43S","44","44A","44A1","44B","44B1","45","46","46A","46M","46X","47M","48A","48S","49S","50A","50K","51","51K","52B","52K","54A","54K","55K","56A","56B","56C","56K","57K","58K","59A","59K","59S","60K","60P","60R","61M","61S","62K","63A","63B","63K","63S","64A","64K","65A","65K","65M","65S","66K","67A","67B","67C","67K","68","68A","68E","68F","68K","68R","68S","69","69K","71","71A","72","73","74","74A","75","76","79S","80","81","81B","82","82B","82M","83A","84","85","86","86A","86M","87","87A","87B","87K","87M","88","88A","88B","88C","88D","88F","88G","88M","89","89A","89B","89M","89P","89S","90M","90P","91","91A","92M","93","93A","94","94A","94S","95","95A","95K","95M","96","96A","96B","96C","96M","96S","97A","98","99","101M","102","102B","102S","103","103M","104","105","105S","106","107","108A","109M","110","110A","111","112M","112S","113","114A","114B","115","140M","301","301M","302","308A","308M","310M","312","313","401","402S","403","403A","403P","403X","404M","405","406","407","407A","407B","409","409K","409S","410","411","412","413","481","481A","481B","482","501A","501C","501K","501S","502","503","503K","504","505","601","601B","601C","602","602C","603","604","605","606S","608","609","609B","610S","611","611A","611B","611P","616S","618","620","621","622","623","801","803","803K","804","804A","805S","806A","806B","807A","807B","807C","807K","807P","807S","807X","808","808P","809K","810","810A","811","811A","811B","811P","811S","812","812A","813","813A","814","901"]
};

function isGmbCompany(company) {
  return String(company || "").startsWith("GMB");
}

function getGmbRegionName(company) {
  if (company === "GMB-HKI") return "港島小巴";
  if (company === "GMB-KLN") return "九龍小巴";
  if (company === "GMB-NT")  return "新界小巴";
  return "專線小巴";
}

function getCompanyLabel(cosArray) {
  if (cosArray.length === 1) {
    const c = cosArray[0];
    if (c === "KMB") return "（九巴）";
    if (c === "CTB") return "（城巴）";
    if (isGmbCompany(c)) return ` 🚐（${getGmbRegionName(c)}）`;
    return `（${c}）`;
  }
  return "（九巴 / 城巴）";
}

/* ========== FETCH 與 GMB 穿透請求 ========== */

async function fetchJSON(url, retries = 3, delayMs = 250) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// 專線小巴 API 請求器（優先直連，若遇 CORS 自動切換 allorigins / codetabs 通道）
async function fetchGmbApi(url, useCache = true) {
  const cacheKey = "gmb_api_" + url;
  if (useCache) {
    try {
      const c = localStorage.getItem(cacheKey);
      if (c) {
        const parsed = JSON.parse(c);
        if (Date.now() - parsed.ts < 86400000 && parsed.data) return parsed.data;
      }
    } catch (e) {}
  }

  let data = null;

  // 1) 嘗試直連（擺上網 http/https 時最快）
  if (window.location.protocol !== "file:") {
    try {
      const r1 = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (r1.ok) data = await r1.json();
    } catch (e) {}
  }

  // 2) 若被 CORS 攔截，自動用 allorigins /get 穿透
  if (!data) {
    try {
      const r2 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}&_=${useCache ? 1 : Date.now()}`);
      if (r2.ok) {
        const wrap = await r2.json();
        if (wrap && wrap.contents) {
          data = typeof wrap.contents === "string" ? JSON.parse(wrap.contents) : wrap.contents;
        }
      }
    } catch (e) {}
  }

  // 3) 第三後備通道
  if (!data) {
    try {
      const r3 = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
      if (r3.ok) data = await r3.json();
    } catch (e) {}
  }

  if (!data) throw new Error("GMB API unreachable: " + url);

  if (useCache) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
  }
  return data;
}

// 按需拉取小巴路線嘅真實 route_id 與雙向總站名稱
async function ensureGmbRouteMeta(routeObj) {
  if (!routeObj || !isGmbCompany(routeObj.company)) return routeObj;
  if (routeObj.gmbRouteId && routeObj.gmbDirections) return routeObj;

  const region = routeObj.gmbRegion || routeObj.company.replace("GMB-", "");
  const cacheKey = `${region}-${routeObj.route}`;

  if (gmbRouteDetailCache.has(cacheKey)) {
    Object.assign(routeObj, gmbRouteDetailCache.get(cacheKey));
    return routeObj;
  }

  try {
    const res = await fetchGmbApi(`${GMB_BASE}/route/${region}/${routeObj.route}`, true);
    const variants = (res && Array.isArray(res.data)) ? res.data : [];
    if (variants.length > 0) {
      const mainVar = variants.find(v => v.directions && v.directions.length > 0) || variants[0];
      const dirs = mainVar.directions || [];
      const dir1 = dirs.find(d => d.route_seq === 1) || dirs[0];
      const dir2 = dirs.find(d => d.route_seq === 2) || dirs[1];

      const meta = {
        gmbRouteId: mainVar.route_id,
        gmbDirections: dirs,
        orig_tc: dir1 ? dir1.orig_tc : routeObj.orig_tc,
        dest_tc: dir1 ? dir1.dest_tc : (dir2 ? dir2.orig_tc : routeObj.dest_tc),
        gmbOutTerm: dir1 ? dir1.dest_tc : routeObj.dest_tc,
        gmbInTerm: dir2 ? dir2.dest_tc : (dir1 ? dir1.orig_tc : routeObj.orig_tc)
      };
      gmbRouteDetailCache.set(cacheKey, meta);
      Object.assign(routeObj, meta);
    }
  } catch (e) {
    console.warn("小巴路線詳情載入失敗:", cacheKey, e.message);
  }
  return routeObj;
}

function prefetchVisibleGmbOrigins(routesList, onDone) {
  const targets = (routesList || [])
    .filter(r => isGmbCompany(r.company) && !r.gmbRouteId && !gmbPrefetchLock.has(`${r.company}-${r.route}`))
    .slice(0, 8);

  if (!targets.length) return;
  targets.forEach(r => gmbPrefetchLock.add(`${r.company}-${r.route}`));

  Promise.all(targets.map(r => ensureGmbRouteMeta(r))).then(() => {
    if (typeof onDone === "function") onDone();
  });
}

/* ========== 統一 BusAPI (支援 KMB + CTB + GMB) ========== */

const BusAPI = {
  getRoute: async (company, route) => {
    const url = company === "KMB"
      ? `${API_BASE.KMB}/route/${route}`
      : `${API_BASE.CTB}/route/ctb/${route}`;
    return await fetchJSON(url);
  },

  getRouteStops: async (company, route, dir, serviceType = "1") => {
    if (!isGmbCompany(company)) {
      const url = company === "KMB"
        ? `${API_BASE.KMB}/route-stop/${route}/${dir}/${serviceType}`
        : `${API_BASE.CTB}/route-stop/ctb/${route}/${dir}`;
      return await fetchJSON(url);
    }

    let routeObj = (currentRoute && currentRoute.company === company && currentRoute.route === route)
      ? currentRoute
      : (transferRoute && transferRoute.company === company && transferRoute.route === route)
        ? transferRoute
        : uniqueRoutes.find(r => r.company === company && r.route === route);

    if (routeObj) await ensureGmbRouteMeta(routeObj);
    const gmbRouteId = routeObj ? routeObj.gmbRouteId : null;
    if (!gmbRouteId) return { data: [] };

    const routeSeq = dir === "outbound" ? 1 : 2;
    const hasDir = !routeObj.gmbDirections || routeObj.gmbDirections.some(d => d.route_seq === routeSeq);
    if (!hasDir) return { data: [] };

    const res = await fetchGmbApi(`${GMB_BASE}/route-stop/${gmbRouteId}/${routeSeq}`, true);
    const stops = (res && res.data && res.data.route_stops) ? res.data.route_stops : [];

    return {
      data: stops.map(s => {
        const sid = `GMB_${s.stop_id}`;
        gmbStopNameCache.set(sid, { name_tc: s.name_tc, name_en: s.name_en || "" });
        return {
          stop: sid,
          seq: s.stop_seq,
          name_tc: s.name_tc,
          name_en: s.name_en || ""
        };
      })
    };
  },

  getStop: async (company, stopId) => {
    if (!isGmbCompany(company) && !String(stopId).startsWith("GMB_")) {
      const url = company === "KMB"
        ? `${API_BASE.KMB}/stop/${stopId}`
        : `${API_BASE.CTB}/stop/${stopId}`;
      return await fetchJSON(url);
    }

    const rawStopId = String(stopId).replace(/^GMB_/, "");
    const cachedNames = gmbStopNameCache.get(String(stopId)) || {};

    try {
      const res = await fetchGmbApi(`${GMB_BASE}/stop/${rawStopId}`, true);
      const wgs = res && res.data && res.data.coordinates && res.data.coordinates.wgs84
        ? res.data.coordinates.wgs84
        : null;
      return {
        data: {
          stop: String(stopId),
          name_tc: cachedNames.name_tc || `(小巴站) ${rawStopId}`,
          name_en: cachedNames.name_en || "",
          lat: wgs ? String(wgs.latitude) : null,
          long: wgs ? String(wgs.longitude) : null
        }
      };
    } catch (e) {
      return {
        data: {
          stop: String(stopId),
          name_tc: cachedNames.name_tc || `(小巴站) ${rawStopId}`,
          name_en: cachedNames.name_en || "",
          lat: null,
          long: null
        }
      };
    }
  },

  getEta: async (company, stopId, route, serviceType = "1") => {
    if (!isGmbCompany(company) && !String(stopId).startsWith("GMB_")) {
      const url = company === "KMB"
        ? `${API_BASE.KMB}/eta/${stopId}/${route}/${serviceType}`
        : `${API_BASE.CTB}/eta/ctb/${stopId}/${route}`;
      return await fetchJSON(url);
    }

    let routeObj = (currentRoute && currentRoute.company === company && currentRoute.route === route)
      ? currentRoute
      : (transferRoute && transferRoute.company === company && transferRoute.route === route)
        ? transferRoute
        : uniqueRoutes.find(r => r.company === company && r.route === route);

    if (routeObj && !routeObj.gmbRouteId) await ensureGmbRouteMeta(routeObj);
    const gmbRouteId = routeObj ? routeObj.gmbRouteId : null;
    if (!gmbRouteId) return { data: [] };

    const rawStopId = String(stopId).replace(/^GMB_/, "");
    const res = await fetchGmbApi(`${GMB_BASE}/eta/route-stop/${gmbRouteId}/${rawStopId}`, false);
    const rawData = res ? res.data : null;
    const groups = Array.isArray(rawData) ? rawData : (rawData ? [rawData] : []);

    const flatEtas = [];
    groups.forEach(g => {
      const dirCode = g.route_seq === 2 ? "I" : "O";
      const etaArr = Array.isArray(g.eta) ? g.eta : [];
      etaArr.forEach(item => {
        if (item.timestamp) {
          flatEtas.push({
            eta: item.timestamp,
            rmk_tc: item.remarks_tc || "",
            seq: g.stop_seq,
            dir: dirCode,
            eta_seq: item.eta_seq
          });
        }
      });
    });

    return { data: flatEtas };
  }
};

/* ========== 載入全港九巴 + 城巴 + 專線小巴路線 ========== */

async function loadAllBusData() {
  const [kmbRouteRes, kmbStopRes, ctbRouteRes, gmbRouteRes] = await Promise.allSettled([
    fetchJSON(`${KMB_BASE}/route/`, 3, 400),
    fetchJSON(`${KMB_BASE}/stop/`, 3, 400),
    fetchJSON(`${CTB_BASE}/route/ctb`, 3, 400),
    fetchGmbApi(`${GMB_BASE}/route`, true)
  ]);

  const loadedRoutes = [];
  const routeMap = new Map();
  allStopsMap = new Map();
  routesByStopId = {};

  // 1. 九巴
  if (kmbRouteRes.status === "fulfilled" && kmbRouteRes.value) {
    for (const r of (kmbRouteRes.value.data || [])) {
      const key = `KMB-${r.route}-${r.service_type || "1"}`;
      if (!routeMap.has(key)) {
        const obj = { company: "KMB", route: r.route, bound: null, service_type: r.service_type || "1", orig_tc: r.orig_tc, dest_tc: r.dest_tc };
        routeMap.set(key, obj);
        loadedRoutes.push(obj);
      }
    }
  }
  if (kmbStopRes.status === "fulfilled" && kmbStopRes.value) {
    (kmbStopRes.value.data || []).forEach(s => allStopsMap.set(s.stop, { ...s, company: "KMB" }));
  }

  // 2. 城巴
  if (ctbRouteRes.status === "fulfilled" && ctbRouteRes.value) {
    for (const r of (ctbRouteRes.value.data || [])) {
      const key = `CTB-${r.route}`;
      if (!routeMap.has(key)) {
        const obj = { company: "CTB", route: r.route, bound: null, service_type: "", orig_tc: r.orig_tc, dest_tc: r.dest_tc };
        routeMap.set(key, obj);
        loadedRoutes.push(obj);
      }
    }
  }

  // 3. 專線小巴（優先用政府 API 動態結果；若失敗自動用 FALLBACK_GMB_ROUTES 保底）
  const gmbRegions = (gmbRouteRes.status === "fulfilled" && gmbRouteRes.value && gmbRouteRes.value.data && gmbRouteRes.value.data.routes)
    ? gmbRouteRes.value.data.routes
    : FALLBACK_GMB_ROUTES;

  let gmbCount = 0;
  ["HKI", "KLN", "NT"].forEach(reg => {
    const list = gmbRegions[reg] || [];
    const coCode = `GMB-${reg}`;
    list.forEach(rCode => {
      const cleanCode = String(rCode).toUpperCase();
      const key = `${coCode}-${cleanCode}`;
      if (!routeMap.has(key)) {
        const obj = {
          company: coCode,
          gmbRegion: reg,
          route: cleanCode,
          bound: null,
          service_type: "1",
          orig_tc: getGmbRegionName(coCode),
          dest_tc: "專線小巴"
        };
        routeMap.set(key, obj);
        loadedRoutes.push(obj);
        gmbCount++;
      }
    });
  });

  console.log(`✅ 路線載入完成：共 ${loadedRoutes.length} 條（含 ${gmbCount} 條專線小巴）`);
  return loadedRoutes;
}

/* ========== 狀態儲存與 Toast ========== */

function saveAppState() {
  const state = {
    firstRoute: currentRoute || null,
    firstDirection: currentDirection || null,
    firstDirectionCode: currentDirectionCode || null,
    firststopID: originStopId || null,
    firstseq: originSeq || null,
    transferStopId: transferStopId || null,
    transferSeq: transferSeq || null,
    transferRoute: transferRoute || null,
    transferDirection: transferDirection || null,
    transferDirectionCode: transferDirectionCode || null,
    timestamp: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message) {
  const x = document.getElementById("toast-msg");
  if (!x) return;
  x.textContent = message;
  x.className = "show";
  setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
}

/* ========== 地圖初始化與 GPS 定位 ========== */

function renderUserLocationSpot() {
  if (!map || userLat == null || userLon == null) return;
  if (userLocationMarker && map.hasLayer(userLocationMarker)) {
    map.removeLayer(userLocationMarker);
  }
  const gpsIcon = L.divIcon({
    className: "",
    html: `<div class="user-gps-dot" title="你的位置"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  userLocationMarker = L.marker([userLat, userLon], { icon: gpsIcon, zIndexOffset: 2000 })
    .addTo(map)
    .bindPopup("📍 <b>你的目前位置</b>");
}

function initMap() {
  if (map) return;

  map = L.map("map", { zoomControl: false }).setView([22.32, 114.17], 12);
  L.control.zoom({ position: "topright" }).addTo(map);

  const hkGovBase = L.tileLayer(
    "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "&copy; 香港地政總署" }
  );
  const hkGovLabel = L.tileLayer(
    "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/WGS84/{z}/{x}/{y}.png",
    { maxZoom: 19 }
  );
  const hkGovLayer = L.layerGroup([hkGovBase, hkGovLabel]);

  const cartoLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    { subdomains: "abcd", maxZoom: 19, attribution: "&copy; OpenStreetMap &copy; CARTO" }
  );

  const osmLayer = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }
  );

  hkGovLayer.addTo(map);
  let fallbackTriggered = false;
  hkGovBase.on("tileerror", () => {
    if (!fallbackTriggered) {
      fallbackTriggered = true;
      if (map.hasLayer(hkGovLayer)) map.removeLayer(hkGovLayer);
      cartoLayer.addTo(map);
    }
  });

  L.control.layers(
    {
      "🇭🇰 香港官方中文地圖": hkGovLayer,
      "🗺️ 現代簡潔地圖 (Carto)": cartoLayer,
      "🌍 OpenStreetMap": osmLayer
    },
    null,
    { position: "topright", collapsed: true }
  ).addTo(map);

  stopsLayer = L.layerGroup().addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;
        if (!currentRoute) map.setView([userLat, userLon], 15);
        renderUserLocationSpot();
      },
      (err) => console.warn("Geolocation error:", err.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }
}

/* ========== 距離 / 速度(5km/h) / 時間 / ☀️ 太陽方位計算 ========== */

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkingMinutesBetweenStops(stopIdA, stopIdB) {
  if (!stopIdA || !stopIdB) return null;
  if (stopIdA === stopIdB) return 0;
  const infoA = allStopsMap.get(stopIdA);
  const infoB = allStopsMap.get(stopIdB);
  if (!infoA || !infoB) return null;
  const lat1 = parseFloat(infoA.lat), lon1 = parseFloat(infoA.long);
  const lat2 = parseFloat(infoB.lat), lon2 = parseFloat(infoB.long);
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return null;
  const distMeters = haversineDistanceMeters(lat1, lon1, lat2, lon2);
  if (!isFinite(distMeters) || distMeters <= 0) return 0;
  return distMeters / (5000 / 60); // 5km/h
}

function walkingTimeTextBetweenStops(stopIdA, stopIdB) {
  const mins = walkingMinutesBetweenStops(stopIdA, stopIdB);
  if (mins === null) return "";
  if (mins < 1) return "步行 <1 分鐘";
  if (mins > 60) return "步行 >1 小時";
  return `步行約 ${Math.round(mins)} 分鐘`;
}

function computeSegmentDistanceMeters(prevStop, thisStop) {
  if (!prevStop || !thisStop) return null;
  const prevInfo = allStopsMap.get(prevStop.stop_id);
  const thisInfo = allStopsMap.get(thisStop.stop_id);
  if (!prevInfo || !thisInfo) return null;
  const lat1 = parseFloat(prevInfo.lat), lon1 = parseFloat(prevInfo.long);
  const lat2 = parseFloat(thisInfo.lat), lon2 = parseFloat(thisInfo.long);
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return null;
  return haversineDistanceMeters(lat1, lon1, lat2, lon2);
}

function getSegmentBaseSpeedKmH(distanceMeters) {
  const dKm = distanceMeters / 1000;
  if (dKm <= 0.1) return 8;
  if (dKm <= 1) return 8 + (25 - 8) * ((dKm - 0.1) / 0.9);
  if (dKm <= 20) return 25 + (60 - 25) * ((dKm - 1) / 19);
  return 60;
}

function getTimeOfDayFactor(date) {
  const day = date.getDay();
  const t = date.getHours() * 60 + date.getMinutes();
  if (day === 0) return 1.0;
  if (day === 6) return 0.9;
  const basePeak = 0.8;
  const m1_start = 390, m1_peakS = 450, m1_peakE = 570, m1_end = 630;
  const e1_start = 960, e1_peakS = 1020, e1_peakE = 1170, e1_end = 1230;
  if (t < m1_start) return 1;
  if (t < m1_peakS) return 1 - (1 - basePeak) * ((t - m1_start) / (m1_peakS - m1_start));
  if (t < m1_peakE) return basePeak;
  if (t < m1_end) return basePeak + (1 - basePeak) * ((t - m1_peakE) / (m1_end - m1_peakE));
  if (t < e1_start) return 1;
  if (t < e1_peakS) return 1 - (1 - basePeak) * ((t - e1_start) / (e1_peakS - e1_start));
  if (t < e1_peakE) return basePeak;
  if (t < e1_end) return basePeak + (1 - basePeak) * ((t - e1_peakE) / (e1_end - e1_peakE));
  return 1;
}

function getSegmentEffectiveSpeedKmH(distanceMeters, now = new Date()) {
  return getSegmentBaseSpeedKmH(distanceMeters) * getTimeOfDayFactor(now);
}

function recomputeCumulativeTravelFromOrigin(originId) {
  cumulativeTravelFromOrigin = {};
  if (!routeStops || !routeStops.length) return;
  const startIndex = routeStops.findIndex(s => s.stop_id === originId);
  if (startIndex < 0) return;

  const baseTime = selectedEtaTime ? new Date(selectedEtaTime.getTime()) : new Date();
  let accDist = 0, accMinutes = 0, curTime = new Date(baseTime.getTime());
  cumulativeTravelFromOrigin[originId] = { distanceMeters: 0, travelMinutes: 0 };

  for (let i = startIndex + 1; i < routeStops.length; i++) {
    const prev = routeStops[i - 1], cur = routeStops[i];
    const seg = computeSegmentDistanceMeters(prev, cur);
    if (!seg || seg <= 0) {
      cumulativeTravelFromOrigin[cur.stop_id] = { distanceMeters: accDist, travelMinutes: Math.round(accMinutes) };
      continue;
    }
    accDist += seg;
    const vKmH = getSegmentEffectiveSpeedKmH(seg, curTime);
    const minutes = ((seg / 1000) / vKmH) * 60;
    accMinutes += minutes;
    curTime = new Date(curTime.getTime() + minutes * 60000);
    cumulativeTravelFromOrigin[cur.stop_id] = { distanceMeters: accDist, travelMinutes: Math.round(accMinutes) };
  }
}

function computeBearingDegrees(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function getSolarPositionHK(date = new Date(), lat = 22.3193, lon = 114.1694) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const epsilon = (23.439 - 0.0000004 * n) * rad;
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = (Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * deg + 360) % 360;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const lst = (gmst + lon + 360) % 360;
  const haRad = (((lst - ra + 540) % 360) - 180) * rad;
  const latRad = lat * rad;
  const sinAlt = Math.sin(latRad) * Math.sin(dec) + Math.cos(latRad) * Math.cos(dec) * Math.cos(haRad);
  const altitudeDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * deg;
  const yAz = -Math.sin(haRad);
  const xAz = Math.tan(dec) * Math.cos(latRad) - Math.sin(latRad) * Math.cos(haRad);
  const azimuthDeg = (Math.atan2(yAz, xAz) * deg + 360) % 360;
  return { altitudeDeg, azimuthDeg };
}

function compassLabelFromDegree(deg) {
  const dirs = ["正北", "東北", "正東", "東南", "正南", "西南", "正西", "西北"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function computeSunSeatAdviceForStops(stopsList, startStopId, endStopId = null) {
  if (!stopsList || stopsList.length < 2) return "";
  let startIdx = 0;
  if (startStopId) {
    const found = stopsList.findIndex(s => s.stop_id === startStopId);
    if (found >= 0) startIdx = found;
  }
  let endIdx = stopsList.length - 1;
  if (endStopId) {
    const foundEnd = stopsList.findIndex((s, idx) => idx > startIdx && s.stop_id === endStopId);
    if (foundEnd > startIdx) endIdx = foundEnd;
  } else {
    endIdx = Math.min(stopsList.length - 1, startIdx + 5);
  }
  if (endIdx <= startIdx) { startIdx = 0; endIdx = stopsList.length - 1; }

  const sInfo = allStopsMap.get(stopsList[startIdx].stop_id);
  const eInfo = allStopsMap.get(stopsList[endIdx].stop_id);
  if (!sInfo || !eInfo) return "";

  const lat1 = parseFloat(sInfo.lat), lon1 = parseFloat(sInfo.long);
  const lat2 = parseFloat(eInfo.lat), lon2 = parseFloat(eInfo.long);
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return "";

  const busBearing = computeBearingDegrees(lat1, lon1, lat2, lon2);
  const busDirName = compassLabelFromDegree(busBearing);
  const { altitudeDeg, azimuthDeg } = getSolarPositionHK(new Date(), lat1, lon1);
  const sunDirName = compassLabelFromDegree(azimuthDeg);

  if (altitudeDeg <= 2) return `🌙 現時夜間/無猛烈日光（車向${busDirName}）｜💺 坐左或右邊都唔曬`;
  if (altitudeDeg >= 68) return `☀️ 正午太陽喺頂（仰角 ${Math.round(altitudeDeg)}°）｜💺 兩邊受光相若`;

  const intensity = altitudeDeg >= 25 ? "陽光猛烈" : "斜陽直射";
  const diff = ((azimuthDeg - busBearing + 540) % 360) - 180;
  const absDiff = Math.abs(diff);

  if (absDiff < 18) return `☀️ 太陽於${sunDirName}正對車頭（${intensity}）｜💺 建議坐後排遮陰位`;
  if (absDiff > 162) return `☀️ 太陽於${sunDirName}照車尾（${intensity}）｜💺 左右兩邊都唔曬`;

  return diff > 0
    ? `☀️ 太陽喺${sunDirName}（${intensity}，車向${busDirName}）｜💺 建議坐【左邊】（右邊較曬）`
    : `☀️ 太陽喺${sunDirName}（${intensity}，車向${busDirName}）｜💺 建議坐【右邊】（左邊較曬）`;
}

function updateMainSunAdviceUI() {
  const el = document.getElementById("sunAdviceInfo");
  if (el) el.textContent = computeSunSeatAdviceForStops(routeStops, originStopId, transferStopId);
}

function updateTransferSunAdviceUI() {
  const el = document.getElementById("transferSunAdviceInfo");
  if (el) el.textContent = computeSunSeatAdviceForStops(transferRouteStops, transferCurrentStopId, null);
}

/* ========== 文字處理 / 顏色 / 格式化 ========== */

function normalizeStopName(nameTc) {
  if (!nameTc) return "";
  let s = nameTc.split("(")[0].split("（")[0].trim();
  return s.replace(/[A-Z]{1,3}\d{1,4}$/i, "").trim();
}

function stripBracketCode(name) {
  if (!name) return "";
  return name.replace(/\([^)]*\)$/g, "").replace(/（[^）]*）$/g, "").trim();
}

function computeNextCharUsage(baseRoutes, inputStr) {
  const usage = { digits: {}, letters: {} };
  for (let d = 0; d <= 9; d++) usage.digits[String(d)] = false;
  const ACode = "A".charCodeAt(0);
  for (let i = 0; i < 26; i++) usage.letters[String.fromCharCode(ACode + i)] = false;

  baseRoutes.forEach(r => {
    const code = r.route.toUpperCase();
    if (code.length > inputStr.length) {
      const ch = code[inputStr.length];
      if (!ch) return;
      if (ch >= "0" && ch <= "9") usage.digits[ch] = true;
      else if (usage.letters.hasOwnProperty(ch)) usage.letters[ch] = true;
    }
  });
  return usage;
}

function minutesAndLabel(etaISO) {
  if (!etaISO) return { minutes: 999, label: "" };
  const diffMin = Math.round((new Date(etaISO) - new Date()) / 60000);
  if (diffMin <= 0) return { minutes: diffMin, label: "即將到達" };
  return { minutes: diffMin, label: `約 ${diffMin} 分鐘` };
}

function grayColorByMinutes(min) {
  if (min <= 1) return "#000000";
  if (min >= 30) return "#b0b0b0";
  const v = Math.round(((min - 1) / 29) * 176);
  const hex = v.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function formatDetailLine(item) {
  const etaTime = item.eta ? new Date(item.eta) : null;
  const timeStr = etaTime ? etaTime.toLocaleTimeString("zh-HK", { hour12: false }) : "N/A";
  const { minutes, label } = minutesAndLabel(item.eta);
  const remark = item.rmk_tc || "";
  const isScheduled = remark.includes("原定") || remark.includes("預定");
  const isNotDeparted = remark.includes("未開出");

  let text = `${timeStr} ${label}`;
  if (isNotDeparted || isScheduled) text += " 未開出";
  else if (remark) text += " " + remark;

  const status = (isNotDeparted || isScheduled) ? "not_departed" : "departed";
  return { text, minutes, isScheduled, status, etaTime };
}

function formatTimeHHMM(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/* ========== 🔔 背景不休眠通知列 + 動態進度環 Logo ========== */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data && e.data.type === "STOP_BUS_TRACK") stopPersistentTrackingNotification();
  });
}

function startSilentAudioKeepAlive() {
  try {
    if (!keepAliveAudio) {
      keepAliveAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
      keepAliveAudio.loop = true;
      keepAliveAudio.volume = 0.01;
    }
    keepAliveAudio.play().catch(() => {});
  } catch (e) {}
}

function stopSilentAudioKeepAlive() {
  try {
    if (keepAliveAudio) {
      keepAliveAudio.pause();
      keepAliveAudio.currentTime = 0;
    }
  } catch (e) {}
}

function startWorkerInterval(callback, ms = 60000) {
  stopWorkerInterval();
  try {
    const blob = new Blob([
      `let t = setInterval(() => postMessage("tick"), ${ms});
       onmessage = e => { if (e.data === "stop") clearInterval(t); };`
    ], { type: "application/javascript" });
    bgTimerWorker = new Worker(URL.createObjectURL(blob));
    bgTimerWorker.onmessage = () => callback();
  } catch (e) {
    busNotificationTimer = setInterval(callback, ms);
  }
}

function stopWorkerInterval() {
  if (bgTimerWorker) {
    try { bgTimerWorker.postMessage("stop"); bgTimerWorker.terminate(); } catch (e) {}
    bgTimerWorker = null;
  }
  if (busNotificationTimer) {
    clearInterval(busNotificationTimer);
    busNotificationTimer = null;
  }
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function createCountdownBadgeIcon(minutesLeft, routeCode, hhmmStr) {
  try {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const isUrgent = minutesLeft <= 2;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    if (isUrgent) {
      grad.addColorStop(0, "#ef4444");
      grad.addColorStop(1, "#991b1b");
    } else {
      grad.addColorStop(0, "#1d4ed8");
      grad.addColorStop(1, "#0f172a");
    }
    drawRoundRect(ctx, 4, 4, size - 8, size - 8, 24);
    ctx.fillStyle = grad;
    ctx.fill();

    drawRoundRect(ctx, 16, 10, size - 32, 22, 11);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(routeCode || "BUS", size / 2, 21);

    const cx = size / 2, cy = 67, radius = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.stroke();

    const progress = Math.max(0.05, Math.min(1, (20 - Math.max(0, minutesLeft)) / 20));
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.strokeStyle = isUrgent ? "#fde047" : "#38bdf8";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    if (minutesLeft <= 0) {
      ctx.font = "bold 17px sans-serif";
      ctx.fillText("即將", cx, cy - 4);
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#fde047";
      ctx.fillText("到站", cx, cy + 11);
    } else {
      ctx.font = "bold 29px sans-serif";
      ctx.fillText(String(minutesLeft), cx, cy - 3);
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillText("分鐘", cx, cy + 15);
    }

    if (hhmmStr) {
      drawRoundRect(ctx, 22, 101, size - 44, 18, 9);
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 12px monospace, sans-serif";
      ctx.fillText(hhmmStr, size / 2, 110);
    }

    return canvas.toDataURL("image/png");
  } catch (e) {
    return undefined;
  }
}

function stopPersistentTrackingNotification() {
  stopWorkerInterval();
  stopSilentAudioKeepAlive();

  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (activeBusNotification && typeof activeBusNotification.close === "function") {
    try { activeBusNotification.close(); } catch (e) {}
    activeBusNotification = null;
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.getNotifications) {
        reg.getNotifications({ tag: "bus-eta-tracker" }).then(list => list.forEach(n => n.close()));
      }
    }).catch(() => {});
  }
}


document.addEventListener("visibilitychange", () => {
  if (!document.hidden && bgTimerWorker && selectedEtaTime) {
    updatePersistentTrackingNotification();
  }
});

function setTrackingEta(etaObj, rowElement) {
  selectedEtaId = etaObj.id;
  selectedEtaTime = etaObj.etaTime;
  selectedEtaStatus = etaObj.status;

  if (originStopId && routeStops.length) {
    recomputeCumulativeTravelFromOrigin(originStopId);
  }
  loadEtaSummaryForAllStops();

  if (rowElement) {
    const rows = document.querySelectorAll(`.stop-item[data-stop-id="${originStopId}"] .eta-row`);
    rows.forEach(row => {
      row.classList.remove("tracked");
      const btn = row.querySelector(".btn-track");
      if (btn) btn.classList.remove("active");
    });
    rowElement.classList.add("tracked");
    const btn = rowElement.querySelector(".btn-track");
    if (btn) btn.classList.add("active");

    showToast("🔔 已啟動實時到站通知");
    startPersistentTrackingNotification();
  }

  if (transferStopId) guessBoardingBusAtTransferStop();
  if (transferStopId && transferCurrentStopId) selectTransferStop(transferCurrentStopId, window.transferCurrentSeq);
}

/* ========== INIT ========== */

async function init() {
  try {
    allRoutes = await loadAllBusData();
    const uMap = new Map();
    for (const r of allRoutes) {
      const key = `${r.company}-${r.route}-${r.service_type}`;
      if (!uMap.has(key)) uMap.set(key, r);
    }
    uniqueRoutes = Array.from(uMap.values());

    currentInput = "";
    updateRouteInputDisplay();
    candidateRoutes = uniqueRoutes.slice();
    renderRouteList();
    renderVirtualKeyboard();
    renderTransferVirtualKeyboard();

    const btnResetTransfer = document.getElementById("btnResetTransfer");
    if (btnResetTransfer) {
      btnResetTransfer.onclick = resetTransferOnly;
    }
  } catch (e) {
    console.error(e);
    const rl = document.getElementById("routeList");
    if (rl) rl.textContent = "載入路線失敗：" + e.message;
  }
  checkUrlForRoute();
}

/* ========== Step1: 路線輸入與虛擬鍵盤 ========== */

function updateRouteInputDisplay() {
  const el = document.getElementById("routeInputDisplay");
  if (!el) return;
  if (currentRoute) {
    el.textContent = `${currentRoute.route}（${currentRoute.orig_tc} ↔ ${currentRoute.dest_tc}）`;
  } else {
    el.textContent = currentInput || "(未輸入)";
  }
}

function filterRoutesByInput() {
  if (!currentInput) {
    candidateRoutes = uniqueRoutes.slice();
    return;
  }
  const kw = currentInput.toLowerCase();
  candidateRoutes = uniqueRoutes.filter(r => r.route.toLowerCase().startsWith(kw));
}


function updateAfterInputChange() {
  updateRouteInputDisplay();
  filterRoutesByInput();
  renderRouteList();
  renderVirtualKeyboard();
}

function renderVirtualKeyboard() {
  const container = document.getElementById("vk-container");
  const layout = document.getElementById("step1-layout");
  if (!container) return;
  container.innerHTML = "";

  if (currentRoute && keyboardHidden) {
    if (layout) layout.classList.add("compact-mode");
    const clear = document.createElement("div");
    clear.className = "vk-key special";
    clear.textContent = "✕ 重設路線";
    clear.style.backgroundColor = "#fee2e2";
    clear.style.color = "#b91c1c";
    clear.onclick = () => { stopPersistentTrackingNotification(); resetAllState(); setBottomSheetState("half"); };
    container.appendChild(clear);
    return;
  }
  if (layout) layout.classList.remove("compact-mode");

  const baseRoutes = currentInput ? candidateRoutes : uniqueRoutes;
  const usage = computeNextCharUsage(baseRoutes, currentInput);

  const topRow = document.createElement("div");
  topRow.className = "vk-top-grid";

  const backspace = document.createElement("div");
  backspace.className = "vk-key special";
  backspace.textContent = "⌫ 刪除";
  backspace.onclick = () => {
    if (!currentRoute && currentInput.length > 0) {
      currentInput = currentInput.slice(0, -1);
      updateAfterInputChange();
    }
  };

  const clear = document.createElement("div");
  clear.className = "vk-key special";
  clear.textContent = "✕ 清除";
  clear.style.backgroundColor = "#fee2e2";
  clear.style.color = "#b91c1c";
  clear.onclick = () => { stopPersistentTrackingNotification(); resetAllState(); };

  topRow.appendChild(backspace);
  topRow.appendChild(clear);
  container.appendChild(topRow);

  const numpadGrid = document.createElement("div");
  numpadGrid.className = "vk-numpad-grid";
  [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null].forEach(d => {
    const key = document.createElement("div");
    key.className = "vk-key";
    if (d === null) {
      key.style.visibility = "hidden";
      numpadGrid.appendChild(key);
      return;
    }
    const ch = String(d);
    key.textContent = ch;
    if (!usage.digits[ch]) {
      key.classList.add("disabled");
    } else {
      key.onclick = () => { if (!currentRoute) { currentInput += ch; updateAfterInputChange(); } };
    }
    numpadGrid.appendChild(key);
  });
  container.appendChild(numpadGrid);

  const lettersWrap = document.createElement("div");
  lettersWrap.className = "vk-letters-wrap";
  Object.keys(usage.letters).filter(ch => usage.letters[ch]).forEach(ch => {
    const key = document.createElement("div");
    key.className = "vk-key letter-key";
    key.textContent = ch;
    key.onclick = () => { if (!currentRoute) { currentInput += ch; updateAfterInputChange(); } };
    lettersWrap.appendChild(key);
  });
  container.appendChild(lettersWrap);
}

function renderTransferVirtualKeyboard() {
  const container = document.getElementById("transferVkContainer");
  const layout = document.getElementById("transfer-step1-layout");
  if (!container) return;
  container.innerHTML = "";

  if (transferKeyboardHidden) {
    if (layout) layout.classList.add("compact-mode");
    const clear = document.createElement("div");
    clear.className = "vk-key special";
    clear.textContent = "✕ 改選轉車線";
    clear.style.backgroundColor = "#fee2e2";
    clear.style.color = "#b91c1c";
    clear.onclick = () => resetTransferOnly();
    container.appendChild(clear);
    return;
  }
  if (layout) layout.classList.remove("compact-mode");

  const baseRoutes = transferCurrentInput ? transferCandidateRoutes : uniqueRoutes;
  const usage = computeNextCharUsage(baseRoutes, transferCurrentInput);

  const topRow = document.createElement("div");
  topRow.className = "vk-top-grid";

  const backspace = document.createElement("div");
  backspace.className = "vk-key special";
  backspace.textContent = "⌫ 刪除";
  backspace.onclick = () => {
    if (transferCurrentInput.length > 0) {
      transferCurrentInput = transferCurrentInput.slice(0, -1);
      updateAfterTransferInputChange();
    }
  };

  const clear = document.createElement("div");
  clear.className = "vk-key special";
  clear.textContent = "✕ 清除";
  clear.style.backgroundColor = "#fee2e2";
  clear.style.color = "#b91c1c";
  clear.onclick = () => {
    transferCurrentInput = "";
    transferCandidateRoutes = [];
    const d1 = document.getElementById("transferRouteInputDisplay");
    const d2 = document.getElementById("transferRouteList");
    if (d1) d1.textContent = "(未輸入)";
    if (d2) d2.textContent = "請輸入路線，會以同名站作為預設轉車站。";
    renderTransferVirtualKeyboard();
  };

  topRow.appendChild(backspace);
  topRow.appendChild(clear);
  container.appendChild(topRow);

  const numpadGrid = document.createElement("div");
  numpadGrid.className = "vk-numpad-grid";
  [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null].forEach(d => {
    const key = document.createElement("div");
    key.className = "vk-key";
    if (d === null) {
      key.style.visibility = "hidden";
      numpadGrid.appendChild(key);
      return;
    }
    const ch = String(d);
    key.textContent = ch;
    if (!usage.digits[ch]) {
      key.classList.add("disabled");
    } else {
      key.onclick = () => { transferCurrentInput += ch; updateAfterTransferInputChange(); };
    }
    numpadGrid.appendChild(key);
  });
  container.appendChild(numpadGrid);

  const lettersWrap = document.createElement("div");
  lettersWrap.className = "vk-letters-wrap";
  Object.keys(usage.letters).filter(ch => usage.letters[ch]).forEach(ch => {
    const key = document.createElement("div");
    key.className = "vk-key letter-key";
    key.textContent = ch;
    key.onclick = () => { transferCurrentInput += ch; updateAfterTransferInputChange(); };
    lettersWrap.appendChild(key);
  });
  container.appendChild(lettersWrap);
}

/* ========== 清除狀態 ========== */

function clearTransferState() {
  if (transferEtaTimer) { clearInterval(transferEtaTimer); transferEtaTimer = null; }

  transferRoute = null;
  transferServiceType = "1";
  transferDirection = null;
  transferDirectionCode = null;
  transferRouteStops = [];
  transferCurrentStopId = null;
  transferEtaTimesByStop = {};
  transferCurrentInput = "";
  transferCandidateRoutes = [];
  transferKeyboardHidden = false;

  const d1 = document.getElementById("transferRouteInputDisplay");
  if (d1) d1.textContent = "(未輸入)";
  const d2 = document.getElementById("transferRouteList");
  if (d2) d2.textContent = "請輸入路線，會以同名站作為預設轉車站。";
  const d3 = document.getElementById("transferStopList");
  if (d3) d3.innerHTML = "";
  const d4 = document.getElementById("transferHeadwayInfo");
  if (d4) d4.textContent = "";
  const dSun = document.getElementById("transferSunAdviceInfo");
  if (dSun) dSun.textContent = "";

  const btnIn = document.getElementById("transferDirInbound");
  const btnOut = document.getElementById("transferDirOutbound");
  if (btnIn) { btnIn.disabled = true; btnIn.textContent = "往 ? 方向"; btnIn.style.display = ""; }
  if (btnOut) { btnOut.disabled = true; btnOut.textContent = "往 ? 方向"; btnOut.style.display = ""; }

  const t1 = document.getElementById("step4-title");
  if (t1) t1.style.display = "";
  const t2 = document.getElementById("transfer-step1-layout");
  if (t2) { t2.style.display = "flex"; t2.classList.remove("compact-mode"); }

  const dirBlock = document.getElementById("transfer-direction-block");
  if (dirBlock) {
    dirBlock.style.display = "";
    const dirButtons = dirBlock.querySelector(".direction-buttons");
    const dirLabel = dirBlock.querySelector("strong");
    if (dirButtons) dirButtons.style.display = "";
    if (dirLabel) dirLabel.style.display = "";
  }

  const stopBlock = document.getElementById("transfer-stop-block");
  if (stopBlock) stopBlock.style.display = "";

  const btnReset = document.getElementById("btnResetTransfer");
  if (btnReset) btnReset.style.display = "none";

  renderTransferVirtualKeyboard();
  saveAppState();
}

function resetTransferOnly() {
  clearSecondRouteVisual();
  clearTransferState();
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "block";
}

function resetAllState() {
  routeStops = [];
  transferRouteStops = [];
  mainRouteRenderToken++;
  secondRouteRenderToken++;

  clearSecondRouteVisual();

  originStopId = null;
  originSeq = null;
  transferStopId = null;
  transferSeq = null;
  transferStopName = null;
  mode = "normal";

  if (mainEtaTimer) { clearInterval(mainEtaTimer); mainEtaTimer = null; }
  if (transferEtaTimer) { clearInterval(transferEtaTimer); transferEtaTimer = null; }

  currentRoute = null;
  currentInput = "";
  currentDirection = null;
  currentDirectionCode = null;
  inboundTerminalName = "?";
  outboundTerminalName = "?";
  currentStopId = null;
  keyboardHidden = false;
  etaTimesByStop = {};
  cumulativeTravelFromOrigin = null;

  selectedEtaId = null;
  selectedEtaTime = null;
  selectedEtaStatus = null;

  clearTransferState();
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "none";

  const hInfo = document.getElementById("headwayInfo");
  if (hInfo) hInfo.textContent = "";
  const sunInfo = document.getElementById("sunAdviceInfo");
  if (sunInfo) sunInfo.textContent = "";
  const walkInfo = document.getElementById("userWalkInfo");
  if (walkInfo) walkInfo.textContent = "";
  const icInfo = document.getElementById("interchangeInfo");
  if (icInfo) icInfo.textContent = "";
  const stopList = document.getElementById("stopList");
  if (stopList) stopList.innerHTML = "";
  const icCtrl = document.getElementById("interchangeControls");
  if (icCtrl) icCtrl.innerHTML = "";

  const btnIn = document.getElementById("dirInbound");
  const btnOut = document.getElementById("dirOutbound");
  if (btnIn) { btnIn.disabled = true; btnIn.textContent = "往 ? 方向"; btnIn.style.display = ""; }
  if (btnOut) { btnOut.disabled = true; btnOut.textContent = "往 ? 方向"; btnOut.style.display = ""; }

  updateRouteInputDisplay();
  renderRouteList();
  renderVirtualKeyboard();
  saveAppState();

  if (map) {
    if (window.mainRouteLine && map.hasLayer(window.mainRouteLine)) map.removeLayer(window.mainRouteLine);
    window.mainRouteLine = null;

    if (window.allStopMarkers) {
      window.allStopMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
    }
    window.allStopMarkers = [];

    if (userToStopRouteLayer && map.hasLayer(userToStopRouteLayer)) map.removeLayer(userToStopRouteLayer);
    userToStopRouteLayer = null;

    renderUserLocationSpot();
    if (userLat != null && userLon != null) map.setView([userLat, userLon], 15);
    else map.setView([22.32, 114.17], 12);
  }
}

/* ========== Step2: 揀方向 ========== */

async function getStopDetail(company, stopId) {
  if (allStopsMap.has(stopId)) return allStopsMap.get(stopId);
  try {
    const res = await BusAPI.getStop(company, stopId);
    if (res && res.data) {
      const stopData = { ...res.data, company: company };
      allStopsMap.set(stopId, stopData);
      return stopData;
    }
  } catch (e) {}
  return null;
}

async function selectRoute(route) {
  if (mainEtaTimer) { clearInterval(mainEtaTimer); mainEtaTimer = null; }
  if (route && isGmbCompany(route.company)) await ensureGmbRouteMeta(route);

  currentRoute = route;
  currentServiceType = route.service_type || "1";
  currentDirection = null;
  currentDirectionCode = null;
  inboundTerminalName = "?";
  outboundTerminalName = "?";
  routeStops = [];
  currentStopId = null;
  etaTimesByStop = {};
  cumulativeTravelFromOrigin = null;
  mode = "normal";
  originStopId = null;
  transferStopId = null;
  transferStopName = null;
  selectedEtaId = null;
  selectedEtaTime = null;
  selectedEtaStatus = null;

  const icInfo = document.getElementById("interchangeInfo");
  if (icInfo) icInfo.textContent = "";
  const icCtrl = document.getElementById("interchangeControls");
  if (icCtrl) icCtrl.innerHTML = "";
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "none";
  clearTransferState();

  updateRouteInputDisplay();
  const hInfo = document.getElementById("headwayInfo");
  if (hInfo) hInfo.textContent = "";
  const stopList = document.getElementById("stopList");
  if (stopList) stopList.innerHTML = "";

  const btnIn = document.getElementById("dirInbound");
  const btnOut = document.getElementById("dirOutbound");
  if (!btnIn || !btnOut) return;

  btnIn.style.display = "";
  btnOut.style.display = "";
  btnIn.disabled = true;
  btnOut.disabled = true;
  btnIn.textContent = "載入方向中...";
  btnOut.textContent = "載入方向中...";

  keyboardHidden = true;
  renderRouteList();
  renderVirtualKeyboard();

  try {
    const company = currentRoute.company;
    const routeId = currentRoute.route;
    const st = currentServiceType;

    const [inData, outData] = await Promise.allSettled([
      BusAPI.getRouteStops(company, routeId, "inbound", st),
      BusAPI.getRouteStops(company, routeId, "outbound", st)
    ]);

    let hasInbound = false;
    let hasOutbound = false;

    if (inData.status === "fulfilled") {
      const list = (inData.value.data || []).sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasInbound = true;
        if (isGmbCompany(company) && currentRoute.gmbInTerm) {
          inboundTerminalName = stripBracketCode(currentRoute.gmbInTerm);
        } else {
          const last = list[list.length - 1];
          const stopInfo = await getStopDetail(company, last.stop);
          inboundTerminalName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(currentRoute.dest_tc);
        }
      }
    }

    if (outData.status === "fulfilled") {
      const list = (outData.value.data || []).sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasOutbound = true;
        if (isGmbCompany(company) && currentRoute.gmbOutTerm) {
          outboundTerminalName = stripBracketCode(currentRoute.gmbOutTerm);
        } else {
          const last = list[list.length - 1];
          const stopInfo = await getStopDetail(company, last.stop);
          outboundTerminalName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(currentRoute.orig_tc);
        }
      }
    }

    const finalInName = inboundTerminalName !== "?" ? inboundTerminalName : stripBracketCode(currentRoute.dest_tc);
    const finalOutName = outboundTerminalName !== "?" ? outboundTerminalName : stripBracketCode(currentRoute.orig_tc);

    if (hasInbound && hasOutbound) {
      btnIn.textContent = `往 ${finalInName} 方向`;
      btnIn.disabled = false;
      btnOut.textContent = `往 ${finalOutName} 方向`;
      btnOut.disabled = false;
    } else if (hasInbound) {
      btnIn.textContent = `往 ${finalInName} 方向`;
      btnIn.disabled = false;
      btnOut.style.display = "none";
      setTimeout(() => btnIn.click(), 50);
    } else if (hasOutbound) {
      btnOut.textContent = `往 ${finalOutName} 方向`;
      btnOut.disabled = false;
      btnIn.style.display = "none";
      setTimeout(() => btnOut.click(), 50);
    } else {
      btnIn.textContent = "無此方向";
      btnOut.textContent = "無此方向";
    }
  } catch (e) {
    btnIn.textContent = "往 ? 方向";
    btnOut.textContent = "往 ? 方向";
  }
}

document.getElementById("dirInbound").addEventListener("click", () => {
  if (!currentRoute) return;
  currentDirection = "inbound";
  currentDirectionCode = "I";
  loadRouteStopsForCurrentDirection();
});

document.getElementById("dirOutbound").addEventListener("click", () => {
  if (!currentRoute) return;
  currentDirection = "outbound";
  currentDirectionCode = "O";
  loadRouteStopsForCurrentDirection();
});

async function loadRouteStopsForCurrentDirection() {
  if (!currentRoute || !currentDirection) return;
  const company = currentRoute.company;
  const routeId = currentRoute.route;
  const serviceType = currentServiceType;

  const stopList = document.getElementById("stopList");
  if (stopList) stopList.innerHTML = "載入路線站點中...";
  currentStopId = null;
  etaTimesByStop = {};
  cumulativeTravelFromOrigin = null;
  mode = "normal";
  originStopId = null;
  transferStopId = null;
  transferStopName = null;

  const hInfo = document.getElementById("headwayInfo");
  if (hInfo) hInfo.textContent = "計算班距中...";
  const icCtrl = document.getElementById("interchangeControls");
  if (icCtrl) icCtrl.innerHTML = "";
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "none";
  clearTransferState();

  try {
    const rsData = await BusAPI.getRouteStops(company, routeId, currentDirection, serviceType);
    const routeStopList = rsData.data || [];

    const stopsWithDetails = await Promise.all(
      routeStopList.map(async (rs) => {
        const stopInfo = await getStopDetail(company, rs.stop);
        return {
          stop_id: rs.stop,
          seq: rs.seq,
          name_tc: stopInfo && stopInfo.name_tc ? stopInfo.name_tc : (rs.name_tc || `(未知站名) ${rs.stop}`),
          name_en: stopInfo && stopInfo.name_en ? stopInfo.name_en : "",
          lat: stopInfo ? stopInfo.lat : null,
          long: stopInfo ? stopInfo.long : null
        };
      })
    );

    routeStops = stopsWithDetails.sort((a, b) => a.seq - b.seq);

    renderStopList();
    updateMainSunAdviceUI();
    await loadEtaSummaryForAllStops();
    await loadHeadwayInfo();

    showRouteStopsOnMap(routeStops);

    if (userLat != null && userLon != null) {
      let nearestStop = null, minDistance = Infinity;
      routeStops.forEach(stop => {
        if (stop.lat && stop.long) {
          const d = haversineDistanceMeters(userLat, userLon, parseFloat(stop.lat), parseFloat(stop.long));
          if (d < minDistance) { minDistance = d; nearestStop = stop; }
        }
      });

      if (nearestStop) {
        showToast(`📍 自動定位：${nearestStop.name_tc}`);
        setTimeout(() => {
          onStopClicked(nearestStop.stop_id, nearestStop.seq);
          const selectedEl = document.querySelector(`.stop-item[data-stop-id="${nearestStop.stop_id}"][data-seq="${nearestStop.seq}"]`);
          if (selectedEl) selectedEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    }

    if (mainEtaTimer) clearInterval(mainEtaTimer);
    mainEtaTimer = setInterval(async () => {
      if (!currentRoute || !currentDirection || !routeStops.length) return;
      await loadEtaSummaryForAllStops();
      await loadHeadwayInfo();
      updateMainSunAdviceUI();
      if (currentStopId) await loadEtaDetailForStop(currentStopId, originSeq);
    }, 30000);

    saveAppState();
  } catch (e) {
    if (stopList) stopList.textContent = "載入路線站點失敗：" + e.message;
  }
}

/* ========== Step3: 巴士站 + 轉車模式 ========== */

function renderStopList() {
  const container = document.getElementById("stopList");
  if (!container) return;

  let actualOriginSeq = originSeq;
  if (originStopId && !actualOriginSeq) {
    const match = routeStops.find(s => s.stop_id === originStopId);
    if (match) actualOriginSeq = match.seq;
  }

  let actualTransferSeq = transferSeq;
  if (transferStopId && !actualTransferSeq) {
    const match = routeStops.find(s => s.stop_id === transferStopId);
    if (match) actualTransferSeq = match.seq;
  }

  const ctrlDiv = document.getElementById("interchangeControls");
  const tSec = document.getElementById("transfer-search-section");
  if (ctrlDiv) ctrlDiv.innerHTML = "";
  if (tSec) tSec.style.display = "none";

  let originIndex = -1;

  if (mode === "interchange_pick" && originStopId) {
    const origin = routeStops.find(s => s.stop_id === originStopId && s.seq == actualOriginSeq) || routeStops.find(s => s.stop_id === originStopId);
    if (origin) originIndex = routeStops.indexOf(origin);
  } else if (mode === "interchange_pair" && originStopId && transferStopId) {
    const origin = routeStops.find(s => s.stop_id === originStopId && s.seq == actualOriginSeq) || routeStops.find(s => s.stop_id === originStopId);
    const trans = routeStops.find(s => s.stop_id === transferStopId && s.seq == actualTransferSeq) || routeStops.find(s => s.stop_id === transferStopId);
    if (origin) originIndex = routeStops.indexOf(origin);
    transferStopName = trans ? normalizeStopName(trans.name_tc) : null;

    if (ctrlDiv) {
      const btn = document.createElement("button");
      btn.textContent = "取消轉車";
      btn.onclick = exitInterchangeMode;
      ctrlDiv.appendChild(btn);
    }
    if (tSec) tSec.style.display = "block";
    clearTransferState();
  }

  container.innerHTML = "";

  routeStops.forEach((s, index) => {
    let isVisible = true;
    if (mode === "interchange_pair") {
      const isOrigin = (s.stop_id === originStopId && s.seq == actualOriginSeq);
      const isTransfer = (s.stop_id === transferStopId && s.seq == actualTransferSeq);
      if (!isOrigin && !isTransfer) isVisible = false;
    } else if (mode === "interchange_pick") {
      if (originStopId && s.stop_id === originStopId && s.seq != actualOriginSeq) isVisible = false;
    }

    const div = document.createElement("div");
    div.className = "stop-item";
    div.dataset.stopId = s.stop_id;
    div.dataset.seq = s.seq;
    if (!isVisible) div.style.display = "none";

    const header = document.createElement("div");
    header.className = "stop-header";

    const left = document.createElement("div");
    left.className = "stop-title";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = `${s.seq}. ${s.name_tc}`;
    left.appendChild(titleSpan);

    if (mode === "interchange_pick" && originIndex >= 0 && index > originIndex) {
      const interBtn = document.createElement("button");
      interBtn.className = "btn-small";
      interBtn.textContent = "轉車";
      interBtn.onclick = (ev) => {
        ev.stopPropagation();
        onInterchangeButtonClick(s.stop_id, s.seq);
      };
      left.appendChild(interBtn);
    }

    const summaryWrapper = document.createElement("span");
    summaryWrapper.className = "summary-wrapper";
    const summarySpan = document.createElement("span");
    summarySpan.className = "stop-eta-summary";
    const boardingSpan = document.createElement("span");
    boardingSpan.className = "stop-boarding-info";

    summaryWrapper.appendChild(summarySpan);
    summaryWrapper.appendChild(boardingSpan);
    header.appendChild(left);
    header.appendChild(summaryWrapper);

    const etaBlock = document.createElement("div");
    etaBlock.className = "eta-block";
    div.appendChild(header);
    div.appendChild(etaBlock);

    div.onclick = () => {
      if (mode === "interchange_pair") return;
      onStopClicked(s.stop_id, s.seq);
    };

    container.appendChild(div);
  });
}

async function exitInterchangeMode() {
  resetTransferOnly();
  if (transferEtaTimer) { clearInterval(transferEtaTimer); transferEtaTimer = null; }

  const prevOrigin = originStopId, prevOriginSeq = originSeq;
  mode = "normal";
  originStopId = null;
  transferStopId = null;
  transferStopName = null;
  cumulativeTravelFromOrigin = null;

  const icCtrl = document.getElementById("interchangeControls");
  if (icCtrl) icCtrl.innerHTML = "";
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "none";

  renderStopList();
  await loadEtaSummaryForAllStops();
  await loadHeadwayInfo();
  if (prevOrigin) onStopClicked(prevOrigin, prevOriginSeq);
  saveAppState();
}

function onInterchangeButtonClick(stopId, seq) {
  let targetSeq = parseInt(seq);
  if (isNaN(targetSeq)) {
    const found = routeStops.find(s => s.stop_id === stopId);
    if (found) targetSeq = parseInt(found.seq);
  }

  if (mode === "normal") {
    originStopId = stopId;
    const allMatches = routeStops.filter(s => s.stop_id === stopId);
    if (allMatches.length > 1) targetSeq = Math.min(...allMatches.map(s => parseInt(s.seq)));
    originSeq = targetSeq;
    mode = "interchange_pick";
    recomputeCumulativeTravelFromOrigin(stopId);
    renderStopList();
    selectStop(stopId, targetSeq);
    return;
  }

  if (mode === "interchange_pick") {
    if (stopId === originStopId) targetSeq = originSeq;
    transferStopId = stopId;
    transferSeq = targetSeq;
    currentTransferStopId = stopId;
    currentTransferSeq = targetSeq;
    mode = "interchange_pair";

    renderStopList();
    updateMainSunAdviceUI();

    const walkInfoDiv = document.getElementById("transferWalkInfo");
    if (walkInfoDiv) walkInfoDiv.textContent = "";

    ensureDefaultTrackingAtOrigin().then(() => {
      if (originStopId) loadEtaDetailForStop(originStopId, originSeq);
      if (transferStopId && (transferStopId !== originStopId || transferSeq != originSeq)) {
        loadEtaDetailForStop(transferStopId, transferSeq);
      }
      guessBoardingBusAtTransferStop();
    });

    if (window.allStopMarkers && map) {
      const marker = window.allStopMarkers.find(m => m.stopId === stopId && m.seq == targetSeq)
                  || window.allStopMarkers.find(m => m.stopId === stopId);
      if (marker) {
        map.setView(marker.getLatLng(), 16);
        if (marker.openPopup) marker.openPopup();
      }
    }
  }

  autoTrackFirstEta(originStopId, originSeq);
  saveAppState();
}

function onStopClicked(stopId, seq) {
  originStopId = stopId;
  originSeq = seq;
  if (mode === "normal") mode = "interchange_pick";

  recomputeCumulativeTravelFromOrigin(stopId);
  renderStopList();
  updateMainSunAdviceUI();
  drawUserWalkRouteToStop(stopId);
  selectStop(stopId, seq);
  saveAppState();
}

async function selectStop(stopId, seq) {
  currentStopId = stopId;
  const targetSeq = parseInt(seq);
  if (!currentRoute) return;

  const company = currentRoute.company;
  const routeName = currentRoute.route;
  const allItems = document.querySelectorAll("#stopList .stop-item");

  let destKey = (currentRoute.dest_tc || "").substring(0, 2);
  if (routeStops.length > 0) {
    const lastStop = routeStops[routeStops.length - 1];
    const cleanName = (lastStop.name_tc || "").replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
    if (cleanName.length >= 2) destKey = cleanName.substring(0, 2);
  }

  allItems.forEach(el => {
    el.classList.toggle("selected", el.dataset.stopId === stopId && parseInt(el.dataset.seq) === targetSeq);
  });

  const el = document.querySelector(`#stopList .stop-item[data-stop-id="${stopId}"][data-seq="${targetSeq}"]`);
  if (!el) return;
  const etaBlock = el.querySelector(".eta-block");
  if (!etaBlock) return;
  etaBlock.textContent = "載入 ETA 中...";

  if (mainEtaTimer) { clearInterval(mainEtaTimer); mainEtaTimer = null; }

  async function loadEta() {
    try {
      let combinedEtaList = [];
      const isCrossHarbour = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName));

      try {
        const mainData = await BusAPI.getEta(company, stopId, routeName, currentServiceType);
        let mainList = (mainData.data || []).filter(item => parseInt(item.seq) === targetSeq);
        if ((company === "KMB" || isGmbCompany(company)) && currentDirectionCode) {
          mainList = mainList.filter(item => item.dir === currentDirectionCode);
        }
        mainList.forEach(item => { item._company = company; combinedEtaList.push(item); });
      } catch (e) {}

      if (isCrossHarbour && destKey) {
        const oppCompany = company === "KMB" ? "CTB" : "KMB";
        try {
          const [oppIn, oppOut] = await Promise.all([
            BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({ data: [] })),
            BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({ data: [] }))
          ]);
          const oppStopIds = new Set();
          const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === targetSeq);
          if (s1) oppStopIds.add(s1.stop);
          const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === targetSeq);
          if (s2) oppStopIds.add(s2.stop);

          const etaResults = await Promise.all(
            Array.from(oppStopIds).map(sid => BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({ data: [] })))
          );
          etaResults.forEach(res => {
            (res.data || []).forEach(item => {
              if (parseInt(item.seq) === targetSeq && (item.dest_tc || "").includes(destKey)) {
                item._company = oppCompany;
                combinedEtaList.push(item);
              }
            });
          });
        } catch (e) {}
      }

      const seen = new Set();
      combinedEtaList = combinedEtaList.filter(item => {
        const etaStr = String(item.eta || "").trim().toUpperCase();
        const rmkStr = String(item.rmk_tc || "").trim();
        if (!etaStr || etaStr === "N/A" || etaStr === "NULL") return false;
        if (rmkStr.includes("時段") || rmkStr.includes("預定班次") || rmkStr === "離開") return false;
        const key = `${item._company}_${etaStr}_${item.dest_tc}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      combinedEtaList.sort((a, b) => new Date(a.eta) - new Date(b.eta));

      etaBlock.innerHTML = "";
      if (!combinedEtaList.length) {
        etaBlock.textContent = "暫時冇班次資料";
      } else {
        combinedEtaList.forEach(item => {
          const { text, minutes, isScheduled, status, etaTime } = formatDetailLine(item);
          const row = document.createElement("div");
          row.className = "eta-row";
          if (minutes <= 0) row.classList.add("eta-imminent");
          else row.style.color = grayColorByMinutes(minutes);

          const contentNode = document.createElement("span");
          const badge = isCrossHarbour ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
          contentNode.textContent = badge + text;
          if (isScheduled) contentNode.style.fontStyle = "italic";
          row.appendChild(contentNode);

          const btnTrack = document.createElement("button");
          btnTrack.className = "btn-track";
          btnTrack.textContent = "追蹤";
          btnTrack.onclick = (e) => {
            e.stopPropagation();
            setTrackingEta({ id: item.eta_seq || `${routeName}_${item.seq}_${item.eta}`, etaTime, status }, row);
          };
          row.appendChild(btnTrack);
          etaBlock.appendChild(row);
        });
      }
    } catch (e) {
      etaBlock.textContent = "載入 ETA 失敗";
    }
  }

  loadEta();
  mainEtaTimer = setInterval(loadEta, 30000);
  setTimeout(() => focusMapToStop(stopId, 16, true), 300);
}

function focusMapToStop(stopId, zoomLevel = 16, openPopup = false) {
  if (!map || !stopId) return;
  const info = allStopsMap.get(stopId);
  if (!info) return;
  const lat = parseFloat(info.lat), lon = parseFloat(info.long);
  if (!isFinite(lat) || !isFinite(lon)) return;
  map.setView([lat, lon], zoomLevel);
  if (openPopup && window.allStopMarkers) {
    const m = window.allStopMarkers.find(mk => mk.stopId === stopId);
    if (m && m.openPopup) m.openPopup();
  }
}

/* ========== Step3：估用家喺轉車站搭緊邊班車 ========== */

function setBoardingInfoTextForTransferStop(text) {
  if (!transferStopId) return;
  const stopEl = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
  if (!stopEl) return;
  const span = stopEl.querySelector(".stop-boarding-info");
  if (span) span.textContent = text || "";
}

async function ensureDefaultTrackingAtOrigin() {
  if (!originStopId || !currentRoute || !currentDirectionCode || selectedEtaTime) return;
  try {
    const company = currentRoute.company || "KMB";
    const data = await BusAPI.getEta(company, originStopId, currentRoute.route, currentServiceType);
    const list = (data.data || []).filter(item => (!currentDirectionCode || item.dir === currentDirectionCode) && item.eta && !String(item.rmk_tc || "").includes("時段"));
    if (!list.length) return;
    const detail = formatDetailLine(list[0]);
    if (!detail.etaTime) return;
    setTrackingEta({ id: `${originStopId}-0`, etaTime: detail.etaTime, status: detail.status }, null);
  } catch (e) {}
}

function findClosestMatchingBus(targetTime, targetStatus, candidates) {
  if (!candidates || !candidates.length || !targetTime) return { type: "untrackable", bus: null };
  const timesSorted = candidates.map(c => c.time).filter(t => t instanceof Date && !isNaN(t)).sort((a, b) => a - b);
  let limitMin = 10;
  if (timesSorted.length >= 2) {
    const diffs = [];
    for (let i = 1; i < timesSorted.length; i++) {
      const diff = Math.round((timesSorted[i] - timesSorted[i - 1]) / 60000);
      if (diff > 0) diffs.push(diff);
    }
    if (diffs.length) limitMin = (diffs.reduce((a, b) => a + b, 0) / diffs.length) / 2;
  }

  const sameStatus = candidates.filter(c => c.status === targetStatus);
  const otherStatus = candidates.filter(c => c.status !== targetStatus);

  function pickClosest(list) {
    let best = null, bestAbsMin = Infinity;
    list.forEach(c => {
      const diffMin = (c.time - targetTime) / 60000;
      const absMin = Math.abs(diffMin);
      if (absMin < bestAbsMin) { bestAbsMin = absMin; best = { bus: c, diffMin, absMin }; }
    });
    return best;
  }

  let result = pickClosest(sameStatus);
  if (!result && otherStatus.length) result = pickClosest(otherStatus);
  if (!result || result.absMin > limitMin) return { type: "untrackable", bus: null };
  return { type: "ok", bus: result.bus, diffMin: result.diffMin, limitMin };
}

async function guessBoardingBusAtTransferStop() {
  if (!selectedEtaTime || !originStopId || !transferStopId || !cumulativeTravelFromOrigin || !currentRoute || !currentDirectionCode) {
    trackedTransferArriveTime = null;
    setBoardingInfoTextForTransferStop("無法追蹤");
    return;
  }

  const targetSeq = transferSeq != null ? transferSeq : null;
  let stopElInit = targetSeq
    ? document.querySelector(`.stop-item[data-stop-id="${transferStopId}"][data-seq="${targetSeq}"]`)
    : document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
  if (!stopElInit) stopElInit = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);

  if (stopElInit) {
    stopElInit.querySelectorAll(".eta-row.transfer-tracked").forEach(row => row.classList.remove("transfer-tracked"));
  }

  const info = cumulativeTravelFromOrigin[transferStopId];
  if (!info) {
    trackedTransferArriveTime = null;
    setBoardingInfoTextForTransferStop("無法追蹤");
    return;
  }

  const arriveAtTransfer = new Date(selectedEtaTime.getTime() + (info.travelMinutes || 0) * 60000);
  const company = currentRoute.company || "KMB";
  const routeName = currentRoute.route;
  const isCrossHarbour = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName));

  let destKey = (currentRoute.dest_tc || "").substring(0, 2);
  if (routeStops.length > 0) {
    const lastStop = routeStops[routeStops.length - 1];
    const cleanName = (lastStop.name_tc || "").replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
    if (cleanName.length >= 2) destKey = cleanName.substring(0, 2);
  }

  try {
    let combinedEtaList = [];
    try {
      const mainData = await BusAPI.getEta(company, transferStopId, routeName, currentServiceType);
      let mainList = mainData.data || [];
      if (currentDirectionCode && (company === "KMB" || isGmbCompany(company))) {
        mainList = mainList.filter(item => item.dir === currentDirectionCode);
      }
      if (targetSeq !== null) mainList = mainList.filter(item => parseInt(item.seq) === parseInt(targetSeq));
      mainList.forEach(item => { item._company = company; combinedEtaList.push(item); });
    } catch (e) {}

    if (isCrossHarbour && destKey) {
      const oppCompany = company === "KMB" ? "CTB" : "KMB";
      try {
        const [oppIn, oppOut] = await Promise.all([
          BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({ data: [] })),
          BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({ data: [] }))
        ]);
        const oppStopIds = new Set();
        if (targetSeq !== null) {
          const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === parseInt(targetSeq));
          if (s1) oppStopIds.add(s1.stop);
          const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === parseInt(targetSeq));
          if (s2) oppStopIds.add(s2.stop);
        }
        const etaResults = await Promise.all(
          Array.from(oppStopIds).map(sid => BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({ data: [] })))
        );
        etaResults.forEach(res => {
          (res.data || []).forEach(item => {
            if ((item.dest_tc || "").includes(destKey)) {
              if (targetSeq !== null && parseInt(item.seq) !== parseInt(targetSeq)) return;
              item._company = oppCompany;
              combinedEtaList.push(item);
            }
          });
        });
      } catch (e) {}
    }

    const seen = new Set();
    combinedEtaList = combinedEtaList.filter(item => {
      const etaStr = String(item.eta || "").trim().toUpperCase();
      const rmkStr = String(item.rmk_tc || "").trim();
      if (!etaStr || etaStr === "N/A" || etaStr === "NULL") return false;
      if (rmkStr.includes("時段") || rmkStr.includes("預定班次") || rmkStr === "離開") return false;
      const key = `${item._company}_${etaStr}_${item.dest_tc}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const actualEtas = combinedEtaList.map((item, idx) => {
      const d = formatDetailLine(item);
      return d.etaTime ? { index: idx, time: d.etaTime, status: d.status, isScheduled: d.isScheduled } : null;
    }).filter(Boolean);

    const result = findClosestMatchingBus(arriveAtTransfer, selectedEtaStatus || "not_departed", actualEtas);
    if (result.type === "untrackable") {
      trackedTransferArriveTime = null;
      setBoardingInfoTextForTransferStop("無法追蹤");
      return;
    }

    trackedTransferArriveTime = result.bus.time;
    const tStr = formatTimeHHMM(result.bus.time);
    setBoardingInfoTextForTransferStop(`搭緊：${tStr}`);

    if (stopElInit) {
      stopElInit.querySelectorAll(".eta-row").forEach(row => {
        const span = row.querySelector("span");
        if (span) row.classList.toggle("transfer-tracked", (span.textContent || "").includes(tStr));
      });
    }
  } catch (e) {
    trackedTransferArriveTime = null;
    setBoardingInfoTextForTransferStop("無法追蹤");
  }
}

async function loadEtaDetailForStop(stopId, seq) {
  const targetSeq = parseInt(seq);
  let el = !isNaN(targetSeq) ? document.querySelector(`.stop-item[data-stop-id="${stopId}"][data-seq="${targetSeq}"]`) : null;
  if (!el) el = document.querySelector(`.stop-item[data-stop-id="${stopId}"]`);
  if (!el) return;

  const etaBlock = el.querySelector(".eta-block");
  if (!etaBlock) return;
  etaBlock.textContent = "載入 ETA 中...";

  let destKey = (currentRoute.dest_tc || "").substring(0, 2);
  if (routeStops.length > 0) {
    const lastStop = routeStops[routeStops.length - 1];
    const cleanName = (lastStop.name_tc || "").replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
    if (cleanName.length >= 2) destKey = cleanName.substring(0, 2);
  }

  try {
    let combinedEtaList = [];
    const company = currentRoute.company || "KMB";
    const routeName = currentRoute.route;
    const isCrossHarbour = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName));

    try {
      const mainData = await BusAPI.getEta(company, stopId, routeName, currentServiceType);
      let mainList = mainData.data || [];
      if (!isNaN(targetSeq)) mainList = mainList.filter(item => parseInt(item.seq) === targetSeq);
      if (currentDirectionCode && (company === "KMB" || isGmbCompany(company))) {
        mainList = mainList.filter(item => item.dir === currentDirectionCode);
      }
      mainList.forEach(item => { item._company = company; combinedEtaList.push(item); });
    } catch (e) {}

    if (isCrossHarbour && destKey) {
      const oppCompany = company === "KMB" ? "CTB" : "KMB";
      try {
        const [oppIn, oppOut] = await Promise.all([
          BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({ data: [] })),
          BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({ data: [] }))
        ]);
        const oppStopIds = new Set();
        const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s1) oppStopIds.add(s1.stop);
        const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s2) oppStopIds.add(s2.stop);

        const etaResults = await Promise.all(
          Array.from(oppStopIds).map(sid => BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({ data: [] })))
        );
        etaResults.forEach(res => {
          (res.data || []).forEach(item => {
            if (parseInt(item.seq) === targetSeq && (item.dest_tc || "").includes(destKey)) {
              item._company = oppCompany;
              combinedEtaList.push(item);
            }
          });
        });
      } catch (e) {}
    }

    const seen = new Set();
    combinedEtaList = combinedEtaList.filter(item => {
      const etaStr = String(item.eta || "").trim().toUpperCase();
      const rmkStr = String(item.rmk_tc || "").trim();
      if (!etaStr || etaStr === "N/A" || etaStr === "NULL") return false;
      if (rmkStr.includes("時段") || rmkStr.includes("預定班次") || rmkStr === "離開") return false;
      const key = `${item._company}_${etaStr}_${item.dest_tc}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    combinedEtaList.sort((a, b) => new Date(a.eta) - new Date(b.eta));

    etaBlock.innerHTML = "";
    if (!combinedEtaList.length) {
      etaBlock.textContent = "暫時冇班次資料";
    } else {
      combinedEtaList.forEach(item => {
        const { text, minutes, isScheduled, status, etaTime } = formatDetailLine(item);
        const row = document.createElement("div");
        row.className = "eta-row";
        if (minutes <= 0) row.classList.add("eta-imminent");
        else row.style.color = grayColorByMinutes(minutes);

        const contentNode = document.createElement("span");
        const badge = isCrossHarbour ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
        contentNode.textContent = badge + text;
        if (isScheduled) contentNode.style.fontStyle = "italic";
        row.appendChild(contentNode);

        let showTrackBtn = true;
        if (mode === "interchange_pair" || mode === "interchange_pick") {
          const isOrigin = (stopId === originStopId && (!originSeq || targetSeq === parseInt(originSeq)));
          if (!isOrigin) showTrackBtn = false;
        }

        if (showTrackBtn) {
          const btnTrack = document.createElement("button");
          btnTrack.className = "btn-track";
          btnTrack.textContent = "追蹤";
          btnTrack.onclick = (e) => {
            e.stopPropagation();
            setTrackingEta({ id: item.eta_seq || `${routeName}_${item.seq}_${item.eta}`, etaTime, status }, row);
          };
          row.appendChild(btnTrack);
        }
        etaBlock.appendChild(row);
      });
    }
  } catch (e) {
    etaBlock.textContent = "載入 ETA 失敗：" + e.message;
  }
}

function autoTrackFirstEta(stopId, seq) {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    const stopDiv = document.querySelector(`.stop-item[data-stop-id="${stopId}"][data-seq="${seq}"]`);
    if (stopDiv) {
      const firstEtaBtn = stopDiv.querySelector(".btn-track");
      if (firstEtaBtn) {
        firstEtaBtn.click();
        clearInterval(interval);
        return;
      }
    }
    if (attempts >= 20) clearInterval(interval);
  }, 500);
}

/* ========== 單線班距 / Summary ========== */

async function loadEtaSummaryForAllStopsNormal() {
  if (!currentRoute) return;
  const company = currentRoute.company || "KMB";

  const promises = routeStops.map(s =>
    BusAPI.getEta(company, s.stop_id, currentRoute.route, currentServiceType)
      .then(data => ({
        stop_id: s.stop_id,
        list: (data.data || []).filter(item => item.eta && !String(item.rmk_tc || "").includes("時段"))
      }))
      .catch(() => ({ stop_id: s.stop_id, list: [] }))
  );

  try {
    const results = await Promise.all(promises);
    etaTimesByStop = {};

    results.forEach(({ stop_id, list }) => {
      if (currentDirectionCode) list = list.filter(item => item.dir === currentDirectionCode);
      const stopEl = document.querySelector(`.stop-item[data-stop-id="${stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;

      if (!list.length) {
        summarySpan.textContent = "";
        etaTimesByStop[stop_id] = [];
        return;
      }

      const times = list.filter(item => item.eta).map(item => new Date(item.eta)).sort((a, b) => a - b);
      etaTimesByStop[stop_id] = times;

      const { minutes, label } = minutesAndLabel(list[0].eta);
      summarySpan.textContent = label;
      summarySpan.style.fontWeight = minutes <= 0 ? "bold" : "normal";
      summarySpan.style.color = minutes <= 0 ? "#d32f2f" : grayColorByMinutes(minutes);
    });
  } catch (e) {}
}

async function loadEtaSummaryForAllStops() {
  if (!originStopId) {
    await loadEtaSummaryForAllStopsNormal();
    return;
  }
  if (!currentRoute || !cumulativeTravelFromOrigin) return;

  let originEta = null;
  try {
    const company = currentRoute.company || "KMB";
    const data = await BusAPI.getEta(company, originStopId, currentRoute.route, currentServiceType);
    let list = (data.data || []).filter(item => item.eta && !String(item.rmk_tc || "").includes("時段"));
    if (currentDirectionCode) list = list.filter(item => item.dir === currentDirectionCode);
    if (list.length > 0 && list[0].eta) originEta = new Date(list[0].eta);
  } catch (e) {}

  const baseDepart = selectedEtaTime || originEta;

  routeStops.forEach(s => {
    const stopEl = document.querySelector(`.stop-item[data-stop-id="${s.stop_id}"]`);
    if (!stopEl) return;
    const summarySpan = stopEl.querySelector(".stop-eta-summary");
    if (!summarySpan) return;

    const info = cumulativeTravelFromOrigin[s.stop_id];
    if (!info || !baseDepart) {
      summarySpan.textContent = "";
      return;
    }

    const travelMin = info.travelMinutes || 0;
    const arrive = new Date(baseDepart.getTime() + travelMin * 60000);
    summarySpan.textContent = `行駛 ${travelMin} 分鐘 (${formatTimeHHMM(arrive)} 到達)`;
    summarySpan.style.fontWeight = "normal";
    summarySpan.style.color = "#555555";
  });
}

async function loadHeadwayInfo() {
  const infoDiv = document.getElementById("headwayInfo");
  if (!infoDiv) return;
  infoDiv.textContent = "計算班距中...";

  if (!currentRoute || !currentDirection || !routeStops || !routeStops.length) {
    infoDiv.textContent = "";
    return;
  }

  try {
    const targetStopInfo = routeStops.find(s => s.stop_id === currentStopId) || routeStops[0];
    const targetStopId = targetStopInfo.stop_id;
    const targetSeq = parseInt(targetStopInfo.seq);

    let combinedEtaList = [];
    const company = currentRoute.company || "KMB";
    const routeName = currentRoute.route;
    const isJointRoute = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName));

    let destKey = (currentRoute.dest_tc || "").substring(0, 2);
    if (routeStops.length > 0) {
      const lastStop = routeStops[routeStops.length - 1];
      const cleanName = lastStop.name_tc.replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
      if (cleanName.length >= 2) destKey = cleanName.substring(0, 2);
    }

    try {
      const mainData = await BusAPI.getEta(company, targetStopId, routeName, currentServiceType);
      let mainList = mainData.data || [];
      if (currentDirectionCode) mainList = mainList.filter(item => item.dir === currentDirectionCode);
      mainList.forEach(item => combinedEtaList.push(item));
    } catch (e) {}

    if (isJointRoute && destKey) {
      const oppCompany = company === "KMB" ? "CTB" : "KMB";
      try {
        const [oppIn, oppOut] = await Promise.all([
          BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({ data: [] })),
          BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({ data: [] }))
        ]);
        const oppStopIds = new Set();
        const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s1) oppStopIds.add(s1.stop);
        const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s2) oppStopIds.add(s2.stop);

        const etaResults = await Promise.all(
          Array.from(oppStopIds).map(sid => BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({ data: [] })))
        );
        etaResults.forEach(res => {
          (res.data || []).forEach(item => {
            if ((item.dest_tc || "").includes(destKey)) combinedEtaList.push(item);
          });
        });
      } catch (e) {}
    }

    const times = [];
    const seen = new Set();
    combinedEtaList.forEach(item => {
      const etaStr = String(item.eta || "").trim().toUpperCase();
      const rmkStr = String(item.rmk_tc || "").trim();
      if (!etaStr || etaStr === "N/A" || etaStr === "NULL") return;
      if (rmkStr.includes("時段") || rmkStr.includes("預定班次") || rmkStr === "離開") return;
      const t = new Date(item.eta);
      if (isNaN(t.getTime())) return;
      const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}-${t.getHours()}-${t.getMinutes()}`;
      if (seen.has(key)) return;
      seen.add(key);
      times.push(t);
    });

    times.sort((a, b) => a - b);
    if (times.length < 2) {
      infoDiv.textContent = "班距資料不足。";
      return;
    }

    const diffs = [];
    for (let i = 1; i < times.length; i++) {
      const diffMin = Math.round((times[i] - times[i - 1]) / 60000);
      if (diffMin >= 2 && diffMin <= 60) diffs.push(diffMin);
    }

    if (!diffs.length) {
      infoDiv.textContent = "班距資料不足。";
      return;
    }

    const avg = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    infoDiv.textContent = `${targetStopInfo ? targetStopInfo.name_tc : "此站"} 大約 ${avg} 分鐘一班車`;
  } catch (e) {
    infoDiv.textContent = "班距資料不足。";
  }
}

/* ========== Step4：轉車路線 / 方向 / 站 ========== */

function getTransferDestKey() {
  if (!transferRoute) return "";
  let destKey = (transferRoute.dest_tc || "").substring(0, 2);
  if (transferRouteStops && transferRouteStops.length > 0) {
    const lastStop = transferRouteStops[transferRouteStops.length - 1];
    let cleanName = (lastStop.name_tc || "").replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
    cleanName = stripBracketCode(cleanName);
    if (cleanName.length >= 2) destKey = cleanName.substring(0, 2);
  }
  return destKey;
}

async function fetchCombinedTransferEtaForStop(stopId, seq) {
  if (!transferRoute) return [];
  const company = transferRoute.company || "KMB";
  const routeName = transferRoute.route;
  const st = transferServiceType || "1";
  const targetSeq = parseInt(seq);
  const isJointRoute = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName));
  const destKey = getTransferDestKey();

  let combinedEtaList = [];

  try {
    const mainData = await BusAPI.getEta(company, stopId, routeName, st);
    let mainList = mainData.data || [];
    if (!isNaN(targetSeq)) mainList = mainList.filter(item => parseInt(item.seq) === targetSeq);
    if (transferDirectionCode) mainList = mainList.filter(item => item.dir === transferDirectionCode);
    mainList.forEach(item => { item._company = company; combinedEtaList.push(item); });
  } catch (e) {}

  if (isJointRoute && destKey) {
    const oppCompany = company === "KMB" ? "CTB" : "KMB";
    try {
      const [oppIn, oppOut] = await Promise.all([
        BusAPI.getRouteStops(oppCompany, routeName, "inbound", st).catch(() => ({ data: [] })),
        BusAPI.getRouteStops(oppCompany, routeName, "outbound", st).catch(() => ({ data: [] }))
      ]);
      const oppStopIds = new Set();
      if (!isNaN(targetSeq)) {
        const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s1) oppStopIds.add(s1.stop);
        const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s2) oppStopIds.add(s2.stop);
      }

      const etaResults = await Promise.all(
        Array.from(oppStopIds).map(sid => BusAPI.getEta(oppCompany, sid, routeName, st).catch(() => ({ data: [] })))
      );
      etaResults.forEach(res => {
        (res.data || []).forEach(item => {
          if ((!isNaN(targetSeq) ? parseInt(item.seq) === targetSeq : true) && (item.dest_tc || "").includes(destKey)) {
            item._company = oppCompany;
            combinedEtaList.push(item);
          }
        });
      });
    } catch (e) {}
  }

  const seen = new Set();
  combinedEtaList = combinedEtaList.filter(item => {
    const etaStr = String(item.eta || "").trim().toUpperCase();
    const rmkStr = String(item.rmk_tc || "").trim();
    if (!etaStr || etaStr === "N/A" || etaStr === "NULL") return false;
    if (rmkStr.includes("時段") || rmkStr.includes("預定班次") || rmkStr === "離開") return false;
    const key = `${item._company}_${etaStr}_${item.dest_tc}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  combinedEtaList.sort((a, b) => new Date(a.eta) - new Date(b.eta));
  return combinedEtaList;
}

async function selectTransferRoute(route) {
  if (transferEtaTimer) { clearInterval(transferEtaTimer); transferEtaTimer = null; }
  if (route && isGmbCompany(route.company)) await ensureGmbRouteMeta(route);

  transferRoute = route;
  transferServiceType = route.service_type || "1";
  transferDirection = null;
  transferDirectionCode = null;
  transferRouteStops = [];
  transferCurrentStopId = null;
  transferEtaTimesByStop = {};

  const d1 = document.getElementById("transferRouteInputDisplay");
  if (d1) d1.textContent = `${route.route}（${route.orig_tc} ↔ ${route.dest_tc}）`;
  const d2 = document.getElementById("transferStopList");
  if (d2) d2.innerHTML = "";
  const d3 = document.getElementById("transferHeadwayInfo");
  if (d3) d3.textContent = "";
  const routeListContainer = document.getElementById("transferRouteList");
  if (routeListContainer) routeListContainer.innerHTML = "";

  const btnIn = document.getElementById("transferDirInbound");
  const btnOut = document.getElementById("transferDirOutbound");
  if (!btnIn || !btnOut) return;

  btnIn.style.display = "";
  btnOut.style.display = "";
  btnIn.disabled = true;
  btnOut.disabled = true;
  btnIn.textContent = "載入方向中...";
  btnOut.textContent = "載入方向中...";

  transferKeyboardHidden = true;
  renderTransferVirtualKeyboard();

  try {
    const routeId = transferRoute.route;
    const st = transferServiceType;
    const company = transferRoute.company || "KMB";

    const [inData, outData] = await Promise.allSettled([
      BusAPI.getRouteStops(company, routeId, "inbound", st),
      BusAPI.getRouteStops(company, routeId, "outbound", st)
    ]);

    let inName = "?", outName = "?", hasInbound = false, hasOutbound = false;

    if (inData.status === "fulfilled" && inData.value.data) {
      const list = inData.value.data.sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasInbound = true;
        if (isGmbCompany(company) && transferRoute.gmbInTerm) {
          inName = stripBracketCode(transferRoute.gmbInTerm);
        } else {
          const last = list[list.length - 1];
          const stopInfo = await getStopDetail(company, last.stop);
          inName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.dest_tc);
        }
      }
    }

    if (outData.status === "fulfilled" && outData.value.data) {
      const list = outData.value.data.sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasOutbound = true;
        if (isGmbCompany(company) && transferRoute.gmbOutTerm) {
          outName = stripBracketCode(transferRoute.gmbOutTerm);
        } else {
          const last = list[list.length - 1];
          const stopInfo = await getStopDetail(company, last.stop);
          outName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.orig_tc);
        }
      }
    }

    if (hasInbound && hasOutbound) {
      btnIn.textContent = `往 ${inName !== "?" ? inName : stripBracketCode(transferRoute.dest_tc)} 方向`;
      btnIn.disabled = false;
      btnOut.textContent = `往 ${outName !== "?" ? outName : stripBracketCode(transferRoute.orig_tc)} 方向`;
      btnOut.disabled = false;
    } else if (hasInbound) {
      btnIn.textContent = `往 ${inName !== "?" ? inName : stripBracketCode(transferRoute.dest_tc)} 方向`;
      btnIn.disabled = false;
      btnOut.style.display = "none";
      setTimeout(() => btnIn.click(), 50);
    } else if (hasOutbound) {
      btnOut.textContent = `往 ${outName !== "?" ? outName : stripBracketCode(transferRoute.orig_tc)} 方向`;
      btnOut.disabled = false;
      btnIn.style.display = "none";
      setTimeout(() => btnOut.click(), 50);
    } else {
      btnIn.textContent = "無此方向";
      btnOut.textContent = "無此方向";
    }

    const btnReset = document.getElementById("btnResetTransfer");
    if (btnReset) btnReset.style.display = "inline-block";
    saveAppState();
  } catch (e) {
    btnIn.textContent = "往 ? 方向";
    btnOut.textContent = "往 ? 方向";
  }
}

document.getElementById("transferDirInbound").addEventListener("click", () => {
  if (!transferRoute) return;
  transferDirection = "inbound";
  transferDirectionCode = "I";
  loadTransferRouteStopsForCurrentDirection();
});

document.getElementById("transferDirOutbound").addEventListener("click", () => {
  if (!transferRoute) return;
  transferDirection = "outbound";
  transferDirectionCode = "O";
  loadTransferRouteStopsForCurrentDirection();
});

async function loadTransferRouteStopsForCurrentDirection() {
  if (!transferRoute || !transferDirection) return;
  const routeId = transferRoute.route;
  const serviceType = transferServiceType;
  const company = transferRoute.company || "KMB";

  const d1 = document.getElementById("transferStopList");
  if (d1) d1.innerHTML = "載入路線站點中...";
  transferCurrentStopId = null;
  transferEtaTimesByStop = {};

  try {
    const rsData = await BusAPI.getRouteStops(company, routeId, transferDirection, serviceType);
    const routeStopList = rsData.data || [];

    const stopPromises = routeStopList.map(async (rs) => {
      const stopInfo = await getStopDetail(company, rs.stop);
      return {
        stop_id: rs.stop,
        seq: rs.seq,
        name_tc: stopInfo && stopInfo.name_tc ? stopInfo.name_tc : (rs.name_tc || `(未知站名) ${rs.stop}`),
        name_en: stopInfo && stopInfo.name_en ? stopInfo.name_en : (rs.name_en || ""),
        lat: stopInfo ? stopInfo.lat : null,
        long: stopInfo ? stopInfo.long : null
      };
    });

    transferRouteStops = (await Promise.all(stopPromises)).sort((a, b) => a.seq - b.seq);

    shrinkTransferLayoutAfterDirectionChosen();
    renderTransferStopList();
    updateTransferSunAdviceUI();
    await loadTransferEtaSummaryForAllStops();
    await loadTransferHeadwayInfo();

    if (transferEtaTimer) clearInterval(transferEtaTimer);
    transferEtaTimer = setInterval(async () => {
      if (!transferRoute || !transferDirection || !transferRouteStops.length) return;
      await loadTransferEtaSummaryForAllStops();
      await loadTransferHeadwayInfo();
      updateTransferSunAdviceUI();
      if (transferCurrentStopId) await selectTransferStop(transferCurrentStopId, window.transferCurrentSeq);
    }, 30000);

    if (transferStopName) {
      let targetStop = null;
      const nameMatch = transferRouteStops.find(s => normalizeStopName(s.name_tc) === transferStopName);
      if (nameMatch) {
        targetStop = nameMatch;
      } else if (transferStopId) {
        const originInfo = allStopsMap.get(transferStopId);
        if (originInfo) {
          const oLat = parseFloat(originInfo.lat), oLon = parseFloat(originInfo.long);
          if (isFinite(oLat) && isFinite(oLon)) {
            let best = null, bestMinutes = Infinity;
            transferRouteStops.forEach(s => {
              const info = allStopsMap.get(s.stop_id);
              if (!info) return;
              const lat = parseFloat(info.lat), lon = parseFloat(info.long);
              if (!isFinite(lat) || !isFinite(lon)) return;
              const mins = haversineDistanceMeters(oLat, oLon, lat, lon) / (5000 / 60);
              if (mins < bestMinutes) { bestMinutes = mins; best = s; }
            });
            if (best && bestMinutes <= 60) targetStop = best;
          }
        }
      }
      if (targetStop) await selectTransferStop(targetStop.stop_id, targetStop.seq);
      saveAppState();
    }
  } catch (e) {
    if (d1) d1.textContent = "載入路線站點失敗：" + e.message;
    transferHeadNotOk();
  }
}

function transferHeadNotOk() {
  const d2b = document.getElementById("transferHeadwayInfo");
  const btn = document.querySelector(".btn-show-all-stops");
  if (d2b) {
    d2b.textContent = "班距資料不足。";
    if (btn) d2b.appendChild(btn);
  }
}

function shrinkTransferLayoutAfterDirectionChosen() {
  const routeText = transferRoute ? `${transferRoute.route}（${transferRoute.orig_tc} ↔ ${transferRoute.dest_tc}）` : "(未輸入)";
  let dirName = "";
  if (transferDirection === "inbound") {
    dirName = (document.getElementById("transferDirInbound").textContent || "").replace(/^往\s*|\s*方向$/g, "");
  } else if (transferDirection === "outbound") {
    dirName = (document.getElementById("transferDirOutbound").textContent || "").replace(/^往\s*|\s*方向$/g, "");
  }

  const inputDisplay = document.getElementById("transferRouteInputDisplay");
  if (inputDisplay) inputDisplay.textContent = `${routeText}${dirName ? ` 往 ${dirName}` : ""}`;

  const t2 = document.getElementById("transfer-step1-layout");
  if (t2) t2.style.display = "none";

  const dirBlock = document.getElementById("transfer-direction-block");
  if (dirBlock) {
    const dirButtons = dirBlock.querySelector(".direction-buttons");
    const dirLabel = dirBlock.querySelector("strong");
    if (dirButtons) dirButtons.style.display = "none";
    if (dirLabel) dirLabel.style.display = "none";
  }

  const stopBlock = document.getElementById("transfer-stop-block");
  if (stopBlock) stopBlock.style.display = "";
}

async function loadTransferEtaSummaryForAllStops() {
  if (!transferRoute) return;
  const company = transferRoute.company || "KMB";

  const promises = transferRouteStops.map(s =>
    BusAPI.getEta(company, s.stop_id, transferRoute.route, transferServiceType)
      .then(data => ({
        stop_id: s.stop_id,
        seq: s.seq,
        list: (data.data || []).filter(item => item.eta && !String(item.rmk_tc || "").includes("時段"))
      }))
      .catch(() => ({ stop_id: s.stop_id, seq: s.seq, list: [] }))
  );

  try {
    const results = await Promise.all(promises);
    transferEtaTimesByStop = {};

    results.forEach(({ stop_id, seq, list }) => {
      if (transferDirectionCode) list = list.filter(item => item.dir === transferDirectionCode);
      if (seq != null) list = list.filter(item => parseInt(item.seq) === parseInt(seq));
      let stopEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stop_id}"][data-seq="${seq}"]`);
      if (!stopEl) stopEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;

      if (!list.length) {
        summarySpan.textContent = "";
        transferEtaTimesByStop[stop_id] = [];
        return;
      }

      const times = list.filter(item => item.eta).map(item => new Date(item.eta)).sort((a, b) => a - b);
      transferEtaTimesByStop[stop_id] = times;

      const { minutes, label } = minutesAndLabel(list[0].eta);
      summarySpan.textContent = label;
      summarySpan.style.fontWeight = minutes <= 0 ? "bold" : "normal";
      summarySpan.style.color = minutes <= 0 ? "#d32f2f" : grayColorByMinutes(minutes);
    });
  } catch (e) {}
}

async function loadTransferHeadwayInfo() {
  const infoDiv = document.getElementById("transferHeadwayInfo");
  if (!infoDiv) return;
  if (!transferRoute || !transferDirection || !transferRouteStops || !transferRouteStops.length) {
    infoDiv.textContent = "";
    return;
  }

  const createShowAllBtn = () => {
    const btnShowAll = document.createElement("button");
    btnShowAll.className = "btn-show-all-stops";
    btnShowAll.textContent = "顯示全部站";
    btnShowAll.onclick = () => {
      transferCurrentStopId = null;
      document.querySelectorAll("#transferStopList .stop-item").forEach(item => {
        item.style.display = "";
        item.classList.remove("selected", "eta-showing", "transfer-tracked");
        const etaBlock = item.querySelector(".eta-block");
        if (etaBlock) etaBlock.innerHTML = "";
        const sid = item.getAttribute("data-stop-id");
        const sseq = item.getAttribute("data-seq");
        item.onclick = async () => {
          if (!transferCurrentStopId) await selectTransferStop(sid, sseq);
          else if (sid !== transferCurrentStopId || sseq != window.transferCurrentSeq) await checkTransferStopEta(sid, sseq);
        };
      });
      const walkInfoDiv = document.getElementById("transferWalkInfo");
      if (walkInfoDiv) walkInfoDiv.textContent = "";
      showFullSecondRoute();
      btnShowAll.remove();
    };
    return btnShowAll;
  };

  try {
    const targetStopObj = transferRouteStops.find(s => s.stop_id === transferCurrentStopId) || transferRouteStops[0];
    const combinedList = await fetchCombinedTransferEtaForStop(targetStopObj.stop_id, targetStopObj.seq);
    const times = [];
    const seen = new Set();

    combinedList.forEach(item => {
      const t = new Date(item.eta);
      if (isNaN(t.getTime())) return;
      const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}-${t.getHours()}-${t.getMinutes()}`;
      if (seen.has(key)) return;
      seen.add(key);
      times.push(t);
    });

    times.sort((a, b) => a - b);
    infoDiv.innerHTML = "";
    const textSpan = document.createElement("span");

    if (times.length < 2) {
      textSpan.textContent = "班距資料不足。";
    } else {
      const diffs = [];
      for (let i = 1; i < times.length; i++) {
        const diffMin = Math.round((times[i] - times[i - 1]) / 60000);
        if (diffMin >= 2 && diffMin <= 60) diffs.push(diffMin);
      }
      if (!diffs.length) {
        textSpan.textContent = "班距資料不足。";
      } else {
        const avg = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
        textSpan.textContent = `${targetStopObj ? targetStopObj.name_tc : "此站"} 大約 ${avg} 分鐘一班車`;
      }
    }

    infoDiv.appendChild(textSpan);
    if (transferCurrentStopId) infoDiv.appendChild(createShowAllBtn());
  } catch (e) {
    transferHeadNotOk();
  }
}

function clearTransferStopSelectionUI() {
  document.querySelectorAll("#transferStopList .stop-item.selected").forEach(el => el.classList.remove("selected"));
  document.querySelectorAll("#transferStopList .eta-block").forEach(el => { el.innerHTML = ""; });
}

async function selectTransferStop(stopId, seq) {
  transferCurrentStopId = stopId;
  let actualSeq = seq;
  if (!actualSeq) {
    const match = transferRouteStops.find(s => s.stop_id === stopId);
    if (match) actualSeq = match.seq;
  }
  window.transferCurrentSeq = actualSeq;

  clearTransferStopSelectionUI();

  let el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"][data-seq="${actualSeq}"]`);
  if (!el) el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"]`);
  if (!el) return;
  el.classList.add("selected");

  updateTransferSunAdviceUI();

  const etaBlock = el.querySelector(".eta-block");
  etaBlock.textContent = "載入 ETA 中...";

  const company = transferRoute ? transferRoute.company : "KMB";
  const routeName = transferRoute ? transferRoute.route : "";
  const isJointRoute = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName));

  let etaList = [];
  try {
    etaList = await fetchCombinedTransferEtaForStop(stopId, actualSeq);

    etaBlock.innerHTML = "";
    if (!etaList.length) {
      etaBlock.textContent = "暫時冇班次資料";
    } else {
      etaList.forEach(item => {
        const { text, minutes, isScheduled } = formatDetailLine(item);
        const row = document.createElement("div");
        row.className = "eta-row";
        if (minutes <= 0) row.classList.add("eta-imminent");
        else row.style.color = grayColorByMinutes(minutes);

        const contentNode = document.createElement("span");
        const badge = isJointRoute ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
        contentNode.textContent = badge + text;
        if (isScheduled) contentNode.style.fontStyle = "italic";
        row.appendChild(contentNode);
        etaBlock.appendChild(row);
      });
    }
  } catch (e) {
    etaBlock.textContent = "載入 ETA 失敗：" + e.message;
  }

  await loadTransferHeadwayInfo();

  const walkInfoDiv = document.getElementById("transferWalkInfo");
  let summaryText = "";

  if (transferStopId && selectedEtaTime && cumulativeTravelFromOrigin) {
    const originInfo = cumulativeTravelFromOrigin[transferStopId];
    if (originInfo) {
      const travelMin = originInfo.travelMinutes || 0;
      const walkMinRaw = walkingMinutesBetweenStops(transferStopId, stopId);
      const walkMin = walkMinRaw == null ? 0 : walkMinRaw;

      const arriveAtC = trackedTransferArriveTime
        ? new Date(trackedTransferArriveTime.getTime() + walkMin * 60000)
        : new Date(selectedEtaTime.getTime() + (travelMin + walkMin) * 60000);

      let bestBus = null, bestWaitMin = Infinity;
      etaList.forEach(item => {
        if (!item.eta) return;
        const etaTime = new Date(item.eta);
        const diffMin = (etaTime - arriveAtC) / 60000;
        if (diffMin >= 0 && diffMin < bestWaitMin) {
          bestWaitMin = diffMin;
          bestBus = { etaTime, raw: item };
          window.transferBestBus = bestBus;
        }
      });

      const walkText = walkMin < 1 ? "<1分鐘" : walkMin > 60 ? ">1小時" : `${Math.round(walkMin)}分鐘`;
      const rows = el.querySelectorAll(".eta-row");
      rows.forEach(row => row.classList.remove("transfer-tracked"));

      if (!bestBus || !isFinite(bestWaitMin)) {
        summaryText = `🚶 步行：約 ${walkText} ｜ ⚠️ 未有可接駁班次（約 ${formatTimeHHMM(arriveAtC)} 到達轉車站）`;
      } else {
        const waitText = bestWaitMin < 1 ? "<1分鐘" : bestWaitMin > 60 ? ">1小時" : `${Math.round(bestWaitMin)}分鐘`;
        summaryText = `🚶 步行：約 ${walkText} ｜ ⏱️ 轉車等候：約 ${waitText}`;
        const hhmm = formatTimeHHMM(bestBus.etaTime);
        rows.forEach(row => {
          const span = row.querySelector("span");
          if (span && (span.textContent || "").includes(hhmm)) row.classList.add("transfer-tracked");
        });
      }
    }
  }

  if (walkInfoDiv) {
    walkInfoDiv.style.fontWeight = "600";
    walkInfoDiv.textContent = summaryText || "";
  }

  const allItems = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
  let selectedIndex = allItems.findIndex(node => node.dataset.stopId === stopId && node.dataset.seq == actualSeq);
  if (selectedIndex === -1) selectedIndex = allItems.findIndex(node => node.dataset.stopId === stopId);

  allItems.forEach((node, index) => {
    node.style.display = index < selectedIndex ? "none" : "";
  });

  selectSecondRoute(stopId);
  setTimeout(() => alignTabletTransferStops(true), 80);
  saveAppState();
}

function renderTransferStopList() {
  const container = document.getElementById("transferStopList");
  if (!container) return;
  container.innerHTML = "";
  transferRouteStops.forEach((s) => {
    const div = document.createElement("div");
    div.className = "stop-item";
    div.dataset.stopId = s.stop_id;
    div.dataset.seq = s.seq;

    const header = document.createElement("div");
    header.className = "stop-header";

    const left = document.createElement("div");
    left.className = "stop-title";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = `${s.seq}. ${s.name_tc}`;
    left.appendChild(titleSpan);

    const summaryWrapper = document.createElement("span");
    summaryWrapper.className = "summary-wrapper";
    const summarySpan = document.createElement("span");
    summarySpan.className = "stop-eta-summary";
    summaryWrapper.appendChild(summarySpan);

    header.appendChild(left);
    header.appendChild(summaryWrapper);

    const etaBlock = document.createElement("div");
    etaBlock.className = "eta-block";
    div.appendChild(header);
    div.appendChild(etaBlock);

    div.onclick = async () => {
      if (!transferCurrentStopId) await selectTransferStop(s.stop_id, s.seq);
      else if (s.stop_id !== transferCurrentStopId || s.seq != window.transferCurrentSeq) await checkTransferStopEta(s.stop_id, s.seq);
    };

    container.appendChild(div);
  });
}

async function checkTransferStopEta(stopId, seq) {
  let actualSeq = seq;
  if (!actualSeq) {
    const match = transferRouteStops.find(s => s.stop_id === stopId);
    if (match) actualSeq = match.seq;
  }

  document.querySelectorAll("#transferStopList .stop-item").forEach(item => {
    const isTransferStation = (item.dataset.stopId === transferCurrentStopId && item.dataset.seq == window.transferCurrentSeq);
    const isCurrentStation = (item.dataset.stopId === stopId && item.dataset.seq == actualSeq);
    if (!isTransferStation && !isCurrentStation) {
      item.classList.remove("eta-showing");
      const block = item.querySelector(".eta-block");
      if (block) block.innerHTML = "";
      const sSpan = item.querySelector(".stop-eta-summary");
      if (sSpan) sSpan.textContent = "";
    }
  });

  let el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"][data-seq="${actualSeq}"]`);
  if (!el) el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"]`);
  if (!el) return;

  const etaBlock = el.querySelector(".eta-block");
  const summarySpan = el.querySelector(".stop-eta-summary");

  if (el.classList.contains("eta-showing")) {
    el.classList.remove("eta-showing");
    etaBlock.innerHTML = "";
    if (summarySpan) summarySpan.textContent = "";
    return;
  }

  el.classList.add("eta-showing");
  etaBlock.textContent = "載入 ETA 中...";
  if (summarySpan) {
    summarySpan.textContent = "計算中...";
    summarySpan.style.color = "#999999";
  }

  const company = transferRoute ? transferRoute.company : "KMB";
  const routeName = transferRoute ? transferRoute.route : "";
  const isJointRoute = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName));

  try {
    const list = await fetchCombinedTransferEtaForStop(stopId, actualSeq);
    etaBlock.innerHTML = "";
    if (!list.length) etaBlock.textContent = "暫時冇班次資料";

    const actualEtas = [];
    const rowElementsMap = new Map();

    list.forEach((item, idx) => {
      const d = formatDetailLine(item);
      if (!d.etaTime) return;
      actualEtas.push({ index: idx, time: d.etaTime, status: d.status, isScheduled: d.isScheduled });

      const row = document.createElement("div");
      row.className = "eta-row";
      if (d.minutes <= 0) row.classList.add("eta-imminent");
      else row.style.color = grayColorByMinutes(d.minutes);

      const contentNode = document.createElement("span");
      const badge = isJointRoute ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
      contentNode.textContent = badge + d.text;
      if (d.isScheduled) contentNode.style.fontStyle = "italic";

      row.appendChild(contentNode);
      etaBlock.appendChild(row);
      rowElementsMap.set(d.etaTime.getTime(), row);
    });

    let isTracked = false, estimatedTravelMin = 0, estimatedArriveTime = null;
    if (window.transferBestBus && window.transferBestBus.etaTime instanceof Date && transferCurrentStopId) {
      const tStop = transferRouteStops.find(s => s.stop_id === transferCurrentStopId && s.seq == window.transferCurrentSeq)
                 || transferRouteStops.find(s => s.stop_id === transferCurrentStopId);
      const cStop = transferRouteStops.find(s => s.stop_id === stopId && s.seq == actualSeq)
                 || transferRouteStops.find(s => s.stop_id === stopId);
      if (tStop && cStop) {
        const seqDiff = parseInt(cStop.seq) - parseInt(tStop.seq);
        if (seqDiff > 0) estimatedTravelMin = seqDiff * 2;
      }
      estimatedArriveTime = new Date(window.transferBestBus.etaTime.getTime() + estimatedTravelMin * 60000);
    }

    if (estimatedArriveTime && actualEtas.length > 0) {
      let targetStatus = "not_departed";
      if (window.transferBestBus) {
        const detail = formatDetailLine(window.transferBestBus.raw);
        if (detail && detail.status) targetStatus = detail.status;
      }
      const trackResult = findClosestMatchingBus(estimatedArriveTime, targetStatus, actualEtas);
      if (trackResult && trackResult.type === "ok") {
        const targetRow = rowElementsMap.get(trackResult.bus.time.getTime());
        if (targetRow) targetRow.classList.add("transfer-tracked");
        if (summarySpan) {
          summarySpan.textContent = `搭緊: 預計 ${formatTimeHHMM(trackResult.bus.time)} 到達`;
          summarySpan.style.color = "#007bff";
          summarySpan.style.fontWeight = "bold";
        }
        isTracked = true;
      }
    }

    if (!isTracked && summarySpan) {
      if (estimatedArriveTime !== null) {
        summarySpan.textContent = `無法追蹤: 預計行駛 ${estimatedTravelMin} 分鐘 (${formatTimeHHMM(estimatedArriveTime)} 到達)`;
        summarySpan.style.fontWeight = "normal";
        summarySpan.style.color = "#555555";
      } else {
        summarySpan.textContent = "";
      }
    }
  } catch (e) {
    etaBlock.textContent = "載入 ETA 失敗：" + e.message;
  }
}

/* ========== 實際道路導航路線 (OSRM) 與地圖繪製（無直線墊底） ========== */

async function drawUserWalkRouteToStop(stopId) {
  const walkBox = document.getElementById("userWalkInfo");
  if (userToStopRouteLayer && map && map.hasLayer(userToStopRouteLayer)) {
    map.removeLayer(userToStopRouteLayer);
    userToStopRouteLayer = null;
  }
  if (!stopId || userLat == null || userLon == null) {
    currentWalkDistMeters = null;
    currentWalkMinutes = null;
    if (walkBox) walkBox.textContent = "";
    return;
  }

  const stopInfo = allStopsMap.get(stopId);
  const stopObj = routeStops.find(s => s.stop_id === stopId);
  if (!stopInfo) return;

  const sLat = parseFloat(stopInfo.lat), sLon = parseFloat(stopInfo.long);
  if (!isFinite(sLat) || !isFinite(sLon)) return;

  const straightDist = haversineDistanceMeters(userLat, userLon, sLat, sLon);
  const stopName = stopObj ? stripBracketCode(stopObj.name_tc) : stripBracketCode(stopInfo.name_tc || "車站");

  currentWalkDistMeters = Math.round(straightDist * 1.2);
  currentWalkMinutes = Math.max(1, Math.round(currentWalkDistMeters / (5000 / 60)));

  if (walkBox) walkBox.textContent = `🚶 由你位置行去「${stopName}」：計算實際步程中...`;

  if (straightDist < 15000) {
    try {
      const coordsStr = `${userLon.toFixed(6)},${userLat.toFixed(6)};${sLon.toFixed(6)},${sLat.toFixed(6)}`;
      const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes[0]) {
          const r = data.routes[0];
          const coords = r.geometry.coordinates.map(c => [c[1], c[0]]);
          userToStopRouteLayer = L.polyline(coords, {
            color: "#9333ea", weight: 5, dashArray: "6, 8", opacity: 0.9
          }).addTo(map);

          currentWalkDistMeters = Math.round(r.distance || straightDist);
          currentWalkMinutes = Math.max(1, Math.round(currentWalkDistMeters / (5000 / 60)));
          if (walkBox) {
            walkBox.textContent = `🚶 由你位置行去「${stopName}」：約 ${currentWalkMinutes} 分鐘（實際步程 ${currentWalkDistMeters} 米）`;
          }
          return;
        }
      }
    } catch (e) {}
  }

  if (walkBox) {
    walkBox.textContent = `🚶 由你位置行去「${stopName}」：約 ${currentWalkMinutes} 分鐘（約 ${currentWalkDistMeters} 米）`;
  }
}

async function fetchActualRoadGeometry(latlngs, profile = "driving") {
  if (!latlngs || latlngs.length < 2) return [];
  const cacheKey = `${profile}_${latlngs.map(p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(";")}`;
  if (osrmGeometryCache.has(cacheKey)) return osrmGeometryCache.get(cacheKey);

  const CHUNK_SIZE = 24;
  const fullPath = [];
  try {
    for (let i = 0; i < latlngs.length - 1; i += CHUNK_SIZE - 1) {
      const chunk = latlngs.slice(i, i + CHUNK_SIZE);
      if (chunk.length < 2) break;
      const coordsStr = chunk.map(pt => `${pt[1].toFixed(6)},${pt[0].toFixed(6)}`).join(";");
      const baseUrl = profile === "foot"
        ? `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`
        : `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
      const res = await fetch(baseUrl);
      if (!res.ok) throw new Error("OSRM HTTP " + res.status);
      const data = await res.json();
      if (data && data.routes && data.routes[0] && data.routes[0].geometry) {
        const segCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        if (fullPath.length > 0) segCoords.shift();
        fullPath.push(...segCoords);
      }
    }
    if (fullPath.length >= 2) {
      osrmGeometryCache.set(cacheKey, fullPath);
      return fullPath;
    }
  } catch (e) {}
  return [];
}

async function showRouteStopsOnMap(stops) {
  const token = ++mainRouteRenderToken;
  if (window.mainRouteLine && map.hasLayer(window.mainRouteLine)) {
    map.removeLayer(window.mainRouteLine);
    window.mainRouteLine = null;
  }
  if (window.allStopMarkers) {
    window.allStopMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
  }
  window.allStopMarkers = [];

  updateMainSunAdviceUI();

  const latlngs = [];
  stops.forEach(s => {
    const info = allStopsMap.get(s.stop_id);
    if (!info) return;
    const lat = parseFloat(info.lat), lon = parseFloat(info.long);
    if (!isFinite(lat) || !isFinite(lon)) return;

    const icon = L.divIcon({
      className: "stop-label",
      html: `<div>${s.seq}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([lat, lon], { icon }).addTo(map);
    marker.stopId = s.stop_id;
    marker.seq = parseInt(s.seq);
    marker.bindPopup(`<b>${s.seq}. ${info.name_tc || s.stop_id}</b>`);

    marker.on("click", () => {
      if (currentSheetState === "collapsed") setBottomSheetState("half");
      switchMobileLegTab(1);
      if (mode !== "interchange_pair") onStopClicked(s.stop_id, s.seq);
      else loadEtaDetailForStop(s.stop_id, s.seq);
      setTimeout(() => {
        const targetEl = document.querySelector(`#stopList .stop-item[data-stop-id="${s.stop_id}"][data-seq="${s.seq}"]`);
        if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 220);
    });

    window.allStopMarkers.push(marker);
    latlngs.push([lat, lon]);
  });

  if (latlngs.length > 0) {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
  }

  if (latlngs.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(latlngs, "driving");
    if (token === mainRouteRenderToken && roadCoords.length >= 2) {
      if (window.mainRouteLine && map.hasLayer(window.mainRouteLine)) map.removeLayer(window.mainRouteLine);
      window.mainRouteLine = L.polyline(roadCoords, {
        color: "#1565c0", weight: 5, opacity: 0.85, lineJoin: "round"
      }).addTo(map);
    }
  }
}

async function updateFirstRouteFocus(targetStopId) {
  if (!routeStops || routeStops.length === 0) return;
  const token = ++mainRouteRenderToken;
  const stopIndex = routeStops.findIndex(s => s.stop_id === targetStopId);
  if (stopIndex === -1) return;
  const targetSeq = parseInt(routeStops[stopIndex].seq);

  if (window.allStopMarkers) {
    window.allStopMarkers.forEach(m => {
      if (m.seq > targetSeq) { if (map.hasLayer(m)) map.removeLayer(m); }
      else { if (!map.hasLayer(m)) map.addLayer(m); }
    });
  }

  if (window.mainRouteLine && map.hasLayer(window.mainRouteLine)) {
    map.removeLayer(window.mainRouteLine);
    window.mainRouteLine = null;
  }

  const partialLatLngs = routeStops.slice(0, stopIndex + 1).map(s => {
    const info = allStopsMap.get(s.stop_id);
    if (!info) return null;
    const lat = parseFloat(info.lat), lon = parseFloat(info.long);
    return (isFinite(lat) && isFinite(lon)) ? [lat, lon] : null;
  }).filter(Boolean);

  if (partialLatLngs.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(partialLatLngs, "driving");
    if (token === mainRouteRenderToken && roadCoords.length >= 2) {
      window.mainRouteLine = L.polyline(roadCoords, {
        color: "#1565c0", weight: 5, opacity: 0.85, lineJoin: "round"
      }).addTo(map);
    }
  }
}

async function resetFirstRouteFull() {
  if (!routeStops || routeStops.length === 0) return;
  const token = ++mainRouteRenderToken;

  if (window.allStopMarkers) {
    window.allStopMarkers.forEach(m => { if (!map.hasLayer(m)) map.addLayer(m); });
  }

  if (window.mainRouteLine && map.hasLayer(window.mainRouteLine)) {
    map.removeLayer(window.mainRouteLine);
    window.mainRouteLine = null;
  }

  const fullLatLngs = routeStops.map(s => {
    const info = allStopsMap.get(s.stop_id);
    if (!info) return null;
    const lat = parseFloat(info.lat), lon = parseFloat(info.long);
    return (isFinite(lat) && isFinite(lon)) ? [lat, lon] : null;
  }).filter(Boolean);

  if (fullLatLngs.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(fullLatLngs, "driving");
    if (token === mainRouteRenderToken && roadCoords.length >= 2) {
      window.mainRouteLine = L.polyline(roadCoords, {
        color: "#1565c0", weight: 5, opacity: 0.85, lineJoin: "round"
      }).addTo(map);
    }
  }
}

async function selectSecondRoute(targetStopId) {
  if (!map || !transferRouteStops || !transferRouteStops.length) return;
  clearSecondRouteVisual();
  const token = ++secondRouteRenderToken;
  updateFirstRouteFocus(transferStopId);
  updateTransferSunAdviceUI();

  const latlngsForSecond = [];
  let foundTransferPoint = false;

  transferRouteStops.forEach(rs => {
    if (rs.stop_id === targetStopId) foundTransferPoint = true;
    if (foundTransferPoint) {
      const info = allStopsMap.get(rs.stop_id);
      if (!info) return;
      const lat = parseFloat(info.lat), lon = parseFloat(info.long);
      if (!isFinite(lat) || !isFinite(lon)) return;

      const icon = L.divIcon({
        className: "stop-label second-route",
        html: `<div>${rs.seq}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([lat, lon], { icon }).addTo(map);
      marker.stopId = rs.stop_id;
      marker.seq = rs.seq;
      marker.bindPopup(`<b>${rs.seq}. ${rs.name_tc || rs.stop_id}</b>`);

      marker.on("click", async () => {
        if (currentSheetState === "collapsed") setBottomSheetState("half");
        switchMobileLegTab(2);
        if (!transferCurrentStopId) await selectTransferStop(rs.stop_id, rs.seq);
        else if (rs.stop_id !== transferCurrentStopId || rs.seq != window.transferCurrentSeq) await checkTransferStopEta(rs.stop_id, rs.seq);
        setTimeout(() => {
          const targetEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${rs.stop_id}"][data-seq="${rs.seq}"]`);
          if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 220);
      });

      secondRouteMarkers.push(marker);
      latlngsForSecond.push([lat, lon]);
    }
  });

  const firstMarker = window.allStopMarkers.find(m => m.stopId === transferStopId);
  const secondMarker = secondRouteMarkers.find(m => m.stopId === targetStopId);
  if (firstMarker && secondMarker) {
    const walkStart = [firstMarker.getLatLng().lat, firstMarker.getLatLng().lng];
    const walkEnd = [secondMarker.getLatLng().lat, secondMarker.getLatLng().lng];
    fetchActualRoadGeometry([walkStart, walkEnd], "foot").then(footCoords => {
      if (token === secondRouteRenderToken && footCoords.length >= 2) {
        if (transferLine && map.hasLayer(transferLine)) map.removeLayer(transferLine);
        transferLine = L.polyline(footCoords, { color: "#2e7d32", weight: 5, dashArray: "6, 8" }).addTo(map);
      }
    });
  }

  if (latlngsForSecond.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(latlngsForSecond, "driving");
    if (token === secondRouteRenderToken && roadCoords.length >= 2) {
      const redLine = L.polyline(roadCoords, { color: "#e53935", weight: 5, opacity: 0.9, lineJoin: "round" }).addTo(map);
      secondRouteMarkers.push(redLine);
    }
  }
}

async function showFullSecondRoute() {
  const token = ++secondRouteRenderToken;
  resetFirstRouteFull();
  if (transferLine && map.hasLayer(transferLine)) {
    map.removeLayer(transferLine);
    transferLine = null;
  }
  secondRouteMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
  secondRouteMarkers = [];

  const latlngsForFullRed = [];
  transferRouteStops.forEach(rs => {
    const info = allStopsMap.get(rs.stop_id);
    if (!info) return;
    const lat = parseFloat(info.lat), lon = parseFloat(info.long);
    if (!isFinite(lat) || !isFinite(lon)) return;

    const icon = L.divIcon({
      className: "stop-label second-route",
      html: `<div>${rs.seq}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    const marker = L.marker([lat, lon], { icon }).addTo(map);
    marker.bindPopup(`<b>${rs.seq}. ${rs.name_tc || rs.stop_id}</b>`);
    secondRouteMarkers.push(marker);
    latlngsForFullRed.push([lat, lon]);
  });

  if (latlngsForFullRed.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(latlngsForFullRed, "driving");
    if (token === secondRouteRenderToken && roadCoords.length >= 2) {
      const redLine = L.polyline(roadCoords, { color: "#e53935", weight: 5, opacity: 0.9, lineJoin: "round" }).addTo(map);
      secondRouteMarkers.push(redLine);
    }
  }
}

function clearSecondRouteVisual() {
  secondRouteRenderToken++;
  secondRouteMarkers.forEach(m => { if (map && map.hasLayer(m)) map.removeLayer(m); });
  secondRouteMarkers = [];
  if (transferLine && map && map.hasLayer(transferLine)) map.removeLayer(transferLine);
  transferLine = null;
  secondTransferStopId = null;
  resetFirstRouteFull();
}

function toggleMapFullscreen() {
  const mapDiv = document.getElementById("map");
  if (!mapDiv) return;
  const isFullscreen = document.fullscreenElement === mapDiv || document.webkitFullscreenElement === mapDiv;
  if (!isFullscreen) {
    if (mapDiv.requestFullscreen) mapDiv.requestFullscreen();
    else if (mapDiv.webkitRequestFullscreen) mapDiv.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

/* ========== 抽屜四段控制 + 平板轉車站水平對齊 + 手機左右掃 ========== */

function getActiveTargetStopElement() {
  if (transferCurrentStopId) {
    let el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${transferCurrentStopId}"][data-seq="${window.transferCurrentSeq}"]`);
    if (!el) el = document.querySelector(`#transferStopList .stop-item.selected`);
    if (el) return { el, panel: document.getElementById("transfer-search-section"), leg: 2 };
  }
  if (mode === "interchange_pair" && transferStopId) {
    let el = document.querySelector(`#stopList .stop-item[data-stop-id="${transferStopId}"][data-seq="${transferSeq}"]`);
    if (!el) el = document.querySelector(`#stopList .stop-item[data-stop-id="${transferStopId}"]`);
    if (el) return { el, panel: document.getElementById("primary-panel"), leg: 1 };
  }
  if (currentStopId || originStopId) {
    const sid = currentStopId || originStopId;
    let el = document.querySelector(`#stopList .stop-item.selected`);
    if (!el) el = document.querySelector(`#stopList .stop-item[data-stop-id="${sid}"]`);
    if (el) return { el, panel: document.getElementById("primary-panel"), leg: 1 };
  }
  return null;
}

function alignTabletTransferStops(scrollIntoHalfView = false) {
  const stopListEl = document.getElementById("stopList");
  const transferStopBlock = document.getElementById("transfer-stop-block");
  if (!stopListEl || !transferStopBlock) return;

  stopListEl.style.marginTop = "6px";
  transferStopBlock.style.marginTop = "6px";

  if (window.innerWidth < 768 || mode !== "interchange_pair" || !transferStopId || !transferCurrentStopId) return;

  const primaryPanel = document.getElementById("primary-panel");
  const transferPanel = document.getElementById("transfer-search-section");
  if (!primaryPanel || !transferPanel) return;

  let leftTransferEl = document.querySelector(`#stopList .stop-item[data-stop-id="${transferStopId}"][data-seq="${transferSeq}"]`)
                    || document.querySelector(`#stopList .stop-item[data-stop-id="${transferStopId}"]`);
  let rightTransferEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${transferCurrentStopId}"][data-seq="${window.transferCurrentSeq}"]`)
                     || document.querySelector(`#transferStopList .stop-item.selected`);
  if (!leftTransferEl || !rightTransferEl) return;

  const leftOffset = (leftTransferEl.getBoundingClientRect().top - primaryPanel.getBoundingClientRect().top) + primaryPanel.scrollTop;
  const rightOffset = (rightTransferEl.getBoundingClientRect().top - transferPanel.getBoundingClientRect().top) + transferPanel.scrollTop;
  const diff = leftOffset - rightOffset;

  if (diff > 4) transferStopBlock.style.marginTop = `${6 + Math.round(diff)}px`;
  else if (diff < -4) stopListEl.style.marginTop = `${6 + Math.round(-diff)}px`;

  if (scrollIntoHalfView || currentSheetState === "half" || currentSheetState === "peek") {
    const targetScroll = Math.max(0, Math.max(leftOffset, rightOffset) - 70);
    primaryPanel.scrollTo({ top: targetScroll, behavior: "smooth" });
    transferPanel.scrollTo({ top: targetScroll, behavior: "smooth" });
  }
}

function setBottomSheetState(state) {
  const sheet = document.getElementById("bottom-sheet");
  const header = document.getElementById("sheet-header");
  const tabs = document.getElementById("mobile-leg-tabs");
  const btn = document.getElementById("btnSheetToggle");
  const hint = document.getElementById("sheetStatusHint");
  if (!sheet) return;

  currentSheetState = state;
  sheet.classList.remove("sheet-collapsed", "sheet-peek", "sheet-half", "sheet-full");
  sheet.classList.add(`sheet-${state}`);

  if (state === "peek") {
    const target = getActiveTargetStopElement();
    const isInterchangePair = (mode === "interchange_pair" && originStopId && transferStopId);

    if (target && target.el && target.panel) {
      setTimeout(() => {
        const headerH = header ? header.offsetHeight : 64;
        const tabsH = (tabs && window.getComputedStyle(tabs).display !== "none") ? tabs.offsetHeight : 0;

        if (isInterchangePair) {
          const primaryPanel = document.getElementById("primary-panel");
          const stopListEl = document.getElementById("stopList");
          const transferPanel = document.getElementById("transfer-search-section");

          const firstVisibleStop = stopListEl ? stopListEl.querySelector('.stop-item:not([style*="display: none"])') : null;
          if (primaryPanel && firstVisibleStop) {
            primaryPanel.scrollTop += (firstVisibleStop.getBoundingClientRect().top - primaryPanel.getBoundingClientRect().top) - 6;
          }

          const walkEl = document.getElementById("transferWalkInfo");
          const secondAnchor = (walkEl && walkEl.textContent) ? walkEl : target.el;
          if (transferPanel && secondAnchor) {
            transferPanel.scrollTop += (secondAnchor.getBoundingClientRect().top - transferPanel.getBoundingClientRect().top) - 6;
          }

          const leg1StopsH = stopListEl ? stopListEl.offsetHeight + 24 : 320;
          const leg2StopH = target.el.offsetHeight + (walkEl ? walkEl.offsetHeight + 24 : 24);
          const neededContentH = Math.min(window.innerHeight * 0.58, Math.max(leg1StopsH, leg2StopH, 320));
          sheet.style.setProperty("--peek-offset", `calc(100% - ${headerH + tabsH + neededContentH}px)`);
        } else {
          target.panel.scrollTop += (target.el.getBoundingClientRect().top - target.panel.getBoundingClientRect().top) - 6;
          const stopH = Math.min(260, Math.max(130, target.el.offsetHeight + 18));
          sheet.style.setProperty("--peek-offset", `calc(100% - ${headerH + tabsH + stopH}px)`);
        }
      }, 40);
    } else {
      currentSheetState = "collapsed";
      sheet.classList.remove("sheet-peek");
      sheet.classList.add("sheet-collapsed");
    }
  }

  if (btn) {
    if (currentSheetState === "collapsed") btn.textContent = "展開 ▲";
    else if (currentSheetState === "peek") btn.textContent = "半開 ▲";
    else if (currentSheetState === "half") btn.textContent = "全開 ▲";
    else btn.textContent = "收起 ▼";
  }

  if (hint) {
    hint.textContent = currentRoute
      ? (transferRoute ? `${currentRoute.route} ➔ ${transferRoute.route}` : `路線 ${currentRoute.route}`)
      : (currentSheetState === "collapsed" ? "向上拉輸入路線" : "請輸入路線");
  }

  if (window.innerWidth >= 768 && mode === "interchange_pair") {
    setTimeout(() => alignTabletTransferStops(state === "half" || state === "peek"), 100);
  }
}

function switchMobileLegTab(legNum) {
  const sheet = document.getElementById("bottom-sheet");
  const tab1 = document.getElementById("tabLeg1");
  const tab2 = document.getElementById("tabLeg2");
  if (!sheet || !tab1 || !tab2) return;

  if (legNum === 2) {
    sheet.classList.remove("mobile-show-leg1");
    sheet.classList.add("mobile-show-leg2");
    tab1.classList.remove("active-leg1");
    tab2.classList.add("active-leg2");
  } else {
    sheet.classList.remove("mobile-show-leg2");
    sheet.classList.add("mobile-show-leg1");
    tab2.classList.remove("active-leg2");
    tab1.classList.add("active-leg1");
  }
}

function initBottomSheetAndGestures() {
  const sheet = document.getElementById("bottom-sheet");
  const header = document.getElementById("sheet-header");
  const sheetBody = document.getElementById("sheet-body");
  const btnToggle = document.getElementById("btnSheetToggle");
  const tab1 = document.getElementById("tabLeg1");
  const tab2 = document.getElementById("tabLeg2");

  if (tab1) tab1.onclick = () => switchMobileLegTab(1);
  if (tab2) tab2.onclick = () => switchMobileLegTab(2);

  const hasSelectedStop = () => Boolean(getActiveTargetStopElement());

  const stepDownSheet = () => {
    if (currentSheetState === "full") setBottomSheetState(hasSelectedStop() ? "peek" : "half");
    else if (currentSheetState === "half") setBottomSheetState(hasSelectedStop() ? "peek" : "collapsed");
    else setBottomSheetState("collapsed");
  };

  const stepUpSheet = () => {
    if (currentSheetState === "collapsed" || currentSheetState === "peek") setBottomSheetState("half");
    else setBottomSheetState("full");
  };

  if (btnToggle) {
    btnToggle.onclick = (e) => {
      e.stopPropagation();
      if (currentSheetState === "full") stepDownSheet();
      else stepUpSheet();
    };
  }

  if (sheet && header) {
    let startY = 0, deltaY = 0, isDragging = false;
    const onStart = y => { startY = y; deltaY = 0; isDragging = true; sheet.classList.add("dragging"); };
    const onMove = y => { if (isDragging) deltaY = y - startY; };
    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      sheet.classList.remove("dragging");
      if (deltaY < -30) stepUpSheet();
      else if (deltaY > 30) stepDownSheet();
      else if (currentSheetState === "collapsed") setBottomSheetState("half");
    };

    header.addEventListener("touchstart", e => onStart(e.touches[0].clientY), { passive: true });
    header.addEventListener("touchmove", e => onMove(e.touches[0].clientY), { passive: true });
    header.addEventListener("touchend", onEnd);
    header.addEventListener("mousedown", e => onStart(e.clientY));
    window.addEventListener("mousemove", e => onMove(e.clientY));
    window.addEventListener("mouseup", onEnd);
  }

  if (sheet && sheetBody) {
    let touchStartX = 0, touchStartY = 0;
    sheetBody.addEventListener("touchstart", e => {
      if (!e.touches || !e.touches.length) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    sheetBody.addEventListener("touchend", e => {
      if (window.innerWidth >= 768 || !sheet.classList.contains("has-transfer")) return;
      if (!e.changedTouches || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) switchMobileLegTab(2);
        else switchMobileLegTab(1);
      }
    }, { passive: true });
  }

  const tSec = document.getElementById("transfer-search-section");
  if (tSec && sheet) {
    const observer = new MutationObserver(() => {
      const isTransferVisible = tSec.style.display !== "none";
      if (isTransferVisible) {
        sheet.classList.add("has-transfer");
        switchMobileLegTab(2);
      } else {
        sheet.classList.remove("has-transfer", "mobile-show-leg2");
        sheet.classList.add("mobile-show-leg1");
      }
    });
    observer.observe(tSec, { attributes: true, attributeFilter: ["style"] });
  }
}

window.addEventListener("resize", () => {
  if (window.innerWidth >= 768 && mode === "interchange_pair") alignTabletTransferStops(false);
});

/* ========== URL 預填與啟動 ========== */

function checkUrlForRoute() {
  const urlParams = new URLSearchParams(window.location.search);
  const routeParam = urlParams.get("route");
  const dirParam = urlParams.get("dir");
  const staParam = urlParams.get("sta");
  if (!routeParam) return;

  const targetRoute = routeParam.toUpperCase();
  const foundRouteObj = uniqueRoutes.find(r => (typeof r === "string" ? r : r.route) === targetRoute);
  if (!foundRouteObj) return;

  setBottomSheetState("half");
  selectRoute(foundRouteObj);

  let dirWaitCount = 0;
  const waitForDirection = setInterval(() => {
    dirWaitCount++;
    if (dirWaitCount > 50) { clearInterval(waitForDirection); return; }
    const btnIn = document.getElementById("dirInbound");
    const btnOut = document.getElementById("dirOutbound");
    if (btnIn && btnOut && (!btnIn.disabled || !btnOut.disabled)) {
      clearInterval(waitForDirection);
      if (dirParam !== null) {
        const targetBtn = dirParam === "0" ? btnIn : btnOut;
        if (targetBtn && !targetBtn.disabled) {
          targetBtn.click();
          if (staParam) {
            let stopWait = 0;
            const wf = setInterval(() => {
              stopWait++;
              if (stopWait > 80) { clearInterval(wf); return; }
              const stopListDiv = document.getElementById("stopList");
              if (stopListDiv && stopListDiv.innerText.includes(staParam)) {
                clearInterval(wf);
                for (const div of stopListDiv.querySelectorAll(".stop-item")) {
                  if (div.innerText.includes(staParam) && div.onclick) { div.click(); break; }
                }
              }
            }, 100);
          }
        }
      }
    }
  }, 100);
}

// 單一乾淨啟動入口
initMap();
initBottomSheetAndGestures();
init();

window.onload = async function () {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    if (Date.now() - state.timestamp < EXPIRY_TIME && state.firstRoute) {
      await selectRoute(state.firstRoute);
      if (state.firstDirection && state.firstDirectionCode) {
        currentDirection = state.firstDirection;
        currentDirectionCode = state.firstDirectionCode;
        await loadRouteStopsForCurrentDirection();
        if (state.firststopID && state.firstseq) {
          await onStopClicked(state.firststopID, state.firstseq);
          if (state.transferStopId) {
            await onInterchangeButtonClick(state.transferStopId, state.transferSeq);
            if (state.transferRoute) {
              await selectTransferRoute(state.transferRoute);
              if (state.transferDirection && state.transferDirectionCode) {
                transferDirection = state.transferDirection;
                transferDirectionCode = state.transferDirectionCode;
                await loadTransferRouteStopsForCurrentDirection();
              }
            }
          }
        }
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
  }
};


/* =========================================================================
   ★ 升級：預設展開抽屜 + 紅/黃/紅黃各半/綠 兩行路線列表 + 實時更新通知距離
   ========================================================================= */

// 1. 根據公司組合回傳顏色 Class 同顯示名稱（唔用冒號）
function getRouteCompanyMeta(cosArray) {
  if (cosArray.length === 1) {
    const c = cosArray[0];
    if (c === "KMB") return { css: "co-kmb", label: "九巴" };
    if (c === "CTB") return { css: "co-ctb", label: "城巴" };
    if (isGmbCompany(c)) return { css: "co-gmb", label: getGmbRegionName(c) };
    return { css: "co-kmb", label: c };
  }
  return { css: "co-joint", label: "九巴 / 城巴" };
}

// 建立「左邊顏色 Tag + 第一行(路線+種類) + 第二行(總站)」DOM 元素
function createTwoLineRouteItemDOM(routeCode, cosArray, origText, destText) {
  const div = document.createElement("div");
  div.className = "route-item";

  const meta = getRouteCompanyMeta(cosArray);

  const colorBar = document.createElement("div");
  colorBar.className = `route-color-bar ${meta.css}`;

  const content = document.createElement("div");
  content.className = "route-item-content";

  const topRow = document.createElement("div");
  topRow.className = "route-row-top";

  const codeSpan = document.createElement("span");
  codeSpan.className = "route-code-text";
  codeSpan.textContent = routeCode;

  const tagSpan = document.createElement("span");
  tagSpan.className = `route-co-tag ${meta.css}`;
  tagSpan.textContent = meta.label;

  topRow.appendChild(codeSpan);
  topRow.appendChild(tagSpan);

  const bottomRow = document.createElement("div");
  bottomRow.className = "route-row-bottom";
  bottomRow.textContent = `${origText} ↔ ${destText}`;

  content.appendChild(topRow);
  content.appendChild(bottomRow);

  div.appendChild(colorBar);
  div.appendChild(content);

  return { div, bottomRow };
}

// 2. Step 1 路線搜尋列表（兩行無冒號 + 左邊紅/黃/紅黃/綠 Tag）
function renderRouteList() {
  const container = document.getElementById("routeList");
  if (!container) return;
  container.innerHTML = "";

  if (currentRoute) return;
  if (!currentInput) {
    container.textContent = "請先輸入至少一個字元。";
    return;
  }
  if (candidateRoutes.length === 0) {
    container.textContent = "冇符合路線";
    return;
  }

  const byRoute = new Map();
  candidateRoutes.forEach(r => {
    const code = String(r.route).toUpperCase();
    const isJointBus = !isGmbCompany(r.company) && (/^(N)?[1369]\d{2}[A-Z]?$/.test(code) || ["S1", "R8"].includes(code));
    const key = isJointBus ? `JOINT-${code}` : `${code}-${r.company}`;

    if (!byRoute.has(key)) {
      byRoute.set(key, {
        route: code,
        orig_tc: r.orig_tc,
        dest_tc: r.dest_tc,
        companies: new Set([r.company]),
        samples: [r]
      });
    } else {
      const obj = byRoute.get(key);
      obj.companies.add(r.company);
      obj.samples.push(r);
    }
  });

  const sortedGroups = Array.from(byRoute.values()).sort((a, b) =>
    a.route.localeCompare(b.route, undefined, { numeric: true })
  );

  const topGmbSamples = sortedGroups.slice(0, 15).map(g => g.samples[0]).filter(s => isGmbCompany(s.company));
  prefetchVisibleGmbOrigins(topGmbSamples, () => {
    if (!currentRoute && currentInput) renderRouteList();
  });

  sortedGroups.slice(0, 100).forEach(r => {
    const sample0 = r.samples[0];
    const cos = Array.from(r.companies);
    const { div, bottomRow } = createTwoLineRouteItemDOM(r.route, cos, sample0.orig_tc, sample0.dest_tc);

    div.onclick = async () => {
      const samples = r.samples;
      const chosen = samples.find(x => x.company === "KMB") || samples.find(x => x.company === "CTB") || samples[0];
      if (isGmbCompany(chosen.company)) {
        bottomRow.textContent = "載入小巴總站與站點中...";
        await ensureGmbRouteMeta(chosen);
      }
      selectRoute(chosen);
    };

    container.appendChild(div);
  });
}

// 3. Step 4 轉車路線搜尋列表（同樣用兩行無冒號 + 左邊紅/黃/紅黃/綠 Tag）
function updateAfterTransferInputChange() {
  const display = document.getElementById("transferRouteInputDisplay");
  if (display) display.textContent = transferCurrentInput || "(未輸入)";

  const listDiv = document.getElementById("transferRouteList");
  if (!listDiv) return;
  listDiv.innerHTML = "";

  if (!transferCurrentInput) {
    listDiv.textContent = "請輸入路線，會以同名站作為預設轉車站。";
    transferCandidateRoutes = [];
    renderTransferVirtualKeyboard();
    return;
  }

  const kw = transferCurrentInput.toLowerCase();
  const rawCandidates = uniqueRoutes.filter(r => r.route.toLowerCase().startsWith(kw));

  const byRoute = new Map();
  rawCandidates.forEach(r => {
    const code = String(r.route).toUpperCase();
    const company = r.company || "KMB";
    const isJointBus = !isGmbCompany(company) && (/^(N)?[1369]\d{2}[A-Z]?$/.test(code) || ["S1", "R8"].includes(code));
    const key = isJointBus ? `JOINT-${code}` : `${code}-${company}`;

    if (!byRoute.has(key)) {
      byRoute.set(key, {
        route: code,
        orig_tc: r.orig_tc,
        dest_tc: r.dest_tc,
        companies: new Set([company]),
        sampleObj: r
      });
    } else {
      byRoute.get(key).companies.add(company);
    }
  });

  const groupedRoutes = Array.from(byRoute.values()).sort((a, b) =>
    a.route.localeCompare(b.route, undefined, { numeric: true })
  );
  transferCandidateRoutes = groupedRoutes.map(g => g.sampleObj);

  const topGmbSamples = groupedRoutes.slice(0, 15).map(g => g.sampleObj).filter(s => isGmbCompany(s.company));
  prefetchVisibleGmbOrigins(topGmbSamples, () => {
    if (!transferRoute && transferCurrentInput) updateAfterTransferInputChange();
  });

  if (!groupedRoutes.length) {
    listDiv.textContent = "冇符合路線";
  } else {
    groupedRoutes.slice(0, 100).forEach(group => {
      const sObj = group.sampleObj;
      const cos = Array.from(group.companies);
      const { div, bottomRow } = createTwoLineRouteItemDOM(group.route, cos, sObj.orig_tc, sObj.dest_tc);

      div.onclick = async () => {
        if (isGmbCompany(sObj.company)) {
          bottomRow.textContent = "載入小巴總站與站點中...";
          await ensureGmbRouteMeta(sObj);
        }
        selectTransferRoute(sObj);
      };
      listDiv.appendChild(div);
    });
  }

  renderTransferVirtualKeyboard();
}

// 4. ★ 修復 Notification 距離實時更新（每次強制拉取最新 GPS 座標 + 支援九巴/城巴/小巴站座標）
function getOriginStopLatLng() {
  if (!originStopId) return null;
  const stopObj = routeStops.find(s => s.stop_id === originStopId);
  const info = allStopsMap.get(originStopId);
  const lat = parseFloat((stopObj && stopObj.lat) || (info && info.lat));
  const lon = parseFloat((stopObj && stopObj.long) || (info && info.long));
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return { lat, lon, name: stopObj ? stripBracketCode(stopObj.name_tc) : (info ? stripBracketCode(info.name_tc) : "車站") };
}

async function refreshWalkDistanceForOrigin() {
  const stopCoords = getOriginStopLatLng();
  if (!stopCoords || userLat == null || userLon == null) return;

  const straightDist = haversineDistanceMeters(userLat, userLon, stopCoords.lat, stopCoords.lon);
  currentWalkDistMeters = Math.round(straightDist * 1.2);
  currentWalkMinutes = currentWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(currentWalkDistMeters / (5000 / 60)));

  if (straightDist >= 15 && straightDist < 15000) {
    try {
      const coordsStr = `${userLon.toFixed(6)},${userLat.toFixed(6)};${stopCoords.lon.toFixed(6)},${stopCoords.lat.toFixed(6)}`;
      // 加入 cache: "no-store" 防止瀏覽器回傳舊嘅步行米數
      const res = await fetch(
        `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const routeData = await res.json();
        if (routeData && routeData.routes && routeData.routes[0]) {
          const r = routeData.routes[0];
          currentWalkDistMeters = Math.round(r.distance || straightDist);
          currentWalkMinutes = currentWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(currentWalkDistMeters / (5000 / 60)));

          const coords = r.geometry.coordinates.map(c => [c[1], c[0]]);
          if (userToStopRouteLayer && map && map.hasLayer(userToStopRouteLayer)) {
            userToStopRouteLayer.setLatLngs(coords);
          }
        }
      }
    } catch (e) {}
  }

  const walkBox = document.getElementById("userWalkInfo");
  if (walkBox) {
    walkBox.textContent = `🚶 由你位置行去「${stopCoords.name}」：約 ${currentWalkMinutes} 分鐘（實際步程 ${currentWalkDistMeters} 米）`;
  }
}

async function updatePersistentTrackingNotification() {
  if (!selectedEtaTime || !currentRoute || !originStopId) {
    stopPersistentTrackingNotification();
    return;
  }

  // (A) 強制向手機請求一次最新無快取 GPS 座標，確保行路時距離一定識變！
  if (navigator.geolocation) {
    await new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          userLat = pos.coords.latitude;
          userLon = pos.coords.longitude;
          renderUserLocationSpot();
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    });
  }

  // (B) 重新計算最新實際步行米數同分鐘
  await refreshWalkDistanceForOrigin();

  // (C) 重新向九巴 / 城巴 / 小巴 API 拉取最新班次時間
  try {
    const company = currentRoute.company || "KMB";
    const routeName = currentRoute.route;
    const data = await BusAPI.getEta(company, originStopId, routeName, currentServiceType);
    const list = (data.data || []).filter(item => {
      if (!item.eta) return false;
      const rmk = String(item.rmk_tc || "");
      if (rmk.includes("時段") || rmk.includes("預定班次") || rmk === "離開") return false;
      if (originSeq && parseInt(item.seq) !== parseInt(originSeq)) return false;
      if ((company === "KMB" || isGmbCompany(company)) && currentDirectionCode && item.dir !== currentDirectionCode) return false;
      return true;
    });

    if (list.length > 0) {
      const candidates = list.map((item, idx) => {
        const d = formatDetailLine(item);
        return d.etaTime ? { index: idx, time: d.etaTime, status: d.status } : null;
      }).filter(Boolean);

      const match = findClosestMatchingBus(selectedEtaTime, selectedEtaStatus || "departed", candidates);
      if (match && match.type === "ok" && match.bus && match.bus.time) {
        selectedEtaTime = match.bus.time;
      }
    }
  } catch (e) {}

  const diffMin = Math.round((selectedEtaTime - new Date()) / 60000);
  if (diffMin < 0) {
    stopPersistentTrackingNotification();
    return;
  }

  const dirTerm = currentDirection === "inbound"
    ? (inboundTerminalName !== "?" ? inboundTerminalName : stripBracketCode(currentRoute.dest_tc))
    : (outboundTerminalName !== "?" ? outboundTerminalName : stripBracketCode(currentRoute.orig_tc));

  const stopCoords = getOriginStopLatLng();
  const stopName = stopCoords ? stopCoords.name : "";
  const hhmmStr = formatTimeHHMM(selectedEtaTime);

  const titleText = `${currentRoute.route} (往${dirTerm})`;
  const etaLine = diffMin <= 0 ? `即將到達 (${hhmmStr})` : `${diffMin} 分鐘 (${hhmmStr})`;
  const bodyLines = [stopName, etaLine];

  if (currentWalkDistMeters != null && currentWalkMinutes != null) {
    bodyLines.push(
      currentWalkDistMeters < 20
        ? `已到達車站附近 (${currentWalkDistMeters}米)`
        : `距離${currentWalkDistMeters}米 (${currentWalkMinutes}分鐘)`
    );
  }

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const badgeIconUrl = createCountdownBadgeIcon(diffMin, currentRoute.route, hhmmStr);
  const options = {
    body: bodyLines.join("\n"),
    icon: badgeIconUrl,
    tag: "bus-eta-tracker",
    renotify: true,
    requireInteraction: true
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(titleText, options);
        return;
      }
    }
    activeBusNotification = new Notification(titleText, options);
  } catch (e) {}
}

// 當 watchPosition 偵測到用家行咗超過 12 米時，即時刷新步程距離
let lastNotiGpsLat = null;
let lastNotiGpsLon = null;

async function startPersistentTrackingNotification() {
  if ("Notification" in window && Notification.permission !== "granted") {
    try { await Notification.requestPermission(); } catch (e) {}
  }
  if ("Notification" in window && Notification.permission === "denied") {
    showToast("⚠️ 通知已被封鎖，請撳網址列鎖頭允許通知");
    return;
  }

  startSilentAudioKeepAlive();

  if (navigator.geolocation) {
    if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = navigator.geolocation.watchPosition(
      async (pos) => {
        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;
        renderUserLocationSpot();

        if (lastNotiGpsLat == null || haversineDistanceMeters(lastNotiGpsLat, lastNotiGpsLon, userLat, userLon) >= 12) {
          lastNotiGpsLat = userLat;
          lastNotiGpsLon = userLon;
          await refreshWalkDistanceForOrigin();
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }

  await updatePersistentTrackingNotification();
  startWorkerInterval(() => updatePersistentTrackingNotification(), 60000);
}

// 5. ★ 一開網頁預設自動彈開抽屜 ("half")
setBottomSheetState("half");
