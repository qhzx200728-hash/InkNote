/**
 * Ink Note - Lõi vẽ nét mực mượt & Quản lý Nhiều Ghi chú (Phase 1)
 * 
 * Tính năng Danh sách ghi chú:
 * 1. Màn hình Danh sách Ghi chú dạng thẻ: thumbnail trang 1, tên, ngày sửa mới nhất.
 * 2. Nút "Ghi chú mới": tên mặc định ngày YYYY-MM-DD (trùng tên thì tự thêm số).
 * 3. Đổi tên và Xóa ghi chú (có xác nhận rõ ràng không thể hoàn tác).
 * 4. Mũi tên quay lại màn hình viết; chuyển ghi chú thì lưu ngay ghi chú hiện tại.
 * 5. Tự động mở lại ghi chú gần nhất khi khởi động app.
 * 6. Tải tóm tắt qua storage.js, xuất/nhập file sao lưu toàn bộ ghi chú an toàn.
 */

// ==========================================
// 1. Cấu hình trang giấy cố định & Camera
// ==========================================
const PAGE_WIDTH = 1200;
const PAGE_HEIGHT = 1700;
const ERASER_RADIUS_SCREEN = 10;

const BACKGROUND_COLORS = {
  white: '#ffffff',
  cream: '#faf5eb',
  gray: '#e8eaed',
  dark: '#1e1f22'
};

const SPACING_SIZES = {
  ruled: {
    narrow: 35,
    medium: 50,
    wide: 70
  },
  grid: {
    narrow: 30,
    medium: 45,
    wide: 65
  }
};

// ==========================================
// 2. Quản lý Ghi chú & Trang
// ==========================================

function createNewPageObject(inheritedConfig = null) {
  return {
    id: 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    config: {
      background: inheritedConfig ? inheritedConfig.background : 'white',
      pattern: inheritedConfig ? inheritedConfig.pattern : 'none',
      spacing: inheritedConfig ? inheritedConfig.spacing : 'medium'
    },
    strokes: [],
    view: {
      zoom: 1.0,
      panX: 0,
      panY: 0
    },
    undoStack: [],
    redoStack: []
  };
}

// Thông tin Ghi chú đang mở (Active Note)
let currentNoteId = 'note_default';
let currentNoteTitle = 'Ghi chú 1';
let currentNoteFolderId = null;
let currentNoteCreatedAt = Date.now();

// Trạng thái Thư mục (Folders)
let currentFolderId = null; // null: Thư mục gốc ngoài cùng (Tất cả)
let noteToMoveId = null;
let folderToDeleteId = null;

// Danh sách các trang trong ghi chú đang mở
let pages = [createNewPageObject()];
let currentPageIndex = 0;

// Trạng thái của trang hiện tại
let pageConfig = { ...pages[0].config };
let strokes = [];
let undoStack = [];
let redoStack = [];

// Trạng thái Camera
let zoom = 1.0;
let panX = 0;
let panY = 0;

// Trạng thái công cụ
let currentTool = 'pen';
let currentColor = '#1a1a1a';
let currentWidth = 5;

