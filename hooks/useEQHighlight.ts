import { useEffect, useRef } from "react";
import * as THREE from "three";
import { lonLatToMapXY } from "@/utils/utils";
import type { Earthquake } from "@/types/type";

type EQHighlightProps = {
    worldRef: React.RefObject<THREE.Group | null>;
    highlightPoint: Earthquake | null;
}

export function useEQHighlight({ worldRef, highlightPoint }: EQHighlightProps) {
    const meshRef = useRef<THREE.Mesh | null>(null);
    const ringRef = useRef<THREE.Mesh | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!worldRef.current) return;

        const geometry = new THREE.IcosahedronGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff3300,
            wireframe: true,
            transparent: true,
            opacity: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.renderOrder = 999;
        worldRef.current.add(mesh);
        meshRef.current = mesh;

        const ringGeo = new THREE.SphereGeometry(1, 16, 16);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.5,
            wireframe: true,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.visible = false;
        worldRef.current.add(ring);
        ringRef.current = ring;

        return () => {
            if (worldRef.current) {
                if (meshRef.current) worldRef.current.remove(meshRef.current);
                if (ringRef.current) worldRef.current.remove(ringRef.current);
            }
            geometry.dispose();
            material.dispose();
            ringGeo.dispose();
            ringMat.dispose();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
    }, [worldRef]);

    useEffect(() => {
        const mesh = meshRef.current;
        const ring = ringRef.current;
        if (!mesh || !ring) return;

        if (!highlightPoint) {
            mesh.visible = false;
            ring.visible = false;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            return;
        }

        // Position
        const { x, y } = lonLatToMapXY(highlightPoint.lon, highlightPoint.lat);
        const z = -highlightPoint.depth;

        const baseSize = Math.max(2, (highlightPoint.amplitude || 3) * 3);

        mesh.position.set(x, y, z);
        ring.position.set(x, y, z);

        mesh.visible = true;
        ring.visible = true;

        // Animation
        let time = 0;
        const animate = () => {
            time += 0.05;

            // Pulse Core
            const scale = baseSize + Math.sin(time * 5) * (baseSize * 0.1);
            mesh.scale.set(scale, scale, scale);
            (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(time * 5) * 0.5;

            // Expand Ring
            const ringScale = baseSize + (time * 10) % (baseSize * 4); // Loop every X frames
            const ringOpacity = 1 - ((ringScale - baseSize) / (baseSize * 4));

            ring.scale.set(ringScale, ringScale, ringScale);
            (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, ringOpacity);

            rafRef.current = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };

    }, [highlightPoint]);
}
