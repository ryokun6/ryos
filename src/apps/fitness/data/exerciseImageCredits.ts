/** Credits for photos stored under `public/fitness/exercises/`. */
export interface ExerciseImageCredit {
  author: string;
  license: string;
  licenseUrl: string;
  /** Page where the original file and its license are published. */
  sourcePage: string;
  /** Original file URL the repo copy was made from. */
  sourceUrl: string;
}

export const EXERCISE_IMAGE_CREDITS: Record<string, ExerciseImageCredit> = {
  Bodyweight_Glute_Bridge: {
    author: "Marianne Gilbak",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Glute-bridge.png",
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/3/34/Glute-bridge.png",
  },
  Quadruped_Thoracic_Rotation: {
    author: "Eric Astrauskas",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourcePage: "https://www.flickr.com/photos/personaltrainertoronto/44067004171",
    sourceUrl: "https://live.staticflickr.com/1835/44067004171_45bf7cf066_b.jpg",
  },
};
