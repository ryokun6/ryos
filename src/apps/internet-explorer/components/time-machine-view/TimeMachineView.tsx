import React from "react";
import { createPortal } from "react-dom";
import type { TimeMachineViewProps } from "./types";
import { useTimeMachineView } from "./useTimeMachineView";
import { TimeMachineViewPortal } from "./TimeMachineViewPortal";

const TimeMachineView: React.FC<TimeMachineViewProps> = (props) => {
  const vm = useTimeMachineView(props);
  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(
            <TimeMachineViewPortal vm={vm} isOpen={props.isOpen} />,
            document.body
          )
        : null}
    </>
  );
};

export default TimeMachineView;
