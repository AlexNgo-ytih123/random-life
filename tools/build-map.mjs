#!/usr/bin/env node
/**
 * 生成 data/map.json —— Random Life 落地页 / 出生仪式用的世界底图。
 *
 * 数据来源（都只是构建期 devDependency，游戏运行期零依赖）：
 *   - 陆地轮廓：npm `world-atlas` 的 land-110m.json
 *     （TopoJSON，Natural Earth 公有领域数据）
 *   - 国家中心点：npm `world-countries` 的 cca3 + latlng
 *
 * 坐标与投影
 * ----------
 * 陆地多边形用**等距圆柱（equirectangular）**投影成 720×300 的画布像素坐标：
 *
 *     x = (lon + 180) * 2      // 经度 [-180, 180] → [0, 720]
 *     y = (90  - lat ) * 2      // 纬度 [ -60,  90] → [300, 0]（y 向下）
 *
 * 画布下方切掉 −60° 以南：南极洲整块被裁掉（那里也没有常住人口），
 * 既符合"只画有人生活的地方"的取景，也让文件体积明显变小。
 *
 * centroids 存的是**原始经纬度** `[lon, lat]`（不是像素坐标）：
 * 渲染端用上面同一套投影函数把出生点换算成像素，所以这里只存原始坐标，
 * 这样以后想换投影（例如裁成别的取景）也不必重跑数据管线。
 *
 * 输出是确定性的：同样的输入永远产出字节一致的 data/map.json（文件里不含时间戳）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 画布尺寸（像素）。 */
const WIDTH = 720;
const HEIGHT = 300;

/** 每度对应多少像素。 */
const SCALE = 2;

/** 取景窗口（度）。 */
const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -60;
const LAT_MAX = 90;

/** 经纬度量化精度（保留 1 位小数，0.1° ≈ 0.2px，在 720×300 画布上足够）。 */
const QUANT_DECIMALS = 1;

/** Douglas–Peucker 简化容差（度）。0.15° ≈ 0.3px。 */
const SIMPLIFY_TOLERANCE = 0.15;

/** 中心点保留 2 位小数（0.01° ≈ 1km）。 */
const CENTROID_DECIMALS = 2;

/** 输出文件（相对仓库根目录运行）。 */
const OUT_FILE = path.join('data', 'map.json');

/* ------------------------------------------------------------------ *
 * 投影
 * ------------------------------------------------------------------ */

/** 经度 → 画布 x。 */
const projectX = (lon) => (lon - LON_MIN) * SCALE;

/** 纬度 → 画布 y。 */
const projectY = (lat) => (LAT_MAX - lat) * SCALE;

/* ------------------------------------------------------------------ *
 * TopoJSON 解码
 * ------------------------------------------------------------------ */

/**
 * 极简 TopoJSON → 几何体解码器。
 * 仅在 `topojson-client` 不可用时兜底使用（弧解码 + 环组装）。
 */
function decodeTopoJsonFallback(topology) {
  const { scale = [1, 1], translate = [0, 0] } = topology.transform || {};
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });

  // 负下标表示反向使用该弧（~i）
  const arcPoints = (i) => (i < 0 ? arcs[~i].slice().reverse() : arcs[i]);

  const ringOf = (arcIds) => {
    const points = [];
    for (const id of arcIds) {
      const seg = arcPoints(id);
      // TopoJSON 约定：相邻弧首尾点重复，去掉接缝上的重复点
      if (points.length) points.pop();
      for (const p of seg) points.push(p);
    }
    return points;
  };

  const geometry = (o) => {
    switch (o.type) {
      case 'GeometryCollection':
        return { type: o.type, geometries: o.geometries.map(geometry) };
      case 'Polygon':
        return { type: o.type, coordinates: o.arcs.map(ringOf) };
      case 'MultiPolygon':
        return { type: o.type, coordinates: o.arcs.map((poly) => poly.map(ringOf)) };
      default:
        throw new Error(`兜底解码器不支持的几何类型：${o.type}`);
    }
  };

  const out = { type: 'FeatureCollection', features: [] };
  for (const o of Object.values(topology.objects)) {
    const g = geometry(o);
    out.features.push({ type: 'Feature', properties: {}, geometry: g });
  }
  return out;
}

