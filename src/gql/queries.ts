import { gql } from "$x/graphql_request@v4.1.0/mod.ts";

type UUID = string;

interface BaseGraphQLResponse {
  extensions: Record<"components", unknown>;
}

export interface GetPackageQueryResponse extends BaseGraphQLResponse {
  org: {
    package: {
      id: UUID;
      name: string;
      slug: string;
      packageVersionConnection: {
        nodes: {
          id: UUID;
          packageId: UUID;
          semver: string;
          moduleConnection: {
            nodes: { filename: `/${string}`; code: string }[];
          };
        }[];
      };
    } | null;
  } | null;
}

export const getPackageQuery = gql`
	query GetPackage($orgSlug: String!, $packageSlug: String!) {
		org(input: { slug: $orgSlug }) {
			package(slug: $packageSlug) {
				id
				name
				slug
				packageVersionConnection {
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

export const listOrgPackagesQuery = gql`
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
