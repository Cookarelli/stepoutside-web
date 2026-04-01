#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const apiv2 = require("firebase-tools/lib/apiv2");
const { firestoreOrigin } = require("firebase-tools/lib/api");

async function loadEnvFile(envPath) {
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

async function readCliTokens() {
  const configPath = path.join(process.env.HOME ?? "", ".config", "configstore", "firebase-tools.json");
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const accessToken = parsed?.tokens?.access_token;
  const idToken = parsed?.tokens?.id_token;
  const refreshToken = parsed?.tokens?.refresh_token;
  if (!accessToken || !idToken || !refreshToken) {
    throw new Error(`Missing Google tokens in ${configPath}`);
  }
  return { accessToken, idToken, refreshToken };
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toFirestoreValue(nested)])),
      },
    };
  }
  throw new Error(`Unsupported Firestore field value: ${String(value)}`);
}

function toFirestoreDocument(route, projectId) {
  return {
    name: `projects/${projectId}/databases/(default)/documents/routes/${route.id}`,
    fields: Object.fromEntries(Object.entries(route).map(([key, value]) => [key, toFirestoreValue(value)])),
  };
}

function firestoreClient() {
  return new apiv2.Client({
    auth: true,
    apiVersion: "v1",
    urlPrefix: firestoreOrigin(),
  });
}

async function importRoutes(projectId, routes) {
  const client = firestoreClient();
  let imported = 0;

  for (let i = 0; i < routes.length; i += 400) {
    const chunk = routes.slice(i, i + 400);
    await client.post(`/projects/${projectId}/databases/(default)/documents:commit`, {
      writes: chunk.map((route) => ({
        update: toFirestoreDocument(route, projectId),
      })),
    });
    imported += chunk.length;
    console.log(`Imported ${imported}/${routes.length} routes...`);
  }
}

async function main() {
  const cwd = process.cwd();
  await loadEnvFile(path.join(cwd, ".env"));

  const inputPath = process.argv[2]
    ? path.resolve(cwd, process.argv[2])
    : path.join(cwd, "tmp", "route-catalog-seed.json");

  const raw = await readFile(inputPath, "utf8");
  const routes = JSON.parse(raw);
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error(`No routes found in ${inputPath}`);
  }

  const projectId = required("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
  const { refreshToken } = await readCliTokens();
  apiv2.setRefreshToken(refreshToken);
  await importRoutes(projectId, routes);

  console.log(`Imported ${routes.length} routes into Firestore collection "routes".`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
