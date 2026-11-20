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
let mainSummaryTimer = null;
let selectedStopEtaTimer = null;
let transferEtaTimer = null;

function clearMainTimers() {
  if (mainSummaryTimer) { clearInterval(mainSummaryTimer); mainSummaryTimer = null; }
  if (selectedStopEtaTimer) { clearInterval(selectedStopEtaTimer); selectedStopEtaTimer = null; }
}

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
  // ★ 新增：只喺主頁（未揀巴士路線果陣）顯示點對點導航掣
  const p2pBtn = document.getElementById("btnOpenP2PNav");
  if (p2pBtn) p2pBtn.style.display = currentRoute ? "none" : "inline-flex";
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

  clearMainTimers();
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
  clearMainTimers();
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
  clearMainTimers();
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

    if (mainSummaryTimer) clearInterval(mainSummaryTimer);
    mainSummaryTimer = setInterval(async () => {
      if (!currentRoute || !currentDirection || !routeStops.length) return;
      await loadEtaSummaryForAllStops();
      await loadHeadwayInfo();
      updateMainSunAdviceUI();
      if (mode === "interchange_pair") {
        if (originStopId) await loadEtaDetailForStop(originStopId, originSeq);
        if (transferStopId && (transferStopId !== originStopId || transferSeq != originSeq)) {
          await loadEtaDetailForStop(transferStopId, transferSeq);
        }
        await guessBoardingBusAtTransferStop();
      } else if (currentStopId && !selectedStopEtaTimer) {
        await loadEtaDetailForStop(currentStopId, originSeq);
      }
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
    if (selectedStopEtaTimer) { clearInterval(selectedStopEtaTimer); selectedStopEtaTimer = null; }

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

  if (selectedStopEtaTimer) { clearInterval(selectedStopEtaTimer); selectedStopEtaTimer = null; }

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

          const etaId = item.eta_seq || `${routeName}_${item.seq}_${item.eta}`;
          const btnTrack = document.createElement("button");
          btnTrack.className = "btn-track";
          btnTrack.textContent = "追蹤";
          if (selectedEtaTime && etaTime && stopId === originStopId && Math.abs(etaTime - selectedEtaTime) <= 90000) {
            row.classList.add("tracked");
            btnTrack.classList.add("active");
          }
          btnTrack.onclick = (e) => {
            e.stopPropagation();
            setTrackingEta({ id: etaId, etaTime, status }, row);
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
  selectedStopEtaTimer = setInterval(loadEta, 30000);
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
	  // ====== ★ 新增以下 4 行：喺 Notification 底部顯示被追蹤巴士站（Tag Location）座標 ======
	  if (stopCoords && isFinite(stopCoords.lat) && isFinite(stopCoords.lon)) {
		bodyLines.push(`座標: ${stopCoords.lat.toFixed(6)}, ${stopCoords.lon.toFixed(6)}`);
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


/* =========================================================================
   ★ 全港九巴 + 城巴 + 專線小巴「每個站分段車費 (Fares)」自動掛載模組
   數據來源：運輸署 / hkbus 開源車費整合庫 (支援雙 CDN 自動備援 + 本地快取)
   ========================================================================= */

var hkFareRouteList = null; // 儲存 routeFareList 入面嘅 routeList
var hkFareStopList = null;  // ★ 新增：儲存全港九巴/城巴/小巴車站 { name, lat, lon }
var fareLoadingPromise = null;

async function loadHkFareDatabase() {
  if (hkFareRouteList && hkFareStopList) return hkFareRouteList;
  if (fareLoadingPromise) return fareLoadingPromise;

  fareLoadingPromise = (async () => {
    try {
      const cached = await getFareFromIndexedDB();
      if (cached && Date.now() - cached.ts < 86400000 && cached.routeList && cached.stopList) {
        hkFareRouteList = cached.routeList;
        hkFareStopList = cached.stopList;
        refreshAllVisibleStopFares();
        return hkFareRouteList;
      }
    } catch (e) {}

    const urls = [
      "https://data.hkbus.app/routeFareList.min.json",
      "https://cdn.jsdelivr.net/gh/hkbus/hk-bus-crawling@gh-pages/routeFareList.min.json"
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        if (json && json.routeList) {
          const slimList = {};
          for (const [k, v] of Object.entries(json.routeList)) {
            if (v && v.fares && v.fares.length > 0) {
              slimList[k] = {
                route: String(v.route || "").toUpperCase(),
                co: v.co || [],
                orig: v.orig ? v.orig.zh : "",
                dest: v.dest ? v.dest.zh : "",
                gtfsId: v.gtfsId || "",
                serviceType: v.serviceType || "1",
                bound: v.bound || {},
                stops: v.stops || {},
                fares: v.fares
              };
            }
          }
          const slimStops = {};
          if (json.stopList) {
            for (const [sid, s] of Object.entries(json.stopList)) {
              const loc = s && s.location;
              if (loc && isFinite(loc.lat) && isFinite(loc.lng)) {
                slimStops[sid] = {
                  name: (s.name && s.name.zh) ? s.name.zh : sid,
                  lat: Number(loc.lat),
                  lon: Number(loc.lng)
                };
              }
            }
          }
          hkFareRouteList = slimList;
          hkFareStopList = slimStops;
          saveFareToIndexedDB({ ts: Date.now(), routeList: slimList, stopList: slimStops }).catch(() => {});
          console.log("💰 成功載入全港巴士及小巴分段車費與車站座標庫！");
          refreshAllVisibleStopFares();
          return hkFareRouteList;
        }
      } catch (e) {
        console.warn("車費庫來源切換中:", url, e.message);
      }
    }
    return null;
  })();

  return fareLoadingPromise;
}

function getFareFromIndexedDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("BusFareCacheDB", 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore("fares");
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction("fares", "readonly");
        const getReq = tx.objectStore("fares").get("hk_fares_v2");
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

function saveFareToIndexedDB(data) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("BusFareCacheDB", 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore("fares");
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction("fares", "readwrite");
        tx.objectStore("fares").put(data, "hk_fares_v2");
        tx.oncomplete = () => resolve(true);
      };
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}


// 2. 根據路線、公司及當前站點序列，精準配對該方向嘅每個站分段車費陣列
function findFaresArrayForRouteStops(routeObj, stopsArray) {
  if (!hkFareRouteList || !routeObj || !stopsArray || !stopsArray.length) return null;

  const targetRouteCode = String(routeObj.route || "").toUpperCase();
  const isGmb = isGmbCompany(routeObj.company);
  const coKey = isGmb ? "gmb" : (routeObj.company === "CTB" ? "ctb" : "kmb");

  // 將當前方向嘅站點 ID 轉為純 ID 集合（小巴去掉 GMB_ 前綴）
  const currentStopIds = stopsArray.map(s => String(s.stop_id || "").replace(/^GMB_/, ""));
  const currentStopSet = new Set(currentStopIds);

  let bestEntry = null;
  let bestScore = -1;

  for (const entry of Object.values(hkFareRouteList)) {
    if (entry.route !== targetRouteCode) continue;
    if (!entry.co.includes(coKey) && !(coKey !== "gmb" && (entry.co.includes("kmb") || entry.co.includes("ctb")))) continue;

    let score = 0;

    // (A) 如果係小巴而且有 gmbRouteId，直接對比 gtfsId 最準
    if (isGmb && routeObj.gmbRouteId && String(entry.gtfsId) === String(routeObj.gmbRouteId)) {
      score += 50;
    }

    // (B) 對比站點 ID 重疊數量（同時區分往返方向與小巴分區）
    const entryStops = entry.stops[coKey] || entry.stops.kmb || entry.stops.ctb || entry.stops.gmb || [];
    let matchCount = 0;
    entryStops.forEach(sid => {
      if (currentStopSet.has(String(sid))) matchCount++;
    });
    score += matchCount * 10;

    // (C) 對比首尾站方向順序（確保循環線或雙向線無掉轉方向）
    if (entryStops.length >= 2 && currentStopIds.length >= 2) {
      if (String(entryStops[0]) === currentStopIds[0]) score += 25;
      if (String(entryStops[entryStops.length - 1]) === currentStopIds[currentStopIds.length - 1]) score += 25;
    }

    // (D) 終點站名稱關鍵字輔助對齊
    const lastStopName = stripBracketCode(stopsArray[stopsArray.length - 1].name_tc || "");
    if (lastStopName && entry.dest && lastStopName.includes(entry.dest.substring(0, 2))) {
      score += 15;
    }

    if (score > bestScore && score > 0) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry ? bestEntry.fares : null;
}

// 查詢某條路線嘅最高（全程）車費，供 Step 1 搜尋列表顯示
function getMaxFareForRouteObj(routeObj) {
  if (!hkFareRouteList || !routeObj) return null;
  const targetRouteCode = String(routeObj.route || "").toUpperCase();
  const isGmb = isGmbCompany(routeObj.company);
  const coKey = isGmb ? "gmb" : (routeObj.company === "CTB" ? "ctb" : "kmb");

  for (const entry of Object.values(hkFareRouteList)) {
    if (entry.route !== targetRouteCode) continue;
    if (!entry.co.includes(coKey)) continue;
    if (isGmb && routeObj.gmbRouteId && String(entry.gtfsId) !== String(routeObj.gmbRouteId)) continue;
    if (entry.fares && entry.fares[0]) return entry.fares[0];
  }
  return null;
}

// 3. 將每個站嘅分段車費章 ($X.X) 掛上第一程同第二程嘅車站列表
function decorateStopListWithFares(containerSelector, routeObj, stopsArray) {
  if (!hkFareRouteList || !routeObj || !stopsArray || !stopsArray.length) return;
  const fares = findFaresArrayForRouteStops(routeObj, stopsArray);
  if (!fares || !fares.length) return;

  const stopEls = document.querySelectorAll(`${containerSelector} .stop-item`);
  stopEls.forEach((el, idx) => {
    const titleDiv = el.querySelector(".stop-title");
    if (!titleDiv) return;

    let badge = titleDiv.querySelector(".stop-fare-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "stop-fare-badge";
      // 插喺站名後面、「轉車」掣前面
      const firstSpan = titleDiv.querySelector("span");
      if (firstSpan && firstSpan.nextSibling) {
        titleDiv.insertBefore(badge, firstSpan.nextSibling);
      } else {
        titleDiv.appendChild(badge);
      }
    }

    // 尾站係落車總站，唔收上車車費；其餘各站顯示對應分段車費
    if (idx >= stopsArray.length - 1) {
      badge.textContent = "總站";
      badge.classList.add("is-terminal");
      el.dataset.fare = "0";
    } else {
      const fareVal = fares[Math.min(idx, fares.length - 1)];
      if (fareVal) {
        badge.textContent = `$${fareVal}`;
        badge.classList.remove("is-terminal");
        el.dataset.fare = String(fareVal);
      }
    }
  });
}

// 喺 Step 4 轉車步行提示框自動加埋「兩程車費總和」
function updateCombinedTransferFareText() {
  const walkInfoDiv = document.getElementById("transferWalkInfo");
  if (!walkInfoDiv || !walkInfoDiv.textContent) return;
  if (walkInfoDiv.textContent.includes("💰")) return;

  const leg1El = originStopId
    ? document.querySelector(`#stopList .stop-item[data-stop-id="${originStopId}"]`)
    : null;
  const leg2El = transferCurrentStopId
    ? document.querySelector(`#transferStopList .stop-item[data-stop-id="${transferCurrentStopId}"]`)
    : null;

  const f1 = leg1El && leg1El.dataset.fare ? parseFloat(leg1El.dataset.fare) : NaN;
  const f2 = leg2El && leg2El.dataset.fare ? parseFloat(leg2El.dataset.fare) : NaN;

  if (isFinite(f1) && f1 > 0 && isFinite(f2) && f2 > 0) {
    const total = (f1 + f2).toFixed(1).replace(/\.0$/, "");
    walkInfoDiv.textContent += ` ｜ 💰 車費：$${f1} + $${f2} = $${total}`;
  }
}

function refreshAllVisibleStopFares() {
  if (currentRoute && routeStops && routeStops.length) {
    decorateStopListWithFares("#stopList", currentRoute, routeStops);
  }
  if (transferRoute && transferRouteStops && transferRouteStops.length) {
    decorateStopListWithFares("#transferStopList", transferRoute, transferRouteStops);
    updateCombinedTransferFareText();
  }
  if (!currentRoute && currentInput) {
    renderRouteList();
  }
}

// 4. 掛鈎現有嘅 renderStopList、renderTransferStopList、selectTransferStop 同 createTwoLineRouteItemDOM
const _origRenderStopListForFare = renderStopList;
renderStopList = function() {
  _origRenderStopListForFare();
  decorateStopListWithFares("#stopList", currentRoute, routeStops);
};

const _origRenderTransferStopListForFare = renderTransferStopList;
renderTransferStopList = function() {
  _origRenderTransferStopListForFare();
  decorateStopListWithFares("#transferStopList", transferRoute, transferRouteStops);
};

const _origSelectTransferStopForFare = selectTransferStop;
selectTransferStop = async function(stopId, seq) {
  await _origSelectTransferStopForFare(stopId, seq);
  decorateStopListWithFares("#transferStopList", transferRoute, transferRouteStops);
  updateCombinedTransferFareText();
};

if (typeof createTwoLineRouteItemDOM === "function") {
  const _origCreateTwoLine = createTwoLineRouteItemDOM;
  createTwoLineRouteItemDOM = function(routeCode, cosArray, origText, destText, sampleObj) {
    const res = _origCreateTwoLine(routeCode, cosArray, origText, destText);
    const sample = sampleObj || uniqueRoutes.find(r => r.route === routeCode && cosArray.includes(r.company));
    const maxFare = getMaxFareForRouteObj(sample);
    if (maxFare) {
      const topRow = res.div.querySelector(".route-row-top");
      if (topRow) {
        const fareTag = document.createElement("span");
        fareTag.className = "route-fare-tag";
        fareTag.textContent = `$${maxFare}`;
        topRow.appendChild(fareTag);
      }
    }
    return res;
  };
}

// 啟動時喺背景載入全港車費表
loadHkFareDatabase();


/* =========================================================================
   ★ 全合一升級模組 (v7.2 修正版)：
   1) 修復 entry.dest.substring is not a function（恢復所有巴士／小巴站點與地圖標記顯示）
   2) 地圖港鐵站改為同巴士站一樣嘅 24x24px 圓形圖示（按路線配色，撳落去彈站名）
   3) 修復倉頡/速成組字 (isComposing) + 0ms 本地 6000 站檢索 + 政府 OGCIO 官方地址庫
   4) 修復專線小巴 file:// 直連 + 通知欄顯示座標 + 全域 1.5 倍步行時間
   5) 800m 點對點導航（巴士 + 小巴 + 港鐵）+ 港鐵獨立後層抽屜 (#mtr-sheet)
   ========================================================================= */

/* ---------- Part A：修復 findFaresArrayForRouteStops 報錯、GMB 直連與 1.5x 步速 ---------- */

// 修復 entry.dest 係物件 { zh, en } 時呼叫 .substring() 導致巴士及小巴站點全部無法顯示嘅 Bug
findFaresArrayForRouteStops = function (routeObj, stopsArray) {
  if (!hkFareRouteList || !routeObj || !stopsArray || !stopsArray.length) return null;

  const targetRouteCode = String(routeObj.route || "").toUpperCase();
  const isGmb = isGmbCompany(routeObj.company);
  const coKey = isGmb ? "gmb" : (routeObj.company === "CTB" ? "ctb" : "kmb");

  const currentStopIds = stopsArray.map(s => String(s.stop_id || "").replace(/^GMB_/, ""));
  const currentStopSet = new Set(currentStopIds);

  let bestEntry = null;
  let bestScore = -1;

  for (const entry of Object.values(hkFareRouteList)) {
    if (!entry) continue;
    if (String(entry.route || "").toUpperCase() !== targetRouteCode) continue;
    const cos = Array.isArray(entry.co) ? entry.co : [];
    if (!cos.includes(coKey) && !(coKey !== "gmb" && (cos.includes("kmb") || cos.includes("ctb")))) continue;

    let score = 0;
    if (isGmb && routeObj.gmbRouteId && String(entry.gtfsId || "") === String(routeObj.gmbRouteId)) {
      score += 50;
    }

    const stopsObj = entry.stops || {};
    const entryStops = stopsObj[coKey] || stopsObj.kmb || stopsObj.ctb || stopsObj.gmb || [];
    let matchCount = 0;
    entryStops.forEach(sid => {
      if (currentStopSet.has(String(sid))) matchCount++;
    });
    score += matchCount * 10;

    if (entryStops.length >= 2 && currentStopIds.length >= 2) {
      if (String(entryStops[0]) === currentStopIds[0]) score += 25;
      if (String(entryStops[entryStops.length - 1]) === currentStopIds[currentStopIds.length - 1]) score += 25;
    }

    const destStr = typeof entry.dest === "string"
      ? entry.dest
      : (entry.dest && typeof entry.dest.zh === "string" ? entry.dest.zh : "");
    const lastStopName = stripBracketCode(stopsArray[stopsArray.length - 1].name_tc || "");
    if (lastStopName && destStr && lastStopName.includes(destStr.substring(0, 2))) {
      score += 15;
    }

    if (score > bestScore && score > 0) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry && Array.isArray(bestEntry.fares) ? bestEntry.fares : null;
};

fetchGmbApi = async function (url, useCache = true) {
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

  // 1) data.etagmb.gov.hk 原生支援 CORS (*)，無論 http/https 定 file:// 一律優先直連
  try {
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 4500);
    const r1 = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", signal: ctrl1.signal });
    clearTimeout(t1);
    if (r1.ok) data = await r1.json();
  } catch (e) {}

  // 2) 後備通道（3.5 秒上限）
  if (!data) {
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 3500);
      const r2 = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, { signal: ctrl2.signal });
      clearTimeout(t2);
      if (r2.ok) data = await r2.json();
    } catch (e) {}
  }

  if (!data) throw new Error("GMB API unreachable: " + url);

  if (useCache) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
  }
  return data;
};

var WALK_TIME_MULTIPLIER = 1.5;

function calcWalkMinutes15x(distMeters) {
  if (!isFinite(distMeters) || distMeters <= 0) return 0;
  return (distMeters / (5000 / 60)) * WALK_TIME_MULTIPLIER;
}

walkingMinutesBetweenStops = function (stopIdA, stopIdB) {
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
  return calcWalkMinutes15x(distMeters);
};

drawUserWalkRouteToStop = async function (stopId) {
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
  currentWalkMinutes = currentWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(calcWalkMinutes15x(currentWalkDistMeters)));

  if (walkBox) walkBox.textContent = `🚶 由你位置行去「${stopName}」：計算實際步程中...`;

  if (straightDist < 15000) {
    try {
      const coordsStr = `${userLon.toFixed(6)},${userLat.toFixed(6)};${sLon.toFixed(6)},${sLat.toFixed(6)}`;
      const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes[0]) {
          const r = data.routes[0];
          const coords = r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
          userToStopRouteLayer = L.polyline(coords, {
            color: "#9333ea", weight: 5, dashArray: "6, 8", opacity: 0.9
          }).addTo(map);

          currentWalkDistMeters = Math.round(r.distance || straightDist);
          currentWalkMinutes = currentWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(calcWalkMinutes15x(currentWalkDistMeters)));
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
};

