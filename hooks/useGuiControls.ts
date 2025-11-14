import { useEffect } from "react";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";

import type { GuiControlsProps } from "@/types/type";

export function useGuiControls({ worldRef, controlsUiRef, scaleSet }: GuiControlsProps) {
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

    }, [worldRef, controlsUiRef, scaleSet])
}