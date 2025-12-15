/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/market/:path*',
        destination: 'http://127.0.0.1:8001/api/v1/:path*', // Proxy to Python Market Service
      },
      {
        source: '/api/news/:path*',
        destination: 'http://127.0.0.1:8002/api/v1/news/:path*', // Proxy to Python News Service
      },
      {
        source: '/api/quant/:path*',
        destination: 'http://127.0.0.1:8003/api/v1/:path*', // Proxy to Python Quant Engine
      },
    ]
  },
}

export default nextConfig
