// ============================================================
// HATİM TAKİP — Uygulama Mantığı
// ============================================================
// - Firebase Firestore ile gerçek zamanlı veri paylaşımı
// - Hicri ve Miladi tarih gösterimi
// - Cüz / Sayfa seçimi (30 cüz, 604 sayfa)
// - Excel (XLSX) dışa aktarma — SheetJS
// ============================================================

// --- Firebase Modular SDK v10 ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Kullanıcının firebase-config.js dosyasında doldurduğu ayarları içe aktar
import { firebaseConfig } from './firebase-config.js';

// ============================================================
// 1) CÜZ / SAYFA HARİTASI — Medine Mushafı (604 sayfa)
// ============================================================
// Her cüz 20 sayfa, son cüz 23 sayfa.
const TOTAL_PAGES = 604;
const JUZ_RANGES = [];
for (let i = 1; i <= 30; i++) {
    const start = (i - 1) * 20 + 1;
    const end = i === 30 ? 604 : i * 20;
    JUZ_RANGES.push({ juz: i, start, end });
}

// ============================================================
// 2) FIREBASE BAŞLATMA (güvenli)
// ============================================================
let db = null;
let firebaseReady = false;

function isConfigValid(cfg) {
    if (!cfg) return false;
    const required = ['apiKey', 'authDomain', 'projectId'];
    return required.every(k => cfg[k] && !String(cfg[k]).includes('BURAYA'));
}

if (isConfigValid(firebaseConfig)) {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        firebaseReady = true;
    } catch (err) {
        console.error('Firebase başlatma hatası:', err);
        showSetupBanner(`Firebase başlatma hatası: ${err.message}`);
    }
} else {
    showSetupBanner(
        'Firebase ayarları henüz yapılmamış. <code>firebase-config.js</code> dosyasını düzenleyip ' +
        '<strong>README.md</strong>\'deki adımları izleyin. Site şu an SADECE tarayıcı hafızasında (localStorage) çalışıyor ' +
        've kullanıcılar arasında veri PAYLAŞILMAZ.'
    );
}

function showSetupBanner(html) {
    const banner = document.createElement('div');
    banner.className = 'setup-banner';
    banner.innerHTML = `⚠ <strong>Kurulum gerekli:</strong> ${html}`;
    document.body.insertBefore(banner, document.querySelector('main'));
}

