import { motion, AnimatePresence } from "framer-motion";
import { AudioInputButton } from "@/components/ui/audio-input-button";
import { CHAT_ANALYTICS, getTextAnalytics, track } from "@/utils/analytics";
import { checkOfflineAndShowError } from "@/utils/offline";
import { WAVEFORM_BANDS } from "./constants";
import { ChatInputImagePreview } from "./ChatInputImagePreview";
import { ChatInputRecordingUI } from "./ChatInputRecordingUI";
import { ChatInputField } from "./ChatInputField";
import { ChatInputActionButtons } from "./ChatInputActionButtons";
import { ChatInputFooter } from "./ChatInputFooter";
import type { ChatInputViewModel } from "./useChatInput";

export function ChatInputView(vm: ChatInputViewModel) {
  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full"
      >
        <input
          ref={vm.imageInputRef}
          type="file"
          accept="image/*"
          onChange={vm.handleImageSelect}
          className="hidden"
          aria-hidden="true"
        />

        <ChatInputImagePreview
          t={vm.t}
          selectedImage={vm.selectedImage}
          isInChatRoom={vm.isInChatRoom}
          isMacTheme={vm.isMacTheme}
          isXpTheme={vm.isXpTheme}
          handleImageClear={vm.handleImageClear}
        />

        <form
          onSubmit={async (e) => {
            if (vm.isOffline) {
              e.preventDefault();
              checkOfflineAndShowError(
                vm.t("apps.chats.status.chatRequiresInternet")
              );
              return;
            }
            if (vm.input.trim() !== "") {
              track(CHAT_ANALYTICS.TEXT_MESSAGE, {
                ...getTextAnalytics(vm.input),
                hasAttachment: !!vm.selectedImage,
                isChatRoom: vm.isInChatRoom,
              });
            }
            e.preventDefault();
            const didSubmit = await vm.onSubmitMessage(vm.input, vm.selectedImage);
            if (didSubmit) {
              vm.dispatchComposer({ type: "clearComposer" });
            }
          }}
          className={`flex ${vm.isMacTheme ? "gap-2" : "gap-1"}`}
        >
          <div className="sr-only">
            <AudioInputButton
              ref={vm.audioButtonRef}
              onTranscriptionComplete={vm.handleTranscriptionComplete}
              onTranscriptionStart={vm.handleTranscriptionStart}
              onRecordingStateChange={vm.handleRecordingStateChange}
              onFrequenciesChange={vm.handleFrequenciesChange}
              isLoading={vm.isTranscribing}
              silenceThreshold={1200}
              externalWaveform={true}
              frequencyBands={WAVEFORM_BANDS}
            />
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            {vm.isRecording ? (
              <ChatInputRecordingUI
                t={vm.t}
                isMacTheme={vm.isMacTheme}
                isXpTheme={vm.isXpTheme}
                waveformBars={vm.waveformBars}
                waveformIsSilent={vm.waveformIsSilent}
              />
            ) : (
              <ChatInputField
                t={vm.t}
                input={vm.input}
                inputRef={vm.inputRef}
                imageInputRef={vm.imageInputRef}
                audioButtonRef={vm.audioButtonRef}
                isMacTheme={vm.isMacTheme}
                isLoading={vm.isLoading}
                isTranscribing={vm.isTranscribing}
                needsUsername={vm.needsUsername}
                isInChatRoom={vm.isInChatRoom}
                isOffline={vm.isOffline}
                isFocused={vm.isFocused}
                setIsFocused={vm.setIsFocused}
                isTouchDevice={vm.isTouchDevice}
                isTypingRyoMention={vm.isTypingRyoMention}
                showNudgeButton={vm.showNudgeButton}
                isProcessingImage={vm.isProcessingImage}
                handleInputChangeWithSound={vm.handleInputChangeWithSound}
                handleNudgeClick={vm.handleNudgeClick}
                handleMentionClick={vm.handleMentionClick}
              />
            )}
            <ChatInputActionButtons
              input={vm.input}
              selectedImage={vm.selectedImage}
              isMacTheme={vm.isMacTheme}
              isXpTheme={vm.isXpTheme}
              isLoading={vm.isLoading}
              isOffline={vm.isOffline}
              isRecording={vm.isRecording}
              isSpeechPlaying={vm.isSpeechPlaying}
              handleStopClick={vm.handleStopClick}
            />
          </AnimatePresence>
        </form>
        <ChatInputFooter
          t={vm.t}
          isTypingRyoMention={vm.isTypingRyoMention}
          isInChatRoom={vm.isInChatRoom}
          debugMode={vm.debugMode}
          modelDisplayName={vm.modelDisplayName}
          transcriptionError={vm.transcriptionError}
          rateLimitError={vm.rateLimitError}
        />
      </motion.div>
    </AnimatePresence>
  );
}
