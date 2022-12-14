# Oscar@local
This version of Oscar serves your local files, instead of from our Google Cloud bucket. Version numbers will be ignored.

## Confguration
> **Warning**: Don't skip this section!  

Because we all have different fs formats, you'll have to manually define all the packages and their paths.
Luckily, all the packages from `truffle-packages` are defined, you'll just have to update the path to your `truffle-packages` folder. Do so in `<root>/packages.ts`.

## Usage
1. Start Oscar with `deno task dev`
2. Start the local Nginx server with `docker compose up` (append a `-d` to detach if you wish).
3. Add the line `127.0.0.1	tfl.dev` to your `/etc/hosts` file (don't forget to comment it out when you're done)!
4. Add `"deno.unsafelyIgnoreCertificateErrors": ["tfl.dev"],` to your `.vscode/settings.json` and append `--unsafely-ignore-certificate-errors=tfl.dev` to `deno` cli commands where applicable.  

And you're good to go!