// ============================================================
// 3) LOCAL FALLBACK — Firebase yoksa localStorage kullan
// ============================================================
const LS_KEY = 'hatim-takip-kayitlar';
function lsGet() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
}
function lsSet(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

// ============================================================
// 4) TARİH — Miladi + Hicri + Saat
// ============================================================
function formatGregorian(date) {
    return date.toLocaleDateString('tr-TR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

// Hicri ay adları (Türkçe)
const HIJRI_MONTHS_TR = [
    'Muharrem', 'Safer', 'Rebiyülevvel', 'Rebiyülahir',
    'Cemaziyülevvel', 'Cemaziyülahir', 'Recep', 'Şaban',
    'Ramazan', 'Şevval', 'Zilkade', 'Zilhicce'
];

// Gregoryen → Hicri dönüşümü (Kuveyt algoritması — tüm cihazlarda eşdeğer çalışır)
// Referans: Fliegel & Van Flandern, Fourmilab Hijri takvimi
function gregorianToHijri(gDate) {
    const day = gDate.getDate();
    const month = gDate.getMonth() + 1;
    const year = gDate.getFullYear();

    let jd;
    if ((year > 1582) || (year === 1582 && month > 10) ||
        (year === 1582 && month === 10 && day > 14)) {
        jd = Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
             Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
             Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
             day - 32075;
    } else {
        jd = 367 * year - Math.floor((7 * (year + 5001 + Math.floor((month - 9) / 7))) / 4) +
             Math.floor((275 * month) / 9) + day + 1729777;
    }

    const l = jd - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    const l2 = l - 10631 * n + 354;
    const j = (Math.floor((10985 - l2) / 5316)) * (Math.floor((50 * l2) / 17719)) +
              (Math.floor(l2 / 5670)) * (Math.floor((43 * l2) / 15238));
    const l3 = l2 - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) -
               (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
    const hMonth = Math.floor((24 * l3) / 709);
    const hDay = l3 - Math.floor((709 * hMonth) / 24);
    const hYear = 30 * n + j - 30;

    return { day: hDay, month: hMonth, year: hYear };
}

// Miladi ay isimleri — Intl'in yanlışlıkla Gregoryen döndüğünü tespit etmek için
const GREGORIAN_MONTHS_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function isBadHijriResult(str) {
    if (!str) return true;
    // "MÖ", "M.Ö.", "BC" gibi ibareler veya Gregoryen ay isimleri varsa hatalı
    if (/M\.?Ö\.?|BC/i.test(str)) return true;
    const lower = str.toLowerCase();
    for (const m of GREGORIAN_MONTHS_TR) {
        if (lower.includes(m.toLowerCase())) return true;
    }
    return false;
}

function formatHijriManual(date) {
    const h = gregorianToHijri(date);
    const monthName = HIJRI_MONTHS_TR[h.month - 1] || '';
    const dayStr = String(h.day).padStart(2, '0');
    return `${dayStr} ${monthName} ${h.year}`;
}

function formatHijri(date) {
    // 1. Önce Intl dene (masaüstünde Umm al-Qura verir — en doğrusu)
    try {
        const fmt = new Intl.DateTimeFormat('tr-TR-u-ca-islamic-umalqura', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
        const result = fmt.format(date);
        if (!isBadHijriResult(result)) return result;
    } catch (_) { /* destek yok, devam */ }

    // 2. Alternatif: islamic (bazı tarayıcılarda)
    try {
        const fmt = new Intl.DateTimeFormat('tr-TR-u-ca-islamic', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
        const result = fmt.format(date);
        if (!isBadHijriResult(result)) return result;
    } catch (_) { /* devam */ }

    // 3. Son çare: manuel hesaplama — her cihazda çalışır
    try {
        return formatHijriManual(date);
    } catch {
        return '—';
    }
}

function formatClock(date) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateClock() {
    const now = new Date();
    document.getElementById('gregorianDate').textContent = formatGregorian(now);
    document.getElementById('hijriDate').textContent = formatHijri(now);
    document.getElementById('clock').textContent = formatClock(now);
}

// ============================================================
// 5) CÜZ / SAYFA SEÇİMİNİ DOLDUR
// ============================================================
function populateJuzSelect() {
    const sel = document.getElementById('juzSelect');
    JUZ_RANGES.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.juz;
        opt.textContent = `${r.juz}. Cüz (sayfa ${r.start}–${r.end})`;
        sel.appendChild(opt);
    });
}

function populatePageSelect(juzNum) {
    const sel = document.getElementById('pageSelect');
    sel.innerHTML = '';
    if (!juzNum) {
        sel.innerHTML = '<option value="">Önce cüz seçin</option>';
        return;
    }
    const range = JUZ_RANGES.find(r => r.juz === Number(juzNum));
    if (!range) return;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Sayfa seçin...';
    sel.appendChild(placeholder);
    for (let p = range.start; p <= range.end; p++) {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = `Sayfa ${p}`;
        sel.appendChild(opt);
    }
}

function pageToJuz(page) {
    const r = JUZ_RANGES.find(x => page >= x.start && page <= x.end);
    return r ? r.juz : null;
}

// ============================================================
// 6) KAYIT EKLEME
// ============================================================
async function addRecord({ name, juz, page }) {
    const now = new Date();
    const record = {
        name: name.trim(),
        juz: Number(juz),
        page: Number(page),
        gregorian: formatGregorian(now),
        hijri: formatHijri(now),
        time: formatClock(now),
        timestampMs: now.getTime(),
        createdAt: now.toISOString()
    };

    if (firebaseReady && db) {
        await addDoc(collection(db, 'hatim_kayitlar'), {
            ...record,
            serverCreatedAt: serverTimestamp()
        });
    } else {
        const arr = lsGet();
        record.id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        arr.unshift(record);
        lsSet(arr);
        render(arr);
    }
}

async function deleteRecord(id) {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    if (firebaseReady && db && !String(id).startsWith('local-')) {
        await deleteDoc(doc(db, 'hatim_kayitlar', id));
    } else {
        const arr = lsGet().filter(r => r.id !== id);
        lsSet(arr);
        render(arr);
    }
}

// ============================================================
// 7) GERÇEK ZAMANLI DİNLEME
// ============================================================
let currentRecords = [];

function listenRecords() {
    if (firebaseReady && db) {
        const q = query(collection(db, 'hatim_kayitlar'), orderBy('timestampMs', 'desc'));
        onSnapshot(q, (snap) => {
            currentRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            render(currentRecords);
        }, (err) => {
            console.error('Firestore dinleme hatası:', err);
            showSetupBanner(`Firestore erişim hatası: ${err.message}. Güvenlik kurallarını kontrol edin.`);
        });
    } else {
        currentRecords = lsGet();
        render(currentRecords);
    }
}

// ============================================================
// 8) ARAYÜZÜ GÜNCELLE
// ============================================================
function render(records) {
    currentRecords = records;
    renderHistory(applyFilters(records));
    renderProgress(records);
    renderJuzGrid(records);
}

function applyFilters(records) {
    const nameFilter = document.getElementById('filterName').value.trim().toLowerCase();
    const dateFilter = document.getElementById('filterDate').value; // yyyy-mm-dd
    return records.filter(r => {
        if (nameFilter && !r.name.toLowerCase().includes(nameFilter)) return false;
        if (dateFilter) {
            const d = new Date(r.timestampMs);
            const iso = d.toISOString().slice(0, 10);
            if (iso !== dateFilter) return false;
        }
        return true;
    });
}

function renderHistory(records) {
    const tbody = document.getElementById('historyBody');
    if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">Henüz kayıt yok.</td></tr>';
        return;
    }
    tbody.innerHTML = records.map(r => `
        <tr>
            <td>${escapeHtml(r.gregorian || '')}<br><small style="color:var(--muted)">${escapeHtml(r.time || '')}</small></td>
            <td><strong>${escapeHtml(r.name)}</strong></td>
            <td>${r.juz}. Cüz</td>
            <td>Sayfa ${r.page}</td>
            <td>${escapeHtml(r.hijri || '')}</td>
            <td><button class="btn-danger-sm" data-id="${r.id}">Sil</button></td>
        </tr>
    `).join('');
    tbody.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteRecord(btn.dataset.id));
    });
}

