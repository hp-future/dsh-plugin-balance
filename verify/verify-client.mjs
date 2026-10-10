/**
 * Scoped verification harness for the balance bundle's browser half.
 *
 * The client bundle is a lazy-CJS module for the page's module table, so this
 * harness supplies the little the bundle touches: a `window.__ModuleLoader__`
 * sink, a minimal `document`, a hook-state double for React, and a slot-registry
 * double that can be told whether the seat is declared yet.
 *
 * Run: node verify/verify-client.mjs
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const SLOT = 'conversation.composer.dock'

const isElement = (value) => typeof value === 'object' && value !== null && typeof value.tag === 'string'

/**
 * React renders a function component by invoking it; `createElement` here keeps
 * the component as the tag, so the double resolves it the same way before the
 * tree is walked.
 * @param node - rendered node.
 * @returns the node with function components expanded.
 */
function resolve(node) {
	if (Array.isArray(node)) return node.map(resolve)
	// A bare function child is a component occurrence too.
	if (typeof node === 'function') return resolve(node({}))
	if (node === null || typeof node !== 'object') return node
	if (typeof node.tag === 'function') return resolve(node.tag(node.props))
	if (node.children === undefined) return node
	return { tag: node.tag, props: node.props, children: resolve(node.children) }
}

/** Flatten a rendered tree into one text string. */
function textOf(node) {
	const value = resolve(node)
	if (value === null || value === undefined || value === false) return ''
	if (Array.isArray(value)) return value.map(textOf).join('')
	if (!isElement(value)) return String(value)
	return textOf(value.children)
}

/** Collect every class name in a rendered tree. */
function classesOf(node, out = new Set()) {
	const value = resolve(node)
	if (Array.isArray(value)) {
		for (const child of value) classesOf(child, out)
		return out
	}
	if (!isElement(value)) return out
	if (typeof value.props.className === 'string') for (const n of value.props.className.split(/\s+/)) if (n !== '') out.add(n)
	classesOf(value.children, out)
	return out
}

// --- minimal document double --------------------------------------------
const styleElements = []
const document = {
	head: { append: (node) => styleElements.push(node) },
	visibilityState: 'visible',
	getElementById: (id) => styleElements.find((n) => n.id === id) ?? null,
	createElement: (tag) => ({
		tag,
		id: '',
		textContent: '',
		remove() {
			const at = styleElements.indexOf(this)
			if (at !== -1) styleElements.splice(at, 1)
		},
	}),
	addEventListener() {},
	removeEventListener() {},
}
globalThis.window = {
	__ModuleLoader__: { load: (r) => { globalThis.__captured = r } },
}
globalThis.document = document

// --- React double -------------------------------------------------------
const React = {
	useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
	useEffect: () => {},
	// The component consumes its injected ObservableSnapshot through this hook.
	useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
	createElement(tag, props, ...children) {
		if (props !== null && props !== undefined && typeof props !== 'object') return { tag, props: {}, children: [props, ...children] }
		return { tag, props: props ?? {}, children: children.filter((c) => c !== undefined) }
	},
}
const requireShim = (request) => {
	if (request === 'react') return React
	throw new Error(`unexpected module request ${request}`)
}

await import(pathToFileURL(join(here, 'client.js')).href)
const registration = globalThis.__captured
if (registration === undefined) throw new Error('client bundle registered no factory')
if (registration.id !== '@hp-future/dsh-plugin-balance') throw new Error(`factory id ${registration.id}`)
const mod = registration.factory(requireShim)
console.log(`factory id: ${registration.id}`)
console.log(`exports: ${Object.keys(mod).join(',')}`)

