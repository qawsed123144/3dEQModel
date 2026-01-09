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
    width: number;
    height: number;
    zoom: number;
}

//Props
export type elevationAtXYProps = {
    x: number,
    y: number,
    elevImageData: ImageData | null,
    elevMeta: ElevMeta | null,
    terrainExaggeration: number
}
export type buildWallProps = {
    alongConst: number,
    axis: 'x' | 'y'
    elevImageData: ImageData | null,
    elevMeta: ElevMeta | null,
    depthRange: number,
    wallsGroup: THREE.Group,
}
export type buildWallsProps = {
    elevImageData: ImageData | null,
    elevMeta: ElevMeta | null,
    depthRange: number,
    wallsGroup: THREE.Group,
}
export type terrainToPlaneProps = {
    elevImageData: ImageData | null,
    elevMeta: ElevMeta | null,
    planeGeo: THREE.PlaneGeometry,
}
export type onPointerMoveProps = {
    points: Earthquake[];
    spheres: THREE.InstancedMesh;
    pointer: THREE.Vector2;
    raycaster: THREE.Raycaster;
    tooltipRef: React.RefObject<HTMLDivElement | null>;
    camera: THREE.PerspectiveCamera;
}

export type MapProps = {
    data: Earthquake[];
}
export type ThreeSetupProps = {
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
}
export type TerrianProps = {
    rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
    worldRef: React.RefObject<THREE.Group | null>;
    depthRange: number;
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

export type EarthquakeApi = {
    lat: number;
    lon: number;
    depth_km: number | null;
    magnitude: number | null;
    time: string;
};