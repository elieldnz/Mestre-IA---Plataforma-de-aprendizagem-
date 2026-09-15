/* Resolve o Playwright, esteja ele instalado no projeto ou globalmente. */
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export async function loadChromium() {
  for (const name of ['playwright', 'playwright-core']) {
    try { const m = await import(name); return (m.default || m).chromium; } catch (e) { /* tenta o próximo */ }
  }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    for (const name of ['playwright', 'playwright-core']) {
      const entry = path.join(globalRoot, name, 'index.js');
      if (fs.existsSync(entry)) {
        const m = await import(pathToFileURL(entry).href);
        return (m.default || m).chromium;
      }
    }
  } catch (e) { /* sem npm global disponível */ }
  throw new Error('Playwright não encontrado. Instale com: npm install --no-save playwright');
}
