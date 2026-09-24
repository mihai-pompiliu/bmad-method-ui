import { notFound, redirect } from "next/navigation";
import { FeatureBoardView } from "@/components/features/feature-board-view";
import { getAuthenticatedRepoConfig, getAuthenticatedUserId } from "@/lib/db/helpers";
import { getCachedFeatureBoard } from "@/lib/features/cached-feature-board";
import { getGitHubToken } from "@/lib/github/client";

interface FeaturesPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function FeaturesPage({ params }: FeaturesPageProps) {
  const { owner, repo: repoName } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const repoConfig = await getAuthenticatedRepoConfig(userId, owner, repoName);
  if (!repoConfig) return notFound();
  const token = repoConfig.sourceType === "local" ? undefined : (await getGitHubToken(userId)) ?? undefined;
  const board = await getCachedFeatureBoard(repoConfig, token, userId);

  return <FeatureBoardView board={board} owner={owner} repo={repoName} displayName={repoConfig.displayName} />;
}
