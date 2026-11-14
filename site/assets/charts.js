// Hover layer for the charts that build.py renders. Every value shown here is also in the
// page text or the chart's aria-label, so the charts read correctly without this script.
(function () {
  var tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "status");
  document.body.appendChild(tip);

  function show(text, x, y) {
    tip.textContent = text;
    tip.style.display = "block";
    var width = tip.offsetWidth;
    var left = Math.min(Math.max(8, x - width / 2), document.documentElement.clientWidth - width - 8);
    tip.style.left = left + window.scrollX + "px";
    tip.style.top = y + window.scrollY - tip.offsetHeight - 12 + "px";
  }

  function hide() {
    tip.style.display = "none";
  }

  document.addEventListener("pointermove", function (event) {
    var mark = event.target.closest && event.target.closest("[data-tip]");
    if (mark) show(mark.getAttribute("data-tip"), event.clientX, event.clientY);
    else if (!event.target.closest || !event.target.closest(".line-chart")) hide();
  });
  document.addEventListener("pointerleave", hide);
  window.addEventListener("scroll", hide, { passive: true });

  Array.prototype.forEach.call(document.querySelectorAll(".line-chart"), function (svg) {
    var data = JSON.parse(svg.getAttribute("data-line"));
    var cross = svg.querySelector(".cross");
    var dot = svg.querySelector(".cross-dot");
    var hit = svg.querySelector(".hit");
    var last = data.values.length - 1;

    hit.addEventListener("pointermove", function (event) {
      var box = svg.getBoundingClientRect();
      var scale = svg.viewBox.baseVal.width / box.width;
      var x = (event.clientX - box.left) * scale;
      var index = Math.round((x - data.left) / (data.right - data.left) * last);
      index = Math.min(last, Math.max(0, index));
      var px = data.left + index / last * (data.right - data.left);
      var py = data.top + (1 - data.values[index] / data.yMax) * (data.bottom - data.top);
      cross.setAttribute("x1", px);
      cross.setAttribute("x2", px);
      dot.setAttribute("cx", px);
      dot.setAttribute("cy", py);
      svg.classList.add("active");
      var text = data.tip.replace("{x}", (index * data.step).toLocaleString("en-US")).replace("{v}", data.values[index].toLocaleString("en-US"));
      show(text, box.left + px / scale, box.top + py / scale);
    });
    hit.addEventListener("pointerleave", function () {
      svg.classList.remove("active");
      hide();
    });
  });
})();
