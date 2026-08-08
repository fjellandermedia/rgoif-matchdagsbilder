"use strict";

/* ---------- state ---------- */

const state = {
  bg: { img: null, zoom: 1, offsetX: 0, offsetY: 0, bw: false, shadow: true },
  crestHome: { img: null },
  crestAway: { img: null },
  crestSwapped: false,
  crestSize: 142,
  crestHomeOffsetY: 0,
  crestAwayOffsetY: 0,
  teamHome: "Rydaholms GoIF",
  teamAway: "",
  scoreEnabled: false,
  scoreHome: "",
  scoreAway: "",
  headlineText: "",
  headlineStyle: "none", // none | top | vertical | stamp
  headlineColor: "#ffffff",
  infoLine: "",
  infoSize: 38,
  textColor: "#ffffff",
};

const PRESETS = {
  matchdag: {
    headlineText: "MATCHDAG", headlineStyle: "vertical", headlineColor: "#ffffff",
    scoreEnabled: false, infoLine: "Lördag 16:00, Kungshall",
  },
  hemmamatch: {
    headlineText: "HEMMAMATCH", headlineStyle: "top", headlineColor: "#ffffff",
    scoreEnabled: false, infoLine: "",
  },
  seger: {
    headlineText: "SEGER", headlineStyle: "top", headlineColor: "#e2231a",
    scoreEnabled: true, infoLine: "",
  },
  forlust: {
    headlineText: "", headlineStyle: "none", headlineColor: "#ffffff",
    scoreEnabled: true, infoLine: "",
  },
  installd: {
    headlineText: "INSTÄLLD", headlineStyle: "stamp", headlineColor: "#e2231a",
    scoreEnabled: false, infoLine: "Lördag 16:00, Kungshall",
  },
  fri: {
    headlineText: "", headlineStyle: "top", headlineColor: "#ffffff",
    scoreEnabled: false, infoLine: "",
  },
};

/* ---------- dom refs ---------- */

const $ = (id) => document.getElementById(id);
const cv = $("cv");
const ctx = cv.getContext("2d");
const SIZE = 1080;

/* ---------- image loading helpers ---------- */

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/* ---------- text helpers ---------- */

