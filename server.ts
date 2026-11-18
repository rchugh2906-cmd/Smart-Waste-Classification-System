import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { TRASHNET_CLASSES, WASTE_CATEGORY_MAP } from './src/data/wasteCategories.ts';
import type {
  ClassProbability,
  ClassificationResult,
  TrashNetClass,
} from './src/types/waste.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function normalizeClassLabel(rawLabel: string): TrashNetClass {
  const lower = String(rawLabel || '').trim().toLowerCase();
  if (lower.includes('cardboard')) return 'cardboard';
  if (lower.includes('glass')) return 'glass';
  if (lower.includes('metal') || lower.includes('aluminum') || lower.includes('tin')) return 'metal';
  if (lower.includes('paper')) return 'paper';
  if (lower.includes('plastic')) return 'plastic';
  return 'trash';
}

function normalizeProbabilities(
  predictedClass: TrashNetClass,
  rawProbs: Array<{ category: string; probability: number }> | Record<string, number> | undefined,
  fallbackConfidence: number
): ClassProbability[] {
  const map = new Map<TrashNetClass, number>();
  for (const cls of TRASHNET_CLASSES) {
    map.set(cls, 0);
  }

  if (Array.isArray(rawProbs)) {
    for (const item of rawProbs) {
      const cls = normalizeClassLabel(item.category);
      const val = Number(item.probability);
      if (!Number.isNaN(val) && val >= 0) {
        map.set(cls, (map.get(cls) || 0) + val);
      }
    }
  } else if (rawProbs && typeof rawProbs === 'object') {
    for (const [k, v] of Object.entries(rawProbs)) {
      const cls = normalizeClassLabel(k);
      const val = Number(v);
      if (!Number.isNaN(val) && val >= 0) {
        map.set(cls, (map.get(cls) || 0) + val);
      }
    }
  }

  const values = Array.from(map.values());
  const sum = values.reduce((acc, n) => acc + n, 0);

  if (sum <= 0) {
    const clamped = Math.min(99.5, Math.max(50, fallbackConfidence));
    const remainder = Number(((100 - clamped) / (TRASHNET_CLASSES.length - 1)).toFixed(2));
    return TRASHNET_CLASSES.map((category) => ({
      category,
      probability: category === predictedClass ? clamped : remainder,
    })).sort((a, b) => b.probability - a.probability);
  }

  // Handle 0..1 vs 0..100 scale
  const scale = sum <= 1.5 ? 100 : 100 / sum;
  const normalized = TRASHNET_CLASSES.map((category) => ({
    category,
    probability: Number(((map.get(category) || 0) * scale).toFixed(1)),
  })).sort((a, b) => b.probability - a.probability);

  return normalized;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add a valid key in Settings > Secrets or connect a custom Python CNN endpoint.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function classifyWithGemini(
  base64Data: string,
  mimeType: string
): Promise<Omit<ClassificationResult, 'engine' | 'latencyMs'>> {
  const ai = createGeminiClient();

  const imagePart = {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };

  const textPart = {
    text: [
      'Classify the primary waste object in this image into one of the six TrashNet CNN dataset classes: cardboard, glass, metal, paper, plastic, or trash.',
      'Provide calibrated probability percentages across all 6 classes that sum to 100.',
      'Identify the visible waste item concisely, specify whether it is recyclable, recommend the target disposal bin, provide 3 practical preparation/disposal steps, and give 1 factual environmental impact note.',
    ].join(' '),
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts: [imagePart, textPart] },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          predictedClass: {
            type: Type.STRING,
            enum: ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash'],
            description: 'Top predicted TrashNet waste category.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence percentage from 0 to 100 for the predicted class.',
          },
          probabilities: {
            type: Type.ARRAY,
            description: 'Probability breakdown across all 6 TrashNet categories summing to 100.',
            items: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  enum: ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash'],
                },
                probability: {
                  type: Type.NUMBER,
                },
              },
              required: ['category', 'probability'],
            },
          },
          detectedItem: {
            type: Type.STRING,
            description: 'Short description of the item visible in the photo.',
          },
          recyclable: {
            type: Type.BOOLEAN,
            description: 'Whether this waste item belongs in a recycling stream.',
          },
          binCategory: {
            type: Type.STRING,
            description: 'Target collection bin name, e.g. Blue Plastic Container Recycling.',
          },
          disposalRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 3 practical preparation and disposal steps.',
          },
          environmentalNote: {
            type: Type.STRING,
            description: 'One concise factual sentence about material recovery or contamination.',
          },
        },
        required: [
          'predictedClass',
          'confidence',
          'probabilities',
          'detectedItem',
          'recyclable',
          'binCategory',
          'disposalRecommendations',
          'environmentalNote',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText);
  const predictedClass = normalizeClassLabel(parsed.predictedClass);
  const meta = WASTE_CATEGORY_MAP[predictedClass];
  const probabilities = normalizeProbabilities(
    predictedClass,
    parsed.probabilities,
    Number(parsed.confidence) || 92
  );
  const topProb = probabilities[0]?.probability ?? Number(parsed.confidence) ?? 92;

  return {
    predictedClass: probabilities[0]?.category || predictedClass,
    confidence: Number(topProb.toFixed(1)),
    probabilities,
    detectedItem: parsed.detectedItem || `${meta.label} waste item`,
    recyclable:
      typeof parsed.recyclable === 'boolean' ? parsed.recyclable : meta.recyclable,
    binCategory: parsed.binCategory || meta.binName,
    disposalRecommendations:
      Array.isArray(parsed.disposalRecommendations) && parsed.disposalRecommendations.length > 0
        ? parsed.disposalRecommendations.slice(0, 4)
        : meta.defaultRecommendations,
    environmentalNote: parsed.environmentalNote || meta.environmentalNote,
  };
}

