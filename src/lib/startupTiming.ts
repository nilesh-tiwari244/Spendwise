// TEMPORARY: how long each step of opening the app took, shown by
// long-pressing the version line at the bottom of the menu. Used to compare
// startup speed before and after changes on real phones; remove afterwards.

type Mark = { at: number; note?: string };
const marks: Record<string, Mark> = {};

const LABELS: Record<string, string> = {
  'app-code-running': 'App code running',
  'login-check-done': 'Login check finished',
  'screen-shown': 'Home or page shown',
  'data-load-start': 'Fresh data requested',
  'data-batch-done': 'Buckets, balances, categories, shares back',
  'balances-fresh': 'Fresh balances on screen',
  'transactions-done': 'Newest transactions back',
  'live-updates-connected': 'Live updates connected',
};

// Records the first time a step happens, in ms since the page started.
export function markStartup(name: string, note?: string) {
  if (marks[name]) return;
  marks[name] = { at: performance.now(), note };
}

const ms = (n: number) => `${String(Math.round(n)).padStart(5)}ms`;

const requestLabel = (url: string) => {
  const path = url.split('.supabase.co')[1] ?? url;
  if (path.startsWith('/auth/v1/token')) return 'login renewal';
  if (path.startsWith('/auth/v1/user')) return 'login check (user)';
  if (path.startsWith('/auth')) return 'login ' + path.split('?')[0].replace('/auth/v1/', '');
  if (path.startsWith('/realtime')) return 'live updates socket';
  const rest = decodeURIComponent(path.replace('/rest/v1/', ''));
  const table = rest.split('?')[0];
  if (table === 'transactions' && rest.includes('bucket_id=is.null')) return 'no-bucket count';
  if (table === 'transactions') return 'transactions';
  if (table === 'bucket_shares') return rest.includes('shared_with_email') ? 'shares with me' : 'shares by me';
  return table.replace('rpc/', '');
};

export function startupReport(): string {
  const lines: string[] = [];
  const opened = new Date(performance.timeOrigin);
  lines.push(`Opened ${opened.toLocaleTimeString('en-IN')} · ${__APP_BUILD__.sha}`);
  lines.push(`App files from saved copy: ${navigator.serviceWorker?.controller ? 'yes' : 'no'}`);
  const conn = (navigator as any).connection;
  if (conn?.effectiveType) lines.push(`Connection: ${conn.effectiveType}`);
  lines.push('', 'Steps (since the page started):');
  Object.entries(marks)
    .sort((a, b) => a[1].at - b[1].at)
    .forEach(([name, m]) => lines.push(`${ms(m.at)}  ${LABELS[name] ?? name}${m.note ? ` (${m.note})` : ''}`));

  const requests = performance.getEntriesByType('resource')
    .filter(e => e.name.includes('.supabase.co'))
    .slice(0, 20) as PerformanceResourceTiming[];
  if (requests.length) {
    lines.push('', 'Requests (start, how long):');
    for (const r of requests) lines.push(`${ms(r.startTime)} +${ms(r.duration).trim()}  ${requestLabel(r.name)}`);
  }
  return lines.join('\n');
}
