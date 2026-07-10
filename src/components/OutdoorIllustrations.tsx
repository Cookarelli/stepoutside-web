import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";

import { OutdoorTheme } from "../../constants/theme";

type IllustrationVariant = "light" | "forest";

type IllustrationProps = {
  size?: number;
  width?: number;
  height?: number;
  opacity?: number;
  variant?: IllustrationVariant;
  style?: StyleProp<ViewStyle>;
};

type SvgFrameProps = IllustrationProps & {
  viewBox?: string;
  children: React.ReactNode;
};

const colors = OutdoorTheme.colors;

function palette(variant: IllustrationVariant = "light") {
  const inverse = variant === "forest";
  return {
    ink: inverse ? colors.paper : colors.pine,
    primary: inverse ? colors.paper : colors.forest,
    secondary: inverse ? "rgba(255,249,239,0.62)" : colors.moss,
    tertiary: inverse ? "rgba(255,249,239,0.34)" : colors.sage,
    accent: colors.gold,
    fire: colors.campfire,
    paper: inverse ? "rgba(255,249,239,0.18)" : colors.paper,
    fog: inverse ? "rgba(255,249,239,0.24)" : colors.fog,
    line: inverse ? "rgba(255,249,239,0.42)" : colors.line,
  };
}

function SvgFrame({
  size = 96,
  width,
  height,
  opacity = 1,
  style,
  viewBox = "0 0 100 100",
  children,
}: SvgFrameProps) {
  return (
    <Svg
      pointerEvents="none"
      width={width ?? size}
      height={height ?? size}
      viewBox={viewBox}
      opacity={opacity}
      style={style}
    >
      {children}
    </Svg>
  );
}

export const PineTreeIllustration = React.memo(function PineTreeIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Polygon points="50,8 32,36 42,34 25,62 40,58 21,87 79,87 60,58 75,62 58,34 68,36" fill={p.primary} />
      <Rect x="45" y="78" width="10" height="16" rx="4" fill={p.ink} />
      <Path d="M34 66 C45 71 55 71 66 66" stroke={p.tertiary} strokeWidth="3" strokeLinecap="round" fill="none" />
    </SvgFrame>
  );
});

export const PineForestIllustration = React.memo(function PineForestIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 180 100">
      <PineTreeGroup x={8} scale={0.86} fill={p.secondary} trunk={p.ink} />
      <PineTreeGroup x={42} scale={1.1} fill={p.primary} trunk={p.ink} />
      <PineTreeGroup x={84} scale={0.92} fill={p.secondary} trunk={p.ink} />
      <PineTreeGroup x={118} scale={1.22} fill={p.primary} trunk={p.ink} />
      <PineTreeGroup x={158} scale={0.78} fill={p.tertiary} trunk={p.ink} />
      <Path d="M8 88 C44 82 72 93 108 86 C136 81 155 86 176 82" stroke={p.line} strokeWidth="4" strokeLinecap="round" fill="none" />
    </SvgFrame>
  );
});

function PineTreeGroup({ x, scale, fill, trunk }: { x: number; scale: number; fill: string; trunk: string }) {
  return (
    <G transform={`translate(${x} ${92 - 78 * scale}) scale(${scale})`}>
      <Polygon points="20,0 6,24 14,22 0,48 11,45 0,70 40,70 29,45 40,48 26,22 34,24" fill={fill} />
      <Rect x="16" y="62" width="8" height="14" rx="3" fill={trunk} />
    </G>
  );
}

export const CampfireIllustration = React.memo(function CampfireIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Ellipse cx="50" cy="86" rx="34" ry="8" fill={p.line} />
      <Path d="M35 80 L69 91" stroke={p.ink} strokeWidth="7" strokeLinecap="round" />
      <Path d="M65 80 L31 91" stroke={p.ink} strokeWidth="7" strokeLinecap="round" />
      <Path d="M50 14 C67 34 74 48 67 64 C61 77 43 79 35 66 C28 54 36 43 43 35 C45 47 51 50 55 42 C59 33 51 24 50 14Z" fill={p.fire} />
      <Path d="M50 37 C61 51 60 65 50 72 C39 65 40 51 50 37Z" fill={p.accent} />
      <Path d="M50 52 C55 59 55 66 50 70 C45 66 45 59 50 52Z" fill={colors.paper} opacity={0.7} />
    </SvgFrame>
  );
});

