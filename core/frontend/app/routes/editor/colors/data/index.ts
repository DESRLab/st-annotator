import { Colormap } from "./Colormap";
import * as cmaps from "./colormaps";

export { Colormap, cmaps };
export type { ColorRGB } from "./ColorRGB";

const ALL_CMAP_NAMES = [
  "jet",
  "hsv",
  "hot",
  "spring",
  "summer",
  "autumn",
  "winter",
  "bone",
  "copper",
  "greys",
  "yignbu",
  "greens",
  "yiorrd",
  "bluered",
  "rdbu",
  "picnic",
  "rainbow",
  "portland",
  "blackbody",
  "earth",
  "electric",
  "alpha",
  "viridis",
  "inferno",
  "magma",
  "plasma",
  "warm",
  "cool",
  "rainbow-soft",
  "bathymetry",
  "cdom",
  "chlorophyll",
  "density",
  "freesurface-blue",
  "freesurface-red",
  "oxygen",
  "par",
  "phase",
  "salinity",
  "temperature",
  "turbidity",
  "velocity-blue",
  "velocity-green",
  "cubehelix",
];

/**
 * An array containing all available colormaps.
 */
export const ALL_CMAPS: readonly Colormap[] = ALL_CMAP_NAMES.map(cmaps.get);
