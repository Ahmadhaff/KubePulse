const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/chat -> NestJS /chat so the browser never calls the backend directly (no CORS needed).
  async rewrites() {
    return [{ source: '/api/chat', destination: `${backendUrl}/chat` }];
  },
};

export default nextConfig;
