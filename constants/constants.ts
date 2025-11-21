import * as THREE from "three";
import { Earthquake } from "@/types/type";

export const EARTH_RADIUS = 6378.137;
export const bounds = {
    lonMin: 118,
    lonMax: 126,
    latMin: 19.0,
    latMax: 27.0,
};

export const cameraFov = 45
export const cameraNear = 0.1
export const cameraFar = 5000

export const targetDepthKm = 100

export const satelliteDetail = 8
export const elevationDetail = 5
export const terrainExaggeration = 3
export const segmentsAlong = 48
export const segmentsDepth = 24
export const segments = 96
export const satelliteUrlBase = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile"
export const terraianUrlBase = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
export const tileSize = 256

export const TOOLTIP_OFFSET = 12;
export const tooltipDisplay = (point: Earthquake) => {
    return `LAT/LON: ${point.lat.toFixed(3)} / ${point.lon.toFixed(3)}\n` +
        `DEPTH: ${point.depth.toFixed(1)} km/M: ${(point.amplitude ?? 0).toFixed(1)}\n` +
        `Date: ${point.time}`;
};

//Styles Constants
export const width = 800
export const height = 560

export const planeMatColor = 0xffffff
export const background = 0xf8fafc
export const statelliteTileDefultColor = "0xd6d3d1"
export const terrariumTileDefultColor = "rgb(128,128,128)"

export const wallMat = new THREE.ShaderMaterial({
    uniforms: {
        uColorTop: { value: new THREE.Color(0xcbb091) },
        uColorBottom: { value: new THREE.Color(0x4e342e) },
        uOpacityTop: { value: 0.22 },
        uOpacityBottom: { value: 0.52 },
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
export const gridBeneathColor = 0xcccccc
export const gridBeneathOpacity = 0.35;
