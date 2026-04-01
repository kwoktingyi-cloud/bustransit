const BASE = "https://data.etabus.gov.hk/v1/transport/kmb";

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

function initMap() {
  if (map) return;

  // 先用預設中心
  map = L.map('map').setView([22.32, 114.17], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  stopsLayer = L.layerGroup().addTo(map);
  const FullscreenControl = L.Control.extend({
  options: {
    position: 'bottomright'
  },
  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar');
    const btn = L.DomUtil.create('div', 'leaflet-control-fullscreen-btn', container);
    btn.title = '全螢幕 / 還原';

    // 用符號表示：未全螢幕時顯示「⤢」，全螢幕時顯示「⤡」
    btn.textContent = '⤢';

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(btn, 'click', (e) => {
      e.preventDefault();
      toggleMapFullscreen();
    });

    // 監聽 fullscreen 狀態改變圖示
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

  // 之後再試用家 GPS
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;

      map.setView([userLat, userLon], 15);

      L.circleMarker([userLat, userLon], {
        radius: 6,
        color: '#2e7d32',
        fillColor: '#66bb6a',
        fillOpacity: 0.9
      }).addTo(map).bindPopup('你的位置');
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
    const [routeRes, stopRes, routeStopListRes] = await Promise.all([
      fetchJSON(`${BASE}/route/`),
      fetchJSON(`${BASE}/stop/`),
      fetchJSON(`${BASE}/route-stop`)
    ]);
    allRoutes = routeRes.data || [];

    const routeMap = new Map();
    for (const r of allRoutes) {
      if (!routeMap.has(r.route)) routeMap.set(r.route, r);
    }
    uniqueRoutes = Array.from(routeMap.values());

    const stops = stopRes.data || [];
    allStopsMap = new Map(stops.map(s => [s.stop, s]));

    routesByStopId = {};
    const rsAll = routeStopListRes.data || [];
    rsAll.forEach(rs => {
      if (!routesByStopId[rs.stop]) routesByStopId[rs.stop] = [];
      routesByStopId[rs.stop].push({
        route: rs.route,
        bound: rs.bound,
        service_type: rs.service_type,
        seq: rs.seq
      });
    });

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

function filterRoutesByInput() {
  if (!currentInput) {
    candidateRoutes = [];
  } else {
    const kw = currentInput.toLowerCase();
    candidateRoutes = uniqueRoutes.filter(r =>
      r.route.toLowerCase().startsWith(kw)
    );
  }
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

  candidateRoutes.slice(0, 100).forEach(r => {
    const div = document.createElement("div");
    div.className = "route-item";
    div.textContent = `${r.route}：${r.orig_tc} ↔ ${r.dest_tc}`;
    div.onclick = () => selectRoute(r);
    container.appendChild(div);
  });
}

function renderVirtualKeyboard() {
  const container = document.getElementById("vk-container");
  container.innerHTML = "";

  if (currentRoute && keyboardHidden) {
    const clear = document.createElement("div");
    clear.className = "vk-key special";
    clear.textContent = "清除";
    clear.onclick = () => {
      resetAllState();
    };
    container.appendChild(clear);
    return;
  }

  const baseRoutes = currentInput ? candidateRoutes : uniqueRoutes;
  const usage = computeNextCharUsage(baseRoutes, currentInput);

  const labelDigits = document.createElement("div");
  labelDigits.className = "vk-label";
  labelDigits.textContent = "數字";
  container.appendChild(labelDigits);

  const digitRow = document.createElement("div");
  digitRow.className = "vk-row";
  for (let d = 0; d <= 9; d++) {
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
  }
  container.appendChild(digitRow);

  const labelLetters = document.createElement("div");
  labelLetters.className = "vk-label";
  labelLetters.textContent = "英文字母";
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

  const row2 = document.createElement("div");
  row2.className = "vk-row";
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
  clear.textContent = "清除";
  clear.onclick = () => {
    resetAllState();
  };
  row2.appendChild(backspace);
  row2.appendChild(clear);
  container.appendChild(row2);
}

function updateAfterInputChange() {
  updateRouteInputDisplay();
  filterRoutesByInput();
  renderRouteList();
  renderVirtualKeyboard();
}

/* ========== Step4 虛擬鍵盤 ========== */

function renderTransferVirtualKeyboard() {
  const container = document.getElementById("transferVkContainer");
  if (!container) return;
  container.innerHTML = "";

  if (transferKeyboardHidden) {
    const clear = document.createElement("div");
    clear.className = "vk-key special";
    clear.textContent = "清除";
    clear.onclick = () => {
      transferCurrentInput = "";
      transferCandidateRoutes = [];
      const d1 = document.getElementById("transferRouteInputDisplay");
      const d2 = document.getElementById("transferRouteList");
      if (d1) d1.textContent = "(未輸入)";
      if (d2) d2.textContent = "請輸入路線，會以同名站作為預設轉車站。";
      transferKeyboardHidden = false;
      renderTransferVirtualKeyboard();
    };
    container.appendChild(clear);
    return;
  }

  const baseRoutes = transferCurrentInput ? transferCandidateRoutes : uniqueRoutes;
  const usage = computeNextCharUsage(baseRoutes, transferCurrentInput);

  const labelDigits = document.createElement("div");
  labelDigits.className = "vk-label";
  labelDigits.textContent = "數字";
  container.appendChild(labelDigits);

  const digitRow = document.createElement("div");
  digitRow.className = "vk-row";
  for (let d = 0; d <= 9; d++) {
    const ch = String(d);
    const key = document.createElement("div");
    key.className = "vk-key";
    key.textContent = ch;
    if (!usage.digits[ch]) {
      key.classList.add("disabled");
    } else {
      key.onclick = () => {
        if (!key.classList.contains("disabled")) {
          transferCurrentInput += ch;
          updateAfterTransferInputChange();
        }
      };
    }
    digitRow.appendChild(key);
  }
  container.appendChild(digitRow);

  const labelLetters = document.createElement("div");
  labelLetters.className = "vk-label";
  labelLetters.textContent = "英文字母";
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
        transferCurrentInput += ch;
        updateAfterTransferInputChange();
      };
      letterRow.appendChild(key);
    });
    container.appendChild(letterRow);
  }

  const row2 = document.createElement("div");
  row2.className = "vk-row";
  const backspace = document.createElement("div");
  backspace.className = "vk-key special";
  backspace.textContent = "刪除";
  backspace.onclick = () => {
    if (transferCurrentInput.length > 0) {
      transferCurrentInput = transferCurrentInput.slice(0, -1);
      updateAfterTransferInputChange();
    }
  };
  const clear = document.createElement("div");
  clear.className = "vk-key special";
  clear.textContent = "清除";
  clear.onclick = () => {
    transferCurrentInput = "";
    transferCandidateRoutes = [];
    const d1 = document.getElementById("transferRouteInputDisplay");
    const d2 = document.getElementById("transferRouteList");
    if (d1) d1.textContent = "(未輸入)";
    if (d2) d2.textContent = "請輸入路線，會以同名站作為預設轉車站。";
    renderTransferVirtualKeyboard();
  };
  row2.appendChild(backspace);
  row2.appendChild(clear);
  container.appendChild(row2);
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
  transferCandidateRoutes = uniqueRoutes.filter(r =>
    r.route.toLowerCase().startsWith(kw)
  );

  if (!transferCandidateRoutes.length) {
    listDiv.textContent = "冇符合路線";
  } else {
    transferCandidateRoutes.slice(0, 100).forEach(r => {
      const div = document.createElement("div");
      div.className = "route-item";
      div.textContent = `${r.route}：${r.orig_tc} ↔ ${r.dest_tc}`;
      div.onclick = () => selectTransferRoute(r);
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
  if (mainLine) mainLine.innerHTML = "轉車路線：";

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

}

/* ========== Step1 大清除 ========== */

function resetAllState() {
	
  clearSecondRouteVisual();   // ★ 新增：Step 1 重設時都清晒紅色線 / 紅 tag
  
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

  // ★ 新增：清地圖上所有 tag / 路線，還原視野
  if (stopsLayer) {
    stopsLayer.clearLayers();
  }
  // 如果你有其它 layer（例如 userToStopRouteLayer），都可以喺度一拼清除：
  // if (userToStopRouteLayer) { map.removeLayer(userToStopRouteLayer); userToStopRouteLayer = null; }

  if (map) {
    map.setView([22.32, 114.17], 12); // 香港大致中心
  }

  const userInfo = document.getElementById("userWalkInfo");
  if (userInfo) userInfo.textContent = "";
}


/* ========== Step2: 揀方向 ========== */

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
  btnIn.disabled = true;
  btnOut.disabled = true;
  btnIn.textContent = "載入方向中...";
  btnOut.textContent = "載入方向中...";

  keyboardHidden = true;
  renderRouteList();
  renderVirtualKeyboard();

  try {
    const routeId = currentRoute.route;
    const st = currentServiceType;

    const [inData, outData] = await Promise.allSettled([
      fetchJSON(`${BASE}/route-stop/${routeId}/inbound/${st}`),
      fetchJSON(`${BASE}/route-stop/${routeId}/outbound/${st}`)
    ]);

    if (inData.status === "fulfilled") {
      const list = (inData.value.data || []).sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        const last = list[list.length - 1];
        const stopInfo = allStopsMap.get(last.stop);
        inboundTerminalName = stopInfo ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(currentRoute.dest_tc);
      }
    }

    if (outData.status === "fulfilled") {
      const list = (outData.value.data || []).sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        const last = list[list.length - 1];
        const stopInfo = allStopsMap.get(last.stop);
        outboundTerminalName = stopInfo ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(currentRoute.orig_tc);
      }
    }

    const finalInName = inboundTerminalName !== "?" ? inboundTerminalName : stripBracketCode(currentRoute.dest_tc);
    const finalOutName = outboundTerminalName !== "?" ? outboundTerminalName : stripBracketCode(currentRoute.orig_tc);
    btnIn.textContent = `往 ${finalInName} 方向`;
    btnOut.textContent = `往 ${finalOutName} 方向`;
    btnIn.disabled = false;
    btnOut.disabled = false;
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
    const rsData = await fetchJSON(
      `${BASE}/route-stop/${routeId}/${currentDirection}/${serviceType}`
    );
    const routeStopList = rsData.data || [];

    routeStops = routeStopList
      .map(rs => {
        const stopInfo = allStopsMap.get(rs.stop);
        return {
          stop_id: rs.stop,
          seq: rs.seq,
          name_tc: stopInfo ? stopInfo.name_tc : `(未知站名) ${rs.stop}`,
          name_en: stopInfo ? stopInfo.name_en : ""
        };
      })
      .sort((a, b) => a.seq - b.seq);

    renderStopList();
    await loadEtaSummaryForAllStops();
    await loadHeadwayInfo();
	
	// 揀好方向、routeStops ready 之後：
		let hl = [];
		if (originStopId) hl.push(originStopId);
		if (transferStopId) hl.push(transferStopId);

		showRouteStopsOnMap(routeStops, hl);
		zoomToNearestStopIfHaveGPS(); // 如果你有呢行，就放喺 showRouteStopsOnMap 之後

    if (mainEtaTimer) clearInterval(mainEtaTimer);
    mainEtaTimer = setInterval(async () => {
      if (!currentRoute || !currentDirection || !routeStops.length) return;
      await loadEtaSummaryForAllStops();
      await loadHeadwayInfo();
      if (currentStopId) {
        await loadEtaDetailForStop(currentStopId);
      }
    }, 30000);
	
	  showRouteStopsOnMap(routeStops, hl);
		zoomToNearestStopIfHaveGPS();
	
  } catch (e) {
    console.error(e);
    if (stopList) stopList.textContent =
      "載入路線站點失敗：" + e.message;
    if (hInfo) hInfo.textContent = "班距資料不足。";
  }
  

  
}

