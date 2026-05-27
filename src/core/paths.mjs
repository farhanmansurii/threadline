import os from 'node:os';
import path from 'node:path';

export function getThreadlinePaths(env = process.env) {
  const home = os.homedir();
  const configHome = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const dataHome = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const cacheHome = env.XDG_CACHE_HOME || path.join(home, '.cache');

  for (const [name, value] of Object.entries({ XDG_CONFIG_HOME: configHome, XDG_DATA_HOME: dataHome, XDG_CACHE_HOME: cacheHome })) {
    if (!path.isAbsolute(value)) {
      throw new Error(`${name} must be absolute for Threadline writes: ${value}`);
    }
  }

  return {
    configDir: path.join(configHome, 'threadline'),
    dataDir: path.join(dataHome, 'threadline'),
    cacheDir: path.join(cacheHome, 'threadline'),
    projectsDir: path.join(dataHome, 'threadline', 'projects'),
    registryDir: path.join(dataHome, 'threadline', 'registry'),
  };
}
