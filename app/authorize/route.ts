// Sign-in page. You type MCP_KEY once; the client then receives a code.
import { CODE_TTL, configured, now, passphraseOk, sign, verify } from "@/lib/oauth";

export const dynamic = "force-dynamic";

type P = Record<string, string>;
const FIELDS = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "response_type"];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function check(p: P): string | null {
  if (!configured()) return "Server is not configured (MCP_KEY missing or too short).";
  const c = verify<{ ru: string[] }>(p.client_id, "client");
  if (!c) return "Unknown client.";
  if (!p.redirect_uri || !c.ru.includes(p.redirect_uri)) return "redirect_uri is not registered for this client.";
  if (p.response_type !== "code") return "response_type must be code.";
  if (!p.code_challenge || p.code_challenge_method !== "S256") return "PKCE with S256 is required.";
  return null;
}

function page(p: P, error = "", status = 200) {
  let host = "unknown";
  try {
    host = new URL(p.redirect_uri).host;
  } catch {}
  const hidden = FIELDS.map((k) => `<input type="hidden" name="${k}" value="${esc(p[k] ?? "")}">`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in</title>
<style>
:root{color-scheme:light dark}
body{font:16px system-ui,sans-serif;max-width:26rem;margin:12vh auto;padding:0 1rem}
input[type=password]{width:100%;padding:.6rem;margin:.5rem 0 1rem;box-sizing:border-box}
button{padding:.6rem 1.2rem}.err{color:#c0392b}code{word-break:break-all}
</style></head><body>
<h1>Server memory</h1>
<p>An app is asking for access. After sign-in it will be sent to <code>${esc(host)}</code>.</p>
${error ? `<p class="err">${esc(error)}</p>` : ""}
<form method="post">${hidden}
<label>Passphrase<input type="password" name="passphrase" autocomplete="current-password" autofocus required></label>
<button type="submit">Allow access</button></form></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const p: P = Object.fromEntries(FIELDS.map((k) => [k, sp.get(k) ?? ""]));
  const err = check(p);
  return err ? page(p, err, 400) : page(p);
}

export async function POST(req: Request) {
  const fd = await req.formData();
  const p: P = Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "")]));
  const err = check(p);
  if (err) return page(p, err, 400);
  if (!passphraseOk(String(fd.get("passphrase") ?? ""))) {
    await new Promise((r) => setTimeout(r, 800));
    return page(p, "Wrong passphrase.", 401);
  }
  const code = sign({
    t: "code",
    cid: p.client_id,
    ru: p.redirect_uri,
    cc: p.code_challenge,
    exp: now() + CODE_TTL,
  });
  const u = new URL(p.redirect_uri);
  u.searchParams.set("code", code);
  if (p.state) u.searchParams.set("state", p.state);
  return new Response(null, {
    status: 302,
    headers: { location: u.toString(), "cache-control": "no-store" },
  });
}
