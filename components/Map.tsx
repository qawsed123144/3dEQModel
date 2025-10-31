import { useEffect, useMemo, useRef, useState } from "react";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";

import type { elevMeta, Earthquake, Bounds } from "@/types/type";
import { overlay } from "three/tsl";

function degreeToRadian(degree: number) {
    return degree * Math.PI / 180
}
function lonLatToXY(lon: number, lat: number) {
    const R = EARTH_RADIUS
    const radianX = degreeToRadian(lon)
    const radianY = degreeToRadian(lat)

    const x = R * radianX
    const y = R * Math.log(Math.tan(Math.PI / 4 + radianY / 2));
    return { x, y }
}
function xyToLonLat(x: number, y: number) {
    const R = EARTH_RADIUS

    const lon = (x / R) * (180 / Math.PI)
    const lat = (Math.atan(Math.sinh(y / R)) * 180) / Math.PI;
    return { lon, lat }
}
function lonLatToMapXY(lon: number, lat: number) {
    const { x, y } = lonLatToXY(lon, lat);
    return { x: x - mapOrigin.x, y: y - mapOrigin.y };
}
function mapXYToLonLat(x: number, y: number) {
    const absX = mapOrigin.x + x;
    const absY = mapOrigin.y + y;
    return xyToLonLat(absX, absY);
}

function lonLatToGlobalPixel(lon: number, lat: number, zoom: number, tileSize: number) {
    const n = Math.pow(2, zoom);
    const x = ((lon + 180) / 360) * n * tileSize;
    const radianLat = degreeToRadian(lat);
    const y = ((1 - Math.log(Math.tan(radianLat) + 1 / Math.cos(radianLat)) / Math.PI) / 2) * n * tileSize;
    return { x, y };
}
function lonLatToTileIdx(lon: number, lat: number, zoom: number) {
    const numTiles = Math.pow(2, zoom);
    const tileXIdx = Math.floor((lon + 180) / 360 * numTiles);
    const tileYIdx = Math.floor(
        ((1 - Math.log(Math.tan(degreeToRadian(lat)) + 1 / Math.cos(degreeToRadian(lat))) / Math.PI) / 2) * numTiles
    );
    return { tileXIdx, tileYIdx };
}
function boundsToMapSize(BOUNDS: Bounds) {
    const { x: xmin, y: ymin } = lonLatToXY(BOUNDS.lonMin, BOUNDS.latMin);
    const { x: xmax, y: ymax } = lonLatToXY(BOUNDS.lonMax, BOUNDS.latMax);
    const mapWidth = Math.abs(xmax - xmin)
    const mapHeight = Math.abs(ymax - ymin)
    return { mapWidth, mapHeight }
}

function elevationAtXY(x: number, y: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, terrainExaggeration: number): number {
    if (!elevMeta || !elevImageData) return 0;

    const { lon, lat } = mapXYToLonLat(x, y);
    const gp = lonLatToGlobalPixel(lon, lat, elevMeta.zoom, elevMeta.tileSize);
    const xM = Math.max(0, Math.min(elevMeta.width - 1, Math.floor(gp.x - elevMeta.tileXMin * elevMeta.tileSize)));
    const yM = Math.max(0, Math.min(elevMeta.height - 1, Math.floor(gp.y - elevMeta.tileYMin * elevMeta.tileSize)));
    const idx = (yM * elevMeta.width + xM) * 4;
    const r = elevImageData.data[idx + 0];
    const g = elevImageData.data[idx + 1];
    const b = elevImageData.data[idx + 2];
    const meters = (r * 256 + g + b / 256) - 32768;
    return meters / 1000 * terrainExaggeration;
}

