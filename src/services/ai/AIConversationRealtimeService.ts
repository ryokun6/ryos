import type { ChatStatus } from "ai";
import {
  AI_CONVERSATION_REALTIME_EVENT,
  parseAIConversationRealtimeEvent,
  type AIConversationRealtimeEvent,
  type AIConversationRealtimeTurn,
} from "@/shared/contracts/aiConversationRealtime";
import { getChatsUserChannelName } from "@/shared/constants/realtime";
import type { AIChatMessage } from "@/types/chat";
import {
  invalidateAIConversationSession,
  isLocalAIConversationOperation,
  type AIConversationHydration,
} from "@/api/aiConversations";
import {
  refreshRealtimeAuthentication,
  subscribePusherChannel,
  subscribeRealtimeConnection,
  unsubscribePusherChannel,
  type PusherChannel,
} from "@/lib/pusherClient";
import { createClientLogger } from "@/utils/logger";
import {
  applyRemoteAIConversationStreamEvent,
  createRemoteAIConversationStream,
  isSameRemoteAIConversationTurn,
  type AIConversationRealtimeStreamEvent,
  type RemoteAIConversationStream,
} from "./aiConversationRealtimeReducer";

const MAX_QUEUED_STREAM_EVENTS = 256;
const REMOTE_TURN_WATCHDOG_MS = 95_000;
const RECONNECT_CATCH_UP_DELAY_MS = 500;
const STREAM_REORDER_GRACE_MS = 1_000;
const RECOVERY_RETRY_BASE_MS = 500;
const RECOVERY_RETRY_MAX_MS = 5_000;

export interface AIConversationRealtimeController {
  getStatus: () => ChatStatus;
  getMessages: () => AIChatMessage[];
  setMessages: (messages: AIChatMessage[]) => void;
  load: () => Promise<AIConversationHydration>;
  commit: (loaded: AIConversationHydration) => boolean;
  stop: () => void;
  clearError: () => void;
}

interface Registration {
  owner: string;
  priority: number;
  order: number;
  controller: AIConversationRealtimeController;
}

interface ActiveRemoteTurn {
  stream: RemoteAIConversationStream;
  baseReady: boolean;
  gapped: boolean;
  terminalReceived: boolean;
  queuedEvents: Map<number, AIConversationRealtimeStreamEvent>;
  reorderTimer: ReturnType<typeof setTimeout> | null;
}

interface TurnWatermark
  extends Pick<
    AIConversationRealtimeTurn,
    "conversationId" | "operationId" | "revision" | "startedAt"
  > {
  terminal: boolean;
}

type AIConversationRealtimeTurnEvent = Exclude<
  AIConversationRealtimeEvent,
  { kind: "conversation-updated" }
>;

export class AIConversationRealtimeService {
  private readonly registrations = new Map<symbol, Registration>();
  private readonly listeners = new Set<() => void>();
  private readonly log: ReturnType<typeof createClientLogger>;
  private registrationOrder = 0;
  private activeRegistration: Registration | null = null;
  private realtimeChannel: PusherChannel | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private activeRemoteTurn: ActiveRemoteTurn | null = null;
  private latestTurnWatermark: TurnWatermark | null = null;
  private refreshGeneration = 0;
  private pendingRefresh = false;
  private remoteStreaming = false;
  private turnWatchdog: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptionCatchUpTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryAttempt = 0;
  private authoritativeConversationId: string | null = null;
  private authoritativeRevision = 0;
  private readonly rejectedConversationIds = new Set<string>();
  private quarantinedEvents: AIConversationRealtimeTurnEvent[] = [];
  private quarantineRefreshPending = false;

  constructor(
    private readonly channel: AIConversationRealtimeTurn["channel"]
  ) {
    this.log = createClientLogger(
      channel === "chat"
        ? "ChatConversationRealtime"
        : "AssistantConversationRealtime"
    );
  }

