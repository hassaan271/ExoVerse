"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ObservatoryModel } from "@/lib/observatories";
import { buildReconstruction } from "@/lib/spacecraft/reconstructions";

const SPIN = 0.07;

let loader: GLTFLoader | null = null;

function modelLoader() {
  if (!loader) {
    const draco = new DRACOLoader().setDecoderPath("/draco/");
    loader = new GLTFLoader().setDRACOLoader(draco);
  }
  return loader;
}

/** Spacecraft differ wildly in size and units; every one is fitted to the view. */
function fit(object: THREE.Object3D, size: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const dimensions = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = size / Math.max(dimensions.x, dimensions.y, dimensions.z, 1e-6);
  object.scale.setScalar(scale);
  object.position.copy(center).multiplyScalar(-scale);
}

function dispose(object: THREE.Object3D) {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    for (const material of [node.material].flat()) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** One model at a time, loaded on selection and freed on the way out. */
export function SpacecraftModel({
  model,
  size,
  spin,
  onLoaded,
}: {
  model: ObservatoryModel;
  size: number;
  spin: boolean;
  onLoaded: (failed: boolean) => void;
}) {
  const holder = useRef<THREE.Group>(null);

  useEffect(() => {
    const group = holder.current;
    if (!group || model.kind === "none") return;
    let active = true;
    let object: THREE.Object3D | null = null;

    const show = (loaded: THREE.Object3D) => {
      if (!active) {
        dispose(loaded);
        return;
      }
      object = loaded;
      fit(loaded, size);
      group.add(loaded);
      onLoaded(false);
    };

    if (model.kind === "official") {
      modelLoader().load(
        `/models/observatories/${model.file}`,
        (gltf) => {
          // Opens on the spacecraft's recognisable side.
          group.rotation.y = model.yaw ?? 0;
          show(gltf.scene);
        },
        undefined,
        () => active && onLoaded(true),
      );
    } else {
      show(buildReconstruction(model.build));
    }

    return () => {
      active = false;
      if (object) {
        group.remove(object);
        dispose(object);
      }
    };
  }, [model, onLoaded, size]);

  useFrame((_, delta) => {
    if (spin && holder.current) holder.current.rotation.y += Math.min(delta, 0.05) * SPIN;
  });

  return <group ref={holder} />;
}
