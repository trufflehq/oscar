import { type LoadResponse, transform } from "$deps";
import * as logger from "./logger.ts";

export function buildJavascript(contents: string) {
  const result = transform(contents, {
    jsc: {
      target: "es2015",
      parser: {
        syntax: "typescript",
        tsx: true,
        decorators: true,
      },
    },
  });
  return result.code;
}

export const bundleLoader = async (specifier: string): Promise<LoadResponse | undefined> => {
  const url = new URL(specifier);
  logger.warning(url.toString(), "Oscar::bundle::load");
  try {
    switch (url.protocol) {
      case "file:": {
        const content = await Deno.readTextFile(url);
        return {
          kind: "module",
          specifier,
          content,
        };
      }
      case "http:":
      case "https:": {
        const response = await fetch(String(url), { redirect: "follow" });
        if (response.status !== 200) {
          // ensure the body is read as to not leak resources
          await response.arrayBuffer();
          return undefined;
        }
        const content = await response.text();
        const headers: Record<string, string> = {};
        for (const [key, value] of response.headers) {
          headers[key.toLowerCase()] = value;
        }
        return {
          kind: "module",
          specifier: response.url,
          headers,
          content,
        };
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
};
