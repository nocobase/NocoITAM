# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | Tiếng Việt

NocoITAM là hệ thống quản lý tài sản CNTT mã nguồn mở, xây dựng trên [NocoBase 3](https://www.nocobase.com). Công cụ ITAM truyền thống là những cuốn sổ ghi chép bằng tay. Trong NocoITAM, agent xử lý chênh lệch MDM, chuẩn bị đủ thiết bị cho nhân viên mới, kiểm tra tồn kho và tài sản nhàn rỗi trước mỗi lần mua. Mọi thiết bị, mọi suất bản quyền, mọi khoản chi đều có hồ sơ.

https://github.com/user-attachments/assets/82edd79c-d3af-4d8f-a341-5b31a618b344

[Dùng thử trực tuyến](https://solutions.nocobase.com/itam/) · [Trang web](https://www.nocobase.com/vi-VN/solution-itam/)

## Làm được gì

- **Mỗi lần mua đều xem tồn kho trước.** Khi một đơn mua được gửi phê duyệt, trợ lý phê duyệt kiểm tra xem tồn kho hay thiết bị nhàn rỗi có đáp ứng được không, so sánh giá trước đây và các yêu cầu tương tự, rồi soạn sẵn đề xuất và ý kiến cho người phê duyệt.
- **Người mới sẵn sàng từ ngày đầu, người nghỉ trả lại mọi thứ.** Bộ thiết bị nhận việc của người mới được đối chiếu một lần với tồn kho và các suất bản quyền nhàn rỗi, phần còn thiếu tạo đơn mua chỉ bằng một cú nhấp. Thiết bị, phụ kiện và suất bản quyền của người nghỉ được theo dõi đến khi thu hồi đủ, và các hồ sơ họ phụ trách được bàn giao.
- **Chênh lệch MDM thành kế hoạch xử lý.** Sau mỗi lần đồng bộ với Intune hoặc Jamf Pro, tác tử phân loại những chỗ không khớp: người dùng khác đi được chuyển cho người phụ trách thiết bị, thiết bị chưa đăng ký cho người quản lý tài sản, còn trường hợp chưa rõ để con người quyết định.
- **Một sổ đăng ký cho mọi thứ CNTT sở hữu.** Thiết bị, phụ kiện, vật tư tiêu hao, linh kiện và quyền sử dụng phần mềm, từ mua sắm, nhận hàng, cấp phát, cho mượn đến sửa chữa, kiểm kê và thanh lý, mỗi hồ sơ đều có lịch sử.
- **Trợ lý trên mọi trang.** Quản gia Tài sản trả lời dựa trên các hồ sơ bạn được xem và đề xuất kế hoạch để bạn xác nhận. Khi công việc đi kèm báo giá, hóa đơn hay phiếu giao hàng, AI đọc chứng từ và điền sẵn biểu mẫu để bạn kiểm tra. Tác tử đề xuất, con người quyết định.
- **Quy tắc của bạn, mã nguồn của bạn.** Viết bộ thiết bị chuẩn, ngân sách và quy tắc phê duyệt vào hướng dẫn nghiệp vụ, mọi tác tử sẽ làm theo. Nhờ agent lập trình sửa trực tiếp mã nguồn của ITAM. Mã nguồn mở, tự lưu trữ và hoàn toàn thuộc về bạn.

## Bắt đầu nhanh

### 1. Cài đặt

**Bằng agent lập trình.** Cách dễ nhất. Mở Claude Code, Codex hoặc Cursor trong thư mục sẽ chứa NocoITAM và đưa cho nó yêu cầu này:

```text
Cài đặt NocoITAM từ https://github.com/nocobase/NocoITAM và khởi chạy, làm theo AGENTS.md và README của kho mã.
```

**Cài thủ công.** Bạn cần Node.js 24 trở lên và pnpm 10 (`corepack enable`). Dữ liệu mặc định được lưu trong một tệp SQLite; PostgreSQL và MySQL cũng dùng được.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. Đăng nhập

Mở địa chỉ `Local:` mà `pnpm dev` in ra, thường là `http://127.0.0.1:13000/main/`, rồi đăng nhập bằng `nocobase` với mật khẩu `admin123`.

### 3. Nhập dữ liệu mẫu

Biểu ngữ ở đầu trang sẽ gợi ý, hoặc mở **Cài đặt → Dữ liệu demo**. Dữ liệu này mang đến một công ty khoảng bốn mươi người cùng thiết bị, tồn kho và bản quyền, đơn mua, sửa chữa, kiểm kê và thanh lý, cùng các nền tảng Intune và Jamf mẫu; xóa nó ở cùng trang khi bạn bắt đầu dùng thật.

### 4. Thiết lập mô hình AI

Thêm một dịch vụ mô hình cùng khóa của nó tại **Đội tác tử → Mô hình**, chẳng hạn DeepSeek, OpenAI, Claude, Gemini hoặc Qwen. Quản gia Tài sản và các tác tử cần nó; mọi tính năng khác vẫn chạy mà không cần.

[Hướng dẫn](guide.md) (tiếng Anh) trình bày các bước tiếp theo, tài khoản mẫu, vai trò, tác tử, cấu hình (AI, MDM, cơ sở dữ liệu), triển khai và phát triển.

## Giấy phép

[Apache License 2.0](../LICENSE)
