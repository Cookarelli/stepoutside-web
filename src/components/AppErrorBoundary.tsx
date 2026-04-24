import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown app error",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("[app-boundary]", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Something slipped.</Text>
          <Text style={styles.body}>
            The app hit an unexpected state. Retry this screen instead of crashing the whole app.
          </Text>
          {this.state.message ? <Text style={styles.debugText}>{this.state.message}</Text> : null}
          <Pressable
            style={styles.button}
            onPress={() => {
              this.setState({ hasError: false, message: "" });
            }}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8F4EE",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 22,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.16)",
  },
  title: {
    color: "#0B0F0E",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    marginTop: 10,
    color: "rgba(11,15,14,0.72)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  debugText: {
    marginTop: 12,
    color: "rgba(11,15,14,0.58)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  button: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#255E36",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
