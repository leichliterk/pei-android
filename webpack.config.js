const webpack = require("@nativescript/webpack");
const path = require("path");

module.exports = (env) => {
	webpack.init(env);

	// Swap in the production environment file when building with --env.production
	if (env.production) {
		webpack.mergeWebpack({
			plugins: [
				new (require("webpack").NormalModuleReplacementPlugin)(
					/environments\/environment$/,
					path.resolve(__dirname, "src/environments/environment.prod.ts")
				)
			]
		});
	}

	// socket.io-client's ESM build still includes a Node.js WebSocket transport
	// (ws module) alongside the browser one. Stub it out — NativeScript uses
	// the native WebSocket API directly.
	webpack.mergeWebpack({
		resolve: {
			conditionNames: ['browser', 'module', 'import', 'default', 'require'],
			alias: {
				// Prevent the ws (Node.js WebSocket) package from being bundled.
				// socket.io-client will fall back to the native WebSocket.
				'ws': false,
				'xmlhttprequest-ssl': false,
			},
			fallback: {
				tty: false,
				net: false,
				tls: false,
				stream: false,
				crypto: false,
				fs: false,
				path: false,
				os: false,
				http: false,
				https: false,
				zlib: false,
				util: false,
				assert: false,
				url: false,
				child_process: false,
				dgram: false,
				dns: false,
				'node:events': false,
			}
		}
	});

	return webpack.resolveConfig();
};
