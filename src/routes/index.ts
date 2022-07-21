import { parse } from "$std/path/mod.ts";
import { clean, maxSatisfying, satisfies } from "$x/semver@v1.4.0/mod.ts";
import { getPackageQuery, GetPackageQueryResponse, graphQLClient } from "../gql/mod.ts";
import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
import { auth, craftFileURL, uploadFile } from "../util/bucket.ts";
import { buildJavascript } from "../util/esbuild.ts";

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
    console.log({ semver, version });
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

    console.log({ fileURL });

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
    // if (!request.headers.get("User-Agent")) {
    const parsedPath = parse(path);
    if (![".ts", ".js"].includes(parsedPath.ext)) {
      const fileURL = craftFileURL(
        scope,
        `${parsedPackage}@${version}`,
        `${parsedPath.dir}/${parsedPath.name}${parsedPath.ext}`,
      );
      console.log({ fileURL });
      const res = await fetch(fileURL, { headers: { Authorization: `Bearer ${await auth.getToken()}` } });
      console.dir(res);
      response.status = 200;
      response.body = await res.arrayBuffer();
      response.headers.append("Content-Type", res.headers.get("content-type")!);
      return;
    }

    const cacheURL = craftFileURL(
      scope,
      `${parsedPackage}@${version}`,
      `.cache/${parsedPath.name}${parsedPath.ext}`,
    );
    console.log("searching for ", cacheURL);
    // checking if the cached file exists
    const exists = await fetch(cacheURL, { method: "HEAD" });
    if (exists.status === 200) {
      console.log("within 200");
      // return the cached file if it exists
      response.status = 200;
      response.body = await fetch(cacheURL).then((r) => r.arrayBuffer());
      return;
    }

    // generate .js file
    const content = await fetch(fileURL);
    const built = buildJavascript(await content.text());

    await uploadFile(
      scope,
      `${parsedPackage}@${version}`,
      `.cache/${parsedPath.name}${parsedPath.ext}`,
      built,
    );

    response.status = 200;
    response.body = built;
    return;
  }
}