function fitFontSize(measureCtx, text, maxWidth, maxSize, minSize, weight, family) {
  let size = maxSize;
  while (size > minSize) {
    measureCtx.font = `${weight} ${size}px ${family}`;
    if (measureCtx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

const FONT = "'Helvetica Neue',Arial,sans-serif";

function drawTextWithShadow(text, x, y, opts) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align || "left";
  ctx.textBaseline = opts.baseline || "alphabetic";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ---------- background ---------- */

function drawBackground() {
  ctx.fillStyle = "#14161b";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const img = state.bg.img;
  if (!img) return;

  const scale = Math.max(SIZE / img.width, SIZE / img.height) * state.bg.zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (SIZE - w) / 2 + state.bg.offsetX;
  const y = (SIZE - h) / 2 + state.bg.offsetY;

  ctx.save();
  if (state.bg.bw) ctx.filter = "grayscale(1)";
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();

  if (state.bg.shadow) {
    const g = ctx.createLinearGradient(0, SIZE * 0.45, 0, SIZE);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.62)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

/* ---------- crests ---------- */

const PAD = 50;

function roundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCrestBox(img, x, y, size) {
  if (!img) return;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  roundedRectPath(x, y, size, size, size * 0.16);
  ctx.fillStyle = "rgba(0,0,0,0.001)"; // keeps shadow without visible fill
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(x, y, size, size, size * 0.16);
  ctx.clip();
  // contain-fit within the box
  const s = Math.min(size / img.width, size / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  ctx.restore();
}

function crestLayout() {
  return { size: state.crestSize, x: PAD };
}

// Each crest is vertically centered on its own team's text line, so the
// middle of the badge lines up with the middle of the name next to it.
// The per-crest offset sliders then nudge that up/down to compensate for
// how far each logo's own artwork sits off-center within its cutout.
function drawCrests(layout) {
  const { size, x } = crestLayout();
  const homeLine = layout.lines.find((l) => l.type === "team" && l.isHome);
  const awayLine = layout.lines.find((l) => l.type === "team" && !l.isHome);
  const homeImg = state.crestSwapped ? state.crestAway.img : state.crestHome.img;
  const awayImg = state.crestSwapped ? state.crestHome.img : state.crestAway.img;
  const homeOffset = state.crestSwapped ? state.crestAwayOffsetY : state.crestHomeOffsetY;
  const awayOffset = state.crestSwapped ? state.crestHomeOffsetY : state.crestAwayOffsetY;
  if (homeLine) drawCrestBox(homeImg, x, homeLine.center - size / 2 + homeOffset, size);
  if (awayLine) drawCrestBox(awayImg, x, awayLine.center - size / 2 + awayOffset, size);
}

/* ---------- headline ---------- */

function drawHeadline() {
  const text = state.headlineText.trim();
  if (!text || state.headlineStyle === "none") return;
  const color = state.headlineColor;

  if (state.headlineStyle === "top") {
    const maxW = SIZE - PAD * 2;
    const size = fitFontSize(ctx, text, maxW, 118, 40, 900, FONT);
    ctx.font = `900 ${size}px ${FONT}`;
    drawTextWithShadow(text.toUpperCase(), SIZE / 2, PAD + size * 0.85, {
      color, align: "center", baseline: "alphabetic",
    });
    return;
  }

  if (state.headlineStyle === "vertical") {
    const chars = text.toUpperCase().replace(/\s+/g, "").split("");
    if (!chars.length) return;
    const top = PAD + 10;
    const bottom = SIZE - PAD - 10;
    const avail = bottom - top;
    let step = avail / chars.length;
    let size = Math.min(96, Math.max(30, step * 0.82));
    step = Math.min(step, size / 0.72);
    ctx.font = `900 ${size}px ${FONT}`;
    const x = SIZE - PAD - size * 0.55;
    chars.forEach((c, i) => {
      const y = top + step * (i + 0.72);
      drawTextWithShadow(c, x, y, { color, align: "center", baseline: "alphabetic" });
    });
    return;
  }

  if (state.headlineStyle === "stamp") {
    const size = fitFontSize(ctx, text.toUpperCase(), 980, 170, 50, 900, FONT);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2 + 30);
    ctx.rotate(-22 * Math.PI / 180);
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(6, size * 0.055);
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = 18;
    ctx.strokeText(text.toUpperCase(), 0, 0);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = color;
    ctx.fillText(text.toUpperCase(), 0, 0);
    ctx.restore();
    return;
  }
}

/* ---------- team / score / info block ---------- */

function contentBounds() {
  const { size, x } = crestLayout();
  const left = x + size + 40;
  const rightPad = state.headlineStyle === "vertical" ? PAD + 120 : PAD;
  const right = SIZE - rightPad;
  return { left, right, width: right - left };
}

function drawTeamLine(name, score, y, fontSize) {
  const { left, right, width } = contentBounds();
  const showScore = state.scoreEnabled && score !== "" && score !== null && score !== undefined;
  const scoreText = showScore ? String(score) : "";
  ctx.font = `800 ${fontSize}px ${FONT}`;
  const scoreW = showScore ? ctx.measureText(scoreText).width + 24 : 0;
  const nameMaxW = width - scoreW;
  const nameSize = fitFontSize(ctx, name || "", nameMaxW, fontSize, 22, 800, FONT);
  ctx.font = `800 ${nameSize}px ${FONT}`;
  drawTextWithShadow(name || "", left, y, { color: state.textColor, align: "left", baseline: "alphabetic" });
  if (showScore) {
    ctx.font = `800 ${fontSize}px ${FONT}`;
    drawTextWithShadow(scoreText, right, y, { color: state.textColor, align: "right", baseline: "alphabetic" });
  }
}

// Computes each text line's vertical box (top, height, baseline y, and
// visual center) without drawing anything, so crest placement can be
// derived from the same numbers used to draw the text.
function computeTextLayout() {
  const teamSize = 62;
  const vsSize = 36;
  const infoSize = state.infoSize;
  const extraGap = 6; // breathing room between each line's own box
  const teamRowGap = 40; // extra space around "vs" so crests have room to breathe
  const opticalOffset = (size) => size * 0.37; // baseline -> approx glyph optical center

  // The home/vs/away trio stacks as self-contained boxes (1.3x each line's
  // own font size) so boxes can't overlap. The info line is anchored to the
  // bottom edge on its own, independent of that stack.
  const home = { type: "team", isHome: true, text: state.teamHome, score: state.scoreHome, size: teamSize };
  const vs = { type: "vs", size: vsSize };
  const away = { type: "team", isHome: false, text: state.teamAway, score: state.scoreAway, size: teamSize };
  const lines = [home, vs, away];
  for (const l of lines) l.boxH = l.size * 1.3 + extraGap + (l.type === "vs" ? teamRowGap : 0);

  const liftUp = 20; // nudge the whole team/vs/info package up off the bottom edge
  const teamLiftExtra = 20; // additional lift for the team/vs trio only — info line stays put
  const info = state.infoLine.trim();
  let infoLine = null;
  let blockBottom = SIZE - PAD - 48 - liftUp - teamLiftExtra;
  if (info) {
    infoLine = { type: "info", text: info, size: infoSize };
    infoLine.y = SIZE - 22 - liftUp; // baseline, close to the bottom edge — unchanged
    const infoBoxTop = infoLine.y - infoSize * 0.82;
    blockBottom = infoBoxTop - 4 - teamLiftExtra;
  }

  const totalH = lines.reduce((s, l) => s + l.boxH, 0);
  let boxTop = blockBottom - totalH;

  for (const line of lines) {
    line.boxTop = boxTop;
    line.center = boxTop + line.boxH / 2;
    line.y = boxTop + line.size * 0.82; // baseline
    boxTop += line.boxH;
  }

  // Force "vs" to sit exactly at the optical midpoint between the two team
  // names — the box-stacking math above only guarantees box-center symmetry,
  // which isn't the same as the glyphs themselves looking centered.
  const homeOptical = home.y - opticalOffset(home.size);
  const awayOptical = away.y - opticalOffset(away.size);
  vs.y = (homeOptical + awayOptical) / 2 + opticalOffset(vs.size);

  const allLines = infoLine ? [...lines, infoLine] : lines;
  return { lines: allLines };
}

function drawTextBlock(layout) {
  const { left, right, width } = contentBounds();
  for (const line of layout.lines) {
    if (line.type === "team") {
      drawTeamLine(line.text, line.score, line.y, line.size);
    } else if (line.type === "vs") {
      ctx.font = `700 ${line.size}px ${FONT}`;
      drawTextWithShadow("vs", (left + right) / 2, line.y, { color: state.textColor, align: "center", baseline: "alphabetic" });
    } else if (line.type === "info") {
      const size = fitFontSize(ctx, line.text, width, line.size, 20, 600, FONT);
      ctx.font = `600 ${size}px ${FONT}`;
      drawTextWithShadow(line.text, (left + right) / 2, line.y, { color: state.textColor, align: "center", baseline: "alphabetic" });
    }
  }
}

/* ---------- master render ---------- */

function render() {
  ctx.clearRect(0, 0, SIZE, SIZE);
  drawBackground();
  const layout = computeTextLayout();
  drawCrests(layout);
  drawHeadline();
  drawTextBlock(layout);
}

/* ---------- background drag / zoom ---------- */

let dragging = false, dragStart = null;

cv.addEventListener("pointerdown", (e) => {
  if (!state.bg.img) return;
  dragging = true;
  const rect = cv.getBoundingClientRect();
  const scale = SIZE / rect.width;
  dragStart = {
    x: e.clientX, y: e.clientY,
    offX: state.bg.offsetX, offY: state.bg.offsetY, scale,
  };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = (e.clientX - dragStart.x) * dragStart.scale;
  const dy = (e.clientY - dragStart.y) * dragStart.scale;
  state.bg.offsetX = dragStart.offX + dx;
  state.bg.offsetY = dragStart.offY + dy;
  render();
});
cv.addEventListener("pointerup", () => { dragging = false; });
cv.addEventListener("pointercancel", () => { dragging = false; });
cv.addEventListener("wheel", (e) => {
  if (!state.bg.img) return;
  e.preventDefault();
  const delta = -e.deltaY * 0.0015;
  const z = Math.min(3, Math.max(1, state.bg.zoom + delta));
  $("bgZoom").value = z;
  state.bg.zoom = z;
  render();
}, { passive: false });

$("resetBg").addEventListener("click", () => {
  state.bg.offsetX = 0; state.bg.offsetY = 0; state.bg.zoom = 1;
  $("bgZoom").value = 1;
  render();
});

/* ---------- background: file upload + drop ---------- */

async function setBackgroundFromFile(file) {
  if (!file) return;
  const img = await loadImageFromFile(file);
  state.bg.img = img;
  state.bg.offsetX = 0; state.bg.offsetY = 0; state.bg.zoom = 1;
  $("bgZoom").value = 1;
  render();
}

$("bgDrop").addEventListener("click", () => $("bgFile").click());
$("bgFile").addEventListener("change", (e) => setBackgroundFromFile(e.target.files[0]));
["dragover"].forEach((ev) =>
  $("bgDrop").addEventListener(ev, (e) => { e.preventDefault(); $("bgDrop").style.borderColor = "var(--accent)"; })
);
$("bgDrop").addEventListener("dragleave", () => { $("bgDrop").style.borderColor = ""; });
$("bgDrop").addEventListener("drop", (e) => {
  e.preventDefault();
  $("bgDrop").style.borderColor = "";
  const file = e.dataTransfer.files[0];
  if (file) setBackgroundFromFile(file);
});

/* ---------- crests: upload ---------- */

// Keeps the visible crest preview (home always shows something — falls back
// to the bundled RGoIF logo; away shows a placeholder text until one is set)
// in sync with state. Shared by manual upload, team-swap, and loading a
// saved configuration.
function setCrestPreview(which, src) {
  if (which === "crestHome") {
    $("crestHomeImg").src = src || "rgoif-logo.png";
    return;
  }
  const drop = $("crestAwayDrop");
  const placeholder = $("crestAwayPlaceholder");
  const img = $("crestAwayImg");
  if (src) {
    img.src = src;
    img.style.display = "block";
    placeholder.style.display = "none";
    drop.classList.add("has-image");
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    placeholder.style.display = "";
    drop.classList.remove("has-image");
  }
}

async function setCrestFromFile(which, file) {
  if (!file) return;
  const img = await loadImageFromFile(file);
  state[which].img = img;
  setCrestPreview(which, img.src);
  render();
}

$("crestHomeDrop").addEventListener("click", () => $("crestHomeFile").click());
$("crestHomeFile").addEventListener("change", (e) => setCrestFromFile("crestHome", e.target.files[0]));
$("crestAwayDrop").addEventListener("click", () => $("crestAwayFile").click());
$("crestAwayFile").addEventListener("change", (e) => setCrestFromFile("crestAway", e.target.files[0]));

$("swapCrests").addEventListener("click", () => {
  state.crestSwapped = !state.crestSwapped;
  render();
});
$("swapTeams").addEventListener("click", () => {
  [state.teamHome, state.teamAway] = [state.teamAway, state.teamHome];
  [state.scoreHome, state.scoreAway] = [state.scoreAway, state.scoreHome];
  [state.crestHome.img, state.crestAway.img] = [state.crestAway.img, state.crestHome.img];
  [state.crestHomeOffsetY, state.crestAwayOffsetY] = [state.crestAwayOffsetY, state.crestHomeOffsetY];
  $("teamHome").value = state.teamHome;
  $("teamAway").value = state.teamAway;
  $("scoreHome").value = state.scoreHome;
  $("scoreAway").value = state.scoreAway;
  setCrestPreview("crestHome", state.crestHome.img ? state.crestHome.img.src : null);
  setCrestPreview("crestAway", state.crestAway.img ? state.crestAway.img.src : null);
  $("crestHomeOffsetY").value = state.crestHomeOffsetY;
  $("crestAwayOffsetY").value = state.crestAwayOffsetY;
  render();
});

$("crestSize").addEventListener("input", (e) => {
  state.crestSize = Number(e.target.value);
  render();
});

$("crestHomeOffsetY").addEventListener("input", (e) => {
  state.crestHomeOffsetY = Number(e.target.value);
  render();
});
$("crestAwayOffsetY").addEventListener("input", (e) => {
  state.crestAwayOffsetY = Number(e.target.value);
  render();
});

/* ---------- form field wiring ---------- */

function bindText(id, key, transform) {
  $(id).addEventListener("input", (e) => {
    state[key] = transform ? transform(e.target.value) : e.target.value;
    render();
  });
}

bindText("teamHome", "teamHome");
bindText("teamAway", "teamAway");
bindText("headlineText", "headlineText");
bindText("infoLine", "infoLine");
bindText("scoreHome", "scoreHome");
bindText("scoreAway", "scoreAway");

$("infoSize").addEventListener("input", (e) => { state.infoSize = Number(e.target.value); render(); });

$("headlineStyle").addEventListener("change", (e) => { state.headlineStyle = e.target.value; render(); });
$("headlineColor").addEventListener("input", (e) => { state.headlineColor = e.target.value; render(); });
$("textColor").addEventListener("input", (e) => { state.textColor = e.target.value; render(); });

$("scoreEnabled").addEventListener("change", (e) => {
  state.scoreEnabled = e.target.checked;
  $("scoreRow").style.display = state.scoreEnabled ? "flex" : "none";
  render();
});

$("bgBw").addEventListener("change", (e) => { state.bg.bw = e.target.checked; render(); });
$("bgShadow").addEventListener("change", (e) => { state.bg.shadow = e.target.checked; render(); });
$("bgZoom").addEventListener("input", (e) => { state.bg.zoom = Number(e.target.value); render(); });

/* ---------- presets ---------- */

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  Object.assign(state, p);
  $("headlineText").value = state.headlineText;
  $("headlineStyle").value = state.headlineStyle;
  $("headlineColor").value = state.headlineColor;
  $("infoLine").value = state.infoLine;
  $("scoreEnabled").checked = state.scoreEnabled;
  $("scoreRow").style.display = state.scoreEnabled ? "flex" : "none";
}

$("preset").addEventListener("change", (e) => {
  applyPreset(e.target.value);
  render();
});

/* ---------- download ---------- */

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

$("download").addEventListener("click", () => {
  const name = [slugify(state.teamHome), slugify(state.teamAway)].filter(Boolean).join("-vs-") || "matchbild";
  const link = document.createElement("a");
  link.download = `${name}.png`;
  link.href = cv.toDataURL("image/png");
  link.click();
});

/* ---------- init ---------- */

(async function init() {
  applyPreset($("preset").value);
  state.crestHome.img = await loadImageFromUrl("rgoif-logo.png");
  render();
})();