refreshWalkDistanceForOrigin = async function () {
  const stopCoords = getOriginStopLatLng();
  if (!stopCoords || userLat == null || userLon == null) return;

  const straightDist = haversineDistanceMeters(userLat, userLon, stopCoords.lat, stopCoords.lon);
  currentWalkDistMeters = Math.round(straightDist * 1.2);
  currentWalkMinutes = currentWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(calcWalkMinutes15x(currentWalkDistMeters)));

  if (straightDist >= 15 && straightDist < 15000) {
    try {
      const coordsStr = `${userLon.toFixed(6)},${userLat.toFixed(6)};${stopCoords.lon.toFixed(6)},${stopCoords.lat.toFixed(6)}`;
      const res = await fetch(
        `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const routeData = await res.json();
        if (routeData && routeData.routes && routeData.routes[0]) {
          const r = routeData.routes[0];
          currentWalkDistMeters = Math.round(r.distance || straightDist);
          currentWalkMinutes = currentWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(calcWalkMinutes15x(currentWalkDistMeters)));

          const coords = r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
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
};

// 巴士追蹤通知底部加上「座標: lat, lon」並同步更新頂部 #live-track-banner
const _baseUpdateBusNoti = updatePersistentTrackingNotification;
updatePersistentTrackingNotification = async function () {
  if (!selectedEtaTime || !currentRoute || !originStopId) {
    const banner = document.getElementById("live-track-banner");
    if (banner && !mtrActiveTracking) banner.classList.remove("active");
    stopPersistentTrackingNotification();
    return;
  }

  await _baseUpdateBusNoti();

  const stopCoords = getOriginStopLatLng();
  const diffMin = Math.round((selectedEtaTime - new Date()) / 60000);
  if (diffMin < 0) return;

  const dirTerm = currentDirection === "inbound"
    ? (inboundTerminalName !== "?" ? inboundTerminalName : stripBracketCode(currentRoute.dest_tc))
    : (outboundTerminalName !== "?" ? outboundTerminalName : stripBracketCode(currentRoute.orig_tc));
  const hhmmStr = formatTimeHHMM(selectedEtaTime);

  const banner = document.getElementById("live-track-banner");
  if (banner) {
    banner.classList.add("active");
    const rEl = document.getElementById("ltbRoute");
    const sEl = document.getElementById("ltbStop");
    const eEl = document.getElementById("ltbEta");
    const dEl = document.getElementById("ltbWalkDist");
    const tEl = document.getElementById("ltbWalkTime");
    if (rEl) rEl.textContent = `🚌 ${currentRoute.route} (往${dirTerm})`;
    if (sEl) sEl.textContent = stopCoords ? stopCoords.name : "";
    if (eEl) eEl.textContent = diffMin <= 0 ? `即將到達 (${hhmmStr})` : `下班車：${diffMin} 分鐘 (${hhmmStr})`;
    if (dEl) dEl.textContent = currentWalkDistMeters != null ? `步程 ${currentWalkDistMeters} 米` : "定位計算中";
    if (tEl) tEl.textContent = currentWalkMinutes != null ? `步行約 ${currentWalkMinutes} 分鐘` : "--";
  }

  if (stopCoords && "Notification" in window && Notification.permission === "granted") {
    const titleText = `${currentRoute.route} (往${dirTerm})`;
    const etaLine = diffMin <= 0 ? `即將到達 (${hhmmStr})` : `${diffMin} 分鐘 (${hhmmStr})`;
    const bodyLines = [stopCoords.name, etaLine];
    if (currentWalkDistMeters != null && currentWalkMinutes != null) {
      bodyLines.push(
        currentWalkDistMeters < 20
          ? `已到達車站附近 (${currentWalkDistMeters}米)`
          : `距離${currentWalkDistMeters}米 (${currentWalkMinutes}分鐘)`
      );
    }
    bodyLines.push(`座標: ${stopCoords.lat.toFixed(6)}, ${stopCoords.lon.toFixed(6)}`);

    const badgeIconUrl = createCountdownBadgeIcon(diffMin, currentRoute.route, hhmmStr);
    const options = { body: bodyLines.join("\n"), icon: badgeIconUrl, tag: "bus-eta-tracker", renotify: false, requireInteraction: true };
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) { await reg.showNotification(titleText, options); return; }
      }
      activeBusNotification = new Notification(titleText, options);
    } catch (e) {}
  }
};


/* ---------- Part B：港鐵 (MTR) 資料庫、路網圖、車費引擎 ---------- */

var MTR_SCHEDULE_API = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
var MTR_FARE_OFFICIAL_URL = "https://opendata.mtr.com.hk/data/mtr_lines_fares.csv";

var MTR_LINES = {
  KTL: { name: "觀塘綫", shortName: "觀塘", color: "#00ab4e", stations: ["WHA","HOM","YMT","MOK","PRE","SKM","KOT","LOF","WTS","DIH","CHH","KOB","NTK","KWT","LAT","YAT","TIK"] },
  TWL: { name: "荃灣綫", shortName: "荃灣", color: "#e2231a", stations: ["CEN","ADM","TST","JOR","YMT","MOK","PRE","SSP","CSW","LCK","MEF","LAK","KWF","KWH","TWH","TSW"] },
  ISL: { name: "港島綫", shortName: "港島", color: "#0071ce", stations: ["KET","HKU","SYP","SHW","CEN","ADM","WAC","CAB","TIH","FOH","NOP","QUB","TAK","SWH","SKW","HFC","CHW"] },
  SIL: { name: "南港島綫", shortName: "南港島", color: "#9ea700", stations: ["ADM","OCP","WCH","LET","SOH"] },
  TKL: { name: "將軍澳綫", shortName: "將軍澳", color: "#a35eb5", stations: ["NOP","QUB","YAT","TIK","TKO","HAH","POA","LHP"] },
  TCL: { name: "東涌綫", shortName: "東涌", color: "#f38b00", stations: ["HOK","KOW","OLY","NAC","LAK","TSY","SUN","TUC"] },
  DRL: { name: "迪士尼綫", shortName: "迪士尼", color: "#e65c9c", stations: ["SUN","DIS"] },
  AEL: { name: "機場快綫", shortName: "機快", color: "#007078", stations: ["HOK","KOW","TSY","AIR","AWE"] },
  EAL: { name: "東鐵綫", shortName: "東鐵", color: "#0284c7", stations: ["ADM","EXC","HUH","MKK","KOT","TAW","SHT","FOT","RAC","UNI","TAP","TWO","FAN","SHS","LOW","LMC"] },
  TML: { name: "屯馬綫", shortName: "屯馬", color: "#9a3b26", stations: ["WKS","MOS","HEO","TSH","SHM","CIO","STW","CKT","TAW","HIK","DIH","KAT","SUW","TKW","HOM","HUH","ETS","AUS","NAC","MEF","TWW","KSR","YUL","LOP","TIS","SIH","TUM"] }
};

var MTR_STATIONS = {
  ADM: { tc: "金鐘", en: "Admiralty", lat: 22.2789, lon: 114.1646, zone: "HK" },
  AIR: { tc: "機場", en: "Airport", lat: 22.3161, lon: 113.9366, zone: "AIR" },
  AUS: { tc: "柯士甸", en: "Austin", lat: 22.3048, lon: 114.1664, zone: "KLN" },
  AWE: { tc: "博覽館", en: "AsiaWorld-Expo", lat: 22.3216, lon: 113.9414, zone: "AIR" },
  CAB: { tc: "銅鑼灣", en: "Causeway Bay", lat: 22.2804, lon: 114.1839, zone: "HK" },
  CEN: { tc: "中環", en: "Central", lat: 22.2819, lon: 114.1576, zone: "HK" },
  CHH: { tc: "彩虹", en: "Choi Hung", lat: 22.3349, lon: 114.2089, zone: "KLN" },
  CHW: { tc: "柴灣", en: "Chai Wan", lat: 22.2645, lon: 114.2371, zone: "HK" },
  CIO: { tc: "第一城", en: "City One", lat: 22.3824, lon: 114.2036, zone: "MOS" },
  CKT: { tc: "車公廟", en: "Che Kung Temple", lat: 22.3746, lon: 114.1862, zone: "MOS" },
  CSW: { tc: "長沙灣", en: "Cheung Sha Wan", lat: 22.3354, lon: 114.1564, zone: "KLN" },
  DIH: { tc: "鑽石山", en: "Diamond Hill", lat: 22.3401, lon: 114.2016, zone: "KLN" },
  DIS: { tc: "迪士尼", en: "Disneyland Resort", lat: 22.3155, lon: 114.0450, zone: "DIS" },
  ETS: { tc: "尖東", en: "East Tsim Sha Tsui", lat: 22.2956, lon: 114.1749, zone: "KLN" },
  EXC: { tc: "會展", en: "Exhibition Centre", lat: 22.2817, lon: 114.1753, zone: "HK" },
  FAN: { tc: "粉嶺", en: "Fanling", lat: 22.4921, lon: 114.1387, zone: "EAL_NT" },
  FOH: { tc: "炮台山", en: "Fortress Hill", lat: 22.2881, lon: 114.1937, zone: "HK" },
  FOT: { tc: "火炭", en: "Fo Tan", lat: 22.3953, lon: 114.1983, zone: "EAL_NT" },
  HAH: { tc: "坑口", en: "Hang Hau", lat: 22.3156, lon: 114.2644, zone: "TKO" },
  HEO: { tc: "恆安", en: "Heng On", lat: 22.4176, lon: 114.2259, zone: "MOS" },
  HFC: { tc: "杏花邨", en: "Heng Fa Chuen", lat: 22.2769, lon: 114.2398, zone: "HK" },
  HIK: { tc: "顯徑", en: "Hin Keng", lat: 22.3639, lon: 114.1709, zone: "MOS" },
  HKU: { tc: "香港大學", en: "HKU", lat: 22.2842, lon: 114.1355, zone: "HK" },
  HOK: { tc: "香港", en: "Hong Kong", lat: 22.2849, lon: 114.1581, zone: "HK" },
  HOM: { tc: "何文田", en: "Ho Man Tin", lat: 22.3094, lon: 114.1827, zone: "KLN" },
  HUH: { tc: "紅磡", en: "Hung Hom", lat: 22.3029, lon: 114.1816, zone: "KLN" },
  JOR: { tc: "佐敦", en: "Jordan", lat: 22.3049, lon: 114.1717, zone: "KLN" },
  KAT: { tc: "啟德", en: "Kai Tak", lat: 22.3304, lon: 114.1995, zone: "KLN" },
  KET: { tc: "堅尼地城", en: "Kennedy Town", lat: 22.2812, lon: 114.1287, zone: "HK" },
  KOB: { tc: "九龍灣", en: "Kowloon Bay", lat: 22.3236, lon: 114.2142, zone: "KLN" },
  KOT: { tc: "九龍塘", en: "Kowloon Tong", lat: 22.3369, lon: 114.1761, zone: "KLN" },
  KOW: { tc: "九龍", en: "Kowloon", lat: 22.3048, lon: 114.1615, zone: "KLN" },
  KSR: { tc: "錦上路", en: "Kam Sheung Road", lat: 22.4347, lon: 114.0634, zone: "NWNT" },
  KWF: { tc: "葵芳", en: "Kwai Fong", lat: 22.3569, lon: 114.1269, zone: "TW" },
  KWH: { tc: "葵興", en: "Kwai Hing", lat: 22.3632, lon: 114.1312, zone: "TW" },
  KWT: { tc: "觀塘", en: "Kwun Tong", lat: 22.3122, lon: 114.2265, zone: "KLN" },
  LAK: { tc: "荔景", en: "Lai King", lat: 22.3484, lon: 114.1261, zone: "TW" },
  LAT: { tc: "藍田", en: "Lam Tin", lat: 22.3067, lon: 114.2330, zone: "KLN" },
  LCK: { tc: "荔枝角", en: "Lai Chi Kok", lat: 22.3372, lon: 114.1483, zone: "KLN" },
  LET: { tc: "利東", en: "Lei Tung", lat: 22.2422, lon: 114.1561, zone: "HK" },
  LHP: { tc: "康城", en: "LOHAS Park", lat: 22.2957, lon: 114.2689, zone: "TKO" },
  LMC: { tc: "落馬洲", en: "Lok Ma Chau", lat: 22.5145, lon: 114.0657, zone: "BORDER" },
  LOF: { tc: "樂富", en: "Lok Fu", lat: 22.3380, lon: 114.1870, zone: "KLN" },
  LOP: { tc: "朗屏", en: "Long Ping", lat: 22.4477, lon: 114.0254, zone: "NWNT" },
  LOW: { tc: "羅湖", en: "Lo Wu", lat: 22.5283, lon: 114.1133, zone: "BORDER" },
  MEF: { tc: "美孚", en: "Mei Foo", lat: 22.3379, lon: 114.1396, zone: "KLN" },
  MKK: { tc: "旺角東", en: "Mong Kok East", lat: 22.3222, lon: 114.1726, zone: "KLN" },
  MOK: { tc: "旺角", en: "Mong Kok", lat: 22.3192, lon: 114.1694, zone: "KLN" },
  MOS: { tc: "馬鞍山", en: "Ma On Shan", lat: 22.4248, lon: 114.2317, zone: "MOS" },
  NAC: { tc: "南昌", en: "Nam Cheong", lat: 22.3267, lon: 114.1533, zone: "KLN" },
  NOP: { tc: "北角", en: "North Point", lat: 22.2912, lon: 114.2007, zone: "HK" },
  NTK: { tc: "牛頭角", en: "Ngau Tau Kok", lat: 22.3153, lon: 114.2191, zone: "KLN" },
  OCP: { tc: "海洋公園", en: "Ocean Park", lat: 22.2487, lon: 114.1743, zone: "HK" },
  OLY: { tc: "奧運", en: "Olympic", lat: 22.3179, lon: 114.1602, zone: "KLN" },
  POA: { tc: "寶琳", en: "Po Lam", lat: 22.3227, lon: 114.2580, zone: "TKO" },
  PRE: { tc: "太子", en: "Prince Edward", lat: 22.3245, lon: 114.1683, zone: "KLN" },
  QUB: { tc: "鰂魚涌", en: "Quarry Bay", lat: 22.2879, lon: 114.2097, zone: "HK" },
  RAC: { tc: "馬場", en: "Racecourse", lat: 22.4005, lon: 114.2027, zone: "RAC" },
  SHM: { tc: "石門", en: "Shek Mun", lat: 22.3881, lon: 114.2084, zone: "MOS" },
  SHS: { tc: "上水", en: "Sheung Shui", lat: 22.5012, lon: 114.1279, zone: "EAL_NT" },
  SHT: { tc: "沙田", en: "Sha Tin", lat: 22.3827, lon: 114.1875, zone: "EAL_NT" },
  SHW: { tc: "上環", en: "Sheung Wan", lat: 22.2865, lon: 114.1518, zone: "HK" },
  SIH: { tc: "兆康", en: "Siu Hong", lat: 22.4119, lon: 113.9788, zone: "NWNT" },
  SKM: { tc: "石硤尾", en: "Shek Kip Mei", lat: 22.3320, lon: 114.1687, zone: "KLN" },
  SKW: { tc: "筲箕灣", en: "Shau Kei Wan", lat: 22.2789, lon: 114.2289, zone: "HK" },
  SOH: { tc: "海怡半島", en: "South Horizons", lat: 22.2425, lon: 114.1492, zone: "HK" },
  SSP: { tc: "深水埗", en: "Sham Shui Po", lat: 22.3308, lon: 114.1622, zone: "KLN" },
  STW: { tc: "沙田圍", en: "Sha Tin Wai", lat: 22.3771, lon: 114.1950, zone: "MOS" },
  SUN: { tc: "欣澳", en: "Sunny Bay", lat: 22.3318, lon: 114.0289, zone: "TC" },
  SUW: { tc: "宋皇臺", en: "Sung Wong Toi", lat: 22.3258, lon: 114.1916, zone: "KLN" },
  SWH: { tc: "西灣河", en: "Sai Wan Ho", lat: 22.2821, lon: 114.2220, zone: "HK" },
  SYP: { tc: "西營盤", en: "Sai Ying Pun", lat: 22.2858, lon: 114.1427, zone: "HK" },
  TAK: { tc: "太古", en: "Tai Koo", lat: 22.2847, lon: 114.2165, zone: "HK" },
  TAP: { tc: "大埔墟", en: "Tai Po Market", lat: 22.4446, lon: 114.1705, zone: "EAL_NT" },
  TAW: { tc: "大圍", en: "Tai Wai", lat: 22.3729, lon: 114.1787, zone: "MOS" },
  TIH: { tc: "天后", en: "Tin Hau", lat: 22.2827, lon: 114.1918, zone: "HK" },
  TIK: { tc: "調景嶺", en: "Tiu Keng Leng", lat: 22.3042, lon: 114.2525, zone: "TKO" },
  TIS: { tc: "天水圍", en: "Tin Shui Wai", lat: 22.4481, lon: 114.0044, zone: "NWNT" },
  TKO: { tc: "將軍澳", en: "Tseung Kwan O", lat: 22.3075, lon: 114.2600, zone: "TKO" },
  TKW: { tc: "土瓜灣", en: "To Kwa Wan", lat: 22.3173, lon: 114.1875, zone: "KLN" },
  TST: { tc: "尖沙咀", en: "Tsim Sha Tsui", lat: 22.2975, lon: 114.1722, zone: "KLN" },
  TSH: { tc: "大水坑", en: "Tai Shui Hang", lat: 22.4089, lon: 114.2231, zone: "MOS" },
  TSW: { tc: "荃灣", en: "Tsuen Wan", lat: 22.3737, lon: 114.1177, zone: "TW" },
  TSY: { tc: "青衣", en: "Tsing Yi", lat: 22.3584, lon: 114.1070, zone: "TC" },
  TUC: { tc: "東涌", en: "Tung Chung", lat: 22.2891, lon: 113.9415, zone: "TC" },
  TUM: { tc: "屯門", en: "Tuen Mun", lat: 22.3952, lon: 113.9731, zone: "NWNT" },
  TWH: { tc: "大窩口", en: "Tai Wo Hau", lat: 22.3707, lon: 114.1250, zone: "TW" },
  TWO: { tc: "太和", en: "Tai Wo", lat: 22.4510, lon: 114.1611, zone: "EAL_NT" },
  TWW: { tc: "荃灣西", en: "Tsuen Wan West", lat: 22.3686, lon: 114.1098, zone: "TW" },
  UNI: { tc: "大學", en: "University", lat: 22.4132, lon: 114.2102, zone: "EAL_NT" },
  WAC: { tc: "灣仔", en: "Wan Chai", lat: 22.2776, lon: 114.1731, zone: "HK" },
  WCH: { tc: "黃竹坑", en: "Wong Chuk Hang", lat: 22.2481, lon: 114.1679, zone: "HK" },
  WHA: { tc: "黃埔", en: "Whampoa", lat: 22.3051, lon: 114.1897, zone: "KLN" },
  WKS: { tc: "烏溪沙", en: "Wu Kai Sha", lat: 22.4288, lon: 114.2439, zone: "MOS" },
  WTS: { tc: "黃大仙", en: "Wong Tai Sin", lat: 22.3418, lon: 114.1939, zone: "KLN" },
  YAT: { tc: "油塘", en: "Yau Tong", lat: 22.2978, lon: 114.2372, zone: "KLN" },
  YMT: { tc: "油麻地", en: "Yau Ma Tei", lat: 22.3130, lon: 114.1707, zone: "KLN" },
  YUL: { tc: "元朗", en: "Yuen Long", lat: 22.4461, lon: 114.0353, zone: "NWNT" }
};

var MTR_CODE_ALIASES = {
  LUW: "LOW", LOK: "LMC", MKE: "MKK", TWV: "TWW", HOKG: "HOK",
  HONGKONGUNIVERSITY: "HKU", ASIAWORLDEXPO: "AWE", DISNEYLANDRESORT: "DIS", LOHASPARK: "LHP"
};
Object.entries(MTR_STATIONS).forEach(([code, info]) => {
  MTR_CODE_ALIASES[code] = code;
  MTR_CODE_ALIASES[info.tc] = code;
  MTR_CODE_ALIASES[info.en.toUpperCase()] = code;
  MTR_CODE_ALIASES[info.en.toUpperCase().replace(/[^A-Z0-9]/g, "")] = code;
});

function resolveMtrCode(raw) {
  if (!raw) return "";
  const clean = String(raw).replace(/^\uFEFF/, "").trim().toUpperCase();
  if (MTR_CODE_ALIASES[clean]) return MTR_CODE_ALIASES[clean];
  const stripped = clean.replace(/[^A-Z0-9\u4E00-\u9FFF]/g, "");
  return MTR_CODE_ALIASES[stripped] || clean;
}

function getMtrStationName(rawCode) {
  const code = resolveMtrCode(rawCode);
  return (MTR_STATIONS[code] && MTR_STATIONS[code].tc) || String(rawCode || "");
}

var MTR_STATION_LINES = {};
Object.entries(MTR_LINES).forEach(([lineCode, lineObj]) => {
  lineObj.stations.forEach(sta => {
    if (!MTR_STATION_LINES[sta]) MTR_STATION_LINES[sta] = [];
    if (!MTR_STATION_LINES[sta].includes(lineCode)) MTR_STATION_LINES[sta].push(lineCode);
  });
});

function getStationLineBackgroundCSS(staCode) {
  const lines = MTR_STATION_LINES[staCode] || ["TWL"];
  const colors = lines.map(l => (MTR_LINES[l] && MTR_LINES[l].color) || "#334155");
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  const stops = colors.map((c, idx) => `${c} ${(idx * step).toFixed(1)}%, ${c} ${((idx + 1) * step).toFixed(1)}%`);
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

var MTR_DIRECTION_META = {
  KTL: { UP: { label: "調景嶺", terms: ["TIK"] }, DOWN: { label: "黃埔 / 何文田", terms: ["WHA", "HOM"] } },
  TWL: { UP: { label: "荃灣", terms: ["TSW"] }, DOWN: { label: "中環", terms: ["CEN"] } },
  ISL: { UP: { label: "柴灣", terms: ["CHW"] }, DOWN: { label: "堅尼地城", terms: ["KET"] } },
  SIL: { UP: { label: "海怡半島", terms: ["SOH"] }, DOWN: { label: "金鐘", terms: ["ADM"] } },
  TKL: { UP: { label: "寶琳 / 康城", terms: ["POA", "LHP"] }, DOWN: { label: "北角 / 調景嶺", terms: ["NOP", "TIK"] } },
  TCL: { UP: { label: "東涌", terms: ["TUC"] }, DOWN: { label: "香港", terms: ["HOK"] } },
  DRL: { UP: { label: "欣澳", terms: ["SUN"] }, DOWN: { label: "迪士尼", terms: ["DIS"] } },
  AEL: { UP: { label: "機場 / 博覽館", terms: ["AWE", "AIR"] }, DOWN: { label: "香港", terms: ["HOK"] } },
  EAL: { UP: { label: "羅湖 / 落馬洲", terms: ["LOW", "LMC"] }, DOWN: { label: "金鐘", terms: ["ADM"] } },
  TML: { UP: { label: "屯門", terms: ["TUM"] }, DOWN: { label: "烏溪沙", terms: ["WKS"] } }
};

var mtrSheetState = "behind";
var mtrSelectedSta = null;
var mtrDropdownOpen = false;
var mtrCardsData = [];
var mtrActiveCardIdx = 0;
var mtrRefreshTimer = null;
var mtrStationMarker = null;
var mtrWalkRouteLayer = null;
var mtrWalkDistMeters = null;
var mtrWalkMinutes = null;
var mtrFareTableMap = null;
var mtrFareLoadingPromise = null;
var mtrPendingTrackTrain = null;
var mtrActiveTracking = null;
var mtrGeoDenied = false;

function requestSmartGeolocation(onSuccess, onFail) {
  if (!navigator.geolocation || mtrGeoDenied) {
    if (onFail) onFail({ code: 1 });
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      if (typeof renderUserLocationSpot === "function") renderUserLocationSpot();
      if (onSuccess) onSuccess(pos);
    },
    err => {
      if (err && err.code === 1) { mtrGeoDenied = true; if (onFail) onFail(err); return; }
      navigator.geolocation.getCurrentPosition(
        pos2 => {
          userLat = pos2.coords.latitude;
          userLon = pos2.coords.longitude;
          if (typeof renderUserLocationSpot === "function") renderUserLocationSpot();
          if (onSuccess) onSuccess(pos2);
        },
        err2 => {
          if (err2 && err2.code === 1) mtrGeoDenied = true;
          if (onFail) onFail(err2);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    },
    { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 }
  );
}

var MTR_EXACT_SEG_MINS = {
  "WKS_MOS": 2, "MOS_HEO": 2, "HEO_TSH": 2, "TSH_SHM": 2, "SHM_CIO": 2, "CIO_STW": 2, "STW_CKT": 2, "CKT_TAW": 2,
  "TAW_HIK": 2, "HIK_DIH": 4, "DIH_KAT": 2, "KAT_SUW": 2, "SUW_TKW": 2, "TKW_HOM": 2, "HOM_HUH": 2, "HUH_ETS": 2,
  "ETS_AUS": 2, "AUS_NAC": 3, "NAC_MEF": 3, "MEF_TWW": 4, "TWW_KSR": 5, "KSR_YUL": 4, "YUL_LOP": 2, "LOP_TIS": 3, "TIS_SIH": 4, "SIH_TUM": 3,
  "ADM_EXC": 2, "EXC_HUH": 4, "HUH_MKK": 3, "MKK_KOT": 3, "KOT_TAW": 4, "TAW_SHT": 3, "SHT_FOT": 3, "FOT_UNI": 3,
  "SHT_RAC": 3, "RAC_UNI": 3, "UNI_TAP": 5, "TAP_TWO": 2, "TWO_FAN": 5, "FAN_SHS": 3, "SHS_LOW": 4, "SHS_LMC": 6,
  "WHA_HOM": 3, "HOM_YMT": 2, "YMT_MOK": 2, "MOK_PRE": 2, "PRE_SKM": 2, "SKM_KOT": 2, "KOT_LOF": 2, "LOF_WTS": 2,
  "WTS_DIH": 2, "DIH_CHH": 2, "CHH_KOB": 2, "KOB_NTK": 2, "KWT_LAT": 2, "NTK_KWT": 2, "LAT_YAT": 3, "YAT_TIK": 3,
  "CEN_ADM": 2, "ADM_TST": 3, "TST_JOR": 2, "JOR_YMT": 2, "MEF_LAK": 2, "LAK_KWF": 2, "LAK_TSY": 3, "KWF_KWH": 2, "KWH_TWH": 2, "TWH_TSW": 2,
  "PRE_SSP": 2, "SSP_CSW": 2, "CSW_LCK": 2, "LCK_MEF": 2,
  "KET_HKU": 2, "HKU_SYP": 2, "SYP_SHW": 2, "SHW_CEN": 2, "ADM_WAC": 2, "WAC_CAB": 2, "CAB_TIH": 2, "TIH_FOH": 2,
  "FOH_NOP": 2, "NOP_QUB": 2, "QUB_TAK": 2, "TAK_SWH": 2, "SWH_SKW": 2, "SKW_HFC": 3, "HFC_CHW": 2,
  "QUB_YAT": 4, "TIK_TKO": 2, "TKO_HAH": 2, "HAH_POA": 2, "TKO_LHP": 4,
  "HOK_KOW": 3, "KOW_OLY": 2, "OLY_NAC": 2, "NAC_LAK": 4, "TSY_SUN": 5, "SUN_TUC": 7,
  "SUN_DIS": 4, "KOW_TSY": 6, "TSY_AIR": 12, "AIR_AWE": 2,
  "ADM_OCP": 4, "OCP_WCH": 2, "WCH_LET": 2, "LET_SOH": 2
};

function getExactMtrSegMins(staA, staB) {
  return MTR_EXACT_SEG_MINS[`${staA}_${staB}`] || MTR_EXACT_SEG_MINS[`${staB}_${staA}`] || 2;
}

var MTR_GRAPH = {};
var MTR_ADJ_STATIONS = {};

function addMtrEdge(u, v, mins, type = "ride") {
  if (!MTR_GRAPH[u]) MTR_GRAPH[u] = [];
  if (!MTR_GRAPH[v]) MTR_GRAPH[v] = [];
  MTR_GRAPH[u].push({ to: v, mins, type });
  MTR_GRAPH[v].push({ to: u, mins, type });

  const s1 = u.split("|")[0], s2 = v.split("|")[0];
  if (s1 !== s2) {
    if (!MTR_ADJ_STATIONS[s1]) MTR_ADJ_STATIONS[s1] = new Set();
    if (!MTR_ADJ_STATIONS[s2]) MTR_ADJ_STATIONS[s2] = new Set();
    MTR_ADJ_STATIONS[s1].add(s2);
    MTR_ADJ_STATIONS[s2].add(s1);
  }
}

(function buildMtrNetworkGraph() {
  ["KTL", "TWL", "ISL", "SIL", "TCL", "DRL", "AEL", "TML"].forEach(line => {
    const list = MTR_LINES[line].stations;
    for (let i = 0; i < list.length - 1; i++) {
      const m = line === "AEL" && list[i] === "HOK" && list[i + 1] === "KOW" ? 3 : getExactMtrSegMins(list[i], list[i + 1]);
      addMtrEdge(`${list[i]}|${line}`, `${list[i + 1]}|${line}`, m, "ride");
    }
  });

  const tklMain = ["NOP", "QUB", "YAT", "TIK", "TKO", "HAH", "POA"];
  for (let i = 0; i < tklMain.length - 1; i++) {
    addMtrEdge(`${tklMain[i]}|TKL`, `${tklMain[i + 1]}|TKL`, getExactMtrSegMins(tklMain[i], tklMain[i + 1]), "ride");
  }
  addMtrEdge("TKO|TKL", "LHP|TKL", 4, "ride");

  const ealMain = ["ADM", "EXC", "HUH", "MKK", "KOT", "TAW", "SHT", "FOT", "UNI", "TAP", "TWO", "FAN", "SHS"];
  for (let i = 0; i < ealMain.length - 1; i++) {
    addMtrEdge(`${ealMain[i]}|EAL`, `${ealMain[i + 1]}|EAL`, getExactMtrSegMins(ealMain[i], ealMain[i + 1]), "ride");
  }
  addMtrEdge("SHT|EAL", "RAC|EAL", 3, "ride");
  addMtrEdge("RAC|EAL", "UNI|EAL", 3, "ride");
  addMtrEdge("SHS|EAL", "LOW|EAL", 4, "ride");
  addMtrEdge("SHS|EAL", "LMC|EAL", 6, "ride");

  const fastCrossPlatform = new Set(["MOK", "PRE", "YMT", "ADM", "NOP", "QUB", "YAT", "TIK", "LAK", "HUH", "TAW", "NAC"]);
  Object.entries(MTR_STATION_LINES).forEach(([sta, lines]) => {
    if (lines.length < 2) return;
    const waitWalkMins = fastCrossPlatform.has(sta) ? 3 : 5;
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[i] === "AEL" || lines[j] === "AEL") continue;
        addMtrEdge(`${sta}|${lines[i]}`, `${sta}|${lines[j]}`, waitWalkMins, "transfer");
      }
    }
  });

  ["ISL", "TWL"].forEach(l1 => addMtrEdge(`CEN|${l1}`, "HOK|TCL", 6, "walk_transfer"));
  addMtrEdge("TST|TWL", "ETS|TML", 6, "walk_transfer");
})();

function computeMtrMinHops(origCode, destCode) {
  if (origCode === destCode) return 0;
  const q = [[origCode, 0]];
  const seen = new Set([origCode]);
  while (q.length > 0) {
    const [cur, d] = q.shift();
    const nbrs = MTR_ADJ_STATIONS[cur];
    if (!nbrs) continue;
    for (const nxt of nbrs) {
      if (nxt === destCode) return d + 1;
      if (!seen.has(nxt)) {
        seen.add(nxt);
        q.push([nxt, d + 1]);
      }
    }
  }
  return 6;
}

function computeGeneralMtrShortestRoute(originSta, targetSta) {
  if (originSta === targetSta) return null;
  const staOf = key => key.split("|")[0];
  const dist = {};
  const prev = {};
  const pq = [];

  (MTR_STATION_LINES[originSta] || []).forEach(l => {
    if (l === "AEL" && originSta !== "AIR" && originSta !== "AWE" && targetSta !== "AIR" && targetSta !== "AWE") return;
    const k = `${originSta}|${l}`;
    dist[k] = 0;
    pq.push({ key: k, cost: 0 });
  });

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const cur = pq.shift();
    if (cur.cost > (dist[cur.key] ?? Infinity)) continue;
    if (staOf(cur.key) === targetSta) break;

    const edges = MTR_GRAPH[cur.key] || [];
    for (const e of edges) {
      const nextLine = e.to.split("|")[1];
      if (nextLine === "AEL" && targetSta !== "AIR" && targetSta !== "AWE" && originSta !== "AIR" && originSta !== "AWE") continue;
      if (e.to === "RAC|EAL" && targetSta !== "RAC" && originSta !== "RAC") continue;
      const nextCost = cur.cost + e.mins;
      if (nextCost < (dist[e.to] ?? Infinity)) {
        dist[e.to] = nextCost;
        prev[e.to] = { key: cur.key, type: e.type };
        pq.push({ key: e.to, cost: nextCost });
      }
    }
  }

  let bestEndKey = null, bestCost = Infinity;
  (MTR_STATION_LINES[targetSta] || []).forEach(l => {
    const k = `${targetSta}|${l}`;
    if (dist[k] !== undefined && dist[k] < bestCost) { bestCost = dist[k]; bestEndKey = k; }
  });
  if (!bestEndKey) return null;

  const nodeChain = [];
  let ptr = bestEndKey;
  while (ptr) {
    const [sta, line] = ptr.split("|");
    nodeChain.unshift({ sta, line });
    ptr = prev[ptr] ? prev[ptr].key : null;
  }

  const legs = [];
  const transfers = [];
  for (let i = 0; i < nodeChain.length; i++) {
    const cur = nodeChain[i];
    if (!legs.length) {
      legs.push({ line: cur.line, from: cur.sta, to: cur.sta, secondSta: null, stopsCount: 0 });
    } else {
      const lastLeg = legs[legs.length - 1];
      if (cur.line === lastLeg.line) {
        if (!lastLeg.secondSta && cur.sta !== lastLeg.from) lastLeg.secondSta = cur.sta;
        lastLeg.to = cur.sta;
        lastLeg.stopsCount++;
      } else {
        transfers.push({ atSta: lastLeg.to, toSta: cur.sta, fromLine: lastLeg.line, toLine: cur.line, isWalk: lastLeg.to !== cur.sta });
        legs.push({ line: cur.line, from: cur.sta, to: cur.sta, secondSta: null, stopsCount: 0 });
      }
    }
  }

  return { totalRideMin: Math.max(2, Math.round(bestCost)), legs: legs.filter(l => l.from !== l.to), transfers };
}

function getTrainVisitedPathOnLine(line, startSta, destSta, viaRac = false) {
  if (!startSta || !destSta || startSta === destSta) return [{ sta: startSta, accMin: 0 }];
  const queue = [[{ sta: startSta, accMin: 0 }]];
  const visited = new Set([startSta]);

  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last.sta === destSta) return path;

    const edges = MTR_GRAPH[`${last.sta}|${line}`] || [];
    for (const e of edges) {
      if (e.type !== "ride") continue;
      const [nextSta, nextLine] = e.to.split("|");
      if (nextLine !== line || visited.has(nextSta)) continue;
      if (line === "EAL" && !viaRac && nextSta === "RAC" && destSta !== "RAC") continue;
      if (line === "EAL" && viaRac && nextSta === "FOT" && destSta !== "FOT") continue;
      visited.add(nextSta);
      queue.push([...path, { sta: nextSta, accMin: last.accMin + e.mins }]);
    }
  }
  return [{ sta: startSta, accMin: 0 }];
}

function computeMtrRouteFromTrackedTrain(originSta, boardLine, trainDestSta, targetSta, viaRac = false) {
  if (originSta === targetSta) {
    return { totalRideMin: 0, transfers: [], legs: [{ line: boardLine, from: originSta, to: targetSta }], oppositeDirWarn: false };
  }

  const staOf = key => key.split("|")[0];
  const dist = {};
  const prev = {};
  const pq = [];

  const trainStops = getTrainVisitedPathOnLine(boardLine, originSta, trainDestSta, viaRac);
  const onTrainSet = new Set(trainStops.map(s => s.sta));

  trainStops.forEach((step, idx) => {
    const k = `${step.sta}|${boardLine}`;
    dist[k] = step.accMin;
    if (idx > 0) prev[k] = { key: `${trainStops[idx - 1].sta}|${boardLine}`, type: "ride" };
    pq.push({ key: k, cost: step.accMin });

    if (idx > 0) {
      const branchEdges = (MTR_GRAPH[k] || []).filter(e => e.type === "ride" && !onTrainSet.has(staOf(e.to)));
      branchEdges.forEach(be => {
        const branchCost = step.accMin + 4 + be.mins;
        if (dist[be.to] === undefined || branchCost < dist[be.to]) {
          dist[be.to] = branchCost;
          prev[be.to] = { key: k, type: "branch_transfer" };
          pq.push({ key: be.to, cost: branchCost });
        }
      });
    }
  });

  (MTR_STATION_LINES[originSta] || []).forEach(l => {
    const k = `${originSta}|${l}`;
    if (dist[k] === undefined) { dist[k] = 4; pq.push({ key: k, cost: 4 }); }
  });

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const cur = pq.shift();
    if (cur.cost > (dist[cur.key] ?? Infinity)) continue;
    if (staOf(cur.key) === targetSta) break;

    const edges = MTR_GRAPH[cur.key] || [];
    for (const e of edges) {
      if (cur.key === `${originSta}|${boardLine}` && e.type === "ride") {
        const nSta = staOf(e.to);
        if (!onTrainSet.has(nSta) && trainStops.length > 1) {
          const altCost = cur.cost + 4 + e.mins;
          if (altCost < (dist[e.to] ?? Infinity)) {
            dist[e.to] = altCost;
            prev[e.to] = { key: cur.key, type: "opposite_dir" };
            pq.push({ key: e.to, cost: altCost });
          }
          continue;
        }
      }
      const nextCost = cur.cost + e.mins;
      if (nextCost < (dist[e.to] ?? Infinity)) {
        dist[e.to] = nextCost;
        prev[e.to] = { key: cur.key, type: e.type };
        pq.push({ key: e.to, cost: nextCost });
      }
    }
  }

  let bestEndKey = null, bestCost = Infinity;
  (MTR_STATION_LINES[targetSta] || []).forEach(l => {
    const k = `${targetSta}|${l}`;
    if (dist[k] !== undefined && dist[k] < bestCost) { bestCost = dist[k]; bestEndKey = k; }
  });
  if (!bestEndKey) return null;

  const nodeChain = [];
  let ptr = bestEndKey;
  let oppositeDirWarn = false;
  const branchTransferSet = new Set();

  while (ptr) {
    const [sta, line] = ptr.split("|");
    nodeChain.unshift({ sta, line });
    const p = prev[ptr];
    if (p && p.type === "opposite_dir") oppositeDirWarn = true;
    if (p && p.type === "branch_transfer") branchTransferSet.add(staOf(p.key));
    ptr = p ? p.key : null;
  }

  const legs = [];
  const transfers = [];
  for (let i = 0; i < nodeChain.length; i++) {
    const cur = nodeChain[i];
    if (!legs.length) {
      legs.push({ line: cur.line, from: cur.sta, to: cur.sta, stopsCount: 0 });
    } else {
      const lastLeg = legs[legs.length - 1];
      if (cur.line === lastLeg.line && !branchTransferSet.has(lastLeg.to)) {
        lastLeg.to = cur.sta;
        lastLeg.stopsCount++;
      } else {
        transfers.push({ atSta: lastLeg.to, toSta: cur.sta, fromLine: lastLeg.line, toLine: cur.line, isWalk: lastLeg.to !== cur.sta, isBranch: cur.line === lastLeg.line });
        legs.push({ line: cur.line, from: cur.sta, to: cur.sta, stopsCount: 0 });
      }
    }
  }

  return { totalRideMin: Math.max(2, Math.round(bestCost)), legs: legs.filter(l => l.from !== l.to), transfers, oppositeDirWarn };
}

function parseCsvRowSimple(line) {
  const res = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { res.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  res.push(cur.trim());
  return res;
}

function loadMtrOfficialFares() {
  if (mtrFareTableMap) return Promise.resolve(mtrFareTableMap);
  if (mtrFareLoadingPromise) return mtrFareLoadingPromise;

  mtrFareLoadingPromise = (async () => {
    try {
      const cached = await new Promise(resolve => {
        const req = indexedDB.open("MtrFareCacheDB", 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore("fares");
        req.onsuccess = e => {
          const tx = e.target.result.transaction("fares", "readonly");
          const g = tx.objectStore("fares").get("mtr_oct_fares_v7");
          g.onsuccess = () => resolve(g.result || null);
          g.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
      if (cached && Date.now() - cached.ts < 30 * 86400000 && cached.map && Object.keys(cached.map).length > 2000) {
        mtrFareTableMap = cached.map;
        return mtrFareTableMap;
      }
    } catch (e) {}

    let csvText = "";
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(MTR_FARE_OFFICIAL_URL)}`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) {
        const t = await r.text();
        if (t && t.includes("OCT_ADT_FARE")) csvText = t;
      }
    } catch (e) {}

    if (csvText) {
      const parsedMap = {};
      const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
      const headers = parseCsvRowSimple(lines.shift() || "").map(h => h.replace(/^\uFEFF/, "").trim().toUpperCase());
      const srcIdx = headers.indexOf("SRC_STATION_NAME");
      const dstIdx = headers.indexOf("DEST_STATION_NAME");
      const octIdx = headers.indexOf("OCT_ADT_FARE");

      if (srcIdx >= 0 && dstIdx >= 0 && octIdx >= 0) {
        for (const rowStr of lines) {
          if (!rowStr || !rowStr.trim()) continue;
          const cols = parseCsvRowSimple(rowStr);
          const sCode = resolveMtrCode(cols[srcIdx]);
          const dCode = resolveMtrCode(cols[dstIdx]);
          const fare = parseFloat(cols[octIdx]);
          if (MTR_STATIONS[sCode] && MTR_STATIONS[dCode] && isFinite(fare) && fare > 0) {
            parsedMap[`${sCode}_${dCode}`] = fare;
          }
        }
        if (!parsedMap["ADM_EXC"]) {
          Object.keys(MTR_STATIONS).forEach(st => {
            if (st === "EXC") return;
            const ref = st === "ADM" ? "WAC" : "ADM";
            if (parsedMap[`${st}_${ref}`]) parsedMap[`${st}_EXC`] = parsedMap[`${st}_${ref}`];
            if (parsedMap[`${ref}_${st}`]) parsedMap[`EXC_${st}`] = parsedMap[`${ref}_${st}`];
          });
        }
        if (Object.keys(parsedMap).length > 2000) {
          mtrFareTableMap = parsedMap;
          try {
            const req = indexedDB.open("MtrFareCacheDB", 1);
            req.onupgradeneeded = e => e.target.result.createObjectStore("fares");
            req.onsuccess = e => {
              const tx = e.target.result.transaction("fares", "readwrite");
              tx.objectStore("fares").put({ ts: Date.now(), map: parsedMap }, "mtr_oct_fares_v7");
            };
          } catch (e) {}
          if (mtrActiveTracking) {
            mtrActiveTracking.fare = getMtrAdultFare(mtrActiveTracking.originSta, mtrActiveTracking.destSta, mtrActiveTracking.boardLine);
            updateMtrTrackingBannerAndNotification(false);
          }
          return mtrFareTableMap;
        }
      }
    }
    return null;
  })();

  return mtrFareLoadingPromise;
}

