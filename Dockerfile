FROM denoland/deno:alpine-1.25.0

EXPOSE 2318

# Prefer not to run as root.
USER deno

ADD . .
RUN deno cache src/index.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-env", "src/index.ts"]