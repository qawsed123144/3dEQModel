import * as THREE from "three";
import * as con from "@/constants/constants";

import type { Bounds, ElevMeta, Earthquake } from "@/types/type";

const mapOrigin = lonLatToXY(con.bounds.lonMin, con.bounds.latMin);
export const { mapWidth, mapHeight } = boundsToMapSize(con.bounds)
const corners = [
    [0, 0], [mapWidth, 0], [0, mapHeight], [mapWidth, mapHeight]
]
const edgeMat = new THREE.LineBasicMaterial({ color: con.edgeColor, opacity: con.edgeOpacity, transparent: true });

const wallMat = new THREE.ShaderMaterial({
    uniforms: {
        uColorTop: { value: new THREE.Color(con.wallColorTop) },
        uColorBottom: { value: new THREE.Color(con.wallColorBottom) },
        uOpacityTop: { value: con.wallOpacityTop },
        uOpacityBottom: { value: con.wallOpacityBottom },
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
function degreeToRadian(degree: number) {
    return degree * Math.PI / 180
}
function lonLatToXY(lon: number, lat: number) {
    const R = con.EARTH_RADIUS
    const radianX = degreeToRadian(lon)
    const radianY = degreeToRadian(lat)

    const x = R * radianX
    const y = R * Math.log(Math.tan(Math.PI / 4 + radianY / 2));
    return { x, y }
}
function xyToLonLat(x: number, y: number) {
    const R = con.EARTH_RADIUS

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
function elevationAtXY(x: number, y: number, elevImageData: ImageData | null, elevMeta: ElevMeta | null, terrainExaggeration: number): number {
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

    const topLeftTile = lonLatToTileIdx(con.bounds.lonMin, con.bounds.latMax, detail)
    const bottomRightTile = lonLatToTileIdx(con.bounds.lonMax, con.bounds.latMin, detail)
    const tileXMin = Math.min(topLeftTile.tileXIdx, bottomRightTile.tileXIdx)
    const tileXMax = Math.max(topLeftTile.tileXIdx, bottomRightTile.tileXIdx)
    const tileYMin = Math.min(topLeftTile.tileYIdx, bottomRightTile.tileYIdx)
    const tileYMax = Math.max(topLeftTile.tileYIdx, bottomRightTile.tileYIdx)

    const loadImagePromises: Promise<void>[] = []
    return { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises }
}
export async function loadStatellite(renderer: THREE.WebGLRenderer) {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises } = prepareLoadTiles(con.satelliteDetail)
    const tileSize = 256

    canvas.width = (tileXMax - tileXMin + 1) * tileSize
    canvas.height = (tileYMax - tileYMin + 1) * tileSize

    for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
        for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
            const srcUrl = `${con.satelliteUrlBase}/${con.satelliteDetail}/${tileY}/${tileX}`;
            const tileXOffset = (tileX - tileXMin) * tileSize
            const tileYOffset = (tileY - tileYMin) * tileSize

            loadImagePromises.push(
                loadImage(srcUrl).then((image) => {
                    context.drawImage(image, tileXOffset, tileYOffset, tileSize, tileSize)
                })
                    .catch(() => {
                        context.fillStyle = con.statelliteTileDefultColor;
                        context.fillRect(tileXOffset, tileYOffset, tileSize, tileSize)
                    })
            )

        }
    }
    await Promise.all(loadImagePromises)
    const topLeftPx = lonLatToGlobalPixel(con.bounds.lonMin, con.bounds.latMax, con.satelliteDetail, tileSize);
    const bottomRightPx = lonLatToGlobalPixel(con.bounds.lonMax, con.bounds.latMin, con.satelliteDetail, tileSize);
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
export async function loadTerrarium() {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, loadImagePromises } = prepareLoadTiles(con.elevationDetail)
    const cols = tileXMax - tileXMin + 1
    const rows = tileYMax - tileYMin + 1

    const tileSize = 256
    canvas.width = (tileXMax - tileXMin + 1) * tileSize;
    canvas.height = (tileYMax - tileYMin + 1) * tileSize;

    for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
        for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
            const srcUrl = `${con.terraianUrlBase}/${con.elevationDetail}/${tileX}/${tileY}.png`;
            const tileXOffset = (tileX - tileXMin) * tileSize
            const tileYOffset = (tileY - tileYMin) * tileSize

            loadImagePromises.push(
                loadImage(srcUrl).then((image) => {
                    context.drawImage(image, tileXOffset, tileYOffset, tileSize, tileSize)
                })
                    .catch(() => {
                        context.fillStyle = con.terrariumTileDefultColor;
                        context.fillRect(tileXOffset, tileYOffset, tileSize, tileSize)
                    })
            )
        }
    }
    await Promise.all(loadImagePromises)

    const elevImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const elevMeta = { tileXMin, tileYMin, tileSize, cols, rows, width: canvas.width, height: canvas.height, zoom: con.elevationDetail };

    return { elevImageData, elevMeta }
}

