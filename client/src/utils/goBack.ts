import type { Href } from "expo-router";

interface BackRouter {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
}

/**
 * A screen opened straight from a link or notification has nothing behind it,
 * and a bare router.back() there throws "GO_BACK was not handled".
 */
export const goBackOr = (router: BackRouter, fallback: Href): void => {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
};
