import { expect, test } from "bun:test";

import { runNewApiTests } from "./test-new-api";
import { runAdminTests } from "./test-admin";
import { runIframeCheckTests } from "./test-iframe-check";
import { runLinkPreviewTests } from "./test-link-preview";
import { runParseTitleTests } from "./test-parse-title";
import { runSpeechTests } from "./test-speech";
import { runShareAppletTests } from "./test-share-applet";
import { runSongTests } from "./test-song";
import { runAiTests } from "./test-ai";
import { runMediaTests } from "./test-media";
import { runAuthExtraTests } from "./test-auth-extra";
import { runRoomsExtraTests } from "./test-rooms-extra";
import { runChatNotificationLogicTests } from "./test-chat-notification-logic";
import { runChatNotificationIntegrationWiringTests } from "./test-chat-notification-integration-wiring";
import { runPusherClientRefcountTests } from "./test-pusher-client-refcount";
import { runPusherClientConstructorWiringTests } from "./test-pusher-client-constructor-wiring";
import { runChatBroadcastWiringTests } from "./test-chat-broadcast-wiring";
import { runChatStoreGuardsWiringTests } from "./test-chat-store-guards-wiring";
import { runChatHookChannelLifecycleWiringTests } from "./test-chat-hook-channel-lifecycle-wiring";
import { runInfraApiTests } from "./test-infra-api";

interface Suite {
  name: string;
  run: () => Promise<{ passed: number; failed: number }>;
}

const suites: Suite[] = [
  { name: "new-api", run: runNewApiTests },
  { name: "admin", run: runAdminTests },
  { name: "iframe-check", run: runIframeCheckTests },
  { name: "link-preview", run: runLinkPreviewTests },
  { name: "parse-title", run: runParseTitleTests },
  { name: "song", run: runSongTests },
  { name: "speech", run: runSpeechTests },
  { name: "share-applet", run: runShareAppletTests },
  { name: "ai", run: runAiTests },
  { name: "media", run: runMediaTests },
  { name: "auth-extra", run: runAuthExtraTests },
  { name: "rooms-extra", run: runRoomsExtraTests },
  { name: "infra-api", run: runInfraApiTests },
  { name: "chat-notifications", run: runChatNotificationLogicTests },
  { name: "chat-notification-wiring", run: runChatNotificationIntegrationWiringTests },
  { name: "chat-hook-lifecycle-wiring", run: runChatHookChannelLifecycleWiringTests },
  { name: "pusher-client", run: runPusherClientRefcountTests },
  { name: "pusher-constructor-wiring", run: runPusherClientConstructorWiringTests },
  { name: "chat-broadcast-wiring", run: runChatBroadcastWiringTests },
  { name: "chat-store-guards", run: runChatStoreGuardsWiringTests },
];

for (const suite of suites) {
  test(`suite:${suite.name}`, async () => {
    const result = await suite.run();
    expect(result.failed).toBe(0);
  });
}
