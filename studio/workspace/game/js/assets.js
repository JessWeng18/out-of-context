// ============================================================================
// assets.js - the art manifest.
//
// Every sprite here is a PLACEHOLDER drawn in code. To swap in real art, set
// `src` to an image path (relative to index.html), keeping the same w x h
// (or a multiple of it), e.g.  bed: { w: 32, h: 48, src: "art/bed.png" }
// Sprites with `frames` > 1 expect a horizontal strip: frame i at x = i*w.
//
// Sizes are in game pixels (the canvas is 480x288, shown at 2x).
// Wall-mounted sprites are drawn with their bottom edge on the bottom of the
// wall-face tile they hang on, so they can be taller than 16px.
// ============================================================================

const PAL = {
  wall: "#1a0f2e", floorA: "#2b1a45", floorB: "#2f1d4b", trim: "#4a2d6e", hi: "#9b6dff",
  glow: "#7bd389", slime: "#3fae6a", moss: "#1f4d36",
  lantern: "#ff9a3c", candle: "#ff6a00", ember: "#ffcf70",
  ink: "#120a1f", plum: "#6b45a0", pale: "#e9dcff", dusk: "#3a2458",
};

// Draw a sprite from rows of characters. '.' = transparent.
function pixelRows(ctx, rows, colors, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c === "." || c === " ") continue;
      ctx.fillStyle = colors[c] || "#f0f";
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}
function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

// ---------------------------------------------------------------------------
// Character pixel maps
// ---------------------------------------------------------------------------
const PERSON_COLORS = {
  k: PAL.ink, h: "#5b3d6e", s: "#f2c9a0", e: PAL.ink,
  c: PAL.trim, C: PAL.plum, p: "#24163a",
};
const PERSON_HEAD_FRONT = [
  "...kkkkkk...",
  "..khhhhhhk..",
  ".khhhhhhhhk.",
  ".khhssssshk.",
  ".kssessessk.",
  ".kssssssssk.",
  "..kssssssk..",
];
const PERSON_HEAD_BACK = [
  "...kkkkkk...",
  "..khhhhhhk..",
  ".khhhhhhhhk.",
  ".khhhhhhhhk.",
  ".khhhhhhhhk.",
  ".kshhhhhhsk.",
  "..kssssssk..",
];
const PERSON_HEAD_SIDE = [
  "...kkkkkk...",
  "..khhhhhhk..",
  ".khhhhhhhhk.",
  ".khhhhssssk.",
  ".khhssssesk.",
  ".kssssssssk.",
  "..kssssssk..",
];
const PERSON_BODY = [
  "..kCCCCCCk..",
  ".kcCCCCCCck.",
  "kcccCCCCccck",
  "ksccccccccsk",
  ".kcccccccck.",
  "..kppppppk..",
];
const PERSON_LEGS = [
  ["..kppkkppk..", "..kpk..kpk..", "..kkk..kkk.."], // standing
  ["..kppkkppk..", "...kpk.kpk..", "...kk..kkk.."], // step A
  ["..kppkkppk..", "..kpk.kpk...", "..kkk..kk..."], // step B
];
function personFrame(head, legs) { return head.concat(PERSON_BODY, legs); }

const BIRD_ROWS = [
  "..kkk...",
  ".kooek..",
  ".koooobb",
  "kyyoook.",
  "kyyyook.",
  ".kkkkk..",
  "..b.b...",
];
const BIRD_COLORS = { k: "#1b2230", o: "#4d5f7d", y: "#7b8faf", e: "#e7e2d6", b: "#2a1e18" }; // Polly: muted blue, pale eye, dark beak

const ROGUE_ROWS = [
  "....kkkkkk....",
  "...kggggggk...",
  "..kggggggggk..",
  ".kgggggggggGk.",
  ".kgmmggggmmGk.",
  ".kgmwggggmwGk.",
  ".kggggggggGGk.",
  ".kgggmmmmggGk.",
  ".kggggggggGGk.",
  "kgggggggggGGGk",
  "kgggggggggGGGk",
  "kggGgggGggGGGk",
  "kgGGgggGGgGGGk",
  "kGGkGGGkGGGGk.",
  ".kk.kkk.kkkk..",
];
const ROGUE_COLORS = { k: PAL.moss, g: PAL.glow, G: PAL.slime, m: PAL.moss, w: "#e8ffe8" };