function estimateOfficialMtrZoneFare(origCode, destCode, boardLine = "") {
  const sA = MTR_STATIONS[origCode], sB = MTR_STATIONS[destCode];
  if (!sA || !sB) return 8.9;

  const aelSet = new Set(["HOK", "KOW", "TSY", "AIR", "AWE"]);
  if (boardLine === "AEL" || origCode === "AIR" || origCode === "AWE" || destCode === "AIR" || destCode === "AWE") {
    if (aelSet.has(origCode) && aelSet.has(destCode)) {
      const p = [origCode, destCode].sort().join("_");
      const aelMap = { "AIR_AWE": 5.5, "AIR_HOK": 110, "AWE_HOK": 110, "AIR_KOW": 100, "AWE_KOW": 100, "AIR_TSY": 65, "AWE_TSY": 65 };
      if (aelMap[p]) return aelMap[p];
    }
  }

  if (sA.zone === "BORDER" || sB.zone === "BORDER") {
    const other = sA.zone === "BORDER" ? sB : sA;
    const otherCode = sA.zone === "BORDER" ? destCode : origCode;
    if (otherCode === "SHS" || otherCode === "FAN") return 26.5;
    if (otherCode === "TWO" || otherCode === "TAP") return 30.5;
    if (otherCode === "UNI" || otherCode === "FOT" || otherCode === "SHT" || otherCode === "TAW") return 34.5;
    if (other.zone === "MOS") return 39.2;
    if (other.zone === "KLN") return 44.8;
    if (other.zone === "HK") return 53.8;
    return 51.5;
  }

  if (origCode === "DIS" || destCode === "DIS") {
    const otherCode = origCode === "DIS" ? destCode : origCode;
    if (otherCode === "SUN") return 7.5;
    if (otherCode === "TSY" || otherCode === "TUC" || otherCode === "LAK") return 15.5;
    if (MTR_STATIONS[otherCode] && MTR_STATIONS[otherCode].zone === "HK") return 28.6;
    return 21.9;
  }

  const hops = computeMtrMinHops(origCode, destCode);
  if (sA.zone === "MOS" && sB.zone === "MOS") return hops <= 2 ? 4.1 : 5.9;
  if ((sA.zone === "EAL_NT" || origCode === "TAW") && (sB.zone === "EAL_NT" || destCode === "TAW")) {
    if (hops <= 1) return 4.1;
    if (hops <= 3) return 5.9;
    if (hops <= 5) return 8.3;
    return 9.9;
  }
  if (sA.zone === "NWNT" && sB.zone === "NWNT") return hops <= 1 ? 4.9 : 5.6;

  const isCrossHarbour = (sA.zone === "HK" && sB.zone !== "HK") || (sB.zone === "HK" && sA.zone !== "HK");
  if (isCrossHarbour) {
    if (hops <= 2) return 10.9;
    if (hops <= 4) return 12.9;
    if (hops <= 6) return 14.9;
    if (hops <= 9) return 16.5;
    if (hops <= 13) return 20.5;
    if (hops <= 17) return 23.1;
    return 26.8;
  }

  if (hops <= 1) return 4.9;
  if (hops === 2) return 5.9;
  if (hops <= 4) return 7.1;
  if (hops <= 6) return 8.9;
  if (hops <= 9) return 10.9;
  if (hops <= 12) return 12.9;
  if (hops <= 15) return 15.9;
  return 19.8;
}

