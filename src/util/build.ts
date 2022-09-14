import { transform } from "$x/swc@0.2.1/mod.ts";

export function buildJavascript(contents: string) {
  const result = transform(contents, {
    jsc: {
      target: "es2020",
      parser: {
        syntax: "typescript",
        tsx: true,
        decorators: true,
      },
    },
  });
  return result.code;
}
