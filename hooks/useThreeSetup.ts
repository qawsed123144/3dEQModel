import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { background, cameraFov, cameraNear, cameraFar, targetDepthKm } from "@/constants/constants";
import { mapWidth, mapHeight } from "@/utils/utils";
import type { ThreeSetupProps } from "@/types/type";

export function useThreeSetup({ canvasRef }: ThreeSetupProps) {

    const sceneRef = useRef<THREE.Scene | null>(null);
    const worldRef = useRef<THREE.Group | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const rafId = useRef<number | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        //Scence
        const scene = new THREE.Scene()
        sceneRef.current = scene;

        //World Group: 圖層容器
        const world = new THREE.Group()
        scene.add(world);
        worldRef.current = world;

        //Renderer
        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            antialias: true,
            alpha: true,
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

        // Initialize size based on container
        const parent = canvasRef.current.parentElement;
        const initialWidth = parent?.clientWidth || 1;
        const initialHeight = parent?.clientHeight || 1;
        renderer.setSize(initialWidth, initialHeight, false);
        rendererRef.current = renderer;

        //Camera
        const camera = new THREE.PerspectiveCamera(cameraFov, initialWidth / initialHeight, cameraNear, cameraFar)
        camera.position.set(mapWidth * 0.5, -mapHeight * 2.8, mapWidth * 0.2)
        camera.lookAt(new THREE.Vector3(mapWidth * 0.5, mapHeight * 0.5, 0));
        camera.up.set(0, 0, 1)
        cameraRef.current = camera;

        //Controls: 軌道控制器
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.target.set(mapWidth * 0.5, mapHeight * 0.5, -targetDepthKm * 2)
        controls.maxDistance = Math.max(mapWidth, mapHeight) * 10;
        controls.screenSpacePanning = true;
        controls.enableDamping = true
        controlsRef.current = controls;

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(1, 1, 2);
        scene.add(dir);

        // Resize Observer
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height, false); // false: prevent setting style.width/height
            }
        });

        if (parent) {
            resizeObserver.observe(parent);
        }

        //Animate: 開始渲染
        const animate = () => {
            controls.update()
            renderer.render(scene, camera)
            rafId.current = requestAnimationFrame(animate)
        }
        animate();

        //Cleanup
        return () => {
            if (rafId.current !== null) {
                cancelAnimationFrame(rafId.current);
            }
            if (parent) {
                resizeObserver.unobserve(parent);
            }
            resizeObserver.disconnect();
            controls.dispose()
            renderer.dispose();
            scene.clear();
        }
    }, [])

    return { sceneRef, worldRef, rendererRef, cameraRef, controlsRef };
}