function getMtrAdultFare(origCode, destCode, boardLine = "") {
  if (!origCode || !destCode || origCode === destCode) return 0;
  const key = `${origCode}_${destCode}`;
  if (mtrFareTableMap && mtrFareTableMap[key] != null) return mtrFareTableMap[key];
  return estimateOfficialMtrZoneFare(origCode, destCode, boardLine);
}


/* ---------- Part C：介面樣式與 HTML 掛載 ---------- */

var P2P_RADIUS_METERS = 800;
var p2pOrigin = null;
var p2pDest = null;
var p2pMapPickTarget = null;
var p2pMarkers = { origin: null, dest: null };
var p2pResults = [];
var p2pSortBy = "best";
var p2pFullRouteDb = null;
var p2pApplyingLock = false;
var p2pModalSheetState = "full";
var p2pIncludeMtr = true;
var p2pPlaceSearchCache = new Map();

async function ensureP2PFullRouteStopDatabase() {
  if (p2pFullRouteDb) return p2pFullRouteDb;
  try {
    const cached = await new Promise(resolve => {
      const req = indexedDB.open("BusFareCacheDB", 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore("fares");
      req.onsuccess = e => {
        const tx = e.target.result.transaction("fares", "readonly");
        const getReq = tx.objectStore("fares").get("hk_fares_v2");
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
    if (cached && Date.now() - cached.ts < 86400000 && cached.stopList && cached.routeList) {
      p2pFullRouteDb = cached;
      return p2pFullRouteDb;
    }
  } catch (e) {}

  const urls = [
    "https://data.hkbus.app/routeFareList.min.json",
    "https://cdn.jsdelivr.net/gh/hkbus/hk-bus-crawling@gh-pages/routeFareList.min.json"
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.routeList && json.stopList) {
        const dbObj = { ts: Date.now(), routeList: json.routeList, stopList: json.stopList };
        p2pFullRouteDb = dbObj;
        try {
          const req = indexedDB.open("BusFareCacheDB", 1);
          req.onupgradeneeded = e => e.target.result.createObjectStore("fares");
          req.onsuccess = e => {
            const tx = e.target.result.transaction("fares", "readwrite");
            tx.objectStore("fares").put(dbObj, "hk_fares_v2");
          };
        } catch (e) {}
        return p2pFullRouteDb;
      }
    } catch (e) {}
  }
  return null;
}

(function injectUnifiedP2PAndMtrUI() {
  if (!document.getElementById("unified-v7-styles")) {
    const style = document.createElement("style");
    style.id = "unified-v7-styles";
    style.textContent = `
      #p2p-nav-modal {
        display: none; position: fixed; left: 0; right: 0; top: 10vh; bottom: 0; height: 90vh;
        z-index: 9200; background: #f8fafc; flex-direction: column; overflow: hidden;
        border-radius: 20px 20px 0 0; box-shadow: 0 -8px 32px rgba(15, 23, 42, 0.35);
        border-top: 1px solid rgba(255,255,255,0.25);
        transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
      }
      #p2p-nav-modal.active { display: flex; }
      #p2p-nav-modal.p2p-sheet-peek { transform: translateY(48vh); }
      #p2p-nav-modal.p2p-sheet-min { transform: translateY(calc(90vh - 64px)); }
      #p2p-nav-modal.p2p-sheet-peek .p2p-search-panel,
      #p2p-nav-modal.p2p-sheet-min .p2p-search-panel { display: none; }

      .p2p-top-bar {
        background: #0f172a; color: #fff; padding: 8px 14px 10px;
        border-radius: 20px 20px 0 0; cursor: grab; user-select: none; touch-action: none; flex-shrink: 0;
      }
      .p2p-drag-pill { width: 42px; height: 5px; background: #64748b; border-radius: 999px; margin: 0 auto 7px; }
      .p2p-top-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .p2p-top-btns { display: flex; gap: 6px; align-items: center; }
      .btn-p2p-top { padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 999px; border: none; margin: 0; cursor: pointer; }
      #btnP2PMapToggle { background: #1e293b; color: #93c5fd; border: 1px solid #334155; }
      #btnCloseP2P { background: #ef4444; color: #fff; }

      .p2p-search-panel { padding: 10px 12px; background: #fff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
      .p2p-input-row { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; position: relative; }
      .p2p-label { font-size: 12.5px; font-weight: 800; width: 42px; flex-shrink: 0; }
      .p2p-input-wrap { flex: 1; position: relative; min-width: 0; }
      .p2p-input { width: 100%; padding: 7px 10px; font-size: 13.5px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; }
      .p2p-suggest-box {
        display: none; position: absolute; left: 0; right: 0; top: 100%; margin-top: 3px;
        background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; max-height: 220px;
        overflow-y: auto; z-index: 9500; box-shadow: 0 8px 22px rgba(0,0,0,0.18);
      }
      .p2p-suggest-box.open { display: block; }
      .p2p-suggest-item { padding: 8px 10px; font-size: 13px; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
      .p2p-suggest-item:hover { background: #eff6ff; }
      .p2p-mini-btn { padding: 6px 8px; font-size: 11.5px; font-weight: 700; border-radius: 8px; margin: 0; flex-shrink: 0; }
      .p2p-go-btn {
        width: 100%; padding: 9px; font-size: 14px; font-weight: 800; border-radius: 10px;
        background: #1565c0; color: #fff; border: none; margin: 2px 0 0; cursor: pointer;
      }

      .p2p-sort-bar {
        display: flex; align-items: center; gap: 5px; padding: 7px 10px;
        background: #f1f5f9; border-bottom: 1px solid #e2e8f0; overflow-x: auto; flex-shrink: 0;
      }
      .p2p-sort-btn {
        padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 999px;
        border: 1px solid #cbd5e1; background: #fff; color: #475569; margin: 0; flex-shrink: 0;
      }
      .p2p-sort-btn.active { background: #1565c0; color: #fff; border-color: #1565c0; }
      #p2pMtrToggleBtn {
        padding: 4px 10px; font-size: 12px; border-radius: 999px; margin: 0 0 0 auto;
        font-weight: 800; border: 1px solid #fda4af; background: #be123c; color: #ffffff; cursor: pointer; flex-shrink: 0;
      }
      #p2pMtrToggleBtn.mtr-off { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }

      #p2pStatusBar { padding: 6px 12px; font-size: 12px; font-weight: 700; color: #475569; background: #fffbeb; border-bottom: 1px solid #fde68a; flex-shrink: 0; }
      .p2p-table-wrap { flex: 1; min-height: 0; overflow: auto; background: #fff; padding-bottom: 40px; }
      .p2p-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .p2p-table th {
        position: sticky; top: 0; background: #f8fafc; color: #334155; font-weight: 800;
        padding: 8px 6px; border-bottom: 2px solid #cbd5e1; text-align: left; z-index: 10; font-size: 11.5px;
      }
      .p2p-table td { padding: 9px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
      .p2p-row { cursor: pointer; transition: background 0.12s; }
      .p2p-row:hover { background: #eff6ff; }
      .p2p-row.p2p-row-no-eta { opacity: 0.45; filter: grayscale(0.9); background: #f8fafc; }
      .p2p-here-tag {
        display: inline-block; font-size: 10px; font-weight: 800; color: #15803d;
        background: #dcfce7; border: 1px solid #86efac; border-radius: 4px; padding: 0 4px; margin-left: 3px;
      }
      @media (max-width: 767px) { .p2p-desktop-only { display: none !important; } }

      #p2pMapPickBanner {
        display: none; position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
        z-index: 9600; background: #0f172a; color: #fff; padding: 9px 16px; border-radius: 999px;
        font-size: 13px; font-weight: 700; box-shadow: 0 6px 20px rgba(0,0,0,0.35); align-items: center; gap: 10px;
      }
      #p2pMapPickBanner.active { display: flex; }

      #mtr-sheet {
        position: fixed; left: 0; right: 0; bottom: 0; height: 90vh; max-height: 90vh;
        background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(12px);
        border-radius: 20px 20px 0 0; box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.22);
        border: 1px solid rgba(190, 18, 60, 0.25); display: flex; flex-direction: column; z-index: 998;
        transform: translateY(var(--mtr-behind-y, calc(100% - 122px)));
        transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease; will-change: transform;
      }
      #mtr-sheet.mtr-dragging { transition: none !important; }
      #mtr-sheet.mtr-active { z-index: 1005; border-color: #cbd5e1; box-shadow: 0 -10px 36px rgba(15, 23, 42, 0.28); }
      #mtr-sheet.mtr-state-behind { transform: translateY(var(--mtr-behind-y, calc(100% - 122px))); }
      #mtr-sheet.mtr-state-peek { transform: translateY(54%); }
      #mtr-sheet.mtr-state-half { transform: translateY(22%); }
      #mtr-sheet.mtr-state-full { transform: translateY(0%); }

      #mtr-sheet-header {
        padding: 7px 16px 10px; cursor: grab; user-select: none; touch-action: none;
        border-radius: 20px 20px 0 0; flex-shrink: 0;
        background: linear-gradient(90deg, #881337, #be123c); color: #ffffff;
        border-bottom: 1px solid rgba(255,255,255,0.15);
      }
      #mtr-sheet.mtr-active #mtr-sheet-header { background: #ffffff; color: #0f172a; border-bottom: 1px solid #e2e8f0; }
      #mtr-sheet .mtr-pill { width: 44px; height: 5px; background: rgba(255,255,255,0.55); border-radius: 999px; margin: 0 auto 6px; }
      #mtr-sheet.mtr-active .mtr-pill { background: #cbd5e1; }
      .mtr-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .mtr-header-brand { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 800; min-width: 0; }
      #mtr-sheet.mtr-active .mtr-header-brand { color: #9f1239; }
      .mtr-header-hint {
        font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 999px;
        background: rgba(255,255,255,0.2); color: #fff1f2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #mtr-sheet.mtr-active .mtr-header-hint { background: #ffe4e6; color: #be123c; }
      .mtr-header-btns { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .btn-mtr-sheet-ctrl {
        padding: 4px 10px; font-size: 12px; font-weight: 800; border-radius: 999px;
        border: none; margin: 0; cursor: pointer; background: rgba(255,255,255,0.22); color: #ffffff;
      }
      #mtr-sheet.mtr-active .btn-mtr-sheet-ctrl { background: #ffe4e6; color: #be123c; }
      #btnMtrHideToBack { display: none; background: #f1f5f9; color: #475569; }
      #mtr-sheet.mtr-active #btnMtrHideToBack { display: inline-block; }

      @media (min-width: 768px) {
        #mtr-sheet {
          left: auto; right: 556px; width: calc(100vw - 572px); min-width: 400px; max-width: 820px; z-index: 1001;
        }
        #mtr-sheet.mtr-state-behind { transform: translateY(calc(100% - 76px)) !important; }
        #mtr-sheet.mtr-active { z-index: 1005; width: min(820px, calc(100vw - 572px)); }
      }

      #mtr-sheet-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px 55vh; background: #f8fafc; }
      .mtr-station-picker-wrap { position: relative; display: flex; align-items: stretch; gap: 8px; }
      #mtrStationColorBtn {
        flex: 1; min-width: 0; padding: 9px 14px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.85);
        color: #ffffff; font-size: 16px; font-weight: 900; display: flex; align-items: center; justify-content: space-between;
        gap: 8px; cursor: pointer; margin: 0; box-shadow: 0 3px 10px rgba(15, 23, 42, 0.16); text-shadow: 0 1px 3px rgba(0,0,0,0.45);
      }
      .mtr-sta-btn-dist { font-size: 12px; font-weight: 800; background: rgba(0,0,0,0.28); padding: 2px 8px; border-radius: 999px; }
      .btn-mtr-nearest {
        flex-shrink: 0; padding: 0 12px; font-size: 12.5px; font-weight: 800; border-radius: 12px;
        background: #ffffff; color: #be123c; border: 1px solid #fda4af; margin: 0;
      }
      #mtrColorDropdownPanel {
        display: none; margin-top: 8px; background: #ffffff; border: 1px solid #cbd5e1;
        border-radius: 14px; padding: 10px; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18); max-height: 48vh; overflow-y: auto;
      }
      #mtrColorDropdownPanel.open { display: block; }
      #mtrStaFilterInput { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13.5px; margin-bottom: 8px; outline: none; }
      .mtr-color-sta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 6px; }
      .mtr-color-sta-item {
        padding: 8px 8px; border-radius: 9px; border: none; color: #ffffff; font-size: 13.5px; font-weight: 900;
        text-align: center; cursor: pointer; margin: 0; text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
      }
      .mtr-color-sta-item.selected-sta { outline: 3px solid #0f172a; outline-offset: 1px; }
      .mtr-color-sta-sub { font-size: 10.5px; font-weight: 700; background: rgba(0,0,0,0.28); padding: 1px 6px; border-radius: 999px; }
      .mtr-line-color-divider { height: 4px; border-radius: 999px; margin: 10px 0 6px; }

      #mtrWalkInfoBox { margin-top: 8px; padding: 7px 12px; background: #f3e8ff; color: #6b21a8; border-left: 3px solid #9333ea; border-radius: 8px; font-size: 12px; font-weight: 700; }
      #mtrWalkInfoBox:empty { display: none; }
      #mtrSwipeChips { display: flex; align-items: center; gap: 6px; overflow-x: auto; padding: 8px 2px 4px; scrollbar-width: none; }
      #mtrSwipeChips::-webkit-scrollbar { display: none; }
      .mtr-dir-chip { flex-shrink: 0; padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 800; border: none; background: #e2e8f0; color: #475569; cursor: pointer; margin: 0; }
      .mtr-dir-chip.active { color: #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
      .mtr-swipe-hint { font-size: 11px; color: #64748b; text-align: center; margin: 2px 0 6px; font-weight: 600; }
      @media (min-width: 768px) {
        #mtrSwipeChips, .mtr-swipe-hint { display: none !important; }
        #mtrCardsContainer { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; margin-top: 10px; }
      }
      #mtrCardsContainer { margin-top: 4px; touch-action: pan-y; }
      .mtr-dir-card { background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 3px 10px rgba(15, 23, 42, 0.06); }
      @media (max-width: 767px) { .mtr-dir-card.mobile-hidden { display: none; } }
      .mtr-card-header { padding: 12px 14px; color: #ffffff; display: flex; flex-direction: column; gap: 3px; }
      .mtr-card-line-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 800; }
      .mtr-line-pill { background: rgba(0,0,0,0.22); padding: 2px 8px; border-radius: 999px; }
      .mtr-card-big-dest { font-size: 21px; font-weight: 900; line-height: 1.25; }
      .mtr-train-list { padding: 6px 10px; }
      .mtr-train-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 4px; border-bottom: 1px dashed #e2e8f0; }
      .mtr-train-row:last-child { border-bottom: none; }
      .mtr-train-row.tracked { background: #dbeafe; border-radius: 8px; padding: 9px 8px; }
      .mtr-train-left { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .mtr-seq-circle { width: 22px; height: 22px; border-radius: 50%; background: #f1f5f9; color: #334155; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .mtr-train-dest-tag { font-size: 14.5px; font-weight: 800; color: #0f172a; }
      .mtr-train-dest-tag.branch-a { padding: 2px 8px; border-radius: 6px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
      .mtr-train-dest-tag.branch-b { padding: 2px 8px; border-radius: 6px; background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
      .mtr-train-dest-tag.branch-short { padding: 2px 8px; border-radius: 6px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
      .mtr-plat-badge { font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 6px; border-radius: 5px; flex-shrink: 0; }
      .mtr-train-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .mtr-eta-text { text-align: right; font-size: 14px; font-weight: 800; color: #1565c0; }
      .mtr-eta-text.imminent { color: #d32f2f; }
      .mtr-eta-hhmm { display: block; font-size: 11px; font-weight: 600; color: #64748b; }

      /* 同巴士站 .stop-label 一致嘅 24x24px 圓形港鐵站地圖標記 */
      .mtr-map-pin {
        width: 24px !important; height: 24px !important; border-radius: 50%;
        color: #ffffff; font-size: 11px; font-weight: 900; line-height: 20px;
        border: 2px solid #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.45);
        display: flex; align-items: center; justify-content: center;
        text-shadow: 0 1px 2px rgba(0,0,0,0.45);
      }

      #mtr-dest-modal {
        display: none; position: fixed; inset: 0; z-index: 9800; background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px;
      }
      #mtr-dest-modal.active { display: flex; }
      .mtr-dest-dialog { width: 100%; max-width: 480px; max-height: 82vh; background: #ffffff; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.35); }
      .mtr-dest-header { padding: 12px 14px; background: #0f172a; color: #ffffff; display: flex; justify-content: space-between; align-items: center; }
      .mtr-dest-search { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
      #mtrDestSearchInput { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; outline: none; }
      #mtrDestStationList { flex: 1; overflow-y: auto; padding: 10px 12px; }
      .mtr-dest-color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; margin-bottom: 10px; }
      .mtr-dest-sta-btn { padding: 8px 6px; font-size: 13px; font-weight: 900; border-radius: 8px; border: none; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.45); margin: 0; cursor: pointer; text-align: center; }
    `;
    document.head.appendChild(style);
  }

  const headerBar = document.querySelector("#step1-section .route-header-bar");
  let btnOpen = document.getElementById("btnOpenP2PNav");
  if (!btnOpen && headerBar) {
    btnOpen = document.createElement("button");
    btnOpen.type = "button";
    btnOpen.id = "btnOpenP2PNav";
    btnOpen.style.cssText = "padding:5px 11px;font-size:12.5px;font-weight:800;border-radius:999px;background:#1565c0;color:#fff;border:none;margin:0;cursor:pointer;flex-shrink:0;";
    btnOpen.textContent = "🧭 點對點導航";
    headerBar.appendChild(btnOpen);
  }

  document.querySelectorAll("button").forEach(b => {
    if (b.id === "btnOpenP2PNav" || (b.textContent && b.textContent.includes("點對點導航"))) {
      b.onclick = (e) => { e.stopPropagation(); openP2PModal(); };
    }
  });

  if (!document.getElementById("p2p-nav-modal")) {
    const p2pModal = document.createElement("div");
    p2pModal.id = "p2p-nav-modal";
    p2pModal.innerHTML = `
      <div class="p2p-top-bar" id="p2pDragHeader">
        <div class="p2p-drag-pill"></div>
        <div class="p2p-top-row">
          <strong style="font-size:15px;">🧭 800m 點對點直達導航（巴士/小巴/港鐵）</strong>
          <div class="p2p-top-btns">
            <button type="button" class="btn-p2p-top" id="btnP2PMapToggle">🗺️ 睇地圖 ▼</button>
            <button type="button" class="btn-p2p-top" id="btnCloseP2P">✕ 關閉</button>
          </div>
        </div>
      </div>
      <div class="p2p-search-panel">
        <div class="p2p-input-row">
          <span class="p2p-label" style="color:#15803d;">🟢 出發</span>
          <div class="p2p-input-wrap">
            <input type="text" class="p2p-input" id="p2pOriginInput" placeholder="輸入屋苑、大廈、地標或車站..." autocomplete="off" />
            <div class="p2p-suggest-box" id="p2pOriginSuggest"></div>
          </div>
          <button type="button" class="p2p-mini-btn" id="btnP2PUseGps">📍 現時</button>
          <button type="button" class="p2p-mini-btn" id="btnP2PPickOrig">🗺️ 篤點</button>
        </div>
        <div class="p2p-input-row">
          <span class="p2p-label" style="color:#b91c1c;">🔴 終點</span>
          <div class="p2p-input-wrap">
            <input type="text" class="p2p-input" id="p2pDestInput" placeholder="輸入目的地（如：愉田苑、第一城、旺角）..." autocomplete="off" />
            <div class="p2p-suggest-box" id="p2pDestSuggest"></div>
          </div>
          <button type="button" class="p2p-mini-btn" id="btnP2PSwap">⇅ 對調</button>
          <button type="button" class="p2p-mini-btn" id="btnP2PPickDest">🗺️ 篤點</button>
        </div>
        <button type="button" class="p2p-go-btn" id="btnP2PSearchGo">🔍 搜尋 800m 內直達巴士 / 小巴 / 港鐵</button>
      </div>
      <div class="p2p-sort-bar">
        <button type="button" class="p2p-sort-btn active" data-sort="best">🌟 最佳選擇</button>
        <button type="button" class="p2p-sort-btn" data-sort="arrive">🏁 到達時間</button>
        <button type="button" class="p2p-sort-btn" data-sort="fare">💰 價錢</button>
        <button type="button" class="p2p-sort-btn" data-sort="board">🚌 上車時間</button>
        <button type="button" class="p2p-sort-btn" data-sort="walk">🚶 步行</button>
        <button type="button" id="p2pMtrToggleBtn">🚇 港鐵：開</button>
      </div>
      <div id="p2pStatusBar">請設定出發地及目的地，然後撳「搜尋」。</div>
      <div class="p2p-table-wrap">
        <table class="p2p-table">
          <thead>
            <tr>
              <th>路線</th>
              <th>上車站</th>
              <th class="p2p-desktop-only">下車站</th>
              <th class="p2p-desktop-only">步行</th>
              <th>價錢</th>
              <th>下班車</th>
              <th>預計到達時間</th>
            </tr>
          </thead>
          <tbody id="p2pResultsBody"></tbody>
        </table>
      </div>
    `;
    document.body.appendChild(p2pModal);
  }

  if (!document.getElementById("p2pMapPickBanner")) {
    const pickBanner = document.createElement("div");
    pickBanner.id = "p2pMapPickBanner";
    pickBanner.innerHTML = `<span id="p2pMapPickText">請喺地圖撳一下揀選位置</span><button type="button" id="btnCancelMapPick" style="padding:3px 9px;font-size:12px;border-radius:999px;background:#ef4444;color:#fff;border:none;margin:0;">取消</button>`;
    document.body.appendChild(pickBanner);
  }

  if (!document.getElementById("mtr-sheet")) {
    const mtrSheet = document.createElement("div");
    mtrSheet.id = "mtr-sheet";
    mtrSheet.className = "mtr-state-behind";
    mtrSheet.innerHTML = `
      <div id="mtr-sheet-header">
        <div class="mtr-pill"></div>
        <div class="mtr-header-row">
          <div class="mtr-header-brand">
            <span>🚇 港鐵實時到站</span>
            <span class="mtr-header-hint" id="mtrSheetHint">向上拉查看港鐵</span>
          </div>
          <div class="mtr-header-btns">
            <button type="button" class="btn-mtr-sheet-ctrl" id="btnMtrSheetStep">拉起 ▲</button>
            <button type="button" class="btn-mtr-sheet-ctrl" id="btnMtrHideToBack">收返後面 ▼</button>
          </div>
        </div>
      </div>
      <div id="mtr-sheet-body">
        <div class="mtr-station-picker-wrap">
          <button type="button" id="mtrStationColorBtn">
            <span id="mtrStationBtnLabel">揀選港鐵站</span>
            <span class="mtr-sta-btn-dist" id="mtrStationBtnDist">▼</span>
          </button>
          <button type="button" class="btn-mtr-nearest" id="btnMtrNearest">📍 最近站</button>
        </div>
        <div id="mtrColorDropdownPanel">
          <input type="text" id="mtrStaFilterInput" placeholder="輸入港鐵站名快速搜尋..." />
          <div id="mtrColorStaListInner"></div>
        </div>
        <div id="mtrWalkInfoBox"></div>
        <div id="mtrSwipeChips"></div>
        <div class="mtr-swipe-hint" id="mtrSwipeHint">👈 左右滑動更換方向及線路 👉</div>
        <div id="mtrCardsContainer"></div>
      </div>
    `;
    document.body.appendChild(mtrSheet);
  }

  if (!document.getElementById("mtr-dest-modal")) {
    const destModal = document.createElement("div");
    destModal.id = "mtr-dest-modal";
    destModal.innerHTML = `
      <div class="mtr-dest-dialog">
        <div class="mtr-dest-header">
          <strong id="mtrDestModalTitle" style="font-size:15px;">🚇 你想去邊個港鐵站？</strong>
          <button type="button" id="btnCloseMtrDestModal" style="background:transparent;border:none;color:#cbd5e1;font-size:18px;padding:0 4px;margin:0;">✕</button>
        </div>
        <div class="mtr-dest-search">
          <input type="text" id="mtrDestSearchInput" placeholder="輸入港鐵站名篩選（例如：第一城、金鐘、羅湖）..." />
        </div>
        <div id="mtrDestStationList"></div>
      </div>
    `;
    document.body.appendChild(destModal);
  }
})();


/* ---------- Part D：零封鎖香港地點搜尋（0ms 本地 6000 站 + 政府 OGCIO ALS API + 中文組字保護） ---------- */

function setP2PModalSheetState(st) {
  const modal = document.getElementById("p2p-nav-modal");
  const btn = document.getElementById("btnP2PMapToggle");
  if (!modal) return;
  p2pModalSheetState = st;
  modal.classList.remove("p2p-sheet-peek", "p2p-sheet-min");
  if (st === "peek") modal.classList.add("p2p-sheet-peek");
  else if (st === "min") modal.classList.add("p2p-sheet-min");
  if (btn) btn.textContent = st === "full" ? "🗺️ 睇地圖 ▼" : "🔼 展開列表";
  focusP2PPinsInExposedMap();
}

function focusP2PPinsInExposedMap() {
  if (!map) return;
  const pts = [];
  if (p2pOrigin) pts.push([p2pOrigin.lat, p2pOrigin.lon]);
  if (p2pDest) pts.push([p2pDest.lat, p2pDest.lon]);
  if (!pts.length) return;
  const bottomPad = p2pModalSheetState === "full"
    ? Math.round(window.innerHeight * 0.88)
    : p2pModalSheetState === "peek"
      ? Math.round(window.innerHeight * 0.44)
      : 90;
  if (pts.length === 1) map.setView(pts[0], 15);
  else map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: L.point(30, 20), paddingBottomRight: L.point(30, bottomPad), maxZoom: 15 });
}

