"use client";

import { useEffect, useRef } from "react";

const SVG_NS = "http://www.w3.org/2000/svg";
const SURFACES = ".glass, .button-secondary";
/** How far in from the edge the glass curves, in pixels. */
const BEZEL = 26;
/** Pixels of bend at the very edge, doubled because the map stores ±0.5. */
const STRENGTH = 44;
/** Past this area refraction costs more than the edge is worth. */
const MAX_AREA = 1_400_000;
const MAP_SCALE = 0.5;
/** Frames timed after a page settles. A median ignores shader-compile spikes. */
const SAMPLE_FRAMES = 90;
const SAMPLE_DELAY = 2500;
const SLOW_FRAME_MS = 30;

/** The direction and strength of the bend at every point of a rounded box. */
function drawMap(width: number, height: number, radius: number) {
  const w = Math.max(2, Math.ceil(width * MAP_SCALE));
  const h = Math.max(2, Math.ceil(height * MAP_SCALE));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(w, h);
  const r = Math.min(radius, width / 2, height / 2);
  const bezel = Math.min(BEZEL, width / 2, height / 2);
  const halfW = width / 2;
  const halfH = height / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / MAP_SCALE - halfW;
      const py = (y + 0.5) / MAP_SCALE - halfH;
      const qx = Math.abs(px) - (halfW - r);
      const qy = Math.abs(py) - (halfH - r);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const depth = r - outside - Math.min(Math.max(qx, qy), 0);

      let nx = 0;
      let ny = 0;
      if (depth < bezel) {
        if (outside > 0) {
          nx = Math.max(qx, 0) / outside;
          ny = Math.max(qy, 0) / outside;
        } else if (qx > qy) {
          nx = 1;
        } else {
          ny = 1;
        }
        // A convex lip: the bend grows quickly as it nears the rim.
        const lip = 1 - Math.max(depth, 0) / bezel;
        const amount = lip * lip * lip;
        nx *= -Math.sign(px) * amount;
        ny *= -Math.sign(py) * amount;
      }

      const at = (y * w + x) * 4;
      image.data[at] = 127.5 + nx * 127.5;
      image.data[at + 1] = 127.5 + ny * 127.5;
      image.data[at + 2] = 127;
      image.data[at + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function createFilter(id: string, width: number, height: number, map: string) {
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.id = id;
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", String(width));
  filter.setAttribute("height", String(height));
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const image = document.createElementNS(SVG_NS, "feImage");
  image.setAttribute("href", map);
  image.setAttribute("x", "0");
  image.setAttribute("y", "0");
  image.setAttribute("width", String(width));
  image.setAttribute("height", String(height));
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("result", "map");

  const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
  displace.setAttribute("in", "SourceGraphic");
  displace.setAttribute("in2", "map");
  displace.setAttribute("scale", String(STRENGTH));
  displace.setAttribute("xChannelSelector", "R");
  displace.setAttribute("yChannelSelector", "G");

  filter.append(image, displace);
  return filter;
}

/**
 * Gives glass surfaces a curved rim that bends whatever is behind them. Each
 * size of surface gets one displacement map, drawn once and shared; nothing runs
 * per frame. Only Chromium can refract a backdrop, so other browsers keep the
 * frosted glass, and a machine that can't hold the frame rate falls back to it.
 */
export function LiquidGlass() {
  const defs = useRef<SVGDefsElement>(null);

  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } })
      .userAgentData?.brands;
    const chromium = brands?.some(({ brand }) => brand === "Chromium") ?? false;
    const reduced = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
    const holder = defs.current;
    if (!chromium || reduced || !holder) return;

    const filters = new Map<string, string>();
    const sizes = new WeakMap<Element, string>();

    const shape = (surface: HTMLElement) => {
      const width = Math.round(surface.offsetWidth);
      const height = Math.round(surface.offsetHeight);
      if (!width || !height || width * height > MAX_AREA) {
        surface.style.removeProperty("--refract");
        sizes.delete(surface);
        return;
      }
      const radius = Math.round(parseFloat(getComputedStyle(surface).borderTopLeftRadius) || 0);
      const key = `${width}x${height}r${radius}`;
      if (sizes.get(surface) === key) return;

      let id = filters.get(key);
      if (!id) {
        const map = drawMap(width, height, radius);
        if (!map) return;
        id = `liquid-${filters.size}`;
        filters.set(key, id);
        holder.append(createFilter(id, width, height, map));
      }
      sizes.set(surface, key);
      surface.style.setProperty("--refract", `url(#${id})`);
    };

    const resized = new ResizeObserver((entries) => {
      for (const entry of entries) shape(entry.target as HTMLElement);
    });

    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const surface of document.querySelectorAll<HTMLElement>(SURFACES)) {
        if (seen.has(surface)) continue;
        seen.add(surface);
        resized.observe(surface);
      }
    };

    let queued = 0;
    const added = new MutationObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        scan();
      });
    });
    added.observe(document.body, { childList: true, subtree: true });
    scan();

    // Timed once, some way after load, so no loop outlives the measurement.
    let timer = 0;
    let frame = 0;
    const times: number[] = [];
    let last = 0;
    const sample = (now: number) => {
      if (document.hidden) return;
      if (last) times.push(now - last);
      last = now;
      if (times.length < SAMPLE_FRAMES) {
        frame = requestAnimationFrame(sample);
        return;
      }
      times.sort((a, b) => a - b);
      if (times[times.length >> 1] > SLOW_FRAME_MS) {
        document.documentElement.dataset.glass = "frosted";
      }
    };
    timer = window.setTimeout(() => {
      frame = requestAnimationFrame(sample);
    }, SAMPLE_DELAY);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(queued);
      added.disconnect();
      resized.disconnect();
    };
  }, []);

  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs ref={defs} />
    </svg>
  );
}
