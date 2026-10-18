const $ = (s) => document.querySelector(s),
  A = (t, h) => {
    const e = document.createElement(t);
    h && (e.innerHTML = h);
    return e;
  },
  Z = {
    Andalucía: 349044,
    Aragón: 349045,
    Asturias: 349033,
    "Islas Baleares": 348981,
    Canarias: 349048,
    Cantabria: 349013,
    "Castilla-La Mancha": 349052,
    "Castilla y León": 349041,
    Cataluña: 349053,
    Extremadura: 349050,
    Galicia: 349036,
    Madrid: 349055,
    Murcia: 349047,
    Navarra: 349027,
    "La Rioja": 348991,
    "País Vasco": 349042,
    "Comunidad Valenciana": 349043,
    Ceuta: 1154756,
    Melilla: 1154757,
    España: 1311341
  },
  T = [
    ["phone", "fixed"],
    ["phone:ES", "special"],
    ["contact:phone", "fixed"],
    ["mobile", "mobile"],
    ["contact:mobile", "mobile"],
    ["phone:mobile", "mobile"],
    ["emergency:phone", "any"],
    ["fax", "fixed"],
    ["contact:fax", "fixed"],
    ["whatsapp", "any"],
    ["contact:whatsapp", "any"]
  ],
  EXC = [
    ["mobile", "contact:whatsapp"],
    ["mobile", "emergency:phone"],
    ["phone", "emergency:phone"],
    ["phone:mobile", "contact:whatsapp"],
    ["phone", "contact:fax"],
    ["phone", "fax"],
    ["contact:mobile", "contact:whatsapp"],
    ["contact:phone", "contact:whatsapp"],
    ["phone", "contact:whatsapp"],
    ["contact:phone", "contact:fax"],
    ["contact:phone", "fax"]
  ],
  SERV = {
    postpass: "https://postpass.geofabrik.de/api/interpreter",
    de: "https://overpass-api.de/api/interpreter",
    ru: "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  },
  ROW_WARN = 5e4;
Object.entries(Z).forEach(([k, v]) => {
  const o = A("option", k);
  o.value = v;
  $("#region").append(o);
});
T.forEach(([k, x]) => {
  const o = A("option", k);
  o.dataset.expect = x;
  $("#tag").append(o);
});
let modoPersonalizado = 0,
  soloValidos = 0,
  lastRun = null,
  itemsById = new Map(),
  popupById = new Map(),
  openGroups = new Set();
const conf = {
    prefijo: "+34",
    noValido: /[^0-9+ ;]|[\u00A0\u2000-\u200B\u202F\u205F\u3000\t\r\n]/,
    noValidoG: /[^0-9+ ;]|[\u00A0\u2000-\u200B\u202F\u205F\u3000\t\r\n]/g
  },
  special = new Set([
    "VOIP",
    "TOLL_FREE",
    "PREMIUM_RATE",
    "SHARED_COST",
    "PAGER",
    "UAN",
    "PERSONAL_NUMBER",
    "VOICEMAIL"
  ]),
  uniq = (a) => [...new Set(a.filter(Boolean))],
  osmKey = (x) => x.type + "/" + x.id,
  sid = (x) => ({ node: "n", way: "w", relation: "r" }[x.type] + x.id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    ),
  tagActivo = () =>
    modoPersonalizado ? $("#customKey").value.trim() : $("#tag").value,
  server = () => SERV[$("#server").value] || SERV.postpass,
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
    ),
  isUrl = (s) =>
    /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}\//i.test(String(s || "").trim());