let failures = 0
const check = (name, ok, detail) => {
	if (!ok) failures += 1
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`)
}

/**
 * Build a fresh plugin instance over a slot-registry double.
 * @param options - `declared`: seat exists when the plugin activates;
 *   `fireCallback`: whether the documented declaration callback actually runs
 *   (false models the seat-declared-but-callback-silent failure).
 * @returns the registry double and a control for a later declaration.
 */
function mount(options) {
	const { declared = true, fireCallback = true } = options
	const registrations = []
	styleElements.length = 0
	let isDeclared = declared
	let callback
	const ctx = {
		effect(install) {
			return install()
		},
		slots: {
			specDynamic: () => (isDeclared ? { kind: 'list', scope: 'session' } : undefined),
			register(options, component) {
				registrations.push({ options, component })
				return () => {}
			},
			inject(key, fn) {
				callback = fn
				// The documented contract: run synchronously when already declared.
				if (isDeclared && fireCallback) fn()
				return () => {}
			},
			onEntryError() {
				return () => {}
			},
		},
	}
	mod.apply(ctx)
	return {
		ctx,
		registrations,
		declare: () => {
			isDeclared = true
			if (fireCallback && callback !== undefined) callback()
		},
	}
}

// The plugin writes no diagnostic global; registration counts are the evidence.
check('no diagnostic global is left behind', globalThis.window.__dshBalance === undefined)

// --- 1. seat declared and the callback fires -> synchronous registration --
const normal = mount({ declared: true, fireCallback: true })
check('declared seat registers synchronously', normal.registrations.length === 1, `entries=${normal.registrations.length}`)
check('registers into the composer dock with id balance', normal.registrations[0]?.options.name === SLOT && normal.registrations[0]?.options.id === 'balance',
	`${normal.registrations[0]?.options.name}/${normal.registrations[0]?.options.id}`)
check('style injected once', styleElements.length === 1, `${styleElements.length}`)

// --- 2. seat declared LATER, callback fires -> exactly one entry ----------
const late = mount({ declared: false, fireCallback: true })
check('undeclared seat registers nothing yet', late.registrations.length === 0, `entries=${late.registrations.length}`)
late.declare()
check('later declaration registers exactly once', late.registrations.length === 1, `entries=${late.registrations.length}`)

// --- 3. the failure that started this: declared but callback silent -------
const silent = mount({ declared: true, fireCallback: false })
check('silent callback leaves nothing registered at first', silent.registrations.length === 0, `entries=${silent.registrations.length}`)
await new Promise((resolve) => setTimeout(resolve, 400))
check('fallback recovers the silent-callback case', silent.registrations.length === 1, `entries=${silent.registrations.length}`)

// --- 4. a re-declaration must never add a second pill --------------------
const redeclare = mount({ declared: true, fireCallback: true })
redeclare.declare()
redeclare.declare()
check('re-declaration does not duplicate the entry', redeclare.registrations.length === 1,
	`entries=${redeclare.registrations.length}`)

// --- 5. rendering over representative payloads --------------------------
const entry = normal.registrations[0]
const injected = entry.options.inject()
check('inject exposes refresh', typeof injected.refresh === 'function')
// `hooks` is a reserved compartment the renderer consumes, so the source must
// arrive as a plain named prop instead.
check('inject does NOT use the reserved hooks compartment', injected.hooks === undefined, `hooks=${typeof injected.hooks}`)
check('inject exposes the balance source by name', typeof injected.balance?.getSnapshot === 'function' && typeof injected.balance?.subscribe === 'function')

/** Render the pill over one wallet. */
const render = (wallet) => {
	const snapshot = wallet === null ? { phase: 'failed', wallets: [] } : { phase: 'loaded', wallets: [wallet] }
	return entry.component({ balance: { getSnapshot: () => snapshot, subscribe: () => () => {} }, refresh: () => {} })
}

const cases = [
	[{ currency: 'CNY', total: '59.32', toppedUp: '59.32', granted: '0.00' }, '¥59.32', 'plain CNY'],
	[{ currency: 'CNY', total: '12.345', toppedUp: '12.345', granted: '0.00' }, '¥12.34', 'truncated to cents'],
	[{ currency: 'CNY', total: '1234.5', toppedUp: '1234.5', granted: '0.00' }, '¥1,234.50', 'digit grouping'],
	[{ currency: 'CNY', total: '0.005', toppedUp: '0.005', granted: '0.00' }, '¥<0.01', 'positive sub-cent'],
	[{ currency: 'USD', total: '10.5', toppedUp: '10.5', granted: '0.00' }, '$10.50', 'USD'],
]
for (const [wallet, expected, name] of cases) {
	const tree = render(wallet)
	const text = textOf(tree)
	check(name, text === expected, `"${text}" want "${expected}"`)
	// The class names must line up with the host's StatsPills row.
	if (!classesOf(tree).has('dshBal_root') || !classesOf(tree).has('dshBal_pill')) {
		failures += 1
		console.log(`FAIL ${name}: pill classes missing -> ${[...classesOf(tree)].join(',')}`)
	}
	if (tree?.children?.[0]?.children?.length !== 2) {
		failures += 1
		console.log(`FAIL ${name}: pill should render a glyph plus a value`)
	}
}

// A failed read renders nothing rather than a fabricated amount.
check('failed read renders null', render(null) === null, String(render(null)))

if (failures > 0) {
	console.error(`\nFAIL: ${failures} client check(s) failed`)
	process.exit(1)
}
console.log('\nPASS: registration paths, pill markup, and formatting all hold.')
