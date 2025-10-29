export type Earthquake = {
    lat: number;
    lon: number;
    depth: number;
    amplitude: number;
    time: Date;
};

export type MapProps = {
    data: Earthquake[];
    height: number;
    targetDepthKm: number
    depthExaggeration: number;
    terrainExaggeration: number;
};

export type elevMeta = {
    tileXMin: number;
    tileYMin: number;
    tileSize: number;
    cols: number;
    rows: number;
    width: number;
    height: number;
    zoom: number
}