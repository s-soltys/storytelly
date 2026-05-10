import { redirect } from "next/navigation";

type Props = { params: Promise<{ worldId: string }> };

export default async function NewLocationPage({ params }: Props) {
  const { worldId } = await params;
  redirect(`/worlds/${worldId}`);
}
