FROM denoland/deno:alpine-1.25.0

EXPOSE 2318

# Prefer not to run as root.
USER deno

COPY deps.ts deno.json import_map.json tsconfig.json ./
RUN deno cache deps.ts

ADD . .
RUN deno cache src/index.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "src/index.ts"]