// title3d.js: Three.js renderer for the title sequence.
//
// Each 2D layer from title.js (sky, far trees, manor, mist, gates, brambles) is
// painted onto its own canvas and placed on a plane at a different depth, so the
// camera gets real parallax and can fly through the gates. Post-processing adds
// bloom (red windows, lanterns, moon), soft volumetric-looking smoke, a
// vignette and film grain. If Three.js can't load (offline), title.js keeps
// using its plain 2D renderer.

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
    console.warn("Three.js unavailable, using the 2D title.", e);
    return;
  }

  const T = TITLE;
  const W = T.W, H = T.H;
  const OUT_W = 960, OUT_H = 576; // stage size

  const host = document.getElementById("title");
  const canvas = document.createElement("canvas");
  canvas.id = "title3d";
  host.insertBefore(canvas, host.firstChild);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(OUT_W, OUT_H, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#07030f");
  const FOV = 40, ASPECT = W / H;
  const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 200);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

  // A layer = an offscreen canvas + a plane sized to fill the view at its depth.
  function layer(depth, draw, { oversize = 1.08, clear = true } = {}) {
    const cv = document.createElement("canvas");
    cv.width = W * T.RES; cv.height = H * T.RES;
    const c = cv.getContext("2d");
    c.setTransform(T.RES, 0, 0, T.RES, 0, 0); // draw in logical 480x288 units
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = 2 * depth * tanHalf * oversize, w = h * ASPECT;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    mesh.position.set(0, 0, -depth);
    scene.add(mesh);
    return {
      depth, mesh, tex, c, w, h,
      paint(t) { if (clear) c.clearRect(0, 0, W, H); draw(c, t); tex.needsUpdate = true; },
      // canvas pixel -> world position on this plane
      world(px, py) { return new THREE.Vector3((px / W - 0.5) * w, (0.5 - py / H) * h, -depth); },
      unit: h / H, // world units per canvas pixel
    };
  }

  const D = { sky: 90, far: 60, manor: 40, mist: 33, gates: 26, brambles: 5 };
  const L = {
    sky: layer(D.sky, (c, t) => T.drawSky(c, t), { oversize: 1.25, clear: false }),
    far: layer(D.far, (c) => T.drawFar(c), { oversize: 1.15 }),
    manor: layer(D.manor, (c, t) => T.drawManorLive(c, t), { oversize: 1.1 }),
    mist: layer(D.mist, (c, t) => T.drawMist(c, t), { oversize: 1.2 }),
    gates: layer(D.gates, (c, t) => T.drawGatesLayer(c, t), { oversize: 1.1 }),
    brambles: layer(D.brambles, (c, t) => T.drawThicket(c, t), { oversize: 1.15 }),
  };
  L.far.paint(0);
  // a second bramble plane further back, reusing the same canvas mirrored
  const bramblesBack = new THREE.Mesh(
    new THREE.PlaneGeometry(L.brambles.w * 1.9, L.brambles.h * 1.9),
    new THREE.MeshBasicMaterial({ map: L.brambles.tex, transparent: true, depthWrite: false, color: "#7a7a88" })
  );
  bramblesBack.scale.x = -1;
  bramblesBack.position.set(0, 0, -D.brambles * 1.8);
  bramblesBack.renderOrder = 4.5;
  bramblesBack.visible = false; // the thicket has its own hole; a second copy would misalign it
  scene.add(bramblesBack);
  // draw order back to front
  [L.sky, L.far, L.manor, L.mist, L.gates, L.brambles].forEach((l, i) => (l.mesh.renderOrder = i));

  // ---------------------------------------------------------------- smoke
  const puff = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.5, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const chimney = L.manor.world(T.CHIMNEY.x, T.CHIMNEY.y);
  chimney.z += 0.5;
  const puffs = [];
  function spawnPuff() {
    const m = new THREE.SpriteMaterial({ map: puff, color: "#8a8790", transparent: true, depthWrite: false, opacity: 0 }) // soft grey smoke;
    const s = new THREE.Sprite(m);
    s.position.copy(chimney).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0));
    s.userData = { age: 0, life: 7 + Math.random() * 3, vx: 0.25 + Math.random() * 0.35, vy: 1.1 + Math.random() * 0.5, size: 0.8 };
    s.renderOrder = 2.5;
    scene.add(s);
    puffs.push(s);
  }
  function updatePuffs(dt, t) {
    if (T.state.stage >= 1 && Math.random() < dt * 9) spawnPuff();
    for (let i = puffs.length - 1; i >= 0; i--) {
      const s = puffs[i], u = s.userData;
      u.age += dt;
      const k = u.age / u.life;
      s.position.x += (u.vx + Math.sin(t * 0.8 + u.age) * 0.25) * dt;
      s.position.y += u.vy * dt * (1 - k * 0.5);
      const size = u.size + k * 5;
      s.scale.set(size, size, 1);
      s.material.opacity = Math.min(1, u.age * 1.5) * (1 - k) * 0.22;
      s.material.rotation += dt * 0.1;
      if (u.age >= u.life) { scene.remove(s); s.material.dispose(); puffs.splice(i, 1); }
    }
  }

  // drifting mist sprites near the ground for depth
  const mists = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.SpriteMaterial({ map: puff, color: "#3a2d55", transparent: true, depthWrite: false, opacity: 0.12 });
    const s = new THREE.Sprite(m);
    const depth = 20 + Math.random() * 25;
    s.position.set((Math.random() - 0.5) * depth * 1.2, -depth * tanHalf * 0.75, -depth);
    const sz = 8 + Math.random() * 10; s.scale.set(sz * 2.2, sz * 0.6, 1);
    s.userData = { speed: 0.3 + Math.random() * 0.5, depth };
    s.renderOrder = 3.5;
    scene.add(s); mists.push(s);
  }

  // ------------------------------------------------------------ post-process
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  composer.setSize(OUT_W, OUT_H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(OUT_W, OUT_H), 0.55, 0.45, 0.32);
  composer.addPass(bloom);
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDark: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uDark; varying vec2 vUv;
      float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec4 col = texture2D(tDiffuse, vUv);
        float d = distance(vUv, vec2(0.5));
        col.rgb *= smoothstep(0.85, 0.32, d) * 0.85 + 0.15;          // vignette
        col.rgb += (rand(vUv * 480.0 + uTime) - 0.5) * 0.022;       // film grain
        col.rgb *= 1.0 - uDark;                                       // fade to black
        gl_FragColor = col;
      }`,
  });
  composer.addPass(finish);
  composer.addPass(new OutputPass());

  // --------------------------------------------------------------- camera
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", (e) => {
    look.tx = (e.clientX / innerWidth - 0.5) * 0.3;
    look.ty = (e.clientY / innerHeight - 0.5) * 0.15;
  });

  const smokeEl = document.getElementById("title-smoke");

  function render(t, dt) {
    const S = T.state;
    // paint the animated layers
    L.sky.paint(t); L.manor.paint(t); L.mist.paint(t); L.gates.paint(t);
    L.brambles.mesh.visible = S.part < 1;
    if (L.brambles.mesh.visible) L.brambles.paint(t);
    updatePuffs(dt, t);
    for (const m of mists) {
      m.position.x += m.userData.speed * dt;
      if (m.position.x > m.userData.depth * 0.8) m.position.x = -m.userData.depth * 0.8;
    }

    // idle drift + mouse parallax, a slow dolly at stage 0, and the fly-through
    look.x += (look.tx - look.x) * Math.min(1, dt * 2);
    look.y += (look.ty - look.y) * Math.min(1, dt * 2);
    const drift = Math.sin(t * 0.25) * 0.08;
    camera.position.set(look.x + drift, -look.y, 0);
    camera.position.z = -(S.zoom - 1) * 14 - S.push * (D.gates + 2);
    camera.position.y += S.push * -1.5;
    camera.lookAt(camera.position.x * 0.3, camera.position.y * 0.3 + S.push * -0.5, -50);

    finish.uniforms.uTime.value = t;
    finish.uniforms.uDark.value = Math.min(1, Math.max(0, (S.push - 0.55) / 0.45));
    composer.render();

    // keep the smoke subtitle attached to the chimney on screen
    if (smokeEl && S.stage >= 1) {
      const p = L.sky.world(T.MOON.textX, T.MOON.y).project(camera); // in the crescent's dark part
      smokeEl.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      smokeEl.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    }
  }

  T.renderer3d = { ready: true, render };
})();
