import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches the learner home and course player", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    expect(router.matchRoutes("/learn").at(-1)?.routeId).toBe("/learn/");
    const course = router
      .matchRoutes("/learn/10000000-0000-0000-0000-000000000001")
      .at(-1);
    expect(course?.routeId).toBe("/learn/$courseId");
    expect(course?.params).toMatchObject({
      courseId: "10000000-0000-0000-0000-000000000001",
    });
  });
});
