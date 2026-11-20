// ============================================================================
// engine.js - game loop, input, map, camera, collision, lighting, rendering,
// UI primitives (dialogue, choice menu, letter prompt, panel, info card,
// tool-call ticker, HUD) and the window.GAME debug API.
// Content (map, objects, text) lives in content.js; art in assets.js.
// ============================================================================

(() => {
"use strict";

const TILE = 16;
const VIEW_W = 480, VIEW_H = 288;   // canvas pixels (shown at 2x)
const SCALE = 2;
const HUD_TOP = 18, HUD_BOTTOM = 20; // canvas pixels hidden under the HUD strips
const SPEED = 88;                    // player walk speed, px/s
const PLAYER_SCALE = 1.35;           // the player (and Polly) are drawn a little larger than a tile

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Fit the 960x576 stage into the window.
// ---------------------------------------------------------------------------
function fitStage() {
  const s = Math.min(window.innerWidth / 960, window.innerHeight / 576);
  const st = $("stage");
  st.style.left = Math.round((window.innerWidth - 960 * s) / 2) + "px";
  st.style.top = Math.round((window.innerHeight - 576 * s) / 2) + "px";
  st.style.transform = `scale(${s})`;
}
window.addEventListener("resize", fitStage);
fitStage();

// ---------------------------------------------------------------------------
// Smooth 1D value noise, used for the flicker of every flame.
// ---------------------------------------------------------------------------
const NOISE = Array.from({ length: 256 }, () => Math.random());
function noise(t) {
  const i = Math.floor(t), f = t - i;
  const a = NOISE[i & 255], b = NOISE[(i + 1) & 255];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u; // 0..1
}

// ===========================================================================
// MAP
// ===========================================================================
const MAP = (() => {
  const def = CONTENT.map;
  const W = def.width, H = def.height;
  const wall = new Uint8Array(W * H).fill(1);
  const room = new Int8Array(W * H).fill(-1);
  def.rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) { wall[y * W + x] = 0; room[y * W + x] = i; }
  });
  def.doors.forEach((d) => {
    for (let y = d.y; y < d.y + d.h; y++)
      for (let x = d.x; x < d.x + d.w; x++) wall[y * W + x] = 0;
  });
  const isWall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || wall[y * W + x] === 1;
  const roomAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : room[y * W + x];
  return { W, H, isWall, roomAt, rooms: def.rooms, pxW: W * TILE, pxH: H * TILE };
})();

// Floor style for a doorway tile: borrow the nearest room's style.
function floorStyleAt(x, y) {
  let r = MAP.roomAt(x, y);
  if (r < 0) {
    for (let d = 1; d < 6 && r < 0; d++) {
      r = MAP.roomAt(x, y + d); if (r < 0) r = MAP.roomAt(x, y - d);
    }
  }
  return r >= 0 ? MAP.rooms[r].floor : "wood";
}

// Pre-render the whole static map (floors + walls) once.
const mapCanvas = (() => {
  const cv = document.createElement("canvas");
  cv.width = MAP.pxW; cv.height = MAP.pxH;
  const c = cv.getContext("2d");
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

  for (let ty = 0; ty < MAP.H; ty++) {
    for (let tx = 0; tx < MAP.W; tx++) {
      const X = tx * TILE, Y = ty * TILE, h = hash(tx, ty);
      if (!MAP.isWall(tx, ty)) {
        drawFloor(c, R, floorStyleAt(tx, ty), tx, ty, X, Y, h);
      } else if (!MAP.isWall(tx, ty + 1)) {
        // Wall face (the side you see, above a floor)
        R(X, Y, 16, 16, "#2a1846");
        for (let sx = 1; sx < 16; sx += 4) R(X + sx, Y + 3, 1, 10, "#33204f");
        R(X, Y, 16, 2, PAL.trim);
        R(X, Y + 2, 16, 1, "#3a2458");
        R(X, Y + 13, 16, 3, PAL.wall);
        R(X, Y + 13, 16, 1, PAL.trim);
      } else {
        // Wall top
        R(X, Y, 16, 16, PAL.wall);
        if (h % 7 === 0) R(X + (h % 13), Y + (h % 11), 2, 1, "#22143a");
        if (!MAP.isWall(tx, ty - 1)) R(X, Y, 16, 2, PAL.trim);          // ledge above a floor
        if (!MAP.isWall(tx - 1, ty)) R(X, Y, 1, 16, PAL.trim);
        if (!MAP.isWall(tx + 1, ty)) R(X + 15, Y, 1, 16, PAL.trim);
      }
      // Soft shadow on floors right under a wall face
      if (!MAP.isWall(tx, ty) && MAP.isWall(tx, ty - 1)) {
        c.fillStyle = "rgba(10,4,20,0.45)"; c.fillRect(X, Y, 16, 4);
      }
    }
  }
  return cv;
})();

function drawFloor(c, R, style, tx, ty, X, Y, h) {
  if (style === "tile") {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++)
      R(X + i * 8, Y + j * 8, 8, 8, (i + j) % 2 ? "#2f1d4b" : "#3a2458");
    R(X, Y, 16, 1, "#26163d"); R(X, Y, 1, 16, "#26163d");
  } else if (style === "stone") {
    R(X, Y, 16, 16, "#221432");
    R(X + (ty % 2 ? 0 : 8), Y, 1, 16, "#1a0f2e"); R(X, Y + 15, 16, 1, "#1a0f2e");
    if (h % 5 === 0) R(X + (h % 12), Y + (h % 9) + 2, 3, 2, PAL.moss);
  } else if (style === "straw") {
    // soft purple boards dusted with stray straw
    R(X, Y, 16, 16, (tx + ty) % 2 ? PAL.floorA : PAL.floorB);
    R(X, Y + 15, 16, 1, "#24153a");
    if (h % 3 === 0) R(X + (h % 11) + 1, Y + ((h >> 4) % 12) + 2, 4, 1, "#6a5040");
    if (h % 5 === 0) R(X + ((h >> 3) % 10) + 2, Y + ((h >> 6) % 10) + 3, 1, 3, "#5a4434");
  } else {
    // wood planks (also used under the hallway runner and library)
    R(X, Y, 16, 8, (ty + (tx >> 1)) % 2 ? PAL.floorA : PAL.floorB);
    R(X, Y + 8, 16, 8, (ty + ((tx + 1) >> 1)) % 2 ? PAL.floorB : PAL.floorA);
    R(X, Y + 7, 16, 1, "#24153a"); R(X, Y + 15, 16, 1, "#24153a");
    R(X + ((tx + ty) % 2 ? 4 : 12), Y, 1, 8, "#24153a");
    if (style === "runner" && ty >= 18 && ty <= 19) {
      R(X, Y, 16, 16, "#3b1d3f");
      if (ty === 18) R(X, Y, 16, 1, "#7a3a2a");
      if (ty === 19) R(X, Y + 15, 16, 1, "#7a3a2a");
      if (tx % 3 === 0) R(X + 6, Y + (ty === 18 ? 12 : 2), 4, 2, "#5a2a3a");
    }
    if (style === "books" && h % 11 === 0) R(X + 3, Y + 4, 5, 3, PAL.pale + "33"); // stray paper
  }
}

// ===========================================================================
// OBJECTS (built from CONTENT.objects)
// ===========================================================================
const objects = CONTENT.objects.map((o) => {
  const sz = ASSETS.size(o.sprite) || { w: 16, h: 16 };
  const x = o.x * TILE + (o.dx || 0);
  let y;
  if (o.mount === "wall") y = (o.y + 1) * TILE - sz.h + (o.dy || 0);
  else y = o.y * TILE + (o.dy || 0);
  const obj = Object.assign({}, o, { px: x, py: y, w: sz.w, h: sz.h, hidden: !!o.hidden });
  if (o.solid) {
    const hit = o.hit || [0, 0, sz.w, sz.h];
    obj.box = { x: x + hit[0], y: y + hit[1], w: hit[2], h: hit[3] };
  }
  // Area to interact with: the sprite, extended to the floor for wall objects.
  obj.zone = { x, y, w: sz.w, h: (o.mount === "wall" ? (o.y + 1) * TILE - y : sz.h) + (o.reach || 0) };
  return obj;
});
const objById = {};
objects.forEach((o) => (objById[o.id] = o));

const npcs = CONTENT.npcs.map((n) => ({ ...n, px: n.x * TILE, py: n.y * TILE, t: Math.random() * 10 }));

// ===========================================================================
// GAME STATE
// ===========================================================================
const S = {
  mode: "title",           // "title" | "play" | "cutscene"
  thread: 1,
  ctx: 0,                  // context window fill, 0-100
  flags: {},
  belt: [],                // item ids, max 4
  beltOn: {},              // item id -> toggled on (e.g. UV light)
  slots: Array(11).fill(null), // per password letter: null | "store" | "chalk"
  toolLog: [],             // every tool call, for the ending replay
  cardsUnlocked: [],
  area: -1,
  time: 0,
  lock: false,             // freeze movement during cutscenes
  intro: { sitting: false, birdHidden: false, birdFly: false, eyes: null, ceiling: null, birdPeek: 0 },
};
const player = { x: 0, y: 0, dir: "down", moving: false, anim: 0 };
const cam = { x: 0, y: 0, shake: 0, shakeMag: 0 };

function placePlayer(tx, ty) {
  player.x = tx * TILE + 8; player.y = ty * TILE + 12;
  snapCamera();
  updateArea(true);
}

