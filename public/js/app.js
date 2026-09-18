/**
 * Star File X - UI Interactions and Controller
 */

let engine = null;
let selectedFile = null;
let currentMaxReceivers = 1;

document.addEventListener('DOMContentLoaded', () => {
  // Khởi tạo Transfer Engine
  engine = new StarTransferEngine();

  // Hiển thị Mã Xác Minh Tạm Thời của Bên Nhận (9 số)
  const tempCodeEl = document.getElementById('receiverTempCode');
  if (tempCodeEl) {
    tempCodeEl.textContent = StarTransferEngine.format9Code(engine.receiverTempCode);
  }

  // Tải danh sách IP nội bộ (LAN) phục vụ truyền giữa Android và Windows
  fetchNetworkInfo();

  // Thiết lập kéo thả file
  initDragAndDrop();

  // Tự động định dạng mã 9 số khi người nhận gõ
  initCodeInputFormatter();
});

// =========================================================================
// CHUYỂN ĐỔI TAB (GỬI / NHẬN)
// =========================================================================
function switchTab(tab) {
  const btnSend = document.getElementById('tabBtnSend');
  const btnReceive = document.getElementById('tabBtnReceive');
  const secSend = document.getElementById('senderSection');
  const secReceive = document.getElementById('receiverSection');

  if (tab === 'send') {
    btnSend.classList.add('active');
    btnReceive.classList.remove('active');
    secSend.classList.remove('hidden');
    secReceive.classList.add('hidden');
  } else {
    btnReceive.classList.add('active');
    btnSend.classList.remove('active');
    secReceive.classList.remove('hidden');
    secSend.classList.add('hidden');
  }
}

// =========================================================================
// KÉO THẢ & CHỌN TỆP
// =========================================================================
function initDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });
}

function handleFileSelected(file) {
  selectedFile = file;
  document.getElementById('dropZone').classList.add('hidden');
  
  const infoBadge = document.getElementById('selectedFileInfo');
  infoBadge.classList.remove('hidden');

  document.getElementById('selectedFileName').textContent = file.name;
  document.getElementById('selectedFileSize').textContent = formatBytes(file.size);

  document.getElementById('btnCreateSession').disabled = false;
}

function removeSelectedFile() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('dropZone').classList.remove('hidden');
  document.getElementById('selectedFileInfo').classList.add('hidden');
  document.getElementById('btnCreateSession').disabled = true;
}

