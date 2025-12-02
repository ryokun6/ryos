import { Command } from "../types";
import i18n from "@/lib/i18n";

export const cdCommand: Command = {
  name: "cd",
  description: "apps.terminal.commands.cd",
  usage: "cd <dir>",
  handler: (args, context) => {
    if (args.length === 0) {
      context.navigateToPath("/");
      return { output: "", isError: false };
    }

    // Handle special case for parent directory
    if (args[0] === "..") {
      const pathParts = context.currentPath.split("/").filter(Boolean);
      const parentPath =
        pathParts.length > 0 ? "/" + pathParts.slice(0, -1).join("/") : "/";
      context.navigateToPath(parentPath);
      return { output: "", isError: false };
    }

    let newPath = args[0];

    // Handle relative paths
    if (!newPath.startsWith("/")) {
      newPath = `${context.currentPath === "/" ? "" : context.currentPath}/${newPath}`;
    }

    // Verify the path exists before navigating
    // First normalize the path to prevent issues with trailing slashes
    const normalizedPath =
      newPath.endsWith("/") && newPath !== "/"
        ? newPath.slice(0, -1)
        : newPath;

    // Get the parent directory to check if target exists
    const pathParts = normalizedPath.split("/").filter(Boolean);
    const targetDir = pathParts.pop(); // Remove the target directory from the path
    const parentPath =
      pathParts.length > 0 ? "/" + pathParts.join("/") : "/";

    // Special case for root directory
    if (normalizedPath === "/") {
      context.navigateToPath("/");
      return { output: "", isError: false };
    }

    // Get files in the parent directory
    const filesInParent = context.files.filter((file) => {
      const parentPathWithSlash = parentPath.endsWith("/")
        ? parentPath
        : parentPath + "/";
      return (
        file.path.startsWith(parentPathWithSlash) &&
        !file.path.replace(parentPathWithSlash, "").includes("/")
      );
    });

    // Check if the target directory exists
    const targetExists = filesInParent.some(
      (file) => file.name === targetDir && file.isDirectory
    );

    if (!targetExists) {
      return {
        output: i18n.t("apps.terminal.output.noSuchDirectory", { dir: args[0] }),
        isError: true,
      };
    }

    // Directory exists, navigate to it
    context.navigateToPath(normalizedPath);
    return { output: "", isError: false };
  },
};