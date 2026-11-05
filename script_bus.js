// KMB 固定 KMB_BASE（之後城巴會用另一組 URL）
const KMB_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const CTB_BASE = "https://rt.data.gov.hk/v2/transport/citybus";


// 定義好兩間公司嘅 Base URL
const API_BASE = {
  KMB: "https://data.etabus.gov.hk/v1/transport/kmb",
  CTB: "https://rt.data.gov.hk/v2/transport/citybus"
};

const BusAPI = {
  // 1. 攞路線資料 (通常用嚟搵起訖點同方向)
  getRoute: async (company, route) => {
    const url = company === "KMB" 
      ? `${API_BASE.KMB}/route/${route}` 
      : `${API_BASE.CTB}/route/ctb/${route}`;
    return await fetchJSON(url);
  },

  // 2. 攞路線車站名單 (Stop List)
  // dir 通常係 "inbound" 或 "outbound"
  getRouteStops: async (company, route, dir, serviceType = "1") => {
    const url = company === "KMB"
      ? `${API_BASE.KMB}/route-stop/${route}/${dir}/${serviceType}`
      : `${API_BASE.CTB}/route-stop/ctb/${route}/${dir}`; // 城巴無 serviceType
    return await fetchJSON(url);
  },

  // 3. 攞單一車站詳情 (用嚟攞車站中文名、坐標 Lat/Lng)
  getStop: async (company, stopId) => {
    // ⚠️ 注意：城巴嘅 stop 網址係冇 /ctb/ 嘅！呢度最易中伏
    const url = company === "KMB"
      ? `${API_BASE.KMB}/stop/${stopId}`
      : `${API_BASE.CTB}/stop/${stopId}`;
    return await fetchJSON(url);
  },

  // 4. 攞 ETA (預計抵達時間)
  getEta: async (company, stopId, route, serviceType = "1") => {
    const url = company === "KMB"
      ? `${API_BASE.KMB}/eta/${stopId}/${route}/${serviceType}`
      : `${API_BASE.CTB}/eta/ctb/${stopId}/${route}`; // 城巴 ETA 同樣無 serviceType
    return await fetchJSON(url);
  }
};


// 多公司共用的 route list（KMB + CTB + 之後 GMB）
let allRoutes = [];      // 全部公司路線
let uniqueRoutes = [];   // 去重後（同一公司同一路線只留一條）
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

let mode = "normal"; // normal / interchange_pick / interchange_pair
let originStopId = null;
let transferStopId = null;
let transferStopName = null;

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

// 轉車站追蹤結果：成功時儲存實際到達轉車站時間（第一架）
// 追蹤唔到 / 未追蹤就係 null
let trackedTransferArriveTime = null;

// 追蹤上車站班次
let selectedEtaId = null;
let selectedEtaTime = null;
let selectedEtaStatus = null;


let map = null;
let stopsLayer = null;

let userLat = null;
let userLon = null;



let allStopMarkers = [];        // 主線路 marker（你之前 showRouteStopsOnMap 要有）
let currentTransferStopId = null;

let secondRouteMarkers = [];    // Step 4 第二架車（紅色 tag）markers
let transferLine = null;        // 兩個轉車站之間的綠色線
let secondTransferStopId = null;


let originSeq = null; 
let transferSeq = null;


// 定義儲存名稱同有效時間 (1小時 = 3600000 毫秒)
const STORAGE_KEY = "bus_app_state";
const EXPIRY_TIME = 3600000; 

function saveAppState() {
    const state = {
        // 呢度儲存你 App 入面重要嘅變數
        firstRoute: typeof currentRoute !== 'undefined' ? currentRoute : null,
		firstDirection: typeof currentDirection !== 'undefined' ? currentDirection : null,
		firstDirectionCode: typeof currentDirectionCode !== 'undefined' ? currentDirectionCode : null,	
		firststopID: typeof originStopId !== 'undefined' ? originStopId : null,
		firstseq: typeof originSeq !== 'undefined' ? originSeq : null,	
        transferStopId: typeof transferStopId !== 'undefined' ? transferStopId : null,
        transferSeq: typeof transferSeq !== 'undefined' ? transferSeq : null,
		transferRoute: typeof transferRoute !== 'undefined' ? transferRoute : null,
		transferDirection: typeof transferDirection !== 'undefined' ? transferDirection : null,
		transferDirectionCode: typeof transferDirectionCode !== 'undefined' ? transferDirectionCode : null,	
		
        timestamp: new Date().getTime()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	console.log(state);
    console.log("App 狀態已儲存");
}


function showToast(message) {
    const x = document.getElementById("toast-msg");
    x.textContent = message;
    x.className = "show";
    // 3秒後消失
    setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
}

function initMap() {
  if (map) return;

  // 1. 初始化地圖，預設中心設於香港
  map = L.map('map').setView([22.32, 114.17], 12);

  // 2. 定義三個高穩定性圖層（解決 c.tile.openstreetmap.org ERR_NAME_NOT_RESOLVED 問題）
  // (A) 香港政府地政總署 CSDI 官方背景圖 + 繁體中文標籤（香港網絡極速、免 Key）
  const hkGovBase = L.tileLayer(
    'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '&copy; 香港地政總署' }
  );
  const hkGovLabel = L.tileLayer(
    'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/WGS84/{z}/{x}/{y}.png',
    { maxZoom: 19 }
  );
  const hkGovLayer = L.layerGroup([hkGovBase, hkGovLabel]);

  // (B) CartoDB Voyager 現代清晰底圖（全球 CDN，極少被封鎖，襯托藍/紅巴士線超靚）
  const cartoLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }
  );

  // (C) 新版 OpenStreetMap 官方網址（移除已棄用嘅 {s}. 子域名）
  const osmLayer = L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }
  );

  // 預設先加香港官方中文地圖；如果載入瓦片失敗自動跳去 CartoDB
  hkGovLayer.addTo(map);
  let fallbackTriggered = false;
  hkGovBase.on('tileerror', () => {
    if (!fallbackTriggered) {
      fallbackTriggered = true;
      console.warn('香港官方地圖連線受阻，自動切換至後備地圖圖層');
      if (map.hasLayer(hkGovLayer)) map.removeLayer(hkGovLayer);
      cartoLayer.addTo(map);
    }
  });

  // 右上角加入圖層切換器，方便隨時轉口味
  L.control.layers(
    {
      '🇭🇰 香港官方中文地圖': hkGovLayer,
      '🗺️ 現代簡潔地圖 (Carto)': cartoLayer,
      '🌍 OpenStreetMap': osmLayer
    },
    null,
    { position: 'topright', collapsed: true }
  ).addTo(map);

  stopsLayer = L.layerGroup().addTo(map);

  // 3. 全螢幕控制掣
  const FullscreenControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar');
      const btn = L.DomUtil.create('div', 'leaflet-control-fullscreen-btn', container);
      btn.title = '全螢幕 / 還原';
      btn.textContent = '⤢';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, 'click', (e) => {
        e.preventDefault();
        toggleMapFullscreen();
      });

      const updateIcon = () => {
        const mapDiv = document.getElementById('map');
        const isFullscreen =
          document.fullscreenElement === mapDiv ||
          document.webkitFullscreenElement === mapDiv ||
          document.mozFullScreenElement === mapDiv ||
          document.msFullscreenElement === mapDiv;
        btn.textContent = isFullscreen ? '⤡' : '⤢';
      };

      document.addEventListener('fullscreenchange', updateIcon);
      document.addEventListener('webkitfullscreenchange', updateIcon);
      document.addEventListener('mozfullscreenchange', updateIcon);
      document.addEventListener('MSFullscreenChange', updateIcon);

      return container;
    }
  });

  map.addControl(new FullscreenControl());

  // 4. 取得用家 GPS 位置
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;

        map.setView([userLat, userLon], 15);

        L.circleMarker([userLat, userLon], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#2e7d32',
          fillOpacity: 0.95
        }).addTo(map).bindPopup('📍 你的位置');
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }
}

const stopIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41]
});

// 高亮用（上車站／轉車站）
const highlightIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [30, 50],
  iconAnchor: [15, 50],
  popupAnchor: [1, -40],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41]
});

/* ========== FETCH（帶自動重試） ========== */

async function fetchJSON(url, retries = 5, delayMs = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) {
        console.error("fetchJSON failed:", url, e);
        throw e;
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/* ========== 多公司 Route Loader ========== */

// 統一的路線格式：
// {
//   company: "KMB" | "CTB",
//   route: "118",
//   bound: "I" | "O" | null,
//   service_type: "1",
//   orig_tc: "...",
//   dest_tc: "..."
// }

/* =========================================================================
   ★ 修復 init() Failed to fetch：移除無用巨型請求 /route-stop + 改用 allSettled 容錯
   ========================================================================= */

async function loadAllBusData() {
  // 改用 Promise.allSettled，並移除無使用且極易斷線嘅 /route-stop 巨型總表請求
  const [
    kmbRouteRes,
    kmbStopRes,
    ctbRouteRes
  ] = await Promise.allSettled([
    fetchJSON(`${KMB_BASE}/route/`, 3, 400),
    fetchJSON(`${KMB_BASE}/stop/`, 3, 400),
    fetchJSON(`${CTB_BASE}/route/ctb`, 3, 400)
  ]);

  const allRoutes = [];
  const routeMap = new Map();

  allStopsMap = new Map();
  routesByStopId = {};

  // 1. 處理 九巴 (KMB) 路線數據
  if (kmbRouteRes.status === "fulfilled" && kmbRouteRes.value) {
    const kmbRoutesRaw = kmbRouteRes.value.data || [];
    for (const r of kmbRoutesRaw) {
      const key = `KMB-${r.route}-${r.service_type || "1"}`;
      if (!routeMap.has(key)) {
        const obj = {
          company: "KMB",
          route: r.route,
          bound: null,
          service_type: r.service_type || "1",
          orig_tc: r.orig_tc,
          dest_tc: r.dest_tc
        };
        routeMap.set(key, obj);
        allRoutes.push(obj);
      }
    }
  } else {
    console.warn("九巴路線載入失敗:", kmbRouteRes.reason);
  }

  // 2. 處理 九巴 (KMB) 車站座標及名稱數據
  if (kmbStopRes.status === "fulfilled" && kmbStopRes.value) {
    const kmbStops = kmbStopRes.value.data || [];
    kmbStops.forEach(s => {
      allStopsMap.set(s.stop, { ...s, company: "KMB" });
    });
  } else {
    console.warn("九巴車站總表載入失敗 (之後會自動逐站補飛):", kmbStopRes.reason);
  }

  // 3. 處理 城巴 (CTB) 路線數據
  if (ctbRouteRes.status === "fulfilled" && ctbRouteRes.value) {
    const ctbRoutesRaw = ctbRouteRes.value.data || [];
    for (const r of ctbRoutesRaw) {
      const key = `CTB-${r.route}`;
      if (!routeMap.has(key)) {
        const obj = {
          company: "CTB",
          route: r.route,
          bound: null,
          service_type: "",
          orig_tc: r.orig_tc,
          dest_tc: r.dest_tc
        };
        routeMap.set(key, obj);
        allRoutes.push(obj);
      }
    }
  } else {
    console.warn("城巴路線載入失敗:", ctbRouteRes.reason);
  }

  if (allRoutes.length === 0) {
    throw new Error("無法連線至巴士伺服器，請檢查網絡連線或稍後再試。");
  }

  return allRoutes;
}

/* ========== 距離 / 速度 / 時間 ========== */

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function walkingTimeTextBetweenStops(stopIdA, stopIdB) {
  if (!stopIdA || !stopIdB) return "";

  // 同一個站：直接當 <1分鐘
  if (stopIdA === stopIdB) {
    return "<1分鐘";
  }

  const infoA = allStopsMap.get(stopIdA);
  const infoB = allStopsMap.get(stopIdB);
  if (!infoA || !infoB) return "";

  const lat1 = parseFloat(infoA.lat);
  const lon1 = parseFloat(infoA.long);
  const lat2 = parseFloat(infoB.lat);
  const lon2 = parseFloat(infoB.long);
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return "";

  const distMeters = haversineDistanceMeters(lat1, lon1, lat2, lon2);
  if (!isFinite(distMeters) || distMeters <= 0) return "<1分鐘";

  // 4 km/h = 4000 m / 60 min
  const minutes = distMeters / (4000 / 60);

  if (minutes < 1) return "<1分鐘";
  if (minutes > 60) return ">1小時";
  return `${Math.round(minutes)}分鐘`;
}

function walkingMinutesBetweenStops(stopIdA, stopIdB) {
  if (!stopIdA || !stopIdB) return null;
  if (stopIdA === stopIdB) return 0;

  const infoA = allStopsMap.get(stopIdA);
  const infoB = allStopsMap.get(stopIdB);
  if (!infoA || !infoB) return null;

  const lat1 = parseFloat(infoA.lat);
  const lon1 = parseFloat(infoA.long);
  const lat2 = parseFloat(infoB.lat);
  const lon2 = parseFloat(infoB.long);
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return null;

  const distMeters = haversineDistanceMeters(lat1, lon1, lat2, lon2);
  if (!isFinite(distMeters) || distMeters <= 0) return 0;

  // 4 km/h = 4000 m / 60 min
  return distMeters / (4000 / 60);
}


function computeSegmentDistanceMeters(prevStop, thisStop) {
  if (!prevStop || !thisStop) return null;
  const prevInfo = allStopsMap.get(prevStop.stop_id);
  const thisInfo = allStopsMap.get(thisStop.stop_id);
  if (!prevInfo || !thisInfo) return null;
  const lat1 = parseFloat(prevInfo.lat);
  const lon1 = parseFloat(prevInfo.long);
  const lat2 = parseFloat(thisInfo.lat);
  const lon2 = parseFloat(thisInfo.long);
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return null;
  return haversineDistanceMeters(lat1, lon1, lat2, lon2);
}

// 速度公式
function getSegmentBaseSpeedKmH(distanceMeters) {
  const dKm = distanceMeters / 1000;

  if (dKm <= 0) return 8;
  if (dKm <= 0.1) return 8;

  if (dKm <= 1) {
    const t = (dKm - 0.1) / (1 - 0.1);
    return 8 + (25 - 8) * t;
  }

  if (dKm <= 20) {
    const t = (dKm - 1) / (20 - 1);
    return 25 + (60 - 25) * t;
  }

  return 60;
}

function getTimeOfDayFactor(date) {
  const day = date.getDay();
  const h = date.getHours();
  const m = date.getMinutes();
  const t = h * 60 + m;

  // 週日
  if (day === 0) return 1.0;   // 原本 0.9

  // 週六
  if (day === 6) return 0.9;   // 原本 0.8

  // 星期一至五
  const basePeak = 0.8;        // 原本 0.6（最慢）

  const m1_start = 6 * 60 + 30;
  const m1_peakS = 7 * 60 + 30;
  const m1_peakE = 9 * 60 + 30;
  const m1_end   = 10 * 60 + 30;

  const e1_start = 16 * 60;
  const e1_peakS = 17 * 60;
  const e1_peakE = 19 * 60 + 30;
  const e1_end   = 20 * 60 + 30;

  if (t < m1_start) {
    return 1;
  } else if (t < m1_peakS) {
    const ratio = (t - m1_start) / (m1_peakS - m1_start);
    return 1 - (1 - basePeak) * ratio;
  } else if (t < m1_peakE) {
    return basePeak;
  } else if (t < m1_end) {
    const ratio = (t - m1_peakE) / (m1_end - m1_peakE);
    return basePeak + (1 - basePeak) * ratio;
  }

  if (t < e1_start) {
    return 1;
  } else if (t < e1_peakS) {
    const ratio = (t - e1_start) / (e1_peakS - e1_start);
    return 1 - (1 - basePeak) * ratio;
  } else if (t < e1_peakE) {
    return basePeak;
  } else if (t < e1_end) {
    const ratio = (t - e1_peakE) / (e1_end - e1_peakE);
    return basePeak + (1 - basePeak) * ratio;
  }

  return 1;
}


function getSegmentEffectiveSpeedKmH(distanceMeters, now = new Date()) {
  const baseSpeed = getSegmentBaseSpeedKmH(distanceMeters);
  const timeFactor = getTimeOfDayFactor(now);
  return baseSpeed * timeFactor;
}

// 用「追蹤班次時間 / 現在」做基準重算行程時間
function recomputeCumulativeTravelFromOrigin(originId) {
  cumulativeTravelFromOrigin = {};
  if (!routeStops || !routeStops.length) return;
  const startIndex = routeStops.findIndex(s => s.stop_id === originId);
  if (startIndex < 0) return;

  const baseTime = selectedEtaTime ? new Date(selectedEtaTime.getTime()) : new Date();

  let accDist = 0;
  let accMinutes = 0;
  let curTime = new Date(baseTime.getTime());

  cumulativeTravelFromOrigin[originId] = {
    distanceMeters: 0,
    travelMinutes: 0
  };

  for (let i = startIndex + 1; i < routeStops.length; i++) {
    const prev = routeStops[i - 1];
    const cur = routeStops[i];

    const seg = computeSegmentDistanceMeters(prev, cur);
    if (!seg || seg <= 0) {
      cumulativeTravelFromOrigin[cur.stop_id] = {
        distanceMeters: accDist,
        travelMinutes: Math.round(accMinutes)
      };
      continue;
    }

    accDist += seg;

    const vKmH = getSegmentEffectiveSpeedKmH(seg, curTime);
    const dKm = seg / 1000;
    const hours = dKm / vKmH;
    const minutes = hours * 60;

    accMinutes += minutes;
    curTime = new Date(curTime.getTime() + minutes * 60000);

    cumulativeTravelFromOrigin[cur.stop_id] = {
      distanceMeters: accDist,
      travelMinutes: Math.round(accMinutes)
    };
  }
}

/* ========== 文字處理 / 色 / ETA 行 ========== */

function normalizeStopName(nameTc) {
  if (!nameTc) return "";
  let s = nameTc.split("(")[0].split("（")[0].trim();
  s = s.replace(/[A-Z]{1,3}\d{1,4}$/i, "").trim();
  return s;
}

function stripBracketCode(name) {
  if (!name) return "";
  return name.replace(/\([^)]*\)$/g, "").replace(/（[^）]*）$/g, "").trim();
}

function computeNextCharUsage(baseRoutes, inputStr) {
  const usage = { digits: {}, letters: {} };
  for (let d = 0; d <= 9; d++) usage.digits[String(d)] = false;
  const ACode = "A".charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(ACode + i);
    usage.letters[ch] = false;
  }

  baseRoutes.forEach(r => {
    const code = r.route.toUpperCase();
    if (code.length > inputStr.length) {
      const ch = code[inputStr.length];
      if (!ch) return;
      if (ch >= "0" && ch <= "9") {
        usage.digits[ch] = true;
      } else if (usage.letters.hasOwnProperty(ch)) {
        usage.letters[ch] = true;
      }
    }
  });
  return usage;
}

function minutesAndLabel(etaISO) {
  if (!etaISO) return { minutes: 999, label: "" };
  const now = new Date();
  const eta = new Date(etaISO);
  const diffMs = eta - now;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin <= 0) return { minutes: diffMin, label: "即將到達" };
  return { minutes: diffMin, label: `約 ${diffMin} 分鐘` };
}