export const MountainLayersIllustration = React.memo(function MountainLayersIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 160 100">
      <Path d="M4 78 L40 30 L60 52 L82 18 L154 78Z" fill={p.tertiary} />
      <Path d="M20 82 L58 40 L78 60 L104 30 L158 82Z" fill={p.secondary} />
      <Path d="M0 88 L48 50 L82 78 L112 54 L160 88Z" fill={p.primary} />
      <Path d="M82 18 L94 38 L83 32 L73 42" stroke={colors.paper} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.75} />
    </SvgFrame>
  );
});

export const TrailIllustration = React.memo(function TrailIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 140 100">
      <Path d="M16 86 C32 70 55 76 63 58 C73 36 92 42 122 14" stroke={p.accent} strokeWidth="8" strokeLinecap="round" fill="none" />
      <Path d="M16 86 C32 70 55 76 63 58 C73 36 92 42 122 14" stroke={p.paper} strokeWidth="3" strokeLinecap="round" fill="none" strokeDasharray="8 8" />
      <Circle cx="18" cy="84" r="8" fill={p.primary} />
      <Circle cx="122" cy="14" r="7" fill={p.fire} />
    </SvgFrame>
  );
});

export const ForestSilhouetteIllustration = React.memo(function ForestSilhouetteIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 220 82">
      <Path
        d="M0 74 L15 44 L8 46 L24 20 L39 46 L32 44 L48 74 L58 74 L72 36 L65 38 L82 10 L100 38 L92 36 L106 74 L118 74 L131 46 L125 48 L140 24 L156 48 L150 46 L164 74 L176 74 L190 35 L184 37 L202 8 L220 74Z"
        fill={p.primary}
      />
      <Rect x="0" y="72" width="220" height="10" rx="5" fill={p.ink} opacity={0.85} />
    </SvgFrame>
  );
});

export const MorningFogIllustration = React.memo(function MorningFogIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 180 70">
      <Path d="M6 20 C28 8 45 33 66 20 C86 8 104 30 126 18 C144 8 158 18 174 16" stroke={p.fog} strokeWidth="8" strokeLinecap="round" fill="none" />
      <Path d="M18 38 C48 28 61 50 86 37 C112 24 128 42 160 32" stroke={p.line} strokeWidth="7" strokeLinecap="round" fill="none" />
      <Path d="M4 55 C38 46 58 64 92 52 C118 44 145 57 176 48" stroke={p.fog} strokeWidth="6" strokeLinecap="round" fill="none" opacity={0.8} />
    </SvgFrame>
  );
});

export const SunriseGlowIllustration = React.memo(function SunriseGlowIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Defs>
        <LinearGradient id="sunriseGlow" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.fire} stopOpacity="0.62" />
          <Stop offset="1" stopColor={p.accent} stopOpacity="0.16" />
        </LinearGradient>
      </Defs>
      <Circle cx="50" cy="52" r="34" fill="url(#sunriseGlow)" />
      <Path d="M18 68 H82" stroke={p.primary} strokeWidth="5" strokeLinecap="round" />
      <Path d="M28 78 H72" stroke={p.line} strokeWidth="4" strokeLinecap="round" />
      <Path d="M50 8 V24 M20 24 L31 35 M80 24 L69 35" stroke={p.accent} strokeWidth="4" strokeLinecap="round" />
    </SvgFrame>
  );
});

export const PaperTextureIllustration = React.memo(function PaperTextureIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 220 140">
      <Circle cx="20" cy="24" r="1.4" fill={p.ink} opacity={0.12} />
      <Circle cx="72" cy="18" r="1" fill={p.ink} opacity={0.1} />
      <Circle cx="146" cy="28" r="1.3" fill={p.ink} opacity={0.09} />
      <Circle cx="202" cy="20" r="1" fill={p.ink} opacity={0.12} />
      <Circle cx="38" cy="86" r="1.2" fill={p.ink} opacity={0.1} />
      <Circle cx="118" cy="76" r="1.1" fill={p.ink} opacity={0.08} />
      <Circle cx="188" cy="104" r="1.5" fill={p.ink} opacity={0.09} />
      <Path d="M12 52 C46 47 71 57 106 51 C139 45 165 54 208 48" stroke={p.line} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity={0.28} />
      <Path d="M20 118 C58 112 88 124 126 116 C157 110 184 117 214 112" stroke={p.line} strokeWidth="1" strokeLinecap="round" fill="none" opacity={0.24} />
    </SvgFrame>
  );
});

