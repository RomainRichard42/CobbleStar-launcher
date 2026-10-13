import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = path.join(root, 'release/explorer-review')
const report = JSON.parse(fs.readFileSync(path.join(base, 'verification.json'), 'utf8'))
const files = [...report.screenshots, 'electron-native']
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CobbleStar 0.8.2 — captures</title><style>*{box-sizing:border-box}body{font:16px/1.6 system-ui;margin:0;padding:30px;background:#191326;color:#f3e8ff}main{max-width:1600px;margin:auto}h1{margin:0;color:#59e3db}p{color:#c3addf}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:22px}a{color:#e6d3fa;text-decoration:none;background:#2a1e3c;border:1px solid #634c83;border-radius:12px;overflow:hidden;display:grid}a:focus-visible{outline:3px solid #52e5d9}img{width:100%;display:block}span{padding:12px 16px;font-weight:600}small{color:#c6b3df}footer{margin-top:28px}</style><main><h1>COBBLESTAR — Launcher 0.8.2</h1><p>Captures du launcher implémenté, et non les maquettes dessinées. ${report.checks} contrôles d’interface validés. Clique pour agrandir.</p><p>Les données de ces captures sont des réponses de test isolées. Aucun vrai compte connecté, aucun jeu lancé, aucun chiffre de production annoncé.</p><div class="grid">${files.map(file => `<a href="${encodeURIComponent(file)}.png"><img src="${encodeURIComponent(file)}.png" alt="Capture ${file}" loading="lazy"><span>${file.replaceAll('-', ' ')}</span></a>`).join('')}</div><footer><small>Build local · Pas encore publié · 13 octobre 2026</small></footer></main></html>`
fs.writeFileSync(path.join(base, 'index.html'), html)
console.log(`${files.length} captures dans la galerie locale.`)
