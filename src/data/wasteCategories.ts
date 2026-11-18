import type { TrashNetClass, WasteCategoryMetadata } from '../types/waste.ts';

export const TRASHNET_CLASSES: TrashNetClass[] = [
  'cardboard',
  'glass',
  'metal',
  'paper',
  'plastic',
  'trash',
];

export const WASTE_CATEGORY_MAP: Record<TrashNetClass, WasteCategoryMetadata> = {
  cardboard: {
    id: 'cardboard',
    label: 'Cardboard',
    binName: 'Blue Paper & Cardboard Recycling',
    recyclable: true,
    description: 'Corrugated shipping boxes, carton sleeves, and rigid paperboard packaging.',
    examples: ['Shipping cartons', 'Cereal boxes', 'Packaging sleeves'],
    defaultRecommendations: [
      'Flatten boxes completely to save collection volume in the recycling bin.',
      'Remove excessive plastic packing tape, foam inserts, or shipping pouches.',
      'Keep cardboard dry and free from food grease or oil contamination.',
    ],
    environmentalNote:
      'Recycling one ton of corrugated cardboard saves roughly 17 trees and reduces landfill methane emissions.',
    accentTextClass: 'text-amber-800',
    accentBarClass: 'bg-amber-600',
    accentBorderClass: 'border-amber-200',
    accentBgClass: 'bg-amber-50',
  },
  glass: {
    id: 'glass',
    label: 'Glass',
    binName: 'Glass & Bottle Recycling Stream',
    recyclable: true,
    description: 'Clear, amber, and green beverage bottles, food jars, and container glass.',
    examples: ['Beverage bottles', 'Preserve jars', 'Sauce containers'],
    defaultRecommendations: [
      'Empty contents and give the jar or bottle a quick cold-water rinse.',
      'Remove metal or cork lids and sort metal caps with metal recyclables.',
      'Do not mix ceramics, window glass, or lightbulbs into container glass bins.',
    ],
    environmentalNote:
      'Container glass can be melted and remanufactured infinitely without loss of structural purity.',
    accentTextClass: 'text-teal-800',
    accentBarClass: 'bg-teal-600',
    accentBorderClass: 'border-teal-200',
    accentBgClass: 'bg-teal-50',
  },
  metal: {
    id: 'metal',
    label: 'Metal',
    binName: 'Blue Metal & Can Recycling',
    recyclable: true,
    description: 'Aluminum beverage cans, tin food cans, and clean household aluminum foil.',
    examples: ['Aluminum soda cans', 'Steel food tins', 'Clean foil trays'],
    defaultRecommendations: [
      'Drain residual liquids and rinse food tins to prevent odor or pest attraction.',
      'Leave pull-tabs attached to aluminum cans so small tabs are not lost in sorting screens.',
      'Avoid placing pressurized aerosol canisters or batteries in standard metal bins.',
    ],
    environmentalNote:
      'Recycling aluminum requires approximately 95% less energy than refining virgin bauxite ore.',
    accentTextClass: 'text-slate-800',
    accentBarClass: 'bg-slate-700',
    accentBorderClass: 'border-slate-300',
    accentBgClass: 'bg-slate-100',
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    binName: 'Blue Paper & Fiber Recycling',
    recyclable: true,
    description: 'Office sheets, newspapers, magazines, envelopes, and clean paper bags.',
    examples: ['Printed documents', 'Magazines', 'Kraft paper bags'],
    defaultRecommendations: [
      'Keep paper sheets dry, clean, and separated from wet organic or liquid waste.',
      'Remove plastic window films or heavy spiral bindings before pulping.',
      'Shredded paper should be bagged in a paper sack if required by your municipal program.',
    ],
    environmentalNote:
      'Clean recovered paper fibers can be repulped five to seven times before fibers shorten.',
    accentTextClass: 'text-sky-800',
    accentBarClass: 'bg-sky-600',
    accentBorderClass: 'border-sky-200',
    accentBgClass: 'bg-sky-50',
  },
  plastic: {
    id: 'plastic',
    label: 'Plastic',
    binName: 'Blue Plastic Container Recycling',
    recyclable: true,
    description: 'Rigid PET (#1), HDPE (#2), and PP (#5) bottles, jugs, and food tubs.',
    examples: ['PET water bottles', 'Milk jugs', 'Detergent bottles'],
    defaultRecommendations: [
      'Empty liquids completely and rinse residue from bottles or food tubs.',
      'Compress plastic bottles lightly and replace the cap if accepted locally.',
      'Keep soft plastic bags and cling film out of single-stream sorting machinery.',
    ],
    environmentalNote:
      'Diverting PET and HDPE containers cuts virgin petrochemical demand and marine microplastic leakage.',
    accentTextClass: 'text-emerald-800',
    accentBarClass: 'bg-emerald-600',
    accentBorderClass: 'border-emerald-200',
    accentBgClass: 'bg-emerald-50',
  },
  trash: {
    id: 'trash',
    label: 'Trash',
    binName: 'Black General Landfill Stream',
    recyclable: false,
    description: 'Non-recyclable composite packaging, soiled food wrappers, and mixed residuals.',
    examples: ['Chip bags', 'Soiled tissues', 'Multi-layer pouches'],
    defaultRecommendations: [
      'Place soiled, multi-material, or non-recyclable items in the general waste bin.',
      'Double-check whether batteries, electronics, or sharps require hazardous drop-off.',
      'Keep non-recyclable items out of recycling streams to avoid batch contamination.',
    ],
    environmentalNote:
      'Properly isolating non-recyclable trash prevents high-value recyclable bales from being rejected at MRFs.',
    accentTextClass: 'text-rose-800',
    accentBarClass: 'bg-rose-600',
    accentBorderClass: 'border-rose-200',
    accentBgClass: 'bg-rose-50',
  },
};
