import { clean, maxSatisfying, OakResponse, parse, ParsedPath, valid } from "$deps";
import { build } from "$x/esbuild@v0.15.9/mod.js";
import { getPackageQuery, GetPackageQueryResponse, graphQLClient, PackageVersion } from "../gql/mod.ts";
import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
import { auth, craftFileURL, uploadFile } from "../util/bucket.ts";
import { buildJavascript } from "../util/build.ts";
import * as logger from "../util/logger.ts";

const REDIRECT_CACHE_SECONDS = 60 * 5; // 5 minutes
const FILE_CACHE_SECONDS = 3600 * 24 * 8; // 8 days
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36";
const packageRegex = /(?<package>[^@]+)(?:@(?<semver>(?:[~|^|>|>=|<|<=])?[0-9.|x]+|latest))?/;

export class RootController extends Controller<"/"> {
  public constructor(app: OscarApplication) {
    super(app, "/");
  }

  public init(): void {
    this.router.get("/:scope/:pkg/:path*", this.handleImport.bind(this));

    this.router.get("/", (ctx) => {
      ctx.response.body = "Are you lost?";
      ctx.response.status = 418;
      ctx.response.type = "text/plain";
    });

    this.router.get("/ping", (ctx) => {
      ctx.response.body = "pong";
      ctx.response.status = 200;
      ctx.response.type = "text/plain";
    });
  }

