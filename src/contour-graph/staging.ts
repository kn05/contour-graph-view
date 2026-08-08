import { STAGE_OPTS } from "./constants";
import type { GraphModel } from "./types";

export function planNodeStage(model: GraphModel): string[] {
  const visible = model.nodes.filter((node) => !node.hidden);
  if (visible.length < STAGE_OPTS.minNodes) return [];
  const nodes = visible.filter((node) => !node.fixed);
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of model.edges) {
    if (edge.hidden) continue;
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return nodes.sort((left, right) => {
    const gap = (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0);
    return gap === 0 ? left.id.localeCompare(right.id) : gap;
  }).map((node) => node.id);
}

export function stageBatchSize(count: number): number {
  if (count <= 0) return 0;
  if (count <= STAGE_OPTS.singleNodeLimit) return 1;
  return Math.min(STAGE_OPTS.maxBatch, Math.max(1, Math.ceil(count / STAGE_OPTS.targetSteps)));
}
