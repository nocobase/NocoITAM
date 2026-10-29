<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agent chủ động lo liệu. Tài sản CNTT ngăn nắp.</strong></p>

<p align="center">Quản lý tài sản CNTT mã nguồn mở · Xây dựng trên NocoBase</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>Dùng thử trực tuyến</strong></a> · <a href="https://www.nocobase.com/vi-VN/solution-itam/">Trang web</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <strong>Tiếng Việt</strong>
</p>

NocoITAM là hệ thống quản lý tài sản CNTT mã nguồn mở, xây dựng trên [NocoBase](https://www.nocobase.com). Công cụ ITAM truyền thống là những cuốn sổ ghi chép bằng tay. Trong NocoITAM, agent xử lý chênh lệch MDM, chuẩn bị đủ thiết bị cho nhân viên mới, kiểm tra tồn kho và tài sản nhàn rỗi trước mỗi lần mua. Mọi thiết bị, mọi suất bản quyền, mọi khoản chi đều có hồ sơ.

https://github.com/user-attachments/assets/82edd79c-d3af-4d8f-a341-5b31a618b344

## Tính năng

- **Mỗi lần mua đều xem tồn kho trước.** Khi một đơn mua được gửi phê duyệt, trợ lý phê duyệt kiểm tra xem tồn kho hay thiết bị nhàn rỗi có đáp ứng được không, so sánh giá trước đây và các yêu cầu tương tự, rồi soạn sẵn đề xuất và ý kiến cho người phê duyệt.
- **Người mới sẵn sàng từ ngày đầu.** Mỗi phòng ban và mỗi chức danh đều có bộ thiết bị nhận việc. Kế hoạch cho người mới lấy từ tồn kho, suất bản quyền nhàn rỗi, đơn mua đang về và đồ người nghỉ trả lại; AI chọn thiết bị kèm lý do, phần còn thiếu tạo đơn mua chỉ bằng một cú nhấp.
- **Người nghỉ trả lại mọi thứ.** Thiết bị, phụ kiện và suất bản quyền của người nghỉ được theo dõi đến khi thu hồi đủ, các hồ sơ họ phụ trách được bàn giao, và tài khoản đăng nhập bị vô hiệu hóa vào ngày làm việc cuối.
- **Chênh lệch MDM thành kế hoạch xử lý.** Microsoft Intune và Jamf Pro được đồng bộ mỗi đêm và đối chiếu theo số sê-ri. Tác tử phân loại những chỗ không khớp: người dùng khác đi được chuyển cho người phụ trách thiết bị, thiết bị chưa đăng ký cho người quản lý tài sản, còn trường hợp chưa rõ để con người quyết định.
- **Nhập liệu thông minh.** Dán hoặc kéo thả báo giá, hóa đơn hay phiếu giao hàng: AI điền đơn mua và khớp từng dòng với mẫu thiết bị của bạn, đối chiếu hàng nhận với đơn (số lượng, số sê-ri, bảo hành), và đọc biên bản sửa chữa, chứng nhận thanh lý. Thông số của mẫu mới được bổ sung từ web.
- **3 tác tử, và AI ngay nơi làm việc.** Quản gia Tài sản trả lời trên mọi trang dựa trên các hồ sơ bạn được xem và đề xuất kế hoạch để bạn xác nhận trên một thẻ. Trợ lý phê duyệt và theo dõi chênh lệch MDM làm việc ở chế độ nền, còn AI hỗ trợ ở 11 chỗ, từ nhận hàng đến so báo giá sửa chữa với việc thay thiết bị. Tác tử đề xuất, con người quyết định.
- **Bản quyền và thuê bao trong tầm kiểm soát.** Theo người dùng, theo thiết bị, toàn site hoặc miễn phí, với số suất, khóa và ngày gia hạn. Mức tuân thủ được tính lại mỗi khi suất thay đổi, và suất cấp vượt hay nhàn rỗi được báo trước khi gia hạn.
- **Không bỏ sót việc gì.** Trang việc cần làm mở đầu bằng 14 mục kiểm tra rủi ro (bảo hành và thuê bao sắp hết hạn, suất nhàn rỗi, tồn kho dưới mức tối thiểu, thiết bị một năm chưa kiểm kê), rồi đến công việc của nhóm theo cột: phê duyệt, nhân viên vào và nghỉ, đơn mua, sửa chữa, thanh lý và kiểm kê.
- **Một sổ đăng ký cho mọi thứ CNTT sở hữu.** Thiết bị, phụ kiện, vật tư tiêu hao, linh kiện và quyền sử dụng phần mềm, từ mua sắm, nhận hàng, cấp phát, cho mượn đến sửa chữa, kiểm kê và thanh lý, mỗi hồ sơ đều có lịch sử. 10 báo cáo, nhập và xuất CSV, tìm kiếm trên mọi hồ sơ (⌘K / Ctrl+K).
- **Tùy biến được.** Viết bộ thiết bị chuẩn, ngân sách và quy tắc phê duyệt bằng lời thường vào hướng dẫn nghiệp vụ, mọi tác tử sẽ làm theo; cách làm việc của mỗi tác tử là một kỹ năng bạn có thể sửa. Mã nguồn mở, phần còn lại agent lập trình có thể thay đổi.
- **Tự lưu trữ.** Dữ liệu nằm trên máy chủ của bạn, với mô hình bạn chọn: DeepSeek, OpenAI, Claude, Gemini, Qwen và nhiều hơn nữa. Giao diện 12 ngôn ngữ. Apache-2.0.

## Bắt đầu nhanh

Chỉ muốn xem thử? [Dùng thử trực tuyến](https://solutions.nocobase.com/itam/): bạn được đăng nhập sẵn bằng tài khoản mẫu, mọi dữ liệu đều là hư cấu.

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

Triển khai thực tế, xem [Triển khai](guide.md#deployment); dùng PostgreSQL và MySQL, xem [Cấu hình](guide.md#configuration).

## Giấy phép

NocoITAM được xây dựng trên NocoBase và phát hành theo giấy phép [Apache-2.0](../LICENSE).
