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
const PAGE_PORTRAIT_WIDTH = 1200;
const PAGE_PORTRAIT_HEIGHT = 1700;
const PAGE_LANDSCAPE_WIDTH = 1700;
const PAGE_LANDSCAPE_HEIGHT = 1200;

// Dự phòng tương thích
const PAGE_WIDTH = 1200;
const PAGE_HEIGHT = 1700;
const ERASER_RADIUS_SCREEN = 10;

function getPageDimensions(config = pageConfig) {
  const orientation = (config && config.orientation) || 'portrait';
  if (orientation === 'landscape') {
    return { width: PAGE_LANDSCAPE_WIDTH, height: PAGE_LANDSCAPE_HEIGHT };
  }
  return { width: PAGE_PORTRAIT_WIDTH, height: PAGE_PORTRAIT_HEIGHT };
}

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
      background: inheritedConfig ? (inheritedConfig.background || 'white') : 'white',
      pattern: inheritedConfig ? (inheritedConfig.pattern || 'none') : 'none',
      spacing: inheritedConfig ? (inheritedConfig.spacing || 'medium') : 'medium',
      orientation: inheritedConfig ? (inheritedConfig.orientation || 'portrait') : 'portrait'
    },
    objects: [],
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

// Trạng thái của trang hiện tại (Hệ thống Đối tượng)
let pageConfig = { ...pages[0].config };
let pageObjects = [];
let strokes = pageObjects; // Giữ tham chiếu tương thích ngược với code cũ
let undoStack = [];
let redoStack = [];

// Trạng thái Camera
let zoom = 1.0;
let panX = 0;
let panY = 0;

// Trạng thái công cụ
let currentTool = 'pen'; // 'pen' | 'eraser' | 'lasso' | 'shape'
let currentColor = '#1a1a1a';
let currentWidth = 5;

// Trạng thái Công cụ Hình học Cơ bản
let shapeBtn = document.getElementById('shapeBtn');
let shapeMenu = document.getElementById('shapeMenu');
let currentShapeType = 'line_solid';
let currentShapeDrawing = null;

// Trạng thái Thước kẻ ảo (Ruler)
let rulerBtn = document.getElementById('rulerBtn');
let isRulerActive = false;
const RULER_CM_UNIT = 1200 / 21; // ~57.142857 page units / cm (A4 quy ước 21cm = 1200 đơn vị)
const RULER_MM_UNIT = RULER_CM_UNIT / 10;
const RULER_TOTAL_CM = 15;
const RULER_START_PAD = 35;
const RULER_LENGTH = RULER_TOTAL_CM * RULER_CM_UNIT + RULER_START_PAD * 2;
const RULER_WIDTH = 110;

let ruler = {
  cx: 600,
  cy: 700,
  angle: 0,
  length: RULER_LENGTH,
  width: RULER_WIDTH,
  isRotating: false,
  isMoving: false,
  isSnapped: true
};
let currentRulerLine = null;
let rulerDragOffset = { dx: 0, dy: 0 };

// Trạng thái Compa ảo (Virtual Compass)
let compassBtn = document.getElementById('compassBtn');
let isCompassActive = false;
let compass = {
  placed: false,
  cx: 600,
  cy: 700,
  r: 4 * RULER_CM_UNIT,
  angle: 0,
  isMovingCenter: false,
  isResizingRadius: false,
  isDrawingArc: false
};
let currentArcDrawing = null;
let compassDragOffset = { dx: 0, dy: 0 };
let compassSnapIndicator = null;

// Modal Bán kính Compa
const compassRadiusModal = document.getElementById('compassRadiusModal');
const compassRadiusForm = document.getElementById('compassRadiusForm');
const compassRadiusInput = document.getElementById('compassRadiusInput');
const closeCompassRadiusModalBtn = document.getElementById('closeCompassRadiusModalBtn');
const cancelCompassRadiusBtn = document.getElementById('cancelCompassRadiusBtn');

// Trạng thái Công thức LaTeX
let latexBtn = document.getElementById('latexBtn');
let latexModal = document.getElementById('latexModal');
let latexForm = document.getElementById('latexForm');
let latexCodeInput = document.getElementById('latexCodeInput');
let latexPreviewBox = document.getElementById('latexPreviewBox');
let latexErrorBox = document.getElementById('latexErrorBox');
let latexModalTitle = document.getElementById('latexModalTitle');
let confirmLatexBtn = document.getElementById('confirmLatexBtn');
let cancelLatexBtn = document.getElementById('cancelLatexBtn');
let closeLatexModalBtn = document.getElementById('closeLatexModalBtn');
let editFormulaSelectionBtn = document.getElementById('editFormulaSelectionBtn');
let editingFormulaId = null;
const formulaImageCache = new Map();

// Trạng thái Công cụ Lasso & Lựa chọn Đối tượng
let lassoBtn = document.getElementById('lassoBtn');
let selectionActions = document.getElementById('selectionActions');
let deleteSelectionBtn = document.getElementById('deleteSelectionBtn');
let copySelectionBtn = document.getElementById('copySelectionBtn');
let deselectBtn = document.getElementById('deselectBtn');

let lassoPath = null;
let selectedObjectIds = new Set();
let selectionBounds = null; // { minX, minY, maxX, maxY }

// Tương tác dời / co giãn vùng chọn
let isManipulatingSelection = false;
let manipulationType = null; // 'move' | 'scale'
let activeHandle = null;
let manipulationOrigin = null;
let initialHandleDist = 0;
let initialDiagonalUnit = null;
let dragStartPaperPt = null;
let manipulationSnapshots = null;
let manipulationInitialBounds = null;

// Bộ nhớ đệm Sao chép / Dán đối tượng
let inMemoryClipboard = null;

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
  deselectObjects();
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

    pages = (note.pages || []).map((p, idx) => {
      const rawList = p.objects || p.strokes || [];
      const cleanObjects = rawList.map(o => {
        const item = { ...o };
        if (!item.id) item.id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        if (!item.type) item.type = 'stroke';
        if (!item.aabb) item.aabb = getObjectBounds(item);
        return item;
      });

      return {
        id: p.id || `page_${idx + 1}`,
        config: {
          background: p.config?.background || 'white',
          pattern: p.config?.pattern || 'none',
          spacing: p.config?.spacing || 'medium',
          orientation: p.config?.orientation || 'portrait'
        },
        objects: cleanObjects,
        strokes: cleanObjects,
        view: p.view || { zoom: 1.0, panX: 0, panY: 0 },
        undoStack: [],
        redoStack: []
      };
    });

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
  p.objects = [...pageObjects];
  p.strokes = pageObjects.filter(o => o.type === 'stroke');
  p.view = { zoom, panX, panY };
  p.undoStack = [...undoStack];
  p.redoStack = [...redoStack];
}

function loadActivePageState() {
  const p = pages[currentPageIndex];
  if (!p) return;

  deselectObjects();

  pageConfig = { ...p.config };
  if (!pageConfig.orientation) pageConfig.orientation = 'portrait';

  pageObjects = [];
  const rawList = p.objects || p.strokes || [];
  for (const s of rawList) {
    const item = { ...s };
    if (!item.id) item.id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    if (!item.aabb) {
      item.aabb = getObjectBounds(item);
    }
    pageObjects.push(item);
  }
  strokes = pageObjects;

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

  const { width: pWidth, height: pHeight } = getPageDimensions(page.config);

  tCtx.scale(thumbCanvas.width / pWidth, thumbCanvas.height / pHeight);

  const bg = BACKGROUND_COLORS[page.config.background] || '#ffffff';
  tCtx.fillStyle = bg;
  tCtx.fillRect(0, 0, pWidth, pHeight);

  if (page.config.pattern !== 'none') {
    const isDark = page.config.background === 'dark';
    tCtx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)';
    tCtx.lineWidth = 1.2;
    tCtx.beginPath();

    if (page.config.pattern === 'ruled') {
      const step = SPACING_SIZES.ruled[page.config.spacing] || 50;
      for (let y = 80; y < pHeight - 30; y += step) {
        tCtx.moveTo(0, y);
        tCtx.lineTo(pWidth, y);
      }
    } else if (page.config.pattern === 'grid') {
      const step = SPACING_SIZES.grid[page.config.spacing] || 45;
      for (let x = step; x < pWidth; x += step) {
        tCtx.moveTo(x, 0);
        tCtx.lineTo(x, pHeight);
      }
      for (let y = step; y < pHeight; y += step) {
        tCtx.moveTo(0, y);
        tCtx.lineTo(pWidth, y);
      }
    }
    tCtx.stroke();
  }

  tCtx.save();
  tCtx.beginPath();
  tCtx.rect(0, 0, pWidth, pHeight);
  tCtx.clip();

  const list = page.objects || page.strokes || [];
  for (let i = 0; i < list.length; i++) {
    drawObject(tCtx, list[i]);
  }
  tCtx.restore();

  tCtx.restore();
}

