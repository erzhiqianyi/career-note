import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type Plugin } from 'vite';
import { existsSync } from 'node:fs';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// The dev server is reachable through a Cloudflare tunnel. Cloudflare treats `no-cache` on .js/.css
// URLs as "cache at the edge, revalidate", and vinext's virtual client proxies keep a stable URL and
// ETag across dependency re-optimizations, so the edge kept serving proxies that import the previous
// React chunk and the app booted with two React copies. `no-store` is the only value Cloudflare never
// caches; Vite's hashed deps keep their immutable policy because their URL changes with the content.
const noEdgeCacheInDev: Plugin = {
  name: 'career-no-edge-cache',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // Hashed deps are content-addressed, so their immutable policy stays; everything else must not be cached.
      if (!req.url?.startsWith('/node_modules/.vite/deps/')) {
        const writeHead = res.writeHead.bind(res);
        res.writeHead = ((...args: Parameters<typeof writeHead>) => {
          res.setHeader('cache-control', 'no-store');
          return writeHead(...args);
        }) as typeof res.writeHead;
      }
      next();
    });
  },
};

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
// Ports come from .env (see docs/local-setup.md "ポート"); scripts/dev.mjs also exports them for spawned processes.
if (existsSync('.env')) process.loadEnvFile('.env');
const webPort = Number(process.env.CAREER_WEB_PORT || 4210);
const apiProxyTarget = process.env.CAREER_API_PROXY || `http://127.0.0.1:${process.env.CAREER_API_PORT || 4211}`;
// Let the named tunnel's hostname reach the dev server when the ingress targets the web port.
const publicHost = process.env.CAREER_PUBLIC_ORIGIN ? new URL(process.env.CAREER_PUBLIC_ORIGIN).host : '';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      host: '127.0.0.1', // cloudflared and the API proxy dial 127.0.0.1; 'localhost' would bind only [::1] on macOS
      port: webPort,
      strictPort: true,
      allowedHosts: publicHost ? [publicHost] : [],
      proxy: {
        '/api/career': { target: apiProxyTarget, changeOrigin: true },
        '/.well-known': { target: apiProxyTarget, changeOrigin: true },
      },
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      noEdgeCacheInDev,
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