// ===========================================================================
// INPUT
// ===========================================================================
const held = new Set();
const pressed = [];
const KEYMAP = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (KEYMAP[k]) held.add(KEYMAP[k]);
  if (!e.repeat) pressed.push(k);
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) held.delete(KEYMAP[k]);
});
window.addEventListener("blur", () => held.clear());
const isOk = (k) => k === "z" || k === "enter" || k === " ";
const isBack = (k) => k === "x" || k === "escape";

// ===========================================================================
// COLLISION
// ===========================================================================
// Player hitbox: 10x6 at the feet.
const PB = { l: -5, r: 5, t: -6, b: 0 };
function blockedAt(x, y) {
  const l = x + PB.l, r = x + PB.r - 0.01, t = y + PB.t, b = y + PB.b - 0.01;
  for (let ty = Math.floor(t / TILE); ty <= Math.floor(b / TILE); ty++)
    for (let tx = Math.floor(l / TILE); tx <= Math.floor(r / TILE); tx++)
      if (MAP.isWall(tx, ty)) return true;
  for (const o of objects) {
    if (!o.box || o.hidden) continue;
    if (o.solidUnless && S.flags[o.solidUnless]) continue;
    const bx = o.box;
    if (r > bx.x && l < bx.x + bx.w && b > bx.y && t < bx.y + bx.h) return true;
  }
  return false;
}

// Move along one axis. If blocked, nudge sideways (up to ASSIST px) to slip
// around corners and into doorways.
const ASSIST = 14;
function moveAxis(dx, dy) {
  const nx = player.x + dx, ny = player.y + dy;
  if (!blockedAt(nx, ny)) { player.x = nx; player.y = ny; return; }
  const step = Math.abs(dx || dy);
  for (let off = 1; off <= ASSIST; off++) {
    for (const s of [-1, 1]) {
      const ox = dx ? 0 : s * off, oy = dx ? s * off : 0;
      if (!blockedAt(nx + ox, ny + oy)) {
        const mx = Math.sign(ox) * Math.min(step, Math.abs(ox));
        const my = Math.sign(oy) * Math.min(step, Math.abs(oy));
        if (!blockedAt(player.x + mx, player.y + my)) { player.x += mx; player.y += my; }
        return;
      }
    }
  }
}

// ===========================================================================
// CAMERA
// ===========================================================================
function camTarget() {
  let x = player.x - VIEW_W / 2;
  let y = player.y - 8 - (VIEW_H + HUD_TOP - HUD_BOTTOM) / 2 + 1;
  x = Math.max(0, Math.min(MAP.pxW - VIEW_W, x));
  y = Math.max(-HUD_TOP, Math.min(MAP.pxH - VIEW_H + HUD_BOTTOM, y));
  return { x, y };
}
function snapCamera() { const t = camTarget(); cam.x = t.x; cam.y = t.y; }
function updateCamera(dt) {
  const t = camTarget();
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
  if (cam.shake > 0) cam.shake -= dt;
}
function shake(ms = 300, mag = 3) { cam.shake = ms / 1000; cam.shakeMag = mag; }

// ===========================================================================
// AREA (which room you're in) -> HUD path
// ===========================================================================
function updateArea(force) {
  const r = MAP.roomAt(Math.floor(player.x / TILE), Math.floor((player.y - 3) / TILE));
  if (r >= 0 && (r !== S.area || force)) {
    const prev = S.area;
    S.area = r;
    $("hud-path").textContent = MAP.rooms[r].path;
    if (!force && prev !== r && GAME.onEnterArea) GAME.onEnterArea(MAP.rooms[r].id, prev >= 0 ? MAP.rooms[prev].id : null);
  }
}

// ===========================================================================
// LIGHTING
// ===========================================================================
const lightCv = document.createElement("canvas");
lightCv.width = VIEW_W; lightCv.height = VIEW_H;
const lctx = lightCv.getContext("2d");
const LIGHT_TINT = {
  warm:   "255,130,40",
  green:  "123,211,137",
  violet: "180,110,255",
};
const flicker = { next: 20 + Math.random() * 20, until: 0 }; // the house-wide dim flicker

function lightSources() {
  const out = [];
  const t = S.time;
  // The lantern: noisy radius and brightness, never a regular pulse.
  const n1 = noise(t * 4.3), n2 = noise(t * 13.7 + 91);
  out.push({ x: player.x, y: player.y - 8, r: 86 + (n1 - 0.5) * 12 + (n2 - 0.5) * 6,
    a: 0.92 + (n2 - 0.5) * 0.12, tint: "warm", warm: 0.20 + n1 * 0.06 });
  objects.forEach((o, i) => {
    if (!o.light || o.hidden) return;
    const cx = o.px + o.w / 2, cy = o.py + o.h / 2 + (o.light.y || 0);
    if (cx < cam.x - 80 || cx > cam.x + VIEW_W + 80 || cy < cam.y - 80 || cy > cam.y + VIEW_H + 80) return;
    const isFlame = o.light.color === "warm";
    const f = isFlame ? noise(t * 6 + i * 17.3) : 0.5 + Math.sin(t * 2 + i) * 0.15;
    out.push({ x: cx, y: cy, r: o.light.r * (0.88 + f * 0.24), a: isFlame ? 0.75 + f * 0.2 : 0.55,
      tint: o.light.color, warm: isFlame ? 0.16 + f * 0.08 : 0.14 });
  });
  return out;
}

function renderLighting() {
  const dim = S.time < flicker.until;
  const dark = dim ? 0.93 : 0.8;
  const lights = lightSources();
  lctx.globalCompositeOperation = "source-over";
  lctx.clearRect(0, 0, VIEW_W, VIEW_H);
  lctx.fillStyle = `rgba(8,3,22,${dark})`;
  lctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Cut holes in the darkness.
  lctx.globalCompositeOperation = "destination-out";
  for (const L of lights) {
    const x = L.x - cam.x, y = L.y - cam.y, r = L.r * (dim ? 0.6 : 1);
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${L.a})`);
    g.addColorStop(0.55, `rgba(0,0,0,${L.a * 0.55})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = g;
    lctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Moonbeams
  for (const m of CONTENT.moonbeams) {
    const g = lctx.createLinearGradient(0, m.from[1] - cam.y, 0, m.to[1] - cam.y);
    g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0.1)");
    lctx.fillStyle = g;
    beamPath(lctx, m);
    lctx.fill();
  }
  ctx.drawImage(lightCv, 0, 0);

  // Add warm/ghostly colour on top.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const L of lights) {
    const x = L.x - cam.x, y = L.y - cam.y, r = L.r * (dim ? 0.6 : 1) * 0.9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${LIGHT_TINT[L.tint]},${L.warm})`);
    g.addColorStop(1, `rgba(${LIGHT_TINT[L.tint]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (const m of CONTENT.moonbeams) {
    ctx.fillStyle = "rgba(155,109,255,0.10)";
    beamPath(ctx, m);
    ctx.fill();
  }
  ctx.restore();
}
function beamPath(c, m) {
  c.beginPath();
  c.moveTo(m.from[0] - cam.x, m.from[1] - cam.y);
  c.lineTo(m.from[2] - cam.x, m.from[3] - cam.y);
  c.lineTo(m.to[2] - cam.x, m.to[3] - cam.y);
  c.lineTo(m.to[0] - cam.x, m.to[1] - cam.y);
  c.closePath();
}

// ===========================================================================
// WORLD RENDERING
// ===========================================================================
function drawSprite(key, x, y, frame = 0, flip = false) {
  const img = ASSETS.get(key, frame);
  if (!img) return;
  const sx = Math.round(x - cam.x), sy = Math.round(y - cam.y);
  if (flip) {
    ctx.save(); ctx.translate(sx + img.width, sy); ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0); ctx.restore();
  } else ctx.drawImage(img, sx, sy);
}

function renderWorld() {
  const ox = cam.shake > 0 ? (Math.random() - 0.5) * cam.shakeMag * 2 : 0;
  const oy = cam.shake > 0 ? (Math.random() - 0.5) * cam.shakeMag * 2 : 0;
  const cx = cam.x, cy = cam.y;
  cam.x = Math.round(cx + ox); cam.y = Math.round(cy + oy);

  ctx.fillStyle = "#07030f";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.drawImage(mapCanvas, -cam.x, -cam.y);

  const flameFrame = (i, o) => {
    const n = (SPRITES[o && o.sprite] || {}).frames || 2;
    return n > 2 ? Math.floor(S.time * 10 + i) % n : (noise(S.time * 5 + i * 3.1) > 0.5 ? 1 : 0);
  };
  const visible = (o) => !o.hidden && o.px + o.w > cam.x && o.px < cam.x + VIEW_W && o.py + o.h > cam.y && o.py < cam.y + VIEW_H;
  const spriteKey = (o) => (o.id === "cellar_door" && S.flags.cellarOpen) ? "cellar_door_open" : o.sprite;

  // 1) flat floor decor  2) wall-mounted  3) y-sorted floor objects + characters
  objects.forEach((o, i) => { if (o.layer === "floor" && visible(o)) drawSprite(spriteKey(o), o.px, o.py, flameFrame(i, o)); });
  objects.forEach((o, i) => { if (o.mount === "wall" && visible(o)) drawSprite(spriteKey(o), o.px, o.py, flameFrame(i, o)); });

  const list = [];
  objects.forEach((o, i) => {
    if (o.layer === "floor" || o.mount === "wall" || !visible(o)) return;
    const sortY = o.box ? o.box.y + o.box.h : o.py + o.h;
    list.push({ y: sortY, draw: () => drawSprite(spriteKey(o), o.px, o.py, flameFrame(i, o)) });
  });
  npcs.forEach((n) => list.push({ y: n.py + 15, draw: () => drawNpc(n) }));
  list.push({ y: player.y, draw: drawPlayer });
  list.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

  renderLighting();
  cam.x = cx; cam.y = cy;
}

