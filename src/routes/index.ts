import { bundleEmit, clean, maxSatisfying, OakResponse, parse, ParsedPath, valid } from "$deps";
import { getPackageQuery, GetPackageQueryResponse, graphQLClient, PackageVersion } from "../gql/mod.ts";
import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
import { auth, craftFileURL, uploadFile } from "../util/bucket.ts";
import { buildJavascript, bundleLoader } from "../util/build.ts";
import * as logger from "../util/logger.ts";

const REDIRECT_CACHE_SECONDS = 3600 * 1; // 1 hour
const FILE_CACHE_SECONDS = 3600 * 24 * 8; // 8 days
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

    const bundled = await bundleEmit(new URL(fileURL), {
      load: bundleLoader,
      cacheSetting: "reloadAll",
    });

    logger.debug(
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/bundle_${parsedPath.name}${parsedPath.ext}`,
      "Oscar::bundle:upload_file",
    );

    await uploadFile(
      scope,
      `${parsedPackage}@${semver}`,
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/bundle_${parsedPath.name}${parsedPath.ext}`,
      bundled.code,
    );

    response.status = 200;
    response.body = bundled.code;
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
    if (clean(semver!) !== semver) {
      logger.debug(range, "Oscar::handleImport::not_clean");
      return redirectToCorrectSemver({ response, scope, parsedPackage, range, path });
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

async function redirectToCorrectSemver(
  { response, scope, parsedPackage, range, path }: {
    response: OakResponse;
    scope: `@${string}`;
    parsedPackage: string | undefined;
    range: string;
    path: string;
  },
) {
  let missing = false;

  async function getPackages(
    scope: string,
    packageSlug: string,
    first = 25,
    after?: string,
  ): Promise<PackageVersion[]> {
    const packageQuery = await graphQLClient.request<GetPackageQueryResponse>(
      getPackageQuery,
      {
        orgSlug: scope.replace("@", ""),
        packageSlug,
        first,
        after,
      },
    );

    if (!packageQuery.org?.package) {
      missing = true;
      return [];
    }
    const { packageVersionConnection } = packageQuery.org.package;
    const initial = packageVersionConnection.nodes;
    const pageInfo = packageVersionConnection.pageInfo;
    if (!pageInfo.endCursor || !pageInfo.hasNextPage) return initial;

    const next = await getPackages(scope, packageSlug, 25, pageInfo.endCursor);

    return initial.concat(next);
  }
  const packageVersions = await getPackages(scope.replace("@", ""), parsedPackage!, 25, undefined);

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

  logger.debug("Oscar::handleImport::redirect::version", version);

  // cache redirects for shorter amount of time
  response.headers.set("Cache-Control", `max-age=${REDIRECT_CACHE_SECONDS}`);
  return response.redirect(`/${scope}/${parsedPackage}@${version}/${path}`);
}
