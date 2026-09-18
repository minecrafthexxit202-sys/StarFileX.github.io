const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// =========================================================================
// ZERO-LOGGING & PRIVACY HEADERS MIDDLEWARE
// Không lưu log IP, không lưu User-Agent, không lưu cache trình duyệt
// =========================================================================
app.use((req, res, next) => {
  // Ngăn chặn cache triệt để nhằm đảm bảo tính năng ẩn danh / incognito
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  // Chặn rò rỉ referrer & bảo mật tối đa
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Phục vụ tệp tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0
}));

// Route lấy thông tin IP mạng nội bộ (hỗ trợ chuyển tệp điện thoại Android & PC Windows)
app.get('/api/network-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  res.json({ ips: addresses, port: PORT });
});

// =========================================================================
// IN-MEMORY SESSION STORE (HOÀN TOÀN TRONG RAM, KHÔNG DISK, KHÔNG DB)
// =========================================================================
// Map: sendCode (string 9 số) => Session Object
const activeSessions = new Map();

// Map: ws => Set of codes liên kết (để dọn dẹp khi ngắt kết nối)
const socketToCode = new WeakMap();

/**
 * Cấu trúc Session:
 * {
 *   sendCode: string (9 chữ số),
 *   fileInfo: { name, size, type },
 *   maxReceivers: number (1 - 5),
 *   createdAt: number,
 *   expiresAt: number (ban đầu 15 phút = +900,000 ms),
 *   isExtended: boolean,
 *   senderWs: WebSocket,
 *   receivers: Map<receiverCode, {
 *     receiverCode: string (9 chữ số tạm thời),
 *     ws: WebSocket,
 *     status: 'pending' | 'accepted' | 'completed' | 'declined'
 *   }>
 * }
 */

// Hàm dọn dẹp các phiên hết hạn định kỳ
setInterval(() => {
  const now = Date.now();
  for (const [sendCode, session] of activeSessions.entries()) {
    if (now >= session.expiresAt) {
      // Báo phiên hết hạn cho người gửi
      if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
        session.senderWs.send(JSON.stringify({
          type: 'session_expired',
          message: 'Mã gửi tệp đã hết thời gian hiệu lực và đã tự động hủy.'
        }));
      }
      // Báo cho các người nhận
      for (const rec of session.receivers.values()) {
        if (rec.ws && rec.ws.readyState === WebSocket.OPEN) {
          rec.ws.send(JSON.stringify({
            type: 'session_expired',
            message: 'Phiên chia sẻ đã hết hạn và bị vô hiệu hóa.'
          }));
        }
      }
      activeSessions.delete(sendCode);
    }
  }
}, 5000);

