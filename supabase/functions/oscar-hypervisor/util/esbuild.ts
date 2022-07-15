// import { build } from "https://deno.land/x/esbuild@v0.14.49/mod.js";
import { transform } from "https://deno.land/x/swc@0.2.1/mod.ts";
// import { Buffer } from "$std/node/buffer.ts";

export function buildJavascript(contents: string /*sourcefile: string*/) {
  const result = transform(contents, {
    jsc: {
      target: "es2020",
      parser: {
        syntax: "typescript",
      },
    },
  });
  return result.code;

  // const built = await build({
  //   format: "esm",
  //   platform: "node",
  //   write: false,
  //   stdin: {
  //     contents,
  //     sourcefile,
  //     loader: "ts",
  //   },
  // });
  // console.dir(built);

  // return Buffer.from(built.outputFiles[0].contents);
}
