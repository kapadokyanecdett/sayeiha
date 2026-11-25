'use strict';

/**
 * E-posta gonderimi (nodemailer).
 * SMTP bilgileri .env dosyasindan okunur. Bilgiler tanimli degilse
 * "test modu" devreye girer: kod sunucu konsoluna yazilir ve API
 * yanitinda devCode alani ile donulur (gercek e-posta gonderilmez).
 */

const nodemailer = require('nodemailer');

const HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE = String(process.env.SMTP_SECURE || (PORT === 465)).toLowerCase() !== 'false';
const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const FROM = process.env.SMTP_FROM || (USER ? `SAYE <${USER}>` : '');
const BRAND = process.env.SITE_NAME || 'SAYE';

/** SMTP bilgileri tanimli mi? */
const mailEnabled = Boolean(USER && PASS);

let transport = null;
if (mailEnabled) {
  transport = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE,
    auth: { user: USER, pass: PASS },
  });
}

/** Dogrulama e-postasinin HTML govdesi. */
function verificationHtml(code) {
  return `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:24px;background:#0b0e13;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#141922;border:1px solid #242d3a;border-radius:8px;overflow:hidden">
    <div style="padding:20px 28px;border-bottom:1px solid #242d3a;background:linear-gradient(90deg,rgba(217,43,60,.16),transparent 60%)">
      <span style="color:#e2e9f1;font-size:18px;font-weight:700;letter-spacing:.06em">${BRAND}</span>
    </div>
    <div style="padding:28px">
      <h1 style="margin:0 0 12px;color:#e2e9f1;font-size:20px">E-posta Dogrulama</h1>
      <p style="margin:0 0 20px;color:#9dabbb;font-size:14px;line-height:1.7">
        Hesabini olusturmak icin asagidaki 6 haneli kodu kullan. Kod 10 dakika gecerlidir.
      </p>
      <div style="text-align:center;margin:0 0 20px">
        <span style="display:inline-block;padding:14px 26px;background:#1b222c;border:1px solid #242d3a;border-radius:6px;color:#fff;font-size:30px;font-weight:700;letter-spacing:.35em">${code}</span>
      </div>
      <p style="margin:0;color:#6f7d8d;font-size:12px;line-height:1.7">
        Bu kodu sen istemediysen bu e-postayi yok sayabilirsin.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Dogrulama kodunu e-posta ile gonderir.
 * @returns {Promise<{sent: boolean, test?: boolean}>}
 */
async function sendVerificationCode(to, code) {
  if (!mailEnabled) {
    console.log(`[mail-test-modu] ${to} adresi icin dogrulama kodu: ${code}`);
    return { sent: false, test: true };
  }
  await transport.sendMail({
    from: FROM,
    to,
    subject: `${BRAND} - E-posta Dogrulama Kodunuz`,
    text: `Dogrulama kodunuz: ${code}\nKod 10 dakika gecerlidir.`,
    html: verificationHtml(code),
  });
  return { sent: true };
}

/**
 * Sifre sifirlama e-postasinin HTML govdesi.
 */
function passwordResetHtml(code) {
  return `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:24px;background:#0b0e13;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#141922;border:1px solid #242d3a;border-radius:8px;overflow:hidden">
    <div style="padding:20px 28px;border-bottom:1px solid #242d3a;background:linear-gradient(90deg,rgba(217,43,60,.16),transparent 60%)">
      <span style="color:#e2e9f1;font-size:18px;font-weight:700;letter-spacing:.06em">${BRAND}</span>
    </div>
    <div style="padding:28px">
      <h1 style="margin:0 0 12px;color:#e2e9f1;font-size:20px">Şifre Sıfırlama</h1>
      <p style="margin:0 0 20px;color:#9dabbb;font-size:14px;line-height:1.7">
        Şifreni sıfırlamak için aşağıdaki 6 haneli kodu kullan. Kod 10 dakika geçerlidir.
      </p>
      <div style="text-align:center;margin:0 0 20px">
        <span style="display:inline-block;padding:14px 26px;background:#1b222c;border:1px solid #242d3a;border-radius:6px;color:#fff;font-size:30px;font-weight:700;letter-spacing:.35em">${code}</span>
      </div>
      <p style="margin:0;color:#6f7d8d;font-size:12px;line-height:1.7">
        Bu kodu sen istemediysen bu e-postayı yok sayabilirsin; şifren değişmez.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sifre sifirlama kodunu e-posta ile gonderir.
 * @returns {Promise<{sent: boolean, test?: boolean}>}
 */
async function sendPasswordReset(to, code) {
  if (!mailEnabled) {
    console.log(`[mail-test-modu] ${to} adresi icin sifre sifirlama kodu: ${code}`);
    return { sent: false, test: true };
  }
  await transport.sendMail({
    from: FROM,
    to,
    subject: `${BRAND} - Şifre Sıfırlama Kodunuz`,
    text: `Sifre sifirlama kodunuz: ${code}\nKod 10 dakika gecerlidir.`,
    html: passwordResetHtml(code),
  });
  return { sent: true };
}

/** Bulten e-postasinin HTML govdesi. */
function newsletterHtml(subject, message) {
  const paragraphs = String(message || '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;color:#9dabbb;font-size:14px;line-height:1.75">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:24px;background:#0b0e13;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#141922;border:1px solid #242d3a;border-radius:8px;overflow:hidden">
    <div style="padding:20px 28px;border-bottom:1px solid #242d3a;background:linear-gradient(90deg,rgba(217,43,60,.16),transparent 60%)">
      <span style="color:#e2e9f1;font-size:18px;font-weight:700;letter-spacing:.06em">${BRAND}</span>
    </div>
    <div style="padding:28px">
      <h1 style="margin:0 0 16px;color:#e2e9f1;font-size:20px">${escapeHtml(subject)}</h1>
      ${paragraphs}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #242d3a;color:#6f7d8d;font-size:11px">
      Bu e-postayı ${BRAND} bültenine abone olduğunuz için aldınız.
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Genel amacli e-posta gonderimi (bulten vb.).
 * SMTP tanimli degilse test modunda konsola yazar.
 * @returns {Promise<{sent: boolean, test?: boolean}>}
 */
async function sendMail(to, subject, text, html) {
  if (!mailEnabled) {
    console.log(`[mail-test-modu] ${to} adresine "${subject}" konulu e-posta gonderilecekti.`);
    return { sent: false, test: true };
  }
  await transport.sendMail({ from: FROM, to, subject, text, html });
  return { sent: true };
}

module.exports = { sendVerificationCode, sendPasswordReset, sendMail, newsletterHtml, mailEnabled };
