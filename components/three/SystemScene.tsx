"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ProceduralPlanet } from "@/components/3d/ProceduralPlanet";
import { createSkyCloud, eccentricAnomaly, type SystemLayout } from "@/lib/galaxyLayout";
import type { HzBoundaries } from "@/lib/habitability";
import { SYSTEM_DETAIL } from "@/lib/planet-visuals/createPlanetObject";
import { starColor } from "@/lib/planet-visuals/visualProfile";
import { toPlanetSummary } from "@/lib/planetSummary";
import type { PlanetRecord, SystemRecord } from "@/types/planet";
import { PointCloudLayer } from "./PointCloudLayer";
import { SceneCanvas } from "./SceneCanvas";
import { type SceneLabel, SceneLabels } from "./SceneLabels";
import { useOrbitControls } from "./useOrbitControls";
import { type LabelSlot, useScreenPicking } from "./useScreenPicking";

const STAR_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vView = -view.xyz;
  gl_Position = projectionMatrix * view;
}
`;

// Limb darkening: a star's edge is cooler than its centre, so it reads as a
// ball of gas rather than a flat disc.
const STAR_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
  float limb = 0.5 + 0.5 * pow(facing, 0.6);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), facing * facing * 0.65) * limb, 1.0);
  #include <colorspace_fragment>
}
`;

// One unit circle, drawn at every orbit's scale.
const ORBIT_POINTS = Array.from({ length: 193 }, (_, index) => {
  const angle = (index / 192) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
});

/**
 * Live control values, written by SystemControls and read every frame here.
 * Using a ref means moving a slider never re-renders the 3D scene.
 */
export interface SystemPlayback {
  /** 0 is the whole system, 1 is close to the selected planet. */
  zoom: number;
  speed: number;
  paused: boolean;
  onZoomChange?: (zoom: number) => void;
  /** Reports whether the selected planet is under a pixel wide. */
  onTooSmall?: (tooSmall: boolean) => void;
}

const WHEEL_ZOOM_RATE = 0.0009;
const PINCH_ZOOM_RATE = 0.003;
/** Closest camera distance, in planet radii. Keeps it well outside the atmosphere. */
const CLOSEST_RADII = 3.4;
const ZOOM_EASE = 6;
const HANDOFF_SECONDS = 0.7;
/** Half-height of the view at distance 1, inverted: 1 / tan(20 degrees) / 2. */
const PIXELS_PER_ANGLE = 1.374;
/** Screen-sized markers for Physical Scale, where bodies can be sub-pixel. */
const MARKER_SIZE = 0.009;
/** Close up, light eases to over the shoulder so the surface can be seen. */
const CLOSE_UP_LIGHT = new THREE.Vector3(-0.72, 0.42, 0.55).normalize();

