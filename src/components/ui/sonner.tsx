import { Toaster as Sonner, ToasterProps } from "sonner";
import { useThemeFlags } from "@/hooks/useThemeFlags";

const Toaster = ({ ...props }: ToasterProps) => {
  const { isDarkMode } = useThemeFlags();

  return (
    <Sonner
      theme={isDarkMode ? "dark" : "light"}
      className="toaster group"
      gap={8}
      {...props}
    />
  );
};

export { Toaster };
