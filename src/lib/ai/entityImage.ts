import { db } from "@/db/client";
import { worlds, characters, locations, settings as settingsTable, aiCalls, type ImageOwnerKind } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { loadImages } from "@/lib/server";
import { imageToDataUrl } from "./images";
import { callOpenRouter, type ChatMessage, type ChatPart } from "./openrouter";
import { getModelForTask } from "./tasks";
import { serializePromptForStorage } from "./song";
import { GenerationError } from "./songScript";

export async function generateEntityImage(args: {
  worldId: string;
  entityId: string;
  kind: "character" | "location";
}) {
  const [world] = await db.select().from(worlds).where(eq(worlds.id, args.worldId));
  if (!world) throw new GenerationError(404, "World not found");

  let entityName = "";
  let entityDescription = "";

  if (args.kind === "character") {
    const [char] = await db.select().from(characters).where(eq(characters.id, args.entityId));
    if (!char) throw new GenerationError(404, "Character not found");
    entityName = char.name;
    entityDescription = char.description;
  } else {
    const [loc] = await db.select().from(locations).where(eq(locations.id, args.entityId));
    if (!loc) throw new GenerationError(404, "Location not found");
    entityName = loc.name;
    entityDescription = loc.description;
  }

  const [config] = await db.select().from(settingsTable).limit(1);
  const apiKey = config?.openrouterApiKey?.trim();
  if (!apiKey) throw new GenerationError(400, "OpenRouter API key missing");

  const moodImages = await loadImages("world_mood", world.id);
  const imageModel = getModelForTask("generate_image", config?.taskModels ?? {});

  const imageParts: ChatPart[] = await Promise.all(
    moodImages.slice(0, 3).map(async (img) => {
      const dataUrl = await imageToDataUrl({ s3Key: img.s3Key, mimeType: img.mimeType });
      return { type: "image_url", image_url: { url: dataUrl || "" } } as ChatPart;
    })
  );

  const prompt = [
    `Generate a high-quality ${args.kind} image for the world "${world.name}".`,
    `World Art Style: ${world.artStyle}`,
    `World Description: ${world.description}`,
    `Entity Name: ${entityName}`,
    `Entity Description: ${entityDescription}`,
    "",
    "Instructions:",
    `- Maintain strict stylistic consistency with the provided world mood images.`,
    `- Focus on the ${args.kind} specifically.`,
    `- If it's a character, show a clear cinematic portrait.`,
    `- If it's a location, show a wide cinematic view.`,
    `- Output the image in 16:9 aspect ratio.`,
    `- No text overlays or watermarks.`,
  ].filter(Boolean).join("\n");

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        ...imageParts.filter(p => (p as any).image_url.url),
        { type: "text", text: prompt }
      ]
    }
  ];

  const start = Date.now();
  const result = await callOpenRouter({
    apiKey,
    model: imageModel,
    messages,
    modalities: ["image", "text"],
    imageConfig: {
      aspect_ratio: "16:9",
    },
  });

  // Log the AI call
  await db.insert(aiCalls).values({
    worldId: args.worldId,
    storyId: null,
    task: `generate_${args.kind}_image`,
    model: imageModel,
    prompt: serializePromptForStorage(messages),
    response: result.images.length > 0 ? `[${result.images.length} images generated]` : result.text,
    costUsd: result.usage.costUsd?.toString(),
    durationMs: Date.now() - start,
  });

  if (result.images.length === 0) {
    throw new Error("AI failed to generate an image.");
  }

  return result.images[0];
}
