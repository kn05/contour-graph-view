export class GenGate {
  private gen = 0;

  next(): number {
    this.gen += 1;
    return this.gen;
  }

  invalidate(): void {
    this.gen += 1;
  }

  isCurrent(gen: number): boolean {
    return gen === this.gen;
  }
}
