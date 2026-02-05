---
title: "It’s genuinely satisfying when an LLM finds your MCP server helpful (9/10)"
date: 2026-02-05
draft: false
tags: ["dotnet", "csharp", "roslyn", "mcp", "glidermcp", "llm", "devtools", "productivity"]
summary: "A practical comparison of LLM workflows in a large C# codebase: plain text search vs Roslyn-powered MCP tools (symbols, types, references, callers) — and why autosync changes the ergonomics."
---

## Context

I recently implemented **three new KPIs** in a **large C# solution (~500+ projects)**. The task itself wasn’t “hard”, but the _navigation cost_ was the real problem:

- Where are KPI/measurement IDs defined?
- What’s the **existing pattern** for recording KPI measurements?
- Where do I integrate so it follows current architecture (and doesn’t resurrect legacy paths)?

This is exactly the kind of work where “LLM + grep/glob + reading files” tends to waste tokens and still miss key edges.

---

## The core difference: text archaeology vs semantic navigation

### Without an MCP server (what the LLM is forced to do)

The model can only operate on *text*, so the workflow becomes:

1. **Glob** likely files (`**/*kpi*.cs`, `**/*metrics*.cs`) → too many candidates
2. **Grep** for strings (`"Measurement"`, `"Kpi"`, `"Record"`) → too many matches
3. Open big files and skim → token-heavy and slow
4. Try to infer semantics from text:
   - overloads vs similarly named methods
   - partial classes
   - extension methods
   - DI wiring
   - “same word” used for different concepts

**Main failure mode:** grep answers “where is this string?”, not “what symbol is this and how is it used?”.

---

### With a Roslyn-backed MCP server (what changes)

Instead of guessing, the model can ask **semantic** questions and get structured answers.

A typical workflow:

1. `search_symbols` to find *the actual enum/type/method* (not string matches)
2. `get_type_info` / `get_symbol_info` to understand structure cheaply
3. `find_references` to see real usage patterns across the whole solution
4. `find_callers` to trace call chains (who calls this, from where)
5. `search_text` only for literals (SQL, comments, config keys)

That sequencing matters: **understand structure first**, read source only when you know what you’re looking for.

---

## Example: what the tool calls look like

> These are representative calls/patterns (names simplified). The key point is *the shape of the interaction*.

### 1) Find the KPI measurement enum quickly

```json
{
  "tool": "search_symbols",
  "args": { "query": "Measurement" }
}
```

Then inspect it (members, numeric IDs, docs):

```json
{
  "tool": "get_type_info",
  "args": { "symbol": "…Measurement" }
}
```

Result: you can identify “highest ID” / gaps / naming patterns without reading a giant file.

---

### 2) Discover the “record KPI measurement” pattern (modern vs legacy)

```json
{
  "tool": "find_references",
  "args": { "symbol": "…RecordKpiMeasurement" }
}
```

This is where plain grep usually falls apart: references are *semantic* (overloads, different namespaces, indirect calls). Seeing all real call sites instantly shows:

- the modern entry point
- any legacy path still alive
- expected parameters / context objects
- typical calling locations (controllers/services/background jobs)

Then trace who calls the important layer:

```json
{
  "tool": "find_callers",
  "args": { "symbol": "…KpiRepository.RecordKpiMeasurement" }
}
```

---

### 3) Use literal search only where it’s appropriate

```json
{
  "tool": "search_text",
  "args": { "query": "some_config_key_or_sql_fragment" }
}
```

This is where plain text search remains the right tool: SQL migrations, config keys, comments, docs. But why not grep instead? Because you can **scope** the search to relevant projects/namespaces, and avoid noise from unrelated matches. Also it searches in in-memory workspace snapshot, so it’s much faster than disk-based grep.

---

## Actual outcomes (what changed in practice)

- The model avoided reading **10–20 large files** “just to understand what’s going on”.
- It read **4–5 targeted sections** after it already knew *where the integration points are*.
- `find_references` was the highest leverage tool: it replaced “grep + manual tracing + hope”.

If you care about throughput, the big win isn’t “faster search”. It’s fewer wrong turns.

---

## What I’d change: stop trimming docs for tokens (and revert those edits)

I experimented with **trimming documentation** to reduce token usage. That’s the wrong optimization for this kind of tool.

For semantic navigation, *clarity beats brevity* because:

- The model needs to **discover** advanced parameters (`namespaceFilter`, `projectName`, etc.)
- The model needs canonical examples (what to call first, what to call next)
- Missing or hidden affordances lead to inefficient tool usage (more calls, more tokens anyway)

What I’d do instead:

- Keep a **short Quickstart** (minimal tokens)
- Keep a **full reference** (complete parameters + examples)
- Make “power features” prominent (e.g., `batch`, filters/scoping)
- Add a “recommended exploration recipe” section (the 1→2→3 workflow)

---

## Installation

If you as I work on large C# codebases, I highly recommend trying out [GliderMCP](https://glidermcp.com/installation). It’s designed to provide exactly this kind of semantic navigation for LLMs, and it’s been a game-changer for my workflow.

---
