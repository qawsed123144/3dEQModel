import { useEffect, useMemo, useRef } from "react";

import { useThreeSetup } from "@/hooks/useThreeSetup";
import { useTerrain } from "@/hooks/useTerrian";
import { useEQPoints } from "@/hooks/useEQPoints";
import { useGuiControls } from "@/hooks/useGuiControls";
import type { MapProps } from "@/types/type";

export default function Map({ data }: MapProps) {
    //Refs
    const initializedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const controlsUiRef = useRef<HTMLDivElement | null>(null);

    //Vars
    const scaleSet = { scaleX: 1, scaleY: 1, scaleZ: 1 }
    const EQData = useMemo(() => (data), [data]);
    const depthMax = Math.max(350, ...EQData.map((p) => p.depth));

    //Hooks
    const { worldRef, sceneRef, cameraRef, rendererRef } = useThreeSetup({ canvasRef });
    useTerrain({ rendererRef, worldRef, depthMax });
    useEQPoints({ worldRef, cameraRef, rendererRef, tooltipRef, EQData, depthMax });
    useGuiControls({ worldRef, controlsUiRef, scaleSet });

    //Check Init
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;
        if (!canvasRef.current || !worldRef.current || !sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    }, [])

    return (
        <>
            <div ref={containerRef} className="container">
                <canvas ref={canvasRef} className="canvas" />
                <div ref={tooltipRef} className="tooltip" />
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
                
                .tooltip {
                    display: none;
                    position: fixed;
                    z-index: 10;
                    padding: 6px 8px;
                    pointer-events: none;

                    font-size: 12px;
                    white-space: pre;
                    color: #fff;
                    background: rgba(0, 0, 0, 0.75);
                    border-radius: 4px;
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