function updateCurrentPageThumbnail() {
  saveActivePageState();
  const currentItem = document.querySelector(`.thumbnail-item[data-index="${currentPageIndex}"]`);
  if (currentItem) {
    const isLandscape = (pageConfig.orientation || 'portrait') === 'landscape';
    const card = currentItem.querySelector('.thumbnail-card');
    if (card) {
      card.className = `thumbnail-card ${isLandscape ? 'landscape' : 'portrait'}`;
    }
    const thumbCanvas = currentItem.querySelector('.thumb-canvas');
    if (thumbCanvas) {
      thumbCanvas.width = isLandscape ? 170 : 120;
      thumbCanvas.height = isLandscape ? 120 : 170;
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

    const isLandscape = (page.config.orientation || 'portrait') === 'landscape';

    const card = document.createElement('div');
    card.className = `thumbnail-card ${isLandscape ? 'landscape' : 'portrait'}`;

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'thumb-canvas';
    thumbCanvas.width = isLandscape ? 170 : 120;
    thumbCanvas.height = isLandscape ? 120 : 170;
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
  const { width: pWidth, height: pHeight } = getPageDimensions(pageConfig);
  panX = (rect.width - pWidth * zoom) / 2;
  panY = rect.height > pHeight * zoom
    ? (rect.height - pHeight * zoom) / 2
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
  if (lassoBtn) lassoBtn.classList.toggle('active', tool === 'lasso');
  if (shapeBtn) shapeBtn.classList.toggle('active', tool === 'shape');

  if (tool !== 'lasso') {
    deselectObjects();
  }

  if (tool === 'eraser') {
    canvas.style.cursor = 'none';
  } else if (tool === 'lasso') {
    canvas.style.cursor = 'default';
    if (eraserCursor) eraserCursor.style.display = 'none';
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

    const orientationGroup = document.getElementById('orientationGroup');
    if (orientationGroup) {
      const currentOrientation = pageConfig.orientation || 'portrait';
      orientationGroup.querySelectorAll('.pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-orientation') === currentOrientation);
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
      const isLandscape = (pages[0].config.orientation || 'portrait') === 'landscape';
      const offCanvas = document.createElement('canvas');
      offCanvas.width = isLandscape ? 170 : 120;
      offCanvas.height = isLandscape ? 120 : 170;
      drawThumbnailCanvas(offCanvas, pages[0]);
      page1ThumbUrl = (typeof offCanvas.toDataURL === 'function') ? offCanvas.toDataURL('image/webp', 0.65) : '';
    }

    const noteData = {
      version: 2,
      id: currentNoteId,
      title: currentNoteTitle,
      folderId: currentNoteFolderId || null,
      createdAt: currentNoteCreatedAt || Date.now(),
      updatedAt: Date.now(),
      thumbnail: page1ThumbUrl,
      pages: pages.map(p => {
        const rawList = p.objects || p.strokes || [];
        const cleanObjects = rawList.map(o => ({
          id: o.id || ('obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
          type: o.type || 'stroke',
          points: o.points || [],
          color: o.color || '#1a1a1a',
          baseWidth: o.baseWidth || 5,
          ...(o.type && o.type !== 'stroke' ? o : {})
        }));
        return {
          id: p.id,
          config: { ...p.config },
          objects: cleanObjects,
          strokes: cleanObjects.filter(o => o.type === 'stroke').map(s => ({
            id: s.id,
            type: s.type || 'stroke',
            points: s.points,
            color: s.color,
            baseWidth: s.baseWidth
          })),
          view: {
            zoom: p.view ? p.view.zoom : 1.0,
            panX: p.view ? p.view.panX : 0,
            panY: p.view ? p.view.panY : 0
          }
        };
      })
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
  } finally {
    window._appReady = true;
    try { window.dispatchEvent(new CustomEvent('app-ready')); } catch (e) {}
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

// ==========================================
// 10b. Hệ thống Đối tượng (Objects) & Công cụ Lasso
// ==========================================

function drawShape(targetCtx, shape) {
  if (!shape || !shape.startPt || !shape.endPt) return;

  targetCtx.save();
  targetCtx.strokeStyle = shape.color || '#1a1a1a';
  targetCtx.fillStyle = shape.color || '#1a1a1a';
  targetCtx.lineWidth = Math.max(1, shape.baseWidth || 5);
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';

  const { startPt, endPt, shapeType } = shape;
  const bw = shape.baseWidth || 5;

  // Cấu hình nét kẻ
  if (shapeType === 'line_dashed') {
    targetCtx.setLineDash([bw * 2.5, bw * 1.5]);
  } else if (shapeType === 'line_dash_dot') {
    targetCtx.setLineDash([bw * 3, bw * 1.2, bw * 0.8, bw * 1.2]);
  } else {
    targetCtx.setLineDash([]);
  }

  // 1. Đường thẳng (nét liền, nét đứt, nét chấm gạch)
  if (shapeType.startsWith('line_')) {
    targetCtx.beginPath();
    targetCtx.moveTo(startPt.x, startPt.y);
    targetCtx.lineTo(endPt.x, endPt.y);
    targetCtx.stroke();
  }
  // 2. Mũi tên (1 đầu, 2 đầu)
  else if (shapeType.startsWith('arrow_')) {
    targetCtx.beginPath();
    targetCtx.moveTo(startPt.x, startPt.y);
    targetCtx.lineTo(endPt.x, endPt.y);
    targetCtx.stroke();

    const headLen = Math.max(12, bw * 3.5);
    const arrowAngle = Math.PI / 6;

    const angleEnd = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x);
    targetCtx.setLineDash([]);
    targetCtx.beginPath();
    targetCtx.moveTo(endPt.x, endPt.y);
    targetCtx.lineTo(
      endPt.x - headLen * Math.cos(angleEnd - arrowAngle),
      endPt.y - headLen * Math.sin(angleEnd - arrowAngle)
    );
    targetCtx.lineTo(
      endPt.x - headLen * Math.cos(angleEnd + arrowAngle),
      endPt.y - headLen * Math.sin(angleEnd + arrowAngle)
    );
    targetCtx.closePath();
    targetCtx.fill();

    if (shapeType === 'arrow_double') {
      const angleStart = Math.atan2(startPt.y - endPt.y, startPt.x - endPt.x);
      targetCtx.beginPath();
      targetCtx.moveTo(startPt.x, startPt.y);
      targetCtx.lineTo(
        startPt.x - headLen * Math.cos(angleStart - arrowAngle),
        startPt.y - headLen * Math.sin(angleStart - arrowAngle)
      );
      targetCtx.lineTo(
        startPt.x - headLen * Math.cos(angleStart + arrowAngle),
        startPt.y - headLen * Math.sin(angleStart + arrowAngle)
      );
      targetCtx.closePath();
      targetCtx.fill();
    }
  }
  // 3. Hình chữ nhật & Hình vuông
  else if (shapeType === 'rect' || shapeType === 'square') {
    const x = Math.min(startPt.x, endPt.x);
    const y = Math.min(startPt.y, endPt.y);
    const w = Math.abs(endPt.x - startPt.x);
    const h = Math.abs(endPt.y - startPt.y);
    targetCtx.beginPath();
    targetCtx.strokeRect(x, y, w, h);
  }
  // 4. Hình tròn & Elip
  else if (shapeType === 'circle') {
    const cx = (startPt.x + endPt.x) / 2;
    const cy = (startPt.y + endPt.y) / 2;
    const r = Math.min(Math.abs(endPt.x - startPt.x), Math.abs(endPt.y - startPt.y)) / 2;
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, Math.max(0.1, r), 0, Math.PI * 2);
    targetCtx.stroke();
  } else if (shapeType === 'ellipse') {
    const cx = (startPt.x + endPt.x) / 2;
    const cy = (startPt.y + endPt.y) / 2;
    const rx = Math.max(0.1, Math.abs(endPt.x - startPt.x) / 2);
    const ry = Math.max(0.1, Math.abs(endPt.y - startPt.y) / 2);
    targetCtx.beginPath();
    targetCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    targetCtx.stroke();
  }
  // 5. Tam giác (thường, cân, vuông)
  else if (shapeType.startsWith('triangle_')) {
    const minX = Math.min(startPt.x, endPt.x);
    const maxX = Math.max(startPt.x, endPt.x);
    const minY = Math.min(startPt.y, endPt.y);
    const maxY = Math.max(startPt.y, endPt.y);

    let v1, v2, v3;
    if (shapeType === 'triangle_isosceles') {
      v1 = { x: (minX + maxX) / 2, y: minY };
      v2 = { x: minX, y: maxY };
      v3 = { x: maxX, y: maxY };
    } else if (shapeType === 'triangle_right') {
      v1 = { x: minX, y: minY };
      v2 = { x: minX, y: maxY };
      v3 = { x: maxX, y: maxY };
    } else {
      v1 = { x: minX + (maxX - minX) * 0.35, y: minY };
      v2 = { x: minX, y: maxY };
      v3 = { x: maxX, y: maxY };
    }

    targetCtx.beginPath();
    targetCtx.moveTo(v1.x, v1.y);
    targetCtx.lineTo(v2.x, v2.y);
    targetCtx.lineTo(v3.x, v3.y);
    targetCtx.closePath();
    targetCtx.stroke();
  }
  // 6. Ngũ giác & Lục giác (đều)
  else if (shapeType === 'pentagon' || shapeType === 'hexagon') {
    const cx = (startPt.x + endPt.x) / 2;
    const cy = (startPt.y + endPt.y) / 2;
    const r = Math.min(Math.abs(endPt.x - startPt.x), Math.abs(endPt.y - startPt.y)) / 2;
    const sides = shapeType === 'pentagon' ? 5 : 6;
    const startAngle = -Math.PI / 2;

    targetCtx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + (i * 2 * Math.PI) / sides;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) targetCtx.moveTo(x, y);
      else targetCtx.lineTo(x, y);
    }
    targetCtx.closePath();
    targetCtx.stroke();
  }

  targetCtx.restore();
}

function computeShapeAABB(shape) {
  if (!shape || !shape.startPt || !shape.endPt) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const { startPt, endPt, baseWidth = 5 } = shape;
  const pad = Math.max(baseWidth * 2, 8);
  const minX = Math.min(startPt.x, endPt.x) - pad;
  const maxX = Math.max(startPt.x, endPt.x) + pad;
  const minY = Math.min(startPt.y, endPt.y) - pad;
  const maxY = Math.max(startPt.y, endPt.y) + pad;
  return { minX, minY, maxX, maxY };
}

function createShapeObject({ shapeType, startPt, endPt, color, baseWidth }) {
  const shape = {
    id: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    type: 'shape',
    shapeType: shapeType,
    startPt: { x: startPt.x, y: startPt.y },
    endPt: { x: endPt.x, y: endPt.y },
    color: color || '#1a1a1a',
    baseWidth: baseWidth || 5
  };
  shape.aabb = computeShapeAABB(shape);
  return shape;
}

function computeArcAABB(arc) {
  if (!arc || typeof arc.cx !== 'number' || typeof arc.cy !== 'number' || typeof arc.r !== 'number') {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const pad = Math.max(2, (arc.baseWidth || 5) / 2);
  if (arc.isFullCircle) {
    return {
      minX: arc.cx - arc.r - pad,
      minY: arc.cy - arc.r - pad,
      maxX: arc.cx + arc.r + pad,
      maxY: arc.cy + arc.r + pad
    };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const N = 32;
  const span = arc.endAngle - arc.startAngle;
  for (let i = 0; i <= N; i++) {
    const theta = arc.startAngle + (i / N) * span;
    const x = arc.cx + arc.r * Math.cos(theta);
    const y = arc.cy + arc.r * Math.sin(theta);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad
  };
}

function createArcObject({ cx, cy, r, startAngle, endAngle, isFullCircle, anticlockwise, color, baseWidth }) {
  const arc = {
    id: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    type: 'arc',
    cx: cx,
    cy: cy,
    r: r,
    startAngle: startAngle,
    endAngle: endAngle,
    isFullCircle: !!isFullCircle,
    anticlockwise: !!anticlockwise,
    color: color || '#1a1a1a',
    baseWidth: baseWidth || 5
  };
  arc.aabb = computeArcAABB(arc);
  return arc;
}

function drawArcObject(targetCtx, arc) {
  if (!arc || typeof arc.cx !== 'number' || typeof arc.cy !== 'number' || typeof arc.r !== 'number') return;
  targetCtx.save();
  targetCtx.strokeStyle = arc.color || '#1a1a1a';
  targetCtx.lineWidth = Math.max(1, arc.baseWidth || 5);
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';

  targetCtx.beginPath();
  if (arc.isFullCircle) {
    targetCtx.arc(arc.cx, arc.cy, arc.r, 0, Math.PI * 2, false);
  } else {
    targetCtx.arc(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, !!arc.anticlockwise);
  }
  targetCtx.stroke();
  targetCtx.restore();
}

function getArcSamplePoints(arc) {
  const pts = [];
  if (!arc) return pts;
  const N = arc.isFullCircle ? 16 : 12;
  const span = arc.isFullCircle ? (Math.PI * 2) : (arc.endAngle - arc.startAngle);
  const start = arc.isFullCircle ? 0 : arc.startAngle;
  for (let i = 0; i <= N; i++) {
    const theta = start + (i / N) * span;
    pts.push({
      x: arc.cx + arc.r * Math.cos(theta),
      y: arc.cy + arc.r * Math.sin(theta)
    });
  }
  return pts;
}

function isArcHitByEraser(arc, eX, eY, rPaper) {
  if (!arc.aabb) {
    arc.aabb = computeArcAABB(arc);
  }
  if (
    eX + rPaper < arc.aabb.minX ||
    eX - rPaper > arc.aabb.maxX ||
    eY + rPaper < arc.aabb.minY ||
    eY - rPaper > arc.aabb.maxY
  ) {
    return false;
  }

  const dist = Math.hypot(eX - arc.cx, eY - arc.cy);
  const threshold = rPaper + (arc.baseWidth || 5) / 2;
  const radialDiff = Math.abs(dist - arc.r);

  if (radialDiff > threshold) {
    return false;
  }

  if (arc.isFullCircle) {
    return true;
  }

  const p1 = { x: arc.cx + arc.r * Math.cos(arc.startAngle), y: arc.cy + arc.r * Math.sin(arc.startAngle) };
  const p2 = { x: arc.cx + arc.r * Math.cos(arc.endAngle), y: arc.cy + arc.r * Math.sin(arc.endAngle) };
  if (Math.hypot(eX - p1.x, eY - p1.y) <= threshold || Math.hypot(eX - p2.x, eY - p2.y) <= threshold) {
    return true;
  }

  const eAngle = Math.atan2(eY - arc.cy, eX - arc.cx);
  const diffStart = Math.atan2(Math.sin(eAngle - arc.startAngle), Math.cos(eAngle - arc.startAngle));
  const totalSpan = arc.endAngle - arc.startAngle;
  if (totalSpan > 0 && diffStart >= 0 && diffStart <= totalSpan) return true;
  if (totalSpan < 0 && diffStart <= 0 && diffStart >= totalSpan) return true;

  return false;
}

function getConstrainedEndPoint(shapeType, startPt, rawPt, shiftKey) {
  const endPt = { x: rawPt.x, y: rawPt.y };

  const isSquareMode = shapeType === 'square';
  const isCircleMode = shapeType === 'circle';

  // Đường thẳng hoặc mũi tên
  if (shapeType.startsWith('line') || shapeType.startsWith('arrow')) {
    if (shiftKey) {
      const dx = endPt.x - startPt.x;
      const dy = endPt.y - startPt.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        const theta = Math.atan2(dy, dx);
        const snapped = Math.round(theta / (Math.PI / 4)) * (Math.PI / 4);
        endPt.x = startPt.x + dist * Math.cos(snapped);
        endPt.y = startPt.y + dist * Math.sin(snapped);
      }
    }
    return endPt;
  }

  // Hình vuông, hình tròn hoặc giữ Shift khi vẽ rect / ellipse
  if (isSquareMode || isCircleMode || (shiftKey && (shapeType === 'rect' || shapeType === 'ellipse'))) {
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    endPt.x = startPt.x + (dx >= 0 ? 1 : -1) * side;
    endPt.y = startPt.y + (dy >= 0 ? 1 : -1) * side;
    return endPt;
  }

  return endPt;
}

function getShapeSamplePoints(shape) {
  const { startPt, endPt, shapeType } = shape;
  const pts = [];
  const minX = Math.min(startPt.x, endPt.x);
  const maxX = Math.max(startPt.x, endPt.x);
  const minY = Math.min(startPt.y, endPt.y);
  const maxY = Math.max(startPt.y, endPt.y);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  pts.push({ x: cx, y: cy });

  if (shapeType.startsWith('line') || shapeType.startsWith('arrow')) {
    pts.push({ x: startPt.x, y: startPt.y });
    pts.push({ x: endPt.x, y: endPt.y });
    pts.push({ x: (startPt.x + endPt.x) / 2, y: (startPt.y + endPt.y) / 2 });
  } else if (shapeType === 'rect' || shapeType === 'square') {
    pts.push({ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY });
  } else if (shapeType === 'circle' || shapeType === 'ellipse') {
    const rx = Math.abs(endPt.x - startPt.x) / 2;
    const ry = Math.abs(endPt.y - startPt.y) / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
  } else if (shapeType.startsWith('triangle')) {
    if (shapeType === 'triangle_isosceles') {
      pts.push({ x: cx, y: minY }, { x: minX, y: maxY }, { x: maxX, y: maxY });
    } else if (shapeType === 'triangle_right') {
      pts.push({ x: minX, y: minY }, { x: minX, y: maxY }, { x: maxX, y: maxY });
    } else {
      pts.push({ x: minX + (maxX - minX) * 0.35, y: minY }, { x: minX, y: maxY }, { x: maxX, y: maxY });
    }
  } else if (shapeType === 'pentagon' || shapeType === 'hexagon') {
    const sides = shapeType === 'pentagon' ? 5 : 6;
    const r = Math.min(maxX - minX, maxY - minY) / 2;
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  }
  return pts;
}

function isShapeHitByEraser(shape, eX, eY, rPaper) {
  if (!shape.aabb) {
    shape.aabb = computeShapeAABB(shape);
  }

  if (
    eX + rPaper < shape.aabb.minX ||
    eX - rPaper > shape.aabb.maxX ||
    eY + rPaper < shape.aabb.minY ||
    eY - rPaper > shape.aabb.maxY
  ) {
    return false;
  }

  const threshold = rPaper + (shape.baseWidth || 5) / 2;
  const thresholdSq = threshold * threshold;
  const { startPt, endPt, shapeType } = shape;
  const minX = Math.min(startPt.x, endPt.x);
  const maxX = Math.max(startPt.x, endPt.x);
  const minY = Math.min(startPt.y, endPt.y);
  const maxY = Math.max(startPt.y, endPt.y);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  if (shapeType.startsWith('line') || shapeType.startsWith('arrow')) {
    return distToSegmentSq(eX, eY, startPt.x, startPt.y, endPt.x, endPt.y) <= thresholdSq;
  }

  if (shapeType === 'rect' || shapeType === 'square') {
    return (
      distToSegmentSq(eX, eY, minX, minY, maxX, minY) <= thresholdSq ||
      distToSegmentSq(eX, eY, maxX, minY, maxX, maxY) <= thresholdSq ||
      distToSegmentSq(eX, eY, maxX, maxY, minX, maxY) <= thresholdSq ||
      distToSegmentSq(eX, eY, minX, maxY, minX, minY) <= thresholdSq
    );
  }

  if (shapeType === 'circle') {
    const r = Math.min(maxX - minX, maxY - minY) / 2;
    const distToCenter = Math.hypot(eX - cx, eY - cy);
    return Math.abs(distToCenter - r) <= threshold;
  }

  if (shapeType === 'ellipse') {
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      const px = cx + rx * Math.cos(a);
      const py = cy + ry * Math.sin(a);
      if (Math.hypot(eX - px, eY - py) <= threshold) return true;
    }
    return false;
  }

  if (shapeType.startsWith('triangle')) {
    let v1, v2, v3;
    if (shapeType === 'triangle_isosceles') {
      v1 = { x: cx, y: minY };
      v2 = { x: minX, y: maxY };
      v3 = { x: maxX, y: maxY };
    } else if (shapeType === 'triangle_right') {
      v1 = { x: minX, y: minY };
      v2 = { x: minX, y: maxY };
      v3 = { x: maxX, y: maxY };
    } else {
      v1 = { x: minX + (maxX - minX) * 0.35, y: minY };
      v2 = { x: minX, y: maxY };
      v3 = { x: maxX, y: maxY };
    }
    return (
      distToSegmentSq(eX, eY, v1.x, v1.y, v2.x, v2.y) <= thresholdSq ||
      distToSegmentSq(eX, eY, v2.x, v2.y, v3.x, v3.y) <= thresholdSq ||
      distToSegmentSq(eX, eY, v3.x, v3.y, v1.x, v1.y) <= thresholdSq
    );
  }

  if (shapeType === 'pentagon' || shapeType === 'hexagon') {
    const sides = shapeType === 'pentagon' ? 5 : 6;
    const r = Math.min(maxX - minX, maxY - minY) / 2;
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    for (let i = 0; i < sides; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % sides];
      if (distToSegmentSq(eX, eY, p1.x, p1.y, p2.x, p2.y) <= thresholdSq) return true;
    }
    return false;
  }

  return false;
}

