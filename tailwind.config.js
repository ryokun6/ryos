/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  // Only scan src/ - other paths don't exist in this project
  // Exclude generated files, test files, and non-component files to reduce scanning scope
  content: [
    "./src/**/*.{ts,tsx}",
    // Exclusions for faster scanning
    "!./src/**/*.generated.{ts,tsx}",
    "!./src/**/*.test.{ts,tsx}",
    "!./src/**/*.d.ts",
    "!./src/lib/*.json", // JSON data files
    "!./src/shaders/**", // WebGL shaders don't use Tailwind
    "./index.html",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        os: "var(--os-metrics-radius)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // OS Theme colors
        os: {
          window: {
            bg: "var(--os-color-window-bg)",
            border: "var(--os-color-window-border)",
          },
          menubar: {
            bg: "var(--os-color-menubar-bg)",
            border: "var(--os-color-menubar-border)",
            text: "var(--os-color-menubar-text)",
          },
          titlebar: {
            active: {
              bg: "var(--os-color-titlebar-active-bg)",
              text: "var(--os-color-titlebar-text)",
            },
            inactive: {
              bg: "var(--os-color-titlebar-inactive-bg)",
              text: "var(--os-color-titlebar-text-inactive)",
            },
          },
          button: {
            face: "var(--os-color-button-face)",
            highlight: "var(--os-color-button-highlight)",
            shadow: "var(--os-color-button-shadow)",
            activeFace: "var(--os-color-button-active-face)",
          },
          selection: {
            bg: "var(--os-color-selection-bg)",
            text: "var(--os-color-selection-text)",
          },
          text: {
            primary: "var(--os-color-text-primary)",
            secondary: "var(--os-color-text-secondary)",
            disabled: "var(--os-color-text-disabled)",
          },
        },
        // Keep system7 for backwards compatibility temporarily
        system7: {
          "window-bg": "#FFFFFF",
          "menubar-bg": "#FFFFFF",
          "title-bar": "#000000",
          "title-text": "#FFFFFF",
          border: "#000000",
          "button-highlight": "#FFFFFF",
          "button-shadow": "#808080",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      boxShadow: {
        "os-window": "var(--os-window-shadow)",
      },
      borderWidth: {
        os: "var(--os-metrics-border-width)",
      },
      borderColor: {
        "os-window": "var(--os-color-window-border)",
        "os-menubar": "var(--os-color-menubar-border)",
      },
      height: {
        "os-titlebar": "var(--os-metrics-titlebar-height)",
        "os-menubar": "var(--os-metrics-menubar-height)",
      },
      fontFamily: {
        "os-ui": "var(--os-font-ui)",
        "os-mono": "var(--os-font-mono)",
      },
      backgroundImage: {
        "os-titlebar-pattern": "var(--os-color-titlebar-pattern, none)",
      },
      typography: {
        DEFAULT: {
          css: {
            p: {
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },
            ul: {
              listStyleType: "disc",
              listStylePosition: "outside",
              marginLeft: "1.5em",
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },
            ol: {
              listStyleType: "decimal",
              listStylePosition: "outside",
              marginLeft: "1.5em",
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },
            "ul li, ol li": {
              marginTop: "0.25em",
              marginBottom: "0.25em",
              padding: 0,
            },
            "> ul > li p": {
              marginTop: "0.25em",
              marginBottom: "0.25em",
            },
            "> ol > li p": {
              marginTop: "0.25em",
              marginBottom: "0.25em",
            },
          },
        },
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-5px)" },
          "50%": { transform: "translateX(5px)" },
          "75%": { transform: "translateX(-5px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-100%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shake: "shake 0.4s ease-in-out",
        marquee: "marquee 20s linear infinite",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    function ({ addBase }) {
      addBase({
        img: {
          "image-rendering": "pixelated",
        },
      });
    },
  ],
  corePlugins: {
    preflight: true,
  },
};