// ---------------------------------------------------------------------------
// The manifest. draw(ctx, frame) paints into a w x h canvas.
// ---------------------------------------------------------------------------
const SPRITES = {
  // --- characters --------------------------------------------------------
  player_down: { w: 12, h: 16, frames: 3, src: null,
    draw: (c, f) => pixelRows(c, personFrame(PERSON_HEAD_FRONT, PERSON_LEGS[f]), PERSON_COLORS) },
  player_up:   { w: 12, h: 16, frames: 3, src: null,
    draw: (c, f) => pixelRows(c, personFrame(PERSON_HEAD_BACK, PERSON_LEGS[f]), PERSON_COLORS) },
  player_side: { w: 12, h: 16, frames: 3, src: null, // faces right; flipped for left
    draw: (c, f) => pixelRows(c, personFrame(PERSON_HEAD_SIDE, PERSON_LEGS[f]), PERSON_COLORS) },
  bird:        { w: 8, h: 7, src: null, draw: (c) => pixelRows(c, BIRD_ROWS, BIRD_COLORS) },
  rogue:       { w: 14, h: 15, src: null, draw: (c) => pixelRows(c, ROGUE_ROWS, ROGUE_COLORS) },

  // --- bedroom -----------------------------------------------------------
  bed: { w: 32, h: 48, src: null, draw: (c) => {
    R(c, 0, 0, 32, 48, PAL.ink);
    R(c, 1, 1, 30, 8, PAL.trim);             // headboard
    R(c, 3, 3, 26, 2, PAL.hi);
    R(c, 2, 9, 28, 38, "#3a2458");           // frame
    R(c, 5, 11, 22, 8, PAL.pale);            // pillow
    R(c, 5, 17, 22, 2, "#b9a5dd");
    R(c, 3, 21, 26, 25, PAL.plum);           // blanket
    for (let y = 23; y < 46; y += 5) for (let x = 5; x < 29; x += 6) R(c, x, y, 2, 2, PAL.trim);
    R(c, 3, 21, 26, 2, PAL.hi);
  }},
  nightstand: { w: 16, h: 16, src: null, draw: (c) => {
    R(c, 1, 3, 14, 13, PAL.ink); R(c, 2, 4, 12, 11, PAL.trim);
    R(c, 2, 4, 12, 2, PAL.hi); R(c, 3, 9, 10, 1, PAL.ink); R(c, 7, 11, 2, 1, PAL.ember);
  }},
  window: { w: 32, h: 24, src: null, draw: (c) => {
    R(c, 0, 0, 32, 24, PAL.ink); R(c, 2, 2, 28, 18, "#2a1a5a");
    R(c, 4, 4, 6, 6, "#e8e0ff");                    // the moon
    R(c, 5, 5, 2, 2, "#c9bdf0");
    R(c, 15, 2, 2, 18, PAL.ink); R(c, 2, 10, 28, 2, PAL.ink);
    R(c, 0, 20, 32, 4, PAL.trim); R(c, 0, 20, 32, 1, PAL.hi);
  }},
  portrait: { w: 16, h: 20, src: null, draw: (c) => {
    R(c, 0, 0, 16, 20, PAL.ember); R(c, 1, 1, 14, 18, PAL.candle);
    R(c, 2, 2, 12, 16, "#2a1a5a");
    // four little friends, glowing faintly
    const heads = [[3, 6], [7, 5], [11, 6], [5, 11], [9, 11]];
    heads.slice(0, 4).forEach(([x, y]) => { R(c, x, y, 2, 2, PAL.glow); R(c, x, y + 2, 2, 3, PAL.slime); });
  }},
  // Stone fireplace with animated green flames (8 frames).
  fireplace: { w: 40, h: 30, frames: 8, src: null, draw: (c, f) => {
    // stone surround and mantel
    R(c, 0, 4, 40, 26, "#3d3450");
    for (let y = 6; y < 30; y += 4) for (let x = (y / 4) % 2 ? 0 : 3; x < 40; x += 6) R(c, x, y, 5, 3, y % 8 ? "#4a4060" : "#433a58");
    R(c, 0, 0, 40, 5, "#5a4e70"); R(c, 0, 0, 40, 1, "#7a6d92"); R(c, 0, 4, 40, 1, "#2a2238");   // mantel shelf
    // dark firebox
    R(c, 8, 10, 24, 20, "#0a0610"); R(c, 9, 9, 22, 1, "#1a1222");
    R(c, 10, 26, 20, 2, "#2b1d14"); R(c, 13, 25, 14, 2, "#3b2a1c");                            // logs
    // green pixel flames: a new shape every frame
    const rnd = (n) => { const x = Math.sin((f + 1) * 91.7 + n * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const cols = ["#0f3d22", "#1f6b3a", "#3fae6a", "#7bd389", "#c8ffd2"];
    for (let i = 0; i < 18; i++) {
      const x = 11 + i;
      const mid = 1 - Math.abs(i - 8.5) / 9.5;
      const h = Math.round(4 + mid * 11 + rnd(i) * 5);
      for (let j = 0; j < h; j++) {
        const heat = (1 - j / h) * (0.55 + mid * 0.6) + (rnd(i * 7 + j) - 0.5) * 0.3;
        const k = Math.max(0, Math.min(4, Math.floor(heat * 5)));
        R(c, x + (j > h * 0.6 && rnd(i + j * 3) > 0.6 ? (rnd(j) > 0.5 ? 1 : -1) : 0), 25 - j, 1, 1, cols[k]);
      }
    }
    // embers
    for (let e = 0; e < 3; e++) R(c, 12 + Math.floor(rnd(50 + e) * 16), 10 + Math.floor(rnd(60 + e) * 8), 1, 1, "#a8ffbc");
  }},
  armour:    { w: 16, h: 16, src: null, draw: (c) => { R(c, 4, 1, 8, 14, "#8a8a99"); R(c, 6, 3, 4, 2, "#222"); } },
  skeleton:  { w: 32, h: 16, src: null, draw: (c) => { R(c, 2, 10, 28, 6, "#4a4258"); R(c, 6, 4, 20, 2, "#d8cfb8"); } },
  cobweb:    { w: 16, h: 16, src: null, draw: (c) => { c.strokeStyle = "rgba(220,220,230,0.4)"; c.beginPath(); c.moveTo(0, 0); c.lineTo(16, 16); c.moveTo(0, 0); c.lineTo(16, 6); c.moveTo(0, 0); c.lineTo(6, 16); c.stroke(); } },
  frame_oval: { w: 16, h: 16, src: null, draw: () => {} },
  frame_verdigris: { w: 16, h: 16, src: null, draw: () => {} },
  frame_gilt: { w: 16, h: 16, src: null, draw: () => {} },
  painting_round: { w: 16, h: 16, src: null, draw: () => {} },
  painting_small: { w: 16, h: 16, src: null, draw: () => {} },
  closed_curtains: { w: 16, h: 48, src: null, draw: () => {} },
  snake: { w: 32, h: 32, src: null, draw: () => {} },
  small_window: { w: 16, h: 16, src: null, draw: () => {} },
  towel_rail: { w: 16, h: 16, src: null, draw: () => {} },
  pipes: { w: 64, h: 16, src: null, draw: () => {} },
  witch_shelf: { w: 16, h: 16, src: null, draw: () => {} },
  curio_shelf: { w: 16, h: 16, src: null, draw: () => {} },
  drawers: { w: 32, h: 16, src: null, draw: () => {} },
  candle_table: { w: 16, h: 16, src: null, draw: () => {} },
  skull_table: { w: 16, h: 16, src: null, draw: (c) => { R(c, 3, 6, 10, 2, "#3a2418"); R(c, 6, 2, 4, 4, "#d8cfb8"); } },
  jar_table:   { w: 16, h: 16, src: null, draw: (c) => { R(c, 3, 6, 10, 2, "#3a2418"); R(c, 5, 0, 6, 6, "#3fae6a"); } },
  couch:     { w: 48, h: 16, src: null, draw: (c) => { R(c, 0, 4, 48, 12, "#5c0f1e"); } },
  chaise: { w: 48, h: 16, src: null, draw: () => {} },
  throne_chair: { w: 16, h: 16, src: null, draw: () => {} },
  bath_cabinet: { w: 16, h: 16, src: null, draw: () => {} },
  birdbox: { w: 16, h: 16, src: null, draw: () => {} },
  swords: { w: 16, h: 16, src: null, draw: () => {} },
  loose_brick: { w: 16, h: 16, src: null, draw: () => {} },
  w_key: { w: 16, h: 16, src: null, draw: () => {} },
  attic_set: { w: 16, h: 16, src: null, draw: () => {} },
  attic_scratches: { w: 16, h: 16, src: null, draw: () => {} },
  sheet_ghost: { w: 16, h: 16, src: null, draw: () => {} },
  rocking_chair: { w: 16, h: 16, src: null, draw: () => {} },
  cheval_mirror: { w: 16, h: 16, src: null, draw: () => {} },
  gothic_mirror: { w: 16, h: 16, src: null, draw: () => {} },
  mannequin: { w: 16, h: 16, src: null, draw: () => {} },
  chair:     { w: 16, h: 16, src: null, draw: () => {} },
  armchair:  { w: 16, h: 16, src: null, draw: (c) => { R(c, 1, 2, 14, 13, "#5c0f1e"); } },
  console_table: { w: 32, h: 16, src: null, draw: (c) => { R(c, 0, 4, 32, 4, "#3a2418"); } },
  ornate_mirror: { w: 16, h: 24, src: null, draw: (c) => { R(c, 2, 0, 12, 24, "#8a8a99"); } },
  gothic_window: { w: 16, h: 64, src: null, draw: (c) => { R(c, 4, 0, 8, 64, "#5a6a8a"); } },
  pillar:    { w: 16, h: 16, src: null, draw: (c) => { R(c, 4, 0, 8, 16, "#4a4258"); } },
  eye_plant: { w: 32, h: 32, src: null, draw: (c) => { R(c, 8, 16, 16, 16, "#2a2236"); R(c, 6, 0, 20, 16, "#7a2a4a"); } },
  flower_stand: { w: 16, h: 16, src: null, draw: (c) => { R(c, 6, 4, 4, 12, "#1a1620"); R(c, 3, 0, 10, 5, "#5a3a2a"); } },
  glow_book: { w: 16, h: 16, src: null, draw: () => {} },
  trunk:     { w: 32, h: 16, src: null, draw: (c) => { R(c, 0, 2, 32, 14, "#5a3a26"); } },
  graffiti:  { w: 32, h: 16, src: null, draw: () => {} },
  banner:    { w: 16, h: 32, src: null, draw: (c) => { R(c, 3, 2, 10, 26, "#5c0f1e"); R(c, 2, 0, 12, 2, "#1a1620"); } },
  candelabra: { w: 16, h: 16, src: null, draw: (c) => { R(c, 7, 2, 2, 13, "#1a1620"); R(c, 3, 2, 10, 2, "#1a1620"); R(c, 3, 0, 2, 2, "#7bd389"); R(c, 11, 0, 2, 2, "#7bd389"); R(c, 7, 0, 2, 2, "#7bd389"); } },
  ooze:      { w: 24, h: 16, src: null, draw: (c) => { c.fillStyle = "rgba(63,174,106,0.7)"; c.beginPath(); c.ellipse(12, 10, 10, 5, 0, 0, 7); c.fill(); } },
  rug: { w: 48, h: 32, src: null, draw: (c) => {
    R(c, 0, 0, 48, 32, PAL.moss); R(c, 2, 2, 44, 28, "#2a5c42");
    R(c, 5, 5, 38, 22, PAL.moss); R(c, 8, 8, 32, 16, "#244f39");
    for (let x = 10; x < 40; x += 6) R(c, x, 15, 3, 2, PAL.slime);
  }},

  // --- hallway -----------------------------------------------------------
  painting_1: { w: 16, h: 18, src: null, draw: (c) => paintFrame(c, (c) => {
    R(c, 3, 10, 10, 5, PAL.moss); R(c, 6, 5, 4, 5, PAL.dusk); R(c, 7, 3, 2, 2, PAL.dusk); // a little house on a hill
    R(c, 7, 7, 1, 1, PAL.ember);
  })},
  painting_2: { w: 16, h: 18, src: null, draw: (c) => paintFrame(c, (c) => {
    R(c, 5, 4, 6, 8, PAL.glow); R(c, 6, 6, 1, 1, PAL.ink); R(c, 9, 6, 1, 1, PAL.ink);   // a ghost
    R(c, 5, 12, 2, 2, PAL.glow); R(c, 9, 12, 2, 2, PAL.glow);
  })},
  painting_3: { w: 16, h: 18, src: null, draw: (c) => paintFrame(c, (c) => {
    R(c, 4, 9, 8, 5, PAL.trim); R(c, 6, 5, 4, 4, PAL.lantern); R(c, 7, 4, 2, 1, PAL.ember); // a lantern
    R(c, 7, 6, 2, 2, PAL.ember);
  })},
  plaque: { w: 16, h: 12, src: null, draw: (c) => {
    R(c, 0, 0, 16, 12, PAL.ink); R(c, 1, 1, 14, 10, "#b07a2a"); R(c, 2, 2, 12, 8, PAL.ember);
    for (let y = 3; y < 9; y += 2) R(c, 3, y, 10, 1, "#b07a2a");
  }},
  front_door: { w: 32, h: 32, src: null, draw: (c) => {
    R(c, 0, 0, 32, 32, PAL.ink); R(c, 2, 2, 28, 30, "#3a2458");
    R(c, 4, 4, 11, 26, PAL.trim); R(c, 17, 4, 11, 26, PAL.trim);
    R(c, 6, 6, 7, 9, PAL.dusk); R(c, 19, 6, 7, 9, PAL.dusk);
    R(c, 6, 18, 7, 9, PAL.dusk); R(c, 19, 18, 7, 9, PAL.dusk);
    R(c, 14, 17, 2, 3, PAL.ember); R(c, 16, 17, 2, 3, PAL.ember);  // handles
    R(c, 11, 0, 10, 2, PAL.hi);                                    // keypad light
  }},
  cellar_door: { w: 48, h: 16, src: null, draw: (c) => {
    R(c, 0, 0, 48, 16, PAL.ink); R(c, 1, 1, 46, 14, "#2a1a3e");
    for (let x = 2; x < 46; x += 8) R(c, x, 2, 7, 12, PAL.dusk);
    R(c, 0, 4, 48, 2, PAL.ink); R(c, 0, 10, 48, 2, PAL.ink);
    // padlock
    R(c, 21, 3, 6, 4, PAL.ink); R(c, 22, 4, 4, 3, "#1a0f2e");
    R(c, 20, 6, 8, 7, "#8a8f9a"); R(c, 23, 8, 2, 3, PAL.ink);
  }},
  cellar_door_open: { w: 48, h: 16, src: null, draw: (c) => {
    R(c, 0, 0, 48, 16, PAL.ink);
    for (let y = 2; y < 16; y += 4) R(c, 4, y, 40, 2, "#22142f");  // steps going down
  }},
  sconce: { w: 8, h: 12, frames: 2, src: null, draw: (c, f) => {
    R(c, 2, 7, 4, 5, "#b07a2a"); R(c, 1, 10, 6, 2, "#8a5a1a");
    R(c, 3, 4, 2, 3, PAL.pale);
    R(c, 3, f ? 1 : 2, 2, 2, PAL.ember); R(c, 3, 3, 2, 1, PAL.candle);
  }},
  candle: { w: 8, h: 12, frames: 2, src: null, draw: (c, f) => {
    R(c, 2, 5, 4, 7, PAL.pale); R(c, 2, 5, 1, 7, "#c7b8e6"); R(c, 1, 11, 6, 1, PAL.trim);
    R(c, 3, f ? 1 : 2, 2, 3, PAL.ember); R(c, 3, 3, 2, 2, PAL.candle);
  }},

  // --- scratch room ------------------------------------------------------
  chalkboard: { w: 64, h: 28, src: null, draw: (c) => {
    R(c, 0, 0, 64, 28, "#5a3a2a"); R(c, 2, 2, 60, 22, "#173a2a");
    R(c, 4, 5, 18, 1, "#4f8f6a"); R(c, 6, 9, 12, 1, "#4f8f6a"); // ghost of old chalk
    R(c, 0, 24, 64, 4, "#4a2d1e"); R(c, 10, 24, 4, 2, PAL.pale); R(c, 40, 24, 6, 2, "#cfe8d6");
  }},
  desk: { w: 32, h: 20, src: null, draw: (c) => {
    R(c, 0, 0, 32, 14, PAL.ink); R(c, 1, 1, 30, 11, PAL.trim); R(c, 1, 1, 30, 2, PAL.hi);
    R(c, 2, 12, 3, 8, PAL.ink); R(c, 27, 12, 3, 8, PAL.ink);
    R(c, 6, 4, 8, 6, PAL.pale); R(c, 7, 5, 6, 1, "#b9a5dd"); R(c, 7, 7, 5, 1, "#b9a5dd"); // paper
  }},

  // --- nest room ---------------------------------------------------------
  nest: { w: 64, h: 40, src: null, draw: (c) => {
    R(c, 4, 10, 56, 28, "#3b2a1a"); R(c, 0, 16, 64, 18, "#4a3420");
    R(c, 10, 12, 44, 16, "#1f140c");                            // the hollow
    for (let i = 0; i < 40; i++) {                               // twigs
      const x = (i * 37) % 60, y = 12 + ((i * 17) % 24);
      R(c, x, y, 5, 1, i % 2 ? "#6a4a2a" : "#7a5a32");
    }
    R(c, 20, 16, 6, 5, PAL.pale); R(c, 34, 17, 6, 5, PAL.pale);  // eggs? letters? later!
  }},
  pedestal: { w: 16, h: 24, src: null, draw: (c) => {
    R(c, 3, 8, 10, 16, PAL.ink); R(c, 4, 9, 8, 14, PAL.trim); R(c, 1, 6, 14, 3, PAL.hi);
  }},
  uv_light: { w: 12, h: 10, src: null, draw: (c) => {
    R(c, 1, 3, 8, 5, PAL.ink); R(c, 2, 4, 6, 3, "#5a3a8a"); R(c, 9, 2, 3, 7, "#b46dff");
    R(c, 3, 8, 2, 2, PAL.ink);
  }},

  // --- library -----------------------------------------------------------
  bookshelf: { w: 64, h: 36, src: null, draw: (c) => {
    R(c, 0, 0, 64, 36, PAL.ink); R(c, 1, 1, 62, 34, "#3a2458");
    const cols = [PAL.trim, PAL.moss, "#7a2a3a", PAL.plum, "#2a4a6a", PAL.slime];
    for (let row = 0; row < 3; row++) {
      const y = 3 + row * 11;
      R(c, 2, y + 9, 60, 2, PAL.ink);
      for (let x = 3, i = row; x < 60; i++) {
        const w = 2 + (i * 7) % 3, h = 6 + (i * 5) % 3;
        R(c, x, y + 9 - h, w, h, cols[i % cols.length]);
        x += w + 1;
      }
    }
  }},
  sandbox_cube: { w: 12, h: 12, src: null, draw: (c) => {
    R(c, 1, 3, 9, 9, PAL.slime); R(c, 3, 1, 9, 9, "rgba(123,211,137,0.6)");
    R(c, 3, 1, 9, 1, "#c8ffd2"); R(c, 1, 3, 1, 9, "#c8ffd2"); R(c, 5, 5, 3, 3, "#c8ffd2");
  }},
  reading_desk: { w: 48, h: 24, src: null, draw: (c) => {
    R(c, 0, 0, 48, 16, PAL.ink); R(c, 1, 1, 46, 13, PAL.trim); R(c, 1, 1, 46, 2, PAL.hi);
    R(c, 3, 14, 3, 10, PAL.ink); R(c, 42, 14, 3, 10, PAL.ink);
    R(c, 14, 3, 20, 10, PAL.pale);                                // the long transcript
    for (let y = 5; y < 12; y += 2) R(c, 16, y, 16, 1, "#9a8abb");
    R(c, 30, 9, 8, 6, PAL.pale);                                  // it spills off the desk
  }},

  // --- bathroom ----------------------------------------------------------
  mirror: { w: 24, h: 24, src: null, draw: (c) => {
    R(c, 0, 0, 24, 24, "#b07a2a"); R(c, 2, 2, 20, 20, "#5c6a8a");
    R(c, 3, 3, 18, 18, "rgba(220,220,240,0.35)");                 // fog
    R(c, 5, 5, 3, 8, "rgba(255,255,255,0.35)");
  }},
  sink: { w: 32, h: 20, src: null, draw: (c) => {
    R(c, 0, 0, 32, 10, PAL.pale); R(c, 4, 2, 24, 5, "#9fb0c8"); R(c, 15, 0, 2, 3, "#8a8f9a");
    R(c, 3, 10, 26, 10, PAL.trim); R(c, 3, 10, 26, 1, PAL.ink); R(c, 15, 12, 2, 6, PAL.ink); // cabinet doors
  }},
  bathtub: { w: 48, h: 28, src: null, draw: (c) => {
    R(c, 0, 0, 48, 26, PAL.ink); R(c, 1, 1, 46, 24, PAL.pale); R(c, 4, 4, 40, 18, "#3c4f6a");
    R(c, 6, 6, 10, 2, "#6f86a8"); R(c, 4, 25, 4, 3, "#b07a2a"); R(c, 40, 25, 4, 3, "#b07a2a");
  }},
  wall_shelf: { w: 32, h: 16, src: null, draw: (c) => {
    R(c, 0, 12, 32, 3, "#5a3a2a"); R(c, 2, 15, 3, 1, PAL.ink); R(c, 27, 15, 3, 1, PAL.ink);
  }},
  evals_kit: { w: 14, h: 10, src: null, draw: (c) => {
    R(c, 0, 2, 14, 8, PAL.ink); R(c, 1, 3, 12, 6, PAL.pale); R(c, 6, 4, 2, 4, PAL.candle); R(c, 5, 5, 4, 2, PAL.candle);
    R(c, 5, 0, 4, 2, PAL.ink);
  }},

  // --- cellar ------------------------------------------------------------
  crate: { w: 16, h: 16, src: null, draw: (c) => {
    R(c, 0, 0, 16, 16, PAL.ink); R(c, 1, 1, 14, 14, "#4a3420"); R(c, 1, 1, 14, 2, "#6a4a2a");
    R(c, 1, 7, 14, 2, PAL.ink); R(c, 7, 1, 2, 14, "#3b2a1a");
  }},
  barrel: { w: 14, h: 16, src: null, draw: (c) => {
    R(c, 1, 0, 12, 16, PAL.ink); R(c, 2, 1, 10, 14, "#4a3420"); R(c, 2, 3, 10, 1, "#8a8f9a"); R(c, 2, 12, 10, 1, "#8a8f9a");
  }},
  slime_puddle: { w: 24, h: 10, src: null, draw: (c) => {
    R(c, 2, 2, 20, 6, PAL.slime); R(c, 0, 4, 24, 3, PAL.slime); R(c, 5, 3, 6, 2, PAL.glow);
  }},
};

// Picture-frame helper for the hallway paintings.
function paintFrame(c, inner) {
  R(c, 0, 0, 16, 18, "#5a3a2a"); R(c, 1, 1, 14, 16, "#8a5a1a");
  R(c, 2, 2, 12, 14, "#22163a");
  inner(c);
}

// ---------------------------------------------------------------------------
// Loader: turns the manifest into ready-to-blit canvases.
// ASSETS.get(key, frame) -> canvas (or Image when `src` is set and loaded).
// ---------------------------------------------------------------------------
const ASSETS = (() => {
  const cache = {};
  function build(key) {
    const s = SPRITES[key];
    const frames = s.frames || 1;
    const out = [];
    for (let f = 0; f < frames; f++) {
      const cv = document.createElement("canvas");
      cv.width = s.w; cv.height = s.h;
      s.draw(cv.getContext("2d"), f);
      out.push(cv);
    }
    cache[key] = out;
    if (s.src) {
      // Real art: when the image loads, slice it into frames and replace the placeholder.
      const img = new Image();
      img.onload = () => {
        cache[key] = [];
        for (let f = 0; f < frames; f++) {
          const cv = document.createElement("canvas");
          cv.width = s.w; cv.height = s.h;
          const cx = cv.getContext("2d");
          cx.imageSmoothingEnabled = false;
          const fw = img.width / frames;
          cx.drawImage(img, f * fw, 0, fw, img.height, 0, 0, s.w, s.h);
          cache[key].push(cv);
        }
      };
      img.src = s.src;
    }
  }
  return {
    get(key, frame = 0) {
      if (!SPRITES[key]) return null;
      if (!cache[key]) build(key);
      const fr = cache[key];
      return fr[frame % fr.length];
    },
    size(key) { const s = SPRITES[key]; return s ? { w: s.w, h: s.h } : null; },
  };
})();
