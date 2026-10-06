// Cloudflare Worker: receives a bug report from the site and posts it to the
// support channel on Discord. The webhook URL lives only here, as a secret.
//
// Setup (Cloudflare dashboard):
//   1. Workers & Pages > Create > Worker > paste this file > Deploy.
//   2. Settings > Variables and Secrets > add a Secret named DISCORD_WEBHOOK
//      with the Discord webhook URL.
//   3. Copy the Worker's URL (https://<name>.<account>.workers.dev) into
//      ENDPOINT in shared/report.js.
//   4. Optional: Security > WAF > Rate limiting rules to cap requests per IP.

const ALLOWED_ORIGINS = ["https://bitcrunching.com", "https://www.bitcrunching.com"];
const MAX_CHARS = 100;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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
    const shot = form.get("screenshot");
    if (shot && typeof shot !== "string"){
      if (!/^image\//.test(shot.type) || shot.size > MAX_IMAGE_BYTES) return reply(400, { error: "Bad screenshot" }, origin);
      const ext = (shot.type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "png";
      embed.image = { url: "attachment://screenshot." + ext };
      out.append("files[0]", shot, "screenshot." + ext);
    }
    out.append("payload_json", JSON.stringify({ username: "BC Tools report", allowed_mentions: { parse: [] }, embeds: [embed] }));

    // One report per IP per minute (per Cloudflare location, via the edge cache).
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const limitKey = new Request("https://report-limit.invalid/" + encodeURIComponent(ip));
    if (await caches.default.match(limitKey)) return reply(429, { error: "Too many reports, try again in a minute" }, origin);

    const res = await fetch(env.DISCORD_WEBHOOK, { method: "POST", body: out });
    if (res.ok) await caches.default.put(limitKey, new Response("1", { headers: { "Cache-Control": "max-age=" + COOLDOWN_SECONDS } }));
    if (!res.ok) return reply(502, { error: "Discord rejected the report" }, origin);
    return reply(200, { ok: true }, origin);
  }
};
