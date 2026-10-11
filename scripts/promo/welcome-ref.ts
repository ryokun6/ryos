import { mkdir } from "node:fs/promises";
import { boot, launch, launchApp, placeWindow, sleep, WORK_DIR } from "./lib";
// Reference crop of the Dictionary welcome-screen sample chips, used by check_welcome.py.
await mkdir(`${WORK_DIR}/rec`, { recursive: true });
const { browser, page } = await launch();
await boot(page);
await launchApp(page, "dictionary");
await sleep(800);
await placeWindow(page, { x: 150, y: 36, w: 1140, h: 690 });
await sleep(1000);
const chip = page.getByRole("button", { name: "serendipity", exact: true }).first();
const row = chip.locator("xpath=..");
const b = (await row.boundingBox())!;
console.log("chips", b);
await Bun.write(`${WORK_DIR}/rec/welcome-box.json`, JSON.stringify(b));
const shot = await page.screenshot({ clip: b, timeout: 15000 }).catch(() => null);
if (shot) await Bun.write(`${WORK_DIR}/rec/welcome-chips.png`, shot);
await browser.close();
