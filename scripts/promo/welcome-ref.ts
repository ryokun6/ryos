import { mkdir } from "node:fs/promises";
import { boot, centerWindow, DEVICE, fillPhoneWindow, launch, launchApp, sleep, WORK_DIR } from "./lib";
// Reference crop of the Dictionary welcome-screen sample chips (per device), used by check_welcome.py.
await mkdir(`${WORK_DIR}/rec`, { recursive: true });
const { browser, page } = await launch();
await boot(page);
await launchApp(page, "dictionary");
await sleep(800);
if (DEVICE === "phone") await fillPhoneWindow(page);
else await centerWindow(page, 1100, 676);
await sleep(1000);
const chip = page.getByRole("button", { name: "serendipity", exact: true }).first();
const row = chip.locator("xpath=..");
const b = (await row.boundingBox())!;
console.log("chips", b);
await Bun.write(`${WORK_DIR}/rec/welcome-box-${DEVICE}.json`, JSON.stringify(b));
const shot = await page.screenshot({ clip: b, timeout: 15000 }).catch(() => null);
if (shot) await Bun.write(`${WORK_DIR}/rec/welcome-chips-${DEVICE}.png`, shot);
await browser.close();
