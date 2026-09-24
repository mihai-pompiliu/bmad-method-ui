import type { FeatureComputationInput, FeatureNow, FeatureStep, StepId } from "./types";
import { featureI18n } from "./i18n.ru";

function findStep(steps: FeatureStep[], id: StepId): FeatureStep {
  const step = steps.find((value) => value.id === id);
  if (!step) throw new Error(`Missing feature step: ${id}`);
  return step;
}

/** Pure implementation of the ordered rules in feature-board specification section 9. */
export function computeFeatureNow(input: FeatureComputationInput, steps: FeatureStep[]): FeatureNow {
  const copy = featureI18n.now;
  const blockedStory = input.sprintStories.find((story) => story.status === "blocked");
  const question = input.questions.find((item) => item.status === "open" && item.feature === input.spec.slug);
  if (blockedStory || question) {
    return {
      status: copy.stopped,
      reason: question?.question ?? blockedStory?.blockedReason ?? copy.blockedReason(blockedStory?.id),
      next: question ? copy.answerQuestion : copy.clearBlocker,
    };
  }

  const mockup = findStep(steps, "mockup");
  if (mockup.state === "check" || (mockup.state === "unknown" && input.config.features[input.spec.slug]?.mockupApproval)) {
    return {
      status: copy.needsCheck,
      reason: mockup.state === "check"
        ? copy.mockupConflict
        : copy.mockupUnreadable,
      next: copy.alignMockup,
    };
  }

  const plan = findStep(steps, "plan");
  if (plan.state === "partial") {
    return {
      status: copy.waitingPlanning,
      reason: copy.planningReason,
      next: copy.splitSpec,
    };
  }

  const epicStoryIds = new Set(input.epic?.stories.map((story) => story.id) ?? []);
  const sprintStories = input.sprintStories.filter((story) => epicStoryIds.has(story.id));
  if (input.epic && input.epic.stories.length > 0 && input.sprintStatusAvailable && sprintStories.length === 0) {
    const firstStory = input.epic.stories[0]?.id;
    return {
      status: copy.waitingStart,
      reason: copy.startReason,
      next: firstStory ? copy.start(firstStory) : null,
    };
  }

  const inProgress = sprintStories.find((story) => story.status === "in-progress");
  if (inProgress) {
    return {
      status: copy.inProgress,
      reason: copy.inProgressReason(inProgress.id),
      next: copy.waitDone(inProgress.id),
    };
  }
  const review = sprintStories.find((story) => story.status === "review");
  if (review) {
    return {
      status: copy.review,
      reason: copy.reviewReason(review.id),
      next: copy.reviewCode(review.id),
    };
  }

  const code = findStep(steps, "code");
  const test = findStep(steps, "test");
  const production = findStep(steps, "production");
  if (code.state === "done" && test.state !== "done") {
    return { status: copy.readyForTest, reason: copy.readyReason, next: copy.releaseToTest };
  }
  if (test.state === "done" && production.state !== "done") {
    return {
      status: copy.onTest,
      reason: copy.testReason(test.date ? test.date.slice(8, 10) + "." + test.date.slice(5, 7) : copy.noDate),
      next: copy.acceptAndRelease,
    };
  }
  if (production.state === "done") {
    return {
      status: copy.inProduction,
      reason: copy.productionReason(production.date ? production.date.slice(8, 10) + "." + production.date.slice(5, 7) : copy.confirmedDate),
      next: null,
    };
  }

  const unknown = steps.find((item) => item.state === "unknown");
  return {
    status: copy.unknown,
    reason: unknown?.reason ?? copy.fallback,
    next: null,
  };
}
