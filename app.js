import { REGIONES, ETIQUETAS, SERVIDORES, LIMITE_FILAS } from "./config.js";
import { uniq, tipoPhoneES, dupPhones, dupTxt, testVal, validarNumero as validarNumeroTelefonico } from "./telefonos.js";
const $ = (s) => document.querySelector(s),
  A = (t, h) => {
    const e = document.createElement(t);
    h && (e.innerHTML = h);
    return e;
  };
Object.entries(REGIONES).forEach(([k, v]) => {
  const o = A("option", k);
  o.value = v;
  $("#region").append(o);
});
ETIQUETAS.forEach(([k, x]) => {
  const o = A("option", k);
  o.dataset.expect = x;
  $("#tag").append(o);
});
let modoPersonalizado = 0,
  soloValidos = 0,
  lastRun = null,
  activeView = "validation",
  selectedFormat = null,
  formatMapOpen = false,
  formatsById = new Map(),
  formatItemsById = new Map(),
  validationCamera = null,
  itemsById = new Map(),
  popupById = new Map(),
  openGroups = new Set();
const osmKey = (x) => x.type + "/" + x.id,
  sid = (x) => ({ node: "n", way: "w", relation: "r" }[x.type] + x.id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    ),
  tagActivo = () =>
    modoPersonalizado ? $("#customKey").value.trim() : $("#tag").value,
  server = () => SERVIDORES[$("#server").value] || SERVIDORES.postpass,
  chunk = (a, n) =>
    Array.from({ length: Math.ceil(a.length / n) }, (_, i) =>
      a.slice(i * n, i * n + n)
    );
const clip = (t) =>
    navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(t).catch(() => fallback(t))
      : fallback(t),
  fallback = (t) => {
    const x = A("textarea");
    x.value = t;
    x.style.cssText = "position:fixed;opacity:0";
    document.body.append(x);
    x.select();
    try {
      document.execCommand("copy");
    } catch {}
    x.remove();
  },
  openOT = (q) =>
    window.open(
      "https://overpass-turbo.eu/?Q=" + encodeURIComponent(q),
      "_blank",
      "noopener"
    );
const ov = $("#overlay"),
  ovT = $("#ovlTitle"),
  ovL = $("#ovlLog"),
  ovB = $("#ovlBtn"),
  ovOpen = () => {
    ov.hidden = 0;
    ovB.style.display = "none";
  },
  ovClose = () => (ov.hidden = 1),
  ovReset = () => {
    ovT.textContent = "";
    ovL.innerHTML = "";
    ovB.style.display = "none";
  },
  ovSet = (x) => (ovT.textContent = x),
  ovAdd = (x, c) => {
    const li = A("li");
    li.textContent = x;
    c && (li.className = c);
    ovL.append(li);
    ovL.scrollTop = ovL.scrollHeight;
    return li;
  },
  ovErr = () => {
    ovB.textContent = "Cerrar";
    ovB.style.display = "inline-block";
    ovB.onclick = ovClose;
  },
  toast = (x) => {
    ovReset();
    ovSet(x);
    ovAdd("✅ Todo OK", "ok");
    ovOpen();
    setTimeout(ovClose, 1200);
  };
