---
title: Where the tokens went: rules of thumb for an agentic workflow
heading: Where the tokens went
slug: where-the-tokens-went
date: 2026-11-14
kicker: Writing · Agentic development
summary: I measured my own agent sessions. Half of the main agent's cost was re-reading its own history, a quarter of one session was advisor calls I had not counted, and eight independent reviews were 6%. Five rules follow.
dek: I measured my own agent sessions. Half of the main agent's cost was re-reading its own history, a quarter of one session was advisor calls I had not counted, and eight independent reviews were 6%. Five rules follow.
---

This article shows where the cost of a long agent session goes, and the five rules I changed because of it. If you run Claude Code with subagents, you can repeat the measurement on your own sessions with one command.

```chart
{"type": "stats", "items": [
  {"value": "51%", "label": "of one long session was the main agent"},
  {"value": "53%", "label": "of a main agent's cost is re-reading its history (median of 25 sessions)"},
  {"value": "24%", "label": "of that session was advisor calls I had not counted"},
  {"value": "6%", "label": "was eight independent reviews"}
]}
```

## How I measured

Claude Code stores every session as a transcript with token counts for each request. A read-only script adds them up per role:

```
python scripts/workflow.py usage <session.jsonl>
```

I priced the tokens at the public [list prices](https://platform.claude.com/docs/en/about-claude/pricing) of November 2026. I work on a subscription, so the dollars are a list-price equivalent. They are only good for comparing one part of a session with another.

I looked at one session in detail: 23 pull requests, the main agent on the top model, specialists one tier below. Then I ran the same count over the 25 largest sessions on my machine.

## What I found

```chart
{"type": "bars", "title": "One session, 23 pull requests: share of cost by role", "caption": "List-price equivalent, about $367 in total.", "max": 100,
 "rows": [["Main agent", 51, "51% · $188"], ["Advisor calls", 24, "24% · $90"], ["Implementers (14)", 18, "18% · $65"], ["Reviewers (8)", 6, "6% · $22"], ["Architecture (1)", 1, "1% · $2.50"]]}
```

**The main agent's history is the bill.** Every request sends the whole conversation again. Across the 25 sessions, re-reading history was a median 53% of the main agent's cost, and between 45% and 60% in 21 of them. Claude Code's [best-practices guide](https://code.claude.com/docs/en/best-practices) describes the same thing: a session that has collected several tasks re-reads all of them on every turn of the next one.

```chart
{"type": "line", "title": "What the main agent re-read on each request", "caption": "Input tokens per request, in thousands, by request number over the session. Each point is the mean of 8 requests.",
 "values": [93, 131, 192, 215, 242, 278, 297, 310, 325, 336, 345, 351, 358, 365, 373, 386, 395, 407, 419, 437, 452, 462, 481, 495, 506, 525, 550, 569, 586, 600, 610, 623, 631, 644, 665, 681, 690, 704, 714, 725, 653, 110, 122, 132, 147, 171, 185, 214, 230, 240, 252, 265, 285, 297, 334, 373, 402, 440, 480, 507, 526, 538, 555, 571, 584, 593, 603, 613, 626, 635, 644, 660, 679, 697, 711, 492, 121, 145, 159, 173, 194, 210, 223, 234, 250, 268, 282, 290, 304, 317, 325, 335, 352, 369, 378, 393, 412, 422, 438, 460, 479, 506, 537, 552, 565, 580, 602, 613, 629, 646, 657, 668, 687, 708, 727, 740, 752, 771, 786, 798, 811, 826, 833, 840, 846, 854, 870, 884, 898, 906, 922, 942, 954, 546, 139],
 "x_step": 8, "x_ticks": [0, 250, 500, 750, 1000], "y_ticks": [0, 250, 500, 750, 1000], "y_format": "{v}K",
 "tip": "around request {x}: {v}K input tokens",
 "alt": "Line chart of input tokens per request across about 1,070 requests. The context grows steadily from about 100 thousand tokens to 700 to 950 thousand, drops back to about 100 thousand at each of three compactions, and grows again.",
 "note": "The three drops are compactions, where the client replaces the history with a summary. Between them every request re-reads everything before it."}
```

**Most of that history is tool traffic.** The main agent ran 703 shell commands and 74 batches of browser actions itself. The role that exists to run checks on a cheaper model was never called.

```chart
{"type": "segments", "title": "What went into the main agent's history", "caption": "Share of characters in one session, not of cost. Screenshots are not counted.",
 "parts": [["Tool calls it made", 42.4, "a"], ["Output of those tools", 36.9, "b"], ["My messages, system notes and subagent reports", 14.0, "c"], ["The agent's own text", 6.6, "d"]],
 "alt": "Segmented bar: tool calls 42%, tool output 37%, messages from the user, system notes and subagent reports 14%, the agent's own text 7%."}
```

**Advisor calls were a quarter of the session.** The advisor tool sends the whole conversation to a stronger model, and that read is not cached ([advisor documentation](https://code.claude.com/docs/en/advisor)). My first cost table did not have this line at all. About four of every five calls came from the specialists, not from the main agent.

**A fresh reviewer was cheap.** Eight independent reviews cost 6% of the session, under $3 each. A reviewer with no context also found the advisor line missing from my cost table.

**The model tier matters less than where the output lands.** A cached read costs the same on the top tier and the tier below it. A typical implementer read about 250,000 new tokens and returned a report of about 2,200, so the main agent re-read 2,200 tokens on each later request and not 250,000.

## The five rules

1. **One task per session.** A second task pays for the first one's history on every request. A short task record and the pull request carry what the next session needs.
2. **Keep bulky output out of the main agent.** Test runs, logs and browser checks go to a file, with only the last lines shown, or to a cheaper agent that returns one line per check.
3. **A fresh reviewer for every substantial change, never reused.** Its value is that it has not seen the reasoning. Changes to access rights, data migrations and anything that spends money get one at any size.
4. **Budget the advisor.** One question costs about $2 at list price, close to a whole review. Among the subagents, only the one that writes the change may ask, once, before it commits to an approach.
5. **One writer per set of paths.** Hand implementation to a subagent when the contract fits in a few lines or the parts are independent. Otherwise the main agent writes.

## Limits

This is one developer. The sessions did different work, so the numbers show where tokens went and not that another way of splitting work is cheaper. The transcript format is internal to the client, so the script stops when it does not recognise a record.

## Try it

The command and the workflow are in [agent-engineering-workflow](https://github.com/rexsacrorum/agent-engineering-workflow), under the MIT license. Run the command on your largest session and look at two rows: the main agent and the advisor. A second article covers [when a subagent is worth it at all](/writing/why-not-one-agent/).

## Sources

- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), Anthropic. The list prices used for every dollar figure.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices), Anthropic. Why a long session re-reads its history, and what subagents cost.
- [Manage costs effectively](https://code.claude.com/docs/en/costs), Anthropic. Why usage climbs in a long session, and sending verbose output to a subagent or a hook.
- [The advisor tool in Claude Code](https://code.claude.com/docs/en/advisor), Anthropic. Each call reads the whole conversation without caching.
- [agent-engineering-workflow](https://github.com/rexsacrorum/agent-engineering-workflow). The usage command and the workflow these numbers come from.