/** One star's zone, in the same scale as its orbits. Never moves a planet. */
function HabitableZoneBands({
  zone,
  layout,
  indicative,
  line,
}: {
  zone: HzBoundaries;
  layout: SystemLayout;
  indicative: boolean;
  line: THREE.BufferGeometry;
}) {
  const radii = [
    zone.optimisticInner, zone.conservativeInner, zone.conservativeOuter, zone.optimisticOuter,
  ].map(layout.drawDistance);
  const strength = indicative ? 0.5 : 1;
  const bands = [
    { from: radii[0], to: radii[1], color: "#e0a94f", opacity: 0.12 },
    { from: radii[1], to: radii[2], color: "#3fc98a", opacity: 0.2 },
    { from: radii[2], to: radii[3], color: "#e0a94f", opacity: 0.12 },
  ];
  return (
    <group renderOrder={-1}>
      {bands.map((band) => (
        <mesh key={band.color + band.from} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[band.from, band.to, 160]} />
          <meshBasicMaterial
            color={band.color}
            transparent
            opacity={band.opacity * strength}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      {radii.map((radius, index) => (
        <lineLoop key={index} geometry={line} scale={[radius, 1, radius]}>
          <lineBasicMaterial
            color={index === 1 || index === 2 ? "#6fe0ad" : "#e6bd75"}
            transparent
            opacity={0.5 * strength}
            depthWrite={false}
          />
        </lineLoop>
      ))}
    </group>
  );
}

interface WorldProps {
  zone: HzBoundaries | null;
  indicative: boolean;
  system: SystemRecord;
  planets: PlanetRecord[];
  layout: SystemLayout;
  physical: boolean;
  selectedIndex: number;
  playback: RefObject<SystemPlayback>;
  onSelect: (index: number) => void;
  labelSlots: RefObject<LabelSlot[]>;
  onReady: () => void;
}

function SystemWorld({
  zone,
  indicative,
  system,
  planets,
  layout,
  physical,
  selectedIndex,
  playback,
  onSelect,
  labelSlots,
  onReady,
}: WorldProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const canvas = useThree((state) => state.gl.domElement);
  const { orbits, starRadius, extent } = layout;

  const summaries = useMemo(() => planets.map(toPlanetSummary), [planets]);

  // Distance belongs to the Planet Zoom slider, so the wheel drives that too.
  const controls = useOrbitControls({
    minDistance: 1e-7,
    maxDistance: extent * 8,
    minPolarAngle: Math.PI * 0.04,
    maxPolarAngle: Math.PI * 0.7,
    enableZoom: false,
    manualUpdate: true,
  });

  const systemDistance = useRef(extent * 3);

  // Far enough back that the widest orbit fits the shorter side of the view.
  useEffect(() => {
    const aspect = Math.min(size.width / size.height, 1.4);
    const distance = (extent * 2.9) / Math.min(aspect, 1);
    systemDistance.current = Math.hypot(distance * 0.62, distance * 0.85);
    camera.position.set(0, distance * 0.62, distance * 0.85);
    camera.lookAt(0, 0, 0);
    // Framed once. Resizing shouldn't undo the visitor's own view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, extent]);

  const groups = useRef<(THREE.Group | null)[]>([]);
  const markers = useRef<(THREE.Sprite | null)[]>([]);
  const points = useRef(planets.map(() => new THREE.Vector3()));
  const lights = useMemo(() => planets.map(() => new THREE.Vector3(0, 0, 1)), [planets]);
  const anomalies = useRef(orbits.map((orbit) => orbit.startAnomaly));

  const remaining = useRef(planets.length);
  const planetReady = () => {
    remaining.current -= 1;
    if (remaining.current === 0) onReady();
  };

  useScreenPicking({
    points,
    pickableCount: planets.length,
    labels: labelSlots,
    onSelect,
    onHover: () => {},
  });

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const state = playback.current;
      state.zoom = THREE.MathUtils.clamp(state.zoom - event.deltaY * WHEEL_ZOOM_RATE, 0, 1);
      state.onZoomChange?.(state.zoom);
    };
    let pinch: number | null = null;
    const pinchSpan = (event: TouchEvent) =>
      Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinch = null;
        return;
      }
      const span = pinchSpan(event);
      if (pinch !== null) {
        const state = playback.current;
        state.zoom = THREE.MathUtils.clamp(state.zoom + (span - pinch) * PINCH_ZOOM_RATE, 0, 1);
        state.onZoomChange?.(state.zoom);
      }
      pinch = span;
    };
    const onTouchEnd = () => {
      pinch = null;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [canvas, playback]);

  const ring = useRef<THREE.Mesh>(null);
  const smoothZoom = useRef(0);
  const previousIndex = useRef(selectedIndex);
  const fromPoint = useMemo(() => new THREE.Vector3(), []);
  const handoff = useRef(1);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const viewLight = useMemo(() => new THREE.Vector3(), []);
  const lastSelected = useRef(selectedIndex);
  const wasTooSmall = useRef(false);

  useFrame((_, delta) => {
    // Clamped, so a stalled tab resumes without a leap along the orbits.
    const elapsed = Math.min(delta, 0.05);
    const { paused, speed, zoom } = playback.current;
    const time = paused ? 0 : elapsed * speed;
    orbits.forEach((orbit, index) => {
      anomalies.current[index] =
        (anomalies.current[index] + time * orbit.meanMotion) % (Math.PI * 2);
      const E = eccentricAnomaly(anomalies.current[index], orbit.eccentricity);
      const along = orbit.semiMajorAxis * (Math.cos(E) - orbit.eccentricity);
      const across = orbit.semiMinorAxis * Math.sin(E);
      const cos = Math.cos(orbit.periastronAngle);
      const sin = Math.sin(orbit.periastronAngle);
      const point = points.current[index];
      point.set(along * cos - across * sin, 0, along * sin + across * cos);
      groups.current[index]?.position.copy(point);
      markers.current[index]?.position.copy(point);
      lights[index].copy(point).negate().normalize();
    });

    const selected = points.current[selectedIndex];

    // A new selection glides from the planet the camera was following.
    if (selectedIndex !== lastSelected.current) {
      previousIndex.current = lastSelected.current;
      lastSelected.current = selectedIndex;
      handoff.current = 0;
    }
    handoff.current = Math.min(handoff.current + elapsed / HANDOFF_SECONDS, 1);
    fromPoint.copy(points.current[previousIndex.current]);
    const glide = THREE.MathUtils.smoothstep(handoff.current, 0, 1);
    focus.copy(fromPoint).lerp(selected, glide);

    // Zoom moves the camera only: the planet's size never changes. The pivot
    // slides from the star to the planet, then stays exactly on it, so the
    // planet holds the centre of the view even while orbiting.
    smoothZoom.current += (zoom - smoothZoom.current) * (1 - Math.exp(-elapsed * ZOOM_EASE));
    const z = smoothZoom.current;
    focus.multiplyScalar(THREE.MathUtils.smoothstep(z, 0, 0.25));

    // A planet between camera and star would otherwise show only its night side.
    const closeUp = THREE.MathUtils.smoothstep(z, 0.3, 0.9);
    if (closeUp > 0) {
      viewLight.copy(CLOSE_UP_LIGHT).applyQuaternion(camera.quaternion);
      lights[selectedIndex].lerp(viewLight, closeUp).normalize();
    }

    const closest = orbits[selectedIndex].displayRadius * CLOSEST_RADII;
    const distance = Math.exp(
      THREE.MathUtils.lerp(Math.log(systemDistance.current), Math.log(closest), z),
    );
    offset.copy(camera.position).sub(controls.target).setLength(distance);
    controls.target.copy(focus);
    camera.position.copy(focus).add(offset);
    controls.update(elapsed);

    // Near follows the camera, so the view stays sharp at any physical scale.
    (camera as THREE.PerspectiveCamera).near = Math.max(distance * 0.01, 1e-8);
    camera.updateProjectionMatrix();

    const radius = orbits[selectedIndex].displayRadius;
    if (ring.current && selected) {
      ring.current.position.copy(selected);
      ring.current.quaternion.copy(camera.quaternion);
      // The ring keeps a readable size when the planet itself is sub-pixel.
      ring.current.scale.setScalar(Math.max(radius * 1.6, distance * 0.022));
      ring.current.visible = z < 0.45 || radius / distance < 0.02;
    }

    const tooSmall = (radius / distance) * size.height * PIXELS_PER_ANGLE < 0.5;
    if (tooSmall !== wasTooSmall.current) {
      wasTooSmall.current = tooSmall;
      playback.current.onTooSmall?.(tooSmall);
    }
  });

  const { solid, dashed } = useMemo(() => {
    const solidGeometry = new THREE.BufferGeometry().setFromPoints(ORBIT_POINTS);
    const dashedGeometry = solidGeometry.clone();
    // Distance along the unit circle, which LineDashedMaterial dashes by.
    dashedGeometry.setAttribute(
      "lineDistance",
      new THREE.Float32BufferAttribute(ORBIT_POINTS.map((_, i) => (i / 192) * Math.PI * 2), 1),
    );
    return { solid: solidGeometry, dashed: dashedGeometry };
  }, []);
  useEffect(
    () => () => {
      solid.dispose();
      dashed.dispose();
    },
    [solid, dashed],
  );

  const skyCloud = useMemo(() => createSkyCloud(2500), []);
  const color = useMemo(
    () =>
      new THREE.Color(
        starColor(system.host_star.temperature_kelvin, system.host_star.spectral_type) ??
          "#e6e6e6",
      ),
    [system.host_star.spectral_type, system.host_star.temperature_kelvin],
  );
  const starUniforms = useMemo(() => ({ uColor: { value: color } }), [color]);

  const glowTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    glow.addColorStop(0.3, "rgba(255, 255, 255, 0.28)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => glowTexture.dispose(), [glowTexture]);

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <PointCloudLayer cloud={skyCloud} scale={700} maxSize={2.4} />

      <mesh scale={starRadius}>
        <sphereGeometry args={[1, 48, 32]} />
        <shaderMaterial
          vertexShader={STAR_VERTEX}
          fragmentShader={STAR_FRAGMENT}
          uniforms={starUniforms}
        />
      </mesh>
      <sprite scale={[Math.max(starRadius, 0.02) * 7, Math.max(starRadius, 0.02) * 7, 1]}>
        <spriteMaterial
          map={glowTexture}
          color={color}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </sprite>

      {zone && (
        <HabitableZoneBands zone={zone} layout={layout} indicative={indicative} line={solid} />
      )}

      {orbits.map((orbit, index) => {
        const offset = orbit.semiMajorAxis * orbit.eccentricity;
        const isSelected = index === selectedIndex;
        return (
          <lineLoop
            key={planets[index].id}
            geometry={orbit.exact ? solid : dashed}
            position={[
              -offset * Math.cos(orbit.periastronAngle),
              0,
              -offset * Math.sin(orbit.periastronAngle),
            ]}
            rotation={[0, -orbit.periastronAngle, 0]}
            scale={[orbit.semiMajorAxis, 1, orbit.semiMinorAxis]}
          >
            {orbit.exact ? (
              <lineBasicMaterial
                color={isSelected ? "#ffffff" : "#8c8c8c"}
                transparent
                opacity={isSelected ? 0.8 : 0.32}
              />
            ) : (
              <lineDashedMaterial
                color={isSelected ? "#ffffff" : "#a6a6a6"}
                dashSize={0.07}
                gapSize={0.07}
                transparent
                opacity={isSelected ? 0.85 : 0.42}
              />
            )}
          </lineLoop>
        );
      })}

      {summaries.map((planet, index) => (
        <ProceduralPlanet
          key={planet.id}
          ref={(group) => {
            groups.current[index] = group;
          }}
          planet={planet}
          detail={SYSTEM_DETAIL}
          scale={orbits[index].displayRadius}
          lightDirection={lights[index]}
          onReady={planetReady}
        />
      ))}

      {physical &&
        orbits.map((orbit, index) => (
          <sprite
            key={planets[index].id}
            ref={(sprite) => {
              markers.current[index] = sprite;
            }}
            scale={[MARKER_SIZE, MARKER_SIZE, 1]}
          >
            <spriteMaterial map={glowTexture} sizeAttenuation={false} depthWrite={false} transparent />
          </sprite>
        ))}

      <mesh ref={ring}>
        <ringGeometry args={[1, 1.04, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

interface SystemSceneProps {
  /** Null hides the bands: no data, or the visitor turned them off. */
  zone: HzBoundaries | null;
  indicative: boolean;
  system: SystemRecord;
  planets: PlanetRecord[];
  layout: SystemLayout;
  physical: boolean;
  selectedId: string;
  playback: RefObject<SystemPlayback>;
  onSelect: (id: string) => void;
  onReady: () => void;
  fallback: React.ReactNode;
}

const CANVAS_DPR: [number, number] = [1, 1.75];
const CANVAS_CAMERA = { fov: 40, near: 0.05, far: 3000, position: [0, 18, 24] } as const;

export default function SystemScene({
  zone,
  indicative,
  system,
  planets,
  layout,
  physical,
  selectedId,
  playback,
  onSelect,
  onReady,
  fallback,
}: SystemSceneProps) {
  const labelSlots = useRef<LabelSlot[]>([]);
  const selectedIndex = Math.max(
    planets.findIndex((planet) => planet.id === selectedId),
    0,
  );

  const labels: SceneLabel[] = useMemo(
    () =>
      planets.flatMap((planet, index) =>
        // Eight names around one star would hide the planets themselves.
        planets.length <= 4 || index === selectedIndex
          ? [
              {
                key: planet.id,
                text: planet.pl_name,
                point: index,
                selected: index === selectedIndex,
                onClick: () => onSelect(planet.id),
              },
            ]
          : [],
      ),
    [planets, selectedIndex, onSelect],
  );

  return (
    <>
      <SceneCanvas
        fallback={fallback}
        dpr={CANVAS_DPR}
        camera={CANVAS_CAMERA}
      >
        <SystemWorld
          zone={zone}
          indicative={indicative}
          system={system}
          planets={planets}
          layout={layout}
          physical={physical}
          selectedIndex={selectedIndex}
          playback={playback}
          onSelect={(index) => onSelect(planets[index].id)}
          labelSlots={labelSlots}
          onReady={onReady}
        />
      </SceneCanvas>
      <SceneLabels labels={labels} slots={labelSlots} />
    </>
  );
}
