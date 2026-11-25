'use strict';

const { all, get } = require('./db');

const TR_MAP = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o',
  ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', î: 'i', û: 'u',
};

/** Turkce karakterleri sadelestirip URL uyumlu slug uretir. */
function slugify(text) {
  const base = String(text || '')
    .split('')
    .map((ch) => (TR_MAP[ch] !== undefined ? TR_MAP[ch] : ch))
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'kayit';
}

/** Verilen tabloda benzersiz bir slug uretir (cakismada -2, -3 ... ekler). */
function uniqueSlug(table, base, excludeId = -1) {
  let slug = slugify(base);
  let n = 2;
  while (get(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`, slug, excludeId)) {
    slug = `${slugify(base)}-${n++}`;
  }
  return slug;
}

/** JSON govdesindeki boolean'lari SQLite icin 1/0'a cevirir. */
function normalizeValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  return v;
}

/** Basit e-posta dogrulama. */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** E-posta adresini kirp ve kucuk harfe cevir (karsilastirma icin). */
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Zorunlu alan kontrolu. Eksik alan adlarini dondurur. */
function missingFields(body, required) {
  return required.filter((f) => {
    const v = body?.[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

module.exports = { slugify, uniqueSlug, normalizeValue, isValidEmail, normalizeEmail, missingFields };