function drawObject(targetCtx, obj) {
  if (!obj) return;
  if (obj.type === 'stroke') {
    drawStroke(targetCtx, obj);
  } else if (obj.type === 'shape') {
    drawShape(targetCtx, obj);
  } else if (obj.type === 'arc') {
    drawArcObject(targetCtx, obj);
  } else if (obj.type === 'formula') {
    drawFormulaObject(targetCtx, obj);
  }
}

function computeFormulaAABB(formula) {
  const pad = 4;
  return {
    minX: (formula.x || 0) - pad,
    minY: (formula.y || 0) - pad,
    maxX: (formula.x || 0) + (formula.width || 0) + pad,
    maxY: (formula.y || 0) + (formula.height || 0) + pad
  };
}

function getObjectBounds(obj) {
  if (!obj) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  if (obj.type === 'formula') {
    obj.aabb = computeFormulaAABB(obj);
    return obj.aabb;
  }
  if (obj.aabb) return obj.aabb;
  if (obj.type === 'stroke') {
    obj.aabb = computeStrokeAABB(obj);
    return obj.aabb;
  }
  if (obj.type === 'shape') {
    obj.aabb = computeShapeAABB(obj);
    return obj.aabb;
  }
  if (obj.type === 'arc') {
    obj.aabb = computeArcAABB(obj);
    return obj.aabb;
  }
  if (obj.x !== undefined && obj.y !== undefined && obj.width !== undefined && obj.height !== undefined) {
    return { minX: obj.x, minY: obj.y, maxX: obj.x + obj.width, maxY: obj.y + obj.height };
  }
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function cloneObject(obj, newId = false) {
  const cloned = JSON.parse(JSON.stringify(obj));
  if (newId) {
    cloned.id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }
  return cloned;
}

function transformObject(obj, { dx = 0, dy = 0, scale = 1, originX = 0, originY = 0 }) {
  if (!obj) return;
  if (obj.type === 'stroke') {
    if (scale !== 1) {
      obj.points = obj.points.map(pt => ({
        x: originX + (pt.x - originX) * scale + dx,
        y: originY + (pt.y - originY) * scale + dy,
        pressure: pt.pressure
      }));
      obj.baseWidth = Math.max(1, (obj.baseWidth || 5) * scale);
    } else if (dx !== 0 || dy !== 0) {
      obj.points = obj.points.map(pt => ({
        x: pt.x + dx,
        y: pt.y + dy,
        pressure: pt.pressure
      }));
    }
    obj.aabb = computeStrokeAABB(obj);
  } else if (obj.type === 'shape') {
    if (scale !== 1) {
      obj.startPt = {
        x: originX + (obj.startPt.x - originX) * scale + dx,
        y: originY + (obj.startPt.y - originY) * scale + dy
      };
      obj.endPt = {
        x: originX + (obj.endPt.x - originX) * scale + dx,
        y: originY + (obj.endPt.y - originY) * scale + dy
      };
      obj.baseWidth = Math.max(1, (obj.baseWidth || 5) * scale);
    } else {
      obj.startPt.x += dx;
      obj.startPt.y += dy;
      obj.endPt.x += dx;
      obj.endPt.y += dy;
    }
    obj.aabb = computeShapeAABB(obj);
  } else if (obj.type === 'arc') {
    if (scale !== 1) {
      obj.cx = originX + (obj.cx - originX) * scale + dx;
      obj.cy = originY + (obj.cy - originY) * scale + dy;
      obj.r = Math.max(1, obj.r * scale);
      obj.baseWidth = Math.max(1, (obj.baseWidth || 5) * scale);
    } else {
      obj.cx += dx;
      obj.cy += dy;
    }
    obj.aabb = computeArcAABB(obj);
  } else if (obj.type === 'formula') {
    if (scale !== 1) {
      obj.x = originX + (obj.x - originX) * scale + dx;
      obj.y = originY + (obj.y - originY) * scale + dy;
      obj.width = Math.max(10, (obj.width || 50) * scale);
      obj.height = Math.max(10, (obj.height || 20) * scale);
      obj.scale = (obj.scale || 1) * scale;
    } else {
      obj.x += dx;
      obj.y += dy;
    }
    obj.aabb = computeFormulaAABB(obj);
  } else {
    if (obj.x !== undefined && obj.y !== undefined) {
      if (scale !== 1) {
        obj.x = originX + (obj.x - originX) * scale + dx;
        obj.y = originY + (obj.y - originY) * scale + dy;
        if (obj.width) obj.width *= scale;
        if (obj.height) obj.height *= scale;
      } else {
        obj.x += dx;
        obj.y += dy;
      }
      obj.aabb = getObjectBounds(obj);
    }
  }
}

function applyObjectSnapshots(snapshots) {
  if (!snapshots) return;
  const map = new Map(snapshots.map(s => [s.id, s]));
  for (let i = 0; i < pageObjects.length; i++) {
    const snap = map.get(pageObjects[i].id);
    if (snap) {
      pageObjects[i] = cloneObject(snap);
      pageObjects[i].aabb = getObjectBounds(pageObjects[i]);
    }
  }
}

function isPointInPolygon(px, py, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isObjectSelectedByLasso(obj, polygon) {
  if (obj.type === 'stroke' && Array.isArray(obj.points) && obj.points.length > 0) {
    const pts = obj.points;
    let insideCount = 0;
    const step = pts.length > 80 ? Math.ceil(pts.length / 40) : 1;
    let sampled = 0;
    for (let i = 0; i < pts.length; i += step) {
      sampled++;
      if (isPointInPolygon(pts[i].x, pts[i].y, polygon)) {
        insideCount++;
      }
    }
    return (insideCount / sampled) >= 0.5;
  } else if (obj.type === 'shape') {
    const pts = getShapeSamplePoints(obj);
    let insideCount = 0;
    for (const p of pts) {
      if (isPointInPolygon(p.x, p.y, polygon)) {
        insideCount++;
      }
    }
    return (insideCount / pts.length) >= 0.5;
  } else if (obj.type === 'arc') {
    const pts = getArcSamplePoints(obj);
    let insideCount = 0;
    for (const p of pts) {
      if (isPointInPolygon(p.x, p.y, polygon)) {
        insideCount++;
      }
    }
    return (insideCount / pts.length) >= 0.5;
  } else if (obj.type === 'formula') {
    const cx = (obj.x || 0) + (obj.width || 0) / 2;
    const cy = (obj.y || 0) + (obj.height || 0) / 2;
    if (isPointInPolygon(cx, cy, polygon)) return true;

    const b = getObjectBounds(obj);
    const pts = [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY },
      { x: b.minX, y: b.maxY },
      { x: (obj.x || 0) + (obj.width || 0) * 0.25, y: cy },
      { x: (obj.x || 0) + (obj.width || 0) * 0.75, y: cy },
      { x: cx, y: (obj.y || 0) + (obj.height || 0) * 0.25 },
      { x: cx, y: (obj.y || 0) + (obj.height || 0) * 0.75 }
    ];
    let insideCount = 0;
    for (const p of pts) {
      if (isPointInPolygon(p.x, p.y, polygon)) {
        insideCount++;
      }
    }
    return (insideCount / pts.length) >= 0.25;
  } else {
    const b = getObjectBounds(obj);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    return isPointInPolygon(cx, cy, polygon);
  }
}

function computeSelectionBounds() {
  if (selectedObjectIds.size === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const obj of pageObjects) {
    if (selectedObjectIds.has(obj.id)) {
      const b = getObjectBounds(obj);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
      count++;
    }
  }
  if (count === 0) return null;
  const pad = 6;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad
  };
}

function getSelectionHandleAtScreenPoint(screenX, screenY) {
  if (!selectionBounds) return null;
  const rect = canvas.getBoundingClientRect();
  const { minX, minY, maxX, maxY } = selectionBounds;

  const handles = [
    { type: 'tl', paperX: minX, paperY: minY, originX: maxX, originY: maxY },
    { type: 'tr', paperX: maxX, paperY: minY, originX: minX, originY: maxY },
    { type: 'br', paperX: maxX, paperY: maxY, originX: minX, originY: minY },
    { type: 'bl', paperX: minX, paperY: maxY, originX: maxX, originY: minY }
  ];

  const HIT_RADIUS_SCREEN = 20;

  for (const h of handles) {
    const hScreenX = rect.left + panX + h.paperX * zoom;
    const hScreenY = rect.top + panY + h.paperY * zoom;
    const dist = Math.hypot(screenX - hScreenX, screenY - hScreenY);
    if (dist <= HIT_RADIUS_SCREEN) {
      return h;
    }
  }
  return null;
}

function isPaperPointInsideSelection(paperPt) {
  if (!selectionBounds) return false;
  return (
    paperPt.x >= selectionBounds.minX &&
    paperPt.x <= selectionBounds.maxX &&
    paperPt.y >= selectionBounds.minY &&
    paperPt.y <= selectionBounds.maxY
  );
}

function updateSelectionActionsUI() {
  if (!selectionActions) return;
  if (!selectionBounds || selectedObjectIds.size === 0) {
    selectionActions.style.display = 'none';
    if (editFormulaSelectionBtn) editFormulaSelectionBtn.style.display = 'none';
    return;
  }

  // Nếu chỉ đang chọn đúng MỘT công thức -> hiện nút "Sửa công thức"
  if (editFormulaSelectionBtn) {
    if (selectedObjectIds.size === 1) {
      const selectedObj = pageObjects.find(o => selectedObjectIds.has(o.id));
      if (selectedObj && selectedObj.type === 'formula') {
        editFormulaSelectionBtn.style.display = 'inline-flex';
      } else {
        editFormulaSelectionBtn.style.display = 'none';
      }
    } else {
      editFormulaSelectionBtn.style.display = 'none';
    }
  }

  const rect = canvas.getBoundingClientRect();
  const screenLeft = rect.left + panX + ((selectionBounds.minX + selectionBounds.maxX) / 2) * zoom;
  let screenTop = rect.top + panY + selectionBounds.minY * zoom - 44;

  if (screenTop < rect.top + 55) {
    screenTop = rect.top + panY + selectionBounds.maxY * zoom + 12;
  }

  const safeLeft = Math.max(140, Math.min(window.innerWidth - 140, screenLeft));
  const safeTop = Math.max(60, Math.min(window.innerHeight - 60, screenTop));

  selectionActions.style.display = 'flex';
  selectionActions.style.left = `${safeLeft}px`;
  selectionActions.style.top = `${safeTop}px`;
}

function deselectObjects() {
  if (selectedObjectIds.size > 0 || selectionBounds) {
    selectedObjectIds.clear();
    selectionBounds = null;
    if (editFormulaSelectionBtn) editFormulaSelectionBtn.style.display = 'none';
    updateSelectionActionsUI();
    renderAll();
  }
}

function deleteSelectedObjects() {
  if (selectedObjectIds.size === 0) return;
  const toDelete = new Set(selectedObjectIds);
  const deletedSnapshots = [];
  for (let i = 0; i < pageObjects.length; i++) {
    if (toDelete.has(pageObjects[i].id)) {
      deletedSnapshots.push({ obj: cloneObject(pageObjects[i]), index: i });
    }
  }

  executeAction({
    type: 'delete_objects',
    do: () => {
      const idSet = new Set(deletedSnapshots.map(d => d.obj.id));
      for (let i = pageObjects.length - 1; i >= 0; i--) {
        if (idSet.has(pageObjects[i].id)) {
          pageObjects.splice(i, 1);
        }
      }
      selectedObjectIds.clear();
      selectionBounds = null;
      updateSelectionActionsUI();
      renderAll();
    },
    undo: () => {
      const sorted = [...deletedSnapshots].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        if (item.index <= pageObjects.length) {
          pageObjects.splice(item.index, 0, cloneObject(item.obj));
        } else {
          pageObjects.push(cloneObject(item.obj));
        }
      }
      selectedObjectIds = new Set(deletedSnapshots.map(d => d.obj.id));
      selectionBounds = computeSelectionBounds();
      updateSelectionActionsUI();
      renderAll();
    }
  });

  scheduleAutoSave();
  updateCurrentPageThumbnail();
}

function copySelectedObjects() {
  if (selectedObjectIds.size === 0) return;
  const selected = pageObjects.filter(o => selectedObjectIds.has(o.id));
  if (selected.length === 0) return;
  inMemoryClipboard = selected.map(o => cloneObject(o));
  try {
    localStorage.setItem('inknote_clipboard', JSON.stringify(inMemoryClipboard));
  } catch (e) {}
}

function pasteObjects() {
  let items = inMemoryClipboard;
  if (!items) {
    try {
      const stored = localStorage.getItem('inknote_clipboard');
      if (stored) items = JSON.parse(stored);
    } catch (e) {}
  }
  if (!items || !Array.isArray(items) || items.length === 0) return;

  const OFFSET = 35;
  const newObjects = items.map(item => {
    const cloned = cloneObject(item, true);
    transformObject(cloned, { dx: OFFSET, dy: OFFSET });
    return cloned;
  });

  executeAction({
    type: 'paste_objects',
    do: () => {
      for (const o of newObjects) {
        pageObjects.push(o);
      }
      selectedObjectIds = new Set(newObjects.map(o => o.id));
      selectionBounds = computeSelectionBounds();
      setTool('lasso');
      updateSelectionActionsUI();
      renderAll();
    },
    undo: () => {
      const idSet = new Set(newObjects.map(o => o.id));
      for (let i = pageObjects.length - 1; i >= 0; i--) {
        if (idSet.has(pageObjects[i].id)) {
          pageObjects.splice(i, 1);
        }
      }
      selectedObjectIds.clear();
      selectionBounds = null;
      updateSelectionActionsUI();
      renderAll();
    }
  });

  inMemoryClipboard = newObjects.map(o => cloneObject(o));
  try {
    localStorage.setItem('inknote_clipboard', JSON.stringify(inMemoryClipboard));
  } catch (e) {}

  scheduleAutoSave();
  updateCurrentPageThumbnail();
}

function drawPaperPattern(targetCtx) {
  if (pageConfig.pattern === 'none') return;

  const isDark = pageConfig.background === 'dark';
  const { width: pWidth, height: pHeight } = getPageDimensions(pageConfig);

  targetCtx.save();
  targetCtx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.11)';
  targetCtx.lineWidth = 1 / zoom;
  targetCtx.beginPath();

  if (pageConfig.pattern === 'ruled') {
    const step = (SPACING_SIZES.ruled[pageConfig.spacing] || 50);
    const startY = 80;
    for (let y = startY; y < pHeight - 30; y += step) {
      targetCtx.moveTo(0, y);
      targetCtx.lineTo(pWidth, y);
    }
  } else if (pageConfig.pattern === 'grid') {
    const step = (SPACING_SIZES.grid[pageConfig.spacing] || 45);
    for (let x = step; x < pWidth; x += step) {
      targetCtx.moveTo(x, 0);
      targetCtx.lineTo(x, pHeight);
    }
    for (let y = step; y < pHeight; y += step) {
      targetCtx.moveTo(0, y);
      targetCtx.lineTo(pWidth, y);
    }
  }

  targetCtx.stroke();
  targetCtx.restore();
}

// ==========================================
// 10c. Công cụ Thước kẻ ảo (Virtual Ruler)
// ==========================================

