// title.js: the layered title sequence.
//
//   Stage 0  thick brambles; the manor barely visible; only the title text
//   Stage 1  branches pushed aside; smoke rises with the subtitle
//   Stage 2  full view of the manor and gates; controls shown
//   Stage 3  the rusted gates swing open and we move through them -> game starts
//
// Everything is drawn in code at the 480x288 pixel canvas. Text lives in the
// #title DOM overlay so it stays crisp.

const TITLE = (() => {
  const W = 480, H = 288;  // logical drawing size
  const RES = 4;           // every layer is rendered at 4x for fine detail

  // Small seeded RNG so the manor, ivy and brambles look the same every load.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  const T = {
    stage: 0,
    part: 0,       // 0 = brambles closed, 1 = pushed aside
    zoom: 1.12,    // camera zoom (stage 0 is a little closer)
    gate: 0,       // 0 = closed, 1 = fully open
    push: 0,       // 0..1 move through the gates at the end
    crescent: 0,   // 0 = full moon, 1 = crescent
    busy: false,   // true while a transition plays
    wipe: 0,       // 0..1 the flashlight sweeping the title away
    brushOn: 0,    // 1 while the undergrowth overlay is showing
    bg: 1, vig: 1, // black behind the undergrowth / darkness around the torch beam
    bclear: 0, b0: 0, b1: 0, b2: 0, b3: 0,   // how far each layer of undergrowth has been pushed aside (0 = densest, nearest)
    tweens: [],
  };

  function tween(key, to, sec, ease = (k) => 1 - Math.pow(1 - k, 3)) {
    return new Promise((res) => T.tweens.push({ key, from: T[key], to, t: 0, sec, ease, res }));
  }
  function stepTweens(dt) {
    for (const tw of T.tweens) {
      tw.t = Math.min(tw.sec, tw.t + dt);
      T[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(tw.t / tw.sec);
    }
    T.tweens = T.tweens.filter((tw) => (tw.t >= tw.sec ? (tw.res(), false) : true));
  }

  // ------------------------------------------------------------------ manor
  const MANOR = { x: 140, y: 34, w: 200, h: 200 }; // drawing area (canvas coords)
  const WINDOWS = [];   // {x, y, w, h, open, sway, phase}
  const CHIMNEY = { x: 296, y: 104 }; // smoke source (top of the right chimney)
  // Big moon to the right of the manor, kept well inside the frame (the sky
  // layer is oversized in 3D, so the visible area is roughly x 48..432).
  const MOON = { x: 372, y: 92, r: 54 }; // becomes a crescent; the subtitle sits in its gap
  MOON.textX = MOON.x + MOON.r * 0.3; // in the crescent's hollow

  const manorCv = document.createElement("canvas");
  manorCv.width = W * RES; manorCv.height = H * RES;
  (function buildManor() {
    const c = manorCv.getContext("2d");
    c.setTransform(RES, 0, 0, RES, 0, 0);
    const r = rng(7);
    const stone = ["#6f6b7a", "#666273", "#77737f", "#5f5b6b"];

    // Stone wall with block texture.
    function wall(x, y, w, h) {
      c.fillStyle = "#4f4b5c"; c.fillRect(x, y, w, h); // mortar
      const BH = 2.5, BW = 4.5;
      for (let yy = y, row = 0; yy < y + h; yy += BH, row++) {
        const off = row % 2 ? BW / 2 : 0;
        for (let xx = x - off; xx < x + w; xx += BW) {
          const bx = Math.max(x, xx), bw = Math.min(xx + BW, x + w) - bx;
          if (bw <= 0.3) continue;
          c.fillStyle = stone[Math.floor(r() * stone.length)];
          c.fillRect(bx + 0.15, yy + 0.15, bw - 0.4, BH - 0.4);
          // speckle and a lit top edge on each stone
          c.fillStyle = "rgba(255,255,255,0.06)"; c.fillRect(bx + 0.15, yy + 0.15, bw - 0.4, 0.35);
          for (let k = 0; k < 3; k++) {
            c.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.08)";
            c.fillRect(bx + r() * bw, yy + r() * BH, 0.3, 0.3);
          }
        }
      }
      // moonlit left edge, shaded right edge, darker base
      c.fillStyle = "rgba(200,190,255,0.10)"; c.fillRect(x, y, 2, h);
      c.fillStyle = "rgba(10,5,25,0.25)"; c.fillRect(x + w - 3, y, 3, h);
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "rgba(10,5,25,0)"); g.addColorStop(1, "rgba(10,5,25,0.35)");
      c.fillStyle = g; c.fillRect(x, y, w, h);
    }
    function battlements(x, y, w) {
      c.fillStyle = "#57536a";
      c.fillRect(x - 2, y - 2, w + 4, 3);
      for (let xx = x; xx < x + w - 3; xx += 7) {
        c.fillStyle = stone[Math.floor(r() * stone.length)];
        c.fillRect(xx, y - 7, 4, 5);
      }
    }
    function cone(cx, baseY, halfW, apexY, color) {
      c.fillStyle = color;
      c.beginPath(); c.moveTo(cx - halfW - 2, baseY); c.lineTo(cx, apexY); c.lineTo(cx + halfW + 2, baseY); c.closePath(); c.fill();
      // slate rows
      c.strokeStyle = "rgba(0,0,0,0.25)";
      for (let yy = apexY + 4; yy < baseY; yy += 1.6) {
        const k = (yy - apexY) / (baseY - apexY);
        c.lineWidth = 0.35; c.beginPath(); c.moveTo(cx - halfW * k - 1, yy); c.lineTo(cx + halfW * k + 1, yy); c.stroke();
      }
      c.fillStyle = "rgba(200,190,255,0.12)";
      c.beginPath(); c.moveTo(cx, apexY); c.lineTo(cx - halfW - 2, baseY); c.lineTo(cx - halfW + 2, baseY); c.closePath(); c.fill();
      // finial
      c.fillStyle = "#2b2236"; c.fillRect(cx, apexY - 6, 1, 6); c.fillRect(cx - 1, apexY - 4, 3, 1);
    }
    function addWindow(x, y, w, h) {
      // stone surround + arched opening; the glow and curtains are drawn live
      c.fillStyle = "#4b4759";
      c.fillRect(x - 2, y - 1, w + 4, h + 3);
      c.beginPath(); c.arc(x + w / 2, y, w / 2 + 2, Math.PI, 0); c.fill();
      c.fillStyle = "#1a0f14";
      c.fillRect(x, y, w, h);
      c.beginPath(); c.arc(x + w / 2, y, w / 2, Math.PI, 0); c.fill();
      c.fillStyle = "#3e3a4c"; c.fillRect(x - 3, y + h + 1, w + 6, 2); // sill
      WINDOWS.push({ x, y, w, h, open: 0, sway: 0, phase: r() * 10, silhouette: r() < 0.5 });
    }

    // Side turrets (round towers drawn as tall walls), main body, central tower.
    wall(146, 98, 26, 134); cone(159, 98, 13, 56, "#3b3150"); battlements(146, 98, 26);
    wall(308, 98, 26, 134); cone(321, 98, 13, 56, "#3b3150"); battlements(308, 98, 26);
    wall(170, 128, 140, 104); battlements(170, 128, 140);
    // chimneys
    wall(178, 108, 10, 20); c.fillStyle = "#4b4759"; c.fillRect(176, 106, 14, 3);
    wall(292, 106, 10, 22); c.fillStyle = "#4b4759"; c.fillRect(290, 104, 14, 3);
    // central tower
    wall(220, 70, 40, 162); cone(240, 70, 20, 22, "#41355a"); battlements(220, 70, 40);
    // little dormer turrets on the main roof line
    wall(196, 116, 12, 12); cone(202, 116, 6, 100, "#3b3150");
    wall(272, 116, 12, 12); cone(278, 116, 6, 100, "#3b3150");

    // windows
    [[180, 146], [200, 146], [270, 146], [290, 146], [180, 182], [200, 182], [270, 182], [290, 182]].forEach(([x, y]) => addWindow(x, y, 9, 14));
    [[235, 96], [235, 134]].forEach(([x, y]) => addWindow(x, y, 10, 16));
    [[154, 118], [154, 160], [316, 118], [316, 160]].forEach(([x, y]) => addWindow(x, y, 9, 14));
    // rose window on the tower
    c.fillStyle = "#4b4759"; c.beginPath(); c.arc(240, 172, 9, 0, Math.PI * 2); c.fill();
    WINDOWS.push({ x: 233, y: 166, w: 14, h: 12, open: 0, sway: 0, phase: 3, round: true });

    // arched front door
    c.fillStyle = "#4b4759"; c.fillRect(229, 200, 22, 32); c.beginPath(); c.arc(240, 200, 11, Math.PI, 0); c.fill();
    c.fillStyle = "#2a1520"; c.fillRect(232, 202, 16, 30); c.beginPath(); c.arc(240, 202, 8, Math.PI, 0); c.fill();
    c.fillStyle = "#3a1e2a"; c.fillRect(239, 196, 2, 36);
    c.fillStyle = "#ffcf70"; c.fillRect(236, 216, 1, 2); c.fillRect(243, 216, 1, 2);
    // steps
    c.fillStyle = "#57536a"; c.fillRect(226, 232, 28, 2); c.fillStyle = "#4b4759"; c.fillRect(222, 234, 36, 2);

    // Ivy: vines climbing from the ground with clustered leaves.
    const leaf = ["#1f4d36", "#2a5e3f", "#1a3f2d", "#3a7a4f"];
    function vine(x, y, len, drift) {
      let vx = x, vy = y;
      for (let i = 0; i < len * 2; i++) {
        vy -= 0.5;
        vx += (r() - 0.5) * 0.9 + drift * 0.5;
        c.fillStyle = "#1b2a1c"; c.fillRect(vx, vy, 0.35, 0.6); // stem
        if (r() < 0.8) {
          c.fillStyle = leaf[Math.floor(r() * leaf.length)];
          const s = 0.8 + r() * 0.9, lx = vx + (r() - 0.5) * 4, ly = vy;
          c.beginPath(); c.ellipse(lx, ly, s, s * 0.7, r() * 3, 0, Math.PI * 2); c.fill();
          if (r() < 0.3) { c.fillStyle = "rgba(160,220,150,0.25)"; c.fillRect(lx - 0.3, ly - 0.3, 0.4, 0.4); }
        }
        if (r() < 0.04) vine(vx, vy, len * 0.4 * r(), (r() - 0.5) * 0.6); // side shoot
      }
    }
    [[150, 232, 120, 0.05], [158, 232, 90, 0.08], [168, 232, 70, 0.1], [176, 232, 60, 0.02], [214, 232, 110, -0.03],
     [262, 232, 75, 0.03], [304, 232, 55, -0.05], [312, 232, 105, 0.02], [326, 232, 80, -0.04], [194, 232, 40, 0.0]]
      .forEach(([x, y, l, d]) => vine(x, y, l, d));
  })();

  // ------------------------------------------------------------- brambles
  // Each branch: anchor on a screen edge, bezier towards the middle, with thorns.
  const BRANCHES = [];
  (function buildBrambles() {
    const r = rng(42);
    const edges = [];
    for (let i = 0; i < 16; i++) edges.push(["left", r() * H]);
    for (let i = 0; i < 16; i++) edges.push(["right", r() * H]);
    for (let i = 0; i < 12; i++) edges.push(["top", r() * W]);
    for (let i = 0; i < 12; i++) edges.push(["bottom", r() * W]);
    for (const [side, p] of edges) {
      let x0, y0, dirx, diry;
      if (side === "left") { x0 = -10; y0 = p; dirx = -1; diry = 0; }
      if (side === "right") { x0 = W + 10; y0 = p; dirx = 1; diry = 0; }
      if (side === "top") { x0 = p; y0 = -10; dirx = 0; diry = -1; }
      if (side === "bottom") { x0 = p; y0 = H + 10; dirx = 0; diry = 1; }
      // reach towards the centre, sometimes past it
      const tx = W / 2 + (r() - 0.5) * 300, ty = H / 2 + (r() - 0.5) * 180;
      const reach = 0.55 + r() * 0.6;
      const x3 = x0 + (tx - x0) * reach, y3 = y0 + (ty - y0) * reach;
      BRANCHES.push({
        x0, y0, x3, y3,
        c1x: x0 + (x3 - x0) * 0.33 + (r() - 0.5) * 80, c1y: y0 + (y3 - y0) * 0.33 + (r() - 0.5) * 80,
        c2x: x0 + (x3 - x0) * 0.66 + (r() - 0.5) * 80, c2y: y0 + (y3 - y0) * 0.66 + (r() - 0.5) * 80,
        width: 4 + r() * 9, dirx, diry, phase: r() * 6.28, sway: 2 + r() * 4,
        color: ["#0d1a12", "#132619", "#1b2c1f", "#1a1222", "#101a14"][Math.floor(r() * 5)],
        thorns: Array.from({ length: 6 + Math.floor(r() * 8) }, () => ({ k: r(), side: r() < 0.5 ? -1 : 1, len: 3 + r() * 4 })),
        leaves: Array.from({ length: 4 + Math.floor(r() * 6) }, () => ({ k: 0.2 + r() * 0.8, dx: (r() - 0.5) * 10, dy: (r() - 0.5) * 10 })),
      });
    }
  })();

  function bez(b, k, ox, oy, sw) {
    const u = 1 - k;
    const c1x = b.c1x + sw, c2x = b.c2x + sw * 1.5, x3 = b.x3 + sw * 2;
    const x = u * u * u * b.x0 + 3 * u * u * k * c1x + 3 * u * k * k * c2x + k * k * k * x3 + ox;
    const y = u * u * u * b.y0 + 3 * u * u * k * b.c1y + 3 * u * k * k * b.c2y + k * k * k * b.y3 + oy;
    return [x, y];
  }

  function drawBrambles(c, t, vignette = true) {
    const push = T.part * 320; // how far branches are pushed out of frame
    for (const b of BRANCHES) {
      const sw = Math.sin(t * 0.7 + b.phase) * b.sway * (1 - T.part * 0.5);
      // push outward along the anchor direction (and a bit away from centre)
      const ox = b.dirx * push + (b.diry !== 0 ? Math.sign(b.x3 - W / 2) * push * 0.6 : 0);
      const oy = b.diry * push * 0.8;
      c.strokeStyle = b.color; c.lineCap = "round";
      // taper: draw segments thinner towards the tip
      const N = 14;
      let [px, py] = bez(b, 0, ox, oy, sw);
      for (let i = 1; i <= N; i++) {
        const k = i / N;
        const [x, y] = bez(b, k, ox, oy, sw * k);
        c.lineWidth = Math.max(1, b.width * (1 - k * 0.8));
        c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
        px = x; py = y;
      }
      c.fillStyle = b.color;
      for (const th of b.thorns) {
        const [x, y] = bez(b, th.k, ox, oy, sw * th.k);
        c.fillRect(x + th.side * (b.width * (1 - th.k * 0.8)) / 2, y - th.len / 2, th.side * th.len, 1);
      }
      for (const lf of b.leaves) {
        const [x, y] = bez(b, lf.k, ox, oy, sw * lf.k);
        c.fillStyle = "#1f3d2a"; c.fillRect(x + lf.dx, y + lf.dy, 3, 2);
        c.fillStyle = "#2c5a3a"; c.fillRect(x + lf.dx + 1, y + lf.dy, 1, 1);
      }
    }
    if (!vignette) return;
    // dark vignette that thins out as the branches part
    const g = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 300);
    g.addColorStop(0, "rgba(6,3,12,0)"); g.addColorStop(1, `rgba(6,3,12,${0.85 - T.part * 0.45})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------- thicket
  // The opening view: gnarled, creepy fairy-tale trees whose twisted trunks and
  // spiky branches arch over the view, leaving one small hole in the middle.
  // As T.part goes 0 -> 1 each tree swings away from its root (the unravelling)
  // and the hole opens up. Each tree is drawn once to its own canvas.
  const HOLE = { x: 240, y: 186, r0: 30 };
  const TREE_RES = 3;
  const BARK = { base: "#0f0c0b", mid: "#1a1513", hi: "#2e2620", rim: "#3d3247", moss: "#1f2b1a", line: "#080605" };

  function makeTree(seed, draw) {
    const cv = document.createElement("canvas");
    cv.width = W * TREE_RES; cv.height = H * TREE_RES;
    const c = cv.getContext("2d");
    c.setTransform(TREE_RES, 0, 0, TREE_RES, 0, 0);
    draw(c, rng(seed));
    return cv;
  }

  // One tapered, slightly kinked limb from (x, y) heading `ang`. Splits into
  // smaller limbs and ends in sharp twig points.
  function limb(c, r, x, y, ang, len, w, depth, avoidHole) {
    const steps = Math.max(2, Math.round(len / 7));
    const seg = len / steps;
    let px = x, py = y, pw = w;
    for (let i = 0; i < steps; i++) {
      ang += (r() - 0.5) * 0.55;                // angular, crooked growth
      const nx = px + Math.cos(ang) * seg, ny = py + Math.sin(ang) * seg;
      const nw = Math.max(0.35, pw * (1 - 0.55 / steps));
      if (avoidHole && Math.hypot(nx - HOLE.x, (ny - HOLE.y) * 1.15) < HOLE.r0 + 6) { spike(c, px, py, ang, pw); return; }
      quad(c, px, py, nx, ny, pw, nw, r);
      px = nx; py = ny; pw = nw;
    }
    if (depth <= 0 || pw < 0.7) { spike(c, px, py, ang, pw); return; }
    const kids = 2 + (r() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const spread = (k - (kids - 1) / 2) * (0.5 + r() * 0.5) + (r() - 0.5) * 0.3;
      limb(c, r, px, py, ang + spread, len * (0.55 + r() * 0.25), pw * (0.55 + r() * 0.2), depth - 1, avoidHole);
    }
    // little thorny twigs along the way
    if (r() < 0.6) spike(c, px, py, ang + (r() < 0.5 ? 1.2 : -1.2), pw * 0.8);
  }
  function quad(c, x0, y0, x1, y1, w0, w1, r) {
    const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
    c.fillStyle = BARK.mid;
    c.beginPath();
    c.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); c.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
    c.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2); c.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
    c.closePath(); c.fill();
    // moonlit rim on one side, shadow on the other
    c.lineWidth = Math.max(0.3, w0 * 0.08);
    c.strokeStyle = BARK.rim; c.beginPath(); c.moveTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2); c.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2); c.stroke();
    c.strokeStyle = BARK.line; c.beginPath(); c.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); c.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2); c.stroke();
    // sketchy bark grain along the limb
    const lines = Math.min(5, Math.floor(w0 / 3));
    for (let i = 0; i < lines; i++) {
      const o = (r() - 0.5) * w0 * 0.8;
      c.strokeStyle = r() < 0.5 ? BARK.base : BARK.hi;
      c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(x0 + nx * o, y0 + ny * o); c.lineTo(x1 + nx * o * (w1 / w0) + (r() - 0.5), y1 + ny * o * (w1 / w0)); c.stroke();
    }
    if (w0 > 6 && r() < 0.12) { // a knot hole
      c.fillStyle = BARK.line; c.beginPath(); c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, w0 * 0.15, w0 * 0.25, a, 0, Math.PI * 2); c.fill();
    }
    if (r() < 0.15) { c.fillStyle = BARK.moss; c.fillRect((x0 + x1) / 2 - 0.5, (y0 + y1) / 2 - 0.5, 1.2, 0.8); }
  }
  function spike(c, x, y, ang, w) {
    const len = 4 + w * 3;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    c.fillStyle = BARK.mid;
    c.beginPath();
    c.moveTo(x + nx * w / 2, y + ny * w / 2); c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); c.lineTo(x - nx * w / 2, y - ny * w / 2);
    c.closePath(); c.fill();
  }

  // A trunk follows a path of points, getting thinner, and throws limbs off it.
  function trunk(c, r, pts, w0, w1, limbsEvery, limbDepth, side) {
    for (let i = 0; i < pts.length - 1; i++) {
      const k0 = i / (pts.length - 1), k1 = (i + 1) / (pts.length - 1);
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      quad(c, x0, y0, x1, y1, w0 + (w1 - w0) * k0, w0 + (w1 - w0) * k1, r);
      if (i % limbsEvery === limbsEvery - 1) {
        const a = Math.atan2(y1 - y0, x1 - x0) + side * (0.5 + r() * 0.7);
        limb(c, r, x1, y1, a, 30 + r() * 40, (w0 + (w1 - w0) * k1) * 0.55, limbDepth, true);
      }
    }
    // twisted roots at the base
    const [bx, by] = pts[0];
    for (let i = 0; i < 4; i++) limb(c, r, bx + (r() - 0.5) * w0, by - 4, (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.6 - 0.15, 30 + r() * 30, w0 * 0.35, 1, false);
  }
  // A crooked path: a quadratic curve with gnarled sideways kinks.
  function curve(x0, y0, cx, cy, x1, y1, n = 18) {
    const out = [], r = rng(Math.round(x0 * 7 + y1));
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      let x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      if (i > 0 && i < n) { x += (r() - 0.5) * 14; y += (r() - 0.5) * 10; }
      out.push([x, y]);
    }
    return out;
  }

  // Trees: [canvas, pivot x, pivot y, swing direction]
  const TREES = [
    // far trees (drawn first, a touch lighter)
    [makeTree(11, (c, r) => trunk(c, r, curve(150, 300, 120, 160, 210, 60), 16, 4, 3, 3, -1)), 150, 300, -1],
    [makeTree(12, (c, r) => trunk(c, r, curve(330, 300, 360, 160, 270, 60), 16, 4, 3, 3, 1)), 330, 300, 1],
    // big framing trees that arch over the top and meet in the middle
    [makeTree(21, (c, r) => trunk(c, r, curve(30, 300, 40, 40, 300, 20), 46, 6, 2, 3, 1)), 30, 300, -1],
    [makeTree(22, (c, r) => trunk(c, r, curve(450, 300, 440, 40, 180, 24), 46, 6, 2, 3, -1)), 450, 300, 1],
    // dense thorny growth crowding the left and right edges (and corners)
    [makeTree(41, (c, r) => {
      for (let i = 0; i < 14; i++) limb(c, r, -8, -10 + i * 23 + r() * 10, (r() - 0.5) * 0.9, 70 + r() * 70, 7 + r() * 9, 3, true);
      trunk(c, r, curve(8, 300, -10, 160, 30, -10), 30, 10, 2, 2, 1);
    }), -8, 150, -1],
    [makeTree(42, (c, r) => {
      for (let i = 0; i < 14; i++) limb(c, r, W + 8, -10 + i * 23 + r() * 10, Math.PI + (r() - 0.5) * 0.9, 70 + r() * 70, 7 + r() * 9, 3, true);
      trunk(c, r, curve(472, 300, 490, 160, 450, -10), 30, 10, 2, 2, -1);
    }), W + 8, 150, 1],
    [makeTree(43, (c, r) => {
      for (let i = 0; i < 9; i++) limb(c, r, 20 + i * 14, -8, Math.PI / 2 + (r() - 0.5) * 0.8 - 0.3, 50 + r() * 50, 5 + r() * 6, 3, true);
      for (let i = 0; i < 9; i++) limb(c, r, W - 20 - i * 14, -8, Math.PI / 2 + (r() - 0.5) * 0.8 + 0.3, 50 + r() * 50, 5 + r() * 6, 3, true);
    }), W / 2, -20, 0],
    // low trunks crowding the bottom corners
    [makeTree(31, (c, r) => trunk(c, r, curve(-20, 250, 120, 300, 200, 230), 26, 5, 2, 2, -1)), -20, 250, -1],
    [makeTree(32, (c, r) => trunk(c, r, curve(500, 250, 360, 300, 280, 232), 26, 5, 2, 2, 1)), 500, 250, 1],
  ];

  function drawThicket(c, t) {
    const k = T.part;
    const ease = k * k * (3 - 2 * k);
    const R = HOLE.r0 + ease * 520;
    const fade = 1 - Math.max(0, (k - 0.8) / 0.2);
    c.save();
    c.globalAlpha = fade;
    // near-black fog behind the trees, with the hole cut out
    // darkness that's densest at the edges and thins out gradually towards the hole
    const g = c.createRadialGradient(HOLE.x, HOLE.y, R * 0.4, HOLE.x, HOLE.y, R + 300);
    g.addColorStop(0, "rgba(4,3,6,0)");
    g.addColorStop(0.12, "rgba(4,3,6,0.5)");
    g.addColorStop(0.35, "rgba(4,3,6,0.82)");
    g.addColorStop(0.7, "rgba(4,3,6,0.93)");
    g.addColorStop(1, "rgba(4,3,6,0.97)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // extra darkness over everything at the start so the title reads clearly; lifts as the trees part
    c.fillStyle = `rgba(3,2,5,${0.6 * Math.max(0, 1 - k * 1.6)})`; c.fillRect(0, 0, W, H);
    // the trees, each swinging away from its root as they unravel
    for (const [cv, px, py, dir] of TREES) {
      const sway = Math.sin(t * 0.6 + px * 0.01) * 0.006;
      c.save();
      c.translate(px + dir * ease * 160, py + (dir === 0 ? -ease * 200 : ease * 30));
      c.rotate(dir * ease * 0.75 + sway);
      c.translate(-px, -py);
      c.drawImage(cv, 0, 0, W, H);
      c.restore();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- gates
  function drawGates(c, t) {
    const gy = 182, gb = 282;
    // stone pillars
    for (const px of [176, 292]) {
      c.fillStyle = "#57536a"; c.fillRect(px, gy - 10, 12, gb - gy + 10);
      c.fillStyle = "#6f6b7a"; c.fillRect(px + 1, gy - 10, 3, gb - gy + 10);
      c.fillStyle = "#4b4759"; c.fillRect(px - 2, gy - 14, 16, 5);
    }
    // side fences
    drawBars(c, 40, 176, gy + 18, gb, 1);
    drawBars(c, 304, 440, gy + 18, gb, 1);
    // the two gate leaves swing open towards the viewer: shrink towards the pillars
    const open = T.gate;
    const leafW = 52;
    const lw = leafW * Math.cos(open * Math.PI * 0.48);
    drawBars(c, 188, 188 + lw, gy, gb, 1 - open * 0.35, open);
    drawBars(c, 292 - lw, 292, gy, gb, 1 - open * 0.35, open, true);
  }

  function drawBars(c, x0, x1, top, bottom, shade, open, mirror) {
    if (x1 - x0 < 1) return;
    const iron = `rgba(${Math.round(34 * shade)},${Math.round(28 * shade)},${Math.round(40 * shade)},1)`;
    const n = Math.max(2, Math.round((x1 - x0) / 7));
    // rails
    c.fillStyle = iron;
    c.fillRect(x0, top + 14, x1 - x0, 2);
    c.fillRect(x0, bottom - 22, x1 - x0, 2);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      // taller bars towards the middle of the gate for an arched top
      const k = mirror ? 1 - i / n : i / n;
      const arch = open === undefined ? 0 : Math.sin(k * Math.PI * 0.5) * 10;
      const tTop = top - arch;
      c.fillStyle = iron; c.fillRect(x, tTop, 1.3, bottom - tTop);
      c.fillStyle = "rgba(255,255,255,0.08)"; c.fillRect(x, tTop, 0.35, bottom - tTop);
      c.fillStyle = iron;
      // spear tip
      c.beginPath(); c.moveTo(x - 1, tTop); c.lineTo(x + 1, tTop - 6); c.lineTo(x + 3, tTop); c.closePath(); c.fill();
      // rust streaks
      if ((i * 7 + x) % 3 === 0) {
        c.fillStyle = "rgba(160,72,28,0.75)"; c.fillRect(x, tTop + 18 + (i % 4) * 6, 1, 10 + (i % 3) * 6);
        c.fillStyle = "rgba(196,98,40,0.6)"; c.fillRect(x + 1, bottom - 30 - (i % 5) * 4, 1, 8);
      }
    }
    // scrollwork between the rails
    c.strokeStyle = iron; c.lineWidth = 0.6;
    for (let i = 0; i < n; i++) {
      const cx = x0 + ((x1 - x0) * (i + 0.5)) / n;
      c.beginPath(); c.arc(cx, top + 22, 3, 0, Math.PI * 1.5); c.stroke();
      c.beginPath(); c.arc(cx, bottom - 30, 3, Math.PI, Math.PI * 2.5); c.stroke();
    }
    c.fillStyle = "rgba(160,72,28,0.5)"; c.fillRect(x0, top + 15, (x1 - x0) * 0.4, 1); // rusty rail
  }

  // ---------------------------------------------------------------- smoke
  const SMOKE = [];
  function updateSmoke(dt, t) {
    if (T.stage >= 1 && Math.random() < dt * 14) {
      SMOKE.push({ x: CHIMNEY.x + (Math.random() - 0.5) * 3, y: CHIMNEY.y, r: 3, a: 0.5, vx: 3 + Math.random() * 4, vy: -14 - Math.random() * 6 });
    }
    for (const p of SMOKE) {
      p.x += (p.vx + Math.sin(t + p.y * 0.05) * 4) * dt;
      p.y += p.vy * dt;
      p.r += 5 * dt;
      p.a -= 0.07 * dt;
    }
    for (let i = SMOKE.length - 1; i >= 0; i--) if (SMOKE[i].a <= 0 || SMOKE[i].y < -40) SMOKE.splice(i, 1);
  }
  function drawSmoke(c) {
    for (const p of SMOKE) {
      c.fillStyle = `rgba(170,168,178,${Math.max(0, p.a) * 0.5})`;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
    }
  }

  // ------------------------------------------------------- window glow, curtains
  let nextCurtain = 2;
  function updateCurtains(dt, t) {
    if (t > nextCurtain) {
      nextCurtain = t + 1.5 + Math.random() * 3.5;
      const w = WINDOWS[Math.floor(Math.random() * WINDOWS.length)];
      if (!w.round && !w.anim) w.anim = { t: 0, kind: Math.random() < 0.5 ? "pull" : "twitch" };
    }
    for (const w of WINDOWS) {
      if (!w.anim) continue;
      w.anim.t += dt;
      const k = w.anim.t;
      if (w.anim.kind === "pull") {
        // open over 0.4s, hold 1.2s, close over 0.6s
        w.open = k < 0.4 ? k / 0.4 : k < 1.6 ? 1 : k < 2.2 ? 1 - (k - 1.6) / 0.6 : 0;
        if (k > 2.2) w.anim = null;
      } else {
        w.sway = Math.sin(k * 14) * Math.max(0, 1 - k / 0.9) * 2;
        if (k > 0.9) { w.sway = 0; w.anim = null; }
      }
    }
  }
  function drawWindows(c, t) {
    for (const w of WINDOWS) {
      const f = 0.75 + 0.25 * Math.sin(t * 3 + w.phase) * Math.sin(t * 7.3 + w.phase * 2);
      // soft red glow halo
      c.fillStyle = `rgba(255,60,40,${0.10 * f})`;
      c.fillRect(w.x - 5, w.y - 8, w.w + 10, w.h + 14);
      if (w.round) {
        c.fillStyle = `rgba(255,${Math.round(70 + 30 * f)},50,${0.75 * f})`;
        c.beginPath(); c.arc(w.x + w.w / 2, w.y + w.h / 2, 6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "#3e3a4c"; c.beginPath(); c.moveTo(w.x + 1, w.y + w.h / 2); c.lineTo(w.x + w.w - 1, w.y + w.h / 2); c.moveTo(w.x + w.w / 2, w.y); c.lineTo(w.x + w.w / 2, w.y + w.h); c.stroke();
        continue;
      }
      // interior light
      c.fillStyle = `rgba(255,${Math.round(60 + 40 * f)},45,${0.85})`;
      c.fillRect(w.x, w.y, w.w, w.h);
      c.beginPath(); c.arc(w.x + w.w / 2, w.y, w.w / 2, Math.PI, 0); c.fill();
      // silhouette when the curtain is pulled back
      if (w.open > 0.6 && w.silhouette) {
        c.fillStyle = `rgba(20,6,10,${(w.open - 0.6) * 2})`;
        c.fillRect(w.x + w.w / 2 - 2, w.y + 3, 4, 4);
        c.fillRect(w.x + w.w / 2 - 3, w.y + 7, 6, w.h - 7);
      }
      // curtains: two crimson panels that part when `open` rises
      const half = (w.w / 2) * (1 - w.open * 0.8);
      c.fillStyle = "#5a1426";
      c.fillRect(w.x + w.sway, w.y - 2, half, w.h + 2);
      c.fillRect(w.x + w.w - half + w.sway, w.y - 2, half, w.h + 2);
      c.fillStyle = "#781c33";
      c.fillRect(w.x + w.sway, w.y - 2, 1, w.h + 2);
      c.fillRect(w.x + w.w - half + w.sway, w.y - 2, 1, w.h + 2);
      // mullion
      c.fillStyle = "#2b2236"; c.fillRect(w.x + w.w / 2 - 0.3, w.y - 3, 0.6, w.h + 3);
      c.fillRect(w.x, w.y + w.h * 0.45, w.w, 0.5); // transom
    }
  }

  // ----------------------------------------------------------------- scene
  // The scene is drawn as separate depth layers. The 2D fallback stacks them on
  // one canvas; title3d.js puts each layer on its own plane in a Three.js scene.
  function drawSky(c, t) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b0518"); g.addColorStop(0.6, "#25153d"); g.addColorStop(1, "#1a0f2e");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const x = (i * 97 + 13) % W, y = (i * 53 + 7) % 150;
      c.fillStyle = Math.sin(t * 2 + i) > 0.7 ? "#e9dcff" : "#5c4785";
      c.fillRect(x, y, 0.6, 0.6);
    }
    // a huge moon low behind the manor
    const MX = MOON.x, MY = MOON.y, MR = MOON.r;
    // glow: softer as the moon thins, shifted towards the lit side
    const kg = T.crescent * T.crescent * (3 - 2 * T.crescent);
    for (const [rr, a] of [[MR * 1.9, 0.035], [MR * 1.5, 0.05], [MR * 1.2, 0.07]]) {
      c.fillStyle = `rgba(200,235,200,${a * (1 - kg * 0.7)})`; c.beginPath(); c.arc(MX - kg * MR * 0.45, MY, rr * (1 - kg * 0.35), 0, Math.PI * 2); c.fill();
    }
    // The moon's lit shape: the full disc minus a second circle that slides in
    // from the right (only the lit part is drawn, no dark disc). The horns wrap
    // around so you see more of the top and bottom as it becomes a crescent.
    const k = T.crescent * T.crescent * (3 - 2 * T.crescent);
    const d = MR * (2.05 - 1.45 * k); // inner circle offset: 2.05R (full) -> 0.6R (crescent)
    c.save();
    c.beginPath(); c.arc(MX, MY, MR, 0, Math.PI * 2); c.clip();
    c.beginPath(); c.rect(MX - MR - 2, MY - MR - 2, MR * 2 + 4, MR * 2 + 4); c.arc(MX + d, MY - MR * 0.04 * k, MR * 1.0, 0, Math.PI * 2);
    c.fillStyle = "#93a58f"; c.fill("evenodd");
    c.clip("evenodd");
    for (const [dx, dy, rr] of [[-18, -14, 9], [14, 8, 12], [-6, 22, 6], [26, -20, 5], [-30, 10, 4], [4, -30, 4], [-40, -8, 5], [-34, 26, 3]]) {
      c.fillStyle = "rgba(70,88,70,0.5)"; c.beginPath(); c.arc(MX + dx, MY + dy, rr, 0, Math.PI * 2); c.fill();
    }
    const mg = c.createRadialGradient(MX - 20, MY - 20, MR * 0.2, MX, MY, MR);
    mg.addColorStop(0, "rgba(255,255,255,0)"); mg.addColorStop(1, "rgba(60,80,70,0.35)");
    c.fillStyle = mg; c.fillRect(MX - MR, MY - MR, MR * 2, MR * 2);
    c.restore();
  }
  function drawFar(c) {
    c.strokeStyle = "#140b22"; c.lineWidth = 2;
    for (const [x, h] of [[40, 70], [80, 50], [400, 60], [440, 80], [110, 40], [370, 45]]) {
      c.beginPath(); c.moveTo(x, 240); c.lineTo(x, 240 - h); c.stroke();
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, 240 - h * 0.6); c.lineTo(x - 10, 240 - h * 0.85); c.moveTo(x, 240 - h * 0.75); c.lineTo(x + 9, 240 - h); c.stroke();
      c.lineWidth = 2;
    }
    c.fillStyle = "#170d26"; c.beginPath(); c.ellipse(240, 300, 330, 72, 0, 0, Math.PI * 2); c.fill();
  }
  function drawManorLive(c, t) {
    c.drawImage(manorCv, 0, 0, W, H);
    drawWindows(c, t);
    // paved flagstone path to the door, in perspective, with edging stones and moss
    c.save();
    c.beginPath(); c.moveTo(224, 236); c.lineTo(256, 236); c.lineTo(306, 288); c.lineTo(174, 288); c.closePath();
    c.fillStyle = "#1a1424"; c.fill(); c.clip();
    const rows = 9;
    for (let rI = 0; rI < rows; rI++) {
      const k0 = rI / rows, k1 = (rI + 1) / rows;
      const pk = (k) => Math.pow(k, 1.6);
      const y0 = 236 + pk(k0) * 52, y1 = 236 + pk(k1) * 52;
      const hw0 = 16 + pk(k0) * 50, hw1 = 16 + pk(k1) * 50;
      const n = 3 + (rI % 2), off = rI % 2 ? 0.5 : 0;
      for (let q = -1; q < n + 1; q++) {
        const u0 = (q + off) / n, u1 = (q + 1 + off) / n;
        if (u1 <= 0 || u0 >= 1) continue;
        const a0 = Math.max(0, u0), a1 = Math.min(1, u1);
        const xa0 = 240 - hw0 + a0 * hw0 * 2, xb0 = 240 - hw0 + a1 * hw0 * 2, xa1 = 240 - hw1 + a0 * hw1 * 2, xb1 = 240 - hw1 + a1 * hw1 * 2;
        const tone = 52 + ((rI * 7 + q * 13) % 5) * 6;
        c.fillStyle = `rgb(${tone - 6},${tone - 10},${tone + 8})`;
        c.beginPath(); c.moveTo(xa0 + 0.6, y0 + 0.5); c.lineTo(xb0 - 0.6, y0 + 0.5); c.lineTo(xb1 - 0.6, y1 - 0.5); c.lineTo(xa1 + 0.6, y1 - 0.5); c.closePath(); c.fill();
        c.fillStyle = "rgba(255,255,255,0.06)"; c.fillRect(xa0 + 1, y0 + 0.5, Math.max(0, xb0 - xa0 - 2), 0.6);   // worn lit edge
        if ((rI + q) % 3 === 0) { c.fillStyle = "rgba(50,110,60,0.45)"; c.fillRect(xb1 - 2, y1 - 1.6, 3, 1.3); } // moss in the joints
      }
    }
    c.restore();
    // edging kerb stones on both sides
    for (let rI = 0; rI < 9; rI++) {
      const k = Math.pow(rI / 9, 1.6), y = 236 + k * 52, hw = 16 + k * 50, sz = 1.5 + k * 3;
      for (const sx of [-1, 1]) { c.fillStyle = "#3a3346"; c.fillRect(240 + sx * hw - sz / 2, y, sz, sz * 0.8); }
    }
  }
  function drawMist(c, t) {
    for (let i = 0; i < 5; i++) {
      const y = 236 + i * 9, x = ((t * (6 + i * 2)) % 120) - 60;
      c.fillStyle = "rgba(160,140,200,0.06)";
      c.beginPath(); c.ellipse(120 + x + i * 40, y, 160, 8, 0, 0, Math.PI * 2); c.fill();
    }
  }
  function drawGatesLayer(c, t) {
    drawGates(c, t);
    for (const px of [182, 298]) drawLantern(c, t, px, 167);
  }

  // An iron lantern on each gate pillar with an eerie green pixel flame.
  const FLAME = ["#0f3d22", "#1f6b3a", "#3fae6a", "#7bd389", "#c8ffd2"];
  function drawLantern(c, t, cx, baseY) {
    // soft green glow
    const f = 0.75 + 0.25 * Math.sin(t * 7 + cx) * Math.sin(t * 11.3 + cx * 0.7);
    const g = c.createRadialGradient(cx, baseY - 7, 1, cx, baseY - 7, 26);
    g.addColorStop(0, `rgba(123,211,137,${0.32 * f})`); g.addColorStop(1, "rgba(63,174,106,0)");
    c.fillStyle = g; c.beginPath(); c.arc(cx, baseY - 7, 26, 0, Math.PI * 2); c.fill();
    // flame: drawn on a 1px grid so it reads as crisp pixel art
    const FW = 5, FH = 9, x0 = Math.round(cx - FW / 2), y0 = baseY - 2;
    for (let j = 0; j < FH; j++) {
      const rise = j / FH;
      const half = 2.6 * Math.pow(1 - rise, 0.7) + Math.sin(t * 9 + j * 1.3 + cx) * 0.6 * rise;
      for (let i = 0; i < FW; i++) {
        const dx = Math.abs(i - (FW - 1) / 2 - Math.sin(t * 6 + j * 0.8 + cx) * rise * 1.2);
        if (dx > half) continue;
        const flick = Math.sin(t * 14 + i * 2.1 + j * 1.7 + cx) * 0.18 + Math.sin(t * 23 + j * 3.1) * 0.12;
        const heat = (1 - rise) * (1 - dx / (half + 0.01)) + flick;
        const idx = Math.max(0, Math.min(4, Math.floor(heat * 5)));
        c.fillStyle = FLAME[idx];
        c.fillRect(x0 + i, y0 - j, 1, 1);
      }
    }
    // a couple of rising embers
    for (let e = 0; e < 2; e++) {
      const k = (t * 0.9 + e * 0.5 + cx * 0.01) % 1;
      c.fillStyle = `rgba(160,255,180,${1 - k})`;
      c.fillRect(Math.round(cx + Math.sin(t * 3 + e) * 2), Math.round(y0 - FH - k * 8), 1, 1);
    }
    // iron cage: base, four posts, pointed cap and a ring
    c.fillStyle = "#14101a";
    c.fillRect(cx - 5, baseY - 1, 10, 2);             // base plate
    c.fillRect(cx - 5, baseY - 14, 1, 13); c.fillRect(cx + 4, baseY - 14, 1, 13); // outer posts
    c.fillStyle = "rgba(20,16,26,0.55)";
    c.fillRect(cx - 2, baseY - 14, 0.6, 13); c.fillRect(cx + 1.5, baseY - 14, 0.6, 13); // thin front bars
    c.fillStyle = "#14101a";
    c.fillRect(cx - 6, baseY - 15, 12, 1.5);         // top rim
    c.beginPath(); c.moveTo(cx - 5, baseY - 15); c.lineTo(cx, baseY - 21); c.lineTo(cx + 5, baseY - 15); c.closePath(); c.fill();
    c.strokeStyle = "#14101a"; c.lineWidth = 0.8; c.beginPath(); c.arc(cx, baseY - 23, 1.6, 0, Math.PI * 2); c.stroke();
    // rust and a lit edge on the cage
    c.fillStyle = "rgba(170,80,30,0.7)"; c.fillRect(cx - 5, baseY - 9, 1, 3); c.fillRect(cx + 4, baseY - 5, 1, 2);
    c.fillStyle = `rgba(150,255,170,${0.35 * f})`; c.fillRect(cx - 4, baseY - 14, 0.5, 13); c.fillRect(cx + 3.5, baseY - 14, 0.5, 13);
  }

  const sceneCv = document.createElement("canvas");
  sceneCv.width = W * RES; sceneCv.height = H * RES;
  const sc = sceneCv.getContext("2d");
  sc.setTransform(RES, 0, 0, RES, 0, 0);

  function drawScene(t) {
    drawSky(sc, t);
    drawFar(sc);
    drawManorLive(sc, t);
    drawSmoke(sc);
    drawMist(sc, t);
    drawGatesLayer(sc, t);
  }

  // --------------------------------------------------------------- render
  function render(ctx, t, dt) {
    stepTweens(dt);
    drawBrush(t);
    updateSmoke(dt, t);
    updateCurtains(dt, t);
    if (api.renderer3d && api.renderer3d.ready) { api.renderer3d.render(t, dt); return; }
    drawScene(t);

    // camera: zoom around a focus point (the gates when pushing through)
    const fx = 240, fy = 150 + T.push * 80;
    const z = T.zoom * (1 + T.push * 2.2);
    ctx.save();
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-fx, -fy);
    ctx.drawImage(sceneCv, 0, 0, W, H);
    ctx.restore();

    // brambles sit in front of everything and are not zoomed
    if (T.part < 1) drawThicket(ctx, t);
    if (T.push > 0) { ctx.fillStyle = `rgba(0,0,0,${T.push})`; ctx.fillRect(0, 0, W, H); }

    // the subtitle sits over the moon
    const el = document.getElementById("title-smoke");
    if (el && T.stage >= 1) {
      const sx = (MOON.textX - fx) * z + W / 2, sy = (MOON.y - fy) * z + H / 2;
      el.style.left = `${(sx / W) * 100}%`;
      el.style.top = `${(sy / H) * 100}%`;
    }
  }

  // ------------------------------------------------- flashlight + undergrowth
  // After the title, a torch beam sweeps it away and lands on a wall of brambles right in front of you.
  // You push through four layers of it, from choked-solid to sparse, before the thicket and the manor appear.
  const BW = 960, BH = 576;
  const brush = document.createElement("canvas"); brush.width = BW; brush.height = BH; brush.id = "title-brush";
  const torch = document.createElement("div"); torch.id = "title-torch";
  { const host = document.getElementById("title"), blk = document.getElementById("title-black"); host.insertBefore(brush, blk.nextSibling); host.appendChild(torch); }
  // Each branch is kept as its own curve so it can be moved by itself. When a layer is pushed, every branch in
  // it bends out of the way of a clearing in the middle, all at once but each a beat apart, so the gap that
  // opens is roughly round with a ragged, tangled edge.
  const EX = 1.35, HX = BW / 2, HY = BH / 2 + 6, RADII = [270, 130], R_GONE = 600;
  // Bark colours: dead browns, rot-black, and moss/lichen greens. Each layer is the same wood, further from the light.
  const WOOD = ["#4a3724", "#3a2a1c", "#5a452c", "#2a1e14", "#33271c",     // browns
                "#1c1815", "#262019", "#12100e",                             // black, rotten
                "#2f3622", "#262d1d", "#3a4129", "#1f2a1c"];                 // green with moss
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, ((n >> 16) & 255) * f) | 0},${Math.min(255, ((n >> 8) & 255) * f) | 0},${Math.min(255, (n & 255) * f) | 0})`; };
  const UNDER = [
    { n: 120, w: 2.6, seed: 7,  lum: 1.0 },    // in your face: thick, gnarled, catching the light
    { n: 60,  w: 1.3, seed: 43, lum: 0.42 },   // behind it: thinner and darker
  ].map((spec) => {
    const r = rng(spec.seed), branches = [], N = 18;
    for (let i = 0; i < spec.n; i++) {
      const side = Math.floor(r() * 4);
      const x0 = side === 0 ? -24 : side === 1 ? BW + 24 : r() * BW, y0 = side === 2 ? -24 : side === 3 ? BH + 24 : r() * BH;
      const tx = BW / 2 + (r() - 0.5) * BW * 0.95, ty = BH / 2 + (r() - 0.5) * BH * 0.95, reach = 0.5 + r() * 0.8;
      const x3 = x0 + (tx - x0) * reach, y3 = y0 + (ty - y0) * reach;
      const c1x = x0 + (x3 - x0) * 0.33 + (r() - 0.5) * 380, c1y = y0 + (y3 - y0) * 0.33 + (r() - 0.5) * 380;
      const c2x = x0 + (x3 - x0) * 0.66 + (r() - 0.5) * 380, c2y = y0 + (y3 - y0) * 0.66 + (r() - 0.5) * 380;
      const width = (5 + r() * 12) * spec.w, tone = WOOD[Math.floor(r() * WOOD.length)];
      const pts = [];
      for (let k = 0; k <= N; k++) { const u = k / N, v = 1 - u; pts.push([v * v * v * x0 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y3]); }
      // crooked, arthritic growth: knock the smooth curve about, with a couple of sharp elbows
      const f1 = 0.35 + r() * 0.45, f2 = 0.9 + r() * 0.7, p1 = r() * 6, p2 = r() * 6, amp = (5 + r() * 8) * spec.w, e1 = 3 + Math.floor(r() * 6), e2 = 9 + Math.floor(r() * 7);
      const raw = pts.map((q) => q.slice());
      for (let k = 1; k < N; k++) {
        const ax = raw[k + 1][0] - raw[k - 1][0], ay = raw[k + 1][1] - raw[k - 1][1], al = Math.hypot(ax, ay) || 1;
        const off = (Math.sin(k * f1 + p1) * 0.75 + Math.sin(k * f2 + p2) * 0.25) * amp + (k === e1 ? amp * 0.8 : 0) - (k === e2 ? amp * 0.8 : 0);
        pts[k] = [raw[k][0] - ay / al * off, raw[k][1] + ax / al * off];
      }
      // burls and knots: the thickness swells and pinches along the length
      const kf = 0.5 + r() * 0.9, kp = r() * 6, wk = Array.from({ length: N + 1 }, (_, k) => width * (1 - (k / N) * 0.86) * (1 + 0.4 * Math.pow(Math.max(0, Math.sin(k * kf + kp)), 3)));
      // which way this branch gets shoved: away from the middle, on whichever side of it the branch already lies
      let m = 0, md = 1e9; pts.forEach(([x, y], k) => { const dd = Math.hypot((x - HX) / EX, y - HY); if (dd < md) { md = dd; m = k; } });
      let nx = (pts[m][0] - HX) / EX / (md || 1), ny = (pts[m][1] - HY) / (md || 1);
      if (md < 12) { const a2 = pts[Math.max(0, m - 1)], b2 = pts[Math.min(N, m + 1)], ux = (b2[0] - a2[0]) / EX, uy = b2[1] - a2[1], ul = Math.hypot(ux, uy) || 1, sg = r() < 0.5 ? -1 : 1; nx = -uy / ul * sg; ny = ux / ul * sg; }
      const thorns = Array.from({ length: 7 + Math.floor(r() * 9) }, () => ({ k: 1 + Math.floor(r() * (N - 1)), sd: r() < 0.5 ? -1 : 1, tl: (8 + r() * 14) * spec.w, hook: (r() - 0.3) * 0.9 }));
      // dead side-twigs that end in clawing fingers
      const twigs = Array.from({ length: Math.floor(r() * 3.2) }, () => {
        const k = 3 + Math.floor(r() * (N - 5)), ang = r() * Math.PI * 2, len = (22 + r() * 40) * spec.w * 0.8, bend = (r() - 0.5) * 1.6;
        const tp = [[0, 0]]; let a3 = ang, x = 0, y = 0;
        for (let q = 0; q < 3; q++) { a3 += bend * 0.5 + (r() - 0.5) * 0.7; x += Math.cos(a3) * len / 3; y += Math.sin(a3) * len / 3; tp.push([x, y]); }
        const fingers = Array.from({ length: 2 + Math.floor(r() * 3) }, (_, q) => { const fa = a3 + (q - 1) * 0.55 + (r() - 0.5) * 0.3, fl = len * (0.25 + r() * 0.25); return [x + Math.cos(fa) * fl * 0.6, y + Math.sin(fa) * fl * 0.6, x + Math.cos(fa + 0.5) * fl, y + Math.sin(fa + 0.5) * fl]; });
        return { k, tp, fingers, w: Math.max(1.5, wk[k] * 0.3) };
      });
      const moss = r() < 0.4 ? { k0: 1 + Math.floor(r() * 8), n: 3 + Math.floor(r() * 6), col: ["#4a5a2a", "#3c5030", "#5a6234"][Math.floor(r() * 3)] } : null;
      const bark = Array.from({ length: N + 1 }, () => (r() - 0.5) * 0.8);
      // the way back out: towards the edge this branch grows in from
      const rl = Math.hypot((x0 - HX) / EX, y0 - HY) || 1, rdx = (x0 - HX) / EX / rl, rdy = (y0 - HY) / rl, rang = Math.atan2(rdy, rdx);
      branches.push({ pts, width, wk, tone, nx, ny, rdx, rdy, rang, jit: 0.78 + r() * 0.5, dl: r() * 0.35, thorns, twigs, moss, bark, jx: r() * 100, jy: r() * 100 });
    }
    const cache = document.createElement("canvas"); cache.width = BW; cache.height = BH;
    return { spec, branches, cache, key: null, N };
  });
  const clamp01 = (v) => Math.max(0, Math.min(1, v)), smooth = (k) => k * k * (3 - 2 * k);
  const scratch = document.createElement("canvas"); scratch.width = BW; scratch.height = BH;
  // Redraw one layer with its branches bent clear of the hole. p = this layer's push, cl = the final sweep,
  // step = which stop-motion frame this is (each frame nudges every branch a hair, like a hand-moved model).
  function paintLayer(Ly, li, p, cl, step) {
    const c = scratch.getContext("2d"), N = Ly.N, lum = Ly.spec.lum; c.clearRect(0, 0, BW, BH); c.lineCap = "round"; c.lineJoin = "round";
    for (const b of Ly.branches) {
      const pb = smooth(clamp01(p * 1.35 - b.dl)), cb = smooth(clamp01(cl * 1.35 - b.dl));     // each branch a beat apart
      const base = RADII[li] * pb * b.jit, Rb = base + cb * (R_GONE - base);
      const jx = step ? Math.sin(step * 12.9898 + b.jx) * 1.6 : 0, jy = step ? Math.cos(step * 78.233 + b.jy) * 1.6 : 0;
      // The clearing is lumpy, not a true circle: its edge wanders in and out as you go round it.
      const lump = 1 + 0.2 * Math.sin(b.rang * 3 + li * 1.9) + 0.12 * Math.sin(b.rang * 5 + li * 4.1 + 1.3), Rc = Rb * lump;
      // Each branch draws back the way it came, towards the edge it grows from, just far enough that no part
      // of it is left inside the clearing. Long ones that reached across the middle pull back furthest.
      let pull = 0;
      if (Rc > 1) {
        const RR = Rc * Rc;
        for (const [x, y] of b.pts) {
          const qx = (x - HX) / EX, qy = y - HY, qd = qx * b.rdx + qy * b.rdy, disc = qd * qd - (qx * qx + qy * qy - RR);
          if (disc > 0) { const out = -qd + Math.sqrt(disc); if (out > pull) pull = out; }
        }
      }
      const tx2 = b.rdx * pull * EX + jx, ty2 = b.rdy * pull + jy;
      const P = pull > 0 || step ? b.pts.map(([x, y]) => [x + tx2, y + ty2]) : b.pts;
      const W = b.wk, dark = shade(b.tone, 0.3 * lum), mid = shade(b.tone, 0.9 * lum), lit = shade(b.tone, 1.5 * lum), spec2 = shade(b.tone, 2.3 * lum);
      const seg = (style, s, add, off) => { c.strokeStyle = style; for (let k = 1; k <= N; k++) { c.lineWidth = Math.max(1.2, W[k] * s + add); c.beginPath(); c.moveTo(P[k - 1][0] + off * W[k], P[k - 1][1] + off * W[k]); c.lineTo(P[k][0] + off * W[k], P[k][1] + off * W[k]); c.stroke(); } };
      // twigs first, so the limb they grow from overlaps their roots
      for (const tw of b.twigs) {
        const [bx, by] = P[tw.k];
        for (const [style, add] of [["#020101", 2.5], [dark, 0]]) {
          c.strokeStyle = style;
          for (let q = 1; q < tw.tp.length; q++) { c.lineWidth = Math.max(1, tw.w * (1 - q * 0.22) + add); c.beginPath(); c.moveTo(bx + tw.tp[q - 1][0], by + tw.tp[q - 1][1]); c.lineTo(bx + tw.tp[q][0], by + tw.tp[q][1]); c.stroke(); }
          c.lineWidth = Math.max(0.8, tw.w * 0.3 + add * 0.5); const [ex2, ey2] = tw.tp[tw.tp.length - 1];
          for (const [mx, my, fx, fy] of tw.fingers) { c.beginPath(); c.moveTo(bx + ex2, by + ey2); c.quadraticCurveTo(bx + mx, by + my, bx + fx, by + fy); c.stroke(); }
        }
      }
      // a round limb, lit from the upper left: soft cast shadow, black edge, dark underside, body, light band, glint
      seg("rgba(0,0,0,0.5)", 1, 9, 0.16);                         // a soft dark smear below-right: the shadow it throws on what's behind
      seg("#020101", 1, 4, 0);
      seg(dark, 1, 0, 0);
      seg(mid, 0.74, 0, -0.1);
      seg(lit, 0.42, 0, -0.2);
      c.globalAlpha = 0.55; seg(spec2, 0.12, 0, -0.31); c.globalAlpha = 1;
      // bark: dark cracks across the grain
      c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 1.2;
      for (let k = 1; k < N; k++) { if (W[k] < 5 || b.bark[k] > 0.05) continue; const dx = P[k + 1][0] - P[k - 1][0], dy = P[k + 1][1] - P[k - 1][1], dl = Math.hypot(dx, dy) || 1, px2 = -dy / dl, py2 = dx / dl, o2 = b.bark[k] * 6;
        c.beginPath(); c.moveTo(P[k][0] + px2 * W[k] * 0.42 + dx / dl * o2, P[k][1] + py2 * W[k] * 0.42 + dy / dl * o2); c.lineTo(P[k][0] - px2 * W[k] * 0.3 - dx / dl * o2, P[k][1] - py2 * W[k] * 0.3 - dy / dl * o2); c.stroke(); }
      // moss and lichen creeping along the top of some limbs
      if (b.moss) { c.strokeStyle = shade(b.moss.col, lum); c.globalAlpha = 0.75; c.setLineDash([3, 5, 7, 4]);
        for (let k = b.moss.k0; k < Math.min(N, b.moss.k0 + b.moss.n); k++) { c.lineWidth = Math.max(1.5, W[k] * 0.45); c.beginPath(); c.moveTo(P[k][0] - W[k] * 0.22, P[k][1] - W[k] * 0.22); c.lineTo(P[k + 1][0] - W[k] * 0.22, P[k + 1][1] - W[k] * 0.22); c.stroke(); }
        c.setLineDash([]); c.globalAlpha = 1; }
      // long hooked thorns
      for (const th of b.thorns) {
        const [ax, ay] = P[th.k - 1], [bx, by] = P[th.k], len = Math.hypot(bx - ax, by - ay) || 1, dx = (bx - ax) / len, dy = (by - ay) / len;
        const tnx = -dy * th.sd, tny = dx * th.sd, half = W[th.k] / 2, bw2 = Math.max(2, W[th.k] * 0.16);
        const tipx = bx + tnx * (half + th.tl) + dx * th.tl * th.hook, tipy = by + tny * (half + th.tl) + dy * th.tl * th.hook;
        c.fillStyle = dark; c.strokeStyle = "#020101"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(bx + tnx * half - dx * bw2, by + tny * half - dy * bw2);
        c.quadraticCurveTo(bx + tnx * (half + th.tl * 0.5) - dx * bw2 * 0.4, by + tny * (half + th.tl * 0.5) - dy * bw2 * 0.4, tipx, tipy);
        c.quadraticCurveTo(bx + tnx * (half + th.tl * 0.45) + dx * bw2, by + tny * (half + th.tl * 0.45) + dy * bw2, bx + tnx * half + dx * bw2, by + tny * half + dy * bw2);
        c.fill(); c.stroke();
      }
    }
    // stamp into the layer's cache with its drop shadow baked in (done only when the layer changes pose)
    const cc = Ly.cache.getContext("2d"); cc.clearRect(0, 0, BW, BH);
    cc.save(); cc.shadowColor = "rgba(0,0,0,0.9)"; cc.shadowBlur = 20 - li * 3; cc.shadowOffsetX = 9 - li * 2; cc.shadowOffsetY = 15 - li * 3; cc.drawImage(scratch, 0, 0); cc.restore();
  }
  // eyes in the gaps: small pairs that blink, back in the dark behind the brambles
  const EYES = (() => { const r = rng(99); return Array.from({ length: 7 }, () => ({ x: 120 + r() * 720, y: 90 + r() * 400, s: 2.2 + r() * 2.2, gap: 9 + r() * 8, col: r() < 0.5 ? "#c8ff9a" : "#ffb648", ph: r() * 20, sp: 0.25 + r() * 0.3 })); })();
  function drawEyes(c, t) {
    for (const e of EYES) {
      const cyc = (t * e.sp + e.ph) % 5, open = cyc < 2.2 ? Math.min(1, cyc * 3, (2.2 - cyc) * 3) * (Math.sin(cyc * 9) > 0.96 ? 0.1 : 1) : 0;     // they open, watch, blink, close
      if (open <= 0.02) continue;
      c.save(); c.globalAlpha = open * T.bg * 0.9; c.shadowColor = e.col; c.shadowBlur = 8; c.fillStyle = e.col;
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(e.x + sx * e.gap / 2, e.y, e.s, e.s * 0.55 * open, sx * 0.25, 0, 7); c.fill(); }
      c.restore();
    }
  }
  function drawBrush(t) {
    const main = document.getElementById("title-main");
    // the title letters dissolve into the brambles: the text fades and softens while the undergrowth fades up behind it
    if (T.wipe > 0 && T.wipe < 1) {
      main.style.transition = "none"; main.style.opacity = String(1 - T.wipe); main.style.filter = `blur(${T.wipe * 5}px)`;
      brush.style.opacity = String(Math.min(1, T.wipe * 1.25));
    } else { main.style.transition = ""; main.style.opacity = ""; main.style.filter = ""; brush.style.opacity = "1"; }
    main.style.visibility = T.wipe >= 1 ? "hidden" : "";         // once it has dissolved, it stays gone
    torch.style.opacity = "0";
    brush.style.display = T.brushOn > 0 ? "block" : "none";
    if (!(T.brushOn > 0)) return;
    const c = brush.getContext("2d");
    c.clearRect(0, 0, BW, BH);
    c.fillStyle = `rgba(1,0,1,${T.bg})`; c.fillRect(0, 0, BW, BH);
    { const back = c.createRadialGradient(HX, HY, 0, HX, HY, 640); back.addColorStop(0, `rgba(120,12,10,${0.16 * T.bg})`); back.addColorStop(0.55, `rgba(70,6,6,${0.08 * T.bg})`); back.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = back; c.fillRect(0, 0, BW, BH); }   // something red, deep in the thicket
    drawEyes(c, t);
    for (let i = UNDER.length - 1; i >= 0; i--) {                // far and sparse first, the dense near wall last
      // stop-motion: the layer only changes pose about ten times a second, in small jerks, never smoothly
      const p = Math.round(T["b" + i] * 13) / 13, cl = Math.round(T.bclear * 16) / 16; if (cl >= 1) continue;
      const moving = (T["b" + i] > 0 && T["b" + i] < 1) || (T.bclear > 0 && T.bclear < 1);
      const step = moving ? Math.floor(t * 8) + i * 3 : 0, key = p + "|" + cl + "|" + step;
      if (UNDER[i].key !== key) { paintLayer(UNDER[i], i, p, cl, step); UNDER[i].key = key; }
      // depth: each layer drops a shadow on the ones behind it, and the far ones sink into cold haze
      c.globalAlpha = 1 - cl * cl * cl; c.drawImage(UNDER[i].cache, 0, 0); c.globalAlpha = 1;
      if (i > 0 && T.bg > 0.02) { c.fillStyle = `rgba(6,9,12,${0.16 * T.bg})`; c.fillRect(0, 0, BW, BH); }
    }
    c.globalAlpha = 1;
    // the torch: a wobbling pool of light, darkness everywhere else
    const lx = BW / 2 + Math.sin(t * 0.7) * 14, ly = BH / 2 + Math.cos(t * 0.9) * 8;
    const dark = c.createRadialGradient(lx, ly, 70, lx, ly, 470);
    dark.addColorStop(0, "rgba(0,0,0,0)"); dark.addColorStop(0.5, `rgba(0,0,0,${0.7 * T.vig})`); dark.addColorStop(1, `rgba(0,0,0,${0.99 * T.vig})`);
    c.fillStyle = dark; c.fillRect(0, 0, BW, BH);
    c.globalCompositeOperation = "lighter";
    const warm = c.createRadialGradient(lx, ly, 0, lx, ly, 560); warm.addColorStop(0, `rgba(210,36,26,${(0.05 + 0.012 * Math.sin(t * 1.7)) * T.vig})`); warm.addColorStop(0.5, `rgba(160,20,16,${0.02 * T.vig})`); warm.addColorStop(1, "rgba(255,220,160,0)");
    c.fillStyle = warm; c.fillRect(0, 0, BW, BH);
    c.globalCompositeOperation = "source-over";
  }

  // --------------------------------------------------------------- stages
  function show(id, on) { const el = document.getElementById(id); if (el) el.classList.toggle("on", on); }

  async function advance() {
    if (T.busy) { T.queued = true; return; } // remember one press made mid-animation
    T.busy = true;
    if (T.stage === 0) {
      T.stage = 1;
      const sm = (k) => k * k * (3 - 2 * k), pause = (ms) => new Promise((r) => setTimeout(r, ms));
      // 1) the title dissolves into a wall of brambles
      Object.assign(T, { brushOn: 1, bg: 1, vig: 1, bclear: 0, b0: 0, b1: 0, b2: 0, b3: 0 });
      await tween("wipe", 1, 1.5, sm);
      show("title-main", false);
      document.getElementById("title-black").classList.add("lift");   // the real scene waits behind the undergrowth
      // 2) two pushes, straight after one another: the solid wall draws back, then the thinner growth behind it
      await tween("b0", 1, 1.2, sm);
      await Promise.all([tween("b1", 1, 1.2, sm), tween("bg", 0, 1.2, (k) => k)]);
      // 3) sweep everything away: the gnarled trees part and the manor comes into view
      await Promise.all([tween("bclear", 1, 1.8, sm), tween("vig", 0, 1.8, (k) => k), tween("part", 1, 3.2, (k) => k), tween("zoom", 1, 3.2, sm)]);
      T.brushOn = 0;
      await tween("crescent", 1, 2.6, (k) => k);  // full moon wanes to a crescent
      show("title-smoke", true);
      await new Promise((r) => setTimeout(r, 900));
    } else if (T.stage === 1) {
      T.stage = 2;
      show("title-smoke", false);
      await new Promise((r) => setTimeout(r, 300));
      show("title-keys", true);
    } else if (T.stage === 2) {
      T.stage = 3;
      show("title-keys", false);
      await tween("gate", 1, 1.4, (k) => k * k * (3 - 2 * k));
      await tween("push", 1, 1.1, (k) => k * k);
      T.busy = false; T.queued = false;
      if (api.onDone) api.onDone();
      return;
    }
    T.busy = false;
    if (T.queued) { T.queued = false; advance(); }
  }

  function reset() {
    Object.assign(T, { stage: 0, part: 0, zoom: 1.12, gate: 0, push: 0, crescent: 0, busy: false, tweens: [], wipe: 0, brushOn: 0, bg: 1, vig: 1, bclear: 0, b0: 0, b1: 0, b2: 0, b3: 0 });
    show("title-main", true); show("title-smoke", false); show("title-keys", false);
    document.getElementById("title-black").classList.remove("lift");
  }

  const api = {
    render, advance, reset, state: T, onDone: null, renderer3d: null,
    // pieces the Three.js renderer reuses
    W, H, RES, CHIMNEY, MOON, drawSky, drawFar, drawManorLive, drawMist, drawGatesLayer, drawBrambles, drawThicket,
  };
  return api;
})();
