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

// 追蹤上車站班次
let selectedEtaId = null;
let selectedEtaTime = null;
let selectedEtaStatus = null;

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

  if (day === 0) return 0.9;
  if (day === 6) return 0.8;

  const basePeak = 0.6;

  const m1_start = 6*60 + 30;
  const m1_peakS = 7*60 + 30;
  const m1_peakE = 9*60 + 30;
  const m1_end   = 10*60 + 30;

  const e1_start = 16*60;
  const e1_peakS = 17*60;
  const e1_peakE = 19*60 + 30;
  const e1_end   = 20*60 + 30;

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

    if (mainEtaTimer) clearInterval(mainEtaTimer);
    mainEtaTimer = setInterval(async () => {
      if (!currentRoute || !currentDirection || !routeStops.length) return;
      await loadEtaSummaryForAllStops();
      await loadHeadwayInfo();
      if (currentStopId) {
        await loadEtaDetailForStop(currentStopId);
      }
    }, 30000);
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
        onInterchangeButtonClick(s.stop_id);
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
  if (mode === "interchange_pick") {
    transferStopId = stopId;
    mode = "interchange_pair";
    renderStopsAccordingToMode();

    const walkInfoDiv = document.getElementById("transferWalkInfo");
    if (walkInfoDiv) walkInfoDiv.textContent = "";

    ensureDefaultTrackingAtOrigin().then(() => {
      if (originStopId) loadEtaDetailForStop(originStopId);
      if (transferStopId) loadEtaDetailForStop(transferStopId);
      guessBoardingBusAtTransferStop();
    });
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
  if (mode === "normal") {
    originStopId = stopId;
    mode = "interchange_pick";
    recomputeCumulativeTravelFromOrigin(stopId);
    renderStopList();
  } else if (mode === "interchange_pick") {
    originStopId = stopId;
    recomputeCumulativeTravelFromOrigin(stopId);
    renderStopList();
  }
  selectStop(stopId);
}

