import type { DeviceApprovalLocale } from './en-US.js';

const viVN: DeviceApprovalLocale = {
  formFeedback: {
    field: 'Giá trị này bị từ chối. Hãy kiểm tra và thử lại.',
    invalid: 'Hãy kiểm tra các trường được đánh dấu và thử lại.',
    failed: 'Không thể lưu. Dữ liệu bạn nhập vẫn được giữ lại. Hãy thử lại.',
    network: 'Không thể kết nối. Hãy kiểm tra kết nối và thử lại. Dữ liệu bạn nhập vẫn được giữ lại.',
    denied: 'Quyền hiện tại của bạn không cho phép gửi biểu mẫu này. Dữ liệu bạn nhập vẫn được giữ lại.',
  },
  'deviceApproval.title': 'Cấp quyền cho thiết bị',
  'deviceApproval.description':
    'Một dòng lệnh hoặc thiết bị khác yêu cầu đăng nhập dưới danh nghĩa của bạn. Chỉ phê duyệt nếu chính bạn đã bắt đầu việc đăng nhập.',
  'deviceApproval.enterCode': 'Nhập mã mà thiết bị của bạn hiển thị.',
  'deviceApproval.codeLabel': 'Mã',
  'deviceApproval.continue': 'Tiếp tục',
  'deviceApproval.checking': 'Đang kiểm tra mã…',
  'deviceApproval.confirm':
    'Hãy kiểm tra mã này khớp với mã mà thiết bị của bạn hiển thị.',
  'deviceApproval.client': 'Do {{client}} yêu cầu',
  'deviceApproval.approve': 'Phê duyệt',
  'deviceApproval.approving': 'Đang phê duyệt…',
  'deviceApproval.deny': 'Từ chối',
  'deviceApproval.denying': 'Đang từ chối…',
  'deviceApproval.approved':
    'Đã phê duyệt thiết bị. Hãy quay lại cửa sổ dòng lệnh để tiếp tục; bạn có thể đóng trang này.',
  'deviceApproval.denied':
    'Đã từ chối yêu cầu. Thiết bị chưa được đăng nhập; bạn có thể đóng trang này.',
  'deviceApproval.expired':
    'Mã này đã hết hạn. Hãy bắt đầu đăng nhập lại trên thiết bị của bạn.',
  'deviceApproval.invalid':
    'Mã này không hợp lệ. Hãy đối chiếu với thiết bị của bạn và thử lại.',
  'deviceApproval.notYours': 'Mã này đang được một tài khoản khác phê duyệt.',
  'deviceApproval.error': 'Đã xảy ra lỗi. Hãy thử lại.',
  'deviceApproval.retry': 'Thử lại',
  'deviceApproval.otherCode': 'Nhập mã khác',
};

export default viVN;
