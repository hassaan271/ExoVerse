/**
 * The only things the AI may ask the interface to do. A model chooses a name and
 * catalog ids. Paths and code live here and in the browser, never in its output.
 */
export const SECTIONS = ["home", "explore", "compare", "observatories", "habitability", "about"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_PATHS: Record<Section, string> = {
  home: "/",
  explore: "/explore",
  compare: "/compare",
  observatories: "/observatories",
  habitability: "/habitability",
  about: "/about",
};

export type AgentAction =
  | { type: "open_planet_in_3d"; planetId: string; systemId: string; label: string }
  | { type: "highlight_planet"; planetId: string; systemId: string; label: string }
  | { type: "show_planetary_system"; systemId: string; label: string }
  | { type: "zoom_to_system"; systemId: string; label: string }
  | { type: "navigate_to_explorer"; section: Section; label: string }
  | { type: "open_comparison"; planetIds: [string, string]; label: string }
  | { type: "open_habitability_view"; planetId: string | null; systemId: string; label: string };

export const ACTION_NAMES = [
  "open_planet_in_3d", "highlight_planet", "show_planetary_system", "zoom_to_system",
  "navigate_to_explorer", "open_comparison", "open_habitability_view",
] as const;

export type ActionName = (typeof ACTION_NAMES)[number];

export const isActionName = (name: string): name is ActionName =>
  (ACTION_NAMES as readonly string[]).includes(name);

/** Catalog ids are slugs. Anything else can't be part of a path. */
const ID = /^[a-z0-9][a-z0-9-]{0,120}$/;

export interface CatalogLookup {
  planet(id: string): { name: string; systemId: string; hostname: string } | null;
  system(id: string): { hostname: string } | null;
  /** Earth and Jupiter, valid in comparisons only. */
  reference(id: string): { name: string } | null;
}

export type ValidatedAction = { ok: true; action: AgentAction } | { ok: false; error: string };

const refuse = (error: string): ValidatedAction => ({ ok: false, error });

/** Runs on the server for every request, and refuses anything not in the catalog. */
export function validateAction(name: string, args: Record<string, unknown>, catalog: CatalogLookup): ValidatedAction {
  if (!isActionName(name)) return refuse(`Unknown action: ${name}`);
  const id = (value: unknown) => (typeof value === "string" && ID.test(value) ? value : null);
  const planetFor = (value: unknown) => {
    const planetId = id(value);
    return planetId ? catalog.planet(planetId) && { planetId, ...catalog.planet(planetId)! } : null;
  };

  switch (name) {
    case "open_planet_in_3d":
    case "highlight_planet": {
      const planet = planetFor(args.planet_id);
      if (!planet) return refuse("No planet has that id. Use search_exoplanet first.");
      return {
        ok: true,
        action: {
          type: name,
          planetId: planet.planetId,
          systemId: planet.systemId,
          label: name === "open_planet_in_3d" ? `${planet.name} in 3D` : `${planet.name} highlighted in its system`,
        },
      };
    }
    case "show_planetary_system":
    case "zoom_to_system": {
      const systemId = id(args.system_id);
      const system = systemId ? catalog.system(systemId) : null;
      if (!systemId || !system) return refuse("No system has that id. Use search_exoplanet first.");
      return { ok: true, action: { type: name, systemId, label: `The ${system.hostname} system` } };
    }
    case "navigate_to_explorer": {
      const section = SECTIONS.find((value) => value === args.section);
      if (!section) return refuse(`Section must be one of: ${SECTIONS.join(", ")}.`);
      return { ok: true, action: { type: name, section, label: `The ${section} section` } };
    }
    case "open_comparison": {
      const ids = args.planet_ids;
      if (!Array.isArray(ids) || ids.length !== 2) return refuse("Give exactly two planet ids.");
      const named = ids.map((value) => {
        const planetId = id(value);
        if (!planetId) return null;
        const found = catalog.planet(planetId) ?? catalog.reference(planetId);
        return found ? { planetId, name: found.name } : null;
      });
      if (!named[0] || !named[1]) return refuse("One of those planets isn't in the catalog.");
      return {
        ok: true,
        action: {
          type: name,
          planetIds: [named[0].planetId, named[1].planetId],
          label: `${named[0].name} compared with ${named[1].name}`,
        },
      };
    }
    case "open_habitability_view": {
      const planet = args.planet_id === undefined ? null : planetFor(args.planet_id);
      if (args.planet_id !== undefined && !planet) return refuse("No planet has that id.");
      const systemId = planet?.systemId ?? id(args.system_id);
      const system = systemId ? catalog.system(systemId) : null;
      if (!systemId || !system) return refuse("Give a valid planet_id or system_id.");
      return {
        ok: true,
        action: {
          type: name,
          planetId: planet?.planetId ?? null,
          systemId,
          label: `Habitability for ${planet?.name ?? system.hostname}`,
        },
      };
    }
  }
}
