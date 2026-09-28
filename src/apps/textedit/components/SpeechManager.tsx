import { useState, useEffect, useCallback, useRef } from "react";
import { Editor } from "@tiptap/core";
import { useTranslation } from "react-i18next";
import {
  createSpeechUtterance,
  getBrowserSpeechSynthesis,
  ryOSLocaleToSpeechLanguage,
} from "@/utils/browserSpeech";
import { speechHighlightKey } from "../extensions/SpeechHighlight";

interface SpeechManagerProps {
  editor: Editor | null;
  speechEnabled: boolean;
  children: (props: {
    isSpeaking: boolean;
    isTtsLoading: boolean;
    handleSpeak: () => void;
  }) => React.ReactNode;
}

type SpeakableBlock = { text: string; from: number; to: number };

/**
 * TextEdit read-aloud uses browser `speechSynthesis` (same path as Maps nav,
 * Books, Calculator, and the desktop assistant). The cloud TTS queue is
 * reserved for in-OS Ryo chat so Default ElevenLabs + Ryo PVC cannot leak.
 */
export function SpeechManager({ editor, speechEnabled, children }: SpeechManagerProps) {
  const { i18n } = useTranslation();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const generationRef = useRef(0);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const highlightRange = useCallback(
    (from: number, to: number) => {
      if (!editor) return;
      const { state, view } = editor;
      const tr = state.tr.setMeta(speechHighlightKey, { range: { from, to } });
      view.dispatch(tr);
    },
    [editor]
  );

  const clearHighlight = useCallback(() => {
    if (!editor) return;
    const { state, view } = editor;
    const tr = state.tr.setMeta(speechHighlightKey, { clear: true });
    view.dispatch(tr);
  }, [editor]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    activeUtteranceRef.current = null;
    getBrowserSpeechSynthesis()?.cancel();
    setIsSpeaking(false);
    clearHighlight();
  }, [clearHighlight]);

  useEffect(() => () => stop(), [stop]);

  const speakBlocks = useCallback(
    (blocks: SpeakableBlock[]) => {
      const synth = getBrowserSpeechSynthesis();
      if (!synth || blocks.length === 0) return;

      const generation = ++generationRef.current;
      const lang = ryOSLocaleToSpeechLanguage(i18n.language);

      synth.cancel();
      synth.resume();
      synth.getVoices();

      const speakAt = (index: number) => {
        if (generation !== generationRef.current) return;
        const block = blocks[index];
        if (!block) {
          activeUtteranceRef.current = null;
          clearHighlight();
          setIsSpeaking(false);
          return;
        }

        highlightRange(block.from, block.to);
        const utterance = createSpeechUtterance(block.text, {
          lang,
          voices: synth.getVoices(),
        });
        activeUtteranceRef.current = utterance;
        utterance.onend = () => speakAt(index + 1);
        utterance.onerror = () => speakAt(index + 1);
        setIsSpeaking(true);
        synth.speak(utterance);
      };

      speakAt(0);
    },
    [clearHighlight, highlightRange, i18n.language]
  );

  const handleSpeak = useCallback(() => {
    if (!editor || !speechEnabled) return;

    if (isSpeaking) {
      stop();
      return;
    }

    const { from, to, empty } = editor.state.selection;

    if (empty) {
      const blocks: SpeakableBlock[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent.trim()) {
          blocks.push({
            text: node.textContent.trim(),
            from: pos + 1,
            to: pos + node.nodeSize - 1,
          });
        }
      });
      if (blocks.length === 0) return;
      speakBlocks(blocks);
      return;
    }

    const textToSpeak = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!textToSpeak) return;
    speakBlocks([{ text: textToSpeak, from, to }]);
  }, [editor, isSpeaking, speakBlocks, speechEnabled, stop]);

  return (
    <>
      {children({
        isSpeaking,
        isTtsLoading: false,
        handleSpeak,
      })}
    </>
  );
}
