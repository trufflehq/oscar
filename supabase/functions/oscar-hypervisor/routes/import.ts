import { Controller, OscarApplication, OscarContext } from "../structures/mod.ts";

export class RootController extends Controller<"/"> {
  public constructor(app: OscarApplication) {
    super(app, "/");
  }

  public init(): void {
    this.router.get("/", this.index.bind(this));
  }

  public index(context: OscarContext<"/">): void | Promise<void> {
    context.response.status = 200;
    context.response.type = "text/plain";
    context.response.body = "Hello World!";
  }
}
