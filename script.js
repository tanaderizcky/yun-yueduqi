// ================================================================
// CONFIGURATION – Replace with your real Google OAuth Client ID
// ================================================================
const CLIENT_ID = '855351743150-catri9qskphur736modkajoo76h93kbb.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

// ================================================================
// DATA LAYER – localStorage persistence
// ================================================================
const STORAGE_KEY = 'novelLibraryData';
let appData = loadData();
let driveFiles = [];
let coverMapping = {};
let coverFileMap = {};
let csvLoadError = null;

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { novels: [], history: [] };
        const data = JSON.parse(raw);
        if (!data.novels) data.novels = [];
        if (!data.history) data.history = [];
        return data;
    } catch { return { novels: [], history: [] }; }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    appData = data;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

// ================================================================
// UTILITY FUNCTIONS
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

function getDefaultCover() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='280' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%23232937'/%3E%3Ctext x='100' y='140' font-family='Arial' font-size='80' fill='%239aa3b8' text-anchor='middle' dy='.3em'%3E📖%3C/text%3E%3C/svg%3E";
}
const DEFAULT_COVER = getDefaultCover();

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

// ================================================================
// SMART VOLUME NAME PARSER – Vol.X – Name – Special
// ================================================================
function parseVolumeName(fullTitle) {
    const match = fullTitle.match(/(Vol|Volume|V)\s*([\d.]+)/i);
    if (!match) {
        return {
            number: 0,
            mainName: fullTitle,
            special: null,
            displayName: fullTitle
        };
    }
    const num = parseFloat(match[2]);
    const index = match.index;
    const before = fullTitle.substring(0, index).trim();
    const after = fullTitle.substring(index + match[0].length).trim();

    let mainName = before.replace(/[-–—]\s*$/, '').trim();
    let special = after.replace(/^[-–—]\s*/, '').trim();

    let displayName = '';
    if (special) {
        displayName = `Vol.${formatVolNumber(num)} – ${mainName} – ${special}`;
    } else {
        displayName = `Vol.${formatVolNumber(num)} – ${mainName}`;
    }

    return {
        number: num,
        mainName: mainName,
        special: special || null,  // ensure null if empty
        displayName: displayName
    };
}

// ================================================================
// COVER MAPPING – Load and parse CSV from assets/
// ================================================================

async function loadCoverMapping() {
    try {
        console.log('📄 Attempting to load cover_mapping.csv...');
        const response = await fetch('assets/cover_mapping.csv');
        if (!response.ok) {
            console.warn('❌ cover_mapping.csv not found (HTTP ' + response.status + ').');
            csvLoadError = 'CSV file not found in assets/ folder.';
            return;
        }
        const text = await response.text();
        console.log('📄 CSV loaded, length:', text.length, 'bytes');
        coverMapping = parseCoverMappingCSV(text);
        console.log(`✅ Loaded ${Object.keys(coverMapping).length} cover mappings from CSV.`);
        csvLoadError = null;
    } catch (err) {
        console.warn('❌ Error loading cover mapping CSV:', err);
        csvLoadError = err.message;
    }
}

function parseCoverMappingCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
        console.warn('⚠️ cover_mapping.csv is empty or missing headers.');
        return {};
    }

    console.log('📄 CSV headers (raw):', lines[0]);
    console.log('📄 CSV first data row:', lines[1] || '(empty)');

    const headers = parseCSVRow(lines[0]);
    console.log('📄 Parsed headers:', headers);

    const map = {};

    const titleIdx = findHeaderIndex(headers, ['name ( eng )', 'name eng', 'english', 'title']);
    const latinIdx = findHeaderIndex(headers, ['latin', 'romaji']);
    const nonLatinIdx = findHeaderIndex(headers, ['non-latin', 'japanese', 'kanji']);
    const authorIdx = findHeaderIndex(headers, ['author']);
    const descIdx = findHeaderIndex(headers, ['description']);
    const coverIdx = findHeaderIndex(headers, ['cover (image file)', 'cover', 'image', 'cover_url']);

    console.log('📄 Column indices:', { titleIdx, latinIdx, nonLatinIdx, authorIdx, descIdx, coverIdx });

    if (titleIdx === -1) {
        console.warn('❌ CSV must have a "Name ( ENG )" (or "english") column. Found:', headers);
        return {};
    }

    if (coverIdx === -1) {
        console.warn('⚠️ CSV does not have a "Cover (image file)" column. Covers will use defaults.');
    }

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVRow(lines[i]);
        const title = cols[titleIdx]?.trim() || '';
        const author = cols[authorIdx]?.trim() || 'Unknown';
        const description = cols[descIdx]?.trim() || '';
        const latin = cols[latinIdx]?.trim() || '';
        const nonLatin = cols[nonLatinIdx]?.trim() || '';
        const image = cols[coverIdx]?.trim() || '';

        if (title) {
            map[title.toLowerCase()] = { author, description, latin, nonLatin, image };
        }
    }

    const sampleKeys = Object.keys(map).slice(0, 5);
    console.log('📄 Sample mappings:', sampleKeys.map(k => ({ key: k, value: map[k] })));

    return map;
}

