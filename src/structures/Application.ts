import { Application } from "$x/oak@v10.6.0/mod.ts";
import logger from "$x/oak_logger@1.0.0/mod.ts";
import { bgGreen, bold } from "$std/fmt/colors.ts";
import { format } from "$std/datetime/mod.ts";
import { cyan, green, red, yellow } from "$std/fmt/colors.ts";

export class OscarApplication extends Application {
  public readonly app = new Application();

  public constructor() {
    super();

    this.app.use(logger.logger);

    this.app.use(async ({ request, response }, next) => {
      await next();
      const responseTime = response.headers.get("X-Response-Time");
      const User = request.headers.get("User-Agent");
      const status: number = response.status;
      const content = `[${
        format(new Date(Date.now()), "MM-dd-yyyy hh:mm:ss.SSS")
      }  Oak::logger] ${request.ip} "${request.method} ${request.url.pathname}" ${
        String(status)
      } ${User} ${responseTime}`;
      return status >= 500
        ? console.log(`${red(content)}`) // red
        : status >= 400
        ? console.log(`${yellow(content)}`) // yellow
        : status >= 300
        ? console.log(`${cyan(content)}`) // cyan
        : status >= 200
        ? console.log(`${green(content)}`) // green
        : console.log(`${red(content)}`);
    });

    if (Deno.env.get("DENO_ENV") !== "testing") {
      this.app.addEventListener("listen", ({ hostname, port, secure }) => {
        const log_string = `[${format(new Date(Date.now()), "MM-dd-yyyy hh:mm:ss.SSS")}  Oak::logger] Listening on: ${
          secure ? "https://" : "http://"
        }${
          hostname ??
            "localhost"
        }:${port}`;
        console.log(bold(bgGreen(log_string)));
      });
    }

    this.init();
  }

  public start() {
    return this.app.listen({ port: 2318 });
  }

  public init(): void {
    throw new Error(`init() not implemented on ${this.constructor.name}`);
  }
}
