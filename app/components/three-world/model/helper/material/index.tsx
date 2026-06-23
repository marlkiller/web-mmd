import defaultConfig from '@/app/presets/Default_config.json';
import usePresetStore from "@/app/stores/usePresetStore";
import { buildGuiItem, buildMaterialGuiFunc, setLevaValue } from "@/app/utils/gui";
import { button, folder, useControls } from "leva";
import { OnChangeHandler, Schema } from "leva/dist/declarations/src/types";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useModel } from '../ModelContext';
import isRenderGui from '../useRenderGui';
import usePngTex from './usePngTex';
import { ColorRepresentation } from 'three';
import defaultStyles from './default-styles.json'
import lightsPhysicalFragment from './shaders/lights_physical_fragment.glsl'
import lightsPhysicalParsFragment from './shaders/lights_physical_pars_fragment.glsl'
import commonGLSL from './shaders/common.glsl'

function Material() {
    const model = useModel()
    const materials = model.material as THREE.MeshPhysicalMaterial[]
    const geometry = model.geometry

    const targetMaterialIdxSaved = usePresetStore(states => states.targetMaterialIdx)
    const targetMaterialIdx = targetMaterialIdxSaved < materials.length ? targetMaterialIdxSaved : 0
    const targetMaterial = materials[targetMaterialIdx]
    const savedMaterials = usePresetStore(states => states.materials)[model.name] ?? {}
    const savedMaterial = savedMaterials[targetMaterial.name]

    const normals = useRef<THREE.BufferAttribute>(null)
    const normalsOrig = useRef<THREE.BufferAttribute>(null)

    const [controls, setControls] = useState<Schema>()

    const mapOptions = usePngTex(model)

    const needsUpdate = (material: THREE.Material) => {
        return () => {
            material.needsUpdate = true;
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.normal.needsUpdate = true;
        };
    }
    const constants = {
        side: {
            'THREE.FrontSide': THREE.FrontSide,
            'THREE.BackSide': THREE.BackSide,
            'THREE.DoubleSide': THREE.DoubleSide
        }
    }

    const defaultUserData = {
        faceForward: 0,
        map: "none",
        emissiveMap: "none",
        roughnessMap: "none",
        smoothnessMap: "none",
        metalnessMap: "none",
        normalMap: "none",
        normalMapLoop: 1,
        subNormalMap: "none",
        subNormalMapLoop: 1,
        anisotropyMap: "none",
        anisotropyMapLoop: 1,
        envMap: "none",
    }

    const stylesMap = useRef<Record<string, Set<number>>>({}).current
    const origMaterials = useRef<THREE.MeshPhysicalMaterial[]>([]).current

    const updateControls = (idx: number, init = false) => {
        const material = materials[idx]
        if (!material) return

        const buildMGuiItem = buildMaterialGuiFunc(model, idx, origMaterials[idx])
        const buildMapItem = (materialKey: string, userDataKey?: string, modifyTexture?: Function) => {
            const handler: OnChangeHandler = (texturePath: keyof typeof mapOptions) => {
                const texture = mapOptions[texturePath]
                if (texture === undefined || _.get(material, `${materialKey}.name`) === texturePath) return
                _.set(material, materialKey, texture);
                if (materialKey == 'map' && material.map) {
                    material.map.colorSpace = THREE.SRGBColorSpace
                    material.map.needsUpdate = true
                }
                modifyTexture?.(texture)
                material.needsUpdate = true;
            }
            if (userDataKey === undefined) {
                userDataKey = materialKey
            }
            return buildMGuiItem(`userData.${userDataKey}`, [handler, Object.keys(mapOptions)])
        }

        const origFragmentShader = material.userData.fragmentShader;
        const origVertexShader = material.userData.vertexShader;
        const onBeforeCompiles: Record<string, typeof material.onBeforeCompile> = {}
        material.onBeforeCompile = (parameters, renderer) => {
            parameters.vertexShader = origVertexShader
            parameters.fragmentShader = origFragmentShader
            for (const [key, onBeforeCompile] of Object.entries(onBeforeCompiles)) {
                onBeforeCompile(parameters, renderer)
            }
        }
        const targetAxis = new THREE.Vector3(0, 0.3, 1)
        const normalOrig = new THREE.Vector3()
        const faceForward = (ratio: number) => {
            if (ratio <= 0) return
            const group = geometry.groups[idx]
            for (let i = 0; i < group.count; i++) {
                const vertexIdx = geometry.index.array[group.start + i]
                const start = vertexIdx * normals.current.itemSize

                normalOrig.fromArray(normalsOrig.current.array, start)
                const angle = normalOrig.angleTo(targetAxis)
                if (angle < Math.PI * 0.6) {
                    normalOrig.lerp(targetAxis, ratio)
                    normals.current.set(normalOrig.toArray(), start)
                }
            }
            normals.current.needsUpdate = true;
        }
        const smoothnessToRoughness = (texture: THREE.Texture) => {
            if (!texture) {
                delete onBeforeCompiles["smoothness"]
            } else {
                onBeforeCompiles["smoothness"] = (parameters, renderer) => {
                    parameters.fragmentShader = parameters.fragmentShader.replace(
                        '#include <roughnessmap_fragment>',
                        `float roughnessFactor = roughness;
                        #ifdef USE_ROUGHNESSMAP
                            vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
                            roughnessFactor *= 1.0 - texelRoughness.g;
                        #endif`
                    );
                }
            }
            const cacheKey = Math.random().toString()
            material.customProgramCacheKey = () => cacheKey;
        }

        const RNMapping = (texture: THREE.Texture) => {
            if (!texture) {
                delete onBeforeCompiles["RNMapping"]
            } else {
                onBeforeCompiles["RNMapping"] = (parameters, renderer) => {
                    parameters.uniforms.detailMap = { value: texture };
                    parameters.uniforms.subNormalMapTransform = { value: texture.matrix };

                    parameters.vertexShader = parameters.vertexShader
                        .replace(
                            '#include <uv_pars_vertex>',
                            `
                            #include <uv_pars_vertex>
                            #ifdef USE_NORMALMAP
                                uniform mat3 subNormalMapTransform;
                                varying vec2 vSubNormalMapUv;
                            #endif
                            `
                        )
                        .replace(
                            '#include <uv_vertex>',
                            `
                            #include <uv_vertex>
                            #ifdef USE_NORMALMAP
                                vSubNormalMapUv = ( subNormalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
                            #endif
                            `
                        )

                    parameters.fragmentShader = parameters.fragmentShader
                        .replace(
                            '#include <uv_pars_fragment>',
                            `
                            #include <uv_pars_fragment>
                            #ifdef USE_NORMALMAP
                                varying vec2 vSubNormalMapUv;
                            #endif
                            `
                        )
                        .replace(
                            '#include <normalmap_pars_fragment>',
                            `
                            #include <normalmap_pars_fragment>
                            #ifdef USE_NORMALMAP
                                uniform sampler2D detailMap;
                            #endif
                            `
                        )
                        .replace(
                            '#include <normal_fragment_maps>',
                            `
                            #ifdef USE_NORMALMAP
                                vec3 t = texture2D(normalMap, vNormalMapUv).xyz * vec3(2, 2, 2) + vec3(-1, -1, 0);
                                vec3 u = texture2D(detailMap, vSubNormalMapUv).xyz * vec3(-2, -2, 2) + vec3(1, 1, -1);
                                vec3 mapN = (normalize(t * dot(t, u) - u * t.z) + 1.0) / 2.0;
                                mapN.xy *= normalScale;
                                normal = normalize( tbn * mapN );
                            #endif
                            `
                        );
                }
            }
            const cacheKey = Math.random().toString()
            material.customProgramCacheKey = () => cacheKey;
        }

        const AnisotropyMapping = (texture: THREE.Texture) => {
            if (!texture) {
                delete onBeforeCompiles["AnisotropyMapping"]
            } else {
                onBeforeCompiles["AnisotropyMapping"] = (parameters, renderer) => {
                    parameters.fragmentShader = parameters.fragmentShader
                        .replace(
                            '#include <lights_physical_pars_fragment>',
                            lightsPhysicalParsFragment
                        )
                        .replace(
                            '#include <lights_physical_fragment>',
                            lightsPhysicalFragment
                        )
                        .replaceAll(
                            '#include <common>',
                            commonGLSL
                        )
                }
            }
            const cacheKey = Math.random().toString()
            material.customProgramCacheKey = () => cacheKey;
        }

        const buildMapLoop = (key: string, getTexture: () => THREE.Texture | null) => {
            const handler = (val: number) => {
                const texture = getTexture()
                if (!texture) return
                texture.repeat.set(val, val)
                texture.updateMatrix()
            }
            return buildMGuiItem(`userData.${key}`, handler)
        }

        const controls = {
            "faceForward": buildMGuiItem("userData.faceForward", faceForward, 0, 1),
            'visible': buildMGuiItem("visible"),
            'color': buildMGuiItem("color"),
            'map': buildMapItem("map"),
            'anisotropy': buildMGuiItem("anisotropy"),
            'anisotropyMap': buildMapItem("anisotropyMap", "anisotropyMap", AnisotropyMapping),
            'anisotropyMapLoop': buildMapLoop("anisotropyMapLoop", () => material.anisotropyMap),
            'anisotropyRotation': buildMGuiItem("anisotropyRotation", null, 0, Math.PI * 2),
            'emissive': buildMGuiItem("emissive"),
            'emissiveMap': buildMapItem("emissiveMap"),
            'emissiveIntensity': buildMGuiItem("emissiveIntensity"),
            'roughness': buildMGuiItem("roughness"),
            'roughnessMap': buildMapItem("roughnessMap"),
            'smoothnessMap': buildMapItem("roughnessMap", "smoothnessMap", smoothnessToRoughness),
            'metalness': buildMGuiItem("metalness"),
            'metalnessMap': buildMapItem("metalnessMap"),
            'ior': buildMGuiItem("ior", null, 1, 2.333),
            'reflectivity': buildMGuiItem("reflectivity"),
            'iridescence': buildMGuiItem("iridescence"),
            'iridescenceIOR': buildMGuiItem("iridescenceIOR", null, 1, 2.333),
            'sheen': buildMGuiItem("sheen"),
            'sheenRoughness': buildMGuiItem("sheenRoughness"),
            'sheenColor': buildMGuiItem("sheenColor"),
            'clearcoat': buildMGuiItem("clearcoat"),
            'clearcoatRoughness': buildMGuiItem("clearcoatRoughness"),
            'specularIntensity': buildMGuiItem("specularIntensity"),
            'specularColor': buildMGuiItem("specularColor"),
            'thickness': buildMGuiItem("thickness"),
            'transmission': buildMGuiItem("transmission"),
            'fog': buildMGuiItem("fog", needsUpdate(material)),
            'normalMap': buildMapItem("normalMap"),
            'normalMapLoop': buildMapLoop("normalMapLoop", () => material.normalMap),
            'subNormalMap': buildMapItem("", "subNormalMap", RNMapping),
            'subNormalMapLoop': buildMapLoop("subNormalMapLoop", () => mapOptions[material.userData.subNormalMap]),
            'envMap': buildMapItem("envMap"),
            'envMapIntensity': buildMGuiItem("envMapIntensity"),
            "reset All": button(() => {
                usePresetStore.setState(({ materials }) => {
                    _.unset(materials, [model.name, material.name])
                    return { materials: { ...materials } }
                })
                const materials = model.material as THREE.MeshPhysicalMaterial[]
                materials[idx].copy(origMaterials[idx])
                updateControls(idx)
            }),
            "debug": folder({
                'only show this': {
                    value: false,
                    onChange: (state) => {
                        for (const m of materials) {
                            if (m == material && state) continue
                            m.visible = !state
                        }
                    }
                },
                'transparent': buildMGuiItem("transparent"),
                'opacity': buildMGuiItem("opacity"),
                'depthTest': buildMGuiItem("depthTest"),
                'depthWrite': buildMGuiItem("depthWrite"),
                'alphaTest': buildMGuiItem("alphaTest"),
                'alphaHash': buildMGuiItem("alphaHash"),
                'side': buildMGuiItem("side"),
                'flatShading': buildMGuiItem("flatShading", needsUpdate(material)),
                'wireframe': buildMGuiItem("wireframe"),
                'vertexColors': buildMGuiItem("vertexColors", needsUpdate(material)),
            }, { collapsed: true })
        }

        if (init) {
            for (const controlKey of Object.keys(defaultUserData)) {
                const controller = controls[controlKey]
                controller.onChange(controller.value, null, { initial: true } as any)
            }
            return
        }
        setControls(controls)
    }

    const setFromStyle = (styleName: string, materialIdx: number) => {
        const material = materials[materialIdx]
        const styleConfig = { ...styles[styleName] }
        const colors = {}
        for (const [key, val] of Object.entries(styleConfig)) {
            if (CSS.supports('color', val as string)) {
                colors[key] = val
                delete styleConfig[key]
            }
        }
        _.merge(material, styleConfig)
        for (const [key, val] of Object.entries(colors)) {
            (material[key] as THREE.Color).set(val as ColorRepresentation)
        }
    }

    const initMaterials = () => {
        normalsOrig.current = geometry.attributes.normal.clone()
        normals.current = geometry.attributes.normal as THREE.BufferAttribute

        for (const [idx, material] of materials.entries()) {
            const userData = { ...defaultUserData }
            if (material.map?.name) {
                userData.map = material.map.name
            }
            _.merge(material.userData, userData)
            origMaterials[idx] = material.clone()
            const savedMaterial = savedMaterials[material.name]
            if (savedMaterial) {
                for (const [key, val] of Object.entries(savedMaterial)) {
                    if (CSS.supports('color', val as string)) {
                        savedMaterial[key] = new THREE.Color(val as ColorRepresentation)
                    }
                }
                if (savedMaterial.userData?.style) {
                    if (!stylesMap[savedMaterial.userData.style]) {
                        stylesMap[savedMaterial.userData.style] = new Set()
                    }
                    stylesMap[savedMaterial.userData.style].add(idx)
                    setFromStyle(savedMaterial.userData.style, idx)
                }
                _.merge(material, savedMaterial)
                updateControls(idx, true)
            }
        }
    }

    useEffect(() => {
        initMaterials();
    }, [model])

    const materialMap = useMemo(() =>
        Object.fromEntries(
            materials.map((m, i) => [m.name, i])
        ), [model])

    const materialStyles = usePresetStore(states => states.materialStyles)
    const styles = useMemo(() => ({
        ...defaultStyles,
        ...materialStyles
    }), [materialStyles]) as Record<string, any>
    const styleOptions = useMemo(() => [
        "none",
        ...Object.keys(styles)
    ], [styles])

    useEffect(() => {
        updateControls(targetMaterialIdx);
    }, [targetMaterialIdx])

    const updateStyleMap = (styleName: string, prevStyleName: string, materialIdx: number) => {
        stylesMap[prevStyleName]?.delete(materialIdx)
        if (styleName != "none") {
            if (!stylesMap[styleName]) {
                stylesMap[styleName] = new Set()
            }
            stylesMap[styleName].add(materialIdx)
        }
    }

    useControls(`Model.${model.name}.Material`, () => ({
        "targetMaterial": {
            ...buildGuiItem("targetMaterialIdx"),
            options: materialMap,
        },
        "style": {
            value: savedMaterial?.userData?.style ?? "none",
            options: styleOptions,
            onChange: (styleName: string, path, options) => {
                if (options.initial) {
                    setLevaValue(path, savedMaterial?.userData?.style ?? "none")
                    return
                }
                const { targetMaterialIdx } = usePresetStore.getState()
                updateStyleMap(styleName, savedMaterial?.userData?.style, targetMaterialIdx)
                if (styleName != "none") {
                    setFromStyle(styleName, targetMaterialIdx)
                    updateControls(targetMaterialIdx)
                }
                usePresetStore.setState(({ materials }) => {
                    _.set(materials, [model.name, targetMaterial.name, "userData", "style"], styleName)
                    return { materials: { ...materials } }
                })
            }
        },
        "Save as style": button(() => {
            const styleName = prompt("Enter style name:", savedMaterial?.userData?.style ?? "")
            if (!styleName) return
            updateStyleMap(styleName, savedMaterial?.userData?.style, targetMaterialIdx)
            usePresetStore.setState(({ materials, materialStyles }) => {
                const savedMaterial = materials[model.name]?.[targetMaterial.name] ?? {}
                _.set(savedMaterial, ["userData", "style"], styleName)
                materialStyles[styleName] = { ...savedMaterial }
                return { materialStyles: { ...materialStyles } }
            })
            for (const materialIdx of stylesMap[styleName] ?? []) {
                if (materialIdx == targetMaterialIdx) continue
                setFromStyle(styleName, materialIdx)
                updateControls(materialIdx, true)
            }
            setLevaValue(`Model.${model.name}.Material.style`, styleName)
        }),
        ...controls,
    }), { collapsed: true, render: () => isRenderGui(model.name) }, [styleOptions, controls, materialMap])

    return <></>;
}

export default Material;