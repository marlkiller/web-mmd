import { buildGuiItem } from "@/app/utils/gui";
import { useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { useMemo } from "react";
import * as THREE from "three";

function Skybox() {
    const { scene } = useThree();

    const updateColor = useMemo(() => {
        const color = new THREE.Color();
        // 1. Define dimensions (Power of two is best for performance)
        const width = 64;
        const height = 32; // 2:1 Aspect ratio for Equirectangular maps
        const size = width * height;
        const data = new Uint8Array(4 * size);
        
        return (colorStr: string) => {
            if (scene.environment)  {
                const dataTexture = scene.environment as THREE.DataTexture;
                scene.environment = null; // Unset environment to allow texture disposal
                dataTexture.dispose(); // Clean up previous texture
            }

            // 3. Create the DataTexture
            const dataTexture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    
            // 4. CRITICAL: Configure the mapping type for Environment Maps
            dataTexture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = dataTexture;
            color.set(colorStr);
            // 2. Fill the data array with procedural RGBA pixel data (Example: Gradient)
            for (let i = 0; i < size; i++) {
                const stride = i * 4;
                data[stride] = Math.floor(color.r * 255); // Red
                data[stride + 1] = Math.floor(color.g * 255); // Green
                data[stride + 2] = Math.floor(color.b * 255); // Blue
                data[stride + 3] = 255; // Alpha
            }
            dataTexture.needsUpdate = true; // Ensure the texture updates with new data
        }
    }, [scene])

    useControls("Skybox", {
        "envColor": buildGuiItem("envColor", (value) => {
            updateColor(value)
        }),
        "envIntensity": {
            ...buildGuiItem("envIntensity", (value) => {
                scene.environmentIntensity = value
            }),
            max: 1.0,
            min: 0.0
        },
        "envRotation": buildGuiItem("envRotation", (value) => {
            scene.environmentRotation = value
        })
    }, { order: 2, collapsed: true })
    return <></>
}

export default Skybox;