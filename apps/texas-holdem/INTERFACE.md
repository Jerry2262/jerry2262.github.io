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