// DOM Elements
const noteListView = document.getElementById('noteListView');
const editorView = document.getElementById('editorView');
const notesGrid = document.getElementById('notesGrid');
const openNotesBtn = document.getElementById('openNotesBtn');
const backToEditorBtn = document.getElementById('backToEditorBtn');
const newNoteBtn = document.getElementById('newNoteBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const notesBackupBtn = document.getElementById('notesBackupBtn');
const currentNoteTitleBadge = document.getElementById('currentNoteTitleBadge');

// Breadcrumb & Thư mục
const breadcrumbBackBtn = document.getElementById('breadcrumbBackBtn');
const breadcrumbNav = document.getElementById('breadcrumbNav');
const folderStats = document.getElementById('folderStats');

// Modal Tạo Thư mục Mới
const newFolderModal = document.getElementById('newFolderModal');
const newFolderForm = document.getElementById('newFolderForm');
const newFolderNameInput = document.getElementById('newFolderNameInput');
const closeNewFolderModalBtn = document.getElementById('closeNewFolderModalBtn');
const cancelNewFolderBtn = document.getElementById('cancelNewFolderBtn');

// Modal Chuyển Ghi chú
const moveNoteModal = document.getElementById('moveNoteModal');
const moveModalNoteTitle = document.getElementById('moveModalNoteTitle');
const moveFolderList = document.getElementById('moveFolderList');
const closeMoveModalBtn = document.getElementById('closeMoveModalBtn');
const cancelMoveBtn = document.getElementById('cancelMoveBtn');

// Modal Xóa Thư mục
const deleteFolderModal = document.getElementById('deleteFolderModal');
const deleteFolderMessage = document.getElementById('deleteFolderMessage');
const closeDeleteFolderModalBtn = document.getElementById('closeDeleteFolderModalBtn');
const deleteFolderOrphanBtn = document.getElementById('deleteFolderOrphanBtn');
const deleteFolderCascadeBtn = document.getElementById('deleteFolderCascadeBtn');
const cancelDeleteFolderBtn = document.getElementById('cancelDeleteFolderBtn');

const canvas = document.getElementById('inkCanvas');
const ctx = canvas.getContext('2d');
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const thumbnailList = document.getElementById('thumbnailList');
const pageCountEl = document.getElementById('pageCount');
const addPageBtn = document.getElementById('addPageBtn');
const deletePageBtn = document.getElementById('deletePageBtn');

const resetZoomBtn = document.getElementById('resetZoomBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const penBtn = document.getElementById('penBtn');
const eraserBtn = document.getElementById('eraserBtn');
const eraserCursor = document.getElementById('eraserCursor');
const toolbar = document.querySelector('.toolbar');
const colorPalette = document.getElementById('colorPalette');
const sizeSlider = document.getElementById('sizeSlider');
const sizePreviewDot = document.getElementById('sizePreviewDot');
const paperBtn = document.getElementById('paperBtn');
const paperMenu = document.getElementById('paperMenu');
const spacingSection = document.getElementById('spacingSection');
const backupBtn = document.getElementById('backupBtn');
const backupMenu = document.getElementById('backupMenu');
const exportBackupBtn = document.getElementById('exportBackupBtn');
const importBackupBtn = document.getElementById('importBackupBtn');
const importFileInput = document.getElementById('importFileInput');
const saveStatusEl = document.getElementById('saveStatus');

// Trạng thái vẽ / tẩy
let isInteracting = false;
let activeInteractionType = null;
let activePointerId = null;

let currentStroke = null;
let erasedInCurrentDrag = [];
let lastScreenX = 0;
let lastScreenY = 0;

// Trạng thái tự lưu
let saveTimer = null;
let isDirty = false;
let isSaving = false;
let pendingSave = false;

// Kéo thả thumbnail
let draggedPageIdx = null;

// ==========================================
// 3. Quản lý Màn hình (Danh sách Ghi chú, Thư mục vs Viết vẽ)
// ==========================================

function showEditorView() {
  if (noteListView) noteListView.style.display = 'none';
  if (editorView) editorView.style.display = 'flex';
  if (currentNoteTitleBadge) currentNoteTitleBadge.textContent = currentNoteTitle;

  setTimeout(() => {
    resizeCanvas();
  }, 50);
  resizeCanvas();
}

async function showNotesListView() {
  // Lưu ngay ghi chú đang viết dở trước khi ra danh sách
  await performSave();

  if (editorView) editorView.style.display = 'none';
  if (noteListView) noteListView.style.display = 'flex';

  // Khôi phục thư mục đã mở lần trước
  if (window.InkStorage) {
    const savedFolderId = window.InkStorage.getLastActiveFolderId();
    if (savedFolderId) {
      const f = await window.InkStorage.getFolder(savedFolderId);
      currentFolderId = f ? savedFolderId : null;
    } else {
      currentFolderId = null;
    }
  }

  await renderBreadcrumb();
  await renderNotesGrid();
}

/**
 * Hiển thị thanh đường dẫn phân cấp (Breadcrumb) và nút lùi 1 cấp
 */
async function renderBreadcrumb() {
  if (!breadcrumbNav) return;
  breadcrumbNav.innerHTML = '';

  if (!window.InkStorage) return;
  const trail = await window.InkStorage.getFolderBreadcrumb(currentFolderId);

  // Nút quay lại 1 cấp
  if (breadcrumbBackBtn) {
    if (trail.length > 1) {
      breadcrumbBackBtn.disabled = false;
      const parentCrumb = trail[trail.length - 2];
      breadcrumbBackBtn.onclick = () => {
        navigateToFolder(parentCrumb.id);
      };
    } else {
      breadcrumbBackBtn.disabled = true;
      breadcrumbBackBtn.onclick = null;
    }
  }

  // Từng mẩu trong đường dẫn
  trail.forEach((item, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '>';
      breadcrumbNav.appendChild(sep);
    }

    const isCurrent = (index === trail.length - 1);
    const span = document.createElement('span');
    span.className = `crumb-item ${isCurrent ? 'current' : ''}`;
    span.textContent = item.name;

    if (!isCurrent) {
      span.title = `Đi đến ${item.name}`;
      span.addEventListener('click', () => {
        navigateToFolder(item.id);
      });
    }

    breadcrumbNav.appendChild(span);
  });
}

/**
 * Chuyển đến xem thư mục chỉ định
 */
async function navigateToFolder(folderId) {
  currentFolderId = folderId || null;
  if (window.InkStorage) {
    window.InkStorage.setLastActiveFolderId(currentFolderId);
  }
  await renderBreadcrumb();
  await renderNotesGrid();
}

/**
 * Hiển thị danh sách Thư mục và Ghi chú lên giao diện
 */
async function renderNotesGrid() {
  if (!notesGrid) return;
  notesGrid.innerHTML = '<div style="grid-column: 1 / -1; padding: 24px; color: #57606a;">Đang tải dữ liệu...</div>';

  try {
    if (!window.InkStorage) return;

    // Lấy song song thư mục con và ghi chú trong thư mục hiện tại
    const [folders, summaries] = await Promise.all([
      window.InkStorage.listFolders(currentFolderId),
      window.InkStorage.listNotesSummary(currentFolderId)
    ]);

    // Cập nhật thống kê số lượng
    if (folderStats) {
      const parts = [];
      if (folders.length > 0) parts.push(`${folders.length} thư mục`);
      if (summaries.length > 0) parts.push(`${summaries.length} ghi chú`);
      folderStats.textContent = parts.length > 0 ? parts.join(', ') : 'Trống';
    }

    notesGrid.innerHTML = '';

    if (folders.length === 0 && summaries.length === 0) {
      notesGrid.innerHTML = '<div style="grid-column: 1 / -1; padding: 48px 20px; text-align: center; color: #57606a; font-size: 14px;">Thư mục này chưa có gì.<br>Hãy bấm <b>"Ghi chú mới"</b> hoặc <b>"Thư mục mới"</b> để bắt đầu!</div>';
      return;
    }

    // 1. Hiển thị THƯ MỤC trước (Folders first)
    for (const folder of folders) {
      const card = document.createElement('div');
      card.className = 'folder-card';

      // Hình bìa thư mục
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'folder-card-thumb-wrap';
      thumbWrap.innerHTML = `
        <svg class="folder-card-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15zM1.5 10.5V6a3 3 0 0 1 3-3h4.68a3 3 0 0 1 2.23 1l1.54 1.8a1 1 0 0 0 .75.33h5.8a3 3 0 0 1 3 3v1.37H1.5z"></path>
        </svg>
      `;

      // Huy hiệu số ghi chú bên trong
      let noteCount = 0;
      try {
        noteCount = await window.InkStorage.countNotesInFolder(folder.id, true);
      } catch (e) {
        console.warn('Lỗi đếm ghi chú:', e);
      }
      const badge = document.createElement('span');
      badge.className = 'folder-card-badge';
      badge.textContent = `${noteCount} ghi chú`;
      thumbWrap.appendChild(badge);

      // Thân thẻ
      const body = document.createElement('div');
      body.className = 'note-card-body';

      const titleRow = document.createElement('div');
      titleRow.className = 'note-card-title-row';

      const titleEl = document.createElement('span');
      titleEl.className = 'note-card-title';
      titleEl.textContent = folder.name;
      titleEl.title = folder.name;

      const actions = document.createElement('div');
      actions.className = 'note-card-actions';

      // Đổi tên thư mục
      const renameBtn = document.createElement('button');
      renameBtn.className = 'card-action-btn';
      renameBtn.title = 'Đổi tên thư mục';
      renameBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        </svg>
      `;
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newName = prompt('Nhập tên mới cho thư mục:', folder.name);
        if (newName && newName.trim() && newName.trim() !== folder.name) {
          folder.name = newName.trim();
          await window.InkStorage.saveFolder(folder);
          await renderBreadcrumb();
          await renderNotesGrid();
        }
      });

      // Xóa thư mục
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'card-action-btn delete-btn';
      deleteBtn.title = 'Xóa thư mục';
      deleteBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteFolderDialog(folder);
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      titleRow.appendChild(titleEl);
      titleRow.appendChild(actions);

      const dateEl = document.createElement('span');
      dateEl.className = 'note-card-date';
      const d = new Date(folder.updatedAt || Date.now());
      dateEl.textContent = `Sửa: ${d.toLocaleDateString('vi-VN')} lúc ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

      body.appendChild(titleRow);
      body.appendChild(dateEl);

      card.appendChild(thumbWrap);
      card.appendChild(body);

      // Bấm vào thẻ để mở thư mục
      card.addEventListener('click', () => {
        navigateToFolder(folder.id);
      });

      // Kéo thả ghi chú vào thư mục (Drag & Drop)
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });
      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const droppedNoteId = e.dataTransfer.getData('text/plain');
        if (droppedNoteId) {
          await window.InkStorage.moveNoteToFolder(droppedNoteId, folder.id);
          await renderBreadcrumb();
          await renderNotesGrid();
        }
      });

      notesGrid.appendChild(card);
    }

    // 2. Hiển thị GHI CHÚ
    summaries.forEach((summary) => {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.setAttribute('draggable', 'true');

      // Cho phép kéo thả thẻ ghi chú vào thư mục
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', summary.id);
        e.dataTransfer.effectAllowed = 'move';
      });

      // Hình thu nhỏ trang 1
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'note-card-thumb-wrap';

      if (summary.thumbnail) {
        const img = document.createElement('img');
        img.className = 'note-card-thumb';
        img.src = summary.thumbnail;
        thumbWrap.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'note-card-thumb-placeholder';
        placeholder.textContent = '📝';
        thumbWrap.appendChild(placeholder);
      }

      const badge = document.createElement('span');
      badge.className = 'note-card-badge';
      badge.textContent = `${summary.pageCount || 1} trang`;
      thumbWrap.appendChild(badge);

      // Thân thẻ
      const body = document.createElement('div');
      body.className = 'note-card-body';

      const titleRow = document.createElement('div');
      titleRow.className = 'note-card-title-row';

      const titleEl = document.createElement('span');
      titleEl.className = 'note-card-title';
      titleEl.textContent = summary.title;
      titleEl.title = summary.title;

      const actions = document.createElement('div');
      actions.className = 'note-card-actions';

      // Nút Chuyển vào thư mục...
      const moveBtn = document.createElement('button');
      moveBtn.className = 'card-action-btn move-btn';
      moveBtn.title = 'Chuyển vào thư mục khác...';
      moveBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          <polyline points="12 11 15 14 12 17"></polyline>
          <line x1="9" y1="14" x2="15" y2="14"></line>
        </svg>
      `;
      moveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showMoveNoteDialog(summary.id, summary.title);
      });

      // Nút đổi tên
      const renameBtn = document.createElement('button');
      renameBtn.className = 'card-action-btn';
      renameBtn.title = 'Đổi tên ghi chú';
      renameBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        </svg>
      `;
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newTitle = prompt('Nhập tên mới cho ghi chú:', summary.title);
        if (newTitle && newTitle.trim() && newTitle.trim() !== summary.title) {
          const note = await window.InkStorage.loadNote(summary.id);
          if (note) {
            note.title = newTitle.trim();
            await window.InkStorage.saveNote(note);
            if (currentNoteId === summary.id) {
              currentNoteTitle = note.title;
              if (currentNoteTitleBadge) currentNoteTitleBadge.textContent = currentNoteTitle;
            }
            await renderNotesGrid();
          }
        }
      });

      // Nút xóa ghi chú
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'card-action-btn delete-btn';
      deleteBtn.title = 'Xóa ghi chú này';
      deleteBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn ghi chú "${summary.title}" không?\n\nLưu ý: Thao tác này KHÔNG THỂ khôi phục được!`);
        if (confirmDelete) {
          await window.InkStorage.deleteNote(summary.id);
          if (currentNoteId === summary.id) {
            const remaining = await window.InkStorage.listNotesSummary(currentFolderId);
            if (remaining.length > 0) {
              await openNote(remaining[0].id);
            } else {
              await createNewNote();
            }
          }
          await renderBreadcrumb();
          await renderNotesGrid();
        }
      });

      actions.appendChild(moveBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);

      titleRow.appendChild(titleEl);
      titleRow.appendChild(actions);

      const dateEl = document.createElement('span');
      dateEl.className = 'note-card-date';
      const d = new Date(summary.updatedAt || Date.now());
      dateEl.textContent = `Sửa: ${d.toLocaleDateString('vi-VN')} lúc ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

      body.appendChild(titleRow);
      body.appendChild(dateEl);

      card.appendChild(thumbWrap);
      card.appendChild(body);

      // Bấm vào thẻ để mở ghi chú
      card.addEventListener('click', () => {
        openNote(summary.id);
      });

      notesGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Lỗi khi tải danh sách ghi chú:', err);
    notesGrid.innerHTML = '<div style="grid-column: 1 / -1; padding: 20px; color: #cf222e;">Lỗi khi tải dữ liệu thư mục và ghi chú.</div>';
  }
}

