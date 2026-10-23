import type { AppServerResource } from './en-US.js';

const idID: AppServerResource = {
  notifications: {
    approvalRequested: 'Persetujuan diminta: {{title}}',
    commentMentioned: '{{actor}} menyebut Anda di {{title}}',
    commentReplied: '{{actor}} membalas di {{title}}',
    approvalApproved: 'Disetujui: {{title}}',
    approvalRejected: 'Ditolak: {{title}}',
    approvalBody: 'Sebuah permintaan menunggu keputusan Anda',
    auditStarted: 'Stock opname dimulai: {{name}}',
    auditStartedBody: 'Direncanakan hingga {{date}}',
    loanOverdue: 'Peminjaman terlambat: {{deviceNo}}',
    loanOverdueBody: 'Seharusnya kembali pada {{date}}',
    leaverRecovery: 'Ambil kembali aset dari {{name}}',
    leaverRecoveryBody:
      '{{count}} aset yang dipegangnya menjadi tanggung jawab Anda',
  },
};

export default idID;
