---
title: Where the tokens went: rules of thumb for an agentic workflow
heading: Where the tokens went
slug: where-the-tokens-went
date: 2026-11-14
kicker: Writing · Agentic development
summary: I measured 25 of my own agent sessions. The main agent re-reading its own history was the largest cost, eight independent reviews were 6% of the bill, and my first count was wrong by a quarter.
dek: Rules of thumb for an agentic workflow, with the numbers behind them. I measured 25 of my own agent sessions. The main agent re-reading its own history was the largest cost, eight independent reviews were 6% of the bill, and my first count was wrong by a quarter.
---

I write almost all my code through a multi-agent workflow. A main agent plans and integrates, and specialist agents implement, review and verify. I had rules for when to delegate. I did not have numbers. The articles I read about agents argued that more agents are better, or that they are a waste, and none of them showed a bill.

So I read my own session transcripts and counted. This article has the numbers, the eight rules I now work by, and what I have not measured. The workflow is public: [agent-engineering-workflow](https://github.com/rexsacrorum/agent-engineering-workflow) is Markdown plus one Python script, wired for Claude Code.

```chart
{"type": "stats", "items": [
  {"value": "51%", "label": "of one long session was the main agent"},
  {"value": "53%", "label": "of a main agent's cost is re-reading its history (median of 25 sessions)"},
  {"value": "24%", "label": "of that session was advisor calls I had not counted"},
  {"value": "6%", "label": "was eight independent reviews"}
]}
```

## How I measured

Claude Code stores every session as a transcript, with one more transcript for each subagent. Every model request in it records its token counts. I wrote a small read-only command that adds them up per role and model:

```
python scripts/workflow.py usage <session.jsonl>
```

I priced the tokens at the public [list prices](https://platform.claude.com/docs/en/about-claude/pricing) of November 2026. I work on a subscription, so these dollars are a list-price equivalent and not what I paid. They are still a fair unit for comparing one part of a session with another. Cache writes are priced at the one-hour rate, which overstates the subagents.

I looked at one long session in detail: 23 pull requests on a pre-release prototype, with the main agent on the top model tier and the specialists one tier below. Then I ran the same count over the 25 largest sessions on my machine, across personal and work projects.

Four limits apply to everything below. This is one developer. The sessions did different work, so they cannot show that one way of splitting work is cheaper than another. I picked the 25 sessions by size, which favours long histories. And the transcript format is internal to the client, so the command stops when a usage record does not have the shape it expects.

## The main agent's history is the bill

```chart
{"type": "bars", "title": "One session, 23 pull requests: share of cost by role", "caption": "List-price equivalent, about $367 in total.", "max": 100,
 "rows": [["Main agent", 51, "51% · $188"], ["Advisor calls", 24, "24% · $90"], ["Implementers (14)", 18, "18% · $65"], ["Reviewers (8)", 6, "6% · $22"], ["Architecture (1)", 1, "1% · $2.50"]]}
```

The main agent was about half of the session. More than half of that half was neither thinking nor writing. It was re-reading. Every request sends the whole conversation again, and the median request in this session carried nearly half a million input tokens of history. Claude Code's [best-practices guide](https://code.claude.com/docs/en/best-practices) describes the same mechanism: a session that has collected several tasks re-reads all of them on every turn of the next one.

```chart
{"type": "line", "title": "What the main agent re-read on each request", "caption": "Input tokens per request, in thousands, by request number over the session. Each point is the mean of 8 requests.",
 "values": [93, 131, 192, 215, 242, 278, 297, 310, 325, 336, 345, 351, 358, 365, 373, 386, 395, 407, 419, 437, 452, 462, 481, 495, 506, 525, 550, 569, 586, 600, 610, 623, 631, 644, 665, 681, 690, 704, 714, 725, 653, 110, 122, 132, 147, 171, 185, 214, 230, 240, 252, 265, 285, 297, 334, 373, 402, 440, 480, 507, 526, 538, 555, 571, 584, 593, 603, 613, 626, 635, 644, 660, 679, 697, 711, 492, 121, 145, 159, 173, 194, 210, 223, 234, 250, 268, 282, 290, 304, 317, 325, 335, 352, 369, 378, 393, 412, 422, 438, 460, 479, 506, 537, 552, 565, 580, 602, 613, 629, 646, 657, 668, 687, 708, 727, 740, 752, 771, 786, 798, 811, 826, 833, 840, 846, 854, 870, 884, 898, 906, 922, 942, 954, 546, 139],
 "x_step": 8, "x_ticks": [0, 250, 500, 750, 1000], "y_ticks": [0, 250, 500, 750, 1000], "y_format": "{v}K",
 "tip": "around request {x}: {v}K input tokens",
 "alt": "Line chart of input tokens per request across about 1,070 requests. The context grows steadily from about 100 thousand tokens to 700 to 950 thousand, drops back to about 100 thousand at each of three compactions, and grows again.",
 "note": "The three drops are compactions, where the client replaces the history with a summary. Between them every request re-reads everything before it."}
```

This was not special to one session.

```chart
{"type": "dots", "title": "25 sessions: how much of the main agent's cost is re-reading its own history", "caption": "Each dot is one session.",
 "values": [47, 57, 52, 48, 55, 53, 52, 59, 53, 58, 40, 49, 55, 54, 55, 45, 51, 34, 70, 56, 57, 47, 60, 25, 50],
 "unit": "%", "min": 0, "max": 100, "ticks": [0, 25, 50, 75, 100], "median": true, "tip": "{v}% of the main agent's cost",
 "alt": "Dot plot of 25 sessions. The share of the main agent's cost spent re-reading history ranges from 25% to 70%, with a median of 53%; 21 of 25 sessions fall between 45% and 60%.",
 "note": "Range 25% to 70%. In 21 of 25 sessions the share is between 45% and 60%. Sessions on older models are priced at the current rate for the same model family."}
```

What was in that history? In the detailed session, about four fifths of the characters that went into the main agent's history were tool calls and their output.

```chart
{"type": "segments", "title": "What went into the main agent's history", "caption": "Share of characters in one session, not of cost. Screenshots are not counted.",
 "parts": [["Tool calls it made", 42.4, "a"], ["Output of those tools", 36.9, "b"], ["My messages, system notes and subagent reports", 14.0, "c"], ["The agent's own text", 6.6, "d"]],
 "alt": "Segmented bar: tool calls 42%, tool output 37%, messages from the user, system notes and subagent reports 14%, the agent's own text 7%."}
```

Everything else, including our whole conversation, was the remaining fifth. The main agent ran 703 shell commands and 74 batches of browser actions itself. The verifier role, which exists to run checks and read logs on a cheaper model, was never called.

## A fresh reviewer was cheap

Eight independent reviews cost about 6% of the session, under $3 each before the advisor calls some of them made. A reviewer starts with an empty context, reads the finished diff and returns findings.

I cannot put a number on what those reviews were worth, and I found no controlled experiment that isolates the effect of a reviewer with a fresh context. What exists are vendor reports. Cognition says its review agent finds about two bugs per pull request, more than half of them severe, even on pull requests written by its own coding agent, and works best when it shares no context with the author ([Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working)). Claude Code's guide says that handing the same task to a subagent does not produce a better answer, but that a fresh reviewer does help, because it has not seen the reasoning.

What I do have is the record of this project. While I was changing the workflow, reviewers with no context found three things I had missed:

- My cost table was missing a quarter of the cost. That story is in the next section.
- A safety rule I had written said that a script checks where a backup is written. On one platform the script could not make that check, so the rule promised more than the code did. I rewrote the rule.
- An installer refused to write through linked folders, as designed, except in its own backup folder. That is fixed.

Each was found by a reader that had not seen how the text or the code was written.

## The line I had not budgeted: the advisor

Claude Code has an advisor tool. The working model can consult a stronger model at decision points. Each call sends the whole conversation to the advisor, and that read is not cached ([advisor documentation](https://code.claude.com/docs/en/advisor)). The detailed session made 45 calls, averaging about 185,000 input tokens each. At list price that is about a quarter of the session.

My first cost table did not have this line at all. The transcript records advisor usage as a separate part of a message, and my script added up only the message's own usage. A reviewer with no context checked the script against the transcripts and found the gap. By then I had already drawn a conclusion from the wrong table: "the main agent is two thirds of the cost" had to become "about half".

```chart
{"type": "stack", "title": "25 sessions: who spent the tokens", "caption": "Share of each session's cost, one row per session, sorted by the main agent's share.",
 "series": ["Main agent", "Advisor calls", "Subagents"],
 "rows": [[96, 0, 4], [96, 4, 0], [96, 4, 0], [94, 6, 0], [92, 7, 1], [89, 11, 0], [89, 11, 0], [83, 15, 2], [82, 18, 0], [77, 18, 5], [76, 0, 24], [76, 21, 3], [75, 24, 1], [70, 29, 1], [69, 31, 0], [68, 10, 22], [67, 1, 32], [62, 38, 0], [60, 17, 23], [58, 23, 19], [52, 24, 24], [46, 18, 36], [30, 32, 38], [19, 24, 57], [13, 23, 64]],
 "alt": "Stacked bars for 25 sessions. The main agent's share ranges from 13% to 96%, advisor calls from 0% to 38% with a median of 18%, and subagents from 0% to 64%.",
 "note": "Main agent 13% to 96%. Advisor calls 0% to 38%, median 18%. Subagents 0% to 64%. The sessions did different work, so the rows are not a ranking of approaches."}
```

I still use the advisor. But one question to it costs about $2 at list price, close to the price of a whole independent review, so I keep it for decisions that are hard to reverse.

## The tier matters less than where the output lands

```chart
{"type": "bars", "title": "List prices by model tier, November 2026", "caption": "Dollars per million tokens. Each panel has its own scale.",
 "panels": [
  {"title": "Cached read", "rows": [["Top", 0.20, "$0.20"], ["Strong", 0.20, "$0.20"], ["Mid", 0.10, "$0.10"], ["Cheap", 0.01, "$0.01"]]},
  {"title": "Output", "rows": [["Top", 40, "$40"], ["Strong", 20, "$20"], ["Mid", 10, "$10"], ["Cheap", 0.5, "$0.50"]]}
 ],
 "note": "Top is Claude Fable 5.2, strong is Opus 5.5, mid is Sonnet 5.5, cheap is Haiku 5.5 for prompts up to 100,000 tokens."}
```

A cached read costs the same on the top tier and on the tier below it, and half of that on the mid tier. So for a role that mostly reads, moving it down one tier saves at most half of its reading cost. Keeping its output out of the main agent's history removes that output from every later request the main agent makes. In a session of a thousand requests, the second effect is the larger one.

What a subagent gives you is compression. In the detailed session a typical implementer read about 250,000 new tokens and handed back about 2,200. The main agent then re-read roughly 2,200 tokens on each later request, not 250,000.

Those reports were still about 1,500 words each. The workflow now limits a report to about 300 words plus findings and sends logs to a file. I have not measured the effect of that limit yet.

## The rules

These are adapted from the coordination contract in the repository, each with the number or source it rests on. In this form they have been in force for a few days, and the log that will show whether they work is still empty.

### 1. Choose roles by the shape of the task, not its size

| Task | Who writes | Who else is called |
| --- | --- | --- |
| Small edit in one area | Main agent | Nobody |
| Substantial change in one area | Main agent, or one implementer from a short contract | One fresh reviewer |
| Independent parts on separate paths | One implementer per part | One fresh reviewer on the whole |
| Access rights, a data migration, spending | As above | A reviewer, at any size |
| Test runs, browser checks, logs | Nobody | A verifier on a cheaper model |

Anthropic's multi-agent research system used about 15 times the tokens of a chat. Anthropic reports that it beat a single agent by 90.2% on an internal research evaluation, and research splits into parallel parts. The same post notes that most coding tasks have fewer truly parallel parts ([How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)). A study of 260 configurations found that adding agents changed results by anything from +80.8% on a task that decomposes to −70.0% on sequential planning ([Towards a Science of Scaling Agent Systems](https://arxiv.org/abs/2512.08296)).

### 2. One writer per set of paths

Parallel writers make conflicting decisions that nobody sees until the merge. Cognition argued against multi-agent systems in 2025 ([Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)). Ten months later it reported that what works is several agents contributing to a task while one of them does the writing.

### 3. A reviewer is always fresh and never reused

Its value is that it has not seen the reasoning. A reviewer that read the first round has. In my session the eight reviews were about 6% of the cost.

### 4. Some changes are reviewed at any size

Access rights, data migrations and anything that spends money. A review costs a few dollars. A miss in these areas costs more.

### 5. Every role has a condition under which you skip it

A subagent first has to rebuild context the main agent already has, and it does not give a better answer to the same task. Skip the implementer when the change depends on what the main agent has just found. Skip the verifier when the check is one short command.

### 6. Bulky output goes to a cheaper reader, and reports are short

Four fifths of what went into my main agent's history was tool traffic. Test runs, browser checks and logs belong to a verifier that returns one line per check and a path to the full output.

### 7. Waiting should cost nothing

For a long run, use the client's own notification: a CI monitor, or a background command that reports when it exits. An agent that polls pays the main agent's rate to wait.

### 8. A rule lives where the task that needs it will load it

I had a rule: back up the database before any migration. It lived in `AGENTS.md`. The repository also had a `CLAUDE.md`, and when both exist Claude Code reads only `CLAUDE.md` by default ([memory documentation](https://code.claude.com/docs/en/memory)). The workflow skill pointed at the rule, but a small edit never loads the skill. So a one-line migration, the case the rule was written for, would have run without it. The fix was one import line. The general check: for each rule, name the smallest task that needs it and trace what that task actually loads.

## Measure, and distrust the count

METR's 2025 trial found that experienced developers took 19% longer with AI tools while believing they had been 20% faster. METR now marks that result as out of date for current tools, and I would not quote the 19% as a fact about today ([METR study](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)). The gap between felt and measured speed is the part that lasts. I felt that the reviewer was expensive and the main agent cheap. It was the other way round.

The loop I use is small. One line per finished task goes into a log file: roles called, tokens by role, review findings accepted, and what the review missed. The usage command fills in the tokens. Once a week I ask an agent to read the new lines and propose at most three changes to the instructions, and I accept or reject them. One warning from Claude Code's guide applies here: a reviewer asked to find problems always finds something, so a count of findings is not a target.

## Take it

The contract, the roles, the usage command and the sources are in [agent-engineering-workflow](https://github.com/rexsacrorum/agent-engineering-workflow), under the MIT license. Three things to try, cheapest first:

1. Run the usage command on your largest session and look at the main agent's row.
2. Put the "reviewed at any size" line into the file your client loads on every task.
3. Send test runs and log reading to a cheaper subagent that returns one line per check.
