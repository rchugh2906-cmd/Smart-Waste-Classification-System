import { useCallback, useEffect, useState } from 'react';
import { ClassifierWorkspace } from './components/ClassifierWorkspace.tsx';
import { HistoryTable } from './components/HistoryTable.tsx';
import { TopNav } from './components/TopNav.tsx';
import type {
  ClassificationHistoryEntry,
  ClassificationResult,
  InputSource,
} from './types/waste.ts';
import type { PreparedImage } from './utils/imageHelpers.ts';

const LOCAL_HISTORY_KEY = 'ecosort_history_cache_v1';

function readLocalHistory(): ClassificationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(entries: ClassificationHistoryEntry[]) {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(entries.slice(0, 60)));
  } catch {
    // Ignore storage quota errors
  }
}

function mergeHistory(
  serverRows: ClassificationHistoryEntry[],
  localRows: ClassificationHistoryEntry[]
): ClassificationHistoryEntry[] {
  const byId = new Map<string, ClassificationHistoryEntry>();
  for (const row of [...serverRows, ...localRows]) {
    if (row && typeof row.id === 'string' && !byId.has(row.id)) {
      byId.set(row.id, row);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 60);
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/<[^>]+>/g, ' ').trim().slice(0, 140);
    throw new Error(snippet || `Server returned HTTP ${res.status}`);
  }
}

export default function App() {
  const [mode, setMode] = useState<'upload' | 'camera'>('upload');
  const [selectedImage, setSelectedImage] = useState<PreparedImage | null>(null);
  const [selectedSource, setSelectedSource] = useState<InputSource>('upload');
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClassificationHistoryEntry[]>(readLocalHistory);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/history')
      .then(async (res) => (res.ok ? parseApiJson<ClassificationHistoryEntry[]>(res) : []))
      .then((serverRows) => {
        if (active && Array.isArray(serverRows)) {
          setHistory((prev) => {
            const merged = mergeHistory(serverRows, prev);
            writeLocalHistory(merged);
            return merged;
          });
        }
      })
      .catch(() => {
        // Retain local history cache if backend history endpoint is warming up
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const classifyImage = useCallback(async (image: PreparedImage, source: InputSource) => {
    setIsClassifying(true);
    setError(null);

    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: image.dataUrl,
          mimeType: image.mimeType,
          source,
          imageName: image.fileName,
          thumbnailDataUrl: image.thumbnailDataUrl,
        }),
      });

      const payload = await parseApiJson<{
        result?: ClassificationResult;
        entry?: ClassificationHistoryEntry;
        error?: string;
      }>(res);

      if (!res.ok || !payload.result) {
        throw new Error(payload?.error || `Classification failed (HTTP ${res.status})`);
      }

      setResult(payload.result);
      if (payload.entry) {
        setHistory((prev) => {
          const next = [payload.entry!, ...prev].slice(0, 60);
          writeLocalHistory(next);
          return next;
        });
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Unable to classify waste image.');
    } finally {
      setIsClassifying(false);
    }
  }, []);

  const handleImageSelected = (
    image: PreparedImage,
    source: InputSource,
    autoClassify = true
  ) => {
    setSelectedImage(image);
    setSelectedSource(source);
    setResult(null);
    setError(null);
    if (autoClassify) {
      void classifyImage(image, source);
    }
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    setResult(null);
    setError(null);
  };

  const handleRunClassification = () => {
    if (!selectedImage) return;
    void classifyImage(selectedImage, selectedSource);
  };

  const handleStartScan = () => {
    setMode('upload');
    document.getElementById('classifier')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInspectHistoryEntry = (entry: ClassificationHistoryEntry) => {
    setMode('upload');
    setSelectedSource(entry.source);
    setSelectedImage({
      dataUrl: entry.thumbnailDataUrl,
      thumbnailDataUrl: entry.thumbnailDataUrl,
      mimeType: 'image/jpeg',
      fileName: entry.imageName,
    });
    setResult(entry.result);
    setError(null);
    document.getElementById('classifier')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDeleteEntry = async (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      writeLocalHistory(next);
      return next;
    });
    await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  };

  const handleClearHistory = async () => {
    setHistory([]);
    writeLocalHistory([]);
    await fetch('/api/history', { method: 'DELETE' }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopNav onStartScan={handleStartScan} />

      <main>
        <ClassifierWorkspace
          mode={mode}
          onModeChange={setMode}
          selectedImage={selectedImage}
          selectedSource={selectedSource}
          result={result}
          isClassifying={isClassifying}
          error={error}
          onImageSelected={handleImageSelected}
          onClearImage={handleClearImage}
          onRunClassification={handleRunClassification}
        />

        <HistoryTable
          entries={history}
          loading={historyLoading}
          onInspect={handleInspectHistoryEntry}
          onDelete={(id) => void handleDeleteEntry(id)}
          onClearAll={() => void handleClearHistory()}
        />
      </main>
    </div>
  );
}
