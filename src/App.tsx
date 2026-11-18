import { useCallback, useEffect, useState } from 'react';
import { ClassifierWorkspace } from './components/ClassifierWorkspace.tsx';
import { ColabIntegration } from './components/ColabIntegration.tsx';
import { HistoryTable } from './components/HistoryTable.tsx';
import { OverviewSection } from './components/OverviewSection.tsx';
import { TopNav } from './components/TopNav.tsx';
import type {
  ClassificationHistoryEntry,
  ClassificationResult,
  InferenceEngine,
  InputSource,
} from './types/waste.ts';
import type { PreparedImage } from './utils/imageHelpers.ts';

const HISTORY_STORAGE_KEY = 'ecosort_classification_history_v1';
const CUSTOM_API_STORAGE_KEY = 'ecosort_custom_python_url_v1';

function loadSavedHistory(): ClassificationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [mode, setMode] = useState<'upload' | 'camera'>('upload');
  const [engine, setEngine] = useState<InferenceEngine>('builtin');
  const [customApiUrl, setCustomApiUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(CUSTOM_API_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [selectedImage, setSelectedImage] = useState<PreparedImage | null>(null);
  const [selectedSource, setSelectedSource] = useState<InputSource>('upload');
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClassificationHistoryEntry[]>(loadSavedHistory);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 40)));
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, [history]);

  const classifyImage = useCallback(
    async (image: PreparedImage, source: InputSource, activeEngine: InferenceEngine, apiUrl: string) => {
      if (activeEngine === 'custom-python' && !apiUrl.trim()) {
        setError('Enter and save a Python Keras API endpoint URL before running custom inference.');
        return;
      }

      setIsClassifying(true);
      setError(null);

      try {
        const res = await fetch('/api/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: image.dataUrl,
            mimeType: image.mimeType,
            customApiUrl: activeEngine === 'custom-python' ? apiUrl.trim() : undefined,
          }),
        });

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || `Classification failed (HTTP ${res.status})`);
        }

        const classified = payload as ClassificationResult;
        setResult(classified);

        const entry: ClassificationHistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          source,
          imageName: image.fileName,
          thumbnailDataUrl: image.thumbnailDataUrl,
          result: classified,
        };
        setHistory((prev) => [entry, ...prev].slice(0, 40));
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : 'Unable to complete classification.');
      } finally {
        setIsClassifying(false);
      }
    },
    []
  );

  const handleImageSelected = (
    image: PreparedImage,
    source: InputSource,
    autoClassify = false
  ) => {
    setSelectedImage(image);
    setSelectedSource(source);
    setResult(null);
    setError(null);
    if (autoClassify) {
      void classifyImage(image, source, engine, customApiUrl);
    }
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    setResult(null);
    setError(null);
  };

  const handleRunClassification = () => {
    if (!selectedImage) return;
    void classifyImage(selectedImage, selectedSource, engine, customApiUrl);
  };

  const handleSelectModeFromHero = (targetMode: 'upload' | 'camera') => {
    setMode(targetMode);
    if (targetMode === 'camera') {
      setSelectedImage(null);
      setResult(null);
      setError(null);
    }
    const el = document.getElementById('classifier');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInspectHistoryEntry = (entry: ClassificationHistoryEntry) => {
    setMode('upload');
    setSelectedSource(entry.source);
    setSelectedImage({
      dataUrl: entry.thumbnailDataUrl,
      thumbnailDataUrl: entry.thumbnailDataUrl,
      mimeType: 'image/jpeg',
      fileName: entry.imageName,
      width: 180,
      height: 135,
      sizeBytes: Math.round((entry.thumbnailDataUrl.length * 3) / 4),
    });
    setResult(entry.result);
    setError(null);
    document.getElementById('classifier')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSaveApiUrl = (url: string, activateCustom: boolean) => {
    setCustomApiUrl(url);
    try {
      localStorage.setItem(CUSTOM_API_STORAGE_KEY, url);
    } catch {
      // Ignore storage error
    }
    setEngine(activateCustom ? 'custom-python' : 'builtin');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopNav onStartScan={() => handleSelectModeFromHero('upload')} />

      <main>
        <OverviewSection onSelectMode={handleSelectModeFromHero} />

        <ClassifierWorkspace
          mode={mode}
          onModeChange={setMode}
          engine={engine}
          onEngineChange={setEngine}
          customApiUrl={customApiUrl}
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
          onInspect={handleInspectHistoryEntry}
          onDelete={(id) => setHistory((prev) => prev.filter((item) => item.id !== id))}
          onClearAll={() => setHistory([])}
        />

        <ColabIntegration
          customApiUrl={customApiUrl}
          engine={engine}
          onSaveApiUrl={handleSaveApiUrl}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span>EcoSort Vision · Smart Waste Classification System</span>
          <span>TrashNet 6-Class Taxonomy: Cardboard, Glass, Metal, Paper, Plastic, Trash</span>
        </div>
      </footer>
    </div>
  );
}
