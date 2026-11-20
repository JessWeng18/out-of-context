// stairs3d.js: the staircase cutscene as a low-poly 3D scene (same style as the
// game). A stone flight with a red carpet runner, brass rods, balusters and
// brick walls lit by green lanterns, seen from high above. Black shoe prints
// appear one step at a time, climbing (or descending), then everything fades.
// STAIRS3D.play(onMiddle, up, { blood }) - onMiddle runs while the screen is black.

(async () => {
  let THREE;
  try { THREE = await import("three"); } catch (e) { return; }
  const W = 960, H = 576;
  const wrap = document.createElement("div");
  Object.assign(wrap.style, { position: "absolute", left: "0", top: "0", width: W + "px", height: H + "px", background: "#000", opacity: "0", display: "none", pointerEvents: "none" });
  document.getElementById("stage").appendChild(wrap);
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { width: W + "px", height: H + "px", display: "block" });
  wrap.appendChild(canvas);
  const black = document.createElement("div");
  Object.assign(black.style, { position: "absolute", inset: "0", background: "#000", opacity: "0" });
  wrap.appendChild(black);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#030205");
  scene.fog = new THREE.Fog("#030205", 9, 22);
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 80);

  let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Two looks share the same flight: the house stairs (carpet, bannisters, brick, green lanterns) and
  // the attic stairs (bare boards, plank walls closing in, one failing bulb).
  const house = new THREE.Group(), attic = new THREE.Group(); scene.add(house, attic); attic.visible = false;
  let parent = scene;
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });
  function box(w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  // ----------------------------------------------------------- the flight
  // Steps run along -z (away from the bottom). Each step: rise 0.22, run 0.42.
  const N = 16, RISE = 0.22, RUN = 0.42, WIDTH = 3.0;
  // dark, worn oak treads (textured wood grain)
  function woodTex(base) {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
    const c = cv.getContext("2d");
    c.fillStyle = base; c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 60; i++) {
      c.strokeStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.15 + rnd() * 0.25})` : `rgba(150,110,80,${0.06 + rnd() * 0.1})`;
      c.lineWidth = 0.6 + rnd() * 1.6; const y = rnd() * 128;
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(80, y + (rnd() - 0.5) * 10, 170, y + (rnd() - 0.5) * 10, 256, y + (rnd() - 0.5) * 6); c.stroke();
    }
    for (let i = 0; i < 3; i++) { c.strokeStyle = "rgba(0,0,0,0.3)"; const kx = rnd() * 256, ky = rnd() * 128; for (let r = 3; r < 12; r += 3) { c.beginPath(); c.ellipse(kx, ky, r * 2, r, 0, 0, Math.PI * 2); c.stroke(); } }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const woodMats = ["#3a2418", "#33200f", "#402a1c", "#2e1c12"].map((b) => new THREE.MeshStandardMaterial({ map: woodTex(b), roughness: 0.9, metalness: 0 }));
  const stoneTones = null;
  const carpet = mat("#6e1022", { roughness: 1 }), carpetDark = mat("#4a0814", { roughness: 1 });
  const brass = mat("#b08a4a", { metalness: 0.6, roughness: 0.35 }), iron = mat("#18161c", { metalness: 0.4, roughness: 0.6 });
  const stepTop = (i) => (i + 1) * RISE;
  const stepZ = (i) => -i * RUN - RUN / 2;
  for (let i = 0; i < N; i++) {
    // stone blocks across each step (slightly uneven, low-poly)
    const blocks = 4;
    for (let b = 0; b < blocks; b++) {
      const bw = WIDTH / blocks, x = -WIDTH / 2 + bw * (b + 0.5); // solid, no gaps
      if (x + bw / 2 > WIDTH / 2 + 0.01) continue;
      const blk = box(bw - 0.03, RISE * (i + 1), RUN - 0.02, woodMats[(i * 3 + b) % 4], x, RISE * (i + 1) / 2, stepZ(i));
      blk.rotation.y = 0;
    }
    // a solid, flat oak tread board on top of every step, slightly overhanging the front
    box(WIDTH + 0.04, 0.05, RUN + 0.04, woodMats[(i + 1) % 4], 0, stepTop(i) - 0.02, stepZ(i) + 0.02);
    box(WIDTH + 0.05, 0.04, 0.06, mat("#4a3020", { roughness: 0.8 }), 0, stepTop(i) - 0.01, stepZ(i) + RUN / 2 - 0.02); // rounded oak nosing
    // carpet: tread + riser, brass rod with end caps
    parent = house;
    box(1.3, 0.025, RUN + 0.005, carpet, 0, stepTop(i) + 0.012, stepZ(i));
    box(1.3, RISE, 0.02, carpet, 0, stepTop(i) - RISE / 2, stepZ(i) + RUN / 2 + 0.005);
    parent = scene;
    // balusters on both sides
    for (const sx of [-1, 1]) {
      const pts = [[0, 0], [0.07, 0], [0.07, 0.05], [0.04, 0.1], [0.08, 0.3], [0.035, 0.55], [0.06, 0.65], [0.06, 0.7], [0, 0.7]];
      const bal = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 7), mat("#3a2418"));
      bal.position.set(sx * (WIDTH / 2 + 0.1), stepTop(i), stepZ(i)); bal.castShadow = true; house.add(bal);
    }
  }
  // sloped handrails
  const slope = Math.atan2(RISE, RUN), railLen = Math.hypot(N * RUN, N * RISE);
  parent = house;
  for (const sx of [-1, 1]) box(0.14, 0.09, railLen, mat("#2e1c12"), sx * (WIDTH / 2 + 0.1), N * RISE / 2 + 0.78, -N * RUN / 2, slope, 0, 0);
  parent = scene;
  // the floor at the bottom and darkness at the top
  box(WIDTH + 3, 0.05, 3, mat("#3b2635"), 0, -0.02, 1.4);
  box(WIDTH + 1, 0.05, 2.5, mat("#3a3840"), 0, N * RISE, -N * RUN - 1.2);
  // the runner carries on across the floor below and the landing above, so it never just stops at the stairs
  parent = house;
  box(1.3, 0.025, 2.9, carpet, 0, 0.018, 1.45);
  box(1.3, 0.025, 2.45, carpet, 0, N * RISE + 0.038, -N * RUN - 1.2);
  for (const sx of [-1, 1]) { box(0.05, 0.027, 2.9, carpetDark, sx * 0.625, 0.019, 1.45); box(0.05, 0.027, 2.45, carpetDark, sx * 0.625, N * RISE + 0.039, -N * RUN - 1.2); }
  parent = scene;

  // brick walls on both sides (instanced, low-poly), following the slope
  const brickTones = ["#2c2236", "#291f33", "#30253c", "#261d30"];
  parent = house;
  // Rough-hewn stone instead of neat bricks: courses of uneven height, stones of uneven length, chipped
  // corners and lumpy faces, with dark gaps between them.
  {
    const hash = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
    const variants = [];
    for (let v = 0; v < 12; v++) {                                  // a dozen lumpy unit stones, reused at different sizes
      const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 4), pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = v * 13.7;
        const corner = Math.abs(y) > 0.49 && Math.abs(z) > 0.49 ? 1 : 0;           // corners get knocked off harder
        const j = (ax) => (hash(x + k + ax, y - k, z + ax * 3) - 0.5);
        pos.setXYZ(i, x + j(1) * 0.16, y + j(2) * (0.04 + corner * 0.08) - Math.sign(y) * corner * 0.07, z + j(3) * (0.015 + corner * 0.03) - Math.sign(z) * corner * 0.03);
      }
      geo.computeVertexNormals(); variants.push(geo);
    }
    const tones = ["#2c2236", "#261d30", "#342a40", "#221a2a", "#3a3046", "#2e2634"].map((c) => mat(c, { roughness: 1 }));
    for (const sx of [-1, 1]) {
      const wallX = sx * (WIDTH / 2 + 0.6);
      let y = -0.4;
      while (y < 6.4) {
        const h = 0.17 + rnd() * 0.15;                               // each course a different height
        let z = 1.9 + rnd() * 0.4;
        while (z > -7.6) {
          const len = 0.28 + rnd() * 0.62, zc = z - len / 2;         // long slabs next to short blocks
          z -= len + 0.015 + rnd() * 0.03;
          if (y + h / 2 > -zc * RISE / RUN + 2.3) continue;
          const st = new THREE.Mesh(variants[Math.floor(rnd() * variants.length)], tones[Math.floor(rnd() * tones.length)]);
          st.scale.set(0.2 + rnd() * 0.09, h * (0.86 + rnd() * 0.1), len);
          st.position.set(wallX - sx * rnd() * 0.05, y + h / 2 + (rnd() - 0.5) * 0.02, zc);     // some stand proud of the wall
          st.rotation.set((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.05);
          st.castShadow = st.receiveShadow = true; house.add(st);
        }
        y += h + 0.012;
      }
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 9, 11), new THREE.MeshBasicMaterial({ color: "#040306" })); backing.position.set(wallX + sx * 0.12, 3, -2.8); house.add(backing);   // darkness in the gaps
    }
  }
  parent = scene;
  // ------------------------------------------------------------ the attic look
  parent = attic;
  const plankMats = ["#2a1a10", "#33200f", "#24160c", "#3a2616", "#1e120a"].map((b) => new THREE.MeshStandardMaterial({ map: woodTex(b), roughness: 1, metalness: 0 }));
  for (const sx of [-1, 1]) {
    for (let col = 0; col < 40; col++) {                                        // rough vertical boards, close on both sides
      if (rnd() < 0.07) continue;                                               // a board missing here and there
      const z = 1.7 - col * 0.25, base = Math.max(0, -z * RISE / RUN) - 0.4, hgt = 3.6 + rnd() * 0.5;
      const bd = box(0.07, hgt, 0.235, plankMats[Math.floor(rnd() * 5)], sx * (WIDTH / 2 + 0.16 + rnd() * 0.03), base + hgt / 2, z);
      bd.rotation.x = (rnd() - 0.5) * 0.03; bd.rotation.z = (rnd() - 0.5) * 0.02;
    }
    for (let k = 0; k < 4; k++) { const z = 0.6 - k * 2.0; box(0.06, 0.2, 2.4, plankMats[0], sx * (WIDTH / 2 + 0.1), -z * RISE / RUN + 1.5, z - 0.4, slope + (k % 2 ? 0.5 : -0.5), 0, 0); }   // cross braces
    box(0.1, 0.12, railLen, plankMats[3], sx * (WIDTH / 2 + 0.06), N * RISE / 2 + 0.9, -N * RUN / 2, slope, 0, 0);               // a plain rough handrail
  }
  box(WIDTH + 0.6, 0.06, 2.6, plankMats[1], 0, 0.0, 1.4);                                                                        // bare boards at the foot
  box(WIDTH + 0.6, 0.06, 2.6, plankMats[2], 0, N * RISE + 0.01, -N * RUN - 1.2);                                                 // and at the top
  // one bare bulb on a cord, failing
  const atticBulb = new THREE.PointLight("#ff9440", 6, 7, 1.7); atticBulb.position.set(0.5, 3.9, -3.0); attic.add(atticBulb);
  const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffc070" })); bulbMesh.position.copy(atticBulb.position); attic.add(bulbMesh);
  box(0.012, 2.4, 0.012, mat("#050404"), 0.5, 5.15, -3.0);
  const atticFar = new THREE.PointLight("#6a2a18", 2.2, 5, 1.8); atticFar.position.set(-0.6, N * RISE + 1.4, -N * RUN + 0.6); attic.add(atticFar);   // a dull red glow from the top
  parent = scene;
  // green iron lanterns on the walls
  const flames = [];
  for (const [sx, zz] of [[-1, -1.2], [1, -3.4], [-1, -5.4]]) {
    const L = new THREE.Group(); L.position.set(sx * (WIDTH / 2 + 0.45), -zz * 0 + (-zz) * RISE / RUN + 1.6, zz); house.add(L);
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.02), iron); p.position.set(ax * 0.09, 0, az * 0.09); L.add(p); }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.16, 4), iron); top.rotation.y = Math.PI / 4; top.position.y = 0.24; L.add(top);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.16), new THREE.MeshStandardMaterial({ color: "#7bd389", emissive: "#3fae6a", emissiveIntensity: 1.1, transparent: true, opacity: 0.55 })); L.add(glass);
    const light = new THREE.PointLight("#5fe08a", 3.2, 6, 1.6); light.position.set(-sx * 0.3, 0, 0); L.add(light);
    flames.push(light);
  }
  const amb = new THREE.AmbientLight("#3a2c55", 1.2); scene.add(amb);
  const key = new THREE.DirectionalLight("#b9a8e0", 0.9); key.position.set(-3, 10, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8; scene.add(key);

  // ------------------------------------------------------------ footprints
  const shoe = new THREE.Shape();
  shoe.moveTo(0, -0.11); shoe.bezierCurveTo(0.055, -0.11, 0.062, -0.05, 0.05, -0.01); shoe.bezierCurveTo(0.042, 0.015, 0.038, 0.02, 0.036, 0.025);
  shoe.lineTo(-0.03, 0.025); shoe.bezierCurveTo(-0.042, 0.005, -0.06, -0.04, -0.05, -0.075); shoe.bezierCurveTo(-0.042, -0.1, -0.02, -0.11, 0, -0.11);
  const heel = new THREE.Shape(); heel.absellipse(0.003, 0.065, 0.036, 0.03, 0, Math.PI * 2);
  const printMat = new THREE.MeshBasicMaterial({ color: "#050304", transparent: true, opacity: 0, depthWrite: false });
  const prints = [];
  for (let i = 0; i < N - 1; i++) {
    const g = new THREE.Group();
    const m = printMat.clone();
    for (const sh of [shoe, heel]) { const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); mesh.rotation.x = -Math.PI / 2; g.add(mesh); }
    // tread grooves
    for (let k = 0; k < 5; k++) { const gr = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.006), new THREE.MeshBasicMaterial({ color: "#5a1220", transparent: true, opacity: 0, depthWrite: false })); gr.rotation.x = -Math.PI / 2; gr.position.set(0, 0.001, -0.09 + k * 0.022); g.add(gr); }
    g.scale.setScalar(2.2);
    const left = i % 2 === 0;
    g.position.set(left ? -0.16 : 0.16, stepTop(i) + 0.03, stepZ(i) + 0.02);
    if (left) g.scale.x *= -1;
    scene.add(g); prints.push(g);
  }
  function setPrintOpacity(g, a) { g.children.forEach((c, k) => { c.material.opacity = k < 2 ? a * 0.92 : a * 0.6; }); }

  // ------------------------------------------------------------ bloodstains (attic stairs only)
  const blood = new THREE.Group(); blood.visible = false; scene.add(blood);
  {
    let sd = 7; const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    const bm = (o) => new THREE.MeshBasicMaterial({ color: ["#3a060a", "#28040a", "#4a080e"][Math.floor(r() * 3)], transparent: true, opacity: o, depthWrite: false });
    const flat = (geo, m, x, y, z, ry = 0) => { const me = new THREE.Mesh(geo, m); me.rotation.set(-Math.PI / 2, 0, ry); me.position.set(x, y, z); blood.add(me); return me; };
    for (let i = 1; i < N - 1; i++) {
      if (r() < 0.3) continue;
      const y = stepTop(i) + 0.034, z = stepZ(i), x = (r() - 0.5) * WIDTH * 0.75;
      const blot = flat(new THREE.CircleGeometry(0.1 + r() * 0.14, 9), bm(0.75 + r() * 0.2), x, y, z + (r() - 0.5) * 0.15, r() * 3); blot.scale.set(1 + r() * 0.8, 0.5 + r() * 0.5, 1);
      for (let k = 0; k < 2 + Math.floor(r() * 5); k++) flat(new THREE.CircleGeometry(0.015 + r() * 0.035, 6), bm(0.8), x + (r() - 0.5) * 0.7, y, z + (r() - 0.5) * 0.3);   // spatter
      if (r() < 0.45) { const drip = new THREE.Mesh(new THREE.PlaneGeometry(0.03 + r() * 0.03, RISE * (0.4 + r() * 0.6)), bm(0.8)); drip.position.set(x + (r() - 0.5) * 0.2, stepTop(i) - RISE * 0.3, z + RUN / 2 + 0.006); blood.add(drip); }   // running down the riser
    }
    // one long drag mark, as if something was pulled up the flight
    for (let i = 3; i < 11; i++) { const sm = flat(new THREE.PlaneGeometry(0.16 + r() * 0.1, RUN * 0.95), bm(0.4 + r() * 0.25), -0.75 + Math.sin(i * 0.7) * 0.12, stepTop(i) + 0.033, stepZ(i)); sm.scale.x = 0.7 + r() * 0.6; }
    // two smeared handprints on the treads
    for (const [i, x] of [[5, 0.9], [9, -1.0]]) { flat(new THREE.CircleGeometry(0.09, 8), bm(0.8), x, stepTop(i) + 0.035, stepZ(i)); for (let f = 0; f < 4; f++) { const fg = flat(new THREE.PlaneGeometry(0.03, 0.13), bm(0.8), x - 0.06 + f * 0.04, stepTop(i) + 0.035, stepZ(i) - 0.14, (f - 1.5) * -0.12); } }
  }

  // ---------------------------------------------------------------- play
  const S = { t: 0, up: true };
  function frame(now) {
    const time = now / 1000;
    // On the house stairs the lanterns gutter: short stutters all the way up, and twice they nearly go out,
    // leaving the flight dark for a moment before they catch again.
    let dip = 1;
    if (!attic.visible) {
      // steady light most of the way, with three short bursts of flicker well apart; the middle one ends in darkness
      const k = S.t, burst = (k > 0.14 && k < 0.21) || (k > 0.46 && k < 0.56) || (k > 0.8 && k < 0.87);
      const out = k > 0.56 && k < 0.63;
      dip = out ? 0.02 : burst ? (Math.sin(time * 24) > 0.1 ? 0.75 : 0.08) : 1;
      amb.intensity = 1.2 * (0.1 + 0.9 * dip); key.intensity = 0.9 * (0.06 + 0.94 * dip);
    }
    for (const l of flames) l.intensity = (2.8 + Math.sin(time * 9 + l.id) * Math.sin(time * 13.7) * 0.6) * dip;
    if (attic.visible) { const dead = Math.sin(time * 2.3) > 0.9; const f = dead ? 0.06 : 0.7 + 0.3 * Math.sin(time * 23) * Math.sin(time * 6.1); atticBulb.intensity = 6 * f; bulbMesh.material.color.setScalar(0.15 + 0.85 * f).multiply(new THREE.Color("#ffc070")); }
    const k = S.t;                                    // 0..1 progress
    const shown = k * (N - 1);
    prints.forEach((g, i) => {
      const idx = S.up ? i : N - 2 - i;              // going down: prints appear from the top step downwards
      const age = shown - idx;
      const a = age <= 0 ? 0 : Math.min(1, age * 2) * Math.max(0, 1 - (age - 3.5) / 3);
      setPrintOpacity(g, a);
      g.rotation.y = S.up ? Math.PI : 0;             // toes point the way you walk (shape toes face +z by default)
    });
    // high overhead camera, gliding along the flight
    const along = S.up ? k : 1 - k;
    const zc = -along * (N - 4) * RUN - 0.5, yc = along * (N - 4) * RISE;
    // going up: from behind and above, looking up the flight; going down: from above the top, looking down it
    if (S.up) { camera.position.set(0.6, yc + 7.2, zc + 2.6); camera.lookAt(0, yc + 0.4, zc - 0.8); }
    else { camera.position.set(-0.6, yc + 9.0, zc - 1.4); camera.lookAt(0, yc - 0.4, zc + 1.0); }
    renderer.render(scene, camera);
  }
  let running = false;
  function loop(now) { if (!running) return; frame(now); requestAnimationFrame(loop); }
  const tween = (el, to, ms) => new Promise((r) => { el.style.transition = `opacity ${ms}ms ease`; requestAnimationFrame(() => (el.style.opacity = String(to))); setTimeout(r, ms); });
  async function play(onMiddle, up = true, opts = {}) {
    S.t = 0; S.up = up; blood.visible = !!opts.blood;
    const isAttic = !!opts.attic;                                          // swap the whole look
    attic.visible = isAttic; house.visible = !isAttic;
    amb.color.set(isAttic ? "#2a1c12" : "#3a2c55"); amb.intensity = isAttic ? 0.5 : 1.2;
    key.color.set(isAttic ? "#6a4a30" : "#b9a8e0"); key.intensity = isAttic ? 0.22 : 0.9;
    scene.fog.color.set(isAttic ? "#020100" : "#030205"); scene.fog.near = isAttic ? 5 : 9; scene.fog.far = isAttic ? 15 : 22; scene.background.set(isAttic ? "#020100" : "#030205");
    wrap.style.display = "block"; black.style.opacity = "0"; running = true; requestAnimationFrame(loop);
    await tween(wrap, 1, 500);
    const t0 = performance.now(), dur = 4200;
    await new Promise((r) => (function step(now) { S.t = Math.min(1, (now - t0) / dur); S.t < 1 ? requestAnimationFrame(step) : r(); })(t0));
    await tween(black, 1, 700);
    if (onMiddle) onMiddle();
    running = false; wrap.style.display = "none"; wrap.style.opacity = "0";
  }
  window.STAIRS3D = { play };
})();
