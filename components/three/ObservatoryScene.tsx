"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ProceduralPlanet } from "@/components/3d/ProceduralPlanet";
import {
  createDustLanes,
  createGalaxyGlow,
  createGalaxyStars,
  createSkyCloud,
  type PointCloud,
} from "@/lib/galaxyLayout";
import type { DiscoveredSystem, ObservatoryModel } from "@/lib/observatories";
import {
  EARTH_RADIUS,
  galaxyOrientation,
  L2_POSITION,
  type Orbit,
  orbitPoints,
  type PlacedItem,
  SKY_RADIUS,
  skyPoint,
  SUN_POSITION,
  surveyDirection,
} from "@/lib/observatoryLayout";
import { PORTRAIT_DETAIL } from "@/lib/planet-visuals/createPlanetObject";
import { EARTH } from "@/lib/referenceBodies";
import { PointCloudLayer } from "./PointCloudLayer";
import { type SceneLabel, SceneLabels } from "./SceneLabels";
import { SceneCanvas } from "./SceneCanvas";
import { SpacecraftModel } from "./SpacecraftModel";
import { useHdrRender } from "./useHdrRender";
import { useOrbitControls } from "./useOrbitControls";
import { type LabelSlot, useScreenPicking } from "./useScreenPicking";

export type SceneView = "map" | "spacecraft" | "sky";

const MODEL_SIZE = 1.6;
const FOCUS_DISTANCE = 4.6;
const NO_MODEL_DISTANCE = 12;
const SKY_LINES = 90;
const CAMERA_EASE = 2.6;
const ARRIVED = 0.02;
const MAP_CAMERA = new THREE.Vector3(30, 58, 172);
const MAP_TARGET = new THREE.Vector3(-46, 0, 0);
/** The Milky Way as a backdrop: the Sun sits at the origin of this scene. */
const GALAXY_SCALE = 15;
const GALAXY_ROTATION = galaxyOrientation();
const TO_SUN = new THREE.Vector3(1, 0.12, 0.2).normalize();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const STATUS_COLOR: Record<PlacedItem["status"], THREE.ColorRepresentation> = {
  current: "#f1eee7",
  future: "#a8a49a",
  historical: "#d9b48a",
  ground: "#a9b58f",
};

const UNIT_CIRCLE = new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
  }),
);

function markerCloud(items: PlacedItem[]): PointCloud {
  const positions = new Float32Array(items.length * 3);
  const colors = new Float32Array(items.length * 3);
  const sizes = new Float32Array(items.length);
  const color = new THREE.Color();
  items.forEach((item, index) => {
    item.position.toArray(positions, index * 3);
    color.set(STATUS_COLOR[item.status]).toArray(colors, index * 3);
    sizes[index] = item.planets > 0 ? 1.4 : 1;
  });
  return { positions, colors, sizes };
}

function systemCloud(systems: DiscoveredSystem[]): PointCloud {
  const positions = new Float32Array(systems.length * 3);
  const colors = new Float32Array(systems.length * 3);
  const sizes = new Float32Array(systems.length);
  systems.forEach((system, index) => {
    skyPoint(system).toArray(positions, index * 3);
    colors.set([0.95, 0.9, 0.8], index * 3);
    sizes[index] = 3.4 + Math.min(system[2], 6) * 0.9;
  });
  return { positions, colors, sizes };
}

function OrbitLine({ orbit, selected }: { orbit: Orbit; selected: boolean }) {
  const geometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(orbitPoints(orbit)),
    [orbit],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial
        color={selected ? "#f1eee7" : "#8f8b83"}
        transparent
        opacity={selected ? 0.8 : 0.13}
        depthWrite={false}
      />
    </lineLoop>
  );
}