async function classifyWithCustomPythonApi(
  customApiUrl: string,
  base64Data: string,
  mimeType: string
): Promise<Omit<ClassificationResult, 'engine' | 'latencyMs'>> {
  let targetUrl: URL;
  try {
    targetUrl = new URL(customApiUrl.trim());
  } catch {
    throw new Error('Invalid custom Python API URL. Provide a full http:// or https:// endpoint.');
  }

  const buffer = Buffer.from(base64Data, 'base64');
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, `waste_input.${ext}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(
        `Python API returned HTTP ${res.status}${errorText ? `: ${errorText.slice(0, 160)}` : ''}`
      );
    }

    const data = await res.json();
    const rawClass =
      data.predictedClass || data.prediction || data.class || data.label || data.category;
    if (!rawClass) {
      throw new Error(
        'Python API response did not include a recognized class field (predictedClass, prediction, class, or label).'
      );
    }

    const predictedClass = normalizeClassLabel(String(rawClass));
    const meta = WASTE_CATEGORY_MAP[predictedClass];

    let rawConfidence = Number(data.confidence ?? data.score ?? data.probability ?? 0);
    if (rawConfidence > 0 && rawConfidence <= 1) {
      rawConfidence = rawConfidence * 100;
    }

    const rawProbs = data.probabilities || data.all_predictions || data.scores;
    const probabilities = normalizeProbabilities(
      predictedClass,
      rawProbs,
      rawConfidence || 90
    );
    const finalConfidence = rawConfidence > 0 ? Number(rawConfidence.toFixed(1)) : probabilities[0].probability;

    return {
      predictedClass,
      confidence: finalConfidence,
      probabilities,
      detectedItem: data.detectedItem || `${meta.label} specimen (Keras CNN)`,
      recyclable:
        typeof data.recyclable === 'boolean' ? data.recyclable : meta.recyclable,
      binCategory: data.binCategory || meta.binName,
      disposalRecommendations:
        Array.isArray(data.disposalRecommendations) && data.disposalRecommendations.length > 0
          ? data.disposalRecommendations
          : meta.defaultRecommendations,
      environmentalNote: data.environmentalNote || meta.environmentalNote,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/test-endpoint', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Please provide an endpoint URL to verify.' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ ok: false, error: 'URL must start with http:// or https://' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const originHealth = `${parsed.origin}/health`;
      const probe = await fetch(originHealth, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: controller.signal,
      }).catch(() =>
        fetch(parsed.toString(), {
          method: 'OPTIONS',
          headers: { 'ngrok-skip-browser-warning': 'true' },
          signal: controller.signal,
        })
      );

      res.json({
        ok: probe.status < 500,
        status: probe.status,
        message:
          probe.status < 500
            ? `Reachable (HTTP ${probe.status})`
            : `Server responded with HTTP ${probe.status}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      res.status(502).json({
        ok: false,
        error: `Could not reach ${parsed.origin}: ${msg}`,
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/classify', async (req, res) => {
    const start = Date.now();
    try {
      const { imageBase64, mimeType, customApiUrl } = req.body ?? {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Image payload is required.' });
        return;
      }

      const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      const resolvedMime = dataUrlMatch?.[1] || mimeType || 'image/jpeg';
      const cleanBase64 = dataUrlMatch?.[2] || imageBase64;

      if (customApiUrl && typeof customApiUrl === 'string' && customApiUrl.trim().length > 0) {
        const result = await classifyWithCustomPythonApi(
          customApiUrl,
          cleanBase64,
          resolvedMime
        );
        res.json({
          ...result,
          engine: 'custom-python',
          latencyMs: Date.now() - start,
        } satisfies ClassificationResult);
        return;
      }

      const result = await classifyWithGemini(cleanBase64, resolvedMime);
      res.json({
        ...result,
        engine: 'builtin',
        latencyMs: Date.now() - start,
      } satisfies ClassificationResult);
    } catch (err) {
      console.error('Classification error:', err);
      const message =
        err instanceof Error ? err.message : 'Unable to classify image at this time.';
      const status = message.includes('GEMINI_API_KEY')
        ? 500
        : message.includes('Python API')
          ? 502
          : 500;
      res.status(status).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EcoSort Vision server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
