# Out of Context

> **Early concept.** This is the original design doc, written before the game was built, so some details changed. In the finished game you play a person, Polly is the Deep Agent, and there is no trapped friend. The game itself doesn't run an agent. See the [README](README.md) and [How the Deep Agents Harness was used in this project](How%20Deep%20Agents%20was%20used%20in%20this%20project.md) for the final version.

A spooky escape game where you play as a deep agent. Each Deep Agents feature is one of your abilities, and you use them to get yourself and a trapped friend out of a haunted house.

**Goal:** a visual, playful way to understand how Deep Agents works
**Built with:** Deep Agents (Python), LangGraph, LangSmith · **Length:** 20 to 40 minutes

## Pitch

You wake up as a deep agent inside a haunted house, alongside a human who's trapped there too. The house is a maze of rooms, locked doors and puzzles. You can't escape with brute force. You plan, read clues, send helpers ahead, keep a journal, and check with your human before risky moves. By the end you've used every part of the harness without needing a lecture.

## Tone

Spooky and atmospheric, closer to an escape room than a horror film. The house is the obstacle. The agent is clever and capable, and the player should leave feeling that Deep Agents is a set of tools they understand.

## Abilities

| Deep Agents feature | Your ability | What it teaches |
|---|---|---|
| `write_todos` | Escape plan: a checklist that updates as you learn | Planning and revising a plan |
| `ls`, `read_file`, `grep` | Look around rooms, read clues, search the whole house for a word | The agent's filesystem |
| `write_file`, `edit_file` | Leave notes for yourself, fix a broken combination or spell | Writing and editing files |
| Subagents | Send a helper to scout a room. It comes back with a short report | Delegation and context isolation |
| Async subagents | A helper holds a door open while you keep moving | Background tasks |
| Summarization | Your journal fills up, so you condense it to the key points. The full version is saved in `/conversation_history/` if you need a detail later | Context limits and compaction |
| Skills | A spellbook. You see each spell's title and only open the full page when you need it | Progressive disclosure |
| Memory (AGENTS.md) | Your core rules, always with you in every room | Persistent instructions |
| `interrupt_on` | Your human friend approves risky moves, like opening the cellar door. They can say yes, adjust the plan, decline, or offer advice | Human-in-the-loop as teamwork |
| `permissions` | Some rooms are locked or read-only | Filesystem permissions |
| Checkpointer | Save candles. Quit and pick up exactly where you left off | Durable execution |
| Store | A second run starts with what you learned last time | Long-term memory |
| LangSmith | At the end, replay your whole escape step by step | Tracing and observability |

## Acts

1. **The front hall:** learn to look, read, and plan. Ends when your escape plan is complete.
2. **The east wing:** too many rooms to explore alone. Send helpers, use your spellbook, and condense your journal.
3. **The cellar door:** the final door needs your friend's approval and everything you've learned. After you escape, watch the replay of your run.

## Two ways to play

- **Play mode:** the player chooses which ability to use each turn. No model needed, so it's fast and cheap.
- **Watch mode:** a real `create_deep_agent` with the same tools escapes the same house, and the player approves its risky moves. Afterwards, compare its LangSmith trace to your own run.

## Architecture

Terminal UI (Textual) → Python game engine (house state + abilities) → optional `create_deep_agent` for watch mode → traces to LangSmith.

```python
agent = create_deep_agent(
    model=AGENT_MODEL,
    tools=[open_door, move_to, use_item],
    system_prompt=ESCAPE_PROMPT,
    subagents=[scout],
    skills=["/spellbook/"],
    memory=["/AGENTS.md"],
    backend=house_backend,
    permissions=locked_rooms,
    interrupt_on={"open_door": True},
    checkpointer=checkpointer,
    store=store,
    name="escape_agent",
)
```

The engine owns all state, so in watch mode the agent can only change the house through tools.

## Prototype (1 to 2 days)

1. Five rooms as folders, door and item state in Python.
2. Play mode with look, read, plan, and open door.
3. Approval prompt from your friend for the cellar door.
4. One scout subagent and one spell.
5. Watch mode with a real deep agent and its LangSmith trace.
6. Playtest Act 1.
