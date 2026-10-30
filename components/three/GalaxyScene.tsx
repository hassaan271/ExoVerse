"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { FEATURED_SYSTEM_IDS } from "@/lib/catalogIndex";
import {
  createDustLanes,
  createGalaxyGlow,
  createGalaxyStars,
  createSkyCloud,
  GALACTIC_CENTRE,
  type GalaxyViewMode,
  hasPosition,
  markerSize,
  NEIGHBOURHOOD_RINGS_LY,
  neighbourhoodPosition,
  ringRadius,
  SUN_POSITION,
  trueScalePosition,
} from "@/lib/galaxyLayout";
import { starColor } from "@/lib/planet-visuals/visualProfile";
import type { SystemSummary } from "@/types/planet";
import { PointCloudLayer } from "./PointCloudLayer";
import { SceneCanvas } from "./SceneCanvas";
import { type SceneLabel, SceneLabels } from "./SceneLabels";
import { MARKER_STATE, SystemMarkers } from "./SystemMarkers";
import { useOrbitControls } from "./useOrbitControls";
import { useHdrRender } from "./useHdrRender";
import { type LabelSlot, useScreenPicking } from "./useScreenPicking";

export interface GalaxyControls {
  zoom: (factor: number) => void;
  reset: () => void;
}

const SUN = new THREE.Vector3(...SUN_POSITION);

const HOME: Record<GalaxyViewMode, { target: THREE.Vector3; offset: THREE.Vector3 }> = {
  galaxy: { target: new THREE.Vector3(-16, 0, 0), offset: new THREE.Vector3(-62, 215, 235) },
  neighbourhood: { target: SUN, offset: new THREE.Vector3(-48, 62, 78) },
};

/** How close a selection brings the true-scale camera, about 3,500 parsecs. */
const SELECTED_DISTANCE = 35;
const UNKNOWN_STAR_COLOR = "#9a9a9a";
const SUN_SIZE = 0.02;
const MODE_SPEED = 2.4;
const DUST_OPACITY = 0.34;

// Stable references, so a parent render never reconfigures the canvas.
const CANVAS_GL = { antialias: false, powerPreference: "high-performance" } as const;
const CANVAS_DPR: [number, number] = [1, 1.25];
const CANVAS_CAMERA = { fov: 40, near: 0.1, far: 3000, position: [-78, 215, 235] } as const;

/**
 * Tilt limits. The true-scale view stays above the disc and short of edge-on:
 * a thin disc seen edge-on reads as a flat line, and from below it's mirrored.
 */
const TILT: Record<GalaxyViewMode, [number, number]> = {
  galaxy: [Math.PI * 0.05, Math.PI * 0.45],
  neighbourhood: [Math.PI * 0.05, Math.PI * 0.95],
};

const shortestAngle = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

const RING_POINTS = Array.from({ length: 129 }, (_, index) => {
  const angle = (index / 128) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
});

interface GalaxyWorldProps {
  plotted: SystemSummary[];
  selectedIndex: number;
  matching: Set<string> | null;
  mode: GalaxyViewMode;
  paused: boolean;
  onSelect: (index: number) => void;
  controlsRef: RefObject<GalaxyControls | null>;
  labelSlots: RefObject<LabelSlot[]>;
  onReady: () => void;
}