function loadImage(srcUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.crossOrigin = "anonymous"
        image.onload = () => resolve(image)
        image.onerror = (e) => reject(e)
        image.src = srcUrl
    })
}
function prepareLoadTiles(detail: number) {
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) throw new Error("canvas context is null")

    const topLeftTile = lonLatToTileIdx(BOUNDS.lonMin, BOUNDS.latMax, detail)
    const bottomRightTile = lonLatToTileIdx(BOUNDS.lonMax, BOUNDS.latMin, detail)
    const tileXMin = Math.min(topLeftTile.tileXIdx, bottomRightTile.tileXIdx)
    const tileXMax = Math.max(topLeftTile.tileXIdx, bottomRightTile.tileXIdx)
    const tileYMin = Math.min(topLeftTile.tileYIdx, bottomRightTile.tileYIdx)
    const tileYMax = Math.max(topLeftTile.tileYIdx, bottomRightTile.tileYIdx)


    const loadImagePromises: Promise<void>[] = []
    return { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises }
}
async function loadStatellite(renderer: THREE.WebGLRenderer) {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises } = prepareLoadTiles(satelliteDetail)
    const tileSize = 256

    canvas.width = (tileXMax - tileXMin + 1) * tileSize
    canvas.height = (tileYMax - tileYMin + 1) * tileSize

    for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
        for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
            const srcUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${satelliteDetail}/${tileY}/${tileX}`;
            const tileXOffset = (tileX - tileXMin) * tileSize
            const tileYOffset = (tileY - tileYMin) * tileSize

            loadImagePromises.push(
                loadImage(srcUrl).then((image) => {
                    context.drawImage(image, tileXOffset, tileYOffset, tileSize, tileSize)
                })
                    .catch(() => {
                        context.fillStyle = statelliteTileDefultColor;
                        context.fillRect(tileXOffset, tileYOffset, tileSize, tileSize)
                    })
            )

        }
    }
    await Promise.all(loadImagePromises)
    const topLeftPx = lonLatToGlobalPixel(BOUNDS.lonMin, BOUNDS.latMax, satelliteDetail, tileSize);
    const bottomRightPx = lonLatToGlobalPixel(BOUNDS.lonMax, BOUNDS.latMin, satelliteDetail, tileSize);
    const cropX = Math.round(topLeftPx.x - tileXMin * tileSize);
    const cropY = Math.round(topLeftPx.y - tileYMin * tileSize);
    const cropWidth = Math.round(bottomRightPx.x - topLeftPx.x);
    const cropHeight = Math.round(bottomRightPx.y - topLeftPx.y);
    let finalCanvas = canvas;
    if (cropWidth > 0 && cropHeight > 0) {
        const clipped = document.createElement("canvas");
        clipped.width = cropWidth;
        clipped.height = cropHeight;
        const clippedCtx = clipped.getContext("2d");
        if (clippedCtx) {
            clippedCtx.drawImage(
                canvas,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );
            finalCanvas = clipped;
        }
    }

    const texture = new THREE.Texture(finalCanvas)
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.needsUpdate = true;

    return texture
}
async function loadTerrarium() {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises } = prepareLoadTiles(elevationDetail)
    const cols = tileXMax - tileXMin + 1
    const rows = tileYMax - tileYMin + 1

    const tileSize = 256
    canvas.width = (tileXMax - tileXMin + 1) * tileSize;
    canvas.height = (tileYMax - tileYMin + 1) * tileSize;

    for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
        for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
            const srcUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${elevationDetail}/${tileX}/${tileY}.png`;
            const tileXOffset = (tileX - tileXMin) * tileSize
            const tileYOffset = (tileY - tileYMin) * tileSize

            loadImagePromises.push(
                loadImage(srcUrl).then((image) => {
                    context.drawImage(image, tileXOffset, tileYOffset, tileSize, tileSize)
                })
                    .catch(() => {
                        context.fillStyle = terrariumTileDefultColor;
                        context.fillRect(tileXOffset, tileYOffset, tileSize, tileSize)
                    })
            )
        }
    }
    await Promise.all(loadImagePromises)

    const elevImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const elevMeta = { tileXMin, tileYMin, tileSize, cols, rows, width: canvas.width, height: canvas.height, zoom: elevationDetail };

    return { elevImageData, elevMeta }
}

