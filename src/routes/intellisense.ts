import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
// @deno-types="$fuse/fuse.d.ts"
import Fuse from "$fuse/fuse.esm.js";
import * as log from "../util/logger.ts";
import packages from "../../packages.ts";
import { walk } from "$std/fs/walk.ts";
const logger = log.getLogger("isense");

export class IntellisenseController extends Controller<"/"> {
  public constructor(app: OscarApplication) {
    super(app, "/");
  }

  public init(): void {
    this.router.get(
      "/.well-known/deno-import-intellisense.json",
      this.intellisense.bind(this),
    );

    this.router.get(
      "/i10e/:scope",
      this.scope.bind(this),
    );

    this.router.get(
      "/i10e/:scope/{:package}?",
      this.scopePackage.bind(this),
    );

    this.router.get(
      "/i10e/:scope/:package/{:ver}?",
      this.scopePackageVer.bind(this),
    );

    this.router.get(
      "/i10e/:scope/:package/:ver/:path*{/}?",
      this.scopePackageVerPath.bind(this),
    );
  }

  public intellisense(
    context: OscarContext<"/.well-known/deno-import-intellisense.json">,
  ): void | Promise<void> {
    context.response.body = {
      version: 2,
      registries: [
        {
          schema: "/@:scope/:module@:version?/:path*",
          variables: [{
            key: "scope",
            url: "/i10e/${scope}",
          }, {
            key: "module",
            url: "/i10e/${scope}/${module}",
          }, {
            key: "version",
            url: "/i10e/${scope}/${module}/${{version}}",
          }, {
            key: "path",
            url: "/i10e/${scope}/${module}/${{version}}/${path}",
          }],
        },
      ],
    } as const;

    context.response.status = 200;
    context.response.headers.append("Content-Type", "application/vnd.deno.reg.v2+json");
  }

  private packagesFromScope(scope: string): string[] {
    return packages.filter((p) => p.scope === scope).map((p) => p.name);
  }

  /**
   * Fetches the README for a package
   * @param context
   */
  public scope(
    context: OscarContext<"/i10e/:scope">,
  ): void {
    const { params } = context;
    const { scope } = params as {
      scope?: string;
    };

    const items = this.packagesFromScope(scope!);

    const body = {
      items,
      isIncomplete: false,
    };

    context.response.body = body;
    context.response.status = 200;
    context.response.type = "application/json";
  }

  public scopePackage(
    context: OscarContext<"/i10e/:scope/{:package}?">,
  ): void {
    const { scope, package: pkg } = context.params;
    logger.info({ scope, pkg });

    const pkgs = packages.filter((p) => p.scope === scope).map((p) => p.name);

    const fuse = new Fuse(
      pkgs,
      { includeScore: true, distance: 10 },
    );

    // use fuzzy search to find the package
    const foundItems = fuse.search(pkg!);
    logger.debug(foundItems);
    const found: string[] = foundItems.map(({ item }: { item: string }) => item);
    const items = found.slice(0, 100).map((x) => `${x}@`);
    logger.debug(items);
    const body = {
      items,
      isIncomplete: found.length > items.length,
      preselect: foundItems.sort((a, b) => (a.score ?? 1) - (b.score ?? 1))[0].item ?? undefined,
    };
    context.response.body = body;
    context.response.status = 200;
    context.response.headers.append(
      "Content-Type",
      "application/json",
    );
  }

  public scopePackageVer(
    context: OscarContext<"/i10e/:scope/:package/{:ver}?">,
  ): void {
    context.response.body = {
      items: ["latest"],
      isIncomplete: false,
    };
    context.response.status = 200;
    context.response.type = "application/json";
  }

  // TODO: make this less shit
  public async scopePackageVerPath(
    context: OscarContext<"/i10e/:scope/:package/:ver/:path*{/}?">,
  ): Promise<void> {
    const { scope, package: pkg } = context.params;
    // fetchVersions
    const found = packages.find((p) => p.scope === scope && p.name === pkg);
    if (!found) {
      context.response.status = 404;
      return;
    }

    const hike = walk(found.path, {
      exts: [".ts", ".js", ".d.ts"],
    });
    const items: string[] = [];
    for await (const file of hike) {
      items.push(file.path.replace(found.path, ""));
    }

    context.response.status = 200;
    context.response.type = "application/json";
    context.response.body = { items, isIncomplete: false };
  }
}