function updateP2PMarkersOnMap() {
  if (!map) return;
  ["origin", "dest"].forEach(k => {
    if (p2pMarkers[k] && map.hasLayer(p2pMarkers[k])) { map.removeLayer(p2pMarkers[k]); p2pMarkers[k] = null; }
  });
  if (p2pOrigin) {
    const ic = L.divIcon({
      className: "",
      html: `<div style="background:#16a34a;color:#fff;font-weight:900;font-size:12px;padding:3px 8px;border-radius:999px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);white-space:nowrap;">🟢 起：${p2pOrigin.name}</div>`,
      iconSize: L.point(90, 26), iconAnchor: L.point(45, 13)
    });
    p2pMarkers.origin = L.marker([p2pOrigin.lat, p2pOrigin.lon], { icon: ic, zIndexOffset: 2600 }).addTo(map);
  }
  if (p2pDest) {
    const ic = L.divIcon({
      className: "",
      html: `<div style="background:#dc2626;color:#fff;font-weight:900;font-size:12px;padding:3px 8px;border-radius:999px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);white-space:nowrap;">🔴 終：${p2pDest.name}</div>`,
      iconSize: L.point(90, 26), iconAnchor: L.point(45, 13)
    });
    p2pMarkers.dest = L.marker([p2pDest.lat, p2pDest.lon], { icon: ic, zIndexOffset: 2600 }).addTo(map);
  }
  focusP2PPinsInExposedMap();
}

function openP2PModal() {
  const modal = document.getElementById("p2p-nav-modal");
  if (!modal) return;
  modal.classList.add("active");
  setP2PModalSheetState("full");
  ensureP2PFullRouteStopDatabase();

  const origInp = document.getElementById("p2pOriginInput");
  if (!p2pOrigin && userLat != null && userLon != null) {
    p2pOrigin = { lat: userLat, lon: userLon, name: "現時位置" };
    if (origInp) origInp.value = "📍 現時位置";
    updateP2PMarkersOnMap();
  } else if (!p2pOrigin) {
    requestSmartGeolocation(pos => {
      if (!p2pOrigin) {
        p2pOrigin = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "現時位置" };
        if (origInp) origInp.value = "📍 現時位置";
        updateP2PMarkersOnMap();
      }
    });
  } else {
    updateP2PMarkersOnMap();
  }
}

function closeP2PModal() {
  const modal = document.getElementById("p2p-nav-modal");
  if (modal) modal.classList.remove("active");
  p2pMapPickTarget = null;
  const banner = document.getElementById("p2pMapPickBanner");
  if (banner) banner.classList.remove("active");
  ["origin", "dest"].forEach(k => {
    if (p2pMarkers[k] && map && map.hasLayer(p2pMarkers[k])) { map.removeLayer(p2pMarkers[k]); p2pMarkers[k] = null; }
  });
}

