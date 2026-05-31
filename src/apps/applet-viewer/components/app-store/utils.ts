import type { TFunction } from "i18next";

export function ensureMacFonts(content: string, isMacTheme: boolean): string {
  if (!isMacTheme || !content) return content;
  const preload = `<link rel="stylesheet" href="/fonts/fonts.css">`;
  const fontStyle = `<style data-ryos-applet-font-fix>
      html,body{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
      *{font-family:inherit!important}
      h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
    </style>`;

  const headCloseIdx = content.toLowerCase().lastIndexOf("</head>");
  if (headCloseIdx !== -1) {
    return (
      content.slice(0, headCloseIdx) +
      preload +
      fontStyle +
      content.slice(headCloseIdx)
    );
  }

  const bodyOpenIdx = content.toLowerCase().indexOf("<body");
  if (bodyOpenIdx !== -1) {
    const bodyTagEnd = content.indexOf(">", bodyOpenIdx) + 1;
    return (
      content.slice(0, bodyTagEnd) +
      preload +
      fontStyle +
      content.slice(bodyTagEnd)
    );
  }

  return preload + fontStyle + content;
}

export function formatUpdateTime(timestamp: number, t: TFunction): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const updateDate = new Date(timestamp);
  const today = new Date();
  const isToday =
    updateDate.getDate() === today.getDate() &&
    updateDate.getMonth() === today.getMonth() &&
    updateDate.getFullYear() === today.getFullYear();

  if (isToday) {
    if (diffMins < 1) return t("apps.applet-viewer.status.updatedJustNow");
    if (diffMins < 60)
      return t("apps.applet-viewer.status.updatedMinutesAgo", { minutes: diffMins });
    return t("apps.applet-viewer.status.updatedHoursAgo", { hours: diffHours });
  }

  if (diffDays === 1) return t("apps.applet-viewer.status.updatedYesterday");
  if (diffDays < 7) return t("apps.applet-viewer.status.updatedDaysAgo", { days: diffDays });
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return t("apps.applet-viewer.status.updatedWeeksAgo", { weeks });
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return t("apps.applet-viewer.status.updatedMonthsAgo", { months });
  }
  const years = Math.floor(diffDays / 365);
  return t("apps.applet-viewer.status.updatedYearsAgo", { years });
}
