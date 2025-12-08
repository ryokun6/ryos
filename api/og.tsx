import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

// App ID to macOS icon mapping (filename only)
const APP_ICONS: Record<string, string> = {
  finder: "mac.png",
  soundboard: "sound.png",
  "internet-explorer": "ie.png",
  chats: "question.png",
  textedit: "textedit.png",
  paint: "paint.png",
  "photo-booth": "photo-booth.png",
  minesweeper: "minesweeper.png",
  videos: "videos.png",
  ipod: "ipod.png",
  synth: "synth.png",
  pc: "pc.png",
  terminal: "terminal.png",
  "applet-viewer": "applet.png",
  "control-panels": "control-panels/appearance-manager/app.png",
};

// App display names
const APP_NAMES: Record<string, string> = {
  finder: "Finder",
  soundboard: "Soundboard",
  "internet-explorer": "Internet Explorer",
  chats: "Chats",
  textedit: "TextEdit",
  paint: "Paint",
  "photo-booth": "Photo Booth",
  minesweeper: "Minesweeper",
  videos: "Videos",
  ipod: "iPod",
  synth: "Synth",
  pc: "Virtual PC",
  terminal: "Terminal",
  "applet-viewer": "Applet Store",
  "control-panels": "Control Panels",
};

// Get base URL from request
function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  if (url.hostname === "os.ryo.lu") {
    return "https://os.ryo.lu";
  }
  return `${url.protocol}//${url.host}`;
}

// Fetch applet info from Redis
async function getAppletInfo(
  appletId: string
): Promise<{ title?: string; icon?: string; name?: string } | null> {
  try {
    const redis_url = process.env.REDIS_KV_REST_API_URL;
    const redis_token = process.env.REDIS_KV_REST_API_TOKEN;

    if (!redis_url || !redis_token) {
      return null;
    }

    const response = await fetch(`${redis_url}/get/applet:share:${appletId}`, {
      headers: {
        Authorization: `Bearer ${redis_token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.result) {
      const parsed =
        typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      return {
        title: parsed.title,
        icon: parsed.icon,
        name: parsed.name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const baseUrl = getBaseUrl(req);

    // Load font
    const fontData = await fetch(
      new URL("/fonts/LucidaGrande.ttf", baseUrl)
    ).then((res) => res.arrayBuffer());

    // Parse query parameters
    const app = url.searchParams.get("app");
    const video = url.searchParams.get("video");
    const applet = url.searchParams.get("applet");
    const title = url.searchParams.get("title");

    // Default values
    let iconUrl = `${baseUrl}/icons/mac-512.png`;
    let displayTitle = "ryOS";
    let subtitle = "An AI OS experience, made with Cursor";
    let showThumbnail = false;
    let thumbnailUrl = "";
    let isEmoji = false;
    let emojiIcon = "";

    // Handle different content types
    if (app && APP_ICONS[app]) {
      // App share
      iconUrl = `${baseUrl}/icons/macosx/${APP_ICONS[app]}`;
      displayTitle = APP_NAMES[app] || app;
      subtitle = "Open in ryOS";
    } else if (video) {
      // Video share (iPod or Videos app)
      showThumbnail = true;
      thumbnailUrl = `https://i.ytimg.com/vi/${video}/hqdefault.jpg`;
      displayTitle = title || "Shared Video";
      subtitle = "Watch on ryOS";
    } else if (applet) {
      // Applet share
      const appletInfo = await getAppletInfo(applet);
      if (appletInfo) {
        displayTitle = appletInfo.title || appletInfo.name || "Shared Applet";
        // Check if icon is an emoji (single character or emoji sequence)
        if (appletInfo.icon && /^[\p{Emoji}]+$/u.test(appletInfo.icon)) {
          isEmoji = true;
          emojiIcon = appletInfo.icon;
        } else {
          iconUrl = `${baseUrl}/icons/macosx/applet.png`;
        }
        subtitle = "Open in ryOS";
      } else {
        iconUrl = `${baseUrl}/icons/macosx/applet.png`;
        displayTitle = "Shared Applet";
        subtitle = "Open in ryOS";
      }
    }

    // Generate the OG image
    if (showThumbnail && thumbnailUrl) {
      // Video thumbnail layout
      return new ImageResponse(
        (
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              backgroundColor: "#000",
              position: "relative",
            }}
          >
            {/* Video thumbnail as background */}
            <img
              src={thumbnailUrl}
              alt=""
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.8,
              }}
            />
            {/* Gradient overlay */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 100%)",
              }}
            />
            {/* Content - left aligned with icon */}
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                padding: "0 40px 36px 40px",
              }}
            >
              {/* ryOS app icon */}
              <img
                src={`${baseUrl}/icons/mac-512.png`}
                alt=""
                width={80}
                height={80}
                style={{
                  objectFit: "contain",
                  marginRight: "24px",
                  flexShrink: 0,
                }}
              />
              {/* Text */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: "bold",
                    color: "white",
                    textAlign: "left",
                    textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                    fontFamily: "LucidaGrande",
                  }}
                >
                  {displayTitle}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    color: "rgba(255,255,255,0.8)",
                    marginTop: "6px",
                    textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                    fontFamily: "LucidaGrande",
                  }}
                >
                  {subtitle}
                </div>
              </div>
            </div>
          </div>
        ),
        {
          width: 800,
          height: 400,
          fonts: [
            {
              name: "LucidaGrande",
              data: fontData,
              style: "normal",
            },
          ],
        }
      );
    }

    // Standard app/applet layout - icon left, text right
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
            backgroundColor: "#d1d9dd",
            padding: "50px 60px",
          }}
        >
          {/* Big icon on the left */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isEmoji ? (
              <div style={{ fontSize: "240px" }}>{emojiIcon}</div>
            ) : (
              <img
                src={iconUrl}
                alt=""
                width={240}
                height={240}
                style={{
                  objectFit: "contain",
                }}
              />
            )}
          </div>

          {/* Text on the right */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              marginLeft: "50px",
            }}
          >
            {/* Title */}
            <div
              style={{
                fontSize: 64,
                fontWeight: "bold",
                color: "#000000",
                textAlign: "left",
                lineHeight: 1.1,
                fontFamily: "LucidaGrande",
                maxWidth: "420px",
              }}
            >
              {displayTitle}
            </div>

            {/* Subtitle */}
            <div
              style={{
                fontSize: 36,
                color: "#666666",
                textAlign: "left",
                marginTop: "14px",
                fontFamily: "LucidaGrande",
                maxWidth: "380px",
                lineHeight: 1.3,
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>
      ),
      {
        width: 800,
        height: 400,
        fonts: [
          {
            name: "LucidaGrande",
            data: fontData,
            style: "normal",
          },
        ],
      }
    );
  } catch (error) {
    console.error("OG image generation error:", error);

    return new Response(
      JSON.stringify({ error: "Failed to generate OG image" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