function searchLocalHkStopsAndMtr(kw) {
  const kwLower = kw.toLowerCase();
  const list = [];
  const seen = new Set();

  Object.values(MTR_STATIONS).forEach(st => {
    if (st.tc.includes(kw) || st.en.toLowerCase().includes(kwLower)) {
      const key = `MTR_${st.tc}`;
      if (!seen.has(key)) {
        seen.add(key);
        const rank = st.tc === kw ? 0 : st.tc.startsWith(kw) ? 1 : 2;
        list.push({ name: `港鐵${st.tc}站`, address: "🚇 港鐵站", lat: st.lat, lon: st.lon, rank });
      }
    }
  });

  const addStopCandidate = (zhRaw, enRaw, lat, lon) => {
    const zh = stripBracketCode(zhRaw || "");
    const en = enRaw || "";
    if (!zh || !isFinite(lat) || !isFinite(lon)) return;
    if (zh.includes(kw) || en.toLowerCase().includes(kwLower)) {
      const key = `${zh}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const rank = zh === kw ? 0 : zh.startsWith(kw) ? 1 : 3;
      list.push({ name: zh, address: "🚏 巴士 / 小巴站位置", lat, lon, rank });
    }
  };

  if (p2pFullRouteDb && p2pFullRouteDb.stopList) {
    for (const sInfo of Object.values(p2pFullRouteDb.stopList)) {
      if (sInfo && sInfo.location && sInfo.name) {
        addStopCandidate(sInfo.name.zh, sInfo.name.en, parseFloat(sInfo.location.lat), parseFloat(sInfo.location.lng));
      }
    }
  } else if (allStopsMap && allStopsMap.size > 0) {
    allStopsMap.forEach(s => addStopCandidate(s.name_tc, s.name_en, parseFloat(s.lat), parseFloat(s.long)));
  }

  list.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length);
  return list.slice(0, 6);
}

async function searchOgcioOfficialAddress(kw, abortSignal) {
  if (p2pPlaceSearchCache.has(kw)) return p2pPlaceSearchCache.get(kw);
  const out = [];
  try {
    const res = await fetch(
      `https://www.als.ogcio.gov.hk/lookup?q=${encodeURIComponent(kw)}&n=8`,
      { headers: { "Accept": "application/json", "Accept-Language": "zh-Hant,en" }, signal: abortSignal }
    );
    if (res.ok) {
      const data = await res.json();
      const suggested = (data && data.SuggestedAddress) ? data.SuggestedAddress : [];
      const arr = Array.isArray(suggested) ? suggested : [suggested];
      const seen = new Set();

      arr.forEach(item => {
        const prem = item && item.Address && item.Address.PremisesAddress;
        if (!prem) return;
        const geoRaw = prem.GeospatialInformation;
        const geo = Array.isArray(geoRaw) ? geoRaw[0] : geoRaw;
        const lat = geo ? parseFloat(geo.Latitude) : NaN;
        const lon = geo ? parseFloat(geo.Longitude) : NaN;
        if (!isFinite(lat) || !isFinite(lon)) return;

        const chi = prem.ChiPremisesAddress || {};
        const eng = prem.EngPremisesAddress || {};
        const estateName = (chi.ChiEstate && chi.ChiEstate.EstateName) || "";
        const bldgName = chi.BuildingName || "";
        const streetObj = chi.ChiStreet || {};
        const streetStr = `${streetObj.StreetName || ""}${streetObj.BuildingNoFrom ? streetObj.BuildingNoFrom + "號" : ""}`;
        const engName = eng.BuildingName || (eng.EngEstate && eng.EngEstate.EstateName) || "";

        const title = (estateName && bldgName ? `${estateName} ${bldgName}` : (bldgName || estateName || streetStr || engName || kw)).trim();
        const sub = [chi.Region || "", estateName && streetStr ? streetStr : (engName || "")].filter(Boolean).join(" · ");
        const dedup = `${title}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
        if (!seen.has(dedup)) {
          seen.add(dedup);
          out.push({ name: title, address: sub || "📍 香港政府地址庫", lat, lon });
        }
      });
      p2pPlaceSearchCache.set(kw, out);
    }
  } catch (e) {}
  return out;
}

function renderPlaceSuggestDropdown(suggestEl, items, onPicked) {
  suggestEl.innerHTML = "";
  if (!items.length) {
    suggestEl.classList.remove("open");
    return;
  }
  items.slice(0, 8).forEach(p => {
    const row = document.createElement("div");
    row.className = "p2p-suggest-item";
    row.innerHTML = `<div style="font-weight:800;color:#0f172a;">${p.name}</div>${p.address ? `<div style="font-size:11px;color:#64748b;">${p.address}</div>` : ""}`;
    row.onclick = () => {
      suggestEl.classList.remove("open");
      onPicked(p);
    };
    suggestEl.appendChild(row);
  });
  suggestEl.classList.add("open");
}

function bindPlaceInputAutocomplete(inputId, suggestId, isOrigin) {
  const inputEl = document.getElementById(inputId);
  const suggestEl = document.getElementById(suggestId);
  if (!inputEl || !suggestEl) return;

  let composing = false;
  let timer = null;
  let activeCtrl = null;

  const pickItem = (p) => {
    inputEl.value = p.name;
    if (isOrigin) p2pOrigin = { lat: p.lat, lon: p.lon, name: p.name };
    else p2pDest = { lat: p.lat, lon: p.lon, name: p.name };
    updateP2PMarkersOnMap();
  };

  const triggerLookup = () => {
    if (composing) return;
    if (timer) clearTimeout(timer);
    if (activeCtrl) { try { activeCtrl.abort(); } catch (e) {} activeCtrl = null; }

    const val = inputEl.value.trim();
    if (!val || val.startsWith("📍") || val.startsWith("🗺️")) {
      suggestEl.classList.remove("open");
      return;
    }

    const localHits = searchLocalHkStopsAndMtr(val);
    if (localHits.length > 0) {
      renderPlaceSuggestDropdown(suggestEl, localHits, pickItem);
    }

    if (val.length < 2) return;
    timer = setTimeout(async () => {
      if (composing) return;
      const ctrl = new AbortController();
      activeCtrl = ctrl;
      const remoteHits = await searchOgcioOfficialAddress(val, ctrl.signal);
      if (ctrl.signal.aborted) return;

      const merged = [...localHits];
      const seenKeys = new Set(localHits.map(x => `${x.name}_${x.lat.toFixed(3)}`));
      remoteHits.forEach(r => {
        const k = `${r.name}_${r.lat.toFixed(3)}`;
        if (!seenKeys.has(k)) { seenKeys.add(k); merged.push(r); }
      });
      renderPlaceSuggestDropdown(suggestEl, merged, pickItem);
    }, 450);
  };

  inputEl.addEventListener("compositionstart", () => {
    composing = true;
    if (timer) clearTimeout(timer);
  });
  inputEl.addEventListener("compositionend", () => {
    composing = false;
    triggerLookup();
  });
  inputEl.addEventListener("input", (e) => {
    if (e.isComposing || composing) return;
    triggerLookup();
  });

  document.addEventListener("click", e => {
    if (!inputEl.contains(e.target) && !suggestEl.contains(e.target)) suggestEl.classList.remove("open");
  });
}


/* ---------- Part E：800m 點對點路線搜尋（巴士 + 小巴 + 港鐵）與套用 ---------- */

async function buildMtrP2POptions(origPt, destPt) {
  if (!origPt || !destPt) return [];
  const nearOrig = [];
  const nearDest = [];

  Object.entries(MTR_STATIONS).forEach(([code, info]) => {
    const dO = haversineDistanceMeters(origPt.lat, origPt.lon, info.lat, info.lon);
    const dD = haversineDistanceMeters(destPt.lat, destPt.lon, info.lat, info.lon);
    if (dO <= 1000) nearOrig.push({ code, info, dist: Math.round(dO) });
    if (dD <= 1000) nearDest.push({ code, info, dist: Math.round(dD) });
  });

  if (!nearOrig.length || !nearDest.length) return [];
  nearOrig.sort((a, b) => a.dist - b.dist);
  nearDest.sort((a, b) => a.dist - b.dist);

  const oSta = nearOrig[0];
  const dSta = nearDest[0];
  if (oSta.code === dSta.code) return [];

  const plan = computeGeneralMtrShortestRoute(oSta.code, dSta.code);
  if (!plan || !plan.legs || !plan.legs.length) return [];

  const firstLeg = plan.legs[0];
  const lineCode = firstLeg.line;
  const lineMeta = MTR_LINES[lineCode] || { name: "港鐵", shortName: "港鐵", color: "#be123c", stations: [] };

  let needDir = "UP";
  const stArr = lineMeta.stations || [];
  const idxFrom = stArr.indexOf(firstLeg.from);
  const idxNext = stArr.indexOf(firstLeg.secondSta || firstLeg.to);
  if (idxFrom >= 0 && idxNext >= 0) {
    if (lineCode === "DRL") needDir = firstLeg.to === "SUN" ? "UP" : "DOWN";
    else needDir = idxNext > idxFrom ? "UP" : "DOWN";
  }

  const walkOrigMin = Math.max(1, Math.round(calcWalkMinutes15x(oSta.dist)));
  const walkDestMin = Math.max(1, Math.round(calcWalkMinutes15x(dSta.dist)));
  const fareVal = getMtrAdultFare(oSta.code, dSta.code, lineCode);

  let boardEtaDate = null;
  let waitDisplayMin = null;
  let trainDestCode = firstLeg.to;
  let trainPlat = "1";
  let viaRac = false;

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`${MTR_SCHEDULE_API}?line=${lineCode}&sta=${oSta.code}&_=${Date.now()}`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (res.ok) {
      const json = await res.json();
      const key = `${lineCode}-${oSta.code}`;
      const rawTrains = (json && json.data && json.data[key] && json.data[key][needDir]) ? json.data[key][needDir] : [];
      const nowMs = Date.now();
      const onReachChain = new Set(getTrainVisitedPathOnLine(lineCode, firstLeg.from, firstLeg.to, false).map(x => x.sta));

      const validTrains = rawTrains
        .filter(t => t && t.dest && resolveMtrCode(t.dest) !== oSta.code)
        .map(t => {
          const d = t.time && t.time !== "-" ? new Date(String(t.time).trim().replace(" ", "T") + "+08:00") : null;
          const dc = resolveMtrCode(t.dest);
          const minLeft = d && !isNaN(d.getTime()) ? Math.max(0, Math.round((d.getTime() - nowMs) / 60000)) : parseInt(t.ttnt || "0", 10);
          return { d: d || new Date(nowMs + minLeft * 60000), minLeft, destCode: dc, plat: t.plat || "1", viaRac: t.route === "RAC" };
        })
        .filter(t => {
          const pathSet = new Set(getTrainVisitedPathOnLine(lineCode, oSta.code, t.destCode, t.viaRac).map(x => x.sta));
          return pathSet.has(firstLeg.to) || (firstLeg.secondSta && onReachChain.size > 1 && pathSet.has(firstLeg.secondSta));
        })
        .sort((a, b) => a.d - b.d);

      if (validTrains.length > 0) {
        const catchable = validTrains.find(t => t.minLeft >= Math.max(0, walkOrigMin - 1)) || validTrains[validTrains.length - 1];
        boardEtaDate = catchable.d;
        waitDisplayMin = catchable.minLeft;
        trainDestCode = catchable.destCode;
        trainPlat = catchable.plat;
        viaRac = catchable.viaRac;
      }
    }
  } catch (e) {}

  if (!boardEtaDate) {
    waitDisplayMin = Math.max(3, walkOrigMin + 2);
    boardEtaDate = new Date(Date.now() + waitDisplayMin * 60000);
  }

  const rideMin = plan.totalRideMin;
  const totalArriveDate = new Date(boardEtaDate.getTime() + (rideMin + walkDestMin) * 60000);
  const lineChainStr = plan.legs.map(l => (MTR_LINES[l.line] ? MTR_LINES[l.line].shortName : l.line)).join("➔");
  const transferNote = plan.transfers.length > 0 ? `轉${getMtrStationName(plan.transfers[0].atSta)}` : "港鐵直達";

  return [{
    isMtr: true,
    routeCode: plan.legs.length > 1 ? lineChainStr : lineMeta.name,
    coKey: "mtr",
    coLabel: transferNote,
    mtrColor: lineMeta.color,
    destText: `${dSta.info.tc}站`,
    boardStopId: `MTR_${oSta.code}`,
    boardStopName: `港鐵${oSta.info.tc}站`,
    boardSeq: 1,
    alightStopId: `MTR_${dSta.code}`,
    alightStopName: `港鐵${dSta.info.tc}站`,
    origDistM: oSta.dist,
    destDistM: dSta.dist,
    walkOrigMin,
    walkDestMin,
    totalWalkMin: walkOrigMin + walkDestMin,
    rideMin,
    fare: fareVal,
    nextEtaDate: boardEtaDate,
    nextWaitMin: waitDisplayMin,
    estArriveDate: totalArriveDate,
    hasLiveEta: true,
    isHereStop: oSta.dist <= 120,
    mtrPayload: {
      originSta: oSta.code, destSta: dSta.code, boardLine: lineCode, dirKey: needDir,
      trainDestCode, trainDestName: getMtrStationName(trainDestCode), plat: trainPlat, viaRac, boardEtaDate
    }
  }];
}

async function runP2P800mSearch() {
  const statusEl = document.getElementById("p2pStatusBar");
  const tbody = document.getElementById("p2pResultsBody");
  if (!p2pOrigin || !p2pDest) {
    showToast("⚠️ 請先揀選出發地同終點（打字揀建議或喺地圖篤點）");
    return;
  }

  if (statusEl) statusEl.textContent = "⏳ 正在掃描 800m 內直達巴士、小巴及港鐵...";
  if (tbody) tbody.innerHTML = "";

  const db = await ensureP2PFullRouteStopDatabase();
  if (!db || !db.routeList || !db.stopList) {
    if (statusEl) statusEl.textContent = "❌ 無法載入全港站點資料庫，請檢查網絡。";
    return;
  }

  const nearOrigStops = new Map();
  const nearDestStops = new Map();
  for (const [sid, sInfo] of Object.entries(db.stopList)) {
    if (!sInfo || !sInfo.location) continue;
    const lat = parseFloat(sInfo.location.lat), lon = parseFloat(sInfo.location.lng);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const dO = haversineDistanceMeters(p2pOrigin.lat, p2pOrigin.lon, lat, lon);
    const dD = haversineDistanceMeters(p2pDest.lat, p2pDest.lon, lat, lon);
    const nameZh = stripBracketCode((sInfo.name && sInfo.name.zh) || sid);
    if (dO <= P2P_RADIUS_METERS) nearOrigStops.set(sid, { sid, name: nameZh, dist: Math.round(dO), lat, lon });
    if (dD <= P2P_RADIUS_METERS) nearDestStops.set(sid, { sid, name: nameZh, dist: Math.round(dD), lat, lon });
  }

  let minOrigStopDist = Infinity;
  nearOrigStops.forEach(v => { if (v.dist < minOrigStopDist) minOrigStopDist = v.dist; });
  const activeBoardName = originStopId && allStopsMap.get(originStopId)
    ? normalizeStopName(allStopsMap.get(originStopId).name_tc)
    : "";

  const variantGroups = new Map();

  for (const rEntry of Object.values(db.routeList)) {
    if (!rEntry || !rEntry.stops) continue;
    const rCode = String(rEntry.route || "").toUpperCase();
    const cos = rEntry.co || [];
    const coMain = cos.includes("kmb") ? "kmb" : cos.includes("ctb") ? "ctb" : cos.includes("gmb") ? "gmb" : null;
    if (!coMain) continue;

    const stopArr = rEntry.stops[coMain] || [];
    if (stopArr.length < 2) continue;

    let bestBoardIdx = -1, bestBoardDist = Infinity;
    for (let i = 0; i < stopArr.length - 1; i++) {
      const oMatch = nearOrigStops.get(stopArr[i]);
      if (oMatch && oMatch.dist < bestBoardDist) { bestBoardDist = oMatch.dist; bestBoardIdx = i; }
    }
    if (bestBoardIdx < 0) continue;

    let bestAlightIdx = -1, bestAlightDist = Infinity;
    for (let j = bestBoardIdx + 1; j < stopArr.length; j++) {
      const dMatch = nearDestStops.get(stopArr[j]);
      if (dMatch && dMatch.dist < bestAlightDist) { bestAlightDist = dMatch.dist; bestAlightIdx = j; }
    }
    if (bestAlightIdx <= bestBoardIdx) continue;

    const bStop = nearOrigStops.get(stopArr[bestBoardIdx]);
    const aStop = nearDestStops.get(stopArr[bestAlightIdx]);
    const origToDestBoard = haversineDistanceMeters(bStop.lat, bStop.lon, p2pDest.lat, p2pDest.lon);
    if (aStop.dist >= origToDestBoard - 60) continue;

    let accDist = 0, accRideMin = 0;
    for (let k = bestBoardIdx + 1; k <= bestAlightIdx; k++) {
      const s1 = db.stopList[stopArr[k - 1]], s2 = db.stopList[stopArr[k]];
      if (s1 && s2 && s1.location && s2.location) {
        const seg = haversineDistanceMeters(s1.location.lat, s1.location.lng, s2.location.lat, s2.location.lng);
        accDist += seg;
        const vKmH = getSegmentEffectiveSpeedKmH(seg, new Date());
        accRideMin += (((seg * 1.25) / 1000) / Math.max(8, vKmH)) * 60 + 0.55;
      } else {
        accRideMin += 2.2;
      }
    }

    const faresArr = rEntry.fares || [];
    const fareVal = faresArr.length > 0 ? parseFloat(faresArr[Math.min(bestBoardIdx, faresArr.length - 1)]) : NaN;
    const walkOrigMin = Math.max(1, Math.round(calcWalkMinutes15x(bStop.dist)));
    const walkDestMin = Math.max(1, Math.round(calcWalkMinutes15x(aStop.dist)));
    const destZh = stripBracketCode((rEntry.dest && rEntry.dest.zh) || "");
    const origZh = stripBracketCode((rEntry.orig && rEntry.orig.zh) || "");

    const isJoint = cos.includes("kmb") && cos.includes("ctb");
    const coLabel = isJoint ? "九巴/城巴" : coMain === "kmb" ? "九巴" : coMain === "ctb" ? "城巴" : "專線小巴";
    const groupKey = coMain === "gmb" ? `GMB_${rCode}_${rEntry.gtfsId || destZh}` : `BUS_${rCode}`;

    const isHereStop = (activeBoardName && normalizeStopName(bStop.name) === activeBoardName) || (bStop.dist <= Math.max(95, minOrigStopDist + 35));

    const cand = {
      isMtr: false,
      groupKey,
      routeCode: rCode,
      coKey: isJoint ? "joint" : coMain,
      coMain,
      coLabel,
      serviceType: String(rEntry.serviceType || "1"),
      gtfsId: rEntry.gtfsId || "",
      origText: origZh,
      destText: destZh,
      boardStopId: bStop.sid,
      boardStopName: bStop.name,
      boardSeq: bestBoardIdx + 1,
      alightStopId: aStop.sid,
      alightStopName: aStop.name,
      origDistM: bStop.dist,
      destDistM: aStop.dist,
      walkOrigMin,
      walkDestMin,
      totalWalkMin: walkOrigMin + walkDestMin,
      rideMin: Math.max(2, Math.round(accRideMin)),
      fare: isFinite(fareVal) ? fareVal : 0,
      nextEtaDate: null,
      nextWaitMin: Infinity,
      estArriveDate: null,
      hasLiveEta: false,
      isHereStop
    };

    if (!variantGroups.has(groupKey)) variantGroups.set(groupKey, []);
    variantGroups.get(groupKey).push(cand);
  }

  const allCandidates = [];
  variantGroups.forEach(arr => allCandidates.push(...arr));

  const mtrCandidates = await buildMtrP2POptions(p2pOrigin, p2pDest);

  p2pResults = [
    ...Array.from(variantGroups.values()).map(arr => arr[0]),
    ...mtrCandidates
  ];
  renderP2PResultsTable();

  const kmbStopIds = Array.from(new Set(allCandidates.filter(c => c.coMain === "kmb").map(c => c.boardStopId)));
  const kmbStopEtaCache = new Map();

  await Promise.all(kmbStopIds.map(async sid => {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(`${KMB_BASE}/stop-eta/${sid}`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) {
        const j = await r.json();
        kmbStopEtaCache.set(sid, j.data || []);
      }
    } catch (e) {}
  }));

  const otherCands = allCandidates.filter(c => c.coMain !== "kmb");
  await Promise.all(otherCands.map(async c => {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 2800);
      if (c.coMain === "ctb") {
        const r = await fetch(`${CTB_BASE}/eta/ctb/${c.boardStopId}/${c.routeCode}`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (r.ok) {
          const j = await r.json();
          const list = (j.data || []).filter(it => it.eta && !String(it.rmk_tc || "").includes("時段") && (!c.destText || String(it.dest_tc || "").includes(c.destText.substring(0, 2))));
          applyLiveEtasToP2PCand(c, list.map(x => new Date(x.eta)));
        }
      } else if (c.coMain === "gmb" && c.gtfsId) {
        const r = await fetch(`${GMB_BASE}/eta/route-stop/${c.gtfsId}/${c.boardStopId}`, { credentials: "omit", signal: ctrl.signal });
        clearTimeout(tid);
        if (r.ok) {
          const j = await r.json();
          const groups = Array.isArray(j.data) ? j.data : (j.data ? [j.data] : []);
          const times = [];
          groups.forEach(g => (g.eta || []).forEach(it => { if (it.timestamp) times.push(new Date(it.timestamp)); }));
          applyLiveEtasToP2PCand(c, times);
        }
      }
    } catch (e) {}
  }));

  allCandidates.filter(c => c.coMain === "kmb").forEach(c => {
    const raw = kmbStopEtaCache.get(c.boardStopId) || [];
    const matched = raw.filter(it =>
      String(it.route || "").toUpperCase() === c.routeCode &&
      it.eta &&
      !String(it.rmk_tc || "").includes("時段") &&
      (!c.destText || String(it.dest_tc || "").includes(c.destText.substring(0, 2)))
    );
    applyLiveEtasToP2PCand(c, matched.map(x => new Date(x.eta)));
  });

  const mergedBusResults = [];
  variantGroups.forEach(arr => {
    arr.sort((a, b) => {
      if (a.hasLiveEta !== b.hasLiveEta) return a.hasLiveEta ? -1 : 1;
      if (a.hasLiveEta && b.hasLiveEta) return a.estArriveDate - b.estArriveDate;
      if ((a.serviceType === "1") !== (b.serviceType === "1")) return a.serviceType === "1" ? -1 : 1;
      return a.totalWalkMin - b.totalWalkMin;
    });
    mergedBusResults.push(arr[0]);
  });

  p2pResults = [...mergedBusResults, ...mtrCandidates];
  renderP2PResultsTable();
  if (statusEl) {
    const activeCount = p2pResults.filter(r => p2pIncludeMtr || !r.isMtr).length;
    statusEl.textContent = `✅ 共搵到 ${activeCount} 個 800m 直達方案（撳路線即自動設定及展開上車站）`;
  }
}

function applyLiveEtasToP2PCand(c, dateList) {
  const now = Date.now();
  const valid = (dateList || []).filter(d => d instanceof Date && !isNaN(d.getTime()) && (d.getTime() - now) >= -30000).sort((a, b) => a - b);
  if (!valid.length) return;
  const catchable = valid.find(d => Math.round((d.getTime() - now) / 60000) >= Math.max(0, c.walkOrigMin - 1)) || valid[valid.length - 1];
  c.nextEtaDate = catchable;
  c.nextWaitMin = Math.max(0, Math.round((catchable.getTime() - now) / 60000));
  c.estArriveDate = new Date(catchable.getTime() + (c.rideMin + c.walkDestMin) * 60000);
  c.hasLiveEta = true;
}

function sortP2PResultsList(list) {
  const nowMs = Date.now();
  return list.slice().sort((a, b) => {
    if (a.hasLiveEta !== b.hasLiveEta) return a.hasLiveEta ? -1 : 1;
    if (!a.hasLiveEta && !b.hasLiveEta) return a.totalWalkMin - b.totalWalkMin;

    if (p2pSortBy === "best") {
      if (Boolean(a.isHereStop) !== Boolean(b.isHereStop)) return a.isHereStop ? -1 : 1;
      const arrA = (a.estArriveDate.getTime() - nowMs) / 60000;
      const arrB = (b.estArriveDate.getTime() - nowMs) / 60000;
      const scoreA = arrA * 1.0 + a.totalWalkMin * 1.5 + a.nextWaitMin * 0.8 + (a.fare || 0) * 1.2;
      const scoreB = arrB * 1.0 + b.totalWalkMin * 1.5 + b.nextWaitMin * 0.8 + (b.fare || 0) * 1.2;
      return scoreA - scoreB;
    }
    if (p2pSortBy === "arrive") return a.estArriveDate - b.estArriveDate;
    if (p2pSortBy === "fare") return (a.fare || 999) - (b.fare || 999) || (a.estArriveDate - b.estArriveDate);
    if (p2pSortBy === "board") return a.nextWaitMin - b.nextWaitMin || (a.estArriveDate - b.estArriveDate);
    if (p2pSortBy === "walk") return a.totalWalkMin - b.totalWalkMin || (a.estArriveDate - b.estArriveDate);
    return 0;
  });
}

function renderP2PResultsTable() {
  const tbody = document.getElementById("p2pResultsBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filtered = p2pResults.filter(r => p2pIncludeMtr || !r.isMtr);
  const sorted = sortP2PResultsList(filtered);

  sorted.forEach(item => {
    const tr = document.createElement("tr");
    tr.className = "p2p-row" + (!item.hasLiveEta ? " p2p-row-no-eta" : "");

    const tagColor = item.isMtr
      ? item.mtrColor
      : item.coKey === "kmb" ? "#e53935" : item.coKey === "ctb" ? "#eab308" : item.coKey === "gmb" ? "#16a34a" : "#f97316";

    const etaStr = item.hasLiveEta
      ? (item.nextWaitMin <= 0 ? `<span style="color:#d32f2f;font-weight:900;">即將到達</span>` : `<span style="font-weight:800;color:#1565c0;">${item.nextWaitMin}分鐘</span>`)
      : `<span style="color:#94a3b8;font-weight:700;">暫無班次</span>`;

    const totalTripMin = item.hasLiveEta ? Math.max(1, Math.round((item.estArriveDate.getTime() - Date.now()) / 60000)) : (item.walkOrigMin + item.rideMin + item.walkDestMin);
    const arriveHtml = item.hasLiveEta
      ? `<div style="font-size:14.5px;font-weight:900;color:#0f172a;">${formatTimeHHMM(item.estArriveDate)}</div><div style="font-size:10.5px;color:#64748b;">全程${totalTripMin}分 (車程${item.rideMin}分)</div>`
      : `<div style="font-size:13px;font-weight:700;color:#94a3b8;">--:--</div><div style="font-size:10.5px;color:#94a3b8;">車程約${item.rideMin}分</div>`;

    const fareStr = item.fare > 0 ? `$${Number(item.fare.toFixed(1))}` : "--";
    const hereBadge = item.isHereStop ? `<span class="p2p-here-tag">現時站</span>` : "";

    tr.innerHTML = `
      <td style="border-left:5px solid ${tagColor};padding-left:7px;">
        <div style="font-size:15px;font-weight:900;color:#0f172a;">${item.isMtr ? "🚇 " : ""}${item.routeCode}</div>
        <div style="font-size:11px;font-weight:700;color:#334155;">往${item.destText}</div>
        <div style="font-size:10.5px;font-weight:700;color:#64748b;">${item.coLabel}</div>
      </td>
      <td>
        <div style="font-weight:800;color:#0f172a;">${item.boardStopName}${hereBadge}</div>
        <div style="font-size:11px;color:#64748b;">${item.origDistM} m (步${item.walkOrigMin}分)</div>
      </td>
      <td class="p2p-desktop-only">
        <div style="font-weight:700;color:#334155;">${item.alightStopName}</div>
        <div style="font-size:11px;color:#64748b;">${item.destDistM} m</div>
      </td>
      <td class="p2p-desktop-only" style="font-weight:700;color:#475569;">共 ${item.totalWalkMin} 分</td>
      <td style="font-weight:900;color:#0f766e;font-size:13.5px;">${fareStr}</td>
      <td>${etaStr}</td>
      <td>${arriveHtml}</td>
    `;

    tr.onclick = () => applyP2PSelectedRoute(item);
    tbody.appendChild(tr);
  });
}

const _origOnStopClickedGuard = onStopClicked;
onStopClicked = function (stopId, seq) {
  if (p2pApplyingLock) return;
  return _origOnStopClickedGuard(stopId, seq);
};

async function applyP2PSelectedRoute(item) {
  closeP2PModal();

  if (item.isMtr && item.mtrPayload) {
    const mp = item.mtrPayload;
    mtrSelectedSta = mp.originSta;
    setMtrSheetState("half");
    await selectMtrStation(mp.originSta, true);
    mtrPendingTrackTrain = {
      originSta: mp.originSta,
      boardLine: mp.boardLine,
      dirKey: mp.dirKey,
      trainDestCode: mp.trainDestCode,
      trainDestName: mp.trainDestName,
      plat: mp.plat,
      viaRac: mp.viaRac,
      etaDate: mp.boardEtaDate
    };
    startMtrTripTrackingToDest(mp.destSta);
    return;
  }

  if (mtrSheetState !== "behind") setMtrSheetState("behind");
  setBottomSheetState("half");

  let matchedRoute = uniqueRoutes.find(r => {
    if (r.route.toUpperCase() !== item.routeCode) return false;
    if (item.coMain === "gmb") return isGmbCompany(r.company);
    if (item.coMain === "ctb") return r.company === "CTB";
    return r.company === "KMB" && String(r.service_type || "1") === item.serviceType;
  }) || uniqueRoutes.find(r => r.route.toUpperCase() === item.routeCode);

  if (!matchedRoute) {
    showToast("⚠️ 找不到對應路線資料");
    return;
  }

  p2pApplyingLock = true;
  try {
    await selectRoute(matchedRoute);

    const btnIn = document.getElementById("dirInbound");
    const btnOut = document.getElementById("dirOutbound");
    const destPrefix = (item.destText || "").substring(0, 2);

    let chosenDir = "outbound", chosenCode = "O";
    if (btnIn && !btnIn.disabled && btnIn.style.display !== "none" && destPrefix && btnIn.textContent.includes(destPrefix)) {
      chosenDir = "inbound"; chosenCode = "I";
    } else if (btnOut && !btnOut.disabled && btnOut.style.display !== "none" && destPrefix && btnOut.textContent.includes(destPrefix)) {
      chosenDir = "outbound"; chosenCode = "O";
    } else if (btnIn && !btnIn.disabled && (!btnOut || btnOut.disabled || btnOut.style.display === "none")) {
      chosenDir = "inbound"; chosenCode = "I";
    }

    currentDirection = chosenDir;
    currentDirectionCode = chosenCode;
    await loadRouteStopsForCurrentDirection();

    let targetStop = routeStops.find(s => String(s.stop_id).replace(/^GMB_/, "") === String(item.boardStopId).replace(/^GMB_/, ""))
                  || routeStops.find(s => normalizeStopName(s.name_tc) === normalizeStopName(item.boardStopName));

    if (!targetStop && routeStops.length === 0) {
      currentDirection = chosenDir === "inbound" ? "outbound" : "inbound";
      currentDirectionCode = chosenCode === "I" ? "O" : "I";
      await loadRouteStopsForCurrentDirection();
      targetStop = routeStops.find(s => normalizeStopName(s.name_tc) === normalizeStopName(item.boardStopName));
    }

    setTimeout(() => {
      p2pApplyingLock = false;
      if (targetStop) {
        _origOnStopClickedGuard(targetStop.stop_id, targetStop.seq);
        setTimeout(() => {
          const el = document.querySelector(`#stopList .stop-item[data-stop-id="${targetStop.stop_id}"][data-seq="${targetStop.seq}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 180);
      }
    }, 360);
  } catch (e) {
    p2pApplyingLock = false;
  }
}


