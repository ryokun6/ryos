export interface UserPictureCategory {
  id: string;
  label: string;
  pictures: UserPicture[];
}

export interface UserPicture {
  id: string;
  name: string;
  path: string;
}

const BASE = "/user-pictures";

function pic(category: string, file: string, name: string): UserPicture {
  return { id: `${category}/${file}`, name, path: `${BASE}/${category}/${file}.png` };
}

export const USER_PICTURE_CATEGORIES: UserPictureCategory[] = [
  {
    id: "animals",
    label: "Animals",
    pictures: [
      pic("animals", "eagle", "Eagle"),
      pic("animals", "owl", "Owl"),
      pic("animals", "parrot", "Parrot"),
      pic("animals", "penguin", "Penguin"),
      pic("animals", "zebra", "Zebra"),
    ],
  },
  {
    id: "flowers",
    label: "Flowers",
    pictures: [
      pic("flowers", "dahlia", "Dahlia"),
      pic("flowers", "dandelion", "Dandelion"),
      pic("flowers", "flower", "Flower"),
      pic("flowers", "lotus", "Lotus"),
      pic("flowers", "poppy", "Poppy"),
      pic("flowers", "red-rose", "Red Rose"),
      pic("flowers", "sunflower", "Sunflower"),
      pic("flowers", "whiterose", "White Rose"),
      pic("flowers", "yellow-daisy", "Yellow Daisy"),
    ],
  },
  {
    id: "fun",
    label: "Fun",
    pictures: [
      pic("fun", "chalk", "Chalk"),
      pic("fun", "fortune-cookie", "Fortune Cookie"),
      pic("fun", "gingerbread-man", "Gingerbread Man"),
      pic("fun", "medal", "Medal"),
      pic("fun", "smack", "Smack"),
      pic("fun", "ying-yang", "Ying Yang"),
    ],
  },
  {
    id: "instruments",
    label: "Instruments",
    pictures: [
      pic("instruments", "drum", "Drum"),
      pic("instruments", "guitar", "Guitar"),
      pic("instruments", "piano", "Piano"),
      pic("instruments", "turntable", "Turntable"),
      pic("instruments", "violin", "Violin"),
    ],
  },
  {
    id: "nature",
    label: "Nature",
    pictures: [
      pic("nature", "cactus", "Cactus"),
      pic("nature", "earth", "Earth"),
      pic("nature", "leaf", "Leaf"),
      pic("nature", "lightning", "Lightning"),
      pic("nature", "nest", "Nest"),
      pic("nature", "sandollar", "Sand Dollar"),
      pic("nature", "snowflake", "Snowflake"),
      pic("nature", "zen", "Zen"),
    ],
  },
  {
    id: "sports",
    label: "Sports",
    pictures: [
      pic("sports", "8ball", "8-Ball"),
      pic("sports", "baseball", "Baseball"),
      pic("sports", "basketball", "Basketball"),
      pic("sports", "bowling", "Bowling"),
      pic("sports", "football", "Football"),
      pic("sports", "golf", "Golf"),
      pic("sports", "hockey", "Hockey"),
      pic("sports", "soccer", "Soccer"),
      pic("sports", "target", "Target"),
      pic("sports", "tennis", "Tennis"),
    ],
  },
];

export const ALL_USER_PICTURES = USER_PICTURE_CATEGORIES.flatMap((c) => c.pictures);
