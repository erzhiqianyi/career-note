// Where the Career Note API lives. Empty means same origin: `npm run dev` proxies /api/career to the
// local Worker, and a static build served next to the Worker needs no address at all. A hosted build
// sets NEXT_PUBLIC_CAREER_API_URL at build time (see docs/deployment.md) so the Pages site can call
// the API Worker on its own hostname.
export const API_ORIGIN = (process.env.NEXT_PUBLIC_CAREER_API_URL || '').trim().replace(/\/+$/, '');
export const API_BASE_PATH = API_ORIGIN + '/api/career';

/** Full URL (or same-origin path) for an API route such as `state` or `auth/config`. */
export function apiUrl(path = ''): string {
  const clean = path.replace(/^\/+/, '');
  return clean ? API_BASE_PATH + '/' + clean : API_BASE_PATH;
}
