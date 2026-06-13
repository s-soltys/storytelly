import { db } from "./client";
import {
  worlds,
  characters,
  locations,
  stories,
  storyCharacters,
  storyLocations,
  settings,
} from "./schema";

async function main() {
  console.log("🌱 Starting database seeding...");

  // 1. Clear existing data (optional but good for a clean seed)
  console.log("🧹 Cleaning up existing data...");
  await db.delete(storyLocations);
  await db.delete(storyCharacters);
  await db.delete(stories);
  await db.delete(locations);
  await db.delete(characters);
  await db.delete(worlds);
  await db.delete(settings);

  // 2. Create Settings
  console.log("⚙️ Seeding settings...");
  await db.insert(settings).values({
    id: 1,
    openrouterApiKey: null,
    taskModels: {
      lyrics: "google/gemini-2.5-flash",
      storyboards: "google/gemini-2.5-flash",
    },
  });

  // 3. Create Cyberpunk World
  console.log("🌍 Seeding Cyberpunk world...");
  const [cyberWorld] = await db
    .insert(worlds)
    .values({
      name: "Neon Syndicate",
      artStyle: "Dark synthwave cyberpunk, neon-soaked streets, rain reflections, retro-futurism",
      description: "A megacity ruled by corporations and street gangs, where cybernetics are cheap but human life is cheaper.",
    })
    .returning();

  // Cyberpunk Characters
  console.log("👤 Seeding Cyberpunk characters...");
  const [jax, val, kerr] = await db
    .insert(characters)
    .values([
      {
        worldId: cyberWorld.id,
        name: "Jax Ryder",
        description: "A cynical street-samurai hacker with a mechanical left arm and a penchant for vintage cigarettes.",
      },
      {
        worldId: cyberWorld.id,
        name: "Valerie 'Val' Vex",
        description: "An underground DJ and information broker who operates from the Neon Heights nightclub.",
      },
      {
        worldId: cyberWorld.id,
        name: "Kerr Corporate",
        description: "A cold, calculating executive for Arasaka-Neo, tasked with locating stolen biotech specs.",
      },
    ])
    .returning();

  // Cyberpunk Locations
  console.log("📍 Seeding Cyberpunk locations...");
  const [, club] = await db
    .insert(locations)
    .values([
      {
        worldId: cyberWorld.id,
        name: "Rainy Alleyway",
        description: "A dark, steam-filled alley between two towering megastructures. Smells of garbage and ozone.",
      },
      {
        worldId: cyberWorld.id,
        name: "Neon Heights",
        description: "The premier underground club of the lower sectors, pulsing with heavy synth beats and holographic dancers.",
      },
    ])
    .returning();

  // Cyberpunk Stories
  console.log("📖 Seeding Cyberpunk stories...");
  const [cyberStory1] = await db
    .insert(stories)
    .values({
      worldId: cyberWorld.id,
      name: "The Biotech Heist",
      description: "Jax Ryder must retrieve the stolen biotech specs from Valerie at Neon Heights before Kerr's hitmen arrive.",
      lengthSeconds: 60,
      lyrics: "In the rain of the neon light\nWe fight for our lives tonight\nNo future in the sky\nJust data in the eye.",
    })
    .returning();

  await db.insert(storyCharacters).values([
    { storyId: cyberStory1.id, characterId: jax.id },
    { storyId: cyberStory1.id, characterId: val.id },
    { storyId: cyberStory1.id, characterId: kerr.id },
  ]);

  await db.insert(storyLocations).values([
    { storyId: cyberStory1.id, locationId: club.id },
  ]);

  // 4. Create Fantasy World
  console.log("🌍 Seeding Fantasy world...");
  const [fantasyWorld] = await db
    .insert(worlds)
    .values({
      name: "Eldoria",
      artStyle: "High-fantasy watercolor, vibrant forests, mystical lighting, ancient ruins",
      description: "A world of magic and ancient beasts, where the remnant powers of old gods still shape the land.",
    })
    .returning();

  // Fantasy Characters
  console.log("👤 Seeding Fantasy characters...");
  const [elena, thorgar] = await db
    .insert(characters)
    .values([
      {
        worldId: fantasyWorld.id,
        name: "Elena of the Glade",
        description: "An elf archer and guardian of the Whispering Woods, possessing the ability to talk to flora.",
      },
      {
        worldId: fantasyWorld.id,
        name: "Thorgar Ironbreaker",
        description: "A rogue dwarf warrior seeking his family's lost runic hammer in the depths of the Forgotten Dungeon.",
      },
    ])
    .returning();

  // Fantasy Locations
  console.log("📍 Seeding Fantasy locations...");
  const [woods, dungeon] = await db
    .insert(locations)
    .values([
      {
        worldId: fantasyWorld.id,
        name: "Whispering Woods",
        description: "A dense, luminescent forest where the trees whisper secrets of the past to those who listen.",
      },
      {
        worldId: fantasyWorld.id,
        name: "Forgotten Dungeon",
        description: "An ancient stone labyrinth buried deep beneath the mountains, guarded by runic constructs.",
      },
    ])
    .returning();

  // Fantasy Stories
  console.log("📖 Seeding Fantasy stories...");
  const [fantasyStory1] = await db
    .insert(stories)
    .values({
      worldId: fantasyWorld.id,
      name: "The Runestone Quest",
      description: "Thorgar hires Elena to navigate the Whispering Woods and unlock the Forgotten Dungeon's gates.",
      lengthSeconds: 90,
      lyrics: "Under the whispering leaves we go\nWhere the ancient waters flow\nTo the dark of the stone below.",
    })
    .returning();

  await db.insert(storyCharacters).values([
    { storyId: fantasyStory1.id, characterId: elena.id },
    { storyId: fantasyStory1.id, characterId: thorgar.id },
  ]);

  await db.insert(storyLocations).values([
    { storyId: fantasyStory1.id, locationId: woods.id },
    { storyId: fantasyStory1.id, locationId: dungeon.id },
  ]);

  console.log("✅ Database seeded successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
