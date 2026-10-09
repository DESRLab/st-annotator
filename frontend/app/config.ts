import config from "./sta-config.shim";

export type RoutePlugin = {
	path: string;
	module: string;
	title: string;
}

export type STAPlugin = {
    routes: {
		source?: {
			data?: RoutePlugin[];
			specs?: RoutePlugin[];
		};
		label?: {
			data?: RoutePlugin[];
			specs?: RoutePlugin[];
		};
	};
    entrypoint?: () => void;
}

export type STAConfig = {
    plugins: Record<string, STAPlugin>;
}

const plugins = config.plugins as Record<string, STAPlugin>;
let pluginEntrypointsInitialized = false;

export function getPlugins(): Record<string, STAPlugin> {
	return plugins;
}

export function initializePluginEntrypoints() {
	if (pluginEntrypointsInitialized) {
		return;
	}

	for (const [name, plugin] of Object.entries(plugins)) {
		console.info(`Loading plugin: ${name}`);
		plugin.entrypoint?.();
	}

	pluginEntrypointsInitialized = true;
}