const wNum = (s) => {
  let u = String(s || "").trim(),
    m;
  try {
    const x = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u),
      h = x.hostname.replace(/^www\./, "").toLowerCase(),
      p = x.pathname;
    if (/(^|\.)wa\.me$/.test(h) && (m = p.match(/^\/(\d{8,15})(?:\/|$)/)))
      return m[1];
    if (/(^|\.)whatsapp\.com$/.test(h) || /(^|\.)api\.whatsapp\.com$/.test(h)) {
      if ((m = x.searchParams.get("phone"))) return m;
      if ((m = p.match(/^\/catalog\/(\d{8,15})(?:\/|$)/))) return m[1];
    }
  } catch {}
  return null;
};
const parseES = (s) => {
    try {
      let t = String(s || "")
        .trim()
        .replace(/[()\-\s]/g, "");
      if (!t) return null;
      t = wNum(t) || t;
      t = !t.startsWith("+")
        ? t.startsWith("0034")
          ? "+" + t.slice(2)
          : t.startsWith("34")
          ? "+" + t
          : conf.prefijo + t
        : t;
      const p = libphonenumber.parsePhoneNumber(t, "ES");
      return p?.isValid() && p.country === "ES" ? p : null;
    } catch {
      return null;
    }
  },
  phoneESShort = new Set(["010", "061"]),
  tipoPhoneES = (n) => phoneESShort.has(n.trim()) ? "SHORT_CODE" : parseES(n)?.getType(),
  toE164IfES = (s) => parseES(s)?.format("E.164") || null,
  cleanNum = (s) => {
    let t =
        String(s || "")
          .trim()
          .match(/^(.*\S)\s+x\d+$/i)?.[1] || String(s || "").trim(),
      w = wNum(t);
    if (w) {
      const p = parseES(w);
      return p
        ? special.has(p.getType())
          ? p.nationalNumber
          : p.format("E.164")
        : w;
    }
    if (isUrl(t)) return t;
    t = t.replace(conf.noValidoG, "").replace(/[()\-\s]/g, "");
    const p = parseES(t);
    return p
      ? special.has(p.getType())
        ? p.nationalNumber
        : p.format("E.164")
      : t;
  };