function grayColorByMinutes(min) {
  if (min <= 1) return "#000000";
  if (min >= 30) return "#b0b0b0";
  const t = (min - 1) / (30 - 1);
  const start = 0;
  const end = 176;
  const v = Math.round(start + (end - start) * t);
  const hex = v.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function formatDetailLine(item) {
  const etaTime = item.eta ? new Date(item.eta) : null;
  const timeStr = etaTime
    ? etaTime.toLocaleTimeString("zh-HK", { hour12: false })
    : "N/A";
  const { minutes, label } = minutesAndLabel(item.eta);
  const remark = item.rmk_tc || "";

  const isScheduled   = remark.includes("原定") || remark.includes("預定");
  const isNotDeparted = remark.includes("未開出");

  let text = `${timeStr} ${label}`;
  if (isNotDeparted || isScheduled) {
    text += " 未開出";
  } else if (remark) {
    text += " " + remark;
  }

  const status = (isNotDeparted || isScheduled) ? "not_departed" : "departed";

  return { text, minutes, isScheduled, status, etaTime };
}

function formatTimeHHMM(date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/* ========== 追蹤 helper ========== */

function setTrackingEta(etaObj, rowElement) {
  selectedEtaId     = etaObj.id;
  selectedEtaTime   = etaObj.etaTime;
  selectedEtaStatus = etaObj.status;

  if (originStopId && routeStops.length) {
    recomputeCumulativeTravelFromOrigin(originStopId);
  }
  loadEtaSummaryForAllStops();

  // 更新 Step 3 上車站藍色 highlight
  if (rowElement) {
    const rows = document.querySelectorAll(
      `.stop-item[data-stop-id="${originStopId}"] .eta-row`
    );
    rows.forEach(row => {
      row.classList.remove("tracked");
      const btn = row.querySelector(".btn-track");
      if (btn) btn.classList.remove("active");
    });
    rowElement.classList.add("tracked");
    const btn = rowElement.querySelector(".btn-track");
    if (btn) btn.classList.add("active");
  }

  // ★ 無論有冇揀第二程站，只要有轉車站，就重算一次「搭緊：HH:MM」
  if (transferStopId) {
    guessBoardingBusAtTransferStop();
  }

  // ★ 如已經揀咗第二程站，再用最新 tracking 重算步行＋等候＋紅色 highlight
  if (transferStopId && transferCurrentStopId) {
    selectTransferStop(transferCurrentStopId);
  }
}

/* ========== INIT ========== */

async function init() {
  try {
	allRoutes = await loadAllBusData();
    // uniqueRoutes：同一公司 + 同一路線只留一條
    const uMap = new Map();
    for (const r of allRoutes) {
      const key = `${r.company}-${r.route}-${r.service_type}`;
      if (!uMap.has(key)) {
        uMap.set(key, r);
      }
    }
    uniqueRoutes = Array.from(uMap.values());

    // 之後流程同你原本差唔多
    currentInput = "";
    updateRouteInputDisplay();
    candidateRoutes = uniqueRoutes.slice();
    renderRouteList();
    renderVirtualKeyboard();
    renderTransferVirtualKeyboard();

    const btnResetTransfer = document.getElementById("btnResetTransfer");
    if (btnResetTransfer) {
      btnResetTransfer.addEventListener("click", resetTransferOnly);
    }
  } catch (e) {
    console.error(e);
    document.getElementById("routeList").textContent =
      "載入路線 / 巴士站失敗：" + e.message;
    alert("初始化失敗，請開 F12 → Console 睇詳情。");
  }

  checkUrlForRoute();
}

/* ========== Step1: 路線輸入 ========== */

function updateRouteInputDisplay() {
  if (currentRoute) {
    document.getElementById("routeInputDisplay").textContent =
      `${currentRoute.route}（${currentRoute.orig_tc} ↔ ${currentRoute.dest_tc}）`;
  } else {
    document.getElementById("routeInputDisplay").textContent =
      currentInput || "(未輸入)";
  }
}

/* ========== Step1: 路線輸入 ========== */

function filterRoutesByInput() {
  if (!currentInput) {
    // 💡 修正 1：如果無字，一定要將所有路線俾返 Keyboard 做 Reference！
    // 咁樣個 Keyboard 先可以畫出第一層 (例如 A-Z, 0-9) 嘅掣！
    candidateRoutes = uniqueRoutes.slice();
    return;
  }
  const kw = currentInput.toLowerCase();

  // 💡 修正 2：保持 candidateRoutes 裡面全部都係「原裝」嘅 Object
  // 唔好喺呢度 Group 埋佢！留返俾 renderRouteList 先做。
  candidateRoutes = uniqueRoutes.filter(r => r.route.toLowerCase().startsWith(kw));
}

function renderRouteList() {
  const container = document.getElementById("routeList");
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
    const code = String(r.route).toUpperCase(); // 確保大階
    
    // ★ 終極版聯營線判斷：過海線 (1,3,6,9字頭) + 大嶼山特例 (S1, R8)
    const isJointRoute = /^(N)?[1369]\d{2}[A-Z]?$/.test(code) || ["S1", "R8"].includes(code);
    
    // 如果係聯營線就合併，唔係就加公司名拆開
    const key = isJointRoute ? code : `${code}-${r.company}`;

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

  const groupedRoutes = Array.from(byRoute.values());

  groupedRoutes.slice(0, 100).forEach(r => {
    const div = document.createElement("div");
    div.className = "route-item";

    const cos = Array.from(r.companies);
    const coLabel =
      cos.length === 1
        ? (cos[0] === "KMB" ? "（九巴）" :
           cos[0] === "CTB" ? "（城巴）" :
           `（${cos[0]}）`)
        : "（九巴 / 城巴）";

    div.textContent = `${r.route}${coLabel}：${r.orig_tc} ↔ ${r.dest_tc}`;

    div.onclick = () => {
      const samples = r.samples;
      const kmb = samples.find(x => x.company === "KMB");
      const ctb = samples.find(x => x.company === "CTB");

      // 聯營線預設掟九巴入去，等 ETA function 去 call 對家
      let target = kmb || ctb || samples[0]; 
      selectRoute(target);
    };

    container.appendChild(div);
  });
}


function updateAfterInputChange() {
  updateRouteInputDisplay();
  filterRoutesByInput();
  renderRouteList();
  renderVirtualKeyboard();
}

/* ========== Step4 虛擬鍵盤 ========== */
function renderVirtualKeyboard() {
  const container = document.getElementById("vk-container");
  container.innerHTML = "";

  if (currentRoute && keyboardHidden) {
    const clear = document.createElement("div");
    clear.className = "vk-key special";
    clear.textContent = "X";
    clear.style.backgroundColor = "#ffcccc"; // 淺紅色
    clear.style.color = "#cc0000"; // 深紅字
    clear.onclick = () => {
      resetAllState();
    };
    container.appendChild(clear);
    return;
  }

  const baseRoutes = currentInput ? candidateRoutes : uniqueRoutes;
  const usage = computeNextCharUsage(baseRoutes, currentInput);

  // --- 1. 頂部控制鍵：刪除 & 清除(X) ---
  const topRow = document.createElement("div");
  topRow.className = "vk-row";
  
  const backspace = document.createElement("div");
  backspace.className = "vk-key special";
  backspace.textContent = "刪除";
  backspace.onclick = () => {
    if (currentRoute) return;
    if (currentInput.length > 0) {
      currentInput = currentInput.slice(0, -1);
      updateAfterInputChange();
    }
  };
  
  const clear = document.createElement("div");
  clear.className = "vk-key special";
  clear.textContent = "X";
  clear.style.backgroundColor = "#ffcccc"; // 淺紅色
  clear.style.color = "#cc0000";
  clear.onclick = () => {
    resetAllState();
  };
  
  topRow.appendChild(backspace);
  topRow.appendChild(clear);
  container.appendChild(topRow);

  // --- 2. 數字 Numpad 佈局 ---
  const numpadLayout = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [null, 0, null] // null 用作佔位符，令 0 置中
  ];

  numpadLayout.forEach(rowDigits => {
    const digitRow = document.createElement("div");
    digitRow.className = "vk-row";
    
    rowDigits.forEach(d => {
      if (d === null) {
        // 空白佔位符
        const spacer = document.createElement("div");
        spacer.className = "vk-key";
        spacer.style.visibility = "hidden"; 
        digitRow.appendChild(spacer);
        return;
      }
      
      const ch = String(d);
      const key = document.createElement("div");
      key.className = "vk-key";
      key.textContent = ch;
      
      if (!usage.digits[ch]) {
        key.classList.add("disabled");
      } else {
        key.onclick = () => {
          if (!currentRoute && !key.classList.contains("disabled")) {
            currentInput += ch;
            updateAfterInputChange();
          }
        };
      }
      digitRow.appendChild(key);
    });
    container.appendChild(digitRow);
  });

  // --- 3. 英文字母 ---
  const labelLetters = document.createElement("div");
  labelLetters.className = "vk-label";
  labelLetters.textContent = "英文字母";
  labelLetters.style.marginTop = "10px"; // 加少少空位隔開 Numpad
  container.appendChild(labelLetters);

  const letters = Object.keys(usage.letters).filter(ch => usage.letters[ch]);
  if (letters.length === 0) {
    const info = document.createElement("div");
    info.style.fontSize = "12px";
    info.style.color = "#999";
    info.textContent = "暫時無可輸入英文字。";
    container.appendChild(info);
  } else {
    const letterRow = document.createElement("div");
    letterRow.className = "vk-row";
    letters.forEach(ch => {
      const key = document.createElement("div");
      key.className = "vk-key";
      key.textContent = ch;
      key.onclick = () => {
        if (!currentRoute) {
          currentInput += ch;
          updateAfterInputChange();
        }
      };
      letterRow.appendChild(key);
    });
    container.appendChild(letterRow);
  }
}



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
  
  // 1. 先搵晒所有開頭符合嘅路線出嚟 (未去重)
  const rawCandidates = uniqueRoutes.filter(r =>
    r.route.toLowerCase().startsWith(kw)
  );

  // 2. ★ 完美融合版：用 Map 處理去重 + 聯營線合併
  const byRoute = new Map();

  rawCandidates.forEach(r => {
    const code = String(r.route).toUpperCase(); // 確保大階
    const company = r.company || "KMB";
    
    // 判斷係咪聯營線：過海線 (1,3,6,9字頭) + 大嶼山特例 (S1, R8)
    const isJointRoute = /^(N)?[1369]\d{2}[A-Z]?$/.test(code) || ["S1", "R8"].includes(code);
    
    // 聯營線用 code 做 key (會合併)，獨營線用 code-company 做 key (會拆開)
    const key = isJointRoute ? code : `${code}-${company}`;

    if (!byRoute.has(key)) {
      // 第一次見呢條線，開個新 Record
      byRoute.set(key, {
        route: code,
        orig_tc: r.orig_tc,
        dest_tc: r.dest_tc,
        companies: new Set([company]),
        sampleObj: r // 留返個原始 Object 畀等陣 onclick 掟入 function
      });
    } else {
      // 已經見過，將間公司加埋入去 (例如加 CTB 入去，就會變 九巴+城巴)
      byRoute.get(key).companies.add(company);
    }
  });

  // 3. 將 Map 轉返做 Array
  const groupedRoutes = Array.from(byRoute.values());
  
  // ★ Update 返 transferCandidateRoutes 畀 Virtual Keyboard 用
  transferCandidateRoutes = groupedRoutes.map(g => g.sampleObj);

  // 4. 顯示結果
  if (!groupedRoutes.length) {
    listDiv.textContent = "冇符合路線";
  } else {
    groupedRoutes.slice(0, 100).forEach(group => {
      const div = document.createElement("div");
      div.className = "route-item";

      // 處理公司 Label 顯示
      const cos = Array.from(group.companies);
      const coLabel = cos.length === 1
        ? (cos[0] === "CTB" ? "（城巴）" : "（九巴）")
        : "（九巴 / 城巴）";

      div.textContent = `${group.route} ${coLabel}：${group.orig_tc} ↔ ${group.dest_tc}`;

      div.onclick = () => {
        // 聯營線求其掟其中一個 sample (通常係搵到嘅第一個) 入去就得
        // ETA function 會識得自動搞掂聯營
        selectTransferRoute(group.sampleObj);
      };
      
      listDiv.appendChild(div);
    });
  }

  renderTransferVirtualKeyboard();
}


/* ========== 清 Step4 / 全清 ========== */

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
  if (d1) d1.textContent = "";
  const d2 = document.getElementById("transferRouteList");
  if (d2) d2.textContent = "請輸入路線，會以同名站作為預設轉車站。";
  const d3 = document.getElementById("transferStopList");
  if (d3) d3.innerHTML = "";
  const d4 = document.getElementById("transferHeadwayInfo");
  if (d4) d4.textContent = "";

  const btnIn = document.getElementById("transferDirInbound");
  const btnOut = document.getElementById("transferDirOutbound");
  if (btnIn) {
    btnIn.disabled = true;
    btnIn.textContent = "往 ? 方向";
  }
  if (btnOut) {
    btnOut.disabled = true;
    btnOut.textContent = "往 ? 方向";
  }

  const t1 = document.getElementById("step4-title");
  if (t1) t1.style.display = "";
  const t2 = document.getElementById("transfer-step1-layout");
  if (t2) t2.style.display = "flex";

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
	clearSecondRouteVisual();   // ★ 新增：清晒第二程紅色標記 / 線
	
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


  const t1 = document.getElementById("step4-title");
  if (t1) t1.style.display = "";
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "block";

const mainLine = document.getElementById("transfer-main-line");
  const inputDisplay = document.getElementById("transferRouteInputDisplay"); // 搵返個仔出嚟

  if (mainLine) {
    // 1. 安全起見用 textContent 寫字（呢一刻個仔會短暫消失）
    mainLine.textContent = "轉車路線："; 
    
    // 2. 將個仔原封不動咁 append 返入去 mainLine 嘅最後面
    if (inputDisplay) {
      mainLine.appendChild(inputDisplay);
    }
  }

  const d1 = document.getElementById("transferRouteInputDisplay");
  if (d1) d1.textContent = "(未輸入)";
  const d2 = document.getElementById("transferRouteList");
  if (d2) d2.textContent = "請輸入路線，會以同名站作為預設轉車站。";

  const t2 = document.getElementById("transfer-step1-layout");
  if (t2) t2.style.display = "flex";

  const d3 = document.getElementById("transferStopList");
  if (d3) d3.innerHTML = "";
  const d4 = document.getElementById("transferHeadwayInfo");
  if (d4) d4.textContent = "";

  const dirBlock = document.getElementById("transfer-direction-block");
  if (dirBlock) {
    dirBlock.style.display = "";
    const dirButtons = dirBlock.querySelector(".direction-buttons");
    const dirLabel = dirBlock.querySelector("strong");
    if (dirButtons) dirButtons.style.display = "";
    if (dirLabel) dirLabel.style.display = "";
  }

  const btnIn = document.getElementById("transferDirInbound");
  const btnOut = document.getElementById("transferDirOutbound");
  if (btnIn) { btnIn.disabled = true; btnIn.textContent = "往 ? 方向"; }
  if (btnOut) { btnOut.disabled = true; btnOut.textContent = "往 ? 方向"; }

  const stopBlock = document.getElementById("transfer-stop-block");
  if (stopBlock) stopBlock.style.display = "";

  const btnReset = document.getElementById("btnResetTransfer");
  if (btnReset) btnReset.style.display = "none";

  renderTransferVirtualKeyboard();
saveAppState();
}

/* ========== Step1 大清除 ========== */

