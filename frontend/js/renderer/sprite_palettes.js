// Sprite Palettes — Role -> default color scheme mappings
// Each role has a default palette for skin, hair, clothes, eyes, and accessory
//
// ES Module

export const ROLE_PALETTES = {
  doctor: {
    skin: '#f5d6b8', hair: '#4a3728', clothes: '#f0f0f0',
    eyes: '#4a6a8a', accessory: '#c0392b',
  },
  blacksmith: {
    skin: '#d4a574', hair: '#2a1a0a', clothes: '#6b4f3a',
    eyes: '#3a3a2a', accessory: '#8b6914',
  },
  merchant: {
    skin: '#f0c8a0', hair: '#6b3a2a', clothes: '#4a6a3a',
    eyes: '#2a6a2a', accessory: '#c49a6c',
  },
  artist: {
    skin: '#e8c8a8', hair: '#8b5e3c', clothes: '#3a5a8a',
    eyes: '#4a8aba', accessory: '#8b3a3a',
  },
  innkeeper: {
    skin: '#d4a080', hair: '#5a2a1a', clothes: '#4a3a2a',
    eyes: '#6a4a2a', accessory: '#8b6914',
  },
  farmer: {
    skin: '#c8956a', hair: '#3a2010', clothes: '#5a6a3a',
    eyes: '#3a5a2a', accessory: '#8b6914',
  },
  child: {
    skin: '#f0c8a0', hair: '#6b3a2a', clothes: '#d4a0a0',
    eyes: '#4a6a8a', accessory: '#e8c8a0',
  },
  elder: {
    skin: '#c8a080', hair: '#d0d0d0', clothes: '#4a3a5a',
    eyes: '#6a6a8a', accessory: '#3a2a4a',
  },
  scientist: {
    skin: '#e8d4b8', hair: '#2a2a3a', clothes: '#ffffff',
    eyes: '#4a6a8a', accessory: '#4a9eff',
  },
  engineer: {
    skin: '#c8956a', hair: '#1a1a2a', clothes: '#4a5a6a',
    eyes: '#6a4a2a', accessory: '#ff6a2a',
  },
  medic: {
    skin: '#8b6b4a', hair: '#0a0a1a', clothes: '#3a6a5a',
    eyes: '#4a8a6a', accessory: '#c0392b',
  },
  pilot: {
    skin: '#d4a080', hair: '#3a3a1a', clothes: '#2a4a6a',
    eyes: '#2a6a8a', accessory: '#8b6914',
  },
  botanist: {
    skin: '#f0d4b0', hair: '#4a6a3a', clothes: '#3a6a2a',
    eyes: '#3a8a3a', accessory: '#6aaa4a',
  },
  security: {
    skin: '#6b4a2a', hair: '#0a0a0a', clothes: '#1a1a2a',
    eyes: '#2a2a4a', accessory: '#8a8a9a',
  },
  technician: {
    skin: '#e0c8a0', hair: '#6a5a3a', clothes: '#2a2a4a',
    eyes: '#4a4a8a', accessory: '#2a8a4a',
  },
  boss: {
    skin: '#d4a880', hair: '#1a1a1a', clothes: '#1a1a3a',
    eyes: '#3a3a4a', accessory: '#c0a020',
  },
  hr: {
    skin: '#f0c8a0', hair: '#5a3a2a', clothes: '#a05a6a',
    eyes: '#5a4a3a', accessory: '#e8c890',
  },
  designer: {
    skin: '#f5d8b8', hair: '#3a2018', clothes: '#5a8a9a',
    eyes: '#4a6a8a', accessory: '#ffb8c8',
  },
  salesperson: {
    skin: '#f0c0a0', hair: '#8b3a3a', clothes: '#d04060',
    eyes: '#5a3a3a', accessory: '#ffcc00',
  },
  leader: {
    skin: '#e8c8a8', hair: '#3a2a1a', clothes: '#4a5a4a',
    eyes: '#3a4a3a', accessory: '#8aa094',
  },
  veteran: {
    skin: '#c0a080', hair: '#c0c0c0', clothes: '#5a5a6a',
    eyes: '#5a5a6a', accessory: '#3a3a3a',
  },
  intern: {
    skin: '#f5d8b8', hair: '#6b4a6a', clothes: '#ffb8d8',
    eyes: '#4a6a8a', accessory: '#a0a0ff',
  },
};

export const DEFAULT_PALETTE = {
  skin: '#e8c8a0', hair: '#4a3020', clothes: '#5a5a6a',
  eyes: '#3a4a5a', accessory: '#8a6a4a',
};

export function getRolePalette(role) {
  return ROLE_PALETTES[role] || DEFAULT_PALETTE;
}

export function mergePalette(customPalette = {}, role = '') {
  const base = getRolePalette(role);
  return { ...base, ...customPalette };
}
