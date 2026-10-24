// Extra fonts for /tweaks only, so the live page doesn't download them.
import {
  Atkinson_Hyperlegible_Next,
  Cormorant,
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
const cormorant = Cormorant({
  variable: "--font-tw-cormorant",
  subsets: ["latin"],
  style: ["normal", "italic"],
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
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-tw-atkinson",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const tweakFontVars = [instrument, cormorant, schibsted, newsreader, literata, atkinson]
  .map((f) => f.variable)
  .join(" ");
