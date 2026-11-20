---
name: playtesting
description: How to test the game with the `playtest` tool (headless Chrome), what to check after each milestone, and how to read screenshots. Use after every meaningful change.
---

# Playtesting

The `playtest` tool opens `/game/index.html` in headless Chrome, runs a list of steps, and returns JSON with:
- `errors`: uncaught exceptions and console errors (must be empty)
- `results`: the value of every `eval` step
- `shots`: screenshot paths under `/playtest/` (view them with `read_file`, which returns the image)

## Steps

`actions_json` is a JSON array. Each step is one of:
- `{"press": "z"}`: tap a key (`"ArrowUp"`, `"Enter"`, `"Escape"`, `"1"`, letters...)
- `{"key": "ArrowRight", "ms": 600}`: hold a key for some milliseconds
- `{"wait": 500}`
- `{"eval": "JSON.stringify(GAME.state())"}`: run JavaScript in the page
- `{"shot": "name"}`: save `/playtest/name.png`

Use the `window.GAME` debug API (`state`, `teleport`, `choose`, `advance`, `typeLetter`, `skipTo`) to reach a beat fast, then check it with real key presses.

## After every milestone

1. Zero errors on load and through the beat.
2. Walk at least once with real arrow keys (not only teleport). Doorways must be easy to pass.
3. Take 2-3 screenshots and look at them: text readable, nothing covered by the HUD, lighting dark but legible, palette purple/green/orange.
4. Check the state after the beat (letters, flags, ctx, thread).
5. **Boundary sweep (every milestone):** from at least 5 spots, including inside every doorway and in each room corner, hold each arrow key for 2-3 seconds (and diagonals), then check `GAME.checkBounds()` and `GAME.violations` are empty and the player's position is plausible. Walk into every room and back out with real keys. Check that the player is never inside a wall, never off-screen, and never ends up somewhere unreachable after a room transition, teleport, cutscene or respawn.
6. Report: what works, what's broken, what feels off. Be specific.
