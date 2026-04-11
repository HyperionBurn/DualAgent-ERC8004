/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Proxy /api/* requests to the real trading agent backend.
  // The agent's Express server runs on the AGENT_API_URL (default http://localhost:3001).
  // This avoids CORS issues and makes the dashboard work in production too.
  async rewrites() {
    const agentApiUrl = process.env.AGENT_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${agentApiUrl}/api/:path*`,
      },
    ];
  },
}

export default nextConfig
