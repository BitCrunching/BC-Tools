// Cloudflare Worker: receives a bug report from the site and posts it to the
// support channel on Discord. The webhook URL lives only here, as a secret.
//
// Setup (Cloudflare dashboard):
//   1. Workers & Pages > Create > Worker > paste this file > Deploy.
//   2. Settings > Variables and Secrets > add a Secret named DISCORD_WEBHOOK
//      with the Discord webhook URL.
//   3. Copy the Worker's URL (https://<name>.<account>.workers.dev) into
//      ENDPOINT in shared/report.js.
//   4. Rate limit (required): Storage & Databases > KV > create a namespace, then on
//      the Worker Settings > Bindings > Add > KV namespace, variable name RATE.
//      Without it the Worker refuses every report (503) instead of running unlimited.

const ALLOWED_ORIGINS = ["https://bitcrunching.com", "https://www.bitcrunching.com", "http://localhost:8006"]; // localhost: testing only, remove before release
const MAX_CHARS = 100;
const MAX_SHOTS = 3;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const COOLDOWN_SECONDS = 60;
const MAX_REPORTS_PER_HOUR = 60;

// Screenshots are accepted only when their first bytes match a real image format.
const IMAGE_TYPES = [
  { ext: "png", mime: "image/png", test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: "jpg", mime: "image/jpeg", test: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: "gif", mime: "image/gif", test: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  { ext: "webp", mime: "image/webp", test: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 }
];

async function sniffImage(file){
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return IMAGE_TYPES.find(t => t.test(head)) || null;
}

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

    // Rate limits first, before reading the body: one report per IP per minute and
    // MAX_REPORTS_PER_HOUR reports in total per hour. Fail closed if KV isn't bound.
    if (!env.RATE) return reply(503, { error: "Rate limiter not configured" }, origin);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = "ip:" + ip;
    const hourKey = "hour:" + Math.floor(Date.now() / 3600000);
    if (await env.RATE.get(ipKey)) return reply(429, { error: "Too many reports, try again in a minute" }, origin);
    const hourCount = parseInt(await env.RATE.get(hourKey) || "0", 10);
    if (hourCount >= MAX_REPORTS_PER_HOUR) return reply(429, { error: "Reports are paused for a while, try again later" }, origin);

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
    const total = shots.reduce((n, f) => n + f.size, 0);
    if (total > MAX_TOTAL_BYTES) return reply(400, { error: "Bad screenshot" }, origin);
    const names = [];
    for (let i = 0; i < shots.length; i++){
      const kind = await sniffImage(shots[i]);
      if (!kind) return reply(400, { error: "Bad screenshot" }, origin);
      const name = "screenshot-" + (i + 1) + "." + kind.ext;
      names.push(name);
      out.append("files[" + i + "]", new Blob([shots[i]], { type: kind.mime }), name);
    }
    if (names.length) embed.image = { url: "attachment://" + names[0] };
    out.append("payload_json", JSON.stringify({ username: "BC Tools report", allowed_mentions: { parse: [] }, embeds: [embed] }));

    // Reserve the slot before posting so a quick second request is blocked; undo if Discord fails.
    await env.RATE.put(ipKey, "1", { expirationTtl: COOLDOWN_SECONDS });
    const res = await fetch(env.DISCORD_WEBHOOK, { method: "POST", body: out });
    if (!res.ok){
      await env.RATE.delete(ipKey);
      return reply(502, { error: "Discord rejected the report" }, origin);
    }
    await env.RATE.put(hourKey, String(hourCount + 1), { expirationTtl: 7200 });
    return reply(200, { ok: true }, origin);
  }
};
