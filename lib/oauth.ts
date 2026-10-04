// Minimal stateless OAuth 2.1 helpers (PKCE, dynamic client registration).
// Everything is an HMAC-signed token, so no database is needed on Vercel.
// The signing key and the sign-in passphrase both derive from MCP_KEY:
// changing MCP_KEY in Vercel instantly invalidates every client and token.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MCP_KEY = process.env.MCP_KEY ?? "";
export const configured = () => MCP_KEY.length >= 32;

export const ACCESS_TTL = 60 * 60 * 24 * 30; // 30 days
export const REFRESH_TTL = 60 * 60 * 24 * 365; // 365 days
export const CODE_TTL = 300; // 5 minutes
export const now = () => Math.floor(Date.now() / 1000);

const signingKey = () =>
  createHmac("sha256", MCP_KEY).update("oauth-signing-v1").digest();

export function sign(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify<T = Record<string, any>>(
  token: string | null | undefined,
  type: string,
): T | null {
  if (!token || !configured()) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const want = createHmac("sha256", signingKey()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.t !== type) return null;
    if (typeof p.exp === "number" && p.exp < now()) return null;
    return p as T;
  } catch {
    return null;
  }
}

export function passphraseOk(given: string): boolean {
  if (!configured()) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(MCP_KEY).digest();
  return timingSafeEqual(a, b);
}

export const pkceOk = (verifier: string, challenge: string) =>
  createHash("sha256").update(verifier).digest("base64url") === challenge;

export function origin(req: Request): string {
  const h = req.headers;
  const u = new URL(req.url);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? u.host;
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra },
  });

export const preflight = () => new Response(null, { status: 204, headers: CORS });