/**
 * 用 topojson-client 解码 TopoJSON；包不可用时退回自带的极简解码器。
 * @returns {Promise<{geometries: object[]}>}
 */
async function decodeTopology(topology) {
  try {
    const { feature } = await import('topojson-client');
    const fc = feature(topology, 'land');
    return { geometries: fc.features.map((f) => f.geometry) };
  } catch (err) {
    console.warn(`[build-map] topojson-client 不可用（${err.message}），改用内置兜底解码器`);
    const fc = decodeTopoJsonFallback(topology);
    return { geometries: fc.features.map((f) => f.geometry) };
  }
}

/** 把 Polygon / MultiPolygon / GeometryCollection 摊平成"环"列表。 */
function collectRings(geometry) {
  const rings = [];
  const visit = (g) => {
    if (!g) return;
    if (g.type === 'GeometryCollection') {
      g.geometries.forEach(visit);
    } else if (g.type === 'Polygon') {
      g.coordinates.forEach((ring) => rings.push(ring));
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach((poly) => poly.forEach((ring) => rings.push(ring)));
    }
  };
  visit(geometry);
  return rings;
}

/* ------------------------------------------------------------------ *
 * 几何处理：反缠绕 → 切开反子午线 → 裁剪 → 简化 → 量化
 * ------------------------------------------------------------------ */

/**
 * 反缠绕（unwrap）：把环上的经度展开成连续序列。
 *
 * Natural Earth 的数据在 ±180° 处被切断，源数据里会出现 -180 → +180 这种
 * 360° 的跳变。这里逐点让经度与「上一个已展开点」保持最短连接，
 * 于是整条环变成一条连续的曲线（可能绕地球多转一圈）。
 */
function unwrapRing(ring) {
  const out = [];
  let prev = null;
  for (const [lon, lat] of ring) {
    if (prev === null) {
      out.push([lon, lat]);
      prev = lon;
      continue;
    }
    let d = lon - prev;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    const next = prev + d;
    out.push([next, lat]);
    prev = next;
  }
  return out;
}

/** 经度属于第几个"世界副本"（窗口 [-180+360k, 180+360k]）。 */
const windowIndex = (lon) => Math.floor((lon + 180) / 360);

/**
 * 沿 lon = -180 + 360k 切开一条展开后的曲线，
 * 切出来的每段仍带着它所属的窗口编号 w。
 */
function cutAtAntimeridian(points) {
  const pieces = [];
  let cur = [];
  let curW = windowIndex(points[0][0]);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const w = windowIndex(p[0]);
    if (w === curW) {
      cur.push(p);
      continue;
    }
    // 跨过边界线：求交点
    const a = points[i - 1];
    const b = p;
    const boundary = -180 + 360 * Math.max(curW, w);
    const t = (boundary - a[0]) / (b[0] - a[0]);
    const cross = [boundary, a[1] + (b[1] - a[1]) * t];
    cur.push(cross);
    pieces.push({ pts: cur, w: curW });
    cur = [cross];
    curW = w;
    cur.push(p);
  }
  pieces.push({ pts: cur, w: curW });
  return pieces;
}

/** Sutherland–Hodgman 半平面裁剪。 */
function clipHalfPlane(ring, keep, intersect) {
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const aIn = keep(a);
    const bIn = keep(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) out.push(intersect(a, b));
  }
  return out;
}

const clipLonGE = (min) => (a, b) => {
  const t = (min - a[0]) / (b[0] - a[0]);
  return [min, a[1] + (b[1] - a[1]) * t];
};
const clipLonLE = (max) => (a, b) => {
  const t = (max - a[0]) / (b[0] - a[0]);
  return [max, a[1] + (b[1] - a[1]) * t];
};
const clipLatGE = (min) => (a, b) => {
  const t = (min - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0] - a[0]) * t, min];
};

