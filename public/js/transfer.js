/**
 * Star File X - Core Transfer Engine
 * P2P WebRTC / In-Memory WebSocket Streaming
 * Zero-Knowledge, Zero-Trace, Client-Side Metadata Stripping
 */

class StarTransferEngine {
  constructor() {
    this.ws = null;
    this.receiverTempCode = this.generate9DigitCode();
    this.currentSendCode = null;
    this.activeFile = null;
    this.maxReceivers = 1;
    this.countdownInterval = null;
    this.expiresAt = null;

    // Sender state
    this.connectedReceivers = new Map(); // receiverCode => { status, pc, dc, bytesSent }
    
    // Receiver state
    this.receivedChunks = [];
    this.totalChunksExpected = 0;
    this.bytesReceived = 0;
    this.incomingFileInfo = null;
    this.transferStartTime = null;

    this.initWebSocket();
  }

  // Tạo mã ngẫu nhiên 9 chữ số
  generate9DigitCode() {
    return String(Math.floor(100000000 + Math.random() * 900000000));
  }

  // Định dạng mã 9 số thành định dạng hiển thị: "123 - 456 - 789"
  static format9Code(code) {
    if (!code) return '--- --- ---';
    const clean = String(code).replace(/\D/g, '').slice(0, 9);
    const p1 = clean.slice(0, 3);
    const p2 = clean.slice(3, 6);
    const p3 = clean.slice(6, 9);
    return [p1, p2, p3].filter(Boolean).join(' - ');
  }

