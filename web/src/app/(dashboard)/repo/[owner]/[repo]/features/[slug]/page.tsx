import { notFound, redirect } from "next/navigation";
import { FeatureCardView } from "@/components/features/feature-card-view";
import { getAuthenticatedRepoConfig, getAuthenticatedUserId } from "@/lib/db/helpers";
import { getCachedFeatureBoard } from "@/lib/features/cached-feature-board";
import { getGitHubToken } from "@/lib/github/client";

interface FeatureCardPageProps {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}

export default async function FeatureCardPage({ params }: FeatureCardPageProps) {
  const { owner, repo: repoName, slug } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const repoConfig = await getAuthenticatedRepoConfig(userId, owner, repoName);
  if (!repoConfig) return notFound();
  const token = repoConfig.sourceType === "local" ? undefined : (await getGitHubToken(userId)) ?? undefined;
  const board = await getCachedFeatureBoard(repoConfig, token, userId);
  const feature = board.features.find((item) => item.slug === slug);
  if (!feature) return notFound();

  return <FeatureCardView feature={feature} owner={owner} repo={repoName} readAt={board.readAt} />;
}
