export const calculatorStyles = `
  .calc-key {
    font-family: var(--os-font-ui), Geneva, Chicago, sans-serif;
    user-select: none;
    touch-action: manipulation;
    line-height: 1;
  }

  /* System 7 — 1984 Macintosh desk accessory */
  .calc-theme-system7 {
    background: #dddddd;
    padding: 6px;
    gap: 4px;
  }
  .calc-theme-system7 .calc-display {
    background: #000;
    color: #fff;
    border: 2px inset #808080;
    font-family: Monaco, "Courier New", monospace;
    text-align: right;
    padding: 4px 6px;
    min-height: 28px;
    font-size: 18px;
    letter-spacing: 1px;
  }
  .calc-theme-system7 .calc-key {
    background: #fff;
    border: 1px solid #000;
    border-radius: 0;
    color: #000;
    font-size: 14px;
    font-weight: 600;
    min-height: 28px;
    box-shadow: none;
  }
  .calc-theme-system7 .calc-key:active {
    background: #000;
    color: #fff;
  }
  .calc-theme-system7 .calc-key-operator {
    background: #eee;
  }
  .calc-theme-system7 .calc-key-wide {
    grid-column: span 2;
  }
  .calc-theme-aqua {
    background: transparent;
    padding: 8px 10px 10px;
    gap: 6px;
  }
  .calc-theme-aqua .calc-display {
    background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
    color: #fff;
    border: 1px solid rgba(0,0,0,0.8);
    border-radius: 8px;
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.35);
    font-family: "Lucida Grande", Geneva, sans-serif;
    font-size: 28px;
    font-weight: 300;
    text-align: right;
    padding: 10px 12px;
    min-height: 52px;
  }
  .calc-theme-aqua .calc-key {
    border-radius: 10px;
    border: 1px solid rgba(0,0,0,0.45);
    background: linear-gradient(180deg, #f8f8f8 0%, #d8d8d8 45%, #b8b8b8 100%);
    box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 1px 2px rgba(0,0,0,0.25);
    color: #111;
    font-size: 15px;
    font-weight: 500;
    min-height: 34px;
  }
  .calc-theme-aqua .calc-key:active {
    background: linear-gradient(180deg, #c8c8c8 0%, #a8a8a8 100%);
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.35);
  }
  .calc-theme-aqua .calc-key-operator {
    background: linear-gradient(180deg, #ffd080 0%, #f0a030 50%, #d08010 100%);
    color: #1a1000;
    font-weight: 600;
  }
  .calc-theme-aqua .calc-key-function {
    background: linear-gradient(180deg, #e8e8ec 0%, #c8c8d0 50%, #a8a8b0 100%);
    font-size: 12px;
  }
  .calc-theme-aqua .calc-key-equals {
    background: linear-gradient(180deg, #90c0ff 0%, #5090e0 50%, #2060c0 100%);
    color: #fff;
    font-weight: 700;
  }

  /* Windows 98 classic gray bevel */
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

  /* Windows XP Luna */
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
    background: linear-gradient(180deg, #fff 0%, #ece9d8 100%);
    font-weight: 700;
  }

  .calc-conversion-panel select,
  .calc-conversion-panel input {
    font-family: var(--os-font-ui), Geneva, Tahoma, sans-serif;
    font-size: 12px;
  }
`;
