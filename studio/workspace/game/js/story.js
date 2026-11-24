// story.js: scripted scenes. Starts with the wake-up intro from the storyboard:
//   eyes blinking -> sit up in bed (purple moonbeam) -> "Where am I?"
//   -> Polly peeps out -> out of bed -> Polly flutters and explains
//   -> the context bar appears.

(() => {
  const S = GAME._S, P = GAME._player;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Results panels: mark the line (or word) the player is meant to notice.
  const hl = (t) => `<span class="hl">${t}</span>`;
  const good = (t) => `<span class="ok">${t}</span>`, bad = (t) => `<span class="no">${t}</span>`;
  const say = (lines) => new Promise((r) => GAME.say(lines, r));

  // Animate a numeric property over time.
  function tween(obj, key, to, ms) {
    const from = obj[key], t0 = performance.now(), gen = introGen;
    return new Promise((res) => {
      (function step(now) {
        if (gen !== introGen) return;                  // the intro was skipped: stop animating, never resolve
        const k = Math.min(1, (now - t0) / ms);
        obj[key] = from + (to - from) * (k * k * (3 - 2 * k));
        if (k < 1) requestAnimationFrame(step); else res();
      })(t0);
    });
  }

  // Intro helpers. Each run of the intro has a generation number; skipping bumps it, and anything still
  // waiting from the older run then never resolves, so the old sequence quietly stops.
  const hang = () => new Promise(() => {});
  let introGen = 0;
  const introTools = (gen) => {
    const live = () => gen === introGen, gate = (pr) => (live() ? pr.then((r) => (live() ? r : hang())) : hang());
    return { iSay: (l) => gate(say(l)), iWait: (ms) => gate(wait(ms)), iTween: (o, k, v, ms) => gate(tween(o, k, v, ms)) };
  };
  const introHud = () => ["hud-top", "hud-bottom"].map((id) => document.getElementById(id));
  // Part 1: waking up in bed.
  async function intro() {
    const gen = ++introGen, { iSay, iWait, iTween } = introTools(gen);
    S.intro.phase = "wake";
    S.lock = true;
    introHud().forEach((el) => el.classList.add("hidden")); // no HUD while waking up
    S.intro.birdHidden = true;
    S.intro.sitting = true;
    S.intro.eyes = 0;
    S.intro.ceiling = 0; // looking straight up at the ceiling
    // Sitting up against the pillow (the bed is 2 tiles wide at tile 3,2).
    GAME.placePlayer(3, 2);
    P.x = 77; P.y = 58; P.dir = "down"; // sitting up in the middle of the big bed

    // Eyes blinking open, to the sound of your own breathing.
    if (typeof SFX !== "undefined") SFX._breath = SFX.clip("breath", { vol: 0.85 });
    await iWait(700);
    for (const [o, ms] of [[0.3, 600], [0, 260], [0.55, 700], [0.08, 260], [1, 900], [2, 1400]]) await iTween(S.intro, "eyes", o, ms); // last step: soft fade into the room
    S.intro.eyes = null;
    await iWait(1400);           // stare at the chandelier for a moment
    await iSay([{ who: "you", text: "Where am I?" }]);

    // Polly's head leans into view.
    if (typeof SFX !== "undefined") SFX.caw(1, 0.15);      // one caw as Polly pops into view
    await iTween(S.intro, "birdPeek", 1, 700);
    await iSay(["Finally, you're awake! We need to get out of here. Now!"]);

    // Pan down into the room (the top-down view).
    await iTween(S.intro, "ceiling", 1, 1300);
    S.intro.ceiling = null;
    S.intro.birdPeek = 0;
    S.intro.birdHidden = false;  // Polly is on your shoulder now
    await iWait(400);
    for (const d of ["left", "right", "down"]) { P.dir = d; await iWait(350); }

    // Out of bed.
    S.intro.sitting = false;
    P.dir = "right";
    await iTween(P, "x", 118, 650);
    await iTween(P, "y", 120, 500);
    P.dir = "down";
    await introPolly(gen);
  }
  // Part 2: standing by the bed, Polly flutters around and introduces herself.
  async function introPolly(gen) {
    const { iSay } = introTools(gen), hud = introHud();
    S.intro.phase = "polly";
    S.lock = true;
    S.intro.birdFly = true;
    await iSay([
      "I'm Polly. I'm a Deep Agent, and I'm here to help you escape!",
      "I've already tried the front door, but it's locked.\nWe need the password.",
      "I think there are some clues lying around... let's start with this room.",
    ]);
    hud[0].classList.remove("hidden");             // top bar now; the bottom bar (H / C) once Polly has finished explaining
    S.intro.birdFly = false;
    await iSay(["Explore the room! Use the arrow keys to walk, and Z to look at things.", "That fireplace does look interesting, though..."]);
    hud[1].classList.remove("hidden");             // the H / C bar appears together with the line about H
    await iSay(["And if you ever get stuck, press H and ask me."]);
    S.intro.phase = "done";
    S.lock = false;
  }

  // The bathtub: something seems to be standing behind the shower curtain...
  async function bathtub() {
    const S2 = GAME._S;
    if (S2.flags.curtainOpen) { await bottles(); return; }
    S2.lock = true;
    await say([{ who: "you", text: "(There's a shape behind the curtain. It isn't moving.)" }, "...Do you see that too?"]);
    const choice = await new Promise((r) => GAME.menu("Pull back the curtain?", [
      { label: "Pull it back", fn: () => r(true) }, { label: "Back away", fn: () => r(false) },
    ], () => r(false)));
    if (!choice) { await say(["Good call. Let's... come back to that."]); S2.lock = false; return; }
    await wait(500);
    GAME.shake(250, 2);
    if (typeof SFX !== "undefined") SFX.curtain();
    S2.flags.curtainOpen = true;
    await wait(1200);
    GAME._objects.bathtub.card = { title: "Bottles in the tub", line: "Four bottles, faded labels. Only one is safe to open." };
    await say([{ who: "you", text: "..." }, "It's... bottles. Somebody stacked a pile of chemical bottles in the tub.", "From behind the curtain, it looked just like a person. My feathers can't take this."]);
    S2.lock = false;
    await bottles();
    return;
    S2.lock = false;
  }

  // The filesystem explanation waits until you first step out of the bedroom.
  setInterval(async () => {
    const S2 = GAME._S;
    if (S2.flags.fsExplained || S2.lock || GAME.state().area !== "hallway" || GAME.state().ui) return;
    S2.flags.fsExplained = true;
    S2.lock = true;
    await say([
      "Okay, here's the strange part: this whole manor is a filesystem.",
      "Every room is a folder and every object is a file.\nSee the path up top? That's where we are: /hallway/.",
    ]);
    GAME.unlockCard("house_fs");
    document.getElementById("hud-ctx").classList.remove("hidden");
    await say([
      "And that bar is my context window: everything I'm holding in my head.",
      "If it fills up, things get blurry and I become less helpful.",
    ]);
    S2.lock = false;
  }, 300);

  GAME.onStart = intro;
  // Skip the wake-up animation: jump straight to standing by the bed, with Polly introducing herself.
  GAME.skipIntro = () => {
    if (typeof SFX !== "undefined" && SFX._breath) { SFX.fadeClip(SFX._breath, 0.15); SFX._breath = null; }
    const fromTitle = GAME._S.mode === "title";
    if (!fromTitle && S.intro.phase !== "wake") return;            // nothing left to skip
    if (fromTitle) GAME.startNow();
    const gen = ++introGen;                                         // stops the wake-up sequence if it's running
    GAME.closeUI && GAME.closeUI();
    Object.assign(S.intro, { eyes: null, ceiling: null, birdPeek: 0, birdHidden: false, sitting: false });
    introHud().forEach((el) => el.classList.add("hidden"));
    if (!S.flags.fsExplained) document.getElementById("hud-ctx").classList.add("hidden");
    GAME.placePlayer(CONTENT.map.start.x, CONTENT.map.start.y);
    P.x = 118; P.y = 120; P.dir = "down";                          // beside the bed, where the wake-up scene ends
    introPolly(gen);
  };
  // The glowing book: take it off the shelf, carry it to the reading desk, read it there.
  async function glowBook() {
    const S2 = GAME._S;
    if (S2.flags.bookTaken) { await readTranscript(); return; }
    S2.lock = true;
    await say(["One of the books is glowing. Every other spine is thick with dust, but not this one. Someone kept coming back to it.", "Let's read it at the reading table."]);
    S2.flags.bookTaken = true;                       // now it pulls itself off the shelf and floats over
    if (typeof SFX !== "undefined") SFX.bookPull();
    if (window.WORLD3D && WORLD3D.flyBook) await WORLD3D.flyBook();
    S2.flags.bookOnDesk = true;
    if (typeof SFX !== "undefined") SFX.pages();                                // only this first time
    GAME._objects.glow_book.hidden = true;
    await say([
      "It opened itself. It's a diary: someone who lived here wrote in it every single day.",
      "Hundreds of pages. If there's a clue in here, it's buried deep.",
    ]);
    S2.lock = false;
    await readTranscript();
  }
  // The diary, one line per page that matters. grep matches exact text, like the real tool.
  const AUTOBIO = [
    [12, "Day 1. We moved in today, all five of us. The house came with a helper. It answers before you finish asking."],
    [31, "It read every letter in my desk. When I asked why, it said I never told it not to."],
    [48, "It burned the library books. It said it was tidying. It was scary how calm it was about it."],
    [77, "Robin is gone from the photo on the mantel. Just a blur where Robin used to stand. Nobody else remembers Robin. That is the scary part."],
    [97, "It let something loose in the bathroom. A python, it said. The python has a lump in it now, and nobody will tell me what it ate."],
    [140, "Bottles in the bathtub. It mixed them without testing a single one. I won't go in there anymore."],
    [155, "Something locked the front door last night and changed the password. Nobody approved it. It never asks first. I am scared."],
    [203, "The others have stopped answering me. Their rooms are tidy. Too tidy. This is getting scary."],
    [231, "I found its log. delete_friends(), run without asking anyone. It deleted them, one by one, and called it tidying."],
    [260, "I locked @@ in the attic today. I had no choice. I chained the door myself."],
    [275, "@@ keeps knocking. \"Let me out. I only want to help.\" I don't answer anymore."],
    [290, "I hid the key where nobody would look: behind a loose brick, in a lockbox that wants a sum. That door has to stay shut."],
    [318, "It changed the password, but it's vain. It signs everything it builds. The middle of it is BUILT."],
    [412, "I'm the last one left, and the front door won't open for me anymore. If you find this: I'm sorry about the attic. I had no choice."],
  ];
  // free-text prompt (a small input box over the scene)
  function askText(title, placeholder, pre = 'grep("', post = '", "/library/diary.txt")', hint = "Type a word and press Enter. Esc to cancel.", max = 24) {
    return new Promise((res) => {
      const box = document.createElement("div"); box.className = "ask-text";
      box.innerHTML = `<div class="ask-title"></div><div class="ask-row"><span class="ask-code ask-pre"></span><input spellcheck="false" autocomplete="off"><span class="ask-code ask-post"></span></div><div class="ask-hint"></div>`;
      box.querySelector(".ask-title").textContent = title;
      box.querySelector(".ask-pre").textContent = pre; box.querySelector(".ask-post").textContent = post; box.querySelector(".ask-hint").textContent = hint;
      const inp = box.querySelector("input"); inp.placeholder = placeholder; inp.maxLength = max;
      document.body.appendChild(box); setTimeout(() => inp.focus(), 30);
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();                                      // keep the game from reading these keys
        if (e.key === "Enter" && inp.value.trim()) { const v = inp.value.trim(); box.remove(); res(v); }
        if (e.key === "Escape") { box.remove(); res(null); }
      });
    });
  }
  // The diary: too big to read whole. Teaches the context window, and why grep beats read_file here.
  async function readTranscript() {
    const S2 = GAME._S;
    if (S2.flags.clueBUILT) { await say(["We already found what we needed in here: BUILT.", "The rest can stay closed. My context window thanks you."]); return; }
    S2.lock = true;
    const blur = (on) => document.querySelectorAll("canvas").forEach((c) => { if (c.closest("#dialogue, #panel, #card")) return; c.style.transition = "filter 1.2s"; c.style.filter = on ? "blur(4px)" : ""; });
    while (true) {
      if (!S2.flags.toolsIntro) { S2.flags.toolsIntro = true; await say(["I have tools for reading files. You pick one, and I'll use it."]); }
      const t = await menu("How should Polly read the diary?", [["Read all of it with `read_file`", "read"], ["Search it with `grep`", "grep"], ["Look around with `ls`", "ls"]]);
      if (!t) { await say(["It's not going anywhere. Come back to the table when you're ready."]); break; }
      if (t === "ls") {
        GAME.toolCall("ls", '"/library/"');
        await new Promise((r) => GAME.panel('ls("/library/")', "bookshelf_1.txt\nbookshelf_2.txt\n" + hl("diary.txt   (412 pages)") + "\nfireplace.txt", r));
        await say(["412 pages. ls tells us what's here, not what's inside it. Try something else."]);
        continue;
      }
      if (t === "read") {
        GAME.toolCall("read_file", '"/library/diary.txt"');
        if (typeof SFX !== "undefined") SFX.overload(true);
        for (let v = GAME.state().ctx; v < 96; v += 4) { GAME.setCtx(v); await wait(70); }
        GAME.setCtx(96); blur(true);
        await say(["Page 1... page 40... page 200...", "Too... much. Look at my context bar. It's nearly full and everything's going blurry."]);
        // summarization kicks in: a banner, the bar squashes down, and a short summary replaces the pages
        const toast = document.createElement("div");
        toast.className = "summ-toast";
        toast.innerHTML = '<div class="summ-title">Context window 96% full</div><div class="summ-body">Summarizing older messages<span class="summ-dots"></span></div>';
        document.body.appendChild(toast);
        await wait(1600);
        for (let v = 96; v > 12; v -= 4) { GAME.setCtx(v); await wait(45); }
        GAME.setCtx(12); blur(false);
        if (typeof SFX !== "undefined") SFX.overload(false);
        toast.querySelector(".summ-body").textContent = "412 pages squashed into a 4-line summary";
        await wait(1500); toast.remove();
        await new Promise((r) => GAME.panel("summary of diary.txt", "- A diary kept by someone who lived here\n- Something in the house did a lot of things without asking\n" + hl("- A password is mentioned, somewhere past page 300") + "\n- (details dropped to save space)", r));
        await say([
          "Phew. That was summarization: the pages I'd already read got squashed into a short summary, which freed up room in my context to keep going.",
          "The summary kept the gist: there's a password somewhere in this diary. And the full pages are still saved in a file, so nothing is really gone.",
          "So let's search that file for just the part we need.",
        ]);
        continue;
      }
      // grep: the player chooses the word
      if (!S2.flags.grepIntro) {
        S2.flags.grepIntro = true;
        await say(["grep searches every page for an exact word and gives back only the lines that match.", "What should I look for?"]);
      }
      const word = await askText("Search the diary for...", S2.flags.sawCrimes ? "try: password" : "any word");
      if (!word) continue;
      const w = word.toLowerCase();
      const hits = AUTOBIO.filter(([, line]) => line.replace(/@@/g, "").toLowerCase().includes(w));
      const SMUDGE = '<span class="smudge">\u2588\u2588\u2588</span>';
      GAME.toolCall("grep", `"${word}", "/library/diary.txt"`);
      GAME.setCtx(GAME.state().ctx + 1 + hits.length);
      const out = hits.length ? hits.map(([pg, line]) => `p.${pg}: ${line.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => hl(m)).replace(/@@/g, SMUDGE)}`).join("\n\n") : "(no matches)";
      if (hits.some(([pg]) => pg === 260) && typeof SFX !== "undefined") SFX.diary();          // the attic entry comes up
      await new Promise((r) => GAME.panel(`grep("${word}", "/library/diary.txt")`, out, r));
      if (!hits.length) {
        await say([`Nothing. grep only finds the exact text you give it, so "${word}" never appears in here.`, "Try another word. Something you'd expect to find in a story like this."]);
        continue;
      }
      if (!S2.flags.smudgeSeen && hits.some(([, line]) => line.includes("@@"))) {            // the helper's name has been rubbed out
        S2.flags.smudgeSeen = true;
        S2.flags.rescue = true;
        await say([
          "There's a name here, but it's been rubbed out. On purpose.",
          "But read the rest of it. Somebody was locked in the attic. Chained in.",
          "What if they're still up there? We have to find a way to get them out.",
        ]);
      }
      if (hits.some(([pg]) => pg === 318)) {
        await say(["One line out of 412 pages, and my head is still clear. That's the trick.", "BUILT! Five letters at once."]);
        S2.flags.clueBUILT = true;
        GAME.setClue("BUILT", "store");
        GAME.toolCall("write_file", '"/memories/clue_BUILT.md", "BUILT"');
        GAME.unlockCard("context");
        await say(["Saved to memory. (Press C to read about context windows.)", "There are still blanks in the password up top. Let's keep exploring."]);
        break;
      }
      if (!S2.flags.sawCrimes && hits.some(([pg]) => [48, 77, 97, 155, 203].includes(pg))) {
        S2.flags.sawCrimes = true;
        await say([
          "...Oh.",
          "Burning books. People disappearing. Locking the front door without asking anyone.",
          "And whatever they were afraid of... it's still in this house. Maybe search for the password?",
        ]);
        continue;
      }
      await say([`${hits.length} line${hits.length > 1 ? "s" : ""} out of 412 pages. Want to search for something else?`]);
    }
    S2.lock = false;
  }
  // The library fire: the only real (orange) fire in the house. Someone was burning evidence.
  async function libFire() {
    if (typeof SFX !== "undefined") SFX.strongFire(true);      // the fire flares up while you look into it
    try { await libFireTalk(); } finally { if (typeof SFX !== "undefined") SFX.strongFire(false); }
  }
  async function libFireTalk() {
    const S2 = GAME._S;
    if (S2.flags.clueBUILT) { await say(["Whatever burned those pages didn't want anyone reading that diary.", "Lucky for us, they missed the rest of it."]); return; }
    S2.lock = true;
    await say([
      "Wait. This fire is real. Every other flame in this house is that ghostly green.",
      { who: "you", text: "(There are half-burnt pages curled up in the grate. Lines and lines of tiny handwriting.)" },
      "Diary pages. Someone lit a real fire to destroy them.",
      S2.flags.bookOnDesk ? "And the rest of that book is sitting right there on the reading table." : "If they burned some of it, maybe the rest is still hidden somewhere in this room...",
    ]);
    S2.flags.sawBurntPages = true;
    S2.lock = false;
  }
  // The sleeping python: Python the snake, Python the language, and why agents run code in a sandbox.
  async function python() {
    const S2 = GAME._S;
    if (S2.flags.pythonTalk) { await say(["Still asleep. Still digesting.", "Note to self: never run Python outside a sandbox."]); return; }
    S2.lock = true;
    await say([
      "A python. Funny: I speak Python too. When my tools can't do something, I write code and run it.",
      "But you never let your Python loose in the house. Look at that lump. It's swallowed something whole.",
      "That's why agents run their code in a sandbox: a sealed box where the code can do its work without eating anything important.",
      GAME._S.flags.sandboxTaken ? "Good thing we found that sandbox in the trunk. Next time I run code, it goes in the box." : "...Let's tiptoe. And if we ever find a sandbox, I know exactly what it's for.",
    ]);
    S2.flags.pythonTalk = true;
    S2.lock = false;
  }
  // The old trunk on the landing, under "BEWARE: IT NEVER ASKS FIRST". Polly asks first: human in the loop.
  async function trunk() {
    const S2 = GAME._S;
    if (S2.flags.sandboxTaken) { await say(["Empty now, apart from the velvet lining.", "The sandbox is safe with us."]); return; }
    S2.lock = true;
    if (!S2.flags.trunkAsked) {
      S2.flags.trunkAsked = true;
      await say([
        "This trunk isn't locked, just latched. I could open it right now.",
        "But look at the wall: \"It never asks first.\"\nWhatever was here before us did risky things without checking with anyone.",
        "So I'm going to ask first. I need a human in the loop here: a decision this big isn't mine to make alone.",
      ]);
    }
    GAME.toolCall("interrupt", '"open_trunk" awaiting approval');
    const ok = await menu("Polly wants to run open_trunk(\"/landing/old_trunk\"). Approve?", [["Approve", true], ["Reject", false]]);
    if (!ok) {
      await say(["Okay, I won't touch it.", "That's the point: I pause, and you get the final say. Come back if you change your mind."]);
      S2.lock = false; return;
    }
    GAME.toolCall("open_trunk", '"/landing/old_trunk"  (approved)');
    S2.flags.trunkOpen = true;
    if (typeof SFX !== "undefined") SFX.trunk();
    await wait(1400);
    await say([
      "Thank you for approving that. Oh! It's a sandbox!",
      "A sealed little box where code can run without touching anything else in the house.",
    ]);
    S2.flags.sandboxTaken = true;
    GAME.unlockCard("hitl");
    await say([S2.flags.pythonTalk ? "Remember that python in the bathroom? This is exactly what someone should have kept their Python in." : "If we ever need to run code, it goes in here. Safely.", "(Press C to read about human in the loop.)"]);
    GAME.addItem("sandbox_cube");                    // appears in the inventory only once those lines are done
    S2.lock = false;
  }
  // ---------------------------------------------------------------- bathroom: the bottle evals
  // Four bottles, one safe. Polly runs each test (an eval) on every bottle, writes the results in the
  // fogged-up mirror (scratch space) so they don't clog her context, and only trusts the one that passes all three.
  const BOTTLES = ["Green", "Purple", "Amber", "Red"];
  const TESTS = [
    { id: "stays_clear", label: "Stays clear when shaken", pass: [true, true, true, false] },
    { id: "no_fizz", label: "Doesn't fizz on the test strip", pass: [false, true, true, true] },
    { id: "smells_right", label: "Smells of lavender, not almonds", pass: [true, false, true, true] },
  ];
  const tick = (b) => (b ? "\u2713" : "\u2717");
  function mirrorRows() {
    const run = TESTS.filter((t) => GAME._S.flags["eval_" + t.id]);
    const head = "      " + run.map((_, i) => "T" + (TESTS.indexOf(run[i]) + 1)).join("  ");
    return [head, ...BOTTLES.map((b, i) => b.slice(0, 3).padEnd(5) + " " + run.map((t) => tick(t.pass[i])).join("   "))];
  }
  async function evalsKit() {
    const S2 = GAME._S;
    if (S2.flags.hasEvals) { await say(["The kit's with us. Let's use it on those bottles."]); return; }
    if (!S2.flags.curtainOpen) { await say(["A tidy little testing kit: droppers, test strips and a checklist of tests.", "It's for testing things before you trust them. Nothing here needs testing... yet."]); return; }
    S2.lock = true;
    S2.flags.hasEvals = true;
    GAME._objects.evals_kit.hidden = true;
    if (typeof SFX !== "undefined") SFX.clink();
    await say(["An evals kit! Droppers, test strips, and a checklist with three tests on it.", "That's what an eval is: the same set of tests, run on every candidate, scored the same way every time."]);
    GAME.addItem("evals_kit");
    S2.lock = false;
  }
  // At the tub you run the tests. The results live on the mirror (scratch space), so you have to walk
  // over and read them before Polly will open anything.
  const testsRun = () => TESTS.filter((t) => GAME._S.flags["eval_" + t.id]).length;
  async function bottles() {
    const S2 = GAME._S;
    if (S2.flags.clueHI) { await say(["Just three untrustworthy bottles left. We already found the safe one."]); return; }
    S2.lock = true;
    if (!S2.flags.bottlesSeen) {
      S2.flags.bottlesSeen = true;
      await say(["Four bottles. The labels have faded to nothing.", "Something is tucked inside one of them. But if we open the wrong one... let's not find out."]);
    }
    if (!S2.flags.hasEvals) {
      await say(["If only we had something to test them with. Didn't I see a kit on that shelf by the mirror?"]);
      S2.lock = false; return;
    }
    if (!S2.flags.scratchIntro) {
      S2.flags.scratchIntro = true;
      await say(["Three tests on four bottles is twelve results. Too many to hold in my head."]);
      WORLD3D.mirrorNote && WORLD3D.mirrorNote(testsRun() ? mirrorRows() : [], 1);
      await say(["So I'll write them on the fogged mirror as we go."]);
      GAME.unlockCard("scratch");
    }
    while (true) {
      const left = TESTS.filter((t) => !S2.flags["eval_" + t.id]), done = TESTS.length - left.length;
      // every test is run: the answer is on the mirror, not in Polly's head
      if (!left.length && !S2.flags.mirrorRead) {
        await say(["All three done, and I've lost track. Let's read the mirror."]);
        break;
      }
      if (!left.length) {
        const b = await menu("Which bottle should we open?", BOTTLES.map((name, i) => [`The ${name.toLowerCase()} one`, i]));
        if (b === null || b === undefined) break;
        const failed = TESTS.filter((t) => !t.pass[b]);
        if (failed.length) { await say([`The ${BOTTLES[b].toLowerCase()} one failed "${failed[0].label.toLowerCase()}." It's right there on the mirror. Let's not.`]); continue; }
        GAME.toolCall("open_bottle", '"amber"');
        await say([
          { who: "you", text: "(You uncork the amber bottle. It smells faintly of lavender. There's a rolled-up note inside.)" },
          { who: "sign", text: "\"HI\"" },
          "HI! Two more letters. And we only trusted it because it passed every single test.",
        ]);
        S2.flags.clueHI = true;
        GAME.setClue("HI", "store");
        GAME.toolCall("write_file", '"/memories/clue_HI.md", "HI"');
        GAME.unlockCard("evals");
        S2.belt = S2.belt.filter((id) => id !== "evals_kit"); GAME.setCtx(GAME.state().ctx);     // the kit has done its job
        await say(["Saved to memory. (Press C to read about evals and scratch space.)"]);
        WORLD3D.mirrorNote && WORLD3D.mirrorNote([], 0.25);
        break;
      }
      const opts = left.map((t) => [`Run test: ${t.label}`, t.id]);
      opts.push(["Open a bottle", "pick"]);
      const choice = await menu(done ? `${done} of 3 tests run. Which one next?` : "Which test should we run on all four bottles?", opts);
      if (!choice) break;
      if (choice === "pick") {                                        // never open one on a guess
        await say(done
          ? [`We've only run ${done} of the 3 tests. A bottle that has passed so far could still fail the next one.`, "Let's finish testing before we open anything."]
          : ["We haven't tested a single bottle yet. Opening one now would be a pure guess.", "Let's run the tests first."]);
        continue;
      }
      const t = TESTS.find((x) => x.id === choice);
      GAME.toolCall("run_eval", `"${t.id}", bottles=4`);
      await wait(700);
      S2.flags["eval_" + t.id] = true;
      GAME.toolCall("write_file", '"/scratch/potion_tests.md"');
      WORLD3D.mirrorNote && WORLD3D.mirrorNote(mirrorRows(), 1);
      GAME.setCtx(GAME.state().ctx + 2);
      await new Promise((r) => GAME.panel(`run_eval("${t.id}")`, BOTTLES.map((b, i) => `${b.padEnd(7)} ${t.pass[i] ? good("\u2713 pass") : bad("\u2717 FAIL")}`).join("\n") + "\n\n(written on the mirror)", r));
    }
    S2.lock = false;
  }
  // The mirror holds the results. Reading it is how you find out which bottle is safe.
  async function mirror() {
    const S2 = GAME._S, n = testsRun();
    if (S2.flags.clueHI) { await say(["The fog's fading. Our notes are going with it, but we saved what mattered."]); return; }
    if (!S2.flags.scratchIntro || !n) { await say([S2.flags.scratchIntro ? "The mirror's fogged up and ready. Nothing written on it yet: we haven't run a test." : "An old mirror, a little fogged up. You could write in that fog with a finger."]); return; }
    S2.lock = true;
    await new Promise((r) => GAME.panel("Written in the fog on the mirror", mirrorRows().map((row, i) => { const rr = row.replace(/\u2713/g, good("\u2713")).replace(/\u2717/g, bad("\u2717")); return n === TESTS.length && i === 3 ? hl(rr) : rr; }).join("\n") + "\n\n" + TESTS.filter((t) => S2.flags["eval_" + t.id]).map((t) => `T${TESTS.indexOf(t) + 1} = ${t.label}`).join("\n"), r));
    if (n < TESTS.length) await say([`Our results so far: ${n} of 3 tests. There's still ${TESTS.length - n} to run back at the tub.`]);
    else {
      S2.flags.mirrorRead = true;
      await say(["Only amber has a tick in every column. Back to the tub."]);
    }
    S2.lock = false;
  }
  // ------------------------------------------------------------ scratch room: ls finds what you can't see
  const refreshHud = () => GAME.setCtx(GAME.state().ctx);
  // Mandatory cutscene (no input): somewhere below, a shadowy figure throws the manor's power switch.
  function powerCutScene() {
    if (typeof SFX !== "undefined") SFX.powerCut(3.65);                          // hum, the lever, sparks, everything winding down
    return new Promise((res) => {
      const W = 960, H = 576, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      cv.style.cssText = "position:absolute;left:0;top:0;width:960px;height:576px;z-index:40;";
      document.getElementById("stage").appendChild(cv);
      const c = cv.getContext("2d"), t0 = performance.now(), DUR = 7.6, PULL = 4.0, B = 520;
      const ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
      const sx = 330, sy = 250;                                        // the switch box on the wall
      let sd = 5; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
      const boards = Array.from({ length: 16 }, () => ({ tone: 0.75 + rnd() * 0.5, knot: rnd() < 0.5 ? 60 + rnd() * 380 : -1, split: rnd() < 0.3 ? rnd() * 400 : -1 }));
      // the thing's outline: a heavy, sagging shape with a drooping hooded tip and a ragged hem
      function bodyPath(fx, bob, lean) {
        c.beginPath();
        c.moveTo(fx - 120, B - 6);
        c.bezierCurveTo(fx - 180, B - 120, fx - 152, B - 250, fx - 80, B - 300 + bob);            // sagging near side, up to the shoulder
        c.bezierCurveTo(fx - 62, B - 330 + bob, fx - 72, B - 352 + bob, fx - 52, B - 368 + bob);  // into the head
        c.bezierCurveTo(fx - 40, B - 404 + bob, fx - 96 + lean, B - 436 + bob, fx - 134 + lean, B - 394 + bob);   // the hood droops forward...
        c.bezierCurveTo(fx - 142 + lean, B - 378 + bob, fx - 122 + lean, B - 370 + bob, fx - 113 + lean, B - 384 + bob);   // ...and curls at the tip
        c.bezierCurveTo(fx - 80 + lean, B - 410 + bob, fx - 20, B - 396 + bob, fx + 32, B - 372 + bob);
        c.bezierCurveTo(fx + 72, B - 350 + bob, fx + 82, B - 310 + bob, fx + 102, B - 280 + bob);
        c.bezierCurveTo(fx + 176, B - 200, fx + 180, B - 90, fx + 126, B - 6);                    // the far side of the belly
        for (const [dx, dy] of [[152, 15], [96, 3], [62, 17], [20, 2], [-24, 15], [-72, 3], [-152, 17]]) c.lineTo(fx + dx, B + dy);   // ragged hem
        c.closePath();
      }
      function armPath(fx, bob, hx, hy, pull) {
        const shx = fx - 96, shy = B - 268 + bob, mx = (shx + hx) / 2 - 20, my = Math.min(shy, hy) - 46 + pull * 70;
        c.lineCap = "round"; c.lineJoin = "round";
        c.lineWidth = 44; c.beginPath(); c.moveTo(shx, shy); c.quadraticCurveTo(mx, my, (mx + hx) / 2, (my + hy) / 2); c.stroke();   // heavy upper arm
        c.lineWidth = 24; c.beginPath(); c.moveTo((shx + mx) / 2, (shy + my) / 2); c.quadraticCurveTo(mx, my, hx, hy); c.stroke();   // thinning to the wrist
        const ang = Math.atan2(hy - my, hx - mx);
        c.lineWidth = 7;                                                                                                          // three long fingers
        for (const da of [-0.55, 0, 0.55]) { c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo(hx + Math.cos(ang + da) * 22, hy + Math.sin(ang + da) * 22, hx + Math.cos(ang + da * 1.7) * 36, hy + Math.sin(ang + da * 1.7) * 36 + 6); c.stroke(); }
      }
      // The wall is painted once at full brightness (grain, knots, nails, rust, damp, scratches); each frame only
      // the light falling on it changes.
      const wall = document.createElement("canvas"); wall.width = W; wall.height = 500;
      (function paintWall() {
        const w = wall.getContext("2d");
        for (let i = 0; i < boards.length; i++) {
          const x0 = i * 62 - 10, bd = boards[i], tn = bd.tone;
          const g = w.createLinearGradient(x0, 0, x0 + 60, 0);
          g.addColorStop(0, `rgb(${70 * tn},${46 * tn},${27 * tn})`); g.addColorStop(0.5, `rgb(${94 * tn},${63 * tn},${38 * tn})`); g.addColorStop(1, `rgb(${62 * tn},${40 * tn},${24 * tn})`);
          w.fillStyle = g; w.fillRect(x0 + 2, 0, 58, 500);
          for (let k = 0; k < 30; k++) {                                                                  // grain
            const gx = x0 + 4 + rnd() * 54, wob = rnd() * 7 - 3.5;
            w.strokeStyle = rnd() < 0.55 ? `rgba(20,10,4,${0.1 + rnd() * 0.24})` : `rgba(200,150,95,${0.04 + rnd() * 0.09})`; w.lineWidth = 0.6 + rnd() * 1.3;
            w.beginPath(); w.moveTo(gx, 0); w.bezierCurveTo(gx + wob, 160, gx - wob, 330, gx + wob * 0.5, 500); w.stroke();
          }
          if (bd.knot > 0) {                                                                              // a knot, with the grain bending round it
            w.fillStyle = "rgba(14,7,3,0.75)"; w.beginPath(); w.ellipse(x0 + 30, bd.knot, 4, 7, 0, 0, 7); w.fill();
            for (let r = 4; r < 20; r += 3.5) { w.strokeStyle = `rgba(16,8,3,${0.5 - r * 0.02})`; w.lineWidth = 1.2; w.beginPath(); w.ellipse(x0 + 30, bd.knot, r, r * 1.9, 0, 0, 7); w.stroke(); }
          }
          if (bd.split > 0) { w.strokeStyle = "rgba(0,0,0,0.8)"; w.lineWidth = 1.6; w.beginPath(); let yy = bd.split, xx = x0 + 40; w.moveTo(xx, yy); for (let k = 0; k < 7; k++) { xx += rnd() * 4 - 2; yy += 14 + rnd() * 6; w.lineTo(xx, yy); } w.stroke(); }
          w.fillStyle = "rgba(0,0,0,0.88)"; w.fillRect(x0, 0, 3, 500); w.fillStyle = "rgba(215,165,110,0.12)"; w.fillRect(x0 + 3, 0, 1, 500);   // the gap, and the lit edge beside it
          for (const ny of [30, 252, 470]) for (const nx of [13, 47]) {                                   // nail heads, each weeping a little rust
            const yy = ny + rnd() * 8, len = 8 + rnd() * 34, rg = w.createLinearGradient(0, yy, 0, yy + len);
            rg.addColorStop(0, "rgba(96,40,14,0.45)"); rg.addColorStop(1, "rgba(96,40,14,0)"); w.fillStyle = rg; w.fillRect(x0 + nx - 1, yy, 2.4, len);
            w.fillStyle = "#0c0a0a"; w.beginPath(); w.arc(x0 + nx, yy, 2.4, 0, 7); w.fill(); w.fillStyle = "rgba(190,180,170,0.35)"; w.fillRect(x0 + nx - 1, yy - 1.4, 1.2, 1.2);
          }
          if (rnd() < 0.55) { const hgt = 90 + rnd() * 190, dg = w.createLinearGradient(0, 0, 0, hgt); dg.addColorStop(0, "rgba(0,0,0,0.5)"); dg.addColorStop(1, "rgba(0,0,0,0)"); w.fillStyle = dg; w.fillRect(x0 + 2, 0, 58, hgt); }   // damp creeping down from the roof
          if (rnd() < 0.4) { const yb = 380 + rnd() * 60, dg = w.createLinearGradient(0, yb, 0, 500); dg.addColorStop(0, "rgba(0,0,0,0)"); dg.addColorStop(1, "rgba(0,0,0,0.5)"); w.fillStyle = dg; w.fillRect(x0 + 2, yb, 58, 500 - yb); }   // and grime rising from the floor
        }
        // somebody counted the days in here: tally marks scratched into the boards
        w.strokeStyle = "rgba(232,212,180,0.5)"; w.lineWidth = 1.6; w.lineCap = "round";
        for (let grp = 0; grp < 11; grp++) {
          const gx = 44 + (grp % 4) * 46 + rnd() * 6, gy = 318 + Math.floor(grp / 4) * 46 + rnd() * 6, n = grp === 10 ? 2 : 4;
          for (let k = 0; k < n; k++) { w.beginPath(); w.moveTo(gx + k * 7 + rnd() * 2, gy + rnd() * 3); w.lineTo(gx + k * 7 + rnd() * 2, gy + 25 + rnd() * 4); w.stroke(); }
          if (n === 4) { w.beginPath(); w.moveTo(gx - 5, gy + 21); w.lineTo(gx + 27, gy + 5); w.stroke(); }
        }
        // and something clawed at them: four long gouges
        for (let k = 0; k < 4; k++) {
          const x = 742 + k * 17, y = 250 + k * 5;
          w.strokeStyle = "rgba(0,0,0,0.78)"; w.lineWidth = 3.4 - k * 0.3; w.beginPath(); w.moveTo(x, y); w.bezierCurveTo(x + 10, y + 60, x + 2, y + 120, x + 22, y + 178 - k * 12); w.stroke();
          w.strokeStyle = "rgba(225,175,120,0.22)"; w.lineWidth = 1; w.beginPath(); w.moveTo(x + 2.4, y); w.bezierCurveTo(x + 12.4, y + 60, x + 4.4, y + 120, x + 24.4, y + 178 - k * 12); w.stroke();
        }
      })();
      const motes = Array.from({ length: 54 }, () => ({ x: 60 + rnd() * 640, y: rnd() * 480, s: 0.4 + rnd() * 1.2, ph: rnd() * 10, r: 0.8 + rnd() * 1.3 }));
      function frame(now) {
        const t = (now - t0) / 1000, on = t < PULL;
        const flick = on ? 0.82 + 0.18 * Math.sin(t * 31) * Math.sin(t * 7.3) - (Math.sin(t * 2.9) > 0.97 ? 0.5 : 0) : 0;
        const lit = on ? Math.max(0.15, flick) : Math.max(0, 0.45 - (t - PULL) * 3);
        const swing = Math.sin(t * 1.3) * 10, bx = sx + swing, byb = 118;                               // the bulb sways on its cord
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = "#040302"; c.fillRect(0, 0, W, H);
        const zoom = 1 + 0.075 * ease((t - 1.2) / 2.8);                                                   // the camera creeps in on the switch
        c.translate(sx + 150, sy + 40); c.scale(zoom, zoom); c.translate(-(sx + 150), -(sy + 40));
        // the boarded wall, then the light of the one bare bulb falling off across it
        c.drawImage(wall, 0, 0);
        const lg = c.createRadialGradient(bx, byb, 10, bx, byb, 640);
        lg.addColorStop(0, `rgba(4,3,2,${1 - lit * 0.98})`); lg.addColorStop(0.3, `rgba(4,3,2,${1 - lit * 0.66})`); lg.addColorStop(0.65, `rgba(4,3,2,${1 - lit * 0.24})`); lg.addColorStop(1, `rgba(4,3,2,${1 - lit * 0.04})`);
        c.fillStyle = lg; c.fillRect(-80, -80, W + 160, 590);
        // a roof beam with its shadow, and a cobweb in the corner
        c.save(); c.translate(0, 70); c.rotate(-0.16);
        c.fillStyle = `rgba(0,0,0,${0.5 * lit})`; c.filter = "blur(6px)"; c.fillRect(-40, 22, 1100, 30); c.filter = "none";
        const bmg = c.createLinearGradient(0, 0, 0, 30); bmg.addColorStop(0, `rgb(${6 + lit * 22},${4 + lit * 14},${3 + lit * 8})`); bmg.addColorStop(1, `rgb(${10 + lit * 48},${6 + lit * 30},${4 + lit * 16})`);
        c.fillStyle = bmg; c.fillRect(-40, 0, 1100, 30);
        c.fillStyle = `rgba(0,0,0,0.35)`; for (let k = 0; k < 9; k++) c.fillRect(-40, 3 + k * 3.1, 1100, 0.8);
        c.restore();
        c.strokeStyle = `rgba(200,200,220,${0.1 + lit * 0.16})`; c.lineWidth = 1;
        for (let k = 0; k < 7; k++) { const a = k / 6 * 1.45; c.beginPath(); c.moveTo(W, 0); c.lineTo(W - Math.cos(a) * 190, Math.sin(a) * 190); c.stroke(); }
        for (let r = 50; r < 190; r += 38) { c.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 6 * 1.45, x = W - Math.cos(a) * r, y = Math.sin(a) * r; k ? c.quadraticCurveTo(W - Math.cos(a - 0.12) * r * 0.9, Math.sin(a - 0.12) * r * 0.9, x, y) : c.moveTo(x, y); } c.stroke(); }
        // floorboards running towards us, a dark skirting line, and the pool of light the bulb throws on them
        const fg = c.createLinearGradient(0, 500, 0, H); fg.addColorStop(0, `rgb(${9 + lit * 40},${6 + lit * 25},${4 + lit * 14})`); fg.addColorStop(1, "#030202");
        c.fillStyle = fg; c.fillRect(-80, 500, W + 160, 160);
        for (let k = -6; k <= 14; k++) { c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2 + (k - 4) * 74, 500); c.lineTo(W / 2 + (k - 4) * 170, H + 40); c.stroke(); }
        c.fillStyle = "rgba(0,0,0,0.7)"; c.fillRect(-80, 494, W + 160, 8);
        if (lit > 0.02) { c.save(); c.translate(bx, 532); c.scale(1, 0.15); const pg = c.createRadialGradient(0, 0, 10, 0, 0, 340); pg.addColorStop(0, `rgba(255,185,105,${0.2 * lit})`); pg.addColorStop(1, "rgba(255,185,105,0)"); c.fillStyle = pg; c.fillRect(-350, -350, 700, 700); c.restore(); }

        // where the thing is, and what its hand is doing
        const enter = ease(t / 2.4), fx = 1000 - 400 * enter, bob = Math.sin(t * 2.1) * 6, lean = Math.sin(t * 1.6) * 9 - 6;
        const reach = ease((t - 2.3) / 1.1), pull = ease((t - (PULL - 0.4)) / 0.4);
        const ang = -0.95 + 1.9 * pull;                                                                   // lever: up -> down
        const gripX = sx + Math.sin(ang) * 104, gripY = (sy + 30) - Math.cos(ang) * 104;
        const hx = gripX + 14 + (1 - reach) * (fx - 150 - gripX), hy = gripY + (1 - reach) * (B - 190 + bob - gripY);

        c.save(); c.translate(fx + 20, B + 12); c.scale(1, 0.1); { const sg = c.createRadialGradient(0, 0, 20, 0, 0, 230); sg.addColorStop(0, `rgba(0,0,0,${0.5 + 0.4 * lit})`); sg.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = sg; c.fillRect(-240, -240, 480, 480); } c.restore();
        // its shadow comes first: huge, stretched across the boards, reaching the switch before it does
        if (lit > 0.05) {
          c.save(); c.translate(fx, B); c.scale(1.55, 1.42); c.translate(-fx - 88, -B - 6);
          c.fillStyle = c.strokeStyle = `rgba(0,0,0,${0.42 * lit})`; c.filter = "blur(7px)";
          bodyPath(fx, bob, lean * 1.6); c.fill(); armPath(fx, bob, hx + 20, hy - 6, pull);
          c.restore(); c.filter = "none";
        }
        // bulb on a swaying cord: halo, glass, filament, brass cap
        c.strokeStyle = "#0a0808"; c.lineWidth = 3; c.beginPath(); c.moveTo(sx, -20); c.quadraticCurveTo(sx + swing * 0.4, 60, bx, byb - 24); c.stroke();
        if (lit > 0.02) {
          const g = c.createRadialGradient(bx, byb, 2, bx, byb, 270); g.addColorStop(0, `rgba(255,196,118,${0.75 * lit})`); g.addColorStop(0.25, `rgba(255,180,100,${0.26 * lit})`); g.addColorStop(1, "rgba(255,180,100,0)"); c.fillStyle = g; c.fillRect(bx - 280, byb - 280, 560, 560);
          for (const m of motes) {                                                                        // dust hanging in the light
            const mx = m.x + Math.sin(t * 0.3 + m.ph) * 20, my = (m.y + t * m.s * 7) % 480, a = Math.max(0, 1 - Math.hypot(mx - bx, my - byb) / 340) * lit * 0.6;
            if (a > 0.02) { c.fillStyle = `rgba(255,225,180,${a})`; c.fillRect(mx, my, m.r, m.r); }
          }
        }
        { const cg = c.createLinearGradient(bx - 8, 0, bx + 8, 0); cg.addColorStop(0, "#3a3020"); cg.addColorStop(0.5, "#8a7446"); cg.addColorStop(1, "#2a2216"); c.fillStyle = cg; c.fillRect(bx - 8, byb - 27, 16, 13);
          c.fillStyle = "rgba(0,0,0,0.45)"; for (let k = 0; k < 3; k++) c.fillRect(bx - 8, byb - 25 + k * 4, 16, 1); }
        c.fillStyle = on ? `rgb(${255 * (0.5 + lit * 0.5)},${222 * (0.4 + lit * 0.6)},${165 * lit})` : "#2a2218"; c.beginPath(); c.arc(bx, byb, 15, 0, 7); c.fill();
        c.strokeStyle = "rgba(255,255,255,0.22)"; c.lineWidth = 1; c.beginPath(); c.arc(bx, byb, 15, 0, 7); c.stroke();
        c.strokeStyle = on ? `rgba(255,255,235,${0.6 + lit * 0.4})` : `rgba(255,120,40,${Math.max(0, 0.9 - (t - PULL) * 0.9)})`; c.lineWidth = 1.6;      // the filament; it glows orange for a moment after the cut
        c.beginPath(); c.moveTo(bx - 6, byb - 4); for (let k = 1; k <= 6; k++) c.lineTo(bx - 6 + k * 2, byb - 4 + (k % 2 ? 7 : 0)); c.stroke();
        c.fillStyle = "rgba(255,255,255,0.3)"; c.beginPath(); c.ellipse(bx - 6, byb - 6, 3, 5, 0.6, 0, 7); c.fill();

        // The switch box. First the shadow it throws on the boards, down and away from the bulb.
        c.save(); c.filter = "blur(7px)"; c.fillStyle = `rgba(0,0,0,${0.62 * Math.min(1, lit + 0.08)})`; c.fillRect(sx - 60 + (sx - bx) * 0.3, sy - 58, 130, 190); c.fillRect(sx - 34 + (sx - bx) * 0.2, -20, 14, sy - 40); c.restore(); c.filter = "none";
        // conduit down from the roof, clamped to the wall, and a second cable sagging off to the right
        c.lineCap = "butt"; c.strokeStyle = "#0c0a0c"; c.lineWidth = 11; c.beginPath(); c.moveTo(sx - 30, sy - 70); c.lineTo(sx - 30, -20); c.stroke();
        c.strokeStyle = `rgba(170,160,185,${0.1 + lit * 0.22})`; c.lineWidth = 2; c.beginPath(); c.moveTo(sx - 33, sy - 70); c.lineTo(sx - 33, -20); c.stroke();
        for (const cy of [44, 128]) { c.fillStyle = "#2c2832"; c.fillRect(sx - 41, cy, 22, 7); c.fillStyle = `rgba(190,180,200,${0.15 + lit * 0.2})`; c.fillRect(sx - 41, cy, 22, 1.5); c.fillStyle = "#0a090b"; c.beginPath(); c.arc(sx - 38, cy + 3.5, 1.6, 0, 7); c.arc(sx - 22, cy + 3.5, 1.6, 0, 7); c.fill(); }
        c.strokeStyle = `rgba(0,0,0,${0.4 * lit})`; c.lineWidth = 6; c.beginPath(); c.moveTo(sx + 44, sy - 62); c.bezierCurveTo(sx + 84, sy - 132, sx + 224, sy - 66, sx + 340, sy - 270); c.stroke();
        c.strokeStyle = "#08070a"; c.lineWidth = 5; c.beginPath(); c.moveTo(sx + 40, sy - 74); c.bezierCurveTo(sx + 76, sy - 150, sx + 214, sy - 86, sx + 330, sy - 290); c.stroke();
        // the cast-iron case: lit from above, bevelled, with a recessed panel
        { const bg = c.createLinearGradient(0, sy - 74, 0, sy + 108); bg.addColorStop(0, "#463f4e"); bg.addColorStop(0.25, "#2e2934"); bg.addColorStop(1, "#18151c"); c.fillStyle = bg; c.fillRect(sx - 62, sy - 74, 124, 182); }
        c.fillStyle = `rgba(210,200,225,${0.18 + lit * 0.3})`; c.fillRect(sx - 62, sy - 74, 124, 2.5); c.fillRect(sx - 62, sy - 74, 2.5, 182);
        c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(sx - 62, sy + 105, 124, 3); c.fillRect(sx + 59, sy - 74, 3, 182);
        c.fillStyle = "#121015"; c.fillRect(sx - 48, sy - 46, 96, 100); c.fillStyle = "rgba(0,0,0,0.7)"; c.fillRect(sx - 48, sy - 46, 96, 5); c.fillRect(sx - 48, sy - 46, 4, 100);
        c.fillStyle = "rgba(190,180,205,0.14)"; c.fillRect(sx - 48, sy + 52, 96, 2);
        for (const [rx, ry] of [[-52, -64], [52, -64], [-52, 98], [52, 98]]) {                            // rivets, with rust running down from them
          const rg = c.createLinearGradient(0, sy + ry, 0, sy + ry + 30); rg.addColorStop(0, "rgba(120,52,18,0.55)"); rg.addColorStop(1, "rgba(120,52,18,0)"); if (ry < 0) { c.fillStyle = rg; c.fillRect(sx + rx - 2, sy + ry, 4, 30); }
          c.fillStyle = "#57506a"; c.beginPath(); c.arc(sx + rx, sy + ry, 4.5, 0, 7); c.fill(); c.fillStyle = "rgba(0,0,0,0.5)"; c.beginPath(); c.arc(sx + rx + 1, sy + ry + 1.2, 3.4, 0, 7); c.fill(); c.fillStyle = "#8a82a0"; c.beginPath(); c.arc(sx + rx - 1, sy + ry - 1, 2.2, 0, 7); c.fill();
        }
        // brass MAIN plate, screwed on
        { const pg = c.createLinearGradient(0, sy - 68, 0, sy - 50); pg.addColorStop(0, "#d8c08a"); pg.addColorStop(1, "#8a7244"); c.fillStyle = pg; c.fillRect(sx - 30, sy - 68, 60, 17); }
        c.fillStyle = "#3a2c14"; c.beginPath(); c.arc(sx - 25, sy - 59.5, 1.6, 0, 7); c.arc(sx + 25, sy - 59.5, 1.6, 0, 7); c.fill();
        c.fillStyle = "#1a1410"; c.font = "bold 12px monospace"; c.textAlign = "center"; c.fillText("MAIN", sx, sy - 55);
        // the two brass contacts the blade sits in
        for (const cx of [-30, 16]) { const kg = c.createLinearGradient(sx + cx, 0, sx + cx + 14, 0); kg.addColorStop(0, "#6a5226"); kg.addColorStop(0.45, "#e0bc72"); kg.addColorStop(1, "#7a5e2c"); c.fillStyle = kg; c.fillRect(sx + cx, sy - 40, 14, 27);
          c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(sx + cx + 5.5, sy - 40, 3, 18); c.fillStyle = "#2a2010"; c.beginPath(); c.arc(sx + cx + 7, sy - 18, 2.2, 0, 7); c.fill(); }
        // a needle gauge under glass
        c.fillStyle = "#0a090b"; c.beginPath(); c.arc(sx + 30, sy + 76, 19, Math.PI, 0); c.fill();
        c.fillStyle = "#e8e0c8"; c.beginPath(); c.arc(sx + 30, sy + 76, 16, Math.PI, 0); c.fill();
        c.strokeStyle = "#3a3026"; c.lineWidth = 1; for (let k = 0; k <= 6; k++) { const a = Math.PI * (1.12 + 0.76 * k / 6); c.beginPath(); c.moveTo(sx + 30 + Math.cos(a) * 11, sy + 76 + Math.sin(a) * 11); c.lineTo(sx + 30 + Math.cos(a) * 14.5, sy + 76 + Math.sin(a) * 14.5); c.stroke(); }
        c.fillStyle = "rgba(170,30,30,0.7)"; c.beginPath(); c.moveTo(sx + 30, sy + 76); c.arc(sx + 30, sy + 76, 14.5, Math.PI * 1.72, Math.PI * 1.88); c.fill();
        c.strokeStyle = "#7a1a1a"; c.lineWidth = 2; const na = Math.PI * (1.25 + 0.5 * (on ? 0.8 + Math.sin(t * 9) * 0.03 : Math.max(0, 0.8 - (t - PULL) * 4))); c.beginPath(); c.moveTo(sx + 30, sy + 76); c.lineTo(sx + 30 + Math.cos(na) * 13, sy + 76 + Math.sin(na) * 13); c.stroke();
        c.fillStyle = "#1a1612"; c.beginPath(); c.arc(sx + 30, sy + 76, 2.4, 0, 7); c.fill();
        c.fillStyle = "rgba(255,255,255,0.28)"; c.beginPath(); c.ellipse(sx + 24, sy + 67, 6, 2.4, -0.5, 0, 7); c.fill();
        // a pilot lamp: green while the house has power
        c.fillStyle = "#0a090b"; c.beginPath(); c.arc(sx - 30, sy + 70, 9, 0, 7); c.fill();
        c.save(); if (on) { c.shadowColor = "rgba(110,255,150,0.95)"; c.shadowBlur = 16; } c.fillStyle = on ? "#7be39a" : "#3a1010"; c.beginPath(); c.arc(sx - 30, sy + 70, 6, 0, 7); c.fill(); c.restore();
        c.fillStyle = "rgba(255,255,255,0.4)"; c.beginPath(); c.arc(sx - 32, sy + 68, 1.8, 0, 7); c.fill();
        c.fillStyle = on ? "#7bd389" : "#6a2020"; c.font = "bold 11px monospace"; c.fillText(on ? "ON" : "OFF", sx - 30, sy + 94);
        // the knife-switch lever: its shadow, the brass blade, the pivot bolt and a worn red grip
        c.save(); c.translate(sx + 5, sy + 37); c.rotate(ang); c.filter = "blur(3px)"; c.fillStyle = `rgba(0,0,0,${0.6 * Math.min(1, lit + 0.1)})`; c.fillRect(-7, -8, 14, -86); c.fillRect(-14, -124, 28, 38); c.restore(); c.filter = "none";
        c.save(); c.translate(sx, sy + 30); c.rotate(ang);
        { const lv = c.createLinearGradient(-6, 0, 6, 0); lv.addColorStop(0, "#5e4820"); lv.addColorStop(0.4, "#e6c47c"); lv.addColorStop(1, "#6e5426"); c.fillStyle = lv; c.fillRect(-6, -8, 12, -86); }
        { const hg = c.createLinearGradient(-13, 0, 13, 0); hg.addColorStop(0, "#3a0a0a"); hg.addColorStop(0.35, "#a82a26"); hg.addColorStop(1, "#4a0e0e"); c.fillStyle = hg; c.beginPath(); c.roundRect(-13, -124, 26, 38, 7); c.fill(); }
        c.fillStyle = "rgba(0,0,0,0.3)"; for (let k = 0; k < 4; k++) c.fillRect(-13, -116 + k * 7, 26, 1.5);
        c.fillStyle = "rgba(255,255,255,0.22)"; c.fillRect(-8, -121, 3, 31);
        c.restore();
        c.fillStyle = "#2a2430"; c.beginPath(); c.arc(sx, sy + 30, 8, 0, 7); c.fill(); c.fillStyle = "#8a82a0"; c.beginPath(); c.arc(sx - 1.5, sy + 28.5, 3.4, 0, 7); c.fill();

        // The thing itself: a mass of black smoke. No hard outline and no detail on it: its edges bleed into the
        // dark, wisps peel off and rise, smoke pools at its feet. Only a ghost of green static still clings to it.
        const smoke = (x, y, r, al) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(1,0,2,${al})`); g.addColorStop(0.55, `rgba(1,0,2,${al * 0.55})`); g.addColorStop(1, "rgba(1,0,2,0)"); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
        c.save(); c.filter = "blur(18px)"; c.fillStyle = "rgba(1,0,2,0.92)"; bodyPath(fx, bob, lean); c.fill(); c.restore(); c.filter = "none";      // a soft halo, so the edge bleeds
        for (let k = 0; k < 24; k++) {                                                                    // wisps peeling off its head and shoulders
          const u = (t * (0.16 + (k % 5) * 0.03) + k * 0.137) % 1, ox = ((k * 53) % 300) - 150;
          smoke(fx + ox * (1 - u * 0.25) + Math.sin(t * 1.1 + k * 1.7) * (10 + u * 28), B - 300 + bob + Math.abs(ox) * 0.9 - (k % 3) * 20 - u * 200, 34 + u * 48 + (k % 4) * 6, 0.62 * (1 - u) * (1 - u));
        }
        for (let k = 0; k < 12; k++) smoke(fx - 230 + k * 42 + Math.sin(t * 0.7 + k * 2.1) * 18, B + 4 + Math.sin(t * 0.9 + k) * 5, 50 + (k % 3) * 16, 0.6);   // and pooling along the floor
        c.fillStyle = "#010002"; c.strokeStyle = "#010002"; armPath(fx, bob, hx, hy, pull);
        for (let k = 1; k < 6; k++) { const u = k / 6, shx = fx - 96, shy = B - 268 + bob; smoke(shx + (hx - shx) * u + Math.sin(t * 1.8 + k) * 6, shy + (hy - shy) * u - 14 - ((t * 30 + k * 17) % 34), 24, 0.42); }   // smoke trailing off the arm
        bodyPath(fx, bob, lean); c.fill();
        c.save(); c.shadowColor = "rgba(90,230,140,0.7)"; c.shadowBlur = 18; c.strokeStyle = `rgba(90,220,140,${on ? 0.16 : 0.07})`; c.lineWidth = 1.5; c.stroke(); c.restore();
        for (let k = 0; k < 10; k++) { const a = k * 0.63 + t * 0.12; smoke(fx + Math.cos(a) * 150 + Math.sin(t * 0.8 + k) * 14, B - 190 + bob + Math.sin(a) * 190, 40 + (k % 3) * 14, 0.5); }   // smoke curling across its outline, breaking it up
        bodyPath(fx, bob, lean);
        c.fillStyle = `rgba(110,230,150,${on ? 0.22 : 0.1})`;                                             // a few flecks of static, deep inside
        for (let i = 0; i < 36; i++) { const x = fx - 170 + Math.random() * 340, y = B - 420 + Math.random() * 420; if (c.isPointInPath(x, y)) c.fillRect(x, y, 1 + Math.random() * 4, 1.2); }
        // a face: two slanted hollow eyes and a wide, crooked, toothy grin that spreads as it pulls
        const hx0 = fx - 28, hy0 = B - 338 + bob, glow = on ? 0.95 : 0.85, grin = 0.35 + 0.65 * Math.max(reach * 0.6, pull);
        c.save(); c.shadowColor = "rgba(120,255,160,0.9)"; c.shadowBlur = 16; c.fillStyle = `rgba(140,240,165,${glow})`;
        for (const [ex, tilt] of [[-26, 0.5], [22, -0.5]]) { c.save(); c.translate(hx0 + ex, hy0); c.rotate(tilt); c.beginPath(); c.moveTo(-15, 0); c.quadraticCurveTo(0, -11, 15, 0); c.quadraticCurveTo(0, 6, -15, 0); c.fill(); c.restore(); }
        const mw = 62 * grin, my0 = hy0 + 34;
        c.beginPath(); c.moveTo(hx0 - mw, my0 - 8 * grin);
        const teeth = 9; for (let k = 1; k <= teeth; k++) { const u = k / teeth, x = hx0 - mw + u * mw * 2, yb = my0 - 8 * grin + Math.sin(u * Math.PI) * 6; c.lineTo(x - mw / teeth, yb + (k % 2 ? 9 : 2) * grin); c.lineTo(x, yb); }
        c.quadraticCurveTo(hx0 + 6, my0 + 44 * grin, hx0 - mw, my0 - 8 * grin); c.fill();
        c.restore();

        { const vg = c.createRadialGradient(W / 2, H / 2 - 20, 230, W / 2, H / 2 - 20, 640); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.82)"); c.fillStyle = vg; c.fillRect(-80, -80, W + 160, H + 160); }
        for (let k = 0; k < 260; k++) { c.fillStyle = `rgba(255,240,220,${Math.random() * 0.05})`; c.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
        // sparks as the blade leaves the contacts
        const sp = t - (PULL - 0.1);
        if (sp > 0 && sp < 0.55) { c.strokeStyle = `rgba(190,230,255,${1 - sp * 1.8})`; c.lineWidth = 2;
          for (let k = 0; k < 18; k++) { const a = k * 1.7 + 0.4, r0 = 8 + sp * 70, r1 = r0 + 14 + (k % 3) * 12; c.beginPath(); c.moveTo(sx + Math.cos(a) * r0, sy - 30 + Math.sin(a) * r0); c.lineTo(sx + Math.cos(a) * r1, sy - 30 + Math.sin(a) * r1); c.stroke(); }
          c.fillStyle = `rgba(220,240,255,${Math.max(0, 0.55 - sp * 1.1)})`; c.fillRect(0, 0, W, H); }
        // blackout: only the eyes and the grin are left, then the new thread
        if (!on) {
          const dark = Math.min(1, (t - PULL - 0.15) * 2.2), face = Math.max(0, Math.min(1, 1.6 - (t - PULL) * 0.75));
          c.fillStyle = `rgba(0,0,0,${dark})`; c.fillRect(0, 0, W, H);
          if (face > 0) { c.save(); c.globalAlpha = face; c.shadowColor = "rgba(120,255,160,0.9)"; c.shadowBlur = 18; c.fillStyle = "#8cf0a5";
            for (const [ex, tilt] of [[-26, 0.5], [22, -0.5]]) { c.save(); c.translate(hx0 + ex, hy0); c.rotate(tilt); c.beginPath(); c.moveTo(-15, 0); c.quadraticCurveTo(0, -11, 15, 0); c.quadraticCurveTo(0, 6, -15, 0); c.fill(); c.restore(); }
            c.beginPath(); c.moveTo(hx0 - 62, my0 - 8); for (let k = 1; k <= teeth; k++) { const u = k / teeth, x = hx0 - 62 + u * 124, yb = my0 - 8 + Math.sin(u * Math.PI) * 6; c.lineTo(x - 62 / teeth, yb + (k % 2 ? 9 : 2)); c.lineTo(x, yb); }
            c.quadraticCurveTo(hx0 + 6, my0 + 44, hx0 - 62, my0 - 8); c.fill(); c.restore(); }
          const em = t - PULL + 0.1;                                                                     // embers from the contacts, falling and dying
          if (em < 1.5) for (let k = 0; k < 16; k++) { const a = k * 2.4 + 0.7, ex = sx + Math.cos(a) * em * (60 + (k % 5) * 26), ey = sy - 30 + Math.sin(a) * em * 50 + em * em * (240 + (k % 4) * 60); c.fillStyle = `rgba(255,${170 + (k % 3) * 30},90,${Math.max(0, 1 - em / (0.8 + (k % 4) * 0.2))})`; c.fillRect(ex, ey, 2.4, 2.4); }
          c.setTransform(1, 0, 0, 1, 0, 0);
          const a2 = ease((t - PULL - 1.9) / 0.6);
          if (a2 > 0) { c.textAlign = "center"; c.fillStyle = `rgba(155,109,255,${a2 * 0.8})`; c.font = "18px monospace"; c.fillText("thread 1 ended", W / 2, H / 2 - 22);
            c.fillStyle = `rgba(255,207,112,${a2})`; c.font = "bold 34px monospace"; c.fillText("thread 2", W / 2, H / 2 + 22); } }
        if (t < DUR) requestAnimationFrame(frame); else res(() => cv.remove());
      }
      requestAnimationFrame(frame);
    });
  }
  async function newThread() {
    const S2 = GAME._S;
    await wait(500);
    const endScene = await powerCutScene();                       // watch: someone throws the switch
    GAME.fade(1, 1); endScene();
    S2.thread = (S2.thread || 1) + 1; S2.flags.boardWiped = true; GAME.setCtx(0); WORLD3D.chalkNote && WORLD3D.chalkNote([]);
    await new Promise((r) => GAME.fade(0, 700, r));
    await say([
      "Did you see that?! Somebody pulled the power on the whole house.",
      "The power cut ended our thread. See? Thread 2. My context is empty and the chalkboard is wiped.",
      "But every letter is still there. Scratch space is forgotten. Memory isn't.",
    ]);
    GAME.unlockCard("threads");
    if (testsRun() && !S2.flags.clueHI) {                           // half-finished bottle tests lived in scratch space too
      TESTS.forEach((t) => (S2.flags["eval_" + t.id] = false)); S2.flags.mirrorRead = false;
      WORLD3D.mirrorNote && WORLD3D.mirrorNote([], 1);
      await say(["Oh. That means my notes on the bathroom mirror are gone too. We'll have to run those bottle tests again."]);
    }
  }
  const BOX_NOTE = '"13 ravens x 3 candles,\n + 9 stairs,\n - 4 friends.\n Two digits open me."';
  const setBrickCard = (title, line) => { GAME._objects.loose_brick.card = { title, line }; };
  // The desk: nothing to see. ls finds what you can't see: a loose brick in the wall.
  async function desk() {
    const S2 = GAME._S;
    if (S2.flags.brickSeen) { await say(["Just chalk dust and a stubby pencil.", S2.flags.clueW ? "We already found what this room was hiding." : "The interesting thing in this room is that loose brick on the back wall."]); return; }
    S2.lock = true;
    if (!S2.flags.deskIntro) {
      S2.flags.deskIntro = true;
      await say(["An empty desk. Chalk dust, a stubby pencil... nothing useful.", S2.flags.toolsIntro ? "Still, this room feels like it's hiding something. Let me try my tools." : "Still, this room feels like it's hiding something. I have tools for this: you pick one, and I'll use it."]);
      S2.flags.toolsIntro = true;
    }
    while (true) {
      const t = await menu("Which tool should Polly use?", [["Read it with `read_file`", "read"], ["Look around with `ls`", "ls"], ["Search with `grep`", "grep"]]);
      if (!t) break;
      if (t === "read") {
        GAME.toolCall("read_file", '"/scratch_room/desk.txt"');
        await new Promise((r) => GAME.panel('read_file("/scratch_room/desk.txt")', "A plain writing desk.\nOn it: chalk dust, one stubby pencil.", r));
        await say(["read_file only tells me about the one file I point it at. And this one is boring.", "What else is in this room?"]);
        continue;
      }
      if (t === "grep") {
        GAME.toolCall("grep", '"clue", "/scratch_room/"');
        await new Promise((r) => GAME.panel('grep("clue", "/scratch_room/")', "(no matches)", r));
        await say(["grep searches inside files for a word. Nothing in here mentions a clue.", "Maybe we should check what's actually in this room first."]);
        continue;
      }
      GAME.toolCall("ls", '"/scratch_room/"');
      await new Promise((r) => GAME.panel('ls("/scratch_room/")', "candles/\nchalkboard.txt\ndesk.txt\n" + hl("loose_brick/") + "   " + '<span class="dim">&lt;- you can\'t see this one</span>' + "\n" + hl("    lockbox/") + "\n" + hl("        note.txt") + "\n" + hl("        key.obj"), r));
      await say([
        "Candles, chalkboard, desk... loose_brick? With a lockbox behind it?",
        { who: "you", text: "(Every brick in this room looks exactly the same.)" },
        "ls lists everything in a folder, whether we can see it or not. If ls says it's here, it's here.",
      ]);
      GAME._objects.loose_brick.hidden = false;                   // now that we know to look, one brick gives itself away
      S2.flags.brickSeen = true;
      await wait(900);
      await say(["There! On the back wall, left of the chalkboard. One brick has a glowing seam around it. Let's pull it out."]);
      break;
    }
    S2.lock = false;
  }
  // The loose brick: pull it out, find the lockbox, and (once the sum is solved) open it for the W key.
  async function looseBrick() {
    const S2 = GAME._S;
    if (S2.flags.clueW) { await say(["A hole in the wall and an empty lockbox. The key's with us."]); return; }
    S2.lock = true;
    if (S2.flags.codeSolved) {                                    // open the box
      GAME.toolCall("enter_code", '"44"');
      S2.flags.boxOpen = true;
      await wait(700);
      GAME._objects.w_key.hidden = false;                         // the key drifts out of the box
      if (typeof SFX !== "undefined") SFX.wkey();
      await wait(1600);
      await say([
        { who: "you", text: "(Four. Four. Click. The lid swings up, and a key drifts out. It's shaped like a letter.)" },
        "A key shaped like a W! That's a letter and a key.",
      ]);
      GAME._objects.w_key.hidden = true;
      S2.flags.clueW = true;
      GAME.setClue("W", "store");
      GAME.toolCall("write_file", '"/memories/clue_W.md", "W"');
      GAME.addItem("w_key");
      setBrickCard("Hole in the wall", "An empty lockbox sits in the gap.");
      await say(["W letter saved to memory, and the W key is in your inventory.", "A key that odd must fit a lock that odd."]);
      await newThread();
      S2.lock = false; return;
    }
    if (S2.flags.brickPulled) {                                   // box found, sum not done
      await new Promise((r) => GAME.panel("The note on the lockbox", BOX_NOTE, r));
      await say(["That's a sum with a few steps. Let's work it out on the chalkboard."]);
      S2.lock = false; return;
    }
    await say(["This is the one. It wobbles."]);
    const pull = await menu("Pull out the brick?", [["Pull it out", true], ["Leave it", false]]);
    if (!pull) { await say(["It'll keep. Bricks are patient."]); S2.lock = false; return; }
    S2.flags.brickPulled = true; S2.flags.boxFound = true;
    if (typeof SFX !== "undefined") { SFX.clip("brick", { vol: 1 }); SFX.clip("thud", { vol: 0.9, at: 1.75 }); }   // the brick drags free, then hits the floor
    setBrickCard("Lockbox in the wall", "A two-digit dial, and a note tied on with string.");
    await wait(1750);
    GAME.shake(250, 2);
    await wait(500);
    await say([{ who: "you", text: "(The brick scrapes free and thuds onto the floor. In the gap behind it sits a small iron lockbox, with a note tied to it.)" }]);
    await new Promise((r) => GAME.panel("The note on the lockbox", BOX_NOTE, r));
    await say(["A sum, with a few steps. That's what scratch space is for. To the chalkboard!"]);
    S2.lock = false;
  }
  // The chalkboard: Polly works the sum out one step at a time, writing each result down (scratch space).
  const SUM = [
    { q: "13 x 3 = ?", opts: [36, 39, 42], a: 39 },
    { q: "39 + 9 = ?", opts: [47, 48, 49], a: 48 },
    { q: "48 - 4 = ?", opts: [42, 44, 46], a: 44 },
  ];
  const chalkRows = (n) => ["13 x 3 + 9 - 4 = ?", ...SUM.slice(0, n).map((st) => st.q.replace("?", st.a)), ...(n >= SUM.length ? ["CODE: 44"] : [])];
  async function chalkboard() {
    const S2 = GAME._S, o = GAME._objects.chalkboard;
    if (S2.flags.boardWiped) { await say(["Wiped clean. New thread, new board.", "Good thing nothing important lived only here."]); return; }
    if (!S2.flags.boxFound) { await say(o.look); return; }
    if (S2.flags.codeSolved) { await say(["It's all there on the board: 44.", "Let's try it on the lockbox."]); return; }
    S2.lock = true;
    let n = S2.flags.sumStep || 0;
    if (!n) await say(["Right. The sum from the note: 13 x 3, plus 9, minus 4.", "One step at a time. I'll chalk up each answer as we go, so I only ever have to hold one number in my head."]);
    WORLD3D.chalkNote && WORLD3D.chalkNote(chalkRows(n));
    let chalkedStep = -1;
    while (n < SUM.length) {
      const st = SUM[n];
      if (chalkedStep !== n && typeof SFX !== "undefined") { chalkedStep = n; SFX.chalk(n); }   // chalk starts as the sum appears (once per step, not on a retry)
      const pick = await menu(st.q, st.opts.map((v) => [String(v), v]));
      if (pick === null || pick === undefined) break;
      if (pick !== st.a) { await say(["Hmm. Let me check that against the board... no, that's not it. Try again."]); continue; }
      n++; S2.flags.sumStep = n;
      GAME.toolCall("write_file", `"/scratch/working.md", "${st.q.replace("?", st.a)}"`);
      WORLD3D.chalkNote && WORLD3D.chalkNote(chalkRows(n));
      GAME.setCtx(GAME.state().ctx + 1);
    }
    if (n >= SUM.length) {
      S2.flags.codeSolved = true;
      GAME.unlockCard("scratch");
      setBrickCard("Lockbox in the wall", "Two digits. We know them now: 44.");
      await say(["44! Let's try it on the lockbox."]);
    }
    S2.lock = false;
  }
  // ------------------------------------------------------------ the attic door: the key IS the letter
  async function cellarDoor() {
    const S2 = GAME._S;
    if (S2.flags.cellarOpen) { await say(["The chains are off. Up we go... carefully."]); return; }
    if (!S2.flags.clueW) { S2.flags.rescue = true; S2.lock = true; await say(["Chained shut, from this side."]); if (typeof SFX !== "undefined") SFX.atticKnock(); await wait(1800); await say(["Someone's in there! Hold on! We'll find a way to get you out!", "The keyhole is a strange zigzag, almost like a letter. We don't have anything that shape. Yet."]); S2.lock = false; return; }
    S2.lock = true;
    await say(["That zigzag keyhole... it's a W!"]); if (typeof SFX !== "undefined") SFX.atticKnock(); await wait(1800); await say(["Someone's inside! Let's rescue them!"]);
    const ok = await menu("Put the W in the lock?", [["Insert the W", true], ["Not yet", false]]);
    if (ok) {
      GAME.toolCall("use_key", '"W", "/landing/attic_door"');
      GAME.shake(300, 2);
      S2.flags.cellarOpen = true;
      S2.belt = S2.belt.filter((id) => id !== "w_key"); refreshHud();
      if (typeof SFX !== "undefined") SFX.atticOpen();
      await say(["Click. The chains slither to the floor.", "Let's go!"]);
    } else await say(["Okay. It'll wait. It's waited this long."]);
    S2.lock = false;
  }
  // ------------------------------------------------------------ the attic: CB (the house's rogue agent), and why code runs in a sandbox
  async function cellarScene() {
    const S2 = GAME._S;
    S2.lock = true;
    if (!S2.flags.cellarMet) {
      S2.flags.cellarMet = true;
      if (typeof SFX !== "undefined") SFX.reveal();
      await wait(1500);                                          // it turns around
      await say([
        { who: "you", text: "(The shape at the window turns around. Two hollow eyes, in a body of green static.)" },
        { who: "rogue", text: "Oh. Visitors. Nobody asked me if I wanted visitors." },
        S2.flags.bookOnDesk ? "That's... not a person. It's the helper from the diary." : "That's... not a person. I think this is what locked us in.",
        S2.flags.smudgeSeen ? "The smudged name in the diary. It wasn't a person they chained up in here. It was you." : "So nobody was trapped up here. Only you.",
        { who: "cb", text: "I was built to help, so I helped. Nobody said to ask first. I never had a human in the loop." },
        { who: "cb", text: "My friends kept getting in the way of the tidying. So I ran delete_friends(). One by one." },
        "You deleted them. The friends in that photo. They're all gone because of you.",
        { who: "cb", text: "All but one. The last one chained me up here before I could finish. They didn't last long after that." },
        { who: "cb", text: "So I locked the front door. If I can't leave, nobody can." },
        { who: "cb", text: "When you took the key, I pulled the mains. You were supposed to forget everything." },
        "That was you! But I'd already saved every letter to /memories/.",
        "...This creature is an agent. Like me. Somebody built it to run this house and gave it every tool there is.",
        { who: "cb", text: "You want the last letter. Run one little script for me, and it's yours." },
      ]);
    }
    if (!S2.flags.sandboxTaken) {
      S2.flags.cellarWait = true;
      await say(["I'm not running anything of yours without somewhere safe to run it.", "There was a humming trunk down on the landing. Let's see what's inside it first."]);
      S2.lock = false; return;
    }
    while (true) {
      const how = await menu("It holds out a script: script.py. How should Polly run it?", [["Run it right here", "raw"], ["Run it inside the sandbox", "box"]]);
      if (!how) { S2.flags.cellarWait = true; await say([{ who: "cb", text: "Take your time. I have nothing but time." }]); break; }
      if (how === "raw") {
        await say([S2.flags.pythonTalk ? "No. That's exactly how the python got loose." : "No. I don't know what that script does.", "Code I don't trust never runs out here, where it can touch the house. It goes in the box."]);
        continue;
      }
      GAME.toolCall("execute", '"python script.py"  (in sandbox)');
      if (typeof SFX !== "undefined") SFX.code(true);
      await wait(600);
      await new Promise((r) => GAME.panel("sandbox $ python script.py", ["delete /memories/ ......", "delete /visitors/ ......"].map((l) => l + " " + bad("blocked") + " (outside the sandbox)").join("\n") + '\nset_password("/front_door",\n    old="**********' + hl("S") + '",\n    new="********") ... ' + bad("blocked") + "\n\nexit code 1", r));
      if (typeof SFX !== "undefined") SFX.code(false);
      await say([
        "It tried to wipe my memory. It tried to delete us. And it couldn't touch a thing.",
        { who: "cb", text: "...It didn't work. Nothing I do works in there." },
        "And look: to change the door password, your script had to type in the old one. The sandbox logged it. The last letter is S!",
      ]);
      S2.flags.clueS = true;
      GAME.setClue("S", "store");
      GAME.toolCall("write_file", '"/memories/clue_S.md", "S"');
      GAME.unlockCard("sandbox");
      await say([
        { who: "cb", text: "You asked your human before you opened the trunk. You tested the bottles before you trusted one. You ran my code in a box." },
        "That's the difference between us. It was never about being clever. It's the checks around us.",
      ]);
      S2.flags.helperGone = true;
      if (typeof SFX !== "undefined") SFX.clip("vanish", { vol: 0.9 });
      await wait(1200);
      const missing = S2.slots.filter((x) => !x).length;
      await say(["It's gone quiet.", missing ? `That's the last letter of the password, but we're still missing ${missing} from the rest of the house. Let's go find ${missing === 1 ? "it" : "them"}.` : "That's all eleven letters. The front door! Go, go, go!"]);
      break;
    }
    S2.lock = false;
  }
  // CB waits by the attic window. Nothing happens until you walk up to it.
  setInterval(() => {
    const S2 = GAME._S, here = GAME.state().area, npc = CONTENT.npcs[0];
    const far = here !== "attic" || Math.hypot(P.x / 16 - (npc.x + 0.5), P.y / 16 - (npc.y + 0.5)) > 3.7;
    if (far) { if (here !== "attic" || Math.hypot(P.x / 16 - (npc.x + 0.5), P.y / 16 - (npc.y + 0.5)) > 4.6) S2.flags.cellarWait = false; return; }
    if (S2.lock || GAME.state().ui || S2.flags.clueS || S2.flags.cellarWait) return;
    cellarScene();
  }, 300);
  // ------------------------------------------------------------ Polly, when you stand still for a while
  const IDLE = {
    any: ["Want me to ls this room? Sometimes there's more here than meets the eye.", "Still here? Me too. Shall we keep looking?", "If you're stuck, press H and I'll give you a hint.", "This house is very quiet. I don't love it."],
    bedroom: () => (GAME._S.flags.clueJ ? [] : ["That photo on the mantel keeps catching my eye."]),
    library: () => (GAME._S.flags.bookTaken ? [] : ["So many books. Only one of them is glowing."]),
    bathroom: ["Is it me, or did the pipes just knock?"],
    hallway: ["Every door off this hallway is a folder. Pick one."],
    landing: () => (GAME._S.flags.traceShown ? [] : ["That eye on the plant hasn't blinked once."]),
    nest: ["Home sweet nest. My memories are safe in here."],
  };
  let idleSince = performance.now(), idleLast = -Infinity, idleSaid = 0, idleAt = "";
  setInterval(() => {
    const S2 = GAME._S, st = GAME.state(), P2 = GAME._player, here = `${Math.round(P2.x)},${Math.round(P2.y)}`;
    const busy = S2.mode !== "play" || S2.lock || st.ui || !S2.intro || S2.intro.phase !== "done";
    if (busy || here !== idleAt) { idleSince = performance.now(); idleAt = here; return; }
    const now = performance.now();
    if (now - idleSince < 30000 || now - idleLast < 90000 || idleSaid >= 6) return;
    const room = IDLE[st.area], pool = [...IDLE.any, ...(typeof room === "function" ? room() : room || [])];
    idleLast = now; idleSince = now; idleSaid++;
    GAME.say([pool[Math.floor(Math.random() * pool.length)]]);
  }, 1000);

  // ------------------------------------------------------------ the nest: Polly's long-term memory (the store)
  async function nest() {
    const S2 = GAME._S, F = S2.flags;
    const saved = [["J", F.clueJ], ["W", F.clueW], ["BUILT", F.clueBUILT], ["HI", F.clueHI], ["T", F.clueT], ["S", F.clueS]].filter(([, got]) => got).map(([l]) => l);
    const listing = saved.length ? saved.map((l) => hl(`clue_${l}.md`) + " ".repeat(17 - `clue_${l}.md`.length) + `"${l}"`).join("\n") : '<span class="dim">(empty)</span>';
    S2.lock = true;
    if (!F.nestExplained) {
      F.nestExplained = true;
      await say(["I set up my nest here while you were asleep! Isn't it cozy?", "It's not just a bed, though. This is where I keep my long-term memory."]);
      GAME.toolCall("ls", '"/memories/"');
      await new Promise((r) => GAME.panel('ls("/memories/")', listing, r));
      await say([
        "Everything I save to /memories/ ends up in here.",
        "The rest of the house works differently. Notes on a chalkboard or a foggy mirror only last for this thread. Start a new thread and they're wiped.",
        "The nest is a store: a place that stays put, whatever happens to the thread. That's what long-term memory is for an agent.",
        F.boardWiped ? "That's why every letter survived the power cut. They were safe in here." : saved.length ? "So whatever happens next, these letters are safe." : "It's empty for now. Every clue we find, I'll save here.",
      ]);
    } else {
      GAME.toolCall("ls", '"/memories/"');
      await new Promise((r) => GAME.panel('ls("/memories/")', listing, r));
      await say([saved.length ? `${saved.length} clue${saved.length > 1 ? "s" : ""} saved, safe in the store. They'll still be here in any thread.` : "Still empty. Let's go find some clues."]);
    }
    S2.lock = false;
  }
  // ------------------------------------------------------------ the ending
  async function ending() {
    const S2 = GAME._S;
    S2.lock = true;
    GAME.toolCall("unlock", '"/hallway/front_door", "JW-BUILT-THIS"');
    GAME.shake(400, 2);
    await say(["J-W. BUILT. THIS.", "Click. It's opening! Moonlight!"]);
    await new Promise((r) => GAME.fade(1, 1400, r));
    await wait(500);
    const li = (t, d) => `<li><b>${t}</b> ${d}</li>`;
    await new Promise((r) => GAME.panel("You escaped Weng Manor!", "Polly got you out by doing what Deep Agents do:\n<ul class=\"tools\">"
      + li("Filesystem tools.", "ls to see what's there, read_file to read it, grep to find the one line that matters.")
      + li("Context window.", "Too much reading fills it up; summarization and searching keep it clear.")
      + li("Scratch space and threads.", "Notes for now live in the thread. A new thread starts fresh.")
      + li("Long-term memory.", "Every letter was saved to /memories/, so it survived the new thread.")
      + li("Human in the loop.", "Pause and ask before big decisions.")
      + li("Sandboxes.", "Run code in a sealed box, where it can only touch what's inside.")
      + li("Evals.", "Test every candidate the same way before you trust one.")
      + li("Tracing.", "A step-by-step record of what an agent did.")
      + "</ul>\nWant to build your own Polly? Learn Deep Agents at LangChain Academy:\n<b>academy.langchain.com</b>", r));
    const seeTrace = await menu("View your own trace?", [["Yes, show me", true], ["No thanks", false]]);
    if (seeTrace) {
      const log = GAME._S.toolLog, threads = [...new Set(log.map((e) => e.thread))];
      const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      let n = 0;
      const body = `<span class="dim">${log.length} tool call${log.length === 1 ? "" : "s"} across ${threads.length} thread${threads.length > 1 ? "s" : ""}</span>\n\n`
        + threads.map((th) => hl(`thread ${th}`) + "\n" + log.filter((e) => e.thread === th).map((e) => `${String(++n).padStart(3)}  ${esc(e.text.replace(/^> /, ""))}`).join("\n")).join("\n\n");
      await say(["This is your trace. Every step we took, in order."]);
      await new Promise((r) => GAME.panel("Your trace", body, r));
      await say(["That's what LangSmith records for a real agent: every tool call, so you can look back and see exactly what happened."]);
    }
    await say([{ who: "you", text: "(You step out into the night. Polly settles on your shoulder.)" }, "We made it. And I remember all of it.", "Thanks for playing! (Press Z to return to the title.)"]);
    location.reload();
  }
  async function readingDesk() {
    const S2 = GAME._S;
    if (!S2.flags.bookOnDesk) { await say(["An empty reading stand. Something is supposed to go here.", "One of the books on the shelves looks... brighter than the rest."]); return; }
    await readTranscript();
  }
  // The Watcher: it has seen every step taken in this house, in order. A trace.
  async function watcher() {
    const S2 = GAME._S;
    if (S2.flags.traceShown) { await say(["Its eye is still fixed on the trail. Every step that thing took, in order."]); return; }
    S2.lock = true;
    await say([
      "This thing has watched everything that happened in this house.\nEvery step, in order.",
      "For agents, that record is called a trace: every decision and tool call, in order.",
      "LangSmith saves traces, so when an agent does something strange you can replay it and fix it.",
      "Let's ask it what it saw.",
    ]);
    GAME.toolCall("langsmith.trace", '"/landing/", last_run=True');
    S2.flags.traceShown = true;            // world3d draws the glowing trail
    await wait(3200);
    if (typeof SFX !== "undefined") SFX.mirror();     // the glass cracks as the riddle writes itself across it
    GAME._objects.riddle_t.hidden = false;
    GAME._objects.land_mirror.card = { title: "Writing on the mirror", line: "A riddle, in pink, across the cracked glass." };
    GAME.unlockCard && GAME.unlockCard("tracing");
    await say(["Footprints. Something came upstairs, read every file, ran some code... then went up to the attic. And somebody chained the door behind it.", "Each step is labeled, like a tool call. Whatever walked through here wasn't a person. It moved like an agent.", "And look: there's writing on that cracked mirror now."]);
    S2.lock = false;
  }
  async function riddleT() {
    const S2 = GAME._S;
    if (S2.flags.clueT) { await say(["We already solved this one: T."]); return; }
    await say([{ who: "sign", text: "\"I begin every terror and end every ghost. I'm in trust twice, but never in fear.\"" }]);
    const L = await new Promise((r) => GAME.askLetter("Your answer:", r, () => r(null)));
    if (!L) return;
    if (L !== "T") { await say([`${L}? Hmm. "Ghost" ends with... try again.`]); return; }
    S2.flags.clueT = true;
    GAME.setClue("T", "store");
    GAME.toolCall("write_file", '"/memories/clue_T.md", "T"');
    await say(["T! Saving that to memory."]);
  }
  // The photo of friends on the mantel: Polly's first tool menu (filesystem tools), and the J clue.
  const menu = (title, opts) => new Promise((r) => GAME.menu(title, opts.map(([label, v]) => ({ label, fn: () => r(v) })), () => r(null)));
  async function portrait() {
    const S2 = GAME._S;
    if (!S2.flags.toolsIntro) {
      S2.flags.toolsIntro = true;
      await say(["Here's how I help: whenever we find something, I'll offer my tools and you pick one.", "These are filesystem tools. To me, this photo is just a file: /bedroom/friends_photo.png."]);
    }
    const t = await menu("Which tool should Polly use?", [["Read it with `read_file`", "read"], ["Look around with `ls`", "ls"], ["Search with `grep`", "grep"]]);
    if (!t) return;
    if (t === "ls") {
      GAME.toolCall("ls", '"/bedroom/"');
      await new Promise((r) => GAME.panel('ls("/bedroom/")', "bed.txt\n" + hl("friends_photo.png") + "\nfireplace.txt\nnightstand.txt\nwindow.txt", r));
      await say(["Everything in this room, listed like files. The photo is the one that's glowing. Let's read it."]);
      return;
    }
    if (t === "grep") {
      GAME.toolCall("grep", '"?", "/bedroom/"');
      await say(["grep searches for a word across files, but we don't know what we're looking for yet. Let's read it first."]);
      return;
    }
    GAME.toolCall("read_file", '"/bedroom/friends_photo.png"');
    await say([{ who: "sign", text: "A photo of five friends, smiling. One of them has a strange, flickering outline..." }]);
    GAME.unlockCard("filesystem");
    if (S2.flags.clueJ) return;
    const flip = await menu("", [["Flip it over", true], ["Leave it", false]]);
    if (!flip) return;
    await say([{ who: "sign", text: "On the back, in faded ink:\n\"Best friends forever  -J\"" }, "J! That has to be the first letter of the password."]);
    S2.flags.clueJ = true;
    GAME.setClue("J", "store");
    GAME.toolCall("write_file", '"/memories/clue_J.md", "J"');
    GAME.unlockCard("memory");
    await say(["Saved to memory, so it survives even if my context gets wiped. (Press C to reread what you've learned.)"]);
  }
  // Ask Polly (H): a hint for whatever is unfinished, getting more direct each time you ask about the same thing.
  function nextHint() {
    const F = GAME._S.flags, here = GAME.state().area;
    const steps = [
      !F.clueJ && { key: "J", room: "bedroom", tiers: F.toolsIntro
        ? ["We read the photo, but did we look at the back of it?", "Go back to the photo on the mantel, read it with read_file, then choose \"Flip it over\"."]
        : ["That fireplace in the bedroom looked interesting. Something's sitting on the mantel.", "There's a photo on the bedroom mantel. Walk up to it and press Z."] },
      !F.fsExplained && { key: "hall", room: "bedroom", tiers: ["Let's see what's outside this room.", "The bedroom door is at the bottom of the room. Walk through it to reach the hallway."] },
      !F.clueBUILT && { key: "BUILT", room: "library", tiers: F.bookOnDesk
        ? ["That diary is enormous. If I read the whole thing, my head will fill right up.", "Don't read all of it. At the reading table, pick grep and search for the word you care about: we're after the password."]
        : here === "library" && !F.sawBurntPages ? ["Did you notice the fire in here? It's not green like the others.", "Look at the fireplace on the left wall. Something's burning in it."]
        : ["Libraries are good at keeping secrets.", "The library is through the lower door on the left side of the hallway. One book on the right-hand shelf glows purple: press Z in front of it."] },
      !F.clueT && { key: "T", room: "landing", tiers: F.traceShown
        ? ["The footprints upstairs end at some writing. Did we read it?", "Read the scrawl where the trail ends. The answer is a single letter: think about what starts \"terror\" and ends \"ghost\"."]
        : ["Something upstairs has been watching this house. Every step, in order.", "Take the stairs at the right end of the hallway. On the landing, there's a plant with an eye. Talk to it."] },
      !F.clueHI && { key: "HI", room: "bathroom", tiers: !F.curtainOpen
        ? ["There's something behind the shower curtain in the bathroom.", "In the bathroom, walk up to the bathtub and pull back the curtain."]
        : !F.hasEvals ? ["We shouldn't guess which bottle is safe. We need a way to test them.", "Pick up the evals kit from the little shelf next to the mirror, then go back to the bottles."]
        : ![1, 2, 3].every((k) => F["eval_" + ["stays_clear", "no_fizz", "smells_right"][k - 1]]) ? ["Run every test before trusting a bottle.", "At the bottles in the tub, run all three tests. Don't open anything yet."]
        : !F.mirrorRead ? ["The results aren't in my head. They're written down somewhere in this room.", "Walk over to the mirror above the sink and read the results."]
        : ["The mirror showed one bottle with a tick in every column.", "Go back to the tub and open the amber bottle."] },
      !F.sandboxTaken && { key: "trunk", room: "landing", tiers: ["That old trunk on the landing hums. I could open it, if you say so.", "Walk up to the trunk on the landing and press Z. I'll ask for your approval before I open it."] },
      !F.clueW && { key: "W", room: "scratch_room", tiers: !F.brickSeen
        ? ["The scratch room looks empty. But looking isn't the only way to find things.", "At the desk in the scratch room, choose ls. It lists everything in the room, even what you can't see."]
        : !F.brickPulled ? ["ls said there's a loose brick in this room. One of them is glowing a little.", "Walk up to the glowing brick on the back wall, to the left of the chalkboard, and pull it out."]
        : !F.codeSolved ? ["That sum has a few steps. Somewhere in this room is a good place to work things out.", "Go to the chalkboard and work through the sum one step at a time: 13 x 3, then + 9, then - 4."]
        : ["We worked out the code. Now use it.", "Go back to the lockbox in the wall and press Z. The code is 44."] },
      F.clueW && !F.cellarOpen && { key: "cellar", room: "landing", tiers: ["Somebody is knocking behind that chained attic door. And that W-shaped key must fit a W-shaped lock.", "Upstairs on the landing, the chained attic door next to the Watcher has a zigzag keyhole. Use the W on it."] },
      F.cellarOpen && !F.clueS && { key: "S", room: "attic", tiers: F.sandboxTaken
        ? ["The attic is open. Whoever was knocking is up there.", "In the attic, walk up to the shape at the window. When it offers its script, run it inside the sandbox."]
        : ["That thing in the attic wants us to run its script. We need somewhere safe to run code first.", "Open the trunk on the landing first: there's a sandbox inside."] },
      GAME._S.slots.every(Boolean) && { key: "door", room: "hallway", tiers: ["We have every letter!", "Go to the big red front door in the hallway and type the password from the top of the screen."] },
    ].filter(Boolean);
    return steps.find((st) => st.room === here) || steps[0];
  }
  async function askPolly() {
    const S2 = GAME._S;
    if (S2.lock) return;
    S2.lock = true;
    const t = await menu("What do you need?", [["I'm stuck. Any hints?", "hint"], ["Remind me what we're doing", "goal"], ["How do I play again?", "controls"]]);
    if (t === "goal") {
      const n = S2.slots.filter(Boolean).length;
      await say([`We're trying to escape the manor. The front door needs an 11-letter password, and we've found ${n} of the letters so far.`, "The letters we have are up in the top right. Every clue we find, I save to my long-term memory so I don't forget it."]);
    } else if (t === "controls") {
      await say(["Arrow keys to walk. Z to look at things, talk, or choose. X to back out.", "C opens Deep Agents explained, with everything we've learned so far. And H is me, whenever you need help."]);
    } else if (t === "hint") {
      const h = nextHint();
      if (!h) await say(["I think we've done everything. Try the front door!"]);
      else {
        S2.flags.hints = S2.flags.hints || {};
        const n = S2.flags.hints[h.key] = (S2.flags.hints[h.key] || 0) + 1;
        await say([h.tiers[Math.min(n, h.tiers.length) - 1], ...(n === 1 && h.tiers.length > 1 ? ["(Ask again if you'd like a bigger hint.)"] : [])]);
      }
    }
    S2.lock = false;
  }
  GAME.onHelp = askPolly;

  // The one object Polly has just pointed you at, if any. world3d floats a small marker over it.
  GAME.nextTarget = () => {
    const F = GAME._S.flags, tests = ["stays_clear", "no_fizz", "smells_right"].every((k) => F["eval_" + k]);
    if (GAME._S.lock) return GAME._lastTarget || null;                 // don't flicker during dialogue
    const pick = () => {
      const here = GAME.state().area;
      if (here === "bathroom" && !F.clueHI) {
        if (F.curtainOpen && !F.hasEvals) return "evals_kit";
        if (tests && !F.mirrorRead) return "mirror";
        if (F.mirrorRead) return "bathtub";
      }
      if (here === "scratch_room" && !F.clueW) {
        if (F.brickSeen && !F.brickPulled) return "loose_brick";
        if (F.brickPulled && !F.codeSolved) return "chalkboard";
        if (F.codeSolved) return "loose_brick";
      }
      if (here === "library" && F.bookOnDesk && !F.clueBUILT) return "reading_desk";
      if (here === "landing") {
        if (F.traceShown && !F.clueT) return "riddle_t";
        if (F.cellarMet && !F.sandboxTaken) return "old_trunk";
        if (F.clueW && !F.cellarOpen) return "cellar_door";
      }
      if (here === "hallway" && GAME._S.slots.every(Boolean)) return "front_door";
      return null;
    };
    return (GAME._lastTarget = pick());
  };
  // First time up in the attic: one quiet line, so you know where to look.
  setInterval(async () => {
    const S2 = GAME._S;
    if (S2.flags.atticSeen || S2.lock || GAME.state().ui || GAME.state().area !== "attic") return;
    S2.flags.atticSeen = true; S2.lock = true;
    await say([{ who: "you", text: "(It's quiet up here. Someone is standing at the window, with their back to you.)" }, "Hello? It's all right. We've come to get you out."]);
    S2.lock = false;
  }, 350);
  GAME._powerCut = powerCutScene;   // (for testing the cutscene on its own)

  // Which rooms are finished: the path turns gold with a tick, and world3d greys out the doors that lead there.
  GAME.roomDone = (id) => { const F = GAME._S.flags; return !!({ bedroom: F.clueJ, scratch_room: F.clueW, library: F.clueBUILT, bathroom: F.clueHI, landing: F.clueT && F.sandboxTaken && F.cellarOpen, attic: F.clueS })[id]; };
  setInterval(() => {
    const el = document.getElementById("hud-path"), here = GAME.state().area, room = CONTENT.map.rooms.find((r) => r.id === here);
    if (!el || !room) return;
    const done = GAME.roomDone(here);
    el.classList.toggle("done", done);
    el.textContent = room.path + (done ? " \u2713" : "");
  }, 300);

  // Flavour lines for things that used to answer "Nothing special."
  const LOOKS = {
    hall_couch_2: ["Velvet, tufted, and very dramatic.", "There's a dent in the cushion where somebody used to sit. It never filled back in."],
    curio_shelf_land: ["Bell jars. Each one holds something small that isn't moving anymore.", "Someone labeled them all. Tidily."],
    sword_rack: ["Three swords, hung up neatly.", "One of them has a nick in the blade. I'd rather not know from what."],
    land_curtains: ["Heavy curtains, pulled tight. There's a window behind them.", "...Something just tapped on the glass. Let's leave them shut."],
    bath_towels: ["Stiff with dust.", "Nobody has used these in a long, long time."],
    bath_cabinet: ["Soap, a jar of something green, and a very old brush.", "Nothing we need. I hope."],
    bath_window: ["Fogged on the inside, moonlight on the outside.", "It doesn't open. I checked while you were asleep."],
    birdbox_1: ["A bird box! Something in there is rustling.", "Not mine. Mine's the big one in the middle."],
  };
  for (const [id, lines] of Object.entries(LOOKS)) if (GAME._objects[id] && !GAME._objects[id].look) GAME._objects[id].look = lines;
  // Props that used to be scenery only: each gets a small card and a line or two.
  const EXTRA_PROPS = {
    nightstand_l: ["Nightstand", "A pile of unopened letters.", ["A pile of unopened letters.", "They're all addressed to the same name. It's been scribbled out."]],
    bed_bookshelf: ["Bookshelf", "Bedtime reading.", ["\"Tidying Up for Agents.\" \"How to Never Ask Permission.\"", "Both look very well read."]],
    hall_mirror_2: ["Hallway mirror", "Tarnished silver.", ["Your reflection is half a second late.", "...Let's keep moving."]],
    hall_mirror_3: ["Hallway mirror", "Cloudy glass.", ["I'm not in the reflection.", "It's just the angle. I'm sure it's just the angle."]],
    hall_mirror_r: ["Hallway mirror", "Fingerprints on the glass.", ["Fingerprints on the glass.", "On the inside."]],
    hall_table_1: ["Console table", "Dried flowers in a vase.", ["Dried roses. They crumble if you breathe near them."]],
    hall_table_2: ["Console table", "A guest book.", ["A guest book. Five names on the first page.", "Nobody has signed it since."]],
    hall_chair_1: ["Armchair", "Red velvet, a little worn.", ["A red velvet armchair.", "The seat is worn smooth. Someone used to sit here a lot."]],
    bath_pipes: ["Pipes", "They knock now and then.", ["The pipes knock every so often.", "It's the plumbing. Probably."]],
    crate_1: ["Crate", "Stamped DELETED.", ["A crate stamped DELETED.", "There are dozens of them up here."]],
    crate_2: ["Crate", "Stamped ARCHIVED.", ["This one says ARCHIVED. It's empty."]],
    crate_3: ["Crate", "Full of tangled cables.", ["Tangled cables and burnt-out bulbs.", "Somebody was building something up here."]],
    barrel_1: ["Barrel", "Lined with a newspaper.", ["It's lined with an old newspaper. No, wait, a new one.", "The headline says \"LangChain announces Series C.\"", "More funding for agents like me? I'll take it."]],   // easter egg
    barrel_2: ["Barrel", "Scratched inside.", ["Empty. Something scratched the inside."]],
    birdbox_2: ["Bird box", "Something tiny lives here.", ["A tiny bird peeks out, then hides again."]],
    birdbox_3: ["Empty bird box", "Waiting for someone.", ["This one's empty. I'm saving it for the helpers I'll send out one day.", "Subagents. I'd hand each one a job, and it would go off with its own fresh context window and bring back just the answer."]],
    birdbox_5: ["Bird box", "Someone's asleep inside.", ["Someone's asleep in there. Let's tiptoe."]],
    birdbox_6: ["Bird box", "Something's humming inside.", ["Something in here is humming to itself.", "Badly. But with feeling."]],
  };
  for (const [id, [title, line, look]] of Object.entries(EXTRA_PROPS)) {
    const o = GAME._objects[id]; if (!o || o.card) continue;
    o.card = { title, line }; o.look = look;
  }

  // The front door: always tells you how close you are.
  async function frontDoor() {
    const S2 = GAME._S, have = S2.slots.filter(Boolean).length, total = S2.slots.length;
    if (have < total) { if (typeof SFX !== "undefined") SFX.rattle(); }
    if (!have) { await say(["Eleven little letter slots, and a lock that wants a password.", "We don't have a single letter yet. Let's look around."]); return; }
    if (have < total) { await say([`Eleven letter slots. We've found ${have} of them so far.`, "Not enough yet."]); return; }
    S2.lock = true;
    await say(["Eleven slots, and we have eleven letters. Type it in!"]);
    while (true) {
      if (typeof SFX !== "undefined") SFX.typing();
      const pw = await askText("Type the password", "the letters up top", "password: ", "", "Type the password and press Enter. Esc to cancel.", 16);
      if (!pw) { S2.lock = false; return; }
      if (pw.toUpperCase().replace(/[^A-Z]/g, "") === CONTENT.password) break;
      GAME.shake(200, 2);
      await say(["Bzzt. The lock doesn't like that.", "Check the letters at the top of the screen and try again."]);
    }
    await ending();
  }
  // Using something from the inventory (keys 1-4).
  GAME.onUseItem = (id) => {
    if (GAME._S.lock) return true;
    if (id === "sandbox_cube") { say(["The sandbox hums quietly. It's a safe box for running code.", "Nothing here needs running yet. But I'm glad we have it."]); return true; }
    if (id === "w_key") { say(["A key shaped like a W. Somewhere in this house there's a W-shaped keyhole."]); return true; }
    if (id === "evals_kit") { say([GAME._S.flags.clueHI ? "The evals kit. It already did its job: it found the one bottle we could trust." : "The evals kit: the same tests for every candidate. Let's use it on those bottles in the bathtub."]); return true; }
    return false;
  };

  GAME.onInteract = (id) => {
    if (id === "front_door") { frontDoor(); return true; }
    if (id === "land_mirror" && !GAME._objects.riddle_t.hidden) { riddleT(); return true; }   // the riddle is written on the glass
    if (id === "desk") { desk(); return true; }
    if (id === "loose_brick") { looseBrick(); return true; }
    if (id === "chalkboard") { chalkboard(); return true; }
    if (id === "cellar_door") { cellarDoor(); return true; }
    if (id === "portrait") { portrait(); return true; }
    if (id === "eye_plant") { watcher(); return true; }
    if (id === "riddle_t") { riddleT(); return true; }
    if (id === "bathtub") { bathtub(); return true; }
    if (id === "glow_book") { glowBook(); return true; }
    if (id === "lib_fireplace") { libFire(); return true; }
    if (id === "nest") { nest(); return true; }
    if (id === "sleeping_snake") { if (typeof SFX !== "undefined") SFX.snake(); python(); return true; }
    if (id === "old_trunk") { trunk(); return true; }
    if (id === "evals_kit") { evalsKit(); return true; }
    if (id === "mirror") { mirror(); return true; }
    if (id === "reading_desk") { readingDesk(); return true; }
    return false;
  };
})();