  public headers(response: OakResponse) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Headers", "*");
    return true;
  }

  private async handleBundle(
    { response, scope, parsedPackage, parsedPath, semver, fileURL }: {
      response: OakResponse;
      scope: `@${string}`;
      parsedPackage?: string;
      parsedPath: ParsedPath;
      semver: string;
      fileURL: string;
    },
  ) {
    const cacheURL = craftFileURL(
      scope,
      `${parsedPackage}@${semver}`,
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/bundle_${parsedPath.name}${parsedPath.ext}`,
    );

    logger.info(cacheURL, "Oscar::bundle::cache_check");

    // checking if the cached file exists
    const exists = await fetch(cacheURL, { method: "HEAD" });

    logger.debug(exists.statusText, "Oscar::bundle::HEAD");
    if (exists.status === 200) {
      logger.debug("within 200");
      response.status = 200;
      response.headers.append("Content-Type", "text/javascript");
      response.body = await fetch(cacheURL).then((r) => r.arrayBuffer());
      return;
    }

    const bundled = await build({
      format: "esm",
      platform: "browser",
      bundle: true,
      jsx: "transform",
      external: [
        "react",
        "react-dom",

        // need single global context, whether bundled or not
        "@truffle/global-context",

        // any type of react context / stateful js we want in the shared-contexts package
        // that way it's as few files as possible we unbundle
        "@truffle/shared-contexts",

        // elements don't show when bundled. thought it might be bc of @microsoft/fast-element context.js, but unbundling just that file didn't work
        "@microsoft/fast-foundation",

        // urql has some sort of context, not sure if it's all contained in a single file
        // @truffle/api/urql-mods is their react hooks modified to use our framework-agnostic context
        // but there seems to be statefulness elsewhere too
        "@urql/core",

        // if desired, we can target single files.
        // this will only work for npm.tfl.dev since it has absolute urls for everything.
        // not for tfl.dev since we still use relative urls as of 12/2022
        // "@microsoft/fast-element(.*)context\\.js",

        "rxjs", // TODO: rm
        "@truffle/utils", // TODO: remove this when mogul-menu stops using rxjs. causes rxjs error in opera
        "@legendapp/state", // HACK: figure out why legend isn't tracking observables in activity banners w/ ?bundle
      ],
      stdin: {
        contents: await fetch(fileURL).then((r) => r.text()),
        sourcefile: fileURL,
        loader: "tsx",
      },
      minify: true,
      write: false,
      plugins: [{
        name: "oscar",
        setup: (build) => {
          build.onResolve({ filter: /^https?:\/\// }, (args) => {
            const isExternal = getIsExternal({
              externals: build.initialOptions.external || [],
              path: args.path,
              bases: ["https://npm.tfl.dev", "https://tfl.dev", "https://staging.tfl.dev"],
            });

            return {
              path: args.path,
              external: isExternal,
              namespace: "http-url",
            };
          });

          // We also want to intercept all **relative** import paths inside downloaded
          // files and resolve them against the original URL
          build.onResolve({ filter: /^\.|\// }, (args) => {
            const isExternal = getIsExternal({
              externals: build.initialOptions.external || [],
              path: args.path,
            });

            return {
              // build full url from relative path
              path: new URL(args.path, args.importer || fileURL).toString(),
              external: isExternal,
              namespace: "http-url",
            };
          });

          build.onLoad({ filter: /.*/, namespace: "http-url" }, async (args) => {
            const contents = (await fetch(args.path, {
              headers: {
                // we want whatever we're importing to think we're a browser.
                // eg so esm.sh doesn't add Deno vars to the code
                "User-Agent": BROWSER_USER_AGENT,
              },
            })
              .then((r) => r.text()))
              // some of our existing files rely on import.meta.url for importing some
              // other file (eg css files), or for naming our web components (distribute pkg)
              // HACK/NOTE: there's a chance this breaks things depending on how other libs use
              // import.meta.url. we may need to figure out a different solution.
              // we could also change this up to replace `new URL(path, base)` with the
              // computed url at compile time. or be smarter about detecting import.meta.url
              .replaceAll("import.meta.url", `'${args.path}'`);

            return {
              contents,
              loader: "tsx",
            };
          });
        },
      }],
    });
    bundled.stop?.();

    logger.debug(
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/bundle_${parsedPath.name}${parsedPath.ext}`,
      "Oscar::bundle:upload_file",
    );

    await uploadFile(
      scope,
      `${parsedPackage}@${semver}`,
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/bundle_${parsedPath.name}${parsedPath.ext}`,
      bundled.outputFiles[0].text,
    );

    response.status = 200;
    response.body = bundled.outputFiles[0].text;
    response.headers.append("Content-Type", "text/javascript");
    return;
  }

  public async handleImport(
    context: OscarContext<
      "/:scope/:pkg/:path*"
    >,
  ): Promise<void> {
    const { response, params, request } = context;
    const { scope, pkg, path } = params as {
      scope?: `@${string}`;
      pkg?: `${string}@${string}`;
      path?: string;
    };

    if (!scope || !pkg || !path) {
      response.status = 400;
      response.body = "Invalid request";
      return;
    }

    const exec = packageRegex.exec(pkg);
    if (!exec || !exec.groups) {
      response.status = 400;
      response.body = "Invalid package name";
      return;
    }
    this.headers(response);

    const { package: parsedPackage, semver } = exec
      .groups! as Record<
        "package" | "semver",
        string | undefined
      >;
    const range = semver ?? "*";

    logger.debug(path, "Oscar::riley::pathDebug");
    // TODO: all this code up until the redirect we should be able to only do
    // if/when clean(semver!) !== semver.

    // redirect to the exact version
    // after calculating through semver

    // FIXME:

    // if exact version and no .file suffix, return js:
    //  export * from "full url with .file suffix"
    //  export { default } from "full url with .file suffix"
    // PROBLEM: a js error will be thrown if default isn't exported, and potentially if there are no exports for *

    // if exact version and .file suffix, return actual file

    // this will make it so we're not loading duplicate "reqs" of the same url
    // (browser seems to treat each individual request as its own module, so react context isn't shared)

    if (clean(semver!) !== semver) {
      logger.debug(range, "Oscar::handleImport::not_clean");
      const search = request.url.search;
      return redirectToCorrectSemver({ response, scope, parsedPackage, range, path, search });
    }
    const bundle = typeof request.url.searchParams.get("bundle") === "string";

    // cache files for longer period of time
    response.headers.set("Cache-Control", `max-age=${FILE_CACHE_SECONDS}`);

    const fileURL = craftFileURL(
      scope,
      `${parsedPackage}@${semver}`,
      path,
    );

    logger.debug(fileURL, "Oscar::riley::fileUrlDebug");

    // NOTE: Deno in user-agent will also bypass cloudflare cache
    if (request.headers.get("User-Agent")?.toLowerCase().includes("deno")) {
      response.status = 200;
      response.body = await fetch(fileURL).then((r) => r.arrayBuffer());
      response.headers.append("Content-Type", "text/typescript");
      return;
    }

    // Node.js doesnt pass through a header
    // https://github.com/nodejs/node/pull/43852
    const parsedPath = parse(path);
    if (![".ts", ".tsx", ".js", ".jsx"].includes(parsedPath.ext)) {
      logger.debug("Serving non-js file", "Oscar::handleImport::static");
      const fileURL = craftFileURL(
        scope,
        `${parsedPackage}@${semver}`,
        `${parsedPath.dir ? `${parsedPath.dir}/` : ""}${parsedPath.name}${parsedPath.ext}`,
      );
      logger.info(fileURL, "Oscar::handleImport::static");
      const res = await fetch(fileURL, { headers: { Authorization: `Bearer ${await auth.getToken()}` } });
      response.status = 200;
      response.body = await res.arrayBuffer();
      response.headers.append("Content-Type", res.headers.get("content-type")!);
      return;
    }

    if (bundle) {
      return this.handleBundle({ scope, parsedPackage, parsedPath, semver, fileURL, response });
    }

    const cacheURL = craftFileURL(
      scope,
      `${parsedPackage}@${semver}`,
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/${parsedPath.name}${parsedPath.ext}`,
    );

    logger.info(cacheURL, "Oscar::handleImport::cache_check");

    // checking if the cached file exists
    const exists = await fetch(cacheURL, { method: "HEAD" });

    logger.debug(exists, "Oscar::handleImport::exists");
    if (exists.status === 200) {
      logger.debug("within 200");
      response.status = 200;
      response.headers.append("Content-Type", "text/javascript");
      response.body = await fetch(cacheURL).then((r) => r.arrayBuffer());
      return;
    }

    // generate .js file
    const content = await fetch(fileURL);
    const built = buildJavascript(await content.text());

    logger.debug(
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/${parsedPath.name}${parsedPath.ext}`,
      "Oscar::importFile:upload_file",
    );

    await uploadFile(
      scope,
      `${parsedPackage}@${semver}`,
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/${parsedPath.name}${parsedPath.ext}`,
      built,
    );

    response.status = 200;
    response.body = built;
    response.headers.append("Content-Type", "text/javascript");
    return;
  }
}