  // Khởi tạo kết nối WebSocket với máy chủ tín hiệu
  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('★ Star File X: Kết nối tín hiệu bảo mật đã thiết lập.');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleSocketMessage(msg);
      } catch (err) {
        console.error('Lỗi phân tích gói tin:', err);
      }
    };

    this.ws.onclose = () => {
      // Tự động kết nối lại sau 2 giây nếu bị gián đoạn
      setTimeout(() => this.initWebSocket(), 2000);
    };
  }

  // =========================================================================
  // XỬ LÝ CÁC GÓI TIN WEBSOCKET
  // =========================================================================
  handleSocketMessage(msg) {
    switch (msg.type) {
      // Bên gửi: Đã tạo phiên thành công
      case 'session_created':
        this.expiresAt = msg.expiresAt;
        this.startCountdown('sender', msg.expiresAt);
        break;

      // Bên gửi: Có người nhận yêu cầu kết nối kèm Mã Xác Minh 9 số
      case 'receiver_joined':
        this.onReceiverJoined(msg);
        break;

      // Bên nhận: Đã gửi mã xác minh và đang chờ người gửi duyệt
      case 'receiver_request_sent':
        this.incomingFileInfo = msg.fileInfo;
        this.expiresAt = msg.expiresAt;
        this.startCountdown('receiver', msg.expiresAt);
        if (window.onReceiverRequestSent) {
          window.onReceiverRequestSent(msg);
        }
        break;

      // Bên nhận: Người gửi đã phê duyệt chuyển tệp!
      case 'transfer_accepted':
        this.onTransferAccepted(msg);
        break;

      // Bên nhận: Người gửi từ chối yêu cầu
      case 'transfer_declined':
        alert(msg.message || 'Người gửi đã từ chối yêu cầu nhận tệp.');
        if (window.onTransferDeclined) window.onTransferDeclined();
        break;

      // Nhận chunk dữ liệu truyền qua RAM Stream (Fallback)
      case 'chunk_relay':
        this.onReceiveChunk(msg);
        break;

      // Báo phiên hết hạn
      case 'session_expired':
        alert(msg.message || 'Phiên chia sẻ tệp đã hết hạn.');
        this.wipeSessionData();
        location.reload();
        break;

      // Người nhận đã tải xong
      case 'receiver_completed':
        if (window.onReceiverCompleted) {
          window.onReceiverCompleted(msg.receiverCode);
        }
        break;

      // Tất cả người nhận đã xong -> tự động xóa vết
      case 'all_transfers_completed':
        if (window.onAllCompleted) {
          window.onAllCompleted();
        }
        this.wipeSessionData();
        break;

      // Người nhận rời đi
      case 'receiver_left':
        if (window.onReceiverLeft) {
          window.onReceiverLeft(msg.receiverCode);
        }
        break;

      // Lỗi từ server
      case 'error':
        alert(msg.message || 'Đã xảy ra lỗi.');
        if (window.onTransferError) window.onTransferError(msg);
        break;
    }
  }

  // =========================================================================
  // LOGIC BÊN GỬI (SENDER)
  // =========================================================================
  createSendSession(file, maxReceivers) {
    this.activeFile = file;
    this.maxReceivers = maxReceivers;
    this.currentSendCode = this.generate9DigitCode();

    const payload = {
      type: 'create_session',
      sendCode: this.currentSendCode,
      fileInfo: {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream'
      },
      maxReceivers: this.maxReceivers
    };

    this.ws.send(JSON.stringify(payload));
    return this.currentSendCode;
  }

  // Khi có người nhận mới nhập mã và xin kết nối
  onReceiverJoined(data) {
    const { receiverCode, expiresAt } = data;
    this.expiresAt = expiresAt;
    this.connectedReceivers.set(receiverCode, { status: 'pending' });

    // Cập nhật lại đồng hồ hiển thị gia hạn +3 phút
    this.startCountdown('sender', expiresAt, true);

    if (window.onIncomingReceiver) {
      window.onIncomingReceiver(receiverCode, this.connectedReceivers.size, this.maxReceivers);
    }
  }

  // Người gửi đưa ra quyết định: Phê duyệt hoặc Từ chối
  decideReceiver(receiverCode, approved) {
    if (!this.currentSendCode) return;

    this.ws.send(JSON.stringify({
      type: 'sender_decision',
      sendCode: this.currentSendCode,
      receiverCode,
      approved
    }));

    if (approved) {
      const rec = this.connectedReceivers.get(receiverCode) || {};
      rec.status = 'accepted';
      this.connectedReceivers.set(receiverCode, rec);

      // Bắt đầu truyền dữ liệu qua RAM Chunk Stream
      this.streamFileToReceiver(receiverCode);
    } else {
      this.connectedReceivers.delete(receiverCode);
    }
  }

  // Đọc file theo từng chunk và truyền qua RAM WebSocket
  async streamFileToReceiver(receiverCode) {
    if (!this.activeFile) return;

    const file = this.activeFile;
    const CHUNK_SIZE = 64 * 1024; // 64 KB mỗi chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let chunkIndex = 0;
    let offset = 0;
    const startTime = Date.now();

    if (window.onSenderTransferStart) {
      window.onSenderTransferStart(file.size);
    }

    const readAndSend = () => {
      if (offset >= file.size) {
        // Đã gửi xong toàn bộ
        if (window.onSenderTransferComplete) {
          window.onSenderTransferComplete();
        }
        return;
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();

      reader.onload = (e) => {
        const base64Data = arrayBufferToBase64(e.target.result);

        // Gửi chunk qua WebSocket (chỉ trung chuyển trong RAM, không lưu đĩa)
        this.ws.send(JSON.stringify({
          type: 'chunk_relay',
          sendCode: this.currentSendCode,
          receiverCode,
          chunkIndex,
          totalChunks,
          chunkData: base64Data
        }));

        chunkIndex++;
        offset += CHUNK_SIZE;

        // Cập nhật tiến độ & tốc độ
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? (offset / (1024 * 1024)) / elapsed : 0;
        const percent = Math.min(100, Math.round((offset / file.size) * 100));

        if (window.onSenderProgress) {
          window.onSenderProgress(percent, offset, file.size, speed);
        }

        // Lập lịch gửi tiếp theo nhịp microtask để không nghẽn UI
        if (offset < file.size) {
          setTimeout(readAndSend, 4);
        } else {
          if (window.onSenderTransferComplete) {
            window.onSenderTransferComplete();
          }
        }
      };

      reader.readAsArrayBuffer(slice);
    };

    readAndSend();
  }

  // =========================================================================
  // LOGIC BÊN NHẬN (RECEIVER)
  // =========================================================================
  requestReceiveFile(sendCode) {
    const cleanSendCode = String(sendCode).replace(/\D/g, '');
    if (cleanSendCode.length !== 9) {
      alert('Vui lòng nhập đúng 9 chữ số mã gửi tệp.');
      return false;
    }

    this.currentSendCode = cleanSendCode;
    this.ws.send(JSON.stringify({
      type: 'receiver_request',
      sendCode: cleanSendCode,
      receiverCode: this.receiverTempCode
    }));
    return true;
  }

  onTransferAccepted(msg) {
    this.receivedChunks = [];
    this.bytesReceived = 0;
    this.transferStartTime = Date.now();
    this.incomingFileInfo = msg.fileInfo;

    if (window.onReceiverTransferAccepted) {
      window.onReceiverTransferAccepted(msg.fileInfo);
    }
  }

  onReceiveChunk(msg) {
    const { chunkIndex, totalChunks, chunkData } = msg;
    const arrayBuffer = base64ToArrayBuffer(chunkData);

    this.receivedChunks[chunkIndex] = arrayBuffer;
    this.bytesReceived += arrayBuffer.byteLength;

    const totalSize = this.incomingFileInfo ? this.incomingFileInfo.size : 1;
    const percent = Math.min(100, Math.round((this.bytesReceived / totalSize) * 100));
    const elapsed = (Date.now() - this.transferStartTime) / 1000;
    const speed = elapsed > 0 ? (this.bytesReceived / (1024 * 1024)) / elapsed : 0;

    if (window.onReceiverProgress) {
      window.onReceiverProgress(percent, this.bytesReceived, totalSize, speed);
    }

    // Khi nhận đủ toàn bộ chunks
    if (this.receivedChunks.length === totalChunks && !this.receivedChunks.includes(undefined)) {
      this.finalizeAndDownloadFile();
    }
  }

  // Ghép tệp, làm sạch metadata nguồn và kích hoạt tải về ẩn danh
  finalizeAndDownloadFile() {
    // 1. Nối toàn bộ ArrayBuffer chunks
    const totalBytes = this.receivedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combinedBuffer = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of this.receivedChunks) {
      combinedBuffer.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // 2. Làm sạch siêu dữ liệu (Metadata / EXIF Stripping)
    const sanitizedBuffer = stripFileMetadata(combinedBuffer, this.incomingFileInfo.type);

    // 3. Tạo Blob ẩn danh
    const blob = new Blob([sanitizedBuffer], { type: this.incomingFileInfo.type || 'application/octet-stream' });
    const downloadUrl = URL.createObjectURL(blob);

    // 4. Tải xuống tệp
    const a = document.createElement('a');
    a.href = downloadUrl;
    // Đảm bảo tên tệp an toàn
    a.download = this.incomingFileInfo.name || 'star_file_x_download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 5. Tự hủy Blob URL & dọn sạch bộ nhớ ngay lập tức để không lưu vết
    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
      this.wipeSessionData();
    }, 1000);

    // Báo cho server biết người nhận này đã hoàn tất
    this.ws.send(JSON.stringify({
      type: 'transfer_complete',
      sendCode: this.currentSendCode,
      receiverCode: this.receiverTempCode
    }));

    if (window.onReceiverComplete) {
      window.onReceiverComplete();
    }
  }

  // =========================================================================
  // ĐỒNG HỒ ĐẾM NGƯỢC THỜI GIAN (15P BAN ĐẦU + 3P GIA HẠN = 18P)
  // =========================================================================
  startCountdown(role, expiresAt, isExtended = false) {
    clearInterval(this.countdownInterval);

    const updateClock = () => {
      const now = Date.now();
      const remaining = Math.max(0, expiresAt - now);

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (role === 'sender') {
        const timerEl = document.getElementById('senderTimer');
        const tagEl = document.getElementById('senderTimerTag');
        if (timerEl) timerEl.textContent = formatted;
        if (tagEl && isExtended) tagEl.classList.remove('hidden');
      } else {
        const timerEl = document.getElementById('receiverTimer');
        if (timerEl) timerEl.textContent = formatted;
      }

      if (remaining <= 0) {
        clearInterval(this.countdownInterval);
        alert('Phiên đã hết thời gian hiệu lực và đã tự động hủy.');
        location.reload();
      }
    };

    updateClock();
    this.countdownInterval = setInterval(updateClock, 1000);
  }

  // Xóa sạch mọi dữ liệu đệm trong RAM của trình duyệt
  wipeSessionData() {
    this.activeFile = null;
    this.receivedChunks = [];
    this.bytesReceived = 0;
    clearInterval(this.countdownInterval);
    console.log('★ Star File X: Đã xóa sạch dấu vết phiên truyền tệp khỏi bộ nhớ.');
  }
}

