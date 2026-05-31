import type { CoverFlowComponentProps } from "./types";
import { useCoverFlowController } from "./useCoverFlowController";
import { CoverFlowInlineView } from "./CoverFlowInlineView";
import { CoverFlowOverlayView } from "./CoverFlowOverlayView";

export function CoverFlow(props: CoverFlowComponentProps) {
  const vm = useCoverFlowController(props);
  const { inline } = props;

  if (inline) {
    return <CoverFlowInlineView vm={vm} />;
  }

  return <CoverFlowOverlayView vm={vm} isVisible={props.isVisible} />;
}
