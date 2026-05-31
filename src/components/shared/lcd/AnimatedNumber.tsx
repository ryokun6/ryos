import { memo, useEffect, useState } from "react";
import { AnimatedDigit } from "./AnimatedDigit";

export const AnimatedNumber = memo(function AnimatedNumber({
  number,
}: {
  number: number;
}) {
  const [prevNumber, setPrevNumber] = useState(number);
  const direction = number > prevNumber ? "next" : "prev";

  useEffect(() => {
    setPrevNumber(number);
  }, [number]);

  const digits = String(number).padStart(2, "0").split("");
  const digitEntries = digits.map((digit, position) => ({
    digit,
    slotKey: position === 0 ? "tens" : "ones",
  }));

  return (
    <div className="flex">
      {digitEntries.map((entry) => (
        <AnimatedDigit
          key={entry.slotKey}
          digit={entry.digit}
          direction={direction}
        />
      ))}
    </div>
  );
});
