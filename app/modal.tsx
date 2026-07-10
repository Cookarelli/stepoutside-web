import { Link } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { EmptyStateCard, LayeredEnvironment } from "../src/components/OutdoorUI";

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <LayeredEnvironment intensity="quiet" />
      <EmptyStateCard
        title="Nothing else on this trail"
        body="This space is quiet for now. Head back home whenever you are ready."
        illustration="trail"
        style={styles.emptyCard}
      >
        <Link href="/(tabs)" style={styles.link}>
          Back to home
        </Link>
      </EmptyStateCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "transparent",
  },
  emptyCard: {
    width: "100%",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
    color: "#18442F",
    fontWeight: "800",
  },
});
