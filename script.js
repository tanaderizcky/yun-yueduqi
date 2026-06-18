// ============================================================
// CONFIG – REPLACE WITH YOUR REAL CLIENT ID
// ============================================================
const CLIENT_ID = '855351743150-catri9qskphur736modkajoo76h93kbb.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

// ============================================================
// DATA LAYER
// ============================================================
const STORAGE_KEY = 'novelLibraryData';
let appData = loadData();
let driveFiles = [];

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

// ============================================================
// UTILITY
// ============================================================
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

// ============================================================
// COVER UPLOAD
// ============================================================
function handleCoverUpload(file) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve('');
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e.target.error);
        reader.readAsDataURL(file);
    });
}

// ============================================================
// UPDATE NOVEL MODIFIED DATE
// ============================================================
function updateNovelModifiedDate(novelId) {
    const novel = appData.novels.find(n => n.id === novelId);
    if (!novel) return;
    novel.driveModifiedDate = new Date().toISOString();
    saveData(appData);
}

// ============================================================
// PDF CACHE (IndexedDB)
// ============================================================
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
    if (!confirm('Clear all cached PDFs? This will free up storage.')) return;
    try {
        const db = await openCache();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => showToast('Cache cleared!', 'success');
        tx.onerror = () => showToast('Failed to clear cache.', 'error');
    } catch (e) {
        showToast('Error clearing cache.', 'error');
    }
}

// ============================================================
// TOAST
// ============================================================
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

// ============================================================
// TOKEN PERSISTENCE
// ============================================================
function saveToken(token) {
    if (token) {
        localStorage.setItem('drive_token', JSON.stringify(token));
    } else {
        localStorage.removeItem('drive_token');
    }
}

function restoreToken() {
    const tokenData = localStorage.getItem('drive_token');
    if (tokenData) {
        try {
            const token = JSON.parse(tokenData);
            gapi.client.setToken(token);
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

// ============================================================
// GOOGLE API LOADING
// ============================================================
let gapiInited = false;
let gisInited = false;
let tokenClient = null;

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
                    callback: '',
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
            const status = document.getElementById('driveStatus');
            if (status) status.textContent = 'Connect Drive';
        }

        if (restoreToken()) {
            const status = document.getElementById('driveStatus');
            if (status) status.textContent = 'Connected ✅';
            const btn = document.getElementById('driveConnectBtn');
            if (btn) btn.style.borderColor = '#4ade80';
            listDriveFiles();
        }
    }
}

function refreshDriveConnection() {
    if (gapiInited && gisInited) {
        if (gapi.client && gapi.client.getToken && gapi.client.getToken()) {
            const status = document.getElementById('driveStatus');
            if (status) status.textContent = 'Connected ✅';
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

// ============================================================
// AUTH HANDLERS
// ============================================================
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
        if (resp.access_token) {
            saveToken(resp);
        }
        const status = document.getElementById('driveStatus');
        if (status) status.textContent = 'Connected ✅';
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
            const status = document.getElementById('driveStatus');
            if (status) status.textContent = 'Connect Drive';
            const btn = document.getElementById('driveConnectBtn');
            if (btn) btn.style.borderColor = '';
            showToast('Disconnected from Drive', 'info');
            driveFiles = [];
            renderAll();
        });
    }
}

// ============================================================
// DRIVE API
// ============================================================
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
                console.log(`Found folder "${part}" with ID: ${parent}`);
            } else {
                console.log(`Folder "${part}" not found`);
                return null;
            }
        } catch (err) {
            console.error('Error finding folder:', err);
            return null;
        }
    }
    return parent;
}

async function listSubfolders(parentId) {
    const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await gapi.client.drive.files.list({
        q,
        fields: 'files(id, name)',
        pageSize: 100,
    });
    return res.result.files || [];
}

async function listFilesInFolder(folderId) {
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await gapi.client.drive.files.list({
        q,
        fields: 'files(id, name, mimeType, modifiedTime)',
        pageSize: 100,
    });
    return res.result.files || [];
}

async function listDriveFiles() {
    const pathDisplay = document.getElementById('drivePathDisplay');
    if (pathDisplay) pathDisplay.textContent = '📁 Searching...';
    try {
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
                console.log(`  📄 Folder "${folder.name}" has ${validFiles.length} valid files:`, validFiles.map(f => f.name));
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
            console.log(`📄 Found ${validFiles.length} files in root:`, validFiles.map(f => f.name));
            if (validFiles.length > 0) {
                syncNovelsFromFlat(validFiles);
            } else {
                showToast('No PDF/TXT files found.', 'info');
            }
        }
    } catch (err) {
        console.error('Drive list error:', err);
        if (pathDisplay) pathDisplay.textContent = '📁 /file/pdf/j-novel/ (error)';
        showToast('Error: ' + err.message, 'error');
    }
}

function syncNovelsFromFolders(novelData) {
    let updated = false;
    for (const data of novelData) {
        const existing = appData.novels.find(n => n.title === data.title);
        if (existing) {
            console.log(`⏭️ Novel "${data.title}" already exists, skipping.`);
            continue;
        }
        let latestModified = null;
        const vols = data.volumes.map((v, idx) => {
            let num = idx + 1;
            const match = v.title.match(/Vol\s*(\d+)|Volume\s*(\d+)|V\s*(\d+)/i);
            if (match) {
                num = parseInt(match[1] || match[2] || match[3]) || idx + 1;
            }
            if (v.modifiedTime) {
                const modDate = new Date(v.modifiedTime);
                if (!latestModified || modDate > latestModified) {
                    latestModified = modDate;
                }
            }
            return {
                number: num,
                title: v.title,
                fileId: v.fileId,
                mimeType: v.mimeType,
                modifiedTime: v.modifiedTime || null,
            };
        });
        vols.sort((a, b) => a.number - b.number);
        appData.novels.push({
            id: generateId(),
            title: data.title,
            author: 'Unknown',
            description: `Auto-imported from Drive (${vols.length} volumes)`,
            cover: DEFAULT_COVER,
            status: 'reading',
            volumes: vols,
            addedAt: new Date().toISOString(),
            fromDrive: true,
            driveModifiedDate: latestModified ? latestModified.toISOString() : null,
        });
        updated = true;
        console.log(`✅ Added novel: "${data.title}" with ${vols.length} volumes, latest modified: ${latestModified}`);
    }
    if (updated) {
        saveData(appData);
        renderAll();
        showToast('Imported novels from Drive!', 'success');
    } else {
        showToast('No new novels to import.', 'info');
    }
}

