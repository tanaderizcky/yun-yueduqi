# yun-yueduqi
# 📚 Novel Library

A fully offline-first web app to manage and read your novel collection (PDF/TXT) from Google Drive, your local device, or any direct link. Built with vanilla JavaScript and IndexedDB, it runs entirely in your browser.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📖 Read Novels** | Open PDF and TXT files directly in your browser with a built‑in reader (PDF.js). |
| **☁️ Google Drive Sync** | Authenticate with OAuth 2.0 and import all novels from a specific folder (`My Drive/file/pdf/j-novel/`). |
| **📂 Folder Structure** | Supports both **flat** files (all volumes in one folder) and **nested** folders (each novel has its own subfolder). |
| **📝 Manual Add** | Add novels one by one with title, author, description, cover (URL or upload), status, and multiple volumes. |
| **📤 Bulk Import (CSV)** | Upload a CSV file to add dozens of novels at once – each row can include volume data as JSON. |
| **🔗 Import from Link** | Paste a direct download URL (PDF/TXT) and the app will fetch and save it. |
| **📊 Volume Management** | Each novel can have multiple volumes. Add, edit, or delete volumes individually. |
| **📈 Reading History** | Tracks which volume you last read and shows the latest activity on the home page. |
| **⚡ Offline Cache** | Once a file is opened, it's stored in IndexedDB – subsequent reads are instant, even without internet. |
| **📱 Responsive** | Works seamlessly on desktop, tablet, and phone. |
| **🎨 Custom Covers** | Upload a cover image or paste a direct image URL. |
| **🔍 Search & Sort** | Filter novels by title or author, and sort by A–Z, Z–A, newest, or oldest. |
| **🗑️ Full CRUD** | Edit or delete any novel and its volumes from the interface. |

---

## 🖥️ Live Demo

The app is hosted on GitHub Pages.  
👉 [https://your-username.github.io/your-repo/](https://your-username.github.io/your-repo/)

*(Replace `your-username` and `your-repo` with your actual GitHub details.)*

---

## 🚀 Getting Started

### 1. Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari).
- A **Google Cloud Platform** project with the **Drive API enabled** and OAuth credentials.
- A folder in your Google Drive: `My Drive/file/pdf/j-novel/` (you can put your PDF/TXT files inside).

### 2. Setup Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Enable the **Google Drive API**.
4. Go to **Credentials** → **Create Credentials** → **OAuth Client ID**.
5. Choose **Web application**.
6. Under **Authorized JavaScript origins**, add:
   - `https://your-username.github.io` (for production)
   - `http://localhost:5500` (for local development)
7. Copy the **Client ID**.

### 3. Configure the App

1. Open `script.js` and replace the placeholder `CLIENT_ID` with your actual Client ID:
   ```javascript
   const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';

## 📁 Project Structure
novel-website/
│
├── 📄 index.html # Home page (stats + currently reading + novel list + add/edit form)
├── 📄 history.html # Full reading history
├── 📄 detail.html # Novel detail page (all volumes, volume CRUD)
│
├── 🎨 style.css # All styles (fully responsive)
├── ⚡ script.js # All application logic (data, Drive API, rendering, cache)
│
├── 📁 assets/ # Static assets
│ └── 📁 covers/
│ └── 🖼️ default-cover.jpg # Fallback cover image
│
├── 📁 data/ # (Optional) Reference data – not used by the app
│ └── 📄 novels.json # Example data structure
│
├── 📄 README.md # Project documentation
└── 📄 LICENSE # MIT License
