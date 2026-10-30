"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ProceduralPlanet } from "@/components/3d/ProceduralPlanet";
import {
  createDustLanes,
  createGalaxyGlow,
  createGalaxyStars,
  createSkyCloud,
  type PointCloud,
} from "@/lib/galaxyLayout";
import { PORTRAIT_DETAIL } from "@/lib/planet-visuals/createPlanetObject";
import type { PlanetSummary } from "@/types/planet";
import { PointCloudLayer } from "./PointCloudLayer";
import { SceneCanvas } from "./SceneCanvas";
import { useHdrRender } from "./useHdrRender";

export interface LandingControl {
  /** Set true to hurry the intro to its end. */
  skip: boolean;
}

/** Not a catalog record: an artistic planet that exists only for this intro. */
const INTRO_PLANET: PlanetSummary = {
  id: "exoverse-intro",
  name: "ExoVerse Intro",
  hostname: "",
  systemId: "",
  radiusEarth: 3.6,
  radiusJupiter: null,
  massEarth: null,
  massIsMinimum: false,
  density: null,
  temperatureK: 120,
  starTemperatureK: 5800,
  periodDays: null,
  semiMajorAxisAu: null,
  distanceLy: null,
  method: null,
  year: null,
  sizeClass: "Neptune-sized",
  eccentricity: null,
  gapFilledMask: 0,
  limitMask: 0,
  densityIsCalculated: false,
};

const CAMERA_HOME = new THREE.Vector3(-22, 128, 205);
/** Left of the galaxy, so it sits to the right of the hero copy. */
const LOOK_AT = new THREE.Vector3(-58, 0, -6);
const FORWARD = LOOK_AT.clone().sub(CAMERA_HOME).normalize();
const RIGHT = FORWARD.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
const UP = RIGHT.clone().cross(FORWARD).normalize();

const PLANET_DISTANCE = 30;
const PLANET_RADIUS = 5.6;
const PLANET_HOME = CAMERA_HOME.clone().addScaledVector(FORWARD, PLANET_DISTANCE);
const PLANET_LIGHT = new THREE.Vector3(-0.72, 0.42, 0.55).normalize();
const RINGS = [1.5, 1.82, 2.2];

const REVEAL_AT = 2.1;
const EXIT_AT = 2.6;
const EXIT_SECONDS = 1.3;
const APPROACH_DISTANCE = 9;
const POINTER_EASE = 3.2;
const SCROLL_EASE = 6;
const STILL = 0.0006;

const RING_POINTS = Array.from({ length: 129 }, (_, index) => {
  const angle = (index / 128) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
});

function orbitingParticles(count: number): PointCloud {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const ring = RINGS[index % RINGS.length] * PLANET_RADIUS;
    const angle = (index * 2.39996) % (Math.PI * 2);
    positions[index * 3] = Math.cos(angle) * ring;
    positions[index * 3 + 1] = Math.sin(index * 7.1) * 0.12;
    positions[index * 3 + 2] = Math.sin(angle) * ring;
    colors.set([0.95, 0.9, 0.8], index * 3);
    sizes[index] = 1.4 + (index % 4) * 0.5;
  }
  return { positions, colors, sizes };
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t;
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

interface WorldProps {
  playIntro: boolean;
  motion: boolean;
  control: RefObject<LandingControl>;
  stage: RefObject<HTMLElement | null>;
  onReady: () => void;
  onReveal: () => void;
  onFinished: () => void;
}

