import * as THREE from "three";

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

export type ElevMeta = {
    tileXMin: number;
    tileYMin: number;
    cols: number;
    rows: number;
    width: number;
    height: number;
    zoom: number
}

//Props
export type MapProps = {
    data: Earthquake[];
}
export type ThreeSetupProps = {
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
}

export type TerrianProps = {
    rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
    worldRef: React.RefObject<THREE.Group | null>;
    depthMax: number;
}

export type EQPointsProps = {
    worldRef: React.RefObject<THREE.Group | null>;
    cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
    rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
    tooltipRef: React.RefObject<HTMLDivElement | null>;
    EQData: Earthquake[];
    depthMax: number;
}

export type GuiControlsProps = {
    worldRef: React.RefObject<THREE.Group | null>;
    controlsUiRef: React.RefObject<HTMLDivElement | null>;
    scaleSet: {
        scaleX: number;
        scaleY: number;
        scaleZ: number;
    }
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