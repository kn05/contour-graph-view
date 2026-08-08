import { ROOT_FOLDER, SEPARATION_OPTS } from "./constants";
import { normalizeFolder } from "./folders";
import type { Point } from "./types";

export interface FolderPoint extends Point {
  id: string;
  folder: string;
  isAnchor: boolean;
}

interface FolderBox {
  path: string;
  center: Point;
  halfWidth: number;
  halfHeight: number;
}

function isNested(left: string, right: string): boolean {
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function clampShift(point: Point): Point {
  const distance = Math.hypot(point.x, point.y);
  if (distance <= SEPARATION_OPTS.maxShift || distance === 0) return point;
  const ratio = SEPARATION_OPTS.maxShift / distance;
  return { x: point.x * ratio, y: point.y * ratio };
}

function buildBoxes(points: readonly FolderPoint[]): FolderBox[] {
  const groups = new Map<string, { nodes: FolderPoint[]; hasAnchor: boolean }>();
  for (const point of points) {
    const path = normalizeFolder(point.folder);
    if (path === ROOT_FOLDER) continue;
    const group = groups.get(path) ?? { nodes: [], hasAnchor: false };
    if (point.isAnchor) group.hasAnchor = true;
    else group.nodes.push(point);
    groups.set(path, group);
  }

  const boxes: FolderBox[] = [];
  for (const [path, group] of groups) {
    if (!group.hasAnchor || group.nodes.length === 0) continue;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of group.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    boxes.push({
      path,
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      halfWidth: (maxX - minX) / 2,
      halfHeight: (maxY - minY) / 2
    });
  }
  return boxes.sort((left, right) => {
    const gap = left.center.x - left.halfWidth - (right.center.x - right.halfWidth);
    return gap === 0 ? left.path.localeCompare(right.path) : gap;
  });
}

export function buildFolderShifts(
  points: readonly FolderPoint[],
  strength: number
): Map<string, Point> {
  if (!Number.isFinite(strength) || strength <= 0) return new Map();
  const boxes = buildBoxes(points);
  const shifts = new Map<string, Point>();
  const add = (box: FolderBox, x: number, y: number): void => {
    const shift = shifts.get(box.path) ?? { x: 0, y: 0 };
    shifts.set(box.path, { x: shift.x + x, y: shift.y + y });
  };

  for (let left = 0; left < boxes.length; left += 1) {
    const a = boxes[left];
    if (a === undefined) continue;
    let neighbors = 0;
    for (let right = left + 1; right < boxes.length; right += 1) {
      const b = boxes[right];
      if (b === undefined) continue;
      const rightEdge = a.center.x + a.halfWidth + SEPARATION_OPTS.gap;
      const leftEdge = b.center.x - b.halfWidth;
      if (leftEdge > rightEdge || neighbors >= SEPARATION_OPTS.maxNeighbors) break;
      neighbors += 1;
      if (isNested(a.path, b.path)) continue;
      const dx = b.center.x - a.center.x;
      const dy = b.center.y - a.center.y;
      const overlapX = a.halfWidth + b.halfWidth + SEPARATION_OPTS.gap - Math.abs(dx);
      const overlapY = a.halfHeight + b.halfHeight + SEPARATION_OPTS.gap - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapX < overlapY) {
        const direction = dx === 0 ? (a.path.localeCompare(b.path) < 0 ? 1 : -1) : Math.sign(dx);
        const force = overlapX * strength * 0.5;
        add(a, -direction * force, 0);
        add(b, direction * force, 0);
      } else {
        const direction = dy === 0 ? (a.path.localeCompare(b.path) < 0 ? 1 : -1) : Math.sign(dy);
        const force = overlapY * strength * 0.5;
        add(a, 0, -direction * force);
        add(b, 0, direction * force);
      }
    }
  }

  const result = new Map<string, Point>();
  for (const box of boxes) {
    const shift = clampShift(shifts.get(box.path) ?? { x: 0, y: 0 });
    result.set(box.path, shift);
  }
  return result;
}