function findHeaderIndex(headers, possibleNames) {
    for (const name of possibleNames) {
        const idx = headers.findIndex(h => h.toLowerCase().trim() === name);
        if (idx !== -1) return idx;
    }
    return -1;
}

function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < row.length) {
        const char = row[i];
        if (char === '"') {
            if (inQuotes && row[i + 1] === '"') {
                current += '"';
                i += 2;
            } else {
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    result.push(current.trim());
    return result;
}

function applyCoverMapping() {
    let updated = false;
    let matchedCount = 0;
    let unmatchedNovels = [];

    appData.novels.forEach(novel => {
        const title = novel.title.toLowerCase();
        if (coverMapping[title]) {
            matchedCount++;
            const data = coverMapping[title];
            if (data.author && novel.author !== data.author) { novel.author = data.author; updated = true; }
            if (data.description && novel.description !== data.description) { novel.description = data.description; updated = true; }
            if (data.latin) { novel.latin = data.latin; updated = true; }
            if (data.nonLatin) { novel.nonLatin = data.nonLatin; updated = true; }

            if (data.image) {
                let imageVal = data.image.trim();
                let fileId = null;

                if (imageVal.startsWith('http://') || imageVal.startsWith('https://')) {
                    if (novel.cover !== imageVal) {
                        novel.cover = imageVal;
                        updated = true;
                    }
                } else {
                    fileId = coverFileMap[imageVal] || coverFileMap[imageVal.toLowerCase()];

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
                        const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w300`;
                        if (novel.cover !== thumbnailUrl) {
                            novel.cover = thumbnailUrl;
                            novel.coverFileId = fileId;
                            updated = true;
                        }
                    } else {
                        console.warn(`⚠️ Cover not found for "${novel.title}": "${imageVal}"`);
                        if (novel.cover !== DEFAULT_COVER) {
                            novel.cover = DEFAULT_COVER;
                            updated = true;
                        }
                        unmatchedNovels.push({ title: novel.title, image: imageVal });
                    }
                }
            } else {
                if (novel.cover !== DEFAULT_COVER) {
                    novel.cover = DEFAULT_COVER;
                    updated = true;
                }
            }
        }
    });

    console.log(`📄 Matched ${matchedCount} of ${appData.novels.length} novels with CSV entries.`);
    if (unmatchedNovels.length > 0) {
        console.warn('⚠️ Cover not found for:', unmatchedNovels);
        console.warn('💡 Available cover filenames:', Object.keys(coverFileMap).slice(0, 20));
    }
    if (updated) {
        saveData(appData);
        renderAll();
        console.log('✅ Applied cover/author/description/latin mappings from CSV.');
    } else {
        console.log('ℹ️ No changes needed from CSV mapping.');
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
        console.log('✅ Updated statuses based on history.');
    }
}

// ================================================================
// PDF CACHE – IndexedDB
// ================================================================
const DB_NAME = 'NovelPdfCache';
const STORE_NAME = 'pdfs';
let db = null;

function openCache() {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
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

// ================================================================
// TOAST
// ================================================================
let toastTimer;

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

// ================================================================
// TOKEN PERSISTENCE
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

// ================================================================
// GOOGLE API LOADING
// ================================================================
let gapiInited = false, gisInited = false, tokenClient = null;

function loadGoogleApis() {
    const check = setInterval(() => {
        if (typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts) {
            clearInterval(check);
            gapi.load('client', () => {
                gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] })
                    .then(() => { gapiInited = true; console.log('GAPI ready'); checkBothReady(); })
                    .catch(e => { console.error('GAPI init error:', e); showToast('GAPI init error', 'error'); });
            });
            try {
                tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '' });
                gisInited = true;
                console.log('GIS ready');
                checkBothReady();
            } catch (e) { console.error('GIS init error:', e); showToast('GIS init error', 'error'); }
        }
    }, 300);
    setTimeout(() => clearInterval(check), 15000);
}

function checkBothReady() {
    if (gapiInited && gisInited) {
        const btn = document.getElementById('driveConnectBtn');
        if (btn) { btn.disabled = false; document.getElementById('driveStatus').textContent = 'Connect Drive'; }
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
        if (resp.error) { showToast('Auth failed: ' + resp.error, 'error'); return; }
        if (resp.access_token) saveToken(resp);
        document.getElementById('driveStatus').textContent = 'Connected ✅';
        const btn = document.getElementById('driveConnectBtn');
        if (btn) btn.style.borderColor = '#4ade80';
        showToast('Connected to Google Drive!', 'success');
        await listDriveFiles();
    };
    if (gapi.client.getToken() === null) tokenClient.requestAccessToken({ prompt: 'consent' });
    else tokenClient.requestAccessToken({ prompt: '' });
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
            driveFiles = [];
            renderAll();
        });
    }
}

// ================================================================
// DRIVE API
// ================================================================

async function findFolderId(folderPath) {
    const parts = folderPath.split('/').filter(p => p.length > 0);
    let parent = 'root';
    for (const part of parts) {
        const q = `name='${part}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        try {
            const res = await gapi.client.drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
            const files = res.result.files;
            if (files && files.length > 0) { parent = files[0].id; }
            else return null;
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

async function listDriveFiles() {
    const pathDisplay = document.getElementById('drivePathDisplay');
    if (pathDisplay) pathDisplay.textContent = '📁 Searching...';

    try {
        const coverPaths = [
            'file/PDF/Novel Cover',
            'file/pdf/Novel Cover',
            'file/PDF/novel cover',
            'file/pdf/novel cover',
            'Novel Cover',
            'novel cover'
        ];

        coverFileMap = {};
        let coverFolderFound = false;

        for (const coverPath of coverPaths) {
            const coverFolderId = await findFolderId(coverPath);
            if (coverFolderId) {
                const coverFiles = await listFilesInFolder(coverFolderId);
                coverFiles.forEach(file => {
                    coverFileMap[file.name] = file.id;
                    coverFileMap[file.name.toLowerCase()] = file.id;
                });
                console.log(`📸 Found ${coverFiles.length} cover images in folder: "${coverPath}"`);
                console.log('📸 Sample cover filenames:', coverFiles.slice(0, 10).map(f => f.name));
                coverFolderFound = true;
                break;
            }
        }

        if (!coverFolderFound) {
            console.warn('ℹ️ Novel Cover folder not found in any of these paths:', coverPaths);
            console.warn('💡 Please create a folder "Novel Cover" inside your "file/PDF/" folder.');
        }

        const rootId = await findFolderId('file/pdf/j-novel');
        if (!rootId) {
            if (pathDisplay) pathDisplay.textContent = '📁 /file/pdf/j-novel/ (not found)';
            showToast('Folder "j-novel" not found.', 'error');
            return;
        }
        if (pathDisplay) pathDisplay.textContent = '📁 /file/pdf/j-novel/';

        const folders = await listSubfolders(rootId);
        if (folders.length > 0) {
            console.log(`📂 Found ${folders.length} novel folders`);
            const novelData = [];
            for (const folder of folders) {
                const files = await listFilesInFolder(folder.id);
                const validFiles = files.filter(f => {
                    if (f.mimeType === 'application/vnd.google-apps.folder') return false;
                    const isPdf = f.mimeType === 'application/pdf' || f.name.endsWith('.pdf');
                    const isText = f.mimeType === 'text/plain' || f.name.endsWith('.txt');
                    return isPdf || isText;
                });
                if (validFiles.length === 0) continue;
                novelData.push({
                    title: folder.name,
                    volumes: validFiles.map(f => ({
                        number: 0,
                        title: f.name.replace(/\.[^.]+$/, ''),
                        fileId: f.id,
                        mimeType: f.mimeType,
                        modifiedTime: f.modifiedTime || null,
                    }))
                });
            }
            syncNovelsFromFolders(novelData);
        } else {
            const files = await listFilesInFolder(rootId);
            const validFiles = files.filter(f => {
                if (f.mimeType === 'application/vnd.google-apps.folder') return false;
                const isPdf = f.mimeType === 'application/pdf' || f.name.endsWith('.pdf');
                const isText = f.mimeType === 'text/plain' || f.name.endsWith('.txt');
                return isPdf || isText;
            });
            if (validFiles.length > 0) syncNovelsFromFlat(validFiles);
            else showToast('No PDF/TXT files found.', 'info');
        }

        applyCoverMapping();
        updateStatuses();
        cleanupOrphanNovels();

        if (csvLoadError) {
            console.warn('⚠️ CSV loading issue:', csvLoadError);
        } else if (Object.keys(coverMapping).length === 0) {
            console.warn('⚠️ CSV loaded but no mappings found. Check column headers and data.');
        }

    } catch (err) {
        console.error('Drive list error:', err);
        if (pathDisplay) pathDisplay.textContent = '📁 /file/pdf/j-novel/ (error)';
        showToast('Error: ' + err.message, 'error');
    }
}

function cleanupOrphanNovels() {
    let changed = false;
    const toRemove = [];
    appData.novels.forEach(novel => {
        if (novel.fromDrive && novel.volumes.length === 0) {
            toRemove.push(novel.id);
            changed = true;
        }
    });
    if (toRemove.length > 0) {
        appData.novels = appData.novels.filter(n => !toRemove.includes(n.id));
        appData.history = appData.history.filter(h => !toRemove.includes(h.novelId));
        saveData(appData);
        console.log(`🗑️ Removed ${toRemove.length} orphaned novels (no volumes).`);
    }
}

// ================================================================
// SYNC FUNCTIONS – WITH CORRECT SORTING (NORMAL FIRST, THEN SPECIAL)
// ================================================================

function syncNovelsFromFolders(novelData) {
    let updated = false;
    for (const data of novelData) {
        const existing = appData.novels.find(n => n.title === data.title);
        let latestModified = null;

        const newVols = data.volumes.map((v) => {
            const fullTitle = v.title || '';
            const parsed = parseVolumeName(fullTitle);
            const num = parsed.number;
            const mainName = parsed.mainName;
            const displayName = parsed.displayName;

            if (v.modifiedTime) {
                const modDate = new Date(v.modifiedTime);
                if (!latestModified || modDate > latestModified) latestModified = modDate;
            }
            return {
                number: num,
                title: mainName,
                displayName: displayName,
                special: parsed.special, // store special flag for sorting
                fileId: v.fileId,
                mimeType: v.mimeType,
                modifiedTime: v.modifiedTime || null
            };
        });

        if (existing) {
            const existingVols = existing.volumes;
            const newFileIds = new Set(newVols.map(v => v.fileId));
            const matchedIds = new Set();
            let changed = false;

            newVols.forEach(newVol => {
                const existingVol = existingVols.find(v => v.fileId === newVol.fileId);
                if (existingVol) {
                    matchedIds.add(newVol.fileId);
                    if (existingVol.number !== newVol.number || existingVol.title !== newVol.title || existingVol.displayName !== newVol.displayName) {
                        existingVol.number = newVol.number;
                        existingVol.title = newVol.title;
                        existingVol.displayName = newVol.displayName;
                        existingVol.special = newVol.special;
                        existingVol.modifiedTime = newVol.modifiedTime;
                        changed = true;
                    }
                }
            });

            newVols.forEach(newVol => {
                if (!matchedIds.has(newVol.fileId)) {
                    existingVols.push(newVol);
                    changed = true;
                    appData.history.push({
                        novelId: existing.id,
                        volumeIndex: existingVols.length - 1,
                        date: new Date().toISOString()
                    });
                }
            });

            const removedVols = existingVols.filter(v => !newFileIds.has(v.fileId));
            if (removedVols.length > 0) {
                appData.history = appData.history.filter(h => {
                    const vol = existingVols.find(v => v.fileId === h.fileId);
                    return !removedVols.includes(vol);
                });
                removedVols.forEach(removed => {
                    const idx = existingVols.indexOf(removed);
                    if (idx > -1) existingVols.splice(idx, 1);
                });
                changed = true;
                console.log(`🗑️ Removed ${removedVols.length} volume(s) from "${data.title}"`);
            }

            if (changed) {
                // ✅ CORRECT SORT: normal (special==null) first, then special, each sorted by number
                existingVols.sort((a, b) => {
                    if (a.special && !b.special) return 1;
                    if (!a.special && b.special) return -1;
                    return a.number - b.number;
                });
                if (latestModified) existing.driveModifiedDate = latestModified.toISOString();
                updated = true;
                console.log(`✅ Synced "${data.title}"`);
            }
        } else {
            // ✅ CORRECT SORT for new novels too
            newVols.sort((a, b) => {
                if (a.special && !b.special) return 1;
                if (!a.special && b.special) return -1;
                return a.number - b.number;
            });
            appData.novels.push({
                id: generateId(),
                title: data.title,
                author: 'Unknown',
                description: `Auto-imported from Drive (${newVols.length} volumes)`,
                cover: DEFAULT_COVER,
                coverFileId: null,
                status: 'not-read',
                volumes: newVols,
                addedAt: new Date().toISOString(),
                fromDrive: true,
                driveModifiedDate: latestModified ? latestModified.toISOString() : null,
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

function syncNovelsFromFlat(files) {
    const groups = {};
    files.forEach(file => {
        let name = file.name.replace(/\.[^.]+$/, '');
        let novelName = name.replace(/[-–—]\s*(?:Vol|Volume|V)\s*\d+\.?\d*/i, '').trim() || name;
        if (!groups[novelName]) groups[novelName] = [];
        groups[novelName].push(file);
    });
    console.log('📊 Groups from flat files:', Object.keys(groups));
    let updated = false;
    for (const [title, fileList] of Object.entries(groups)) {
        const existing = appData.novels.find(n => n.title === title);
        let latestModified = null;

        const newVols = fileList.map((f) => {
            const fullTitle = f.name.replace(/\.[^.]+$/, '');
            const parsed = parseVolumeName(fullTitle);
            const num = parsed.number;
            const mainName = parsed.mainName;
            const displayName = parsed.displayName;

            if (f.modifiedTime) {
                const modDate = new Date(f.modifiedTime);
                if (!latestModified || modDate > latestModified) latestModified = modDate;
            }
            return {
                number: num,
                title: mainName,
                displayName: displayName,
                special: parsed.special,
                fileId: f.id,
                mimeType: f.mimeType,
                modifiedTime: f.modifiedTime || null
            };
        });

        if (existing) {
            const existingVols = existing.volumes;
            const newFileIds = new Set(newVols.map(v => v.fileId));
            const matchedIds = new Set();
            let changed = false;

            newVols.forEach(newVol => {
                const existingVol = existingVols.find(v => v.fileId === newVol.fileId);
                if (existingVol) {
                    matchedIds.add(newVol.fileId);
                    if (existingVol.number !== newVol.number || existingVol.title !== newVol.title || existingVol.displayName !== newVol.displayName) {
                        existingVol.number = newVol.number;
                        existingVol.title = newVol.title;
                        existingVol.displayName = newVol.displayName;
                        existingVol.special = newVol.special;
                        existingVol.modifiedTime = newVol.modifiedTime;
                        changed = true;
                    }
                }
            });

            newVols.forEach(newVol => {
                if (!matchedIds.has(newVol.fileId)) {
                    existingVols.push(newVol);
                    changed = true;
                    appData.history.push({
                        novelId: existing.id,
                        volumeIndex: existingVols.length - 1,
                        date: new Date().toISOString()
                    });
                }
            });

            const removedVols = existingVols.filter(v => !newFileIds.has(v.fileId));
            if (removedVols.length > 0) {
                appData.history = appData.history.filter(h => {
                    const vol = existingVols.find(v => v.fileId === h.fileId);
                    return !removedVols.includes(vol);
                });
                removedVols.forEach(removed => {
                    const idx = existingVols.indexOf(removed);
                    if (idx > -1) existingVols.splice(idx, 1);
                });
                changed = true;
                console.log(`🗑️ Removed ${removedVols.length} volume(s) from "${title}"`);
            }

            if (changed) {
                existingVols.sort((a, b) => {
                    if (a.special && !b.special) return 1;
                    if (!a.special && b.special) return -1;
                    return a.number - b.number;
                });
                if (latestModified) existing.driveModifiedDate = latestModified.toISOString();
                updated = true;
                console.log(`✅ Synced "${title}"`);
            }
        } else {
            newVols.sort((a, b) => {
                if (a.special && !b.special) return 1;
                if (!a.special && b.special) return -1;
                return a.number - b.number;
            });
            appData.novels.push({
                id: generateId(),
                title,
                author: 'Unknown',
                description: `Auto-imported from Drive (${newVols.length} volumes)`,
                cover: DEFAULT_COVER,
                coverFileId: null,
                status: 'not-read',
                volumes: newVols,
                addedAt: new Date().toISOString(),
                fromDrive: true,
                driveModifiedDate: latestModified ? latestModified.toISOString() : null,
            });
            updated = true;
            console.log(`✅ Added new novel: "${title}"`);
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
// RENDER FUNCTIONS
// ================================================================

let currentSort = 'az';

function sortNovels(novels, sortType) {
    const sorted = [...novels];
    switch (sortType) {
        case 'az': return sorted.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
        case 'za': return sorted.sort((a, b) => b.title.toLowerCase().localeCompare(a.title.toLowerCase()));
        case 'newest': return sorted.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
        case 'oldest': return sorted.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
        default: return sorted;
    }
}

function renderNovelGrid() {
    const container = document.getElementById('novelGridContainer');
    if (!container) return;
    renderStats();

    const sortedNovels = sortNovels(appData.novels, currentSort);
    if (sortedNovels.length === 0) {
        container.innerHTML = '<div class="empty-state">No novels found. Connect Drive to automatically import your library.</div>';
        return;
    }

    container.innerHTML = sortedNovels.map(n => {
        const volCount = (n.volumes || []).length;
        const maxVolumesToShow = 2;
        const showVolumes = n.volumes.slice(0, maxVolumesToShow);
        const remaining = volCount - maxVolumesToShow;

        const volList = showVolumes.map((v, idx) => {
            const hasFile = v.fileId && v.fileId.length > 0;
            const displayName = v.displayName || `Vol.${formatVolNumber(v.number)} – ${v.title || ''}`;
            const clickAttr = hasFile ? `onclick="event.stopPropagation(); window.openReader('${n.id}', ${idx})"` : '';
            const cursor = hasFile ? 'cursor:pointer;' : 'cursor:default;';
            return `
                <div class="vol-row" style="${cursor}" ${clickAttr}>
                    <span class="vol-name">${escapeHtml(displayName)}</span>
                    ${hasFile ? `<button class="btn-read" onclick="event.stopPropagation(); window.openReader('${n.id}', ${idx})">Read</button>` : `<span class="no-file">No file</span>`}
                </div>
            `;
        }).join('');

        let moreLink = '';
        if (remaining > 0) {
            moreLink = `
                <div class="more-link">
                    <a href="detail.html?id=${n.id}">+ ${remaining} more volume${remaining>1?'s':''} →</a>
                </div>
            `;
        }

        const coverSrc = n.cover || DEFAULT_COVER;
        const statusColor = n.status === 'reading' ? '#4ade80' : '#9aa3b8';
        const statusLabel = n.status === 'reading' ? '● Reading' : '○ Not read';

        return `
            <div class="novel-grid-item" onclick="window.location.href='detail.html?id=${n.id}'">
                <div class="card-top">
                    <div class="cover-wrapper">
                        <img src="${coverSrc}" alt="${escapeHtml(n.title)}" loading="lazy" onerror="this.src='${DEFAULT_COVER}'; console.warn('⚠️ Image failed to load for: ${escapeHtml(n.title)}')">
                    </div>
                    <div class="info">
                        <div class="title-area">
                            <h4>${escapeHtml(n.title)}</h4>
                            <div class="author">${escapeHtml(n.author)}</div>
                            <div class="vol-count">${volCount} volume${volCount!==1?'s':''}</div>
                        </div>
                        <div class="meta-row">
                            <span class="status-badge" style="color:${statusColor};">${statusLabel}</span>
                            ${n.fromDrive ? '<span class="drive-badge"><i class="fas fa-cloud"></i> Drive</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="volume-list">
                    ${volList}
                    ${moreLink}
                </div>
            </div>
        `;
    }).join('');
}

function renderCurrentlyReading() {
    const section = document.getElementById('currentlyReadingSection');
    const container = document.getElementById('currentlyReadingContainer');
    if (!section || !container) return;

    const reading = appData.novels.filter(n => n.status === 'reading' && getLastReadInfo(n.id) !== null);
    const sorted = reading.sort((a, b) => {
        const lastA = getLastReadInfo(a.id), lastB = getLastReadInfo(b.id);
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
        const volCount = (n.volumes || []).length;
        const lastInfo = getLastReadInfo(n.id);
        const lastDate = lastInfo ? formatDate(lastInfo.date) : 'Not read yet';
        const coverSrc = n.cover || DEFAULT_COVER;
        return `
            <div class="reading-card" onclick="window.location.href='detail.html?id=${n.id}'">
                <img src="${coverSrc}" alt="${escapeHtml(n.title)}" loading="lazy" onerror="this.style.display='none'">
                <h4>${escapeHtml(n.title)}</h4>
                <div class="author">${escapeHtml(n.author)}</div>
                <div class="volume-count">${volCount} volume${volCount!==1?'s':''}</div>
                <div class="read-date"><i class="fas fa-clock"></i> ${lastInfo ? lastDate : 'Not read'}</div>
            </div>
        `;
    }).join('');
}

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
        const title = novel ? novel.title : 'Unknown novel';
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

function renderStats() {
    const novels = appData.novels;
    const total = novels.length;
    let volumes = 0, reading = 0;
    novels.forEach(n => {
        volumes += (n.volumes || []).length;
        if (n.status === 'reading') reading++;
    });
    const elNov = document.getElementById('statNovels');
    const elVol = document.getElementById('statVolumes');
    const elRead = document.getElementById('statReading');
    if (elNov) elNov.textContent = total;
    if (elVol) elVol.textContent = volumes;
    if (elRead) elRead.textContent = reading;
}

function renderAll() {
    renderStats();
    renderCurrentlyReading();
    renderNovelGrid();
}

// ================================================================
// READING HISTORY HELPERS
// ================================================================

function getLastReadInfo(novelId) {
    const entries = appData.history.filter(h => h.novelId === novelId);
    if (entries.length === 0) return null;
    const latest = entries.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
    return { volumeIndex: latest.volumeIndex, date: latest.date };
}

function getVolumeNumber(novel, volumeIndex) {
    if (!novel || !novel.volumes || volumeIndex >= novel.volumes.length) return null;
    return novel.volumes[volumeIndex].number || volumeIndex + 1;
}

// ================================================================
// READER
// ================================================================

let currentNovelId = null, currentVolumeIndex = null;

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
    const title = `${novel.title} – Vol.${formatVolNumber(vol.number)}`;
    document.getElementById('readerTitle').textContent = vol.title ? title + ' – ' + vol.title : title;
    document.getElementById('readerBody').innerHTML = '<div class="loading">Loading file...</div>';
    document.getElementById('readerModal').classList.add('active');
    fetchFileContent(fileId);
};

document.getElementById('readerClose')?.addEventListener('click', () => document.getElementById('readerModal').classList.remove('active'));
document.getElementById('readerModal')?.addEventListener('click', e => { if (e.target === this) this.classList.remove('active'); });

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
        const mimeType = meta.result.mimeType, name = meta.result.name;
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
                            if (resp.error) { showToast('Token refresh failed', 'error'); resolve(); return; }
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
// DETAIL PAGE
// ================================================================

let detailNovelId = null;

function loadDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) { showToast('No novel specified', 'error'); window.location.href = 'index.html'; return; }
    detailNovelId = id;
    renderNovelDetail(id);
}

function renderNovelDetail(novelId) {
    const novel = appData.novels.find(n => n.id === novelId);
    if (!novel) { showToast('Novel not found', 'error'); window.location.href = 'index.html'; return; }

    document.getElementById('detailTitle').textContent = novel.title;

    const coverSrc = novel.cover || DEFAULT_COVER;
    document.getElementById('detailCover').src = coverSrc;
    document.getElementById('detailCover').onerror = function() {
        this.src = DEFAULT_COVER;
    };

    let subtitle = '';
    if (novel.nonLatin && novel.latin) {
        subtitle = `${novel.nonLatin} – ${novel.latin}`;
    } else if (novel.nonLatin) {
        subtitle = novel.nonLatin;
    } else if (novel.latin) {
        subtitle = novel.latin;
    } else {
        subtitle = 'by ' + (novel.author || 'Unknown');
    }
    document.getElementById('detailAuthor').textContent = subtitle;

    document.getElementById('detailDescription').textContent = novel.description || 'No description available.';

    const statusText = novel.status === 'reading' ? 'Reading' : 'Not read';
    const volCount = (novel.volumes || []).length;
    const statusDisplay = `${volCount} volume${volCount !== 1 ? 's' : ''} – ${statusText}`;
    document.getElementById('detailStatus').textContent = statusDisplay;
    document.getElementById('detailStatus').className = 'status-badge ' + (novel.status || 'not-read');
    document.getElementById('detailVolCount').textContent = '';

    renderDetailVolumes(novel);
}

function renderDetailVolumes(novel) {
    const container = document.getElementById('detailVolumesContainer');
    const volumes = novel.volumes || [];
    if (volumes.length === 0) {
        container.innerHTML = '<div class="empty-state">No volumes yet.</div>';
        return;
    }
    container.innerHTML = volumes.map((v, idx) => {
        const hasFile = v.fileId && v.fileId.length > 0;
        const fileId = extractFileId(v.fileId);
        const isValidFile = hasFile && fileId;
        const displayName = v.displayName || `Vol.${formatVolNumber(v.number)} – ${v.title || ''}`;
        const clickHandler = isValidFile ? `onclick="window.openReader('${novel.id}', ${idx})"` : '';
        const cursorStyle = isValidFile ? 'cursor:pointer;' : 'cursor:default;';
        return `
            <div class="history-item" style="${cursorStyle}" ${clickHandler}>
                <div style="flex:1; min-width:0;">
                    <strong style="display:block; overflow-wrap:break-word; word-break:break-word; line-height:1.4;">${escapeHtml(displayName)}</strong>
                    ${!isValidFile ? '<span style="font-size:0.7rem; color:#f87171;">⚠️ No valid file</span>' : ''}
                </div>
                ${isValidFile ? `<span style="color:var(--accent); font-size:0.75rem;"><i class="fas fa-play"></i> Read</span>` : ''}
            </div>
        `;
    }).join('');
}

// ================================================================
// PAGE INIT
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    const page = window.location.pathname.split('/').pop() || 'index.html';

    loadCoverMapping().then(() => {
        if (appData.novels.length > 0) {
            applyCoverMapping();
            renderAll();
        }
    });

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
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 820) closeSidebar();
        });
    });

    if (page === 'index.html' || page === '') {
        renderAll();
        document.getElementById('sortSelect')?.addEventListener('change', function() {
            currentSort = this.value;
            renderNovelGrid();
        });
        document.getElementById('forceReimportBtn')?.addEventListener('click', function() {
            if (gapi.client && gapi.client.getToken && gapi.client.getToken()) listDriveFiles();
            else showToast('Connect Drive first', 'error');
        });
    }

    if (page === 'history.html') {
        renderFullHistory();
    }

    if (page === 'detail.html') {
        loadDetailPage();
    }

    document.getElementById('driveConnectBtn')?.addEventListener('click', function() {
        const status = document.getElementById('driveStatus');
        if (status && status.textContent === 'Connected ✅') handleSignoutClick();
        else handleAuthClick();
    });
    document.getElementById('driveRefreshBtn')?.addEventListener('click', refreshDriveConnection);

    document.getElementById('searchInput')?.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        document.querySelectorAll('#novelGridContainer .novel-grid-item').forEach(item => {
            const title = item.querySelector('h4')?.textContent?.toLowerCase() || '';
            const author = item.querySelector('.author')?.textContent?.toLowerCase() || '';
            item.style.display = (title.includes(q) || author.includes(q)) ? '' : 'none';
        });
        const visible = Array.from(document.querySelectorAll('#novelGridContainer .novel-grid-item')).filter(el => el.style.display !== 'none');
        const countEl = document.getElementById('novelCount');
        if (countEl) countEl.textContent = visible.length + ' novels';
    });

    loadGoogleApis();
});

// ================================================================
// GLOBAL EXPOSURE
// ================================================================
window.openReader = openReader;
window.clearPdfCache = clearPdfCache;
