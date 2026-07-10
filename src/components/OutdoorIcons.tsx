import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

import { OutdoorTheme } from "../../constants/theme";

export type OutdoorIconName =
  | "trail"
  | "mountain"
  | "compass"
  | "fire"
  | "tree"
  | "backpack"
  | "bootprint"
  | "map"
  | "binoculars"
  | "park-badge";

type OutdoorIconProps = {
  name: OutdoorIconName;
  size?: number;
  color?: string;
  accentColor?: string;
  mutedColor?: string;
  style?: StyleProp<ViewStyle>;
  strokeWidth?: number;
};

const colors = OutdoorTheme.colors;

export function OutdoorIcon({
  name,
  size = 22,
  color = colors.forest,
  accentColor = colors.gold,
  mutedColor = colors.sage,
  style,
  strokeWidth = 2,
}: OutdoorIconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {name === "trail" ? (
        <G>
          <Path d="M4 20 C7 16 9 16.5 10 13 C11.3 8.8 15.8 9 19.5 4" stroke={accentColor} strokeWidth={strokeWidth + 0.9} strokeLinecap="round" fill="none" />
          <Path d="M4 20 C7 16 9 16.5 10 13 C11.3 8.8 15.8 9 19.5 4" {...common} stroke={color} strokeDasharray="1 4" />
          <Circle cx="4.2" cy="19.8" r="1.6" fill={color} />
          <Circle cx="19.6" cy="4.1" r="1.7" fill={accentColor} />
        </G>
      ) : null}

      {name === "mountain" ? (
        <G>
          <Path d="M2.8 19.5 L8.7 8 L12.5 14.1 L15.7 10 L21.2 19.5Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Path d="M8.7 8 L10.7 11.3 L9.2 10.8 L7.8 13.1" stroke={accentColor} strokeWidth={strokeWidth - 0.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M12.6 14.2 L14 16.3 M15.7 10 L17.5 13.1" stroke={mutedColor} strokeWidth={strokeWidth - 0.2} strokeLinecap="round" opacity={0.8} />
        </G>
      ) : null}

      {name === "compass" ? (
        <G>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Path d="M15.8 6.9 L13.5 13.4 L7.9 16.1 L10.2 9.6Z" fill={accentColor} stroke={color} strokeWidth={strokeWidth - 0.15} strokeLinejoin="round" />
          <Circle cx="12" cy="12" r="1.1" fill={color} />
          <Line x1="12" y1="1.9" x2="12" y2="4" {...common} strokeWidth={strokeWidth - 0.4} />
          <Line x1="12" y1="20" x2="12" y2="22.1" {...common} strokeWidth={strokeWidth - 0.4} />
        </G>
      ) : null}

      {name === "fire" ? (
        <G>
          <Path d="M12 2.6 C16.2 7.4 18 11.2 16.2 15 C14.6 18.5 9.7 19 7.6 15.9 C5.6 13 7.3 10.2 9.2 8.1 C9.7 10.5 11.5 11.1 12.7 9.2 C13.8 7.4 12.6 4.8 12 2.6Z" fill={colors.campfire} stroke={color} strokeWidth={strokeWidth - 0.2} strokeLinejoin="round" />
          <Path d="M12 10 C14.1 12.5 14 15.7 12 17.2 C9.8 15.8 9.9 12.5 12 10Z" fill={accentColor} />
          <Path d="M6.3 20 L17.7 16.9 M17.7 20 L6.3 16.9" stroke={color} strokeWidth={strokeWidth + 0.6} strokeLinecap="round" />
        </G>
      ) : null}

      {name === "tree" ? (
        <G>
          <Path d="M12 2.6 L7.2 9.2 H9.5 L5.3 15 H8.3 L4.7 20.2 H19.3 L15.7 15 H18.7 L14.5 9.2 H16.8Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Line x1="12" y1="18.1" x2="12" y2="21.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d="M8.8 14.6 C10.7 15.5 13.3 15.5 15.2 14.6" stroke={accentColor} strokeWidth={strokeWidth - 0.2} strokeLinecap="round" fill="none" />
        </G>
      ) : null}

      {name === "backpack" ? (
        <G>
          <Path d="M8 7.2 C8 4.9 9.6 3.4 12 3.4 C14.4 3.4 16 4.9 16 7.2" {...common} />
          <Rect x="5.5" y="6.4" width="13" height="15" rx="3.2" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M8.6 10.7 H15.4 C16.1 10.7 16.7 11.3 16.7 12 V14.7 H7.3 V12 C7.3 11.3 7.9 10.7 8.6 10.7Z" fill={colors.goldTint} stroke={color} strokeWidth={strokeWidth - 0.35} strokeLinejoin="round" />
          <Path d="M8.3 17.9 H15.7 M9.1 6.5 V4.8 M14.9 6.5 V4.8" stroke={accentColor} strokeWidth={strokeWidth - 0.2} strokeLinecap="round" />
        </G>
      ) : null}

      {name === "bootprint" ? (
        <G>
          <Path d="M8.7 3.3 C11 3.6 12.2 5.1 11.8 7.2 L10.7 13.1 C10.3 15 8.8 16.2 6.9 15.9 C5 15.6 4 14.1 4.3 12.2 L5.3 6.1 C5.6 4.2 6.8 3.1 8.7 3.3Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M15.6 8.3 C17.6 8.6 18.9 10 18.6 12 L18 16.9 C17.7 19 16.3 20.2 14.3 20 C12.3 19.7 11.2 18.2 11.5 16.2 L12.1 11.3 C12.4 9.2 13.7 8 15.6 8.3Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M5.5 17.9 H9.6 M12.8 22 H17" stroke={accentColor} strokeWidth={strokeWidth - 0.15} strokeLinecap="round" />
        </G>
      ) : null}

      {name === "map" ? (
        <G>
          <Path d="M3.8 5.6 L8.9 3.7 L15 5.8 L20.2 3.8 V18.4 L15 20.3 L8.9 18.2 L3.8 20.2Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Path d="M8.9 3.7 V18.2 M15 5.8 V20.3" stroke={mutedColor} strokeWidth={strokeWidth - 0.4} strokeLinecap="round" opacity={0.75} />
          <Path d="M6.2 14.8 C8.9 11.3 11.4 14.1 13.2 10.4 C14 8.8 15.8 8.3 17.8 7.1" stroke={accentColor} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" strokeDasharray="1 3" />
          <Circle cx="17.9" cy="7" r="1.2" fill={accentColor} />
        </G>
      ) : null}

      {name === "binoculars" ? (
        <G>
          <Path d="M8.3 7.6 L10.1 4.8 H13.9 L15.7 7.6" {...common} />
          <Path d="M5 9.6 C5.4 7.8 6.8 6.7 8.7 6.7 C10.9 6.7 12.1 8.2 11.7 10.4 L10.4 17.2 C10.1 19 8.7 20.2 6.9 20.2 C4.8 20.2 3.5 18.7 3.9 16.6Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M19 9.6 C18.6 7.8 17.2 6.7 15.3 6.7 C13.1 6.7 11.9 8.2 12.3 10.4 L13.6 17.2 C13.9 19 15.3 20.2 17.1 20.2 C19.2 20.2 20.5 18.7 20.1 16.6Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} />
          <Ellipse cx="7.3" cy="17" rx="2.5" ry="2.1" fill={colors.goldTint} stroke={accentColor} strokeWidth={strokeWidth - 0.55} />
          <Ellipse cx="16.7" cy="17" rx="2.5" ry="2.1" fill={colors.goldTint} stroke={accentColor} strokeWidth={strokeWidth - 0.55} />
          <Line x1="10.9" y1="10.1" x2="13.1" y2="10.1" {...common} strokeWidth={strokeWidth - 0.4} />
        </G>
      ) : null}

      {name === "park-badge" ? (
        <G>
          <Path d="M12 2.7 L19.4 5.4 V11.4 C19.4 16.1 16.5 19.4 12 21.4 C7.5 19.4 4.6 16.1 4.6 11.4 V5.4Z" fill={colors.paper} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Path d="M7.1 14.9 L10 9.5 L12.2 13 L14.2 10.7 L17.1 14.9Z" fill={colors.goldTint} stroke={color} strokeWidth={strokeWidth - 0.55} strokeLinejoin="round" />
          <Path d="M9.7 16.9 C11.2 15.7 12.9 15.8 14.4 16.9" stroke={accentColor} strokeWidth={strokeWidth - 0.25} strokeLinecap="round" fill="none" />
          <Path d="M12 6.4 V4.9 M8.6 7.3 L7.6 6.1 M15.4 7.3 L16.4 6.1" stroke={accentColor} strokeWidth={strokeWidth - 0.45} strokeLinecap="round" />
        </G>
      ) : null}
    </Svg>
  );
}