function renderProgress(records) {
    // Benzersiz okunan sayfa sayısı
    const uniquePages = new Set(records.map(r => r.page));
    const read = uniquePages.size;
    const percent = Math.round((read / TOTAL_PAGES) * 100);
    document.getElementById('progressBar').style.width = percent + '%';
    document.getElementById('progressText').textContent = `${read} / ${TOTAL_PAGES} sayfa okundu`;
    document.getElementById('progressPercent').textContent = '%' + percent;
}

function renderJuzGrid(records) {
    const grid = document.getElementById('juzGrid');
    const uniquePages = new Set(records.map(r => r.page));

    grid.innerHTML = JUZ_RANGES.map(r => {
        let count = 0;
        for (let p = r.start; p <= r.end; p++) if (uniquePages.has(p)) count++;
        const total = r.end - r.start + 1;
        const complete = count === total;
        const partial = count > 0 && !complete;
        const cls = complete ? 'complete' : (partial ? 'partial' : '');
        return `
            <div class="juz-cell ${cls}">
                <span class="num">${r.juz}. Cüz</span>
                <span class="count">${count} / ${total}</span>
            </div>
        `;
    }).join('');
}

// ============================================================
// 9) EXCEL DIŞA AKTARMA (SheetJS)
// ============================================================
function exportToExcel() {
    if (!currentRecords.length) {
        alert('İndirilecek kayıt yok.');
        return;
    }

    // Tarihe göre eski → yeni sırala (rapor için)
    const sorted = [...currentRecords].sort((a, b) => a.timestampMs - b.timestampMs);

    // 1. Sayfa — Tüm Kayıtlar
    const mainRows = sorted.map((r, i) => ({
        'Sıra': i + 1,
        'İsim': r.name,
        'Cüz': r.juz,
        'Sayfa': r.page,
        'Miladi Tarih': r.gregorian,
        'Saat': r.time,
        'Hicri Tarih': r.hijri
    }));

    // 2. Sayfa — Kişiye Göre Özet
    const byPerson = {};
    sorted.forEach(r => {
        if (!byPerson[r.name]) byPerson[r.name] = new Set();
        byPerson[r.name].add(r.page);
    });
    const personRows = Object.entries(byPerson).map(([name, pages]) => ({
        'İsim': name,
        'Okunan Sayfa Sayısı': pages.size,
        'Sayfalar': [...pages].sort((a, b) => a - b).join(', ')
    }));

    // 3. Sayfa — Cüze Göre Özet
    const juzRows = JUZ_RANGES.map(r => {
        const pages = new Set();
        const readers = new Set();
        sorted.forEach(rec => {
            if (rec.page >= r.start && rec.page <= r.end) {
                pages.add(rec.page);
                readers.add(rec.name);
            }
        });
        return {
            'Cüz': r.juz,
            'Sayfa Aralığı': `${r.start}–${r.end}`,
            'Okunan Sayfa': pages.size,
            'Toplam Sayfa': r.end - r.start + 1,
            'Okuyan Kişiler': [...readers].join(', ')
        };
    });

    // 4. Sayfa — Günlük Döküm (tarihe göre)
    const byDay = {};
    sorted.forEach(r => {
        const d = new Date(r.timestampMs).toISOString().slice(0, 10);
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push(r);
    });
    const dayRows = [];
    Object.keys(byDay).sort().forEach(d => {
        byDay[d].forEach(r => {
            dayRows.push({
                'Tarih (Miladi)': d,
                'Hicri': r.hijri,
                'Saat': r.time,
                'İsim': r.name,
                'Cüz': r.juz,
                'Sayfa': r.page
            });
        });
    });

    // Workbook oluştur
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainRows), 'Tüm Kayıtlar');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personRows), 'Kişi Bazlı');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(juzRows), 'Cüz Bazlı');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dayRows), 'Günlük Döküm');

    // Dosyayı indir
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `hatim-takip-${today}.xlsx`);
}

