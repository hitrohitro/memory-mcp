import { ACCESS_TTL, REFRESH_TTL, json, now, pkceOk, preflight, sign, verify } from "@/lib/oauth";

export const dynamic = "force-dynamic";

function tokens(cid: string) {
  return json({
    access_token: sign({ t: "at", cid, exp: now() + ACCESS_TTL }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: sign({ t: "rt", cid, exp: now() + REFRESH_TTL }),
  });
}

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  let b: Record<string, string> = {};
  try {
    b = ct.includes("json")
      ? await req.json()
      : Object.fromEntries(new URLSearchParams(await req.text()));
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (!b.client_id) {
    const m = /^Basic (.+)$/i.exec(req.headers.get("authorization") ?? "");
    if (m) b.client_id = Buffer.from(m[1], "base64").toString().split(":")[0];
  }

  if (b.grant_type === "authorization_code") {
    const c = verify<{ cid: string; ru: string; cc: string }>(b.code, "code");
    if (
      !c ||
      c.cid !== b.client_id ||
      c.ru !== b.redirect_uri ||
      !b.code_verifier ||
      !pkceOk(b.code_verifier, c.cc)
    ) {
      return json({ error: "invalid_grant" }, 400);
    }
    return tokens(c.cid);
  }

  if (b.grant_type === "refresh_token") {
    const r = verify<{ cid: string }>(b.refresh_token, "rt");
    if (!r || (b.client_id && r.cid !== b.client_id)) return json({ error: "invalid_grant" }, 400);
    return tokens(r.cid);
  }

  return json({ error: "unsupported_grant_type" }, 400);
}
export const OPTIONS = preflight;
