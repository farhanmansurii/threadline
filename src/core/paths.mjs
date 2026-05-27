import os from 'node:os';
import path from 'node:path';

export function getRelayKitPaths(env = process.env) {
  const home = os.homedir();
  const configHome = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const dataHome = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const cacheHome = env.XDG_CACHE_HOME || path.join(home, '.cache');

  return {
    configDir: path.join(configHome, 'relaykit'),
    dataDir: path.join(dataHome, 'relaykit'),
    cacheDir: path.join(cacheHome, 'relaykit'),
    projectsDir: path.join(dataHome, 'relaykit', 'projects'),
    registryDir: path.join(dataHome, 'relaykit', 'registry'),
  };
}
