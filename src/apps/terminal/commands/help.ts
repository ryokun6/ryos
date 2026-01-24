import { Command } from "../types";
import i18n from "@/lib/i18n";

export const helpCommand: Command = {
  name: "help",
  description: "apps.terminal.commands.help",
  handler: () => {
    const t = (key: string) => i18n.t(key);
    
    return {
      output: `
navigation & files
  pwd              ${t("apps.terminal.commands.pwd")}
  ls               ${t("apps.terminal.commands.ls")}
  cd <dir>         ${t("apps.terminal.commands.cd")}
  cat <file>       ${t("apps.terminal.commands.cat")}
  touch <file>     ${t("apps.terminal.commands.touch")}
  mkdir <dir>      ${t("apps.terminal.commands.mkdir")}
  rm <file>        ${t("apps.terminal.commands.rm")}
  open <target>    ${t("apps.terminal.commands.open")}
  edit <file>      ${t("apps.terminal.commands.edit")}
  vim <file>       ${t("apps.terminal.commands.vim")}
  grep <pat> <f>   ${t("apps.terminal.commands.grep")}

terminal
  clear            ${t("apps.terminal.commands.clear")}
  help             ${t("apps.terminal.commands.help")}
  history          ${t("apps.terminal.commands.history")}
  about            ${t("apps.terminal.commands.about")}
  echo <text>      ${t("apps.terminal.commands.echo")}
  whoami           ${t("apps.terminal.commands.whoami")}
  su <user> [pass] ${t("apps.terminal.commands.su")}
  logout           ${t("apps.terminal.commands.logout")}
  date             ${t("apps.terminal.commands.date")}
  cowsay <text>    ${t("apps.terminal.commands.cowsay")}
  uptime           ${t("apps.terminal.commands.uptime")}

assistant
  ryo <prompt>     ${t("apps.terminal.commands.ryo")}
  ai <prompt>      ${t("apps.terminal.commands.ai")}
  chat <prompt>    ${t("apps.terminal.commands.chat")}

`,
      isError: false,
    };
  },
};