/* ---------- Part F：港鐵獨立抽屜控制、全彩揀站、實時班次與追蹤 ---------- */

function syncMtrBehindOffset() {
  const mtrSheet = document.getElementById("mtr-sheet");
  if (!mtrSheet || window.innerWidth >= 768) return;
  let behindFormula = "calc(100% - 122px)";
  if (currentSheetState === "collapsed") behindFormula = "calc(100% - 122px)";
  else if (currentSheetState === "peek") behindFormula = "calc(var(--peek-offset, calc(100% - 210px)) - 4px)";
  else if (currentSheetState === "half") behindFormula = "calc(28% - 4px)";
  else if (currentSheetState === "full") behindFormula = "calc(100% - 122px)";
  mtrSheet.style.setProperty("--mtr-behind-y", behindFormula);
}

const _origSetBottomSheetForMtr = setBottomSheetState;
setBottomSheetState = function (state) {
  _origSetBottomSheetForMtr(state);
  syncMtrBehindOffset();
  if (window.innerWidth < 768 && (state === "half" || state === "full") && mtrSheetState !== "behind") {
    setMtrSheetState("behind");
  }
};

function setMtrSheetState(state) {
  const mtrSheet = document.getElementById("mtr-sheet");
  const btnStep = document.getElementById("btnMtrSheetStep");
  const hint = document.getElementById("mtrSheetHint");
  if (!mtrSheet) return;

  mtrSheetState = state;
  mtrSheet.classList.remove("mtr-state-behind", "mtr-state-peek", "mtr-state-half", "mtr-state-full");
  mtrSheet.classList.add(`mtr-state-${state}`);

  if (state === "behind") {
    mtrSheet.classList.remove("mtr-active");
    clearMtrMapGraphics();
    if (mtrRefreshTimer) { clearInterval(mtrRefreshTimer); mtrRefreshTimer = null; }
    if (btnStep) btnStep.textContent = "拉起 ▲";
    if (hint) hint.textContent = mtrSelectedSta ? `${getMtrStationName(mtrSelectedSta)}站` : "向上拉查看港鐵";
    syncMtrBehindOffset();
  } else {
    mtrSheet.classList.add("mtr-active");
    if (btnStep) btnStep.textContent = state === "full" ? "半開 ▼" : "全開 ▲";
    if (hint) hint.textContent = mtrSelectedSta ? `${getMtrStationName(mtrSelectedSta)}站 · 實時班次` : "請揀選港鐵站";

    if (!mtrSelectedSta) {
      if (userLat != null && userLon != null) {
        selectMtrStation(findNearestMtrStaCode(userLat, userLon), true);
      } else {
        selectMtrStation("TAW", false);
        requestSmartGeolocation(pos => selectMtrStation(findNearestMtrStaCode(pos.coords.latitude, pos.coords.longitude), true));
      }
    } else {
      loadMtrStationSchedule(mtrSelectedSta);
      plotMtrStationAndWalkOnMap(mtrSelectedSta, false);
    }

    if (mtrRefreshTimer) clearInterval(mtrRefreshTimer);
    mtrRefreshTimer = setInterval(() => {
      if (mtrSheetState !== "behind" && mtrSelectedSta) loadMtrStationSchedule(mtrSelectedSta);
    }, 20000);
  }
}

function findNearestMtrStaCode(lat, lon) {
  let best = "TAW", minD = Infinity;
  Object.entries(MTR_STATIONS).forEach(([code, info]) => {
    const d = haversineDistanceMeters(lat, lon, info.lat, info.lon);
    if (d < minD) { minD = d; best = code; }
  });
  return best;
}

function updateMtrColorBtnUI() {
  const btn = document.getElementById("mtrStationColorBtn");
  const lbl = document.getElementById("mtrStationBtnLabel");
  const distSpan = document.getElementById("mtrStationBtnDist");
  if (!btn || !lbl || !distSpan) return;
  const code = mtrSelectedSta || "TAW";
  const info = MTR_STATIONS[code];
  btn.style.background = getStationLineBackgroundCSS(code);
  lbl.textContent = `🚇 ${info ? info.tc : code}站`;
  if (userLat != null && userLon != null && info) {
    const d = Math.round(haversineDistanceMeters(userLat, userLon, info.lat, info.lon));
    distSpan.textContent = `${d >= 1000 ? (d / 1000).toFixed(1) + "km" : d + "m"} ▼`;
  } else {
    distSpan.textContent = "揀站 ▼";
  }
}

function renderMtrColorStationPicker(filterKw = "") {
  const inner = document.getElementById("mtrColorStaListInner");
  if (!inner) return;
  const kw = filterKw.trim().toLowerCase();
  inner.innerHTML = "";

  const makeStaBtn = (code, subLabel) => {
    const info = MTR_STATIONS[code];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mtr-color-sta-item" + (code === mtrSelectedSta ? " selected-sta" : "");
    b.style.background = getStationLineBackgroundCSS(code);
    b.innerHTML = `<span>${info.tc}</span>${subLabel ? `<span class="mtr-color-sta-sub">${subLabel}</span>` : ""}`;
    b.onclick = () => {
      mtrDropdownOpen = false;
      document.getElementById("mtrColorDropdownPanel").classList.remove("open");
      selectMtrStation(code, true);
    };
    return b;
  };

  if (userLat != null && userLon != null && !kw) {
    const grid = document.createElement("div");
    grid.className = "mtr-color-sta-grid";
    Object.entries(MTR_STATIONS)
      .map(([code, info]) => ({ code, dist: Math.round(haversineDistanceMeters(userLat, userLon, info.lat, info.lon)) }))
      .sort((a, b) => a.dist - b.dist)
      .forEach(({ code, dist }) => grid.appendChild(makeStaBtn(code, dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`)));
    inner.appendChild(grid);
  } else {
    Object.entries(MTR_LINES).forEach(([, lineObj]) => {
      const matched = lineObj.stations.filter(code => {
        if (!kw) return true;
        const st = MTR_STATIONS[code];
        return st && (st.tc.includes(kw) || st.en.toLowerCase().includes(kw) || code.toLowerCase().includes(kw));
      });
      if (!matched.length) return;
      const bar = document.createElement("div");
      bar.className = "mtr-line-color-divider";
      bar.style.background = lineObj.color;
      inner.appendChild(bar);
      const grid = document.createElement("div");
      grid.className = "mtr-color-sta-grid";
      matched.forEach(code => grid.appendChild(makeStaBtn(code, "")));
      inner.appendChild(grid);
    });
  }
}

async function selectMtrStation(staCode, focusMap = true) {
  if (!MTR_STATIONS[staCode]) return;
  mtrSelectedSta = staCode;
  mtrActiveCardIdx = 0;
  updateMtrColorBtnUI();
  const hint = document.getElementById("mtrSheetHint");
  if (hint) hint.textContent = `${getMtrStationName(staCode)}站 · 實時班次`;
  await loadMtrStationSchedule(staCode);
  if (mtrSheetState !== "behind") plotMtrStationAndWalkOnMap(staCode, focusMap);
}

function clearMtrMapGraphics() {
  if (mtrStationMarker && map && map.hasLayer(mtrStationMarker)) { map.removeLayer(mtrStationMarker); mtrStationMarker = null; }
  if (mtrWalkRouteLayer && map && map.hasLayer(mtrWalkRouteLayer)) { map.removeLayer(mtrWalkRouteLayer); mtrWalkRouteLayer = null; }
}

async function plotMtrStationAndWalkOnMap(staCode, centerMap = false) {
  clearMtrMapGraphics();
  const walkBox = document.getElementById("mtrWalkInfoBox");
  const st = MTR_STATIONS[staCode];
  if (!map || !st) return;

  // 24x24px 圓形標記（與巴士站 .stop-label 一致，唔會遮擋地圖）
  const pinIcon = L.divIcon({
    className: "",
    html: `<div class="mtr-map-pin" style="background:${getStationLineBackgroundCSS(staCode)};">鐵</div>`,
    iconSize: L.point(24, 24), iconAnchor: L.point(12, 12)
  });
  mtrStationMarker = L.marker([st.lat, st.lon], { icon: pinIcon, zIndexOffset: 2500 })
    .addTo(map)
    .bindPopup(`<b>🚇 港鐵${st.tc}站</b>`);
  if (centerMap) map.setView([st.lat, st.lon], 15);

  if (userLat == null || userLon == null) {
    mtrWalkDistMeters = null; mtrWalkMinutes = null;
    if (walkBox) walkBox.textContent = `📍 港鐵${st.tc}站已標示於地圖`;
    return;
  }

  const straightDist = haversineDistanceMeters(userLat, userLon, st.lat, st.lon);
  mtrWalkDistMeters = Math.round(straightDist * 1.2);
  mtrWalkMinutes = mtrWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(calcWalkMinutes15x(mtrWalkDistMeters)));
  if (walkBox) walkBox.textContent = `🚶 步行去「${st.tc}站」：仲有約 ${mtrWalkDistMeters} 米（約 ${mtrWalkMinutes} 分鐘到）`;

  if (straightDist >= 15 && straightDist < 15000) {
    try {
      const coordsStr = `${userLon.toFixed(6)},${userLat.toFixed(6)};${st.lon.toFixed(6)},${st.lat.toFixed(6)}`;
      const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes[0] && mtrSelectedSta === staCode && mtrSheetState !== "behind") {
          const r = data.routes[0];
          const coords = r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
          mtrWalkRouteLayer = L.polyline(coords, { color: "#be123c", weight: 5, dashArray: "6, 8", opacity: 0.9 }).addTo(map);
          mtrWalkDistMeters = Math.round(r.distance || straightDist);
          mtrWalkMinutes = mtrWalkDistMeters < 20 ? 0 : Math.max(1, Math.round(calcWalkMinutes15x(mtrWalkDistMeters)));
          if (walkBox) walkBox.textContent = `🚶 步行去「${st.tc}站」：仲有 ${mtrWalkDistMeters} 米（約 ${mtrWalkMinutes} 分鐘到）`;
        }
      }
    } catch (e) {}
  }
}

async function loadMtrStationSchedule(staCode) {
  const container = document.getElementById("mtrCardsContainer");
  const lines = MTR_STATION_LINES[staCode] || [];
  if (!container || !lines.length) return;
  if (!mtrCardsData.length) container.innerHTML = `<div style="padding:18px;text-align:center;color:#64748b;font-weight:700;">⏳ 正在載入港鐵實時到站時間...</div>`;

  const results = await Promise.all(lines.map(async lineCode => {
    try {
      const res = await fetch(`${MTR_SCHEDULE_API}?line=${lineCode}&sta=${staCode}&_=${Date.now()}`);
      if (!res.ok) return { lineCode, data: null };
      const json = await res.json();
      const key = `${lineCode}-${staCode}`;
      return { lineCode, data: (json && json.data && json.data[key]) ? json.data[key] : null };
    } catch (e) {
      return { lineCode, data: null };
    }
  }));

  const cards = [];
  const nowMs = Date.now();

  results.forEach(({ lineCode, data }) => {
    const lineMeta = MTR_LINES[lineCode];
    const dirMeta = MTR_DIRECTION_META[lineCode] || {};

    ["UP", "DOWN"].forEach(dirKey => {
      const dInfo = dirMeta[dirKey];
      if (!dInfo) return;
      const rawTrains = (data && Array.isArray(data[dirKey])) ? data[dirKey] : [];
      if (dInfo.terms.length === 1 && dInfo.terms[0] === staCode && rawTrains.length === 0) return;

      const validTrains = rawTrains
        .filter(t => t && t.dest)
        .map(t => {
          const etaDate = t.time && t.time !== "-" ? new Date(String(t.time).trim().replace(" ", "T") + "+08:00") : null;
          const destCode = resolveMtrCode(t.dest);
          const viaRac = t.route === "RAC";
          const etaMs = etaDate && !isNaN(etaDate.getTime()) ? etaDate.getTime() : (nowMs + (parseInt(t.ttnt || "0", 10) * 60000));
          const calcMin = Math.max(0, Math.round((etaMs - nowMs) / 60000));
          const ttnt = (t.ttnt != null && t.ttnt !== "" && !isNaN(parseInt(t.ttnt, 10))) ? Math.max(0, parseInt(t.ttnt, 10)) : calcMin;
          return { destCode, destName: getMtrStationName(destCode) + (viaRac ? " (經馬場)" : ""), viaRac, plat: t.plat || "1", ttnt, etaDate, etaMs };
        })
        .filter(t => t.destCode !== staCode && t.etaMs >= nowMs - 45000)
        .sort((a, b) => a.etaMs - b.etaMs);

      if (dInfo.terms.includes(staCode) && validTrains.length === 0) return;
      const uniqueDests = Array.from(new Set(validTrains.map(t => t.destName).filter(Boolean)));

      cards.push({
        lineCode, lineName: lineMeta.name, color: lineMeta.color, dirKey,
        headerDestText: uniqueDests.length > 0 ? uniqueDests.join(" / ") : dInfo.label,
        defaultTerms: dInfo.terms, hasMultiDest: uniqueDests.length > 1, trains: validTrains
      });
    });
  });

  mtrCardsData = cards;
  if (mtrActiveCardIdx >= mtrCardsData.length) mtrActiveCardIdx = 0;
  renderMtrDirectionCards();
}

function renderMtrDirectionCards() {
  const container = document.getElementById("mtrCardsContainer");
  const chipsWrap = document.getElementById("mtrSwipeChips");
  const swipeHint = document.getElementById("mtrSwipeHint");
  if (!container || !chipsWrap) return;

  container.innerHTML = "";
  chipsWrap.innerHTML = "";
  if (swipeHint) swipeHint.style.display = mtrCardsData.length > 1 ? "" : "none";

  mtrCardsData.forEach((card, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mtr-dir-chip" + (idx === mtrActiveCardIdx ? " active" : "");
    if (idx === mtrActiveCardIdx) chip.style.backgroundColor = card.color;
    chip.textContent = `${card.lineName} · 往${card.headerDestText}`;
    chip.onclick = () => { mtrActiveCardIdx = idx; renderMtrDirectionCards(); };
    chipsWrap.appendChild(chip);

    const cardEl = document.createElement("div");
    cardEl.className = "mtr-dir-card" + (idx !== mtrActiveCardIdx ? " mobile-hidden" : "");
    cardEl.innerHTML = `
      <div class="mtr-card-header" style="background:${card.color};">
        <div class="mtr-card-line-row">
          <span class="mtr-line-pill">${card.lineName}</span>
          <span>${getMtrStationName(mtrSelectedSta)}站</span>
        </div>
        <div class="mtr-card-big-dest">往 ${card.headerDestText}</div>
      </div>
    `;

    const listEl = document.createElement("div");
    listEl.className = "mtr-train-list";

    if (!card.trains.length) {
      listEl.innerHTML = `<div style="padding:14px 6px;color:#64748b;font-size:13px;">暫無實時班次資料</div>`;
    } else {
      card.trains.forEach((t, tIdx) => {
        const row = document.createElement("div");
        row.className = "mtr-train-row";
        if (mtrActiveTracking && mtrActiveTracking.originSta === mtrSelectedSta && mtrActiveTracking.boardLine === card.lineCode &&
            mtrActiveTracking.boardEtaDate && t.etaDate && Math.abs(t.etaDate - mtrActiveTracking.boardEtaDate) <= 90000) {
          row.classList.add("tracked");
        }

        let badgeClass = "";
        if (card.hasMultiDest || !card.defaultTerms.includes(t.destCode)) {
          if (t.destCode === "LMC" || t.destCode === "LHP") badgeClass = "branch-b";
          else if (card.defaultTerms.includes(t.destCode)) badgeClass = "branch-a";
          else badgeClass = "branch-short";
        }

        const etaLabel = t.ttnt <= 0 ? "即將到達" : `${t.ttnt} 分鐘`;
        const hhmm = t.etaDate ? formatTimeHHMM(t.etaDate) : "";

        row.innerHTML = `
          <div class="mtr-train-left">
            <span class="mtr-seq-circle">${tIdx + 1}</span>
            <span class="mtr-train-dest-tag ${badgeClass}">往 ${t.destName}</span>
            <span class="mtr-plat-badge">${t.plat}號月台</span>
          </div>
          <div class="mtr-train-right">
            <div class="mtr-eta-text ${t.ttnt <= 1 ? "imminent" : ""}">
              ${etaLabel}
              ${hhmm ? `<span class="mtr-eta-hhmm">${hhmm}</span>` : ""}
            </div>
          </div>
        `;

        const btnTrack = document.createElement("button");
        btnTrack.type = "button";
        btnTrack.className = "btn-track" + (row.classList.contains("tracked") ? " active" : "");
        btnTrack.textContent = "追蹤";
        btnTrack.onclick = e => {
          e.stopPropagation();
          openMtrDestinationModal({
            originSta: mtrSelectedSta,
            boardLine: card.lineCode,
            dirKey: card.dirKey,
            trainDestCode: t.destCode,
            trainDestName: t.destName,
            plat: t.plat,
            viaRac: t.viaRac,
            etaDate: t.etaDate || new Date(Date.now() + t.ttnt * 60000)
          });
        };
        row.querySelector(".mtr-train-right").appendChild(btnTrack);
        listEl.appendChild(row);
      });
    }

    cardEl.appendChild(listEl);
    container.appendChild(cardEl);
  });
}

function openMtrDestinationModal(trainInfo) {
  mtrPendingTrackTrain = trainInfo;
  const modal = document.getElementById("mtr-dest-modal");
  const title = document.getElementById("mtrDestModalTitle");
  const searchInp = document.getElementById("mtrDestSearchInput");
  if (!modal) return;
  if (title) title.textContent = `🚇 由「${getMtrStationName(trainInfo.originSta)}」去邊個站？`;
  if (searchInp) searchInp.value = "";
  renderMtrDestModalList("");
  modal.classList.add("active");
}

function renderMtrDestModalList(keyword = "") {
  const listWrap = document.getElementById("mtrDestStationList");
  if (!listWrap || !mtrPendingTrackTrain) return;
  listWrap.innerHTML = "";
  const kw = keyword.trim().toLowerCase();
  const orig = mtrPendingTrackTrain.originSta;
  const boardLine = mtrPendingTrackTrain.boardLine;
  const orderedLines = [boardLine, ...Object.keys(MTR_LINES).filter(l => l !== boardLine)];

  orderedLines.forEach(lCode => {
    const lObj = MTR_LINES[lCode];
    const matched = lObj.stations.filter(s => {
      if (s === orig) return false;
      if (!kw) return true;
      const st = MTR_STATIONS[s];
      return st && (st.tc.includes(kw) || st.en.toLowerCase().includes(kw) || s.toLowerCase().includes(kw));
    });
    if (!matched.length) return;
    const bar = document.createElement("div");
    bar.className = "mtr-line-color-divider";
    bar.style.background = lObj.color;
    listWrap.appendChild(bar);

    const grid = document.createElement("div");
    grid.className = "mtr-dest-color-grid";
    matched.forEach(staCode => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mtr-dest-sta-btn";
      b.style.background = getStationLineBackgroundCSS(staCode);
      b.textContent = getMtrStationName(staCode);
      b.onclick = () => startMtrTripTrackingToDest(staCode);
      grid.appendChild(b);
    });
    listWrap.appendChild(grid);
  });
}

function startMtrTripTrackingToDest(destStaCode) {
  const modal = document.getElementById("mtr-dest-modal");
  if (modal) modal.classList.remove("active");
  if (!mtrPendingTrackTrain) return;

  selectedEtaTime = null;
  stopPersistentTrackingNotification();

  const p = mtrPendingTrackTrain;
  const routePlan = computeMtrRouteFromTrackedTrain(p.originSta, p.boardLine, p.trainDestCode, destStaCode, p.viaRac);
  const adultFare = getMtrAdultFare(p.originSta, destStaCode, p.boardLine);

  mtrActiveTracking = {
    originSta: p.originSta, destSta: destStaCode, boardLine: p.boardLine, dirKey: p.dirKey,
    trainDestCode: p.trainDestCode, trainDestName: p.trainDestName, plat: p.plat, viaRac: p.viaRac,
    boardEtaDate: p.etaDate, routePlan, fare: adultFare
  };

  renderMtrDirectionCards();
  showToast(`🔔 已啟動港鐵追蹤：往 ${getMtrStationName(destStaCode)}`);
  updateMtrTrackingBannerAndNotification(true);
  loadMtrOfficialFares();
}

async function updateMtrTrackingBannerAndNotification(requestPerm = false) {
  const banner = document.getElementById("live-track-banner");
  if (!mtrActiveTracking) {
    if (banner && !selectedEtaTime) banner.classList.remove("active");
    return;
  }

  if (requestPerm && "Notification" in window && Notification.permission !== "granted") {
    try { await Notification.requestPermission(); } catch (e) {}
    startSilentAudioKeepAlive();
    startWorkerInterval(() => { if (mtrActiveTracking) updateMtrTrackingBannerAndNotification(false); }, 30000);
  }

  const trk = mtrActiveTracking;
  const origInfo = MTR_STATIONS[trk.originSta];
  const destName = getMtrStationName(trk.destSta);
  const lineMeta = MTR_LINES[trk.boardLine] || { name: trk.boardLine };

  try {
    const res = await fetch(`${MTR_SCHEDULE_API}?line=${trk.boardLine}&sta=${trk.originSta}&_=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      const key = `${trk.boardLine}-${trk.originSta}`;
      const list = (json && json.data && json.data[key] && json.data[key][trk.dirKey]) ? json.data[key][trk.dirKey] : [];
      let bestMatch = null, bestDiff = Infinity;
      list.forEach(item => {
        if (resolveMtrCode(item.dest) !== trk.trainDestCode) return;
        const d = item.time && item.time !== "-" ? new Date(String(item.time).trim().replace(" ", "T") + "+08:00") : null;
        if (!d || isNaN(d.getTime())) return;
        const diff = Math.abs(d.getTime() - trk.boardEtaDate.getTime());
        if (diff < bestDiff && diff <= 180000) { bestDiff = diff; bestMatch = d; }
      });
      if (bestMatch) trk.boardEtaDate = bestMatch;
    }
  } catch (e) {}

  trk.fare = getMtrAdultFare(trk.originSta, trk.destSta, trk.boardLine);
  const now = new Date();
  const waitMin = Math.round((trk.boardEtaDate - now) / 60000);
  if (waitMin < -1) { stopMtrTrackingAll(); return; }

  const rideMin = trk.routePlan ? trk.routePlan.totalRideMin : 10;
  const arriveDate = new Date(trk.boardEtaDate.getTime() + rideMin * 60000);
  const arriveHHMM = formatTimeHHMM(arriveDate);
  const boardHHMM = formatTimeHHMM(trk.boardEtaDate);

  let transferShort = "直達";
  if (trk.routePlan && trk.routePlan.oppositeDirWarn) {
    transferShort = "⚠️ 反方向列車";
  } else if (trk.routePlan && trk.routePlan.transfers && trk.routePlan.transfers.length > 0) {
    transferShort = trk.routePlan.transfers.map(tf => {
      const atName = getMtrStationName(tf.atSta);
      const toLineName = (MTR_LINES[tf.toLine] && MTR_LINES[tf.toLine].shortName) || tf.toLine;
      return tf.isWalk ? `${atName}行去${getMtrStationName(tf.toSta)}` : `${atName}轉${toLineName}`;
    }).join(" ➔ ");
  }

  const fareText = `$${Number(trk.fare.toFixed(1))}`;
  const etaCountdown = waitMin <= 0 ? `下班車：即將到達 (${boardHHMM})` : `下班車：${waitMin} 分鐘 (${boardHHMM})`;

  if (banner) {
    banner.classList.add("active");
    document.getElementById("ltbRoute").textContent = `🚇 ${lineMeta.name} (往${trk.trainDestName})`;
    document.getElementById("ltbStop").textContent = `${origInfo.tc} ➔ ${destName}（${transferShort}）`;
    document.getElementById("ltbEta").textContent = etaCountdown;
    document.getElementById("ltbWalkDist").textContent = `💰 ${fareText} ｜ 車程 ${rideMin} 分`;
    document.getElementById("ltbWalkTime").textContent = `預計 ${arriveHHMM} 到達`;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    const titleText = `🚇 ${lineMeta.name} (往${trk.trainDestName})`;
    const bodyLines = [
      `${origInfo.tc}站 (${trk.plat}號月台) ➔ ${destName}站`,
      `${etaCountdown} ｜ 預計 ${arriveHHMM} 到 (車程${rideMin}分)`,
      `八達通車費: ${fareText} ｜ ${transferShort}`,
      `座標: ${origInfo.lat.toFixed(6)}, ${origInfo.lon.toFixed(6)}`
    ];
    const badgeUrl = createCountdownBadgeIcon(Math.max(0, waitMin), lineMeta.shortName || "MTR", boardHHMM);
    const options = { body: bodyLines.join("\n"), icon: badgeUrl, tag: "bus-eta-tracker", renotify: false, requireInteraction: true };
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) { await reg.showNotification(titleText, options); return; }
      }
      activeBusNotification = new Notification(titleText, options);
    } catch (e) {}
  }
}

