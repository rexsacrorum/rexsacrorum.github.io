// node --test worker/test.mjs
// The Worker runs against a real SQLite database (node:sqlite behind a small D1 look-alike)
// and a fake Telegram, so the SQL and the routing are exercised, not mocked away.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, test } from "node:test";
import worker from "./index.js";

const ORIGIN = "https://novosad.xyz";
const OWNER = 4242;
const SECRET = "hook-secret";

function d1(db) {
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...values) }),
    run: async () => { db.prepare(sql).run(...values); return { success: true }; }
  });
  return { prepare: (sql) => statement(sql), batch: async (list) => Promise.all(list.map((item) => item.run())) };
}
const limiter = (limit = Infinity) => {
  let used = 0;
  return { limit: async () => ({ success: ++used <= limit }) };
};

let env;
let db;
let sent;
let telegramDown;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  env = { DB: d1(db), TG_TOKEN: "token", TG_SECRET: SECRET, TG_CHAT: String(OWNER), RL_SEND: limiter(), RL_NEW: limiter(), RL_POLL: limiter() };
  sent = [];
  telegramDown = false;
  globalThis.fetch = async (url, init) => {
    if (telegramDown) return new Response("{}", { status: 500 });
    const payload = JSON.parse(init.body);
    sent.push({ url: String(url), ...payload });
    return Response.json({ ok: true, result: { message_id: 1000 + sent.length } });
  };
});

function page(path, body, headers = {}) {
  return worker.fetch(new Request(ORIGIN + path, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
    body: JSON.stringify(body)
  }), env);
}
function hook(message, secret = SECRET) {
  return worker.fetch(new Request(ORIGIN + "/tg/hook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
    body: JSON.stringify({ update_id: 1, message })
  }), env);
}
const owner = (extra) => ({ message_id: 77, chat: { id: OWNER, type: "private" }, from: { id: OWNER }, ...extra });

async function open(nick = "ada", text = "hello") {
  const response = await page("/tg/send", { nick, text });
  assert.equal(response.status, 200);
  return (await response.json()).session;
}