function syncNovelsFromFlat(files) {
    const groups = {};
    files.forEach(file => {
        let name = file.name.replace(/\.[^.]+$/, '');
        let novelName = name.replace(/[-–—]\s*(?:Vol|Volume|V)\s*\d+/i, '').trim() || name;
        if (!groups[novelName]) groups[novelName] = [];
        groups[novelName].push(file);
    });
    console.log('📊 Groups from flat files:', Object.keys(groups));
    let updated = false;
    for (const [title, fileList] of Object.entries(groups)) {
        if (appData.novels.some(n => n.title === title)) {
            console.log(`⏭️ Novel "${title}" already exists, skipping.`);
            continue;
        }
        let latestModified = null;
        const volumes = fileList.map((f, i) => {
            let num = i + 1;
            const m = f.name.match(/Vol\s*(\d+)|Volume\s*(\d+)|V\s*(\d+)/i);
            if (m) num = parseInt(m[1] || m[2] || m[3]) || i + 1;
            if (f.modifiedTime) {
                const modDate = new Date(f.modifiedTime);
                if (!latestModified || modDate > latestModified) {
                    latestModified = modDate;
                }
            }
            return {
                number: num,
                title: f.name.replace(/\.[^.]+$/, ''),
                fileId: f.id,
                mimeType: f.mimeType,
                modifiedTime: f.modifiedTime || null,
            };
        });
        volumes.sort((a, b) => a.number - b.number);
        appData.novels.push({
            id: generateId(),
            title,
            author: 'Unknown',
            description: `Auto-imported from Drive (${volumes.length} volumes)`,
            cover: DEFAULT_COVER,
            status: 'reading',
            volumes: volumes,
            addedAt: new Date().toISOString(),
            fromDrive: true,
            driveModifiedDate: latestModified ? latestModified.toISOString() : null,
        });
        updated = true;
        console.log(`✅ Added novel: "${title}" with ${volumes.length} volumes, latest modified: ${latestModified}`);
    }
    if (updated) {
        saveData(appData);
        renderAll();
        showToast('Imported novels from Drive!', 'success');
    }
}

// ============================================================
// NOVEL CRUD OPERATIONS
// ============================================================
function deleteNovel(novelId) {
    if (!confirm('Delete this novel and all its volumes?')) return;
    appData.novels = appData.novels.filter(n => n.id !== novelId);
    appData.history = appData.history.filter(h => h.novelId !== novelId);
    saveData(appData);
    renderAll();
    showToast('Novel deleted.', 'info');
}

