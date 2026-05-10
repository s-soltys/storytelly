import { redirect } from "next/navigation";

type Props = { params: Promise<{ worldId: string }> };

export default async function CharacterPage({ params }: Props) {
  const { worldId } = await params;
  redirect(`/worlds/${worldId}`);
}
