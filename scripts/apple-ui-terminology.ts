/**
 * Canonical standalone UI labels derived from Apple's localization glossaries.
 *
 * Sources reviewed on 2026-06-28:
 * - Glossaries - iOS 26.2
 * - Glossaries - macOS 26.1
 * - https://developer.apple.com/localization/resources/
 * - https://help.apple.com/pdf/applestyleguide/en_US/apple-style-guide.pdf
 *
 * Apple requires an authenticated developer session for the official DMG files.
 * The values below were checked through the searchable, Apple-glossary-derived
 * index at https://applelocalization.com/ and spot-checked against localized
 * Apple Support guides. Only this small terminology table is kept in the repo.
 *
 * The `pt` locale intentionally follows Apple's Brazilian Portuguese terms.
 */

export const TRANSLATION_LOCALES = [
  "zh-TW",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
] as const;

export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

type LocalizedTerm = Record<TranslationLocale, string>;

export const APPLE_UI_TERMINOLOGY = {
  Settings: {
    "zh-TW": "設定",
    ja: "設定",
    ko: "설정",
    fr: "Réglages",
    de: "Einstellungen",
    es: "Ajustes",
    pt: "Ajustes",
    it: "Impostazioni",
    ru: "Настройки",
  },
  Trash: {
    "zh-TW": "垃圾桶",
    ja: "ゴミ箱",
    ko: "휴지통",
    fr: "Corbeille",
    de: "Papierkorb",
    es: "Papelera",
    pt: "Lixo",
    it: "Cestino",
    ru: "Корзина",
  },
  Account: {
    "zh-TW": "帳號",
    ja: "アカウント",
    ko: "계정",
    fr: "Compte",
    de: "Account",
    es: "Cuenta",
    pt: "Conta",
    it: "Account",
    ru: "Учетная запись",
  },
  "Log Out": {
    "zh-TW": "登出",
    ja: "ログアウト",
    ko: "로그아웃",
    fr: "Fermer la session",
    de: "Abmelden",
    es: "Cerrar sesión",
    pt: "Finalizar Sessão",
    it: "Logout",
    ru: "Завершить сеанс",
  },
  Cancel: {
    "zh-TW": "取消",
    ja: "キャンセル",
    ko: "취소",
    fr: "Annuler",
    de: "Abbrechen",
    es: "Cancelar",
    pt: "Cancelar",
    it: "Annulla",
    ru: "Отмена",
  },
  Save: {
    "zh-TW": "儲存",
    ja: "保存",
    ko: "저장",
    fr: "Enregistrer",
    de: "Sichern",
    es: "Guardar",
    pt: "Salvar",
    it: "Salva",
    ru: "Сохранить",
  },
  Delete: {
    "zh-TW": "刪除",
    ja: "削除",
    ko: "삭제",
    fr: "Supprimer",
    de: "Löschen",
    es: "Eliminar",
    pt: "Apagar",
    it: "Elimina",
    ru: "Удалить",
  },
  Open: {
    "zh-TW": "打開",
    ja: "開く",
    ko: "열기",
    fr: "Ouvrir",
    de: "Öffnen",
    es: "Abrir",
    pt: "Abrir",
    it: "Apri",
    ru: "Открыть",
  },
  Close: {
    "zh-TW": "關閉",
    ja: "閉じる",
    ko: "닫기",
    fr: "Fermer",
    de: "Schließen",
    es: "Cerrar",
    pt: "Fechar",
    it: "Chiudi",
    ru: "Закрыть",
  },
  "New Window": {
    "zh-TW": "新增視窗",
    ja: "新規ウインドウ",
    ko: "새로운 윈도우",
    fr: "Nouvelle fenêtre",
    de: "Neues Fenster",
    es: "Nueva ventana",
    pt: "Nova Janela",
    it: "Nuova finestra",
    ru: "Новое окно",
  },
  "Full Screen": {
    "zh-TW": "全螢幕",
    ja: "フルスクリーン",
    ko: "전체 화면",
    fr: "Plein écran",
    de: "Vollbild",
    es: "Pantalla completa",
    pt: "Tela Cheia",
    it: "A tutto schermo",
    ru: "На весь экран",
  },
  Help: {
    "zh-TW": "輔助說明",
    ja: "ヘルプ",
    ko: "도움말",
    fr: "Aide",
    de: "Hilfe",
    es: "Ayuda",
    pt: "Ajuda",
    it: "Aiuto",
    ru: "Справка",
  },
} as const satisfies Record<string, LocalizedTerm>;

export type AppleUiTerm = keyof typeof APPLE_UI_TERMINOLOGY;

const ELLIPSIS_SUFFIX = /(?:\.\.\.|…)$/u;

export function getExpectedAppleUiTerm(
  englishValue: string,
  locale: TranslationLocale
): string | null {
  const source = englishValue.replace(ELLIPSIS_SUFFIX, "") as AppleUiTerm;
  const translations = APPLE_UI_TERMINOLOGY[source];

  if (!translations || (englishValue !== source && !ELLIPSIS_SUFFIX.test(englishValue))) {
    return null;
  }

  const suffix = ELLIPSIS_SUFFIX.test(englishValue) ? "…" : "";
  return `${translations[locale]}${suffix}`;
}

export function formatAppleTerminologyForPrompt(
  locale: TranslationLocale
): string {
  return Object.entries(APPLE_UI_TERMINOLOGY)
    .map(([english, translations]) => `${english} → ${translations[locale]}`)
    .join("\n");
}