// Draw a sprite scaled up from its feet (bottom-centre at fx, fy).
function drawScaled(key, fx, fy, scale, frame = 0, flip = false, cropRows = 0) {
  const img = ASSETS.get(key, frame);
  if (!img) return;
  const h = cropRows || img.height;
  const w = img.width * scale, dh = h * scale;
  const sx = Math.round(fx - w / 2 - cam.x), sy = Math.round(fy - img.height * scale - cam.y);
  ctx.save();
  if (flip) { ctx.translate(sx + w, sy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, img.width, h, 0, 0, w, dh); }
  else ctx.drawImage(img, 0, 0, img.width, h, sx, sy, w, dh);
  ctx.restore();
}

function drawPlayer() {
  const k = PLAYER_SCALE;
  const frame = player.moving ? 1 + (Math.floor(player.anim * 8) % 2) : 0;
  const bob = player.moving && frame === 1 ? -1 : 0;
  const key = player.dir === "up" ? "player_up" : player.dir === "down" ? "player_down" : "player_side";
  const flip = player.dir === "left";
  // Sitting up in bed: only the top half shows above the blanket.
  drawScaled(key, player.x, player.y + bob, k, frame, flip, S.intro.sitting ? 10 : 0);
  if (S.intro.birdHidden) return;
  if (S.intro.birdFly) {
    // Polly flies one lap around you, then hovers above your head.
    if (S.intro.flyStart == null) S.intro.flyStart = S.time;
    const el = S.time - S.intro.flyStart, lap = (Math.PI * 2) / 2.2;
    const flapY = Math.sin(S.time * 18) > 0 ? -1 : 0;
    if (el < lap) {
      const a = el * 2.2;
      drawScaled("bird", player.x + Math.cos(a) * 20, player.y - 26 + Math.sin(a * 2) * 5 + flapY, k, 0, Math.sin(a) > 0);
    } else drawScaled("bird", player.x, player.y - 16 * k - 10 + Math.sin(S.time * 4) * 1.5 + flapY, k, 0, false);
    return;
  }
  S.intro.flyStart = null;
  // Polly rides on your shoulder.
  const hop = Math.sin(S.time * 3) > 0.92 ? -1 : 0;
  const shoulderY = player.y - 16 * k + 6 + bob + hop;
  const bx = player.dir === "up" ? player.x : flip ? player.x - 6 : player.x + 6;
  drawScaled("bird", bx, shoulderY, k, 0, flip);
}

// First-person view of the bedroom ceiling while waking up: a gothic rib vault
// with an iron chandelier. `lift` 0 = looking straight up, 1 = sat up (gone).
// The wake-up ceiling and Polly's close-up are drawn on their own full-resolution canvas.
const CEIL_SC = 4 * Math.min(2, window.devicePixelRatio || 1);
const ceilCv = document.createElement("canvas");
ceilCv.width = VIEW_W * CEIL_SC; ceilCv.height = VIEW_H * CEIL_SC;
Object.assign(ceilCv.style, { position: "absolute", left: "0", top: "0", width: "960px", height: "576px", pointerEvents: "none", display: "none", zIndex: "5" });
document.getElementById("stage").insertBefore(ceilCv, document.getElementById("view").nextSibling);
const ceilCtx = ceilCv.getContext("2d");
function drawCeiling(lift) {
  if (lift === null) { ceilCv.style.display = "none"; return; }
  ceilCv.style.display = "block";
  const cc = ceilCtx;
  cc.setTransform(CEIL_SC, 0, 0, CEIL_SC, 0, 0);
  cc.clearRect(0, 0, VIEW_W, VIEW_H);
  const W = VIEW_W, H = VIEW_H, t = S.time;
  cc.save();
  cc.globalAlpha = 1 - lift;
  cc.translate(0, -lift * H * 0.8);
  // vault panels
  cc.fillStyle = "#120c18"; cc.fillRect(0, -H, W, H * 3);
  const cx = W / 2, cy = H / 2 - 10;
  const corners = [[-20, -20], [W + 20, -20], [W + 20, H + 20], [-20, H + 20]];
  corners.forEach(([x, y], i) => {
    const [x2, y2] = corners[(i + 1) % 4];
    cc.fillStyle = i % 2 ? "#1a1222" : "#160f1e";
    cc.beginPath(); cc.moveTo(cx, cy); cc.lineTo(x, y); cc.lineTo(x2, y2); cc.closePath(); cc.fill();
    // stone courses across each panel
    cc.strokeStyle = "rgba(0,0,0,0.35)"; cc.lineWidth = 0.6;
    for (let k = 0.2; k < 1; k += 0.12) {
      cc.beginPath();
      cc.moveTo(cx + (x - cx) * k, cy + (y - cy) * k); cc.lineTo(cx + (x2 - cx) * k, cy + (y2 - cy) * k); cc.stroke();
    }
  });
  // carved ribs from the corners and wall midpoints to the central boss
  const ribs = corners.concat([[cx, -20], [W + 20, cy], [cx, H + 20], [-20, cy]]);
  for (const [x, y] of ribs) {
    cc.strokeStyle = "#2c2236"; cc.lineWidth = 6; cc.beginPath(); cc.moveTo(cx, cy); cc.lineTo(x, y); cc.stroke();
    cc.strokeStyle = "#4a3c55"; cc.lineWidth = 1.5; cc.beginPath(); cc.moveTo(cx - 1, cy - 1); cc.lineTo(x - 1, y - 1); cc.stroke();
  }
  cc.fillStyle = "#3a2e45"; cc.beginPath(); cc.arc(cx, cy, 10, 0, Math.PI * 2); cc.fill();
  cc.fillStyle = "#241b2c"; cc.beginPath(); cc.arc(cx, cy, 6, 0, Math.PI * 2); cc.fill();
  // cobwebs in two corners
  cc.strokeStyle = "rgba(200,190,220,0.18)"; cc.lineWidth = 0.5;
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1]]) {
    for (let a = 0; a <= 4; a++) { const ang = (a / 4) * Math.PI / 2; cc.beginPath(); cc.moveTo(x, y); cc.lineTo(x + sx * Math.cos(ang) * 46, y + sy * Math.sin(ang) * 46); cc.stroke(); }
    for (let r = 12; r <= 44; r += 10) { cc.beginPath(); cc.arc(x, y, r, sx > 0 ? 0 : Math.PI / 2, sx > 0 ? Math.PI / 2 : Math.PI); cc.stroke(); }
  }
  // the chandelier, seen from below, swaying slightly
  const sway = Math.sin(t * 0.7) * 3;
  const hx = cx + sway, hy = cy + 6;
  cc.strokeStyle = "#0c080e"; cc.lineWidth = 2; cc.beginPath(); cc.moveTo(cx, cy); cc.lineTo(hx, hy); cc.stroke();
  // outer iron ring with spiky gothic points
  cc.strokeStyle = "#0b0810"; cc.lineWidth = 4;
  cc.beginPath(); cc.ellipse(hx, hy, 74, 74, 0, 0, Math.PI * 2); cc.stroke();
  cc.strokeStyle = "#2a2230"; cc.lineWidth = 1; cc.beginPath(); cc.ellipse(hx - 1, hy - 1, 74, 74, 0, 0, Math.PI * 2); cc.stroke();
  cc.fillStyle = "#0b0810";
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, x = hx + Math.cos(a) * 76, y = hy + Math.sin(a) * 76;
    cc.beginPath(); cc.moveTo(x - Math.sin(a) * 2, y + Math.cos(a) * 2); cc.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); cc.lineTo(x + Math.sin(a) * 2, y - Math.cos(a) * 2); cc.fill();
  }
  // inner ring and curled arms
  cc.strokeStyle = "#0b0810"; cc.lineWidth = 3; cc.beginPath(); cc.arc(hx, hy, 26, 0, Math.PI * 2); cc.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    cc.lineWidth = 2.5; cc.beginPath(); cc.moveTo(hx + Math.cos(a) * 26, hy + Math.sin(a) * 26);
    cc.quadraticCurveTo(hx + Math.cos(a + 0.4) * 52, hy + Math.sin(a + 0.4) * 52, hx + Math.cos(a) * 74, hy + Math.sin(a) * 74); cc.stroke();
    // little curl
    cc.lineWidth = 1.5; cc.beginPath(); cc.arc(hx + Math.cos(a + 0.25) * 44, hy + Math.sin(a + 0.25) * 44, 4, a, a + Math.PI * 1.4); cc.stroke();
  }
  // candles on the ring, with flickering flames and warm glow
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, x = hx + Math.cos(a) * 74, y = hy + Math.sin(a) * 74;
    const f = 0.7 + 0.3 * Math.sin(t * 9 + i * 2.1) * Math.sin(t * 13.3 + i);
    const g = cc.createRadialGradient(x, y, 1, x, y, 30 * f);
    g.addColorStop(0, `rgba(255,154,60,${0.35 * f})`); g.addColorStop(1, "rgba(255,106,0,0)");
    cc.fillStyle = g; cc.beginPath(); cc.arc(x, y, 30, 0, Math.PI * 2); cc.fill();
    cc.fillStyle = "#d9cbb0"; cc.beginPath(); cc.arc(x, y, 3.2, 0, Math.PI * 2); cc.fill();   // candle seen from below
    cc.fillStyle = `rgba(255,${Math.round(170 + 60 * f)},90,1)`; cc.beginPath(); cc.arc(x, y, 1.6 * f + 0.6, 0, Math.PI * 2); cc.fill();
  }
  // warm light pooling on the vault from the candles
  const pool = cc.createRadialGradient(hx, hy, 20, hx, hy, 220);
  pool.addColorStop(0, "rgba(255,140,60,0.10)"); pool.addColorStop(1, "rgba(0,0,0,0.55)");
  cc.fillStyle = pool; cc.fillRect(0, -H, W, H * 3);
  if (S.intro.birdPeek > 0) drawBirdCloseUp(S.intro.birdPeek);
  cc.restore();
}

