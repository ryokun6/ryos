export const calculatorStyles = `
  .calc-key {
    font-family: var(--os-font-ui), Geneva, Chicago, sans-serif;
    user-select: none;
    touch-action: manipulation;
    line-height: 1;
    padding: 0;
  }

  /* ── System 7 desk accessory ── */
  .calc-theme-system7.calc-body {
    background-color: #c0c0c0;
    background-image: radial-gradient(circle, #000 0.55px, transparent 0.55px);
    background-size: 2px 2px;
    padding: 6px;
    gap: 4px;
  }
  .calc-theme-system7 .calc-display {
    background: #fff;
    color: #000;
    border: 1px solid #000;
    box-shadow: inset 1px 1px 0 #000;
    font-family: Chicago, Geneva, var(--os-font-ui), sans-serif;
    text-align: right;
    padding: 2px 4px;
    min-height: 22px;
    font-size: 16px;
    font-weight: 700;
    border-radius: 0;
  }
  .calc-s7-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(5, 26px);
    gap: 4px;
  }
  .calc-theme-system7 .calc-key {
    background: #fff;
    border: 1px solid #000;
    border-radius: 0;
    color: #000;
    font-size: 13px;
    font-weight: 700;
    min-height: 26px;
    box-shadow: 1px 1px 0 #000;
  }
  .calc-theme-system7 .calc-key:active {
    box-shadow: none;
    transform: translate(1px, 1px);
  }
  .calc-theme-system7 .calc-key-wide {
    grid-column: span 2;
  }
  /* ── Mac OS X Tiger brushed metal (Aqua) ── */
  .calc-theme-aqua.calc-body {
    background: transparent;
    padding: 6px 8px 8px;
    gap: 4px;
  }
  .calc-theme-aqua .calc-display {
    background: linear-gradient(180deg, #f8fae6 0%, #eef2d4 42%, #e6ecbc 100%);
    color: #000;
    border: 1px solid #6e6e62;
    border-radius: 5px;
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.16),
      inset 0 1px 0 rgba(0, 0, 0, 0.1),
      0 1px 0 rgba(255, 255, 255, 0.35);
    font-family: "Lucida Grande", Geneva, var(--os-font-ui), sans-serif;
    font-size: 22px;
    font-weight: 400;
    text-align: right;
    padding: 4px 8px;
    min-height: 36px;
    letter-spacing: 0.02em;
  }
  .calc-aqua-compact-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(6, 28px);
    gap: 2px;
  }
  .calc-aqua-full-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-template-rows: repeat(6, 26px);
    gap: 2px;
  }
  /* Raised plastic keys — Tiger Calculator pill texture */
  .calc-theme-aqua .calc-key {
    position: relative;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.52);
    background: linear-gradient(
      180deg,
      #fcfcfc 0%,
      #f0f0f0 14%,
      #e4e4e4 38%,
      #d2d2d2 68%,
      #c6c6c6 88%,
      #bcbcbc 100%
    );
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.92) inset,
      0 -1px 0 rgba(0, 0, 0, 0.05) inset,
      0 1px 2px rgba(0, 0, 0, 0.2);
    color: #1c1c1c;
    font-size: 13px;
    font-weight: 500;
    min-height: 26px;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
  }
  .calc-theme-aqua .calc-key:active {
    background: linear-gradient(180deg, #c4c4c4 0%, #a8a8a8 55%, #989898 100%);
    box-shadow:
      inset 0 1px 3px rgba(0, 0, 0, 0.32),
      inset 0 0 1px rgba(0, 0, 0, 0.18);
    text-shadow: none;
  }
  .calc-theme-aqua .calc-key-function {
    font-size: 11px;
    background: linear-gradient(
      180deg,
      #f6f6f6 0%,
      #ececec 30%,
      #dadada 65%,
      #cecece 100%
    );
  }
  .calc-theme-aqua .calc-key-operator {
    font-weight: 600;
  }
  .calc-theme-aqua .calc-key-equals,
  .calc-theme-aqua .calc-key-equals-wide {
    font-weight: 600;
  }
  .calc-theme-aqua .calc-key-wide {
    grid-column: span 2;
  }
  .calc-theme-aqua .calc-key-equals-wide {
    grid-column: span 2;
  }

  /* Aqua dark mode — graphite keys on dark brushed metal */
  :root[data-os-theme="macosx"][data-os-color-scheme="dark"] .calc-theme-aqua .calc-display {
    background: linear-gradient(180deg, #242428 0%, #161618 55%, #101012 100%);
    color: #d8e8cc;
    border: 1px solid rgba(0, 0, 0, 0.92);
    box-shadow:
      inset 0 2px 5px rgba(0, 0, 0, 0.72),
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 1px 0 rgba(255, 255, 255, 0.05);
  }
  :root[data-os-theme="macosx"][data-os-color-scheme="dark"] .calc-theme-aqua .calc-key {
    border: 1px solid rgba(0, 0, 0, 0.88);
    background: linear-gradient(
      180deg,
      #56565c 0%,
      #4a4a50 18%,
      #3e3e44 45%,
      #323238 72%,
      #2a2a2f 92%,
      #36363c 100%
    );
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.12) inset,
      0 -1px 0 rgba(0, 0, 0, 0.35) inset,
      0 1px 2px rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55);
  }
  :root[data-os-theme="macosx"][data-os-color-scheme="dark"] .calc-theme-aqua .calc-key:active {
    background: linear-gradient(180deg, #2e2e33 0%, #242428 55%, #1c1c20 100%);
    box-shadow:
      inset 0 1px 3px rgba(0, 0, 0, 0.55),
      inset 0 0 1px rgba(0, 0, 0, 0.35);
    text-shadow: none;
  }
  :root[data-os-theme="macosx"][data-os-color-scheme="dark"] .calc-theme-aqua .calc-key-function {
    background: linear-gradient(
      180deg,
      #505056 0%,
      #44444a 35%,
      #36363c 70%,
      #2c2c32 100%
    );
  }

  /* ── Windows 98 ── */
  .calc-theme-win98 {
    background: #c0c0c0;
    padding: 4px;
    gap: 4px;
  }
  .calc-theme-win98 .calc-display {
    background: #fff;
    color: #000;
    border: none;
    box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a;
    font-family: "Lucida Console", monospace;
    font-size: 20px;
    text-align: right;
    padding: 4px 6px;
    min-height: 32px;
  }
  .calc-theme-win98 .calc-key {
    background: #c0c0c0;
    border: none;
    border-radius: 0;
    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
    color: #000;
    font-size: 13px;
    min-height: 28px;
  }
  .calc-theme-win98 .calc-key:active {
    box-shadow: inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080;
  }
  .calc-theme-win98 .calc-key-operator {
    font-weight: 700;
  }

  /* ── Windows XP ── */
  .calc-theme-xp {
    background: #ece9d8;
    padding: 6px;
    gap: 3px;
  }
  .calc-theme-xp .calc-display {
    background: #fff;
    color: #000;
    border: 1px solid #7f9db9;
    box-shadow: inset 1px 1px 2px rgba(0,0,0,0.15);
    font-family: Tahoma, "Segoe UI", sans-serif;
    font-size: 22px;
    text-align: right;
    padding: 4px 8px;
    min-height: 34px;
  }
  .calc-theme-xp .calc-memory-strip {
    color: #444;
    font-size: 11px;
    font-family: Tahoma, sans-serif;
    padding: 0 2px 2px;
  }
  .calc-theme-xp .calc-key {
    background: linear-gradient(180deg, #fff 0%, #ece9d8 55%, #d4d0c8 100%);
    border: 1px solid #888;
    border-radius: 3px;
    box-shadow: 0 1px 0 #fff inset;
    color: #000;
    font-family: Tahoma, sans-serif;
    font-size: 12px;
    min-height: 26px;
  }
  .calc-theme-xp .calc-key:active {
    background: #d4d0c8;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
  }
  .calc-theme-xp .calc-key-operator {
    font-weight: 700;
  }
  .calc-theme-xp .calc-key-equals {
    font-weight: 700;
  }

  .calc-conversion-panel select,
  .calc-conversion-panel input {
    font-family: var(--os-font-ui), Geneva, Tahoma, sans-serif;
    font-size: 12px;
  }
`;
