#!/usr/bin/env node
/**
 * Verifica se js/data-bundle.js está sincronizado com /data/*.json.
 *
 * Por que existe como comando separado: sob file:// o navegador bloqueia
 * fetch() dos JSON, então a aplicação cai no bundle — e NÃO tem como detectar
 * em runtime que ele está velho, porque detectar exigiria ler exatamente os
 * arquivos que o file:// bloqueia. A verificação só é possível aqui, com
 * acesso ao disco.
 *
 * Deliberadamente NÃO roda tools/build-data.js: regenerar automaticamente
 * esconderia a divergência em vez de denunciá-la.
 *
 * Uso: npm run check:bundle
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = { curriculum: 'curriculum.json', skills: 'skills.json', projects: 'projects.json' };
const bundlePath = path.join(root, 'js', 'data-bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.error('✗ js/data-bundle.js não existe. Rode: node tools/build-data.js');
  process.exit(1);
}

let bundle;
try {
  const raw = fs.readFileSync(bundlePath, 'utf8')
    .replace(/^[\s\S]*?window\.__MIA_BUNDLE__ = /, '')
    .replace(/;\s*$/, '');
  bundle = JSON.parse(raw);
} catch (err) {
  console.error('✗ js/data-bundle.js está ilegível: ' + err.message);
  console.error('  Rode: node tools/build-data.js');
  process.exit(1);
}

const divergentes = [];
for (const [key, file] of Object.entries(files)) {
  const source = JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
  if (JSON.stringify(bundle[key]) !== JSON.stringify(source)) divergentes.push(key + ' (data/' + file + ')');
}

if (divergentes.length) {
  console.error('✗ Bundle desatualizado em: ' + divergentes.join(', '));
  console.error('  Quem abrir index.html via file:// verá conteúdo diferente de quem usa um servidor.');
  console.error('  Rode: node tools/build-data.js');
  process.exit(1);
}

console.log('✓ js/data-bundle.js está sincronizado com /data/*.json.');
