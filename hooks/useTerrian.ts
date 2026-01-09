import { useEffect, useRef } from "react";
import * as THREE from "three";

import { mapWidth, mapHeight, loadStatellite, loadTerrarium, terrainToPlane, cleanWalls, buildWalls } from "@/utils/utils";
import { planeMatColor, planeMatOpacity } from "@/constants/constants";
import type { TerrianProps } from "@/types/type";

export function useTerrain({ worldRef, rendererRef, depthRange }: TerrianProps) {
    const textureRef = useRef<THREE.Texture | null>(null);

    useEffect(() => {
        if (!worldRef.current || !rendererRef.current) return;

        //Plane： 圖層
        const planeGeo = new THREE.PlaneGeometry(mapWidth, mapHeight, 100, 100)
        const planeMat = new THREE.MeshBasicMaterial({
            color: planeMatColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: planeMatOpacity
        })
        const plane = new THREE.Mesh(planeGeo, planeMat)
        plane.position.set(mapWidth * 0.5, mapHeight * 0.5, 0)
        worldRef.current.add(plane)

        //Load Statellite
        loadStatellite(rendererRef.current).then((newTexture) => {
            if (newTexture) {
                textureRef.current?.dispose()
                planeMat.map?.dispose()

                textureRef.current = newTexture
                plane.material.map = newTexture
                plane.material.needsUpdate = true
            }
        });

        (async () => {
            // Load Terrarium then Update
            const { elevImageData, elevMeta } = await loadTerrarium();
            terrainToPlane({ elevImageData, elevMeta, planeGeo })

            //Wall
            const wallsGroup = new THREE.Group();
            cleanWalls(wallsGroup)
            buildWalls({ elevImageData, elevMeta, depthRange, wallsGroup })
            if (worldRef.current) {
                worldRef.current.add(wallsGroup);
            }
        })()

        //Cleanup
        return () => {
            textureRef.current?.dispose();
            planeMat.map?.dispose();
            planeGeo.dispose();
        };
    }, [rendererRef.current, worldRef.current, depthRange]);
}