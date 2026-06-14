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
          link: "var(--os-color-link)",
          text: {
            primary: "var(--os-color-text-primary)",
            secondary: "var(--os-color-text-secondary)",
            disabled: "var(--os-color-text-disabled)",
          },
          panel: {
            bg: "var(--os-color-panel-bg)",
          },
          separator: "var(--os-color-separator)",
          input: {
            bg: "var(--os-color-input-bg)",
            border: "var(--os-color-input-border)",
            focusBorder: "var(--os-color-input-focus-border)",
            focusRing: "var(--os-color-input-focus-ring)",
          },
          sidebar: {
            border: "var(--os-color-sidebar-border)",
          },
          switch: {
            track: "var(--os-color-switch-track)",
            trackChecked: "var(--os-color-switch-track-checked)",
          },
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
      zIndex: {
        base: "var(--z-base)",
        sticky: "var(--z-sticky)",
        dialog: "var(--z-dialog)",
        screensaver: "var(--z-screensaver)",
        fullscreen: "var(--z-fullscreen)",
        "expose-backdrop": "var(--z-expose-backdrop)",
        expose: "var(--z-expose)",
        menubar: "var(--z-menubar)",
        "menubar-expose": "var(--z-menubar-expose)",
        dropdown: "var(--z-dropdown)",
        submenu: "var(--z-submenu)",
        "spotlight-backdrop": "var(--z-spotlight-backdrop)",
        spotlight: "var(--z-spotlight)",
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
        /** TextEdit: drive @tailwindcss/typography from `themes.css` OS tokens so dark Aqua stays readable when `bg-white` is remapped to the dark window surface. */
        textedit: {
          css: {
            "--tw-prose-body": "var(--os-color-text-primary)",
            "--tw-prose-headings": "var(--os-color-text-primary)",
            "--tw-prose-lead": "var(--os-color-text-secondary)",
            "--tw-prose-links": "rgb(52, 106, 227)",
            "--tw-prose-bold": "var(--os-color-text-primary)",
            "--tw-prose-counters": "var(--os-color-text-secondary)",
            "--tw-prose-bullets": "var(--os-color-text-secondary)",
            "--tw-prose-hr": "var(--os-color-separator)",
            "--tw-prose-quotes": "var(--os-color-text-secondary)",
            "--tw-prose-quote-borders": "var(--os-color-separator)",
            "--tw-prose-captions": "var(--os-color-text-secondary)",
            "--tw-prose-kbd": "var(--os-color-text-primary)",
            "--tw-prose-kbd-shadows": "rgba(0, 0, 0, 0.12)",
            "--tw-prose-code": "var(--os-color-text-primary)",
            "--tw-prose-pre-code": "var(--os-color-text-secondary)",
            "--tw-prose-pre-bg": "var(--os-color-input-bg)",
            "--tw-prose-th-borders": "var(--os-color-separator)",
            "--tw-prose-td-borders": "var(--os-color-separator)",
          },
        },
      },
      keyframes: {
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
        shake: "shake 0.4s ease-in-out",
        marquee: "marquee 20s linear infinite",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    function ({ addVariant }) {
      addVariant("os-mac", ':root[data-os-platform="mac"] &');
      addVariant("os-windows", ':root[data-os-platform="windows"] &');
      addVariant("os-mac-aqua", ':root[data-os-mac-chrome="aqua"] &');
      addVariant("os-mac-system7", ':root[data-os-mac-chrome="system7"] &');
      // OS-level color-scheme variants. Only attached when the active theme
      // supports dark mode (see useThemeStore#applyRootThemeAttributes), so
      // these never accidentally fire on themes without dark tokens.
      addVariant("os-dark", ':root[data-os-color-scheme="dark"] &');
      addVariant(
        "os-mac-aqua-dark",
        ':root[data-os-mac-chrome="aqua"][data-os-color-scheme="dark"] &'
      );
      for (const id of ["system7", "macosx", "xp", "win98"]) {
        addVariant(`os-theme-${id}`, `:root[data-os-theme="${id}"] &`);
        addVariant(
          `os-theme-${id}-dark`,
          `:root[data-os-theme="${id}"][data-os-color-scheme="dark"] &`
        );
      }
    },
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