export const SunsetStreaksIllustration = React.memo(function SunsetStreaksIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 140 30">
      <Path d="M8 10 H132" stroke={p.accent} strokeWidth="7" strokeLinecap="round" opacity={0.52} />
      <Path d="M54 17 H132" stroke={p.fire} strokeWidth="6" strokeLinecap="round" opacity={0.42} />
      <Path d="M26 24 H128" stroke={p.paper} strokeWidth="5" strokeLinecap="round" opacity={0.58} />
    </SvgFrame>
  );
});

export const StarsIllustration = React.memo(function StarsIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Star cx={22} cy={28} r={8} fill={p.accent} />
      <Star cx={64} cy={18} r={5} fill={p.paper} />
      <Star cx={76} cy={62} r={9} fill={p.accent} />
      <Circle cx="38" cy="70" r="3" fill={p.paper} />
      <Circle cx="84" cy="34" r="2.5" fill={p.paper} />
      <Circle cx="18" cy="58" r="2" fill={p.paper} />
    </SvgFrame>
  );
});

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  return <Path d={`M${cx} ${cy - r} L${cx + r * 0.24} ${cy - r * 0.24} L${cx + r} ${cy} L${cx + r * 0.24} ${cy + r * 0.24} L${cx} ${cy + r} L${cx - r * 0.24} ${cy + r * 0.24} L${cx - r} ${cy} L${cx - r * 0.24} ${cy - r * 0.24}Z`} fill={fill} />;
}

export const MoonIllustration = React.memo(function MoonIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Path d="M61 13 C43 18 31 34 31 53 C31 73 46 87 66 88 C55 78 51 64 55 49 C59 33 69 23 83 18 C76 14 69 12 61 13Z" fill={p.accent} />
      <Circle cx="72" cy="34" r="3" fill={p.paper} opacity={0.7} />
      <Circle cx="65" cy="58" r="4" fill={p.paper} opacity={0.45} />
    </SvgFrame>
  );
});

export const LeavesIllustration = React.memo(function LeavesIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Path d="M50 82 C49 54 43 35 24 18" stroke={p.ink} strokeWidth="4" strokeLinecap="round" fill="none" />
      <Path d="M50 70 C65 57 71 44 70 24 C50 28 39 45 50 70Z" fill={p.secondary} />
      <Path d="M43 55 C28 52 19 41 16 24 C33 23 45 35 43 55Z" fill={p.primary} />
      <Path d="M54 40 C67 34 75 24 78 10 C62 10 51 22 54 40Z" fill={p.accent} opacity={0.72} />
    </SvgFrame>
  );
});

export const WildflowersIllustration = React.memo(function WildflowersIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Path d="M24 88 C27 66 28 48 22 32 M50 90 C51 66 50 46 56 26 M76 88 C75 68 76 52 84 38" stroke={p.secondary} strokeWidth="3" strokeLinecap="round" fill="none" />
      <Flower cx={22} cy={28} petal={p.accent} center={p.fire} />
      <Flower cx={57} cy={22} petal={p.paper} center={p.accent} />
      <Flower cx={86} cy={34} petal={p.fire} center={p.accent} />
      <Path d="M10 90 C34 82 62 96 92 86" stroke={p.line} strokeWidth="5" strokeLinecap="round" fill="none" />
    </SvgFrame>
  );
});

function Flower({ cx, cy, petal, center }: { cx: number; cy: number; petal: string; center: string }) {
  return (
    <G>
      <Circle cx={cx} cy={cy - 8} r="6" fill={petal} />
      <Circle cx={cx + 8} cy={cy} r="6" fill={petal} />
      <Circle cx={cx} cy={cy + 8} r="6" fill={petal} />
      <Circle cx={cx - 8} cy={cy} r="6" fill={petal} />
      <Circle cx={cx} cy={cy} r="5" fill={center} />
    </G>
  );
}

export const CompassIllustration = React.memo(function CompassIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Circle cx="50" cy="50" r="38" fill={p.paper} stroke={p.primary} strokeWidth="5" />
      <Circle cx="50" cy="50" r="5" fill={p.primary} />
      <Path d="M58 42 L74 20 L52 36 L42 58 L26 80 L48 64Z" fill={p.accent} />
      <Path d="M42 58 L26 80 L48 64 L58 42Z" fill={p.primary} opacity={0.86} />
      <TextTick x1={50} y1={18} x2={50} y2={26} color={p.primary} />
      <TextTick x1={50} y1={74} x2={50} y2={82} color={p.primary} />
      <TextTick x1={18} y1={50} x2={26} y2={50} color={p.primary} />
      <TextTick x1={74} y1={50} x2={82} y2={50} color={p.primary} />
    </SvgFrame>
  );
});

