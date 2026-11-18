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

export default function App() {
  const [mode, setMode] = useState<'upload' | 'camera'>('upload');
  const [selectedImage, setSelectedImage] = useState<PreparedImage | null>(null);
  const [selectedSource, setSelectedSource] = useState<InputSource>('upload');
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClassificationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/history')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (active && Array.isArray(rows)) {
          setHistory(rows);
        }
      })
      .catch(() => {
        // Keep empty list if history fetch fails
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

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || `Classification failed (HTTP ${res.status})`);
      }

      setResult(payload.result as ClassificationResult);
      if (payload.entry) {
        setHistory((prev) => [payload.entry as ClassificationHistoryEntry, ...prev].slice(0, 60));
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
    setHistory((prev) => prev.filter((item) => item.id !== id));
    await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  };

  const handleClearHistory = async () => {
    setHistory([]);
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
