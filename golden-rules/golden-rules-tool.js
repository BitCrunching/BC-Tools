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

document.querySelectorAll(".golden-rules-tool-btn").forEach(btn => {
  btn.addEventListener("click", () => selectGoldenRulesTool(btn.dataset.tool));
});

selectGoldenRulesTool("convert");
