export function getMissingRequiredEnvVars(
  requiredVarNames: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return requiredVarNames.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}