// Polly, a raven, drawn as faceted low-poly art: black feathers broken into
// shards with cold blue highlights (lit from the upper left), a heavy beak and
// a glossy deep-blue eye. Origin is the centre of the body; facing left.
const RAVEN_SIL = [[-56, -48], [-46, -68], [-16, -84], [16, -74], [30, -50], [74, -16], [102, 22], [138, 46], [128, 54], [96, 52], [42, 74], [-18, 64], [-30, 50], [-46, 22], [-56, -14], [-60, -24]];
const RAVEN_SHARDS = (() => {
  let sd = 21; const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < 170; i++) {
    const cx = -70 + r() * 210, cy = -90 + r() * 170, sz = 10 + r() * 26, a = r() * Math.PI * 2;
    out.push({ cx, cy, pts: [0, 1, 2].map((k) => [cx + Math.cos(a + k * 2.1 + r() * 0.6) * sz, cy + Math.sin(a + k * 2.1 + r() * 0.6) * sz * 0.8]), j: r() });
  }
  out.sort((p, q) => q.cy - p.cy); // draw lower shards first so the top layers overlap like feathers
  return out;
})();
const RAVEN_TONES = ["#07090e", "#0d111b", "#131a28", "#1a2336", "#223049", "#2d4064", "#3d5888"];
// Polly up close: a low-poly, blue-grey bird with a dark face mask, a hooked beak, big pale eyes and a
// swept-back crest. Round head and chest, so she reads as friendly. Faces left; the head sits around (-28,-50).
const POLLY_FACETS = (() => {
  let sd = 77; const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < 230; i++) { const cx = -120 + r() * 290, cy = -130 + r() * 260, a = r() * 6.28, sz = 16 + r() * 22;
    out.push({ cx, cy, j: r(), pts: [0, 1, 2].map((k) => [cx + Math.cos(a + k * 2.1 + r() * 0.5) * sz, cy + Math.sin(a + k * 2.1 + r() * 0.5) * sz]) }); }
  return out;
})();
function drawPollyVector(c, t, opts = {}) {
  c.save();
  c.lineJoin = "round"; c.lineCap = "round";
  const BODY = ["#4f5f7e", "#5b6c8c", "#677999", "#7385a4", "#8091ae", "#8d9db8"];
  const WING = ["#20252f", "#2a303c", "#353d4c", "#424c5f", "#505c72"];
  const MASK = ["#191c23", "#21252e", "#2a2f3a", "#343a47"];
  // fill a shape, then break it into flat facets, lighter towards the upper left
  const facet = (path, tones, bias = 0) => {
    c.save(); path(); c.fillStyle = tones[1]; c.fill(); path(); c.clip();
    for (const sh of POLLY_FACETS) {
      const light = Math.max(0, Math.min(0.999, 0.6 + bias - (sh.cx + 50) / 420 - (sh.cy + 70) / 400 + (sh.j - 0.5) * 0.28));
      c.fillStyle = tones[Math.floor(light * tones.length)];
      c.beginPath(); sh.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
    }
    c.restore();
  };
  // back and folded wing: dark slate, with long feather blades
  facet(() => { c.beginPath(); c.moveTo(-2, -30); c.bezierCurveTo(70, -22, 130, 40, 165, 135); c.lineTo(40, 135); c.bezierCurveTo(30, 80, 8, 30, -14, 6); c.closePath(); }, WING);
  c.strokeStyle = "rgba(10,12,18,0.55)"; c.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(4 + i * 9, -8 + i * 9); c.quadraticCurveTo(70 + i * 6, 30 + i * 10, 120 + i * 6, 130); c.stroke(); }
  // round chest and belly: pale blue-grey
  facet(() => { c.beginPath(); c.moveTo(-34, -26); c.bezierCurveTo(-84, 0, -86, 78, -40, 135); c.lineTo(70, 135); c.bezierCurveTo(66, 70, 44, 10, 6, -30); c.closePath(); }, BODY, 0.1);
  c.fillStyle = "rgba(190,205,225,0.22)";                           // a lighter bib down the front
  c.beginPath(); c.moveTo(-50, 2); c.quadraticCurveTo(-64, 60, -34, 120); c.quadraticCurveTo(-20, 60, -22, 8); c.closePath(); c.fill();
  // the wing's leading edge overlapping the chest
  facet(() => { c.beginPath(); c.moveTo(2, -20); c.bezierCurveTo(40, 0, 70, 60, 86, 135); c.lineTo(48, 135); c.bezierCurveTo(44, 80, 26, 30, 0, 6); c.closePath(); }, WING, 0.12);
  // crest: spiky feathers swept back from the crown
  for (let i = 0; i < 5; i++) {
    const bx = -34 + i * 9, by = -84 + i * 2.5, tx = -4 + i * 13 + Math.sin(t * 1.3 + i) * 1.2, ty = -114 + i * 8;
    c.fillStyle = BODY[1 + (i % 3)]; c.beginPath(); c.moveTo(bx - 7, by + 6); c.lineTo(tx, ty); c.lineTo(bx + 10, by + 10); c.closePath(); c.fill();
    c.fillStyle = WING[2]; c.beginPath(); c.moveTo((bx + tx) / 2 + 2, (by + ty) / 2 + 6); c.lineTo(tx, ty); c.lineTo((bx + tx) / 2 + 8, (by + ty) / 2 + 9); c.closePath(); c.fill();   // dark tips
  }
  // round head
  facet(() => { c.beginPath(); c.ellipse(-26, -50, 43, 40, 0, 0, Math.PI * 2); }, BODY, 0.04);
  // dark mask around the eye and the base of the beak
  facet(() => { c.beginPath(); c.moveTo(-66, -62); c.quadraticCurveTo(-40, -84, -12, -70); c.quadraticCurveTo(6, -50, -6, -28); c.quadraticCurveTo(-30, -12, -58, -20); c.quadraticCurveTo(-70, -36, -66, -62); c.closePath(); }, MASK, 0.1);
  // hooked beak: upper mandible curving down over a small lower one
  c.fillStyle = "#23262d"; c.beginPath(); c.moveTo(-58, -30); c.quadraticCurveTo(-76, -27, -86, -17); c.lineTo(-62, -16); c.closePath(); c.fill();
  c.fillStyle = "#3c4049"; c.beginPath(); c.moveTo(-56, -60); c.quadraticCurveTo(-94, -62, -102, -34); c.quadraticCurveTo(-103, -18, -93, -10); c.quadraticCurveTo(-88, -28, -58, -30); c.closePath(); c.fill();
  c.fillStyle = "#4b505b"; c.beginPath(); c.moveTo(-58, -58); c.quadraticCurveTo(-88, -58, -97, -38); c.quadraticCurveTo(-80, -48, -60, -46); c.closePath(); c.fill();   // top facet
  c.strokeStyle = "rgba(210,222,240,0.45)"; c.lineWidth = 2; c.beginPath(); c.moveTo(-62, -56); c.quadraticCurveTo(-84, -56, -94, -42); c.stroke();
  c.fillStyle = "#15171c"; c.beginPath(); c.ellipse(-66, -44, 2.6, 1.8, -0.3, 0, Math.PI * 2); c.fill();   // nostril
  // big round eye: pale blue-grey iris, wide dark pupil, two glints
  const blink = (t % 4.2) > 4.06 ? 0.1 : 1, ex = -36, ey = -50;
  c.fillStyle = "#0b0d12"; c.beginPath(); c.ellipse(ex, ey, 15.5, 15.5 * blink, 0, 0, Math.PI * 2); c.fill();
  if (blink > 0.5) {
    const ig = c.createRadialGradient(ex - 3, ey - 4, 2, ex, ey, 13);
    ig.addColorStop(0, "#dbe7f2"); ig.addColorStop(0.55, "#a3b8cc"); ig.addColorStop(1, "#5f7690");
    c.fillStyle = ig; c.beginPath(); c.arc(ex, ey, 12.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#07080c"; c.beginPath(); c.arc(ex, ey, 7.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(ex - 4, ey - 5, 3.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255,255,255,0.65)"; c.beginPath(); c.arc(ex + 4, ey + 4, 1.4, 0, Math.PI * 2); c.fill();
  }
  // a cool rim of light over the crown and down the back
  c.strokeStyle = "rgba(170,200,255,0.3)"; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-58, -78); c.quadraticCurveTo(-26, -96, 6, -78); c.quadraticCurveTo(22, -56, 14, -34); c.stroke();
  c.restore();
}

