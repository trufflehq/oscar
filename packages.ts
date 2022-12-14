// Represents a local package
interface Package {
  // the @scope of the package
  scope: string;
  // the name of the package
  name: string;
  // the path to the package (absolute, no `~`s)
  path: string;
}

const HOME = Deno.env.get("HOME");
if (!HOME) {
  throw new Error("HOME not set");
}

// TODO: EDIT ME
const TRUFFLE_PACKAGES = `${HOME}/code/truffle/truffle-packages`;

const packages: Package[] = [
  {
    scope: "truffle",
    name: "api",
    path: `${TRUFFLE_PACKAGES}/api`,
  },
  {
    scope: "truffle",
    name: "router",
    path: `${TRUFFLE_PACKAGES}/router`,
  },
  {
    scope: "truffle",
    name: "events",
    path: `${TRUFFLE_PACKAGES}/events`,
  },
  {
    scope: "truffle",
    name: "distribute",
    path: `${TRUFFLE_PACKAGES}/distribute`,
  },
  {
    scope: "truffle",
    name: "global-context",
    path: `${TRUFFLE_PACKAGES}/global-context`,
  },
  {
    scope: "truffle",
    name: "config",
    path: `${TRUFFLE_PACKAGES}/config`,
  },
  {
    scope: "truffle",
    name: "third-party-oauth",
    path: `${TRUFFLE_PACKAGES}/third-party-oauth`,
  },
  {
    scope: "truffle",
    name: "utils",
    path: `${TRUFFLE_PACKAGES}/utils`,
  },
  {
    scope: "truffle",
    name: "ui",
    path: `${TRUFFLE_PACKAGES}/ui`,
  },
  {
    scope: "truffle",
    name: "context",
    path: `${TRUFFLE_PACKAGES}/context`,
  },
  {
    scope: "truffle",
    name: "state",
    path: `${TRUFFLE_PACKAGES}/state`,
  },
  {
    scope: "truffle",
    name: "youtube-js",
    path: `${TRUFFLE_PACKAGES}/youtube-js`,
  },
  {
    scope: "truffle",
    name: "functions",
    path: `${TRUFFLE_PACKAGES}/functions`,
  },
];

export default packages;
