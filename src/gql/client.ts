import { GraphQLClient } from "$x/graphql_request@v3.7.1/mod.ts";

const endpoint = Deno.env.get("GRAPHQL_ENDPOINT")!;
const token = Deno.env.get("GRAPHQL_TOKEN")!;

export const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    authorization: `Bearer ${token}`,
  },
});
