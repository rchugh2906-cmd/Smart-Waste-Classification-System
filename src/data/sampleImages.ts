import type { TrashNetClass } from '../types/waste.ts';

export interface SampleWasteItem {
  id: string;
  title: string;
  expectedClass: TrashNetClass;
  imageUrl: string;
}

export const SAMPLE_WASTE_ITEMS: SampleWasteItem[] = [
  {
    id: 'sample-plastic',
    title: 'Crushed PET Water Bottle',
    expectedClass: 'plastic',
    imageUrl: '/src/assets/images/sample_plastic_bottle_1795006556999.jpg',
  },
  {
    id: 'sample-cardboard',
    title: 'Corrugated Shipping Box',
    expectedClass: 'cardboard',
    imageUrl: '/src/assets/images/sample_cardboard_box_1795006557004.jpg',
  },
  {
    id: 'sample-glass',
    title: 'Clear Glass Bottle & Jar',
    expectedClass: 'glass',
    imageUrl: '/src/assets/images/sample_glass_jar_1795006557873.jpg',
  },
  {
    id: 'sample-metal',
    title: 'Crushed Aluminum Can',
    expectedClass: 'metal',
    imageUrl: '/src/assets/images/sample_metal_can_1795006558214.jpg',
  },
];
