import * as THREE from "three";

/**
 * Artistic reconstructions, for spacecraft with no official 3D model. They keep
 * each one's general silhouette, with approximate proportions. They are
 * not engineering models, and the page labels them as reconstructions.
 */
type Vec = [number, number, number];

const material = (color: string, metalness: number, roughness: number, side?: THREE.Side) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, side: side ?? THREE.FrontSide });

function palette() {
  return {
    gold: material("#c79a3f", 0.95, 0.38),
    silver: material("#c6cad0", 0.85, 0.32),
    white: material("#e4e3de", 0.1, 0.62),
    grey: material("#6d7178", 0.5, 0.55),
    dark: material("#16181e", 0.4, 0.6),
    solar: material("#1c1f22", 0.55, 0.24),
    shield: material("#d9dade", 0.7, 0.42, THREE.DoubleSide),
    inner: material("#0c0d10", 0.2, 0.8, THREE.DoubleSide),
    balloon: new THREE.MeshStandardMaterial({
      color: "#eef0f2", metalness: 0, roughness: 0.5, transparent: true, opacity: 0.86,
    }),
  };
}

type Palette = ReturnType<typeof palette>;

function add(group: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material, position: Vec, rotation: Vec = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

const box = (g: THREE.Group, size: Vec, mat: THREE.Material, position: Vec, rotation?: Vec) =>
  add(g, new THREE.BoxGeometry(...size), mat, position, rotation);

/** Along Y unless rotated. Open tubes show their dark insides. */
const tube = (g: THREE.Group, top: number, bottom: number, height: number, mat: THREE.Material, position: Vec, rotation?: Vec, open = false) =>
  add(g, new THREE.CylinderGeometry(top, bottom, height, 40, 1, open), mat, position, rotation);

/** A wing of solar cells with a thin grid of panel seams. */
function wing(g: THREE.Group, p: Palette, width: number, height: number, position: Vec, panels = 3) {
  box(g, [width, height, 0.02], p.solar, position);
  for (let index = 1; index < panels; index += 1) {
    const x = position[0] - width / 2 + (index / panels) * width;
    box(g, [0.012, height, 0.03], p.silver, [x, position[1], position[2]]);
  }
}

function pandora(g: THREE.Group, p: Palette) {
  box(g, [1.1, 0.8, 1.1], p.gold, [0, -0.7, 0]);
  tube(g, 0.5, 0.5, 1.5, p.silver, [0, 0.4, 0]);
  tube(g, 0.54, 0.5, 0.5, p.dark, [0, 1.3, 0], undefined, true);
  tube(g, 0.42, 0.42, 0.02, p.inner, [0, 1.1, 0]);
  wing(g, p, 1.4, 1.1, [1.3, -0.7, 0]);
  tube(g, 0.08, 0.1, 0.34, p.dark, [-0.42, -0.14, 0.42], [0.4, 0, 0.4]);
  tube(g, 0.08, 0.1, 0.34, p.dark, [-0.42, -0.14, -0.42], [-0.4, 0, 0.4]);
}

function euclid(g: THREE.Group, p: Palette) {
  add(g, new THREE.CylinderGeometry(1, 1, 0.7, 6), p.gold, [0, -1.25, 0]);
  tube(g, 0.62, 0.62, 2.2, p.silver, [0, 0.2, -0.1]);
  tube(g, 0.66, 0.62, 0.3, p.dark, [0, 1.45, -0.1], undefined, true);
  box(g, [2.1, 3.1, 0.06], p.white, [0, 0.1, 0.72]);
  wing(g, p, 1.9, 2.8, [0, 0.1, 0.76], 4);
}

function spherex(g: THREE.Group, p: Palette) {
  box(g, [1.3, 0.55, 1.3], p.gold, [0, -1.15, 0]);
  tube(g, 0.5, 0.5, 0.5, p.dark, [0, -0.65, 0]);
  [[1, 0.42, 0.8, -0.55], [1.25, 0.6, 1.0, -0.15], [1.5, 0.8, 1.25, 0.2]].forEach(
    ([top, bottom, height, y]) => tube(g, top, bottom, height, p.shield, [0, y + height / 2, 0], undefined, true),
  );
  box(g, [1.6, 0.03, 1.1], p.solar, [0, -1.46, 0]);
}

function gaia(g: THREE.Group, p: Palette) {
  add(g, new THREE.CylinderGeometry(2.3, 2.3, 0.03, 12), p.solar, [0, -0.8, 0]);
  add(g, new THREE.CylinderGeometry(2.3, 2.3, 0.02, 12), p.gold, [0, -0.77, 0]);
  add(g, new THREE.CylinderGeometry(0.9, 1.1, 0.6, 6), p.gold, [0, -0.45, 0]);
  add(g, new THREE.CylinderGeometry(0.95, 0.95, 1.1, 8), p.white, [0, 0.4, 0]);
  add(g, new THREE.ConeGeometry(0.95, 0.35, 8), p.silver, [0, 1.12, 0]);
}

function cheops(g: THREE.Group, p: Palette) {
  add(g, new THREE.CylinderGeometry(1, 1, 0.8, 6), p.silver, [0, -0.95, 0]);
  tube(g, 0.4, 0.4, 1.4, p.dark, [0, 0.1, 0]);
  tube(g, 0.46, 0.4, 0.55, p.white, [0, 0.95, 0], undefined, true);
  const shield = new THREE.Shape([new THREE.Vector2(-1.1, -0.9), new THREE.Vector2(1.1, -0.9), new THREE.Vector2(0, 1.2)]);
  add(g, new THREE.ShapeGeometry(shield), p.solar, [0, -0.3, 0.7]);
  add(g, new THREE.ShapeGeometry(shield), p.shield, [0, -0.3, 0.68], [0, Math.PI, 0]);
}

function corot(g: THREE.Group, p: Palette) {
  box(g, [1, 1, 1], p.gold, [0, -1.4, 0]);
  tube(g, 0.42, 0.5, 0.9, p.white, [0, -0.45, 0]);
  tube(g, 0.42, 0.42, 1.9, p.white, [0, 0.95, 0]);
  tube(g, 0.45, 0.42, 0.1, p.dark, [0, 1.95, 0], undefined, true);
  wing(g, p, 1.5, 0.95, [1.3, -1.4, 0]);
  wing(g, p, 1.5, 0.95, [-1.3, -1.4, 0]);
}

function nustar(g: THREE.Group, p: Palette) {
  box(g, [0.8, 0.5, 0.6], p.white, [0, -1.9, 0]);
  tube(g, 0.14, 0.14, 0.7, p.gold, [-0.2, -1.4, 0]);
  tube(g, 0.14, 0.14, 0.7, p.gold, [0.2, -1.4, 0]);
  wing(g, p, 1.2, 0.5, [1.05, -1.9, 0]);
  wing(g, p, 1.2, 0.5, [-1.05, -1.9, 0]);
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [0, 0.14]]) {
    tube(g, 0.012, 0.012, 3.6, p.silver, [x, 0.65, z]);
  }
  box(g, [0.5, 0.5, 0.05], p.dark, [0, 2.45, 0]);
}