function stopMtrTrackingAll() {
  mtrActiveTracking = null;
  const banner = document.getElementById("live-track-banner");
  if (banner && !selectedEtaTime) banner.classList.remove("active");
  stopPersistentTrackingNotification();
  if (mtrSheetState !== "behind") renderMtrDirectionCards();
}


/* ---------- Part G：統一綁定所有手勢與按鈕事件 ---------- */

(function bindAllV7Events() {
  bindPlaceInputAutocomplete("p2pOriginInput", "p2pOriginSuggest", true);
  bindPlaceInputAutocomplete("p2pDestInput", "p2pDestSuggest", false);

  const btnCloseP2P = document.getElementById("btnCloseP2P");
  if (btnCloseP2P) btnCloseP2P.onclick = (e) => { e.stopPropagation(); closeP2PModal(); };

  const btnP2PMapToggle = document.getElementById("btnP2PMapToggle");
  if (btnP2PMapToggle) {
    btnP2PMapToggle.onclick = (e) => {
      e.stopPropagation();
      setP2PModalSheetState(p2pModalSheetState === "full" ? "peek" : "full");
    };
  }

  const p2pDragHeader = document.getElementById("p2pDragHeader");
  if (p2pDragHeader) {
    let sy = 0, dy = 0, drag = false;
    p2pDragHeader.addEventListener("touchstart", e => { sy = e.touches[0].clientY; dy = 0; drag = true; }, { passive: true });
    p2pDragHeader.addEventListener("touchmove", e => { if (drag) dy = e.touches[0].clientY - sy; }, { passive: true });
    p2pDragHeader.addEventListener("touchend", () => {
      if (!drag) return;
      drag = false;
      if (dy > 35) setP2PModalSheetState(p2pModalSheetState === "full" ? "peek" : "min");
      else if (dy < -35) setP2PModalSheetState(p2pModalSheetState === "min" ? "peek" : "full");
    });
  }

  const btnUseGps = document.getElementById("btnP2PUseGps");
  if (btnUseGps) {
    btnUseGps.onclick = () => {
      if (userLat != null && userLon != null) {
        p2pOrigin = { lat: userLat, lon: userLon, name: "現時位置" };
        document.getElementById("p2pOriginInput").value = "📍 現時位置";
        updateP2PMarkersOnMap();
      } else {
        requestSmartGeolocation(pos => {
          p2pOrigin = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "現時位置" };
          document.getElementById("p2pOriginInput").value = "📍 現時位置";
          updateP2PMarkersOnMap();
        }, () => showToast("⚠️ 無法取得定位，請打字搜尋或撳「篤點」"));
      }
    };
  }

  const btnSwap = document.getElementById("btnP2PSwap");
  if (btnSwap) {
    btnSwap.onclick = () => {
      const tmp = p2pOrigin; p2pOrigin = p2pDest; p2pDest = tmp;
      const oInp = document.getElementById("p2pOriginInput"), dInp = document.getElementById("p2pDestInput");
      const tv = oInp.value; oInp.value = dInp.value; dInp.value = tv;
      updateP2PMarkersOnMap();
    };
  }

  const startMapPick = (target) => {
    p2pMapPickTarget = target;
    document.getElementById("p2p-nav-modal").classList.remove("active");
    const banner = document.getElementById("p2pMapPickBanner");
    document.getElementById("p2pMapPickText").textContent = target === "origin" ? "🟢 請喺地圖撳一下揀選出發地" : "🔴 請喺地圖撳一下揀選終點";
    banner.classList.add("active");
  };

  const btnPickOrig = document.getElementById("btnP2PPickOrig");
  if (btnPickOrig) btnPickOrig.onclick = () => startMapPick("origin");
  const btnPickDest = document.getElementById("btnP2PPickDest");
  if (btnPickDest) btnPickDest.onclick = () => startMapPick("dest");

  const btnCancelPick = document.getElementById("btnCancelMapPick");
  if (btnCancelPick) {
    btnCancelPick.onclick = () => {
      p2pMapPickTarget = null;
      document.getElementById("p2pMapPickBanner").classList.remove("active");
      document.getElementById("p2p-nav-modal").classList.add("active");
    };
  }

  if (map) {
    map.on("click", e => {
      if (!p2pMapPickTarget) return;
      const { lat, lng } = e.latlng;
      const label = `🗺️ 地圖選點 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      if (p2pMapPickTarget === "origin") {
        p2pOrigin = { lat, lon: lng, name: "地圖起點" };
        document.getElementById("p2pOriginInput").value = label;
      } else {
        p2pDest = { lat, lon: lng, name: "地圖終點" };
        document.getElementById("p2pDestInput").value = label;
      }
      p2pMapPickTarget = null;
      document.getElementById("p2pMapPickBanner").classList.remove("active");
      document.getElementById("p2p-nav-modal").classList.add("active");
      updateP2PMarkersOnMap();
    });
  }

  const btnGo = document.getElementById("btnP2PSearchGo");
  if (btnGo) btnGo.onclick = () => runP2P800mSearch();

  document.querySelectorAll(".p2p-sort-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".p2p-sort-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      p2pSortBy = btn.dataset.sort;
      renderP2PResultsTable();
    };
  });

  const mtrToggle = document.getElementById("p2pMtrToggleBtn");
  if (mtrToggle) {
    mtrToggle.onclick = () => {
      p2pIncludeMtr = !p2pIncludeMtr;
      mtrToggle.textContent = p2pIncludeMtr ? "🚇 港鐵：開" : "🚇 港鐵：關";
      mtrToggle.classList.toggle("mtr-off", !p2pIncludeMtr);
      renderP2PResultsTable();
    };
  }

  // 港鐵獨立抽屜事件
  const mtrSheet = document.getElementById("mtr-sheet");
  const mtrHeader = document.getElementById("mtr-sheet-header");
  const btnStep = document.getElementById("btnMtrSheetStep");
  const btnBack = document.getElementById("btnMtrHideToBack");
  const busHeader = document.getElementById("sheet-header");

  if (busHeader) {
    busHeader.addEventListener("click", () => {
      if (window.innerWidth < 768 && mtrSheetState !== "behind") setMtrSheetState("behind");
    });
  }
  if (btnStep) {
    btnStep.onclick = e => {
      e.stopPropagation();
      if (mtrSheetState === "behind" || mtrSheetState === "peek") setMtrSheetState("half");
      else if (mtrSheetState === "half") setMtrSheetState("full");
      else setMtrSheetState("half");
    };
  }
  if (btnBack) btnBack.onclick = e => { e.stopPropagation(); setMtrSheetState("behind"); };

  if (mtrSheet && mtrHeader) {
    let startY = 0, deltaY = 0, dragging = false;
    const onStart = y => { startY = y; deltaY = 0; dragging = true; mtrSheet.classList.add("mtr-dragging"); };
    const onMove = y => { if (dragging) deltaY = y - startY; };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      mtrSheet.classList.remove("mtr-dragging");
      if (deltaY < -28) {
        if (mtrSheetState === "behind" || mtrSheetState === "peek") setMtrSheetState("half");
        else setMtrSheetState("full");
      } else if (deltaY > 28) {
        if (mtrSheetState === "full") setMtrSheetState("half");
        else if (mtrSheetState === "half") setMtrSheetState("peek");
        else setMtrSheetState("behind");
      } else if (Math.abs(deltaY) < 8 && mtrSheetState === "behind") {
        setMtrSheetState("half");
      }
    };
    mtrHeader.addEventListener("touchstart", e => onStart(e.touches[0].clientY), { passive: true });
    mtrHeader.addEventListener("touchmove", e => onMove(e.touches[0].clientY), { passive: true });
    mtrHeader.addEventListener("touchend", onEnd);
    mtrHeader.addEventListener("mousedown", e => onStart(e.clientY));
    window.addEventListener("mousemove", e => onMove(e.clientY));
    window.addEventListener("mouseup", onEnd);
  }

  const colorBtn = document.getElementById("mtrStationColorBtn");
  const dropPanel = document.getElementById("mtrColorDropdownPanel");
  const filterInp = document.getElementById("mtrStaFilterInput");
  if (colorBtn && dropPanel) {
    colorBtn.onclick = () => {
      mtrDropdownOpen = !mtrDropdownOpen;
      dropPanel.classList.toggle("open", mtrDropdownOpen);
      if (mtrDropdownOpen) { if (filterInp) filterInp.value = ""; renderMtrColorStationPicker(""); }
    };
  }
  if (filterInp) filterInp.addEventListener("input", () => renderMtrColorStationPicker(filterInp.value));

  const btnNearest = document.getElementById("btnMtrNearest");
  if (btnNearest) {
    btnNearest.onclick = () => {
      if (userLat != null && userLon != null) {
        const near = findNearestMtrStaCode(userLat, userLon);
        selectMtrStation(near, true);
        showToast(`📍 最近港鐵站：${getMtrStationName(near)}站`);
      } else {
        requestSmartGeolocation(pos => {
          const near = findNearestMtrStaCode(pos.coords.latitude, pos.coords.longitude);
          selectMtrStation(near, true);
          showToast(`📍 最近港鐵站：${getMtrStationName(near)}站`);
        }, () => showToast("⚠️ 本地檔案無法使用定位，請直接撳站名揀站"));
      }
    };
  }

  const cardsWrap = document.getElementById("mtrCardsContainer");
  if (cardsWrap) {
    let sx = 0, sy = 0;
    cardsWrap.addEventListener("touchstart", e => {
      if (e.touches && e.touches.length) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
    }, { passive: true });
    cardsWrap.addEventListener("touchend", e => {
      if (window.innerWidth >= 768 || mtrCardsData.length <= 1 || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        mtrActiveCardIdx = dx < 0 ? (mtrActiveCardIdx + 1) % mtrCardsData.length : (mtrActiveCardIdx - 1 + mtrCardsData.length) % mtrCardsData.length;
        renderMtrDirectionCards();
      }
    }, { passive: true });
  }

  const btnCloseDest = document.getElementById("btnCloseMtrDestModal");
  if (btnCloseDest) btnCloseDest.onclick = () => document.getElementById("mtr-dest-modal").classList.remove("active");
  const destInp = document.getElementById("mtrDestSearchInput");
  if (destInp) destInp.addEventListener("input", () => renderMtrDestModalList(destInp.value));

  const ltbClose = document.getElementById("ltbCloseBtn");
  if (ltbClose) {
    ltbClose.onclick = () => {
      if (mtrActiveTracking) stopMtrTrackingAll();
      selectedEtaTime = null;
      stopPersistentTrackingNotification();
      document.getElementById("live-track-banner").classList.remove("active");
    };
  }

  syncMtrBehindOffset();
  updateMtrColorBtnUI();
  ensureP2PFullRouteStopDatabase();
  loadMtrOfficialFares();
})();
