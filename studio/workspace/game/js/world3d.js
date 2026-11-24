// world3d.js: stylized low-poly 3D renderer for gameplay.
//
// The game logic (movement, collision, objects, dialogue) still lives in
// engine.js and works in 2D tile space. This file builds a 3D "dollhouse" from
// the same map and objects and draws it with Three.js: 1 tile = 1 world unit,
// x -> x, y (down the map) -> z. Back walls are tall, front walls are cut low so
// the camera can see into rooms.

(async () => {
  let THREE, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass;
  try {
    THREE = await import("three");
    ({ EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js"));
    ({ RenderPass } = await import("three/addons/postprocessing/RenderPass.js"));
    ({ UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js"));
    ({ ShaderPass } = await import("three/addons/postprocessing/ShaderPass.js"));
    ({ OutputPass } = await import("three/addons/postprocessing/OutputPass.js"));
  } catch (e) {
    console.warn("Three.js unavailable: the manor can't be drawn.", e);
    window.WORLD3D_FAILED = true;
    return;
  }

  const G = GAME, MAP = G._map, OBJECTS = G._objectList, NPCS = G._npcs, P = G._player, S = G._S;
  const TILE = 16;
  const OUT_W = 960, OUT_H = 576;

  // ------------------------------------------------------------- renderer
  const stage = document.getElementById("stage");
  const canvas = document.createElement("canvas");
  canvas.id = "world3d";
  stage.insertBefore(canvas, document.getElementById("view"));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(OUT_W, OUT_H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#000000");
  scene.fog = new THREE.FogExp2("#000000", 0.022);
  const camera = new THREE.PerspectiveCamera(42, OUT_W / OUT_H, 0.1, 120);

  // ------------------------------------------------------------- helpers
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
  const glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 1 });
  function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    if (parent) parent.add(mesh);
    return mesh;
  }
  function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, parent, seg = 8) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    if (parent) parent.add(mesh);
    return mesh;
  }
  function canvasTex(w, h, draw, repeat = 1) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat); t.anisotropy = 4;
    return t;
  }
  // One group per room: only the room you're in is shown. Anything on a
  // boundary (walls, doorways) is added to every room it touches.
  const roomGroups = MAP.rooms.map(() => { const g = new THREE.Group(); g.visible = false; scene.add(g); return g; });
  function roomsNear(x, y) {
    const out = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const r = MAP.roomAt(x + dx, y + dy); if (r >= 0) out.add(r); }
    return [...out];
  }
  // Two random streams. Everything in the original house draws from the first, in a fixed order, so its
  // randomized details (book spines, grain, cobwebs) never change. Anything added later is marked `extra`
  // and draws from the second, so adding it cannot reshuffle the rest of the house.
  let seed = 11, seedX = 7919, useX = false;
  const rnd = () => (useX ? (seedX = (seedX * 1664525 + 1013904223) >>> 0) : (seed = (seed * 1664525 + 1013904223) >>> 0)) / 4294967296;

  // --------------------------------------------------------------- floors
  const FLOOR = {
    attic: canvasTex(256, 256, (c, w, h) => {                 // wide, bare, dried-out boards (no purple here)
      c.fillStyle = "#1c130d"; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        c.fillStyle = ["#33241a", "#2b1e15", "#3a2a1e", "#2f2118"][(y / 32) % 4]; c.fillRect(0, y, w, 30);
        for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.16})`; c.fillRect(rnd() * w, y + rnd() * 29, 20 + rnd() * 70, 1); }
        for (let i = 0; i < 5; i++) { c.fillStyle = `rgba(150,120,90,${0.05 + rnd() * 0.07})`; c.fillRect(rnd() * w, y + rnd() * 29, 14 + rnd() * 40, 1); }
        const jx = (y * 53) % w; c.fillStyle = "#0c0705"; c.fillRect(jx, y, 2, 30);                                   // board ends
        for (const nx of [jx + 6, jx - 6]) { c.fillStyle = "#07050a"; c.beginPath(); c.arc((nx + w) % w, y + 6, 1.6, 0, 7); c.arc((nx + w) % w, y + 24, 1.6, 0, 7); c.fill(); }   // nail heads
      }
    }),
    wood: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = "#3b2635"; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        c.fillStyle = y % 32 ? "#432b3c" : "#3f2838"; c.fillRect(0, y, w, 15);
        c.fillStyle = "#24161f"; c.fillRect(0, y + 15, w, 1);
        c.fillRect((y * 37) % w, y, 1, 15);
        for (let i = 0; i < 8; i++) { c.fillStyle = "rgba(0,0,0,0.12)"; c.fillRect(rnd() * w, y + rnd() * 14, 10 + rnd() * 20, 1); }
      }
    }),
    runner: canvasTex(256, 256, (c, w, h) => {
      // the original diamond runner, in deep red with gold diamonds and gold border stripes
      c.fillStyle = "#1a0608"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#5a0e18"; c.fillRect(0, 22, w, 212);
      for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = "#b8903a"; c.fillRect(0, 28, w, 5); c.fillRect(0, 223, w, 5);
      c.fillStyle = "#6a4a1c"; c.fillRect(0, 36, w, 2); c.fillRect(0, 218, w, 2);
      for (let x = 0; x < w; x += 32) {
        c.fillStyle = "#3a0810"; c.beginPath(); c.moveTo(x + 16, 88); c.lineTo(x + 32, 128); c.lineTo(x + 16, 168); c.lineTo(x, 128); c.closePath(); c.fill();
      }
    }),
    tile: canvasTex(512, 512, (c, w, h) => {
      // black and cream marble squares laid on the diagonal, with veining
      const S2 = w / 4;
      c.save(); c.translate(w / 2, h / 2); c.rotate(Math.PI / 4); c.translate(-w, -h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const dark = (x + y) % 2 === 0, px = x * S2 * 0.7071 * 2 / 1.4142, py = y * S2;
        const X = x * S2, Y = y * S2;
        c.fillStyle = dark ? "#121012" : "#d9cfbd"; c.fillRect(X, Y, S2, S2);
        for (let v = 0; v < 4; v++) {                 // marble veins
          c.strokeStyle = dark ? `rgba(230,225,215,${0.15 + rnd() * 0.25})` : `rgba(120,105,90,${0.12 + rnd() * 0.2})`;
          c.lineWidth = 0.6 + rnd() * 1.4;
          c.beginPath(); let vx = X + rnd() * S2, vy = Y; c.moveTo(vx, vy);
          for (let k = 0; k < 6; k++) { vx += (rnd() - 0.4) * S2 * 0.35; vy += S2 / 6; c.lineTo(vx, vy); }
          c.stroke();
        }
        c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1.2; c.strokeRect(X, Y, S2, S2); // grout
      }
      c.restore();
    }),
    stone: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = "#24202c"; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = ["#2e2938", "#2a2533", "#332d3f"][i % 3]; c.fillRect(rnd() * w, rnd() * h, 14 + rnd() * 24, 10 + rnd() * 14); }
    }),
    straw: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = "#3a3020"; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { c.strokeStyle = ["#6b5a33", "#55472a", "#7d6a3d"][i % 3]; c.beginPath(); const x = rnd() * w, y = rnd() * h, a = rnd() * 3; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); c.stroke(); }
    }),
  };
  FLOOR.books = FLOOR.wood;
  const floorMats = {};
  for (const [k, t] of Object.entries(FLOOR)) floorMats[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });

  // Each room gets one continuous floor plane (textures repeat across it);
  // doorway tiles get small stone planes; the hallway gets a red runner rug.
  const roomTile = new Int8Array(MAP.W * MAP.H).fill(-1);
  MAP.rooms.forEach((r, i) => {
    const t = (FLOOR[r.floor] || FLOOR.stone).clone();
    t.needsUpdate = true; t.repeat.set(r.w / 2, r.h / 2);
    const m = new THREE.MeshStandardMaterial({ map: r.floor === "runner" ? FLOOR.wood.clone() : t, roughness: r.floor === "tile" ? 0.55 : 0.9, metalness: 0 }); // satin marble: no mirror-like glints // polished marble in the bathroom
    if (r.floor === "runner") { m.map.needsUpdate = true; m.map.repeat.set(r.w / 2, r.h / 2); }
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h).rotateX(-Math.PI / 2), m);
    plane.position.set(r.x + r.w / 2, 0, r.y + r.h / 2); plane.receiveShadow = true; roomGroups[i].add(plane);
    if (r.floor === "runner") {
      const rt = FLOOR.runner.clone(); rt.needsUpdate = true; rt.repeat.set((r.w - 1) / 4.6, 1);
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 1, 4.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rt, roughness: 1 })); // wide runner
      rug.position.set(r.x + r.w / 2, 0.01, r.y + r.h / 2); rug.receiveShadow = true; roomGroups[i].add(rug);
    }
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomTile[y * MAP.W + x] = i;
  });
  const doorTiles = [];
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) if (!MAP.isWall(x, y) && roomTile[y * MAP.W + x] < 0) doorTiles.push([x, y]);
  {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (const [x, y] of doorTiles) {
      // a doorway tile belongs to every room within a couple of tiles of it
      const rs = new Set();
      for (let d = -3; d <= 3; d++) for (const [ax, ay] of [[x + d, y], [x, y + d]]) { const r = MAP.roomAt(ax, ay); if (r >= 0) rs.add(r); }
      for (const r of rs) { const m = new THREE.Mesh(geo, floorMats.wood); m.position.set(x + 0.5, 0, y + 0.5); m.receiveShadow = true; roomGroups[r].add(m); }
    }
  }

  // ---------------------------------------------------------------- walls
  const wallTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#1c1428"; c.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h; y += 16, row++) for (let x = row % 2 ? -16 : 0; x < w; x += 32) {
      c.fillStyle = ["#2a2038", "#271d34", "#2e2340"][Math.floor(rnd() * 3)]; c.fillRect(x + 1, y + 1, 30, 14);
      c.fillStyle = "rgba(255,255,255,0.04)"; c.fillRect(x + 1, y + 1, 30, 2);
    }
  });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
  const capMat = mat("#3a2d4e");
  const slabCap = mat("#1d1528");
  const walls = { back: [], side: [], front: [] };
  // Every wall tile is drawn so there are no gaps: tiles facing a room from the
  // north (and their corners) are tall back walls, side walls are mid-height,
  // and everything else (front walls, the solid mass between rooms) is a low
  // dark slab, so the camera can always see into rooms.
  const fl = (x, y) => x >= 0 && y >= 0 && x < MAP.W && y < MAP.H && !MAP.isWall(x, y);
  // wall tiles beyond the staircases are left out: the stairs fade into darkness instead
  const STAIR_VOID = (G._stairs || []).map((st) => st.label === "up" ? { x0: st.zone.x + st.zone.w, x1: st.zone.x + st.zone.w + 1, y0: st.zone.y - 1, y1: st.zone.y + st.zone.h } : { x0: st.zone.x - 1, x1: st.zone.x - 1, y0: st.zone.y - 1, y1: st.zone.y + st.zone.h });
  const inVoid = (x, y) => STAIR_VOID.some((v) => x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1);
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
    if (!MAP.isWall(x, y) || inVoid(x, y)) continue;
    if (fl(x, y + 1) || fl(x - 1, y + 1) || fl(x + 1, y + 1)) walls.back.push([x, y]);
    else if ((fl(x + 1, y) || fl(x - 1, y)) && !fl(x, y - 1)) walls.side.push([x, y]);
    else walls.front.push([x, y]);
  }
  const WALL_H = { back: 3.8, side: 2.6, front: 0.35 }; // tall gothic ceilings // only one room shows at a time, so walls can stand tall
  // split each wall kind by the room(s) it borders
  // past the staircases the house fades into darkness: no wall blocks drawn there
  const HALL = MAP.rooms.findIndex((r) => r.id === "hallway"), LAND = MAP.rooms.findIndex((r) => r.id === "landing");
  const STAIR_UP = (G._stairs || []).find((st) => st.label === "up"), STAIR_DN = (G._stairs || []).find((st) => st.label === "down");
  function stairVoid(r, x, y) {
    if (r === HALL && STAIR_UP && x >= STAIR_UP.zone.x) return true;
    if (r === LAND && STAIR_DN && x <= STAIR_DN.zone.x) return true;
    return false;
  }
  const wallSets = [];
  for (const [kind, list] of Object.entries(walls)) {
    const byRoom = MAP.rooms.map(() => []);
    for (const [x, y] of list) for (const r of roomsNear(x, y)) { if (!stairVoid(r, x, y)) byRoom[r].push([x, y]); }
    byRoom.forEach((l, r) => {
      if (!l.length) return;
      // walls on the camera side of a room (its south edge, e.g. doorway jambs) stay low
      const south = MAP.rooms[r].y + MAP.rooms[r].h;
      const near = l.filter(([, y]) => y < south), far = l.filter(([, y]) => y >= south);
      if (near.length) wallSets.push([kind, near, r]);
      if (far.length) wallSets.push(["front", far, r]);
    });
  }
  for (const [kind, list, room] of wallSets) {
    const h = WALL_H[kind];
    const geo = new THREE.BoxGeometry(1.001, h, 1.001); // tiny overlap avoids hairline seams
    const inst = new THREE.InstancedMesh(geo, wallMat, list.length);
    const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.08, 1.0), kind === "front" ? slabCap : capMat, list.length);
    const mx = new THREE.Matrix4();
    list.forEach(([x, y], i) => {
      mx.makeTranslation(x + 0.5, h / 2, y + 0.5); inst.setMatrixAt(i, mx);
      mx.makeTranslation(x + 0.5, h + 0.04, y + 0.5); cap.setMatrixAt(i, mx);
    });
    inst.castShadow = kind !== "front"; inst.receiveShadow = true;
    roomGroups[room].add(inst, cap);
  }
  // fill the notch where a tall back-wall corner meets a shorter side wall: raise the first side-wall
  // block under each back corner to full height so the corner reads as one solid pillar
  MAP.rooms.forEach((room, r) => {
    for (const cx of [room.x - 1, room.x + room.w]) {
      const cy = room.y - 1;
      if (!MAP.isWall(cx, cy) || !MAP.isWall(cx, cy + 1) || stairVoid(r, cx, cy + 1)) continue;
      const dh = WALL_H.back - WALL_H.side;
      const fill = new THREE.Mesh(new THREE.BoxGeometry(1.001, dh, 1.001), wallMat); fill.position.set(cx + 0.5, WALL_H.side + dh / 2, cy + 1.5); fill.castShadow = true;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.0), capMat); top.position.set(cx + 0.5, WALL_H.back + 0.04, cy + 1.5);
      roomGroups[r].add(fill, top);
    }
  });
  // baseboard trim along back walls
  const trimMat = mat("#3d2a24");
  // ornate trim on back walls: skirting, dark wood wainscoting with a carved rail,
  // and a stepped crown moulding with dentils under the ceiling line
  {
    const perRoom = MAP.rooms.map(() => []);
    for (const [x, y] of walls.back) for (const r of roomsNear(x, y)) if (!stairVoid(r, x, y) && y < MAP.rooms[r].y + MAP.rooms[r].h) perRoom[r].push([x, y]); // trim only on walls behind the room
    const panelM = new THREE.MeshStandardMaterial({ color: "#2a1810", roughness: 0.85 }), railM = mat("#3d2416"), crownM = mat("#4a3c5c"), crownDark = mat("#2e2440");
    const parts = [
      // [geometry, material, y, zOffset, perTile copies (x offsets)]
      [new THREE.BoxGeometry(1.001, 0.18, 0.06), trimMat, 0.09, 1.03, [0]],
      [new THREE.BoxGeometry(1.001, 0.82, 0.035), panelM, 0.5, 1.02, [0]],          // wainscot panel
      [new THREE.BoxGeometry(0.42, 0.6, 0.02), mat("#1c0f09"), 0.5, 1.04, [-0.24, 0.24]], // recessed panel insets
      [new THREE.BoxGeometry(1.001, 0.07, 0.08), railM, 0.93, 1.04, [0]],            // chair rail
      [new THREE.BoxGeometry(1.001, 0.1, 0.12), crownDark, 3.62, 1.05, [0]],          // crown: lower step
      [new THREE.BoxGeometry(1.001, 0.08, 0.2), crownM, 3.72, 1.08, [0]],             // crown: upper step
      [new THREE.BoxGeometry(0.08, 0.07, 0.07), crownM, 3.55, 1.04, [-0.375, -0.125, 0.125, 0.375]], // dentils
    ];
    // faded tone-on-tone damask wallpaper between the wainscot and the crown moulding
    function damask(base, ink) {
      return canvasTex(256, 400, (c, W2, H2) => {
        c.fillStyle = base; c.fillRect(0, 0, W2, H2);
        c.fillStyle = ink; c.strokeStyle = ink; c.lineCap = "round";
        const motif = (cx, cy, sc) => {
          c.save(); c.translate(cx, cy); c.scale(sc, sc);
          for (const sx of [-1, 1]) {                                   // mirrored acanthus scrolls
            c.save(); c.scale(sx, 1);
            c.lineWidth = 9; c.beginPath(); c.moveTo(4, 70); c.bezierCurveTo(60, 40, 70, -30, 30, -70); c.stroke();
            c.lineWidth = 5; c.beginPath(); c.moveTo(30, -70); c.bezierCurveTo(10, -90, -5, -60, 14, -52); c.stroke();
            for (let k = 0; k < 6; k++) { const t = k / 6; c.beginPath(); c.ellipse(16 + 50 * Math.sin(t * 2.6), 60 - t * 120, 10, 4, -0.6 - t, 0, Math.PI * 2); c.fill(); }
            for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(70 - k * 4, 10 - k * 14, 2.4, 0, Math.PI * 2); c.fill(); }
            c.restore();
          }
          for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.beginPath(); c.ellipse(Math.cos(a) * 12, 92 + Math.sin(a) * 12, 9, 5, a, 0, Math.PI * 2); c.fill(); }
          c.beginPath(); c.moveTo(0, -110); c.quadraticCurveTo(16, -85, 0, -60); c.quadraticCurveTo(-16, -85, 0, -110); c.fill();
          c.restore();
        };
        motif(W2 / 2, H2 * 0.48, 1.0); motif(0, 0, 0.8); motif(W2, 0, 0.8); motif(0, H2, 0.8); motif(W2, H2, 0.8);
      });
    }
    const PAPER = {
      hallway: damask("#3a141e", "rgba(110,36,52,0.75)"), landing: damask("#3a141e", "rgba(110,36,52,0.75)"),
      bedroom: damask("#2a1a3a", "rgba(80,52,108,0.8)"), library: damask("#1c2a22", "rgba(52,84,64,0.8)"),
    };
    // the storage room: old brick under a film of dust, the courses half scrubbed away
    useX = true;
    PAPER.storage_room = canvasTex(256, 400, (c, W2, H2) => {
      c.fillStyle = "#2f2a38"; c.fillRect(0, 0, W2, H2);
      const BW = 64, BH = 25;
      for (let row = 0; row * BH < H2; row++) for (let col = -1; col < 5; col++) {
        const x = col * BW + (row % 2 ? BW / 2 : 0), y = row * BH;
        c.fillStyle = ["rgba(66,56,80,0.6)", "rgba(38,33,48,0.6)", "rgba(74,64,86,0.55)", "rgba(50,43,62,0.6)"][Math.floor(rnd() * 4)];
        c.fillRect(x + 1, y + 1, BW - 2, BH - 2);
        if (rnd() < 0.62) { c.fillStyle = `rgba(16,12,22,${0.18 + rnd() * 0.22})`; c.fillRect(x, y + BH - 1.5, BW * (0.4 + rnd() * 0.6), 1.5); }     // mortar, in broken stretches
        if (rnd() < 0.5) { c.fillStyle = `rgba(16,12,22,${0.15 + rnd() * 0.2})`; c.fillRect(x, y + 2, 1.5, BH * (0.4 + rnd() * 0.5)); }
      }
      for (let i = 0; i < 9; i++) {                                    // smears where the brick has been rubbed back to pale dust
        const px = 46 + rnd() * 164, py = 30 + rnd() * (H2 - 60), r = 22 + rnd() * 34;
        const gr = c.createRadialGradient(px, py, 4, px, py, r); gr.addColorStop(0, `rgba(118,110,104,${0.07 + rnd() * 0.07})`); gr.addColorStop(1, "rgba(118,110,104,0)");
        c.fillStyle = gr; c.fillRect(px - r, py - r, r * 2, r * 2);
      }
      c.lineCap = "round";
      for (let i = 0; i < 7; i++) {                                    // long sweeping wipe marks
        const px = 40 + rnd() * 170, py = 40 + rnd() * (H2 - 80);
        c.strokeStyle = `rgba(150,142,130,${0.04 + rnd() * 0.05})`; c.lineWidth = 8 + rnd() * 14;
        c.beginPath(); c.moveTo(px - 30, py + 14); c.quadraticCurveTo(px, py - 16 - rnd() * 12, px + 34, py + 10); c.stroke();
      }
      const dust = c.createLinearGradient(0, H2 * 0.5, 0, H2); dust.addColorStop(0, "rgba(140,132,118,0)"); dust.addColorStop(1, "rgba(140,132,118,0.14)");
      c.fillStyle = dust; c.fillRect(0, 0, W2, H2);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "190,182,170"},${rnd() * 0.07})`; c.fillRect(rnd() * W2, rnd() * H2, 1 + rnd() * 3, 1 + rnd() * 2); }
    });
    useX = false;
    // the attic: rough vertical boards from floor to roof, stained and split
    PAPER.attic = canvasTex(256, 400, (c, W2, H2) => {
      c.fillStyle = "#0a0605"; c.fillRect(0, 0, W2, H2);
      const bw = W2 / 3;
      for (let b = 0; b < 3; b++) {
        c.fillStyle = ["#30211a", "#281b13", "#38271c"][b]; c.fillRect(b * bw + 2, 0, bw - 4, H2);
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.2})`; c.fillRect(b * bw + 3 + rnd() * (bw - 8), rnd() * H2, 1, 30 + rnd() * 120); }
        for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(160,130,100,${0.04 + rnd() * 0.06})`; c.fillRect(b * bw + 3 + rnd() * (bw - 8), rnd() * H2, 1, 20 + rnd() * 60); }
        if (rnd() < 0.8) { const kx = b * bw + bw * (0.3 + rnd() * 0.4), ky = rnd() * H2; c.strokeStyle = "rgba(0,0,0,0.45)"; for (let r2 = 3; r2 < 12; r2 += 3) { c.beginPath(); c.ellipse(kx, ky, r2, r2 * 1.8, 0, 0, 7); c.stroke(); } }
        for (const ny of [40, H2 - 40]) { c.fillStyle = "#050305"; c.beginPath(); c.arc(b * bw + 12, ny, 2.2, 0, 7); c.arc(b * bw + bw - 12, ny, 2.2, 0, 7); c.fill(); }
      }
      const damp = c.createLinearGradient(0, 0, 0, H2); damp.addColorStop(0, "rgba(0,0,0,0.5)"); damp.addColorStop(0.3, "rgba(0,0,0,0)"); damp.addColorStop(0.75, "rgba(0,0,0,0)"); damp.addColorStop(1, "rgba(0,0,0,0.45)");
      c.fillStyle = damp; c.fillRect(0, 0, W2, H2);
    });
    const atticGeo = new THREE.PlaneGeometry(1.001, 3.8);
    const paperGeo = new THREE.PlaneGeometry(1.001, 2.55);
    MAP.rooms.forEach((room, r) => {
      const list = perRoom[r];
      const tex = PAPER[room.id];
      if (!list.length || !tex) return;
      const full = room.id === "attic";                              // boards run floor to roof up there
      const inst = new THREE.InstancedMesh(full ? atticGeo : paperGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), list.length);
      const mx = new THREE.Matrix4();
      list.forEach(([x, y], i) => { mx.makeTranslation(x + 0.5, full ? 1.9 : 2.25, y + 1.006); inst.setMatrixAt(i, mx); });
      inst.receiveShadow = true; roomGroups[r].add(inst);
    });
    // side walls: dark wainscot below and the room's wallpaper above, on the face toward the room
    const sideH = WALL_H.side;
    const sidePaperGeo = new THREE.PlaneGeometry(1.001, Math.min(sideH, 3.5) - 0.95), sidePanelGeo = new THREE.PlaneGeometry(1.001, 0.9);
    MAP.rooms.forEach((room, r) => {
      const tex = PAPER[room.id];
      const faces = [];
      for (const [x, y] of [...walls.side, ...walls.back]) {
        if (!roomsNear(x, y).includes(r) || stairVoid(r, x, y)) continue;
        if (y < room.y || y >= room.y + room.h) continue;            // only along the room's own length
        if (!MAP.isWall(x + 1, y) && MAP.roomAt(x + 1, y) === r) faces.push([x + 1.014, y + 0.5, Math.PI / 2]);   // faces east
        if (!MAP.isWall(x - 1, y) && MAP.roomAt(x - 1, y) === r) faces.push([x - 0.014, y + 0.5, -Math.PI / 2]);  // faces west
      }
      if (!faces.length) return;
      const panelM = new THREE.MeshStandardMaterial({ color: "#2a1810", roughness: 0.85 });
      const instPanel = new THREE.InstancedMesh(sidePanelGeo, panelM, faces.length);
      const instPaper = tex ? new THREE.InstancedMesh(sidePaperGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), faces.length) : null;
      const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
      faces.forEach(([fx, fz, ry], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        mx.compose(new THREE.Vector3(fx, 0.5, fz), q, one); instPanel.setMatrixAt(i, mx);
        if (instPaper) { mx.compose(new THREE.Vector3(fx, 0.95 + (sideH - 0.95) / 2, fz), q, one); instPaper.setMatrixAt(i, mx); }
      });
      roomGroups[r].add(instPanel); if (instPaper) roomGroups[r].add(instPaper);
    });
    MAP.rooms.forEach((_, r) => {
      const list = perRoom[r];
      if (!list.length || MAP.rooms[r].id === "attic") return;      // the attic has bare boards, no panelling or moulding
      for (const [geo, m, py, zo, offs] of parts) {
        const inst = new THREE.InstancedMesh(geo, m, list.length * offs.length);
        const mx = new THREE.Matrix4(); let i = 0;
        for (const [x, y] of list) for (const ox of offs) { mx.makeTranslation(x + 0.5 + ox, py, y + zo); inst.setMatrixAt(i++, mx); }
        inst.receiveShadow = true; roomGroups[r].add(inst);
      }
    });
  }

  // -------------------------------------------------------------- lights
  const ambLight = new THREE.AmbientLight("#4a3870", 2.4), hemiLight = new THREE.HemisphereLight("#6a52a0", "#12261a", 1.4);
  scene.add(ambLight, hemiLight);
  const lantern = new THREE.PointLight("#b46cff", 18, 9, 1.4); // the purple lantern the player carries
  lantern.castShadow = true; lantern.shadow.mapSize.set(512, 512); lantern.shadow.bias = -0.01;
  scene.add(lantern);
  const TINT = { warm: "#ff8a30", green: "#5fe08a", violet: "#b06cff" };
  const lightSources = []; // {x, y, z, color, power, phase, flame?}
  const POOL = Array.from({ length: 10 }, () => { const l = new THREE.PointLight("#ff8a30", 0, 6, 1.5); scene.add(l); return l; });

  // moonbeam through the bedroom window
  const moon = new THREE.SpotLight("#a98cff", 30, 18, 0.32, 0.6, 1.2);
  moon.position.set(10.5, 6, -2); moon.target.position.set(8, 0, 8);
  moon.castShadow = true; moon.shadow.mapSize.set(512, 512);
  scene.add(moon, moon.target);

  // ------------------------------------------------------- gothic materials
  function grimeWood(base, dark) {
    return canvasTex(256, 256, (c, W2, H2) => {
      c.fillStyle = base; c.fillRect(0, 0, W2, H2);
      for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(0,0,0,${0.08 + rnd() * 0.15})`; c.lineWidth = 1 + rnd() * 2; c.beginPath(); const y = rnd() * H2; c.moveTo(0, y); c.bezierCurveTo(W2 * 0.3, y + (rnd() - 0.5) * 12, W2 * 0.7, y + (rnd() - 0.5) * 12, W2, y + (rnd() - 0.5) * 8); c.stroke(); }
      for (let i = 0; i < 18; i++) { const g = c.createRadialGradient(rnd() * W2, rnd() * H2, 1, 0, 0, 0); c.fillStyle = dark; c.globalAlpha = 0.12 + rnd() * 0.2; c.beginPath(); c.ellipse(rnd() * W2, rnd() * H2, 8 + rnd() * 30, 5 + rnd() * 18, rnd() * 3, 0, 7); c.fill(); }
      c.globalAlpha = 1;
      for (let i = 0; i < 25; i++) { c.strokeStyle = "rgba(255,230,200,0.06)"; c.beginPath(); const x = rnd() * W2, y = rnd() * H2; c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 6); c.stroke(); }
    });
  }
  function grimeStone() {
    return canvasTex(256, 256, (c, W2, H2) => {
      c.fillStyle = "#4a4258"; c.fillRect(0, 0, W2, H2);
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${rnd() * 0.08})`; c.fillRect(rnd() * W2, rnd() * H2, 2 + rnd() * 6, 2 + rnd() * 6); }
      for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(40,80,45,${0.15 + rnd() * 0.2})`; c.beginPath(); c.ellipse(rnd() * W2, H2 - rnd() * 80, 10 + rnd() * 30, 4 + rnd() * 10, 0, 0, 7); c.fill(); } // moss near the base
      for (let i = 0; i < 6; i++) { c.strokeStyle = "rgba(0,0,0,0.25)"; c.beginPath(); let x = rnd() * W2, y = rnd() * H2; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 20; c.lineTo(x, y); } c.stroke(); } // cracks
    });
  }
  const velvetTex = canvasTex(256, 256, (c, W2, H2) => {
    c.fillStyle = "#5c0f1e"; c.fillRect(0, 0, W2, H2);
    for (let x = 0; x < W2; x += 22) { const g = c.createLinearGradient(x, 0, x + 22, 0); g.addColorStop(0, "rgba(0,0,0,0.35)"); g.addColorStop(0.5, "rgba(255,80,100,0.08)"); g.addColorStop(1, "rgba(0,0,0,0.35)"); c.fillStyle = g; c.fillRect(x, 0, 22, H2); }
  });
  const texMat = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, ...o });
  // turned (lathe) leg / post with bulbs and rings
  function turned(h, r, m, x, y, z, parent) {
    const pts = [[0, 0], [r * 1.3, 0], [r * 1.3, h * 0.06], [r * 0.7, h * 0.1], [r * 1.5, h * 0.22], [r * 0.6, h * 0.36], [r * 0.75, h * 0.6], [r * 1.25, h * 0.7], [r * 0.6, h * 0.8], [r * 0.9, h * 0.94], [r * 1.2, h], [0, h]];
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 10), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function finial(m, x, y, z, parent, s2 = 1) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s2, 8, 6), m); b.position.set(x, y + 0.05 * s2, z); parent.add(b);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s2, 0.18 * s2, 6), m); sp.position.set(x, y + 0.18 * s2, z); parent.add(sp);
  }
  // a carved curl (scroll): three-quarter ring with a knob on the end
  function scroll(m, x, y, z, r, rotY, rotZ, parent) {
    const g = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 5, 12, Math.PI * 1.5), m); g.add(arc);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 6, 4), m); knob.position.set(r, 0, 0); g.add(knob);
    g.position.set(x, y, z); g.rotation.set(0, rotY || 0, rotZ || 0); parent.add(g); return g;
  }
  // a carved panel: inset frame plus a diamond boss
  function carvedPanel(w, h, m, mDark, x, y, z, parent) {
    box(w, h, 0.04, m, x, y, z, parent);
    for (const [bw, bh, bx, by] of [[w * 0.9, 0.025, 0, h * 0.42], [w * 0.9, 0.025, 0, -h * 0.42], [0.025, h * 0.86, w * 0.44, 0], [0.025, h * 0.86, -w * 0.44, 0]]) box(bw, bh, 0.05, mDark, x + bx, y + by, z + 0.01, parent);
    const d = box(Math.min(w, h) * 0.3, Math.min(w, h) * 0.3, 0.05, mDark, x, y, z + 0.015, parent); d.rotation.z = Math.PI / 4;
  }

  // ------------------------------------------------------------- objects
  const M = {
    darkWood: texMat(grimeWood("#3a2418", "#120804")), wood: texMat(grimeWood("#5a3a26", "#1a0e08")), plum: texMat(velvetTex), linen: mat("#b9aeb8"),
    burgundy: texMat(velvetTex), carve: mat("#24140c"),
    stone: texMat(grimeStone()), stoneDark: mat("#2c2636"), iron: mat("#1a1620", { roughness: 0.6, metalness: 0.4 }),
    gold: mat("#a8823a", { metalness: 0.6, roughness: 0.4 }), cream: mat("#e6dcc4"), moss: mat("#2a5c42"),
    green: mat("#3fae6a"), brass: mat("#b08a4a", { metalness: 0.5, roughness: 0.5 }), glass: mat("#8fb4c8", { transparent: true, opacity: 0.4, roughness: 0.1 }),
  };
  const flames = []; // animated flame meshes

  // a small teardrop flame: dim green outer flame, pale core, and a dark wick
  const flameGeo = new THREE.LatheGeometry([[0, 0], [0.5, 0.25], [0.6, 0.6], [0.45, 1.1], [0.2, 1.6], [0, 2.0]].map(([a, b]) => new THREE.Vector2(a, b)), 10);
  const flameMat = new THREE.MeshStandardMaterial({ color: "#2f8a52", emissive: "#3fae6a", emissiveIntensity: 0.7, transparent: true, opacity: 0.8, depthWrite: false });
  const coreMat = new THREE.MeshStandardMaterial({ color: "#c8f5d2", emissive: "#a8f0b8", emissiveIntensity: 0.9 });
  const wickMat = new THREE.MeshStandardMaterial({ color: "#0a0806" });
  const warmFlameMat = new THREE.MeshStandardMaterial({ color: "#c8561a", emissive: "#ff8a2a", emissiveIntensity: 1.1, transparent: true, opacity: 0.85, depthWrite: false });
  const warmCoreMat = new THREE.MeshStandardMaterial({ color: "#ffe2a0", emissive: "#ffd05a", emissiveIntensity: 1.0 });
  function flame(parent, x, y, z, color = "#7bd389", size = 0.08) {
    const warm = /^#ff/.test(color);
    const f = new THREE.Mesh(flameGeo, warm ? warmFlameMat : flameMat);
    const s2 = size * 0.55;
    f.scale.set(s2, s2 * 1.1, s2); f.position.set(x, y + 0.01, z); parent.add(f);
    const core = new THREE.Mesh(flameGeo, warm ? warmCoreMat : coreMat); core.scale.set(0.45, 0.5, 0.45); f.add(core);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 4), wickMat); wick.position.set(x, y, z); parent.add(wick);
    flames.push({ mesh: f, phase: rnd() * 10, base: s2 });
    return f;
  }
  const waxMat = new THREE.MeshStandardMaterial({ color: "#b9ac8c", roughness: 0.75 });
  const waxDark = new THREE.MeshStandardMaterial({ color: "#8f8264", roughness: 0.8 });
  // an old, uneven wax candle with drips running down and a melted lip
  function waxCandle(g, x, y, z, h = 0.22, r = 0.028) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 8), waxMat);
    body.position.set(x, y + h / 2, z); body.rotation.z = (rnd() - 0.5) * 0.05; body.castShadow = true; g.add(body);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, r * 0.2, 4, 10), waxMat); lip.rotation.x = Math.PI / 2; lip.position.set(x, y + h, z); g.add(lip);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 10), waxDark); pool.rotation.x = -Math.PI / 2; pool.position.set(x, y + h + 0.002, z); g.add(pool);
    const drips = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < drips; i++) {
      const a = rnd() * Math.PI * 2, len = h * (0.25 + rnd() * 0.55);
      const d = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.22, len, 2, 5), waxMat);
      d.position.set(x + Math.cos(a) * r * 0.95, y + h - len / 2 - 0.005, z + Math.sin(a) * r * 0.95); g.add(d);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 5, 4), waxMat); bead.position.set(d.position.x, y + h - len - 0.01, d.position.z); g.add(bead);
    }
    flame(g, x, y + h + 0.01, z, "#7bd389", 0.06);
  }
  function candle(g, x, y, z) {
    cyl(0.06, 0.07, 0.025, M.iron, x, y + 0.012, z, g, 8);     // little iron dish
    waxCandle(g, x, y + 0.025, z, 0.24, 0.032);
  }

  // Builders return a THREE.Group positioned in the object's local space.
  // Floor objects: centred on their footprint. Wall objects: centred on the wall face.
  const BUILD = {
    bed(g, w, d) {
      // carved four-poster with burgundy velvet sheets and a canopy
      box(w, 0.32, d, M.darkWood, 0, 0.3, 0, g);
      box(w * 0.94, 0.18, d * 0.9, M.linen, 0, 0.52, 0.05, g);
      const blanket = box(w * 1.0, 0.14, d * 0.66, M.burgundy, 0, 0.64, d * 0.16, g);
      box(w * 1.02, 0.4, 0.04, M.burgundy, 0, 0.45, d * 0.49, g);          // blanket hanging over the foot
      box(w * 0.34, 0.14, d * 0.16, mat("#cfc4c8"), -w * 0.2, 0.66, -d * 0.33, g); box(w * 0.34, 0.14, d * 0.16, mat("#cfc4c8"), w * 0.2, 0.66, -d * 0.33, g);
      // headboard: carved panel with an arched crest and scrolls
      carvedPanel(w, 0.9, M.darkWood, M.carve, 0, 0.95, -d / 2, g);
      const crest = new THREE.Mesh(new THREE.CircleGeometry(w * 0.32, 16, 0, Math.PI), M.darkWood); crest.position.set(0, 1.39, -d / 2 + 0.03); crest.scale.y = 0.6; g.add(crest);
      scroll(M.carve, -w * 0.3, 1.45, -d / 2 + 0.04, 0.09, 0, 0.6, g); scroll(M.carve, w * 0.3, 1.45, -d / 2 + 0.04, 0.09, Math.PI, 0.6, g);
      box(w, 0.35, 0.06, M.darkWood, 0, 0.55, d / 2, g);                 // footboard
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        turned(2.0, 0.06, M.darkWood, sx * w / 2, 0, sz * d / 2, g);
        finial(M.darkWood, sx * w / 2, 2.0, sz * d / 2, g);
      }
      // canopy frame and burgundy drapes gathered at the head posts
      for (const sz of [-1, 1]) box(w, 0.06, 0.06, M.darkWood, 0, 1.98, sz * d / 2, g);
      for (const sx of [-1, 1]) box(0.06, 0.06, d, M.darkWood, sx * w / 2, 1.98, 0, g);
      for (const sx of [-1, 1]) { const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 1.9, 8, 1, true), new THREE.MeshStandardMaterial({ map: velvetTex, side: THREE.DoubleSide })); drape.position.set(sx * (w / 2 - 0.05), 1.0, -d / 2 + 0.12); g.add(drape); }
      const valance = box(w + 0.1, 0.22, 0.04, M.burgundy, 0, 1.86, d / 2 + 0.03, g);
    },

    nightstand(g, w, d) {
      box(w * 0.85, 0.08, d * 0.8, M.darkWood, 0, 0.62, 0, g);
      box(w * 0.75, 0.32, d * 0.7, M.wood, 0, 0.42, 0, g);
      carvedPanel(w * 0.6, 0.22, M.wood, M.carve, 0, 0.42, d * 0.36, g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), M.brass); ring.position.set(0, 0.4, d * 0.39); g.add(ring);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) turned(0.3, 0.025, M.darkWood, sx * w * 0.32, 0, sz * d * 0.28, g);
      box(w * 0.8, 0.02, d * 0.7, mat("#1d1a14"), 0, 0.665, 0, g).castShadow = false; // dust
    },
    candle(g) { candle(g, 0, 0, 0); },
    rug(g, w, d) {
      // dark purple gothic rug: silver ornamental borders, a spiderweb mandala, floral corners
      const tex = canvasTex(1024, Math.round(1024 * d / w), (c, W2, H2) => {
        c.fillStyle = "#1e1030"; c.fillRect(0, 0, W2, H2);
        for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? "70,45,95" : "0,0,0"},${rnd() * 0.3})`; c.fillRect(rnd() * W2, rnd() * H2, 2, 2); } // velvet pile
        const gold = (a2) => `rgba(205,205,220,${a2})`; // silver
        // nested borders
        for (const [inset, lw] of [[14, 4], [26, 1.5], [70, 1.5], [82, 4]]) { c.strokeStyle = gold(0.85); c.lineWidth = lw; c.strokeRect(inset, inset, W2 - inset * 2, H2 - inset * 2); }
        // border band: evenly spaced fine lines running along the band (no scrolls)
        c.strokeStyle = gold(0.6); c.lineWidth = 1.2;
        for (let k = 0; k < 6; k++) { const inset = 34 + k * 6.5; c.strokeRect(inset, inset, W2 - inset * 2, H2 - inset * 2); }
        // floral clusters at the inner corners
        const flower = (x, y, r) => {
          for (let k = 0; k < 6; k++) { const a2 = k * Math.PI / 3; c.fillStyle = gold(0.7); c.beginPath(); c.ellipse(x + Math.cos(a2) * r, y + Math.sin(a2) * r, r * 0.7, r * 0.35, a2, 0, Math.PI * 2); c.fill(); }
          c.fillStyle = "#1e1030"; c.beginPath(); c.arc(x, y, r * 0.45, 0, Math.PI * 2); c.fill();
          c.fillStyle = gold(0.9); c.beginPath(); c.arc(x, y, r * 0.25, 0, Math.PI * 2); c.fill();
        };
        for (const [cx, cy, sx, sy] of [[100, 100, 1, 1], [W2 - 100, 100, -1, 1], [100, H2 - 100, 1, -1], [W2 - 100, H2 - 100, -1, -1]]) {
          for (let i = 0; i < 9; i++) {
            const ang = rnd() * Math.PI / 2, dist = 10 + rnd() * 90;
            flower(cx + sx * Math.cos(ang) * dist, cy + sy * Math.sin(ang) * dist, 6 + rnd() * 7);
          }
          c.strokeStyle = gold(0.55); c.lineWidth = 1.5;
          for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx + sx * rnd() * 120, cy + sy * rnd() * 40, cx + sx * (40 + rnd() * 100), cy + sy * (40 + rnd() * 100)); c.stroke(); }
        }
        // spiderweb mandala in the centre
        const cx = W2 / 2, cy = H2 / 2, R = Math.min(W2, H2) * 0.36;
        c.strokeStyle = gold(0.5); c.lineWidth = 1.5;
        for (let k = 0; k < 16; k++) { const a2 = k * Math.PI / 8; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a2) * R * 1.9, cy + Math.sin(a2) * R * 1.3); c.stroke(); }
        for (let r2 = R * 0.3; r2 <= R; r2 += R * 0.14) {
          c.beginPath();
          for (let k = 0; k <= 16; k++) { const a2 = k * Math.PI / 8, rr = r2 * (k % 2 ? 0.93 : 1); const x = cx + Math.cos(a2) * rr * 1.25, y = cy + Math.sin(a2) * rr; k ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.stroke();
        }
        c.lineWidth = 2.5; c.strokeStyle = gold(0.85);
        for (let k = 0; k < 12; k++) { const a2 = k * Math.PI / 6; c.beginPath(); c.arc(cx + Math.cos(a2) * R * 0.62 * 1.25, cy + Math.sin(a2) * R * 0.62, R * 0.2, a2 + Math.PI * 0.6, a2 + Math.PI * 1.4); c.stroke(); } // scalloped lace ring
        c.beginPath(); c.ellipse(cx, cy, R * 0.32 * 1.25, R * 0.32, 0, 0, Math.PI * 2); c.stroke();
        for (let k = 0; k < 24; k++) { const a2 = k * Math.PI / 12; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a2) * R * 0.3 * 1.25, cy + Math.sin(a2) * R * 0.3); c.lineWidth = 1; c.stroke(); }
        flower(cx, cy, 10);
      });
      tex.repeat.set(1, 1);
      const rugM = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
      const rug = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), rugM); rug.position.y = 0.013; rug.receiveShadow = true; g.add(rug);
    },
    fireplace(g, w, d, o) {
      const orange = o && o.fire === "orange", chH = o && o.side ? 0.95 : 2.2;
      // stone fireplace with a real opening: jambs, lintel, mantel shelf, a dark
      // back wall, iron grate with logs, and tall flickering green flames
      const W2 = Math.max(w, 2.2), D = 0.7, open = W2 * 0.55, oh = 0.95;
      g.userData.flushToWall = true;
      // a stone chimney breast rising from the mantel to the ceiling, so the fireplace reads as built into the wall
      box(W2 * 0.9, chH, 0.35, M.stone, 0, 1.64 + chH / 2, -D / 2 + 0.17, g);
      for (const sx of [-1, 1]) box(0.08, chH, 0.38, mat("#3a3248"), sx * W2 * 0.45, 1.64 + chH / 2, -D / 2 + 0.17, g);   // quoin edges
      if (chH > 2) box(W2 * 0.95, 0.1, 0.42, mat("#5a4e70"), 0, 3.7, -D / 2 + 0.17, g);                                          // cap under the crown
      const jamb = (W2 - open) / 2;
      for (const sx of [-1, 1]) box(jamb, 1.5, D, M.stone, sx * (open / 2 + jamb / 2), 0.75, 0, g);   // side jambs
      box(open, 1.5 - oh, D, M.stone, 0, oh + (1.5 - oh) / 2, 0, g);                                   // lintel
      box(W2 * 1.14, 0.14, D + 0.2, mat("#5a4e70"), 0, 1.57, 0.08, g);                                   // mantel shelf
      for (const sx of [-1, 1]) { scroll(M.carve, sx * (open / 2 + 0.05), oh - 0.05, D / 2 + 0.02, 0.08, sx > 0 ? Math.PI : 0, Math.PI / 2, g); }
      box(open, oh, 0.06, mat("#050307"), 0, oh / 2, -D / 2 + 0.04, g);                                  // sooty back wall
      box(open, 0.04, D - 0.1, mat("#0c0a0e"), 0, 0.02, 0, g);                                          // hearth floor
      box(W2 * 1.1, 0.06, 0.35, M.stone, 0, 0.03, D / 2 + 0.17, g);                                      // hearth stone in front
      for (let i = 0; i < 5; i++) box(0.02, 0.18, 0.02, M.iron, -open * 0.35 + i * open * 0.175, 0.12, D * 0.15, g); // grate bars
      for (const [x, r] of [[-0.12, 0.2], [0.14, -0.25]]) { const log = cyl(0.06, 0.06, open * 0.7, M.darkWood, x * 0.3, 0.12, 0, g, 7); log.rotation.set(0, r, Math.PI / 2); }
      for (let i = 0; i < 9; i++) flame(g, (i - 4) * open * 0.09, 0.14, 0.02 + (i % 2) * 0.06, orange ? (i % 3 ? "#ff8a2a" : "#ffd05a") : "#7bd389", 0.16 + rnd() * 0.12);
      if (o && o.scraps) {
        // half-burnt transcript pages: curled in the grate and one that fell out onto the hearth
        const scrapTex = canvasTex(128, 128, (c, W2, H2) => {
          c.fillStyle = "#d8ccb0"; c.fillRect(0, 0, W2, H2);
          c.fillStyle = "#3a3026"; for (let y = 14; y < H2 - 10; y += 9) c.fillRect(10, y, 40 + rnd() * 70, 2);
          const gr = c.createRadialGradient(W2 * 0.8, H2 * 0.9, 10, W2 * 0.8, H2 * 0.9, 110); gr.addColorStop(0, "#000"); gr.addColorStop(0.45, "#120a06"); gr.addColorStop(0.55, "#ff7a2a"); gr.addColorStop(0.62, "rgba(90,50,20,0.7)"); gr.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gr; c.fillRect(0, 0, W2, H2);
        });
        const scrapM = new THREE.MeshStandardMaterial({ map: scrapTex, emissive: "#ff6a1a", emissiveMap: scrapTex, emissiveIntensity: 0.15, side: THREE.DoubleSide, roughness: 0.9 });
        for (const [x, y, z, rx, rz, sc] of [[-0.2, 0.08, 0.1, -1.2, 0.4, 0.22], [0.18, 0.1, 0.05, -1.0, -0.6, 0.2], [0.02, 0.06, 0.22, -1.45, 0.1, 0.18], [0.5, 0.065, D / 2 + 0.2, -Math.PI / 2, 0.7, 0.24], [0.25, 0.065, D / 2 + 0.35, -Math.PI / 2, -0.3, 0.16]]) {
          const pg = new THREE.Mesh(new THREE.PlaneGeometry(sc, sc * 1.3, 3, 3), scrapM);
          const pa = pg.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, (pa.getX(i) ** 2) * 2.5);   // curl
          pg.position.set(x, y, z); pg.rotation.set(rx, 0, rz); g.add(pg);
        }
      }
      const fireLight = new THREE.PointLight(orange ? "#ff8a3a" : "#5fe08a", 3, 4, 1.6); fireLight.position.set(0, 0.5, D / 2 + 0.2); g.add(fireLight);
      const glowM = new THREE.Mesh(new THREE.PlaneGeometry(open * 0.9, oh * 0.8), new THREE.MeshBasicMaterial({ color: orange ? "#ff7a2a" : "#3fae6a", transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      glowM.position.set(0, oh * 0.4, -D / 2 + 0.08); g.add(glowM);
    },

    portrait(g) {
      // a framed photo standing on the mantel: ornate gilt frame, four faintly glowing friends, a back stand
      const F = new THREE.Group(); F.rotation.x = -0.12; g.add(F);
      const fw = 0.55, fh = 0.7;
      for (const [bw, bh, x, y] of [[fw, 0.07, 0, fh / 2], [fw, 0.07, 0, -fh / 2], [0.07, fh, fw / 2, 0], [0.07, fh, -fw / 2, 0]]) box(bw, bh, 0.05, M.gold, x, y + fh / 2, 0, F);
      for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), M.gold); r.position.set(sx * fw / 2, fh / 2 + sy * fh / 2, 0.03); F.add(r); }
      const crest = new THREE.Mesh(new THREE.CircleGeometry(0.1, 9, 0, Math.PI), M.gold); crest.position.set(0, fh + 0.03, 0.01); F.add(crest);
      box(fw - 0.06, fh - 0.06, 0.02, mat("#2a1a5a"), 0, fh / 2, 0.005, F);
      for (let i = 0; i < 4; i++) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow("#7bd389", 1.2)); head.position.set((i - 1.5) * 0.11, fh * 0.55 + (i % 2) * 0.04, 0.025); F.add(head);
        const body = box(0.06, 0.1, 0.01, glow("#3fae6a", 0.6), (i - 1.5) * 0.11, fh * 0.38 + (i % 2) * 0.04, 0.02, F); body.castShadow = false;
      }
      const stand = box(0.04, 0.5, 0.03, M.gold, 0, 0.22, -0.12, g); stand.rotation.x = 0.45;
    },

    window(g, w) {
      // a soft window-shaped patch of moonlight on the floor, with the faint cross
      // shadow of the window frame (no shafts)
      const poolTex = canvasTex(256, 256, (c, W2, H2) => {
        c.save(); c.translate(W2 / 2, H2 / 2); c.transform(1, 0, -0.3, 1, 0, 0);
        const gr = c.createRadialGradient(0, 0, 10, 0, 0, 110); gr.addColorStop(0, "rgba(165,150,255,0.32)"); gr.addColorStop(0.6, "rgba(165,150,255,0.14)"); gr.addColorStop(1, "rgba(165,150,255,0)");
        c.fillStyle = gr; c.fillRect(-90, -100, 180, 200);
        c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(-4, -95, 8, 190); c.fillRect(-85, -4, 170, 8);
        c.restore();
      });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.8), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(-0.3, -1.43, 2.0); g.add(pool);
      box(w, 1.1, 0.08, M.darkWood, 0, 0, 0, g);
      const pane = box(w * 0.85, 0.95, 0.09, glow("#6a4cc8", 0.6), 0, 0, 0.01, g); pane.castShadow = false;
      box(0.05, 0.95, 0.1, M.darkWood, 0, 0, 0.02, g); box(w * 0.85, 0.05, 0.1, M.darkWood, 0, 0, 0.02, g);
    },
    painting(g, w) {
      box(w * 1.1, w * 0.9, 0.08, M.gold, 0, 0, 0, g);
      box(w * 0.85, w * 0.65, 0.09, mat(["#3b2a5a", "#2a3a4a", "#4a1a2a"][Math.floor(rnd() * 3)]), 0, 0, 0.01, g);
      for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const ro = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), M.gold); ro.position.set(sx * w * 0.52, sy * w * 0.42, 0.05); g.add(ro); }
    },

    plaque(g, w) { box(w * 0.8, 0.3, 0.05, M.brass, 0, 0, 0, g); },
    sconce(g) {
      // an iron cage lantern on a curled wall bracket, like the lanterns on the manor gates
      const iron = M.iron, rust = mat("#7a3a1a");
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.09, 6), iron); plate.scale.y = 1.6; plate.position.z = 0.01; g.add(plate);
      const arm = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.05, 0.02), new THREE.Vector3(0, 0.12, 0.12), new THREE.Vector3(0, 0.1, 0.3));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(arm, 10, 0.016, 5), iron));
      scroll(iron, 0, -0.12, 0.08, 0.05, Math.PI / 2, 0, g);
      const L = new THREE.Group(); L.position.set(0, -0.12, 0.3); g.add(L);           // hangs from the arm
      cyl(0.006, 0.006, 0.12, iron, 0, 0.17, 0, L, 4);                                // chain
      box(0.16, 0.025, 0.16, iron, 0, -0.14, 0, L);                                    // base plate
      box(0.18, 0.02, 0.18, iron, 0, 0.1, 0, L);                                       // top rim
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.12, 4), iron); cap.rotation.y = Math.PI / 4; cap.position.y = 0.17; L.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 8), iron); ring.position.y = 0.25; L.add(ring);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.014, 0.24, 0.014, iron, sx * 0.075, -0.02, sz * 0.075, L); // corner posts
      for (const sx of [-1, 1]) box(0.006, 0.22, 0.006, iron, sx * 0.025, -0.02, 0.078, L);                                   // thin front bars
      box(0.015, 0.06, 0.016, rust, -0.075, -0.06, 0.076, L); box(0.015, 0.04, 0.016, rust, 0.075, 0.02, -0.076, L);           // rust
      const glass = box(0.14, 0.22, 0.14, new THREE.MeshStandardMaterial({ color: "#5fa877", transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false }), 0, -0.02, 0, L); glass.castShadow = false;
      cyl(0.022, 0.022, 0.05, M.cream, 0, -0.1, 0, L, 6);                              // stub of candle
      flame(L, 0, -0.08, 0, "#7bd389", 0.03);
    },

    chalkboard(g, w) {
      box(w, 1.35, 0.08, M.darkWood, 0, 0, 0, g);
      box(w * 0.94, 1.18, 0.09, mat("#173a2a"), 0, 0, 0.01, g);
      const note = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 1.1), new THREE.MeshBasicMaterial({ map: chalkTex, transparent: true, depthWrite: false }));
      note.position.z = 0.065; g.add(note);
      g.userData.chalkLines = [];
      for (let i = 0; i < 6; i++) g.userData.chalkLines.push(box(0.3 + rnd() * 0.8, 0.03, 0.095, mat("#7fae8f"), (rnd() - 0.5) * w * 0.7, (rnd() - 0.5) * 0.8, 0.01, g));
      for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) scroll(M.carve, sx * (w / 2 - 0.05), sy * 0.66, 0.06, 0.08, sx > 0 ? Math.PI : 0, sy > 0 ? 0 : Math.PI, g);
      box(w * 0.9, 0.06, 0.12, M.darkWood, 0, -0.66, 0.08, g); // chalk ledge
    },

    desk(g, w, d) {
      // carved writing table: turned legs, scalloped apron, scroll brackets, grime
      box(w, 0.07, d * 0.82, M.darkWood, 0, 0.8, 0, g);
      box(w * 1.04, 0.03, d * 0.86, M.carve, 0, 0.765, 0, g);
      for (const sz of [-1, 1]) {
        box(w * 0.9, 0.12, 0.03, M.wood, 0, 0.7, sz * d * 0.38, g);
        for (let i = 0; i < 5; i++) { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10, 1, false, 0, Math.PI), M.wood); sc.rotation.set(Math.PI / 2, 0, 0); sc.position.set(-w * 0.36 + i * w * 0.18, 0.64, sz * d * 0.38); g.add(sc); }
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        cabriole(g, sx * (w / 2 - 0.1), sz * (d * 0.4 - 0.08), 0.76, sx, sz);
      }
      box(0.3, 0.02, 0.22, mat("#c8bc9c"), -w * 0.2, 0.845, 0, g);   // stained papers
      box(0.24, 0.02, 0.2, mat("#b0a080"), -w * 0.12, 0.855, 0.05, g).rotation.y = 0.4;
      cyl(0.05, 0.05, 0.08, mat("#14101a"), w * 0.25, 0.88, -0.05, g, 8);    // inkwell
    },

    reading_desk(g, w, d) {
      BUILD.desk(g, w, d);
      // an empty reading stand: the glowing book goes here
      const stand = box(0.5, 0.04, 0.34, M.darkWood, 0.1, 0.9, 0, g); stand.rotation.set(-0.35, -0.2, 0);
      const open = new THREE.Group(); open.position.set(0.1, 0.95, 0); open.rotation.set(-0.35, -0.2, 0); open.visible = false; g.add(open);
      for (const sx of [-1, 1]) { const pg = box(0.24, 0.02, 0.32, mat("#d8ccb0", { emissive: "#8a4ad0", emissiveIntensity: 0.35 }), sx * 0.125, 0, 0, open); pg.rotation.z = sx * -0.12; }
      box(0.5, 0.015, 0.34, M.burgundy, 0, -0.015, 0, open);
      const readGlow = new THREE.PointLight("#b070ff", 0, 2, 2); readGlow.position.set(0.1, 1.2, 0); g.add(readGlow);
      g.userData.readingBook = { open, readGlow };
      cyl(0.04, 0.04, 0.16, M.cream, -w * 0.3, 0.92, 0.05, g, 6); flame(g, -w * 0.3, 1.0, 0.05, "#7bd389", 0.04);
    },
    nest(g, w) {
      // a big woven nest of twigs and branches: layered rings of sticks at random angles, longer
      // branches poking out, a soft straw-and-feather lining, and a few treasured trinkets
      const R = w * 0.42, twigCols = ["#4a3420", "#5c4028", "#3a2816", "#6b4f2a", "#2e2012"];
      const twig = (len, r, col) => new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, len, 5), mat(col, { roughness: 0.95 }));
      const up = new THREE.Vector3(0, 1, 0);
      for (let layer = 0; layer < 7; layer++) {
        const y = 0.06 + layer * 0.075, rr = R * (0.78 + 0.22 * Math.sin((layer / 6) * Math.PI));   // bulges out in the middle
        const n = 26 + layer * 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.3, len = 0.35 + rnd() * 0.35;
          const t = twig(len, 0.018 + rnd() * 0.014, twigCols[Math.floor(rnd() * twigCols.length)]);
          const tangent = new THREE.Vector3(-Math.sin(a), (rnd() - 0.5) * 0.6, Math.cos(a)).normalize();
          t.quaternion.setFromUnitVectors(up, tangent);
          t.position.set(Math.cos(a) * rr * (0.92 + rnd() * 0.16), y + rnd() * 0.04, Math.sin(a) * rr * (0.92 + rnd() * 0.16));
          t.castShadow = true; g.add(t);
        }
      }
      for (let i = 0; i < 14; i++) {                                    // stray branches sticking out, some forked
        const a = rnd() * Math.PI * 2, len = 0.4 + rnd() * 0.5;
        const dir = new THREE.Vector3(Math.cos(a), 0.15 + rnd() * 0.5, Math.sin(a)).normalize();
        const b = twig(len, 0.022, twigCols[i % 5]); b.quaternion.setFromUnitVectors(up, dir);
        b.position.set(Math.cos(a) * R * 0.95, 0.15 + rnd() * 0.35, Math.sin(a) * R * 0.95).add(dir.clone().multiplyScalar(len / 2)); g.add(b);
        if (i % 2) { const f = twig(len * 0.45, 0.012, twigCols[(i + 2) % 5]); const d2 = dir.clone().add(new THREE.Vector3(0, 0.4, 0)).normalize(); f.quaternion.setFromUnitVectors(up, d2); f.position.copy(b.position).add(dir.clone().multiplyScalar(len * 0.25)).add(d2.clone().multiplyScalar(len * 0.22)); g.add(f); }
      }
      // inside: a soft lining
      const lining = new THREE.Mesh(new THREE.SphereGeometry(R * 0.82, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat("#4a3622", { roughness: 1, side: THREE.DoubleSide }));
      lining.scale.y = 0.45; lining.position.y = 0.5; g.add(lining);
      for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, rr = rnd() * R * 0.7; const s = twig(0.18, 0.006, "#b8a060"); s.rotation.set(Math.PI / 2, a, rnd()); s.position.set(Math.cos(a) * rr, 0.36 + rnd() * 0.04, Math.sin(a) * rr); g.add(s); }
      // feathers: dark raven feathers tucked in and around
      const featherM = mat("#1a1622", { roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
      for (let i = 0; i < 9; i++) {
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.05, 0.12, 0, 0.28); sh.quadraticCurveTo(-0.05, 0.12, 0, 0);
        const f = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6), featherM); const a = rnd() * Math.PI * 2, rr = R * (0.3 + rnd() * 0.75);
        f.position.set(Math.cos(a) * rr, 0.4 + rnd() * 0.25, Math.sin(a) * rr); f.rotation.set(-0.6 - rnd() * 0.6, a, rnd() - 0.5); g.add(f);
      }
      // Polly's treasures: a silver key, a button, a ring and a glinting marble
      const silver = mat("#c8ccd8", { metalness: 0.9, roughness: 0.2 });
      const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), M.gold); ringT.rotation.x = Math.PI / 2.4; ringT.position.set(-0.18, 0.4, 0.1); g.add(ringT);
      const btn = cyl(0.04, 0.04, 0.015, silver, 0.15, 0.39, -0.12, g, 10); btn.rotation.x = 0.3;
      const marble = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: "#7bd389", emissive: "#3fae6a", emissiveIntensity: 0.8, roughness: 0.1 })); marble.position.set(0.05, 0.41, 0.2); g.add(marble);
      const key = new THREE.Group(); key.position.set(-0.05, 0.4, -0.22); key.rotation.set(-Math.PI / 2, 0, 0.6); g.add(key);
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 5, 12), silver); bow.position.x = -0.1; key.add(bow);
      box(0.15, 0.015, 0.012, silver, 0, 0, 0, key); box(0.012, 0.03, 0.012, silver, 0.06, -0.015, 0, key);
    },
    pedestal(g) { cyl(0.3, 0.38, 0.8, M.stone, 0, 0.4, 0, g); },
    uv_light(g) { box(0.18, 0.28, 0.18, M.iron, 0, 0.94, 0, g); box(0.12, 0.18, 0.12, glow("#b06cff", 2), 0, 0.94, 0, g); },
    bookshelf(g, w, d, o) {
      // open-fronted tall shelf against the wall: back panel, sides, shelves, crown, books facing the room
      const D = 0.45, back = -d / 2 + 0.05;            // shallow, flush to the wall
      const zc = back + D / 2;
      box(w, 2.3, 0.05, mat("#140c08"), 0, 1.15, back, g);                 // back panel
      for (const sx of [-1, 1]) box(0.08, 2.3, D, M.darkWood, sx * (w / 2 - 0.04), 1.15, zc, g); // sides
      box(w * 1.08, 0.12, D + 0.1, M.carve, 0, 2.34, zc, g);               // crown
      const crest = new THREE.Mesh(new THREE.CircleGeometry(w * 0.22, 16, 0, Math.PI), M.darkWood); crest.position.set(0, 2.4, zc + D / 2); crest.scale.y = 0.6; g.add(crest);
      for (const sx of [-1, 1]) { finial(M.darkWood, sx * w / 2, 2.4, zc, g, 1.2); scroll(M.carve, sx * w * 0.32, 2.46, zc + D / 2, 0.08, sx > 0 ? Math.PI : 0, 0.5, g); }
      for (let r = 0; r < 4; r++) {
        const sy = 0.12 + r * 0.55;
        box(w - 0.16, 0.05, D, M.wood, 0, sy, zc, g);                        // shelf board
        let x = -w / 2 + 0.12;
        const gap = o && o.id === "shelf_2" && r === 2;
        if (gap) g.userData.bookSlot = { x: 0.3, y: sy + 0.025 + 0.22, z: zc + 0.04, depth: D * 0.75 };
        while (x < w / 2 - 0.16) {
          if (gap && x > 0.12 && x < 0.37) { x = 0.37; continue; }   // the glowing book's slot
          const bw = 0.07 + rnd() * 0.07, bh = 0.3 + rnd() * 0.16, lean = rnd() < 0.12 ? 0.25 : 0;
          const b = box(bw, bh, D * 0.75, mat(["#5c0f1e", "#1f3d2a", "#2e2240", "#5a3a1a", "#3a0a14", "#b8a77a"][Math.floor(rnd() * 6)]), x + bw / 2, sy + 0.025 + bh / 2, zc + 0.04, g);
          b.rotation.z = lean; x += bw + 0.012 + lean * 0.1;
          if (rnd() < 0.3) box(bw * 0.9, 0.012, D * 0.76, M.gold, b.position.x, b.position.y + bh * 0.3, zc + 0.045, g); // gilt band
        }
      }
      for (let i = 0; i < 3; i++) { const web = box(0.3, 0.3, 0.005, new THREE.MeshBasicMaterial({ map: webTex, transparent: true, opacity: 0.6, depthWrite: false }), (rnd() - 0.5) * w * 0.7, 0.4 + rnd() * 1.5, zc + D / 2, g); web.castShadow = false; }
    },


    sandbox_cube(g) {
      const c = box(0.4, 0.4, 0.4, new THREE.MeshStandardMaterial({ color: "#7bd389", emissive: "#3fae6a", emissiveIntensity: 1.2, transparent: true, opacity: 0.7 }), 0, 2.45, 0, g);
      c.userData.spin = true;
    },
    mirror(g, w) {
      const fr = new THREE.Mesh(new THREE.TorusGeometry(w * 0.35, 0.06, 6, 20), M.gold); fr.scale.y = 1.3; g.add(fr);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(w * 0.33, 20), mat("#5a6470", { roughness: 0.35, metalness: 0.6 })); gl.scale.y = 1.3; gl.position.z = 0.01; g.add(gl);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), M.gold); sp.position.set(Math.cos(a) * w * 0.42, Math.sin(a) * w * 0.42 * 1.3, 0); sp.rotation.z = a - Math.PI / 2; g.add(sp); }
      for (let i = 0; i < 5; i++) { const sm = box(0.02, 0.15 + rnd() * 0.3, 0.012, mat("#2a2a20"), (rnd() - 0.5) * w * 0.5, -rnd() * 0.3, 0.015, g); sm.castShadow = false; } // grime streaks
    },

    sink(g, w, d) {
      // porcelain pedestal sink: fluted column, round basin with a dark drain, brass taps and spout
      const porcelain = mat("#dcd4c4", { roughness: 0.35 });
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.75, 12), porcelain); col.position.y = 0.38; col.castShadow = true; g.add(col);
      const bowlOuter = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), porcelain); bowlOuter.scale.set(1, 0.5, 0.8); bowlOuter.position.y = 0.95; bowlOuter.castShadow = true; g.add(bowlOuter);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 24), porcelain); rim.rotation.x = Math.PI / 2; rim.scale.y = 0.8; rim.position.y = 0.95; g.add(rim);
      const basin = new THREE.Mesh(new THREE.CircleGeometry(0.37, 20), mat("#9a9488", { roughness: 0.3 })); basin.rotation.x = -Math.PI / 2; basin.scale.y = 0.8; basin.position.y = 0.86; g.add(basin);
      const drain = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), mat("#1a1612")); drain.rotation.x = -Math.PI / 2; drain.position.y = 0.865; g.add(drain);
      const grime = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.36, 20), mat("#5a5040", { transparent: true, opacity: 0.4 })); grime.rotation.x = -Math.PI / 2; grime.scale.y = 0.8; grime.position.y = 0.867; g.add(grime);
      const brass = mat("#a8823a", { metalness: 0.7, roughness: 0.35 });
      const spout = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.98, -0.32), new THREE.Vector3(0, 1.2, -0.3), new THREE.Vector3(0, 1.1, -0.12)), 10, 0.02, 6), brass); g.add(spout);
      for (const sx of [-1, 1]) { cyl(0.02, 0.02, 0.1, brass, sx * 0.17, 1.03, -0.3, g, 6); const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), brass); knob.position.set(sx * 0.17, 1.1, -0.3); g.add(knob); }
      const drip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 5, 3), mat("#9fd6b0", { transparent: true, opacity: 0.8 })); drip.position.set(0, 1.06, -0.12); g.add(drip); g.userData.drip = drip;
    },
    wall_shelf(g, w) {
      box(w, 0.06, 0.3, M.darkWood, 0, 0, 0.15, g);
      for (const sx of [-1, 1]) scroll(M.carve, sx * w * 0.38, -0.12, 0.1, 0.09, Math.PI / 2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, g);
    },
    evals_kit(g) { box(0.4, 0.2, 0.25, M.brass, 0, 0.12, 0.15, g); for (let i = 0; i < 3; i++) cyl(0.03, 0.03, 0.2, glow(["#7bd389", "#ff9a3c", "#b06cff"][i], 1), -0.1 + i * 0.1, 0.3, 0.15, g); },
    bathtub(g, w, d) {
      // A grimy clawfoot tub hidden behind a mouldy shower curtain. There's a
      // dark shape behind the curtain... until you pull it back.
      const enamel = mat("#bdb5a0", { roughness: 0.6 }), grime = mat("#4a4636"), brass = mat("#6b5a33", { metalness: 0.6, roughness: 0.5 });
      const tub = new THREE.Mesh(new THREE.CapsuleGeometry(d * 0.42, w * 0.62, 6, 16), enamel);
      tub.rotation.z = Math.PI / 2; tub.scale.set(0.85, 1, 1); tub.position.y = 0.55; tub.castShadow = true; g.add(tub);
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(d * 0.36, w * 0.56, 4, 14), grime);
      inner.rotation.z = Math.PI / 2; inner.scale.set(0.5, 1, 1); inner.position.y = 0.78; g.add(inner); // the dark, stained inside
      box(w * 0.86, 0.05, d * 0.82, mat("#2e2c22"), 0, 0.97, 0, g).castShadow = false;                 // grime ring at the rim
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const foot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 5), brass);
        foot.position.set(sx * w * 0.33, 0.12, sz * d * 0.25); foot.rotation.x = Math.PI; g.add(foot);
      }
      cyl(0.03, 0.03, 0.5, brass, w * 0.42, 1.15, 0, g, 6); const spout = cyl(0.025, 0.025, 0.2, brass, w * 0.38, 1.38, 0, g, 6); spout.rotation.z = Math.PI / 2;
      // rail around the front and the left end
      const railY = 2.25;
      const rail1 = cyl(0.02, 0.02, w, M.iron, 0, railY, d / 2 + 0.08, g, 6); rail1.rotation.z = Math.PI / 2;
      const rail2 = cyl(0.02, 0.02, d, M.iron, -w / 2, railY, 0.04, g, 6); rail2.rotation.x = Math.PI / 2;
      // mouldy curtain fabric
      const curtainTex = canvasTex(256, 256, (c, W2, H2) => {
        c.fillStyle = "#cfc8b2"; c.fillRect(0, 0, W2, H2);
        for (let x = 0; x < W2; x += 16) { c.fillStyle = "rgba(0,0,0,0.06)"; c.fillRect(x, 0, 6, H2); }
        for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${40 + rnd() * 30},${60 + rnd() * 40},${40},${0.15 + rnd() * 0.3})`; c.beginPath(); c.arc(rnd() * W2, H2 - rnd() * rnd() * H2 * 0.6, 2 + rnd() * 10, 0, 7); c.fill(); }
        const gr = c.createLinearGradient(0, H2 * 0.6, 0, H2); gr.addColorStop(0, "rgba(60,70,40,0)"); gr.addColorStop(1, "rgba(50,60,30,0.55)");
        c.fillStyle = gr; c.fillRect(0, 0, W2, H2);
      });
      const cMat = new THREE.MeshStandardMaterial({ map: curtainTex, side: THREE.DoubleSide, transparent: true, opacity: 0.86, roughness: 0.95 });
      function curtainGeo(width) {
        const geo = new THREE.PlaneGeometry(width, 1.95, 48, 1);
        geo.translate(width / 2, 0, 0); // pivot at the left edge so it can bunch up
        return geo;
      }
      const front = new THREE.Mesh(curtainGeo(w), cMat);
      front.position.set(-w / 2, railY - 1.0, d / 2 + 0.08); g.add(front);
      const side = new THREE.Mesh(curtainGeo(d), cMat);
      side.rotation.y = Math.PI / 2; side.position.set(-w / 2, railY - 1.0, d / 2 + 0.08); g.add(side);
      for (let i = 0; i <= 10; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 8), M.iron); ring.position.set(-w / 2 + (i / 10) * w, railY - 0.02, d / 2 + 0.08); g.add(ring); }
      // the "person" behind the curtain: really a precarious stack of old chemical bottles in the tub
      const shape = new THREE.Group();
      const bottleMats = [];                                                         // they glow a little once the curtain is back
      const glass = (col) => { const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: col, emissiveIntensity: 0.12 }); bottleMats.push(m); return m; };
      const labelM = mat("#cbbf9a", { roughness: 0.9 }), cork = mat("#6a4a2a");
      const bottle = (x, y, z, r, h, col, neck = 0.35, tilt = 0) => {
        const bt = new THREE.Group(); bt.position.set(x, y, z); bt.rotation.z = tilt; shape.add(bt);
        const bm = glass(col);
        cyl(r, r, h, bm, 0, h / 2, 0, bt, 12);
        const sh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), bm); sh.position.y = h; bt.add(sh);
        cyl(r * neck, r * neck, h * 0.3, bm, 0, h + r * 0.8, 0, bt, 8);
        cyl(r * neck * 1.1, r * neck * 0.9, 0.05, cork, 0, h + r * 0.8 + h * 0.15 + 0.02, 0, bt, 8);
        cyl(r * 1.01, r * 1.01, h * 0.35, labelM, 0, h * 0.45, 0, bt, 12);       // faded label
        return bt;
      };
      box(0.5, 0.28, 0.4, M.wood, 0, 0.72, 0, shape);                              // crate in the tub
      bottle(0, 0.86, 0, 0.2, 0.42, "#2c5a3a", 0.3);                                // big green jug (torso)
      bottle(0, 1.5, 0, 0.11, 0.2, "#6a3a8a", 0.4);                                 // purple flask
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), glass("#8a5a1a")); head.position.set(0.03, 1.92, 0); shape.add(head); // round amber flask (head)
      cyl(0.04, 0.04, 0.1, glass("#8a5a1a"), 0.03, 2.1, 0, shape, 8);
      bottle(-0.3, 0.86, 0.02, 0.06, 0.55, "#3a6a7a", 0.5, 0.18);                   // leaning bottles (arms)
      bottle(0.3, 0.86, -0.02, 0.06, 0.5, "#7a2a3a", 0.5, -0.15);
      bottle(0.17, 0.86, 0.14, 0.05, 0.22, "#5a7a2a", 0.5);
      // a quarter bigger than before, sunk a little into the tub so the top still sits about level with the curtain rail
      const BS = 1.25, BY = 0.86 - 0.86 * BS - 0.26;
      shape.scale.setScalar(BS); shape.position.set(-w * 0.1, BY, -0.05); g.add(shape);
      g.userData.bottleMats = bottleMats;
      // a soft halo round the stack, so the eye goes to the bottles first once the curtain is back
      const haloTex = canvasTex(128, 128, (c, W2, H2) => { const gr = c.createRadialGradient(W2 / 2, H2 / 2, 0, W2 / 2, H2 / 2, W2 / 2); gr.addColorStop(0, "rgba(255,225,170,1)"); gr.addColorStop(0.45, "rgba(255,225,170,0.35)"); gr.addColorStop(1, "rgba(255,225,170,0)"); c.clearRect(0, 0, W2, H2); c.fillStyle = gr; c.fillRect(0, 0, W2, H2); });
      const bHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      bHalo.scale.set(1.5, 2.3, 1); bHalo.position.set(-w * 0.1, 1.5, -0.3); g.add(bHalo); g.userData.bottleHalo = bHalo;
      // its shadow on the curtain: a person-shaped silhouette, only while the curtain is closed
      const sil = new THREE.Group(), dark = new THREE.MeshBasicMaterial({ color: "#07040a", transparent: true, opacity: 0.7, depthWrite: false });
      const part = (geo, x, y, rz = 0) => { const m = new THREE.Mesh(geo, dark); m.position.set(x, y, 0); m.rotation.z = rz; m.scale.z = 0.15; if (!rz) m.renderOrder = 3; sil.add(m); };   // body, neck and head always draw after the curtain, so the shadow never sinks into the fabric
      part(new THREE.CapsuleGeometry(0.24, 0.5, 4, 10), 0, 1.15);
      part(new THREE.SphereGeometry(0.17, 12, 8), 0.04, 1.88);
      part(new THREE.CylinderGeometry(0.06, 0.09, 0.2, 8), 0.02, 1.62);
      for (const sx of [-1, 1]) part(new THREE.CapsuleGeometry(0.055, 0.6, 3, 6), sx * 0.33, 1.08, sx * 0.16);
      sil.scale.set(BS, BS, 1); sil.position.set(-w * 0.1, BY, d / 2 + 0.16); g.add(sil);   // printed just in front of the curtain so it reads through the fabric
      const back = new THREE.PointLight("#5fe08a", 2.2, 3, 1.6); back.position.set(0, 1.6, -d / 2 + 0.1); g.add(back);
      // something in the tub: slimy tentacles curling up out of the water and flopping over the rim
      const tentM = new THREE.MeshStandardMaterial({ color: "#6a3a7a", emissive: "#2a5a3a", emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1 });
      const suckM = mat("#c8a8c8", { roughness: 0.6 });
      const tentacles = [];
      const rimZ = d * 0.4, rimY = 0.98;
      for (const [x, len, curl, side] of [[-w * 0.3, 0.95, 1.0, 1], [-w * 0.02, 0.8, -0.9, 1], [w * 0.24, 1.0, 0.8, 1]]) {
        const zs = side * rimZ;
        const pts = [new THREE.Vector3(x - 0.05 * curl, 0.7, zs - side * 0.35), new THREE.Vector3(x, rimY + 0.14, zs - side * 0.08), new THREE.Vector3(x + 0.04 * curl, rimY + 0.06, zs + side * 0.1),
          new THREE.Vector3(x + 0.08 * curl, rimY - len * 0.45, zs + side * 0.2), new THREE.Vector3(x + 0.2 * curl, rimY - len * 0.85, zs + side * 0.18), new THREE.Vector3(x + 0.3 * curl, rimY - len + 0.05, zs + side * 0.35), new THREE.Vector3(x + 0.45 * curl, rimY - len + 0.02, zs + side * 0.5)];
        const curve = new THREE.CatmullRomCurve3(pts);
        const SEG = 40, RAD = 8, geo = new THREE.TubeGeometry(curve, SEG, 0.11, RAD);
        const pos = geo.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i <= SEG; i++) { const u = i / SEG, c = curve.getPointAt(u), k = 1 - u * 0.85;
          for (let j = 0; j <= RAD; j++) { const idx = i * (RAD + 1) + j; v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c); pos.setXYZ(idx, v.x, v.y, v.z); } }
        geo.computeVertexNormals();
        const tg = new THREE.Group(); g.add(tg);
        const t = new THREE.Mesh(geo, tentM); t.castShadow = true; tg.add(t);
        for (let k = 0.35; k < 0.95; k += 0.09) { const p = curve.getPointAt(k), r = 0.11 * (1 - k * 0.85); const s = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 6, 4), suckM); s.position.copy(p).add(new THREE.Vector3(0, 0, -side * r * 0.85)); tg.add(s); }
        tentacles.push({ tg, pivot: new THREE.Vector3(x, rimY, zs), phase: rnd() * 6 });
      }
      g.userData.tentacles = tentacles;
      g.userData.curtain = { front, side, shape, sil, back, w, open: 0, t0: rnd() * 10 };
    },
    crate(g, w, d) {
      box(w * 0.9, w * 0.8, d * 0.9, M.wood, 0, w * 0.4, 0, g);
      for (const y of [0.15, 0.65]) box(w * 0.92, 0.05, d * 0.92, M.iron, 0, w * y, 0, g);
    },
    barrel(g, w) { cyl(w * 0.4, w * 0.36, w * 1.1, M.wood, 0, w * 0.55, 0, g, 10); },
    slime_puddle(g, w, d) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), glow("#3fae6a", 0.8));
      p.rotation.x = -Math.PI / 2; p.scale.set(w, d, 1); p.position.y = 0.02; g.add(p);
    },
    front_door(g, w) {
      // grand double front door: tall pointed arch, carved stone surround, iron strapwork,
      // and red light leaking through every gap, as if something waits outside
      const W2 = 3.6, H2 = 3.55, SP = 2.35, red = "#ff3a2a"; // as tall as the other doors
      const chessTex = canvasTex(64, 64, (c, W3, H3) => {
        c.fillStyle = "#0a0204"; c.fillRect(0, 0, W3, H3);
        c.save(); c.translate(W3 / 2, H3 / 2); c.rotate(Math.PI / 4); c.fillStyle = "#ff3a2a";
        const q = 16; for (let y = -4; y < 4; y++) for (let x = -4; x < 4; x++) if ((x + y) & 1) c.fillRect(x * q, y * q, q, q);
        c.restore();
      });
      chessTex.repeat.set(3, 3);
      const leak = new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: 0.9 });
      const archShape = (ww, hh, spring) => { const sh = new THREE.Shape(); sh.moveTo(-ww / 2, 0); sh.lineTo(-ww / 2, spring); sh.quadraticCurveTo(-ww / 2, hh - 0.1, 0, hh); sh.quadraticCurveTo(ww / 2, hh - 0.1, ww / 2, spring); sh.lineTo(ww / 2, 0); sh.closePath(); return sh; };
      const base = new THREE.Group(); base.position.y = -1.15; g.add(base);   // wall objects are centred at 1.15; build from the floor
      // carved stone surround in stepped rings
      for (const [pad, col, z] of [[0.55, "#3a3248", -0.05], [0.4, "#4a4258", 0.0], [0.26, "#2c2636", 0.04]]) {
        const m = new THREE.Mesh(new THREE.ShapeGeometry(archShape(W2 + pad * 2, H2 + pad * 0.4, SP)), mat(col)); m.position.z = z; base.add(m);
      }
      // the red glow leaking around the door (outline + spill)
      const glowM = new THREE.Mesh(new THREE.ShapeGeometry(archShape(W2 + 0.12, H2 + 0.08, SP)), leak); glowM.position.z = 0.06; base.add(glowM);
      // two oak leaves with a thin red seam between them and under them
      for (const sx of [-1, 1]) {
        const leafShape = new THREE.Shape();
        const hw = W2 / 2 - 0.03;
        if (sx < 0) { leafShape.moveTo(-hw - 0.0, 0); leafShape.lineTo(-hw, SP); leafShape.quadraticCurveTo(-hw, H2 - 0.15, -0.03, H2 - 0.04); leafShape.lineTo(-0.03, 0.04); }
        else { leafShape.moveTo(hw, 0); leafShape.lineTo(hw, SP); leafShape.quadraticCurveTo(hw, H2 - 0.15, 0.03, H2 - 0.04); leafShape.lineTo(0.03, 0.04); }
        leafShape.closePath();
        // wrought iron leaves: dark riveted plates with raised panels
        const ironPlate = mat("#1a1a20", { metalness: 0.75, roughness: 0.45 }), ironRaised = mat("#2a2a32", { metalness: 0.8, roughness: 0.4 });
        const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(leafShape, { depth: 0.08, bevelEnabled: false }), ironPlate); leaf.position.z = 0.07; leaf.castShadow = true; base.add(leaf);
        // black wrought-iron grille laid over the leaf: a frame of rails and stiles with
        // spear tips, filled with curling scrolls, and an arched window glowing red above
        const wrought = mat("#07070a", { metalness: 0.6, roughness: 0.5 });
        const Z = 0.17;
        const bar = (x0, y0, x1, y1, t = 0.05) => { const len = Math.hypot(x1 - x0, y1 - y0); const b = box(len, t, 0.035, wrought, (x0 + x1) / 2, (y0 + y1) / 2, Z, base); b.rotation.z = Math.atan2(y1 - y0, x1 - x0); };
        const spear = (x, y, ang) => { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), wrought); sp.position.set(x, y, Z); sp.rotation.z = ang; base.add(sp); };
        const spiral = (cx, cy, r0, turns, dir, ang0) => {
          const pts = []; for (let k = 0; k <= 40; k++) { const t = k / 40, a = ang0 + dir * t * turns * Math.PI * 2, r = r0 * (1 - t * 0.82); pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Z)); }
          base.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.016, 5), wrought));
        };
        const x0 = sx * 0.12, x1 = sx * 1.64;
        bar(x0, 0.15, x0, 2.25); bar(x1, 0.15, x1, 2.25);                          // stiles
        for (const y of [0.18, 0.95, 1.72, 2.25]) { bar(x0, y, x1, y); spear(sx * 1.74, y, -sx * Math.PI / 2); }  // rails with spear tips at the outer edge
        for (const [cy, flip] of [[0.56, 1], [1.33, -1]]) {                       // scroll panels
          spiral(sx * 0.55, cy, 0.24, 1.25, sx * flip, 0);
          spiral(sx * 1.2, cy + 0.04, 0.2, 1.1, -sx * flip, Math.PI);
          bar(sx * 0.32, cy - 0.3, sx * 0.9, cy + 0.32, 0.03); bar(sx * 1.45, cy - 0.3, sx * 0.95, cy + 0.3, 0.03); // sweeping tendrils
        }
        // the arched upper window (red light from outside) with curling bars over it
        const win = new THREE.Shape(); const wx0 = sx * 0.32, wx1 = sx * 1.44;
        win.moveTo(wx0, 2.3); win.lineTo(wx1, 2.3); win.lineTo(wx1, 2.7); win.quadraticCurveTo(wx1, 3.05, (wx0 + wx1) / 2, 3.12); win.quadraticCurveTo(wx0, 3.05, wx0, 2.7); win.closePath();
        const winM = new THREE.Mesh(new THREE.ShapeGeometry(win), new THREE.MeshBasicMaterial({ map: chessTex, transparent: true, opacity: 0.9 })); // diagonal red/black chequer
        winM.position.z = 0.155; base.add(winM);
        bar(wx0, 2.3, wx1, 2.3, 0.04);
        
        // vertical planks showing through between the ironwork
        for (let k = 1; k < 7; k++) box(0.012, 2.6, 0.01, mat("#0c0c10"), sx * (0.12 + k * 0.22), 1.35, 0.152, base);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 16), M.brass); ring.position.set(sx * 0.18, 1.25, 0.2); base.add(ring);
        const rose = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), M.iron); rose.position.set(sx * 0.18, 1.37, 0.17); base.add(rose);
      }
      // a red pool of light spilling onto the floor in front of the door
      // two trapezoids of red light on the floor, cast through the two door windows
      const pool = new THREE.Group(); base.add(pool);
      for (const sx of [-1, 1]) {
        const tz = new THREE.Shape();
        tz.moveTo(sx * 0.3, 0); tz.lineTo(sx * 1.45, 0); tz.lineTo(sx * 1.9, 1.6); tz.lineTo(sx * 0.15, 1.6); tz.closePath();
        const m = new THREE.Mesh(new THREE.ShapeGeometry(tz), new THREE.MeshBasicMaterial({ map: chessTex, color: "#ff8070", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2; m.position.set(0, 0.02, 0.25); pool.add(m);
      }
      pool.material = pool.children[0].material;
      // keystone with a carved skull and two red-glass lanterns either side
      const key = box(0.32, 0.3, 0.14, mat("#4a4258"), 0, H2 + 0.12, 0.08, base);
      const sk = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), bone); sk.position.set(0, H2 + 0.12, 0.17); base.add(sk);
      for (const sx of [-1, 1]) {
        const L = new THREE.Group(); L.position.set(sx * (W2 / 2 + 0.75), 1.9, 0.25); base.add(L);
        box(0.22, 0.03, 0.22, M.iron, 0, -0.17, 0, L); box(0.24, 0.03, 0.24, M.iron, 0, 0.17, 0, L);
        for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.018, 0.34, 0.018, M.iron, ax * 0.1, 0, az * 0.1, L);
        const redGlass = new THREE.MeshStandardMaterial({ color: "#ff5a40", emissive: "#ff2a1a", emissiveIntensity: 2.2, transparent: true, opacity: 0.55, depthWrite: false });
        box(0.18, 0.3, 0.18, redGlass, 0, 0, 0, L);
        for (const ax of [-0.045, 0.045]) for (const face of [-1, 1]) box(0.008, 0.3, 0.008, M.iron, ax, 0, face * 0.092, L);   // lattice bars over the glass
        box(0.19, 0.008, 0.008, M.iron, 0, 0.04, 0.092, L); box(0.19, 0.008, 0.008, M.iron, 0, -0.06, 0.092, L);
        cyl(0.025, 0.025, 0.1, mat("#e8dcc0"), 0, -0.1, 0, L, 8);                                                // candle inside
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: "#d8643a" })); fl.scale.y = 1.8; fl.position.y = -0.01; L.add(fl);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshBasicMaterial({ color: "#c82a14", transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })); L.add(halo);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.18, 4), M.iron); cap.rotation.y = Math.PI / 4; cap.position.y = 0.27; L.add(cap);
        const fin = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), M.iron); fin.position.y = 0.38; L.add(fin);
        const bracket = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 5, 12, Math.PI), M.iron); bracket.position.set(0, 0.3, -0.16); bracket.rotation.y = Math.PI / 2; L.add(bracket);
        const pl = new THREE.PointLight("#ff4a2a", 1.0, 3.2, 1.6); pl.position.set(0, 0, 0.15); L.add(pl);
        (g.userData.redLanterns = g.userData.redLanterns || []).push({ fl, halo, pl, glass: redGlass, phase: sx * 2.3 });
      }
      const glowLight = new THREE.PointLight("#ff3a2a", 4, 5, 1.6); glowLight.position.set(0, 1.3, 0.6); base.add(glowLight);
      // a wide, soft red wash over the wall and floor around the doorway, with pockets of eerie green low at the sides
      const wash = new THREE.PointLight("#c8281e", 5, 11, 1.1); wash.position.set(0, 2.6, 2.6); base.add(wash);
      const greens = [];
      for (const sx of [-1, 1]) { const gl = new THREE.PointLight("#3fd07a", 1.6, 4.5, 1.5); gl.position.set(sx * 3.6, 0.5, 1.2); base.add(gl); greens.push(gl); }
      const hazeTex = canvasTex(256, 128, (c, W2, H2) => {
        const r = c.createRadialGradient(W2 / 2, H2 * 0.55, 4, W2 / 2, H2 * 0.55, W2 * 0.5); r.addColorStop(0, "rgba(255,60,40,0.55)"); r.addColorStop(0.5, "rgba(200,30,30,0.22)"); r.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = r; c.fillRect(0, 0, W2, H2);
        for (const x of [W2 * 0.12, W2 * 0.88]) { const gg = c.createRadialGradient(x, H2 * 0.85, 2, x, H2 * 0.85, W2 * 0.16); gg.addColorStop(0, "rgba(70,220,130,0.35)"); gg.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gg; c.fillRect(0, 0, W2, H2); }
      });
      const haze = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 4.2), new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      haze.position.set(0, 0.75, 0.3); base.add(haze);
      g.userData.doorMood = { wash, greens, haze };
      g.userData.redDoor = { glowM, pool, glowLight, lanterns: g.userData.redLanterns, mood: g.userData.doorMood };
    },

    cellar_door(g, w, d) {
      // (internally still "cellar_door") the chains on the attic door: two crossed chains, a heavy
      // padlock plate and a glowing W-shaped keyhole. It all vanishes when the W key is used.
      const Z = 0.42, chainM = mat("#3a3640", { metalness: 0.7, roughness: 0.4 });
      for (const sgn of [-1, 1]) {
        for (let k = 0; k < 13; k++) { const u = k / 12 - 0.5; const link = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 5, 10), chainM);
          link.position.set(u * 2.7, 1.3 + sgn * u * 1.5, Z); link.rotation.set(0, k % 2 ? Math.PI / 2 : 0, sgn * 0.5); g.add(link); }
      }
      box(0.62, 0.5, 0.1, M.iron, 0, 1.3, Z + 0.04, g);                                                          // padlock plate
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI), chainM); shackle.position.set(0, 1.55, Z + 0.04); g.add(shackle);
      const kh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 96, (c, W2, H2) => {
        c.clearRect(0, 0, W2, H2); c.strokeStyle = "#7bd389"; c.lineWidth = 12; c.lineJoin = "miter"; c.shadowColor = "#7bd389"; c.shadowBlur = 10;
        c.beginPath(); c.moveTo(14, 16); c.lineTo(38, 80); c.lineTo(64, 34); c.lineTo(90, 80); c.lineTo(114, 16); c.stroke();
      }) }));
      kh.position.set(0, 1.3, Z + 0.1); g.add(kh);                                                               // a glowing W-shaped keyhole
    },
  };
  BUILD.painting_1 = BUILD.painting_2 = BUILD.painting_3 = BUILD.painting;
  const metal = mat("#8a8d9c", { metalness: 0.75, roughness: 0.35 });
  const bone = mat("#d8cfb8", { roughness: 0.7 });
  BUILD.armour = (g) => {
    box(0.7, 0.15, 0.6, M.stone, 0, 0.07, 0, g);
    for (const sx of [-1, 1]) { cyl(0.07, 0.08, 0.7, metal, sx * 0.11, 0.5, 0, g); box(0.13, 0.08, 0.2, metal, sx * 0.11, 0.18, 0.04, g); }
    box(0.42, 0.18, 0.3, metal, 0, 0.92, 0, g);                         // tasset
    const chest = cyl(0.2, 0.24, 0.5, metal, 0, 1.25, 0, g, 8);        // breastplate
    box(0.04, 0.4, 0.02, mat("#5a5d6c"), 0, 1.27, 0.2, g);              // ridge
    for (const sx of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), metal);
      pauldron.position.set(sx * 0.3, 1.45, 0); pauldron.castShadow = true; g.add(pauldron);
      cyl(0.055, 0.05, 0.5, metal, sx * 0.31, 1.15, 0, g);
    }
    cyl(0.15, 0.15, 0.3, metal, 0, 1.72, 0, g, 10);                     // helmet
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), metal); dome.position.y = 1.87; g.add(dome);
    box(0.24, 0.025, 0.02, mat("#050407"), 0, 1.74, 0.15, g);           // visor slit (dark)
    box(0.18, 0.012, 0.022, glow("#5fe08a", 1.5), 0, 1.74, 0.152, g);   // faint green glint inside...
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 5), mat("#5a1a2a")); plume.position.set(0, 2.05, -0.05); plume.rotation.x = -0.5; g.add(plume);
    cyl(0.02, 0.02, 2.3, M.darkWood, 0.42, 1.2, 0.05, g, 5);             // halberd
    const blade = box(0.2, 0.3, 0.02, metal, 0.5, 2.15, 0.05, g); blade.rotation.z = 0.2;
    box(0.04, 0.08, 0.3, mat("#7a3a1a"), -0.05, 0.98, 0.16, g);          // rust streak
  };
  BUILD.skeleton = (g, w) => {
    box(w * 0.9, 0.35, 0.7, M.stone, 0, 0.17, 0, g);                    // plinth
    box(w * 0.95, 0.05, 0.75, mat("#5a4e70"), 0, 0.36, 0, g);
    const H = 0.38;
    for (const [lx, lz] of [[-0.45, -0.15], [-0.45, 0.15], [0.4, -0.15], [0.4, 0.15]]) cyl(0.025, 0.02, 0.7, bone, lx, H + 0.35, lz, g, 5); // legs
    for (let i = 0; i < 11; i++) {                                          // spine
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), bone); v.position.set(-0.55 + i * 0.1, H + 0.75 + Math.sin(i / 10 * Math.PI) * 0.05, 0); g.add(v);
    }
    for (let i = 0; i < 6; i++) {                                           // ribs
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.17 - i * 0.012, 0.012, 4, 12, Math.PI), bone);
      rib.position.set(-0.25 + i * 0.09, H + 0.68, 0); rib.rotation.y = Math.PI / 2; rib.rotation.z = Math.PI; g.add(rib);
    }
    const neck = cyl(0.025, 0.025, 0.4, bone, 0.62, H + 0.95, 0, g, 5); neck.rotation.z = -0.8;
    const skull = box(0.16, 0.14, 0.13, bone, 0.82, H + 1.12, 0, g);     // skull
    const snout = box(0.2, 0.08, 0.09, bone, 0.95, H + 1.07, 0, g); snout.rotation.z = -0.25;
    for (const sz of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), glow("#5fe08a", 2)); eye.position.set(0.86, H + 1.14, sz * 0.066); g.add(eye); // eerie eye glow
      // branching antlers
      const base = new THREE.Vector3(0.78, H + 1.2, sz * 0.05);
      const tine = (from, dir, len, depth) => {
        const to = from.clone().add(dir.clone().multiplyScalar(len));
        const c = cyl(0.012, 0.018, len, bone, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, g, 4);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        if (depth > 0) { tine(to, dir.clone().add(new THREE.Vector3(-0.3, 0.2, sz * 0.4)).normalize(), len * 0.7, depth - 1); tine(to, dir.clone().add(new THREE.Vector3(0.35, 0.3, -sz * 0.1)).normalize(), len * 0.6, depth - 1); }
      };
      tine(base, new THREE.Vector3(-0.2, 1, sz * 0.5).normalize(), 0.22, 2);
    }
    const tail = cyl(0.015, 0.01, 0.15, bone, -0.66, H + 0.7, 0, g, 4); tail.rotation.z = 0.9;
  };
  // cobweb: a translucent web stretched across a corner of the wall
  const webTex = canvasTex(256, 256, (c, w, h) => {
    // thin radial threads from the corner with sagging spiral strands, a few broken
    c.strokeStyle = "rgba(225,225,240,0.5)"; c.lineWidth = 0.7;
    const spokes = 7;
    for (let a = 0; a <= spokes; a++) { const ang = (a / spokes) * Math.PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(ang) * (200 + rnd() * 50), Math.sin(ang) * (200 + rnd() * 50)); c.stroke(); }
    for (let r = 26; r < 230; r += 20 + rnd() * 8) {
      for (let a = 0; a < spokes; a++) {
        if (rnd() < 0.15) continue;                      // broken strand
        const a0 = (a / spokes) * Math.PI / 2, a1 = ((a + 1) / spokes) * Math.PI / 2, am = (a0 + a1) / 2;
        c.beginPath(); c.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
        c.quadraticCurveTo(Math.cos(am) * (r - 9), Math.sin(am) * (r - 9), Math.cos(a1) * r, Math.sin(a1) * r); c.stroke(); // sag inward
      }
    }
  });

  BUILD.cobweb = (g, w, d, o) => {
    // the web radiates from its top-left corner; mirrored when it spreads leftwards from the corner
    const web = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.45 }));
    const left = o && o.side === "left";
    web.scale.x = left ? -1 : 1; web.position.set(left ? -0.35 : 0.35, -0.35, 0.03); g.add(web);
    g.userData.cobwebCorner = true;
  };
  // ornate crested frame: a mirror (silvered, spotted glass) or a dark old painting
  function ornateFrame(g, mirror) {
    const metal = mirror ? mat("#8a8d9c", { metalness: 0.7, roughness: 0.35 }) : M.gold;
    const fw = 0.62, fh = 0.95;
    // frame: chunky beaded border
    for (const [bw, bh, x, y] of [[fw, 0.08, 0, fh / 2], [fw, 0.08, 0, -fh / 2], [0.08, fh, fw / 2, 0], [0.08, fh, -fw / 2, 0]]) box(bw, bh, 0.07, metal, x, y, 0, g);
    for (let i = 0; i < 14; i++) { const a = i / 14, b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), metal); const side = i % 2; b.position.set(side ? fw / 2 : -fw / 2, -fh / 2 + a * fh, 0.04); g.add(b); }
    // carved crest on top: curls, a shell and a little finial
    const crest = new THREE.Group(); crest.position.y = fh / 2 + 0.06; g.add(crest);
    for (const sx of [-1, 1]) { scroll(metal, sx * 0.16, 0.06, 0.02, 0.08, sx > 0 ? Math.PI : 0, 0.3, crest); scroll(metal, sx * 0.08, 0.16, 0.02, 0.05, sx > 0 ? 0 : Math.PI, -0.4, crest); }
    const shell = new THREE.Mesh(new THREE.CircleGeometry(0.1, 9, 0, Math.PI), metal); shell.position.set(0, 0.08, 0.035); crest.add(shell);
    finial(metal, 0, 0.18, 0.02, crest, 0.7);
    for (const sx of [-1, 1]) { const curl = scroll(metal, sx * (fw / 2 + 0.03), -fh / 2 - 0.04, 0.02, 0.06, sx > 0 ? Math.PI : 0, Math.PI, g); }
    // the picture or the glass
    if (mirror) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.1, fh - 0.1), mat("#3c4450", { metalness: 0.8, roughness: 0.25 })); glass.position.z = 0.02; g.add(glass);
    } else {
      const canvasT = canvasTex(128, 192, (c, W2, H2) => {
        const bg = c.createRadialGradient(W2 * 0.55, H2 * 0.35, 5, W2 / 2, H2 / 2, H2 * 0.7); bg.addColorStop(0, "#8a5a2a"); bg.addColorStop(1, "#140a06");
        c.fillStyle = bg; c.fillRect(0, 0, W2, H2);
        c.fillStyle = "#1a0e08"; c.beginPath(); c.ellipse(W2 * 0.5, H2 * 0.62, W2 * 0.22, H2 * 0.3, 0, 0, Math.PI * 2); c.fill(); // a hooded figure
        c.fillStyle = "#c89a6a"; c.beginPath(); c.arc(W2 * 0.52, H2 * 0.36, W2 * 0.07, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,200,120,0.5)"; c.beginPath(); c.arc(W2 * 0.7, H2 * 0.5, 4, 0, Math.PI * 2); c.fill();   // candle
      });
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.1, fh - 0.1), new THREE.MeshStandardMaterial({ map: canvasT, roughness: 0.9 })); pic.position.z = 0.02; g.add(pic);
    }
  }
  function portraitTex(seedOff) {
    return canvasTex(128, 128, (c, W2, H2) => {
      const bg = c.createRadialGradient(W2 * 0.5, H2 * 0.35, 5, W2 / 2, H2 / 2, H2 * 0.7); bg.addColorStop(0, ["#7a4a2a", "#3a4a5a", "#5a2a3a"][seedOff % 3]); bg.addColorStop(1, "#120806");
      c.fillStyle = bg; c.fillRect(0, 0, W2, H2);
      c.fillStyle = "#140a08"; c.beginPath(); c.ellipse(W2 * 0.5, H2 * 0.78, W2 * 0.3, H2 * 0.32, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#c89a7a"; c.beginPath(); c.ellipse(W2 * 0.5, H2 * 0.42, W2 * 0.12, H2 * 0.15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#1a0e0a"; c.beginPath(); c.arc(W2 * 0.5, H2 * 0.33, W2 * 0.14, Math.PI, 0); c.fill(); // hair
    });
  }
  // round gilt frame (an oval portrait)
  BUILD.painting_round = (g) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 28), M.gold); ring.scale.y = 1.25; g.add(ring);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), M.gold); b.position.set(Math.cos(a) * 0.41, Math.sin(a) * 0.51, 0.03); g.add(b); }
    const pic = new THREE.Mesh(new THREE.CircleGeometry(0.31, 28), new THREE.MeshStandardMaterial({ map: portraitTex(1), roughness: 0.9 })); pic.scale.y = 1.25; pic.position.z = 0.01; g.add(pic);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 5, 10), M.gold); bow.position.set(0, 0.5, 0.03); g.add(bow);
  };
  // small square frame with corner blocks
  const chalkIconTex = canvasTex(128, 128, (c, W2, H2) => {
    c.fillStyle = "#2a1810"; c.fillRect(0, 0, W2, H2);
    c.fillStyle = "#4a2c1a"; c.fillRect(14, 22, 100, 72);                 // wooden frame
    c.fillStyle = "#173a2a"; c.fillRect(20, 28, 88, 60);                 // board
    c.strokeStyle = "rgba(220,235,225,0.85)"; c.lineWidth = 3; c.lineCap = "round";
    c.beginPath(); c.moveTo(30, 44); c.lineTo(62, 44); c.moveTo(30, 58); c.lineTo(80, 58); c.moveTo(30, 72); c.lineTo(52, 72); c.stroke();  // scribbles
    c.beginPath(); c.arc(86, 66, 9, 0, Math.PI * 1.6); c.stroke();
    c.fillStyle = "#4a2c1a"; c.fillRect(24, 94, 80, 6);                  // chalk ledge
    c.fillStyle = "#e8e4d8"; c.fillRect(40, 92, 14, 4);                  // chalk stick
    c.strokeStyle = "#4a2c1a"; c.lineWidth = 4; c.beginPath(); c.moveTo(40, 100); c.lineTo(30, 118); c.moveTo(88, 100); c.lineTo(98, 118); c.stroke(); // easel legs
  });
  BUILD.painting_small = (g, w, d, o) => {
    const fw = 0.4;
    for (const [bw, bh, x, y] of [[fw, 0.06, 0, fw / 2], [fw, 0.06, 0, -fw / 2], [0.06, fw, fw / 2, 0], [0.06, fw, -fw / 2, 0]]) box(bw, bh, 0.05, M.darkWood, x, y, 0, g);
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) box(0.09, 0.09, 0.06, M.gold, sx * fw / 2, sy * fw / 2, 0.005, g);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.06, fw - 0.06), new THREE.MeshStandardMaterial({ map: o && o.icon === "chalkboard" ? chalkIconTex : portraitTex(2), roughness: 0.9 })); pic.position.z = 0.02; g.add(pic);
  };
  // Small set-dressing for props Polly now talks about, so what she describes is actually there.
  const stampTex = (word) => canvasTex(256, 96, (c, W2, H2) => {
    c.clearRect(0, 0, W2, H2); c.strokeStyle = c.fillStyle = "rgba(150,24,20,0.9)"; c.lineWidth = 6; c.strokeRect(8, 10, W2 - 16, H2 - 20);
    c.font = "bold 50px Impact, 'Arial Black', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(word, W2 / 2, H2 / 2 + 2);
  });
  const newsTex = canvasTex(256, 192, (c, W2, H2) => {
    c.fillStyle = "#e9e2cf"; c.fillRect(0, 0, W2, H2);
    c.fillStyle = "#1a1612"; c.font = "bold 18px Georgia, serif"; c.textAlign = "center"; c.fillText("THE DAILY THREAD", W2 / 2, 22);
    c.fillRect(12, 30, W2 - 24, 2);
    c.font = "bold 17px Georgia, serif"; c.fillText("LANGCHAIN ANNOUNCES", W2 / 2, 56); c.font = "bold 26px Georgia, serif"; c.fillText("SERIES C", W2 / 2, 86);
    c.fillStyle = "rgba(26,22,18,0.55)"; for (let col = 0; col < 3; col++) for (let ln = 0; ln < 9; ln++) c.fillRect(14 + col * 78, 100 + ln * 9, 66 - (ln % 3) * 8, 4);
  });
  const DETAILS = {
    nightstand_l: (g) => {                                                 // a pile of unopened letters
      const paper = mat("#e6dcc2");
      for (let i = 0; i < 6; i++) { const env = box(0.3, 0.016, 0.2, paper, -0.02 + (i % 2) * 0.04, 0.674 + i * 0.017, (i % 3) * 0.02 - 0.02, g); env.rotation.y = (i - 2.5) * 0.2; }
      cyl(0.028, 0.028, 0.008, mat("#8a1414"), 0.0, 0.674 + 6 * 0.017, 0.0, g, 12);
    },
    hall_table_2: (g) => {                                                 // an open guest book with a pen
      const H = 0.9;
      box(0.42, 0.02, 0.28, mat("#4a1418"), 0, H, -0.08, g);
      for (const sx of [-1, 1]) { const pg = box(0.19, 0.012, 0.25, mat("#eee6d2"), sx * 0.1, H + 0.016, -0.08, g); pg.rotation.z = sx * -0.06; }
      const pen = cyl(0.006, 0.006, 0.2, mat("#141014"), 0.12, H + 0.03, -0.02, g, 6); pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5;
    },
    crate_1: (g, w) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.26), new THREE.MeshBasicMaterial({ map: stampTex("DELETED"), transparent: true })); s.rotation.x = -Math.PI / 2; s.rotation.z = 0.12; s.position.set(0, w * 0.8 + 0.003, 0); g.add(s); },
    crate_2: (g, w) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.26), new THREE.MeshBasicMaterial({ map: stampTex("ARCHIVED"), transparent: true })); s.rotation.x = -Math.PI / 2; s.rotation.z = -0.1; s.position.set(0, w * 0.8 + 0.003, 0); g.add(s); },
    crate_3: (g, w) => {                                                   // tangled cables and a dead bulb on the lid
      const cable = mat("#141016");
      for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.1 + i * 0.03, 0.01, 4, 16), cable); t.rotation.x = Math.PI / 2 + (i - 2) * 0.25; t.rotation.y = i * 0.7; t.position.set((i % 3 - 1) * 0.08, w * 0.8 + 0.03, (i % 2) * 0.06 - 0.03); g.add(t); }
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat("#9a9488", { transparent: true, opacity: 0.6 })); bulb.position.set(0.18, w * 0.8 + 0.05, 0.12); g.add(bulb);
    },
    barrel_1: (g, w) => {                                                  // a newspaper sticking up out of the barrel (easter egg)
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ map: newsTex, side: THREE.DoubleSide }));
      sheet.position.set(0, w * 1.1 + 0.08, 0.04); sheet.rotation.x = -0.75; sheet.rotation.z = 0.1; g.add(sheet);
    },
  };
  BUILD.ornate_mirror = (g) => ornateFrame(g, true);
  // --- more gothic frames, in varied shapes and sizes ---
  const frameBlack = mat("#16121a", { metalness: 0.35, roughness: 0.32 });
  function landscapeTex(seed) {
    return canvasTex(160, 128, (c, W2, H2) => {
      const sky = c.createLinearGradient(0, 0, 0, H2); sky.addColorStop(0, ["#1a1430", "#142026"][seed % 2]); sky.addColorStop(1, ["#4a2a3a", "#2a3a2e"][seed % 2]);
      c.fillStyle = sky; c.fillRect(0, 0, W2, H2);
      c.fillStyle = "#e8e0c0"; c.beginPath(); c.arc(W2 * 0.72, H2 * 0.25, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#0e0a10"; c.beginPath(); c.moveTo(0, H2 * 0.75);
      for (let x = 0; x <= W2; x += 10) c.lineTo(x, H2 * (0.7 + Math.sin(x * 0.05 + seed) * 0.06)); c.lineTo(W2, H2); c.lineTo(0, H2); c.fill();
      c.fillRect(W2 * 0.18, H2 * 0.45, 26, 30); c.beginPath(); c.moveTo(W2 * 0.18 - 3, H2 * 0.45); c.lineTo(W2 * 0.18 + 13, H2 * 0.3); c.lineTo(W2 * 0.18 + 29, H2 * 0.45); c.fill(); // tiny manor
      c.fillRect(W2 * 0.18 + 18, H2 * 0.3, 4, 12);
      c.strokeStyle = "#0e0a10"; c.lineWidth = 2; c.beginPath(); c.moveTo(W2 * 0.85, H2 * 0.75); c.lineTo(W2 * 0.86, H2 * 0.45); c.lineTo(W2 * 0.8, H2 * 0.36); c.moveTo(W2 * 0.86, H2 * 0.5); c.lineTo(W2 * 0.93, H2 * 0.4); c.stroke(); // dead tree
      c.fillStyle = "rgba(120,200,140,0.6)"; c.fillRect(W2 * 0.18 + 8, H2 * 0.52, 4, 4);   // one lit window
    });
  }
  // a tall gothic wall mirror: black pointed-arch frame with crockets up the arch, a finial at the point,
  // silver beading and a carved base. The glass is cracked from an impact low on one side.
  BUILD.gothic_mirror = (g) => {
    const hw = 0.92, B0 = -1.93, SH = 0.3, AP = 1.0;          // twice as wide, and standing on the floor
    const arch = (k, pad) => { const sh = new THREE.Shape(), w2 = hw * k + pad; sh.moveTo(-w2, B0 - pad); sh.lineTo(-w2, SH); sh.quadraticCurveTo(-w2, 0.78 + pad * 0.6, 0, AP + pad * 1.5); sh.quadraticCurveTo(w2, 0.78 + pad * 0.6, w2, SH); sh.lineTo(w2, B0 - pad); sh.closePath(); return sh; };
    const outer = arch(1, 0.13); outer.holes.push(arch(1, 0));
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.09, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 18 }), frameBlack); frame.castShadow = true; g.add(frame);
    const inner = arch(1, 0.035); inner.holes.push(arch(1, 0));
    const silver = mat("#9aa0b4", { metalness: 0.8, roughness: 0.3 });
    const fillet = new THREE.Mesh(new THREE.ExtrudeGeometry(inner, { depth: 0.11, bevelEnabled: false, curveSegments: 18 }), silver); g.add(fillet);                     // silver inner edge
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(arch(1, 0), 18), new THREE.MeshStandardMaterial({ color: "#232a3a", metalness: 0.9, roughness: 0.16, emissive: "#161e36", emissiveIntensity: 0.6 })); glass.position.z = 0.02; g.add(glass);
    const crackTex = canvasTex(160, 320, (c, W2, H2) => {
      c.clearRect(0, 0, W2, H2); c.strokeStyle = "#dfe8ff"; c.lineCap = "round"; const ox = W2 * 0.66, oy = H2 * 0.68;
      const rays = [];
      for (let k = 0; k < 11; k++) { const a = k * 0.571 + 0.15; let x = ox, y = oy; const pts = [[x, y]]; for (let st = 0; st < 9; st++) { x += Math.cos(a + (rnd() - 0.5) * 0.6) * 24; y += Math.sin(a + (rnd() - 0.5) * 0.6) * 24; pts.push([x, y]); } rays.push(pts);
        c.lineWidth = 1.6; c.beginPath(); pts.forEach(([px2, py2], i) => (i ? c.lineTo(px2, py2) : c.moveTo(px2, py2))); c.stroke();
        if (k % 3 === 0) { const [bx, by] = pts[4]; c.lineWidth = 0.9; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a + 0.9) * 40, by + Math.sin(a + 0.9) * 40); c.stroke(); } }
      c.lineWidth = 1;
      for (const ring of [1, 2, 4]) { c.beginPath(); rays.forEach((pts, i) => { const [x, y] = pts[ring]; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); }            // ring fractures
      c.fillStyle = "rgba(5,6,10,0.9)"; c.beginPath(); c.moveTo(...rays[2][1]); c.lineTo(...rays[3][1]); c.lineTo(...rays[3][2]); c.lineTo(...rays[2][2]); c.closePath(); c.fill();        // one shard has fallen out
    });
    const cracks = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, AP - B0), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0.85, depthWrite: false })); cracks.position.set(0, (AP + B0) / 2, 0.03); g.add(cracks);
    // crockets climbing the arch, a finial at the point
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const u = (k + 0.6) / 4.4, x = sx * (hw + 0.13) * (1 - u * u), y = SH + (AP + 0.2 - SH) * (1 - (1 - u) * (1 - u)) * 0.96;
      const cr = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 5, 10, Math.PI * 1.5), frameBlack); cr.position.set(x + sx * 0.03, y + 0.02, 0.05); cr.rotation.z = sx > 0 ? 0.4 : Math.PI - 0.4; g.add(cr); }
    finial(frameBlack, 0, AP + 0.2, 0.05, g, 1.5);
    const cross = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), silver); cross.position.set(0, AP + 0.5, 0.05); g.add(cross);
    for (const sx of [-1, 1]) { for (let k = 0; k < 12; k++) { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), silver); bd.position.set(sx * (hw + 0.065), B0 + 0.1 + k * 0.19, 0.11); g.add(bd); }
      finial(frameBlack, sx * (hw + 0.07), SH + 0.02, 0.12, g, 0.7); }
    box(hw * 2 + 0.4, 0.12, 0.2, frameBlack, 0, B0 - 0.07, 0.08, g);                                                            // a plinth on the floor
  };
  // black baroque oval: pierced scrollwork all the way round, a fan crest on top and a pendant below
  BUILD.frame_oval = (g, w, d, o) => {
    const rx = 0.36, ry = 0.5;
    const pic = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ map: portraitTex((o && o.seed) || 0), roughness: 0.9 })); pic.scale.set(rx, ry, 1); pic.position.z = 0.01; g.add(pic);
    for (const [k, tube] of [[1.0, 0.035], [1.12, 0.028]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1, tube, 6, 40), frameBlack); ring.scale.set(rx * k, ry * k, 1); ring.position.z = 0.03; g.add(ring); }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = Math.cos(a) * (rx + 0.09), y = Math.sin(a) * (ry + 0.09);
      if (Math.abs(Math.sin(a)) > 0.93) continue;                                     // leave room for crest and pendant
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10, Math.PI * 1.5), frameBlack); c.position.set(x, y, 0.03); c.rotation.z = a + (i % 2 ? 0.8 : -0.8); g.add(c);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 4), frameBlack); leaf.position.set(x * 1.12, y * 1.1, 0.03); leaf.rotation.z = a - Math.PI / 2; g.add(leaf);
    }
    for (let k = -3; k <= 3; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16 - Math.abs(k) * 0.02, 4), frameBlack); f.position.set(k * 0.035, ry + 0.14, 0.03); f.rotation.z = -k * 0.3; g.add(f); }
    scroll(frameBlack, -0.09, ry + 0.06, 0.03, 0.04, 0, 0, g); scroll(frameBlack, 0.09, ry + 0.06, 0.03, 0.04, Math.PI, 0, g);
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), frameBlack); drop.scale.y = 1.4; drop.position.set(0, -ry - 0.11, 0.03); g.add(drop);
    scroll(frameBlack, -0.07, -ry - 0.06, 0.03, 0.035, 0, Math.PI, g); scroll(frameBlack, 0.07, -ry - 0.06, 0.03, 0.035, Math.PI, Math.PI, g);
    if (o && o.scale) g.scale.setScalar(o.scale);
  };
  // black carved rectangle with verdigris-green highlights in the carving: cartouches and corner ornaments
  BUILD.frame_verdigris = (g, w, d, o) => {
    const fw = 0.92, fh = 0.72, b = 0.12, verd = mat("#3f8a6a", { metalness: 0.4, roughness: 0.4, emissive: "#1a3a2a", emissiveIntensity: 0.3 });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw - b * 1.6, fh - b * 1.6), new THREE.MeshStandardMaterial({ map: landscapeTex((o && o.seed) || 0), roughness: 0.9 })); pic.position.z = 0.01; g.add(pic);
    for (const [bw, bh, x, y] of [[fw, b, 0, fh / 2], [fw, b, 0, -fh / 2], [b, fh, fw / 2, 0], [b, fh, -fw / 2, 0]]) box(bw, bh, 0.07, frameBlack, x, y, 0.03, g);
    for (const [bw, bh, x, y] of [[fw - b * 1.4, 0.02, 0, fh / 2 - b * 0.7], [fw - b * 1.4, 0.02, 0, -fh / 2 + b * 0.7], [0.02, fh - b * 1.4, fw / 2 - b * 0.7, 0], [0.02, fh - b * 1.4, -fw / 2 + b * 0.7, 0]]) box(bw, bh, 0.03, verd, x, y, 0.07, g); // inner egg-and-dart line
    for (let i = 0; i < 24; i++) { const t = i / 24, onTop = i % 2; const bead = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 3), verd); bead.position.set(-fw / 2 + b / 2 + t * (fw - b), onTop ? fh / 2 : -fh / 2, 0.075); g.add(bead); }
    for (const [x, y] of [[0, fh / 2], [0, -fh / 2], [fw / 2, 0], [-fw / 2, 0]]) {                    // cartouches mid-side
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), verd); c.scale.set(1.3, 1, 0.5); c.position.set(x, y, 0.08); g.add(c);
      for (const sx of [-1, 1]) { const sc = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 5, 10, Math.PI * 1.4), x === 0 ? verd : frameBlack); sc.position.set(x + (x === 0 ? sx * 0.08 : 0), y + (x === 0 ? 0 : sx * 0.08), 0.07); sc.rotation.z = sx > 0 ? 0 : Math.PI; g.add(sc); }
    }
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {                                   // corner ornaments
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), frameBlack); c.scale.z = 0.5; c.position.set(sx * fw / 2, sy * fh / 2, 0.07); g.add(c);
      const leaf = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 5, 10, Math.PI), verd); leaf.position.set(sx * (fw / 2 - 0.02), sy * (fh / 2 - 0.02), 0.1); leaf.rotation.z = Math.atan2(sy, sx) - Math.PI / 2; g.add(leaf);
    }
    if (o && o.scale) g.scale.setScalar(o.scale);
  };
  // wide black frame with a gilt scroll-and-flower band and a beaded gold inner border
  const giltBandTex = canvasTex(256, 64, (c, W2, H2) => {
    c.fillStyle = "#110d10"; c.fillRect(0, 0, W2, H2);
    c.strokeStyle = "#b8954a"; c.lineWidth = 3;
    c.beginPath(); for (let x = 0; x <= W2; x += 4) c.lineTo(x, H2 / 2 + Math.sin(x / 64 * Math.PI * 2) * H2 * 0.28); c.stroke();
    c.fillStyle = "#d0aa58";
    for (let k = 0; k < 4; k++) { const x = 32 + k * 64, y = H2 / 2 + Math.sin(x / 64 * Math.PI * 2 + Math.PI) * H2 * 0.05; for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; c.beginPath(); c.arc(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 5, 0, Math.PI * 2); c.fill(); } c.fillStyle = "#6a4a1a"; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); c.fillStyle = "#d0aa58"; }
  });
  giltBandTex.wrapS = THREE.RepeatWrapping;
  BUILD.frame_gilt = (g, w, d, o) => {
    const fw = 0.66, fh = 0.8, b = 0.16, gold = M.gold;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw - b * 2, fh - b * 2), new THREE.MeshStandardMaterial({ map: portraitTex(((o && o.seed) || 0) + 1), roughness: 0.9 })); pic.position.z = 0.01; g.add(pic);
    const bandH = new THREE.MeshStandardMaterial({ map: giltBandTex, metalness: 0.4, roughness: 0.4 });
    const bandV = new THREE.MeshStandardMaterial({ map: giltBandTex.clone(), metalness: 0.4, roughness: 0.4 }); bandV.map.center.set(0.5, 0.5); bandV.map.rotation = Math.PI / 2;
    for (const [bw, bh, x, y, m] of [[fw, b, 0, fh / 2 - b / 2, bandH], [fw, b, 0, -fh / 2 + b / 2, bandH], [b, fh - b * 2, fw / 2 - b / 2, 0, bandV], [b, fh - b * 2, -fw / 2 + b / 2, 0, bandV]]) box(bw, bh, 0.06, m, x, y, 0.03, g);
    for (const [bw, bh, x, y] of [[fw - b * 2 + 0.04, 0.025, 0, fh / 2 - b], [fw - b * 2 + 0.04, 0.025, 0, -fh / 2 + b], [0.025, fh - b * 2, fw / 2 - b, 0], [0.025, fh - b * 2, -fw / 2 + b, 0]]) box(bw, bh, 0.05, gold, x, y, 0.05, g);
    const per = 9; for (let i = 0; i < per * 2; i++) { const t = (i % per) / (per - 1), top = i < per; const bd = new THREE.Mesh(new THREE.SphereGeometry(0.011, 5, 3), gold); bd.position.set(-fw / 2 + b + t * (fw - b * 2), (top ? 1 : -1) * (fh / 2 - b - 0.03), 0.06); g.add(bd); }
    box(fw + 0.02, 0.025, 0.07, gold, 0, fh / 2, 0.04, g); box(fw + 0.02, 0.025, 0.07, gold, 0, -fh / 2, 0.04, g);
    if (o && o.scale) g.scale.setScalar(o.scale);
  };
  BUILD.painting = BUILD.painting_1 = BUILD.painting_2 = BUILD.painting_3 = (g) => ornateFrame(g, false);
  // the chalkboard's written working (scratch space): Polly chalks up each step of a sum
  const chalkCv = document.createElement("canvas"); chalkCv.width = 640; chalkCv.height = 200;
  const chalkTex = new THREE.CanvasTexture(chalkCv); chalkTex.colorSpace = THREE.SRGBColorSpace;
  let chalkRows = [];
  function drawChalk(rows) {
    chalkRows = rows || [];
    const paint = () => {
      const c = chalkCv.getContext("2d"); c.clearRect(0, 0, 640, 200);
      c.fillStyle = "#e4f2e6"; c.textBaseline = "middle";
      chalkRows.forEach((r, i) => { c.font = (i === 4 ? "bold 44px " : "38px ") + CHALK; c.textAlign = "left"; c.fillText(r, 22 + Math.floor(i / 4) * 350, 28 + (i % 4) * 47); });
      chalkDust(c, 640, 200);
      chalkTex.needsUpdate = true;
    };
    paint(); if (document.fonts) document.fonts.load("38px 'Fredericka the Great'").then(paint).catch(() => {});
  }
  // the bathroom mirror doubles as scratch space: steam fogs it up and Polly writes eval results in the fog
  const mirrorCv = document.createElement("canvas"); mirrorCv.width = 256; mirrorCv.height = 420;
  const mirrorTex = new THREE.CanvasTexture(mirrorCv); mirrorTex.colorSpace = THREE.SRGBColorSpace;
  function drawMirror(fog, rows) {
    const c = mirrorCv.getContext("2d"), W2 = 256, H2 = 420;
    c.clearRect(0, 0, W2, H2);
    if (fog > 0) {
      const gr = c.createRadialGradient(W2 / 2, H2 / 2, 30, W2 / 2, H2 / 2, 260); gr.addColorStop(0, `rgba(200,210,220,${0.4 * fog})`); gr.addColorStop(1, `rgba(170,180,195,${0.25 * fog})`);
      c.fillStyle = gr; c.fillRect(0, 0, W2, H2);
    }
    if (rows && rows.length) {
      c.globalCompositeOperation = "destination-out";                  // finger-writing wipes the fog away
      c.fillStyle = "#000"; c.textAlign = "left"; c.textBaseline = "middle";
      rows.forEach((r, i) => { c.font = (i === 0 ? "26px " : "30px ") + HAND; c.fillText(r, 16, 40 + i * 52); });
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "rgba(160,220,180,0.25)"; rows.forEach((r, i) => { c.font = (i === 0 ? "26px " : "30px ") + HAND; c.fillText(r, 16, 40 + i * 52); });
    }
    mirrorTex.needsUpdate = true;
  }
  BUILD.mirror = (g) => {
    ornateFrame(g, true); g.scale.setScalar(2); g.userData.mirrorBig = true;
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.85), new THREE.MeshBasicMaterial({ map: mirrorTex, transparent: true, depthWrite: false }));
    note.position.z = 0.03; g.add(note);
    drawMirror(0.25, null);
  };
  // tufted velvet sofa with carved legs
  BUILD.couch = (g, w) => {
    const vel = M.burgundy, legM = M.darkWood;
    box(w * 0.95, 0.22, 0.75, vel, 0, 0.42, 0, g);                      // seat
    box(w * 0.95, 0.6, 0.18, vel, 0, 0.75, -0.3, g);                     // back
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.3, w * 0.3, 0.18, 14, 1, false, -Math.PI / 2, Math.PI), vel); crest.rotation.x = Math.PI / 2; crest.scale.set(1, 1, 0.5); crest.position.set(0, 1.02, -0.3); g.add(crest);
    for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 10), vel); arm.rotation.x = Math.PI / 2; arm.position.set(sx * w * 0.46, 0.62, 0); g.add(arm); }
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 3), mat("#2a0610")); b.position.set(-w * 0.4 + (i % 5) * w * 0.2, 0.62 + Math.floor(i / 5) * 0.2, -0.2); g.add(b); } // tufting buttons
    box(w * 0.95, 0.06, 0.78, legM, 0, 0.3, 0, g);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) turned(0.3, 0.03, legM, sx * w * 0.44, 0, sz * 0.3, g);
  };
  // a little apothecary cabinet: two carved doors, iron pulls, a marble top with soap, a jar and a brush
  BUILD.bath_cabinet = (g, w, d) => {
    const W2 = w * 0.92, D = d * 0.9, H = 0.82, wd = M.darkWood, iron = M.iron;
    box(W2, H - 0.08, D, wd, 0, 0.08 + (H - 0.08) / 2, 0, g).castShadow = true;
    box(W2 + 0.06, 0.06, D + 0.06, marbleM, 0, H + 0.03, 0, g);
    for (const sx of [-1, 1]) {
      const dx = sx * W2 / 4;
      box(W2 / 2 - 0.06, H - 0.24, 0.02, M.wood, dx, 0.48, D / 2 + 0.01, g);
      box(W2 / 2 - 0.16, H - 0.36, 0.02, M.carve, dx, 0.48, D / 2 + 0.02, g);
      const pull = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 10), iron); pull.position.set(dx - sx * (W2 / 4 - 0.08), 0.5, D / 2 + 0.04); g.add(pull);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) turned(0.1, 0.03, wd, sx * (W2 / 2 - 0.05), 0, sz * (D / 2 - 0.05), g);
    box(0.14, 0.05, 0.09, mat("#d8d0e8"), -W2 * 0.25, H + 0.085, 0.02, g);                                     // soap
    cyl(0.06, 0.06, 0.14, new THREE.MeshStandardMaterial({ color: "#7bd389", transparent: true, opacity: 0.5, roughness: 0.1 }), W2 * 0.18, H + 0.13, -0.02, g, 10);  // jar
    cyl(0.065, 0.065, 0.02, M.gold, W2 * 0.18, H + 0.21, -0.02, g, 10);
    const brush = box(0.04, 0.03, 0.22, M.wood, W2 * 0.36, H + 0.075, 0.05, g); brush.rotation.y = 0.4;
  };
  // wooden bird box: planked body, pitched roof with overhang, round entrance hole and a little perch
  BUILD.birdbox = (g, w, d, o) => {
    const y0 = o.side ? 1.7 + (o.lift || 0) : 0, s = o.scale || 1;
    const wood = texMat(grimeWood(o.tint || "#8a6a40", "#3a2814"));
    const B = new THREE.Group(); B.position.y = y0; B.scale.setScalar(s); g.add(B);
    box(0.3, 0.34, 0.26, wood, 0, 0, 0.14, B).castShadow = true;
    for (const sx of [-1, 1]) { const r = box(0.22, 0.025, 0.34, wood, sx * 0.09, 0.22, 0.15, B); r.rotation.z = -sx * 0.62; }
    box(0.02, 0.03, 0.34, M.darkWood, 0, 0.29, 0.15, B);                           // ridge
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), mat("#050304")); hole.position.set(0, 0.04, 0.271); B.add(hole);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.01, 5, 14), M.darkWood); rim.position.set(0, 0.04, 0.272); B.add(rim);
    const perch = cyl(0.01, 0.01, 0.08, M.darkWood, 0, -0.06, 0.31, B, 5); perch.rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) box(0.3, 0.004, 0.005, mat("#2a1a0c"), 0, -0.1 + k * 0.08, 0.272, B);   // plank seams
    const twigs = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), mat("#5c4028")); twigs.position.set(0.035, 0.0, 0.29); twigs.rotation.z = 1.1; B.add(twigs);   // a twig poking out
  };
  // three swords hung horizontally on iron wall hooks, one above another, with a small crest behind
  BUILD.swords = (g) => {
    const steel = mat("#9a9eaa", { metalness: 0.55, roughness: 0.5 }), dark = mat("#1a1418", { roughness: 0.5 }), iron = M.iron;
    // a heater shield behind the swords: flat top, curved sides down to a point, gold rim, a boss in the middle
    const shieldShape = (k) => { const sh = new THREE.Shape(); sh.moveTo(-0.34 * k, 0.4 * k); sh.lineTo(0.34 * k, 0.4 * k); sh.lineTo(0.34 * k, 0.08 * k);
      sh.quadraticCurveTo(0.33 * k, -0.28 * k, 0, -0.48 * k); sh.quadraticCurveTo(-0.33 * k, -0.28 * k, -0.34 * k, 0.08 * k); sh.closePath(); return sh; };
    const rim = new THREE.Mesh(new THREE.ShapeGeometry(shieldShape(1.07), 16), M.gold); rim.position.z = 0.008; g.add(rim);
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(shieldShape(1), { depth: 0.02, bevelEnabled: false, curveSegments: 16 }), mat("#3a1420", { roughness: 0.8 })); shield.position.z = 0.01; g.add(shield);
    box(0.04, 0.8, 0.012, M.gold, 0, -0.02, 0.036, g); box(0.62, 0.04, 0.012, M.gold, 0, 0.12, 0.036, g);          // gold cross
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.gold); boss.scale.z = 0.5; boss.position.set(0, 0.12, 0.045); g.add(boss);
    [[0.25, 1.15, M.gold, 1], [0, 1.02, iron, -1], [-0.25, 1.05, M.gold, 1]].forEach(([y, L, guardM, dir]) => {
      const s = new THREE.Group(); s.position.set(0, y, 0.09); s.scale.x = dir; g.add(s);
      const bl = L * 0.68, x0 = -L / 2 + L * 0.32;
      box(bl, 0.045, 0.012, steel, x0 + bl / 2, 0, 0, s);                                // blade
      box(bl * 0.9, 0.008, 0.016, mat("#7a808c", { metalness: 0.8 }), x0 + bl * 0.45, 0, 0, s);   // fuller
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0225, 0.08, 4), steel); tip.rotation.z = -Math.PI / 2; tip.position.x = x0 + bl + 0.04; tip.scale.z = 0.3; s.add(tip);
      box(0.03, 0.2, 0.03, guardM, x0, 0, 0, s);                                             // cross guard
      for (const k of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), guardM); b.position.set(x0, k * 0.1, 0); s.add(b); }
      cyl(0.022, 0.022, 0.2, dark, x0 - 0.11, 0, 0, s, 8).rotation.z = Math.PI / 2;          // grip
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), guardM); pommel.position.x = x0 - 0.23; s.add(pommel);
    });
    for (const x of [-0.3, 0.3]) for (const y of [0.25, 0, -0.25]) { box(0.025, 0.06, 0.1, iron, x, y - 0.04, 0.05, g); }   // hooks
  };
  // a loose brick in a side wall. Pulled out, it drops to the floor and shows a niche with a small iron
  // lockbox inside (riveted lid, two brass dials, a note tied on with string).
  BUILD.loose_brick = (g, w, d, o) => {
    const Y = o.side ? 1.15 : 0, BW = 0.62, BH = 0.3;
    const floorY = o.side ? 0.16 : 0.16 - (1.45 + (o.lift || 0));        // where the brick lands, relative to this group
    const stone = mat("#4a4460", { roughness: 0.9 }), iron = mat("#2a2630", { metalness: 0.6, roughness: 0.45 }), brass = mat("#c8a050", { metalness: 0.8, roughness: 0.3 });
    // the niche (only seen once the brick is out)
    const niche = new THREE.Group(); niche.position.set(0, Y, 0); niche.visible = false; g.add(niche);
    box(BW, BH, 0.02, mat("#030205"), 0, 0, 0.0, niche).castShadow = false;
    for (const sy of [-1, 1]) box(BW + 0.06, 0.03, 0.05, mat("#2a2638"), 0, sy * (BH / 2 + 0.015), 0.02, niche);
    for (const sx of [-1, 1]) box(0.03, BH + 0.06, 0.05, mat("#2a2638"), sx * (BW / 2 + 0.015), 0, 0.02, niche);
    const lb = new THREE.Group(); lb.position.set(0, -BH / 2 + 0.01, 0.1); niche.add(lb);
    box(0.4, 0.16, 0.16, iron, 0, 0.08, 0, lb);
    const lid = new THREE.Group(); lid.position.set(0, 0.16, -0.08); lb.add(lid);
    box(0.42, 0.05, 0.18, iron, 0, 0.025, 0.08, lid);
    for (const x of [-0.05, 0.05]) { const dial = cyl(0.035, 0.035, 0.025, brass, x, 0.08, 0.09, lb, 12); dial.rotation.x = Math.PI / 2; }
    const noteM = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), mat("#d8ccb0", { side: THREE.DoubleSide })); noteM.position.set(0.24, 0.02, 0.14); noteM.rotation.z = -0.3; lb.add(noteM);
    const boxGlow = new THREE.PointLight("#7bd389", 0, 2.2, 2); boxGlow.position.set(0, 0.1, 0.4); niche.add(boxGlow);
    // the brick itself, with a faint glowing seam once you know to look
    const brick = new THREE.Group(); brick.position.set(0, Y, 0.03); g.add(brick);
    box(BW, BH, 0.3, stone, 0, 0, -0.1, brick).castShadow = true;
    const seamM = new THREE.MeshBasicMaterial({ color: "#7bd389", transparent: true, opacity: 0.8 });
    for (const sy of [-1, 1]) box(BW + 0.04, 0.015, 0.01, seamM, 0, sy * (BH / 2 + 0.01), 0.055, brick);
    for (const sx of [-1, 1]) box(0.015, BH + 0.04, 0.01, seamM, sx * (BW / 2 + 0.01), 0, 0.055, brick);
    g.userData.brick = { brick, niche, lid, seamM, boxGlow, out: 0, Y, floorY };
  };
  // the W-shaped key: a ring bow, a short shaft, and a bit cut in the shape of a W. Floats above the desk, glowing.
  BUILD.w_key = (g, w, d, o) => {
    const brass = new THREE.MeshStandardMaterial({ color: "#e8c060", emissive: "#c89030", emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.25 });
    const K = new THREE.Group(); K.position.y = 1.25; g.add(K);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 18), brass); bow.position.x = -0.26; K.add(bow);
    box(0.24, 0.035, 0.035, brass, -0.06, 0, 0, K);
    const pts = [[0.06, 0.1], [0.12, -0.1], [0.19, 0.04], [0.26, -0.1], [0.32, 0.1]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
      const sgm = box(len + 0.02, 0.04, 0.04, brass, (ax + bx) / 2, (ay + by) / 2, 0, K); sgm.rotation.z = Math.atan2(by - ay, bx - ax);
    }
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffd070", transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false })); K.add(halo);
    const pl = new THREE.PointLight("#ffd070", 2.5, 3, 1.8); K.add(pl);
    if (o.mount === "wall") K.position.z = 0.55;
    g.userData.wkey = { K, shown: 0, o };
  };
  // ------------------------------------------------------------------ the attic
  // Room dressing built in one piece (the object sits on the attic's top-left tile): gable rafters on the
  // back wall, a tie beam with a swinging bare bulb and meat hooks, tally marks, cobwebs, floor stains,
  // cold moonlight and drifting dust.
  BUILD.attic_set = (g) => {
    const RW = 9, RD = 8, R = new THREE.Group(); R.position.set(-0.5, 0, -0.5); g.add(R);
    const beamM = texMat(grimeWood("#3a2616", "#0e0805")), ironM = mat("#2a2622", { metalness: 0.7, roughness: 0.5 });
    // dried stains: something was dragged from the door to the window
    const stainTex = canvasTex(512, 512, (c, W2, H2) => {
      c.clearRect(0, 0, W2, H2); c.lineCap = "round";
      for (let k = 0; k < 3; k++) { c.strokeStyle = `rgba(34,5,7,${0.35 + k * 0.12})`; c.lineWidth = 30 - k * 9; c.beginPath(); c.moveTo(W2 * 0.5 + k * 5, H2); c.bezierCurveTo(W2 * 0.4, H2 * 0.72, W2 * 0.62, H2 * 0.5, W2 * 0.5, H2 * 0.24); c.stroke(); }
      for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(${26 + rnd() * 16},4,6,${0.25 + rnd() * 0.4})`; c.beginPath(); c.ellipse(W2 * (0.3 + rnd() * 0.4), H2 * (0.2 + rnd() * 0.75), 3 + rnd() * 16, 2 + rnd() * 9, rnd() * 3, 0, 7); c.fill(); }
      for (let i = 0; i < 7; i++) { c.strokeStyle = `rgba(0,0,0,${0.18 + rnd() * 0.15})`; c.lineWidth = 2 + rnd() * 3; c.beginPath(); c.ellipse(rnd() * W2, rnd() * H2, 20 + rnd() * 50, 14 + rnd() * 34, rnd() * 3, 0, 7); c.stroke(); }   // old water rings
    });
    const stains = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshBasicMaterial({ map: stainTex, transparent: true, depthWrite: false }));
    stains.rotation.x = -Math.PI / 2; stains.position.set(RW / 2, 0.016, RD / 2); R.add(stains);
    // gable rafters and a king post against the back wall, and one tie beam across the room
    for (const sx of [-1, 1]) { const rf = box(4.6, 0.2, 0.16, beamM, RW / 2 + sx * 2.2, 3.05, 0.11, R); rf.rotation.z = -sx * 0.29; }
    box(0.18, 1.5, 0.16, beamM, RW / 2, 3.0, 0.12, R);
    const TZ = 4.3, TY = 3.55;
    box(RW, 0.22, 0.24, beamM, RW / 2, TY, TZ, R);
    for (const x of [0.15, RW - 0.15]) { const br = box(0.14, 1.1, 0.14, beamM, x + (x < 1 ? 0.3 : -0.3), TY - 0.42, TZ, R); br.rotation.z = x < 1 ? -0.7 : 0.7; }
    // the bare bulb, swinging on its cord
    const bulbPivot = new THREE.Group(); bulbPivot.position.set(6.4, TY - 0.1, TZ); R.add(bulbPivot);
    cyl(0.008, 0.008, 0.9, mat("#0a0808"), 0, -0.45, 0, bulbPivot, 4); cyl(0.035, 0.03, 0.08, ironM, 0, -0.92, 0, bulbPivot, 8);
    const bulbM = new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ffa040", emissiveIntensity: 2.2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bulbM); bulb.position.y = -1.02; bulbPivot.add(bulb);
    const bulbLight = new THREE.PointLight("#ff9a45", 12, 9, 1.5); bulbLight.position.y = -1.05; bulbPivot.add(bulbLight);
    // chains with hooks hanging off the beam
    const hooks = [];
    for (const [x, len] of [[1.5, 1.0], [2.7, 0.65], [7.7, 1.25]]) {
      const hp = new THREE.Group(); hp.position.set(x, TY - 0.1, TZ); R.add(hp);
      const n = Math.round(len / 0.11);
      for (let k = 0; k < n; k++) { const ln = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 4, 8), ironM); ln.position.y = -0.05 - k * 0.11; ln.rotation.y = k % 2 ? Math.PI / 2 : 0; hp.add(ln); }
      const hk = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 5, 12, Math.PI * 1.35), ironM); hk.position.y = -0.12 - n * 0.11; hk.rotation.z = Math.PI * 0.85; hp.add(hk);
      hooks.push({ hp, ph: x * 1.7 });
    }
    // tally marks scratched above the crates: it has been counting
    const tally = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.5), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, map: canvasTex(256, 168, (c, W2, H2) => {
      c.clearRect(0, 0, W2, H2); c.strokeStyle = "#cfc4b0"; c.lineWidth = 2; c.lineCap = "round";
      for (let row = 0; row < 5; row++) for (let grp = 0; grp < 7; grp++) {
        if (row === 4 && grp > 3) continue;
        const x0 = 10 + grp * 35 + rnd() * 3, y0 = 12 + row * 31 + rnd() * 3;
        for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x0 + k * 6 + rnd() * 1.5, y0); c.lineTo(x0 + k * 6 + rnd() * 2, y0 + 20 + rnd() * 3); c.stroke(); }
        c.beginPath(); c.moveTo(x0 - 3, y0 + 16); c.lineTo(x0 + 23, y0 + 4); c.stroke();
      }
    }) }));
    tally.position.set(1.45, 2.35, 0.03); R.add(tally);
    // cobwebs in the roof corners and trailing off the beam
    const webM = new THREE.MeshBasicMaterial({ map: webTex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, y, z, sc, flip] of [[0.9, 3.0, 0.2, 1.8, 1], [RW - 0.9, 3.0, 0.2, 1.8, -1], [0.62, TY - 0.62, TZ + 0.03, 1.15, 1], [RW - 0.62, TY - 0.62, TZ + 0.03, 1.15, -1]]) {
      const wb = new THREE.Mesh(new THREE.PlaneGeometry(sc, sc), webM); wb.position.set(x, y, z); wb.scale.x = flip; R.add(wb);
    }
    // debris: split boards, torn pages, broken glass, a toppled stool, a smashed picture frame, rope, bottles
    {
      const spot = () => [0.7 + rnd() * (RW - 1.4), 1.3 + rnd() * 2.9];     // only the far end of the room, around the window
      const rotM = [mat("#2a1c12", { roughness: 1 }), mat("#3a2818", { roughness: 1 }), mat("#1e140c", { roughness: 1 })];
      for (let i = 0; i < 9; i++) { const [x, z] = spot(); const bd = box(0.4 + rnd() * 0.6, 0.03, 0.09 + rnd() * 0.05, rotM[i % 3], x, 0.03 + (i % 3 === 0 ? 0.04 : 0), z, R); bd.rotation.set(0, rnd() * 3, i % 3 === 0 ? 0.12 : 0); }
      const paperM = new THREE.MeshStandardMaterial({ color: "#b8ae94", roughness: 1, side: THREE.DoubleSide });
      for (let i = 0; i < 14; i++) { const [x, z] = spot(); const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.27, 2, 2), paperM); const pa = pg.geometry.attributes.position; for (let k = 0; k < pa.count; k++) pa.setZ(k, (rnd() - 0.5) * 0.03); pg.rotation.set(-Math.PI / 2, 0, rnd() * 6); pg.position.set(x, 0.025 + rnd() * 0.01, z); pg.receiveShadow = true; R.add(pg); }
      const glassM = new THREE.MeshStandardMaterial({ color: "#9ab0d0", emissive: "#3a4a70", emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.1, side: THREE.DoubleSide });
      for (let i = 0; i < 16; i++) { const cx = 2.0 + rnd() * 1.0, cz = 2.4 + rnd() * 0.9; const sh = new THREE.Mesh(new THREE.CircleGeometry(0.03 + rnd() * 0.06, 3), glassM); sh.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.3, 0, rnd() * 6); sh.position.set(cx, 0.03, cz); R.add(sh); }
      // a three-legged stool, kicked over
      const stool = new THREE.Group(); stool.position.set(6.9, 0.2, 3.5); stool.rotation.set(0, 0.7, Math.PI / 2 - 0.12); R.add(stool);
      cyl(0.2, 0.2, 0.05, rotM[1], 0, 0.36, 0, stool, 10); for (let k = 0; k < 3; k++) { const a = k * 2.1; if (k === 2) continue; cyl(0.025, 0.02, 0.38, rotM[0], Math.cos(a) * 0.13, 0.17, Math.sin(a) * 0.13, stool, 5); }
      const leg = cyl(0.025, 0.02, 0.38, rotM[0], 6.2, 0.03, 4.0, R, 5); leg.rotation.set(Math.PI / 2, 0, 0.9);              // its third leg, snapped off
      // a picture frame, face down and split at one corner, with the canvas slashed
      const fr = new THREE.Group(); fr.position.set(2.7, 0.04, 3.6); fr.rotation.y = 0.5; R.add(fr);
      box(0.9, 0.05, 0.07, M.gold, 0, 0, -0.32, fr); box(0.9, 0.05, 0.07, M.gold, 0.05, 0, 0.32, fr).rotation.y = 0.08; box(0.07, 0.05, 0.64, M.gold, -0.42, 0, 0, fr); box(0.07, 0.05, 0.6, M.gold, 0.5, 0.02, 0.06, fr).rotation.y = 0.3;
      const canv = box(0.78, 0.01, 0.58, mat("#2a2420", { roughness: 1 }), 0, -0.01, 0, fr); for (const dx of [-0.15, 0.05, 0.22]) box(0.012, 0.012, 0.5, mat("#050404"), dx, 0.0, 0, fr).rotation.y = 0.5;
      // a coil of rope and two bottles on their sides
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), mat("#6a5a3a", { roughness: 1 })); rope.rotation.x = Math.PI / 2; rope.position.set(7.3, 0.04, 3.2); R.add(rope);
      const rope2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 6, 16), mat("#5a4c30", { roughness: 1 })); rope2.rotation.x = Math.PI / 2; rope2.position.set(7.32, 0.1, 3.22); R.add(rope2);
      for (const [x, z, r] of [[1.6, 2.6, 0.4], [5.6, 2.2, 2.1]]) { const bt = cyl(0.05, 0.05, 0.22, new THREE.MeshStandardMaterial({ color: "#2a4a34", transparent: true, opacity: 0.7, roughness: 0.15 }), x, 0.05, z, R, 8); bt.rotation.set(Math.PI / 2, 0, r); }
    }
    // two red-glass lanterns on iron stands against the door wall: a low, uneasy glow over the near half of the room
    const reds = [];
    for (const x of [1.35, RW - 1.35]) {
      const L = new THREE.Group(); L.position.set(x, 0, RD - 0.4); R.add(L);
      cyl(0.16, 0.2, 0.04, ironM, 0, 0.02, 0, L, 8); cyl(0.02, 0.02, 1.05, ironM, 0, 0.55, 0, L, 6);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 10, Math.PI), ironM); hook.position.set(0, 1.1, 0); L.add(hook);
      box(0.17, 0.02, 0.17, ironM, 0, 0.82, 0, L); box(0.19, 0.02, 0.19, ironM, 0, 1.04, 0, L);
      for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.014, 0.22, 0.014, ironM, ax * 0.075, 0.93, az * 0.075, L);
      const glassR = new THREE.MeshStandardMaterial({ color: "#ff4030", emissive: "#ff1a10", emissiveIntensity: 1.6, transparent: true, opacity: 0.6, depthWrite: false });
      box(0.14, 0.2, 0.14, glassR, 0, 0.93, 0, L);
      const pl = new THREE.PointLight("#ff2a1a", 5, 6.5, 1.5); pl.position.set(0, 1.0, -0.25); L.add(pl);
      reds.push({ pl, glassR, ph: x * 2.3 });
    }
    // cold moonlight through the window, and dust hanging in it
    const moonL = new THREE.PointLight("#8090e0", 5, 6.5, 1.5); moonL.position.set(4.4, 1.9, 1.3); R.add(moonL);
    const dustGeo = new THREE.BufferGeometry(), dp = [];
    for (let i = 0; i < 90; i++) dp.push(2.6 + rnd() * 3.6, 0.2 + rnd() * 2.6, 0.3 + rnd() * 3.4);
    dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: "#c8d0ff", size: 0.035, transparent: true, opacity: 0.55, depthWrite: false })); R.add(dust);
    g.userData.attic = { bulbPivot, bulbM, bulbLight, hooks, dust, reds };
  };
  // LET ME OUT, scratched into the boards again and again
  // ------------------------------------------------------------------ the storage room
  // Things kept on a shelf: little vials, round bottles, jars and small boxes, all slightly different.
  const VIAL_COLORS = ["#b0483e", "#3f8f6a", "#4a6fb8", "#c79a3a", "#8a55b0", "#3a9aa6"];
  function shelfClutter(parent, x0, x1, y, z) {
    const cork = mat("#6a4a2a"), boxTones = ["#4a3524", "#5a4230", "#3d2c22", "#56483a", "#44303a"];
    let x = x0 + 0.08;
    while (x < x1 - 0.08) {
      const kind = rnd(), zz = z + (rnd() - 0.5) * 0.06;
      if (kind < 0.42) {                                              // a thin vial with a cork
        const h = 0.13 + rnd() * 0.1, r = 0.024 + rnd() * 0.012, col = VIAL_COLORS[Math.floor(rnd() * VIAL_COLORS.length)];
        const gm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.22, roughness: 0.2, transparent: true, opacity: 0.9 });
        cyl(r, r, h, gm, x, y + h / 2, zz, parent, 8); cyl(r * 0.7, r * 0.7, 0.03, cork, x, y + h + 0.015, zz, parent, 6);
        x += r * 2 + 0.03 + rnd() * 0.04;
      } else if (kind < 0.6) {                                        // a round-bellied bottle
        const r = 0.045 + rnd() * 0.02, col = VIAL_COLORS[Math.floor(rnd() * VIAL_COLORS.length)];
        const gm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.2, roughness: 0.2, transparent: true, opacity: 0.9 });
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), gm); b.position.set(x + r, y + r, zz); parent.add(b);
        cyl(r * 0.3, r * 0.3, r * 0.9, gm, x + r, y + r * 2.2, zz, parent, 6); cyl(r * 0.36, r * 0.36, 0.025, cork, x + r, y + r * 2.7, zz, parent, 6);
        x += r * 2 + 0.04 + rnd() * 0.04;
      } else {                                                        // a small box, sometimes two stacked
        const bw = 0.1 + rnd() * 0.1, bh = 0.06 + rnd() * 0.08, bm = mat(boxTones[Math.floor(rnd() * boxTones.length)]);
        box(bw, bh, 0.12 + rnd() * 0.05, bm, x + bw / 2, y + bh / 2, zz, parent);
        box(bw * 0.5, 0.012, 0.02, mat("#b9ac8c"), x + bw / 2, y + bh * 0.55, zz + 0.075, parent).castShadow = false;                 // paper label
        if (rnd() < 0.35) { const bw2 = bw * 0.7, bh2 = 0.05 + rnd() * 0.04; box(bw2, bh2, 0.1, mat(boxTones[Math.floor(rnd() * boxTones.length)]), x + bw / 2, y + bh + bh2 / 2, zz, parent); }
        x += bw + 0.03 + rnd() * 0.04;
      }
    }
  }
  // two wall shelves, one above the other, crowded with vials and boxes
  BUILD.vial_shelf = (g, w, d, o) => {
    const Wd = (o && o.width) || 2.4;
    for (const y of [0, 0.62]) {
      box(Wd, 0.05, 0.26, M.darkWood, 0, y, 0.14, g);
      for (const sx of [-1, 1]) box(0.05, 0.16, 0.2, M.darkWood, sx * (Wd / 2 - 0.12), y - 0.1, 0.11, g);
      if (y) shelfClutter(g, -Wd / 2 + 0.26, Wd / 2, y + 0.025, 0.14);
      else { shelfClutter(g, -Wd / 2, 0.18, y + 0.025, 0.14); shelfClutter(g, 1.0, Wd / 2, y + 0.025, 0.14); }   // a gap for the rack
    }
    // The puzzle: a little rack with three vials of exactly the same shape. Only their color tells them apart.
    box(0.72, 0.035, 0.2, M.wood, 0.59, 0.045, 0.14, g); box(0.72, 0.1, 0.02, M.wood, 0.59, 0.1, 0.05, g);
    const pv = [];
    for (const [id, col] of [["red", "#d8483c"], ["green", "#3fb862"], ["purple", "#9258e0"]]) {
      const V = new THREE.Group(); g.add(V);
      const gm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45, roughness: 0.2, transparent: true, opacity: 0.92 });
      cyl(0.05, 0.05, 0.3, gm, 0, 0.15, 0, V, 10); cyl(0.036, 0.036, 0.04, mat("#6a4a2a"), 0, 0.32, 0, V, 8);
      V.position.set(0.59, 0.065, 0.15); pv.push({ id, V });
    }
    g.userData.puzzleVials = pv;
    candle(g, -Wd / 2 + 0.13, 0.62 + 0.025, 0.14);                     // a single candle at the end of the top shelf
  };
  // a tall run of open shelving against a side wall
  BUILD.storage_shelves = (g, w, d, o) => {
    const L = (o && o.width) || 4, H = 2.25, D = 0.42;
    box(L, H, 0.03, mat("#1c120c"), 0, H / 2, 0.02, g);
    for (const x of [-L / 2, -L / 6, L / 6, L / 2]) box(0.07, H, D, M.darkWood, x, H / 2, D / 2, g);
    for (const y of [0.08, 0.6, 1.12, 1.64, H - 0.03]) {
      box(L, 0.05, D, M.wood, 0, y, D / 2, g);
      if (y < H - 0.1) for (const [a, b2] of [[-L / 2, -L / 6], [-L / 6, L / 6], [L / 6, L / 2]]) shelfClutter(g, a + 0.04, b2 - 0.04, y + 0.025, D / 2 + 0.02);
    }
  };
  // a whole wall of pigeonholes, every one stuffed with rolled-up skill scrolls
  BUILD.scroll_rack = (g, w, d, o) => {
    const L = (o && o.width) || 5, H = 2.3, D = 0.34, cols = Math.round(L / 0.5), rows = 5, cw = L / cols, ch = (H - 0.1) / rows;
    box(L, H, 0.03, mat("#1c120c"), 0, H / 2 + 0.05, 0.02, g);
    for (let r = 0; r <= rows; r++) box(L + 0.06, 0.045, D, M.darkWood, 0, 0.07 + r * ch, D / 2, g);
    for (let k = 0; k <= cols; k++) box(0.04, H - 0.1, D, M.darkWood, -L / 2 + k * cw, 0.07 + (H - 0.1) / 2, D / 2, g);
    const parch = [mat("#d8c9a0"), mat("#cbb98a"), mat("#e2d6b4"), mat("#bfae84")], endM = mat("#8a744c");
    const ribbons = ["#8a2a2a", "#2a6a4a", "#3a4a8a", "#8a6a2a", "#6a3a7a"].map((cc) => mat(cc));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const n = 1 + Math.floor(rnd() * 3), x0 = -L / 2 + k * cw, y0 = 0.07 + r * ch + 0.025;
      for (let i = 0; i < n; i++) {
        const rad = 0.045 + rnd() * 0.018, len = D * (0.78 + rnd() * 0.16);
        const sx = x0 + cw * (0.28 + 0.44 * (n === 1 ? 0.5 : i / (n - 1))) + (rnd() - 0.5) * 0.02, sy = y0 + rad + (i === 2 ? rad * 1.6 : 0);
        const sc = cyl(rad, rad, len, parch[Math.floor(rnd() * parch.length)], sx, sy, len / 2 + 0.03, g, 10); sc.rotation.x = Math.PI / 2;
        const cap = cyl(rad * 0.42, rad * 0.42, 0.012, endM, sx, sy, len + 0.036, g, 8); cap.rotation.x = Math.PI / 2; cap.castShadow = false;
        if (rnd() < 0.7) { const rb = cyl(rad + 0.004, rad + 0.004, 0.035, ribbons[Math.floor(rnd() * ribbons.length)], sx, sy, len * 0.82, g, 10); rb.rotation.x = Math.PI / 2; rb.castShadow = false; }
      }
    }
  };
  // a wicker basket on the floor, heaped with spooky odds and ends
  BUILD.spooky_basket = (g) => {
    const wick = mat("#7a5a30"), wickDk = mat("#4e3a1e"), bone = mat("#d8d0bc"), dark = mat("#0c0810");
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.27, 0.36, 14, 1, true), new THREE.MeshStandardMaterial({ color: "#7a5a30", roughness: 0.95, side: THREE.DoubleSide, flatShading: true }));
    body.position.y = 0.18; body.castShadow = true; g.add(body);
    cyl(0.27, 0.27, 0.03, wickDk, 0, 0.015, 0, g, 14);
    for (const [y, r] of [[0.36, 0.365], [0.24, 0.335], [0.12, 0.305]]) { const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 5, 18), y > 0.3 ? wick : wickDk); band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band); }
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 5, 10, Math.PI), wickDk); h.position.set(sx * 0.37, 0.33, 0); h.rotation.y = Math.PI / 2; g.add(h); }
    cyl(0.33, 0.33, 0.02, dark, 0, 0.26, 0, g, 14).castShadow = false;                 // the dark inside
    // a small skull
    const sk = new THREE.Group(); sk.position.set(-0.08, 0.4, 0.06); sk.rotation.set(-0.3, 0.5, 0.15); g.add(sk);
    const cr = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), bone); cr.scale.set(1, 0.95, 1.1); cr.castShadow = true; sk.add(cr);
    box(0.11, 0.07, 0.09, bone, 0, -0.09, 0.05, sk);
    for (const ex of [-0.04, 0.04]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), dark); e.position.set(ex, -0.01, 0.1); sk.add(e); }
    box(0.02, 0.03, 0.02, dark, 0, -0.05, 0.11, sk);
    // two bones sticking out
    for (const [bx, bz, rz, rx] of [[0.16, -0.08, -0.5, 0.2], [0.05, -0.16, 0.35, -0.3]]) {
      const B = new THREE.Group(); B.position.set(bx, 0.42, bz); B.rotation.set(rx, 0, rz); g.add(B);
      cyl(0.018, 0.018, 0.34, bone, 0, 0, 0, B, 6);
      for (const ey of [-0.17, 0.17]) for (const ex of [-0.02, 0.02]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), bone); k.position.set(ex, ey, 0); B.add(k); }
    }
    // a glowing vial, a purple crystal, a black candle stub and a raven feather
    cyl(0.03, 0.03, 0.16, new THREE.MeshStandardMaterial({ color: "#5fe08a", emissive: "#5fe08a", emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }), 0.2, 0.42, 0.12, g, 8).rotation.z = -0.4;
    const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), new THREE.MeshStandardMaterial({ color: "#9a5ae0", emissive: "#6a2ac0", emissiveIntensity: 0.6, roughness: 0.2, flatShading: true })); cry.scale.y = 1.6; cry.position.set(-0.2, 0.42, -0.1); cry.rotation.z = 0.3; g.add(cry);
    cyl(0.035, 0.035, 0.12, mat("#17131c"), 0.02, 0.4, 0.2, g, 8);
    const fe = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.34), new THREE.MeshStandardMaterial({ color: "#14121a", side: THREE.DoubleSide })); fe.position.set(-0.22, 0.52, 0.14); fe.rotation.set(0.2, 0.6, 0.5); g.add(fe);
    // a spider on the rim
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), dark); sp.position.set(0.3, 0.39, -0.18); g.add(sp);
    for (let k = 0; k < 8; k++) { const a2 = (k / 8) * Math.PI * 2; const leg = cyl(0.004, 0.004, 0.07, dark, 0.3 + Math.cos(a2) * 0.04, 0.385, -0.18 + Math.sin(a2) * 0.04, g, 3); leg.rotation.set(Math.sin(a2) * 1.1, 0, -Math.cos(a2) * 1.1); leg.castShadow = false; }
  };
  // a tall wooden cabinet with its two doors shut
  BUILD.cabinet = (g, w, d, o) => {
    const W2 = (o && o.width) || 1.1, H = 1.95, D = 0.5, dk = M.darkWood, wd = M.wood;
    box(W2, H, D, dk, 0, H / 2 + 0.08, D / 2, g);                                     // carcass
    box(W2 + 0.1, 0.1, D + 0.06, wd, 0, 0.05, D / 2, g);                               // plinth
    box(W2 + 0.14, 0.08, D + 0.1, wd, 0, H + 0.12, D / 2, g); box(W2 + 0.06, 0.05, D + 0.04, dk, 0, H + 0.185, D / 2, g);   // cornice
    for (const sx of [-1, 1]) {
      const dx = sx * (W2 / 4 - 0.005), dw = W2 / 2 - 0.05;
      box(dw, H - 0.16, 0.04, wd, dx, H / 2 + 0.08, D + 0.02, g);                       // door leaf
      for (const [py, ph] of [[H * 0.7 + 0.08, H * 0.42], [H * 0.24 + 0.08, H * 0.3]]) {   // two recessed panels with a raised field
        box(dw - 0.1, ph, 0.012, dk, dx, py, D + 0.042, g).castShadow = false;
        box(dw - 0.2, ph - 0.1, 0.014, wd, dx, py, D + 0.05, g).castShadow = false;
      }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.brass); knob.position.set(sx * 0.05, H * 0.5 + 0.08, D + 0.07); g.add(knob);
      for (const hy of [0.4, H - 0.25]) box(0.03, 0.12, 0.02, M.iron, sx * (W2 / 2 - 0.04), hy + 0.08, D + 0.045, g).castShadow = false;   // hinges
    }
    box(0.012, H - 0.16, 0.045, mat("#0c0705"), 0, H / 2 + 0.08, D + 0.02, g).castShadow = false;   // the dark seam where the doors meet
  };
  // two witch's brooms leaning in the corner: crooked handles and long, ragged twig heads bound with twine
  BUILD.witch_brooms = (g) => {
    const twine = mat("#2a1c10"), twigs = [mat("#8a6a34"), mat("#6e5226"), mat("#a07c3e"), mat("#5a4220")];
    const broom = (bx, bz, leanBack, leanSide, hgt) => {
      const B = new THREE.Group(); B.position.set(bx, 0, bz); B.rotation.set(-leanBack, 0, leanSide); g.add(B);
      const pts = []; for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push(new THREE.Vector3(Math.sin(u * 5 + bx * 9) * 0.07 * (0.3 + u), 0.46 + u * (hgt - 0.46), Math.cos(u * 4 + bx * 5) * 0.02)); }
      const handle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.032, 7), M.darkWood); handle.castShadow = true; B.add(handle);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), M.darkWood); knob.position.copy(pts[6]); B.add(knob);
      for (let i = 0; i < 44; i++) {                                    // the head: a ragged skirt of twigs, swept to one side
        const a = (i / 44) * Math.PI * 2 * 2, spread = 0.12 + rnd() * 0.3, len = 0.5 + rnd() * 0.28;
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.006, len, 4), twigs[Math.floor(rnd() * twigs.length)]);
        tw.position.set(Math.cos(a) * spread * 0.5 + 0.05, 0.52 - len / 2, Math.sin(a) * spread * 0.5);
        tw.rotation.set(Math.sin(a) * spread * -1.0, 0, Math.cos(a) * spread * 1.0 + 0.16); tw.castShadow = true; B.add(tw);
      }
      for (const [yy, rr] of [[0.5, 0.07], [0.42, 0.095]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.012, 5, 12), twine); ring.rotation.x = Math.PI / 2; ring.position.y = yy; B.add(ring); }
    };
    broom(-0.22, -0.12, 0.16, 0.1, 2.0);
    broom(0.2, -0.16, 0.14, -0.2, 1.85);
  };
  // room dressing in one piece (sits on the room's top-left tile): a film of dust over the floorboards
  BUILD.storage_set = (g) => {
    // one texture across the whole floor (no tiling, so no seams): soft drifts of dust with a scatter of specks
    const dustTex = canvasTex(512, 400, (c, W2, H2) => {
      c.clearRect(0, 0, W2, H2);
      for (let i = 0; i < 150; i++) { const px = rnd() * W2, py = rnd() * H2, r = 16 + rnd() * 46; const gr = c.createRadialGradient(px, py, 2, px, py, r); gr.addColorStop(0, `rgba(170,162,148,${0.1 + rnd() * 0.12})`); gr.addColorStop(1, "rgba(170,162,148,0)"); c.fillStyle = gr; c.fillRect(px - r, py - r, r * 2, r * 2); }
      for (let i = 0; i < 1600; i++) { c.fillStyle = `rgba(200,192,178,${rnd() * 0.12})`; c.fillRect(rnd() * W2, rnd() * H2, 1 + rnd() * 2, 1); }
    });
    dustTex.wrapS = dustTex.wrapT = THREE.ClampToEdgeWrapping;
    const film = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshBasicMaterial({ map: dustTex, transparent: true, opacity: 0.55, depthWrite: false }));
    film.rotation.x = -Math.PI / 2; film.position.set(4, 0.012, 3); g.add(film);
  };
  BUILD.attic_scratches = (g) => {
    const tex = scrawlTex((c, W2, H2) => {
      c.fillStyle = "#d8ccb8"; c.textAlign = "center";
      let s5 = 21; const r5 = () => ((s5 = (s5 * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 16; i++) { c.save(); c.translate(60 + r5() * (W2 - 120), 24 + r5() * (H2 - 40)); c.rotate((r5() - 0.5) * 0.5); c.globalAlpha = 0.35 + r5() * 0.6; c.font = `${14 + r5() * 30}px ${HAND}`; c.fillText("LET ME OUT", 0, 0); c.restore(); }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.z = 0.02; g.add(m);
  };
  // a tall standing mirror, half hidden under a dust sheet. The glass is cracked. Now and then, something looks back.
  BUILD.cheval_mirror = (g) => {
    const wd = M.darkWood, FW = 0.85, FH = 1.75;
    for (const sx of [-1, 1]) { box(0.06, FH + 0.3, 0.06, wd, sx * (FW / 2 + 0.07), (FH + 0.3) / 2 + 0.04, 0, g); box(0.09, 0.06, 0.62, wd, sx * (FW / 2 + 0.07), 0.04, 0, g); }
    const tilt = new THREE.Group(); tilt.position.y = 0.32 + FH / 2; tilt.rotation.x = -0.09; g.add(tilt);
    box(FW, 0.08, 0.06, wd, 0, FH / 2, 0, tilt); box(FW, 0.08, 0.06, wd, 0, -FH / 2, 0, tilt);
    for (const sx of [-1, 1]) box(0.08, FH, 0.06, wd, sx * FW / 2, 0, 0, tilt);
    const crest = new THREE.Mesh(new THREE.CircleGeometry(FW * 0.32, 12, 0, Math.PI), wd); crest.position.set(0, FH / 2 + 0.03, 0.02); crest.scale.y = 0.7; tilt.add(crest);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(FW - 0.08, FH - 0.08), new THREE.MeshStandardMaterial({ color: "#1a2230", metalness: 0.9, roughness: 0.18, emissive: "#182440", emissiveIntensity: 0.55 })); glass.position.z = 0.02; tilt.add(glass);
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(FW - 0.08, FH - 0.08), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, map: canvasTex(128, 256, (c, W2, H2) => {
      c.clearRect(0, 0, W2, H2); c.strokeStyle = "#c8d4e8"; c.lineWidth = 1.2; const ox = W2 * 0.72, oy = H2 * 0.7;
      for (let k = 0; k < 9; k++) { const a = k * 0.7 + 0.2; let x = ox, y = oy; c.beginPath(); c.moveTo(x, y); for (let st = 0; st < 5; st++) { x += Math.cos(a + (rnd() - 0.5) * 0.7) * 22; y += Math.sin(a + (rnd() - 0.5) * 0.7) * 22; c.lineTo(x, y); } c.stroke(); }
      for (const r of [14, 30]) { c.beginPath(); for (let k = 0; k <= 9; k++) { const a = k * 0.7 + 0.2, x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    }) })); crack.position.z = 0.025; tilt.add(crack);
    const eyeM = new THREE.MeshBasicMaterial({ color: "#8cf0a5", transparent: true, opacity: 0, depthWrite: false });
    for (const ex of [0.1, 0.24]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), eyeM); e.scale.y = 0.55; e.position.set(ex, 0.12, 0.028); tilt.add(e); }
    // the dust sheet: thrown over the top, hanging down one side and cutting across the glass at a slant
    const sh = new THREE.Shape();
    const H2 = FH / 2;
    for (const [i, [x, y]] of [[0.54, H2 + 0.13], [-0.56, H2 + 0.13], [-0.6, -0.2], [-0.57, -H2 - 0.12], [-0.4, -H2 - 0.2], [-0.27, -H2 - 0.06], [-0.3, -0.3], [-0.2, 0.08], [-0.02, 0.36], [0.24, 0.56], [0.5, 0.64]].entries()) i ? sh.lineTo(x, y) : sh.moveTo(x, y);
    sh.closePath();
    const clothM = new THREE.MeshStandardMaterial({ color: "#8e8a7e", roughness: 1, side: THREE.DoubleSide });
    const cloth = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }), clothM); cloth.position.z = 0.045; cloth.castShadow = true; tilt.add(cloth);
    box(FW + 0.26, 0.05, 0.2, clothM, -0.02, H2 + 0.13, 0, tilt);                                                          // over the top
    const backDrop = box(FW + 0.2, FH * 0.7, 0.03, clothM, -0.02, H2 - FH * 0.33, -0.08, tilt);                                // and down the back
    for (const x of [-0.5, -0.4]) box(0.012, FH * 0.8, 0.012, mat("#6e6a60"), x, -0.1, 0.083, tilt);                  // folds
    g.userData.mirrorEyes = eyeM;
  };
  // something under a dust sheet: "tall" is person-shaped, "low" is a long covered box
  BUILD.sheet_ghost = (g, w, d, o) => {
    const cloth = new THREE.MeshStandardMaterial({ color: "#8e8a7e", roughness: 1, side: THREE.DoubleSide });
    if (o.variant === "low") {
      const geo = new THREE.BoxGeometry(1.5, 0.7, 0.75, 9, 4, 5), pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), low = Math.max(0, 0.1 - y) / 0.45;
        pos.setXYZ(i, x * (1 + low * 0.16) + Math.sin(z * 14) * 0.02 * low, y + (y > 0.3 ? Math.sin(x * 5) * 0.025 : 0), z * (1 + low * 0.22) + Math.sin(x * 11) * 0.03 * low); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, cloth); m.position.y = 0.35; m.castShadow = true; g.add(m);
      return;
    }
    const prof = [[0.52, 0], [0.47, 0.12], [0.37, 0.7], [0.31, 1.15], [0.29, 1.4], [0.2, 1.6], [0.17, 1.74], [0.09, 1.84], [0, 1.86]];
    const geo = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 18), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x), k = 1 - y / 1.86;
      const fold = 1 + 0.13 * k * Math.sin(a * 7), shoulder = 1 + 0.42 * Math.exp(-Math.pow((y - 1.36) / 0.16, 2));
      pos.setXYZ(i, x * fold * shoulder, y, z * fold * 0.8); }
    geo.computeVertexNormals();
    const fig = new THREE.Mesh(geo, cloth); fig.castShadow = true; g.add(fig);
    g.userData.breathe = fig;
  };
  // a rocking chair that rocks by itself
  BUILD.rocking_chair = (g) => {
    const wd = M.darkWood, rock = new THREE.Group(); g.add(rock);
    for (const sx of [-1, 1]) {
      for (let k = -2; k <= 2; k++) { const sg = box(0.045, 0.045, 0.2, wd, sx * 0.25, 0.03 + k * k * 0.022, k * 0.18, rock); sg.rotation.x = -k * 0.2; }   // curved rocker
      box(0.04, 0.42, 0.04, wd, sx * 0.25, 0.25, 0.2, rock); box(0.04, 1.15, 0.04, wd, sx * 0.25, 0.62, -0.22, rock);          // front leg, tall back post
      box(0.05, 0.035, 0.46, wd, sx * 0.27, 0.68, 0, rock);                                                                     // arm
    }
    box(0.54, 0.04, 0.48, wd, 0, 0.45, 0, rock);
    for (const x of [-0.14, 0, 0.14]) box(0.07, 0.6, 0.02, wd, x, 0.85, -0.22, rock);
    box(0.54, 0.07, 0.035, wd, 0, 1.17, -0.22, rock);
    g.userData.rock = rock;
  };
  // a headless dressmaker's dummy on a stand. It turns, very slowly, to face you.
  BUILD.mannequin = (g) => {
    const linen = mat("#84745c", { roughness: 1, flatShading: false }), wd = M.darkWood;
    cyl(0.24, 0.27, 0.05, wd, 0, 0.03, 0, g, 12); cyl(0.03, 0.03, 0.95, wd, 0, 0.5, 0, g, 6);
    const top = new THREE.Group(); top.position.y = 0.95; g.add(top);
    const prof = [[0, 0], [0.17, 0.02], [0.21, 0.2], [0.15, 0.42], [0.23, 0.68], [0.2, 0.8], [0.08, 0.87], [0.065, 0.95], [0, 0.96]];
    const torso = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 14), linen); torso.scale.z = 0.7; torso.castShadow = true; top.add(torso);
    cyl(0.07, 0.07, 0.02, wd, 0, 0.97, 0, top, 10);
    for (let k = 0; k < 4; k++) box(0.012, 0.012, 0.012, mat("#1a1210"), 0, 0.25 + k * 0.13, 0.16 - Math.abs(k - 1.6) * 0.012, top);   // a row of pins down the front
    g.userData.facePlayer = top;
  };
  // high-backed gothic dining chair: pointed arch back with a pierced quatrefoil, velvet seat
  BUILD.chair = (g) => {
    const wd = M.darkWood;
    box(0.5, 0.06, 0.48, wd, 0, 0.48, 0, g); box(0.44, 0.06, 0.42, M.burgundy, 0, 0.53, 0.01, g);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) turned(0.46, 0.025, wd, sx * 0.21, 0, sz * 0.2, g);
    for (const sx of [-1, 1]) { box(0.05, 0.85, 0.05, wd, sx * 0.21, 0.92, -0.21, g); finial(wd, sx * 0.21, 1.35, -0.21, g, 0.6); }
    const arch = new THREE.Shape(); arch.moveTo(-0.19, 0); arch.lineTo(-0.19, 0.5); arch.quadraticCurveTo(-0.19, 0.78, 0, 0.88); arch.quadraticCurveTo(0.19, 0.78, 0.19, 0.5); arch.lineTo(0.19, 0); arch.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0.5, 0.09, 0, Math.PI * 2, true); arch.holes.push(hole);
    const back = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.04, bevelEnabled: false }), wd); back.position.set(0, 0.56, -0.23); back.castShadow = true; g.add(back);
  };
  BUILD.armchair = (g) => {
    const vel = M.burgundy;
    box(0.75, 0.2, 0.7, vel, 0, 0.45, 0, g); box(0.75, 0.75, 0.16, vel, 0, 0.85, -0.28, g);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.16, 12, 1, false, -Math.PI / 2, Math.PI), vel); top.rotation.x = Math.PI / 2; top.scale.z = 0.5; top.position.set(0, 1.2, -0.28); g.add(top);
    for (const sx of [-1, 1]) box(0.12, 0.25, 0.7, vel, sx * 0.4, 0.62, 0, g);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) turned(0.35, 0.03, M.darkWood, sx * 0.32, 0, sz * 0.28, g);
  };
  // tall carved throne chair: black lacquered frame, waisted crushed-velvet back under a carved crest,
  // scrolled arms, a carved apron with a rosette, and cabriole legs
  BUILD.throne_chair = (g) => {
    const vel = M.burgundy, lac = lacquer;
    const backShape = (k) => { const sh = new THREE.Shape();
      sh.moveTo(-0.24 * k, 0); sh.bezierCurveTo(-0.17 * k, 0.3, -0.2 * k, 0.55, -0.3 * k, 0.85);
      sh.quadraticCurveTo(-0.3 * k, 1.0, -0.14 * k, 1.0 + 0.04 * k); sh.quadraticCurveTo(0, 1.08 * k, 0.14 * k, 1.0 + 0.04 * k);
      sh.quadraticCurveTo(0.3 * k, 1.0, 0.3 * k, 0.85); sh.bezierCurveTo(0.2 * k, 0.55, 0.17 * k, 0.3, 0.24 * k, 0); sh.closePath(); return sh; };
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(backShape(1.12), { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }), lac);
    frame.position.set(0, 0.5, -0.3); frame.castShadow = true; g.add(frame);
    const pad = new THREE.Mesh(new THREE.ExtrudeGeometry(backShape(1), { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 }), vel);
    pad.position.set(0, 0.55, -0.25); g.add(pad);
    // carved crest: a fan shell flanked by scrolls
    const shell = new THREE.Mesh(new THREE.CircleGeometry(0.1, 9, 0, Math.PI), lac); shell.position.set(0, 1.68, -0.22); g.add(shell);
    for (let i = 0; i < 5; i++) { const rib = box(0.012, 0.09, 0.02, lac, 0, 1.72, -0.21, g); rib.rotation.z = (i - 2) * 0.32; }
    for (const sx of [-1, 1]) { scroll(lac, sx * 0.16, 1.62, -0.21, 0.06, sx > 0 ? Math.PI : 0, 0.6, g); scroll(lac, sx * 0.3, 1.5, -0.21, 0.045, sx > 0 ? Math.PI : 0, -0.4, g); }
    // seat: velvet cushion on a carved apron
    box(0.66, 0.08, 0.6, lac, 0, 0.46, 0, g);
    const cush = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.56, 4, 1, 4), vel); cush.position.set(0, 0.54, 0.01); g.add(cush);
    box(0.62, 0.1, 0.03, lac, 0, 0.38, 0.29, g);
    const ros = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.014, 5, 10), lac); ros.position.set(0, 0.37, 0.31); g.add(ros);
    for (const sx of [-1, 1]) scroll(lac, sx * 0.14, 0.36, 0.31, 0.04, sx > 0 ? Math.PI : 0, 0.3, g);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cabriole(g, sx * 0.27, sz * 0.24, 0.42, sx, sz);
    // scrolled arms
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.3, 0.95, -0.24), new THREE.Vector3(sx * 0.34, 0.78, 0.0), new THREE.Vector3(sx * 0.33, 0.76, 0.22), new THREE.Vector3(sx * 0.31, 0.66, 0.28)]);
      const arm = new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.03, 7), lac); arm.castShadow = true; g.add(arm);
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.02, 6, 12, Math.PI * 1.6), lac); curl.position.set(sx * 0.31, 0.63, 0.29); curl.rotation.y = Math.PI / 2; g.add(curl);
      cyl(0.022, 0.03, 0.2, lac, sx * 0.31, 0.53, 0.26, g, 7);
      const armPad = box(0.07, 0.03, 0.3, vel, sx * 0.335, 0.8, 0.03, g); armPad.rotation.x = 0.1;
    }
  };
  // a carved chaise longue: high rolled arm sweeping down into a low back, button tufting,
  // a bolster, brass nailheads along the seat rail, a carved apron and cabriole legs
  BUILD.chaise = (g, w) => {
    const vel = M.burgundy, lac = lacquer, brass = mat("#b8954a", { metalness: 0.8, roughness: 0.3 });
    const L = w * 0.94, x0 = -L / 2, seatY = 0.5;
    // back profile: tall at the left end, a scrolled sweep down to nothing two thirds along
    const hAt = (x) => { const u = (x - x0) / (L * 0.7); if (u >= 1) return 0; const k = 1 - u; return 0.12 + 0.75 * (k * k * (3 - 2 * k)) + 0.06 * Math.sin(u * Math.PI); };
    const prof = (pad) => { const sh = new THREE.Shape(); sh.moveTo(x0, 0); const N = 30;
      for (let i = 0; i <= N; i++) { const x = x0 + (L * 0.72) * i / N; sh.lineTo(x, Math.max(0, hAt(x) + pad)); }
      sh.lineTo(x0 + L * 0.72, 0); sh.closePath(); return sh; };
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(prof(0.05), { depth: 0.08, bevelEnabled: false }), lac); frame.position.set(0, seatY, -0.36); frame.castShadow = true; g.add(frame);
    const back = new THREE.Mesh(new THREE.ExtrudeGeometry(prof(0), { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.03, bevelSegments: 3 }), vel); back.position.set(0, seatY, -0.3); g.add(back);
    // diamond tufting
    for (let r = 0; r < 4; r++) for (let x = x0 + 0.15 + (r % 2) * 0.1; x < x0 + L * 0.68; x += 0.2) {
      const y = 0.1 + r * 0.17; if (y > hAt(x) - 0.08) continue;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), mat("#e8e0f0", { metalness: 0.6, roughness: 0.2 })); b.position.set(x, seatY + y, -0.16); g.add(b);
    }
    // crest carving at the high point and the end of the sweep
    scroll(lac, x0 + 0.25, seatY + hAt(x0 + 0.25) + 0.08, -0.3, 0.07, 0, 0.3, g);
    scroll(lac, x0 + L * 0.66, seatY + 0.14, -0.3, 0.06, Math.PI, -0.4, g);
    // seat, seat rail with nailheads, carved apron
    const seat = new THREE.Mesh(new THREE.BoxGeometry(L, 0.16, 0.66, 6, 1, 3), vel); seat.position.set(0, seatY + 0.02, 0.0); seat.castShadow = true; g.add(seat);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, L, 10), vel); lip.rotation.z = Math.PI / 2; lip.position.set(0, seatY + 0.02, 0.31); g.add(lip);
    box(L + 0.04, 0.09, 0.7, lac, 0, seatY - 0.1, 0.0, g);
    for (let x = x0 + 0.05; x < -x0; x += 0.06) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 3), brass); n.position.set(x, seatY - 0.07, 0.36); g.add(n); }
    const med = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), lac); med.position.set(0, seatY - 0.2, 0.34); g.add(med);
    for (const sx of [-1, 1]) { scroll(lac, sx * 0.16, seatY - 0.2, 0.34, 0.05, sx > 0 ? Math.PI : 0, 0.3, g); scroll(lac, sx * 0.34, seatY - 0.18, 0.34, 0.04, sx > 0 ? Math.PI : 0, -0.3, g); }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cabriole(g, sx * (L / 2 - 0.1), sz * 0.27, seatY - 0.14, sx, sz);
    // high rolled arm (left) and a low roll (right), each with a black carved scroll face
    const roll = (x, y, r, len) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), vel); c.rotation.x = Math.PI / 2; c.position.set(x, y, 0.0); c.castShadow = true; g.add(c);
      const face = new THREE.Mesh(new THREE.TorusGeometry(r * 0.75, 0.025, 6, 16, Math.PI * 1.7), lac); face.position.set(x, y, len / 2 + 0.01); face.rotation.z = -0.6; g.add(face);
      box(r * 1.3, y - seatY + 0.05, 0.06, lac, x, (seatY + y) / 2, len / 2 - 0.02, g); };
    box(0.22, 0.5, 0.66, vel, x0 + 0.08, seatY + 0.25, 0, g); roll(x0 + 0.06, seatY + 0.52, 0.17, 0.72);
    box(0.14, 0.2, 0.66, vel, -x0 - 0.06, seatY + 0.1, 0, g); roll(-x0 - 0.04, seatY + 0.24, 0.11, 0.7);
    // bolster cushion against the high arm, and a dark brocade pillow
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12), vel); bol.rotation.x = Math.PI / 2; bol.position.set(x0 + 0.32, seatY + 0.2, 0.02); g.add(bol);
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.1, 3, 3, 1), mat("#2a1830", { roughness: 0.9 })); pil.position.set(x0 + 0.62, seatY + 0.28, -0.12); pil.rotation.set(-0.3, 0, 0.15); g.add(pil);
  };
  // black marble with white veining (shared by the ornate tables)
  const marbleM = new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.1, map: canvasTex(256, 128, (c, W2, H2) => {
    c.fillStyle = "#0c0a0e"; c.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 22; i++) { c.strokeStyle = `rgba(230,225,235,${0.08 + rnd() * 0.3})`; c.lineWidth = 0.5 + rnd() * 2; c.beginPath(); let x = 0, y = rnd() * H2; c.moveTo(x, y); while (x < W2) { x += 10 + rnd() * 20; y += (rnd() - 0.5) * 14; c.lineTo(x, y); } c.stroke(); }
  }) });
  const lacquer = mat("#0e0b10", { roughness: 0.35, metalness: 0.2 });
  // a cabriole leg: S-curved knee to an outswept scroll foot, with a carved leaf at the knee
  function cabriole(g, x, z, h, sx, sz) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, h, 0), new THREE.Vector3(sx * 0.07, h * 0.78, sz * 0.07), new THREE.Vector3(-sx * 0.02, h * 0.35, -sz * 0.02), new THREE.Vector3(sx * 0.05, 0.06, sz * 0.05)]);
    const leg = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.035, 6), lacquer); leg.position.set(x, 0, z); leg.castShadow = true; g.add(leg);
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.02, 5, 10, Math.PI * 1.5), lacquer); foot.position.set(x + sx * 0.06, 0.04, z + sz * 0.06); foot.rotation.y = Math.atan2(sx, sz); g.add(foot);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 5), lacquer); leaf.position.set(x + sx * 0.06, h * 0.82, z + sz * 0.06); leaf.rotation.x = Math.PI; g.add(leaf);
  }
  // pierced, carved apron with scrolls and a central shell
  function apron(g, w, y, z) {
    box(w * 0.9, 0.08, 0.03, lacquer, 0, y, z, g);
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) scroll(lacquer, sx * (0.18 + k * w * 0.2), y - 0.06, z + 0.01, 0.05, sx > 0 ? Math.PI : 0, Math.PI * 0.8, g);
    const shell = new THREE.Mesh(new THREE.CircleGeometry(0.09, 9, Math.PI, Math.PI), lacquer); shell.position.set(0, y - 0.04, z + 0.02); g.add(shell);
    const drop = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), lacquer); drop.rotation.x = Math.PI; drop.position.set(0, y - 0.14, z + 0.02); g.add(drop);
  }
  // tall pedestal stand with an urn of wilted, rotting flowers (petals fallen on the floor)
  BUILD.flower_stand = (g) => {
    box(0.42, 0.06, 0.42, marbleM, 0, 0.03, 0, g);
    turned(1.0, 0.07, lacquer, 0, 0.06, 0, g);
    box(0.36, 0.05, 0.36, marbleM, 0, 1.08, 0, g);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; scroll(lacquer, Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12, 0.07, -a, Math.PI, g); }
    const urnPts = [[0, 0], [0.08, 0], [0.1, 0.04], [0.07, 0.1], [0.14, 0.26], [0.13, 0.34], [0.16, 0.38], [0, 0.38]];
    const urn = new THREE.Mesh(new THREE.LatheGeometry(urnPts.map(([a, b]) => new THREE.Vector2(a, b)), 12), mat("#2a2a30", { metalness: 0.5, roughness: 0.4 }));
    urn.position.y = 1.1; urn.castShadow = true; g.add(urn);
    const stemM = mat("#2e3a1c"), petalCols = ["#4a1a24", "#3a2418", "#5a3a2a", "#2e1a2a"];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, lean = 0.3 + rnd() * 0.5, h = 0.35 + rnd() * 0.35;
      const tip = new THREE.Vector3(Math.cos(a) * lean * 0.45, 1.46 + h * 0.7, Math.sin(a) * lean * 0.45);
      const droop = new THREE.Vector3(tip.x * 1.5, tip.y - 0.25 - rnd() * 0.2, tip.z * 1.5);     // heads hang down
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.42, 0), new THREE.Vector3(tip.x * 0.4, 1.42 + h * 0.6, tip.z * 0.4), tip, droop]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.008, 4), stemM));
      const head = new THREE.Group(); head.position.copy(droop); g.add(head);
      for (let k = 0; k < 5; k++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 3), new THREE.MeshStandardMaterial({ color: petalCols[(i + k) % 4], emissive: ["#6a1a3a", "#3a5a2a", "#5a2a5a", "#2a5a3a"][(i + k) % 4], emissiveIntensity: 0.8, flatShading: true })); // faint eerie glow
        petal.scale.set(1, 0.35, 1.6); petal.position.set(Math.cos(k * 1.26) * 0.03, -0.02 - rnd() * 0.02, Math.sin(k * 1.26) * 0.03); petal.rotation.set(0.9 + rnd() * 0.5, k * 1.26, 0); head.add(petal);
      }
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), mat("#3a3a1c")); leaf.scale.set(0.5, 0.2, 1.8); leaf.position.copy(curve.getPoint(0.4)); leaf.rotation.set(0.6, a, 0.4); g.add(leaf);
    }
    const bloomLight = new THREE.PointLight("#9a4a7a", 0.9, 1.6, 2); bloomLight.position.set(0, 1.75, 0.1); g.add(bloomLight);
    for (let i = 0; i < 8; i++) {   // fallen petals on the floor
      const pt = new THREE.Mesh(new THREE.CircleGeometry(0.03, 5), mat(petalCols[i % 4])); pt.rotation.x = -Math.PI / 2; pt.position.set((rnd() - 0.5) * 0.9, 0.012, 0.15 + rnd() * 0.5); g.add(pt);
    }
  };
  BUILD.console_table = (g, w, d, o) => {
    const W2 = Math.max(1.1, w), D = 0.5, H = 0.86;
    const top = box(W2, 0.07, D, marbleM, 0, H, -0.08, g);
    box(W2 * 1.02, 0.02, D * 1.02, lacquer, 0, H - 0.045, -0.08, g);
    apron(g, W2, H - 0.11, -0.08 + D / 2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cabriole(g, sx * (W2 / 2 - 0.08), -0.08 + sz * (D / 2 - 0.06), H - 0.05, sx, sz);
    if (o && o.grand) {
      box(W2 * 1.03, 0.02, D * 1.03, M.gold, 0, H - 0.01, -0.08, g);                                        // gilt edge on the top
      box(W2 - 0.2, 0.04, D - 0.12, lacquer, 0, 0.18, -0.08, g);                                              // lower shelf
      for (const sx of [-1, 1]) scroll(lacquer, sx * (W2 / 2 - 0.25), 0.26, -0.08 + D / 2 - 0.05, 0.06, sx > 0 ? Math.PI : 0, 0.4, g);
      const crestR = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14, 0, Math.PI), lacquer); crestR.position.set(0, H + 0.05, -0.08 - D / 2 + 0.03); crestR.scale.y = 0.9; g.add(crestR);   // carved back gallery
      box(W2 * 0.9, 0.06, 0.03, lacquer, 0, H + 0.065, -0.08 - D / 2 + 0.03, g);
      for (const sx of [-1, 1]) { scroll(M.gold, sx * 0.2, H + 0.12, -0.08 - D / 2 + 0.05, 0.05, sx > 0 ? Math.PI : 0, 0, g); finial(lacquer, sx * (W2 / 2 - 0.04), H + 0.04, -0.08 - D / 2 + 0.03, g, 0.8); }
      const ros = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 5, 10), M.gold); ros.position.set(0, H - 0.1, -0.08 + D / 2 + 0.03); g.add(ros);
    }
    if (o && o.variant === "flowers") {
      // a small vase of rotten flowers and a little three-candle candelabra
      const vPts = [[0, 0], [0.05, 0], [0.06, 0.03], [0.04, 0.08], [0.08, 0.16], [0.07, 0.22], [0.09, 0.25], [0, 0.25]];
      const vase = new THREE.Mesh(new THREE.LatheGeometry(vPts.map(([a, b]) => new THREE.Vector2(a, b)), 10), mat("#2a2a30", { metalness: 0.5, roughness: 0.4 }));
      vase.position.set(-W2 * 0.18, H + 0.035, -0.1); g.add(vase);
      const petalCols = ["#4a1a24", "#3a2418", "#5a3a2a", "#2e1a2a"], glowCols = ["#6a1a3a", "#3a5a2a", "#5a2a5a", "#2a5a3a"];
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, h = 0.18 + rnd() * 0.15;
        const tip = new THREE.Vector3(vase.position.x + Math.cos(a) * 0.08, H + 0.3 + h, -0.1 + Math.sin(a) * 0.08);
        const droop = new THREE.Vector3(tip.x + Math.cos(a) * 0.08, tip.y - 0.1 - rnd() * 0.08, tip.z + Math.sin(a) * 0.08);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(vase.position.x, H + 0.26, -0.1), tip, droop]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.005, 4), mat("#2e3a1c")));
        for (let k = 0; k < 4; k++) { const pt = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 3), new THREE.MeshStandardMaterial({ color: petalCols[(i + k) % 4], emissive: glowCols[(i + k) % 4], emissiveIntensity: 0.8 })); pt.scale.set(1, 0.35, 1.6); pt.position.copy(droop).add(new THREE.Vector3(Math.cos(k * 1.6) * 0.02, -0.01, Math.sin(k * 1.6) * 0.02)); pt.rotation.set(1, k * 1.6, 0); g.add(pt); }
      }
      for (let i = 0; i < 4; i++) { const pt = new THREE.Mesh(new THREE.CircleGeometry(0.02, 5), mat(petalCols[i])); pt.rotation.x = -Math.PI / 2; pt.position.set(-W2 * 0.18 + (rnd() - 0.5) * 0.4, H + 0.036, (rnd() - 0.5) * 0.25); g.add(pt); }
      const iron = M.iron, cx = W2 * 0.22, top = H + 0.035;
      cyl(0.05, 0.06, 0.02, iron, cx, top + 0.01, -0.1, g, 8); cyl(0.012, 0.015, 0.16, iron, cx, top + 0.1, -0.1, g, 6);
      for (const ax of [-0.09, 0, 0.09]) {
        const h = top + 0.2 - Math.abs(ax) * 0.4;
        if (ax) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(cx, top + 0.14, -0.1), new THREE.Vector3(cx + ax, top + 0.12, -0.1), new THREE.Vector3(cx + ax, h - 0.02, -0.1)), 8, 0.008, 4), iron));
        cyl(0.022, 0.015, 0.02, iron, cx + ax, h - 0.01, -0.1, g, 8);
        waxCandle(g, cx + ax, h, -0.1, 0.06 + rnd() * 0.05, 0.014);
      }
    } else if (o && o.variant === "books") {
      // a messy pile of old books and a single candle in a brass chamberstick
      const cols = ["#5c0f1e", "#1f3d2a", "#2e2240", "#5a3a1a", "#3a0a14"];
      let y = H + 0.035;
      for (let i = 0; i < 5; i++) {
        const bw = 0.26 - i * 0.02 + rnd() * 0.03, bh = 0.045 + rnd() * 0.03, bd = 0.18 - i * 0.01;
        const b = box(bw, bh, bd, mat(cols[i % 5], { roughness: 0.85 }), -W2 * 0.18 + (rnd() - 0.5) * 0.04, y + bh / 2, -0.1, g); b.rotation.y = (rnd() - 0.5) * 0.7;
        box(bw * 0.96, bh * 0.8, 0.004, mat("#d8ccb0"), b.position.x, b.position.y, -0.1 + bd / 2 + 0.001, g).rotation.y = b.rotation.y;   // page edges
        y += bh;
      }
      const open = box(0.3, 0.02, 0.2, mat("#d8ccb0"), -W2 * 0.02, H + 0.045, 0.02, g); open.rotation.y = -0.4;      // one lying open
      const brassC = mat("#b8954a", { metalness: 0.7, roughness: 0.35 }), cx = W2 * 0.28;
      cyl(0.08, 0.085, 0.015, brassC, cx, H + 0.042, -0.1, g, 14);                           // saucer
      cyl(0.03, 0.035, 0.05, brassC, cx, H + 0.07, -0.1, g, 10);                             // socket
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 5, 10, Math.PI * 1.4), brassC); handle.position.set(cx + 0.09, H + 0.06, -0.1); handle.rotation.z = -0.7; g.add(handle);
      waxCandle(g, cx, H + 0.095, -0.1, 0.18, 0.022);
    } else {
      // a few things on top: candelabra-style candle, an old book and a small skull or urn
      waxCandle(g, W2 * 0.3, H + 0.035, -0.1, 0.16, 0.024);
      const book = box(0.22, 0.05, 0.16, M.burgundy, -W2 * 0.25, H + 0.06, -0.08, g); book.rotation.y = 0.3;
      const urn = cyl(0.05, 0.07, 0.18, mat("#2a2236", { metalness: 0.4, roughness: 0.4 }), 0, H + 0.125, -0.12, g, 8);
    }
  };
  // tall gothic window with stone tracery, moonlit glass and burgundy curtains (on a side wall)
  BUILD.gothic_window = (g, w, d) => {
    // grand gothic window: wide lancet head, moulded stone surround, five lights with
    // pointed heads, a rose window in the tracery, leaded moonlit glass, velvet drapes
    const H = 2.3, Wd = 2.6, top = H + 1.0, stone = mat("#4a4258"), stoneDk = mat("#2e2838");
    const lancetPts = (hw, base, n = 14, rise = 1) => { const c = hw * 0.28, R = hw + c, out = [[-hw, base]]; const tE = Math.acos(c / R);
      for (let k = 1; k <= n; k++) { const th = (k / n) * tE; out.push([-(R * Math.cos(th) - c), base + R * Math.sin(th) * rise]); }
      for (let k = n - 1; k >= 0; k--) { const th = (k / n) * tE; out.push([R * Math.cos(th) - c, base + R * Math.sin(th) * rise]); }
      out.push([hw, base]); return out; };
    // The big arch is kept low enough that the glass peaks at `top` and the stone surround stays under the
    // pelmet (it used to rise well past the pelmet and the top of the wall).
    const RISE = (top - H) / (1.28 * (Wd / 2) * Math.sin(Math.acos(0.28 / 1.28)));
    const shapeOf = (hw, base, bottom) => { const sh = new THREE.Shape(); sh.moveTo(-hw, bottom); lancetPts(hw, base, 14, RISE).forEach(([x, y]) => sh.lineTo(x, y)); sh.lineTo(hw, bottom); sh.closePath(); return sh; };
    // leaded glass with faint coloured panes
    const glassTex = canvasTex(256, 256, (c, W2, H2) => {
      const g2 = c.createLinearGradient(0, 0, 0, H2); g2.addColorStop(0, "#b8c4ec"); g2.addColorStop(1, "#7a86c0"); c.fillStyle = g2; c.fillRect(0, 0, W2, H2);
      const tints = ["rgba(150,90,200,0.25)", "rgba(90,160,140,0.2)", "rgba(200,90,110,0.18)", "rgba(0,0,0,0)"];
      for (let y = -16; y < H2 + 16; y += 22) for (let x = -16; x < W2 + 16; x += 22) { c.fillStyle = tints[((x + y) / 22 | 0) & 3]; c.beginPath(); c.moveTo(x, y - 11); c.lineTo(x + 11, y); c.lineTo(x, y + 11); c.lineTo(x - 11, y); c.closePath(); c.fill(); }
      c.strokeStyle = "rgba(20,20,30,0.16)"; c.lineWidth = 2;   // faint leading: at 0.85 the tiny diamonds read as a mesh screen
      for (let k = -H2; k < W2 + H2; k += 22) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + H2, H2); c.stroke(); c.beginPath(); c.moveTo(k, H2); c.lineTo(k + H2, 0); c.stroke(); }
    });
    glassTex.repeat.set(1.6, 1.6);
    const glassM = new THREE.MeshStandardMaterial({ map: glassTex, emissive: "#6a78b8", emissiveMap: glassTex, emissiveIntensity: 0.9, transparent: true, opacity: 0.92 });
    // moulded surround: three stepped rings
    for (const [pad, m, z] of [[0.42, stoneDk, -0.05], [0.28, stone, -0.03], [0.14, stoneDk, -0.01]]) {
      const sh = shapeOf(Wd / 2 + pad, H, 0.3 - pad * 0.3); const ms = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); ms.position.z = z; g.add(ms);
    }
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(Wd / 2, H, 0.3)), glassM); g.add(glass);
    // a soft purple glow: tinted glass, a halo just in front of it, and purple light spilling into the room
    glassM.emissive.set("#8a6ad0"); glassM.emissiveIntensity = 1.15;
    const halo = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(Wd / 2 + 0.35, H + 0.2, 0.15)), new THREE.MeshBasicMaterial({ color: "#9a5ae0", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.z = 0.12; g.add(halo);
    const winLight = new THREE.PointLight("#a070ff", 2.2, 4.5, 1.8); winLight.position.set(0, H * 0.6, 0.8); g.add(winLight);
    // five lights: mullions with small pointed heads
    const lights = 5, lw = Wd / lights;
    for (let i = 1; i < lights; i++) box(0.06, H - 0.35, 0.08, stone, -Wd / 2 + i * lw, 0.3 + (H - 0.3) / 2, 0.03, g);
    for (let i = 0; i < lights; i++) {
      const cx = -Wd / 2 + (i + 0.5) * lw, pts = lancetPts(lw / 2 - 0.03, H - 0.05, 6).map(([x, y]) => new THREE.Vector3(cx + x, y, 0.04));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.03, 4), stone));
    }
    box(Wd, 0.07, 0.09, stone, 0, 0.3 + (H - 0.3) * 0.45, 0.03, g);                                  // transom
    // tracery: a rose window with eight petals, flanked by two small trefoils
    const rose = new THREE.Group(); rose.position.set(0, H + 0.62, 0.04); g.add(rose);
    rose.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 5, 24), stone));
    rose.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 5, 16), stone));
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const p = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 4, 12), stone); p.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0); rose.add(p); }
    for (const sx of [-1, 1]) {
      const tr = new THREE.Group(); tr.position.set(sx * 0.82, H + 0.2, 0.04); g.add(tr);
      for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + k * (Math.PI * 2 / 3); const p = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 4, 10), stone); p.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0); tr.add(p); }
    }
    // crocket finial on the point, and a deep sill on corbels
    finial(stone, 0, top + 0.42, 0.02, g, 1.6);
    box(Wd + 1.0, 0.1, 0.36, stone, 0, 0.25, 0.14, g);
    for (const sx of [-1, 1]) scroll(stoneDk, sx * (Wd / 2 + 0.2), 0.1, 0.22, 0.08, sx > 0 ? Math.PI : 0, Math.PI / 2, g);
    // velvet drapes, tied back with gold cords, and a pelmet
    for (const sx of [-1, 1]) {
      const cur = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.36, top + 0.4, 10, 1, true), new THREE.MeshStandardMaterial({ map: velvetTex, side: THREE.DoubleSide }));
      cur.position.set(sx * (Wd / 2 + 0.45), (top + 0.4) / 2, 0.2); g.add(cur);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 5, 12), M.gold); tie.position.set(sx * (Wd / 2 + 0.45), 1.1, 0.2); tie.rotation.x = Math.PI / 2; g.add(tie);
    }
    box(Wd + 1.5, 0.3, 0.12, M.burgundy, 0, top + 0.5, 0.25, g);
    for (let i = 0; i < 9; i++) { const tas = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), M.gold); tas.position.set(-Wd / 2 - 0.6 + i * (Wd + 1.2) / 8, top + 0.29, 0.3); tas.rotation.x = Math.PI; g.add(tas); }
    // cold moonlight falling into the hall
    const shaft = new THREE.SpotLight("#a8b8ff", 10, 9, 0.6, 0.9, 1.2); shaft.position.set(0, 2.4, -1); shaft.target.position.set(0, 0, 4); g.add(shaft, shaft.target);
  };

  // stone half-column against the wall: base, fluted shaft, carved capital, cobwebby
  BUILD.pillar = (g) => {
    const st = M.stone, dark = mat("#3a3248");
    const P = new THREE.Group(); P.position.set(0, -1.45, 0.12); P.scale.y = 3.55 / 2.63; g.add(P);   // build from the floor, up to the tall crown
    box(0.62, 0.18, 0.4, dark, 0, 0.09, 0, P); box(0.52, 0.12, 0.34, st, 0, 0.24, 0, P);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 2.1, 12, 1, false, -Math.PI / 2, Math.PI), st); shaft.position.y = 1.35; shaft.castShadow = true; P.add(shaft);
    for (let k = 0; k < 5; k++) { const fl = new THREE.Mesh(new THREE.BoxGeometry(0.025, 2.0, 0.02), dark); const a = -Math.PI / 2 + (k + 0.5) * Math.PI / 5; fl.position.set(Math.sin(a) * 0.205, 1.35, Math.cos(a) * 0.205); fl.rotation.y = a; P.add(fl); }
    box(0.56, 0.1, 0.36, dark, 0, 2.45, 0, P); box(0.66, 0.12, 0.42, st, 0, 2.57, 0, P);
    for (const sx of [-1, 1]) scroll(st, sx * 0.22, 2.42, 0.16, 0.07, sx > 0 ? Math.PI : 0, 0, P); // ionic volutes
  };
  // The Watcher: a massive potted plant with one eye that follows the player
  BUILD.eye_plant = (g) => {
    const moss = new THREE.MeshStandardMaterial({ color: "#5a7a2a", roughness: 1, flatShading: true });
    const mossDark = new THREE.MeshStandardMaterial({ color: "#3a5a1c", roughness: 1, flatShading: true });
    const petalM = new THREE.MeshStandardMaterial({ color: "#a8285a", roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    const thornM = mat("#e8e0cc");
    // big hexagonal pot with a label
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.9, 6), mat("#24202c")); pot.position.y = 0.45; pot.castShadow = true; g.add(pot);
    box(0.5, 0.28, 0.02, mat("#c8b890"), 0, 0.45, 0.62, g);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.05, 6), mat("#1a120c")); soil.position.y = 0.9; g.add(soil);
    // thick stem
    const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(0.1, 1.8, 0.05), new THREE.Vector3(-0.05, 2.6, 0.1), new THREE.Vector3(0, 3.2, 0.25)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 16, 0.14, 7), moss));
    // curling tentacle vines with thorns, and broad leaves
    const vines = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = 1.3 + rnd() * 0.6;
      const pts = [new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(Math.cos(a) * r * 0.5, 1.6 + rnd() * 0.4, Math.sin(a) * r * 0.5), new THREE.Vector3(Math.cos(a) * r, 1.2 + rnd() * 0.8, Math.sin(a) * r), new THREE.Vector3(Math.cos(a + 0.6) * r * 0.9, 0.7 + rnd() * 0.6, Math.sin(a + 0.6) * r * 0.9)];
      const curve = new THREE.CatmullRomCurve3(pts);
      const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.07, 6), i % 2 ? moss : mossDark); g.add(vine);
      for (let k = 1; k < 6; k++) { const p = curve.getPoint(k / 6); const th = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), thornM); th.position.copy(p).add(new THREE.Vector3(0, 0.07, 0)); g.add(th); }
      vines.push({ vine, base: a });
    }
    for (let i = 0; i < 4; i++) {
      const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.35, 0.4, 0, 1.1); leafShape.quadraticCurveTo(-0.35, 0.4, 0, 0);
      const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape), new THREE.MeshStandardMaterial({ color: "#6a8a34", side: THREE.DoubleSide, flatShading: true }));
      leaf.position.set(0, 1.4, 0); leaf.rotation.set(-1.0, (i / 4) * Math.PI * 2 + 0.7, 0); g.add(leaf);
    }
    // the flower head: magenta petals with moss rims around one huge eye
    const head = new THREE.Group(); head.position.set(0, 3.3, 0.3); g.add(head);
    for (let i = 0; i < 6; i++) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.45, 0.35, 0.3, 0.85); sh.quadraticCurveTo(0, 1.0, -0.3, 0.85); sh.quadraticCurveTo(-0.45, 0.35, 0, 0);
      const petal = new THREE.Mesh(new THREE.ShapeGeometry(sh), petalM); petal.rotation.z = (i / 6) * Math.PI * 2; petal.position.z = -0.05; head.add(petal);
      const rim = new THREE.Mesh(new THREE.ShapeGeometry(sh), moss); rim.scale.set(1.12, 1.1, 1); rim.rotation.z = (i / 6) * Math.PI * 2; rim.position.z = -0.08; head.add(rim);
    }
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), moss); lid.scale.z = 0.6; head.add(lid);
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), new THREE.MeshStandardMaterial({ color: "#f0e8e0", roughness: 0.3 })); eyeball.position.z = 0.1; head.add(eyeball);
    const iris = new THREE.Group(); eyeball.add(iris);
    const irisM = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshStandardMaterial({ color: "#8a2a4a", emissive: "#3a0a1a", emissiveIntensity: 0.6 })); irisM.position.z = 0.335; iris.add(irisM);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), mat("#050304")); pupil.position.z = 0.337; iris.add(pupil);
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), new THREE.MeshBasicMaterial({ color: "#fff" })); glint.position.set(-0.05, 0.05, 0.339); iris.add(glint);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), moss); lower.position.z = 0.05; head.add(lower); // lower lid
    const EYE = 1.6;                                            // one enormous eye
    lid.scale.set(EYE, EYE, 0.6 * EYE); eyeball.scale.setScalar(EYE); eyeball.position.z = 0.16; lower.scale.setScalar(EYE); lower.position.z = 0.1;
    const light = new THREE.PointLight("#c83a6a", 1.6, 4, 1.6); light.position.set(0, 3.3, 1.0); g.add(light);
    g.scale.setScalar(0.72);                                     // a little smaller
    const pink = new THREE.PointLight("#ff5fa8", 2.4, 5, 1.6); pink.position.set(0, 3.0, 0.8); g.add(pink); // soft pink glow
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: "#ff6fb0", transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.set(0, 3.3, 0.1); g.add(halo);
    g.userData.watcher = { head, iris, vines, pink, halo };
  };
  // burgundy banner / tapestry hanging from an iron rod
  BUILD.banner = (g) => {
    const rod = cyl(0.025, 0.025, 1.1, M.iron, 0, 0.95, 0.04, g, 6); rod.rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) finial(M.iron, sx * 0.55, 0.95, 0.04, g, 0.7);
    const shape = new THREE.Shape();
    shape.moveTo(-0.4, 0.9); shape.lineTo(0.4, 0.9); shape.lineTo(0.4, -1.5); shape.lineTo(0, -1.85); shape.lineTo(-0.4, -1.5); shape.closePath();
    const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map: velvetTex, side: THREE.DoubleSide, roughness: 1 }));
    cloth.position.z = 0.05; g.add(cloth);
    const trim = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: "#8a6a2a", side: THREE.DoubleSide, metalness: 0.4 })); trim.scale.set(1.08, 1.04, 1); trim.position.z = 0.04; g.add(trim);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.16, 6), mat("#1a0a10")); emblem.position.set(0, 0.1, 0.06); g.add(emblem);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 4, 12), M.gold); ring.position.set(0, 0.1, 0.065); g.add(ring);
  };
  // small side tables against the wall: one with a single skull, one with a specimen jar
  function sideTable(g) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 14), marbleM); top.position.y = 0.78; top.castShadow = true; g.add(top);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 4, 18), lacquer); lip.rotation.x = Math.PI / 2; lip.position.y = 0.76; g.add(lip);
    turned(0.5, 0.045, lacquer, 0, 0.25, 0, g);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; cabriole(g, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.32, Math.cos(a) * 1.4, Math.sin(a) * 1.4); }
    const cloth = box(0.4, 0.004, 0.4, M.burgundy, 0, 0.81, 0, g); cloth.rotation.y = 0.6; cloth.castShadow = false;
  }
  BUILD.skull_table = (g) => {
    sideTable(g);
    const skull = new THREE.Group(); skull.position.set(0, 0.92, 0.04); skull.rotation.y = 0.3; g.add(skull);
    const cr = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), bone); cr.scale.set(0.9, 0.9, 1.05); skull.add(cr);
    box(0.12, 0.06, 0.1, bone, 0, -0.07, 0.04, skull);                                    // jaw
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), mat("#050305")); e.position.set(sx * 0.04, 0.0, 0.085); skull.add(e); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.03, 3), mat("#050305")); nose.position.set(0, -0.035, 0.1); nose.rotation.x = Math.PI; skull.add(nose);
    for (let i = 0; i < 4; i++) box(0.012, 0.018, 0.005, mat("#e8e0c8"), -0.03 + i * 0.02, -0.075, 0.095, skull);
    cyl(0.025, 0.025, 0.12, M.cream, -0.2, 0.87, -0.1, g, 6); flame(g, -0.2, 0.95, -0.1, "#7bd389", 0.035);
  };
  BUILD.jar_table = (g) => {
    sideTable(g);
    const glass = new THREE.MeshStandardMaterial({ color: "#9fd6b0", transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false });
    const jar = cyl(0.12, 0.12, 0.32, glass, 0, 0.98, 0, g, 16); jar.castShadow = false;
    const liquid = cyl(0.11, 0.11, 0.26, new THREE.MeshStandardMaterial({ color: "#3fae6a", emissive: "#1f6b3a", emissiveIntensity: 0.9, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.96, 0, g, 16); liquid.castShadow = false;
    cyl(0.13, 0.13, 0.04, M.brass, 0, 1.15, 0, g, 16);                                    // lid
    // the thing inside: a small pale creature with a tail that drifts and twitches
    const thing = new THREE.Group(); thing.position.y = 0.96; g.add(thing);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat("#d8c8b0", { emissive: "#2a3a20" })); body.scale.set(1, 0.8, 1.4); thing.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 5), mat("#c8b8a0")); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.08; thing.add(tail);
    for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, 5, 3), mat("#050305")); eye.position.set(sx * 0.018, 0.012, 0.055); thing.add(eye); }
    g.userData.jarThing = { thing, tail, phase: rnd() * 10 };
    // the jar's light hangs above the lid (down at jar height it mirrored in the table's rim as a bright dot
    // below the jar); a soft halo sits on the jar itself so the glow is where the jar is
    const l = new THREE.PointLight("#5fe08a", 0.8, 2.2, 2); l.position.y = 1.75; g.add(l);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), new THREE.MeshBasicMaterial({ color: "#5fe08a", transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.y = 0.98; g.add(halo);
  };
  BUILD.glow_book = () => {}; // interaction spot only; the book itself sits on the shelf (see below)
  // iron-bound wooden trunk: planked body, slanted lid, bronze straps with domed
  // studs, an ornate hasp in the middle and lion-head ring handles on the front
  BUILD.trunk = (g, w) => {
    const W2 = 1.5, D = 0.75, H = 0.55;
    const bronze = mat("#3a3020", { metalness: 0.7, roughness: 0.45 }), bronzeHi = mat("#7a6634", { metalness: 0.8, roughness: 0.35 });
    const wood = texMat(grimeWood("#4a2e1c", "#1a0e08"));
    const body = new THREE.Group(); body.position.set(0, 0, -0.05); g.add(body);
    box(W2, H, D, wood, 0, 0.06 + H / 2, 0, body);
    box(W2 + 0.04, 0.06, D + 0.04, M.darkWood, 0, 0.03, 0, body);                               // plinth
    // the lid hinges at the back so it can swing open
    const lidG = new THREE.Group(); lidG.position.set(0, 0.06 + H, -D / 2); body.add(lidG);
    const lid = box(W2 + 0.02, 0.22, D + 0.02, wood, 0, 0.1, D / 2 - 0.02, lidG); lid.rotation.x = -0.08;
    box(W2 + 0.03, 0.04, D * 0.55, wood, 0, 0.23, D / 2 - 0.12, lidG).rotation.x = -0.35;      // slanted top
    for (const x of [-W2 / 2 + 0.06, -0.32, 0.32, W2 / 2 - 0.06]) box(0.11, 0.24, D + 0.05, bronze, x, 0.12, D / 2 - 0.02, lidG); // straps over the lid
    box(W2 - 0.08, 0.02, D - 0.08, mat("#2a0a14"), 0, 0.06 + H - 0.02, 0, body);                 // velvet lining inside
    // the sandbox cube waiting inside: a sealed glass box with a tiny glowing world in it
    const cube = new THREE.Group(); cube.position.set(0, 0.06 + H - 0.1, 0); cube.visible = false; body.add(cube);
    box(0.34, 0.34, 0.34, new THREE.MeshStandardMaterial({ color: "#7bd389", emissive: "#3fae6a", emissiveIntensity: 0.9, transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 0, 0, cube);
    for (const [ex, ey] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { box(0.02, 0.36, 0.02, bronzeHi, ex * 0.17, 0, ey * 0.17, cube); box(0.36, 0.02, 0.02, bronzeHi, 0, ex * 0.17, ey * 0.17, cube); }
    box(0.12, 0.12, 0.12, new THREE.MeshBasicMaterial({ color: "#c8f5d2" }), 0, 0, 0, cube);
    const cubeLight = new THREE.PointLight("#7bd389", 0, 2.5, 2); cube.add(cubeLight);
    g.userData.trunk = { lidG, cube, cubeLight, open: 0 };
    for (let k = 0; k < 4; k++) box(W2 - 0.04, 0.008, 0.012, mat("#1a0e08"), 0, 0.12 + k * 0.13, D / 2 + 0.004, body); // plank seams
    for (const x of [-W2 / 2 + 0.06, -0.32, 0.32, W2 / 2 - 0.06]) {                               // vertical straps
      box(0.11, H + 0.3, D + 0.04, bronze, x, 0.06 + (H + 0.3) / 2, 0, body);
      for (const y of [0.12, 0.34, 0.56, 0.74]) { const st = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), bronzeHi); st.position.set(x, y, D / 2 + 0.025); body.add(st); }
    }
    for (const y of [0.14, 0.62]) box(W2 + 0.04, 0.08, D + 0.05, bronze, 0, y, 0, body);           // horizontal bands
    // ornate central hasp
    const hasp = new THREE.Group(); hasp.position.set(0, 0.55, D / 2 + 0.04); body.add(hasp);
    box(0.14, 0.34, 0.02, bronze, 0, 0, 0, hasp);
    for (const sx of [-1, 1]) scroll(bronzeHi, sx * 0.07, 0.1, 0.012, 0.045, sx > 0 ? Math.PI : 0, 0, hasp);
    const heart = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), bronzeHi); heart.rotation.z = Math.PI; heart.position.set(0, -0.2, 0.01); hasp.add(heart);
    const lock = box(0.06, 0.06, 0.03, mat("#0a0806"), 0, -0.02, 0.015, hasp);
    // lion heads with ring pulls
    for (const sx of [-1, 1]) {
      const L = new THREE.Group(); L.position.set(sx * 0.48, 0.38, D / 2 + 0.05); body.add(L);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bronzeHi); head.scale.z = 0.5; L.add(head);
      for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), bronze); const a = (k / 8) * Math.PI * 2; m.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.01); m.rotation.z = a - Math.PI / 2; L.add(m); } // mane
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 14), bronzeHi); ring.position.set(0, -0.08, 0.03); L.add(ring);
    }
  };
  // a warning scrawled on the wall in dripping green paint
  // hand-scrawled wall writing (Permanent Marker), redrawn once the web font has loaded
  function scrawlTex(paint, font = "40px 'Permanent Marker'") {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 256;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const draw = () => { const c = cv.getContext("2d"); c.clearRect(0, 0, 512, 256); paint(c, 512, 256); tex.needsUpdate = true; };
    draw();
    if (document.fonts) document.fonts.load(font).then(draw).catch(() => {});
    return tex;
  }
  const HAND = "'Permanent Marker', 'Comic Sans MS', cursive";
  const CHALK = "'Fredericka the Great', 'Permanent Marker', serif";
  // rub little gaps out of whatever was just drawn, so it reads as dusty chalk
  function chalkDust(c, W2, H2, amount = 0.0022) {
    c.save(); c.globalCompositeOperation = "destination-out";
    let s4 = 9; const r4 = () => ((s4 = (s4 * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < W2 * H2 * amount; i++) { c.globalAlpha = 0.25 + r4() * 0.5; c.fillRect(r4() * W2, r4() * H2, 1 + r4() * 2.5, 1 + r4() * 1.5); }
    c.restore();
  }
  BUILD.riddle_scrawl = (g) => {
    const tex = scrawlTex((c, W2, H2) => {
      c.textAlign = "center"; c.fillStyle = "rgba(255,170,215,0.95)";
      c.font = `42px ${CHALK}`;
      ["I begin every terror", "and end every ghost.", "I'm in trust twice,", "but never in fear."].forEach((l, i) => { c.save(); c.translate(W2 / 2, 44 + i * 56); c.rotate((i % 2 ? 1 : -1) * 0.02); c.fillText(l, 0, 0); c.restore(); });
      chalkDust(c, W2, H2);
    }, "42px 'Fredericka the Great'");
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.35), new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: "#ff5fa8", emissiveMap: tex, emissiveIntensity: 0.9, depthWrite: false }));
    m.position.set(0.2, 0.75, 0.02); g.add(m);
  };
  BUILD.graffiti = (g) => {
    // "It never asks first", finger-painted in something dark red and dragged sideways while still wet
    const tex = scrawlTex((c, W2, H2) => {
      let s3 = 4; const r3 = () => ((s3 = (s3 * 1664525 + 1013904223) >>> 0) / 4294967296);
      const lines = [["It never", 96], ["asks first", 190]];
      c.textAlign = "center"; c.font = `78px ${HAND}`;
      // the smear: only the last letter, where the hand dragged away to the right
      const tx = W2 / 2 + c.measureText("asks first").width / 2 - c.measureText("t").width / 2;
      c.textAlign = "center";
      for (let k = 12; k >= 1; k--) { c.fillStyle = `rgba(200,18,22,${0.05 + (12 - k) * 0.008})`; c.fillText("t", tx + k * 4, 190 + k * 0.7); }
      c.save(); c.shadowColor = "rgba(10,0,2,0.95)"; c.shadowBlur = 16; c.fillStyle = "rgba(20,0,4,0.75)";      // a dark wet halo, so it stands off the red wallpaper
      for (const [t, y] of lines) c.fillText(t, W2 / 2, y); c.restore();
      for (const [t, y] of lines) { c.fillStyle = "rgba(225,24,28,1)"; c.fillText(t, W2 / 2, y); c.fillStyle = "rgba(120,6,10,0.45)"; c.fillText(t, W2 / 2 + 2, y + 2); }
      c.fillStyle = "rgba(215,20,24,0.95)";
      for (let i = 0; i < 7; i++) { const x = 90 + r3() * 330, y = lines[i % 2][1] + 4, len = 5 + r3() * 15; c.fillRect(x, y, 3, len); c.beginPath(); c.arc(x + 1.5, y + len, 3.2, 0, Math.PI * 2); c.fill(); }   // drips
      for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(130,10,14,${0.3 + r3() * 0.4})`; c.beginPath(); c.ellipse(60 + r3() * 400, 30 + r3() * 200, 2 + r3() * 7, 1.5 + r3() * 4, r3() * 3, 0, 7); c.fill(); }     // spatter
      c.save(); c.globalCompositeOperation = "destination-out";         // dry patches where the finger ran out
      for (let i = 0; i < 110; i++) { c.globalAlpha = 0.2 + r3() * 0.3; c.fillRect(r3() * W2, r3() * H2, 2 + r3() * 9, 1 + r3() * 1.5); }
      c.restore();
    }, "78px 'Permanent Marker'");
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: "#ff2222", emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.4, depthWrite: false }));
    m.scale.setScalar(1.15); m.position.set(0.4, 0.6, 0.02); g.add(m);
  };

  // a carved wall shelf with bell jars (moths, a feather, a tiny skull) and a few old books
  BUILD.curio_shelf = (g) => {
    const W2 = 1.2, Y = -0.25;
    box(W2, 0.05, 0.32, M.darkWood, 0, Y, 0.16, g);
    box(W2 + 0.06, 0.025, 0.34, M.carve, 0, Y - 0.035, 0.16, g);
    for (const sx of [-1, 1]) scroll(M.carve, sx * W2 * 0.4, Y - 0.14, 0.12, 0.08, Math.PI / 2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, g);
    const glassM = new THREE.MeshStandardMaterial({ color: "#c8d8e0", transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
    const jar = (x, h, r, inner) => {
      cyl(r + 0.02, r + 0.03, 0.025, M.darkWood, x, Y + 0.04, 0.16, g, 12);                     // wooden base
      const dome = new THREE.Mesh(new THREE.CapsuleGeometry(r, h - r * 2, 4, 12), glassM); dome.position.set(x, Y + 0.05 + h / 2, 0.16); g.add(dome);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), glassM); knob.position.set(x, Y + 0.06 + h, 0.16); g.add(knob);
      inner(x, Y + 0.06);
    };
    jar(-0.38, 0.32, 0.09, (x, y) => { cyl(0.006, 0.006, 0.16, M.darkWood, x, y + 0.08, 0.16, g, 4); for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.04, 3), mat("#6a5a4a", { side: THREE.DoubleSide })); w.position.set(x + sx * 0.03, y + 0.15, 0.16); w.rotation.z = sx * 0.5; g.add(w); } }); // pinned moth
    jar(0.02, 0.26, 0.08, (x, y) => { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bone); sk.position.set(x, y + 0.04, 0.16); g.add(sk); box(0.04, 0.02, 0.03, bone, x, y + 0.01, 0.18, g); });   // tiny skull
    jar(0.4, 0.36, 0.075, (x, y) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.22, 4), mat("#1a1a22")); f.position.set(x, y + 0.12, 0.16); f.rotation.z = 0.2; g.add(f); });  // black feather
    const bookCols = ["#5c0f1e", "#1f3d2a", "#2e2240"];
    for (let i = 0; i < 3; i++) { const b = box(0.05, 0.2 + i * 0.02, 0.15, mat(bookCols[i]), -0.12 + i * 0.055, Y + 0.12 + i * 0.01, 0.14, g); if (i === 2) b.rotation.z = 0.25; }
  };
  // a witchy wall shelf: tiny cauldron with green bubbling brew, potion bottles, a candle and a skull
  BUILD.witch_shelf = (g) => {
    const W2 = 1.2, Y = -0.25;
    box(W2, 0.05, 0.32, M.darkWood, 0, Y, 0.16, g);
    box(W2 + 0.06, 0.025, 0.34, M.carve, 0, Y - 0.035, 0.16, g);
    for (const sx of [-1, 1]) scroll(M.carve, sx * W2 * 0.4, Y - 0.14, 0.12, 0.08, Math.PI / 2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, g);
    // cauldron on three little legs, with a glowing brew
    const cx = -0.32, cy = Y + 0.03;
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), mat("#151318", { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
    pot.position.set(cx, cy + 0.12, 0.16); g.add(pot);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.016, 5, 14), mat("#151318", { metalness: 0.6 })); rim.rotation.x = Math.PI / 2; rim.position.set(cx, cy + 0.19, 0.16); g.add(rim);
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), new THREE.MeshStandardMaterial({ color: "#5fe08a", emissive: "#3fae6a", emissiveIntensity: 1.4 })); brew.rotation.x = -Math.PI / 2; brew.position.set(cx, cy + 0.18, 0.16); g.add(brew);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; cyl(0.008, 0.008, 0.05, M.iron, cx + Math.cos(a) * 0.07, cy + 0.02, 0.16 + Math.sin(a) * 0.07, g, 4); }
    const bubbles = [];
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 3), new THREE.MeshBasicMaterial({ color: "#9fe8b8", transparent: true })); g.add(b); bubbles.push({ b, ph: rnd(), x: cx + (rnd() - 0.5) * 0.08, z: 0.16 + (rnd() - 0.5) * 0.08, y0: cy + 0.19 }); }
    const steam = new THREE.PointLight("#5fe08a", 0.8, 1.4, 2); steam.position.set(cx, cy + 0.35, 0.3); g.add(steam);
    g.userData.cauldron = { bubbles };
    // potion bottles of different shapes and colours
    const potion = (x, h, r, col, shape) => {
      const glassM = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, transparent: true, opacity: 0.75, roughness: 0.1 });
      const body = shape === "round" ? new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), glassM) : new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 8), glassM);
      body.position.set(x, Y + 0.03 + (shape === "round" ? r : h / 2), 0.16); g.add(body);
      const neckY = Y + 0.03 + (shape === "round" ? r * 2 : h);
      cyl(r * 0.3, r * 0.35, 0.05, glassM, x, neckY + 0.025, 0.16, g, 6);
      cyl(r * 0.35, r * 0.35, 0.025, M.darkWood, x, neckY + 0.06, 0.16, g, 6);                 // cork
    };
    potion(-0.08, 0.16, 0.045, "#9a4dff", "tall"); potion(0.06, 0, 0.06, "#ff5fa8", "round"); potion(0.18, 0.12, 0.035, "#3fae6a", "tall");
    waxCandle(g, 0.32, Y + 0.03, 0.16, 0.1, 0.02);
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bone); sk.position.set(0.46, Y + 0.08, 0.16); g.add(sk);
  };
  // heavy drawn curtains over a hidden window, hung from an iron rod under the crown
  BUILD.closed_curtains = (g, w, d, o) => {
    const W2 = (o && o.width) || 2.4, H = o && o.side ? 2.35 : 3.3;   // on a side wall, stay below the wall top
    const rod = cyl(0.03, 0.03, W2 + 0.4, M.iron, 0, H + 0.05, 0.12, g, 6); rod.rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) finial(M.iron, sx * (W2 / 2 + 0.2), H + 0.05, 0.12, g, 0.9);
    const geo = new THREE.PlaneGeometry(W2 / 2 + 0.05, H, 24, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.05);       // deep folds
    geo.computeVertexNormals();
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: velvetTex, side: THREE.DoubleSide, roughness: 1 }));
      c.position.set(sx * (W2 / 4), H / 2 + 0.02, 0.12); c.castShadow = true; g.add(c);
    }
    box(W2 + 0.3, 0.32, 0.1, M.burgundy, 0, H - 0.1, 0.18, g);                                   // pelmet
    for (let i = 0; i < 9; i++) { const tas = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 5), M.gold); tas.position.set(-W2 / 2 + i * W2 / 8, H - 0.3, 0.22); tas.rotation.x = Math.PI; g.add(tas); }
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.03, H - 0.3), new THREE.MeshBasicMaterial({ color: "#b0b8e8", transparent: true, opacity: 0.25 })); seam.position.set(0, H / 2 - 0.1, 0.16); g.add(seam); // a sliver of moonlight
    // a soft purple glow from the window behind: light bleeding through the seam, round the edges and across the floor
    seam.material.color.set("#b98cff"); seam.material.opacity = 0.75; seam.scale.x = 2.2;
    const softTex = canvasTex(128, 128, (c, W3, H3) => { const gr = c.createRadialGradient(W3 / 2, H3 / 2, 4, W3 / 2, H3 / 2, W3 / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.6, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, W3, H3); });
    const glowM = new THREE.MeshBasicMaterial({ color: "#9a5ae0", map: softTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(W2 + 0.7, H + 0.3), glowM); veil.position.set(0, H / 2, 0.2); g.add(veil);            // the cloth itself glows faintly
    for (const sx of [-1, 1]) { const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.14, H), new THREE.MeshBasicMaterial({ color: "#b98cff", transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); edge.position.set(sx * (W2 / 2 + 0.06), H / 2, 0.1); g.add(edge); }
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(W2 + 0.4, 1.6), new THREE.MeshBasicMaterial({ color: "#8a4ad8", map: softTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); spill.scale.set(1.2, 1.5, 1); spill.rotation.x = -Math.PI / 2; spill.position.set(0, 0.03, 1.0); g.add(spill);
    const cl = new THREE.PointLight("#a070ff", 3.2, 5.5, 1.6); cl.position.set(0, H * 0.55, 0.7); g.add(cl);
    g.userData.curtainGlow = { glowM, cl };
  };
  // a long black-and-white banded snake asleep in a loose coil, tail sprawled across the
  // tiles, with a big lump in its belly where it's still digesting its last meal
  BUILD.snake = (g) => {
    const bandTex = canvasTex(256, 32, (c, W2, H2) => {
      for (let x = 0; x < W2; x += 32) { c.fillStyle = "#141414"; c.fillRect(x, 0, 20, H2); c.fillStyle = "#e8e4da"; c.fillRect(x + 20, 0, 12, H2); }
      c.globalAlpha = 0.18; c.fillStyle = "#000";                       // faint scale rows
      for (let x = 0; x < W2; x += 6) for (let y = 0; y < H2; y += 5) { c.beginPath(); c.arc(x + (y / 5 % 2) * 3, y, 2.6, 0, Math.PI); c.fill(); }
    });
    bandTex.repeat.set(14, 1);
    const skin = new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.4, metalness: 0.05 });
    const pts = [];
    [[1.9, 0.95], [1.5, 1.15], [1.0, 0.9], [0.5, 1.0], [0.1, 0.75], [-0.1, 0.45]].forEach(([x, z]) => pts.push(new THREE.Vector3(x, 0.07, z)));
    for (let k = 0; k <= 26; k++) { const a = Math.PI * 0.5 + k / 26 * Math.PI * 4, r = 0.42 - k * 0.011; pts.push(new THREE.Vector3(-0.45 + Math.cos(a) * r, 0.07 + k * 0.006, 0.05 + Math.sin(a) * r)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const SEG = 220, RAD = 12, R0 = 0.075;
    const geo = new THREE.TubeGeometry(curve, SEG, R0, RAD);
    // reshape the tube: taper the tail, swell a big digesting bulge on the sprawled stretch
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, c = curve.getPointAt(u);
      const taper = 0.15 + 0.85 * Math.min(1, u / 0.12);
      const bulge = 1 + 2.3 * Math.exp(-Math.pow((u - 0.14) / 0.04, 2));
      for (let j = 0; j <= RAD; j++) {
        const idx = i * (RAD + 1) + j; v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(taper * bulge);
        v.add(c); if (bulge > 1.05) v.y += (bulge - 1) * R0 * 0.9; // bulge rests on the floor
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, skin); body.castShadow = true; g.add(body);
    const end = curve.getPoint(1), before = curve.getPoint(0.98);
    const head = new THREE.Group(); head.position.copy(end).add(new THREE.Vector3(0, 0.07, 0)); g.add(head);
    head.lookAt(end.clone().add(end.clone().sub(before)).add(new THREE.Vector3(0, 0.07, 0)));
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat("#141414", { roughness: 0.4 })); skull.scale.set(0.9, 0.55, 1.4); head.add(skull);
    for (const sx of [-1, 1]) { const lid = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 4, 8, Math.PI), mat("#e8e4da")); lid.rotation.set(-Math.PI / 2, 0, Math.PI); lid.position.set(sx * 0.06, 0.05, 0.06); head.add(lid); } // closed, sleepy eyes
    const zz = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 32, (c) => { c.fillStyle = "#cfe8d0"; c.font = "bold 20px serif"; c.fillText("z", 6, 26); c.font = "bold 14px serif"; c.fillText("z", 28, 16); }), transparent: true, depthWrite: false }));
    zz.scale.set(0.35, 0.18, 1); zz.position.copy(head.position).add(new THREE.Vector3(0, 0.35, 0)); g.add(zz);
    g.scale.setScalar(1.5);
    g.userData.snake = { body, zz, zy: zz.position.y };
  };
  // a single small lancet window for a side wall, moonlit
  BUILD.small_window = (g) => {
    const stone = mat("#4a4258"), hw = 0.45, sill = 0.95, top = 2.25;
    const sh = new THREE.Shape(); sh.moveTo(-hw, sill); sh.lineTo(-hw, top - hw); sh.absarc(0, top - hw, hw, Math.PI, 0, true); sh.lineTo(hw, sill); sh.closePath();
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), new THREE.MeshStandardMaterial({ color: "#8e9ad0", emissive: "#5a68b0", emissiveIntensity: 0.9, roughness: 0.2 }));
    glass.position.z = 0.03; g.add(glass);
    const fr = new THREE.Shape(); fr.moveTo(-hw - 0.1, sill - 0.08); fr.lineTo(-hw - 0.1, top - hw); fr.absarc(0, top - hw, hw + 0.1, Math.PI, 0, true); fr.lineTo(hw + 0.1, sill - 0.08); fr.closePath(); fr.holes.push(sh);
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.08, bevelEnabled: false, curveSegments: 16 }), stone); frame.position.z = 0.02; g.add(frame);
    const lead = mat("#1e1a24");
    box(0.025, top - sill - 0.1, 0.02, lead, 0, (sill + top) / 2 - 0.05, 0.05, g);
    for (let y = sill + 0.3; y < top - 0.3; y += 0.3) box(hw * 2, 0.02, 0.02, lead, 0, y, 0.05, g);
    box(hw * 2 + 0.3, 0.07, 0.18, stone, 0, sill - 0.08, 0.1, g);                     // sill
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), new THREE.MeshBasicMaterial({ color: "#7a86d0", transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.visible = false;
  };
  // brass towel rail with two thick towels draped over it
  BUILD.towel_rail = (g, w, d, o) => {
    const brass = mat("#a8823a", { metalness: 0.7, roughness: 0.35 }), y = 1.35, len = 1.1;
    const rail = cyl(0.025, 0.025, len, brass, 0, y, 0.14, g, 8); rail.rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) { box(0.04, 0.04, 0.14, brass, sx * len / 2, y, 0.07, g); const rose = cyl(0.05, 0.05, 0.02, brass, sx * len / 2, y, 0.01, g, 10); rose.rotation.x = Math.PI / 2; }
    const cols = o.colors || ["#5a1a2a", "#2e4a34"];
    cols.forEach((col, k) => {
      const tw = 0.42, x = (k - 0.5) * 0.5, m = mat(col, { roughness: 0.95 });
      box(tw, 0.55, 0.035, m, x, y - 0.27, 0.115, g);                       // back drop
      box(tw, 0.42, 0.035, m, x, y - 0.2, 0.175, g);                        // front drop
      const fold = cyl(0.045, 0.045, tw, m, x, y + 0.01, 0.145, g, 8); fold.rotation.z = Math.PI / 2;
      box(tw, 0.03, 0.04, mat("#d8cfb8"), x, y - 0.38, 0.195, g);           // stripe near the hem
    });
  };
  // old iron/copper pipework: two runs with risers, flanges, a valve wheel and a slow drip
  BUILD.pipes = (g, w, d, o) => {
    // exposed copper plumbing: two parallel runs along the wall with crisp right-angle bends,
    // risers climbing into the ceiling at one end, a drop to the floor at the other, black clamps,
    // brass valves with black T-handles and a curved spout with a slow green drip
    const base = o.side ? 0 : -1.45, len = o.len || 4, top = o.side ? 2.6 : 3.75, H1 = o.side ? 1.7 : 2.75, H2 = H1 - 0.16;
    const copper = mat("#b06a3a", { metalness: 0.75, roughness: 0.35 }), brass = mat("#c8a050", { metalness: 0.8, roughness: 0.3 }), black = mat("#141014", { roughness: 0.5 }), white = mat("#e8e4dc");
    const x0 = -len / 2 + 0.1, x1 = len / 2 - 0.1, Z = 0.1, R = 0.026, up = new THREE.Vector3(0, 1, 0);
    const seg = (ax, ay, bx, by, r = R, m = copper) => {
      const A = new THREE.Vector3(ax, base + ay, Z), B = new THREE.Vector3(bx, base + by, Z), dir = B.clone().sub(A), L = dir.length();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 10), m); c.position.copy(A).add(B).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(up, dir.normalize()); c.castShadow = true; g.add(c);
    };
    const elbow = (x, y) => { const e = new THREE.Mesh(new THREE.SphereGeometry(R * 1.3, 10, 8), copper); e.position.set(x, base + y, Z); g.add(e); };
    const path = (pts) => { for (let i = 1; i < pts.length; i++) seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); pts.slice(1, -1).forEach(([x, y]) => elbow(x, y)); };
    const clamp = (x, y, vertical) => {
      box(vertical ? 0.1 : 0.05, vertical ? 0.05 : 0.1, 0.06, black, x, base + y, Z - 0.02, g);
      for (const k of [-1, 1]) { const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), white); bolt.position.set(x + (vertical ? k * 0.035 : 0), base + y + (vertical ? 0 : k * 0.035), Z + 0.02); g.add(bolt); }
    };
    const valve = (x, y) => {                                   // brass body + black T handle, on a vertical pipe
      cyl(0.04, 0.04, 0.14, brass, x, base + y, Z, g, 10);
      cyl(0.012, 0.012, 0.08, brass, x, base + y, Z + 0.05, g, 6).rotation.x = Math.PI / 2;
      box(0.11, 0.022, 0.022, black, x, base + y, Z + 0.09, g);
    };
    // risers at the left climbing into the ceiling, feeding both runs
    path([[x0, top], [x0, H2], [x1 - 0.5, H2]]);
    path([[x0 + 0.14, top], [x0 + 0.14, H1], [x1, H1], [x1, 0]]);         // upper run, dropping to the floor on the right
    valve(x0, H2 + 0.45); valve(x0 + 0.14, H1 + 0.3);
    // a tee off the lower run: two valves and a curved spout
    const tx = x1 - 0.5;
    path([[tx, H2], [tx, H2 - 0.35]]); valve(tx, H2 - 0.2);
    path([[tx - 0.35, H2], [tx - 0.35, H2 - 0.3]]); valve(tx - 0.35, H2 - 0.18);
    const spoutCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(tx, base + H2 - 0.35, Z), new THREE.Vector3(tx - 0.02, base + H2 - 0.5, Z + 0.06), new THREE.Vector3(tx - 0.1, base + H2 - 0.58, Z + 0.12)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 10, R * 0.9, 8), copper));
    // clamps along the runs
    for (let x = x0 + 0.5; x < x1 - 0.1; x += 0.9) { clamp(x, H1, false); if (x < tx - 0.45) clamp(x + 0.2, H2, false); }
    clamp(x0, H2 + 0.8, true); clamp(x1, H1 * 0.5, true); clamp(x1, 0.25, true);
    box(0.08, 0.02, 0.08, copper, x1, base + 0.01, Z, g);                                    // floor flange
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 3), mat("#9fd6b0", { transparent: true, opacity: 0.8 })); drip.position.set(tx - 0.1, base + H2 - 0.6, Z + 0.12); g.add(drip);
    g.userData.pipeDrip = { drip, y0: base + H2 - 0.6, floor: base + (o.side ? 0 : 1.0) };
  };


  // carved chest of drawers: marble top, three drawers with ring pulls, cabriole legs
  BUILD.drawers = (g, w, d) => {
    const W2 = w, D = d, H = 1.05;
    box(W2, H - 0.15, D, M.darkWood, 0, 0.15 + (H - 0.15) / 2, -0.02, g);
    box(W2 + 0.06, 0.05, D + 0.06, marbleM, 0, H + 0.025, -0.02, g);
    for (let i = 0; i < 3; i++) {
      const y = 0.32 + i * 0.27;
      carvedPanel(W2 * 0.88, 0.22, M.darkWood, M.carve, 0, y, D / 2, g);
      for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 10), M.brass); ring.position.set(sx * W2 * 0.25, y - 0.02, D / 2 + 0.04); g.add(ring); }
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cabriole(g, sx * (W2 / 2 - 0.06), sz * (D / 2 - 0.06), 0.16, sx, sz);
    waxCandle(g, W2 * 0.3, H + 0.05, 0, 0.12, 0.022);
    const box2 = box(0.22, 0.1, 0.16, M.burgundy, -W2 * 0.2, H + 0.1, 0, g); box2.rotation.y = 0.3;   // a small keepsake box
  };
  // a side table with a small three-armed tabletop candelabra
  BUILD.candle_table = (g) => {
    sideTable(g);
    const iron = M.iron, top = 0.81;
    cyl(0.07, 0.09, 0.03, iron, 0, top + 0.015, 0, g, 8);
    cyl(0.015, 0.02, 0.22, iron, 0, top + 0.13, 0, g, 6);
    for (const ax of [-0.13, 0, 0.13]) {
      const h = top + 0.26 - Math.abs(ax) * 0.4;
      if (ax) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, top + 0.18, 0), new THREE.Vector3(ax, top + 0.15, 0), new THREE.Vector3(ax, h - 0.02, 0)), 8, 0.01, 4), iron));
      cyl(0.03, 0.02, 0.025, iron, ax, h - 0.01, 0, g, 8);
      waxCandle(g, ax, h, 0, 0.08 + rnd() * 0.06, 0.018);
    }
  };
  // tall standing iron candelabra with five green-flamed candles
  BUILD.candelabra = (g) => {
    const iron = M.iron;
    for (let i = 0; i < 3; i++) {                        // tripod feet
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.02, 0.03, 0.4, iron, Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14, g, 5);
      leg.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    }
    cyl(0.06, 0.08, 0.08, iron, 0, 0.26, 0, g, 8);
    cyl(0.025, 0.03, 1.5, iron, 0, 1.0, 0, g, 6);         // stem
    for (const yk of [0.55, 1.1]) { const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), iron); knot.position.y = yk; g.add(knot); }
    const top = 1.75;
    const arms = [-0.42, -0.21, 0, 0.21, 0.42];
    for (const ax of arms) {
      const h = top - Math.abs(ax) * 0.35;
      if (ax !== 0) {                                     // curved arm from the stem
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, top - 0.35, 0), new THREE.Vector3(ax, top - 0.45, 0), new THREE.Vector3(ax, h - 0.08, 0));
        const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.016, 5), iron); g.add(arm);
      }
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.03, 0.05, 8), iron); cup.position.set(ax, h - 0.05, 0); g.add(cup); // drip cup
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 4, 10), iron); rim.rotation.x = Math.PI / 2; rim.position.set(ax, h - 0.025, 0); g.add(rim);
      for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 4), iron); const a = k * Math.PI / 2 + 0.4; sp.position.set(ax + Math.cos(a) * 0.055, h - 0.01, Math.sin(a) * 0.055); g.add(sp); } // little spikes
      waxCandle(g, ax, h - 0.025, 0, 0.12 + rnd() * 0.16, 0.026);
    }
  };
  // glowing green ooze seeping from the wall and pooling at its base
  const oozeMat = new THREE.MeshStandardMaterial({ color: "#3fae6a", emissive: "#2f8a52", emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
  BUILD.ooze = (g, w, d, o) => {
    const side = o && o.wall === "left";
    for (let i = 0; i < 5; i++) {                      // puddle of overlapping blobs
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.18 + rnd() * 0.14, 8, 5), oozeMat);
      b.scale.y = 0.18; b.position.set((rnd() - 0.5) * w * 0.8, 0.02, (rnd() - 0.2) * d * 0.4); g.add(b);
    }
    for (let i = 0; i < 4; i++) {                      // drips running down the wall
      const h = 0.4 + rnd() * 0.9;
      const drip = box(0.05 + rnd() * 0.05, h, 0.03, oozeMat, (rnd() - 0.5) * w * 0.7, h / 2, -d / 2 + 0.02, g);
      drip.castShadow = false;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), oozeMat); bead.position.set(drip.position.x, 0.06, -d / 2 + 0.05); g.add(bead);
    }
    if (side) g.rotation.y = Math.PI / 2;
  };


  let grayNow = 0, grayCss = "";
  const objMeshes = []; // { o, group }
  // floor candles are drawn as standing candelabras pushed flush against the nearest back/side wall
  function nearestWall(tx, ty) {
    let best = null;
    for (const [dx, dy, rot] of [[0, -1, 0], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) {
      for (let k = 0; k <= 8; k++) if (MAP.isWall(tx + dx * (k + 1), ty + dy * (k + 1))) { if (!best || k < best.k) best = { dx, dy, rot, k }; break; }
    }
    return best;
  }
  for (const o of OBJECTS) {
    useX = !!o.extra;
    const key = o.sprite === "candle" && o.mount !== "wall" && !/^bed_candle/.test(o.id) ? "candelabra" : o.sprite;
    const w = o.size ? o.size[0] : o.w / TILE, d = o.size ? o.size[1] : o.h / TILE;
    const g = new THREE.Group();
    const b = BUILD[o.id === "riddle_t" ? "riddle_scrawl" : key];
    if (b) b(g, w, d, o);
    else box(w * 0.8, 0.6, d * 0.8, mat("#4a3a5a"), 0, 0.3, 0, g);
    if (DETAILS[o.id]) DETAILS[o.id](g, w, d, o);
    if (o.side === "east") {
      g.position.set(o.x - 0.02, 0, o.y + (o.size ? o.size[0] / 2 : 0.5)); g.rotation.y = -Math.PI / 2;
      if (o.size) g.translateZ(o.size[1] / 2);
    } else if (o.side === "west") {
      g.position.set(o.x + 1.02, 0, o.y + (o.h / TILE) / 2); g.rotation.y = Math.PI / 2;
    } else if (o.mount === "wall") {
      const isDoor = key === "front_door";
      const hung = key === "mirror" ? 1.75 : o.icon ? 1.75 : /^(ornate_mirror|painting(_\d|_round|_small)?|plaque|frame_oval|frame_verdigris|frame_gilt|gothic_mirror)$/.test(key) ? 2.2 : 1.45; // door signs hang at eye level // frames hang high, above furniture
      g.position.set((o.px + o.w / 2) / TILE, (isDoor ? 1.15 : key === "cobweb" ? 1.6 : key === "banner" ? 2.55 : hung) + (o.lift || 0), o.y + 1 + 0.06 + (o.out || 0));
      if (o.gs) g.scale.multiplyScalar(o.gs);                    // generic size for any wall piece
    } else {
      g.position.set((o.px + o.w / 2) / TILE, 0, (o.py + o.h / 2) / TILE);
      if (o.size) g.position.set(o.x + w / 2 + (o.nudge || 0), 0, o.y + d / 2);
      if (o.wall === "left") g.position.x = o.x + 0.5;
      if (key === "candelabra" || o.sprite === "skull_table" || o.sprite === "jar_table" || o.sprite === "candle_table") {
        const nw = nearestWall(o.x, o.y);
        if (nw) {
          if (nw.dy) g.position.z = o.y - nw.k + 0.35;
          else { g.position.x = nw.dx < 0 ? o.x - nw.k + 0.35 : o.x + nw.k + 1 - 0.35; g.rotation.y = nw.rot; }
        }
      }
    }
    if (o.turn) g.rotation.y += o.turn;
    // keep collision and interaction in sync with where the object is actually drawn
    if (o.mount !== "wall" && (o.box || o.zone) && (key === "candelabra" || o.sprite === "skull_table" || o.sprite === "jar_table" || o.sprite === "candle_table" || o.turn)) {
      const sideways = Math.abs(Math.sin(g.rotation.y)) > 0.7;
      const fw = (sideways ? d : w) * TILE * 0.8, fd = (sideways ? w : d) * TILE * 0.8;
      const cx = g.position.x * TILE, cz = g.position.z * TILE;
      if (o.box) o.box = { x: cx - fw / 2, y: cz - fd / 2, w: fw, h: fd };
      o.zone = { x: cx - fw / 2, y: cz - fd / 2, w: fw, h: fd };
      o.px = cx - (o.w / 2); o.py = cz - (o.h / 2);
    }
    // which room an object belongs to (so it hides with that room). Side-wall pieces sit ON a wall tile,
    // so look one tile into the room they face; otherwise they'd belong to no room and show from everywhere.
    let room = o.side === "east" ? MAP.roomAt(o.x - 1, Math.floor(o.y)) : o.side === "west" ? MAP.roomAt(o.x + 1, Math.floor(o.y))
      : MAP.roomAt(o.x + Math.floor(o.w / TILE / 2), o.mount === "wall" ? o.y + 1 : o.y);
    if (room < 0) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0]]) { const r2 = MAP.roomAt(Math.floor(o.x) + dx, Math.floor(o.y) + dy); if (r2 >= 0) { room = r2; break; } }
    (room >= 0 ? roomGroups[room] : scene).add(g);
    objMeshes.push({ o, group: g });
    if (o.light) {
      const lx = g.position.x + (key === "candelabra" ? Math.sin(g.rotation.y) * 0.3 : 0), lz = g.position.z + (o.mount === "wall" ? 0.4 : key === "candelabra" ? 0.3 : 0);
      lightSources.push({ room: MAP.roomAt(o.x, o.mount === "wall" ? o.y + 1 : o.y), x: lx + (o.lightDx || 0), y: o.lightY ? o.lightY : o.mount === "wall" ? 1.6 : key === "candelabra" ? 1.9 : o.sprite === "jar_table" ? 1.9 : 0.6, z: lz, color: TINT[o.light.color] || TINT.warm, power: (o.light.r || 30) / 30, phase: rnd() * 10 });
    }
  }
  useX = false;

  // ------------------------------------------------------------------ doors
  // Every doorway has a real door. Each room shows the door on its own side;
  // doors on the camera side are drawn faint so they never hide the player.
  // Walking into a doorway plays the door cutscene and puts you through.
  const DOORS = (G._doors || []).map((d) => {
    const cx = d.x + d.w / 2;
    const A = MAP.roomAt(Math.floor(cx), d.y - 1), B = MAP.roomAt(Math.floor(cx), d.y + d.h);
    return { ...d, cx, A, B };
  });
  // door wood: grain only (no blotches), plus a texture of smeared dark handprints
  const doorWoodTex = canvasTex(256, 256, (c, W2, H2) => {
    c.fillStyle = "#3a2418"; c.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 80; i++) { c.strokeStyle = `rgba(0,0,0,${0.1 + rnd() * 0.2})`; c.lineWidth = 0.8 + rnd() * 1.5; const x = rnd() * W2; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + (rnd() - 0.5) * 8, H2 * 0.3, x - (rnd() - 0.5) * 8, H2 * 0.7, x + (rnd() - 0.5) * 6, H2); c.stroke(); }
  });
  const handTex = canvasTex(256, 256, (c, W2, H2) => {
    function hand(x, y, s2, rot, a) {
      c.save(); c.translate(x, y); c.rotate(rot); c.scale(s2, s2); c.fillStyle = `rgba(12,4,6,${a})`;
      c.beginPath(); c.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2); c.fill();                              // palm
      for (const [fx, len, ang] of [[-11, 18, -0.25], [-4, 24, -0.08], [3, 25, 0.04], [10, 21, 0.16]]) { c.save(); c.translate(fx, -12); c.rotate(ang); c.beginPath(); c.ellipse(0, -len / 2, 3.6, len / 2, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
      c.save(); c.translate(15, 2); c.rotate(0.9); c.beginPath(); c.ellipse(0, -8, 4, 10, 0, 0, Math.PI * 2); c.fill(); c.restore(); // thumb
      c.fillRect(-6, 14, 12, 18 * a); // a drip running down
      c.restore();
    }
    hand(70, 90, 1.1, -0.3, 0.75); hand(180, 120, 1.0, 0.25, 0.6); hand(110, 190, 0.9, 0.1, 0.5); hand(200, 60, 0.8, -0.5, 0.4);
  });
  const doorWood = new THREE.MeshStandardMaterial({ map: doorWoodTex, roughness: 0.8 });
  // a faded, ashen version of the door wood for rooms that are finished
  const doorWoodGrey = canvasTex(256, 256, (c, W2, H2) => { c.filter = "grayscale(1) brightness(1.9) contrast(0.7)"; c.drawImage(doorWoodTex.image, 0, 0, W2, H2); });
  function makeDoor(width, ghost, plain) {      // plain: no handprints (the storage room door)
    const g = new THREE.Group();
    const wood = ghost ? new THREE.MeshStandardMaterial({ map: doorWoodTex, transparent: true, opacity: 0.28, depthWrite: false }) : doorWood.clone();
    g.userData.wood = wood;
    const iron = ghost ? new THREE.MeshStandardMaterial({ color: "#1a1620", transparent: true, opacity: 0.3, depthWrite: false }) : M.iron;
    const stoneM = ghost ? new THREE.MeshStandardMaterial({ color: "#4a4258", transparent: true, opacity: 0.25, depthWrite: false }) : M.stone;
    const H = 2.5, half = width / 2;
    for (const sx of [-1, 1]) box(0.34, H + 0.3, 0.6, stoneM, sx * (half + 0.17), (H + 0.3) / 2, 0.09, g); // jambs (stand proud of the wall trim, no z-fighting)
    for (const sx of [-1, 1]) {   // pointed stone arch: two curved halves meeting at a tip
      const pts = [new THREE.Vector3(sx * (half + 0.15), H - 0.15, 0.09)];
      for (const [ax, ay] of lancet(half + 0.15)) pts.push(new THREE.Vector3(sx * ax, H - 0.15 + ay, 0.09));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.17, 6), stoneM));
    }
    // two-centred (lancet) arch: each side is an arc centred c past the middle
    function lancet(hw, n = 14) {
      const c = hw * 0.28, R = hw + c, out = [];
      const tEnd = Math.acos(c / R);
      for (let k = 1; k <= n; k++) { const th = (k / n) * tEnd; out.push([R * Math.cos(th) - c, R * Math.sin(th)]); }
      return out;
    }
    // two leaves that fill the whole arch (no gap at the top)
    const springY = H - 0.15, rise = half * 0.75;
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      const xo = sx * 0.02, xe = sx * half;
      sh.moveTo(xo, 0); sh.lineTo(xe, 0); sh.lineTo(xe, springY);
      for (const [ax, ay] of lancet(half)) sh.lineTo(sx * ax, springY + ay); // gothic lancet: round shoulders, soft point
      sh.lineTo(xo, springY + rise); sh.closePath();
      const leafMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }), wood);
      leafMesh.position.z = -0.05; leafMesh.castShadow = true; g.add(leafMesh);
      for (const by of [0.5, 1.4, 2.25]) {   // three iron straps, ending in a spear tip at the hinge side
        box(half - 0.08, 0.07, 0.12, iron, sx * half / 2, by, 0.06, g);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), iron); tip.position.set(sx * (half - 0.02), by, 0.06); tip.rotation.z = -sx * Math.PI / 2; g.add(tip);
      }  // iron straps
      for (let i = 0; i < 6; i++) { const stud = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 3), iron); stud.position.set(sx * (0.12 + (i % 3) * (half - 0.2) / 2), 0.5 + Math.floor(i / 3) * 1.1, 0.07); g.add(stud); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 4, 10), iron); ring.position.set(sx * 0.14, 1.1, 0.08); g.add(ring);
    }
    for (const sx of [-1, 1]) {
      const pts = [new THREE.Vector3(sx * (half - 0.12), H - 0.15, 0.07)];
      for (const [ax, ay] of lancet(half - 0.12)) pts.push(new THREE.Vector3(sx * ax, H - 0.15 + ay, 0.07));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.03, 5), iron));
    }
    if (!ghost && !plain) {  // handprints smeared across the leaves
      const hp = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.1, H - 0.4), new THREE.MeshBasicMaterial({ map: handTex, transparent: true, depthWrite: false }));
      hp.position.set(0, (H - 0.2) / 2, 0.062); g.add(hp); g.userData.hands = hp;
    }
    return g;
  }
  const doorMeshes = [], ghostDoors = [];
  // A name plate with the room's path, on the INSIDE of the room it names: hanging over the door for rooms
  // below a corridor, on a little post beside the doorway for rooms above one.
  function pathSign(text) {
    const tex = canvasTex(320, 80, (c, W2, H2) => {
      c.fillStyle = "#1c120c"; c.fillRect(0, 0, W2, H2); c.strokeStyle = "#b8954a"; c.lineWidth = 4; c.strokeRect(5, 5, W2 - 10, H2 - 10);
      c.fillStyle = "#ffcf70"; c.font = "bold 34px monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, W2 / 2, H2 / 2 + 2);
      for (const x of [16, W2 - 16]) { c.fillStyle = "#b8954a"; c.beginPath(); c.arc(x, H2 / 2, 4, 0, 7); c.fill(); }
    });
    const gS = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.05), [M.darkWood, M.darkWood, M.darkWood, M.darkWood, new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffcf70", emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.7 }), M.darkWood]);
    gS.add(plate); gS.userData.plate = plate;
    return gS;
  }
  const corridor = (r) => r < 0 || /^(hallway|landing)$/.test(MAP.rooms[r].id);
  for (const d of DOORS) {
    if (d.A >= 0) { const dr = makeDoor(d.w, true); dr.position.set(d.cx, 0, d.y + 0.2); roomGroups[d.A].add(dr); dr.visible = false; ghostDoors.push({ dr, d }); if (d.B >= 0) doorMeshes.push({ dr, leadsTo: MAP.rooms[d.B].id }); }        // A's south wall: faint
    if (d.B >= 0) { const dr = makeDoor(d.w, false, MAP.rooms[d.B].id === "storage_room"); dr.position.set(d.cx, 0, d.y + d.h - 0.2); roomGroups[d.B].add(dr); if (d.A >= 0) doorMeshes.push({ dr, leadsTo: MAP.rooms[d.A].id }); } // B's north wall: solid
  }
  for (const d of DOORS) {
    if (d.B >= 0 && !corridor(d.B)) {                              // room below: plate hangs over the inside of its door
      const sg = pathSign(MAP.rooms[d.B].path); sg.position.set(d.cx, 3.42, d.y + d.h + 0.42);
      for (const sx of [-1, 1]) box(0.015, 0.3, 0.015, M.iron, sx * 0.6, 0.3, 0, sg);
      roomGroups[d.B].add(sg);
    }
    if (d.A >= 0 && !corridor(d.A)) {                              // room above: a short signpost just inside the doorway
      const sg = pathSign(MAP.rooms[d.A].path); sg.userData.plate.position.y = 1.25; sg.userData.plate.scale.setScalar(0.8);
      box(0.07, 1.25, 0.07, M.darkWood, 0, 0.62, -0.02, sg); box(0.3, 0.05, 0.3, M.darkWood, 0, 0.03, -0.02, sg);
      sg.position.set(d.x - 0.75, 0, d.y - 0.3); roomGroups[d.A].add(sg);
    }
  }
  function doorAt(tx, ty) { return DOORS.find((d) => tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h); }

  // --------------------------------------------------------------- stairs
  const STAIRS = (G._stairs || []);
  function stairAt(tx, ty) { return STAIRS.find((st) => tx >= st.zone.x && tx < st.zone.x + st.zone.w && ty >= st.zone.y && ty < st.zone.y + st.zone.h); }
  // a straight flight of stairs with a red carpet runner, fading into darkness at the top
  // (ground floor), or the top of the flight leading down into darkness (landing)
  const carpet = new THREE.MeshStandardMaterial({ map: FLOOR.runner, roughness: 1 });
  for (const st of STAIRS) {
    const g = new THREE.Group();
    const z = st.zone, up = st.label === "up";
    const cz = z.y + z.h / 2;
    const room = MAP.roomAt(z.x, Math.floor(cz));
    const N = 9, run = 0.34, rise = 0.24, width = 3.2;
    for (let i = 0; i < N; i++) {
      const fadeK = 1 - i / N;                                             // darker the further up/down
      const shade = (base) => new THREE.Color(base).multiplyScalar(0.25 + 0.75 * fadeK);
      const stoneM = new THREE.MeshStandardMaterial({ color: shade("#4a4258"), roughness: 0.9 });
      const carpM = new THREE.MeshStandardMaterial({ color: shade("#7a1a2a"), roughness: 1 });
      if (up) {
        const x = z.x + i * run, y = rise * (i + 0.5);
        box(run, rise * (i + 1), width + 0.4, stoneM, x + run / 2, y / 2 + rise * i / 2 - rise * i / 2 + (rise * (i + 1)) / 2 - y / 2, cz, g); // stepped mass
        box(run + 0.01, 0.025, width * 0.7, carpM, x + run / 2, rise * (i + 1) + 0.012, cz, g);       // carpet on the tread
        box(0.02, rise, width * 0.7, carpM, x + 0.01, rise * (i + 0.5), cz, g);                       // carpet on the riser
        for (const sz of [-1, 1]) cyl(0.025, 0.025, 0.9, M.darkWood, x + run / 2, rise * (i + 1) + 0.45, cz + sz * (width / 2 + 0.1), g, 6); // balusters
      } else {
        // looking down the flight from the top: steps sink below the landing floor
        const x = z.x + z.w - i * run;
        box(run, 0.04, width * 0.7, carpM, x - run / 2, 0.02 - i * 0.004, cz, g);
      }
    }
    if (up) {
      for (const sz of [-1, 1]) {   // handrails
        const rail = box(N * run * 1.25, 0.06, 0.08, M.darkWood, z.x + N * run / 2, rise * N / 2 + 0.95, cz + sz * (width / 2 + 0.1), g);
        rail.rotation.z = Math.atan2(rise, run);
        finial(M.darkWood, z.x + run / 2, rise + 0.9, cz + sz * (width / 2 + 0.1), g, 1.1);
      }
      // darkness swallowing the top of the stairs
      const darkTex = canvasTex(64, 256, (cc, W2, H2) => { const gr = cc.createLinearGradient(0, 0, W2, 0); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.45, "rgba(0,0,0,0.85)"); gr.addColorStop(1, "rgba(0,0,0,1)"); cc.fillStyle = gr; cc.fillRect(0, 0, W2, H2); });
      darkTex.repeat.set(1, 1);
      for (const [dy, h] of [[0, 6], [3, 6]]) {                 // horizontal + vertical darkness swallowing the top of the flight
        const dark = new THREE.Mesh(new THREE.PlaneGeometry(4.5, width + 3), new THREE.MeshBasicMaterial({ map: darkTex, transparent: true, depthWrite: false }));
        dark.rotation.x = -Math.PI / 2; dark.position.set(z.x + N * run * 0.75 + 1.2, rise * N + 0.05 + dy * 0.4, cz); g.add(dark);
      }
      const wallDark = new THREE.Mesh(new THREE.PlaneGeometry(width + 3, 6), new THREE.MeshBasicMaterial({ color: "#000" }));
      wallDark.rotation.y = -Math.PI / 2; wallDark.position.set(z.x + N * run + 1.6, 2.5, cz); g.add(wallDark);
    } else {
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(N * run, width * 0.9), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.55, depthWrite: false }));
      hole.rotation.x = -Math.PI / 2; hole.position.set(z.x + z.w - N * run / 2, 0.05, cz); g.add(hole);
    }
    (room >= 0 ? roomGroups[room] : scene).add(g);
  }


  // cobwebs sit exactly in their corner, just under the crown moulding
  for (const { o, group } of objMeshes) if (group.userData.cobwebCorner && o.cx !== undefined) { group.position.x = o.cx; group.position.y = 3.52; }
  // fireplaces sit flush against the wall behind them
  for (const { o, group } of objMeshes) if (group.userData.flushToWall) { if (o.side === "west") group.position.x = o.x + 1 + 0.37; else group.position.z = o.y + 0.35 + 0.02; }
  // Collision and interaction follow what is actually drawn: every solid floor object gets its
  // box from its real 3D footprint (the 2D sprite boxes drifted once furniture got size/nudge/turn).
  for (const { o, group } of objMeshes) {
    if (o.side && o.card && !o.solid) {                       // side-wall fixtures: reachable from the floor in front of them
      group.updateWorldMatrix(true, true);
      const sb = new THREE.Box3().setFromObject(group);
      if (isFinite(sb.min.x)) o.zone = { x: (sb.min.x - 0.5) * TILE, y: (sb.min.z - 0.2) * TILE, w: (sb.max.x - sb.min.x + 1) * TILE, h: (sb.max.z - sb.min.z + 0.4) * TILE };
      continue;
    }
    if (!o.solid || o.mount === "wall" || o.sprite === "cellar_door") continue;
    group.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(group);
    if (!isFinite(b.min.x)) continue;
    const loose = { nest: 0.45, eye_plant: 0.55, snake: 0.25, bathtub: 0.12 }[o.sprite] ?? 0.06;   // twigs, tendrils and tails don't block
    const x0 = (b.min.x + loose) * TILE, x1 = (b.max.x - loose) * TILE, z0 = (b.min.z + loose) * TILE, z1 = (b.max.z - loose) * TILE;
    if (x1 - x0 < 4 || z1 - z0 < 4) continue;
    o.box = { x: x0, y: z0, w: x1 - x0, h: z1 - z0 };
    o.zone = { x: x0 - 5, y: z0 - 5, w: x1 - x0 + 10, h: z1 - z0 + 10 + (o.reach || 0) };   // a little slack so anything solid can be examined from any side
  }
  // the family photo stands on the fireplace mantel
  {
    const fire = objMeshes.find(({ o }) => o.id === "fireplace"), photo = objMeshes.find(({ o }) => o.id === "portrait");
    if (fire && photo) { photo.group.position.set(fire.group.position.x, 1.64, fire.group.position.z + 0.22); photo.group.rotation.set(0, 0, 0); }
  }
  // the glowing book: on shelf_2 until you take it
  const bookMat = new THREE.MeshStandardMaterial({ color: "#3a1f5a", emissive: "#9a5ae0", emissiveIntensity: 0.7, roughness: 0.6 });
  const shelfBook = new THREE.Group();
  const shelfEntry = objMeshes.find(({ o }) => o.id === "shelf_2");
  const slot = (shelfEntry && shelfEntry.group.userData.bookSlot) || { x: 0.3, y: 1.4, z: 0, depth: 0.34 };
  box(0.11, 0.44, slot.depth, bookMat, 0, 0, 0, shelfBook);
  box(0.115, 0.03, slot.depth + 0.005, M.gold, 0, 0.14, 0, shelfBook); box(0.115, 0.03, slot.depth + 0.005, M.gold, 0, -0.14, 0, shelfBook);
  const shelfGlow = new THREE.PointLight("#b070ff", 0.9, 1.8, 2); shelfGlow.position.z = 0.3; shelfBook.add(shelfGlow);
  if (shelfEntry) { shelfBook.position.set(slot.x, slot.y, slot.z); shelfEntry.group.add(shelfBook); }
  // the flight: the book slides out of the shelf, floats across the room and lands open on the reading stand
  let bookFlight = null;
  function flyBook() {
    return new Promise((res) => {
      const desk = objMeshes.find(({ group }) => group.userData.readingBook);
      const to = new THREE.Vector3(); if (desk) desk.group.userData.readingBook.open.getWorldPosition(to);
      scene.attach(shelfBook);
      bookFlight = { t0: performance.now() / 1000, from: shelfBook.position.clone(), to: to.add(new THREE.Vector3(0, 0.06, 0)), res };
    });
  }
  function updateFlight() {
    if (!bookFlight) return;
    const f = bookFlight, e = performance.now() / 1000 - f.t0;
    const ease = (k) => k * k * (3 - 2 * k);
    if (e < 0.9) {                                                     // tug free and slide out
      const k = ease(e / 0.9);
      shelfBook.position.copy(f.from).add(new THREE.Vector3(Math.sin(e * 40) * 0.006 * (1 - k), 0, k * 0.45));
      f.out = shelfBook.position.clone();
    } else if (e < 3.4) {                                              // float to the desk on a lazy arc
      const k = ease((e - 0.9) / 2.5);
      shelfBook.position.lerpVectors(f.out, f.to, k); shelfBook.position.y += Math.sin(k * Math.PI) * 0.9 + Math.sin(e * 5) * 0.03 * (1 - k);
      shelfBook.rotation.set(-Math.PI / 2 * k, k * Math.PI * 2, 0);
    } else { shelfBook.visible = false; bookFlight = null; f.res(); }
  }
  const carriedBook = new THREE.Group();
  box(0.3, 0.07, 0.22, bookMat, 0, 0, 0, carriedBook); box(0.305, 0.075, 0.03, M.gold, 0, 0, 0.08, carriedBook);
  const carryGlow = new THREE.PointLight("#b070ff", 1.2, 2, 2); carriedBook.add(carryGlow);
  carriedBook.visible = false; scene.add(carriedBook);

  // the Watcher's trace: glowing pink footprints with step labels, revealed when traceShown
  const traceGroup = new THREE.Group();
  const LAND_I = MAP.rooms.findIndex((r) => r.id === "landing");
  if (LAND_I >= 0) roomGroups[LAND_I].add(traceGroup);
  const traceSteps = [];
  {
    const path = [[38.8, 19.8], [40.6, 19.2], [42.4, 18.6], [44.2, 18.0], [46.0, 17.5], [47.6, 17.9], [49.2, 18.3], [50.6, 18.0], [51.3, 17.4], [51.7, 16.7], [53.6, 17.0], [55.3, 16.3]];   // up from the stairs, across the landing, to the attic door
    const labels = { 1: "read_file()", 4: "execute()", 7: "delete(\"/friends/\")", 10: "enter(\"/attic/\")" };
    const printM = () => new THREE.MeshBasicMaterial({ color: "#ff6fb0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    path.forEach(([x, z], i) => {
      const [nx, nz] = path[Math.min(i + 1, path.length - 1)];
      const ang = Math.atan2(nx - x, nz - z);
      const foot = new THREE.Group(); foot.position.set(x + (i % 2 ? 0.12 : -0.12), 0.03, z); foot.rotation.y = ang;
      const m = printM();
      const sole = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), m); sole.scale.set(0.8, 1.4, 1); sole.rotation.x = -Math.PI / 2; sole.position.z = 0.05; foot.add(sole);
      const heel = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), m); heel.rotation.x = -Math.PI / 2; heel.position.z = -0.12; foot.add(heel);
      traceGroup.add(foot);
      let label = null;
      if (labels[i]) {
        // size the label to its text so nothing is clipped
        const meas = document.createElement("canvas").getContext("2d"); meas.font = "26px monospace";
        const tw = Math.ceil(meas.measureText(labels[i]).width) + 40;
        const tex = canvasTex(tw, 64, (c, W2, H2) => { c.fillStyle = "rgba(20,6,16,0.8)"; c.fillRect(0, 8, W2, 48); c.strokeStyle = "rgba(255,120,190,0.9)"; c.strokeRect(1, 9, W2 - 2, 46); c.fillStyle = "#ffb3d6"; c.font = "26px monospace"; c.textAlign = "center"; c.fillText(labels[i], W2 / 2, 42); });
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
        label.scale.set(0.4 * tw / 64, 0.4, 1); label.position.set(x, 0.9, z); traceGroup.add(label);
      }
      traceSteps.push({ m, label });
    });
  }
  let traceT = 0;

  // ------------------------------------------------------------ characters
  function makePlayer() {
    // a figure in a long, dark purple robe: hood down, wide sleeves, a sash with a brass clasp, and a skirt
    // of overlapping panels that swing as you walk
    const g = new THREE.Group();
    const robe = mat("#2e1a4e", { roughness: 0.9 }), robeDk = mat("#22123c", { roughness: 0.95 }), lining = mat("#5a2a72", { roughness: 0.85 });
    const trim = mat("#b8954a", { metalness: 0.6, roughness: 0.4 }), skin = mat("#e8c6a8"), hair = mat("#2a1a14"), boot = mat("#120c12");
    const body = new THREE.Group(); g.add(body);
    cyl(0.19, 0.23, 0.34, robe, 0, 0.74, 0, body, 12);                                              // chest
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), robe); sh.scale.set(1, 0.42, 0.72); sh.position.y = 0.86; sh.castShadow = true; body.add(sh);   // sloped shoulders
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.035, 6, 16), robeDk); sash.rotation.x = Math.PI / 2; sash.position.y = 0.6; body.add(sash);
    box(0.07, 0.07, 0.03, trim, 0, 0.6, 0.24, body);                                                // clasp
    const tie = box(0.035, 0.2, 0.012, robeDk, 0.05, 0.49, 0.25, body); tie.rotation.z = 0.12;      // the sash's loose end
    box(0.02, 0.3, 0.012, lining, 0, 0.76, 0.215, body);                                            // a strip of lining down the front
    // skirt: panels hinged at the waist, each swinging on its own
    const panels = [];
    const N = 12, pShape = new THREE.Shape(); pShape.moveTo(-0.075, 0); pShape.lineTo(0.075, 0); pShape.lineTo(0.125, -0.5); pShape.quadraticCurveTo(0, -0.56, -0.125, -0.5); pShape.closePath();
    const pGeo = new THREE.ShapeGeometry(pShape, 4), hemGeo = new THREE.BoxGeometry(0.24, 0.018, 0.006);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, hold = new THREE.Group(); hold.rotation.y = a; hold.position.y = 0.62; body.add(hold);
      const piv = new THREE.Group(); piv.position.z = 0.2; hold.add(piv);
      const m = new THREE.Mesh(pGeo, new THREE.MeshStandardMaterial({ color: i % 2 ? "#2e1a4e" : "#27154a", roughness: 0.92, side: THREE.DoubleSide })); m.castShadow = true; piv.add(m);
      const hem = new THREE.Mesh(hemGeo, trim); hem.position.set(0, -0.49, 0.004); piv.add(hem);
      panels.push({ piv, a, ph: i * 0.9 });
    }
    // hood, pushed back off the head, and a small glowing clasp at the throat
    const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 6, 14), robeDk); cowl.rotation.x = Math.PI / 2 - 0.25; cowl.position.set(0, 0.92, -0.03); body.add(cowl);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), robeDk); hood.scale.set(0.95, 1.0, 0.8); hood.rotation.x = -1.9; hood.position.set(0, 0.98, -0.17); body.add(hood);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), new THREE.MeshStandardMaterial({ color: "#c79bff", emissive: "#9b4dff", emissiveIntensity: 1.6 })); gem.position.set(0, 0.9, 0.17); body.add(gem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin); head.position.y = 1.08; head.castShadow = true; body.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hairM.position.y = 1.1; body.add(hairM);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), mat("#1a1218")); e.position.set(sx * 0.07, 1.1, 0.18); body.add(e); }
    const legs = [-1, 1].map((sx) => { const l = box(0.12, 0.38, 0.14, boot, sx * 0.1, 0.19, 0, g); return l; });
    // arms: wide bell sleeves hanging from the shoulder, hands just showing
    const arms = [-1, 1].map((sx) => {
      const arm = new THREE.Group(); arm.position.set(sx * 0.27, 0.86, 0); body.add(arm);
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.12, 0.42, 9, 1, true), new THREE.MeshStandardMaterial({ color: "#2e1a4e", roughness: 0.9, side: THREE.DoubleSide })); sl.position.y = -0.22; sl.castShadow = true; arm.add(sl);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.012, 5, 12), trim); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.43; arm.add(cuff);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.115, 10), lining); inner.rotation.x = Math.PI / 2; inner.position.y = -0.425; arm.add(inner);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin); hand.position.y = -0.46; arm.add(hand);
      return arm;
    });
    g.userData = { body, legs, arms, panels };
    g.scale.setScalar(1.35);
    return g;
  }
  function makePolly() {
    // shaggy, muted-blue, long dark beak, one pale heavy-lidded eye per side
    const g = new THREE.Group();
    const feathers = mat("#151b28", { metalness: 0.3, roughness: 0.45 }), dark = mat("#080a10", { metalness: 0.2, roughness: 0.5 }); // raven: black with a blue sheen
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), feathers); body.scale.set(1, 1.05, 1.15); body.castShadow = true; g.add(body);
    for (let i = 0; i < 26; i++) { // ragged feather tufts
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), i % 2 ? feathers : dark);
      const a = rnd() * Math.PI * 2, b = rnd() * Math.PI * 0.8 + 0.3;
      t.position.set(Math.sin(b) * Math.cos(a) * 0.16, Math.cos(b) * 0.16, Math.sin(b) * Math.sin(a) * 0.17);
      t.lookAt(t.position.clone().multiplyScalar(2)); t.rotateX(Math.PI / 2); g.add(t);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.34, 6), mat("#0f1218", { roughness: 0.4 })); beak.rotation.x = Math.PI / 2 + 0.25; beak.position.set(0, -0.01, 0.3); g.add(beak);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: "#2f6cf0", emissive: "#163a9a", emissiveIntensity: 0.6, roughness: 0.15 })); eye.position.set(sx * 0.1, 0.04, 0.1); eye.scale.z = 0.6; g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), mat("#100c0a")); pupil.position.set(sx * 0.115, 0.035, 0.13); g.add(pupil);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), dark); lid.position.set(sx * 0.1, 0.045, 0.1); lid.rotation.x = 0.35; g.add(lid);
    }
    for (const sx of [-1, 1]) box(0.015, 0.1, 0.015, mat("#2a1e18"), sx * 0.05, -0.2, 0, g);
    // wings: a pivot at each shoulder with a few layered feather blades
    const wings = [-1, 1].map((sx) => {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.13, 0.04, -0.02); g.add(pivot);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22 - i * 0.03, 0.012, 0.1), i % 2 ? dark : feathers);
        blade.position.set(sx * (0.1 - i * 0.01), -i * 0.004, -0.03 - i * 0.045);
        blade.rotation.y = sx * (0.15 + i * 0.12);
        blade.castShadow = true; pivot.add(blade);
      }
      return pivot;
    });
    g.userData.wings = wings;
    return g;
  }
  function makeGhost() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: "#7bd389", emissive: "#3fae6a", emissiveIntensity: 1.1, transparent: true, opacity: 0.75, flatShading: true });
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 10), m); b.position.y = 0.9; g.add(b);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat("#0e2a18")); e.position.set(sx * 0.13, 1.15, 0.3); g.add(e); }
    const light = new THREE.PointLight("#5fe08a", 3, 5, 1.8); light.position.y = 1; g.add(light);
    // "lit" 0..1: 0 = a dark, still silhouette (CB at the window before it notices you), 1 = glowing green static
    g.userData.setLit = (k) => { m.color.set("#0a0812").lerp(new THREE.Color("#7bd389"), k); m.emissive.set("#000000").lerp(new THREE.Color("#3fae6a"), k); m.opacity = 0.96 - 0.21 * k; light.intensity = 3 * k; };
    return g;
  }
  const player = makePlayer(); scene.add(player);
  // the small lantern you carry
  const lanternMesh = new THREE.Group();
  box(0.16, 0.02, 0.16, M.iron, 0, 0, 0, lanternMesh); box(0.16, 0.02, 0.16, M.iron, 0, 0.24, 0, lanternMesh);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.015, 0.24, 0.015, M.iron, sx * 0.07, 0.12, sz * 0.07, lanternMesh);
  box(0.12, 0.2, 0.12, new THREE.MeshStandardMaterial({ color: "#c79bff", emissive: "#9b4dff", emissiveIntensity: 2.8, transparent: true, opacity: 0.85 }), 0, 0.12, 0, lanternMesh);
  const lanternCone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 4), M.iron); lanternCone.position.y = 0.3; lanternMesh.add(lanternCone);
  scene.add(lanternMesh);
  const polly = makePolly(); scene.add(polly);
  const ghosts = NPCS.map((n) => { const gh = makeGhost(); const r = MAP.roomAt(n.x, n.y); (r >= 0 ? roomGroups[r] : scene).add(gh); return { n, gh }; });

  // ----------------------------------------------------------- post-process
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  composer.setSize(OUT_W, OUT_H);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(OUT_W, OUT_H), 0.55, 0.5, 0.75));
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5));
        c.rgb *= smoothstep(0.9, 0.35, d) * 0.8 + 0.2; c.rgb += (rand(vUv * 600.0 + uTime) - 0.5) * 0.012; gl_FragColor = c; }`,
  });
  composer.addPass(finish);
  composer.addPass(new OutputPass());
  // Render at the size the stage is actually displayed at, so a big window gets a sharp picture
  // instead of a 960x576 image stretched up.
  function fitResolution() {
    const shown = stage.getBoundingClientRect().width / OUT_W || 1;
    const pr = Math.min(2.5, Math.max(1, (devicePixelRatio || 1) * shown));
    renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  }
  fitResolution(); addEventListener("resize", () => setTimeout(fitResolution, 50));

  // ---------------------------------------------------------------- camera
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camInit = false;
  function cameraTarget() {
    const px = P.x / TILE, pz = P.y / TILE;
    const room = MAP.rooms[S.area];
    const inHall = !room || room.id === "hallway";
    // hallway: higher overview; rooms: lower and closer for a better look around
    // pulled back a little and aimed higher so the tall walls and crown moulding stay in view
    const off = inHall ? new THREE.Vector3(0, 9.8, 9.6) : new THREE.Vector3(0, 7.2, 8.4);
    return { pos: new THREE.Vector3(px, 0, pz).add(off), look: new THREE.Vector3(px, 1.2, pz - (inHall ? 1.0 : 1.6)) };
  }

  // Fog in the dark beyond the walls: big soft wisps that drift slowly around whichever room is shown.
  const fogTex = canvasTex(256, 256, (c, W2, H2) => {
    c.clearRect(0, 0, W2, H2);
    for (let i = 0; i < 26; i++) { const x = 40 + rnd() * 176, y = 70 + rnd() * 116, r = 30 + rnd() * 60; const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(255,255,255,0.16)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, W2, H2); }
  });
  const wisps = [];
  for (let i = 0; i < 18; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, color: "#5a4a82", transparent: true, opacity: 0, depthWrite: false, fog: false }));
    sp.renderOrder = -1; scene.add(sp);
    wisps.push({ sp, a: (i / 18) * Math.PI * 2 + rnd() * 0.3, far: 1.5 + rnd() * 5, y: 0.6 + rnd() * 2.6, size: 6 + rnd() * 6, sp1: 0.015 + rnd() * 0.02, ph: rnd() * 10, o: 0.1 + rnd() * 0.1 });
  }
  function updateFog(t) {
    for (const w of wisps) w.sp.visible = false;      // plain black beyond the walls now; the drifting wisps are switched off
    return;
    const rm = MAP.rooms[shownRoom]; if (!rm) return;
    const cx = rm.x + rm.w / 2, cz = rm.y + rm.h / 2, attic = rm.id === "attic";
    for (const w of wisps) {
      // only behind and beside the room (never between the camera and the floor), drifting back and forth
      const a = Math.PI * (1.0 + (0.5 + 0.5 * Math.sin(w.a + t * w.sp1))), rx = rm.w / 2 + 1.5 + w.far, rz = rm.h / 2 + 1 + w.far;
      w.sp.position.set(cx + Math.cos(a) * rx + Math.sin(t * 0.13 + w.ph) * 1.2, w.y + Math.sin(t * 0.2 + w.ph) * 0.4, cz + Math.sin(a) * rz);
      w.sp.scale.set(w.size * 1.6, w.size, 1);
      w.sp.material.opacity = w.o * (0.7 + 0.3 * Math.sin(t * 0.3 + w.ph));
      w.sp.material.color.set(attic ? "#4a3a30" : "#5a4a82");
    }
  }
  // A small glowing arrow that bobs over the object Polly has just pointed you at.
  const marker = new THREE.Group(); marker.visible = false; scene.add(marker);
  {
    const mm = new THREE.MeshBasicMaterial({ color: "#ffcf70", transparent: true, opacity: 0.95, depthTest: false });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 4), mm); tip.rotation.x = Math.PI; tip.renderOrder = 50; marker.add(tip);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), mm); stem.position.y = 0.2; stem.renderOrder = 50; marker.add(stem);
    const ml = new THREE.PointLight("#ffcf70", 1.6, 2.2, 2); marker.add(ml);
  }
  let markerId = null; const markerAt = new THREE.Vector3();
  function updateMarker(t) {
    const id = G.nextTarget ? G.nextTarget() : null;
    const ent = id && objMeshes.find(({ o }) => o.id === id);
    if (!ent || ent.o.hidden || !ent.group.parent || !ent.group.parent.visible) { marker.visible = false; markerId = null; return; }
    if (id !== markerId) {
      markerId = id; ent.group.updateWorldMatrix(true, true);
      const bb = new THREE.Box3().setFromObject(ent.group);
      if (id === "loose_brick") { ent.group.getWorldPosition(markerAt); markerAt.y += 0.45; markerAt.z += 0.3; }      // the brick itself, not the wall above it
      else markerAt.set((bb.min.x + bb.max.x) / 2, Math.min(bb.max.y + 0.35, 3.3), Math.min(bb.max.z, (bb.min.z + bb.max.z) / 2 + 0.3));
    }
    marker.visible = true; marker.position.copy(markerAt); marker.position.y += Math.sin(t * 4) * 0.08; marker.rotation.y = t * 2;
  }
  // ---------------------------------------------------------------- render
  const DIR_ANGLE = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
  let facing = 0;
  let pollyFlyStart = null;
  let shownRoom = -1, switching = false;
  function showRoom(r) {
    roomGroups.forEach((g, i) => (g.visible = i === r));
    moon.visible = MAP.rooms[r] && MAP.rooms[r].id === "bedroom";
    shownRoom = r; camInit = false;
  }
  // Door transition: the hand-drawn door cutscene plays and the room swaps while it covers the screen.
  function doorTransition(to) {
    switching = true;
    const wasLocked = S.lock; S.lock = true;
    G.doorCutscene(() => showRoom(to)).then(() => { S.lock = wasLocked; switching = false; });
  }
  function render(dt) {
    const t = S.time;
    const px = P.x / TILE, pz = P.y / TILE;
    if (shownRoom < 0 && S.area >= 0) showRoom(S.area);
    else if (S.area >= 0 && S.area !== shownRoom && !switching) showRoom(S.area); // teleports / story jumps
    if (!switching && !S.lock) {
      const st = stairAt(Math.floor(px), Math.floor(pz));
      if (st) {
        switching = true; S.lock = true;
        const FX = window.STAIRS3D || (typeof STAIRFX !== "undefined" ? STAIRFX : null);
        const go = () => { G.placePlayer(st.to.x, st.to.y); P.dir = st.dir; showRoom(MAP.roomAt(st.to.x, st.to.y)); };
        (FX ? FX.play(go, st.label === "up") : Promise.resolve(go())).then(() => { S.lock = false; switching = false; });
      }
    }
    if (!switching && !S.lock) {
      const d = doorAt(Math.floor(px), Math.floor(pz));
      if (d && d.A >= 0 && d.B >= 0) {
        const goingDown = S.area === d.A;
        const target = goingDown ? d.B : d.A;
        switching = true;
        const wasLocked = S.lock; S.lock = true;
        const swap = () => {
          if (goingDown) { G.placePlayer(Math.floor(d.cx), d.y + d.h); P.y += 6; P.dir = "down"; }
          else { G.placePlayer(Math.floor(d.cx), d.y - 1); P.y -= 6; P.dir = "up"; }
          showRoom(target);
        };
        const done = () => { S.lock = wasLocked; switching = false; };
        if (d.stairs && window.STAIRS3D) STAIRS3D.play(swap, !goingDown, { blood: true, attic: true }).then(done);   // the attic: a bloodstained flight of stairs
        else G.doorCutscene(swap).then(done);
      }
    }

    // player
    const target = DIR_ANGLE[P.dir] ?? 0;
    let diff = target - facing; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    facing += diff * Math.min(1, dt * 12);
    player.position.set(px, S.intro.sitting ? 0.55 : 0, pz - (S.intro.sitting ? 0.2 : 0));
    player.rotation.y = facing;
    const walk = P.moving ? Math.sin(P.anim * 14) : 0;
    const ud = player.userData;
    ud.legs[0].rotation.x = walk * 0.6; ud.legs[1].rotation.x = -walk * 0.6;
    ud.arms[0].rotation.x = -walk * 0.5; ud.arms[1].rotation.x = walk * 0.5;
    ud.body.position.y = P.moving ? Math.abs(walk) * 0.04 : Math.sin(t * 2) * 0.01;
    ud.legs.forEach((l) => (l.visible = !S.intro.sitting));
    // the robe: every panel swings on its own beat; the ones behind you lift as you walk, and it settles when you stop
    ud.swish = (ud.swish ?? 0) + ((P.moving ? 1 : 0) - (ud.swish ?? 0)) * Math.min(1, dt * 6);
    for (const pn of ud.panels) {
      const back = Math.max(0, -Math.cos(pn.a));                                  // 1 for the panel directly behind
      const tilt = 0.2 + ud.swish * (0.1 + back * 0.32 + Math.sin(P.anim * 14 + pn.ph) * 0.16) + (1 - ud.swish) * Math.sin(t * 1.4 + pn.ph) * 0.025;
      pn.piv.rotation.x = -tilt; pn.piv.rotation.z = ud.swish * Math.sin(P.anim * 7 + pn.ph * 1.7) * 0.08;
    }

    // Polly: on the shoulder, fluttering around, or hidden
    polly.visible = !S.intro.birdHidden;
    const wings = polly.userData.wings;
    // Polly takes off (one lap, then hovers) whenever she starts a new speaking section
    const uiNow = G.state().ui, pollyTalking = !!(uiNow && uiNow.type === "dialogue" && (uiNow.who === "bird" || !uiNow.who));
    if (S.intro.birdFly || pollyTalking) {
      if (pollyFlyStart === null) pollyFlyStart = t;
      const el = t - pollyFlyStart, ORBIT = (Math.PI * 2) / 2.2; // one lap, then hover
      const flap = Math.sin(t * 22);
      wings[0].rotation.z = 0.2 + flap * 0.9; wings[1].rotation.z = -0.2 - flap * 0.9;
      if (el < ORBIT) {
        const a = el * 2.2 - Math.PI / 2;
        polly.position.set(px + Math.cos(a) * 1.0, 1.9 + Math.sin(a * 2) * 0.15, pz + Math.sin(a) * 0.7);
        polly.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), Math.sin(t * 3) * 0.1); // face along the flight path
      } else {
        // hover just above the player's head, bobbing gently and facing the camera
        const k = Math.min(1, (el - ORBIT) * 2);
        const hx = px + 0.15, hy = 2.05 + Math.sin(t * 4) * 0.06, hz = pz + 0.35;
        polly.position.lerp(new THREE.Vector3(hx, hy, hz), k);
        polly.rotation.set(0, Math.sin(t * 0.8) * 0.25, 0);
      }
    } else {
      pollyFlyStart = null;
      wings[0].rotation.z = -0.15; wings[1].rotation.z = 0.15; // folded
      const sh = new THREE.Vector3(0.32, 1.45, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
      polly.position.set(player.position.x + sh.x, player.position.y + sh.y + (Math.sin(t * 3) > 0.93 ? 0.04 : 0), player.position.z + sh.z);
      polly.rotation.set(0, facing + Math.sin(t * 0.7) * 0.3, 0);
    }

    // lantern follows the player, flickering
    const hand = new THREE.Vector3(0.42, 0.62, 0.22).multiplyScalar(1.35).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    lanternMesh.position.set(player.position.x + hand.x, player.position.y + hand.y + Math.sin(t * 6) * 0.01, player.position.z + hand.z);
    lantern.position.copy(lanternMesh.position).add(new THREE.Vector3(0, 0.15, 0));
    lantern.intensity = 15 + Math.sin(t * 9) * Math.sin(t * 13.7) * 3;

    updateMarker(t); updateFog(t);
    // the storage room is black and white until the vial puzzle is solved
    {
      const rm = MAP.rooms[shownRoom], want = rm && rm.id === "storage_room" && !S.flags.skillsDone ? 1 : 0;
      grayNow += (want - grayNow) * Math.min(1, dt * 1.6);
      const f = grayNow > 0.01 ? `grayscale(${Math.min(1, grayNow).toFixed(3)})` : "";
      if (f !== grayCss) { grayCss = f; canvas.style.filter = f; }
    }
    // the attic has its own mood: almost no fill light, brown-black fog, a weaker lantern
    {
      const atticNow = !!(MAP.rooms[shownRoom] && MAP.rooms[shownRoom].id === "attic");
      ambLight.color.set(atticNow ? "#2e2a26" : "#4a3870"); ambLight.intensity = atticNow ? 1.15 : 2.4;
      hemiLight.intensity = atticNow ? 0.35 : 1.4;
      scene.fog.color.set("#000000"); scene.fog.density = atticNow ? 0.045 : 0.022;
      scene.background.set("#000000");
      if (atticNow) lantern.intensity *= 0.5;
    }
    // assign the nearest light sources to the pooled lights
    const near = lightSources.filter((l) => l.room === shownRoom).map((l) => ({ l, d: (l.x - px) ** 2 + (l.z - pz) ** 2 })).sort((a, b) => a.d - b.d).slice(0, POOL.length);
    POOL.forEach((pl, i) => {
      const e = near[i];
      if (!e || e.d > 200) { pl.intensity = 0; return; }
      const L = e.l;
      pl.color.set(L.color);
      pl.position.set(L.x, L.y, L.z);
      pl.distance = 3.8 + L.power * 2.2;
      pl.intensity = (2.6 + L.power * 1.6) * (0.82 + 0.18 * Math.sin(t * 9 + L.phase) * Math.sin(t * 13.3 + L.phase * 1.7));
    });

    // flames flicker; spinning cube; ghosts float
    for (const f of flames) {
      const k = 0.8 + 0.3 * Math.sin(t * 14 + f.phase) * Math.sin(t * 9.3 + f.phase * 2);
      const b = f.base || 1; f.mesh.scale.set(b, b * 1.1 * k, b); f.mesh.rotation.y = t * 3 + f.phase;
    }
    for (const { o, group } of objMeshes) {
      if (o.id === "cellar_door") group.visible = !S.flags.cellarOpen;
      else group.visible = !o.hidden;
      group.children.forEach((c) => {
        if (c.userData.spin) { c.rotation.y = t * 0.8; c.rotation.x = t * 0.5; }
        const m = c.userData.mote;
        if (m) { const k = (t * m.speed + m.phase) % 1; if (m.span) { c.position.set(-0.4 + Math.cos(m.a + t * 0.2) * m.r, m.y0 + k * m.span, m.z + Math.sin(m.a + t * 0.2) * 0.2); c.material.opacity = Math.sin(k * Math.PI) * 0.7; } else { c.position.set(Math.cos(m.a + t * 0.3) * m.r, 0.05 + k * 1.4, Math.sin(m.a + t * 0.3) * m.r); c.material.opacity = 1 - k; } c.material.transparent = true; }
      });
    }
    if (S.flags.traceShown) traceT = Math.min(traceSteps.length + 2, traceT + dt * 4);
    traceSteps.forEach((st, i) => {
      const a = Math.max(0, Math.min(1, traceT - i)) * (0.75 + 0.25 * Math.sin(t * 2 + i));
      st.m.opacity = a * 0.9; if (st.label) st.label.material.opacity = a;
    });
    updateFlight();
    if (!bookFlight) shelfBook.visible = !S.flags.bookTaken;
    shelfBook.children[0].material.emissiveIntensity = 0.65 + Math.sin(t * 2.4) * 0.25;
    carriedBook.visible = !bookFlight && !!S.flags.bookTaken && !S.flags.bookOnDesk && shownRoom === MAP.rooms.findIndex((r) => r.id === "library");
    if (carriedBook.visible) {
      const off = new THREE.Vector3(-0.45, 0.85, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
      carriedBook.position.set(player.position.x + off.x, player.position.y + off.y, player.position.z + off.z); carriedBook.rotation.y = facing;
    }
    for (const { group } of objMeshes) {
      const rb = group.userData.readingBook;
      if (rb) { rb.open.visible = !!S.flags.bookOnDesk; rb.readGlow.intensity = S.flags.bookOnDesk ? 1.4 + Math.sin(t * 2) * 0.3 : 0; }
      const wt = group.userData.watcher;
      if (wt && group.parent && group.parent.visible) {
        const hp = new THREE.Vector3(); wt.head.getWorldPosition(hp);
        const dx = px - hp.x, dz = pz - hp.z, dy = 1.2 - hp.y;
        const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
        wt.head.rotation.y += (Math.max(-1, Math.min(1, yaw)) - wt.head.rotation.y) * Math.min(1, dt * 3);
        wt.head.rotation.x += (-pitch * 0.6 - wt.head.rotation.x) * Math.min(1, dt * 3);
        wt.iris.rotation.y = Math.max(-0.5, Math.min(0.5, yaw * 0.3)); wt.iris.rotation.x = Math.max(-0.4, Math.min(0.4, -pitch * 0.4));
        wt.head.position.y = 3.3 + Math.sin(t * 1.1) * 0.05;
        wt.vines.forEach((v, i) => { v.vine.rotation.y = Math.sin(t * 0.6 + i) * 0.06; });
        const pp = 0.8 + 0.2 * Math.sin(t * 1.3); wt.pink.intensity = 2.4 * pp; wt.halo.material.opacity = 0.1 * pp;
      }
      const rd = group.userData.redDoor;
      if (rd) { const p = 0.75 + 0.25 * Math.sin(t * 1.6) * Math.sin(t * 2.7 + 1); rd.glowM.material.opacity = 0.65 + 0.3 * p; rd.pool.children.forEach((c) => (c.material.opacity = 0.25 + 0.12 * p)); rd.glowLight.intensity = 3 + 2 * p;
        // candle flicker: two fast wobbles plus an occasional dip, like the lanterns at the gate
        if (rd.mood) { rd.mood.wash.intensity = 4.2 + 1.2 * p; rd.mood.haze.material.opacity = 0.38 + 0.14 * p; rd.mood.greens.forEach((gl, k) => (gl.intensity = 1.3 + 0.5 * Math.sin(t * 0.9 + k * 2.1))); }
        for (const ln of rd.lanterns || []) {
          const tt = t + ln.phase, dip = Math.sin(tt * 0.7) > 0.93 ? 0.45 : 1;
          const f = (0.78 + 0.14 * Math.sin(tt * 11.3) + 0.08 * Math.sin(tt * 23.7 + 1.3)) * dip;
          ln.pl.intensity = 1.1 * f; ln.glass.emissiveIntensity = 0.55 + 0.5 * f; ln.halo.material.opacity = 0.03 + 0.04 * f;
          ln.fl.scale.set(0.9 + 0.15 * f, 1.5 + 0.6 * f, 0.9 + 0.15 * f); ln.fl.position.x = Math.sin(tt * 7.1) * 0.006;
        }
      }
      const at = group.userData.attic;
      if (at) {
        at.bulbPivot.rotation.set(Math.sin(t * 0.7 + 1) * 0.05, 0, Math.sin(t * 0.9) * 0.13);
        const dead = Math.sin(t * 0.43) > 0.965 || Math.sin(t * 1.9 + 2) > 0.992;                     // now and then it cuts out
        const f = dead ? 0.04 : 0.72 + 0.2 * Math.sin(t * 19) * Math.sin(t * 5.3) + 0.08 * Math.sin(t * 41);
        at.bulbLight.intensity = 12 * f; at.bulbM.emissiveIntensity = 0.2 + 2.2 * f;
        for (const rd of at.reds) { const k = 0.8 + 0.2 * Math.sin(t * 1.7 + rd.ph) * Math.sin(t * 6.3 + rd.ph); rd.pl.intensity = 5 * k; rd.glassR.emissiveIntensity = 1.0 + 0.9 * k; }
        for (const h of at.hooks) h.hp.rotation.z = Math.sin(t * 0.8 + h.ph) * 0.06;
        at.dust.position.set(Math.sin(t * 0.11) * 0.25, Math.sin(t * 0.17) * 0.18, Math.cos(t * 0.09) * 0.2);
      }
      if (group.userData.mirrorEyes) { const k = Math.sin(t * 0.33 + 1.2); group.userData.mirrorEyes.opacity = k > 0.9 ? (k - 0.9) / 0.1 * 0.9 : 0; }   // something in the glass, briefly
      if (group.userData.curtainGlow) { const cg = group.userData.curtainGlow, k = 0.85 + 0.15 * Math.sin(t * 0.8); cg.glowM.opacity = 0.32 * k; cg.cl.intensity = 3.2 * k; }   // breathes slowly
      if (group.userData.rock) group.userData.rock.rotation.x = Math.sin(t * 1.25) * 0.14;
      if (group.userData.breathe) group.userData.breathe.scale.set(1 + Math.sin(t * 0.9) * 0.012, 1, 1 + Math.sin(t * 0.9) * 0.012);
      if (group.userData.facePlayer) {
        const fp = group.userData.facePlayer; let dd = Math.atan2(px - group.position.x, pz - group.position.z) - group.rotation.y - fp.rotation.y;
        while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
        fp.rotation.y += dd * Math.min(1, dt * 0.5);
      }
      if (group.userData.trunk) {
        const tr = group.userData.trunk, target = S.flags.trunkOpen ? 1 : 0;
        tr.open += (target - tr.open) * Math.min(1, dt * 2.5);
        tr.lidG.rotation.x = -tr.open * 1.9;
        tr.cube.visible = tr.open > 0.3 && !S.flags.sandboxTaken;
        tr.cube.position.y = 0.51 + tr.open * 0.55 + Math.sin(t * 2) * 0.04; tr.cube.rotation.y = t * 0.8;
        tr.cubeLight.intensity = tr.open * 1.5;
      }
      if (group.userData.chalkLines) for (const ln of group.userData.chalkLines) ln.visible = !S.flags.boardWiped && !chalkRows.length;
      if (group.userData.brick) {
        const bk = group.userData.brick, pulled = !!S.flags.brickPulled;
        bk.out = pulled ? Math.min(1, bk.out + dt / 1.75) : 0;                              // 1.75s in all, so it lands on the thud
        const k = bk.out, slide = Math.min(1, k / 0.74), drop = Math.max(0, (k - 0.74) / 0.26);   // a slow scrape (the drag sound), then a quick fall
        // scrape out of the wall, then tumble to the floor
        bk.brick.position.set(drop * 0.35, bk.Y - drop * drop * (bk.Y - bk.floorY), 0.03 + slide * 0.5 + drop * 0.25);
        bk.brick.rotation.set(drop * 1.2, drop * 0.5, pulled ? 0 : Math.sin(t * 9) * 0.012);     // wobbles while it's still in the wall
        bk.seamM.opacity = pulled ? Math.max(0, 0.8 - k * 2) : 0.5 + 0.3 * Math.sin(t * 3);
        bk.niche.visible = k > 0.1; bk.boxGlow.intensity = bk.niche.visible ? 1.2 : 0;
        bk.lid.rotation.x += ((S.flags.boxOpen ? -1.7 : 0) - bk.lid.rotation.x) * Math.min(1, dt * 4);
      }
      if (group.userData.puzzleVials) {                                  // jumbled until the puzzle is solved, then in order
        const order = S.flags.skillsDone ? ["red", "green", "purple"] : ["green", "purple", "red"];
        for (const v of group.userData.puzzleVials) { const tx = 0.37 + order.indexOf(v.id) * 0.22; v.V.position.x += (tx - v.V.position.x) * Math.min(1, dt * 4); }
      }
      if (group.userData.wkey) { const wk = group.userData.wkey; wk.shown = wk.o.hidden ? 0 : Math.min(1, wk.shown + dt * 0.8);   // shimmers into view
        wk.K.scale.setScalar(0.2 + 0.8 * wk.shown); wk.K.position.y = (wk.o.mount === "wall" ? 0.35 : 1.25) + Math.sin(t * 2) * 0.05; wk.K.rotation.y = t * 1.2; wk.K.rotation.x = -0.3; }
      if (group.userData.tentacles) for (const tn of group.userData.tentacles) tn.tg.rotation.z = Math.sin(t * 0.9 + tn.phase) * 0.04;
      if (group.userData.snake) { const sn = group.userData.snake; sn.body.scale.set(1, 1 + Math.sin(t * 0.8) * 0.05, 1); sn.zz.position.y = sn.zy + (t * 0.25 % 1) * 0.25; sn.zz.material.opacity = 1 - (t * 0.25 % 1); }
      if (group.userData.pipeDrip) { const pd = group.userData.pipeDrip, k = (t * 0.6) % 1; pd.drip.position.y = pd.y0 - k * (pd.y0 - pd.floor); pd.drip.visible = k < 0.96; }
      if (group.userData.drip) { const k = (t * 0.8) % 1; group.userData.drip.position.y = 1.06 - k * 0.19; group.userData.drip.visible = k < 0.95; }
      const cd = group.userData.cauldron;
      if (cd) cd.bubbles.forEach((bb) => { const k = (t * 0.6 + bb.ph) % 1; bb.b.position.set(bb.x, bb.y0 + k * 0.12, bb.z); bb.b.material.opacity = 1 - k; });
      const jt = group.userData.jarThing;
      if (jt) {
        const tt = t + jt.phase, twitch = Math.sin(tt * 7) > 0.92 ? 0.06 : 0;
        jt.thing.position.set(Math.sin(tt * 0.6) * 0.05, 0.96 + Math.sin(tt * 0.9) * 0.05, Math.cos(tt * 0.5) * 0.04);
        jt.thing.rotation.y = tt * 0.4 + twitch * 8; jt.tail.rotation.y = Math.sin(tt * 6) * 0.6;
      }
      const cu = group.userData.curtain;
      if (!cu) continue;
      const target = S.flags.curtainOpen ? 1 : 0;
      cu.open += (target - cu.open) * Math.min(1, dt * 5);
      if (group.userData.bottleMats) for (const bm of group.userData.bottleMats) bm.emissiveIntensity = 0.12 + cu.open * 0.55;
      if (group.userData.bottleHalo) group.userData.bottleHalo.material.opacity = cu.open * (0.22 + 0.04 * Math.sin(t * 1.7));
      const squash = 1 - cu.open * 0.85;
      for (const [mesh, width] of [[cu.front, cu.w], [cu.side, 1]]) {
        mesh.scale.x = mesh === cu.front ? squash : 1;
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i);
          const folds = 0.04 + cu.open * 0.1;
          pos.setZ(i, Math.sin(x * (14 + cu.open * 20)) * folds + Math.sin(t * 1.3 + x * 3 + cu.t0) * 0.03 * (0.5 - y / 1.95));
        }
        pos.needsUpdate = true;
      }
      cu.back.intensity = 2.2 * (1 - cu.open) + 0.3;
      cu.sil.visible = cu.open < 0.15;
    }
    {                                                    // the see-through exit door only appears as you walk down towards it
      const px = P.x / TILE, pz = P.y / TILE;
      for (const gd of ghostDoors) {
        const gap = gd.d.y - pz, inLine = Math.abs(px - gd.d.cx) < gd.d.w / 2 + 0.6;
        gd.dr.visible = inLine && gap > -1 && (gap < 1.3 || (gap < 3 && P.dir === "down" && P.moving));
      }
    }
    for (const dm of doorMeshes) {                       // doors to finished rooms turn ashen grey
      const done = !!(G.roomDone && G.roomDone(dm.leadsTo));
      if (done !== dm.done) { dm.done = done; const wd = dm.dr.userData.wood; wd.map = done ? doorWoodGrey : doorWoodTex; wd.needsUpdate = true; if (dm.dr.userData.hands) dm.dr.userData.hands.visible = !done; }
    }
    for (const { n, gh } of ghosts) {
      if (!S.flags.cellarMet) { gh.position.set(n.px / TILE + 0.5, 0, n.py / TILE + 0.5); gh.rotation.y = Math.PI; gh.userData.turn = Math.PI; gh.userData.setLit(0); }   // a dark shape facing the window
      else {
        gh.userData.turn = Math.max(0, (gh.userData.turn ?? 0) - dt * 2.2);                              // it turns around, slowly
        gh.userData.setLit(1 - gh.userData.turn / Math.PI);                                               // and the static lights up
        gh.position.set(n.px / TILE + 0.5 + Math.sin(t * 0.7) * 0.3 * (1 - gh.userData.turn / Math.PI), Math.sin(t * 1.6) * 0.15, n.py / TILE + 0.5);
        gh.rotation.y = gh.userData.turn + Math.sin(t * 0.5) * 0.4 * (1 - gh.userData.turn / Math.PI);
      }
      if (S.flags.helperGone) { gh.userData.fade = Math.min(1, (gh.userData.fade || 0) + dt * 0.8); gh.scale.setScalar(1 - gh.userData.fade); gh.position.y += gh.userData.fade * 2; gh.visible = gh.userData.fade < 1; }
    }

    // camera
    const ct = cameraTarget();
    if (!camInit) { camPos.copy(ct.pos); camLook.copy(ct.look); camInit = true; }
    const k = Math.min(1, dt * 3);
    camPos.lerp(ct.pos, k); camLook.lerp(ct.look, k);
    camera.position.copy(camPos); camera.lookAt(camLook);

    finish.uniforms.uTime.value = t;
    composer.render();
  }

  // world pixel position (+height in tiles) -> stage pixel coords for DOM cards
  function project(pxX, pxY, height = 1.2) {
    const v = new THREE.Vector3(pxX / TILE, height, pxY / TILE).project(camera);
    return { x: (v.x * 0.5 + 0.5) * OUT_W, y: (-v.y * 0.5 + 0.5) * OUT_H };
  }

  // debug: find furniture whose 3D bounds intersect (ignores flat wall decor and rugs)
  function overlaps() {
    const skip = /^(attic_set|attic_scratches|rug|cobweb|banner|sconce|plaque|painting(_\d)?|ornate_mirror|mirror|window|portrait|slime_puddle|ooze|evals_kit|uv_light|sandbox_cube|chalkboard|front_door|cellar_door|gothic_window)$/;
    const items = objMeshes.filter(({ o, group }) => !skip.test(o.sprite) && !o.hidden && group.parent).map(({ o, group }) => {
      const b = new THREE.Box3().setFromObject(group); b.expandByScalar(-0.04); return { id: o.id, b, room: group.parent };
    });
    const out = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++)
      if (items[i].room === items[j].room && items[i].b.intersectsBox(items[j].b)) out.push(items[i].id + " x " + items[j].id);
    return out;
  }
  // debug: where each object is really drawn (floor footprint, in tiles)
  function footprints() {
    return objMeshes.filter(({ o, group }) => !o.hidden && group.parent).map(({ o, group }) => {
      const b = new THREE.Box3().setFromObject(group);
      return { id: o.id, x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z, h: b.max.y };
    });
  }
  // debug: rendering cost of the room currently shown
  function stats() {
    let meshes = 0, lights = 0, shadowLights = 0; const mats = new Set();
    scene.traverseVisible((n) => { if (n.isMesh) { meshes++; mats.add(n.material); } if (n.isLight) { lights++; if (n.castShadow) shadowLights++; } });
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, meshes, materials: mats.size, lights, shadowLights, programs: renderer.info.programs.length };
  }
  // debug: wall decor that sits on or beside a doorway, or touches anything else in its room
  function wallAudit(margin = 0.06) {
    const decor = /^(painting(_\d|_round|_small)?|ornate_mirror|frame_oval|frame_verdigris|frame_gilt|birdbox|swords|witch_shelf|curio_shelf|banner|sconce|plaque|graffiti)$/;
    const items = objMeshes.filter(({ o, group }) => !o.hidden && group.parent && o.sprite !== "cobweb" && o.sprite !== "rug").map(({ o, group }) => {
      group.updateWorldMatrix(true, true); return { o, b: new THREE.Box3().setFromObject(group), room: group.parent, decor: decor.test(o.sprite) };
    });
    const out = [], r2 = (v) => v.toFixed(2);
    for (const it of items) {
      if (!it.decor || it.o.side) continue;
      for (const d of DOORS) {                                    // the stone arch spans the opening plus the jambs
        const z = Math.abs(it.b.max.z - (d.y + d.h)) < 0.8 ? 1 : Math.abs(it.b.max.z - d.y) < 0.8 ? 1 : 0;
        if (z && it.b.max.x > d.x - 0.75 && it.b.min.x < d.x + d.w + 0.75) out.push(`${it.o.id} is on/beside the door at x=${d.x} (frame x ${r2(it.b.min.x)}-${r2(it.b.max.x)})`);
      }
      const fd = it.o.sprite === "front_door" ? null : items.find((x) => x.o.sprite === "front_door" && x.room === it.room);
      if (fd && it.b.max.x > fd.b.min.x - 0.1 && it.b.min.x < fd.b.max.x + 0.1 && it.o.sprite !== "sconce") out.push(`${it.o.id} overlaps the front door`);
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.room !== B.room || !(A.decor || B.decor) || A.o.sprite === "front_door" || B.o.sprite === "front_door") continue;
      if (A.o.sprite === "graffiti" && B.o.sprite === "graffiti") continue;
      const a = A.b.clone().expandByScalar(margin);
      if (a.intersectsBox(B.b)) out.push(`${A.o.id} touches ${B.o.id}`);
    }
    return out;
  }
  window.WORLD3D = { ready: true, render, project, overlaps, footprints, stats, wallAudit, flyBook, mirrorNote: (rows, fog = 1) => drawMirror(fog, rows), chalkNote: (rows) => drawChalk(rows), snap() { camInit = false; } };
})();
