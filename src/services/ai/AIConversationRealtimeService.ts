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

export interface AIConversationRealtimeController {
  getStatus: () => ChatStatus;
  getMessages: () => AIChatMessage[];
  setMessages: (messages: AIChatMessage[]) => void;
  load: () => Promise<AIConversationHydration>;
  commit: (loaded: AIConversationHydration) => boolean;
  stop: () => void;
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
  queuedEvents: Map<number, AIConversationRealtimeStreamEvent>;
}

type TurnWatermark = Pick<
  AIConversationRealtimeTurn,
  "conversationId" | "operationId" | "revision" | "startedAt"
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
  private currentConversationId: string | null = null;
  private refreshGeneration = 0;
  private pendingRefresh = false;
  private remoteStreaming = false;
  private turnWatchdog: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (!registration || registration.controller.getStatus() !== "ready") return;
    if (this.activeRemoteTurn && !this.activeRemoteTurn.baseReady) {
      void this.hydrateRemoteBase(this.activeRemoteTurn);
      return;
    }
    if (this.pendingRefresh) {
      void this.refreshCanonical();
    }
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
    const channelName = getChatsUserChannelName(preferred.owner);
    const realtimeChannel = subscribePusherChannel(channelName);
    realtimeChannel.bind(
      AI_CONVERSATION_REALTIME_EVENT,
      this.handleRealtimePayload
    );
    this.realtimeChannel = realtimeChannel;
    this.unsubscribeConnection = subscribeRealtimeConnection((state) => {
      if (state === "disconnected" && this.activeRemoteTurn) {
        this.recoverActiveRemoteTurn();
        return;
      }
      if (state === "connected") {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (this.activeRemoteTurn && !this.activeRemoteTurn.baseReady) {
            void this.hydrateRemoteBase(this.activeRemoteTurn);
          } else {
            void this.refreshCanonical();
          }
        }, RECONNECT_CATCH_UP_DELAY_MS);
      }
    });
  }

  private disconnectRealtimeChannel(): void {
    this.refreshGeneration += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.unsubscribeConnection?.();
    this.unsubscribeConnection = null;
    const realtimeChannel = this.realtimeChannel;
    if (realtimeChannel) {
      realtimeChannel.unbind(
        AI_CONVERSATION_REALTIME_EVENT,
        this.handleRealtimePayload
      );
      unsubscribePusherChannel(realtimeChannel.name);
    }
    this.realtimeChannel = null;
    this.clearActiveRemoteTurn();
    this.latestTurnWatermark = null;
    this.currentConversationId = null;
    this.pendingRefresh = false;
  }

  private disconnect(): void {
    this.disconnectRealtimeChannel();
    this.activeRegistration = null;
  }

  private clearActiveRemoteTurn(): void {
    if (this.turnWatchdog) clearTimeout(this.turnWatchdog);
    this.turnWatchdog = null;
    this.activeRemoteTurn = null;
    this.setRemoteStreaming(false);
  }

  private beginActiveRemoteTurn(
    event: AIConversationRealtimeTurn
  ): ActiveRemoteTurn {
    this.clearActiveRemoteTurn();
    const active: ActiveRemoteTurn = {
      stream: createRemoteAIConversationStream(event),
      baseReady: false,
      gapped: false,
      queuedEvents: new Map(),
    };
    this.activeRemoteTurn = active;
    this.currentConversationId = event.conversationId;
    this.latestTurnWatermark = {
      conversationId: event.conversationId,
      operationId: event.operationId,
      revision: event.revision,
      startedAt: event.startedAt,
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
    this.clearActiveRemoteTurn();
    this.pendingRefresh = true;
    void this.refreshCanonical();
  }

  private shouldAcceptTurn(event: AIConversationRealtimeTurn): boolean {
    if (
      this.currentConversationId &&
      event.conversationId !== this.currentConversationId
    ) {
      return false;
    }
    const watermark = this.latestTurnWatermark;
    if (!watermark || watermark.conversationId !== event.conversationId) {
      return true;
    }
    if (watermark.operationId === event.operationId) return true;
    if (event.revision !== watermark.revision) {
      return event.revision > watermark.revision;
    }
    return event.startedAt > watermark.startedAt;
  }

  private updateTurnWatermark(event: AIConversationRealtimeTurn): void {
    this.currentConversationId = event.conversationId;
    this.latestTurnWatermark = {
      conversationId: event.conversationId,
      operationId: event.operationId,
      revision: event.revision,
      startedAt: event.startedAt,
    };
  }

  private readonly handleRealtimePayload = (payload: unknown): void => {
    const event = parseAIConversationRealtimeEvent(payload);
    const registration = this.activeRegistration;
    if (
      !event ||
      !registration ||
      event.channel !== this.channel ||
      isLocalAIConversationOperation(
        this.channel,
        registration.owner,
        event.operationId
      )
    ) {
      return;
    }

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
  };

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
    if (registration.controller.getStatus() !== "ready") {
      this.pendingRefresh = true;
      return;
    }

    const active = this.beginActiveRemoteTurn(event);
    void this.hydrateRemoteBase(active);
  }

  private handleStreamChunks(event: AIConversationRealtimeStreamEvent): void {
    const registration = this.activeRegistration;
    if (!registration) return;
    if (registration.controller.getStatus() !== "ready") {
      this.pendingRefresh = true;
      return;
    }

    let active = this.activeRemoteTurn;
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
    if (!matchesActive && !this.shouldAcceptTurn(event)) return;
    this.updateTurnWatermark(event);
    if (matchesActive || this.activeRemoteTurn) this.clearActiveRemoteTurn();
    void this.refreshCanonical();
  }

  private handleConversationUpdated(
    event: Extract<AIConversationRealtimeEvent, { kind: "conversation-updated" }>
  ): void {
    if (event.reason === "reset") {
      this.activeRegistration?.controller.stop();
      this.latestTurnWatermark = null;
    }
    this.currentConversationId = event.conversationId;
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
      active.queuedEvents.clear();
      active.gapped = true;
      this.pendingRefresh = true;
      void this.refreshCanonical();
      return;
    }
    active.queuedEvents.set(event.sequence, event);
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
      active.gapped = true;
      this.pendingRefresh = true;
      void this.refreshCanonical();
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
    if (applied) controller.setMessages(messages);
  }

  private async hydrateRemoteBase(active: ActiveRemoteTurn): Promise<void> {
    const registration = this.activeRegistration;
    if (
      !registration ||
      registration.controller.getStatus() !== "ready" ||
      this.activeRemoteTurn !== active
    ) {
      this.pendingRefresh = true;
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
        this.activeRegistration !== registration ||
        loaded.stale
      ) {
        return;
      }
      if (
        loaded.conversation.id !== active.stream.turn.conversationId ||
        loaded.conversation.revision > active.stream.turn.revision
      ) {
        if (!registration.controller.commit(loaded)) {
          this.pendingRefresh = true;
          return;
        }
        this.currentConversationId = loaded.conversation.id;
        this.latestTurnWatermark = {
          ...active.stream.turn,
          conversationId: loaded.conversation.id,
          revision: loaded.conversation.revision,
        };
        this.clearActiveRemoteTurn();
        return;
      }
      if (loaded.conversation.revision < active.stream.turn.revision) {
        this.pendingRefresh = true;
        return;
      }
      if (!registration.controller.commit(loaded)) {
        this.pendingRefresh = true;
        return;
      }
      this.currentConversationId = loaded.conversation.id;
      active.baseReady = true;
      this.replayQueuedEvents(active);
    } catch (error) {
      this.pendingRefresh = true;
      this.log.warn("Failed to hydrate a remote conversation turn", { error });
    }
  }

  private async refreshCanonical(): Promise<void> {
    const registration = this.activeRegistration;
    if (!registration || registration.controller.getStatus() !== "ready") {
      this.pendingRefresh = true;
      return;
    }
    const generation = ++this.refreshGeneration;
    this.pendingRefresh = false;
    invalidateAIConversationSession(this.channel, registration.owner);
    try {
      const loaded = await registration.controller.load();
      if (
        generation !== this.refreshGeneration ||
        this.activeRegistration !== registration ||
        loaded.stale
      ) {
        return;
      }
      if (!registration.controller.commit(loaded)) {
        this.pendingRefresh = true;
        return;
      }
      this.currentConversationId = loaded.conversation.id;
      const active = this.activeRemoteTurn;
      if (
        active &&
        (loaded.conversation.id !== active.stream.turn.conversationId ||
          loaded.conversation.revision > active.stream.turn.revision)
      ) {
        this.latestTurnWatermark = {
          ...active.stream.turn,
          conversationId: loaded.conversation.id,
          revision: loaded.conversation.revision,
        };
        this.clearActiveRemoteTurn();
      }
    } catch (error) {
      if (
        generation === this.refreshGeneration &&
        this.activeRegistration === registration
      ) {
        this.pendingRefresh = true;
      }
      this.log.warn("Failed to refresh the realtime conversation", { error });
    }
  }
}
