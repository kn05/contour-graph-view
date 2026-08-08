declare module "d3-voronoi-map" {
  export type VoronoiPoint = [number, number];

  interface MapPoint<T> {
    data: {
      originalData: T;
    };
  }

  export interface VoronoiPolygon<T> extends Array<VoronoiPoint> {
    site: {
      originalObject: MapPoint<T>;
    };
  }

  export interface VoronoiMapState<T> {
    ended: boolean;
    iterationCount: number;
    convergenceRatio: number;
    polygons: (VoronoiPolygon<T> | undefined)[];
  }

  export interface VoronoiMapSimulation<T> {
    tick: () => void;
    stop: () => VoronoiMapSimulation<T>;
    weight: (accessor: (datum: T) => number) => VoronoiMapSimulation<T>;
    convergenceRatio: (ratio: number) => VoronoiMapSimulation<T>;
    maxIterationCount: (count: number) => VoronoiMapSimulation<T>;
    minWeightRatio: (ratio: number) => VoronoiMapSimulation<T>;
    clip: (polygon: VoronoiPoint[]) => VoronoiMapSimulation<T>;
    prng: (random: () => number) => VoronoiMapSimulation<T>;
    initialPosition: (
      accessor: (datum: T, index: number, data: T[]) => VoronoiPoint
    ) => VoronoiMapSimulation<T>;
    state: () => VoronoiMapState<T>;
  }

  export function voronoiMapSimulation<T>(data: T[]): VoronoiMapSimulation<T>;
}
