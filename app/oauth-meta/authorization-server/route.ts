import { json, origin, preflight } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const o = origin(req);
  return json({
    issuer: o,
    authorization_endpoint: `${o}/authorize`,
    token_endpoint: `${o}/token`,
    registration_endpoint: `${o}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
export const OPTIONS = preflight;
