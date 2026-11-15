// Dark is the default for everyone; "light" is the blue theme. The choice is kept under "scheme".
(function () {
  var root = document.documentElement;
  var button = document.querySelector(".theme");
  if (!button) return;
  button.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("scheme", next); } catch (e) {}
  });
})();
