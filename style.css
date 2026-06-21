// ================================================================
// YÚN XIĀOSHUŌ – MAIN APPLICATION
// ================================================================
// Structure:
//   I.   CONFIGURATION
//   II.  DATA LAYER (universal)
//   III. UTILITY FUNCTIONS (universal)
//   IV.  VOLUME PARSER (universal)
//   V.   CSV PARSER & COVER MAPPING (universal)
//   VI.  GOOGLE API & DRIVE (universal)
//   VII. SYNC FUNCTIONS (universal)
//   VIII. SORT FUNCTIONS (universal)
//   IX.  RENDER – INDEX PAGE (index only)
//   X.   RENDER – DETAIL PAGE (detail only)
//   XI.  RENDER – HISTORY PAGE (history only)
//   XII. READER (universal)
//   XIII. PAGE INIT (universal)
//   XIV. GLOBAL EXPOSURE (universal)
// ================================================================

// ================================================================
// I. CONFIGURATION
// ================================================================
const CLIENT_ID = '855351743150-catri9qskphur736modkajoo76h93kbb.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

const STORAGE_KEY = 'novelLibraryData';
const DB_NAME = 'NovelPdfCache';
const STORE_NAME = 'pdfs';
const DEFAULT_COVER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='280' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%23232937'/%3E%3Ctext x='100' y='140' font-family='Arial' font-size='80' fill='%239aa3b8' text-anchor='middle' dy='.3em'%3E📖%3C/text%3E%3C/svg%3E";

// ================================================================
// II. DATA LAYER (universal)
// ================================================================
let appData = loadData();
let coverMapping = {};
let coverFileMap = {};
let csvLoadError = null;

// ---- State variables ----
let detailSortAscending = true;
let currentDetailNovelId = null;
let currentDetailSectionName = null;
let searchQuery = '';
let currentSort = 'az';

// ---- Page state ----
let gapiInited = false;
let gisInited = false;
let tokenClient = null;
let db = null;
let toastTimer = null;

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { novels: [], history: [] };
        const data = JSON.parse(raw);
        if (!data.novels) data.novels = [];
        if (!data.history) data.history = [];
        return data;
    } catch {
        return { novels: [], history: [] };
    }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    appData = data;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

// ================================================================
// III. UTILITY FUNCTIONS (universal)
// ================================================================
function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function extractFileId(input) {
    if (!input) return '';
    const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return input.trim();
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatVolNumber(num) {
    if (num === undefined || num === null) return '?';
    if (Number.isInteger(num)) return num.toString();
    return num.toString();
}

function truncateTitle(title, maxLen = 50) {
    if (!title) return '';
    return title.length > maxLen ? title.substring(0, maxLen) + '…' : title;
}

function normalizeTitle(title) {
    if (!title) return '';
    let cleaned = title.replace(/\([^)]*\)/g, '');
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9 ]/g, ' ');
    cleaned = cleaned.replace(/^(a |an |the )/i, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

function normalizeForMatching(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')   // replace all punctuation with space
        .replace(/\s+/g, ' ')          // collapse multiple spaces
        .trim();
}

function cleanVolumeMainName(name) {
    if (!name) return '';
    let cleaned = name.replace(/\[[^\]]*\]\s*/g, '');   // remove all bracketed groups + trailing spaces
    cleaned = cleaned.replace(/[-–—]\s*$/, '');         // trailing dash
    cleaned = cleaned.replace(/^\s*[-–—]\s*/, '');      // leading dash
    return cleaned.trim();
}

// ================================================================
// IV. VOLUME PARSER (universal)
// ================================================================
function parseVolumeName(fullTitle) {
    const title = fullTitle.replace(/\.[^.]+$/, '');
    const match = title.match(/(Vol|Volume|V)\s*([\d.]+)/i);
    if (!match) {
        const cleaned = cleanVolumeMainName(title);
        return {
            number: 0,
            mainName: cleaned,
            special: null,
            displayName: cleaned
        };
    }
    const num = parseFloat(match[2]);
    const index = match.index;
    const before = title.substring(0, index).trim();
    const after = title.substring(index + match[0].length).trim();

    const specialKeywords = ['alter', 'special', 'bonus', 'extra', 'side', 'spin-off', 'after', 'before', 'prologue', 'epilogue', 'interlude', 'alternative', 'another'];
    let mainName = '';
    let special = null;

    function detectSpecial(part) {
        const lower = part.toLowerCase();
        for (const kw of specialKeywords) {
            if (lower.includes(kw)) {
                let cleaned = part.replace(new RegExp(kw, 'i'), '').trim();
                cleaned = cleaned.replace(/^[-–—]\s*/, '').replace(/[-–—]\s*$/, '');
                return { isSpecial: true, cleaned: cleaned };
            }
        }
        return { isSpecial: false, cleaned: part };
    }

    const beforeResult = detectSpecial(before);
    const afterResult = detectSpecial(after);

    if (beforeResult.isSpecial && !afterResult.isSpecial) {
        special = beforeResult.cleaned || before;
        mainName = afterResult.cleaned || after;
    } else if (afterResult.isSpecial && !beforeResult.isSpecial) {
        special = afterResult.cleaned || after;
        mainName = beforeResult.cleaned || before;
    } else {
        mainName = beforeResult.cleaned || before;
        special = afterResult.cleaned || after || null;
    }

    mainName = cleanVolumeMainName(mainName);
    if (special) special = special.trim();

    let displayName = '';
    if (special) {
        displayName = `${special} – Vol.${formatVolNumber(num)} – ${mainName}`;
    } else {
        displayName = `Vol.${formatVolNumber(num)} – ${mainName}`;
    }

    return {
        number: num,
        mainName: mainName,
        special: special,
        displayName: displayName
    };
}

// ================================================================
// V. CSV PARSER & COVER MAPPING (universal)
// ================================================================
function parseCSV(csvText) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;
    const len = csvText.length;

    while (i < len) {
        const char = csvText[i];
        const nextChar = i + 1 < len ? csvText[i + 1] : '';

        if (insideQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i += 2;
            } else if (char === '"') {
                insideQuotes = false;
                i++;
            } else {
                currentField += char;
                i++;
            }
        } else {
            if (char === '"') {
                insideQuotes = true;
                i++;
            } else if (char === ';') {   // ← ONLY semicolon as separator
                currentRow.push(currentField.trim());
                currentField = '';
                i++;
            } else if (char === '\r' || char === '\n') {
                if (currentField || currentRow.length > 0) {
                    currentRow.push(currentField.trim());
                    if (currentRow.some(f => f.length > 0)) {
                        rows.push(currentRow);
                    }
                    currentRow = [];
                    currentField = '';
                }
                if (char === '\r' && nextChar === '\n') {
                    i += 2;
                } else {
                    i++;
                }
            } else {
                currentField += char;
                i++;
            }
        }
    }

    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
            rows.push(currentRow);
        }
    }

    return rows;
}