// Polly leaning into view from the lower right during the wake-up.
function drawBirdCloseUp(k) {
  const cc = ceilCtx, t = S.time;
  const e = 1 - Math.pow(1 - k, 3);
  cc.save();
  cc.translate(VIEW_W + 70 - e * 200, VIEW_H + 40 - e * 150 + Math.sin(t * 1.4) * 1.5);
  cc.rotate(-0.12 + Math.sin(t * 0.9) * 0.02);
  cc.scale(1.25, 1.25);
  // warm candle light on Polly
  drawPollyVector(cc, t, { noLegs: true });
  const warm = cc.createRadialGradient(-40, -60, 5, -20, -30, 110);
  warm.addColorStop(0, "rgba(255,170,90,0.14)"); warm.addColorStop(1, "rgba(255,170,90,0)");
  cc.save(); cc.globalCompositeOperation = "source-atop"; cc.fillStyle = warm; cc.fillRect(-160, -160, 320, 320); cc.restore();
  cc.restore();
}

// ---------------------------------------------------------------------------
// Door cutscene: a sketchy hand-drawn door; the handle turns, the door swings
// open onto light, then we push through. Drawn in the same scribbly style as
// the eye-blink. GAME.doorCutscene(onMiddle) plays it and calls onMiddle while
// the screen is covered (that's when the room swaps).
// ---------------------------------------------------------------------------
const DOOR = { on: false, cover: 0, handle: 0, open: 0, push: 0, showDoor: true };
function sketchLine(x1, y1, x2, y2, passes, seedBase) {
  const seedT = Math.floor(S.time * 10);
  const rnd = (i) => { const v = Math.sin((seedT + seedBase) * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };
  for (let p = 0; p < passes; p++) {
    ctx.beginPath();
    ctx.moveTo(x1 + (rnd(p * 4) - 0.5) * 2, y1 + (rnd(p * 4 + 1) - 0.5) * 2);
    const mx = (x1 + x2) / 2 + (rnd(p * 4 + 2) - 0.5) * 2.5, my = (y1 + y2) / 2 + (rnd(p * 4 + 3) - 0.5) * 2.5;
    ctx.quadraticCurveTo(mx, my, x2 + (rnd(p * 4 + 5) - 0.5) * 2, y2 + (rnd(p * 4 + 6) - 0.5) * 2);
    ctx.stroke();
  }
}
function drawDoorCutscene() {
  if (!DOOR.on) return;
  const W = VIEW_W, H = VIEW_H;
  ctx.save();
  ctx.globalAlpha = DOOR.cover;
  ctx.fillStyle = "#020905"; ctx.fillRect(0, 0, W, H);
  if (!DOOR.showDoor) { ctx.restore(); return; } // fading back in: just the dark cover
  // zoom in as we push through the doorway
  const z = 1 + DOOR.push * 2.6;
  ctx.translate(W / 2, H / 2 + 20); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2 - 20);
  const x0 = 188, x1 = 292, top = 70, bot = 262, archY = 122, r = (x1 - x0) / 2, cx = (x0 + x1) / 2;
  // light spilling from behind the door as it opens
  if (DOOR.open > 0) {
    const g = ctx.createRadialGradient(cx, 170, 10, cx, 170, 140);
    g.addColorStop(0, `rgba(160,255,190,${0.75 * DOOR.open})`); g.addColorStop(1, "rgba(60,170,100,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x0, archY); ctx.arc(cx, archY, r, Math.PI, 0); ctx.lineTo(x1, bot); ctx.closePath(); ctx.fill();
  }
  // stone frame
  ctx.strokeStyle = "rgba(233,220,255,0.75)"; ctx.lineWidth = 1.2;
  sketchLine(x0 - 10, bot, x0 - 10, archY, 2, 1); sketchLine(x1 + 10, bot, x1 + 10, archY, 2, 2);
  ctx.beginPath(); ctx.arc(cx, archY, r + 10, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, archY, r + 10 + Math.sin(S.time * 30) * 0.6, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
  sketchLine(x0 - 30, bot, x1 + 30, bot, 2, 3);
  // the door leaf, hinged on the left: narrows and tilts as it swings towards us
  const swing = DOOR.open * Math.PI * 0.46;
  const wv = (x1 - x0) * Math.cos(swing), lift = Math.sin(swing) * 16;
  const ex = x0 + wv;
  ctx.fillStyle = "#24160f";
  ctx.beginPath();
  ctx.moveTo(x0, bot); ctx.lineTo(x0, archY);
  ctx.quadraticCurveTo(x0, top - lift * 0.4, (x0 + ex) / 2, top - lift * 0.6);
  ctx.quadraticCurveTo(ex, top - lift, ex, archY - lift);
  ctx.lineTo(ex, bot + lift); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(233,220,255,0.8)";
  sketchLine(x0, bot, x0, archY, 2, 4); sketchLine(ex, archY - lift, ex, bot + lift, 2, 5); sketchLine(x0, bot, ex, bot + lift, 1, 6);
  // planks and iron bands
  ctx.strokeStyle = "rgba(233,220,255,0.35)"; ctx.lineWidth = 0.8;
  for (let i = 1; i < 5; i++) { const px = x0 + (wv * i) / 5; sketchLine(px, archY - lift * (i / 5) - 30, px, bot + lift * (i / 5), 1, 10 + i); }
  ctx.strokeStyle = "rgba(160,150,180,0.7)"; ctx.lineWidth = 2;
  for (const by of [150, 230]) sketchLine(x0 + 2, by, ex - 2, by + lift * ((by - 150) / 112) - lift * 0.2, 2, by);
  // the handle: an iron ring on a lever that turns before the door opens
  if (wv > 18) {
    const hx = x0 + wv * 0.82, hy = 186 + lift * 0.4;
    ctx.strokeStyle = "rgba(233,220,255,0.9)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.stroke();                 // rose
    const ang = -DOOR.handle * 1.1;
    const lx = hx - Math.cos(ang) * 16 * Math.cos(swing), ly = hy - Math.sin(ang) * 16;
    ctx.lineWidth = 2.5; sketchLine(hx, hy, lx, ly, 2, 30);                             // lever
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx, hy + 12 - DOOR.handle * 3, 6, 0, Math.PI * 2); ctx.stroke(); // knocker ring
  }
  ctx.restore();
}
function animate(obj, key, to, ms) {
  const from = obj[key], t0 = performance.now();
  return new Promise((res) => (function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    obj[key] = from + (to - from) * (k * k * (3 - 2 * k));
    k < 1 ? requestAnimationFrame(step) : res();
  })(t0));
}
async function doorCutscene(onMiddle) {
  if (typeof DOORFX !== "undefined") return DOORFX.play(onMiddle); // the full-resolution version
  Object.assign(DOOR, { on: true, cover: 0, handle: 0, open: 0, push: 0, showDoor: true });
  await animate(DOOR, "cover", 1, 220);
  await new Promise((r) => setTimeout(r, 150));
  await animate(DOOR, "handle", 1, 420);           // the handle turns
  await new Promise((r) => setTimeout(r, 120));
  await animate(DOOR, "open", 1, 650);             // and the door swings open
  await animate(DOOR, "push", 1, 380);             // push through the doorway
  if (onMiddle) onMiddle();
  DOOR.showDoor = false;
  await animate(DOOR, "cover", 0, 360);
  DOOR.on = false;
}

// The eye-blink overlay lives on its own full-resolution canvas (crisp edges).
const EYE_SC = 4 * Math.min(2, window.devicePixelRatio || 1); // 480x288 logical -> high res
const eyeCv = document.createElement("canvas");
eyeCv.width = VIEW_W * EYE_SC; eyeCv.height = VIEW_H * EYE_SC;
Object.assign(eyeCv.style, { position: "absolute", left: "0", top: "0", width: "960px", height: "576px", pointerEvents: "none", display: "none", zIndex: "6" }); // above the ceiling
document.getElementById("stage").insertBefore(eyeCv, document.getElementById("view").nextSibling);
const eyeCtx = eyeCv.getContext("2d");
function drawEyes(open) {
  if (open === null) { eyeCv.style.display = "none"; return; }
  eyeCv.style.display = "block";
  const c = eyeCtx;
  // open: 0..1 the eyelids open; 1..2 the eyes widen softly and the darkness fades away
  const widen = Math.max(0, open - 1), lid = Math.min(1, open);
  c.setTransform(EYE_SC, 0, 0, EYE_SC, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, VIEW_W, VIEW_H);
  c.globalAlpha = 1 - widen;
  c.fillStyle = "#000"; c.fillRect(0, 0, VIEW_W, VIEW_H);
  c.globalAlpha = 1;
  if (lid > 0.01) {
    c.globalCompositeOperation = "destination-out";
    const grow = 1 + widen * 3.5;
    for (const ex of [VIEW_W / 2 - 62, VIEW_W / 2 + 62]) {
      c.save();
      c.translate(ex + (ex < VIEW_W / 2 ? -1 : 1) * widen * 40, VIEW_H / 2);
      c.scale(54 * grow, Math.max(0.5, 40 * lid * grow));
      const g = c.createRadialGradient(0, 0, 0.82, 0, 0, 1);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }
  c.globalCompositeOperation = "source-over";
  if (open > 1.25) return;
  // fine scribbled outlines and lashes, redrawn ~10x a second
  c.globalAlpha = Math.max(0, 1 - widen * 4);
  const seed = Math.floor(S.time * 10);
  const rnd = (i) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
  c.strokeStyle = "rgba(233,220,255,0.6)"; c.lineWidth = 0.35; c.lineCap = "round";
  for (let e = 0; e < 2; e++) {
    const ex = VIEW_W / 2 + (e ? 62 : -62), ey = VIEW_H / 2;
    const ry = Math.max(1.2, 40 * lid);
    for (let pass = 0; pass < 4; pass++) {
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const j = (rnd(e * 300 + pass * 70 + i) - 0.5) * 1.6;
        const x = ex + Math.cos(a) * (54 + j), y = ey + Math.sin(a) * (ry + j * 0.5);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    for (let i = 0; i < 9; i++) { // lashes along the top lid
      const a = Math.PI + 0.3 + (i / 8) * (Math.PI - 0.6);
      const x = ex + Math.cos(a) * 54, y = ey + Math.sin(a) * ry;
      const len = 5 + rnd(e * 99 + i) * 4;
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a) * len * 0.3, y - len * 0.6, x + Math.cos(a) * len * 0.7 + (rnd(i + 7) - 0.5) * 1.5, y - len);
      c.stroke();
    }
  }
  c.globalAlpha = 1;
}


