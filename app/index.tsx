import { Redirect } from "expo-router";
import React from "react";

/**
 * Route entry point.
 * Use <Redirect /> (not router.replace in an effect) to avoid
 * "Attempted to navigate before mounting the Root Layout".
 */
export default function Index() {
  return <Redirect href="/splash" />;
}