import concaveman from "concaveman";
import {
  CONTOUR_CONCAVITY,
  CONTOUR_SMOOTH_STEPS,
  CONTOUR_STYLE,
  MAX_CONTOUR_VERTICES,
  MAX_CONTOUR_ALPHA,
  MIN_CONTOUR_ALPHA
} from "./constants";
import type { Point } from "./types";

export function contourAlpha(depth: number, maxDepth: number, opacity: number): number {
  const range = Math.max(1, maxDepth);
  const factor = CONTOUR_STYLE.parentAlpha + depth / range * CONTOUR_STYLE.childAlpha;
  return Math.min(MAX_CONTOUR_ALPHA, Math.max(MIN_CONTOUR_ALPHA, opacity * factor));
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

function limitPoints(points: readonly Point[]): Point[] {
  if (points.length <= MAX_CONTOUR_VERTICES) return [...points];
  const step = Math.ceil(points.length / MAX_CONTOUR_VERTICES);
  return points.filter((_, index) => index % step === 0);
}

function smoothPoints(points: readonly Point[]): Point[] {
  let current = limitPoints(points);
  for (let run = 0; run < CONTOUR_SMOOTH_STEPS; run += 1) {
    if (current.length * 2 > MAX_CONTOUR_VERTICES) break;
    const next: Point[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const point = current[index];
      const after = current[(index + 1) % current.length];
      if (point === undefined || after === undefined) continue;
      next.push(
        { x: point.x * 0.75 + after.x * 0.25, y: point.y * 0.75 + after.y * 0.25 },
        { x: point.x * 0.25 + after.x * 0.75, y: point.y * 0.25 + after.y * 0.75 }
      );
    }
    current = next;
  }
  return current;
}

export function buildContour(points: readonly Point[], minEdge = 0): Point[] {
  if (points.length < 3) return [];
  const pairs = points.map((point): [number, number] => [point.x, point.y]);
  const hull = concaveman(pairs, CONTOUR_CONCAVITY, minEdge);
  const polygon: Point[] = [];
  for (const pair of hull) {
    const x = pair[0];
    const y = pair[1];
    if (x !== undefined && y !== undefined) polygon.push({ x, y });
  }
  const first = polygon[0];
  const last = polygon.at(-1);
  if (first !== undefined && first.x === last?.x && first.y === last.y) {
    polygon.pop();
  }
  return smoothPoints(polygon);
}

export function buildContourPath(points: readonly Point[]): Path2D {
  const path = new Path2D();
  if (points.length < 3) return path;
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return path;
  path.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (point === undefined || next === undefined) continue;
    path.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  path.closePath();
  return path;
}

export function paintContour(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  alpha: number,
  isActive: boolean
): void {
  ctx.save();
  ctx.globalAlpha = isActive ? Math.min(MAX_CONTOUR_ALPHA, alpha * CONTOUR_STYLE.activeFill) : alpha;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.globalAlpha = isActive
    ? CONTOUR_STYLE.activeStroke
    : Math.min(CONTOUR_STYLE.strokeAlpha, alpha * CONTOUR_STYLE.strokeFactor);
  ctx.lineWidth = isActive ? CONTOUR_STYLE.activeWidth : CONTOUR_STYLE.idleWidth;
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.restore();
}
