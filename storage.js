/**
 * Ink Note - Mô-đun Quản lý Lưu trữ Dữ liệu (Storage Layer)
 * 
 * - Quản lý Ghi chú và Thư mục (hỗ trợ thư mục lồng thư mục) trong IndexedDB.
 * - Cung cấp hàm listNotesSummary(folderId) và listFolders(parentId) nạp siêu tốc.
 * - Xuất và Nhập sao lưu giữ nguyên toàn bộ cấu trúc thư mục và ghi chú.
 * - Lưu vết ghi chú mở gần nhất và thư mục đang xem.
 */

(function (global) {
  'use strict';

  const DB_NAME = 'InkNoteDB';
  const DB_VERSION = 2; // Tăng lên 2 để bổ sung store 'folders'
  const STORE_NOTES = 'notes';
  const STORE_FOLDERS = 'folders';

  const LAST_ACTIVE_NOTE_KEY = 'inknote_last_active_note_id';
  const LAST_ACTIVE_FOLDER_KEY = 'inknote_last_active_folder_id';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        return reject(e);
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          const folderStore = db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
          folderStore.createIndex('parentId', 'parentId', { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };

        // Tự phục hồi: Nếu CSDL chưa kịp có store 'folders'
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          db.close();
          dbPromise = null;
          const nextVersion = (db.version || 1) + 1;
          const retryRequest = indexedDB.open(DB_NAME, nextVersion);

          retryRequest.onupgradeneeded = (e) => {
            const upDb = e.target.result;
            if (!upDb.objectStoreNames.contains(STORE_NOTES)) {
              upDb.createObjectStore(STORE_NOTES, { keyPath: 'id' });
            }
            if (!upDb.objectStoreNames.contains(STORE_FOLDERS)) {
              const folderStore = upDb.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
              folderStore.createIndex('parentId', 'parentId', { unique: false });
            }
          };

          retryRequest.onsuccess = () => {
            const retDb = retryRequest.result;
            retDb.onversionchange = () => {
              retDb.close();
              dbPromise = null;
            };
            resolve(retDb);
          };

          retryRequest.onerror = () => reject(retryRequest.error || new Error('Không thể nâng cấp CSDL'));
          return;
        }

        resolve(db);
      };

      request.onblocked = () => {
        console.warn('Mở CSDL bị tạm hoãn vì tab khác đang mở.');
      };

      request.onerror = () => reject(request.error || new Error('Không thể mở IndexedDB'));
    });

    return dbPromise;
  }

  // ==========================================
  // 1. Quản lý Ghi chú (Notes)
  // ==========================================

  function createDefaultNote(customTitle, folderId = null) {
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      version: 2,
      id: 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: customTitle || todayStr,
      folderId: folderId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thumbnail: '',
      pages: [
        {
          id: 'page_1',
          config: {
            background: 'white',
            pattern: 'none',
            spacing: 'medium'
          },
          strokes: []
        }
      ]
    };
  }

  async function saveNote(noteData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readwrite');
      const store = tx.objectStore(STORE_NOTES);

      const record = {
        ...noteData,
        id: noteData.id || ('note_' + Date.now()),
        folderId: noteData.folderId || null,
        updatedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => {
        setLastActiveNoteId(record.id);
        resolve(record);
      };
      request.onerror = () => reject(request.error || new Error('Lỗi khi ghi dữ liệu ghi chú'));
    });
  }

  async function loadNote(noteId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readonly');
      const store = tx.objectStore(STORE_NOTES);
      const request = store.get(noteId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Lỗi khi đọc dữ liệu ghi chú'));
    });
  }

  async function deleteNote(noteId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readwrite');
      const store = tx.objectStore(STORE_NOTES);
      const request = store.delete(noteId);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error('Lỗi khi xóa ghi chú'));
    });
  }

  /**
   * Lấy danh sách tóm tắt ghi chú trong thư mục cụ thể (folderId = null là ngoài cùng)
   */
  async function listNotesSummary(folderId = null) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readonly');
      const store = tx.objectStore(STORE_NOTES);
      const summaries = [];

      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          const noteFolder = val.folderId || null;
          const targetFolder = folderId || null;

          if (noteFolder === targetFolder) {
            summaries.push({
              id: val.id,
              title: val.title || 'Ghi chú không tên',
              folderId: noteFolder,
              createdAt: val.createdAt || Date.now(),
              updatedAt: val.updatedAt || Date.now(),
              pageCount: (val.pages && val.pages.length) || 1,
              thumbnail: val.thumbnail || ''
            });
          }
          cursor.continue();
        } else {
          // Sắp xếp ghi chú theo ngày sửa mới nhất lên đầu
          summaries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(summaries);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function getAllNotes() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readonly');
      const store = tx.objectStore(STORE_NOTES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Chuyển một ghi chú vào thư mục đích (targetFolderId = null là đưa ra ngoài cùng)
   */
  async function moveNoteToFolder(noteId, targetFolderId = null) {
    const note = await loadNote(noteId);
    if (!note) throw new Error('Không tìm thấy ghi chú');
    note.folderId = targetFolderId || null;
    return await saveNote(note);
  }

  // ==========================================
  // 2. Quản lý Thư mục (Folders)
  // ==========================================

  function createDefaultFolder(name, parentId = null) {
    return {
      id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: (name && name.trim()) ? name.trim() : 'Thư mục mới',
      parentId: parentId || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async function saveFolder(folderData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      const store = tx.objectStore(STORE_FOLDERS);

      const record = {
        ...folderData,
        id: folderData.id || ('folder_' + Date.now()),
        name: (folderData.name && folderData.name.trim()) ? folderData.name.trim() : 'Thư mục mới',
        parentId: folderData.parentId || null,
        updatedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error || new Error('Lỗi khi lưu thư mục'));
    });
  }

  async function getFolder(folderId) {
    if (!folderId) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const store = tx.objectStore(STORE_FOLDERS);
      const request = store.get(folderId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Lỗi khi đọc thư mục'));
    });
  }

  async function getAllFolders() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const store = tx.objectStore(STORE_FOLDERS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Lấy danh sách thư mục con trực tiếp của parentId (parentId = null là ngoài cùng)
   */
  async function listFolders(parentId = null) {
    const all = await getAllFolders();
    const targetParent = parentId || null;
    const filtered = all.filter(f => (f.parentId || null) === targetParent);
    // Sắp xếp thư mục theo tên A-Z hoặc thời gian tạo
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' }));
    return filtered;
  }

  /**
   * Đếm tổng số ghi chú nằm trong một thư mục
   * @param {string} folderId
   * @param {boolean} recursive Có đếm luôn cả ghi chú trong các thư mục con hay không
   */
  async function countNotesInFolder(folderId, recursive = true) {
    if (!folderId) return 0;
    const [allFolders, allNotes] = await Promise.all([getAllFolders(), getAllNotes()]);

    let targetFolderIds = new Set([folderId]);
    if (recursive) {
      let added = true;
      while (added) {
        added = false;
        for (const f of allFolders) {
          if (f.parentId && targetFolderIds.has(f.parentId) && !targetFolderIds.has(f.id)) {
            targetFolderIds.add(f.id);
            added = true;
          }
        }
      }
    }

    let count = 0;
    for (const note of allNotes) {
      if (note.folderId && targetFolderIds.has(note.folderId)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Lấy đường dẫn phân cấp (Breadcrumb) từ thư mục gốc đến thư mục hiện tại
   * Trả về mảng: [{ id: null, name: 'Tất cả' }, ..., { id, name }]
   */
  async function getFolderBreadcrumb(folderId) {
    const trail = [{ id: null, name: 'Tất cả' }];
    if (!folderId) return trail;

    const allFolders = await getAllFolders();
    const folderMap = new Map(allFolders.map(f => [f.id, f]));

    const path = [];
    let curr = folderMap.get(folderId);
    const visited = new Set();

    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      path.unshift({ id: curr.id, name: curr.name });
      curr = curr.parentId ? folderMap.get(curr.parentId) : null;
    }

    return trail.concat(path);
  }

  /**
   * Kiểm tra targetParentId có phải là chính nó hoặc con cháu của folderId hay không (chống lặp vô tận)
   */
  async function isDescendantFolder(folderId, potentialParentId) {
    if (!potentialParentId || !folderId) return false;
    if (folderId === potentialParentId) return true;

    const allFolders = await getAllFolders();
    const folderMap = new Map(allFolders.map(f => [f.id, f]));

    let curr = folderMap.get(potentialParentId);
    const visited = new Set();
    while (curr && !visited.has(curr.id)) {
      if (curr.id === folderId) return true;
      visited.add(curr.id);
      curr = curr.parentId ? folderMap.get(curr.parentId) : null;
    }
    return false;
  }

  /**
   * Xóa thư mục:
   * @param {string} folderId 
   * @param {'cascade'|'orphan'} mode
   *   - 'cascade': Xóa vĩnh viễn cả thư mục và các ghi chú + thư mục con bên trong
   *   - 'orphan': Chỉ xóa thư mục, chuyển toàn bộ ghi chú bên trong ra ngoài cùng (folderId = null)
   */
  async function deleteFolder(folderId, mode = 'orphan') {
    const db = await openDB();
    const [allFolders, allNotes] = await Promise.all([getAllFolders(), getAllNotes()]);
    const targetFolder = allFolders.find(f => f.id === folderId);
    if (!targetFolder) return;

    // Tìm tất cả các thư mục con trong cây
    const subFolderIds = new Set([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of allFolders) {
        if (f.parentId && subFolderIds.has(f.parentId) && !subFolderIds.has(f.id)) {
          subFolderIds.add(f.id);
          added = true;
        }
      }
    }

    if (mode === 'cascade') {
      // 1. Xóa tất cả ghi chú thuộc các thư mục này
      const notesToDelete = allNotes.filter(n => n.folderId && subFolderIds.has(n.folderId));
      for (const note of notesToDelete) {
        await deleteNote(note.id);
      }

      // 2. Xóa các thư mục
      for (const fid of subFolderIds) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_FOLDERS, 'readwrite');
          const store = tx.objectStore(STORE_FOLDERS);
          const req = store.delete(fid);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } else {
      // mode === 'orphan': Đưa ghi chú ra ngoài cùng (hoặc ra thư mục cha)
      const notesToMove = allNotes.filter(n => n.folderId && subFolderIds.has(n.folderId));
      for (const note of notesToMove) {
        note.folderId = targetFolder.parentId || null;
        await saveNote(note);
      }

      // Đưa thư mục con trực tiếp ra ngoài thư mục cha của targetFolder
      const directSubFolders = allFolders.filter(f => f.parentId === folderId);
      for (const sub of directSubFolders) {
        sub.parentId = targetFolder.parentId || null;
        await saveFolder(sub);
      }

      // Xóa riêng targetFolder
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDERS, 'readwrite');
        const store = tx.objectStore(STORE_FOLDERS);
        const req = store.delete(folderId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    // Nếu đang lưu vết folder bị xóa thì reset về null
    if (getLastActiveFolderId() === folderId) {
      setLastActiveFolderId(null);
    }
  }

  // ==========================================
  // 3. Quản lý Trạng thái Mở Gần Nhất
  // ==========================================

  function getLastActiveNoteId() {
    try {
      return localStorage.getItem(LAST_ACTIVE_NOTE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setLastActiveNoteId(noteId) {
    try {
      if (noteId) {
        localStorage.setItem(LAST_ACTIVE_NOTE_KEY, noteId);
      }
    } catch (e) {}
  }

  function getLastActiveFolderId() {
    try {
      return localStorage.getItem(LAST_ACTIVE_FOLDER_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setLastActiveFolderId(folderId) {
    try {
      if (folderId) {
        localStorage.setItem(LAST_ACTIVE_FOLDER_KEY, folderId);
      } else {
        localStorage.removeItem(LAST_ACTIVE_FOLDER_KEY);
      }
    } catch (e) {}
  }

  // ==========================================
  // 4. Xuất / Nhập Sao lưu (Backup & Restore)
  // ==========================================

  /**
   * Xuất toàn bộ tất cả thư mục và ghi chú thành 1 file .json duy nhất
   */
  async function exportAllNotesToFile(customFilename) {
    const [allFolders, allNotes] = await Promise.all([getAllFolders(), getAllNotes()]);

    const backupData = {
      version: 2,
      type: 'inknote_backup_all',
      exportedAt: Date.now(),
      folders: allFolders,
      notes: allNotes
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = customFilename || `InkNote_Backup_${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Nhập file sao lưu: thêm các thư mục và ghi chú vào CSDL (không ghi đè dữ liệu cũ)
   */
  async function importNotesFromFile(file) {
    if (!file) throw new Error('Chưa chọn file');

    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Không thể đọc file'));
      reader.readAsText(file);
    });

    const parsed = JSON.parse(text);
    const foldersToImport = [];
    const notesToImport = [];

    if (parsed && Array.isArray(parsed.notes)) {
      notesToImport.push(...parsed.notes);
      if (Array.isArray(parsed.folders)) {
        foldersToImport.push(...parsed.folders);
      }
    } else if (parsed && Array.isArray(parsed.pages)) {
      // Hỗ trợ file sao lưu đơn 1 ghi chú cũ
      notesToImport.push(parsed);
    } else {
      throw new Error('Định dạng file sao lưu không hợp lệ');
    }

    const [existingFolders, existingNotes] = await Promise.all([getAllFolders(), getAllNotes()]);
    const existingFolderIds = new Set(existingFolders.map(f => f.id));
    const existingNoteIds = new Set(existingNotes.map(n => n.id));

    // Bản đồ ánh xạ ID cũ -> ID mới nếu bị trùng
    const folderIdMap = {};

    // 1. Nhập Thư mục
    for (const folder of foldersToImport) {
      if (!folder || !folder.id) continue;
      let newFolderId = folder.id;
      if (existingFolderIds.has(folder.id)) {
        newFolderId = 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        folderIdMap[folder.id] = newFolderId;
      }

      const cleanFolder = {
        id: newFolderId,
        name: folder.name || 'Thư mục nhập',
        parentId: folder.parentId || null,
        createdAt: folder.createdAt || Date.now(),
        updatedAt: folder.updatedAt || Date.now()
      };

      await saveFolder(cleanFolder);
      existingFolderIds.add(newFolderId);
    }

    // Cập nhật lại parentId của các thư mục nếu cha của nó bị đổi ID
    if (Object.keys(folderIdMap).length > 0) {
      const allUpdatedFolders = await getAllFolders();
      for (const f of allUpdatedFolders) {
        if (f.parentId && folderIdMap[f.parentId]) {
          f.parentId = folderIdMap[f.parentId];
          await saveFolder(f);
        }
      }
    }

    // 2. Nhập Ghi chú
    let importedNoteCount = 0;
    for (const note of notesToImport) {
      if (!note || !Array.isArray(note.pages)) continue;

      let newNoteId = note.id;
      if (!newNoteId || existingNoteIds.has(newNoteId)) {
        newNoteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      }

      // Ánh xạ folderId nếu thư mục cha được tạo ID mới
      let noteFolderId = note.folderId || null;
      if (noteFolderId && folderIdMap[noteFolderId]) {
        noteFolderId = folderIdMap[noteFolderId];
      }

      const cleanNote = {
        version: 2,
        id: newNoteId,
        title: note.title || ('Ghi chú ' + (existingNotes.length + importedNoteCount + 1)),
        folderId: noteFolderId,
        createdAt: note.createdAt || Date.now(),
        updatedAt: note.updatedAt || Date.now(),
        thumbnail: note.thumbnail || '',
        pages: note.pages
      };

      await saveNote(cleanNote);
      existingNoteIds.add(newNoteId);
      importedNoteCount++;
    }

    return {
      noteCount: importedNoteCount,
      folderCount: foldersToImport.length
    };
  }

  global.InkStorage = {
    openDB,
    // Notes
    createDefaultNote,
    saveNote,
    loadNote,
    deleteNote,
    listNotesSummary,
    getAllNotes,
    moveNoteToFolder,
    // Folders
    createDefaultFolder,
    saveFolder,
    getFolder,
    getAllFolders,
    listFolders,
    countNotesInFolder,
    getFolderBreadcrumb,
    isDescendantFolder,
    deleteFolder,
    // Tracking
    getLastActiveNoteId,
    setLastActiveNoteId,
    getLastActiveFolderId,
    setLastActiveFolderId,
    // Backup & Restore
    exportAllNotesToFile,
    importNotesFromFile
  };

})(typeof window !== 'undefined' ? window : this);
