---
name: deepagents-facts
description: Verified facts about Deep Agents, plus the exact text for every "under the hood" concept card in the game. Use this whenever writing card text, bird explanations, or code snippets shown to players. Never invent API names beyond what is listed here.
---

# Deep Agents facts (verified)

These were checked against the deepagents source. Use them as the only source of truth for concept text. If something you want to say is not here, leave it out.

- `create_deep_agent(model=..., tools=..., system_prompt=..., subagents=..., skills=..., memory=..., backend=..., permissions=..., interrupt_on=..., checkpointer=..., store=..., name=...)` builds a deep agent.
- Built-in filesystem tools: `ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, `grep`. A sandbox backend also adds `execute`.
- `write_todos` is the built-in planning tool (a to-do list).
- `StateBackend` stores files in the agent's state: they persist within a thread and not across threads.
- `StoreBackend` stores files in a LangGraph Store: persistent and shared across threads.
- `CompositeBackend(default=..., routes={"/prefix/": backend})` routes by path prefix, longest prefix first, strips the prefix before calling the routed backend, and sends unmatched paths to the default. Two routes may share one backend.
- Summarization is built in. When context gets large, older messages are replaced by a summary, and the full history is offloaded to `/conversation_history/{session_id}.md`.
- Offloading: very large tool results are saved under `/large_tool_results/`; very large messages from the user are saved under `/conversation_history/`. The agent keeps a preview with the file path and can `grep` the file or `read_file` it with `offset` and `limit`. The notice the agent sees begins: `Message content too large and was saved to the filesystem at: <path>` and then `You can read the full content using the read_file tool with pagination (offset and limit parameters).` and `Here is a preview showing the head and tail of the content:`.
- Skills: folders with a `SKILL.md` (frontmatter `name` and `description`). The agent sees names and descriptions first and loads the full file only when relevant (progressive disclosure). Passed with `skills=["/skills/"]`.
- Human-in-the-loop: `interrupt_on={"tool_name": True}` pauses before that tool runs (requires a checkpointer). Decisions are approve, edit, reject, or respond. **In player-facing text, call "reject" "Deny" or "decline".** Resume with `Command(resume={"decisions": [{"type": "approve"}]})` from `langgraph.types`.
- Threads: `config={"configurable": {"thread_id": "..."}}`. A new thread gets fresh state; the Store is shared.
- LangSmith tracing turns on with environment variables `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY`.
- Evals in LangSmith: `from langsmith import evaluate` then `evaluate(target, data="dataset-name", evaluators=[...])`.
- Security model: Deep Agents trusts the model to use whatever tools it has, so boundaries are enforced at the tool and sandbox level.

# Concept card text (use exactly; light edits for length only)

**context** - Title: "Under the hood: the context window"
Body: Everything the agent is holding right now (your messages, its replies, every tool result) lives in its context window. The bar at the top shows how full it is. When context gets too full, models start missing details. People call this context rot. In this house, clues start to blur.

**filesystem** - Title: "Under the hood: the filesystem"
Body: Every deep agent gets a filesystem and built-in tools to use it: ls, read_file, write_file, edit_file, glob and grep. In this house, rooms are folders and objects are files. Walking around is the bird browsing its filesystem.
Code:
```
from deepagents import create_deep_agent

agent = create_deep_agent(model=MODEL)
# ls, read_file, write_file, edit_file,
# glob and grep are built in
```

**summarization** - Title: "Under the hood: summarization"
Body: When the context window fills up, Deep Agents condenses older messages into a short summary so the agent can keep going. The full conversation is saved to a file under /conversation_history/. That's why writing important details to files first is a good habit: the summary can be short because the details are on disk.

**state** - Title: "Under the hood: state (scratch space)"
Body: The chalkboard is the agent's state: files that belong to one thread (one conversation). It's the right place for working out, drafts and notes. An agent has no location in its filesystem: write_file takes any path, so the bird can write to the chalkboard from anywhere. When a new thread starts, state starts fresh.
Code:
```
from deepagents.backends import StateBackend

backend = StateBackend()  # files for this thread only
```

**store** - Title: "Under the hood: the Store (two doors, one room)"
Body: The nest is the Store: long-term memory that survives across threads. The satchel and the nest are two paths routed to the same StoreBackend by a CompositeBackend. The router strips the prefix, so /satchel/clue_J.md and /nest/clue_J.md are the same file. The Store keeps everything forever, so only keepers go in.
Code:
```
nest_store = StoreBackend(namespace=lambda rt: ("nest",))

house_backend = CompositeBackend(
    default=StateBackend(),       # rooms + chalkboard
    routes={
        "/satchel/": nest_store,  # what you carry
        "/nest/": nest_store,     # where it lives
    },
)
```

**tracing** - Title: "Under the hood: tracing"
Body: The UV light shows every step something took. LangSmith tracing does that for agents: every model call and tool call is recorded in order, so you can see exactly what happened and why.
Code:
```
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=...
```

**offloading** - Title: "Under the hood: offloading"
Body: The transcript was far too big to hold in context. When a message is huge, Deep Agents saves it to a file under /conversation_history/ and keeps only a preview (the start and the end) plus the file path. Huge tool results get the same treatment under /large_tool_results/. The agent can then grep the file or read it a page at a time.

**thread** - Title: "Under the hood: a new thread"
Body: Waking up again started a new thread. State belongs to a thread, so the chalkboard was wiped and the context window starts empty. The Store doesn't belong to any one thread, so the nest (and everything in the satchel) survived.
Code:
```
agent.invoke(msg, config={"configurable": {"thread_id": "1"}})
# ...power cut...
agent.invoke(msg, config={"configurable": {"thread_id": "2"}})
# thread 2: fresh state, same Store
```

**evals** - Title: "Under the hood: evals"
Body: Evals run your agent or app against a set of test cases and score the results, so you know it works before you trust it for real. The test strips were the test cases, the pass/fail checks were the evaluators, and the cellar lock is production.
Code:
```
from langsmith import evaluate

evaluate(
    pick_bottle,
    data="bottle-tests",
    evaluators=[melts_metal, safe_to_hold, no_fumes],
)
```

**sandbox** - Title: "Under the hood: sandboxes"
Body: The rogue agent ran untrusted code directly on the house. A sandbox backend gives an agent an isolated place to run commands (the execute tool), so code can run without touching anything outside it. Deep Agents enforces boundaries at the tool and sandbox level.
Code:
```
agent = create_deep_agent(
    model=MODEL,
    backend=sandbox,  # a sandbox backend adds execute
)
```

**hitl** - Title: "Under the hood: human-in-the-loop"
Body: Some tools are too risky to run without asking. With interrupt_on, the agent pauses before calling them and waits for a human: approve it, edit the arguments, decline, or respond with a message.
Code:
```
agent = create_deep_agent(
    model=MODEL,
    interrupt_on={"open_door": True},
    checkpointer=checkpointer,
)
```