async function selectStop(stopId) {
  currentStopId = stopId;
  clearStopSelectionUI();
  const el = document.querySelector(`.stop-item[data-stop-id="${stopId}"]`);
  if (el) el.classList.add("selected");
  await Promise.all([
    loadEtaDetailForStop(stopId),
    loadEtaSummaryForAllStops(),
    loadHeadwayInfo()
  ]);
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


function findClosestMatchingBus(targetTime, targetStatus, actualEtas) {
  const LIMIT_MIN = 10; // 允許最大時間差（分鐘）

  // 1. 優先：同 status（departed / not_departed），唔理預定與否
  let best = null;
  let bestDiffMin = Infinity;

  for (const bus of actualEtas) {
    if (bus.status !== targetStatus) continue;

    const diffMs  = bus.time.getTime() - targetTime.getTime();
    const diffMin = Math.abs(diffMs) / 60000;

    if (diffMin < bestDiffMin) {
      bestDiffMin = diffMin;
      best = bus;
    }
  }

  if (best && bestDiffMin <= LIMIT_MIN) {
    return { type: "match", bus: best, diffMin: bestDiffMin };
  }

  // 2. 後備：喺全部班次中揀最近一班（可以選擇避開預定）
  best = null;
  bestDiffMin = Infinity;

  for (const bus of actualEtas) {
    // 如果你唔想 fallback 用預定，就打開呢行：
    // if (bus.isScheduled) continue;

    const diffMs  = bus.time.getTime() - targetTime.getTime();
    const diffMin = Math.abs(diffMs) / 60000;

    if (diffMin < bestDiffMin) {
      bestDiffMin = diffMin;
      best = bus;
    }
  }

  if (best && bestDiffMin <= LIMIT_MIN) {
    return { type: "match", bus: best, diffMin: bestDiffMin };
  }

  return { type: "untrackable" };
}

async function guessBoardingBusAtTransferStop() {
  if (!selectedEtaTime || !originStopId || !transferStopId || !cumulativeTravelFromOrigin) {
    setBoardingInfoTextForTransferStop("無法追蹤");
    // 清除轉車站 highlight
    const stopEl0 = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
    if (stopEl0) {
      stopEl0.querySelectorAll(".eta-row.transfer-tracked")
        .forEach(row => row.classList.remove("transfer-tracked"));
    }
    return;
  }
  if (!currentRoute || !currentDirectionCode) {
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
    setBoardingInfoTextForTransferStop("無法追蹤");
    return;
  }

  const departTime = selectedEtaTime;
  const travelMin = info.travelMinutes || 0;
  const arriveAtTransfer = new Date(departTime.getTime() + travelMin * 60000);

  let actualEtas = [];
  try {
    const data = await fetchJSON(
      `${BASE}/eta/${transferStopId}/${currentRoute.route}/${currentServiceType}`
    );
    let list = data.data || [];
    list = list.filter(item => item.dir === currentDirectionCode && item.eta);

    actualEtas = list.map(item => {
      const detail = formatDetailLine(item);
      return {
        time: detail.etaTime,
        isScheduled: detail.isScheduled,
        status: detail.status,
        raw: item
      };
    }).filter(x => x.time);
  } catch (e) {
    console.error("guessBoardingBusAtTransferStop fetch error", e);
    setBoardingInfoTextForTransferStop("無法追蹤");
    return;
  }

  if (!actualEtas.length) {
    setBoardingInfoTextForTransferStop("無法追蹤");
    return;
  }

  const targetStatus = selectedEtaStatus || "not_departed";
  const result = findClosestMatchingBus(arriveAtTransfer, targetStatus, actualEtas);

  if (result.type === "untrackable") {
    setBoardingInfoTextForTransferStop("無法追蹤");
    // 再保險清多次 highlight
    const stopEl2 = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
    if (stopEl2) {
      stopEl2.querySelectorAll(".eta-row.transfer-tracked")
        .forEach(row => row.classList.remove("transfer-tracked"));
    }
    return;
  }

  const matched = result.bus;
  const tStr = formatTimeHHMM(matched.time);
  setBoardingInfoTextForTransferStop(`搭緊：${tStr}`);

  const stopEl = document.querySelector(`.stop-item[data-stop-id="${transferStopId}"]`);
  if (!stopEl) return;

  const etaRows = stopEl.querySelectorAll(".eta-row");
  etaRows.forEach(row => row.classList.remove("transfer-tracked"));

  const hhmm = formatTimeHHMM(matched.time);

  etaRows.forEach(row => {
    const span = row.querySelector("span");
    if (!span) return;
    const text = span.textContent || "";
    if (text.startsWith(hhmm)) {
      row.classList.add("transfer-tracked");
    }
  });
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

    if (transferStopName) {
      const match = transferRouteStops.find(
        s => normalizeStopName(s.name_tc) === transferStopName
      );
      if (match) {
        await selectTransferStop(match.stop_id);
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

    div.onclick = () => selectTransferStop(s.stop_id);

    container.appendChild(div);
  });
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
          row.style.color = grayColorByMinutes(minutes); // 如你已改 class，可換回 class
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

      const arriveAtC = new Date(
        selectedEtaTime.getTime() + (travelMin + walkMin) * 60000
      );

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
        // ★ 無下一班可接：只顯示步行 + 約幾點到達
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
      walkInfoDiv.style.fontWeight = "bold";  // 步行/轉車行大隻啲
      walkInfoDiv.textContent = summaryText;
    } else {
      walkInfoDiv.textContent = "";
    }
  }

  const allItems = Array.from(document.querySelectorAll("#transferStopList .stop-item"));
  allItems.forEach(node => {
    node.style.display = (node.dataset.stopId === stopId) ? "" : "none";
  });
}


/* ========== 啟動 ========== */

init();