function resetAllState() {
  
  clearSecondRouteVisual();   // ★ 本身已有：清第二路線 / 紅 tag
  
  if (mode === "interchange_pick" || mode === "interchange_pair") {
    originStopId = null;
    transferStopId = null;
    transferStopName = null;
    mode = "normal";
  }

  if (mainEtaTimer) { clearInterval(mainEtaTimer); mainEtaTimer = null; }
  if (transferEtaTimer) { clearInterval(transferEtaTimer); transferEtaTimer = null; }

  currentRoute = null;
  currentInput = "";
  currentDirection = null;
  currentDirectionCode = null;
  inboundTerminalName = "?";
  outboundTerminalName = "?";
  routeStops = [];
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
  const icInfo = document.getElementById("interchangeInfo");
  if (icInfo) icInfo.textContent = "";
  const stopList = document.getElementById("stopList");
  if (stopList) stopList.innerHTML = "";
  const icCtrl = document.getElementById("interchangeControls");
  if (icCtrl) icCtrl.innerHTML = "";

  const btnIn = document.getElementById("dirInbound");
  const btnOut = document.getElementById("dirOutbound");
  if (btnIn) { btnIn.disabled = true; btnIn.textContent = "往 ? 方向"; }
  if (btnOut) { btnOut.disabled = true; btnOut.textContent = "往 ? 方向"; }

  updateRouteInputDisplay();
  renderRouteList();
  renderVirtualKeyboard();
saveAppState();
  // ==========================================
  // ★ 強力清除地圖顯示 (移除所有線 / Marker)
  // ==========================================
  if (map) {
    // 1. 清除站點 Marker (保留 stopsLayer 個殻，清空裡面)
    if (typeof stopsLayer !== "undefined" && stopsLayer) {
      stopsLayer.clearLayers();
    }

    // 2. 清除主路線畫線 (Polyline) -> 假設你畫線個變數叫 routeLine 或 routeLayer
    if (typeof routeLine !== "undefined" && routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    if (typeof routeLayer !== "undefined" && routeLayer) {
      if (routeLayer.clearLayers) routeLayer.clearLayers();
      else map.removeLayer(routeLayer);
    }

    // 3. 清除用家至站點嘅步行路線 / 導航線 (解除註解並生效)
    if (typeof userToStopRouteLayer !== "undefined" && userToStopRouteLayer) {
      map.removeLayer(userToStopRouteLayer);
      userToStopRouteLayer = null;
    }

    // 4. 清除用家自己個 GPS 定位 Marker (假設叫 userMarker)
    if (typeof userMarker !== "undefined" && userMarker) {
      map.removeLayer(userMarker);
      userMarker = null;
    }

    // 5. 終極絕招 (如果上面仲有嘢清唔走)：
    // 掃描地圖上所有物件，如果唔係底圖 (TileLayer) 就剷走佢
    map.eachLayer(function (layer) {
      // 保留所有 TileLayer (_url) 同埋 LayerGroup (_layers)，只清除 Polyline 同 Marker
      if (!layer._url && !layer._layers && layer !== stopsLayer) {
        map.removeLayer(layer);
      }
    });


    // 6. 視角重置返去香港中心
    map.setView([22.32, 114.17], 12); 
  }

  const userInfo = document.getElementById("userWalkInfo");
  if (userInfo) userInfo.textContent = "";
  
}



/* ========== Step2: 揀方向 ========== */
// 呢個 Helper Function 幫你無痛處理九巴/城巴站名轉換
async function getStopDetail(company, stopId) {
  // 1. 如果 allStopsMap 已經有（九巴全部都有，或者城巴之前 Click 過）
  if (allStopsMap.has(stopId)) {
    return allStopsMap.get(stopId);
  }
  
  // 2. 如果冇，即刻 Call BusAPI 攞！
  try {
    const res = await BusAPI.getStop(company, stopId);
    if (res && res.data) {
      const stopData = { ...res.data, company: company };
      allStopsMap.set(stopId, stopData); // 記低佢，下次唔使再 Call
      return stopData;
    }
  } catch (e) {
    console.error(`攞唔到車站資料: ${stopId}`, e);
  }
  return null;
}


async function selectRoute(route) {
  if (mainEtaTimer) { clearInterval(mainEtaTimer); mainEtaTimer = null; }

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
  
  // ★ 重置：確保兩個掣都顯示出嚟，費事俾上一條循環線影響
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

    // ★ 1. 改用 BusAPI，唔使再自己砌 URL 同分 KMB/CTB
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
        const last = list[list.length - 1];
        
        // ★ 2. 改用 await getStopDetail 攞站名，解決城巴站名未 Load 嘅問題
        const stopInfo = await getStopDetail(company, last.stop);
        inboundTerminalName = stopInfo && stopInfo.name_tc 
          ? stripBracketCode(stopInfo.name_tc) 
          : stripBracketCode(currentRoute.dest_tc);
      }
    }

    if (outData.status === "fulfilled") {
      const list = (outData.value.data || []).sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasOutbound = true;
        const last = list[list.length - 1];
        
        // ★ 3. 改用 await getStopDetail 攞站名
        const stopInfo = await getStopDetail(company, last.stop);
        outboundTerminalName = stopInfo && stopInfo.name_tc 
          ? stripBracketCode(stopInfo.name_tc) 
          : stripBracketCode(currentRoute.orig_tc);
      }
    }

    const finalInName = inboundTerminalName !== "?" ? inboundTerminalName : stripBracketCode(currentRoute.dest_tc);
    const finalOutName = outboundTerminalName !== "?" ? outboundTerminalName : stripBracketCode(currentRoute.orig_tc);
    
    // ★ 判斷係咪雙向定循環線 (保留你原本嘅靚 Logic！)
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
      btnIn.textContent = `無此方向`;
      btnOut.textContent = `無此方向`;
    }

  } catch (e) {
    console.error(e);
    btnIn.textContent = "往 ? 方向";
    btnOut.textContent = "往 ? 方向";
    alert("載入方向資訊失敗，請開 Console 睇詳情。");
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

function showWalkingTimeToNearestStop(stopId, distMeters) {
  const minutes = distMeters / (4000 / 60); // 同原本假設：4km/h
  let text;
  if (minutes < 1) text = "<1分鐘";
  else if (minutes > 60) text = ">1小時";
  else text = `${Math.round(minutes)}分鐘`;

  const div = document.getElementById("transferWalkInfo"); // 或者你自己開個新 div，例如 userWalkInfo
  if (div) {
    div.style.fontSize = "12px";
    div.style.color = "#444";
    div.textContent = `由你目前位置步行到最近車站：約 ${text}`;
  }
}


function zoomToNearestStopIfHaveGPS() {
  if (!map || userLat == null || userLon == null) return;
  if (!routeStops || !routeStops.length) return;

  const nearest = findNearestStopToLatLng(userLat, userLon, routeStops);
  if (!nearest) return;

  const info = allStopsMap.get(nearest.stop.stop_id);
  if (!info) return;
  const lat = parseFloat(info.lat);
  const lon = parseFloat(info.long);
  if (!isFinite(lat) || !isFinite(lon)) return;

  map.setView([lat, lon], 16);

  // 可選：自動打開最近站 popup
  stopsLayer.eachLayer(layer => {
    if (layer.getLatLng && layer.getLatLng().lat === lat && layer.getLatLng().lng === lon) {
      layer.openPopup();
    }
  });

  // 顯示步行時間
  showWalkingTimeToNearestStop(nearest.stop.stop_id, nearest.distMeters);
}

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
  const icInfo = document.getElementById("interchangeInfo");
  if (icInfo) icInfo.textContent = "";
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
          name_tc: stopInfo && stopInfo.name_tc ? stopInfo.name_tc : `(未知站名) ${rs.stop}`,
          name_en: stopInfo && stopInfo.name_en ? stopInfo.name_en : "",
          lat: stopInfo ? stopInfo.lat : null,
          long: stopInfo ? stopInfo.long : null
        };
      })
    );

    routeStops = stopsWithDetails.sort((a, b) => a.seq - b.seq);

    renderStopList();
    await loadEtaSummaryForAllStops();
    await loadHeadwayInfo();
    
    let hl = [];
    if (originStopId) hl.push(originStopId);
    if (transferStopId) hl.push(transferStopId);

    showRouteStopsOnMap(routeStops, hl);
    zoomToNearestStopIfHaveGPS(); 

    // ==========================================
    // ★ 新增：如果有 GPS，自動選取最近車站
    // ==========================================
    // 假設你儲存 GPS 嘅變數叫 userLat 同 userLon (請按你實際嘅全域變數名修改)
    if (typeof userLat !== 'undefined' && typeof userLon !== 'undefined' && userLat && userLon) {
      let nearestStop = null;
      let minDistance = Infinity;

      routeStops.forEach(stop => {
        if (stop.lat && stop.long) {
          // 用畢氏定理計距離平方 (市區短距離對比夠做，唔使出動 Haversine 公式)
          const dLat = stop.lat - userLat;
          const dLng = stop.long - userLon;
          const dist = (dLat * dLat) + (dLng * dLng);

          if (dist < minDistance) {
            minDistance = dist;
            nearestStop = stop;
          }
        }
      });

      // 如果搵到最近嘅站，就當用家 Click 咗佢
      if (nearestStop && typeof onStopClicked === "function") {
        showToast(`📍 自動定位：${nearestStop.name_tc}`);
        // 用 setTimeout 畀個 DOM 唞一唞氣，確保 UI Render 完先展開 ETA
        setTimeout(() => {
          onStopClicked(nearestStop.stop_id, nearestStop.seq);
          
          // 如果你想個 List 自動 Scroll 落去嗰個站，可以加埋呢段：
          const selectedEl = document.querySelector(`.stop-item[data-stop-id="${nearestStop.stop_id}"][data-seq="${nearestStop.seq}"]`);
          if (selectedEl) {
            selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      }
    }
    // ==========================================

    if (mainEtaTimer) clearInterval(mainEtaTimer);
    mainEtaTimer = setInterval(async () => {
      if (!currentRoute || !currentDirection || !routeStops.length) return;
      await loadEtaSummaryForAllStops();
      await loadHeadwayInfo();
      if (currentStopId) {
        await loadEtaDetailForStop(currentStopId);
      }
    }, 30000);
    
    saveAppState();

  } catch (e) {
    console.error(e);
    if (stopList) stopList.textContent = "載入路線站點失敗：" + e.message;
    if (hInfo) transferHeadNotOk();
  }
}

/* ========== Step3: 巴士站 + 轉車模式 ========== */
function renderStopList() {
  const container = document.getElementById("stopList");
  if (!container) return;

  // ★ 核心補救：如果 originSeq 或 transferSeq 係 null，我哋自己搵返出嚟！
  let actualOriginSeq = originSeq;
  if (originStopId && !actualOriginSeq) {
    // 搵同 ID 嘅第一個站（必定係頭站），攞佢個 seq
    const match = routeStops.find(s => s.stop_id === originStopId);
    if (match) actualOriginSeq = match.seq;
  }

  let actualTransferSeq = transferSeq;
  if (transferStopId && !actualTransferSeq) {
    const match = routeStops.find(s => s.stop_id === transferStopId);
    if (match) actualTransferSeq = match.seq;
  }

  // ─── 第 1 部分：處理頂部 UI 狀態 ───
  const infoDiv = document.getElementById("interchangeInfo");
  const ctrlDiv = document.getElementById("interchangeControls");
  const tSec = document.getElementById("transfer-search-section");
  
  if (infoDiv) infoDiv.textContent = "";
  if (ctrlDiv) ctrlDiv.innerHTML = "";
  if (tSec) tSec.style.display = "none";

  let originIndex = -1;

  if (mode === "interchange_pick" && originStopId) {
    const origin = routeStops.find(s => s.stop_id === originStopId && s.seq == actualOriginSeq) 
                || routeStops.find(s => s.stop_id === originStopId);
    if (origin) originIndex = routeStops.indexOf(origin);

    const name = origin ? origin.name_tc : originStopId;
    if (infoDiv) infoDiv.textContent = `轉車模式：上車站 ${name}，請揀轉車站（只可以揀之後嘅站）。`;

  } else if (mode === "interchange_pair" && originStopId && transferStopId) {
    const origin = routeStops.find(s => s.stop_id === originStopId && s.seq == actualOriginSeq) 
                || routeStops.find(s => s.stop_id === originStopId);
    const trans  = routeStops.find(s => s.stop_id === transferStopId && s.seq == actualTransferSeq) 
                || routeStops.find(s => s.stop_id === transferStopId);
    
    if (origin) originIndex = routeStops.indexOf(origin);

    const nameO  = origin ? origin.name_tc : originStopId;
    const nameT  = trans  ? trans.name_tc  : transferStopId;
    transferStopName = trans ? normalizeStopName(trans.name_tc) : null;
    
    if (infoDiv) infoDiv.textContent = `轉車模式：上車站 ${nameO} → 轉車站 ${nameT}`;

    if (ctrlDiv) {
      const btn = document.createElement("button");
      btn.textContent = "取消轉車";
      btn.onclick = exitInterchangeMode; 
      ctrlDiv.appendChild(btn);
    }

    if (tSec) tSec.style.display = "block";
    clearTransferState();
  }

  // ─── 第 2 部分：生成站點列表 ───
  container.innerHTML = "";
  
  routeStops.forEach((s, index) => {
    let isVisible = true;

    if (mode === "interchange_pair") {
      // Pair 模式：用 actualOriginSeq 精準對比，只顯示上車同轉車站
      const isOrigin = (s.stop_id === originStopId && s.seq == actualOriginSeq);
      const isTransfer = (s.stop_id === transferStopId && s.seq == actualTransferSeq);
      
      if (!isOrigin && !isTransfer) {
        isVisible = false;
      }
      
    } else if (mode === "interchange_pick") {
      // Pick 模式：防禦循環線！
      // 如果個站 ID 係上車站，但 seq 唔係我哋搵到嘅頭站 seq（即係循環線尾站），強制隱藏
      if (originStopId && s.stop_id === originStopId) {
        if (s.seq != actualOriginSeq) {
          isVisible = false;
        }
      }
    }

    const div = document.createElement("div");
    div.className = "stop-item";
    div.dataset.stopId = s.stop_id;
    div.dataset.seq = s.seq; 
    
    if (!isVisible) {
      div.style.display = "none";
    }

    const header = document.createElement("div");
    header.className = "stop-header";

    const left = document.createElement("div");
    left.className = "stop-title";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = `${s.seq}. ${s.name_tc}`;
    left.appendChild(titleSpan);

    if (mode === "interchange_pick" && originIndex >= 0 && index >= originIndex) {
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

  const prevOrigin = originStopId;

  mode = "normal";
  originStopId = null;
  transferStopId = null;
  transferStopName = null;
  cumulativeTravelFromOrigin = null;

  const icInfo = document.getElementById("interchangeInfo");
  if (icInfo) icInfo.textContent = "";
  const icCtrl = document.getElementById("interchangeControls");
  if (icCtrl) icCtrl.innerHTML = "";
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "none";

  renderStopList();
  await loadEtaSummaryForAllStops();
  await loadHeadwayInfo();

  if (prevOrigin) {
    onStopClicked(prevOrigin);
  }
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

    // ★ 循環線終極防禦：就算佢撳尾站，都格硬當佢撳頭站！
    const allMatches = routeStops.filter(s => s.stop_id === stopId);
    if (allMatches.length > 1) {
      // 搵晒同一 ID 嘅站，強制攞最細嗰個 seq (即係頭站)
      targetSeq = Math.min(...allMatches.map(s => parseInt(s.seq)));
    }

    originSeq = targetSeq; // 記低上車站嘅站序 (必定係頭站)


    mode = "interchange_pick";
    recomputeCumulativeTravelFromOrigin(stopId); 
    renderStopList();
    selectStop(stopId, targetSeq);  
    return;
  }

  if (mode === "interchange_pick") {
    // 如果佢轉車站都夠膽揀總站 (同上車站一樣 ID)
    if (stopId === originStopId) {
      targetSeq = originSeq; // 強制變返同上車站一樣
    }

    transferStopId = stopId;
    transferSeq = targetSeq;
    currentTransferStopId = stopId;
    currentTransferSeq = targetSeq;
    mode = "interchange_pair";

    renderStopList(); 

    const walkInfoDiv = document.getElementById("transferWalkInfo");
    if (walkInfoDiv) walkInfoDiv.textContent = "";

    ensureDefaultTrackingAtOrigin().then(() => {
      if (originStopId) loadEtaDetailForStop(originStopId, originSeq);
      // 避免頭站同尾站係同一個 ID 時重複 Load ETA
      if (transferStopId && (transferStopId !== originStopId || transferSeq != originSeq)) {
        loadEtaDetailForStop(transferStopId, transferSeq);
      }
      guessBoardingBusAtTransferStop();
    });


    if (typeof allStopMarkers !== "undefined" && map) {
      let marker = allStopMarkers.find(m => m.stopId === stopId && m.seq == targetSeq);
      if (!marker) marker = allStopMarkers.find(m => m.stopId === stopId);
      
      if (marker) {
        map.setView(marker.getLatLng(), 17);
        if (marker.openPopup) marker.openPopup();
      }
    }
  }
  // ★ 加喺度：自動追蹤上車站第一班車

    autoTrackFirstEta(originStopId, originSeq);
	saveAppState();
}

function clearStopSelectionUI() {
  document.querySelectorAll(".stop-item.selected").forEach(el => {
    el.classList.remove("selected");
  });
  document.querySelectorAll(".eta-block").forEach(el => {
    el.innerHTML = "";
  });
}

function onStopClicked(stopId,seq) {
  originStopId = stopId;
	originSeq = seq;
	
  if (mode === "normal") {
    mode = "interchange_pick";
  }

  recomputeCumulativeTravelFromOrigin(stopId);
  renderStopList();
  selectStop(stopId,seq);   // ★ 每次 click 行都即時顯示 ETA
  saveAppState(); // ★ 加呢句，記住用家最後揀咗乜
}

async function selectStop(stopId, seq) {
  currentStopId = stopId;
  const targetSeq = parseInt(seq);

  if (!currentRoute) return;
  const company = currentRoute.company;
  const routeName = currentRoute.route;

  // ==========================================
  // 【防彈版】由 UI 攞終點站名 (無視數字、無須特定 class)
  // ==========================================
  const allItems = document.querySelectorAll("#stopList .stop-item");
  let destKey = "";

  if (allItems.length > 0) {
    const lastStopEl = allItems[allItems.length - 1];
    const cloneEl = lastStopEl.cloneNode(true);
    
    const etaDiv = cloneEl.querySelector(".eta-block");
    if (etaDiv) etaDiv.remove();
    
    let cleanName = cloneEl.textContent.replace(/^[\d\s.\-、]+/, "");
    cleanName = cleanName.replace(/\s+/g, "");
    
    destKey = cleanName.substring(0, 2); 
  } else {
    destKey = (currentRoute.dest_tc || "").substring(0, 2);
  }

  // 1. 高亮 UI
  allItems.forEach(el => {
    const elStopId = el.dataset.stopId;
    const elSeq = parseInt(el.dataset.seq);
    el.classList.toggle("selected", elStopId === stopId && elSeq === targetSeq);
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
      const isCrossHarbour = /^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName);

      // ==========================================
      // 【Step 1】攞「主公司」嘅 ETA
      // ==========================================
      try {
        const mainData = await BusAPI.getEta(company, stopId, routeName, currentServiceType);
        let mainList = (mainData.data || []).filter(item => parseInt(item.seq) === targetSeq);
        
        if (company === "KMB" && currentDirectionCode) {
          mainList = mainList.filter(item => item.dir === currentDirectionCode);
        }
        
        mainList.forEach(item => {
          item._company = company;
          combinedEtaList.push(item);
        });
      } catch (e) { console.error("Main ETA failed"); }

      // ==========================================
      // 【Step 2】聯營線攞「對家公司」ETA (用剛才抽到嘅 destKey 去 filter)
      // ==========================================
      if (isCrossHarbour && destKey) {
        const oppCompany = company === "KMB" ? "CTB" : "KMB";
        try {
          const [oppIn, oppOut] = await Promise.all([
            BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({data:[]})),
            BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({data:[]}))
          ]);

          const oppStopIds = new Set();
          const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === targetSeq);
          if (s1) oppStopIds.add(s1.stop);
          const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === targetSeq);
          if (s2) oppStopIds.add(s2.stop);

          const etaPromises = Array.from(oppStopIds).map(sid => 
            BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({data:[]}))
          );
          
          const etaResults = await Promise.all(etaPromises);
          
          etaResults.forEach(res => {
            (res.data || []).forEach(item => {
              const itemDest = item.dest_tc || "";
              if (parseInt(item.seq) === targetSeq && itemDest.includes(destKey)) {
                item._company = oppCompany;
                combinedEtaList.push(item);
              }
            });
          });
        } catch (e) { console.error("Opponent ETA failed"); }
      }

      // ==========================================
      // 【Step 3】過濾無效數據、X巴時段 + 排序
      // ==========================================
      const seen = new Set();
      combinedEtaList = combinedEtaList.filter(item => {
        const etaStr = String(item.eta || "").trim().toUpperCase();
        const rmwStr = String(item.rmk_tc || "").trim();

        // 1. 踢走所有無效嘅 ETA (空字串、N/A、null)
        if (etaStr === "" || etaStr === "N/A" || etaStr === "NULL" || etaStr === "UNDEFINED") {
            return false;
        }

        // 2. ★ 踢走所有「X巴時段」、「非九巴時段」、「沒有預定班次」等無謂備註
        if (rmwStr.includes("時段") || rmwStr.includes("預定班次") || rmwStr === "離開") {
            return false;
        }

        // 3. 去重 (防止同時間同目的地出現兩次)
        const key = `${item._company}_${etaStr}_${item.dest_tc}`;
        if (seen.has(key)) return false;
        seen.add(key);

        return true;
      });

      combinedEtaList.sort((a, b) => new Date(a.eta) - new Date(b.eta));

      // ==========================================
      // 【Step 4】畫 UI
      // ==========================================
      etaBlock.innerHTML = "";
      if (combinedEtaList.length === 0) {
        etaBlock.textContent = "暫時冇班次資料";
      } else {
        combinedEtaList.forEach(item => {
          const { text, minutes, isScheduled, status, etaTime } = formatDetailLine(item);
          const row = document.createElement("div");
          row.className = "eta-row";
          if (minutes <= 0) row.classList.add("eta-imminent");

          const contentNode = document.createElement("span");
          const badge = isCrossHarbour ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
          contentNode.textContent = badge + text;
          row.appendChild(contentNode);

          const btnTrack = document.createElement("button");
          btnTrack.className = "btn-track";
          btnTrack.textContent = "追蹤";
          btnTrack.onclick = (e) => {
            e.stopPropagation();
            if (typeof setTrackingEta === 'function') setTrackingEta({ id: item.eta_seq || `${routeName}_${item.seq}_${item.eta}`, etaTime, status }, row);
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
  setTimeout(() => { if (typeof focusMapToStop === 'function') focusMapToStop(stopId, 16, true); }, 500);
}


function focusMapToStop(stopId, zoomLevel = 16, openPopup = false) {
  if (!map || !stopsLayer || !stopId) return;
  const info = allStopsMap.get(stopId);
  if (!info) return;

  const lat = parseFloat(info.lat);
  const lon = parseFloat(info.long);
  if (!isFinite(lat) || !isFinite(lon)) return;

  map.setView([lat, lon], zoomLevel);

  if (openPopup) {
    stopsLayer.eachLayer(layer => {
      if (!layer.getLatLng) return;
      const ll = layer.getLatLng();
      if (Math.abs(ll.lat - lat) < 1e-5 && Math.abs(ll.lng - lon) < 1e-5) {
        if (layer.openPopup) layer.openPopup();
      }
    });
  }
}

/* ========== Step3：估用家喺轉車站搭緊邊班車 ========== */

function setBoardingInfoTextForTransferStop(text) {
  if (!transferStopId) return;
  const stopEl = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
  if (!stopEl) return;
  const span = stopEl.querySelector(".stop-boarding-info");
  if (!span) return;
  span.textContent = text || "";
}

async function ensureDefaultTrackingAtOrigin() {
  if (!originStopId || !currentRoute || !currentDirectionCode) return;

  // 如果已經追蹤緊，就唔郁佢
  if (selectedEtaTime) return;

  try {
    const data = await fetchJSON(
      `${KMB_BASE}/eta/${originStopId}/${currentRoute.route}/${currentServiceType}`
    );
    let list = data.data || [];
    list = list.filter(item => item.dir === currentDirectionCode && item.eta);

    if (!list.length) return;

    const first = list[0];
    const detail = formatDetailLine(first);
    if (!detail.etaTime) return;

    // 用 index 0 做預設 id
    const etaObj = {
      id: `${originStopId}-0`,
      etaTime: detail.etaTime,
      status: detail.status
    };

    // 後台 setTracking（唔靠 click event）
    setTrackingEta(etaObj, null);
  } catch (e) {
    console.error("ensureDefaultTrackingAtOrigin error", e);
  }
}

function setInterchangeOrigin(stopId, stopName) {
  mode = "interchange_pick";
  originStopId = stopId;
  transferStopId = stopId;
  transferStopName = normalizeStopName(stopName);

  // 你原本顯示 Step 4、更新 interchangeInfo / 控制區嘅代碼
  const icInfo = document.getElementById("interchangeInfo");
  if (icInfo) {
    icInfo.textContent = `已選轉車站：${stopName}`;
  }
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) tSec.style.display = "block";

  // ★ 新增：即刻移地圖去轉車站，順便開 popup
  focusMapToStop(stopId, 16, true);
}



// targetTime: 預計到達轉車站時間（Date）
// targetStatus: "not_departed" / "departed"
// candidates: [{ time: Date, status: "not_departed"/"departed", isScheduled }]
function findClosestMatchingBus(targetTime, targetStatus, candidates) {
  if (!candidates || !candidates.length || !targetTime) {
    return { type: "untrackable", bus: null, reason: "no_candidates" };
  }

  // ====== 1. 基於候選班次計車距（平均班距），再決定 LIMIT_MIN ======

  // 將全部時間排序
  const timesSorted = candidates
    .map(c => c.time)
    .filter(t => t instanceof Date && !isNaN(t))
    .sort((a, b) => a - b);

  let limitMin = 10; // default：計唔到車距就用 10 分鐘

  if (timesSorted.length >= 2) {
    const diffs = [];
    for (let i = 1; i < timesSorted.length; i++) {
      const diff = Math.round((timesSorted[i] - timesSorted[i - 1]) / 60000);
      if (diff > 0) diffs.push(diff);
    }
    if (diffs.length) {
      const sum = diffs.reduce((a, b) => a + b, 0);
      const avgHeadway = sum / diffs.length;  // 平均車距（分鐘）
      limitMin = avgHeadway / 2;             // ★ 用車距 / 2 當 LIMIT_MIN
    }
  }

  // ====== 2. 根據 targetStatus 分兩類搵最近 ======

  // 目標 status 相同嘅候選
  const sameStatus = candidates.filter(c => c.status === targetStatus);
  // 目標 status 不同嘅候選（作備用）
  const otherStatus = candidates.filter(c => c.status !== targetStatus);

  function pickClosest(list) {
    let best = null;
    let bestAbsMin = Infinity;
    list.forEach(c => {
      const diffMs = c.time - targetTime;
      const diffMin = diffMs / 60000;
      const absMin = Math.abs(diffMin);
      if (absMin < bestAbsMin) {
        bestAbsMin = absMin;
        best = { bus: c, diffMin, absMin };
      }
    });
    return best;
  }

  // 先喺同 status 裏面揀最近
  let result = pickClosest(sameStatus);

  // 如果同 status 入面冇任何候選，就用不同 status 做 fallback
  if (!result && otherStatus.length) {
    result = pickClosest(otherStatus);
  }

  if (!result) {
    return { type: "untrackable", bus: null, reason: "no_match" };
  }

  // 超出 LIMIT_MIN → 視為追蹤唔到
  if (result.absMin > limitMin) {
    return { type: "untrackable", bus: null, reason: "too_far", limitMin, diffMin: result.diffMin };
  }

  return { type: "ok", bus: result.bus, diffMin: result.diffMin, limitMin };
}

async function guessBoardingBusAtTransferStop() {
  // 條件唔齊，一律當追蹤唔到
  if (!selectedEtaTime || !originStopId || !transferStopId || !cumulativeTravelFromOrigin) {
    trackedTransferArriveTime = null;
    setBoardingInfoTextForTransferStop("無法追蹤");
    const stopEl0 = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
    if (stopEl0) {
      stopEl0.querySelectorAll(".eta-row.transfer-tracked")
        .forEach(row => row.classList.remove("transfer-tracked"));
    }
    return;
  }
  if (!currentRoute || !currentDirectionCode) {
    trackedTransferArriveTime = null;
    setBoardingInfoTextForTransferStop("無法追蹤");
    const stopEl0 = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
    if (stopEl0) {
      stopEl0.querySelectorAll(".eta-row.transfer-tracked")
        .forEach(row => row.classList.remove("transfer-tracked"));
    }
    return;
  }

  // 進入時先清一次轉車站 highlight
  // 由於我哋有 transferSeq，盡量用得精準啲，無就 fallback 用 ID
  let targetSeq = typeof transferSeq !== "undefined" ? transferSeq : null;
  let stopElInit = targetSeq 
    ? document.querySelector(`.stop-item[data-stop-id="${transferStopId}"][data-seq="${targetSeq}"]`)
    : document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
    
  if (!stopElInit) stopElInit = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);

  if (stopElInit) {
    stopElInit.querySelectorAll(".eta-row.transfer-tracked")
      .forEach(row => row.classList.remove("transfer-tracked"));
  }

  const info = cumulativeTravelFromOrigin[transferStopId];
  if (!info) {
    trackedTransferArriveTime = null;
    setBoardingInfoTextForTransferStop("無法追蹤");
    return;
  }

  const departTime = selectedEtaTime;
  const travelMin = info.travelMinutes || 0;
  const arriveAtTransfer = new Date(departTime.getTime() + travelMin * 60000);

  // ==========================================
  // 【準備終極跨公司 ETA】
  // ==========================================
  const company = currentRoute.company || "KMB";
  const routeName = currentRoute.route;
  const isCrossHarbour = /^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName);

  let destKey = (currentRoute.dest_tc || "").substring(0, 2);
  const allItems = document.querySelectorAll("#stopList .stop-item");
  if (allItems.length > 0) {
    const lastStopEl = allItems[allItems.length - 1];
    let cleanName = lastStopEl.textContent.replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
    if (cleanName.length >= 2) destKey = cleanName.substring(0, 2); 
  }

  try {
    let combinedEtaList = [];

    // Step 1: 攞主公司 ETA
    try {
      let mainData;
      if (typeof BusAPI !== 'undefined' && BusAPI.getEta) {
        mainData = await BusAPI.getEta(company, transferStopId, routeName, currentServiceType);
      } else {
        mainData = await fetchJSON(`${KMB_BASE}/eta/${transferStopId}/${routeName}/${currentServiceType}`);
      }
      let mainList = mainData.data || [];
      if (currentDirectionCode && company === "KMB") {
        mainList = mainList.filter(item => item.dir === currentDirectionCode);
      }
      if (targetSeq !== null) {
        mainList = mainList.filter(item => parseInt(item.seq) === parseInt(targetSeq));
      }
      mainList.forEach(item => { item._company = company; combinedEtaList.push(item); });
    } catch (e) { console.error("Guess Main ETA failed"); }

    // Step 2: 攞對家公司 ETA (聯營線專用)
    if (isCrossHarbour && destKey && typeof BusAPI !== 'undefined') {
      const oppCompany = company === "KMB" ? "CTB" : "KMB";
      try {
        const [oppIn, oppOut] = await Promise.all([
          BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({data:[]})),
          BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({data:[]}))
        ]);

        const oppStopIds = new Set();
        if (targetSeq !== null) {
          const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === parseInt(targetSeq));
          if (s1) oppStopIds.add(s1.stop);
          const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === parseInt(targetSeq));
          if (s2) oppStopIds.add(s2.stop);
        }

        const etaPromises = Array.from(oppStopIds).map(sid => 
          BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({data:[]}))
        );
        const etaResults = await Promise.all(etaPromises);
        
        etaResults.forEach(res => {
          (res.data || []).forEach(item => {
            const itemDest = item.dest_tc || "";
            if (itemDest.includes(destKey)) {
              if (targetSeq !== null && parseInt(item.seq) !== parseInt(targetSeq)) return;
              item._company = oppCompany;
              combinedEtaList.push(item);
            }
          });
        });
      } catch (e) { console.error("Guess Opponent ETA failed"); }
    }

    // Step 3: 過濾 X巴時段 及 無效班次
    const seen = new Set();
    combinedEtaList = combinedEtaList.filter(item => {
      const etaStr = String(item.eta || "").trim().toUpperCase();
      const rmwStr = String(item.rmk_tc || "").trim();

      if (etaStr === "" || etaStr === "N/A" || etaStr === "NULL" || etaStr === "UNDEFINED") return false;
      if (rmwStr.includes("時段") || rmwStr.includes("預定班次") || rmwStr === "離開") return false;

      const key = `${item._company}_${etaStr}_${item.dest_tc}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!combinedEtaList.length) {
      trackedTransferArriveTime = null;
      setBoardingInfoTextForTransferStop("無法追蹤");
      return;
    }

    const actualEtas = combinedEtaList.map((item, idx) => {
      const d = formatDetailLine(item);
      if (!d.etaTime) return null;
      return {
        index: idx,
        time: d.etaTime,
        status: d.status,
        isScheduled: d.isScheduled
      };
    }).filter(Boolean);

    if (!actualEtas.length) {
      trackedTransferArriveTime = null;
      setBoardingInfoTextForTransferStop("無法追蹤");
      return;
    }

    // ==========================================
    // 【配對及畫 UI】
    // ==========================================
    const targetStatus = selectedEtaStatus || "not_departed";
    const result = findClosestMatchingBus(arriveAtTransfer, targetStatus, actualEtas);

    if (result.type === "untrackable") {
      trackedTransferArriveTime = null;
      setBoardingInfoTextForTransferStop("無法追蹤");
      return;
    }

    const matched = result.bus;

    // ★ 成功追蹤：記低實際到達轉車站時間
    trackedTransferArriveTime = matched.time;

    const tStr = formatTimeHHMM(matched.time);
    setBoardingInfoTextForTransferStop(`搭緊：${tStr}`);

    // ★ 同步高亮轉車站 eta-block 入面對應嗰行
    if (stopElInit) {
      const etaRows = stopElInit.querySelectorAll(".eta-row");
      etaRows.forEach(row => {
        const span = row.querySelector("span");
        if (!span) return;
        const text = span.textContent || "";
        
        // 【核心修正】用 includes 代替 startsWith，防止比 [城巴] 標籤阻礙
        if (text.includes(tStr)) {
          row.classList.add("transfer-tracked");
        } else {
          row.classList.remove("transfer-tracked");
        }
      });
    }

  } catch (e) {
    console.error("guessBoardingBusAtTransferStop error", e);
    trackedTransferArriveTime = null;
    setBoardingInfoTextForTransferStop("無法追蹤");
  }
}


/* ========== Step3 ETA 詳情（含追蹤） ========== */
async function loadEtaDetailForStop(stopId, seq) {
  // 確保 seq 係數字
  const targetSeq = parseInt(seq);

  // 1. 搵 UI Element
  let el = null;
  if (!isNaN(targetSeq)) {
    el = document.querySelector(`.stop-item[data-stop-id="${stopId}"][data-seq="${targetSeq}"]`);
  }
  if (!el) {
    el = document.querySelector(`.stop-item[data-stop-id="${stopId}"]`);
  }
  if (!el) return;

  const etaBlock = el.querySelector(".eta-block");
  if (!etaBlock) return;
  etaBlock.textContent = "載入 ETA 中...";

  // 2. 準備終點站關鍵字 (用嚟對齊城巴方向)
  let destKey = (currentRoute.dest_tc || "").substring(0, 2);
  const allItems = document.querySelectorAll("#stopList .stop-item");
  if (allItems.length > 0) {
    const lastStopEl = allItems[allItems.length - 1];
    const cloneEl = lastStopEl.cloneNode(true);
    const etaDiv = cloneEl.querySelector(".eta-block");
    if (etaDiv) etaDiv.remove();
    let cleanName = cloneEl.textContent.replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
    if (cleanName.length >= 2) destKey = cleanName.substring(0, 2); 
  }

  try {
    let combinedEtaList = [];
    const company = currentRoute.company || "KMB";
    const routeName = currentRoute.route;
    const isCrossHarbour = /^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName);

    // ==========================================
    // 【Step 1】攞「主公司」嘅 ETA
    // ==========================================
    try {
      // 建議用 BusAPI.getEta 統一處理，如果無，就跌返落你原本個 fetchJSON
      let mainData;
      if (typeof BusAPI !== 'undefined' && BusAPI.getEta) {
        mainData = await BusAPI.getEta(company, stopId, routeName, currentServiceType);
      } else {
        mainData = await fetchJSON(`${KMB_BASE}/eta/${stopId}/${routeName}/${currentServiceType}`);
      }
      
      let mainList = mainData.data || [];
      if (!isNaN(targetSeq)) {
        mainList = mainList.filter(item => parseInt(item.seq) === targetSeq);
      }
      if (currentDirectionCode && company === "KMB") {
        mainList = mainList.filter(item => item.dir === currentDirectionCode);
      }
      mainList.forEach(item => {
        item._company = company;
        combinedEtaList.push(item);
      });
    } catch (e) { console.error("Main ETA failed", e); }

    // ==========================================
    // 【Step 2】聯營線攞「對家公司」ETA (用關鍵字過濾)
    // ==========================================
    if (isCrossHarbour && destKey && typeof BusAPI !== 'undefined') {
      const oppCompany = company === "KMB" ? "CTB" : "KMB";
      try {
        const [oppIn, oppOut] = await Promise.all([
          BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({data:[]})),
          BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({data:[]}))
        ]);

        const oppStopIds = new Set();
        const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s1) oppStopIds.add(s1.stop);
        const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s2) oppStopIds.add(s2.stop);

        const etaPromises = Array.from(oppStopIds).map(sid => 
          BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({data:[]}))
        );
        const etaResults = await Promise.all(etaPromises);
        
        etaResults.forEach(res => {
          (res.data || []).forEach(item => {
            const itemDest = item.dest_tc || "";
            if (parseInt(item.seq) === targetSeq && itemDest.includes(destKey)) {
              item._company = oppCompany;
              combinedEtaList.push(item);
            }
          });
        });
      } catch (e) { console.error("Opponent ETA failed", e); }
    }

    // ==========================================
    // 【Step 3】過濾無效數據、時段備註 + 排序
    // ==========================================
    const seen = new Set();
    combinedEtaList = combinedEtaList.filter(item => {
      const etaStr = String(item.eta || "").trim().toUpperCase();
      const rmwStr = String(item.rmk_tc || "").trim();

      if (etaStr === "" || etaStr === "N/A" || etaStr === "NULL" || etaStr === "UNDEFINED") return false;
      if (rmwStr.includes("時段") || rmwStr.includes("預定班次") || rmwStr === "離開") return false;

      const key = `${item._company}_${etaStr}_${item.dest_tc}`;
      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    });

    combinedEtaList.sort((a, b) => new Date(a.eta) - new Date(b.eta));

    // ==========================================
    // 【Step 4】畫 UI (保留你原本嘅邏輯)
    // ==========================================
    etaBlock.innerHTML = "";
    if (!combinedEtaList.length) {
      etaBlock.textContent = "暫時冇班次資料";
    } else {
      combinedEtaList.forEach(item => {
        const { text, minutes, isScheduled, status, etaTime } = formatDetailLine(item);

        const row = document.createElement("div");
        row.className = "eta-row";
        if (minutes <= 0) {
          row.classList.add("eta-imminent");
        } else if (typeof grayColorByMinutes === 'function') {
          // 保留你原本嘅顏色漸變效果
          row.style.color = grayColorByMinutes(minutes);
        }

        const contentNode = document.createElement("span");
        // 加入公司 Badge 方便識別
        const badge = isCrossHarbour ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
        contentNode.textContent = badge + text;
        if (isScheduled) contentNode.style.fontStyle = "italic";
        row.appendChild(contentNode);

        // ★ 保留你嘅核心改動：判斷需唔需要顯示「追蹤」按鈕
        let showTrackBtn = true;
        if (typeof mode !== 'undefined' && (mode === "interchange_pair" || mode === "interchange_pick")) {
          const isOrigin = (stopId === originStopId && (!originSeq || targetSeq === parseInt(originSeq)));
          if (!isOrigin) {
            showTrackBtn = false;
          }
        }

        if (showTrackBtn) {
          const btnTrack = document.createElement("button");
          btnTrack.className = "btn-track";
          btnTrack.textContent = "追蹤";
          btnTrack.onclick = (e) => {
            e.stopPropagation();
            if (typeof setTrackingEta === 'function') {
               setTrackingEta({ id: item.eta_seq || `${routeName}_${item.seq}_${item.eta}`, etaTime, status }, row);
            }
          };
          row.appendChild(btnTrack);
        }

        etaBlock.appendChild(row);
      });
    }
  } catch (e) {
    console.error(e);
    etaBlock.textContent = "載入 ETA 失敗：" + e.message;
  }
}




// 自動追蹤第一班車 Helper
function autoTrackFirstEta(stopId, seq) {
  let attempts = 0;
  
  // 每 500ms Check 一次 ETA load 完未，最多 Check 20 次 (10秒)
  const interval = setInterval(() => {
    attempts++;
    
    // 搵返對應嘅車站 UI
    const stopDiv = document.querySelector(`.stop-item[data-stop-id="${stopId}"][data-seq="${seq}"]`);
    
    if (stopDiv) {
      // 我哋喺 loadEtaDetailForStop 入面已經統一將追蹤制叫 '.btn-track'
      const firstEtaBtn = stopDiv.querySelector('.btn-track'); 
      
      if (firstEtaBtn) {
        // 一見到第一班車個制，即刻模擬手動撳落去
        firstEtaBtn.click(); 
        console.log("自動追蹤成功！");
        clearInterval(interval); // 搞掂收工
        return;
      }
    }
    
    // 等咗 10 秒 (20次 x 500ms) 都無就放棄，避免無限 Loop
    if (attempts >= 20) {
      console.log("自動追蹤 Timeout，可能真係無車");
      clearInterval(interval); 
    }
  }, 500);
}


/* ========== 單線班距 / summary ========== */

async function loadEtaSummaryForAllStopsNormal() {
  if (!currentRoute) return;

  const promises = routeStops.map(s =>
    fetchJSON(`${KMB_BASE}/eta/${s.stop_id}/${currentRoute.route}/${currentServiceType}`)
      .then(data => ({ stop_id: s.stop_id, list: data.data || [] }))
      .catch(() => ({ stop_id: s.stop_id, list: [] }))
  );

  try {
    const results = await Promise.all(promises);
    etaTimesByStop = {};

    results.forEach(({ stop_id, list }) => {
      if (currentDirectionCode) {
        list = list.filter(item => item.dir === currentDirectionCode);
      }
      const stopEl = document.querySelector(`.stop-item[data-stop-id="${stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;

      if (!list.length) {
        summarySpan.textContent = "";
        summarySpan.style.color = "#000000";
        summarySpan.style.fontWeight = "normal";
        etaTimesByStop[stop_id] = [];
        return;
      }

      const times = [];
      list.forEach(item => {
        if (item.eta) times.push(new Date(item.eta));
      });
      times.sort((a, b) => a - b);
      etaTimesByStop[stop_id] = times;

      const first = list[0];
      const { minutes, label } = minutesAndLabel(first.eta);

      summarySpan.textContent = label;
      summarySpan.style.fontWeight = minutes <= 0 ? "bold" : "normal";
      summarySpan.style.color = minutes <= 0 ? "#d32f2f" : grayColorByMinutes(minutes);
    });
  } catch (e) {
    console.error("loadEtaSummaryForAllStopsNormal error", e);
  }
}

