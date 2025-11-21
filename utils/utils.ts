import * as THREE from "three";

import * as con from "@/constants/constants";
import type { Bounds, Earthquake, elevationAtXYProps, terrainToPlaneProps, buildWallProps, buildWallsProps } from "@/types/type";

// Computed constants
export const { mapWidth, mapHeight } = boundsToMapSize(con.bounds)

// Compute functions
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
function lonLatToMapXY(lon: number, lat: number) {
    const { x, y } = lonLatToXY(lon, lat);
    const { x: mapMinX, y: mapMinY } = lonLatToXY(con.bounds.lonMin, con.bounds.latMin);
    return { x: x - mapMinX, y: y - mapMinY };
}
function boundsToMapSize(BOUNDS: Bounds) {
    const { x: xmin, y: ymin } = lonLatToXY(BOUNDS.lonMin, BOUNDS.latMin);
    const { x: xmax, y: ymax } = lonLatToXY(BOUNDS.lonMax, BOUNDS.latMax);
    const mapWidth = Math.abs(xmax - xmin)
    const mapHeight = Math.abs(ymax - ymin)
    return { mapWidth, mapHeight }
}
function lonLatToTileIdx(lon: number, lat: number, zoom: number) {
    const n = Math.pow(2, zoom);
    const tileXIdx = Math.floor((lon + 180) / 360 * n);
    const tileYIdx = Math.floor(
        ((1 - Math.log(Math.tan(degreeToRadian(lat)) + 1 / Math.cos(degreeToRadian(lat))) / Math.PI) / 2) * n
    );
    return { tileXIdx, tileYIdx };
}
function lonLatToGlobalPixel(lon: number, lat: number, zoom: number) {
    const n = Math.pow(2, zoom);
    const x = ((lon + 180) / 360) * n * con.tileSize;
    const radianY = degreeToRadian(lat);
    const y = ((1 - Math.log(Math.tan(Math.PI / 4 + radianY / 2)) / Math.PI) / 2) * n * con.tileSize;
    return { x, y };
}
function xyToLonLat(x: number, y: number) {
    const R = con.EARTH_RADIUS

    const lon = (x / R) * (180 / Math.PI)
    const lat = (Math.atan(Math.sinh(y / R)) * 180) / Math.PI;
    return { lon, lat }
}

