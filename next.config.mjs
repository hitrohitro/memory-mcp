// Serve OAuth discovery documents at the standard /.well-known/ paths.
export default {
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/oauth-meta/protected-resource/:path*",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/oauth-meta/authorization-server",
      },
    ];
  },
};