async function loadEtaSummaryForAllStops() {
  if (!originStopId) {
    await loadEtaSummaryForAllStopsNormal();
    return;
  }

  if (!currentRoute || !cumulativeTravelFromOrigin) {
    routeStops.forEach(s => {
      const stopEl = document.querySelector(`.stop-item[data-stop-id="${s.stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;
      summarySpan.textContent = "";
      summarySpan.style.color = "#000000";
      summarySpan.style.fontWeight = "normal";
    });
    return;
  }

  let originEta = null;
  try {
    const data = await fetchJSON(
      `${KMB_BASE}/eta/${originStopId}/${currentRoute.route}/${currentServiceType}`
    );
    let list = data.data || [];
    if (currentDirectionCode) {
      list = list.filter(item => item.dir === currentDirectionCode);
    }
    if (list.length > 0 && list[0].eta) {
      originEta = new Date(list[0].eta);
    }
  } catch (e) {
    console.error("load origin ETA failed", e);
  }

  const baseDepart = selectedEtaTime || originEta;

  routeStops.forEach(s => {
    const stopEl = document.querySelector(`.stop-item[data-stop-id="${s.stop_id}"]`);
    if (!stopEl) return;
    const summarySpan = stopEl.querySelector(".stop-eta-summary");
    if (!summarySpan) return;

    const info = cumulativeTravelFromOrigin[s.stop_id];

    if (!info || !baseDepart) {
      summarySpan.textContent = "";
      summarySpan.style.color = "#000000";
      summarySpan.style.fontWeight = "normal";
      return;
    }

    const travelMin = info.travelMinutes || 0;
    const arrive = new Date(baseDepart.getTime() + travelMin * 60000);
    const hh = String(arrive.getHours()).padStart(2, "0");
    const mm = String(arrive.getMinutes()).padStart(2, "0");

    summarySpan.textContent =
      `行駛 ${travelMin} 分鐘 (${hh}:${mm} 到達)`;
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
    
    // ★ 修正 1：統一叫 isJointRoute，唔好再叫 isCrossHarbour 啦！
    const isJointRoute = /^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName);

    let destKey = (currentRoute.dest_tc || "").substring(0, 2);
    if (routeStops.length > 0) {
      const lastStop = routeStops[routeStops.length - 1];
      let cleanName = lastStop.name_tc.replace(/^[\d\s.\-、]+/, "").replace(/\s+/g, "");
      if (cleanName.length >= 2) destKey = cleanName.substring(0, 2); 
    }

    // ==========================================
    // 1. 攞主公司班次 (自動判斷 KMB 定 CTB)
    // ==========================================
    if (company === "KMB") {
      try {
        const mainData = await fetchJSON(`${KMB_BASE}/eta/${targetStopId}/${routeName}/${currentServiceType}`);
        let mainList = mainData.data || [];
        if (currentDirectionCode) {
          mainList = mainList.filter(item => item.dir === currentDirectionCode);
        }
        mainList.forEach(item => combinedEtaList.push(item));
      } catch (e) { console.error("Headway KMB main ETA failed"); }
    } 
    else if (company === "CTB" && typeof BusAPI !== "undefined") {
      try {
        const mainData = await BusAPI.getEta("CTB", targetStopId, routeName, currentServiceType);
        let mainList = mainData.data || [];
        
        // ★ 修正 2：城巴都一樣用 dir ("I"/"O") 過濾方向，最穩陣！
        if (currentDirectionCode) {
          mainList = mainList.filter(item => item.dir === currentDirectionCode);
        }

        mainList.forEach(item => {
          const itemDest = item.dest_tc || "";
          // destKey 作為雙重保險
          if (destKey && itemDest && !itemDest.includes(destKey)) return;
          combinedEtaList.push(item);
        });
      } catch (e) { console.error("Headway CTB main ETA failed"); }
    }

    // ==========================================
    // 2. 攞聯營線「對家」班次 (只限主線係九巴嘅聯營線)
    // ==========================================
    // 呢度終於認得 isJointRoute 啦！
    if (isJointRoute && company === "KMB" && destKey && typeof BusAPI !== "undefined") {
      const oppCompany = "CTB";
      try {
        const [oppIn, oppOut] = await Promise.all([
          BusAPI.getRouteStops(oppCompany, routeName, "inbound", currentServiceType).catch(() => ({data:[]})),
          BusAPI.getRouteStops(oppCompany, routeName, "outbound", currentServiceType).catch(() => ({data:[]}))
        ]);
        
        const oppStopIds = new Set();
        const s1 = (oppIn.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s1) oppStopIds.add(s1.stop);
        const s2 = (oppOut.data || []).find(s => parseInt(s.seq) === targetSeq);
        if (s2) oppStopIds.add(s2.stop);

        const etaPromises = Array.from(oppStopIds).map(sid => 
          BusAPI.getEta(oppCompany, sid, routeName, currentServiceType).catch(() => ({data:[]}))
        );
        const etaResults = await Promise.all(etaPromises);
        
        etaResults.forEach(res => {
          (res.data || []).forEach(item => {
            const itemDest = item.dest_tc || "";
            if (itemDest.includes(destKey)) {
              combinedEtaList.push(item);
            }
          });
        });
      } catch (e) { console.error("Headway CTB opp ETA failed"); }
    }

    // ==========================================
    // 3. 過濾垃圾數據 + 分鐘級去重 + 排序
    // ==========================================
    const times = [];
    const seen = new Set();
    
    combinedEtaList.forEach(item => {
      const etaStr = String(item.eta || "").trim().toUpperCase();
      const rmwStr = String(item.rmk_tc || "").trim();
      
      if (etaStr === "" || etaStr === "N/A" || etaStr === "NULL") return;
      if (rmwStr.includes("時段") || rmwStr.includes("預定班次") || rmwStr === "離開") return;
      
      const t = new Date(item.eta);
      if (isNaN(t.getTime())) return;

      // ★ 核心修正 3：以「分鐘」為單位去重。
      // 萬一九巴同城巴同時報 18:30 嗰班車，只會計一次，唔會搞到有 0 分鐘班距。
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

    // ==========================================
    // 4. 計算平均班距
    // ==========================================
    const diffs = [];
    for (let i = 1; i < times.length; i++) {
      const diffMin = Math.round((times[i] - times[i - 1]) / 60000);
      // 容許 2 至 60 分鐘嘅正常班距 (307 嘅 30 分鐘會完美跌入呢度)
      if (diffMin >= 2 && diffMin <= 60) {
        diffs.push(diffMin);
      }
    }

    if (!diffs.length) {
      infoDiv.textContent = "班距資料不足。";
      return;
    }

    const sum = diffs.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / diffs.length);

    const stopNameLocal = targetStopInfo ? targetStopInfo.name_tc : "此站";
    infoDiv.textContent = `${stopNameLocal} 大約 ${avg} 分鐘一班車`;

  } catch (e) {
    console.error("loadHeadwayInfo error", e);
    infoDiv.textContent = "班距資料不足。";
  }
}

/* ========== Step4：轉車路線 / 方向 / 站（與之前相同） ========== */

async function selectTransferRoute(route) {
  if (transferEtaTimer) { clearInterval(transferEtaTimer); transferEtaTimer = null; }

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

  // ★ 功能 1：清空路線搜尋結果，隱藏 798A 等其他選項
  const routeListContainer = document.getElementById("transferRouteList"); // ⚠️ 確保呢個 ID 夾返你 HTML 個名
  if (routeListContainer) routeListContainer.innerHTML = "";
  
  // 順便清埋輸入框 (Optional, 睇你想唔想)
  // const transferInput = document.getElementById("transferRouteInput");
  // if (transferInput) transferInput.value = "";

  const btnIn = document.getElementById("transferDirInbound");
  const btnOut = document.getElementById("transferDirOutbound");
  if (!btnIn || !btnOut) return;
  
  // 重置顯示狀態
  btnIn.style.display = ""; 
  btnOut.style.display = "";
  btnIn.disabled = true;
  btnOut.disabled = true;
  btnIn.textContent = "載入方向中...";
  btnOut.textContent = "載入方向中...";

  transferKeyboardHidden = true;
  if (typeof renderTransferVirtualKeyboard === "function") {
    renderTransferVirtualKeyboard();
  }

  try {
    const routeId = transferRoute.route;
    const st = transferServiceType;
    const company = transferRoute.company || "KMB"; // ★ 攞返間公司出嚟

    let inData, outData;

    // ★ 功能 2：九巴城巴分流攞 Route-Stop
    if (company === "KMB") {
      [inData, outData] = await Promise.allSettled([
        fetchJSON(`${KMB_BASE}/route-stop/${routeId}/inbound/${st}`),
        fetchJSON(`${KMB_BASE}/route-stop/${routeId}/outbound/${st}`)
      ]);
    } else if (company === "CTB" && typeof BusAPI !== "undefined") {
      [inData, outData] = await Promise.allSettled([
        BusAPI.getRouteStops("CTB", routeId, "inbound", st),
        BusAPI.getRouteStops("CTB", routeId, "outbound", st)
      ]);
    } else {
      throw new Error("Unknown company or BusAPI not defined");
    }

    let inName = "?";
    let outName = "?";
    let hasInbound = false;
    let hasOutbound = false;

    // 處理 Inbound 數據
    if (inData.status === "fulfilled" && inData.value.data) {
      const list = inData.value.data.sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasInbound = true;
        const last = list[list.length - 1];
        const stopInfo = allStopsMap.get(last.stop);
        // 如果係城巴，stopInfo 會係 undefined，完美 fallback 去 route.dest_tc
        inName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.dest_tc);
      }
    }

    // 處理 Outbound 數據
    if (outData.status === "fulfilled" && outData.value.data) {
      const list = outData.value.data.sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasOutbound = true;
        const last = list[list.length - 1];
        const stopInfo = allStopsMap.get(last.stop);
        // 同上，城巴完美 fallback 去 route.orig_tc
        outName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.orig_tc);
      }
    }

    // 判斷係咪循環線，隱藏並自動 Click
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
      btnIn.textContent = `無此方向`;
      btnOut.textContent = `無此方向`;
    }

    const btnReset = document.getElementById("btnResetTransfer");
    if (btnReset) btnReset.style.display = "inline-block";
	saveAppState();
    
  } catch (e) {
    console.error("載入轉車方向失敗:", e);
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
  const company = transferRoute.company || "KMB"; // ★ 攞返間公司出嚟

  const d1 = document.getElementById("transferStopList");
  if (d1) d1.innerHTML = "載入路線站點中...";
  transferCurrentStopId = null;
  transferEtaTimesByStop = {};
 // const d2 = document.getElementById("transferHeadwayInfo");
//  if (d2) d2.textContent = "計算班距中...";

  try {
    let routeStopList = [];

    // ★ 核心修正：九巴同城巴分流攞站點清單
    if (company === "KMB") {
      const rsData = await fetchJSON(
        `${KMB_BASE}/route-stop/${routeId}/${transferDirection}/${serviceType}`
      );
      routeStopList = rsData.data || [];
    } else if (company === "CTB" && typeof BusAPI !== "undefined") {
      const rsData = await BusAPI.getRouteStops("CTB", routeId, transferDirection, serviceType);
      routeStopList = rsData.data || [];
    } else {
      throw new Error("Unknown company or BusAPI not defined");
    }

// ★ 終極修正：並行 (Parallel) 查站名補飛機制
    const stopPromises = routeStopList.map(async (rs) => {
      let stopInfo = allStopsMap.get(rs.stop);
      
      // 如果 allStopsMap 搵唔到呢個站 (通常係城巴站未 load)
      if (!stopInfo && company === "CTB") {
        try {
          // 直接 Call 城巴 Data.gov.hk API 攞單一車站資料
          const res = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/stop/${rs.stop}`);
          const json = await res.json();
          if (json && json.data) {
            stopInfo = json.data;
            // ★ 寫入 allStopsMap！下次再撳同一個站就唔使 Call API，秒出！
            allStopsMap.set(rs.stop, stopInfo); 
          }
        } catch (e) {
          console.error(`無法載入城巴站名 (ID: ${rs.stop})`, e);
        }
      }

      return {
        stop_id: rs.stop,
        seq: rs.seq,
        name_tc: stopInfo && stopInfo.name_tc ? stopInfo.name_tc : (rs.name_tc || `(未知站名) ${rs.stop}`),
        name_en: stopInfo && stopInfo.name_en ? stopInfo.name_en : (rs.name_en || "")
      };
    });

    // 等待所有站名都查完，然後順序排返好
    transferRouteStops = (await Promise.all(stopPromises)).sort((a, b) => a.seq - b.seq);

    shrinkTransferLayoutAfterDirectionChosen();

    renderTransferStopList();
    await loadTransferEtaSummaryForAllStops();
    await loadTransferHeadwayInfo();

    if (transferEtaTimer) clearInterval(transferEtaTimer);
    transferEtaTimer = setInterval(async () => {
      if (!transferRoute || !transferDirection || !transferRouteStops.length) return;
      await loadTransferEtaSummaryForAllStops();
      await loadTransferHeadwayInfo();
      if (transferCurrentStopId) {
        await selectTransferStop(transferCurrentStopId);
      }
    }, 30000);

    // ★ 搵預設第二程上車站
    if (transferStopName) {
      let targetStop = null;

      // 1) 優先用同名站
      const nameMatch = transferRouteStops.find(
        s => normalizeStopName(s.name_tc) === transferStopName
      );
      if (nameMatch) {
        targetStop = nameMatch;
      } else if (transferStopId) {
        // 2) 同名搵唔到，用直線最近站（<= 60 分鐘步行）
        const originInfo = allStopsMap.get(transferStopId);
        if (originInfo) {
          const oLat = parseFloat(originInfo.lat);
          const oLon = parseFloat(originInfo.long);
          if (isFinite(oLat) && isFinite(oLon)) {
            let best = null;
            let bestMinutes = Infinity;

            transferRouteStops.forEach(s => {
              const info = allStopsMap.get(s.stop_id);
              if (!info) return;
              const lat = parseFloat(info.lat);
              const lon = parseFloat(info.long);
              if (!isFinite(lat) || !isFinite(lon)) return;

              const dist = haversineDistanceMeters(oLat, oLon, lat, lon);
              const mins = dist / (4000 / 60); // 4km/h
              if (mins < bestMinutes) {
                bestMinutes = mins;
                best = s;
              }
            });

            if (best && bestMinutes <= 60) {
              targetStop = best;
            }
          }
        }
      }

      if (targetStop) {
        await selectTransferStop(targetStop.stop_id);
      }
	  saveAppState();
    }
  } catch (e) {
    console.error(e);
    const d1b = document.getElementById("transferStopList");
    if (d1b) d1b.textContent = "載入路線站點失敗：" + e.message;
	transferHeadNotOk();
 	
	}
	
}
  


function transferHeadNotOk(){
    const d2b = document.getElementById("transferHeadwayInfo");  
	const btn = document.querySelector(".btn-show-all-stops"); // 搵返個仔出嚟
			console.log(document.querySelector(".btn-show-all-stops"));
    if (d2b) {
		d2b.textContent = "班距資料不足。";
    if (btn) {

        d2b.appendChild(btn);
    }	
	
}
}

function clearSecondRouteVisual() {
  // 移除紅色 tag
  secondRouteMarkers.forEach(m => {
    if (map.hasLayer(m)) map.removeLayer(m);
  });
  secondRouteMarkers = [];

  // 移除綠色線
  if (transferLine && map.hasLayer(transferLine)) {
    map.removeLayer(transferLine);
  }
  transferLine = null;
  secondTransferStopId = null;
  resetFirstRouteFull();
}

function selectSecondRoute(transferStopId) {
  if (!map || !transferRouteStops || !transferRouteStops.length) return;

  clearSecondRouteVisual();

  secondTransferStopId = transferStopId;

  // 2. 用 transferRouteStops（Step 4 已經 load 好的站清單）畫紅色 tag
  transferRouteStops.forEach(rs => {
    const info = allStopsMap.get(rs.stop_id);
    if (!info) return;
    const lat = parseFloat(info.lat);
    const lon = parseFloat(info.long);
    if (!isFinite(lat) || !isFinite(lon)) return;

    const icon = L.divIcon({
      className: "stop-label second-route",
      html: `<span>${transferRoute.route}</span>`,  // 顯示第二架車 route 號
      iconSize: null
    });

    const marker = L.marker([lat, lon], { icon }).addTo(map);
    marker.stopId = rs.stop_id;
    secondRouteMarkers.push(marker);
  });

  // 3. 如有兩個轉車站，畫綠色直線（第一程轉車站 A － 第二程轉車站 B）
  const firstMarker = allStopMarkers.find(m => m.stopId === currentTransferStopId);
  const secondMarker = secondRouteMarkers.find(m => m.stopId === secondTransferStopId);

  if (firstMarker && secondMarker) {
    const latlngs = [firstMarker.getLatLng(), secondMarker.getLatLng()];

    transferLine = L.polyline(latlngs, {
      color: "green",
      weight: 4
    }).addTo(map);
  }
}