// ===========================================================================
// TITLE SCREEN (canvas backdrop; text is in the #title DOM overlay)
// ===========================================================================
function renderTitle() {
  const t = S.time;
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, "#0d0620"); g.addColorStop(1, "#2b1a45");
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // stars
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % VIEW_W, y = (i * 53) % 120;
    ctx.fillStyle = noise(t * 2 + i) > 0.6 ? PAL.pale : PAL.trim;
    ctx.fillRect(x, y, 1, 1);
  }
  // moon
  ctx.fillStyle = "#e8e0ff"; ctx.beginPath(); ctx.arc(395, 54, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0d0620"; ctx.beginPath(); ctx.arc(386, 48, 20, 0, Math.PI * 2); ctx.fill();
  // hill + house silhouette
  ctx.fillStyle = PAL.moss; ctx.beginPath(); ctx.ellipse(240, 300, 320, 70, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.wall;
  ctx.fillRect(170, 190, 140, 70);
  ctx.beginPath(); ctx.moveTo(160, 192); ctx.lineTo(240, 150); ctx.lineTo(320, 192); ctx.fill();
  ctx.fillRect(280, 158, 12, 26);
  // windows with candlelight
  [[188, 200], [222, 200], [258, 200], [188, 226], [258, 226]].forEach(([x, y], i) => {
    const f = noise(t * 5 + i * 7);
    ctx.fillStyle = f > 0.25 ? PAL.lantern : PAL.candle;
    ctx.fillRect(x, y, 10, 12);
    ctx.fillStyle = `rgba(255,154,60,${0.12 + f * 0.1})`;
    ctx.fillRect(x - 4, y - 4, 18, 20);
  });
  ctx.fillStyle = "#3a2458"; ctx.fillRect(226, 232, 14, 28); // door
  // a green ghost drifting by
  const gx = 110 + Math.sin(t * 0.4) * 30, gy = 222 + Math.sin(t * 1.3) * 4;
  ctx.globalAlpha = 0.5 + noise(t * 3) * 0.3;
  ctx.drawImage(ASSETS.get("rogue"), Math.round(gx), Math.round(gy));
  ctx.globalAlpha = 1;
  // the bird on the roof
  ctx.drawImage(ASSETS.get("bird"), 236, 144 + (Math.sin(t * 3) > 0.9 ? -1 : 0));
}

// ===========================================================================
// UI PRIMITIVES
// ===========================================================================
const UI = {
  cur: null,  // the active UI element, or null
  queue: [],

  // say(lines, onDone): lines are strings (bird speaks) or {who, text}.
  say(lines, onDone) {
    lines = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === "string" ? { who: "bird", text: l } : l));
    this.open({ type: "dialogue", lines, i: 0, shown: 0, onDone });
  },
  // choose(prompt, options, onBack): options are {label, hint?, fn}
  choose(prompt, options, onBack, who = "bird") {
    this.open({ type: "choice", prompt, options, sel: 0, onBack, who });
  },
  // askLetter(prompt, onLetter(ch), onBack)
  askLetter(prompt, onLetter, onBack, who = "bird") {
    this.open({ type: "letter", prompt, onLetter, onBack, who });
  },
  // panel(title, html, onClose): big scrollable box
  panel(title, html, onClose) {
    this.open({ type: "panel", title, html, onClose });
  },
  open(el) {
    if (this.cur) this.closeDom();
    this.cur = el;
    this.render();
  },
  close() {
    const el = this.cur;
    this.closeDom();
    this.cur = null;
    return el;
  },
  closeDom() {
    $("dialogue").classList.add("hidden");
    $("panel").classList.add("hidden");
  },

  // --- actions (shared by keys and the debug API) ---
  advance() {
    const el = this.cur;
    if (!el) return false;
    if (el.type === "dialogue") {
      const line = el.lines[el.i];
      if (el.shown < line.text.length) { el.shown = line.text.length; this.render(); return true; }
      el.i++; el.shown = 0;
      if (el.i >= el.lines.length) { this.close(); el.onDone && el.onDone(); }
      else this.render();
      return true;
    }
    if (el.type === "choice") return this.pick(el.sel);
    if (el.type === "panel") { this.close(); el.onClose && el.onClose(); return true; }
    return false;
  },
  pick(i) {
    const el = this.cur;
    if (!el || el.type !== "choice" || i < 0 || i >= el.options.length) return false;
    this.close();
    const o = el.options[i];
    o.fn && o.fn();
    return true;
  },
  back() {
    const el = this.cur;
    if (!el) return false;
    if (el.type === "choice" || el.type === "letter") { this.close(); el.onBack && el.onBack(); return true; }
    if (el.type === "panel") { this.close(); el.onClose && el.onClose(); return true; }
    if (el.type === "dialogue") return this.advance();
    return false;
  },
  letter(ch) {
    const el = this.cur;
    if (!el || el.type !== "letter" || !/^[a-z]$/i.test(ch)) return false;
    this.close();
    el.onLetter(ch.toUpperCase());
    return true;
  },

  handleKey(k) {
    const el = this.cur;
    if (!el) return;
    if (el.type === "dialogue") { if (isOk(k) || isBack(k)) this.advance(); }
    else if (el.type === "choice") {
      if (k === "arrowup" || k === "w") { el.sel = (el.sel + el.options.length - 1) % el.options.length; this.render(); }
      else if (k === "arrowdown" || k === "s") { el.sel = (el.sel + 1) % el.options.length; this.render(); }
      else if (isOk(k)) this.pick(el.sel);
      else if (isBack(k)) this.back();
      else if (/^[1-9]$/.test(k) && +k <= el.options.length) this.pick(+k - 1);
    } else if (el.type === "letter") {
      if (k === "escape") this.back();
      else if (/^[a-z]$/.test(k)) this.letter(k);
    } else if (el.type === "panel") {
      const body = $("panel-body");
      if (k === "arrowdown" || k === "s") body.scrollTop += 40;
      else if (k === "arrowup" || k === "w") body.scrollTop -= 40;
      else if (isOk(k) || isBack(k)) this.back();
    }
  },

  // Typewriter tick.
  update(dt) {
    const el = this.cur;
    if (el && el.type === "dialogue") {
      const line = el.lines[el.i];
      if (el.shown < line.text.length) {
        el.acc = (el.acc || 0) + dt * 48;
        const n = Math.floor(el.acc);
        if (n > 0) { el.acc -= n; el.shown = Math.min(line.text.length, el.shown + n); this.renderText(); }
      }
    }
  },

  render() {
    const el = this.cur;
    if (!el) return;
    if (el.type === "panel") {
      $("panel").classList.remove("hidden");
      $("panel-title").textContent = el.title;
      $("panel-body").innerHTML = el.html;
      $("panel-body").scrollTop = 0;
      return;
    }
    $("dialogue").classList.remove("hidden");
    const who = el.type === "dialogue" ? el.lines[el.i].who : el.who;
    const sp = CONTENT.speakers[who] || CONTENT.speakers.bird;
    $("dlg-name").textContent = sp.name;
    drawPortrait(sp.portrait);
    const opts = $("dlg-options");
    opts.innerHTML = "";
    if (el.type === "choice") {
      el.options.forEach((o, i) => {
        const d = document.createElement("div");
        d.className = "opt" + (i === el.sel ? " sel" : "");
        // labels may contain `code` spans, shown as tool "chips" so they read as code, not English
        d.textContent = i === el.sel ? "> " : "  ";
        String(o.label).split(/(`[^`]+`)/).forEach((part) => {
          if (/^`.+`$/.test(part)) { const c = document.createElement("code"); c.className = "tool"; c.textContent = part.slice(1, -1); d.appendChild(c); }
          else if (part) d.appendChild(document.createTextNode(part));
        });
        if (o.hint) { const h = document.createElement("span"); h.className = "hint"; h.textContent = o.hint; d.appendChild(h); }
        opts.appendChild(d);
      });
    }
    $("dlg-more").classList.toggle("hidden", el.type !== "dialogue");
    this.renderText();
  },
  renderText() {
    const el = this.cur;
    if (!el) return;
    let text;
    if (el.type === "dialogue") text = el.lines[el.i].text.slice(0, el.shown);
    else if (el.type === "letter") text = el.prompt + "\n(type a letter)";
    else text = el.prompt || "";
    $("dlg-text").textContent = GAME.blurText ? GAME.blurText(text) : text;
  },

  // Snapshot for GAME.state()
  snapshot() {
    const el = this.cur;
    if (!el) return null;
    if (el.type === "dialogue") return { type: "dialogue", text: el.lines[el.i].text, who: el.lines[el.i].who, title: null, options: null };
    if (el.type === "choice") return { type: "choice", text: el.prompt, title: null, options: el.options.map((o) => o.label) };
    if (el.type === "letter") return { type: "letter", text: el.prompt, title: null, options: null };
    if (el.type === "panel") return { type: "panel", text: $("panel-body").textContent, title: el.title, options: null };
    return null;
  },
};

function drawPortrait(key) {
  const pc = $("portrait");
  if (pc.width !== 144) { pc.width = 144; pc.height = 144; }
  const p = pc.getContext("2d");
  p.setTransform(1, 0, 0, 1, 0, 0);
  p.clearRect(0, 0, 144, 144);
  if (!key) { pc.style.visibility = "hidden"; return; }
  pc.style.visibility = "visible";
  if (key === "bird") {           // smooth Polly portrait
    p.save(); p.translate(86, 78); p.scale(0.82, 0.82); drawPollyVector(p, S.time, { noLegs: true }); p.restore();
    return;
  }
  p.imageSmoothingEnabled = false;
  const img = ASSETS.get(key);
  const s = Math.max(1, Math.floor(Math.min(132 / img.width, 132 / img.height)));
  p.drawImage(img, Math.floor((144 - img.width * s) / 2), Math.floor((144 - img.height * s) / 2), img.width * s, img.height * s);
}

// ---------------------------------------------------------------------------
// Info card next to the nearest interactable
// ---------------------------------------------------------------------------
let nearObj = null;
function findNearby() {
  const px = player.x, py = player.y - 5;
  let best = null, bestD = 14;
  for (const o of objects) {
    if (!o.card || o.hidden) continue;
    const z = o.zone;
    const dx = Math.max(z.x - px, 0, px - (z.x + z.w));
    const dy = Math.max(z.y - py, 0, py - (z.y + z.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
function updateCard() {
  const card = $("card");
  // wait a beat after any dialogue/menu closes, so the label doesn't flash between back-to-back lines
  if (UI.cur || S.lock) updateCard.quietUntil = performance.now() + 250;
  const show = S.mode === "play" && !UI.cur && !S.lock && nearObj && performance.now() > (updateCard.quietUntil || 0);
  if (!show) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  $("card-title").textContent = nearObj.card.title;
  $("card-line").textContent = nearObj.card.line;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const z = nearObj.zone;
  if (window.WORLD3D && WORLD3D.ready) {
    // 3D: float the card above the object's projected position
    const p = WORLD3D.project(z.x + z.w / 2, nearObj.mount === "wall" ? nearObj.y * TILE + TILE : z.y + z.h / 2, nearObj.mount === "wall" ? 2.3 : 1.4);
    card.style.left = Math.max(8, Math.min(960 - cw - 8, p.x - cw / 2)) + "px";
    card.style.top = Math.max(44, Math.min(576 - 48 - ch, p.y - ch - 10)) + "px";
    return;
  }
  // Prefer above the object; if there's no room under the HUD, go beside it
  // (on the side away from the player).
  let left = (z.x + z.w / 2 - cam.x) * SCALE - cw / 2;
  let top = (z.y - cam.y) * SCALE - ch - 8;
  if (top < 44) {
    top = (z.y + z.h / 2 - cam.y) * SCALE - ch / 2;
    const rightSide = (z.x + z.w - cam.x) * SCALE + 10;
    const leftSide = (z.x - cam.x) * SCALE - cw - 10;
    const playerRight = player.x > z.x + z.w / 2;
    left = playerRight ? leftSide : rightSide;
    if (left < 8) left = rightSide;
    if (left + cw > 952) left = leftSide;
  }
  left = Math.max(8, Math.min(960 - cw - 8, left));
  top = Math.max(44, Math.min(576 - 48 - ch, top));
  card.style.left = left + "px";
  card.style.top = top + "px";
}

// ---------------------------------------------------------------------------
// Tool-call ticker: GAME.toolCall("read_file", '"/bedroom/x.png"')
// ---------------------------------------------------------------------------
function toolCall(name, args = "") {
  const text = `> ${name}(${args})`;
  S.toolLog.push({ thread: S.thread, text });
  const d = document.createElement("div");
  d.className = "tick";
  d.textContent = text;
  const tk = $("ticker");
  tk.appendChild(d);
  while (tk.children.length > 6) tk.firstChild.remove();
  // calls stack up underneath each other; the whole block fades together, 7s after the latest one
  clearTimeout(toolCall.fadeT); clearTimeout(toolCall.clearT);
  tk.style.transition = "none"; tk.style.opacity = "1";
  toolCall.fadeT = setTimeout(() => { tk.style.transition = "opacity 1.2s"; tk.style.opacity = "0"; }, 7000);
  toolCall.clearT = setTimeout(() => { tk.innerHTML = ""; tk.style.opacity = "1"; }, 8200);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function lettersString() {
  const pw = CONTENT.password;
  let s = "";
  for (let i = 0; i < pw.length; i++) {
    if (i === 2 || i === 7) s += "-";
    s += S.slots[i] ? pw[i] : "_";
  }
  return s;
}
function updateHud() {
  const pct = Math.round(S.ctx);
  $("ctx-fill").style.width = pct + "%";
  $("ctx-fill").style.background = pct < 45 ? PAL.glow : pct <= 70 ? PAL.ember : "#ff5a2a";
  $("ctx-pct").textContent = pct + "%";
  $("hud-thread").textContent = "thread " + S.thread;
  const pw = CONTENT.password;
  let html = "";
  for (let i = 0; i < pw.length; i++) {
    if (i === 2 || i === 7) html += "<span>-</span> ";
    const src = S.slots[i];
    const fresh = S.freshSlots && S.freshSlots.includes(i) ? " fresh" : "";
    html += src ? `<span class="${src}${fresh}">${pw[i]}</span> ` : "<span>_</span> ";
  }
  $("hud-letters").innerHTML = html;
  const belt = $("belt");
  belt.innerHTML = "";
  belt.style.display = S.belt.length ? "" : "none";   // the tool belt only appears once you're carrying something
  for (let i = 0; i < S.belt.length; i++) {   // only show slots that hold something
    const id = S.belt[i];
    const d = document.createElement("div");
    d.className = "slot" + (id ? " full" : "") + (id && S.beltOn[id] ? " on" : "");
    d.innerHTML = `<span class="num">${i + 1}</span> ${id ? CONTENT.items[id].name : "&middot;"}`;
    belt.appendChild(d);
  }
}

// ---------------------------------------------------------------------------
// Fades
// ---------------------------------------------------------------------------
function fade(to, ms, cb) {
  const f = $("fade");
  f.style.transition = `opacity ${ms}ms`;
  f.style.opacity = String(to);
  if (cb) setTimeout(cb, ms);
}

// ===========================================================================
// INTERACTION (placeholder behaviour for milestone 1)
// ===========================================================================
function interact(o) {
  if (o.sprite === "jar_table" && typeof SFX !== "undefined") SFX.clip("glass", { vol: 0.8 });
  if ((o.id === "land_mirror" || o.id === "riddle_t") && typeof SFX !== "undefined") SFX.mirror();   // the cracked mirror on the landing   // something stirs in the specimen jar
  if (GAME.onInteract && GAME.onInteract(o.id)) return; // story code can take over
  UI.say(o.look || ["Nothing special."]);
}

// the wheel scrolls an open panel wherever the pointer is, even if the panel itself can't take pointer events
addEventListener("wheel", (e) => { const b = $("panel-body"); if (!b || !b.offsetParent) return; if (!(e.target instanceof Node && b.contains(e.target))) b.scrollTop += e.deltaY; }, { passive: true });

function openHood() {
  const cards = S.cardsUnlocked.map((id) => CONTENT.cards[id]).filter(Boolean);
  let html;
  if (!cards.length) html = "Nothing here yet.\n\nEach time Polly uses a new Deep Agents feature, a short explainer (with real code) is saved here. Press C any time to reread them.";
  else html = cards.map((c) => `<b>${c.title}</b>\n${typeof c.body === "function" ? c.body() : c.body}${c.code ? `<pre>${c.code}</pre>` : ""}${c.note ? `<span class="code-note">(${c.note})</span>` : ""}`).join("\n\n");
  UI.panel("Under the hood: Deep Agents explained", html);
}

function useBelt(i) {
  const id = S.belt[i];
  if (!id) return;
  if (GAME.onUseItem && GAME.onUseItem(id)) return;
  UI.say([`The ${CONTENT.items[id].name}. Not much to do with it here.`]);
}

// ===========================================================================
// MAIN LOOP
// ===========================================================================
function startGame() {
  if (S.mode !== "title") return;
  S.mode = "cutscene";
  fade(1, 500, () => {
    const go = () => {
      $("title").classList.add("hidden");
      $("hud-top").classList.remove("hidden");
      $("hud-bottom").classList.remove("hidden");
      placePlayer(CONTENT.map.start.x, CONTENT.map.start.y);
      S.mode = "play";
      updateHud();
      fade(0, 700);
      if (GAME.onStart) GAME.onStart();
    };
    // hold on black until the 3D manor has loaded, so the wake-up scene never plays over a loading screen
    (function wait() {
      if (world3dReady()) go();
      else if (window.WORLD3D_FAILED) { $("title").classList.add("hidden"); fade(0, 300); }   // stays on the "couldn't load" message
      else setTimeout(wait, 100);
    })();
  });
}

function handleInput() {
  while (pressed.length) {
    const k = pressed.shift();
    if (S.mode === "title") { if (isOk(k)) TITLE.advance(); continue; }
    if (S.mode !== "play") continue;
    if (UI.cur) { UI.handleKey(k); continue; }
    if (S.lock) continue;
    if (isOk(k) && nearObj) interact(nearObj);
    else if (k === "c") openHood();
    else if (k === "h" && GAME.onHelp) GAME.onHelp();
    else if (/^[1-4]$/.test(k)) useBelt(+k - 1);
  }
}

function updatePlay(dt) {
  let mx = 0, my = 0;
  if (!UI.cur && !S.lock) {
    if (held.has("left")) mx -= 1;
    if (held.has("right")) mx += 1;
    if (held.has("up")) my -= 1;
    if (held.has("down")) my += 1;
  }
  player.moving = !!(mx || my);
  if (player.moving) {
    const len = Math.hypot(mx, my);
    const step = (SPEED * dt) / len;
    if (mx) moveAxis(mx * step, 0);
    if (my) moveAxis(0, my * step);
    if (mx && !my) player.dir = mx < 0 ? "left" : "right";
    else if (my) player.dir = my < 0 ? "up" : "down";
    player.anim += dt;
    updateArea(false);
  }
  nearObj = S.lock ? null : findNearby();

  // House-wide flicker every 20-40s
  if (S.time > flicker.next) {
    flicker.until = S.time + 0.15;
    flicker.next = S.time + 20 + Math.random() * 20;
  }
}

// Shown while the 3D engine is still downloading, or if it failed to load.
function drawLoading() {
  ctx.fillStyle = "#06030c"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center"; ctx.font = "10px monospace";
  if (window.WORLD3D_FAILED) {
    ctx.fillStyle = "#ff9a3c"; ctx.fillText("The manor couldn't load its 3D engine.", VIEW_W / 2, VIEW_H / 2 - 8);
    ctx.fillStyle = "#9b6dff"; ctx.fillText("Check your internet connection, then reload the page.", VIEW_W / 2, VIEW_H / 2 + 8);
  } else {
    ctx.fillStyle = "#7bd389"; ctx.fillText("Lighting the candles" + ".".repeat(1 + Math.floor(S.time * 2) % 3), VIEW_W / 2, VIEW_H / 2);
  }
  ctx.textAlign = "left";
}
const world3dReady = () => !!(window.WORLD3D && WORLD3D.ready);
let frameErrors = 0;
function frame(now) {
  try { frameBody(now); }
  catch (e) { if (frameErrors++ < 3) console.error(e); }   // one bad frame must never freeze the whole game
  requestAnimationFrame(frame);
}
let last = performance.now();
function frameBody(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  S.time += dt;
  handleInput();
  UI.update(dt);
  if (S.mode === "title") TITLE.render(ctx, S.time, dt);
  else {
    if (S.mode === "play") updatePlay(dt);
    updateCamera(dt);
    if (window.WORLD3D && WORLD3D.ready) { ctx.clearRect(0, 0, VIEW_W, VIEW_H); WORLD3D.render(dt); }
    else drawLoading();                 // the 3D manor is still loading (or couldn't load): never fall back to the old 2D renderer
    drawCeiling(S.intro.ceiling);
    drawEyes(S.intro.eyes);
    drawDoorCutscene();
  }
  updateCard();
}

// ===========================================================================
// DEBUG API
// ===========================================================================
const GAME = {
  // Hooks story code (later milestones) can set:
  onStart: null, onInteract: null, onEnterArea: null, onUseItem: null, blurText: null,

  state() {
    const room = MAP.rooms[S.area];
    return {
      area: room ? room.id : null,
      path: room ? room.path : null,
      x: Math.floor(player.x / TILE), y: Math.floor((player.y - 1) / TILE),
      px: Math.round(player.x), py: Math.round(player.y),
      mode: S.mode,
      busy: !!UI.cur || S.mode !== "play",
      ui: UI.snapshot(),
      near: nearObj ? nearObj.id : null,
      ctx: Math.round(S.ctx),
      thread: S.thread,
      letters: lettersString(),
      flags: { ...S.flags },
      belt: S.belt.slice(),
      cam: { x: Math.round(cam.x), y: Math.round(cam.y) },
    };
  },
  start() { startGame(); return true; },
  // Start immediately, no fade (for tests).
  startNow() {
    if (S.mode !== "title") return false;
    $("hud-ctx").classList.remove("hidden");
    $("title").classList.add("hidden");
    $("hud-top").classList.remove("hidden");
    $("hud-bottom").classList.remove("hidden");
    placePlayer(CONTENT.map.start.x, CONTENT.map.start.y);
    S.mode = "play"; updateHud(); fade(0, 1);
    return true;
  },
  closeUI() { UI.close(); },
  teleport(tx, ty) { placePlayer(tx, ty); nearObj = findNearby(); return GAME.state(); },
  choose(i) { return UI.pick(i); },
  advance() { return UI.advance(); },
  back() { return UI.back(); },
  typeLetter(ch) { return UI.letter(ch); },
  interact(id) { const o = id ? objById[id] : nearObj; if (!o) return false; interact(o); return true; },

  // Jump to the start of beat n (1-11) with earlier progress filled in.
  skipTo(n) {
    if (S.mode === "title") GAME.startNow();
    UI.close();
    S.flags = {}; S.belt = []; S.beltOn = {}; S.slots = Array(11).fill(null);
    S.thread = 1; S.ctx = 0;
    for (let b = 1; b < n; b++) {
      const beat = CONTENT.beats[b];
      (beat.clues || []).forEach((c) => GAME.setClue(c, "store"));
      (beat.items || []).forEach((it) => GAME.addItem(it));
      if (beat.newThread) S.thread++;
      S.flags["beat" + b + "Done"] = true;
    }
    if (n > 9) S.flags.cellarOpen = true;
    S.flags.beat = n;
    const at = CONTENT.beats[n].at;
    placePlayer(at.x, at.y);
    updateHud();
    return GAME.state();
  },

  // Helpers later milestones use:
  setClue(clue, where = "store") {
    const idx = CONTENT.clueSlots[clue] || [];
    idx.forEach((i) => (S.slots[i] = where));
    S.freshSlots = idx.slice(); updateHud();                         // the new letters pulse for a few seconds
    clearTimeout(GAME._freshT); GAME._freshT = setTimeout(() => { S.freshSlots = null; updateHud(); }, 4200);
  },
  clearChalkClues() { S.slots = S.slots.map((s) => (s === "chalk" ? null : s)); updateHud(); },
  addItem(id) { if (!S.belt.includes(id) && S.belt.length < 4) S.belt.push(id); updateHud(); },
  setCtx(v) { S.ctx = Math.max(0, Math.min(100, v)); updateHud(); },
  unlockCard(id) {
    if (S.cardsUnlocked.includes(id)) return;
    S.cardsUnlocked.push(id);
    const card = CONTENT.cards[id]; if (!card) return;
    let el = $("card-toast");                                        // "New card" notice, top-left
    if (!el) { el = document.createElement("div"); el.id = "card-toast"; $("stage").appendChild(el); }
    el.innerHTML = `<span class="ct-new">New card</span> ${card.title} <span class="ct-key">C</span>`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(GAME._toastT); GAME._toastT = setTimeout(() => el.classList.remove("show"), 5200);
  },
  toolCall, shake, fade, doorCutscene, say: (l, cb) => UI.say(l, cb), menu: (p, o, b) => UI.choose(p, o, b),
  askLetter: (p, cb, b) => UI.askLetter(p, cb, b), panel: (t, h, cb) => UI.panel(t, h, cb),
  flickerNow() { flicker.until = S.time + 0.15; },
  // physics self-check: returns problems with the player's current position
  checkBounds() {
    const out = [];
    if (blockedAt(player.x, player.y)) out.push("player overlaps a wall or solid object at " + Math.round(player.x) + "," + Math.round(player.y));
    if (player.x < 0 || player.y < 0 || player.x > MAP.pxW || player.y > MAP.pxH) out.push("player outside the map");
    if (MAP.roomAt(Math.floor(player.x / TILE), Math.floor((player.y - 3) / TILE)) < 0 && !MAP.isWall(Math.floor(player.x / TILE), Math.floor(player.y / TILE)) === false) out.push("player inside a wall tile");
    return out;
  },
  _S: S, _objects: objById, _player: player, placePlayer, _doors: CONTENT.map.doors, _stairs: CONTENT.map.stairs || [], _map: MAP, _objectList: objects, _npcs: npcs,
};
window.GAME = GAME;

// Boot
TITLE.onDone = startGame;
addEventListener("pointerdown", () => { if (S.mode === "title") TITLE.advance(); });
$("title").classList.remove("hidden");
updateHud();
fade(0, 800);
requestAnimationFrame(frame);
})();