/**
 * Hiển thị Modal chọn thư mục để chuyển ghi chú vào
 */
async function showMoveNoteDialog(noteId, noteTitle) {
  noteToMoveId = noteId;
  if (moveModalNoteTitle) moveModalNoteTitle.textContent = `"${noteTitle}"`;
  if (!moveFolderList) return;

  moveFolderList.innerHTML = '<div style="padding: 10px; color: #57606a;">Đang tải danh sách thư mục...</div>';
  if (moveNoteModal) moveNoteModal.style.display = 'flex';

  try {
    const allFolders = await window.InkStorage.getAllFolders();
    const note = await window.InkStorage.loadNote(noteId);
    const noteCurrentFolder = note ? (note.folderId || null) : null;

    moveFolderList.innerHTML = '';

    // Lựa chọn: Thư mục gốc / Ngoài cùng
    const rootItem = document.createElement('div');
    rootItem.className = `move-folder-item ${noteCurrentFolder === null ? 'active-folder' : ''}`;
    rootItem.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      </svg>
      <span><b>Thư mục gốc (Tất cả ngoài cùng)</b> ${noteCurrentFolder === null ? '<i>(Đang ở đây)</i>' : ''}</span>
    `;

    if (noteCurrentFolder !== null) {
      rootItem.addEventListener('click', async () => {
        await window.InkStorage.moveNoteToFolder(noteToMoveId, null);
        hideMoveNoteDialog();
        await renderBreadcrumb();
        await renderNotesGrid();
      });
    }
    moveFolderList.appendChild(rootItem);

    // Hiển thị từng thư mục với đường dẫn đầy đủ
    for (const folder of allFolders) {
      const isCurrent = (noteCurrentFolder === folder.id);
      const fItem = document.createElement('div');
      fItem.className = `move-folder-item ${isCurrent ? 'active-folder' : ''}`;

      const trail = await window.InkStorage.getFolderBreadcrumb(folder.id);
      const trailStr = trail.map(t => t.name).join(' > ');

      fItem.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>${trailStr} ${isCurrent ? '<i>(Đang ở đây)</i>' : ''}</span>
      `;

      if (!isCurrent) {
        fItem.addEventListener('click', async () => {
          await window.InkStorage.moveNoteToFolder(noteToMoveId, folder.id);
          hideMoveNoteDialog();
          await renderBreadcrumb();
          await renderNotesGrid();
        });
      }

      moveFolderList.appendChild(fItem);
    }
  } catch (err) {
    console.error('Lỗi khi mở modal chuyển ghi chú:', err);
  }
}

function hideMoveNoteDialog() {
  noteToMoveId = null;
  if (moveNoteModal) moveNoteModal.style.display = 'none';
}

/**
 * Hiển thị Modal xác nhận xóa thư mục
 */
async function showDeleteFolderDialog(folder) {
  folderToDeleteId = folder.id;
  const count = await window.InkStorage.countNotesInFolder(folder.id, true);

  if (count === 0) {
    // Thư mục rỗng: xác nhận thông thường
    const ok = confirm(`Bạn có chắc chắn muốn xóa thư mục trống "${folder.name}" không?`);
    if (ok) {
      await window.InkStorage.deleteFolder(folder.id, 'cascade');
      await renderBreadcrumb();
      await renderNotesGrid();
    }
    return;
  }

  // Thư mục có ghi chú: mở modal cho người dùng chọn
  if (deleteFolderMessage) {
    deleteFolderMessage.innerHTML = `Thư mục <b>"${folder.name}"</b> đang chứa <b>${count}</b> ghi chú.<br><br>Bạn muốn xử lý các ghi chú này như thế nào?`;
  }
  if (deleteFolderModal) deleteFolderModal.style.display = 'flex';
}

function hideDeleteFolderDialog() {
  folderToDeleteId = null;
  if (deleteFolderModal) deleteFolderModal.style.display = 'none';
}

/**
 * Mở một ghi chú từ CSDL
 */
async function openNote(noteId) {
  // Lưu ghi chú đang viết hiện tại trước khi chuyển
  await performSave();

  try {
    const note = await window.InkStorage.loadNote(noteId);
    if (!note) return;

    currentNoteId = note.id;
    currentNoteTitle = note.title || 'Ghi chú không tên';
    currentNoteFolderId = note.folderId || null;
    currentNoteCreatedAt = note.createdAt || Date.now();

    pages = (note.pages || []).map((p, idx) => ({
      id: p.id || `page_${idx + 1}`,
      config: {
        background: p.config?.background || 'white',
        pattern: p.config?.pattern || 'none',
        spacing: p.config?.spacing || 'medium'
      },
      strokes: (p.strokes || []).map(s => {
        s.aabb = computeStrokeAABB(s);
        return s;
      }),
      view: p.view || { zoom: 1.0, panX: 0, panY: 0 },
      undoStack: [],
      redoStack: []
    }));

    if (pages.length === 0) {
      pages = [createNewPageObject()];
    }

    currentPageIndex = 0;
    loadActivePageState();
    renderSidebar();
    updatePaperUI();
    updateZoomUI();
    updateUndoRedoUI();
    showEditorView();
    renderAll();

    window.InkStorage.setLastActiveNoteId(currentNoteId);
  } catch (err) {
    console.error('Lỗi khi mở ghi chú:', err);
    alert('Không thể mở ghi chú này: ' + err.message);
  }
}

/**
 * Tạo một ghi chú mới với tên mặc định theo ngày hôm nay (trong thư mục hiện tại)
 */
