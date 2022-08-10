import { parse } from "$std/path/mod.ts";
import { clean, maxSatisfying, satisfies, valid } from "$x/semver@v1.4.0/mod.ts";
import {
  getPackageQuery,
  GetPackageQueryResponse,
  graphQLClient,
  PackageVersion,
  prodGraphQLClient,
} from "../gql/mod.ts";
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

    // TODO: all this code up until the redirect we should be able to only do
    // if/when clean(semver!) !== semver.
    // eg if it's a calculated semver, just call a fn redirectToCorrectSemver()
    // and redirectToCorrectSemver has all the queries, etc... in it
    let packageVersions: PackageVersion[] = [];
    let hasMore = true;
    let nextCursor: string | null | undefined;
    let isMissingStagingPackage = false;
    let isMissingProdPackage = false;

    // TODO: cleanup fetching all pages for query
    while (hasMore) {
      // TODO: don't need moduleConnection for every packageVersion (huge response)
      const packageQuery = await graphQLClient.request<GetPackageQueryResponse>(
        getPackageQuery,
        {
          orgSlug: scope.replace("@", ""),
          packageSlug: parsedPackage,
          first: 25,
          after: nextCursor,
        },
      );

      if (!packageQuery.org?.package) {
        isMissingStagingPackage = true;
        break;
      }

      const pageInfo = packageQuery.org.package.packageVersionConnection.pageInfo;

      if (pageInfo.hasNextPage) {
        logger.debug("Oscar::handleImport::has_next_page");
        nextCursor = pageInfo.endCursor;
      } else {
        hasMore = false;
        nextCursor = undefined;
      }

      packageVersions = packageVersions.concat(packageQuery.org.package.packageVersionConnection.nodes);
    }

    // TODO: rm and have 1 oscar running for staging, 1 for prod
    hasMore = true; // reset
    while (hasMore) {
      const packageQuery = await prodGraphQLClient.request<GetPackageQueryResponse>(
        getPackageQuery,
        {
          orgSlug: scope.replace("@", ""),
          packageSlug: parsedPackage,
          first: 25,
          after: nextCursor,
        },
      );

      if (!packageQuery.org?.package) {
        isMissingProdPackage = true;
        break;
      }

      const pageInfo = packageQuery.org.package.packageVersionConnection.pageInfo;

      if (pageInfo.hasNextPage) {
        logger.debug("Oscar::handleImport::has_next_page");
        nextCursor = pageInfo.endCursor;
      } else {
        hasMore = false;
      }

      packageVersions = packageVersions.concat(packageQuery.org.package.packageVersionConnection.nodes);
    }

    const isMissingPackage = isMissingProdPackage && isMissingStagingPackage;

    if (isMissingPackage) {
      response.status = 404;
      response.body = "Package not found";
      logger.error("Oscar::handleImport::missing_package::error");
      return;
    }

    const versions: { version: string; satisfies: boolean }[] = packageVersions.map(
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
      `${parsedPackage}@${semver}`,
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
        maxSatisfying: semver,
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
        `${parsedPackage}@${semver}`,
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
      `${parsedPackage}@${semver}`,
      `.cache/${parsedPath.dir}/${parsedPath.name}${parsedPath.ext}`,
    );
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
      `${parsedPackage}@${semver}`,
      `.cache/${parsedPath.dir}/${parsedPath.name}${parsedPath.ext}`,
      built,
    );

    response.status = 200;
    response.body = built;
    response.headers.append("Content-Type", "text/javascript");
    return;
  }
}
