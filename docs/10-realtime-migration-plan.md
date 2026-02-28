# Realtime Migration Plan: Pusher -> VPS + Cloudflare Gateway

## Goal

Migrate ryOS realtime features off hosted Pusher to a VPS-hosted realtime service, with Cloudflare as the public gateway for WebSocket and HTTP ingress, while keeping user-visible behavior unchanged.

## Scope

### In scope
- Chat realtime events (room list updates, room messages, message deletions).
- Listen Together realtime events (sync, reactions, DJ/session lifecycle).
- Public gateway, TLS termination, WAF/rate controls through Cloudflare.
- Staged cutover with rollback at every phase.

### Out of scope (phase 1)
- Rewriting chat/listen domain event contracts.
- Large UI/UX changes to chat/listen clients.
- Replacing Redis storage in chat APIs.

## Current State (repo-specific)

- Server broadcasts are coupled to Pusher in:
  - `_api/rooms/_helpers/_pusher.ts`
  - `_api/listen/_helpers/_pusher.ts`
  - `_api/pusher/broadcast.ts` (currently unused but present)
- Client subscriptions are coupled to `pusher-js` in:
  - `src/lib/pusherClient.ts`
  - `src/apps/chats/hooks/useChatRoom.ts`
  - `src/hooks/useBackgroundChatNotifications.ts`
  - `src/stores/useListenSessionStore.ts`
- Realtime channels are public (`chats-public`, `chats-{username}`, `room-{roomId}`, `listen-{sessionId}`), with no channel auth endpoint today.

## Target Architecture

Compatibility-first architecture to minimize risk:

1. **Realtime server on VPS**: Run a Pusher-protocol compatible server (recommended: Soketi) with Redis for pub/sub/presence fanout.
2. **Cloudflare gateway**:
   - `rt.os.ryo.lu` (proxied) for WebSocket + publish/auth endpoints.
   - WAF, rate limiting, bot management, TLS, and edge observability.
3. **Origin protection**:
   - Allow only Cloudflare egress to VPS, or use Cloudflare Tunnel.
4. **App/API path**:
   - Existing API remains on Vercel initially.
   - `_api/rooms/*` and `_api/listen/*` publish realtime events to VPS realtime.
5. **Client path**:
   - Browser/Tauri clients connect to `rt.os.ryo.lu` instead of `*.pusher.com`.

## Migration Strategy (phased)

### Phase 0 - Readiness and Baseline (1-2 days)

Deliverables:
- Event inventory and baseline SLO metrics.
- Feature flag plan and rollback runbook.

Tasks:
- Confirm canonical event list for chat/listen (event names + payload schemas).
- Capture current baseline:
  - p50/p95 publish-to-receive latency
  - connection success rate
  - reconnect frequency
  - event drop/duplicate rate
- Add migration flags:
  - `REALTIME_PROVIDER=pusher|vps`
  - `REALTIME_DUAL_PUBLISH=true|false`
- Define rollback trigger thresholds.

Rollback:
- No traffic changes yet.

### Phase 1 - Realtime Abstraction in App/API (2-4 days)

Deliverables:
- Provider-agnostic adapter layer in server and client.
- No behavior change in production (still Pusher-backed).

Tasks:
- Server:
  - Create shared realtime interface (publish, publishBatch, health check).
  - Wrap existing `_api/rooms/_helpers/_pusher.ts` and `_api/listen/_helpers/_pusher.ts` behind provider modules.
  - Keep existing event names and channel naming unchanged.
- Client:
  - Add `realtimeClient` adapter that hides provider details (subscribe/unsubscribe/bind).
  - Migrate `useListenSessionStore.ts` to the same lifecycle helpers used by chats to avoid connection lifecycle drift.
- Config:
  - Replace hardcoded client keys in `src/lib/pusherClient.ts` with env-driven config.

Rollback:
- Keep Pusher as default provider; adapter is transparent.

### Phase 2 - VPS Realtime Environment (2-3 days)

Deliverables:
- HA-ready realtime environment in staging.
- Operational runbooks for restart, deploy, and incident response.

Tasks:
- Provision VPS (or 2 VPS nodes if immediate HA is required).
- Deploy:
  - Soketi service
  - Redis (or managed Redis) for horizontal pub/sub
  - Reverse proxy (Caddy/Nginx) if needed at origin
- Configure:
  - App ID/key/secret parity with existing env naming where practical
  - Connection limits, idle timeout, max payload size
- Add health endpoints and metrics scraping.

Rollback:
- Keep staging-only; no production client traffic.

### Phase 3 - Cloudflare Gateway Setup (1-2 days)

Deliverables:
- Cloudflare-fronted realtime endpoint with secured origin.

Tasks:
- DNS + proxy:
  - Create `rt.os.ryo.lu` as proxied record to VPS origin.
