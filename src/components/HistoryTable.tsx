import { useMemo, useState } from 'react';
import { Eye, Search, Trash2 } from 'lucide-react';
import { WASTE_CATEGORY_MAP } from '../data/wasteCategories.ts';
import type { ClassificationHistoryEntry } from '../types/waste.ts';

interface HistoryTableProps {
  entries: ClassificationHistoryEntry[];
  loading: boolean;
  onInspect: (entry: ClassificationHistoryEntry) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function HistoryTable({
  entries,
  loading,
  onInspect,
  onDelete,
  onClearAll,
}: HistoryTableProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (entry) =>
        entry.result.detectedItem.toLowerCase().includes(q) ||
        entry.result.predictedClass.toLowerCase().includes(q) ||
        entry.result.binCategory.toLowerCase().includes(q)
    );
  }, [entries, search]);

  return (
    <section id="history" className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Recent Classifications
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Saved automatically to the backend database.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search history..."
                aria-label="Search classification history"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              />
            </div>

            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-rose-700 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          {loading ? (
            <div className="px-6 py-8 text-center text-xs text-slate-500">
              Loading classification history...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm font-medium text-slate-900">
                {entries.length === 0 ? 'No classifications yet' : 'No matching results'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {entries.length === 0
                  ? 'Upload or capture a waste item above to record your first prediction.'
                  : 'Try a different search term.'}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-2.5 font-semibold">Item</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Confidence</th>
                  <th className="px-4 py-2.5 font-semibold">Disposal Bin</th>
                  <th className="px-4 py-2.5 font-semibold">Time</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((entry) => {
                  const meta = WASTE_CATEGORY_MAP[entry.result.predictedClass];
                  const formattedTime = new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={entry.thumbnailDataUrl}
                            alt={entry.result.detectedItem}
                            referrerPolicy="no-referrer"
                            className="h-8 w-10 shrink-0 rounded border border-slate-200 object-cover"
                          />
                          <span className="max-w-[220px] truncate font-medium text-slate-900">
                            {entry.result.detectedItem}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{meta.label}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                        {entry.result.confidence.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        <span className="block max-w-[220px] truncate">
                          {entry.result.binCategory}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono tabular-nums text-slate-500">
                        {formattedTime}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onInspect(entry)}
                            aria-label={`Inspect ${entry.result.detectedItem}`}
                            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(entry.id)}
                            aria-label={`Delete ${entry.result.detectedItem}`}
                            className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
