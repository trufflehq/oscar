import { Application } from '$x/oak@v10.6.0/mod.ts';
import logger from '$x/oak_logger@1.0.0/mod.ts';
import { bgGreen, bold } from '$std/fmt/colors.ts';
import { format } from '$std/datetime/mod.ts';

export class OscarApplication extends Application {
	public readonly app = new Application();

	public constructor() {
		super();

		this.app.use(logger.logger);

		this.app.addEventListener('listen', ({ hostname, port, secure }) => {
			const log_string = `[${
				format(new Date(Date.now()), 'MM-dd-yyyy hh:mm:ss.SSS')
			}  Oak::logger] Listening on: ${secure ? 'https://' : 'http://'}${
				hostname ??
					'localhost'
			}:${port}`;
			console.log(bold(bgGreen(log_string)));
		});

		this.init();
	}

	public start() {
		return this.app.listen({ port: 2319 });
	}

	public init(): void {
		throw new Error(`init() not implemented on ${this.constructor.name}`);
	}
}
