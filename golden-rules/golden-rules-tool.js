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

/* Magnetic wheel/trackpad stepping: a mouse wheel or trackpad gesture
   over the switcher moves exactly one tool at a time toward the fixed
   center slot, instead of free-scrolling proportionally to how hard
   the user scrolled. preventDefault stops the browser's own native
   scroll from running alongside this and fighting it. A short lock
   ignores further wheel input until the current step's smooth-scroll
   is mostly settled, so one fast scroll gesture can't blow past the
   very next tool — the "resistance" that makes it hard to overshoot.
   Kept short (350ms initially felt laggy — a trackpad swipe fires many
   wheel events in quick succession, and that lock silently dropped
   most of them; 200ms is the current middle ground between that and
   120ms, which held up fine against a same-tick overshoot burst but
   left room to tune). Native touch-drag scrolling (no
   wheel event) is untouched here; that's handled by
   scroll-snap-stop:always in golden-rules/index.html instead, since
   hijacking touch the same way would fight the platform's own
   momentum/rubber-banding feel. */
if (grSwitcher){
  let wheelLocked = false;
  let wheelUnlockTimer = null;
  grSwitcher.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (wheelLocked) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 4) return;
    const currentIndex = grToolBtns.findIndex(b => b.dataset.tool === currentGoldenRulesTool);
    const nextIndex = currentIndex + (delta > 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= grToolBtns.length) return;
    const nextBtn = grToolBtns[nextIndex];
    wheelLocked = true;
    selectGoldenRulesTool(nextBtn.dataset.tool);
    scrollToolIntoView(nextBtn.dataset.tool, "smooth");
    clearTimeout(wheelUnlockTimer);
    wheelUnlockTimer = setTimeout(() => { wheelLocked = false; }, 200);
  }, { passive: false });
}

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
