import { parse } from "$std/path/mod.ts";
import { clean, maxSatisfying, satisfies, valid } from "$x/semver@v1.4.0/mod.ts";
import { getPackageQuery, GetPackageQueryResponse, graphQLClient } from "../gql/mod.ts";
import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
import { auth, craftFileURL, uploadFile } from "../util/bucket.ts";
import { buildJavascript } from "../util/esbuild.ts";
import { Response as OakResponse } from "$x/oak@v10.6.0/response.ts";
import * as logger from "../util/logger.ts";
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
    response.headers.set("Cache-Control", "max-age=14400");
    return true;
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

    const packageQuery = await graphQLClient.request<GetPackageQueryResponse>(
      getPackageQuery,
      {
        orgSlug: scope.replace("@", ""),
        packageSlug: parsedPackage,
      },
    );
    if (!packageQuery.org?.package) {
      response.status = 404;
      response.body = "Package not found";
      return;
    }

    const versions: { version: string; satisfies: boolean }[] = packageQuery
      .org.package.packageVersionConnection?.nodes.map(
        (v) => ({ version: v.semver, satisfies: false }),
      ).filter(({ version }) => valid(version) !== null);

    const version = maxSatisfying(versions.map((v) => v.version), range);
    // redirect to the exact version
    // after calculating through semver
    if (clean(semver!) !== semver) {
      return response.redirect(`/${scope}/${parsedPackage}@${version}/${path}`);
    }

    const fileURL = craftFileURL(
      scope,
      `${parsedPackage}@${version}`,
      path,
    );

    if (request.url.searchParams.has("debug")) {
      const latest = maxSatisfying(versions.map((v) => v.version), "*");
      let maxVersion: string | null = latest!;
      if (!satisfies(maxVersion, range!)) maxVersion = null;

      response.status = 200;
      response.type = "application/json";
      response.body = {
        fileURL,
        ...params,
        maxSatisfying: version,
        parsedPackage,
        latest,
        maxVersion,
        satisfies: versions.filter((v) => v.satisfies).map((v) => v.version),
        versions: versions.map((v) => v.version),
      };
      return;
    }

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
        `${parsedPackage}@${version}`,
        `${parsedPath.dir}/${parsedPath.name}${parsedPath.ext}`,
      );
      logger.info(fileURL, "Oscar::handleImport::static");
      const res = await fetch(fileURL, { headers: { Authorization: `Bearer ${await auth.getToken()}` } });
      response.status = 200;
      response.body = await res.arrayBuffer();
      response.headers.append("Content-Type", res.headers.get("content-type")!);
      return;
    }

    const cacheURL = craftFileURL(
      scope,
      `${parsedPackage}@${version}`,
      `.cache/${parsedPath.dir}/${parsedPath.name}${parsedPath.ext}`,
    );
    logger.info(JSON.stringify(versions), "Oscar::handleImport::versions");
    logger.info(cacheURL, "Oscar::handleImport::cache_check");
    // checking if the cached file exists
    const exists = await fetch(cacheURL, { method: "HEAD" });
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

    await uploadFile(
      scope,
      `${parsedPackage}@${version}`,
      `.cache/${parsedPath.dir}/${parsedPath.name}${parsedPath.ext}`,
      built,
    );

    response.status = 200;
    response.body = built;
    response.headers.append("Content-Type", "text/javascript");
    return;
  }
}
