import { RootController } from "./routes/index.ts";
import { IntellisenseController } from "./routes/intellisense.ts";
import { OscarApplication } from "./structures/Application.ts";

class X extends OscarApplication {
  public init(): void {
    this.app.use(async (context, next) => {
      const start = performance.now();
      await next();
      const delta = performance.now() - start;
      context.response.headers.set("X-Response-Time", `${delta}ms`);
    });

    const controllers = [IntellisenseController, RootController];
    for (const controller of controllers) {
      const { router } = new controller(this);
      this.app.use(router.routes());
    }
  }
}

await new X().start();
