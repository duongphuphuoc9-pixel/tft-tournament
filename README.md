# React + TypeScript + Vite

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
