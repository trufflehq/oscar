// import { gql } from "$x/graphql_request@v4.1.0/mod.ts";

type UUID = string;

interface BaseGraphQLResponse {
  extensions: Record<"components", unknown>;
}

type PageInfo = {
  endCursor: string | null;
  hasNextPage: boolean;
  startCursor: string | null;
  hasPreviousPage: boolean;
};

export type PackageVersion = {
  id: UUID;
  packageId: UUID;
  semver: string;
  moduleConnection: {
    nodes: { filename: `/${string}`; code: string }[];
  };
};

type PackageVersionConnection = {
  pageInfo: PageInfo;
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
					pageInfo {
						endCursor
						hasNextPage
						startCursor
						hasPreviousPage
					}
					nodes {
						id
						packageId
						semver
						moduleConnection {
							nodes {
								filename
								code
							}
						}
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
