import { GoogleAuth } from "https://deno.land/x/google_api@v1.0/google_auth.ts";

export interface GooglePrivateKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY_JSON")!;
const parsedKey: GooglePrivateKey = JSON.parse(privateKey);

const auth = new GoogleAuth({
  scope: ["https://www.googleapis.com/auth/cloud-platform"],
  email: parsedKey.client_email,
  key: parsedKey.private_key,
});

const cloudBucket = Deno.env.get("GOOGLE_CLOUD_BUCKET")!;

export const craftFileURL = (
  scope: `@${string}`,
  pkg: `${string}@${string}`,
  path: string,
  bucket = cloudBucket,
) => `https://storage.googleapis.com/${bucket}/${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}/${path}`;

// XML API
export async function uploadFile(scope: string, pkg: string, path: string, content: string) {
  return fetch(
    `https:/storage.googleapis.com/${cloudBucket}/${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}/${path}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "text/javascript",
        // "Content-Encoding": "gzip",
        "x-goog-acl": "public-read",
        "Cache-Control": "public, max-age=0",
        Authorization: `Bearer ${await auth.getToken()}`,
      },
      body: new TextEncoder().encode(content),
    },
  );
}
