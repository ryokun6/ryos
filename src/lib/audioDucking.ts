import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";

export type TtsDuckingToken = symbol;

const TTS_MUSIC_DUCKING_FACTOR = 0.35;
const TTS_CHAT_SYNTH_DUCKING_FACTOR = 0.6;

type TtsDuckingOptions = {
  duckMusic: boolean;
  duckChatSynth?: boolean;
};

const activeDucking = new Map<
  TtsDuckingToken,
  Required<TtsDuckingOptions>
>();

function applyDuckingFactors() {
  let shouldDuckMusic = false;
  let shouldDuckChatSynth = false;

  for (const options of activeDucking.values()) {
    shouldDuckMusic ||= options.duckMusic;
    shouldDuckChatSynth ||= options.duckChatSynth;
  }

  useAudioSettingsStore.getState().setTtsDuckingFactors({
    music: shouldDuckMusic ? TTS_MUSIC_DUCKING_FACTOR : 1,
    chatSynth: shouldDuckChatSynth ? TTS_CHAT_SYNTH_DUCKING_FACTOR : 1,
  });
}

export function startTtsDucking(options: TtsDuckingOptions): TtsDuckingToken {
  const token = Symbol("tts-ducking");
  activeDucking.set(token, {
    duckMusic: options.duckMusic,
    duckChatSynth: options.duckChatSynth ?? true,
  });
  applyDuckingFactors();
  return token;
}

export function updateTtsDucking(
  token: TtsDuckingToken,
  options: TtsDuckingOptions
) {
  if (!activeDucking.has(token)) return;

  activeDucking.set(token, {
    duckMusic: options.duckMusic,
    duckChatSynth: options.duckChatSynth ?? true,
  });
  applyDuckingFactors();
}

export function stopTtsDucking(token: TtsDuckingToken | null) {
  if (!token || !activeDucking.delete(token)) return;
  applyDuckingFactors();
}

export function resetTtsDuckingForTests() {
  activeDucking.clear();
  applyDuckingFactors();
}