function shrinkTransferLayoutAfterDirectionChosen() {
  const routeText = transferRoute
    ? `${transferRoute.route}（${transferRoute.orig_tc} ↔ ${transferRoute.dest_tc}）`
    : "(未輸入)";

  let dirName = "";
  if (transferDirection === "inbound") {
    const btnText = document.getElementById("transferDirInbound").textContent || "";
    dirName = btnText.replace(/^往\s*|\s*方向$/g, "");
  } else if (transferDirection === "outbound") {
    const btnText = document.getElementById("transferDirOutbound").textContent || "";
    dirName = btnText.replace(/^往\s*|\s*方向$/g, "");
  }
  
  const mainLine = document.getElementById("transfer-main-line");
  const inputDisplay = document.getElementById("transferRouteInputDisplay"); // 搵返個仔出嚟

  if (mainLine) {
    mainLine.textContent = `轉車路線：${routeText}`;
    if (dirName) mainLine.textContent += ` 往 ${dirName} 方向`;
    
    // 2. 將個仔原封不動咁 append 返入去 mainLine 嘅最後面
    if (inputDisplay) {
      mainLine.appendChild(inputDisplay);
    }
  }

  const t1 = document.getElementById("step4-title");
  if (t1) t1.style.display = "none";
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

  const promises = transferRouteStops.map(s =>
    fetchJSON(`${KMB_BASE}/eta/${s.stop_id}/${transferRoute.route}/${transferServiceType}`)
      .then(data => ({ stop_id: s.stop_id, list: data.data || [] }))
      .catch(() => ({ stop_id: s.stop_id, list: [] }))
  );

  try {
    const results = await Promise.all(promises);
    transferEtaTimesByStop = {};

    results.forEach(({ stop_id, list }) => {
      if (transferDirectionCode) {
        list = list.filter(item => item.dir === transferDirectionCode);
      }
      const stopEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;

      if (!list.length) {
        summarySpan.textContent = "";
        summarySpan.style.color = "#000000";
        summarySpan.style.fontWeight = "normal";
        transferEtaTimesByStop[stop_id] = [];
        return;
      }

      const times = [];
      list.forEach(item => {
        if (item.eta) times.push(new Date(item.eta));
      });
      times.sort((a, b) => a - b);
      transferEtaTimesByStop[stop_id] = times;

      const first = list[0];
      const { minutes, label } = minutesAndLabel(first.eta);

      summarySpan.textContent = label;
      summarySpan.style.fontWeight = minutes <= 0 ? "bold" : "normal";
      summarySpan.style.color = minutes <= 0 ? "#d32f2f" : grayColorByMinutes(minutes);
    });
  } catch (e) {
    console.error("loadTransferEtaSummaryForAllStops error", e);
  }
}

async function loadTransferHeadwayInfo() {
  const infoDiv = document.getElementById("transferHeadwayInfo");
  if (!infoDiv) return;
  infoDiv.textContent = "計算班距中...";

  if (!transferRoute || !transferDirection) {
    infoDiv.textContent = "";
    return;
  }

  try {
    if (!transferRouteStops || !transferRouteStops.length) {
      infoDiv.textContent = "";
      return;
    }
	
    let btnShowAll = infoDiv.querySelector(".btn-show-all-stops");
    if (!btnShowAll) {
      btnShowAll = document.createElement("button");
      btnShowAll.className = "btn-show-all-stops";
      btnShowAll.textContent = "顯示全部站";
    btnShowAll.onclick = () => {

      // 1. 強制清空全域變數 (話畀系統知：而家無轉車站)
      transferCurrentStopId = null;

      // 2. 搵齊畫面上所有站，逐個大清洗
      const items = document.querySelectorAll("#transferStopList .stop-item");
      items.forEach(item => {
        // 強制顯示
        item.style.display = "";
        
        // 強制搣走所有 Highlight 同打開咗 ETA 嘅 Label
        item.classList.remove("selected", "eta-showing", "transfer-tracked");

        // 強制清空 ETA 區塊嘅文字同 HTML
        const etaBlock = item.querySelector(".eta-block");
        if (etaBlock) {
          etaBlock.innerHTML = "";
          etaBlock.textContent = "";
        }

        // 3. 強制重新綁定 onclick (用 getAttribute 確保拎到最準嘅 ID)
        const sid = item.getAttribute("data-stop-id");
        item.onclick = async () => {
          if (!transferCurrentStopId) {
            // 第一吓實會行呢度，因為上面已經 null 咗
            await selectTransferStop(sid);
          } else {
            // 揀完之後，再撳其他站就純睇 ETA
            if (sid === transferCurrentStopId) return;
            if (typeof checkTransferStopEta === "function") {
              await checkTransferStopEta(sid);
            }
          }
        };

      });

      // 4. 清空步行時間文字
      const walkInfoDiv = document.getElementById("transferWalkInfo");
      if (walkInfoDiv) walkInfoDiv.textContent = "";

      // 5. 自我毀滅個 Button
      btnShowAll.remove();
    };
      infoDiv.appendChild(document.createTextNode(" "));
      infoDiv.appendChild(btnShowAll);
    }	

    const targetStopId = transferCurrentStopId || transferRouteStops[0].stop_id;
    const times = (transferEtaTimesByStop && transferEtaTimesByStop[targetStopId])
      ? transferEtaTimesByStop[targetStopId]
      : [];

    if (!times || times.length < 2) {
		transferHeadNotOk();
      return;
    }

    const diffs = [];
    for (let i = 1; i < times.length; i++) {
      const diffMin = Math.round((times[i] - times[i - 1]) / 60000);
      if (diffMin > 0) diffs.push(diffMin);
    }

    if (!diffs.length) {
		transferHeadNotOk();
      return;
    }

    const sum = diffs.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / diffs.length);

    const stopInfo = transferRouteStops.find(s => s.stop_id === targetStopId);
    const stopNameLocal = stopInfo ? stopInfo.name_tc : "此站";
    infoDiv.textContent = `${stopNameLocal} 大約 ${avg} 分鐘一班車`;


  } catch (e) {
    console.error("loadTransferHeadwayInfo error", e);
		transferHeadNotOk();
  }
}

function clearTransferStopSelectionUI() {
  document.querySelectorAll("#transferStopList .stop-item.selected").forEach(el => {
    el.classList.remove("selected");
  });
  document.querySelectorAll("#transferStopList .eta-block").forEach(el => {
    el.innerHTML = "";
  });
}

// ★ 加入 seq 參數
async function selectTransferStop(stopId, seq) {
  transferCurrentStopId = stopId;
  
  // ★ 循環線補底：如果無傳入 seq，搵同 ID 第一個站嘅 seq 當頭站
  let actualSeq = seq;
  if (!actualSeq) {
    const match = transferRouteStops.find(s => s.stop_id === stopId);
    if (match) actualSeq = match.seq;
  }
  window.transferCurrentSeq = actualSeq; // ★ 記低個轉車站 seq，等陣其他 function 用

  clearTransferStopSelectionUI();
  
  // ★ 用埋 seq 去 querySelector，避免循環線點錯尾站
  let el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"][data-seq="${actualSeq}"]`); 
  if (!el) el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"]`); // Fallback
  if (!el) return;
  el.classList.add("selected");

  const etaBlock = el.querySelector(".eta-block");
  etaBlock.textContent = "載入 ETA 中...";

  let etaList = [];
  try {
    let list = [];
    const company = transferRoute.company || "KMB"; // ★ 攞返間公司出嚟

    // ★ 核心修正：九巴 / 城巴 ETA API 分流
    if (company === "KMB") {
      const data = await fetchJSON(
        `${KMB_BASE}/eta/${stopId}/${transferRoute.route}/${transferServiceType}`
      );
      list = data.data || [];
    } else if (company === "CTB") {
      // 直 Call 城巴 Data.gov.hk ETA API
      const res = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/eta/CTB/${stopId}/${transferRoute.route}`);
      const json = await res.json();
      list = json.data || [];
    }

    if (!isNaN(actualSeq)) {
      list = list.filter(item => parseInt(item.seq) === parseInt(actualSeq));
    }
    
    if (transferDirectionCode) {
      list = list.filter(item => item.dir === transferDirectionCode);
    }
    etaList = list;

    etaBlock.innerHTML = "";
    if (!list.length) {
      etaBlock.textContent = "暫時冇班次資料";
    } else {
      list.forEach(item => {
        const { text, minutes, isScheduled } = formatDetailLine(item);
        const row = document.createElement("div");
        row.className = "eta-row";
        if (minutes <= 0) {
          row.classList.add("eta-imminent");
        } else {
          row.style.color = grayColorByMinutes(minutes);
        }
        const contentNode = document.createElement("span");
        contentNode.textContent = text;
        if (isScheduled) contentNode.style.fontStyle = "italic";
        row.appendChild(contentNode);
        etaBlock.appendChild(row);
      });
    }
  } catch (e) {
    console.error(e);
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

      let arriveAtC;
      if (trackedTransferArriveTime) {
        arriveAtC = new Date(trackedTransferArriveTime.getTime() + walkMin * 60000);
      } else {
        arriveAtC = new Date(
          selectedEtaTime.getTime() + (travelMin + walkMin) * 60000
        );
      }

      let bestBus = null;
      let bestWaitMin = Infinity;

      etaList.forEach(item => {
        if (!item.eta) return;
        const etaTime = new Date(item.eta);
        const diffMs = etaTime - arriveAtC;
        const diffMin = diffMs / 60000;
        if (diffMin >= 0 && diffMin < bestWaitMin) {
          bestWaitMin = diffMin;
          bestBus = { etaTime, raw: item };
          window.transferBestBus = bestBus; 
        }
      });

      let walkText;
      if (walkMin < 1) walkText = "<1分鐘";
      else if (walkMin > 60) walkText = ">1小時";
      else walkText = `${Math.round(walkMin)}分鐘`;

      const rows = el.querySelectorAll(".eta-row");
      rows.forEach(row => row.classList.remove("transfer-tracked"));

      if (!bestBus || !isFinite(bestWaitMin)) {
        const hhmmArrive = formatTimeHHMM(arriveAtC);
        summaryText = `步行：約 ${walkText}；未有班次（約 ${hhmmArrive} 到達轉車站）`;
      } else {
        let waitText;
        if (bestWaitMin < 1) waitText = "<1分鐘";
        else if (bestWaitMin > 60) waitText = ">1小時";
        else waitText = `${Math.round(bestWaitMin)}分鐘`;

        summaryText = `步行：約 ${walkText}；轉車等候：約 ${waitText}`;

        const hhmm = formatTimeHHMM(bestBus.etaTime);
        rows.forEach(row => {
          const span = row.querySelector("span");
          if (!span) return;
          const text = span.textContent || "";
          if (text.startsWith(hhmm)) {
            row.classList.add("transfer-tracked");
          }
        });
      }
    }
  }

  if (walkInfoDiv) {
    if (summaryText) {
      walkInfoDiv.style.fontSize = "13px";
      walkInfoDiv.style.fontWeight = "bold";
      walkInfoDiv.textContent = summaryText;
    } else {
      walkInfoDiv.textContent = "";
    }
  }

  const allItems = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
  
  // ★ 精準搵出呢個站嘅 index，用 ID 同 seq 齊齊對
  let selectedIndex = allItems.findIndex(node => node.dataset.stopId === stopId && node.dataset.seq == actualSeq);
  if (selectedIndex === -1) {
    selectedIndex = allItems.findIndex(node => node.dataset.stopId === stopId); // Fallback
  }

  allItems.forEach((node, index) => {
    if (index < selectedIndex) {
      node.style.display = "none";
    } else {
      node.style.display = "";
    }
  });

  selectSecondRoute(stopId);
  
  saveAppState(); // ★ 加呢句，記住用家最後揀咗乜
}


function renderTransferStopList() {
  const container = document.getElementById("transferStopList");
  if (!container) return;
  container.innerHTML = "";
  transferRouteStops.forEach((s) => {
    const div = document.createElement("div");
    div.className = "stop-item";
    div.dataset.stopId = s.stop_id;
    div.dataset.seq = s.seq; // ★ 循環線對策：綁定埋 seq 落 DOM 度

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
    summarySpan.textContent = "";

    summaryWrapper.appendChild(summarySpan);

    header.appendChild(left);
    header.appendChild(summaryWrapper);

    const etaBlock = document.createElement("div");
    etaBlock.className = "eta-block";

    div.appendChild(header);
    div.appendChild(etaBlock);

    // ★ 乾淨版 onclick 邏輯：加入 seq 判斷
    div.onclick = async () => {
      if (!transferCurrentStopId) {
        // 情況 1：未揀轉車站 -> 呼叫 selectTransferStop 時帶埋 seq
        await selectTransferStop(s.stop_id, s.seq);
      } else {
        // 情況 2：已經有轉車站
        // ★ 確保 ID 同 seq 都一樣先當係撳返自己
        if (s.stop_id === transferCurrentStopId && s.seq == window.transferCurrentSeq) {
          return; 
        } else {
          // 撳其他站 -> 純睇 ETA (帶埋 seq)
          if (typeof checkTransferStopEta === "function") {
            await checkTransferStopEta(s.stop_id, s.seq);
          }
        }
      }
    };

    container.appendChild(div);
  });
}


async function checkTransferStopEta(stopId, seq) {

  // ★ 循環線補底
  let actualSeq = seq;
  if (!actualSeq) {
    const match = transferRouteStops.find(s => s.stop_id === stopId);
    if (match) actualSeq = match.seq;
  }

  // 1. 收埋其他站嘅 ETA (除咗轉車站同自己)
  const allItems = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
  allItems.forEach(item => {
    const thisStopId = item.dataset.stopId;
    const thisSeq = item.dataset.seq;
    
    // ★ 判斷係咪自己或者轉車站，要連埋 seq 一齊睇
    const isTransferStation = (thisStopId === transferCurrentStopId && thisSeq == window.transferCurrentSeq);
    const isCurrentStation = (thisStopId === stopId && thisSeq == actualSeq);

    if (!isTransferStation && !isCurrentStation) {
      item.classList.remove("eta-showing");
      const block = item.querySelector(".eta-block");
      if (block) block.innerHTML = "";
      
      const sSpan = item.querySelector(".stop-eta-summary");
      if (sSpan) sSpan.textContent = "";
    }
  });

  // ★ 用 ID + seq 精準搵 element
  let el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"][data-seq="${actualSeq}"]`); 
  if (!el) el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"]`);
  if (!el) return;

  const etaBlock = el.querySelector(".eta-block");
  const summarySpan = el.querySelector(".stop-eta-summary"); 

  // Toggle：如果打開緊，再撳就收埋
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
    summarySpan.style.fontWeight = "normal";
  }

  try {
    let list = [];
    const company = transferRoute.company || "KMB"; // ★ 攞返間公司出嚟

    // ★ 核心修正：九巴 / 城巴 ETA API 分流
    if (company === "KMB") {
      const data = await fetchJSON(
        `${KMB_BASE}/eta/${stopId}/${transferRoute.route}/${transferServiceType}`
      );
      list = data.data || [];
    } else if (company === "CTB") {
      // 直 Call 城巴 Data.gov.hk ETA API
      const res = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/eta/CTB/${stopId}/${transferRoute.route}`);
      const json = await res.json();
      list = json.data || [];
    }

    if (!isNaN(actualSeq)) {
        list = list.filter(item => parseInt(item.seq) === parseInt(actualSeq));
    }
    
    if (transferDirectionCode) {
      list = list.filter(item => item.dir === transferDirectionCode && item.eta);
    }

    etaBlock.innerHTML = "";
    if (!list.length) {
      etaBlock.textContent = "暫時冇班次資料";
    } 

    const actualEtas = [];
    const rowElementsMap = new Map();

    list.forEach((item, idx) => {
      const d = formatDetailLine(item);
      if (!d.etaTime) return;

      const etaObj = {
        index: idx,
        time: d.etaTime,
        status: d.status,
        isScheduled: d.isScheduled
      };
      actualEtas.push(etaObj);

      const row = document.createElement("div");
      row.className = "eta-row";
      if (d.minutes <= 0) {
        row.classList.add("eta-imminent");
      } else {
        row.style.color = typeof grayColorByMinutes === "function" ? grayColorByMinutes(d.minutes) : "#333";
      }
      
      const contentNode = document.createElement("span");
      contentNode.textContent = d.text;
      if (d.isScheduled) contentNode.style.fontStyle = "italic";
      
      row.appendChild(contentNode);
      etaBlock.appendChild(row);

      rowElementsMap.set(d.etaTime.getTime(), row);
    });

    // ★ 1. 預先計定個預計時間 (用作 Fallback 或 Tracking)
    let isTracked = false;
    let estimatedTravelMin = 0;
    let estimatedArriveTime = null;

    if (window.transferBestBus && window.transferBestBus.etaTime instanceof Date && transferCurrentStopId) {
      // ★ 喺 Array 入面搵返個站，都要加入 seq 嘅條件！
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

    // ★ 2. 嘗試 Tracking
    if (estimatedArriveTime && actualEtas.length > 0) {
      let targetStatus = "not_departed";
      if (typeof formatDetailLine === "function") {
         const detail = formatDetailLine(window.transferBestBus.raw);
         if (detail && detail.status) targetStatus = detail.status;
      }

      const trackResult = findClosestMatchingBus(estimatedArriveTime, targetStatus, actualEtas);

      if (trackResult && trackResult.type === "ok") {
        const matchedTimeKey = trackResult.bus.time.getTime();
        const targetRow = rowElementsMap.get(matchedTimeKey);
        
        if (targetRow) {
          targetRow.classList.add("transfer-tracked");
        }

        if (summarySpan) {
          const arriveDate = trackResult.bus.time;
          const hh = String(arriveDate.getHours()).padStart(2, "0");
          const mm = String(arriveDate.getMinutes()).padStart(2, "0");

          summarySpan.textContent = `搭緊: 預計 ${hh}:${mm} 到達`;
          summarySpan.style.color = "#007bff"; 
          summarySpan.style.fontWeight = "bold"; 
        }
        isTracked = true; 
      }
    }

    // ★ 3. Fallback
    if (!isTracked && summarySpan) {
      let finalTravelMin = null;
      let finalArriveTime = null;

      if (typeof cumulativeTravelFromOrigin !== "undefined" && cumulativeTravelFromOrigin[stopId] && typeof baseDepart !== "undefined" && baseDepart) {
        finalTravelMin = cumulativeTravelFromOrigin[stopId].travelMinutes || 0;
        finalArriveTime = new Date(baseDepart.getTime() + finalTravelMin * 60000);
      } 
      else if (estimatedArriveTime) {
        finalTravelMin = estimatedTravelMin;
        finalArriveTime = estimatedArriveTime;
      }

      if (finalArriveTime !== null) {
        const hh = String(finalArriveTime.getHours()).padStart(2, "0");
        const mm = String(finalArriveTime.getMinutes()).padStart(2, "0");

        summarySpan.textContent = `無法追蹤: 預計行駛 ${finalTravelMin} 分鐘 (${hh}:${mm} 到達)`;
        summarySpan.style.fontWeight = "normal";
        summarySpan.style.color = "#555555";
      } else {
        summarySpan.textContent = "";
      }
    }

  } catch (e) {
    console.error(e);
    etaBlock.textContent = "載入 ETA 失敗：" + e.message;
    if (summarySpan) summarySpan.textContent = "";
  }
}

// 1. 畫第一程藍線同藍點 (確保有數字 + 記住 seq)
async function showRouteStopsOnMap(stops) {
  if (window.mainRouteLine) map.removeLayer(window.mainRouteLine);
  if (window.allStopMarkers) {
      window.allStopMarkers.forEach(m => map.removeLayer(m));
  }
  window.allStopMarkers = [];

  const latlngs = [];
  stops.forEach(s => {
    const info = allStopsMap.get(s.stop_id);
    if (info) {
      const lat = parseFloat(info.lat);
      const lon = parseFloat(info.long);

      const icon = L.divIcon({
        className: "stop-label",
        html: `<div>${s.seq}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([lat, lon], { icon: icon }).addTo(map);
      marker.stopId = s.stop_id;
      marker.seq = parseInt(s.seq); // 確保轉做整數，方便後面隱藏
      
      const name = info.name_tc || s.stop_id;
      marker.bindPopup(`<b>${s.seq}. ${name}</b>`);
      
      window.allStopMarkers.push(marker);
      latlngs.push([lat, lon]);
    }
  });

  window.mainRouteLine = L.polyline(latlngs, {
    color: "#1976d2", weight: 4, opacity: 0.8
  }).addTo(map);

  if (latlngs.length > 0) {
    map.fitBounds(window.mainRouteLine.getBounds(), { padding: [20, 20] });
  }
}

// 2. 切斷藍線 + 隱藏轉車站之後嘅藍點
function updateFirstRouteFocus(targetStopId) {
    if (!routeStops || routeStops.length === 0) return;
    
    const stopIndex = routeStops.findIndex(s => s.stop_id === targetStopId);
    if (stopIndex === -1) return;
    
    const targetSeq = parseInt(routeStops[stopIndex].seq);

    // 隱藏站點
    window.allStopMarkers.forEach(m => {
        if (m.seq > targetSeq) {
            if (map.hasLayer(m)) map.removeLayer(m);
        } else {
            if (!map.hasLayer(m)) map.addLayer(m);
        }
    });

    // 切斷線條
    const partialLatLngs = routeStops.slice(0, stopIndex + 1).map(s => {
        const info = allStopsMap.get(s.stop_id);
        return [parseFloat(info.lat), parseFloat(info.long)];
    });
    
    if (window.mainRouteLine) {
        window.mainRouteLine.setLatLngs(partialLatLngs);
    }
}

