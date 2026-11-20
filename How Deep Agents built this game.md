# How Deep Agents was used to build this game

## 1. A Deep Agent started the build

The first version was built by a Deep Agent, set up in the `studio/` folder.

- **Library:** `deepagents`, with Claude (Opus 5.5) as the model.
- **Filesystem:** the `studio/workspace/` folder. The agent wrote the game files there.
- **Skills:** three skill files in `studio/workspace/skills/`:
  - `game-design`: the game's design spec.
  - `deepagents-facts`: accurate facts about Deep Agents, so the game teaches them correctly.
  - `playtesting`: how to test the game.
- **Tool:** `playtest`, which opens the game in headless Chrome, presses keys, and returns errors and screenshots (`studio/playtest.mjs`).
- **Subagent:** a playtester that tested each milestone and reported bugs.
- **Checkpointer:** a SQLite checkpointer, so the build could stop and resume on the same thread.

The agent built the game one milestone at a time, and each milestone was reviewed before the next.

## 2. The game teaches you about the Deep Agents Harness

The game itself does not run an agent. Polly's lines and puzzles are written by hand.

- Each puzzle is based on a real Deep Agents feature: the filesystem, context window, threads, memory, human in the loop, sandboxes, evals and tracing.
- The green tool calls on screen show what a real Deep Agent would call at that moment.
- The cards (press C) show real `deepagents` code for each feature.
