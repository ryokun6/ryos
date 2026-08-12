/**
 * Stuff shared-link view: long titles must truncate / clamp without blowing
 * out the header, grid cards, or selected-item chrome.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";

let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}

const previousActEnv = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

const LONG_SHARE_TITLE =
  "super long garage sale shelf title that should not crush the back button or spill out of the header chrome on a narrow phone width yo";
const LONG_ITEM_TITLE =
  "Vintage Ultra-Compact Supercalifragilisticexpialidocious Multifunction Kitchen Gadget With Extremely Long Product Name That Overflows Cards";
const LONG_BRAND =
  "Brand Name That Is Also Extremely Long And Should Truncate Next To Close";

const sharePayload = {
  id: "share-long-titles",
  title: LONG_SHARE_TITLE,
  ownerUsername: "ryo",
  items: [
    {
      id: "item-1",
      title: LONG_ITEM_TITLE,
      notes: "notes about this very cool thing that also goes on for a while",
      brand: LONG_BRAND,
      tagNames: [],
      status: "for_sale",
      prices: { currency: "USD", original: 42 },
      quantity: 1,
    },
    {
      id: "item-2",
      title: "short lamp",
      notes: "",
      tagNames: [],
      status: "stowed",
      prices: { currency: "USD" },
      quantity: 1,
    },
  ],
  reservations: [],
  bids: [],
};

mock.module("../../../src/hooks/useSound", () => ({
  Sounds: {},
  useSound: () => ({ play: () => {} }),
}));

mock.module("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    username: null,
    isAuthenticated: false,
    promptLogin: () => {},
    promptSetUsername: () => {},
    usernameDialogInitialTab: "login" as const,
    isUsernameDialogOpen: false,
    setIsUsernameDialogOpen: () => {},
    newUsername: "",
    setNewUsername: () => {},
    newPassword: "",
    setNewPassword: () => {},
    isSettingUsername: false,
    usernameError: null,
    submitUsernameDialog: async () => {},
    setUsernameError: () => {},
    promptVerifyToken: () => {},
    isVerifyDialogOpen: false,
    setVerifyDialogOpen: () => {},
    verifyTokenInput: "",
    setVerifyTokenInput: () => {},
    verifyPasswordInput: "",
    setVerifyPasswordInput: () => {},
    verifyUsernameInput: "",
    setVerifyUsernameInput: () => {},
    isVerifyingToken: false,
    verifyError: null,
    handleVerifyTokenSubmit: async () => {},
    setPassword: async () => {},
    logout: () => {},
    confirmLogout: async () => {},
    isLogoutConfirmDialogOpen: false,
    setIsLogoutConfirmDialogOpen: () => {},
  }),
}));

mock.module("../../../src/utils/abortableFetch", () => ({
  abortableFetch: async () =>
    new Response(JSON.stringify(sharePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
}));

mock.module("../../../src/components/dialogs/LoginDialog", () => ({
  LoginDialog: () => null,
}));

mock.module("sonner", () => ({
  toast: {
    success: () => {},
    error: () => {},
  },
}));

const { StuffSharedView } = await import(
  "../../../src/apps/stuff/components/StuffSharedView"
);

const i18n = i18next.createInstance();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

afterAll(() => {
  if (previousActEnv) {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousActEnv);
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

async function renderSharedView(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <I18nextProvider i18n={i18n}>
        <StuffSharedView shareId="share-long-titles" onBack={() => {}} />
      </I18nextProvider>
    );
  });
  // Allow the load() effect to settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

describe("StuffSharedView long titles", () => {
  test("header truncates the share title without losing the back control", async () => {
    const host = await renderSharedView();
    const header = host.querySelector("h2");
    expect(header?.textContent).toBe(LONG_SHARE_TITLE);
    expect(header?.classList.contains("truncate")).toBe(true);
    expect(header?.getAttribute("title")).toBe(LONG_SHARE_TITLE);

    const back = Array.from(host.querySelectorAll("button")).find((btn) =>
      (btn.textContent ?? "").toLowerCase().includes("back")
    );
    expect(back?.classList.contains("shrink-0")).toBe(true);
  });

  test("grid cards clamp title overflow with min-w-0 + truncate", async () => {
    const host = await renderSharedView();
    const card = Array.from(host.querySelectorAll("button")).find((btn) =>
      (btn.textContent ?? "").includes(LONG_ITEM_TITLE)
    );
    expect(card).toBeTruthy();
    expect(card?.classList.contains("min-w-0")).toBe(true);
    expect(card?.classList.contains("overflow-hidden")).toBe(true);

    const title = Array.from(card!.querySelectorAll("div")).find(
      (el) => el.textContent === LONG_ITEM_TITLE && el.classList.contains("truncate")
    );
    expect(title).toBeTruthy();
    expect(title?.getAttribute("title")).toBe(LONG_ITEM_TITLE);
  });

  test("selected item detail wraps/clamps title and keeps close shrink-0", async () => {
    const host = await renderSharedView();
    const card = Array.from(host.querySelectorAll("button")).find((btn) =>
      (btn.textContent ?? "").includes(LONG_ITEM_TITLE)
    );
    expect(card).toBeTruthy();

    await act(async () => {
      card!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    const detailTitle = host.querySelector("h3");
    expect(detailTitle?.textContent).toBe(LONG_ITEM_TITLE);
    expect(detailTitle?.classList.contains("line-clamp-3")).toBe(true);
    expect(detailTitle?.classList.contains("break-words")).toBe(true);
    expect(detailTitle?.getAttribute("title")).toBe(LONG_ITEM_TITLE);

    const brand = Array.from(host.querySelectorAll("p")).find(
      (el) => el.textContent === LONG_BRAND
    );
    expect(brand?.classList.contains("truncate")).toBe(true);

    const close = Array.from(host.querySelectorAll("button")).find((btn) =>
      (btn.textContent ?? "").toLowerCase().includes("close")
    );
    expect(close?.classList.contains("shrink-0")).toBe(true);
  });
});
