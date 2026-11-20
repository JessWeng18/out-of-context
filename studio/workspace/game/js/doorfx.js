// doorfx.js: the door cutscene, drawn at full resolution.
//
// A tall gothic (lancet-arched) door of dark weathered oak with forged iron
// strap hinges ending in fleur-de-lis scrolls, an iron ring pull and a keyhole
// plate, set in a carved stone surround. The ring lifts and turns, the door
// swings open towards you in perspective, light spills out, and we push
// through. DOORFX.play(onMiddle) runs it; onMiddle fires while the screen is
// covered (that's when the room swaps).

const DOORFX = (() => {
  const W = 960, H = 576, RES = Math.min(2, window.devicePixelRatio || 1) * 1.5;
  const stage = document.getElementById("stage");
  const cv = document.createElement("canvas");
  cv.id = "doorfx";
  cv.width = W * RES; cv.height = H * RES;
  Object.assign(cv.style, { position: "absolute", left: "0", top: "0", width: W + "px", height: H + "px", pointerEvents: "none", display: "none" });
  stage.insertBefore(cv, document.getElementById("view").nextSibling);
  const c = cv.getContext("2d");

  let seed = 5;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Door geometry (logical px)
  const DW = 300, DH = 490;                // leaf size
  const X0 = (W - DW) / 2, TOP = 46;       // leaf position when closed
  const SPRING = 180;                      // where the pointed arch starts (from the top of the leaf)

  function archPath(ctx, x, y, w, h, spring) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + spring);
    ctx.quadraticCurveTo(x + w * 0.02, y + spring * 0.25, x + w / 2, y);
    ctx.quadraticCurveTo(x + w * 0.98, y + spring * 0.25, x + w, y + spring);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  // ---------------------------------------------------------------- leaf
  // The door leaf, pre-rendered once (without the ring, which animates).
  const leaf = document.createElement("canvas");
  const LR = 2;
  leaf.width = DW * LR; leaf.height = DH * LR;
  (function paintLeaf() {
    const g = leaf.getContext("2d");
    g.scale(LR, LR);
    archPath(g, 0, 0, DW, DH, SPRING);
    g.save(); g.clip();
    // planks
    const N = 7, pw = DW / N;
    for (let i = 0; i < N; i++) {
      const x = i * pw, tone = 0.85 + rnd() * 0.3;
      const pg = g.createLinearGradient(x, 0, x + pw, 0);
      pg.addColorStop(0, `rgb(${22 * tone},${16 * tone},${13 * tone})`);
      pg.addColorStop(0.5, `rgb(${46 * tone},${34 * tone},${28 * tone})`);
      pg.addColorStop(1, `rgb(${26 * tone},${18 * tone},${14 * tone})`);
      g.fillStyle = pg; g.fillRect(x, 0, pw, DH);
      // grain
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = rnd() < 0.5 ? `rgba(120,100,90,${0.06 + rnd() * 0.1})` : `rgba(0,0,0,${0.15 + rnd() * 0.2})`;
        g.lineWidth = 0.6 + rnd() * 1.2;
        const gx = x + 3 + rnd() * (pw - 6), wob = (rnd() - 0.5) * 8;
        g.beginPath(); g.moveTo(gx, 0);
        g.bezierCurveTo(gx + wob, DH * 0.3, gx - wob, DH * 0.6, gx + wob * 0.5, DH);
        g.stroke();
      }
      // knots
      if (rnd() < 0.6) {
        const kx = x + pw * (0.3 + rnd() * 0.4), ky = 80 + rnd() * (DH - 160);
        for (let r = 9; r > 1; r -= 2) { g.strokeStyle = `rgba(0,0,0,${0.25})`; g.lineWidth = 1; g.beginPath(); g.ellipse(kx, ky, r * 0.7, r * 1.6, 0, 0, Math.PI * 2); g.stroke(); }
      }
      // plank seam
      g.fillStyle = "rgba(0,0,0,0.75)"; g.fillRect(x + pw - 1.5, 0, 2, DH);
      g.fillStyle = "rgba(150,130,120,0.08)"; g.fillRect(x + pw + 0.5, 0, 1, DH);
    }
    // weathering: darker at the bottom and edges, a few pale scuffs
    const vg = g.createRadialGradient(DW / 2, DH * 0.45, DW * 0.2, DW / 2, DH * 0.5, DH * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, DW, DH);
    for (let i = 0; i < 40; i++) { g.strokeStyle = "rgba(170,150,140,0.07)"; g.lineWidth = 1; g.beginPath(); const sx = rnd() * DW, sy = rnd() * DH; g.moveTo(sx, sy); g.lineTo(sx + (rnd() - 0.5) * 14, sy + rnd() * 4); g.stroke(); }
    g.restore();
    // moulded border along the arch
    archPath(g, 0, 0, DW, DH, SPRING);
    g.strokeStyle = "#0b0706"; g.lineWidth = 10; g.stroke();
    archPath(g, 7, 9, DW - 14, DH - 9, SPRING - 6);
    g.strokeStyle = "rgba(120,100,90,0.18)"; g.lineWidth = 1.5; g.stroke();
    // iron
    strap(g, 150); strap(g, DH - 70);
    keyhole(g, DW * 0.82, 330);
    escutcheon(g, DW * 0.82, 240);
  })();

  // forged strap hinge running from the hinge side with fleur-de-lis scrolls
  function strap(g, y) {
    const iron = "#14161c", hi = "rgba(170,180,200,0.35)";
    const x1 = 6, x2 = DW * 0.86;
    g.fillStyle = iron; g.fillRect(x1, y - 7, x2 - x1, 14);
    g.fillStyle = hi; g.fillRect(x1, y - 7, x2 - x1, 1.5);
    // tapering arrow tip
    g.fillStyle = iron; g.beginPath(); g.moveTo(x2, y - 9); g.lineTo(x2 + 26, y); g.lineTo(x2, y + 9); g.closePath(); g.fill();
    // fleur-de-lis clusters along the strap and at the hinge end
    for (const fx of [16, DW * 0.3, DW * 0.55, DW * 0.78]) { fleur(g, fx, y, -1, iron, hi); fleur(g, fx, y, 1, iron, hi); }
    // nail heads
    for (let x = 30; x < x2; x += 34) { g.fillStyle = "#0a0b0e"; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); g.fillStyle = hi; g.beginPath(); g.arc(x - 0.8, y - 0.8, 1, 0, Math.PI * 2); g.fill(); }
  }
  function fleur(g, x, y, dir, iron, hi) {
    // a stem leaving the strap, a centre petal and two curled side petals
    g.strokeStyle = iron; g.fillStyle = iron; g.lineWidth = 4; g.lineCap = "round";
    const yy = y + dir * 7;
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x, yy + dir * 16); g.stroke();
    g.beginPath(); g.moveTo(x, yy + dir * 16); g.quadraticCurveTo(x + 6, yy + dir * 26, x, yy + dir * 36); g.quadraticCurveTo(x - 6, yy + dir * 26, x, yy + dir * 16); g.fill();
    for (const s of [-1, 1]) {
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(x, yy + dir * 14);
      g.bezierCurveTo(x + s * 14, yy + dir * 12, x + s * 18, yy + dir * 26, x + s * 10, yy + dir * 28);
      g.stroke();
      g.beginPath(); g.arc(x + s * 8, yy + dir * 25, 3.2, 0, Math.PI * 2); g.fill();
    }
    g.fillRect(x - 7, yy + dir * 13 - 1.5, 14, 3); // collar
    g.strokeStyle = hi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 1, yy); g.lineTo(x - 1, yy + dir * 14); g.stroke();
  }
  function keyhole(g, x, y) {
    g.fillStyle = "#14161c";
    g.beginPath(); g.ellipse(x, y, 13, 22, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(170,180,200,0.3)"; g.lineWidth = 1; g.stroke();
    g.fillStyle = "#020202"; g.beginPath(); g.arc(x, y - 4, 4, 0, Math.PI * 2); g.fill(); g.fillRect(x - 2, y - 2, 4, 12);
  }
  function escutcheon(g, x, y) {
    g.fillStyle = "#14161c";
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 11 : 17; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(170,180,200,0.3)"; g.lineWidth = 1; g.stroke();
    g.fillStyle = "#0a0b0e"; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
  }

  // ------------------------------------------------------- stone surround
  const frame = document.createElement("canvas");
  frame.width = W * RES; frame.height = H * RES;
  (function paintFrame() {
    const g = frame.getContext("2d");
    g.scale(RES, RES);
    // the hallway wall: burgundy damask wallpaper above dark wood wainscoting
    g.fillStyle = "#3a141e"; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(110,36,52,0.75)"; g.strokeStyle = "rgba(110,36,52,0.75)"; g.lineCap = "round";
    const motif = (cx, cy, sc) => {
      g.save(); g.translate(cx, cy); g.scale(sc, sc);
      for (const sx of [-1, 1]) {
        g.save(); g.scale(sx, 1);
        g.lineWidth = 9; g.beginPath(); g.moveTo(4, 70); g.bezierCurveTo(60, 40, 70, -30, 30, -70); g.stroke();
        g.lineWidth = 5; g.beginPath(); g.moveTo(30, -70); g.bezierCurveTo(10, -90, -5, -60, 14, -52); g.stroke();
        for (let k = 0; k < 6; k++) { const t = k / 6; g.beginPath(); g.ellipse(16 + 50 * Math.sin(t * 2.6), 60 - t * 120, 10, 4, -0.6 - t, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.ellipse(Math.cos(a) * 12, 92 + Math.sin(a) * 12, 9, 5, a, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.moveTo(0, -110); g.quadraticCurveTo(16, -85, 0, -60); g.quadraticCurveTo(-16, -85, 0, -110); g.fill();
      g.restore();
    };
    for (let row = 0; row < 3; row++) for (let col = -1; col < 7; col++) motif(col * 160 + (row % 2 ? 80 : 0), 60 + row * 200, 0.62);
    // wainscot panels along the bottom with a chair rail
    const wy = H - 150;
    g.fillStyle = "#24140c"; g.fillRect(0, wy, W, 150);
    g.fillStyle = "#3d2416"; g.fillRect(0, wy - 8, W, 10);
    for (let x = 10; x < W; x += 120) { g.fillStyle = "#1a0e08"; g.fillRect(x, wy + 18, 100, 110); g.strokeStyle = "rgba(160,120,90,0.15)"; g.lineWidth = 1.5; g.strokeRect(x + 1, wy + 19, 98, 108); }
    // soft darkness so the eye goes to the door
    const vg = g.createRadialGradient(W / 2, TOP + DH * 0.5, DW * 0.6, W / 2, TOP + DH * 0.5, W * 0.65);
    vg.addColorStop(0, "rgba(0,0,0,0.1)"); vg.addColorStop(1, "rgba(0,0,0,0.75)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // carved arch surround (several moulded rings)
    for (const [pad, col] of [[44, "#1e1826"], [32, "#2b2336"], [22, "#171220"], [12, "#30283c"], [4, "#120e18"]]) {
      archPath(g, X0 - pad, TOP - pad, DW + pad * 2, DH + pad + 10, SPRING + pad * 0.3);
      g.fillStyle = col; g.fill();
    }
    // keystone and corbel blocks
    g.fillStyle = "#3a3048"; g.beginPath(); g.moveTo(W / 2 - 18, TOP - 46); g.lineTo(W / 2 + 18, TOP - 46); g.lineTo(W / 2 + 12, TOP - 10); g.lineTo(W / 2 - 12, TOP - 10); g.closePath(); g.fill();
    for (const sx of [X0 - 52, X0 + DW + 30]) { g.fillStyle = "#2b2336"; g.fillRect(sx, TOP + SPRING - 14, 22, 28); g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(sx, TOP + SPRING - 14, 22, 3); }
    // threshold step
    g.fillStyle = "#231c2c"; g.fillRect(X0 - 70, TOP + DH, DW + 140, 22);
    g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(X0 - 70, TOP + DH, DW + 140, 2);
    // the doorway behind the leaf (dark until the door opens)
    archPath(g, X0, TOP, DW, DH, SPRING); g.fillStyle = "#050307"; g.fill();
  })();

  // ------------------------------------------------------------- animation
  const S = { cover: 0, lift: 0, turn: 0, open: 0, push: 0, fade: 0 };

  function project(x, y, z) {
    // simple perspective around the centre of the doorway
    const f = 900, cx = W / 2, cy = TOP + DH * 0.55, s = f / (f - z);
    return [cx + (x - cx) * s, cy + (y - cy) * s, s];
  }

  function draw(time) {
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.clearRect(0, 0, W, H);
    if (S.cover <= 0) { if (S.fade > 0) { c.fillStyle = `rgba(2,9,5,${S.fade})`; c.fillRect(0, 0, W, H); } return; }
    c.save();
    c.globalAlpha = S.cover;
    // push towards the doorway
    const z = 1 + S.push * 2.4;
    c.translate(W / 2, TOP + DH * 0.55); c.scale(z, z); c.translate(-W / 2, -(TOP + DH * 0.55));
    c.drawImage(frame, 0, 0, W, H);
    // beyond the doorway: a dark, shadowy void. A sickly green-purple haze glows
    // faintly at the edges and a slow, barely-visible swirl turns in the black.
    if (S.open > 0) {
      c.save(); archPath(c, X0, TOP, DW, DH, SPRING); c.clip();
      const cx = W / 2, cy = TOP + DH * 0.55, a = S.open;
      // pale haze around the frame, like light behind fog
      const haze = c.createLinearGradient(0, TOP, 0, TOP + DH);
      haze.addColorStop(0, `rgba(150,190,140,${0.55 * a})`); haze.addColorStop(0.5, `rgba(90,110,90,${0.4 * a})`); haze.addColorStop(1, `rgba(60,50,70,${0.35 * a})`);
      c.fillStyle = haze; c.fillRect(X0, TOP, DW, DH);
      // a very slow, faint swirl in the dark
      const spin = time * 0.25;
      if (c.createConicGradient) {
        const cg = c.createConicGradient(spin, cx, cy);
        for (let i = 0; i <= 8; i++) cg.addColorStop(i / 8, i % 2 ? `rgba(80,40,110,${0.18 * a})` : `rgba(40,80,55,${0.18 * a})`);
        c.fillStyle = cg; c.fillRect(X0, TOP, DW, DH);
      }
      // the void: a soft, deep black shape swallowing the middle
      for (let i = 0; i < 4; i++) {
        const vg = c.createRadialGradient(cx, cy + 20, 10, cx, cy + 20, DW * (0.42 + i * 0.05));
        vg.addColorStop(0, `rgba(2,1,3,${0.95 * a})`); vg.addColorStop(0.65, `rgba(5,3,6,${0.7 * a})`); vg.addColorStop(1, "rgba(5,3,6,0)");
        c.fillStyle = vg; c.save(); c.translate(cx, cy); c.scale(1, 1.9 + Math.sin(time * 0.6 + i) * 0.04); c.translate(-cx, -cy);
        c.fillRect(X0 - 50, TOP - 50, DW + 100, DH + 100); c.restore();
      }
      // shadowed edges of the frame and a few drifting dust motes
      const edge = c.createRadialGradient(cx, cy, DW * 0.3, cx, cy, DH * 0.75);
      edge.addColorStop(0, "rgba(0,0,0,0)"); edge.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
      c.fillStyle = edge; c.fillRect(X0, TOP, DW, DH);
      for (let i = 0; i < 18; i++) {
        const mx = X0 + ((i * 97 + time * 6) % DW), my = TOP + ((i * 151 + time * (3 + i % 4)) % DH);
        c.fillStyle = `rgba(200,220,190,${0.25 * a})`; c.fillRect(mx, my, 1.2, 1.2);
      }
      c.restore();
    }
    // the leaf, hinged on the left, swinging towards the viewer in perspective strips
    const ang = S.open * Math.PI * 0.47;
    const STRIPS = 90, sw = DW / STRIPS;
    for (let i = 0; i < STRIPS; i++) {
      const u0 = i / STRIPS, u1 = (i + 1) / STRIPS;
      const [xa, ya, sa] = project(X0 + u0 * DW * Math.cos(ang), TOP, u0 * DW * Math.sin(ang));
      const [xb, , sb] = project(X0 + u1 * DW * Math.cos(ang), TOP, u1 * DW * Math.sin(ang));
      const [, yBot] = project(X0 + u0 * DW * Math.cos(ang), TOP + DH, u0 * DW * Math.sin(ang));
      const wpx = Math.max(0.6, xb - xa + 0.6);
      c.drawImage(leaf, i * sw * LR, 0, sw * LR + 1, DH * LR, xa, ya, wpx, yBot - ya);
    }
    // shade the leaf as it turns away from the light
    if (S.open > 0) {
      c.save();
      const [xe] = project(X0 + DW * Math.cos(ang), TOP, DW * Math.sin(ang));
      c.globalAlpha = S.cover * Math.sin(ang) * 0.45;
      c.fillStyle = "#000"; c.fillRect(X0 - 4, 0, xe - X0 + 8, H);
      c.restore();
      // light spilling around the leaf's edge
      const [xe2, ye2] = project(X0 + DW * Math.cos(ang), TOP, DW * Math.sin(ang));
      const eg = c.createLinearGradient(xe2, 0, xe2 + 60, 0);
      eg.addColorStop(0, `rgba(150,180,140,${0.18 * S.open})`); eg.addColorStop(1, "rgba(150,180,140,0)");
      c.fillStyle = eg; c.fillRect(xe2, ye2, 60, DH * 1.2);
    }
    // the ring pull: lifts (flattens towards us) and turns, while the door is still closed
    if (S.open < 0.12) {
      const rx = X0 + DW * 0.82, ry = TOP + 240;
      c.save();
      c.translate(rx, ry);
      c.rotate(-S.turn * 0.9);   // anticlockwise: unlocking, not locking
      const lift = S.lift;
      c.strokeStyle = "#1a1d24"; c.lineWidth = 6;
      c.beginPath(); c.ellipse(0, 26 - lift * 20, 18, 22 * (1 - lift * 0.65), 0, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = "rgba(180,190,210,0.35)"; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(-1, 25 - lift * 20, 17, 21 * (1 - lift * 0.65), 0, Math.PI * 1.1, Math.PI * 1.7); c.stroke();
      // twisted rope detail on the ring
      c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 1;
      for (let a = 0; a < Math.PI * 2; a += 0.35) { const ex = Math.cos(a) * 18, ey = 26 - lift * 20 + Math.sin(a) * 22 * (1 - lift * 0.65); c.beginPath(); c.moveTo(ex - 2, ey - 2); c.lineTo(ex + 2, ey + 2); c.stroke(); }
      c.restore();
    }
    c.restore();
    // final fade back in to the new room
    if (S.fade > 0) { c.fillStyle = `rgba(2,9,5,${S.fade})`; c.fillRect(0, 0, W, H); }
  }

  const ease = (k) => k * k * (3 - 2 * k);
  function to(key, val, ms, e = ease) {
    const from = S[key], t0 = performance.now();
    return new Promise((res) => (function step(now) {
      const k = Math.min(1, (now - t0) / ms);
      S[key] = from + (val - from) * e(k);
      k < 1 ? requestAnimationFrame(step) : res();
    })(t0));
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let running = false;
  function loop(now) { if (!running) return; draw(now / 1000); requestAnimationFrame(loop); }

  async function play(onMiddle) {
    Object.assign(S, { cover: 0, lift: 0, turn: 0, open: 0, push: 0, fade: 0 });
    cv.style.display = "block"; running = true; requestAnimationFrame(loop);
    await to("cover", 1, 300);
    await wait(250);
    await to("lift", 1, 420);                    // lift the ring
    await to("turn", 1, 320);                    // and turn it: click
    await wait(150);
    await to("open", 1, 1000, (k) => 1 - Math.pow(1 - k, 2.2)); // the door swings open
    await to("push", 1, 520, (k) => k * k);       // through the doorway
    S.fade = 1;
    if (onMiddle) onMiddle();
    S.cover = 0;
    await wait(80);
    await to("fade", 0, 420);
    running = false; cv.style.display = "none";
  }

  return { play };
})();

// ---------------------------------------------------------------------------
// STAIRFX: spiral staircase cutscene. Looking up a stone stairwell that winds
// around a central column; the camera climbs and turns, green sconces pass by,
// then it fades out onto the next floor. STAIRFX.play(onMiddle, up = true)
// ---------------------------------------------------------------------------
const STAIRFX = (() => {
  const W = 960, H = 576, RES = Math.min(4, (window.devicePixelRatio || 1) * 2);
  const cv = document.createElement("canvas");
  cv.width = W * RES; cv.height = H * RES;
  Object.assign(cv.style, { position: "absolute", left: "0", top: "0", width: W + "px", height: H + "px", pointerEvents: "none", display: "none" });
  document.getElementById("stage").appendChild(cv);
  const c = cv.getContext("2d");
  const S = { cover: 0, climb: 0, fade: 0, up: 1 };
  // A grey stone staircase seen from the bottom, rising away from you and curving
  // gently to the right into darkness. A red carpet runs up the middle. Black
  // footprints appear one by one climbing the stairs, then everything fades.
  // Seen from above and behind (a high, steep view down onto the treads) so the
  // footprints read clearly. Textures are pre-rendered at high resolution.
  const STEPS = 12, VX = W / 2 + 40, VY = 40;
  function patternCanvas(w, h, paint) { const cvp = document.createElement("canvas"); cvp.width = w * 2; cvp.height = h * 2; const g = cvp.getContext("2d"); g.scale(2, 2); paint(g, w, h); return cvp; }
  function crisp(p) { p.setTransform(new DOMMatrix().scaleSelf(2 / RES * (RES / 2) / 2 * 2 / 2)); return p; }
  let ps = 9; const pr = () => ((ps = (ps * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stoneP = c.createPattern(patternCanvas(256, 256, (g, w, h) => {
    g.fillStyle = "#6b6a72"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = pr(); g.fillStyle = v < 0.5 ? `rgba(0,0,0,${pr() * 0.12})` : `rgba(255,255,255,${pr() * 0.07})`; g.fillRect(pr() * w, pr() * h, 1 + pr() * 3, 1 + pr() * 3); }
    for (let i = 0; i < 6; i++) { g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1; g.beginPath(); let x = pr() * w, y = pr() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (pr() - 0.5) * 30; y += (pr() - 0.5) * 20; g.lineTo(x, y); } g.stroke(); }
  }), "repeat");
  const carpetP = c.createPattern(patternCanvas(96, 96, (g, w, h) => {
    g.fillStyle = "#6e1022"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#56091a";
    for (const [x, y] of [[48, 0], [0, 48], [96, 48], [48, 96]]) { g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x + 18, y); g.lineTo(x, y + 22); g.lineTo(x - 18, y); g.closePath(); g.fill(); }
    g.strokeStyle = "rgba(200,150,70,0.35)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(48, 30); g.lineTo(62, 48); g.lineTo(48, 66); g.lineTo(34, 48); g.closePath(); g.stroke();
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${pr() * 0.12})`; g.fillRect(pr() * w, pr() * h, 1, 1); }
  }), "repeat");
  const wallP = c.createPattern(patternCanvas(256, 256, (g, w, h) => {
    g.fillStyle = "#120c1a"; g.fillRect(0, 0, w, h);                       // mortar
    for (let y = 0, row = 0; y < h; y += 16, row++) for (let x = row % 2 ? -16 : 0; x < w; x += 32) {
      const base = [[42, 32, 56], [39, 29, 52], [46, 35, 62], [36, 27, 48]][Math.floor(pr() * 4)];
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(x + 1, y + 1, 30, 14);
      g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(x + 1, y + 1, 30, 1.5);   // lit top edge
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + 1, y + 13.5, 30, 1.5);      // shadowed bottom edge
      for (let k = 0; k < 22; k++) { g.fillStyle = `rgba(${pr() < 0.5 ? "0,0,0" : "255,255,255"},${pr() * 0.12})`; g.fillRect(x + 1 + pr() * 29, y + 1 + pr() * 13, 1, 1); }
      if (pr() < 0.12) { g.fillStyle = "rgba(40,90,55,0.35)"; g.fillRect(x + 1 + pr() * 20, y + 10, 8 + pr() * 10, 4); } // moss
    }
  }), "repeat");

  function stepQuad(i) {
    const p0 = i / STEPS, p1 = (i + 1) / STEPS;
    const ease2 = (k) => 1 - Math.pow(1 - k, 0.8);
    const e0 = ease2(p0), e1 = ease2(p1);
    const half = (e) => 330 * (1 - e) + 70;
    const curve = (e) => Math.pow(e, 2) * 90;
    const y = (e) => H + 30 - (H + 30 - VY) * e;
    return { e0, e1, xL0: VX - half(e0) + curve(e0), xR0: VX + half(e0) + curve(e0), xL1: VX - half(e1) + curve(e1), xR1: VX + half(e1) + curve(e1), y0: y(e0), y1: y(e1) };
  }
  // a clear shoe print (sole with tread lines, arch gap and heel), centred at (x, y)
  function shoePrint(x, y, sx, sy, left, alpha) {
    c.save(); c.translate(x, y); c.scale(sx * (left ? -1 : 1), sy); c.rotate(left ? 0.08 : 0.08);
    c.fillStyle = `rgba(8,6,8,${alpha})`;
    c.beginPath();                                                 // sole: toe box tapering into the arch
    c.moveTo(0, -1); c.bezierCurveTo(0.55, -1, 0.62, -0.45, 0.5, -0.1); c.bezierCurveTo(0.42, 0.15, 0.38, 0.2, 0.36, 0.25);
    c.lineTo(-0.3, 0.25); c.bezierCurveTo(-0.42, 0.05, -0.6, -0.4, -0.5, -0.75); c.bezierCurveTo(-0.42, -0.98, -0.2, -1, 0, -1); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(0.03, 0.62, 0.36, 0.3, 0, 0, Math.PI * 2); c.fill();   // heel
    c.strokeStyle = `rgba(90,20,30,${alpha * 0.6})`; c.lineWidth = 0.05;        // tread grooves (carpet shows through)
    for (let k = -0.85; k < 0.15; k += 0.16) { c.beginPath(); c.moveTo(-0.45, k); c.lineTo(0.5, k - 0.05); c.stroke(); }
    for (let k = 0.45; k < 0.85; k += 0.14) { c.beginPath(); c.moveTo(-0.28, k); c.lineTo(0.34, k); c.stroke(); }
    c.restore();
  }
  function draw(time) {
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.imageSmoothingQuality = "high";
    c.fillStyle = "#050406"; c.fillRect(0, 0, W, H);
    const drift = S.climb * 70 * S.up;
    c.save(); c.translate(0, drift);
    if (S.up < 0) { c.translate(W / 2, H); c.scale(1 + S.climb * 0.18, 1 + S.climb * 0.18); c.translate(-W / 2, -H); }
    // stone walls on either side, textured
    for (const side of [-1, 1]) {
      c.save();
      c.beginPath();
      if (side < 0) { c.moveTo(-10, -100); c.lineTo(VX - 70, VY - 40); c.lineTo(VX - 70, VY + 30); c.lineTo(-10, H + 60); }
      else { c.moveTo(W + 10, -100); c.lineTo(VX + 160, VY - 40); c.lineTo(VX + 160, VY + 30); c.lineTo(W + 10, H + 60); }
      c.closePath(); c.clip();
      c.fillStyle = wallP; c.fillRect(-20, -120, W + 40, H + 240);
      const sh = c.createLinearGradient(side < 0 ? 0 : W, 0, side < 0 ? VX - 70 : VX + 160, 0);
      sh.addColorStop(0, side < 0 ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.35)"); sh.addColorStop(1, "rgba(0,0,0,0.9)");
      c.fillStyle = sh; c.fillRect(-20, -120, W + 40, H + 240);
      c.restore();
    }
    for (const [lx, ly] of [[120, 230], [W - 140, 260]]) {     // green wall lanterns
      const f = 0.8 + 0.2 * Math.sin(time * 7 + lx) * Math.sin(time * 11 + lx);
      const g = c.createRadialGradient(lx, ly, 2, lx, ly, 150);
      g.addColorStop(0, `rgba(120,230,150,${0.3 * f})`); g.addColorStop(1, "rgba(60,160,100,0)");
      c.fillStyle = g; c.fillRect(lx - 160, ly - 160, 320, 320);
      c.fillStyle = "#0e0c12"; c.fillRect(lx - 11, ly - 20, 22, 36); c.fillRect(lx - 14, ly - 24, 28, 5);
      c.beginPath(); c.moveTo(lx - 12, ly - 24); c.lineTo(lx, ly - 36); c.lineTo(lx + 12, ly - 24); c.fill();
      c.fillStyle = `rgba(170,240,190,${0.35 * f})`; c.fillRect(lx - 8, ly - 17, 16, 30);
      c.fillStyle = `rgba(210,255,220,${f})`; c.beginPath(); c.ellipse(lx, ly - 2, 4, 8, 0, 0, Math.PI * 2); c.fill();
    }
    // steps, far to near
    for (let i = STEPS - 1; i >= 0; i--) {
      const q = stepQuad(i), light = 0.3 + (1 - i / STEPS) * 0.7;
      const riserH = (q.y0 - q.y1) * 0.22;
      // riser (going up we see them; going down they face away, so only a dark drop shows)
      c.save(); c.beginPath(); c.moveTo(q.xL0, q.y0); c.lineTo(q.xR0, q.y0); c.lineTo(q.xR0, q.y0 - riserH); c.lineTo(q.xL0, q.y0 - riserH); c.closePath();
      if (S.up > 0) { c.fillStyle = stoneP; c.fill(); c.fillStyle = `rgba(0,0,0,${0.55 + (1 - light) * 0.4})`; c.fill(); }
      else { c.fillStyle = "rgba(0,0,0,0.92)"; c.fill(); }
      c.restore();
      // tread
      c.save(); c.beginPath(); c.moveTo(q.xL0, q.y0 - riserH); c.lineTo(q.xR0, q.y0 - riserH); c.lineTo(q.xR1, q.y1); c.lineTo(q.xL1, q.y1); c.closePath();
      c.fillStyle = stoneP; c.fill(); c.fillStyle = `rgba(0,0,0,${0.25 + (1 - light) * 0.6})`; c.fill();
      c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 1; c.stroke(); c.restore();
      c.fillStyle = `rgba(220,215,230,${0.12 * light})`; c.fillRect(q.xL0, q.y0 - riserH - 1, q.xR0 - q.xL0, 1.5); // worn nosing
      // individual stone blocks: mortar seams across tread and riser (staggered per step)
      c.strokeStyle = `rgba(10,8,12,${0.7 * light})`; c.lineWidth = 1.2;
      for (let b = 1; b < 5; b++) {
        const u = b / 5 + (i % 2 ? 0.1 : 0);
        if (u >= 1) continue;
        const xa = q.xL0 + (q.xR0 - q.xL0) * u, xb = q.xL1 + (q.xR1 - q.xL1) * u;
        c.beginPath(); c.moveTo(xa, q.y0); c.lineTo(xa, q.y0 - riserH); c.lineTo(xb, q.y1); c.stroke();
      }
      // chipped corners and moss in the gaps
      c.fillStyle = `rgba(40,90,55,${0.25 * light})`; c.fillRect(q.xL0 + 4, q.y0 - riserH - 2, 14, 3); c.fillRect(q.xR0 - 22, q.y0 - riserH - 2, 12, 3);
      // carpet runner
      const cx0 = (q.xL0 + q.xR0) / 2, cw0 = (q.xR0 - q.xL0) * 0.46, cx1 = (q.xL1 + q.xR1) / 2, cw1 = (q.xR1 - q.xL1) * 0.46;
      c.save(); c.beginPath();
      c.moveTo(cx0 - cw0 / 2, q.y0); c.lineTo(cx0 + cw0 / 2, q.y0); c.lineTo(cx0 + cw0 / 2, q.y0 - riserH); c.lineTo(cx1 + cw1 / 2, q.y1); c.lineTo(cx1 - cw1 / 2, q.y1); c.lineTo(cx0 - cw0 / 2, q.y0 - riserH); c.closePath();
      c.fillStyle = carpetP; c.fill(); c.fillStyle = `rgba(0,0,0,${0.15 + (1 - light) * 0.65})`; c.fill(); c.restore();
      c.strokeStyle = `rgba(200,160,80,${0.7 * light})`; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx0 - cw0 / 2, q.y0); c.lineTo(cx0 - cw0 / 2, q.y0 - riserH); c.lineTo(cx1 - cw1 / 2, q.y1); c.stroke();
      c.beginPath(); c.moveTo(cx0 + cw0 / 2, q.y0); c.lineTo(cx0 + cw0 / 2, q.y0 - riserH); c.lineTo(cx1 + cw1 / 2, q.y1); c.stroke();
      const rodG = c.createLinearGradient(0, q.y0 - riserH - 3, 0, q.y0 - riserH + 3);
      rodG.addColorStop(0, `rgba(240,210,130,${0.9 * light})`); rodG.addColorStop(1, `rgba(120,90,40,${0.9 * light})`);
      c.fillStyle = rodG; c.fillRect(cx0 - cw0 / 2 - 6, q.y0 - riserH - 2.5, cw0 + 12, 5);
      for (const sx of [-1, 1]) { c.fillStyle = `rgba(200,170,90,${light})`; c.beginPath(); c.arc(cx0 + sx * (cw0 / 2 + 6), q.y0 - riserH, 3.5, 0, Math.PI * 2); c.fill(); }
    }
    // carved stone balustrade: a sloped handrail with balusters on each side
    for (const side of [0, 1]) {
      c.strokeStyle = "#0b090e"; c.lineWidth = 10;
      c.beginPath();
      for (let i = 0; i <= STEPS; i++) { const q = stepQuad(Math.min(i, STEPS - 1)); const x = side ? (i < STEPS ? q.xR0 : q.xR1) + 8 : (i < STEPS ? q.xL0 : q.xL1) - 8; const y = (i < STEPS ? q.y0 : q.y1) - 60 * (1 - (i / STEPS) * 0.7); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
      c.strokeStyle = "rgba(140,130,160,0.35)"; c.lineWidth = 2; c.stroke();
      for (let i = 0; i < STEPS; i++) {
        const q = stepQuad(i), light = 0.3 + (1 - i / STEPS) * 0.7;
        const x = side ? q.xR0 + 8 : q.xL0 - 8, yb = q.y0 - (q.y0 - q.y1) * 0.22, yt = q.y0 - 60 * (1 - (i / STEPS) * 0.7);
        const bw = 7 * (1 - i / STEPS * 0.6);
        const bg = c.createLinearGradient(x - bw, 0, x + bw, 0);
        bg.addColorStop(0, `rgba(30,27,35,${light})`); bg.addColorStop(0.4, `rgba(105,100,115,${light})`); bg.addColorStop(1, `rgba(25,22,30,${light})`);
        c.fillStyle = bg;
        c.beginPath(); c.moveTo(x - bw * 0.6, yb); c.quadraticCurveTo(x - bw * 1.3, (yb + yt) / 2 + 6, x - bw * 0.5, yt); c.lineTo(x + bw * 0.5, yt); c.quadraticCurveTo(x + bw * 1.3, (yb + yt) / 2 + 6, x + bw * 0.6, yb); c.closePath(); c.fill();
      }
    }
    // footprints climbing the carpet, alternating feet, fading behind
    const shown = S.climb * (STEPS - 1);
    for (let i = 0; i < Math.ceil(shown); i++) {
      const age = shown - i, alpha = Math.min(1, age * 2) * Math.max(0, 1 - (age - 3) / 3);
      if (alpha <= 0) continue;
      const q = stepQuad(i), riserH = (q.y0 - q.y1) * 0.22;
      const cx = ((q.xL0 + q.xR0) / 2 + (q.xL1 + q.xR1) / 2) / 2, tw = (q.xR0 - q.xL0);
      const treadH = q.y0 - riserH - q.y1;
      const left = i % 2 === 0;
      shoePrint(cx + (left ? -1 : 1) * tw * 0.075, q.y1 + treadH * 0.5, tw * 0.085, treadH * 0.62, left, 0.92 * alpha);
    }
    // darkness swallowing the top of the stairs
    const top = c.createLinearGradient(0, VY - 60, 0, VY + 230);
    top.addColorStop(0, "rgba(5,4,6,1)"); top.addColorStop(1, "rgba(5,4,6,0)");
    c.fillStyle = top; c.fillRect(0, -140, W, VY + 370);
    c.restore();
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.95);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.7)");
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    if (S.cover < 1) { c.fillStyle = `rgba(0,0,0,${1 - S.cover})`; c.fillRect(0, 0, W, H); }
    if (S.fade > 0) { c.fillStyle = `rgba(0,0,0,${S.fade})`; c.fillRect(0, 0, W, H); }
  }
  const ease = (k) => k * k * (3 - 2 * k);
  function to(key, val, ms, e = ease) {
    const from = S[key], t0 = performance.now();
    return new Promise((res) => (function step(now) { const k = Math.min(1, (now - t0) / ms); S[key] = from + (val - from) * e(k); k < 1 ? requestAnimationFrame(step) : res(); })(t0));
  }
  let running = false;
  function loop(now) { if (!running) return; draw(now / 1000); requestAnimationFrame(loop); }
  async function play(onMiddle, up = true) {
    Object.assign(S, { cover: 0, climb: 0, fade: 0, up: up ? 1 : -1 });
    cv.style.display = "block"; running = true; requestAnimationFrame(loop);
    await to("cover", 1, 500);
    await to("climb", 1, 3800, (k) => k);          // footprints climb the stairs
    await to("fade", 1, 700);
    if (onMiddle) onMiddle();
    await new Promise((r) => setTimeout(r, 120));
    running = false; cv.style.display = "none";
  }
  return { play };
})();
