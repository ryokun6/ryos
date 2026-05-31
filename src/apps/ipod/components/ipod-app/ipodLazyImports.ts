import { lazy } from "react";

export const CoverFlow = lazy(() =>
  import("../cover-flow/CoverFlow").then(({ CoverFlow }) => ({
    default: CoverFlow,
  }))
);
export const MusicQuiz = lazy(() =>
  import("../music-quiz/MusicQuiz").then(({ MusicQuiz }) => ({
    default: MusicQuiz,
  }))
);
export const BrickGame = lazy(() =>
  import("../brick-game/BrickGame").then(({ BrickGame }) => ({
    default: BrickGame,
  }))
);
export const LandscapeVideoBackground = lazy(() =>
  import("@/components/shared/LandscapeVideoBackground").then(
    ({ LandscapeVideoBackground }) => ({ default: LandscapeVideoBackground })
  )
);
export const AmbientBackground = lazy(() =>
  import("@/components/shared/AmbientBackground").then(({ AmbientBackground }) => ({
    default: AmbientBackground,
  }))
);
export const MeshGradientBackground = lazy(() =>
  import("@/components/shared/MeshGradientBackground").then(
    ({ MeshGradientBackground }) => ({ default: MeshGradientBackground })
  )
);
export const WaterBackground = lazy(() =>
  import("@/components/shared/WaterBackground").then(({ WaterBackground }) => ({
    default: WaterBackground,
  }))
);