function GalaxyWorld({
  plotted,
  selectedIndex,
  matching,
  mode,
  paused,
  onSelect,
  controlsRef,
  labelSlots,
  onReady,
}: GalaxyWorldProps) {
  const camera = useThree((state) => state.camera);
  // Read once: rebuilding every cloud on a resize would be a visible hitch.
  const [compact] = useState(() => window.innerWidth < 760);

  useHdrRender();

  const controls = useOrbitControls({
    minDistance: 3,
    maxDistance: 620,
    autoRotateSpeed: 0.1,
    minPolarAngle: TILT.galaxy[0],
    maxPolarAngle: TILT.galaxy[1],
    manualUpdate: true,
  });

  const { positions, localPositions, colors, sizes } = useMemo(() => {
    const ring = NEIGHBOURHOOD_RINGS_LY.map(
      (lightYears) => new THREE.Vector3(SUN.x + ringRadius(lightYears), SUN.y, SUN.z),
    );
    const centre = new THREE.Vector3(...GALACTIC_CENTRE);
    // Only plotted systems are markers, and the Sun is one more, last. Label
    // anchors follow in `positions` for useScreenPicking, without being drawn.
    return {
      positions: [
        ...plotted.map((system) => new THREE.Vector3(...trueScalePosition(system))),
        SUN,
        centre,
        ...ring,
      ],
      localPositions: [
        ...plotted.map((system) => new THREE.Vector3(...neighbourhoodPosition(system))),
        SUN,
        centre,
        ...ring,
      ],
      colors: [
        ...plotted.map(
          (system) =>
            new THREE.Color(
              starColor(system.starTemperatureK, system.spectralType) ?? UNKNOWN_STAR_COLOR,
            ),
        ),
        new THREE.Color("#ffffff"),
      ],
      sizes: [
        ...plotted.map((system) =>
          markerSize(
            system.starRadiusSolar,
            system.planets.length,
            FEATURED_SYSTEM_IDS.includes(system.id),
          ),
        ),
        SUN_SIZE,
      ],
    };
  }, [plotted]);

  const markerCount = plotted.length + 1;
  const markerPositions = useMemo(() => positions.slice(0, markerCount), [positions, markerCount]);
  const markerLocal = useMemo(
    () => localPositions.slice(0, markerCount),
    [localPositions, markerCount],
  );

  const pointsRef = useRef(positions);
  pointsRef.current = mode === "galaxy" ? positions : localPositions;

  const stateRef = useRef(new Float32Array(markerCount));
  const stateDirty = useRef(true);
  const hoveredRef = useRef<number | null>(null);

  const writeState = () => {
    const state = stateRef.current;
    for (let index = 0; index < plotted.length; index += 1) {
      state[index] =
        index === selectedIndex
          ? MARKER_STATE.selected
          : index === hoveredRef.current
            ? MARKER_STATE.hovered
            : !matching || matching.has(plotted[index].id)
              ? MARKER_STATE.normal
              : MARKER_STATE.dimmed;
    }
    stateDirty.current = true;
  };

  useEffect(writeState, [selectedIndex, matching, plotted]); // eslint-disable-line react-hooks/exhaustive-deps

  useScreenPicking({
    points: pointsRef,
    pickableCount: plotted.length,
    labels: labelSlots,
    onSelect,
    onHover: (index) => {
      hoveredRef.current = index;
      writeState();
      // Written straight to the label, so hovering never renders React.
      const slot = labelSlots.current[labelSlots.current.length - 1];
      slot.point = index ?? -1;
      if (slot.element) slot.element.textContent = index === null ? "" : plotted[index].hostname;
    },
  });

  const starCloud = useMemo(() => createGalaxyStars(compact ? 60000 : 170000), [compact]);
  const glowCloud = useMemo(() => createGalaxyGlow(compact ? 2500 : 6000), [compact]);
  const dustCloud = useMemo(() => createDustLanes(compact ? 2000 : 6000), [compact]);
  const skyCloud = useMemo(() => createSkyCloud(compact ? 1500 : 3000), [compact]);

  const fade = useMemo(() => ({ uOpacity: { value: 1 } }), []);
  const dustFade = useMemo(() => ({ uOpacity: { value: DUST_OPACITY } }), []);
  const mix = useMemo(() => ({ value: 0 }), []);

  const ringGeometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(RING_POINTS),
    [],
  );
  useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);

  // A flight eases the pivot and, separately, the camera's angle and distance
  // around it. Angles interpolate on the sphere: a straight line through space
  // from the far side would swing the camera through the centre of the view.
  const flight = useRef({
    target: null as THREE.Vector3 | null,
    view: null as THREE.Spherical | null,
  });
  // Any drag or wheel ends auto-rotation until the view is reset.
  const userMoved = useRef(false);
  const step = useMemo(() => new THREE.Vector3(), []);
  const spherical = useMemo(() => new THREE.Spherical(), []);

  const viewFromOffset = (offset: THREE.Vector3, radius = offset.length()) => {
    const view = new THREE.Spherical().setFromVector3(offset);
    view.radius = radius;
    return view;
  };

  useEffect(() => {
    controls.target.copy(HOME.galaxy.target);
    camera.position.copy(HOME.galaxy.target).add(HOME.galaxy.offset);
    controls.update();
    onReady();

    // The hand always wins: touching the controls cancels any flight.
    const takeOver = () => {
      flight.current.target = null;
      flight.current.view = null;
      userMoved.current = true;
    };
    controls.addEventListener("start", takeOver);
    return () => controls.removeEventListener("start", takeOver);
    // Placed once on arrival. Later changes fly rather than jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  const firstSelection = useRef(true);
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    if (selectedIndex < 0) return;
    userMoved.current = true;
    const places = mode === "galaxy" ? positions : localPositions;
    flight.current.target = places[selectedIndex].clone();
    if (mode === "galaxy") {
      const offset = camera.position.clone().sub(controls.target);
      flight.current.view = viewFromOffset(offset, Math.min(offset.length(), SELECTED_DISTANCE));
    }
    // Follows the selection only. A view change is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const flyHome = (viewMode: GalaxyViewMode) => {
    userMoved.current = false;
    flight.current.target = HOME[viewMode].target.clone();
    flight.current.view = viewFromOffset(HOME[viewMode].offset);
  };

  const firstMode = useRef(true);
  useEffect(() => {
    [controls.minPolarAngle, controls.maxPolarAngle] = TILT[mode];
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    flyHome(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, mode]);

  useEffect(() => {
    controlsRef.current = {
      zoom(factor) {
        const offset = camera.position.clone().sub(controls.target);
        const distance = THREE.MathUtils.clamp(
          offset.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        );
        userMoved.current = true;
        flight.current.view = viewFromOffset(offset, distance);
      },
      reset: () => flyHome(mode),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controls, controlsRef, mode]);

  const ringGroup = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    // Clamped, so a stalled tab resumes smoothly rather than leaping.
    const elapsed = Math.min(delta, 0.05);
    const ease = 1 - Math.exp(-elapsed * 2.6);
    const { target, view } = flight.current;

    if (target) {
      step.copy(target).sub(controls.target).multiplyScalar(ease);
      controls.target.add(step);
      camera.position.add(step);
      if (controls.target.distanceTo(target) < 0.01) flight.current.target = null;
    }

    if (view) {
      step.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(step);
      spherical.theta += shortestAngle(spherical.theta, view.theta) * ease;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi + (view.phi - spherical.phi) * ease,
        controls.minPolarAngle,
        controls.maxPolarAngle,
      );
      spherical.radius = Math.exp(
        THREE.MathUtils.lerp(Math.log(spherical.radius), Math.log(view.radius), ease),
      );
      camera.position.copy(controls.target).add(step.setFromSpherical(spherical));
      if (
        Math.abs(shortestAngle(spherical.theta, view.theta)) < 0.002 &&
        Math.abs(view.phi - spherical.phi) < 0.002 &&
        Math.abs(view.radius - spherical.radius) < 0.02
      ) {
        flight.current.view = null;
      }
    }

    const wanted = mode === "galaxy" ? 0 : 1;
    if (mix.value !== wanted) {
      const change = elapsed * MODE_SPEED;
      mix.value = wanted > mix.value
        ? Math.min(mix.value + change, 1)
        : Math.max(mix.value - change, 0);
      fade.uOpacity.value = 1 - mix.value;
      dustFade.uOpacity.value = DUST_OPACITY * (1 - mix.value);
    }
    if (ringGroup.current) ringGroup.current.visible = mix.value > 0.5;

    // Last, so the camera looks at the moved target in this same frame.
    controls.autoRotate = !paused && !userMoved.current;
    controls.update(elapsed);
  });

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <PointCloudLayer cloud={skyCloud} scale={700} maxSize={2.4} />
      <PointCloudLayer cloud={glowCloud} scale={1500} maxSize={90} fade={fade} />
      <PointCloudLayer cloud={dustCloud} scale={1500} maxSize={40} dark fade={dustFade} />
      <PointCloudLayer cloud={starCloud} scale={520} maxSize={2.6} fade={fade} />

      <group ref={ringGroup} visible={false} position={SUN_POSITION}>
        {NEIGHBOURHOOD_RINGS_LY.map((lightYears) => {
          const radius = ringRadius(lightYears);
          return (
            <lineLoop key={lightYears} geometry={ringGeometry} scale={[radius, 1, radius]}>
              <lineBasicMaterial color="#8a8a8a" transparent opacity={0.35} />
            </lineLoop>
          );
        })}
      </group>

      <SystemMarkers
        positions={markerPositions}
        localPositions={markerLocal}
        colors={colors}
        sizes={sizes}
        stateRef={stateRef}
        stateDirty={stateDirty}
        mix={mix}
      />
    </>
  );
}

