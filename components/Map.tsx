import React, { useEffect, useMemo, useRef, useState } from "react";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";

import type { MapProps, elevMeta, Earthquake } from "@/lib/type";

function generateSampleEQ(n: number = 500): Earthquake[] {
    const points: Earthquake[] = [];
    for (let i = 0; i < n; i++) {
        const lat = THREE.MathUtils.lerp(Bounds.latMin, Bounds.latMax, Math.random());
        const lon = THREE.MathUtils.lerp(Bounds.lonMin, Bounds.lonMax, Math.random());
        const depth = Math.pow(Math.random(), 0.6) * 150;
        const amplitude = 3 + Math.random() * 3;
        points.push({ lat, lon, depth, amplitude, time: new Date(Date.now() - Math.random() * 1e9) });
    }
    return points;
}

function degreeToRadian(degree: number) {
    return degree * Math.PI / 180
}

function kmPerDegree(lat: number) {
    const PI = Math.PI;
    const cos = Math.cos;

    const phi = (lat * PI) / 180;
    const kmPerLat = (111132.954 - 559.822 * cos(2 * phi) + 1.175 * cos(4 * phi)) / 1000;
    const kmPerLon = (111412.84 * cos(phi) - 93.5 * cos(3 * phi) + 0.118 * cos(5 * phi)) / 1000;
    return { kmPerLat, kmPerLon }
}
function lonLatToXY(lon: number, lat: number) {
    const lat0 = (Bounds.latMin + Bounds.latMax) / 2;
    const { kmPerLat, kmPerLon } = kmPerDegree(lat0)
    const x = (lon - Bounds.lonMin) * kmPerLon
    const y = (lat - Bounds.latMin) * kmPerLat
    return { x, y }
}
function xyToLonLat(x: number, y: number) {
    const lat0 = (Bounds.latMin + Bounds.latMax) / 2;
    const { kmPerLat, kmPerLon } = kmPerDegree(lat0);
    const lon = Bounds.lonMin + x / kmPerLon;
    const lat = Bounds.latMin + y / kmPerLat;
    return { lon, lat };
}
function lonLatToGlobalPixel(lon: number, lat: number, zoom: number, tileSize: number) {
    const n = Math.pow(2, zoom);
    const x = ((lon + 180) / 360) * n * tileSize;
    const latRad = (lat * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * tileSize;
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


function sampleElevationKmAtXY(x: number, y: number, elevImageData: ImageData | null, elevMeta: elevMeta | null): number {
    if (!elevMeta || !elevImageData) return 0;

    const { lon, lat } = xyToLonLat(x, y);
    const gp = lonLatToGlobalPixel(lon, lat, elevMeta.zoom, elevMeta.tileSize);
    const xM = Math.max(0, Math.min(elevMeta.width - 1, Math.floor(gp.x - elevMeta.tileXMin * elevMeta.tileSize)));
    const yM = Math.max(0, Math.min(elevMeta.height - 1, Math.floor(gp.y - elevMeta.tileYMin * elevMeta.tileSize)));
    const idx = (yM * elevMeta.width + xM) * 4;
    const r = elevImageData.data[idx + 0];
    const g = elevImageData.data[idx + 1];
    const b = elevImageData.data[idx + 2];
    const meters = (r * 256 + g + b / 256) - 32768;
    return meters / 1000;
}

function toCurved(planeGeo: THREE.PlaneGeometry) {
    const posAttr = planeGeo.attributes.position;

    for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i)
        const vy = posAttr.getY(i)

        const r = Math.hypot(vx, vy)
        const R = earthRaiusKm
        const sag = R - Math.sqrt(R * R - r * r)

        posAttr.setZ(i, -sag);
    }

    posAttr.needsUpdate = true;
    planeGeo.computeVertexNormals();
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
function prepareLoadTiles() {
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) throw new Error("canvas context is null")

    const topLeftTile = lonLatToTileIdx(Bounds.lonMin, Bounds.latMax, satelliteDetail)
    const bottomRightTile = lonLatToTileIdx(Bounds.lonMax, Bounds.latMin, satelliteDetail)
    const tileXMin = Math.min(topLeftTile.tileXIdx, bottomRightTile.tileXIdx)
    const tileXMax = Math.max(topLeftTile.tileXIdx, bottomRightTile.tileXIdx)
    const tileYMin = Math.min(topLeftTile.tileYIdx, bottomRightTile.tileYIdx)
    const tileYMax = Math.max(topLeftTile.tileYIdx, bottomRightTile.tileYIdx)


    const loadImagePromises: Promise<void>[] = []
    return { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises }
}
async function loadStatellite(renderer: THREE.WebGLRenderer) {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises } = prepareLoadTiles()

    const tileSize = 256
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

    canvas.width = (tileXMax - tileXMin + 1) * tileSize
    canvas.height = (tileYMax - tileYMin + 1) * tileSize
    const texture = new THREE.Texture(canvas)
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.needsUpdate = true;

    return texture
}
async function loadTerrarium() {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises } = prepareLoadTiles()
    const cols = tileXMax - tileXMin + 1
    const rows = tileYMax - tileYMin + 1

    const tileSize = 256
    for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
        for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
            const srcUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${elevationDetail}/${tileX}/${tileY}.png`;
            const tileXOffset = cols * tileSize
            const tileYOffset = rows * tileSize

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
function computeSagAt(x: number, y: number, elevImageData: ImageData | null, elevMeta: elevMeta | null) {
    const dx = x - mapWidth / 2;
    const dy = y - mapHeight / 2;
    const r = Math.hypot(dx, dy);
    const R = earthRaiusKm
    const sag = R - Math.sqrt(Math.max(0, R * R - r * r));
    const elev = sampleElevationKmAtXY(x, y, elevImageData, elevMeta) * terrainExaggeration;

    return -sag + elev;
}
function buildWallX(xConst: number, elevImageData: ImageData | null, elevMeta: elevMeta | null, depthRange: number, wallGroup: THREE.Group, wallGeos: THREE.BufferGeometry[], wallMeshes: THREE.Mesh[]) {
    const positions = [];
    const aT = [];
    const indices = [];
    for (let i = 0; i <= segmentsAlong; i++) {
        const t = i / segmentsAlong;
        const y = t * mapHeight;
        const topZ = computeSagAt(xConst, y, elevImageData, elevMeta);
        for (let j = 0; j <= segmentsDepth; j++) {
            const tz = j / segmentsDepth;
            const z = topZ - depthRange * tz;
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
        const topZ = computeSagAt(x, yConst, elevImageData, elevMeta);
        for (let j = 0; j <= segmentsDepth; j++) {
            const tz = j / segmentsDepth;
            const z = topZ - depthRange * tz;
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
        const z = computeSagAt(xConst, y, elevImageData, elevMeta);
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
        const z = computeSagAt(x, yConst, elevImageData, elevMeta);
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
        const zTop = computeSagAt(xConst, y, elevImageData, elevMeta);
        positions.push(xConst, y, zTop - depthRange);
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
        const zTop = computeSagAt(x, yConst, elevImageData, elevMeta);
        positions.push(x, yConst, zTop - depthRange);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
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
function buildWalls(edgeGeos: THREE.BufferGeometry[], wallGroup: THREE.Group, elevImageData: ImageData | null, elevMeta: elevMeta | null, depthRange: number, wallGeos: THREE.BufferGeometry[] = [], wallMeshes: THREE.Mesh[] = []) {
    buildWallX(mapWidth, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    buildWallY(mapHeight, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    polylineTopX(mapWidth, elevImageData, elevMeta, wallGroup, wallGeos, edgeGeos);
    polylineTopY(mapHeight, elevImageData, elevMeta, wallGroup, edgeGeos);
    polylineBottomX(mapWidth, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange);
    polylineBottomY(mapHeight, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange);

    for (const [x, y] of corners) {
        const zTop = computeSagAt(x, y, elevImageData, elevMeta);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
            "position",
            new THREE.Float32BufferAttribute([x, y, zTop, x, y, zTop - depthRange], 3)
        )
        edgeGeos.push(geo)
        const edgeLine = new THREE.Line(geo, edgeMat)
        wallGroup.add(edgeLine)
    }
}
function updateAnd3DPoints(points: Earthquake[], positions: number[], raiduses: number[], elevImageData: ImageData | null, elevMeta: elevMeta | null,
    spheres: THREE.InstancedMesh, depthMaxGrid: number
) {
    const dummy = new THREE.Object3D();

    points.forEach((point) => {
        const { x, y } = lonLatToXY(point.lon, point.lat);

        const dx = x - mapWidth * 0.5
        const dy = y - mapHeight * 0.5
        const R = earthRaiusKm
        const r = Math.hypot(dx, dy)
        const sag = R - Math.sqrt(Math.max(0, R * R - r * r))
        const surfaceZ = -sag + sampleElevationKmAtXY(x, y, elevImageData, elevMeta)
        const z = surfaceZ - point.depth

        positions.push(x, y, z)
        const color = getEarthquakeColor(point.depth, depthMaxGrid)
        earthquakeColors.push(color.r, color.g, color.b)

        const radius = THREE.MathUtils.mapLinear(point.amplitude, 2.5, 7.0, 0.8, 4.0)
        raiduses.push(radius)

        dummy.position.set(x, y, z)
        dummy.scale.set(radius, radius, radius)
        dummy.updateMatrix()
        spheres.setMatrixAt(spheres.count - 1, dummy.matrix)
        spheres.setColorAt(spheres.count - 1, color)
    })
    spheres.instanceMatrix.needsUpdate = true;
}
async function terrariumToPlane(elevImageData: ImageData | null, elevMeta: elevMeta | null, planeGeo: THREE.PlaneGeometry) {
    if (!elevImageData || !elevMeta) return;

    const posAttr = planeGeo.attributes.position
    for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i)
        const vy = posAttr.getY(i)

        const r = Math.hypot(vx, vy)
        const R = earthRaiusKm
        const sag = R - Math.sqrt(R * R - r * r)

        const baseZ = -sag
        const mapX = vx + mapWidth * 0.5
        const mapY = vy + mapHeight * 0.5

        const elev = sampleElevationKmAtXY(mapX, mapY, elevImageData, elevMeta)
        posAttr.setZ(i, baseZ + elev);
    }
    posAttr.needsUpdate = true;
    planeGeo.computeVertexNormals();
}
function createGrid(depthRange: number) {
    //Create Grid Verts
    const epsilon = 1e-6
    const gridVerts = []
    const xStep = (gridStepMin[0], Math.round(mapWidth / gridDivision[0]))
    const ySetp = (gridStepMin[1], Math.round(mapWidth / gridDivision[1]))
    const zStep = (gridStepMin[2], Math.round(mapWidth / gridDivision[2]))
    //Verts Along Z
    for (let x = 0; x <= mapWidth + epsilon; x += xStep) {
        for (let y = 0; y <= mapHeight + epsilon; y += ySetp) {
            gridVerts.push(x, y, 0, x, y, -depthRange)
        }
    }
    //Verts Along X
    for (let z = 0; z >= -depthRange - epsilon; z -= zStep) {
        for (let y = 0; y <= mapHeight + epsilon; y += ySetp) {
            gridVerts.push(0, y, z, mapWidth, y, z);
        }
    }
    //Verts Along Y
    for (let z = 0; z >= -depthRange - epsilon; z -= zStep) {
        for (let x = 0; x <= mapWidth + epsilon; x += xStep) {
            gridVerts.push(x, 0, z, x, mapHeight, z)
        }
    }

    //Create Grid
    const gridGeo = new THREE.BufferGeometry();
    const gridMat = new THREE.LineBasicMaterial({ color: gridBeneathColor, transparent: true, opacity: gridBeneathOpacity });
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridVerts, 3))
    const grid = new THREE.LineSegments(gridGeo, gridMat);
    return grid
}
function getEarthquakeColor(depth: number, depthMaxGrid: number) {
    const t = Math.min(1, depth / depthMaxGrid);
    const color = new THREE.Color().setHSL(0.12 - 0.12 * t, 0.85, 0.5 - 0.2 * t)
    return color
}

//
const earthRaiusKm = 6371

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

const Bounds = {
    lonMin: 116,
    lonMax: 125.5,
    latMin: 20.0,
    latMax: 26.0,
};

const camera_fov = 45
const camera_near = 0.1
const camera_far = 5000

const satelliteDetail = 9
const elevationDetail = 10

const { kmPerLat, kmPerLon } = kmPerDegree((Bounds.latMax + Bounds.latMin) / 2)
const mapWidth = kmPerLon * (Bounds.lonMax - Bounds.lonMin)
const mapHeight = kmPerLat * (Bounds.latMax - Bounds.latMin)

const segmentsAlong = 48
const segmentsDepth = 24
const segments = 96
const terrainExaggeration = 2


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
const earthquakeColors: number[] = []
const earthquakeSizes = []

const gridStepMin = [20, 20, 15]
const gridDivision = [10, 10, 6]

//
export default function Map({ data, height, targetDepthKm }: MapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const worldRef = useRef<THREE.Group | null>(null);
    const controlsUiRef = useRef<HTMLDivElement | null>(null);


    let grid: THREE.LineSegments | null = null;
    let texture: THREE.Texture | null = null;
    let spheres: THREE.InstancedMesh | null = null;
    let sphereGeo: THREE.SphereGeometry | null = null;
    let sphereMat: THREE.MeshPhongMaterial | null = null;
    const wallGeos: THREE.BufferGeometry[] = []
    let wallsGroup: THREE.Group | null = null;
    const edgeGeos: THREE.BufferGeometry[] = []
    let rafId = 0

    const [width, setWidth] = useState(800);
    const [terrain, setTerrain] = useState<{ elevImageData: ImageData | null; elevMeta: elevMeta | null; }>({ elevImageData: null, elevMeta: null });

    const scaleSet = { scaleX: 1, scaleY: 1, scaleZ: 1 }
    const earthquakePoints = useMemo(() => (data && data.length ? data : generateSampleEQ()), [data]);
    const depthMaxGrid = Math.max(150, Math.max(...earthquakePoints.map((p) => p.depth)));
    const depthRange = depthMaxGrid * (scaleSet.scaleZ);

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
        if (!canvasRef.current) return;

        //Scence
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(canvasBackground)

        //World: 圖層容器
        const world = new THREE.Group()
        world.scale.set(1, 1, 1)
        scene.add(world)
        worldRef.current = world

        //Plane： 圖層
        const planeGeo = new THREE.PlaneGeometry(mapWidth, mapHeight, 1000, 1000)
        const planeMat = new THREE.MeshBasicMaterial({
            color: planeMatColor,
            side: THREE.DoubleSide,
        })
        const plane = new THREE.Mesh(planeGeo, planeMat)
        plane.position.set(mapWidth * 0.5, mapHeight * 0.5, 0)
        toCurved(planeGeo)
        world.add(plane)

        //Renderer
        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            antialias: true,
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)

        //Load Texture
        loadStatellite(renderer).then((newTexture) => {
            if (newTexture) {
                texture?.dispose()
                planeMat.map?.dispose()

                texture = newTexture
                plane.material.map = newTexture
                plane.material.needsUpdate = true
            }
        })

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

        // Load Terrarium then Update
        loadTerrarium().then(({ elevImageData, elevMeta }) => {
            setTerrain({ elevImageData: elevImageData, elevMeta: elevMeta })

            terrariumToPlane(elevImageData, elevMeta, planeGeo)

            //Update And 3D Points
            sphereGeo = new THREE.SphereGeometry(1, 12, 10);
            sphereMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30 });
            spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, earthquakePoints.length);
            spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            updateAnd3DPoints(earthquakePoints, earthquakePositions, earthquakeRadiuses, terrain.elevImageData, terrain.elevMeta, spheres, depthMaxGrid)
            world.add(spheres)

            //Wall
            wallsGroup = new THREE.Group();
            cleanWalls(wallGeos, wallMeshes, edgeGeos, wallsGroup, terrain.elevImageData, terrain.elevMeta, depthRange)
            buildWalls(edgeGeos, wallsGroup, terrain.elevImageData, terrain.elevMeta, depthRange)
            world.add(wallsGroup);

            //Grid beneath
            grid = createGrid(depthRange)
            world.add(grid)
        })

        //Animate 迴圈
        const animate = () => {
            rafId = requestAnimationFrame(animate)
            controls.update()
            renderer.render(scene, camera)
        }
        animate()

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

        //Dependencies
    }, [earthquakePoints, width])

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
}
