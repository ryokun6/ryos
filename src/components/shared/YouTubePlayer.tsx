import ReactPlayer from "react-player";
import type ReactPlayerType from "react-player";

export type YouTubePlayerProps = React.ComponentProps<typeof ReactPlayer>;

export const YouTubePlayer = function YouTubePlayer(
  {
    ref,
    config,
    ...props
  }: YouTubePlayerProps & {
    ref?: React.Ref<ReactPlayerType>;
  }
) {
  return (
    <ReactPlayer
      ref={ref}
      playsinline
      config={{
        youtube: {
          playerVars: {
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            disablekb: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            ...config?.youtube?.playerVars,
          },
          embedOptions: {
            referrerPolicy: "strict-origin-when-cross-origin",
            ...config?.youtube?.embedOptions,
          },
        },
        ...config,
      }}
      {...props}
    />
  );
};
