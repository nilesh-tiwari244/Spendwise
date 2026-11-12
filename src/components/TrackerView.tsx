import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Menu, Plus, X, ChevronDown, ChevronRight, Check, Loader2, Filter, CloudOff } from 'lucide-react';
import { supabase, type Bucket, type Category } from '../lib/supabase';
import { notifyError } from '../lib/toast';
import { fetchAllRows } from '../lib/fetchAll';
import { cn, filterCategoriesByTyped } from '../lib/utils';
import { normalizeCategoryName, useTrackedCategories, type TrackerSaveStatus } from '../lib/tracker';

interface TrackerViewProps {
  // Buckets Tracker adds up: the user's own and those shared with them, not archived.
  buckets: Bucket[];
  // Every category the user can see; filtered here to those buckets.
  categories: Category[];
  userId: string;
  // Goes up each time App reloads its data (someone else's change, coming
  // back to the app), so the totals refresh with it.
  dataVersion: number;
  // True when Tracker was reached with Back (from Search, say). App works
  // this out: inside its animated <Routes location>, React Router reports
  // every visit as a Back.
  cameBack: boolean;
  onBack: () => void;
  onOpenMenu: () => void;
  onOpenInSearch: (params: { bucketId: string; categoryId: string; startDate?: string; endDate?: string }) => void;
}

type Preset = 'this' | 'last' | 'all' | null;
type Period = { start: string | null; end: string | null };

const PRESETS: { id: Exclude<Preset, null>; label: string }[] = [
  { id: 'this', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: 'all', label: 'All time' },
];

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// First and last day of this month (offset 0) or an earlier one, in local time.
const monthRange = (offset: number) => {
  const now = new Date();
  return {
    start: toYmd(new Date(now.getFullYear(), now.getMonth() + offset, 1)),
    end: toYmd(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)),
  };
};

const presetRange = (preset: Preset): Period | null =>
  preset === 'this' ? monthRange(0) : preset === 'last' ? monthRange(-1) : preset === 'all' ? { start: null, end: null } : null;

// "1 – 30 Nov 2026", "1 Sep – 12 Nov 2026", "28 Dec 2025 – 3 Jan 2026"
const periodLabel = ({ start, end }: Period) => {
  if (!start || !end) return 'All time';
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (s.getFullYear() !== e.getFullYear()) return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`;
  if (s.getMonth() !== e.getMonth()) return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`;
  return `${format(s, 'd')} – ${format(e, 'd MMM yyyy')}`;
};

// Totals are added up in paise, so they don't pick up floating-point dust.
const toPaise = (amount: number | string) => Math.round(Number(amount) * 100);

