// The "Sigil" direction (design exploration 1B + the relic system 2A):
// warm near-black, gold relic-crest gold, pixel numerals over serif titles.
// Every screen draws from here — no more per-screen palettes.

import type { SealRank } from './core/relics';

export const palette = {
  // Warm near-black stage
  bg: '#0C0805',
  bgRaised: '#140D07',
  card: '#1A1108',
  cardBorder: 'rgba(232, 166, 74, 0.28)',
  hairline: 'rgba(232, 166, 74, 0.14)',

  // The gold family
  gold: '#E8A64A',
  goldBright: '#F6C667',
  goldDeep: '#8A5A1E',
  goldDim: 'rgba(232, 166, 74, 0.55)',
  goldFaint: 'rgba(232, 166, 74, 0.18)',

  // Text
  text: '#F4EADA',
  textDim: 'rgba(244, 234, 218, 0.6)',
  textFaint: 'rgba(244, 234, 218, 0.38)',

  // Boss-stage ember variant
  ember: '#FF6A4D',
  emberBright: '#FF8A66',
  emberDeep: '#1F0B06',
  emberCard: '#241008',
  emberBorder: 'rgba(255, 106, 77, 0.35)',
  emberDim: 'rgba(255, 106, 77, 0.55)',

  // Currencies (unchanged brand colors)
  dust: '#FBC647',
  shards: '#C34DB0',

  danger: '#FF6B6B',
} as const;

export const fonts = {
  serif: 'InstrumentSerif-Regular',
  pixel: 'Silkscreen',
  pixelBold: 'Silkscreen-Bold',
  ui: 'OpenSans',
} as const;

// Seal identity colors: bronze earth, silver frost, gold flame, mythic dusk.
export const sealColors: Record<SealRank, string> = {
  bronze: '#C08549',
  silver: '#C9D6E2',
  gold: '#F6C667',
  mythic: '#C34DB0',
};

// ---- Per-level identity accents ----
// Each level owns a color world (codex design): L1 gold spark, L2 abyssal
// teal, L3 withered sage, L4 Hollowroot root-ember, L5 molten red, L6 bone
// white. The boss stage always overrides with the universal ember-red variant.

export interface LevelAccent {
  accent: string; // primary identity color (crest, borders, labels)
  bright: string; // highlighted values (pixel numerals, CTA text)
  dim: string; // secondary text/captions in the accent hue
  faint: string; // rays, empty tracks
  border: string; // card and chip borders
  card: string; // tinted card surface
  glow: string; // radial glow center behind the card / active surfaces
  buttonTop: string; // focus-button radial top
  buttonBottom: string; // focus-button radial bottom
}

const goldAccent: LevelAccent = {
  // L1 Zalthar's Chains
  accent: '#E8A64A',
  bright: '#F6C667',
  dim: 'rgba(232, 166, 74, 0.55)',
  faint: 'rgba(232, 166, 74, 0.18)',
  border: 'rgba(232, 166, 74, 0.28)',
  card: '#1A1108',
  glow: '#241505',
  buttonTop: '#7A4F12',
  buttonBottom: '#2A1B06',
};

const depthsAccent: LevelAccent = {
  // L2 Yawning Depths
  accent: '#3EB8CE',
  bright: '#6FD9E8',
  dim: 'rgba(62, 184, 206, 0.55)',
  faint: 'rgba(62, 184, 206, 0.18)',
  border: 'rgba(62, 184, 206, 0.3)',
  card: '#0A1518',
  glow: '#08191E',
  buttonTop: '#1B5D6B',
  buttonBottom: '#07242A',
};

const plainsAccent: LevelAccent = {
  // L3 Withered Plains
  accent: '#9BB77C',
  bright: '#BFD9A2',
  dim: 'rgba(155, 183, 124, 0.55)',
  faint: 'rgba(155, 183, 124, 0.18)',
  border: 'rgba(155, 183, 124, 0.3)',
  card: '#10150A',
  glow: '#141A0C',
  buttonTop: '#4E6630',
  buttonBottom: '#18220C',
};

const hollowrootAccent: LevelAccent = {
  // L4 Hollowroot (the original root-ember from its shipped design)
  accent: '#E07A4E',
  bright: '#FF9E6B',
  dim: 'rgba(224, 122, 78, 0.55)',
  faint: 'rgba(224, 122, 78, 0.18)',
  border: 'rgba(224, 122, 78, 0.3)',
  card: '#1E0F07',
  glow: '#2A1309',
  buttonTop: '#7A3A18',
  buttonBottom: '#2A1206',
};

const emberfallAccent: LevelAccent = {
  // L5 Emberfall Reach — molten red, a step past Hollowroot's root-orange
  accent: '#E25444',
  bright: '#FF7E66',
  dim: 'rgba(226, 84, 68, 0.55)',
  faint: 'rgba(226, 84, 68, 0.18)',
  border: 'rgba(226, 84, 68, 0.3)',
  card: '#1E0A07',
  glow: '#260B06',
  buttonTop: '#7A281A',
  buttonBottom: '#260C06',
};

const unboundAccent: LevelAccent = {
  // L6 Zalthar Unbound
  accent: '#D8D2C4',
  bright: '#F2EDE2',
  dim: 'rgba(216, 210, 196, 0.55)',
  faint: 'rgba(216, 210, 196, 0.18)',
  border: 'rgba(216, 210, 196, 0.3)',
  card: '#181712',
  glow: '#1C1A15',
  buttonTop: '#6B6559',
  buttonBottom: '#23211B',
};

const LEVEL_ACCENTS: LevelAccent[] = [
  goldAccent,
  depthsAccent,
  plainsAccent,
  hollowrootAccent,
  emberfallAccent,
  unboundAccent,
];

export function levelAccent(sortOrder: number): LevelAccent {
  return LEVEL_ACCENTS[sortOrder] ?? goldAccent;
}
