import { RouteParams, Router, RouterContext } from "$deps";
import { OscarApplication } from "./Application.ts";

export type OscarContext<P extends string> = RouterContext<P, RouteParams<P>>;

export abstract class Controller<P extends string> {
  public readonly router = new Router();

  constructor(
    public app: OscarApplication,
    public path: P,
  ) {
    this.init();
  }

  public init(): void {
    throw new Error(`init() not implemented on ${this.path}`);
  }
}
