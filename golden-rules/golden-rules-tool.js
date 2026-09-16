let currentGoldenRulesTool = "convert";

/* An in-content ad slot used to get inserted after each tool's 3rd
   article here (adsbygoogle .ad-slot-incontent, ~50px + 24-32px margin
   each side) — removed: this page never actually loads the AdSense
   script (no <script src=".../adsbygoogle.js"> anywhere in it, unlike
   index.html which at least keeps that commented out pending real ad
   units), so the slot never rendered anything — it just permanently
   reserved dead space, visible as a much bigger gap between article 3
   and 4 than the uniform 16px every other pair gets. Re-add only
   alongside the actual script tag if/when ads are wired up here. */
function selectGoldenRulesTool(tool){
  if (tool) currentGoldenRulesTool = tool;
  document.querySelectorAll(".golden-rules-tool-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === currentGoldenRulesTool);
  });
  document.querySelectorAll(".golden-rules-articles").forEach(el => {
    el.classList.toggle("active", el.dataset.tool === currentGoldenRulesTool);
  });
}

/* The switcher only shows the active tool's pill until hovered/focused
   (pure CSS — see .golden-rules-switcher in golden-rules/index.html).
   :hover never fires on tap, so touch needs its own reveal step: a tap
   on the already-active pill while collapsed just expands the row
   instead of re-selecting the same tool (which would be a no-op anyway);
   a tap on any other visible pill selects normally and re-collapses. */
const grSwitcher = document.querySelector(".golden-rules-switcher");
document.querySelectorAll(".golden-rules-tool-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const collapsed = grSwitcher && !grSwitcher.classList.contains("expanded");
    if (collapsed && btn.classList.contains("active")) {
      e.preventDefault();
      grSwitcher.classList.add("expanded");
      return;
    }
    selectGoldenRulesTool(btn.dataset.tool);
    if (grSwitcher) grSwitcher.classList.remove("expanded");
    // A clicked button keeps focus by default, which would hold the row
    // open via :focus-within even after the mouse leaves — blur it so
    // the row actually collapses back down to just the chosen tool.
    btn.blur();
  });
});
if (grSwitcher) {
  document.addEventListener("click", (e) => {
    if (!grSwitcher.contains(e.target)) grSwitcher.classList.remove("expanded");
  });
}

/* Every tool page's own "Getting started with" footer links here with
   ?tool=<id> (see shared/site.js's .go-to-golden-rules handler) so
   arriving from, say, Coudio's page opens straight to Coudio's own
   golden rules instead of always landing on Convert's. Falls back to
   the default when the param's missing or doesn't match a real tab
   (a stray/unknown value would otherwise leave every button
   unselected — .golden-rules-tool-btn[data-tool] lists the valid ids). */
const requestedTool = new URLSearchParams(location.search).get("tool");
const validTools = [...document.querySelectorAll(".golden-rules-tool-btn")].map(btn => btn.dataset.tool);
selectGoldenRulesTool(validTools.includes(requestedTool) ? requestedTool : "convert");
