# Changelog

All notable changes to the `agentic-dev` plugin are recorded here.

## 0.1.5

### Fixed — lane-enforcement dependency policy (`hooks/enforce-lanes.js`)

- **Non-install package-manager commands are no longer gated by the installer
  lane.** `resolveDependencyDecision` classified the command *after* it had
  already applied the active/installer gate, so `npm run build`, `npm run dev`,
  `npm test`, `npm ls`, etc. were denied for any lane not on
  `dependencies.installers` (default: only `backend-developer`). In a
  frontend-only project the frontend and QA lanes could not build, serve, or
  test at all. The installer/active gate now guards only commands that actually
  install (`npm install`/`ci`/`add`, bare `yarn`, `pnpm add`, …) and the `npx`
  fetch/run path; non-install script runs are allowed for any lane. Every
  existing install and allowlist restriction is preserved.
- **Deny reasons now reach the agent.** The `run()` caller read
  `depDecision.reason` while `resolveDependencyDecision` returns
  `{ deny: <message> }`, so `deny(undefined)` emitted a blank
  `permissionDecisionReason` and blocked agents saw a generic denial with no
  guidance. The caller now passes `depDecision.deny`, so the steering text
  (raise it under OPEN QUESTIONS, the installer lane name, the offending package
  names) reaches the agent.
- Zero-dependency projects: the zero-dep block now also applies only to installs
  and `npx`, so a non-installer running `npm test` / `npm ls` is allowed rather
  than denied with a misleading "package managers are disabled" message.
- Added `hooks/enforce-lanes.test.js` covering non-install allow, installer-lane
  deny, allowlisted install allow, non-allowlisted install deny, npx gating, and
  the deny-reason propagation.