test("a first message opens a chat and reaches the owner as plain text", async () => {
  const response = await page("/tg/send", { nick: "  ada\n", text: "hi <b>there</b>\u0007  you" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.match(body.session, /^[0-9a-f]{32}$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, String(OWNER));
  assert.equal(sent[0].text, "ada #1\nhi <b>there</b> you");
  assert.equal(sent[0].parse_mode, undefined);
  // Only a hash of the token is kept.
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?").get(body.session).n, 0);
});

test("a reply reaches the chat it answers, once, and only that chat", async () => {
  const ada = await open("ada");
  const bob = await open("bob");
  await hook(owner({ message_id: 77, text: "hello ada", reply_to_message: { message_id: 1001 } }));
  await hook(owner({ message_id: 77, text: "hello ada", reply_to_message: { message_id: 1001 } }));
  const forAda = await (await page("/tg/poll", { session: ada, after: 0 })).json();
  const forBob = await (await page("/tg/poll", { session: bob, after: 0 })).json();
  assert.deepEqual(forAda.messages.map((message) => message.text), ["hello ada"]);
  assert.deepEqual(forBob.messages, []);
  const later = await (await page("/tg/poll", { session: ada, after: forAda.messages[0].id })).json();
  assert.deepEqual(later.messages, []);
});

test("a message that is not a reply goes to nobody", async () => {
  const ada = await open();
  const response = await hook(owner({ text: "who is this for" }));
  assert.equal(response.status, 200);
  assert.match(sent.at(-1).text, /Reply to a visitor/);
  assert.deepEqual((await (await page("/tg/poll", { session: ada, after: 0 })).json()).messages, []);
});

test("the hook needs the secret, and an unset secret matches nothing", async () => {
  await open();
  const reply = owner({ text: "x", reply_to_message: { message_id: 1001 } });
  assert.equal((await hook(reply, "wrong")).status, 403);
  assert.equal((await hook(reply, null)).status, 403);
  env.TG_SECRET = undefined;
  assert.equal((await hook(reply, null)).status, 403);
  assert.equal((await hook(reply, "undefined")).status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM replies").get().n, 0);
});

test("only the owner can answer", async () => {
  const ada = await open();
  const stranger = { message_id: 5, chat: { id: 9, type: "private" }, from: { id: 9 }, text: "spoof", reply_to_message: { message_id: 1001 } };
  assert.equal((await hook(stranger)).status, 200);
  assert.deepEqual((await (await page("/tg/poll", { session: ada, after: 0 })).json()).messages, []);
  await hook({ ...stranger, text: "/start", reply_to_message: undefined });
  assert.match(sent.at(-1).text, /Your id: 9/);
  env.TG_CHAT = undefined;
  await hook(owner({ text: "x", reply_to_message: { message_id: 1001 } }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM replies").get().n, 0);
});

test("a database failure makes Telegram resend, and the resent answer arrives", async () => {
  const session = await open();
  const working = env.DB;
  env.DB = { prepare: () => { throw new Error("down"); }, batch: () => { throw new Error("down"); } };
  const reply = owner({ text: "later", reply_to_message: { message_id: 1001 } });
  assert.equal((await hook(reply)).status, 500);
  env.DB = working;
  assert.equal((await hook(reply)).status, 200);
  const got = await (await page("/tg/poll", { session, after: 0 })).json();
  assert.deepEqual(got.messages.map((message) => message.text), ["later"]);
  // A note to the owner that cannot be sent does not ask for a resend.
  telegramDown = true;
  assert.equal((await hook(owner({ text: "no target" }))).status, 200);
});

test("/ban closes a chat for sending and polling", async () => {
  const ada = await open();
  await hook(owner({ text: "/ban", reply_to_message: { message_id: 1001 } }));
  assert.match(sent.at(-1).text, /Closed the chat with ada #1/);
  assert.equal((await page("/tg/send", { session: ada, text: "again" })).status, 403);
  assert.equal((await page("/tg/poll", { session: ada, after: 0 })).status, 403);
});

test("requests that are not from the page are refused", async () => {
  assert.equal((await page("/tg/send", { nick: "a", text: "b" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await page("/tg/send", { nick: "a", text: "b" }, { "content-type": "text/plain" })).status, 403);
  assert.equal((await page("/tg/poll", { session: "x" }, { origin: "null" })).status, 403);
  assert.equal((await worker.fetch(new Request(ORIGIN + "/tg/send"), env)).status, 405);
  assert.equal((await worker.fetch(new Request(ORIGIN + "/tg/nope", { method: "POST" }), env)).status, 404);
  assert.equal(sent.length, 0);
});

test("bad input, unknown chats and limits", async () => {
  assert.equal((await page("/tg/send", { nick: "ada", text: "   " })).status, 400);
  assert.equal((await page("/tg/send", { text: "no nick" })).status, 400);
  assert.equal((await page("/tg/send", { session: "0".repeat(32), text: "x" })).status, 404);
  assert.equal((await page("/tg/poll", { session: "0".repeat(32), after: 0 })).status, 404);
  assert.equal((await page("/tg/send", { nick: "ada", text: "x".repeat(5000) })).status, 403);
  const long = await page("/tg/send", { nick: "n".repeat(100), text: "y".repeat(2000) });
  assert.equal(long.status, 200);
  assert.equal(sent.at(-1).text.length, 32 + " #1\n".length + 1000);
  env.RL_SEND = limiter(1);
  assert.equal((await page("/tg/send", { nick: "ada", text: "one" })).status, 200);
  assert.equal((await page("/tg/send", { nick: "ada", text: "two" })).status, 429);
  env.RL_POLL = limiter(0);
  assert.equal((await page("/tg/poll", { session: "0".repeat(32), after: 0 })).status, 429);
  env.RL_SEND = undefined;
  assert.equal((await page("/tg/send", { nick: "ada", text: "x" })).status, 500);
});

test("without the bot's token nothing is accepted, and a Telegram failure is reported", async () => {
  telegramDown = true;
  assert.equal((await page("/tg/send", { nick: "ada", text: "x" })).status, 502);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM outbound").get().n, 0);
  env.TG_TOKEN = "";
  assert.equal((await page("/tg/send", { nick: "ada", text: "x" })).status, 503);
});

test("old chats are removed when a new one opens", async () => {
  const ada = await open("ada");
  await hook(owner({ text: "hi", reply_to_message: { message_id: 1001 } }));
  db.prepare("UPDATE sessions SET last = last - 8 * 86400, created = created - 8 * 86400").run();
  // An answer counts as activity: the chat it went to survives the next clean-up.
  const eve = await open("eve");
  db.prepare("UPDATE sessions SET last = last - 8 * 86400 WHERE nick = 'eve'").run();
  await hook(owner({ message_id: 78, text: "late", reply_to_message: { message_id: 1002 } }));
  await open("bob");
  assert.equal((await page("/tg/poll", { session: eve, after: 0 })).status, 200);
  db.prepare("DELETE FROM sessions WHERE nick = 'eve'").run();
  db.prepare("DELETE FROM replies WHERE text = 'late'").run();
  assert.equal((await page("/tg/poll", { session: ada, after: 0 })).status, 404);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM replies").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 1);
});
