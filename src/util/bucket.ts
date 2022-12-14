import packages from "../../packages.ts";
import { CACHE_DIR } from "./constants.ts";

export const craftCacheFileURL = (
  scope: `@${string}`,
  pkg: `${string}@${string}`,
  path: string,
) => `${CACHE_DIR}/${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}/${path}`;

export const craftFileURL = (
  scope: `${string}`,
  pkg: `${string}@latest`,
  path: string,
) => {
  const resolved = packages.find(
    (p) => p.scope === scope && p.name === pkg.split("@")[0],
  );
  if (!resolved) {
    throw new Error(`Could not resolve ${scope}/${pkg}`);
  }

  return `${resolved.path}/${path}`;
};

export function uploadFile(scope: string, pkg: string, path: string, content: string) {
  return Deno.writeFile(
    `${CACHE_DIR}/${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}/${path}`,
    new TextEncoder().encode(content),
  );
}
