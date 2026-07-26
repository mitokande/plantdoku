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
  common: "#6E8B73",
  rare: "#3E92D0",
  legendary: "#E0A21B",
};

/** All 17 cards in unlock order (stars strictly increasing). */
export const CARDS: PlantCard[] = [
  { plantId: "sprout", name: "Sprout", rarity: "common", stars: 1,
    flavor: "Every great garden starts with two little leaves." },
  { plantId: "sunflower", name: "Sunflower", rarity: "common", stars: 4,
    flavor: "Follows the sun all day — and you, when you're not looking." },
  { plantId: "daisy", name: "Daisy", rarity: "common", stars: 8,
    flavor: "Simple, cheerful, and always first to the party." },
  { plantId: "clover", name: "Clover", rarity: "common", stars: 13,
    flavor: "Lucky for some. Not a substitute for deduction." },
  { plantId: "tulip", name: "Tulip", rarity: "common", stars: 19,
    flavor: "Once worth a house. Now worth nineteen stars." },
  { plantId: "cactus", name: "Cactus", rarity: "common", stars: 26,
    flavor: "Thrives on neglect and three-star pressure." },
  { plantId: "aloe", name: "Aloe", rarity: "common", stars: 34,
    flavor: "Soothes the sting of a board lost to one wrong tap." },
  { plantId: "fern", name: "Fern", rarity: "common", stars: 43,
    flavor: "Older than flowers. Still in no hurry." },
  { plantId: "toadstool", name: "Toadstool", rarity: "common", stars: 53,
    flavor: "Pops up overnight, exactly where you didn't look." },
  { plantId: "lavender", name: "Lavender", rarity: "rare", stars: 64,
    flavor: "Calms the gardener between two hard levels." },
  { plantId: "monstera", name: "Monstera", rarity: "rare", stars: 76,
    flavor: "Full of holes, and none of them a mistake." },
  { plantId: "waterlily", name: "Waterlily", rarity: "rare", stars: 88,
    flavor: "Blooms only for the patient. No hints required." },
  { plantId: "bonsai", name: "Bonsai", rarity: "rare", stars: 100,
    flavor: "A hundred stars, one careful cut at a time." },
  { plantId: "pitcher", name: "Pitcher", rarity: "rare", stars: 113,
    flavor: "Eats mistakes. Mostly mistakes." },
  { plantId: "frostbloom", name: "Frostbloom", rarity: "legendary", stars: 126,
    flavor: "A flower of pure ice. It never wilts — it only waits." },
  { plantId: "emberbud", name: "Emberbud", rarity: "legendary", stars: 139,
    flavor: "Plant with care. Water frequently." },
  { plantId: "nightspire", name: "Nightspire", rarity: "legendary", stars: 152,
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