// Cấu hình số người nhận tối đa (1 đến 5)
function setMaxReceivers(count) {
  currentMaxReceivers = count;
  document.getElementById('maxReceiversLabel').textContent = `${count} người`;

  const buttons = document.querySelectorAll('.receiver-opt-btn');
  buttons.forEach((btn, index) => {
    if (index + 1 === count) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// =========================================================================
// QUY TRÌNH BÊN GỬI (SENDER)
// =========================================================================
function createSendSession() {
  if (!selectedFile) return;

  const code = engine.createSendSession(selectedFile, currentMaxReceivers);

  // Hiển thị 9 số phân đoạn
  document.getElementById('sendCodeGroup1').textContent = code.slice(0, 3);
  document.getElementById('sendCodeGroup2').textContent = code.slice(3, 6);
  document.getElementById('sendCodeGroup3').textContent = code.slice(6, 9);

  document.getElementById('receiverSlotsText').textContent = `0/${currentMaxReceivers} người`;

  document.getElementById('senderStepSelect').classList.add('hidden');
  document.getElementById('senderStepActive').classList.remove('hidden');
}

// Sao chép mã 9 số vào Clipboard
function copySendCode() {
  if (!engine.currentSendCode) return;
  navigator.clipboard.writeText(engine.currentSendCode).then(() => {
    alert(`Đã sao chép mã gửi: ${engine.currentSendCode}`);
  }).catch(() => {
    prompt('Sao chép mã 9 số:', engine.currentSendCode);
  });
}

// Hủy phiên gửi
function cancelSendSession() {
  if (confirm('Bạn có chắc chắn muốn hủy phiên gửi này không?')) {
    if (engine.ws && engine.currentSendCode) {
      engine.ws.send(JSON.stringify({
        type: 'cancel_session',
        sendCode: engine.currentSendCode
      }));
    }
    location.reload();
  }
}

// Khi có người nhận nhập đúng mã gửi và gửi mã xác minh 9 số tới
window.onIncomingReceiver = function(receiverCode, totalJoined, maxLimit) {
  document.getElementById('receiverSlotsText').textContent = `${totalJoined}/${maxLimit} người`;

  const listEl = document.getElementById('requestsList');
  if (listEl.querySelector('div[style*="Đang chờ"]')) {
    listEl.innerHTML = '';
  }

  const formattedCode = StarTransferEngine.format9Code(receiverCode);

  const card = document.createElement('div');
  card.className = 'request-card';
  card.id = `req-card-${receiverCode}`;
  card.innerHTML = `
    <div class="request-meta">
      <div style="font-size: 0.8rem; color: #fff;">Người nhận yêu cầu:</div>
      <div class="request-code">Mã XM: ${formattedCode}</div>
      <div class="request-status" id="req-status-${receiverCode}">Đang chờ bạn duyệt...</div>
    </div>
    <div class="request-actions" id="req-actions-${receiverCode}">
      <button class="btn-accept" onclick="acceptReceiver('${receiverCode}')">✓ Đồng Ý</button>
      <button class="btn-decline" onclick="declineReceiver('${receiverCode}')">✕ Từ Chối</button>
    </div>
  `;

  listEl.appendChild(card);
};

function acceptReceiver(receiverCode) {
  const actionsEl = document.getElementById(`req-actions-${receiverCode}`);
  const statusEl = document.getElementById(`req-status-${receiverCode}`);
  if (actionsEl) actionsEl.innerHTML = '<span style="color: var(--accent-green); font-size: 0.85rem; font-weight: bold;">Đã chấp nhận</span>';
  if (statusEl) statusEl.textContent = 'Đang truyền tệp...';

  document.getElementById('senderProgressCard').classList.remove('hidden');
  engine.decideReceiver(receiverCode, true);
}

function declineReceiver(receiverCode) {
  const card = document.getElementById(`req-card-${receiverCode}`);
  if (card) card.remove();
  engine.decideReceiver(receiverCode, false);
}

// Tiến độ gửi bên Sender
window.onSenderProgress = function(percent, bytesSent, totalBytes, speedMB) {
  document.getElementById('senderProgressBar').style.width = `${percent}%`;
  document.getElementById('senderProgressPercent').textContent = `${percent}%`;
  document.getElementById('senderSpeed').textContent = `${speedMB.toFixed(2)} MB/s`;
  document.getElementById('senderTransferred').textContent = `${formatBytes(bytesSent)} / ${formatBytes(totalBytes)}`;
};

window.onSenderTransferComplete = function() {
  document.getElementById('senderProgressStatus').textContent = 'Đã hoàn tất truyền tệp!';
  document.getElementById('senderWipeBanner').classList.remove('hidden');
};

// =========================================================================
// QUY TRÌNH BÊN NHẬN (RECEIVER)
// =========================================================================
function initCodeInputFormatter() {
  const input = document.getElementById('inputSendCode');
  if (!input) return;

  // Chỉ cho phép nhập các ký tự số (0-9) và tối đa 9 chữ số, không chèn khoảng trắng làm nhảy con trỏ
  input.addEventListener('input', (e) => {
    const raw = e.target.value;
    const clean = raw.replace(/\D/g, '').slice(0, 9);
    if (raw !== clean) {
      e.target.value = clean;
    }
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      requestReceiveFile();
      return;
    }
    // Chặn các phím không phải số
    if (!/[0-9]/.test(e.key)) {
      e.preventDefault();
    }
  });

  // Hỗ trợ sự kiện dán (paste) tiện lợi, tự động lọc lấy 9 số
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const clean = pasted.replace(/\D/g, '').slice(0, 9);
    input.value = clean;
  });
}

function requestReceiveFile() {
  const input = document.getElementById('inputSendCode');
  const code = input.value.replace(/\D/g, '');

  if (code.length !== 9) {
    alert('Vui lòng nhập đầy đủ 9 chữ số của mã gửi.');
    return;
  }

  const success = engine.requestReceiveFile(code);
  if (success) {
    document.getElementById('btnProceedReceive').disabled = true;
    document.getElementById('btnProceedReceive').innerHTML = '<span>⏳</span> Đang gửi yêu cầu xác minh...';
  }
}

