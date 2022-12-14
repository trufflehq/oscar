import { ensureDir } from "$std/fs/mod.ts";
import { Oscar } from "./server.ts";
import { CACHE_DIR } from "./util/constants.ts";
import * as logger from "./util/logger.ts";

await logger.setupLogger();
await ensureDir(CACHE_DIR);
new Oscar().start();
