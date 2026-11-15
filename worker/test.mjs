// Run with: node --test worker/
import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./src/index.js";

const ORIGIN = "https://novosad.xyz";

function env(options = {}) {
  const sent = [];
  const counts = {};
  const limiter = (limit) => ({
    limit: async ({ key }) => ({ success: (counts[limit + key] = (counts[limit + key] || 0) + 1) <= limit })
  });
  return {
    sent,
    MAIL_TO: "owner@example.com",
    MAIL_FROM: "terminal@novosad.xyz",
    ALLOWED_ORIGIN: ORIGIN,
    PER_VISITOR: limiter(2),
    EVERYONE: limiter(6),
    EMAIL: { send: async (message) => { if (options.broken) throw new Error("down"); sent.push(message); return { messageId: "1" }; } }
  };
}

function post(body, headers = {}) {
  return new Request("https://api.novosad.xyz/mail", {
    method: "POST",
    headers: { "Origin": ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

test("a message goes to the fixed recipient with the reply address", async () => {
  const e = env();
  const response = await worker.fetch(post({ message: " hello ", reply: "guest@example.org", to: "victim@example.net" }), e);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(e.sent.length, 1);
  assert.equal(e.sent[0].to, "owner@example.com");
  assert.equal(e.sent[0].replyTo, "guest@example.org");
  assert.match(e.sent[0].text, /^hello\n/);
});

test("the reply address is optional", async () => {
  const e = env();
  assert.equal((await worker.fetch(post({ message: "hello" }), e)).status, 200);
  assert.equal("replyTo" in e.sent[0], false);
});

test("bad requests send nothing", async () => {
  const cases = [
    [post({ message: "hello" }, { Origin: "https://evil.example" }), 403],
    [post({ message: "" }), 400],
    [post({ message: "x".repeat(1001) }), 413],
    [post("x".repeat(5000)), 413],
    [post("not json"), 400],
    [post({ message: "hello", reply: "not an address" }), 400],
    [post({ message: "hello", reply: "a@b.c\r\nBcc: victim@example.net" }), 400],
    [post({ message: "hello" }, { "Content-Type": "text/plain" }), 415],
    [new Request("https://api.novosad.xyz/mail", { headers: { Origin: ORIGIN } }), 405],
    [new Request("https://api.novosad.xyz/other", { method: "POST", headers: { Origin: ORIGIN } }), 404]
  ];
  for (const [request, status] of cases) {
    const e = env();
    assert.equal((await worker.fetch(request, e)).status, status);
    assert.equal(e.sent.length, 0);
  }
});

test("the preflight request is answered for the site only", async () => {
  const ask = (origin) => worker.fetch(new Request("https://api.novosad.xyz/mail", { method: "OPTIONS", headers: { Origin: origin } }), env());
  const ours = await ask(ORIGIN);
  assert.equal(ours.status, 204);
  assert.equal(ours.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal((await ask("https://evil.example")).headers.get("Access-Control-Allow-Origin"), null);
});

test("the third message in a minute from one visitor is refused", async () => {
  const e = env();
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await worker.fetch(post({ message: "hello" }), e)).status);
  assert.deepEqual(statuses, [200, 200, 429]);
  assert.equal(e.sent.length, 2);
});

test("everybody together is limited too", async () => {
  const e = env();
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await worker.fetch(post({ message: "hello" }, { "CF-Connecting-IP": "203.0.113." + i }), e)).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
});

test("a failed send is reported, so the page can fall back to the mail client", async () => {
  assert.equal((await worker.fetch(post({ message: "hello" }), env({ broken: true }))).status, 502);
});
