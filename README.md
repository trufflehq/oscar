<div align="center">
  <p>
    <a href="https://github.com/trufflehq/oscar"><img src="./public/oscar.svg" width="546" alt="oscar logo" /></a>
  </p>
</div>

## About
Oscar is Truffle's proprietary JavaScript and TypeScript package server. It connects with existing Truffle Developer Platform architecture to:
- Serve TypeScript files in [Deno](https://deno.land)
- Serve compiled JavaScript in [Node v18](https://nodejs.org/api/esm.html#https-and-http-imports)
- Serve compiled JavaScript in the browser (see: [`trufflehq/mogul-menu`](https://github.com/trufflehq/mogul-menu))

## Roadmap

- [x] Serve Typescript in Deno environment
- [x] Serve compiled JavaScript in Node@18/Browser
- [x] Bundling (`?bundle`)
- [x] Fancy Deno Intellisense
- [ ] Version Tagging (`@truffle/ui@latest`)
- [ ] Complex Versions (`{version}-{branch}.{commit}-{timestamp}`, eg: `0.36.2-next.d503c71.1657211525`)
- [ ] [Import Maps](https://github.com/WICG/import-maps#the-basic-idea)