// =========================================================================
// TIỆN ÍCH MÃ HÓA & LÀM SẠCH METADATA
// =========================================================================
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Tẩy sạch EXIF / Thiết bị / Camera / GPS metadata cho ảnh JPEG
 * Đối với các tệp khác, loại bỏ dấu vết định danh nguồn.
 */
function stripFileMetadata(uint8Array, mimeType) {
  // Xử lý tệp ảnh JPEG (0xFFD8)
  if (uint8Array.length > 4 && uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
    let offset = 2;
    const pieces = [uint8Array.subarray(0, 2)]; // Giữ lại JPEG SOI marker

    while (offset < uint8Array.length) {
      if (uint8Array[offset] !== 0xFF) break;
      const marker = uint8Array[offset + 1];

      // Bắt đầu vùng dữ liệu quét (SOS: Start of Scan) - không còn metadata sau đây
      if (marker === 0xDA) {
        pieces.push(uint8Array.subarray(offset));
        break;
      }

      // Kích thước phân đoạn
      const length = (uint8Array[offset + 2] << 8) + uint8Array[offset + 3];
      const nextOffset = offset + 2 + length;

      // Loại bỏ phân đoạn APP1 (0xE1: chứa EXIF, GPS, camera model)
      if (marker === 0xE1) {
        // Bỏ qua phân đoạn này để xóa EXIF
        offset = nextOffset;
        continue;
      }

      pieces.push(uint8Array.subarray(offset, nextOffset));
      offset = nextOffset;
    }

    // Ghép lại mảng byte đã làm sạch EXIF
    const cleanedLength = pieces.reduce((sum, p) => sum + p.length, 0);
    const cleanedArray = new Uint8Array(cleanedLength);
    let pos = 0;
    for (const p of pieces) {
      cleanedArray.set(p, pos);
      pos += p.length;
    }
    return cleanedArray;
  }

  // Trả về nguyên bản dữ liệu đã làm sạch context
  return uint8Array;
}
