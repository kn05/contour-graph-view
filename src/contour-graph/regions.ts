import { voronoiMapSimulation } from "d3-voronoi-map";
import { REGION_OPTS } from "./constants";
import { hashText } from "./folders";
import type { Point } from "./types";

export interface RegionFrame {
  center: Point;
  radius: number;
}

export interface RegionSeed {
  path: string;
  position: Point;
  weight: number;
}

export interface RegionCell {
  path: string;
  points: Point[];
  center: Point;
}

type Pair = [number, number];

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ state >>> 15, 1 | state);
    state ^= state + Math.imul(state ^ state >>> 7, 61 | state);
    return ((state ^ state >>> 14) >>> 0) / 4_294_967_296;
  };
}

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function regionFrame(points: readonly Point[], padding: number): RegionFrame | null {
  const valid = points.filter(finitePoint);
  if (valid.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of valid) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  let radius: number = REGION_OPTS.minRadius;
  for (const point of valid) {
    radius = Math.max(radius, Math.hypot(point.x - center.x, point.y - center.y) + padding);
  }
  return { center, radius };
}

export function circlePolygon(frame: RegionFrame): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < REGION_OPTS.circlePoints; index += 1) {
    const angle = index * Math.PI * 2 / REGION_OPTS.circlePoints;
    points.push({
      x: frame.center.x + Math.cos(angle) * frame.radius,
      y: frame.center.y + Math.sin(angle) * frame.radius
    });
  }
  return points;
}

export function polygonCenter(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function isInside(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, prev = polygon.length - 1; index < polygon.length; prev = index, index += 1) {
    const left = polygon[index];
    const right = polygon[prev];
    if (left === undefined || right === undefined) continue;
    const crosses = (left.y > point.y) !== (right.y > point.y);
    if (!crosses) continue;
    const x = (right.x - left.x) * (point.y - left.y) / (right.y - left.y) + left.x;
    if (point.x < x) inside = !inside;
  }
  return inside;
}

export function buildRegionPath(points: readonly Point[]): Path2D {
  const path = new Path2D();
  const first = points[0];
  if (first === undefined) return path;
  path.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined) path.lineTo(point.x, point.y);
  }
  path.closePath();
  return path;
}

function distinctSeeds(seeds: readonly RegionSeed[]): RegionSeed[] {
  return [...seeds].sort((left, right) => left.path.localeCompare(right.path)).map((seed) => {
    const angle = hashText(seed.path) / 0xffffffff * Math.PI * 2;
    return {
      ...seed,
      position: {
        x: seed.position.x + Math.cos(angle) * REGION_OPTS.siteJitter,
        y: seed.position.y + Math.sin(angle) * REGION_OPTS.siteJitter
      }
    };
  });
}

function clipHalfPlane(polygon: readonly Point[], a: number, b: number, c: number): Point[] {
  const result: Point[] = [];
  const isInsidePlane = (point: Point): boolean => a * point.x + b * point.y <= c + 1e-7;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (start === undefined || end === undefined) continue;
    const startInside = isInsidePlane(start);
    const endInside = isInsidePlane(end);
    if (startInside) result.push(start);
    if (startInside === endInside) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denominator = a * dx + b * dy;
    if (Math.abs(denominator) < 1e-10) continue;
    const ratio = (c - a * start.x - b * start.y) / denominator;
    result.push({ x: start.x + dx * ratio, y: start.y + dy * ratio });
  }
  return result;
}

function fallbackCells(seeds: readonly RegionSeed[], clip: readonly Point[]): RegionCell[] {
  const cells: RegionCell[] = [];
  for (const seed of seeds) {
    let polygon = [...clip];
    for (const other of seeds) {
      if (other.path === seed.path) continue;
      const a = 2 * (other.position.x - seed.position.x);
      const b = 2 * (other.position.y - seed.position.y);
      const c = other.position.x ** 2 + other.position.y ** 2
        - seed.position.x ** 2 - seed.position.y ** 2;
      polygon = clipHalfPlane(polygon, a, b, c);
      if (polygon.length < 3) break;
    }
    if (polygon.length >= 3) {
      cells.push({ path: seed.path, points: polygon, center: polygonCenter(polygon) });
    }
  }
  return cells;
}

export function buildRegionCells(seeds: readonly RegionSeed[], frame: RegionFrame): RegionCell[] {
  const safeSeeds = distinctSeeds(seeds.filter((seed) => finitePoint(seed.position) && seed.weight > 0));
  const clip = circlePolygon(frame);
  if (safeSeeds.length === 0) return [];
  if (safeSeeds.length === 1) {
    const seed = safeSeeds[0];
    return seed === undefined ? [] : [{ path: seed.path, points: clip, center: frame.center }];
  }

  const pairs = clip.map((point): Pair => [point.x, point.y]);
  const seedHash = hashText(safeSeeds.map((seed) => seed.path).join("\u0000"));
  try {
    const simulation = voronoiMapSimulation(safeSeeds)
      .weight((seed) => seed.weight)
      .clip(pairs)
      .initialPosition((seed): Pair => [seed.position.x, seed.position.y])
      .prng(seededRandom(seedHash))
      .convergenceRatio(REGION_OPTS.convergenceRatio)
      .maxIterationCount(REGION_OPTS.maxIterations)
      .minWeightRatio(REGION_OPTS.minWeightRatio)
      .stop();
    let state = simulation.state();
    while (!state.ended) {
      simulation.tick();
      state = simulation.state();
    }
    const cells: RegionCell[] = [];
    for (const polygon of state.polygons) {
      if (polygon === undefined || polygon.length < 3) continue;
      const seed = polygon.site.originalObject.data.originalData;
      const points = polygon.map((pair) => ({ x: pair[0], y: pair[1] }));
      cells.push({ path: seed.path, points, center: polygonCenter(points) });
    }
    if (cells.length === safeSeeds.length) return cells;
  } catch {
    // Fall back to a regular Voronoi partition when weighted convergence fails.
  }
  return fallbackCells(safeSeeds, clip);
}
