import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Download,
  ImageIcon,
  Recycle,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { SAMPLE_WASTE_ITEMS, type SampleWasteItem } from '../data/sampleImages.ts';
import { WASTE_CATEGORY_MAP } from '../data/wasteCategories.ts';
import type {
  ClassificationResult,
  InferenceEngine,
  InputSource,
} from '../types/waste.ts';
import {
  captureVideoFrame,
  fileToPreparedImage,
  formatBytes,
  urlToPreparedImage,
  type PreparedImage,
} from '../utils/imageHelpers.ts';

interface ClassifierWorkspaceProps {
  mode: 'upload' | 'camera';
  onModeChange: (mode: 'upload' | 'camera') => void;
  engine: InferenceEngine;
  onEngineChange: (engine: InferenceEngine) => void;
  customApiUrl: string;
  selectedImage: PreparedImage | null;
  selectedSource: InputSource;
  result: ClassificationResult | null;
  isClassifying: boolean;
  error: string | null;
  onImageSelected: (image: PreparedImage, source: InputSource, autoClassify?: boolean) => void;
  onClearImage: () => void;
  onRunClassification: () => void;
}

export function ClassifierWorkspace({
  mode,
  onModeChange,
  engine,
  onEngineChange,
  customApiUrl,
  selectedImage,
  selectedSource,
  result,
  isClassifying,
  error,
  onImageSelected,
  onClearImage,
  onRunClassification,
}: ClassifierWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [sampleLoadError, setSampleLoadError] = useState<string | null>(null);
  const [failedSampleIds, setFailedSampleIds] = useState<Record<string, boolean>>({});
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('idle');
  }, []);

  const startCameraStream = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        setCameraError('Camera capture is not supported in this browser environment.');
        return;
      }

      stopCameraStream();
      setCameraStatus('starting');
      setCameraError(null);

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const cams = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(cams);

        const activeTrack = stream.getVideoTracks()[0];
        const activeSettings = activeTrack?.getSettings();
        if (activeSettings?.deviceId) {
          setSelectedDeviceId(activeSettings.deviceId);
        }

        setCameraStatus('active');
      } catch (err) {
        setCameraStatus('error');
        const message =
          err instanceof Error
            ? err.name === 'NotAllowedError'
              ? 'Camera permission was denied. Allow camera access in browser settings or switch to Upload Image.'
              : err.name === 'NotFoundError'
                ? 'No camera device was detected on this machine. Use Upload Image instead.'
                : err.message
            : 'Unable to start camera stream.';
        setCameraError(message);
      }
    },
    [stopCameraStream]
  );

  // Manage camera lifecycle when switching tabs or retaking
  useEffect(() => {
    if (mode === 'camera' && (!selectedImage || selectedSource !== 'camera')) {
      void startCameraStream(selectedDeviceId || undefined);
    } else if (mode !== 'camera') {
      stopCameraStream();
    }
    return () => {
      if (mode !== 'camera') {
        stopCameraStream();
      }
    };
  }, [mode, selectedImage, selectedSource, selectedDeviceId, startCameraStream, stopCameraStream]);

  useEffect(() => {
    return () => stopCameraStream();
  }, [stopCameraStream]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setSampleLoadError('Please select a valid image file (JPEG, PNG, or WebP).');
      return;
    }
    setSampleLoadError(null);
    try {
      const prepared = await fileToPreparedImage(file);
      onImageSelected(prepared, 'upload', false);
    } catch (err) {
      setSampleLoadError(err instanceof Error ? err.message : 'Unable to process image file.');
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleSampleClick = async (sample: SampleWasteItem) => {
    setSampleLoadError(null);
    try {
      onModeChange('upload');
      const prepared = await urlToPreparedImage(sample.imageUrl, `${sample.id}.jpg`);
      onImageSelected(prepared, 'sample', true);
    } catch (err) {
      setSampleLoadError(err instanceof Error ? err.message : 'Unable to load sample image.');
    }
  };

  const handleCaptureFrame = () => {
    if (!videoRef.current || cameraStatus !== 'active') return;
    const prepared = captureVideoFrame(videoRef.current);
    stopCameraStream();
    onImageSelected(prepared, 'camera', true);
  };

  const handleRetake = () => {
    onClearImage();
    void startCameraStream(selectedDeviceId || undefined);
  };

  const handleDownloadJsonReport = () => {
    if (!result || !selectedImage) return;
    const payload = {
      timestamp: new Date().toISOString(),
      image: {
        fileName: selectedImage.fileName,
        dimensions: `${selectedImage.width}x${selectedImage.height}`,
        source: selectedSource,
      },
      classification: result,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waste-classification-${result.predictedClass}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const topMeta = result ? WASTE_CATEGORY_MAP[result.predictedClass] : null;
  const customReady = customApiUrl.trim().length > 0;

  return (
    <section id="classifier" className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Waste Classification Workspace
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload a waste photograph or capture a live camera frame to classify into TrashNet categories.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Input source"
          className="inline-flex items-center gap-1 self-start rounded-lg border border-slate-200 bg-slate-100 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'upload'}
            onClick={() => onModeChange('upload')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'upload'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload Image
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'camera'}
            onClick={() => onModeChange('camera')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'camera'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            Live Camera
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        {/* Left Pane: Input Stage */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="text-sm font-semibold text-slate-900">
                {mode === 'upload' ? 'Image Input & Preview' : 'Live Camera Capture'}
              </span>
              {selectedImage && (
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {selectedImage.width} × {selectedImage.height} px · {formatBytes(selectedImage.sizeBytes)}
                </span>
              )}
            </div>

            {mode === 'upload' ? (
              <div className="mt-4">
                {selectedImage ? (
                  <div className="space-y-3">
                    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      <img
                        src={selectedImage.dataUrl}
                        alt={selectedImage.fileName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={onClearImage}
                        aria-label="Remove selected image"
                        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="truncate font-mono max-w-[240px]">{selectedImage.fileName}</span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Choose Different File
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`flex aspect-4/3 w-full flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition-colors ${
                      isDragging
                        ? 'border-emerald-600 bg-emerald-50/50'
                        : 'border-slate-300 bg-slate-50 hover:border-slate-400'
                    }`}
                  >
                    <Upload className="h-8 w-8 text-slate-400" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">
                      Drop a waste photograph here
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Supports JPEG, PNG, or WebP up to 15 MB
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                    >
                      Browse Files
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {sampleLoadError && (
                  <p role="alert" className="mt-3 text-xs font-medium text-rose-700">
                    {sampleLoadError}
                  </p>
                )}

                <div className="mt-5 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Sample Test Photographs
                    </span>
                    <span className="text-xs text-slate-500">Click to load &amp; classify</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {SAMPLE_WASTE_ITEMS.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => void handleSampleClick(sample)}
                        className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition-colors hover:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                      >
                        <div className="aspect-4/3 w-full overflow-hidden bg-slate-200">
                          {failedSampleIds[sample.id] ? (
                            <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 p-2 text-slate-500">
                              <ImageIcon className="h-5 w-5" aria-hidden="true" />
                              <span className="mt-1 text-[11px] font-medium">{sample.expectedClass}</span>
                            </div>
                          ) : (
                            <img
                              src={sample.imageUrl}
                              alt={sample.title}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedSampleIds((prev) => ({ ...prev, [sample.id]: true }))
                              }
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                          )}
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs font-medium text-slate-800">
                            {sample.title}
                          </p>
                          <p className="text-[11px] capitalize text-slate-500">
                            {sample.expectedClass}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {selectedImage && selectedSource === 'camera' ? (
                  <div className="space-y-3">
                    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                      <img
                        src={selectedImage.dataUrl}
                        alt="Captured waste frame"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-xs text-slate-500">
                        Captured frame · {selectedImage.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={handleRetake}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Retake Photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                      />

                      {cameraStatus === 'active' && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-6 rounded-md border border-white/40"
                        />
                      )}

                      {cameraStatus === 'starting' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-xs font-medium text-white">
                          Initializing camera feed...
                        </div>
                      )}

                      {cameraStatus === 'error' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 text-center text-white">
                          <AlertCircle className="h-7 w-7 text-amber-400" aria-hidden="true" />
                          <p className="mt-3 max-w-sm text-sm font-medium">
                            {cameraError || 'Camera stream is unavailable.'}
                          </p>
                          <div className="mt-4 flex flex-wrap justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => void startCameraStream(selectedDeviceId || undefined)}
                              className="rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 cursor-pointer"
                            >
                              Retry Camera
                            </button>
                            <button
                              type="button"
                              onClick={() => onModeChange('upload')}
                              className="rounded-lg border border-slate-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                            >
                              Switch to Upload
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {videoDevices.length > 1 ? (
                        <select
                          aria-label="Select camera device"
                          value={selectedDeviceId}
                          onChange={(e) => setSelectedDeviceId(e.target.value)}
                          className="max-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                          {videoDevices.map((dev, idx) => (
                            <option key={dev.deviceId} value={dev.deviceId}>
                              {dev.label || `Camera ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Center the waste item inside the frame
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={cameraStatus !== 'active' || isClassifying}
                        onClick={handleCaptureFrame}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        Capture &amp; Classify
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Engine Selector + Run CTA */}
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => onEngineChange('builtin')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    engine === 'builtin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Built-in Vision
                </button>
                <button
                  type="button"
                  onClick={() => onEngineChange('custom-python')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    engine === 'custom-python'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Python Keras API
                </button>
              </div>

              <button
                type="button"
                disabled={!selectedImage || isClassifying}
                onClick={onRunClassification}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isClassifying ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {isClassifying ? 'Classifying...' : 'Run Classification'}
              </button>
            </div>

            {engine === 'custom-python' && (
              <p className="mt-2 text-xs text-slate-500">
                {customReady ? (
                  <>
                    Routing to <span className="font-mono text-slate-700">{customApiUrl}</span>
                  </>
                ) : (
                  <>
                    No Python API URL configured yet.{' '}
                    <a href="#colab-api" className="font-semibold text-emerald-700 hover:underline">
                      Configure Colab endpoint below
                    </a>
                    .
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Right Pane: Prediction Results */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-sm font-semibold text-slate-900">
              Prediction Results &amp; Disposal Guidance
            </span>
            {result && (
              <span className="font-mono text-xs tabular-nums text-slate-500">
                {result.engine === 'custom-python' ? 'Keras CNN API' : 'Vision Model'} ·{' '}
                {result.latencyMs} ms
              </span>
            )}
          </div>

          {isClassifying ? (
            <div className="my-6 flex-1 space-y-5" aria-busy="true" aria-label="Analyzing waste image">
              <div className="flex items-baseline justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-28 rounded bg-slate-200" />
                  <div className="h-8 w-44 rounded bg-slate-200" />
                </div>
                <div className="h-9 w-24 rounded bg-slate-200" />
              </div>
              <div className="space-y-3 border-t border-slate-200 pt-4">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="h-3 w-20 rounded bg-slate-200" />
                      <div className="h-3 w-12 rounded bg-slate-200" />
                    </div>
                    <div className="h-2 w-full rounded bg-slate-100" />
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <div className="h-4 w-48 rounded bg-slate-200" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-5/6 rounded bg-slate-100" />
              </div>
            </div>
          ) : error ? (
            <div className="my-auto flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-rose-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Classification Failed</p>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-600">{error}</p>
              {selectedImage && (
                <button
                  type="button"
                  onClick={onRunClassification}
                  className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Retry Classification
                </button>
              )}
            </div>
          ) : result && topMeta ? (
            <div className="mt-4 flex flex-1 flex-col justify-between space-y-6">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Detected: {result.detectedItem}
                    </p>
                    <h3 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                      {topMeta.label}
                    </h3>
                    <div className="mt-2 flex items-center gap-2 text-xs font-semibold">
                      {result.recyclable ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <Recycle className="h-4 w-4" aria-hidden="true" />
                          Recyclable · {result.binCategory}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose-700">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Non-Recyclable · {result.binCategory}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-500">Confidence</p>
                    <p className="mt-0.5 font-mono text-3xl font-bold tabular-nums text-slate-900">
                      {result.confidence.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* 6-Class Probability Distribution */}
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      TrashNet Class Probabilities
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">6 Classes</span>
                  </div>
                  <div className="space-y-2.5">
                    {result.probabilities.map((item, idx) => {
                      const clsMeta = WASTE_CATEGORY_MAP[item.category];
                      const isTop = idx === 0;
                      return (
                        <div key={item.category}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span
                              className={
                                isTop ? 'font-semibold text-slate-900' : 'text-slate-600'
                              }
                            >
                              {clsMeta.label}
                            </span>
                            <span
                              className={`font-mono tabular-nums ${
                                isTop ? 'font-semibold text-slate-900' : 'text-slate-500'
                              }`}
                            >
                              {item.probability.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isTop ? 'bg-emerald-600' : 'bg-slate-300'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, item.probability))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Disposal Recommendations */}
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-semibold text-slate-700">
                    Disposal Recommendations
                  </h4>
                  <ol className="mt-2.5 space-y-2">
                    {result.disposalRecommendations.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                        <CheckCircle2
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700"
                          aria-hidden="true"
                        />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                    {result.environmentalNote}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <span className="text-xs text-slate-500">Saved automatically to session log</span>
                <button
                  type="button"
                  onClick={handleDownloadJsonReport}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export JSON
                </button>
              </div>
            </div>
          ) : (
            <div className="my-auto flex flex-col items-center justify-center py-12 text-center">
              <Recycle className="h-9 w-9 text-slate-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Awaiting Waste Sample
              </p>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                Upload a waste photograph, pick one of the studio test samples on the left, or
                capture a frame using your camera to view category confidence and disposal guidance.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
