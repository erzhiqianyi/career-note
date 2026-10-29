const TOKYO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** ISO timestamp → YYYY-MM-DD in the workspace timezone (the API's `today` uses Asia/Tokyo too). */
export function workspaceDay(at: string): string {
  const time = Date.parse(at);
  return Number.isNaN(time) ? at.slice(0, 10) : TOKYO_DAY.format(time);
}
