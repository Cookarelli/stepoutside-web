export function logFirestorePermissionDenied(context: string, paths: string[], error: unknown): void {
  if (!__DEV__) return;

  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  const permissionDenied = code === "permission-denied" || message.toLowerCase().includes("permission");

  if (!permissionDenied) return;

  console.warn("[Firestore] permission denied", {
    context,
    paths,
    code,
    message,
    error,
  });
}
