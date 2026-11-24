# Out of Context: Escape from Weng Manor

A short escape game that teaches you about LangChain's Deep Agents Harness.

- **Play:** open `studio/workspace/game/index.html` in a browser. See the [game README](studio/workspace/game/README.md) for controls.
- **How Deep Agents was used:** [How Deep Agents was used in this project](How%20Deep%20Agents%20was%20used%20in%20this%20project.md)
- **Design:** [Design Doc](Design%20Doc.md)

## What the game covers

Each room teaches one part of the Deep Agents Harness.

| Concept | In the game | Learn more |
|---|---|---|
| **Filesystem tools.** `ls` to see what's there, `read_file` to read it, `grep` to find the one line that matters. | Rooms are folders, objects are files. Polly uses `ls` to find the hidden brick, `read_file` to read the photo, and `grep` to search the diary. | [Deep Agents overview](https://docs.langchain.com/oss/python/deepagents/overview) |
| **Context window.** Too much reading fills it up; summarization and searching keep it clear. | The 412-page diary | [Context engineering](https://docs.langchain.com/oss/python/deepagents/context-engineering) |
| **Scratch space and threads.** Notes for now live in the thread. A new thread starts fresh. | The chalkboard, the fogged bathroom mirror and the power cut | [Backends](https://docs.langchain.com/oss/python/deepagents/backends), [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) |
| **Long-term memory.** Every letter was saved to `/memories/`, so it survived the new thread. | Polly's nest | [Memory](https://docs.langchain.com/oss/python/deepagents/long-term-memory) |
| **Human in the loop.** Pause and ask before big decisions. | The humming trunk | [Human-in-the-loop](https://docs.langchain.com/oss/python/deepagents/human-in-the-loop) |
| **Sandboxes.** Run code in a sealed box, where it can only touch what's inside. | The script in the attic | [Sandboxes](https://docs.langchain.com/oss/python/deepagents/sandboxes) |
| **Evals.** Test every candidate the same way before you trust one. | The bottles in the bathtub | [Evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts) |
| **Tracing.** A step-by-step record of what an agent did. | The Watcher's footprints | [Tracing quickstart](https://docs.langchain.com/langsmith/observability-quickstart) |
| **Skills.** Read every description, load only the instructions you need. | The storage room scrolls (optional) | [Skills](https://docs.langchain.com/oss/python/deepagents/skills) |

Want to build your own Polly? Learn Deep Agents at [LangChain Academy](https://academy.langchain.com).
