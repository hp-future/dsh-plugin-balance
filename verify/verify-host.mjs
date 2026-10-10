/**
 * Scoped verification harness for the balance bundle's host half.
 *
 * Drives `apply()` against a minimal stand-in context: it records the routes the
 * plugin registers, invokes their handlers with plain request/response doubles,
 * and checks the wire payload against the live balance endpoint. No Harness
 * process is started.
 *
 * Run: node verify/verify-host.mjs
 */
import { apply, inject, name } from '../index.js'

/** Minimal response double capturing status, headers, and body. */
function createResponse() {
	return {
		statusCode: 0,
		headers: {},
		body: '',
		setHeader(key, value) {
			this.headers[key] = value
		},
		end(chunk) {
			this.body = chunk ?? ''
		},
	}
}

const routes = []
const effects = []
const ctx = {
	credentials: {
		async resolve(ref) {
			if (ref !== 'DEEPSEEK_API_KEY') throw new Error(`unexpected ref ${ref}`)
			return { value: (process.env.DEEPSEEK_API_KEY ?? '').trim(), source: 'environment' }
		},
	},
	connection: { requestRejection: () => undefined },
	webServer: {
		register(route) {
			routes.push(route)
			return () => {}
		},
	},
	effect(install, label) {
		effects.push(label)
		install()
	},
	get() {
		return undefined
	},
}

apply(ctx)

console.log(`name:   ${name}`)
console.log(`inject: ${inject.join(', ')}`)
console.log(`routes: ${routes.map((route) => `${route.kind} ${route.path}`).join(', ')}`)

const byPath = new Map(routes.map((route) => [route.path, route]))
const missing = ['/balance', '/balance/refresh'].filter((path) => !byPath.has(path))
if (missing.length > 0) {
	console.error(`FAIL: missing routes ${missing.join(', ')}`)
	process.exit(1)
}

/** Drive one registered route. */
async function call(path, method) {
	const response = createResponse()
	await byPath.get(path).handler({ method, url: path, headers: {} }, response)
	return response
}

const cached = await call('/balance', 'GET')
console.log(`\nGET /balance -> ${cached.statusCode} ${cached.headers['cache-control']}`)
console.log(cached.body)

const rejected = createResponse()
await byPath.get('/balance').handler({ method: 'POST', url: '/balance', headers: {} }, rejected)
console.log(`\nPOST /balance -> ${rejected.statusCode} allow=${rejected.headers.allow}`)

let failures = 0
const check = (label, ok, detail) => {
	if (!ok) failures += 1
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : `: ${detail}`}`)
}

const payload = JSON.parse(cached.body)
const credentialed = process.env.DEEPSEEK_API_KEY !== undefined && process.env.DEEPSEEK_API_KEY.trim() !== ''
check('method fence', rejected.statusCode === 405 && rejected.headers.allow === 'GET')
check('no-store', cached.headers['cache-control'] === 'no-store')

if (!credentialed) {
	// The double resolves the key from this shell only. Without one the upstream
	// answer is out of reach, so the payload checks are reported untested rather
	// than failed.
	console.log('skip read succeeded: DEEPSEEK_API_KEY is not set in this shell, so the live read is untested')
	console.log('skip wallet checks: no upstream answer to shape-check')
} else {
	check('read succeeded', payload.ok === true, payload.ok === true ? undefined : `${payload.code} ${payload.message}`)
	if (payload.ok === true) {
		check('wallets present', Array.isArray(payload.wallets) && payload.wallets.length > 0)
		for (const wallet of payload.wallets) {
			check(`wallet ${wallet.currency} shape`, typeof wallet.total === 'string' && typeof wallet.toppedUp === 'string' && typeof wallet.granted === 'string',
				`total=${wallet.total} toppedUp=${wallet.toppedUp} granted=${wallet.granted}`)
			// The client formats these strings, so they must stay decimal text.
			check(`wallet ${wallet.currency} decimal text`, /^-?\d+(?:\.\d+)?$/u.test(wallet.total), wallet.total)
		}
		check('readAt present', typeof payload.readAt === 'string')
	}
}

if (failures > 0) {
	console.error(`\nFAIL: ${failures} host check(s) failed`)
	process.exit(1)
}
console.log(credentialed
	? '\nPASS: host half registers both routes and returns a shaped balance payload.'
	: '\nPASS: host half registers both routes; set DEEPSEEK_API_KEY to also check the live payload.')