- TLS:
  - Full (strict) mode, minimum TLS 1.2+.
- Security:
  - WAF managed rules + custom rules for abuse patterns.
  - Rate limits on connect and publish endpoints.
  - Firewall/Tunnel to ensure origin is not directly reachable.
- Gateway policy:
  - Pass `cf-connecting-ip` and request IDs through logs for traceability.

Rollback:
- Keep DNS route disabled for clients; use staging hostname only.

### Phase 4 - Shadow Traffic and Dual Publish (3-5 days)

Deliverables:
- VPS realtime receives production-equivalent traffic without user-facing cutover.

Tasks:
- Enable `REALTIME_DUAL_PUBLISH=true` in APIs:
  - Continue publishing to Pusher.
  - Also publish same events to VPS realtime.
- Compare streams:
  - Per-event parity checks (count, payload hash, ordering windows).
  - Measure latency deltas and delivery gaps.
- Fix parity issues before canary.

Rollback:
- Disable dual publish flag; continue Pusher-only instantly.

### Phase 5 - Canary Cutover (2-4 days)

Deliverables:
- Incremental client migration with measurable success criteria.

Tasks:
- Route a small cohort (internal users -> 5% -> 25% -> 50%) to VPS realtime provider via config flag.
- Keep APIs dual-publishing during canary for safety.
- Monitor:
  - websocket connect success
  - reconnect spikes
  - event latency and drop rate
  - chat/listen error rates
- Promote only if all thresholds pass for a full business day per stage.

Rollback:
- Toggle canary cohort back to Pusher provider within minutes.

### Phase 6 - Full Cutover and Decommission (1-2 days)

Deliverables:
- 100% realtime traffic on VPS+Cloudflare.
- Pusher dependencies and secrets removed.

Tasks:
- Set default provider to VPS for all environments.
- Run for 72 hours with dual publish still enabled for safety.
- Disable dual publish, then remove Pusher code paths:
  - `pusher` / `pusher-js` dependencies
  - obsolete env vars (`PUSHER_*`) after final freeze period
  - stale endpoint (`_api/pusher/broadcast.ts`) if still unused
- Update docs, ops runbooks, and on-call playbooks.

Rollback:
- Re-enable Pusher provider and dual publish from preserved config for agreed rollback window.

## Security Hardening Plan (recommended during migration)

- Move from public channels to authenticated private/presence channels:
  - Add `/api/realtime/auth` signed auth endpoint.
  - Require auth for user/room/listen channels.
- Rotate secrets during final cutover.
- Add replay protection for publish/auth signatures.
- Add abuse controls per IP/user/session at Cloudflare and API layers.

## Testing & Validation Gates

Each phase must pass before promotion:

- **Contract tests**: event payload schema parity (Pusher vs VPS).
- **Integration tests**: room create/update/delete, message send/delete, listen sync/reaction/session-end.
- **Load tests**: expected concurrent WebSocket count + burst publish.
- **Failure drills**:
  - VPS realtime restart during active sessions
  - Redis restart/failover
  - Cloudflare route toggle and origin fail scenarios

## Operational SLOs and Alerts

Set initial targets:

- WebSocket connect success rate: `>= 99.9%`
- Publish-to-receive p95 latency: `<= 400ms`
- Unexpected reconnect rate: `< 1%/hour`
- Event loss (post-dedup verification): `< 0.01%`

Alerts:
- connect success below threshold for 5 minutes
- p95 latency above threshold for 10 minutes
- event mismatch in dual-publish comparator

## Concrete Repo Execution Checklist

1. Add server-side provider abstraction in `_api/rooms/_helpers` and `_api/listen/_helpers`.
2. Add client-side provider abstraction replacing direct `pusher-js` coupling in `src/lib/pusherClient.ts`.
3. Unify subscription lifecycle usage in `useListenSessionStore.ts`, `useChatRoom.ts`, and background notifications.
4. Add env-based realtime config for web + API + Tauri CSP update.
5. Add/expand tests:
   - provider adapter unit tests
   - chat/listen wiring tests
   - connection lifecycle tests
6. Execute dual-publish and canary rollout playbooks.

## Suggested Timeline

- Week 1: Phase 0 + Phase 1
- Week 2: Phase 2 + Phase 3
- Week 3: Phase 4 (shadow + parity fixes)
- Week 4: Phase 5 + Phase 6 (canary -> full cutover)

## Decision Log

- **Why Soketi first?** Fastest path off Pusher with least code churn by preserving protocol and event contracts.
- **Why Cloudflare gateway?** Centralized edge security, TLS, DDoS mitigation, and controlled ingress before origin.
- **Why dual-publish?** Safest validation path with real production traffic before irreversible cutover.
