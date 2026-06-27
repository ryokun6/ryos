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
    background: linear-gradient(180deg, #f2f6dc 0%, #e4eab8 100%);
    color: #000;
    border: 1px solid #8a8a7a;
    border-radius: 4px;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.18);
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
  .calc-theme-aqua .calc-key {
    border-radius: 4px;
    border: 1px solid #6a6a6a;
    background: linear-gradient(180deg, #fefefe 0%, #ececec 38%, #d4d4d4 72%, #c8c8c8 100%);
    box-shadow: 0 1px 0 rgba(255,255,255,0.85) inset, 0 1px 1px rgba(0,0,0,0.12);
    color: #111;
    font-size: 13px;
    font-weight: 500;
    min-height: 26px;
  }
  .calc-theme-aqua .calc-key:active {
    background: linear-gradient(180deg, #d0d0d0 0%, #b8b8b8 100%);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.25);
  }
  .calc-theme-aqua .calc-key-function {
    font-size: 11px;
    background: linear-gradient(180deg, #f4f4f4 0%, #e0e0e0 50%, #cccccc 100%);
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
