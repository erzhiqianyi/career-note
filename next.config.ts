import type { NextConfig } from 'next';

// The app is fully client-rendered; export static HTML so it can be hosted as plain files (Cloudflare Pages).
const nextConfig: NextConfig = { output: 'export' };

export default nextConfig;
