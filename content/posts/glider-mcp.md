---
title: "Glider MCP: compiler answers for coding agents, and what my benchmarks actually show"
date: 2026-01-16
lastmod: 2026-10-30
draft: false
tags: ["MCP", "Claude Code", "Codex", "C#", ".NET", "Roslyn", "Developer Tools", "Benchmarks"]
categories: ["Development", "Tools"]
description: "What Glider, a Roslyn MCP server for C#, gives an AI coding agent, and what paired agent benchmarks show about its real effect on time and tokens."
---

Glider is a Model Context Protocol (MCP) server that puts the Roslyn compiler behind an AI coding agent. Instead of searching text, the agent can ask the compiler: which symbol is this, who really calls it, which types implement this interface, what breaks if I change this signature. It runs locally against your own solution.

I built it in early 2026 because I work in a very large .NET solution, and watching an agent grep its way through hundreds of projects was painful. Since then it has grown into a small family of tools at [glidermcp.com](https://glidermcp.com): TGlider for TypeScript, Scout for code search (Rust), Keep for shared agent knowledge (Rust) and GliderTrace for .NET runtime evidence.

This post replaces my earlier, more enthusiastic ones. I have since measured it, and the results deserve an honest write-up.

## What Glider answers that grep cannot

- **Symbol identity.** Overloads, partial classes, extension methods, aliases and fully qualified calls resolve the way the compiler resolves them, not by string match.
- **Real references and callers.** `find_references`, `find_callers` and `find_implementations` return actual uses, not every line that contains the same word.
- **Compiler diagnostics without a full build.** After an edit the agent can ask for errors in the affected file or project. In a solution with hundreds of projects that is milliseconds instead of minutes.
- **Refactors with a preview.** Rename and move operations show the diff first, then apply across the solution.
- **External code.** Definitions from NuGet packages and the framework through SourceLink or decompilation.

## What the benchmarks show

I built a separate test stand to check whether any of this makes agents faster or cheaper. Each pair runs the same task twice in fresh Docker containers: once with ordinary shell tools only (baseline), once with Glider available. Same source bytes, same model, same limits. An independent checker grades the final code against a hidden oracle. Models: Claude Opus 5.5 (medium effort) and a GPT model at low reasoning.

**Correctness: all tie.** Every final result in the twelve-attempt matrix (rename, diagnose-and-repair, package migration) passed with and without Glider.

**Speed and tokens: no gain on small tasks.** When the agent actually used Glider's semantic results, it was usually slower and used more input:

| Scenario | Model | Time with Glider | Input tokens with Glider |
| --- | --- | ---: | ---: |
| Rename | GPT, low | +10% | +126% |
| Rename | Opus 5.5 | +25% | +112% |
| Package migration | GPT, low | +14% | +79% |

**Agents often ignore it.** In several attempts Claude solved the task with shell commands only, even with Glider installed. When I told it explicitly to use Glider diagnostics, it did the full cycle correctly: it saw the two compiler errors, repaired the callers and confirmed zero errors, with no build at all. But it still took 46% longer than the baseline and used about twice the input.

**GliderTrace: same picture.** On log analysis and live exception capture from a running .NET process, every diagnosis passed in both arms. With Trace the agent sometimes finished a bit faster and sometimes noticeably slower, and it often went back to raw decoding anyway. One pair per setup proves nothing either way.

## How I read these results

1. **On small codebases, grep is enough.** The test fixtures have a few projects. A modern agent reads them quickly, and tool descriptions plus structured answers cost more context than they save.
2. **The value, if any, is at scale and in correctness.** The cases where I still reach for Glider are a 300+ project solution: real references through interfaces and DI, a rename across many projects, or a quick compiler check without waiting for MSBuild. I have not yet measured that size on the stand, so this is my experience, not a result.
3. **Adoption is a product problem.** If the model does not choose the tool by itself, the tool does not help, however good its answers are. Most of my recent work went into names-first discovery, shorter instructions and skills, not more features.
4. **Measure before you claim.** My earlier posts promised fewer tool calls and fewer tokens. Paired runs did not confirm that, so I removed those claims.

## Try it

Glider needs the .NET 10 SDK. In Claude Code:

```bash
claude plugin marketplace add glidermcp/glidermcp
claude plugin install glidermcp@glidermcp
```

Codex, other clients and manual setup: [glidermcp.com/glider/installation](https://glidermcp.com/glider/installation). It is local-first: your code stays on your machine.

If you work in a big C# solution and see a clear win or a clear loss, I would like to hear about it. Real tasks on real codebases are the evidence I am still missing.
