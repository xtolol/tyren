import React from "react";
import Svg, { Circle, G, Line, Path, Polygon } from "react-native-svg";

// The procedural relic crest — the app's centerpiece (design 1B "Sigil").
// A hexagonal seal ringed by radiating rays with a per-level glyph inside.
// Pure SVG, no illustration assets, so every level gets a distinct crest
// for free from its path index. Only levels 1–2 have designs so far:
// Zalthar's Chains wears the four-point spark, Hollowroot wears its own
// root-creature face; later glyphs are placeholders awaiting designs.

const VIEW = 200;
const CENTER = VIEW / 2;

function hexPoints(radius: number): string {
  return Array.from({ length: 6 })
    .map((_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return `${CENTER + radius * Math.cos(angle)},${CENTER + radius * Math.sin(angle)}`;
    })
    .join(" ");
}

function diamondPoints(cx: number, cy: number, r: number): string {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
}

// The four-point spark from the level-1 card design.
function Spark({ color }: { color: string }) {
  const long = 26;
  const waist = 6;
  return (
    <Path
      d={`M ${CENTER} ${CENTER - long}
          L ${CENTER + waist} ${CENTER - waist}
          L ${CENTER + long} ${CENTER}
          L ${CENTER + waist} ${CENTER + waist}
          L ${CENTER} ${CENTER + long}
          L ${CENTER - waist} ${CENTER + waist}
          L ${CENTER - long} ${CENTER}
          L ${CENTER - waist} ${CENTER - waist}
          Z`}
      fill={color}
    />
  );
}

// Hollowroot's face (the level-2 boss design): two round eyes and a
// diamond beak. Calm = hollow outlines; hostile = the eyes light up.
function HollowrootFace({ color, hostile }: { color: string; hostile: boolean }) {
  const eyeProps = hostile
    ? { fill: color, stroke: "none" as const }
    : { fill: "none" as const, stroke: color, strokeWidth: 4.5 };
  return (
    <G>
      <Circle cx={CENTER - 15} cy={CENTER - 10} r={7} {...eyeProps} />
      <Circle cx={CENTER + 15} cy={CENTER - 10} r={7} {...eyeProps} />
      <Polygon
        points={diamondPoints(CENTER, CENTER + 14, 10)}
        fill={hostile ? color : "none"}
        stroke={color}
        strokeWidth={hostile ? 0 : 4}
        strokeLinejoin="round"
      />
    </G>
  );
}

// One glyph per level index. 0–1 match shipped designs; the rest are
// placeholders until those levels are designed.
function Glyph({ index, color, hostile }: { index: number; color: string; hostile: boolean }) {
  const props = { stroke: color, strokeWidth: 5, fill: "none" as const, strokeLinecap: "round" as const };
  switch (index % 5) {
    case 0: // Zalthar's Chains — the spark
      return <Spark color={color} />;
    case 1: // Hollowroot — the root creature itself
      return <HollowrootFace color={color} hostile={hostile} />;
    case 2: // placeholder — a cut rune
      return (
        <G>
          <Line x1={CENTER} y1={CENTER - 22} x2={CENTER} y2={CENTER + 22} {...props} />
          <Line x1={CENTER} y1={CENTER - 10} x2={CENTER + 16} y2={CENTER - 20} {...props} />
          <Line x1={CENTER} y1={CENTER + 6} x2={CENTER - 16} y2={CENTER - 4} {...props} />
        </G>
      );
    case 3: // placeholder — a bloom returning
      return (
        <G>
          <Circle cx={CENTER} cy={CENTER} r={7} {...props} />
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            return (
              <Line
                key={i}
                x1={CENTER + 13 * Math.cos(angle)}
                y1={CENTER + 13 * Math.sin(angle)}
                x2={CENTER + 22 * Math.cos(angle)}
                y2={CENTER + 22 * Math.sin(angle)}
                {...props}
              />
            );
          })}
        </G>
      );
    default: // placeholder — the shattered star
      return (
        <G>
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (Math.PI / 4) * i;
            return (
              <Line
                key={i}
                x1={CENTER + 6 * Math.cos(angle)}
                y1={CENTER + 6 * Math.sin(angle)}
                x2={CENTER + 24 * Math.cos(angle)}
                y2={CENTER + 24 * Math.sin(angle)}
                {...props}
              />
            );
          })}
        </G>
      );
  }
}

// A generic hostile face for levels without a bespoke boss design.
function BossEyes({ color }: { color: string }) {
  return (
    <G>
      <Circle cx={CENTER - 14} cy={CENTER - 8} r={6} fill={color} />
      <Circle cx={CENTER + 14} cy={CENTER - 8} r={6} fill={color} />
      <Polygon
        points={diamondPoints(CENTER, CENTER + 12, 9)}
        fill={color}
        strokeLinejoin="round"
      />
    </G>
  );
}

export interface CrestProps {
  size: number;
  color: string;
  dimColor: string;
  glyphIndex: number;
  // Boss stage: the crest turns hostile (Hollowroot's eyes light up;
  // levels without a bespoke creature get the generic glare).
  hostile?: boolean;
}

export default function Crest({
  size,
  color,
  dimColor,
  glyphIndex,
  hostile = false,
}: CrestProps) {
  const useBespoke = glyphIndex % 5 === 1; // Hollowroot has its own hostile form

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      {/* Radiating rays behind the seal */}
      <G>
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (Math.PI / 12) * i;
          const inner = 60;
          const outer = i % 2 === 0 ? 88 : 76;
          return (
            <Line
              key={i}
              x1={CENTER + inner * Math.cos(angle)}
              y1={CENTER + inner * Math.sin(angle)}
              x2={CENTER + outer * Math.cos(angle)}
              y2={CENTER + outer * Math.sin(angle)}
              stroke={dimColor}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
      </G>

      {/* The hexagonal crest */}
      <Polygon points={hexPoints(50)} stroke={color} strokeWidth={3.5} fill="none" strokeLinejoin="round" />

      {hostile && !useBespoke ? (
        <BossEyes color={color} />
      ) : (
        <Glyph index={glyphIndex} color={color} hostile={hostile} />
      )}
    </Svg>
  );
}
