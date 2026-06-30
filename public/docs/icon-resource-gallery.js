(function () {
  var root = document.getElementById("icon-resource-gallery");
  if (!root) return;

  var searchInput = document.getElementById("icon-gallery-search");
  var familySelect = document.getElementById("icon-gallery-family");
  var categorySelect = document.getElementById("icon-gallery-category");
  var countEl = document.getElementById("icon-gallery-count");
  var grid = document.getElementById("icon-gallery-grid");
  var emptyEl = document.getElementById("icon-gallery-empty");
  var catalogs = (root.getAttribute("data-catalogs") || "")
    .split(",")
    .map(function (catalog) {
      return catalog.trim();
    })
    .filter(Boolean);
  var icons = [];

  function catalogLabel(url) {
    var parts = url.split("/");
    var family = parts[2] || "icons";
    var era = parts[3] || "catalog";
    var prefix = family.indexOf("macos") === 0 ? "Mac OS X" : "Windows";
    return (
      prefix +
      " " +
      era
        .split("-")
        .map(function (part) {
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(" ")
    );
  }

  function stripMarkdown(value) {
    return value
      .replace(/`/g, "")
      .replace(/^\[/, "")
      .replace(/\]\(.+\)$/, "")
      .trim();
  }

  function assetUrl(value) {
    return stripMarkdown(value).replace(/^\/public\//, "/");
  }

  function parseCatalog(markdown, url) {
    var family = catalogLabel(url);
    var category = "";
    var entries = [];

    markdown.split("\n").forEach(function (line) {
      var heading = line.match(/^##\s+(.+)$/);
      if (heading) {
        category = heading[1].trim();
        return;
      }

      if (line.indexOf("|") !== 0 || line.indexOf("---") !== -1) return;

      var cells = line
        .split("|")
        .slice(1, -1)
        .map(function (cell) {
          return cell.trim();
        });
      if (cells.length < 2 || cells[0] === "Name" || cells[1] === "PNG") return;

      var name = stripMarkdown(cells[0]);
      var path = assetUrl(cells[1]);
      if (!name || !path) return;

      var details = cells
        .slice(2)
        .map(stripMarkdown)
        .filter(Boolean);
      var source = details
        .join(" ");
      var size =
        details.find(function (detail) {
          return /^\d+x\d+$/.test(detail);
        }) || "";
      var entry = {
        name: name,
        path: path,
        family: family,
        category: category || "Uncategorized",
        size: stripMarkdown(size),
        source: source,
      };
      entry.searchText = [
        entry.name,
        entry.family,
        entry.category,
        entry.size,
        entry.source,
        entry.path,
      ]
        .join(" ")
        .toLowerCase();
      entries.push(entry);
    });

    return entries;
  }

  function option(value) {
    var el = document.createElement("option");
    el.value = value;
    el.textContent = value;
    return el;
  }

  function populateFilters() {
    Array.from(new Set(icons.map(function (icon) { return icon.family; })))
      .sort()
      .forEach(function (family) {
        familySelect.appendChild(option(family));
      });
    Array.from(new Set(icons.map(function (icon) { return icon.category; })))
      .sort()
      .forEach(function (category) {
        categorySelect.appendChild(option(category));
      });
  }

  function matchesFilters(icon, query, family, category) {
    if (family && icon.family !== family) return false;
    if (category && icon.category !== category) return false;
    return !query || icon.searchText.indexOf(query) !== -1;
  }

  function render() {
    var query = (searchInput.value || "").trim().toLowerCase();
    var family = familySelect.value;
    var category = categorySelect.value;
    var visible = icons
      .filter(function (icon) {
        return matchesFilters(icon, query, family, category);
      })
      .slice(0, 240);

    grid.textContent = "";
    visible.forEach(function (icon) {
      var card = document.createElement("a");
      card.className = "icon-card";
      card.href = icon.path;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.title = icon.name + " - " + icon.family + " / " + icon.category;

      var preview = document.createElement("div");
      preview.className = "icon-card-preview";
      var img = document.createElement("img");
      img.src = icon.path;
      img.alt = icon.name;
      img.loading = "lazy";
      preview.appendChild(img);

      var title = document.createElement("div");
      title.className = "icon-card-title";
      title.textContent = icon.name;

      var meta = document.createElement("div");
      meta.className = "icon-card-detail";
      meta.textContent = icon.family + " / " + icon.category;

      var size = document.createElement("div");
      size.className = "icon-card-detail";
      size.textContent = icon.size || icon.path.split("/").pop();

      card.append(preview, title, meta, size);
      grid.appendChild(card);
    });

    var suffix = visible.length === 240 ? " shown, refine search for more" : " shown";
    countEl.textContent = visible.length + " of " + icons.length + " icons" + suffix;
    emptyEl.hidden = visible.length !== 0;
  }

  function setError(message) {
    countEl.textContent = message;
    emptyEl.hidden = false;
    emptyEl.textContent = "The icon catalogs could not be loaded.";
  }

  Promise.all(
    catalogs.map(function (catalog) {
      return fetch(catalog)
        .then(function (response) {
          if (!response.ok) throw new Error(catalog + " failed");
          return response.text();
        })
        .then(function (markdown) {
          return parseCatalog(markdown, catalog);
        });
    }),
  )
    .then(function (catalogEntries) {
      icons = catalogEntries.flat().sort(function (a, b) {
        return a.family.localeCompare(b.family) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      });
      populateFilters();
      render();
    })
    .catch(function () {
      setError("Unable to load icon catalogs");
    });

  searchInput.addEventListener("input", render);
  familySelect.addEventListener("change", render);
  categorySelect.addEventListener("change", render);
})();