/** Scientific links, not travel paths: they fade out before reaching the sky. */
function Connections({ from, systems }: { from: THREE.Vector3; systems: DiscoveredSystem[] }) {
  const geometry = useMemo(() => {
    const shown = systems.slice(0, SKY_LINES);
    const positions = new Float32Array(shown.length * 6);
    const colors = new Float32Array(shown.length * 6);
    shown.forEach((system, index) => {
      from.toArray(positions, index * 6);
      skyPoint(system).toArray(positions, index * 6 + 3);
      colors.set([0.8, 0.74, 0.62, 0.07, 0.06, 0.05], index * 6);
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    result.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return result;
  }, [from, systems]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        vertexColors
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function Highlight({ position }: { position: THREE.Vector3 }) {
  const ring = useRef<THREE.Mesh>(null);
  const camera = useThree((state) => state.camera);
  useFrame(() => ring.current?.quaternion.copy(camera.quaternion));
  return (
    <mesh ref={ring} position={position}>
      <ringGeometry args={[1.42, 1.428, 96]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

interface WorldProps {
  items: PlacedItem[];
  selected: PlacedItem | null;
  model: ObservatoryModel;
  systems: DiscoveredSystem[];
  view: SceneView;
  reducedMotion: boolean;
  labelSlots: RefObject<LabelSlot[]>;
  onHover: (index: number | null) => void;
  onPick: (index: number) => void;
  onModelLoaded: (failed: boolean) => void;
  onEarthReady: () => void;
}

function ObservatoryWorld({
  items,
  selected,
  model,
  systems,
  view,
  reducedMotion,
  labelSlots,
  onHover,
  onPick,
  onModelLoaded,
  onEarthReady,
}: WorldProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const controls = useOrbitControls({ minDistance: 1.4, maxDistance: 2400, manualUpdate: true });
  useHdrRender();

  // Reflections for the metal and foil on real spacecraft models. Planets use
  // their own shaders and are untouched.
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const environment = generator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.3;
    generator.dispose();
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene]);

  const skyCloud = useMemo(() => createSkyCloud(3000), []);
  const galaxyStars = useMemo(() => createGalaxyStars(90000), []);
  const galaxyGlow = useMemo(() => createGalaxyGlow(4000), []);
  const galaxyDust = useMemo(() => createDustLanes(3000), []);
  const dustFade = useMemo(() => ({ uOpacity: { value: 0.34 } }), []);
  const markers = useMemo(() => markerCloud(items), [items]);
  const skyPoints = useMemo(() => systemCloud(systems), [systems]);

  const points = useRef<THREE.Vector3[]>([]);
  useMemo(() => {
    points.current = [...items.map((item) => item.position), ...systems.map(skyPoint)];
  }, [items, systems]);

  useScreenPicking({
    points,
    pickableCount: items.length + systems.length,
    labels: labelSlots,
    onHover,
    onSelect: onPick,
  });

  // Where the camera is headed. A drag cancels the move, so the user always wins.
  const goal = useRef<{ camera: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  useEffect(() => {
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useEffect(() => {
    if (!selected || view === "map") {
      goal.current = { camera: MAP_CAMERA.clone(), target: MAP_TARGET.clone() };
    } else if (view === "spacecraft") {
      const outward = selected.position.clone().normalize();
      const side = new THREE.Vector3().crossVectors(outward, WORLD_UP).normalize();
      const distance = model.kind === "none" ? NO_MODEL_DISTANCE : FOCUS_DISTANCE;
      goal.current = {
        target: selected.position.clone(),
        camera: selected.position
          .clone()
          .addScaledVector(outward, distance * 0.72)
          .addScaledVector(side, distance * 0.6)
          .addScaledVector(WORLD_UP, distance * 0.34),
      };
    } else {
      // Look past the spacecraft along the survey, with the links fanning ahead.
      const direction = surveyDirection(systems) ?? new THREE.Vector3(0.3, 0.8, 0.5).normalize();
      const side = new THREE.Vector3().crossVectors(direction, WORLD_UP).normalize();
      goal.current = {
        target: selected.position.clone().addScaledVector(direction, SKY_RADIUS * 0.45),
        camera: selected.position
          .clone()
          .addScaledVector(direction, -220)
          .addScaledVector(side, 150)
          .addScaledVector(WORLD_UP, 90),
      };
    }
  }, [model.kind, selected, systems, view]);

  useFrame((_, delta) => {
    const move = goal.current;
    if (move) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 0.25) * CAMERA_EASE);
      camera.position.lerp(move.camera, ease);
      controls.target.lerp(move.target, ease);
      const left = camera.position.distanceTo(move.camera);
      if (left < Math.max(ARRIVED, camera.position.distanceTo(controls.target) * 0.002)) {
        goal.current = null;
      }
    }
    // Wide enough to frame a 1.6-unit model at arm's length and the far sky.
    const near = Math.max(0.05, camera.position.distanceTo(controls.target) * 0.02);
    if (Math.abs(near - (camera as THREE.PerspectiveCamera).near) > 0.001) {
      (camera as THREE.PerspectiveCamera).near = near;
      camera.updateProjectionMatrix();
    }
    controls.update(delta);
  });

  const orbits = useMemo(
    () => items.flatMap((item) => (item.orbit ? [{ id: item.id, orbit: item.orbit }] : [])),
    [items],
  );
  const showConnections = view === "sky" && selected && systems.length > 0;

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.22} />
      <directionalLight position={TO_SUN.clone().multiplyScalar(100)} intensity={1.5} />
      <PointCloudLayer cloud={skyCloud} scale={700} maxSize={2.4} />
      <group
        quaternion={GALAXY_ROTATION}
        scale={GALAXY_SCALE}
      >
        <group position={[81.78, -0.208, 0]}>
          <PointCloudLayer cloud={galaxyGlow} scale={1500 * GALAXY_SCALE} maxSize={120} />
          <PointCloudLayer cloud={galaxyDust} scale={1500 * GALAXY_SCALE} maxSize={60} dark fade={dustFade} />
          <PointCloudLayer cloud={galaxyStars} scale={520 * GALAXY_SCALE} maxSize={2.2} />
        </group>
      </group>

      <mesh position={SUN_POSITION}>
        <sphereGeometry args={[46, 32, 16]} />
        <meshBasicMaterial color={[9, 7.2, 4.6]} toneMapped={false} />
      </mesh>

      <ProceduralPlanet
        planet={EARTH}
        detail={PORTRAIT_DETAIL}
        scale={EARTH_RADIUS}
        paused
        lightDirection={TO_SUN}
        onReady={onEarthReady}
      />

      {orbits.map(({ id, orbit }) => (
        <OrbitLine key={id} orbit={orbit} selected={id === selected?.id} />
      ))}

      <group position={L2_POSITION} rotation={[0, Math.PI / 2, 0]} scale={9}>
        <lineLoop geometry={UNIT_CIRCLE}>
          <lineBasicMaterial color="#8f8b83" transparent opacity={0.3} depthWrite={false} />
        </lineLoop>
      </group>

      <PointCloudLayer key={items.length} cloud={markers} scale={260} maxSize={9} />

      {selected && (
        <group position={selected.position}>
          {model.kind !== "none" && (
            <SpacecraftModel
              key={selected.id}
              model={model}
              size={MODEL_SIZE}
              spin={!reducedMotion}
              onLoaded={onModelLoaded}
            />
          )}
        </group>
      )}
      {selected && view === "spacecraft" && <Highlight position={selected.position} />}

      {showConnections && (
        <>
          <Connections from={selected.position} systems={systems} />
          <PointCloudLayer
            key={selected.id}
            cloud={skyPoints}
            scale={2400}
            maxSize={5}
          />
        </>
      )}
    </>
  );
}

const CANVAS_DPR: [number, number] = [1, 1.5];
const CANVAS_CAMERA = {
  fov: 38,
  near: 0.05,
  far: 6000,
  position: [30, 58, 172] as [number, number, number],
} as const;

type SceneProps = Omit<WorldProps, "labelSlots" | "onHover" | "onPick"> & {
  /** Labels shown all the time, by mission id. */
  labelled: string[];
  onSelect: (id: string) => void;
  onSelectSystem: (id: string) => void;
  fallback: ReactNode;
};

export default function ObservatoryScene({
  labelled,
  onSelect,
  onSelectSystem,
  fallback,
  ...world
}: SceneProps) {
  const { items, systems, selected, view } = world;
  const labelSlots = useRef<LabelSlot[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const pick = (index: number) => {
    if (index < items.length) onSelect(items[index].id);
    else {
      const system = systems[index - items.length];
      if (system) onSelectSystem(system[0]);
    }
  };

  const labels: SceneLabel[] = useMemo(() => {
    const shown = items.flatMap((item, point) =>
      (labelled.includes(item.id) || item.id === selected?.id) &&
      !(item.id === selected?.id && view === "spacecraft")
        ? [{ key: item.id, text: item.short, point, selected: item.id === selected?.id, onClick: () => onSelect(item.id) }]
        : [],
    );
    if (hovered !== null) {
      if (hovered < items.length) {
        const item = items[hovered];
        if (!shown.some(({ key }) => key === item.id)) {
          shown.push({ key: item.id, text: item.short, point: hovered, selected: false, onClick: () => onSelect(item.id) });
        }
      } else {
        const system = systems[hovered - items.length];
        if (system) {
          shown.push({ key: system[0], text: system[1], point: hovered, selected: false, onClick: () => onSelectSystem(system[0]) });
        }
      }
    }
    if (view === "sky") {
      systems.slice(0, 5).forEach((system, index) => {
        if (!shown.some(({ key }) => key === system[0])) {
          shown.push({ key: system[0], text: system[1], point: items.length + index, selected: false, onClick: () => onSelectSystem(system[0]) });
        }
      });
    }
    return shown;
  }, [hovered, items, labelled, onSelect, onSelectSystem, selected, systems, view]);

  return (
    <>
      <SceneCanvas fallback={fallback} dpr={CANVAS_DPR} camera={CANVAS_CAMERA}>
        <ObservatoryWorld {...world} labelSlots={labelSlots} onHover={setHovered} onPick={pick} />
      </SceneCanvas>
      <SceneLabels labels={labels} slots={labelSlots} />
    </>
  );
}