async function loadCoverMapping() {
    try {
        console.log('📄 Attempting to load cover_mapping.csv...');
        const response = await fetch('assets/cover_mapping.csv');
        if (!response.ok) {
            console.warn('❌ cover_mapping.csv not found (HTTP ' + response.status + ').');
            csvLoadError = 'CSV file not found in assets/ folder.';
            return;
        }
        let text = await response.text();
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.substring(1);
        }
        console.log('📄 CSV loaded, length:', text.length, 'bytes');

        const rows = parseCSV(text);
        if (rows.length < 2) {
            console.warn('⚠️ cover_mapping.csv is empty or missing data.');
            return;
        }

        const headers = rows[0];
        console.log('📄 Parsed headers:', headers);

        const map = {};
        const titleIdx = findHeaderIndex(headers, ['name ( eng )', 'name eng', 'english', 'title']);
        const latinIdx = findHeaderIndex(headers, ['latin', 'romaji']);
        const nonLatinIdx = findHeaderIndex(headers, ['non-latin', 'japanese', 'kanji']);
        const authorIdx = findHeaderIndex(headers, ['author']);
        const descIdx = findHeaderIndex(headers, ['description']);
        const coverIdx = findHeaderIndex(headers, ['cover (image file)', 'cover', 'image', 'cover_url']);

        if (titleIdx === -1) {
            console.warn('❌ CSV must have a "Name ( ENG )" (or "english") column. Found:', headers);
            return {};
        }

        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i];
            const englishName = cols[titleIdx]?.trim() || '';
            const author = cols[authorIdx]?.trim() || 'Unknown';
            const description = cols[descIdx]?.trim() || '';
            const latin = cols[latinIdx]?.trim() || '';
            const nonLatin = cols[nonLatinIdx]?.trim() || '';
            const image = cols[coverIdx]?.trim() || '';

            if (englishName) {
                const entry = { englishName, author, description, latin, nonLatin, image };

                // ---- Store ALL variants ----
                const variants = [
                    englishName,                              // original case
                    englishName.toLowerCase(),                // lowercase
                    normalizeForMatching(englishName),        // normalized (punctuation removed)
                    englishName.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(), // no punctuation
                    englishName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(), // alphanumeric only
                ];
                // Remove duplicates
                const uniqueVariants = [...new Set(variants)];
                for (const key of uniqueVariants) {
                    map[key] = entry;
                }
                // Also store Latin and Non-Latin
                if (latin && latin !== 'N/A') {
                    const latinKey = normalizeForMatching(latin);
                    map[latinKey] = entry;
                }
                if (nonLatin && nonLatin !== 'N/A') {
                    const nonLatinKey = normalizeForMatching(nonLatin);
                    map[nonLatinKey] = entry;
                }
            }
        }

        coverMapping = map;
        console.log(`✅ Loaded ${Object.keys(coverMapping).length} cover mappings from CSV.`);
        console.log('📄 Sample CSV keys:', Object.keys(coverMapping).slice(0, 20));
        csvLoadError = null;
    } catch (err) {
        console.warn('❌ Error loading cover mapping CSV:', err);
        csvLoadError = err.message;
    }
}

function findHeaderIndex(headers, possibleNames) {
    for (const name of possibleNames) {
        const idx = headers.findIndex(h => h.toLowerCase().trim() === name);
        if (idx !== -1) return idx;
    }
    return -1;
}

function applyCoverMapping() {
    let updated = false;
    let matchedCount = 0;

    appData.novels.forEach(novel => {
        const driveKey = novel.title;
        const normalizedDriveKey = normalizeForMatching(driveKey);
        let data = null;

        // ---- Generate all possible drive variants ----
        const driveVariants = [
            driveKey,
            driveKey.toLowerCase(),
            normalizedDriveKey,
            driveKey.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(),
            driveKey.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
            normalizedDriveKey.replace(/^(the |a |an )/, ''),
        ];

        // ---- Try exact match on all variants ----
        for (const variant of driveVariants) {
            if (coverMapping[variant]) {
                data = coverMapping[variant];
                console.log(`✅ Exact match for "${novel.title}" using key: "${variant}"`);
                break;
            }
        }

        // ---- If still no data, try partial match ----
        if (!data) {
            for (const [csvKey, csvData] of Object.entries(coverMapping)) {
                const normalizedCsvKey = normalizeForMatching(csvKey);
                if (normalizedCsvKey.includes(normalizedDriveKey) ||
                    normalizedDriveKey.includes(normalizedCsvKey)) {
                    data = csvData;
                    console.log(`✅ Partial match: "${novel.title}" → "${csvKey}"`);
                    break;
                }
            }
        }

        // ---- If still no data, try matching by Latin/Non-Latin ----
        if (!data && novel.latin) {
            const normalizedLatin = normalizeForMatching(novel.latin);
            for (const [csvKey, csvData] of Object.entries(coverMapping)) {
                if (csvData.latin) {
                    const normalizedCsvLatin = normalizeForMatching(csvData.latin);
                    if (normalizedCsvLatin === normalizedLatin ||
                        normalizedCsvLatin.includes(normalizedLatin) ||
                        normalizedLatin.includes(normalizedCsvLatin)) {
                        data = csvData;
                        console.log(`✅ Latin match: "${novel.title}" → "${csvData.latin}"`);
                        break;
                    }
                }
            }
        }

        if (!data && novel.nonLatin) {
            const normalizedNonLatin = normalizeForMatching(novel.nonLatin);
            for (const [csvKey, csvData] of Object.entries(coverMapping)) {
                if (csvData.nonLatin) {
                    const normalizedCsvNonLatin = normalizeForMatching(csvData.nonLatin);
                    if (normalizedCsvNonLatin === normalizedNonLatin ||
                        normalizedCsvNonLatin.includes(normalizedNonLatin) ||
                        normalizedNonLatin.includes(normalizedCsvNonLatin)) {
                        data = csvData;
                        console.log(`✅ Non-Latin match: "${novel.title}" → "${csvData.nonLatin}"`);
                        break;
                    }
                }
            }
        }

        if (data) {
            matchedCount++;
            if (data.author && data.author !== 'N/A' && data.author !== 'Unknown') {
                if (novel.author !== data.author) { novel.author = data.author; updated = true; }
            }
            if (data.description && data.description !== 'N/A') {
                if (novel.description !== data.description) { novel.description = data.description; updated = true; }
            }
            if (data.latin && data.latin !== 'N/A') {
                if (novel.latin !== data.latin) { novel.latin = data.latin; updated = true; }
            }
            if (data.nonLatin && data.nonLatin !== 'N/A') {
                if (novel.nonLatin !== data.nonLatin) { novel.nonLatin = data.nonLatin; updated = true; }
            }
            if (data.englishName && data.englishName !== 'N/A') {
                if (novel.englishName !== data.englishName) {
                    novel.englishName = data.englishName;
                    updated = true;
                }
            }

            // ---- Cover image handling (unchanged) ----
            if (data.image) {
                let imageVal = data.image.trim();
                let coverUrl = null;

                if (imageVal.includes('drive.google.com')) {
                    const fileId = extractFileId(imageVal);
                    if (fileId) {
                        coverUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w300`;
                    } else {
                        coverUrl = DEFAULT_COVER;
                    }
                } else if (imageVal.startsWith('http://') || imageVal.startsWith('https://')) {
                    coverUrl = imageVal;
                } else {
                    let fileId = coverFileMap[imageVal] || coverFileMap[imageVal.toLowerCase()];
                    if (!fileId) {
                        const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
                        for (const ext of extensions) {
                            const withExt = imageVal + ext;
                            fileId = coverFileMap[withExt] || coverFileMap[withExt.toLowerCase()];
                            if (fileId) break;
                        }
                    }
                    if (!fileId) {
                        const baseName = imageVal.replace(/\.[^.]+$/, '');
                        fileId = coverFileMap[baseName] || coverFileMap[baseName.toLowerCase()];
                    }
                    if (fileId) {
                        coverUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w300`;
                    } else {
                        coverUrl = DEFAULT_COVER;
                    }
                }

                if (coverUrl && novel.cover !== coverUrl) {
                    novel.cover = coverUrl;
                    updated = true;
                }
            } else {
                if (novel.cover !== DEFAULT_COVER) {
                    novel.cover = DEFAULT_COVER;
                    updated = true;
                }
            }
        } else {
            console.warn(`❌ No match for: "${novel.title}" (normalized: "${normalizedDriveKey}")`);
        }
    });

    console.log(`📄 Matched ${matchedCount} of ${appData.novels.length} novels with CSV entries.`);
    deduplicateNovels();

    if (updated) {
        saveData(appData);
        renderAll();
        console.log('✅ Applied cover/author/description/latin/englishName mappings from CSV.');
    }
}

