import { TRASHNET_CLASSES, WASTE_CATEGORY_MAP } from '../data/wasteCategories.ts';
import type { ClassProbability, ClassificationResult, TrashNetClass } from '../types/waste.ts';

interface MobileNetPrediction {
  className: string;
  probability: number;
}

interface MobileNetModel {
  classify: (
    img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    topk?: number
  ) => Promise<MobileNetPrediction[]>;
}

let modelPromise: Promise<MobileNetModel> | null = null;

async function getMobileNetModel(): Promise<MobileNetModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const mobilenet = await import('@tensorflow-models/mobilenet');
      return await mobilenet.load({ version: 2, alpha: 1.0 });
    })().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

const KEYWORD_WEIGHTS: Array<{ category: TrashNetClass; keywords: string[]; weight: number }> = [
  {
    category: 'cardboard',
    keywords: ['carton', 'cardboard', 'crate', 'mailbox', 'packet', 'box', 'corrugated'],
    weight: 1.2,
  },
  {
    category: 'glass',
    keywords: [
      'wine bottle',
      'beer bottle',
      'beer glass',
      'goblet',
      'vase',
      'jar',
      'beaker',
      'perfume',
      'pitcher',
      'decanter',
      'cruet',
      'measuring cup',
      'cocktail shaker',
      'glass',
      'hourglass',
    ],
    weight: 1.25,
  },
  {
    category: 'metal',
    keywords: [
      'can',
      'tin',
      'bucket',
      'pail',
      'kettle',
      'teapot',
      'frying pan',
      'wok',
      'ladle',
      'colander',
      'strainer',
      'hammer',
      'wrench',
      'screw',
      'nail',
      'oil filter',
      'toaster',
      'can opener',
      'corkscrew',
      'aluminum',
      'steel',
      'iron',
      'brass',
      'foil',
      'fork',
      'spoon',
      'knife',
      'pot',
      'barrel',
    ],
    weight: 1.2,
  },
  {
    category: 'paper',
    keywords: [
      'envelope',
      'newspaper',
      'magazine',
      'book jacket',
      'comic book',
      'menu',
      'paper towel',
      'toilet tissue',
      'tissue',
      'notebook',
      'binder',
      'crossword',
      'book',
      'paper',
      'origami',
    ],
    weight: 1.2,
  },
  {
    category: 'plastic',
    keywords: [
      'water bottle',
      'pop bottle',
      'water jug',
      'plastic bag',
      'pill bottle',
      'soap dispenser',
      'lotion',
      'shampoo',
      'detergent',
      'tub',
      'tray',
      'toothbrush',
      'hair spray',
      'syringe',
      'bottle',
      'cup',
      'jug',
      'container',
      'sunglasses',
      'pen',
      'ruler',
      'remote',
      'mouse',
    ],
    weight: 1.15,
  },
  {
    category: 'trash',
    keywords: [
      'diaper',
      'bandage',
      'swab',
      'sponge',
      'rag',
      'banana',
      'orange',
      'apple',
      'lemon',
      'pizza',
      'burrito',
      'sandwich',
      'burger',
      'shoe',
      'sock',
      'broom',
      'mop',
      'ashcan',
      'wrapper',
      'trash',
    ],
    weight: 1.0,
  },
];

function mapPredictionToClass(label: string): TrashNetClass {
  const lower = label.toLowerCase();
  // Exact compound phrases first
  if (lower.includes('water bottle') || lower.includes('pop bottle') || lower.includes('pill bottle')) {
    return 'plastic';
  }
  if (lower.includes('wine bottle') || lower.includes('beer bottle') || lower.includes('beer glass')) {
    return 'glass';
  }
  if (lower.includes('carton') || lower.includes('cardboard')) {
    return 'cardboard';
  }
  if (lower.includes('toilet tissue') || lower.includes('paper towel') || lower.includes('envelope')) {
    return 'paper';
  }

  let bestClass: TrashNetClass = 'trash';
  let bestScore = 0;

  for (const rule of KEYWORD_WEIGHTS) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        const score = kw.length * rule.weight;
        if (score > bestScore) {
          bestScore = score;
          bestClass = rule.category;
        }
      }
    }
  }

  return bestClass;
}

function formatPrimaryLabel(rawClassName: string): string {
  const primary = rawClassName.split(',')[0]?.trim() || 'Waste item';
  return primary.charAt(0).toUpperCase() + primary.slice(1);
}

export async function classifyWithBrowserCnn(imageDataUrl: string): Promise<ClassificationResult> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image for classification.'));
    el.src = imageDataUrl;
  });

  const model = await getMobileNetModel();
  const rawPreds = await model.classify(img, 10);

  const scores = new Map<TrashNetClass, number>();
  for (const cls of TRASHNET_CLASSES) {
    scores.set(cls, 0.005);
  }

  for (const pred of rawPreds) {
    const mapped = mapPredictionToClass(pred.className);
    scores.set(mapped, (scores.get(mapped) || 0) + Math.max(0.001, pred.probability));
  }

  const total = Array.from(scores.values()).reduce((sum, v) => sum + v, 0);
  const probabilities: ClassProbability[] = TRASHNET_CLASSES.map((category) => ({
    category,
    probability: Number((((scores.get(category) || 0) / total) * 100).toFixed(1)),
  })).sort((a, b) => b.probability - a.probability);

  const top = probabilities[0];
  const meta = WASTE_CATEGORY_MAP[top.category];
  const topLabel = rawPreds[0]?.className ? formatPrimaryLabel(rawPreds[0].className) : meta.label;

  return {
    predictedClass: top.category,
    confidence: top.probability,
    probabilities,
    detectedItem: `${topLabel} (${meta.label})`,
    recyclable: meta.recyclable,
    binCategory: meta.binName,
    disposalRecommendations: meta.defaultRecommendations,
    environmentalNote: meta.environmentalNote,
  };
}