/* ========== Step3: 巴士站 + 轉車模式 ========== */

function renderStopList() {
  const container = document.getElementById("stopList");
  if (!container) return;
  container.innerHTML = "";

  routeStops.forEach((s) => {
    const div = document.createElement("div");
    div.className = "stop-item";
    div.dataset.stopId = s.stop_id;

    const header = document.createElement("div");
    header.className = "stop-header";

    const left = document.createElement("div");
    left.className = "stop-title";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = `${s.seq}. ${s.name_tc}`;
    left.appendChild(titleSpan);

    // 決定要不要顯示「轉車」button
    let shouldShowInterBtn = false;
    if (mode === "interchange_pick" && originStopId) {
      const originIndex = routeStops.findIndex(x => x.stop_id === originStopId);
      const thisIndex = routeStops.findIndex(x => x.stop_id === s.stop_id);
      if (originIndex >= 0 && thisIndex >= originIndex) {
        shouldShowInterBtn = true;
      }
    }

    if (shouldShowInterBtn) {
      const interBtn = document.createElement("button");
      interBtn.className = "btn-small";
      interBtn.textContent = "轉車";
      interBtn.onclick = (ev) => {
        ev.stopPropagation();
        onInterchangeButtonClick(s.stop_id); // ★ 一律用 stop_id
      };
      left.appendChild(interBtn);
    }

    const summaryWrapper = document.createElement("span");
    summaryWrapper.className = "summary-wrapper";

    const summarySpan = document.createElement("span");
    summarySpan.className = "stop-eta-summary";
    summarySpan.textContent = "";

    const boardingSpan = document.createElement("span");
    boardingSpan.className = "stop-boarding-info";
    boardingSpan.textContent = "";

    summaryWrapper.appendChild(summarySpan);
    summaryWrapper.appendChild(boardingSpan);

    header.appendChild(left);
    header.appendChild(summaryWrapper);

    const etaBlock = document.createElement("div");
    etaBlock.className = "eta-block";

    div.appendChild(header);
    div.appendChild(etaBlock);

    // 點擊整行：選站＋顯示 ETA（除咗 pair 模式）
    div.onclick = () => {
      if (mode === "interchange_pair") return;
      onStopClicked(s.stop_id);
    };

    container.appendChild(div);
  });

  renderStopsAccordingToMode();
}