function toggleRuler() {
  isRulerActive = !isRulerActive;
  if (rulerBtn) {
    rulerBtn.classList.toggle('active', isRulerActive);
  }
  renderAll();
}

function paperToRulerLocal(px, py) {
  const dx = px - ruler.cx;
  const dy = py - ruler.cy;
  const cos = Math.cos(ruler.angle);
  const sin = Math.sin(ruler.angle);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos
  };
}

function rulerLocalToPaper(lx, ly) {
  const cos = Math.cos(ruler.angle);
  const sin = Math.sin(ruler.angle);
  return {
    x: ruler.cx + lx * cos - ly * sin,
    y: ruler.cy + lx * sin + ly * cos
  };
}

function hitTestRuler(paperPt) {
  if (!isRulerActive) return null;

  const localPt = paperToRulerLocal(paperPt.x, paperPt.y);
  const halfL = ruler.length / 2;
  const halfW = ruler.width / 2;

  // 1. Kiểm tra điểm nắm xoay ở đầu bên phải: (halfL - 26, 0)
  const handleX = halfL - 26;
  const handleY = 0;
  const distHandle = Math.hypot(localPt.x - handleX, localPt.y - handleY);
  const handleRadiusPaper = Math.max(22 / zoom, 20);
  if (distHandle <= handleRadiusPaper) {
    return { hit: 'rotate', localPt };
  }

  // 2. Kiểm tra kẻ theo cạnh thước (trong khoảng ~20-22 pixel màn hình)
  // Chỉ kích hoạt khi công cụ là Bút hoặc Đường thẳng/Mũi tên
  const canDrawWithRuler = currentTool === 'pen' || (
    currentTool === 'shape' && (
      currentShapeType.startsWith('line_') ||
      currentShapeType.startsWith('arrow_')
    )
  );

  const edgeThresholdPaper = 22 / zoom;

  if (canDrawWithRuler) {
    if (localPt.x >= -halfL - edgeThresholdPaper && localPt.x <= halfL + edgeThresholdPaper) {
      const distTop = Math.abs(localPt.y - (-halfW));
      const distBottom = Math.abs(localPt.y - halfW);

      if (distTop <= edgeThresholdPaper && distTop <= distBottom) {
        return {
          hit: 'edge',
          edge: 'top',
          edgeY: -halfW,
          localPt
        };
      }
      if (distBottom <= edgeThresholdPaper && distBottom < distTop) {
        return {
          hit: 'edge',
          edge: 'bottom',
          edgeY: halfW,
          localPt
        };
      }
    }
  }

  // 3. Kiểm tra chạm vào thân thước để di chuyển
  if (localPt.x >= -halfL && localPt.x <= halfL && localPt.y >= -halfW && localPt.y <= halfW) {
    return { hit: 'body', localPt };
  }

  return null;
}

function updateRulerAngleFromPointer(paperPt) {
  const dx = paperPt.x - ruler.cx;
  const dy = paperPt.y - ruler.cy;
  const rawAngle = Math.atan2(dy, dx);
  const deg = rawAngle * (180 / Math.PI);

  // Hút (snap) vào 0, 45, 90, 135, 180, -45, -90, -135, -180 độ
  const snapStep = 45;
  const snappedDeg = Math.round(deg / snapStep) * snapStep;
  const diff = Math.abs(deg - snappedDeg);
  const snapThresholdDeg = 3.5;

  if (diff <= snapThresholdDeg) {
    ruler.angle = snappedDeg * (Math.PI / 180);
    ruler.isSnapped = true;
  } else {
    ruler.angle = rawAngle;
    ruler.isSnapped = false;
  }
}

function drawRulerLinePreview(targetCtx, line) {
  if (!line) return;
  const p1 = rulerLocalToPaper(line.startLocalX, line.edgeY);
  const p2 = rulerLocalToPaper(line.endLocalX, line.edgeY);
  drawShape(targetCtx, {
    shapeType: line.shapeType,
    startPt: p1,
    endPt: p2,
    color: line.color,
    baseWidth: line.baseWidth
  });
}

