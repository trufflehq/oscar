type UUID = string;

interface BaseGraphQLResponse {
  extensions: Record<"components", unknown>;
}

export type PackageVersion = {
  semver: string;
  moduleConnection: {
    nodes: { filename: `/${string}`; code: string }[];
  };
};

type PackageVersionConnection = {
  nodes: PackageVersion[];
};

export interface GetPackageQueryResponse extends BaseGraphQLResponse {
  org: {
    package: {
      id: UUID;
      name: string;
      slug: string;
      packageVersionConnection: PackageVersionConnection;
    } | null;
  } | null;
}

export const getPackageQuery = `
	query GetPackage($orgSlug: String!, $packageSlug: String!, $first: Int, $after: String) {
		org(input: { slug: $orgSlug }) {
			package(slug: $packageSlug) {
				id
				name
				slug
				packageVersionConnection(first: $first, after: $after) {
					nodes {
						semver
					}
				}
			}
		}
	}
`;

export interface ListOrgPackagesQueryResponse extends BaseGraphQLResponse {
  org: {
    packageConnection: {
      pageInfo: {
        hasNextPage: boolean;
      };
      nodes: {
        slug: string;
        packageVersionConnection: {
          nodes: {
            semver: string;
          }[];
        };
      }[];
    };
  } | null;
}

export const listOrgPackagesQuery = `
	query ListPackages($orgSlug: String!) {
		org(input: { slug: $orgSlug }) {
			packageConnection {
				pageInfo {
					hasNextPage
				}
				nodes {
					slug
					packageVersionConnection {
						nodes {
							semver
						}
					}
				}
			}
		}
	}
`;