const dupPhones = (tags = {}) => {
    const seen = {};
    Object.entries(tags).forEach(([k, v]) =>
      String(v || "")
        .split(";")
        .map((n) => n.trim())
        .filter(Boolean)
        .forEach((raw) => {
          const nk = toE164IfES(raw);
          nk && (seen[nk] ||= []).push({ tag: k, raw });
        })
    );
    return Object.entries(seen)
      .filter(([, vals]) => {
        if (vals.length < 2) return 0;
        const ks = uniq(vals.map((v) => v.tag));
        return !(
          ks.length > 1 &&
          EXC.some((ex) => ks.every((k) => uniq(ex.map(String)).includes(k)))
        );
      })
      .map(([norm, vals]) => ({ norm, vals }));
  },
  dupTxt = (d) =>
    d
      .map(
        (x) =>
          x.norm + " = " + x.vals.map((v) => v.tag + ": " + v.raw).join(" = ")
      )
      .join(" ; "),
  testVal = (x) =>
    x.dups?.length
      ? x.dups.map((d) => d.norm).join(";")
      : (x.raw || "")
          .split(";")
          .map(cleanNum)
          .filter((n) => !isUrl(n))
          .join(";");
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
  let e = [],
    s = n.trim(),
    wn = wNum(s),
    m = s.match(/^(.*\S)\s+x(\d+)$/i),
    base = wn ? toE164IfES(wn) || wn : m ? m[1] : s;
  if (ctx === "osm" && m && !wn) return ["Extensión"];
  const b = base.trim(),
    parsed = parseES(b),
    specialType =
      parsed && special.has(parsed.getType()) ? parsed.getType() : null;
  conf.noValido.test(b) && e.push("Caracter no permitido");
  const plus = (b.match(/\+/g) || []).length,
    onlyPlus = /^\++$/.test(b.replace(/[ ;]/g, "")),
    hasDigit = /\d/.test(b);
  !hasDigit &&
    e.push(
      onlyPlus
        ? b.replace(/[ ;]/g, "").length === 1
          ? "Solo '+'"
          : "Solo '+' repetidos"
        : "Sin dígitos"
    );
  plus > 1 && e.push("Más de un '+'");
  plus === 1 && !b.startsWith("+") && e.push("'+' en posición inválida");
  if (!specialType && tag !== "phone:ES") {
    !b.startsWith("+")
      ? e.push("Sin prefijo internacional (" + conf.prefijo + ")")
      : b.startsWith(conf.prefijo) || e.push("No ES");
  } else if (b.startsWith("+") && !b.startsWith(conf.prefijo)) {
    e.push("No ES");
  }
  if (
    !hasDigit ||
    e.includes("Más de un '+'") ||
    e.includes("'+' en posición inválida")
  )
    return uniq(e.length ? e : ["No válido"]);
  if (tag === "phone:ES" && phoneESShort.has(b)) return uniq(e);
  try {
    const p = libphonenumber.parsePhoneNumber(b, "ES");
    if (!p.isPossible()) e.push("Número imposible");
    else if (!p.isValid()) e.push("Formato inválido");
    else if (p.country !== "ES") e.push("No ES");
    else {
      const exp = modoPersonalizado
          ? $("#customExpect").value
          : [...$("#tag").options].find((o) => o.textContent === tag)?.dataset
              .expect || "any",
        y = p.getType();
      exp !== "any" &&
        (exp === "fixed" && y === "MOBILE" && e.push("Móvil en " + tag),
        exp === "mobile" &&
          (y === "FIXED_LINE" || y === "FIXED_LINE_OR_MOBILE") &&
          e.push("Fijo en " + tag));
      if (tag === "phone:ES") {
        special.has(y) || e.push("No es número especial");
      } else {
        special.has(y) && e.push("phone:ES · " + y);
      }
    }
  } catch {
    e.push("No válido");
  }
  return ctx === "test" && m && !e.length ? [] : uniq(e);
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
const pointsSource = new ol.source.Vector({ wrapX: false }),
  pointsStyle = {
    "circle-radius": 6,
    "circle-fill-color": ["case", ["==", ["get", "ok"], 1], "#78d5a4", "#ef8491"],
    "circle-stroke-color": "#ffffff",
    "circle-stroke-width": 1.5
  },
  pointsLayer = new ol.layer.WebGLVector({
    source: pointsSource,
    style: [{ filter: ["==", ["get", "g"], "__none__"], style: pointsStyle }]
  }),
  base = new ol.layer.Tile({
    className: "dark-base-layer",
    source: new ol.source.OSM()
  }),
  map = new ol.Map({
    target: "map",
    layers: [base, pointsLayer],
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
    pointsSource.clear(true);
    pointsSource.addFeatures(
      new ol.format.GeoJSON().readFeatures(d, { featureProjection: "EPSG:3857" })
    );
  },
  visibility = () => {
    const filter = openGroups.size
      ? ["in", ["get", "g"], ["literal", [...openGroups]]]
      : ["==", ["get", "g"], "__none__"];
    pointsLayer.setStyle([{ filter, style: pointsStyle }]);
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
    visibility();
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
    items.length <= ROW_WARN ||
    confirm(
      `Hay ${items.length} filas para generar. Más de ${ROW_WARN.toLocaleString(
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
  visibility();
  hidePopup();
  if (features.length) {
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
  SERV[s] && ($("#server").value = s);
} catch {}
$("#server").onchange = updateServer;
updateServer();
map.on("singleclick", (e) => {
  pointsLayer.getFeatures(e.pixel).then((features) => {
    const f = features[0],
      x = f && openGroups.has(f.get("g")) && itemsById.get(f.get("uid"));
    if (x) showPopup(x);
  });
});
map.on("pointermove", (e) => {
  if (e.dragging) return;
  pointsLayer.getFeatures(e.pixel).then((features) => {
    const f = features[0];
    map.getTargetElement().style.cursor = f && openGroups.has(f.get("g")) ? "pointer" : "";
  });
});
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
