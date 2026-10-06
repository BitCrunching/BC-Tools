// Cloudflare Worker: receives a bug report from the site and posts it to the
// support channel on Discord. The webhook URL lives only here, as a secret.
//
// Setup (Cloudflare dashboard):
//   1. Workers & Pages > Create > Worker > paste this file > Deploy.
//   2. Settings > Variables and Secrets > add a Secret named DISCORD_WEBHOOK
//      with the Discord webhook URL.
//   3. Copy the Worker's URL (https://<name>.<account>.workers.dev) into
//      ENDPOINT in shared/report.js.
//   4. Rate limit: Storage & Databases > KV > create a namespace, then on the Worker
//      Settings > Bindings > Add > KV namespace, variable name RATE.

const ALLOWED_ORIGINS = ["https://bitcrunching.com", "https://www.bitcrunching.com", "http://localhost:8006"]; // localhost: testing only, remove before release
const MAX_CHARS = 100;
const MAX_SHOTS = 3;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const COOLDOWN_SECONDS = 60;

function cors(origin){
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function reply(status, body, origin){
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
}

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return reply(405, { error: "POST only" }, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Origin not allowed" }, origin);
    if (!env.DISCORD_WEBHOOK) return reply(500, { error: "Not configured" }, origin);

    let form;
    try { form = await request.formData(); } catch (err) { return reply(400, { error: "Bad form" }, origin); }

    const message = String(form.get("message") || "").trim().slice(0, MAX_CHARS);
    if (!message) return reply(400, { error: "Empty message" }, origin);
    const page = String(form.get("page") || "").slice(0, 120);
    const screen = String(form.get("screen") || "").slice(0, 60);
    const browser = String(form.get("browser") || "").slice(0, 200);

    const embed = {
      title: "Bug report",
      description: message,
      color: 0xB91C3C,
      fields: [
        { name: "Page", value: page || "-", inline: true },
        { name: "Screen", value: screen || "-", inline: true },
        { name: "Browser", value: browser || "-" }
      ]
    };

    const out = new FormData();
    const shots = form.getAll("screenshot").filter(f => f && typeof f !== "string").slice(0, MAX_SHOTS);
    let total = 0;
    shots.forEach((shot, i) => {
      total += shot.size;
      const ext = (shot.type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "png";
      shot.__name = "screenshot-" + (i + 1) + "." + ext;
    });
    if (shots.some(s => !/^image\//.test(s.type)) || total > MAX_TOTAL_BYTES) return reply(400, { error: "Bad screenshot" }, origin);
    shots.forEach((shot, i) => out.append("files[" + i + "]", shot, shot.__name));
    if (shots.length) embed.image = { url: "attachment://" + shots[0].__name };
    out.append("payload_json", JSON.stringify({ username: "BC Tools report", allowed_mentions: { parse: [] }, embeds: [embed] }));

    // One report per IP per minute, when a KV namespace is bound as RATE.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE && await env.RATE.get("ip:" + ip)) return reply(429, { error: "Too many reports, try again in a minute" }, origin);

    const res = await fetch(env.DISCORD_WEBHOOK, { method: "POST", body: out });
    if (!res.ok) return reply(502, { error: "Discord rejected the report" }, origin);
    if (env.RATE) await env.RATE.put("ip:" + ip, "1", { expirationTtl: COOLDOWN_SECONDS });
    return reply(200, { ok: true }, origin);
  }
};
