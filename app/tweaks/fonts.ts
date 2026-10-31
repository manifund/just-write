// Extra fonts for /tweaks only, so the live page doesn't download them.
import {
  Cormorant,
  EB_Garamond,
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
const garamond = EB_Garamond({
  variable: "--font-tw-garamond",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const tweakFontVars = [
  cormorant,
  instrument,
  schibsted,
  garamond,
  newsreader,
  literata,
]
  .map((f) => f.variable)
  .join(" ");
