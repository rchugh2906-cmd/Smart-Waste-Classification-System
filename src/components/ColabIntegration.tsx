import { useState, type FormEvent } from 'react';
import { Check, Copy, Link2, PlugZap } from 'lucide-react';
import type { InferenceEngine } from '../types/waste.ts';

interface ColabIntegrationProps {
  customApiUrl: string;
  engine: InferenceEngine;
  onSaveApiUrl: (url: string, activateCustom: boolean) => void;
}

const FASTAPI_COLAB_SNIPPET = `# Run in Google Colab after saving waste_model.keras
!pip install -q fastapi uvicorn python-multipart pyngrok tensorflow pillow

import io, numpy as np, tensorflow as tf
from PIL import Image
from fastapi import FastAPI, File, UploadFile
import uvicorn, nest_asyncio
from pyngrok import ngrok

CLASS_NAMES = ["cardboard", "glass", "metal", "paper", "plastic", "trash"]
model = tf.keras.models.load_model("waste_model.keras")
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    img = Image.open(io.BytesIO(await file.read())).convert("RGB").resize((224, 224))
    arr = np.expand_dims(np.array(img, dtype=np.float32) / 255.0, axis=0)
    preds = model.predict(arr, verbose=0)[0]
    idx = int(np.argmax(preds))
    return {
        "predictedClass": CLASS_NAMES[idx],
        "confidence": round(float(preds[idx]) * 100, 2),
        "probabilities": {
            cls: round(float(preds[i]) * 100, 2) for i, cls in enumerate(CLASS_NAMES)
        }
    }

nest_asyncio.apply()
public_url = ngrok.connect(8000).public_url
print("Paste this endpoint into EcoSort Vision:", f"{public_url}/predict")
uvicorn.run(app, host="0.0.0.0", port=8000)`;

export function ColabIntegration({
  customApiUrl,
  engine,
  onSaveApiUrl,
}: ColabIntegrationProps) {
  const [urlInput, setUrlInput] = useState(customApiUrl);
  const [testing, setTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = urlInput.trim();
    onSaveApiUrl(cleaned, cleaned.length > 0);
    setTestFeedback(
      cleaned
        ? { ok: true, text: 'Endpoint saved and activated for Python Keras API mode.' }
        : { ok: true, text: 'Endpoint cleared. Reverted to Built-in Vision model.' }
    );
  };

  const handleTestConnection = async () => {
    const cleaned = urlInput.trim();
    if (!cleaned) {
      setTestFeedback({ ok: false, text: 'Enter your FastAPI /predict URL first.' });
      return;
    }
    setTesting(true);
    setTestFeedback(null);
    try {
      const res = await fetch('/api/test-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleaned }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestFeedback({ ok: true, text: data.message || 'Endpoint is reachable.' });
      } else {
        setTestFeedback({ ok: false, text: data.error || 'Endpoint did not respond.' });
      }
    } catch (err) {
      setTestFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to reach endpoint.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(FASTAPI_COLAB_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section id="colab-api" className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Connect Google Colab CNN API
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              When your TrashNet CNN model is trained and saved as{' '}
              <span className="font-mono text-xs text-slate-800">waste_model.keras</span>, expose
              its <span className="font-mono text-xs text-slate-800">/predict</span> route from
              Colab or a local Python server and connect it here.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <div>
                <label
                  htmlFor="colab-endpoint-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Python Prediction Endpoint URL
                </label>
                <div className="relative mt-1.5">
                  <Link2
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="colab-endpoint-input"
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://your-tunnel.ngrok-free.app/predict"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Active mode:{' '}
                  <span className="font-semibold text-slate-700">
                    {engine === 'custom-python' ? 'Python Keras API' : 'Built-in Vision Model'}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Save &amp; Activate
                </button>
                <button
                  type="button"
                  disabled={testing}
                  onClick={() => void handleTestConnection()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                  {testing ? 'Testing...' : 'Test Endpoint'}
                </button>
                {engine === 'custom-python' && (
                  <button
                    type="button"
                    onClick={() => onSaveApiUrl(urlInput.trim(), false)}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Use Built-in Instead
                  </button>
                )}
              </div>

              {testFeedback && (
                <p
                  role="status"
                  className={`text-xs font-medium ${
                    testFeedback.ok ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {testFeedback.text}
                </p>
              )}
            </form>
          </div>

          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <span className="font-mono text-xs text-slate-300">
                  colab_fastapi_bridge.py
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy Snippet
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
                <code>{FASTAPI_COLAB_SNIPPET}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
