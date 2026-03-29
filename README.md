# nuvio-providers

Stream providers for the Nuvio app.

## Structure

```
nuvio-providers/
├── providers/          # Ready-to-use provider files
│   └── moviemazic.js
├── src/                # Source files for multi-file providers
├── manifest.json       # Provider registry
├── build.js            # Build script
└── package.json
```

## Providers

| Provider | Type | Source |
|----------|------|--------|
| MovieMazic | Movies + TV | BDIX CDN |

## Setup

```bash
npm install
```

## Building (src providers only)

```bash
# Build all
node build.js

# Build specific
node build.js myprovider

# Watch mode
npm run build:watch
```

## Adding to Nuvio

Point Nuvio to this repo's `manifest.json`.
