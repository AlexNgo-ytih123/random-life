/**
 * js/render/palette.js
 * 调色板系统：定义游戏视觉风格的颜色集。
 * 支持 light (白天/明亮) 和 dark (夜晚/阴郁) 两套主题。
 */

export const PX_PAL = {
  light: {
    sky: ['#87CEEB', '#ADD8E6', '#B0E0E6'], // 渐变天空
    sun: '#FFD700',
    cloud: '#FFFFFF',
    cloudLow: '#B0C4DE',
    far1: '#A9B9C4',
    far2: '#C0D0D8',
    hill1: '#7FB3D5',
    hill2: '#5499C7',
    grass: '#7CFC00',
    grass2: '#98FB98',
    grassHi: '#ADFF2F',
    soil: '#8B4513',
    pave: '#D3D3D3',
    road: '#808080',
    water: '#4682B4',
    wall: '#F5F5DC',
    roof: '#B22222',
    thatch: '#DEB887',
    mud: '#A52A2A',
    brick: '#CD5C5C',
    win: '#E0FFFF',
    winLit: '#FFFFE0',
    outline: '#2F4F4F',
    tree: '#228B22',
    skin: '#FFDAB9',
    sk0: '#FDF5E6',
    sk1: '#F5DEB3',
    sk2: '#DEB887',
    sk3: '#D2B48C',
    sk4: '#8B4513',
    sk5: '#5C4033',
    hair: '#3F3530',
    hairOld: '#DDDAD3',
    pants: '#4F5661',
    me: '#1F8A80',
    pt: '#6C80B2',
    kid: '#FFB6C1',
    par: '#BDB76B',
    sib: '#B0C4DE',
    inlaw: '#BC8F8F',
    metal: '#708090',
    crane: '#FFD700',
    smoke: '#DCDCDC',
    accent: '#FF4500',
    stamp: '#B22222',
    gold: '#FFD700',
    lit: '#FFFF00',
  },
  dark: {
    sky: ['#191970', '#000080', '#483D8B'],
    sun: '#F0E68C',
    cloud: '#778899',
    cloudLow: '#4682B4',
    far1: '#2F4F4F',
    far2: '#4682B4',
    hill1: '#1C3D5A',
    hill2: '#0F2032',
    grass: '#228B22',
    grass2: '#006400',
    grassHi: '#556B2F',
    soil: '#3D2B1F',
    pave: '#696969',
    road: '#333333',
    water: '#000080',
    wall: '#556B2F',
    roof: '#8B0000',
    thatch: '#8B4513',
    mud: '#5C4033',
    brick: '#8B0000',
    win: '#191970',
    winLit: '#FFFF00',
    outline: '#000000',
    tree: '#006400',
    skin: '#C68642',
    sk0: '#F5DEB3',
    sk1: '#DEB887',
    sk2: '#D2B48C',
    sk3: '#8B4513',
    sk4: '#5C4033',
    sk5: '#3D2B1F',
    hair: '#1A1A1A',
    hairOld: '#A9A9A9',
    pants: '#2F4F4F',
    me: '#006400',
    pt: '#483D8B',
    kid: '#DB7093',
    par: '#8B8B00',
    sib: '#4682B4',
    inlaw: '#8B0000',
    metal: '#2F4F4F',
    crane: '#B8860B',
    smoke: '#696969',
    accent: '#B22222',
    stamp: '#8B0000',
    gold: '#B8860B',
    lit: '#FFFF00',
  }
};

/**
 * 根据主题返回调色板对象
 * @param {boolean} forceDark 是否强制使用暗色主题
 */
export function pxPalette(forceDark = false) {
  return forceDark ? { ...PX_PAL.dark } : { ...PX_PAL.light };
}

/**
 * 简单的颜色混合函数
 */
export function pxMix(c1, c2, t = 0.5) {
  // 假设 c1, c2 是 '#RRGGBB' 格式
  const parse = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };
  const [r1, g1, b1] = parse(c1);
  const [r2, g2, b2] = parse(c2);
  const mix = (v1, v2) => Math.round(v1 * (1 - t) + v2 * t);
  const res = [mix(r1, r2), mix(g1, g2), mix(b1, b2)];
  return `rgb(${res[0]},${res[1]},${res[2]})`;
}