function editNovel(novelId) {
    const novel = appData.novels.find(n => n.id === novelId);
    if (!novel) return showToast('Novel not found', 'error');
    document.getElementById('editNovelId').value = novel.id;
    document.getElementById('formTitleInput').value = novel.title;
    document.getElementById('formAuthorInput').value = novel.author;
    document.getElementById('formDescriptionInput').value = novel.description || '';
    document.getElementById('formCoverInput').value = novel.cover || '';
    document.getElementById('formStatusInput').value = novel.status || 'reading';
    document.getElementById('formTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Novel';
    document.getElementById('formSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Novel';
    document.getElementById('formCoverFile').value = '';
    const container = document.getElementById('formVolumesContainer');
    container.innerHTML = '';
    if (novel.volumes && novel.volumes.length > 0) {
        novel.volumes.forEach((v, idx) => {
            const entry = createVolumeEntry(v.number || idx + 1, v.title || '', v.fileId || '');
            container.appendChild(entry);
        });
    } else {
        container.appendChild(createVolumeEntry(1, '', ''));
    }
    document.getElementById('novelFormContainer').style.display = 'block';
    document.getElementById('novelFormContainer').scrollIntoView({ behavior: 'smooth' });
    bindFormVolumeEvents();
}

// ============================================================
// VOLUME ENTRY WITH FILE UPLOAD
// ============================================================
function createVolumeEntry(num, title, fileId) {
    const div = document.createElement('div');
    div.className = 'volume-entry';
    div.innerHTML = `
        <div class="form-row">
            <div class="form-group" style="flex:0 0 80px;">
                <label>#</label>
                <input type="number" class="form-vol-number" value="${num}" min="1" required>
            </div>
            <div class="form-group" style="flex:2;">
                <label>Title</label>
                <input type="text" class="form-vol-title" value="${escapeHtml(title)}" placeholder="Volume title">
            </div>
            <div class="form-group" style="flex:2;">
                <label>File ID / Link</label>
                <input type="text" class="form-vol-fileid" value="${escapeHtml(fileId)}" placeholder="e.g. 1ABC123DEF456">
            </div>
            <div class="form-group" style="flex:1;">
                <label>Or Upload File</label>
                <input type="file" class="form-vol-file" accept=".pdf,.txt">
            </div>
            <div class="form-group" style="flex:0 0 auto;">
                <label>&nbsp;</label>
                <button type="button" class="btn-remove-volume form-remove-vol">✕</button>
            </div>
        </div>
    `;
    return div;
}

function bindFormVolumeEvents() {
    document.querySelectorAll('.form-remove-vol').forEach(btn => {
        btn.onclick = function() {
            const entries = document.querySelectorAll('#formVolumesContainer .volume-entry');
            if (entries.length > 1) {
                this.closest('.volume-entry').remove();
            } else {
                showToast('Need at least one volume', 'error');
            }
        };
    });
}

// ============================================================
// SORTING
// ============================================================
let currentSort = 'az';

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

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderNovelGrid() {
    const container = document.getElementById('novelGridContainer');
    if (!container) return;

    renderStats();

    const sortedNovels = sortNovels(appData.novels, currentSort);

    const countEl = document.getElementById('novelCount');
    if (countEl) countEl.textContent = sortedNovels.length + ' novels';

    if (sortedNovels.length === 0) {
        container.innerHTML = '<div class="empty-state">No novels found. Click "Add Novel" to get started.</div>';
        return;
    }

    container.innerHTML = sortedNovels.map(n => {
        const cover = n.cover || DEFAULT_COVER;
        const volCount = (n.volumes || []).length;
        const maxVolumesToShow = 3;
        const showVolumes = n.volumes.slice(0, maxVolumesToShow);
        const remaining = volCount - maxVolumesToShow;

        const volList = showVolumes.map((v, idx) => {
            const hasFile = v.fileId && v.fileId.length > 0;
            const readBtn = hasFile
                ? `<button class="btn-secondary" style="font-size:0.6rem; padding:2px 8px;" onclick="openReader('${n.id}', ${idx})">📖 Read</button>`
                : `<span style="color:#9aa3b8;font-size:0.6rem;">No file</span>`;
            return `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #2f3748;">
                        <span style="font-weight:500;">Vol.${v.number || idx+1}</span>
                        ${readBtn}
                    </div>`;
        }).join('');

        let moreLink = '';
        if (remaining > 0) {
            moreLink = `<div style="margin-top:4px; text-align:center; font-size:0.75rem; color:var(--accent);">
                            <a href="detail.html?id=${n.id}" style="color:var(--accent); text-decoration:none;">+ ${remaining} more volume${remaining>1?'s':''} →</a>
                        </div>`;
        }

        return `
            <div class="novel-grid-item">
                <img src="${cover}" alt="${escapeHtml(n.title)}" onerror="this.src='${DEFAULT_COVER}'" />
                <div class="info">
                    <a href="detail.html?id=${n.id}" style="text-decoration:none; color:var(--text-primary);">
                        <h4 style="cursor:pointer;">${escapeHtml(n.title)}</h4>
                    </a>
                    <div class="author">${escapeHtml(n.author)}</div>
                    <span class="status-badge ${n.status}">${n.status || 'unknown'}</span>
                    <div class="vol-count">${volCount} volume${volCount!==1?'s':''}</div>
                    ${n.fromDrive ? '<div class="drive-badge"><i class="fas fa-cloud"></i> Drive</div>' : ''}
                    <div style="margin-top:8px; font-size:0.75rem;">
                        ${volList}
                        ${moreLink}
                    </div>
                    <div style="margin-top:8px; display:flex; gap:4px; flex-wrap:wrap;">
                        <button class="btn-secondary" style="font-size:0.7rem; padding:4px 10px;" onclick="editNovel('${n.id}')">✏️ Edit</button>
                        <button class="btn-delete" style="font-size:0.7rem; padding:4px 10px;" onclick="deleteNovel('${n.id}')">🗑️ Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCurrentlyReading() {
    const section = document.getElementById('currentlyReadingSection');
    const container = document.getElementById('currentlyReadingContainer');
    if (!section || !container) return;

    const reading = appData.novels.filter(n => {
        if (n.status !== 'reading') return false;
        const lastInfo = getLastReadInfo(n.id);
        return lastInfo !== null;
    });

    const sorted = reading.sort((a, b) => {
        const lastA = getLastReadInfo(a.id);
        const lastB = getLastReadInfo(b.id);
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
        const cover = n.cover || DEFAULT_COVER;
        const volCount = (n.volumes || []).length;
        const lastInfo = getLastReadInfo(n.id);
        const lastVolNum = lastInfo ? getVolumeNumber(n, lastInfo.volumeIndex) : null;
        const lastDate = lastInfo ? formatDate(lastInfo.date) : 'Not read yet';
        const latestInfo = lastVolNum ? `Vol.${lastVolNum}` : '—';

        return `
            <div class="reading-card" onclick="window.location.href='detail.html?id=${n.id}'">
                <img src="${cover}" alt="${escapeHtml(n.title)}" onerror="this.src='${DEFAULT_COVER}'" />
                <h4 title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</h4>
                <div class="author" title="${escapeHtml(n.author)}">${escapeHtml(n.author)}</div>
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
        const clickable = hasFile ? `onclick="openReader('${h.novelId}', ${h.volumeIndex})"` : '';
        const cursor = hasFile ? 'cursor:pointer;' : 'cursor:default;';
        return `
            <div class="history-item" style="${cursor} transition:var(--transition);" ${clickable}>
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
    const historyCount = appData.history.length;
    const elNov = document.getElementById('statNovels');
    const elVol = document.getElementById('statVolumes');
    const elRead = document.getElementById('statReading');
    const elHist = document.getElementById('statHistory');
    if (elNov) elNov.textContent = total;
    if (elVol) elVol.textContent = volumes;
    if (elRead) elRead.textContent = reading;
    if (elHist) elHist.textContent = historyCount;
}

function renderAll() {
    renderStats();
    renderCurrentlyReading();
    renderNovelGrid();
}

// ============================================================
// HELPERS FOR READING HISTORY
// ============================================================
function getLastReadInfo(novelId) {
    const entries = appData.history.filter(h => h.novelId === novelId);
    if (entries.length === 0) return null;
    const latest = entries.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
    return {
        volumeIndex: latest.volumeIndex,
        date: latest.date
    };
}

function getVolumeNumber(novel, volumeIndex) {
    if (!novel || !novel.volumes || volumeIndex >= novel.volumes.length) return null;
    return novel.volumes[volumeIndex].number || volumeIndex + 1;
}

// ============================================================
// READER
// ============================================================
let currentNovelId = null;
let currentVolumeIndex = null;

window.openReader = function(novelId, volIndex) {
    const novel = appData.novels.find(n => n.id === novelId);
    if (!novel) return showToast('Novel not found', 'error');
    const vol = novel.volumes[volIndex];
    if (!vol || !vol.fileId) return showToast('No file ID for this volume', 'error');
    const fileId = extractFileId(vol.fileId);
    if (!fileId) return showToast('Invalid file ID', 'error');

    recordRead(novelId, volIndex);

    currentNovelId = novelId;
    currentVolumeIndex = volIndex;
    const title = `${novel.title} – Vol.${vol.number || volIndex+1}`;
    document.getElementById('readerTitle').textContent = title;
    document.getElementById('readerBody').innerHTML = '<div class="loading">Loading file...</div>';
    document.getElementById('readerModal').classList.add('active');

    fetchFileContent(fileId);
};

function recordRead(novelId, volumeIndex) {
    appData.history = appData.history.filter(h => h.novelId !== novelId);
    appData.history.push({
        novelId: novelId,
        volumeIndex: volumeIndex,
        date: new Date().toISOString()
    });
    saveData(appData);
    updateNovelModifiedDate(novelId);
}

document.getElementById('readerClose')?.addEventListener('click', function() {
    document.getElementById('readerModal').classList.remove('active');
});
document.getElementById('readerModal')?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('active');
});

async function fetchFileContent(fileId) {
    try {
        const cachedData = await getCachedPdf(fileId);
        if (cachedData) {
            console.log('✅ Loaded from cache:', fileId);
            const isPdf = cachedData instanceof ArrayBuffer;
            if (isPdf) {
                renderPdf(cachedData);
            } else {
                document.getElementById('readerBody').innerHTML = `<pre>${escapeHtml(cachedData)}</pre>`;
            }
            return;
        }

        if (fileId.startsWith('local_')) {
            document.getElementById('readerBody').innerHTML = '<div class="loading" style="color:#f87171;">Local file not found in cache.</div>';
            showToast('Local file missing. Please re-upload.', 'error');
            return;
        }

        const token = gapi.client.getToken();
        if (!token) {
            showToast('Not authenticated. Please reconnect Drive.', 'error');
            document.getElementById('readerBody').innerHTML = '<div class="loading" style="color:#f87171;">Not authenticated. Reconnect Drive.</div>';
            return;
        }

        const meta = await gapi.client.drive.files.get({ fileId, fields: 'mimeType, name' });
        const mimeType = meta.result.mimeType;
        const name = meta.result.name;
        console.log('📄 Fetching from Drive:', name, 'mime:', mimeType);

        if (mimeType === 'application/vnd.google-apps.folder') {
            document.getElementById('readerBody').innerHTML = `
                <div class="loading" style="color:#f87171;">
                    ❌ This is a folder, not a file.<br>
                    Please check the volume configuration.<br>
                    <small>File ID: ${fileId}</small>
                </div>
            `;
            showToast('This volume points to a folder, not a file.', 'error');
            return;
        }

        if (mimeType === 'text/plain' || name.endsWith('.txt')) {
            const response = await gapi.client.drive.files.get({ fileId, alt: 'media' });
            const text = response.body;
            if (!text) throw new Error('Empty response');
            document.getElementById('readerBody').innerHTML = `<pre>${escapeHtml(text)}</pre>`;
            await savePdfToCache(fileId, text);
            return;
        }

        if (mimeType === 'application/pdf') {
            const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            const response = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + token.access_token }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    showToast('Token expired, refreshing...', 'info');
                    await new Promise((resolve) => {
                        tokenClient.callback = async (resp) => {
                            if (resp.error) {
                                showToast('Token refresh failed: ' + resp.error, 'error');
                                resolve();
                                return;
                            }
                            const newToken = gapi.client.getToken();
                            const retryResponse = await fetch(url, {
                                headers: { 'Authorization': 'Bearer ' + newToken.access_token }
                            });
                            if (retryResponse.ok) {
                                const arrayBuffer = await retryResponse.arrayBuffer();
                                await savePdfToCache(fileId, arrayBuffer);
                                renderPdf(arrayBuffer);
                            } else {
                                showToast('Retry failed: ' + retryResponse.status, 'error');
                                document.getElementById('readerBody').innerHTML = `<div class="loading" style="color:#f87171;">Error: ${retryResponse.status} – ${retryResponse.statusText}</div>`;
                            }
                            resolve();
                        };
                        tokenClient.requestAccessToken({ prompt: '' });
                    });
                    return;
                }
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            await savePdfToCache(fileId, arrayBuffer);
            renderPdf(arrayBuffer);
            return;
        }

        document.getElementById('readerBody').innerHTML = `<div class="loading">Unsupported file type: ${mimeType}</div>`;
        showToast('Unsupported file type: ' + mimeType, 'error');
    } catch (err) {
        console.error('❌ Reader error:', err);
        document.getElementById('readerBody').innerHTML = `<div class="loading" style="color:#f87171;">Error: ${err.message}</div>`;
        showToast('Failed to load file: ' + err.message, 'error');
    }
}

async function renderPdf(arrayBuffer) {
    try {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        let html = '';
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport }).promise;
            html += `<div style="margin-bottom:12px;text-align:center;"><img src="${canvas.toDataURL()}" style="max-width:100%;border:1px solid #2f3748;border-radius:4px;"></div>`;
        }
        document.getElementById('readerBody').innerHTML = html;
    } catch (err) {
        console.error('PDF rendering error:', err);
        document.getElementById('readerBody').innerHTML = `<div class="loading" style="color:#f87171;">PDF rendering error: ${err.message}</div>`;
        showToast('PDF rendering error: ' + err.message, 'error');
    }
}

// ============================================================
// IMPORT FROM LINK
// ============================================================
async function importFromLink() {
    const url = prompt('Enter the direct download URL (PDF or TXT):');
    if (!url) return;
    try {
        showToast('Downloading file...', 'info');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get('content-type') || '';
        const isPdf = contentType.includes('pdf') || url.endsWith('.pdf');
        const isText = contentType.includes('text') || url.endsWith('.txt');
        if (!isPdf && !isText) {
            showToast('Unsupported file type. Only PDF and TXT are supported.', 'error');
            return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const fileName = url.split('/').pop() || 'novel';
        const fileId = 'link_' + Date.now() + '_' + fileName;
        await savePdfToCache(fileId, arrayBuffer);

        const title = prompt('Enter novel title:', fileName.replace(/\.[^.]+$/, ''));
        if (!title) return;
        const author = prompt('Enter author name:', 'Unknown');
        const novel = {
            id: generateId(),
            title,
            author: author || 'Unknown',
            description: `Imported from link: ${url}`,
            cover: DEFAULT_COVER,
            status: 'reading',
            volumes: [{ number: 1, title: fileName, fileId }],
            fromDrive: false,
            addedAt: new Date().toISOString(),
            driveModifiedDate: new Date().toISOString()
        };
        appData.novels.push(novel);
        appData.history.push({
            novelId: novel.id,
            volumeIndex: 0,
            date: new Date().toISOString()
        });
        saveData(appData);
        renderAll();
        showToast(`Imported "${title}" from link.`, 'success');
    } catch (err) {
        console.error('Import from link error:', err);
        showToast('Failed to import from link: ' + err.message, 'error');
    }
}

// ============================================================
// DETAIL PAGE FUNCTIONS
// ============================================================
let detailNovelId = null;

function loadDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
        showToast('No novel specified', 'error');
        window.location.href = 'index.html';
        return;
    }
    detailNovelId = id;
    renderNovelDetail(id);
}

function renderNovelDetail(novelId) {
    const novel = appData.novels.find(n => n.id === novelId);
    if (!novel) {
        showToast('Novel not found', 'error');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('detailCover').src = novel.cover || DEFAULT_COVER;
    document.getElementById('detailCover').onerror = function() { this.src = DEFAULT_COVER; };
    document.getElementById('detailTitle').textContent = novel.title;
    document.getElementById('detailAuthor').textContent = 'by ' + (novel.author || 'Unknown');
    document.getElementById('detailDescription').textContent = novel.description || 'No description available.';
    document.getElementById('detailStatus').textContent = novel.status || 'unknown';
    document.getElementById('detailStatus').className = 'status-badge ' + (novel.status || 'unknown');
    document.getElementById('detailVolCount').textContent = (novel.volumes || []).length + ' volumes';

    document.getElementById('detailEditTitle').value = novel.title;
    document.getElementById('detailEditAuthor').value = novel.author || '';
    document.getElementById('detailEditDescription').value = novel.description || '';
    document.getElementById('detailEditCover').value = novel.cover || '';
    document.getElementById('detailEditStatus').value = novel.status || 'reading';
    document.getElementById('detailCoverFile').value = '';

    renderDetailVolumes(novel);
}

function renderDetailVolumes(novel) {
    const container = document.getElementById('detailVolumesContainer');
    const volumes = novel.volumes || [];

    if (volumes.length === 0) {
        container.innerHTML = '<div class="empty-state">No volumes yet. Add one below.</div>';
        return;
    }

    container.innerHTML = volumes.map((v, idx) => {
        const hasFile = v.fileId && v.fileId.length > 0;
        const fileId = extractFileId(v.fileId);
        const isValidFile = hasFile && fileId;
        const clickHandler = isValidFile ? `onclick="openReader('${novel.id}', ${idx})"` : '';
        const cursorStyle = isValidFile ? 'cursor:pointer;' : 'cursor:default;';
        const hoverBorder = isValidFile ? 'hover:border-color:var(--accent);' : '';
        
        return `
            <div class="history-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; ${cursorStyle} transition:var(--transition); ${hoverBorder}" ${clickHandler}>
                <div style="flex:1; min-width:0;">
                    <strong>Vol. ${v.number || idx+1}</strong>
                    <span style="margin-left:12px; color:var(--text-secondary);">${escapeHtml(v.title || 'Untitled')}</span>
                    ${v.fileId ? `<span style="margin-left:12px; font-size:0.7rem; color:var(--text-secondary); opacity:0.6; word-break:break-all;">${escapeHtml(v.fileId.substring(0, 16))}...</span>` : ''}
                    ${!isValidFile ? '<span style="margin-left:12px; font-size:0.7rem; color:#f87171;">⚠️ No valid file</span>' : ''}
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0; margin-left:12px;" onclick="event.stopPropagation();">
                    ${isValidFile ? `<span style="color:var(--accent); font-size:0.75rem; display:flex; align-items:center; gap:4px;"><i class="fas fa-play"></i> Read</span>` : ''}
                    <button class="btn-secondary" style="font-size:0.7rem; padding:4px 8px;" onclick="event.stopPropagation(); editVolume(${idx})">✏️</button>
                    <button class="btn-delete" style="font-size:0.7rem; padding:4px 8px;" onclick="event.stopPropagation(); deleteVolume(${idx})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function editVolume(index) {
    const novel = appData.novels.find(n => n.id === detailNovelId);
    if (!novel) return showToast('Novel not found', 'error');
    const vol = novel.volumes[index];
    if (!vol) return showToast('Volume not found', 'error');

    document.getElementById('detailEditVolumeIndex').value = index;
    document.getElementById('detailVolNumber').value = vol.number || index + 1;
    document.getElementById('detailVolTitle').value = vol.title || '';
    document.getElementById('detailVolFileId').value = vol.fileId || '';
    document.getElementById('detailVolumeFormTitle').textContent = 'Edit Volume';
    document.getElementById('detailVolSaveBtn').textContent = 'Update Volume';
    document.getElementById('detailVolumeForm').style.display = 'block';
    document.getElementById('detailVolumeForm').scrollIntoView({ behavior: 'smooth' });
}

function deleteVolume(index) {
    if (!confirm('Delete this volume?')) return;
    const novel = appData.novels.find(n => n.id === detailNovelId);
    if (!novel) return showToast('Novel not found', 'error');
    novel.volumes.splice(index, 1);
    updateNovelModifiedDate(detailNovelId);
    appData.history = appData.history.filter(h => !(h.novelId === detailNovelId && h.volumeIndex === index));
    appData.history.forEach(h => {
        if (h.novelId === detailNovelId && h.volumeIndex > index) {
            h.volumeIndex--;
        }
    });
    saveData(appData);
    renderDetailVolumes(novel);
    document.getElementById('detailVolCount').textContent = (novel.volumes || []).length + ' volumes';
    showToast('Volume deleted', 'info');
}

function editNovelFromDetail() {
    window.location.href = 'index.html?edit=' + detailNovelId;
}

function deleteNovelFromDetail() {
    if (!confirm('Delete this novel and all its volumes?')) return;
    appData.novels = appData.novels.filter(n => n.id !== detailNovelId);
    appData.history = appData.history.filter(h => h.novelId !== detailNovelId);
    saveData(appData);
    showToast('Novel deleted', 'info');
    window.location.href = 'index.html';
}

// ============================================================
// FORM HANDLING
// ============================================================
function resetForm() {
    document.getElementById('editNovelId').value = '';
    document.getElementById('formTitleInput').value = '';
    document.getElementById('formAuthorInput').value = '';
    document.getElementById('formDescriptionInput').value = '';
    document.getElementById('formCoverInput').value = '';
    document.getElementById('formCoverFile').value = '';
    document.getElementById('formStatusInput').value = 'reading';
    document.getElementById('formTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Novel';
    document.getElementById('formSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Novel';
    const container = document.getElementById('formVolumesContainer');
    container.innerHTML = '';
    container.appendChild(createVolumeEntry(1, '', ''));
    bindFormVolumeEvents();
    document.getElementById('novelFormContainer').style.display = 'none';
}

// ============================================================
// CSV IMPORT
// ============================================================
function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return lines.map(line => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    });
}

// ============================================================
// PAGE INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    const page = window.location.pathname.split('/').pop() || 'index.html';

    // ===== SIDEBAR TOGGLE (mobile) =====
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
            if (window.innerWidth <= 820) {
                closeSidebar();
            }
        });
    });

    // ===== HOME PAGE =====
    if (page === 'index.html' || page === '') {
        renderAll();

        if (appData.novels.length === 0) {
            setTimeout(() => showToast('👋 Welcome! Add a novel or import from Drive.', 'info'), 800);
        }

        document.getElementById('sortSelect')?.addEventListener('change', function() {
            currentSort = this.value;
            renderNovelGrid();
        });

        document.getElementById('showAddFormBtn')?.addEventListener('click', function() {
            resetForm();
            document.getElementById('novelFormContainer').style.display = 'block';
            document.getElementById('novelFormContainer').scrollIntoView({ behavior: 'smooth' });
        });

        document.getElementById('closeFormBtn')?.addEventListener('click', resetForm);
        document.getElementById('formCancelBtn')?.addEventListener('click', resetForm);

        document.getElementById('formAddVolumeBtn')?.addEventListener('click', function() {
            const container = document.getElementById('formVolumesContainer');
            const entries = container.querySelectorAll('.volume-entry');
            const num = entries.length + 1;
            const entry = createVolumeEntry(num, '', '');
            container.appendChild(entry);
            bindFormVolumeEvents();
        });

        document.getElementById('novelForm')?.addEventListener('submit', async function(e) {
            e.preventDefault();
            const editId = document.getElementById('editNovelId').value;
            const title = document.getElementById('formTitleInput').value.trim();
            const author = document.getElementById('formAuthorInput').value.trim();
            if (!title || !author) return showToast('Title and author required', 'error');

            const volumeEntries = document.querySelectorAll('#formVolumesContainer .volume-entry');
            const volumes = [];
            const filesToUpload = [];

            volumeEntries.forEach((entry, index) => {
                const num = parseInt(entry.querySelector('.form-vol-number').value);
                const t = entry.querySelector('.form-vol-title').value.trim() || `Volume ${num}`;
                let fid = entry.querySelector('.form-vol-fileid').value.trim();
                fid = extractFileId(fid) || fid;
                const fileInput = entry.querySelector('.form-vol-file');
                if (!isNaN(num) && num > 0) {
                    volumes.push({ number: num, title: t, fileId: fid, index });
                }
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    filesToUpload.push({ index, file: fileInput.files[0] });
                }
            });

            if (volumes.length === 0) return showToast('Add at least one volume', 'error');

            let coverData = document.getElementById('formCoverInput').value.trim() || DEFAULT_COVER;
            const coverFile = document.getElementById('formCoverFile').files[0];
            if (coverFile) {
                try {
                    coverData = await handleCoverUpload(coverFile);
                } catch (err) {
                    showToast('Error reading cover file: ' + err.message, 'error');
                    return;
                }
            }

            const novelData = {
                title,
                author,
                description: document.getElementById('formDescriptionInput').value.trim(),
                cover: coverData,
                status: document.getElementById('formStatusInput').value,
                volumes: volumes,
                fromDrive: false,
                addedAt: new Date().toISOString(),
                driveModifiedDate: new Date().toISOString(),
            };

            let novel;
            if (editId) {
                const idx = appData.novels.findIndex(n => n.id === editId);
                if (idx === -1) return showToast('Novel not found', 'error');
                novel = appData.novels[idx];
                Object.assign(novel, novelData);
                novel.id = editId;
                novel.driveModifiedDate = new Date().toISOString();
                showToast(`Updated "${title}"`, 'success');
            } else {
                novel = { id: generateId(), ...novelData };
                appData.novels.push(novel);
                if (volumes.length > 0) {
                    appData.history.push({
                        novelId: novel.id,
                        volumeIndex: 0,
                        date: new Date().toISOString()
                    });
                }
                showToast(`Added "${title}"`, 'success');
            }

            if (filesToUpload.length > 0) {
                for (const f of filesToUpload) {
                    const file = f.file;
                    const localId = 'local_' + Date.now() + '_' + file.name;
                    const arrayBuffer = await file.arrayBuffer();
                    await savePdfToCache(localId, arrayBuffer);
                    const volNum = volumes[f.index]?.number;
                    if (volNum) {
                        const vol = novel.volumes.find(v => v.number === volNum);
                        if (vol) vol.fileId = localId;
                    }
                }
                saveData(appData);
            }

            saveData(appData);
            renderAll();
            resetForm();
        });

        document.getElementById('refreshDriveBtn')?.addEventListener('click', function() {
            if (gapi.client && gapi.client.getToken && gapi.client.getToken()) {
                listDriveFiles();
            } else {
                showToast('Connect Drive first', 'error');
            }
        });

        document.getElementById('importCsvBtn')?.addEventListener('click', function() {
            document.getElementById('csvFileInput').click();
        });

        document.getElementById('csvFileInput')?.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                const text = event.target.result;
                const rows = parseCSV(text);
                if (rows.length < 2) {
                    showToast('CSV must have at least one data row.', 'error');
                    return;
                }
                const headers = rows[0];
                const dataRows = rows.slice(1);
                const titleIdx = headers.indexOf('title');
                const authorIdx = headers.indexOf('author');
                const descIdx = headers.indexOf('description');
                const coverIdx = headers.indexOf('cover_url');
                const statusIdx = headers.indexOf('status');
                const volumesIdx = headers.indexOf('volumes');
                if (titleIdx === -1 || authorIdx === -1) {
                    showToast('CSV must have "title" and "author" columns.', 'error');
                    return;
                }
                let added = 0;
                dataRows.forEach(row => {
                    if (row.length <= Math.max(titleIdx, authorIdx, descIdx, coverIdx, statusIdx, volumesIdx)) return;
                    const title = row[titleIdx]?.trim();
                    const author = row[authorIdx]?.trim();
                    if (!title || !author) return;
                    const description = row[descIdx]?.trim() || '';
                    const cover = row[coverIdx]?.trim() || DEFAULT_COVER;
                    const status = row[statusIdx]?.trim() || 'reading';
                    let volumes = [];
                    if (volumesIdx !== -1 && row[volumesIdx]) {
                        try {
                            volumes = JSON.parse(row[volumesIdx]);
                        } catch (e) {
                            console.warn('Invalid volumes JSON for', title);
                        }
                    }
                    if (!Array.isArray(volumes)) volumes = [];
                    const novel = {
                        id: generateId(),
                        title,
                        author,
                        description,
                        cover,
                        status,
                        volumes: volumes.map((v, idx) => ({
                            number: v.number || idx + 1,
                            title: v.title || `Volume ${idx+1}`,
                            fileId: v.fileId || ''
                        })),
                        fromDrive: false,
                        addedAt: new Date().toISOString(),
                        driveModifiedDate: new Date().toISOString()
                    };
                    appData.novels.push(novel);
                    if (novel.volumes.length > 0) {
                        appData.history.push({
                            novelId: novel.id,
                            volumeIndex: 0,
                            date: new Date().toISOString()
                        });
                    }
                    added++;
                });
                saveData(appData);
                renderAll();
                showToast(`Imported ${added} novels from CSV.`, 'success');
                document.getElementById('csvFileInput').value = '';
            };
            reader.readAsText(file);
        });

        document.getElementById('importLinkBtn')?.addEventListener('click', importFromLink);

        document.getElementById('forceReimportBtn')?.addEventListener('click', function() {
            console.log('🔄 Re-import button clicked');
            if (!confirm('This will delete all Drive-imported novels and re-import from scratch. Continue?')) return;
            const originalCount = appData.novels.length;
            appData.novels = appData.novels.filter(n => !n.fromDrive);
            const driveNovelIds = appData.novels.filter(n => n.fromDrive).map(n => n.id);
            appData.history = appData.history.filter(h => !driveNovelIds.includes(h.novelId));
            saveData(appData);
            console.log(`🗑️ Deleted ${originalCount - appData.novels.length} Drive novels`);
            renderAll();
            if (gapi.client && gapi.client.getToken && gapi.client.getToken()) {
                console.log('📂 Re-listing Drive files...');
                listDriveFiles();
            } else {
                showToast('Connect Drive first', 'error');
            }
        });

        const params = new URLSearchParams(window.location.search);
        const editId = params.get('edit');
        if (editId) {
            const novel = appData.novels.find(n => n.id === editId);
            if (novel) {
                setTimeout(() => {
                    editNovel(editId);
                }, 300);
            }
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }

    // ===== HISTORY PAGE =====
    if (page === 'history.html') {
        renderFullHistory();
    }

    // ===== DETAIL PAGE =====
    if (page === 'detail.html') {
        loadDetailPage();

        document.getElementById('detailEditDetailsBtn')?.addEventListener('click', function() {
            const form = document.getElementById('detailEditForm');
            if (form.style.display === 'none') {
                form.style.display = 'block';
                this.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';
            } else {
                form.style.display = 'none';
                this.innerHTML = '<i class="fas fa-edit"></i> Edit Details';
                const novel = appData.novels.find(n => n.id === detailNovelId);
                if (novel) {
                    document.getElementById('detailEditTitle').value = novel.title;
                    document.getElementById('detailEditAuthor').value = novel.author || '';
                    document.getElementById('detailEditDescription').value = novel.description || '';
                    document.getElementById('detailEditCover').value = novel.cover || '';
                    document.getElementById('detailEditStatus').value = novel.status || 'reading';
                    document.getElementById('detailCoverFile').value = '';
                }
            }
        });

        document.getElementById('detailEditSaveBtn')?.addEventListener('click', async function() {
            const novel = appData.novels.find(n => n.id === detailNovelId);
            if (!novel) return showToast('Novel not found', 'error');

            const title = document.getElementById('detailEditTitle').value.trim();
            const author = document.getElementById('detailEditAuthor').value.trim();
            if (!title || !author) return showToast('Title and author required', 'error');

            let coverData = document.getElementById('detailEditCover').value.trim() || DEFAULT_COVER;
            const coverFile = document.getElementById('detailCoverFile').files[0];
            if (coverFile) {
                try {
                    coverData = await handleCoverUpload(coverFile);
                } catch (err) {
                    showToast('Error reading cover file: ' + err.message, 'error');
                    return;
                }
            }

            novel.title = title;
            novel.author = author;
            novel.description = document.getElementById('detailEditDescription').value.trim();
            novel.cover = coverData;
            novel.status = document.getElementById('detailEditStatus').value;
            novel.driveModifiedDate = new Date().toISOString();

            saveData(appData);
            renderNovelDetail(detailNovelId);
            document.getElementById('detailEditForm').style.display = 'none';
            document.getElementById('detailEditDetailsBtn').innerHTML = '<i class="fas fa-edit"></i> Edit Details';
            showToast('Novel details updated!', 'success');
        });

        document.getElementById('detailEditCancelBtn')?.addEventListener('click', function() {
            document.getElementById('detailEditForm').style.display = 'none';
            document.getElementById('detailEditDetailsBtn').innerHTML = '<i class="fas fa-edit"></i> Edit Details';
            const novel = appData.novels.find(n => n.id === detailNovelId);
            if (novel) {
                document.getElementById('detailEditTitle').value = novel.title;
                document.getElementById('detailEditAuthor').value = novel.author || '';
                document.getElementById('detailEditDescription').value = novel.description || '';
                document.getElementById('detailEditCover').value = novel.cover || '';
                document.getElementById('detailEditStatus').value = novel.status || 'reading';
                document.getElementById('detailCoverFile').value = '';
            }
        });

        document.getElementById('detailDeleteNovelBtn')?.addEventListener('click', deleteNovelFromDetail);

        document.getElementById('detailAddVolumeBtn')?.addEventListener('click', function() {
            const novel = appData.novels.find(n => n.id === detailNovelId);
            if (!novel) return showToast('Novel not found', 'error');
            document.getElementById('detailEditVolumeIndex').value = '-1';
            document.getElementById('detailVolNumber').value = (novel.volumes?.length || 0) + 1;
            document.getElementById('detailVolTitle').value = '';
            document.getElementById('detailVolFileId').value = '';
            document.getElementById('detailVolumeFormTitle').textContent = 'Add Volume';
            document.getElementById('detailVolSaveBtn').textContent = 'Add Volume';
            document.getElementById('detailVolumeForm').style.display = 'block';
            document.getElementById('detailVolumeForm').scrollIntoView({ behavior: 'smooth' });
        });

        document.getElementById('detailVolCancelBtn')?.addEventListener('click', function() {
            document.getElementById('detailVolumeForm').style.display = 'none';
        });

        document.getElementById('detailVolSaveBtn')?.addEventListener('click', function() {
            const novel = appData.novels.find(n => n.id === detailNovelId);
            if (!novel) return showToast('Novel not found', 'error');

            const num = parseInt(document.getElementById('detailVolNumber').value);
            const title = document.getElementById('detailVolTitle').value.trim() || `Volume ${num}`;
            let fileId = document.getElementById('detailVolFileId').value.trim();
            fileId = extractFileId(fileId) || fileId;

            if (isNaN(num) || num < 1) return showToast('Volume number must be positive', 'error');

            const editIndex = parseInt(document.getElementById('detailEditVolumeIndex').value);
            const newVolume = { number: num, title: title, fileId: fileId };

            if (editIndex >= 0 && editIndex < novel.volumes.length) {
                novel.volumes[editIndex] = newVolume;
                showToast('Volume updated', 'success');
            } else {
                novel.volumes.push(newVolume);
                showToast('Volume added', 'success');
            }
            novel.driveModifiedDate = new Date().toISOString();
            if (novel.volumes.length === 1 && !appData.history.some(h => h.novelId === detailNovelId)) {
                appData.history.push({
                    novelId: detailNovelId,
                    volumeIndex: 0,
                    date: new Date().toISOString()
                });
            }
            saveData(appData);
            renderDetailVolumes(novel);
            document.getElementById('detailVolCount').textContent = (novel.volumes || []).length + ' volumes';
            document.getElementById('detailVolumeForm').style.display = 'none';
        });
    }

    // ===== SHARED ELEMENTS =====

    document.getElementById('driveConnectBtn')?.addEventListener('click', function() {
        const status = document.getElementById('driveStatus');
        if (status && status.textContent === 'Connected ✅') {
            handleSignoutClick();
        } else {
            handleAuthClick();
        }
    });

    document.getElementById('driveRefreshBtn')?.addEventListener('click', refreshDriveConnection);

    document.getElementById('menuToggle')?.addEventListener('click', function() {
        // Already handled above
    });

    document.getElementById('searchInput')?.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        const items = document.querySelectorAll('#novelGridContainer .novel-grid-item');
        items.forEach(item => {
            const title = item.querySelector('h4')?.textContent?.toLowerCase() || '';
            const author = item.querySelector('.author')?.textContent?.toLowerCase() || '';
            const match = title.includes(q) || author.includes(q);
            item.style.display = match ? '' : 'none';
        });
        const visible = Array.from(items).filter(el => el.style.display !== 'none');
        const countEl = document.getElementById('novelCount');
        if (countEl) countEl.textContent = visible.length + ' novels';
    });

    loadGoogleApis();
});

// ============================================================
// GLOBAL EXPOSURE
// ============================================================
window.deleteNovel = deleteNovel;
window.editNovel = editNovel;
window.openReader = openReader;
window.deleteVolume = deleteVolume;
window.editVolume = editVolume;
window.editNovelFromDetail = editNovelFromDetail;
window.deleteNovelFromDetail = deleteNovelFromDetail;
window.loadDetailPage = loadDetailPage;
window.refreshDriveConnection = refreshDriveConnection;
window.clearPdfCache = clearPdfCache;
