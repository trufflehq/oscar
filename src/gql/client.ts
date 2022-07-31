import { GraphQLClient } from "$x/graphql_request@v4.1.0/mod.ts";

const endpoint = Deno.env.get("GRAPHQL_ENDPOINT")!;
const token = Deno.env.get("GRAPHQL_TOKEN")!;

export const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    authorization: `Bearer ${token}`,
  },
});
