import type { Metadata } from "next";
import { Landing } from "../landing";
import { tweakFontVars } from "./fonts";
import { parseSelection } from "./options";
import { Tweaks } from "./tweaks";

// Reads ?display=&body=&palette= on every request.
export const instant = false;

export const metadata: Metadata = {
  title: "Just Write tweaks",
  robots: { index: false },
};

export default async function TweaksPage({
  searchParams,
}: PageProps<"/tweaks">) {
  const initial = parseSelection(await searchParams);
  return (
    <Tweaks initial={initial} fontVars={tweakFontVars}>
      <Landing />
    </Tweaks>
  );
}
