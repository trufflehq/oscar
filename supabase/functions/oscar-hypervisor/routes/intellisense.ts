import {
  getPackageQuery,
  GetPackageQueryResponse,
  graphQLClient,
  listOrgPackagesQuery,
  ListOrgPackagesQueryResponse,
} from "../gql/mod.ts";
import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";
// @deno-types="$fuse/fuse.d.ts"
import Fuse from "$fuse/fuse.esm.js";
import { major, maxSatisfying, satisfies } from "$x/semver@v1.4.0/mod.ts";

export class IntellisenseController extends Controller<"/"> {
  public constructor(app: OscarApplication) {
    super(app, "/");
  }

  public init(): void {
    this.router.get(
      "/.well-known/deno-import-intellisense.json",
      this.intellisense.bind(this),
    );

    // this.router.get(
    //   "/i10e/:scope",
    //   this.scope.bind(this),
    // );

    this.router.get(
      "/i10e/:scope/:package",
      this.scopePackage.bind(this),
    );

    this.router.get(
      "/i10e/:scope/:package/{:ver}?{/}",
      this.scopePackageVer.bind(this),
    );

    this.router.get(
      "/i10e/:scope/:package/:ver/:path*",
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
          schema: "/@:scope/:module@:version/:path*",
          variables: [{
            key: "scope",
            url: "/i10e/${scope}",
          }, {
            key: "module",
            url: "/i10e/${scope}/${module}/",
          }, {
            key: "version",
            url: "/i10e/${scope}/${module}/${{version}}/",
          }, {
            key: "path",
            url: "/i10e/${scope}/${module}/${{version}}/${path}",
          }],
        },
        // {
        //   schema: "/@:scope/:package([a-z0-9_]*)/:path*",
        //   variables: [{
        //     key: "scope",
        //     url: "/i10e/${scope}",
        //   }, {
        //     key: "package",
        //     // documentation: "/i10e/details/${scope}/${package}",
        //     url: "/i10e/${scope}/${package}",
        //   }, {
        //     key: "path",
        //     // documentation: "/i10e/details/${scope}/${package}/latest/${path}",
        //     url: "/i10e/${scope}/${package}/latest/${path}",
        //   }],
        // },
      ],
    } as const;

    context.response.status = 200;
    context.response.headers.append("Content-Type", "application/vnd.deno.reg.v2+json");
  }

  /**
   * Fetches the README for a package
   * @param context
   */
  public async scope(
    context: OscarContext<"/i10e/:scope">,
  ): Promise<void> {
    const { params } = context;
    const { scope } = params as {
      scope?: string;
    };
    console.log({ scope });

    // TODO: push back/do not impl
    // https://tfl.dev/@...
    if (!scope) {
      // fetch all orgs
    }

    const listOrgPackagesRes = await graphQLClient.request<
      ListOrgPackagesQueryResponse
    >(
      listOrgPackagesQuery,
      {
        orgSlug: scope,
      },
    );

    if (!listOrgPackagesRes.org) {
      context.response.status = 200;
      context.response.type = "application/json";
      context.response.body = {
        items: [],
        isIncomplete: true,
      };
      return;
    }

    const body = {
      items: listOrgPackagesRes.org?.packageConnection.nodes.map((n) => n.slug),
      isIncomplete: listOrgPackagesRes.org?.packageConnection.pageInfo.hasNextPage,
    };
    context.response.body = body;
    context.response.status = 200;
    context.response.type = "application/json";
    return;

    // list all packages under the scope
    // similar to https://deno.land/_api/x/graphql_request
  }

  public async scopePackage(
    context: OscarContext<"/i10e/:scope/:package">,
  ): Promise<void> {
    const { scope, package: pkg } = context.params;
    console.log({ scope, pkg });
    const listOrgPackagesRes = await graphQLClient.request<
      ListOrgPackagesQueryResponse
    >(
      listOrgPackagesQuery,
      {
        orgSlug: scope,
      },
    );

    const fuse = new Fuse(
      listOrgPackagesRes.org!.packageConnection.nodes.map((n) => n.slug),
      { includeScore: true, distance: 10 },
    );

    // use fuzzy search to find the package
    const foundItems = fuse.search(pkg);
    console.log(foundItems);
    const found: string[] = foundItems.map(({ item }: { item: string }) => item);
    const items = found.slice(0, 100).map((x) => `${x}@`);
    console.log(items);
    const body = {
      items,
      isIncomplete: found.length > items.length,
      preselect: foundItems.sort((a, b) => (a.score ?? 1) - (b.score ?? 1))[0].item ?? undefined,
    };
    console.log(body);
    context.response.body = body;
    context.response.status = 200;
    context.response.headers.append(
      "Content-Type",
      "application/json",
    );
    return;
  }

  public async scopePackageVer(
    context: OscarContext<"/i10e/:scope/:package/{:ver}?{/}">,
  ): Promise<void> {
    const { scope, package: pkg, ver } = context.params;
    console.log({ scope, pkg, ver });
    // fetchVersions
    const { org } = await graphQLClient.request<
      GetPackageQueryResponse
    >(
      getPackageQuery,
      {
        orgSlug: scope,
        packageSlug: pkg,
      },
    );

    const versions = org!.package!.packageVersionConnection.nodes
      .map((n) => n.semver);
    const items = (ver ? versions.filter((v) => satisfies(v, ver)) : versions).map((x) =>
      major(x) >= 1 ? `^${x}` : `~${x}`
    );

    const latest = maxSatisfying(versions, "*");
    context.response.body = {
      items,
      isIncomplete: false,
      preselect: latest,
    };
    context.response.status = 200;
    context.response.type = "application/json";
  }

  // TODO: make this less shit
  public async scopePackageVerPath(
    context: OscarContext<"/i10e/:scope/:package/:ver/:path*">,
  ): Promise<void> {
    console.log("foo bar");
    const { scope, package: pkg, ver } = context.params;
    // fetchVersions
    const { org } = await graphQLClient.request<
      GetPackageQueryResponse
    >(
      getPackageQuery,
      {
        orgSlug: scope,
        packageSlug: pkg,
      },
    );
    const versions = org!.package!.packageVersionConnection.nodes
      .map((n) => n.semver);

    const version = maxSatisfying(versions, ver ?? "*");
    console.log({ version });

    const items = org!.package!.packageVersionConnection.nodes.find((n) => n.semver === version)?.moduleConnection
      .nodes!.map((n) => n.filename.replace("/", ""));
    console.dir(items);

    // const parsed = files!.map((f) => parse(f));
    // const highLevel = parsed.filter((p) => p.dir === "/").map((x) =>
    //   `${x.dir}${x.name}`
    // );
    // const dirs = parsed.filter((p) => p.dir !== "/").map((e) =>
    //   e.dir.split("/")[1]
    // ).filter((dir, index, arr) => arr.indexOf(dir) === index); // filter to remove duplicates
    // console.log({ highLevel, dirs });

    context.response.status = 200;
    context.response.type = "application/json";
    context.response.body = { items, isIncomplete: false };
  }
}