const buildQ = (its) => {
  const by = { node: [], way: [], relation: [] };
  its.forEach((x) => by[x.type]?.push(x.id));
  return (
    "[out:xml][timeout:62][maxsize:16Mi];\n(\n" +
    ["node", "way", "relation"]
      .map((t) =>
        by[t].length
          ? (t[0] === "r" ? "rel" : t) + "(id:" + uniq(by[t]) + ");"
          : ""
      )
      .filter(Boolean)
      .join("\n") +
    "\n);\n(._;>;);\nout meta;"
  );
};
const buildPostpassQ = (zona, tag) => {
  const key = tag.replace(/'/g, "''");
  return [
    "WITH area AS MATERIALIZED (",
    "  SELECT geom",
    "  FROM postpass_polygon",
    "  WHERE osm_type='R'",
    `  AND osm_id=${zona}`,
    ")",
    "SELECT DISTINCT ON (p.osm_type,p.osm_id)",
    "  p.osm_type,p.osm_id,p.tags,",
    "  ST_PointOnSurface(p.geom) AS geom",
    "FROM area a",
    "JOIN postpass_pointlinepolygon p ON p.geom && a.geom",
    `WHERE p.tags ? '${key}'`,
    "AND ST_Intersects(a.geom,ST_PointOnSurface(p.geom))",
    "ORDER BY p.osm_type,p.osm_id,ST_Dimension(p.geom) DESC"
  ].join("\n");
};
const normalizeElements = (json, isPostpass) => {
  if (!isPostpass) {
    if (!Array.isArray(json?.elements)) throw Error("Respuesta Overpass no reconocida");
    return json.elements.map((e) => ({
      id: e.id,
      type: e.type,
      lat: e.center?.lat ?? e.lat,
      lon: e.center?.lon ?? e.lon,
      tags: e.tags || {}
    }));
  }
  if (json?.type !== "FeatureCollection" || !Array.isArray(json.features)) throw Error("Respuesta GeoJSON de Postpass no reconocida");
  return json.features.map((feature) => {
    const p = feature.properties || {},
      type = { N: "node", W: "way", R: "relation" }[p.osm_type],
      id = Number(p.osm_id),
      coords = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
    if (!type || !Number.isSafeInteger(id) || id <= 0) throw Error("Postpass devolvió un identificador OSM inválido");
    return {
      id,
      type,
      lat: coords?.[1],
      lon: coords?.[0],
      tags: p.tags || {}
    };
  });
};
const validarNumero = (n, tag, ctx = "osm") => {
  const exp = modoPersonalizado
    ? $("#customExpect").value
    : [...$("#tag").options].find((o) => o.textContent === tag)?.dataset.expect || "any";
  return validarNumeroTelefonico(n, tag, ctx, exp);
};
const fmtWebsite = (v) =>
    v
      .split(";")
      .map((u) =>
        (u = u.trim())
          ? `<a href="${esc(
              /^https?:\/\//i.test(u) ? u : "https://" + u
            )}" target="_blank" rel="noopener">${esc(u)}</a>`
          : ""
      )
      .join("; "),
  fmtPhones = (k, v) =>
    v
      .split(";")
      .map((u) =>
        (u = u.trim())
          ? `<span style="color:var(${
              !validarNumero(u, k).length ? "--ok" : "--error"
            });font-weight:900">${esc(u)}</span>`
          : ""
      )
      .join("; "),
  josmUrl = (x) =>
    "http://127.0.0.1:8111/load_object?objects=" +
    encodeURIComponent(sid(x)) +
    "&new_layer=true",
  rapidUrl = (x) =>
    "https://rapideditor.org/edit#id=" +
    encodeURIComponent(sid(x)) +
    "&map=19/" +
    x.lat +
    "/" +
    x.lon;
const popupHTML = (x) => {
  const key = osmKey(x),
    rows = Object.entries(x.tags || {})
      .sort()
      .map(([k, v]) => {
        const isP = /(^|:)(phone|mobile|fax|whatsapp)$|^phone:mobile$/i.test(k),
          isW = /website/i.test(k);
        return `<div class="popup-k">${esc(k)}</div><div class="popup-v"${
          isP || isW ? ' style="color:var(--a);font-weight:800"' : ""
        }>${isW ? fmtWebsite(v) : isP ? fmtPhones(k, v) : esc(v)}</div>`;
      })
      .join(""),
    db = x.dups?.length
      ? `<div style="border-top:1px solid var(--b);padding-top:7px"><div style="color:var(--error);font-weight:900;margin-bottom:4px">Duplicados</div><div style="display:grid;gap:4px">${x.dups
          .map(
            (d) =>
              `<div style="overflow-wrap:anywhere"><span style="color:var(--error);font-weight:800">${esc(
                d.norm
              )}</span> <span style="color:var(--m)">→ ${esc(
                d.vals.map((v) => v.tag).join(" · ")
              )}</span></div>`
          )
          .join("")}</div></div>`
      : "";
  return `<div class="popup-box"><div class="popup-title mono">${esc(
    x.tags?.name || key
  )}</div><div class="popup-tags">${rows}</div>${db}<div class="popup-actions"><a href="https://www.openstreetmap.org/${key}" target="_blank" rel="noopener" class="pbtn" title="Ver en OSM"><span class="ico">🔍</span></a><a href="https://www.openstreetmap.org/edit?${
    x.type
  }=${
    x.id
  }" target="_blank" rel="noopener" class="pbtn" title="Editar con iD"><span class="ico">✏️</span></a><a href="${esc(
    josmUrl(x)
  )}" target="_blank" rel="noopener" class="pbtn" title="Editar con JOSM"><span class="ico">🧰</span></a><a href="${esc(
    rapidUrl(x)
  )}" target="_blank" rel="noopener" class="pbtn" title="Editar con Rapid"><span class="ico">⚡</span></a></div></div>`;
};
const openJOSM = (its) => {
  const ids = its.map(sid);
  (ids.join(",").length > 1700 ? chunk(ids, 200) : [ids]).forEach((c, i) =>
    fetch(
      "http://127.0.0.1:8111/load_object?objects=" +
        encodeURIComponent(c.join(",")) +
        "&new_layer=" +
        !i
    ).catch(() => 0)
  );
};
const groupFeatures = new Map(),
  pointsSource = new ol.source.Vector({ wrapX: false }),
  pointsStyle = {
    "circle-radius": 6,
    "circle-fill-color": ["case", ["==", ["get", "ok"], 1], "#78d5a4", "#ef8491"],
    "circle-stroke-color": "#ffffff",
    "circle-stroke-width": 1.5
  },
  pointsLayer = new ol.layer.WebGLVector({
    source: pointsSource,
    style: [{ filter: ["==", ["get", "shown"], 1], style: pointsStyle }]
  }),
  formatPointsSource = new ol.source.Vector({ wrapX: false }),
  formatLayer = new ol.layer.WebGLVector({
    source: formatPointsSource,
    variables: { selectedFormat: -1 },
    style: [{
      filter: ["any", ["==", ["var", "selectedFormat"], 0], ["==", ["get", "formatId"], ["var", "selectedFormat"]]],
      style: {
        "circle-radius": 6,
        "circle-fill-color": "#8db6e8",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5
      }
    }],
    visible: false
  }),
  base = new ol.layer.Tile({
    className: "dark-base-layer",
    source: new ol.source.OSM({ referrerPolicy: "strict-origin-when-cross-origin" })
  }),
  map = new ol.Map({
    target: "map",
    layers: [base, pointsLayer, formatLayer],
    view: new ol.View({
      center: ol.proj.fromLonLat([-3.7, 40.4]),
      zoom: 6,
      minZoom: 5,
      maxZoom: 19,
      enableRotation: false
    }),
    controls: ol.control.defaults.defaults({ rotate: false })
  }),
  popElement = A("div"),
  popClose = A("button", "✕"),
  popContent = A("div"),
  pop = new ol.Overlay({
    element: popElement,
    positioning: "bottom-center",
    offset: [0, -12],
    autoPan: { animation: { duration: 200 }, margin: 16 }
  });
popElement.className = "ol-phone-popup";
popElement.hidden = true;
popClose.className = "ol-phone-close";
popClose.type = "button";
popClose.title = "Cerrar";
popClose.setAttribute("aria-label", "Cerrar ventana del elemento");
popContent.className = "ol-phone-content";
popElement.append(popClose, popContent);
map.addOverlay(pop);
const hidePopup = () => {
    pop.setPosition(undefined);
    popElement.hidden = true;
  },
  setGeo = (d) => {
    const features = new ol.format.GeoJSON().readFeatures(d, { featureProjection: "EPSG:3857" });
    groupFeatures.clear();
    features.forEach((f) => {
      const id = f.get("g");
      if (!groupFeatures.has(id)) groupFeatures.set(id, []);
      groupFeatures.get(id).push(f);
    });
    pointsSource.clear(true);
    pointsSource.addFeatures(features);
  },
  visibility = (id, shown) => {
    (groupFeatures.get(id) || []).forEach((f) => f.set("shown", shown ? 1 : 0));
  },
  showPopup = (x) => {
    const k = osmKey(x),
      h = popupById.get(k) || popupHTML(x);
    popupById.set(k, h);
    popContent.innerHTML = h;
    popElement.hidden = false;
    pop.setPosition(ol.proj.fromLonLat([x.lon, x.lat]));
  },
  focusX = (x) => {
    map.getView().animate({
      center: ol.proj.fromLonLat([x.lon, x.lat]),
      zoom: 18,
      duration: 400
    });
    showPopup(x);
  };
popClose.onclick = hidePopup;
const buildGroups = (tbody, grupos, rows = 1) => {
  const toggle = (i) => {
    const h = tbody.querySelector(`tr.group[data-g="${i}"]`),
      open = h.dataset.open !== "1",
      b = h.querySelector(".btn-toggle");
    tbody
      .querySelectorAll(`tr:not(.group)[data-g="${i}"]`)
      .forEach((tr) => (tr.style.display = open ? "" : "none"));
    h.dataset.open = open ? "1" : "0";
    b.textContent = open ? "▼" : "▶";
    b.title = open ? "Plegar" : "Desplegar";
    open ? openGroups.add(String(i)) : openGroups.delete(String(i));
    visibility(String(i), open);
  };
  grupos.forEach((g, gi) => {
    const sep = A("tr");
    sep.className = "group";
    sep.dataset.g = gi;
    sep.dataset.open = "0";
    sep.innerHTML = `<td colspan="2"><div class="gbar"><button class="btn-toggle">▶</button><span class="gtitle">${esc(
      g.tipo
    )}</span><span class="gcount">${
      g.items.length
    }</span><div class="actions"><button class="btn-clip" title="Copiar Overpass">📋</button><button class="btn-ot" title="Abrir en Overpass Turbo">🧭</button><button class="btn-josm" title="Cargar grupo en JOSM">🧰</button></div></div></td>`;
    tbody.append(sep);
    const qg = buildQ(g.items);
    sep.onclick = () => toggle(gi);
    sep.querySelector(".btn-clip").onclick = (e) => (
      e.stopPropagation(), clip(qg).then(() => toast("Consulta copiada"))
    );
    sep.querySelector(".btn-ot").onclick = (e) => (
      e.stopPropagation(), openOT(qg)
    );
    sep.querySelector(".btn-josm").onclick = (e) => (
      e.stopPropagation(), openJOSM(g.items)
    );
    rows &&
      g.items.forEach((x) => {
        const key = osmKey(x),
          row = A(
            "tr",
            `<td class="mono"><a href="https://www.openstreetmap.org/${key}" target="_blank" rel="noopener">${key}</a></td><td class="mono num">${esc(
              x.listRaw || x.raw || "—"
            )}</td>`
          );
        row.dataset.g = gi;
        row.style.display = "none";
        tbody.append(row);
        row.onclick = () => focusX(x);
        row.querySelector(".num").onclick = (e) => {
          e.stopPropagation();
          focusX(x);
          $("#testInput").value = testVal(x);
          $("#testInput").dispatchEvent(new Event("input"));
        };
      });
  });
};
const actualizarTester = () => {
    const v = $("#testInput").value.trim(),
      tag = tagActivo(),
      el = $("#testResult");
    if (!v) return void (el.textContent = "–");
    el.innerHTML = v
      .split(";")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const e = validarNumero(n, tag, "test"),
          ok = !e.length;
        return `<span style="color:var(${
          ok ? "--ok" : "--error"
        });font-weight:700">${esc(
          ok ? n + ": OK" : n + ": " + e.join("; ")
        )}</span>`;
      })
      .join("<br>");
  },
  syncMode = () => {
    $("#tag").style.display = modoPersonalizado ? "none" : "";
    $("#customMode").hidden = !modoPersonalizado;
    $("#modeToggle").textContent = modoPersonalizado ? "🎛️" : "🧩";
  };