// useTerrian
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

    //Tile Index
    const topLeftTile = lonLatToTileIdx(con.bounds.lonMin, con.bounds.latMax, detail)
    const bottomRightTile = lonLatToTileIdx(con.bounds.lonMax, con.bounds.latMin, detail)
    const tileXMin = topLeftTile.tileXIdx;
    const tileXMax = bottomRightTile.tileXIdx;
    const tileYMin = topLeftTile.tileYIdx;
    const tileYMax = bottomRightTile.tileYIdx;

    // Pixel
    const topLeftPx = lonLatToGlobalPixel(con.bounds.lonMin, con.bounds.latMax, detail);
    const bottomRightPx = lonLatToGlobalPixel(con.bounds.lonMax, con.bounds.latMin, detail);
    const pixelXMin = topLeftPx.x;
    const pixelXMax = bottomRightPx.x;
    const pixelYMin = topLeftPx.y;
    const pixelYMax = bottomRightPx.y;

    //Canvas setting
    const cols = tileXMax - tileXMin + 1;
    const rows = tileYMax - tileYMin + 1;
    canvas.width = cols * con.tileSize;
    canvas.height = rows * con.tileSize;

    // Canvas Crop setting
    const cropX = Math.round(pixelXMin - tileXMin * con.tileSize);
    const cropY = Math.round(pixelYMin - tileYMin * con.tileSize);
    const cropWidth = Math.round(pixelXMax - pixelXMin);
    const cropHeight = Math.round(pixelYMax - pixelYMin);

    return { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, cols, rows, cropX, cropY, cropWidth, cropHeight }
}
export async function loadStatellite(renderer: THREE.WebGLRenderer) {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, cropX, cropY, cropWidth, cropHeight } = prepareLoadTiles(con.satelliteDetail)
    const loadImagePromises: Promise<void>[] = []

    // Canvas draw
    for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
        for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
            const srcUrl = `${con.satelliteUrlBase}/${con.satelliteDetail}/${tileY}/${tileX}`;
            const tileXOffset = (tileX - tileXMin) * con.tileSize
            const tileYOffset = (tileY - tileYMin) * con.tileSize

            loadImagePromises.push(
                loadImage(srcUrl).then((image) => {
                    context.drawImage(image, tileXOffset, tileYOffset, con.tileSize, con.tileSize)
                })
                    .catch(() => {
                        context.fillStyle = con.statelliteTileDefultColor;
                        context.fillRect(tileXOffset, tileYOffset, con.tileSize, con.tileSize)
                    })
            )

        }
    }
    await Promise.all(loadImagePromises)

    // Canvas crop
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

    // Texture (Use cropped canvas)
    const texture = new THREE.Texture(finalCanvas)
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.needsUpdate = true;

    return texture
}
export async function loadTerrarium() {
    const { canvas, context, tileXMin, tileXMax, tileYMin, tileYMax, cropX, cropY, cropWidth, cropHeight } = prepareLoadTiles(con.elevationDetail)
    const loadImagePromises: Promise<void>[] = []

    // Canvas draw
    for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
        for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
            const srcUrl = `${con.terraianUrlBase}/${con.elevationDetail}/${tileX}/${tileY}.png`;
            const tileXOffset = (tileX - tileXMin) * con.tileSize
            const tileYOffset = (tileY - tileYMin) * con.tileSize

            loadImagePromises.push(
                loadImage(srcUrl).then((image) => {
                    context.drawImage(image, tileXOffset, tileYOffset, con.tileSize, con.tileSize)
                })
                    .catch(() => {
                        context.fillStyle = con.terrariumTileDefultColor;
                        context.fillRect(tileXOffset, tileYOffset, con.tileSize, con.tileSize)
                    })
            )
        }
    }
    await Promise.all(loadImagePromises)

    // Canvas crop
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

    // Elevation image data (use cropped canvas)
    const elevImageData = finalCanvas.getContext("2d")?.getImageData(0, 0, finalCanvas.width, finalCanvas.height) ?? null;
    const elevMeta = { width: finalCanvas.width, height: finalCanvas.height, zoom: con.elevationDetail };

    return { elevImageData, elevMeta }
}
function elevationAtXY({ x, y, elevImageData, elevMeta, terrainExaggeration }: elevationAtXYProps): number {
    if (!elevMeta || !elevImageData) return 0;

    const { x: mapMinX, y: mapMinY } = lonLatToXY(con.bounds.lonMin, con.bounds.latMin);
    const absX = mapMinX + x;
    const absY = mapMinY + y;
    const { lon, lat } = xyToLonLat(absX, absY);
    const { x: globalPixelX, y: globalPixelY } = lonLatToGlobalPixel(lon, lat, elevMeta.zoom);
    const { x: startGPX, y: startGPY } = lonLatToGlobalPixel(con.bounds.lonMin, con.bounds.latMax, elevMeta.zoom);

    const localPixelX = Math.max(0, Math.min(elevMeta.width - 1, Math.floor(globalPixelX - startGPX)));
    const localPixelY = Math.max(0, Math.min(elevMeta.height - 1, Math.floor(globalPixelY - startGPY)));

    const idx = (localPixelY * elevMeta.width + localPixelX) * 4;
    const r = elevImageData.data[idx + 0];
    const g = elevImageData.data[idx + 1];
    const b = elevImageData.data[idx + 2];

    const meters = (r * 256 + g + b / 256) - 32768;
    return meters / 1000 * terrainExaggeration;
}
export function terrainToPlane({ elevImageData, elevMeta, planeGeo }: terrainToPlaneProps) {
    if (!elevImageData || !elevMeta) return;

    const vAttribute = planeGeo.attributes.position
    for (let i = 0; i < vAttribute.count; i++) {
        const vx = vAttribute.getX(i)
        const vy = vAttribute.getY(i)

        const mapX = vx + mapWidth * 0.5
        const mapY = vy + mapHeight * 0.5

        const elev = elevationAtXY({ x: mapX, y: mapY, elevImageData, elevMeta, terrainExaggeration: con.terrainExaggeration })
        vAttribute.setZ(i, elev);
    }
    vAttribute.needsUpdate = true;
    planeGeo.computeVertexNormals();
}
function buildWall({ alongConst, axis, elevImageData, elevMeta, depthRange, wallsGroup }: buildWallProps) {
    const vertices: number[] = [];
    const attributeT: number[] = [];
    const triangle: number[] = [];

    // Build vertices
    for (let i = 0; i <= con.segmentsAlong; i++) {
        const t = i / con.segmentsAlong;

        let x: number, y: number;
        if (axis === 'y') {
            x = alongConst;
            y = t * mapHeight;
        } else {
            x = t * mapWidth;
            y = alongConst;
        }

        const topZ = elevationAtXY({ x, y, elevImageData, elevMeta, terrainExaggeration: con.terrainExaggeration });
        for (let j = 0; j <= con.segmentsDepth; j++) {
            const tz = j / con.segmentsDepth;
            const z = THREE.MathUtils.lerp(topZ, -depthRange, tz);
            vertices.push(x, y, z);
            attributeT.push(tz);
        }
    }

    //Build triangles
    const row = con.segmentsDepth + 1;
    for (let i = 0; i < con.segmentsAlong; i++) {
        for (let j = 0; j < con.segmentsDepth; j++) {
            const a = i * row + j;
            const b = (i + 1) * row + j;
            const c = (i + 1) * row + (j + 1);
            const d = i * row + (j + 1);
            triangle.push(a, b, d, b, c, d);
        }
    }

    //Build geometry
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute("aT", new THREE.Float32BufferAttribute(attributeT, 1));
    geom.setIndex(triangle);
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, con.wallMat);
    wallsGroup.add(mesh);
}
export function buildWalls({ elevImageData, elevMeta, depthRange, wallsGroup }: buildWallsProps) {
    buildWall({ alongConst: mapWidth, axis: 'y', elevImageData, elevMeta, depthRange, wallsGroup });
    buildWall({ alongConst: mapHeight, axis: 'x', elevImageData, elevMeta, depthRange, wallsGroup });
    buildWall({ alongConst: 0, axis: 'y', elevImageData, elevMeta, depthRange, wallsGroup });
    buildWall({ alongConst: 0, axis: 'x', elevImageData, elevMeta, depthRange, wallsGroup });
}
export function cleanWalls(wallGroup: THREE.Group) {
    wallGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
        }
    });
    wallGroup.clear();
}

