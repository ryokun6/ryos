import { Command } from "../types";

export const helpCommand: Command = {
  name: "help",
  description: "Show available commands",
  handler: () => ({
    output: `
navigation & files
  pwd              show current directory
  ls               list directory contents  
  cd <dir>         change directory
  cat <file>       view file contents
  touch <file>     create empty file
  mkdir <dir>      create directory
  rm <file>        move file to trash
  edit <file>      open in text editor
  vim <file>       open in vim editor

terminal
  clear            clear screen
  help             show this help
  history          show command history
  about            about terminal
  echo <text>      display text
  whoami           display current user
  su <user> [pass] switch or create user
  logout           log out current user
  date             display current date/time
  cowsay <text>    a talking cow

assistant
  zi <prompt>      chat with zi
  ai <prompt>      chat with zi (alias)
  chat <prompt>    chat with zi (alias)

`,
    isError: false,
  }),
};