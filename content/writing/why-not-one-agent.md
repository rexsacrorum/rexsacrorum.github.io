---
title: Why not one agent on the best model? When a subagent is worth it
heading: Why not one agent on the best model?
slug: why-not-one-agent
date: 2026-11-17
kicker: Writing · Agentic development
summary: A short guide to one decision: do the work in the main agent or hand it to a subagent. Four common reasons for delegating, checked against what Anthropic, OpenAI and Google publish and against my own sessions.
dek: A short guide to one decision: do the work in the main agent or hand it to a subagent. Four common reasons for delegating, checked against what Anthropic, OpenAI and Google publish and against my own sessions.
---

This is a guide to one decision: do the work in the main agent, or hand it to a subagent. I used to give four reasons for delegating. I checked each against what the labs publish now and against [my own measured sessions](/writing/where-the-tokens-went/).

## The short answer

One agent is the default. A subagent is worth its cost in three cases:

- The output is bulky, such as a test run, a log, a browser check or a wide search, and many requests will follow it.
- The parts are independent and can run at the same time.
- You need a reviewer that has not seen the reasoning.

In every other case, stay in the main agent. Claude Code's [best-practices guide](https://code.claude.com/docs/en/best-practices) now lists two habits to drop: using subagents to protect the context window, and delegating to get a better answer. A subagent runs the same model, or a smaller one, on the same task, so the answer is not better.

## Four reasons, checked

| Reason I gave | Verdict | What holds |
| --- | --- | --- |
| Fewer instructions, so the agent follows them better | True, but it is not delegation | Keep the always-loaded file short and load the rest on demand. One agent gets this too. |
| Lower cost | Only in two cases | Bulky output kept out of the main agent's history, and output written by a cheaper model. |
| Fewer hallucinations | The wrong word | Recall gets worse as the context grows. A new session per task fixes that without subagents. |
| Faster | For parallel work and simple jobs | A fresh subagent first rebuilds context and can be slower. |

**Instructions.** Anthropic's [memory documentation](https://code.claude.com/docs/en/memory) says to keep the always-loaded file under 200 lines, because longer files reduce adherence.

**Cost.** Subagents use more tokens in total. Anthropic's [research system](https://www.anthropic.com/engineering/multi-agent-research-system) used about 15 times the tokens of a chat, and OpenAI's [Codex documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) says the same of its subagents. The saving is narrower. In my sessions, re-reading history was a median 53% of the main agent's cost, so a test log read by a subagent is paid for once and not on every later request.

**Hallucinations.** No source I read says a smaller context reduces them. Anthropic's post on [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) says recall gets less accurate as the token count grows, and OpenAI calls the same effect context rot.

**Speed.** Both labs recommend a smaller model for simple, repeatable jobs. My own transcripts show I was not doing it: the main agent, on the top model, ran 74 batches of browser actions itself.

## The reason that survives better models

A reviewer that has not seen the reasoning. Anthropic's post on [harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) reports that agents tend to praise their own work, and that a separate sceptical evaluator was much easier to build than a self-critical author. This does not depend on the model being weak. In my measured session eight fresh reviews cost 6% of the total.

## Is a workflow still needed?

Yes, a thinner one. The same harness post gives the test: every part of a harness encodes an assumption about what the model cannot do alone, and those assumptions go stale. Google Research found that [adding agents](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) improved a task with parallel parts by about 81% and made a sequential one worse by 39% to 70%.

What I kept rests on price, time, or who has seen what: a fresh reviewer, one writer per set of paths, bulky output to a cheaper reader, one task per session. What I expect to delete rests on the model being weak: extra roles that re-read the plan, and tables that tell the agent when to delegate.

## What to do

1. Start with one agent, a short instruction file and a new session per task.
2. Add a fresh reviewer before anything else.
3. Send test runs, logs and browser checks to a file or a cheaper agent.
4. Run parallel writers only on paths that do not overlap.
5. For every other rule, note which weakness of the model it answers. Delete the rule when the weakness is gone.

One caution: this is one developer's data, I have no controlled comparison, and the lab sources are vendors describing their own tools.

## Sources

- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices), Anthropic. The habits to drop, and the cases where a subagent pays off.
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents), Anthropic. When to stay in the main conversation.
- [How Claude remembers your project](https://code.claude.com/docs/en/memory), Anthropic. Keep the always-loaded file under 200 lines.
- [Manage costs effectively](https://code.claude.com/docs/en/costs), Anthropic. Delegate verbose operations, and choose a smaller model for simple work.
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), Anthropic. Recall gets less accurate as the context grows.
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), Anthropic. About 15 times the tokens of a chat, and where that is worth it.
- [Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps), Anthropic. A separate evaluator, and harness parts that go stale as models improve.
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), OpenAI Codex. Context rot, the token cost, and which model to give a subagent.
- [Towards a science of scaling agent systems](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/), Google Research. More agents help a task with parallel parts and hurt a sequential one.
- [Where the tokens went](/writing/where-the-tokens-went/). My own measurements.
