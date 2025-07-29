import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "light" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
            fontFamily: "var(--os-font-ui)",
            WebkitFontSmoothing: "antialiased",
            fontSmooth: "always",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
