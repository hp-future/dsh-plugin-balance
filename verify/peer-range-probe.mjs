/**
 * Throwaway probe: which peerDependencies range admits the running dsh runtime,
 * using the exact semver copy and options dsh-app-boot evaluates peers with
 * (`semver.satisfies(runtimeVersion, range, { includePrerelease: true })`).
 *
 * Run: node verify/peer-range-probe.mjs
 */
import { createRequire } from 'node:module'

// Resolved from the dsh installation's own tree: the exact copy app-boot uses.
const require = createRequire('D:/nvm/v24.21.0/node_modules/@deepseek-ai/dsh/package.json')
const semver = require('semver')

const runtime = '0.2.0-rc.2'
const ranges = ['^0.2.0-rc.2', '>=0.2.0-rc.2 <0.3.0', '>=0.2.0-rc.2 <1.0.0', '0.2.0-rc.2', '*']
const probes = ['0.2.0-rc.2', '0.2.0-rc.3', '0.2.0', '0.2.1', '0.3.0-rc.1', '0.3.0', '1.0.0']

console.log(`runtime: ${runtime}\n`)
for (const range of ranges) {
	const verdict = semver.satisfies(runtime, range, { includePrerelease: true }) ? 'ACCEPTS' : 'REFUSES'
	const spread = probes
		.map((version) => `${version}:${semver.satisfies(version, range, { includePrerelease: true }) ? 'Y' : 'n'}`)
		.join('  ')
	console.log(`${range.padEnd(20)} ${verdict.padEnd(8)} ${spread}`)
}