// Same look as the bucket Summary: "-₹1,234.50", "+₹200.00", "₹0.00".
const money = (paise: number, signed: boolean) => {
  const text = `₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!signed) return text;
  return paise < 0 ? `-${text}` : paise > 0 ? `+${text}` : text;
};

const netColour = (paise: number) => (paise < 0 ? 'text-rose-600' : paise > 0 ? 'text-emerald-600' : 'text-zinc-900');

const bucketsLabel = (n: number) => `in ${n} bucket${n === 1 ? '' : 's'}`;

// Where Tracker was left, so coming back from Search with Back shows the same
// period and open categories. Opening it from the menu always starts on the
// current month.
let lastView: { preset: Preset; startDate: string; endDate: string; applied: Period; expanded: string[] } | null = null;

function SaveBadge({ status }: { status: TrackerSaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-extrabold text-zinc-600">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-extrabold text-rose-700">
        <CloudOff className="w-3 h-3" /> Not saved to your account
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-extrabold text-zinc-600">
      <Check className="w-3 h-3" strokeWidth={3} /> Saved
    </span>
  );
}

export function TrackerView({ buckets, categories, userId, dataVersion, cameBack, onBack, onOpenMenu, onOpenInSearch }: TrackerViewProps) {
  // Back from Search restores the last view; anything else opens on the
  // current month. A month preset is worked out again, in case the month has
  // changed since.
  const [initial] = useState(() => {
    const restored = cameBack ? lastView : null;
    if (!restored) {
      const range = monthRange(0);
      return { preset: 'this' as Preset, startDate: range.start, endDate: range.end, applied: range as Period, expanded: [] as string[] };
    }
    const range = presetRange(restored.preset);
    if (!range) return restored;
    return { ...restored, startDate: range.start ?? '', endDate: range.end ?? '', applied: range };
  });

  const { names: trackedNames, status, add, remove } = useTrackedCategories(userId);

  const [preset, setPreset] = useState<Preset>(initial.preset);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [applied, setApplied] = useState<Period>(initial.applied);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial.expanded));

  useEffect(() => {
    lastView = { preset, startDate, endDate, applied, expanded: Array.from(expanded) };
  }, [preset, startDate, endDate, applied, expanded]);

  // ---- Buckets and categories Tracker covers ----

  const bucketById = useMemo(() => new Map(buckets.map(b => [b.id, b])), [buckets]);

  const coveredCategories = useMemo(
    () => categories.filter(c => c.bucket_id && bucketById.has(c.bucket_id) && c.name?.trim()),
    [categories, bucketById]
  );

  // Every category name in those buckets, once each, A to Z, with the
  // spelling most buckets use and how many buckets have it.
  const nameOptions = useMemo(() => {
    const byKey = new Map<string, { spellings: Map<string, number>; buckets: Set<string> }>();
    for (const c of coveredCategories) {
      const name = c.name.trim();
      const key = normalizeCategoryName(name);
      let entry = byKey.get(key);
      if (!entry) {
        entry = { spellings: new Map(), buckets: new Set() };
        byKey.set(key, entry);
      }
      entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
      entry.buckets.add(c.bucket_id);
    }
    return Array.from(byKey.entries())
      .map(([key, entry]) => ({
        key,
        name: Array.from(entry.spellings.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
        bucketCount: entry.buckets.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [coveredCategories]);

  // Each tracked name with the category rows (one per bucket) that share it.
  const groups = useMemo(() => trackedNames.map(name => {
    const key = normalizeCategoryName(name);
    return { key, name, categories: coveredCategories.filter(c => normalizeCategoryName(c.name) === key) };
  }), [trackedNames, coveredCategories]);

  // ---- Adding a category ----

  const [query, setQuery] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const trackedKeys = useMemo(() => new Set(trackedNames.map(normalizeCategoryName)), [trackedNames]);
  const pickerOptions = useMemo(() => {
    const untracked = nameOptions.filter(o => !trackedKeys.has(o.key));
    return query.trim() ? filterCategoriesByTyped(untracked, query) : untracked;
  }, [nameOptions, trackedKeys, query]);

  useEffect(() => {
    const closeOnOutsideTap = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setIsPickerOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideTap);
    return () => document.removeEventListener('mousedown', closeOnOutsideTap);
  }, []);

  const pick = (name: string) => {
    add(name);
    setQuery('');
    setIsPickerOpen(false);
  };

  const handlePickerKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsPickerOpen(false);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const typed = normalizeCategoryName(query);
    const exact = pickerOptions.find(o => o.key === typed);
    if (exact) pick(exact.name);
    else if (pickerOptions.length === 1) pick(pickerOptions[0].name);
  };

  // ---- Period ----

  const choosePreset = (next: Exclude<Preset, null>) => {
    const range = presetRange(next)!;
    setPreset(next);
    setStartDate(range.start ?? '');
    setEndDate(range.end ?? '');
    setApplied(range);
  };

  const applyDates = () => {
    if (!startDate || !endDate) return;
    const [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    setStartDate(start);
    setEndDate(end);
    setApplied({ start, end });
  };

  const draftIsApplied = startDate === (applied.start ?? '') && endDate === (applied.end ?? '');
  const isApplyDisabled = !startDate || !endDate || draftIsApplied;

  // ---- Totals ----

  type BucketTotals = Record<string, { debit: number; credit: number }>;
  const [totals, setTotals] = useState<{ byGroup: Record<string, BucketTotals>; groupKeys: Set<string> } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestFetchRef = useRef(0);
  const shownQueryRef = useRef<string | null>(null);

  const groupKeyList = groups.map(g => g.key).join('|');
  const categoryIdList = groups.flatMap(g => g.categories.map(c => c.id)).sort().join(',');

  useEffect(() => {
    // Only dataVersion moved: the same totals are on screen, so refresh them
    // quietly. Anything else is a new question and shows the spinner.
    const queryKey = [groupKeyList, applied.start, applied.end, categoryIdList].join('#');
    const quiet = shownQueryRef.current === queryKey;
    shownQueryRef.current = queryKey;
    const fetchId = ++latestFetchRef.current;
    const groupKeys = new Set(groups.map(g => g.key));

    const groupOfCategory = new Map<string, string>();
    groups.forEach(g => g.categories.forEach(c => groupOfCategory.set(c.id, g.key)));
    const categoryIds = Array.from(groupOfCategory.keys());
    if (categoryIds.length === 0) {
      setTotals({ byGroup: {}, groupKeys });
      setIsLoading(false);
      return;
    }
    const bucketIds = Array.from(new Set(groups.flatMap(g => g.categories.map(c => c.bucket_id))));

    if (!quiet) setIsLoading(true);
    (async () => {
      try {
        const rows = await fetchAllRows<{ id: string; bucket_id: string; category_id: string; type: 'Credit' | 'Debit'; amount: number }>(() => {
          let q = supabase
            .from('transactions')
            .select('id, bucket_id, category_id, type, amount')
            .is('deleted_at', null)
            .in('bucket_id', bucketIds)
            .in('category_id', categoryIds);
          // The same date rule as Search and the bucket Summary, so a
          // bucket opened in Search from here shows the same total.
          if (applied.start) q = q.gte('date', applied.start);
          if (applied.end) q = q.lte('date', `${applied.end}T23:59:59`);
          return q.order('id', { ascending: true });
        });
        if (fetchId !== latestFetchRef.current) return;

        const byGroup: Record<string, BucketTotals> = {};
        for (const r of rows) {
          const key = groupOfCategory.get(r.category_id);
          if (!key) continue;
          if (!byGroup[key]) byGroup[key] = {};
          if (!byGroup[key][r.bucket_id]) byGroup[key][r.bucket_id] = { debit: 0, credit: 0 };
          if (r.type === 'Credit') byGroup[key][r.bucket_id].credit += toPaise(r.amount);
          else byGroup[key][r.bucket_id].debit += toPaise(r.amount);
        }
        setTotals({ byGroup, groupKeys });
      } catch (err) {
        if (fetchId !== latestFetchRef.current) return;
        notifyError('Could not load the tracker. Check your connection and try again.', err);
      } finally {
        if (fetchId === latestFetchRef.current) setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKeyList, applied.start, applied.end, categoryIdList, dataVersion]);

  const rows = useMemo(() => {
    const built = groups.map(g => {
      const perBucket = totals?.byGroup[g.key] ?? {};
      const bucketIds = Array.from(new Set(g.categories.map(c => c.bucket_id)));
      const splits = bucketIds
        .map(bucketId => ({
          bucketId,
          bucketName: bucketById.get(bucketId)?.name ?? 'Bucket',
          // Search matches categories by name, so any one of this bucket's
          // ids for the name brings up all of them.
          categoryId: g.categories.find(c => c.bucket_id === bucketId)!.id,
          debit: perBucket[bucketId]?.debit ?? 0,
          credit: perBucket[bucketId]?.credit ?? 0,
        }))
        .sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit) || a.bucketName.localeCompare(b.bucketName));
      return {
        key: g.key,
        name: g.name,
        bucketCount: bucketIds.length,
        net: splits.reduce((sum, s) => sum + s.credit - s.debit, 0),
        splits,
        pending: !totals || !totals.groupKeys.has(g.key),
      };
    });
    // Biggest amounts first; a category still loading goes last.
    return built.sort((a, b) =>
      Number(a.pending) - Number(b.pending) || Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name)
    );
  }, [groups, totals, bucketById]);

  const grandTotal = rows.reduce((sum, r) => sum + (r.pending ? 0 : r.net), 0);

  const toggleRow = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="pb-32">
      {/* Top row like Search's - App hides its sticky header here. */}
      <div className="flex items-center gap-1 min-h-14 -mx-2">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="w-11 h-11 flex-none flex items-center justify-center rounded-full hover:bg-zinc-200 active:bg-zinc-300 transition-colors touch-manipulation"
        >
          <Menu className="w-[22px] h-[22px]" />
        </button>
        <h2 className="flex-1 min-w-0 text-center text-[17px] leading-[22px] font-extrabold uppercase tracking-tight">
          Tracker
        </h2>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 flex-none flex items-center justify-center rounded-full hover:bg-zinc-200 active:bg-zinc-300 transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-[22px] h-[22px]" />
        </button>
      </div>

      {/* Tracked categories - saved to the account until removed */}
      <section aria-label="Tracked categories" className="mt-2 bg-white rounded-3xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase text-zinc-500">Tracked categories</span>
          <SaveBadge status={status} />
        </div>

        {trackedNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {trackedNames.map(name => (
              <span key={name} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-zinc-900 text-white text-xs font-extrabold">
                {name}
                <button
                  type="button"
                  onClick={() => remove(name)}
                  aria-label={`Stop tracking ${name}`}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors"
                >
                  <X className="w-3 h-3" strokeWidth={2.6} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div ref={pickerRef}>
          <div className="relative">
            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsPickerOpen(e.target.value.trim().length > 0);
              }}
              onKeyDown={handlePickerKey}
              placeholder={trackedNames.length > 0 ? 'Add more categories...' : 'Add a category...'}
              aria-label="Add a category to track"
              className="w-full h-11 pl-9 pr-11 rounded-2xl bg-white shadow-sm border-2 border-transparent focus:border-zinc-900 outline-none text-base"
            />
            <button
              type="button"
              onClick={() => setIsPickerOpen(open => !open)}
              aria-label={isPickerOpen ? 'Hide categories' : 'Show all categories'}
              aria-expanded={isPickerOpen}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors"
            >
              <ChevronDown className={cn('w-4 h-4 transition-transform', isPickerOpen && 'rotate-180')} />
            </button>
          </div>

          {isPickerOpen && (
            <div className="mt-1 bg-white rounded-2xl shadow-lg max-h-64 overflow-y-auto">
              {pickerOptions.length === 0 ? (
                <div className="px-4 py-3 text-sm font-bold text-zinc-500">
                  {nameOptions.length === trackedKeys.size ? 'Every category is already tracked' : 'No match'}
                </div>
              ) : (
                pickerOptions.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => pick(option.name)}
                    className="w-full min-h-11 flex items-center justify-between gap-2 px-4 py-2 text-left border-t border-zinc-100 first:border-t-0 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold truncate">{option.name}</span>
                      <span className="block text-[11px] font-bold text-zinc-500">{bucketsLabel(option.bucketCount)}</span>
                    </span>
                    <span className="flex-none text-[11px] font-black uppercase">+ Track</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] leading-4 text-zinc-500">
          These stay here every time you open Tracker, until you remove them with ×.
        </p>
      </section>

      {/* Period - opens on the current month */}
      <section aria-label="Period" className="mt-4 bg-white rounded-3xl shadow-sm p-4 space-y-3.5">
        <div className="flex gap-2">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => choosePreset(p.id)}
              aria-pressed={preset === p.id}
              className={cn(
                'flex-1 py-2 rounded-full text-[11px] font-black uppercase transition-colors',
                preset === p.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="block text-[10px] font-black uppercase text-zinc-500 mb-1">Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPreset(null); }}
              className="w-full brutal-input text-sm p-2"
            />
          </label>
          <label className="block min-w-0">
            <span className="block text-[10px] font-black uppercase text-zinc-500 mb-1">End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPreset(null); }}
              className="w-full brutal-input text-sm p-2"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={applyDates}
          disabled={isApplyDisabled}
          className={cn(
            'w-full brutal-button py-3 text-sm font-black uppercase flex items-center justify-center gap-2 transition-colors',
            isApplyDisabled && 'opacity-40 cursor-not-allowed'
          )}
        >
          <Filter className="w-4 h-4" />
          Apply Filter
        </button>
      </section>

      {/* Totals across every covered bucket */}
      <div className="mt-5 px-1 flex justify-between items-baseline gap-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-600">All your buckets</h3>
        <span className="text-[11px] font-extrabold text-zinc-600">{periodLabel(applied)}</span>
      </div>

      <section aria-label="Totals" className="mt-2 bg-white rounded-3xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] px-4 py-2 bg-zinc-100 text-xs font-black uppercase tracking-widest">
          <span>Categories</span>
          <span className="flex items-center gap-2">
            {isLoading && <Loader2 className="w-3 h-3 animate-spin" aria-label="Loading" />}
            Total
          </span>
        </div>

        {trackedNames.length === 0 ? (
          <p className="p-6 text-center text-sm font-bold text-zinc-500">
            Add a category above to see its total across all your buckets.
          </p>
        ) : (
          <>
            {rows.map(row => {
              const open = expanded.has(row.key);
              return (
                <div key={row.key} className="border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => toggleRow(row.key)}
                    aria-expanded={open}
                    className={cn(
                      'w-full grid grid-cols-[1fr_auto_20px] gap-2 items-center px-4 py-2.5 text-left transition-colors',
                      open ? 'bg-zinc-50' : 'hover:bg-zinc-50'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold truncate">{row.name}</span>
                      <span className="block text-[11px] font-bold text-zinc-500">{bucketsLabel(row.bucketCount)}</span>
                    </span>
                    <span className={cn('text-[15px] font-black whitespace-nowrap', row.pending ? 'text-zinc-400' : netColour(row.net))}>
                      {row.pending ? '…' : money(row.net, true)}
                    </span>
                    {open
                      ? <ChevronDown className="w-4 h-4 text-zinc-900" />
                      : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                  </button>

                  {open && (
                    <div className="mx-3 mb-2.5 rounded-2xl bg-zinc-100 p-1">
                      {row.splits.length === 0 ? (
                        <p className="px-3 py-2 text-xs font-bold text-zinc-500">None of your buckets has this category.</p>
                      ) : (
                        row.splits.map(split => (
                          <button
                            key={split.bucketId}
                            type="button"
                            onClick={() => onOpenInSearch({
                              bucketId: split.bucketId,
                              categoryId: split.categoryId,
                              startDate: applied.start ?? undefined,
                              endDate: applied.end ?? undefined,
                            })}
                            aria-label={`Open ${row.name} in ${split.bucketName} in Search`}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-zinc-200/70 transition-colors"
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-extrabold text-zinc-800 truncate">{split.bucketName}</span>
                              <span className="mt-0.5 grid grid-cols-2 gap-2 text-[11px] font-black">
                                <span className="text-rose-600 whitespace-nowrap">
                                  <span className="text-[9px] uppercase text-zinc-500 mr-1">Debit</span>
                                  {split.debit ? money(split.debit, false) : '—'}
                                </span>
                                <span className="text-emerald-700 whitespace-nowrap">
                                  <span className="text-[9px] uppercase text-zinc-500 mr-1">Credit</span>
                                  {split.credit ? money(split.credit, false) : '—'}
                                </span>
                              </span>
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 flex-none text-zinc-500" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="grid grid-cols-[1fr_auto] items-center px-4 py-3.5 bg-zinc-900 text-white">
              <span className="text-xs font-black uppercase tracking-widest">Total</span>
              <span className="text-lg font-black whitespace-nowrap">{money(grandTotal, true)}</span>
            </div>
          </>
        )}
      </section>

      {trackedNames.length > 0 && (
        <p className="mt-2.5 px-1 text-[11px] leading-4 text-zinc-500">
          Tap a category to see each bucket's debit and credit; tap a bucket to open those transactions in Search.
        </p>
      )}
    </div>
  );
}
