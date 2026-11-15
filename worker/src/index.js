// The backend of the `mail` command in the site's terminal (site/assets/shell.js).
// It takes POST /mail with JSON {"message": "...", "reply": "..."} and sends one plain-text
// email to the address in the MAIL_TO secret. The recipient is never taken from the request.

const MAX_MESSAGE = 1000;
const MAX_REPLY = 200;
const MAX_BODY = 4096;
const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = origin !== null && origin === env.ALLOWED_ORIGIN;
    const cors = allowed ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};
    const answer = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors }
    });

    if (new URL(request.url).pathname !== "/mail") return answer(404, { error: "not found" });
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" }
      });
    }
    if (request.method !== "POST") return answer(405, { error: "POST only" });
    // Only the site's own pages may call this from a browser.
    if (!allowed) return answer(403, { error: "wrong origin" });
    if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) return answer(415, { error: "JSON only" });
    if (Number(request.headers.get("Content-Length")) > MAX_BODY) return answer(413, { error: "too long" });

    // Count before reading the body, so that a rejected request still spends the sender's allowance.
    const visitor = request.headers.get("CF-Connecting-IP") || "unknown";
    const one = await env.PER_VISITOR.limit({ key: visitor });
    const all = one.success ? await env.EVERYONE.limit({ key: "all" }) : one;
    if (!all.success) return answer(429, { error: "too many messages" });

    let data;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return answer(413, { error: "too long" });
      data = JSON.parse(text);
    } catch (error) {
      return answer(400, { error: "bad JSON" });
    }
    const message = typeof data?.message === "string" ? data.message.trim() : "";
    const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
    if (!message) return answer(400, { error: "empty message" });
    if (message.length > MAX_MESSAGE) return answer(413, { error: "too long" });
    if (reply && (reply.length > MAX_REPLY || !ADDRESS.test(reply))) return answer(400, { error: "bad reply address" });

    try {
      await env.EMAIL.send({
        to: env.MAIL_TO,
        from: { email: env.MAIL_FROM, name: "novosad.xyz terminal" },
        subject: "Message from the terminal",
        text: message + "\n\n-- \n" + (reply ? "reply to: " + reply : "no reply address given") + "\nsent from the terminal on novosad.xyz",
        ...(reply ? { replyTo: reply } : {})
      });
    } catch (error) {
      console.error("send failed", error?.code, error?.message);
      return answer(502, { error: "send failed" });
    }
    return answer(200, { ok: true });
  }
};
