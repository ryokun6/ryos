import { describe, expect, mock, test } from "bun:test";
import { requestSetChatSpeechEnabled } from "../../../src/utils/chatSpeechAuth";

describe("requestSetChatSpeechEnabled", () => {
  test("enables speech when the user is signed in", () => {
    const setSpeechEnabled = mock(() => {});
    const promptLogin = mock(() => {});
    expect(
      requestSetChatSpeechEnabled({
        enabled: true,
        isAuthenticated: true,
        promptLogin,
        setSpeechEnabled,
      })
    ).toBe(true);
    expect(setSpeechEnabled).toHaveBeenCalledWith(true);
    expect(promptLogin).not.toHaveBeenCalled();
  });

  test("opens login and leaves speech off when enabling while logged out", () => {
    const setSpeechEnabled = mock(() => {});
    const promptLogin = mock(() => {});
    expect(
      requestSetChatSpeechEnabled({
        enabled: true,
        isAuthenticated: false,
        promptLogin,
        setSpeechEnabled,
      })
    ).toBe(false);
    expect(setSpeechEnabled).not.toHaveBeenCalled();
    expect(promptLogin).toHaveBeenCalledTimes(1);
  });

  test("allows turning speech off without login", () => {
    const setSpeechEnabled = mock(() => {});
    const promptLogin = mock(() => {});
    expect(
      requestSetChatSpeechEnabled({
        enabled: false,
        isAuthenticated: false,
        promptLogin,
        setSpeechEnabled,
      })
    ).toBe(true);
    expect(setSpeechEnabled).toHaveBeenCalledWith(false);
    expect(promptLogin).not.toHaveBeenCalled();
  });
});
