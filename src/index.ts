import * as logger from "./util/logger.ts";
import { Oscar } from "./server.ts";
await logger.setupLogger();
new Oscar().start();
