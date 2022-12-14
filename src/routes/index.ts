import { OakResponse, parse } from "$deps";
import { mime } from "$x/mimetypes@v1.0.0/mod.ts";
import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
import { craftCacheFileURL, craftFileURL, uploadFile } from "../util/bucket.ts";
import { buildJavascript } from "../util/build.ts";
import * as logger from "../util/logger.ts";

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

  private getPathContentType(path: string) {
    const ext = path.split(".").pop();
    if (!ext) return "text/plain";
    return mime.getType(ext) || "text/plain";
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

    const { package: parsedPackage } = exec
      .groups! as Record<
        "package" | "semver",
        string | undefined
      >;

    // cache files for longer period of time
    response.headers.set("Cache-Control", `max-age=${FILE_CACHE_SECONDS}`);

    const fileURL = craftFileURL(
      scope.replace("@", ""),
      `${parsedPackage}@latest`,
      path,
    );

    logger.debug(fileURL, "Oscar::riley::fileUrlDebug");

    // NOTE: Deno in user-agent will also bypass cloudflare cache
    if (request.headers.get("User-Agent")?.toLowerCase().includes("deno")) {
      response.status = 200;
      response.body = await Deno.readFile(fileURL);
      response.headers.append("Content-Type", this.getPathContentType(fileURL));
      return;
    }

    // Node.js doesnt pass through a header
    // https://github.com/nodejs/node/pull/43852
    const parsedPath = parse(path);
    if (![".ts", ".tsx", ".js", ".jsx"].includes(parsedPath.ext)) {
      logger.debug("Serving non-js file", "Oscar::handleImport::static");
      const fileURL = craftFileURL(
        scope,
        `${parsedPackage}@latest`,
        `${parsedPath.dir ? `${parsedPath.dir}/` : ""}${parsedPath.name}${parsedPath.ext}`,
      );
      logger.info(fileURL, "Oscar::handleImport::static");
      response.status = 200;
      response.body = await Deno.readFile(fileURL);
      response.headers.append("Content-Type", this.getPathContentType(fileURL));
      return;
    }

    const cacheURL = craftCacheFileURL(
      scope,
      `${parsedPackage}@latest`,
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/${parsedPath.name}${parsedPath.ext}`,
    );

    logger.info(cacheURL, "Oscar::handleImport::cache_check");

    // checking if the cached file exists
    const exists = await Deno.readFile(cacheURL).catch(() => null);

    logger.debug(exists, "Oscar::handleImport::exists");
    if (exists) {
      logger.debug("within 200");
      response.status = 200;
      response.headers.append("Content-Type", "text/javascript");
      response.body = exists;
      return;
    }

    // generate .js file
    const decoder = new TextDecoder("utf-8");
    const content = decoder.decode(await Deno.readFile(fileURL));
    const built = buildJavascript(content);

    logger.debug(
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/${parsedPath.name}${parsedPath.ext}`,
      "Oscar::importFile:upload_file",
    );

    await uploadFile(
      scope,
      `${parsedPackage}@latest`,
      `.cache${parsedPath.dir ? `/${parsedPath.dir}` : ""}/${parsedPath.name}${parsedPath.ext}`,
      built,
    );

    response.status = 200;
    response.body = built;
    response.headers.append("Content-Type", "text/javascript");
    return;
  }
}
