# yun-yueduqi
The error is clear: the volume "Parasite in Love – Vol.1" has a file ID that points to a folder, not a file. That's why the app says "This is a folder, not a file."

🧠 Why is this happening?
1. You might have manually added the volume
If you used the Add Novel or Edit form and pasted a folder ID (or a Drive share link that points to a folder), that ID gets stored as the volume's fileId. When you click Read, the app checks the file's metadata and finds out it's a folder, then shows the error.

2. The import from Drive might have picked the folder itself
In a previous version, the import logic might have accidentally stored the folder ID instead of the file ID. But in the latest script, I added a filter to exclude folders, so new imports should work correctly. However, if you imported before that fix, you might have old entries with folder IDs.

3. You might have copied the wrong link
Drive share links for folders look like:

text
https://drive.google.com/drive/folders/1MSFtsx1F7LYX8kr4dqMUvQx_sLqihDA
The part after /folders/ is the folder ID. If you pasted that into the "File ID / Link" field, the app will treat it as a file ID and try to read it as a file.

✅ How to fix it
You need to replace the volume's file ID with the actual file ID of the PDF (or TXT) file inside that folder.

Step‑by‑step:
Open your Google Drive in a browser.

Navigate to the folder: My Drive/file/pdf/j-novel/Parasite in Love/

Inside that folder, you should see the actual PDF files (e.g., vol1.pdf, vol2.pdf, etc.).

Copy the file ID of vol1.pdf:

Right‑click on the file → "Get link" (or open the file and copy the ID from the URL).

The file ID is the long string in the URL: https://drive.google.com/file/d/1ABC123DEF456/view → the part 1ABC123DEF456 is the file ID.

Now go back to the app's Manage page (list.html).

Find the novel "Parasite in Love" and click Edit.

In the volumes section, find Vol.1 and replace the "File ID / Link" field with the new file ID you copied.

Click Update Novel.

Now the volume points to the actual PDF, not the folder. The Read button will work.

🛡️ Future‑proofing: avoid pasting folder IDs
When adding or editing volumes, always paste:

The file ID from a file's URL, or

The full share link that ends with /file/d/... (not /folders/...).

The app's extractFileId() helper extracts the ID from the link, but it only works for file links (they have /d/ in the path). Folder links have /folders/ and will not be correctly parsed.

🔍 How to check what type of ID you have
Open the link in your browser:

If the URL contains /file/d/ → it's a file.

If it contains /folders/ → it's a folder.

📌 Note about imported novels
If you imported from Drive using the latest script, the app automatically filters out folders and only adds PDF/TXT files as volumes. So new imports will not have this problem. But for any manually added volumes or older imports, you may need to correct them.

