---
title: "Better than LSP for LLM coding agents"
description: "LSP was built to power IDE UX. Glider MCP is built to power LLM workflows—fewer calls, fewer tokens, less state pain, and better results on large C#/.NET codebases."
date: 2026-02-18T09:00:00+01:00
draft: false
slug: "better-than-lsp-for-llms"
tags: ["mcp", "llm", "lsp", "dotnet", "roslyn", "agents"]
---

## LSP is great for IDEs — and that’s the problem

The **Language Server Protocol (LSP)** was designed to let editors provide *interactive editing features*: autocomplete, diagnostics, go-to-definition, etc.

That design assumes an IDE-like client that:

- Keeps files open in memory (buffers)
- Streams every edit to the server in real time
- Maintains a long-lived session with capability negotiation and message envelopes (JSON-RPC + headers)

That’s a perfect fit for an editor.

It’s a **mismatch for LLM agents**, which are naturally “request/response”, operate under strict token budgets, and often edit code via separate file tools rather than an IDE buffer.

**References**
- VS Code: Language Server Extension Guide — https://code.visualstudio.com/api/language-extensions/language-server-extension-guide  
- LSP 3.17 Specification — https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/

---

## Why raw LSP doesn’t suit LLM workflows

### 1) Too much state synchronization burden

In LSP, the client is responsible for synchronizing document state. Support for `textDocument/didOpen`, `textDocument/didChange`, and `textDocument/didClose` is **mandatory**, and `didChange` carries versioning rules and ordered change application.

That’s fine when an IDE is the client. For an LLM agent, it’s brittle:

- If the agent edits a file on disk, the LSP server **won’t know** unless the client mirrors those edits via `didChange`.
- If versions, ranges, or ordering drift, results become inconsistent (and debugging that through tool calls is painful).

### 2) “Pointer results” force extra tool calls

Many LSP requests return *locations*, not the code context itself. For example, definition and references return `Location` / `Location[]` (URI + range).

So the agent often has to do a second step:

1. Ask LSP “where is it?”
2. Then read files/ranges to learn “what is it?”

That’s extra round-trips, extra latency, extra tokens.

### 3) Token bloat from verbose payloads

LSP is optimized for machines and editor UI, not token efficiency:

- JSON-RPC envelopes + capability negotiation
- Potentially large lists (e.g., completion returns `CompletionItem[]` / `CompletionList` with many fields)

LLMs don’t benefit from most of that structure; they benefit from **bounded, relevant code** and **stable identifiers**.

### 4) The “after each edit” problem

IDE workflows assume continuous correctness: the server is always tracking your latest buffer.

LLM workflows are different:
- Agents do larger edits in chunks
- They frequently need “is this still compiling?” checkpoints
- They should not have to worry about fragile line/column offsets and version counters after each patch

---

## What LLM agents actually need (and what LSP doesn’t optimize for)

LLM coding on real codebases needs a tool layer that prioritizes:

- **Fewer tool calls** (one call should return enough context to act)
- **Token-efficient outputs** (snippets + summaries, not huge JSON)
- **Stable references** across steps (so follow-up calls are precise)
- **Compilation/diagnostics loop** as a first-class workflow
- **Big repo navigation**: call graphs, type hierarchies, impact analysis

LSP can be adapted, but only by building a *proxy* that basically re-invents an LLM-optimized interface.

---

## What Glider MCP does differently

**Glider MCP** is explicitly built for AI workflows: a Roslyn-powered MCP server that provides semantic navigation, diagnostics, refactoring, and more—using outputs designed to be consumed by LLM agents.

- Home — https://glidermcp.com/  
- FAQ — https://glidermcp.com/faq

### Key differences vs raw LSP

**Glider focuses on “answers”, not “pointers.”**  
Instead of just returning URIs and ranges, Glider is designed to return bounded source, signatures, and semantically meaningful results that an agent can use immediately.

**Stable symbol keys for multi-step workflows.**  
Glider emphasizes stable keys and precise follow-up calls across tool steps.

**State pain is reduced (watching + sync).**  
Glider can watch a working directory and automatically sync changes, or you can manually sync specific files into its in-memory workspace.

**Batching is built in.**  
You can batch tool calls to reduce round-trips and make agent loops faster.

---

## Example: why Glider needs fewer calls than LSP

### Task: “Rename a symbol and fix fallout across the repo”

**Raw LSP typically looks like:**
- Maintain a session (`initialize`, capabilities)
- Ensure every involved file is opened/synced (`didOpen`, `didChange`, versions)
- Request rename (`textDocument/rename`) and apply a potentially large `WorkspaceEdit`
- Re-run diagnostics + chase more location pointers
- Repeat… while keeping server state consistent

**Glider MCP looks like:**
- Load solution/project
- Run a semantic rename refactor
- Sync changes (or rely on auto watching)
- Re-check diagnostics
- Apply code fixes
- Format/organize imports/usings

The difference is not “LSP can’t do it.”  
It’s that LSP makes the agent act like an IDE implementation, while Glider makes the agent act like an agent.

---

## On big codebases, agents fail without semantic tooling

On a large solution, an LLM without semantic navigation typically:
- Misses cross-file relationships
- Hallucinates symbol names/APIs
- Can’t reliably answer “where is this used?” or “what breaks if I change this?”
- Spends tokens grepping and reading irrelevant files

Glider calls this out directly: without tooling, LLMs miss relationships and can’t verify compilation; grep-style search can’t distinguish symbols or understand type relationships.

Reference: https://glidermcp.com/faq

---

## When LSP can still be “good enough”

If you’re operating on:
- a small repo,
- a single file,
- or you already have a robust LSP proxy that truncates payloads, resolves locations to snippets, and handles syncing reliably…

…then LSP can work.

But at that point, you’ve basically built the missing layer: **an LLM-optimized API on top of LSP**.

---

## Bottom line

LSP is an excellent protocol for IDE features.  
LLM agents need something else: fewer calls, fewer tokens, stable references, and a first-class diagnostics/refactor loop.

That’s what Glider MCP is built for.
