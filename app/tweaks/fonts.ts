// Extra fonts for /tweaks only, so the live page doesn't download them.
import {
  EB_Garamond,
  Fraunces,
  Instrument_Serif,
  Literata,
  Newsreader,
  Schibsted_Grotesk,
} from "next/font/google";

const instrument = Instrument_Serif({
  variable: "--font-tw-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});
const fraunces = Fraunces({
  variable: "--font-tw-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});
const schibsted = Schibsted_Grotesk({
  variable: "--font-tw-schibsted",
  subsets: ["latin"],
  style: ["normal", "italic"],
});
const newsreader = Newsreader({
  variable: "--font-tw-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});
const literata = Literata({
  variable: "--font-tw-literata",
  subsets: ["latin"],
  style: ["normal", "italic"],
});
const garamond = EB_Garamond({
  variable: "--font-tw-garamond",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const tweakFontVars = [fraunces, instrument, schibsted, garamond, newsreader, literata]
  .map((f) => f.variable)
  .join(" ");