function deduplicateNovels() {
    const seen = new Set();
    const toRemove = [];
    appData.novels.forEach(novel => {
        const key = novel.title.toLowerCase().trim();
        if (seen.has(key)) {
            toRemove.push(novel.id);
        } else {
            seen.add(key);
        }
    });
    if (toRemove.length > 0) {
        appData.novels = appData.novels.filter(n => !toRemove.includes(n.id));
        appData.history = appData.history.filter(h => appData.novels.some(n => n.id === h.novelId));
        saveData(appData);
        console.log(`🗑️ Removed ${toRemove.length} duplicate novels.`);
    }
}

function updateStatuses() {
    let changed = false;
    appData.novels.forEach(novel => {
        const hasHistory = appData.history.some(h => h.novelId === novel.id);
        const newStatus = hasHistory ? 'reading' : 'not-read';
        if (novel.status !== newStatus) {
            novel.status = newStatus;
            changed = true;
        }
    });
    if (changed) {
        saveData(appData);
        renderAll();
    }
}

// ================================================================
// VI. GOOGLE API & DRIVE (universal)
// ================================================================
function saveToken(token) {
    if (token) localStorage.setItem('drive_token', JSON.stringify(token));
    else localStorage.removeItem('drive_token');
}

function restoreToken() {
    const tokenData = localStorage.getItem('drive_token');
    if (tokenData) {
        try {
            const token = JSON.parse(tokenData);
            gapi.client.setToken(token);
            return true;
        } catch { return false; }
    }
    return false;
}

function loadGoogleApis() {
    const check = setInterval(() => {
        if (typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts) {
            clearInterval(check);
            gapi.load('client', () => {
                gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] })
                    .then(() => {
                        gapiInited = true;
                        console.log('GAPI ready');
                        checkBothReady();
                    })
                    .catch(e => {
                        console.error('GAPI init error:', e);
                        showToast('GAPI init error', 'error');
                    });
            });
            try {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: ''
                });
                gisInited = true;
                console.log('GIS ready');
                checkBothReady();
            } catch (e) {
                console.error('GIS init error:', e);
                showToast('GIS init error', 'error');
            }
        }
    }, 300);
    setTimeout(() => clearInterval(check), 15000);
}

function checkBothReady() {
    if (gapiInited && gisInited) {
        const btn = document.getElementById('driveConnectBtn');
        if (btn) {
            btn.disabled = false;
            document.getElementById('driveStatus').textContent = 'Connect Drive';
        }
        if (restoreToken()) {
            document.getElementById('driveStatus').textContent = 'Connected ✅';
            const btn = document.getElementById('driveConnectBtn');
            if (btn) btn.style.borderColor = '#4ade80';
            listDriveFiles();
        }
    }
}

function refreshDriveConnection() {
    if (gapiInited && gisInited) {
        if (gapi.client && gapi.client.getToken && gapi.client.getToken()) {
            document.getElementById('driveStatus').textContent = 'Connected ✅';
            const btn = document.getElementById('driveConnectBtn');
            if (btn) btn.style.borderColor = '#4ade80';
            listDriveFiles();
            showToast('Drive reconnected!', 'success');
        } else {
            showToast('Not connected to Drive. Click "Connect Drive".', 'info');
        }
    } else {
        showToast('APIs loading... Please wait.', 'info');
    }
}

function handleAuthClick() {
    if (!gapiInited || !gisInited || !tokenClient) {
        showToast('APIs not ready. Please wait.', 'error');
        return;
    }
    tokenClient.callback = async (resp) => {
        if (resp.error) {
            showToast('Auth failed: ' + resp.error, 'error');
            return;
        }
        if (resp.access_token) saveToken(resp);
        document.getElementById('driveStatus').textContent = 'Connected ✅';
        const btn = document.getElementById('driveConnectBtn');
        if (btn) btn.style.borderColor = '#4ade80';
        showToast('Connected to Google Drive!', 'success');
        await listDriveFiles();
    };
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(null);
            saveToken(null);
            document.getElementById('driveStatus').textContent = 'Connect Drive';
            const btn = document.getElementById('driveConnectBtn');
            if (btn) btn.style.borderColor = '';
            showToast('Disconnected from Drive', 'info');
            renderAll();
        });
    }
}