/** 点到线段的垂距（用于 Douglas–Peucker）。 */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + clamped * dx), p[1] - (a[1] + clamped * dy));
}

/** Douglas–Peucker 简化（开放折线，迭代实现避免深递归）。 */
function douglasPeucker(points, tolerance) {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * 简化闭合环：在环上找两个极点把环拆成两条开放折线，分别做 Douglas–Peucker。
 * 这样两个极点一定保留，形状不会被削得太狠。
 */
function simplifyClosedRing(points, tolerance) {
  const n = points.length;
  if (n < 4) return points.slice();
  let i1 = 0;
  let i2 = 0;
  for (let i = 1; i < n; i++) {
    if (points[i][0] < points[i1][0]) i1 = i;
    if (points[i][0] > points[i2][0]) i2 = i;
  }
  if (i1 === i2) {
    // 经度全都一样（沿经线的环）：用纬度极值再切一刀
    let j1 = 0;
    let j2 = 0;
    for (let i = 1; i < n; i++) {
      if (points[i][1] < points[j1][1]) j1 = i;
      if (points[i][1] > points[j2][1]) j2 = i;
    }
    i1 = j1;
    i2 = j2;
  }
  if (i1 === i2) return points.slice();
  const [a, b] = i1 < i2 ? [i1, i2] : [i2, i1];
  const chainA = points.slice(a, b + 1);
  const chainB = points.slice(b).concat(points.slice(0, a + 1));
  const simplifiedA = douglasPeucker(chainA, tolerance);
  const simplifiedB = douglasPeucker(chainB, tolerance);
  return simplifiedA.slice(0, -1).concat(simplifiedB.slice(0, -1));
}

/** 量化到固定小数位，并去掉量化后连续的重复点。 */
function quantize(points, decimals) {
  const factor = 10 ** decimals;
  const out = [];
  for (const [lon, lat] of points) {
    const p = [Math.round(lon * factor) / factor, Math.round(lat * factor) / factor];
    const prev = out[out.length - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
    out.push(p);
  }
  return out;
}

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

/**
 * 把源数据里的一个环处理成若干个"落在窗口内"的像素环。
 * @returns {number[][][]} 像素坐标的环数组（已闭合，末点 = 首点）
 */
function processRing(sourceRing) {
  // 源数据里环是闭合的（末点与首点相同），去掉末尾的重复点
  const pts = sourceRing.slice();
  if (pts.length > 1 && samePoint(pts[0], pts[pts.length - 1])) pts.pop();
  if (pts.length < 3) return [];

  const unwrapped = unwrapRing(pts);
  const result = [];

  for (const { pts: piece, w } of cutAtAntimeridian(unwrapped)) {
    if (piece.length < 2) continue;
    // 平移回 [-180, 180] 这一份世界
    let ring = piece.map(([lon, lat]) => [lon - 360 * w, lat]);
    // 闭合成环（切出来的片段靠这条边闭合，正好落在 ±180° 那条线上）
    ring.push(ring[0]);
    // 裁剪到取景窗口
    ring = clipHalfPlane(ring, (p) => p[0] >= LON_MIN, clipLonGE(LON_MIN));
    ring = clipHalfPlane(ring, (p) => p[0] <= LON_MAX, clipLonLE(LON_MAX));
    ring = clipHalfPlane(ring, (p) => p[1] >= LAT_MIN, clipLatGE(LAT_MIN));
    if (ring.length < 3) continue;

    let simplified = simplifyClosedRing(ring, SIMPLIFY_TOLERANCE);
    simplified = quantize(simplified, QUANT_DECIMALS);
    // 量化后可能首尾点不再重合，去掉末尾重复点
    if (simplified.length > 1 && samePoint(simplified[0], simplified[simplified.length - 1])) {
      simplified.pop();
    }
    // 至少 3 个不同点 + 闭合点 = 4 个点才画得出东西
    if (simplified.length < 3) continue;

    const pixels = simplified.map(([lon, lat]) => [
      Number(projectX(lon).toFixed(2)),
      Number(projectY(lat).toFixed(2)),
    ]);
    pixels.push(pixels[0]);
    result.push(pixels);
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * 国家中心点
 * ------------------------------------------------------------------ */

/**
 * 读取 world-countries 的国家清单。
 * 优先用包本身（ESM 默认导出），失败时直接读包里的 countries.json。
 */
async function loadCountries() {
  try {
    const mod = await import('world-countries');
    const list = mod.countries || mod.default;
    if (Array.isArray(list)) return list;
    if (list && Array.isArray(list.countries)) return list.countries;
    throw new Error('world-countries 导出结构不符合预期');
  } catch (err) {
    console.warn(`[build-map] 直接 import world-countries 失败（${err.message}），改读 countries.json`);
    const file = require.resolve('world-countries/countries.json');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}

/**
 * 生成 { ISO3: [lon, lat] }。
 * world-countries 的 latlng 是 [lat, lon]，这里把顺序换成 [lon, lat]，
 * 并且**不做投影**——渲染端会用同一套投影函数换算成像素。
 */
function buildCentroids(countries) {
  const centroids = {};
  for (const c of countries) {
    const iso3 = c && c.cca3;
    const latlng = c && c.latlng;
    if (!iso3 || iso3.length !== 3) continue;
    if (!Array.isArray(latlng) || latlng.length !== 2) continue;
    const [lat, lon] = latlng;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    centroids[iso3] = [Number(lon.toFixed(CENTROID_DECIMALS)), Number(lat.toFixed(CENTROID_DECIMALS))];
  }
  // 排序保证输出顺序稳定（与源数据顺序无关）
  const sorted = {};
  for (const key of Object.keys(centroids).sort()) sorted[key] = centroids[key];
  return sorted;
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main() {
  // ---- 陆地轮廓 ----
  const topoPath = require.resolve('world-atlas/land-110m.json');
  const topology = JSON.parse(fs.readFileSync(topoPath, 'utf8'));
  const { geometries } = await decodeTopology(topology);

  const land = [];
  for (const geometry of geometries) {
    for (const ring of collectRings(geometry)) {
      for (const pixels of processRing(ring)) land.push(pixels);
    }
  }

  // ---- 国家中心点 ----
  const countries = await loadCountries();
  const centroids = buildCentroids(countries);

  // ---- 自检：不应该有横穿整幅图的"跨图缝"（相邻点的经度跨度接近 360°）----
  const seamProblems = land.filter((ring) =>
    ring.some((p, i) => {
      const q = ring[(i + 1) % ring.length];
      return Math.abs(p[0] - q[0]) > 360 * 0.9;
    }),
  );
  if (seamProblems.length) {
    console.warn(`[build-map] 警告：${seamProblems.length} 个环出现了横跨整图的接缝`);
  }

  // ---- 落盘（确定性输出，不含时间戳）----
  const payload = {
    land,
    centroids,
    width: WIDTH,
    height: HEIGHT,
    // 投影说明：land 已经是像素坐标，centroids 是原始经纬度
    projection: {
      type: 'equirectangular',
      scale: SCALE,
      lonOffset: -LON_MIN,
      latTop: LAT_MAX,
      lonRange: [LON_MIN, LON_MAX],
      latRange: [LAT_MIN, LAT_MAX],
    },
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');

  const bytes = fs.statSync(OUT_FILE).size;
  console.log(
    `map.json：${land.length} 个陆地环 · ${Object.keys(centroids).length} 个国家中心点 · ${(bytes / 1024).toFixed(1)}KB`,
  );
}

main().catch((err) => {
  console.error('[build-map] 失败：', err);
  process.exitCode = 1;
});