function LandingWorld({
  playIntro,
  motion,
  control,
  stage,
  onReady,
  onReveal,
  onFinished,
}: WorldProps) {
  const camera = useThree((state) => state.camera);
  const [compact] = useState(() => window.innerWidth < 760);
  const [showPlanet, setShowPlanet] = useState(playIntro);

  const idle = useRef(false);
  const stillFrames = useRef(0);
  const lastSize = useRef({ width: 0, height: 0 });
  useHdrRender(idle);

  // High-frequency values live in refs, so moving the mouse never renders React.
  const pointer = useRef({ targetX: 0, targetY: 0, x: 0, y: 0 });
  const scroll = useRef({ target: 0, value: 0 });
  const timeline = useRef({ running: false, time: 0, revealed: !playIntro, finished: !playIntro });

  useEffect(() => {
    if (!playIntro) onReady();
    // Runs once: the intro plays at most once per scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!motion) return;
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.current.targetX = clampUnit((event.clientX / window.innerWidth) * 2 - 1);
      pointer.current.targetY = clampUnit((event.clientY / window.innerHeight) * 2 - 1);
    };
    const onLeave = () => {
      pointer.current.targetX = 0;
      pointer.current.targetY = 0;
    };
    const onScroll = () => {
      scroll.current.target = Math.min(window.scrollY / window.innerHeight, 1.5);
    };

    onScroll();
    if (hover) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("mouseleave", onLeave);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, [motion]);

  const starCloud = useMemo(() => createGalaxyStars(compact ? 60000 : 170000), [compact]);
  const glowCloud = useMemo(() => createGalaxyGlow(compact ? 2500 : 6000), [compact]);
  const dustCloud = useMemo(() => createDustLanes(compact ? 2000 : 6000), [compact]);
  const skyCloud = useMemo(() => createSkyCloud(compact ? 1500 : 3000), [compact]);
  const nearCloud = useMemo(() => createSkyCloud(compact ? 200 : 450, 130), [compact]);
  const particles = useMemo(() => orbitingParticles(compact ? 36 : 72), [compact]);

  const fade = useMemo(() => ({ uOpacity: { value: playIntro ? 0.3 : 1 } }), [playIntro]);
  const dustFade = useMemo(() => ({ uOpacity: { value: 0.34 } }), []);

  const ringGeometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(RING_POINTS),
    [],
  );
  useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);

  const galaxy = useRef<THREE.Group>(null);
  const sky = useRef<THREE.Group>(null);
  const near = useRef<THREE.Group>(null);
  const planet = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Group>(null);
  const place = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    // Clamped, so a stalled tab eases back rather than leaping.
    const elapsed = Math.min(delta, 0.05);
    const p = pointer.current;
    const s = scroll.current;
    const line = timeline.current;

    const ease = 1 - Math.exp(-elapsed * POINTER_EASE);
    const previousX = p.x;
    const previousY = p.y;
    const previousScroll = s.value;
    p.x += (p.targetX - p.x) * ease;
    p.y += (p.targetY - p.y) * ease;
    s.value += (s.target - s.value) * (1 - Math.exp(-elapsed * SCROLL_EASE));

    let approach = 0;
    if (line.running) {
      if (control.current.skip) line.time = Math.max(line.time, EXIT_AT);
      line.time += elapsed * (control.current.skip ? 1.8 : 1);

      if (!line.revealed && line.time >= REVEAL_AT) {
        line.revealed = true;
        onReveal();
      }

      const exit = clamp01((line.time - EXIT_AT) / EXIT_SECONDS);
      approach = (1 - easeOut(clamp01(line.time / EXIT_AT))) * APPROACH_DISTANCE;
      fade.uOpacity.value = 0.3 + 0.7 * easeOut(exit);
      dustFade.uOpacity.value = 0.34 * fade.uOpacity.value;

      if (planet.current) {
        // The planet slides out past the camera, handing the view to the galaxy.
        planet.current.position
          .copy(PLANET_HOME)
          .addScaledVector(RIGHT, -46 * easeIn(exit))
          .addScaledVector(FORWARD, -9 * easeIn(exit));
        planet.current.rotation.set(p.y * 0.05, p.x * 0.09, 0);
      }
      if (halo.current) halo.current.rotation.y += elapsed * 0.14;

      if (exit >= 1 && !line.finished) {
        line.finished = true;
        line.running = false;
        fade.uOpacity.value = 1;
        dustFade.uOpacity.value = 0.34;
        setShowPlanet(false);
        onFinished();
      }
    }

    // Each layer answers the pointer at its own depth.
    if (galaxy.current) {
      galaxy.current.rotation.y = p.x * 0.018 + s.value * 0.14;
      galaxy.current.rotation.x = p.y * 0.01;
    }
    sky.current?.position.set(p.x * -7, p.y * 4, 0);
    near.current?.position
      .copy(CAMERA_HOME)
      .addScaledVector(RIGHT, p.x * 9)
      .addScaledVector(UP, p.y * 6);

    place
      .copy(CAMERA_HOME)
      .addScaledVector(FORWARD, s.value * 62 - approach)
      .addScaledVector(RIGHT, p.x * 3)
      .addScaledVector(UP, -p.y * 2 - s.value * 16);
    camera.position.copy(place);
    look.copy(LOOK_AT).addScaledVector(RIGHT, s.value * 26);
    camera.lookAt(look);

    stage.current?.style.setProperty("--landing-scroll", clamp01(s.value).toFixed(3));

    // Nothing moved, so the last frame is still right: skip the GPU work.
    // A resize clears the canvas, and the first frames have drawn nothing yet.
    const changed =
      line.running ||
      state.size.width !== lastSize.current.width ||
      state.size.height !== lastSize.current.height ||
      Math.abs(p.x - previousX) >= STILL ||
      Math.abs(p.y - previousY) >= STILL ||
      Math.abs(s.value - previousScroll) >= STILL;
    lastSize.current = state.size;
    stillFrames.current = changed ? 0 : stillFrames.current + 1;
    idle.current = stillFrames.current > 3;
  });

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <group ref={sky}>
        <PointCloudLayer cloud={skyCloud} scale={700} maxSize={2.4} />
      </group>
      <group ref={galaxy}>
        <PointCloudLayer cloud={glowCloud} scale={1500} maxSize={90} fade={fade} />
        <PointCloudLayer cloud={dustCloud} scale={1500} maxSize={40} dark fade={dustFade} />
        <PointCloudLayer cloud={starCloud} scale={520} maxSize={2.6} fade={fade} />
      </group>
      <group ref={near}>
        <PointCloudLayer cloud={nearCloud} scale={220} maxSize={3} />
      </group>

      {showPlanet && (
        <group ref={planet} position={PLANET_HOME}>
          <ProceduralPlanet
            planet={INTRO_PLANET}
            detail={PORTRAIT_DETAIL}
            scale={PLANET_RADIUS}
            lightDirection={PLANET_LIGHT}
            onReady={() => {
              timeline.current.running = true;
              onReady();
            }}
          />
          <group ref={halo} rotation={[0.42, 0, 0.3]}>
            {RINGS.map((ring) => (
              <lineLoop
                key={ring}
                geometry={ringGeometry}
                scale={[ring * PLANET_RADIUS, 1, ring * PLANET_RADIUS]}
              >
                <lineBasicMaterial color="#cfd8e6" transparent opacity={0.28} />
              </lineLoop>
            ))}
            <PointCloudLayer cloud={particles} scale={26} maxSize={3.5} />
          </group>
        </group>
      )}
    </>
  );
}

const clampUnit = (value: number) => Math.min(Math.max(value, -1), 1);

const CANVAS_DPR: [number, number] = [1, 1.25];
const CANVAS_GL = { antialias: false, powerPreference: "high-performance" } as const;
const CANVAS_CAMERA = { fov: 40, near: 0.1, far: 3000, position: [-22, 128, 205] } as const;

export default function LandingScene({
  fallback,
  ...world
}: WorldProps & { fallback: ReactNode }) {
  return (
    <SceneCanvas fallback={fallback} dpr={CANVAS_DPR} gl={CANVAS_GL} camera={CANVAS_CAMERA}>
      <LandingWorld {...world} />
    </SceneCanvas>
  );
}
