export const REGIONES = {
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
};
export const ETIQUETAS = [
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
];
export const EXCEPCIONES_DUPLICADOS = [
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
];
export const SERVIDORES = {
  postpass: "https://postpass.geofabrik.de/api/interpreter",
  de: "https://overpass-api.de/api/interpreter",
  ru: "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
};
export const LIMITE_FILAS = 5e4;
export const REGLAS_ES = {
  prefijo: "+34",
  noValido: /[^0-9+ ;]|[\u00A0\u2000-\u200B\u202F\u205F\u3000\t\r\n]/,
  noValidoG: /[^0-9+ ;]|[\u00A0\u2000-\u200B\u202F\u205F\u3000\t\r\n]/g
};
export const TIPOS_ESPECIALES = new Set([
  "VOIP",
  "TOLL_FREE",
  "PREMIUM_RATE",
  "SHARED_COST",
  "PAGER",
  "UAN",
  "PERSONAL_NUMBER",
  "VOICEMAIL"
]);
export const NUMEROS_CORTOS_ES = new Set(["010", "061"]);