const renderStats = (t, v, l) => {
  $(
    "#stats"
  ).innerHTML = `<p>Total: ${t}</p><p>Válidos: ${v}<button id="onlyValidToggle" aria-pressed="${soloValidos}" title="${
    soloValidos ? "Volver a listar con errores" : "Listar solo los válidos"
  }">${soloValidos ? "↩️" : "✅"}</button></p><p>Listados: ${l}</p>`;
  $("#onlyValidToggle").onclick = () => {
    if (!lastRun) return;
    soloValidos = !soloValidos;
    renderFromCache();
  };
};
const renderFromCache = () => {
  const { gruposBad, bad, good, t, v, tag } = lastRun,
    tbody = $("#errors tbody"),
    items = soloValidos ? good : bad,
    grupos = soloValidos
      ? tag === "phone:ES"
        ? Object.values(items.reduce((a, x) => {
            const tipos = uniq(x.nums.map((n) => tipoPhoneES(n.n))).sort(),
              tipo = tipos.join(" + ") || "Sin clasificar";
            (a[tipo] ||= { tipo, items: [] }).items.push(x);
            return a;
          }, {})).sort((a, b) => a.tipo.localeCompare(b.tipo))
        : items.length
        ? [{ tipo: "Válidos", items }]
        : []
      : gruposBad,
    l = soloValidos ? v : t - v;
  renderStats(t, v, l);
  tbody.innerHTML = "";
  openGroups.clear();
  const rows =
    items.length <= LIMITE_FILAS ||
    confirm(
      `Hay ${items.length} filas para generar. Más de ${LIMITE_FILAS.toLocaleString(
        "es-ES"
      )} filas HTML pueden ralentizar el navegador.\n\nEl mapa no tiene este límite. ¿Quieres generar también el listado completo?`
    );
  buildGroups(tbody, grupos, rows);
  if (!rows) {
    const n = A(
      "tr",
      `<td colspan="2" class="row-note">Listado de ${items.length.toLocaleString(
        "es-ES"
      )} filas omitido. Los grupos y el mapa siguen disponibles.</td>`
    );
    tbody.prepend(n);
  }
  itemsById = new Map();
  popupById = new Map();
  const gi = new Map();
  grupos.forEach((g, i) =>
    g.items.forEach((x) => gi.set(osmKey(x), String(i)))
  );
  const features = [];
  items.forEach((x) => {
    const k = osmKey(x);
    itemsById.set(k, x);
    Number.isFinite(x.lat) &&
      Number.isFinite(x.lon) &&
      features.push({
        type: "Feature",
        properties: {
          uid: k,
          g: gi.get(k) ?? "",
          shown: 0,
          ok: soloValidos ? 1 : 0
        },
        geometry: {
          type: "Point",
          coordinates: [x.lon, x.lat]
        }
      });
  });
  setGeo({
    type: "FeatureCollection",
    features
  });
  hidePopup();
  if (features.length && activeView === "validation") {
    map.getView().fit(pointsSource.getExtent(), {
      padding: [28, 28, 28, 28],
      maxZoom: 16,
      duration: 500
    });
  }
};
const updateServer = () => {
  $("#serverUrl").textContent = server();
  try {
    localStorage.setItem("telAnalysisEngine", $("#server").value);
  } catch {}
};
try {
  const s = localStorage.getItem("telAnalysisEngine");
  SERVIDORES[s] && ($("#server").value = s);
} catch {}
$("#server").onchange = updateServer;
updateServer();
const getMapItem = (pixel) => {
  const formats = activeView === "formats" && formatMapOpen;
  if (!formats && (activeView !== "validation" || !openGroups.size)) return null;
  const coordinate = map.getCoordinateFromPixel(pixel),
    resolution = map.getView().getResolution();
  if (!coordinate || !Number.isFinite(resolution) || resolution <= 0) return null;
  const radius = resolution * 11,
    extent = [coordinate[0] - radius, coordinate[1] - radius, coordinate[0] + radius, coordinate[1] + radius],
    source = formats ? formatPointsSource : pointsSource,
    items = formats ? formatItemsById : itemsById;
  let found = null,
    best = radius * radius;
  source.forEachFeatureInExtent(extent, (f) => {
    if (formats ? selectedFormat && f.get("formatId") !== selectedFormat.id : !openGroups.has(f.get("g"))) return;
    const point = f.getGeometry().getCoordinates(),
      distance = (point[0] - coordinate[0]) ** 2 + (point[1] - coordinate[1]) ** 2;
    if (distance <= best) {
      best = distance;
      found = f;
    }
  });
  return found ? items.get(found.get("uid")) : null;
};
map.on("singleclick", (e) => {
  const x = getMapItem(e.pixel);
  if (x) showPopup(x);
});
map.on("pointermove", (e) => {
  if (e.dragging) return;
  const x = getMapItem(e.pixel);
  map.getTargetElement().style.cursor = x ? "pointer" : "";
});
const mapLayout = () => {
  const formats = activeView === "formats",
    split = formats && formatMapOpen,
    main = $("main");
  main.classList.toggle("formats-full", formats && !split);
  main.classList.toggle("formats-split", Boolean(split));
  $("#validationPane").hidden = formats;
  $("#formatsPane").hidden = !formats;
  $("#tabValidation").setAttribute("aria-selected", String(!formats));
  $("#tabFormats").setAttribute("aria-selected", String(formats));
  pointsLayer.setVisible(!formats);
  formatLayer.setVisible(Boolean(split));
  hidePopup();
  if (!formats || split) {
    requestAnimationFrame(() => {
      map.updateSize();
      if (split) {
        const extent = selectedFormat?.extent || (formatPointsSource.getFeatures().length ? formatPointsSource.getExtent() : null);
        if (extent) map.getView().fit(extent, { padding: [28, 28, 28, 28], maxZoom: 16, duration: 300 });
      }
    });
  }
};
const showView = (view) => {
  if (activeView === view) return;
  if (activeView === "validation") {
    validationCamera = {
      center: map.getView().getCenter()?.slice(),
      zoom: map.getView().getZoom()
    };
  }
  activeView = view;
  mapLayout();
  if (view === "validation") {
    requestAnimationFrame(() => {
      if (validationCamera) {
        map.getView().setCenter(validationCamera.center);
        map.getView().setZoom(validationCamera.zoom);
      } else if (pointsSource.getFeatures().length) {
        map.getView().fit(pointsSource.getExtent(), { padding: [28, 28, 28, 28], maxZoom: 16 });
      }
    });
  }
};
const updateFormatSelection = () => {
  $("#formatRows").querySelectorAll(".format-row").forEach((row) => {
    const active = Number(row.dataset.formatId) === selectedFormat?.id;
    row.setAttribute("aria-pressed", String(active));
    row.title = active ? "Mostrar todos los elementos" : "Mostrar este formato en el mapa";
  });
  $("#formatExpand").hidden = !selectedFormat && !formatMapOpen;
  $("#formatExpand").textContent = formatMapOpen ? "⛶ Solo ranking" : "◧ Mostrar mapa";
  $("#formatSelection").textContent = selectedFormat
    ? `${selectedFormat.name} · ${selectedFormat.count.toLocaleString("es-ES")} valores · ${selectedFormat.mapped.toLocaleString("es-ES")} elementos en el mapa`
    : formatMapOpen ? "Todos los elementos de la consulta." : "Selecciona un formato para mostrarlo en el mapa.";
};
const selectFormat = (id) => {
  const alreadySelected = selectedFormat?.id === id;
  selectedFormat = alreadySelected ? null : formatsById.get(id) || null;
  formatMapOpen = alreadySelected || Boolean(selectedFormat);
  formatLayer.updateStyleVariables({ selectedFormat: alreadySelected ? 0 : selectedFormat?.id ?? -1 });
  updateFormatSelection();
  mapLayout();
};
const renderFormats = (datos, area, tag) => {
  const groups = new Map(),
    allFeatures = [];
  let elements = 0, values = 0, multi = 0;
  formatItemsById = new Map();
  datos.forEach((item) => {
    const valuesRaw = item.raw.split(";").map((n) => n.trim()).filter(Boolean);
    if (!valuesRaw.length) return;
    elements++;
    values += valuesRaw.length;
    if (valuesRaw.length > 1) multi++;
    const distinct = new Set();
    valuesRaw.forEach((value) => {
      const name = value.replace(/\d/g, "#");
      let group = groups.get(name);
      if (!group) {
        group = { id: groups.size + 1, name, count: 0, mapped: 0, extent: null };
        groups.set(name, group);
      }
      group.count++;
      distinct.add(group);
    });
    if (!Number.isFinite(item.lon) || !Number.isFinite(item.lat)) return;
    const uid = osmKey(item),
      coordinate = ol.proj.fromLonLat([item.lon, item.lat]);
    formatItemsById.set(uid, item);
    distinct.forEach((group) => {
      group.mapped++;
      if (!group.extent) group.extent = [coordinate[0], coordinate[1], coordinate[0], coordinate[1]];
      else {
        group.extent[0] = Math.min(group.extent[0], coordinate[0]);
        group.extent[1] = Math.min(group.extent[1], coordinate[1]);
        group.extent[2] = Math.max(group.extent[2], coordinate[0]);
        group.extent[3] = Math.max(group.extent[3], coordinate[1]);
      }
      allFeatures.push(new ol.Feature({ geometry: new ol.geom.Point(coordinate), uid, formatId: group.id }));
    });
  });
  formatPointsSource.clear(true);
  formatPointsSource.addFeatures(allFeatures);
  formatsById = new Map([...groups.values()].map((group) => [group.id, group]));
  const ranking = [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    top = ranking[0]?.count || 1;
  $("#formatArea").textContent = `${area} · ${tag}`;
  $("#formatElements").textContent = `Elementos: ${elements.toLocaleString("es-ES")}`;
  $("#formatValues").textContent = `Valores: ${values.toLocaleString("es-ES")}`;
  $("#formatMulti").textContent = `Multi: ${multi.toLocaleString("es-ES")}`;
  $("#formatCount").textContent = `Formatos: ${ranking.length.toLocaleString("es-ES")}`;
  $("#formatRows").innerHTML = ranking.length
    ? ranking.map((g) => `<button class="format-row" type="button" data-format-id="${g.id}" aria-pressed="false" title="Mostrar en mapa"><span class="format-visual" style="--pct:${(100 * g.count / top).toFixed(2)}%">${esc(g.name)}</span><span>${g.count.toLocaleString("es-ES")}</span><span>${(100 * g.count / values).toLocaleString("es-ES", { maximumFractionDigits: 2 })}%</span></button>`).join("")
    : '<p class="format-empty">No hay valores para esta etiqueta y región.</p>';
  $("#formatRows").scrollTop = 0;
  selectedFormat = null;
  formatMapOpen = false;
  formatLayer.updateStyleVariables({ selectedFormat: -1 });
  updateFormatSelection();
  mapLayout();
};
$("#tabValidation").onclick = () => showView("validation");
$("#tabFormats").onclick = () => showView("formats");
$("#formatRows").onclick = (e) => {
  const row = e.target.closest("button.format-row");
  if (row) selectFormat(Number(row.dataset.formatId));
};
$("#formatExpand").onclick = () => {
  if (!selectedFormat && !formatMapOpen) return;
  formatMapOpen = !formatMapOpen;
  updateFormatSelection();
  mapLayout();
};
$("#ovx").onclick = ovClose;
ovB.onclick = ovClose;
$("#testInput").oninput = actualizarTester;
$("#tag").onchange = actualizarTester;
$("#customKey").oninput = actualizarTester;
$("#customExpect").onchange = actualizarTester;
$("#modeToggle").onclick = () => {
  modoPersonalizado = !modoPersonalizado;
  syncMode();
  actualizarTester();
};
$("#analyze").onclick = async () => {
  const tag = tagActivo(),
    zona = +$("#region").value;
  if (!zona || !tag) return alert("Selecciona región y tag");
  ovReset();
  ovSet("Analizando");
  ovOpen();
  try {
    const isPostpass = $("#server").value === "postpass",
      overpassTag = JSON.stringify(tag).slice(1, -1),
      q = isPostpass
        ? buildPostpassQ(zona, tag)
        : `[out:json][timeout:125][maxsize:64Mi];rel(${zona});map_to_area->.a;nwr["${overpassTag}"](area.a);out tags center;`;
    ovAdd(`Motor: ${$("#server").selectedOptions[0].textContent.trim()}`);
    ovAdd(`Consultando ${isPostpass ? "Postpass" : "Overpass"}…`);
    const r = await fetch(server(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "data=" + encodeURIComponent(q)
    });
    if (!r.ok) {
      const message = (await r.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
      throw Error(`HTTP ${r.status}${message ? ": " + message : ""}`);
    }
    ovAdd("Procesando respuesta…");
    const j = await r.json(),
      datos = normalizeElements(j, isPostpass).map((e) => {
        const raw = (e.tags?.[tag] || "").trim(),
          nums = raw
            .split(";")
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n) => ({
              n,
              errs: validarNumero(n, tag)
            })),
          dups = dupPhones(e.tags || {}),
          dt = dupTxt(dups);
        return {
          id: e.id,
          type: e.type,
          lat: e.center?.lat ?? e.lat,
          lon: e.center?.lon ?? e.lon,
          raw,
          listRaw: dt || raw,
          nums,
          dups,
          tags: e.tags || {}
        };
      }),
      t = datos.reduce((a, c) => a + c.nums.length, 0),
      v = datos.reduce(
        (a, c) =>
          a +
          (!c.dups.length ? c.nums.filter((n) => !n.errs.length).length : 0),
        0
      ),
      bad = datos.filter(
        (x) => x.dups.length || x.nums.some((n) => n.errs.length)
      ),
      good = datos.filter(
        (x) =>
          x.nums.length && !x.dups.length && x.nums.every((n) => !n.errs.length)
      ),
      gruposBad = Object.values(
        bad.reduce((a, x) => {
          let k = x.dups.length
            ? "Número duplicado"
            : x.nums
                .map((n) => n.errs.join("; "))
                .filter(Boolean)
                .join("; ")
                .replace(/Caracter no permitido.*/, "Caracter no permitido") ||
              "Desconocido";
          (a[k] ||= {
            tipo: k,
            items: []
          }).items.push(x);
          return a;
        }, {})
      ).sort((a, b) =>
        a.tipo === "Número duplicado"
          ? -1
          : b.tipo === "Número duplicado"
          ? 1
          : a.tipo.localeCompare(b.tipo)
      );
    const areaName = $("#region").selectedOptions[0]?.textContent || String(zona);
    lastRun = {
      gruposBad,
      bad,
      good,
      t,
      v,
      tag
    };
    soloValidos = 0;
    renderFromCache();
    if (activeView === "formats") validationCamera = null;
    renderFormats(datos, areaName, tag);
    ovSet("Procesamiento completado");
    ovAdd("✅ Todo OK", "ok");
    setTimeout(ovClose, 1200);
  } catch (e) {
    ovAdd("Error: " + e.message, "err");
    ovErr();
  }
};
syncMode();
actualizarTester();
renderStats(0, 0, 0);
