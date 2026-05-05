# codexp

**[English](README.en.md)**

Quản lý nhiều tài khoản **OpenAI Codex CLI** (`auth.json`) — đăng nhập, chuyển đổi, theo dõi usage.

- **Không phụ thuộc** — chỉ dùng Node 18+ stdlib.
- Profile tự đặt tên theo email tài khoản.
- Theo dõi usage (giới hạn 5h / tuần) với cache thông minh — không spam API.

> [!WARNING]
> Codex CLI load `auth.json` một lần khi khởi động. **Thoát Codex trước khi chuyển profile**,
> nếu không session cũ vẫn dùng token cũ. `codexp` sẽ cảnh báo nếu phát hiện process
> `codex` đang chạy.

## Cài đặt

```bash
npm install -g codexp-cli
```

Hoặc từ source:

```bash
git clone https://github.com/MaiHongPhong1902/codexp.git
cd codexp
npm link
```

## Lệnh

```text
codexp                          # mở shell tương tác (hiện profile + usage)
codexp login                    # đăng nhập tài khoản mới (tự đặt tên theo email)
codexp use     <tên>            # chuyển sang profile khác
codexp refresh <tên>            # đăng nhập lại để làm mới token
codexp remove  <tên>            # xóa profile
codexp list                     # hiện tất cả profile (đọc cache usage)
codexp status  [tên]            # lấy usage realtime từ API
```

Tùy chọn:

- `--home <đường dẫn>` — thay đổi thư mục Codex home (mặc định: `$CODEX_HOME` hoặc `~/.codex`)
- `--force` — bỏ qua cảnh báo process đang chạy
- `CP_PROFILES_DIR` — đổi nơi lưu profile (mặc định: thư mục dữ liệu người dùng `codexp/profiles`)

### Cấu hình đường dẫn profiles

Khi cài global qua `npm install -g`, cần set biến môi trường `CP_PROFILES_DIR` để trỏ đến thư mục profiles:

**Windows (PowerShell — set vĩnh viễn cho user):**

```powershell
[System.Environment]::SetEnvironmentVariable('CP_PROFILES_DIR', 'C:\path\to\profiles', 'User')
```

**Linux/macOS:**

```bash
echo 'export CP_PROFILES_DIR="$HOME/.codexp/profiles"' >> ~/.bashrc
```

Khởi động lại terminal sau khi set.

## Thông tin hiển thị

```
  ● user_gmail_com  USABLE  [LIVE]
      account : user@gmail.com (plus)
      id      : f481ede4-fef4-44cd-af14-498e859ffe17
      access  : in 9d 18h (2026-05-13 11:46Z)
      refresh : -
      last refresh: 2026-05-03 11:46Z
      5h limit: ████████████████████ 100% left (resets in 4h 52m)
      weekly  : ███████████████████░ 97% left (resets in 6d 18h)
```

- **account** — email (decode từ JWT `id_token`)
- **plan** — plus, pro, team, v.v.
- **access / refresh** — đếm ngược thời gian hết hạn token
- **5h limit / weekly** — % usage còn lại (từ cache)
- **USABLE** / **EXPIRED** — token còn dùng được không
- **● [LIVE]** — đang khớp với `auth.json` hiện tại

### Cache usage

| Hành động | Gọi API? | Lưu cache? |
|---|---|---|
| `login` | Có | Có |
| `use` (chuyển) | Có | Có |
| `status` | Có | Có |
| `list` | Không | Đọc cache |

Khi `reset_at` đã qua, `list` tự động hiện 100% mà không cần gọi API.

## Bắt đầu nhanh

```bash
# 1. Đăng nhập tài khoản đầu tiên
codexp login               # trình duyệt mở, đăng nhập → lưu thành user_gmail_com.json

# 2. Đăng nhập thêm tài khoản khác
codexp login               # tài khoản khác → tên profile khác

# 3. Mở shell xem tất cả
codexp                     # profile + usage + prompt tương tác

# 4. Chuyển tài khoản (thoát codex trước!)
codexp use other_email_com
codex                      # khởi động Codex với tài khoản mới
```

## Cấu trúc dự án

```
codexp/
├── bin/codex-profile.js     # điểm vào CLI
├── src/
│   ├── auth.js              # giải mã JWT, tính thời gian hết hạn
│   ├── colors.js            # hỗ trợ màu ANSI
│   ├── commands.js          # tất cả lệnh
│   └── paths.js             # xử lý đường dẫn (CODEX_HOME, thư mục profiles)
├── codex-profile.cmd        # wrapper cho Windows
├── package.json
├── LICENSE
├── README.md                # tiếng Việt (file này)
└── README.en.md             # English
```

## Bảo mật

Các file profile JSON chứa **OAuth refresh tokens** — coi chúng như mật khẩu.
Không commit, không chia sẻ. `.gitignore` đã loại trừ tất cả dữ liệu profile.

## Giấy phép

[MIT](LICENSE)
