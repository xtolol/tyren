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

export const sealColorsDim: Record<SealRank, string> = {
  bronze: 'rgba(192, 133, 73, 0.35)',
  silver: 'rgba(201, 214, 226, 0.35)',
  gold: 'rgba(246, 198, 103, 0.35)',
  mythic: 'rgba(195, 77, 176, 0.35)',
};

// ---- Per-level identity accents ----
// Each level owns a color world: Zalthar's Chains is gold, Hollowroot is
// root-ember. Only those two have designs so far — later levels fall back
// to gold until they get their own. The boss stage always overrides with
// the universal ember-red fight variant.

export interface LevelAccent {
  accent: string; // primary identity color (crest, borders, labels)
  bright: string; // highlighted values (pixel numerals, CTA text)
  faint: string; // rays, empty tracks
  border: string; // card and chip borders
  glow: string; // radial glow center behind the card
  buttonTop: string; // focus-button radial top
  buttonBottom: string; // focus-button radial bottom
}

const goldAccent: LevelAccent = {
  accent: '#E8A64A',
  bright: '#F6C667',
  faint: 'rgba(232, 166, 74, 0.18)',
  border: 'rgba(232, 166, 74, 0.28)',
  glow: '#241505',
  buttonTop: '#7A4F12',
  buttonBottom: '#2A1B06',
};

const hollowrootAccent: LevelAccent = {
  accent: '#E07A4E',
  bright: '#FF9E6B',
  faint: 'rgba(224, 122, 78, 0.18)',
  border: 'rgba(224, 122, 78, 0.3)',
  glow: '#2A1309',
  buttonTop: '#7A3A18',
  buttonBottom: '#2A1206',
};

const LEVEL_ACCENTS: LevelAccent[] = [goldAccent, hollowrootAccent];

export function levelAccent(sortOrder: number): LevelAccent {
  return LEVEL_ACCENTS[sortOrder] ?? goldAccent;
}
