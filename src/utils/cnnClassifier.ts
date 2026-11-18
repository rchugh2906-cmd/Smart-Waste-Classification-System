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
      // Always use CPU backend to eliminate WebGL shader compilation/linking errors
      await tf.setBackend('cpu');
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

export function preloadBrowserCnn(): void {
  void getMobileNetModel().catch(() => {
    // Will surface error only if user triggers inference and network is offline
  });
}

interface MaterialCues {
  kraftBrown: number;
  brightPaper: number;
  metallicSheen: number;
  glassTint: number;
  polymerSaturated: number;
}

function createCenterCropCanvas(img: HTMLImageElement, cropFraction = 0.72): HTMLCanvasElement {
  const srcW = img.naturalWidth || img.width || 224;
  const srcH = img.naturalHeight || img.height || 224;
  const cropW = Math.max(32, Math.round(srcW * cropFraction));
  const cropH = Math.max(32, Math.round(srcH * cropFraction));
  const sx = Math.round((srcW - cropW) / 2);
  const sy = Math.round((srcH - cropH) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, 224, 224);
  }
  return canvas;
}

function analyzeMaterialCues(img: HTMLImageElement): MaterialCues {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { kraftBrown: 0, brightPaper: 0, metallicSheen: 0, glassTint: 0, polymerSaturated: 0 };
  }

  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  let kraft = 0;
  let paper = 0;
  let neutralDark = 0;
  let neutralBright = 0;
  let neutralMid = 0;
  let glassCool = 0;
  let saturated = 0;
  let samples = 0;

  const start = 12;
  const end = 52;
  for (let y = start; y < end; y++) {
    for (let x = start; x < end; x++) {
      const idx = (y * size + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const spread = max - min;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      samples++;

      if (r > g && g > b && r - b >= 24 && r >= 100 && r <= 225 && g >= 70 && g <= 185) {
        kraft++;
      }

      if (min > 185 && spread < 24) {
        paper++;
      }

      if (spread < 22) {
        if (lum < 95) neutralDark++;
        else if (lum > 205) neutralBright++;
        else neutralMid++;
      }

      if (g >= r - 2 && b >= r - 4 && spread >= 6 && spread <= 36 && lum > 110) {
        glassCool++;
      }

      if (spread > 55 && !(r > g && g > b && r - b < 65)) {
        saturated++;
      }
    }
  }

  const kraftRatio = kraft / samples;
  const paperRatio = paper / samples;
  const metallicContrast =
    neutralMid / samples > 0.14
      ? Math.min(1, ((neutralDark / samples) * 3.5 + (neutralBright / samples) * 3.5) / 2)
      : 0;

  return {
    kraftBrown: Math.min(1, kraftRatio * 3.4),
    brightPaper: Math.min(1, paperRatio * 2.2),
    metallicSheen: metallicContrast,
    glassTint: Math.min(1, (glassCool / samples) * 3.1),
    polymerSaturated: Math.min(1, (saturated / samples) * 3.5),
  };
}

const KEYWORD_RULES: Array<{ category: TrashNetClass; keywords: string[]; weight: number }> = [
  {
    category: 'cardboard',
    keywords: [
      'carton',
      'cardboard',
      'crate',
      'mailbox',
      'packet',
      'shoebox',
      'matchbox',
      'doormat',
      'chopping board',
      'box',
    ],
    weight: 1.4,
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
      'hourglass',
      'measuring cup',
      'cocktail shaker',
      'carafe',
      'saltshaker',
      'whiskey jug',
      'red wine',
      'glass',
    ],
    weight: 1.4,
  },
  {
    category: 'metal',
    keywords: [
      'beer can',
      'soda can',
      'tin',
      'can opener',
      'ashcan',
      'oil filter',
      'kettle',
      'teapot',
      'frying pan',
      'colander',
      'ladle',
      'corkscrew',
      'lighter',
      'microphone',
      'flashlight',
      'torch',
      'thermos',
      'bucket',
      'pail',
      'barrel',
      'steel drum',
      'iron',
      'aluminum',
      'steel',
      'brass',
      'foil',
      'hammer',
      'wrench',
      'screw',
      'nail',
      'padlock',
      'lock',
      'whistle',
      'pot',
      'toaster',
      'waffle iron',
      'cleaver',
      'thimble',
    ],
    weight: 1.35,
  },
  {
    category: 'paper',
    keywords: [
      'toilet tissue',
      'paper towel',
      'envelope',
      'newspaper',
      'magazine',
      'book jacket',
      'notebook',
      'binder',
      'menu',
      'handkerchief',
      'napkin',
      'dishrag',
      'bath towel',
      'origami',
      'crossword',
      'comic book',
      'book',
      'paper',
    ],
    weight: 1.35,
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
      'sunscreen',
      'toothbrush',
      'hair spray',
      'syringe',
      'nipple',
      'bottlecap',
      'plastic',
      'bottle',
      'jug',
      'tub',
      'spatula',
      'cup',
      'sunglasses',
      'sunglass',
      'ballpoint',
      'fountain pen',
      'rule',
      'ruler',
      'remote',
      'loupe',
      'strainer',
      'cassette',
    ],
    weight: 1.3,
  },
  {
    category: 'trash',
    keywords: [
      'diaper',
      'band aid',
      'bandage',
      'swab',
      'sponge',
      'banana',
      'orange',
      'lemon',
      'strawberry',
      'pineapple',
      'apple',
      'granny smith',
      'fig',
      'pizza',
      'burrito',
      'cheeseburger',
      'hotdog',
      'french loaf',
      'bagel',
      'pretzel',
      'ice cream',
      'ice lolly',
      'guacamole',
      'dough',
      'meat loaf',
      'potpie',
      'shoe',
      'running shoe',
      'sandal',
      'clog',
      'sock',
      'broom',
      'mop',
      'wrapper',
      'trash',
    ],
    weight: 1.15,
  },
];

