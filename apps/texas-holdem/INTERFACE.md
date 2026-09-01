# Texas Hold'em Engine and AI Interfaces

The current app uses a JavaScript AI provider. A later WebAssembly module can
replace only the AI provider without changing the UI.

## AI provider contract

```js
const aiProvider = {
  chooseAction(context) {
    return { type: "call" };
  },
};
```

Allowed action types:

- `fold`
- `check`
- `call`
- `raise`, with optional `raiseTo`

The context passed to `chooseAction(context)` contains:

- `player`
- `players`
- `community`
- `stage`
- `pot`
- `currentBet`
- `toCall`
- `bigBlind`
- `legalActions`
- `evaluateBestHand` for JavaScript providers

`player.hole` contains the acting AI's cards. Other entries in `players` expose
hidden-card placeholders instead of their real hole cards, so JavaScript and
WASM providers receive the same information available to a player at the table.

Providers should return one of the legal actions. The engine validates provider
output and falls back to `check`, `call`, or `fold` if a provider throws or
returns an unavailable action.

`legalActions` exposes raise bounds as total bet targets for the current betting
round:

- `minRaiseTo`
- `maxRaiseTo`
- `defaultRaiseTo`

A player whose remaining stack cannot fund a full minimum raise may still receive
`raise: true` for a short all-in. In that case `minRaiseTo`, `maxRaiseTo`, and
`defaultRaiseTo` are the same all-in target. A short all-in requires responses
from players who still owe chips but does not reopen raising for players who had
already acted.

## WASM adapter shape

`PokerAi.createWasmAiProvider(wasmModule)` expects the WASM JS wrapper to expose:

```js
wasmModule.recommend_action(jsonPayload) -> jsonDecision
```

Example decision JSON:

```json
{ "type": "raise", "raiseTo": 80 }
```

The Rust/WASM layer can start with `recommend_action`, then later add hand
evaluation or Monte Carlo equity simulation behind the same UI.
