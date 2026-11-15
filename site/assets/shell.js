// The terminal behind the header prompt: a panel with a few commands, a text game and mail.
// An extra, like term.js: without this script the prompt stays a plain link to the home page.
(function () {
  var root = document.documentElement;
  var mark = document.querySelector(".mark");
  if (!mark) return;

  var MAIL_TO = "bogdan@novosad.xyz";
  // URL of the mail backend (see AGENTS.md). While it is empty, mail opens the visitor's mail client.
  var MAIL_ENDPOINT = "";
  var MAIL_MAX = 1000;
  // The story is fetched on first use, so its version lives here and not in the page shells.
  var STORY_URL = "/assets/story.json?v=1";
  var PROMPT = "guest:~$";

  var media = function (query) { return !!window.matchMedia && window.matchMedia(query).matches; };
  var calm = media("(prefers-reduced-motion: reduce)");
  var touch = media("(hover: none)");

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // --- what ls and cat show

  var files = {
    "about.txt": [
      "Bogdan Novosad, Staff Software Engineer, based in Spain.",
      "I help engineering teams move to agentic development: agents write the code, engineers decide what to build and check that it is right.",
      "13 years in backend systems, SaaS products and developer tooling. Go, Rust, C#/.NET."
    ],
    "cv.txt": [
      "Bogdan Novosad",
      "Staff Software Engineer · agentic development · Go, Rust, C#/.NET",
      "",
      "2024 — now   Staff Software Engineer, Software Country. A learning management platform used by schools across Europe; leads agentic development in the company.",
      "2018 — 2024  Senior Software Engineer, Aspose. Word layout algorithms; an online document viewer SaaS.",
      "2013 — 2018  Full-Stack Engineer, ADICOM. ASP.NET MVC, .NET Core services, Vue.js.",
      "",
      "the full version: [open cv](/cv/) · [cv.pdf](/Bogdan_Novosad_CV.pdf)"
    ],
    "projects.txt": [
      "TeoriaYa   practice for the Spanish driving theory test, for learners of Spanish. [teoriaya.com](https://teoriaya.com/)",
      "GliderMCP  local MCP servers that give coding agents compiler-backed and indexed evidence about a codebase. [glidermcp.com](https://glidermcp.com/)",
      "workflow   the multi-agent workflow I use, open source. [github](https://github.com/rexsacrorum/agent-engineering-workflow)"
    ],
    "links.txt": [
      "mail      [bogdan@novosad.xyz](mailto:bogdan@novosad.xyz) (or type mail)",
      "linkedin  [linkedin.com/in/novosad](https://www.linkedin.com/in/novosad/)",
      "github    [github.com/rexsacrorum](https://github.com/rexsacrorum)",
      "telegram  [t.me/rexsacrorum](https://t.me/rexsacrorum)"
    ],
    ".last_review": [
      "The agents write all the code now. One person still reads it.",
      "run: review"
    ]
  };
  var pages = { home: "/", cv: "/cv/", writing: "/writing/", pdf: "/Bogdan_Novosad_CV.pdf" };

  // --- the panel

  var panel = el("section", "term");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  // The way out is not shown on the screen, so a screen reader is told it here.
  panel.setAttribute("aria-label", "Terminal. To leave it, type colon q and press Enter.");

  var out = el("div", "term-out");
  out.setAttribute("role", "log");
  out.setAttribute("aria-label", "Output");
  out.tabIndex = -1;

  var form = el("form", "term-line");
  var ps = el("span", "", PROMPT);
  ps.setAttribute("aria-hidden", "true");
  var input = el("input");
  input.type = "text";
  input.maxLength = 1200;
  input.setAttribute("aria-label", "Command");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "none");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("enterkeyhint", "send");
  form.appendChild(ps);
  form.appendChild(input);

  panel.appendChild(out);
  panel.appendChild(form);
  document.body.appendChild(panel);

  // --- output

  function print(text, className) {
    var row = el("div", "term-row" + (className ? " " + className : ""), text);
    out.appendChild(row);
    return row;
  }
  // Like print, with [label](url) turned into links. Only for text written in this file.
  function printLinked(text) {
    var row = print("");
    var link = /\[([^\]]+)\]\(([^)]+)\)/g;
    var last = 0;
    var match;
    while ((match = link.exec(text))) {
      row.appendChild(document.createTextNode(text.slice(last, match.index)));
      var a = el("a", "", match[1]);
      a.href = match[2];
      row.appendChild(a);
      last = link.lastIndex;
    }
    row.appendChild(document.createTextNode(text.slice(last)));
    return row;
  }
  function dim(text) { return print(text, "term-dim"); }

  function greet() {
    var text = "hello, traveller. can I help you with something?";
    var hint = function () { dim("help lists the commands."); };
    if (calm) { print(text); hint(); return; }
    // The typing is for the eye; a screen reader gets the whole line once.
    var row = print("");
    var typed = el("span");
    typed.setAttribute("aria-hidden", "true");
    row.appendChild(el("span", "sr", text));
    row.appendChild(typed);
    var hintRow = el("div", "term-row term-dim");
    out.appendChild(hintRow);
    var n = 0;
    var timer = setInterval(function () {
      typed.textContent = text.slice(0, ++n);
      if (n < text.length) return;
      clearInterval(timer);
      hintRow.textContent = "help lists the commands.";
    }, 26);
  }

  // --- commands. A command that needs several lines of input sets a mode:
  // { prompt, input(line), stop() }. The game and mail are modes; a later `ask` would be one too.

  var mode = null;
  function enter(next) { mode = next; ps.textContent = next.prompt; }
  function leave() { mode = null; ps.textContent = PROMPT; }

  var commands = {
    help: {
      about: "this list",
      run: function () {
        Object.keys(commands).forEach(function (name) {
          if (commands[name].about) print((name + "        ").slice(0, 8) + commands[name].about);
        });
        dim("not everything is listed. ls has flags.");
      }
    },
    whoami: {
      about: "the short version",
      run: function () {
        print("you: a guest. me: Bogdan Novosad, Staff Software Engineer. Agentic development; Go, Rust, C#/.NET. Spain.");
      }
    },
    ls: {
      about: "list the files",
      run: function (args) {
        var all = args.some(function (arg) { return /^-\w*a/i.test(arg); });
        var names = Object.keys(files).filter(function (name) { return all || name.charAt(0) !== "."; });
        print(names.sort().concat("writing/").join("  "));
      }
    },
    cat: {
      about: "read a file: cat cv",
      run: function (args) {
        var name = (args[0] || "").toLowerCase().replace(/^(\.\/|~\/)/, "");
        if (!name) { print("cat: which file? ls lists them."); return; }
        if (/^writing\/?$/.test(name)) { print("cat: writing is a directory. try: open writing"); return; }
        var lines = files[name] || files[name + ".txt"];
        if (!lines) { print("cat: " + name + ": no such file. ls lists them."); return; }
        lines.forEach(printLinked);
      }
    },
    open: {
      about: "go to a page: open cv",
      run: function (args) {
        var raw = (args[0] || "").toLowerCase();
        var name = /^(~|\/|\.\.)\/?$/.test(raw) ? "home" : raw.replace(/^(~\/|\.\/|\/)/, "").replace(/\/$/, "");
        if (!pages[name]) { print("open: " + Object.keys(pages).join(", ")); return; }
        print("opening " + pages[name]);
        keep(false);
        location.href = pages[name];
      }
    },
    mail: { about: "send me a message", run: mail },
    theme: {
      about: "switch the theme",
      run: function () {
        var button = document.querySelector(".theme");
        if (button) button.click();
        print("theme: " + (root.getAttribute("data-theme") === "light" ? "light" : "dark"));
      }
    },
    clear: { about: "clear the screen", run: function () { out.textContent = ""; } },

    // Not in help. The only way out is :q, as in the editor nobody can leave.
    ":q": { run: function () { close(); } },
    exit: { run: function (args, rest, name) { print(name + ": no such way out."); stuck(); } },
    review: { run: review },
    noisia: { run: function () { print(window.crt ? window.crt() : "no phosphor on this page"); } },
    sudo: { run: function () { print("guest is not in the sudoers file. a person will review this incident."); } },
    pwd: { run: function () { print("/home/guest"); } },
    echo: { run: function (args, rest) { print(rest); } }
  };
  var aliases = { "?": "help", ":q!": ":q", ":wq": ":q", ":x": ":q", zz: ":q", quit: "exit", close: "exit", logout: "exit", q: "exit", cd: "open", go: "open", less: "cat", more: "cat", home: "open home", cv: "cat cv", dir: "ls" };

  function exec(line) {
    if (!line) return;
    var first = line.split(/\s+/)[0];
    var alias = Object.prototype.hasOwnProperty.call(aliases, first.toLowerCase()) && aliases[first.toLowerCase()];
    if (alias) line = alias + line.slice(first.length);
    var words = line.split(/\s+/);
    var name = words[0].toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(commands, name)) {
      print(first + ": command not found. help lists the commands.");
      return;
    }
    commands[name].run(words.slice(1), line.slice(words[0].length).trim(), first);
  }

  // After a few tries at the door, one oblique hint. The plain one is in the browser console.
  var tries = 0;
  function stuck() {
    if (++tries === 3) dim("hint: you have been stuck in an editor like this before.");
  }

  var past = [];
  var at = 0;
  function submit(line) {
    line = line.trim();
    var row = print(ps.textContent + " " + line, "term-echo");
    if (line && !mode) {
      past.push(line);
      at = past.length;
    }
    if (mode) mode.input(line);
    else exec(line);
    // Start reading at the command; when the answer is short this clamps to the bottom.
    if (row.parentNode) out.scrollTop = row.offsetTop;
  }

  // --- the game. The engine walks the scene graph in story.json; build.py checks the graph.

  var story = null;
  var endings = {};

  function review() {
    if (story) { play(); return; }
    var wait = dim("loading the story…");
    fetch(STORY_URL).then(function (response) {
      if (!response.ok) throw new Error(response.status);
      return response.json();
    }).then(function (data) {
      story = data;
      wait.remove();
      if (!mode) out.scrollTop = play().offsetTop;
    }, function () {
      wait.textContent = "the story did not load. try again in a minute.";
    });
  }

  function play() {
    var state = {};
    var picks = [];
    var total = Object.keys(story.scenes).filter(function (id) { return story.scenes[id].end; }).length;

    // A condition is "flag", "!flag", "count>=2" or "count<2"; "set" adds one to each name.
    function holds(conditions) {
      return (conditions || []).every(function (condition) {
        var part = /^(!?)(\w+)(?:(>=|<)(\d+))?$/.exec(condition);
        var value = state[part[2]] || 0;
        var yes = !part[3] ? value > 0 : part[3] === "<" ? value < +part[4] : value >= +part[4];
        return part[1] ? !yes : yes;
      });
    }
    function bump(names) {
      (names || []).forEach(function (name) { state[name] = (state[name] || 0) + 1; });
    }
    function freeze() {
      Array.prototype.forEach.call(out.querySelectorAll(".term-pick:not([disabled])"), function (button) { button.disabled = true; });
    }

    function show(id) {
      var scene = story.scenes[id];
      var first = null;
      bump(scene.set);
      scene.text.forEach(function (paragraph) {
        var row = print(paragraph, "term-para");
        first = first || row;
      });
      if (scene.next) {
        show(scene.next.filter(function (route) { return holds(route.when); })[0].to);
        return first;
      }
      if (scene.end) {
        endings[scene.end] = true;
        dim("ending: " + scene.end + " · " + Object.keys(endings).length + " of " + total + " found");
        picks = [{ label: "Start again", again: true }, { label: "Leave", quit: true }];
      } else {
        picks = scene.choices.filter(function (choice) { return holds(choice.when); });
      }
      picks.forEach(function (pick, index) {
        var button = el("button", "term-pick", (index + 1) + ") " + pick.label);
        button.type = "button";
        button.addEventListener("click", function () {
          submit(String(index + 1));
          (touch ? out : input).focus({ preventScroll: true });
        });
        out.appendChild(button);
      });
      return first;
    }

    function start() {
      state = {};
      var title = print(story.title.toUpperCase(), "term-title");
      dim("answer with a number. quit leaves the story.");
      show(story.start);
      return title;
    }
    function stop() {
      freeze();
      leave();
    }

    enter({
      prompt: ">",
      input: function (line) {
        var word = line.toLowerCase();
        var pick = /^\d+$/.test(word) ? picks[+word - 1] : null;
        if (word === "quit" || word === "exit" || word === "q" || /^(:q|:q!|:wq|:x|zz)$/.test(word) || (pick && pick.quit)) {
          stop();
          dim("the queue is empty. for now.");
        } else if (word === "again" || word === "restart" || (pick && pick.again)) {
          freeze();
          start();
        } else if (pick) {
          var taken = out.querySelectorAll(".term-pick:not([disabled])")[+word - 1];
          freeze();
          if (taken) taken.classList.add("took");
          bump(pick.set);
          show(pick.to);
        } else {
          dim("a number from 1 to " + picks.length + ", or quit.");
        }
      },
      stop: stop
    });
    return start();
  }

  // --- mail. With no backend configured the text goes to the visitor's own mail client.

  function mail(args, rest) {
    var message = "";
    function cancel() {
      leave();
      dim("mail: cancelled.");
    }
    function viaClient(reply) {
      var body = message + (reply ? "\n\nreply to: " + reply : "");
      var href = "mailto:" + MAIL_TO + "?subject=" + encodeURIComponent("Hello from the terminal") + "&body=" + encodeURIComponent(body);
      var row = print("opening your mail client. if nothing happens: ");
      var a = el("a", "", "write to " + MAIL_TO);
      a.href = href;
      row.appendChild(a);
      location.href = href;
    }
    function post(reply) {
      var wait = dim("sending…");
      fetch(MAIL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ message: message, reply: reply })
      }).then(function (response) {
        if (!response.ok) throw response.status;
        wait.textContent = "sent. thank you.";
      }).catch(function (status) {
        wait.textContent = status === 429 ? "too many messages for now." : "the mail service did not answer.";
        viaClient(reply);
        out.scrollTop = out.scrollHeight;
      });
    }
    function gotMessage(line) {
      if (!line || /^(:q|:q!|:wq|:x|ZZ)$/.test(line)) { cancel(); return; }
      if (line.length > MAIL_MAX) {
        print("that is " + line.length + " characters and the limit is " + MAIL_MAX + ". shorter, please.");
        return;
      }
      message = line;
      if (!MAIL_ENDPOINT) { leave(); viaClient(""); return; }
      print("your address, if you want a reply. enter skips.");
      enter({ prompt: "reply-to>", input: gotReply, stop: cancel });
    }
    function gotReply(line) {
      if (/^(:q|:q!|:wq|:x|ZZ)$/.test(line)) { cancel(); return; }
      if (line && (line.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line))) {
        print("that does not look like an address. again, or enter to skip.");
        return;
      }
      leave();
      post(line);
    }

    if (rest) { gotMessage(rest); return; }
    print("a short message for Bogdan: one line, up to " + MAIL_MAX + " characters. an empty line cancels.");
    enter({ prompt: "message>", input: gotMessage, stop: cancel });
  }

  // --- opening and closing

  // An open terminal survives a reload: it stays open until the visitor types :q.
  var KEEP = "term";
  function keep(on) {
    try {
      if (on) sessionStorage.setItem(KEEP, "1");
      else sessionStorage.removeItem(KEEP);
    } catch (error) {}
  }

  var opened = false;
  var greeted = false;
  var others = [];
  var view = window.visualViewport;

  // The terminal covers the visible screen: on a phone, what the touch keyboard leaves.
  function fit() {
    if (!view || !opened) return;
    panel.style.setProperty("--vh", view.height + "px");
    panel.style.top = view.offsetTop + "px";
  }
  if (view) {
    view.addEventListener("resize", fit);
    view.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
  }

  function open() {
    if (opened) return;
    opened = true;
    others = Array.prototype.filter.call(document.body.children, function (node) {
      return node !== panel && !node.inert;
    });
    others.forEach(function (node) { node.inert = true; });
    root.classList.add("term-open");
    mark.setAttribute("aria-expanded", "true");
    fit();
    input.focus({ preventScroll: true });
    keep(true);
    console.log("%cStuck in the terminal? Type :q and press Enter.", "color:#8a938c;font-family:monospace");
    if (!greeted) {
      greeted = true;
      greet();
    }
  }
  function close() {
    if (!opened) return;
    opened = false;
    if (mode) mode.stop();
    others.forEach(function (node) { node.inert = false; });
    root.classList.remove("term-open");
    mark.setAttribute("aria-expanded", "false");
    mark.focus({ preventScroll: true });
    keep(false);
  }

  // With the script on, the prompt opens the terminal. Home stays reachable with the `home`
  // command or a ctrl/middle click, which still follows the link.
  mark.setAttribute("role", "button");
  mark.setAttribute("aria-label", "Open the terminal");
  mark.setAttribute("aria-haspopup", "dialog");
  mark.setAttribute("aria-expanded", "false");
  mark.addEventListener("click", function (event) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open();
  });
  mark.addEventListener("keydown", function (event) {
    if (event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    open();
  });
  // Following a link out of the terminal, or `open`, is a way of leaving it too.
  out.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest("a[href]");
    if (link && link.protocol !== "mailto:") keep(false);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var line = input.value;
    input.value = "";
    submit(line);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (mode || !past.length) return;
      event.preventDefault();
      at = Math.max(0, Math.min(past.length, at + (event.key === "ArrowUp" ? -1 : 1)));
      input.value = past[at] || "";
    } else if (event.ctrlKey && event.key.toLowerCase() === "c" && input.selectionStart === input.selectionEnd) {
      event.preventDefault();
      print(ps.textContent + " " + input.value + "^C", "term-echo");
      input.value = "";
      if (mode) mode.stop();
      out.scrollTop = out.scrollHeight;
    } else if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      if (!mode) out.textContent = "";
    }
  });

  document.addEventListener("keydown", function (event) {
    var plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    var target = event.target;
    if (!opened) {
      // The key under Esc opens the terminal, as in old games.
      var typing = target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      if (event.code === "Backquote" && plain && !typing) {
        event.preventDefault();
        open();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      stuck();
    } else if (event.key === "Tab") {
      // Focus stays in the panel while it is open.
      var stops = panel.querySelectorAll("a[href], button:not([disabled]), input");
      var first = stops[0];
      var last = stops[stops.length - 1];
      if (!panel.contains(target) || target === out || (event.shiftKey ? target === first : target === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    } else if (plain && target !== input && event.key.length === 1 && !(event.key === " " && target && /^(A|BUTTON)$/.test(target.tagName))) {
      // Typing anywhere in the panel lands in the input line.
      input.focus({ preventScroll: true });
    }
  });

  try {
    if (sessionStorage.getItem(KEEP)) open();
  } catch (error) {}
})();
