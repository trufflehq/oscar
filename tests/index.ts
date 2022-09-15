import { superoak } from "$x/superoak@4.7.0/mod.ts";
import { assert, assertEquals } from "$std/testing/asserts.ts";
import { Oscar } from "../src/server.ts";
import { satisfies } from "$x/semver@v1.4.0/mod.ts";

Deno.test("requesting / is boring", async () => {
  const client = await superoak(new Oscar().app);
  await client.get("/").expect(418);
});

Deno.test("fetching deno-import-intellisense", async () => {
  const client = await superoak(new Oscar().app);
  const res = await client.get("/.well-known/deno-import-intellisense.json").expect(200);
  assertEquals(res.headers["content-type"], "application/vnd.deno.reg.v2+json");
});

Deno.test("Intellisense", async (t) => {
  await t.step("only providing scope (should always be empty)", async () => {
    const client = await superoak(new Oscar().app);
    const res = await client.get("/i10e/tru").expect(200);
    assertEquals(res.body, { isIncomplete: true, items: [] });
  });

  await t.step("providing a valid scope returns some packages", async () => {
    const client = await superoak(new Oscar().app);
    const res = await client.get("/i10e/truffle").expect(200);
    assert((res.body.items as string[]).includes("ui"));
  });

  await t.step("searching for a package", async () => {
    const client = await superoak(new Oscar().app);
    const res = await client.get("/i10e/truffle/ultra").expect(200);
    assert((res.body.items as string[]).includes("ultra-server@"));
    assert((res.body.preselect as string) === "ultra-server");
  });

  await t.step("searching for package versions", async () => {
    const client = await superoak(new Oscar().app);
    const res = await client.get("/i10e/truffle/ultra-server/~0.1").expect(200);
    assert((res.body.items as string[]).every((v) => satisfies(v.replace("~", ""), "~0.1")));
  });
});

Deno.test("fetching a package", async (t) => {
  await t.step("expect semver def to redirect to package version", async () => {
    const client = await superoak(new Oscar().app);
    await client.get("/@truffle/mogul-menu@~0.1.0/tsconfig.json").set("User-Agent", "").send().expect(302);
  });

  await t.step("fetch non-js file", async () => {
    const client = await superoak(new Oscar().app);
    const res = await client.get("/@truffle/mogul-menu@0.1.90/tsconfig.json").set("User-Agent", "").expect(200);
    assertEquals(res.headers["content-type"], "application/json");
  });
});
