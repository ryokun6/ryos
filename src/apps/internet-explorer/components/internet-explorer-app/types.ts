export type InternetExplorerSuggestionItem = {
  title: string;
  url: string;
  type: "favorite" | "history" | "search";
  year?: string;
  favicon?: string;
};
