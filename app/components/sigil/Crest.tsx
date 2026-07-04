import React from "react";
import Svg, { Circle, G, Line, Path, Polygon } from "react-native-svg";

// The procedural relic crest — the app's centerpiece (design 1B "Sigil").
// A hexagonal seal ringed by radiating rays with a per-level glyph inside,
// one per rung of the world map (codex design): spark, concentric rings,
// sprig, Hollowroot's face, ember drop, starburst. Pure SVG, no illustration
// assets, so every level gets a distinct crest for free from its path index.

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

// L1 Zalthar's Chains — the four-point spark.
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

// L2 Yawning Depths — concentric rings closing on a still point.
function Rings({ color }: { color: string }) {
  return (
    <G>
      <Circle cx={CENTER} cy={CENTER} r={24} stroke={color} strokeWidth={4.5} fill="none" />
      <Circle cx={CENTER} cy={CENTER} r={14} stroke={color} strokeWidth={4} fill="none" />
      <Circle cx={CENTER} cy={CENTER} r={5} fill={color} />
    </G>
  );
}

// L3 Withered Plains — the last sprig, a stem with two reaching twigs.
function Sprig({ color }: { color: string }) {
  const props = { stroke: color, strokeWidth: 4.5, strokeLinecap: "round" as const };
  return (
    <G>
      <Line x1={CENTER} y1={CENTER - 26} x2={CENTER} y2={CENTER + 26} {...props} />
      <Line x1={CENTER} y1={CENTER - 6} x2={CENTER + 15} y2={CENTER - 20} {...props} />
      <Line x1={CENTER} y1={CENTER + 4} x2={CENTER - 15} y2={CENTER - 10} {...props} />
      <Line x1={CENTER} y1={CENTER + 14} x2={CENTER + 12} y2={CENTER + 3} {...props} />
    </G>
  );
}

// L4 Hollowroot — the root creature's face (its original shipped design):
// two round eyes and a diamond beak. Calm = hollow outlines; hostile =
// the eyes light up.
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

// L5 Emberfall Reach — a falling ember, a filled drop tipping sideways.
function Ember({ color }: { color: string }) {
  return (
    <Path
      d={`M ${CENTER - 24} ${CENTER - 14}
          C ${CENTER + 2} ${CENTER - 26}, ${CENTER + 22} ${CENTER - 14}, ${CENTER + 20} ${CENTER + 4}
          C ${CENTER + 18} ${CENTER + 20}, ${CENTER - 2} ${CENTER + 24}, ${CENTER - 12} ${CENTER + 12}
          C ${CENTER - 20} ${CENTER + 3}, ${CENTER - 24} ${CENTER - 6}, ${CENTER - 24} ${CENTER - 14}
          Z`}
      fill={color}
    />
  );
}

// L6 Zalthar Unbound — the starburst, eight rays from a broken center.
function Starburst({ color }: { color: string }) {
  return (
    <G>
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (Math.PI / 4) * i;
        const outer = i % 2 === 0 ? 26 : 20;
        return (
          <Line
            key={i}
            x1={CENTER + 7 * Math.cos(angle)}
            y1={CENTER + 7 * Math.sin(angle)}
            x2={CENTER + outer * Math.cos(angle)}
            y2={CENTER + outer * Math.sin(angle)}
            stroke={color}
            strokeWidth={4.5}
            strokeLinecap="round"
          />
        );
      })}
    </G>
  );
}

function Glyph({ index, color, hostile }: { index: number; color: string; hostile: boolean }) {
  switch (index % 6) {
    case 0:
      return <Spark color={color} />;
    case 1:
      return <Rings color={color} />;
    case 2:
      return <Sprig color={color} />;
    case 3:
      return <HollowrootFace color={color} hostile={hostile} />;
    case 4:
      return <Ember color={color} />;
    default:
      return <Starburst color={color} />;
  }
}

// The generic hostile face for boss stages without a bespoke creature
// (Hollowroot has its own hostile form above).
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
  // Boss stage: the crest turns hostile.
  hostile?: boolean;
}

export default function Crest({
  size,
  color,
  dimColor,
  glyphIndex,
  hostile = false,
}: CrestProps) {
  const useBespoke = glyphIndex % 6 === 3; // Hollowroot has its own hostile form
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