interface GalaxySceneProps {
  systems: SystemSummary[];
  selectedId: string;
  /** Ids of systems with a matching planet, or null when nothing is filtered. */
  matching: Set<string> | null;
  mode: GalaxyViewMode;
  paused: boolean;
  onSelect: (id: string) => void;
  controlsRef: RefObject<GalaxyControls | null>;
  onReady: () => void;
  fallback: React.ReactNode;
}

export default function GalaxyScene({
  systems,
  selectedId,
  matching,
  mode,
  paused,
  onSelect,
  controlsRef,
  onReady,
  fallback,
}: GalaxySceneProps) {
  const labelSlots = useRef<LabelSlot[]>([]);
  const plotted = useMemo(() => systems.filter(hasPosition), [systems]);
  const selectedIndex = plotted.findIndex((system) => system.id === selectedId);

  const labels: SceneLabel[] = useMemo(() => {
    const labelled = new Set([
      selectedIndex,
      // At true scale these all sit within a pixel or two of the Sun.
      ...(mode === "galaxy"
        ? []
        : FEATURED_SYSTEM_IDS.map((id) => plotted.findIndex((system) => system.id === id))),
    ]);
    const sun = plotted.length;
    return [
      ...[...labelled]
        .filter((index) => index >= 0)
        .map((index) => ({
          key: plotted[index].id,
          text: plotted[index].hostname,
          point: index,
          selected: index === selectedIndex,
          onClick: () => onSelect(plotted[index].id),
        })),
      { key: "sun", text: "Sun", point: sun, side: "left" as const },
      ...(mode === "galaxy"
        ? [{ key: "centre", text: "Galactic centre", point: sun + 1 }]
        : NEIGHBOURHOOD_RINGS_LY.map((lightYears, index) => ({
            key: `ring-${lightYears}`,
            text: `${lightYears.toLocaleString("en-US")} ly`,
            point: sun + 2 + index,
          }))),
      // Filled in directly on hover. Must stay last: see onHover in GalaxyWorld.
      { key: "hover", text: "", point: -1 },
    ];
  }, [plotted, selectedIndex, onSelect, mode]);

  const selectIndex = useCallback(
    (index: number) => onSelect(plotted[index].id),
    [onSelect, plotted],
  );

  return (
    <>
      <SceneCanvas
        fallback={fallback}
        dpr={CANVAS_DPR}
        gl={CANVAS_GL}
        camera={CANVAS_CAMERA}
      >
        <GalaxyWorld
          plotted={plotted}
          selectedIndex={selectedIndex}
          matching={matching}
          mode={mode}
          paused={paused}
          onSelect={selectIndex}
          controlsRef={controlsRef}
          labelSlots={labelSlots}
          onReady={onReady}
        />
      </SceneCanvas>
      <SceneLabels labels={labels} slots={labelSlots} />
    </>
  );
}
