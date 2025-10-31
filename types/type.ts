export type Earthquake = {
    lat: number;
    lon: number;
    depth: number;
    amplitude: number;
    time: string;
};

export type Bounds = {
    lonMin: number;
    lonMax: number;
    latMin: number;
    latMax: number;
}

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

//test data
export type GeoJSONPoint = {
    type: "Point";
    coordinates: [number, number, number?];
};

export type GeoJSONFeature = {
    type: "Feature";
    geometry: GeoJSONPoint;
    properties: {
        time: string;
        depth_km: number;
        magnitude: number;
        event_id: string;
    };
};

export type GeoJSONCollection = {
    type: "FeatureCollection";
    features: GeoJSONFeature[];
};