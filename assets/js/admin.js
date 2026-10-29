// admin.js
// Edits the site's .txt data files and commits them to GitHub through the
// REST API, authenticated with a fine-grained personal access token.

(function () {
  "use strict";

  var OWNER = "njcuk9999";
  var REPO = "njcuk9999.github.io";
  var BRANCH = "main";
  var ADMIN = "njcuk9999";
  var IMAGE_DIR = "assets/images/";
  var TOKEN_KEY = "gh_admin_token";
  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  var token = null;
  var tokenExpiry = null;
  var icons = [];
  // local previews for images uploaded this session (Pages needs a minute to publish them)
  var previews = {};

  // ------------------------------------------------------------------
  // small helpers
  // ------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "value" || k === "checked") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function utf8ToB64(str) {
    return bytesToB64(new TextEncoder().encode(str));
  }

  function bytesToB64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ------------------------------------------------------------------
  // GitHub API
  // ------------------------------------------------------------------

  function api(path, opts) {
    opts = opts || {};
    var headers = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": "Bearer " + token
    };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      // fine-grained tokens report their expiry date (when GitHub lets the browser see it)
      tokenExpiry = r.headers.get("github-authentication-token-expiration") || tokenExpiry;
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
        if (!r.ok) {
          var err = new Error((data && data.message) || ("HTTP " + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function contentsPath(path) {
    return "/repos/" + OWNER + "/" + REPO + "/contents/" +
      path.split("/").map(encodeURIComponent).join("/");
  }

  // resolves {text, sha}; a missing file gives empty text and sha null
  function getFile(path) {
    return api(contentsPath(path) + "?ref=" + BRANCH).then(function (d) {
      return { text: b64ToUtf8(d.content || ""), sha: d.sha };
    }, function (e) {
      if (e.status === 404) return { text: "", sha: null };
      throw e;
    });
  }

  function fileExists(path) {
    return api(contentsPath(path) + "?ref=" + BRANCH).then(
      function () { return true; },
      function (e) { if (e.status === 404) return false; throw e; });
  }

  function putFile(path, b64, sha, message) {
    var body = { message: message, content: b64, branch: BRANCH };
    if (sha) body.sha = sha;
    return api(contentsPath(path), { method: "PUT", body: body }).then(function (d) {
      return d.content.sha;
    });
  }

  function explain(e) {
    if (e.status === 401) return "GitHub rejected the token (expired or revoked?). Log out and in again.";
    if (e.status === 403 || e.status === 404) {
      return "No write access: the token needs 'Contents: Read and write' on " + REPO + ". (" + e.message + ")";
    }
    if (e.status === 409 || e.status === 422) {
      return "The file changed on GitHub since you opened it. Copy anything you need from raw text, then Discard & reload. (" + e.message + ")";
    }
    return e.message || String(e);
  }

  // ------------------------------------------------------------------
  // login
  // ------------------------------------------------------------------

  function storedToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch (e) { return null; }
  }

  function storeToken(t, remember) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (t) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    } catch (e) { /* storage blocked: stay logged in for this page only */ }
  }

  function login(t, remember) {
    token = t;
    return api("/user").then(function (user) {
      if (String(user.login).toLowerCase() !== ADMIN) {
        throw new Error("This token belongs to '" + user.login + "', not " + ADMIN + ".");
      }
      storeToken(t, remember);
      $("who").textContent = "Logged in as " + user.login;
      $("login-view").hidden = true;
      $("main-view").hidden = false;
      showExpiry();
      selectTab(tabs[0]);
    }).catch(function (e) {
      token = null;
      storeToken(null);
      throw e;
    });
  }

  // "2026-12-01 10:00:00 -0500" -> warning when it is two weeks away or less
  function showExpiry() {
    var box = $("expiry");
    box.hidden = true;
    if (!tokenExpiry) return;
    var m = tokenExpiry.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d)(\d\d)/);
    var when = m ? new Date(m[1] + "T" + m[2] + m[3] + ":" + m[4]) : new Date(tokenExpiry);
    var days = Math.floor((when - Date.now()) / 864e5);
    if (isNaN(days) || days > 14) return;
    box.innerHTML = "";
    append(box, ["Your GitHub token expires on " + when.toLocaleDateString() +
      (days >= 1 ? " (in " + days + " day" + (days === 1 ? "" : "s") + ")" : " (today)") + ". ",
      h("a", { href: "https://github.com/settings/personal-access-tokens", target: "_blank", rel: "noopener" },
        "Regenerate it on GitHub"),
      ", then log out and back in with the new one."]);
    box.hidden = false;
  }

  function showLogin(msg) {
    $("main-view").hidden = true;
    $("login-view").hidden = false;
    setStatus($("login-status"), msg || "", msg ? "err" : "");
  }

  $("login-btn").addEventListener("click", function () {
    var t = $("token").value.trim();
    if (!t) return setStatus($("login-status"), "Paste your token first.", "err");
    setStatus($("login-status"), "Checking token...");
    login(t, $("remember").checked).catch(function (e) {
      setStatus($("login-status"), e.status === 401 ? "GitHub rejected that token." : explain(e), "err");
    });
  });
  $("token").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("login-btn").click();
  });

  $("logout-btn").addEventListener("click", function () {
    if (anyDirty() && !confirm("You have unsaved changes. Log out anyway?")) return;
    token = null;
    storeToken(null);
    tabs.forEach(function (t) { t.state = null; });
    $("token").value = "";
    showLogin();
  });

  window.addEventListener("beforeunload", function (e) {
    if (anyDirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  // ------------------------------------------------------------------
  // generic editor widgets
  // ------------------------------------------------------------------

  // text input bound to obj[key]
  function bound(obj, key, attrs, tag) {
    attrs = Object.assign({}, attrs);
    var onchange = attrs.oninput;
    delete attrs.oninput;
    var el = h(tag || "input", Object.assign({ type: tag ? null : "text", value: obj[key] || "" }, attrs));
    el.addEventListener("input", function () {
      obj[key] = el.value;
      markDirty();
      if (onchange) onchange(el.value);
    });
    return el;
  }

  function field(label, input) {
    return h("div", null, h("label", { class: "f" }, label), input);
  }

  // The language being edited. Titles, texts and some fields have French
  // and Spanish versions (empty = the English is shown on the site);
  // everything else (links, images, dates, ...) is shared.
  var editLang = "en";
  var LANG_NAMES = { en: "English", fr: "French", es: "Spanish" };

  function tbound(rec, key, attrs, tag) {
    attrs = Object.assign({}, attrs);
    if (editLang === "en") {
      return key === "title" || key === "body" ? bound(rec, key, attrs, tag) : bound(rec.fields, key, attrs, tag);
    }
    var en = key === "title" ? rec.title : key === "body" ? rec.body : rec.fields[key];
    delete attrs.oninput;
    attrs.placeholder = en ? "English: " + en : "";
    attrs.class = ((attrs.class || "") + " tr").trim();
    if (key === "body") {
      rec.bodies = rec.bodies || {};
      return bound(rec.bodies, editLang, attrs, tag);
    }
    return bound(rec.fields, key + "." + editLang, attrs, tag);
  }

  // label of a translatable field
  function tl(label) {
    return editLang === "en" ? label : label + " (" + editLang.toUpperCase() + ")";
  }

  // drop-down bound to obj[key]; a value not in the list is kept as an extra option
  function select(obj, key, options) {
    var cur = obj[key] || options[0][0];
    if (!options.some(function (o) { return o[0] === cur; })) options = options.concat([[cur, cur]]);
    var el = h("select", null, options.map(function (o) { return h("option", { value: o[0] }, o[1]); }));
    el.value = cur;
    obj[key] = obj[key] || cur;
    el.addEventListener("change", function () { obj[key] = el.value; markDirty(); });
    return el;
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function newRec(title, fields) {
    return { title: title, fields: fields || {}, body: "", bodies: {} };
  }

  function moveButtons(list, i) {
    function move(d) {
      var j = i + d;
      if (j < 0 || j >= list.length) return;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      markDirty(); render();
    }
    return [
      h("button", { class: "icon", title: "Move up", disabled: i === 0, onclick: function () { move(-1); } }, "↑"),
      h("button", { class: "icon", title: "Move down", disabled: i === list.length - 1, onclick: function () { move(1); } }, "↓"),
      h("button", { class: "icon danger", title: "Delete", onclick: function () {
        list.splice(i, 1); markDirty(); render();
      } }, "✕")
    ];
  }

  // a list of record cards with move/delete and an add button
  function recordList(list, itemBody, makeNew, addLabel, atTop) {
    var add = h("button", { onclick: function () {
      if (atTop) list.unshift(makeNew()); else list.push(makeNew());
      markDirty(); render();
    } }, "+ " + addLabel);
    return h("div", null,
      atTop ? h("div", { style: "margin-bottom:10px" }, add) : null,
      list.map(function (rec, i) {
        var title = h("span", { class: "title" }, rec.title || "(untitled)");
        return h("div", { class: "item" },
          h("div", { class: "item-head" }, title, moveButtons(list, i)),
          itemBody(rec, function (t) { title.textContent = t || "(untitled)"; }));
      }),
      atTop ? null : add);
  }

  function iconPicker(fields) {
    var btn = h("button", { class: "iconbtn", type: "button" });
    function paint() {
      btn.innerHTML = "";
      append(btn, [h("i", { class: fields.icon || "pe-7s-help1" }), fields.icon || "Choose icon"]);
    }
    paint();
    btn.addEventListener("click", function () {
      openIconModal(fields.icon, function (name) {
        fields.icon = name; markDirty(); paint();
      });
    });
    return btn;
  }

  function imageField(fields) {
    var img = h("img", { alt: "" });
    function preview() {
      img.src = previews[fields.image] || fields.image || "";
    }
    var path = bound(fields, "image", { placeholder: IMAGE_DIR + "picture.jpg", oninput: preview });
    var status = h("div", { class: "status small" });
    var file = h("input", { type: "file", accept: "image/*", hidden: true });
    file.addEventListener("change", function () {
      var f = file.files[0];
      file.value = "";
      if (!f) return;
      setStatus(status, "Uploading " + f.name + "...");
      uploadImage(f).then(function (p) {
        fields.image = p;
        path.value = p;
        markDirty();
        preview();
        setStatus(status, "Uploaded to " + p + ". Remember to save.", "ok");
      }).catch(function (e) {
        setStatus(status, "Upload failed: " + explain(e), "err");
      });
    });
    preview();
    return h("div", { class: "imgfield" }, img,
      h("div", { class: "grow" },
        path,
        h("div", { class: "row", style: "margin-top:6px" },
          h("button", { type: "button", onclick: function () { file.click(); } }, "Upload new image..."),
          file),
        status));
  }

  function uploadImage(f) {
    if (f.size > MAX_IMAGE_BYTES) {
      return Promise.reject(new Error("Image is over 10 MB; please shrink it first."));
    }
    var dot = f.name.lastIndexOf(".");
    var base = (dot > 0 ? f.name.slice(0, dot) : f.name).replace(/[^A-Za-z0-9_-]+/g, "_") || "image";
    var ext = (dot > 0 ? f.name.slice(dot) : "").toLowerCase().replace(/[^.a-z0-9]/g, "");
    return f.arrayBuffer().then(function (buf) {
      var b64 = bytesToB64(new Uint8Array(buf));
      // never overwrite an existing image: add -1, -2, ... until the name is free
      function tryName(n) {
        var p = IMAGE_DIR + base + (n ? "-" + n : "") + ext;
        return fileExists(p).then(function (exists) {
          return exists ? tryName(n + 1) : p;
        });
      }
      return tryName(0).then(function (p) {
        return putFile(p, b64, null, "Upload " + p + " via admin page").then(function () {
          previews[p] = URL.createObjectURL(f);
          return p;
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // icon picker modal
  // ------------------------------------------------------------------

  var iconCallback = null;
  var iconCurrent = null;

  function loadIcons() {
    return fetch("assets/font_icon/css/pe-icon-7-stroke.css").then(function (r) { return r.text(); })
      .then(function (css) {
        var seen = {};
        var re = /\.(pe-7s-[a-z0-9-]+):before/g, m;
        while ((m = re.exec(css))) seen[m[1]] = true;
        icons = Object.keys(seen).sort();
      }).catch(function () { icons = []; });
  }

  function paintIcons() {
    var q = $("icon-filter").value.trim().toLowerCase();
    var grid = $("icon-grid");
    grid.innerHTML = "";
    icons.filter(function (n) { return n.indexOf(q) >= 0; }).forEach(function (n) {
      append(grid, h("button", {
        class: n === iconCurrent ? "sel" : "", title: n,
        onclick: function () { closeIconModal(); iconCallback(n); }
      }, h("i", { class: n }), n.replace("pe-7s-", "")));
    });
  }

  function openIconModal(current, cb) {
    iconCurrent = current;
    iconCallback = cb;
    $("icon-filter").value = "";
    $("icon-modal").hidden = false;
    paintIcons();
    $("icon-filter").focus();
  }

  function closeIconModal() { $("icon-modal").hidden = true; }

  $("icon-filter").addEventListener("input", paintIcons);
  $("icon-close").addEventListener("click", closeIconModal);
  $("icon-modal").addEventListener("click", function (e) {
    if (e.target === $("icon-modal")) closeIconModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeIconModal();
  });

  // ------------------------------------------------------------------
  // the editable files
  // ------------------------------------------------------------------

  function records(keys) {
    return {
      parse: SiteData.parseRecords,
      serialize: function (m) { return SiteData.serializeRecords(m, keys); },
      validate: function (m) {
        for (var i = 0; i < m.length; i++) {
          if (!m[i].title.trim()) return "Item " + (i + 1) + " needs a title.";
        }
      }
    };
  }

  var tabs = [
    Object.assign({
      id: "research", label: "Links to research", path: "research.txt", translatable: true, preview: "index.html#services",
      help: "The icon cards in the 'Links to research' section of the home page.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field(tl("Title"), tbound(rec, "title", { oninput: retitle })),
              field("Link (URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field("Icon", iconPicker(rec.fields)),
            field(tl("Description"), tbound(rec, "body", { rows: 2 }, "textarea")));
        }, function () {
          return { title: "New link", fields: { icon: "pe-7s-science", url: "" }, body: "" };
        }, "Add research link");
      }
    }, records(["icon", "url"])),

    Object.assign({
      id: "projects", label: "Projects", path: "projects.txt", translatable: true, preview: "index.html#portfolio",
      help: "The image tiles in 'Projects I work on' on the home page. Every tile has the shape of a " +
        "400x311 image; other images are scaled to fill it and cropped evenly around the centre.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field(tl("Title"), tbound(rec, "title", { oninput: retitle })),
              field(tl("By"), tbound(rec, "by")),
              field("Link (URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" })),
              field(tl("Link text"), tbound(rec, "urltext", { placeholder: "Website" }))),
            field("Image", imageField(rec.fields)));
        }, function () {
          return { title: "New project", fields: { image: "", by: "", url: "", urltext: "Website" }, body: "" };
        }, "Add project");
      }
    }, records(["image", "by", "url", "urltext"])),

    {
      id: "about", label: "About me", path: "about.txt", translatable: true, preview: "index.html#testimonial",
      help: "Blank line = new paragraph. Links can be written as [text](https://...).",
      parse: function (t) {
        var r = SiteData.parseRecords(t)[0] || { fields: {}, body: "" };
        return { title: "", fields: { image: r.fields.image || "" }, body: r.body, bodies: r.bodies || {} };
      },
      serialize: function (m) { return SiteData.serializeRecords([m], ["image"]); },
      editor: function (m) {
        return h("div", { class: "item" },
          field("Photo", imageField(m.fields)),
          field(tl("Text"), tbound(m, "body", { rows: 18 }, "textarea")));
      }
    },

    Object.assign({
      id: "contact", label: "Contact", path: "contact.txt", translatable: true, preview: "index.html#contact",
      help: "Lines in the Contact section. The label is only shown here, not on the site. " +
        "The 'Drop me a line' form sends to the first email line.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field("Label (admin only)", bound(rec, "title", { oninput: retitle })),
              field("Link (optional URL, mailto:, tel:)", bound(rec.fields, "url"))),
            field("Icon", iconPicker(rec.fields)),
            field(tl("Text (new line = line break)"), tbound(rec, "body", { rows: 3 }, "textarea")));
        }, function () {
          return { title: "New contact line", fields: { icon: "pe-7s-info", url: "" }, body: "" };
        }, "Add contact line");
      }
    }, records(["icon", "url"])),

    Object.assign({
      id: "social", label: "Social icons", path: "social.txt", preview: "index.html#contact",
      help: "Round icons at the top and bottom of the home page. Images can be 50x100 sprites " +
        "(normal on top, hover underneath, like the originals) or any square image.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field("Name (tooltip)", bound(rec, "title", { oninput: retitle })),
              field("Link (URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field("Icon image", imageField(rec.fields)));
        }, function () {
          return { title: "New profile", fields: { image: "", url: "" }, body: "" };
        }, "Add social icon");
      }
    }, records(["image", "url"])),

    Object.assign({
      id: "software", label: "Software", path: "software.txt", translatable: true, preview: "index.html#software",
      help: "Cards in the 'Software' section of the home page and on the CV. Give the GitHub repository as " +
        "owner/name and the site shows its stars, forks, language and latest release live. Hidden while empty.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field(tl("Name"), tbound(rec, "title", { oninput: retitle })),
              field("GitHub repository (owner/name)", bound(rec.fields, "repo", { placeholder: "njcuk9999/apero-drs" })),
              field("Documentation (optional URL)", bound(rec.fields, "docs", { type: "url", placeholder: "https://" }))),
            field(tl("Description"), tbound(rec, "body", { rows: 2 }, "textarea")));
        }, function () { return newRec("New software", { repo: "njcuk9999/", docs: "" }); }, "Add software");
      }
    }, records(["repo", "docs"])),

    Object.assign({
      id: "news", label: "News", path: "news.txt", translatable: true, preview: "index.html#news",
      help: "Dated items in the 'Recently' section at the top of the home page, newest first; the latest four " +
        "show and the rest sit behind 'Show all'. The section is hidden while this is empty.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field(tl("Headline"), tbound(rec, "title", { oninput: retitle })),
              field("Date (YYYY-MM-DD, or YYYY-MM)", bound(rec.fields, "date", { placeholder: today() })),
              field("Link (optional URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field(tl("Text (optional)"), tbound(rec, "body", { rows: 3 }, "textarea")));
        }, function () { return newRec("New item", { date: today(), url: "" }); }, "Add news item", true);
      }
    }, records(["date", "url"])),

    Object.assign({
      id: "talks", label: "Talks", path: "talks.txt", translatable: true, preview: "index.html#talks",
      help: "Talks, seminars, posters and outreach, shown newest first on the home page and the CV. Hidden while empty.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field(tl("Title"), tbound(rec, "title", { oninput: retitle })),
              field("Date (YYYY-MM-DD)", bound(rec.fields, "date", { placeholder: today() })),
              field("Kind", select(rec.fields, "kind", [["talk", "Talk"], ["invited", "Invited talk"],
                ["seminar", "Seminar"], ["colloquium", "Colloquium"], ["poster", "Poster"], ["lecture", "Lecture"],
                ["workshop", "Workshop"], ["outreach", "Public outreach"], ["media", "Media"]])),
              field(tl("Event"), tbound(rec, "event", { placeholder: "e.g. AAS 249" })),
              field(tl("Place"), tbound(rec, "place", { placeholder: "e.g. Montréal, Canada" })),
              field("Slides (URL)", bound(rec.fields, "slides", { type: "url", placeholder: "https://" })),
              field("Video (URL)", bound(rec.fields, "video", { type: "url", placeholder: "https://" })),
              field("Other link (URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field(tl("Notes (optional)"), tbound(rec, "body", { rows: 2 }, "textarea")));
        }, function () { return newRec("New talk", { date: today(), kind: "talk" }); }, "Add talk", true);
      }
    }, records(["date", "kind", "event", "place", "slides", "video", "url"])),

    Object.assign({
      id: "students", label: "Students", path: "students.txt", translatable: true, preview: "index.html#students",
      help: "People you supervise or mentor, grouped into current and former. Hidden while empty.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field("Name", bound(rec, "title", { oninput: editLang === "en" ? retitle : null })),
              field(tl("Role"), tbound(rec, "role", { placeholder: "e.g. PhD student" })),
              field("Years", bound(rec.fields, "years", { placeholder: "e.g. 2023 – present" })),
              field("Status", select(rec.fields, "status", [["current", "Current"], ["past", "Former"]])),
              field("Link (optional URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field("Photo (optional; initials are shown otherwise)", imageField(rec.fields)),
            field(tl("Project"), tbound(rec, "body", { rows: 2 }, "textarea")));
        }, function () { return newRec("New student", { status: "current" }); }, "Add student");
      }
    }, records(["role", "years", "status", "url", "image"])),

    {
      id: "publications", label: "Publications", path: Publications.CONFIG.hideFile, preview: "index.html#publications",
      help: "Every work found on your OpenAlex profile and ORCID record. Untick anything that isn't " +
        "yours or that you don't want listed; it's saved to the hide list. Add missing papers in " +
        "ORCID or OpenAlex, not here.",
      parse: function (t) { return { hidden: Publications.parseHidden(t), q: "" }; },
      serialize: function (m) {
        var byKey = {};
        (pubWorks || []).forEach(function (p) { byKey[Publications.keyOf(p).toLowerCase()] = p; });
        return "# Publications hidden from the home page. Edit from admin.html (Publications tab).\n" +
          "# One DOI, OpenAlex work ID (W...) or orcid:<put-code> per line; text after # is ignored.\n" +
          Object.keys(m.hidden).sort().map(function (k) {
            var p = byKey[k];
            return k + (p ? "  # " + p.year + " " + p.title.replace(/\s+/g, " ") : "");
          }).join("\n") + "\n";
      },
      editor: publicationsEditor
    },

    Object.assign({
      id: "cv", label: "CV", path: "cv.txt", translatable: true, preview: "cv.html",
      help: "Entries on cv.html, grouped by section in the usual CV order. Publications, software and talks " +
        "are added to the CV automatically.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field(tl("Title"), tbound(rec, "title", { oninput: retitle })),
              field("Section", select(rec.fields, "section", [["positions", "Positions"], ["education", "Education"],
                ["awards", "Awards & fellowships"], ["grants", "Grants & observing time"],
                ["teaching", "Teaching & supervision"], ["service", "Service"], ["interests", "Research interests"],
                ["skills", "Skills"], ["outreach", "Outreach"], ["languages", "Languages"], ["other", "Other"]])),
              field(tl("When"), tbound(rec, "when", { placeholder: "e.g. 2021 – present" })),
              field(tl("Where"), tbound(rec, "where", { placeholder: "e.g. Université de Montréal" })),
              field("Link (optional URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field(tl("Details (optional)"), tbound(rec, "body", { rows: 2 }, "textarea")));
        }, function () { return newRec("New entry", { section: "positions" }); }, "Add CV entry");
      }
    }, records(["section", "when", "where", "url"])),

    Object.assign({
      id: "clocks", label: "Clocks", path: "clocks.txt", translatable: true, preview: "clocks.html",
      help: "The cities on clocks.html. The time zone is an IANA name (start typing to pick one); latitude and " +
        "longitude place the pin on the map (leave them empty for no pin).",
      validate: function (m) {
        for (var i = 0; i < m.length; i++) {
          if (!m[i].title.trim()) return "Clock " + (i + 1) + " needs a name.";
          try { new Intl.DateTimeFormat("en", { timeZone: m[i].fields.zone }); } catch (e) {
            return "'" + (m[i].fields.zone || "") + "' (" + m[i].title + ") isn't a time zone name, e.g. Europe/Paris.";
          }
        }
      },
      editor: function (m) {
        var zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
        return h("div", null,
          h("datalist", { id: "tz-list" }, zones.map(function (z) { return h("option", { value: z }); })),
          recordList(m, function (rec, retitle) {
            return h("div", { class: "grid2" },
              field(tl("Name"), tbound(rec, "title", { oninput: retitle })),
              field("Time zone", bound(rec.fields, "zone", { list: "tz-list", placeholder: "e.g. Europe/Paris" })),
              field("Latitude (°, north +)", bound(rec.fields, "lat", { placeholder: "48.86" })),
              field("Longitude (°, east +)", bound(rec.fields, "lon", { placeholder: "2.35" })));
          }, function () { return newRec("New city", { zone: "" }); }, "Add clock"));
      }
    }, records(["zone", "lat", "lon"])),

    {
      id: "links", label: "Links page", path: "links.txt", preview: "plinks.html",
      help: "Sections and links on plinks.html.",
      parse: SiteData.parseLinks,
      serialize: SiteData.serializeLinks,
      validate: function (m) {
        for (var i = 0; i < m.length; i++) {
          if (!m[i].title.trim()) return "Section " + (i + 1) + " needs a title.";
          m[i].links = m[i].links.filter(function (l) { return l.name.trim() || l.url.trim(); });
          for (var j = 0; j < m[i].links.length; j++) {
            var l = m[i].links[j];
            if (!l.name.trim() || !l.url.trim()) {
              return "In '" + m[i].title + "', every link needs both a name and a URL.";
            }
          }
        }
      },
      editor: function (m) {
        return h("div", null,
          m.map(function (sec, i) {
            var title = h("span", { class: "title" }, sec.title);
            return h("div", { class: "item section" },
              h("div", { class: "item-head" }, title, moveButtons(m, i)),
              field("Section title", bound(sec, "title", { oninput: function (v) { title.textContent = v; } })),
              h("label", { class: "f" }, "Links (" + sec.links.length + ")"),
              sec.links.map(function (l, j) {
                return h("div", { class: "linkrow" },
                  bound(l, "name", { placeholder: "Name" }),
                  bound(l, "url", { type: "url", placeholder: "https://" }),
                  h("div", { class: "row" }, moveButtons(sec.links, j)));
              }),
              h("button", { onclick: function () {
                sec.links.push({ name: "", url: "" }); markDirty(); render();
              } }, "+ Add link"));
          }),
          h("button", { onclick: function () {
            m.push({ title: "New section", links: [] }); markDirty(); render();
          } }, "+ Add section"));
      }
    },

    {
      id: "settings", label: "Settings", path: "settings.txt",
      help: "Site-wide settings. Visitor statistics use GoatCounter (free, no cookies, no banner needed): " +
        "sign up at goatcounter.com, pick a code (e.g. 'njcook' for njcook.goatcounter.com) and enter it " +
        "here. Leave it empty to turn statistics off.",
      parse: function (t) {
        var r = SiteData.parseRecords(t)[0] || { fields: {} };
        return { title: "Analytics", fields: { goatcounter: r.fields.goatcounter || "" }, body: "", bodies: {} };
      },
      serialize: function (m) { return SiteData.serializeRecords([m], ["goatcounter"]); },
      editor: function (m) {
        var code = (m.fields.goatcounter || "").trim();
        return h("div", { class: "item" },
          field("GoatCounter code", bound(m.fields, "goatcounter", { placeholder: "e.g. njcook" })),
          code ? h("p", { class: "small" }, h("a", { href: "https://" + encodeURIComponent(code) + ".goatcounter.com",
            target: "_blank", rel: "noopener" }, "Open the statistics dashboard")) : null);
      }
    }
  ];

  // ------------------------------------------------------------------
  // publications hide list
  // ------------------------------------------------------------------

  // every work from the sources, loaded once per session
  var pubWorks = null;

  function publicationsEditor(m) {
    var box = h("div", null, h("p", { class: "status" }, "Loading works from OpenAlex and ORCID..."));
    var cfg = { orcid: Publications.CONFIG.orcid, openalex: Publications.CONFIG.openalex };
    (pubWorks ? Promise.resolve(pubWorks) : Publications.load(cfg).then(function (r) {
      pubWorks = r.pubs.sort(function (a, b) { return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0; });
      return pubWorks;
    })).then(function (works) {
      box.innerHTML = "";
      var count = h("span", { class: "muted small" });
      var list = h("div");
      function paintCount() {
        var n = works.filter(function (p) { return Publications.isHidden(p, m.hidden); }).length;
        count.textContent = (works.length - n) + " shown on the site, " + n + " hidden";
      }
      function paintList() {
        var q = m.q.trim().toLowerCase();
        list.innerHTML = "";
        works.filter(function (p) {
          return !q || (p.title + " " + p.venue + " " + p.year).toLowerCase().indexOf(q) >= 0;
        }).forEach(function (p) {
          var shown = !Publications.isHidden(p, m.hidden);
          var tick = h("input", { type: "checkbox", checked: shown, title: "Show on the site" });
          var row = h("label", { class: "pubrow" + (shown ? "" : " is-hidden") }, tick,
            h("span", { class: "pubyear" }, p.year),
            h("span", { class: "grow" },
              h("span", { class: "pubtitle" }, p.title),
              h("span", { class: "muted small" }, [p.venue, p.type === "article" || p.type === "journal-article" ? null : p.type,
                (p.cites || 0) + " citations",
                p.source === "orcid" ? "ORCID only" : null].filter(Boolean).join(" · "))));
          tick.addEventListener("change", function () {
            if (tick.checked) {
              [p.doi, p.oaId && p.oaId.toLowerCase(), p.putCode && "orcid:" + p.putCode].forEach(function (k) {
                if (k) delete m.hidden[k];
              });
            } else {
              m.hidden[Publications.keyOf(p).toLowerCase()] = true;
            }
            row.className = "pubrow" + (tick.checked ? "" : " is-hidden");
            markDirty();
            paintCount();
          });
          append(list, row);
        });
      }
      // searching isn't an edit, so this input isn't bound()
      var search = h("input", { type: "text", class: "grow", value: m.q, placeholder: "Search titles, journals, years" });
      search.addEventListener("input", function () { m.q = search.value; paintList(); });
      append(box, h("div", { class: "row", style: "margin-bottom:10px" }, search, count));
      append(box, list);
      paintCount();
      paintList();
    }).catch(function (e) {
      box.innerHTML = "";
      append(box, h("p", { class: "status err" }, "Couldn't load publications: " + (e.message || e)));
    });
    return box;
  }

  // ------------------------------------------------------------------
  // tab state, rendering, save / reload
  // ------------------------------------------------------------------

  var current = null;

  function anyDirty() {
    return tabs.some(function (t) { return t.state && t.state.dirty; });
  }

  function markDirty() {
    if (!current || !current.state || current.state.dirty) return;
    current.state.dirty = true;
    paintTabs();
    setStatus($("status"), "Unsaved changes", "warn");
  }

  function paintTabs() {
    var nav = $("tabs");
    nav.innerHTML = "";
    tabs.forEach(function (t) {
      append(nav, h("button", {
        class: t === current ? "active" : "",
        onclick: function () { selectTab(t); }
      }, t.label, t.state && t.state.dirty ? h("span", { class: "dot" }, " ●") : null));
    });
  }

  function selectTab(t) {
    current = t;
    paintTabs();
    $("tab-help").textContent = t.help + " Stored in " + t.path + ".";
    $("lang-pick").hidden = !t.translatable;
    $("preview-btn").hidden = !t.preview;
    if (t.state) { render(); return; }
    load(t);
  }

  function load(t) {
    t.state = null;
    $("editor").innerHTML = "";
    setStatus($("status"), "Loading " + t.path + "...");
    getFile(t.path).then(function (f) {
      t.state = { model: t.parse(f.text), sha: f.sha, dirty: false, raw: null };
      if (t === current) {
        paintTabs();
        render();
        setStatus($("status"), f.sha ? "Loaded" : t.path + " doesn't exist yet; it will be created on save.", f.sha ? "" : "warn");
      }
    }).catch(function (e) {
      if (t === current) setStatus($("status"), "Couldn't load " + t.path + ": " + explain(e), "err");
    });
  }

  function render() {
    var t = current, s = t.state, ed = $("editor");
    ed.innerHTML = "";
    if (!s) return;
    $("raw-btn").textContent = s.raw === null ? "Edit as raw text" : "Back to form";
    if (s.raw !== null) {
      append(ed, bound(s, "raw", { class: "raw", spellcheck: "false" }, "textarea"));
    } else {
      if (t.translatable && editLang !== "en") {
        append(ed, h("p", { class: "banner" }, "Editing the " + LANG_NAMES[editLang] + " version. Yellow fields " +
          "are translations; leave one empty to show the English. Other fields are shared by every language."));
      }
      append(ed, t.editor(s.model));
    }
  }

  $("raw-btn").addEventListener("click", function () {
    var s = current && current.state;
    if (!s) return;
    if (s.raw === null) s.raw = current.serialize(s.model);
    else { s.model = current.parse(s.raw); s.raw = null; }
    render();
  });

  $("reload-btn").addEventListener("click", function () {
    if (!current) return;
    if (current.state && current.state.dirty && !confirm("Discard your unsaved changes to " + current.path + "?")) return;
    load(current);
  });

  $("save-btn").addEventListener("click", function () {
    var t = current, s = t && t.state;
    if (!s) return;
    if (s.raw !== null) s.model = t.parse(s.raw);
    var problem = t.validate && t.validate(s.model);
    if (problem) return setStatus($("status"), problem, "err");
    var text = t.serialize(s.model);
    $("save-btn").disabled = true;
    setStatus($("status"), "Saving...");
    putFile(t.path, utf8ToB64(text), s.sha, "Update " + t.path + " via admin page").then(function (sha) {
      s.sha = sha;
      s.dirty = false;
      if (s.raw !== null) s.raw = text;
      paintTabs();
      render();
      setStatus($("status"), "Saved. The live site updates in about a minute.", "ok");
    }).catch(function (e) {
      setStatus($("status"), "Save failed: " + explain(e), "err");
    }).then(function () {
      $("save-btn").disabled = false;
    });
  });

  $("edit-lang").addEventListener("change", function () {
    editLang = $("edit-lang").value;
    if (current && current.state) render();
  });

  // ------------------------------------------------------------------
  // preview: the page with the unsaved changes of every tab
  // ------------------------------------------------------------------

  function openPreview() {
    var t = current;
    if (!t || !t.preview) return;
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf(SiteData.PREVIEW_PREFIX) === 0) localStorage.removeItem(k);
      });
      tabs.forEach(function (x) {
        var s = x.state;
        if (!s || (!s.dirty && x !== t)) return;
        var model = s.raw !== null ? x.parse(s.raw) : s.model;
        localStorage.setItem(SiteData.PREVIEW_PREFIX + x.path, x.serialize(model));
      });
    } catch (e) {
      return setStatus($("status"), "Preview needs browser storage, which is blocked here.", "err");
    }
    var page = t.preview.split("#");
    var url = page[0] + "?preview=1&lang=" + (t.translatable ? editLang : "en") + (page[1] ? "#" + page[1] : "");
    $("preview-title").textContent = "Preview: " + page[0];
    $("preview-frame").src = url;
    $("preview-open").href = url;
    $("preview-modal").hidden = false;
  }

  function closePreview() {
    $("preview-modal").hidden = true;
    $("preview-frame").src = "about:blank";
  }

  $("preview-btn").addEventListener("click", openPreview);
  $("preview-close").addEventListener("click", closePreview);
  $("preview-phone").addEventListener("click", function () {
    var phone = $("preview-box").classList.toggle("phone");
    $("preview-phone").textContent = phone ? "Full width" : "Phone width";
  });

  // ------------------------------------------------------------------
  // history: earlier versions of the current file, from its commits
  // ------------------------------------------------------------------

  function openHistory() {
    var t = current;
    if (!t) return;
    var box = $("history-list");
    $("history-title").textContent = "History of " + t.path;
    box.innerHTML = "";
    append(box, h("p", { class: "status" }, "Loading..."));
    $("history-modal").hidden = false;
    api("/repos/" + OWNER + "/" + REPO + "/commits?sha=" + BRANCH + "&per_page=40&path=" + encodeURIComponent(t.path))
      .then(function (list) {
        box.innerHTML = "";
        if (!list.length) return append(box, h("p", { class: "muted" }, "No saved versions yet."));
        list.forEach(function (c, i) {
          var when = new Date(c.commit.author.date);
          append(box, h("div", { class: "hist" },
            h("span", { class: "when" }, when.toLocaleString()),
            h("span", { class: "grow" }, c.commit.message.split("\n")[0],
              i === 0 ? h("span", { class: "muted small" }, " (current)") : null),
            h("a", { class: "small", href: c.html_url, target: "_blank", rel: "noopener" }, "changes"),
            i === 0 ? null : h("button", { onclick: function () { restore(t, c.sha, when); } }, "Load this version")));
        });
      }).catch(function (e) {
        box.innerHTML = "";
        append(box, h("p", { class: "status err" }, "Couldn't load the history: " + explain(e)));
      });
  }

  // loads an old version into the editor; saving makes it live again
  function restore(t, sha, when) {
    if (t.state && t.state.dirty && !confirm("Replace your unsaved changes with this older version?")) return;
    api(contentsPath(t.path) + "?ref=" + sha).then(function (d) {
      t.state.model = t.parse(b64ToUtf8(d.content || ""));
      t.state.raw = null;
      t.state.dirty = false;
      $("history-modal").hidden = true;
      if (current === t) {
        markDirty();
        render();
        setStatus($("status"), "Loaded the version from " + when.toLocaleString() + ". Save to make it live again.", "warn");
      }
    }).catch(function (e) {
      setStatus($("status"), "Couldn't load that version: " + explain(e), "err");
    });
  }

  $("history-btn").addEventListener("click", openHistory);
  $("history-close").addEventListener("click", function () { $("history-modal").hidden = true; });

  ["preview-modal", "history-modal"].forEach(function (id) {
    $(id).addEventListener("click", function (e) {
      if (e.target !== $(id)) return;
      if (id === "preview-modal") closePreview(); else $(id).hidden = true;
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("preview-modal").hidden) closePreview();
    $("history-modal").hidden = true;
  });

  // ------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------

  loadIcons();
  var saved = storedToken();
  if (saved) {
    var remembered = false;
    try { remembered = !!localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    login(saved, remembered).catch(function (e) { showLogin(explain(e)); });
  } else {
    showLogin();
  }
})();