// 3. 畫第二程紅線 (實心線 + 數字 + 由轉車站起計)
async function selectSecondRoute(targetStopId) {
  if (!map || !transferRouteStops || !transferRouteStops.length) return;
  
  clearSecondRouteVisual(); 
  updateFirstRouteFocus(transferStopId); // 呼叫隱藏第一程

  const latlngsForSecond = [];
  let foundTransferPoint = false;

  transferRouteStops.forEach(rs => {
    if (rs.stop_id === targetStopId) foundTransferPoint = true;

    if (foundTransferPoint) {
      const info = allStopsMap.get(rs.stop_id);
      if (!info) return;

      const icon = L.divIcon({
        className: "stop-label second-route",
        html: `<div>${rs.seq}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([parseFloat(info.lat), parseFloat(info.long)], { icon }).addTo(map);
      marker.stopId = rs.stop_id;
      marker.bindPopup(`<b>${rs.seq}. ${rs.name_tc || rs.stop_id}</b>`);
      
      secondRouteMarkers.push(marker);
      latlngsForSecond.push([parseFloat(info.lat), parseFloat(info.long)]);
    }
  });

  if (latlngsForSecond.length >= 2) {
    const redLine = L.polyline(latlngsForSecond, { color: "#ff5252", weight: 4, opacity: 0.9 }).addTo(map);
    secondRouteMarkers.push(redLine);
  }

  // 畫綠色步行線
  const firstMarker = window.allStopMarkers.find(m => m.stopId === transferStopId);
  const secondMarker = secondRouteMarkers.find(m => m.stopId === targetStopId);
  if (firstMarker && secondMarker) {
    transferLine = L.polyline([firstMarker.getLatLng(), secondMarker.getLatLng()], { color: "green", weight: 4, dashArray: "2, 4" }).addTo(map);
  }
}

// 4. 還原全部藍線 + 取消轉車時使用
function resetFirstRouteFull() {
    if (!routeStops || routeStops.length === 0) return;

    // 還原藍點
    if (window.allStopMarkers) {
        window.allStopMarkers.forEach(m => {
            if (!map.hasLayer(m)) map.addLayer(m);
        });
    }

    // 還原整條藍線
    const fullLatLngs = routeStops.map(s => {
        const info = allStopsMap.get(s.stop_id);
        if(!info) return null;
        return [parseFloat(info.lat), parseFloat(info.long)];
    }).filter(ll => ll !== null);

    if (window.mainRouteLine) {
        window.mainRouteLine.setLatLngs(fullLatLngs);
    }
}



function findNearestStopToLatLng(lat, lon, stops) {
  let best = null;
  let bestDist = Infinity;

  stops.forEach(s => {
    const info = allStopsMap.get(s.stop_id);
    if (!info) return;
    const slat = parseFloat(info.lat);
    const slon = parseFloat(info.long);
    if (!isFinite(slat) || !isFinite(slon)) return;
    const d = haversineDistanceMeters(lat, lon, slat, slon);
    if (d < bestDist) {
      bestDist = d;
      best = { stop: s, distMeters: d };
    }
  });

  return best;
}


function toggleMapFullscreen() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;

  const isFullscreen =
    document.fullscreenElement === mapDiv ||
    document.webkitFullscreenElement === mapDiv ||
    document.mozFullScreenElement === mapDiv ||
    document.msFullscreenElement === mapDiv;

  if (!isFullscreen) {
    if (mapDiv.requestFullscreen) mapDiv.requestFullscreen();
    else if (mapDiv.webkitRequestFullscreen) mapDiv.webkitRequestFullscreen();
    else if (mapDiv.mozRequestFullScreen) mapDiv.mozRequestFullScreen();
    else if (mapDiv.msRequestFullscreen) mapDiv.msRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }
}


function createNumberedIcon(seq, highlighted) {
  const bg = highlighted ? '#0b3d91' : '#1976d2';
  return L.divIcon({
    className: 'numbered-marker-icon',
    html: `<div class="numbered-marker" style="background:${bg}">${seq}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24]
  });
}


// 令 Leaflet 喺全螢幕變化時重算尺寸
function invalidateMapSizeOnFullscreenChange() {
  if (!map) return;
  setTimeout(() => {
    map.invalidateSize();
  }, 300);
}

document.addEventListener('fullscreenchange', invalidateMapSizeOnFullscreenChange);
document.addEventListener('webkitfullscreenchange', invalidateMapSizeOnFullscreenChange);
document.addEventListener('mozfullscreenchange', invalidateMapSizeOnFullscreenChange);
document.addEventListener('MSFullscreenChange', invalidateMapSizeOnFullscreenChange);



function showFullSecondRoute() {
  // 1. 還原藍線同埋所有藍點
  resetFirstRouteFull();

  // 2. 移除綠線
  if (transferLine && map.hasLayer(transferLine)) {
    map.removeLayer(transferLine);
    transferLine = null;
  }

  // 3. 重新畫全條紅線
  secondRouteMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
  secondRouteMarkers = [];

  const latlngsForFullRed = [];
  transferRouteStops.forEach(rs => {
    const info = allStopsMap.get(rs.stop_id);
    if (!info) return;
    const icon = L.divIcon({
      className: "stop-label second-route",
      html: `<span>${rs.seq}</span>`,
      iconSize: null
    });
    const marker = L.marker([parseFloat(info.lat), parseFloat(info.long)], { icon }).addTo(map);
    secondRouteMarkers.push(marker);
    latlngsForFullRed.push([parseFloat(info.lat), parseFloat(info.long)]);
  });

  if (latlngsForFullRed.length >= 2) {
    const redLine = L.polyline(latlngsForFullRed, { color: "#ff5252", weight: 4 }).addTo(map);
    secondRouteMarkers.push(redLine);
  }
}


function clearSecondRouteVisual() {
  secondRouteMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
  secondRouteMarkers = [];

  if (transferLine && map.hasLayer(transferLine)) map.removeLayer(transferLine);
  transferLine = null;
  secondTransferStopId = null;

  // 重要：當取消轉車，顯示返所有藍點同藍線
  resetFirstRouteFull(); 
}

function onShowAllStopsClick() {
  clearSecondRouteVisual();
  // 你原本 show 全部站的邏輯…
}

function onStep4Select(route, direction, transferStopId) {
  selectSecondRoute(route, direction, transferStopId);
}

// 終極模擬點擊版：最穩陣嘅 URL 自動預填 (修正 dir=2 API 連結)
function checkUrlForRoute() {
    const urlParams = new URLSearchParams(window.location.search);
    const routeParam = urlParams.get('route');
    const dirParam = urlParams.get('dir'); 
    const staParam = urlParams.get('sta'); 

    if (!routeParam) return;

    const targetRoute = routeParam.toUpperCase();
    const foundRouteObj = uniqueRoutes.find(r => {
        const rtName = typeof r === 'string' ? r : r.route;
        return rtName === targetRoute;
    });
	
	console.log(foundRouteObj);

    if (foundRouteObj) {
        console.log("URL: 自動選擇路線 " + targetRoute);
        if (typeof selectRoute === "function") {
            selectRoute(foundRouteObj);
        }

        const autoClickStation = (stationName) => {
            if (!stationName) return;
            let stopWaitCount = 0;
            let waitForStops = setInterval(() => {
                stopWaitCount++;
                if (stopWaitCount > 100) { clearInterval(waitForStops); return; }

                const stopListDiv = document.getElementById("stopList");
                
                if (stopListDiv && stopListDiv.innerText.includes(stationName)) {
                    clearInterval(waitForStops);
                    
                    const allStopDivs = stopListDiv.querySelectorAll("div");
                    let clicked = false;
                    
                    for (let div of allStopDivs) {
                        if (div.innerText.includes(stationName) && div.onclick) {
                            console.log("URL: 模擬點擊車站...");
                            div.click();
                            clicked = true;
                            break; 
                        }
                    }

                    if (!clicked) {
                        const foundStop = routeStops.find(rs => {
                            const info = allStopsMap.get(rs.stop_id);
                            return info && info.name_tc === stationName;
                        });
                        if (foundStop && typeof selectStop === "function") {
                            const stopInfo = allStopsMap.get(foundStop.stop_id);
                            selectStop(foundStop.stop_id, stopInfo.name_tc);
                        }
                    }
                }
            }, 100);
        };

        let dirWaitCount = 0;
        let waitForDirection = setInterval(() => {
            dirWaitCount++;
            if (dirWaitCount > 50) { clearInterval(waitForDirection); return; }

            const btnIn = document.getElementById("dirInbound");
            const btnOut = document.getElementById("dirOutbound");

            if (btnIn && btnOut && (!btnIn.disabled || !btnOut.disabled)) {
                clearInterval(waitForDirection); 

                if (dirParam !== null) {
                    
                    if (dirParam === '2' && staParam) {
                        console.log("URL: 執行 dir=2 智能揀方向邏輯...");
                        
                        (async () => {
                            try {
                                // 🔴 修正咗呢度嘅 API 網址，將方向 (inbound/outbound) 放返去 1 嘅前面！
                                const [inRes, outRes] = await Promise.all([
                                    fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${targetRoute}/inbound/1`).then(r => r.json()),
                                    fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${targetRoute}/outbound/1`).then(r => r.json())
                                ]);

                                const inStops = inRes.data || [];
                                const outStops = outRes.data || [];

                                const getStopInfo = (stops) => {
                                    let targetSeq = -1;
                                    for (let rs of stops) {
                                        const info = allStopsMap.get(rs.stop_id);
                                        if (info && info.name_tc === staParam) {
                                            targetSeq = parseInt(rs.seq);
                                            break; 
                                        }
                                    }
                                    return { seq: targetSeq, total: stops.length };
                                };

                                const inInfo = getStopInfo(inStops);
                                const outInfo = getStopInfo(outStops);

                                const inRemain = inInfo.seq !== -1 ? (inInfo.total - inInfo.seq) : -1;
                                const outRemain = outInfo.seq !== -1 ? (outInfo.total - outInfo.seq) : -1;

                                let targetBtn = null;
                                if (inRemain === -1 && outRemain === -1) {
                                    console.log("URL: 兩邊方向都搵唔到呢個站！");
                                    // 搵唔到都退一步，求其揀個有服務嘅方向
                                    targetBtn = !btnOut.disabled ? btnOut : btnIn;
                                } else if (inRemain > outRemain) {
                                    console.log("URL: 決定揀方向: Inbound (距離總站較遠)");
                                    targetBtn = btnIn;
                                } else {
                                    console.log("URL: 決定揀方向: Outbound (距離總站較遠)");
                                    targetBtn = btnOut;
                                }

                                // 萬一計出嚟嗰個方向係 Disabled，就自動切換另一邊
                                if (targetBtn && targetBtn.disabled) {
                                    targetBtn = (targetBtn === btnIn) ? btnOut : btnIn;
                                }

                                if (targetBtn && !targetBtn.disabled) {
                                    targetBtn.click();
                                    autoClickStation(staParam);
                                }
                            } catch (e) {
                                console.error("URL: dir=2 API 請求出錯", e);
                            }
                        })();

                    } else {
                        const targetBtn = (dirParam === '0') ? btnIn : btnOut;
                        if (targetBtn && !targetBtn.disabled) {
                            console.log("URL: 方向掣已準備好，正在模擬點擊...");
                            targetBtn.click(); 
                            autoClickStation(staParam); 
                        }
                    }
                }
            }
        }, 100);
    }
}

// 【新增】自動處理 dir=2 嘅智能選向及選站功能
async function handleDir2Logic(route, staParam) {
    console.log("執行 dir=2 智能揀方向邏輯...");
    try {
        // 同時攞晒 Inbound 同 Outbound 嘅車站資料
        const [inRes, outRes] = await Promise.all([
            fetch(`${KMB_BASE}/route-stop/${route}/1/inbound`).then(r => r.json()),
            fetch(`${KMB_BASE}/route-stop/${route}/1/outbound`).then(r => r.json())
        ]);

        const inStops = inRes.data || [];
        const outStops = outRes.data || [];

        // 幫手搵個站喺陣列入面嘅位置 (搵最早上車嗰個)
        const getStopInfo = (stops) => {
            let targetSeq = -1;
            let totalStops = stops.length;
            for (let rs of stops) {
                const info = allStopsMap.get(rs.stop_id);
                if (info && info.name_tc === staParam) {
                    targetSeq = parseInt(rs.seq);
                    break; // 搵到第一個啱嘅就即刻停
                }
            }
            return { seq: targetSeq, total: totalStops };
        };

        const inInfo = getStopInfo(inStops);
        const outInfo = getStopInfo(outStops);

        // 計算距離總站有幾遠 = (總站數 - 嗰個站嘅序號)
        // 數值越大，代表距離總站越遠 (即係啱啱先上車)
        const inRemain = inInfo.seq !== -1 ? (inInfo.total - inInfo.seq) : -1;
        const outRemain = outInfo.seq !== -1 ? (outInfo.total - outInfo.seq) : -1;

        let chosenBtnId = null;

        // 比較兩邊，揀剩餘站數多啲嗰邊
        if (inRemain === -1 && outRemain === -1) {
            console.log("兩邊方向都搵唔到呢個站！");
            return;
        } else if (inRemain > outRemain) {
            console.log("決定揀方向: Inbound (距離總站較遠)");
            chosenBtnId = 'dirInbound';
        } else {
            console.log("決定揀方向: Outbound (距離總站較遠)");
            chosenBtnId = 'dirOutbound';
        }

        // 1. 自動 Click 啱嗰個方向嘅掣
        const dirBtn = document.getElementById(chosenBtnId);
        if (dirBtn && !dirBtn.disabled) {
            dirBtn.click();
        }

        // 2. 等一陣 (等個車站 List 印好)，然後自動 Click 個站
        setTimeout(() => {
            const stopDivs = document.querySelectorAll("#stopList .stop-item");
            for (let div of stopDivs) {
                if (div.innerText.includes(staParam) && div.onclick) {
                    console.log("URL dir=2: 成功模擬點擊車站！");
                    div.click();
                    break;
                }
            }
        }, 800); // 畀 0.8 秒佢 render 畫面，實夠穩陣

    } catch (e) {
        console.error("dir=2 邏輯出錯", e);
    }
}

/* ========== 啟動 ========== */

init();

initMap();


window.onload = async function() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const state = JSON.parse(saved);
    const now = new Date().getTime();

    // 檢查係咪 1 小時內
    if (now - state.timestamp < EXPIRY_TIME) {
        console.log("發現 1 小時內嘅紀錄，正在還原...");
        
        // 1. 還原第一程 (假設你有個叫 searchRoute 嘅 function)
        if (state.firstRoute) {
            // 呢度視乎你點樣 Trigger 搜尋，例如：
            await selectRoute(state.firstRoute);
			
			if(state.firstDirection && state.firstDirectionCode){
			currentDirection =	state.firstDirection;
			currentDirectionCode = state.firstDirectionCode;
			await loadRouteStopsForCurrentDirection();
			if(state.firststopID && state.firstseq){
			//	originStopId = state.firststopID ;
			//	originSeq = state.firstseq;
			await onStopClicked(state.firststopID ,state.firstseq);
			
			if(state.transferStopId){
				await onInterchangeButtonClick(state.transferStopId,state.transferSeq);
			if(state.transferRoute){			
				await selectTransferRoute(state.transferRoute);
				if(state.transferDirection && state.transferDirectionCode){
					transferDirection = state.transferDirection;
					transferDirectionCode = state.transferDirectionCode;
					await loadTransferRouteStopsForCurrentDirection();				
				}
			
			}
			}		
			
			}
			}
        }
    } else {
        console.log("紀錄已過期，已清理");
        localStorage.removeItem(STORAGE_KEY);
    }
};

/* =========================================================================
   ★ 終極升級包：修復城巴 Summary、Step 4 過海聯營線雙邊對齊、OSRM 實際道路導航
   （直接貼喺 script_bus.js 最底部即可自動覆蓋舊有同名 Function）
   ========================================================================= */

// 修正預設追蹤支援城巴
async function ensureDefaultTrackingAtOrigin() {
  if (!originStopId || !currentRoute || !currentDirectionCode) return;
  if (selectedEtaTime) return;

  try {
    const company = currentRoute.company || "KMB";
    const data = await BusAPI.getEta(company, originStopId, currentRoute.route, currentServiceType);
    let list = data.data || [];
    list = list.filter(item => (!currentDirectionCode || item.dir === currentDirectionCode) && item.eta && !String(item.rmk_tc || "").includes("時段"));

    if (!list.length) return;
    const first = list[0];
    const detail = formatDetailLine(first);
    if (!detail.etaTime) return;

    const etaObj = {
      id: `${originStopId}-0`,
      etaTime: detail.etaTime,
      status: detail.status
    };
    setTrackingEta(etaObj, null);
  } catch (e) {
    console.error("ensureDefaultTrackingAtOrigin error", e);
  }
}

// 修正單向所有站 Summary 支援城巴
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
      if (currentDirectionCode) {
        list = list.filter(item => item.dir === currentDirectionCode);
      }
      const stopEl = document.querySelector(`.stop-item[data-stop-id="${stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;

      if (!list.length) {
        summarySpan.textContent = "";
        summarySpan.style.color = "#000000";
        summarySpan.style.fontWeight = "normal";
        etaTimesByStop[stop_id] = [];
        return;
      }

      const times = [];
      list.forEach(item => {
        if (item.eta) times.push(new Date(item.eta));
      });
      times.sort((a, b) => a - b);
      etaTimesByStop[stop_id] = times;

      const first = list[0];
      const { minutes, label } = minutesAndLabel(first.eta);

      summarySpan.textContent = label;
      summarySpan.style.fontWeight = minutes <= 0 ? "bold" : "normal";
      summarySpan.style.color = minutes <= 0 ? "#d32f2f" : grayColorByMinutes(minutes);
    });
  } catch (e) {
    console.error("loadEtaSummaryForAllStopsNormal error", e);
  }
}

async function loadEtaSummaryForAllStops() {
  if (!originStopId) {
    await loadEtaSummaryForAllStopsNormal();
    return;
  }

  if (!currentRoute || !cumulativeTravelFromOrigin) {
    routeStops.forEach(s => {
      const stopEl = document.querySelector(`.stop-item[data-stop-id="${s.stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;
      summarySpan.textContent = "";
      summarySpan.style.color = "#000000";
      summarySpan.style.fontWeight = "normal";
    });
    return;
  }

  let originEta = null;
  try {
    const company = currentRoute.company || "KMB";
    const data = await BusAPI.getEta(company, originStopId, currentRoute.route, currentServiceType);
    let list = (data.data || []).filter(item => item.eta && !String(item.rmk_tc || "").includes("時段"));
    if (currentDirectionCode) {
      list = list.filter(item => item.dir === currentDirectionCode);
    }
    if (list.length > 0 && list[0].eta) {
      originEta = new Date(list[0].eta);
    }
  } catch (e) {
    console.error("load origin ETA failed", e);
  }

  const baseDepart = selectedEtaTime || originEta;

  routeStops.forEach(s => {
    const stopEl = document.querySelector(`.stop-item[data-stop-id="${s.stop_id}"]`);
    if (!stopEl) return;
    const summarySpan = stopEl.querySelector(".stop-eta-summary");
    if (!summarySpan) return;

    const info = cumulativeTravelFromOrigin[s.stop_id];
    if (!info || !baseDepart) {
      summarySpan.textContent = "";
      summarySpan.style.color = "#000000";
      summarySpan.style.fontWeight = "normal";
      return;
    }

    const travelMin = info.travelMinutes || 0;
    const arrive = new Date(baseDepart.getTime() + travelMin * 60000);
    const hh = String(arrive.getHours()).padStart(2, "0");
    const mm = String(arrive.getMinutes()).padStart(2, "0");

    summarySpan.textContent = `行駛 ${travelMin} 分鐘 (${hh}:${mm} 到達)`;
    summarySpan.style.fontWeight = "normal";
    summarySpan.style.color = "#555555";
  });
}