function buildWallX(xConst: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, depthRange: number, wallGroup: THREE.Group, wallGeos: THREE.BufferGeometry[], wallMeshes: THREE.Mesh[]) {
    const positions = [];
    const aT = [];
    const indices = [];
    for (let i = 0; i <= segmentsAlong; i++) {
        const t = i / segmentsAlong;
        const y = t * mapHeight;
        const topZ = elevationAtXY(xConst, y, elevImageData, elevMeta, terrainExaggeration);
        for (let j = 0; j <= segmentsDepth; j++) {
            const tz = j / segmentsDepth;
            const z = THREE.MathUtils.lerp(topZ, -depthRange, tz);
            positions.push(xConst, y, z);
            aT.push(tz);
        }
    }
    const row = segmentsDepth + 1;
    for (let i = 0; i < segmentsAlong; i++) {
        for (let j = 0; j < segmentsDepth; j++) {
            const a = i * row + j;
            const b = (i + 1) * row + j;
            const c = (i + 1) * row + (j + 1);
            const d = i * row + (j + 1);
            indices.push(a, b, d, b, c, d);
        }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    wallGeos.push(geom);
    const mesh = new THREE.Mesh(geom, wallMat);
    wallGroup.add(mesh);
    wallMeshes.push(mesh);
}
function buildWallY(yConst: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, depthRange: number, wallGroup: THREE.Group, wallGeos: THREE.BufferGeometry[], wallMeshes: THREE.Mesh[]) {
    const positions: number[] = [];
    const aT: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segmentsAlong; i++) {
        const t = i / segmentsAlong;
        const x = t * mapWidth;
        const topZ = elevationAtXY(x, yConst, elevImageData, elevMeta, terrainExaggeration);
        for (let j = 0; j <= segmentsDepth; j++) {
            const tz = j / segmentsDepth;
            const z = THREE.MathUtils.lerp(topZ, -depthRange, tz);
            positions.push(x, yConst, z);
            aT.push(tz);
        }
    }
    const row = segmentsDepth + 1;
    for (let i = 0; i < segmentsAlong; i++) {
        for (let j = 0; j < segmentsDepth; j++) {
            const a = i * row + j;
            const b = (i + 1) * row + j;
            const c = (i + 1) * row + (j + 1);
            const d = i * row + (j + 1);
            indices.push(a, b, d, b, c, d);
        }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    wallGeos.push(geom);
    const mesh = new THREE.Mesh(geom, wallMat);
    wallGroup.add(mesh);
    wallMeshes.push(mesh);
}
function polylineTopX(xConst: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, wallGroup: THREE.Group, wallGeos: THREE.BufferGeometry[], edgeGeos: THREE.BufferGeometry[]) {
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * mapHeight;
        const z = elevationAtXY(xConst, y, elevImageData, elevMeta, terrainExaggeration);
        positions.push(xConst, y, z);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}
function polylineTopY(yConst: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, wallGroup: THREE.Group, edgeGeos: THREE.BufferGeometry[]) {
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * mapWidth;
        const z = elevationAtXY(x, yConst, elevImageData, elevMeta, terrainExaggeration);
        positions.push(x, yConst, z);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}
function polylineBottomX(xConst: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, wallGroup: THREE.Group, edgeGeos: THREE.BufferGeometry[], depthRange: number) {
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * mapHeight;
        positions.push(xConst, y, -depthRange);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}
function polylineBottomY(yConst: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, wallGroup: THREE.Group, edgeGeos: THREE.BufferGeometry[], depthRange: number) {
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * mapWidth;
        positions.push(x, yConst, -depthRange);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}

function buildWalls(edgeGeos: THREE.BufferGeometry[], wallGroup: THREE.Group, elevImageData: ImageData | null, elevMeta: elevMeta | null, depthRange: number, wallGeos: THREE.BufferGeometry[] = [], wallMeshes: THREE.Mesh[] = []) {
    buildWallX(mapWidth, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    buildWallY(mapHeight, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    polylineTopX(mapWidth, elevImageData, elevMeta, wallGroup, wallGeos, edgeGeos);
    polylineTopY(mapHeight, elevImageData, elevMeta, wallGroup, edgeGeos);
    polylineBottomX(mapWidth, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange);
    polylineBottomY(mapHeight, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange);

    for (const [x, y] of corners) {
        const zTop = elevationAtXY(x, y, elevImageData, elevMeta, terrainExaggeration);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
            "position",
            new THREE.Float32BufferAttribute([x, y, zTop, x, y, -depthRange], 3)
        )
        edgeGeos.push(geo)
        const edgeLine = new THREE.Line(geo, edgeMat)
        wallGroup.add(edgeLine)
    }
}
function cleanWalls(wallGeos: THREE.BufferGeometry[], wallMeshes: THREE.Mesh[], edgeGeos: THREE.BufferGeometry[], wallGroup: THREE.Group, elevImageData: ImageData | null, elevMeta: elevMeta | null, depthRange: number) {
    wallGeos.forEach((g) => g.dispose());
    edgeGeos.forEach((g) => g.dispose());
    while (wallGroup.children.length) {
        wallGroup.remove(wallGroup.children[0])
    }
    wallGeos.length = 0;
    wallMeshes.length = 0;
    edgeGeos.length = 0
    buildWallX(0, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    buildWallY(0, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    polylineTopX(0, elevImageData, elevMeta, wallGroup, wallGeos, edgeGeos);
    polylineTopY(0, elevImageData, elevMeta, wallGroup, edgeGeos);
    polylineBottomX(0, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange,);
    polylineBottomY(0, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange);
}
function pointsTo3D(points: Earthquake[], positions: number[], radiuses: number[], spheres: THREE.InstancedMesh, depthMaxGrid: number
) {
    const dummy = new THREE.Object3D();

    points.forEach((point, index) => {
        const { x, y } = lonLatToMapXY(point.lon, point.lat);
        const z = - point.depth

        positions.push(x, y, z)
        const color = getEarthquakeColor(point.depth, depthMaxGrid)

        const radius = THREE.MathUtils.mapLinear(point.amplitude, 1, 7.0, 0.1, 10.0)
        radiuses.push(radius)

        dummy.position.set(x, y, z)
        dummy.scale.set(radius, radius, radius)
        dummy.updateMatrix()
        spheres.setMatrixAt(index, dummy.matrix)
        spheres.setColorAt(index, color)
    })
    spheres.count = points.length;
    spheres.instanceMatrix.needsUpdate = true;
    if (spheres.instanceColor) spheres.instanceColor.needsUpdate = true;
}
async function terrariumToPlane(elevImageData: ImageData | null, elevMeta: elevMeta | null, planeGeo: THREE.PlaneGeometry) {
    if (!elevImageData || !elevMeta) return;

    const posAttr = planeGeo.attributes.position
    for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i)
        const vy = posAttr.getY(i)

        const mapX = vx + mapWidth * 0.5
        const mapY = vy + mapHeight * 0.5

        const elev = elevationAtXY(mapX, mapY, elevImageData, elevMeta, terrainExaggeration)
        posAttr.setZ(i, elev);
    }
    posAttr.needsUpdate = true;
    planeGeo.computeVertexNormals();
}
function createGrid(depthMax: number): THREE.LineSegments | null {
    //Create Grid Verts
    const gridVerts = []

    //step
    const degStep = 1
    const latRef = (BOUNDS.latMax + BOUNDS.latMin) / 2
    const lonRef = (BOUNDS.lonMax + BOUNDS.lonMin) / 2
    const xStep = lonLatToXY(lonRef + degStep, latRef).x - lonLatToXY(lonRef, latRef).x
    const zStep = xStep // zStep 和 xStep (lon) 一樣大
    const depthLineCounts = Math.max(1, Math.ceil(depthMax / zStep));
    const depthLevels = depthLineCounts + 1;

    const startLon = Math.ceil(BOUNDS.lonMin);
    const endLon = Math.floor(BOUNDS.lonMax);
    const startLat = Math.ceil(BOUNDS.latMin);
    const endLat = Math.floor(BOUNDS.latMax);

    const lonSamples: number[] = [];
    const latSamples: number[] = [];
    lonSamples.push(BOUNDS.lonMin);
    for (let lon = startLon; lon <= endLon; lon += degStep) lonSamples.push(lon);
    lonSamples.push(BOUNDS.lonMax);
    latSamples.push(BOUNDS.latMin);
    for (let lat = startLat; lat <= endLat; lat += degStep) latSamples.push(lat);
    latSamples.push(BOUNDS.latMax);
    const lonCount = lonSamples.length;
    const latCount = latSamples.length;

    const points = Array.from({ length: latCount }, (_, latIdx) => {
        const lat = latSamples[latIdx];
        return lonSamples.map((lon) => lonLatToMapXY(lon, lat));
    });

    for (let latIdx = 0; latIdx < latCount; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonCount; lonIdx++) {
            const { x, y } = points[latIdx][lonIdx];
            gridVerts.push(x, y, 0, x, y, -depthMax);
        }
    }

    for (let lonIdx = 0; lonIdx < lonCount; lonIdx++) {
        for (let latIdx = 0; latIdx < latCount - 1; latIdx++) {
            const a = points[latIdx][lonIdx];
            const b = points[latIdx + 1][lonIdx];
            for (let i = 0; i < depthLevels; i++) {
                const depth = Math.min(depthMax, i * zStep);
                gridVerts.push(
                    a.x,
                    a.y,
                    -depth,
                    b.x,
                    b.y,
                    -depth
                );
            }
        }
    }

    for (let latIdx = 0; latIdx < latCount; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonCount - 1; lonIdx++) {
            const a = points[latIdx][lonIdx];
            const b = points[latIdx][lonIdx + 1];
            for (let i = 0; i < depthLevels; i++) {
                const depth = Math.min(depthMax, i * zStep);
                gridVerts.push(
                    a.x,
                    a.y,
                    -depth,
                    b.x,
                    b.y,
                    -depth
                );
            }
        }
    }
    //Create Grid
    const gridGeo = new THREE.BufferGeometry();
    const gridMat = new THREE.LineBasicMaterial({ color: gridBeneathColor, transparent: true, opacity: gridBeneathOpacity });
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridVerts, 3))
    return new THREE.LineSegments(gridGeo, gridMat);
}
function getEarthquakeColor(depth: number, depthMaxGrid: number) {
    const t = Math.min(1, depth / depthMaxGrid);
    const hue = 0.0 + 0.83 * t;
    const saturation = 0.95;
    const lightness = 0.3 - 0.25 * t;

    return new THREE.Color().setHSL(hue, saturation, lightness);
}

