const PAGE_SIZE = 1000;
const SAFETY_CAP = 100_000;

/**
 * Fetches every matching row from Supabase, working around the
 * server-side db-max-rows cap (default 1000) by paginating.
 * `buildQuery` must return a FRESH query builder on each call —
 * Supabase builders are single-use and cannot be re-executed.
 */
export async function fetchAllRows<T extends { id?: string | number }>(
  buildQuery: () => any
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string | number>();
  let from = 0;

  while (from < SAFETY_CAP) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as T[]) {
      // Guard against rows shifting between pages if records are
      // inserted mid-fetch, which would otherwise duplicate keys.
      if (row.id !== undefined) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
      }
      rows.push(row);
    }

    // Advance by rows actually received, not by PAGE_SIZE — the server
    // may return fewer than requested if db-max-rows is set below it.
    from += data.length;
  }

  return rows;
}