async function findFolderId(folderPath) {
    const parts = folderPath.split('/').filter(p => p.length > 0);
    let parent = 'root';
    for (const part of parts) {
        const q = `name='${part}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        try {
            const res = await gapi.client.drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
            const files = res.result.files;
            if (files && files.length > 0) {
                parent = files[0].id;
            } else return null;
        } catch { return null; }
    }
    return parent;
}

async function listSubfolders(parentId) {
    const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name)', pageSize: 100 });
    return res.result.files || [];
}

async function listFilesInFolder(folderId) {
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await gapi.client.drive.files.list({ q, fields: 'files(id, name, mimeType, modifiedTime)', pageSize: 100 });
    return res.result.files || [];
}

async function buildFolderTree(folderId, folderName) {
    const files = await listFilesInFolder(folderId);
    const subfolders = await listSubfolders(folderId);
    const subfoldersTree = [];
    for (const sub of subfolders) {
        const child = await buildFolderTree(sub.id, sub.name);
        subfoldersTree.push(child);
    }
    return { name: folderName, id: folderId, files: files, subfolders: subfoldersTree };
}

function flattenSections(tree, parentPath = '') {
    // Recursively build sections for each folder that contains files
    // Returns { rootVolumes: [...], sections: [{ name, volumes }] }
    function processNode(node) {
        const result = { rootVolumes: [], sections: [] };

        // Get files directly in this node (root)
        const validFiles = node.files.filter(f => {
            const isPdf = f.mimeType === 'application/pdf' || f.name.endsWith('.pdf');
            const isText = f.mimeType === 'text/plain' || f.name.endsWith('.txt');
            return isPdf || isText;
        });

        validFiles.forEach(f => {
            const parsed = parseVolumeName(f.name);
            result.rootVolumes.push({
                title: parsed.mainName,
                displayName: parsed.displayName,
                number: parsed.number,
                special: parsed.special,
                fileId: f.id,
                mimeType: f.mimeType,
                modifiedTime: f.modifiedTime || null,
            });
        });

        // Process subfolders
        for (const child of node.subfolders) {
            const childResult = processNode(child);
            // If child has root volumes, create a section for it
            if (childResult.rootVolumes.length > 0) {
                result.sections.push({
                    name: child.name,
                    volumes: childResult.rootVolumes
                });
            }
            // Also include any sections from deeper levels (if child has sub-subfolders with volumes)
            if (childResult.sections.length > 0) {
                result.sections.push(...childResult.sections);
            }
        }

        return result;
    }

    const result = processNode(tree);
    // Return as { rootVolumes, sections }
    return { rootVolumes: result.rootVolumes, sections: result.sections };
}

async function listDriveFiles() {
    const pathDisplay = document.getElementById('drivePathDisplay');
    if (pathDisplay) pathDisplay.textContent = '📁 Searching...';

    try {
        // ---- Try multiple case variations for J-Novel folder ----
        const pathsToTry = [
            'File/PDF/J-Novel',
            'file/pdf/j-novel',
            'File/PDF/j-novel',
            'file/PDF/J-Novel',
            'File/pdf/J-Novel'
        ];
        let rootId = null;
        let foundPath = '';
        for (const path of pathsToTry) {
            const id = await findFolderId(path);
            if (id) {
                rootId = id;
                foundPath = path;
                console.log(`✅ Found folder at: ${path}`);
                break;
            }
        }

        if (!rootId) {
            if (pathDisplay) pathDisplay.textContent = '📁 /file/pdf/j-novel/ (not found)';
            showToast('Folder "j-novel" not found. Please check the path.', 'error');
            return;
        }
        if (pathDisplay) pathDisplay.textContent = `📁 ${foundPath}`;

        // ---- Cover folder ----
        coverFileMap = {};
        const coverPaths = [
            'File/PDF/Novel Cover',
            'file/pdf/novel cover',
            'File/PDF/Novel_Cover',
            'file/pdf/novel_cover',
            'File/PDF/NovelCover',
            'file/pdf/novelcover'
        ];
        let coverFolderId = null;
        for (const path of coverPaths) {
            const id = await findFolderId(path);
            if (id) {
                coverFolderId = id;
                console.log(`📸 Found cover folder at: ${path}`);
                break;
            }
        }

        if (coverFolderId) {
            const coverFiles = await listFilesInFolder(coverFolderId);
            coverFiles.forEach(file => {
                coverFileMap[file.name] = file.id;
                coverFileMap[file.name.toLowerCase()] = file.id;
            });
            console.log(`📸 Found ${coverFiles.length} cover images.`);
        } else {
            console.log('ℹ️ Novel Cover folder not found – covers will use CSV URLs.');
        }

        // ---- Get all novel folders (subfolders of j-novel) ----
        const novelFolders = await listSubfolders(rootId);
        console.log(`📂 Found ${novelFolders.length} novel folders`);

        const novelData = [];
        for (const folder of novelFolders) {
            const tree = await buildFolderTree(folder.id, folder.name);
            const { rootVolumes, sections } = flattenSections(tree);

            // Build final sections
            const finalSections = [];
            // "All Volumes" = root files only
            finalSections.push({ name: 'All Volumes', volumes: rootVolumes });

            // Add all other sections (subfolders)
            for (const s of sections) {
                if (!finalSections.find(fs => fs.name === s.name)) {
                    finalSections.push(s);
                } else {
                    const existing = finalSections.find(fs => fs.name === s.name);
                    if (existing) {
                        existing.volumes.push(...s.volumes);
                    }
                }
            }

            // Total volumes = root volumes + all subfolder volumes
            const totalVols = rootVolumes.length + sections.reduce((sum, s) => sum + s.volumes.length, 0);

            novelData.push({
                title: folder.name,
                id: folder.id,
                sections: finalSections,
                volumes: rootVolumes,   // for backward compatibility
                totalVolumes: totalVols
            });
        }

        syncNovelsWithSections(novelData);
        applyCoverMapping();
        updateStatuses();
        cleanupOrphanNovels();

    } catch (err) {
        console.error('Drive list error:', err);
        if (pathDisplay) pathDisplay.textContent = '📁 /file/pdf/j-novel/ (error)';
        showToast('Error: ' + err.message, 'error');
    }
}

function cleanupOrphanNovels() {
    const toRemove = [];
    appData.novels.forEach(novel => {
        if (novel.fromDrive && (!novel.sections || novel.sections.length === 0) && novel.volumes.length === 0) {
            toRemove.push(novel.id);
        }
    });
    if (toRemove.length > 0) {
        appData.novels = appData.novels.filter(n => !toRemove.includes(n.id));
        appData.history = appData.history.filter(h => !toRemove.includes(h.novelId));
        saveData(appData);
        console.log(`🗑️ Removed ${toRemove.length} orphaned novels.`);
    }
}

// ================================================================
// VII. SYNC FUNCTIONS (universal)
// ================================================================
function syncNovelsWithSections(novelData) {
    let updated = false;
    for (const data of novelData) {
        const existing = appData.novels.find(n => n.title === data.title);

        if (existing) {
            let changed = false;
            if (data.sections && data.sections.length > 0) {
                const existingSections = existing.sections || [];
                data.sections.forEach(newSection => {
                    const existingSection = existingSections.find(s => s.name === newSection.name);
                    if (existingSection) {
                        const newFileIds = new Set(newSection.volumes.map(v => v.fileId));
                        const existingVols = existingSection.volumes || [];

                        const toRemove = existingVols.filter(v => !newFileIds.has(v.fileId));
                        if (toRemove.length > 0) {
                            toRemove.forEach(v => {
                                const idx = existingVols.indexOf(v);
                                if (idx > -1) existingVols.splice(idx, 1);
                            });
                            changed = true;
                        }

                        newSection.volumes.forEach(newVol => {
                            const existingVol = existingVols.find(v => v.fileId === newVol.fileId);
                            if (existingVol) {
                                if (existingVol.number !== newVol.number ||
                                    existingVol.title !== newVol.title ||
                                    existingVol.displayName !== newVol.displayName ||
                                    existingVol.special !== newVol.special) {
                                    existingVol.number = newVol.number;
                                    existingVol.title = newVol.title;
                                    existingVol.displayName = newVol.displayName;
                                    existingVol.special = newVol.special;
                                    existingVol.modifiedTime = newVol.modifiedTime;
                                    changed = true;
                                }
                            } else {
                                existingVols.push(newVol);
                                changed = true;
                            }
                        });
                        existingSection.volumes = existingVols;
                    } else {
                        existingSections.push(newSection);
                        changed = true;
                    }
                });

                const newSectionNames = new Set(data.sections.map(s => s.name));
                const toRemoveSections = existingSections.filter(s => !newSectionNames.has(s.name) && s.name !== 'All Volumes');
                if (toRemoveSections.length > 0) {
                    toRemoveSections.forEach(s => {
                        const idx = existingSections.indexOf(s);
                        if (idx > -1) existingSections.splice(idx, 1);
                    });
                    changed = true;
                }
                existing.sections = existingSections;
            }

            if (existing.totalVolumes !== data.totalVolumes) {
                existing.totalVolumes = data.totalVolumes;
                changed = true;
            }

            if (changed) {
                updated = true;
                console.log(`✅ Synced "${data.title}"`);
            }
        } else {
            appData.novels.push({
                id: generateId(),
                title: data.title,
                author: 'Unknown',
                description: `Auto-imported from Drive (${data.totalVolumes || 0} volumes)`,
                cover: DEFAULT_COVER,
                coverFileId: null,
                status: 'not-read',
                volumes: data.volumes || [],
                sections: data.sections || [],
                totalVolumes: data.totalVolumes || 0,
                addedAt: new Date().toISOString(),
                fromDrive: true,
            });
            updated = true;
            console.log(`✅ Added new novel: "${data.title}"`);
        }
    }

    if (updated) {
        saveData(appData);
        renderAll();
        showToast('Refreshed novels from Drive!', 'success');
    } else {
        showToast('No changes detected in Drive.', 'info');
    }
}

// ================================================================
// VIII. SORT FUNCTIONS (universal)
// ================================================================
function sortVolumes(volumes, ascending = true) {
    return [...volumes].sort((a, b) => {
        const aHasSpecial = a.special ? 1 : 0;
        const bHasSpecial = b.special ? 1 : 0;
        if (aHasSpecial !== bHasSpecial) {
            return ascending ? aHasSpecial - bHasSpecial : bHasSpecial - aHasSpecial;
        }
        const numA = a.number || 0;
        const numB = b.number || 0;
        return ascending ? numA - numB : numB - numA;
    });
}

function sortNovels(novels, sortType) {
    const sorted = [...novels];
    switch (sortType) {
        case 'az':
            return sorted.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
        case 'za':
            return sorted.sort((a, b) => b.title.toLowerCase().localeCompare(a.title.toLowerCase()));
        case 'newest':
            return sorted.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
        case 'oldest':
            return sorted.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
        default:
            return sorted;
    }
}

// ================================================================
// IX. RENDER – INDEX PAGE
// ================================================================
function renderAll() {
    renderStats();
    renderCurrentlyReading();
    renderNovelGrid();
}

function renderStats() {
    const total = appData.novels.length;
    let volumes = 0,
        reading = 0;
    appData.novels.forEach(n => {
        volumes += n.totalVolumes || (n.volumes || []).length;
        if (n.status === 'reading') reading++;
    });
    document.getElementById('statNovels').textContent = total;
    document.getElementById('statVolumes').textContent = volumes;
    document.getElementById('statReading').textContent = reading;
}

function renderCurrentlyReading() {
    const section = document.getElementById('currentlyReadingSection');
    const container = document.getElementById('currentlyReadingContainer');
    if (!section || !container) return;

    const reading = appData.novels.filter(n => n.status === 'reading' && getLastReadInfo(n.id) !== null);
    const sorted = reading.sort((a, b) => {
        const lastA = getLastReadInfo(a.id),
            lastB = getLastReadInfo(b.id);
        const dateA = lastA ? new Date(lastA.date) : new Date(0);
        const dateB = lastB ? new Date(lastB.date) : new Date(0);
        return dateB - dateA;
    });
    const latest7 = sorted.slice(0, 7);

    if (latest7.length === 0) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    section.style.display = 'block';
    const badge = document.getElementById('readingBadge');
    if (badge) badge.textContent = `Latest ${latest7.length}`;

    container.innerHTML = latest7.map(n => {
        const volCount = n.totalVolumes || (n.volumes || []).length;
        const lastInfo = getLastReadInfo(n.id);
        const lastDate = lastInfo ? formatDate(lastInfo.date) : 'Not read yet';
        const coverSrc = n.cover || DEFAULT_COVER;
        const mainTitle = (n.nonLatin && n.nonLatin.trim() !== '') ? n.nonLatin : n.title;
        return `
            <div class="reading-card" onclick="window.location.href='detail.html?id=${n.id}'">
                <img src="${coverSrc}" alt="${escapeHtml(n.title)}" loading="lazy" onerror="this.style.display='none'">
                <h4>${escapeHtml(mainTitle)}</h4>
                <div class="author">${escapeHtml(n.author)}</div>
                <div class="volume-count">${volCount} volume${volCount!==1?'s':''}</div>
                <div class="read-date"><i class="fas fa-clock"></i> ${lastInfo ? lastDate : 'Not read'}</div>
            </div>
        `;
    }).join('');
}

function renderNovelGrid() {
    const container = document.getElementById('novelGridContainer');
    if (!container) return;

    let novelsToRender = appData.novels;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        novelsToRender = appData.novels.filter(n => {
            return (n.title && n.title.toLowerCase().includes(q)) ||
                (n.author && n.author.toLowerCase().includes(q)) ||
                (n.latin && n.latin.toLowerCase().includes(q)) ||
                (n.nonLatin && n.nonLatin.toLowerCase().includes(q));
        });
    }

    const seen = new Set();
    novelsToRender = novelsToRender.filter(n => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
    });

    const sortedNovels = sortNovels(novelsToRender, currentSort);
    if (sortedNovels.length === 0) {
        container.innerHTML = '<div class="empty-state">No novels found. Connect Drive to automatically import your library.</div>';
        return;
    }

    container.innerHTML = sortedNovels.map(n => {
        // ---- Use "All Volumes" section for home page ----
        const allVolumesSection = (n.sections || []).find(s => s.name === 'All Volumes');
        const mainVolumes = allVolumesSection ? allVolumesSection.volumes : (n.volumes || []);
        const totalVolCount = n.totalVolumes || (n.volumes || []).length;

        const maxVolumesToShow = 3;
        const sortedVolumes = sortVolumes(mainVolumes, true);
        const showVolumes = sortedVolumes.slice(0, maxVolumesToShow);
        const remaining = totalVolCount - maxVolumesToShow;

        const volList = showVolumes.map((v, idx) => {
            const hasFile = v.fileId && v.fileId.length > 0;
            const displayName = v.displayName || `Vol.${formatVolNumber(v.number)} – ${v.title || ''}`;
            const clickAttr = hasFile ? `onclick="event.stopPropagation(); window.openReader('${n.id}', ${idx})"` : '';
            const clickableClass = hasFile ? 'clickable' : '';
            const textColor = hasFile ? 'var(--text-primary)' : 'var(--text-secondary)';
            return `<div class="volume-row ${clickableClass}" ${clickAttr}>
                        <span class="volume-name" style="color:${textColor};">${escapeHtml(displayName)}</span>
                    </div>`;
        }).join('');

        let moreText = '';
        if (remaining > 0) {
            moreText = `<div class="more-link">+ ${remaining} more volume${remaining > 1 ? 's' : ''}</div>`;
        }

        const coverSrc = n.cover || DEFAULT_COVER;
        const statusColor = n.status === 'reading' ? '#4ade80' : '#9aa3b8';
        const statusLabel = n.status === 'reading' ? 'Reading' : 'Not read';

        const englishDisplay = n.englishName || n.title;
        const mainTitle = (n.nonLatin && n.nonLatin.trim() !== '') ? n.nonLatin : englishDisplay;
        const latinLine = (n.latin && n.latin.trim() !== '') ? n.latin : '';
        const englishLine = (n.nonLatin && n.nonLatin.trim() !== '') ? englishDisplay : '';

        return `
            <div class="novel-card" onclick="window.location.href='detail.html?id=${n.id}'">
                <div class="novel-card-inner">
                    <div class="novel-cover">
                        <img src="${coverSrc}" alt="${escapeHtml(n.title)}" loading="lazy" onerror="this.src='${DEFAULT_COVER}'">
                    </div>
                    <div class="novel-info">
                        <div class="novel-title-block">
                            <div class="novel-title">${escapeHtml(mainTitle)}</div>
                            ${latinLine ? `<div class="novel-latin">${escapeHtml(latinLine)}</div>` : ''}
                            ${englishLine ? `<div class="novel-english">${escapeHtml(englishLine)}</div>` : ''}
                        </div>
                        <div class="novel-author">${escapeHtml(n.author)}</div>
                        <div class="novel-meta">
                            <span class="novel-status" style="color:${statusColor}">${statusLabel}</span>
                            <span class="novel-vol-count">${totalVolCount} volume${totalVolCount !== 1 ? 's' : ''}</span>
                            ${n.fromDrive ? '<span class="drive-badge"><i class="fas fa-cloud"></i> Drive</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="novel-volumes">
                    <div>
                        ${volList}
                        ${moreText}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// X. RENDER – DETAIL PAGE
// ================================================================
function loadDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const section = params.get('section');
    if (!id) {
        showToast('No novel specified', 'error');
        window.location.href = 'index.html';
        return;
    }
    currentDetailNovelId = id;
    currentDetailSectionName = section || null;
    detailSortAscending = true;
    renderNovelDetail(id, section);
    updateSortButton();
}

function renderNovelDetail(novelId, sectionName) {
    const novel = appData.novels.find(n => n.id === novelId);
    if (!novel) {
        showToast('Novel not found', 'error');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('detailCover').src = novel.cover || DEFAULT_COVER;

    // ---- TITLE LINES ----
    const mainTitleEl = document.getElementById('detailTitle');
    const latinTitleEl = document.getElementById('detailLatinTitle');
    const englishTitleEl = document.getElementById('detailEnglishTitle');

    const englishDisplay = novel.englishName || novel.title;

    if (novel.nonLatin && novel.nonLatin.trim() !== '') {
        mainTitleEl.textContent = novel.nonLatin;
        latinTitleEl.textContent = novel.latin || '';
        englishTitleEl.textContent = englishDisplay;
        englishTitleEl.style.display = 'block';
    } else {
        mainTitleEl.textContent = englishDisplay;
        latinTitleEl.textContent = novel.latin || 'N/A';
        englishTitleEl.textContent = '';
        englishTitleEl.style.display = 'none';
    }

    document.getElementById('detailAuthor').textContent = 'by ' + (novel.author || 'Unknown');

    // ---- DESCRIPTION & READ MORE ----
    const descEl = document.getElementById('detailDescription');
    const readMoreBtn = document.getElementById('readMoreBtn');
    const wrapper = document.getElementById('descriptionWrapper');

    const fullDescription = novel.description || 'No description available.';
    const maxChars = 200;
    const truncated = fullDescription.length > maxChars
        ? fullDescription.substring(0, maxChars) + '…'
        : fullDescription;

    descEl.dataset.fullText = fullDescription;
    descEl.dataset.truncated = truncated;

    let isExpanded = false;

    function updateDescription() {
        if (isExpanded) {
            descEl.textContent = fullDescription;
            readMoreBtn.textContent = 'Show less';
        } else {
            descEl.textContent = truncated;
            readMoreBtn.textContent = fullDescription.length > maxChars ? 'Read more' : '';
        }
        readMoreBtn.style.display = fullDescription.length > maxChars ? 'inline-block' : 'none';
    }

    isExpanded = false;
    updateDescription();

    readMoreBtn.onclick = function(e) {
        e.stopPropagation();
        isExpanded = !isExpanded;
        updateDescription();
    };

    // ---- STATUS ----
    const statusText = novel.status === 'reading' ? 'Reading' : 'Not read';
    const totalVols = novel.totalVolumes || (novel.volumes || []).length;
    document.getElementById('detailStatus').textContent = `${totalVols} volume${totalVols !== 1 ? 's' : ''} – ${statusText}`;
    document.getElementById('detailStatus').className = 'status-badge ' + (novel.status || 'not-read');
    document.getElementById('detailVolCount').textContent = '';

    // ---- VOLUMES ----
    let volumesToShow = [];
    let sectionDisplayName = 'All Volumes';

    if (sectionName) {
        const section = (novel.sections || []).find(s => s.name === sectionName);
        if (section) {
            volumesToShow = section.volumes || [];
            sectionDisplayName = sectionName;
        } else {
            const found = (novel.sections || []).find(s => s.name.toLowerCase().includes(sectionName.toLowerCase()));
            if (found) {
                volumesToShow = found.volumes || [];
                sectionDisplayName = found.name;
            } else {
                volumesToShow = novel.volumes || [];
            }
        }
    } else {
        const allSection = (novel.sections || []).find(s => s.name === 'All Volumes');
        if (allSection) {
            volumesToShow = allSection.volumes || [];
            sectionDisplayName = 'All Volumes';
        } else {
            volumesToShow = novel.volumes || [];
        }
    }

    // Breadcrumb
    const breadcrumb = document.getElementById('detailBreadcrumb');
    if (breadcrumb) {
        if (sectionName) {
            breadcrumb.innerHTML = `
                <a href="detail.html?id=${novel.id}">${escapeHtml(novel.title)}</a>
                <span> / </span>
                <span>${escapeHtml(sectionDisplayName)}</span>
            `;
        } else {
            breadcrumb.innerHTML = `<span>${escapeHtml(novel.title)}</span>`;
        }
    }

    renderNovelSections(novel, sectionName);
    renderDetailVolumes(novel, volumesToShow, sectionDisplayName, sectionName);
    updateSortButton();
}

function renderNovelSections(novel, activeSection) {
    const container = document.getElementById('detailSectionsContainer');
    if (!container) return;

    const sections = novel.sections || [];
    if (sections.length === 0) {
        container.innerHTML = '';
        return;
    }

    const sorted = sections.sort((a, b) => {
        if (a.name === 'All Volumes') return -1;
        if (b.name === 'All Volumes') return 1;
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = sorted.map(s => {
        const isActive = (activeSection === null && s.name === 'All Volumes') || (s.name === activeSection);
        const url = s.name === 'All Volumes' ?
            `detail.html?id=${novel.id}` :
            `detail.html?id=${novel.id}&section=${encodeURIComponent(s.name)}`;
        return `
            <a href="${url}">
                <div class="section-tab ${isActive ? 'active' : ''}">${escapeHtml(s.name)}</div>
            </a>
        `;
    }).join('');
}

function renderDetailVolumes(novel, volumes, sectionName, sectionParam) {
    const container = document.getElementById('detailVolumesContainer');
    if (!container) return;

    if (!volumes || volumes.length === 0) {
        container.innerHTML = `<div class="empty-state">No volumes in "${escapeHtml(sectionName)}".</div>`;
        return;
    }

    const sortedVols = sortVolumes(volumes, detailSortAscending);

    container.innerHTML = sortedVols.map((v, idx) => {
        const hasFile = v.fileId && v.fileId.length > 0;
        const fileId = extractFileId(v.fileId);
        const isValidFile = hasFile && fileId;
        const displayName = v.displayName || v.title || `Volume ${idx + 1}`;
        const clickHandler = isValidFile ? `onclick="window.openReader('${novel.id}', ${idx})"` : '';
        const cursorStyle = isValidFile ? 'cursor:pointer;' : 'cursor:default;';

        return `
            <div class="history-item" style="${cursorStyle}" ${clickHandler}>
                <div style="flex:1; min-width:0;">
                    <strong style="display:block; overflow-wrap:break-word; word-break:break-word; line-height:1.4;">${escapeHtml(displayName)}</strong>
                    ${!isValidFile ? '<span style="font-size:0.7rem; color:#f87171;">⚠️ No valid file</span>' : ''}
                </div>
                <!-- Read icon removed -->
            </div>
        `;
    }).join('');
}

function updateSortButton() {
    const btn = document.getElementById('sortVolumesToggle');
    if (!btn) return;
    btn.innerHTML = detailSortAscending ?
        '<i class="fas fa-arrow-up"></i> Ascending' :
        '<i class="fas fa-arrow-down"></i> Descending';
}

// ================================================================
// XI. RENDER – HISTORY PAGE
// ================================================================
function renderFullHistory() {
    const container = document.getElementById('fullHistoryContainer');
    if (!container) return;

    const history = appData.history;
    const countEl = document.getElementById('historyCount');
    if (countEl) countEl.textContent = history.length + ' entries';

    if (history.length === 0) {
        container.innerHTML = '<div class="empty-state">No reading history yet.</div>';
        return;
    }

    const items = history.slice().reverse();
    container.innerHTML = items.map(h => {
        const novel = appData.novels.find(n => n.id === h.novelId);
        const title = novel ? (novel.nonLatin && novel.nonLatin.trim() !== '' ? novel.nonLatin : novel.title) : 'Unknown novel';
        const volNum = h.volumeIndex !== undefined ? h.volumeIndex + 1 : '?';
        const date = h.date ? new Date(h.date).toLocaleString() : '';
        const hasFile = novel && novel.volumes[h.volumeIndex] && novel.volumes[h.volumeIndex].fileId;
        const clickable = hasFile ? `onclick="window.openReader('${h.novelId}', ${h.volumeIndex})"` : '';
        const cursor = hasFile ? 'cursor:pointer;' : 'cursor:default;';
        return `
            <div class="history-item" style="${cursor}" ${clickable}>
                <div class="left">
                    <span class="novel-title">${escapeHtml(title)}</span>
                    <span class="volume-label">Vol. ${volNum}</span>
                </div>
                <span class="date">${date}</span>
            </div>
        `;
    }).join('');
}

// ================================================================
// XII. READER (universal)
// ================================================================
function getLastReadInfo(novelId) {
    const entries = appData.history.filter(h => h.novelId === novelId);
    if (entries.length === 0) return null;
    return entries.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
}

function openCache() {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db);
            return; }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getCachedPdf(fileId) {
    try {
        const db = await openCache();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const get = store.get(fileId);
            get.onsuccess = () => resolve(get.result ? get.result.data : null);
            get.onerror = () => reject(get.error);
        });
    } catch (e) {
        console.warn('Cache read error:', e);
        return null;
    }
}

async function savePdfToCache(fileId, data) {
    try {
        const db = await openCache();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const put = store.put({ fileId, data });
            put.onsuccess = () => resolve();
            put.onerror = () => reject(put.error);
        });
    } catch (e) {
        console.warn('Cache write error:', e);
    }
}

