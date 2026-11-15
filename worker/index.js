// The functions behind the terminal's `tg` command. Only /tg/* reaches this script
// (run_worker_first in wrangler.jsonc); every other path is a static file.
//
//   POST /tg/send  {session?, nick?, text}  -> the text goes to the owner's Telegram chat
//   POST /tg/poll  {session, after}         -> the owner's answers since `after`
//   POST /tg/hook                           -> Telegram's webhook: the owner replied
//
// Secrets, set with `wrangler secret put`, never in the repository:
//   TG_TOKEN   the bot's token
//   TG_SECRET  the webhook's secret_token
//   TG_CHAT    the owner's Telegram user id; nobody else can answer

const TEXT_MAX = 1000;
const NICK_MAX = 32;
const BODY_MAX = 4000;
const DAY = 86400;
const KEEP_DAYS = 7;
// Ceilings that hold even when the per-address limits are passed around.
const SESSIONS_PER_DAY = 200;
const MESSAGES_PER_SESSION = 300;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}
const fail = (status, error) => json({ error }, status);
const now = () => Math.floor(Date.now() / 1000);
const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function sha256(text) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}
// Compares two secrets without leaking where they differ. An unset secret never matches.
async function same(given, secret) {
  if (!given || !secret) return false;
  return (await sha256(given)) === (await sha256(secret));
}

// One line of printable text: control characters become spaces, runs of spaces collapse.
function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function limited(binding, key) {
  if (!binding) throw new Error("a rate limit binding is missing");
  return !(await binding.limit({ key })).success;
}

async function telegram(env, method, payload) {
  const response = await fetch(`${env.TG_API || "https://api.telegram.org"}/bot${env.TG_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok) throw new Error(`telegram ${method}: ${response.status}`);
  return data.result;
}

// A request from the site's own page: a JSON POST whose Origin is this origin.
async function fromPage(request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return null;
  if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) return null;
  const raw = await request.text();
  if (raw.length > BODY_MAX) return null;
  try {
    const body = JSON.parse(raw);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch (error) {
    return null;
  }
}

async function find(env, token) {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return null;
  return env.DB.prepare("SELECT id, nick, sent, banned FROM sessions WHERE token_hash = ?").bind(await sha256(token)).first();
}

async function send(request, env) {
  const body = await fromPage(request);
  if (!body) return fail(403, "forbidden");
  if (!env.TG_TOKEN || !env.TG_CHAT) return fail(503, "not configured");
  const address = request.headers.get("cf-connecting-ip") || "unknown";
  if (await limited(env.RL_SEND, address)) return fail(429, "slow down");

  const text = clean(body.text, TEXT_MAX);
  if (!text) return fail(400, "empty");
  const at = now();
  let token = body.session;
  let session = token ? await find(env, token) : null;
  if (token && !session) return fail(404, "gone");

  if (!session) {
    const nick = clean(body.nick, NICK_MAX);
    if (!nick) return fail(400, "nick");
    if (await limited(env.RL_NEW, address)) return fail(429, "slow down");
    // Old chats go first, so the tables and the daily count stay small.
    const old = at - KEEP_DAYS * DAY;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM replies WHERE session_id IN (SELECT id FROM sessions WHERE last < ?)").bind(old),
      env.DB.prepare("DELETE FROM outbound WHERE session_id IN (SELECT id FROM sessions WHERE last < ?)").bind(old),
      env.DB.prepare("DELETE FROM sessions WHERE last < ?").bind(old)
    ]);
    const today = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE created > ?").bind(at - DAY).first();
    if (today.n >= SESSIONS_PER_DAY) return fail(429, "full");
    token = hex(crypto.getRandomValues(new Uint8Array(16)));
    const made = await env.DB.prepare("INSERT INTO sessions (token_hash, nick, created, last) VALUES (?, ?, ?, ?) RETURNING id")
      .bind(await sha256(token), nick, at, at).first();
    session = { id: made.id, nick, sent: 0, banned: 0 };
  }
  if (session.banned) return fail(403, "closed");
  if (session.sent >= MESSAGES_PER_SESSION) return fail(429, "full");

  // Plain text, no parse_mode: nothing a visitor types is read as markup. The nick is not verified.
  let message;
  try {
    message = await telegram(env, "sendMessage", { chat_id: env.TG_CHAT, text: `${session.nick} #${session.id}\n${text}` });
  } catch (error) {
    console.error("tg send:", error && error.message);
    return fail(502, "not sent");
  }
  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO outbound (tg_message_id, session_id, at) VALUES (?, ?, ?)").bind(message.message_id, session.id, at),
    env.DB.prepare("UPDATE sessions SET last = ?, sent = sent + 1 WHERE id = ?").bind(at, session.id)
  ]);
  return json({ ok: true, session: token, nick: session.nick });
}

