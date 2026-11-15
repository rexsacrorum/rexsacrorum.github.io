// Keyboard navigation, the key bar at the bottom, and the console and CRT easter eggs.
// Everything here is an extra: the pages read and work without this script.
(function () {
  var root = document.documentElement;

  // --- toast and CRT mode

  var toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.hidden = true;
  document.body.appendChild(toast);
  var toastTimer;
  function say(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2200);
  }
  function crt() {
    var on = root.classList.toggle("crt");
    say(on ? "crt mode: on" : "crt mode: off");
    return on ? "phosphor warmed up" : "back to flat panels";
  }

  // --- uptime in the footer: "up 13489 days, 04:12:07", counted in the visitor's time zone

  var up = document.querySelector("[data-since]");
  if (up) {
    var parts = up.getAttribute("data-since").split("-");
    var since = new Date(+parts[0], parts[1] - 1, +parts[2]).getTime();
    var two = function (n) { return (n < 10 ? "0" : "") + n; };
    var tick = function () {
      var s = Math.floor((Date.now() - since) / 1000);
      up.textContent = "up " + Math.floor(s / 86400) + " days, " + two(Math.floor(s % 86400 / 3600)) + ":" + two(Math.floor(s % 3600 / 60)) + ":" + two(s % 60);
    };
    tick();
    setInterval(tick, 1000);
  }

  // --- console

  var dim = "color:#8a938c;font-family:monospace";
  console.log("%cYou found the console. Type help() to look around.", dim);
  window.help = function () {
    console.log("%c" + [
      "help()    this list",
      "whoami()  the short version",
      "cv()      open the CV",
      "hire()    start an email",
      "crt()     the monitor I grew up with"
    ].join("\n"), dim);
    return "also: try typing noisia on the page";
  };
  window.whoami = function () { return "Bogdan Novosad, Staff Software Engineer. Go, Rust, C#/.NET. Spain."; };
  window.cv = function () { location.href = "/cv/"; return "opening /cv/"; };
  window.hire = function () { location.href = "mailto:bogdan@novosad.xyz?subject=Hello%20from%20the%20console"; return "opening your mail client"; };
  window.crt = crt;

  // --- cursor movement

  // Arrows move a cursor over links only on pages that are lists of links.
  // On an article or the CV they keep scrolling the text.
  var arrows = !document.querySelector(".prose, .cv");

  function stops() {
    return Array.prototype.filter.call(document.querySelectorAll("a[href], button"), function (el) {
      return !el.closest(".keys, .skip") && el.getClientRects().length > 0;
    });
  }
  function land(el) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: el.closest(".label") ? "start" : "nearest" });
  }
  function move(dir) {
    var list = stops();
    if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    if (i === -1) {
      var height = window.innerHeight;
      for (i = 0; i < list.length; i++) {
        var box = list[i].getBoundingClientRect();
        if (box.top >= 0 && box.bottom <= height) break;
      }
      if (i === list.length) i = 0;
    } else {
      i = Math.max(0, Math.min(list.length - 1, i + dir));
    }
    land(list[i]);
  }
  function top() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
  }
  function theme() {
    var button = document.querySelector(".theme");
    if (button) button.click();
  }
  function open() {
    var el = document.activeElement;
    if (el && el !== document.body && el.click) el.click();
  }

  // --- key bar: numbered sections of this page, or the main pages when it has none

  var actions = {};
  var items = [];
  function add(key, label, run, href) {
    actions[key.toLowerCase()] = run;
    items.push({ key: key, label: label, href: href });
  }
  var sections = Array.prototype.slice.call(document.querySelectorAll("section.block[id]"), 0, 9);
  if (sections.length) {
    sections.forEach(function (section, index) {
      var label = section.id.charAt(0).toUpperCase() + section.id.slice(1);
      add(String(index + 1), label, function () {
        var link = section.querySelector(".label a");
        if (link) land(link);
        else section.scrollIntoView();
      }, "#" + section.id);
    });
  } else {
    [["Home", "/"], ["Writing", "/writing/"], ["CV", "/cv/"]].forEach(function (page, index) {
      add(String(index + 1), page[0], function () { location.href = page[1]; }, page[1]);
    });
  }
  add("0", "Top", top);
  add("T", "Theme", theme);

  var bar = document.createElement("nav");
  bar.className = "keys";
  bar.setAttribute("aria-label", "Keyboard shortcuts");
  function cell(key, label, run, href) {
    var el = document.createElement(href ? "a" : "button");
    if (href) el.href = href;
    else el.type = "button";
    el.tabIndex = -1;
    var kbd = document.createElement("kbd");
    kbd.textContent = key;
    var text = document.createElement("span");
    text.textContent = label;
    el.appendChild(kbd);
    el.appendChild(text);
    el.addEventListener("click", function (event) {
      event.preventDefault();
      run();
    });
    bar.appendChild(el);
  }
  items.forEach(function (item) { cell(item.key, item.label, actions[item.key.toLowerCase()], item.href); });
  if (arrows) {
    cell("↑↓", "Move", function () { move(1); });
    cell("↵", "Open", open);
  }
  // A click on the bar must not take the focus: Move and Open act on the focused link.
  bar.addEventListener("mousedown", function (event) { event.preventDefault(); });
  document.body.appendChild(bar);
  root.classList.add("has-keys");

  // --- keys

  var word = "noisia";
  var typed = "";
  document.addEventListener("keydown", function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;

    if (arrows) {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); move(1); return; }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); move(-1); return; }
      if (event.key === " " && target && target.tagName === "A") { event.preventDefault(); target.click(); return; }
    }
    if (event.key === "Escape") { if (target && target.blur) target.blur(); return; }
    if (event.key.length !== 1) return;

    // A Cyrillic or other non-Latin layout still works: fall back to the physical key.
    var ch = event.key.toLowerCase();
    if (!/^[a-z0-9]$/.test(ch)) ch = /^Key[A-Z]$/.test(event.code || "") ? event.code.charAt(3).toLowerCase() : ch;

    if (actions[ch]) { actions[ch](); return; }

    typed = (typed + ch).slice(-word.length);
    if (typed === word) { typed = ""; crt(); }
  });
})();