async function clearPdfCache() {
    if (!confirm('This will clear all cached files, novel data, and reading history. Continue?')) return;
    try {
        const db = await openCache();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('drive_token');
            appData = { novels: [], history: [] };
            saveData(appData);
            renderAll();
            showToast('All data cleared! Page will reload.', 'success');
            setTimeout(() => window.location.reload(), 1500);
        };
        tx.onerror = () => showToast('Failed to clear cache.', 'error');
    } catch (e) {
        showToast('Error clearing cache.', 'error');
    }
}

let currentNovelId = null,
    currentVolumeIndex = null;

window.openReader = function(novelId, volIndex) {
    const novel = appData.novels.find(n => n.id === novelId);
    if (!novel) { showToast('Novel not found', 'error'); return; }
    const vol = novel.volumes[volIndex];
    if (!vol || !vol.fileId) { showToast('No file ID for this volume', 'error'); return; }
    const fileId = extractFileId(vol.fileId);
    if (!fileId) { showToast('Invalid file ID', 'error'); return; }

    appData.history = appData.history.filter(h => h.novelId !== novelId);
    appData.history.push({ novelId: novel.id, volumeIndex: volIndex, date: new Date().toISOString() });
    saveData(appData);
    updateStatuses();

    currentNovelId = novelId;
    currentVolumeIndex = volIndex;
    document.getElementById('readerTitle').textContent = `${novel.title} – ${vol.title || 'Vol.' + (volIndex + 1)}`;
    document.getElementById('readerBody').innerHTML = '<div class="loading">Loading file...</div>';
    document.getElementById('readerModal').classList.add('active');
    fetchFileContent(fileId);
};

