#!/usr/bin/env node
/**
 * Gera js/data-bundle.js a partir dos arquivos canônicos em /data.
 *
 * Por que existe: abrindo index.html direto do disco (file://), o navegador
 * bloqueia fetch() de arquivos locais. O bundle é o plano B — a fonte da
 * verdade continua sendo /data/*.json.
 *
 * Uso: node tools/build-data.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = { curriculum: 'curriculum.json', skills: 'skills.json', projects: 'projects.json' };

const bundle = {};
for (const [key, file] of Object.entries(files)) {
  const raw = fs.readFileSync(path.join(root, 'data', file), 'utf8');
  bundle[key] = JSON.parse(raw); // valida o JSON de quebra
}

const out =
  '/* Gerado por tools/build-data.js a partir de /data/*.json. Não edite à mão. */\n' +
  'window.__MIA_BUNDLE__ = ' + JSON.stringify(bundle) + ';\n';

fs.writeFileSync(path.join(root, 'js', 'data-bundle.js'), out);
console.log('js/data-bundle.js gerado (' + (out.length / 1024).toFixed(1) + ' KB)');
