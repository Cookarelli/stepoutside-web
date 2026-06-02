import React from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { PREMIUM, alpha } from "../lib/premiumTheme";

type StepButtonVariant = "primary" | "secondary" | "tertiary";
type StepButtonTone = "forest" | "gold" | "danger";

type StepButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  variant?: StepButtonVariant;
  tone?: StepButtonTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function StepButton({
  label,
  onPress,
  disabled = false,
  fullWidth = false,
  variant = "primary",
  tone = "forest",
  style,
  textStyle,
}: StepButtonProps) {
  const variantStyle = resolveVariantStyle(variant, tone);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth ? styles.fullWidth : null,
        variantStyle.container,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <Text style={[styles.textBase, variantStyle.text, textStyle]}>{label}</Text>
    </Pressable>
  );
}

function resolveVariantStyle(variant: StepButtonVariant, tone: StepButtonTone) {
  if (variant === "primary") {
    if (tone === "gold") {
      return {
        container: {
          backgroundColor: PREMIUM.colors.gold,
          borderColor: PREMIUM.colors.goldDeep,
        },
        text: {
          color: PREMIUM.colors.ink,
        },
      };
    }

    if (tone === "danger") {
      return {
        container: {
          backgroundColor: PREMIUM.colors.danger,
          borderColor: alpha(PREMIUM.colors.danger, 0.72),
        },
        text: {
          color: PREMIUM.colors.offWhite,
        },
      };
    }

    return {
      container: {
        backgroundColor: PREMIUM.colors.forest,
        borderColor: alpha(PREMIUM.colors.forestDeep, 0.64),
      },
      text: {
        color: PREMIUM.colors.offWhite,
      },
    };
  }

  if (variant === "secondary") {
    if (tone === "gold") {
      return {
        container: {
          backgroundColor: alpha(PREMIUM.colors.gold, 0.14),
          borderColor: alpha(PREMIUM.colors.goldDeep, 0.4),
        },
        text: {
          color: PREMIUM.colors.ink,
        },
      };
    }

    return {
      container: {
        backgroundColor: alpha(PREMIUM.colors.offWhite, 0.92),
        borderColor: PREMIUM.colors.lineStrong,
      },
      text: {
        color: PREMIUM.colors.forest,
      },
    };
  }

  return {
    container: {
      backgroundColor: alpha(PREMIUM.colors.forest, 0.06),
      borderColor: alpha(PREMIUM.colors.forest, 0.12),
    },
    text: {
      color: PREMIUM.colors.text,
    },
  };
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: PREMIUM.radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...PREMIUM.shadow.soft,
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.992 }],
  },
  textBase: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.7,
    textAlign: "center",
  },
});