document.getElementById('readerClose')?.addEventListener('click', () => {
    document.getElementById('readerModal').classList.remove('active');
});
document.getElementById('readerModal')?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('active');
});

async function fetchFileContent(fileId) {
    try {
        const cached = await getCachedPdf(fileId);
        if (cached) {
            const isPdf = cached instanceof ArrayBuffer;
            if (isPdf) renderPdf(cached);
            else document.getElementById('readerBody').innerHTML = `<pre>${escapeHtml(cached)}</pre>`;
            return;
        }
        if (fileId.startsWith('local_')) {
            document.getElementById('readerBody').innerHTML = '<div class="loading" style="color:#f87171;">Local file not found.</div>';
            showToast('Local file missing. Please re-upload.', 'error');
            return;
        }
        const token = gapi.client.getToken();
        if (!token) {
            showToast('Not authenticated.', 'error');
            document.getElementById('readerBody').innerHTML = '<div class="loading" style="color:#f87171;">Not authenticated.</div>';
            return;
        }
        const meta = await gapi.client.drive.files.get({ fileId, fields: 'mimeType, name' });
        const mimeType = meta.result.mimeType,
            name = meta.result.name;
        if (mimeType === 'application/vnd.google-apps.folder') {
            document.getElementById('readerBody').innerHTML = `<div class="loading" style="color:#f87171;">❌ This is a folder.</div>`;
            showToast('This volume points to a folder.', 'error');
            return;
        }
        if (mimeType === 'text/plain' || name.endsWith('.txt')) {
            const response = await gapi.client.drive.files.get({ fileId, alt: 'media' });
            const text = response.body;
            document.getElementById('readerBody').innerHTML = `<pre>${escapeHtml(text)}</pre>`;
            await savePdfToCache(fileId, text);
            return;
        }
        if (mimeType === 'application/pdf') {
            const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            const response = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token.access_token } });
            if (!response.ok) {
                if (response.status === 401) {
                    showToast('Token expired, refreshing...', 'info');
                    await new Promise(resolve => {
                        tokenClient.callback = async resp => {
                            if (resp.error) { showToast('Token refresh failed', 'error');
                                resolve(); return; }
                            const newToken = gapi.client.getToken();
                            const retry = await fetch(url, { headers: { 'Authorization': 'Bearer ' + newToken.access_token } });
                            if (retry.ok) {
                                const ab = await retry.arrayBuffer();
                                await savePdfToCache(fileId, ab);
                                renderPdf(ab);
                            } else showToast('Retry failed', 'error');
                            resolve();
                        };
                        tokenClient.requestAccessToken({ prompt: '' });
                    });
                    return;
                }
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            await savePdfToCache(fileId, arrayBuffer);
            renderPdf(arrayBuffer);
        }
    } catch (err) {
        console.error('Reader error:', err);
        document.getElementById('readerBody').innerHTML = `<div class="loading" style="color:#f87171;">Error: ${err.message}</div>`;
        showToast('Failed to load file.', 'error');
    }
}