function ixpe(g: THREE.Group, p: Palette) {
  add(g, new THREE.CylinderGeometry(0.75, 0.75, 0.5, 8), p.gold, [0, -1.6, 0]);
  wing(g, p, 1.5, 0.75, [1.55, -1.6, 0]);
  wing(g, p, 1.5, 0.75, [-1.55, -1.6, 0]);
  tube(g, 0.7, 0.7, 0.04, p.grey, [0, -1.2, 0]);
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2;
    const x = Math.cos(angle) * 0.42;
    const z = Math.sin(angle) * 0.42;
    tube(g, 0.08, 0.08, 0.5, p.white, [x, -0.95, z]);
    tube(g, 0.012, 0.012, 2.3, p.silver, [x * 0.9, 0.25, z * 0.9]);
    tube(g, 0.26, 0.26, 0.55, p.white, [x, 1.6, z]);
  }
  tube(g, 0.65, 0.65, 0.04, p.grey, [0, 1.3, 0]);
}

function xmm(g: THREE.Group, p: Palette) {
  tube(g, 0.42, 0.42, 3.3, p.white, [0, 0.45, 0]);
  tube(g, 0.3, 0.42, 0.25, p.grey, [0, 2.2, 0]);
  add(g, new THREE.CylinderGeometry(0.95, 0.95, 0.7, 8), p.white, [0, -1.5, 0]);
  [[0.42, 0.25], [-0.42, 0.25], [0, -0.48]].forEach(([x, z]) =>
    tube(g, 0.32, 0.32, 0.55, p.dark, [x, -2.1, z]));
  wing(g, p, 1.5, 0.9, [1.75, -1.5, 0]);
  wing(g, p, 1.5, 0.9, [-1.75, -1.5, 0]);
}

