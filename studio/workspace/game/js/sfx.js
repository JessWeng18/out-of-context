// sfx.js: sound effects, synthesised in the browser (no audio files).
//
// Browsers only allow sound after the player presses a key or clicks, so the audio engine starts on
// the first key press. Press M to mute or unmute (remembered between visits).
//
// The sounds hook into the game from the outside: this file wraps a few GAME / TITLE functions and
// listens for key presses, so none of the game logic depends on it.

const SFX = (() => {
  let ac = null, master = null, noiseBuf = null, windNode = null, fireNode = null;
  let muted = false; try { muted = localStorage.getItem("ooc-muted") === "1"; } catch (e) {}
  const VOL = 0.5;

  // Recorded clips (audio/*). Plain <audio> elements, so they also work when the game is opened as a file.
  const CLIPS = { crow: "crow.mp3", moon: "moon.mp3", gate: "gate.m4a", castle: "castle-ambience.mp3", key: "key-door.mp3", attic: "attic-door.mp3", power: "cut-power.mp3", evals: "evals-music.mp3", diary: "diary.mp3", glass: "glass-creature.mp3", steps: "watcher-footsteps.mp3",
    pull: "book-pull.mp3", float: "book-float.mp3", page: "page-flip.mp3", rattle: "door-rattle.mp3", chalk: "chalk.mp3", wkey: "w-key.mp3", snake1: "snake-1.mp3", snake2: "snake-2.m4a",
    overload: "context-overload.mp3", sandbox: "sandbox-float.mp3", nest: "nest.mp3", beam: "watcher-beam.mp3", trunk: "trunk.mp3", curtain: "shower-curtain.mp3", code: "code.mp3", typing: "typing.mp3", mirror: "mirror.mp3", reveal: "cb-reveal.m4a", clink: "glass-clink.mp3", drips: "dripping.mp3", cwind: "creepy-wind.mp3", brick: "brick-drag.mp3", aknock: "attic-knock.mp3", breath: "breathing-blink.mp3", vanish: "cb-disappear.mp3", chains: "chains.mp3", thud: "thud.mp3", sfire: "strong-fire.mp3", walk: "forest-walk.mp3", twigs: "branches.mp3" };
  const AV = (() => { try { const m = (document.currentScript && document.currentScript.src || "").match(/\?v=\d+/); return m ? m[0] : ""; } catch (e) { return ""; } })();
  const live = new Set(), preload = {};
  Object.keys(CLIPS).forEach((k) => { const a = new Audio("audio/" + CLIPS[k] + AV); a.preload = "auto"; preload[k] = a; });
  function clip(name, { vol = 0.7, at = 0, loop = false, from = 0, to = 0 } = {}) {
    const a = new Audio("audio/" + CLIPS[name] + AV); a.volume = vol; a.loop = loop; a.muted = muted; a._vol = vol;
    live.add(a); a.addEventListener("ended", () => live.delete(a));
    const go = () => {
      if (from) { try { a.currentTime = from; } catch (e) {} a.addEventListener("loadedmetadata", () => { if (a.currentTime < from - 0.05) a.currentTime = from; }, { once: true }); }
      const p = a.play(); if (p && p.catch) p.catch(() => live.delete(a));
      if (to) { let cut = false; a.addEventListener("timeupdate", () => { if (!cut && a.currentTime >= to - 0.3) { cut = true; fadeClip(a, 0.2); } }); }
    };
    if (at > 0) setTimeout(go, at * 1000); else go();
    return a;
  }
  function fadeClip(a, secs = 1.5) {
    if (!a) return; const v0 = a.volume, t0 = performance.now();
    const iv = setInterval(() => { const k = (performance.now() - t0) / (secs * 1000); if (k >= 1) { clearInterval(iv); a.pause(); live.delete(a); } else a.volume = v0 * (1 - k); }, 40);
  }

  function start() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return true; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { ac = null; return false; }
  }
  const now = () => ac.currentTime;
  // a burst of filtered noise: the basis of crackles, thuds, footsteps and wind
  function noise({ at = 0, dur = 0.1, freq = 2000, q = 1, type = "bandpass", vol = 0.3, attack = 0.002, sweep = 0, dest = null }) {
    if (!ac) return;
    const t = now() + at, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true; src.loopStart = Math.random(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || master); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  // a pitched tone with an envelope
  function tone({ at = 0, dur = 0.3, freq = 440, to = 0, type = "sine", vol = 0.2, attack = 0.005 }) {
    if (!ac) return;
    const t = now() + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  const S = {
    // a twig snapping: no pitch at all, just wood fibres giving way. A hard broadband crack, two or three
    // smaller cracks tumbling after it, and a short dry tearing tail.
    stick(at = 0, vol = 1) {
      if (!start()) return;
      const body = 900 + Math.random() * 700;
      noise({ at, dur: 0.035, freq: body * 2.2, q: 0.5, vol: 0.55 * vol, attack: 0.0008 });                              // the crack, wide and woody
      noise({ at, dur: 0.07, freq: body * 0.55, q: 0.7, vol: 0.4 * vol, attack: 0.001 });                                // the thickness of the stick
      let t = at + 0.012;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) { t += 0.012 + Math.random() * 0.03; noise({ at: t, dur: 0.02 + Math.random() * 0.02, freq: body * (1.2 + Math.random() * 1.4), q: 0.8, vol: (0.28 - i * 0.05) * vol, attack: 0.0008 }); }   // fibres splitting
      noise({ at: at + 0.02, dur: 0.16, freq: 2600, q: 0.4, type: "highpass", vol: 0.05 * vol, attack: 0.01 });          // dry tail
    },
    // a footstep in leaf litter: a soft thump with a papery crunch on top
    leafStep(at = 0, vol = 1) {
      if (!start()) return;
      noise({ at, dur: 0.11, freq: 150, q: 0.7, type: "lowpass", vol: 0.22 * vol, attack: 0.008 });
      for (let i = 0; i < 7; i++) noise({ at: at + 0.01 + Math.random() * 0.14, dur: 0.015 + Math.random() * 0.03, freq: 2200 + Math.random() * 3200, q: 0.6, vol: (0.03 + Math.random() * 0.06) * vol, attack: 0.002 });
      noise({ at: at + 0.01, dur: 0.17, freq: 1500, q: 0.5, vol: 0.05 * vol, attack: 0.03 });
    },
    // walking through the wood: a footstep on every beat, and on some of them a twig goes
    branches(steps = [0], snaps = []) { steps.forEach((t, i) => { S.leafStep(t); if (snaps.includes(i)) { S.stick(t + 0.03); if (Math.random() < 0.4) S.stick(t + 0.13 + Math.random() * 0.06, 0.55); } }); },
    // a soft, distant crow: two or three hoarse caws
    caw(times = 2, at = 0) {
      if (!start()) return;
      for (let i = 0; i < times; i++) {
        const t = now() + at + i * 0.46 + Math.random() * 0.05, dur = 0.26 + Math.random() * 0.06;
        const o = ac.createOscillator(), rasp = ac.createOscillator(), rg = ac.createGain(), am = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
        o.type = "sawtooth"; o.frequency.setValueAtTime(560, t); o.frequency.linearRampToValueAtTime(610, t + dur * 0.25); o.frequency.linearRampToValueAtTime(400, t + dur);
        rasp.type = "square"; rasp.frequency.value = 62 + Math.random() * 14; rg.gain.value = 0.5; am.gain.value = 0.5; rasp.connect(rg).connect(am.gain);   // the hoarse rattle in the voice
        f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 2.2;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04); g.gain.setValueAtTime(0.22, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(am).connect(f).connect(g).connect(master); o.start(t); rasp.start(t); o.stop(t + dur + 0.05); rasp.stop(t + dur + 0.05);
      }
    },
    // a ghostly wind: thin, whistling gusts that rise and fall in pitch like a far-off moan, looping until stopped.
    // (Narrow, resonant bands of noise sound like wind in a gap; a wide band sounds like surf.)
    wind(on) {
      if (!start()) return;
      if (!on) { if (windNode) { const w = windNode; w.out.gain.setTargetAtTime(0.0001, now(), 0.8); setTimeout(() => { for (const n of w.nodes) { try { n.stop(); } catch (e) {} } }, 3500); windNode = null; } return; }
      if (windNode) return;
      const out = ac.createGain(), nodes = []; out.gain.setValueAtTime(0.0001, now()); out.gain.exponentialRampToValueAtTime(1, now() + 3); out.connect(master);
      const lfo = (rate, depth, target) => { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = rate; lg.gain.value = depth; l.connect(lg).connect(target); l.start(); nodes.push(l); };
      for (const [centre, q, vol, r1, d1, r2, d2, ar] of [[430, 11, 0.05, 0.071, 150, 0.23, 60, 0.09], [760, 14, 0.028, 0.053, 260, 0.31, 90, 0.137], [1250, 18, 0.012, 0.037, 380, 0.19, 120, 0.061]]) {
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = noiseBuf; src.loop = true; f.type = "bandpass"; f.frequency.value = centre; f.Q.value = q; g.gain.value = vol;
        lfo(r1, d1, f.frequency); lfo(r2, d2, f.frequency);                  // the whistle wanders up and down
        lfo(ar, vol * 0.85, g.gain);                                          // and each voice swells and dies away by itself
        src.connect(f).connect(g).connect(out); src.start(0, Math.random() * 1.5); nodes.push(src);
      }
      windNode = { out, nodes };
    },
    // a slow wooden or iron creak (doors, gates)
    creak(dur = 1.1, at = 0, base = 150) {
      if (!start()) return;
      const t = now() + at, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.7, t + dur * 0.6); o.frequency.linearRampToValueAtTime(base * 1.2, t + dur);
      lfo.frequency.value = 23; lg.gain.value = base * 0.18; lfo.connect(lg).connect(o.frequency);
      f.type = "bandpass"; f.frequency.value = base * 5; f.Q.value = 7;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },
    // a key turning in a door lock: keys jingle, the key slides home, then two crisp mechanical clacks as
    // the bolt is thrown (a lighter one as the cylinder starts, a heavier one as the bolt lands).
    lock(at = 0) {
      if (!start()) return;
      const ping = (t, f, v, d = 0.07) => { tone({ at: t, dur: d, freq: f, type: "sine", vol: v, attack: 0.0008 }); tone({ at: t, dur: d * 0.6, freq: f * 2.76, type: "sine", vol: v * 0.4, attack: 0.0008 }); };
      for (let i = 0; i < 4; i++) noise({ at: at + i * 0.04 + Math.random() * 0.02, dur: 0.008, freq: 2400 + Math.random() * 1200, q: 1.2, vol: 0.07 + Math.random() * 0.05, attack: 0.0005 });   // keys knocking together, dry
      noise({ at: at + 0.2, dur: 0.09, freq: 2200, q: 0.8, vol: 0.07, attack: 0.01 });                  // the key sliding in
      noise({ at: at + 0.29, dur: 0.012, freq: 2600, q: 1, vol: 0.28, attack: 0.0005 });                                  // seated
      const clack = (t, weight) => {                                                                                    // one throw of the mechanism
        noise({ at: t, dur: 0.01, freq: 2400, q: 0.7, vol: 0.5 * weight, attack: 0.0004 });            // the sharp front edge
        noise({ at: t + 0.002, dur: 0.035, freq: 1700, q: 1.4, vol: 0.5 * weight, attack: 0.0005 });                      // metal on metal
        noise({ at: t + 0.004, dur: 0.07 + 0.05 * weight, freq: 300, q: 1, type: "lowpass", vol: 0.5 * weight, attack: 0.001 });   // the door taking it
      };
      noise({ at: at + 0.4, dur: 0.14, freq: 1100, q: 2.2, vol: 0.05, attack: 0.03 });                                    // the cylinder rotating
      clack(at + 0.46, 0.6); clack(at + 0.66, 1.0);
    },
    // a drop of water landing in a basin: a small rising "plink" and its faint echo. No two are alike:
    // pitch, how far it rises, loudness, length and the echo all vary, and now and then a second drop follows.
    drip(follow = true) {
      if (!start()) return;
      const f0 = 620 + Math.random() * 520, rise = 1.5 + Math.random() * 0.8, loud = 0.06 + Math.random() * 0.08, len = 0.08 + Math.random() * 0.07;
      const gap = 0.15 + Math.random() * 0.1, echoes = Math.random() < 0.3 ? 1 : 2;
      const hits = [[0, loud], [gap, loud * 0.28], [gap * 1.9, loud * 0.1]].slice(0, 1 + echoes);
      for (const [at, vol] of hits) { tone({ at, dur: len, freq: f0, to: f0 * rise, vol, attack: 0.002 }); if (Math.random() < 0.75) tone({ at, dur: len * 0.45, freq: f0 * (2.3 + Math.random() * 0.6), to: f0 * 3.3, vol: vol * 0.3, attack: 0.001 }); }
      noise({ dur: 0.01 + Math.random() * 0.01, freq: 2800 + Math.random() * 1600, q: 2, vol: 0.015 + Math.random() * 0.03, attack: 0.0005 });   // the tiny splash
      if (follow && Math.random() < 0.22) setTimeout(() => S.drip(false), 140 + Math.random() * 200);                    // sometimes two drops close together
    },
    // a heavy iron gate swinging open on rusty hinges: one long, smooth creak that climbs and sags as it
    // swings, a low groan underneath, and a dull stop at the end. No rattle.
    gate(dur = 1.8, at = 0) {
      if (!start()) return;
      const t = now() + at;
      for (const [base, peak, fq, q, vol, vib] of [[205, 318, 1150, 9, 0.1, 3.1], [311, 452, 1900, 12, 0.045, 4.3], [58, 71, 260, 2.5, 0.11, 1.7]]) {   // creak, its overtone, the groan
        const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), wob = ac.createOscillator(), wg = ac.createGain(), sw = ac.createOscillator(), sg = ac.createGain();
        o.type = "sawtooth"; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(peak, t + dur * 0.55); o.frequency.exponentialRampToValueAtTime(base * 1.08, t + dur);
        wob.frequency.value = vib; wg.gain.value = base * 0.025; wob.connect(wg).connect(o.frequency);                 // a slow waver, as the hinge binds and frees
        f.type = "bandpass"; f.frequency.setValueAtTime(fq, t); f.frequency.linearRampToValueAtTime(fq * 1.35, t + dur * 0.55); f.frequency.linearRampToValueAtTime(fq, t + dur); f.Q.value = q;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        sw.frequency.value = 1.3; sg.gain.value = vol * 0.35; sw.connect(sg).connect(g.gain);                           // gentle swell, not a judder
        o.connect(f).connect(g).connect(master);
        for (const n of [o, wob, sw]) { n.start(t); n.stop(t + dur + 0.05); }
      }
      noise({ at: at + dur - 0.02, dur: 0.16, freq: 200, q: 0.8, type: "lowpass", vol: 0.3, attack: 0.004 });          // the gate coming to rest
      tone({ at: at + dur - 0.02, dur: 0.5, freq: 96, to: 60, vol: 0.2 }); tone({ at: at + dur, dur: 0.6, freq: 610, type: "triangle", vol: 0.03 });
    },
    // an eyelid closing: a very soft, low puff
    blink() { if (!start()) return; noise({ dur: 0.09, freq: 420, q: 0.7, type: "lowpass", vol: 0.09, attack: 0.02 }); tone({ dur: 0.07, freq: 150, to: 110, vol: 0.03 }); },
    // a fire in the grate: a low, soft roar that loops, with small pops and crackles scattered over it.
    // Everything goes through one volume control, so leaving the room cuts all of it at once.
    fire(on) {
      if (!start()) return;
      if (!on) { if (fireNode) { const fN = fireNode; fireNode = null; clearInterval(fN.timer); fN.bus.gain.cancelScheduledValues(now()); fN.bus.gain.setValueAtTime(fN.bus.gain.value, now()); fN.bus.gain.linearRampToValueAtTime(0, now() + 0.04); setTimeout(() => { try { fN.src.stop(); fN.l.stop(); fN.bus.disconnect(); } catch (e) {} }, 200); } return; }
      if (fireNode) return;
      const bus = ac.createGain(); bus.gain.setValueAtTime(0, now()); bus.gain.linearRampToValueAtTime(3.5, now() + 0.6); bus.connect(master);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
      src.buffer = noiseBuf; src.loop = true; f.type = "lowpass"; f.frequency.value = 340; f.Q.value = 0.4; g.gain.value = 0.2;
      l.frequency.value = 0.37; lg.gain.value = 0.06; l.connect(lg).connect(g.gain); l.start();                         // the flames breathing
      src.connect(f).connect(g).connect(bus); src.start(0, Math.random());
      const timer = setInterval(() => {                                                                              // pops: mostly tiny, now and then a proper crack
        const n = Math.random() < 0.25 ? 3 : 1;
        for (let i = 0; i < n; i++) { const big = Math.random() < 0.12; noise({ dest: bus, at: Math.random() * 0.3, dur: big ? 0.05 : 0.012 + Math.random() * 0.02, freq: big ? 900 + Math.random() * 600 : 1800 + Math.random() * 3000, q: 0.7, vol: big ? 0.2 : 0.06 + Math.random() * 0.08, attack: 0.0008 }); }
      }, 260);
      fireNode = { src, l, bus, timer };
    },
    thud(at = 0, vol = 0.5) { if (!start()) return; tone({ at, dur: 0.28, freq: 110, to: 38, vol }); noise({ at, dur: 0.12, freq: 220, q: 0.7, type: "lowpass", vol: vol * 0.5 }); },
    knock(times = 3, at = 0) { if (!start()) return; for (let i = 0; i < times; i++) { const t = at + i * 0.62; tone({ at: t, dur: 0.16, freq: 150, to: 62, vol: 0.5 }); noise({ at: t, dur: 0.05, freq: 700, q: 1.5, vol: 0.22 }); } },
    // a muffled footfall on old floorboards: a soft heel thump, a duller body under it, and a faint scuff of sole and robe.
    // Left and right feet differ a little, and every step varies slightly so it never sounds like a metronome.
    // a tiny bird: two or three quick rising whistles, a little different for each box
    chirp(id = "") {
      if (!start()) return;
      let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const base = 2600 + (h % 900), n = 2 + (h % 2);
      for (let i = 0; i < n; i++) tone({ at: i * 0.11, dur: 0.07, freq: base, to: base * 1.45, type: "sine", vol: 0.12, attack: 0.004 });
    },
    // footsteps by floor: carpet is soft and dull, tile clicks, straw rustles, the attic boards creak now and then
    floorStep(up = false) {
      if (!start()) return;
      let floor = "wood";
      try { const a = GAME.state().area, r = CONTENT.map.rooms.find((x) => x.id === a); if (r) floor = r.floor; } catch (e) {}
      const v = 0.85 + Math.random() * 0.3;
      if (floor === "runner" || floor === "books") {
        noise({ dur: 0.07, freq: 260, q: 0.8, type: "lowpass", vol: 1.0 * v, attack: 0.006 });
        noise({ at: 0.02, dur: 0.06, freq: 700, q: 0.6, vol: 0.08 * v, attack: 0.01 });
      } else if (floor === "tile") {
        S.step(up, 0.7);
        noise({ dur: 0.02, freq: 2600, q: 1.6, vol: 0.35 * v, attack: 0.0006 });
        tone({ at: 0.004, dur: 0.06, freq: 1900 + Math.random() * 300, type: "sine", vol: 0.025 * v, attack: 0.001 });
      } else if (floor === "straw") {
        S.step(up, 0.6);
        for (let i = 0; i < 4; i++) noise({ at: i * 0.018 + Math.random() * 0.01, dur: 0.02, freq: 3400 + Math.random() * 2000, q: 0.9, vol: 0.12 * v, attack: 0.001 });
      } else if (floor === "attic") {
        S.step(up, 1.05);
        if (Math.random() < 0.12) S.creak(0.5, 0.03, 120 + Math.random() * 40);
      } else S.step(up);
    },
    step(up = false, k = 1) {
      if (!start()) return;
      const v = (0.85 + Math.random() * 0.3) * k, f = (up ? 1.12 : 1) * (0.92 + Math.random() * 0.16);
      noise({ dur: 0.05, freq: 420 * f, q: 0.9, type: "lowpass", vol: 1.8 * v, attack: 0.003 });               // heel
      tone({ dur: 0.09, freq: 95 * f, to: 58, type: "sine", vol: 0.9 * v, attack: 0.004 });                    // the board taking the weight
      noise({ at: 0.035, dur: 0.07, freq: 900 * f, q: 0.6, vol: 0.28 * v, attack: 0.012 });                      // sole rolling forward
    },
    // a heavy footfall on a stair tread: a short knock of the sole, then a deep, weighty thud that hangs for a moment
    treadStep(k = 1) {
      if (!start()) return;
      const f = 0.92 + Math.random() * 0.16;
      noise({ dur: 0.03, freq: 1000 * f, q: 1.1, vol: 0.7 * k, attack: 0.001 });                                 // the knock of the sole
      noise({ dur: 0.16, freq: 300 * f, q: 0.9, type: "lowpass", vol: 2.4 * k, attack: 0.004 });                 // the weight coming down
      tone({ dur: 0.22, freq: 92 * f, to: 44, type: "sine", vol: 1.1 * k, attack: 0.005 });                      // the tread taking it
      tone({ dur: 0.14, freq: 180 * f, to: 90, type: "triangle", vol: 0.35 * k, attack: 0.004 });                // a little body, so it carries on small speakers
    },
    // one heavy footfall per tread, no echo
    stairs(n = 9, gap = 0.42) { if (!start()) return; for (let i = 0; i < n; i++) setTimeout(() => S.treadStep(1), (0.45 + i * gap) * 1000); },
    blip() { if (!start()) return; tone({ dur: 0.045, freq: 620, type: "triangle", vol: 0.045 }); },
    select() { if (!start()) return; tone({ dur: 0.07, freq: 520, type: "triangle", vol: 0.08 }); tone({ at: 0.06, dur: 0.1, freq: 780, type: "triangle", vol: 0.08 }); },
    tick() { if (!start()) return; noise({ dur: 0.025, freq: 3200, q: 4, vol: 0.07 }); tone({ dur: 0.03, freq: 1400, type: "square", vol: 0.02 }); },     // a tool call
    // a clue found: a small rising chime
    chime() { if (!start()) return; [523, 659, 784, 1047].forEach((f, i) => { tone({ at: i * 0.09, dur: 0.9, freq: f, vol: 0.13 }); tone({ at: i * 0.09, dur: 0.5, freq: f * 2.01, vol: 0.04 }); }); },
    card() { if (!start()) return; tone({ dur: 0.5, freq: 880, vol: 0.07 }); tone({ at: 0.1, dur: 0.6, freq: 1320, vol: 0.05 }); },
    wrong() { if (!start()) return; tone({ dur: 0.18, freq: 150, type: "sawtooth", vol: 0.1 }); tone({ at: 0.16, dur: 0.24, freq: 110, type: "sawtooth", vol: 0.1 }); },
    // the power cut: a lever clunk, an electric crackle, then the house hum winding down
    powerCut(leverAt = 3.6) { clip("power", { vol: 0.85, at: Math.max(0, leverAt - 1.3) }); },
    // one long gust sweeping past: it swells, rises in pitch, then falls away, with a breathier layer on top
    gust(at = 0, dur = 2.8, vol = 0.34) {
      if (!start()) return;
      const t = now() + at;
      [[260, 1500, 380, 1.6, 1], [900, 3200, 1100, 0.8, 0.45]].forEach(([f0, f1, f2, q, k]) => {
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = noiseBuf; src.loop = true; f.type = "bandpass"; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * k, t + dur * 0.42); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(master); src.start(t, Math.random()); src.stop(t + dur + 0.1);
      });
    },
    whoosh(at = 0, dur = 0.9) { if (!start()) return; noise({ at, dur, freq: 300, sweep: 2400, q: 0.9, vol: 0.2, attack: dur * 0.5 }); },
    fanfare() { if (!start()) return; [392, 523, 659, 784, 1047].forEach((f, i) => { tone({ at: i * 0.16, dur: 1.4, freq: f, type: "triangle", vol: 0.12 }); }); },
    setMuted(m) { muted = m; try { localStorage.setItem("ooc-muted", m ? "1" : "0"); } catch (e) {} if (master) master.gain.setTargetAtTime(m ? 0 : VOL, now(), 0.05); live.forEach((a) => { a.muted = m; }); },
    clip, fadeClip,
    bookPull() { clip("pull", { vol: 0.8, from: 1.85, to: 3.4 }); clip("float", { vol: 0.75, at: 0.9, to: 3.4 }); },   // tugged off the shelf, then drifting to the table
    pages() { clip("page", { vol: 0.8, from: 1.2, to: 3.6 }); },                                                       // the diary falling open
    rattle() { clip("rattle", { vol: 1, from: 2.3 }); },                                                                // the locked front door
    chalk(n = 0) { const seg = [[0, 2.3], [2.3, 4.7], [4.7, 7.1]][n % 3]; clip("chalk", { vol: 0.7, from: seg[0], to: seg[1] }); },
    wkey() { clip("wkey", { vol: 1 }); },
    curtain() { clip("curtain", { vol: 0.9 }); },
    code(on) { if (on && !S._code) S._code = clip("code", { vol: 0.8 }); else if (!on && S._code) { fadeClip(S._code, 1.2); S._code = null; } },   // CB's script running in the sandbox
    typing() { clip("typing", { vol: 0.8 }); },
    mirror() { clip("mirror", { vol: 0.8 }); },
    clink() { clip("clink", { vol: 0.8, to: 2.0 }); },                                                                  // picking up the evals kit: the first two clinks only
    drips(on) { if (on && !S._drips) S._drips = clip("drips", { vol: 0.7, loop: true }); else if (!on && S._drips) { fadeClip(S._drips, 0.05); S._drips = null; } },   // recorded drips under the synthesised ones
    strongFire(on) { if (on && !S._sfire) S._sfire = clip("sfire", { vol: 0.85, loop: true }); else if (!on && S._sfire) { fadeClip(S._sfire, 1.0); S._sfire = null; } },
    // the attic door: the chains fall away (0:09 to 0:12 of the recording), then the door creaks
    atticOpen() { clip("chains", { vol: 0.9, from: 9, to: 12 }); S._atticT = setTimeout(() => { S._attic = clip("attic", { vol: 0.8, to: 3.7 }); }, 3000); },
    atticKnock() { clip("aknock", { vol: 0.95 }); },                                                                   // knocking from behind the attic door
    reveal() { clip("reveal", { vol: 0.9 }); },                                                                        // CB turning around
    trunk() { clip("trunk", { vol: 0.8 }); clip("sandbox", { vol: 1, at: 0.5 }); },                                   // the lid, then the sandbox rising out of it
    overload(on) { if (on && !S._over) S._over = clip("overload", { vol: 0.6, from: 1.2 }); else if (!on && S._over) { fadeClip(S._over, 0.8); S._over = null; } },   // the context window filling up
    nest(on) { if (on && !S._nest) S._nest = clip("nest", { vol: 0.55, loop: true }); else if (!on && S._nest) { fadeClip(S._nest, 0.05); S._nest = null; } },
    snake() { clip("snake1", { vol: 0.9 }); clip("snake2", { vol: 0.9, at: 2.4 }); },
    // the diary recording has two halves with a gap at about 5.8s; this plays only the first
    diary() { const a = clip("diary", { vol: 0.8 }); setTimeout(() => fadeClip(a, 0.5), 5500); },
    get muted() { return muted; },
    start,
  };

  // ------------------------------------------------------------------ hooks
  const wrap = (obj, key, before) => { const orig = obj && obj[key]; if (typeof orig !== "function") return; obj[key] = function (...a) { try { before(...a); } catch (e) {} return orig.apply(this, a); }; };

  // Title: wind from the first key press, branches crackling as each layer of brambles is pushed aside,
  // then the gates creaking open.
  // crows over the title card, before anything moves. Browsers hold all sound until the first click or
  // key press, so this tries at load and otherwise begins the moment the page is first touched.
  let nextCaw = 0;
  const titleIdle = () => TITLE.state.stage === 0 && !TITLE.state.busy && GAME._S.mode !== "play";
  setInterval(() => {
    if (!titleIdle()) return;
    if (!ac) { try { start(); } catch (e) {} }
    if (!ac || ac.state !== "running") return;
    const t = performance.now();
    if (t < nextCaw) return;
    S.caw(Math.random() < 0.5 ? 2 : 1, 0); if (Math.random() < 0.35) S.caw(1, 0.9 + Math.random() * 0.5);
    nextCaw = t + 2600 + Math.random() * 3200;
  }, 200);
  addEventListener("pointerdown", () => { if (titleIdle()) nextCaw = 0; }, true);

  // the moon waning to a crescent: a single gust of wind sweeps through as it goes
  let moonWas = 0;
  setInterval(() => { const c = TITLE.state.crescent || 0; if (moonWas === 0 && c > 0 && c < 0.5) clip("moon", { vol: 0.7 }); moonWas = c; }, 50);

  S.caw = (times = 1, at = 0) => clip("crow", { vol: 0.75, at });
  let castle = null;
  // pushing through the wood: the recorded forest walk and the snapping branches, played together
  let forest = null;
  S.forest = (on) => { if (on && !forest) forest = [clip("walk", { vol: 0.8, at: 1.2 }), clip("twigs", { vol: 0.7, at: 1.2, from: 0.4 })]; else if (!on && forest) { forest.forEach((a) => fadeClip(a, 0.7)); forest = null; } };
  S.castle = (on, fadeSecs = 1.8) => { if (on && !castle) { castle = clip("castle", { vol: 0.6, loop: true }); S.wind(false); S.forest(false); } else if (!on && castle) { fadeClip(castle, fadeSecs); castle = null; } };
  // once the trees have parted and the manor is in view, its own night sounds take over from the wind
  let gateClip = null;
  setInterval(() => {
    const T = TITLE.state;
    if (forest && T.stage === 1 && (T.bclear || 0) > 0.12) S.forest(false);                 // the walking stops as the last of the branches is swept aside
    if (!castle && T.stage === 1 && (T.part || 0) > 0.55) S.castle(true);
    if ((T.stage === 3 && !T.busy) || GAME._S.mode === "play") {                              // inside the game: nothing from the title carries over
      if (gateClip) { fadeClip(gateClip, 0.2); gateClip = null; }
      S.castle(false, 0.3); S.forest(false);
    }
  }, 50);

  wrap(TITLE, "advance", () => {
    const st = TITLE.state;
    if (st.busy) return;
    if (st.stage === 0) { S.wind(true); S.caw(1, 0.05); S.forest(true); S.caw(1, 3.4); }   // footsteps in the wood, twigs going, a crow somewhere
    else if (st.stage === 1) S.blip();
    else if (st.stage === 2) { gateClip = clip("gate", { vol: 0.9, to: 3.0 }); /* first part only, about three seconds */ S.castle(false, 1.8); setTimeout(() => S.wind(false), 2200); }
  });


  // waking up: a soft puff each time your eyes close. And wherever there is a fire in the room (the
  // bedroom you wake in, and the library), it crackles quietly.
  let lastEyes = null, eyesWereOpen = false, nextDrip = 0;
  setInterval(() => {
    const I = GAME._S.intro; if (!ac) return;
    const playing = GAME._S.mode === "play", e = I.eyes;
    if (playing && e !== null && lastEyes !== null) { if (e > 0.25) eyesWereOpen = true; if (eyesWereOpen && e < lastEyes && e < 0.12) { eyesWereOpen = false; } }
    lastEyes = e;
    const here = GAME.state().area, byFire = playing && performance.now() > fireHold && (here === "bedroom" || here === "library");
    S.nest(playing && performance.now() > fireHold && here === "nest");
    S.drips(playing && performance.now() > fireHold && here === "bathroom");
    if (byFire !== !!fireNode) S.fire(byFire);
    // the bathroom: a tap dripping, slowly and not quite regularly
    if (playing && here === "bathroom") { if (performance.now() > nextDrip) { S.drip(); nextDrip = performance.now() + 2200 + Math.random() * 3200; } } else nextDrip = performance.now() + 900;
  }, 50);

  wrap(GAME, "setClue", () => S.chime());
  wrap(GAME, "unlockCard", (id) => { if (!GAME._S.cardsUnlocked.includes(id)) S.card(); });
  let evalsClip = null;
  wrap(GAME, "toolCall", (name) => {
    S.tick();
    if (name === "langsmith.trace") { clip("beam", { vol: 1 }); setTimeout(() => { const a = clip("steps", { vol: 1 }); setTimeout(() => fadeClip(a, 0.8), 5600); }, 900); }   // the trail appearing: the first run of footsteps on the recording
    if (name === "run_eval" && (!evalsClip || evalsClip.ended || evalsClip.paused)) evalsClip = clip("evals", { vol: 0.4 });   // a little music while the tests run
  });
  wrap(GAME, "shake", () => S.thud());
  let fireHold = 0;
  wrap(GAME, "doorCutscene", () => { fireHold = performance.now() + 3200; S.fire(false); S.nest(false); S.drips(false); clip("key", { vol: 0.9, at: 0.35 }); });
  wrap(GAME, "say", (lines) => { const txt = JSON.stringify(lines || ""); if (/slow knocks/i.test(txt)) S.knock(3, 0.2); if (/You escaped|We made it/i.test(txt)) S.fanfare(); });
  wrap(GAME, "menu", () => S.blip());
  // the stair cutscene loads a little later than this file
  (function hookStairs() { if (window.STAIRS3D && !STAIRS3D._sfx) { STAIRS3D._sfx = true; wrap(STAIRS3D, "play", (onMiddle, up, opts) => { clearTimeout(S._atticT); if (S._attic) { fadeClip(S._attic, 0.15); S._attic = null; } const isAttic = !!(opts && (opts.attic || opts.blood)); S.stairs(9, 0.42); if (isAttic) clip("cwind", { vol: 0.3 }); }); /* attic stairs: plain steps and a soft wind; house stairs: echoing steps, no wind */ } else if (!window.STAIRS3D) setTimeout(hookStairs, 500); })();

  // keys: M mutes; advancing dialogue and picking options make small sounds
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    start();
    const k = e.key.toLowerCase();
    if (k === "m" && !(e.target && e.target.tagName === "INPUT")) { S.setMuted(!muted); showMute(); return; }
    const ui = GAME.state().ui;
    if (ui && (k === "z" || k === "enter" || k === " ")) { ui.type === "choice" ? S.select() : S.blip(); }
    else if (ui && ui.type === "choice" && (k.startsWith("arrow") || "wasd".includes(k))) S.tick();
  }, true);
  addEventListener("pointerdown", () => start(), true);

  // footsteps while walking
  let stepFlip = false;
  setInterval(() => { const p = GAME._player; if (ac && GAME._S.mode === "play" && p && p.moving && !GAME._S.lock) { stepFlip = !stepFlip; S.floorStep(stepFlip); } }, 310);

  // a small note in the bottom bar
  function showMute() { const el = document.getElementById("hud-sound"); if (el) el.textContent = muted ? "M: sound off" : "M: sound on"; }
  (function addNote() { const bar = document.getElementById("hud-hood"); if (!bar) return; const sp = document.createElement("span"); sp.id = "hud-sound"; sp.style.cssText = "margin-left:14px;color:#6b5a8a;"; bar.appendChild(sp); showMute(); })();

  return S;
})();
