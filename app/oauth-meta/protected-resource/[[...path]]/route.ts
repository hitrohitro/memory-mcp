import { json, origin, preflight } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const o = origin(req);
  return json({
    resource: `${o}/api/mcp`,
    authorization_servers: [o],
    bearer_methods_supported: ["header"],
  });
}
export const OPTIONS = preflight;