// =========================================================================
// WEBSOCKET SIGNALING & RAM TRANSFER RELAY
// =========================================================================
wss.on('connection', (ws) => {
  // Gắn metadata tạm thời cho kết nối ws
  socketToCode.set(ws, { type: null, sendCode: null, receiverCode: null });

  ws.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (err) {
      return;
    }

    const { type } = message;

    // -------------------------------------------------------------
    // 1. BÊN GỬI TẠO PHIÊN CHIA SẺ MỚI
    // -------------------------------------------------------------
    if (type === 'create_session') {
      const { sendCode, fileInfo, maxReceivers } = message;
      if (!sendCode || !/^\d{9}$/.test(sendCode)) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Mã gửi không hợp lệ.' }));
      }

      const limit = Math.min(Math.max(parseInt(maxReceivers, 10) || 1, 1), 5);
      const now = Date.now();
      const expiresAt = now + 15 * 60 * 1000; // 15 phút ban đầu

      const session = {
        sendCode,
        fileInfo,
        maxReceivers: limit,
        createdAt: now,
        expiresAt,
        isExtended: false,
        senderWs: ws,
        receivers: new Map()
      };

      activeSessions.set(sendCode, session);
      socketToCode.set(ws, { type: 'sender', sendCode });

      ws.send(JSON.stringify({
        type: 'session_created',
        sendCode,
        expiresAt,
        maxReceivers: limit
      }));
    }

    // -------------------------------------------------------------
    // 2. BÊN NHẬN GỬI YÊU CẦU NHẬN TỆP VỚI MÃ XÁC MINH 9 SỐ
    // -------------------------------------------------------------
    else if (type === 'receiver_request') {
      const { sendCode, receiverCode } = message;
      if (!sendCode || !receiverCode || !/^\d{9}$/.test(sendCode) || !/^\d{9}$/.test(receiverCode)) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Mã gửi hoặc mã xác minh không hợp lệ.' }));
      }

      const session = activeSessions.get(sendCode);
      if (!session) {
        return ws.send(JSON.stringify({
          type: 'error',
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy mã gửi tệp này hoặc mã đã bị vô hiệu hóa.'
        }));
      }

      if (Date.now() >= session.expiresAt) {
        activeSessions.delete(sendCode);
        return ws.send(JSON.stringify({
          type: 'error',
          code: 'SESSION_EXPIRED',
          message: 'Mã gửi tệp này đã hết hạn 15 phút.'
        }));
      }

      // Đếm số lượng người nhận hiện tại chưa bị từ chối
      const validReceivers = Array.from(session.receivers.values()).filter(r => r.status !== 'declined');
      if (validReceivers.length >= session.maxReceivers && !session.receivers.has(receiverCode)) {
        return ws.send(JSON.stringify({
          type: 'error',
          code: 'MAX_RECEIVERS_REACHED',
          message: `Phiên này đã đạt giới hạn tối đa ${session.maxReceivers} người nhận.`
        }));
      }

      // Đăng ký người nhận vào phiên
      session.receivers.set(receiverCode, {
        receiverCode,
        ws,
        status: 'pending'
      });
      socketToCode.set(ws, { type: 'receiver', sendCode, receiverCode });

      // Kéo dài thời gian thêm 3 phút theo yêu cầu (tổng cộng lên 18 phút tính từ lúc bắt đầu hoặc +3 phút)
      if (!session.isExtended) {
        session.expiresAt += 3 * 60 * 1000;
        session.isExtended = true;
      } else {
        // Nếu đã gia hạn, đảm bảo vẫn còn ít nhất 3 phút từ thời điểm này
        const minExpires = Date.now() + 3 * 60 * 1000;
        if (session.expiresAt < minExpires) {
          session.expiresAt = minExpires;
        }
      }

      // Gửi thông báo đến người gửi để người gửi xem mã xác minh 9 số và phê duyệt
      if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
        session.senderWs.send(JSON.stringify({
          type: 'receiver_joined',
          receiverCode,
          expiresAt: session.expiresAt,
          extended: true,
          totalJoined: session.receivers.size,
          maxReceivers: session.maxReceivers
        }));
      }

      // Phản hồi cho người nhận biết đã gửi yêu cầu thành công, chờ người gửi duyệt
      ws.send(JSON.stringify({
        type: 'receiver_request_sent',
        fileInfo: session.fileInfo,
        expiresAt: session.expiresAt,
        receiverCode
      }));
    }

    // -------------------------------------------------------------
    // 3. NGƯỜI GỬI PHÊ DUYỆT HOẶC TỪ CHỐI BÊN NHẬN
    // -------------------------------------------------------------
    else if (type === 'sender_decision') {
      const { sendCode, receiverCode, approved } = message;
      const session = activeSessions.get(sendCode);
      if (!session) return;

      const receiver = session.receivers.get(receiverCode);
      if (!receiver || !receiver.ws || receiver.ws.readyState !== WebSocket.OPEN) return;

      if (approved) {
        receiver.status = 'accepted';
        receiver.ws.send(JSON.stringify({
          type: 'transfer_accepted',
          sendCode,
          receiverCode,
          fileInfo: session.fileInfo
        }));
        // Báo cho sender biết đã chấp nhận thành công để chuẩn bị P2P stream
        ws.send(JSON.stringify({
          type: 'receiver_accepted_ack',
          receiverCode
        }));
      } else {
        receiver.status = 'declined';
        receiver.ws.send(JSON.stringify({
          type: 'transfer_declined',
          message: 'Người gửi đã từ chối yêu cầu nhận tệp của bạn.'
        }));
        session.receivers.delete(receiverCode);
      }
    }

    // -------------------------------------------------------------
    // 4. WEBRTC SIGNALING (SDP Offer / Answer / ICE Candidates)
    // -------------------------------------------------------------
    else if (type === 'webrtc_signal') {
      const { sendCode, receiverCode, target, signal } = message;
      const session = activeSessions.get(sendCode);
      if (!session) return;

      if (target === 'sender') {
        // Tín hiệu gửi về phía sender
        if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
          session.senderWs.send(JSON.stringify({
            type: 'webrtc_signal',
            receiverCode,
            signal
          }));
        }
      } else if (target === 'receiver') {
        // Tín hiệu gửi từ sender tới receiver cụ thể
        const receiver = session.receivers.get(receiverCode);
        if (receiver && receiver.ws && receiver.ws.readyState === WebSocket.OPEN) {
          receiver.ws.send(JSON.stringify({
            type: 'webrtc_signal',
            signal
          }));
        }
      }
    }

    // -------------------------------------------------------------
    // 5. IN-MEMORY CHUNK RELAY (Fallback nếu WebRTC P2P bị chặn bởi Firewall)
    // Dữ liệu chỉ chuyển tiếp qua RAM của server, tuyệt đối không ghi file disk!
    // -------------------------------------------------------------
    else if (type === 'chunk_relay') {
      const { sendCode, receiverCode, chunkIndex, totalChunks, chunkData } = message;
      const session = activeSessions.get(sendCode);
      if (!session) return;

      const receiver = session.receivers.get(receiverCode);
      if (receiver && receiver.ws && receiver.ws.readyState === WebSocket.OPEN) {
        receiver.ws.send(JSON.stringify({
          type: 'chunk_relay',
          chunkIndex,
          totalChunks,
          chunkData
        }));
      }
    }

    // -------------------------------------------------------------
    // 6. XÁC NHẬN HOÀN TẤT TRUYỀN VÀ XÓA DẤU VẾT
    // -------------------------------------------------------------
    else if (type === 'transfer_complete') {
      const { sendCode, receiverCode } = message;
      const session = activeSessions.get(sendCode);
      if (!session) return;

      const receiver = session.receivers.get(receiverCode);
      if (receiver) {
        receiver.status = 'completed';
      }

      // Thông báo cho người gửi biết máy đó đã nhận xong
      if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
        session.senderWs.send(JSON.stringify({
          type: 'receiver_completed',
          receiverCode
        }));
      }

      // Kiểm tra nếu tất cả người nhận đã hoàn tất và đạt tối đa
      const completedCount = Array.from(session.receivers.values()).filter(r => r.status === 'completed').length;
      if (completedCount >= session.maxReceivers) {
        // Tự hủy session trên RAM
        activeSessions.delete(sendCode);
        if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
          session.senderWs.send(JSON.stringify({
            type: 'all_transfers_completed',
            message: 'Đã hoàn tất truyền cho toàn bộ người nhận. Phiên đã tự động xóa dấu vết.'
          }));
        }
      }
    }

    // -------------------------------------------------------------
    // 7. NGƯỜI DÙNG CHỦ ĐỘNG HỦY PHIÊN
    // -------------------------------------------------------------
    else if (type === 'cancel_session') {
      const { sendCode } = message;
      const session = activeSessions.get(sendCode);
      if (session) {
        for (const rec of session.receivers.values()) {
          if (rec.ws && rec.ws.readyState === WebSocket.OPEN) {
            rec.ws.send(JSON.stringify({
              type: 'session_cancelled',
              message: 'Người gửi đã hủy phiên chuyển tệp này.'
            }));
          }
        }
        activeSessions.delete(sendCode);
      }
    }
  });

  // Khi client ngắt kết nối (đóng tab, tắt trình duyệt, reload trang)
  ws.on('close', () => {
    const meta = socketToCode.get(ws);
    if (!meta) return;

    // Nếu người gửi đóng tab: hủy toàn bộ session
    if (meta.type === 'sender' && meta.sendCode) {
      const session = activeSessions.get(meta.sendCode);
      if (session && session.senderWs === ws) {
        for (const rec of session.receivers.values()) {
          if (rec.ws && rec.ws.readyState === WebSocket.OPEN) {
            rec.ws.send(JSON.stringify({
              type: 'sender_disconnected',
              message: 'Người gửi đã đóng trang. Phiên truyền tệp bị hủy.'
            }));
          }
        }
        activeSessions.delete(meta.sendCode);
      }
    }
    // Nếu người nhận đóng tab: thông báo người nhận đã rời đi, xóa mã xác nhận tạm thời
    else if (meta.type === 'receiver' && meta.sendCode && meta.receiverCode) {
      const session = activeSessions.get(meta.sendCode);
      if (session) {
        session.receivers.delete(meta.receiverCode);
        if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
          session.senderWs.send(JSON.stringify({
            type: 'receiver_left',
            receiverCode: meta.receiverCode
          }));
        }
      }
    }
  });
});

// Khởi động server
server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  console.log(`\n★ ======================================================== ★`);
  console.log(`★            STAR FILE X - ANONYMOUS P2P TRANSFER          ★`);
  console.log(`★ ======================================================== ★`);
  console.log(`  Local URL   : http://localhost:${PORT}`);
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  Network URL : http://${iface.address}:${PORT} (Android <-> Windows)`);
      }
    }
  }
  console.log(`  Bảo mật     : Zero-Logs | RAM Only | Không Lưu IP & Tệp`);
  console.log(`★ ======================================================== ★\n`);
});
