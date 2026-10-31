import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LEGEND, WEEKDAYS, WEEKS, type Event } from "./calendar";

export const alt =
  "Just Write: write 4 great essays over 4 weeks. An online writing club running November 2026.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same palette as globals.css (aubergine base, red accent).
const c = {
  cream: "#f9eeec",
  ink: "#38213f",
  washLight: "#ded3e2",
  brass: "#f66e5e",
  brassLight: "#ff8878",
};

const mark: Record<Event, React.CSSProperties> = {
  kickoff: { background: c.brass, color: c.ink, fontWeight: 600 },
  essay: {
    border: `2px solid ${c.brass}`,
    color: c.brassLight,
    fontWeight: 600,
  },
  circle: { background: "rgba(171,141,181,0.4)", color: c.cream },
  wrap: { background: c.cream, color: c.ink, fontWeight: 600 },
};

// Google Fonts serves a static TTF subset when asked by a non-browser client.
async function font(family: string, text: string) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`,
  ).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\) format/)?.[1];
  if (!url) throw new Error(`Font not found: ${family}`);
  return fetch(url).then((r) => r.arrayBuffer());
}

const HEADLINE = "Write 4 great essays over 4 weeks.";
const URL_TEXT = "justwrite.club";
const SUBHEAD = "An online writing club with a commitment to publish.";
const DIGITS = "0123456789";

const CELL = 50;

// The site icon, shown beside the wordmark.
const NIB =
  "data:image/svg+xml;base64," +
  readFileSync(join(process.cwd(), "app/icon.svg")).toString("base64");

export default async function Image() {
  // Fraunces changes shape with optical size, so each text size gets the
  // instance a browser would pick for it (opsz = font size in px).
  const [headline, title, small, smallLight, body, bodyBold] =
    await Promise.all([
      font("Fraunces:opsz,wght@80,340", HEADLINE),
      font("Fraunces:opsz,wght@46,600", "November"),
      font("Fraunces:opsz,wght@28,500", "Just Write"),
      font("Fraunces:opsz,wght@24,340", "2026"),
      font(
        "Atkinson+Hyperlegible+Next:wght@400",
        URL_TEXT +
          SUBHEAD +
          LEGEND.map((l) => l.title).join("") +
          WEEKDAYS.join("") +
          DIGITS,
      ),
      font("Atkinson+Hyperlegible+Next:wght@600", DIGITS),
    ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: c.ink,
        color: c.cream,
        padding: "60px 72px",
        fontFamily: "Fraunces",
      }}
    >
      {/* Left: wordmark, headline */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          paddingRight: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <img
            src={NIB}
            alt=""
            width={48}
            height={48}
            style={{ marginRight: 16 }}
          />
          {/* Satori drops spaces between inline spans, so space with margin */}
          <span
            style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.01em" }}
          >
            Just
          </span>
          <span
            style={{
              fontSize: 34,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              marginLeft: 9,
              color: c.brassLight,
            }}
          >
            Write
          </span>
          <div
            style={{
              width: 1,
              height: 26,
              margin: "4px 18px 0",
              background: "rgba(171,141,181,0.6)",
            }}
          />
          <span
            style={{
              fontFamily: "Atkinson",
              fontSize: 21,
              letterSpacing: "0.02em",
              marginTop: 4,
              color: "rgba(227,214,230,0.75)",
            }}
          >
            {URL_TEXT}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Fraunces Display",
              fontSize: 80,
              lineHeight: 1,
              letterSpacing: "-0.025em",
            }}
          >
            <span>Write 4 great essays</span>
            <span>over 4 weeks.</span>
          </div>
          <div
            style={{
              fontFamily: "Atkinson",
              fontSize: 26,
              lineHeight: 1.4,
              color: c.washLight,
              marginTop: 26,
            }}
          >
            {SUBHEAD}
          </div>
        </div>
      </div>

      {/* Right: November calendar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          width: 7 * CELL,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "baseline", marginBottom: 18 }}
        >
          <span
            style={{
              fontFamily: "Fraunces Title",
              fontSize: 46,
              letterSpacing: "-0.015em",
            }}
          >
            November
          </span>
          <span
            style={{
              fontFamily: "Fraunces Light",
              fontSize: 24,
              marginLeft: 12,
              color: "rgba(227,214,230,0.7)",
            }}
          >
            2026
          </span>
        </div>

        <div style={{ display: "flex", paddingBottom: 6 }}>
          {WEEKDAYS.map((d, i) => (
            <div
              key={i}
              style={{
                width: CELL,
                display: "flex",
                justifyContent: "center",
                fontFamily: "Atkinson",
                fontSize: 15,
                color: "rgba(227,214,230,0.8)",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {WEEKS.map((days, w) => (
          <div key={w} style={{ display: "flex" }}>
            {days.map((day, i) => (
              <div
                key={i}
                style={{
                  width: CELL,
                  height: CELL,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Atkinson",
                    fontSize: 18,
                    color: day.outside ? "rgba(245,241,236,0.3)" : c.cream,
                    ...(day.event ? mark[day.event] : {}),
                  }}
                >
                  {day.date}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            marginTop: 22,
            rowGap: 12,
          }}
        >
          {LEGEND.map((l) => (
            <div
              key={l.event}
              style={{ display: "flex", alignItems: "center", width: "50%" }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9999,
                  marginRight: 10,
                  ...mark[l.event],
                  borderWidth: l.event === "essay" ? 2 : 0,
                }}
              />
              <span style={{ fontFamily: "Atkinson", fontSize: 19 }}>
                {l.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: small, weight: 500 },
        { name: "Fraunces Light", data: smallLight, weight: 400 },
        { name: "Fraunces Title", data: title, weight: 400 },
        { name: "Fraunces Display", data: headline, weight: 400 },
        { name: "Atkinson", data: body, weight: 400 },
        { name: "Atkinson", data: bodyBold, weight: 600 },
      ],
    },
  );
}
