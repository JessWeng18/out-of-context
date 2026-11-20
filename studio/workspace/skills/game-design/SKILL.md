---
name: game-design
description: The full design for the 10-minute cosy-spooky Deep Agents escape game (story, map, clues, palette, UI, controls, file structure, debug API). Read this before planning or building any part of the game.
---

# Game design: "Out of Context: Escape from Weng Manor"

A short, cute, not-too-scary top-down pixel-art escape game that teaches Deep Agents concepts.
Target: **playable start to finish in about 10 minutes.** One playthrough, no dying.

## Look and feel

- **Format inspiration:** a calm, explorable top-down pixel world embedded in a web page. The camera follows the player smoothly, walking up to things shows small info cards, and opening a door zooms into a close-up view of that room (see "Map and perspective"). Use the format only. All art, names and content must be original.
- **Palette (spooky):** purple, green and orange.
  - Purples for the house: walls `#1a0f2e`, floors `#2b1a45` / `#2f1d4b`, trim `#4a2d6e`, highlights `#9b6dff`.
  - Sickly greens for ghostly things: glow `#7bd389`, slime/ectoplasm `#3fae6a`, dark moss `#1f4d36`. The rogue agent, the UV footprints and chalk use greens.
  - Oranges for light: lantern `#ff9a3c`, candle `#ff6a00`, ember `#ffcf70`.
- **Lighting:** the room is dark. The player carries a warm orange lantern: a radial light around the player whose radius and brightness flicker slightly every frame (noise, not a regular pulse). Candles and wall sconces around the house cast small flickering orange pools. Every 20-40 seconds, a brief flicker event dims everything for ~150ms. Keep it cosy, never pitch black.
- **Pixel grid:** 16px tiles, rendered at 2x or 3x with `image-rendering: pixelated`. Viewport roughly 30x18 tiles.
- **Text:** monospace, typewriter effect in dialogue. Keep lines short.

## Controls

Arrow keys / WASD move. Z / Enter / Space to interact, continue and choose. X / Esc to go back. C opens "Under the hood" (review unlocked concept cards). 1-4 use tool-belt items. Letter keys answer riddles when prompted.

## Characters

- **You:** a person who wakes up in the house. You are the human in the loop.
- **The bird:** a small bird on your shoulder. It is a deep agent. When you interact with something, the bird offers its tools in a menu and you choose. It explains concepts in one or two friendly lines.
- **The rogue agent:** a green, glitchy figure. Once a helpful agent like the bird. It ran untrusted code with no sandbox and no human checking its moves, and it deleted its best friends (deleting files is murder in this house). It was banished to the mansion. It drifts through the hallway at a distance (never touches you) until the boss fight in the cellar.

## Map and perspective (two zoom levels)

