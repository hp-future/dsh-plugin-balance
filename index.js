/**
 * Host half of the balance bundle: one live read of the DeepSeek account
 * balance, served to the browser half over `webServer` and authenticated by
 * the API key the composition already stores.
 *
 * The module imports nothing, so a profile-installed copy resolves without its
 * own dependency tree: both services it needs are reached through `ctx`, and
 * the credential reference is the plain environment-variable name the
 * credentials seam brands (its grammar check is a type-level concern, and the
 * resolve call validates the name at runtime).
 *
 * The key is resolved per operation through the credentials seam — the same
 * reference the DeepSeek inference adapter reads — so a rotated key applies to
 * the next read with no restart and no configuration edit. The value never
 * leaves this module: both routes answer only the account facts below.
 *
 * Both routes sit behind the composition's `connection` service
 * (`requestRejection`), whose Host/Origin fence defeats DNS rebinding and
 * cross-site calls and whose browser authentication gates every caller before
 * any read runs.
 * @module @hp-future/dsh-plugin-balance
 */

/** Cordis function-plugin name. */
export const name = 'balance'

/**
 * The route carrier, the trust fence guarding both routes, the key store, and
 * the environment that supplies the key when no store does. Both key sources
 * are declared so the plugin activates only where a key can actually resolve.
 */
export const inject = ['webServer', 'connection', 'credentials', 'launchEnvironment']

/** Browser-relative route answering the cached balance snapshot. */
const BALANCE_PATH = '/balance'
/** Browser-relative route forcing a fresh upstream read. */
const BALANCE_REFRESH_PATH = '/balance/refresh'
/** Upstream DeepSeek account-balance endpoint. */
const UPSTREAM_ORIGIN = 'https://api.deepseek.com'
/** The credential reference the DeepSeek provider route already reads. */
const API_KEY_REF = 'DEEPSEEK_API_KEY'
/** Upstream read deadline; a slow account service must not hold the route open. */
const REQUEST_TIMEOUT_MS = 15000
/** How long one upstream answer keeps serving before the next read is admitted. */
const CACHE_TTL_MS = 30000

/**
 * Answer one request as JSON.
 * @param res - the response to write.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
	res.statusCode = status
	res.setHeader('content-type', 'application/json; charset=utf-8')
	// The balance is a live fact; a cached browser response would be a lie.
	res.setHeader('cache-control', 'no-store')
	res.end(JSON.stringify(payload))
}

/**
 * Answer 405 with the route's one supported method.
 * @param res - the response to write.
 * @param allow - the allowed method.
 */
function sendMethodNotAllowed(res, allow) {
	res.statusCode = 405
	res.setHeader('allow', allow)
	res.end()
}

/**
 * Read the value behind a credential reference from the launch environment,
 * for the case where no credential store is mounted and the composition
 * supplies the key as an ambient variable.
 * @param ctx - the plugin context.
 * @param ref - the credential reference to read.
 * @returns the ambient value, or undefined when no source supplies one.
 */
function ambientValue(ctx, ref) {
	const environment = ctx.launchEnvironment
	if (environment === undefined || typeof environment.get !== 'function') return undefined
	const hit = environment.get(ref)
	return hit === undefined || hit.value.length === 0 ? undefined : hit.value.trim()
}

/**
 * Resolve the DeepSeek API key the composition already holds.
 *
 * The credentials store is consulted first and the launch environment second,
 * mirroring the inference adapter: a key present in both sources resolves to
 * the stored one.
 * @param ctx - the plugin context.
 * @returns the key, or undefined when neither source configures one.
 */
async function resolveApiKey(ctx) {
	const hit = await ctx.credentials.resolve(API_KEY_REF)
	if (hit !== undefined) {
		// A stored value may carry the scheme the wire header already states.
		return hit.value.trim().replace(/^Bearer\s+/iu, '')
	}
	const ambient = ambientValue(ctx, API_KEY_REF)
	return ambient === undefined ? undefined : ambient.replace(/^Bearer\s+/iu, '')
}

/**
 * Project one upstream answer onto the facts the browser half renders.
 *
 * Balance strings keep their decimal precision; formatting belongs to the
 * client, which follows the Platform Web rules.
 * @param body - the parsed upstream response.
 * @returns the wire payload, or null when the shape is not a balance answer.
 */
function projectBalance(body) {
	if (typeof body !== 'object' || body === null) return null
	if (!Array.isArray(body.balance_infos)) return null
	const wallets = body.balance_infos
		.filter((wallet) => typeof wallet === 'object' && wallet !== null && typeof wallet.currency === 'string')
		.map((wallet) => ({
			currency: wallet.currency,
			total: String(wallet.total_balance ?? ''),
			toppedUp: String(wallet.topped_up_balance ?? ''),
			granted: String(wallet.granted_balance ?? ''),
		}))
	return { available: body.is_available === true, wallets }
}

/**
 * Register the balance routes behind the connection trust fence.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
	let cache
	let inFlight

	/**
	 * Read upstream once and keep the answer for the cache window. Concurrent
	 * callers join one request so a burst of callers cannot fan out.
	 * @returns the wire payload, or an error payload when the read failed.
	 */
	const read = () => {
		const now = Date.now()
		if (cache !== undefined && now - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.payload)
		if (inFlight !== undefined) return inFlight
		inFlight = (async () => {
			try {
				const key = await resolveApiKey(ctx)
				if (key === undefined) {
					return {
						ok: false,
						code: 'no-credential',
						message: `no API key: store ${API_KEY_REF} through the credentials service, or export it in the launching environment`,
					}
				}
				const response = await fetch(`${UPSTREAM_ORIGIN}/user/balance`, {
					headers: { accept: 'application/json', authorization: `Bearer ${key}` },
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				})
				if (!response.ok) {
					return { ok: false, code: 'upstream', message: `balance read failed with HTTP ${response.status}` }
				}
				const payload = projectBalance(await response.json())
				if (payload === null) return { ok: false, code: 'shape', message: 'balance read returned an unexpected shape' }
				const answer = { ok: true, readAt: new Date().toISOString(), ...payload }
				cache = { at: Date.now(), payload: answer }
				return answer
			} catch (error) {
				return { ok: false, code: 'transport', message: String(error) }
			} finally {
				inFlight = undefined
			}
		})()
		return inFlight
	}

	/** Answer an untrusted or unauthenticated request; true when it was rejected. */
	const rejected = (req, res) => {
		const rejection = ctx.connection.requestRejection(req)
		if (rejection === undefined) return false
		res.statusCode = rejection
		res.end()
		return true
	}

	/** Answer one GET route from the shared read. */
	const handleGet = async (req, res) => {
		if (rejected(req, res)) return
		if (req.method !== 'GET') {
			sendMethodNotAllowed(res, 'GET')
			return
		}
		sendJson(res, 200, await read())
	}

	ctx.effect(
		() => ctx.webServer.register({ kind: 'exact', path: BALANCE_PATH, handler: handleGet }),
		`balance: GET ${BALANCE_PATH}`,
	)
	ctx.effect(
		() => ctx.webServer.register({
			kind: 'exact',
			path: BALANCE_REFRESH_PATH,
			handler: async (req, res) => {
				if (rejected(req, res)) return
				if (req.method !== 'GET') {
					sendMethodNotAllowed(res, 'GET')
					return
				}
				// A top-up may have landed since the last read.
				cache = undefined
				sendJson(res, 200, await read())
			},
		}),
		`balance: GET ${BALANCE_REFRESH_PATH}`,
	)
}
