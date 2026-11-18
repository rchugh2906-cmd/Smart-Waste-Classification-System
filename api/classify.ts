import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

type TrashNetClass = 'cardboard' | 'glass' | 'metal' | 'paper' | 'plastic' | 'trash';
type InputSource = 'upload' | 'camera' | 'sample';

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

const TRASHNET_CLASSES: TrashNetClass[] = [
  'cardboard',
  'glass',
  'metal',
  'paper',
  'plastic',
  'trash',
];

const CATEGORY_DEFAULTS: Record<
  TrashNetClass,
  { label: string; binName: string; recyclable: boolean; steps: string[]; note: string }
> = {
  cardboard: {
    label: 'Cardboard',
    binName: 'Blue Paper & Cardboard Recycling',
    recyclable: true,
    steps: [
      'Flatten boxes completely to save collection volume.',
      'Remove plastic tape, foam inserts, or shipping pouches.',
      'Keep cardboard dry and free from food grease.',
    ],
    note: 'Recycling one ton of corrugated cardboard saves roughly 17 trees.',
  },
  glass: {
    label: 'Glass',
    binName: 'Glass & Bottle Recycling Stream',
    recyclable: true,
    steps: [
      'Empty contents and rinse with cold water.',
      'Remove metal or cork lids before sorting.',
      'Do not mix ceramics or window glass with container glass.',
    ],
    note: 'Container glass can be recycled endlessly without losing purity.',
  },
  metal: {
    label: 'Metal',
    binName: 'Blue Metal & Can Recycling',
    recyclable: true,
    steps: [
      'Drain liquids and rinse food tins lightly.',
      'Keep pull-tabs attached to aluminum cans.',
      'Exclude batteries or pressurized canisters from metal bins.',
    ],
    note: 'Recycling aluminum uses about 95% less energy than virgin production.',
  },
  paper: {
    label: 'Paper',
    binName: 'Blue Paper & Fiber Recycling',
    recyclable: true,
    steps: [
      'Keep paper dry and away from organic waste.',
      'Remove plastic window films or spiral bindings.',
      'Place clean office sheets and newspapers into paper recycling.',
    ],
    note: 'Recovered paper fibers can be repulped five to seven times.',
  },
  plastic: {
    label: 'Plastic',
    binName: 'Blue Plastic Container Recycling',
    recyclable: true,
    steps: [
      'Empty liquids and rinse container residue.',
      'Compress bottles lightly and replace the cap if accepted locally.',
      'Keep soft plastic bags out of single-stream recycling bins.',
    ],
    note: 'Diverting rigid PET and HDPE containers reduces virgin petrochemical use.',
  },
  trash: {
    label: 'Trash',
    binName: 'Black General Landfill Stream',
    recyclable: false,
    steps: [
      'Dispose of soiled or multi-layer packaging in general waste.',
      'Check local hazardous drop-offs for batteries or electronics.',
      'Keep non-recyclables out of recycling bins to avoid contamination.',
    ],
    note: 'Isolating non-recyclable items prevents entire recycling batches from rejection.',
  },
};

const HISTORY_FILE = path.join('/tmp', 'ecosort-history.json');