//
const planeMatColor = 0xffffff
const canvasBackground = 0xf8fafc
const statelliteTileDefultColor = "0xd6d3d1"
const terrariumTileDefultColor = "rgb(128,128,128)"

const wallColorTop = 0xcbb091
const wallColorBottom = 0x4e342e
const wallOpacityTop = 0.22
const wallOpacityBottom = 0.52
const edgeColor = 0x6d4c41
const edgeOpacity = 0.9

const gridBeneathColor = 0xcccccc
const gridBeneathOpacity = 0.35

const height = 560
const targetDepthKm = 100
const terrainExaggeration = 3

const EARTH_RADIUS = 6378.137;
const BOUNDS = {
    lonMin: 118,
    lonMax: 126,
    latMin: 20.0,
    latMax: 27.0,
};
const mapOrigin = lonLatToXY(BOUNDS.lonMin, BOUNDS.latMin);
const { mapWidth, mapHeight } = boundsToMapSize(BOUNDS)

const camera_fov = 45
const camera_near = 0.1
const camera_far = 5000

const satelliteDetail = 8
const elevationDetail = 5

const segmentsAlong = 48
const segmentsDepth = 24
const segments = 96

const wallMeshes: THREE.Mesh[] = []
const wallMat = new THREE.ShaderMaterial({
    uniforms: {
        uColorTop: { value: new THREE.Color(wallColorTop) },
        uColorBottom: { value: new THREE.Color(wallColorBottom) },
        uOpacityTop: { value: wallOpacityTop },
        uOpacityBottom: { value: wallOpacityBottom },
    },
    vertexShader: `
                attribute float aT;
                varying float vT;
                void main() {
                    vT = aT;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
    fragmentShader: `
                precision mediump float;
                varying float vT;
                uniform vec3 uColorTop;
                uniform vec3 uColorBottom;
                uniform float uOpacityTop;
                uniform float uOpacityBottom;
                void main() {
                    vec3 color = mix(uColorTop, uColorBottom, vT);
                    float alpha = mix(uOpacityTop, uOpacityBottom, vT);
                    gl_FragColor = vec4(color, alpha);
                }
            `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
});
const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor, opacity: edgeOpacity, transparent: true });
const corners = [
    [0, 0], [mapWidth, 0], [0, mapHeight], [mapWidth, mapHeight]
]

const earthquakePositions: number[] = []
const earthquakeRadiuses: number[] = []

export default function Map({ data }: { data: Earthquake[] }) {
    const initializedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const worldRef = useRef<THREE.Group | null>(null);
    const controlsUiRef = useRef<HTMLDivElement | null>(null);

    let grid: THREE.LineSegments | null = null;
    let texture: THREE.Texture | null = null;
    let spheres: THREE.InstancedMesh | null = null;
    let sphereGeo: THREE.SphereGeometry | null = null;
    let sphereMat: THREE.MeshBasicMaterial | THREE.MeshPhongMaterial | null = null;
    const wallGeos: THREE.BufferGeometry[] = []
    let wallsGroup: THREE.Group | null = null;
    const edgeGeos: THREE.BufferGeometry[] = []
    let rafId = 0

    const [width, setWidth] = useState(800);

    const scaleSet = { scaleX: 1, scaleY: 1, scaleZ: 1 }
    const earthquakePoints = useMemo(() => (data), [data]);
    const depthMax = Math.max(350, ...earthquakePoints.map((p) => p.depth));

    // 監聽容器大小
    useEffect(() => {
        if (!containerRef.current) return;

        const resize = new ResizeObserver((entries) => {
            for (const e of entries) {
                const w = Math.floor(e.contentRect.width);
                if (w > 0) setWidth(w);
            }
        })
        resize.observe(containerRef.current);
        return () => resize.disconnect();
    }, [])

    // Three.js
    useEffect(() => {
        if (initializedRef.current) return;
        if (!canvasRef.current) return;
        initializedRef.current = true;

        //Scence
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(canvasBackground)

        //World: 圖層容器
        const world = new THREE.Group()
        world.scale.set(1, 1, 1)
        scene.add(world)
        worldRef.current = world

        //Renderer
        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            antialias: true,
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)

        //Plane： 圖層
        const planeGeo = new THREE.PlaneGeometry(mapWidth, mapHeight, 100, 100)
        const planeMat = new THREE.MeshBasicMaterial({
            color: planeMatColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        })
        const plane = new THREE.Mesh(planeGeo, planeMat)
        plane.position.set(mapWidth * 0.5, mapHeight * 0.5, 0)
        world.add(plane)

        //Load Statellite
        loadStatellite(renderer).then((newTexture) => {
            if (newTexture) {
                texture?.dispose()
                planeMat.map?.dispose()

                texture = newTexture
                plane.material.map = newTexture
                plane.material.needsUpdate = true
            }
        })

        //Grid beneath
        grid = createGrid(depthMax)
        if (grid) world.add(grid);

        //3D EQ Points
        sphereGeo = new THREE.SphereGeometry(1, 12, 10);
        const vertexCount = sphereGeo.attributes.position.count;
        const baseColors = new Float32Array(vertexCount * 3).fill(1);
        sphereGeo.setAttribute("color", new THREE.BufferAttribute(baseColors, 3));
        sphereMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
        sphereMat.needsUpdate = true;
        spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, earthquakePoints.length);
        spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pointsTo3D(earthquakePoints, earthquakePositions, earthquakeRadiuses, spheres, depthMax)
        sphereMat.needsUpdate = true;
        world.add(spheres)

        //Camera
        const camera = new THREE.PerspectiveCamera(camera_fov, width / height, camera_near, camera_far)
        camera.position.set(mapWidth * 0.5, -mapHeight * 0.8, Math.max(mapWidth, mapHeight) * 1.2)
        camera.lookAt(new THREE.Vector3(mapWidth * 0.5, mapHeight * 0.5, 0));
        camera.up.set(0, 0, 1)

        //Controls: 軌道控制器
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.target.set(mapWidth * 0.5, mapHeight * 0.5, targetDepthKm)
        controls.maxDistance = Math.max(mapWidth, mapHeight) * 3;
        controls.screenSpacePanning = true;
        controls.enableDamping = true

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(1, 1, 2);
        scene.add(dir);

        //Animate: 開始渲染
        const animate = () => {
            rafId = requestAnimationFrame(animate)
            controls.update()
            renderer.render(scene, camera)
        }
        animate();

        (async () => {
            // Load Terrarium then Update
            const { elevImageData, elevMeta } = await loadTerrarium();
            terrariumToPlane(elevImageData, elevMeta, planeGeo)

            //Wall
            wallsGroup = new THREE.Group();
            cleanWalls(wallGeos, wallMeshes, edgeGeos, wallsGroup, elevImageData, elevMeta, depthMax)
            buildWalls(edgeGeos, wallsGroup, elevImageData, elevMeta, depthMax)
            world.add(wallsGroup);
        }
        )()

        //Clean up
        return () => {
            cancelAnimationFrame(rafId)
            controls.dispose()
            plane.material.dispose()
            planeMat.map?.dispose();

            texture?.dispose();
            texture = null;

            if (spheres) {
                spheres.geometry.dispose();
                world.remove(spheres);
            }
            if (grid) {
                grid.geometry.dispose();
                world.remove(grid);
            }

            wallGeos.forEach((g) => g.dispose());
            edgeGeos.forEach((g) => g.dispose());
            if (wallsGroup) {
                wallsGroup.remove(wallsGroup.children[0])
                world.remove(wallsGroup)
                wallsGroup = null
            }

            renderer.dispose();
        }
    }, [])

    //ScaleSet GUI
    useEffect(() => {
        if (!controlsUiRef.current) return;
        controlsUiRef.current.innerHTML = ""

        const gui = new GUI({
            container: controlsUiRef.current,
            width: 220
        });

        const setScale = () => {
            if (worldRef.current) {
                worldRef.current.scale.set(scaleSet.scaleX, scaleSet.scaleY, scaleSet.scaleZ);
            }
        };

        gui.add(scaleSet, "scaleX", 0.5, 3, 0.01).name("X scale").onChange(setScale);
        gui.add(scaleSet, "scaleY", 0.5, 3, 0.01).name("Y scale").onChange(setScale);
        gui.add(scaleSet, "scaleZ", 0.5, 3, 0.01).name("Z scale").onChange(setScale);

        setScale()

        //Clean up
        return () => gui.destroy();

        //Dependencies
    }, [scaleSet])

    return (
        <>
            <div ref={containerRef} className="container">
                <canvas ref={canvasRef} className="canvas" />
                <div ref={controlsUiRef} className="controlsUi" />
            </div>

            <style jsx>{`
                .container {
                    position: relative;
                    width: 100%;
                }

                .canvas {
                    display: block;
                    width: 100%;
                    height: 100%;
                }
                
                .controlsUi {
                    position: absolute;
                    right: 12px;
                    top: 12px;

                    z-index: 5;
                    padding: 8px;
                    user-select: none;
                    backdrop-filter: blur(4px);

                    background: rgba(255, 255, 255, 0.85);
                    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
                    border: 1px solid #ddd;
                    border-radius: 6px;
                }
            `}</style>
        </>
    )
}