function buildWallX(xConst: number, elevImageData: ImageData | null, elevMeta: ElevMeta | null, depthRange: number, wallGroup: THREE.Group, wallGeos: THREE.BufferGeometry[], wallMeshes: THREE.Mesh[]) {
    const positions = [];
    const aT = [];
    const indices = [];
    for (let i = 0; i <= con.segmentsAlong; i++) {
        const t = i / con.segmentsAlong;
        const y = t * mapHeight;
        const topZ = elevationAtXY(xConst, y, elevImageData, elevMeta, con.terrainExaggeration);
        for (let j = 0; j <= con.segmentsDepth; j++) {
            const tz = j / con.segmentsDepth;
            const z = THREE.MathUtils.lerp(topZ, -depthRange, tz);
            positions.push(xConst, y, z);
            aT.push(tz);
        }
    }
    const row = con.segmentsDepth + 1;
    for (let i = 0; i < con.segmentsAlong; i++) {
        for (let j = 0; j < con.segmentsDepth; j++) {
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
function buildWallY(yConst: number, elevImageData: ImageData | null, elevMeta: ElevMeta | null, depthRange: number, wallGroup: THREE.Group, wallGeos: THREE.BufferGeometry[], wallMeshes: THREE.Mesh[]) {
    const positions: number[] = [];
    const aT: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= con.segmentsAlong; i++) {
        const t = i / con.segmentsAlong;
        const x = t * mapWidth;
        const topZ = elevationAtXY(x, yConst, elevImageData, elevMeta, con.terrainExaggeration);
        for (let j = 0; j <= con.segmentsDepth; j++) {
            const tz = j / con.segmentsDepth;
            const z = THREE.MathUtils.lerp(topZ, -depthRange, tz);
            positions.push(x, yConst, z);
            aT.push(tz);
        }
    }
    const row = con.segmentsDepth + 1;
    for (let i = 0; i < con.segmentsAlong; i++) {
        for (let j = 0; j < con.segmentsDepth; j++) {
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
function polylineTopX(xConst: number, elevImageData: ImageData | null, elevMeta: ElevMeta | null, wallGroup: THREE.Group, wallGeos: THREE.BufferGeometry[], edgeGeos: THREE.BufferGeometry[]) {
    const positions: number[] = [];
    for (let i = 0; i <= con.segments; i++) {
        const t = i / con.segments;
        const y = t * mapHeight;
        const z = elevationAtXY(xConst, y, elevImageData, elevMeta, con.terrainExaggeration);
        positions.push(xConst, y, z);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}
function polylineTopY(yConst: number, elevImageData: ImageData | null, elevMeta: ElevMeta | null, wallGroup: THREE.Group, edgeGeos: THREE.BufferGeometry[]) {
    const positions: number[] = [];
    for (let i = 0; i <= con.segments; i++) {
        const t = i / con.segments;
        const x = t * mapWidth;
        const z = elevationAtXY(x, yConst, elevImageData, elevMeta, con.terrainExaggeration);
        positions.push(x, yConst, z);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}
function polylineBottomX(xConst: number, elevImageData: ImageData | null, elevMeta: ElevMeta | null, wallGroup: THREE.Group, edgeGeos: THREE.BufferGeometry[], depthRange: number) {
    const positions: number[] = [];
    for (let i = 0; i <= con.segments; i++) {
        const t = i / con.segments;
        const y = t * mapHeight;
        positions.push(xConst, y, -depthRange);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}
function polylineBottomY(yConst: number, elevImageData: ImageData | null, elevMeta: ElevMeta | null, wallGroup: THREE.Group, edgeGeos: THREE.BufferGeometry[], depthRange: number) {
    const positions: number[] = [];
    for (let i = 0; i <= con.segments; i++) {
        const t = i / con.segments;
        const x = t * mapWidth;
        positions.push(x, yConst, -depthRange);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    edgeGeos.push(geom);
    const line = new THREE.Line(geom, edgeMat);
    wallGroup.add(line);
}

export function buildWalls(edgeGeos: THREE.BufferGeometry[], wallGroup: THREE.Group, elevImageData: ImageData | null, elevMeta: ElevMeta | null, depthRange: number, wallGeos: THREE.BufferGeometry[] = [], wallMeshes: THREE.Mesh[] = []) {
    buildWallX(mapWidth, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    buildWallY(mapHeight, elevImageData, elevMeta, depthRange, wallGroup, wallGeos, wallMeshes);
    polylineTopX(mapWidth, elevImageData, elevMeta, wallGroup, wallGeos, edgeGeos);
    polylineTopY(mapHeight, elevImageData, elevMeta, wallGroup, edgeGeos);
    polylineBottomX(mapWidth, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange);
    polylineBottomY(mapHeight, elevImageData, elevMeta, wallGroup, edgeGeos, depthRange);

    for (const [x, y] of corners) {
        const zTop = elevationAtXY(x, y, elevImageData, elevMeta, con.terrainExaggeration);
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
export function cleanWalls(wallGeos: THREE.BufferGeometry[], wallMeshes: THREE.Mesh[], edgeGeos: THREE.BufferGeometry[], wallGroup: THREE.Group, elevImageData: ImageData | null, elevMeta: ElevMeta | null, depthRange: number) {
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
export function pointsTo3D(points: Earthquake[], spheres: THREE.InstancedMesh, depthMaxGrid: number) {
    const dummy = new THREE.Object3D();
    const positions: number[] = []
    const radiuses: number[] = []

    points.forEach((point, index) => {
        const { x, y } = lonLatToMapXY(point.lon, point.lat);
        const z = - point.depth

        positions.push(x, y, z)
        const color = getEarthquakeColor(point.depth, depthMaxGrid)

        const radius = THREE.MathUtils.mapLinear(point.amplitude, 1, 7.0, 0.01, 12.0)
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
export function terrariumToPlane(elevImageData: ImageData | null, elevMeta: ElevMeta | null, planeGeo: THREE.PlaneGeometry) {
    if (!elevImageData || !elevMeta) return;

    const posAttr = planeGeo.attributes.position
    for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i)
        const vy = posAttr.getY(i)

        const mapX = vx + mapWidth * 0.5
        const mapY = vy + mapHeight * 0.5

        const elev = elevationAtXY(mapX, mapY, elevImageData, elevMeta, con.terrainExaggeration)
        posAttr.setZ(i, elev);
    }
    posAttr.needsUpdate = true;
    planeGeo.computeVertexNormals();
}
export function createGrid(depthMax: number): THREE.LineSegments | null {
    //Create Grid Verts
    const gridVerts = []

    //step
    const degStep = 1
    const latRef = (con.bounds.latMax + con.bounds.latMin) / 2
    const lonRef = (con.bounds.lonMax + con.bounds.lonMin) / 2
    const xStep = lonLatToXY(lonRef + degStep, latRef).x - lonLatToXY(lonRef, latRef).x
    const zStep = xStep // zStep 和 xStep (lon) 一樣大
    const depthLineCounts = Math.max(1, Math.ceil(depthMax / zStep));
    const depthLevels = depthLineCounts + 1;

    const startLon = Math.ceil(con.bounds.lonMin);
    const endLon = Math.floor(con.bounds.lonMax);
    const startLat = Math.ceil(con.bounds.latMin);
    const endLat = Math.floor(con.bounds.latMax);

    const lonSamples: number[] = [];
    const latSamples: number[] = [];
    lonSamples.push(con.bounds.lonMin);
    for (let lon = startLon; lon <= endLon; lon += degStep) lonSamples.push(lon);
    lonSamples.push(con.bounds.lonMax);
    latSamples.push(con.bounds.latMin);
    for (let lat = startLat; lat <= endLat; lat += degStep) latSamples.push(lat);
    latSamples.push(con.bounds.latMax);
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
    const gridMat = new THREE.LineBasicMaterial({ color: con.gridBeneathColor, transparent: true, opacity: con.gridBeneathOpacity, depthTest: true, depthWrite: false });
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
export function onPointerMove(e: PointerEvent, tooltipRef: React.RefObject<HTMLDivElement | null>, raycaster: THREE.Raycaster, pointer: THREE.Vector2, camera: THREE.PerspectiveCamera, spheres: THREE.InstancedMesh, earthquakePoints: Earthquake[]) {
    if (!tooltipRef.current) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObject(spheres, false);

    if (intersections.length === 0) {
        tooltipRef.current.style.display = "none";
        return;
    }

    tooltipRef.current.style.display = "block";
    const hit = intersections[0].instanceId ?? 0;
    const quake = earthquakePoints[hit];
    tooltipRef.current.style.left = `${e.clientX + 12}px`;
    tooltipRef.current.style.top = `${e.clientY + 12}px`;
    tooltipRef.current.innerText =
        `LAT/LON: ${quake.lat.toFixed(3)} / ${quake.lon.toFixed(3)}\nDEPTH: ${quake.depth.toFixed(1)} km/M: ${(quake.amplitude ?? 0).toFixed(1)}\nDate: ${quake.time}`;
}

