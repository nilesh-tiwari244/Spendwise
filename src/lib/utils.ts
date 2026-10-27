import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Transactions can be saved without a category (category_id is null). These
// let "no category" be summarised and filtered as if it were one more
// category, instead of quietly disappearing from Summary and Search. Real
// category ids are UUIDs, so the sentinel can never collide with one.
export const UNCATEGORIZED_ID = '__uncategorized__';
export const UNCATEGORIZED_LABEL = '(Blank)';

// A transaction counts as edited once it was changed more than five minutes
// after it was added, so a quick correction right after saving isn't flagged.
// The database stamps updated_at on every change - including the move to the
// recycle bin - so for a deleted transaction pass deletedAt, and a change at
// the moment of deletion isn't mistaken for an edit.
const EDIT_GRACE_MS = 5 * 60 * 1000;

export function wasUpdatedAfterAdding(
  createdAt: string | null | undefined,
  updatedAt: string | null | undefined,
  deletedAt?: string | null
): boolean {
  if (!createdAt || !updatedAt) return false;
  const updated = new Date(updatedAt).getTime();
  if (updated - new Date(createdAt).getTime() <= EDIT_GRACE_MS) return false;
  if (deletedAt && Math.abs(updated - new Date(deletedAt).getTime()) <= EDIT_GRACE_MS) return false;
  return true;
}

// Category names already used in the user's other buckets, most widely used
// first, minus names this bucket already has. Reusing the exact spelling keeps
// month-end totals together, since Search matches categories across buckets by
// name. Categories with no bucket (old sign-up defaults) are skipped.
export function categoryNameSuggestions(
  categories: { name: string; bucket_id: string | null }[],
  bucketId: string
): string[] {
  const taken = new Set(
    categories.filter(c => c.bucket_id === bucketId).map(c => c.name.trim().toLowerCase())
  );
  const byName = new Map<string, { name: string; buckets: Set<string> }>();
  for (const c of categories) {
    const key = c.name.trim().toLowerCase();
    if (!c.bucket_id || c.bucket_id === bucketId || !key || taken.has(key)) continue;
    const entry = byName.get(key) ?? { name: c.name.trim(), buckets: new Set<string>() };
    entry.buckets.add(c.bucket_id);
    byName.set(key, entry);
  }
  return Array.from(byName.values())
    .sort((a, b) => b.buckets.size - a.buckets.size || a.name.localeCompare(b.name))
    .map(e => e.name);
}

// Which suggestions to show for what's typed so far: names containing it,
// plus near-misses ("Dinning" finds "Dining") once four letters are typed.
export function matchCategorySuggestions(suggestions: string[], typed: string, limit = 8): string[] {
  const query = typed.trim().toLowerCase();
  if (!query) return suggestions.slice(0, limit);
  return suggestions
    .filter(name => {
      if (name === typed.trim()) return false;
      const lower = name.toLowerCase();
      if (lower.includes(query)) return true;
      return query.length >= 4 &&
        (editDistance(lower, query) <= 2 || editDistance(lower.slice(0, query.length), query) <= 1);
    })
    .slice(0, limit);
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy');
}

// Local calendar date as yyyy-MM-dd, for a <input type="date"> default.
// new Date().toISOString() would format in UTC, so for the first 5.5 hours
// of each day in IST it returns yesterday - defaulting new transactions to
// the wrong day. date-fns format() uses the local timezone.
export function todayForDateInput(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getDateParts(date: string | Date) {
  const d = new Date(date);
  return {
    day: format(d, 'dd'),
    month: format(d, 'MMM'),
    year: format(d, 'yyyy')
  };
}

export function formatUserDisplay(email: string, bucketOwnerEmail: string, activeShareEmails: string[], profiles: Record<string, string>) {
  if (!email) return 'Unknown';
  
  const displayName = profiles[email];
  const displayValue = displayName || email;

  if (email === bucketOwnerEmail) return displayValue;
  if (activeShareEmails.includes(email)) return displayValue;
  return `${displayValue} (Removed)`;
}

export function truncateRemarks(remarks: string | undefined | null): string {
  if (!remarks) return '';
  if (remarks.length <= 23) return remarks;
  return remarks.substring(0, 23) + '...';
}

export function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const val = row[header];
        const escaped = ('' + val).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    )
  ];
  
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