// useEQPoints
export function createGrid(depthMax: number): THREE.LineSegments | null {
    //Arrays
    const grids: number[] = []
    const lonSamples: number[] = [];
    const latSamples: number[] = [];

    //Constants
    const degStep = 1
    const latRef = (con.bounds.latMax + con.bounds.latMin) / 2
    const lonRef = (con.bounds.lonMax + con.bounds.lonMin) / 2
    const xStep = lonLatToXY(lonRef + degStep, latRef).x - lonLatToXY(lonRef, latRef).x
    const zStep = xStep // zStep 和 xStep (lon) 一樣大
    const depthLineCounts = Math.max(1, Math.ceil(depthMax / zStep));
    const depthLines = depthLineCounts + 1;
    const startLon = Math.ceil(con.bounds.lonMin);
    const endLon = Math.floor(con.bounds.lonMax);
    const startLat = Math.ceil(con.bounds.latMin);
    const endLat = Math.floor(con.bounds.latMax);

    // Build gridVerts
    lonSamples.push(con.bounds.lonMin);
    for (let lon = startLon; lon <= endLon; lon += degStep) lonSamples.push(lon);
    lonSamples.push(con.bounds.lonMax);
    latSamples.push(con.bounds.latMin);
    for (let lat = startLat; lat <= endLat; lat += degStep) latSamples.push(lat);
    latSamples.push(con.bounds.latMax);
    const lonCount = lonSamples.length;
    const latCount = latSamples.length;
    const verts = Array.from({ length: latCount }, (_, latIdx) => {
        const lat = latSamples[latIdx];
        return lonSamples.map((lon) => lonLatToMapXY(lon, lat));
    });

    // Build Lines
    // along z-axis
    verts.flat().forEach(({ x, y }) => {
        grids.push(x, y, 0, x, y, -depthMax);
    });
    // along y-axis
    verts.flat().forEach((point, i, arr) => {
        const hasTop = (i + lonCount) < arr.length;
        if (hasTop) {
            const next = arr[i + lonCount];
            for (let d = 0; d < depthLines; d++) {
                const depth = Math.min(depthMax, d * zStep);
                grids.push(point.x, point.y, -depth, next.x, next.y, -depth);
            }
        }
    });
    // along x-axis
    verts.flat().forEach((point, i, arr) => {
        const hasRight = (i + 1) % lonCount !== 0;
        if (hasRight) {
            const next = arr[i + 1];
            for (let d = 0; d < depthLines; d++) {
                const depth = Math.min(depthMax, d * zStep);
                grids.push(point.x, point.y, -depth, next.x, next.y, -depth);
            }
        }
    });

    //Create Grid
    const gridGeo = new THREE.BufferGeometry();
    const gridMat = new THREE.LineBasicMaterial({ color: con.gridBeneathColor, transparent: true, opacity: con.gridBeneathOpacity, depthTest: true, depthWrite: false });
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(grids, 3))
    return new THREE.LineSegments(gridGeo, gridMat);
}
function getEarthquakeColor(depth: number, depthMax: number) {
    const t = Math.min(1, depth / depthMax);
    const hue = 0.0 + 0.83 * t;
    const saturation = 0.95;
    const lightness = 0.3 - 0.25 * t;

    return new THREE.Color().setHSL(hue, saturation, lightness);
}
export function pointsTo3D(points: Earthquake[], spheres: THREE.InstancedMesh, depthMax: number) {
    const dummy = new THREE.Object3D();
    points.forEach((point, index) => {
        //Set Dummy
        const { x, y } = lonLatToMapXY(point.lon, point.lat);
        const z = - point.depth
        const radius = THREE.MathUtils.mapLinear(point.amplitude, 1, 7.0, 0.01, 12.0)
        const color = getEarthquakeColor(point.depth, depthMax)
        dummy.position.set(x, y, z)
        dummy.scale.set(radius, radius, radius)
        dummy.updateMatrix()

        //Add to Sphere
        spheres.setMatrixAt(index, dummy.matrix)
        spheres.setColorAt(index, color)
    })

    spheres.count = points.length;
    spheres.instanceMatrix.needsUpdate = true;
    if (spheres.instanceColor) spheres.instanceColor.needsUpdate = true;
}
export function onPointerMove(e: PointerEvent, tooltipRef: React.RefObject<HTMLDivElement | null>, raycaster: THREE.Raycaster, pointer: THREE.Vector2, camera: THREE.PerspectiveCamera, spheres: THREE.InstancedMesh, points: Earthquake[]) {
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
    const point = points[hit];
    tooltipRef.current.style.left = `${e.clientX + con.TOOLTIP_OFFSET}px`;
    tooltipRef.current.style.top = `${e.clientY + con.TOOLTIP_OFFSET}px`;
    tooltipRef.current.innerText = con.tooltipDisplay(point);
} 