export type TrashNetClass =
  | 'cardboard'
  | 'glass'
  | 'metal'
  | 'paper'
  | 'plastic'
  | 'trash';

export type InputSource = 'upload' | 'camera' | 'sample';

export interface ClassProbability {
  category: TrashNetClass;
  probability: number;
}

export interface ClassificationResult {
  predictedClass: TrashNetClass;
  confidence: number;
  probabilities: ClassProbability[];
  detectedItem: string;
  recyclable: boolean;
  binCategory: string;
  disposalRecommendations: string[];
  environmentalNote: string;
}

export interface ClassificationHistoryEntry {
  id: string;
  timestamp: string;
  source: InputSource;
  imageName: string;
  thumbnailDataUrl: string;
  result: ClassificationResult;
}

export interface WasteCategoryMetadata {
  id: TrashNetClass;
  label: string;
  binName: string;
  recyclable: boolean;
  description: string;
  examples: string[];
  defaultRecommendations: string[];
  environmentalNote: string;
  accentTextClass: string;
  accentBarClass: string;
  accentBorderClass: string;
  accentBgClass: string;
}
