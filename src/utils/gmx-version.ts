import pluginManifest from '../../plugin.json';

// esbuild inlines the manifest, avoiding a machine-specific lookup at runtime.
export const GMX_VERSION = pluginManifest.version;
