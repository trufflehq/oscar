const endpoint = Deno.env.get("GRAPHQL_ENDPOINT")!;
const token = Deno.env.get("GRAPHQL_TOKEN")!;

interface GraphqlFetchResponse<T> {
  data: T;
}
class GraphQLClient {
  private endpoint: string;
  private token: string;

  constructor(endpoint: string, token: string) {
    this.endpoint = endpoint;
    this.token = token;
  }

  async request<T>(query: string, variables: Record<string, unknown>) {
    const result = await fetch(this.endpoint, {
      method: "POST",
      body: JSON.stringify({
        query,
        variables,
      }),
      headers: {
        authorization: `Bearer ${this.token}`,
      },
    });

    const response: GraphqlFetchResponse<T> = await result.json();

    return response.data;
  }
}

export const graphQLClient = new GraphQLClient(endpoint, token);
