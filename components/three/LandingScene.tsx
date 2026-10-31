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

/** Not a catalog record: an artistic planet that exists only for this page. */
const HERO_PLANET: PlanetSummary = {
  id: "exoverse-hero",
  name: "ExoVerse Hero",
  hostname: "",
  systemId: "",
  radiusEarth: 11.2,
  radiusJupiter: null,
  massEarth: null,
  massIsMinimum: false,
  density: null,
  temperatureK: 165,
  starTemperatureK: 5800,
  periodDays: null,
  semiMajorAxisAu: null,
  distanceLy: null,
  method: null,
  year: null,
  sizeClass: "Jupiter-sized",
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

const FOV = 40;
const PLANET_DISTANCE = 30;
const PLANET_RADIUS = 5.6;
const PLANET_HOME = CAMERA_HOME.clone().addScaledVector(FORWARD, PLANET_DISTANCE);
/** From the side of the copy and slightly behind, so the world shows a crescent. */
const PLANET_LIGHT = RIGHT.clone()
  .multiplyScalar(-0.86)
  .addScaledVector(UP, 0.42)
  .addScaledVector(FORWARD, -0.3)
  .normalize();
const RINGS = [1.5, 1.82, 2.2];

/** The world at rest: large in the corner, cropped by the frame, near the viewer. */
const REST_DISTANCE = 21;
const REST = {
  wide: { right: 0.94, up: -0.8, scale: 1.26 },
  tall: { right: 0.62, up: 0.56, scale: 0.8 },
};

const REVEAL_AT = 3;
const EXIT_AT = 2.6;
const EXIT_SECONDS = 1.9;
const APPROACH_DISTANCE = 9;
const TIMELINE_STEP = 0.1;
const POINTER_EASE = 2.8;
const SCROLL_EASE = 6;
const STILL = 0.0006;
/** Past the hero the world has flown by, so it stops being drawn. */
const FLOWN_PAST = 0.75;
const MOON_SPEED = 0.22;

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

/**
 * One painted sheet of warm dust, far behind the galaxy. Hundreds of faint soft
 * dabs merge into cloud, at the cost of a single textured quad.
 */
function nebulaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d") as CanvasRenderingContext2D;
  const tones = ["150, 84, 42", "118, 66, 44", "96, 78, 62", "170, 112, 66"];
  // Seeded, so the sky is the same on every visit.
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  context.globalCompositeOperation = "lighter";
  for (let dab = 0; dab < 520; dab += 1) {
    // Clouds gather along a loose diagonal band.
    const along = next();
    const x = along * 1024;
    const y = 380 - along * 250 + (next() + next() + next() - 1.5) * 170;
    const radius = 26 + next() ** 2 * 150;
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(${tones[dab % tones.length]}, 0.05)`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  // Fades every edge, so the sheet itself is never seen.
  context.globalCompositeOperation = "destination-in";
  const edge = context.createRadialGradient(512, 256, 120, 512, 256, 512);
  edge.addColorStop(0, "rgba(0, 0, 0, 1)");
  edge.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.setTransform(1, 0, 0, 0.5, 0, 128);
  context.fillStyle = edge;
  context.fillRect(0, -256, 1024, 1024);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** The sheet hangs behind the galaxy, square on to the camera. */
const NEBULA_POSITION = LOOK_AT.clone().addScaledVector(FORWARD, 520).addScaledVector(RIGHT, 120);
const NEBULA_ROTATION = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(RIGHT, UP, FORWARD.clone().negate()),
);

const easeIn = (t: number) => t * t;
/** Starts and ends at rest, so no move begins with a jolt. */
const smooth = (t: number) => t * t * (3 - 2 * t);
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

  const idle = useRef(false);
  const stillFrames = useRef(0);
  const lastSize = useRef({ width: 0, height: 0 });
  useHdrRender(idle);

  // High-frequency values live in refs, so moving the mouse never renders React.
  const pointer = useRef({ targetX: 0, targetY: 0, x: 0, y: 0 });
  const scroll = useRef({ target: 0, value: 0 });
  const timeline = useRef({ running: false, time: 0, revealed: !playIntro, finished: !playIntro });

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

  const starCloud = useMemo(() => createGalaxyStars(compact ? 60000 : 130000), [compact]);
  const glowCloud = useMemo(() => createGalaxyGlow(compact ? 2500 : 6000), [compact]);
  const dustCloud = useMemo(() => createDustLanes(compact ? 2000 : 6000), [compact]);
  const skyCloud = useMemo(() => createSkyCloud(compact ? 1500 : 3000), [compact]);
  const nearCloud = useMemo(() => createSkyCloud(compact ? 200 : 450, 130), [compact]);
  const nebula = useMemo(nebulaTexture, []);
  useEffect(() => () => nebula.dispose(), [nebula]);
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
  const far = useRef<THREE.Group>(null);
  const near = useRef<THREE.Group>(null);
  const planet = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Group>(null);
  const moon = useRef<THREE.Mesh>(null);
  const clock = useRef(0);
  const place = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const rest = useMemo(() => new THREE.Vector3(), []);
  const lastScroll = useRef("");

  useFrame((state, delta) => {
    // Clamped, so a stalled tab eases back rather than leaping.
    const elapsed = Math.min(delta, 0.05);
    const p = pointer.current;
    const s = scroll.current;
    const line = timeline.current;
    if (motion) clock.current += elapsed;

    const ease = 1 - Math.exp(-elapsed * POINTER_EASE);
    const previousX = p.x;
    const previousY = p.y;
    const previousScroll = s.value;
    p.x += (p.targetX - p.x) * ease;
    p.y += (p.targetY - p.y) * ease;
    s.value += (s.target - s.value) * (1 - Math.exp(-elapsed * SCROLL_EASE));

    let approach = 0;
    let exit = 1;
    if (line.running) {
      if (control.current.skip) line.time = Math.max(line.time, EXIT_AT);
      // Capped, so a long frame while the scene settles can't jump the timeline.
      line.time += Math.min(delta, TIMELINE_STEP) * (control.current.skip ? 1.8 : 1);

      if (!line.revealed && line.time >= REVEAL_AT) {
        line.revealed = true;
        onReveal();
      }

      exit = clamp01((line.time - EXIT_AT) / EXIT_SECONDS);
      approach = (1 - smooth(clamp01(line.time / EXIT_AT))) * APPROACH_DISTANCE;
      fade.uOpacity.value = 0.3 + 0.7 * smooth(exit);
      dustFade.uOpacity.value = 0.34 * fade.uOpacity.value;

      if (exit >= 1 && !line.finished) {
        line.finished = true;
        line.running = false;
        fade.uOpacity.value = 1;
        dustFade.uOpacity.value = 0.34;
        onFinished();
      }
    } else if (!line.finished) {
      exit = 0;
    }

    // Each layer answers the pointer at its own depth: the farthest moves least
    // on screen, and the nearest crosses the most sky.
    if (galaxy.current) {
      galaxy.current.rotation.y = p.x * 0.03 + s.value * 0.14 + clock.current * 0.0016;
      galaxy.current.rotation.x = p.y * 0.016;
    }
    far.current?.position.set(p.x * 16, p.y * -10, 0);
    sky.current?.position.set(p.x * -12, p.y * 7, 0);
    if (sky.current) sky.current.rotation.y = clock.current * 0.0012;
    near.current?.position
      .copy(CAMERA_HOME)
      .addScaledVector(RIGHT, p.x * -15)
      .addScaledVector(UP, p.y * 9);

    place
      .copy(CAMERA_HOME)
      .addScaledVector(FORWARD, s.value * 62 - approach)
      .addScaledVector(RIGHT, p.x * 5)
      .addScaledVector(UP, -p.y * 3.2 - s.value * 16);
    camera.position.copy(place);
    look
      .copy(LOOK_AT)
      .addScaledVector(RIGHT, s.value * 26 + p.x * -7)
      .addScaledVector(UP, p.y * 4);
    camera.lookAt(look);

    if (planet.current) {
      // Settles from centre stage into the corner, then the camera flies past it.
      const aspect = state.size.width / state.size.height;
      const layout = aspect < 1 ? REST.tall : REST.wide;
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * REST_DISTANCE;
      rest
        .copy(CAMERA_HOME)
        .addScaledVector(FORWARD, REST_DISTANCE)
        .addScaledVector(RIGHT, layout.right * halfHeight * aspect)
        .addScaledVector(UP, layout.up * halfHeight);
      const travel = smooth(exit);
      planet.current.position.copy(PLANET_HOME).lerp(rest, travel);
      planet.current.position.addScaledVector(RIGHT, p.x * -2.2 * travel);
      planet.current.position.addScaledVector(UP, p.y * 1.4 * travel);
      planet.current.scale.setScalar(1 + (layout.scale - 1) * travel);
      planet.current.rotation.set(p.y * 0.05, p.x * 0.09, 0);
      planet.current.visible = s.value < FLOWN_PAST;
    }
    if (halo.current) halo.current.rotation.y = clock.current * 0.05;
    if (moon.current) {
      const angle = clock.current * MOON_SPEED + 2.2;
      const reach = RINGS[1] * PLANET_RADIUS;
      moon.current.position.set(Math.cos(angle) * reach, 0, Math.sin(angle) * reach);
    }

    // Written straight to the element: the copy leans a little against the scene.
    const copy = stage.current?.querySelector<HTMLElement>("[data-depth]");
    if (copy) {
      const lift = clamp01(s.value);
      copy.style.transform = `translate3d(${(p.x * -7).toFixed(2)}px, ${(p.y * -5 - lift * 56).toFixed(2)}px, 0)`;
      copy.style.opacity = Math.max(1 - lift * 1.5, 0).toFixed(3);
    }

    const scrollText = clamp01(s.value).toFixed(3);
    if (scrollText !== lastScroll.current) {
      lastScroll.current = scrollText;
      stage.current?.style.setProperty("--landing-scroll", scrollText);
    }

    // Slow drift only needs half the frames. A resize clears the canvas, and
    // the first frames have drawn nothing yet, so those always draw.
    const changed =
      line.running ||
      state.size.width !== lastSize.current.width ||
      state.size.height !== lastSize.current.height ||
      Math.abs(p.x - previousX) >= STILL ||
      Math.abs(p.y - previousY) >= STILL ||
      Math.abs(s.value - previousScroll) >= STILL;
    lastSize.current = state.size;
    stillFrames.current = changed ? 0 : stillFrames.current + 1;
    idle.current = motion
      ? stillFrames.current > 3 && stillFrames.current % 2 === 0
      : stillFrames.current > 3;
  });

  return (
    <>
      <color attach="background" args={["#060605"]} />
      <directionalLight position={PLANET_LIGHT.clone().multiplyScalar(100)} intensity={2.2} />
      <group ref={far}>
        <mesh position={NEBULA_POSITION} quaternion={NEBULA_ROTATION}>
          <planeGeometry args={[3000, 1500]} />
          <meshBasicMaterial
            map={nebula}
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
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

      <group ref={planet} position={PLANET_HOME}>
        <ProceduralPlanet
          planet={HERO_PLANET}
          detail={PORTRAIT_DETAIL}
          scale={PLANET_RADIUS}
          paused={!motion}
          lightDirection={PLANET_LIGHT}
          onReady={() => {
            timeline.current.running = playIntro;
            onReady();
          }}
        />
        <group rotation={[0.42, 0, 0.3]}>
          <group ref={halo}>
            {RINGS.map((ring) => (
              <lineLoop
                key={ring}
                geometry={ringGeometry}
                scale={[ring * PLANET_RADIUS, 1, ring * PLANET_RADIUS]}
              >
                <lineBasicMaterial color="#d9d3c7" transparent opacity={0.16} />
              </lineLoop>
            ))}
            <PointCloudLayer cloud={particles} scale={26} maxSize={3.5} />
          </group>
          <mesh ref={moon}>
            <sphereGeometry args={[0.42, 32, 24]} />
            <meshStandardMaterial color="#8a8378" roughness={0.9} metalness={0} />
          </mesh>
        </group>
      </group>
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
