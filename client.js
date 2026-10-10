window.__ModuleLoader__.load({
  id: '@hp-future/dsh-plugin-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Style element id owned by this plugin (one per page). */
    const STYLE_ID = 'dsh-balance-pill'
    /** Upstream answers are cached for 30s, so a faster poll would only re-read the same value. */
    const POLL_MS = 60000
    /** The composer status row: the token/cache pills live here, so the balance joins them. */
    const SLOT = 'conversation.composer.dock'
    /**
     * Fallback window for a seat that is already declared but whose
     * declaration callback does not fire. The documented contract runs the
     * callback synchronously in that case, so this normally never ticks.
     */
    const FALLBACK_MS = 3000
    const FALLBACK_STEP_MS = 200

    // Matches the host's StatsPills so the two read as one row. Only
    // `--dsw-alias-*` tokens are referenced, per the plugin UI rules.
    const CSS = `
.dshBal_root{box-sizing:border-box;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;gap:12px;display:flex}
.dshBal_pill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;border-radius:999px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}
.dshBal_pill svg{flex:none;width:14px;height:14px}
.dshBal_value{text-overflow:ellipsis;min-width:0;overflow:hidden}
`

    /**
     * Format one balance amount using the Platform Web currency rules: two
     * decimal places with digit grouping, positive amounts truncated to cents,
     * a positive sub-cent amount shown as <0.01, and a negative amount rounded
     * with a minimum displayed magnitude of 0.01.
     * @param {string} raw - the decimal string the Host forwarded unchanged.
     * @returns {string} display text without a currency symbol.
     */
    function formatNumber(raw) {
      const value = Number.parseFloat(raw)
      if (!Number.isFinite(value)) return '--'
      const magnitude = Math.abs(value)
      if (magnitude > 0 && magnitude < 0.01) return value < 0 ? '->0.01' : '<0.01'
      const rounded = value < 0 ? -Math.round(magnitude * 100) / 100 : Math.floor(magnitude * 100) / 100
      return rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    /**
     * A wallet glyph drawn inline: the plugin baseline carries React only, and
     * the UI rules forbid importing the host's primitives package.
     * @returns {object} the svg element.
     */
    function WalletGlyph() {
      return h('svg', {
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M2.2 4.6A1.6 1.6 0 0 1 3.8 3h7.4a1.6 1.6 0 0 1 1.6 1.6v.4' }),
        h('path', { d: 'M2.2 4.6v6.8A1.6 1.6 0 0 0 3.8 13h8.9a1.3 1.3 0 0 0 1.3-1.3V6.9a1.3 1.3 0 0 0-1.3-1.3H3.8a1.6 1.6 0 0 1-1.6-1Z' }),
        h('circle', { cx: '10.7', cy: '9.3', r: '1.05', fill: 'currentColor', stroke: 'none' }),
      )
    }

    /**
     * Balance pill for the composer status row.
     *
     * The amount shown is the account total. A recharge balance that differs
     * from it (a granted bonus is included in the total) is stated in the
     * title, so no money on the account goes unstated.
     *
     * `balance` is an ObservableSnapshot injected by name (a `hooks`
     * compartment would have been renamed to a `useBalance` prop instead), so
     * it is consumed through useSyncExternalStore — the same shape the host's
     * own chat sources use.
     *
     * @param {object} props - slot props plus this plugin's inject share.
     * @returns {object | null} the rendered element, or null while unloaded.
     */
    function BalancePill({ balance, refresh }) {
      const snapshot = React.useSyncExternalStore(balance.subscribe, balance.getSnapshot)
      React.useEffect(() => {
        refresh()
        const timer = setInterval(refresh, POLL_MS)
        const onVisible = () => {
          if (document.visibilityState === 'visible') refresh()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [refresh])

      const wallet = snapshot.phase === 'loaded' ? snapshot.wallets[0] : undefined
      // Nothing known yet: the token pills beside this one come and go the same
      // way, so an absent pill is the honest state rather than a zero.
      if (wallet === undefined) return null

      // An unknown currency is rendered by its own code rather than a wrong symbol.
      const symbol = wallet.currency === 'CNY' ? '¥' : wallet.currency === 'USD' ? '$' : `${wallet.currency} `
      const total = `${symbol}${formatNumber(wallet.total)}`
      const toppedUp = wallet.toppedUp === '' ? null : `${symbol}${formatNumber(wallet.toppedUp)}`
      const title = toppedUp === null || toppedUp === total ? `余额 ${total}` : `余额 ${total} · 充值 ${toppedUp}`

      return h('div', { className: 'dshBal_root' },
        h('span', { className: 'dshBal_pill', title, 'aria-label': `余额 ${total}` },
          h(WalletGlyph),
          h('span', { className: 'dshBal_value' }, total),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Read path and reader share one generation: an older response can
        // never overwrite a newer one, and joining an in-flight read keeps a
        // poll, a focus return and a mount from fanning out.
        let generation = 0
        let inFlight
        let snapshot = { phase: 'loading', wallets: [] }
        const listeners = new Set()
        const source = {
          getSnapshot: () => snapshot,
          subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        }
        const publish = (next) => {
          snapshot = next
          for (const listener of [...listeners]) listener()
        }
        const read = (force) => {
          const mine = ++generation
          const url = force === true ? '/balance/refresh' : '/balance'
          return fetch(url, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((payload) => {
              if (mine !== generation) return
              publish(payload.ok === true
                ? { phase: 'loaded', wallets: payload.wallets, readAt: payload.readAt }
                : { phase: 'failed', wallets: [] })
            })
            .catch(() => {
              if (mine !== generation) return
              publish({ phase: 'failed', wallets: [] })
            })
            .finally(() => {
              inFlight = undefined
            })
        }
        const refresh = (force) => {
          if (inFlight !== undefined) return inFlight
          inFlight = read(force)
          return inFlight
        }

        ctx.effect(() => {
          if (document.getElementById(STYLE_ID) !== null) return () => {}
          const style = document.createElement('style')
          style.id = STYLE_ID
          style.textContent = CSS
          document.head.append(style)
          return () => style.remove()
        }, 'balance: styles')

        // Registration outcome, kept local: a support report can quote the
        // console, and no global is left behind for a page to trip over.
        const outcome = { registered: false, attempts: 0 }
        ctx.slots.onEntryError((key, registration, error, info) => {
          console.error('[balance] slot entry error in', key, error, info?.abdicated === true ? '(abdicated)' : '')
        })

        // The entry is created through the slot owner (`register`), so it must
        // belong to the declaration-owned effect. One registration per
        // declaration lifetime: the first path to win sets `registered`, and a
        // later declaration change can never add a second pill.
        // `hooks` is a RESERVED compartment of an inject face, not a prop: the
        // renderer deletes it and rewrites each entry into a `use<Name>` prop
        // (bindInjectSources + standardHookPropName). Handing the observable
        // over directly instead keeps the source usable by its own name and
        // lets the component subscribe with useSyncExternalStore.
        const props = () => ({
          balance: source,
          refresh: () => refresh(true),
        })

        const register = () => {
          if (outcome.registered) return undefined
          const dispose = ctx.slots.register({
            name: SLOT,
            id: 'balance',
            order: 1,
            inject: props,
          }, BalancePill)
          outcome.registered = true
          return dispose
        }

        // The documented path: the callback runs synchronously when the seat is
        // already declared, and again on each later declaration, so the entry's
        // lifetime is exactly the seat's.
        try {
          ctx.slots.inject(SLOT, () => register())
        } catch (error) {
          console.error(`[balance] could not subscribe to slot "${SLOT}"`, error)
        }

        // Insurance only: if the seat was declared but the callback never fired
        // (the reason the first attempt registered nothing at all), register
        // through the declaration-owned effect on a short bounded retry rather
        // than dropping the feature silently.
        if (!outcome.registered) {
          const started = Date.now()
          const timer = setInterval(() => {
            outcome.attempts += 1
            if (outcome.registered) {
              clearInterval(timer)
              return
            }
            if (ctx.slots.specDynamic(SLOT) !== undefined) {
              clearInterval(timer)
              ctx.effect(() => register(), 'balance: composer dock registration (fallback)')
              return
            }
            if (Date.now() - started > FALLBACK_MS) {
              clearInterval(timer)
              console.warn(`[balance] slot "${SLOT}" never materialized; the pill stays unregistered`)
            }
          }, FALLBACK_STEP_MS)
        }
      },
    }
  },
})
