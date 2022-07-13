export const craftFileURL = (
  scope: `@${string}`,
  pkg: `${string}@${string}`,
  path: string,
  bucket = Deno.env.get("GOOGLE_CLOUD_BUCKET")!,
) => `https://storage.googleapis.com/${bucket}/${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}/${path}`;
