import { ArrowDownUp, BrainCircuit, Camera, Code2, MonitorSmartphone, Upload } from 'lucide-react';
import { TRASHNET_CLASSES, WASTE_CATEGORY_MAP } from '../data/wasteCategories.ts';

interface OverviewSectionProps {
  onSelectMode: (mode: 'upload' | 'camera') => void;
}

export function OverviewSection({ onSelectMode }: OverviewSectionProps) {
  return (
    <section id="overview" className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
          <div className="flex flex-col justify-between lg:col-span-7">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Neural Network &amp; Deep Learning Project · TrashNet 6-Class Taxonomy
              </p>
              <h1
                className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                Smart Waste Classification System
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                Identify recyclable and landfill materials from uploaded photographs or live webcam
                frames. Built to run immediately with vision inference or connect directly to your
                trained Google Colab <span className="font-mono text-sm text-slate-800">waste_model.keras</span>{' '}
                Python API.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onSelectMode('upload')}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload Waste Image
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('camera')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Open Live Camera
              </button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="text-xs font-semibold text-slate-700">
                  System Architecture
                </span>
                <span className="font-mono text-xs text-slate-500">3-Stage Pipeline</span>
              </div>

              <div className="my-4 space-y-2.5">
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">1. Web Frontend</p>
                    <p className="text-xs text-slate-600">
                      Image upload, live camera capture, and disposal results
                    </p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowDownUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <Code2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">2. Inference API Bridge</p>
                    <p className="text-xs text-slate-600">
                      Built-in vision route or FastAPI / Flask Python endpoint
                    </p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowDownUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">3. Colab CNN Model</p>
                    <p className="text-xs text-slate-600">
                      TrashNet dataset <span aria-hidden="true">→</span> CNN training{' '}
                      <span aria-hidden="true">→</span> <span className="font-mono">waste_model.keras</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {TRASHNET_CLASSES.map((cls) => {
              const info = WASTE_CATEGORY_MAP[cls];
              return (
                <div key={cls} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{info.label}</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {info.recyclable ? 'Recycle' : 'Landfill'}
                    </span>
                  </div>
                  <p className="text-xs leading-snug text-slate-500">
                    {info.examples.slice(0, 2).join(', ')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
