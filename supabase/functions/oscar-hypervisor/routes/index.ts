import { parse } from "$std/path/mod.ts";
import { maxSatisfying, satisfies } from "$x/semver@v1.4.0/mod.ts";
import { getPackageQuery, GetPackageQueryResponse, graphQLClient } from "../gql/mod.ts";
import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
import { craftFileURL, uploadFile } from "../util/bucket.ts";
import { buildJavascript } from "../util/esbuild.ts";

const packageRegex = /(?<package>[^@]+)(?:@(?<semver>(?:[~|^|>|>=|<|<=])?[0-9.|x]+|latest))?/;

export class RootController extends Controller<"/"> {
  public constructor(app: OscarApplication) {
    super(app, "/");
  }

  public init(): void {
    this.router.get("/:scope/:pkg/:path*", this.handleImport.bind(this));
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
    console.dir(packageQuery);
    if (!packageQuery.org?.package) {
      response.status = 404;
      response.body = "Package not found";
      return;
    }

    const versions: { version: string; satisfies: boolean }[] = packageQuery
      .org.package.packageVersionConnection?.nodes.map(
        (v) => ({ version: v.semver, satisfies: false }),
      );

    const version = maxSatisfying(versions.map((v) => v.version), range);
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
      response.status = 302;
      response.headers.set("Location", fileURL);
      return;
    }

    // Node.js doesnt pass through a header
    // https://github.com/nodejs/node/pull/43852
    if (!request.headers.get("User-Agent")) {
      const cacheURL = craftFileURL(
        scope,
        `${parsedPackage}@${version}`,
        `.cache/${parse(path).name}.js`,
      );
      console.log("searching for ", cacheURL);
      // checking if the cached file exists
      const exists = await fetch(cacheURL, { method: "HEAD" });
      if (exists.status === 200) {
        console.log("within 200");
        // return the cached file if it exists
        response.status = 302;
        response.headers.set("Location", cacheURL);
        return;
      }

      // generate .js file
      const content = await fetch(fileURL);
      const built = buildJavascript(await content.text());
      console.log(built);

      console.log("uploading...");
      const uploaded = await uploadFile(scope, `${parsedPackage}@${version}`, `.cache/${parse(path).name}.js`, built);
      console.dir(uploaded);
      console.dir(await uploaded.text());

      // serve the file
      response.status = 200;
      response.type = "text/javascript";
      response.body = built;
      return;
    }

    // status code for not implemented
    response.status = 501;
    response.body = "Not implemented";
    return;
  }
}
