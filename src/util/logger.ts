export * from "$std/log/mod.ts";
import { handlers, LogLevels, setup } from "$std/log/mod.ts";
import { format } from "$std/datetime/mod.ts";
import { cyan, green, magenta, red, yellow } from "$std/fmt/colors.ts";

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
        formatter: ({ datetime, msg, loggerName, level }) => {
          return color(level)(
            `[${format(datetime, "MM-dd-yyyy hh:mm:ss.SSS")} ${loggerName}]: ${msg}`,
          );
        },
      }),
    },
    loggers: {
      isense: {
        level: "DEBUG",
        handlers: ["format"],
      },
    },
  });