  readonly getSnapshot = (): boolean => this.remoteStreaming;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  register({
    owner,
    priority,
    controller,
  }: {
    owner: string;
    priority: number;
    controller: AIConversationRealtimeController;
  }): () => void {
    const token = Symbol(`${this.channel}:${owner}`);
    this.registrationOrder += 1;
    this.registrations.set(token, {
      owner: owner.toLowerCase(),
      priority,
      order: this.registrationOrder,
      controller,
    });
    this.reconcileRegistration();
    return () => {
      this.registrations.delete(token);
      this.reconcileRegistration();
    };
  }

  notifyStatusChanged(): void {
    const registration = this.activeRegistration;
    if (
      !registration ||
      (!this.activeRemoteTurn && !this.pendingRefresh) ||
      !this.prepareControllerForRemoteUpdate(registration)
    ) {
      return;
    }
    if (this.activeRemoteTurn) {
      if (this.activeRemoteTurn.gapped) {
        void this.refreshCanonical();
        return;
      }
      if (!this.activeRemoteTurn.baseReady) {
        void this.hydrateRemoteBase(this.activeRemoteTurn);
        return;
      }
    }
    if (this.pendingRefresh) {
      void this.refreshCanonical();
    }
  }

  notifyLocalReset(conversation: {
    id: string;
    revision: number;
  }): void {
    this.activeRegistration?.controller.stop();
    this.setAuthoritativeConversation(
      conversation.id,
      conversation.revision
    );
    this.latestTurnWatermark = null;
    this.resetRecoveryRetry();
    this.clearActiveRemoteTurn();
    this.pendingRefresh = false;
  }

  destroy(): void {
    this.registrations.clear();
    this.disconnect();
    this.listeners.clear();
  }

  private setRemoteStreaming(value: boolean): void {
    if (this.remoteStreaming === value) return;
    this.remoteStreaming = value;
    this.listeners.forEach((listener) => listener());
  }

  private prepareControllerForRemoteUpdate(
    registration: Registration
  ): boolean {
    const status = registration.controller.getStatus();
    if (status === "error") {
      registration.controller.clearError();
      return true;
    }
    return status === "ready";
  }

  private scheduleSubscriptionCatchUp(delay = 0): void {
    if (this.subscriptionCatchUpTimer) {
      clearTimeout(this.subscriptionCatchUpTimer);
    }
    this.subscriptionCatchUpTimer = setTimeout(() => {
      this.subscriptionCatchUpTimer = null;
      const active = this.activeRemoteTurn;
      if (active && !active.baseReady && !active.gapped) {
        void this.hydrateRemoteBase(active);
        return;
      }
      void this.refreshCanonical();
    }, delay);
  }

  private readonly handleSubscriptionSucceeded = (): void => {
    this.scheduleSubscriptionCatchUp();
  };

