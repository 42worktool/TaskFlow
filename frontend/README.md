# TaskFlow frontend

The Vue 3 and TypeScript client for TaskFlow. Project setup, environment
variables, Docker instructions, architecture, features, and contributor
information are documented in the [root README](../README.md).

Use the root Docker Compose instructions for a working application. Running the
Vite server alone starts only the UI; it expects a backend at
`http://localhost:3000` or at `VITE_PROXY_TARGET`, and that backend's
`APP_ORIGIN` must match the Vite browser origin.

To start only that UI process:

```bash
npm ci
npm run dev
```

Checks:

```bash
npm test
npm run build
```
