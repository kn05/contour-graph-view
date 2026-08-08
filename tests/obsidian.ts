interface TagRef {
  tag: string;
}

interface CacheRef {
  tags?: TagRef[];
}

export function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/").replace(/^\.\//u, "");
}

export function getAllTags(cache: CacheRef): string[] | null {
  return cache.tags?.map((tag) => tag.tag) ?? null;
}
