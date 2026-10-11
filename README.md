# React + TypeScript + Vite

Ứng dụng quản lý giải đấu Teamfight Tactics với tài khoản quản lý và cổng theo dõi dành cho thí sinh.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Chạy ứng dụng

```bash
npm install
npm run dev
```

## Luồng quản lý giải đấu

- Chọn **Tạo giải đấu mới** ở đầu thanh bên để mở bảng thiết lập tên giải, số vòng, 4–8 cờ thủ và tên từng người chơi. Luật tính điểm và ngưỡng CHECKMATE được thiết lập trong **Cài đặt**.
- Nhập thứ hạng cho từng người trong thẻ **Vòng hiện tại** trên màn Tổng quan; nhấn Enter hoặc nút lưu. Mỗi hạng chỉ được dùng một lần trong một vòng.
- Có thể chọn thứ hạng từ Top 1 đến Top 8. Nút **Hoàn thành giải** chỉ xuất hiện trên Tổng quan khi đã có nhà vô địch; nhấn nút để đóng giải và đưa kết quả vào **Lưu trữ & so sánh**. Tạo giải khác sẽ thêm giải mới, không xóa giải đã có.
- Trang lưu trữ cho phép mở lại giải cũ, xem người vô địch và so sánh tổng thành tích hoặc hai giải cụ thể theo tên cờ thủ.
- Cổng thí sinh hiển thị banner vinh danh khi có nhà vô địch theo luật hiện hành; nếu giải đã hoàn thành, người đứng đầu bảng xếp hạng được vinh danh.
- Tám huy hiệu chân dung riêng nằm trong `public/player-avatars/`; ảnh đấu trường nằm ở `public/tournament-arena.png` và được dùng làm nền giao diện quản lý lẫn cổng thí sinh.

## Supabase: đăng nhập và dữ liệu trực tiếp

Ứng dụng dùng Supabase Auth để xác thực, bảng `tournament_user_roles` để phân vai, và Realtime để đẩy thay đổi bảng xếp hạng đến các trình duyệt đang mở. Không đặt `service_role` key trong ứng dụng.

1. Tạo `.env.local` từ `.env.example`, rồi điền Project URL và publishable key của Supabase. Không đưa `.env.local` lên Git.
2. Trong Supabase Dashboard → SQL Editor, chạy `supabase/setup.sql`.
3. Tắt đăng ký công khai trong Authentication → Providers/Settings.
4. Trong Authentication → Users, tạo và xác nhận hai tài khoản:
   - Quản lý: `quanly@gmail.com`
   - Thí sinh 1: `cothu@gmail.com`
   Chọn mật khẩu ở Supabase Auth. Mật khẩu ngắn/dễ đoán không nên dùng khi triển khai công khai.
5. Chạy lại phần cuối của `supabase/setup.sql` (hoặc chạy lại toàn bộ file) để gán vai trò cho các tài khoản vừa tạo.
6. Đăng nhập bằng email đầy đủ. Quản lý ghi dữ liệu; thí sinh chỉ xem.

Nếu dùng máy chủ phát triển, chạy lại `npm run dev` sau khi thay đổi biến môi trường. Trạng thái giải đấu trên trình duyệt cục bộ trước đây không tự chép lên Supabase; giải mới được khởi tạo khi quản lý đăng nhập lần đầu.

## Triển khai web

Có thể triển khai bản Vite lên Vercel sau khi đưa thư mục dự án vào một repository GitHub và liên kết repository đó với Vercel. Đặt `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` trong Project Settings → Environment Variables, sau đó build với `npm run build` (output `dist`). Cần cập nhật danh sách URL được phép trong Supabase Authentication → URL Configuration theo domain đã triển khai.
