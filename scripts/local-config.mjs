import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
export function localConfig() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const port = (name, fallback) => {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${name} must be an integer between 1024 and 65535`);
    return value;
  };
  const webPort = port('CAREER_WEB_PORT',4210), apiPort=port('CAREER_API_PORT',4211);
  if(webPort===apiPort)throw new Error('Frontend and API ports must differ');
  return {webPort,apiPort,dataRoot:resolve(process.env.CAREER_DATA_DIR || join(homedir(),'.local/share/career-note'))};
}