/* ========== Step 4：轉車路線（支援聯營線雙邊對齊 + 統一 v2 API） ========== */

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
  const isJointRoute = /^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName);
  const destKey = getTransferDestKey();

  let combinedEtaList = [];

  // 1. 主公司 ETA
  try {
    const mainData = await BusAPI.getEta(company, stopId, routeName, st);
    let mainList = mainData.data || [];
    if (!isNaN(targetSeq)) {
      mainList = mainList.filter(item => parseInt(item.seq) === targetSeq);
    }
    if (transferDirectionCode) {
      mainList = mainList.filter(item => item.dir === transferDirectionCode);
    }
    mainList.forEach(item => {
      item._company = company;
      combinedEtaList.push(item);
    });
  } catch (e) {
    console.error("Transfer Main ETA failed", e);
  }

  // 2. 聯營線對家公司 ETA
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

      const etaPromises = Array.from(oppStopIds).map(sid =>
        BusAPI.getEta(oppCompany, sid, routeName, st).catch(() => ({ data: [] }))
      );
      const etaResults = await Promise.all(etaPromises);

      etaResults.forEach(res => {
        (res.data || []).forEach(item => {
          const itemDest = item.dest_tc || "";
          if ((!isNaN(targetSeq) ? parseInt(item.seq) === targetSeq : true) && itemDest.includes(destKey)) {
            item._company = oppCompany;
            combinedEtaList.push(item);
          }
        });
      });
    } catch (e) {
      console.error("Transfer Opponent ETA failed", e);
    }
  }

  // 3. 過濾無效數據及「X巴時段」備註 + 去重 + 排序
  const seen = new Set();
  combinedEtaList = combinedEtaList.filter(item => {
    const etaStr = String(item.eta || "").trim().toUpperCase();
    const rmkStr = String(item.rmk_tc || "").trim();

    if (etaStr === "" || etaStr === "N/A" || etaStr === "NULL" || etaStr === "UNDEFINED") return false;
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
  if (typeof renderTransferVirtualKeyboard === "function") {
    renderTransferVirtualKeyboard();
  }

  try {
    const routeId = transferRoute.route;
    const st = transferServiceType;
    const company = transferRoute.company || "KMB";

    const [inData, outData] = await Promise.allSettled([
      BusAPI.getRouteStops(company, routeId, "inbound", st),
      BusAPI.getRouteStops(company, routeId, "outbound", st)
    ]);

    let inName = "?";
    let outName = "?";
    let hasInbound = false;
    let hasOutbound = false;

    if (inData.status === "fulfilled" && inData.value.data) {
      const list = inData.value.data.sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasInbound = true;
        const last = list[list.length - 1];
        const stopInfo = await getStopDetail(company, last.stop);
        inName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.dest_tc);
      }
    }

    if (outData.status === "fulfilled" && outData.value.data) {
      const list = outData.value.data.sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        hasOutbound = true;
        const last = list[list.length - 1];
        const stopInfo = await getStopDetail(company, last.stop);
        outName = stopInfo && stopInfo.name_tc ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.orig_tc);
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
      btnIn.textContent = `無此方向`;
      btnOut.textContent = `無此方向`;
    }

    const btnReset = document.getElementById("btnResetTransfer");
    if (btnReset) btnReset.style.display = "inline-block";
    saveAppState();

  } catch (e) {
    console.error("載入轉車方向失敗:", e);
    btnIn.textContent = "往 ? 方向";
    btnOut.textContent = "往 ? 方向";
  }
}

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
    await loadTransferEtaSummaryForAllStops();
    await loadTransferHeadwayInfo();

    if (transferEtaTimer) clearInterval(transferEtaTimer);
    transferEtaTimer = setInterval(async () => {
      if (!transferRoute || !transferDirection || !transferRouteStops.length) return;
      await loadTransferEtaSummaryForAllStops();
      await loadTransferHeadwayInfo();
      if (transferCurrentStopId) {
        await selectTransferStop(transferCurrentStopId, window.transferCurrentSeq);
      }
    }, 30000);

    if (transferStopName) {
      let targetStop = null;
      const nameMatch = transferRouteStops.find(
        s => normalizeStopName(s.name_tc) === transferStopName
      );
      if (nameMatch) {
        targetStop = nameMatch;
      } else if (transferStopId) {
        const originInfo = allStopsMap.get(transferStopId);
        if (originInfo) {
          const oLat = parseFloat(originInfo.lat);
          const oLon = parseFloat(originInfo.long);
          if (isFinite(oLat) && isFinite(oLon)) {
            let best = null;
            let bestMinutes = Infinity;

            transferRouteStops.forEach(s => {
              const info = allStopsMap.get(s.stop_id);
              if (!info) return;
              const lat = parseFloat(info.lat);
              const lon = parseFloat(info.long);
              if (!isFinite(lat) || !isFinite(lon)) return;

              const dist = haversineDistanceMeters(oLat, oLon, lat, lon);
              const mins = dist / (4000 / 60);
              if (mins < bestMinutes) {
                bestMinutes = mins;
                best = s;
              }
            });

            if (best && bestMinutes <= 60) {
              targetStop = best;
            }
          }
        }
      }

      if (targetStop) {
        await selectTransferStop(targetStop.stop_id, targetStop.seq);
      }
      saveAppState();
    }
  } catch (e) {
    console.error(e);
    const d1b = document.getElementById("transferStopList");
    if (d1b) d1b.textContent = "載入路線站點失敗：" + e.message;
    transferHeadNotOk();
  }
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
      if (transferDirectionCode) {
        list = list.filter(item => item.dir === transferDirectionCode);
      }
      if (seq != null) {
        list = list.filter(item => parseInt(item.seq) === parseInt(seq));
      }
      let stopEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stop_id}"][data-seq="${seq}"]`);
      if (!stopEl) stopEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stop_id}"]`);
      if (!stopEl) return;
      const summarySpan = stopEl.querySelector(".stop-eta-summary");
      if (!summarySpan) return;

      if (!list.length) {
        summarySpan.textContent = "";
        summarySpan.style.color = "#000000";
        summarySpan.style.fontWeight = "normal";
        transferEtaTimesByStop[stop_id] = [];
        return;
      }

      const times = [];
      list.forEach(item => {
        if (item.eta) times.push(new Date(item.eta));
      });
      times.sort((a, b) => a - b);
      transferEtaTimesByStop[stop_id] = times;

      const first = list[0];
      const { minutes, label } = minutesAndLabel(first.eta);

      summarySpan.textContent = label;
      summarySpan.style.fontWeight = minutes <= 0 ? "bold" : "normal";
      summarySpan.style.color = minutes <= 0 ? "#d32f2f" : grayColorByMinutes(minutes);
    });
  } catch (e) {
    console.error("loadTransferEtaSummaryForAllStops error", e);
  }
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
      const items = document.querySelectorAll("#transferStopList .stop-item");
      items.forEach(item => {
        item.style.display = "";
        item.classList.remove("selected", "eta-showing", "transfer-tracked");
        const etaBlock = item.querySelector(".eta-block");
        if (etaBlock) {
          etaBlock.innerHTML = "";
          etaBlock.textContent = "";
        }
        const sid = item.getAttribute("data-stop-id");
        const sseq = item.getAttribute("data-seq");
        item.onclick = async () => {
          if (!transferCurrentStopId) {
            await selectTransferStop(sid, sseq);
          } else {
            if (sid === transferCurrentStopId && sseq == window.transferCurrentSeq) return;
            if (typeof checkTransferStopEta === "function") {
              await checkTransferStopEta(sid, sseq);
            }
          }
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
    const targetStopId = targetStopObj.stop_id;
    const targetSeq = targetStopObj.seq;

    const combinedList = await fetchCombinedTransferEtaForStop(targetStopId, targetSeq);
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
        const sum = diffs.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / diffs.length);
        const stopNameLocal = targetStopObj ? targetStopObj.name_tc : "此站";
        textSpan.textContent = `${stopNameLocal} 大約 ${avg} 分鐘一班車`;
      }
    }

    infoDiv.appendChild(textSpan);
    if (transferCurrentStopId) {
      infoDiv.appendChild(createShowAllBtn());
    }
  } catch (e) {
    console.error("loadTransferHeadwayInfo error", e);
    transferHeadNotOk();
  }
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

  const etaBlock = el.querySelector(".eta-block");
  etaBlock.textContent = "載入 ETA 中...";

  const routeName = transferRoute ? transferRoute.route : "";
  const isJointRoute = /^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName);

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
        if (minutes <= 0) {
          row.classList.add("eta-imminent");
        } else {
          row.style.color = grayColorByMinutes(minutes);
        }
        const contentNode = document.createElement("span");
        const badge = isJointRoute ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
        contentNode.textContent = badge + text;
        if (isScheduled) contentNode.style.fontStyle = "italic";
        row.appendChild(contentNode);
        etaBlock.appendChild(row);
      });
    }
  } catch (e) {
    console.error(e);
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

      let arriveAtC;
      if (trackedTransferArriveTime) {
        arriveAtC = new Date(trackedTransferArriveTime.getTime() + walkMin * 60000);
      } else {
        arriveAtC = new Date(
          selectedEtaTime.getTime() + (travelMin + walkMin) * 60000
        );
      }

      let bestBus = null;
      let bestWaitMin = Infinity;

      etaList.forEach(item => {
        if (!item.eta) return;
        const etaTime = new Date(item.eta);
        const diffMs = etaTime - arriveAtC;
        const diffMin = diffMs / 60000;
        if (diffMin >= 0 && diffMin < bestWaitMin) {
          bestWaitMin = diffMin;
          bestBus = { etaTime, raw: item };
          window.transferBestBus = bestBus;
        }
      });

      let walkText;
      if (walkMin < 1) walkText = "<1分鐘";
      else if (walkMin > 60) walkText = ">1小時";
      else walkText = `${Math.round(walkMin)}分鐘`;

      const rows = el.querySelectorAll(".eta-row");
      rows.forEach(row => row.classList.remove("transfer-tracked"));

      if (!bestBus || !isFinite(bestWaitMin)) {
        const hhmmArrive = formatTimeHHMM(arriveAtC);
        summaryText = `🚶 步行：約 ${walkText} ｜ ⚠️ 未有可接駁班次（約 ${hhmmArrive} 到達轉車站）`;
      } else {
        let waitText;
        if (bestWaitMin < 1) waitText = "<1分鐘";
        else if (bestWaitMin > 60) waitText = ">1小時";
        else waitText = `${Math.round(bestWaitMin)}分鐘`;

        summaryText = `🚶 步行：約 ${walkText} ｜ ⏱️ 轉車等候：約 ${waitText}`;

        const hhmm = formatTimeHHMM(bestBus.etaTime);
        rows.forEach(row => {
          const span = row.querySelector("span");
          if (!span) return;
          const text = span.textContent || "";
          if (text.includes(hhmm)) {
            row.classList.add("transfer-tracked");
          }
        });
      }
    }
  }

  if (walkInfoDiv) {
    if (summaryText) {
      walkInfoDiv.style.fontWeight = "600";
      walkInfoDiv.textContent = summaryText;
    } else {
      walkInfoDiv.textContent = "";
    }
  }

  const allItems = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
  let selectedIndex = allItems.findIndex(node => node.dataset.stopId === stopId && node.dataset.seq == actualSeq);
  if (selectedIndex === -1) {
    selectedIndex = allItems.findIndex(node => node.dataset.stopId === stopId);
  }

  allItems.forEach((node, index) => {
    if (index < selectedIndex) {
      node.style.display = "none";
    } else {
      node.style.display = "";
    }
  });

  selectSecondRoute(stopId);
  saveAppState();
}

async function checkTransferStopEta(stopId, seq) {
  let actualSeq = seq;
  if (!actualSeq) {
    const match = transferRouteStops.find(s => s.stop_id === stopId);
    if (match) actualSeq = match.seq;
  }

  const allItems = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
  allItems.forEach(item => {
    const thisStopId = item.dataset.stopId;
    const thisSeq = item.dataset.seq;
    const isTransferStation = (thisStopId === transferCurrentStopId && thisSeq == window.transferCurrentSeq);
    const isCurrentStation = (thisStopId === stopId && thisSeq == actualSeq);

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
    summarySpan.style.fontWeight = "normal";
  }

  const routeName = transferRoute ? transferRoute.route : "";
  const isJointRoute = /^(N)?[1369]\d{2}[A-Z]?$/i.test(routeName) || ["S1", "R8"].includes(routeName);

  try {
    const list = await fetchCombinedTransferEtaForStop(stopId, actualSeq);

    etaBlock.innerHTML = "";
    if (!list.length) {
      etaBlock.textContent = "暫時冇班次資料";
    }

    const actualEtas = [];
    const rowElementsMap = new Map();

    list.forEach((item, idx) => {
      const d = formatDetailLine(item);
      if (!d.etaTime) return;

      const etaObj = {
        index: idx,
        time: d.etaTime,
        status: d.status,
        isScheduled: d.isScheduled
      };
      actualEtas.push(etaObj);

      const row = document.createElement("div");
      row.className = "eta-row";
      if (d.minutes <= 0) {
        row.classList.add("eta-imminent");
      } else {
        row.style.color = typeof grayColorByMinutes === "function" ? grayColorByMinutes(d.minutes) : "#333";
      }

      const contentNode = document.createElement("span");
      const badge = isJointRoute ? (item._company === "KMB" ? "[九巴] " : "[城巴] ") : "";
      contentNode.textContent = badge + d.text;
      if (d.isScheduled) contentNode.style.fontStyle = "italic";

      row.appendChild(contentNode);
      etaBlock.appendChild(row);

      rowElementsMap.set(d.etaTime.getTime(), row);
    });

    let isTracked = false;
    let estimatedTravelMin = 0;
    let estimatedArriveTime = null;

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
      if (typeof formatDetailLine === "function" && window.transferBestBus) {
        const detail = formatDetailLine(window.transferBestBus.raw);
        if (detail && detail.status) targetStatus = detail.status;
      }

      const trackResult = findClosestMatchingBus(estimatedArriveTime, targetStatus, actualEtas);

      if (trackResult && trackResult.type === "ok") {
        const matchedTimeKey = trackResult.bus.time.getTime();
        const targetRow = rowElementsMap.get(matchedTimeKey);

        if (targetRow) {
          targetRow.classList.add("transfer-tracked");
        }

        if (summarySpan) {
          const arriveDate = trackResult.bus.time;
          const hh = String(arriveDate.getHours()).padStart(2, "0");
          const mm = String(arriveDate.getMinutes()).padStart(2, "0");

          summarySpan.textContent = `搭緊: 預計 ${hh}:${mm} 到達`;
          summarySpan.style.color = "#007bff";
          summarySpan.style.fontWeight = "bold";
        }
        isTracked = true;
      }
    }

    if (!isTracked && summarySpan) {
      if (estimatedArriveTime !== null) {
        const hh = String(estimatedArriveTime.getHours()).padStart(2, "0");
        const mm = String(estimatedArriveTime.getMinutes()).padStart(2, "0");
        summarySpan.textContent = `無法追蹤: 預計行駛 ${estimatedTravelMin} 分鐘 (${hh}:${mm} 到達)`;
        summarySpan.style.fontWeight = "normal";
        summarySpan.style.color = "#555555";
      } else {
        summarySpan.textContent = "";
      }
    }
  } catch (e) {
    console.error(e);
    etaBlock.textContent = "載入 ETA 失敗：" + e.message;
    if (summarySpan) summarySpan.textContent = "";
  }
}

/* ========== 實際道路導航路線 (OSRM Road & Foot Routing) + 地圖繪製 ========== */



async function fetchActualRoadGeometry(latlngs, profile = "driving") {
  if (!latlngs || latlngs.length < 2) return latlngs;

  if (latlngs.length === 2) {
    const d = haversineDistanceMeters(latlngs[0][0], latlngs[0][1], latlngs[1][0], latlngs[1][1]);
    if (d < 15) return latlngs;
  }

  const cacheKey = `${profile}_${latlngs.map(p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(";")}`;
  if (osrmGeometryCache.has(cacheKey)) {
    return osrmGeometryCache.get(cacheKey);
  }

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(baseUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error("OSRM HTTP " + res.status);
      const data = await res.json();

      if (data && data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates) {
        const segCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        if (fullPath.length > 0) segCoords.shift();
        fullPath.push(...segCoords);
      } else {
        if (fullPath.length > 0) chunk.shift();
        fullPath.push(...chunk);
      }
    }

    if (fullPath.length >= 2) {
      osrmGeometryCache.set(cacheKey, fullPath);
      return fullPath;
    }
  } catch (e) {
    console.warn("OSRM 道路導航連線失敗，退回直線連接:", e.message);
  }

  return latlngs;
}

async function showRouteStopsOnMap(stops) {
  const token = ++mainRouteRenderToken;

  if (window.mainRouteLine) map.removeLayer(window.mainRouteLine);
  if (window.allStopMarkers) {
    window.allStopMarkers.forEach(m => map.removeLayer(m));
  }
  window.allStopMarkers = [];

  const latlngs = [];
  stops.forEach(s => {
    const info = allStopsMap.get(s.stop_id);
    if (info) {
      const lat = parseFloat(info.lat);
      const lon = parseFloat(info.long);
      if (!isFinite(lat) || !isFinite(lon)) return;

      const icon = L.divIcon({
        className: "stop-label",
        html: `<div>${s.seq}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([lat, lon], { icon: icon }).addTo(map);
      marker.stopId = s.stop_id;
      marker.seq = parseInt(s.seq);

      const name = info.name_tc || s.stop_id;
      marker.bindPopup(`<b>${s.seq}. ${name}</b>`);

      window.allStopMarkers.push(marker);
      latlngs.push([lat, lon]);
    }
  });

  window.mainRouteLine = L.polyline(latlngs, {
    color: "#1565c0", weight: 5, opacity: 0.85, lineJoin: "round"
  }).addTo(map);

  if (latlngs.length > 0) {
    map.fitBounds(window.mainRouteLine.getBounds(), { padding: [24, 24] });
  }

  if (latlngs.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(latlngs, "driving");
    if (token === mainRouteRenderToken && window.mainRouteLine && map.hasLayer(window.mainRouteLine)) {
      window.mainRouteLine.setLatLngs(roadCoords);
    }
  }
}

async function updateFirstRouteFocus(targetStopId) {
  if (!routeStops || routeStops.length === 0) return;

  const token = ++mainRouteRenderToken;
  const stopIndex = routeStops.findIndex(s => s.stop_id === targetStopId);
  if (stopIndex === -1) return;

  const targetSeq = parseInt(routeStops[stopIndex].seq);

  window.allStopMarkers.forEach(m => {
    if (m.seq > targetSeq) {
      if (map.hasLayer(m)) map.removeLayer(m);
    } else {
      if (!map.hasLayer(m)) map.addLayer(m);
    }
  });

  const partialLatLngs = routeStops.slice(0, stopIndex + 1).map(s => {
    const info = allStopsMap.get(s.stop_id);
    if (!info) return null;
    return [parseFloat(info.lat), parseFloat(info.long)];
  }).filter(Boolean);

  if (window.mainRouteLine) {
    window.mainRouteLine.setLatLngs(partialLatLngs);
    if (partialLatLngs.length >= 2) {
      const roadCoords = await fetchActualRoadGeometry(partialLatLngs, "driving");
      if (token === mainRouteRenderToken && window.mainRouteLine) {
        window.mainRouteLine.setLatLngs(roadCoords);
      }
    }
  }
}

async function selectSecondRoute(targetStopId) {
  if (!map || !transferRouteStops || !transferRouteStops.length) return;

  clearSecondRouteVisual();
  const token = ++secondRouteRenderToken;
  updateFirstRouteFocus(transferStopId);

  const latlngsForSecond = [];
  let foundTransferPoint = false;

  transferRouteStops.forEach(rs => {
    if (rs.stop_id === targetStopId) foundTransferPoint = true;

    if (foundTransferPoint) {
      const info = allStopsMap.get(rs.stop_id);
      if (!info) return;
      const lat = parseFloat(info.lat);
      const lon = parseFloat(info.long);
      if (!isFinite(lat) || !isFinite(lon)) return;

      const icon = L.divIcon({
        className: "stop-label second-route",
        html: `<div>${rs.seq}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([lat, lon], { icon }).addTo(map);
      marker.stopId = rs.stop_id;
      marker.bindPopup(`<b>${rs.seq}. ${rs.name_tc || rs.stop_id}</b>`);

      secondRouteMarkers.push(marker);
      latlngsForSecond.push([lat, lon]);
    }
  });

  let redLine = null;
  if (latlngsForSecond.length >= 2) {
    redLine = L.polyline(latlngsForSecond, {
      color: "#e53935", weight: 5, opacity: 0.9, lineJoin: "round"
    }).addTo(map);
    secondRouteMarkers.push(redLine);
  }

  const firstMarker = window.allStopMarkers.find(m => m.stopId === transferStopId);
  const secondMarker = secondRouteMarkers.find(m => m.stopId === targetStopId);
  if (firstMarker && secondMarker) {
    const walkStart = [firstMarker.getLatLng().lat, firstMarker.getLatLng().lng];
    const walkEnd = [secondMarker.getLatLng().lat, secondMarker.getLatLng().lng];
    transferLine = L.polyline([walkStart, walkEnd], {
      color: "#2e7d32", weight: 5, dashArray: "6, 8"
    }).addTo(map);

    fetchActualRoadGeometry([walkStart, walkEnd], "foot").then(footCoords => {
      if (token === secondRouteRenderToken && transferLine && map.hasLayer(transferLine)) {
        transferLine.setLatLngs(footCoords);
      }
    });
  }

  if (redLine && latlngsForSecond.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(latlngsForSecond, "driving");
    if (token === secondRouteRenderToken && map.hasLayer(redLine)) {
      redLine.setLatLngs(roadCoords);
    }
  }
}

async function resetFirstRouteFull() {
  if (!routeStops || routeStops.length === 0) return;
  const token = ++mainRouteRenderToken;

  if (window.allStopMarkers) {
    window.allStopMarkers.forEach(m => {
      if (!map.hasLayer(m)) map.addLayer(m);
    });
  }

  const fullLatLngs = routeStops.map(s => {
    const info = allStopsMap.get(s.stop_id);
    if (!info) return null;
    const lat = parseFloat(info.lat);
    const lon = parseFloat(info.long);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return [lat, lon];
  }).filter(ll => ll !== null);

  if (window.mainRouteLine) {
    window.mainRouteLine.setLatLngs(fullLatLngs);
    if (fullLatLngs.length >= 2) {
      const roadCoords = await fetchActualRoadGeometry(fullLatLngs, "driving");
      if (token === mainRouteRenderToken && window.mainRouteLine) {
        window.mainRouteLine.setLatLngs(roadCoords);
      }
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
    const lat = parseFloat(info.lat);
    const lon = parseFloat(info.long);
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
    const redLine = L.polyline(latlngsForFullRed, { color: "#e53935", weight: 5, opacity: 0.9, lineJoin: "round" }).addTo(map);
    secondRouteMarkers.push(redLine);
    const roadCoords = await fetchActualRoadGeometry(latlngsForFullRed, "driving");
    if (token === secondRouteRenderToken && map.hasLayer(redLine)) {
      redLine.setLatLngs(roadCoords);
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


/* =========================================================================
   ★ UI 終極升級：全螢幕地圖上拉抽屜 (Bottom Sheet) + 固定高度不跳動鍵盤 + 轉車雙欄/Tab
   ========================================================================= */

// 香港巴士路線會出現嘅 18 個英文字母（固定 6x3 格位，永不跳動）
const FIXED_BUS_LETTERS = [
  "A", "B", "C", "D", "E", "F",
  "H", "K", "M", "N", "P", "R",
  "S", "T", "U", "W", "X", "Z"
];

// 1. 覆蓋 Step 1 虛擬鍵盤（固定 Grid 高度，唔再因為字母減少而跳位）
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
    clear.style.borderColor = "#fecaca";
    clear.onclick = () => {
      resetAllState();
      setBottomSheetState("half");
    };
    container.appendChild(clear);
    return;
  }

  if (layout) layout.classList.remove("compact-mode");

  const baseRoutes = currentInput ? candidateRoutes : uniqueRoutes;
  const usage = computeNextCharUsage(baseRoutes, currentInput);

  // (A) 頂部控制鍵：刪除 & 清除(X)
  const topRow = document.createElement("div");
  topRow.className = "vk-top-grid";

  const backspace = document.createElement("div");
  backspace.className = "vk-key special";
  backspace.textContent = "⌫ 刪除";
  backspace.onclick = () => {
    if (currentRoute) return;
    if (currentInput.length > 0) {
      currentInput = currentInput.slice(0, -1);
      updateAfterInputChange();
    }
  };

  const clear = document.createElement("div");
  clear.className = "vk-key special";
  clear.textContent = "✕ 清除";
  clear.style.backgroundColor = "#fee2e2";
  clear.style.color = "#b91c1c";
  clear.onclick = () => {
    resetAllState();
  };

  topRow.appendChild(backspace);
  topRow.appendChild(clear);
  container.appendChild(topRow);

  // (B) 固定 3x4 數字 Numpad
  const numpadGrid = document.createElement("div");
  numpadGrid.className = "vk-numpad-grid";
  const digitsOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null];

  digitsOrder.forEach(d => {
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
      key.onclick = () => {
        if (!currentRoute) {
          currentInput += ch;
          updateAfterInputChange();
        }
      };
    }
    numpadGrid.appendChild(key);
  });
  container.appendChild(numpadGrid);

  // (C) 固定 6x3 英文字母 Grid（永不改變高度）
  const letterGrid = document.createElement("div");
  letterGrid.className = "vk-letters-grid";

  FIXED_BUS_LETTERS.forEach(ch => {
    const key = document.createElement("div");
    key.className = "vk-key letter-key";
    key.textContent = ch;
    if (!usage.letters[ch]) {
      key.classList.add("disabled");
    } else {
      key.onclick = () => {
        if (!currentRoute) {
          currentInput += ch;
          updateAfterInputChange();
        }
      };
    }
    letterGrid.appendChild(key);
  });
  container.appendChild(letterGrid);
}

// 2. 覆蓋 Step 4 轉車虛擬鍵盤（同樣固定 Grid 高度，永不跳動）
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
    clear.onclick = () => {
      resetTransferOnly();
    };
    container.appendChild(clear);
    return;
  }

  if (layout) layout.classList.remove("compact-mode");

  const baseRoutes = transferCurrentInput ? transferCandidateRoutes : uniqueRoutes;
  const usage = computeNextCharUsage(baseRoutes, transferCurrentInput);

  // (A) 頂部控制鍵
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

  // (B) 固定 3x4 數字 Numpad
  const numpadGrid = document.createElement("div");
  numpadGrid.className = "vk-numpad-grid";
  const digitsOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null];

  digitsOrder.forEach(d => {
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
      key.onclick = () => {
        transferCurrentInput += ch;
        updateAfterTransferInputChange();
      };
    }
    numpadGrid.appendChild(key);
  });
  container.appendChild(numpadGrid);

  // (C) 固定 6x3 英文字母 Grid
  const letterGrid = document.createElement("div");
  letterGrid.className = "vk-letters-grid";

  FIXED_BUS_LETTERS.forEach(ch => {
    const key = document.createElement("div");
    key.className = "vk-key letter-key";
    key.textContent = ch;
    if (!usage.letters[ch]) {
      key.classList.add("disabled");
    } else {
      key.onclick = () => {
        transferCurrentInput += ch;
        updateAfterTransferInputChange();
      };
    }
    letterGrid.appendChild(key);
  });
  container.appendChild(letterGrid);
}

// 3. 底部上拉抽屜 (Bottom Sheet) 狀態控制與手勢拖拉
let currentSheetState = "collapsed"; // "collapsed" | "half" | "full"

