// chrome.js
// The sidebar (large screens) and the menu (small screens), built from one
// list for every page, plus the language switcher, the admin preview banner
// and the optional GoatCounter visitor stats (code set in settings.txt).
//
// Each page has <body data-page="home|links|cv|clocks|admin">, an empty
// <aside class="sidebar" id="sidebar"></aside> and, for the menu, an empty
// <ul id="nav-menu"></ul>. Load after i18n.js and sitedata.js.

var Chrome = (function () {
  "use strict";

  var t = I18n.t;
  var esc = SiteData.esc;
  var page = document.body.getAttribute("data-page") || "home";
  var home = page === "home";

  // [section id on the home page, icon, label, data file that must have records]
  var SECTIONS = [
    ["header", "pe-7s-home", "nav.home"],
    ["news", "pe-7s-bell", "nav.news", "news.txt"],
    ["services", "pe-7s-science", "nav.research"],
    ["portfolio", "pe-7s-portfolio", "nav.projects"],
    ["software", "pe-7s-tools", "nav.software", "software.txt"],
    ["publications", "pe-7s-notebook", "nav.publications"],
    ["talks", "pe-7s-micro", "nav.talks", "talks.txt"],
    ["students", "pe-7s-users", "nav.students", "students.txt"],
    ["testimonial", "pe-7s-user", "nav.about"],
    ["contact", "pe-7s-mail", "nav.contact"]
  ];
  var PAGES = [["cv", "cv.html", "pe-7s-id", "nav.cv"]];
  var TOOLS = [
    ["admin", "admin.html", "pe-7s-config", "nav.admin"],
    ["links", "plinks.html", "pe-7s-link", "nav.links"],
    ["clocks", "clocks.html", "pe-7s-clock", "nav.clocks"]
  ];

  function sectionHref(id) {
    return home ? "#" + id : "index.html" + (id === "header" ? "" : "#" + id);
  }

  function langSwitch() {
    return '<div class="lang-switch" role="group" aria-label="' + esc(t("nav.language")) + '">' +
      I18n.SUPPORTED.map(function (l) {
        return '<button type="button" data-lang="' + l + '" lang="' + l + '" title="' + esc(I18n.NAMES[l]) + '"' +
          (l === I18n.lang ? ' class="is-active" aria-pressed="true"' : ' aria-pressed="false"') + ">" +
          l.toUpperCase() + "</button>";
      }).join("") + "</div>";
  }

  function sidebar() {
    var items = SECTIONS.map(function (s) {
      return '<li data-nav="' + s[0] + '"' + (s[3] ? " hidden" : "") + '><a href="' + sectionHref(s[0]) + '"' +
        (home ? " data-scroll" : "") + '><i class="' + s[1] + '"></i>' + esc(t(s[2])) + "</a></li>";
    }).concat(PAGES.map(function (p) {
      return '<li class="sidebar-page"><a href="' + p[1] + '"' + (page === p[0] ? ' class="is-active"' : "") +
        '><i class="' + p[2] + '"></i>' + esc(t(p[3])) + "</a></li>";
    }));
    return '<a class="sidebar-name" href="' + (home ? "#header" : "index.html") + '"' + (home ? " data-scroll" : "") +
      ">Neil James Cook</a>" +
      '<p class="sidebar-role">' + esc(t("site.role")) + "<br>iREx, Universit&eacute; de Montr&eacute;al</p>" +
      '<ul class="sidebar-nav">' + items.join("") + "</ul>" +
      '<div class="sidebar-tools">' + TOOLS.map(function (x) {
        return '<a href="' + x[1] + '" title="' + esc(t(x[3])) + '" aria-label="' + esc(t(x[3])) + '"' +
          (page === x[0] ? ' class="is-active"' : "") + '><i class="' + x[2] + '"></i></a>';
      }).join("") + langSwitch() + "</div>";
  }

  function menu() {
    var items = SECTIONS.map(function (s) {
      return '<li data-nav="' + s[0] + '"' + (s[3] ? " hidden" : "") + '><a href="' + sectionHref(s[0]) + '"' +
        (home ? " data-scroll" : "") + ">" + esc(t(s[2])) + ' <i class="' + s[1] + '"></i></a></li>';
    }).concat(PAGES.concat(TOOLS).map(function (p) {
      return '<li><a href="' + p[1] + '">' + esc(t(p[3])) + ' <i class="' + p[2] + '"></i></a></li>';
    }));
    return items.join("") + '<li class="menu-lang">' + langSwitch() + "</li>";
  }

  // show or hide the links to an optional section (news, talks, ...)
  function show(id, on) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav="' + id + '"]'), function (li) {
      li.hidden = !on;
    });
  }

  var side = document.getElementById("sidebar");
  if (side) side.innerHTML = sidebar();
  var nav = document.getElementById("nav-menu");
  if (nav) nav.innerHTML = menu();

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-lang]");
    if (b) { e.preventDefault(); I18n.set(b.getAttribute("data-lang")); }
  });

  // on the other pages, check the optional sections' files ourselves;
  // the home page calls Chrome.show() as it renders them
  if (!home) {
    SECTIONS.forEach(function (s) {
      if (!s[3]) return;
      SiteData.loadRecords(s[3]).then(function (r) { show(s[0], r.length > 0); });
    });
  }

  if (SiteData.PREVIEW) {
    var bar = document.createElement("div");
    bar.className = "preview-banner";
    bar.textContent = t("nav.preview");
    document.body.appendChild(bar);
  } else if (page !== "admin" && !/^(localhost|127\.)/.test(location.hostname)) {
    SiteData.loadRecords("settings.txt").then(function (recs) {
      var code = "";
      recs.forEach(function (r) { code = code || r.fields.goatcounter || ""; });
      code = code.trim().replace(/^https?:\/\//, "").replace(/\.goatcounter\.com.*$/, "");
      if (!/^[a-z0-9-]+$/i.test(code)) return;
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://gc.zgo.at/count.js";
      s.setAttribute("data-goatcounter", "https://" + code + ".goatcounter.com/count");
      document.body.appendChild(s);
    });
  }

  return { show: show, page: page };
})();
