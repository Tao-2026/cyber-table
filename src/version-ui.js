import { getLanguage } from "./core/i18n.js";
import { getVersionFooterModel } from "./components/version-footer.js";

const footer = document.querySelector("#version-info");
const app = document.querySelector("#app");

function renderVersionFooter() {
  if (!footer) return;
  const model = getVersionFooterModel(getLanguage());
  footer.replaceChildren();

  const text = document.createElement("span");
  text.textContent = `${model.product} v${model.version} ${model.channel} · `;

  const link = document.createElement("a");
  link.href = model.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = model.updatesLabel;
  link.setAttribute("aria-label", `${model.product} v${model.version} ${model.channel} — ${model.updatesLabel}`);

  footer.append(text, link);
}

renderVersionFooter();
if (app) new MutationObserver(renderVersionFooter).observe(app, { childList: true, subtree: true });