function drawRuler(targetCtx) {
  targetCtx.save();
  targetCtx.translate(ruler.cx, ruler.cy);
  targetCtx.rotate(ruler.angle);

  const halfL = ruler.length / 2;
  const halfW = ruler.width / 2;

  // 1. Thân thước bán trong suốt (frosted acrylic)
  targetCtx.save();
  targetCtx.shadowColor = 'rgba(0, 0, 0, 0.16)';
  targetCtx.shadowBlur = 10 / zoom;
  targetCtx.shadowOffsetY = 3 / zoom;

  targetCtx.beginPath();
  if (typeof targetCtx.roundRect === 'function') {
    targetCtx.roundRect(-halfL, -halfW, ruler.length, ruler.width, 6);
  } else {
    targetCtx.rect(-halfL, -halfW, ruler.length, ruler.width);
  }
  targetCtx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  targetCtx.fill();
  targetCtx.restore();

  // Viền thước
  targetCtx.save();
  targetCtx.beginPath();
  if (typeof targetCtx.roundRect === 'function') {
    targetCtx.roundRect(-halfL, -halfW, ruler.length, ruler.width, 6);
  } else {
    targetCtx.rect(-halfL, -halfW, ruler.length, ruler.width);
  }
  targetCtx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
  targetCtx.lineWidth = 1.2 / zoom;
  targetCtx.stroke();
  targetCtx.restore();

  // 2. Vạch chia cm và mm ở cạnh trên
  const startX = -halfL + RULER_START_PAD;
  targetCtx.save();
  targetCtx.textAlign = 'center';
  targetCtx.textBaseline = 'top';

  for (let cm = 0; cm <= RULER_TOTAL_CM; cm++) {
    const cmX = startX + cm * RULER_CM_UNIT;

    // Vạch chính cm
    targetCtx.beginPath();
    targetCtx.moveTo(cmX, -halfW);
    targetCtx.lineTo(cmX, -halfW + 22);
    targetCtx.strokeStyle = '#1e293b';
    targetCtx.lineWidth = 1.5 / zoom;
    targetCtx.stroke();

    // Số cm (kích thước đọc rõ)
    const fontSize = Math.max(10 / zoom, 12);
    targetCtx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    targetCtx.fillStyle = '#0f172a';
    targetCtx.fillText(cm.toString(), cmX, -halfW + 25);

    // Vạch mm
    if (cm < RULER_TOTAL_CM) {
      for (let mm = 1; mm < 10; mm++) {
        const mmX = cmX + mm * RULER_MM_UNIT;
        const isHalf = (mm === 5);
        const tickH = isHalf ? 14 : 8;

        targetCtx.beginPath();
        targetCtx.moveTo(mmX, -halfW);
        targetCtx.lineTo(mmX, -halfW + tickH);
        targetCtx.strokeStyle = isHalf ? '#475569' : '#94a3b8';
        targetCtx.lineWidth = (isHalf ? 1.2 : 0.8) / zoom;
        targetCtx.stroke();
      }
    }
  }
  targetCtx.restore();

  // 3. Vạch chia phụ ở cạnh dưới (căn kẻ thuận tiện ở cả 2 cạnh)
  targetCtx.save();
  for (let cm = 0; cm <= RULER_TOTAL_CM; cm++) {
    const cmX = startX + cm * RULER_CM_UNIT;
    targetCtx.beginPath();
    targetCtx.moveTo(cmX, halfW);
    targetCtx.lineTo(cmX, halfW - 12);
    targetCtx.strokeStyle = '#64748b';
    targetCtx.lineWidth = 1.2 / zoom;
    targetCtx.stroke();

    if (cm < RULER_TOTAL_CM) {
      const halfMmX = cmX + 5 * RULER_MM_UNIT;
      targetCtx.beginPath();
      targetCtx.moveTo(halfMmX, halfW);
      targetCtx.lineTo(halfMmX, halfW - 7);
      targetCtx.strokeStyle = '#94a3b8';
      targetCtx.lineWidth = 0.8 / zoom;
      targetCtx.stroke();
    }
  }
  targetCtx.restore();

  // 4. Biểu thị góc nghiêng (độ) ở tâm thước
  const deg = Math.round((((ruler.angle * 180 / Math.PI) % 360) + 360) % 360);
  const pillW = 62;
  const pillH = 26;
  targetCtx.save();
  targetCtx.beginPath();
  if (typeof targetCtx.roundRect === 'function') {
    targetCtx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 13);
  } else {
    targetCtx.rect(-pillW / 2, -pillH / 2, pillW, pillH);
  }
  targetCtx.fillStyle = ruler.isRotating ? (ruler.isSnapped ? '#0969da' : '#1e293b') : 'rgba(241, 245, 249, 0.92)';
  targetCtx.fill();
  targetCtx.strokeStyle = ruler.isRotating ? '#ffffff' : '#cbd5e1';
  targetCtx.lineWidth = 1 / zoom;
  targetCtx.stroke();

  targetCtx.textAlign = 'center';
  targetCtx.textBaseline = 'middle';
  const pillFontSize = Math.max(10 / zoom, 12);
  targetCtx.font = `bold ${pillFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  targetCtx.fillStyle = ruler.isRotating ? '#ffffff' : '#334155';
  targetCtx.fillText(`${deg}°`, 0, 0);
  targetCtx.restore();

  // 5. Nút xoay (Rotation Handle) ở đầu bên phải
  const handleX = halfL - 26;
  const handleY = 0;
  const handleR = 16;

  targetCtx.save();
  targetCtx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  targetCtx.shadowBlur = 4 / zoom;
  targetCtx.beginPath();
  targetCtx.arc(handleX, handleY, handleR, 0, Math.PI * 2);
  targetCtx.fillStyle = ruler.isRotating ? '#0969da' : '#ffffff';
  targetCtx.fill();
  targetCtx.strokeStyle = '#0969da';
  targetCtx.lineWidth = 2 / zoom;
  targetCtx.stroke();

  // Biểu tượng xoay vòng cung
  targetCtx.save();
  targetCtx.translate(handleX, handleY);
  targetCtx.strokeStyle = ruler.isRotating ? '#ffffff' : '#0969da';
  targetCtx.fillStyle = ruler.isRotating ? '#ffffff' : '#0969da';
  targetCtx.lineWidth = 1.6 / zoom;

  targetCtx.beginPath();
  targetCtx.arc(0, 0, 7.5, -Math.PI * 0.8, -Math.PI * 0.1);
  targetCtx.stroke();
  targetCtx.beginPath();
  targetCtx.arc(0, 0, 7.5, Math.PI * 0.2, Math.PI * 0.9);
  targetCtx.stroke();
  targetCtx.restore();

  // 6. Nhãn nổi góc xoay khi đang xoay
  if (ruler.isRotating) {
    const floatW = 64;
    const floatH = 26;
    const floatY = -halfW - 20;
    targetCtx.save();
    targetCtx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    targetCtx.shadowBlur = 6 / zoom;
    targetCtx.fillStyle = ruler.isSnapped ? '#0969da' : '#1e293b';
    targetCtx.beginPath();
    if (typeof targetCtx.roundRect === 'function') {
      targetCtx.roundRect(-floatW / 2, floatY - floatH / 2, floatW, floatH, 6);
    } else {
      targetCtx.rect(-floatW / 2, floatY - floatH / 2, floatW, floatH);
    }
    targetCtx.fill();
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    targetCtx.font = `bold ${pillFontSize}px sans-serif`;
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillText(`${deg}°`, 0, floatY);
    targetCtx.restore();
  }

  targetCtx.restore();
}

// ==========================================
// 10d. Công cụ Compa ảo (Virtual Compass)
// ==========================================

function toggleCompass() {
  isCompassActive = !isCompassActive;
  if (compassBtn) {
    compassBtn.classList.toggle('active', isCompassActive);
  }
  if (!isCompassActive) {
    compassSnapIndicator = null;
    currentArcDrawing = null;
    compass.isMovingCenter = false;
    compass.isResizingRadius = false;
    compass.isDrawingArc = false;
    hideCompassRadiusModal();
  }
  renderAll();
}

function showCompassRadiusModal() {
  if (!compassRadiusModal) return;
  if (compassRadiusInput) {
    compassRadiusInput.value = (compass.r / RULER_CM_UNIT).toFixed(1);
  }
  compassRadiusModal.style.display = 'flex';
  setTimeout(() => {
    if (compassRadiusInput) {
      compassRadiusInput.focus();
      compassRadiusInput.select();
    }
  }, 50);
}

function hideCompassRadiusModal() {
  if (compassRadiusModal) {
    compassRadiusModal.style.display = 'none';
  }
}

function findSnapVertex(paperPt, snapRadiusScreen = 15) {
  const snapDistPaper = snapRadiusScreen / zoom;
  let closest = null;
  let minDist = snapDistPaper;

  for (const obj of pageObjects) {
    const candidates = [];
    if (obj.type === 'shape') {
      if (obj.startPt) candidates.push(obj.startPt);
      if (obj.endPt) candidates.push(obj.endPt);
      const b = obj.aabb || computeShapeAABB(obj);
      candidates.push({ x: b.minX, y: b.minY });
      candidates.push({ x: b.maxX, y: b.minY });
      candidates.push({ x: b.maxX, y: b.maxY });
      candidates.push({ x: b.minX, y: b.maxY });
    } else if (obj.type === 'arc') {
      candidates.push({ x: obj.cx, y: obj.cy });
      candidates.push({
        x: obj.cx + obj.r * Math.cos(obj.startAngle),
        y: obj.cy + obj.r * Math.sin(obj.startAngle)
      });
      candidates.push({
        x: obj.cx + obj.r * Math.cos(obj.endAngle),
        y: obj.cy + obj.r * Math.sin(obj.endAngle)
      });
    } else if (obj.type === 'stroke' && obj.points && obj.points.length > 0) {
      candidates.push(obj.points[0]);
      candidates.push(obj.points[obj.points.length - 1]);
    } else if (obj.type === 'formula') {
      const b = obj.aabb || getObjectBounds(obj);
      candidates.push({ x: b.minX, y: b.minY });
      candidates.push({ x: b.maxX, y: b.minY });
      candidates.push({ x: b.maxX, y: b.maxY });
      candidates.push({ x: b.minX, y: b.maxY });
      candidates.push({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
    }

    for (const c of candidates) {
      const d = Math.hypot(paperPt.x - c.x, paperPt.y - c.y);
      if (d < minDist) {
        minDist = d;
        closest = { x: c.x, y: c.y, snapped: true };
      }
    }
  }

  return closest || { x: paperPt.x, y: paperPt.y, snapped: false };
}

function getCompassGeometry() {
  const cx = compass.cx;
  const cy = compass.cy;
  const r = compass.r;
  const theta = compass.angle;

  const px = cx + r * Math.cos(theta);
  const py = cy + r * Math.sin(theta);

  const mx = (cx + px) / 2;
  const my = (cy + py) / 2;

  const H = Math.max(90, r * 0.85 + 35);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);

  const hx = mx + H * nx;
  const hy = my + H * ny;

  // Điểm nắm chỉnh bán kính trên chân bút chì (khoảng 65% từ khớp đỉnh xuống chân bút chì)
  const rx = hx * 0.35 + px * 0.65;
  const ry = hy * 0.35 + py * 0.65;

  // Ô / badge hiển thị số bán kính (đặt lệch ra ngoài một chút gần chân bút chì)
  const bx = px + (28 / zoom) * Math.cos(theta);
  const by = py + (28 / zoom) * Math.sin(theta);

  return { cx, cy, r, theta, px, py, mx, my, hx, hy, rx, ry, bx, by, H, nx, ny };
}

function hitTestCompass(paperPt) {
  if (!isCompassActive || !compass.placed) return null;

  const g = getCompassGeometry();

  // 1. Điểm nắm đầu kim tại tâm (dời tâm)
  const distNeedle = Math.hypot(paperPt.x - g.cx, paperPt.y - g.cy);
  if (distNeedle <= Math.max(22 / zoom, 20)) {
    return { hit: 'needle', geom: g };
  }

  // 2. Ô số bán kính (nhập số cm)
  const distBadge = Math.hypot(paperPt.x - g.bx, paperPt.y - g.by);
  if (distBadge <= Math.max(26 / zoom, 24)) {
    return { hit: 'radius_badge', geom: g };
  }

  // 3. Chân bút chì (vẽ cung)
  const distPencil = Math.hypot(paperPt.x - g.px, paperPt.y - g.py);
  if (distPencil <= Math.max(24 / zoom, 22)) {
    return { hit: 'pencil_tip', geom: g };
  }

  // 4. Điểm nắm đổi bán kính trên chân bút chì
  const distRadius = Math.hypot(paperPt.x - g.rx, paperPt.y - g.ry);
  if (distRadius <= Math.max(20 / zoom, 18)) {
    return { hit: 'radius_handle', geom: g };
  }

  // 5. Khớp đỉnh / núm xoay đỉnh compa
  const distHinge = Math.hypot(paperPt.x - g.hx, paperPt.y - g.hy);
  if (distHinge <= Math.max(22 / zoom, 20)) {
    return { hit: 'hinge', geom: g };
  }

  return null;
}

function updateArcDrawingFromPointer(paperPt) {
  if (!currentArcDrawing) return;
  const rawAngle = Math.atan2(paperPt.y - currentArcDrawing.cy, paperPt.x - currentArcDrawing.cx);

  // Tính góc vi sai dTheta liên tục (unwrapped tracking, tránh lỗi nhảy góc khi qua ±180 độ)
  const dTheta = Math.atan2(
    Math.sin(rawAngle - currentArcDrawing.prevAngle),
    Math.cos(rawAngle - currentArcDrawing.prevAngle)
  );

  currentArcDrawing.accumulatedDelta += dTheta;
  currentArcDrawing.prevAngle = rawAngle;

  compass.angle = rawAngle;

  // Nếu quay đủ hoặc hơn 360 độ (2*PI) thì tự động khóa thành đường tròn đầy đủ
  if (Math.abs(currentArcDrawing.accumulatedDelta) >= Math.PI * 2 - 0.05) {
    currentArcDrawing.isFullCircle = true;
    currentArcDrawing.startAngle = 0;
    currentArcDrawing.endAngle = Math.PI * 2;
    currentArcDrawing.anticlockwise = false;
  } else {
    currentArcDrawing.isFullCircle = false;
    currentArcDrawing.endAngle = currentArcDrawing.startAngle + currentArcDrawing.accumulatedDelta;
    currentArcDrawing.anticlockwise = currentArcDrawing.accumulatedDelta < 0;
  }
}

function drawCompass(targetCtx) {
  if (!isCompassActive) return;

  targetCtx.save();

  // Trường hợp đang mở compa bước đầu (kéo mở bán kính từ tâm)
  if (!compass.placed) {
    const cx = compass.cx, cy = compass.cy, r = compass.r;

    // Vòng tròn nét đứt hướng dẫn
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, r, 0, Math.PI * 2);
    targetCtx.strokeStyle = 'rgba(9, 105, 218, 0.45)';
    targetCtx.lineWidth = 1.5 / zoom;
    targetCtx.setLineDash([5 / zoom, 5 / zoom]);
    targetCtx.stroke();
    targetCtx.restore();

    // Đầu kim tâm
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, 6 / zoom, 0, Math.PI * 2);
    targetCtx.fillStyle = '#0969da';
    targetCtx.fill();
    targetCtx.restore();

    // Điểm mút kéo
    const px = cx + r * Math.cos(compass.angle);
    const py = cy + r * Math.sin(compass.angle);

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.moveTo(cx, cy);
    targetCtx.lineTo(px, py);
    targetCtx.strokeStyle = '#0969da';
    targetCtx.lineWidth = 1.8 / zoom;
    targetCtx.stroke();

    // Badge bán kính
    const cm = (r / RULER_CM_UNIT).toFixed(1);
    targetCtx.fillStyle = '#0969da';
    targetCtx.font = `bold ${Math.max(10 / zoom, 12)}px sans-serif`;
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'bottom';
    targetCtx.fillText(`${cm} cm`, (cx + px) / 2, (cy + py) / 2 - 8 / zoom);
    targetCtx.restore();

    targetCtx.restore();
    return;
  }

  // Trường hợp compa 2 chân đã đặt trên trang
  const g = getCompassGeometry();

  // 1. Đường tròn chỉ dẫn mờ mờ cho bán kính hiện tại
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  targetCtx.strokeStyle = 'rgba(9, 105, 218, 0.18)';
  targetCtx.lineWidth = 1 / zoom;
  targetCtx.setLineDash([4 / zoom, 6 / zoom]);
  targetCtx.stroke();
  targetCtx.restore();

  // 2. Điểm bắt dính tâm (nếu đang hút vào một đỉnh)
  if (compassSnapIndicator) {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.arc(compassSnapIndicator.x, compassSnapIndicator.y, 14 / zoom, 0, Math.PI * 2);
    targetCtx.strokeStyle = '#2da44e';
    targetCtx.lineWidth = 2.5 / zoom;
    targetCtx.stroke();
    targetCtx.restore();
  }

  // 3. Vẽ hai chân Compa (Chân kim và Chân bút chì)
  // Thanh giằng kim loại nối giữa hai chân
  const brace1X = g.hx * 0.6 + g.cx * 0.4;
  const brace1Y = g.hy * 0.6 + g.cy * 0.4;
  const brace2X = g.hx * 0.6 + g.px * 0.4;
  const brace2Y = g.hy * 0.6 + g.py * 0.4;

  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.moveTo(brace1X, brace1Y);
  targetCtx.lineTo(brace2X, brace2Y);
  targetCtx.strokeStyle = '#94a3b8';
  targetCtx.lineWidth = 3.5 / zoom;
  targetCtx.stroke();

  // Ốc vặn chỉnh bán kính ở giữa thanh giằng
  const midBraceX = (brace1X + brace2X) / 2;
  const midBraceY = (brace1Y + brace2Y) / 2;
  targetCtx.beginPath();
  targetCtx.arc(midBraceX, midBraceY, 4.5 / zoom, 0, Math.PI * 2);
  targetCtx.fillStyle = '#cbd5e1';
  targetCtx.fill();
  targetCtx.strokeStyle = '#475569';
  targetCtx.lineWidth = 1 / zoom;
  targetCtx.stroke();
  targetCtx.restore();

  // Chân kim (từ khớp đỉnh hx, hy đến tâm cx, cy)
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.moveTo(g.hx, g.hy);
  targetCtx.lineTo(g.cx, g.cy);
  targetCtx.strokeStyle = '#475569';
  targetCtx.lineWidth = 4 / zoom;
  targetCtx.lineCap = 'round';
  targetCtx.stroke();

  // Chân bút chì (từ khớp đỉnh hx, hy đến ngòi bút px, py)
  targetCtx.beginPath();
  targetCtx.moveTo(g.hx, g.hy);
  targetCtx.lineTo(g.px, g.py);
  targetCtx.strokeStyle = '#475569';
  targetCtx.lineWidth = 4 / zoom;
  targetCtx.lineCap = 'round';
  targetCtx.stroke();

  // Ruột bút chì ở đoạn cuối chân bút chì
  targetCtx.beginPath();
  targetCtx.moveTo(g.hx * 0.2 + g.px * 0.8, g.hy * 0.2 + g.py * 0.8);
  targetCtx.lineTo(g.px, g.py);
  targetCtx.strokeStyle = currentColor || '#1a1a1a';
  targetCtx.lineWidth = 5.5 / zoom;
  targetCtx.stroke();
  targetCtx.restore();

  // 4. Khớp đỉnh compa và núm xoay (Hinge & Top Knob)
  targetCtx.save();
  const kx = g.hx + (20 / zoom) * g.nx;
  const ky = g.hy + (20 / zoom) * g.ny;
  targetCtx.beginPath();
  targetCtx.moveTo(g.hx, g.hy);
  targetCtx.lineTo(kx, ky);
  targetCtx.strokeStyle = '#334155';
  targetCtx.lineWidth = 4 / zoom;
  targetCtx.stroke();

  targetCtx.beginPath();
  targetCtx.arc(kx, ky, 5.5 / zoom, 0, Math.PI * 2);
  targetCtx.fillStyle = '#1e293b';
  targetCtx.fill();

  targetCtx.beginPath();
  targetCtx.arc(g.hx, g.hy, 8 / zoom, 0, Math.PI * 2);
  targetCtx.fillStyle = '#64748b';
  targetCtx.fill();
  targetCtx.strokeStyle = '#1e293b';
  targetCtx.lineWidth = 1.5 / zoom;
  targetCtx.stroke();
  targetCtx.restore();

  // 5. Điểm nắm đầu kim tại tâm (dời tâm)
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.arc(g.cx, g.cy, 8 / zoom, 0, Math.PI * 2);
  targetCtx.fillStyle = '#ffffff';
  targetCtx.fill();
  targetCtx.strokeStyle = '#0969da';
  targetCtx.lineWidth = 2.5 / zoom;
  targetCtx.stroke();

  targetCtx.beginPath();
  targetCtx.arc(g.cx, g.cy, 3 / zoom, 0, Math.PI * 2);
  targetCtx.fillStyle = '#0969da';
  targetCtx.fill();
  targetCtx.restore();

  // 6. Điểm nắm đổi bán kính (ở khoảng 65% chân bút chì)
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.arc(g.rx, g.ry, 6.5 / zoom, 0, Math.PI * 2);
  targetCtx.fillStyle = compass.isResizingRadius ? '#0969da' : '#ffffff';
  targetCtx.fill();
  targetCtx.strokeStyle = '#0969da';
  targetCtx.lineWidth = 1.8 / zoom;
  targetCtx.stroke();
  targetCtx.restore();

  // 7. Chân bút chì (ngòi vẽ)
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.arc(g.px, g.py, 8 / zoom, 0, Math.PI * 2);
  targetCtx.fillStyle = currentColor || '#1a1a1a';
  targetCtx.fill();
  targetCtx.strokeStyle = '#ffffff';
  targetCtx.lineWidth = 2 / zoom;
  targetCtx.stroke();
  targetCtx.restore();

  // 8. Badge bán kính & nút nhập số chính xác
  const cm = (g.r / RULER_CM_UNIT).toFixed(1);
  const badgeText = `${cm} cm`;
  const fontSize = Math.max(10 / zoom, 12);
  targetCtx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  const textWidth = targetCtx.measureText(badgeText).width;
  const pillW = textWidth + 24 / zoom;
  const pillH = 24 / zoom;

  targetCtx.save();
  targetCtx.shadowColor = 'rgba(0,0,0,0.18)';
  targetCtx.shadowBlur = 4 / zoom;
  targetCtx.beginPath();
  if (typeof targetCtx.roundRect === 'function') {
    targetCtx.roundRect(g.bx - pillW / 2, g.by - pillH / 2, pillW, pillH, 6 / zoom);
  } else {
    targetCtx.rect(g.bx - pillW / 2, g.by - pillH / 2, pillW, pillH);
  }
  targetCtx.fillStyle = '#ffffff';
  targetCtx.fill();
  targetCtx.strokeStyle = '#0969da';
  targetCtx.lineWidth = 1.2 / zoom;
  targetCtx.stroke();

  targetCtx.fillStyle = '#0969da';
  targetCtx.textAlign = 'center';
  targetCtx.textBaseline = 'middle';
  targetCtx.fillText(badgeText, g.bx, g.by);
  targetCtx.restore();

  targetCtx.restore();
}

// ==========================================
// 10e. Công cụ Chèn Công thức LaTeX
// ==========================================

function getViewportCenterPaperPoint() {
  const rect = canvas.getBoundingClientRect();
  const screenCenterX = rect.width / 2;
  const screenCenterY = rect.height / 2;
  const pageDims = getPageDimensions(pageConfig);
  let pageX = (screenCenterX - panX) / zoom;
  let pageY = (screenCenterY - panY) / zoom;
  pageX = Math.max(80, Math.min(pageDims.width - 80, pageX));
  pageY = Math.max(80, Math.min(pageDims.height - 80, pageY));
  return { x: pageX, y: pageY };
}

function getOrCreateFormulaImage(latex, displayMode, color) {
  const safeColor = color || '#1a1a1a';
  const safeMode = displayMode || 'display';
  const cacheKey = `${latex}___${safeMode}___${safeColor}`;
  let cached = formulaImageCache.get(cacheKey);
  if (cached) return cached;

  cached = { loaded: false, error: false, img: null, loading: true };
  formulaImageCache.set(cacheKey, cached);

  try {
    if (!window.MathJax || typeof window.MathJax.tex2svg !== 'function') {
      cached.error = true;
      cached.loading = false;
      return cached;
    }

    const isDisplay = (safeMode === 'display');
    const node = window.MathJax.tex2svg(latex, { display: isDisplay });
    const svg = node.querySelector('svg');
    if (!svg) {
      cached.error = true;
      cached.loading = false;
      return cached;
    }

    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.style.color = safeColor;

    const vbAttr = svg.getAttribute('viewBox');
    if (vbAttr) {
      const vb = vbAttr.split(' ').map(Number);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        const aspect = vb[3] / vb[2];
        const crispW = Math.max(1200, Math.min(2800, Math.round(vb[2])));
        const crispH = Math.max(100, Math.round(crispW * aspect));
        svg.setAttribute('width', `${crispW}px`);
        svg.setAttribute('height', `${crispH}px`);
      }
    }

    const svgXml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      cached.loaded = true;
      cached.loading = false;
      cached.img = img;
      URL.revokeObjectURL(url);
      if (typeof renderAll === 'function') {
        renderAll();
      }
      if (typeof updateCurrentPageThumbnail === 'function') {
        updateCurrentPageThumbnail();
      }
    };
    img.onerror = () => {
      cached.loaded = false;
      cached.loading = false;
      cached.error = true;
      URL.revokeObjectURL(url);
    };
    img.src = url;
  } catch (err) {
    console.error('Error generating formula image:', err);
    cached.error = true;
    cached.loading = false;
  }

  return cached;
}

function drawFormulaObject(targetCtx, formula) {
  if (!formula || !formula.latex) return;
  const cached = getOrCreateFormulaImage(formula.latex, formula.displayMode, formula.color);
  if (cached && cached.loaded && cached.img) {
    targetCtx.drawImage(cached.img, formula.x, formula.y, formula.width, formula.height);
  } else if (!cached || cached.loading) {
    targetCtx.save();
    targetCtx.fillStyle = 'rgba(150, 150, 150, 0.08)';
    targetCtx.fillRect(formula.x, formula.y, formula.width, formula.height);
    targetCtx.restore();
  }
}

function isFormulaHitByEraser(formula, eX, eY, rPaper) {
  const b = getObjectBounds(formula);
  const nearestX = Math.max(b.minX, Math.min(eX, b.maxX));
  const nearestY = Math.max(b.minY, Math.min(eY, b.maxY));
  const dx = eX - nearestX;
  const dy = eY - nearestY;
  return (dx * dx + dy * dy) <= (rPaper * rPaper);
}

function updateLatexPreview() {
  if (!latexPreviewBox || !latexCodeInput || !confirmLatexBtn) return;
  const rawLatex = latexCodeInput.value.trim();

  if (!rawLatex) {
    latexPreviewBox.innerHTML = '<span style="color: #8c959f; font-size: 13px;">(Nhập mã LaTeX để xem trước)</span>';
    if (latexErrorBox) {
      latexErrorBox.style.display = 'none';
      latexErrorBox.textContent = '';
    }
    confirmLatexBtn.disabled = true;
    return;
  }

  if (!window.MathJax || typeof window.MathJax.tex2svg !== 'function') {
    if (latexErrorBox) {
      latexErrorBox.style.display = 'block';
      latexErrorBox.textContent = 'Lỗi: Thư viện MathJax chưa sẵn sàng';
    }
    confirmLatexBtn.disabled = true;
    return;
  }

  try {
    const isDisplay = (document.querySelector('input[name="latexDisplayMode"]:checked')?.value || 'display') === 'display';
    const node = window.MathJax.tex2svg(rawLatex, { display: isDisplay });

    // Kiểm tra xem MathJax có trả về lỗi bên trong node không
    const merror = node.querySelector('merror, [data-mjx-error]');
    if (merror) {
      const errorText = merror.getAttribute('title') || merror.textContent || 'Cú pháp LaTeX không hợp lệ';
      if (latexErrorBox) {
        latexErrorBox.textContent = 'Lỗi: ' + errorText;
        latexErrorBox.style.display = 'block';
      }
      latexPreviewBox.innerHTML = '<span style="color: #cf222e; font-size: 13px;">(Công thức có lỗi cú pháp)</span>';
      confirmLatexBtn.disabled = true;
      return;
    }

    const svg = node.querySelector('svg');
    if (!svg) {
      throw new Error('Không thể tạo SVG từ công thức này');
    }

    svg.style.color = currentColor || '#1a1a1a';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';

    latexPreviewBox.innerHTML = '';
    latexPreviewBox.appendChild(node);

    if (latexErrorBox) {
      latexErrorBox.style.display = 'none';
      latexErrorBox.textContent = '';
    }
    confirmLatexBtn.disabled = false;
  } catch (err) {
    if (latexErrorBox) {
      latexErrorBox.textContent = 'Lỗi: ' + (err.message || 'Cú pháp LaTeX không hợp lệ');
      latexErrorBox.style.display = 'block';
    }
    latexPreviewBox.innerHTML = '<span style="color: #cf222e; font-size: 13px;">(Công thức có lỗi cú pháp)</span>';
    confirmLatexBtn.disabled = true;
  }
}

function showLatexModal(editingFormula = null) {
  if (!latexModal) return;
  if (paperMenu) paperMenu.classList.remove('open');
  if (shapeMenu) shapeMenu.classList.remove('open');
  if (backupMenu) backupMenu.classList.remove('open');

  if (editingFormula) {
    editingFormulaId = editingFormula.id;
    if (latexModalTitle) latexModalTitle.textContent = 'Sửa công thức LaTeX';
    if (confirmLatexBtn) confirmLatexBtn.textContent = 'Cập nhật';
    if (latexCodeInput) latexCodeInput.value = editingFormula.latex || '';
    const displayMode = editingFormula.displayMode || 'display';
    const radio = document.querySelector(`input[name="latexDisplayMode"][value="${displayMode}"]`);
    if (radio) radio.checked = true;
  } else {
    editingFormulaId = null;
    if (latexModalTitle) latexModalTitle.textContent = 'Chèn công thức LaTeX';
    if (confirmLatexBtn) confirmLatexBtn.textContent = 'Chèn';
    if (latexCodeInput) latexCodeInput.value = '';
    const displayRadio = document.querySelector('input[name="latexDisplayMode"][value="display"]');
    if (displayRadio) displayRadio.checked = true;
  }

  updateLatexPreview();
  latexModal.style.display = 'flex';
  if (latexCodeInput) {
    setTimeout(() => {
      latexCodeInput.focus();
      latexCodeInput.select();
    }, 50);
  }
}

function hideLatexModal() {
  if (!latexModal) return;
  latexModal.style.display = 'none';
  editingFormulaId = null;
  if (latexCodeInput) latexCodeInput.value = '';
  if (latexErrorBox) {
    latexErrorBox.style.display = 'none';
    latexErrorBox.textContent = '';
  }
}

function submitLatexFormula() {
  const rawLatex = latexCodeInput ? latexCodeInput.value.trim() : '';
  if (!rawLatex) return;

  const isDisplay = (document.querySelector('input[name="latexDisplayMode"]:checked')?.value || 'display') === 'display';
  const displayMode = isDisplay ? 'display' : 'inline';

  // Render node để đo kích thước viewBox của công thức
  let vbW = 1000, vbH = 500;
  try {
    const node = window.MathJax.tex2svg(rawLatex, { display: isDisplay });
    const svg = node.querySelector('svg');
    if (svg && svg.getAttribute('viewBox')) {
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        vbW = vb[2];
        vbH = vb[3];
      }
    }
  } catch (e) {
    return;
  }

  const emSize = 30;
  let naturalWidth = (vbW / 1000) * emSize;
  let naturalHeight = (vbH / 1000) * emSize;
  const pageDims = getPageDimensions(pageConfig);
  if (naturalWidth > pageDims.width * 0.8) {
    const s = (pageDims.width * 0.8) / naturalWidth;
    naturalWidth *= s;
    naturalHeight *= s;
  }

  if (editingFormulaId) {
    // Sửa công thức hiện có: giữ nguyên vị trí tâm và tỉ lệ scale đã chỉnh
    const targetFormulaId = editingFormulaId;
    const existing = pageObjects.find(o => o.id === targetFormulaId);
    if (!existing) {
      hideLatexModal();
      return;
    }

    const oldSnap = cloneObject(existing);
    const currentScale = existing.scale || 1.0;
    const oldCenterX = existing.x + existing.width / 2;
    const oldCenterY = existing.y + existing.height / 2;
    const newWidth = naturalWidth * currentScale;
    const newHeight = naturalHeight * currentScale;
    const newX = oldCenterX - newWidth / 2;
    const newY = oldCenterY - newHeight / 2;

    const newSnap = cloneObject(existing);
    newSnap.latex = rawLatex;
    newSnap.displayMode = displayMode;
    newSnap.naturalWidth = naturalWidth;
    newSnap.naturalHeight = naturalHeight;
    newSnap.width = newWidth;
    newSnap.height = newHeight;
    newSnap.scale = currentScale;
    newSnap.x = newX;
    newSnap.y = newY;

    hideLatexModal();

    getOrCreateFormulaImage(newSnap.latex, newSnap.displayMode, newSnap.color);

    executeAction({
      type: 'edit_formula',
      do: () => {
        const obj = pageObjects.find(o => o.id === targetFormulaId);
        if (obj) {
          Object.assign(obj, cloneObject(newSnap));
          obj.aabb = getObjectBounds(obj);
          selectionBounds = computeSelectionBounds();
          updateSelectionActionsUI();
        }
      },
      undo: () => {
        const obj = pageObjects.find(o => o.id === targetFormulaId);
        if (obj) {
          Object.assign(obj, cloneObject(oldSnap));
          obj.aabb = getObjectBounds(obj);
          selectionBounds = computeSelectionBounds();
          updateSelectionActionsUI();
        }
      }
    });
  } else {
    // Chèn công thức mới vào giữa vùng đang nhìn (viewport) của trang
    const center = getViewportCenterPaperPoint();
    const newX = center.x - naturalWidth / 2;
    const newY = center.y - naturalHeight / 2;

    const newFormula = {
      id: 'formula_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      type: 'formula',
      latex: rawLatex,
      displayMode: displayMode,
      color: currentColor || '#1a1a1a',
      x: newX,
      y: newY,
      width: naturalWidth,
      height: naturalHeight,
      naturalWidth: naturalWidth,
      naturalHeight: naturalHeight,
      scale: 1.0
    };
    newFormula.aabb = getObjectBounds(newFormula);

    hideLatexModal();

    executeAction({
      type: 'add_formula',
      formula: newFormula,
      do: () => {
        pageObjects.push(newFormula);
        setTool('lasso');
        selectedObjectIds.clear();
        selectedObjectIds.add(newFormula.id);
        selectionBounds = computeSelectionBounds();
        updateSelectionActionsUI();
      },
      undo: () => {
        const idx = pageObjects.findIndex(o => o.id === newFormula.id);
        if (idx !== -1) pageObjects.splice(idx, 1);
        selectedObjectIds.delete(newFormula.id);
        selectionBounds = computeSelectionBounds();
        updateSelectionActionsUI();
      }
    });
  }
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
  const { width: pWidth, height: pHeight } = getPageDimensions(pageConfig);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.14)';
  ctx.shadowBlur = Math.min(24, 16 * zoom);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.min(8, 4 * zoom);
  ctx.fillStyle = bgColor;
  ctx.fillRect(panX, panY, pWidth * zoom, pHeight * zoom);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(panX, panY, pWidth * zoom, pHeight * zoom);
  ctx.clip();

  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  drawPaperPattern(ctx);

  for (let i = 0; i < pageObjects.length; i++) {
    drawObject(ctx, pageObjects[i]);
  }

  if (currentStroke) {
    drawStroke(ctx, currentStroke);
  }

  if (currentShapeDrawing) {
    drawShape(ctx, currentShapeDrawing);
  }

  // 1. Đường khoanh nét đứt khi đang dùng Lasso
  if (lassoPath && lassoPath.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#0969da';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);
    ctx.beginPath();
    ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
    for (let i = 1; i < lassoPath.length; i++) {
      ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(9, 105, 218, 0.08)';
    ctx.fill();
    ctx.restore();
  }

  // 2. Khung bao nét đứt và 4 điểm nắm của vùng chọn
  if (selectionBounds && selectedObjectIds.size > 0) {
    const { minX, minY, maxX, maxY } = selectionBounds;
    const w = maxX - minX;
    const h = maxY - minY;

    ctx.save();
    ctx.strokeStyle = '#0969da';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);
    ctx.strokeRect(minX, minY, w, h);
    ctx.restore();

    // 4 Điểm nắm hình tròn cố định trên màn hình (bán kính 5.5px)
    const handleRadius = 5.5 / zoom;
    const handles = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ];

    ctx.save();
    ctx.setLineDash([]);
    for (const hPt of handles) {
      ctx.beginPath();
      ctx.arc(hPt.x, hPt.y, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 / zoom;
      ctx.strokeStyle = '#0969da';
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();

  // 3. Vẽ Thước kẻ ảo (Ruler) & Nét kẻ xem trước nếu đang bật Thước
  if (isRulerActive) {
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    if (currentRulerLine) {
      drawRulerLinePreview(ctx, currentRulerLine);
    }
    drawRuler(ctx);
    ctx.restore();
  }

  // 4. Vẽ Compa ảo (Compass) & Cung tròn xem trước nếu đang bật Compa
  if (isCompassActive) {
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    if (currentArcDrawing) {
      drawArcObject(ctx, currentArcDrawing);
    }
    drawCompass(ctx);
    ctx.restore();
  }

  updateSelectionActionsUI();
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

// Chuyển đổi Bút / Tẩy / Lasso
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

if (lassoBtn) {
  lassoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setTool('lasso');
  });
  lassoBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (shapeBtn) {
  shapeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentTool !== 'shape') {
      setTool('shape');
    }
    toggleShapeMenu(shapeBtn);
  });
  shapeBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (rulerBtn) {
  rulerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRuler();
  });
  rulerBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (compassBtn) {
  compassBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCompass();
  });
  compassBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (compassRadiusForm) {
  compassRadiusForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (compassRadiusInput) {
      const val = parseFloat(compassRadiusInput.value);
      if (!isNaN(val) && val >= 0.5 && val <= 35) {
        compass.r = val * RULER_CM_UNIT;
        renderAll();
      }
    }
    hideCompassRadiusModal();
  });
}

if (cancelCompassRadiusBtn) {
  cancelCompassRadiusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideCompassRadiusModal();
  });
}

if (closeCompassRadiusModalBtn) {
  closeCompassRadiusModalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideCompassRadiusModal();
  });
}

// Các nút trên hộp thoại Công thức LaTeX
if (latexBtn) {
  latexBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showLatexModal();
  });
  latexBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (latexForm) {
  latexForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (confirmLatexBtn && !confirmLatexBtn.disabled) {
      submitLatexFormula();
    }
  });
}

if (confirmLatexBtn) {
  confirmLatexBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirmLatexBtn.disabled) {
      submitLatexFormula();
    }
  });
}

if (latexCodeInput) {
  latexCodeInput.addEventListener('input', () => {
    updateLatexPreview();
  });
  latexCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (confirmLatexBtn && !confirmLatexBtn.disabled) {
        submitLatexFormula();
      }
    }
  });
}

document.querySelectorAll('input[name="latexDisplayMode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    updateLatexPreview();
  });
});

if (cancelLatexBtn) {
  cancelLatexBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideLatexModal();
  });
}

if (closeLatexModalBtn) {
  closeLatexModalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideLatexModal();
  });
}

if (latexModal) {
  latexModal.addEventListener('click', (e) => {
    if (e.target === latexModal) {
      hideLatexModal();
    }
  });
}

if (editFormulaSelectionBtn) {
  editFormulaSelectionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectedObjectIds && selectedObjectIds.size === 1) {
      const selectedObj = pageObjects.find(o => selectedObjectIds.has(o.id));
      if (selectedObj && selectedObj.type === 'formula') {
        showLatexModal(selectedObj);
      }
    }
  });
  editFormulaSelectionBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

// Các nút trên thanh thao tác nổi cho vùng chọn Lasso
if (selectionActions) {
  selectionActions.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (deleteSelectionBtn) {
  deleteSelectionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteSelectedObjects();
  });
  deleteSelectionBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (copySelectionBtn) {
  copySelectionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copySelectedObjects();
  });
  copySelectionBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

if (deselectBtn) {
  deselectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deselectObjects();
  });
  deselectBtn.addEventListener('pointerdown', (e) => {
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
    if (currentTool === 'eraser' || currentTool === 'lasso') {
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

    if (currentTool === 'eraser' || currentTool === 'lasso') {
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

  const orientationGroup = document.getElementById('orientationGroup');
  if (orientationGroup) {
    orientationGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      e.stopPropagation();

      const newOrientation = btn.getAttribute('data-orientation') || 'portrait';
      if (newOrientation === (pageConfig.orientation || 'portrait')) return;

      const { width: newWidth, height: newHeight } = (newOrientation === 'landscape')
        ? { width: PAGE_LANDSCAPE_WIDTH, height: PAGE_LANDSCAPE_HEIGHT }
        : { width: PAGE_PORTRAIT_WIDTH, height: PAGE_PORTRAIT_HEIGHT };

      const hasStrokesOutside = checkStrokesOutsideBounds(newWidth, newHeight);
      if (hasStrokesOutside) {
        const proceed = confirm('Một số nét vẽ nằm ngoài khổ giấy mới sẽ tạm thời không hiển thị (vẫn được lưu trong dữ liệu và hiển thị lại đầy đủ khi đổi lại hướng cũ).\n\nBạn có muốn tiếp tục đổi hướng không?');
        if (!proceed) return;
      }

      pageConfig.orientation = newOrientation;
      orientationGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      centerPage(zoom);
      updateCurrentPageThumbnail();
      renderSidebar();
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

function checkStrokesOutsideBounds(limitWidth, limitHeight) {
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (s.aabb) {
      if (s.aabb.maxX > limitWidth || s.aabb.maxY > limitHeight) return true;
    } else if (s.points) {
      for (let j = 0; j < s.points.length; j++) {
        const pt = s.points[j];
        if (pt.x > limitWidth || pt.y > limitHeight) return true;
      }
    }
  }
  return false;
}

// Menu Popover Chọn Hình học Cơ bản
function toggleShapeMenu(anchorEl = shapeBtn) {
  if (!shapeMenu || !anchorEl) return;
  const isOpen = shapeMenu.classList.contains('open');

  if (isOpen) {
    shapeMenu.classList.remove('open');
  } else {
    if (paperMenu) paperMenu.classList.remove('open');
    if (backupMenu) backupMenu.classList.remove('open');
    const rect = anchorEl.getBoundingClientRect();
    const parentRect = canvas.getBoundingClientRect();
    shapeMenu.style.top = `${rect.bottom - parentRect.top + 8}px`;
    shapeMenu.style.left = `${Math.min(parentRect.width - 310, Math.max(10, rect.left - parentRect.left - 40))}px`;
    shapeMenu.classList.add('open');
  }
}

if (shapeMenu) {
  shapeMenu.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  shapeMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('.shape-item-btn');
    if (!btn) return;
    e.stopPropagation();

    const shape = btn.getAttribute('data-shape');
    if (shape) {
      currentShapeType = shape;
      shapeMenu.querySelectorAll('.shape-item-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      setTool('shape');
      shapeMenu.classList.remove('open');
    }
  });
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
  if (shapeMenu && shapeMenu.classList.contains('open')) {
    if (!shapeMenu.contains(e.target) && (!shapeBtn || !shapeBtn.contains(e.target))) {
      shapeMenu.classList.remove('open');
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
    hideCompassRadiusModal();
    hideLatexModal();
    if (paperMenu) paperMenu.classList.remove('open');
    if (shapeMenu) shapeMenu.classList.remove('open');
    if (backupMenu) backupMenu.classList.remove('open');
    deselectObjects();
    return;
  }

  if (e.key === 'Shift' && activeInteractionType === 'shape_draw' && currentShapeDrawing) {
    currentShapeDrawing.shiftKey = true;
    currentShapeDrawing.endPt = getConstrainedEndPoint(
      currentShapeDrawing.shapeType,
      currentShapeDrawing.startPt,
      currentShapeDrawing.rawPt || currentShapeDrawing.endPt,
      true
    );
    renderAll();
  }

  // Không nhận phím tắt vẽ khi đang ở màn hình danh sách
  if (noteListView && noteListView.style.display !== 'none') return;

  const activeEl = document.activeElement;
  const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
  if (isInputFocused) return;

  if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey) {
    setTool('pen');
  } else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey) {
    setTool('eraser');
  } else if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.altKey) {
    setTool('lasso');
  } else if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey) {
    setTool('shape');
  } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.altKey) {
    toggleRuler();
  } else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.altKey) {
    toggleCompass();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedObjectIds && selectedObjectIds.size > 0) {
      e.preventDefault();
      deleteSelectedObjects();
    }
  } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
    if (selectedObjectIds && selectedObjectIds.size > 0) {
      e.preventDefault();
      copySelectedObjects();
    }
  } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
    e.preventDefault();
    pasteObjects();
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

window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift' && activeInteractionType === 'shape_draw' && currentShapeDrawing) {
    currentShapeDrawing.shiftKey = false;
    currentShapeDrawing.endPt = getConstrainedEndPoint(
      currentShapeDrawing.shapeType,
      currentShapeDrawing.startPt,
      currentShapeDrawing.rawPt || currentShapeDrawing.endPt,
      false
    );
    renderAll();
  }
});

window.addEventListener('copy', (e) => {
  if (noteListView && noteListView.style.display !== 'none') return;
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
  if (selectedObjectIds && selectedObjectIds.size > 0) {
    copySelectedObjects();
  }
});

window.addEventListener('paste', (e) => {
  if (noteListView && noteListView.style.display !== 'none') return;
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
  pasteObjects();
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
  if (e.pointerType !== 'pen' && e.pointerType !== 'eraser' && e.pointerType !== 'mouse') return;
  if (isInteracting) return;

  const paperPt = getPaperPoint(e);
  const isErasing = currentTool === 'eraser' || isPhysicalEraserTip(e);

  // 1. Thước kẻ ảo (Ruler) xử lý trước nếu đang bật và không dùng đầu tẩy
  if (isRulerActive && !isErasing) {
    const rulerHit = hitTestRuler(paperPt);
    if (rulerHit) {
      e.preventDefault();
      isInteracting = true;
      activePointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}

      if (rulerHit.hit === 'rotate') {
        activeInteractionType = 'ruler_rotate';
        ruler.isRotating = true;
        updateRulerAngleFromPointer(paperPt);
        renderAll();
        return;
      }

      if (rulerHit.hit === 'edge') {
        deselectObjects();
        activeInteractionType = 'ruler_draw';
        const shapeType = (currentTool === 'shape' && (currentShapeType.startsWith('line_') || currentShapeType.startsWith('arrow_')))
          ? currentShapeType
          : 'line_solid';
        currentRulerLine = {
          edgeY: rulerHit.edgeY,
          startLocalX: rulerHit.localPt.x,
          endLocalX: rulerHit.localPt.x,
          color: currentColor,
          baseWidth: currentWidth,
          shapeType: shapeType
        };
        renderAll();
        return;
      }

      if (rulerHit.hit === 'body') {
        activeInteractionType = 'ruler_move';
        ruler.isMoving = true;
        rulerDragOffset = {
          dx: paperPt.x - ruler.cx,
          dy: paperPt.y - ruler.cy
        };
        renderAll();
        return;
      }
    }
  }

  // 2. Compa ảo (Compass) xử lý trước nếu đang bật và không dùng đầu tẩy
  if (isCompassActive && !isErasing) {
    if (!compass.placed) {
      e.preventDefault();
      isInteracting = true;
      activePointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}

      const snap = findSnapVertex(paperPt, 15);
      compass.cx = snap.x;
      compass.cy = snap.y;
      compass.r = 10;
      compass.angle = 0;
      compassSnapIndicator = snap.snapped ? { x: snap.x, y: snap.y } : null;
      activeInteractionType = 'compass_initial_open';
      renderAll();
      return;
    } else {
      const compHit = hitTestCompass(paperPt);
      if (compHit) {
        e.preventDefault();
        isInteracting = true;
        activePointerId = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}

        if (compHit.hit === 'radius_badge') {
          showCompassRadiusModal();
          isInteracting = false;
          activePointerId = null;
          return;
        }

        if (compHit.hit === 'needle') {
          activeInteractionType = 'compass_move_center';
          compass.isMovingCenter = true;
          renderAll();
          return;
        }

        if (compHit.hit === 'radius_handle') {
          activeInteractionType = 'compass_resize_radius';
          compass.isResizingRadius = true;
          renderAll();
          return;
        }

        if (compHit.hit === 'pencil_tip') {
          deselectObjects();
          activeInteractionType = 'compass_draw_arc';
          compass.isDrawingArc = true;
          const theta0 = Math.atan2(paperPt.y - compass.cy, paperPt.x - compass.cx);
          currentArcDrawing = {
            cx: compass.cx,
            cy: compass.cy,
            r: compass.r,
            startAngle: theta0,
            endAngle: theta0,
            prevAngle: theta0,
            accumulatedDelta: 0,
            isFullCircle: false,
            anticlockwise: false,
            color: currentColor,
            baseWidth: currentWidth
          };
          renderAll();
          return;
        }

        if (compHit.hit === 'hinge') {
          activeInteractionType = 'compass_move_all';
          compassDragOffset = {
            dx: paperPt.x - compass.cx,
            dy: paperPt.y - compass.cy
          };
          renderAll();
          return;
        }
      }
    }
  }

  const { width: pWidth, height: pHeight } = getPageDimensions(pageConfig);
  if (paperPt.x < 0 || paperPt.x > pWidth || paperPt.y < 0 || paperPt.y > pHeight) {
    return;
  }

  e.preventDefault();

  if (isErasing) {
    isInteracting = true;
    activeInteractionType = 'eraser';
    activePointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    lastScreenX = e.clientX;
    lastScreenY = e.clientY;
    updateEraserCursorPosition(e.clientX, e.clientY);
    erasedInCurrentDrag = [];
    checkAndEraseStrokes(paperPt.x, paperPt.y);
    return;
  }

  if (currentTool === 'lasso') {
    // 1. Kiểm tra bấm vào 4 góc điểm nắm
    const handleHit = getSelectionHandleAtScreenPoint(e.clientX, e.clientY);
    if (handleHit && selectedObjectIds.size > 0) {
      isInteracting = true;
      activePointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      activeInteractionType = 'lasso_manipulate';
      isManipulatingSelection = true;
      manipulationType = 'scale';
      activeHandle = handleHit;
      manipulationOrigin = { x: handleHit.originX, y: handleHit.originY };
      initialHandleDist = Math.hypot(handleHit.paperX - handleHit.originX, handleHit.paperY - handleHit.originY);
      initialDiagonalUnit = {
        ux: (handleHit.paperX - handleHit.originX) / Math.max(1, initialHandleDist),
        uy: (handleHit.paperY - handleHit.originY) / Math.max(1, initialHandleDist)
      };
      manipulationSnapshots = pageObjects.filter(o => selectedObjectIds.has(o.id)).map(o => cloneObject(o));
      manipulationInitialBounds = { ...selectionBounds };
      return;
    }

    // 2. Kiểm tra bấm vào trong khung bao lựa chọn
    if (selectionBounds && isPaperPointInsideSelection(paperPt) && selectedObjectIds.size > 0) {
      isInteracting = true;
      activePointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      activeInteractionType = 'lasso_manipulate';
      isManipulatingSelection = true;
      manipulationType = 'move';
      dragStartPaperPt = { x: paperPt.x, y: paperPt.y };
      manipulationSnapshots = pageObjects.filter(o => selectedObjectIds.has(o.id)).map(o => cloneObject(o));
      manipulationInitialBounds = { ...selectionBounds };
      return;
    }

    // 3. Chạm ra ngoài khung -> Bỏ chọn & Bắt đầu khoanh vùng mới
    deselectObjects();
    isInteracting = true;
    activePointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    activeInteractionType = 'lasso_draw';
    lassoPath = [{ x: paperPt.x, y: paperPt.y }];
    renderAll();
    return;
  }

  if (currentTool === 'shape') {
    deselectObjects();
    isInteracting = true;
    activePointerId = e.pointerId;
    activeInteractionType = 'shape_draw';
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}

    currentShapeDrawing = {
      shapeType: currentShapeType,
      startPt: { x: paperPt.x, y: paperPt.y },
      endPt: { x: paperPt.x, y: paperPt.y },
      rawPt: { x: paperPt.x, y: paperPt.y },
      color: currentColor,
      baseWidth: currentWidth,
      shiftKey: !!e.shiftKey
    };
    renderAll();
    return;
  }

  // Chế độ Pen: nếu có vùng chọn đang mở thì bỏ chọn
  deselectObjects();

  isInteracting = true;
  activeInteractionType = 'pen';
  activePointerId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  lastScreenX = e.clientX;
  lastScreenY = e.clientY;

  const rawPressure = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;
  currentStroke = {
    id: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    type: 'stroke',
    points: [{ x: paperPt.x, y: paperPt.y, pressure: rawPressure }],
    color: currentColor,
    baseWidth: currentWidth,
    isFinished: false
  };
  renderAll();
});

function checkAndEraseStrokes(paperX, paperY) {
  const rPaper = ERASER_RADIUS_SCREEN / zoom;
  let hasErased = false;

  for (let i = pageObjects.length - 1; i >= 0; i--) {
    const s = pageObjects[i];
    const isHit = s.type === 'stroke'
      ? isStrokeHitByEraser(s, paperX, paperY, rPaper)
      : (s.type === 'arc'
          ? isArcHitByEraser(s, paperX, paperY, rPaper)
          : (s.type === 'formula'
              ? isFormulaHitByEraser(s, paperX, paperY, rPaper)
              : isShapeHitByEraser(s, paperX, paperY, rPaper)));
    if (isHit) {
      erasedInCurrentDrag.push({ stroke: s, originalIndex: i });
      selectedObjectIds.delete(s.id);
      pageObjects.splice(i, 1);
      hasErased = true;
    }
  }

  if (hasErased) {
    selectionBounds = computeSelectionBounds();
    updateSelectionActionsUI();
    renderAll();
  }
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'pen' && e.pointerType !== 'eraser' && e.pointerType !== 'mouse') return;
  if (!isInteracting || e.pointerId !== activePointerId) return;

  if (e.buttons === 0) {
    handlePointerEnd(e);
    return;
  }

  e.preventDefault();

  if (activeInteractionType === 'ruler_rotate') {
    const pt = getPaperPoint(e);
    updateRulerAngleFromPointer(pt);
    renderAll();
  } else if (activeInteractionType === 'ruler_move') {
    const pt = getPaperPoint(e);
    ruler.cx = pt.x - rulerDragOffset.dx;
    ruler.cy = pt.y - rulerDragOffset.dy;
    renderAll();
  } else if (activeInteractionType === 'ruler_draw' && currentRulerLine) {
    const pt = getPaperPoint(e);
    const localPt = paperToRulerLocal(pt.x, pt.y);
    currentRulerLine.endLocalX = localPt.x;
    renderAll();
  } else if (activeInteractionType === 'compass_initial_open') {
    const pt = getPaperPoint(e);
    const dist = Math.hypot(pt.x - compass.cx, pt.y - compass.cy);
    compass.r = Math.max(10, dist);
    compass.angle = Math.atan2(pt.y - compass.cy, pt.x - compass.cx);
    renderAll();
  } else if (activeInteractionType === 'compass_move_center') {
    const pt = getPaperPoint(e);
    const snap = findSnapVertex(pt, 15);
    compass.cx = snap.x;
    compass.cy = snap.y;
    compassSnapIndicator = snap.snapped ? { x: snap.x, y: snap.y } : null;
    renderAll();
  } else if (activeInteractionType === 'compass_resize_radius') {
    const pt = getPaperPoint(e);
    const dist = Math.hypot(pt.x - compass.cx, pt.y - compass.cy);
    compass.r = Math.max(10, dist);
    compass.angle = Math.atan2(pt.y - compass.cy, pt.x - compass.cx);
    renderAll();
  } else if (activeInteractionType === 'compass_draw_arc') {
    const pt = getPaperPoint(e);
    updateArcDrawingFromPointer(pt);
    renderAll();
  } else if (activeInteractionType === 'compass_move_all') {
    const pt = getPaperPoint(e);
    compass.cx = pt.x - compassDragOffset.dx;
    compass.cy = pt.y - compassDragOffset.dy;
    renderAll();
  } else if (activeInteractionType === 'eraser') {
    updateEraserCursorPosition(e.clientX, e.clientY);
    const events = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0)
      ? e.getCoalescedEvents()
      : [e];
    for (const ev of events) {
      const pt = getPaperPoint(ev);
      checkAndEraseStrokes(pt.x, pt.y);
    }
  } else if (activeInteractionType === 'shape_draw' && currentShapeDrawing) {
    const rawPt = getPaperPoint(e);
    currentShapeDrawing.shiftKey = !!e.shiftKey;
    currentShapeDrawing.rawPt = rawPt;
    currentShapeDrawing.endPt = getConstrainedEndPoint(
      currentShapeDrawing.shapeType,
      currentShapeDrawing.startPt,
      rawPt,
      e.shiftKey
    );
    renderAll();
  } else if (activeInteractionType === 'lasso_draw') {
    const pt = getPaperPoint(e);
    if (!lassoPath) lassoPath = [];
    lassoPath.push(pt);
    renderAll();
  } else if (activeInteractionType === 'lasso_manipulate') {
    const paperPt = getPaperPoint(e);
    if (manipulationType === 'move' && dragStartPaperPt && manipulationSnapshots) {
      const dx = paperPt.x - dragStartPaperPt.x;
      const dy = paperPt.y - dragStartPaperPt.y;
      for (const snap of manipulationSnapshots) {
        const obj = pageObjects.find(o => o.id === snap.id);
        if (obj) {
          if (obj.type === 'stroke') {
            obj.points = snap.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure }));
            obj.aabb = computeStrokeAABB(obj);
          } else if (obj.type === 'shape') {
            obj.startPt = { x: snap.startPt.x + dx, y: snap.startPt.y + dy };
            obj.endPt = { x: snap.endPt.x + dx, y: snap.endPt.y + dy };
            obj.aabb = computeShapeAABB(obj);
          } else if (obj.type === 'arc') {
            obj.cx = snap.cx + dx;
            obj.cy = snap.cy + dy;
            obj.aabb = computeArcAABB(obj);
          } else if (obj.type === 'formula') {
            obj.x = snap.x + dx;
            obj.y = snap.y + dy;
            obj.aabb = computeFormulaAABB(obj);
          }
        }
      }
      if (manipulationInitialBounds) {
        selectionBounds = {
          minX: manipulationInitialBounds.minX + dx,
          maxX: manipulationInitialBounds.maxX + dx,
          minY: manipulationInitialBounds.minY + dy,
          maxY: manipulationInitialBounds.maxY + dy
        };
      }
      renderAll();
    } else if (manipulationType === 'scale' && manipulationOrigin && manipulationSnapshots && initialDiagonalUnit) {
      const ox = manipulationOrigin.x, oy = manipulationOrigin.y;
      const { ux, uy } = initialDiagonalUnit;
      const proj = (paperPt.x - ox) * ux + (paperPt.y - oy) * uy;
      const scale = Math.max(0.05, proj / Math.max(1, initialHandleDist));

      for (const snap of manipulationSnapshots) {
        const obj = pageObjects.find(o => o.id === snap.id);
        if (obj) {
          if (obj.type === 'stroke') {
            obj.points = snap.points.map(p => ({
              x: ox + (p.x - ox) * scale,
              y: oy + (p.y - oy) * scale,
              pressure: p.pressure
            }));
            obj.baseWidth = Math.max(1, (snap.baseWidth || 5) * scale);
            obj.aabb = computeStrokeAABB(obj);
          } else if (obj.type === 'shape') {
            obj.startPt = {
              x: ox + (snap.startPt.x - ox) * scale,
              y: oy + (snap.startPt.y - oy) * scale
            };
            obj.endPt = {
              x: ox + (snap.endPt.x - ox) * scale,
              y: oy + (snap.endPt.y - oy) * scale
            };
            obj.baseWidth = Math.max(1, (snap.baseWidth || 5) * scale);
            obj.aabb = computeShapeAABB(obj);
          } else if (obj.type === 'arc') {
            obj.cx = ox + (snap.cx - ox) * scale;
            obj.cy = oy + (snap.cy - oy) * scale;
            obj.r = Math.max(1, snap.r * scale);
            obj.baseWidth = Math.max(1, (snap.baseWidth || 5) * scale);
            obj.aabb = computeArcAABB(obj);
          } else if (obj.type === 'formula') {
            obj.x = ox + (snap.x - ox) * scale;
            obj.y = oy + (snap.y - oy) * scale;
            obj.width = Math.max(10, (snap.width || 50) * scale);
            obj.height = Math.max(10, (snap.height || 20) * scale);
            obj.scale = (snap.scale || 1) * scale;
            obj.aabb = computeFormulaAABB(obj);
          }
        }
      }
      selectionBounds = computeSelectionBounds();
      renderAll();
    }
  } else if (currentStroke) {
    const events = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0)
      ? e.getCoalescedEvents()
      : [e];

    let hasNewPoints = false;
    for (const ev of events) {
      if (ev.pointerType !== 'pen' && ev.pointerType !== 'eraser' && ev.pointerType !== 'mouse') continue;

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
  if (e.pointerType !== 'pen' && e.pointerType !== 'eraser' && e.pointerType !== 'mouse') return;
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
            const idx = pageObjects.indexOf(erasedList[i].stroke);
            if (idx !== -1) pageObjects.splice(idx, 1);
          }
        },
        undo: () => {
          const sorted = [...erasedList].sort((a, b) => a.originalIndex - b.originalIndex);
          for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            if (item.originalIndex <= pageObjects.length) {
              pageObjects.splice(item.originalIndex, 0, item.stroke);
            } else {
              pageObjects.push(item.stroke);
            }
          }
        }
      });
    }
    erasedInCurrentDrag = [];
  } else if (activeInteractionType === 'lasso_draw') {
    if (lassoPath && lassoPath.length > 2) {
      const selected = [];
      for (const obj of pageObjects) {
        if (isObjectSelectedByLasso(obj, lassoPath)) {
          selected.push(obj);
        }
      }
      if (selected.length > 0) {
        selectedObjectIds = new Set(selected.map(o => o.id));
        selectionBounds = computeSelectionBounds();
      } else {
        selectedObjectIds.clear();
        selectionBounds = null;
      }
    } else if (lassoPath && lassoPath.length > 0) {
      const pt = lassoPath[0];
      let tapped = null;
      for (let i = pageObjects.length - 1; i >= 0; i--) {
        const o = pageObjects[i];
        const b = getObjectBounds(o);
        const pad = 12;
        if (pt.x >= b.minX - pad && pt.x <= b.maxX + pad && pt.y >= b.minY - pad && pt.y <= b.maxY + pad) {
          tapped = o;
          break;
        }
      }
      if (tapped) {
        selectedObjectIds = new Set([tapped.id]);
        selectionBounds = computeSelectionBounds();
      } else {
        selectedObjectIds.clear();
        selectionBounds = null;
      }
    } else {
      selectedObjectIds.clear();
      selectionBounds = null;
    }
    lassoPath = null;
    updateSelectionActionsUI();
    renderAll();
  } else if (activeInteractionType === 'lasso_manipulate') {
    const beforeSnapshots = manipulationSnapshots;
    const afterSnapshots = pageObjects.filter(o => selectedObjectIds.has(o.id)).map(o => cloneObject(o));

    if (beforeSnapshots && beforeSnapshots.length > 0) {
      let hasChanged = false;
      for (let i = 0; i < beforeSnapshots.length; i++) {
        const b = beforeSnapshots[i];
        const a = afterSnapshots.find(o => o.id === b.id);
        if (a && b) {
          if (a.type === 'formula' && b.type === 'formula') {
            if (Math.abs((a.x || 0) - (b.x || 0)) > 0.1 ||
                Math.abs((a.y || 0) - (b.y || 0)) > 0.1 ||
                Math.abs((a.width || 0) - (b.width || 0)) > 0.1 ||
                Math.abs((a.height || 0) - (b.height || 0)) > 0.1 ||
                Math.abs((a.scale || 1) - (b.scale || 1)) > 0.01) {
              hasChanged = true;
              break;
            }
          }
          if (Math.abs((a.baseWidth || 5) - (b.baseWidth || 5)) > 0.01 ||
              Math.abs((a.aabb?.minX || 0) - (b.aabb?.minX || 0)) > 0.1 ||
              Math.abs((a.aabb?.minY || 0) - (b.aabb?.minY || 0)) > 0.1 ||
              Math.abs((a.aabb?.maxX || 0) - (b.aabb?.maxX || 0)) > 0.1 ||
              Math.abs((a.aabb?.maxY || 0) - (b.aabb?.maxY || 0)) > 0.1) {
            hasChanged = true;
            break;
          }
        }
      }

      if (hasChanged) {
        executeAction({
          type: 'manipulate_objects',
          do: () => {
            applyObjectSnapshots(afterSnapshots);
            selectionBounds = computeSelectionBounds();
            updateSelectionActionsUI();
            renderAll();
          },
          undo: () => {
            applyObjectSnapshots(beforeSnapshots);
            selectionBounds = computeSelectionBounds();
            updateSelectionActionsUI();
            renderAll();
          }
        });
      }
    }

    isManipulatingSelection = false;
    manipulationType = null;
    activeHandle = null;
    manipulationOrigin = null;
    manipulationSnapshots = null;
    manipulationInitialBounds = null;
    updateSelectionActionsUI();
    renderAll();
  } else if (activeInteractionType === 'ruler_draw') {
    if (currentRulerLine) {
      const p1 = rulerLocalToPaper(currentRulerLine.startLocalX, currentRulerLine.edgeY);
      const p2 = rulerLocalToPaper(currentRulerLine.endLocalX, currentRulerLine.edgeY);
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist >= 3) {
        const newShape = createShapeObject({
          shapeType: currentRulerLine.shapeType,
          startPt: p1,
          endPt: p2,
          color: currentRulerLine.color,
          baseWidth: currentRulerLine.baseWidth
        });

        executeAction({
          type: 'add_shape',
          shape: newShape,
          do: () => {
            pageObjects.push(newShape);
          },
          undo: () => {
            const idx = pageObjects.indexOf(newShape);
            if (idx !== -1) {
              pageObjects.splice(idx, 1);
            }
          }
        });
      }
      currentRulerLine = null;
    }
    renderAll();
  } else if (activeInteractionType === 'ruler_move' || activeInteractionType === 'ruler_rotate') {
    ruler.isMoving = false;
    ruler.isRotating = false;
    renderAll();
  } else if (activeInteractionType === 'compass_initial_open') {
    if (compass.r < 15) {
      compass.r = 3.5 * RULER_CM_UNIT;
    }
    compass.placed = true;
    compassSnapIndicator = null;
    renderAll();
  } else if (activeInteractionType === 'compass_move_center') {
    compass.isMovingCenter = false;
    compassSnapIndicator = null;
    renderAll();
  } else if (activeInteractionType === 'compass_resize_radius') {
    compass.isResizingRadius = false;
    renderAll();
  } else if (activeInteractionType === 'compass_move_all') {
    renderAll();
  } else if (activeInteractionType === 'compass_draw_arc') {
    compass.isDrawingArc = false;
    if (currentArcDrawing && Math.abs(currentArcDrawing.accumulatedDelta) > 0.03) {
      const newArc = createArcObject({
        cx: currentArcDrawing.cx,
        cy: currentArcDrawing.cy,
        r: currentArcDrawing.r,
        startAngle: currentArcDrawing.startAngle,
        endAngle: currentArcDrawing.endAngle,
        isFullCircle: currentArcDrawing.isFullCircle,
        anticlockwise: currentArcDrawing.anticlockwise,
        color: currentArcDrawing.color,
        baseWidth: currentArcDrawing.baseWidth
      });

      executeAction({
        type: 'add_arc',
        arc: newArc,
        do: () => {
          pageObjects.push(newArc);
        },
        undo: () => {
          const idx = pageObjects.indexOf(newArc);
          if (idx !== -1) {
            pageObjects.splice(idx, 1);
          }
        }
      });
    }
    currentArcDrawing = null;
    renderAll();
  } else if (activeInteractionType === 'shape_draw') {
    if (currentShapeDrawing) {
      const { startPt, endPt } = currentShapeDrawing;
      const dist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
      if (dist >= 3) {
        const newShape = createShapeObject({
          shapeType: currentShapeDrawing.shapeType,
          startPt: { ...startPt },
          endPt: { ...endPt },
          color: currentShapeDrawing.color,
          baseWidth: currentShapeDrawing.baseWidth
        });

        executeAction({
          type: 'add_shape',
          shape: newShape,
          do: () => {
            pageObjects.push(newShape);
          },
          undo: () => {
            const idx = pageObjects.indexOf(newShape);
            if (idx !== -1) {
              pageObjects.splice(idx, 1);
            }
          }
        });
      }
      currentShapeDrawing = null;
    }
  } else if (currentStroke) {
    currentStroke.isFinished = true;
    currentStroke.aabb = computeStrokeAABB(currentStroke);
    const finishedStroke = currentStroke;

    executeAction({
      type: 'add_stroke',
      stroke: finishedStroke,
      do: () => {
        pageObjects.push(finishedStroke);
      },
      undo: () => {
        const idx = pageObjects.indexOf(finishedStroke);
        if (idx !== -1) {
          pageObjects.splice(idx, 1);
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
async function initApp() {
  centerPage(1.0);
  resizeCanvas();
  updateUndoRedoUI();
  setTool('pen');
  updateSizeAndColorPreview();
  await loadInitialData();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Expose state for testing & debugging
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'pageObjects', { get: () => pageObjects, set: (v) => { pageObjects = v; strokes = v; } });
  Object.defineProperty(window, 'pages', { get: () => pages, set: (v) => { pages = v; } });
  Object.defineProperty(window, 'currentPageIndex', { get: () => currentPageIndex, set: (v) => { currentPageIndex = v; } });
  Object.defineProperty(window, 'selectedObjectIds', { get: () => selectedObjectIds, set: (v) => { selectedObjectIds = v; } });
  Object.defineProperty(window, 'undoStack', { get: () => undoStack });
  Object.defineProperty(window, 'redoStack', { get: () => redoStack });
  Object.defineProperty(window, 'currentTool', { get: () => currentTool, set: (v) => { currentTool = v; } });
  window.undo = undo;
  window.redo = redo;
  window.copySelectedObjects = copySelectedObjects;
  window.pasteObjects = pasteObjects;
  window.transformObject = transformObject;
  window.isObjectSelectedByLasso = isObjectSelectedByLasso;
  window.isFormulaHitByEraser = isFormulaHitByEraser;
  window.getObjectBounds = getObjectBounds;
  window.drawThumbnailCanvas = drawThumbnailCanvas;
}