function setBottomSheetState(state) {
  const sheet = document.getElementById("bottom-sheet");
  const btn = document.getElementById("btnSheetToggle");
  const hint = document.getElementById("sheetStatusHint");
  if (!sheet) return;

  currentSheetState = state;
  sheet.classList.remove("sheet-collapsed", "sheet-half", "sheet-full");
  sheet.classList.add(`sheet-${state}`);

  if (btn) {
    if (state === "collapsed") btn.textContent = "展開 ▲";
    else if (state === "half") btn.textContent = "全開 ▲";
    else btn.textContent = "收起 ▼";
  }

  if (hint) {
    if (currentRoute) {
      hint.textContent = transferRoute
        ? `${currentRoute.route} ➔ ${transferRoute.route}`
        : `路線 ${currentRoute.route}`;
    } else {
      hint.textContent = state === "collapsed" ? "向上拉輸入路線" : "請選擇路線與方向";
    }
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

(function initBottomSheetInteractions() {
  const sheet = document.getElementById("bottom-sheet");
  const header = document.getElementById("sheet-header");
  const btnToggle = document.getElementById("btnSheetToggle");
  const tab1 = document.getElementById("tabLeg1");
  const tab2 = document.getElementById("tabLeg2");
  if (!sheet || !header) return;

  if (tab1) tab1.onclick = () => switchMobileLegTab(1);
  if (tab2) tab2.onclick = () => switchMobileLegTab(2);

  if (btnToggle) {
    btnToggle.onclick = (e) => {
      e.stopPropagation();
      if (currentSheetState === "collapsed") setBottomSheetState("half");
      else if (currentSheetState === "half") setBottomSheetState("full");
      else setBottomSheetState("collapsed");
    };
  }

  // 支援手指 Touch & 滑鼠上下拉動抽屜
  let startY = 0;
  let deltaY = 0;
  let isDragging = false;

  const onDragStart = (clientY) => {
    startY = clientY;
    deltaY = 0;
    isDragging = true;
    sheet.classList.add("dragging");
  };

  const onDragMove = (clientY) => {
    if (!isDragging) return;
    deltaY = clientY - startY;
  };

  const onDragEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.classList.remove("dragging");

    if (deltaY < -35) {
      // 向上拉
      if (currentSheetState === "collapsed") setBottomSheetState("half");
      else setBottomSheetState("full");
    } else if (deltaY > 35) {
      // 向下拉
      if (currentSheetState === "full") setBottomSheetState("half");
      else setBottomSheetState("collapsed");
    } else {
      // 輕點頂部欄
      if (currentSheetState === "collapsed") setBottomSheetState("half");
    }
  };

  header.addEventListener("touchstart", (e) => onDragStart(e.touches[0].clientY), { passive: true });
  header.addEventListener("touchmove", (e) => onDragMove(e.touches[0].clientY), { passive: true });
  header.addEventListener("touchend", onDragEnd);

  header.addEventListener("mousedown", (e) => onDragStart(e.clientY));
  window.addEventListener("mousemove", (e) => onDragMove(e.clientY));
  window.addEventListener("mouseup", onDragEnd);

  // 監聽轉車區塊顯示狀態，自動啟用平板雙欄 / 電話分頁 Tab
  const tSec = document.getElementById("transfer-search-section");
  if (tSec) {
    const observer = new MutationObserver(() => {
      const isTransferVisible = tSec.style.display !== "none";
      if (isTransferVisible) {
        sheet.classList.add("has-transfer");
        switchMobileLegTab(2); // 揀完轉車站自動切換去第二程 Tab（電話版）
        if (currentSheetState === "collapsed") setBottomSheetState("half");
      } else {
        sheet.classList.remove("has-transfer", "mobile-show-leg2");
        sheet.classList.add("mobile-show-leg1");
      }
      setBottomSheetState(currentSheetState);
    });
    observer.observe(tSec, { attributes: true, attributeFilter: ["style"] });
  }

  // 重新繪製一次新鍵盤
  renderVirtualKeyboard();
  renderTransferVirtualKeyboard();
})();

/* =========================================================================
   ★ 終極功能 Patch v2（替換 script_bus.js 最底部嗰段 Patch）
   新增：
   - 步行速度全面改為 5km/h (5000 / 60 米/分鐘)
   - 撳「追蹤」即彈出長期常駐 Notification (requireInteraction: true)
     左邊：路線(方向)、上車站、到站倒數分鐘
     右邊：剩餘步行米數、步行倒數分鐘
     每 1 分鐘自動更新，直至班車開走自動關閉！
   ========================================================================= */

var userLocationMarker = null;
var userToStopRouteLayer = null;
var osrmGeometryCache = new Map();
var mainRouteRenderToken = 0;
var secondRouteRenderToken = 0;

// 儲存最新步程距離與分鐘（供 Notification 實時讀取）
var currentWalkDistMeters = null;
var currentWalkMinutes = null;
var busNotificationTimer = null;
var activeBusNotification = null;

// --- 0. 步行速度統一改為 5km/h (5000 / 60 米/分鐘) ---
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
  return distMeters / (5000 / 60); // ★ 5km/h
}

function walkingTimeTextBetweenStops(stopIdA, stopIdB) {
  const mins = walkingMinutesBetweenStops(stopIdA, stopIdB);
  if (mins === null) return null;
  if (mins < 1) return "步行 <1 分鐘";
  if (mins > 60) return "步行 >1 小時";
  return `步行約 ${Math.round(mins)} 分鐘`;
}

// --- 1. 極速載入路線資料 ---
async function loadAllBusData() {
  const [kmbRouteRes, kmbStopRes, ctbRouteRes] = await Promise.allSettled([
    fetchJSON(`${KMB_BASE}/route/`, 3, 400),
    fetchJSON(`${KMB_BASE}/stop/`, 3, 400),
    fetchJSON(`${CTB_BASE}/route/ctb`, 3, 400)
  ]);

  const loadedRoutes = [];
  const routeMap = new Map();
  allStopsMap = new Map();
  routesByStopId = {};

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
  return loadedRoutes;
}

// --- 2. 顯示用家 GPS 位置圓點 + 行去揀選巴士站嘅導航線與時間 (5km/h) ---
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

  userToStopRouteLayer = L.polyline([[userLat, userLon], [sLat, sLon]], {
    color: "#9333ea", weight: 5, dashArray: "6, 8", opacity: 0.9
  }).addTo(map);

  // ★ 5km/h 計算 (5000 / 60 米/分鐘)
  currentWalkDistMeters = Math.round(straightDist * 1.2);
  currentWalkMinutes = Math.max(1, Math.round(currentWalkDistMeters / (5000 / 60)));

  if (walkBox) {
    walkBox.textContent = `🚶 由你位置行去「${stopName}」：約 ${currentWalkMinutes} 分鐘（約 ${currentWalkDistMeters} 米，按 5km/h 計）`;
  }

  if (straightDist > 15 && straightDist < 15000) {
    try {
      const coordsStr = `${userLon.toFixed(6)},${userLat.toFixed(6)};${sLon.toFixed(6)},${sLat.toFixed(6)}`;
      const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes[0]) {
          const r = data.routes[0];
          const coords = r.geometry.coordinates.map(c => [c[1], c[0]]);
          if (userToStopRouteLayer && map.hasLayer(userToStopRouteLayer)) {
            userToStopRouteLayer.setLatLngs(coords);
          }
          currentWalkDistMeters = Math.round(r.distance || straightDist);
          currentWalkMinutes = Math.max(1, Math.round(currentWalkDistMeters / (5000 / 60)));
          if (walkBox) {
            walkBox.textContent = `🚶 由你位置行去「${stopName}」：約 ${currentWalkMinutes} 分鐘（實際步程 ${currentWalkDistMeters} 米）`;
          }
        }
      }
    } catch (e) {}
  }
}



// --- 3. 🔔 穩定版通知列 + 右側動態進度環車牌 Logo (永不假死，兼容三星瀏覽器 + Even G2) ---

var keepAliveAudio = null;
var bgTimerWorker = null;
var notiUpdateCounter = 0;

// 靜音音訊保活（防止鎖屏後網頁計時器休眠）
function startSilentAudioKeepAlive() {
  try {
    if (!keepAliveAudio) {
      keepAliveAudio = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
      );
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

// Web Worker 獨立 60 秒計時器
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

// ★ 用 128x128 尺寸畫進度環車牌 Logo（確保 Base64 極細，三星瀏覽器秒速顯示唔會爆限制）
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

    // 頂部路線號膠囊
    drawRoundRect(ctx, 16, 10, size - 32, 22, 11);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(routeCode || "BUS", size / 2, 21);

    // 中央進度圓環
    const cx = size / 2;
    const cy = 67;
    const radius = 26;

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

    // 中央分鐘數字
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

    // 底部預計到站時間 (例如 20:48)
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

async function clearOldBusNotifications() {
  if (activeBusNotification && typeof activeBusNotification.close === "function") {
    try { activeBusNotification.close(); } catch (e) {}
    activeBusNotification = null;
  }
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.getNotifications) {
        const list = await reg.getNotifications();
        list.forEach(n => {
          if (n.tag && n.tag.startsWith("bus-eta")) n.close();
        });
      }
    } catch (e) {}
  }
}

function stopPersistentTrackingNotification() {
  stopWorkerInterval();
  stopSilentAudioKeepAlive();
  clearOldBusNotifications();
}

// 確保 Service Worker 處於健康狀態（如果之前卡死咗會自動重新註冊並激活）
async function getHealthySwRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration("./sw.js");
    if (!reg) {
      reg = await navigator.serviceWorker.register("./sw.js");
    }
    if (reg.installing || reg.waiting) {
      await new Promise(r => setTimeout(r, 200));
    }
    await reg.update().catch(() => {});
    return reg;
  } catch (e) {
    return null;
  }
}

async function updatePersistentTrackingNotification() {
  if (!selectedEtaTime || !currentRoute || !originStopId) {
    stopPersistentTrackingNotification();
    return;
  }

  const now = new Date();
  const diffMin = Math.round((selectedEtaTime - now) / 60000);

  if (diffMin < 0) {
    stopPersistentTrackingNotification();
    return;
  }

  const dirTerm = currentDirection === "inbound"
    ? (inboundTerminalName !== "?" ? inboundTerminalName : stripBracketCode(currentRoute.dest_tc))
    : (outboundTerminalName !== "?" ? outboundTerminalName : stripBracketCode(currentRoute.orig_tc));

  const stopObj = routeStops.find(s => s.stop_id === originStopId);
  const stopName = stopObj ? stripBracketCode(stopObj.name_tc) : "";

  if (userLat != null && userLon != null && originStopId) {
    const info = allStopsMap.get(originStopId);
    if (info && info.lat && info.long) {
      const d = haversineDistanceMeters(userLat, userLon, parseFloat(info.lat), parseFloat(info.long));
      currentWalkDistMeters = Math.round(d);
      currentWalkMinutes = Math.max(1, Math.round(d / (5000 / 60)));
    }
  }

  const hh = String(selectedEtaTime.getHours()).padStart(2, "0");
  const mm = String(selectedEtaTime.getMinutes()).padStart(2, "0");
  const hhmmStr = `${hh}:${mm}`;

  // 4 行乾淨直排：
  // 89S (往水泉澳總站)
  // 烏溪沙路
  // 10 分鐘 (20:48)
  // 距離421米 (3分鐘)
  const titleText = `${currentRoute.route} (往${dirTerm})`;
  const etaLine   = diffMin <= 0
    ? `即將到達 (${hhmmStr})`
    : `${diffMin} 分鐘 (${hhmmStr})`;

  const bodyLines = [stopName, etaLine];
  if (currentWalkDistMeters != null && currentWalkMinutes != null) {
    bodyLines.push(`距離${currentWalkDistMeters}米 (${currentWalkMinutes}分鐘)`);
  }
  const bodyText = bodyLines.join("\n");

  if (!("Notification" in window)) {
    showToast("⚠️ 此瀏覽器不支援通知功能");
    return;
  }
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission().catch(() => "denied");
    if (perm !== "granted") {
      showToast("⚠️ 請喺瀏覽器設定允許此網站發送通知");
      return;
    }
  }

  const badgeIconUrl = createCountdownBadgeIcon(diffMin, currentRoute.route, hhmmStr);

  // ★ 先清走舊通知，再用新序號 tag 發送，徹底防止 Samsung One UI 吞通知！
  await clearOldBusNotifications();
  const dynamicTag = `bus-eta-${++notiUpdateCounter}`;

  const options = {
    body: bodyText,
    icon: badgeIconUrl,
    tag: dynamicTag,
    requireInteraction: true
  };

  // 1) 優先用健康嘅 Service Worker 彈出 Android 系統通知列
  const reg = await getHealthySwRegistration();
  if (reg && reg.showNotification) {
    try {
      await reg.showNotification(titleText, options);
      return;
    } catch (swErr) {
      // 萬一 Icon 被擋，即刻用純文字補發
      try {
        await reg.showNotification(titleText, { body: bodyText, tag: dynamicTag });
        return;
      } catch (swErr2) {}
    }
  }

  // 2) 後備：桌面或一般瀏覽器 Notification
  try {
    activeBusNotification = new Notification(titleText, options);
  } catch (err) {
    showToast("⚠️ 無法彈出通知，請關閉此分頁再重開一次");
  }
}

async function startPersistentTrackingNotification() {
  startSilentAudioKeepAlive();
  await updatePersistentTrackingNotification();

  startWorkerInterval(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          userLat = pos.coords.latitude;
          userLon = pos.coords.longitude;
          renderUserLocationSpot();
          updatePersistentTrackingNotification();
        },
        () => updatePersistentTrackingNotification(),
        { maximumAge: 30000, timeout: 5000 }
      );
    } else {
      updatePersistentTrackingNotification();
    }
  }, 60000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && bgTimerWorker && selectedEtaTime) {
    updatePersistentTrackingNotification();
  }
});

const _origSetTrackingEta = setTrackingEta;
setTrackingEta = function(etaObj, rowElement) {
  _origSetTrackingEta(etaObj, rowElement);
  if (rowElement) {
    showToast("🔔 已啟動實時到站通知");
    startPersistentTrackingNotification();
  }
};



// --- 4. ☀️ 計算香港實時太陽方位 & 上車坐左邊定右邊建議 ---
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

  if (altitudeDeg <= 2) {
    return `🌙 現時夜間/無猛烈日光（車向${busDirName}）｜💺 坐左或右邊都唔曬`;
  }
  if (altitudeDeg >= 68) {
    return `☀️ 正午太陽喺頂（仰角 ${Math.round(altitudeDeg)}°）｜💺 兩邊受光相若`;
  }
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

// --- 5. 固定數字鍵盤高度 + 只顯示「可按嘅英文字母」 ---
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

// --- 6. 點擊車站與地圖聯動（徹底刪除直線，只畫實際道路導航線） ---
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

// 升級版：由你位置行去巴士站（唔畫直線墊底，直接畫實際行人路）
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

  if (walkBox) {
    walkBox.textContent = `🚶 由你位置行去「${stopName}」：計算實際步程中...`;
  }

  if (straightDist < 15000) {
    try {
      const coordsStr = `${userLon.toFixed(6)},${userLat.toFixed(6)};${sLon.toFixed(6)},${sLat.toFixed(6)}`;
      const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes[0]) {
          const r = data.routes[0];
          const coords = r.geometry.coordinates.map(c => [c[1], c[0]]);
          // ★ 攞到實際行人路座標先畫線，唔畫直線！
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

// 透過 OSRM 獲取實際道路幾何座標
async function fetchActualRoadGeometry(latlngs, profile = "driving") {
  if (!latlngs || latlngs.length < 2) return [];
  if (!osrmGeometryCache) osrmGeometryCache = new Map();
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
  } catch (e) {
    console.warn("OSRM 載入失敗:", e.message);
  }
  return [];
}

// 1. 第一程藍線（刪走直線墊底，只畫實際道路）
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
      if (mode !== "interchange_pair") {
        onStopClicked(s.stop_id, s.seq);
      } else {
        loadEtaDetailForStop(s.stop_id, s.seq);
      }
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

  // ★ 等攞到實際馬路幾何座標先至畫條藍線（完全唔畫直線）
  if (latlngs.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(latlngs, "driving");
    if (token === mainRouteRenderToken && roadCoords.length >= 2) {
      if (window.mainRouteLine && map.hasLayer(window.mainRouteLine)) {
        map.removeLayer(window.mainRouteLine);
      }
      window.mainRouteLine = L.polyline(roadCoords, {
        color: "#1565c0", weight: 5, opacity: 0.85, lineJoin: "round"
      }).addTo(map);
    }
  }
}

// 2. 切斷第一程藍線（覆蓋舊版直線邏輯，只畫到轉車站嘅實際馬路）
async function updateFirstRouteFocus(targetStopId) {
  if (!routeStops || routeStops.length === 0) return;
  const token = ++mainRouteRenderToken;

  const stopIndex = routeStops.findIndex(s => s.stop_id === targetStopId);
  if (stopIndex === -1) return;
  const targetSeq = parseInt(routeStops[stopIndex].seq);

  if (window.allStopMarkers) {
    window.allStopMarkers.forEach(m => {
      if (m.seq > targetSeq) {
        if (map.hasLayer(m)) map.removeLayer(m);
      } else {
        if (!map.hasLayer(m)) map.addLayer(m);
      }
    });
  }

  // 先移除舊線，唔俾直線出現
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

// 3. 還原全部第一程藍線（覆蓋舊版直線邏輯）
async function resetFirstRouteFull() {
  if (!routeStops || routeStops.length === 0) return;
  const token = ++mainRouteRenderToken;

  if (window.allStopMarkers) {
    window.allStopMarkers.forEach(m => {
      if (!map.hasLayer(m)) map.addLayer(m);
    });
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

// 4. 第二程紅線 + 綠色轉車步行線（刪走直線墊底，只畫實際道路）
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
        if (!transferCurrentStopId) {
          await selectTransferStop(rs.stop_id, rs.seq);
        } else if (rs.stop_id !== transferCurrentStopId || rs.seq != window.transferCurrentSeq) {
          await checkTransferStopEta(rs.stop_id, rs.seq);
        }
        setTimeout(() => {
          const targetEl = document.querySelector(`#transferStopList .stop-item[data-stop-id="${rs.stop_id}"][data-seq="${rs.seq}"]`);
          if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 220);
      });

      secondRouteMarkers.push(marker);
      latlngsForSecond.push([lat, lon]);
    }
  });

  // 轉車綠色步行線：等實際行人路座標返嚟先畫
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

  // 第二程紅線：等實際行車馬路座標返嚟先畫
  if (latlngsForSecond.length >= 2) {
    const roadCoords = await fetchActualRoadGeometry(latlngsForSecond, "driving");
    if (token === secondRouteRenderToken && roadCoords.length >= 2) {
      const redLine = L.polyline(roadCoords, { color: "#e53935", weight: 5, opacity: 0.9, lineJoin: "round" }).addTo(map);
      secondRouteMarkers.push(redLine);
    }
  }
}

// =========================================================================
// ★ 升級版「步驟 7」：
// 1. 轉車模式 (Step 4 出現後) 下拉一下 (peek) 自動預留足夠高度顯示晒兩個站嘅 ETA
// 2. 電話版支援喺抽屜內容區「左右掃 (Swipe Left / Right)」切換第一程同第二程
// =========================================================================

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

        // ★ 如果已經入咗轉車模式 (Step 4 出現咗)：
        // 左邊有齊「上車站 + 轉車站」兩個站嘅 ETA，右邊亦有轉車站 ETA 同步行資訊，所以要預留更高空間！
        if (isInterchangePair) {
          const primaryPanel = document.getElementById("primary-panel");
          const stopListEl = document.getElementById("stopList");
          const transferPanel = document.getElementById("transfer-search-section");

          // 將第一程自動 Scroll 去「上車站」頂部，等上車站同轉車站一齊露晒出嚟
          const firstVisibleStop = stopListEl ? stopListEl.querySelector('.stop-item:not([style*="display: none"])') : null;
          if (primaryPanel && firstVisibleStop) {
            const pRect = primaryPanel.getBoundingClientRect();
            const sRect = firstVisibleStop.getBoundingClientRect();
            primaryPanel.scrollTop += (sRect.top - pRect.top) - 6;
          }

          // 將第二程自動 Scroll 去「步行時間 + 轉車站」頂部
          const walkEl = document.getElementById("transferWalkInfo");
          const secondAnchor = (walkEl && walkEl.textContent) ? walkEl : target.el;
          if (transferPanel && secondAnchor) {
            const tpRect = transferPanel.getBoundingClientRect();
            const saRect = secondAnchor.getBoundingClientRect();
            transferPanel.scrollTop += (saRect.top - tpRect.top) - 6;
          }

          // 計算顯示晒兩個站 ETA 所需嘅總高度 (最少留 340px~420px)
          const leg1StopsH = stopListEl ? stopListEl.offsetHeight + 24 : 320;
          const leg2StopH = target.el.offsetHeight + (walkEl ? walkEl.offsetHeight + 24 : 24);
          const neededContentH = Math.min(window.innerHeight * 0.58, Math.max(leg1StopsH, leg2StopH, 320));
          const visiblePx = headerH + tabsH + neededContentH;
          sheet.style.setProperty("--peek-offset", `calc(100% - ${visiblePx}px)`);
        } else {
          // 單一程模式：只對準目前揀緊嗰個站
          const panelRect = target.panel.getBoundingClientRect();
          const elRect = target.el.getBoundingClientRect();
          target.panel.scrollTop += (elRect.top - panelRect.top) - 6;

          const stopH = Math.min(260, Math.max(130, target.el.offsetHeight + 18));
          const visiblePx = headerH + tabsH + stopH;
          sheet.style.setProperty("--peek-offset", `calc(100% - ${visiblePx}px)`);
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

(function upgradeMapAndUI() {
  if (map) {
    map.eachLayer(layer => {
      if (layer._url && layer._url.includes("openstreetmap.org")) {
        map.removeLayer(layer);
      }
    });
    const hkGovBase = L.tileLayer("https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png", { maxZoom: 19 });
    const hkGovLabel = L.tileLayer("https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/WGS84/{z}/{x}/{y}.png", { maxZoom: 19 });
    hkGovBase.addTo(map);
    hkGovLabel.addTo(map);
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      renderUserLocationSpot();
      if (originStopId) drawUserWalkRouteToStop(originStopId);
    });
  }

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
    if (currentSheetState === "full") {
      setBottomSheetState(hasSelectedStop() ? "peek" : "half");
    } else if (currentSheetState === "half") {
      setBottomSheetState(hasSelectedStop() ? "peek" : "collapsed");
    } else {
      setBottomSheetState("collapsed");
    }
  };

  const stepUpSheet = () => {
    if (currentSheetState === "collapsed" || currentSheetState === "peek") {
      setBottomSheetState("half");
    } else {
      setBottomSheetState("full");
    }
  };

  if (btnToggle) {
    btnToggle.onclick = (e) => {
      e.stopPropagation();
      if (currentSheetState === "full") stepDownSheet();
      else stepUpSheet();
    };
  }

  // 頂部拉柄上下拉動
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

  // ★ 新增：電話版喺抽屜內容區「左右掃 (Swipe Left / Right)」切換第一程與第二程
  if (sheet && sheetBody) {
    let touchStartX = 0;
    let touchStartY = 0;

    sheetBody.addEventListener("touchstart", e => {
      if (!e.touches || !e.touches.length) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    sheetBody.addEventListener("touchend", e => {
      // 只喺電話版 (<768px) 且已經開啟 Step 4 轉車時生效
      if (window.innerWidth >= 768 || !sheet.classList.contains("has-transfer")) return;
      if (!e.changedTouches || !e.changedTouches.length) return;

      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;

      // 確認係明顯嘅橫向滑動 (水平距離 > 50px 且大於垂直距離 1.3 倍)，唔影響上下滾動車站清單
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) {
          // 向左掃 -> 去第二程
          switchMobileLegTab(2);
        } else {
          // 向右掃 -> 返第一程
          switchMobileLegTab(1);
        }
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

  renderVirtualKeyboard();
  renderTransferVirtualKeyboard();
})();

// ★ 修正「✕ 重設路線」徹底清除藍線、紅線、紫線及站點（防止異步重畫藍線）
const _origResetAllState = resetAllState;
resetAllState = function() {
  // 1. 先清空 routeStops 同埋遞增 Token，令所有進行中嘅異步畫線請求即刻失效
  routeStops = [];
  transferRouteStops = [];
  mainRouteRenderToken++;
  secondRouteRenderToken++;

  // 2. 執行原本嘅重設邏輯
  _origResetAllState();

  // 3. 強制清除地圖上嘅第一程藍線、所有藍點、轉車線及步行紫線
  if (map) {
    if (window.mainRouteLine && map.hasLayer(window.mainRouteLine)) {
      map.removeLayer(window.mainRouteLine);
    }
    window.mainRouteLine = null;

    if (window.allStopMarkers) {
      window.allStopMarkers.forEach(m => {
        if (map.hasLayer(m)) map.removeLayer(m);
      });
    }
    window.allStopMarkers = [];

    if (userToStopRouteLayer && map.hasLayer(userToStopRouteLayer)) {
      map.removeLayer(userToStopRouteLayer);
    }
    userToStopRouteLayer = null;

    // 補回香港地圖底圖（防止原版 resetAllState 誤刪無 _url 嘅文字圖層）及你嘅 GPS 綠點
    let hasTile = false;
    map.eachLayer(l => { if (l._url) hasTile = true; });
    if (!hasTile) {
      L.tileLayer("https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      L.tileLayer("https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/WGS84/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    }
    renderUserLocationSpot();
  }
};