  private resetRecoveryRetry(): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.recoveryAttempt = 0;
  }

  private scheduleRecoveryRetry(): void {
    this.pendingRefresh = true;
    if (this.recoveryTimer) return;
    const delay = Math.min(
      RECOVERY_RETRY_BASE_MS * 2 ** this.recoveryAttempt,
      RECOVERY_RETRY_MAX_MS
    );
    this.recoveryAttempt += 1;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.quarantinedEvents.length > 0) {
        this.requestQuarantineValidation();
        return;
      }
      const active = this.activeRemoteTurn;
      if (active && !active.baseReady && !active.gapped) {
        void this.hydrateRemoteBase(active);
      } else {
        void this.refreshCanonical();
      }
    }, delay);
  }

  private setAuthoritativeConversation(id: string, revision: number): void {
    const previousId = this.authoritativeConversationId;
    if (previousId && previousId !== id) {
      this.rejectedConversationIds.add(previousId);
    }
    this.authoritativeConversationId = id;
    this.authoritativeRevision =
      previousId === id ? Math.max(this.authoritativeRevision, revision) : revision;
    this.rejectedConversationIds.delete(id);
    while (this.rejectedConversationIds.size > 16) {
      const oldest = this.rejectedConversationIds.values().next().value;
      if (typeof oldest !== "string") break;
      this.rejectedConversationIds.delete(oldest);
    }
  }

  private quarantineCrossConversationEvent(
    event: AIConversationRealtimeTurnEvent
  ): void {
    if (this.rejectedConversationIds.has(event.conversationId)) return;
    if (this.quarantinedEvents.length >= MAX_QUEUED_STREAM_EVENTS) {
      this.quarantinedEvents.shift();
    }
    this.quarantinedEvents.push(event);
    this.requestQuarantineValidation();
  }

  private requestQuarantineValidation(): void {
    if (
      this.quarantineRefreshPending ||
      this.quarantinedEvents.length === 0
    ) {
      return;
    }
    this.quarantineRefreshPending = true;
    void this.refreshCanonical().then((refreshed) => {
      this.quarantineRefreshPending = false;
      if (!refreshed) {
        if (this.activeRegistration && this.quarantinedEvents.length > 0) {
          this.scheduleRecoveryRetry();
        }
        return;
      }
      const authoritativeId = this.authoritativeConversationId;
      const queued = this.quarantinedEvents;
      this.quarantinedEvents = [];
      for (const event of queued) {
        if (event.conversationId === authoritativeId) {
          this.dispatchRealtimeEvent(event);
        } else {
          this.rejectedConversationIds.add(event.conversationId);
        }
      }
    });
  }

  private getPreferredRegistration(): Registration | null {
    let preferred: Registration | null = null;
    for (const registration of this.registrations.values()) {
      if (
        !preferred ||
        registration.priority > preferred.priority ||
        (registration.priority === preferred.priority &&
          registration.order > preferred.order)
      ) {
        preferred = registration;
      }
    }
    return preferred;
  }

  private reconcileRegistration(): void {
    const preferred = this.getPreferredRegistration();
    if (!preferred) {
      this.disconnect();
      return;
    }

    const previousRegistration = this.activeRegistration;
    const ownerChanged =
      this.activeRegistration?.owner.toLowerCase() !==
      preferred.owner.toLowerCase();
    this.activeRegistration = preferred;
    if (!ownerChanged && this.realtimeChannel) {
      if (
        previousRegistration !== preferred &&
        this.activeRemoteTurn &&
        !this.activeRemoteTurn.baseReady
      ) {
        this.refreshGeneration += 1;
        void this.hydrateRemoteBase(this.activeRemoteTurn);
      }
      return;
    }

    this.disconnectRealtimeChannel();
    refreshRealtimeAuthentication();
    const channelName = getChatsUserChannelName(preferred.owner);
    const realtimeChannel = subscribePusherChannel(channelName);
    realtimeChannel.bind(
      AI_CONVERSATION_REALTIME_EVENT,
      this.handleRealtimePayload
    );
    realtimeChannel.bind(
      "pusher:subscription_succeeded",
      this.handleSubscriptionSucceeded
    );
    this.realtimeChannel = realtimeChannel;
    this.unsubscribeConnection = subscribeRealtimeConnection((state) => {
      if (state !== "connected" && this.activeRemoteTurn) {
        this.markActiveRemoteTurnGapped(this.activeRemoteTurn);
        return;
      }
      if (state === "connected") {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          const active = this.activeRemoteTurn;
          if (active) {
            if (active.gapped) {
              void this.refreshCanonical();
            } else if (!active.baseReady) {
              void this.hydrateRemoteBase(active);
            }
            return;
          }
          void this.refreshCanonical();
        }, RECONNECT_CATCH_UP_DELAY_MS);
      }
    });
    this.scheduleSubscriptionCatchUp(RECONNECT_CATCH_UP_DELAY_MS);
  }

  private disconnectRealtimeChannel(): void {
    this.refreshGeneration += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.subscriptionCatchUpTimer) {
      clearTimeout(this.subscriptionCatchUpTimer);
    }
    this.subscriptionCatchUpTimer = null;
    this.resetRecoveryRetry();
    this.unsubscribeConnection?.();
    this.unsubscribeConnection = null;
    const realtimeChannel = this.realtimeChannel;
    if (realtimeChannel) {
      realtimeChannel.unbind(
        AI_CONVERSATION_REALTIME_EVENT,
        this.handleRealtimePayload
      );
      realtimeChannel.unbind(
        "pusher:subscription_succeeded",
        this.handleSubscriptionSucceeded
      );
      unsubscribePusherChannel(realtimeChannel.name);
    }
    this.realtimeChannel = null;
    this.clearActiveRemoteTurn();
    this.latestTurnWatermark = null;
    this.authoritativeConversationId = null;
    this.authoritativeRevision = 0;
    this.rejectedConversationIds.clear();
    this.quarantinedEvents = [];
    this.quarantineRefreshPending = false;
    this.pendingRefresh = false;
  }

  private disconnect(): void {
    this.disconnectRealtimeChannel();
    this.activeRegistration = null;
  }

  private clearActiveRemoteTurn(): void {
    if (this.turnWatchdog) clearTimeout(this.turnWatchdog);
    this.turnWatchdog = null;
    const active = this.activeRemoteTurn;
    if (active?.reorderTimer) clearTimeout(active.reorderTimer);
    this.activeRemoteTurn = null;
    this.setRemoteStreaming(false);
  }

  private beginActiveRemoteTurn(
    event: AIConversationRealtimeTurn
  ): ActiveRemoteTurn {
    this.clearActiveRemoteTurn();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.resetRecoveryRetry();
    const active: ActiveRemoteTurn = {
      stream: createRemoteAIConversationStream(event),
      baseReady: false,
      gapped: false,
      terminalReceived: false,
      queuedEvents: new Map(),
      reorderTimer: null,
    };
    this.activeRemoteTurn = active;
    this.latestTurnWatermark = {
      conversationId: event.conversationId,
      operationId: event.operationId,
      revision: event.revision,
      startedAt: event.startedAt,
      terminal: false,
    };
    this.setRemoteStreaming(true);
    this.turnWatchdog = setTimeout(() => {
      if (this.activeRemoteTurn !== active) return;
      this.log.warn("Remote conversation stream timed out");
      this.recoverActiveRemoteTurn();
    }, REMOTE_TURN_WATCHDOG_MS);
    return active;
  }

  private recoverActiveRemoteTurn(): void {
    this.resetRecoveryRetry();
    this.clearActiveRemoteTurn();
    this.pendingRefresh = true;
    void this.refreshCanonical();
  }

  private clearReorderTimer(active: ActiveRemoteTurn): void {
    if (active.reorderTimer) clearTimeout(active.reorderTimer);
    active.reorderTimer = null;
  }

  private updateReorderDeadline(active: ActiveRemoteTurn): void {
    if (
      active.gapped ||
      active.queuedEvents.size === 0 ||
      active.queuedEvents.has(active.stream.nextSequence)
    ) {
      this.clearReorderTimer(active);
      return;
    }
    if (active.reorderTimer) return;
    active.reorderTimer = setTimeout(() => {
      active.reorderTimer = null;
      if (
        this.activeRemoteTurn === active &&
        !active.gapped &&
        active.queuedEvents.size > 0 &&
        !active.queuedEvents.has(active.stream.nextSequence)
      ) {
        this.log.warn("Remote conversation stream sequence timed out");
        this.markActiveRemoteTurnGapped(active);
      }
    }, STREAM_REORDER_GRACE_MS);
  }

  private markActiveRemoteTurnGapped(active: ActiveRemoteTurn): void {
    if (this.activeRemoteTurn !== active) return;
    if (active.gapped) {
      this.scheduleRecoveryRetry();
      return;
    }
    active.gapped = true;
    active.queuedEvents.clear();
    this.clearReorderTimer(active);
    this.pendingRefresh = true;
    void this.refreshCanonical();
  }

  private shouldAcceptTurn(
    event: AIConversationRealtimeTurn,
    terminal = false
  ): boolean {
    const watermark = this.latestTurnWatermark;
    if (!watermark || watermark.conversationId !== event.conversationId) {
      return true;
    }
    if (watermark.operationId === event.operationId) {
      return terminal
        ? event.revision >= watermark.revision
        : !watermark.terminal;
    }
    if (event.revision !== watermark.revision) {
      return event.revision > watermark.revision;
    }
    return event.startedAt > watermark.startedAt;
  }

  private updateTurnWatermark(
    event: AIConversationRealtimeTurn,
    terminal = false
  ): void {
    this.latestTurnWatermark = {
      conversationId: event.conversationId,
      operationId: event.operationId,
      revision: event.revision,
      startedAt: event.startedAt,
      terminal,
    };
  }

  private readonly handleRealtimePayload = (payload: unknown): void => {
    const event = parseAIConversationRealtimeEvent(payload);
    const registration = this.activeRegistration;
    if (
      !event ||
      !registration ||
      event.channel !== this.channel
    ) {
      return;
    }
    if (
      isLocalAIConversationOperation(
        this.channel,
        registration.owner,
        event.operationId
      )
    ) {
      return;
    }

    if (event.kind !== "conversation-updated") {
      const expectedConversationId =
        this.authoritativeConversationId ??
        this.activeRemoteTurn?.stream.turn.conversationId ??
        null;
      if (
        expectedConversationId &&
        event.conversationId !== expectedConversationId
      ) {
        this.quarantineCrossConversationEvent(event);
        return;
      }
    }
    this.dispatchRealtimeEvent(event);
  };

  private dispatchRealtimeEvent(event: AIConversationRealtimeEvent): void {
    switch (event.kind) {
      case "turn-started":
        this.handleTurnStarted(event);
        return;
      case "stream-chunks":
        this.handleStreamChunks(event);
        return;
      case "turn-finished":
        this.handleTurnFinished(event);
        return;
      case "conversation-updated":
        this.handleConversationUpdated(event);
        return;
      default: {
        const exhaustive: never = event;
        return exhaustive;
      }
    }
  }

  private handleTurnStarted(event: AIConversationRealtimeTurn): void {
    const registration = this.activeRegistration;
    if (!registration) return;
    if (
      this.activeRemoteTurn &&
      isSameRemoteAIConversationTurn(this.activeRemoteTurn.stream, event)
    ) {
      return;
    }
    if (!this.shouldAcceptTurn(event)) return;
    if (!this.prepareControllerForRemoteUpdate(registration)) {
      this.pendingRefresh = true;
      return;
    }

    const active = this.beginActiveRemoteTurn(event);
    void this.hydrateRemoteBase(active);
  }

  private handleStreamChunks(event: AIConversationRealtimeStreamEvent): void {
    const registration = this.activeRegistration;
    if (!registration) return;
    if (!this.prepareControllerForRemoteUpdate(registration)) {
      this.pendingRefresh = true;
      return;
    }

    let active = this.activeRemoteTurn;
    if (
      active?.terminalReceived &&
      isSameRemoteAIConversationTurn(active.stream, event)
    ) {
      return;
    }
    if (!active || !isSameRemoteAIConversationTurn(active.stream, event)) {
      if (!this.shouldAcceptTurn(event)) return;
      active = this.beginActiveRemoteTurn(event);
      void this.hydrateRemoteBase(active);
    }

    this.bufferStreamEvent(active, event);
    if (active.baseReady) this.replayQueuedEvents(active);
  }

  private handleTurnFinished(
    event: Extract<AIConversationRealtimeEvent, { kind: "turn-finished" }>
  ): void {
    const matchesActive =
      this.activeRemoteTurn !== null &&
      isSameRemoteAIConversationTurn(this.activeRemoteTurn.stream, event);
    if (!matchesActive && !this.shouldAcceptTurn(event, true)) return;
    this.updateTurnWatermark(event, true);
    this.resetRecoveryRetry();
    if (matchesActive && this.activeRemoteTurn) {
      this.activeRemoteTurn.terminalReceived = true;
      this.clearReorderTimer(this.activeRemoteTurn);
    } else if (this.activeRemoteTurn) {
      this.clearActiveRemoteTurn();
    }
    void this.refreshCanonical();
  }

  private handleConversationUpdated(
    event: Extract<AIConversationRealtimeEvent, { kind: "conversation-updated" }>
  ): void {
    const watermark = this.latestTurnWatermark;
    if (
      event.reason === "imported" &&
      watermark?.conversationId === event.conversationId &&
      event.revision < watermark.revision
    ) {
      return;
    }
    if (event.reason === "reset") {
      this.activeRegistration?.controller.stop();
    }
    this.setAuthoritativeConversation(event.conversationId, event.revision);
    this.latestTurnWatermark = null;
    this.resetRecoveryRetry();
    this.clearActiveRemoteTurn();
    void this.refreshCanonical();
  }

  private bufferStreamEvent(
    active: ActiveRemoteTurn,
    event: AIConversationRealtimeStreamEvent
  ): void {
    if (active.gapped) return;
    if (event.sequence < active.stream.nextSequence) return;
    if (
      !active.queuedEvents.has(event.sequence) &&
      active.queuedEvents.size >= MAX_QUEUED_STREAM_EVENTS
    ) {
      this.markActiveRemoteTurnGapped(active);
      return;
    }
    active.queuedEvents.set(event.sequence, event);
    this.updateReorderDeadline(active);
  }

  private applyStreamEvent(
    active: ActiveRemoteTurn,
    event: AIConversationRealtimeStreamEvent,
    messages: readonly AIChatMessage[]
  ): AIChatMessage[] | null {
    if (active.gapped) return null;
    const controller = this.activeRegistration?.controller;
    if (!controller) return null;
    const result = applyRemoteAIConversationStreamEvent({
      stream: active.stream,
      event,
      messages,
    });
    if (result.kind === "gap") {
      this.markActiveRemoteTurnGapped(active);
      return null;
    }
    active.stream = result.stream;
    return result.messages;
  }

  private replayQueuedEvents(active: ActiveRemoteTurn): void {
    const controller = this.activeRegistration?.controller;
    if (!controller || active.gapped) return;
    let messages = controller.getMessages();
    let applied = false;
    while (true) {
      const event = active.queuedEvents.get(active.stream.nextSequence);
      if (!event) break;
      active.queuedEvents.delete(active.stream.nextSequence);
      const nextMessages = this.applyStreamEvent(active, event, messages);
      if (!nextMessages) return;
      messages = nextMessages;
      applied = true;
    }
    this.updateReorderDeadline(active);
    if (applied) controller.setMessages(messages);
  }

  private async hydrateRemoteBase(active: ActiveRemoteTurn): Promise<void> {
    const registration = this.activeRegistration;
    if (!registration || this.activeRemoteTurn !== active) {
      return;
    }
    if (active.gapped) {
      void this.refreshCanonical();
      return;
    }
    if (!this.prepareControllerForRemoteUpdate(registration)) {
      this.scheduleRecoveryRetry();
      return;
    }

    const generation = ++this.refreshGeneration;
    this.pendingRefresh = false;
    invalidateAIConversationSession(this.channel, registration.owner);
    try {
      const loaded = await registration.controller.load();
      if (
        generation !== this.refreshGeneration ||
        this.activeRemoteTurn !== active ||
        this.activeRegistration !== registration
      ) {
        return;
      }
      if (loaded.stale) {
        this.scheduleRecoveryRetry();
        return;
      }
      if (
        loaded.conversation.id !== active.stream.turn.conversationId ||
        loaded.conversation.revision > active.stream.turn.revision
      ) {
        if (!registration.controller.commit(loaded)) {
          this.scheduleRecoveryRetry();
          return;
        }
        this.resetRecoveryRetry();
        this.setAuthoritativeConversation(
          loaded.conversation.id,
          loaded.conversation.revision
        );
        this.latestTurnWatermark = {
          ...active.stream.turn,
          conversationId: loaded.conversation.id,
          revision: loaded.conversation.revision,
          terminal: true,
        };
        this.clearActiveRemoteTurn();
        return;
      }
      if (loaded.conversation.revision < active.stream.turn.revision) {
        this.scheduleRecoveryRetry();
        return;
      }
      if (!registration.controller.commit(loaded)) {
        this.scheduleRecoveryRetry();
        return;
      }
      this.resetRecoveryRetry();
      this.setAuthoritativeConversation(
        loaded.conversation.id,
        loaded.conversation.revision
      );
      active.baseReady = true;
      this.replayQueuedEvents(active);
    } catch (error) {
      if (
        generation === this.refreshGeneration &&
        this.activeRemoteTurn === active &&
        this.activeRegistration === registration
      ) {
        this.scheduleRecoveryRetry();
      }
      this.log.warn("Failed to hydrate a remote conversation turn", { error });
    }
  }

  private minimumCanonicalRevision(conversationId: string): number {
    let minimum =
      this.authoritativeConversationId === conversationId
        ? this.authoritativeRevision
        : 0;
    const active = this.activeRemoteTurn;
    if (active?.stream.turn.conversationId === conversationId) {
      minimum = Math.max(minimum, active.stream.turn.revision);
    }
    const watermark = this.latestTurnWatermark;
    if (
      watermark?.terminal &&
      watermark.conversationId === conversationId
    ) {
      minimum = Math.max(minimum, watermark.revision);
    }
    return minimum;
  }

  private async refreshCanonical(): Promise<boolean> {
    const registration = this.activeRegistration;
    if (!registration) return false;
    if (!this.prepareControllerForRemoteUpdate(registration)) {
      this.scheduleRecoveryRetry();
      return false;
    }
    const generation = ++this.refreshGeneration;
    this.pendingRefresh = false;
    invalidateAIConversationSession(this.channel, registration.owner);
    try {
      const loaded = await registration.controller.load();
      if (
        generation !== this.refreshGeneration ||
        this.activeRegistration !== registration
      ) {
        return false;
      }
      if (loaded.stale) {
        this.scheduleRecoveryRetry();
        return false;
      }
      const active = this.activeRemoteTurn;
      if (
        loaded.conversation.revision <
        this.minimumCanonicalRevision(loaded.conversation.id)
      ) {
        this.scheduleRecoveryRetry();
        return false;
      }
      if (
        active &&
        !active.gapped &&
        active.baseReady &&
        !active.terminalReceived &&
        loaded.conversation.id === active.stream.turn.conversationId &&
        loaded.conversation.revision === active.stream.turn.revision
      ) {
        this.setAuthoritativeConversation(
          loaded.conversation.id,
          loaded.conversation.revision
        );
        this.resetRecoveryRetry();
        return true;
      }
      if (!registration.controller.commit(loaded)) {
        this.scheduleRecoveryRetry();
        return false;
      }
      this.setAuthoritativeConversation(
        loaded.conversation.id,
        loaded.conversation.revision
      );
      if (
        active &&
        (active.terminalReceived ||
          loaded.conversation.id !== active.stream.turn.conversationId ||
          loaded.conversation.revision > active.stream.turn.revision)
      ) {
        this.latestTurnWatermark = {
          ...active.stream.turn,
          conversationId: loaded.conversation.id,
          revision: loaded.conversation.revision,
          terminal: true,
        };
        this.resetRecoveryRetry();
        this.clearActiveRemoteTurn();
      } else if (active?.gapped) {
        this.scheduleRecoveryRetry();
      } else {
        this.resetRecoveryRetry();
      }
      return true;
    } catch (error) {
      if (
        generation === this.refreshGeneration &&
        this.activeRegistration === registration
      ) {
        this.scheduleRecoveryRetry();
      }
      this.log.warn("Failed to refresh the realtime conversation", { error });
      return false;
    }
  }
}
