// app/api/[transport]/route.ts
// MCP front door on Vercel. Claude connects here; tool calls are forwarded to
// the home-server backend (backend/server.py) with a shared-secret header.
//
// Auth: OAuth sign-in (see app/authorize). Clients send "Authorization: Bearer <token>".
//
// Env vars (Vercel project settings):
//   MCP_KEY          random string (32+ chars); the passphrase you type at sign-in
//   BACKEND_URL      public tunnel URL of the home server, no trailing slash
//   BACKEND_SECRET   same value as BACKEND_SECRET on the home server
//
// Versions: mcp-handler@^1, @modelcontextprotocol/sdk@1.26.0, zod@^3
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { origin, verify } from "@/lib/oauth";

const BACKEND_URL = process.env.BACKEND_URL ?? "";
const BACKEND_SECRET = process.env.BACKEND_SECRET ?? "";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

async function backend(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(BACKEND_URL + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-backend-secret": BACKEND_SECRET,
    },
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`backend ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown error");
  }
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "save_context",
      "Save one decision, fix, or state change about the home servers so any future chat can find it. " +
        "Write a short standalone summary (not a transcript). Never include passwords, keys or tokens.",
      {
        title: z.string().min(1).max(200),
        summary: z.string().min(1).max(2000),
        details: z.string().max(8000).optional(),
        tags: z.string().max(200).optional().describe("comma-separated"),
        machine: z.string().max(50).optional().describe("e.g. balthasar, casper, melchior"),
        source: z.string().max(50).optional().describe("which client or model is saving this"),
      },
      async (args) =>
        run(() => backend("/save", { method: "POST", body: JSON.stringify(args) })),
    );

    server.tool(
      "search_context",
      "Keyword search over saved server context. Call this before answering questions about the user's servers.",
      {
        query: z.string().min(1).max(300),
        limit: z.number().int().min(1).max(25).optional(),
      },
      async (args) =>
        run(() => backend("/search", { method: "POST", body: JSON.stringify(args) })),
    );

    server.tool(
      "get_recent",
      "Most recently saved or updated server context. Call at the start of a server-related chat to catch up.",
      {
        n: z.number().int().min(1).max(50).optional(),
        machine: z.string().max(50).optional(),
      },
      async ({ n, machine }) => {
        const qs = new URLSearchParams();
        if (n) qs.set("n", String(n));
        if (machine) qs.set("machine", machine);
        return run(() => backend(`/recent?${qs.toString()}`));
      },
    );

    server.tool(
      "update_context",
      "Correct or extend an existing entry by id instead of saving a contradicting duplicate.",
      {
        id: z.number().int(),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().min(1).max(2000).optional(),
        details: z.string().max(8000).optional(),
        tags: z.string().max(200).optional(),
        machine: z.string().max(50).optional(),
      },
      async (args) =>
        run(() => backend("/update", { method: "POST", body: JSON.stringify(args) })),
    );
  },
  {},
  {
    basePath: "/api", // must match where [transport] lives
    maxDuration: 30,
    disableSse: true, // streamable HTTP only
    verboseLogs: false,
  },
);

function hasValidToken(req: Request): boolean {
  const m = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "");
  return !!verify(m?.[1], "at");
}

const guarded = (req: Request) => {
  if (hasValidToken(req)) return handler(req);
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${origin(req)}/.well-known/oauth-protected-resource"`,
    },
  });
};

export { guarded as GET, guarded as POST, guarded as DELETE };
