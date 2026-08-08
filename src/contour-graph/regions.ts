import { Delaunay } from "d3-delaunay";
import { REGION_OPTS } from "./constants";
import { hashText } from "./folders";
import type { Point } from "./types";

export interface RegionFrame {
  center: Point;
  radius: number;
}

export interface RegionSeed {
  id: string;
  path: string;
  position: Point;
}

export interface RegionCell {
  id: string;
  path: string;
  points: Point[];
  center: Point;
}

export interface RegionBoundary {
  start: Point;
  end: Point;
  paths: string[];
}

export interface RegionPartition {
  cells: RegionCell[];
  boundaries: RegionBoundary[];
  pathAt: (point: Point) => string | null;
}

interface BoundaryEntry {
  start: Point;
  end: Point;
  owners: number;
  paths: Set<string>;
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
  return [...seeds].sort((left, right) => left.id.localeCompare(right.id)).map((seed) => {
    const angle = hashText(seed.id) / 0xffffffff * Math.PI * 2;
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

function clipToCircle(polygon: readonly Point[], circle: readonly Point[]): Point[] {
  let result = [...polygon];
  for (let index = 0; index < circle.length; index += 1) {
    const start = circle[index];
    const end = circle[(index + 1) % circle.length];
    if (start === undefined || end === undefined) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    result = clipHalfPlane(result, dy, -dx, dy * start.x - dx * start.y);
    if (result.length < 3) return [];
  }
  return result;
}

function coordinateKey(value: number): number {
  return Math.round(value * REGION_OPTS.edgePrecision);
}

function pointKey(point: Point): string {
  return `${coordinateKey(point.x)},${coordinateKey(point.y)}`;
}

function edgeKey(start: Point, end: Point): string {
  const left = pointKey(start);
  const right = pointKey(end);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function regionBoundaries(cells: readonly RegionCell[]): RegionBoundary[] {
  const entries = new Map<string, BoundaryEntry>();
  for (const cell of cells) {
    for (let index = 0; index < cell.points.length; index += 1) {
      const start = cell.points[index];
      const end = cell.points[(index + 1) % cell.points.length];
      if (start === undefined || end === undefined) continue;
      const key = edgeKey(start, end);
      const entry = entries.get(key);
      if (entry === undefined) {
        entries.set(key, { start, end, owners: 1, paths: new Set([cell.path]) });
      } else {
        entry.owners += 1;
        entry.paths.add(cell.path);
      }
    }
  }
  return [...entries.values()].flatMap((entry): RegionBoundary[] => {
    if (entry.owners > 1 && entry.paths.size === 1) return [];
    return [{ start: entry.start, end: entry.end, paths: [...entry.paths] }];
  });
}

function openPolygon(points: readonly [number, number][]): Point[] {
  const converted = points.map((point) => ({ x: point[0], y: point[1] }));
  const first = converted[0];
  const last = converted.at(-1);
  if (first !== undefined && last !== undefined
    && Math.abs(first.x - last.x) < 1e-7 && Math.abs(first.y - last.y) < 1e-7) {
    converted.pop();
  }
  return converted;
}

export function buildRegionPartition(
  seeds: readonly RegionSeed[],
  frame: RegionFrame
): RegionPartition {
  const safeSeeds = distinctSeeds(seeds.filter((seed) => finitePoint(seed.position)));
  const circle = circlePolygon(frame);
  if (safeSeeds.length === 0) return { cells: [], boundaries: [], pathAt: () => null };
  if (safeSeeds.length === 1) {
    const seed = safeSeeds[0];
    if (seed === undefined) return { cells: [], boundaries: [], pathAt: () => null };
    const cell = { id: seed.id, path: seed.path, points: circle, center: seed.position };
    return {
      cells: [cell],
      boundaries: regionBoundaries([cell]),
      pathAt: (point) => isInside(point, circle) ? seed.path : null
    };
  }

  const delaunay = Delaunay.from(
    safeSeeds,
    (seed) => seed.position.x,
    (seed) => seed.position.y
  );
  const { center, radius } = frame;
  const voronoi = delaunay.voronoi([
    center.x - radius,
    center.y - radius,
    center.x + radius,
    center.y + radius
  ]);
  const cells: RegionCell[] = [];
  for (let index = 0; index < safeSeeds.length; index += 1) {
    const seed = safeSeeds[index];
    const polygon = voronoi.cellPolygon(index);
    if (seed === undefined) continue;
    const points = clipToCircle(openPolygon(polygon), circle);
    if (points.length < 3) continue;
    cells.push({ id: seed.id, path: seed.path, points, center: seed.position });
  }
  return {
    cells,
    boundaries: regionBoundaries(cells),
    pathAt: (point) => {
      if (Math.hypot(point.x - center.x, point.y - center.y) > radius) return null;
      return safeSeeds[delaunay.find(point.x, point.y)]?.path ?? null;
    }
  };
}
