// Dynamic client registration. The client_id is a signed copy of its redirect
// URIs, so nothing is stored. Registering grants no access by itself: the
// passphrase is still required on /authorize.
import { json, now, preflight, sign } from "@/lib/oauth";

export const dynamic = "force-dynamic";

const badUri = (x: unknown) => {
  if (typeof x !== "string") return true;
  try {
    const u = new URL(x);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return !(u.protocol === "https:" || (local && u.protocol === "http:"));
  } catch {
    return true;
  }
};

export async function POST(req: Request) {
  let b: any;
  try {
    b = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata" }, 400);
  }
  const ru: unknown = b?.redirect_uris;
  if (!Array.isArray(ru) || ru.length === 0 || ru.length > 10 || ru.some(badUri)) {
    return json({ error: "invalid_redirect_uri" }, 400);
  }
  return json(
    {
      client_id: sign({ t: "client", ru }),
      client_id_issued_at: now(),
      client_name: typeof b.client_name === "string" ? b.client_name.slice(0, 100) : "client",
      redirect_uris: ru,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}
export const OPTIONS = preflight;
