/** Build the installed Host entry and the single-file browser factory from src/. */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const hostModules = ['index.js', 'config.js', 'cache.js', 'errors.js', 'sites.js', 'llm.js', 'http.js']

/** Read one browser source and strip module syntax inside the factory scope. */
function factorySource(name) {
  const source = readFileSync(join(root, 'src', name), 'utf8').replace(/^export /gm, '')
  if (/^\s*(?:import|export)\s/m.test(source)) throw new Error(`${name}: browser sources must not use module syntax`)
  return source
}

mkdirSync(join(root, 'lib'), { recursive: true })
for (const name of hostModules) copyFileSync(join(root, 'src', name), join(root, 'lib', name))

const css = readFileSync(join(root, 'src', 'client.css'), 'utf8')
const client = `/** Generated from src/fragments.js, src/client.js and src/client.css; rebuild with scripts/build.mjs. */
window.__ModuleLoader__.load({
  id: 'dsh-cot-translator-plus',
  factory: (require) => {
    const React = require('react')
    const UI = require('@deepseek-ai/dsh-client-ui-primitives')
    const CSS = ${JSON.stringify(css)}
${factorySource('fragments.js')}
${factorySource('client.js')}
    return { name: 'dsh-cot-translator-plus', inject, apply }
  },
})
`
writeFileSync(join(root, 'lib', 'client.js'), client)
console.log(`Built dsh-cot-translator-plus: ${hostModules.length} Host modules and one browser factory.`)