function planck(g: THREE.Group, p: Palette) {
  add(g, new THREE.CylinderGeometry(1.7, 1.7, 0.06, 8), p.solar, [0, -1.3, 0]);
  add(g, new THREE.CylinderGeometry(1.1, 1.6, 0.7, 8), p.silver, [0, -0.95, 0]);
  [0.26, 0.5, 0.74].forEach((y, index) =>
    add(g, new THREE.CylinderGeometry(1.45, 1.45, 0.03, 3, 1, false, 0, Math.PI * 2), p.grey, [0, -0.72 + y * 0.5, 0], [0, index, 0]));
  tube(g, 1.05, 1.15, 1.8, p.shield, [0, 0.55, 0], undefined, true);
  add(g, new THREE.SphereGeometry(0.85, 32, 12, 0, Math.PI * 2, 0, 1.05), p.silver, [0.25, 0.1, 0], [0, 0, 0.7]);
}

function sofia(g: THREE.Group, p: Palette) {
  const body = add(g, new THREE.CapsuleGeometry(0.34, 3.8, 8, 24), p.white, [0, 0, 0], [0, 0, Math.PI / 2]);
  body.scale.set(1, 1, 1);
  add(g, new THREE.CapsuleGeometry(0.22, 0.6, 6, 16), p.white, [1.25, 0.28, 0], [0, 0, Math.PI / 2]);
  const wingShape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(-0.55, 2.3), new THREE.Vector2(-0.9, 2.3)]);
  const settings = { depth: 0.05, bevelEnabled: false };
  add(g, new THREE.ExtrudeGeometry(wingShape, settings), p.grey, [0.1, -0.1, 0.1], [Math.PI / 2, 0, 0]);
  add(g, new THREE.ExtrudeGeometry(wingShape, settings), p.grey, [0.1, -0.05, -0.1], [-Math.PI / 2, 0, 0]);
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.7, 0), new THREE.Vector2(0.1, 0.95), new THREE.Vector2(-0.25, 0.95)]);
  add(g, new THREE.ExtrudeGeometry(fin, settings), p.silver, [-2.3, 0.28, 0]);
  add(g, new THREE.ExtrudeGeometry(wingShape, settings), p.grey, [-2.25, 0.05, 0.05], [Math.PI / 2, 0, 0]).scale.set(0.45, 0.45, 1);
  add(g, new THREE.ExtrudeGeometry(wingShape, settings), p.grey, [-2.25, 0.1, -0.05], [-Math.PI / 2, 0, 0]).scale.set(0.45, 0.45, 1);
  for (const [x, z] of [[-0.2, 1], [-0.55, 1.75], [-0.2, -1], [-0.55, -1.75]]) {
    tube(g, 0.1, 0.1, 0.45, p.silver, [x, -0.28, z], [0, 0, Math.PI / 2]);
  }
  // The open door over the telescope, aft of the wing.
  box(g, [0.6, 0.2, 0.05], p.dark, [-1.05, 0.2, 0.33], [0.5, 0, 0]);
}

function wise(g: THREE.Group, p: Palette) {
  tube(g, 0.7, 0.42, 1.7, p.white, [0, 0.45, 0]);
  tube(g, 0.74, 0.7, 0.2, p.silver, [0, 1.35, 0], undefined, true);
  tube(g, 0.45, 0.45, 0.5, p.gold, [0, -0.6, 0]);
  box(g, [1, 0.6, 1], p.gold, [0, -1.1, 0]);
  wing(g, p, 1.9, 1.1, [0, -1.1, 0.56]);
}

function balloon(g: THREE.Group, p: Palette) {
  const profile = Array.from({ length: 24 }, (_, index) => {
    const t = index / 23;
    return new THREE.Vector2(Math.sin(t * Math.PI) ** 0.75 * 1.6 * (1 - t * 0.22), t * 2.4);
  });
  add(g, new THREE.LatheGeometry(profile, 40), p.balloon, [0, 0, 0]);
  tube(g, 0.008, 0.008, 1.5, p.silver, [0, -0.75, 0]);
  box(g, [0.5, 0.42, 0.5], p.silver, [0, -1.7, 0]);
  tube(g, 0.14, 0.14, 0.6, p.dark, [0, -1.55, 0.2], [0.6, 0, 0]);
  box(g, [0.7, 0.03, 0.34], p.solar, [0, -1.48, -0.42], [0.5, 0, 0]);
}

const BUILDERS: Record<string, (group: THREE.Group, palette: Palette) => void> = {
  balloon, cheops, corot, euclid, gaia, ixpe, nustar, pandora, planck, sofia, spherex, wise, xmm,
};

export function buildReconstruction(name: string) {
  const group = new THREE.Group();
  BUILDERS[name]?.(group, palette());
  return group;
}
