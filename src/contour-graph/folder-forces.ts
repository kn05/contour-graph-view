import {
  ROOT_FOLDER,
  SEPARATION_OPTS,
  VIRTUAL_LINK_OPTS
} from "./constants";
import { normalizeFolder, parentFolder, topFolder } from "./folders";
import type { Point } from "./types";

export interface FolderPoint extends Point {
  id: string;
  folder: string;
  isAnchor: boolean;
  isFixed: boolean;
}

interface FolderBox {
  path: string;
  center: Point;
  halfWidth: number;
  halfHeight: number;
}

interface VirtualGroup {
  anchor: FolderPoint | null;
  nodes: FolderPoint[];
}

function clampShift(point: Point, max: number): Point {
  const distance = Math.hypot(point.x, point.y);
  if (distance <= max || distance === 0) return point;
  const ratio = max / distance;
  return { x: point.x * ratio, y: point.y * ratio };
}

function frameScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  return Math.min(VIRTUAL_LINK_OPTS.maxFrameScale, scale);
}

function addShift(shifts: Map<string, Point>, id: string, x: number, y: number): void {
  const shift = shifts.get(id) ?? { x: 0, y: 0 };
  shifts.set(id, { x: shift.x + x, y: shift.y + y });
}

function buildBoxes(points: readonly FolderPoint[]): FolderBox[] {
  const groups = new Map<string, { nodes: FolderPoint[]; hasAnchor: boolean }>();
  for (const point of points) {
    const path = topFolder(point.folder);
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
  strength: number,
  scale = 1
): Map<string, Point> {
  const frame = frameScale(scale);
  if (!Number.isFinite(strength) || strength <= 0 || frame === 0) return new Map();
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
      const dx = b.center.x - a.center.x;
      const dy = b.center.y - a.center.y;
      const overlapX = a.halfWidth + b.halfWidth + SEPARATION_OPTS.gap - Math.abs(dx);
      const overlapY = a.halfHeight + b.halfHeight + SEPARATION_OPTS.gap - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapX < overlapY) {
        const direction = dx === 0 ? (a.path.localeCompare(b.path) < 0 ? 1 : -1) : Math.sign(dx);
        const force = overlapX * strength * frame * 0.5;
        add(a, -direction * force, 0);
        add(b, direction * force, 0);
      } else {
        const direction = dy === 0 ? (a.path.localeCompare(b.path) < 0 ? 1 : -1) : Math.sign(dy);
        const force = overlapY * strength * frame * 0.5;
        add(a, 0, -direction * force);
        add(b, 0, direction * force);
      }
    }
  }

  const result = new Map<string, Point>();
  const max = SEPARATION_OPTS.maxShift * frame;
  for (const box of boxes) {
    result.set(box.path, clampShift(shifts.get(box.path) ?? { x: 0, y: 0 }, max));
  }
  return result;
}

export function buildVirtualLinkShifts(
  points: readonly FolderPoint[],
  strength: number,
  scale = 1
): Map<string, Point> {
  const frame = frameScale(scale);
  if (!Number.isFinite(strength) || strength <= 0 || frame === 0) return new Map();
  const groups = new Map<string, VirtualGroup>();
  const anchors = new Map<string, FolderPoint>();
  for (const point of points) {
    const path = normalizeFolder(point.folder);
    const group = groups.get(path) ?? { anchor: null, nodes: [] };
    if (point.isAnchor) {
      group.anchor = point;
      anchors.set(path, point);
    } else {
      group.nodes.push(point);
    }
    groups.set(path, group);
  }

  const shifts = new Map<string, Point>();
  const max = VIRTUAL_LINK_OPTS.maxNodeShift * frame;
  const pull = strength * VIRTUAL_LINK_OPTS.pullFactor * frame;
  for (const group of groups.values()) {
    const anchor = group.anchor;
    if (anchor === null || group.nodes.length === 0) continue;
    let anchorX = 0;
    let anchorY = 0;
    for (const node of group.nodes) {
      if (node.isFixed) continue;
      const dx = anchor.x - node.x;
      const dy = anchor.y - node.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) continue;
      const move = Math.min(max, distance * pull);
      const shift = { x: dx / distance * move, y: dy / distance * move };
      addShift(shifts, node.id, shift.x, shift.y);
      anchorX -= shift.x / group.nodes.length;
      anchorY -= shift.y / group.nodes.length;
    }
    if (!anchor.isFixed) {
      const shift = clampShift(
        { x: anchorX, y: anchorY },
        VIRTUAL_LINK_OPTS.maxAnchorShift * frame
      );
      if (shift.x !== 0 || shift.y !== 0) addShift(shifts, anchor.id, shift.x, shift.y);
    }
  }

  const childCounts = new Map<string, number>();
  for (const path of anchors.keys()) {
    if (path === ROOT_FOLDER) continue;
    const parent = parentFolder(path);
    if (anchors.has(parent)) childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
  }
  const parentPull = pull * VIRTUAL_LINK_OPTS.parentFactor;
  const parentMax = VIRTUAL_LINK_OPTS.maxParentShift * frame;
  for (const [path, child] of anchors) {
    if (path === ROOT_FOLDER || child.isFixed) continue;
    const parentPath = parentFolder(path);
    const parent = anchors.get(parentPath);
    if (parent === undefined) continue;
    const dx = parent.x - child.x;
    const dy = parent.y - child.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;
    const move = Math.min(parentMax, distance * parentPull);
    const shift = { x: dx / distance * move, y: dy / distance * move };
    addShift(shifts, child.id, shift.x, shift.y);
    if (!parent.isFixed) {
      const count = childCounts.get(parentPath) ?? 1;
      addShift(shifts, parent.id, -shift.x / count, -shift.y / count);
    }
  }
  return shifts;
}
