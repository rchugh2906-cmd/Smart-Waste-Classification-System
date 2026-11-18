import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { TRASHNET_CLASSES, WASTE_CATEGORY_MAP } from './src/data/wasteCategories.ts';
import type {
  ClassProbability,
  ClassificationHistoryEntry,
  ClassificationResult,
  InputSource,
  TrashNetClass,
} from './src/types/waste.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(__dirname, '.data');
const FALLBACK_DIR = path.join('/tmp', 'ecosort-data');

function getHistoryFile(): string {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return path.join(DATA_DIR, 'history.json');
  } catch {
    if (!fs.existsSync(FALLBACK_DIR)) {
      fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    }
    return path.join(FALLBACK_DIR, 'history.json');
  }
}

function readHistory(): ClassificationHistoryEntry[] {
  try {
    const file = getHistoryFile();
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: ClassificationHistoryEntry[]) {
  try {
    const file = getHistoryFile();
    fs.writeFileSync(file, JSON.stringify(entries.slice(0, 60), null, 2), 'utf8');
  } catch {
    // Ignore storage write error
  }
}

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
    const remainder = Number(((100 - clamped) / (TRASHNET_CLASSES.length - 1)).toFixed(1));
    return TRASHNET_CLASSES.map((category) => ({
      category,
      probability: category === predictedClass ? clamped : remainder,
    })).sort((a, b) => b.probability - a.probability);
  }

  const scale = sum <= 1.5 ? 100 : 100 / sum;
  return TRASHNET_CLASSES.map((category) => ({
    category,
    probability: Number(((map.get(category) || 0) * scale).toFixed(1)),
  })).sort((a, b) => b.probability - a.probability);
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('Server classification key is not configured.');
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
): Promise<ClassificationResult> {
  const ai = createGeminiClient();

  const imagePart = {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };

  const textPart = {
    text: [
      'Classify the primary waste item in this image into one of: cardboard, glass, metal, paper, plastic, trash.',
      'Return probabilities across all 6 classes summing to 100, a short item description, recyclability boolean, target bin name, 3 concise disposal steps, and 1 factual environmental note.',
    ].join(' '),
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: { parts: [imagePart, textPart] },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          predictedClass: {
            type: Type.STRING,
            enum: ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash'],
          },
          confidence: {
            type: Type.NUMBER,
          },
          probabilities: {
            type: Type.ARRAY,
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
          },
          recyclable: {
            type: Type.BOOLEAN,
          },
          binCategory: {
            type: Type.STRING,
          },
          disposalRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          environmentalNote: {
            type: Type.STRING,
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
        ? parsed.disposalRecommendations.slice(0, 3)
        : meta.defaultRecommendations,
    environmentalNote: parsed.environmentalNote || meta.environmentalNote,
  };
}

async function classifyWithPythonApi(
  pythonApiUrl: string,
  base64Data: string,
  mimeType: string
): Promise<ClassificationResult> {
  const buffer = Buffer.from(base64Data, 'base64');
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, `waste_input.${ext}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(pythonApiUrl, {
      method: 'POST',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Model API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawClass =
      data.predictedClass || data.prediction || data.class || data.label || data.category;
    if (!rawClass) {
      throw new Error('Model API response is missing a predicted class.');
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
    const finalConfidence =
      rawConfidence > 0 ? Number(rawConfidence.toFixed(1)) : probabilities[0].probability;

    return {
      predictedClass,
      confidence: finalConfidence,
      probabilities,
      detectedItem: data.detectedItem || `${meta.label} waste item`,
      recyclable:
        typeof data.recyclable === 'boolean' ? data.recyclable : meta.recyclable,
      binCategory: data.binCategory || meta.binName,
      disposalRecommendations:
        Array.isArray(data.disposalRecommendations) && data.disposalRecommendations.length > 0
          ? data.disposalRecommendations.slice(0, 3)
          : meta.defaultRecommendations,
      environmentalNote: data.environmentalNote || meta.environmentalNote,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/history', (_req, res) => {
    res.json(readHistory());
  });

  app.post('/api/history', (req, res) => {
    const entry = req.body;
    if (!entry || typeof entry !== 'object') {
      res.status(400).json({ error: 'Invalid history entry.' });
      return;
    }
    const updated = [entry as ClassificationHistoryEntry, ...readHistory()].slice(0, 60);
    writeHistory(updated);
    res.json(entry);
  });

  app.delete('/api/history/:id', (req, res) => {
    const id = req.params.id;
    const updated = readHistory().filter((entry) => entry.id !== id);
    writeHistory(updated);
    res.json(updated);
  });

  app.delete('/api/history', (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (id) {
      const updated = readHistory().filter((entry) => entry.id !== id);
      writeHistory(updated);
      res.json(updated);
      return;
    }
    writeHistory([]);
    res.json([]);
  });

  app.post('/api/classify', async (req, res) => {
    try {
      const { imageBase64, mimeType, source, imageName, thumbnailDataUrl } = req.body ?? {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Image data is required.' });
        return;
      }

      const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      const resolvedMime = dataUrlMatch?.[1] || mimeType || 'image/jpeg';
      const cleanBase64 = dataUrlMatch?.[2] || imageBase64;

      const configuredPythonUrl = process.env.PYTHON_API_URL?.trim();
      const apiKey = process.env.GEMINI_API_KEY?.trim();

      if (!configuredPythonUrl && (!apiKey || apiKey === 'MY_GEMINI_API_KEY')) {
        res.status(200).json({ useClientCnn: true });
        return;
      }

      const result = configuredPythonUrl
        ? await classifyWithPythonApi(configuredPythonUrl, cleanBase64, resolvedMime)
        : await classifyWithGemini(cleanBase64, resolvedMime);

      const validSource: InputSource =
        source === 'camera' || source === 'sample' ? source : 'upload';

      const entry: ClassificationHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        source: validSource,
        imageName: typeof imageName === 'string' && imageName ? imageName : 'waste-sample.jpg',
        thumbnailDataUrl:
          typeof thumbnailDataUrl === 'string' && thumbnailDataUrl
            ? thumbnailDataUrl
            : `data:${resolvedMime};base64,${cleanBase64}`,
        result,
      };

      const history = [entry, ...readHistory()].slice(0, 60);
      writeHistory(history);

      res.json({ result, entry });
    } catch (err) {
      console.error('Classification error:', err);
      const message =
        err instanceof Error ? err.message : 'Unable to classify waste image.';
      res.status(500).json({ error: message });
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