// detect anything we want externalized, as urls
function getIsExternal(
  { path, externals, bases = [""] }: {
    path: string;
    externals: string[];
    bases?: string[];
  },
): boolean {
  // TODO: may better method of detecting these?
  return Boolean(externals.find((external) => {
    return bases.find((base) => {
      const regex = new RegExp(`${base.replace(".", "\\.")}/(v[0-9]+/)?${external}($|/|@|\\?)`);
      console.log("matching...", path, regex);

      return path.match(regex);
    }) != null; // bases = '' is falsey
  }));
}

async function redirectToCorrectSemver(
  { response, scope, parsedPackage, range, path, search }: {
    response: OakResponse;
    scope: `@${string}`;
    parsedPackage: string | undefined;
    range: string;
    path: string;
    search: string;
  },
) {
  let missing = false;

  async function getPackages(
    scope: string,
    packageSlug: string,
    // get all - don't have a better way other than pagination.
    // don't need pagination since we want all and overall req is small kb
    first = 99999,
    after?: string,
  ): Promise<PackageVersion[]> {
    const packageQuery = await graphQLClient.request<GetPackageQueryResponse>(
      getPackageQuery,
      {
        orgSlug: scope.replace("@", ""),
        packageSlug,
        status: "published",
        first,
        after,
      },
    );

    if (!packageQuery.org?.package) {
      missing = true;
      return [];
    }
    const { packageVersionConnection } = packageQuery.org.package;
    return packageVersionConnection.nodes;
  }
  const packageVersions = await getPackages(scope.replace("@", ""), parsedPackage!, 99999, undefined);

  if (missing) {
    response.status = 404;
    response.body = "Package not found";
    logger.error("Oscar::handleImport::missing_package::error");
    return;
  }

  const versions: { version: string; satisfies: boolean }[] = packageVersions.map(
    (v) => ({ version: v.semver, satisfies: false }),
  ).filter(({ version }) => valid(version) !== null);

  const version = maxSatisfying(versions.map((v) => v.version), range);

  if (!version) {
    response.status = 404;
    response.body = "Package version not found";
    logger.error("Oscar::handleImport::missing_package_version::error");
    logger.debug(packageVersions);
    return;
  }

  logger.debug("Oscar::handleImport::redirect::version", version);

  // cache redirects for shorter amount of time
  response.headers.set("Cache-Control", `max-age=${REDIRECT_CACHE_SECONDS}`);
  return response.redirect(`/${scope}/${parsedPackage}@${version}/${path}${search}`);
}
