import { useEffect } from "react";
import * as THREE from "three";

import { createGrid, pointsTo3D, onPointerMove } from "@/utils/utils";
import type { EQPointsProps } from "@/types/type";

export function useEQPoints({ worldRef, cameraRef, rendererRef, tooltipRef, EQData, depthMax }: EQPointsProps) {
    let grid: THREE.LineSegments | null = null;
    let spheres: THREE.InstancedMesh | null = null;
    let sphereGeo: THREE.SphereGeometry | null = null;
    let sphereMat: THREE.MeshBasicMaterial | THREE.MeshPhongMaterial | null = null;

    useEffect(() => {
        if (!worldRef.current || !cameraRef.current || !rendererRef.current) return;
        if (EQData.length === 0) return;

        //Grid beneath
        grid = createGrid(depthMax)
        if (grid) {
            worldRef.current.add(grid)
        }

        //3D EQ Points
        sphereGeo = new THREE.SphereGeometry(1, 12, 10);
        const vertexCount = sphereGeo.attributes.position.count;
        const baseColors = new Float32Array(vertexCount * 3).fill(1);
        sphereGeo.setAttribute("color", new THREE.BufferAttribute(baseColors, 3));
        sphereMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
        sphereMat.needsUpdate = true;
        spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, EQData.length);
        spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pointsTo3D(EQData, spheres, depthMax)
        sphereMat.needsUpdate = true;
        worldRef.current.add(spheres)

        //EQ Point Tooltip
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        rendererRef.current.domElement.addEventListener("pointermove", (event) => {
            if (!cameraRef.current || !tooltipRef.current || !spheres) return
            onPointerMove(event, tooltipRef, raycaster, pointer, cameraRef.current, spheres, EQData)
        });

        //Cleanup
        return () => {
            if (spheres && worldRef.current) {
                spheres.geometry.dispose();
                worldRef.current.remove(spheres);
            }
            if (grid && worldRef.current) {
                grid.geometry.dispose();
                worldRef.current.remove(grid);
            }
        }

    }, [worldRef, cameraRef, rendererRef, tooltipRef, EQData, depthMax])
}