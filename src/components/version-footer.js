import {
  APP_VERSION,
  CHANGELOG_URL,
  RELEASE_CHANNEL,
  RELEASE_COMMIT,
  RELEASE_DATE,
  RELEASE_URL
} from "../config/version.js";

const messages = Object.freeze({
  en: Object.freeze({ updates: "View updates" }),
  zh: Object.freeze({ updates: "查看更新" })
});

export function getVersionFooterModel(language = "en") {
  const normalizedLanguage = language === "zh" ? "zh" : "en";
  const channel = RELEASE_CHANNEL === "beta"
    ? "Beta"
    : RELEASE_CHANNEL.charAt(0).toUpperCase() + RELEASE_CHANNEL.slice(1);
  const isPublished = Boolean(RELEASE_DATE && RELEASE_COMMIT);
  return Object.freeze({
    product: "Cyber Table",
    version: APP_VERSION,
    channel,
    updatesLabel: messages[normalizedLanguage].updates,
    href: isPublished ? RELEASE_URL : CHANGELOG_URL,
    isPublished
  });
}
