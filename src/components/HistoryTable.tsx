import { useMemo, useState } from 'react';
import { Download, Eye, Search, Trash2 } from 'lucide-react';
import { TRASHNET_CLASSES, WASTE_CATEGORY_MAP } from '../data/wasteCategories.ts';
import type { ClassificationHistoryEntry, TrashNetClass } from '../types/waste.ts';

interface HistoryTableProps {
  entries: ClassificationHistoryEntry[];
  onInspect: (entry: ClassificationHistoryEntry) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function HistoryTable({ entries, onInspect, onDelete, onClearAll }: HistoryTableProps) {
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState<'all' | TrashNetClass>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filterClass !== 'all' && entry.result.predictedClass !== filterClass) {
        return false;
      }
      if (!q) return true;
      return (
        entry.result.detectedItem.toLowerCase().includes(q) ||
        entry.result.predictedClass.toLowerCase().includes(q) ||
        entry.result.binCategory.toLowerCase().includes(q) ||
        entry.imageName.toLowerCase().includes(q)
      );
    });
  }, [entries, filterClass, search]);

  const handleExportCsv = () => {
    if (entries.length === 0) return;
    const headers = [
      'Timestamp',
      'Image Name',
      'Source',
      'Detected Item',
      'Predicted Class',
      'Confidence (%)',
      'Recyclable',
      'Bin Category',
      'Engine',
    ];
    const rows = entries.map((e) => [
      e.timestamp,
      `"${e.imageName.replace(/"/g, '""')}"`,
      e.source,
      `"${e.result.detectedItem.replace(/"/g, '""')}"`,
      e.result.predictedClass,
      e.result.confidence.toFixed(1),
      e.result.recyclable ? 'Yes' : 'No',
      `"${e.result.binCategory.replace(/"/g, '""')}"`,
      e.result.engine,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecosort-classification-log.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="history" className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Classification Session Log
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Audit recent waste predictions, filter by TrashNet category, or export results to CSV.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={entries.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export CSV
            </button>
            <button
              type="button"
              disabled={entries.length === 0}
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear Log
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilterClass('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterClass === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({entries.length})
            </button>
            {TRASHNET_CLASSES.map((cls) => {
              const count = entries.filter((e) => e.result.predictedClass === cls).length;
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setFilterClass(cls)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filterClass === cls
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {WASTE_CATEGORY_MAP[cls].label} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items or bins..."
              aria-label="Search classification history"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          {filtered.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-900">
                {entries.length === 0
                  ? 'No classifications recorded yet'
                  : 'No entries match your filter'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {entries.length === 0
                  ? 'Run your first waste image or camera scan above to populate the audit log.'
                  : 'Adjust your search query or category filter.'}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-2.5 font-semibold">Sample</th>
                  <th className="px-4 py-2.5 font-semibold">Detected Item</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Confidence</th>
                  <th className="px-4 py-2.5 font-semibold">Target Bin</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
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
                    second: '2-digit',
                  });
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <img
                          src={entry.thumbnailDataUrl}
                          alt={entry.result.detectedItem}
                          referrerPolicy="no-referrer"
                          className="h-9 w-12 rounded border border-slate-200 object-cover"
                        />
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-900">
                        <span className="block max-w-[200px] truncate">
                          {entry.result.detectedItem}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{meta.label}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                        {entry.result.confidence.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        <span className="block max-w-[200px] truncate">
                          {entry.result.binCategory}
                        </span>
                      </td>
                      <td className="px-4 py-2 capitalize text-slate-600">{entry.source}</td>
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