function renderStopsAccordingToMode() {
  const infoDiv = document.getElementById("interchangeInfo");
  const ctrlDiv = document.getElementById("interchangeControls");
  if (infoDiv) infoDiv.textContent = "";
  if (ctrlDiv) ctrlDiv.innerHTML = "";

  if (mode === "normal") {
    const tSec = document.getElementById("transfer-search-section");
    if (tSec) tSec.style.display = "none";
    return;
  }

  const tSec = document.getElementById("transfer-search-section");

  if (mode === "interchange_pick" && originStopId) {
    const origin = routeStops.find(s => s.stop_id === originStopId);
    const name = origin ? origin.name_tc : originStopId;
    if (infoDiv) infoDiv.textContent =
      `轉車模式：上車站 ${name}，請揀轉車站（只可以揀之後嘅站）。`;
    if (tSec) tSec.style.display = "none";
  } else if (mode === "interchange_pair" && originStopId && transferStopId) {
    const origin = routeStops.find(s => s.stop_id === originStopId);
    const trans  = routeStops.find(s => s.stop_id === transferStopId);
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

  const allItems = Array.from(document.querySelectorAll(".stop-item"));
  if (mode === "interchange_pair" && originStopId && transferStopId) {
    allItems.forEach(el => {
      const sid = el.dataset.stopId;
      if (sid === originStopId || sid === transferStopId) {
        el.style.display = "";
      } else {
        el.style.display = "none";
      }
    });
  } else {
    allItems.forEach(el => el.style.display = "");
  }
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
}

function onInterchangeButtonClick(stopId) {
  if (mode === "normal") {
    // 如果未經過 onStopClicked，直接以轉車 button 當上車站
    originStopId = stopId;
    mode = "interchange_pick";
    recomputeCumulativeTravelFromOrigin(stopId);
    renderStopList();
    selectStop(stopId);           // 顯示 ETA
    return;
  }

  if (mode === "interchange_pick") {
    // 已有上車站，再按「轉車」＝選轉車站
    transferStopId = stopId;
    currentTransferStopId = stopId;
    mode = "interchange_pair";

    renderStopsAccordingToMode(); // ★ 只顯示上車站＋轉車站

    const walkInfoDiv = document.getElementById("transferWalkInfo");
    if (walkInfoDiv) walkInfoDiv.textContent = "";

    ensureDefaultTrackingAtOrigin().then(() => {
      if (originStopId) loadEtaDetailForStop(originStopId);
      if (transferStopId) loadEtaDetailForStop(transferStopId);
      guessBoardingBusAtTransferStop();
    });

    // 如有 allStopMarkers，可以順便移地圖
    if (typeof allStopMarkers !== "undefined" && map) {
      const marker = allStopMarkers.find(m => m.stopId === stopId);
      if (marker) {
        map.setView(marker.getLatLng(), 17);
        if (marker.openPopup) marker.openPopup();
      }
    }
  }
}


function clearStopSelectionUI() {
  document.querySelectorAll(".stop-item.selected").forEach(el => {
    el.classList.remove("selected");
  });
  document.querySelectorAll(".eta-block").forEach(el => {
    el.innerHTML = "";
  });
}

function onStopClicked(stopId) {
  originStopId = stopId;

  if (mode === "normal") {
    mode = "interchange_pick";
  }

  recomputeCumulativeTravelFromOrigin(stopId);
  renderStopList();
  selectStop(stopId);   // ★ 每次 click 行都即時顯示 ETA
}


function selectStop(stopId) {
  currentStopId = stopId;

  // 1. 高亮 Step 3 站列表
  const allItems = document.querySelectorAll("#stopList .stop-item");
  allItems.forEach(el => {
    el.classList.toggle("selected", el.dataset.stopId === stopId);
  });

  // 2. 重新載入該站 ETA（沿用你原本 code）
  const el = document.querySelector(`#stopList .stop-item[data-stop-id="${stopId}"]`);
  if (!el) return;

  const etaBlock = el.querySelector(".eta-block");
  if (!etaBlock) return;
  etaBlock.textContent = "載入 ETA 中...";

  if (mainEtaTimer) {
    clearInterval(mainEtaTimer);
    mainEtaTimer = null;
  }

  async function loadEta() {
    try {
      const data = await fetchJSON(
        `${BASE}/eta/${stopId}/${currentRoute.route}/${currentServiceType}`
      );
      let list = data.data || [];
      if (currentDirectionCode) {
        list = list.filter(item => item.dir === currentDirectionCode);
      }

      etaBlock.innerHTML = "";
      if (!list.length) {
        etaBlock.textContent = "暫時冇班次資料";
      } else {
        list.forEach(item => {
          const { text, minutes, isScheduled, status, etaTime } = formatDetailLine(item);

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

          // 追蹤按鈕（如果你原本有）
          const btnTrack = document.createElement("button");
          btnTrack.className = "btn-track";
          btnTrack.textContent = "追蹤";
          btnTrack.onclick = (e) => {
            e.stopPropagation();
            setTrackingEta(
              { id: item.eta_seq || null, etaTime, status },
              row
            );
          };
          row.appendChild(btnTrack);

          etaBlock.appendChild(row);
        });
      }
    } catch (e) {
      console.error(e);
      etaBlock.textContent = "載入 ETA 失敗：" + e.message;
    }
  }

  loadEta();

  mainEtaTimer = setInterval(loadEta, 30000);

  // 3. 延遲 0.5 秒先移地圖 / 開 popup
  setTimeout(() => {
    focusMapToStop(stopId, 16, true);
  }, 500);
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
      `${BASE}/eta/${originStopId}/${currentRoute.route}/${currentServiceType}`
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
  const stopElInit = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
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

  try {
    const data = await fetchJSON(
      `${BASE}/eta/${transferStopId}/${currentRoute.route}/${currentServiceType}`
    );
    let list = data.data || [];
    list = list.filter(item => item.dir === currentDirectionCode && item.eta);

    if (!list.length) {
      trackedTransferArriveTime = null;
      setBoardingInfoTextForTransferStop("無法追蹤");
      return;
    }

    const actualEtas = list.map((item, idx) => {
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

    const targetStatus = selectedEtaStatus || "not_departed";
    const result = findClosestMatchingBus(arriveAtTransfer, targetStatus, actualEtas);

    if (result.type === "untrackable") {
      trackedTransferArriveTime = null;
      setBoardingInfoTextForTransferStop("無法追蹤");
      return;
    }

    const matched = result.bus;

    // ★ 成功追蹤：記低實際到達轉車站時間（第一架）
    trackedTransferArriveTime = matched.time;

    const tStr = formatTimeHHMM(matched.time);
    setBoardingInfoTextForTransferStop(`搭緊：${tStr}`);

    // 同步高亮轉車站 eta-block 入面對應嗰行（可選，視乎你原本有冇做）
    if (stopElInit) {
      const etaRows = stopElInit.querySelectorAll(".eta-row");
      etaRows.forEach(row => {
        const span = row.querySelector("span");
        if (!span) return;
        const text = span.textContent || "";
        if (text.startsWith(tStr)) {
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

async function loadEtaDetailForStop(stopId) {
  if (!currentRoute) return;

  const stopEl = document.querySelector(`.stop-item[data-stop-id="${stopId}"]`);
  if (!stopEl) return;
  const etaBlock = stopEl.querySelector(".eta-block");

  etaBlock.textContent = "載入 ETA 中...";

  try {
    const data = await fetchJSON(
      `${BASE}/eta/${stopId}/${currentRoute.route}/${currentServiceType}`
    );
    let list = data.data || [];
    if (currentDirectionCode) {
      list = list.filter(item => item.dir === currentDirectionCode);
    }

    etaBlock.innerHTML = "";

    if (list.length === 0) {
      etaBlock.textContent = "暫時冇班次資料";
      return;
    }

	list.forEach((item, index) => {
	  const detail = formatDetailLine(item);
	  const { text, minutes, isScheduled, status, etaTime } = detail;

	  const row = document.createElement("div");
	  row.className = "eta-row";

	if (minutes <= 0) {
	  row.classList.add("eta-imminent");
	} else {
	  row.classList.remove("eta-row-gray-1","eta-row-gray-2","eta-row-gray-3","eta-row-gray-4","eta-row-gray-5");
	  if (minutes <= 5) {
		row.classList.add("eta-row-gray-1");
	  } else if (minutes <= 10) {
		row.classList.add("eta-row-gray-2");
	  } else if (minutes <= 15) {
		row.classList.add("eta-row-gray-3");
	  } else if (minutes <= 20) {
		row.classList.add("eta-row-gray-4");
	  } else {
		row.classList.add("eta-row-gray-5");
	  }
	}

	  const contentNode = document.createElement("span");
	  contentNode.textContent = text;
	  if (isScheduled) contentNode.style.fontStyle = "italic";
	  row.appendChild(contentNode);

	  if (stopId === originStopId && etaTime) {
		const etaObj = {
		  id: `${stopId}-${index}`,
		  etaTime: etaTime,
		  status: status
		};

		const btnTrack = document.createElement("button");
		btnTrack.type = "button";
		btnTrack.className = "btn-small btn-track";
		btnTrack.textContent = "追蹤";
		btnTrack.addEventListener("click", (ev) => {
		  ev.stopPropagation();
		  setTrackingEta(etaObj, row);
		});
		row.appendChild(btnTrack);

		// 如呢行就係追蹤緊嗰班 → 深藍＋underline
		if (selectedEtaId === etaObj.id) {
		  row.classList.add("tracked");
		  btnTrack.classList.add("active");
		}
	  }

	  etaBlock.appendChild(row);
	});
  } catch (e) {
    console.error(e);
    etaBlock.textContent = "載入 ETA 失敗：" + e.message;
  }
}

/* ========== 單線班距 / summary ========== */

async function loadEtaSummaryForAllStopsNormal() {
  if (!currentRoute) return;

  const promises = routeStops.map(s =>
    fetchJSON(`${BASE}/eta/${s.stop_id}/${currentRoute.route}/${currentServiceType}`)
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
      `${BASE}/eta/${originStopId}/${currentRoute.route}/${currentServiceType}`
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

  if (!currentRoute || !currentDirection) {
    infoDiv.textContent = "";
    return;
  }

  try {
    if (!routeStops || !routeStops.length) {
      infoDiv.textContent = "";
      return;
    }

    const targetStopId = currentStopId || routeStops[0].stop_id;

    const data = await fetchJSON(
      `${BASE}/eta/${targetStopId}/${currentRoute.route}/${currentServiceType}`
    );
    let list = data.data || [];
    if (currentDirectionCode) {
      list = list.filter(item => item.dir === currentDirectionCode);
    }

    const times = [];
    list.forEach(item => {
      if (item.eta) times.push(new Date(item.eta));
    });
    times.sort((a, b) => a - b);

    if (!times || times.length < 2) {
      infoDiv.textContent = "班距資料不足。";
      return;
    }

    const diffs = [];
    for (let i = 1; i < times.length; i++) {
      const diffMin = Math.round((times[i] - times[i - 1]) / 60000);
      if (diffMin > 0) diffs.push(diffMin);
    }

    if (!diffs.length) {
      infoDiv.textContent = "班距資料不足。";
      return;
    }

    const sum = diffs.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / diffs.length);

    const stopInfo = routeStops.find(s => s.stop_id === targetStopId);
    const stopNameLocal = stopInfo ? stopInfo.name_tc : "此站";
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
  if (d1) d1.textContent =
    `${route.route}（${route.orig_tc} ↔ ${route.dest_tc}）`;
  const d2 = document.getElementById("transferStopList");
  if (d2) d2.innerHTML = "";
  const d3 = document.getElementById("transferHeadwayInfo");
  if (d3) d3.textContent = "";

  const btnIn = document.getElementById("transferDirInbound");
  const btnOut = document.getElementById("transferDirOutbound");
  if (!btnIn || !btnOut) return;
  btnIn.disabled = true;
  btnOut.disabled = true;
  btnIn.textContent = "載入方向中...";
  btnOut.textContent = "載入方向中...";

  transferKeyboardHidden = true;
  renderTransferVirtualKeyboard();

  try {
    const routeId = transferRoute.route;
    const st = transferServiceType;

    const [inData, outData] = await Promise.allSettled([
      fetchJSON(`${BASE}/route-stop/${routeId}/inbound/${st}`),
      fetchJSON(`${BASE}/route-stop/${routeId}/outbound/${st}`)
    ]);

    let inName = "?";
    let outName = "?";

    if (inData.status === "fulfilled") {
      const list = (inData.value.data || []).sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        const last = list[list.length - 1];
        const stopInfo = allStopsMap.get(last.stop);
        inName = stopInfo ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.dest_tc);
      }
    }

    if (outData.status === "fulfilled") {
      const list = (outData.value.data || []).sort((a, b) => a.seq - b.seq);
      if (list.length > 0) {
        const last = list[list.length - 1];
        const stopInfo = allStopsMap.get(last.stop);
        outName = stopInfo ? stripBracketCode(stopInfo.name_tc) : stripBracketCode(transferRoute.orig_tc);
      }
    }

    btnIn.textContent = `往 ${inName !== "?" ? inName : stripBracketCode(transferRoute.dest_tc)} 方向`;
    btnOut.textContent = `往 ${outName !== "?" ? outName : stripBracketCode(transferRoute.orig_tc)} 方向`;
    btnIn.disabled = false;
    btnOut.disabled = false;

    const btnReset = document.getElementById("btnResetTransfer");
    if (btnReset) btnReset.style.display = "inline-block";
  } catch (e) {
    console.error(e);
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

  const d1 = document.getElementById("transferStopList");
  if (d1) d1.innerHTML = "載入路線站點中...";
  transferCurrentStopId = null;
  transferEtaTimesByStop = {};
  const d2 = document.getElementById("transferHeadwayInfo");
  if (d2) d2.textContent = "計算班距中...";

  try {
    const rsData = await fetchJSON(
      `${BASE}/route-stop/${routeId}/${transferDirection}/${serviceType}`
    );
    const routeStopList = rsData.data || [];

    transferRouteStops = routeStopList
      .map(rs => {
        const stopInfo = allStopsMap.get(rs.stop);
        return {
          stop_id: rs.stop,
          seq: rs.seq,
          name_tc: stopInfo ? stopInfo.name_tc : `(未知站名) ${rs.stop}`,
          name_en: stopInfo ? stopInfo.name_en : ""
        };
      })
      .sort((a, b) => a.seq - b.seq);

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

    // ★ 重點：搵預設第二程上車站
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
        // 如你想 UI 顯示用 fallback 嗰個名，可以更新：
        // transferStopName = normalizeStopName(targetStop.name_tc);
      }
    }
  } catch (e) {
    console.error(e);
    const d1b = document.getElementById("transferStopList");
    if (d1b) d1b.textContent =
      "載入路線站點失敗：" + e.message;
    const d2b = document.getElementById("transferHeadwayInfo");
    if (d2b) d2b.textContent = "班距資料不足。";
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
  if (mainLine) {
    mainLine.textContent = `轉車路線：${routeText}`;
    if (dirName) mainLine.textContent += ` 往 ${dirName} 方向`;
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
    fetchJSON(`${BASE}/eta/${s.stop_id}/${transferRoute.route}/${transferServiceType}`)
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

    const targetStopId = transferCurrentStopId || transferRouteStops[0].stop_id;
    const times = (transferEtaTimesByStop && transferEtaTimesByStop[targetStopId])
      ? transferEtaTimesByStop[targetStopId]
      : [];

    if (!times || times.length < 2) {
      infoDiv.textContent = "班距資料不足。";
      return;
    }

    const diffs = [];
    for (let i = 1; i < times.length; i++) {
      const diffMin = Math.round((times[i] - times[i - 1]) / 60000);
      if (diffMin > 0) diffs.push(diffMin);
    }

    if (!diffs.length) {
      infoDiv.textContent = "班距資料不足。";
      return;
    }

    const sum = diffs.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / diffs.length);

    const stopInfo = transferRouteStops.find(s => s.stop_id === targetStopId);
    const stopNameLocal = stopInfo ? stopInfo.name_tc : "此站";
    infoDiv.textContent = `${stopNameLocal} 大約 ${avg} 分鐘一班車`;

    let btnShowAll = infoDiv.querySelector(".btn-show-all-stops");
    if (!btnShowAll) {
      btnShowAll = document.createElement("button");
      btnShowAll.className = "btn-show-all-stops";
      btnShowAll.textContent = "顯示全部站";
      btnShowAll.onclick = () => {
        const items = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
        items.forEach(x => x.style.display = "");
        btnShowAll.remove();
      };
      infoDiv.appendChild(document.createTextNode(" "));
      infoDiv.appendChild(btnShowAll);
    }
  } catch (e) {
    console.error("loadTransferHeadwayInfo error", e);
    infoDiv.textContent = "班距資料不足。";
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

async function selectTransferStop(stopId) {
  transferCurrentStopId = stopId;
  clearTransferStopSelectionUI();
  const el = document.querySelector(`#transferStopList .stop-item[data-stop-id="${stopId}"]`);
  if (!el) return;
  el.classList.add("selected");

  const etaBlock = el.querySelector(".eta-block");
  etaBlock.textContent = "載入 ETA 中...";

  let etaList = [];
  try {
    const data = await fetchJSON(
      `${BASE}/eta/${stopId}/${transferRoute.route}/${transferServiceType}`
    );
    let list = data.data || [];
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
		  // Case 1：Step 3 係轉車站 match 到架車 → 用實際落車時間 + 步行
		  arriveAtC = new Date(trackedTransferArriveTime.getTime() + walkMin * 60000);
		} else {
		  // Case 2：追蹤唔到 → 用預計 selectedEtaTime + travelMin + walkMin
		  arriveAtC = new Date(
			selectedEtaTime.getTime() + (travelMin + walkMin) * 60000
		  );
		}

      // 找第一班 eta >= arriveAtC
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
        }
      });

      // 步行時間文字
      let walkText;
      if (walkMin < 1) walkText = "<1分鐘";
      else if (walkMin > 60) walkText = ">1小時";
      else walkText = `${Math.round(walkMin)}分鐘`;

      // 清除舊紅色 highlight
      const rows = el.querySelectorAll(".eta-row");
      rows.forEach(row => row.classList.remove("transfer-tracked"));

      if (!bestBus || !isFinite(bestWaitMin)) {
        // 無下一班可接：只顯示步行 + 約幾點到達
        const hhmmArrive = formatTimeHHMM(arriveAtC);
        summaryText = `步行：約 ${walkText}；未有班次（約 ${hhmmArrive} 到達轉車站）`;
      } else {
        // 有班次可接：顯示步行＋等候，並 highlight 嗰班
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
		allItems.forEach(node => {
		  node.style.display = (node.dataset.stopId === stopId) ? "" : "none";
		});

		// ★ 新增：畫第二架車 route + 綠線
		selectSecondRoute(stopId);
}

  // ★ 喺 transferHeadwayInfo 加「顯示全部站」按鈕
  const infoDiv = document.getElementById("transferHeadwayInfo");
  if (infoDiv) {
    // 清除舊 button，避免重覆
    const oldBtn = infoDiv.querySelector(".btn-show-all-stops");
    if (oldBtn) oldBtn.remove();

    const btnShowAll = document.createElement("button");
    btnShowAll.className = "btn-show-all-stops";
    btnShowAll.textContent = "顯示全部站";
    btnShowAll.onclick = () => {
      const items = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
      items.forEach(x => x.style.display = "");
      btnShowAll.remove();
    };

    infoDiv.appendChild(document.createTextNode(" "));
    infoDiv.appendChild(btnShowAll);
  
}


function renderTransferStopList() {
  const container = document.getElementById("transferStopList");
  if (!container) return;
  container.innerHTML = "";
  transferRouteStops.forEach((s) => {
    const div = document.createElement("div");
    div.className = "stop-item";
    div.dataset.stopId = s.stop_id;

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

    // 點擊站 → 呼叫 selectTransferStop
    div.onclick = () => selectTransferStop(s.stop_id);

    container.appendChild(div);
  });
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


// 終極模擬點擊版：最穩陣嘅 URL 自動預填 (支援路線、方向、車站)
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

    if (foundRouteObj) {
        console.log("URL: 自動選擇路線 " + targetRoute);
        if (typeof selectRoute === "function") {
            selectRoute(foundRouteObj);
        }

        let dirWaitCount = 0;
        let waitForDirection = setInterval(() => {
            dirWaitCount++;
            if (dirWaitCount > 50) { clearInterval(waitForDirection); return; }

            const btnIn = document.getElementById("dirInbound");
            const btnOut = document.getElementById("dirOutbound");

            if (btnIn && btnOut && (!btnIn.disabled || !btnOut.disabled)) {
                clearInterval(waitForDirection); 

                if (dirParam !== null) {
                    const targetBtn = (dirParam === '0') ? btnIn : btnOut;
                    
                    if (targetBtn && !targetBtn.disabled) {
                        console.log("URL: 方向掣已準備好，正在模擬點擊...");
                        targetBtn.click(); 

                        // 等待車站列表渲染出嚟
                        if (staParam) {
                            let stopWaitCount = 0;
                            let waitForStops = setInterval(() => {
                                stopWaitCount++;
                                if (stopWaitCount > 100) { clearInterval(waitForStops); return; }

                                const stopListDiv = document.getElementById("stopList");
                                
                                if (stopListDiv && stopListDiv.innerText.includes(staParam)) {
                                    clearInterval(waitForStops);
                                    
                                    const allStopDivs = stopListDiv.querySelectorAll("div");
                                    let clicked = false;
                                    
                                    for (let div of allStopDivs) {
                                        // 確保點擊嘅係單一行車站 (而唔係成個大容器)
                                        if (div.innerText.includes(staParam) && div.onclick) {
                                            console.log("URL: 模擬點擊車站...");
                                            div.click();
                                            clicked = true;
                                            break; 
                                        }
                                    }

                                    if (!clicked) {
                                        // Backup: 用 Function 呼叫
                                        const foundStop = routeStops.find(rs => {
                                            const info = allStopsMap.get(rs.stop_id);
                                            return info && info.name_tc === staParam;
                                        });
                                        if (foundStop && typeof selectStop === "function") {
                                            const stopInfo = allStopsMap.get(foundStop.stop_id);
                                            selectStop(foundStop.stop_id, stopInfo.name_tc);
                                        }
                                    }
                                }
                            }, 100);
                        }
                    }
                }
            }
        }, 100);
    }
}



/* ========== 啟動 ========== */

init();

initMap();