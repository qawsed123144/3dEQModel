import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { background, width, height, cameraFov, cameraNear, cameraFar, targetDepthKm } from "@/constants/constants";
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
        scene.background = new THREE.Color(background)
        sceneRef.current = scene;

        //World Group: 圖層容器
        const world = new THREE.Group()
        scene.add(world);
        worldRef.current = world;

        //Renderer
        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            antialias: true,
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)
        rendererRef.current = renderer;

        //Camera
        const camera = new THREE.PerspectiveCamera(cameraFov, width / height, cameraNear, cameraFar)
        camera.position.set(mapWidth * 0.5, -mapHeight * 0.8, Math.max(mapWidth, mapHeight) * 1.2)
        camera.lookAt(new THREE.Vector3(mapWidth * 0.5, mapHeight * 0.5, 0));
        camera.up.set(0, 0, 1)
        cameraRef.current = camera;

        //Controls: 軌道控制器
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.target.set(mapWidth * 0.5, mapHeight * 0.5, targetDepthKm)
        controls.maxDistance = Math.max(mapWidth, mapHeight) * 3;
        controls.screenSpacePanning = true;
        controls.enableDamping = true
        controlsRef.current = controls;

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(1, 1, 2);
        scene.add(dir);

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
            controls.dispose()
            renderer.dispose();
            scene.clear();
        }
    }, [])

    return { sceneRef, worldRef, rendererRef, cameraRef, controlsRef };
}