function TextTick({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  return <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="4" strokeLinecap="round" />;
}

export const BootPrintsIllustration = React.memo(function BootPrintsIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 120 100">
      <G transform="rotate(-16 38 48)">
        <Path d="M28 18 C42 15 51 24 48 40 L44 64 C42 76 30 80 20 73 C13 68 12 57 16 48 L25 27 C26 23 27 20 28 18Z" fill={p.primary} />
        <Path d="M16 82 H43" stroke={p.accent} strokeWidth="5" strokeLinecap="round" strokeDasharray="4 6" />
      </G>
      <G transform="rotate(16 80 58)">
        <Path d="M76 26 C90 23 99 32 96 48 L92 72 C90 84 78 88 68 81 C61 76 60 65 64 56 L73 35 C74 31 75 28 76 26Z" fill={p.secondary} />
        <Path d="M64 90 H91" stroke={p.accent} strokeWidth="5" strokeLinecap="round" strokeDasharray="4 6" />
      </G>
    </SvgFrame>
  );
});

export const NationalParkBadgeIllustration = React.memo(function NationalParkBadgeIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Path d="M50 6 L86 20 V51 C86 72 72 88 50 94 C28 88 14 72 14 51 V20Z" fill={p.paper} stroke={p.primary} strokeWidth="5" />
      <Path d="M22 61 L42 38 L54 52 L67 31 L80 61Z" fill={p.tertiary} />
      <Path d="M20 68 L43 49 L60 65 L76 51 L82 68Z" fill={p.primary} />
      <Path d="M28 76 C43 72 58 82 74 75" stroke={p.accent} strokeWidth="5" strokeLinecap="round" fill="none" />
      <Circle cx="71" cy="25" r="6" fill={p.fire} />
    </SvgFrame>
  );
});

export const TrailMarkerIllustration = React.memo(function TrailMarkerIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Rect x="44" y="18" width="12" height="72" rx="5" fill={p.ink} />
      <Path d="M28 20 H76 L88 32 L76 44 H28Z" fill={p.primary} />
      <Path d="M72 26 L80 32 L72 38" stroke={p.accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x="34" y="54" width="42" height="18" rx="7" fill={p.paper} stroke={p.primary} strokeWidth="4" />
    </SvgFrame>
  );
});

export const MapIllustration = React.memo(function MapIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props}>
      <Path d="M14 24 L38 14 L62 24 L86 14 V76 L62 86 L38 76 L14 86Z" fill={p.paper} stroke={p.primary} strokeWidth="4" strokeLinejoin="round" />
      <Path d="M38 14 V76 M62 24 V86" stroke={p.line} strokeWidth="4" strokeLinecap="round" />
      <Path d="M24 67 C40 50 47 62 56 42 C62 28 72 31 80 24" stroke={p.accent} strokeWidth="5" strokeLinecap="round" fill="none" strokeDasharray="7 7" />
      <Circle cx="24" cy="67" r="5" fill={p.primary} />
      <Circle cx="80" cy="24" r="5" fill={p.fire} />
    </SvgFrame>
  );
});

export const LakeReflectionIllustration = React.memo(function LakeReflectionIllustration({ variant = "light", ...props }: IllustrationProps) {
  const p = palette(variant);
  return (
    <SvgFrame {...props} viewBox="0 0 160 100">
      <Circle cx="122" cy="28" r="12" fill={p.accent} opacity={0.7} />
      <Path d="M8 58 L42 24 L65 48 L84 28 L148 58Z" fill={p.secondary} />
      <Path d="M0 66 C30 58 48 72 80 64 C112 56 128 70 160 62 V100 H0Z" fill={p.primary} opacity={0.18} />
      <Path d="M18 74 H70 M88 76 H142 M38 88 H122" stroke={p.accent} strokeWidth="4" strokeLinecap="round" opacity={0.55} />
      <Path d="M8 58 C45 64 83 64 148 58" stroke={p.primary} strokeWidth="5" strokeLinecap="round" fill="none" />
    </SvgFrame>
  );
});

export const StepOutsideBadgeIllustration = React.memo(function StepOutsideBadgeIllustration({ variant = "light", ...props }: IllustrationProps) {
  return <NationalParkBadgeIllustration variant={variant} {...props} />;
});