async function createNewNote() {
  await performSave();

  const todayStr = new Date().toISOString().slice(0, 10);
  const allNotes = await window.InkStorage.getAllNotes();
  const existingTitles = new Set(allNotes.map(s => s.title));

  let candidateTitle = todayStr;
  let counter = 1;
  while (existingTitles.has(candidateTitle)) {
    candidateTitle = `${todayStr} (${counter})`;
    counter++;
  }

  currentNoteFolderId = currentFolderId || null;
  const newNote = window.InkStorage.createDefaultNote(candidateTitle, currentNoteFolderId);
  await window.InkStorage.saveNote(newNote);

  await openNote(newNote.id);
}

// ==========================================
// 4. Logic Quản lý Trang (Pages)
// ==========================================

function saveActivePageState() {
  const p = pages[currentPageIndex];
  if (!p) return;
  p.config = { ...pageConfig };
  p.strokes = [...strokes];
  p.view = { zoom, panX, panY };
  p.undoStack = [...undoStack];
  p.redoStack = [...redoStack];
}

function loadActivePageState() {
  const p = pages[currentPageIndex];
  if (!p) return;

  pageConfig = { ...p.config };

  strokes = [];
  for (const s of p.strokes) {
    if (!s.aabb) s.aabb = computeStrokeAABB(s);
    strokes.push(s);
  }

  undoStack = p.undoStack ? [...p.undoStack] : [];
  redoStack = p.redoStack ? [...p.redoStack] : [];

  zoom = p.view?.zoom || 1.0;
  if (p.view?.panX !== undefined && p.view?.panY !== undefined && (p.view.panX !== 0 || p.view.panY !== 0)) {
    panX = p.view.panX;
    panY = p.view.panY;
  } else {
    centerPage(zoom);
  }
}

function switchPage(newIndex) {
  if (newIndex < 0 || newIndex >= pages.length || newIndex === currentPageIndex) return;

  saveActivePageState();
  currentPageIndex = newIndex;
  loadActivePageState();

  updatePaperUI();
  updateZoomUI();
  updateUndoRedoUI();
  renderSidebar();
  renderAll();
}

function addNewPage() {
  saveActivePageState();

  const currentP = pages[currentPageIndex];
  const newP = createNewPageObject(currentP ? currentP.config : null);

  const insertIndex = currentPageIndex + 1;
  pages.splice(insertIndex, 0, newP);

  currentPageIndex = insertIndex;
  loadActivePageState();
  centerPage(1.0);

  updatePaperUI();
  updateZoomUI();
  updateUndoRedoUI();
  renderSidebar();
  renderAll();

  scheduleAutoSave();
}