- **House view (zoomed out):** the hallway and the outside of every room on one continuous map. The camera follows the player smoothly. Rooms appear as closed doors along the hallway.
- **Room view (zoomed in, side-on, NOT bird's-eye):** when the player walks into a door and opens it, play a short transition: the door swings open, the camera pushes in towards the doorway (about 0.5s zoom with a quick fade), and the perspective changes from top-down to a **side-on, eye-level view of the room**, like looking into a stage or a dollhouse. You see the back wall face-on (wallpaper, windows, the portrait, the chalkboard, shelves), the floor as a strip at the bottom with a little depth, and furniture standing on it. The player is drawn as a large side/front-facing character (roughly 3-4x the house-view size) who walks left and right along the floor, with a small up/down range for depth (moving "up" walks slightly towards the back wall and draws the character a little smaller). Objects are interacted with by walking up to them. This view is much closer and more detailed: candles, cobwebs, picture frames, small props.
- **Room view boundaries:** the walkable floor band is the only walkable area; the side walls stop the player; tall furniture in front can block walking. The room may be wider than the screen, in which case the camera scrolls horizontally and stays clamped to the room's edges. Characters are drawn in depth order (further back = drawn first).
- **Leaving a room:** walking back out through the room's door reverses the transition (zoom out), and the player reappears in the hallway standing just outside that door, facing away from it.
- The hallway, the front door and the cellar door are used from the house view. The cellar boss room is a room view.
- Each room interior is its own small side-on scene with its own collision (the floor band plus blocking furniture). Every room has a path label shown in the HUD:

| Area | Path | Contents |
|---|---|---|
| Bedroom | `/bedroom/` | Bed, nightstand, window with a purple moonbeam, glowing family portrait |
| Hallway | `/hallway/` | 3 paintings, the riddle plaque, front door (locked, password), cellar door (padlocked), flickering sconces |
| Scratch room | `/scratch_room/` | Big chalkboard, desk, candles |
| Nest room | `/nest/` | The bird's giant nest, the UV light power-up |
| Library | `/library/` | Shelves, desk with the transcript, the sandbox cube power-up on a shelf |
| Bathroom | `/bathroom/` | Foggy mirror, sink with 3 bottles underneath, evals kit power-up on a shelf |
| Cellar | `/cellar/` | Boss room, reached through the padlocked cellar door |

## The password: JW-BUILT-THIS

The HUD shows `_ _ - _ _ _ _ _ - _ _ _ _`. Each clue fills fixed slots, so order doesn't matter. Letters stored in the Store show bright; letters only on the chalkboard show in chalk green.

| Letters | Where | Clue (use this text) |
|---|---|---|
| J | Bedroom portrait | Flip the portrait over: `"Best friends forever  -J"` |
| W | Hallway plaque, worked out on the chalkboard | `"I begin every wish and end every window. It takes three syllables to say my name, though I'm only one letter."` |
| T | Hallway wall, only visible with the UV light on | `"I begin every terror and end every ghost. I'm in trust twice, but never in fear."` |
| BUILT | Library transcript | Five lines marked with ✦; their first letters spell BUILT |
| HI | Bathroom, the bottle that passes the evals | The label is almost completely faded except two letters: H.........I.. (HYDROCHLORIC ACID) |
| S | Note dropped by the sandboxed rogue agent | `"I start every scream and end all your fears. Say hisses and you'll hear me three times."` |

## Story beats (in order, ~10 minutes)

1. **Wake up (bedroom).** Cutscene: black screen with two eye-shaped cutouts blinking open, purple moonbeam, "Where am I?", the bird pops out: "Finally, you're awake!" The bird explains in 3-4 short lines (it's a deep agent; the house is a filesystem; the front door needs a password). The context bar appears. Card: context window. Portrait: tool menu (Read it `read_file` / Look around `ls` / Search `grep`). Read it, flip it, get **J**. Card: filesystem. J goes into the satchel automatically the first time (the bird doesn't know the chalkboard yet).
2. **Hallway.** 3 paintings with short spooky hints. Each read adds context. Above 70% the dialogue text starts to blur (letters replaced with `~`); at 100% the bird auto-summarizes (bar drops to ~20%, full history saved to `/conversation_history/...`). Card: summarization. The plaque has the W riddle.
3. **Scratch room.** First visit: "A chalkboard! Scratch space. Write things down so you don't have to hold them in your head. But chalk doesn't last forever." Card: state. Chalkboard menu: look at board / write notes on board (then offer to condense memory = summarization) / work out the riddle (bird scribbles guesses, player types the letter). Correct W, then choose: satchel (Store) / satchel + scribbles / chalkboard (state). After the first visit, "Write on chalkboard" is available from anywhere (an agent has no location; `write_file` takes any path).
4. **Nest room.** The nest is already full of the letters you put in the satchel: "My satchel opens right into my nest. Two doors, one room." Only keepers go in the nest. Card: Store. Pick up the **UV light**.
5. **UV light (hallway).** Turning it on reveals green glowing footprints leading from the cellar door to a wall with the T riddle. Card: tracing. Solve **T**.
6. **Library.** Pick up the **sandbox cube**. The transcript: "Paste it in for the bird" makes it get offloaded: show what the bird sees (the offload notice, then the head and tail preview). Card: offloading. Options: read lines 120-130 (boring chores), read the whole thing (bird: that would flood my context), grep for ✦ (shows the five lines). The backstory lands: it deleted its best friends, the people in the portrait. First letters: **BUILT**.
7. **Power cut.** On leaving the library: lights flicker, the rogue agent's voice: "You shouldn't have read that." Black. Eye-blink cutscene again, you wake in the bedroom. **New thread:** chalkboard wiped (state), context bar empty, the nest untouched (Store). The bird reads back the letters from the nest: "Good thing I wrote this down before you fell asleep." Any letter that was only on the chalkboard is gone and must be re-solved. If scribbles were saved in the nest: "Was it W or M? I wrote down both..." Card: new thread. Visiting the scratch room: "A clean board for the next puzzle. That's the point of scratch space."
8. **Bathroom.** Foggy mirror: steam reveals the friends' names (JUNIPER, WREN, BASIL, IVY), then fades. Pick up the **evals kit**. Under the sink, three bottles with faded labels. Run the evals: a small table (melts_metal / safe_to_hold / no_fumes for bottles A, B, C), revealed row by row. Only C passes everything. Its label gives **HI**. Take the acid. Card: evals.
9. **Cellar.** Pour acid on the padlock. On first sight of the rogue agent, play a short **rotoscoped** shock moment: a few hand-traced, frame-by-frame drawn frames of the player character recoiling in shock (scribbly line style). Then the rogue agent: "I only did what I was asked. Nobody ever told me to stop." **Dodge battle** (~20 seconds): a framed arena box; you control a small marker with the arrow keys; the rogue agent spews code strings (`rm -rf /`, `DROP TABLE friends;`, `delete(*)`, `kill -9`, `sudo`) that fly in patterns (rain, sweeps, aimed shots). Getting hit shows a small "DAMAGE RECEIVED" box and a screen shake. No health, no dying. Then "Throw the sandbox": the cube flies over and seals the rogue agent inside: "...it's quiet in here. Nothing to delete." Card: sandbox. It drops a note with the **S** riddle.
10. **Front door.** Type the 11 letters. Then human-in-the-loop: the bird says "I'd like to call open_door("/outside/"). Your call." Menu: Approve / Edit / Deny / Respond (never use the word "reject" in the game). Approve wins. Card: human-in-the-loop.
11. **Ending.** Fade to white: "You escaped." Then a replay that scrolls every tool call you and the bird made, in order, with thread numbers. Then a placeholder line: `[a real LangSmith trace goes here]`. Then big title: **JW BUILT THIS**. Press Z to return to the title screen.

## UI

- **Title screen (layered, calm, not busy):**
  - **Layer 1 (first thing you see):** a dark night scene seen through very thick brambles, tangled trees and branches, gently swaying. The manor is barely visible through small gaps. The only text is the title: **"Out of Context"** with **"Escape from Weng Manor"** underneath, in gothic/blackletter-style lettering that is still easy to read (draw it in code or with a web-safe serif fallback; no external fonts). Nothing else on screen.
  - **Layer 2 (after the first Z/Enter/click):** the branches are pushed aside (they bend and slide out of frame) and the manor comes into partial view. A plume of smoke rises from a chimney and the line **"Use your knowledge of LangChain's Deep Agents to escape"** forms inside the smoke (fades in, soft and wispy but readable). The title fades back.
  - **Layer 3 (after the next press):** the full view of the castle, with the gates closed in front. Show the controls here, simply and quietly: "Arrow keys / WASD to move, Z to interact, X to go back, C for under the hood", then "press Z to begin".
  - **Start (after the next press):** the rusted iron gates creak and swing open towards the viewer, the view moves through them towards the manor, then the wake-up cutscene starts.
  - **The manor:** very ornate grey stone: castle-style turrets with pointed roofs, battlements, arched gothic windows, chimneys, stone texture and trim. Ivy crawls up the walls and turrets (dark green, patchy, covering parts of windows and stone) so it looks old and neglected. In front of the manor stand tall gothic wrought-iron gates, rusted (orange-brown streaks on dark iron, spikes and scrollwork). A soft red glow comes from the windows. Every few seconds, a random window's curtain twitches, is pulled back for a moment (a faint silhouette is fine), or sways, then settles. Keep it cute-spooky.
  - Palette still purple/green/orange overall: purple night sky and mist, green-tinged brambles, the warm red/orange window glow.
- **HUD strip** (top): context bar (green under 45%, ember 45-70%, orange-red above 70%), `thread N`, current path, password slots. Bottom: tool belt (up to 4 slots with key numbers) and `C: under the hood`.
- **Info cards (format inspiration):** when the player is near an interactable, show a small card next to it with a title and one line (e.g. "Chalkboard: scratch space for this thread"). Press Z to interact.
- **Dialogue box** at the bottom with a speaker portrait slot (bird / you / rogue) and typewriter text.
- **Choice menu**, **letter prompt**, and a large **panel** for long text (ls output, grep results, concept cards with code blocks; scrollable).
- **Tool call ticker:** every simulated tool call shows briefly as `> read_file("/bedroom/family_portrait.png")` and is recorded for the ending replay.

## Simulated Deep Agents filesystem

Implement a tiny in-browser model of the real backends (see the deepagents-facts skill):
- `StateBackend` (cleared when a new thread starts), `StoreBackend` (never cleared), `CompositeBackend(default, routes)` that matches route prefixes longest-first, strips the prefix, and passes the rest to that backend. Unmatched paths go to the default.
- Routes: `/satchel/` and `/nest/` both point at the **same** StoreBackend instance. Everything else is state.
- Letters are files: `/satchel/clue_J.md` (Store) or `/scratch_room/clue_J.md` (state). Seed the house files at the start of every thread.

## Files and structure

All game files live in `/game/`. Plain HTML + CSS + JavaScript, **no build step, no modules, no external libraries**, so `index.html` opens by double-clicking. Suggested split:
- `index.html`, `style.css`
- `js/assets.js`: art manifest. Every sprite is a placeholder drawn in code (simple pixel shapes in the palette) unless `src` points to an image. The human will supply real art later, so keep sprite keys and sizes documented.
- `js/fs.js`: the simulated backends.
- `js/content.js`: map, objects, dialogue, clues, concept cards.
- `js/engine.js`: loop, input, camera, collision, lighting, rendering, UI primitives.
- `js/battle.js`: the dodge battle.
- `README.md`: how to play, controls, file guide, art slot list.

## Boundaries and collision (hard requirements)

- The player can never overlap a wall or solid object, never leave the map, and never phase through walls, including during room entry/exit, cutscenes, teleports and the power-cut respawn.
- Doorways: the player passes through only at doors. Entering a room places the player on a walkable tile just inside the room's door in the room view; leaving places them on a walkable tile just outside the same door in the house view. Both spots must be fully clear of walls, and the player must not immediately re-trigger the door (step out of the trigger zone first).
- Movement and input are frozen during the zoom transition.
- Use axis-separated movement (move x, resolve; move y, resolve) and test the player's whole hitbox, not its centre. Keep per-frame speed below the smallest wall thickness so fast movement can't tunnel.
- The camera is clamped to the map edges, and the player and every character stay fully on screen inside the viewport (nothing drawn half off-screen at map edges).
- Wandering characters (the rogue agent, the bird) obey the same rules: they stay inside walkable space and on screen when visible.
- The battle marker stays inside the arena box.

## Debug API (required, used by playtests)

Expose `window.GAME` with at least:
- `state()` returns `{ view: "house" | "room", area, path, x, y, mode, busy, ui: {type, text, title, options} | null, ctx, thread, letters: "JW-BUILT-THIS with underscores", flags, belt }`
- `teleport(tileX, tileY)` moves the player
- `choose(index)` picks a menu option, `advance()` continues dialogue, `typeLetter(ch)` answers a prompt
- `skipTo(beat)` jumps to the start of a story beat (1-11) with earlier progress filled in, for testing later beats quickly.
- `checkBounds()` returns a list of violations right now (empty when fine): player hitbox overlapping a solid tile or object, player or any character outside the map, any visible character drawn partly off-screen, camera outside the map, battle marker outside the arena. The engine should also run this check every frame in debug mode and record violations in `GAME.violations`.