async function poll(request, env) {
  const body = await fromPage(request);
  if (!body) return fail(403, "forbidden");
  if (await limited(env.RL_POLL, request.headers.get("cf-connecting-ip") || "unknown")) return fail(429, "slow down");
  const session = await find(env, body.session);
  if (!session) return fail(404, "gone");
  if (session.banned) return fail(403, "closed");
  const after = Number.isSafeInteger(body.after) && body.after > 0 ? body.after : 0;
  const rows = await env.DB.prepare("SELECT id, text, at FROM replies WHERE session_id = ? AND id > ? ORDER BY id LIMIT 50").bind(session.id, after).all();
  return json({ messages: rows.results });
}

// Telegram calls this when the owner writes to the bot. An answer must be a reply to the
// visitor's message: that is the only way it finds its chat, so nothing reaches a stranger.
async function hook(request, env) {
  if (!(await same(request.headers.get("x-telegram-bot-api-secret-token"), env.TG_SECRET))) return fail(403, "forbidden");
  // From here on the answer is always 200: Telegram resends an update on anything else.
  try {
    const update = await request.json();
    const message = update && update.message;
    if (!message || !message.chat || !message.from) return json({ ok: true });
    const say = (text) => telegram(env, "sendMessage", { chat_id: message.chat.id, text });
    const owner = env.TG_CHAT && String(message.chat.id) === String(env.TG_CHAT) && String(message.from.id) === String(env.TG_CHAT);
    if (!owner) {
      // Lets the owner learn the id to put into TG_CHAT; a stranger learns only their own.
      if (message.chat.type === "private" && message.text === "/start") await say(`This bot is private. Your id: ${message.from.id}`);
      return json({ ok: true });
    }
    const target = message.reply_to_message;
    if (!target) {
      await say("Reply to a visitor's message to answer it. A reply with /ban closes that chat.");
      return json({ ok: true });
    }
    const session = await env.DB.prepare(
      "SELECT s.id, s.nick FROM outbound o JOIN sessions s ON s.id = o.session_id WHERE o.tg_message_id = ?").bind(target.message_id).first();
    if (!session) {
      await say("That chat is gone.");
      return json({ ok: true });
    }
    if (typeof message.text !== "string") {
      await say("Text only.");
      return json({ ok: true });
    }
    if (message.text.trim() === "/ban") {
      await env.DB.prepare("UPDATE sessions SET banned = 1 WHERE id = ?").bind(session.id).run();
      await say(`Closed the chat with ${session.nick} #${session.id}.`);
      return json({ ok: true });
    }
    const text = message.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, 4000);
    if (text) {
      await env.DB.prepare("INSERT OR IGNORE INTO replies (session_id, tg_message_id, text, at) VALUES (?, ?, ?, ?)")
        .bind(session.id, message.message_id, text, now()).run();
    }
  } catch (error) {
    console.error("tg hook:", error && error.message);
  }
  return json({ ok: true });
}

const routes = { "/tg/send": send, "/tg/poll": poll, "/tg/hook": hook };

export default {
  async fetch(request, env) {
    const handler = routes[new URL(request.url).pathname];
    if (!handler) return fail(404, "not found");
    if (request.method !== "POST") return fail(405, "post only");
    try {
      return await handler(request, env);
    } catch (error) {
      console.error("tg:", error && error.message);
      return fail(500, "error");
    }
  }
};
