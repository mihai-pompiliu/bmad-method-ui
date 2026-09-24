import { cache } from "react";
import { createContentProvider } from "@/lib/content-provider";
import { createUserOctokit } from "@/lib/github/client";
import type { RepoConfig } from "@/lib/types";
import { getGithubActivityForRepositories } from "./github-activity";
import { getFeatureBoard } from "./index";
import type { FeatureBoard } from "./types";

/**
 * React.cache()-wrapped feature-board loader. The provider and Octokit are
 * created inside the cached function, preserving the same request-level
 * deduplication boundary as getCachedBmadProject.
 */
export const getCachedFeatureBoard = cache(
  async (
    config: RepoConfig,
    accessToken: string | undefined,
    userId: string | undefined,
  ): Promise<FeatureBoard> => {
    const octokit = config.sourceType === "github" && accessToken
      ? createUserOctokit(accessToken)
      : undefined;
    const provider = createContentProvider(config, octokit, userId);
    return getFeatureBoard(
      config,
      provider,
      ({ repos, slug, storyIds }) => getGithubActivityForRepositories(octokit, userId, repos, slug, storyIds),
    );
  },
);
