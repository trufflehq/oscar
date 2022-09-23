export * from "$std/log/mod.ts";
import { cyan, format, green, handlers, LogLevels, magenta, red, setup, yellow } from "$deps";

const color = (level: LogLevels) => {
  switch (level) {
    case LogLevels.DEBUG:
      return cyan;
    case LogLevels.INFO:
      return green;
    case LogLevels.WARNING:
      return yellow;
    case LogLevels.ERROR:
      return red;
    case LogLevels.CRITICAL:
      return magenta;
    default:
      return () => "";
  }
};

export const setupLogger = async () =>
  await setup({
    handlers: {
      format: new handlers.ConsoleHandler("DEBUG", {
        formatter: ({ datetime, msg, level, args }) => {
          const scope = args[0] ?? "Oscar";
          return color(level)(
            `[${format(datetime, "MM-dd-yyyy hh:mm:ss.SSS")} ${scope}]: ${msg}`,
          );
        },
      }),
    },
    loggers: {
      default: {
        level: "DEBUG",
        handlers: ["format"],
      },
    },
  });
