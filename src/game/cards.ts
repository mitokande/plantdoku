// Plant-card collection meta: every plant in the deck is a collectible card
// unlocked at a total-star milestone (stars come from level ratings, see
// stars.ts). Pure data + logic only — headless-safe (no RN / asset imports);
// sprites are looked up by plantId via plants.ts in the UI layer.
//
// Thresholds are tuned to the 60-level table (max 60 × 3 = 180★): a card every
// level or two early on, slowing toward the last legendary at 152★.

export type CardRarity = "common" | "rare" | "legendary";

export interface PlantCard {
  /** Must match an id in palette.ts PLANT_IDS (and a sprite in plants.ts). */
  plantId: string;
  name: string;
  rarity: CardRarity;
  flavor: string;
  /** Total stars required to unlock this card. */
  stars: number;
}

/** Display tint per rarity (plain data so this module stays headless-safe). */
export const RARITY_COLORS: Record<CardRarity, string> = {
  common: "#A7C3A8",
  rare: "#88C4F0",
  legendary: "#FFD66B",
};

/** All 17 cards in unlock order (stars strictly increasing). */
export const CARDS: PlantCard[] = [
  { plantId: "leaf", name: "Leaf", rarity: "common", stars: 1,
    flavor: "Every great garden starts with a single leaf." },
  { plantId: "sunflower", name: "Sunflower", rarity: "common", stars: 4,
    flavor: "Follows the sun all day — and you, when you're not looking." },
  { plantId: "daisy", name: "Daisy", rarity: "common", stars: 8,
    flavor: "Simple, cheerful, and always first to the party." },
  { plantId: "peashooter", name: "Peashooter", rarity: "common", stars: 13,
    flavor: "Keeps the garden safe. Don't stand in front of it." },
  { plantId: "cherries", name: "Cherries", rarity: "common", stars: 19,
    flavor: "Two of a kind — they refuse to be planted apart." },
  { plantId: "garlic", name: "Garlic", rarity: "common", stars: 26,
    flavor: "Nothing touches it. Not even diagonally." },
  { plantId: "bluebell", name: "Bluebell", rarity: "common", stars: 34,
    flavor: "Rings softly at dusk when a puzzle is solved." },
  { plantId: "cactus", name: "Cactus", rarity: "common", stars: 43,
    flavor: "Thrives on neglect and three-star pressure." },
  { plantId: "aloe", name: "Aloe", rarity: "common", stars: 53,
    flavor: "Soothes the sting of a level lost to one wrong tap." },
  { plantId: "yellow-mushroom", name: "Sun Cap", rarity: "rare", stars: 64,
    flavor: "Glows faintly — handy in a garden at dusk." },
  { plantId: "vine", name: "Vine", rarity: "rare", stars: 76,
    flavor: "Give it one cell and it will want the whole cluster." },
  { plantId: "lotus", name: "Lotus", rarity: "rare", stars: 88,
    flavor: "Blooms only for the patient. No hints required." },
  { plantId: "purple-mushroom", name: "Dusk Cap", rarity: "rare", stars: 100,
    flavor: "Only sprouts where the moonlight lands." },
  { plantId: "chomper", name: "Chomper", rarity: "rare", stars: 113,
    flavor: "Eats mistakes. Mostly mistakes." },
  { plantId: "ice-crystal", name: "Frostbloom", rarity: "legendary", stars: 126,
    flavor: "A flower of pure ice. It never wilts — it only waits." },
  { plantId: "flame", name: "Emberbud", rarity: "legendary", stars: 139,
    flavor: "Plant with care. Water frequently." },
  { plantId: "purple-spike", name: "Nightspire", rarity: "legendary", stars: 152,
    flavor: "The rarest bloom of all. Legends say it grants a perfect solve." },
];

/** Cards unlocked at a given total-star count, in unlock order. */
export function unlockedCards(totalStars: number): PlantCard[] {
  return CARDS.filter((c) => totalStars >= c.stars);
}

/** The next card to be unlocked, or null once the collection is complete. */
export function nextCard(totalStars: number): PlantCard | null {
  return CARDS.find((c) => totalStars < c.stars) ?? null;
}

/** Cards crossed by a star gain (prev → next), e.g. by one solve. */
export function newlyUnlocked(
  prevStars: number,
  nextStars: number,
): PlantCard[] {
  return CARDS.filter((c) => prevStars < c.stars && nextStars >= c.stars);
}
