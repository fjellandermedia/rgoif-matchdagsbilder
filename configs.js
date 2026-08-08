"use strict";

/* Saved configurations: lets you prep several matches' background/crests/
 * team names/layout ahead of time, come back after the final whistle, and
 * just fill in the result instead of rebuilding the image from scratch.
 * Stored in IndexedDB (not localStorage) since backgrounds/crests are
 * images — localStorage's ~5-10MB quota would run out fast.
 * Deliberately excludes the publish panel (caption/platforms/schedule) —
 * that text is written fresh for each post, before vs after the match.
 */

const DB_NAME = "matchdagsgenerator";
const DB_VERSION = 1;
const STORE = "configs";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- image <-> dataURL, capped so storage stays lean ---------- */

function imageToDataUrl(img, mime, quality, maxDim) {
  if (!img) return null;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (maxDim && Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return c.toDataURL(mime, quality);
}

function thumbnailFromCanvas(size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  c.getContext("2d").drawImage(cv, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.6);
}

/* ---------- snapshot the editable state (excludes the publish panel) ---------- */

function snapshotState() {
  return {
    bg: {
      imgDataUrl: imageToDataUrl(state.bg.img, "image/jpeg", 0.85, 1600),
      zoom: state.bg.zoom, offsetX: state.bg.offsetX, offsetY: state.bg.offsetY,
      bw: state.bg.bw, shadow: state.bg.shadow,
    },
    crestHome: { imgDataUrl: imageToDataUrl(state.crestHome.img, "image/png", undefined, 500) },
    crestAway: { imgDataUrl: imageToDataUrl(state.crestAway.img, "image/png", undefined, 500) },
    crestSwapped: state.crestSwapped,
    crestSize: state.crestSize,
    crestHomeOffsetY: state.crestHomeOffsetY,
    crestAwayOffsetY: state.crestAwayOffsetY,
    teamHome: state.teamHome,
    teamAway: state.teamAway,
    scoreEnabled: state.scoreEnabled,
    scoreHome: state.scoreHome,
    scoreAway: state.scoreAway,
    headlineText: state.headlineText,
    headlineStyle: state.headlineStyle,
    headlineColor: state.headlineColor,
    infoLine: state.infoLine,
    infoSize: state.infoSize,
    textColor: state.textColor,
  };
}

async function applySnapshot(snap) {
  state.bg.img = snap.bg.imgDataUrl ? await loadImageFromUrl(snap.bg.imgDataUrl) : null;
  state.bg.zoom = snap.bg.zoom;
  state.bg.offsetX = snap.bg.offsetX;
  state.bg.offsetY = snap.bg.offsetY;
  state.bg.bw = snap.bg.bw;
  state.bg.shadow = snap.bg.shadow;

  state.crestHome.img = snap.crestHome.imgDataUrl ? await loadImageFromUrl(snap.crestHome.imgDataUrl) : null;
  state.crestAway.img = snap.crestAway.imgDataUrl ? await loadImageFromUrl(snap.crestAway.imgDataUrl) : null;
  state.crestSwapped = snap.crestSwapped;
  state.crestSize = snap.crestSize;
  state.crestHomeOffsetY = snap.crestHomeOffsetY;
  state.crestAwayOffsetY = snap.crestAwayOffsetY;

  state.teamHome = snap.teamHome;
  state.teamAway = snap.teamAway;
  state.scoreEnabled = snap.scoreEnabled;
  state.scoreHome = snap.scoreHome;
  state.scoreAway = snap.scoreAway;
  state.headlineText = snap.headlineText;
  state.headlineStyle = snap.headlineStyle;
  state.headlineColor = snap.headlineColor;
  state.infoLine = snap.infoLine;
  state.infoSize = snap.infoSize;
  state.textColor = snap.textColor;

  // sync every form control to match the restored state
  $("bgBw").checked = state.bg.bw;
  $("bgShadow").checked = state.bg.shadow;
  $("bgZoom").value = state.bg.zoom;
  setCrestPreview("crestHome", state.crestHome.img ? state.crestHome.img.src : null);
  setCrestPreview("crestAway", state.crestAway.img ? state.crestAway.img.src : null);
  $("crestSize").value = state.crestSize;
  $("crestHomeOffsetY").value = state.crestHomeOffsetY;
  $("crestAwayOffsetY").value = state.crestAwayOffsetY;
  $("teamHome").value = state.teamHome;
  $("teamAway").value = state.teamAway;
  $("scoreEnabled").checked = state.scoreEnabled;
  $("scoreRow").style.display = state.scoreEnabled ? "flex" : "none";
  $("scoreHome").value = state.scoreHome;
  $("scoreAway").value = state.scoreAway;
  $("headlineText").value = state.headlineText;
  $("headlineStyle").value = state.headlineStyle;
  $("headlineColor").value = state.headlineColor;
  $("infoLine").value = state.infoLine;
  $("infoSize").value = state.infoSize;
  $("textColor").value = state.textColor;

  render();
}

/* ---------- list UI ---------- */

function suggestConfigName() {
  const home = state.teamHome || "Hemma";
  const away = state.teamAway || "Borta";
  return away ? `${home} vs ${away}` : home;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function renderConfigList() {
  const list = $("configList");
  let configs;
  try {
    configs = await dbGetAll();
  } catch (err) {
    list.innerHTML = `<div class="hint">Kunde inte läsa sparade konfigurationer i den här webbläsaren.</div>`;
    return;
  }
  configs.sort((a, b) => b.savedAt - a.savedAt);

  list.innerHTML = "";
  if (!configs.length) {
    list.innerHTML = `<div class="hint">Inga sparade konfigurationer än.</div>`;
    return;
  }

  for (const cfg of configs) {
    const row = document.createElement("div");
    row.className = "config-item";
    row.innerHTML = `
      <img class="config-thumb" src="${cfg.thumbnail}" alt="">
      <div class="config-info">
        <div class="config-name">${escapeHtml(cfg.name)}</div>
        <div class="config-date">${new Date(cfg.savedAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</div>
      </div>
      <div class="config-actions">
        <button class="btn small" data-action="load">Ladda</button>
        <button class="btn small" data-action="delete">Ta bort</button>
      </div>
    `;
    row.querySelector('[data-action="load"]').addEventListener("click", async () => {
      await applySnapshot(cfg.snapshot);
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Ta bort "${cfg.name}"?`)) return;
      await dbDelete(cfg.id);
      renderConfigList();
    });
    list.appendChild(row);
  }
}

$("saveConfigBtn").addEventListener("click", async () => {
  const nameInput = $("configName");
  const name = nameInput.value.trim() || suggestConfigName();
  const record = {
    id: `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    savedAt: Date.now(),
    thumbnail: thumbnailFromCanvas(160),
    snapshot: snapshotState(),
  };
  try {
    await dbPut(record);
  } catch (err) {
    alert("Kunde inte spara konfigurationen: " + err.message);
    return;
  }
  nameInput.value = "";
  renderConfigList();
});

$("configName").addEventListener("focus", (e) => {
  if (!e.target.value) e.target.placeholder = suggestConfigName();
});

renderConfigList();