// Khi máy chủ xác nhận đã gửi mã xác minh sang người gửi
window.onReceiverRequestSent = function(msg) {
  document.getElementById('receiverInputStep').classList.add('hidden');
  document.getElementById('receiverWaitingApprovalStep').classList.remove('hidden');
  document.getElementById('waitingReceiverCodeEcho').textContent = StarTransferEngine.format9Code(engine.receiverTempCode);
};

// Khi người gửi chấp nhận truyền file
window.onReceiverTransferAccepted = function(fileInfo) {
  document.getElementById('receiverWaitingApprovalStep').classList.add('hidden');
  document.getElementById('receiverProgressStep').classList.remove('hidden');

  document.getElementById('incomingFileName').textContent = fileInfo.name;
  document.getElementById('incomingFileSize').textContent = formatBytes(fileInfo.size);
};

// Tiến độ tải bên Receiver
window.onReceiverProgress = function(percent, bytesReceived, totalBytes, speedMB) {
  document.getElementById('receiverProgressBar').style.width = `${percent}%`;
  document.getElementById('receiverProgressPercent').textContent = `${percent}%`;
  document.getElementById('receiverSpeed').textContent = `${speedMB.toFixed(2)} MB/s`;
  document.getElementById('receiverTransferred').textContent = `${formatBytes(bytesReceived)} / ${formatBytes(totalBytes)}`;
};

// Khi nhận file xong và đã làm sạch metadata
window.onReceiverComplete = function() {
  document.getElementById('receiverProgressStep').classList.add('hidden');
  document.getElementById('receiverCompleteStep').classList.remove('hidden');
};

function resetReceiverState() {
  location.reload();
}

window.onTransferDeclined = function() {
  document.getElementById('receiverWaitingApprovalStep').classList.add('hidden');
  document.getElementById('receiverInputStep').classList.remove('hidden');
  const btn = document.getElementById('btnProceedReceive');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡</span> Tiếp Tục Nhận Tệp';
  }
};

window.onTransferError = function() {
  document.getElementById('receiverWaitingApprovalStep').classList.add('hidden');
  document.getElementById('receiverInputStep').classList.remove('hidden');
  const btn = document.getElementById('btnProceedReceive');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡</span> Tiếp Tục Nhận Tệp';
  }
};

// =========================================================================
// TIỆN ÍCH QR CODE & MẠNG NỘI BỘ (LAN)
// =========================================================================
let qrInstance = null;

function showQrModal() {
  if (!engine.currentSendCode) return;
  const modal = document.getElementById('qrModal');
  const qrTarget = document.getElementById('qrCodeTarget');
  const digitsEl = document.getElementById('qrCodeDigits');

  digitsEl.textContent = StarTransferEngine.format9Code(engine.currentSendCode);

  const transferUrl = `${window.location.origin}/?code=${engine.currentSendCode}`;
  
  if (!qrInstance) {
    qrInstance = new QRCode(qrTarget, {
      text: transferUrl,
      width: 200,
      height: 200
    });
  } else {
    qrInstance.makeCode(transferUrl);
  }

  modal.classList.remove('hidden');
}

function closeQrModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('qrModal').classList.add('hidden');
}

// Lấy IP mạng LAN từ backend để hiển thị kết nối điện thoại và máy tính
async function fetchNetworkInfo() {
  try {
    const res = await fetch('/api/network-info');
    const data = await res.json();
    const box = document.getElementById('lanIpList');

    if (data.ips && data.ips.length > 0) {
      const links = data.ips.map(ip => `http://${ip}:${data.port}`).join('  |  ');
      box.innerHTML = links;
    } else {
      box.textContent = `http://localhost:${data.port || 3000}`;
    }

    // Tự động điền mã nếu URL có ?code=xxx
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    if (codeParam && /^\d{9}$/.test(codeParam)) {
      switchTab('receive');
      const input = document.getElementById('inputSendCode');
      if (input) {
        input.value = codeParam;
      }
    }
  } catch (err) {
    console.log('Không thể lấy IP mạng nội bộ:', err);
  }
}

// Định dạng Byte -> KB, MB, GB
function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