// ============================================================
// 10) YARDIMCI
// ============================================================
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function setMessage(text, type = '') {
    const el = document.getElementById('formMessage');
    el.textContent = text;
    el.className = 'form-message ' + type;
    if (text) setTimeout(() => { el.textContent = ''; el.className = 'form-message'; }, 4000);
}

// İsmi hatırla (aynı tarayıcıda tekrar girince otomatik gelsin)
const NAME_KEY = 'hatim-takip-son-isim';
function rememberName(name) { localStorage.setItem(NAME_KEY, name); }
function getRememberedName() { return localStorage.getItem(NAME_KEY) || ''; }

// ============================================================
// 11) OLAYLAR — DOM HAZIR
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Saat & tarih
    updateClock();
    setInterval(updateClock, 1000);

    // Cüz seçimi doldur
    populateJuzSelect();

    // İsim hatırlama
    const nameInput = document.getElementById('readerName');
    nameInput.value = getRememberedName();

    // Cüz değişince sayfa listesini doldur
    document.getElementById('juzSelect').addEventListener('change', (e) => {
        populatePageSelect(e.target.value);
    });

    // Kaydet butonu
    document.getElementById('submitBtn').addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const juz = document.getElementById('juzSelect').value;
        const page = document.getElementById('pageSelect').value;

        if (!name) return setMessage('Lütfen isminizi yazın.', 'error');
        if (!juz) return setMessage('Lütfen bir cüz seçin.', 'error');
        if (!page) return setMessage('Lütfen bir sayfa seçin.', 'error');

        const pageNum = Number(page);
        const juzForPage = pageToJuz(pageNum);
        if (juzForPage !== Number(juz)) {
            return setMessage('Seçtiğiniz sayfa bu cüze ait değil.', 'error');
        }

        try {
            await addRecord({ name, juz, page: pageNum });
            rememberName(name);
            setMessage(`✓ Kaydedildi: ${name} — ${juz}. cüz, sayfa ${page}`, 'success');
            // Sayfayı sıfırla (cüz aynı kalsın, pratik olsun)
            document.getElementById('pageSelect').value = '';
        } catch (err) {
            console.error(err);
            setMessage('Kayıt eklenemedi: ' + err.message, 'error');
        }
    });

    // Filtreler
    document.getElementById('filterName').addEventListener('input', () => render(currentRecords));
    document.getElementById('filterDate').addEventListener('change', () => render(currentRecords));
    document.getElementById('clearFilters').addEventListener('click', () => {
        document.getElementById('filterName').value = '';
        document.getElementById('filterDate').value = '';
        render(currentRecords);
    });

    // Excel indir
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);

    // Kayıtları dinle
    listenRecords();
});