function deleteCurrentPage() {
  if (pages.length <= 1) {
    alert('Ghi chú phải có ít nhất 1 trang, không thể xóa!');
    return;
  }

  const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa Trang ${currentPageIndex + 1} không?`);
  if (!confirmDelete) return;

  pages.splice(currentPageIndex, 1);
  if (currentPageIndex >= pages.length) {
    currentPageIndex = pages.length - 1;
  }

  loadActivePageState();
  updatePaperUI();
  updateZoomUI();
  updateUndoRedoUI();
  renderSidebar();
  renderAll();

  scheduleAutoSave();
}

// ==========================================
// 5. Render Thumbnail & Sidebar
// ==========================================

function drawThumbnailCanvas(thumbCanvas, page) {
  const tCtx = thumbCanvas.getContext('2d');
  tCtx.save();
  tCtx.setTransform(1, 0, 0, 1, 0, 0);
  tCtx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);

  tCtx.scale(thumbCanvas.width / PAGE_WIDTH, thumbCanvas.height / PAGE_HEIGHT);

  const bg = BACKGROUND_COLORS[page.config.background] || '#ffffff';
  tCtx.fillStyle = bg;
  tCtx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  if (page.config.pattern !== 'none') {
    const isDark = page.config.background === 'dark';
    tCtx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)';
    tCtx.lineWidth = 1.2;
    tCtx.beginPath();

    if (page.config.pattern === 'ruled') {
      const step = SPACING_SIZES.ruled[page.config.spacing] || 50;
      for (let y = 80; y < PAGE_HEIGHT - 30; y += step) {
        tCtx.moveTo(0, y);
        tCtx.lineTo(PAGE_WIDTH, y);
      }
    } else if (page.config.pattern === 'grid') {
      const step = SPACING_SIZES.grid[page.config.spacing] || 45;
      for (let x = step; x < PAGE_WIDTH; x += step) {
        tCtx.moveTo(x, 0);
        tCtx.lineTo(x, PAGE_HEIGHT);
      }
      for (let y = step; y < PAGE_HEIGHT; y += step) {
        tCtx.moveTo(0, y);
        tCtx.lineTo(PAGE_WIDTH, y);
      }
    }
    tCtx.stroke();
  }

  for (let i = 0; i < page.strokes.length; i++) {
    drawStroke(tCtx, page.strokes[i]);
  }

  tCtx.restore();
}

function updateCurrentPageThumbnail() {
  saveActivePageState();
  const currentItem = document.querySelector(`.thumbnail-item[data-index="${currentPageIndex}"]`);
  if (currentItem) {
    const thumbCanvas = currentItem.querySelector('.thumb-canvas');
    if (thumbCanvas) {
      drawThumbnailCanvas(thumbCanvas, pages[currentPageIndex]);
    }
  }
}

function renderSidebar() {
  if (!thumbnailList) return;
  thumbnailList.innerHTML = '';

  if (pageCountEl) {
    pageCountEl.textContent = pages.length;
  }
  if (deletePageBtn) {
    deletePageBtn.disabled = pages.length <= 1;
  }

  pages.forEach((page, idx) => {
    const item = document.createElement('div');
    item.className = `thumbnail-item ${idx === currentPageIndex ? 'active' : ''}`;
    item.setAttribute('data-index', idx);
    item.setAttribute('draggable', 'true');

    const card = document.createElement('div');
    card.className = 'thumbnail-card';

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'thumb-canvas';
    thumbCanvas.width = 120;
    thumbCanvas.height = 170;
    card.appendChild(thumbCanvas);

    const badge = document.createElement('span');
    badge.className = 'page-badge';
    badge.textContent = idx + 1;

    item.appendChild(card);
    item.appendChild(badge);

    item.addEventListener('click', () => {
      switchPage(idx);
    });

    thumbnailList.appendChild(item);
    drawThumbnailCanvas(thumbCanvas, page);
  });
}

// Kéo thả thumbnail đổi thứ tự trang
if (thumbnailList) {
  thumbnailList.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.thumbnail-item');
    if (!item) return;
    draggedPageIdx = parseInt(item.getAttribute('data-index'), 10);
    e.dataTransfer.effectAllowed = 'move';
    item.style.opacity = '0.5';
  });

  thumbnailList.addEventListener('dragend', (e) => {
    const item = e.target.closest('.thumbnail-item');
    if (item) item.style.opacity = '1';
    document.querySelectorAll('.thumbnail-item').forEach(el => el.classList.remove('drag-over'));
  });

  thumbnailList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.thumbnail-item');
    if (item) {
      document.querySelectorAll('.thumbnail-item').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    }
  });

  thumbnailList.addEventListener('drop', (e) => {
    e.preventDefault();
    const item = e.target.closest('.thumbnail-item');
    if (!item || draggedPageIdx === null) return;
    const targetIdx = parseInt(item.getAttribute('data-index'), 10);
    if (targetIdx === draggedPageIdx) return;

    saveActivePageState();

    const [movedPage] = pages.splice(draggedPageIdx, 1);
    pages.splice(targetIdx, 0, movedPage);

    if (currentPageIndex === draggedPageIdx) {
      currentPageIndex = targetIdx;
    } else if (draggedPageIdx < currentPageIndex && targetIdx >= currentPageIndex) {
      currentPageIndex--;
    } else if (draggedPageIdx > currentPageIndex && targetIdx <= currentPageIndex) {
      currentPageIndex++;
    }

    renderSidebar();
    scheduleAutoSave();
  });
}

// ==========================================
// 6. Chuyển đổi tọa độ & Căn giữa trang
// ==========================================

function getPaperPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - panX) / zoom;
  const y = (e.clientY - rect.top - panY) / zoom;
  return { x, y };
}

function centerPage(targetZoom = 1.0) {
  zoom = targetZoom;
  const rect = canvas.getBoundingClientRect();
  panX = (rect.width - PAGE_WIDTH * zoom) / 2;
  panY = rect.height > PAGE_HEIGHT * zoom
    ? (rect.height - PAGE_HEIGHT * zoom) / 2
    : 36;
  updateZoomUI();
}

function updateZoomUI() {
  if (resetZoomBtn) {
    resetZoomBtn.textContent = `${Math.round(zoom * 100)}%`;
  }
}

function updateUndoRedoUI() {
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function setTool(tool) {
  currentTool = tool;
  if (penBtn) penBtn.classList.toggle('active', tool === 'pen');
  if (eraserBtn) eraserBtn.classList.toggle('active', tool === 'eraser');

  if (tool === 'eraser') {
    canvas.style.cursor = 'none';
  } else {
    canvas.style.cursor = 'crosshair';
    if (eraserCursor) eraserCursor.style.display = 'none';
  }
}

function updateSizeAndColorPreview() {
  if (sizePreviewDot) {
    const visualSize = Math.max(3, Math.min(22, currentWidth));
    sizePreviewDot.style.width = `${visualSize}px`;
    sizePreviewDot.style.height = `${visualSize}px`;
    sizePreviewDot.style.backgroundColor = currentColor;
  }
}

function updatePaperUI() {
  if (paperMenu) {
    const patternGroup = document.getElementById('patternGroup');
    if (patternGroup) {
      patternGroup.querySelectorAll('.pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-pattern') === pageConfig.pattern);
      });
    }

    const spacingGroup = document.getElementById('spacingGroup');
    if (spacingGroup) {
      spacingGroup.querySelectorAll('.pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-spacing') === pageConfig.spacing);
      });
    }

    const bgColorGroup = document.getElementById('bgColorGroup');
    if (bgColorGroup) {
      bgColorGroup.querySelectorAll('.bg-color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-bg') === pageConfig.background);
      });
    }

    if (spacingSection) {
      spacingSection.style.display = pageConfig.pattern === 'none' ? 'none' : 'flex';
    }
  }
}

// ==========================================
// 7. Quản lý Tự lưu & Dữ liệu (Storage)
// ==========================================

function setSaveStatus(type, message) {
  if (!saveStatusEl) return;
  saveStatusEl.className = 'save-status';
  if (type === 'saving') {
    saveStatusEl.classList.add('saving');
  } else if (type === 'error') {
    saveStatusEl.classList.add('error');
  }
  saveStatusEl.textContent = message;
}

function scheduleAutoSave() {
  isDirty = true;
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    performSave();
  }, 10000);
}

async function performSave() {
  if (isSaving) {
    pendingSave = true;
    return;
  }

  if (!isDirty && !pendingSave) return;

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  isSaving = true;
  pendingSave = false;
  setSaveStatus('saving', 'Đang lưu...');

  try {
    saveActivePageState();

    // Sinh ảnh thumbnail trang 1 để lưu cùng ghi chú
    let page1ThumbUrl = '';
    if (pages.length > 0) {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 120;
      offCanvas.height = 170;
      drawThumbnailCanvas(offCanvas, pages[0]);
      page1ThumbUrl = offCanvas.toDataURL('image/webp', 0.65);
    }

    const noteData = {
      version: 2,
      id: currentNoteId,
      title: currentNoteTitle,
      folderId: currentNoteFolderId || null,
      createdAt: currentNoteCreatedAt || Date.now(),
      updatedAt: Date.now(),
      thumbnail: page1ThumbUrl,
      pages: pages.map(p => ({
        id: p.id,
        config: { ...p.config },
        strokes: p.strokes.map(s => ({
          points: s.points,
          color: s.color,
          baseWidth: s.baseWidth
        })),
        view: {
          zoom: p.view ? p.view.zoom : 1.0,
          panX: p.view ? p.view.panX : 0,
          panY: p.view ? p.view.panY : 0
        }
      }))
    };

    if (window.InkStorage) {
      await window.InkStorage.saveNote(noteData);
    }

    isDirty = false;
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setSaveStatus('saved', `Đã lưu ${timeStr}`);
  } catch (err) {
    console.error('Lỗi khi lưu dữ liệu:', err);
    setSaveStatus('error', 'Lưu thất bại: ' + (err.message || 'Lỗi hệ thống'));
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      performSave();
    }
  }
}

async function loadInitialData() {
  setSaveStatus('saving', 'Đang tải...');
  try {
    if (!window.InkStorage) {
      setSaveStatus('saved', 'Đã sẵn sàng');
      return;
    }

    // 1. Tìm ghi chú mở gần nhất
    const lastActiveId = window.InkStorage.getLastActiveNoteId();
    let noteToOpen = null;

    if (lastActiveId) {
      noteToOpen = await window.InkStorage.loadNote(lastActiveId);
    }

    // 2. Nếu chưa có, lấy ghi chú mới nhất từ danh sách
    if (!noteToOpen) {
      const allNotes = await window.InkStorage.getAllNotes();
      if (allNotes.length > 0) {
        allNotes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        noteToOpen = allNotes[0];
      }
    }

    // 3. Nếu chưa có ghi chú nào trong DB, tạo một ghi chú mới mặc định
    if (!noteToOpen) {
      noteToOpen = window.InkStorage.createDefaultNote();
      await window.InkStorage.saveNote(noteToOpen);
    }

    // 4. Mở ghi chú
    await openNote(noteToOpen.id);
  } catch (err) {
    console.error('Lỗi khởi động app:', err);
    setSaveStatus('error', 'Lỗi khởi động dữ liệu');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && isDirty) {
    performSave();
  }
});

window.addEventListener('pagehide', () => {
  if (isDirty) {
    performSave();
  }
});

// ==========================================
// 8. Hệ thống Undo / Redo cho từng trang
// ==========================================

function executeAction(action) {
  action.do();
  undoStack.push(action);
  redoStack.length = 0;
  updateUndoRedoUI();
  updateCurrentPageThumbnail();
  scheduleAutoSave();
  renderAll();
}

function undo() {
  if (undoStack.length === 0) return;
  const action = undoStack.pop();
  action.undo();
  redoStack.push(action);
  updateUndoRedoUI();
  updateCurrentPageThumbnail();
  scheduleAutoSave();
  renderAll();
}

function redo() {
  if (redoStack.length === 0) return;
  const action = redoStack.pop();
  action.do();
  undoStack.push(action);
  updateUndoRedoUI();
  updateCurrentPageThumbnail();
  scheduleAutoSave();
  renderAll();
}

// ==========================================
// 9. Thuật toán va chạm Bút & Tẩy
// ==========================================

function computeStrokeAABB(stroke) {
  const pts = stroke.points;
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = (stroke.baseWidth || 5);
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function distToSegmentSq(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

function isStrokeHitByEraser(stroke, eX, eY, rPaper) {
  if (!stroke.aabb) {
    stroke.aabb = computeStrokeAABB(stroke);
  }

  if (
    eX + rPaper < stroke.aabb.minX ||
    eX - rPaper > stroke.aabb.maxX ||
    eY + rPaper < stroke.aabb.minY ||
    eY - rPaper > stroke.aabb.maxY
  ) {
    return false;
  }

  const pts = stroke.points;
  const threshold = rPaper + (stroke.baseWidth || 5) / 2;
  const thresholdSq = threshold * threshold;

  if (pts.length === 1) {
    const dx = eX - pts[0].x;
    const dy = eY - pts[0].y;
    return (dx * dx + dy * dy) <= thresholdSq;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegmentSq(eX, eY, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= thresholdSq) {
      return true;
    }
  }

  return false;
}

function isPhysicalEraserTip(e) {
  return (e.buttons & 32) === 32 || e.button === 5 || e.pointerType === 'eraser';
}

// ==========================================
// 10. Hàm vẽ nét DUY NHẤT (Single Source of Truth)
// ==========================================

function drawStroke(targetCtx, stroke) {
  if (!stroke || !stroke.points || stroke.points.length === 0) return;

  const getStroke = (window.perfectFreehand && window.perfectFreehand.getStroke)
    ? window.perfectFreehand.getStroke
    : null;

  if (!getStroke) return;

  const inputPoints = stroke.points.map(p => [p.x, p.y, p.pressure]);

  const outline = getStroke(inputPoints, {
    size: stroke.baseWidth || 5,
    thinning: 0.5,
    smoothing: 0.55,
    streamline: 0.5,
    easing: t => t,
    simulatePressure: false,
    last: stroke.isFinished !== false
  });

  if (!outline || outline.length === 0) return;

  targetCtx.save();
  targetCtx.fillStyle = stroke.color || '#1a1a1a';
  targetCtx.beginPath();

  const len = outline.length;
  targetCtx.moveTo(outline[0][0], outline[0][1]);

  for (let i = 0; i < len; i++) {
    const curr = outline[i];
    const next = outline[(i + 1) % len];
    const midX = (curr[0] + next[0]) / 2;
    const midY = (curr[1] + next[1]) / 2;
    targetCtx.quadraticCurveTo(curr[0], curr[1], midX, midY);
  }

  targetCtx.closePath();
  targetCtx.fill();
  targetCtx.restore();
}

function drawPaperPattern(targetCtx) {
  if (pageConfig.pattern === 'none') return;

  const isDark = pageConfig.background === 'dark';

  targetCtx.save();
  targetCtx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.11)';
  targetCtx.lineWidth = 1 / zoom;
  targetCtx.beginPath();

  if (pageConfig.pattern === 'ruled') {
    const step = (SPACING_SIZES.ruled[pageConfig.spacing] || 50);
    const startY = 80;
    for (let y = startY; y < PAGE_HEIGHT - 30; y += step) {
      targetCtx.moveTo(0, y);
      targetCtx.lineTo(PAGE_WIDTH, y);
    }
  } else if (pageConfig.pattern === 'grid') {
    const step = (SPACING_SIZES.grid[pageConfig.spacing] || 45);
    for (let x = step; x < PAGE_WIDTH; x += step) {
      targetCtx.moveTo(x, 0);
      targetCtx.lineTo(x, PAGE_HEIGHT);
    }
    for (let y = step; y < PAGE_HEIGHT; y += step) {
      targetCtx.moveTo(0, y);
      targetCtx.lineTo(PAGE_WIDTH, y);
    }
  }

  targetCtx.stroke();
  targetCtx.restore();
}

function renderAll() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#e9ecef';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const bgColor = BACKGROUND_COLORS[pageConfig.background] || '#ffffff';
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.14)';
  ctx.shadowBlur = Math.min(24, 16 * zoom);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.min(8, 4 * zoom);
  ctx.fillStyle = bgColor;
  ctx.fillRect(panX, panY, PAGE_WIDTH * zoom, PAGE_HEIGHT * zoom);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(panX, panY, PAGE_WIDTH * zoom, PAGE_HEIGHT * zoom);
  ctx.clip();

  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  drawPaperPattern(ctx);

  for (let i = 0; i < strokes.length; i++) {
    drawStroke(ctx, strokes[i]);
  }

  if (currentStroke) {
    drawStroke(ctx, currentStroke);
  }

  ctx.restore();
}

// ==========================================
// 11. Quản lý kích thước Canvas
// ==========================================
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  renderAll();
}

window.addEventListener('resize', resizeCanvas);

// ==========================================
// 12. Thao tác Zoom & Pan
// ==========================================

window.addEventListener('wheel', (e) => {
  if (noteListView && noteListView.style.display !== 'none') return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();

  if (e.ctrlKey) {
    const oldZoom = zoom;
    const zoomFactor = Math.exp(-e.deltaY * 0.008);
    const newZoom = Math.min(5.0, Math.max(0.25, zoom * zoomFactor));

    if (newZoom !== oldZoom) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const paperX = (mouseX - panX) / oldZoom;
      const paperY = (mouseY - panY) / oldZoom;

      panX = mouseX - paperX * newZoom;
      panY = mouseY - paperY * newZoom;
      zoom = newZoom;

      updateZoomUI();
      renderAll();
    }
  } else {
    panX -= e.deltaX;
    panY -= e.deltaY;
    renderAll();
  }
}, { passive: false });

if (resetZoomBtn) {
  resetZoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    centerPage(1.0);
    renderAll();
  });
  resetZoomBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

// ==========================================
// 13. Gắn sự kiện Thanh công cụ & Menu
// ==========================================

if (openNotesBtn) {
  openNotesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showNotesListView();
  });
  openNotesBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (backToEditorBtn) {
  backToEditorBtn.addEventListener('click', () => {
    showEditorView();
  });
}

if (newNoteBtn) {
  newNoteBtn.addEventListener('click', () => {
    createNewNote();
  });
}

function showNewFolderDialog() {
  if (newFolderModal) {
    if (newFolderNameInput) {
      newFolderNameInput.value = 'Thư mục mới';
    }
    newFolderModal.style.display = 'flex';
    setTimeout(() => {
      if (newFolderNameInput) {
        if (typeof newFolderNameInput.focus === 'function') newFolderNameInput.focus();
        if (typeof newFolderNameInput.select === 'function') newFolderNameInput.select();
      }
    }, 50);
  } else {
    const name = prompt('Nhập tên thư mục mới:', 'Thư mục mới');
    if (name && name.trim()) {
      createNewFolderDirectly(name.trim());
    }
  }
}

function hideNewFolderDialog() {
  if (newFolderModal) {
    newFolderModal.style.display = 'none';
  }
}

async function createNewFolderDirectly(name) {
  try {
    if (window.InkStorage) {
      const newFolder = window.InkStorage.createDefaultFolder(name, currentFolderId);
      await window.InkStorage.saveFolder(newFolder);
      await renderBreadcrumb();
      await renderNotesGrid();
    }
  } catch (err) {
    console.error('Lỗi khi tạo thư mục:', err);
    alert('Không thể tạo thư mục: ' + (err.message || 'Lỗi hệ thống'));
  }
}

if (newFolderBtn) {
  newFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showNewFolderDialog();
  });
  newFolderBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (closeNewFolderModalBtn) {
  closeNewFolderModalBtn.addEventListener('click', hideNewFolderDialog);
}
if (cancelNewFolderBtn) {
  cancelNewFolderBtn.addEventListener('click', hideNewFolderDialog);
}
if (newFolderModal) {
  newFolderModal.addEventListener('click', (e) => {
    if (e.target === newFolderModal) hideNewFolderDialog();
  });
}

if (newFolderForm) {
  newFolderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newFolderNameInput ? newFolderNameInput.value.trim() : '';
    if (!name) return;

    hideNewFolderDialog();
    await createNewFolderDirectly(name);
  });
}

// Modal Chuyển Ghi chú
if (closeMoveModalBtn) {
  closeMoveModalBtn.addEventListener('click', hideMoveNoteDialog);
}
if (cancelMoveBtn) {
  cancelMoveBtn.addEventListener('click', hideMoveNoteDialog);
}
if (moveNoteModal) {
  moveNoteModal.addEventListener('click', (e) => {
    if (e.target === moveNoteModal) hideMoveNoteDialog();
  });
}

// Modal Xóa Thư mục
if (closeDeleteFolderModalBtn) {
  closeDeleteFolderModalBtn.addEventListener('click', hideDeleteFolderDialog);
}
if (cancelDeleteFolderBtn) {
  cancelDeleteFolderBtn.addEventListener('click', hideDeleteFolderDialog);
}
if (deleteFolderModal) {
  deleteFolderModal.addEventListener('click', (e) => {
    if (e.target === deleteFolderModal) hideDeleteFolderDialog();
  });
}

if (deleteFolderOrphanBtn) {
  deleteFolderOrphanBtn.addEventListener('click', async () => {
    if (!folderToDeleteId || !window.InkStorage) return;
    await window.InkStorage.deleteFolder(folderToDeleteId, 'orphan');
    hideDeleteFolderDialog();
    await renderBreadcrumb();
    await renderNotesGrid();
  });
}

if (deleteFolderCascadeBtn) {
  deleteFolderCascadeBtn.addEventListener('click', async () => {
    if (!folderToDeleteId || !window.InkStorage) return;
    const ok = confirm('Bạn có CHẮC CHẮN muốn xóa vĩnh viễn cả thư mục này và TOÀN BỘ ghi chú bên trong không?\n\nThao tác này KHÔNG THỂ khôi phục lại được!');
    if (ok) {
      await window.InkStorage.deleteFolder(folderToDeleteId, 'cascade');
      hideDeleteFolderDialog();
      await renderBreadcrumb();
      await renderNotesGrid();
    }
  });
}

if (notesBackupBtn) {
  notesBackupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBackupMenu(notesBackupBtn);
  });
}

// Bật/Tắt Sidebar
if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      sidebarToggleBtn.classList.toggle('active', !sidebar.classList.contains('collapsed'));

      setTimeout(() => {
        resizeCanvas();
      }, 240);
      resizeCanvas();
    }
  });
  sidebarToggleBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

// Nút Thêm / Xóa trang
if (addPageBtn) {
  addPageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addNewPage();
  });
}

if (deletePageBtn) {
  deletePageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteCurrentPage();
  });
}

// Chuyển đổi Bút / Tẩy
if (penBtn) {
  penBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setTool('pen');
  });
  penBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (eraserBtn) {
  eraserBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setTool('eraser');
  });
  eraserBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

// Bảng chọn màu
if (colorPalette) {
  colorPalette.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    e.stopPropagation();

    currentColor = swatch.getAttribute('data-color') || '#1a1a1a';
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');

    updateSizeAndColorPreview();
    if (currentTool === 'eraser') {
      setTool('pen');
    }
  });

  colorPalette.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

// Thanh trượt cỡ nét
if (sizeSlider) {
  sizeSlider.addEventListener('input', (e) => {
    currentWidth = parseFloat(e.target.value) || 5;
    updateSizeAndColorPreview();

    if (currentTool === 'eraser') {
      setTool('pen');
    }
  });

  sizeSlider.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

// Menu Cài đặt Giấy
function togglePaperMenu() {
  if (!paperMenu || !paperBtn) return;
  const isOpen = paperMenu.classList.contains('open');

  if (isOpen) {
    paperMenu.classList.remove('open');
  } else {
    if (backupMenu) backupMenu.classList.remove('open');
    const rect = paperBtn.getBoundingClientRect();
    const parentRect = canvas.getBoundingClientRect();
    paperMenu.style.top = `${rect.bottom - parentRect.top + 8}px`;
    paperMenu.style.left = `${Math.min(parentRect.width - 275, Math.max(10, rect.left - parentRect.left - 120))}px`;
    paperMenu.classList.add('open');
  }
}

if (paperBtn) {
  paperBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePaperMenu();
  });
  paperBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (paperMenu) {
  paperMenu.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  const patternGroup = document.getElementById('patternGroup');
  if (patternGroup) {
    patternGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      e.stopPropagation();

      pageConfig.pattern = btn.getAttribute('data-pattern') || 'none';
      patternGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (spacingSection) {
        spacingSection.style.display = pageConfig.pattern === 'none' ? 'none' : 'flex';
      }

      updateCurrentPageThumbnail();
      scheduleAutoSave();
      renderAll();
    });
  }

  const spacingGroup = document.getElementById('spacingGroup');
  if (spacingGroup) {
    spacingGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      e.stopPropagation();

      pageConfig.spacing = btn.getAttribute('data-spacing') || 'medium';
      spacingGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      updateCurrentPageThumbnail();
      scheduleAutoSave();
      renderAll();
    });
  }

  const bgColorGroup = document.getElementById('bgColorGroup');
  if (bgColorGroup) {
    bgColorGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.bg-color-btn');
      if (!btn) return;
      e.stopPropagation();

      pageConfig.background = btn.getAttribute('data-bg') || 'white';
      bgColorGroup.querySelectorAll('.bg-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      updateCurrentPageThumbnail();
      scheduleAutoSave();
      renderAll();
    });
  }
}

// Menu Sao lưu & Phục hồi
function toggleBackupMenu(anchorEl = backupBtn) {
  if (!backupMenu || !anchorEl) return;
  const isOpen = backupMenu.classList.contains('open');

  if (isOpen) {
    backupMenu.classList.remove('open');
  } else {
    if (paperMenu) paperMenu.classList.remove('open');
    const rect = anchorEl.getBoundingClientRect();
    backupMenu.style.top = `${rect.bottom + 8}px`;
    backupMenu.style.left = `${Math.min(window.innerWidth - 245, Math.max(10, rect.left - 100))}px`;
    backupMenu.classList.add('open');
  }
}

if (backupBtn) {
  backupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBackupMenu(backupBtn);
  });
  backupBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (backupMenu) {
  backupMenu.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

// Xuất file sao lưu toàn bộ các ghi chú
if (exportBackupBtn) {
  exportBackupBtn.addEventListener('click', async () => {
    if (backupMenu) backupMenu.classList.remove('open');
    await performSave();

    if (window.InkStorage) {
      setSaveStatus('saving', 'Đang xuất file...');
      await window.InkStorage.exportAllNotesToFile();
      setSaveStatus('saved', 'Đã xuất file sao lưu');
    }
  });
}

// Nhập file sao lưu (thêm vào CSDL, không ghi đè)
if (importBackupBtn && importFileInput) {
  importBackupBtn.addEventListener('click', () => {
    importFileInput.value = '';
    importFileInput.click();
  });

  importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (backupMenu) backupMenu.classList.remove('open');
    setSaveStatus('saving', 'Đang nhập file...');

    try {
      if (!window.InkStorage) throw new Error('Mô-đun lưu trữ chưa sẵn sàng');
      const result = await window.InkStorage.importNotesFromFile(file);
      const noteCount = (typeof result === 'object') ? (result.noteCount || 0) : result;
      const folderCount = (typeof result === 'object') ? (result.folderCount || 0) : 0;

      setSaveStatus('saved', `Đã nhập ${noteCount} ghi chú`);
      alert(`Đã nhập thành công ${folderCount} thư mục và ${noteCount} ghi chú vào danh sách!`);

      // Cập nhật lại danh sách hoặc mở lại
      if (noteListView && noteListView.style.display !== 'none') {
        await renderBreadcrumb();
        await renderNotesGrid();
      } else {
        await loadInitialData();
      }
    } catch (err) {
      console.error('Lỗi khi nhập file:', err);
      setSaveStatus('error', err.message || 'Lỗi nhập file');
      alert('Không thể nhập file sao lưu: ' + err.message);
    }
  });
}

window.addEventListener('click', (e) => {
  if (paperMenu && paperMenu.classList.contains('open')) {
    if (!paperMenu.contains(e.target) && !paperBtn.contains(e.target)) {
      paperMenu.classList.remove('open');
    }
  }
  if (backupMenu && backupMenu.classList.contains('open')) {
    if (!backupMenu.contains(e.target) && !backupBtn.contains(e.target) && (!notesBackupBtn || !notesBackupBtn.contains(e.target))) {
      backupMenu.classList.remove('open');
    }
  }
});

// Nút Undo / Redo
if (undoBtn) {
  undoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    undo();
  });
  undoBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (redoBtn) {
  redoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    redo();
  });
  redoBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (toolbar) {
  toolbar.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideNewFolderDialog();
    hideMoveNoteDialog();
    hideDeleteFolderDialog();
    if (paperMenu) paperMenu.classList.remove('open');
    if (backupMenu) backupMenu.classList.remove('open');
    return;
  }

  // Không nhận phím tắt vẽ khi đang ở màn hình danh sách
  if (noteListView && noteListView.style.display !== 'none') return;

  if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey) {
    setTool('pen');
  } else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey) {
    setTool('eraser');
  } else if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undo();
  } else if (
    (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) ||
    (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
  ) {
    e.preventDefault();
    redo();
  }
});

// ==========================================
// 14. Vòng tròn chỉ thị đầu Tẩy
// ==========================================

function updateEraserCursorPosition(clientX, clientY) {
  if (eraserCursor) {
    eraserCursor.style.left = `${clientX}px`;
    eraserCursor.style.top = `${clientY}px`;
    eraserCursor.style.display = 'block';
  }
}

window.addEventListener('pointermove', (e) => {
  if (noteListView && noteListView.style.display !== 'none') {
    if (eraserCursor) eraserCursor.style.display = 'none';
    return;
  }

  if (currentTool === 'eraser' || isPhysicalEraserTip(e)) {
    updateEraserCursorPosition(e.clientX, e.clientY);
  } else if (!isInteracting) {
    if (eraserCursor) eraserCursor.style.display = 'none';
  }
});

canvas.addEventListener('pointerleave', () => {
  if (!isInteracting && eraserCursor) {
    eraserCursor.style.display = 'none';
  }
});

// ==========================================
// 15. Xử lý sự kiện bút cảm ứng (Vẽ & Tẩy)
// ==========================================

canvas.addEventListener('pointerdown', (e) => {
  if (noteListView && noteListView.style.display !== 'none') return;
  if (e.pointerType !== 'pen' && e.pointerType !== 'eraser') return;
  if (isInteracting) return;

  const paperPt = getPaperPoint(e);

  if (paperPt.x < 0 || paperPt.x > PAGE_WIDTH || paperPt.y < 0 || paperPt.y > PAGE_HEIGHT) {
    return;
  }

  const isErasing = currentTool === 'eraser' || isPhysicalEraserTip(e);

  e.preventDefault();
  isInteracting = true;
  activeInteractionType = isErasing ? 'eraser' : 'pen';
  activePointerId = e.pointerId;

  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {}

  lastScreenX = e.clientX;
  lastScreenY = e.clientY;

  if (isErasing) {
    updateEraserCursorPosition(e.clientX, e.clientY);
    erasedInCurrentDrag = [];
    checkAndEraseStrokes(paperPt.x, paperPt.y);
  } else {
    const rawPressure = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;
    currentStroke = {
      points: [{ x: paperPt.x, y: paperPt.y, pressure: rawPressure }],
      color: currentColor,
      baseWidth: currentWidth,
      isFinished: false
    };
    renderAll();
  }
});

function checkAndEraseStrokes(paperX, paperY) {
  const rPaper = ERASER_RADIUS_SCREEN / zoom;
  let hasErased = false;

  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (isStrokeHitByEraser(s, paperX, paperY, rPaper)) {
      erasedInCurrentDrag.push({ stroke: s, originalIndex: i });
      strokes.splice(i, 1);
      hasErased = true;
    }
  }

  if (hasErased) {
    renderAll();
  }
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'pen' && e.pointerType !== 'eraser') return;
  if (!isInteracting || e.pointerId !== activePointerId) return;

  if (e.buttons === 0) {
    handlePointerEnd(e);
    return;
  }

  e.preventDefault();

  const events = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0)
    ? e.getCoalescedEvents()
    : [e];

  if (activeInteractionType === 'eraser') {
    updateEraserCursorPosition(e.clientX, e.clientY);

    for (const ev of events) {
      const pt = getPaperPoint(ev);
      checkAndEraseStrokes(pt.x, pt.y);
    }
  } else {
    let hasNewPoints = false;

    for (const ev of events) {
      if (ev.pointerType !== 'pen' && ev.pointerType !== 'eraser') continue;

      const distScreen = Math.hypot(ev.clientX - lastScreenX, ev.clientY - lastScreenY);
      if (distScreen < 1.5) {
        continue;
      }

      lastScreenX = ev.clientX;
      lastScreenY = ev.clientY;

      const rawPt = getPaperPoint(ev);
      const lastPt = currentStroke.points[currentStroke.points.length - 1];

      const smoothedX = lastPt ? (lastPt.x * 0.2 + rawPt.x * 0.8) : rawPt.x;
      const smoothedY = lastPt ? (lastPt.y * 0.2 + rawPt.y * 0.8) : rawPt.y;

      const rawPressure = (typeof ev.pressure === 'number' && ev.pressure > 0) ? ev.pressure : 0.5;
      const smoothedPressure = lastPt ? (lastPt.pressure * 0.65 + rawPressure * 0.35) : rawPressure;

      currentStroke.points.push({
        x: smoothedX,
        y: smoothedY,
        pressure: smoothedPressure
      });

      hasNewPoints = true;
    }

    if (hasNewPoints) {
      renderAll();
    }
  }
});

function handlePointerEnd(e) {
  if (e.pointerType !== 'pen' && e.pointerType !== 'eraser') return;
  if (!isInteracting || e.pointerId !== activePointerId) return;

  e.preventDefault();

  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (err) {}

  if (activeInteractionType === 'eraser') {
    if (erasedInCurrentDrag.length > 0) {
      const erasedList = [...erasedInCurrentDrag];
      executeAction({
        type: 'erase_strokes',
        erasedList: erasedList,
        do: () => {
          for (let i = 0; i < erasedList.length; i++) {
            const idx = strokes.indexOf(erasedList[i].stroke);
            if (idx !== -1) strokes.splice(idx, 1);
          }
        },
        undo: () => {
          const sorted = [...erasedList].sort((a, b) => a.originalIndex - b.originalIndex);
          for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            if (item.originalIndex <= strokes.length) {
              strokes.splice(item.originalIndex, 0, item.stroke);
            } else {
              strokes.push(item.stroke);
            }
          }
        }
      });
    }
    erasedInCurrentDrag = [];
  } else if (currentStroke) {
    currentStroke.isFinished = true;
    currentStroke.aabb = computeStrokeAABB(currentStroke);
    const finishedStroke = currentStroke;

    executeAction({
      type: 'add_stroke',
      stroke: finishedStroke,
      do: () => {
        strokes.push(finishedStroke);
      },
      undo: () => {
        const idx = strokes.indexOf(finishedStroke);
        if (idx !== -1) {
          strokes.splice(idx, 1);
        }
      }
    });

    currentStroke = null;
  }

  isInteracting = false;
  activeInteractionType = null;
  activePointerId = null;

  if (currentTool !== 'eraser' && eraserCursor) {
    eraserCursor.style.display = 'none';
  }
}

canvas.addEventListener('pointerup', handlePointerEnd);
canvas.addEventListener('pointercancel', handlePointerEnd);

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
}, { passive: false });

// ==========================================
// 16. Khởi động ứng dụng
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  centerPage(1.0);
  resizeCanvas();
  updateUndoRedoUI();
  setTool('pen');
  updateSizeAndColorPreview();
  await loadInitialData();
});

centerPage(1.0);
resizeCanvas();
updateUndoRedoUI();
setTool('pen');
updateSizeAndColorPreview();
loadInitialData();