function scoreLabel(
  label: string,
  prob: number,
  cues: MaterialCues
): { category: TrashNetClass | null; score: number } {
  const lower = label.toLowerCase();

  if (lower.includes('pop bottle') || lower.includes('water bottle')) {
    if (cues.metallicSheen > 0.45 && cues.polymerSaturated < 0.15) {
      return { category: 'metal', score: prob * 1.25 };
    }
    if (cues.glassTint > 0.35 && cues.polymerSaturated < 0.12) {
      return { category: 'glass', score: prob * 1.25 };
    }
    return { category: 'plastic', score: prob * 1.45 };
  }

  let bestCat: TrashNetClass | null = null;
  let bestScore = 0;

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        const score = kw.length * rule.weight;
        if (score > bestScore) {
          bestScore = score;
          bestCat = rule.category;
        }
      }
    }
  }

  if (!bestCat) {
    return { category: null, score: 0 };
  }
  return { category: bestCat, score: prob * (1 + Math.min(0.45, bestScore * 0.02)) };
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

  const cues = analyzeMaterialCues(img);
  const centerCrop = createCenterCropCanvas(img, 0.72);
  const model = await getMobileNetModel();

  const [fullPreds, cropPreds] = await Promise.all([
    model.classify(img, 15),
    model.classify(centerCrop, 15),
  ]);

  const scores = new Map<TrashNetClass, number>();
  for (const cls of TRASHNET_CLASSES) {
    scores.set(cls, 0.008);
  }

  let matchedMass = 0;
  for (const pred of cropPreds) {
    const { category, score } = scoreLabel(pred.className, pred.probability * 0.65, cues);
    if (category) {
      scores.set(category, (scores.get(category) || 0) + score);
      matchedMass += score;
    }
  }
  for (const pred of fullPreds) {
    const { category, score } = scoreLabel(pred.className, pred.probability * 0.35, cues);
    if (category) {
      scores.set(category, (scores.get(category) || 0) + score);
      matchedMass += score;
    }
  }

  const priorScale = matchedMass < 0.25 ? 0.48 : 0.24;
  scores.set('cardboard', (scores.get('cardboard') || 0) + cues.kraftBrown * priorScale);
  scores.set('paper', (scores.get('paper') || 0) + cues.brightPaper * priorScale * 0.7);
  scores.set('metal', (scores.get('metal') || 0) + cues.metallicSheen * priorScale);
  scores.set('glass', (scores.get('glass') || 0) + cues.glassTint * priorScale);
  scores.set('plastic', (scores.get('plastic') || 0) + cues.polymerSaturated * priorScale * 0.8);

  // Calibrated temperature sharpening for clearer confidence separation
  const sharpened = new Map<TrashNetClass, number>();
  let total = 0;
  for (const cls of TRASHNET_CLASSES) {
    const val = Math.pow(scores.get(cls) || 0.008, 1.25);
    sharpened.set(cls, val);
    total += val;
  }

  const probabilities: ClassProbability[] = TRASHNET_CLASSES.map((category) => ({
    category,
    probability: Number((((sharpened.get(category) || 0) / total) * 100).toFixed(1)),
  })).sort((a, b) => b.probability - a.probability);

  const top = probabilities[0];
  const meta = WASTE_CATEGORY_MAP[top.category];
  const leadPred = cropPreds[0] || fullPreds[0];
  const topLabel = leadPred?.className ? formatPrimaryLabel(leadPred.className) : meta.label;

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
