# SPEC: Web app ghi chú viết tay (tạm đặt tên: InkNote)

## 1. Mục tiêu
App ghi chú viết tay bằng bút cảm ứng, chạy trên trình duyệt, cài được như app (PWA).
Dùng để (a) ghi chú/giải bài, (b) trình chiếu bài giảng cho học sinh xem.
Tham khảo chức năng từ app Scrble Ink, nhưng KHÔNG copy tên, logo, giao diện, hình ảnh.

## 2. Ràng buộc
- Người làm không biết code, làm một mình, ngân sách 0 đồng.
- Chỉ dùng công nghệ miễn phí, đơn giản nhất có thể.
- Dùng chính với bút cảm ứng + tay tì lên màn hình (phải chống nét rác).
- Làm từng đợt nhỏ, xong đợt nào test kỹ rồi mới qua đợt tiếp.

## 3. Đợt 1 — LÕI (làm trước)
- Trang giấy: trắng, kẻ ngang, ô vuông (nhiều cỡ), khổ dọc/ngang, đổi màu nền
- Bút: 5 loại (bút máy, bút bi, marker, bút chì, dạ quang), bảng màu, thanh trượt độ dày
- Tẩy
- Undo / Redo
- Nhiều trang trong một ghi chú (có cột thumbnail bên trái, bật/tắt được)
- Tự lưu sau 10 giây không thao tác
- Danh sách ghi chú
- Zoom/di chuyển trang, chạm đúp để phóng to/thu nhỏ
- Chế độ chỉ nhận bút (chống tì tay)

## 4. Đợt 2 — ORGANIZE + VẼ HÌNH
- Thư mục, tìm kiếm, đổi tên, xóa, chọn nhiều ghi chú
- 9 bút lưu sẵn (màu + cỡ) để đổi nhanh
- Hình học: đường thẳng (liền/đứt/chấm gạch), mũi tên, hình tròn, elip, chữ nhật, tam giác, đa giác, sao (viền + tô đặc)
- Thước kẻ ảo
- Lasso: khoanh vùng rồi di chuyển, phóng to, sao chép
- Chèn ảnhx
- Gõ chữ bằng bàn phím (ô văn bản)

## 5. Đợt 3 — NHẬP/XUẤT + NÂNG CAO
- Import PDF để viết lên
- Export PDF / ảnh
- Chụp ảnh từ camera rồi chèn
- Writing Pane (khung phóng đại để viết chữ nhỏ), vùng kê tay (Palm Guard)
- Toàn màn hình
- Settings (khổ giấy, tự lưu, quay về bút sau khi dùng tẩy/hình...)

## 6. TÍNH NĂNG RIÊNG (khác Scrble Ink)

### 6.1 Chèn biểu thức LaTeX  (làm sau Đợt 2)
- Khi bấm nút "LaTeX", hiện ô nhập công thức, thấy xem trước, bấm OK thì công thức hiện lên trang như một đối tượng.
- Di chuyển, phóng to, xóa được như các đối tượng khác (dùng được với lasso).
- Gợi ý công nghệ: KaTeX (miễn phí, chạy trong trình duyệt).

### 6.2 Máy tính Casio fx-580 (làm sau Đợt 3)
- Hiện một cửa sổ máy tính nổi trên trang, giao diện gần giống Casio 580 (bố cục phím tương tự, KHÔNG dùng logo/tên hãng).
- Bấm phím được bằng chuột/cảm ứng để thầy cô demo cách bấm cho học sinh xem.
- Chụp màn hình máy tính -> chèn vào trang ghi chú như một ảnh.
- Bản đầu chỉ cần các phép tính cơ bản (cộng trừ nhân chia, phân số, căn, mũ, sin/cos/tan, shift/alpha); các chức năng nâng cao (giải phương trình, ma trận, bảng...) thêm sau từng cái một.
- Dùng được trong chế độ trình chiếu (phóng to màn hình máy tính).

### 6.3 Vẽ hình bằng LaTeX TikZ (làm cuối, khó nhất)
- Ô nhập mã TikZ -> bấm Render -> ra hình -> chèn vào trang như một đối tượng.
- Lưu ý kỹ thuật: TikZ cần "bộ máy LaTeX" để dịch ra hình. Cách miễn phí chạy được trên trình duyệt là dùng thư viện TikZJax (chạy bằng WebAssembly), nhưng chỉ hỗ trợ một phần gói lệnh. Cần thử xem có đủ cho nhu cầu không trước khi cam kết.
- Phương án dự phòng: cho phép dán ảnh/SVG hình đã render ở nơi khác.

### 6.4 Vẽ hình tròn bằng compa (làm cùng nhóm hình học, Đợt 2)
- Công cụ compa ảo: chọn tâm, kéo ra bán kính, vẽ cung/đường tròn bằng nét bút.
- Nên có chế độ hiện số đo bán kính, và có thể vẽ cung (không chỉ hình tròn đầy đủ).

## 7. Cách làm việc với AI code
- Mỗi lần chỉ làm 1 tính năng nhỏ, chạy thử xong mới làm tiếp.
- Luôn đưa file này cho AI đọc trước.
- Mỗi lần xong 1 tính năng: lưu code lên GitHub (để có thể quay lại bản cũ nếu AI làm hỏng).
- Test bằng đúng thiết bị + bút sẽ dùng thật.

## 8. Câu hỏi còn mở (m điền sau)
- Tên app chính thức?
Ink Note
- Chạy trên thiết bị nào là chính (Windows, iPad, tablet Android)?
Windows trước, sau này phát triển thêm Android
- Có cần đồng bộ giữa nhiều thiết bị không (nếu có, cần tài khoản + cơ sở dữ liệu)?
Có thể (nhưng lưu cục bộ)
- Dùng cá nhân hay đưa cho học sinh/người khác dùng?
Cá nhân

## Quy tắc cho AI
- Mỗi lần chỉ làm đúng việc mình yêu cầu, không tự thêm tính năng.
- Trước khi code phải liệt kê kế hoạch và chờ mình đồng ý.
- Không cài thư viện nặng hay trả phí; ưu tiên cái miễn phí, phổ biến.
- Giải thích ngắn gọn, ít thuật ngữ, vì mình không biết code.
- Khi xong phải hướng dẫn mình cách chạy thử.