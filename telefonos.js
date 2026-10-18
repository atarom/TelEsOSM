import { EXCEPCIONES_DUPLICADOS, REGLAS_ES, TIPOS_ESPECIALES, NUMEROS_CORTOS_ES } from "./config.js";
const uniq = (a) => [...new Set(a.filter(Boolean))];
const isUrl = (s) =>
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
        : REGLAS_ES.prefijo + t
      : t;
    const p = libphonenumber.parsePhoneNumber(t, "ES");
    return p?.isValid() && p.country === "ES" ? p : null;
  } catch {
    return null;
  }
};
const tipoPhoneES = (n) => NUMEROS_CORTOS_ES.has(n.trim()) ? "SHORT_CODE" : parseES(n)?.getType();
const toE164IfES = (s) => parseES(s)?.format("E.164") || null;
const cleanNum = (s) => {
  let t =
      String(s || "")
        .trim()
        .match(/^(.*\S)\s+x\d+$/i)?.[1] || String(s || "").trim(),
    w = wNum(t);
  if (w) {
    const p = parseES(w);
    return p
      ? TIPOS_ESPECIALES.has(p.getType())
        ? p.nationalNumber
        : p.format("E.164")
      : w;
  }
  if (isUrl(t)) return t;
  t = t.replace(REGLAS_ES.noValidoG, "").replace(/[()\-\s]/g, "");
  const p = parseES(t);
  return p
    ? TIPOS_ESPECIALES.has(p.getType())
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
        EXCEPCIONES_DUPLICADOS.some((ex) => ks.every((k) => uniq(ex.map(String)).includes(k)))
      );
    })
    .map(([norm, vals]) => ({ norm, vals }));
};
const dupTxt = (d) =>
  d
    .map(
      (x) =>
        x.norm + " = " + x.vals.map((v) => v.tag + ": " + v.raw).join(" = ")
    )
    .join(" ; ");
const testVal = (x) =>
  x.dups?.length
    ? x.dups.map((d) => d.norm).join(";")
    : (x.raw || "")
        .split(";")
        .map(cleanNum)
        .filter((n) => !isUrl(n))
        .join(";");
const validarNumero = (n, tag, ctx = "osm", expectedType = "any") => {
  let e = [],
    s = n.trim(),
    wn = wNum(s),
    m = s.match(/^(.*\S)\s+x(\d+)$/i),
    base = wn ? toE164IfES(wn) || wn : m ? m[1] : s;
  if (ctx === "osm" && m && !wn) return ["Extensión"];
  const b = base.trim(),
    parsed = parseES(b),
    specialType =
      parsed && TIPOS_ESPECIALES.has(parsed.getType()) ? parsed.getType() : null;
  REGLAS_ES.noValido.test(b) && e.push("Caracter no permitido");
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
      ? e.push("Sin prefijo internacional (" + REGLAS_ES.prefijo + ")")
      : b.startsWith(REGLAS_ES.prefijo) || e.push("No ES");
  } else if (b.startsWith("+") && !b.startsWith(REGLAS_ES.prefijo)) {
    e.push("No ES");
  }
  if (
    !hasDigit ||
    e.includes("Más de un '+'") ||
    e.includes("'+' en posición inválida")
  )
    return uniq(e.length ? e : ["No válido"]);
  if (tag === "phone:ES" && NUMEROS_CORTOS_ES.has(b)) return uniq(e);
  try {
    const p = libphonenumber.parsePhoneNumber(b, "ES");
    if (!p.isPossible()) e.push("Número imposible");
    else if (!p.isValid()) e.push("Formato inválido");
    else if (p.country !== "ES") e.push("No ES");
    else {
      const exp = expectedType,
        y = p.getType();
      exp !== "any" &&
        (exp === "fixed" && y === "MOBILE" && e.push("Móvil en " + tag),
        exp === "mobile" &&
          (y === "FIXED_LINE" || y === "FIXED_LINE_OR_MOBILE") &&
          e.push("Fijo en " + tag));
      if (tag === "phone:ES") {
        TIPOS_ESPECIALES.has(y) || e.push("No es número especial");
      } else {
        TIPOS_ESPECIALES.has(y) && e.push("phone:ES · " + y);
      }
    }
  } catch {
    e.push("No válido");
  }
  return ctx === "test" && m && !e.length ? [] : uniq(e);
};
export { uniq, tipoPhoneES, dupPhones, dupTxt, testVal, validarNumero };
