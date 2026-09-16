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
const grSwitcher = document.querySelector(".golden-rules-switcher");
const grToolBtns = [...document.querySelectorAll(".golden-rules-tool-btn")];

/* Centers a given pill in the switcher — called on click (so a tap on
   an off-center pill animates itself into the fixed center slot) and
   once on load. Not called from the scroll handler below: while the
   user is actively scrolling, the center slot itself is what's fixed,
   not any particular pill, so re-centering there would fight the
   user's own scroll. */
function scrollToolIntoView(tool, behavior){
  const btn = grToolBtns.find(b => b.dataset.tool === tool);
  if (btn) btn.scrollIntoView({ behavior, inline: "center", block: "nearest" });
}

function selectGoldenRulesTool(tool){
  if (tool) currentGoldenRulesTool = tool;
  grToolBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === currentGoldenRulesTool);
  });
  document.querySelectorAll(".golden-rules-articles").forEach(el => {
    el.classList.toggle("active", el.dataset.tool === currentGoldenRulesTool);
  });
}

grToolBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    selectGoldenRulesTool(btn.dataset.tool);
    scrollToolIntoView(btn.dataset.tool, "smooth");
  });
});

/* Wheel-picker behavior: the "chosen" slot is a fixed position — dead
   center of the switcher — and scrolling (drag, wheel, trackpad, or
   the smooth scroll a click above triggers) brings a different pill
   into that slot rather than moving a highlight to wherever a pill
   ends up. On every scroll frame, find whichever pill's own center is
   closest to the container's center and make that one active — cheap
   enough at 8 buttons to just measure directly rather than reach for
   an IntersectionObserver. rAF-throttled so a fast drag/momentum
   scroll doesn't run this on every single scroll event. */
if (grSwitcher){
  let scrollRaf = null;
  function updateActiveFromScrollPosition(){
    scrollRaf = null;
    const containerCenter = grSwitcher.getBoundingClientRect().left + grSwitcher.clientWidth / 2;
    let closest = null;
    let closestDist = Infinity;
    grToolBtns.forEach(btn => {
      const rect = btn.getBoundingClientRect();
      const dist = Math.abs((rect.left + rect.width / 2) - containerCenter);
      if (dist < closestDist){
        closestDist = dist;
        closest = btn;
      }
    });
    if (closest && closest.dataset.tool !== currentGoldenRulesTool){
      selectGoldenRulesTool(closest.dataset.tool);
    }
  }
  grSwitcher.addEventListener("scroll", () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(updateActiveFromScrollPosition);
  }, { passive: true });
}

/* Every tool page's own "Getting started with" footer links here with
   ?tool=<id> (see shared/site.js's .go-to-golden-rules handler) so
   arriving from, say, Coudio's page opens straight to Coudio's own
   golden rules instead of always landing on Convert's. Falls back to
   the default when the param's missing or doesn't match a real tab
   (a stray/unknown value would otherwise leave every button
   unselected — .golden-rules-tool-btn[data-tool] lists the valid ids). */
const requestedTool = new URLSearchParams(location.search).get("tool");
const validTools = grToolBtns.map(btn => btn.dataset.tool);
const startTool = validTools.includes(requestedTool) ? requestedTool : "convert";
selectGoldenRulesTool(startTool);
scrollToolIntoView(startTool, "auto");