function appendHistory(entry: unknown) {
  try {
    let existing: unknown[] = [];
    if (fs.existsSync(HISTORY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      if (Array.isArray(parsed)) existing = parsed;
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([entry, ...existing].slice(0, 60)), 'utf8');
  } catch {
    // Ignore ephemeral filesystem errors
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
) {
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

  const sum = Array.from(map.values()).reduce((acc, n) => acc + n, 0);
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const method = (req.method || 'POST').toUpperCase();
  if (method !== 'POST') {
    res.status(405).json({ error: `Method ${method} not allowed` });
    return;
  }

  try {
    const body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as Record<string, unknown>)
        : ((req.body ?? {}) as Record<string, unknown>);

    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
    const source = body.source;
    const imageName = typeof body.imageName === 'string' && body.imageName ? body.imageName : 'waste-sample.jpg';
    const thumbnailDataUrl =
      typeof body.thumbnailDataUrl === 'string' ? body.thumbnailDataUrl : '';

    if (!imageBase64) {
      res.status(400).json({ error: 'Image data is required.' });
      return;
    }

    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    const resolvedMime = dataUrlMatch?.[1] || mimeType;
    const cleanBase64 = dataUrlMatch?.[2] || imageBase64;

    const pythonUrl = process.env.PYTHON_API_URL?.trim();
    let result;

    if (pythonUrl) {
      const buffer = Buffer.from(cleanBase64, 'base64');
      const ext = resolvedMime.includes('png') ? 'png' : resolvedMime.includes('webp') ? 'webp' : 'jpg';
      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: resolvedMime }), `waste_input.${ext}`);

      const upstream = await fetch(pythonUrl, {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': 'true' },
        body: formData,
      });
      if (!upstream.ok) {
        throw new Error(`Python model API returned HTTP ${upstream.status}`);
      }
      const data = await upstream.json();
      const rawClass = data.predictedClass || data.prediction || data.class || data.label || data.category;
      if (!rawClass) {
        throw new Error('Model API response is missing a predicted class.');
      }
      const predictedClass = normalizeClassLabel(String(rawClass));
      const meta = CATEGORY_DEFAULTS[predictedClass];
      let rawConfidence = Number(data.confidence ?? data.score ?? data.probability ?? 0);
      if (rawConfidence > 0 && rawConfidence <= 1) rawConfidence *= 100;
      const probabilities = normalizeProbabilities(
        predictedClass,
        data.probabilities || data.all_predictions || data.scores,
        rawConfidence || 90
      );
      result = {
        predictedClass,
        confidence: rawConfidence > 0 ? Number(rawConfidence.toFixed(1)) : probabilities[0].probability,
        probabilities,
        detectedItem: data.detectedItem || `${meta.label} waste item`,
        recyclable: typeof data.recyclable === 'boolean' ? data.recyclable : meta.recyclable,
        binCategory: data.binCategory || meta.binName,
        disposalRecommendations:
          Array.isArray(data.disposalRecommendations) && data.disposalRecommendations.length > 0
            ? data.disposalRecommendations.slice(0, 3)
            : meta.steps,
        environmentalNote: data.environmentalNote || meta.note,
      };
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(200).json({ useClientCnn: true });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            { inlineData: { mimeType: resolvedMime, data: cleanBase64 } },
            {
              text: [
                'Classify the primary waste object into the exact TrashNet category:',
                'cardboard (corrugated boxes, shipping cartons),',
                'glass (glass bottles, glass jars),',
                'metal (aluminum soda cans, steel food tins, foil),',
                'paper (flat paper sheets, newspapers, magazines, envelopes, paper bags),',
                'plastic (PET water bottles, plastic jugs, tubs, plastic caps/bags),',
                'or trash (food-soiled wrappers, composite pouches, tissues, non-recyclable waste).',
                'Return calibrated probabilities across all 6 classes summing to 100, a short item description, recyclability boolean, target bin name, 3 concise disposal steps, and 1 factual environmental note.',
              ].join(' '),
            },
          ],
        },
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
              confidence: { type: Type.NUMBER },
              probabilities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: {
                      type: Type.STRING,
                      enum: ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash'],
                    },
                    probability: { type: Type.NUMBER },
                  },
                  required: ['category', 'probability'],
                },
              },
              detectedItem: { type: Type.STRING },
              recyclable: { type: Type.BOOLEAN },
              binCategory: { type: Type.STRING },
              disposalRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              environmentalNote: { type: Type.STRING },
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

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const predictedClass = normalizeClassLabel(parsed.predictedClass);
      const meta = CATEGORY_DEFAULTS[predictedClass];
      const probabilities = normalizeProbabilities(
        predictedClass,
        parsed.probabilities,
        Number(parsed.confidence) || 92
      );
      const topProb = probabilities[0]?.probability ?? Number(parsed.confidence) ?? 92;

      result = {
        predictedClass: probabilities[0]?.category || predictedClass,
        confidence: Number(topProb.toFixed(1)),
        probabilities,
        detectedItem: parsed.detectedItem || `${meta.label} waste item`,
        recyclable: typeof parsed.recyclable === 'boolean' ? parsed.recyclable : meta.recyclable,
        binCategory: parsed.binCategory || meta.binName,
        disposalRecommendations:
          Array.isArray(parsed.disposalRecommendations) && parsed.disposalRecommendations.length > 0
            ? parsed.disposalRecommendations.slice(0, 3)
            : meta.steps,
        environmentalNote: parsed.environmentalNote || meta.note,
      };
    }

    const validSource: InputSource =
      source === 'camera' || source === 'sample' ? source : 'upload';

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      source: validSource,
      imageName,
      thumbnailDataUrl: thumbnailDataUrl || `data:${resolvedMime};base64,${cleanBase64}`,
      result,
    };

    appendHistory(entry);
    res.status(200).json({ result, entry });
  } catch (err) {
    console.error('Vercel classify error:', err);
    const message = err instanceof Error ? err.message : 'Unable to classify waste image.';
    res.status(500).json({ error: message });
  }
}