async function renderPdf(arrayBuffer) {
    try {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let html = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            await page.render({ canvasContext: context, viewport }).promise;
            html += `<div style="margin-bottom:12px;text-align:center;"><img src="${canvas.toDataURL()}" style="max-width:100%;border:1px solid #2f3748;border-radius:4px;"></div>`;
        }
        document.getElementById('readerBody').innerHTML = html;
    } catch (err) {
        console.error('PDF render error:', err);
        document.getElementById('readerBody').innerHTML = `<div class="loading" style="color:#f87171;">PDF error: ${err.message}</div>`;
        showToast('PDF rendering error', 'error');
    }
}

// ================================================================
// XIII. PAGE INIT (universal)
// ================================================================
function showToast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + type;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

document.addEventListener('DOMContentLoaded', function() {
    const page = window.location.pathname.split('/').pop() || 'index.html';

    loadCoverMapping().then(() => {
        if (appData.novels.length > 0) {
            applyCoverMapping();
            renderAll();
        }
    });

    // Sidebar toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
    }
    window.closeSidebar = closeSidebar;

    if (menuToggle) {
        menuToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            if (backdrop) backdrop.classList.toggle('active');
        });
    }
    if (backdrop) {
        backdrop.addEventListener('click', closeSidebar);
    }
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 820) closeSidebar();
        });
    });

    // ---- INDEX PAGE ----
    if (page === 'index.html' || page === '') {
        renderAll();
        document.getElementById('sortSelect')?.addEventListener('change', function() {
            currentSort = this.value;
            renderNovelGrid();
        });
        document.getElementById('forceReimportBtn')?.addEventListener('click', function() {
            if (gapi.client && gapi.client.getToken && gapi.client.getToken()) {
                listDriveFiles();
            } else {
                showToast('Connect Drive first', 'error');
            }
        });
        document.getElementById('searchInput')?.addEventListener('input', function() {
            searchQuery = this.value.trim();
            renderNovelGrid();
        });
    }

    // ---- HISTORY PAGE ----
    if (page === 'history.html') {
        renderFullHistory();
    }

    // ---- DETAIL PAGE ----
    if (page === 'detail.html') {
        loadDetailPage();
        document.getElementById('sortVolumesToggle')?.addEventListener('click', function() {
            detailSortAscending = !detailSortAscending;
            updateSortButton();
            if (currentDetailNovelId) {
                renderNovelDetail(currentDetailNovelId, currentDetailSectionName);
            }
        });
    }

    // ---- SHARED (all pages) ----
    document.getElementById('driveConnectBtn')?.addEventListener('click', function() {
        const status = document.getElementById('driveStatus');
        if (status && status.textContent === 'Connected ✅') {
            handleSignoutClick();
        } else {
            handleAuthClick();
        }
    });
    document.getElementById('driveRefreshBtn')?.addEventListener('click', refreshDriveConnection);

    loadGoogleApis();
});

// ================================================================
// XIV. GLOBAL EXPOSURE (universal)
// ================================================================
window.openReader = openReader;
window.clearPdfCache = clearPdfCache;
window.closeSidebar = closeSidebar;
