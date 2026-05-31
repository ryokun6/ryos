import {
  APPLET_AUTH_BRIDGE_SCRIPT,
} from "@/utils/appletAuthBridge";

export function ensureMacFonts(
  content: string,
  isMacTheme: boolean,
  trusted: boolean
): string {
  if (!content) return content;

  const preload = `<link rel="stylesheet" href="/fonts/fonts.css">`;
  const fontStyle = isMacTheme
    ? `<style data-ryos-applet-font-fix>
    html,body{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
    *{font-family:inherit!important}
    h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
  </style>`
    : "";

  const authBridge = trusted ? APPLET_AUTH_BRIDGE_SCRIPT : "";
  const injectedContent = `${authBridge}${preload}${fontStyle}`;

  const headCloseIdx = content.toLowerCase().lastIndexOf("</head>");
  if (headCloseIdx !== -1) {
    return (
      content.slice(0, headCloseIdx) +
      injectedContent +
      content.slice(headCloseIdx)
    );
  }

  const bodyOpenIdx = content.toLowerCase().indexOf("<body");
  if (bodyOpenIdx !== -1) {
    const bodyTagEnd = content.indexOf(">", bodyOpenIdx) + 1;
    return (
      content.slice(0, bodyTagEnd) +
      injectedContent +
      content.slice(bodyTagEnd)
    );
  }

  return injectedContent + content;
}
